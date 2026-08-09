// يزرع نسخة ذاكرة بسيطة (Map لكل مجموعة) تحت globalThis.__MASAR_TEST_BACKEND__
// — نفس المفتاح اللي cloud-runtime.js يتفقّده قبل أي fetch حقيقي — بنفس
// أسلوب "import 'fake-indexeddb/auto' قبل استيراد ملف الخدمة" القديم
// بالضبط، فملفات الاختبار الحالية ما تحتاج تغيير أي assertion، فقط استبدال
// سطر الاستيراد هذا.
const store = new Map();

function collectionMap(collection) {
  if (!store.has(collection)) store.set(collection, new Map());
  return store.get(collection);
}

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

globalThis.__MASAR_TEST_BACKEND__ = {
  async list(collection) {
    return [...collectionMap(collection).values()].map((r) => ({ ...r }));
  },
  async get(collection, id) {
    const record = collectionMap(collection).get(id);
    return record ? { ...record } : null;
  },
  async listWhere(collection, field, value) {
    return [...collectionMap(collection).values()]
      .filter((r) => String(r[field]) === String(value))
      .map((r) => ({ ...r }));
  },
  async save(collection, record) {
    const toSave = record.id ? record : { ...record, id: genId() };
    collectionMap(collection).set(toSave.id, { ...toSave });
    return toSave;
  },
  async bulkPut(collection, records) {
    const map = collectionMap(collection);
    for (const record of records) {
      const toSave = record.id ? record : { ...record, id: genId() };
      map.set(toSave.id, { ...toSave });
    }
  },
  async remove(collection, id) {
    collectionMap(collection).delete(id);
  },
  async count(collection) {
    return collectionMap(collection).size;
  },
  async clear(collection) {
    collectionMap(collection).clear();
  },
};
