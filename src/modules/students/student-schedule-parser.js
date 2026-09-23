import { normalizeKey } from "../../services/text-normalize.js";

const clean = value => normalizeKey(value).replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ـ/g, "");
const DAY_ORDER = ["الاحد", "الاثنين", "الثلاثاء", "الاربعاء", "الخميس"];
const dayRank = (day) => { const i = DAY_ORDER.indexOf(clean(day)); return i === -1 ? DAY_ORDER.length : i; };

// يبني شكل الجدول {section, days, lessons} من صفوف classSchedules خام
// (مستوردة من شيت "الجدول الدراسي" بملف كشف الطلاب) — بدل تحليل PDF جدول
// حصص هندسيًا كما كان سابقًا. null لو ما فيه أي صف لهذه الشعبة.
//
// الفترة (صباحي/مسائي) خاصية لكل يوم لا للشعبة كلها — شعبة واحدة ممكن
// تكون صباحية معظم الأيام ومسائية بيوم واحد (مؤكَّد من بيانات حقيقية)،
// فتُعرض لكل خلية بدل قيمة واحدة أعلى الجدول.
export function scheduleFromClassScheduleRecords(records, section) {
  const rows = records.filter((r) => r.section === section);
  if (!rows.length) return null;
  const days = [...new Set(rows.map((r) => r.day))].sort((a, b) => dayRank(a) - dayRank(b));
  const periods = [...new Set(rows.map((r) => r.period))].sort((a, b) => Number(a) - Number(b));
  const byDayPeriod = new Map(rows.map((r) => [`${r.day}::${r.period}`, r]));
  const lessons = periods.map((period) => ({
    label: `الحصة ${period}`,
    cells: days.map((day) => {
      const r = byDayPeriod.get(`${day}::${period}`);
      return { course: r?.subjectCode || "", teacher: r?.teacher || "", room: r?.room || "", period: r?.session || "" };
    }),
  }));
  return { section, days, lessons };
}

const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function renderScheduleTable(schedule) {
  return `<div class="tablewrap"><table class="student-timetable"><caption>جدول الشعبة ${esc(schedule.section)}</caption><thead><tr><th>الحصة</th>${schedule.days.map(day=>`<th>${esc(day)}</th>`).join("")}</tr></thead><tbody>${schedule.lessons.map(lesson=>`<tr><th>${esc(lesson.label)}</th>${lesson.cells.map(cell=>`<td>${cell.course ? `<strong>${esc(cell.course)}</strong>${cell.teacher ? `<div class="timetable-teacher">${esc(cell.teacher)}</div>` : ""}${cell.room ? `<span class="timetable-room">الغرفة: ${esc(cell.room)}</span>` : ""}${cell.period ? `<small class="timetable-period">${esc(cell.period)}</small>` : ""}` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
