import { searchStudents } from "../students/students-service.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// A lightweight search-and-select input for attaching a record to one
// specific student (guidance cases, support plans), without loading the
// full ~1400-student roster into one <select>.
export function mountStudentPicker(root, { placeholder = "ابحث بالاسم أو الرقم الأكاديمي...", onSelect } = {}) {
  root.innerHTML = `
    <div class="search" style="max-width:none;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" id="picker-q" placeholder="${esc(placeholder)}" autocomplete="off">
    </div>
    <div id="picker-results"></div>
  `;
  const input = root.querySelector("#picker-q");
  const results = root.querySelector("#picker-results");

  input.addEventListener("input", async () => {
    const query = input.value.trim();
    if (query.length < 2) {
      results.innerHTML = "";
      return;
    }
    const matches = (await searchStudents({ query })).slice(0, 8);
    if (!matches.length) {
      results.innerHTML = '<p class="hint">لا نتائج</p>';
      return;
    }
    results.innerHTML = `<ul class="plain">${matches.map((s) => `
      <li class="row-item" data-id="${esc(s.id)}" style="cursor:pointer;">
        <div class="body"><div class="title">${esc(s.name) || "—"}</div><div class="meta">${esc(s.academicId) || "—"} · ${esc(s.level) || "—"} ${esc(s.section) || ""}</div></div>
      </li>
    `).join("")}</ul>`;
    results.querySelectorAll("[data-id]").forEach((li) => {
      li.addEventListener("click", () => {
        const student = matches.find((s) => s.id === li.dataset.id);
        input.value = `${student.name} (${student.academicId || student.id})`;
        results.innerHTML = "";
        onSelect(student);
      });
    });
  });
}
