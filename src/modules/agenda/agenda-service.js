import { list as listAll } from "../../services/cloud-runtime.js";
import { DEFAULT_PROGRESS } from "../execution/execution-service.js";

export async function listAgendaEntries() {
  const [projects, progressRecords] = await Promise.all([
    listAll("departmentPlanProjects"),
    listAll("actionProgress"),
  ]);
  const progressById = new Map(progressRecords.map((p) => [p.id, p]));

  const entries = [];
  for (const project of projects) {
    for (const action of project.actions || []) {
      const id = `${project.id}-a${action.no}`;
      entries.push({
        id,
        // مخزَّنان صراحةً (لا تُشتَقّان من تفكيك id) — project.id نفسه قد
        // يحتوي شرطة "-" (صيغة معرّفات cloud-runtime.js: طابع زمني-عشوائي)،
        // فتفكيك id بحثًا عن "-a" غير موثوق أبدًا.
        projectId: project.id,
        no: action.no,
        pillar: project.pillar,
        project_title: project.project_title,
        program_name: project.program_name,
        action: action.action,
        target: action.target,
        executor: action.executor,
        follower: action.follower,
        evidence: action.evidence,
        period: action.period,
        periodStart: action.periodStart || null,
        periodEnd: action.periodEnd || null,
        progress: progressById.get(id) || { id, ...DEFAULT_PROGRESS },
      });
    }
  }
  return entries;
}

// إجراءات بنفس نص الفترة تُجمَّع بمجموعة وحدة كما هو معتاد، لكن ترتيب
// المجموعات نفسها صار زمنيًا بحسب أقرب periodStart داخل كل مجموعة — بدل
// ترتيب عشوائي (ترتيب ظهور الإجراءات بالملف الأصلي، اللي كان يخلي مثلًا
// "الأسبوع الثاني من سبتمبر" يظهر بعد "20 سبتمبر" رغم إنه أبكر منه فعليًا).
// مجموعة ما فيها ولا إجراء واحد له periodStart (كل الإجراءات القديمة قبل
// إضافة حقلي التاريخ) تظهر بقسم "بلا تاريخ محدد" بآخر الترتيب دائمًا، لا
// تختلط عشوائيًا بين المجموعات المؤرَّخة.
// إجراءات المجموعة الواحدة نفسها تُرتَّب زمنيًا الآن أيضًا (تاريخ البداية،
// وتاريخ النهاية عند تساوي البداية) — بدل ترتيب ظهورها الأصلي بالملف. إجراء
// بلا periodStart يظل ضمن مجموعته لكن يُدفع لآخرها، لا يختلط عشوائيًا بين
// الإجراءات المؤرَّخة (طلب حقيقي من المرشد بعد ملاحظة الترتيب العشوائي).
function sortEntriesByDate(items) {
  return [...items].sort((a, b) => {
    if (a.periodStart && b.periodStart) {
      const cmp = a.periodStart.localeCompare(b.periodStart);
      if (cmp !== 0) return cmp;
      if (a.periodEnd && b.periodEnd) return a.periodEnd.localeCompare(b.periodEnd);
      if (a.periodEnd) return -1;
      if (b.periodEnd) return 1;
      return 0;
    }
    if (a.periodStart) return -1;
    if (b.periodStart) return 1;
    return 0;
  });
}

export async function groupByPeriod(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.period || "بلا فترة محددة";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const earliestStart = (items) => items.map((e) => e.periodStart).filter(Boolean).sort()[0] || null;

  const sortedEntries = [...groups.entries()].sort(([, itemsA], [, itemsB]) => {
    const a = earliestStart(itemsA);
    const b = earliestStart(itemsB);
    if (a && b) return a.localeCompare(b);
    if (a) return -1;
    if (b) return 1;
    return 0;
  }).map(([key, items]) => [key, sortEntriesByDate(items)]);

  return new Map(sortedEntries);
}

// إحصائية أجندة قابلة للحساب فعليًا — "فترة التنفيذ" بخطة القسم نص حر
// (مثال حقيقي: "طوال العام الدراسي"، "الأسبوع الثاني من سبتمبر") لا
// تواريخ فعلية، فـ"إجراءات قريبة من نهاية فترتها" غير قابل للحساب بموثوقية؛
// حالة التنفيذ (progress.status) هي الحقل الحقيقي الوحيد القابل للعد هنا.
// هذا أيضًا مصدر الإنجاز الوحيد المعتمَد بشاشتَي الرئيسية وخطة القسم الآن
// — بدل لقطة تقرير المتابعة الرسمي التاريخية (agendaStatus) اللي كانت
// تعرض رقمًا مجمَّدًا لا علاقة له بحالة الإجراءات الفعلية هالعام، فيتناقض
// أحيانًا مع نفس البند بالأجندة التنفيذية (مثال حقيقي أبلغ عنه المرشد).
export async function getAgendaProgressSummary() {
  const entries = await listAgendaEntries();
  const done = entries.filter((e) => e.progress.status === "done").length;
  const ongoing = entries.filter((e) => e.progress.status === "ongoing").length;
  const notStarted = entries.filter((e) => e.progress.status === "not_started").length;
  return { total: entries.length, done, ongoing, notStarted };
}

export async function listFollowUpItemOptions() {
  const items = await listAll("followUpItems");
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return items.map((item) => ({
    id: item.id,
    label: item.no === "*" ? item.title : `${item.no}. ${item.title}`,
  }));
}
