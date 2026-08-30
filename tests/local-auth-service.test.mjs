import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { clear } from "../src/services/local-runtime.js";

const session = new Map();
globalThis.sessionStorage = {
  getItem: (key) => session.get(key) ?? null,
  setItem: (key, value) => session.set(key, String(value)),
  removeItem: (key) => session.delete(key),
  clear: () => session.clear(),
};

const auth = await import("../src/services/auth-service.js");

test.beforeEach(async () => {
  session.clear();
  await clear("localUsers");
});

test("first-run setup creates a hashed local administrator and allows login", async () => {
  assert.equal(await auth.needsInitialSetup(), true);
  await auth.createInitialAdmin({ fullName: "مدير محلي", username: "admin", password: "StrongPass123" });
  assert.equal(await auth.needsInitialSetup(), false);
  await assert.rejects(() => auth.login("admin", "wrong-password"), /تعذر تسجيل الدخول/);
  const profile = await auth.login("ADMIN", "StrongPass123");
  assert.equal(profile.role, "admin");
  assert.equal(profile.full_name, "مدير محلي");
});

test("user management is restricted to a logged-in administrator", async () => {
  await auth.createInitialAdmin({ fullName: "مدير", username: "admin", password: "StrongPass123" });
  await assert.rejects(() => auth.createAccount({ fullName: "مرشد", username: "guide", password: "GuidePass123" }), /صلاحية المدير/);
  await auth.login("admin", "StrongPass123");
  await auth.createAccount({ fullName: "مرشد", username: "guide", password: "GuidePass123", role: "counselor" });
  const { users } = await auth.listUsers();
  assert.equal(users.length, 2);
  assert.ok(users.some((user) => user.profile.username === "guide"));
});

test("a disabled account cannot log in", async () => {
  const { user } = await auth.createInitialAdmin({ fullName: "مدير", username: "admin", password: "StrongPass123" });
  await auth.login("admin", "StrongPass123");
  await auth.setAccountActive(user.id, false);
  auth.logout();
  await assert.rejects(() => auth.login("admin", "StrongPass123"), /معطّل/);
});
