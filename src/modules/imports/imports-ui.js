// شاشة الاستيراد الموحَّدة (إدمن فقط): تحديث شامل من ملف المدرسة الواحد،
// مع إبقاء النسخ الاحتياطي والاستعادة الآمنة في التبويب الثاني فقط.
//
// الدرجات والشهادات: استيرادها انتقل بالكامل لـCowork (تحليل خارج التطبيق
// من ملفات OneDrive)، فلا تبويب استيراد لها هنا بعد الآن — راجع README.
//
// ملاحظة أمنية: إخفاء الشاشة في الواجهة مدعوم بسياسات RLS في قاعدة البيانات؛
// لا يستطيع غير الإدمن تنفيذ عمليات الاستيراد حتى بطلب REST مباشر.
import { renderImportSection as renderBackupRestoreImport } from "../backup/backup-ui.js";
import { ensureXlsx } from "../../services/vendor-loader.js";
import { parseSchoolWorkbook, previewStaleAcademicRecords, commitSchoolWorkbook } from "../../services/school-data-import-service.js?v=2026-09-06-current-roster-1";

const TABS = [
  { key: "school", label: "تحديث شامل" },
  { key: "backup", label: "النسخ الاحتياطي" },
];

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

async function mountSchoolTab(root) {
  await ensureXlsx();
  root.innerHTML = `
    <div class="card">
      <h2>تحديث بيانات المدرسة من ملف واحد</h2>
      <p class="hint">يحدّث سجل الطلبة والمعلمين والمرفعين، وينزّل نسخة احتياطية كاملة تلقائيًا قبل الحفظ.</p>
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
      const staleAcademic = await previewStaleAcademicRecords(data.students);
      const matched = data.promotedRows.filter((row) => row.matchStatus === "matched").length;
      const unmatched = data.promotedRows.length - matched;
      const uniquePromoted = new Set(data.promotedRows.filter((row) => row.matchStatus === "matched").map((row) => `${row.studentId}::${String(row.subjectCode || "").trim()}`)).size;
      const duplicateRows = matched - uniquePromoted;
      preview.innerHTML = `
        <div class="grid g3" style="margin-bottom:16px;">
          <div class="card stat"><div class="label">الطلاب</div><div class="value">${data.students.length}</div></div>
          <div class="card stat"><div class="label">المعلمون</div><div class="value">${data.teachers.length}</div></div>
          <div class="card stat"><div class="label">صفوف المرفعين</div><div class="value">${data.promotedRows.length}</div></div>
        </div>
        <p class="hint">المرفعين: ${matched} مطابق، ${unmatched} غير مطابق لن يُحفظ، ${duplicateRows} صف مكرر سيُدمج. لن تُحذف مقررات صحيحة غير موجودة في الملف.</p>
        <p class="hint">السجلات الأكاديمية القديمة خارج كشف الطلاب الحالي: ${staleAcademic.staleFlags.length} سجل تحليل و${staleAcademic.staleAverages.length} معدل فصلي. ستُحذف بعد تنزيل النسخة الاحتياطية.</p>
        <button class="btn btn-primary" id="school-import-commit">تنزيل نسخة احتياطية ثم تنفيذ التحديث</button>
        <div id="school-import-status"></div>`;
      preview.querySelector("#school-import-commit").addEventListener("click", async () => {
        if (!confirm(`سيتم تحديث ${data.students.length} طالبًا و${data.teachers.length} معلمًا و${uniquePromoted} مقررًا للمرفعين، وحذف ${staleAcademic.total} سجلًا أكاديميًا قديمًا خارج الكشف الحالي. ستُنزل نسخة احتياطية أولًا. هل تريد التنفيذ؟`)) return;
        const button = preview.querySelector("#school-import-commit");
        const status = preview.querySelector("#school-import-status");
        button.disabled = true;
        status.innerHTML = '<p class="hint">جارٍ إنشاء النسخة الاحتياطية وتنفيذ التحديث…</p>';
        try {
          const result = await commitSchoolWorkbook(data, { fileName: file.name });
          preview.innerHTML = `<p class="hint" role="status">تم التحديث بنجاح: ${result.studentsCount} طالبًا، ${result.teachersCount} معلمًا، و${result.promotedBatch.matchedCount - result.promotedBatch.duplicateRowsRemoved} مقررًا للمرفعين. حُذف ${result.academicPrune.totalRemoved} سجلًا أكاديميًا قديمًا.</p>`;
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
  const mounters = { school: mountSchoolTab, backup: mountBackupTab };
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
