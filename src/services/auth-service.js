// مسار — الدخول الحقيقي (يحل محل local-lock.js بالكامل). نفس نمط CCE:
// اسم مستخدم يترجم لإيميل عبر دالة SQL عامة (masar_resolve_login_identifier)،
// ثم /auth/v1/token?grant_type=password مباشرة — بدون أي SDK.
import { SB_URL, SB_KEY, getAccessToken, setAccessToken, clearAccessToken } from "./supabase-config.js";
import { clearSensitiveLocalData } from "./local-security.js";
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

const AUTH_FAILURE_MESSAGE = "تعذر تسجيل الدخول. تحقق من بياناتك أو تواصل مع مسؤول النظام";
const NETWORK_FAILURE_MESSAGE = "تعذّر الاتصال بالخادم. تحقق من اتصال الإنترنت وحاول مرة أخرى";

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

export async function logout() {
  const backend = testBackend();
  try {
    if (backend) await backend.logout();
  } finally {
    clearAccessToken();
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
    await clearSensitiveLocalData();
  }
}

// يرسل رابط استرجاع موحدًا دون كشف ما إذا كان المعرّف موجودًا. Supabase
// نفسها قد لا ترسل بريدًا للحساب غير الموجود، لكن واجهة مسار تعرض الرسالة
// نفسها في الحالتين لمنع تعداد الحسابات.
export async function requestPasswordReset(identifier) {
  const backend = testBackend();
  if (backend?.requestPasswordReset) return backend.requestPasswordReset(identifier);

  let email = null;
  try {
    const resolveRes = await fetch(`${SB_URL}/rest/v1/rpc/masar_resolve_login_identifier`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
      body: JSON.stringify({ p_identifier: String(identifier || "").trim() }),
    });
    if (resolveRes.ok) email = await resolveRes.json();
  } catch {
    throw networkError();
  }

  if (!email) return;
  const redirectTo = new URL(window.location.pathname, window.location.origin).href;
  try {
    await fetch(`${SB_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SB_KEY },
      body: JSON.stringify({ email }),
    });
  } catch {
    throw networkError();
  }
}

export function consumeRecoverySession() {
  if (typeof window === "undefined" || !window.location.hash.includes("type=recovery")) return false;
  const params = new URLSearchParams(window.location.hash.slice(1));
  if (params.get("type") !== "recovery" || !params.get("access_token")) return false;
  setAccessToken(params.get("access_token"), Number(params.get("expires_in") || 3600));
  history.replaceState(null, "", window.location.pathname + window.location.search);
  return true;
}

export async function updateRecoveredPassword(password) {
  const backend = testBackend();
  if (backend?.updateRecoveredPassword) return backend.updateRecoveredPassword(password);
  const token = getAccessToken();
  if (!token) throw new Error("انتهت صلاحية رابط الاسترجاع. اطلب رابطًا جديدًا.");
  let res;
  try {
    res = await fetch(`${SB_URL}/auth/v1/user`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ password }),
    });
  } catch {
    throw networkError();
  }
  if (!res.ok) throw new Error("تعذر تعيين كلمة المرور. قد يكون الرابط منتهيًا؛ اطلب رابطًا جديدًا.");
  await logout();
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

export function createAccount({ username, password, fullName, email, role = "counselor", isAdmin }) {
  return callAdminUsers({
    action: "create_user",
    user: { username, password, full_name: fullName, email: email || null, role, is_admin: !!isAdmin },
  });
}

export function setAccountActive(userId, isActive) {
  return callAdminUsers({ action: "set_active", user_id: userId, is_active: isActive });
}

export function setAccountRole(userId, role) {
  return callAdminUsers({ action: "set_role", user_id: userId, role });
}

export function resetAccountPassword(userId, password) {
  return callAdminUsers({ action: "reset_password", user_id: userId, password });
}

export function updateAccount(userId, { fullName, identifier }) {
  return callAdminUsers({
    action: "update_user",
    user_id: userId,
    full_name: fullName,
    identifier,
  });
}
