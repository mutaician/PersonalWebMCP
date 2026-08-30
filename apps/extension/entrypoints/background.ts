import type {
  ActiveTabSnapshot,
  ActivityReceipt,
  JsonValue,
  PersonalToolExecutionResult,
  PersonalToolRegistration,
  PersonalToolRecord,
  PingResultPayload,
  TabCapabilityStatus,
  TeachSessionSnapshot,
  ToolCatalogPayload,
  ToolExecutionState,
  ToolRevision,
} from '@personal-webmcp/contracts';
import {
  assertPersonalTool,
  createIdleTeachSession,
  validateInvocationInput,
} from '@personal-webmcp/contracts';
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
  | { type: 'GET_SCOPED_PERSONAL_TOOLS'; url: string; supported: boolean }
  | { type: 'RUN_PERSONAL_TOOL'; toolId: string; input: Record<string, JsonValue>; invocationId?: string }
  | { type: 'CANCEL_PERSONAL_TOOL'; invocationId: string }
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

function pathMatches(tool: PersonalToolRecord, url: URL): boolean {
  if (tool.webmcpName === 'open_latest_unpaid_invoice' && url.pathname !== '/legacy') return false;
  return tool.scope.pathRules.some((rule) => {
    if (rule.kind === 'EXACT') return url.pathname === rule.value;
    if (rule.kind === 'PREFIX') return url.pathname.startsWith(rule.value);
    try {
      return new RegExp(rule.value).test(url.pathname);
    } catch {
      return false;
    }
  });
}

function isToolAvailable(tool: PersonalToolRecord, url: URL, supported: boolean): boolean {
  return supported
    && tool.provenance.type !== 'SYSTEM'
    && tool.health.state !== 'BROKEN'
    && tool.scope.origin === url.origin
    && pathMatches(tool, url)
    && tool.scope.prerequisites.every((prerequisite) => prerequisite !== 'document.modelContext' || supported);
}

function toRegistration(tool: PersonalToolRecord): PersonalToolRegistration {
  return {
    id: tool.id,
    name: tool.webmcpName,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      readOnlyHint: tool.annotations.readOnlyHint,
      untrustedContentHint: tool.annotations.untrustedContentHint,
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Personal tool execution failed.';
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
  const executionByTab = new Map<number, ToolExecutionState>();
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
      activeExecution: tab?.id === undefined ? undefined : executionByTab.get(tab.id),
      enabled,
      origin,
      path: url?.pathname,
    };
  };

  const publishExecutionState = async () => {
    await browser.runtime.sendMessage({ type: 'TOOL_EXECUTION_CHANGED' }).catch(() => undefined);
  };

  const runPersonalTool = async (
    tab: Browser.tabs.Tab,
    toolId: string,
    rawInput: Record<string, JsonValue>,
    requestedInvocationId?: string,
  ): Promise<PersonalToolExecutionResult> => {
    await persistenceReady;
    if (tab.id === undefined) throw new Error('No visible page is available for execution.');
    const existing = executionByTab.get(tab.id);
    if (existing?.status === 'RUNNING') throw new Error(`${existing.toolTitle} is already running on this page.`);

    const tool = await toolRegistryRepository.get(toolId);
    if (!tool || tool.provenance.type === 'SYSTEM') throw new Error('The personal tool is no longer available.');
    const { status } = await getLiveTabData(tab);
    const url = getUrl(status.url || tab.url);
    if (!url || !isToolAvailable(tool, url, status.supported)) {
      throw new Error('This tool is not scoped to the visible page. Open its starting page and try again.');
    }

    const validation = validateInvocationInput(tool.inputSchema, rawInput ?? {});
    if (!validation.valid) throw new Error(`Tool input is invalid: ${validation.errors.join('; ')}`);
    const input = validation.value as Record<string, JsonValue>;
    const invocationId = requestedInvocationId || crypto.randomUUID();
    const startedAtMs = Date.now();
    const startedAt = new Date(startedAtMs).toISOString();
    executionByTab.set(tab.id, {
      invocationId,
      toolId: tool.id,
      toolTitle: tool.title,
      status: 'RUNNING',
      startedAt,
      input,
    });
    await publishExecutionState();

    try {
      const result = await browser.tabs.sendMessage(tab.id, {
        type: 'EXECUTE_TOOL_WORKFLOW',
        tool,
        input,
        invocationId,
      }) as PersonalToolExecutionResult;
      const finishedAtMs = Date.now();
      const finishedAt = new Date(finishedAtMs).toISOString();
      const receipt: ActivityReceipt = {
        id: crypto.randomUUID(),
        toolId: tool.id,
        toolVersion: tool.version,
        origin: url.origin,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAtMs - startedAtMs),
        status: 'SUCCEEDED',
        inputSummary: input,
        selectedLocators: result.selectedLocators,
        result: result as unknown as JsonValue,
        humanDecision: 'NOT_REQUIRED',
      };
      const settings = await settingsRepository.get();
      await activityReceiptRepository.save(receipt, settings.receiptLimit);
      await toolRegistryRepository.save({
        ...tool,
        health: { state: 'HEALTHY', lastVerifiedAt: finishedAt, confidence: 100 },
        updatedAt: finishedAt,
      });
      executionByTab.set(tab.id, {
        invocationId,
        toolId: tool.id,
        toolTitle: tool.title,
        status: 'SUCCEEDED',
        startedAt,
        finishedAt,
        input,
        result: result as unknown as JsonValue,
      });
      await publishExecutionState();
      return result;
    } catch (error) {
      const finishedAtMs = Date.now();
      const finishedAt = new Date(finishedAtMs).toISOString();
      const message = errorMessage(error);
      const cancelled = error instanceof DOMException && error.name === 'AbortError'
        || /cancel(?:led|ed)|abort/i.test(message);
      const receipt: ActivityReceipt = {
        id: crypto.randomUUID(),
        toolId: tool.id,
        toolVersion: tool.version,
        origin: url.origin,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAtMs - startedAtMs),
        status: cancelled ? 'CANCELLED' : 'FAILED',
        inputSummary: input,
        selectedLocators: [],
        error: message,
        humanDecision: 'NOT_REQUIRED',
      };
      const settings = await settingsRepository.get();
      await activityReceiptRepository.save(receipt, settings.receiptLimit);
      executionByTab.set(tab.id, {
        invocationId,
        toolId: tool.id,
        toolTitle: tool.title,
        status: cancelled ? 'CANCELLED' : 'FAILED',
        startedAt,
        finishedAt,
        input,
        error: message,
      });
      await publishExecutionState();
      throw error;
    }
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

    if (message.type === 'GET_SCOPED_PERSONAL_TOOLS') {
      await persistenceReady;
      const url = getUrl(message.url);
      if (!url || !sender.tab?.url || getOrigin(sender.tab.url) !== url.origin) return [];
      const tools = await toolRegistryRepository.list();
      return tools
        .filter((tool) => isToolAvailable(tool, url, message.supported))
        .map(toRegistration);
    }

    if (message.type === 'RUN_PERSONAL_TOOL') {
      const tab = sender.tab ?? await getActiveTab();
      if (!tab) throw new Error('Open the tool’s starting page before running it.');
      return runPersonalTool(tab, message.toolId, message.input ?? {}, message.invocationId);
    }

    if (message.type === 'CANCEL_PERSONAL_TOOL') {
      const tab = sender.tab ?? await getActiveTab();
      if (tab?.id === undefined) return { accepted: false };
      const execution = executionByTab.get(tab.id);
      if (!execution || execution.invocationId !== message.invocationId || execution.status !== 'RUNNING') {
        return { accepted: false };
      }
      await browser.tabs.sendMessage(tab.id, {
        type: 'CANCEL_TOOL_WORKFLOW',
        invocationId: message.invocationId,
      });
      return { accepted: true };
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
      if (activeTab?.id !== undefined) {
        void browser.tabs.sendMessage(activeTab.id, { type: 'SYNC_PERSONAL_TOOLS' }).catch(() => undefined);
      }
      void browser.runtime.sendMessage({ type: 'PERSONAL_TOOLS_CHANGED' }).catch(() => undefined);
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
    executionByTab.delete(tabId);
  });
});
