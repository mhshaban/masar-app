// مراجعة الدرجات الصفرية للوقفة التقويمية: قائمة لكل صفر (القسم، الطالب،
// المقرر) مع تصحيح الدرجة أو تأكيد الصفر أو تسجيل غياب، وتصدير Excel للأقسام.
import { ensureXlsx } from "../../services/vendor-loader.js?v=2026-11-18-checkpoints-1";
import { get, save } from "../../services/cloud-runtime.js";
import { notify } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { logAuditEvent } from "../audit/audit-service.js?v=2026-09-04-audit-1";
import { COLLECTION, CHECKPOINT_LABELS, listZeroEntries, resolveZero } from "./checkpoint-service.js?v=2026-11-19-missing-courses-1";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FIELD = "padding:7px 9px;border:1px solid var(--border);border-radius:9px;font-family:inherit;font-size:13px;background:var(--surface);color:inherit;";
const subjectLabel = (s) => String(s.name || "").replace(/^المواد التجارية \((.+)\)$/, "$1") || s.code;

async function exportZeros(entries, term) {
  const XLSX = await ensureXlsx();
  const rows = entries.map((e, i) => ({
    "م": i + 1, "القسم": e.department, "المستوى": e.level, "الشعبة": e.section, "الرقم الأكاديمي": e.studentId,
    "اسم الطالب": e.studentName, "المقرر": subjectLabel(e.subject), "رمز المقرر": e.subject.code || "",
    "الوقفة": CHECKPOINT_LABELS[e.checkpoint] || e.checkpoint, "الدرجة المرصودة": 0, "من": e.subject.maxScore ?? "",
    "الدرجة الصحيحة": "", "ملاحظة القسم (صفر حقيقي / غائب / لم يُرصد)": "",
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [6, 18, 9, 11, 13, 36, 18, 11, 22, 11, 6, 12, 30].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, sheet, "الأصفار");
  XLSX.writeFile(wb, `أصفار الوقفات التقويمية - ${term}.xlsx`, { compression: true });
}

// state يبقى بين إعادة الرسم: { open, dept, section, checkpoint, showConfirmed }
export function mountZeroReview(container, { records, term, state, onChanged, userName = "" }) {
  const all = listZeroEntries(records, { term, includeConfirmed: true });
  const open = all.filter((e) => !e.confirmed);
  if (!all.length) { container.innerHTML = ""; return; }
  const depts = [...new Set(all.map((e) => e.department))];
  const base = all.filter((e) => (state.showConfirmed || !e.confirmed) && (!state.dept || e.department === state.dept) && (!state.checkpoint || e.checkpoint === Number(state.checkpoint)));
  const sections = [...new Set(base.map((e) => e.section).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ar"));
  const visible = base.filter((e) => !state.section || e.section === state.section);
  const countBy = (list) => depts.map((d) => [d, list.filter((e) => e.department === d).length]).filter(([, n]) => n);

  container.innerHTML = `<details class="card" style="margin-bottom:16px;" ${state.open ? "open" : ""} id="cp-z-details">
    <summary style="cursor:pointer;list-style:revert;"><h2 style="display:inline;">مراجعة الدرجات الصفرية</h2>
      <span class="pill ${open.length ? "pill-warning" : "pill-success"}" style="margin-inline-start:8px;">${open.length ? `${open.length} بانتظار التأكيد` : "لا توجد أصفار معلّقة"}</span></summary>
    <p class="hint" style="margin-top:8px;">الصفر قد يعني أن الدرجة لم تُرصد بعد. أرسل القائمة للأقسام، ثم صحّح الدرجة هنا، أو أكّد أن الصفر حقيقي، أو سجّله غيابًا. التقارير تعرض الصفر كما هو إلى أن يُراجَع.</p>
    <div class="hint" style="margin-bottom:10px;">${countBy(open).map(([d, n]) => `${esc(d)}: <strong>${n}</strong>`).join(" · ")}</div>
    <div class="forms-actions" style="margin-bottom:10px;">
      <select style="${FIELD}" id="cp-z-dept"><option value="">كل الأقسام</option>${depts.map((d) => `<option ${d === state.dept ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
      <select style="${FIELD}" id="cp-z-section"><option value="">كل الشعب</option>${sections.map((s) => `<option ${s === state.section ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <label class="hint" style="display:inline-flex;gap:6px;align-items:center;"><input type="checkbox" id="cp-z-confirmed" ${state.showConfirmed ? "checked" : ""}> إظهار الأصفار المؤكدة</label>
      <button class="btn btn-ghost" id="cp-z-export" ${visible.length ? "" : "disabled"}>تصدير Excel (${visible.length})</button>
    </div>
    ${visible.length ? `<div style="overflow:auto;max-height:520px;"><table class="table">
      <thead><tr><th>القسم</th><th>الشعبة</th><th>الطالب</th><th>المقرر</th><th>الوقفة</th><th>الدرجة الصحيحة</th><th>إجراء</th></tr></thead>
      <tbody>${visible.map((e, i) => `<tr>
        <td>${esc(e.department)}</td><td>${esc(e.section)}</td>
        <td>${esc(e.studentName)}<div class="hint" dir="ltr" style="text-align:right;">${esc(e.studentId)}</div></td>
        <td>${esc(subjectLabel(e.subject))}${e.subject.code ? `<div class="hint">${esc(e.subject.code)}</div>` : ""}</td>
        <td>${e.checkpoint === 1 ? "الأولى" : "الثانية"}</td>
        <td>${e.confirmed ? '<span class="pill pill-critical">صفر مؤكد</span>' : `<input type="number" min="0" step="0.5" ${e.subject.maxScore ? `max="${e.subject.maxScore}"` : ""} data-zi="${i}" class="cp-z-score" style="${FIELD}width:80px;" aria-label="الدرجة الصحيحة"> <span class="hint">/ ${esc(e.subject.maxScore ?? "")}</span>`}</td>
        <td>${e.confirmed ? "" : `<div class="forms-actions" style="gap:4px;">
          <button class="btn btn-primary btn-sm" data-za="score" data-zi="${i}">حفظ</button>
          <button class="btn btn-ghost btn-sm" data-za="confirm" data-zi="${i}">صفر حقيقي</button>
          <button class="btn btn-ghost btn-sm" data-za="absent" data-zi="${i}">غائب</button></div>`}</td>
      </tr>`).join("")}</tbody></table></div>` : '<p class="hint">لا توجد أصفار بهذا التصفية.</p>'}
  </details>`;

  const $ = (sel) => container.querySelector(sel);
  $("#cp-z-details").addEventListener("toggle", (e) => { state.open = e.currentTarget.open; });
  const rerender = () => mountZeroReview(container, { records, term, state, onChanged, userName });
  $("#cp-z-dept").addEventListener("change", (e) => { state.dept = e.target.value; state.section = ""; rerender(); });
  $("#cp-z-section").addEventListener("change", (e) => { state.section = e.target.value; rerender(); });
  $("#cp-z-confirmed").addEventListener("change", (e) => { state.showConfirmed = e.target.checked; rerender(); });
  $("#cp-z-export").addEventListener("click", () => exportZeros(visible, term).catch((err) => notify(err.message)));
  container.querySelectorAll("[data-za]").forEach((btn) => btn.addEventListener("click", async () => {
    const entry = visible[Number(btn.dataset.zi)];
    const type = btn.dataset.za;
    const action = type === "score" ? { type, score: container.querySelector(`.cp-z-score[data-zi="${btn.dataset.zi}"]`)?.value } : { type };
    if (type === "score" && (action.score === "" || action.score == null)) { notify("اكتب الدرجة الصحيحة أولًا."); return; }
    btn.disabled = true;
    try {
      const current = await get(COLLECTION, entry.recordId);
      if (!current) throw new Error("السجل غير موجود.");
      const updated = resolveZero(current, entry.key, action, { by: userName });
      await save(COLLECTION, updated);
      await logAuditEvent("checkpoint_zero_review", { tableName: COLLECTION, recordId: entry.recordId });
      const idx = records.findIndex((r) => r.id === entry.recordId);
      if (idx >= 0) records[idx] = updated;
      notify(type === "score" ? `تم تصحيح درجة ${entry.studentName}.` : type === "absent" ? `سُجّل ${entry.studentName} غائبًا.` : "تم تأكيد الصفر.");
      rerender();
      onChanged?.();
    } catch (err) { notify(err.message || "تعذّر الحفظ"); btn.disabled = false; }
  }));
}
