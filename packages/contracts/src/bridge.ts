export const BRIDGE_SOURCE = 'personal-webmcp' as const;
export const BRIDGE_VERSION = 1 as const;

export const BRIDGE_MESSAGE_TYPES = [
  'INITIALIZE',
  'RUN_PING_SELF_TEST',
  'WITHDRAW_PING',
  'STATUS',
  'PING_RESULT',
] as const;

export type BridgeCommandType = 'INITIALIZE' | 'RUN_PING_SELF_TEST' | 'WITHDRAW_PING';
export type BridgeEventType = 'STATUS' | 'PING_RESULT';

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

export interface TabCapabilityStatus extends WebMcpStatusPayload {
  tabId?: number;
  updatedAt: number;
}
