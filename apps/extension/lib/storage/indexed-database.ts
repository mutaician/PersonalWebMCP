import type {
  ActivityReceipt,
  InteractionTrace,
  ToolRevision,
} from '@personal-webmcp/contracts';

const DATABASE_NAME = 'personal-webmcp';
const DATABASE_VERSION = 1;

const STORE_TRACES = 'traces';
const STORE_REVISIONS = 'revisions';
const STORE_RECEIPTS = 'receipts';

type StoreName = typeof STORE_TRACES | typeof STORE_REVISIONS | typeof STORE_RECEIPTS;
type StoredRecord = ActivityReceipt | InteractionTrace | ToolRevision;

let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed.')), { once: true });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')), { once: true });
  });
}

function createStores(database: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const traces = database.createObjectStore(STORE_TRACES, { keyPath: 'id' });
    traces.createIndex('origin', 'origin');
    traces.createIndex('startedAt', 'startedAt');

    const revisions = database.createObjectStore(STORE_REVISIONS, { keyPath: 'id' });
    revisions.createIndex('toolId', 'toolId');
    revisions.createIndex('createdAt', 'createdAt');

    const receipts = database.createObjectStore(STORE_RECEIPTS, { keyPath: 'id' });
    receipts.createIndex('toolId', 'toolId');
    receipts.createIndex('startedAt', 'startedAt');
  }
}

export function openPersonalWebMcpDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.addEventListener('upgradeneeded', (event) => {
      createStores(request.result, (event as IDBVersionChangeEvent).oldVersion);
    });
    request.addEventListener('success', () => {
      const database = request.result;
      database.addEventListener('versionchange', () => {
        database.close();
        databasePromise = undefined;
      });
      resolve(database);
    }, { once: true });
    request.addEventListener('blocked', () => reject(new Error('PersonalWebMCP storage upgrade is blocked.')), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('Could not open PersonalWebMCP storage.')), { once: true });
  });

  return databasePromise;
}

async function putRecord(storeName: StoreName, record: StoredRecord): Promise<void> {
  const database = await openPersonalWebMcpDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(storeName).put(structuredClone(record));
  await done;
}

async function getRecord<T extends StoredRecord>(storeName: StoreName, id: string): Promise<T | undefined> {
  const database = await openPersonalWebMcpDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const done = transactionDone(transaction);
  const record = await requestResult(transaction.objectStore(storeName).get(id));
  await done;
  return record as T | undefined;
}

async function getAllRecords<T extends StoredRecord>(storeName: StoreName): Promise<T[]> {
  const database = await openPersonalWebMcpDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const done = transactionDone(transaction);
  const records = await requestResult(transaction.objectStore(storeName).getAll());
  await done;
  return records as T[];
}

async function getAllFromIndex<T extends StoredRecord>(
  storeName: StoreName,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  const database = await openPersonalWebMcpDatabase();
  const transaction = database.transaction(storeName, 'readonly');
  const done = transactionDone(transaction);
  const records = await requestResult(transaction.objectStore(storeName).index(indexName).getAll(key));
  await done;
  return records as T[];
}

async function deleteRecords(storeName: StoreName, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const database = await openPersonalWebMcpDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const done = transactionDone(transaction);
  const store = transaction.objectStore(storeName);
  for (const id of ids) store.delete(id);
  await done;
}

async function clearStore(storeName: StoreName): Promise<void> {
  const database = await openPersonalWebMcpDatabase();
  const transaction = database.transaction(storeName, 'readwrite');
  const done = transactionDone(transaction);
  transaction.objectStore(storeName).clear();
  await done;
}

export class TraceRepository {
  save(trace: InteractionTrace): Promise<void> {
    return putRecord(STORE_TRACES, trace);
  }

  get(traceId: string): Promise<InteractionTrace | undefined> {
    return getRecord(STORE_TRACES, traceId);
  }

  async list(): Promise<InteractionTrace[]> {
    const traces = await getAllRecords<InteractionTrace>(STORE_TRACES);
    return traces.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }
}

export class RevisionRepository {
  save(revision: ToolRevision): Promise<void> {
    return putRecord(STORE_REVISIONS, revision);
  }

  get(revisionId: string): Promise<ToolRevision | undefined> {
    return getRecord(STORE_REVISIONS, revisionId);
  }

  async listForTool(toolId: string): Promise<ToolRevision[]> {
    const revisions = await getAllFromIndex<ToolRevision>(STORE_REVISIONS, 'toolId', toolId);
    return revisions.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}

export class ActivityReceiptRepository {
  async save(receipt: ActivityReceipt, limit: number): Promise<void> {
    await putRecord(STORE_RECEIPTS, receipt);
    await this.enforceLimit(limit);
  }

  get(receiptId: string): Promise<ActivityReceipt | undefined> {
    return getRecord(STORE_RECEIPTS, receiptId);
  }

  async list(): Promise<ActivityReceipt[]> {
    const receipts = await getAllRecords<ActivityReceipt>(STORE_RECEIPTS);
    return receipts.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async listForTool(toolId: string): Promise<ActivityReceipt[]> {
    const receipts = await getAllFromIndex<ActivityReceipt>(STORE_RECEIPTS, 'toolId', toolId);
    return receipts.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  clearHistory(): Promise<void> {
    return clearStore(STORE_RECEIPTS);
  }

  private async enforceLimit(limit: number): Promise<void> {
    const safeLimit = Math.max(0, Math.floor(limit));
    const receipts = await this.list();
    await deleteRecords(STORE_RECEIPTS, receipts.slice(safeLimit).map(({ id }) => id));
  }
}
