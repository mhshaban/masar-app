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
import { SB_URL, SB_KEY, getAccessToken, clearAccessToken, markSessionExpired } from "./supabase-config.js";

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

// نقطة العبور الوحيدة لكل طلبات REST (كل الـ18 ملف خدمة تمر من هنا) — أفضل
// مكان مركزي للتعامل مع انتهاء الجلسة: 401 يعني التوكن رفضه الخادم فعليًا
// (منتهي فعلًا، أو الحساب عُطِّل بالمنتصف)، مو بالضرورة نفس حالة الانتهاء
// الاستباقي اللي getAccessToken يتعامل معه بالتوقيت وحده. نظّف الجلسة
// وأعد تحميل الصفحة فورًا — شاشة الدخول (app.js) تعرض حينها "انتهت جلستك"
// بدل شاشة دخول عادية بلا سياق، بدل ما يشوف المستخدم خطأ REST خام.
async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${SB_URL}/rest/v1/${path}`, {
      ...options,
      headers: { ...buildHeaders(), ...(options.headers || {}) },
    });
  } catch {
    throw new Error("تعذّر الاتصال بالخادم. تحقق من اتصال الإنترنت وحاول مرة أخرى.");
  }
  if (res.status === 401) {
    clearAccessToken();
    markSessionExpired();
    window.location.reload();
    throw new Error("انتهت الجلسة — يُعاد تحميل الصفحة.");
  }
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
// كل الكتابات تمر من هذه الطبقة وتبطل الكاش فورًا، لذلك يمكن الاحتفاظ
// بالقراءات خمس دقائق بدل إعادة تنزيل نفس الجداول عند التنقل بين الشاشات.
const READ_CACHE_MS = 5 * 60_000;
const listCache = new Map();
const inFlightLists = new Map();

function invalidateCollection(collection) {
  listCache.delete(collection);
  inFlightLists.delete(collection);
}

// عمليات RPC التي تستبدل أكثر من مجموعة (مثل الاستعادة الذرّية) تحتاج
// إبطال كل القراءات المحفوظة دفعة واحدة بعد نجاح المعاملة.
export function resetCloudReadCache() {
  listCache.clear();
  inFlightLists.clear();
}

export async function list(collection) {
  const backend = testBackend();
  if (backend) return backend.list(collection);
  const cached = listCache.get(collection);
  if (cached && cached.until > Date.now()) return cached.rows;
  if (inFlightLists.has(collection)) return inFlightLists.get(collection);

  const pending = (async () => {
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
    const rows = allRows.map(rowToRecord);
    listCache.set(collection, { rows, until: Date.now() + READ_CACHE_MS });
    return rows;
  })();
  inFlightLists.set(collection, pending);
  try {
    return await pending;
  } finally {
    if (inFlightLists.get(collection) === pending) inFlightLists.delete(collection);
  }
}

// list() fetches an entire collection — correct for screens that genuinely
// need every row (roster stats, cross-student candidate lists), but a real
// cost once a collection is large and the caller only wants one student's
// rows. This asks Supabase to filter server-side on a field inside the
// jsonb `data` column (PostgREST's ->> text-extract operator), instead of
// downloading everything and filtering client-side. Confirmed live: a
// student's academic-path view was taking 3+ minutes before this
// (list("grades") was paging through the whole school's grade rows to find
// one student's — that raw table is gone now that grade import moved to
// Cowork, but termAverages and promotedSubjects still lean on this exact
// mechanism).
export async function listWhere(collection, field, value) {
  const backend = testBackend();
  if (backend) return backend.listWhere(collection, field, value);
  const allRows = [];
  let offset = 0;
  while (true) {
    const res = await request(`${collection}?select=id,data&data->>${field}=eq.${encodeURIComponent(value)}&order=id.asc`, {
      headers: { Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    const page = await res.json();
    allRows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allRows.map(rowToRecord);
}

// قراءة حالة تنفيذ إجراءات الخطة فقط، دون الحقول النصية أو المرفقات
// الموجودة داخل data. يُستخدم كمسار احتياطي خفيف لشاشة أولويات اليوم.
export async function listActionProgressStatuses() {
  const backend = testBackend();
  if (backend) {
    const rows = await backend.list("actionProgress");
    return rows.map((row) => ({ id: row.id, status: row.status || "not_started" }));
  }
  const res = await request('actionProgress?select=id,status:data->>status&order=id.asc');
  return res.json();
}

// يستدعي دالة SQL جاهزة بجانب قاعدة البيانات (Postgres RPC عبر PostgREST) —
// للحسابات التجميعية اللي تكلف كثير لو صارت بالمتصفح بعد تنزيل كل الصفوف
// (راجع masar_search_students كمثال: supabase/migrations/20260823_student_search_rpc.sql).
// بدون منفذ اختبار خاص عمدًا: أي كود يستدعي هذي الدالة بالاختبارات يتحمّل
// مسؤولية موك globalThis.fetch مباشرة (نفس نمط cloud-runtime-pagination
// test.mjs)، لأن هذي الدالة بطبيعتها استثناء (منطق عمل جاهز بجانب
// الخادم)، لا عملية تخزين عامة متل بقية دوال هذا الملف.
export async function rpc(name, args = {}) {
  const res = await request(`rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
  return res.json();
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
  invalidateCollection(collection);
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
  invalidateCollection(collection);
}

export async function remove(collection, id) {
  const backend = testBackend();
  if (backend) return backend.remove(collection, id);
  await request(`${collection}?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  invalidateCollection(collection);
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
  invalidateCollection(collection);
}
