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
        projectOrder: project.order ?? Infinity,
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

const NO_PERIOD_LABEL = "بلا فترة محددة";

// إجراءات المجموعة نفسها (بنفس نص الفترة) كثيرًا ما تحمل periodStart/periodEnd
// متفاوتة جدًا فعليًا — نفس النص "الأسبوع الرابع من سبتمبر" مثلًا سُجِّل لبعض
// إجراءاته periodStart أول سبتمبر (تقريب خشن وقت إدخال البيانات)، فترتيب
// المجموعات بـ"أقرب periodStart داخلها" (كما كان سابقًا) كان يقفز بمجموعات
// كاملة لأول الترتيب رغم إن نصّها يدل على فترة متأخرة فعليًا — خلل حقيقي
// أبلغ عنه المرشد. البديل هنا: استخراج ترتيب من نص الفترة نفسه (الشهر
// المذكور، ورقم الأسبوع إن وُجد)، مستقل تمامًا عن periodStart/periodEnd.
// العام الدراسي يبدأ سبتمبر لا يناير — سبتمبر=1 وأغسطس=12، لا رقم الشهر
// الميلادي الخام، وإلا كانت أشهر يناير-يونيو (من نفس العام الدراسي، لكن
// السنة الميلادية التالية) تُرتَّب قبل سبتمبر-ديسمبر خطأً.
const PERIOD_MONTH_INDEX = {
  "سبتمبر": 1, "أكتوبر": 2, "اكتوبر": 2, "نوفمبر": 3, "ديسمبر": 4,
  "يناير": 5, "فبراير": 6, "مارس": 7, "أبريل": 8, "ابريل": 8, "مايو": 9, "يونيو": 10,
  "يوليو": 11, "أغسطس": 12, "اغسطس": 12,
};
const PERIOD_WEEK_INDEX = { "الأول": 1, "الاول": 1, "الثاني": 2, "الثالث": 3, "الرابع": 4 };

// فترات "مشتركة" تغطي العام الدراسي أو كل فصل بلا نافذة زمنية ضيقة محدَّدة —
// تُدفع دائمًا لآخر الترتيب (بعد كل الفترات الأسبوعية/الشهرية المحدَّدة)، لا
// تُقارَن بشهر/أسبوع لأنها أصلًا لا تخص شهرًا بعينه. الترتيب بينها فيما بينها
// كما طلب المرشد صراحةً.
const GENERIC_PERIODS = [
  "طوال العام الدراسي",
  "الفصلان الدراسيان",
  "نهاية كل فصل دراسي",
  "نهاية كل فصل دراسي، طوال العام الدراسي",
  "فترة الامتحانات النهائية من كل فصل دراسي",
  "الفصل الدراسي الثاني",
];

function normalizeAlef(text) {
  return String(text || "").replace(/[إأآ]/g, "ا").trim();
}

const NORMALIZED_GENERIC_PERIODS = GENERIC_PERIODS.map(normalizeAlef);

// [0, شهر, أسبوع] للفترات المحدَّدة (مرتَّبة تصاعديًا) — [1, ترتيبها بالقائمة]
// للفترات المشتركة (دائمًا بعد كل فترة محدَّدة) — [2] لفترة غير موجودة أصلًا
// (تُدفع لآخر شيء دائمًا، نفس مكان "بلا تاريخ محدد" بالتجميع الشهري).
function periodSortKey(periodText) {
  if (periodText === NO_PERIOD_LABEL) return [2];
  const norm = normalizeAlef(periodText);
  const genericIdx = NORMALIZED_GENERIC_PERIODS.indexOf(norm);
  if (genericIdx !== -1) return [1, genericIdx];

  let month = null;
  for (const [name, idx] of Object.entries(PERIOD_MONTH_INDEX)) {
    if (norm.includes(name) && (month === null || idx < month)) month = idx;
  }
  let week = null;
  for (const [name, idx] of Object.entries(PERIOD_WEEK_INDEX)) {
    if (norm.includes(name) && (week === null || idx < week)) week = idx;
  }
  // "بداية/منتصف/نهاية شهر" تحدَّد موضع الفترة داخل الشهر بلا رقم أسبوع صريح
  // — لا تُطبَّق إن كان رقم أسبوع صريح موجودًا أصلًا (مثال: "الأسبوع الثالث
  // من سبتمبر إلى نهاية أكتوبر" يبدأ الأسبوع الثالث من سبتمبر فعليًا؛
  // "نهاية" هنا تصف نهاية المدى لا بداية الفترة نفسها).
  if (week === null) {
    if (norm.includes("بداية")) week = 0.5;
    else if (norm.includes("منتصف")) week = 2.5;
    else if (norm.includes("نهاية")) week = 4.5;
    else week = 0;
  }

  if (month === null) return [1, NORMALIZED_GENERIC_PERIODS.length]; // شهر غير مفهوم من النص — بعد كل الفترات المشتركة المعروفة، قبل "بلا فترة محددة"
  return [0, month, week];
}

function comparePeriodKeys(a, b) {
  const ka = periodSortKey(a);
  const kb = periodSortKey(b);
  for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
    const va = ka[i] ?? -1;
    const vb = kb[i] ?? -1;
    if (va !== vb) return va - vb;
  }
  return 0;
}

export async function groupByPeriod(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.period || NO_PERIOD_LABEL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const sortedEntries = [...groups.entries()]
    .sort(([keyA], [keyB]) => comparePeriodKeys(keyA, keyB))
    .map(([key, items]) => [key, sortEntriesByDate(items)]);

  return new Map(sortedEntries);
}

const NO_DATE_LABEL = "بلا تاريخ محدد";

// اسم شهر عربي كامل (مثال: "سبتمبر 2025") من مفتاح "YYYY-MM" — يبني
// التاريخ محليًا بيوم 1 صراحةً (لا تحليل ISO عبر Date مباشرة) لتفادي
// انزياح المنطقة الزمنية اللي ممكن يحوّل يوم 1 لنهاية الشهر السابق.
function monthLabel(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("ar-BH", { month: "long", year: "numeric" });
}

// تجميع بحسب فترة التنفيذ الرقمية (periodStart) — الترتيب الافتراضي
// الآن بطلب المرشد، بديل عن التجميع بنص الفترة الحر (groupByPeriod أعلاه،
// لا يزال متاحًا كخيار ثانٍ من الواجهة). كل إجراءات نفس الشهر (بحسب
// periodStart) تُجمَّع ببطاقة واحدة، والأشهر مرتَّبة زمنيًا تصاعديًا؛
// إجراء بلا periodStart إطلاقًا يظهر بمجموعة "بلا تاريخ محدد" الوحيدة
// دائمًا بآخر الترتيب — نفس مكانه بالضبط بالتجميع النصي، لنفس السبب
// (لا تاريخ فعلي يُرتَّب بحسبه).
export async function groupByMonth(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.periodStart ? entry.periodStart.slice(0, 7) : NO_DATE_LABEL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }

  const sortedKeys = [...groups.keys()].filter((k) => k !== NO_DATE_LABEL).sort();
  const orderedEntries = sortedKeys.map((key) => [monthLabel(key), sortEntriesByDate(groups.get(key))]);
  if (groups.has(NO_DATE_LABEL)) {
    orderedEntries.push([NO_DATE_LABEL, sortEntriesByDate(groups.get(NO_DATE_LABEL))]);
  }

  return new Map(orderedEntries);
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
