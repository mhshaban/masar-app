import test from "node:test";
import assert from "node:assert/strict";
import { eventApprovalMarkup } from "../src/modules/forms/event-approval-ui.js";

test("الاستمارة الفارغة تطابق بنود نموذج الوزارة الرسمي", () => {
  const blank = eventApprovalMarkup({});
  for (const label of [
    "استمارة طلب إعتماد فعالية مدرسية", "اسم الفعالية", "اسم المدرسة", "تاريخ الطلب", "نوع الفعالية / النشاط المطلوب", "الجهة المعنية",
    "وصف الفعالية / النشاط", "مبررات تنفيذ الفعالية / أهداف الفعالية", "تاريخ التنفيذ", "من الساعة", "إلى الساعة", "المدة الزمنية",
    "اسم الراعي", "الميزانية المخصصة", "الجهة المنظمة", "المشرف على التنظيم", "اسم المحاضر / منفذ الورشة أو الندوة", "الجهات الأخرى المتعاونة",
    "عدد المنتفعين", "عدد المنتفعين من مدارس أخرى", "أهم الملاحظات", "يعتمد من مدير(ة) المدرسة", "ختم المدرسة", "ملاحظات إدارة التعليم",
    "رأي إدارة الخدمات الطلابية", "ملاحظات إدارة الخدمات الطلابية", "تاريخ الاعتماد", "moe-logo.png",
  ]) assert.ok(blank.includes(label), label);
  assert.ok(!blank.includes("مسار"));
  assert.ok(!blank.includes("رئيس قسم"));
});

test("البيانات تُطبع بصيغة النموذج وتُهرّب المدخلات", () => {
  const html = eventApprovalMarkup({ title: "<b>x</b>", requestDate: "2026-11-24", date: "2026-11-30", startTime: "08:00", endTime: "09:30", ben_students: "120" });
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(html.includes("24/11/2026"));
  assert.ok(html.includes("الاثنين"));
  assert.ok(html.includes("08:00 ص") && html.includes("09:30 ص"));
  assert.ok(html.includes("ساعة و30 دقيقة"));
  assert.ok(html.includes(">120<"));
});
