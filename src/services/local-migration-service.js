import { COLLECTIONS } from "../core/config.js?v=local-1";
import { get, save, bulkPut, count, clear } from "./local-runtime.js?v=local-1";
import { SB_URL, SB_KEY, getAccessToken, setAccessToken, clearAccessToken } from "./supabase-config.js";

const MIGRATION_ID = "supabase-to-local-v1";
const CLOUD_COLLECTIONS = COLLECTIONS.filter((name) => !["localUsers", "appSettings"].includes(name));
const PAGE_SIZE = 1000;

async function fetchCloudCollection(collection, token) {
  const records = [];
  let offset = 0;
  while (true) {
    const response = await fetch(`${SB_URL}/rest/v1/${collection}?select=id,data&order=id.asc`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}`, Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`تعذر نسخ مجموعة ${collection}`);
    const page = await response.json();
    records.push(...page.map((row) => ({ ...row.data, id: row.id })));
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return records;
}

export async function getMigrationStatus() {
  return get("appSettings", MIGRATION_ID);
}

export async function migrateCloudDataOnce({ onProgress } = {}) {
  const previous = await getMigrationStatus();
  if (previous?.completed) return previous;
  const token = getAccessToken();
  if (!token) return { completed: false, skipped: true, reason: "no-cloud-session" };
  const counts = {};
  for (let index = 0; index < CLOUD_COLLECTIONS.length; index += 1) {
    const collection = CLOUD_COLLECTIONS[index];
    onProgress?.({ collection, index, total: CLOUD_COLLECTIONS.length });
    const rows = await fetchCloudCollection(collection, token);
    await clear(collection);
    if (rows.length) await bulkPut(collection, rows);
    counts[collection] = await count(collection);
  }
  const status = { id: MIGRATION_ID, completed: true, completedAt: new Date().toISOString(), counts };
  await save("appSettings", status);
  return status;
}

export async function authenticateAndMigrateCloudData(email, password, { onProgress } = {}) {
  const response = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: String(email || "").trim(), password }),
  });
  if (!response.ok) throw new Error("تعذر الدخول إلى النسخة السحابية. تحقق من البريد وكلمة المرور");
  const session = await response.json();
  if (!session.access_token) throw new Error("لم تُرجع النسخة السحابية جلسة صالحة");
  setAccessToken(session.access_token, session.expires_in);
  try {
    return await migrateCloudDataOnce({ onProgress });
  } finally {
    clearAccessToken();
  }
}

export async function localDataCounts() {
  const result = {};
  for (const collection of CLOUD_COLLECTIONS) result[collection] = await count(collection);
  return result;
}
