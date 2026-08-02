// src/services/archiveService.ts
// IndexedDB tabanlı arşiv motoru — localStorage sınırı yok (500MB+)

const DB_NAME    = 'dap_v1_idb';
const DB_VERSION = 3;

export const COLLECTION = {
  SATIS:        'satis',
  COLLECTIONS:  'collections',
  PURCHASE:     'purchase',
  CREDIT_NOTES: 'credit_notes',
  CHEQUES:      'cheques',
};

let _db: IDBDatabase | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const handleUpgrade = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const make = (name: string, keyPath: string) => {
        if (!db.objectStoreNames.contains(name))
          db.createObjectStore(name, { keyPath });
      };
      make('customers',    'customerId');
      make('satis',        'invoiceId');
      make('collections',  'collectionId');
      make('purchase',     'invoiceId');
      make('credit_notes', 'creditNoteId');
      make('cheques',      'id');
      make('upload_log',   'id');
    };

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = handleUpgrade;

    req.onsuccess = (e: Event) => { 
      _db = (e.target as IDBOpenDBRequest).result; 
      resolve(_db); 
    };

    req.onerror = (e: Event) => {
      const err = (e.target as IDBOpenDBRequest).error;
      if (err && err.name === 'VersionError') {
        const fallbackReq = indexedDB.open(DB_NAME);
        fallbackReq.onsuccess = (fe: Event) => {
          _db = (fe.target as IDBOpenDBRequest).result;
          resolve(_db);
        };
        fallbackReq.onerror = (fe: Event) => reject((fe.target as IDBOpenDBRequest).error);
      } else {
        reject(err);
      }
    };
  });
}

function req2p<T>(idbReq: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    idbReq.onsuccess = () => res(idbReq.result);
    idbReq.onerror   = () => rej(idbReq.error);
  });
}

function tx2p(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror    = () => rej(tx.error);
    tx.onabort    = () => rej(new Error('Transaction aborted'));
  });
}

async function idbGetAll<T = any>(storeName: string): Promise<T[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  return req2p(tx.objectStore(storeName).getAll());
}

async function idbGetAllKeys(storeName: string): Promise<IDBValidKey[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  return req2p(tx.objectStore(storeName).getAllKeys());
}

async function idbCount(storeName: string): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  return req2p(tx.objectStore(storeName).count());
}

export interface UpsertResult {
  added: number;
  skippedDuplicate: number;
  cancelledRemoved: number;
}

async function upsertRecords(
  storeName: string,
  keyField: string,
  statusField: string | null,
  records: any[]
): Promise<UpsertResult> {
  if (typeof indexedDB === 'undefined') return { added: 0, skippedDuplicate: 0, cancelledRemoved: 0 };
  if (!records?.length) return { added: 0, skippedDuplicate: 0, cancelledRemoved: 0 };

  const db = await openDB();

  const existingKeys = new Set(
    (await idbGetAllKeys(storeName)).map(String)
  );

  const cancelledIds = new Set<string>();
  const toWrite: any[] = [];
  for (const rec of records) {
    if (statusField) {
      const s = String(rec[statusField] || '').trim().toUpperCase();
      if (s === 'CANCELLED') {
        cancelledIds.add(String(rec[keyField] || ''));
        continue;
      }
    }
    if (rec[keyField]) toWrite.push(rec);
  }

  let added = 0, skippedDuplicate = 0, cancelledRemoved = 0;
  const tx    = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);

  for (const rec of toWrite) {
    const id = String(rec[keyField]);
    if (existingKeys.has(id)) {
      skippedDuplicate++;
    } else {
      added++;
      store.put(rec);
    }
  }

  for (const id of cancelledIds) {
    if (existingKeys.has(id)) {
      store.delete(id);
      cancelledRemoved++;
    }
  }

  await tx2p(tx);
  return { added, skippedDuplicate, cancelledRemoved };
}

export async function archiveCustomers(records: any[]): Promise<{ added: number; skippedDuplicate: number }> {
  if (typeof indexedDB === 'undefined' || !records?.length) return { added: 0, skippedDuplicate: 0 };
  const db           = await openDB();
  const existingKeys = new Set((await idbGetAllKeys('customers')).map(String));

  let added = 0, skippedDuplicate = 0;
  const tx    = db.transaction('customers', 'readwrite');
  const store = tx.objectStore('customers');
  for (const rec of records) {
    if (!rec.customerId) continue;
    const cid = String(rec.customerId);
    if (existingKeys.has(cid)) {
      skippedDuplicate++;
      store.put(rec);
    } else {
      added++;
      existingKeys.add(cid);
      store.put(rec);
    }
  }
  await tx2p(tx);
  return { added, skippedDuplicate };
}

export async function archiveSalesInvoices(records: any[]): Promise<UpsertResult>    { return upsertRecords('satis',        'invoiceId',    null, records); }
export async function archiveCollections(records: any[]): Promise<UpsertResult>      { return upsertRecords('collections',   'collectionId', null, records); }
export async function archivePurchaseInvoices(records: any[]): Promise<UpsertResult> { return upsertRecords('purchase',      'invoiceId',    null, records); }
export async function archiveCreditNotes(records: any[]): Promise<UpsertResult>      { return upsertRecords('credit_notes',  'creditNoteId', null, records); }
export async function archiveCheques(records: any[]): Promise<UpsertResult>          { return upsertRecords('cheques',      'id',           null, records); }

export async function updateChequesInArchive(records: any[]): Promise<number> {
  if (typeof indexedDB === 'undefined' || !records?.length) return 0;
  const db    = await openDB();
  const tx    = db.transaction('cheques', 'readwrite');
  const store = tx.objectStore('cheques');
  let updated = 0;
  for (const rec of records) {
    if (!rec.id) continue;
    store.put(rec);
    updated++;
  }
  await tx2p(tx);
  return updated;
}

async function deleteFromStore(storeName: string, key: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  await tx2p(tx);
}

export async function deleteSalesInvoiceRecord(invoiceId: string) { return deleteFromStore('satis', invoiceId); }
export async function deleteCollectionRecord(collectionId: string) { return deleteFromStore('collections', collectionId); }
export async function deleteCreditNoteRecord(creditNoteId: string) { return deleteFromStore('credit_notes', creditNoteId); }
export async function deleteChequeRecord(id: string)               { return deleteFromStore('cheques', id); }

export async function loadCustomers<T = any>(): Promise<T[]>           { return idbGetAll<T>('customers'); }
export async function loadAllSalesInvoices<T = any>(): Promise<T[]>    { return idbGetAll<T>('satis'); }
export async function loadAllCollections<T = any>(): Promise<T[]>      { return idbGetAll<T>('collections'); }
export async function loadAllPurchaseInvoices<T = any>(): Promise<T[]> { return idbGetAll<T>('purchase'); }
export async function loadAllCreditNotes<T = any>(): Promise<T[]>      { return idbGetAll<T>('credit_notes'); }
export async function loadAllCheques<T = any>(): Promise<T[]>          { return idbGetAll<T>('cheques'); }

export async function hasArchivedData(): Promise<boolean> {
  const [cCount, sCount, colCount, pCount, cnCount, chqCount] = await Promise.all([
    idbCount('customers'),
    idbCount('satis'),
    idbCount('collections'),
    idbCount('purchase'),
    idbCount('credit_notes'),
    idbCount('cheques'),
  ]);
  return (cCount + sCount + colCount + pCount + cnCount + chqCount) > 0;
}

export async function addUploadLogEntry(entry: any): Promise<void> {
  const db    = await openDB();
  const tx    = db.transaction('upload_log', 'readwrite');
  const store = tx.objectStore('upload_log');
  store.put({
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  });
  await tx2p(tx);
}

export async function getUploadLog(): Promise<any[]> {
  const all = await idbGetAll('upload_log');
  return all.sort((a, b) => b.id.localeCompare(a.id)).slice(0, 500);
}

export async function clearAllArchive(): Promise<void> {
  const db     = await openDB();
  const stores = ['customers', 'satis', 'collections', 'purchase', 'credit_notes', 'cheques', 'upload_log'];
  const tx     = db.transaction(stores, 'readwrite');
  for (const name of stores) tx.objectStore(name).clear();
  await tx2p(tx);
}

export interface ArchiveSummary {
  customers: number;
  satisRecords: number;
  collectionRecords: number;
  purchaseDays: number;
  creditNoteDays: number;
  chequeRecords: number;
  uploadCount: number;
  satisDays: number;
  collectionDays: number;
}

export async function getArchiveSummary(): Promise<ArchiveSummary> {
  const [custCount, satisCount, colCount, purchCount, cnCount, chqCount, logCount] = await Promise.all([
    idbCount('customers'),
    idbCount('satis'),
    idbCount('collections'),
    idbCount('purchase'),
    idbCount('credit_notes'),
    idbCount('cheques'),
    idbCount('upload_log'),
  ]);
  return {
    customers:         custCount,
    satisRecords:      satisCount,
    collectionRecords: colCount,
    purchaseDays:      purchCount,
    creditNoteDays:    cnCount,
    chequeRecords:     chqCount,
    uploadCount:       logCount,
    satisDays:         satisCount > 0 ? 1 : 0,
    collectionDays:    colCount   > 0 ? 1 : 0,
  };
}

export async function getStorageUsage(): Promise<number> {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return est.usage || 0;
  }
  return 0;
}

export const smartMerge = upsertRecords;
export const getCollectionDaySummary = async (): Promise<any[]> => [];
