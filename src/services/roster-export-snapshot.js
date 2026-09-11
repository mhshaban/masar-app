// يحفظ آخر نسخة صُدِّرت من سجل الطلبة/المعلمين محليًا (IndexedDB، جهاز
// المستخدم فقط) — يقارن بها roster-changes-export-service.js عند كل تصدير
// جديد ليحدّد فقط الصفوف/الأعمدة المتغيّرة منذ آخر تصدير، بدل تصدير كل
// السجل من الصفر كل مرة. حساسة (بيانات طلبة/معلمين)، لذلك مسجَّلة بـ
// clearSensitiveLocalData() لتُمسح عند تسجيل الخروج (راجع local-security.js).
import { ROSTER_EXPORT_SNAPSHOT_DB } from "./local-security.js";

const STORE = "snapshots";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ROSTER_EXPORT_SNAPSHOT_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// {} لو ما فيه تصدير سابق لهذه المجموعة — أول تصدير يُعامَل جميع صفوفه
// كـ"جديد" بالتصميم (بلا خط أساس يُقارَن به).
export async function getRosterSnapshot(collection) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(collection);
      req.onsuccess = () => resolve(req.result || {});
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveRosterSnapshot(collection, recordsById) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(recordsById, collection);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
