import type {
  ActiveTabSnapshot,
  PersonalToolRecord,
  PingResultPayload,
  TabCapabilityStatus,
  TeachSessionSnapshot,
  ToolCatalogPayload,
  ToolRevision,
} from '@personal-webmcp/contracts';
import { assertPersonalTool, createIdleTeachSession } from '@personal-webmcp/contracts';
import {
  activityReceiptRepository,
  bootstrapPersistence,
  getPersistenceSummary,
  savePingReceipt,
  settingsRepository,
  toolRegistryRepository,
  traceRepository,
  revisionRepository,
} from '../lib/storage';

type ExtensionMessage =
  | { type: 'WEBMCP_STATUS'; payload: TabCapabilityStatus }
  | { type: 'WEBMCP_CATALOG'; payload: ToolCatalogPayload }
  | { type: 'WEBMCP_PING_RESULT'; payload: PingResultPayload }
  | { type: 'TEACH_STATE_UPDATED'; payload: TeachSessionSnapshot }
  | { type: 'GET_TEACH_SESSION' }
  | { type: 'START_TEACHING' }
  | { type: 'PAUSE_TEACHING' }
  | { type: 'RESUME_TEACHING' }
  | { type: 'CANCEL_TEACHING' }
  | { type: 'FINISH_TEACHING' }
  | { type: 'TEST_COMPILED_TOOL'; tool: PersonalToolRecord }
  | { type: 'SAVE_COMPILED_TOOL'; tool: PersonalToolRecord }
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
  const teachSessionByTab = new Map<number, TeachSessionSnapshot>();
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
      teachSession: tab?.id === undefined
        ? createIdleTeachSession()
        : teachSessionByTab.get(tab.id) ?? createIdleTeachSession(),
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

    if (message.type === 'TEACH_STATE_UPDATED' && sender.tab?.id !== undefined) {
      teachSessionByTab.set(sender.tab.id, structuredClone(message.payload));
      void browser.runtime.sendMessage({ type: 'TEACH_STATE_CHANGED' }).catch(() => undefined);
      return { saved: true };
    }

    if (message.type === 'GET_TEACH_SESSION') {
      const tabId = sender.tab?.id ?? (await getActiveTab())?.id;
      return tabId === undefined
        ? createIdleTeachSession()
        : teachSessionByTab.get(tabId) ?? createIdleTeachSession();
    }

    if (message.type === 'GET_PERSISTENCE_SUMMARY') {
      await persistenceReady;
      return getPersistenceSummary();
    }

    if (message.type === 'GET_PANEL_SNAPSHOT') {
      return getPanelSnapshot();
    }

    if (['START_TEACHING', 'PAUSE_TEACHING', 'RESUME_TEACHING', 'CANCEL_TEACHING', 'FINISH_TEACHING'].includes(message.type)) {
      await persistenceReady;
      const activeTab = await getActiveTab();
      if (activeTab?.id === undefined) throw new Error('Open a permitted page before teaching.');
      const session = await browser.tabs.sendMessage(activeTab.id, { type: message.type }) as TeachSessionSnapshot;

      if (message.type === 'CANCEL_TEACHING') {
        if (session.trace?.status === 'CANCELLED') await traceRepository.save(session.trace);
        const idle = createIdleTeachSession();
        teachSessionByTab.set(activeTab.id, idle);
        return idle;
      }

      teachSessionByTab.set(activeTab.id, structuredClone(session));
      if (message.type === 'FINISH_TEACHING' && session.trace?.status === 'COMPLETED') {
        await traceRepository.save(session.trace);
      }
      return session;
    }

    if (message.type === 'TEST_COMPILED_TOOL' || message.type === 'SAVE_COMPILED_TOOL') {
      await persistenceReady;
      assertPersonalTool(message.tool);
      const activeTab = await getActiveTab();
      const activeOrigin = getOrigin(activeTab?.url);
      if (activeOrigin !== message.tool.scope.origin) {
        throw new Error('The tool scope does not match the active page origin.');
      }
      if (message.tool.inputSchema.additionalProperties !== false) {
        throw new Error('The generated schema must reject undeclared inputs.');
      }
      if (message.type === 'TEST_COMPILED_TOOL') {
        return { valid: true, message: 'Contract, schema, scope and workflow graph are valid.' };
      }

      await toolRegistryRepository.save(message.tool);
      const revision: ToolRevision = {
        id: crypto.randomUUID(),
        toolId: message.tool.id,
        toolVersion: message.tool.version,
        createdAt: new Date().toISOString(),
        reason: 'CREATED',
        snapshot: structuredClone(message.tool),
      };
      await revisionRepository.save(revision);
      return { saved: true, toolId: message.tool.id, revisionId: revision.id };
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
    teachSessionByTab.delete(tabId);
  });
});
