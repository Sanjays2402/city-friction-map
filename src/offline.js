// Offline report outbox. Reports filed while offline are queued in
// IndexedDB ("friction-outbox" / "reports") and flushed with syncPending
// once connectivity returns. Falls back to an in-memory queue when
// IndexedDB is unavailable (node tests, private mode, blocked storage).
// Tested in tests/offline.test.js.

const DB_NAME = "friction-outbox";
const STORE_NAME = "reports";
const DB_VERSION = 1;

let dbPromise = null;
let useMemory = typeof indexedDB === "undefined";
let memoryQueue = [];
let nextMemoryId = 1;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB open blocked"));
  });
  dbPromise.catch(() => {
    useMemory = true;
    dbPromise = null;
  });
  return dbPromise;
}

function storeRequest(mode, make) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = make(tx.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function queueReport(data) {
  const record = { data, queuedAt: Date.now() };
  if (!useMemory) {
    try {
      return await storeRequest("readwrite", (store) => store.add(record));
    } catch {
      useMemory = true;
    }
  }
  const memoryRecord = { id: nextMemoryId++, ...record };
  memoryQueue.push(memoryRecord);
  return memoryRecord.id;
}

export async function pendingReports() {
  if (!useMemory) {
    try {
      const records = await storeRequest("readonly", (store) => store.getAll());
      return records.slice().sort((a, b) => a.id - b.id);
    } catch {
      useMemory = true;
    }
  }
  return memoryQueue.slice().sort((a, b) => a.id - b.id);
}

export async function removeReport(id) {
  if (!useMemory) {
    try {
      await storeRequest("readwrite", (store) => store.delete(id));
      return;
    } catch {
      useMemory = true;
    }
  }
  memoryQueue = memoryQueue.filter((record) => record.id !== id);
}

export async function pendingCount() {
  const reports = await pendingReports();
  return reports.length;
}

export async function syncPending(postFn) {
  const pending = await pendingReports();
  let synced = 0;
  let failed = 0;
  for (const record of pending) {
    try {
      await postFn(record.data);
    } catch {
      failed = 1;
      break;
    }
    await removeReport(record.id);
    synced += 1;
  }
  const remaining = await pendingCount();
  return { synced, failed, remaining };
}

export function onOnline(handler) {
  if (typeof window === "undefined" || !window.addEventListener) {
    return () => {};
  }
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}

export function isOnline() {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean"
  ) {
    return navigator.onLine;
  }
  return true;
}
