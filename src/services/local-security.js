// بيانات محلية مشتقة من سجلات الطلبة أو مرتبطة بوصول المستخدم إلى مجلد
// OneDrive. تُمسح عند تسجيل الخروج، بينما تبقى تفضيلات الواجهة غير الحساسة.
export const DAILY_PRIORITY_DECISIONS_KEY = "masar-daily-priority-decisions-v1";
export const LOCAL_FOLDER_HANDLE_DB = "masar-folder-access";
export const ROSTER_EXPORT_SNAPSHOT_DB = "masar-roster-export-snapshots";

function removeLocalValue(key) {
  try { localStorage.removeItem(key); } catch { /* التخزين قد يكون معطّلًا */ }
}

function deleteIndexedDb(name) {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      // إذا كانت نسخة أقدم من الصفحة ما زالت تمسك اتصالًا، سيكتمل الحذف
      // تلقائيًا بعد إعادة التحميل. لا نحبس تسجيل الخروج بانتظارها.
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearSensitiveLocalData() {
  removeLocalValue(DAILY_PRIORITY_DECISIONS_KEY);
  await deleteIndexedDb(LOCAL_FOLDER_HANDLE_DB);
  await deleteIndexedDb(ROSTER_EXPORT_SNAPSHOT_DB);
}
