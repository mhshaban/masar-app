// تصنيف الطلبة حسب الوقفة التقويمية الأولى وخطة جلسات التحسين لكل فئة.
// دوال نقية: التصنيف يستبعد الأصفار غير المؤكدة (قد تكون «لم تُرصد»).
export const CATEGORY_LABELS = { low: "متدني", mid: "متوسط", top: "متفوق", none: "بلا درجات مرصودة" };
export const GROUP_LABELS = { A: "المجموعة (أ): 3 مقررات فأكثر", B: "المجموعة (ب)", oneWeak: "ضعيف في مقرر واحد", "": "" };

export function classifyRecord(record) {
  const subjects = (record?.subjects || []).filter((s) => s.pct != null && !(s.score === 0 && !s.zeroConfirmed));
  if (!subjects.length) return { category: "none", group: "", average: null, weak: [], weakCount: 0 };
  const raw = subjects.reduce((a, s) => a + s.pct, 0) / subjects.length;
  const average = Math.round(raw * 10) / 10;
  // العدّ بالمقرر (الرمز) لا بالاسم: انج 801 وانج 811 مقرران منفصلان.
  const weakSubjects = subjects.filter((s) => s.pct < 50);
  const n = weakSubjects.length;
  const weak = [...new Set(weakSubjects.map((s) => (s.code && !String(s.name || "").includes(s.code) ? `${s.name} (${s.code})` : s.name || s.code)))];
  if (raw < 60 || n >= 2) return { category: "low", group: n >= 3 ? "A" : "B", average, weak, weakCount: n };
  if (raw >= 90 && !n) return { category: "top", group: "", average, weak, weakCount: n };
  return { category: "mid", group: n ? "oneWeak" : "", average, weak, weakCount: n };
}

// الجلسات: groups = المجموعات المعنية داخل الفئة (فارغة = كل الفئة)؛ parent = يحضرها ولي الأمر.
export const PLAN_SESSIONS = {
  low: [
    { id: "low-diag", title: "جلسة تشخيص فردية", groups: ["A"], attendees: "الطالب والمرشد الأكاديمي", duration: "20 دقيقة", content: "استعراض الدرجات مقررًا مقررًا، ومعرفة الأسباب (غياب، صعوبة مادة، ظرف أسري، عدم رغبة في التخصص)", output: "استمارة تشخيص" },
    { id: "low-parent", title: "لقاء ولي الأمر", groups: ["A"], parent: true, attendees: "ولي الأمر والطالب والمرشد الأكاديمي، ومعلم المقرر عند الحاجة", duration: "30 دقيقة", content: "عرض تقرير التحصيل، والاتفاق على جدول مذاكرة منزلي، ومتابعة الحضور", output: "تعهد تحسين يوقّعه الطالب وولي الأمر" },
    { id: "low-weekly", title: "متابعة أسبوعية قصيرة", groups: ["A"], attendees: "الطالب والمرشد الأكاديمي", duration: "10 دقائق أسبوعيًا", content: "مراجعة التزامه بالتعهد وحضوره الساعات المكتبية", output: "سجل متابعة" },
    { id: "low-study", title: "جلسة جماعية «كيف أذاكر»", groups: ["B"], attendees: "10 إلى 15 طالبًا من المستوى نفسه", duration: "35 دقيقة", content: "تنظيم الوقت، والاستعداد للاختبار، والاستفادة من الساعات المكتبية", output: "خطة مذاكرة شخصية" },
    { id: "low-subject", title: "دروس تقوية في المقرر", groups: ["A", "B"], attendees: "الطلبة الضعاف في المقرر نفسه بالتنسيق مع قسمه", duration: "حصة أسبوعيًا", content: "الرياضيات والإنجليزي والعربي أولًا", output: "كشف حضور من القسم" },
    { id: "low-notify", title: "إشعار ولي الأمر", groups: ["B"], parent: true, attendees: "المرشد الأكاديمي (اتصال أو رسالة)", duration: "—", content: "إرسال تقرير التحصيل ودعوة ولي الأمر إلى لقاء إن رغب", output: "سجل تواصل" },
  ],
  mid: [
    { id: "mid-one", title: "جلسة «مقرر واحد يفرق»", groups: ["oneWeak"], attendees: "الضعاف في مقرر واحد، في مجموعات حسب المقرر", duration: "30 دقيقة", content: "أثر المقرر الضعيف على المعدل، والإحالة إلى الساعات المكتبية لمعلمه", output: "موعد ساعة مكتبية" },
    { id: "mid-group", title: "جلسة «من الجيد إلى الممتاز»", groups: [], attendees: "حسب الشعبة، يقدّمها مرشد الشعبة", duration: "25 دقيقة", content: "أهداف الوقفة الثانية، ومهارات الاختبار، وأثر المعدل في القبول الجامعي والتوظيف", output: "هدف مكتوب لكل طالب" },
    { id: "mid-notify", title: "إشعار ولي الأمر", groups: [], parent: true, attendees: "المرشد الأكاديمي", duration: "—", content: "إرسال تقرير التحصيل بالبريد، مع تنبيه المقرر الضعيف إن وُجد", output: "سجل إرسال" },
  ],
  top: [
    { id: "top-honor", title: "لقاء تكريم وتحفيز", groups: [], parent: true, attendees: "المتفوقون، ويُدعى أولياء الأمور", duration: "40 دقيقة", content: "شهادات تقدير، وعرض برامج التفوق والمسابقات", output: "قائمة المرشحين للبرامج" },
    { id: "top-peer", title: "برنامج «الزميل المساند»", groups: [], attendees: "متطوعون من المتفوقين مع طلبة متدنين في شعبتهم", duration: "حصة أسبوعيًا", content: "مراجعة الرياضيات والإنجليزي بإشراف معلم المقرر", output: "أزواج وكشف حضور" },
    { id: "top-future", title: "جلسة تخطيط ما بعد التخرج", groups: [], levels: ["الثالث"], attendees: "متفوقو المستوى الثالث مع المرشد المهني", duration: "40 دقيقة", content: "البعثات والمنح، ومتطلبات IELTS، والتخصصات الجامعية المناسبة", output: "خطة شخصية" },
  ],
  none: [],
};

export const PLAN_GOALS = {
  low: "أن يرتفع كل طالب فوق 50% في مقرر واحد على الأقل من مقررات ضعفه في الوقفة الثانية.",
  mid: "أن ينتقل ربع الفئة إلى 85% فأكثر، وألا ينزل أحد منها إلى المتدنية.",
  top: "أن يحافظ المتفوقون على 90% فأكثر، ويُستفاد منهم في دعم زملائهم.",
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
