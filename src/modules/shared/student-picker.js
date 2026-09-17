import { searchStudents } from "../students/students-service.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// A lightweight search-and-select input for attaching a record to one
// specific student (guidance cases, support plans), without loading the
// full ~1400-student roster into one <select>. Pass `multi: true` (guardian
// consent forms, issued to a whole group of students at once) to instead
// accumulate a removable list of students — see mountMultiStudentPicker.
export function mountStudentPicker(root, { placeholder = "ابحث بالاسم أو الرقم الأكاديمي...", onSelect, multi = false, onChange, initial } = {}) {
  if (multi) return mountMultiStudentPicker(root, { placeholder, onSelect, onChange, initial });

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

// نفس منطق البحث أعلاه، لكن كل نتيجة تُضاف لقائمة تراكمية (شارات قابلة
// للإزالة) بدل استبدال الاختيار السابق — لطلب موافقة ولي الأمر لعدّة طلاب
// دفعة واحدة (استمارة مستقلة لكل طالب، بنفس نص الموضوع/الموافقة). الطالب
// المختار أصلًا يُستبعَد من نتائج البحث التالية لتفادي تكراره بالقائمة.
function mountMultiStudentPicker(root, { placeholder, onSelect, onChange, initial }) {
  root.innerHTML = `
    <div class="search" style="max-width:none;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" id="picker-q" placeholder="${esc(placeholder)}" autocomplete="off">
    </div>
    <div id="picker-selected" class="picker-chips"></div>
    <div id="picker-results"></div>
  `;
  const input = root.querySelector("#picker-q");
  const results = root.querySelector("#picker-results");
  const selectedRoot = root.querySelector("#picker-selected");
  // يُملأ عند فتح سجل محفوظ سلفًا للتعديل — نفس شارات الاختيار العادية،
  // لكن جاهزة من البداية بدل ما يعيد المرشد البحث عن كل طالب من جديد.
  const selected = new Map((initial || []).filter((s) => s?.id).map((s) => [s.id, s]));

  const renderSelected = () => {
    const list = [...selected.values()];
    selectedRoot.innerHTML = list.map((s) => `
      <span class="chip picker-chip">${esc(s.name) || "—"} (${esc(s.academicId || s.id)})<button type="button" data-remove="${esc(s.id)}" aria-label="إزالة ${esc(s.name)}">×</button></span>
    `).join("");
    selectedRoot.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selected.delete(btn.dataset.remove);
        renderSelected();
        onChange?.([...selected.values()]);
      });
    });
  };

  input.addEventListener("input", async () => {
    const query = input.value.trim();
    if (query.length < 2) {
      results.innerHTML = "";
      return;
    }
    const matches = (await searchStudents({ query })).filter((s) => !selected.has(s.id)).slice(0, 8);
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
        selected.set(student.id, student);
        input.value = "";
        results.innerHTML = "";
        renderSelected();
        onSelect?.(student);
        onChange?.([...selected.values()]);
      });
    });
  });

  if (selected.size) renderSelected();
}
