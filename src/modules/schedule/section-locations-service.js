import { list as listAll } from "../../services/cloud-runtime.js";

export const SCHOOL_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"];
export const PERIODS = ["1", "2", "3", "4", "5", "6", "7", "8"];
export const SESSIONS = ["صباحي", "مسائي"];
export const LEVELS = ["الأول", "الثاني", "الثالث"];

export const LOCATION_GROUPS = [
  { key: "practical", label: "الأقسام العملية" },
  { key: "b2", label: "المبنى ٢" },
  { key: "b20", label: "المبنى ٢٠" },
  { key: "other", label: "مواقع أخرى / بلا قاعة" },
];

// أول رقم برمز الشعبة هو مستواها — مطابَق مع سجل الطلبة نفسه (كل طلبة
// شعب "١…" بالمستوى الأول، "٣…" الثاني، "٥…" الثالث، بلا استثناء).
const LEVEL_BY_DIGIT = { "١": "الأول", "٣": "الثاني", "٥": "الثالث" };

export function levelOfSection(section) {
  return LEVEL_BY_DIGIT[String(section || "").trim()[0]] || null;
}

// القاعة بالجدول: "101-2" (قاعة-مبنى)، أو "101-2+102-2" لحصة بقاعتين، أو اسم
// ورشة بلا رقم مبنى (كهر1، ماك، لحام...) = الأقسام العملية. مبانٍ أخرى
// غير ٢ و٢٠، أو حصة بلا قاعة أصلًا (مثل التربية البدنية)، تظهر كما هي تحت
// "مواقع أخرى / بلا قاعة" بدل تخمين تصنيفها.
export function locationOfRoom(room) {
  const parts = String(room || "").split("+").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return "other";
  const buildings = parts.map((p) => p.match(/-(\d+)$/)?.[1]).filter(Boolean);
  if (buildings.includes("20")) return "b20";
  if (buildings.includes("2")) return "b2";
  return buildings.length ? "other" : "practical";
}

export function locateSections(rows, { day, period, session = "", level = "" }) {
  const groups = new Map(LOCATION_GROUPS.map((g) => [g.key, []]));
  for (const row of rows) {
    if (row.day !== day || String(row.period) !== String(period)) continue;
    if (session && row.session !== session) continue;
    const rowLevel = levelOfSection(row.section);
    if (level && rowLevel !== level) continue;
    groups.get(locationOfRoom(row.room)).push({
      section: row.section,
      room: row.room || "",
      subjectCode: row.subjectCode || "",
      teacher: row.teacher || "",
      session: row.session || "",
      level: rowLevel,
    });
  }
  return LOCATION_GROUPS.map((g) => ({
    ...g,
    sections: groups.get(g.key).sort((a, b) => a.section.localeCompare(b.section, "ar")),
  }));
}

export async function loadClassSchedules() {
  return listAll("classSchedules");
}
