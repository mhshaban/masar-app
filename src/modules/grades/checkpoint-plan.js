// تصنيف الطلبة حسب الوقفة التقويمية الأولى وخطة جلسات التحسين لكل فئة.
// دوال نقية: التصنيف يستبعد الأصفار غير المؤكدة (قد تكون «لم تُرصد»).
export const CATEGORY_LABELS = { low: "متدني", mid: "متوسط", top: "متفوق", none: "بلا درجات مرصودة", missing: "غير مدرج في كشوف الوقفة" };
export const GROUP_LABELS = { absentAll: "غائب عن كل المقررات", A: "المجموعة (أ): 3 مقررات فأكثر", B: "المجموعة (ب)", oneWeak: "ضعيف في مقرر واحد", "": "" };

export function classifyRecord(record) {
  const subjects = (record?.subjects || []).filter((s) => s.pct != null && !(s.score === 0 && !s.zeroConfirmed));
  if (!subjects.length) return { category: "none", group: "", average: null, weak: [], weakCount: 0 };
  const raw = subjects.reduce((a, s) => a + s.pct, 0) / subjects.length;
  const average = Math.round(raw * 10) / 10;
  // العدّ بالمقرر (الرمز) لا بالاسم: انج 801 وانج 811 مقرران منفصلان.
  const weakSubjects = subjects.filter((s) => s.pct < 50);
  const n = weakSubjects.length;
  const weak = [...new Set(weakSubjects.map((s) => (s.code && !String(s.name || "").includes(s.code) ? `${s.name} (${s.code})` : s.name || s.code)))];
  // غائب عن الوقفة كاملة (كل درجاته أصفار مؤكدة): مجموعة بروحها داخل المتدنين.
  if (subjects.every((s) => s.pct === 0)) return { category: "low", group: "absentAll", average, weak, weakCount: n };
  if (raw < 60 || n >= 2) return { category: "low", group: n >= 3 ? "A" : "B", average, weak, weakCount: n };
  if (raw >= 90 && !n) return { category: "top", group: "", average, weak, weakCount: n };
  return { category: "mid", group: n ? "oneWeak" : "", average, weak, weakCount: n };
}

// الجلسات: groups = المجموعات المعنية داخل الفئة (فارغة = كل الفئة)؛ parent = يحضرها ولي الأمر.
export const PLAN_SESSIONS = {
  low: [
    { id: "low-group", title: "جلسة «درجاتي وخطة مذاكرتي»", groups: [], attendees: "كل المتدنين، جلسة لكل مستوى", duration: "40 دقيقة", content: "قراءة الطالب لدرجاته، وأسباب الضعف (منها الغياب)، وتنظيم المذاكرة، والساعات المكتبية", output: "خطة مذاكرة يكتبها كل طالب" },
    { id: "low-parents", title: "لقاء أولياء الأمور الجماعي", groups: ["A", "absentAll"], parent: true, attendees: "أولياء أمور المجموعة (أ) والغائبين عن كل المقررات، لقاء لكل مستوى", duration: "45 دقيقة", content: "عرض تقرير التحصيل، ودور الأسرة في المتابعة والحضور، وتعهد تحسين", output: "تعهد موقّع من ولي الأمر" },
    { id: "low-tutoring", title: "الإحالة إلى دروس التقوية", groups: [], attendees: "كل المتدنين، تنفذها الأقسام", duration: "حصة أسبوعيًا", content: "الإنجليزي والرياضيات والرسم الفني أولًا، والقسم يتابع الحضور فقط", output: "كشف حضور من الأقسام" },
  ],
  mid: [
    { id: "mid-section", title: "جلسة الشعبة «من الجيد إلى الممتاز»", groups: [], attendees: "متوسطو كل شعبة، يقدّمها مرشد الشعبة في حصته", duration: "25 دقيقة", content: "أهداف الوقفة الثانية، والمقرر الضعيف وساعات معلمه المكتبية، وأثر المعدل في القبول والتوظيف", output: "هدف مكتوب لكل طالب، وتقرير التحصيل لولي الأمر بالبريد" },
  ],
  top: [
    { id: "top-honor", title: "لقاء تكريم وتحفيز", groups: [], parent: true, attendees: "المتفوقون، ويُدعى أولياء الأمور", duration: "40 دقيقة", content: "شهادات تقدير، وبرامج التفوق والبعثات، ودعوة للتطوع في «الزميل المساند» (اختياري)", output: "قائمة المتطوعين" },
  ],
  none: [],
  missing: [],
};

export const PLAN_GOALS = {
  low: "أن يرتفع كل طالب فوق 50% في مقرر واحد على الأقل من مقررات ضعفه في الوقفة الثانية.",
  mid: "أن ينتقل ربع الفئة إلى 85% فأكثر، وألا ينزل أحد منها إلى المتدنية، مع التركيز على الضعاف في مقرر واحد.",
  top: "أن يحافظ المتفوقون على 90% فأكثر.",
};

export function sessionsFor(cls, level = "") {
  return (PLAN_SESSIONS[cls.category] || []).filter((s) => (!s.groups.length || s.groups.includes(cls.group)) && (!s.levels || s.levels.includes(level)));
}

// سجل الجلسات يُحفظ داخل سجل الوقفة: record.plan.sessions[id] = { date, parentAttended, note }
export function withSessionLog(record, sessionId, entry, { by = "", at = new Date().toISOString() } = {}) {
  const plan = record.plan || {};
  const sessions = { ...(plan.sessions || {}) };
  if (!entry || !entry.date) delete sessions[sessionId];
  else sessions[sessionId] = { date: entry.date, parentAttended: !!entry.parentAttended, note: String(entry.note || "").slice(0, 300), by, at };
  return { ...record, plan: { ...plan, sessions } };
}
