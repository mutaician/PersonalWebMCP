const PERSONAL_PING_TOOL_NAME = 'personal_ping';

export interface PingToolResult {
  ok: true;
  pageTitle: string;
  url: string;
  message: string;
}

interface RegisteredToolLike {
  name: string;
}

interface ModelContextLike {
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
    input?: string,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>;
}

function getModelContext(): ModelContextLike | undefined {
  return (document as Document & { modelContext?: ModelContextLike }).modelContext;
}

export function isWebMcpSupported(): boolean {
  return typeof getModelContext()?.registerTool === 'function';
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

export async function executePersonalPing(signal?: AbortSignal): Promise<unknown> {
  const modelContext = getModelContext();
  if (!modelContext) throw new Error('WebMCP is unavailable on this page.');

  const tools = await modelContext.getTools();
  const tool = tools.find((candidate) => candidate.name === PERSONAL_PING_TOOL_NAME);
  if (!tool) throw new Error(`${PERSONAL_PING_TOOL_NAME} is not registered.`);

  return modelContext.executeTool(tool, '{}', { signal });
}

export { PERSONAL_PING_TOOL_NAME };
