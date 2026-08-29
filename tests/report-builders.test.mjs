import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFollowUpReportHtml, buildAgendaReportHtml, buildGuidanceCasesReportHtml, buildSupportPlansReportHtml,
  buildDepartmentFormReportHtml,
} from "../src/services/report-builders.js";

test("buildDepartmentFormReportHtml exports student data, form content, and feedback", () => {
  const html = buildDepartmentFormReportHtml({
    id: "f-1", title: "تحويل إلى قسم التسجيل", createdDate: "2026-09-01", status: "completed",
    student: { name: "طالب تجريبي", academicId: "2026001", civilId: "123", level: "الثاني", section: "201", track: "علمي" },
    fields: { reason: "تحديث البيانات", requestedAction: "مراجعة الملف" },
    feedbackDate: "2026-09-02", feedback: "تم تحديث السجل",
  }, "2026-09-03");
  assert.match(html, /طالب تجريبي/);
  assert.match(html, /تحديث البيانات/);
  assert.match(html, /تم تحديث السجل/);
  assert.match(html, /مكتملة/);
});

test("buildFollowUpReportHtml includes stats, per-section table, and item rows", () => {
  const bySection = new Map([
    ["S1", [{ no: 1, title: "بند أول", status: "done", totalParticipants: 15, summary: "تم بنجاح" }]],
  ]);
  const stats = {
    completionPct: 67, doneItems: 2, totalItems: 3, actionsExecuted: 3, totalParticipants: 25,
    sections: [{ section: "S1", done: 1, total: 1, completionPct: 100, participants: 15 }],
  };

  const html = buildFollowUpReportHtml(bySection, stats, "2026-08-01");
  assert.match(html, /تقرير المتابعة والإحصائيات/);
  assert.match(html, /67٪/);
  assert.match(html, /بند أول/);
  assert.match(html, /تم بنجاح/);
  assert.match(html, /2026-08-01/);
});

test("buildFollowUpReportHtml escapes untrusted text in item titles", () => {
  const bySection = new Map([["S1", [{ no: 1, title: "<script>alert(1)</script>", status: "done", totalParticipants: 0, summary: "" }]]]);
  const stats = { completionPct: 0, doneItems: 0, totalItems: 1, actionsExecuted: 0, totalParticipants: 0, sections: [] };
  const html = buildFollowUpReportHtml(bySection, stats, "x");
  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;script&gt;/);
});

test("buildAgendaReportHtml renders one row per entry with Arabic status labels", () => {
  const entries = [
    { pillar: "القيادة", project_title: "م", action: "إجراء أول", progress: { status: "done", participantsCount: 20, proofNote: "حضور", effectivenessReport: "فعّال جدًا" } },
    { pillar: "القيادة", project_title: "م", action: "إجراء ثانٍ", progress: { status: "not_started", participantsCount: null, proofNote: null, effectivenessReport: null } },
  ];
  const html = buildAgendaReportHtml(entries, "2026-08-01");
  assert.match(html, /إجراء أول/);
  assert.match(html, /تم/);
  assert.match(html, /فعّال جدًا/);
  assert.match(html, /لم يبدأ/);
  assert.equal((html.match(/<tr>/g) || []).length, 3); // header + 2 rows
});

test("buildGuidanceCasesReportHtml lists each case's sessions in a table, or a placeholder row when empty", () => {
  const cases = [
    { studentName: "طالب أول", category: "أكاديمية", status: "open", title: "متابعة", sessions: [{ date: "2026-01-01", note: "جلسة أولى", nextStep: "متابعة" }] },
    { studentName: "طالب ثاني", category: "سلوكية", status: "closed", title: "", sessions: [] },
  ];
  const html = buildGuidanceCasesReportHtml(cases, "2026-08-01");
  assert.match(html, /طالب أول/);
  assert.match(html, /جلسة أولى/);
  assert.match(html, /طالب ثاني/);
  assert.match(html, /مُغلقة/);
  assert.match(html, /لا توجد جلسات مسجَّلة/);
});

test("buildSupportPlansReportHtml lists each plan's actions with Arabic status labels", () => {
  const plans = [
    { studentName: "طالب", domain: "الرياضيات", status: "active", goal: "تحسين المعدل", actions: [{ action: "جلسة تقوية", dueDate: "2026-09-01", status: "ongoing" }] },
  ];
  const html = buildSupportPlansReportHtml(plans, "2026-08-01");
  assert.match(html, /الرياضيات/);
  assert.match(html, /نشطة/);
  assert.match(html, /جلسة تقوية/);
  assert.match(html, /قيد التنفيذ/);
});
