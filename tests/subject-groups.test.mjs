import { test } from "node:test";
import assert from "node:assert/strict";
import { subjectKeyForGrade, subjectSortRank } from "../src/modules/grades/subject-groups.js";

test("subjectKeyForGrade merges the real code split reported by the counselor (كيم/فيز -> العلوم)", () => {
  assert.equal(subjectKeyForGrade({ subjectCode: "كيم801", subjectName: "الطاقة" }), "العلوم");
  assert.equal(subjectKeyForGrade({ subjectCode: "كيم802", subjectName: "الكيمياء ٢" }), "العلوم");
  assert.equal(subjectKeyForGrade({ subjectCode: "فيز803", subjectName: "الفيزياء ٣" }), "العلوم");
  assert.equal(subjectKeyForGrade({ subjectCode: "فيز806", subjectName: "الفيزياء ٦" }), "العلوم");
});

test("subjectKeyForGrade merges اللغة العربية across its per-term code change", () => {
  assert.equal(subjectKeyForGrade({ subjectCode: "عرب801" }), "اللغة العربية");
  assert.equal(subjectKeyForGrade({ subjectCode: "عرب806" }), "اللغة العربية");
});

test("subjectKeyForGrade prefers the official code table over a printed subject name that disagrees", () => {
  // The code is authoritative; a term-specific printed name shouldn't split it.
  assert.equal(subjectKeyForGrade({ subjectCode: "دين807", subjectName: "التربية الإسلامية 1" }), "التربية الإسلامية");
});

test("subjectKeyForGrade falls back to subjectName when neither the code nor its prefix is in the official table", () => {
  assert.equal(subjectKeyForGrade({ subjectCode: "غرب801", subjectName: "مادة غير معروفة" }), "مادة غير معروفة");
});

test("subjectKeyForGrade falls back to the raw code when neither the table nor a name is available", () => {
  assert.equal(subjectKeyForGrade({ subjectCode: "غرب999" }), "غرب999");
});

test("subjectKeyForGrade falls back to a placeholder when nothing identifies the subject", () => {
  assert.equal(subjectKeyForGrade({}), "غير محدد");
});

test("subjectKeyForGrade uses the corrected term-2 codes (real transcription error caught by the counselor)", () => {
  assert.equal(subjectKeyForGrade({ subjectCode: "تجر802" }), "الدراسات الالتجارية");
  assert.equal(subjectKeyForGrade({ subjectCode: "وسط802" }), "الوسائط المتعددة");
});

test("subjectKeyForGrade strips a trailing level number to merge foundational-year (تأسيسي) subjects not in the official table", () => {
  assert.equal(subjectKeyForGrade({ subjectName: "التربية الإسلامية 4" }), "التربية الإسلامية");
  assert.equal(subjectKeyForGrade({ subjectName: "التربية الإسلامية" }), "التربية الإسلامية");
  assert.equal(subjectKeyForGrade({ subjectName: "التربية الإسلامية 9" }), "التربية الإسلامية");
});

test("subjectKeyForGrade does not strip a level number with no preceding space (e.g. الرياضيات1) — only a clear trailing ' N' suffix", () => {
  assert.equal(subjectKeyForGrade({ subjectName: "الرياضيات1" }), "الرياضيات1");
});

test("subjectKeyForGrade resolves a code carrying an invisible bidi mark (RLM) the same as the clean code", () => {
  assert.equal(subjectKeyForGrade({ subjectCode: "دين807‏" }), "التربية الإسلامية");
  assert.equal(subjectKeyForGrade({ subjectCode: "‎دين807" }), "التربية الإسلامية");
});

test("subjectKeyForGrade resolves a code printed with Arabic-Indic digits the same as its ASCII form", () => {
  assert.equal(subjectKeyForGrade({ subjectCode: "دين٨٠٧" }), "التربية الإسلامية");
});

test("subjectKeyForGrade merges a foundational-year name whose trailing level number is Arabic-Indic", () => {
  assert.equal(subjectKeyForGrade({ subjectName: "التربية الإسلامية ٤" }), "التربية الإسلامية");
  assert.equal(subjectKeyForGrade({ subjectName: "التربية الإسلامية ٩" }), "التربية الإسلامية");
});

test("subjectKeyForGrade resolves a code not in the official table through its subject-family prefix (real counselor-reported codes)", () => {
  assert.equal(subjectKeyForGrade({ subjectCode: "دين812" }), "التربية الإسلامية");
  assert.equal(subjectKeyForGrade({ subjectCode: "رسم816" }), "الرسم التقني");
  assert.equal(subjectKeyForGrade({ subjectCode: "ريض352" }), "الرياضيات");
});

test("subjectKeyForGrade does NOT prefix-match انج — three real subjects share that prefix and only their numeric suffix tells them apart", () => {
  const key = subjectKeyForGrade({ subjectCode: "انج999", subjectName: "دورة إنجليزية غير مصنّفة" });
  assert.equal(key, "دورة إنجليزية غير مصنّفة");
});

test("subjectKeyForGrade applies the counselor's confirmed name aliases for subjects with no matching code family", () => {
  assert.equal(subjectKeyForGrade({ subjectName: "الطاقة" }), "العلوم");
  assert.equal(subjectKeyForGrade({ subjectName: "دراسات في العقيدة الإسلامية" }), "التربية الإسلامية");
  assert.equal(subjectKeyForGrade({ subjectName: "التربية إسلامية" }), "التربية الإسلامية");
  assert.equal(subjectKeyForGrade({ subjectName: "الرسم التخصصي" }), "الرسم التقني");
  assert.equal(subjectKeyForGrade({ subjectName: "تقنية وصيانة الحاسوب" }), "تقنيات وصيانة الحاسوب");
  assert.equal(subjectKeyForGrade({ subjectName: "صيانة الحاسوب" }), "تقنيات وصيانة الحاسوب");
  assert.equal(subjectKeyForGrade({ subjectName: "أساسيات التفاضل والتكامل" }), "الرياضيات");
});

test("subjectKeyForGrade resolves تمك803 (a term-3/4 الكهرباء code with its own distinct prefix) correctly", () => {
  assert.equal(subjectKeyForGrade({ subjectCode: "تمك803" }), "الكهرباء");
});

test("subjectSortRank ranks ثقافة عامة subjects before تخصصية/مساندة ones (counselor's requested ordering)", () => {
  assert.equal(subjectSortRank("الرياضيات"), 0); // ثقافة عامة
  assert.equal(subjectSortRank("العلوم"), 0); // ثقافة عامة
  assert.equal(subjectSortRank("الكهرباء"), 1); // تخصصية
  assert.equal(subjectSortRank("الإلكترونيات"), 1); // تخصصية
  assert.equal(subjectSortRank("تقنيات وصيانة الحاسوب"), 1); // تخصصية
  assert.equal(subjectSortRank("الحاسب الآلي"), 1); // مساندة
  assert.ok(subjectSortRank("الرياضيات") < subjectSortRank("الكهرباء"));
});

test("subjectSortRank defaults an unrecognized subject name to the general-subjects rank (safer than pushing it to the end)", () => {
  assert.equal(subjectSortRank("مادة غير موجودة بالجدول"), 0);
});
