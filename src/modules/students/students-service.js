import { list as listAll, get, save } from "../../services/cloud-runtime.js";
import { ensureStudentsSeeded } from "../../services/students-source.js";

export async function getRosterStatus() {
  return ensureStudentsSeeded();
}

export async function listStudents() {
  await ensureStudentsSeeded();
  return listAll("students");
}

export async function getStudent(id) {
  await ensureStudentsSeeded();
  return get("students", id);
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

export async function getFilterOptions() {
  const students = await listStudents();
  return {
    levels: uniqueSorted(students.map((s) => s.level)),
    departments: uniqueSorted(students.map((s) => s.department)),
    tracks: uniqueSorted(students.map((s) => s.track)),
  };
}

export async function searchStudents({ query = "", level, department, track } = {}) {
  const students = await listStudents();
  const q = query.trim().toLowerCase();
  return students.filter((s) => {
    if (level && s.level !== level) return false;
    if (department && s.department !== department) return false;
    if (track && s.track !== track) return false;
    if (q) {
      const hay = `${s.name || ""} ${s.nameEn || ""} ${s.academicId || ""} ${s.civilId || ""} ${s.section || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// No photo data exists anywhere in the school's own files (checked the
// master roster export — no photo column, no embedded images), so this is
// manual-only: the counselor attaches a photo per student from this device,
// stored as a data URL directly on the student record — synced to the
// shared Supabase database like every other collection (see
// cloud-runtime.js), visible to every active account, not just this device.
export async function updateStudentPhoto(id, dataUrl) {
  const student = await get("students", id);
  if (!student) return null;
  const next = { ...student, photo: dataUrl };
  await save("students", next);
  return next;
}

export async function removeStudentPhoto(id) {
  return updateStudentPhoto(id, null);
}

export async function getRosterStats() {
  const students = await listStudents();
  const byLevel = {};
  for (const s of students) {
    const key = s.level || "غير محدد";
    byLevel[key] = (byLevel[key] || 0) + 1;
  }
  const flagged = students.filter((s) => s.supportNeeded || s.socialGuidance).length;
  const unmatched = students.filter((s) => !s.academicId || !s.level).length;
  return { total: students.length, byLevel, flagged, unmatched };
}
