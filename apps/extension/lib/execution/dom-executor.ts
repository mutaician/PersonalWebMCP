import type {
  JsonPrimitive,
  JsonValue,
  LocatorReceipt,
  PersonalToolExecutionResult,
  PersonalToolRecord,
  SemanticLocator,
  WorkflowNode,
} from '@personal-webmcp/contracts';

interface ResolvedElement {
  element: HTMLElement;
  strategy: string;
}

interface ExecutionContext {
  input: Record<string, JsonValue>;
  output: Record<string, JsonValue>;
  selectedLocators: LocatorReceipt[];
  pendingNavigation?: string;
  actionsCompleted: number;
}

function normalized(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
}

function labelText(element: Element): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const label = element.labels?.[0];
    if (label) {
      const copy = label.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('input, select, textarea, button').forEach((control) => control.remove());
      const text = normalized(copy.textContent);
      if (text) return text.replace(/\s*:\s*$/, '');
    }
  }
  return normalized(element.closest('label')?.textContent);
}

function accessibleText(element: Element): string {
  const ariaLabel = normalized(element.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel;
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = normalized(labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
    if (text) return text;
  }
  const label = labelText(element);
  if (label) return label;
  return normalized(element.getAttribute('title') || element.textContent);
}

function isVisible(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
}

function safeQuery(selector: string | undefined): HTMLElement | undefined {
  if (!selector) return undefined;
  try {
    const element = document.querySelector(selector);
    return element && isVisible(element) ? element : undefined;
  } catch {
    return undefined;
  }
}

function queryStableAttribute(locator: SemanticLocator): HTMLElement | undefined {
  for (const [name, value] of Object.entries(locator.stableAttributes)) {
    const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value;
    const selector = name === 'id' ? `#${escaped}` : `${locator.tagName}[${name}="${escaped}"]`;
    const element = safeQuery(selector);
    if (element) return element;
  }
  return undefined;
}

function semanticCandidate(locator: SemanticLocator): HTMLElement | undefined {
  const selector = locator.tagName && locator.tagName !== 'document' ? locator.tagName : '*';
  let candidates: Element[];
  try {
    candidates = [...document.querySelectorAll(selector)];
  } catch {
    candidates = [];
  }
  const visible = candidates.filter(isVisible);
  const expectedName = normalized(locator.accessibleName);
  const expectedLabel = normalized(locator.label);
  const expectedPlaceholder = normalized(locator.placeholder);

  return visible.find((candidate) => expectedName && accessibleText(candidate) === expectedName)
    ?? visible.find((candidate) => expectedLabel && labelText(candidate) === expectedLabel)
    ?? visible.find((candidate) => expectedName && accessibleText(candidate).startsWith(expectedName))
    ?? visible.find((candidate) => expectedLabel && labelText(candidate).startsWith(expectedLabel))
    ?? visible.find((candidate) => expectedPlaceholder && normalized(candidate.getAttribute('placeholder')) === expectedPlaceholder);
}

function resolveElement(locator: SemanticLocator): ResolvedElement | undefined {
  const fallback = safeQuery(locator.fallbackSelector);
  if (fallback) return { element: fallback, strategy: 'fallback-selector' };
  const stable = queryStableAttribute(locator);
  if (stable) return { element: stable, strategy: 'stable-attribute' };
  const semantic = semanticCandidate(locator);
  if (semantic) return { element: semantic, strategy: 'semantic-name' };
  return undefined;
}

async function waitForResolvedElement(locator: SemanticLocator, signal: AbortSignal, timeoutMs = 5000): Promise<ResolvedElement> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    signal.throwIfAborted();
    const resolved = resolveElement(locator);
    if (resolved) return resolved;
    await wait(80, signal);
  }
  throw new Error(`Could not find “${locator.accessibleName ?? locator.label ?? locator.tagName}” on the visible page.`);
}

function wait(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, durationMs);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(signal.reason ?? new DOMException('Execution cancelled.', 'AbortError'));
    }, { once: true });
  });
}

async function settle(signal: AbortSignal): Promise<void> {
  await wait(120, signal);
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
  signal.throwIfAborted();
}

async function focusTarget(element: HTMLElement, signal: AbortSignal): Promise<void> {
  element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  const previousOutline = element.style.outline;
  const previousOffset = element.style.outlineOffset;
  element.style.outline = '3px solid #176b45';
  element.style.outlineOffset = '2px';
  await wait(100, signal);
  window.setTimeout(() => {
    element.style.outline = previousOutline;
    element.style.outlineOffset = previousOffset;
  }, 650);
}

function locatorFromNode(node: WorkflowNode): SemanticLocator {
  const locator = node.config.locator;
  if (!locator || typeof locator !== 'object' || Array.isArray(locator)) {
    throw new Error(`${node.label} has no semantic locator.`);
  }
  return locator as unknown as SemanticLocator;
}

function valueForNode(node: WorkflowNode, input: Record<string, JsonValue>): JsonValue {
  if (node.config.valueSource === 'PARAMETER') {
    const parameterName = node.config.parameterName;
    if (typeof parameterName !== 'string' || !(parameterName in input)) {
      throw new Error(`Missing required workflow value for ${node.label}.`);
    }
    return input[parameterName]!;
  }
  if ('value' in node.config) return node.config.value!;
  throw new Error(`${node.label} has no captured value.`);
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: JsonValue): void {
  if (element instanceof HTMLSelectElement) {
    const wanted = normalized(String(value));
    const option = [...element.options].find((candidate) => normalized(candidate.value) === wanted || normalized(candidate.textContent) === wanted);
    if (!option) throw new Error(`“${String(value)}” is not available in ${accessibleText(element) || 'the select control'}.`);
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(element, option.value);
  } else if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
    setter?.call(element, Boolean(value));
  } else {
    const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, String(value));
  }
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: typeof value === 'string' ? value : null }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function recordResolution(context: ExecutionContext, node: WorkflowNode, resolved: ResolvedElement): void {
  context.selectedLocators.push({ nodeId: node.id, strategy: resolved.strategy, repaired: false });
}

function extractInvoiceContext(element: HTMLElement, context: ExecutionContext): void {
  if (element instanceof HTMLAnchorElement) {
    const match = new URL(element.href, window.location.href).pathname.match(/\/legacy\/invoices\/([^/]+)/);
    if (match?.[1]) context.output.invoiceId = decodeURIComponent(match[1]);
  }
  const row = element.closest('tr');
  if (row) {
    const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim() ?? '');
    if (cells[0]) context.output.invoiceId = cells[0];
    if (cells[1]) context.output.vendor = cells[1];
    if (cells.at(-1)) context.output.amount = cells.at(-1)!;
  }
  const card = element.closest('.atlas-invoice-card');
  if (card) {
    const id = card.querySelector('.atlas-invoice-identity small')?.textContent?.trim();
    const vendor = card.querySelector('.atlas-invoice-identity h2')?.textContent?.trim();
    const amount = card.querySelector('.atlas-invoice-state strong')?.textContent?.trim();
    if (id) context.output.invoiceId = id;
    if (vendor) context.output.vendor = vendor;
    if (amount) context.output.amount = amount;
  }
}

async function executeDomValueNode(node: WorkflowNode, context: ExecutionContext, signal: AbortSignal): Promise<void> {
  const locator = locatorFromNode(node);
  const resolved = await waitForResolvedElement(locator, signal);
  if (!(resolved.element instanceof HTMLInputElement || resolved.element instanceof HTMLTextAreaElement || resolved.element instanceof HTMLSelectElement)) {
    throw new Error(`${node.label} is no longer an editable control.`);
  }
  await focusTarget(resolved.element, signal);
  const value = valueForNode(node, context.input);
  setNativeValue(resolved.element, value);
  recordResolution(context, node, resolved);
  await settle(signal);
}

async function executeActivationNode(node: WorkflowNode, context: ExecutionContext, signal: AbortSignal): Promise<void> {
  const locator = locatorFromNode(node);
  const resolved = await waitForResolvedElement(locator, signal);
  await focusTarget(resolved.element, signal);
  recordResolution(context, node, resolved);
  extractInvoiceContext(resolved.element, context);
  if (resolved.element instanceof HTMLAnchorElement && resolved.element.href) {
    context.pendingNavigation = resolved.element.href;
    return;
  }
  resolved.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  await settle(signal);
}

function firstVisibleInvoiceTarget(locator: SemanticLocator): ResolvedElement | undefined {
  if (locator.tagName === 'tr') {
    const row = [...document.querySelectorAll('.legacy-data-table tbody tr')]
      .find((candidate) => isVisible(candidate) && /^INV-/i.test(candidate.querySelector('td')?.textContent?.trim() ?? ''));
    if (row && isVisible(row)) return { element: row, strategy: 'current-first-invoice' };
  }
  if (locator.tagName === 'a' || locator.expectedOutcome?.startsWith('path-prefix:/legacy/invoices/')) {
    const link = [...document.querySelectorAll('a[href*="/legacy/invoices/"]')].find(isVisible);
    if (link) return { element: link, strategy: 'current-first-invoice-link' };
  }
  return undefined;
}

async function executePersonalActivationNode(
  node: WorkflowNode,
  tool: PersonalToolRecord,
  context: ExecutionContext,
  signal: AbortSignal,
): Promise<void> {
  if (tool.webmcpName !== 'open_latest_unpaid_invoice') {
    await executeActivationNode(node, context, signal);
    return;
  }
  const locator = locatorFromNode(node);
  const currentInvoiceTarget = firstVisibleInvoiceTarget(locator);
  if (!currentInvoiceTarget) {
    await executeActivationNode(node, context, signal);
    return;
  }
  await focusTarget(currentInvoiceTarget.element, signal);
  recordResolution(context, node, currentInvoiceTarget);
  extractInvoiceContext(currentInvoiceTarget.element, context);
  if (currentInvoiceTarget.element instanceof HTMLAnchorElement) {
    context.pendingNavigation = currentInvoiceTarget.element.href;
    return;
  }
  currentInvoiceTarget.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  await settle(signal);
}

function outcomeSatisfied(expected: string, context: ExecutionContext): boolean {
  if (expected === 'control-value-set' || expected === 'target-activated' || expected === 'form-submitted') return true;
  if (expected === 'invoice-results-updated') {
    return [...document.querySelectorAll('.legacy-data-table tbody tr')]
      .some((row) => isVisible(row) && /^INV-/i.test(row.querySelector('td')?.textContent?.trim() ?? ''))
      || [...document.querySelectorAll('.atlas-invoice-card')].some(isVisible);
  }
  if (expected.startsWith('path-prefix:')) {
    const prefix = expected.slice('path-prefix:'.length);
    const candidate = context.pendingNavigation ? new URL(context.pendingNavigation, window.location.href).pathname : window.location.pathname;
    return candidate.startsWith(prefix);
  }
  if (expected.startsWith('path:')) {
    const path = expected.slice('path:'.length);
    const candidate = context.pendingNavigation ? new URL(context.pendingNavigation, window.location.href).pathname : window.location.pathname;
    return candidate === path;
  }
  if (expected.startsWith('url:')) {
    const url = expected.slice('url:'.length);
    return context.pendingNavigation === url || window.location.href === url;
  }
  return false;
}

async function executeAssertionNode(node: WorkflowNode, context: ExecutionContext, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const expected = typeof node.config.expectedOutcome === 'string'
    ? node.config.expectedOutcome
    : typeof node.config.assertion === 'string' && node.config.assertion !== 'OBSERVE_EXPECTED_OUTCOME'
      ? node.config.assertion
      : undefined;
  if (!expected) return;
  if (!outcomeSatisfied(expected, context)) throw new Error(`Postcondition failed: ${expected}.`);
}

async function executeWaitNode(node: WorkflowNode, signal: AbortSignal): Promise<void> {
  const duration = typeof node.config.durationMs === 'number' ? Math.max(0, Math.min(node.config.durationMs, 10000)) : 250;
  if (node.config.locator) {
    await waitForResolvedElement(locatorFromNode(node), signal, duration || 5000);
  } else {
    await wait(duration, signal);
  }
}

async function executeExtractNode(node: WorkflowNode, context: ExecutionContext, signal: AbortSignal): Promise<void> {
  const resolved = await waitForResolvedElement(locatorFromNode(node), signal);
  const outputName = typeof node.config.outputName === 'string' ? node.config.outputName : node.id;
  const property = typeof node.config.property === 'string' ? node.config.property : 'textContent';
  const raw = property === 'value' && 'value' in resolved.element ? resolved.element.value : resolved.element.textContent;
  context.output[outputName] = (typeof raw === 'string' ? raw.trim() : String(raw ?? '')) as JsonPrimitive;
  recordResolution(context, node, resolved);
}

function nextNode(current: WorkflowNode, tool: PersonalToolRecord): WorkflowNode | undefined {
  const edge = tool.workflowGraph.edges.find((candidate) => candidate.source === current.id);
  return edge ? tool.workflowGraph.nodes.find((candidate) => candidate.id === edge.target) : undefined;
}

async function prepareInvoiceRegister(context: ExecutionContext, signal: AbortSignal): Promise<void> {
  const hasInvoiceControls = [...document.querySelectorAll('select, input')].some((element) => (
    isVisible(element) && /vendor|minimum amount|status|sort by/.test(labelText(element))
  ));
  if (hasInvoiceControls) return;

  const entry = [...document.querySelectorAll('nav button')].find((element) => {
    if (!isVisible(element)) return false;
    const name = accessibleText(element);
    return name.startsWith('invoice register') || name.startsWith('invoices');
  });
  if (!entry || !isVisible(entry)) throw new Error('Open the invoice register before running this tool.');
  await focusTarget(entry, signal);
  entry.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  context.selectedLocators.push({
    nodeId: 'prerequisite-invoice-register',
    strategy: 'semantic-prerequisite',
    repaired: false,
  });
  context.actionsCompleted += 1;
  await settle(signal);
}

export async function executePersonalToolOnPage(
  tool: PersonalToolRecord,
  input: Record<string, JsonValue>,
  invocationId: string,
  signal: AbortSignal,
): Promise<PersonalToolExecutionResult> {
  const context: ExecutionContext = {
    input,
    output: {},
    selectedLocators: [],
    actionsCompleted: 0,
  };
  const visited = new Set<string>();
  let node = tool.workflowGraph.nodes.find((candidate) => candidate.id === tool.workflowGraph.entryNodeId);
  if (!node) throw new Error('The workflow entry node is missing.');
  if (tool.webmcpName === 'open_latest_unpaid_invoice') {
    await prepareInvoiceRegister(context, signal);
  }

  while (node) {
    signal.throwIfAborted();
    if (visited.has(node.id)) throw new Error('The workflow contains a cycle that cannot be executed safely.');
    visited.add(node.id);

    if (node.type === 'DOM_INPUT' || node.type === 'DOM_SELECT') {
      await executeDomValueNode(node, context, signal);
    } else if (node.type === 'DOM_ACTIVATE') {
      await executePersonalActivationNode(node, tool, context, signal);
    } else if (node.type === 'WAIT_FOR') {
      await executeWaitNode(node, signal);
    } else if (node.type === 'EXTRACT') {
      await executeExtractNode(node, context, signal);
    } else if (node.type === 'ASSERT') {
      await executeAssertionNode(node, context, signal);
    } else if (node.type === 'NAVIGATE') {
      if (!context.pendingNavigation) {
        if (tool.webmcpName === 'open_latest_unpaid_invoice') {
          const link = [...document.querySelectorAll('a[href*="/legacy/invoices/"]')].find(isVisible);
          if (!link || !(link instanceof HTMLAnchorElement)) {
            throw new Error('The workflow did not identify a current invoice detail link.');
          }
          extractInvoiceContext(link, context);
          context.pendingNavigation = link.href;
        } else {
          const destination = node.config.destination;
          if (typeof destination !== 'string') throw new Error('The navigation destination is missing.');
          context.pendingNavigation = new URL(destination, window.location.href).href;
        }
      }
    } else {
      throw new Error(`${node.type} execution is not available in this workflow yet.`);
    }

    context.actionsCompleted += 1;
    node = nextNode(node, tool);
  }

  signal.throwIfAborted();
  if (context.pendingNavigation) {
    const navigationUrl = context.pendingNavigation;
    window.setTimeout(() => {
      if (!signal.aborted) window.location.assign(navigationUrl);
    }, 900);
  }

  const invoiceId = typeof context.output.invoiceId === 'string' ? context.output.invoiceId : undefined;
  return {
    ok: true,
    invocationId,
    toolId: tool.id,
    toolName: tool.webmcpName,
    message: invoiceId
      ? `Opened ${invoiceId} after ${context.actionsCompleted} visible workflow steps.`
      : `Completed ${context.actionsCompleted} visible workflow steps.`,
    actionsCompleted: context.actionsCompleted,
    pageTitle: document.title,
    pageUrl: window.location.href,
    output: context.output,
    selectedLocators: context.selectedLocators,
    navigationUrl: context.pendingNavigation,
  };
}
