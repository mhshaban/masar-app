import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCertificateRows } from "../src/modules/grades/certificate-parser.js";

// rawRows mimics pdf-parser.js output: one array of cell strings per visual row,
// already sorted into RTL column order (as extractPdfRows produces it).
const rawRows = [
  ["اسم الطالب", ":", "خالد أحمد النعيمي", "رقم الطالب", ":", "(", "2024", "12345", ")"],
  ["الرقم الشخصي", ":", "990112345"],
  ["المسار", ":", "علمي"],
  ["الفصل الدراسي الأول"],
  ["ريض101", "الرياضيات", "4", "85"],
  ["علم101", "العلوم", "4", "غائب"],
  ["كيم101", "الكيمياء", "4", "0.5"],
  ["فيز101", "الفيزياء", "4", "5."],
  ["دور101", "مادة الدور الثاني", "4", "60", "دور ثاني"],
  ["المعدل الفصلي", "85.5%", "التقدير", ":", "جيد جدا"],
  ["الفصل الدراسي الثاني"],
  ["احص101", "الإحصاء", "3", "70"],
];

test("parseCertificateRows extracts student header fields", () => {
  const cert = parseCertificateRows(rawRows);
  assert.equal(cert.studentName, "خالد أحمد النعيمي");
  assert.equal(cert.academicId, "202412345");
  assert.equal(cert.civilId, "990112345");
  assert.equal(cert.track, "علمي");
  assert.equal(cert.terms.length, 2);
});

test("parseCertificateRows parses a plain numeric score", () => {
  const cert = parseCertificateRows(rawRows);
  const math = cert.terms[0].subjects.find((s) => s.code === "ريض101");
  assert.equal(math.name, "الرياضيات");
  assert.equal(math.hours, 4);
  assert.equal(math.score, 85);
  assert.equal(math.scoreStatus, null);
});

test("parseCertificateRows keeps a non-numeric status word as scoreStatus, not NaN", () => {
  const cert = parseCertificateRows(rawRows);
  const science = cert.terms[0].subjects.find((s) => s.code === "علم101");
  assert.equal(science.score, null);
  assert.equal(science.scoreStatus, "absent");
});

test("parseCertificateRows treats the literal 0.5 score as an encoded absence", () => {
  const cert = parseCertificateRows(rawRows);
  const chem = cert.terms[0].subjects.find((s) => s.code === "كيم101");
  assert.equal(chem.score, null);
  assert.equal(chem.scoreStatus, "absent");
});

test("parseCertificateRows strips a stray trailing dot with no digits after it", () => {
  const cert = parseCertificateRows(rawRows);
  const physics = cert.terms[0].subjects.find((s) => s.code === "فيز101");
  assert.equal(physics.score, 5);
  assert.equal(physics.scoreStatus, null);
});

test("parseCertificateRows keeps a trailing note distinct from the score", () => {
  const cert = parseCertificateRows(rawRows);
  const retake = cert.terms[0].subjects.find((s) => s.code === "دور101");
  assert.equal(retake.name, "مادة الدور الثاني");
  assert.equal(retake.score, 60);
  assert.equal(retake.notes, "دور ثاني");
});

test("parseCertificateRows reads the term average and rating line", () => {
  const cert = parseCertificateRows(rawRows);
  assert.equal(cert.terms[0].average, 85.5);
  assert.equal(cert.terms[0].rating, "جيد");
});

test("parseCertificateRows attaches subjects to the correct term", () => {
  const cert = parseCertificateRows(rawRows);
  assert.equal(cert.terms[0].subjects.length, 5);
  assert.equal(cert.terms[1].subjects.length, 1);
  assert.equal(cert.terms[1].subjects[0].code, "احص101");
});

test("parseCertificateRows returns nulls when header fields are missing", () => {
  const cert = parseCertificateRows([["لا يوجد شيء هنا"]]);
  assert.equal(cert.studentName, null);
  assert.equal(cert.academicId, null);
  assert.equal(cert.civilId, null);
  assert.equal(cert.track, null);
  assert.deepEqual(cert.terms, []);
});

test("parseCertificateRows still recognizes a subject code carrying an invisible bidi mark", () => {
  const cert = parseCertificateRows([
    ["الفصل الدراسي الأول"],
    ["دين807‏", "التربية الإسلامية", "4", "90"],
  ]);
  const row = cert.terms[0].subjects.find((s) => s.code === "دين807");
  assert.ok(row, "subject row should be recognized once the bidi mark is stripped");
  assert.equal(row.score, 90);
});

test("parseCertificateRows normalizes Arabic-Indic digits in a subject code and score", () => {
  const cert = parseCertificateRows([
    ["الفصل الدراسي الأول"],
    ["دين٨٠٧", "التربية الإسلامية", "4", "٩٠"],
  ]);
  const row = cert.terms[0].subjects.find((s) => s.code === "دين807");
  assert.ok(row, "Arabic-Indic code digits should normalize to ASCII and still match SUBJECT_CODE_RE");
  assert.equal(row.score, 90);
});
