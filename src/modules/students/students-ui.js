import { mountScheduleViewer } from "./student-schedule-viewer.js?v=2026-09-07-review-1";
import { notify } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { STUDENT_LEVEL_ORDER, getRosterStatus, getRosterMeta, getLevelTrackBreakdown, searchStudentsPage, listStudentsForSection, getStudent, updateStudent } from "./students-service.js?v=2026-09-06-student-experience-1";
import { renderAcademicPath } from "../grades/academic-path-ui.js?v=2026-09-08-academic-1";
import { getPendingSubjectsForStudent } from "../promoted/promoted-service.js?v=2026-09-07-academic-fix-1";
import { parseStudentsWorkbook, commitStudentsImport } from "../../services/students-import-service.js?v=2026-08-31-record-edit-1";
import { getCurrentProfile } from "../../services/auth-service.js";
import { findStudentScheduleFiles } from "./student-schedule-local.js?v=2026-09-07-finish-1";
import { findStudentPhotoFiles, studentPhotoObjectUrl } from "./student-photo-local.js?v=2026-09-06-polish-1";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0] || "").join("");
}

const studentField = (label, name, value = "", type = "text", required = false) => `<label class="forms-field"><span>${label}${required ? " *" : ""}</span><input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""}></label>`;

async function renderStudentEdit(container, student, onCancel, onSaved) {
  container.innerHTML = `
    <button class="backlink" id="student-edit-cancel-top">رجوع لبيانات الطالب</button>
    <div class="topbar"><div><h1>تعديل بيانات الطالب الأساسية</h1><div class="sub">يبقى معرّف السجل ثابتًا لحماية ارتباط الدرجات والحالات والخطط بالطالب.</div></div></div>
    <div class="card forms-card"><form id="student-edit-form" class="forms-grid">
      ${studentField("اسم الطالب", "name", student.name, "text", true)}
      ${studentField("الاسم بالإنجليزية", "nameEn", student.nameEn)}
      ${studentField("الرقم الأكاديمي", "academicId", student.academicId)}
      ${studentField("الرقم الشخصي", "civilId", student.civilId)}
      ${studentField("البريد الإلكتروني", "email", student.email, "email")}
      ${studentField("المستوى", "level", student.level)}
      ${studentField("الشعبة", "section", student.section)}
      ${studentField("القسم", "department", student.department)}
      ${studentField("المسار / التخصص", "track", student.track)}
      ${studentField("أرقام الاتصال (افصل بينها بفاصلة)", "phones", (student.phones || []).join("، "))}
      ${studentField("المواصلات", "transport", student.transport)}
      ${studentField("رقم المجمع", "complexNumber", student.complexNumber)}
      <label class="forms-field forms-wide"><span>ملاحظات الطالب</span><textarea name="notes" rows="5">${esc(student.notes || "")}</textarea></label>
      <div class="forms-actions forms-wide"><button class="btn btn-primary" type="submit">حفظ التعديلات</button><button class="btn btn-ghost" type="button" id="student-edit-cancel">إلغاء</button></div>
    </form></div>`;
  const cancel = () => onCancel();
  container.querySelector("#student-edit-cancel-top").addEventListener("click", cancel);
  container.querySelector("#student-edit-cancel").addEventListener("click", cancel);
  container.querySelector("#student-edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(event.target).entries());
      data.phones = String(data.phones || "").split(/[،,]/).map((value) => value.trim()).filter(Boolean);
      await updateStudent(student.id, data);
      notify("تم تحديث بيانات الطالب");
      await onSaved();
    } catch (error) {
      notify(error.message);
      button.disabled = false;
    }
  });
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
        if (isUpdate && !await confirmDialog(`سيُستبدل سجل الطلبة الحالي بالكامل بـ${students.length} طالبًا من هذا الملف — لا يوجد دمج. متأكد؟`)) return;
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
function renderFilters(root, options, current, onChange, onQueryChange, onSectionChange, onPrintSection, onPrintSettingsChange, onLoadPhotos) {
  const orderedLevels = [...STUDENT_LEVEL_ORDER.filter((level) => options.levels.includes(level)), ...options.levels.filter((level) => !STUDENT_LEVEL_ORDER.includes(level))];
  root.innerHTML = `
    <div class="search">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="students-q" type="search" placeholder="ابحث بالاسم أو الرقم الأكاديمي أو الرقم الشخصي..." value="${esc(current.query)}">
    </div>
    <div class="chip-row" id="students-level-chips">
      <div class="chip${!current.level ? " on" : ""}" data-level="">الكل</div>
      ${orderedLevels.map((l) => `<div class="chip${current.level === l ? " on" : ""}" data-level="${esc(l)}">${esc(l)}</div>`).join("")}
      <span class="students-filter-count" id="students-count" role="status" aria-live="polite"></span>
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
      <select id="students-section" style="padding:8px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        <option value="">كل الشعب</option>
        ${(options.sections || []).map((section) => `<option value="${esc(section)}" ${current.section === section ? "selected" : ""}>${esc(section)}</option>`).join("")}
      </select>
      <button class="btn btn-ghost" id="students-print-section" ${current.section ? "" : "disabled"}>طباعة الشعبة</button>
      <button class="btn btn-ghost" id="students-load-photos">عرض صور الطلاب</button>
    </div>
    <div class="card" style="margin:-2px 0 16px; padding:14px;">
      <div class="grid g2">
        <label class="forms-field"><span>عنوان كشف الشعبة</span><input id="students-print-title" type="text" value="${esc(current.printTitle)}" placeholder="مثال: تسليم استمارات اختيار التخصص"></label>
        <label class="forms-field"><span>التعليمات</span><textarea id="students-print-instructions" rows="2" placeholder="اكتب التعليمات التي ستظهر فوق الجدول">${esc(current.printInstructions)}</textarea></label>
      </div>
    </div>
  `;

  root.querySelector("#students-q").addEventListener("input", (e) => onQueryChange(e.target.value));
  root.querySelectorAll("#students-level-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => onChange({ ...current, level: chip.dataset.level }));
  });
  root.querySelector("#students-department").addEventListener("change", (e) => onChange({ ...current, department: e.target.value }));
  root.querySelector("#students-track").addEventListener("change", (e) => onChange({ ...current, track: e.target.value }));
  root.querySelector("#students-section").addEventListener("change", (e) => onSectionChange(e.target.value));
  root.querySelector("#students-print-section").addEventListener("click", onPrintSection);
  root.querySelector("#students-print-title").addEventListener("input", (e) => onPrintSettingsChange({ printTitle: e.target.value }));
  root.querySelector("#students-print-instructions").addEventListener("input", (e) => onPrintSettingsChange({ printInstructions: e.target.value }));
  root.querySelector("#students-load-photos").addEventListener("click", onLoadPhotos);
}

function printSectionRoster(students, section, popup, { title = "", instructions = "" } = {}) {
  const generatedAt = new Intl.DateTimeFormat("ar-BH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const counselor = students.find((student) => student.counselor?.name)?.counselor || {};
  const documentTitle = title.trim() || `كشف طلبة الشعبة ${section}`;
  popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(documentTitle)}</title><style>@page{size:A4 landscape;margin:9mm}body{font-family:Cairo,"Segoe UI",Tahoma,Arial,sans-serif;color:#111}h1{text-align:center;font-size:17pt;margin:0 0 3mm}.info{display:flex;gap:8mm;flex-wrap:wrap;font-size:10pt;font-weight:700;margin:0 0 3mm}.instructions{border:1px solid #999;padding:2.5mm;min-height:8mm;margin:0 0 4mm;font-size:10pt;white-space:pre-wrap}.meta{font-size:8pt;color:#555;margin-top:3mm}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5pt}thead{display:table-header-group}th,td{border:1px solid #777;padding:1.6mm;text-align:center;vertical-align:middle}th{background:#eee;font-weight:800}tr{break-inside:avoid;height:9mm}.seq{width:4%}.academic{width:12%}.student{width:24%;text-align:right}.phone{width:11%;direction:ltr}.sign{width:23%}</style></head><body><h1>${esc(documentTitle)}</h1><div class="info"><span>اسم الشعبة: ${esc(section)}</span><span>مرشد الشعبة: ${esc(counselor.name) || "—"}</span><span>قسم المرشد: ${esc(counselor.department) || "—"}</span><span>عدد الطلبة: ${students.length}</span></div>${instructions.trim() ? `<div class="instructions"><strong>التعليمات:</strong> ${esc(instructions)}</div>` : ""}<table><thead><tr><th class="seq">م</th><th class="academic">الرقم الأكاديمي</th><th class="student">اسم الطالب</th><th class="phone">رقم التواصل ١</th><th class="phone">رقم التواصل ٢</th><th class="phone">رقم التواصل ٣</th><th class="sign">التوقيع بالاستلام / بالعلم / الملاحظات</th></tr></thead><tbody>${students.map((student, index) => { const phones = (student.phones || []).slice(0, 3); return `<tr><td>${index + 1}</td><td class="phone">${esc(student.academicId || student.id)}</td><td class="student">${esc(student.name)}</td><td class="phone">${esc(phones[0] || "")}</td><td class="phone">${esc(phones[1] || "")}</td><td class="phone">${esc(phones[2] || "")}</td><td></td></tr>`; }).join("")}</tbody></table><div class="meta">قسم الإرشاد الأكاديمي والتوجيه المهني · تاريخ الطباعة: ${esc(generatedAt)}</div></body></html>`);
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 250);
}

async function hydrateStudentPhotos(root, students, { prompt = false, refresh = false } = {}) {
  const result = await findStudentPhotoFiles(students, { prompt, refresh });
  if (!result.connected) return { connected: false, count: 0 };
  let count = 0;
  for (const student of students) {
    const match = result.matches.get(String(student.id));
    if (!match) continue;
    const targets = [...root.querySelectorAll("[data-student-avatar]")].filter((element) => element.dataset.studentAvatar === String(student.id));
    if (!targets.length) continue;
    const url = await studentPhotoObjectUrl(match.handle);
    for (const target of targets) {
      target.textContent = "";
      const image = document.createElement("img");
      image.src = url;
      image.alt = `صورة ${student.name || "الطالب"}`;
      image.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:inherit;display:block";
      target.appendChild(image);
    }
    count += 1;
  }
  return { connected: true, count };
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
                  <div class="row-item" style="padding:0; border:none;"><div class="avatar" data-student-avatar="${esc(s.id)}">${esc(initials(s.name))}</div></div>
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
        <div data-student-avatar="${esc(s.id)}" style="width:72px; height:72px; border-radius:16px; background:var(--teal-600); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:19px; flex:0 0 auto; overflow:hidden;">${esc(initials(s.name))}</div>
        <div>
          <h1>${esc(s.name) || "—"}</h1>
          <div class="sub">${esc(s.level) || "—"} · ${esc(s.section) || "—"} · ${esc(s.department) || "—"} — ${esc(s.track) || "—"}</div>
        </div>
      </div>
      <div class="meta">الرقم الأكاديمي ${esc(s.academicId) || "—"}</div>
      <div class="forms-actions"><button class="btn btn-ghost" id="student-photo-load">عرض الصورة</button><button class="btn btn-primary" id="student-edit">تعديل بيانات الطالب</button></div>
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
          <tr><td>ملاحظات الطالب</td><td>${esc(s.notes) || "—"}</td></tr>
        </tbody>
      </table></div>
    </div>

    <div class="card" id="student-schedule-card" style="margin-top:16px;">
      <div class="card-head">
        <div><h2>جدول الطالب</h2><div class="hint">جدول الشعبة ${esc(s.section) || "—"} — يُعرض داخل ملف الطالب من مجلد مسار على OneDrive.</div></div>
        <button class="btn btn-primary" id="student-schedule-open" ${s.section ? "" : "disabled"}>عرض الجدول</button>
      </div>
      <div id="student-schedule-result"></div>
    </div>

    <div class="topbar" style="margin-top:22px;">
      <div><h1 style="font-size:17px;">المسار الأكاديمي</h1><div class="sub">تاريخ الطالب عبر الفترات الدراسية، من الدرجات والشهادات المستوردة</div></div>
    </div>
    <div id="student-academic-path"></div>
  `;

  container.querySelector("#students-back").addEventListener("click", onBack);
  container.querySelector("#student-edit").addEventListener("click", () => renderStudentEdit(container, s, () => renderDetail(container, id, onBack), () => renderDetail(container, id, onBack)));
  const photoButton = container.querySelector("#student-photo-load");
  const loadDetailPhoto = async (prompt = false, refresh = false) => {
    try {
      const result = await hydrateStudentPhotos(container, [s], { prompt, refresh });
      if (result.count) photoButton.textContent = "تحديث الصورة";
      else if (prompt && result.connected) notify("لم أجد صورة باسم الرقم الأكاديمي أو الشخصي لهذا الطالب داخل مجلد مسار.");
      return result;
    } catch (error) {
      if (prompt) notify(error.message || "تعذّر عرض صورة الطالب");
      return { connected: false, count: 0 };
    }
  };
  photoButton.addEventListener("click", () => loadDetailPhoto(true, true));
  void loadDetailPhoto(false, false);

  const scheduleButton = container.querySelector("#student-schedule-open");
  const scheduleResult = container.querySelector("#student-schedule-result");
  let disposeSchedule = null;
  const showSchedulePreview = async (match) => {
    disposeSchedule?.();
    disposeSchedule = mountScheduleViewer(scheduleResult, match.handle, {
      studentName: s.name,
      section: s.section,
      onClose: () => { scheduleButton.textContent = "عرض الجدول"; },
    });
    scheduleButton.textContent = "تحديث الجدول";
  };
  scheduleButton.addEventListener("click", async () => {
    scheduleButton.disabled = true;
    disposeSchedule?.();
    scheduleResult.innerHTML = '<p class="hint">جارٍ البحث في مجلد مسار…</p>';
    try {
      const result = await findStudentScheduleFiles(s, { prompt: true, refresh: true });
      if (!result.connected) {
        scheduleResult.innerHTML = '<p class="hint" style="color:var(--critical);">تعذّر الوصول للمجلد. افتح التطبيق في Chrome أو Edge ثم اربط مجلد مسار.</p>';
      } else if (!result.matches.length) {
        scheduleResult.innerHTML = `<p class="hint" style="color:var(--critical);">لم أجد ملف PDF باسم الشعبة «${esc(s.section)}». تأكد أن الملف موجود داخل مجلد مسار أو أحد مجلداته الفرعية.</p>`;
      } else if (result.matches.length === 1) {
        await showSchedulePreview(result.matches[0]);
      } else {
        scheduleResult.innerHTML = `<p class="hint">وُجد أكثر من ملف مطابق؛ اختر المطلوب:</p><div class="forms-actions">${result.matches.map((file, index) => `<button class="btn btn-ghost" data-schedule-index="${index}">${esc(file.relativePath)}</button>`).join("")}</div>`;
        scheduleResult.querySelectorAll("[data-schedule-index]").forEach((button) => button.addEventListener("click", () => showSchedulePreview(result.matches[Number(button.dataset.scheduleIndex)])));
      }
    } catch (error) {
      scheduleResult.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(error.message || "تعذّر فتح جدول الطالب")}</p>`;
    } finally {
      scheduleButton.disabled = false;
    }
  });

  await renderAcademicPath(container.querySelector("#student-academic-path"), s);
}

export async function mountStudentsView(container, { onGoto } = {}) {
  const status = await getRosterStatus();
  if (!status.available) {
    const profile = getCurrentProfile();
    renderEmptyState(container, { isAdmin: profile?.role === "admin" || profile?.is_admin === true, onGoto });
    return;
  }

  let state = { query: "", level: "", department: "", track: "", section: "", printTitle: "", printInstructions: "" };

  container.innerHTML = `
    <div class="topbar">
      <div><h1>سجل الطلبة</h1><div class="sub">من كشف الطلاب الفعلي</div></div>
    </div>
    <div class="grid g4" style="margin-bottom:16px;" id="students-stats"></div>
    <div id="students-filters"></div>
    <div id="students-results"></div>
  `;

  const { stats, options } = await getRosterMeta();
  const byLevelTrack = await getLevelTrackBreakdown();
  container.querySelector("#students-stats").innerHTML = `
    <div class="card stat"><div class="label">إجمالي الطلبة</div><div class="value">${stats.total}</div></div>
    ${STUDENT_LEVEL_ORDER.map((level) => `
      <div class="card stat"><div class="label">المستوى ${esc(level)}</div><div class="value">${Number(stats.byLevel[level] || 0)}</div><div class="hint">صناعي: ${Number(byLevelTrack[level]?.الصناعي || 0)} · تجاري: ${Number(byLevelTrack[level]?.التجاري || 0)}</div></div>
    `).join("")}
  `;

  const resultsRoot = container.querySelector("#students-results");

  let loadedResults = [];
  let matchingTotal = 0;
  let requestVersion = 0;
  let searchTimer = null;

  const draw = () => {
    container.querySelector("#students-count").textContent = `النتيجة: ${matchingTotal} طالبًا من أصل ${stats.total}`;
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
    void hydrateStudentPhotos(resultsRoot, loadedResults, { prompt: false }).catch(() => {});
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
    renderFilters(container.querySelector("#students-filters"), options, state, onChange, onQueryChange, onSectionChange, onPrintSection, onPrintSettingsChange, onLoadPhotos);
    await refresh();
  };

  const onQueryChange = async (query) => {
    state = { ...state, query };
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refresh, 250);
  };

  const onSectionChange = (section) => {
    state = { ...state, section };
    const printButton = container.querySelector("#students-print-section");
    if (printButton) printButton.disabled = !section.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refresh, 250);
  };

  const onPrintSettingsChange = (changes) => { state = { ...state, ...changes }; };

  const onLoadPhotos = async () => {
    const button = container.querySelector("#students-load-photos");
    if (button) { button.disabled = true; button.textContent = "جارٍ البحث عن الصور…"; }
    try {
      const result = await hydrateStudentPhotos(resultsRoot, loadedResults, { prompt: true, refresh: true });
      if (!result.connected) notify("ربط الصور يحتاج فتح التطبيق في Chrome أو Edge.");
      else if (!result.count) notify("لم أجد صورًا بأسماء الأرقام الأكاديمية أو الشخصية للطلبة الظاهرين.");
      else if (button) button.textContent = `تم عرض ${result.count} صورة`;
    } catch (error) {
      notify(error.message || "تعذّر عرض صور الطلاب");
    } finally {
      if (button) button.disabled = false;
    }
  };

  const onPrintSection = async () => {
    const section = state.section.trim();
    if (!section) return;
    const popup = window.open("", "_blank");
    if (!popup) {
      notify("اسمح بفتح النافذة المنبثقة لطباعة كشف الشعبة.");
      return;
    }
    try {
      const students = await listStudentsForSection(section);
      if (!students.length) {
        popup.close();
        notify("لم يتم العثور على طلبة في هذه الشعبة.");
        return;
      }
      printSectionRoster(students, section, popup, { title: state.printTitle, instructions: state.printInstructions });
    } catch (error) {
      popup.close();
      notify(error.message || "تعذّرت طباعة كشف الشعبة.");
    }
  };

  renderFilters(container.querySelector("#students-filters"), options, state, onChange, onQueryChange, onSectionChange, onPrintSection, onPrintSettingsChange, onLoadPhotos);
  await refresh();
}
