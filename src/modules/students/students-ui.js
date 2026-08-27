import { getRosterStatus, getRosterMeta, searchStudentsPage, getStudent } from "./students-service.js";
import { renderAcademicPath } from "../grades/academic-path-ui.js";
import { getPendingSubjectsForStudent } from "../promoted/promoted-service.js";
import { parseStudentsWorkbook, commitStudentsImport } from "../../services/students-import-service.js";
import { getCurrentProfile } from "../../services/auth-service.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0] || "").join("");
}

// يستورد شيت "كشف الطلاب" من نفس ملف كشف الطلاب الكامل المستخدم لبقية
// الاستيرادات — عبر cloud-runtime.js، خلف تسجيل الدخول + RLS، بدل ملف ثابت
// بالمستودع العام (كان يعني أي زائر يقدر يجلب بيانات الطلبة مباشرة).
export function renderImportSection(root, { onImported, isUpdate }) {
  root.innerHTML = `
    <div class="card">
      <h2>${isUpdate ? "تحديث سجل الطلبة" : "استيراد سجل الطلبة"}</h2>
      <p class="hint">ارفع ملف كشف الطلاب الكامل (شيت "كشف الطلاب") — يستبدل السجل الحالي بالكامل بمحتوى الملف.</p>
      <input type="file" id="students-import-file" aria-label="ملف كشف الطلاب" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="margin-bottom:12px;">
      <div id="students-import-preview"></div>
    </div>
  `;

  const fileInput = root.querySelector("#students-import-file");
  const previewRoot = root.querySelector("#students-import-preview");

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    previewRoot.innerHTML = '<p class="hint">جارٍ القراءة…</p>';
    try {
      const { students } = await parseStudentsWorkbook(file);
      if (!students.length) {
        previewRoot.innerHTML = '<p class="hint" style="color:var(--critical);">ما لقينا أي صف طالب صالح بالملف.</p>';
        return;
      }
      previewRoot.innerHTML = `
        <p class="hint">${students.length} طالبًا جاهزين للاستيراد.</p>
        <button class="btn btn-primary" id="students-import-commit">${isUpdate ? "استبدال السجل الحالي بهذا الملف" : "اعتماد الاستيراد"}</button>
      `;
      previewRoot.querySelector("#students-import-commit").addEventListener("click", async () => {
        if (isUpdate && !confirm(`سيُستبدل سجل الطلبة الحالي بالكامل بـ${students.length} طالبًا من هذا الملف — لا يوجد دمج. متأكد؟`)) return;
        await commitStudentsImport(students);
        previewRoot.innerHTML = '<p class="hint">تم الاستيراد بنجاح. جارٍ إعادة التحميل…</p>';
        await onImported();
      });
    } catch (err) {
      previewRoot.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(err.message)}</p>`;
    }
  });
}

function renderEmptyState(container, { isAdmin, onGoto } = {}) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>سجل الطلبة</h1><div class="sub">لا يوجد سجل طلبة مستورَد بعد</div></div>
    </div>
    <div class="card"><div class="empty">
      ${isAdmin
        ? '<p style="margin:0 0 12px;">استورد كشف الطلاب من تبويب الاستيراد بالإدارة.</p><button class="btn btn-primary" id="students-goto-imports">الذهاب لتبويب الاستيراد</button>'
        : "تواصل مع مسؤول النظام لاستيراد سجل الطلبة."}
    </div></div>
  `;
  const gotoBtn = container.querySelector("#students-goto-imports");
  if (gotoBtn && onGoto) gotoBtn.addEventListener("click", () => onGoto("imports"));
}

// onQueryChange is kept separate from onChange (level/department/track) and
// never triggers a re-render of this filter block: typing re-renders nothing
// here, only the results list. Re-rendering on every keystroke used to
// destroy and recreate the <input> itself, dropping keyboard focus after
// every single character — confirmed as the reported "search box only
// accepts one letter" bug.
function renderFilters(root, options, current, onChange, onQueryChange) {
  root.innerHTML = `
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="students-q" type="search" placeholder="ابحث بالاسم أو الرقم الأكاديمي أو الرقم الشخصي..." value="${esc(current.query)}">
    </div>
    <div class="chip-row" id="students-level-chips">
      <div class="chip${!current.level ? " on" : ""}" data-level="">الكل</div>
      ${options.levels.map((l) => `<div class="chip${current.level === l ? " on" : ""}" data-level="${esc(l)}">${esc(l)}</div>`).join("")}
    </div>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;">
      <select id="students-department" style="padding:8px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        <option value="">كل الأقسام</option>
        ${options.departments.map((d) => `<option value="${esc(d)}" ${current.department === d ? "selected" : ""}>${esc(d)}</option>`).join("")}
      </select>
      <select id="students-track" style="padding:8px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        <option value="">كل المسارات</option>
        ${options.tracks.map((t) => `<option value="${esc(t)}" ${current.track === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
      </select>
    </div>
  `;

  root.querySelector("#students-q").addEventListener("input", (e) => onQueryChange(e.target.value));
  root.querySelectorAll("#students-level-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => onChange({ ...current, level: chip.dataset.level }));
  });
  root.querySelector("#students-department").addEventListener("change", (e) => onChange({ ...current, department: e.target.value }));
  root.querySelector("#students-track").addEventListener("change", (e) => onChange({ ...current, track: e.target.value }));
}

const PAGE_SIZE = 50;

function renderTable(root, students, total, onOpen, onLoadMore) {
  if (!students.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا يوجد طلاب مطابقون لهذا البحث</div></div>';
    return;
  }
  const remaining = total - students.length;
  root.innerHTML = `
    <div class="card">
      <div class="tablewrap"><table>
        <thead><tr><th>الطالب</th><th>المستوى</th><th>الشعبة</th><th>القسم</th><th>المسار</th><th>المرشد</th></tr></thead>
        <tbody>
          ${students.map((s) => `
            <tr data-id="${esc(s.id)}">
              <td>
                <div style="display:flex; align-items:center; gap:10px;">
                  <div class="row-item" style="padding:0; border:none;"><div class="avatar">${esc(initials(s.name))}</div></div>
                  <div>
                    <div style="font-weight:600;">${esc(s.name) || "—"}</div>
                    <div class="hint" style="margin:0;">${esc(s.academicId) || "—"}</div>
                  </div>
                </div>
              </td>
              <td>${esc(s.level) || "—"}</td>
              <td>${esc(s.section) || "—"}</td>
              <td>${esc(s.department) || "—"}</td>
              <td>${esc(s.track) || "—"}</td>
              <td>${esc(s.counselor?.name) || "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>
      ${remaining > 0 ? `
        <div style="display:flex; justify-content:center; padding-top:14px;">
          <button class="btn btn-ghost" id="students-load-more">عرض ${Math.min(remaining, PAGE_SIZE)} طالبًا إضافيًا (متبقي ${remaining})</button>
        </div>
      ` : ""}
    </div>
  `;
  root.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => onOpen(tr.dataset.id));
  });
  const loadMoreBtn = root.querySelector("#students-load-more");
  if (loadMoreBtn) loadMoreBtn.addEventListener("click", onLoadMore);
}

async function renderDetail(container, id, onBack) {
  const s = await getStudent(id);
  if (!s) {
    container.innerHTML = '<div class="card"><div class="empty">تعذّر إيجاد بيانات هذا الطالب</div></div>';
    return;
  }

  const hasGuidanceFlags = s.supportNeeded || s.socialGuidance;
  const promotedSubjects = await getPendingSubjectsForStudent(String(s.academicId || s.id));
  const pendingSubjects = promotedSubjects.filter((r) => !r.cleared);

  container.innerHTML = `
    <button class="backlink" id="students-back">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M15 18l-6-6 6-6"/></svg>
      رجوع لسجل الطلبة
    </button>
    <div class="topbar">
      <div style="display:flex; align-items:center; gap:14px;">
        <div style="width:64px; height:64px; border-radius:50%; background:var(--teal-600); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:19px; flex:0 0 auto;">${esc(initials(s.name))}</div>
        <div>
          <h1>${esc(s.name) || "—"}</h1>
          <div class="sub">${esc(s.level) || "—"} · ${esc(s.section) || "—"} · ${esc(s.department) || "—"} — ${esc(s.track) || "—"}</div>
        </div>
      </div>
      <div class="meta">الرقم الأكاديمي ${esc(s.academicId) || "—"}</div>
    </div>

    ${hasGuidanceFlags ? `
      <div class="sens">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
        <div>هذا الطالب لديه ملاحظات إرشاد اجتماعي أو دعم مطلوب مسجَّلة في كشف الطلاب — بيانات شبه حساسة تُعرض هنا فقط للمرشد.</div>
      </div>
    ` : ""}
    ${pendingSubjects.length ? `
      <div class="sens">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
        <div>طالب مرفَّع من الإعدادية بمقررات لم تُستوفَ بعد: ${esc(pendingSubjects.map((r) => r.subjectCode).join("، "))}</div>
      </div>
    ` : ""}

    <div class="grid g2">
      <div class="card">
        <h2>بيانات الاتصال</h2>
        <div class="tablewrap"><table>
          <tbody>
            <tr><td>الاسم بالإنجليزية</td><td>${esc(s.nameEn) || "—"}</td></tr>
            <tr><td>البريد الإلكتروني</td><td>${esc(s.email) || "—"}</td></tr>
            <tr><td>الرقم الشخصي</td><td class="num">${esc(s.civilId) || "—"}</td></tr>
            <tr><td>أرقام الاتصال</td><td class="num">${(s.phones || []).map(esc).join(" · ") || "—"}</td></tr>
            <tr><td>المواصلات</td><td>${esc(s.transport) || "—"}</td></tr>
            <tr><td>رقم المجمع</td><td class="num">${esc(s.complexNumber) || "—"}</td></tr>
          </tbody>
        </table></div>
      </div>
      <div class="card">
        <h2>مرشد الشعبة</h2>
        <div class="tablewrap"><table>
          <tbody>
            <tr><td>الاسم</td><td>${esc(s.counselor?.name) || "—"}</td></tr>
            <tr><td>القسم</td><td>${esc(s.counselor?.department) || "—"}</td></tr>
            <tr><td>البريد الإلكتروني</td><td>${esc(s.counselor?.email) || "—"}</td></tr>
            <tr><td>رقم التواصل</td><td class="num">${esc(s.counselor?.phone) || "—"}</td></tr>
          </tbody>
        </table></div>
      </div>
    </div>

    <div class="card" style="margin-top:16px;">
      <h2>ملاحظات إضافية</h2>
      <div class="tablewrap"><table>
        <tbody>
          <tr><td>الإرشاد الاجتماعي</td><td>${esc(s.socialGuidance) || "—"}</td></tr>
          <tr><td>الدعم المطلوب</td><td>${esc(s.supportNeeded) || "—"}</td></tr>
          <tr><td>جنسيات غير عربية</td><td>${esc(s.nonArabNationality) || "—"}</td></tr>
          <tr><td>رغبة التخصص</td><td>${esc(s.specializationPreference) || "—"}</td></tr>
          <tr><td>الحد الأدنى للتخصص</td><td class="num">${esc(s.minSpecializationThreshold) || "—"}</td></tr>
          <tr><td>رقم المقعد / اللجنة</td><td class="num"><span dir="ltr">${esc(s.seatNumber) || "—"} / ${esc(s.committee) || "—"}</span></td></tr>
        </tbody>
      </table></div>
    </div>

    <div class="topbar" style="margin-top:22px;">
      <div><h1 style="font-size:17px;">المسار الأكاديمي</h1><div class="sub">تاريخ الطالب عبر الفترات الدراسية، من الدرجات والشهادات المستوردة</div></div>
    </div>
    <div id="student-academic-path"></div>
  `;

  container.querySelector("#students-back").addEventListener("click", onBack);

  await renderAcademicPath(container.querySelector("#student-academic-path"), String(s.academicId || s.id));
}

export async function mountStudentsView(container, { onGoto } = {}) {
  const status = await getRosterStatus();
  if (!status.available) {
    const profile = getCurrentProfile();
    renderEmptyState(container, { isAdmin: profile?.role === "admin" || profile?.is_admin === true, onGoto });
    return;
  }

  let state = { query: "", level: "", department: "", track: "" };

  container.innerHTML = `
    <div class="topbar">
      <div><h1>سجل الطلبة</h1><div class="sub">من كشف الطلاب الفعلي — بيانات مشتركة سحابيًا بين الحسابات النشطة، لا تُدفع إلى git</div></div>
      <div class="meta" id="students-count"></div>
    </div>
    <div class="grid g4" style="margin-bottom:16px;" id="students-stats"></div>
    <div id="students-filters"></div>
    <div id="students-results"></div>
  `;

  const { stats, options } = await getRosterMeta();
  const topLevels = Object.entries(stats.byLevel);
  container.querySelector("#students-stats").innerHTML = `
    <div class="card stat"><div class="label">إجمالي الطلبة</div><div class="value">${stats.total}</div></div>
    ${topLevels.slice(0, 2).map(([level, n]) => `
      <div class="card stat"><div class="label">مستوى ${esc(level)}</div><div class="value">${n}</div></div>
    `).join("")}
    <div class="card stat"><div class="label">لديهم ملاحظات دعم/إرشاد</div><div class="value">${stats.flagged}</div></div>
  `;

  const resultsRoot = container.querySelector("#students-results");
  const countRoot = container.querySelector("#students-count");

  let loadedResults = [];
  let matchingTotal = 0;
  let requestVersion = 0;
  let searchTimer = null;

  const draw = () => {
    countRoot.textContent = `${matchingTotal} من ${stats.total} طالبًا`;
    renderTable(
      resultsRoot,
      loadedResults,
      matchingTotal,
      (id) => renderDetail(container, id, () => mountStudentsView(container)),
      async () => {
        const page = await searchStudentsPage({ ...state, offset: loadedResults.length, limit: PAGE_SIZE });
        loadedResults.push(...page.rows);
        matchingTotal = page.total;
        draw();
      },
    );
  };

  const refresh = async () => {
    const version = ++requestVersion;
    resultsRoot.innerHTML = '<div class="card"><div class="empty" role="status">جارٍ البحث…</div></div>';
    const page = await searchStudentsPage({ ...state, offset: 0, limit: PAGE_SIZE });
    if (version !== requestVersion) return;
    loadedResults = page.rows;
    matchingTotal = page.total;
    draw();
  };

  const onChange = async (next) => {
    state = next;
    renderFilters(container.querySelector("#students-filters"), options, state, onChange, onQueryChange);
    await refresh();
  };

  const onQueryChange = async (query) => {
    state = { ...state, query };
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refresh, 250);
  };

  renderFilters(container.querySelector("#students-filters"), options, state, onChange, onQueryChange);
  await refresh();
}
