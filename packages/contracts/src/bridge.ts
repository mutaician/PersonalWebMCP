export const BRIDGE_SOURCE = 'personal-webmcp' as const;
export const BRIDGE_VERSION = 1 as const;

export const BRIDGE_MESSAGE_TYPES = [
  'INITIALIZE',
  'REFRESH_CATALOG',
  'RUN_PING_SELF_TEST',
  'WITHDRAW_PING',
  'SYNC_PERSONAL_TOOLS',
  'PERSONAL_TOOL_RESULT',
  'STATUS',
  'CATALOG',
  'PING_RESULT',
  'PERSONAL_TOOL_INVOCATION',
  'PERSONAL_TOOL_CANCEL',
] as const;

export type BridgeCommandType = 'INITIALIZE' | 'REFRESH_CATALOG' | 'RUN_PING_SELF_TEST' | 'WITHDRAW_PING' | 'SYNC_PERSONAL_TOOLS' | 'PERSONAL_TOOL_RESULT';
export type BridgeEventType = 'STATUS' | 'CATALOG' | 'PING_RESULT' | 'PERSONAL_TOOL_INVOCATION' | 'PERSONAL_TOOL_CANCEL';

export interface PersonalToolRegistration {
  id: string;
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
}

export interface PersonalToolInvocationPayload {
  invocationId: string;
  toolId: string;
  input: Record<string, import('./models').JsonValue>;
}

export interface PersonalToolInvocationResultPayload {
  invocationId: string;
  ok: boolean;
  result?: import('./models').JsonValue;
  error?: string;
}

export interface BridgeEnvelope<TType extends string = string, TPayload = unknown> {
  source: typeof BRIDGE_SOURCE;
  version: typeof BRIDGE_VERSION;
  tabSessionId: string;
  requestId: string;
  type: TType;
  payload: TPayload;
}

export interface WebMcpStatusPayload {
  supported: boolean;
  registered: boolean;
  toolName?: string;
  pageTitle: string;
  url: string;
  error?: string;
}

export interface PingResultPayload {
  ok: boolean;
  result?: string;
  error?: string;
}

export type DiscoveredToolProvenance = 'NATIVE' | 'PERSONAL';

export interface DiscoveredToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface DiscoveredWebMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: DiscoveredToolAnnotations;
  origin: string;
  provenance: DiscoveredToolProvenance;
}

export interface ToolCatalogPayload {
  supported: boolean;
  pageTitle: string;
  url: string;
  tools: DiscoveredWebMcpTool[];
}

export interface TabCapabilityStatus extends WebMcpStatusPayload {
  tabId?: number;
  updatedAt: number;
}

export interface ActiveTabSnapshot {
  status: TabCapabilityStatus;
  catalog: ToolCatalogPayload;
  personalTools: import('./models').PersonalToolRecord[];
  receipts: import('./models').ActivityReceipt[];
  teachSession: import('./models').TeachSessionSnapshot;
  activeExecution?: import('./models').ToolExecutionState;
  enabled: boolean;
  origin?: string;
  path?: string;
}
