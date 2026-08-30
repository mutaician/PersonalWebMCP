import {
  BRIDGE_SOURCE,
  BRIDGE_VERSION,
  isBridgeEnvelope,
  type BridgeEnvelope,
  type BridgeEventType,
  type JsonValue,
  type PersonalToolInvocationPayload,
  type PersonalToolInvocationResultPayload,
  type PersonalToolRegistration,
  type PingResultPayload,
  type ToolCatalogPayload,
  type WebMcpStatusPayload,
} from '@personal-webmcp/contracts';
import {
  discoverWebMcpTools,
  executePersonalPing,
  isWebMcpSupported,
  PERSONAL_PING_TOOL_NAME,
  registerPersonalPing,
  registerPersonalTool,
  watchWebMcpToolChanges,
} from '@personal-webmcp/webmcp';

interface PersonalWebMcpPageState {
  dispose: () => void;
}

declare global {
  interface Window {
    __personalWebMcpPageState?: PersonalWebMcpPageState;
  }
}

export default defineUnlistedScript(() => {
  window.__personalWebMcpPageState?.dispose();

  let tabSessionId = '';
  let registrationController: AbortController | undefined;
  let stopWatchingTools: () => void = () => undefined;
  const personalRegistrations = new Map<string, { signature: string; controller: AbortController }>();
  const pendingInvocations = new Map<string, {
    resolve: (result: JsonValue) => void;
    reject: (error: Error) => void;
    timeoutId: number;
    removeAbortListener: () => void;
  }>();

  const postEvent = (type: BridgeEventType, payload: unknown) => {
    if (!tabSessionId) return;
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

  const rejectPendingInvocation = (invocationId: string, error: Error) => {
    const pending = pendingInvocations.get(invocationId);
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    pending.removeAbortListener();
    pendingInvocations.delete(invocationId);
    pending.reject(error);
  };

  const invokePersonalTool = (
    registration: PersonalToolRegistration,
    input: Record<string, JsonValue>,
    signal?: AbortSignal,
  ): Promise<JsonValue> => {
    signal?.throwIfAborted();
    const invocationId = crypto.randomUUID();

    return new Promise<JsonValue>((resolve, reject) => {
      const onAbort = () => {
        postEvent('PERSONAL_TOOL_CANCEL', { invocationId });
        rejectPendingInvocation(invocationId, new DOMException('Tool execution was cancelled.', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      const timeoutId = window.setTimeout(() => {
        postEvent('PERSONAL_TOOL_CANCEL', { invocationId });
        rejectPendingInvocation(invocationId, new Error('Tool execution timed out after 30 seconds.'));
      }, 30_000);

      pendingInvocations.set(invocationId, {
        resolve,
        reject,
        timeoutId,
        removeAbortListener: () => signal?.removeEventListener('abort', onAbort),
      });
      postEvent('PERSONAL_TOOL_INVOCATION', {
        invocationId,
        toolId: registration.id,
        input,
      } satisfies PersonalToolInvocationPayload);
    });
  };

  const syncPersonalTools = async (registrations: PersonalToolRegistration[]) => {
    const nextIds = new Set(registrations.map((registration) => registration.id));
    for (const [toolId, registered] of personalRegistrations) {
      if (!nextIds.has(toolId)) {
        registered.controller.abort();
        personalRegistrations.delete(toolId);
      }
    }

    if (!isWebMcpSupported()) return;
    for (const registration of registrations) {
      const signature = JSON.stringify(registration);
      const current = personalRegistrations.get(registration.id);
      if (current?.signature === signature && !current.controller.signal.aborted) continue;
      current?.controller.abort();

      const controller = new AbortController();
      try {
        await registerPersonalTool(
          registration,
          (input, signal) => invokePersonalTool(registration, input, signal),
          controller.signal,
        );
        personalRegistrations.set(registration.id, { signature, controller });
      } catch (error) {
        controller.abort();
        postEvent('STATUS', statusPayload({
          error: error instanceof Error ? error.message : `Could not register ${registration.title}.`,
        }));
      }
    }
    await publishCatalog();
  };

  const statusPayload = (overrides: Partial<WebMcpStatusPayload> = {}): WebMcpStatusPayload => ({
    supported: isWebMcpSupported(),
    registered: Boolean(registrationController && !registrationController.signal.aborted),
    toolName: PERSONAL_PING_TOOL_NAME,
    pageTitle: document.title,
    url: window.location.href,
    ...overrides,
  });

  const publishCatalog = async () => {
    const supported = isWebMcpSupported();
    const tools = supported ? await discoverWebMcpTools() : [];
    postEvent('CATALOG', {
      supported,
      pageTitle: document.title,
      url: window.location.href,
      tools,
    } satisfies ToolCatalogPayload);
  };

  const initialize = async () => {
    stopWatchingTools();
    stopWatchingTools = () => undefined;
    registrationController?.abort();
    registrationController = undefined;

    if (!isWebMcpSupported()) {
      postEvent('STATUS', statusPayload());
      await publishCatalog();
      return;
    }

    const controller = new AbortController();
    try {
      const registered = await registerPersonalPing(controller.signal);
      registrationController = registered ? controller : undefined;
      stopWatchingTools = watchWebMcpToolChanges(() => void publishCatalog());
      postEvent('STATUS', statusPayload({ registered }));
      await publishCatalog();
    } catch (error) {
      controller.abort();
      postEvent('STATUS', statusPayload({
        registered: false,
        error: error instanceof Error ? error.message : 'Tool registration failed.',
      }));
    }
  };

  const refreshPageState = async () => {
    postEvent('STATUS', statusPayload());
    try {
      await publishCatalog();
    } catch (error) {
      postEvent('STATUS', statusPayload({
        error: error instanceof Error ? error.message : 'Tool discovery failed.',
      }));
    }
  };

  const runSelfTest = async () => {
    try {
      const result = await executePersonalPing();
      postEvent('PING_RESULT', { ok: true, result: JSON.stringify(result) });
      postEvent('STATUS', statusPayload());
    } catch (error) {
      postEvent('PING_RESULT', {
        ok: false,
        error: error instanceof Error ? error.message : 'Tool execution failed.',
      });
    }
  };

  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    if (!isBridgeEnvelope(event.data)) return;

    if (event.data.type === 'INITIALIZE') {
      tabSessionId = event.data.tabSessionId;
      void initialize();
    } else if (event.data.tabSessionId === tabSessionId && event.data.type === 'REFRESH_CATALOG') {
      void refreshPageState();
    } else if (event.data.tabSessionId === tabSessionId && event.data.type === 'RUN_PING_SELF_TEST') {
      void runSelfTest();
    } else if (event.data.tabSessionId === tabSessionId && event.data.type === 'SYNC_PERSONAL_TOOLS') {
      const payload = event.data.payload as { tools?: PersonalToolRegistration[] };
      void syncPersonalTools(Array.isArray(payload.tools) ? payload.tools : []);
    } else if (event.data.tabSessionId === tabSessionId && event.data.type === 'PERSONAL_TOOL_RESULT') {
      const payload = event.data.payload as PersonalToolInvocationResultPayload;
      const pending = pendingInvocations.get(payload.invocationId);
      if (!pending) return;
      window.clearTimeout(pending.timeoutId);
      pending.removeAbortListener();
      pendingInvocations.delete(payload.invocationId);
      if (payload.ok && payload.result !== undefined) pending.resolve(payload.result);
      else pending.reject(new Error(payload.error || 'Personal tool execution failed.'));
    } else if (event.data.tabSessionId === tabSessionId && event.data.type === 'WITHDRAW_PING') {
      stopWatchingTools();
      stopWatchingTools = () => undefined;
      registrationController?.abort();
      registrationController = undefined;
      for (const registration of personalRegistrations.values()) registration.controller.abort();
      personalRegistrations.clear();
    }
  };

  const dispose = () => {
    window.removeEventListener('message', onMessage);
    stopWatchingTools();
    registrationController?.abort();
    registrationController = undefined;
    for (const registration of personalRegistrations.values()) registration.controller.abort();
    personalRegistrations.clear();
    for (const invocationId of pendingInvocations.keys()) {
      rejectPendingInvocation(invocationId, new Error('The page was closed before execution completed.'));
    }
  };

  window.addEventListener('message', onMessage);
  window.addEventListener('pagehide', dispose, { once: true });
  window.__personalWebMcpPageState = { dispose };
});
