import { notify, confirmDialog } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { listTeachers } from "./forms-service.js?v=2026-09-08-form-fields-1";
import { printMarkupInPopup } from "./print-popup.js?v=2026-10-12-event-approval-1";
import {
  studentKey, consentOf, consentSummary, approvedStudents, defaultConsentText, consentTextOf,
  listEventFiles, getEventFile, setConsent, saveConsentText, removeEventFile,
} from "./event-file-service.js?v=2026-10-14-event-file-1";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DEPARTMENT = "قسم الإرشاد الأكاديمي والتوجيه المهني";

function dayOf(event) {
  if (event.day) return event.day;
  const parsed = new Date(event.date || "");
  return Number.isNaN(parsed.getTime()) ? "" : new Intl.DateTimeFormat("ar-BH", { timeZone: "Asia/Bahrain", weekday: "long" }).format(parsed);
}

function timeRange({ startTime, endTime }) {
  const fmt = (t) => {
    const [h, m] = String(t || "").split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}` : "";
  };
  return [fmt(startTime), fmt(endTime)].filter(Boolean).join(" — ");
}

// خطاب موافقة لكل طالب بصفحة مستقلة، بقالب الطباعة الموحّد.
function consentLettersMarkup(event, students) {
  const text = consentTextOf(event);
  const when = [dayOf(event), event.date].filter(Boolean).join(" ") || "—";
  return students.map((s) => `<div class="attendance-page"><table class="forms-print consent-print">
    <thead><tr><td>
      <div class="print-dept-line">${DEPARTMENT}</div>
      <div class="topbar"><div><h1>طلب موافقة ولي الأمر</h1></div></div>
    </td></tr></thead>
    <tbody><tr><td>
      <div class="card"><h2>بيانات الطالب</h2>
        <div class="tablewrap"><table>
          <tr><th>اسم الطالب</th><td colspan="3"><strong>${esc(s.name)}</strong></td></tr>
          <tr><th>الرقم الأكاديمي</th><td>${esc(s.academicId || s.id) || "—"}</td><th>الشعبة</th><td>${esc(s.section) || "—"}</td></tr>
        </table></div>
      </div>
      <div class="card"><h2>بيانات الفعالية</h2>
        <div class="tablewrap"><table>
          <tr><th>الفعالية</th><td colspan="3"><strong>${esc(event.title)}</strong></td></tr>
          <tr><th>التاريخ</th><td>${esc(when)}</td><th>الوقت</th><td>${esc(timeRange(event)) || "—"}</td></tr>
          <tr><th>المكان</th><td colspan="3">${esc(event.location) || "—"}</td></tr>
        </table></div>
      </div>
      <div class="card"><h2>ولي الأمر الكريم</h2><p>${esc(text)}</p></div>
      <div class="print-approval form-workflow"><strong>إقرار ولي الأمر</strong><div class="workflow-options">☐ موافق &nbsp;&nbsp; ☐ غير موافق</div><div class="workflow-signatures workflow-signatures-4"><span>الاسم: ................................</span><span>الرقم الشخصي: ................................</span><span>التاريخ: ........ / ........ / ................</span><span>التوقيع: ................................</span></div></div>
    </td></tr></tbody>
  </table></div>`).join("");
}

async function withTeacherPhones(event) {
  const directory = new Map((await listTeachers()).filter((t) => t.name && t.phone).map((t) => [t.name.trim(), String(t.phone).trim()]));
  const teachers = event.teachers || [];
  return { ...event, day: dayOf(event), teachers, teacherPhones: teachers.map((name, i) => event.teacherPhones?.[i] || directory.get(String(name || "").trim()) || "") };
}

async function renderLog(root, nav) {
  const events = await listEventFiles();
  root.innerHTML = `<div class="card">
    <div class="card-head">
      <h2>ملفات الفعاليات (${events.length})</h2>
      <button class="btn btn-primary" id="event-new-btn" type="button">+ ملف فعالية جديد</button>
    </div>
    <p class="hint">لكل فعالية ملف واحد: تختار المرشحين، تطبع خطابات موافقة أولياء الأمور وتسجّل ردودهم، ويتكوّن كشف الحضور تلقائيًا من الموافَق عليهم.</p>
    ${events.length ? `<div class="tablewrap"><table>
      <thead><tr><th>الفعالية</th><th>التاريخ</th><th>المكان</th><th>المرشحون</th><th>الموافقات</th><th></th></tr></thead>
      <tbody>${events.map((e) => {
        const c = consentSummary(e);
        return `<tr>
          <td><strong>${esc(e.title)}</strong></td><td class="num">${esc(e.date) || "—"}</td><td>${esc(e.location) || "—"}</td><td class="num">${c.total}</td>
          <td><span class="pill pill-success">موافق ${c.approved}</span> <span class="pill pill-critical">غير موافق ${c.declined}</span> <span class="pill pill-neutral">بانتظار ${c.pending}</span></td>
          <td><div class="forms-actions"><button class="btn btn-ghost" data-open="${esc(e.id)}" type="button">فتح</button><button class="btn btn-ghost forms-danger" data-remove="${esc(e.id)}" type="button">حذف</button></div></td>
        </tr>`;
      }).join("")}</tbody>
    </table></div>` : '<div class="empty">لا توجد ملفات فعاليات بعد</div>'}
  </div>`;
  root.querySelector("#event-new-btn").addEventListener("click", () => nav.editor(null));
  root.querySelectorAll("[data-open]").forEach((btn) => btn.addEventListener("click", () => nav.detail(btn.dataset.open)));
  root.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!await confirmDialog("حذف ملف الفعالية هذا نهائيًا (مع ردود أولياء الأمور المسجلة)؟")) return;
    await removeEventFile(btn.dataset.remove);
    await nav.log();
  }));
}

async function renderDetail(root, id, nav, printSheet) {
  let event = await getEventFile(id);
  if (!event) { notify("ملف الفعالية غير موجود"); await nav.log(); return; }

  const draw = () => {
    const c = consentSummary(event);
    const approved = approvedStudents(event);
    const teachers = (event.teachers || []).filter(Boolean);
    const responseButtons = (s) => {
      const value = consentOf(event, s);
      return `<div class="consent-toggle" role="group" aria-label="رد ولي الأمر">
        <button type="button" class="consent-btn approve${value === "approved" ? " on" : ""}" data-consent="approved" data-student="${esc(studentKey(s))}" aria-pressed="${value === "approved"}">✓ موافق</button>
        <button type="button" class="consent-btn decline${value === "declined" ? " on" : ""}" data-consent="declined" data-student="${esc(studentKey(s))}" aria-pressed="${value === "declined"}">✗ غير موافق</button>
      </div>`;
    };
    root.innerHTML = `
      <div class="card forms-card">
        <div class="card-head" style="flex-wrap:wrap; gap:10px;">
          <h2>${esc(event.title)}</h2>
          <div class="forms-actions"><button class="btn btn-ghost" type="button" id="event-edit">تعديل البيانات والمرشحين</button><button class="btn btn-ghost" type="button" id="event-back">رجوع للسجل</button></div>
        </div>
        <p class="hint">${esc([dayOf(event), event.date].filter(Boolean).join(" ") || "بلا تاريخ")}${timeRange(event) ? ` · ${esc(timeRange(event))}` : ""}${event.location ? ` · ${esc(event.location)}` : ""}${teachers.length ? ` · المرافقون: ${esc(teachers.join("، "))}` : ""}</p>
      </div>

      <div class="card event-step">
        <div class="card-head"><h2><span class="step-no">١</span> المرشحون (${c.total})</h2><button class="btn btn-ghost" type="button" id="print-candidates">طباعة كشف المرشحين</button></div>
        <p class="hint">لإضافة مرشحين أو حذفهم: "تعديل البيانات والمرشحين". ردود أولياء الأمور المسجلة تبقى كما هي.</p>
      </div>

      <div class="card event-step">
        <div class="card-head" style="flex-wrap:wrap; gap:10px;"><h2><span class="step-no">٢</span> موافقات أولياء الأمور</h2>
          <div class="forms-actions" style="align-items:center;">
            <select id="letters-scope" style="padding:8px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; background:var(--surface); color:inherit;">
              <option value="all">خطابات لكل المرشحين (${c.total})</option>
              <option value="pending">لمن لم يرد فقط (${c.pending})</option>
            </select>
            <button class="btn btn-ghost" type="button" id="print-letters">طباعة خطابات الموافقة</button>
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
          <span class="pill pill-success">موافق: ${c.approved}</span>
          <span class="pill pill-critical">غير موافق: ${c.declined}</span>
          <span class="pill pill-neutral">بانتظار الرد: ${c.pending}</span>
        </div>
        <details class="consent-text-box">
          <summary>نص خطاب الموافقة ${event.consentText ? "(معدَّل)" : "(تلقائي)"}</summary>
          <textarea id="consent-text" rows="4" style="width:100%; margin-top:8px;">${esc(consentTextOf(event))}</textarea>
          <div class="forms-actions" style="margin-top:8px;"><button class="btn btn-primary" type="button" id="consent-text-save">حفظ النص</button><button class="btn btn-ghost" type="button" id="consent-text-reset">إرجاع النص التلقائي</button></div>
        </details>
        <div class="tablewrap"><table>
          <thead><tr><th>م</th><th>الطالب</th><th>الشعبة</th><th>أرقام التواصل</th><th>رد ولي الأمر</th></tr></thead>
          <tbody>${(event.students || []).map((s, i) => `<tr>
            <td>${i + 1}</td><td><strong>${esc(s.name)}</strong><div class="hint">${esc(s.academicId || s.id)}</div></td><td>${esc(s.section) || "—"}</td>
            <td>${[...new Set(s.phones || [])].slice(0, 3).map(esc).join(" · ") || "—"}</td>
            <td>${responseButtons(s)}</td>
          </tr>`).join("")}</tbody>
        </table></div>
      </div>

      <div class="card event-step">
        <div class="card-head"><h2><span class="step-no">٣</span> كشف الحضور (${approved.length})</h2><button class="btn btn-ghost" type="button" id="print-attendance" ${approved.length ? "" : "disabled"}>طباعة كشف الحضور</button></div>
        <p class="hint">${approved.length ? `يتكوّن تلقائيًا من الطلبة الموافَق عليهم (${approved.length} من ${c.total}).` : "لا يوجد طلبة موافَق عليهم بعد — سجّل ردود أولياء الأمور أعلاه."}</p>
      </div>`;

    root.querySelector("#event-back").addEventListener("click", () => nav.log());
    root.querySelector("#event-edit").addEventListener("click", () => nav.editor(event.id));
    root.querySelector("#print-candidates").addEventListener("click", async () => printSheet({ ...(await withTeacherPhones(event)), kind: "candidates" }));
    root.querySelector("#print-attendance").addEventListener("click", async () => printSheet({ ...(await withTeacherPhones(event)), students: approvedStudents(event), kind: "attendance" }));
    root.querySelector("#print-letters").addEventListener("click", () => {
      const scope = root.querySelector("#letters-scope").value;
      const students = scope === "pending" ? (event.students || []).filter((s) => consentOf(event, s) === "pending") : event.students || [];
      if (!students.length) { notify("لا يوجد طلبة بانتظار الرد"); return; }
      printMarkupInPopup(`خطابات موافقة — ${event.title}`, consentLettersMarkup(event, students));
    });
    const textArea = root.querySelector("#consent-text");
    root.querySelector("#consent-text-save").addEventListener("click", async () => {
      try { event = await saveConsentText(event.id, textArea.value === defaultConsentText(event) ? "" : textArea.value); notify("تم حفظ نص الخطاب"); draw(); }
      catch (error) { notify(error.message || "تعذر حفظ النص"); }
    });
    root.querySelector("#consent-text-reset").addEventListener("click", async () => {
      try { event = await saveConsentText(event.id, ""); notify("تم إرجاع النص التلقائي"); draw(); }
      catch (error) { notify(error.message || "تعذر حفظ النص"); }
    });
    root.querySelectorAll("[data-consent]").forEach((btn) => btn.addEventListener("click", async () => {
      const student = (event.students || []).find((s) => studentKey(s) === btn.dataset.student);
      if (!student) return;
      // الضغط على الرد المحدد نفسه يعيده "بانتظار الرد".
      const value = consentOf(event, student) === btn.dataset.consent ? "pending" : btn.dataset.consent;
      btn.closest(".consent-toggle").querySelectorAll("button").forEach((b) => { b.disabled = true; });
      try {
        // حالة الزر نفسها تكفي تأكيدًا؛ بلا إشعار لكل نقرة.
        event = await setConsent(event.id, student, value);
      } catch (error) { notify(error.message || "تعذر حفظ الرد"); }
      const scrollY = window.scrollY;
      draw();
      window.scrollTo(0, scrollY);
    }));
  };
  draw();
}

// deps: renderEditor = محرر الكشوف (forms-ui.js)، printSheet = طباعة كشف حضور/مرشحين.
export async function renderEventFiles(root, { renderEditor, printSheet }) {
  const nav = {
    log: () => renderLog(root, nav),
    detail: (id) => renderDetail(root, id, nav, printSheet),
    editor: (id) => renderEditor(root, id, (savedId) => (savedId || id ? nav.detail(savedId || id) : nav.log()), "event"),
  };
  await nav.log();
}
