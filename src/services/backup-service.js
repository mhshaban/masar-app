import { list as listAll, bulkPut, clear, rpc } from "./cloud-runtime.js?v=2026-08-31-egress-1";
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
  // تسجيل تدقيق فقط — بدون await عمدًا: البيانات نفسها استُعيدت فعليًا
  // بهذي اللحظة، فلا مبرر يخلي المستخدم ينتظر رسالة النجاح/إعادة التحميل
  // لمجرد بطء أو تعذّر شبكي بطلب التسجيل وحده (مثلًا الدالة SQL لسه ما
  // نُفِّذت بقاعدة بيانات محمد، أو مهلة اتصال طويلة) — يعمل بالخلفية ولا
  // يُفشل ولا يُبطئ الاستعادة نفسها، نفس أسلوب audit() الاختياري بـ
  // admin-users Edge Function.
  rpc("masar_log_backup_restore", { p_summary: counts }).catch(() => {});
}
