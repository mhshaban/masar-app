import { list as listAll, bulkPut, clear, rpc, resetCloudReadCache } from "./cloud-runtime.js?v=2026-09-03-safe-restore-1";
import { COLLECTIONS, DB_VERSION } from "../core/config.js";

const BACKUP_CACHE_MS = 10 * 60_000;
let backupCache = null;

export async function buildBackup({ force = false } = {}) {
  if (!globalThis.__MASAR_TEST_BACKEND__) {
    if (!force && backupCache && backupCache.until > Date.now()) return backupCache.data;
    try {
      const data = await rpc("masar_export_backup");
      backupCache = { data, until: Date.now() + BACKUP_CACHE_MS };
      return data;
    } catch (error) {
      throw new Error("تعذر إنشاء النسخة الاحتياطية الآمنة. تأكد من تطبيق migration الصلاحيات والتصدير الإداري.", { cause: error });
    }
  }
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
  validateBackup(data);
  return data;
}

function validateBackup(data) {
  if (!data || typeof data !== "object" || data.app !== "masar" || !data.collections || typeof data.collections !== "object" || Array.isArray(data.collections)) {
    throw new Error("الملف لا يطابق بنية نسخة احتياطية من مسار.");
  }
  for (const name of COLLECTIONS) {
    const records = data.collections[name];
    if (!Array.isArray(records)) {
      throw new Error(`النسخة غير مكتملة: مجموعة ${name} مفقودة أو غير صالحة.`);
    }
    const ids = new Set();
    for (const record of records) {
      if (!record || typeof record !== "object" || Array.isArray(record) || record.id === undefined || record.id === null || !String(record.id).trim()) {
        throw new Error(`النسخة تحتوي سجلًا بلا معرّف صالح في مجموعة ${name}.`);
      }
      const id = String(record.id);
      if (ids.has(id)) throw new Error(`النسخة تحتوي معرّفًا مكررًا (${id}) في مجموعة ${name}.`);
      ids.add(id);
    }
  }
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
  validateBackup(data);
  const counts = summarizeBackup(data);
  if (!globalThis.__MASAR_TEST_BACKEND__) {
    try {
      await rpc("masar_restore_backup", { p_backup: data });
    } catch (error) {
      throw new Error("تعذّرت الاستعادة الآمنة، ولم تُغيّر قاعدة البيانات. تأكد من تطبيق تحديث الاستعادة الذرّية في Supabase.", { cause: error });
    }
    backupCache = null;
    resetCloudReadCache();
    return counts;
  }

  for (const name of COLLECTIONS) {
    await clear(name);
    const records = data.collections[name];
    if (records.length) {
      await bulkPut(name, records);
    }
  }
  return counts;
}
