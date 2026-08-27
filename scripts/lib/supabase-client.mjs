// عميل REST مستقل بلا أي اعتماد على cloud-runtime.js (اللي مبني على وجود
// جلسة متصفح بـsessionStorage) — منطق تسجيل الدخول منقول من
// scripts/import-certificates.mjs القديم (كان يستورد نفسه)، وclear/bulkPut
// يطابقان بالضبط سلوك cloud-runtime.js's clear()/bulkPut() (نفس الـchunking
// ونفس Prefer headers) حتى لا يختلف الأثر بقاعدة البيانات لو صار الاستدعاء
// من المتصفح لاحقًا لأي سبب.
import readline from "node:readline";
import { SB_URL, SB_KEY } from "../../src/services/supabase-config.js";

const PAGE_SIZE = 1000;
const CHUNK_SIZE = 500;

export function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

// إخفاء كلمة المرور أثناء الكتابة بالطرفية.
export function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onData = (char) => {
      char = char.toString();
      if (["\n", "\r", ""].includes(char)) return;
      readline.moveCursor(process.stdout, -1, 0);
      process.stdout.write("*");
    };
    process.stdin.on("data", onData);
    rl.question(question, (answer) => {
      process.stdin.removeListener("data", onData);
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

export async function resolveIdentifier(identifier) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/masar_resolve_login_identifier`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    body: JSON.stringify({ p_identifier: identifier }),
  });
  if (!res.ok) throw new Error("تعذّر التحقق من اسم المستخدم.");
  return res.json();
}

export async function login(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SB_KEY },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("اسم المستخدم أو كلمة المرور غير صحيحة.");
  const data = await res.json();
  return data.access_token;
}

// يسجّل الدخول تفاعليًا بالطرفية — يرجّع access token، بلا كتابة أي شيء
// لملف ولا إرسال لغير Supabase مباشرة.
export async function loginInteractive() {
  const identifier = await prompt("اسم المستخدم أو الإيميل: ");
  const password = await promptHidden("كلمة المرور: ");
  console.log("جارٍ تسجيل الدخول...");
  const email = (await resolveIdentifier(identifier)) || identifier;
  const token = await login(email, password);
  console.log("تم تسجيل الدخول بنجاح.\n");
  return token;
}

// نفس منطق cloud-runtime.js's list() (تصفّح صفحات كاملة عبر Range) — بلا
// أي كاش هنا، السكربت يشتغل تشغيلة واحدة وينتهي.
export async function listAll(token, collection) {
  const allRows = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${SB_URL}/rest/v1/${collection}?select=id,data&order=id.asc`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}`, Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    if (!res.ok) throw new Error(`تعذّر تحميل ${collection} من Supabase: ` + (await res.text()));
    const page = await res.json();
    allRows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return allRows.map((r) => ({ ...r.data, id: r.id }));
}

export async function fetchStudents(token) {
  return listAll(token, "students");
}

export async function listIds(token, collection) {
  const existing = await listAll(token, collection);
  return existing.map((r) => r.id);
}

// يحذف قائمة ids محدَّدة على دفعات id=in.(...) — بدل DELETE بلا فلتر.
export async function deleteIds(token, collection, ids) {
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const idList = ids.slice(i, i + CHUNK_SIZE).map(encodeURIComponent).join(",");
    const res = await fetch(`${SB_URL}/rest/v1/${collection}?id=in.(${idList})`, {
      method: "DELETE",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}`, Prefer: "return=minimal" },
    });
    if (!res.ok) throw new Error(`فشل حذف بيانات ${collection} القديمة: ` + (await res.text()));
  }
  return ids.length;
}

// نفس سلوك cloud-runtime.js's clear() بالضبط: يجيب كل الـids الحالية أولًا
// ثم يحذفها على دفعات. لا يُستخدم بسكربت التحليل (يكتب-ثم-يشذّب بدل
// يمسح-ثم-يكتب — راجع cowork-analyze-grades.mjs)، مُبقى هنا لأي استخدام مستقبلي.
export async function clearCollection(token, collection) {
  const ids = await listIds(token, collection);
  return deleteIds(token, collection, ids);
}

export async function bulkPut(token, collection, records) {
  if (!records.length) return;
  const rows = records.map((record) => ({ id: record.id, data: record }));
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const res = await fetch(`${SB_URL}/rest/v1/${collection}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SB_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows.slice(i, i + CHUNK_SIZE)),
    });
    if (!res.ok) throw new Error(`فشل الحفظ بمجموعة ${collection}: ` + (await res.text()));
  }
}
