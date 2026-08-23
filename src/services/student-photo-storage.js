import { SB_URL, SB_KEY, getAccessToken } from "./supabase-config.js";

const BUCKET = "student-photos";
const signedUrlCache = new Map();

function headers(extra = {}) {
  const token = getAccessToken();
  if (!token) throw new Error("الجلسة منتهية — سجّل الدخول من جديد.");
  return { apikey: SB_KEY, Authorization: `Bearer ${token}`, ...extra };
}

function storagePath(studentId) {
  return `${encodeURIComponent(String(studentId))}/avatar.webp`;
}

export async function uploadStudentPhoto(studentId, blob) {
  if (!(blob instanceof Blob)) throw new Error("ملف الصورة غير صالح.");
  const path = storagePath(studentId);
  const response = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: headers({ "Content-Type": blob.type || "image/webp", "x-upsert": "true" }),
    body: blob,
  });
  if (!response.ok) throw new Error("تعذر رفع صورة الطالب إلى التخزين الآمن.");
  signedUrlCache.delete(path);
  return path;
}

export async function removeStudentPhotoObject(path) {
  if (!path) return;
  const response = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ prefixes: [path] }),
  });
  if (!response.ok) throw new Error("تعذر حذف صورة الطالب من التخزين الآمن.");
  signedUrlCache.delete(path);
}

export async function createSignedStudentPhotoUrl(path, expiresIn = 900) {
  if (!path) return null;
  const cached = signedUrlCache.get(path);
  if (cached && cached.until > Date.now()) return cached.url;
  const response = await fetch(`${SB_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const signedPath = data.signedURL || data.signedUrl;
  if (!signedPath) return null;
  const url = signedPath.startsWith("http") ? signedPath : `${SB_URL}/storage/v1${signedPath}`;
  signedUrlCache.set(path, { url, until: Date.now() + Math.max(30, expiresIn - 60) * 1000 });
  return url;
}

export function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) throw new Error("صيغة الصورة القديمة غير صالحة.");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}
