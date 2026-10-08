import {
  SCHOOL_DAYS, PERIODS, SESSIONS, LEVELS, locateSections, loadClassSchedules,
} from "./section-locations-service.js?v=2026-10-08-section-locations-1";

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

export async function mountSectionLocationsView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>أماكن تواجد الشعب</h1><div class="sub">من الجدول الدراسي المستورد — اختر اليوم والحصة لمعرفة مكان كل شعبة</div></div>
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

  const draw = () => {
    const groups = locateSections(rows, state);
    const total = groups.reduce((sum, g) => sum + g.sections.length, 0);
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
      <div class="grid g3" style="align-items:start;">
        ${visible.map((g) => `
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
          </div>`).join("")}
      </div>
    `;
  };

  for (const [id, key] of [["loc-day", "day"], ["loc-period", "period"], ["loc-session", "session"], ["loc-level", "level"]]) {
    body.querySelector(`#${id}`).addEventListener("change", (e) => { state[key] = e.target.value; draw(); });
  }
  draw();
}
