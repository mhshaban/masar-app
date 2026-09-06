import { readWorkbook } from "./xlsx-parser.js";
import { parseStudentsRows, commitStudentsImport } from "./students-import-service.js";
import { importTeachers } from "../modules/forms/forms-service.js?v=2026-09-06-school-import-1";
import { parsePromotedRows, commitPromotedBatch } from "../modules/promoted/promoted-service.js?v=2026-09-06-school-import-1";
import { buildBackup, downloadBackup } from "./backup-service.js?v=2026-09-06-school-import-1";

const clean = (value) => String(value ?? "").replace(/[‎‏‪-‮]/g, "").trim();

const TEACHER_ALIASES = {
  sectionNumber: ["رقم الشعبة"], sectionCounselor: ["مرشد شعبة"], personalNo: ["الرقم الشخصي"],
  name: ["الاسم باللغة العربية"], nameEn: ["الاسم باللغة الإنجليزية", "الاسم باللغة الانجليزية"],
  department: ["القسم"], departmentEn: ["القسم باللغة الانجليزية", "القسم باللغة الإنجليزية"],
  jobTitle: ["الوظيفة"], jobTitleEn: ["الوظيفة باللغة الانجليزية", "الوظيفة باللغة الإنجليزية"],
  phone: ["رقم الاتصال"], email: ["البريد الالكتروني", "البريد الإلكتروني"], teamsUrl: ["teams", "تيمز"],
};

function columnMap(headerRow, aliases) {
  const map = {};
  headerRow.forEach((cell, index) => {
    const header = clean(cell);
    for (const [field, names] of Object.entries(aliases)) if (map[field] === undefined && names.includes(header)) map[field] = index;
  });
  return map;
}

export function parseTeachersRows(rows) {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) throw new Error("شيت المعلمين فارغ.");
  const cols = columnMap(headerRow, TEACHER_ALIASES);
  if (cols.personalNo === undefined || cols.name === undefined) throw new Error("تعذّر التعرّف على عمودي الرقم الشخصي واسم المعلم.");
  const byId = new Map();
  for (const [index, row] of dataRows.entries()) {
    if (!row || !clean(row[cols.personalNo])) continue;
    const personalNo = clean(row[cols.personalNo]);
    const name = clean(row[cols.name]);
    if (!name) throw new Error(`يوجد معلم بلا اسم عند الصف ${index + 2}.`);
    const record = { id: `teacher-${personalNo}`, personalNo, name };
    for (const field of ["sectionNumber", "sectionCounselor", "nameEn", "department", "departmentEn", "jobTitle", "jobTitleEn", "phone", "email", "teamsUrl"]) record[field] = clean(row[cols[field]]) || null;
    if (byId.has(record.id)) throw new Error(`الرقم الشخصي مكرر في شيت المعلمين: ${personalNo}`);
    byId.set(record.id, record);
  }
  return [...byId.values()];
}

function findSheet(sheetNames, hint) {
  return sheetNames.find((name) => clean(name).includes(hint));
}

export async function parseSchoolWorkbook(file) {
  const { sheetNames, sheets } = await readWorkbook(file);
  const studentsSheet = findSheet(sheetNames, "كشف الطلاب");
  const teachersSheet = findSheet(sheetNames, "المعلمين");
  const promotedSheet = findSheet(sheetNames, "المرفع");
  if (!studentsSheet || !teachersSheet || !promotedSheet) throw new Error("الملف يجب أن يحتوي شيتات كشف الطلاب والمعلمين والمرفعين.");
  const students = parseStudentsRows(sheets[studentsSheet] || []);
  const teachers = parseTeachersRows(sheets[teachersSheet] || []);
  const promotedRows = parsePromotedRows(sheets[promotedSheet] || [], students);
  return { students, teachers, promotedRows, sheets: { students: studentsSheet, teachers: teachersSheet, promoted: promotedSheet } };
}

export async function commitSchoolWorkbook(data, { fileName }) {
  const backup = await buildBackup({ force: true });
  downloadBackup(backup);
  const studentsResult = await commitStudentsImport(data.students);
  const teachersCount = await importTeachers(data.teachers);
  const promotedBatch = await commitPromotedBatch(data.promotedRows, { fileName });
  return { studentsCount: studentsResult.count, teachersCount, promotedBatch };
}
