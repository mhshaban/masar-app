import { test } from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { parseCheckpointWorkbook } from "../scripts/lib/checkpoint-xlsx-parser.mjs";

function bufferFromRows(sheetName, rows) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

test("parseCheckpointWorkbook detects known Arabic column headers by alias", () => {
  const buf = bufferFromRows("درجات", [
    ["رقم الطالب", "اسم الطالب", "رمز المقرر", "الدرجة", "الدرجة النهائية"],
    ["20254220", "أحمد", "ريض801", 85, 100],
    ["20254221", "سارة", "ريض801", 40, 100],
  ]);
  const parsed = parseCheckpointWorkbook(buf);
  assert.ok(parsed);
  assert.equal(parsed.sheetName, "درجات");
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].studentId, "20254220");
  assert.equal(parsed.rows[0].score, 85);
  assert.equal(parsed.rows[0].subjectCode, "ريض801");
});

test("parseCheckpointWorkbook treats the literal 0.5 score as an encoded absence", () => {
  const buf = bufferFromRows("درجات", [
    ["رقم الطالب", "الدرجة"],
    ["20254220", 0.5],
  ]);
  const parsed = parseCheckpointWorkbook(buf);
  assert.equal(parsed.rows[0].score, null);
  assert.equal(parsed.rows[0].scoreStatus, "absent");
});

test("parseCheckpointWorkbook returns null when the required columns aren't found (not a grades sheet)", () => {
  const buf = bufferFromRows("كشف الطلاب", [
    ["الاسم", "المستوى", "الشعبة"],
    ["أحمد", "الثالث", "1"],
  ]);
  assert.equal(parseCheckpointWorkbook(buf), null);
});

test("parseCheckpointWorkbook skips a data row with no student id", () => {
  const buf = bufferFromRows("درجات", [
    ["رقم الطالب", "الدرجة"],
    ["20254220", 90],
    [null, 50],
  ]);
  const parsed = parseCheckpointWorkbook(buf);
  assert.equal(parsed.rows.length, 1);
});
