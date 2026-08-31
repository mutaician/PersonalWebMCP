import type {
  DiscoveredWebMcpTool,
  JsonValue,
  PersonalToolRegistration,
} from '@personal-webmcp/contracts';

const PERSONAL_PING_TOOL_NAME = 'personal_ping';
const registeredPersonalToolNames = new Set<string>([PERSONAL_PING_TOOL_NAME]);

export interface PingToolResult {
  ok: true;
  pageTitle: string;
  url: string;
  message: string;
}

interface RegisteredToolLike {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  origin?: string;
}

interface ModelContextLike extends EventTarget {
  registerTool: (
    tool: {
      name: string;
      title?: string;
      description: string;
      inputSchema: Record<string, unknown>;
      annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
      execute: (input: object, options?: { signal?: AbortSignal }) => Promise<unknown>;
    },
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
  getTools: () => Promise<RegisteredToolLike[]>;
  executeTool: (
    tool: RegisteredToolLike,
    input?: Record<string, unknown> | string,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
}

let executionInputMode: 'object' | 'json-string' | undefined;

function getModelContext(): ModelContextLike | undefined {
  return (document as Document & { modelContext?: ModelContextLike }).modelContext;
}

export function isWebMcpSupported(): boolean {
  return typeof getModelContext()?.registerTool === 'function';
}

function cloneSerializableRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export async function discoverWebMcpTools(): Promise<DiscoveredWebMcpTool[]> {
  const modelContext = getModelContext();
  if (!modelContext) return [];

  const tools = await modelContext.getTools();
  return tools.map((tool): DiscoveredWebMcpTool => ({
    name: tool.name,
    title: tool.title || tool.name,
    description: tool.description || 'No description provided.',
    inputSchema: cloneSerializableRecord(tool.inputSchema),
    annotations: tool.annotations ? {
      readOnlyHint: tool.annotations.readOnlyHint,
      untrustedContentHint: tool.annotations.untrustedContentHint,
    } : undefined,
    origin: tool.origin || window.location.origin,
    provenance: registeredPersonalToolNames.has(tool.name) || tool.name.startsWith('personal_') ? 'PERSONAL' : 'NATIVE',
  })).sort((left, right) => left.name.localeCompare(right.name));
}

export function watchWebMcpToolChanges(listener: () => void): () => void {
  const modelContext = getModelContext();
  if (!modelContext) return () => undefined;
  modelContext.addEventListener('toolchange', listener);
  return () => modelContext.removeEventListener('toolchange', listener);
}

export async function registerPersonalPing(signal: AbortSignal): Promise<boolean> {
  const modelContext = getModelContext();
  if (!modelContext) return false;

  await modelContext.registerTool(
    {
      name: PERSONAL_PING_TOOL_NAME,
      title: 'PersonalWebMCP connection check',
      description: 'Confirms that PersonalWebMCP can register and execute a tool on the current visible page.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
      execute: async (_input, options) => {
        options?.signal?.throwIfAborted();
        return {
          ok: true,
          pageTitle: document.title,
          url: window.location.href,
          message: 'PersonalWebMCP is connected to the visible page.',
        } satisfies PingToolResult;
      },
    },
    { signal },
  );

  return true;
}

function normalizeInvocationInput(input: unknown): Record<string, JsonValue> {
  if (typeof input === 'string') {
    try {
      return normalizeInvocationInput(JSON.parse(input));
    } catch {
      throw new Error('Tool input must be a valid JSON object.');
    }
  }
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Tool input must be an object.');
  }
  return cloneSerializableRecord(input) as Record<string, JsonValue>;
}

export async function registerPersonalTool(
  registration: PersonalToolRegistration,
  execute: (input: Record<string, JsonValue>, signal?: AbortSignal) => Promise<JsonValue>,
  signal: AbortSignal,
): Promise<boolean> {
  const modelContext = getModelContext();
  if (!modelContext) return false;

  await modelContext.registerTool({
    name: registration.name,
    title: registration.title,
    description: registration.description,
    inputSchema: registration.inputSchema,
    annotations: registration.annotations,
    execute: async (input, options) => {
      options?.signal?.throwIfAborted();
      return execute(normalizeInvocationInput(input), options?.signal);
    },
  }, { signal });
  registeredPersonalToolNames.add(registration.name);
  signal.addEventListener('abort', () => registeredPersonalToolNames.delete(registration.name), { once: true });

  return true;
}

export async function executePersonalPing(signal?: AbortSignal): Promise<unknown> {
  const modelContext = getModelContext();
  if (!modelContext) throw new Error('WebMCP is unavailable on this page.');

  const tools = await modelContext.getTools();
  const tool = tools.find((candidate) => candidate.name === PERSONAL_PING_TOOL_NAME);
  if (!tool) throw new Error(`${PERSONAL_PING_TOOL_NAME} is not registered.`);

  const options = signal ? { signal } : undefined;
  if (executionInputMode === 'json-string') {
    return modelContext.executeTool(tool, '{}', options);
  }

  try {
    const result = await modelContext.executeTool(tool, {}, options);
    executionInputMode = 'object';
    return result;
  } catch (objectInputError) {
    if (executionInputMode === 'object') throw objectInputError;

    // The connection check is deliberately read-only, so it is safe to probe
    // the older Chrome JSON-string input shape once for this page session.
    try {
      const result = await modelContext.executeTool(tool, '{}', options);
      executionInputMode = 'json-string';
      return result;
    } catch {
      throw objectInputError;
    }
  }
}

export async function executeWebMcpTool(
  toolName: string,
  input: Record<string, JsonValue>,
  signal?: AbortSignal,
): Promise<unknown> {
  const modelContext = getModelContext();
  if (!modelContext) throw new Error('WebMCP is unavailable on this page.');
  if (executionInputMode === undefined && toolName !== PERSONAL_PING_TOOL_NAME) {
    await executePersonalPing(signal);
  }
  const tools = await modelContext.getTools();
  const tool = tools.find((candidate) => candidate.name === toolName);
  if (!tool) throw new Error(`Native WebMCP tool “${toolName}” is not registered.`);
  return modelContext.executeTool(
    tool,
    executionInputMode === 'json-string' ? JSON.stringify(input) : input,
    signal ? { signal } : undefined,
  );
}

export { PERSONAL_PING_TOOL_NAME };
