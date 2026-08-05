import { DB_NAME, DB_VERSION, COLLECTIONS } from "../core/config.js";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of COLLECTIONS) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx(db, collection, mode) {
  return db.transaction(collection, mode).objectStore(collection);
}

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function list(collection) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, collection, "readonly");
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function get(collection, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = tx(db, collection, "readonly").get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function save(collection, record) {
  const db = await openDb();
  const toSave = record.id ? record : { ...record, id: genId() };
  return new Promise((resolve, reject) => {
    const request = tx(db, collection, "readwrite").put(toSave);
    request.onsuccess = () => resolve(toSave);
    request.onerror = () => reject(request.error);
  });
}

export async function bulkPut(collection, records) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, collection, "readwrite");
    for (const record of records) {
      store.put(record.id ? record : { ...record, id: genId() });
    }
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () => reject(store.transaction.error);
  });
}

export async function remove(collection, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = tx(db, collection, "readwrite").delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function count(collection) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = tx(db, collection, "readonly").count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clear(collection) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = tx(db, collection, "readwrite").clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
