import { list as listAll, save, remove } from "../../services/cloud-runtime.js";

function todayBahrain() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bahrain", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export async function listReminders() {
  const reminders = await listAll("reminders");
  return reminders.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
}

export async function addReminder({ title, dueDate, note }) {
  if (!title || !title.trim()) throw new Error("عنوان التذكير مطلوب");
  return save("reminders", {
    title: title.trim(),
    dueDate: dueDate || null,
    note: note || "",
    status: "open",
    createdAt: new Date().toISOString(),
  });
}

export async function toggleReminder(reminder) {
  return save("reminders", { ...reminder, status: reminder.status === "open" ? "done" : "open" });
}

export async function removeReminder(id) {
  return remove("reminders", id);
}

export function isOverdue(reminder) {
  if (!reminder.dueDate || reminder.status === "done") return false;
  const today = todayBahrain();
  return reminder.dueDate < today;
}

export function isDueToday(reminder) {
  if (!reminder.dueDate || reminder.status === "done") return false;
  const today = todayBahrain();
  return reminder.dueDate === today;
}
