import { test } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";

const session = new Map();
globalThis.sessionStorage = {
  getItem: (key) => session.get(key) ?? null,
  setItem: (key, value) => session.set(key, String(value)),
  removeItem: (key) => session.delete(key),
};
sessionStorage.setItem("masar_sb_access_token", "test-token");
sessionStorage.setItem("masar_sb_token_until", String(Date.now() + 60_000));

test("production restore sends the complete backup to one atomic RPC", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({ students: 1 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const { restoreBackup } = await import("../src/services/backup-service.js?rpc-test=1");
  const collections = Object.fromEntries(COLLECTIONS.map((name) => [name, []]));
  collections.students = [{ id: "s1", name: "طالب" }];
  const backup = { app: "masar", exportedAt: "2026-09-03T00:00:00Z", dbVersion: 5, collections };

  const counts = await restoreBackup(backup);

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/masar_restore_backup$/);
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_backup: backup });
  assert.equal(counts.students, 1);
});
