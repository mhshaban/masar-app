import { getRosterStatus, getFilterOptions, searchStudents, getRosterStats, getStudent, updateStudentPhoto, removeStudentPhoto } from "./students-service.js";
import { renderAcademicPath } from "../grades/academic-path-ui.js";
import { getPendingSubjectsForStudent } from "../promoted/promoted-service.js";
import { getStudentSchedule, getOfficeHoursForTeachers, DAY_NAMES, SESSION_NAMES } from "../schedule/schedule-service.js";

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

function renderEmptyState(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>سجل الطلبة</h1><div class="sub">لا يوجد كشف طلاب محلي بعد</div></div>
    </div>
    <div class="card">
      <div class="empty">
        لم يُعثر على ملف <code>data/students.local.json</code>. هذا الملف محلي فقط (لا يُدفع إلى git لحساسية بيانات الطلبة)
        — ضعه داخل مجلد <code>masar-app/data/</code> في نسختك المحلية ثم أعد تحميل الصفحة.
      </div>
    </div>
  `;
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

async function renderDetailedSchedule(root, section) {
  const rows = await getStudentSchedule(section);
  if (!rows.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا يوجد جدول دراسي تفصيلي مستورَد بعد لهذه الشعبة — استورده من شاشة "الطلاب المرفعين"</div></div>';
    return;
  }

  const teachers = [...new Set(rows.map((r) => r.teacher).filter(Boolean))];
  const officeHours = await getOfficeHoursForTeachers(teachers);
  const officeByTeacher = new Map(officeHours.map((o) => [o.teacher, o]));

  const byDay = new Map();
  for (const r of rows) {
    if (!byDay.has(r.day)) byDay.set(r.day, []);
    byDay.get(r.day).push(r);
  }

  root.innerHTML = `
    <div class="grid g2">
      <div class="card">
        <h3>الجدول الدراسي التفصيلي</h3>
        ${[...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, dayRows]) => `
          <div style="margin-bottom:10px;">
            <div class="hint" style="font-weight:700; margin-bottom:4px;">${esc(DAY_NAMES[day] || day)}</div>
            <ul class="plain">
              ${dayRows.map((r) => `
                <li class="row-item">
                  <div class="body">
                    <div class="title">${esc(r.subjectCode) || "—"} ${r.room ? `· ${esc(r.room)}` : ""}</div>
                    <div class="meta">${esc(r.teacher) || "—"}${r.session ? ` · ${esc(SESSION_NAMES[r.session] || "")}` : ""}</div>
                  </div>
                </li>
              `).join("")}
            </ul>
          </div>
        `).join("")}
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

    <div class="grid g2" style="margin-top:16px;">
      <div class="card">
        <h3>جدول أيام التنقل</h3>
        <ul class="plain">
          ${scheduleRow("الأحد", s.weekSchedule?.sunday)}
          ${scheduleRow("الاثنين", s.weekSchedule?.monday)}
          ${scheduleRow("الثلاثاء", s.weekSchedule?.tuesday)}
          ${scheduleRow("الأربعاء", s.weekSchedule?.wednesday)}
          ${scheduleRow("الخميس", s.weekSchedule?.thursday)}
        </ul>
      </div>
      <div class="card">
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

  await renderDetailedSchedule(container.querySelector("#student-detailed-schedule"), s.section);
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
    </div>
    <div class="grid g4" style="margin-bottom:16px;" id="students-stats"></div>
    <div id="students-filters"></div>
    <div id="students-results"></div>
  `;

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
