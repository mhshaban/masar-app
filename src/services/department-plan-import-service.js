// استيراد خطة القسم من ملف "الخطة التنفيذية" الرسمي (شيت واحد، صف عنوان ثم
// صف ترويسة ثم الإجراءات) — بنفس أسلوب "تحديث شامل" لبيانات المدرسة:
// معاينة الأعداد قبل الاعتماد، ثم استبدال كامل للخطة الحالية (مشاريعها
// وإجراءاتها) بمحتوى الملف. تقدّم التنفيذ (actionProgress) وربط بنود
// تقرير المتابعة الرسمي مرتبطان برقم الإجراء داخل مشروعه (no) — استبدال
// كامل يعني بداية جديدة لهذا الربط، لأن أرقام/مشاريع الإجراءات نفسها
// تتغيّر مع خطة جديدة.
import { readWorkbook } from "./xlsx-parser.js";
import { list, bulkPut } from "./cloud-runtime.js";
import { deleteProject, PILLARS } from "../modules/department-plan/department-plan-service.js";
import { logAuditEvent } from "../modules/audit/audit-service.js?v=2026-09-10-plan-import-1";

const clean = (value) => String(value ?? "").replace(/[‎‏‪-‮]/g, "").trim();

const HEADER_ALIASES = {
  pillar: ["المحور"],
  program: ["البرنامج"],
  action: ["الاجراء", "الإجراء", "الإجراء الموحد"],
  target: ["الفئة المستهدفة"],
  executor: ["دور المكتب"],
  follower: ["الأقسام المشاركة", "الشريك/المالك الفني", "الشريك / المالك الفني", "الشريك"],
  evidence: ["الثبوتيات", "مصدر التحقق"],
  period: ["فترة التنفيذ"],
  periodStart: ["تاريخ بدء التنفيذ المقترح"],
  periodEnd: ["تاريخ نهاية التنفيذ المقترح"],
};

function columnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const header = clean(cell);
    for (const [field, names] of Object.entries(HEADER_ALIASES)) {
      if (map[field] === undefined && names.includes(header)) map[field] = index;
    }
  });
  return map;
}

// صف العنوان الأول بالملف يحتوي خلية وحيدة (عنوان الخطة)، فالترويسة
// الفعلية هي أول صف فيه عمودا "المحور" و"البرنامج" معًا — بحث بدل افتراض
// رقم صف ثابت حتى لا ينكسر الاستيراد لو أُضيف صف علوي إضافي بنسخة قادمة.
function findHeaderRowIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i];
    if (!row) continue;
    const cleaned = row.map(clean);
    if (cleaned.includes("المحور") && cleaned.includes("البرنامج")) return i;
  }
  return -1;
}

// تواريخ الإكسل مخزّنة كرقم تسلسلي (أيام منذ 1899-12-30، نظام Excel
// القياسي) لأن readWorkbook يقرأ raw:true — بلا مكتبة تحويل خارجية.
function excelSerialToISODate(value) {
  if (value == null || value === "") return null;
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function parsePlanRows(rows) {
  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx === -1) throw new Error("تعذّر إيجاد صف ترويسة الخطة — تأكد من وجود عمودي «المحور» و«البرنامج».");
  const cols = columnMap(rows[headerIdx]);
  if (cols.action === undefined) throw new Error("تعذّر التعرّف على عمود «الإجراء».");

  const projectsByKey = new Map();
  const order = [];
  const unknownPillars = new Set();

  for (const row of rows.slice(headerIdx + 1)) {
    if (!row || row.every((cell) => cell == null || cell === "")) continue;
    const actionText = clean(row[cols.action]);
    if (!actionText) continue;
    const pillar = clean(row[cols.pillar]);
    const program = clean(row[cols.program]);
    if (!PILLARS.includes(pillar)) {
      unknownPillars.add(pillar || "(بلا محور)");
      continue;
    }
    const key = `${pillar}::${program}`;
    if (!projectsByKey.has(key)) {
      projectsByKey.set(key, {
        pillar,
        project_title: program || "بلا عنوان",
        program_name: "",
        goal_specific: "",
        team_lead: "",
        actions: [],
      });
      order.push(key);
    }
    const project = projectsByKey.get(key);
    project.actions.push({
      no: project.actions.length + 1,
      action: actionText,
      target: clean(row[cols.target]),
      executor: clean(row[cols.executor]),
      follower: clean(row[cols.follower]),
      evidence: clean(row[cols.evidence]),
      period: clean(row[cols.period]),
      periodStart: excelSerialToISODate(row[cols.periodStart]),
      periodEnd: excelSerialToISODate(row[cols.periodEnd]),
    });
  }

  // `order` صريح لكل مشروع — id المشاريع يُولَّد عشوائيًا عند bulkPut ولا
  // يحفظ ترتيب البرامج بالملف، فبدون هذا الحقل تظهر البرامج بترتيب عشوائي
  // بدل ١،٢،٣... (انظر ترتيب listProjectsByPillar).
  const projects = order.map((key, index) => ({ ...projectsByKey.get(key), order: index }));
  if (!projects.length) throw new Error("ما فيه أي إجراء صالح بالملف — تأكد من مطابقة أسماء المحاور بالضبط.");
  return { projects, unknownPillars: [...unknownPillars] };
}

export async function parsePlanWorkbook(file) {
  const { sheetNames, sheets } = await readWorkbook(file);
  const sheetName = sheetNames.find((name) => clean(name).includes("الخطة")) || sheetNames[0];
  const { projects, unknownPillars } = parsePlanRows(sheets[sheetName] || []);
  return { sheetName, projects, unknownPillars };
}

export async function previewPlanReplace(projects) {
  const existing = await list("departmentPlanProjects");
  const presentPillars = new Set(projects.map((p) => p.pillar));
  const droppedPillars = PILLARS.filter((p) => !presentPillars.has(p) && existing.some((e) => e.pillar === p));
  return {
    existingProjectsCount: existing.length,
    existingActionsCount: existing.reduce((sum, p) => sum + (p.actions || []).length, 0),
    newProjectsCount: projects.length,
    newActionsCount: projects.reduce((sum, p) => sum + p.actions.length, 0),
    droppedPillars,
  };
}

// استبدال كامل: يكتب مشاريع الخطة الجديدة أولًا (حتى لو انقطع الاتصال لا
// تبقى الخطة فارغة)، ثم يحذف كل مشروع قديم — الحذف عبر deleteProject
// نفسها المستخدمة بشاشة خطة القسم فيحذف معه أي actionProgress يتيم مرتبط
// بإجراءات لم تعد موجودة.
export async function commitPlanReplace(projects) {
  const existing = await list("departmentPlanProjects");
  await bulkPut("departmentPlanProjects", projects);
  for (const project of existing) await deleteProject(project.id);
  const actionsCount = projects.reduce((sum, p) => sum + p.actions.length, 0);
  await logAuditEvent("import_department_plan", { tableName: "departmentPlanProjects", count: projects.length });
  return { projectsCount: projects.length, actionsCount, removedProjectsCount: existing.length };
}
