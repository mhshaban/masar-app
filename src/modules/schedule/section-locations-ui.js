import {
  SCHOOL_DAYS, PERIODS, SESSIONS, LEVELS, locateSections, loadClassSchedules,
} from "./section-locations-service.js?v=2026-10-08-section-locations-1";
import { notify } from "../shared/ui-states.js?v=2026-09-06-polish-1";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const SELECT_STYLE = "padding:8px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;";

function todaySchoolDay() {
  const today = new Intl.DateTimeFormat("ar-BH", { timeZone: "Asia/Bahrain", weekday: "long" }).format(new Date());
  return SCHOOL_DAYS.includes(today) ? today : SCHOOL_DAYS[0];
}

function select(id, label, options, value) {
  return `<label class="forms-field" style="min-width:130px;"><span>${label}</span><select id="${id}" style="${SELECT_STYLE}">
    ${options.map((o) => `<option value="${esc(o.value)}" ${o.value === value ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
  </select></label>`;
}

// كل بطاقة تُوضع بأقصر عمود حاليًا (بعدد صفوفها) بدل صفوف شبكة ثابتة: صف
// الشبكة يأخذ ارتفاع أطول بطاقة فيه، فتبقى مساحة فارغة كبيرة تحت البطاقات
// القصيرة وتنزل البطاقة الرابعة تحت نهاية أطول قائمة.
function packColumns(groups, count) {
  const columns = Array.from({ length: count }, () => []);
  const heights = new Array(count).fill(0);
  for (const g of groups) {
    const i = heights.indexOf(Math.min(...heights));
    columns[i].push(g);
    heights[i] += g.sections.length + 3;
  }
  return columns.filter((c) => c.length);
}

function filterSummary(state) {
  return [
    `اليوم: ${state.day}`,
    `الحصة ${state.period}`,
    `الفترة: ${state.session || "صباحي ومسائي"}`,
    `المستوى: ${state.level || "كل المستويات"}`,
  ].join(" — ");
}

function locationsPrintMarkup(groups, state) {
  const total = groups.reduce((sum, g) => sum + g.sections.length, 0);
  return `<table class="forms-print" id="locations-printable">
    <thead><tr><td>
      <div class="print-dept-line">قسم الإرشاد الأكاديمي والتوجيه المهني</div>
      <div class="topbar"><div><h1>أماكن تواجد الشعب</h1><div class="sub">${esc(filterSummary(state))} — ${total} شعبة</div></div></div>
    </td></tr></thead>
    <tbody><tr><td>
      ${groups.filter((g) => g.sections.length).map((g) => `
        <div class="card print-flow print-own-page"><h2>${esc(g.label)} (${g.sections.length})</h2>
          <div class="tablewrap"><table>
            <thead><tr><th>الشعبة</th><th>القاعة</th><th>المقرر</th><th>المعلم</th>${state.session ? "" : "<th>الفترة</th>"}</tr></thead>
            <tbody>${g.sections.map((s) => `<tr>
              <td><strong>${esc(s.section)}</strong></td>
              <td>${s.room ? `<span dir="ltr" style="unicode-bidi:isolate;">${esc(s.room.split("+").join(" + "))}</span>` : "—"}</td>
              <td>${esc(s.subjectCode) || "—"}</td>
              <td>${esc(s.teacher.split("+").join(" · ")) || "—"}</td>
              ${state.session ? "" : `<td>${esc(s.session)}</td>`}
            </tr>`).join("")}</tbody>
          </table></div>
        </div>`).join("")}
    </td></tr></tbody>
  </table>`;
}

// نفس تقنية الطباعة المباشرة بالاستمارات والحالات: نافذة منبثقة تنسخ أوراق
// أنماط الصفحة (ترويسة متكررة وترقيم صفحات من .forms-print) ثم تطبع.
async function printLocations(groups, state) {
  const popup = window.open("", "_blank");
  if (!popup) { notify("اسمح بفتح نافذة الطباعة في المتصفح."); return; }
  popup.document.body.textContent = "جارٍ تجهيز الكشف للطباعة…";
  try {
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>أماكن تواجد الشعب — ${esc(state.day)} الحصة ${esc(state.period)}</title></head><body><main id="locations-print-root"></main></body></html>`);
    popup.document.close();
    popup.document.documentElement.dataset.theme = document.documentElement.dataset.theme || "light";
    popup.document.getElementById("locations-print-root").innerHTML = locationsPrintMarkup(groups, state);
    const styles = [...document.querySelectorAll('link[rel="stylesheet"]')].map((source) => new Promise((resolve, reject) => {
      const link = popup.document.createElement("link");
      link.rel = "stylesheet";
      link.href = source.href;
      link.onload = resolve;
      link.onerror = () => reject(new Error("تعذّر تحميل تنسيق الطباعة؛ حاول مرة ثانية."));
      popup.document.head.appendChild(link);
    }));
    for (const source of document.querySelectorAll("style")) popup.document.head.appendChild(source.cloneNode(true));
    await Promise.all(styles);
    if (popup.closed) return;
    await Promise.all([400, 600, 700, 800].map((weight) => popup.document.fonts.load(`${weight} 12px "Cairo"`, "أماكن الشعب")));
    await popup.document.fonts.ready;
    if (popup.closed) return;
    popup.requestAnimationFrame(() => { if (!popup.closed) { popup.focus(); popup.print(); } });
  } catch (error) { if (!popup.closed) popup.close(); notify(error.message || "تعذّرت الطباعة."); }
}

export async function mountSectionLocationsView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>أماكن تواجد الشعب</h1><div class="sub">من الجدول الدراسي المستورد — اختر اليوم والحصة لمعرفة مكان كل شعبة</div></div>
      <div class="forms-actions"><button class="btn btn-ghost" id="loc-print" type="button" disabled>طباعة</button></div>
    </div>
    <div id="locations-body"><div class="card"><div class="empty" role="status">جارٍ تحميل الجدول الدراسي…</div></div></div>
  `;
  const body = container.querySelector("#locations-body");
  const rows = await loadClassSchedules();
  if (!rows.length) {
    body.innerHTML = '<div class="card"><div class="empty">لم يُستورد الجدول الدراسي بعد — من الإدارة ← الاستيراد ← تحديث شامل.</div></div>';
    return;
  }

  const state = { day: todaySchoolDay(), period: "1", session: "صباحي", level: "" };
  body.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
        ${select("loc-day", "اليوم", SCHOOL_DAYS.map((d) => ({ value: d, label: d })), state.day)}
        ${select("loc-period", "الحصة", PERIODS.map((p) => ({ value: p, label: `الحصة ${p}` })), state.period)}
        ${select("loc-session", "الفترة", [...SESSIONS.map((s) => ({ value: s, label: s })), { value: "", label: "الكل (صباحي ومسائي)" }], state.session)}
        ${select("loc-level", "المستوى", [{ value: "", label: "كل المستويات" }, ...LEVELS.map((l) => ({ value: l, label: `المستوى ${l}` }))], state.level)}
      </div>
    </div>
    <div id="locations-result"></div>
  `;

  let currentGroups = [];
  const printButton = container.querySelector("#loc-print");
  printButton.addEventListener("click", () => printLocations(currentGroups, { ...state }));

  const draw = () => {
    const groups = locateSections(rows, state);
    const total = groups.reduce((sum, g) => sum + g.sections.length, 0);
    currentGroups = groups;
    printButton.disabled = !total;
    const visible = groups.filter((g) => g.key !== "other" || g.sections.length);
    const result = body.querySelector("#locations-result");
    if (!total) {
      result.innerHTML = '<div class="card"><div class="empty">لا توجد شعب لديها حصة بهذا الوقت حسب الجدول.</div></div>';
      return;
    }
    result.innerHTML = `
      <div class="grid g4" style="margin-bottom:16px;">
        ${visible.map((g) => `<div class="card stat"><div class="label">${esc(g.label)}</div><div class="value">${g.sections.length}</div><div class="hint">شعبة</div></div>`).join("")}
        ${visible.length < 4 ? `<div class="card stat"><div class="label">المجموع</div><div class="value">${total}</div><div class="hint">شعبة لديها حصة</div></div>` : ""}
      </div>
      <div style="display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap;">
        ${packColumns(visible, 3).map((column) => `<div style="flex:1 1 320px; min-width:0; display:flex; flex-direction:column; gap:16px;">${column.map((g) => `
          <div class="card">
            <div class="card-head"><h2>${esc(g.label)}</h2><span class="pill pill-neutral">${g.sections.length}</span></div>
            ${g.sections.length ? `<div class="tablewrap"><table>
              <thead><tr><th>الشعبة</th><th>القاعة</th><th>المقرر</th></tr></thead>
              <tbody>${g.sections.map((s) => `<tr>
                <td><strong>${esc(s.section)}</strong>${state.session ? "" : ` <span class="pill pill-neutral">${esc(s.session)}</span>`}</td>
                <td>${s.room ? `<span dir="ltr" style="unicode-bidi:isolate; white-space:nowrap;">${esc(s.room.split("+").join(" + "))}</span>` : "—"}</td>
                <td>${esc(s.subjectCode) || "—"}${s.teacher ? `<div class="hint">${esc(s.teacher.split("+").join(" · "))}</div>` : ""}</td>
              </tr>`).join("")}</tbody>
            </table></div>` : '<p class="hint">لا توجد شعب هنا بهذا الوقت.</p>'}
          </div>`).join("")}</div>`).join("")}
      </div>
    `;
  };

  for (const [id, key] of [["loc-day", "day"], ["loc-period", "period"], ["loc-session", "session"], ["loc-level", "level"]]) {
    body.querySelector(`#${id}`).addEventListener("change", (e) => { state[key] = e.target.value; draw(); });
  }
  draw();
}
