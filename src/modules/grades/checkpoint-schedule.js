// مقررات جدول الشعبة في تقرير التحصيل: كل مقرر في جدول الطالب يظهر في
// التقرير. اللي له درجة في الوقفة يبقى كما هو، والتربية الإسلامية والاجتماعيات
// وبقية مقررات الوقفة اللي ما وصلت كشوفها بعد تظهر «لم تُرصد بعد»، وباقي
// المقررات (العملية والتخصصية والمساندة) تظهر «تقويم مستمر» لأنها بلا وقفة.
import { SUBJECT_GROUPS } from "../../services/subject-groups-seed.js";

export const NOTE_LABELS = { continuous: "تقويم مستمر", pending: "لم تُرصد بعد" };

const prefixOf = (code) => (String(code).match(/^\D+/) || [""])[0].trim();

// «Eng 801» و«انج 801» و«انج801» كلها نفس المقرر.
export function normalizeCode(code) {
  return String(code || "").replace(/\s+/g, "").replace(/^eng/i, "انج");
}

// عائلات مقررات الوقفة اللي تُرصد أحيانًا بلا رمز (بالاسم فقط).
const NAME_FAMILIES = {
  عرب: "اللغة العربية", ريض: "الرياضيات", طاق: "العلوم", فيز: "العلوم", كيم: "العلوم", حيا: "العلوم", علم: "العلوم",
  رسم: "الرسم", دين: "التربية الإسلامية",
  // المستوى الأول تجاري: «المواد التجارية» مرصودة بلا رمز.
  قصد: "المواد التجارية", جود: "المواد التجارية", مال: "المواد التجارية", محا: "المواد التجارية",
};
// مقررات لها وقفة تقويمية (تُكتب «لم تُرصد بعد» إذا ما وصلت درجاتها).
const CHECKPOINT_PREFIXES = new Set([...Object.keys(NAME_FAMILIES), "انج", "وطن"]);

const EXTRA_NAMES = {
  طاق: "العلوم", حيا: "العلوم", علم: "العلوم", ماك: "الكهرباء", جود: "الجودة", قصد: "الاقتصاد", مال: "الخدمات المالية",
  اخر: "مقرر اختياري", بيع: "البيع بالتجزئة واللوجستيات", رسم: "الرسم الفني",
};
const NAME_BY_CODE = new Map();
const NAME_BY_PREFIX = new Map(Object.entries(EXTRA_NAMES));
for (const g of SUBJECT_GROUPS) {
  for (const c of g.codes) if (c) {
    NAME_BY_CODE.set(c, g.subject);
    if (!NAME_BY_PREFIX.has(prefixOf(c)) && prefixOf(c) !== "انج") NAME_BY_PREFIX.set(prefixOf(c), g.subject);
  }
}

export function courseName(code) {
  const c = normalizeCode(code);
  return NAME_BY_CODE.get(c) || NAME_BY_PREFIX.get(prefixOf(c)) || (prefixOf(c) === "انج" ? "اللغة الإنجليزية" : c);
}

function isCovered(code, subjects) {
  const c = normalizeCode(code);
  const family = NAME_FAMILIES[prefixOf(c)];
  return subjects.some((s) => {
    if (s.code && normalizeCode(s.code) === c) return true;
    // مقرر مرصود بالاسم فقط (بلا رمز): يغطي مقررات نفس العائلة.
    return family && !normalizeCode(s.code) && String(s.name || "").startsWith(family);
  });
}

// scheduleCodes: رموز مقررات جدول الشعبة؛ subjects: صفوف المقارنة الحالية.
// يرجّع صفوفًا جديدة للمقررات اللي ما لها صف: { code, name, note }.
export function scheduleCourseRows(scheduleCodes, subjects) {
  const seen = new Set();
  const rows = [];
  for (const raw of scheduleCodes || []) {
    const code = normalizeCode(raw);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    if (isCovered(code, subjects)) continue;
    rows.push({ code, name: courseName(code), note: CHECKPOINT_PREFIXES.has(prefixOf(code)) ? "pending" : "continuous" });
  }
  // «لم تُرصد بعد» أولًا ثم «تقويم مستمر».
  return rows.sort((a, b) => (a.note === b.note ? 0 : a.note === "pending" ? -1 : 1));
}
