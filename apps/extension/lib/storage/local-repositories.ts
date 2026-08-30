import {
  STORAGE_SCHEMA_VERSION,
  assertPersonalTool,
  createDefaultSettingsState,
  createEmptyRegistryState,
  type ExtensionSettings,
  type PersonalToolRecord,
  type RepairProposal,
  type SettingsState,
  type ToolRegistryState,
} from '@personal-webmcp/contracts';

const REGISTRY_KEY = 'personalWebMcp.registry';
const SETTINGS_KEY = 'personalWebMcp.settings';
const REPAIRS_KEY = 'personalWebMcp.repairs';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSettings(value: Record<string, unknown>): ExtensionSettings {
  const defaults = createDefaultSettingsState().settings;
  const receiptLimit = typeof value.receiptLimit === 'number' && Number.isFinite(value.receiptLimit)
    ? Math.max(0, Math.floor(value.receiptLimit))
    : defaults.receiptLimit;

  return {
    enabledOrigins: Array.isArray(value.enabledOrigins)
      ? [...new Set(value.enabledOrigins.filter((origin): origin is string => typeof origin === 'string'))]
      : defaults.enabledOrigins,
    receiptLimit,
    developerMode: typeof value.developerMode === 'boolean'
      ? value.developerMode
      : defaults.developerMode,
  };
}

function migrateRegistryState(value: unknown): ToolRegistryState {
  if (value === undefined) return createEmptyRegistryState();
  if (!isRecord(value)) throw new Error('Stored tool registry is not an object.');

  const schemaVersion = value.schemaVersion;
  if (schemaVersion === undefined) {
    const legacyTools = isRecord(value.tools) ? value.tools : {};
    for (const tool of Object.values(legacyTools)) assertPersonalTool(tool);
    return {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
      tools: legacyTools as Record<string, PersonalToolRecord>,
    };
  }

  if (schemaVersion !== STORAGE_SCHEMA_VERSION) {
    throw new Error(`Unsupported registry schema version: ${String(schemaVersion)}.`);
  }

  if (!isRecord(value.tools)) throw new Error('Stored tool registry has no tool map.');
  for (const tool of Object.values(value.tools)) assertPersonalTool(tool);

  return value as unknown as ToolRegistryState;
}

function migrateSettingsState(value: unknown): SettingsState {
  if (value === undefined) return createDefaultSettingsState();
  if (!isRecord(value)) throw new Error('Stored settings are not an object.');

  if (value.schemaVersion === undefined) {
    const legacySettings = isRecord(value.settings) ? value.settings : value;
    return {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      settings: normalizeSettings(legacySettings),
    };
  }

  if (value.schemaVersion !== STORAGE_SCHEMA_VERSION || !isRecord(value.settings)) {
    throw new Error(`Unsupported settings schema version: ${String(value.schemaVersion)}.`);
  }

  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    settings: normalizeSettings(value.settings),
  };
}

async function readLocalValue(key: string): Promise<unknown> {
  const stored = await browser.storage.local.get(key);
  return stored[key];
}

export class ToolRegistryRepository {
  async getState(): Promise<ToolRegistryState> {
    const stored = await readLocalValue(REGISTRY_KEY);
    const state = migrateRegistryState(stored);
    if (!isRecord(stored) || stored.schemaVersion !== STORAGE_SCHEMA_VERSION) {
      await browser.storage.local.set({ [REGISTRY_KEY]: state });
    }
    return structuredClone(state);
  }

  async list(): Promise<PersonalToolRecord[]> {
    const state = await this.getState();
    return Object.values(state.tools).sort((left, right) => left.title.localeCompare(right.title));
  }

  async get(toolId: string): Promise<PersonalToolRecord | undefined> {
    const state = await this.getState();
    return state.tools[toolId];
  }

  async save(tool: PersonalToolRecord): Promise<void> {
    assertPersonalTool(tool);
    const state = await this.getState();
    state.tools[tool.id] = structuredClone(tool);
    state.updatedAt = new Date().toISOString();
    await browser.storage.local.set({ [REGISTRY_KEY]: state });
  }

  async remove(toolId: string): Promise<void> {
    const state = await this.getState();
    delete state.tools[toolId];
    state.updatedAt = new Date().toISOString();
    await browser.storage.local.set({ [REGISTRY_KEY]: state });
  }
}

export class SettingsRepository {
  async getState(): Promise<SettingsState> {
    const stored = await readLocalValue(SETTINGS_KEY);
    const state = migrateSettingsState(stored);
    if (!isRecord(stored) || stored.schemaVersion !== STORAGE_SCHEMA_VERSION) {
      await browser.storage.local.set({ [SETTINGS_KEY]: state });
    }
    return structuredClone(state);
  }

  async get(): Promise<ExtensionSettings> {
    return (await this.getState()).settings;
  }

  async save(settings: ExtensionSettings): Promise<void> {
    const state: SettingsState = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      settings: normalizeSettings(settings as unknown as Record<string, unknown>),
    };
    await browser.storage.local.set({ [SETTINGS_KEY]: state });
  }

  async update(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    const current = await this.get();
    const next = { ...current, ...patch };
    await this.save(next);
    return next;
  }
}

export class RepairRepository {
  async list(): Promise<RepairProposal[]> {
    const stored = await readLocalValue(REPAIRS_KEY);
    if (!isRecord(stored)) return [];
    return Object.values(stored)
      .filter((proposal): proposal is RepairProposal => isRecord(proposal) && typeof proposal.id === 'string')
      .map((proposal) => structuredClone(proposal))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async get(proposalId: string): Promise<RepairProposal | undefined> {
    return (await this.list()).find((proposal) => proposal.id === proposalId);
  }

  async save(proposal: RepairProposal): Promise<void> {
    const current = Object.fromEntries((await this.list()).map((item) => [item.id, item]));
    current[proposal.id] = structuredClone(proposal);
    await browser.storage.local.set({ [REPAIRS_KEY]: current });
  }

  async remove(proposalId: string): Promise<void> {
    const current = Object.fromEntries((await this.list()).map((item) => [item.id, item]));
    delete current[proposalId];
    await browser.storage.local.set({ [REPAIRS_KEY]: current });
  }
}
