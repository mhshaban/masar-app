// حملات زيارة الشعب: إجراء/تعليمات تتطلب المرور على شعب محددة بصفوفها،
// وقائمة شطب لمعرفة عدد الشعب التي تمت تغطيتها (للتقارير المرفقة بالإجراء).
// تُحفظ بجدول سجلات الفعاليات (attendanceSheets) بـkind = "visits"، فتشملها
// النسخ الاحتياطية وسجل التدقيق تلقائيًا بلا جدول جديد.
import { listWhere } from "../../services/cloud-runtime.js";
import { createAttendanceSheet, updateAttendanceSheet, getAttendanceSheet, removeAttendanceSheet } from "../forms/attendance-service.js";
import { getCurrentProfile } from "../../services/auth-service.js?v=2026-09-04-form-actor-1";
import { LEVELS, levelOfSection } from "./section-locations-service.js?v=2026-10-08-section-locations-1";

export const VISITS_KIND = "visits";

const today = () => new Date().toISOString().slice(0, 10);

function actorName() {
  try {
    const profile = getCurrentProfile();
    return String(profile?.full_name || profile?.name || profile?.email || "").trim();
  } catch {
    return "";
  }
}

// كل شعب الجدول الدراسي (بلا تكرار) مع مستواها وفتراتها، مرتبة حسب المستوى ثم الرمز.
export function scheduleSections(rows) {
  const map = new Map();
  for (const row of rows) {
    const code = String(row.section || "").trim();
    if (!code) continue;
    if (!map.has(code)) map.set(code, { section: code, level: levelOfSection(code), sessions: new Set() });
    if (row.session) map.get(code).sessions.add(row.session);
  }
  const levelIndex = (l) => (LEVELS.indexOf(l) === -1 ? LEVELS.length : LEVELS.indexOf(l));
  return [...map.values()]
    .map((s) => ({ ...s, sessions: [...s.sessions] }))
    .sort((a, b) => levelIndex(a.level) - levelIndex(b.level) || a.section.localeCompare(b.section, "ar"));
}

export function campaignProgress(campaign) {
  const targets = campaign?.targetSections || [];
  const visits = campaign?.visits || {};
  const visited = targets.filter((s) => visits[s]);
  const remaining = targets.filter((s) => !visits[s]);
  const total = targets.length;
  return { total, visited: visited.length, remaining, visitedSections: visited, pct: total ? Math.round((visited.length / total) * 100) : 0 };
}

function normalize({ title, notes, targetSections }) {
  return {
    kind: VISITS_KIND,
    title: String(title || "").trim(),
    notes: String(notes || "").trim(),
    targetSections: [...new Set((targetSections || []).map((s) => String(s).trim()).filter(Boolean))],
  };
}

export async function listCampaigns() {
  const rows = await listWhere("attendanceSheets", "kind", VISITS_KIND);
  return rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function getCampaign(id) {
  const row = await getAttendanceSheet(id);
  return row?.kind === VISITS_KIND ? row : null;
}

export async function saveCampaign(id, values) {
  const record = normalize(values);
  if (!record.title) throw new Error("اكتب اسم الإجراء أو الحملة أولًا");
  if (!record.targetSections.length) throw new Error("اختر الشعب المستهدفة أولًا");
  if (!id) return createAttendanceSheet({ ...record, visits: {} });
  const current = await getCampaign(id);
  if (!current) throw new Error("الحملة غير موجودة");
  // الزيارات المسجلة لشعب لا تزال مستهدفة تبقى كما هي.
  const visits = Object.fromEntries(Object.entries(current.visits || {}).filter(([s]) => record.targetSections.includes(s)));
  return updateAttendanceSheet(id, { ...record, visits });
}

// شطب/إلغاء شطب شعبة. يُعاد تحميل الحملة قبل الحفظ ويُطبَّق التغيير وحده،
// كي لا تمحو زيارة سجّلها زميل آخر بنفس الوقت.
export async function setSectionVisited(id, section, visited) {
  const current = await getCampaign(id);
  if (!current) throw new Error("الحملة غير موجودة");
  const visits = { ...(current.visits || {}) };
  if (visited) visits[section] = visits[section] || { date: today(), by: actorName() };
  else delete visits[section];
  return updateAttendanceSheet(id, { visits });
}

export const removeCampaign = (id) => removeAttendanceSheet(id);
