import { get, save } from "../../services/cloud-runtime.js";

export const DEFAULT_PROGRESS = {
  status: "not_started",
  participantsCount: null,
  proofNote: null,
  obstacles: null,
  completedDate: null,
  followUpItemId: null,
  effectivenessReport: null,
  attachments: [],
};

// Evidence files (photos of the activity, signed attendance sheets, etc.)
// are stored as data URLs directly on the actionProgress record, same
// approach as student photos — synced to the shared Supabase database like
// every other collection (see cloud-runtime.js), visible to every active
// account. Capped higher than a photo since these can be scanned documents,
// but still bounded so one action's evidence can't balloon the database.
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export async function getProgress(actionId) {
  const existing = await get("actionProgress", actionId);
  return existing || { id: actionId, ...DEFAULT_PROGRESS };
}

export async function saveProgress(actionId, patch) {
  const current = await getProgress(actionId);
  const next = { ...current, ...patch, id: actionId };
  await save("actionProgress", next);
  return next;
}

// file.arrayBuffer() + btoa() instead of FileReader — both exist in Node
// (unlike FileReader, which is browser-only), so this same code path is
// exercised directly by the automated test suite instead of only by hand
// in a browser.
async function readFileAsDataUrl(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return `data:${file.type || "application/octet-stream"};base64,${base64}`;
}

function genAttachmentId() {
  return `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function addAttachment(actionId, file) {
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`حجم الملف أكبر من الحد المسموح (${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} ميغابايت).`);
  }
  const dataUrl = await readFileAsDataUrl(file);
  const current = await getProgress(actionId);
  const attachment = { id: genAttachmentId(), name: file.name, type: file.type || "application/octet-stream", size: file.size, dataUrl };
  const next = { ...current, id: actionId, attachments: [...(current.attachments || []), attachment] };
  await save("actionProgress", next);
  return next;
}

export async function removeAttachment(actionId, attachmentId) {
  const current = await getProgress(actionId);
  const next = { ...current, id: actionId, attachments: (current.attachments || []).filter((a) => a.id !== attachmentId) };
  await save("actionProgress", next);
  return next;
}
