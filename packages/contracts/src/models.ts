export const STORAGE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_RECEIPT_LIMIT = 100;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonSchema = Record<string, unknown>;

export type WorkflowNodeType =
  | 'NATIVE_TOOL'
  | 'DOM_INPUT'
  | 'DOM_SELECT'
  | 'DOM_ACTIVATE'
  | 'NAVIGATE'
  | 'WAIT_FOR'
  | 'EXTRACT'
  | 'ASSERT'
  | 'BRANCH'
  | 'PERSONAL_TOOL'
  | 'HUMAN_CONFIRMATION';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  config: Record<string, JsonValue>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
}

export interface WorkflowGraph {
  entryNodeId: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export type PathRuleKind = 'EXACT' | 'PREFIX' | 'PATTERN';

export interface PathRule {
  kind: PathRuleKind;
  value: string;
}

export interface ToolScope {
  origin: string;
  pathRules: PathRule[];
  prerequisites: string[];
}

export type RiskClass = 'READ_ONLY' | 'REVERSIBLE_WRITE' | 'CONSEQUENTIAL';

export interface PersonalToolAnnotations {
  readOnlyHint: boolean;
  untrustedContentHint: boolean;
  riskClass: RiskClass;
}

export type ProvenanceType = 'SYSTEM' | 'TAUGHT' | 'COMPOSITE' | 'REPAIRED';

export interface ToolProvenance {
  type: ProvenanceType;
  createdAt: string;
  nativeDependencies: string[];
  repairHistory: string[];
}

export type ToolHealthState = 'UNVERIFIED' | 'HEALTHY' | 'NEEDS_REVIEW' | 'BROKEN';

export interface ToolHealth {
  state: ToolHealthState;
  lastVerifiedAt?: string;
  confidence?: number;
}

export interface PersonalToolRecord {
  id: string;
  version: number;
  webmcpName: string;
  title: string;
  description: string;
  scope: ToolScope;
  inputSchema: JsonSchema;
  annotations: PersonalToolAnnotations;
  provenance: ToolProvenance;
  workflowGraph: WorkflowGraph;
  health: ToolHealth;
  createdAt: string;
  updatedAt: string;
}

export interface SemanticLocator {
  role?: string;
  accessibleName?: string;
  label?: string;
  placeholder?: string;
  tagName: string;
  inputType?: string;
  formName?: string;
  landmark?: string;
  nearbyText?: string;
  stableAttributes: Record<string, string>;
  fallbackSelector?: string;
  domPath?: string;
  origin: string;
  path: string;
  pageTitle: string;
  expectedOutcome?: string;
}

export type TraceSource = 'SYSTEM' | 'TEACH';
export type TraceStatus = 'RECORDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type TraceStepType = 'INPUT' | 'SELECT' | 'ACTIVATE' | 'SUBMIT' | 'NAVIGATE' | 'SKIPPED_SENSITIVE';

export interface TraceStep {
  id: string;
  type: TraceStepType;
  occurredAt: string;
  locator?: SemanticLocator;
  value?: JsonValue;
  skippedReason?: string;
}

export interface InteractionTrace {
  id: string;
  source: TraceSource;
  origin: string;
  path: string;
  pageTitle: string;
  startedAt: string;
  finishedAt?: string;
  status: TraceStatus;
  steps: TraceStep[];
}

export type TeachRecorderState = 'IDLE' | 'RECORDING' | 'PAUSED' | 'REVIEW';

export interface TeachSessionSnapshot {
  state: TeachRecorderState;
  trace?: InteractionTrace;
  sensitiveSkipCount: number;
  updatedAt: string;
}

export function createIdleTeachSession(now = new Date().toISOString()): TeachSessionSnapshot {
  return {
    state: 'IDLE',
    sensitiveSkipCount: 0,
    updatedAt: now,
  };
}

export type RevisionReason = 'CREATED' | 'EDITED' | 'AUTO_REPAIR' | 'APPROVED_REPAIR' | 'RESTORED';

export interface ToolRevision {
  id: string;
  toolId: string;
  toolVersion: number;
  createdAt: string;
  reason: RevisionReason;
  snapshot: PersonalToolRecord;
}

export type ReceiptStatus = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'AWAITING_CONFIRMATION';
export type HumanDecision = 'NOT_REQUIRED' | 'APPROVED' | 'REJECTED';

export interface LocatorReceipt {
  nodeId: string;
  strategy: string;
  score?: number;
  repaired: boolean;
}

export interface ActivityReceipt {
  id: string;
  toolId: string;
  toolVersion: number;
  origin: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: ReceiptStatus;
  inputSummary?: Record<string, JsonValue>;
  selectedLocators: LocatorReceipt[];
  result?: JsonValue;
  error?: string;
  humanDecision: HumanDecision;
}

export interface ExtensionSettings {
  enabledOrigins: string[];
  receiptLimit: number;
  developerMode: boolean;
}

export interface ToolRegistryState {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  updatedAt: string;
  tools: Record<string, PersonalToolRecord>;
}

export interface SettingsState {
  schemaVersion: typeof STORAGE_SCHEMA_VERSION;
  updatedAt: string;
  settings: ExtensionSettings;
}

export function createEmptyRegistryState(now = new Date().toISOString()): ToolRegistryState {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    updatedAt: now,
    tools: {},
  };
}

export function createDefaultSettingsState(now = new Date().toISOString()): SettingsState {
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    updatedAt: now,
    settings: {
      enabledOrigins: [],
      receiptLimit: DEFAULT_RECEIPT_LIMIT,
      developerMode: false,
    },
  };
}
