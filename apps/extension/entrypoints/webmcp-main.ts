import {
  BRIDGE_SOURCE,
  BRIDGE_VERSION,
  isBridgeEnvelope,
  type BridgeEnvelope,
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

  const postEvent = (
    type: 'STATUS' | 'CATALOG' | 'PING_RESULT',
    payload: WebMcpStatusPayload | ToolCatalogPayload | PingResultPayload,
  ) => {
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
    } else if (event.data.tabSessionId === tabSessionId && event.data.type === 'WITHDRAW_PING') {
      stopWatchingTools();
      stopWatchingTools = () => undefined;
      registrationController?.abort();
      registrationController = undefined;
    }
  };

  const dispose = () => {
    window.removeEventListener('message', onMessage);
    stopWatchingTools();
    registrationController?.abort();
    registrationController = undefined;
  };

  window.addEventListener('message', onMessage);
  window.addEventListener('pagehide', dispose, { once: true });
  window.__personalWebMcpPageState = { dispose };
});
