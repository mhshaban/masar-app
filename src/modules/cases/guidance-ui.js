import { notify, confirmDialog } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import {
  CASE_CATEGORIES, listCases, getCase, createCase, closeCase, reopenCase, removeCase,
  listSessions, addSession, removeSession, listCandidates,
} from "./guidance-service.js?v=2026-09-14-cumulative-average-fix-1";
import { getStudent } from "../students/students-service.js";
import { mountStudentPicker } from "../shared/student-picker.js?v=2026-09-22-student-context-1";
import { loadAcademicFlagsMap, studentQuickInfo, studentQuickCard } from "../shared/student-quick-info.js";
import { buildGuidanceCasesReportHtml } from "../../services/report-builders.js?v=2026-09-17-attendance-checkbox-1";
import { downloadAsWordDoc } from "../../services/word-export.js?v=2026-09-13-landscape-export-1";
import { ensureXlsx } from "../../services/vendor-loader.js?v=2026-09-07-academic-fix-1";
import { logAuditEvent } from "../audit/audit-service.js?v=2026-09-04-audit-1";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function statusPill(status) {
  if (status === "closed") return '<span class="pill pill-neutral">مُغلقة</span>';
  if (status === "monitoring") return '<span class="pill pill-warning">قيد المتابعة</span>';
  return '<span class="pill pill-critical">مفتوحة</span>';
}

const CASE_STATUS_LABELS = { open: "مفتوحة", monitoring: "قيد المتابعة", closed: "مُغلقة" };
const CASE_SOURCE_LABELS = { "grades-flag": "ترشيح من الدرجات", manual: "يدوي" };

async function exportCasesExcel(cases) {
  if (!cases.length) throw new Error("لا توجد حالات إرشادية لتصديرها");
  const XLSX = await ensureXlsx();
  const rows = cases.map((c) => ({
    "اسم الطالب": c.studentName || c.studentId || "",
    "الرقم الأكاديمي": c.studentId || "",
    "الفئة": c.category || "",
    "العنوان": c.title || "",
    "الحالة": CASE_STATUS_LABELS[c.status] || c.status || "",
    "تاريخ الفتح": c.openedDate || "",
    "تاريخ الإغلاق": c.closedDate || "",
    "المصدر": CASE_SOURCE_LABELS[c.source] || c.source || "",
    "ملاحظات": c.notes || "",
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0]).map((key) => ({ wch: Math.min(45, Math.max(12, key.length + 3, ...rows.map((row) => String(row[key] || "").length + 2))) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "الحالات الإرشادية");
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(workbook, `الحالات-الإرشادية-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
  await logAuditEvent("export_excel", { tableName: "guidanceCases", count: cases.length });
}

async function exportCandidatesExcel(candidates) {
  if (!candidates.length) throw new Error("لا يوجد طلاب مرشَّحون لتصديرهم");
  const XLSX = await ensureXlsx();
  const enriched = await Promise.all(candidates.map(async (c) => ({ ...c, student: await getStudent(c.studentId) })));
  const rows = enriched.map((c) => ({
    "اسم الطالب": c.student?.name || c.studentId || "",
    "الرقم الأكاديمي": c.student?.academicId || c.studentId || "",
    "المستوى": c.student?.level || "",
    "الشعبة": c.student?.section || "",
    "المعدل العام": c.avgPct ?? "",
    "أسباب الترشيح": c.reasons.join(" · "),
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0]).map((key) => ({ wch: Math.min(45, Math.max(12, key.length + 3, ...rows.map((row) => String(row[key] || "").length + 2))) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "مرشحون من الدرجات");
  workbook.Workbook = { Views: [{ RTL: true }] };
  XLSX.writeFile(workbook, `مرشحون-من-الدرجات-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
  await logAuditEvent("export_excel", { tableName: "guidanceCandidates", count: candidates.length });
}

async function renderCandidates(root, onOpenNewCase) {
  const candidates = await listCandidates();
  if (!candidates.length) {
    root.innerHTML = '<div class="card"><h2>مرشحون من الدرجات</h2><div class="empty">لا يوجد طلاب مرشَّحون حاليًا — يعتمد هذا على الدرجات المستوردة</div></div>';
    return;
  }
  const enriched = await Promise.all(candidates.slice(0, 15).map(async (c) => ({ ...c, student: await getStudent(c.studentId) })));
  root.innerHTML = `
    <div class="card">
      <div class="card-head">
        <h2>مرشحون من الدرجات (${candidates.length})</h2>
        <button class="btn btn-ghost" id="candidates-export-excel-btn" type="button">تصدير Excel</button>
      </div>
      <p class="hint">طلاب معدلهم العام أو إحدى موادهم أقل من الحد الأدنى، وليس لديهم حالة إرشادية مفتوحة بعد.</p>
      <ul class="plain">
        ${enriched.map((c) => `
          <li class="row-item">
            <div class="body">
              <div class="title">${esc(c.student?.name) || c.studentId}</div>
              <div class="meta">${c.reasons.map(esc).join(" · ")}</div>
            </div>
            <button class="btn btn-ghost" data-open-case="${esc(c.studentId)}">فتح حالة</button>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
  root.querySelectorAll("[data-open-case]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const c = enriched.find((c) => c.studentId === btn.dataset.openCase);
      onOpenNewCase(c.student, c.reasons.join(" · "));
    });
  });
  root.querySelector("#candidates-export-excel-btn").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "جارٍ إعداد الملف…";
    try {
      await exportCandidatesExcel(candidates);
    } catch (error) {
      notify(error.message || "تعذر تصدير ملف Excel");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
}

async function renderNewCaseForm(root, prefill, onCreated) {
  const flagsMap = await loadAcademicFlagsMap();
  root.innerHTML = `
    <div class="card">
      <h2>حالة إرشادية جديدة</h2>
      <div id="new-case-picker"></div>
      <input type="hidden" id="new-case-student-id" value="${esc(prefill?.student?.id) || ""}">
      <div id="new-case-selected">${studentQuickCard(prefill?.student || null, prefill?.student ? studentQuickInfo(prefill.student, flagsMap) : null)}</div>
      <form id="new-case-form" style="margin-top:12px; display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <select name="category" aria-label="فئة الحالة" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
            ${CASE_CATEGORIES.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
          </select>
          <input name="title" placeholder="عنوان مختصر للحالة" style="flex:1; min-width:200px; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <textarea name="notes" rows="2" placeholder="ملاحظات أولية (اختياري)" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit; resize:vertical;">${esc(prefill?.reason) || ""}</textarea>
        <div><button class="btn btn-primary" type="submit">فتح الحالة</button></div>
      </form>
    </div>
  `;

  let selected = prefill?.student || null;
  mountStudentPicker(root.querySelector("#new-case-picker"), {
    onSelect: (student) => {
      selected = student;
      root.querySelector("#new-case-student-id").value = student.id;
      root.querySelector("#new-case-selected").innerHTML = studentQuickCard(student, studentQuickInfo(student, flagsMap));
    },
  });

  root.querySelector("#new-case-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!selected) { notify("اختر طالبًا من نتائج البحث أولًا"); return; }
    const form = e.target;
    try {
      await createCase({
        studentId: selected.id,
        studentName: selected.name,
        category: form.category.value,
        title: form.title.value,
        notes: form.notes.value,
        source: prefill ? "grades-flag" : "manual",
      });
      await onCreated();
    } catch (err) {
      notify(err.message);
    }
  });
}

async function renderCasesTable(root, onOpen) {
  const cases = await listCases();
  if (!cases.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا توجد حالات إرشادية بعد</div></div>';
    return;
  }
  root.innerHTML = `
    <div class="card">
      <div class="tablewrap"><table>
        <thead><tr><th>الطالب</th><th>الفئة</th><th>الحالة</th><th>تاريخ الفتح</th></tr></thead>
        <tbody>
          ${cases.map((c) => `
            <tr data-id="${esc(c.id)}">
              <td>${esc(c.studentName) || esc(c.studentId)}</td>
              <td>${esc(c.category)}</td>
              <td>${statusPill(c.status)}</td>
              <td class="num">${esc(c.openedDate) || "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>
    </div>
  `;
  root.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => onOpen(tr.dataset.id));
  });
}

async function renderSessions(root, caseId, refreshDetail) {
  const sessions = await listSessions(caseId);
  root.innerHTML = `
    <div class="card">
      <h2>جلسات المتابعة</h2>
      <form id="session-form" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-bottom:16px;">
        <div>
          <label class="hint" for="case-session-date" style="display:block;margin-bottom:4px;">التاريخ</label>
          <input id="case-session-date" name="date" type="date" style="padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <div style="flex:1; min-width:220px;">
          <label class="hint" for="case-session-note" style="display:block;margin-bottom:4px;">ملاحظة الجلسة</label>
          <input id="case-session-note" name="note" required style="width:100%; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <div style="flex:1; min-width:180px;">
          <label class="hint" for="case-session-next" style="display:block;margin-bottom:4px;">الخطوة التالية</label>
          <input id="case-session-next" name="nextStep" style="width:100%; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        </div>
        <button class="btn btn-primary" type="submit">إضافة جلسة</button>
      </form>
      ${sessions.length ? `
        <ul class="plain">
          ${sessions.map((s) => `
            <li class="row-item" data-session-id="${esc(s.id)}">
              <div class="body">
                <div class="title">${esc(s.note)}</div>
                <div class="meta">${s.nextStep ? `الخطوة التالية: ${esc(s.nextStep)}` : ""}</div>
              </div>
              <span class="pill pill-neutral">${esc(s.date) || "—"}</span>
              <button class="link-btn" data-remove-session="${esc(s.id)}" style="color:var(--critical);">حذف</button>
            </li>
          `).join("")}
        </ul>
      ` : '<div class="empty">لا توجد جلسات مسجَّلة بعد</div>'}
    </div>
  `;

  root.querySelector("#session-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await addSession(caseId, { date: form.date.value, note: form.note.value, nextStep: form.nextStep.value });
      await refreshDetail();
    } catch (err) {
      notify(err.message);
    }
  });
  root.querySelectorAll("[data-remove-session]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!await confirmDialog("حذف هذه الجلسة؟")) return;
      await removeSession(btn.dataset.removeSession);
      await refreshDetail();
    });
  });
}

// طباعة حالة واحدة (بياناتها + جلسات متابعتها) — نفس تقنية الطباعة المباشرة
// المعتمدة بالاستمارات وكشف حضور الفعالية (forms-ui.js): نافذة منبثقة،
// استنساخ أوراق أنماط الصفحة الحالية (بما فيها .forms-print)، انتظار خط
// Cairo، ثم طباعة — فيخرج بنفس تنسيق وألوان بقية مستندات القسم.
function caseDetailPrintMarkup(item, sessions) {
  return `<div class="forms-print" id="case-printable">
    <div class="topbar"><div><h1>${esc(item.title) || esc(item.category) || "حالة إرشادية"}</h1><div class="sub">${esc(item.studentName) || esc(item.studentId)}${item.category ? ` — ${esc(item.category)}` : ""}</div></div></div>
    <div class="card"><h2>بيانات الحالة</h2>
      <div class="tablewrap"><table>
        <tr><th>الطالب</th><td>${esc(item.studentName) || esc(item.studentId)}</td><th>الفئة</th><td>${esc(item.category) || "—"}</td></tr>
        <tr><th>الحالة</th><td>${esc(CASE_STATUS_LABELS[item.status] || item.status)}</td><th>تاريخ الفتح</th><td>${esc(item.openedDate) || "—"}</td></tr>
        ${item.closedDate ? `<tr><th>تاريخ الإغلاق</th><td colspan="3">${esc(item.closedDate)}</td></tr>` : ""}
      </table></div>
    </div>
    ${item.notes ? `<div class="card"><h2>ملاحظات</h2><p>${esc(item.notes)}</p></div>` : ""}
    <div class="card"><h2>جلسات المتابعة</h2>
      <div class="tablewrap"><table>
        <thead><tr><th>التاريخ</th><th>ملاحظة الجلسة</th><th>الخطوة التالية</th></tr></thead>
        <tbody>${sessions.length ? sessions.map((s) => `<tr><td>${esc(s.date) || "—"}</td><td>${esc(s.note)}</td><td>${esc(s.nextStep) || "—"}</td></tr>`).join("") : '<tr><td colspan="3">لا توجد جلسات مسجَّلة</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
}

async function printCaseDirect(item, sessions) {
  const popup = window.open("", "_blank");
  if (!popup) { notify("اسمح بفتح نافذة الطباعة في المتصفح."); return; }
  popup.document.body.textContent = "جارٍ تجهيز الحالة للطباعة…";
  try {
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(item.title) || "حالة إرشادية"}</title></head><body><main id="case-print-root"></main></body></html>`);
    popup.document.close();
    popup.document.documentElement.dataset.theme = document.documentElement.dataset.theme || "light";
    const root = popup.document.getElementById("case-print-root");
    root.innerHTML = caseDetailPrintMarkup(item, sessions);
    const styles = [...document.querySelectorAll('link[rel="stylesheet"]')].map((source) => new Promise((resolve, reject) => {
      const link = popup.document.createElement("link");
      link.rel = "stylesheet";
      link.href = source.href;
      link.onload = resolve;
      link.onerror = () => reject(new Error("تعذّر تحميل تنسيق الطباعة؛ حاول مرة ثانية."));
      popup.document.head.appendChild(link);
    }));
    for (const source of document.querySelectorAll("style")) popup.document.head.appendChild(source.cloneNode(true));
    await Promise.all(styles);
    if (popup.closed) return;
    await Promise.all([400, 600, 700, 800].map((weight) => popup.document.fonts.load(`${weight} 12px "Cairo"`, "بيانات الطالب")));
    await popup.document.fonts.ready;
    if (popup.closed) return;
    popup.requestAnimationFrame(() => { if (!popup.closed) { popup.focus(); popup.print(); } });
  } catch (error) { if (!popup.closed) popup.close(); notify(error.message || "تعذّرت طباعة الحالة."); }
}

async function renderCaseDetail(container, id, onBack, onGoto) {
  const refresh = () => renderCaseDetail(container, id, onBack, onGoto);
  const item = await getCase(id);
  if (!item) {
    container.innerHTML = '<div class="card"><div class="empty">تعذّر إيجاد هذه الحالة</div></div>';
    return;
  }
  const [student, flagsMap] = await Promise.all([getStudent(item.studentId), loadAcademicFlagsMap()]);

  container.innerHTML = `
    <button class="backlink" id="case-back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>
      رجوع للمتابعات والحالات
    </button>
    <div class="topbar">
      <div>
        <h1>${esc(item.studentName) || esc(item.studentId)}</h1>
        <div class="sub">${esc(item.title) || esc(item.category)} · فُتحت ${esc(item.openedDate) || "—"}${item.closedDate ? ` · أُغلقت ${esc(item.closedDate)}` : ""}</div>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        ${statusPill(item.status)}
        ${item.status === "closed"
          ? '<button class="btn btn-ghost" id="case-reopen">إعادة فتح</button>'
          : '<button class="btn btn-ghost" id="case-close">إغلاق الحالة</button>'}
        <button class="btn btn-ghost" id="case-print">طباعة</button>
        <button class="btn btn-ghost" id="case-delete" style="color:var(--critical);">حذف</button>
      </div>
    </div>
    ${student ? studentQuickCard(student, studentQuickInfo(student, flagsMap)) : ""}
    ${student && onGoto ? '<div style="margin:-8px 0 16px;"><button class="link-btn" id="case-open-profile">فتح ملف الطالب</button></div>' : ""}
    ${item.notes ? `<div class="card" style="margin-bottom:16px;"><h2>ملاحظات</h2><p class="hint" style="margin:0;">${esc(item.notes)}</p></div>` : ""}
    <div id="case-sessions"></div>
  `;

  container.querySelector("#case-back").addEventListener("click", onBack);
  const profileBtn = container.querySelector("#case-open-profile");
  if (profileBtn) profileBtn.addEventListener("click", () => onGoto("students", { studentId: student.id }));
  const closeBtn = container.querySelector("#case-close");
  if (closeBtn) closeBtn.addEventListener("click", async () => { await closeCase(id); await refresh(); });
  const reopenBtn = container.querySelector("#case-reopen");
  if (reopenBtn) reopenBtn.addEventListener("click", async () => { await reopenCase(id); await refresh(); });
  container.querySelector("#case-print").addEventListener("click", async () => {
    const sessions = await listSessions(id);
    await printCaseDirect(item, sessions);
  });
  container.querySelector("#case-delete").addEventListener("click", async () => {
    if (!await confirmDialog("حذف هذه الحالة وكل جلساتها نهائيًا؟")) return;
    await removeCase(id);
    onBack();
  });

  await renderSessions(container.querySelector("#case-sessions"), id, refresh);
}

// options.caseId يفتح حالة محدَّدة مباشرة (قادم من رابط "فتح" بلوحة اليوم أو
// ملف الطالب). options.studentId يبحث عن حالة مفتوحة لهذا الطالب ويفتحها،
// أو يعبّئ نموذج "حالة جديدة" مسبقًا به إن لم توجد — بدل هبوط المرشد على
// قائمة الحالات العامة ليعيد البحث عن نفس الطالب من جديد في الحالتين.
export async function mountCasesView(container, options = {}) {
  const onGoto = options.onGoto;
  const openDetail = (id) => renderCaseDetail(container, id, () => mountCasesView(container, { onGoto }), onGoto);

  if (options.caseId) { await openDetail(options.caseId); return; }

  let prefillStudent = null;
  if (options.studentId) {
    const cases = await listCases();
    const existing = cases.find((c) => String(c.studentId) === String(options.studentId) && c.status !== "closed");
    if (existing) { await openDetail(existing.id); return; }
    prefillStudent = await getStudent(options.studentId);
  }

  container.innerHTML = `
    <div class="topbar">
      <div><h1>الجلسات والمقابلات الإرشادية</h1></div>
      <div class="forms-actions"><button class="btn btn-ghost" id="cases-export-excel-btn">تصدير Excel</button><button class="btn btn-ghost" id="cases-export-btn">تصدير Word</button></div>
    </div>
    <div id="cases-new-form" style="margin-bottom:16px;"></div>
    <div id="cases-table" style="margin-bottom:16px;"></div>
    <div id="cases-candidates"></div>
  `;

  const showNewForm = (student, reason) => {
    renderNewCaseForm(container.querySelector("#cases-new-form"), student ? { student, reason } : null, async () => {
      await mountCasesView(container, { onGoto });
    });
    if (student) container.querySelector("#cases-new-form").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  showNewForm(prefillStudent, null);
  await renderCasesTable(container.querySelector("#cases-table"), openDetail);
  await renderCandidates(container.querySelector("#cases-candidates"), showNewForm);

  container.querySelector("#cases-export-btn").addEventListener("click", async () => {
    const cases = await listCases();
    const withSessions = await Promise.all(cases.map(async (c) => ({ ...c, sessions: await listSessions(c.id) })));
    const html = buildGuidanceCasesReportHtml(withSessions, new Date().toLocaleString("ar-BH"));
    downloadAsWordDoc("تقرير الحالات الإرشادية", html, `تقرير-الحالات-الارشادية-${new Date().toISOString().slice(0, 10)}`);
  });

  container.querySelector("#cases-export-excel-btn").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "جارٍ إعداد الملف…";
    try {
      await exportCasesExcel(await listCases());
    } catch (error) {
      notify(error.message || "تعذر تصدير ملف Excel");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
}
