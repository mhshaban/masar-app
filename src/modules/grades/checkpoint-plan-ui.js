// بطاقة «خطة تحسين التحصيل»: تصنيف الطلبة من الوقفة الأولى (متدني/متوسط/
// متفوق)، وجلسات كل فئة، وتسجيل انعقاد الجلسة لكل طالب، وتصدير الكشف.
import { ensureXlsx } from "../../services/vendor-loader.js?v=2026-11-18-checkpoints-1";
import { get, save } from "../../services/cloud-runtime.js";
import { notify } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { formatPct } from "../shared/format-pct.js?v=2026-10-01-avg-decimals-1";
import { COLLECTION, missingSectionCourses } from "./checkpoint-service.js?v=2026-11-21-all-courses-1";
import { CATEGORY_LABELS, GROUP_LABELS, PLAN_SESSIONS, PLAN_GOALS, classifyRecord, sessionsFor, withSessionLog } from "./checkpoint-plan.js?v=2026-11-21-all-courses-1";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FIELD = "padding:7px 9px;border:1px solid var(--border);border-radius:9px;font-family:inherit;font-size:13px;background:var(--surface);color:inherit;";
const LEVELS = ["الأول", "الثاني", "الثالث"];
const CAT_PILL = { low: "pill-critical", mid: "pill-warning", top: "pill-success", none: "", missing: "" };
const MISSING_CLS = { category: "missing", group: "", average: null, weak: [], weakCount: 0 };
const pct = (v) => (v == null ? "—" : `${formatPct(v)}٪`);

function buildPlanRows(records, students, term) {
  const byId = new Map(students.map((s) => [String(s.academicId || s.id), s]));
  const own = records.filter((r) => r.term === term && Number(r.checkpoint) === 1);
  const withRecord = new Set(own.map((r) => String(r.studentId)));
  // طلاب مسجلون في المدرسة ولم ترد أسماؤهم في أي كشف من كشوف الوقفة.
  const missing = own.length ? students.filter((s) => LEVELS.includes(s.level) && !withRecord.has(String(s.academicId || s.id)))
    .map((student) => ({ record: { id: `missing-${student.id}`, studentId: String(student.academicId || student.id), subjects: [] }, student, cls: MISSING_CLS, sessions: [], log: {}, done: 0 })) : [];
  return own.map((record) => {
    const student = byId.get(String(record.studentId));
    if (!student) return null;
    // مقررات الشعبة اللي ما رُصد فيها شي تُحسب غيابًا مثل التقرير.
    const unrecorded = missingSectionCourses(own, record).map((m) => ({ ...m, status: "absent" }));
    const cls = classifyRecord(unrecorded.length ? { ...record, subjects: [...(record.subjects || []), ...unrecorded] } : record);
    const sessions = sessionsFor(cls, student.level);
    const log = record.plan?.sessions || {};
    const done = sessions.filter((s) => log[s.id]?.date).length;
    return { record, student, cls, sessions, log, done };
  }).filter(Boolean).concat(missing).sort((a, b) => LEVELS.indexOf(a.student.level) - LEVELS.indexOf(b.student.level)
    || String(a.student.section).localeCompare(String(b.student.section), "ar") || String(a.student.name).localeCompare(String(b.student.name), "ar"));
}

async function exportRows(rows, category) {
  const XLSX = await ensureXlsx();
  const sessionList = PLAN_SESSIONS[category] || [];
  const data = rows.map((r, i) => {
    const row = { "م": i + 1, "المستوى": r.student.level, "الشعبة": r.student.section, "الرقم الأكاديمي": r.record.studentId, "اسم الطالب": r.student.name,
      "النسبة %": r.cls.average ?? "", "المقررات أقل من 50% أو غياب": r.cls.weak.join("، "), "المجموعة": GROUP_LABELS[r.cls.group] || "" };
    for (const s of sessionList) row[s.title] = r.sessions.some((x) => x.id === s.id) ? (r.log[s.id]?.date || "") : "—";
    return row;
  });
  const sheet = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, sheet, CATEGORY_LABELS[category]);
  XLSX.writeFile(wb, `خطة التحسين - ${CATEGORY_LABELS[category]}.xlsx`, { compression: true });
}

// state: { open, category, group, level, section, query, pending, expanded }
export function mountPlanCard(container, { records, students, term, state, userName = "" }) {
  const rows = buildPlanRows(records, students, term);
  if (!rows.length) { container.innerHTML = ""; return; }
  const count = (cat, level) => rows.filter((r) => r.cls.category === cat && (!level || r.student.level === level)).length;
  // «بلا درجات مرصودة» و«غير مدرج» تظهران فقط إذا فيها طلاب.
  const cats = ["low", "mid", "top", "none", "missing"].filter((c) => ["low", "mid", "top"].includes(c) || count(c));
  if (!cats.includes(state.category)) state.category = "low";
  const inCat = rows.filter((r) => r.cls.category === state.category);
  const groups = [...new Set(inCat.map((r) => r.cls.group).filter(Boolean))];
  const sections = [...new Set(inCat.filter((r) => !state.level || r.student.level === state.level).map((r) => r.student.section).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ar"));
  const q = state.query.trim();
  const visible = inCat.filter((r) => (!state.group || r.cls.group === state.group) && (!state.level || r.student.level === state.level)
    && (!state.section || r.student.section === state.section) && (!state.pending || r.done < r.sessions.length)
    && (!q || String(r.student.name).includes(q) || String(r.record.studentId).includes(q)));
  const catSessions = PLAN_SESSIONS[state.category] || [];
  const eligible = (s) => inCat.filter((r) => r.sessions.some((x) => x.id === s.id));
  const held = (s) => inCat.filter((r) => r.log[s.id]?.date).length;

  container.innerHTML = `<details class="card" style="margin-bottom:16px;" ${state.open ? "open" : ""} id="cp-p-details">
    <summary style="cursor:pointer;list-style:revert;"><h2 style="display:inline;">خطة تحسين التحصيل</h2> <span class="hint">تصنيف الطلبة حسب ${esc("الوقفة التقويمية الأولى")} وجلسات كل فئة</span></summary>
    <p class="hint" style="margin-top:8px;">متدني: النسبة أقل من 60٪ أو مقرران فأكثر أقل من 50٪ أو غياب. متفوق: 90٪ فأكثر بلا أي مقرر ضعيف أو غياب. متوسط: الباقي. الغياب لا يدخل في النسبة.</p>
    <div style="overflow:auto;"><table class="table" style="margin-bottom:12px;">
      <thead><tr><th>المستوى</th>${cats.map((c) => `<th>${CATEGORY_LABELS[c]}</th>`).join("")}<th>المجموع</th></tr></thead>
      <tbody>${LEVELS.map((l) => `<tr><td>${l}</td>${cats.map((c) => `<td class="num"><button class="link-btn" data-pc="${c}" data-pl="${l}">${count(c, l)}</button></td>`).join("")}<td class="num">${rows.filter((r) => r.student.level === l).length}</td></tr>`).join("")}
      <tr><th>المجموع</th>${cats.map((c) => `<th class="num"><button class="link-btn" data-pc="${c}" data-pl="">${count(c)}</button></th>`).join("")}<th class="num">${rows.length}</th></tr></tbody>
    </table></div>

    <div class="forms-actions" style="margin-bottom:10px;">
      <select style="${FIELD}" id="cp-p-cat">${cats.map((c) => `<option value="${c}" ${c === state.category ? "selected" : ""}>${CATEGORY_LABELS[c]} (${count(c)})</option>`).join("")}</select>
      ${groups.length ? `<select style="${FIELD}" id="cp-p-group"><option value="">كل المجموعات</option>${groups.map((g) => `<option value="${g}" ${g === state.group ? "selected" : ""}>${esc(GROUP_LABELS[g])}</option>`).join("")}</select>` : ""}
      <select style="${FIELD}" id="cp-p-level"><option value="">كل المستويات</option>${LEVELS.map((l) => `<option ${l === state.level ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select style="${FIELD}" id="cp-p-section"><option value="">كل الشعب</option>${sections.map((s) => `<option ${s === state.section ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <input id="cp-p-q" placeholder="بحث بالاسم أو الرقم" value="${esc(state.query)}" style="${FIELD}">
      <label class="hint" style="display:inline-flex;gap:6px;align-items:center;"><input type="checkbox" id="cp-p-pending" ${state.pending ? "checked" : ""}> لم تكتمل جلساتهم</label>
      <button class="btn btn-ghost" id="cp-p-export" ${visible.length ? "" : "disabled"}>تصدير Excel (${visible.length})</button>
    </div>

    ${catSessions.length ? `<div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px;">
      <div style="font-weight:700;margin-bottom:4px;">جلسات فئة «${CATEGORY_LABELS[state.category]}»</div>
      <p class="hint" style="margin:0 0 8px;">الهدف: ${esc(PLAN_GOALS[state.category])}</p>
      <div style="overflow:auto;"><table class="table"><thead><tr><th>الجلسة</th><th>لمن</th><th>الحضور</th><th>المدة</th><th>المحتوى</th><th>المخرج</th><th>المنعقدة</th></tr></thead>
      <tbody>${catSessions.map((s) => `<tr><td><strong>${esc(s.title)}</strong></td><td>${s.groups.length ? s.groups.map((g) => esc(GROUP_LABELS[g])).join("، ") : "كل الفئة"}${s.levels ? ` · المستوى ${s.levels.join("، ")}` : ""}</td><td>${esc(s.attendees)}</td><td>${esc(s.duration)}</td><td>${esc(s.content)}</td><td>${esc(s.output)}</td><td class="num">${held(s)} / ${eligible(s).length}</td></tr>`).join("")}</tbody></table></div>
    </div>` : state.category === "missing"
      ? '<p class="hint">هؤلاء الطلبة مسجلون في المدرسة ولم ترد أسماؤهم في أي كشف من كشوف الوقفة الأولى، فلا توجد لهم درجات أصلًا؛ تحقّق منهم مع الأقسام.</p>'
      : '<p class="hint">هؤلاء الطلبة كل درجاتهم أصفار غير مؤكدة؛ راجِعها أولًا في «مراجعة الدرجات الصفرية».</p>'}

    ${visible.length ? `<div style="overflow:auto;max-height:620px;"><table class="table">
      <thead><tr><th>الطالب</th><th>الشعبة</th><th>النسبة</th><th>أقل من 50٪ أو غياب</th><th>المجموعة</th><th>الجلسات</th></tr></thead>
      <tbody>${visible.map((r, i) => `<tr>
        <td>${esc(r.student.name)}<div class="hint" dir="ltr" style="text-align:right;">${esc(r.record.studentId)}</div></td>
        <td>${esc(r.student.section)}</td>
        <td class="num"><span class="pill ${CAT_PILL[r.cls.category]}">${pct(r.cls.average)}</span></td>
        <td>${esc(r.cls.weak.join("، ")) || "—"}</td>
        <td>${esc(GROUP_LABELS[r.cls.group]) || "—"}</td>
        <td>${r.sessions.length ? `<button class="btn btn-ghost btn-sm" data-pe="${i}">${r.done} / ${r.sessions.length} ${state.expanded === r.record.id ? "▲" : "▼"}</button>` : "—"}</td>
      </tr>${state.expanded === r.record.id ? `<tr><td colspan="6" style="background:var(--surface-2, transparent);">
        ${r.sessions.map((s) => `<div class="forms-actions" style="margin:4px 0;align-items:center;">
          <span style="min-width:200px;font-weight:600;">${esc(s.title)}</span>
          <input type="date" style="${FIELD}" data-ps-date="${s.id}" value="${esc(r.log[s.id]?.date || "")}" aria-label="تاريخ الجلسة">
          ${s.parent ? `<label class="hint" style="display:inline-flex;gap:4px;align-items:center;"><input type="checkbox" data-ps-parent="${s.id}" ${r.log[s.id]?.parentAttended ? "checked" : ""}> حضر ولي الأمر</label>` : ""}
          <input style="${FIELD}min-width:180px;" data-ps-note="${s.id}" placeholder="ملاحظة" value="${esc(r.log[s.id]?.note || "")}">
          <button class="btn btn-primary btn-sm" data-ps-save="${s.id}" data-pi="${i}">حفظ</button>
          ${r.log[s.id]?.date ? `<button class="btn btn-ghost btn-sm" data-ps-clear="${s.id}" data-pi="${i}">إلغاء</button>` : ""}
        </div>`).join("")}
      </td></tr>` : ""}`).join("")}</tbody></table></div>` : '<p class="hint">لا يوجد طلاب بهذا التصفية.</p>'}
  </details>`;

  const $ = (sel) => container.querySelector(sel);
  const rerender = () => mountPlanCard(container, { records, students, term, state, userName });
  const set = (patch) => { Object.assign(state, patch); rerender(); };
  $("#cp-p-details").addEventListener("toggle", (e) => { state.open = e.currentTarget.open; });
  container.querySelectorAll("[data-pc]").forEach((b) => b.addEventListener("click", () => set({ category: b.dataset.pc, level: b.dataset.pl, group: "", section: "" })));
  $("#cp-p-cat").addEventListener("change", (e) => set({ category: e.target.value, group: "", section: "" }));
  $("#cp-p-group")?.addEventListener("change", (e) => set({ group: e.target.value }));
  $("#cp-p-level").addEventListener("change", (e) => set({ level: e.target.value, section: "" }));
  $("#cp-p-section").addEventListener("change", (e) => set({ section: e.target.value }));
  $("#cp-p-pending").addEventListener("change", (e) => set({ pending: e.target.checked }));
  $("#cp-p-q").addEventListener("change", (e) => set({ query: e.target.value }));
  $("#cp-p-export")?.addEventListener("click", () => exportRows(visible, state.category).catch((err) => notify(err.message)));
  container.querySelectorAll("[data-pe]").forEach((b) => b.addEventListener("click", () => {
    const id = visible[Number(b.dataset.pe)].record.id;
    set({ expanded: state.expanded === id ? null : id });
  }));
  const persist = async (btn, sessionId, entry) => {
    const row = visible[Number(btn.dataset.pi)];
    btn.disabled = true;
    try {
      const current = await get(COLLECTION, row.record.id);
      if (!current) throw new Error("السجل غير موجود.");
      const updated = withSessionLog(current, sessionId, entry, { by: userName });
      await save(COLLECTION, updated);
      const idx = records.findIndex((r) => r.id === updated.id);
      if (idx >= 0) records[idx] = updated;
      notify(entry ? "تم تسجيل الجلسة." : "أُلغي تسجيل الجلسة.");
      rerender();
    } catch (err) { notify(err.message || "تعذّر الحفظ"); btn.disabled = false; }
  };
  container.querySelectorAll("[data-ps-save]").forEach((btn) => btn.addEventListener("click", () => {
    const id = btn.dataset.psSave;
    const date = container.querySelector(`[data-ps-date="${id}"]`).value;
    if (!date) { notify("اختر تاريخ الجلسة."); return; }
    persist(btn, id, { date, parentAttended: container.querySelector(`[data-ps-parent="${id}"]`)?.checked, note: container.querySelector(`[data-ps-note="${id}"]`).value });
  }));
  container.querySelectorAll("[data-ps-clear]").forEach((btn) => btn.addEventListener("click", () => persist(btn, btn.dataset.psClear, null)));
}
