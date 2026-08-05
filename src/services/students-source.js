import { count, bulkPut } from "./cloud-runtime.js";

const DATA_URL = "data/students.local.json";

let ensured = null;

async function fetchRoster() {
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function ensureStudentsSeeded() {
  if (!ensured) {
    ensured = (async () => {
      const existing = await count("students");
      if (existing > 0) return { available: true, seeded: false, count: existing };

      const roster = await fetchRoster();
      if (!roster) return { available: false, seeded: false, count: 0 };

      const records = roster.map((s, i) => ({
        id: s.academicId || s.civilId || `student-${i + 1}`,
        ...s,
      }));
      await bulkPut("students", records);
      return { available: true, seeded: true, count: records.length };
    })();
  }
  return ensured;
}
