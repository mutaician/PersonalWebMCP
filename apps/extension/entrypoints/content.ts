import {
  BRIDGE_SOURCE,
  BRIDGE_VERSION,
  isBridgeEnvelope,
  type BridgeEnvelope,
  type JsonValue,
  type PersonalToolExecutionResult,
  type PersonalToolInvocationPayload,
  type PersonalToolInvocationResultPayload,
  type PersonalToolRecord,
  type PersonalToolRegistration,
  type SemanticLocator,
  type PingResultPayload,
  type TabCapabilityStatus,
  type TeachSessionSnapshot,
  type ToolCatalogPayload,
  type WebMcpStatusPayload,
} from '@personal-webmcp/contracts';
import {
  executePersonalToolOnPage,
  RepairRequiredError,
  type RepairRequest,
} from '../lib/execution/dom-executor';
import { createSemanticLocator, InteractionRecorder } from '../lib/teaching/recorder';

type ContentMessage =
  | { type: 'GET_STATUS' }
  | { type: 'GET_CATALOG' }
  | { type: 'GET_TEACH_SESSION' }
  | { type: 'START_TEACHING' }
  | { type: 'PAUSE_TEACHING' }
  | { type: 'RESUME_TEACHING' }
  | { type: 'CANCEL_TEACHING' }
  | { type: 'FINISH_TEACHING' }
  | { type: 'SYNC_PERSONAL_TOOLS' }
  | { type: 'EXECUTE_TOOL_WORKFLOW'; tool: PersonalToolRecord; input: Record<string, JsonValue>; invocationId: string }
  | { type: 'CANCEL_TOOL_WORKFLOW'; invocationId: string }
  | { type: 'START_GUIDED_REPAIR'; toolId: string; nodeId: string }
  | { type: 'CANCEL_GUIDED_REPAIR' }
  | { type: 'REFRESH_CATALOG' }
  | { type: 'RUN_PING_SELF_TEST' };

interface ToolWorkflowResponse {
  ok: boolean;
  result?: PersonalToolExecutionResult;
  error?: string;
  repair?: RepairRequest;
}

export default defineContentScript({
  matches: ['http://localhost:3000/*'],
  runAt: 'document_start',
  async main() {
    const tabSessionId = crypto.randomUUID();
    let currentStatus: TabCapabilityStatus = {
      supported: false,
      registered: false,
      pageTitle: document.title,
      url: window.location.href,
      updatedAt: Date.now(),
    };
    let currentCatalog: ToolCatalogPayload = {
      supported: false,
      pageTitle: document.title,
      url: window.location.href,
      tools: [],
    };
    let currentUrl = window.location.href;
    const activeExecutions = new Map<string, AbortController>();
    let stopGuidedSelection: () => void = () => undefined;
    const recorder = new InteractionRecorder((snapshot) => {
      void browser.runtime.sendMessage({ type: 'TEACH_STATE_UPDATED', payload: snapshot }).catch(() => undefined);
    });

    try {
      const storedSession = await browser.runtime.sendMessage({ type: 'GET_TEACH_SESSION' }) as TeachSessionSnapshot | undefined;
      if (storedSession && storedSession.state !== 'IDLE') {
        recorder.restore(storedSession);
        const lastRecordedPath = [...(storedSession.trace?.steps ?? [])].reverse().find((step) => step.locator)?.locator?.path
          ?? storedSession.trace?.path;
        if (['RECORDING', 'PAUSED'].includes(storedSession.state) && lastRecordedPath !== window.location.pathname) {
          recorder.recordNavigation(
            `${window.location.origin}${lastRecordedPath ?? ''}`,
            window.location.href,
          );
        }
      }
    } catch {
      // Recording can still start normally if no prior tab session exists.
    }

    const postCommand = (
      type: 'INITIALIZE' | 'REFRESH_CATALOG' | 'RUN_PING_SELF_TEST' | 'WITHDRAW_PING' | 'SYNC_PERSONAL_TOOLS' | 'PERSONAL_TOOL_RESULT',
      payload: unknown = {},
    ) => {
      const envelope: BridgeEnvelope = {
        source: BRIDGE_SOURCE,
        version: BRIDGE_VERSION,
        tabSessionId,
        requestId: crypto.randomUUID(),
        type,
        payload,
      };
      window.postMessage(envelope, window.location.origin);
    };

    const publishStatus = async (payload: WebMcpStatusPayload) => {
      currentStatus = { ...payload, updatedAt: Date.now() };
      await browser.runtime.sendMessage({ type: 'WEBMCP_STATUS', payload: currentStatus });
    };

    const syncPersonalTools = async () => {
      const tools = await browser.runtime.sendMessage({
        type: 'GET_SCOPED_PERSONAL_TOOLS',
        url: window.location.href,
        supported: currentStatus.supported,
      }) as PersonalToolRegistration[];
      postCommand('SYNC_PERSONAL_TOOLS', { tools: Array.isArray(tools) ? tools : [] });
    };

    const onWindowMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!isBridgeEnvelope(event.data) || event.data.tabSessionId !== tabSessionId) return;

      if (event.data.type === 'STATUS') {
        const status = event.data.payload as WebMcpStatusPayload;
        void publishStatus(status).then(() => syncPersonalTools()).catch(() => undefined);
      }

      if (event.data.type === 'CATALOG') {
        currentCatalog = event.data.payload as ToolCatalogPayload;
        void browser.runtime.sendMessage({ type: 'WEBMCP_CATALOG', payload: currentCatalog });
      }

      if (event.data.type === 'PING_RESULT') {
        const payload = event.data.payload as PingResultPayload;
        void Promise.all([
          browser.runtime.sendMessage({ type: 'WEBMCP_PING_RESULT', payload }),
          browser.runtime.sendMessage({
            type: 'WEBMCP_STATUS',
            payload: {
              ...currentStatus,
              error: payload.ok ? undefined : payload.error,
              updatedAt: Date.now(),
            },
          }),
        ]);
      }

      if (event.data.type === 'PERSONAL_TOOL_INVOCATION') {
        const payload = event.data.payload as PersonalToolInvocationPayload;
        void browser.runtime.sendMessage({ type: 'RUN_PERSONAL_TOOL', ...payload })
          .then((result: PersonalToolExecutionResult) => {
            postCommand('PERSONAL_TOOL_RESULT', {
              invocationId: payload.invocationId,
              ok: true,
              result: result as unknown as JsonValue,
            } satisfies PersonalToolInvocationResultPayload);
          })
          .catch((error: unknown) => {
            postCommand('PERSONAL_TOOL_RESULT', {
              invocationId: payload.invocationId,
              ok: false,
              error: error instanceof Error ? error.message : 'Personal tool execution failed.',
            } satisfies PersonalToolInvocationResultPayload);
          });
      }

      if (event.data.type === 'PERSONAL_TOOL_CANCEL') {
        const payload = event.data.payload as { invocationId?: string };
        if (payload.invocationId) {
          void browser.runtime.sendMessage({
            type: 'CANCEL_PERSONAL_TOOL',
            invocationId: payload.invocationId,
          }).catch(() => undefined);
        }
      }
    };

    window.addEventListener('message', onWindowMessage);
    await injectScript('/webmcp-main.js', { keepInDom: true });
    postCommand('INITIALIZE');

    const navigationTimer = window.setInterval(() => {
      if (window.location.href === currentUrl) return;
      const previousUrl = currentUrl;
      currentUrl = window.location.href;
      recorder.recordNavigation(previousUrl, currentUrl);
      postCommand('REFRESH_CATALOG');
    }, 500);

    browser.runtime.onMessage.addListener((message: ContentMessage) => {
      if (message.type === 'GET_STATUS') return Promise.resolve(currentStatus);
      if (message.type === 'GET_CATALOG') return Promise.resolve(currentCatalog);
      if (message.type === 'GET_TEACH_SESSION') return Promise.resolve(recorder.getSnapshot());
      if (message.type === 'START_TEACHING') return Promise.resolve(recorder.start());
      if (message.type === 'PAUSE_TEACHING') return Promise.resolve(recorder.pause());
      if (message.type === 'RESUME_TEACHING') return Promise.resolve(recorder.resume());
      if (message.type === 'CANCEL_TEACHING') return Promise.resolve(recorder.cancel());
      if (message.type === 'FINISH_TEACHING') return Promise.resolve(recorder.finish());
      if (message.type === 'SYNC_PERSONAL_TOOLS') {
        return syncPersonalTools().then(() => ({ accepted: true }));
      }
      if (message.type === 'EXECUTE_TOOL_WORKFLOW') {
        const controller = new AbortController();
        activeExecutions.get(message.invocationId)?.abort();
        activeExecutions.set(message.invocationId, controller);
        return (async (): Promise<ToolWorkflowResponse> => {
          try {
            const result = await executePersonalToolOnPage(
              message.tool,
              message.input,
              message.invocationId,
              controller.signal,
            );
            return { ok: true, result };
          } catch (error) {
            return {
              ok: false,
              error: error instanceof Error ? error.message : 'Visible workflow execution failed.',
              repair: error instanceof RepairRequiredError ? error.request : undefined,
            };
          } finally {
            activeExecutions.delete(message.invocationId);
          }
        })();
      }
      if (message.type === 'CANCEL_TOOL_WORKFLOW') {
        const controller = activeExecutions.get(message.invocationId);
        controller?.abort(new DOMException('Tool execution was cancelled.', 'AbortError'));
        return Promise.resolve({ accepted: Boolean(controller) });
      }
      if (message.type === 'START_GUIDED_REPAIR') {
        stopGuidedSelection();
        let highlighted: HTMLElement | undefined;
        const restoreHighlight = () => {
          if (!highlighted) return;
          highlighted.style.removeProperty('outline');
          highlighted.style.removeProperty('outline-offset');
          highlighted = undefined;
        };
        const cleanup = () => {
          restoreHighlight();
          document.removeEventListener('pointerover', onPointerOver, true);
          document.removeEventListener('click', onSelect, true);
          document.removeEventListener('keydown', onKeyDown, true);
          stopGuidedSelection = () => undefined;
        };
        const onPointerOver = (event: Event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement)) return;
          restoreHighlight();
          highlighted = target;
          target.style.outline = '3px solid #d45f2a';
          target.style.outlineOffset = '2px';
        };
        const onSelect = (event: Event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          const actionable = target.closest('button, a, input, select, textarea, [role], tr') ?? target;
          const stepType = actionable instanceof HTMLSelectElement
            ? 'SELECT'
            : actionable instanceof HTMLInputElement || actionable instanceof HTMLTextAreaElement
              ? 'INPUT'
              : 'ACTIVATE';
          const locator: SemanticLocator = createSemanticLocator(actionable, stepType);
          cleanup();
          void browser.runtime.sendMessage({
            type: 'GUIDED_REPAIR_SELECTED',
            toolId: message.toolId,
            nodeId: message.nodeId,
            locator,
          }).catch(() => undefined);
        };
        const onKeyDown = (event: Event) => {
          if (event instanceof KeyboardEvent && event.key === 'Escape') cleanup();
        };
        document.addEventListener('pointerover', onPointerOver, true);
        document.addEventListener('click', onSelect, true);
        document.addEventListener('keydown', onKeyDown, true);
        stopGuidedSelection = cleanup;
        return Promise.resolve({ accepted: true });
      }
      if (message.type === 'CANCEL_GUIDED_REPAIR') {
        stopGuidedSelection();
        return Promise.resolve({ accepted: true });
      }
      if (message.type === 'REFRESH_CATALOG') {
        postCommand('REFRESH_CATALOG');
        return Promise.resolve({ accepted: true });
      }
      if (message.type === 'RUN_PING_SELF_TEST') {
        postCommand('RUN_PING_SELF_TEST');
        return Promise.resolve({ accepted: true });
      }
      return undefined;
    });

    window.addEventListener('pagehide', () => {
      window.clearInterval(navigationTimer);
      for (const controller of activeExecutions.values()) controller.abort();
      activeExecutions.clear();
      stopGuidedSelection();
      recorder.dispose();
      postCommand('WITHDRAW_PING');
    }, { once: true });
  },
});
