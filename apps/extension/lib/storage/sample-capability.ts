import type {
  ActivityReceipt,
  InteractionTrace,
  PersonalToolRecord,
  ToolRevision,
} from '@personal-webmcp/contracts';

export const SYSTEM_PING_TOOL_ID = 'system-personal-ping';
export const SYSTEM_PING_TRACE_ID = 'system-personal-ping-bootstrap-trace';
export const SYSTEM_PING_REVISION_ID = 'system-personal-ping-revision-1';

export function createSystemPingTool(now = new Date().toISOString()): PersonalToolRecord {
  return {
    id: SYSTEM_PING_TOOL_ID,
    version: 1,
    webmcpName: 'personal_ping',
    title: 'PersonalWebMCP connection check',
    description: 'Confirms that PersonalWebMCP can register and execute a tool on the current visible page.',
    scope: {
      origin: 'http://localhost:3000',
      pathRules: [{ kind: 'PREFIX', value: '/' }],
      prerequisites: ['document.modelContext'],
    },
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false,
      riskClass: 'READ_ONLY',
    },
    provenance: {
      type: 'SYSTEM',
      createdAt: now,
      nativeDependencies: [],
      repairHistory: [],
    },
    workflowGraph: {
      entryNodeId: 'connection-assertion',
      nodes: [{
        id: 'connection-assertion',
        type: 'ASSERT',
        label: 'Confirm the page bridge is connected',
        config: { assertion: 'WEBMCP_BRIDGE_CONNECTED' },
      }],
      edges: [],
    },
    health: {
      state: 'HEALTHY',
      lastVerifiedAt: now,
      confidence: 100,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createSystemPingTrace(now = new Date().toISOString()): InteractionTrace {
  return {
    id: SYSTEM_PING_TRACE_ID,
    source: 'SYSTEM',
    origin: 'http://localhost:3000',
    path: '/',
    pageTitle: 'PersonalWebMCP — Teach the web once',
    startedAt: now,
    finishedAt: now,
    status: 'COMPLETED',
    steps: [],
  };
}

export function createSystemPingRevision(
  tool: PersonalToolRecord,
  now = tool.createdAt,
): ToolRevision {
  return {
    id: SYSTEM_PING_REVISION_ID,
    toolId: tool.id,
    toolVersion: tool.version,
    createdAt: now,
    reason: 'CREATED',
    snapshot: structuredClone(tool),
  };
}

export function createSystemPingReceipt(input: {
  ok: boolean;
  result?: string;
  error?: string;
  origin: string;
  startedAt: number;
  finishedAt?: number;
}): ActivityReceipt {
  const finishedAt = input.finishedAt ?? Date.now();
  return {
    id: crypto.randomUUID(),
    toolId: SYSTEM_PING_TOOL_ID,
    toolVersion: 1,
    origin: input.origin,
    startedAt: new Date(input.startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: Math.max(0, finishedAt - input.startedAt),
    status: input.ok ? 'SUCCEEDED' : 'FAILED',
    selectedLocators: [],
    result: input.result,
    error: input.error,
    humanDecision: 'NOT_REQUIRED',
  };
}
