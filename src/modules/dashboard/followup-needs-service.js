import { listCandidates as listCaseCandidates } from "../cases/guidance-service.js";
import { listCandidates as listSupportCandidates } from "../support/support-service.js";
import { listCandidates as listCareerCandidates } from "../career/career-service.js";
import { listStudentsWithPendingSubjects } from "../promoted/promoted-service.js";
import { getStudent } from "../students/students-service.js";

export const NEED_LABELS = {
  case: "حالة إرشادية",
  support: "خطة دعم",
  career: "توجيه مهني",
  promoted: "مقررات مرفَّع",
};

// The four "candidates" panels (guidance cases, support plans, career
// guidance, pending promoted-subjects) each flag students independently,
// from different signals — a student can show up in more than one. This
// merges them per student so the counselor sees the whole picture in one
// place instead of checking four screens.
export async function listStudentsNeedingAttention() {
  const [caseCandidates, supportCandidates, careerCandidates, promotedRows] = await Promise.all([
    listCaseCandidates(),
    listSupportCandidates(),
    listCareerCandidates(),
    listStudentsWithPendingSubjects(),
  ]);

  const byStudent = new Map();
  const addNeed = (studentId, type, reasons) => {
    if (!byStudent.has(studentId)) byStudent.set(studentId, { studentId, needs: [] });
    byStudent.get(studentId).needs.push({ type, reasons });
  };

  for (const c of caseCandidates) addNeed(c.studentId, "case", c.reasons);
  for (const c of supportCandidates) addNeed(c.studentId, "support", c.reasons);
  for (const s of careerCandidates) addNeed(s.id, "career", ["طالب سنة نهائية بلا جلسة توجيه مهني بعد"]);
  for (const p of promotedRows) addNeed(p.studentId, "promoted", [`مقررات لم تُجتَز بعد: ${p.pendingSubjects.join("، ")}`]);

  const rows = await Promise.all(
    [...byStudent.values()].map(async (row) => ({ ...row, student: await getStudent(row.studentId) })),
  );

  return rows.sort((a, b) => b.needs.length - a.needs.length);
}
