import {
  BRIDGE_SOURCE,
  BRIDGE_VERSION,
  isBridgeEnvelope,
  type BridgeEnvelope,
  type PingResultPayload,
  type TabCapabilityStatus,
  type TeachSessionSnapshot,
  type ToolCatalogPayload,
  type WebMcpStatusPayload,
} from '@personal-webmcp/contracts';
import { InteractionRecorder } from '../lib/teaching/recorder';

type ContentMessage =
  | { type: 'GET_STATUS' }
  | { type: 'GET_CATALOG' }
  | { type: 'GET_TEACH_SESSION' }
  | { type: 'START_TEACHING' }
  | { type: 'PAUSE_TEACHING' }
  | { type: 'RESUME_TEACHING' }
  | { type: 'CANCEL_TEACHING' }
  | { type: 'FINISH_TEACHING' }
  | { type: 'REFRESH_CATALOG' }
  | { type: 'RUN_PING_SELF_TEST' };

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

    const postCommand = (type: 'INITIALIZE' | 'REFRESH_CATALOG' | 'RUN_PING_SELF_TEST' | 'WITHDRAW_PING') => {
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
      recorder.dispose();
      postCommand('WITHDRAW_PING');
    }, { once: true });
  },
});
