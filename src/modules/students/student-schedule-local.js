import { getMasarFolderHandle } from "../dashboard/dashboard-local-folder.js?v=2026-09-06-student-schedule-1";

let cachedPdfFiles = null;

export function normalizeScheduleFileKey(value) {
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\.pdf$/i, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function scheduleMatchScore(fileName, student) {
  const fileKey = normalizeScheduleFileKey(fileName);
  const academicId = normalizeScheduleFileKey(student?.academicId || student?.id);
  const section = normalizeScheduleFileKey(student?.section);
  // Prefer the section timetable when a student's certificate also uses their ID.
  if (section && fileKey === section) return 100;
  if (academicId && fileKey === academicId) return 90;
  if (academicId && fileKey.includes(academicId)) return 90;
  if (section && section.length >= 3 && fileKey.includes(section)) return 80;
  return 0;
}

async function scanPdfFiles(directory, path = "", depth = 0) {
  if (depth > 6) return [];
  const files = [];
  for await (const entry of directory.values()) {
    const relativePath = path ? `${path}/${entry.name}` : entry.name;
    if (entry.kind === "file" && /\.pdf$/i.test(entry.name)) files.push({ name: entry.name, relativePath, handle: entry });
    if (entry.kind === "directory") files.push(...await scanPdfFiles(entry, relativePath, depth + 1));
  }
  return files;
}

export async function findStudentScheduleFiles(student, { prompt = false, refresh = false } = {}) {
  const folder = await getMasarFolderHandle({ prompt });
  if (!folder) return { connected: false, matches: [] };
  if (!cachedPdfFiles || refresh) cachedPdfFiles = await scanPdfFiles(folder);
  const matches = cachedPdfFiles
    .map((file) => ({ ...file, score: scheduleMatchScore(file.name, student) }))
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath, "ar"));
  const bestScore = matches[0]?.score || 0;
  return { connected: true, matches: matches.filter((file) => file.score === bestScore) };
}

export async function openScheduleFile(fileHandle) {
  const tab = window.open("about:blank", "_blank");
  try {
    const file = await fileHandle.getFile();
    const url = URL.createObjectURL(file);
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    if (tab) tab.close();
    throw error;
  }
}

export async function scheduleFileObjectUrl(fileHandle) {
  const file = await fileHandle.getFile();
  return URL.createObjectURL(file);
}
