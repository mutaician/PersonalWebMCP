import type {
  ActiveTabSnapshot,
  PingResultPayload,
  TabCapabilityStatus,
  ToolCatalogPayload,
} from '@personal-webmcp/contracts';
import {
  activityReceiptRepository,
  bootstrapPersistence,
  getPersistenceSummary,
  savePingReceipt,
  settingsRepository,
  toolRegistryRepository,
} from '../lib/storage';

type ExtensionMessage =
  | { type: 'WEBMCP_STATUS'; payload: TabCapabilityStatus }
  | { type: 'WEBMCP_CATALOG'; payload: ToolCatalogPayload }
  | { type: 'WEBMCP_PING_RESULT'; payload: PingResultPayload }
  | { type: 'GET_ACTIVE_STATUS' }
  | { type: 'GET_PANEL_SNAPSHOT' }
  | { type: 'RUN_PING_SELF_TEST' }
  | { type: 'ENABLE_ORIGIN'; origin: string }
  | { type: 'GET_PERSISTENCE_SUMMARY' }
  | { type: 'CLEAR_ACTIVITY_HISTORY' };

function getUrl(url: string | undefined): URL | undefined {
  try {
    return url ? new URL(url) : undefined;
  } catch {
    return undefined;
  }
}

function getOrigin(url: string | undefined): string {
  return getUrl(url)?.origin ?? 'unknown';
}

function getOriginPattern(origin: string): string | undefined {
  const url = getUrl(origin);
  if (!url || url.origin !== origin || !['http:', 'https:'].includes(url.protocol)) return undefined;
  return `${origin}/*`;
}

function registrationId(origin: string): string {
  let hash = 2166136261;
  for (const character of origin) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `personal_webmcp_${(hash >>> 0).toString(36)}`;
}

async function ensureOriginContentScript(origin: string): Promise<void> {
  const pattern = getOriginPattern(origin);
  if (!pattern) throw new Error('Only HTTP and HTTPS origins can be enabled.');

  const id = registrationId(origin);
  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (existing.length > 0) return;

  await browser.scripting.registerContentScripts([{
    id,
    matches: [pattern],
    js: ['content-scripts/content.js'],
    runAt: 'document_start',
    persistAcrossSessions: true,
  }]);
}

function emptyStatus(tab?: Browser.tabs.Tab): TabCapabilityStatus {
  return {
    supported: false,
    registered: false,
    pageTitle: tab?.title ?? '',
    url: tab?.url ?? '',
    updatedAt: Date.now(),
  };
}

function emptyCatalog(tab?: Browser.tabs.Tab): ToolCatalogPayload {
  return {
    supported: false,
    pageTitle: tab?.title ?? '',
    url: tab?.url ?? '',
    tools: [],
  };
}

async function getActiveTab(): Promise<Browser.tabs.Tab | undefined> {
  const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
  return activeTab;
}

export default defineBackground(() => {
  const statusByTab = new Map<number, TabCapabilityStatus>();
  const catalogByTab = new Map<number, ToolCatalogPayload>();
  const pingStartedAtByTab = new Map<number, number>();
  const persistenceReady = bootstrapPersistence();

  void persistenceReady.then(async () => {
    const settings = await settingsRepository.get();
    await Promise.all(settings.enabledOrigins.map(async (origin) => {
      const pattern = getOriginPattern(origin);
      if (!pattern || !await browser.permissions.contains({ origins: [pattern] })) return;
      await ensureOriginContentScript(origin);
    }));
  }).catch(() => {
    // Storage failures are surfaced through side-panel requests.
  });

  browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Older Chromium builds can still open the panel from extension details.
  });

  const getLiveTabData = async (tab: Browser.tabs.Tab) => {
    if (tab.id === undefined) {
      return { status: emptyStatus(tab), catalog: emptyCatalog(tab) };
    }

    const [statusResult, catalogResult] = await Promise.allSettled([
      browser.tabs.sendMessage(tab.id, { type: 'GET_STATUS' }),
      browser.tabs.sendMessage(tab.id, { type: 'GET_CATALOG' }),
    ]);
    const status = statusResult.status === 'fulfilled' && statusResult.value
      ? statusResult.value as TabCapabilityStatus
      : statusByTab.get(tab.id) ?? emptyStatus(tab);
    const catalog = catalogResult.status === 'fulfilled' && catalogResult.value
      ? catalogResult.value as ToolCatalogPayload
      : catalogByTab.get(tab.id) ?? emptyCatalog(tab);

    statusByTab.set(tab.id, status);
    catalogByTab.set(tab.id, catalog);
    return { status, catalog };
  };

  const getPanelSnapshot = async (): Promise<ActiveTabSnapshot> => {
    await persistenceReady;
    const tab = await getActiveTab();
    const { status, catalog } = tab
      ? await getLiveTabData(tab)
      : { status: emptyStatus(), catalog: emptyCatalog() };
    const url = getUrl(status.url || tab?.url);
    const origin = url?.origin;
    const pattern = origin ? getOriginPattern(origin) : undefined;
    const [personalTools, receipts, enabled] = await Promise.all([
      toolRegistryRepository.list(),
      activityReceiptRepository.list(),
      pattern ? browser.permissions.contains({ origins: [pattern] }) : Promise.resolve(false),
    ]);

    return {
      status,
      catalog,
      personalTools: personalTools.filter((tool) => !origin || tool.scope.origin === origin),
      receipts: receipts.filter((receipt) => !origin || receipt.origin === origin).slice(0, 25),
      enabled,
      origin,
      path: url?.pathname,
    };
  };

  browser.runtime.onMessage.addListener(async (message: ExtensionMessage, sender) => {
    if (message.type === 'WEBMCP_STATUS' && sender.tab?.id !== undefined) {
      const status = { ...message.payload, tabId: sender.tab.id, updatedAt: Date.now() };
      statusByTab.set(sender.tab.id, status);
      return status;
    }

    if (message.type === 'WEBMCP_CATALOG' && sender.tab?.id !== undefined) {
      catalogByTab.set(sender.tab.id, message.payload);
      return { saved: true };
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

    if (message.type === 'GET_PANEL_SNAPSHOT') {
      return getPanelSnapshot();
    }

    if (message.type === 'CLEAR_ACTIVITY_HISTORY') {
      await persistenceReady;
      await activityReceiptRepository.clearHistory();
      return { cleared: true };
    }

    if (message.type === 'ENABLE_ORIGIN') {
      await persistenceReady;
      const activeTab = await getActiveTab();
      const activeOrigin = getOrigin(activeTab?.url);
      const pattern = getOriginPattern(message.origin);
      if (!pattern || message.origin !== activeOrigin || activeTab?.id === undefined) {
        throw new Error('The requested origin is not the active HTTP(S) page.');
      }
      if (!await browser.permissions.contains({ origins: [pattern] })) {
        throw new Error('Host permission was not granted.');
      }

      const settings = await settingsRepository.get();
      if (!settings.enabledOrigins.includes(message.origin)) {
        await settingsRepository.update({
          enabledOrigins: [...settings.enabledOrigins, message.origin],
        });
      }
      await ensureOriginContentScript(message.origin);
      await browser.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ['/content-scripts/content.js'],
      });
      return { enabled: true };
    }

    if (message.type !== 'GET_ACTIVE_STATUS' && message.type !== 'RUN_PING_SELF_TEST') {
      return undefined;
    }

    const activeTab = await getActiveTab();
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

    return (await getLiveTabData(activeTab)).status;
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'loading') return;
    statusByTab.delete(tabId);
    catalogByTab.delete(tabId);
    pingStartedAtByTab.delete(tabId);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    statusByTab.delete(tabId);
    catalogByTab.delete(tabId);
    pingStartedAtByTab.delete(tabId);
  });
});
