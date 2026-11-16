import { test } from "node:test";
import assert from "node:assert/strict";

// IndexedDB مصغّر يحفظ المراجع كما هي (مقبض المجلد الحقيقي غير قابل للنسخ
// بـstructuredClone داخل fake-indexeddb لأن المحاكاة فيها دوال).
function memoryIndexedDb() {
  const data = new Map();
  const request = (fn) => {
    const req = {};
    setTimeout(() => { req.result = fn(); req.onsuccess?.(); });
    return req;
  };
  const db = {
    close() {},
    transaction() {
      const tx = {
        objectStore: () => ({
          put(value, key) { data.set(key, value); setTimeout(() => tx.oncomplete?.()); },
          get: (key) => request(() => data.get(key)),
        }),
      };
      return tx;
    },
  };
  return { open: () => request(() => db) };
}
globalThis.indexedDB = memoryIndexedDb();

// مجلد محفوظ سقطت صلاحيته: أول نقرة بالصفحة تطلب الصلاحية ثم تعرض الصور.
test("requests saved photo-folder permission on the first click, then reloads photos", async () => {
  let permission = "prompt";
  let requests = 0;
  const handle = {
    name: "masar",
    queryPermission: async () => permission,
    requestPermission: async () => { requests += 1; permission = "granted"; return permission; },
  };
  const listeners = new Map();
  globalThis.window = { showDirectoryPicker: async () => handle };
  globalThis.document = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); },
  };
  const folder = await import("../src/modules/dashboard/dashboard-local-folder.js");
  const photos = await import("../src/modules/students/student-photo-local.js");

  assert.equal(await folder.getMasarFolderPermissionState(), "none");
  await folder.getMasarFolderHandle({ prompt: true }); // يحفظ المجلد (وتُمنح الصلاحية)
  permission = "prompt"; // محاكاة إغلاق المتصفح
  requests = 0;

  let reloaded = 0;
  const done = new Promise((resolve) => {
    void photos.requestStudentPhotoAccessOnNextGesture(() => { reloaded += 1; resolve(); });
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(requests, 0, "no permission request before a user click");
  assert.ok(listeners.has("click"));
  listeners.get("click")();
  await done;
  assert.equal(requests, 1);
  assert.equal(reloaded, 1);
  assert.equal(listeners.has("click"), false);
  assert.equal(await photos.requestStudentPhotoAccessOnNextGesture(() => {}), "granted");
  assert.equal(listeners.has("click"), false, "nothing armed once granted");
});
