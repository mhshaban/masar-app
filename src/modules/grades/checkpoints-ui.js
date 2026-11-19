// واجهات الوقفات التقويمية:
// 1) بطاقة بملف الطالب: الوقفتان جنبًا إلى جنب + المقارنة + التقرير وزر الإرسال.
// 2) تبويب بشاشة الدرجات: استيراد ملف وقفة، ملخص، واختيار المستلمين (طالب /
//    شعبة / مستوى) ثم قائمة إرسال تمر على الطلاب واحدًا واحدًا.
import { readWorkbook } from "../../services/xlsx-parser.js";
import { ensureXlsx } from "../../services/vendor-loader.js?v=2026-11-18-checkpoints-1";
import { listStudents } from "../students/students-service.js?v=2026-08-31-record-edit-1";
import { formatPct } from "../shared/format-pct.js?v=2026-10-01-avg-decimals-1";
import { notify, confirmDialog } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { logAuditEvent } from "../audit/audit-service.js?v=2026-09-04-audit-1";
import { CHECKPOINT_LABELS, TREND_LABELS, DEFAULT_TERM, parseCheckpointRows, buildCheckpointRecords, commitCheckpointRecords, compareCheckpoints, getStudentCheckpoints, termsOf, COLLECTION } from "./checkpoint-service.js?v=2026-11-19-missing-courses-2";
import { mountPlanCard } from "./checkpoint-plan-ui.js?v=2026-11-19-missing-courses-2";
import { mountZeroReview } from "./checkpoint-zeros-ui.js?v=2026-11-19-missing-courses-2";
import { buildStudentReport, sendStudentReport, downloadStudentReport, allCheckpointRecords } from "./checkpoint-send.js?v=2026-11-19-missing-courses-2";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (v) => (v == null ? "—" : `${formatPct(v)}٪`);
const FIELD = "padding:8px 10px;border:1px solid var(--border);border-radius:9px;font-family:inherit;font-size:13px;background:var(--surface);color:inherit;";
const STATUS = { absent: "غائب", barred: "محروم" };
const TREND_PILL = { up: "pill-success", down: "pill-critical", steady: "pill-warning" };
const entryText = (e) => (!e ? "—" : e.status ? STATUS[e.status] : e.maxScore ? `${e.score} / ${e.maxScore} (${pct(e.pct)})` : pct(e.pct));
const deltaText = (d) => (d == null ? "—" : `<bdi dir="ltr">${d > 0 ? "+" : ""}${formatPct(d)}</bdi>`);
const sentLabel = (iso) => (iso ? new Date(iso).toLocaleString("ar-BH-u-nu-latn", { dateStyle: "short", timeStyle: "short" }) : "");

async function withBusy(button, label, task) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try { return await task(); } catch (error) { notify(error.message || "تعذّر تنفيذ العملية"); return null; } finally { button.disabled = false; button.textContent = original; }
}

function comparisonTable(comparison) {
  if (!comparison.subjects.length) return '<p class="hint">لا توجد درجات وقفات تقويمية لهذا الطالب.</p>';
  return `<div class="tablewrap"><table>
    <thead><tr><th>المقرر</th><th>${CHECKPOINT_LABELS[1]}</th><th>${CHECKPOINT_LABELS[2]}</th><th>التغيّر</th></tr></thead>
    <tbody>${comparison.subjects.map((s) => `<tr>
      <td>${esc(s.name || s.code)}${s.code && s.name ? ` <span class="hint" dir="ltr">${esc(s.code)}</span>` : ""}</td>
      <td class="num">${esc(entryText(s.first))}</td>
      <td class="num">${comparison.second ? esc(entryText(s.second)) : '<span class="hint">لم تُرصد بعد</span>'}</td>
      <td>${s.trend ? `<span class="pill ${TREND_PILL[s.trend]}">${deltaText(s.delta)} · ${TREND_LABELS[s.trend]}</span>` : "—"}</td>
    </tr>`).join("")}</tbody>
    <tfoot><tr><th>المعدل</th><th class="num">${pct(comparison.firstAvg)}</th><th class="num">${pct(comparison.secondAvg)}</th><th>${comparison.trend ? `<span class="pill ${TREND_PILL[comparison.trend]}">${deltaText(comparison.delta)} · ${TREND_LABELS[comparison.trend]}</span>` : "—"}</th></tr></tfoot>
  </table></div>`;
}

// ── بطاقة ملف الطالب ───────────────────────────────────────────────────────
export async function renderStudentCheckpointsCard(root, student) {
  const records = await getStudentCheckpoints(student);
  const terms = termsOf(records);
  if (!terms.length) {
    root.innerHTML = '<div class="card" style="margin-bottom:16px;"><h2>الوقفات التقويمية</h2><p class="hint">لا توجد درجات وقفات تقويمية مستوردة لهذا الطالب بعد.</p></div>';
    return;
  }
  let term = terms[terms.length - 1];
  const draw = () => {
    const comparison = compareCheckpoints(records, term);
    const sentAt = comparison.second?.reportSentAt || comparison.first?.reportSentAt;
    root.innerHTML = `<div class="card" style="margin-bottom:16px;">
      <div class="card-head">
        <div><h2>الوقفات التقويمية</h2><div class="hint">${esc(term)}${sentAt ? ` · آخر إرسال للتقرير: ${esc(sentLabel(sentAt))}` : ""}</div></div>
        <div class="forms-actions">
          ${terms.length > 1 ? `<select style="${FIELD}" id="cp-term">${terms.map((t) => `<option ${t === term ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>` : ""}
          <button class="btn btn-ghost" id="cp-preview">عرض التقرير</button>
          <button class="btn btn-ghost" id="cp-pdf">تنزيل PDF</button>
          <button class="btn btn-primary" id="cp-send" ${student.email ? "" : 'disabled title="لا يوجد بريد إلكتروني للطالب"'}>إرسال للطالب</button>
        </div>
      </div>
      ${comparisonTable(comparison)}
      <div id="cp-report-preview" style="margin-top:14px;"></div>
    </div>`;
    root.querySelector("#cp-term")?.addEventListener("change", (e) => { term = e.target.value; draw(); });
    root.querySelector("#cp-preview").addEventListener("click", async (e) => {
      const box = root.querySelector("#cp-report-preview");
      if (box.innerHTML) { box.innerHTML = ""; e.currentTarget.textContent = "عرض التقرير"; return; }
      const { html } = await buildStudentReport(student, term, records);
      box.innerHTML = `<div style="border:1px solid var(--border);border-radius:12px;padding:16px;background:#fff;">${html}</div>`;
      e.currentTarget.textContent = "إخفاء التقرير";
    });
    root.querySelector("#cp-pdf").addEventListener("click", (e) => withBusy(e.currentTarget, "جارٍ التجهيز…", () => downloadStudentReport(student, term)));
    root.querySelector("#cp-send").addEventListener("click", (e) => withBusy(e.currentTarget, "جارٍ التجهيز…", async () => {
      await sendStudentReport(student, term, { records });
      notify("تم تنزيل رسالة البريد والتقرير مرفق فيها. افتح الملف المنزَّل (.eml) يفتح في Outlook، ثم اضغط إرسال.");
      const fresh = await getStudentCheckpoints(student);
      records.splice(0, records.length, ...fresh);
      draw();
    }));
  };
  draw();
}

// ── تبويب شاشة الدرجات ─────────────────────────────────────────────────────
function importCard() {
  return `<div class="card" style="margin-bottom:16px;">
    <h2>استيراد درجات وقفة تقويمية</h2>
    <p class="hint">ملف Excel بالدرجات (صف لكل طالب × مقرر، أو صف لكل طالب بأعمدة المقررات). يُطابَق الطلاب بالرقم الأكاديمي، والطلاب غير المسجلين بسجل الطلبة يُستبعدون. استيراد نفس الوقفة مرة ثانية يستبدل درجاتها.</p>
    <div class="forms-actions" style="margin-bottom:10px;">
      <select style="${FIELD}" id="cp-import-checkpoint"><option value="1">${CHECKPOINT_LABELS[1]}</option><option value="2">${CHECKPOINT_LABELS[2]}</option></select>
      <input id="cp-import-term" value="${esc(DEFAULT_TERM)}" aria-label="الفصل الدراسي" style="${FIELD}">
      <input type="file" id="cp-import-file" accept=".xlsx,.xls" aria-label="ملف الدرجات">
    </div>
    <div id="cp-import-preview"></div>
  </div>`;
}

async function parseFile(file) {
  await ensureXlsx();
  const { sheetNames, sheets } = await readWorkbook(file);
  const errors = [];
  for (const name of sheetNames) {
    try {
      const parsed = parseCheckpointRows(sheets[name] || []);
      if (parsed.size) return { sheetName: name, parsed };
    } catch (error) { errors.push(`${name}: ${error.message}`); }
  }
  throw new Error(errors.join(" · ") || "الملف فارغ.");
}

function wireImport(root, refresh) {
  const input = root.querySelector("#cp-import-file");
  const preview = root.querySelector("#cp-import-preview");
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const checkpoint = Number(root.querySelector("#cp-import-checkpoint").value);
    const term = root.querySelector("#cp-import-term").value.trim() || DEFAULT_TERM;
    preview.innerHTML = '<p class="hint">جارٍ قراءة الملف…</p>';
    try {
      const [{ sheetName, parsed }, students] = await Promise.all([parseFile(file), listStudents()]);
      const { records, unmatched } = buildCheckpointRecords(parsed, students, { checkpoint, term, sourceFile: file.name });
      const subjects = new Set(records.flatMap((r) => r.subjects.map((s) => s.name || s.code)));
      preview.innerHTML = `<p class="hint">الشيت: ${esc(sheetName)} · ${records.length} طالبًا مطابقًا · ${subjects.size} مقررًا${unmatched.length ? ` · استُبعد ${unmatched.length} غير مسجلين بسجل الطلبة` : ""}.</p>
        <div class="forms-actions"><button class="btn btn-primary" id="cp-import-commit" ${records.length ? "" : "disabled"}>حفظ درجات ${CHECKPOINT_LABELS[checkpoint]} (${esc(term)})</button></div>`;
      root.querySelector("#cp-import-commit")?.addEventListener("click", async (e) => {
        if (!await confirmDialog(`سيتم حفظ درجات ${CHECKPOINT_LABELS[checkpoint]} لـ${records.length} طالبًا، واستبدال أي درجات سابقة لنفس الوقفة. متابعة؟`)) return;
        await withBusy(e.currentTarget, "جارٍ الحفظ…", async () => {
          const result = await commitCheckpointRecords(records, { checkpoint, term });
          await logAuditEvent("import_checkpoint_grades", { tableName: COLLECTION, count: result.saved });
          preview.innerHTML = `<p class="hint" role="status">تم حفظ ${result.saved} طالبًا${result.removed ? ` وحذف ${result.removed} سجلًا قديمًا لم يعد بالملف` : ""}.</p>`;
          input.value = "";
          await refresh();
        });
      });
    } catch (error) {
      preview.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message)}</p>`;
    }
  });
}

function buildRows(records, students, term) {
  const byStudent = new Map();
  for (const r of records.filter((x) => x.term === term)) {
    if (!byStudent.has(r.studentId)) byStudent.set(r.studentId, []);
    byStudent.get(r.studentId).push(r);
  }
  const studentById = new Map(students.map((s) => [String(s.academicId || s.id), s]));
  const rows = [];
  for (const [studentId, recs] of byStudent) {
    const student = studentById.get(studentId);
    if (!student) continue; // غير مسجل حاليًا — مستبعد
    const c = compareCheckpoints(recs, term);
    rows.push({ student, records: recs, c, sentAt: c.second?.reportSentAt || c.first?.reportSentAt || null });
  }
  return rows.sort((a, b) => String(a.student.section).localeCompare(String(b.student.section), "ar") || String(a.student.name).localeCompare(String(b.student.name), "ar"));
}

function summaryCards(rows) {
  const withFirst = rows.filter((r) => r.c.firstAvg != null);
  const withSecond = rows.filter((r) => r.c.secondAvg != null);
  const avg = (list, key) => (list.length ? list.reduce((s, r) => s + r.c[key], 0) / list.length : null);
  const up = rows.filter((r) => r.c.trend === "up").length;
  const down = rows.filter((r) => r.c.trend === "down").length;
  return `<div class="grid g4" style="margin-bottom:16px;">
    <div class="card stat"><div class="label">${CHECKPOINT_LABELS[1]}</div><div class="value">${pct(avg(withFirst, "firstAvg"))}</div><div class="hint">${withFirst.length} طالبًا</div></div>
    <div class="card stat"><div class="label">${CHECKPOINT_LABELS[2]}</div><div class="value">${pct(avg(withSecond, "secondAvg"))}</div><div class="hint">${withSecond.length} طالبًا</div></div>
    <div class="card stat"><div class="label">تحسّن / تراجع</div><div class="value">${up} / ${down}</div><div class="hint">بين الوقفتين</div></div>
    <div class="card stat"><div class="label">أُرسل لهم التقرير</div><div class="value">${rows.filter((r) => r.sentAt).length}</div><div class="hint">من ${rows.length}</div></div>
  </div>`;
}

export async function mountCheckpointsTab(root, { onGoto } = {}) {
  const load = async () => {
    const [records, students] = await Promise.all([allCheckpointRecords(), listStudents()]);
    return { records, students, terms: termsOf(records) };
  };
  let data = await load();
  let term = data.terms[data.terms.length - 1] || DEFAULT_TERM;
  const filters = { level: "", section: "", query: "", trend: "", unsent: false };
  const selected = new Set();
  let queue = [];
  const planState = { open: true, category: "low", group: "", level: "", section: "", query: "", pending: false, expanded: null };
  const zeroState = { open: false, dept: "", section: "", checkpoint: "", showConfirmed: false };

  const render = () => {
    const rows = buildRows(data.records, data.students, term);
    const levels = [...new Set(rows.map((r) => r.student.level).filter(Boolean))].sort();
    const sections = [...new Set(rows.filter((r) => !filters.level || r.student.level === filters.level).map((r) => r.student.section).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ar"));
    const q = filters.query.trim();
    const visible = rows.filter((r) => (!filters.level || r.student.level === filters.level)
      && (!filters.section || r.student.section === filters.section)
      && (!filters.trend || r.c.trend === filters.trend || (filters.trend === "weak" && (r.c.weakFirst || r.c.weakSecond)))
      && (!filters.unsent || !r.sentAt)
      && (!q || String(r.student.name).includes(q) || String(r.student.academicId).includes(q)));
    const allOn = visible.length && visible.every((r) => selected.has(r.student.id));
    root.innerHTML = `${importCard()}
      ${rows.length ? summaryCards(rows) : ""}
      <div id="cp-plan"></div>
      <div id="cp-zeros"></div>
      <div class="card">
        <div class="card-head">
          <div><h2>اختيار الطلاب لإرسال تقرير التحصيل الأكاديمي</h2><div class="hint">${esc(term)} · اختر طالبًا أو شعبة كاملة أو مستوى، ثم «تجهيز الإرسال».</div></div>
          ${data.terms.length > 1 ? `<select style="${FIELD}" id="cp-term">${data.terms.map((t) => `<option ${t === term ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>` : ""}
        </div>
        ${rows.length ? `
        <div class="forms-actions" style="margin-bottom:10px;">
          <select style="${FIELD}" id="cp-f-level"><option value="">كل المستويات</option>${levels.map((l) => `<option ${l === filters.level ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>
          <select style="${FIELD}" id="cp-f-section"><option value="">كل الشعب</option>${sections.map((s) => `<option ${s === filters.section ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
          <select style="${FIELD}" id="cp-f-trend">
            <option value="">الكل</option>
            <option value="weak" ${filters.trend === "weak" ? "selected" : ""}>لديهم مادة أقل من 50٪</option>
            <option value="up" ${filters.trend === "up" ? "selected" : ""}>تحسّن</option>
            <option value="down" ${filters.trend === "down" ? "selected" : ""}>تراجع</option>
          </select>
          <label class="hint"><input type="checkbox" id="cp-f-unsent" ${filters.unsent ? "checked" : ""}> لم يُرسل لهم بعد</label>
          <input id="cp-f-query" placeholder="بحث بالاسم أو الرقم" value="${esc(filters.query)}" style="${FIELD}">
        </div>
        <div class="forms-actions" style="margin-bottom:10px;">
          <button class="btn btn-primary" id="cp-queue" ${selected.size ? "" : "disabled"}>تجهيز الإرسال (${selected.size})</button>
          ${selected.size ? '<button class="btn btn-ghost" id="cp-clear">إلغاء التحديد</button>' : ""}
        </div>
        <div id="cp-queue-panel"></div>
        <div class="tablewrap"><table>
          <thead><tr><th><input type="checkbox" id="cp-all" ${allOn ? "checked" : ""} aria-label="تحديد الكل"></th><th>الطالب</th><th>الشعبة</th><th>${CHECKPOINT_LABELS[1]}</th><th>${CHECKPOINT_LABELS[2]}</th><th>التغيّر</th><th>مواد أقل من 50٪</th><th>الإرسال</th></tr></thead>
          <tbody>${visible.map((r) => `<tr>
            <td><input type="checkbox" data-pick="${esc(r.student.id)}" ${selected.has(r.student.id) ? "checked" : ""} ${r.student.email ? "" : 'disabled title="لا يوجد بريد إلكتروني"'}></td>
            <td><a href="#" data-goto-student="${esc(r.student.id)}">${esc(r.student.name)}</a></td>
            <td>${esc(r.student.level)} ${esc(r.student.section)}</td>
            <td class="num">${pct(r.c.firstAvg)}</td>
            <td class="num">${pct(r.c.secondAvg)}</td>
            <td>${r.c.trend ? `<span class="pill ${TREND_PILL[r.c.trend]}">${deltaText(r.c.delta)}</span>` : "—"}</td>
            <td class="num">${r.c.second ? r.c.weakSecond : r.c.weakFirst}</td>
            <td>${r.sentAt ? `<span class="pill pill-success">${esc(sentLabel(r.sentAt))}</span>` : '<span class="hint">لم يُرسل</span>'}</td>
          </tr>`).join("")}</tbody>
        </table></div>
        <p class="hint">${visible.length} طالبًا معروضًا.</p>` : '<div class="empty">لا توجد درجات وقفات تقويمية مستوردة بعد — استورد ملف الوقفة الأولى من الأعلى.</div>'}
      </div>`;

    wireImport(root, async () => { data = await load(); term = data.terms.includes(term) ? term : data.terms[data.terms.length - 1] || DEFAULT_TERM; render(); });
    mountPlanCard(root.querySelector("#cp-plan"), { records: data.records, students: data.students, term, state: planState });
    mountZeroReview(root.querySelector("#cp-zeros"), { records: data.records, term, state: zeroState, onChanged: () => mountPlanCard(root.querySelector("#cp-plan"), { records: data.records, students: data.students, term, state: planState }) });
    const on = (sel, ev, fn) => root.querySelector(sel)?.addEventListener(ev, fn);
    on("#cp-term", "change", (e) => { term = e.target.value; selected.clear(); render(); });
    on("#cp-f-level", "change", (e) => { filters.level = e.target.value; filters.section = ""; render(); });
    on("#cp-f-section", "change", (e) => { filters.section = e.target.value; render(); });
    on("#cp-f-trend", "change", (e) => { filters.trend = e.target.value; render(); });
    on("#cp-f-unsent", "change", (e) => { filters.unsent = e.target.checked; render(); });
    on("#cp-f-query", "change", (e) => { filters.query = e.target.value; render(); });
    on("#cp-all", "change", (e) => { for (const r of visible) if (r.student.email) { if (e.target.checked) selected.add(r.student.id); else selected.delete(r.student.id); } render(); });
    on("#cp-clear", "click", () => { selected.clear(); render(); });
    root.querySelectorAll("[data-pick]").forEach((box) => box.addEventListener("change", () => { if (box.checked) selected.add(box.dataset.pick); else selected.delete(box.dataset.pick); render(); }));
    root.querySelectorAll("[data-goto-student]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); onGoto && onGoto("students", { studentId: a.dataset.gotoStudent }); }));
    on("#cp-queue", "click", () => {
      queue = rows.filter((r) => selected.has(r.student.id)).map((r) => ({ row: r, done: false }));
      drawQueue();
    });
    if (queue.length) drawQueue();

    function drawQueue() {
      const panel = root.querySelector("#cp-queue-panel");
      if (!panel) return;
      const next = queue.find((q) => !q.done);
      const doneCount = queue.filter((q) => q.done).length;
      panel.innerHTML = `<div class="card" style="margin-bottom:12px;border-color:var(--clay-500);">
        <div class="card-head"><h3 style="margin:0;font-size:14px;">قائمة الإرسال: ${doneCount} من ${queue.length}</h3><button class="link-btn" id="cp-queue-close">إغلاق</button></div>
        <p class="hint">كل ضغطة تنزّل رسالة بريد جاهزة (.eml) لإيميل الطالب، والتقرير PDF مرفق فيها. افتح الملف المنزَّل يفتح في Outlook، اضغط إرسال، ثم ارجع هنا للطالب التالي. أو نزّل رسائل القائمة كلها مرة وحدة وافتحها واحدة واحدة.</p>
        ${next ? `<div class="forms-actions"><button class="btn btn-primary" id="cp-queue-next">إرسال إلى: ${esc(next.row.student.name)} (${esc(next.row.student.section)})</button><button class="btn btn-ghost" id="cp-queue-skip">تخطّي</button><button class="btn btn-ghost" id="cp-queue-all">تنزيل رسائل الباقين (${queue.length - doneCount})</button></div>` : '<p class="hint" role="status">انتهت القائمة.</p>'}
      </div>`;
      panel.querySelector("#cp-queue-close").addEventListener("click", () => { queue = []; selected.clear(); render(); });
      panel.querySelector("#cp-queue-skip")?.addEventListener("click", () => { next.done = true; next.skipped = true; drawQueue(); });
      panel.querySelector("#cp-queue-all")?.addEventListener("click", (e) => withBusy(e.currentTarget, "جارٍ تجهيز الرسائل…", async () => {
        for (const q of queue.filter((item) => !item.done)) {
          try {
            await sendStudentReport(q.row.student, term, { records: q.row.records });
            q.done = true;
            selected.delete(q.row.student.id);
          } catch (err) { q.done = true; q.skipped = true; notify(`${q.row.student.name}: ${err.message}`); }
          await new Promise((r) => setTimeout(r, 400));
        }
        data = await load();
        render();
      }));
      panel.querySelector("#cp-queue-next")?.addEventListener("click", (e) => withBusy(e.currentTarget, "جارٍ التجهيز…", async () => {
        await sendStudentReport(next.row.student, term, { records: next.row.records });
        next.done = true;
        selected.delete(next.row.student.id);
        data = await load();
        render();
      }));
    }
  };
  render();
}
