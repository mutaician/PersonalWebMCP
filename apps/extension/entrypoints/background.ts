import type { PingResultPayload, TabCapabilityStatus } from '@personal-webmcp/contracts';
import {
  activityReceiptRepository,
  bootstrapPersistence,
  getPersistenceSummary,
  savePingReceipt,
} from '../lib/storage';

type ExtensionMessage =
  | { type: 'WEBMCP_STATUS'; payload: TabCapabilityStatus }
  | { type: 'WEBMCP_PING_RESULT'; payload: PingResultPayload }
  | { type: 'GET_ACTIVE_STATUS' }
  | { type: 'GET_STATUS' }
  | { type: 'RUN_PING_SELF_TEST' }
  | { type: 'GET_PERSISTENCE_SUMMARY' }
  | { type: 'CLEAR_ACTIVITY_HISTORY' };

function getOrigin(url: string | undefined): string {
  try {
    return url ? new URL(url).origin : 'unknown';
  } catch {
    return 'unknown';
  }
}

export default defineBackground(() => {
  const statusByTab = new Map<number, TabCapabilityStatus>();
  const pingStartedAtByTab = new Map<number, number>();
  const persistenceReady = bootstrapPersistence();

  browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Older Chromium builds can still open the panel from extension details.
  });

  browser.runtime.onMessage.addListener(async (message: ExtensionMessage, sender) => {
    if (message.type === 'WEBMCP_STATUS' && sender.tab?.id !== undefined) {
      const status = { ...message.payload, tabId: sender.tab.id, updatedAt: Date.now() };
      statusByTab.set(sender.tab.id, status);
      return status;
    }

    if (message.type === 'WEBMCP_PING_RESULT' && sender.tab?.id !== undefined) {
      await persistenceReady;
      const tabId = sender.tab.id;
      const startedAt = pingStartedAtByTab.get(tabId) ?? Date.now();
      pingStartedAtByTab.delete(tabId);
      await savePingReceipt(
        message.payload,
        getOrigin(statusByTab.get(tabId)?.url ?? sender.tab.url),
        startedAt,
      );
      return { saved: true };
    }

    if (message.type === 'GET_PERSISTENCE_SUMMARY') {
      await persistenceReady;
      return getPersistenceSummary();
    }

    if (message.type === 'CLEAR_ACTIVITY_HISTORY') {
      await persistenceReady;
      await activityReceiptRepository.clearHistory();
      return { cleared: true };
    }

    if (message.type !== 'GET_ACTIVE_STATUS' && message.type !== 'RUN_PING_SELF_TEST') {
      return undefined;
    }

    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id === undefined) return undefined;

    if (message.type === 'RUN_PING_SELF_TEST') {
      pingStartedAtByTab.set(activeTab.id, Date.now());
      try {
        return await browser.tabs.sendMessage(activeTab.id, { type: 'RUN_PING_SELF_TEST' });
      } catch (error) {
        pingStartedAtByTab.delete(activeTab.id);
        throw error;
      }
    }

    try {
      const liveStatus = await browser.tabs.sendMessage(activeTab.id, { type: 'GET_STATUS' });
      if (liveStatus) return liveStatus;
    } catch {
      // The active tab may not be a permitted web page.
    }

    return statusByTab.get(activeTab.id);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    statusByTab.delete(tabId);
    pingStartedAtByTab.delete(tabId);
  });
});
