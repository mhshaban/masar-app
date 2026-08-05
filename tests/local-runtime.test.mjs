import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { list, get, save, bulkPut, remove, count, clear } from "../src/services/local-runtime.js";

const COLLECTION = "reminders";

beforeEach(async () => {
  await clear(COLLECTION);
});

test("save assigns an id when none is given, and get retrieves it back", async () => {
  const saved = await save(COLLECTION, { text: "متابعة الطالب" });
  assert.ok(saved.id);
  const fetched = await get(COLLECTION, saved.id);
  assert.deepEqual(fetched, saved);
});

test("save with an explicit id overwrites the same record", async () => {
  await save(COLLECTION, { id: "r1", text: "أول" });
  await save(COLLECTION, { id: "r1", text: "محدَّث" });
  const rows = await list(COLLECTION);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].text, "محدَّث");
});

test("bulkPut inserts many records in one transaction", async () => {
  await bulkPut(COLLECTION, [
    { id: "r1", text: "a" },
    { id: "r2", text: "b" },
    { id: "r3", text: "c" },
  ]);
  assert.equal(await count(COLLECTION), 3);
  const rows = await list(COLLECTION);
  assert.deepEqual(rows.map((r) => r.id).sort(), ["r1", "r2", "r3"]);
});

test("remove deletes a single record", async () => {
  await bulkPut(COLLECTION, [{ id: "r1", text: "a" }, { id: "r2", text: "b" }]);
  await remove(COLLECTION, "r1");
  assert.equal(await get(COLLECTION, "r1"), null);
  assert.equal(await count(COLLECTION), 1);
});

test("clear empties the whole collection", async () => {
  await bulkPut(COLLECTION, [{ id: "r1", text: "a" }, { id: "r2", text: "b" }]);
  await clear(COLLECTION);
  assert.equal(await count(COLLECTION), 0);
  assert.deepEqual(await list(COLLECTION), []);
});

test("get on a missing id returns null, not undefined", async () => {
  assert.equal(await get(COLLECTION, "nope"), null);
});
