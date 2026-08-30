export const BRIDGE_SOURCE = 'personal-webmcp' as const;
export const BRIDGE_VERSION = 1 as const;

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

export function isBridgeEnvelope(value: unknown): value is BridgeEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.source === BRIDGE_SOURCE &&
    candidate.version === BRIDGE_VERSION &&
    typeof candidate.tabSessionId === 'string' &&
    candidate.tabSessionId.length > 0 &&
    typeof candidate.requestId === 'string' &&
    candidate.requestId.length > 0 &&
    typeof candidate.type === 'string'
  );
}
