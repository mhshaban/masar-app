import { list as listAll, clear, bulkPut } from "../../services/cloud-runtime.js";
import { readWorkbook } from "../../services/xlsx-parser.js";

// Both sheets live inside the school's own full roster workbook, found by
// name rather than position — sheet order isn't guaranteed to stay stable
// between exports.
const SCHEDULE_SHEET_HINT = "جداول المعلمين";
const OFFICE_HOURS_SHEET_HINT = "الساعات المكتبية";

export const DAY_NAMES = { 1: "الأحد", 2: "الاثنين", 3: "الثلاثاء", 4: "الأربعاء", 5: "الخميس" };
export const SESSION_NAMES = { 1: "الفترة الصباحية", 2: "الفترة المسائية" };

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

// Student records use Arabic-Indic digits in section names (e.g. "٢تلم١")
// while this workbook's شعبة column uses plain ASCII digits ("2تلم1") for
// the same section — normalize both to ASCII before comparing, confirmed
// against a real student (teacher named here as رشد802 for their section
// matched their actual مرشد الشعبة on the same real roster).
export function normalizeSectionDigits(text) {
  return String(text ?? "").replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)));
}

// This sheet has no student identifier at all — it's one row per
// teacher+section+day+period. A student's full weekly schedule is every row
// whose شعبة matches their own class section (Bahraini technical-track
// students in the same section attend the same subject sessions together).
export async function parseScheduleWorkbook(file) {
  const { sheetNames, sheets } = await readWorkbook(file);
  const scheduleSheetName = sheetNames.find((n) => n.includes(SCHEDULE_SHEET_HINT));
  const officeSheetName = sheetNames.find((n) => n.includes(OFFICE_HOURS_SHEET_HINT));
  if (!scheduleSheetName && !officeSheetName) {
    throw new Error('تعذّر إيجاد شيت "جداول المعلمين" أو "الساعات المكتبية" داخل الملف — تأكد من رفع ملف كشف الطلاب الكامل.');
  }

  const scheduleRows = [];
  if (scheduleSheetName) {
    for (const r of (sheets[scheduleSheetName] || []).slice(1)) {
      if (!r || r[12] == null) continue;
      const day = Number(r[13]);
      if (!day) continue;
      scheduleRows.push({
        section: normalizeSectionDigits(r[12]),
        day,
        period: r[14] != null ? Number(r[14]) : null,
        subjectCode: r[15] || null,
        room: r[16] || null,
        teacher: r[19] ? String(r[19]).trim() : null,
        department: r[20] || null,
        session: r[21] != null ? Number(r[21]) : null,
      });
    }
  }

  // Office hours are duplicated once per class a teacher handles but are the
  // same slot every time (confirmed on the real sheet) — first row wins.
  const officeHoursByTeacher = new Map();
  if (officeSheetName) {
    for (const r of (sheets[officeSheetName] || []).slice(1)) {
      const teacher = r[5] ? String(r[5]).trim() : null;
      if (!teacher || officeHoursByTeacher.has(teacher)) continue;
      officeHoursByTeacher.set(teacher, {
        teacher,
        department: r[4] || null,
        day: r[6] || null,
        period: r[7] != null ? Number(r[7]) : null,
      });
    }
  }

  return {
    scheduleFound: !!scheduleSheetName,
    officeHoursFound: !!officeSheetName,
    scheduleRows,
    officeHoursRows: [...officeHoursByTeacher.values()],
  };
}

// Reference/lookup data re-imported wholesale each time the school reissues
// the roster (not per-row student data needing a match review), so this
// replaces the collections outright rather than tracking batches to roll back.
export async function commitSchedule({ scheduleRows, officeHoursRows }) {
  if (scheduleRows) {
    await clear("teacherSchedule");
    if (scheduleRows.length) {
      await bulkPut("teacherSchedule", scheduleRows.map((r, i) => ({ id: `sched-${i}`, ...r })));
    }
  }
  if (officeHoursRows) {
    await clear("officeHours");
    if (officeHoursRows.length) {
      await bulkPut("officeHours", officeHoursRows.map((r, i) => ({ id: `office-${i}`, ...r })));
    }
  }
}

export async function getStudentSchedule(section) {
  const normalized = normalizeSectionDigits(section);
  const rows = await listAll("teacherSchedule");
  return rows
    .filter((r) => r.section === normalized)
    .sort((a, b) => (a.day - b.day) || (a.session - b.session) || (a.period - b.period));
}

export async function getOfficeHoursForTeachers(teacherNames) {
  const rows = await listAll("officeHours");
  const names = new Set(teacherNames.filter(Boolean));
  return rows.filter((r) => names.has(r.teacher));
}

export async function getScheduleSummary() {
  const [schedule, officeHours] = await Promise.all([listAll("teacherSchedule"), listAll("officeHours")]);
  return { scheduleRowCount: schedule.length, officeHoursTeacherCount: officeHours.length };
}
