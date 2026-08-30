import {
  validatePersonalTool,
  type InteractionTrace,
  type JsonSchema,
  type JsonValue,
  type PersonalToolRecord,
  type RiskClass,
  type TraceStep,
  type WorkflowNode,
} from '@personal-webmcp/contracts';

export type CapturedValueMode = 'FIXED' | 'PARAMETER';

export interface StepCompilationChoice {
  stepId: string;
  include: boolean;
  valueMode?: CapturedValueMode;
  parameterName?: string;
  required?: boolean;
}

export interface TaughtToolDraftOptions {
  id?: string;
  webmcpName: string;
  title: string;
  description: string;
  pathPrefix: string;
  riskClass: RiskClass;
  inputSchema?: JsonSchema;
  now?: string;
}

export interface CompiledToolValidation {
  valid: boolean;
  errors: string[];
}

function normalizeParameterName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[0-9]/, 'value_$&') || 'value';
}

function targetText(step: TraceStep): string {
  const locator = step.locator;
  return [locator?.label, locator?.accessibleName, locator?.placeholder, locator?.nearbyText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function inferredParameterName(step: TraceStep): string {
  const text = targetText(step);
  if (text.includes('vendor') || text.includes('supplier')) return 'vendor';
  if (text.includes('minimum') || text.includes('amount')) return 'min_amount';
  if (text.includes('status')) return 'status';
  if (text.includes('sort')) return 'sort_order';
  return normalizeParameterName(step.locator?.label ?? step.locator?.accessibleName ?? step.type.toLowerCase());
}

function hasCapturedValue(step: TraceStep): boolean {
  return step.value !== undefined && ['INPUT', 'SELECT'].includes(step.type);
}

export function suggestStepCompilationChoice(step: TraceStep): StepCompilationChoice {
  const parameterName = inferredParameterName(step);
  const shouldExpose = parameterName === 'vendor' || parameterName === 'min_amount';
  return {
    stepId: step.id,
    include: step.type !== 'SKIPPED_SENSITIVE',
    valueMode: hasCapturedValue(step) && shouldExpose ? 'PARAMETER' : 'FIXED',
    parameterName: hasCapturedValue(step) ? parameterName : undefined,
    required: parameterName === 'vendor',
  };
}

export function suggestTaughtToolIdentity(trace: InteractionTrace) {
  const invoiceWorkflow = trace.path.startsWith('/legacy')
    || trace.steps.some((step) => targetText(step).includes('invoice'));

  if (invoiceWorkflow) {
    return {
      webmcpName: 'open_latest_unpaid_invoice',
      title: 'Open latest unpaid invoice',
      description: 'Find the newest unpaid invoice for a vendor above an optional minimum amount and open its detail page.',
      pathPrefix: '/legacy',
    };
  }

  return {
    webmcpName: 'personal_taught_workflow',
    title: 'Taught workflow',
    description: `Repeat the workflow taught on ${trace.pageTitle}.`,
    pathPrefix: trace.path || '/',
  };
}

function schemaForValue(value: JsonValue | undefined, description: string): JsonSchema {
  if (typeof value === 'number') return { type: 'number', minimum: 0, description };
  if (typeof value === 'boolean') return { type: 'boolean', description };
  return { type: 'string', minLength: 1, description };
}

function nodeTypeForStep(step: TraceStep): WorkflowNode['type'] {
  if (step.type === 'INPUT') return 'DOM_INPUT';
  if (step.type === 'SELECT') return 'DOM_SELECT';
  if (step.type === 'NAVIGATE') return 'NAVIGATE';
  return 'DOM_ACTIVATE';
}

function asJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function fixedInvoicePreferenceStep(
  trace: InteractionTrace,
  label: 'Status' | 'Sort by',
  value: string,
): TraceStep {
  return {
    id: `compiler-${label.toLowerCase().replaceAll(' ', '-')}`,
    type: 'SELECT',
    occurredAt: trace.finishedAt ?? new Date().toISOString(),
    value,
    locator: {
      role: 'combobox',
      accessibleName: label,
      label,
      tagName: 'select',
      stableAttributes: {},
      origin: trace.origin,
      path: trace.path,
      pageTitle: trace.pageTitle,
      expectedOutcome: 'control-value-set',
    },
  };
}

function addRequiredInvoicePreferences(trace: InteractionTrace, steps: TraceStep[], webmcpName: string): TraceStep[] {
  if (webmcpName !== 'open_latest_unpaid_invoice') return steps;
  const additions: TraceStep[] = [];
  if (!steps.some((step) => targetText(step).includes('status'))) {
    additions.push(fixedInvoicePreferenceStep(trace, 'Status', 'Unpaid'));
  }
  if (!steps.some((step) => targetText(step).includes('sort'))) {
    additions.push(fixedInvoicePreferenceStep(trace, 'Sort by', 'Newest first'));
  }
  if (additions.length === 0) return steps;
  const lastCapturedFilter = steps.reduce((lastIndex, step, index) => hasCapturedValue(step) ? index : lastIndex, -1);
  const firstActivation = steps.findIndex((step) => step.type === 'ACTIVATE' || step.type === 'SUBMIT' || step.type === 'NAVIGATE');
  const insertionIndex = lastCapturedFilter >= 0
    ? lastCapturedFilter + 1
    : firstActivation >= 0
      ? firstActivation + 1
      : steps.length;
  return [...steps.slice(0, insertionIndex), ...additions, ...steps.slice(insertionIndex)];
}

export function compileTaughtWorkflow(
  trace: InteractionTrace,
  choices: StepCompilationChoice[],
  options: TaughtToolDraftOptions,
): PersonalToolRecord {
  if (trace.status !== 'COMPLETED') throw new Error('Only a completed teaching trace can be compiled.');
  const now = options.now ?? new Date().toISOString();
  const choiceByStep = new Map(choices.map((choice) => [choice.stepId, choice]));
  const selectedSteps = trace.steps.filter((step) => choiceByStep.get(step.id)?.include && step.type !== 'SKIPPED_SENSITIVE');
  const capturedSteps = addRequiredInvoicePreferences(trace, selectedSteps, options.webmcpName);
  if (capturedSteps.length === 0) throw new Error('Keep at least one captured interaction.');

  const properties: Record<string, JsonSchema> = {};
  const required = new Set<string>();
  const nodes: WorkflowNode[] = capturedSteps.map((step, index) => {
    const choice = choiceByStep.get(step.id) ?? suggestStepCompilationChoice(step);
    const config: Record<string, JsonValue> = {
      action: step.type,
      occurredAt: step.occurredAt,
    };
    if (step.locator) config.locator = asJsonValue(step.locator);
    if (step.type === 'NAVIGATE' && step.value !== undefined) config.destination = asJsonValue(step.value);

    if (hasCapturedValue(step)) {
      if (choice.valueMode === 'PARAMETER') {
        const parameterName = normalizeParameterName(choice.parameterName ?? inferredParameterName(step));
        config.valueSource = 'PARAMETER';
        config.parameterName = parameterName;
        properties[parameterName] ??= schemaForValue(
          step.value,
          `Value for ${step.locator?.label ?? step.locator?.accessibleName ?? step.type.toLowerCase()}.`,
        );
        if (choice.required) required.add(parameterName);
      } else {
        config.valueSource = 'FIXED';
        config.value = asJsonValue(step.value);
      }
    }

    if (step.locator?.expectedOutcome) config.expectedOutcome = step.locator.expectedOutcome;
    return {
      id: `step-${index + 1}`,
      type: nodeTypeForStep(step),
      label: step.locator?.accessibleName || step.locator?.label || `${step.type.toLowerCase()} step ${index + 1}`,
      config,
    };
  });

  const finalExpectedOutcome = [...capturedSteps].reverse().find((step) => step.locator?.expectedOutcome)?.locator?.expectedOutcome;
  if (finalExpectedOutcome) {
    nodes.push({
      id: `step-${nodes.length + 1}`,
      type: 'ASSERT',
      label: 'Verify the taught workflow outcome',
      config: { assertion: 'OBSERVE_EXPECTED_OUTCOME', expectedOutcome: finalExpectedOutcome },
    });
  }

  const generatedSchema: JsonSchema = {
    type: 'object',
    properties,
    required: [...required],
    additionalProperties: false,
  };
  const inputSchema = options.inputSchema ?? generatedSchema;

  return {
    id: options.id ?? crypto.randomUUID(),
    version: 1,
    webmcpName: options.webmcpName.trim(),
    title: options.title.trim(),
    description: options.description.trim(),
    scope: {
      origin: trace.origin,
      pathRules: [{
        kind: options.webmcpName === 'open_latest_unpaid_invoice' ? 'EXACT' : 'PREFIX',
        value: options.pathPrefix || '/',
      }],
      prerequisites: ['document.modelContext'],
    },
    inputSchema,
    annotations: {
      readOnlyHint: options.riskClass === 'READ_ONLY',
      untrustedContentHint: false,
      riskClass: options.riskClass,
    },
    provenance: {
      type: 'TAUGHT',
      createdAt: now,
      nativeDependencies: [],
      repairHistory: [],
    },
    workflowGraph: {
      entryNodeId: nodes[0]!.id,
      nodes,
      edges: nodes.slice(1).map((node, index) => ({
        id: `edge-${index + 1}`,
        source: nodes[index]!.id,
        target: node.id,
      })),
    },
    health: { state: 'UNVERIFIED' },
    createdAt: now,
    updatedAt: now,
  };
}

export function validateCompiledTool(tool: PersonalToolRecord): CompiledToolValidation {
  const result = validatePersonalTool(tool);
  const errors = result.valid ? [] : [...result.errors];
  const schemaProperties = tool.inputSchema.properties;
  const propertyNames = schemaProperties && typeof schemaProperties === 'object' && !Array.isArray(schemaProperties)
    ? new Set(Object.keys(schemaProperties))
    : new Set<string>();

  if (tool.inputSchema.type !== 'object') errors.push('/inputSchema/type must be object');
  if (tool.inputSchema.additionalProperties !== false) errors.push('/inputSchema/additionalProperties must be false');

  for (const node of tool.workflowGraph.nodes) {
    if (node.config.valueSource !== 'PARAMETER') continue;
    const parameterName = node.config.parameterName;
    if (typeof parameterName !== 'string' || !propertyNames.has(parameterName)) {
      errors.push(`/workflowGraph/nodes/${node.id} references a missing input parameter`);
    }
  }

  return { valid: errors.length === 0, errors };
}
