// شاشة استيراد موحَّدة (إدمن فقط) — تجمع كل استيرادات الملفات المبعثرة
// سابقًا بشاشاتها (سجل الطلبة، الدرجات والتحليلات، الطلاب المرفعين،
// النسخ الاحتياطي) في مكان واحد. لا تكرار منطق: كل تبويب هنا يستدعي نفس
// دوال العرض المستوردة من ملف الشاشة الأصلي (export مضاف لها هناك)، فقط
// إعادة تجميع بصري — منطق القراءة/التحقق/الحفظ نفسه بلا أي تغيير.
//
// ملاحظة أمنية: إخفاء الشاشة في الواجهة مدعوم بسياسات RLS في قاعدة البيانات؛
// لا يستطيع غير الإدمن تنفيذ عمليات الاستيراد حتى بطلب REST مباشر.
import { getRosterStatus } from "../students/students-service.js";
import { renderImportSection as renderStudentsRosterImport, renderPhotoImportSection } from "../students/students-ui.js";
import { renderImportTab as renderGradesImportTab } from "../grades/grades-ui.js";
import {
  renderImportSection as renderPromotedRosterImport,
  renderBatchHistory as renderPromotedBatchHistory,
  renderScheduleImportSection,
  renderSchedulePdfImportSection,
} from "../promoted/promoted-ui.js";
import { renderImportSection as renderBackupRestoreImport } from "../backup/backup-ui.js";
import { ensurePdfJs, ensureXlsx } from "../../services/vendor-loader.js";

const TABS = [
  { key: "students", label: "سجل الطلبة" },
  { key: "grades", label: "الدرجات" },
  { key: "promoted", label: "الطلاب المرفعين" },
  { key: "backup", label: "النسخ الاحتياطي" },
];

async function mountStudentsTab(root) {
  await ensureXlsx();
  const status = await getRosterStatus();
  root.innerHTML = `
    <div id="imports-students-roster" style="margin-bottom:16px;"></div>
    <div id="imports-students-photos"></div>
  `;
  renderStudentsRosterImport(root.querySelector("#imports-students-roster"), {
    isUpdate: status.available,
    onImported: () => mountStudentsTab(root),
  });
  renderPhotoImportSection(root.querySelector("#imports-students-photos"), {
    onImported: () => mountStudentsTab(root),
  });
}

async function mountGradesTab(root) {
  await Promise.all([ensureXlsx(), ensurePdfJs()]);
  await renderGradesImportTab(root);
}

async function mountPromotedTab(root) {
  await Promise.all([ensureXlsx(), ensurePdfJs()]);
  root.innerHTML = `
    <div id="imports-promoted-roster" style="margin-bottom:16px;"></div>
    <div id="imports-promoted-history" style="margin-bottom:16px;"></div>
    <div id="imports-promoted-schedule" style="margin-bottom:16px;"></div>
    <div id="imports-promoted-schedule-pdf"></div>
  `;
  const historyRoot = root.querySelector("#imports-promoted-history");
  await renderPromotedBatchHistory(historyRoot);
  await renderPromotedRosterImport(root.querySelector("#imports-promoted-roster"), async () => {
    await renderPromotedBatchHistory(historyRoot);
  });
  await renderScheduleImportSection(root.querySelector("#imports-promoted-schedule"), async () => {});
  await renderSchedulePdfImportSection(root.querySelector("#imports-promoted-schedule-pdf"), async () => {});
}

async function mountBackupTab(root) {
  renderBackupRestoreImport(root, async () => {
    window.location.reload();
  });
}

export async function mountImportsView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>الاستيراد</h1><div class="sub">كل ملفات الاستيراد بمكان واحد — سجل الطلبة، الدرجات، الطلاب المرفعين، والنسخ الاحتياطي</div></div>
    </div>
    <div class="tabs">
      ${TABS.map((t, i) => `<div class="tab${i === 0 ? " active" : ""}" data-tab="${t.key}">${t.label}</div>`).join("")}
    </div>
    ${TABS.map((t, i) => `<div id="imports-root-${t.key}" style="${i === 0 ? "" : "display:none;"}"></div>`).join("")}
  `;

  const roots = Object.fromEntries(TABS.map((t) => [t.key, container.querySelector(`#imports-root-${t.key}`)]));
  const mounters = { students: mountStudentsTab, grades: mountGradesTab, promoted: mountPromotedTab, backup: mountBackupTab };
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
