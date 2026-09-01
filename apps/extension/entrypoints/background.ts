import type {
  ActiveTabSnapshot,
  ActivityReceipt,
  HumanConfirmationPrompt,
  JsonValue,
  LocatorRepair,
  PersonalToolExecutionResult,
  PersonalToolRegistration,
  PersonalToolRecord,
  PingResultPayload,
  RepairProposal,
  SemanticLocator,
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
  repairRepository,
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
  | { type: 'DELETE_PERSONAL_TOOL'; toolId: string }
  | { type: 'GET_SCOPED_PERSONAL_TOOLS'; url: string; supported: boolean }
  | { type: 'RUN_PERSONAL_TOOL'; toolId: string; input: Record<string, JsonValue>; invocationId?: string }
  | { type: 'RUN_NATIVE_TOOL'; toolName: string; input: Record<string, JsonValue> }
  | { type: 'CANCEL_PERSONAL_TOOL'; invocationId: string }
  | { type: 'HUMAN_CONFIRMATION_REQUESTED'; invocationId: string; prompt: HumanConfirmationPrompt }
  | { type: 'RESOLVE_HUMAN_CONFIRMATION'; invocationId: string; approved: boolean }
  | { type: 'APPROVE_REPAIR'; proposalId: string; candidateIndex: number }
  | { type: 'REJECT_REPAIR'; proposalId: string }
  | { type: 'START_GUIDED_REPAIR'; proposalId: string }
  | { type: 'GUIDED_REPAIR_SELECTED'; toolId: string; nodeId: string; locator: SemanticLocator }
  | { type: 'RESTORE_TOOL_REVISION'; revisionId: string }
  | { type: 'RETEST_PERSONAL_TOOL'; toolId: string }
  | { type: 'GET_ACTIVE_STATUS' }
  | { type: 'GET_PANEL_SNAPSHOT' }
  | { type: 'RUN_PING_SELF_TEST' }
  | { type: 'ENABLE_ORIGIN'; origin: string }
  | { type: 'GET_PERSISTENCE_SUMMARY' }
  | { type: 'CLEAR_ACTIVITY_HISTORY' };

interface ToolWorkflowResponse {
  ok: boolean;
  result?: PersonalToolExecutionResult;
  error?: string;
  repair?: {
    nodeId: string;
    nodeLabel: string;
    originalLocator: SemanticLocator;
    candidates: RepairProposal['candidates'];
  };
}

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

function recordedStartingPath(tool: PersonalToolRecord): string | undefined {
  for (const node of tool.workflowGraph.nodes) {
    const locator = node.config.locator;
    if (locator && typeof locator === 'object' && !Array.isArray(locator)) {
      const path = locator.path;
      if (typeof path === 'string' && path.startsWith('/')) return path;
    }
  }
  const rule = tool.scope.pathRules.find((candidate) => candidate.kind !== 'PATTERN' && candidate.value.startsWith('/'));
  return rule?.value;
}

async function waitForPageBridge(tabId: number, expectedUrl: string): Promise<Browser.tabs.Tab> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const tab = await browser.tabs.get(tabId);
    if (tab.status === 'complete' && tab.url?.startsWith(expectedUrl)) {
      try {
        await browser.tabs.sendMessage(tabId, { type: 'GET_STATUS' });
        return tab;
      } catch {
        // The content script can become ready just after the document completes.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`PersonalWebMCP opened ${expectedUrl}, but the page bridge did not become ready. Reload that page and run the tool again.`);
}

function isToolAvailable(tool: PersonalToolRecord, url: URL, supported: boolean, availableTools = new Set<string>()): boolean {
  return supported
    && tool.provenance.type !== 'SYSTEM'
    && tool.health.state !== 'BROKEN'
    && tool.scope.origin === url.origin
    && pathMatches(tool, url)
    && tool.scope.prerequisites.every((prerequisite) => prerequisite === 'document.modelContext' ? supported : availableTools.has(prerequisite));
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

const SENSITIVE_INPUT_NAME = /password|passcode|otp|one.?time|verification|security.?code|card|cvv|cvc|pin|secret|token/i;

function safeInputSummary(input: Record<string, JsonValue>): Record<string, JsonValue> | undefined {
  const safe = Object.fromEntries(Object.entries(input).filter(([name]) => !SENSITIVE_INPUT_NAME.test(name)));
  return Object.keys(safe).length > 0 ? safe : undefined;
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
  const connectionCheckByTab = new Map<number, ActiveTabSnapshot['connectionCheck']>();
  const teachSessionByTab = new Map<number, TeachSessionSnapshot>();
  const executionByTab = new Map<number, ToolExecutionState>();
  const humanDecisionByInvocation = new Map<string, boolean>();
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
    const [personalTools, receipts, repairs, enabled] = await Promise.all([
      toolRegistryRepository.list(),
      activityReceiptRepository.list(),
      repairRepository.list(),
      pattern ? browser.permissions.contains({ origins: [pattern] }) : Promise.resolve(false),
    ]);
    const scopedTools = personalTools.filter((tool) => !url || (
      tool.scope.origin === url.origin && pathMatches(tool, url)
    ));
    const revisions = (await Promise.all(scopedTools.map((tool) => revisionRepository.listForTool(tool.id))))
      .flat()
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    return {
      status,
      catalog,
      personalTools: scopedTools,
      receipts: receipts.filter((receipt) => !origin || receipt.origin === origin).slice(0, 25),
      repairs: repairs.filter((proposal) => scopedTools.some((tool) => tool.id === proposal.toolId)),
      revisions,
      teachSession: tab?.id === undefined
        ? createIdleTeachSession()
        : teachSessionByTab.get(tab.id) ?? createIdleTeachSession(),
      activeExecution: tab?.id === undefined ? undefined : executionByTab.get(tab.id),
      connectionCheck: tab?.id === undefined ? undefined : connectionCheckByTab.get(tab.id),
      enabled,
      origin,
      path: url?.pathname,
    };
  };

  const publishExecutionState = async () => {
    await browser.runtime.sendMessage({ type: 'TOOL_EXECUTION_CHANGED' }).catch(() => undefined);
  };

  const publishRepairState = async () => {
    await browser.runtime.sendMessage({ type: 'REPAIR_STATE_CHANGED' }).catch(() => undefined);
  };

  const applyLocatorRepairs = async (
    tool: PersonalToolRecord,
    repairs: LocatorRepair[],
    reason: 'AUTO_REPAIR' | 'APPROVED_REPAIR',
    repairIds: string[] = repairs.map(() => crypto.randomUUID()),
  ): Promise<PersonalToolRecord> => {
    const now = new Date().toISOString();
    const repairByNode = new Map(repairs.map((repair) => [repair.nodeId, repair]));
    const updated: PersonalToolRecord = {
      ...tool,
      version: tool.version + 1,
      workflowGraph: {
        ...tool.workflowGraph,
        nodes: tool.workflowGraph.nodes.map((node) => {
          const repair = repairByNode.get(node.id);
          return repair ? { ...node, config: { ...node.config, locator: repair.nextLocator as unknown as JsonValue } } : node;
        }),
      },
      provenance: {
        ...tool.provenance,
        type: 'REPAIRED',
        repairHistory: [...tool.provenance.repairHistory, ...repairIds],
      },
      health: { state: 'HEALTHY', lastVerifiedAt: now, confidence: Math.min(...repairs.map((repair) => repair.score)) },
      updatedAt: now,
    };
    await toolRegistryRepository.save(updated);
    await revisionRepository.save({
      id: crypto.randomUUID(),
      toolId: updated.id,
      toolVersion: updated.version,
      createdAt: now,
      reason,
      snapshot: structuredClone(updated),
    });
    for (const proposal of await repairRepository.list()) {
      if (proposal.toolId === tool.id && repairByNode.has(proposal.nodeId)) await repairRepository.remove(proposal.id);
    }
    await publishRepairState();
    return updated;
  };

  const runPersonalTool = async (
    tab: Browser.tabs.Tab,
    toolId: string,
    rawInput: Record<string, JsonValue>,
    requestedInvocationId?: string,
    allowStartPageNavigation = true,
  ): Promise<PersonalToolExecutionResult> => {
    await persistenceReady;
    if (tab.id === undefined) throw new Error('No visible page is available for execution.');
    const existing = executionByTab.get(tab.id);
    if (existing?.status === 'RUNNING') throw new Error(`${existing.toolTitle} is already running on this page.`);

    const tool = await toolRegistryRepository.get(toolId);
    if (!tool || tool.provenance.type === 'SYSTEM') throw new Error('The personal tool is no longer available.');
    let executionTab = tab;
    let { status, catalog } = await getLiveTabData(executionTab);
    let url = getUrl(status.url || executionTab.url);
    if (!url || !isToolAvailable(tool, url, status.supported, new Set(catalog.tools.map((item) => item.name)))) {
      const startPath = recordedStartingPath(tool) ?? tool.scope.pathRules[0]?.value ?? '/';
      throw new Error(`“${tool.title}” is available on ${tool.scope.origin}${startPath}. Open that page and try again.`);
    }

    const startPath = recordedStartingPath(tool);
    if (startPath && `${url.pathname}${url.search}` !== startPath) {
      const targetUrl = `${tool.scope.origin}${startPath}`;
      if (!allowStartPageNavigation) {
        throw new Error(`“${tool.title}” starts on ${targetUrl}. Open that page before asking the agent to run it.`);
      }
      await browser.tabs.update(tab.id, { url: targetUrl });
      executionTab = await waitForPageBridge(tab.id, targetUrl);
      ({ status, catalog } = await getLiveTabData(executionTab));
      url = getUrl(status.url || executionTab.url);
      if (!url || !isToolAvailable(tool, url, status.supported, new Set(catalog.tools.map((item) => item.name)))) {
        throw new Error(`PersonalWebMCP opened ${targetUrl}, but “${tool.title}” was not available there. Reload that page and try again.`);
      }
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
      const response = await browser.tabs.sendMessage(executionTab.id!, {
        type: 'EXECUTE_TOOL_WORKFLOW',
        tool,
        input,
        invocationId,
      }) as ToolWorkflowResponse;
      if (!response.ok || !response.result) {
        if (response.repair) {
          const proposal: RepairProposal = {
            id: crypto.randomUUID(),
            toolId: tool.id,
            toolTitle: tool.title,
            nodeId: response.repair.nodeId,
            nodeLabel: response.repair.nodeLabel,
            status: response.repair.candidates.length > 0 ? 'AWAITING_APPROVAL' : 'GUIDED_REQUIRED',
            createdAt: new Date().toISOString(),
            originalLocator: response.repair.originalLocator,
            candidates: response.repair.candidates,
            error: response.error || 'The target could not be resolved safely.',
          };
          await repairRepository.save(proposal);
          await toolRegistryRepository.save({
            ...tool,
            health: { state: proposal.status === 'GUIDED_REQUIRED' ? 'BROKEN' : 'NEEDS_REVIEW' },
            updatedAt: proposal.createdAt,
          });
          await publishRepairState();
        }
        throw new Error(response.error || 'Visible workflow execution failed.');
      }
      const result = response.result;
      const executedTool = result.repairs.length > 0
        ? await applyLocatorRepairs(tool, result.repairs, 'AUTO_REPAIR')
        : tool;
      const finishedAtMs = Date.now();
      const finishedAt = new Date(finishedAtMs).toISOString();
      const receipt: ActivityReceipt = {
        id: crypto.randomUUID(),
        toolId: tool.id,
        toolVersion: executedTool.version,
        origin: url.origin,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAtMs - startedAtMs),
        status: 'SUCCEEDED',
        inputSummary: safeInputSummary(input),
        selectedLocators: result.selectedLocators,
        result: result as unknown as JsonValue,
        humanDecision: humanDecisionByInvocation.get(invocationId) ? 'APPROVED' : 'NOT_REQUIRED',
      };
      const settings = await settingsRepository.get();
      await activityReceiptRepository.save(receipt, settings.receiptLimit);
      await toolRegistryRepository.save({
        ...executedTool,
        health: {
          state: 'HEALTHY',
          lastVerifiedAt: finishedAt,
          confidence: result.repairs.length > 0
            ? Math.min(...result.repairs.map((repair) => repair.score))
            : 100,
        },
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
      humanDecisionByInvocation.delete(invocationId);
      return result;
    } catch (error) {
      const finishedAtMs = Date.now();
      const finishedAt = new Date(finishedAtMs).toISOString();
      const message = errorMessage(error);
      const rejected = /confirmation was rejected/i.test(message);
      const cancelled = rejected || error instanceof DOMException && error.name === 'AbortError'
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
        inputSummary: safeInputSummary(input),
        selectedLocators: [],
        error: message,
        humanDecision: humanDecisionByInvocation.get(invocationId) === false ? 'REJECTED' : 'NOT_REQUIRED',
      };
      const settings = await settingsRepository.get();
      await activityReceiptRepository.save(receipt, settings.receiptLimit);
      if (!cancelled) {
        await toolRegistryRepository.save({
          ...tool,
          health: { state: 'NEEDS_REVIEW' },
          updatedAt: finishedAt,
        });
      }
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
      humanDecisionByInvocation.delete(invocationId);
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
      connectionCheckByTab.set(tabId, {
        state: message.payload.ok ? 'SUCCEEDED' : 'FAILED',
        message: message.payload.ok
          ? 'Connection verified: personal_ping executed on the visible page.'
          : message.payload.error || 'The connection check failed.',
        checkedAt: Date.now(),
      });
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
      const availableTools = new Set(sender.tab.id === undefined ? [] : (catalogByTab.get(sender.tab.id)?.tools ?? []).map((tool) => tool.name));
      return tools
        .filter((tool) => isToolAvailable(tool, url, message.supported, availableTools))
        .map(toRegistration);
    }

    if (message.type === 'RUN_PERSONAL_TOOL') {
      const tab = sender.tab ?? await getActiveTab();
      if (!tab) throw new Error('Open the tool’s starting page before running it.');
      return runPersonalTool(tab, message.toolId, message.input ?? {}, message.invocationId, sender.tab === undefined);
    }

    if (message.type === 'RUN_NATIVE_TOOL') {
      const tab = sender.tab ?? await getActiveTab();
      if (tab?.id === undefined) throw new Error('Open the page that owns this native tool before running it.');
      const { catalog } = await getLiveTabData(tab);
      const tool = catalog.tools.find((candidate) => candidate.provenance === 'NATIVE' && candidate.name === message.toolName);
      if (!tool) throw new Error(`The visible page no longer exposes “${message.toolName}”. Refresh the Tools view and try again.`);
      return browser.tabs.sendMessage(tab.id, {
        type: 'EXECUTE_NATIVE_TOOL_DIRECT',
        toolName: message.toolName,
        input: message.input ?? {},
      });
    }

    if (message.type === 'HUMAN_CONFIRMATION_REQUESTED' && sender.tab?.id !== undefined) {
      const execution = executionByTab.get(sender.tab.id);
      if (!execution || execution.invocationId !== message.invocationId || execution.status !== 'RUNNING') {
        throw new Error('The confirmation request no longer matches an active capability.');
      }
      executionByTab.set(sender.tab.id, { ...execution, status: 'AWAITING_CONFIRMATION', confirmation: message.prompt });
      await publishExecutionState();
      return { accepted: true };
    }

    if (message.type === 'RESOLVE_HUMAN_CONFIRMATION') {
      const tab = sender.tab ?? await getActiveTab();
      if (tab?.id === undefined) throw new Error('The page awaiting confirmation is no longer visible.');
      const execution = executionByTab.get(tab.id);
      if (!execution || execution.invocationId !== message.invocationId || execution.status !== 'AWAITING_CONFIRMATION') {
        throw new Error('This confirmation request is no longer active.');
      }
      humanDecisionByInvocation.set(message.invocationId, message.approved);
      if (message.approved) executionByTab.set(tab.id, { ...execution, status: 'RUNNING', confirmation: undefined });
      await browser.tabs.sendMessage(tab.id, {
        type: 'RESOLVE_HUMAN_CONFIRMATION',
        invocationId: message.invocationId,
        approved: message.approved,
      });
      await publishExecutionState();
      return { accepted: true };
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

    if (message.type === 'APPROVE_REPAIR') {
      await persistenceReady;
      const proposal = await repairRepository.get(message.proposalId);
      const candidate = proposal?.candidates[message.candidateIndex];
      if (!proposal || !candidate) throw new Error('The repair candidate is no longer available.');
      const tool = await toolRegistryRepository.get(proposal.toolId);
      if (!tool) throw new Error('The tool for this repair no longer exists.');
      const updated = await applyLocatorRepairs(tool, [{
        nodeId: proposal.nodeId,
        previousLocator: proposal.originalLocator,
        nextLocator: candidate.locator,
        score: candidate.score,
        evidence: candidate.evidence,
      }], 'APPROVED_REPAIR', [proposal.id]);
      const activeTab = await getActiveTab();
      if (activeTab?.id !== undefined) void browser.tabs.sendMessage(activeTab.id, { type: 'SYNC_PERSONAL_TOOLS' }).catch(() => undefined);
      return { approved: true, toolVersion: updated.version };
    }

    if (message.type === 'REJECT_REPAIR') {
      await persistenceReady;
      const proposal = await repairRepository.get(message.proposalId);
      if (!proposal) throw new Error('The repair proposal is no longer available.');
      await repairRepository.save({ ...proposal, status: 'REJECTED' });
      const tool = await toolRegistryRepository.get(proposal.toolId);
      if (tool) await toolRegistryRepository.save({ ...tool, health: { state: 'BROKEN' }, updatedAt: new Date().toISOString() });
      await publishRepairState();
      return { rejected: true };
    }

    if (message.type === 'START_GUIDED_REPAIR') {
      await persistenceReady;
      const proposal = await repairRepository.get(message.proposalId);
      const activeTab = await getActiveTab();
      if (!proposal || activeTab?.id === undefined) throw new Error('Open the affected page before selecting a replacement.');
      return browser.tabs.sendMessage(activeTab.id, {
        type: 'START_GUIDED_REPAIR',
        toolId: proposal.toolId,
        nodeId: proposal.nodeId,
      });
    }

    if (message.type === 'GUIDED_REPAIR_SELECTED') {
      await persistenceReady;
      const proposal = (await repairRepository.list()).find((item) => item.toolId === message.toolId && item.nodeId === message.nodeId);
      const tool = await toolRegistryRepository.get(message.toolId);
      if (!proposal || !tool) throw new Error('The guided repair session has expired.');
      const updated = await applyLocatorRepairs(tool, [{
        nodeId: message.nodeId,
        previousLocator: proposal.originalLocator,
        nextLocator: message.locator,
        score: 100,
        evidence: [{ category: 'CONTEXT', points: 0, detail: 'Replacement selected directly by the user.' }],
      }], 'APPROVED_REPAIR', [proposal.id]);
      if (sender.tab?.id !== undefined) void browser.tabs.sendMessage(sender.tab.id, { type: 'SYNC_PERSONAL_TOOLS' }).catch(() => undefined);
      return { repaired: true, toolVersion: updated.version };
    }

    if (message.type === 'RESTORE_TOOL_REVISION') {
      await persistenceReady;
      const revision = await revisionRepository.get(message.revisionId);
      if (!revision) throw new Error('That revision no longer exists.');
      const current = await toolRegistryRepository.get(revision.toolId);
      if (!current) throw new Error('The tool for that revision no longer exists.');
      const now = new Date().toISOString();
      const restored: PersonalToolRecord = {
        ...structuredClone(revision.snapshot),
        version: current.version + 1,
        provenance: {
          ...revision.snapshot.provenance,
          type: 'REPAIRED',
          repairHistory: [...current.provenance.repairHistory, `restore:${revision.id}`],
        },
        health: { state: 'UNVERIFIED' },
        updatedAt: now,
      };
      await toolRegistryRepository.save(restored);
      await revisionRepository.save({
        id: crypto.randomUUID(),
        toolId: restored.id,
        toolVersion: restored.version,
        createdAt: now,
        reason: 'RESTORED',
        snapshot: structuredClone(restored),
      });
      for (const proposal of await repairRepository.list()) {
        if (proposal.toolId === restored.id) await repairRepository.remove(proposal.id);
      }
      const activeTab = await getActiveTab();
      if (activeTab?.id !== undefined) void browser.tabs.sendMessage(activeTab.id, { type: 'SYNC_PERSONAL_TOOLS' }).catch(() => undefined);
      await publishRepairState();
      return { restored: true, toolVersion: restored.version };
    }

    if (message.type === 'RETEST_PERSONAL_TOOL') {
      await persistenceReady;
      const tab = await getActiveTab();
      const tool = await toolRegistryRepository.get(message.toolId);
      if (!tab || !tool) throw new Error('Open the tool’s scoped page before retesting.');
      const previousInput = (await activityReceiptRepository.listForTool(tool.id)).find((receipt) => receipt.inputSummary)?.inputSummary;
      const properties = tool.inputSchema.properties && typeof tool.inputSchema.properties === 'object' && !Array.isArray(tool.inputSchema.properties)
        ? tool.inputSchema.properties as Record<string, Record<string, unknown>>
        : {};
      const defaults = Object.fromEntries(Object.entries(properties)
        .filter((entry) => entry[1] && typeof entry[1] === 'object' && 'default' in entry[1])
        .map(([name, schema]) => [name, schema.default as JsonValue]));
      return runPersonalTool(tab, tool.id, previousInput ?? defaults);
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
      const duplicate = (await toolRegistryRepository.list()).find((tool) => (
        tool.id !== message.tool.id && tool.webmcpName === message.tool.webmcpName
      ));
      if (duplicate) {
        throw new Error(`The WebMCP name “${message.tool.webmcpName}” is already used by “${duplicate.title}”. Choose a unique tool name.`);
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
        const idle = createIdleTeachSession();
        teachSessionByTab.set(activeTab.id, idle);
        void browser.tabs.sendMessage(activeTab.id, { type: 'RESET_TEACHING' }).catch(() => undefined);
        void browser.tabs.sendMessage(activeTab.id, { type: 'SYNC_PERSONAL_TOOLS' }).catch(() => undefined);
      }
      void browser.runtime.sendMessage({ type: 'PERSONAL_TOOLS_CHANGED' }).catch(() => undefined);
      return { saved: true, toolId: message.tool.id, revisionId: revision.id };
    }

    if (message.type === 'DELETE_PERSONAL_TOOL') {
      await persistenceReady;
      const tool = await toolRegistryRepository.get(message.toolId);
      if (!tool || tool.provenance.type === 'SYSTEM') throw new Error('The personal tool is no longer available.');
      await toolRegistryRepository.remove(tool.id);
      const activeTab = await getActiveTab();
      if (activeTab?.id !== undefined) {
        void browser.tabs.sendMessage(activeTab.id, { type: 'SYNC_PERSONAL_TOOLS' }).catch(() => undefined);
      }
      void browser.runtime.sendMessage({ type: 'PERSONAL_TOOLS_CHANGED' }).catch(() => undefined);
      return { deleted: true, toolId: tool.id };
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
      connectionCheckByTab.set(activeTab.id, {
        state: 'RUNNING',
        message: 'Running personal_ping on the visible page…',
        checkedAt: Date.now(),
      });
      try {
        return await browser.tabs.sendMessage(activeTab.id, { type: 'RUN_PING_SELF_TEST' });
      } catch (error) {
        pingStartedAtByTab.delete(activeTab.id);
        connectionCheckByTab.set(activeTab.id, {
          state: 'FAILED',
          message: error instanceof Error ? error.message : 'The connection check could not start.',
          checkedAt: Date.now(),
        });
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
    connectionCheckByTab.delete(tabId);
  });

  browser.tabs.onRemoved.addListener((tabId) => {
    statusByTab.delete(tabId);
    catalogByTab.delete(tabId);
    pingStartedAtByTab.delete(tabId);
    connectionCheckByTab.delete(tabId);
    teachSessionByTab.delete(tabId);
    executionByTab.delete(tabId);
  });
});
