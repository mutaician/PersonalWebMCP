import type { SemanticLocator, TraceStep } from '@personal-webmcp/contracts';

export type TaughtInteractionIntent = 'APPLY_FILTERS' | 'OPEN_FIRST_MATCHING_RESULT';

export interface NormalizedTaughtStep {
  step: TraceStep;
  sourceStepIds: string[];
  intent?: TaughtInteractionIntent;
  openLocator?: SemanticLocator;
}

const RECORD_ID = /\b[A-Z]{2,12}-\d{2,}(?=[A-Z]|\b)/gi;
const CURRENCY = /(?:[$€£¥]|\b(?:USD|EUR|GBP|KES|JPY)\b)\s*\d[\d,.]*(?:\s?[kKmM])?/gi;
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
const CLOCK_TIME = /\b\d{1,2}:\d{2}(?:\s?[ap]m)?\b/gi;

/**
 * Removes values that commonly change while preserving the action words that
 * identify a control. The raw recording remains untouched for review.
 */
export function stableSemanticText(value: string | null | undefined): string | undefined {
  const stable = value
    ?.replace(CURRENCY, ' ')
    .replace(RECORD_ID, ' ')
    .replace(ISO_DATE, ' ')
    .replace(CLOCK_TIME, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[·|–—,:;/-]+\s*$/g, '')
    .trim();
  return stable || undefined;
}

export function normalizeSemanticLocator(locator: SemanticLocator): SemanticLocator {
  return {
    ...locator,
    accessibleName: stableSemanticText(locator.accessibleName),
    label: stableSemanticText(locator.label),
    placeholder: stableSemanticText(locator.placeholder),
    formName: stableSemanticText(locator.formName),
    landmark: stableSemanticText(locator.landmark),
    nearbyText: stableSemanticText(locator.nearbyText),
  };
}

function isResultRow(step: TraceStep): boolean {
  return step.type === 'ACTIVATE'
    && (step.locator?.role === 'row' || step.locator?.tagName === 'tr');
}

function isNavigationActivation(step: TraceStep | undefined): boolean {
  if (!step || step.type !== 'ACTIVATE') return false;
  return step.locator?.role === 'link'
    || step.locator?.tagName === 'a'
    || Boolean(step.locator?.expectedOutcome?.startsWith('path'))
    || Boolean(step.locator?.expectedOutcome?.startsWith('url:'));
}

function isFilterCommit(step: TraceStep): boolean {
  if (step.type !== 'ACTIVATE' || !['button', 'input'].includes(step.locator?.tagName ?? '')) return false;
  const name = stableSemanticText(step.locator?.accessibleName ?? step.locator?.label)?.toLowerCase() ?? '';
  return /\b(run query|search|apply(?: filters?)?|filter|show results?)\b/.test(name);
}

function navigationOutcome(step: TraceStep | undefined): string | undefined {
  const outcome = step?.locator?.expectedOutcome;
  return outcome?.startsWith('path') || outcome?.startsWith('url:') ? outcome : undefined;
}

function withOutcome(step: TraceStep, expectedOutcome: string | undefined): TraceStep {
  if (!step.locator) return step;
  return {
    ...step,
    locator: normalizeSemanticLocator({
      ...step.locator,
      expectedOutcome: expectedOutcome ?? step.locator.expectedOutcome,
    }),
  };
}

/**
 * Lowers raw browser events into stable task-level interactions. This is kept
 * deliberately small: only patterns with strong evidence are inferred.
 */
export function normalizeTaughtSteps(steps: TraceStep[]): NormalizedTaughtStep[] {
  const normalized: NormalizedTaughtStep[] = [];

  for (let index = 0; index < steps.length; index += 1) {
    const current = steps[index]!;
    const next = steps[index + 1];
    const afterNext = steps[index + 2];

    if (isResultRow(current) && isNavigationActivation(next)) {
      const expectedOutcome = navigationOutcome(afterNext) ?? navigationOutcome(next);
      normalized.push({
        step: withOutcome(current, expectedOutcome),
        sourceStepIds: [current.id, next!.id, ...(afterNext?.type === 'NAVIGATE' ? [afterNext.id] : [])],
        intent: 'OPEN_FIRST_MATCHING_RESULT',
        openLocator: next?.locator ? normalizeSemanticLocator(next.locator) : undefined,
      });
      index += afterNext?.type === 'NAVIGATE' ? 2 : 1;
      continue;
    }

    if (isFilterCommit(current)) {
      normalized.push({
        step: current.locator
          ? { ...current, locator: normalizeSemanticLocator(current.locator) }
          : current,
        sourceStepIds: [current.id],
        intent: 'APPLY_FILTERS',
      });
      continue;
    }

    if (current.type === 'NAVIGATE' && normalized.length > 0) {
      const previous = normalized.at(-1)!;
      const expectedOutcome = navigationOutcome(current);
      if (expectedOutcome && previous.step.type === 'ACTIVATE') {
        previous.step = withOutcome(previous.step, expectedOutcome);
        previous.sourceStepIds.push(current.id);
        continue;
      }
    }

    normalized.push({
      step: current.locator
        ? { ...current, locator: normalizeSemanticLocator(current.locator) }
        : current,
      sourceStepIds: [current.id],
    });
  }

  return normalized;
}
