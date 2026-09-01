import {
  createIdleTeachSession,
  type InteractionTrace,
  type JsonValue,
  type SemanticLocator,
  type TeachSessionSnapshot,
  type TraceStep,
  type TraceStepType,
} from '@personal-webmcp/contracts';

type RecorderUpdate = (snapshot: TeachSessionSnapshot) => void;

const SENSITIVE_AUTOCOMPLETE = new Set([
  'cc-name', 'cc-given-name', 'cc-additional-name', 'cc-family-name', 'cc-number',
  'cc-exp', 'cc-exp-month', 'cc-exp-year', 'cc-csc', 'cc-type', 'current-password',
  'new-password', 'one-time-code',
]);
const SENSITIVE_TERMS = /\b(password|passcode|one[ -]?time|otp|verification|security code|card number|credit card|cvv|cvc|pin|secret|token)\b/i;
const ACTIONABLE_SELECTOR = 'button, a, summary, [role="button"], [role="link"], [role="menuitem"], tr';

function normalizeText(value: string | null | undefined, limit = 160): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, limit) : undefined;
}

function associatedLabel(element: Element): string | undefined {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const explicit = element.labels?.[0];
    if (explicit) {
      const copy = explicit.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('input, select, textarea, button').forEach((control) => control.remove());
      const text = normalizeText(copy.textContent)?.replace(/\s*:\s*$/, '');
      if (text) return text;
    }
  }
  const wrappingLabel = element.closest('label');
  return normalizeText(wrappingLabel?.textContent);
}

function accessibleName(element: Element): string | undefined {
  const ariaLabel = normalizeText(element.getAttribute('aria-label'));
  if (ariaLabel) return ariaLabel;
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = normalizeText(labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' '));
    if (text) return text;
  }
  const label = associatedLabel(element);
  if (label) return label;
  if (element instanceof HTMLImageElement) return normalizeText(element.alt);
  return normalizeText(element.getAttribute('title') || element.textContent, 100);
}

function inferRole(element: Element): string | undefined {
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

function nearestLandmark(element: Element): string | undefined {
  const landmark = element.closest('main, nav, aside, header, footer, form, section, [role="main"], [role="navigation"], [role="region"], [role="form"]');
  if (!landmark) return undefined;
  return normalizeText(
    landmark.getAttribute('aria-label')
      || landmark.getAttribute('role')
      || landmark.tagName.toLowerCase(),
    80,
  );
}

function escaped(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

function cssPath(element: Element, depth = 5): string {
  if (element.id) return `#${escaped(element.id)}`;
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement && segments.length < depth) {
    let segment = current.tagName.toLowerCase();
    const name = current.getAttribute('name');
    if (name) {
      segment += `[name="${escaped(name)}"]`;
      segments.unshift(segment);
      break;
    }
    const siblings = current.parentElement
      ? [...current.parentElement.children].filter((child) => child.tagName === current!.tagName)
      : [];
    if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    segments.unshift(segment);
    current = current.parentElement;
  }
  return segments.join(' > ');
}

function stableAttributes(element: Element): Record<string, string> {
  const stable: Record<string, string> = {};
  for (const name of ['id', 'name', 'data-testid', 'data-test', 'data-qa', 'data-id']) {
    const value = element.getAttribute(name);
    if (value && value.length <= 100 && !SENSITIVE_TERMS.test(`${name} ${value}`)) stable[name] = value;
  }
  return stable;
}

function navigationOutcome(destination: string): string {
  const target = new URL(destination, window.location.href);
  const finalSegment = target.pathname.split('/').filter(Boolean).at(-1) ?? '';
  if (target.origin === window.location.origin && /\d/.test(finalSegment)) {
    return `path-prefix:${target.pathname.slice(0, target.pathname.lastIndexOf('/') + 1)}`;
  }
  return target.origin === window.location.origin ? `path:${target.pathname}` : `url:${target.href}`;
}

function expectedOutcome(element: Element, stepType: TraceStepType): string {
  if (element instanceof HTMLAnchorElement && element.href) {
    try {
      return navigationOutcome(element.href);
    } catch {
      // Fall through to the interaction-level outcome.
    }
  }
  if (stepType === 'INPUT' || stepType === 'SELECT') return 'control-value-set';
  if (stepType === 'SUBMIT') return 'form-submitted';
  return 'target-activated';
}

export function createSemanticLocator(element: Element, stepType: TraceStepType): SemanticLocator {
  const label = associatedLabel(element);
  const form = element.closest('form');
  const parentText = normalizeText(element.parentElement?.textContent, 180);
  const inputType = element instanceof HTMLInputElement ? element.type : undefined;
  const placeholder = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? normalizeText(element.placeholder)
    : undefined;
  return {
    role: inferRole(element),
    accessibleName: accessibleName(element),
    label,
    placeholder,
    tagName: element.tagName.toLowerCase(),
    inputType,
    formName: form ? normalizeText(form.getAttribute('aria-label') || form.getAttribute('name') || form.id || 'form') : undefined,
    landmark: nearestLandmark(element),
    nearbyText: parentText,
    stableAttributes: stableAttributes(element),
    fallbackSelector: cssPath(element),
    domPath: cssPath(element, 8),
    origin: window.location.origin,
    path: `${window.location.pathname}${window.location.search}`,
    pageTitle: document.title,
    expectedOutcome: expectedOutcome(element, stepType),
  };
}

function isSensitiveControl(element: Element): boolean {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
  if (element instanceof HTMLInputElement && ['password', 'hidden'].includes(element.type)) return true;
  const autocomplete = element.getAttribute('autocomplete')?.toLowerCase().split(/\s+/) ?? [];
  if (autocomplete.some((token) => SENSITIVE_AUTOCOMPLETE.has(token))) return true;
  const identifyingText = [
    element.id,
    element.getAttribute('name'),
    element.getAttribute('aria-label'),
    element.getAttribute('placeholder'),
    associatedLabel(element),
  ].filter(Boolean).join(' ');
  return SENSITIVE_TERMS.test(identifyingText);
}

function capturedValue(element: Element): JsonValue | undefined {
  if (element instanceof HTMLSelectElement) return element.value;
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio') return element.checked;
    if (element.type === 'number' || element.type === 'range') {
      const number = Number(element.value);
      return Number.isFinite(number) ? number : element.value;
    }
    return element.value;
  }
  if (element instanceof HTMLTextAreaElement) return element.value;
  return undefined;
}

export class InteractionRecorder {
  private state: TeachSessionSnapshot = createIdleTeachSession();
  private overlays = new Map<string, { element: Element; marker: HTMLDivElement }>();
  private valueStepByElement = new WeakMap<Element, string>();
  private skippedElements = new WeakSet<Element>();
  private readonly onInput = (event: Event) => this.captureValueEvent(event);
  private readonly onChange = (event: Event) => this.captureValueEvent(event);
  private readonly onClick = (event: Event) => this.captureActivation(event);
  private readonly onSubmit = (event: Event) => this.captureSubmit(event);
  private readonly reposition = () => this.repositionOverlays();

  constructor(private readonly onUpdate: RecorderUpdate) {
    document.addEventListener('input', this.onInput, true);
    document.addEventListener('change', this.onChange, true);
    document.addEventListener('click', this.onClick, true);
    document.addEventListener('submit', this.onSubmit, true);
    window.addEventListener('scroll', this.reposition, true);
    window.addEventListener('resize', this.reposition);
  }

  getSnapshot(): TeachSessionSnapshot {
    return structuredClone(this.state);
  }

  restore(snapshot: TeachSessionSnapshot): TeachSessionSnapshot {
    this.clearOverlays();
    this.state = structuredClone(snapshot);
    this.valueStepByElement = new WeakMap();
    this.skippedElements = new WeakSet();
    return this.publish();
  }

  start(): TeachSessionSnapshot {
    this.clearOverlays();
    this.valueStepByElement = new WeakMap();
    this.skippedElements = new WeakSet();
    const now = new Date().toISOString();
    this.state = {
      state: 'RECORDING',
      sensitiveSkipCount: 0,
      updatedAt: now,
      trace: {
        id: crypto.randomUUID(),
        source: 'TEACH',
        origin: window.location.origin,
        path: `${window.location.pathname}${window.location.search}`,
        pageTitle: document.title,
        startedAt: now,
        status: 'RECORDING',
        steps: [],
      },
    };
    return this.publish();
  }

  pause(): TeachSessionSnapshot {
    if (this.state.state !== 'RECORDING' || !this.state.trace) return this.getSnapshot();
    this.state = { ...this.state, state: 'PAUSED', trace: { ...this.state.trace, status: 'PAUSED' } };
    return this.publish();
  }

  resume(): TeachSessionSnapshot {
    if (this.state.state !== 'PAUSED' || !this.state.trace) return this.getSnapshot();
    this.state = { ...this.state, state: 'RECORDING', trace: { ...this.state.trace, status: 'RECORDING' } };
    return this.publish();
  }

  finish(): TeachSessionSnapshot {
    if (!this.state.trace || !['RECORDING', 'PAUSED'].includes(this.state.state)) return this.getSnapshot();
    const finishedAt = new Date().toISOString();
    this.state = {
      ...this.state,
      state: 'REVIEW',
      updatedAt: finishedAt,
      trace: { ...this.state.trace, status: 'COMPLETED', finishedAt },
    };
    this.clearOverlays();
    return this.publish();
  }

  cancel(): TeachSessionSnapshot {
    const cancelled = this.state.trace ? {
      ...this.state.trace,
      status: 'CANCELLED' as const,
      finishedAt: new Date().toISOString(),
    } : undefined;
    this.clearOverlays();
    this.state = createIdleTeachSession();
    this.publish();
    return cancelled ? { ...this.state, trace: cancelled } : this.getSnapshot();
  }

  reset(): TeachSessionSnapshot {
    this.clearOverlays();
    this.valueStepByElement = new WeakMap();
    this.skippedElements = new WeakSet();
    this.state = createIdleTeachSession();
    return this.publish();
  }

  recordNavigation(previousUrl: string, nextUrl: string): void {
    if (this.state.state !== 'RECORDING' || !this.state.trace) return;
    const step: TraceStep = {
      id: crypto.randomUUID(),
      type: 'NAVIGATE',
      occurredAt: new Date().toISOString(),
      value: nextUrl,
      locator: {
        tagName: 'document',
        stableAttributes: {},
        origin: window.location.origin,
        path: `${window.location.pathname}${window.location.search}`,
        pageTitle: document.title,
        nearbyText: `Navigated from ${previousUrl}`,
        expectedOutcome: navigationOutcome(nextUrl),
      },
    };
    this.appendStep(step);
  }

  dispose(): void {
    document.removeEventListener('input', this.onInput, true);
    document.removeEventListener('change', this.onChange, true);
    document.removeEventListener('click', this.onClick, true);
    document.removeEventListener('submit', this.onSubmit, true);
    window.removeEventListener('scroll', this.reposition, true);
    window.removeEventListener('resize', this.reposition);
    this.clearOverlays();
  }

  private captureValueEvent(event: Event): void {
    if (this.state.state !== 'RECORDING' || !this.state.trace) return;
    const element = event.target;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return;
    if (element.closest('[data-personal-webmcp-overlay]')) return;
    if (isSensitiveControl(element)) {
      this.captureSensitiveSkip(element);
      return;
    }

    const type: TraceStepType = element instanceof HTMLSelectElement ? 'SELECT' : 'INPUT';
    const existingId = this.valueStepByElement.get(element);
    if (existingId) {
      const index = this.state.trace.steps.findIndex((step) => step.id === existingId);
      if (index >= 0) {
        const steps = [...this.state.trace.steps];
        steps[index] = {
          ...steps[index]!,
          occurredAt: new Date().toISOString(),
          locator: createSemanticLocator(element, type),
          value: capturedValue(element),
        };
        this.state = { ...this.state, trace: { ...this.state.trace, steps } };
        this.addOrUpdateOverlay(existingId, element, index + 1);
        this.publish();
        return;
      }
    }

    const step: TraceStep = {
      id: crypto.randomUUID(),
      type,
      occurredAt: new Date().toISOString(),
      locator: createSemanticLocator(element, type),
      value: capturedValue(element),
    };
    this.valueStepByElement.set(element, step.id);
    this.appendStep(step, element);
  }

  private captureActivation(event: Event): void {
    if (this.state.state !== 'RECORDING' || !this.state.trace) return;
    const eventTarget = event.target;
    if (!(eventTarget instanceof Element) || eventTarget.closest('[data-personal-webmcp-overlay]')) return;
    if (eventTarget.closest('input, select, textarea, label')) return;
    const element = eventTarget.closest(ACTIONABLE_SELECTOR);
    if (!element) return;
    this.appendStep({
      id: crypto.randomUUID(),
      type: 'ACTIVATE',
      occurredAt: new Date().toISOString(),
      locator: createSemanticLocator(element, 'ACTIVATE'),
    }, element);
  }

  private captureSubmit(event: Event): void {
    if (this.state.state !== 'RECORDING' || !this.state.trace) return;
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const submitter = event instanceof SubmitEvent && event.submitter instanceof Element ? event.submitter : form;
    this.appendStep({
      id: crypto.randomUUID(),
      type: 'SUBMIT',
      occurredAt: new Date().toISOString(),
      locator: createSemanticLocator(submitter, 'SUBMIT'),
    }, submitter);
  }

  private captureSensitiveSkip(element: Element): void {
    if (this.skippedElements.has(element) || !this.state.trace) return;
    this.skippedElements.add(element);
    const step: TraceStep = {
      id: crypto.randomUUID(),
      type: 'SKIPPED_SENSITIVE',
      occurredAt: new Date().toISOString(),
      skippedReason: 'Sensitive control excluded by policy.',
    };
    this.state = { ...this.state, sensitiveSkipCount: this.state.sensitiveSkipCount + 1 };
    this.appendStep(step);
  }

  private appendStep(step: TraceStep, element?: Element): void {
    if (!this.state.trace) return;
    const steps = [...this.state.trace.steps, step];
    this.state = { ...this.state, trace: { ...this.state.trace, steps } };
    if (element) this.addOrUpdateOverlay(step.id, element, steps.length);
    this.publish();
  }

  private publish(): TeachSessionSnapshot {
    this.state = { ...this.state, updatedAt: new Date().toISOString() };
    const snapshot = this.getSnapshot();
    this.onUpdate(snapshot);
    return snapshot;
  }

  private addOrUpdateOverlay(stepId: string, element: Element, number: number): void {
    let overlay = this.overlays.get(stepId);
    if (!overlay) {
      const marker = document.createElement('div');
      marker.dataset.personalWebmcpOverlay = 'true';
      marker.style.cssText = 'position:absolute;pointer-events:none;z-index:2147483647;border:2px solid #ed6b32;border-radius:4px;box-shadow:0 0 0 2px rgba(255,255,255,.8);font:700 11px/1 system-ui;color:white;';
      document.documentElement.append(marker);
      overlay = { element, marker };
      this.overlays.set(stepId, overlay);
    }
    overlay.marker.textContent = String(number);
    this.positionOverlay(overlay.element, overlay.marker);
  }

  private positionOverlay(element: Element, marker: HTMLDivElement): void {
    const rect = element.getBoundingClientRect();
    marker.style.left = `${Math.max(0, rect.left + window.scrollX)}px`;
    marker.style.top = `${Math.max(0, rect.top + window.scrollY)}px`;
    marker.style.width = `${Math.max(12, rect.width)}px`;
    marker.style.height = `${Math.max(12, rect.height)}px`;
    marker.style.padding = '2px';
  }

  private repositionOverlays(): void {
    for (const { element, marker } of this.overlays.values()) this.positionOverlay(element, marker);
  }

  private clearOverlays(): void {
    for (const { marker } of this.overlays.values()) marker.remove();
    this.overlays.clear();
  }
}
