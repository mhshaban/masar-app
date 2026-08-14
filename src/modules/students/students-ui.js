import { getRosterStatus, getFilterOptions, searchStudents, getRosterStats, getStudent, updateStudentPhoto, removeStudentPhoto } from "./students-service.js";
import { renderAcademicPath } from "../grades/academic-path-ui.js";
import { getPendingSubjectsForStudent } from "../promoted/promoted-service.js";
import { getStudentSchedule, getOfficeHoursForTeachers, DAY_NAMES } from "../schedule/schedule-service.js";
import { parseStudentsWorkbook, commitStudentsImport } from "../../services/students-import-service.js";
import { matchPhotoFiles, commitPhotoMatches } from "../../services/photos-import-service.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0] || "").join("");
}

const PHOTO_MAX_DIMENSION = 300;

// No source file has student photos (checked — no photo column, no embedded
// images), so this is a manual upload. Resized client-side before storing
// so a phone-camera photo doesn't bloat the shared database with a
// multi-megabyte original for a 64px avatar.
function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = () => reject(reader.error);
    img.onload = () => {
      const scale = Math.min(1, PHOTO_MAX_DIMENSION / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("تعذّرت قراءة الصورة"));
    reader.readAsDataURL(file);
  });
}

// يستورد شيت "كشف الطلاب" من نفس ملف كشف الطلاب الكامل المستخدم لبقية
// الاستيرادات — عبر cloud-runtime.js، خلف تسجيل الدخول + RLS، بدل ملف ثابت
// بالمستودع العام (كان يعني أي زائر يقدر يجلب بيانات الطلبة مباشرة).
function renderImportSection(root, { onImported, isUpdate }) {
  root.innerHTML = `
    <div class="card">
      <h3>${isUpdate ? "تحديث سجل الطلبة" : "استيراد سجل الطلبة"}</h3>
      <p class="hint">ارفع ملف كشف الطلاب الكامل (شيت "كشف الطلاب") — يستبدل السجل الحالي بالكامل بمحتوى الملف.</p>
      <input type="file" id="students-import-file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="margin-bottom:12px;">
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

// استيراد دفعة صور دفعة واحدة (بدل رفع صورة صورة من صفحة كل طالب) — الملفات
// يجب أن تكون مسمّاة بالرقم الأكاديمي للطالب. يعرض تقرير مطابقة أولًا (مين
// انطابق، مين ما انطابق، مين له أكثر من ملف) قبل أي كتابة فعلية، ويحفظ على
// دفعات صغيرة (بدل الكل دفعة وحدة) عشان لا يعلّق المتصفح مع مئات الصور —
// نفس درس أزمة رفع شهادات PDF الكبيرة سابقًا.
const PHOTO_COMMIT_BATCH = 40;

function renderPhotoImportSection(root, { onImported }) {
  root.innerHTML = `
    <div class="card">
      <h3>استيراد صور الطلبة</h3>
      <p class="hint">اختر كل ملفات الصور دفعة واحدة — لازم يكون اسم كل ملف هو الرقم الأكاديمي للطالب (مثال: 20254220.jpg). تتم المطابقة تلقائيًا ويظهر تقرير قبل الحفظ.</p>
      <input type="file" id="photos-import-input" accept="image/*" multiple style="margin-bottom:12px;">
      <div id="photos-import-preview"></div>
    </div>
  `;

  const fileInput = root.querySelector("#photos-import-input");
  const previewRoot = root.querySelector("#photos-import-preview");

  fileInput.addEventListener("change", async () => {
    const files = [...fileInput.files];
    if (!files.length) return;
    previewRoot.innerHTML = '<p class="hint">جارٍ المطابقة…</p>';

    const { matched, unmatched, duplicates } = await matchPhotoFiles(files);

    previewRoot.innerHTML = `
      <div class="tablewrap"><table>
        <tbody>
          <tr><td>ملفات لها طالب مطابق</td><td class="num">${matched.length}</td></tr>
          <tr><td>ملفات بدون طالب مطابق (تحقق من اسم الملف)</td><td class="num">${unmatched.length}</td></tr>
          <tr><td>طلبة لهم أكثر من ملف بنفس الرقم (يُستخدم أول ملف فقط لكل طالب)</td><td class="num">${duplicates.length}</td></tr>
        </tbody>
      </table></div>
      ${unmatched.length ? `
        <details style="margin-top:10px;">
          <summary class="hint" style="cursor:pointer;">عرض الملفات غير المطابقة (${unmatched.length})</summary>
          <ul class="plain">${unmatched.map((u) => `<li class="row-item"><div class="body"><div class="title">${esc(u.file.name)}</div></div></li>`).join("")}</ul>
        </details>
      ` : ""}
      ${matched.length ? `<button class="btn btn-primary" id="photos-import-commit" style="margin-top:12px;">حفظ ${matched.length} صورة</button>` : ""}
      <div id="photos-import-progress" style="margin-top:10px;"></div>
    `;

    const commitBtn = previewRoot.querySelector("#photos-import-commit");
    if (!commitBtn) return;
    commitBtn.addEventListener("click", async () => {
      commitBtn.disabled = true;
      const progressRoot = previewRoot.querySelector("#photos-import-progress");
      let done = 0;
      let failed = 0;
      for (let i = 0; i < matched.length; i += PHOTO_COMMIT_BATCH) {
        const batch = matched.slice(i, i + PHOTO_COMMIT_BATCH);
        const resolved = [];
        for (const { file, student } of batch) {
          try {
            resolved.push({ student, dataUrl: await resizeImageToDataUrl(file) });
          } catch {
            failed += 1;
          }
        }
        await commitPhotoMatches(resolved);
        done += batch.length;
        progressRoot.innerHTML = `<p class="hint">تم حفظ ${done} من ${matched.length}…</p>`;
      }
      progressRoot.innerHTML = `<p class="hint">تم بنجاح — ${matched.length - failed} صورة محفوظة${failed ? `، تعذّرت قراءة ${failed} ملف` : ""}.</p>`;
      await onImported();
    });
  });
}

function renderEmptyState(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>سجل الطلبة</h1><div class="sub">لا يوجد سجل طلبة مستورَد بعد</div></div>
    </div>
    <div id="students-import-root"></div>
  `;
  renderImportSection(container.querySelector("#students-import-root"), {
    isUpdate: false,
    onImported: () => mountStudentsView(container),
  });
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

function renderTable(root, allResults, visibleCount, onOpen, onLoadMore) {
  if (!allResults.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا يوجد طلاب مطابقون لهذا البحث</div></div>';
    return;
  }
  const students = allResults.slice(0, visibleCount);
  const remaining = allResults.length - students.length;
  root.innerHTML = `
    <div class="card">
      <div class="tablewrap"><table>
        <thead><tr><th>الطالب</th><th>المستوى</th><th>الشعبة</th><th>القسم</th><th>المسار</th><th>المرشد</th></tr></thead>
        <tbody>
          ${students.map((s) => `
            <tr data-id="${esc(s.id)}">
              <td>
                <div style="display:flex; align-items:center; gap:10px;">
                  ${s.photo
                    ? `<img src="${esc(s.photo)}" alt="" style="width:32px; height:32px; border-radius:50%; object-fit:cover; flex:0 0 auto;">`
                    : `<div class="row-item" style="padding:0; border:none;"><div class="avatar">${esc(initials(s.name))}</div></div>`}
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

function scheduleRow(label, value) {
  return `<div class="row-item"><div class="body"><div class="title">${esc(label)}</div></div><span class="pill pill-neutral">${esc(value) || "—"}</span></div>`;
}

// نسخة مختصرة من SESSION_NAMES تطابق تسمية الجدول الرسمي المطبوع
// ("صباحي"/"مسائي") بدل الاسم الكامل المستخدم بلوحة الساعات المكتبية.
const SHORT_SESSION_NAMES = { 1: "صباحي", 2: "مسائي" };
const GRID_DAYS = [1, 2, 3, 4, 5];

// يبني الجدول الأسبوعي بنفس شكل الجدول الرسمي المطبوع اللي يستخدمه المرشد
// فعليًا: الأيام أعمدة، وكل حصة صف من 4 أسطر (المقرر/المعلم/الغرفة/الفترة).
// حقل "الغرفة" هنا هو نفسه اللي كان يُعرض بجدول أيام التنقل المنفصل سابقًا —
// المدرسة تكتب فيه رمز تنقل بدل رقم قاعة بالحصص اللي ما فيها قاعة فعلية، فدمج
// الجدولين بواحد (بدل عرضهما منفصلين) ما يفقد أي معلومة كانت تُعرض قبل.
function scheduleGridTable(rows) {
  const blocks = new Map();
  for (const r of rows) {
    const key = `${r.session ?? 0}-${r.period ?? 0}`;
    if (!blocks.has(key)) blocks.set(key, { session: r.session, period: r.period, byDay: new Map() });
    blocks.get(key).byDay.set(r.day, r);
  }
  const sortedBlocks = [...blocks.values()].sort((a, b) => (a.session - b.session) || (a.period - b.period));

  const labelRow = (label, block, pick) => `
    <tr>
      <td><strong>${esc(label)}</strong></td>
      ${GRID_DAYS.map((d) => `<td>${esc(pick(block.byDay.get(d))) || "—"}</td>`).join("")}
    </tr>
  `;

  return `
    <div class="tablewrap"><table>
      <thead>
        <tr><th>اليوم</th>${GRID_DAYS.map((d) => `<th>${esc(DAY_NAMES[d])}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${sortedBlocks.map((block) => `
          ${labelRow("المقرر", block, (r) => r?.subjectCode)}
          ${labelRow("المعلم", block, (r) => r?.teacher)}
          ${labelRow("الغرفة", block, (r) => r?.room)}
          ${labelRow("الفترة", block, (r) => (r?.session ? SHORT_SESSION_NAMES[r.session] : null))}
        `).join("")}
      </tbody>
    </table></div>
  `;
}

async function renderDetailedSchedule(root, section, weekSchedule) {
  const rows = await getStudentSchedule(section);
  const teachers = [...new Set(rows.map((r) => r.teacher).filter(Boolean))];
  const officeHours = teachers.length ? await getOfficeHoursForTeachers(teachers) : [];
  const officeByTeacher = new Map(officeHours.map((o) => [o.teacher, o]));
  const hasWeekFallback = !rows.length && Object.values(weekSchedule || {}).some(Boolean);

  root.innerHTML = `
    <div class="grid g2">
      <div class="card">
        <h3>الجدول الدراسي الأسبوعي</h3>
        ${rows.length ? scheduleGridTable(rows) : hasWeekFallback ? `
          <ul class="plain">
            ${scheduleRow("الأحد", weekSchedule.sunday)}
            ${scheduleRow("الاثنين", weekSchedule.monday)}
            ${scheduleRow("الثلاثاء", weekSchedule.tuesday)}
            ${scheduleRow("الأربعاء", weekSchedule.wednesday)}
            ${scheduleRow("الخميس", weekSchedule.thursday)}
          </ul>
        ` : '<div class="empty">لا يوجد جدول دراسي مستورَد بعد لهذه الشعبة — استورده من شاشة "الطلاب المرفعين"</div>'}
      </div>
      <div class="card">
        <h3>الساعات المكتبية لمعلمي الطالب</h3>
        ${teachers.length ? `
          <ul class="plain">
            ${teachers.map((t) => {
              const office = officeByTeacher.get(t);
              return `
                <li class="row-item">
                  <div class="body"><div class="title">${esc(t)}</div></div>
                  ${office ? `<span class="pill pill-neutral">${esc(office.day)} — الحصة ${esc(office.period)}</span>` : '<span class="pill pill-neutral">غير مسجَّلة</span>'}
                </li>
              `;
            }).join("")}
          </ul>
        ` : '<div class="empty">لا يوجد معلمون في الجدول التفصيلي بعد</div>'}
      </div>
    </div>
  `;
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
        <div id="student-photo-wrap" style="cursor:pointer; flex:0 0 auto;" title="اضغط لتغيير الصورة">
          ${s.photo
            ? `<img src="${esc(s.photo)}" alt="" style="width:64px; height:64px; border-radius:50%; object-fit:cover; border:1px solid var(--border); display:block;">`
            : `<div style="width:64px; height:64px; border-radius:50%; background:var(--teal-600); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:19px;">${esc(initials(s.name))}</div>`}
          <input type="file" id="student-photo-input" accept="image/*" style="display:none;">
        </div>
        <div>
          <h1>${esc(s.name) || "—"}</h1>
          <div class="sub">${esc(s.level) || "—"} · ${esc(s.section) || "—"} · ${esc(s.department) || "—"} — ${esc(s.track) || "—"}</div>
          ${s.photo ? '<button class="link-btn" id="student-photo-remove" style="color:var(--critical); margin-top:2px;">إزالة الصورة</button>' : ""}
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
        <h3>بيانات الاتصال</h3>
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
        <h3>مرشد الشعبة</h3>
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
      <h3>ملاحظات إضافية</h3>
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

    <div id="student-detailed-schedule" style="margin-top:16px;"></div>

    <div class="topbar" style="margin-top:22px;">
      <div><h1 style="font-size:17px;">المسار الأكاديمي</h1><div class="sub">تاريخ الطالب عبر الفترات الدراسية، من الدرجات والشهادات المستوردة</div></div>
    </div>
    <div id="student-academic-path"></div>
  `;

  container.querySelector("#students-back").addEventListener("click", onBack);

  const photoInput = container.querySelector("#student-photo-input");
  container.querySelector("#student-photo-wrap").addEventListener("click", () => photoInput.click());
  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await updateStudentPhoto(id, dataUrl);
      await renderDetail(container, id, onBack);
    } catch (err) {
      alert(err.message);
    }
  });
  const removeBtn = container.querySelector("#student-photo-remove");
  if (removeBtn) {
    removeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("إزالة صورة هذا الطالب؟")) return;
      await removeStudentPhoto(id);
      await renderDetail(container, id, onBack);
    });
  }

  await renderDetailedSchedule(container.querySelector("#student-detailed-schedule"), s.section, s.weekSchedule);
  await renderAcademicPath(container.querySelector("#student-academic-path"), String(s.academicId || s.id));
}

export async function mountStudentsView(container) {
  const status = await getRosterStatus();
  if (!status.available) {
    renderEmptyState(container);
    return;
  }

  let state = { query: "", level: "", department: "", track: "" };

  container.innerHTML = `
    <div class="topbar">
      <div><h1>سجل الطلبة</h1><div class="sub">من كشف الطلاب الفعلي — بيانات مشتركة سحابيًا بين الحسابات النشطة، لا تُدفع إلى git</div></div>
      <div class="meta" id="students-count"></div>
      <button class="btn btn-ghost" id="students-toggle-photos" style="margin-inline-start:8px;">استيراد صور الطلبة</button>
      <button class="btn btn-ghost" id="students-toggle-import" style="margin-inline-start:8px;">تحديث سجل الطلبة</button>
    </div>
    <div id="students-photos-root" style="display:none;margin-bottom:16px;"></div>
    <div id="students-import-root" style="display:none;margin-bottom:16px;"></div>
    <div class="grid g4" style="margin-bottom:16px;" id="students-stats"></div>
    <div id="students-filters"></div>
    <div id="students-results"></div>
  `;

  const importRoot = container.querySelector("#students-import-root");
  container.querySelector("#students-toggle-import").addEventListener("click", () => {
    const hidden = importRoot.style.display === "none";
    importRoot.style.display = hidden ? "" : "none";
    if (hidden && !importRoot.dataset.mounted) {
      importRoot.dataset.mounted = "1";
      renderImportSection(importRoot, { isUpdate: true, onImported: () => mountStudentsView(container) });
    }
  });

  const photosRoot = container.querySelector("#students-photos-root");
  container.querySelector("#students-toggle-photos").addEventListener("click", () => {
    const hidden = photosRoot.style.display === "none";
    photosRoot.style.display = hidden ? "" : "none";
    if (hidden && !photosRoot.dataset.mounted) {
      photosRoot.dataset.mounted = "1";
      renderPhotoImportSection(photosRoot, { onImported: () => mountStudentsView(container) });
    }
  });

  const stats = await getRosterStats();
  const topLevels = Object.entries(stats.byLevel);
  container.querySelector("#students-stats").innerHTML = `
    <div class="card stat"><div class="label">إجمالي الطلبة</div><div class="value">${stats.total}</div></div>
    ${topLevels.slice(0, 2).map(([level, n]) => `
      <div class="card stat"><div class="label">مستوى ${esc(level)}</div><div class="value">${n}</div></div>
    `).join("")}
    <div class="card stat"><div class="label">لديهم ملاحظات دعم/إرشاد</div><div class="value">${stats.flagged}</div></div>
  `;

  const options = await getFilterOptions();
  const resultsRoot = container.querySelector("#students-results");
  const countRoot = container.querySelector("#students-count");

  let visibleCount = PAGE_SIZE;
  let lastResults = [];

  const draw = () => {
    countRoot.textContent = `${lastResults.length} من ${stats.total} طالبًا`;
    renderTable(
      resultsRoot,
      lastResults,
      visibleCount,
      (id) => renderDetail(container, id, () => mountStudentsView(container)),
      () => { visibleCount += PAGE_SIZE; draw(); },
    );
  };

  const refresh = async () => {
    lastResults = await searchStudents(state);
    visibleCount = PAGE_SIZE;
    draw();
  };

  const onChange = async (next) => {
    state = next;
    renderFilters(container.querySelector("#students-filters"), options, state, onChange, onQueryChange);
    await refresh();
  };

  const onQueryChange = async (query) => {
    state = { ...state, query };
    await refresh();
  };

  renderFilters(container.querySelector("#students-filters"), options, state, onChange, onQueryChange);
  await refresh();
}
