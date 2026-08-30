import { list as listAll, bulkPut, clear } from "./storage-runtime.js";
import { COLLECTIONS, DB_VERSION } from "../core/config.js?v=local-1";

export async function buildBackup() {
  const collections = {};
  for (const name of COLLECTIONS) {
    collections[name] = await listAll(name);
  }
  return {
    app: "masar",
    exportedAt: new Date().toISOString(),
    dbVersion: DB_VERSION,
    collections,
  };
}

export function downloadBackup(backup) {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `masar-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseBackupFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("الملف ليس JSON صالحًا.");
  }
  if (!data || typeof data !== "object" || !data.collections || typeof data.collections !== "object") {
    throw new Error("الملف لا يطابق بنية نسخة احتياطية من مسار.");
  }
  return data;
}

export function summarizeBackup(data) {
  const counts = {};
  for (const name of COLLECTIONS) {
    counts[name] = Array.isArray(data.collections[name]) ? data.collections[name].length : 0;
  }
  return counts;
}

// Restoring always replaces (clear then bulkPut), never merges — a partial
// merge with an unrelated existing DB would silently mix two datasets with
// no way to tell which record came from where.
export async function restoreBackup(data) {
  const counts = summarizeBackup(data);
  for (const name of COLLECTIONS) {
    await clear(name);
    const records = data.collections[name];
    if (Array.isArray(records) && records.length) {
      await bulkPut(name, records);
    }
  }
  return counts;
}
