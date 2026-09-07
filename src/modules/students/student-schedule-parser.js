import { normalizeKey } from "../../services/text-normalize.js";

const clean = value => normalizeKey(value).replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ـ/g, "");
const sectionKey = value => clean(value).replace(/[^\p{L}\p{N}]/gu, "");
const DAY_NAMES = ["الاحد", "الاثنين", "الثلاثاء", "الاربعاء", "الخميس"];

export function parseScheduleRows(rows, section) {
  if (!rows.some(row => row.items.some(item => clean(item.text).includes("جدول حصص")))) throw new Error("الملف ليس جدول حصص معتمدًا.");
  const sectionRow = rows.find(row => row.items.some(item => clean(item.text) === "الشعبة"));
  const foundSection = sectionRow?.items.map(item => item.text).find(text => /\d|[٠-٩]/.test(text));
  if (!foundSection || (section && sectionKey(foundSection) !== sectionKey(section))) throw new Error("شعبة الجدول لا تطابق شعبة الطالب؛ لم تُعرض الحصص.");
  const lessons = [];
  let anchors = [], current = null;
  const days = [];
  for (const row of rows) {
    const dayItems = row.items.filter(item => DAY_NAMES.includes(clean(item.text)));
    if (dayItems.length === 5) {
      anchors = dayItems.sort((a,b) => b.x-a.x).map(item => ({ name: item.text, center: item.x + item.width / 2 }));
      if (!days.length) days.push(...anchors.map(item => item.name));
      continue;
    }
    if (!anchors.length) continue;
    const field = row.items.find(item => ["مقرر", "مدرس", "غرفة", "فترة"].includes(clean(item.text)));
    if (field && clean(field.text) === "مقرر") {
      current = { label: `الحصة ${lessons.length + 1}`, cells: days.map(() => ({ course: "", teacher: "", room: "", period: "" })) };
      lessons.push(current);
    }
    if (!current) continue;
    const labels = row.items.filter(item => /^الحصة\s+/.test(clean(item.text)));
    if (labels.length === 1 && !labels[0].text.includes(":")) current.label = labels[0].text;
    if (!field) continue;
    const key = { مقرر: "course", مدرس: "teacher", غرفة: "room", فترة: "period" }[clean(field.text)];
    for (const item of row.items) {
      if (item === field || labels.includes(item)) continue;
      const center = item.x + item.width / 2;
      // Coordinates preserve empty cells: never shift later days into a blank.
      let index = 0;
      for (let i=1;i<anchors.length;i++) if (Math.abs(center-anchors[i].center) < Math.abs(center-anchors[index].center)) index=i;
      current.cells[index][key] += (current.cells[index][key] ? " " : "") + item.text;
    }
  }
  if (!lessons.length || !lessons.some(lesson => lesson.cells.some(cell => cell.course))) throw new Error("تعذّر استخراج حصص من الجدول.");
  return { section: foundSection, days, lessons };
}

const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function renderScheduleTable(schedule) {
  return `<div class="tablewrap"><table class="student-timetable"><caption>جدول الشعبة ${esc(schedule.section)}</caption><thead><tr><th>الحصة</th>${schedule.days.map(day=>`<th>${esc(day)}</th>`).join("")}</tr></thead><tbody>${schedule.lessons.map(lesson=>`<tr><th>${esc(lesson.label)}</th>${lesson.cells.map(cell=>`<td>${cell.course ? `<strong>${esc(cell.course)}</strong>${cell.teacher ? `<div class="timetable-teacher">${esc(cell.teacher)}</div>` : ""}${cell.room ? `<span class="timetable-room">الغرفة: ${esc(cell.room)}</span>` : ""}${cell.period ? `<small class="timetable-period">${esc(cell.period)}</small>` : ""}` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
