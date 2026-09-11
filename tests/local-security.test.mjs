import "fake-indexeddb/auto";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clearSensitiveLocalData,
  DAILY_PRIORITY_DECISIONS_KEY,
  LOCAL_FOLDER_HANDLE_DB,
  ROSTER_EXPORT_SNAPSHOT_DB,
} from "../src/services/local-security.js";

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

function openFolderDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LOCAL_FOLDER_HANDLE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openSnapshotDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ROSTER_EXPORT_SNAPSHOT_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

beforeEach(async () => {
  values.clear();
  for (const dbName of [LOCAL_FOLDER_HANDLE_DB, ROSTER_EXPORT_SNAPSHOT_DB]) {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = request.onerror = request.onblocked = resolve;
    });
  }
});

test("تسجيل الخروج يمسح بيانات الطلبة المحلية ويُبقي تفضيلات الواجهة", async () => {
  localStorage.setItem(DAILY_PRIORITY_DECISIONS_KEY, '{"s1":"reviewed"}');
  localStorage.setItem("masar_install_dismissed", "1");
  const db = await openFolderDb();
  db.close();
  const snapshotDb = await openSnapshotDb();
  snapshotDb.close();

  await clearSensitiveLocalData();

  assert.equal(localStorage.getItem(DAILY_PRIORITY_DECISIONS_KEY), null);
  assert.equal(localStorage.getItem("masar_install_dismissed"), "1");

  for (const dbName of [LOCAL_FOLDER_HANDLE_DB, ROSTER_EXPORT_SNAPSHOT_DB]) {
    let recreated = false;
    const reopened = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => { recreated = true; };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    assert.equal(recreated, true, `${dbName} should have been deleted`);
    reopened.close();
  }
});
