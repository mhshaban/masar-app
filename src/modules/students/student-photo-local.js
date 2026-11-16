import { getMasarFolderHandle, getMasarFolderPermissionState } from "../dashboard/dashboard-local-folder.js?v=2026-11-16-photo-permission-1";

let cachedImageFiles = null;
let imageScanInFlight = null;

export function normalizeStudentPhotoKey(value) {
  return String(value || "")
    .replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\.(jpe?g|png|webp|gif)$/i, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function studentPhotoMatchScore(fileName, student) {
  const fileKey = normalizeStudentPhotoKey(fileName);
  const academicId = normalizeStudentPhotoKey(student?.academicId || student?.id);
  const civilId = normalizeStudentPhotoKey(student?.civilId);
  if (academicId && fileKey === academicId) return 120;
  if (civilId && fileKey === civilId) return 110;
  if (academicId && academicId.length >= 6 && fileKey.includes(academicId)) return 90;
  if (civilId && civilId.length >= 6 && fileKey.includes(civilId)) return 80;
  return 0;
}

async function scanImageFiles(directory, path = "", depth = 0) {
  if (depth > 6) return [];
  const files = [];
  for await (const entry of directory.values()) {
    const relativePath = path ? `${path}/${entry.name}` : entry.name;
    if (entry.kind === "file" && /\.(jpe?g|png|webp|gif)$/i.test(entry.name)) files.push({ name: entry.name, relativePath, handle: entry });
    if (entry.kind === "directory") files.push(...await scanImageFiles(entry, relativePath, depth + 1));
  }
  return files;
}

async function imageFilesForFolder(folder, refresh) {
  if (refresh) cachedImageFiles = null;
  if (cachedImageFiles) return cachedImageFiles;
  if (!imageScanInFlight) imageScanInFlight = scanImageFiles(folder);
  try {
    cachedImageFiles = await imageScanInFlight;
    return cachedImageFiles;
  } finally {
    imageScanInFlight = null;
  }
}

export async function findStudentPhotoFiles(students, { prompt = false, refresh = false, matcher = studentPhotoMatchScore } = {}) {
  const folder = await getMasarFolderHandle({ prompt });
  if (!folder) return { connected: false, matches: new Map() };
  const files = await imageFilesForFolder(folder, refresh);
  const matches = new Map();
  for (const student of students) {
    const ranked = files
      .map((file) => ({ ...file, score: matcher(file.name, student) }))
      .filter((file) => file.score > 0)
      .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath, "ar"));
    if (ranked[0]) matches.set(String(student.id), ranked[0]);
  }
  return { connected: true, matches };
}

export async function studentPhotoObjectUrl(fileHandle) {
  const file = await fileHandle.getFile();
  return URL.createObjectURL(file);
}

// المتصفح لا يسمح بطلب صلاحية المجلد إلا داخل نقرة من المستخدم، فبدل ما
// يدوّر المستخدم على زر "عرض صور الطلاب" كل مرة يفتح فيها المتصفح، نطلب
// الصلاحية مع أول نقرة في الصفحة (لو المجلد محفوظ مسبقًا وصلاحيته سقطت).
// بعد الموافقة يُستدعى آخر onGranted مسجَّل ليعرض صور ما هو ظاهر حاليًا.
let pendingGrantCallback = null;
let gestureListenerArmed = false;
let permissionRequestInFlight = false;

function handleFirstGesture() {
  if (permissionRequestInFlight) return;
  permissionRequestInFlight = true;
  document.removeEventListener("click", handleFirstGesture, true);
  gestureListenerArmed = false;
  getMasarFolderHandle({ prompt: true })
    .then((handle) => {
      const callback = pendingGrantCallback;
      pendingGrantCallback = null;
      if (handle && callback) callback();
    })
    .catch(() => {})
    .finally(() => { permissionRequestInFlight = false; });
}

export async function requestStudentPhotoAccessOnNextGesture(onGranted) {
  if (typeof document === "undefined") return "unsupported";
  const state = await getMasarFolderPermissionState().catch(() => "unsupported");
  if (state !== "prompt") return state;
  pendingGrantCallback = onGranted;
  if (!gestureListenerArmed) {
    gestureListenerArmed = true;
    document.addEventListener("click", handleFirstGesture, true);
  }
  return state;
}
