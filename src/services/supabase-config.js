// إعدادات مشروع Supabase الخاص بمسار — منفصل تمامًا عن مشروع CCE.
// Project URL و anon key آمن حفظهم هنا مباشرة (مثل CCE بالضبط): الحماية
// الفعلية للبيانات عبر تسجيل الدخول + RLS بقاعدة البيانات، وليس بإخفاء
// هذا المفتاح — anon key بدون جلسة مستخدم نشطة لا يقدر يقرأ ولا يكتب أي
// صف طالب حقيقي (راجع supabase/migrations/20260804_masar_core_schema.sql).
//
// القيم أدناه بيانات نائبة (placeholders) — تُستبدل بقيم مشروع Supabase
// الحقيقي بعد إنشائه (راجع "خطوات محمد اليدوية" بـ README.md).
export const SB_URL = "https://wtbtgubycnmsytfythhb.supabase.co";
export const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0YnRndWJ5Y25tc3l0Znl0aGhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MTc2NjMsImV4cCI6MjEwMTQ5MzY2M30.zSsLmgIJHhzYR3SgV6vu0hDI80VBcP6gWM7zIpUSA9Q";

const SESSION_TOKEN_KEY = "masar_sb_access_token";
const SESSION_EXPIRY_KEY = "masar_sb_token_until";

export function getAccessToken() {
  const until = parseInt(sessionStorage.getItem(SESSION_EXPIRY_KEY) || "0", 10);
  if (until && until <= Date.now()) {
    clearAccessToken();
    return null;
  }
  return sessionStorage.getItem(SESSION_TOKEN_KEY) || null;
}

export function setAccessToken(token, expiresInSeconds) {
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  sessionStorage.setItem(SESSION_EXPIRY_KEY, String(Date.now() + Math.max(0, (expiresInSeconds || 3600) - 60) * 1000));
}

export function clearAccessToken() {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_EXPIRY_KEY);
}
