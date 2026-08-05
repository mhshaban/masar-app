import "./helpers/fake-cloud-backend.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { COLLECTIONS } from "../src/core/config.js";
import { clear } from "../src/services/cloud-runtime.js";
import { getProgress, saveProgress, addAttachment, removeAttachment, MAX_ATTACHMENT_BYTES } from "../src/modules/execution/execution-service.js";

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

test("getProgress returns sane defaults, including an empty attachments array, for an action never touched", async () => {
  const p = await getProgress("proj1-a1");
  assert.equal(p.status, "not_started");
  assert.deepEqual(p.attachments, []);
});

test("saveProgress persists an effectiveness report alongside the existing fields", async () => {
  const saved = await saveProgress("proj1-a1", { status: "done", effectivenessReport: "تحقق الهدف بنسبة عالية" });
  assert.equal(saved.effectivenessReport, "تحقق الهدف بنسبة عالية");
  const fetched = await getProgress("proj1-a1");
  assert.equal(fetched.effectivenessReport, "تحقق الهدف بنسبة عالية");
});

test("addAttachment stores the file as a data URL without touching other progress fields", async () => {
  await saveProgress("proj1-a1", { status: "done", proofNote: "حضور فعلي" });
  const file = new File([new Uint8Array([1, 2, 3, 4])], "evidence.pdf", { type: "application/pdf" });

  const updated = await addAttachment("proj1-a1", file);
  assert.equal(updated.attachments.length, 1);
  assert.equal(updated.attachments[0].name, "evidence.pdf");
  assert.equal(updated.attachments[0].size, 4);
  assert.ok(updated.attachments[0].dataUrl.startsWith("data:application/pdf;base64,"));
  assert.equal(updated.proofNote, "حضور فعلي", "unrelated fields must survive");
});

test("addAttachment rejects a file larger than the size cap", async () => {
  const bigFile = new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], "too-big.jpg", { type: "image/jpeg" });
  await assert.rejects(() => addAttachment("proj1-a1", bigFile));
});

test("removeAttachment removes only the targeted attachment", async () => {
  const fileA = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
  const fileB = new File([new Uint8Array([2])], "b.jpg", { type: "image/jpeg" });
  await addAttachment("proj1-a1", fileA);
  const afterB = await addAttachment("proj1-a1", fileB);
  const [attA, attB] = afterB.attachments;

  const afterRemove = await removeAttachment("proj1-a1", attA.id);
  assert.equal(afterRemove.attachments.length, 1);
  assert.equal(afterRemove.attachments[0].id, attB.id);
});

test("attachments are scoped to their own action, not shared across actions", async () => {
  const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
  await addAttachment("proj1-a1", file);
  const other = await getProgress("proj1-a2");
  assert.deepEqual(other.attachments, []);
});
