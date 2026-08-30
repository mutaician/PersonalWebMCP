import {
  BRIDGE_SOURCE,
  BRIDGE_VERSION,
  isBridgeEnvelope,
  type BridgeEnvelope,
  type PingResultPayload,
  type TabCapabilityStatus,
  type WebMcpStatusPayload,
} from '@personal-webmcp/contracts';

type ContentMessage = { type: 'GET_STATUS' } | { type: 'RUN_PING_SELF_TEST' };

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

    const postCommand = (type: 'INITIALIZE' | 'RUN_PING_SELF_TEST' | 'WITHDRAW_PING') => {
      const envelope: BridgeEnvelope = {
        source: BRIDGE_SOURCE,
        version: BRIDGE_VERSION,
        tabSessionId,
        requestId: crypto.randomUUID(),
        type,
        payload: {},
      };
      window.postMessage(envelope, window.location.origin);
    };

    const publishStatus = async (payload: WebMcpStatusPayload) => {
      currentStatus = { ...payload, updatedAt: Date.now() };
      await browser.runtime.sendMessage({ type: 'WEBMCP_STATUS', payload: currentStatus });
    };

    const onWindowMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (!isBridgeEnvelope(event.data) || event.data.tabSessionId !== tabSessionId) return;

      if (event.data.type === 'STATUS') {
        void publishStatus(event.data.payload as WebMcpStatusPayload);
      }

      if (event.data.type === 'PING_RESULT') {
        const payload = event.data.payload as PingResultPayload;
        void browser.runtime.sendMessage({
          type: 'WEBMCP_STATUS',
          payload: {
            ...currentStatus,
            error: payload.ok ? undefined : payload.error,
            updatedAt: Date.now(),
          },
        });
      }
    };

    window.addEventListener('message', onWindowMessage);
    await injectScript('/webmcp-main.js', { keepInDom: true });
    postCommand('INITIALIZE');

    browser.runtime.onMessage.addListener((message: ContentMessage) => {
      if (message.type === 'GET_STATUS') return Promise.resolve(currentStatus);
      if (message.type === 'RUN_PING_SELF_TEST') {
        postCommand('RUN_PING_SELF_TEST');
        return Promise.resolve({ accepted: true });
      }
      return undefined;
    });

    window.addEventListener('pagehide', () => postCommand('WITHDRAW_PING'), { once: true });
  },
});
