// شاشة الاستيراد الموحَّدة (إدمن فقط): تحديث شامل من ملف المدرسة الواحد،
// مع إبقاء النسخ الاحتياطي والاستعادة الآمنة في التبويب الثاني فقط.
//
// الدرجات والشهادات: تحديث معدلات الطلبة (academicFlags/termAverages/
// courseGrades) من شيتات "درجات المقررات"/"المعدلات الفصلية"/"المعدلات
// السنوية" بملف كشف الطلاب نفسه (تبويب "تحديث المعدلات") — مصدر واحد فقط،
// بلا شهادات PDF ولا مجلد OneDrive محلي. "تدقيق قالب المقررات" بنفس
// التبويب يقرأ courseGrades المستوردة أصلًا (بلا مسح أو رفع إضافي). الاستثناء
// الوحيد الباقي لـPDF/OneDrive بكل التطبيق: عرض/طباعة شهادة الطالب الأصلية
// من ملف الطالب — راجع README.
//
// ملاحظة أمنية: إخفاء الشاشة في الواجهة مدعوم بسياسات RLS في قاعدة البيانات؛
// لا يستطيع غير الإدمن تنفيذ عمليات الاستيراد حتى بطلب REST مباشر.
import { renderImportSection as renderBackupRestoreImport } from "../backup/backup-ui.js?v=2026-09-09-import-fix-1";
import { ensureXlsx } from "../../services/vendor-loader.js?v=2026-09-07-academic-fix-1";
import { parseSchoolWorkbook, previewStaleAcademicRecords, previewHistoricalPromotedDuplicates, commitSchoolWorkbook } from "../../services/school-data-import-service.js?v=2026-09-16-prep-school-results-1";
import { parsePlanWorkbook, previewPlanReplace, commitPlanReplace } from "../../services/department-plan-import-service.js?v=2026-09-10-plan-order-fix-1";
import { parseAcademicAveragesWorkbook, buildAcademicAverages as buildAcademicAveragesFromWorkbook, commitAcademicAverages } from "../../services/academic-averages-workbook-import-service.js?v=2026-09-23-averages-from-workbook-2";
import { exportStudentsRosterChanges, exportTeachersRosterChanges } from "../../services/roster-changes-export-service.js?v=2026-09-11-roster-changes-1";
import { scanCurriculumGaps, downloadCurriculumGapsWorkbook } from "../../services/curriculum-gap-audit-service.js?v=2026-09-23-averages-from-workbook-2";
import { list } from "../../services/cloud-runtime.js";

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
  await ensureXlsx();
  root.innerHTML = `
    <div class="card">
      <h2>تحديث معدلات الطلبة من ملف كشف الطلاب</h2>
      <p class="hint">يقرأ شيتات "درجات المقررات"/"المعدلات الفصلية"/"المعدلات السنوية" من نفس ملف كشف الطلاب الشامل، ويحسب معدل كل طالب منها — استبدال كامل لكل المعدلات الحالية، لا تراكم. مصدر واحد فقط بدل شهادات PDF.</p>
      <input type="file" id="averages-import-file" aria-label="ملف كشف الطلاب الشامل" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="margin-bottom:12px;">
      <div id="averages-preview"></div>
    </div>
    <div class="card" style="margin-top:16px;">
      <h2>تدقيق قالب المقررات</h2>
      <p class="hint">يقرأ درجات المقررات المستوردة أصلًا (بلا رفع ملف إضافي)، ويجمع كل رمز مقرر ظهر بدرجة ناجحة (٥٠٪ فأكثر، بلا غياب/حرمان) ولم يكن موجودًا بقالب المقررات لأي من المسارين — لاكتشاف مقررات جديدة يحتاج القالب تحديثها. قراءة فقط، لا يُغيّر القالب أو أي بيانات بنفسه؛ ينزّل ملف Excel للمراجعة اليدوية.</p>
      <button class="btn btn-ghost" id="gaps-scan">تحليل الفجوات وتنزيل التقرير</button>
      <div id="gaps-result"></div>
    </div>`;

  const importInput = root.querySelector("#averages-import-file");
  const preview = root.querySelector("#averages-preview");
  importInput.addEventListener("change", async () => {
    const file = importInput.files[0];
    if (!file) return;
    preview.innerHTML = '<p class="hint">جارٍ تحليل الملف…</p>';
    try {
      const parsed = await parseAcademicAveragesWorkbook(file);
      const students = await list("students");
      const { academicFlagsRecords, termAveragesRecords, courseGradesRecords, summary } = buildAcademicAveragesFromWorkbook(parsed, students);
      preview.innerHTML = `
        <div class="grid g3" style="margin:16px 0;">
          <div class="card stat"><div class="label">صفوف درجات مقروءة</div><div class="value">${summary.courseRowsRead}</div></div>
          <div class="card stat"><div class="label">طلاب بمعدلات محدَّثة</div><div class="value">${academicFlagsRecords.length}</div></div>
          <div class="card stat"><div class="label">معدلات فصلية</div><div class="value">${termAveragesRecords.length}</div></div>
        </div>
        <p class="hint">أرقام أكاديمية بالملف غير مطابقة لسجل الطلبة الحالي: ${summary.unmatchedCount}${summary.termConflictsCount ? ` · ⚠ تعارض بمعدل فصلي لنفس الطالب/الفترة: ${summary.termConflictsCount} (اعتُمد آخر صف قُرئ)` : ""}</p>
        <button class="btn btn-primary" id="averages-commit">تنفيذ التحديث</button>
        <div id="averages-commit-status"></div>`;
      preview.querySelector("#averages-commit").addEventListener("click", async () => {
        if (!await confirmDialog(`سيُستبدَل كل ما هو محفوظ حاليًا بمعدلات ${academicFlagsRecords.length} طالبًا و${termAveragesRecords.length} معدّلًا فصليًا من الملف المقروء. أي طالب لا صفوف درجات له بهذا الملف ستُحذف معدلاته القديمة. هل تريد التنفيذ؟`)) return;
        const commitButton = preview.querySelector("#averages-commit");
        const status = preview.querySelector("#averages-commit-status");
        commitButton.disabled = true;
        status.innerHTML = '<p class="hint">جارٍ الحفظ…</p>';
        try {
          const commitResult = await commitAcademicAverages({ academicFlagsRecords, termAveragesRecords, courseGradesRecords });
          status.innerHTML = `<p class="hint" role="status">تم التحديث بنجاح: ${commitResult.academicFlagsCount} طالبًا، ${commitResult.termAveragesCount} معدّلًا فصليًا، ${commitResult.courseGradesCount} صف درجة. حُذف ${commitResult.removedFlagsCount} سجل تحليل و${commitResult.removedTermsCount} معدّلًا فصليًا و${commitResult.removedCourseGradesCount} صف درجة لم يعد لها مصدر.</p>`;
        } catch (error) {
          commitButton.disabled = false;
          status.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message)}</p>`;
        }
      });
    } catch (error) {
      preview.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message)}</p>`;
    }
  });

  const gapsButton = root.querySelector("#gaps-scan");
  const gapsResult = root.querySelector("#gaps-result");
  gapsButton.addEventListener("click", async () => {
    gapsButton.disabled = true;
    gapsResult.innerHTML = '<p class="hint">جارٍ التحليل…</p>';
    try {
      const scan = await scanCurriculumGaps();
      gapsButton.disabled = false;
      if (!scan.rows.length) {
        gapsResult.innerHTML = `<p class="hint" role="status">لا توجد مقررات غير مدرجة بالقالب — فُحصت درجات ${scan.studentsRead} طالبًا.</p>`;
        return;
      }
      await downloadCurriculumGapsWorkbook(scan.rows);
      gapsResult.innerHTML = `<p class="hint" role="status">تم تنزيل تقرير الفجوات: ${scan.rows.length} رمز مقرر غير مدرج، من درجات ${scan.studentsRead} طالبًا. "الفصل" بالتقرير تخمين من ترتيب فصول كل طالب زمنيًا — راجعه قبل تحديث القالب.</p>`;
    } catch (error) {
      gapsResult.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message)}</p>`;
      gapsButton.disabled = false;
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
      <p class="hint">⚠ "آخر تصدير" محفوظ بهذا المتصفح/الجهاز فقط — لو صدّرت من متصفح أو جهاز آخر، أو مسحت بيانات الموقع، سيُعامَل السجل الحالي بالكامل كـ"جديد" بالتصدير التالي، بلا علاقة ببيانات Supabase نفسها.</p>
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
