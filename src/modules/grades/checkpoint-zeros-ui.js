// «الغياب وعدم الرصد» في الوقفة التقويمية: كل مقرر غاب عنه الطالب (ومنه
// الأصفار، قاعدة القسم 19/11) وكل مقرر من مقررات شعبته ما رُصد له فيه شي.
// إذا اختبر الطالب لاحقًا تُدخَل درجته من هنا. وتصدير Excel للأقسام.
import { ensureXlsx } from "../../services/vendor-loader.js?v=2026-11-18-checkpoints-1";
import { get, save } from "../../services/cloud-runtime.js";
import { notify } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { logAuditEvent } from "../audit/audit-service.js?v=2026-09-04-audit-1";
import { COLLECTION, CHECKPOINT_LABELS, listAbsentEntries, setAbsentScore } from "./checkpoint-service.js?v=2026-11-20-embed-1";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FIELD = "padding:7px 9px;border:1px solid var(--border);border-radius:9px;font-family:inherit;font-size:13px;background:var(--surface);color:inherit;";
const subjectLabel = (s) => String(s.name || "").replace(/^المواد التجارية \((.+)\)$/, "$1") || s.code;
const KIND_LABEL = { absent: "غائب", missing: "لم تُرصد" };

async function exportAbsences(entries, term) {
  const XLSX = await ensureXlsx();
  const rows = entries.map((e, i) => ({
    "م": i + 1, "القسم": e.department, "المستوى": e.level, "الشعبة": e.section, "الرقم الأكاديمي": e.studentId,
    "اسم الطالب": e.studentName, "المقرر": subjectLabel(e.subject), "رمز المقرر": e.subject.code || "",
    "الوقفة": CHECKPOINT_LABELS[e.checkpoint] || e.checkpoint, "الحالة": KIND_LABEL[e.kind], "من": e.subject.maxScore ?? "",
    "الدرجة بعد الاختبار": "",
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [6, 18, 9, 11, 13, 36, 18, 11, 22, 10, 6, 16].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, sheet, "الغياب");
  XLSX.writeFile(wb, `الغياب وعدم الرصد في الوقفات التقويمية - ${term}.xlsx`, { compression: true });
}

// state يبقى بين إعادة الرسم: { open, dept, section, checkpoint, kind, query }
export function mountZeroReview(container, { records, term, state, onChanged, userName = "" }) {
  const all = listAbsentEntries(records, { term });
  if (!records.length) { container.innerHTML = ""; return; }
  const depts = [...new Set(all.map((e) => e.department))];
  const q = String(state.query || "").trim();
  const base = all.filter((e) => (!state.dept || e.department === state.dept) && (!state.checkpoint || e.checkpoint === Number(state.checkpoint)) && (!state.kind || e.kind === state.kind));
  const sections = [...new Set(base.map((e) => e.section).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "ar"));
  const visible = base.filter((e) => (!state.section || e.section === state.section) && (!q || String(e.studentName).includes(q) || String(e.studentId).includes(q)));
  const students = new Set(all.map((e) => e.studentId)).size;
  const countBy = (list) => depts.map((d) => [d, list.filter((e) => e.department === d).length]).filter(([, n]) => n);

  container.innerHTML = `<details class="card" style="margin-bottom:16px;" ${state.open ? "open" : ""} id="cp-z-details">
    <summary style="cursor:pointer;list-style:revert;"><h2 style="display:inline;">الغياب وعدم الرصد</h2>
      <span class="pill ${all.length ? "pill-warning" : "pill-success"}" style="margin-inline-start:8px;">${all.length ? `${all.length} مقررًا · ${students} طالبًا` : "لا يوجد غياب"}</span></summary>
    <p class="hint" style="margin-top:8px;">الصفر يُسجَّل غيابًا ولا تُحسب له درجة. «لم تُرصد»: مقرر من مقررات الشعبة ما له فيه أي درجة. إذا اختبر الطالب اكتب درجته واضغط «حفظ»، فيخرج من القائمة ويتحدّث تقريره وتصنيفه.</p>
    <div class="hint" style="margin-bottom:10px;">${countBy(all).map(([d, n]) => `${esc(d)}: <strong>${n}</strong>`).join(" · ")}</div>
    <div class="forms-actions" style="margin-bottom:10px;">
      <select style="${FIELD}" id="cp-z-dept"><option value="">كل الأقسام</option>${depts.map((d) => `<option ${d === state.dept ? "selected" : ""}>${esc(d)}</option>`).join("")}</select>
      <select style="${FIELD}" id="cp-z-section"><option value="">كل الشعب</option>${sections.map((s) => `<option ${s === state.section ? "selected" : ""}>${esc(s)}</option>`).join("")}</select>
      <select style="${FIELD}" id="cp-z-kind"><option value="">غائب ولم تُرصد</option>${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}" ${k === state.kind ? "selected" : ""}>${l} فقط</option>`).join("")}</select>
      <input id="cp-z-q" placeholder="بحث بالاسم أو الرقم" value="${esc(q)}" style="${FIELD}">
      <button class="btn btn-ghost" id="cp-z-export" ${visible.length ? "" : "disabled"}>تصدير Excel (${visible.length})</button>
    </div>
    ${visible.length ? `<div style="overflow:auto;max-height:520px;"><table class="table">
      <thead><tr><th>القسم</th><th>الشعبة</th><th>الطالب</th><th>المقرر</th><th>الحالة</th><th>الدرجة بعد الاختبار</th><th></th></tr></thead>
      <tbody>${visible.map((e, i) => `<tr>
        <td>${esc(e.department)}</td><td>${esc(e.section)}</td>
        <td>${esc(e.studentName)}<div class="hint" dir="ltr" style="text-align:right;">${esc(e.studentId)}</div></td>
        <td>${esc(subjectLabel(e.subject))}${e.subject.code ? `<div class="hint">${esc(e.subject.code)}</div>` : ""}</td>
        <td><span class="pill ${e.kind === "absent" ? "pill-critical" : "pill-warning"}">${KIND_LABEL[e.kind]}</span></td>
        <td><input type="number" min="0" step="0.5" ${e.subject.maxScore ? `max="${e.subject.maxScore}"` : ""} data-zi="${i}" class="cp-z-score" style="${FIELD}width:80px;" aria-label="الدرجة"> <span class="hint">/ ${esc(e.subject.maxScore ?? "")}</span></td>
        <td><button class="btn btn-primary btn-sm" data-za="${i}">حفظ</button></td>
      </tr>`).join("")}</tbody></table></div>` : `<p class="hint">${all.length ? "لا يوجد غياب بهذا التصفية." : "لا يوجد غياب."}</p>`}
  </details>`;

  const $ = (sel) => container.querySelector(sel);
  $("#cp-z-details").addEventListener("toggle", (e) => { state.open = e.currentTarget.open; });
  const rerender = () => mountZeroReview(container, { records, term, state, onChanged, userName });
  $("#cp-z-dept").addEventListener("change", (e) => { state.dept = e.target.value; state.section = ""; rerender(); });
  $("#cp-z-section").addEventListener("change", (e) => { state.section = e.target.value; rerender(); });
  $("#cp-z-kind").addEventListener("change", (e) => { state.kind = e.target.value; rerender(); });
  $("#cp-z-q").addEventListener("change", (e) => { state.query = e.target.value; rerender(); });
  $("#cp-z-export").addEventListener("click", () => exportAbsences(visible, term).catch((err) => notify(err.message)));
  container.querySelectorAll("[data-za]").forEach((btn) => btn.addEventListener("click", async () => {
    const entry = visible[Number(btn.dataset.za)];
    const value = container.querySelector(`.cp-z-score[data-zi="${btn.dataset.za}"]`)?.value;
    if (value === "" || value == null) { notify("اكتب الدرجة أولًا."); return; }
    btn.disabled = true;
    try {
      const current = await get(COLLECTION, entry.recordId);
      if (!current) throw new Error("السجل غير موجود.");
      const updated = setAbsentScore(current, entry, value, { by: userName });
      await save(COLLECTION, updated);
      await logAuditEvent("checkpoint_absent_scored", { tableName: COLLECTION, recordId: entry.recordId });
      const idx = records.findIndex((r) => r.id === entry.recordId);
      if (idx >= 0) records[idx] = updated;
      notify(`رُصدت درجة ${entry.studentName} في ${subjectLabel(entry.subject)}.`);
      rerender();
      onChanged?.();
    } catch (err) { notify(err.message || "تعذّر الحفظ"); btn.disabled = false; }
  }));
}
