import { list as listAll, save, remove } from "../../services/cloud-runtime.js";
import { listStudents } from "../students/students-service.js";

// The final secondary-school year (based on this school's actual level values:
// الأول / الثاني / الثالث) — the point at which university/specialization
// decisions are imminent, so it's the natural candidate pool for this screen.
const FINAL_LEVEL = "الثالث";

export const SESSION_TOPICS = [
  "الميول والقدرات المهنية",
  "اختيار التخصص الجامعي",
  "متابعة القبول الجامعي",
  "توصية نهائية",
];

export async function listAllSessions() {
  return listAll("careerSessions");
}

// One row per student who has at least one session — the main list groups by
// student rather than showing a flat session log, since a session on its own
// isn't a unit anyone manages; the student's guidance history is.
export async function listStudentsWithSessions() {
  const sessions = await listAllSessions();
  const byStudent = new Map();
  for (const s of sessions) {
    if (!byStudent.has(s.studentId)) byStudent.set(s.studentId, []);
    byStudent.get(s.studentId).push(s);
  }
  const rows = [];
  for (const [studentId, list] of byStudent) {
    const sorted = [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    rows.push({
      studentId,
      studentName: sorted[0].studentName,
      sessionCount: sorted.length,
      lastDate: sorted[0].date,
      lastRecommendation: sorted.find((s) => s.recommendation)?.recommendation || null,
    });
  }
  return rows.sort((a, b) => (b.lastDate || "").localeCompare(a.lastDate || ""));
}

export async function getStudentSessions(studentId) {
  const sessions = await listAllSessions();
  return sessions.filter((s) => s.studentId === studentId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export async function addSession({ studentId, studentName, date, topic, notes, recommendation }) {
  if (!studentId) throw new Error("يجب اختيار الطالب أولًا");
  if (!topic || !topic.trim()) throw new Error("موضوع الجلسة مطلوب");
  return save("careerSessions", {
    studentId: String(studentId),
    studentName: studentName || null,
    date: date || new Date().toISOString().slice(0, 10),
    topic: topic.trim(),
    notes: notes || "",
    recommendation: recommendation && recommendation.trim() ? recommendation.trim() : null,
  });
}

export async function removeSession(id) {
  return remove("careerSessions", id);
}

// Final-year students with no career-guidance session recorded yet.
export async function listCandidates() {
  const [students, sessions] = await Promise.all([listStudents(), listAllSessions()]);
  const withSession = new Set(sessions.map((s) => s.studentId));
  return students
    .filter((s) => s.level === FINAL_LEVEL && !withSession.has(s.id))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
}
