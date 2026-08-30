import type { TabCapabilityStatus } from '@personal-webmcp/contracts';

type ExtensionMessage =
  | { type: 'WEBMCP_STATUS'; payload: TabCapabilityStatus }
  | { type: 'GET_ACTIVE_STATUS' }
  | { type: 'GET_STATUS' }
  | { type: 'RUN_PING_SELF_TEST' };

export default defineBackground(() => {
  const statusByTab = new Map<number, TabCapabilityStatus>();

  browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Older Chromium builds can still open the panel from extension details.
  });

  browser.runtime.onMessage.addListener(async (message: ExtensionMessage, sender) => {
    if (message.type === 'WEBMCP_STATUS' && sender.tab?.id !== undefined) {
      const status = { ...message.payload, tabId: sender.tab.id, updatedAt: Date.now() };
      statusByTab.set(sender.tab.id, status);
      return status;
    }

    if (message.type !== 'GET_ACTIVE_STATUS' && message.type !== 'RUN_PING_SELF_TEST') {
      return undefined;
    }

    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id === undefined) return undefined;

    if (message.type === 'RUN_PING_SELF_TEST') {
      return browser.tabs.sendMessage(activeTab.id, { type: 'RUN_PING_SELF_TEST' });
    }

    try {
      const liveStatus = await browser.tabs.sendMessage(activeTab.id, { type: 'GET_STATUS' });
      if (liveStatus) return liveStatus;
    } catch {
      // The active tab may not be a permitted web page.
    }

    return statusByTab.get(activeTab.id);
  });

  browser.tabs.onRemoved.addListener((tabId) => statusByTab.delete(tabId));
});
