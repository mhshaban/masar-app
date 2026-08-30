import { list, get, save } from "./local-runtime.js?v=local-1";

const SESSION_KEY = "masar_local_session";
const PROFILE_CACHE_KEY = "masar_profile_cache";
const ITERATIONS = 210_000;
function testBackend() { return typeof globalThis !== "undefined" ? globalThis.__MASAR_TEST_AUTH__ : null; }
function bytesToBase64(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function base64ToBytes(value) { const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
async function derivePassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}
async function passwordRecord(password) {
  if (String(password || "").length < 8) throw new Error("كلمة المرور يجب ألا تقل عن 8 أحرف");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { passwordSalt: bytesToBase64(salt), passwordHash: await derivePassword(password, salt), passwordIterations: ITERATIONS };
}
async function verifyPassword(password, user) {
  if (!user.passwordSalt || !user.passwordHash) return false;
  const candidate = await derivePassword(password, base64ToBytes(user.passwordSalt));
  if (candidate.length !== user.passwordHash.length) return false;
  let difference = 0;
  for (let i = 0; i < candidate.length; i += 1) difference |= candidate.charCodeAt(i) ^ user.passwordHash.charCodeAt(i);
  return difference === 0;
}
function publicProfile(user) {
  if (!user) return null;
  return { id: user.id, username: user.username, email: user.email || null, full_name: user.fullName, role: user.role, is_admin: user.role === "admin", is_active: user.isActive !== false };
}
function cacheSession(user) {
  const profile = publicProfile(user);
  sessionStorage.setItem(SESSION_KEY, user.id); sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  return profile;
}
export async function needsInitialSetup() { return (await list("localUsers")).length === 0; }
export async function createInitialAdmin({ fullName, username, password, email }) {
  if (!await needsInitialSetup()) throw new Error("تم إنشاء حساب المدير مسبقًا");
  return createAccountRecord({ fullName, username, password, email, role: "admin" });
}
export function getSession() { const backend = testBackend(); if (backend) return backend.getSession(); const userId = sessionStorage.getItem(SESSION_KEY); return userId ? { userId } : null; }
export async function login(identifier, password) {
  const backend = testBackend(); if (backend) return backend.login(identifier, password);
  const normalized = String(identifier || "").trim().toLowerCase();
  const users = await list("localUsers");
  const user = users.find((item) => item.username?.toLowerCase() === normalized || item.email?.toLowerCase() === normalized);
  if (!user || !await verifyPassword(password, user)) throw new Error("تعذر تسجيل الدخول. تحقق من اسم المستخدم وكلمة المرور");
  if (user.isActive === false) throw new Error("هذا الحساب معطّل — راجع مدير النظام.");
  user.lastLoginAt = new Date().toISOString(); await save("localUsers", user); return cacheSession(user);
}
export function logout() { const backend = testBackend(); if (backend) return backend.logout(); sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(PROFILE_CACHE_KEY); }
export function getCurrentProfile() { const backend = testBackend(); if (backend) return backend.getCurrentProfile(); const cached = sessionStorage.getItem(PROFILE_CACHE_KEY); return cached ? JSON.parse(cached) : null; }
export async function refreshProfile() {
  const backend = testBackend(); if (backend) return backend.getCurrentProfile();
  const id = sessionStorage.getItem(SESSION_KEY); if (!id) return null;
  const user = await get("localUsers", id); if (!user || user.isActive === false) { logout(); return null; }
  return cacheSession(user);
}
export function consumeSessionExpiredNotice() { return false; }
export function consumeRecoverySession() { return false; }
export async function updateRecoveredPassword() { throw new Error("غيّر كلمة المرور من إدارة المستخدمين المحلية"); }
export async function requestPasswordReset() { throw new Error("استرجاع الحساب محلي؛ استخدم حساب المدير لإعادة تعيين كلمة المرور"); }
export async function listUsers() {
  requireAdmin();
  const users = await list("localUsers");
  return { users: users.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "", "ar")).map((user) => ({ id: user.id, email: user.email, profile: publicProfile(user) })) };
}
function requireAdmin() {
  const profile = getCurrentProfile();
  if (!profile || profile.role !== "admin") throw new Error("هذه العملية تتطلب صلاحية المدير");
}
async function createAccountRecord({ username, password, fullName, email, role = "counselor", isAdmin }) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized) throw new Error("اسم المستخدم مطلوب");
  if (!String(fullName || "").trim()) throw new Error("الاسم الكامل مطلوب");
  const users = await list("localUsers");
  if (users.some((user) => user.username?.toLowerCase() === normalized)) throw new Error("اسم المستخدم مستخدم مسبقًا");
  const user = { id: `local-user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, username: normalized, fullName: fullName.trim(), email: String(email || "").trim() || null, role: isAdmin ? "admin" : role, isActive: true, createdAt: new Date().toISOString(), ...await passwordRecord(password) };
  await save("localUsers", user); return { user: { id: user.id, email: user.email, profile: publicProfile(user) } };
}
export async function createAccount(details) { requireAdmin(); return createAccountRecord(details); }
async function patchUser(userId, patch) { const user = await get("localUsers", userId); if (!user) throw new Error("الحساب غير موجود"); await save("localUsers", { ...user, ...patch, updatedAt: new Date().toISOString() }); }
export const setAccountActive = (userId, isActive) => { requireAdmin(); return patchUser(userId, { isActive: !!isActive }); };
export const setAccountRole = (userId, role) => { requireAdmin(); if (!["admin", "counselor", "read_only"].includes(role)) throw new Error("صلاحية غير صالحة"); return patchUser(userId, { role }); };
export async function resetAccountPassword(userId, password) { requireAdmin(); return patchUser(userId, await passwordRecord(password)); }
