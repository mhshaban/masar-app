import test from "node:test";
import assert from "node:assert/strict";
import { certificateFileMatches, validatedCertificate, readStudentCertificate } from "../src/modules/grades/student-certificate-local.js";
import { renderCertificateResults } from "../src/modules/grades/academic-path-ui.js";

const student = { id: "uuid", academicId: "202412345", name: "طالب تجريبي" };
const rows = [
  ["اسم الطالب", ":", "طالب تجريبي", "رقم الطالب", ":", "(", "2024", "12345", ")"],
  ["الفصل الدراسي الأول"],
  ["ريض101", "رياضيات", "4", "0"],
  ["علم101", "علوم", "4", "غائب"],
  ["الفصل الدراسي الثاني"],
  ["ريض102", "رياضيات متقدمة", "4", "90"],
];

test("certificate candidates match full academic numbers or exact names, never partial numbers or sections", () => {
  assert.equal(certificateFileMatches("شهادة ٢٠٢٤١٢٣٤٥.pdf", student), true);
  assert.equal(certificateFileMatches("طالب تجريبي.pdf", student), true);
  assert.equal(certificateFileMatches("12024123456.pdf", student), false);
  assert.equal(certificateFileMatches("٥ديز١.pdf", student), false);
});

test("certificate validation rejects another student's results and class schedules", () => {
  assert.equal(validatedCertificate(rows, student).terms.length, 2);
  assert.throws(() => validatedCertificate(rows, { academicId: "20240000" }), /لا يطابق/);
  assert.throws(() => validatedCertificate([["جدول حصص"], ...rows], student), /جدول حصص/);
});

test("all term subject rows render including zero and absence, while escaping file text", () => {
  const certificate = validatedCertificate(rows, student);
  certificate.terms[1].subjects[0].notes = "<script>bad()</script>";
  const html = renderCertificateResults(certificate);
  for (const value of ["ريض101", "علم101", "ريض102", "الفصل الدراسي الأول", "الفصل الدراسي الثاني", "غائب", ">0</td>", "&lt;script&gt;"]) assert.ok(html.includes(value), value);
  assert.ok(!html.includes("<script>"));
});

test("PDF extraction disables eval, verifies internal identity and releases the PDF worker", async () => {
  const originalDocument = globalThis.document;
  const originalLibrary = globalThis.pdfjsLib;
  let destroyed = false;
  globalThis.document = { baseURI: "https://example.test/masar-app/" };
  globalThis.pdfjsLib = { GlobalWorkerOptions: {}, getDocument(options) {
    assert.equal(options.isEvalSupported, false);
    return { promise: Promise.resolve({ numPages: 1, async getPage() { return {
      async getTextContent() { return { items: rows.flatMap((row, y) => row.map((str, x) => ({ str, transform: [1, 0, 0, 1, 600 - x * 50, 700 - y * 20] }))) }; }, cleanup() {},
    }; } }), async destroy() { destroyed = true; } };
  } };
  try {
    const certificate = await readStudentCertificate({ arrayBuffer: async () => new ArrayBuffer(0) }, student);
    assert.equal(certificate.terms[0].subjects[0].score, 0);
    assert.equal(destroyed, true);
  } finally { globalThis.document = originalDocument; globalThis.pdfjsLib = originalLibrary; }
});
