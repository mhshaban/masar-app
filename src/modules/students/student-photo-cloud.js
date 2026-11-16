// صور الطلبة المخزّنة في Supabase Storage (حاوية student-photos الخاصة،
// المسار <الرقم الأكاديمي>/avatar.webp). تُقرأ بتوكن جلسة المستخدم، فلا تعمل
// إلا لمن تسمح له سياسة القراءة على storage.objects (نفس مستخدمي مسار
// النشطين). ميزتها عن مجلد OneDrive المحلي أنها تشتغل بأي متصفح وبدون طلب
// صلاحية مجلد بعد كل إغلاق للمتصفح أو تسجيل خروج.
import { SB_URL, SB_KEY, getAccessToken } from "../../services/supabase-config.js";

const BUCKET = "student-photos";
// id -> Promise<objectURL | null>. نخزّن الغياب (null) أيضًا حتى لا يُعاد
// طلب صورة غير موجودة مع كل إعادة رسم للقائمة.
const cache = new Map();

export function studentPhotoCloudPath(studentId) {
  return `${encodeURIComponent(String(studentId).trim())}/avatar.webp`;
}

async function fetchPhoto(studentId) {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${SB_URL}/storage/v1/object/authenticated/${BUCKET}/${studentPhotoCloudPath(studentId)}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function cloudStudentPhotoUrl(studentId) {
  const key = String(studentId || "").trim();
  if (!key) return Promise.resolve(null);
  if (!cache.has(key)) {
    const pending = fetchPhoto(key).then((url) => {
      // فشل بلا توكن (انتهت الجلسة) لا يُخزَّن، حتى تُعاد المحاولة لاحقًا.
      if (!url && !getAccessToken()) cache.delete(key);
      return url;
    });
    cache.set(key, pending);
  }
  return cache.get(key);
}

export function resetCloudStudentPhotoCache() {
  for (const pending of cache.values()) {
    void pending.then((url) => { if (url) URL.revokeObjectURL(url); });
  }
  cache.clear();
}
