import { findStudentPhotoFiles, normalizeStudentPhotoKey } from "../students/student-photo-local.js?v=2026-09-06-polish-1";

export function teacherPhotoMatchScore(fileName, teacher) {
  const key = normalizeStudentPhotoKey(fileName);
  const personal = normalizeStudentPhotoKey(teacher.personalNo);
  const employee = normalizeStudentPhotoKey(teacher.employeeNo);
  if (personal && key === personal) return 120;
  if (employee && key === employee) return 110;
  return 0;
}

export function findTeacherPhotos(teachers, options = {}) {
  return findStudentPhotoFiles(teachers, { ...options, matcher: teacherPhotoMatchScore });
}

export function legacyPhotoFile(teacher, photo) {
  const key = String(teacher.personalNo || teacher.employeeNo || "").trim();
  if (!/^[\p{L}\p{N}_-]+$/u.test(key)) throw new Error("المعلم بلا رقم صالح لتسمية الصورة");
  const match = /^data:image\/(jpeg|png|webp|gif);base64,([a-z0-9+/=\s]+)$/i.exec(photo || "");
  if (!match) throw new Error("صيغة الصورة القديمة غير مدعومة");
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  return { name: `${key}.${match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase()}`, blob: new Blob([bytes], { type: `image/${match[1].toLowerCase()}` }) };
}

// Only writes into an explicitly selected folder; never overwrites a file.
export async function copyLegacyTeacherPhotos(directory, listPage, getPhoto, onProgress = () => {}) {
  const result = { copied: 0, skipped: 0, failed: 0 };
  for (let offset = 0; ; offset += 50) {
    const page = await listPage({ offset, limit: 50 });
    for (const teacher of page.rows) {
      if (!teacher.hasPhoto) continue;
      try {
        const file = legacyPhotoFile(teacher, await getPhoto(teacher.id));
        let existing = false;
        try { await directory.getFileHandle(file.name); existing = true; }
        catch (error) { if (error.name !== "NotFoundError") throw error; }
        if (existing) { result.skipped++; continue; }
        const handle = await directory.getFileHandle(file.name, { create: true });
        const writer = await handle.createWritable();
        try { await writer.write(file.blob); await writer.close(); }
        catch (error) { await writer.abort().catch(() => {}); throw error; }
        if ((await handle.getFile()).size !== file.blob.size) throw new Error("لم يكتمل نسخ الصورة");
        result.copied++;
      } catch { result.failed++; }
      onProgress({ ...result });
    }
    if (!page.rows.length || offset + page.rows.length >= page.total) return result;
  }
}
