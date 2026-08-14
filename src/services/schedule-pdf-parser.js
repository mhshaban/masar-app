// يستخرج جدول حصة شعبة واحدة من ملف "جدول حصص الفصل الدراسي" الرسمي (قسم
// التسجيل) — قالب PDF ثابت مؤكَّد عبر 5 ملفات شعب حقيقية من نفس المدرسة،
// نفس التصميم البصري لكل شعبة (رأس معلومات + جدول 8 حصص × 5 أيام، كل حصة 4
// أسطر: مقرر/مدرس/غرفة/فترة).
//
// المحاذاة بالإحداثي X لا بترتيب العناصر: خانة فارغة بالجدول الأصلي (مثال
// حقيقي مؤكَّد: مادة "بدن801" بلا غرفة مخصصة) تعني العنصر التالي بنفس السطر
// ببساطة ما يُكتب بملف PDF إطلاقًا — الاعتماد على ترتيب العناصر (index) كان
// يزيح كل القيم اللي بعد الخانة الفارغة ليوم خاطئ. الحل: نحدد مركز X لكل
// عمود يوم من صف رأس الأيام ("اليوم")، وكل قيمة لاحقة تُنسب لأقرب عمود يوم
// لها بالإحداثي X (بحد أقصى مسافة معقولة)، فخانة فارغة تبقى فارغة بدل ما
// تزيح البيانات.
const DAY_NUMBERS = { الاحد: 1, الاثنين: 2, الثلاثاء: 3, الاربعاء: 4, الخميس: 5 };
const SESSION_NUMBERS = { صباحي: 1, مسائي: 2 };
// أقصى مسافة معقولة لنسبة قيمة لعمود يوم — احتياط أخير ضد بيانات فاسدة، لا
// آلية التمييز الأساسية (تلك عبر استبعاد نص التسمية واسم "الحصة" صراحةً
// أدناه). لوحظ فعليًا أن اسم معلم مركّب طويل ("خالد بدري+B JAIGANESH") قد
// تبعد نقطة بدايته عن مركز عمود يومه حتى ~45 وحدة رغم انتمائه له فعليًا —
// حد أضيق كان يرفضه خطأً ويترك حقل المعلم فارغًا بصمت.
const COLUMN_MATCH_TOLERANCE = 70;

function groupRows(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || b.x - a.x);
  const rows = [];
  for (const item of sorted) {
    const row = rows.find((r) => Math.abs(r.y - item.y) < 3);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  for (const row of rows) row.items.sort((a, b) => b.x - a.x);
  return rows;
}

// صف "الشعبة" مكتوب "الشعبة : 1تلم1" (تسمية، نقطتان، قيمة) — بقية صفوف
// الرأس (المستوى/المسار/التخصص) بلا نقطتين. تجاوز ":" يغطي الحالتين بأمان.
function findLabelValue(rows, label) {
  for (const row of rows) {
    const idx = row.items.findIndex((it) => it.text === label);
    if (idx === -1) continue;
    const rest = row.items.slice(idx + 1).filter((it) => it.text !== ":");
    if (rest.length) return rest[0].text;
  }
  return null;
}

export function extractSectionSchedule(items) {
  const rows = groupRows(items);

  const section = findLabelValue(rows, "الشعبة");
  const level = findLabelValue(rows, "المستوي");
  const track = findLabelValue(rows, "المسار");
  const specialization = findLabelValue(rows, "التخصص");

  const dayRow = rows.find((r) => r.items.some((it) => it.text === "اليوم"));
  const dayColumns = (dayRow?.items || [])
    .map((it) => ({ day: DAY_NUMBERS[it.text], x: it.x }))
    .filter((c) => c.day);

  const nearestDay = (x) => {
    let best = null;
    let bestDist = Infinity;
    for (const col of dayColumns) {
      const dist = Math.abs(col.x - x);
      if (dist < bestDist) { bestDist = dist; best = col.day; }
    }
    return bestDist <= COLUMN_MATCH_TOLERANCE ? best : null;
  };

  // يرجّع Map(يوم → نص) لكل عناصر الصف عدا عمود التسمية نفسه — عنصر لا يقع
  // قرب أي عمود يوم (تسمية الحقل، أو اسم "الحصة X" اللي أحيانًا يشارك نفس
  // سطر "فترة" بصريًا) يُتجاهَل بصمت بدل ما يُنسب ليوم خاطئ.
  function valuesByDay(row, label) {
    const map = new Map();
    for (const it of row.items) {
      if (it.text === label) continue;
      if (it.text.startsWith("الحصة")) continue; // قد يشارك سطر "فترة" بصريًا (رُصد فعليًا)
      const day = nearestDay(it.x);
      if (day && !map.has(day)) map.set(day, it.text);
    }
    return map;
  }

  const out = [];
  let period = 0;
  let current = null;
  for (const row of rows) {
    const hasLabel = (label) => row.items.some((it) => it.text === label);
    if (hasLabel("مقرر")) {
      period += 1;
      current = { period, مقرر: valuesByDay(row, "مقرر") };
      continue;
    }
    if (!current) continue;
    if (hasLabel("مدرس")) { current.مدرس = valuesByDay(row, "مدرس"); continue; }
    if (hasLabel("غرفة")) { current.غرفة = valuesByDay(row, "غرفة"); continue; }
    if (hasLabel("فترة")) {
      current.فترة = valuesByDay(row, "فترة");
      // "فترة" آخر سطر بكل مجموعة حصة — هنا نُصدر صفوف هذه الحصة الأربعة.
      for (const [day, subjectCode] of current.مقرر) {
        out.push({
          section,
          day,
          period: current.period,
          subjectCode,
          teacher: current.مدرس?.get(day) || null,
          room: current.غرفة?.get(day) || null,
          session: SESSION_NUMBERS[current.فترة?.get(day)] || null,
        });
      }
      current = null;
    }
  }

  return { section, level, track, specialization, rows: out };
}

// يُستدعى من المتصفح فقط (window.pdfjsLib مُحمَّل عالميًا من vendor bundle،
// نفس نمط pdf-parser.js وcertificate-parser.js بالضبط).
export async function extractPdfSectionSchedule(file) {
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const textContent = await page.getTextContent();
  const items = textContent.items
    .map((it) => ({ text: it.str.trim(), x: it.transform[4], y: it.transform[5] }))
    .filter((it) => it.text);
  return extractSectionSchedule(items);
}
