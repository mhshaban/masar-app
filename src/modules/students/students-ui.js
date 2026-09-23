import { scheduleFromClassScheduleRecords, renderScheduleTable } from "./student-schedule-parser.js?v=2026-09-23-class-schedules-2";
import { notify } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { STUDENT_LEVEL_ORDER, getRosterStatus, getRosterMeta, getLevelTrackBreakdown, searchStudentsPage, listStudentsForSection, getStudent, updateStudent } from "./students-service.js?v=2026-09-06-student-experience-1";
import { renderAcademicPath } from "../grades/academic-path-ui.js?v=2026-09-23-card-reorder-1";
import { getPendingSubjectsForStudent } from "../promoted/promoted-service.js?v=2026-09-07-academic-fix-1";
import { parseStudentsWorkbook, commitStudentsImport } from "../../services/students-import-service.js?v=2026-09-16-prep-school-results-1";
import { getCurrentProfile } from "../../services/auth-service.js";
import { findStudentScheduleFiles, openScheduleFile } from "./student-schedule-local.js?v=2026-09-07-finish-1";
import { findStudentPhotoFiles, studentPhotoObjectUrl } from "./student-photo-local.js?v=2026-09-06-polish-1";
import { listWhere } from "../../services/cloud-runtime.js";
import { getStudentAcademicSummary, getStudentTermTimeline } from "../grades/term-progress-service.js?v=2026-09-08-academic-1";
import { ratingForPct, RATING_LABELS } from "../grades/achievement-service.js?v=2026-09-22-prep-rating-1";
import { listCasesForStudent, listSessions as listCaseSessions } from "../cases/guidance-service.js?v=2026-09-14-cumulative-average-fix-1";
import { listPlansForStudent, listActions as listPlanActions } from "../support/support-service.js?v=2026-09-14-cumulative-average-fix-1";
import { getStudentSessions as getCareerSessionsForStudent } from "../career/career-service.js";
import { listFormsForStudent } from "../forms/forms-service.js?v=2026-09-08-form-fields-1";
import { buildStudentProfileReportHtml } from "../../services/report-builders.js?v=2026-09-17-attendance-checkbox-1";
import { downloadAsWordDoc } from "../../services/word-export.js?v=2026-09-13-landscape-export-1";

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
  popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(documentTitle)}</title><style>@page{size:A4 portrait;margin:8mm}html,body{margin:0;padding:0}#roster-page{width:194mm;display:flow-root;margin:0 auto;overflow-wrap:anywhere}body{font-family:Cairo,"Segoe UI",Tahoma,Arial,sans-serif;color:#111}h1{text-align:center;font-size:17pt;margin:0 0 3mm}.info{display:flex;gap:8mm;flex-wrap:wrap;font-size:10pt;font-weight:700;margin:0 0 3mm}.instructions{border:1px solid #999;padding:2.5mm;min-height:8mm;margin:0 0 4mm;font-size:10pt;white-space:pre-wrap}.meta{font-size:8pt;color:#555;margin-top:3mm}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt}thead{display:table-header-group}th,td{border:1px solid #777;padding:1mm;text-align:center;vertical-align:middle}th{background:#eee;font-weight:800}tr{break-inside:avoid;height:6.5mm}.seq{width:4%}.academic{width:12%}.student{width:24%;text-align:right}.phone{width:11%;direction:ltr}.sign{width:23%}</style></head><body><main id="roster-page"><h1>${esc(documentTitle)}</h1><div class="info"><span>اسم الشعبة: ${esc(section)}</span><span>مرشد الشعبة: ${esc(counselor.name) || "—"}</span><span>قسم المرشد: ${esc(counselor.department) || "—"}</span><span>عدد الطلبة: ${students.length}</span></div>${instructions.trim() ? `<div class="instructions"><strong>التعليمات:</strong> ${esc(instructions)}</div>` : ""}<table><thead><tr><th class="seq">م</th><th class="academic">الرقم الأكاديمي</th><th class="student">اسم الطالب</th><th class="phone">رقم التواصل ١</th><th class="phone">رقم التواصل ٢</th><th class="phone">رقم التواصل ٣</th><th class="sign">التوقيع بالاستلام / بالعلم / الملاحظات</th></tr></thead><tbody>${students.map((student, index) => { const phones = (student.phones || []).slice(0, 3); return `<tr><td>${index + 1}</td><td class="phone">${esc(student.academicId || student.id)}</td><td class="student">${esc(student.name)}</td><td class="phone">${esc(phones[0] || "")}</td><td class="phone">${esc(phones[1] || "")}</td><td class="phone">${esc(phones[2] || "")}</td><td></td></tr>`; }).join("")}</tbody></table><div class="meta">قسم الإرشاد الأكاديمي والتوجيه المهني · تاريخ الطباعة: ${esc(generatedAt)}</div></main></body></html>`);
  popup.document.close();
  // Measure the entire roster, including long instructions, before opening print.
  // Scale the complete content without removing rows or clipping signatures.
  const fitPage = () => {
    if (popup.closed) return;
    const page = popup.document.getElementById("roster-page");
    page.style.zoom = "1";
    const ruler = popup.document.createElement("div");
    ruler.style.cssText = "position:absolute;visibility:hidden;height:277mm;width:194mm";
    popup.document.body.appendChild(ruler);
    const scale = Math.min(1, ruler.getBoundingClientRect().height / Math.max(page.scrollHeight, page.getBoundingClientRect().height), ruler.getBoundingClientRect().width / page.scrollWidth);
    ruler.remove();
    page.style.zoom = String(scale * 0.995);
  };
  popup.addEventListener("beforeprint", fitPage);
  void popup.document.fonts.ready.then(() => {
    if (popup.closed) return;
    popup.requestAnimationFrame(() => { if (!popup.closed) { fitPage(); popup.focus(); popup.print(); } });
  });
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

function tierPill(tier) {
  if (tier === "high") return "pill-success";
  if (tier === "medium") return "pill-warning";
  return "pill-critical";
}

// تقدير معدل المرحلة الإعدادية بنفس سلّم "تصنيف الطلاب" المعتمد (شاشة
// الدرجات والتحليلات) — الوحيد المتاح فعليًا للمستجدين (المستوى الأول) قبل
// ما تتوفر لهم درجات مسار خاصة بهم.
function prepRatingBadge(student) {
  const average = student.prepSchoolResults?.average;
  if (average == null) return '<span class="hint">—</span>';
  const rating = ratingForPct(Number(average));
  return `<span class="pill ${tierPill(rating.tier)}">${esc(rating.label)}</span>`;
}

// loadedStudents: كل ما جُلب من الخادم حتى الآن (يحكم زر "تحميل المزيد").
// displayStudents: الجزء المعروض فعليًا بالجدول بعد تصفية التقدير الاختيارية
// (تصفية من جانب المتصفح فقط، على المحمَّل حاليًا — لا استعلام خادم جديد).
function renderTable(root, loadedStudents, displayStudents, total, onOpen, onLoadMore) {
  if (!loadedStudents.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا يوجد طلاب مطابقون لهذا البحث</div></div>';
    return;
  }
  if (!displayStudents.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا يوجد طلاب مطابقون لهذا التقدير ضمن المحمَّلين حاليًا — جرّب تحميل المزيد أو تغيير التصفية</div></div>';
    return;
  }
  const remaining = total - loadedStudents.length;
  root.innerHTML = `
    <div class="card">
      <div class="tablewrap"><table>
        <thead><tr><th>الطالب</th><th>المستوى</th><th>الشعبة</th><th>القسم</th><th>المسار</th><th>المرشد</th><th>تقدير الإعدادية</th></tr></thead>
        <tbody>
          ${displayStudents.map((s) => `
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
              <td>${prepRatingBadge(s)}</td>
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

const RELATED_CASE_STATUS_LABELS = { open: "مفتوحة", monitoring: "قيد المتابعة", closed: "مُغلقة" };
const RELATED_PLAN_STATUS_LABELS = { active: "نشطة", completed: "مكتملة", cancelled: "مُلغاة" };
const RELATED_FORM_STATUS_LABELS = { pending: "بانتظار الإجراء", in_progress: "قيد الإجراء", completed: "مكتملة", rejected: "مرفوضة" };

async function renderDetail(container, id, onBack, onGoto) {
  const s = await getStudent(id);
  if (!s) {
    container.innerHTML = '<div class="card"><div class="empty">تعذّر إيجاد بيانات هذا الطالب</div></div>';
    return;
  }

  const hasGuidanceFlags = s.supportNeeded || s.socialGuidance;
  const [promotedSubjects, relatedCases, relatedPlans, careerSessions, relatedForms] = await Promise.all([
    getPendingSubjectsForStudent(String(s.academicId || s.id)),
    listCasesForStudent(s.id),
    listPlansForStudent(s.id),
    getCareerSessionsForStudent(s.id),
    listFormsForStudent(s.id),
  ]);
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
      <div class="forms-actions"><button class="btn btn-ghost" id="student-photo-load">عرض الصورة</button><button class="btn btn-ghost" id="student-profile-export">تصدير ملف الطالب (Word)</button><button class="btn btn-primary" id="student-edit">تعديل بيانات الطالب</button></div>
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
      <h2>السجلات المرتبطة</h2>
      <div class="grid g2">
        <div>
          <div class="card-head"><h3 style="margin:0;font-size:14px;">الحالات الإرشادية (${relatedCases.length})</h3>${onGoto ? `<button class="link-btn" data-related="cases">فتح</button>` : ""}</div>
          ${relatedCases.length ? `<ul class="plain">${relatedCases.slice(0, 3).map((c) => `<li class="row-item"${onGoto ? ` data-related-case="${esc(c.id)}" style="cursor:pointer;"` : ""}><div class="body"><div class="title">${esc(c.title) || esc(c.category)}</div><div class="meta">${esc(RELATED_CASE_STATUS_LABELS[c.status] || c.status)} · فُتحت ${esc(c.openedDate) || "—"}</div></div></li>`).join("")}</ul>` : '<p class="hint">لا توجد حالات إرشادية.</p>'}
        </div>
        <div>
          <div class="card-head"><h3 style="margin:0;font-size:14px;">خطط الدعم (${relatedPlans.length})</h3>${onGoto ? `<button class="link-btn" data-related="support">فتح</button>` : ""}</div>
          ${relatedPlans.length ? `<ul class="plain">${relatedPlans.slice(0, 3).map((p) => `<li class="row-item"${onGoto ? ` data-related-plan="${esc(p.id)}" style="cursor:pointer;"` : ""}><div class="body"><div class="title">${esc(p.domain) || "بلا مجال محدد"}</div><div class="meta">${esc(RELATED_PLAN_STATUS_LABELS[p.status] || p.status)} · بدأت ${esc(p.startDate) || "—"}</div></div></li>`).join("")}</ul>` : '<p class="hint">لا توجد خطط دعم.</p>'}
        </div>
        <div>
          <div class="card-head"><h3 style="margin:0;font-size:14px;">التوجيه المهني (${careerSessions.length})</h3>${onGoto ? `<button class="link-btn" data-related="career">فتح</button>` : ""}</div>
          ${careerSessions.length ? `<p class="hint">آخر جلسة: ${esc(careerSessions[0]?.date) || "—"}${careerSessions[0]?.recommendation ? ` · التوصية: ${esc(careerSessions[0].recommendation)}` : ""}</p>` : '<p class="hint">لا توجد جلسات توجيه مهني.</p>'}
        </div>
        <div>
          <div class="card-head"><h3 style="margin:0;font-size:14px;">الاستمارات (${relatedForms.length})</h3></div>
          ${relatedForms.length ? `<ul class="plain">${relatedForms.slice(0, 3).map((f) => `<li class="row-item"${onGoto ? ` data-related-form="${esc(f.id)}" style="cursor:pointer;"` : ""}><div class="body"><div class="title">${esc(f.title) || "—"}</div><div class="meta">${esc(RELATED_FORM_STATUS_LABELS[f.status] || f.status) || "—"} · ${esc(f.createdDate) || "—"}</div></div></li>`).join("")}</ul>` : '<p class="hint">لا توجد استمارات.</p>'}
        </div>
      </div>
    </div>

    ${s.prepSchoolResults ? `
    <div class="card" style="margin-top:16px;">
      <h2>نتائج المرحلة الإعدادية</h2>
      <div class="tablewrap"><table>
        <tbody>
          <tr><td>المدرسة الإعدادية</td><td>${esc(s.prepSchoolResults.school) || "—"}</td></tr>
          <tr><td>العلوم</td><td class="num">${esc(s.prepSchoolResults.science ?? "") || "—"}</td></tr>
          <tr><td>الرياضيات</td><td class="num">${esc(s.prepSchoolResults.math ?? "") || "—"}</td></tr>
          <tr><td>اللغة العربية</td><td class="num">${esc(s.prepSchoolResults.arabic ?? "") || "—"}</td></tr>
          <tr><td>اللغة الإنجليزية</td><td class="num">${esc(s.prepSchoolResults.english ?? "") || "—"}</td></tr>
          <tr><td>المعدل</td><td class="num" style="font-weight:700;">${s.prepSchoolResults.average == null ? "—" : `${esc(s.prepSchoolResults.average)}٪`}</td></tr>
        </tbody>
      </table></div>
    </div>
    ` : ""}

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
        <div><h2>جدول الطالب</h2><div class="hint">جدول الشعبة ${esc(s.section) || "—"}</div></div>
        <button class="btn btn-ghost" id="student-schedule-open-original" ${s.section ? "" : "disabled"}>فتح الجدول الأصلي (PDF)</button>
      </div>
      <div id="student-schedule-table"></div>
      <p class="hint" id="student-schedule-original-status" role="status"></p>
      <div id="student-schedule-originals"></div>
    </div>

    <div class="topbar" style="margin-top:22px;">
      <div><h1 style="font-size:17px;">المسار الأكاديمي</h1><div class="sub">تاريخ الطالب عبر الفترات الدراسية، من الدرجات والشهادات المستوردة</div></div>
    </div>
    <div id="student-academic-path"></div>
  `;

  container.querySelector("#students-back").addEventListener("click", onBack);
  container.querySelector("#student-edit").addEventListener("click", () => renderStudentEdit(container, s, () => renderDetail(container, id, onBack, onGoto), () => renderDetail(container, id, onBack, onGoto)));
  if (onGoto) {
    container.querySelectorAll("[data-related]").forEach((btn) => btn.addEventListener("click", () => onGoto(btn.dataset.related, { studentId: s.id })));
    container.querySelectorAll("[data-related-case]").forEach((row) => row.addEventListener("click", () => onGoto("cases", { caseId: row.dataset.relatedCase })));
    container.querySelectorAll("[data-related-plan]").forEach((row) => row.addEventListener("click", () => onGoto("support", { planId: row.dataset.relatedPlan })));
    container.querySelectorAll("[data-related-form]").forEach((row) => row.addEventListener("click", () => onGoto("forms", { formId: row.dataset.relatedForm })));
  }
  container.querySelector("#student-profile-export").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const [academicSummary, termTimeline, cases, supportPlans, careerSessions, forms] = await Promise.all([
        getStudentAcademicSummary(s),
        getStudentTermTimeline(String(s.academicId || s.id)),
        listCasesForStudent(s.id),
        listPlansForStudent(s.id),
        getCareerSessionsForStudent(s.id),
        listFormsForStudent(s.id),
      ]);
      const [casesWithSessions, plansWithActions] = await Promise.all([
        Promise.all(cases.map(async (c) => ({ ...c, sessions: await listCaseSessions(c.id) }))),
        Promise.all(supportPlans.map(async (p) => ({ ...p, actions: await listPlanActions(p.id) }))),
      ]);
      const html = buildStudentProfileReportHtml({
        student: s, academicSummary, termTimeline,
        cases: casesWithSessions, supportPlans: plansWithActions, careerSessions,
        pendingSubjects, forms,
      }, new Date().toLocaleString("ar-BH"));
      downloadAsWordDoc(`ملف الطالب — ${s.name || s.id}`, html, `ملف-الطالب-${s.academicId || s.id}`);
    } catch (error) {
      notify(error.message || "تعذّر تصدير ملف الطالب");
    } finally {
      button.disabled = false;
    }
  });
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

  const scheduleTableRoot = container.querySelector("#student-schedule-table");
  if (s.section) {
    listWhere("classSchedules", "section", s.section).then((records) => {
      const schedule = scheduleFromClassScheduleRecords(records, s.section);
      scheduleTableRoot.innerHTML = schedule
        ? renderScheduleTable(schedule)
        : '<p class="hint">لا يوجد جدول حصص مستورَد لهذه الشعبة بعد.</p>';
    });
  } else {
    scheduleTableRoot.innerHTML = '<p class="hint">لا شعبة مسجَّلة لهذا الطالب.</p>';
  }

  // "فتح الجدول الأصلي (PDF)" الاستثناء الوحيد الباقي لمجلد "مسار" المحلي
  // بملف الطالب — فتح/طباعة نسخة PDF الرسمية نفسها فقط، لا بياناتها (الجدول
  // أعلاه كافٍ للبيانات، مستورَد من ملف كشف الطلاب).
  const originalButton = container.querySelector("#student-schedule-open-original");
  const originalStatus = container.querySelector("#student-schedule-original-status");
  const originalsRoot = container.querySelector("#student-schedule-originals");
  originalButton.addEventListener("click", async () => {
    originalButton.disabled = true;
    originalsRoot.innerHTML = "";
    originalStatus.textContent = "جارٍ البحث في مجلد مسار…";
    try {
      const result = await findStudentScheduleFiles(s, { prompt: true, refresh: true });
      if (!result.connected) {
        originalStatus.textContent = "تعذّر الوصول للمجلد. افتح التطبيق في Chrome أو Edge ثم اربط مجلد مسار.";
      } else if (!result.matches.length) {
        originalStatus.textContent = `لم أجد ملف PDF باسم الشعبة «${s.section}». تأكد أن الملف موجود داخل مجلد مسار أو أحد مجلداته الفرعية.`;
      } else if (result.matches.length === 1) {
        await openScheduleFile(result.matches[0].handle);
        originalStatus.textContent = "";
      } else {
        originalStatus.textContent = "وُجد أكثر من ملف مطابق؛ اختر المطلوب:";
        originalsRoot.innerHTML = `<div class="forms-actions">${result.matches.map((file, index) => `<button class="btn btn-ghost" data-schedule-index="${index}">${esc(file.relativePath)}</button>`).join("")}</div>`;
        originalsRoot.querySelectorAll("[data-schedule-index]").forEach((button) => button.addEventListener("click", () => openScheduleFile(result.matches[Number(button.dataset.scheduleIndex)].handle)));
      }
    } catch (error) {
      originalStatus.textContent = error.message || "تعذّر فتح جدول الطالب";
    } finally {
      originalButton.disabled = false;
    }
  });

  await renderAcademicPath(container.querySelector("#student-academic-path"), s);
}

// options.studentId يفتح ملف طالب محدَّد مباشرة (قادم من رابط "فتح ملف
// الطالب" بشاشات الحالات/الدعم/التوجيه المهني/الاستمارات) بدل هبوط المرشد
// على سجل الطلبة كاملًا ليعيد البحث عن نفس الطالب من جديد.
export async function mountStudentsView(container, { onGoto, studentId } = {}) {
  if (studentId) {
    await renderDetail(container, studentId, () => mountStudentsView(container, { onGoto }), onGoto);
    return;
  }

  const status = await getRosterStatus();
  if (!status.available) {
    const profile = getCurrentProfile();
    renderEmptyState(container, { isAdmin: profile?.role === "admin" || profile?.is_admin === true, onGoto });
    return;
  }

  let state = { query: "", level: "", department: "", track: "", section: "", printTitle: "", printInstructions: "" };

  container.innerHTML = `
    <div class="topbar">
      <div><h1>سجل الطلبة</h1></div>
    </div>
    <div class="grid g4" style="margin-bottom:16px;" id="students-stats"></div>
    <div id="students-filters"></div>
    <div id="students-rating-chips" style="margin-bottom:16px;"></div>
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
  let ratingFilter = "";

  const ratingChipsRoot = container.querySelector("#students-rating-chips");

  const drawRatingChips = () => {
    const rated = loadedResults.filter((s) => s.prepSchoolResults?.average != null);
    if (!rated.length) { ratingChipsRoot.innerHTML = ""; ratingFilter = ""; return; }
    const counts = {};
    for (const s of rated) {
      const label = ratingForPct(Number(s.prepSchoolResults.average)).label;
      counts[label] = (counts[label] || 0) + 1;
    }
    ratingChipsRoot.innerHTML = `
      <div class="hint" style="margin-bottom:6px;">تصنيف حسب معدل المرحلة الإعدادية (من الطلبة المحمَّلين حاليًا):</div>
      <div class="chip-row" id="students-rating-chip-row">
        <div class="chip${!ratingFilter ? " on" : ""}" data-rating="">الكل (${loadedResults.length})</div>
        ${RATING_LABELS.map((label) => `<div class="chip${ratingFilter === label ? " on" : ""}" data-rating="${esc(label)}">${esc(label)} (${counts[label] || 0})</div>`).join("")}
      </div>
    `;
    ratingChipsRoot.querySelectorAll("[data-rating]").forEach((chip) => {
      chip.addEventListener("click", () => { ratingFilter = chip.dataset.rating; draw(); });
    });
  };

  const draw = () => {
    drawRatingChips();
    const displayResults = ratingFilter
      ? loadedResults.filter((s) => s.prepSchoolResults?.average != null && ratingForPct(Number(s.prepSchoolResults.average)).label === ratingFilter)
      : loadedResults;
    container.querySelector("#students-count").textContent = ratingFilter
      ? `يعرض ${displayResults.length} من أصل ${loadedResults.length} محمَّلين بهذا التقدير — إجمالي المطابقين للبحث: ${matchingTotal}`
      : `النتيجة: ${matchingTotal} طالبًا من أصل ${stats.total}`;
    renderTable(
      resultsRoot,
      loadedResults,
      displayResults,
      matchingTotal,
      (id) => renderDetail(container, id, () => mountStudentsView(container, { onGoto }), onGoto),
      async () => {
        const page = await searchStudentsPage({ ...state, offset: loadedResults.length, limit: PAGE_SIZE });
        loadedResults.push(...page.rows);
        matchingTotal = page.total;
        draw();
      },
    );
    void hydrateStudentPhotos(resultsRoot, displayResults, { prompt: false }).catch(() => {});
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
