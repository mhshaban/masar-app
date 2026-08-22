// مسار — الدخول الحقيقي (يحل محل local-lock.js بالكامل). نفس نمط CCE:
// اسم مستخدم يترجم لإيميل عبر دالة SQL عامة (masar_resolve_login_identifier)،
// ثم /auth/v1/token?grant_type=password مباشرة — بدون أي SDK.
import { SB_URL, SB_KEY, getAccessToken, setAccessToken, clearAccessToken } from "./supabase-config.js";
export { consumeSessionExpiredNotice } from "./supabase-config.js";

const PROFILE_CACHE_KEY = "masar_profile_cache";

function testBackend() {
  return typeof globalThis !== "undefined" ? globalThis.__MASAR_TEST_AUTH__ : null;
}

export function getSession() {
  const backend = testBackend();
  if (backend) return backend.getSession();
  const token = getAccessToken();
  return token ? { accessToken: token } : null;
}

const AUTH_FAILURE_MESSAGE = "تعذر تسجيل الدخول. تحقق من بياناتك أو تواصل مع مسؤول النظام.";
const NETWORK_FAILURE_MESSAGE = "تعذّر الاتصال بالخادم. تحقق من اتصال الإنترنت وحاول مرة أخرى.";

// خطأ فشل الشبكة (fetch نفسه رمى استثناء — انقطاع اتصال، DNS، إلخ) مميَّز
// بـ code صراحةً عن فشل المصادقة (401/بيانات خاطئة) — الواجهة (app.js)
// تحتاج تفرّق بين الحالتين برسالتين مختلفتين تمامًا حسب طلب المرشد، بدل
// رسالة عامة واحدة تخلط "بياناتك خطأ" مع "ما فيه إنترنت".
function networkError() {
  const err = new Error(NETWORK_FAILURE_MESSAGE);
  err.code = "network";
  return err;
}

function authError() {
  const err = new Error(AUTH_FAILURE_MESSAGE);
  err.code = "auth";
  return err;
}

export async function login(identifier, password) {
  const backend = testBackend();
  if (backend) return backend.login(identifier, password);

  let resolveRes;
  try {
    resolveRes = await fetch(`${SB_URL}/rest/v1/rpc/masar_resolve_login_identifier`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      body: JSON.stringify({ p_identifier: identifier }),
    });
  } catch {
    throw networkError();
  }
  if (!resolveRes.ok) throw authError();
  const email = await resolveRes.json();
  if (!email) throw authError();

  let tokenRes;
  try {
    tokenRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_KEY },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw networkError();
  }
  if (!tokenRes.ok) throw authError();
  const tokenData = await tokenRes.json();
  setAccessToken(tokenData.access_token, tokenData.expires_in);

  const profile = await fetchProfileFromNetwork();
  if (!profile || !profile.is_active) {
    clearAccessToken();
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
    // هذا الحساب متحقَّق منه فعليًا (كلمة المرور صحيحة) لكنه معطَّل — رسالة
    // أدق من الرسالة العامة تفيد المرشد فعليًا هنا، لا تكشف شي عن حساب غيره.
    const err = new Error("هذا الحساب معطّل — راجع مدير النظام.");
    err.code = "auth";
    throw err;
  }
  return profile;
}

export function logout() {
  const backend = testBackend();
  if (backend) return backend.logout();
  clearAccessToken();
  sessionStorage.removeItem(PROFILE_CACHE_KEY);
}

async function fetchProfileFromNetwork() {
  const token = getAccessToken();
  if (!token) return null;

  const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return null;
  const authUser = await userRes.json();

  const profileRes = await fetch(`${SB_URL}/rest/v1/profiles?select=*&id=eq.${authUser.id}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
  });
  if (!profileRes.ok) return null;
  const rows = await profileRes.json();
  const profile = rows[0] || null;
  if (profile) sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  return profile;
}

// يُستخدم بعد أول تحميل للصفحة (الجلسة موجودة من مرة دخول سابقة بنفس
// المتصفح) — يرجّع النسخة المخزّنة محليًا فورًا (بدون انتظار شبكة) لعرض
// الواجهة بسرعة، ثم مسؤولية المستدعي لو يبي نسخة أحدث يستدعي refreshProfile.
export function getCurrentProfile() {
  const backend = testBackend();
  if (backend) return backend.getCurrentProfile();
  const cached = sessionStorage.getItem(PROFILE_CACHE_KEY);
  return cached ? JSON.parse(cached) : null;
}

export async function refreshProfile() {
  const backend = testBackend();
  if (backend) return backend.getCurrentProfile();
  return fetchProfileFromNetwork();
}

async function callAdminUsers(body) {
  const backend = testBackend();
  if (backend) return backend.callAdminUsers(body);
  const token = getAccessToken();
  if (!token) throw new Error("الجلسة منتهية — سجّل الدخول من جديد.");
  const res = await fetch(`${SB_URL}/functions/v1/admin-users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "فشل الطلب.");
  return data;
}

export function listUsers() {
  return callAdminUsers({ action: "list_users" });
}

export function createAccount({ username, password, fullName, email, isAdmin }) {
  return callAdminUsers({
    action: "create_user",
    user: { username, password, full_name: fullName, email: email || null, is_admin: !!isAdmin },
  });
}

export function setAccountActive(userId, isActive) {
  return callAdminUsers({ action: "set_active", user_id: userId, is_active: isActive });
}

export function resetAccountPassword(userId, password) {
  return callAdminUsers({ action: "reset_password", user_id: userId, password });
}
