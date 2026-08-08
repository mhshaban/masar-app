// طبقة تخزين مسار السحابية — بديل local-runtime.js (IndexedDB) بنفس
// التوقيع بالضبط (list/get/save/bulkPut/remove/count/clear)، فلا يحتاج أي
// ملف *-service.js يتغيّر بمنطقه — فقط سطر الاستيراد.
//
// بدون أي SDK خارجي (نفس فلسفة CCE ونفس فلسفة مسار "بدون خطوة بناء"):
// نداءات fetch مباشرة على REST endpoints تبع PostgREST/Supabase. كل صف
// مخزّن كـ {id, data jsonb} — data يحمل السجل الكامل تمامًا كما كان يُخزَّن
// بـ IndexedDB، فيتحول list()/get() له بإرجاع {...row.data, id: row.id}.
//
// منفذ اختبار: لو globalThis.__MASAR_TEST_BACKEND__ موجود (تزرعه
// tests/helpers/fake-cloud-backend.mjs قبل استيراد أي ملف خدمة، بنفس
// أسلوب fake-indexeddb/auto القديم بالضبط)، كل دالة تُفوَّض له مباشرة
// بدون أي fetch حقيقي — يخلي اختبارات Node تشتغل بدون شبكة ولا متصفح.
import { SB_URL, SB_KEY, getAccessToken } from "./supabase-config.js";

function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function testBackend() {
  return typeof globalThis !== "undefined" ? globalThis.__MASAR_TEST_BACKEND__ : null;
}

function buildHeaders(extra = {}) {
  const token = getAccessToken();
  return {
    "Content-Type": "application/json",
    apikey: SB_KEY,
    Authorization: `Bearer ${token || SB_KEY}`,
    ...extra,
  };
}

async function request(path, options = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...buildHeaders(), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Supabase request failed: ${res.status}`);
  }
  return res;
}

function rowToRecord(row) {
  return { ...row.data, id: row.id };
}

// حجم دفعة معقول لطلبات bulkPut/clear الكبيرة (استيراد درجات آلاف
// الطلاب دفعة وحدة) — يحمي من طلب HTTP ضخم واحد بدل تعطيل الحد الأقصى.
const CHUNK_SIZE = 500;

// PostgREST يرجّع حد أقصى لعدد الصفوف بكل طلب (غالبًا 1000 افتراضيًا على
// Supabase) بصمت — بلا خطأ، فقط صفحة واحدة بدل الكل. رُصد هذا فعليًا: سجل
// طلبة فيه أكثر من 1000 صف كان يظهر "1000" فقط بكل شاشة تعتمد على list()
// (الإحصائيات، البحث...)، رغم إن كل الصفوف كانت محفوظة صح بقاعدة البيانات
// فعليًا — المشكلة بالقراءة فقط. نجلب صفحة صفحة حتى تكون آخر صفحة أصغر من
// حجم الصفحة (يعني ما تبقى شي).
const PAGE_SIZE = 1000;

export async function list(collection) {
  const backend = testBackend();
  if (backend) return backend.list(collection);
  const allRows = [];
  let offset = 0;
  while (true) {
    const res = await request(`${collection}?select=id,data&order=id.asc`, {
      headers: { Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    const page = await res.json();
    allRows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allRows.map(rowToRecord);
}

export async function get(collection, id) {
  const backend = testBackend();
  if (backend) return backend.get(collection, id);
  const res = await request(`${collection}?select=id,data&id=eq.${encodeURIComponent(id)}`);
  const rows = await res.json();
  return rows.length ? rowToRecord(rows[0]) : null;
}

export async function save(collection, record) {
  const backend = testBackend();
  if (backend) return backend.save(collection, record);
  const toSave = record.id ? record : { ...record, id: genId() };
  await request(collection, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ id: toSave.id, data: toSave }]),
  });
  return toSave;
}

export async function bulkPut(collection, records) {
  const backend = testBackend();
  if (backend) return backend.bulkPut(collection, records);
  if (!records.length) return;
  const rows = records.map((record) => {
    const toSave = record.id ? record : { ...record, id: genId() };
    return { id: toSave.id, data: toSave };
  });
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await request(collection, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + CHUNK_SIZE)),
    });
  }
}

export async function remove(collection, id) {
  const backend = testBackend();
  if (backend) return backend.remove(collection, id);
  await request(`${collection}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
}

export async function count(collection) {
  const backend = testBackend();
  if (backend) return backend.count(collection);
  const res = await request(`${collection}?select=id`, {
    method: "HEAD",
    headers: { Prefer: "count=exact", Range: "0-0" },
  });
  const range = res.headers.get("content-range") || "";
  const total = Number(range.slice(range.lastIndexOf("/") + 1));
  return Number.isFinite(total) ? total : 0;
}

// PostgREST يرفض DELETE بدون فلتر (حماية من مسح جدول كامل بالخطأ)، فنجيب
// كل المعرّفات أولًا ثم نحذفها على دفعات بفلتر id=in.(...) صريح.
export async function clear(collection) {
  const backend = testBackend();
  if (backend) return backend.clear(collection);
  const all = await list(collection);
  const ids = all.map((r) => r.id);
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const idList = ids.slice(i, i + CHUNK_SIZE).join(",");
    await request(`${collection}?id=in.(${idList})`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
}
