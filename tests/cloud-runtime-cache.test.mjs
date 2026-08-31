import test from "node:test";
import assert from "node:assert/strict";

globalThis.sessionStorage = {
  _store: new Map(),
  getItem(key) { return this._store.get(key) ?? null; },
  setItem(key, value) { this._store.set(key, String(value)); },
  removeItem(key) { this._store.delete(key); },
};

let reads = 0;
globalThis.fetch = async (_url, options = {}) => {
  if (!options.method || options.method === "GET") {
    reads += 1;
    return { ok: true, json: async () => reads === 1 ? [{ id: "r1", data: { id: "r1", value: 1 } }] : [{ id: "r1", data: { id: "r1", value: 2 } }], text: async () => "" };
  }
  return { ok: true, json: async () => ({}), text: async () => "" };
};

const runtime = await import("../src/services/cloud-runtime.js?cache-test");

test("list reuses a collection read until a write invalidates it", async () => {
  const first = await runtime.list("reminders");
  const second = await runtime.list("reminders");
  assert.equal(reads, 1);
  assert.equal(second, first);
  await runtime.save("reminders", { id: "r2", value: 3 });
  const refreshed = await runtime.list("reminders");
  assert.equal(reads, 2);
  assert.equal(refreshed[0].value, 2);
});
