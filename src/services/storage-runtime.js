import * as local from "./local-runtime.js?v=local-1";
import * as cloudTestAdapter from "./cloud-runtime.js";
import { getCurrentProfile } from "./auth-service.js?v=local-1";

const COUNSELOR_WRITES = new Set([
  "actionProgress", "reminders", "guidanceCases", "caseSessions", "supportPlans",
  "supportPlanActions", "careerSessions", "departmentForms", "schoolTeachers",
]);
const AUTH_COLLECTIONS = new Set(["localUsers", "appSettings"]);

const usingTestBackend = () => typeof globalThis !== "undefined" && !!globalThis.__MASAR_TEST_BACKEND__;
const runtime = () => usingTestBackend() ? cloudTestAdapter : local;

function assertWriteAllowed(collection) {
  if (usingTestBackend() || AUTH_COLLECTIONS.has(collection)) return;
  const profile = getCurrentProfile();
  if (!profile) throw new Error("يجب تسجيل الدخول أولًا");
  const role = profile.role || (profile.is_admin ? "admin" : "counselor");
  if (role === "read_only") throw new Error("هذا الحساب للقراءة فقط");
  if (role !== "admin" && !COUNSELOR_WRITES.has(collection)) throw new Error("هذه العملية تتطلب صلاحية المدير");
}

export const list = (collection) => runtime().list(collection);
export const listWhere = (collection, field, value) => runtime().listWhere(collection, field, value);
export const get = (collection, id) => runtime().get(collection, id);
export const count = (collection) => runtime().count(collection);
export const rpc = (...args) => runtime().rpc(...args);
export function save(collection, record) { assertWriteAllowed(collection); return runtime().save(collection, record); }
export function bulkPut(collection, records) { assertWriteAllowed(collection); return runtime().bulkPut(collection, records); }
export function remove(collection, id) { assertWriteAllowed(collection); return runtime().remove(collection, id); }
export function clear(collection) { assertWriteAllowed(collection); return runtime().clear(collection); }
