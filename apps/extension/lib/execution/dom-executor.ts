import type {
  JsonPrimitive,
  JsonValue,
  LocatorReceipt,
  LocatorRepair,
  PersonalToolExecutionResult,
  PersonalToolRecord,
  RepairCandidate,
  RepairScoreEvidence,
  SemanticLocator,
  WorkflowNode,
} from '@personal-webmcp/contracts';
import { normalizeSemanticLocator, stableSemanticText } from '@personal-webmcp/engine';

interface ResolvedElement {
  element: HTMLElement;
  strategy: string;
  score: number;
  repaired: boolean;
  nextLocator?: SemanticLocator;
  evidence: RepairScoreEvidence[];
}

interface ExecutionContext {
  input: Record<string, JsonValue>;
  output: Record<string, JsonValue>;
  selectedLocators: LocatorReceipt[];
  repairs: LocatorRepair[];
  pendingNavigation?: string;
  actionsCompleted: number;
}

export interface RepairRequest {
  nodeId: string;
  nodeLabel: string;
  originalLocator: SemanticLocator;
  candidates: RepairCandidate[];
}

export class RepairRequiredError extends Error {
  constructor(readonly request: RepairRequest) {
    super(request.candidates.length > 0
      ? `“${request.nodeLabel}” has more than one plausible replacement.`
      : `Could not find a safe replacement for “${request.nodeLabel}”.`);
    this.name = 'RepairRequiredError';
  }
}

export type NativeToolExecutor = (
  toolName: string,
  input: Record<string, JsonValue>,
  nodeId: string,
  signal: AbortSignal,
) => Promise<JsonValue>;

export type HumanConfirmationExecutor = (
  label: string,
  summary: string,
  nodeId: string,
  signal: AbortSignal,
) => Promise<void>;

function normalized(value: string | null | undefined): string {
  return stableSemanticText(value)?.replace(/\s+/g, ' ').trim().toLowerCase() ?? '';
}

function semanticMatches(expected: string | undefined, actual: string): boolean {
  const wanted = normalized(expected);
  return Boolean(wanted && actual && (wanted === actual || wanted.startsWith(actual) || actual.startsWith(wanted)));
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

function inferredRole(element: Element): string | undefined {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;
  if (element instanceof HTMLButtonElement) return 'button';
  if (element instanceof HTMLAnchorElement && element.href) return 'link';
  if (element instanceof HTMLSelectElement) return 'combobox';
  if (element instanceof HTMLTextAreaElement) return 'textbox';
  if (element instanceof HTMLInputElement) {
    if (['button', 'submit', 'reset'].includes(element.type)) return 'button';
    if (element.type === 'checkbox') return 'checkbox';
    if (element.type === 'radio') return 'radio';
    if (element.type === 'range') return 'slider';
    return 'textbox';
  }
  if (element instanceof HTMLTableRowElement) return 'row';
  return undefined;
}

function stableAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const name of ['id', 'name', 'data-testid', 'data-test', 'data-qa', 'data-id']) {
    const value = element.getAttribute(name);
    if (value && value.length <= 100) attributes[name] = value;
  }
  return attributes;
}

function cssPath(element: Element, depth = 6): string {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement && segments.length < depth) {
    let segment = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? [...current.parentElement.children].filter((sibling) => sibling.tagName === current!.tagName)
      : [];
    if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    segments.unshift(segment);
    current = current.parentElement;
  }
  return segments.join(' > ');
}

function landmarkText(element: Element): string | undefined {
  const landmark = element.closest('main, nav, aside, header, footer, form, section, [role="main"], [role="navigation"], [role="region"], [role="form"]');
  if (!landmark) return undefined;
  return landmark.getAttribute('aria-label') || landmark.getAttribute('role') || landmark.tagName.toLowerCase();
}

function formText(element: Element): string | undefined {
  const form = element.closest('form');
  return form?.getAttribute('aria-label') || form?.getAttribute('name') || form?.id || undefined;
}

function locatorForElement(element: HTMLElement, original: SemanticLocator): SemanticLocator {
  const placeholder = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? element.placeholder || undefined
    : undefined;
  return normalizeSemanticLocator({
    role: inferredRole(element),
    accessibleName: accessibleText(element) || undefined,
    label: labelText(element) || undefined,
    placeholder,
    tagName: element.tagName.toLowerCase(),
    inputType: element instanceof HTMLInputElement ? element.type : undefined,
    formName: formText(element),
    landmark: landmarkText(element),
    nearbyText: element.parentElement?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 180),
    stableAttributes: stableAttributes(element),
    fallbackSelector: cssPath(element),
    domPath: cssPath(element, 8),
    origin: window.location.origin,
    path: `${window.location.pathname}${window.location.search}`,
    pageTitle: document.title,
    expectedOutcome: original.expectedOutcome,
  });
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

function stableTarget(locator: SemanticLocator): HTMLElement | undefined {
  for (const [name, value] of Object.entries(locator.stableAttributes)) {
    const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(value) : value;
    const target = safeQuery(name === 'id' ? `#${escaped}` : `${locator.tagName}[${name}="${escaped}"]`);
    if (target) return target;
  }
  return undefined;
}

function scoreElement(element: HTMLElement, locator: SemanticLocator): { score: number; evidence: RepairScoreEvidence[] } {
  const evidence: RepairScoreEvidence[] = [];
  const roleMatches = Boolean(locator.role && inferredRole(element) === locator.role);
  const nameMatches = semanticMatches(locator.accessibleName, accessibleText(element));
  if (roleMatches && nameMatches) evidence.push({ category: 'ROLE_NAME', points: 35, detail: 'Role and accessible name match.' });
  else if (nameMatches) evidence.push({ category: 'ROLE_NAME', points: 25, detail: 'Accessible name matches.' });
  else if (roleMatches) evidence.push({ category: 'ROLE_NAME', points: 10, detail: 'Role matches.' });

  if (semanticMatches(locator.label, labelText(element))
    || semanticMatches(locator.placeholder, element.getAttribute('placeholder') ?? '')) {
    evidence.push({ category: 'LABEL_PLACEHOLDER', points: 25, detail: 'Label or placeholder matches.' });
  }

  const currentAttributes = stableAttributes(element);
  if (Object.entries(locator.stableAttributes).some(([name, value]) => currentAttributes[name] === value)) {
    evidence.push({ category: 'STABLE_ATTRIBUTE', points: 15, detail: 'A stable attribute matches.' });
  }

  const originalNearby = normalized(locator.nearbyText);
  const currentNearby = normalized(element.parentElement?.textContent);
  if (semanticMatches(locator.formName, normalized(formText(element)))
    || semanticMatches(locator.landmark, normalized(landmarkText(element)))
    || Boolean(originalNearby && currentNearby && (originalNearby.includes(currentNearby) || currentNearby.includes(originalNearby)))) {
    evidence.push({ category: 'CONTEXT', points: 15, detail: 'Form, landmark or nearby context matches.' });
  }

  const fallback = safeQuery(locator.fallbackSelector);
  if (fallback === element || (locator.tagName === element.tagName.toLowerCase() && roleMatches)) {
    evidence.push({ category: 'POSITION', points: 10, detail: fallback === element ? 'Fallback position matches.' : 'Element type and relative role remain compatible.' });
  }

  return { score: evidence.reduce((total, item) => total + item.points, 0), evidence };
}

function rankedCandidates(locator: SemanticLocator): Array<RepairCandidate & { element: HTMLElement }> {
  const selector = [locator.tagName, 'button', 'a', 'input', 'select', 'textarea', '[role]', 'tr']
    .filter(Boolean)
    .join(',');
  let elements: HTMLElement[] = [];
  try {
    elements = [...document.querySelectorAll(selector)].filter(isVisible);
  } catch {
    return [];
  }
  return [...new Set(elements)].map((element) => {
    const { score, evidence } = scoreElement(element, locator);
    return {
      element,
      locator: locatorForElement(element, locator),
      score,
      evidence,
      preview: accessibleText(element) || labelText(element) || `<${element.tagName.toLowerCase()}>`,
    };
  }).filter((candidate) => candidate.score >= 35).sort((left, right) => right.score - left.score);
}

async function waitForResolvedElement(
  locator: SemanticLocator,
  signal: AbortSignal,
  timeoutMs = 5000,
  node?: WorkflowNode,
): Promise<ResolvedElement> {
  const startedAt = Date.now();
  let lastCandidates: Array<RepairCandidate & { element: HTMLElement }> = [];
  while (Date.now() - startedAt < timeoutMs) {
    signal.throwIfAborted();
    const direct = safeQuery(locator.fallbackSelector) ?? stableTarget(locator);
    if (direct) {
      const scored = scoreElement(direct, locator);
      if (scored.evidence.some((item) => item.category === 'ROLE_NAME' && item.points >= 25)) {
        return {
          element: direct,
          strategy: safeQuery(locator.fallbackSelector) === direct ? 'fallback-selector' : 'stable-attribute',
          score: scored.score,
          repaired: false,
          evidence: scored.evidence,
        };
      }
    }
    const candidates = rankedCandidates(locator);
    if (candidates.length > 0) lastCandidates = candidates;
    const best = candidates[0];
    const margin = best ? best.score - (candidates[1]?.score ?? 0) : 0;
    // Exact role/name and label agreement is strong enough to survive a DOM
    // redesign even when IDs and surrounding containers changed.
    if (best && best.score >= 70 && margin >= 20) {
      const fallback = safeQuery(locator.fallbackSelector);
      const repaired = fallback !== best.element;
      return {
        element: best.element,
        strategy: repaired ? 'semantic-auto-repair' : 'fallback-selector',
        score: best.score,
        repaired,
        nextLocator: repaired ? best.locator : undefined,
        evidence: best.evidence,
      };
    }
    if (best && best.score >= 65 && Date.now() - startedAt >= Math.min(800, timeoutMs / 2)) break;
    await wait(80, signal);
  }

  const viable = lastCandidates.filter((candidate) => candidate.score >= 65).slice(0, 3);
  throw new RepairRequiredError({
    nodeId: node?.id ?? 'unknown-node',
    nodeLabel: node?.label ?? locator.accessibleName ?? locator.label ?? locator.tagName,
    originalLocator: locator,
    candidates: viable.map(({ element: _element, ...candidate }) => candidate),
  });
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
    if (typeof parameterName !== 'string') {
      throw new Error(`Missing required workflow value for ${node.label}.`);
    }
    if (parameterName in input) return input[parameterName]!;
    if ('defaultValue' in node.config) return node.config.defaultValue!;
    throw new Error(`Missing required workflow value for ${node.label}.`);
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

function controlHasValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, expected: JsonValue): boolean {
  if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
    return element.checked === Boolean(expected);
  }
  if (element instanceof HTMLSelectElement) {
    const selected = element.selectedOptions[0];
    return normalized(element.value) === normalized(String(expected))
      || normalized(selected?.textContent) === normalized(String(expected));
  }
  return String(element.value) === String(expected);
}

function recordResolution(context: ExecutionContext, node: WorkflowNode, resolved: ResolvedElement): void {
  context.selectedLocators.push({ nodeId: node.id, strategy: resolved.strategy, score: resolved.score, repaired: resolved.repaired });
  if (resolved.repaired && resolved.nextLocator) {
    context.repairs.push({
      nodeId: node.id,
      previousLocator: locatorFromNode(node),
      nextLocator: resolved.nextLocator,
      score: resolved.score,
      evidence: resolved.evidence,
    });
  }
}

async function executeDomValueNode(node: WorkflowNode, context: ExecutionContext, signal: AbortSignal): Promise<void> {
  const locator = locatorFromNode(node);
  const resolved = await waitForResolvedElement(locator, signal, 5000, node);
  if (!(resolved.element instanceof HTMLInputElement || resolved.element instanceof HTMLTextAreaElement || resolved.element instanceof HTMLSelectElement)) {
    throw new Error(`${node.label} is no longer an editable control.`);
  }
  await focusTarget(resolved.element, signal);
  const value = valueForNode(node, context.input);
  setNativeValue(resolved.element, value);
  if (!controlHasValue(resolved.element, value)) {
    throw new Error(`${node.label} did not retain the requested value “${String(value)}”.`);
  }
  recordResolution(context, node, resolved);
  await settle(signal);
}

function expectedNavigationPath(node: WorkflowNode): string | undefined {
  const expected = node.config.expectedOutcome;
  if (typeof expected === 'string' && expected.startsWith('path-prefix:')) return expected.slice('path-prefix:'.length);
  if (typeof expected === 'string' && expected.startsWith('path:')) return expected.slice('path:'.length);
  return undefined;
}

function firstVisibleResultRow(locator: SemanticLocator): HTMLElement | undefined {
  const direct = safeQuery(locator.fallbackSelector);
  if (direct && (direct instanceof HTMLTableRowElement || direct.getAttribute('role') === 'row')) return direct;
  return [...document.querySelectorAll('tbody tr, [role="row"]')]
    .find((element): element is HTMLElement => !element.closest('thead') && isVisible(element));
}

function firstVisibleNavigationLink(path: string | undefined): HTMLAnchorElement | undefined {
  if (!path) return undefined;
  return [...document.querySelectorAll('a[href]')]
    .find((element): element is HTMLAnchorElement => {
      if (!(element instanceof HTMLAnchorElement) || !isVisible(element)) return false;
      try {
        return new URL(element.href, window.location.href).pathname.startsWith(path);
      } catch {
        return false;
      }
    });
}

async function executeOpenFirstMatchingResult(
  node: WorkflowNode,
  context: ExecutionContext,
  signal: AbortSignal,
): Promise<void> {
  const resultLocator = locatorFromNode(node);
  const expectedPath = expectedNavigationPath(node);
  const resultRow = firstVisibleResultRow(resultLocator);

  if (resultRow) {
    await focusTarget(resultRow, signal);
    resultRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    await settle(signal);
  }

  let openTarget: HTMLElement | undefined = firstVisibleNavigationLink(expectedPath);
  const configuredOpenLocator = node.config.openLocator;
  if (!openTarget && configuredOpenLocator && typeof configuredOpenLocator === 'object' && !Array.isArray(configuredOpenLocator)) {
    openTarget = (await waitForResolvedElement(configuredOpenLocator as unknown as SemanticLocator, signal, 1600, node)).element;
  }

  if (!openTarget) {
    throw new Error('No matching result is visible. Check the tool parameters or open the recorded results surface, then try again.');
  }

  await focusTarget(openTarget, signal);
  context.selectedLocators.push({
    nodeId: node.id,
    strategy: resultRow ? 'intent:first-result-then-open' : 'intent:first-result-link',
    score: 100,
    repaired: false,
  });

  if (openTarget instanceof HTMLAnchorElement && openTarget.href) {
    context.pendingNavigation = openTarget.href;
    return;
  }
  openTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  await settle(signal);
}

async function executeApplyFilters(
  node: WorkflowNode,
  context: ExecutionContext,
  signal: AbortSignal,
): Promise<void> {
  try {
    await executeActivationNode(node, context, signal, 900);
  } catch (error) {
    if (!(error instanceof RepairRequiredError) || error.request.candidates.length > 0) throw error;
    context.selectedLocators.push({
      nodeId: node.id,
      strategy: 'intent:controls-auto-applied',
      score: 100,
      repaired: false,
    });
  }
}

async function executeActivationNode(node: WorkflowNode, context: ExecutionContext, signal: AbortSignal, timeoutMs = 5000): Promise<void> {
  const locator = locatorFromNode(node);
  const resolved = await waitForResolvedElement(locator, signal, timeoutMs, node);
  await focusTarget(resolved.element, signal);
  recordResolution(context, node, resolved);
  if (resolved.element instanceof HTMLAnchorElement && resolved.element.href) {
    context.pendingNavigation = resolved.element.href;
    return;
  }
  resolved.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  await settle(signal);
}

function outcomeSatisfied(expected: string, context: ExecutionContext): boolean {
  if (expected === 'control-value-set' || expected === 'target-activated' || expected === 'form-submitted') return true;
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
  if (expected.startsWith('text-appears:')) {
    const text = normalized(expected.slice('text-appears:'.length));
    return Boolean(text && normalized(document.body.textContent).includes(text));
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

async function executeWaitNode(node: WorkflowNode, context: ExecutionContext, signal: AbortSignal): Promise<void> {
  const duration = typeof node.config.durationMs === 'number' ? Math.max(0, Math.min(node.config.durationMs, 10000)) : 250;
  if (node.config.locator) {
    const resolved = await waitForResolvedElement(locatorFromNode(node), signal, duration || 5000, node);
    recordResolution(context, node, resolved);
  } else {
    await wait(duration, signal);
  }
}

async function executeExtractNode(node: WorkflowNode, context: ExecutionContext, signal: AbortSignal): Promise<void> {
  const resolved = await waitForResolvedElement(locatorFromNode(node), signal, 5000, node);
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

function argumentsForNode(node: WorkflowNode, input: Record<string, JsonValue>): Record<string, JsonValue> {
  const configured = node.config.arguments;
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) return {};
  const result: Record<string, JsonValue> = {};
  for (const [name, raw] of Object.entries(configured)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const argument = raw as Record<string, JsonValue>;
    if (argument.mode === 'PARAMETER' && typeof argument.parameterName === 'string') {
      if (argument.parameterName in input) result[name] = input[argument.parameterName]!;
      else if ('value' in argument) result[name] = argument.value!;
      else throw new Error(`Missing composite parameter “${argument.parameterName}”.`);
    } else if ('value' in argument) {
      result[name] = argument.value!;
    }
  }
  return result;
}

export async function executePersonalToolOnPage(
  tool: PersonalToolRecord,
  input: Record<string, JsonValue>,
  invocationId: string,
  signal: AbortSignal,
  executeNativeTool?: NativeToolExecutor,
  requestHumanConfirmation?: HumanConfirmationExecutor,
  depth = 0,
): Promise<PersonalToolExecutionResult> {
  if (depth > 3) throw new Error('Personal capability nesting is limited to four levels.');
  const context: ExecutionContext = {
    input,
    output: {},
    selectedLocators: [],
    repairs: [],
    actionsCompleted: 0,
  };
  const visited = new Set<string>();
  let node = tool.workflowGraph.nodes.find((candidate) => candidate.id === tool.workflowGraph.entryNodeId);
  if (!node) throw new Error('The workflow entry node is missing.');

  while (node) {
    signal.throwIfAborted();
    if (visited.has(node.id)) throw new Error('The workflow contains a cycle that cannot be executed safely.');
    visited.add(node.id);

    if (node.type === 'NATIVE_TOOL') {
      if (!executeNativeTool) throw new Error('Native WebMCP execution is unavailable in this page context.');
      const toolName = node.config.toolName;
      if (typeof toolName !== 'string') throw new Error(`${node.label} has no native tool name.`);
      context.output[node.id] = await executeNativeTool(toolName, argumentsForNode(node, input), node.id, signal);
    } else if (node.type === 'PERSONAL_TOOL') {
      const parentNodeId = node.id;
      const embedded = node.config.tool;
      if (!embedded || typeof embedded !== 'object' || Array.isArray(embedded)) {
        throw new Error(`${node.label} is missing its saved personal capability.`);
      }
      const nestedResult = await executePersonalToolOnPage(
        embedded as unknown as PersonalToolRecord,
        argumentsForNode(node, input),
        `${invocationId}:${node.id}`,
        signal,
        executeNativeTool,
        requestHumanConfirmation,
        depth + 1,
      );
      context.output[node.id] = nestedResult.output;
      context.actionsCompleted += nestedResult.actionsCompleted;
      context.selectedLocators.push(...nestedResult.selectedLocators.map((receipt) => ({
        ...receipt,
        nodeId: `${parentNodeId}/${receipt.nodeId}`,
      })));
      if (nestedResult.navigationUrl) context.pendingNavigation = nestedResult.navigationUrl;
    } else if (node.type === 'DOM_INPUT' || node.type === 'DOM_SELECT') {
      await executeDomValueNode(node, context, signal);
    } else if (node.type === 'DOM_ACTIVATE') {
      if (node.config.intent === 'OPEN_FIRST_MATCHING_RESULT') {
        await executeOpenFirstMatchingResult(node, context, signal);
      } else if (node.config.intent === 'APPLY_FILTERS') {
        await executeApplyFilters(node, context, signal);
      } else {
        await executeActivationNode(node, context, signal);
      }
    } else if (node.type === 'WAIT_FOR') {
      await executeWaitNode(node, context, signal);
    } else if (node.type === 'EXTRACT') {
      await executeExtractNode(node, context, signal);
    } else if (node.type === 'ASSERT') {
      await executeAssertionNode(node, context, signal);
    } else if (node.type === 'HUMAN_CONFIRMATION') {
      if (!requestHumanConfirmation) throw new Error('Human confirmation is unavailable in this page context.');
      const summary = typeof node.config.summary === 'string'
        ? node.config.summary
        : 'Review the visible page before allowing this capability to continue.';
      await requestHumanConfirmation(node.label, summary, node.id, signal);
      context.output[node.id] = { approved: true };
    } else if (node.type === 'NAVIGATE') {
      if (!context.pendingNavigation) {
        const destination = node.config.destination;
        if (typeof destination !== 'string') throw new Error('The navigation destination is missing.');
        context.pendingNavigation = new URL(destination, window.location.href).href;
      }
    } else {
      throw new Error(`${node.type} execution is not available in this workflow yet.`);
    }

    context.actionsCompleted += 1;
    node = nextNode(node, tool);
  }

  signal.throwIfAborted();
  if (context.pendingNavigation && depth === 0) {
    const navigationUrl = context.pendingNavigation;
    window.setTimeout(() => {
      if (!signal.aborted) window.location.assign(navigationUrl);
    }, 900);
  }

  return {
    ok: true,
    invocationId,
    toolId: tool.id,
    toolName: tool.webmcpName,
    message: `Completed ${context.actionsCompleted} visible workflow steps.`,
    actionsCompleted: context.actionsCompleted,
    pageTitle: document.title,
    pageUrl: window.location.href,
    output: context.output,
    selectedLocators: context.selectedLocators,
    repairs: context.repairs,
    navigationUrl: context.pendingNavigation,
  };
}
