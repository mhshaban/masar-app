// شاشة الاستيراد الموحَّدة (إدمن فقط): تحديث شامل من ملف المدرسة الواحد،
// مع إبقاء النسخ الاحتياطي والاستعادة الآمنة في التبويب الثاني فقط.
//
// الدرجات والشهادات: تحديث معدلات الطلبة (academicFlags/termAverages) من
// شهادات PDF من هنا مباشرة (تبويب "تحديث المعدلات") — يمسح المتصفح مجلد
// "مسار" المحلي ويحلّله بنفسه، بلا أي سكربت أو أداة خارج التطبيق.
//
// ملاحظة أمنية: إخفاء الشاشة في الواجهة مدعوم بسياسات RLS في قاعدة البيانات؛
// لا يستطيع غير الإدمن تنفيذ عمليات الاستيراد حتى بطلب REST مباشر.
import { renderImportSection as renderBackupRestoreImport } from "../backup/backup-ui.js?v=2026-09-09-import-fix-1";
import { ensureXlsx } from "../../services/vendor-loader.js?v=2026-09-07-academic-fix-1";
import { parseSchoolWorkbook, previewStaleAcademicRecords, previewHistoricalPromotedDuplicates, commitSchoolWorkbook } from "../../services/school-data-import-service.js?v=2026-09-11-curriculum-import-1";
import { parsePlanWorkbook, previewPlanReplace, commitPlanReplace } from "../../services/department-plan-import-service.js?v=2026-09-10-plan-order-fix-1";
import { folderScanSupported, scanCertificatesFolder, analyzeCertificateFiles, commitAcademicAverages } from "../../services/academic-averages-import-service.js?v=2026-09-11-academic-averages-1";
import { exportStudentsRosterChanges, exportTeachersRosterChanges } from "../../services/roster-changes-export-service.js?v=2026-09-11-roster-changes-1";
import { list } from "../../services/cloud-runtime.js";
import { getMasarFolderName, forgetMasarFolder } from "../dashboard/dashboard-local-folder.js?v=2026-09-06-student-photos-1";

import { confirmDialog } from "../shared/ui-states.js?v=2026-09-06-polish-1";

const TABS = [
  { key: "school", label: "تحديث شامل" },
  { key: "plan", label: "تحديث الخطة" },
  { key: "averages", label: "تحديث المعدلات" },
  { key: "changes", label: "تصدير التحديثات" },
  { key: "backup", label: "النسخ الاحتياطي" },
];

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

async function mountSchoolTab(root) {
  await ensureXlsx();
  root.innerHTML = `
    <div class="card">
      <h2>تحديث بيانات المدرسة من ملف واحد</h2>
      <p class="hint">يحدّث سجل الطلبة والمعلمين والمرفعين، ويمكن تنزيل نسخة احتياطية من صفحة النسخ الاحتياطي.</p>
      <input type="file" id="school-import-file" aria-label="ملف كشف الطلاب الشامل" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="margin-bottom:12px;">
      <div id="school-import-preview"></div>
    </div>`;
  const input = root.querySelector("#school-import-file");
  const preview = root.querySelector("#school-import-preview");
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    preview.innerHTML = '<p class="hint">جارٍ تحليل الملف…</p>';
    try {
      const data = await parseSchoolWorkbook(file);
      const [staleAcademic, historicalDuplicates] = await Promise.all([
        previewStaleAcademicRecords(data.students),
        previewHistoricalPromotedDuplicates(data.promotedRows),
      ]);
      const matched = data.promotedRows.filter((row) => row.matchStatus === "matched").length;
      const unmatched = data.promotedRows.length - matched;
      const uniquePromoted = new Set(data.promotedRows.filter((row) => row.matchStatus === "matched").map((row) => `${row.studentId}::${String(row.subjectCode || "").trim()}`)).size;
      const duplicateRows = matched - uniquePromoted;
      const curriculumTracks = Object.keys(data.curriculumTemplates || {});
      preview.innerHTML = `
        <div class="grid g3" style="margin-bottom:16px;">
          <div class="card stat"><div class="label">الطلاب</div><div class="value">${data.students.length}</div></div>
          <div class="card stat"><div class="label">المعلمون</div><div class="value">${data.teachers.length}</div></div>
          <div class="card stat"><div class="label">صفوف المرفعين</div><div class="value">${data.promotedRows.length}</div></div>
        </div>
        <p class="hint">المرفعين: ${matched} مطابق، ${unmatched} غير مطابق لن يُحفظ، ${duplicateRows} صف مكرر سيُدمج. لن تُحذف مقررات صحيحة غير موجودة في الملف.</p>
        <p class="hint">السجلات الأكاديمية القديمة خارج كشف الطلاب الحالي: ${staleAcademic.staleFlags.length} سجل تحليل و${staleAcademic.staleAverages.length} معدل فصلي. ستُحذف عند تنفيذ التحديث.</p>
        <p class="hint">تكرارات المرفعين القديمة: ${historicalDuplicates.removableCount} سجل زائد آمن للحذف${historicalDuplicates.conflictGroupCount ? `، و${historicalDuplicates.conflictGroupCount} تعارض لن يُحذف تلقائيًا` : "، ولا توجد تعارضات"}.</p>
        <p class="hint">${curriculumTracks.length ? `قالب المقررات: سيُحدَّث (${curriculumTracks.map(esc).join("، ")}) — وُجد شيتا المقررات بالملف.` : "قالب المقررات: بلا تغيير — الملف لا يحتوي شيتي «الصناعي»/«التجاري»."}</p>
        <button class="btn btn-primary" id="school-import-commit">تنفيذ التحديث</button>
        <div id="school-import-status"></div>`;
      preview.querySelector("#school-import-commit").addEventListener("click", async () => {
        if (!await confirmDialog(`سيتم تحديث ${data.students.length} طالبًا و${data.teachers.length} معلمًا و${uniquePromoted} مقررًا للمرفعين${curriculumTracks.length ? ` وقالب المقررات (${curriculumTracks.join("، ")})` : ""}، وحذف ${staleAcademic.total} سجلًا أكاديميًا قديمًا و${historicalDuplicates.removableCount} تكرارًا زائدًا للمرفعين. هل تريد التنفيذ؟`)) return;
        const button = preview.querySelector("#school-import-commit");
        const status = preview.querySelector("#school-import-status");
        button.disabled = true;
        status.innerHTML = '<p class="hint">جارٍ تنفيذ التحديث…</p>';
        try {
          const result = await commitSchoolWorkbook(data, { fileName: file.name });
          preview.innerHTML = `<p class="hint" role="status">تم التحديث بنجاح: ${result.studentsCount} طالبًا، ${result.teachersCount} معلمًا، و${result.promotedBatch.matchedCount - result.promotedBatch.duplicateRowsRemoved} مقررًا للمرفعين${result.curriculumResult.updatedTracks.length ? `، وقالب المقررات (${result.curriculumResult.updatedTracks.map(esc).join("، ")})` : ""}. حُذف ${result.academicPrune.totalRemoved} سجلًا أكاديميًا قديمًا و${result.promotedBatch.historicalDuplicatesRemoved} تكرارًا زائدًا للمرفعين.</p>`;
        } catch (error) {
          button.disabled = false;
          status.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message)}</p>`;
        }
      });
    } catch (error) {
      preview.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message)}</p>`;
    }
  });
}

export async function mountPlanTab(root) {
  await ensureXlsx();
  root.innerHTML = `
    <div class="card">
      <h2>تحديث خطة القسم من ملف الخطة التنفيذية</h2>
      <p class="hint">استبدال كامل: يحذف كل مشاريع وإجراءات خطة القسم الحالية ويستبدلها بمحتوى الملف. تقدّم التنفيذ وربط بنود تقرير المتابعة الرسمي للإجراءات الحالية يُحذف معها — الخطة الجديدة تبدأ بلا تنفيذ مسجَّل.</p>
      <input type="file" id="plan-import-file" aria-label="ملف الخطة التنفيذية" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="margin-bottom:12px;">
      <div id="plan-import-preview"></div>
    </div>`;
  const input = root.querySelector("#plan-import-file");
  const preview = root.querySelector("#plan-import-preview");
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    preview.innerHTML = '<p class="hint">جارٍ تحليل الملف…</p>';
    try {
      const { projects, unknownPillars } = await parsePlanWorkbook(file);
      const replacePreview = await previewPlanReplace(projects);
      preview.innerHTML = `
        <div class="grid g3" style="margin-bottom:16px;">
          <div class="card stat"><div class="label">المشاريع الجديدة</div><div class="value">${replacePreview.newProjectsCount}</div></div>
          <div class="card stat"><div class="label">الإجراءات الجديدة</div><div class="value">${replacePreview.newActionsCount}</div></div>
          <div class="card stat"><div class="label">الخطة الحالية</div><div class="value">${replacePreview.existingProjectsCount} مشروعًا</div></div>
        </div>
        ${unknownPillars.length ? `<p class="hint" style="color:var(--critical);">تجاهلت ${esc(unknownPillars.join("، "))} — محور غير معروف، تحقق من عمود «المحور» بالملف.</p>` : ""}
        ${replacePreview.droppedPillars.length ? `<p class="hint" style="color:var(--critical);">محور${replacePreview.droppedPillars.length > 1 ? "ات" : ""} ${esc(replacePreview.droppedPillars.join("، "))} غير موجود بالملف الجديد — مشاريعه وإجراءاته الحالية ستُحذف نهائيًا.</p>` : ""}
        <button class="btn btn-primary" id="plan-import-commit">تنفيذ تحديث الخطة</button>
        <div id="plan-import-status"></div>`;
      preview.querySelector("#plan-import-commit").addEventListener("click", async () => {
        if (!await confirmDialog(`سيُحذف ${replacePreview.existingProjectsCount} مشروعًا و${replacePreview.existingActionsCount} إجراءً حاليًا، وتُستبدل بـ${replacePreview.newProjectsCount} مشروعًا و${replacePreview.newActionsCount} إجراءً من الملف. تقدّم التنفيذ وربط بنود تقرير المتابعة الحاليان يُحذفان معها. هل تريد التنفيذ؟`)) return;
        const button = preview.querySelector("#plan-import-commit");
        const status = preview.querySelector("#plan-import-status");
        button.disabled = true;
        status.innerHTML = '<p class="hint">جارٍ تنفيذ التحديث…</p>';
        try {
          const result = await commitPlanReplace(projects);
          preview.innerHTML = `<p class="hint" role="status">تم تحديث خطة القسم بنجاح: ${result.projectsCount} مشروعًا و${result.actionsCount} إجراءً، بعد حذف ${result.removedProjectsCount} مشروعًا سابقًا.</p>`;
        } catch (error) {
          button.disabled = false;
          status.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message)}</p>`;
        }
      });
    } catch (error) {
      preview.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message)}</p>`;
    }
  });
}

async function mountAveragesTab(root) {
  if (!folderScanSupported()) {
    root.innerHTML = `<div class="card"><h2>تحديث معدلات الطلبة من الشهادات</h2><p class="hint" style="color:var(--critical);">هذه الميزة تحتاج متصفح كروم أو إيدج (وصول لمجلد محلي) — غير مدعومة بمتصفحك الحالي.</p></div>`;
    return;
  }
  root.innerHTML = `
    <div class="card">
      <h2>تحديث معدلات الطلبة من الشهادات</h2>
      <p class="hint">يمسح مجلد "مسار" المحلي بحثًا عن شهادات PDF (نفس المجلد المستخدَم لصور/جداول/شهادات الطلبة)، ويحسب معدل كل طالب من شهاداته الرسمية فقط — استبدال كامل لكل المعدلات الحالية، لا تراكم.</p>
      <p class="hint" id="averages-folder-status"></p>
      <button class="btn btn-primary" id="averages-scan">اختيار مجلد الشهادات ومسحه</button>
      <button class="btn btn-ghost" id="averages-reset-folder">إعادة تعيين مجلد "مسار"</button>
      <div id="averages-progress"></div>
      <div id="averages-preview"></div>
    </div>`;
  const scanButton = root.querySelector("#averages-scan");
  const resetButton = root.querySelector("#averages-reset-folder");
  const folderStatus = root.querySelector("#averages-folder-status");
  const progress = root.querySelector("#averages-progress");
  const preview = root.querySelector("#averages-preview");

  async function refreshFolderStatus() {
    const name = await getMasarFolderName();
    folderStatus.textContent = name ? `المجلد المتصل حاليًا: ${name}` : "لا يوجد مجلد متصل حاليًا — سيُطلب اختياره عند أول مسح.";
  }
  await refreshFolderStatus();

  resetButton.addEventListener("click", async () => {
    if (!await confirmDialog('سيُنسى المجلد المتصل حاليًا، وسيُطلب اختيار مجلد "مسار" من جديد عند أول مسح لاحق. هل تريد المتابعة؟')) return;
    await forgetMasarFolder();
    await refreshFolderStatus();
  });

  scanButton.addEventListener("click", async () => {
    scanButton.disabled = true;
    preview.innerHTML = "";
    progress.innerHTML = '<p class="hint">جارٍ فتح المجلد…</p>';
    try {
      const files = await scanCertificatesFolder();
      if (!files) { progress.innerHTML = ""; scanButton.disabled = false; return; }
      if (!files.length) {
        progress.innerHTML = '<p class="hint" style="color:var(--critical);">لم يُعثر على أي ملف PDF داخل المجلد المختار.</p>';
        scanButton.disabled = false;
        return;
      }
      const students = await list("students");
      const result = await analyzeCertificateFiles(files, students, (done, total) => {
        progress.innerHTML = `<p class="hint">جارٍ قراءة الشهادات: ${done} من ${total}…</p>`;
      });
      progress.innerHTML = "";
      scanButton.disabled = false;
      const { academicFlagsRecords, termAveragesRecords, summary } = result;
      preview.innerHTML = `
        <div class="grid g3" style="margin:16px 0;">
          <div class="card stat"><div class="label">شهادات قُرئت</div><div class="value">${summary.certificatesRead}</div></div>
          <div class="card stat"><div class="label">طلاب بمعدلات محدَّثة</div><div class="value">${academicFlagsRecords.length}</div></div>
          <div class="card stat"><div class="label">معدلات فصلية رسمية</div><div class="value">${termAveragesRecords.length}</div></div>
        </div>
        <p class="hint">جداول حصص تم تجاهلها: ${summary.scheduleSkipped} · ملفات بها خطأ: ${summary.errorsCount} · ملفات مشكوك فيها (عدد مقررات غير منطقي): ${summary.suspiciousCount} · أرقام أكاديمية غير مطابقة لسجل الطلبة: ${summary.unmatchedCount}${summary.termConflictsCount ? ` · ⚠ تعارض بمعدل فصلي لنفس الطالب/الفترة: ${summary.termConflictsCount} (اعتُمد آخر ملف قُرئ)` : ""}</p>
        <button class="btn btn-primary" id="averages-commit">تنفيذ التحديث</button>
        <div id="averages-commit-status"></div>`;
      preview.querySelector("#averages-commit").addEventListener("click", async () => {
        if (!await confirmDialog(`سيُستبدَل كل ما هو محفوظ حاليًا بمعدلات ${academicFlagsRecords.length} طالبًا و${termAveragesRecords.length} معدّلًا فصليًا من الشهادات المقروءة. أي طالب لا شهادة له بهذا المسح ستُحذف معدلاته القديمة. هل تريد التنفيذ؟`)) return;
        const commitButton = preview.querySelector("#averages-commit");
        const status = preview.querySelector("#averages-commit-status");
        commitButton.disabled = true;
        status.innerHTML = '<p class="hint">جارٍ الحفظ…</p>';
        try {
          const commitResult = await commitAcademicAverages({ academicFlagsRecords, termAveragesRecords });
          status.innerHTML = `<p class="hint" role="status">تم التحديث بنجاح: ${commitResult.academicFlagsCount} طالبًا، ${commitResult.termAveragesCount} معدّلًا فصليًا. حُذف ${commitResult.removedFlagsCount} سجل تحليل و${commitResult.removedTermsCount} معدّلًا فصليًا لم يعد لهما مصدر.</p>`;
        } catch (error) {
          commitButton.disabled = false;
          status.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message)}</p>`;
        }
      });
    } catch (error) {
      progress.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message)}</p>`;
      scanButton.disabled = false;
    }
  });
}

function summarizeRosterExport(result) {
  if (!result.totalRows) return "لا توجد تحديثات منذ آخر تصدير.";
  const parts = [];
  if (result.newCount) parts.push(`${result.newCount} جديد`);
  if (result.changedCount) parts.push(`${result.changedCount} معدّل`);
  if (result.deletedCount) parts.push(`${result.deletedCount} محذوف`);
  return `تم تنزيل الملف — ${parts.join("، ")}.`;
}

async function mountChangesTab(root) {
  root.innerHTML = `
    <div class="card">
      <h2>تصدير تحديثات سجل الطلبة</h2>
      <p class="hint">ملف Excel بالطلاب الجدد أو الذين تغيّر أي حقل من بياناتهم منذ آخر تصدير فقط — عمود "الحالة" (جديد/معدّل/محذوف)، والأعمدة الأخرى تقتصر على الحقول التي تغيّرت فعليًا. أول تصدير يشمل كل السجل الحالي كـ"جديد" (لا نسخة سابقة يُقارَن بها).</p>
      <button class="btn btn-primary" id="export-students-changes">تصدير تحديثات الطلبة (Excel)</button>
      <div id="export-students-status"></div>
    </div>
    <div class="card" style="margin-top:16px;">
      <h2>تصدير تحديثات سجل المعلمين</h2>
      <p class="hint">نفس الفكرة لسجل المعلمين — بيانات المعلمين الأساسية فقط (الصور خارج هذا التصدير، تُدار من شاشة المعلمين).</p>
      <button class="btn btn-primary" id="export-teachers-changes">تصدير تحديثات المعلمين (Excel)</button>
      <div id="export-teachers-status"></div>
    </div>`;

  function wire(buttonId, statusId, exportFn) {
    const button = root.querySelector(`#${buttonId}`);
    const status = root.querySelector(`#${statusId}`);
    button.addEventListener("click", async () => {
      button.disabled = true;
      status.innerHTML = '<p class="hint">جارٍ التصدير…</p>';
      try {
        const result = await exportFn();
        status.innerHTML = `<p class="hint" role="status">${esc(summarizeRosterExport(result))}</p>`;
      } catch (error) {
        status.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message)}</p>`;
      } finally {
        button.disabled = false;
      }
    });
  }

  wire("export-students-changes", "export-students-status", exportStudentsRosterChanges);
  wire("export-teachers-changes", "export-teachers-status", exportTeachersRosterChanges);
}

async function mountBackupTab(root) {
  renderBackupRestoreImport(root, async () => {
    window.location.reload();
  });
}

export async function mountImportsView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>الاستيراد</h1><div class="sub">تحديث بيانات المدرسة من ملف واحد، مع النسخ الاحتياطي والاستعادة الآمنة</div></div>
    </div>
    <div class="tabs">
      ${TABS.map((t, i) => `<div class="tab${i === 0 ? " active" : ""}" data-tab="${t.key}">${t.label}</div>`).join("")}
    </div>
    ${TABS.map((t, i) => `<div id="imports-root-${t.key}" style="${i === 0 ? "" : "display:none;"}"></div>`).join("")}
  `;

  const roots = Object.fromEntries(TABS.map((t) => [t.key, container.querySelector(`#imports-root-${t.key}`)]));
  const mounters = { school: mountSchoolTab, plan: mountPlanTab, averages: mountAveragesTab, changes: mountChangesTab, backup: mountBackupTab };
  const mounted = new Set();

  const activate = async (key) => {
    Object.entries(roots).forEach(([k, root]) => { root.style.display = k === key ? "" : "none"; });
    if (!mounted.has(key)) {
      mounted.add(key);
      await mounters[key](roots[key]);
    }
  };

  container.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      container.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      await activate(tab.dataset.tab);
    });
  });

  await activate(TABS[0].key);
}
