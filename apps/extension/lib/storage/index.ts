import type { PingResultPayload } from '@personal-webmcp/contracts';
import {
  ActivityReceiptRepository,
  RevisionRepository,
  TraceRepository,
} from './indexed-database';
import {
  SettingsRepository,
  RepairRepository,
  ToolRegistryRepository,
} from './local-repositories';
import {
  SYSTEM_PING_REVISION_ID,
  SYSTEM_PING_TOOL_ID,
  SYSTEM_PING_TRACE_ID,
  createSystemPingReceipt,
  createSystemPingRevision,
  createSystemPingTool,
  createSystemPingTrace,
} from './sample-capability';

export const toolRegistryRepository = new ToolRegistryRepository();
export const settingsRepository = new SettingsRepository();
export const repairRepository = new RepairRepository();
export const traceRepository = new TraceRepository();
export const revisionRepository = new RevisionRepository();
export const activityReceiptRepository = new ActivityReceiptRepository();

export async function bootstrapPersistence(): Promise<void> {
  const existingTool = await toolRegistryRepository.get(SYSTEM_PING_TOOL_ID);
  const tool = existingTool ?? createSystemPingTool();
  if (!existingTool) await toolRegistryRepository.save(tool);

  if (!await traceRepository.get(SYSTEM_PING_TRACE_ID)) {
    await traceRepository.save(createSystemPingTrace(tool.createdAt));
  }

  if (!await revisionRepository.get(SYSTEM_PING_REVISION_ID)) {
    await revisionRepository.save(createSystemPingRevision(tool));
  }

  await settingsRepository.getState();
}

export async function savePingReceipt(
  payload: PingResultPayload,
  origin: string,
  startedAt: number,
): Promise<void> {
  const finishedAt = Date.now();
  const settings = await settingsRepository.get();
  await activityReceiptRepository.save(createSystemPingReceipt({
    ...payload,
    origin,
    startedAt,
    finishedAt,
  }), settings.receiptLimit);

  if (payload.ok) {
    const tool = await toolRegistryRepository.get(SYSTEM_PING_TOOL_ID);
    if (tool) {
      const verifiedAt = new Date(finishedAt).toISOString();
      await toolRegistryRepository.save({
        ...tool,
        health: {
          state: 'HEALTHY',
          lastVerifiedAt: verifiedAt,
          confidence: 100,
        },
        updatedAt: verifiedAt,
      });
    }
  }
}

export async function getPersistenceSummary() {
  const [registry, settings, traces, revisions, receipts] = await Promise.all([
    toolRegistryRepository.getState(),
    settingsRepository.getState(),
    traceRepository.list(),
    revisionRepository.listForTool(SYSTEM_PING_TOOL_ID),
    activityReceiptRepository.list(),
  ]);

  return {
    schemaVersion: registry.schemaVersion,
    toolCount: Object.keys(registry.tools).length,
    traceCount: traces.length,
    revisionCount: revisions.length,
    receiptCount: receipts.length,
    receiptLimit: settings.settings.receiptLimit,
  };
}

export * from './indexed-database';
export * from './local-repositories';
