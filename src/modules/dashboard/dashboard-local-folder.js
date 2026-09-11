// وصول القراءة المحلي لمجلد "مسار" بـOneDrive (File System Access API،
// كروم/إيدج فقط) — يستخدمه دليل المعلمين وصور الطلبة وجدولهم وشهاداتهم
// لقراءة ملفات محلية بدون رفعها لـSupabase. لقطة الرئيسية اللي كانت تُبنى
// من نسخة احتياطية محفوظة بنفس المجلد أُلغيت (2026-09-10) — الرئيسية صارت
// تقرأ كل تحليلاتها حيّة من dashboard-service.js عبر Supabase مباشرة، بلا
// اعتماد على ملف محلي قد يكون قديمًا.
import { LOCAL_FOLDER_HANDLE_DB } from "../../services/local-security.js";

const HANDLE_DB = LOCAL_FOLDER_HANDLE_DB;
const HANDLE_STORE = "handles";
const HANDLE_KEY = "masar-onedrive-folder";

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(handle) {
  const db = await openHandleDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE, "readwrite");
      transaction.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function getHandle() {
  const db = await openHandleDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(HANDLE_STORE, "readonly").objectStore(HANDLE_STORE).get(HANDLE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function deleteHandle() {
  const db = await openHandleDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(HANDLE_STORE, "readwrite");
      transaction.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export function folderAccessSupported() { return typeof window !== "undefined" && "showDirectoryPicker" in window; }

// ينسى المجلد المحفوظ حاليًا (اختيار خاطئ، أو المجلد انتقل/تغيّر اسمه) —
// أول استدعاء لاحق لـgetMasarFolderHandle({prompt:true}) يعيد فتح نافذة
// اختيار المجلد من جديد بدل الاعتماد على المحفوظ صامتًا.
export async function forgetMasarFolder() {
  await deleteHandle();
}

// اسم المجلد المتصل حاليًا (بلا طلب صلاحية) — لعرضه بالواجهة فقط، null لو
// ما فيه مجلد محفوظ أو المتصفح لا يدعم الميزة أصلًا.
export async function getMasarFolderName() {
  if (!folderAccessSupported()) return null;
  const handle = await getHandle();
  return handle ? handle.name : null;
}

export async function getMasarFolderHandle({ prompt = false } = {}) {
  if (!folderAccessSupported()) return null;
  let handle = await getHandle();
  if (!handle && prompt) {
    handle = await window.showDirectoryPicker({ mode: "read", id: "masar-onedrive" });
    await saveHandle(handle);
  }
  if (!handle) return null;
  let permission = await handle.queryPermission({ mode: "read" });
  if (permission !== "granted" && prompt) permission = await handle.requestPermission({ mode: "read" });
  return permission === "granted" ? handle : null;
}

// نفس أوزان الأولوية المستخدمة بلقطة الرئيسية (SQL) وبواجهتها — يبقيان
// هنا لأن priorityLabel/priorityLevel بواجهة الرئيسية يستخدمانهما محليًا
// لتصنيف شارة كل طالب، بمعزل عن مصدر البيانات (حي أو مسار التوافق).
export const NEED_WEIGHTS = { case: 40, support: 35, promoted: 25, career: 15 };
export function priorityScore(needs = []) { return needs.reduce((sum, n) => sum + (NEED_WEIGHTS[n.type] || 0), 0); }
export function priorityLevel(score) { return score >= 60 ? "high" : score >= 30 ? "medium" : "normal"; }
