import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeScheduleDocument } from "../scripts/lib/document-classifier.mjs";

// مقتطف حقيقي من ملف "جدول حصص الفصل الدراسي" رُصد فعليًا مختلطًا بأرشيف
// شهادات مدرسة حقيقية (شعبة 2تلم5) — كان يُقرأ بالغلط كشهادة درجات لطالب
// وهمي بعشرات "المقررات" (رموز المقررات المتكررة بالجدول كـعرب802/انج802
// تطابق شكل رمز مقرر SUBJECT_CODE_RE).
const realScheduleRows = [
  ["مملكة البحرين"],
  ["وزارة التربية والتعليم"],
  ["قسم التسجيل"],
  ["جدول حصص الفصل الدراسي"],
  ["التاريخ", ":", "2022/02/21"],
  ["المستوي الاول"],
  ["المسار", "تأسيسي"],
  ["الشعبة", ":", "2تلم5"],
  ["اليوم", "الاحد", "الاثنين", "الثلاثاء", "الاربعاء", "الخميس"],
  ["مقرر", "عرب802", "الك801", "ريض814", "حاس801", "الك801"],
  ["مدرس", "محمد جابر", "عبداللطيف محمد", "عبداللطيف محمد", "محمد فتحي", "محمد فتحي"],
  ["غرفة", "A26", "A214", "A214", "A24", "A24"],
  ["فترة", "صباحي", "صباحي", "صباحي", "صباحي", "صباحي"],
];

test("looksLikeScheduleDocument recognizes a real جدول حصص الفصل الدراسي excerpt", () => {
  assert.equal(looksLikeScheduleDocument(realScheduleRows), true);
});

test("looksLikeScheduleDocument still recognizes a schedule without the exact phrase, via its column labels", () => {
  const rows = [
    ["الشعبة", ":", "1تلم1"],
    ["مقرر", "ريض801"],
    ["مدرس", "أحمد"],
    ["غرفة", "A10"],
  ];
  assert.equal(looksLikeScheduleDocument(rows), true);
});

test("looksLikeScheduleDocument does not flag a real certificate excerpt", () => {
  const rows = [
    ["اسم الطالب", ":", "خالد أحمد النعيمي", "رقم الطالب", ":", "(", "2024", "12345", ")"],
    ["الفصل الدراسي الأول"],
    ["ريض101", "الرياضيات", "4", "85"],
    ["المعدل الفصلي", "85.5%", "التقدير", ":", "جيد جدا"],
  ];
  assert.equal(looksLikeScheduleDocument(rows), false);
});
