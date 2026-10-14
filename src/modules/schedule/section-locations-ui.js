import {
  SCHOOL_DAYS, PERIODS, SESSIONS, LEVELS, locateSections, loadClassSchedules, levelOfSection,
} from "./section-locations-service.js?v=2026-10-08-section-locations-1";
import { notify, confirmDialog } from "../shared/ui-states.js?v=2026-09-06-polish-1";
import { printMarkupInPopup } from "../forms/print-popup.js?v=2026-10-12-event-approval-1";
import {
  scheduleSections, campaignProgress, listCampaigns, saveCampaign, setSectionVisited, removeCampaign,
} from "./section-visits-service.js?v=2026-10-14-section-visits-1";

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

// ===== حملات زيارة الشعب (قائمة شطب) =====
const ACTIVE_CAMPAIGN_KEY = "masar.sectionVisits.active";
const readActive = () => { try { return localStorage.getItem(ACTIVE_CAMPAIGN_KEY) || ""; } catch { return ""; } };
const writeActive = (id) => { try { if (id) localStorage.setItem(ACTIVE_CAMPAIGN_KEY, id); else localStorage.removeItem(ACTIVE_CAMPAIGN_KEY); } catch { /* تفضيل محلي فقط */ } };

function visitsReportMarkup(campaign) {
  const p = campaignProgress(campaign);
  const visits = campaign.visits || {};
  const dates = p.visitedSections.map((s) => visits[s]?.date).filter(Boolean).sort();
  const span = dates.length ? (dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} — ${dates[dates.length - 1]}`) : "—";
  const visitedRows = p.visitedSections
    .sort((a, b) => String(visits[a]?.date || "").localeCompare(String(visits[b]?.date || "")) || a.localeCompare(b, "ar"))
    .map((s, i) => `<tr><td>${i + 1}</td><td><strong>${esc(s)}</strong></td><td>${esc(levelOfSection(s) || "—")}</td><td>${esc(visits[s]?.date || "—")}</td><td>${esc(visits[s]?.by || "—")}</td></tr>`).join("");
  const remainingRows = p.remaining.map((s, i) => `<tr><td>${i + 1}</td><td><strong>${esc(s)}</strong></td><td>${esc(levelOfSection(s) || "—")}</td></tr>`).join("");
  return `<table class="forms-print">
    <thead><tr><td>
      <div class="print-dept-line">قسم الإرشاد الأكاديمي والتوجيه المهني</div>
      <div class="topbar"><div><h1>تقرير زيارات الشعب</h1></div></div>
    </td></tr></thead>
    <tbody><tr><td>
      <div class="card"><h2>بيانات الإجراء</h2>
        <div class="tablewrap"><table>
          <tr><th>الإجراء</th><td colspan="3"><strong>${esc(campaign.title)}</strong></td></tr>
          ${campaign.notes ? `<tr><th>الوصف</th><td colspan="3">${esc(campaign.notes)}</td></tr>` : ""}
          <tr><th>الشعب المستهدفة</th><td>${p.total}</td><th>تمت زيارتها</th><td><strong>${p.visited}</strong> (${p.pct}٪)</td></tr>
          <tr><th>الشعب المتبقية</th><td>${p.remaining.length}</td><th>فترة الزيارات</th><td>${esc(span)}</td></tr>
        </table></div>
      </div>
      <div class="card print-flow"><h2>الشعب التي تمت زيارتها (${p.visited})</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>م</th><th>الشعبة</th><th>المستوى</th><th>تاريخ الزيارة</th><th>بواسطة</th></tr></thead>
          <tbody>${visitedRows || '<tr><td colspan="5">لم تُسجَّل زيارات بعد</td></tr>'}</tbody>
        </table></div>
      </div>
      ${p.remaining.length ? `<div class="card print-flow"><h2>الشعب المتبقية (${p.remaining.length})</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>م</th><th>الشعبة</th><th>المستوى</th></tr></thead>
          <tbody>${remainingRows}</tbody>
        </table></div>
      </div>` : ""}
    </td></tr></tbody>
  </table>`;
}

// قائمة اختيار الشعب مجمّعة حسب المستوى (لمحرر الحملة).
function sectionPickerMarkup(sections, selected) {
  const byLevel = new Map();
  for (const s of sections) {
    const key = s.level || "غير محدد";
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key).push(s);
  }
  return [...byLevel.entries()].map(([level, list]) => `
    <div class="visits-level"><div class="visits-level-head">المستوى ${esc(level)} <span class="hint">(${list.length})</span></div>
      <div class="visits-grid">${list.map((s) => `<label class="visits-chip"><input type="checkbox" data-target="${esc(s.section)}" ${selected.has(s.section) ? "checked" : ""}> ${esc(s.section)}</label>`).join("")}</div>
    </div>`).join("");
}

// قائمة الشطب: شعب الحملة مجمّعة حسب المستوى، الشعبة المزارة مؤشَّرة مع تاريخها.
function checklistMarkup(campaign) {
  const visits = campaign.visits || {};
  const byLevel = new Map();
  for (const s of campaign.targetSections || []) {
    const key = levelOfSection(s) || "غير محدد";
    if (!byLevel.has(key)) byLevel.set(key, []);
    byLevel.get(key).push(s);
  }
  return [...byLevel.entries()].map(([level, list]) => `
    <div class="visits-level"><div class="visits-level-head">المستوى ${esc(level)} <span class="hint">(${list.filter((s) => visits[s]).length} من ${list.length})</span></div>
      <div class="visits-grid">${list.sort((a, b) => a.localeCompare(b, "ar")).map((s) => `<label class="visits-chip${visits[s] ? " done" : ""}" title="${visits[s] ? esc(`زيارة ${visits[s].date}${visits[s].by ? ` — ${visits[s].by}` : ""}`) : "لم تتم زيارتها"}"><input type="checkbox" data-visit="${esc(s)}" ${visits[s] ? "checked" : ""}> ${esc(s)}${visits[s] ? `<span class="visits-date">${esc(visits[s].date.slice(5))}</span>` : ""}</label>`).join("")}</div>
    </div>`).join("");
}

export async function mountSectionLocationsView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>أماكن تواجد الشعب</h1><div class="sub">من الجدول الدراسي المستورد — اختر اليوم والحصة لمعرفة مكان كل شعبة</div></div>
      <div class="forms-actions"><button class="btn btn-ghost" id="loc-print" type="button" disabled>طباعة</button></div>
    </div>
    <div id="visits-panel"></div>
    <div id="locations-body"><div class="card"><div class="empty" role="status">جارٍ تحميل الجدول الدراسي…</div></div></div>
  `;
  const body = container.querySelector("#locations-body");
  const rows = await loadClassSchedules();
  if (!rows.length) {
    body.innerHTML = '<div class="card"><div class="empty">لم يُستورد الجدول الدراسي بعد — من الإدارة ← الاستيراد ← تحديث شامل.</div></div>';
    return;
  }

  const state = { day: todaySchoolDay(), period: "1", session: "صباحي", level: "", onlyCampaign: false };
  const allSections = scheduleSections(rows);
  const panel = container.querySelector("#visits-panel");
  let campaigns = await listCampaigns().catch((error) => { console.error("تعذر تحميل حملات الزيارة", error); return []; });
  let activeId = campaigns.some((c) => c.id === readActive()) ? readActive() : "";
  let checklistOpen = false;
  const active = () => campaigns.find((c) => c.id === activeId) || null;
  const replaceCampaign = (updated) => { campaigns = campaigns.map((c) => (c.id === updated.id ? updated : c)); };
  body.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
        ${select("loc-day", "اليوم", SCHOOL_DAYS.map((d) => ({ value: d, label: d })), state.day)}
        ${select("loc-period", "الحصة", PERIODS.map((p) => ({ value: p, label: `الحصة ${p}` })), state.period)}
        ${select("loc-session", "الفترة", [...SESSIONS.map((s) => ({ value: s, label: s })), { value: "", label: "الكل (صباحي ومسائي)" }], state.session)}
        ${select("loc-level", "المستوى", [{ value: "", label: "كل المستويات" }, ...LEVELS.map((l) => ({ value: l, label: `المستوى ${l}` }))], state.level)}
        <label class="visits-only" id="loc-only-wrap" hidden><input type="checkbox" id="loc-only"> عرض شعب الحملة فقط</label>
      </div>
    </div>
    <div id="locations-result"></div>
  `;

  let currentGroups = [];
  const printButton = container.querySelector("#loc-print");
  printButton.addEventListener("click", () => printLocations(currentGroups, { ...state }));

  const draw = () => {
    const campaign = active();
    const targets = new Set(campaign?.targetSections || []);
    const visits = campaign?.visits || {};
    body.querySelector("#loc-only-wrap").hidden = !campaign;
    const groups = locateSections(rows, state).map((g) => (campaign && state.onlyCampaign ? { ...g, sections: g.sections.filter((s) => targets.has(s.section)) } : g));
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
              <thead><tr>${campaign ? '<th title="تمت الزيارة">✓</th>' : ""}<th>الشعبة</th><th>القاعة</th><th>المقرر</th></tr></thead>
              <tbody>${g.sections.map((s) => `<tr${visits[s.section] ? ' class="visits-row-done"' : ""}>
                ${campaign ? `<td>${targets.has(s.section) ? `<input type="checkbox" data-visit="${esc(s.section)}" aria-label="تمت زيارة ${esc(s.section)}" ${visits[s.section] ? "checked" : ""}>` : '<span class="hint">—</span>'}</td>` : ""}
                <td><strong>${esc(s.section)}</strong>${state.session ? "" : ` <span class="pill pill-neutral">${esc(s.session)}</span>`}</td>
                <td>${s.room ? `<span dir="ltr" style="unicode-bidi:isolate; white-space:nowrap;">${esc(s.room.split("+").join(" + "))}</span>` : "—"}</td>
                <td>${esc(s.subjectCode) || "—"}${s.teacher ? `<div class="hint">${esc(s.teacher.split("+").join(" · "))}</div>` : ""}</td>
              </tr>`).join("")}</tbody>
            </table></div>` : '<p class="hint">لا توجد شعب هنا بهذا الوقت.</p>'}
          </div>`).join("")}</div>`).join("")}
      </div>
    `;
  };

  const toggleVisit = async (input) => {
    const campaign = active();
    if (!campaign) return;
    input.disabled = true;
    try {
      replaceCampaign(await setSectionVisited(campaign.id, input.dataset.visit, input.checked));
      notify(input.checked ? `تم تسجيل زيارة ${input.dataset.visit}` : `تم إلغاء تسجيل زيارة ${input.dataset.visit}`);
    } catch (error) {
      input.checked = !input.checked;
      notify(error.message || "تعذر حفظ الزيارة");
    }
    renderPanel();
    draw();
  };
  body.querySelector("#locations-result").addEventListener("change", (e) => { if (e.target.matches("input[data-visit]")) toggleVisit(e.target); });
  body.querySelector("#loc-only").addEventListener("change", (e) => { state.onlyCampaign = e.target.checked; draw(); });

  const renderEditor = (campaign) => {
    const selected = new Set(campaign?.targetSections || []);
    panel.innerHTML = `<div class="card" style="margin-bottom:16px;">
      <div class="card-head"><h2>${campaign ? "تعديل حملة الزيارة" : "حملة زيارة جديدة"}</h2></div>
      <form id="visits-form" class="forms-grid">
        <label class="forms-field forms-wide"><span>الإجراء / التعليمات *</span><input name="title" required value="${esc(campaign?.title || "")}" placeholder="مثال: تعليمات اختيار التخصص"></label>
        <label class="forms-field forms-wide"><span>وصف مختصر (اختياري)</span><textarea name="notes" rows="2">${esc(campaign?.notes || "")}</textarea></label>
        <div class="forms-field forms-wide"><span>الشعب المستهدفة — <strong id="visits-count">${selected.size}</strong> شعبة</span>
          <div class="chip-row" style="margin:6px 0 10px;">
            <button type="button" class="chip" data-quick="all">كل الشعب</button>
            ${LEVELS.map((l) => `<button type="button" class="chip" data-quick="level:${esc(l)}">+ المستوى ${esc(l)}</button>`).join("")}
            ${SESSIONS.map((x) => `<button type="button" class="chip" data-quick="session:${esc(x)}">+ ${esc(x)}</button>`).join("")}
            <button type="button" class="chip" data-quick="none">إلغاء الكل</button>
          </div>
          <div id="visits-picker">${sectionPickerMarkup(allSections, selected)}</div>
        </div>
        <div class="forms-actions forms-wide">
          <button class="btn btn-primary" type="submit">${campaign ? "حفظ التعديلات" : "إنشاء الحملة"}</button>
          <button class="btn btn-ghost" type="button" id="visits-cancel">إلغاء</button>
        </div>
      </form>
    </div>`;
    const picker = panel.querySelector("#visits-picker");
    const boxes = () => [...picker.querySelectorAll("input[data-target]")];
    const recount = () => { panel.querySelector("#visits-count").textContent = boxes().filter((b) => b.checked).length; };
    picker.addEventListener("change", recount);
    panel.querySelectorAll("[data-quick]").forEach((btn) => btn.addEventListener("click", () => {
      const [kind, value] = btn.dataset.quick.split(":");
      const info = new Map(allSections.map((s) => [s.section, s]));
      for (const box of boxes()) {
        const s = info.get(box.dataset.target);
        if (kind === "all") box.checked = true;
        else if (kind === "none") box.checked = false;
        else if (kind === "level" && s.level === value) box.checked = true;
        else if (kind === "session" && s.sessions.includes(value)) box.checked = true;
      }
      recount();
    }));
    panel.querySelector("#visits-cancel").addEventListener("click", renderPanel);
    panel.querySelector("#visits-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target;
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const saved = await saveCampaign(campaign?.id || null, {
          title: form.elements.title.value,
          notes: form.elements.notes.value,
          targetSections: boxes().filter((b) => b.checked).map((b) => b.dataset.target),
        });
        if (campaign) replaceCampaign(saved); else campaigns = [saved, ...campaigns];
        activeId = saved.id; writeActive(activeId);
        notify(campaign ? "تم حفظ تعديلات الحملة" : "تم إنشاء حملة الزيارة");
        renderPanel(); draw();
      } catch (error) { notify(error.message || "تعذر حفظ الحملة"); submit.disabled = false; }
    });
  };

  const renderPanel = () => {
    const campaign = active();
    if (!campaigns.length) {
      panel.innerHTML = `<div class="card" style="margin-bottom:16px;"><div class="card-head"><h2>زيارات الشعب</h2><button class="btn btn-primary" type="button" id="visits-new">+ حملة زيارة جديدة</button></div>
        <p class="hint">لإجراء أو تعليمات تتطلب المرور على الشعب بصفوفها: حدّد الشعب المستهدفة، واشطب كل شعبة بعد زيارتها لمعرفة عدد الشعب التي تمت تغطيتها.</p></div>`;
      panel.querySelector("#visits-new").addEventListener("click", () => renderEditor(null));
      return;
    }
    const p = campaign ? campaignProgress(campaign) : null;
    panel.innerHTML = `<div class="card" style="margin-bottom:16px;">
      <div class="card-head" style="flex-wrap:wrap; gap:10px;">
        <h2>زيارات الشعب</h2>
        <div class="forms-actions" style="align-items:center;">
          <select id="visits-active" style="${SELECT_STYLE}">
            <option value="">— بدون حملة —</option>
            ${campaigns.map((c) => `<option value="${esc(c.id)}" ${c.id === activeId ? "selected" : ""}>${esc(c.title)}</option>`).join("")}
          </select>
          <button class="btn btn-ghost" type="button" id="visits-new">+ حملة جديدة</button>
          ${campaign ? `<button class="btn btn-ghost" type="button" id="visits-edit">تعديل</button>
          <button class="btn btn-ghost" type="button" id="visits-report">طباعة التقرير</button>
          <button class="btn btn-ghost forms-danger" type="button" id="visits-delete">حذف</button>` : ""}
        </div>
      </div>
      ${campaign ? `
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin:4px 0 8px;">
          <strong>تمت زيارة ${p.visited} من ${p.total} شعبة (${p.pct}٪)</strong>
          <span class="hint">المتبقية: ${p.remaining.length}</span>
          <button class="btn btn-ghost" type="button" id="visits-toggle" style="margin-inline-start:auto;">${checklistOpen ? "إخفاء قائمة الشطب" : "قائمة الشطب"}</button>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${p.pct}%"></div></div>
        ${campaign.notes ? `<p class="hint" style="margin:8px 0 0;">${esc(campaign.notes)}</p>` : ""}
        ${checklistOpen ? `<div id="visits-checklist" style="margin-top:12px;">${checklistMarkup(campaign)}</div>` : ""}
      ` : '<p class="hint">اختر حملة لعرض قائمة الشطب وتأشير الشعب بجدول الأماكن.</p>'}
    </div>`;
    panel.querySelector("#visits-active").addEventListener("change", (e) => { activeId = e.target.value; writeActive(activeId); renderPanel(); draw(); });
    panel.querySelector("#visits-new").addEventListener("click", () => renderEditor(null));
    panel.querySelector("#visits-edit")?.addEventListener("click", () => renderEditor(campaign));
    panel.querySelector("#visits-toggle")?.addEventListener("click", () => { checklistOpen = !checklistOpen; renderPanel(); });
    panel.querySelector("#visits-report")?.addEventListener("click", () => printMarkupInPopup(`تقرير زيارات الشعب — ${campaign.title}`, visitsReportMarkup(campaign)));
    panel.querySelector("#visits-delete")?.addEventListener("click", async () => {
      if (!await confirmDialog(`حذف حملة "${campaign.title}" وكل زياراتها المسجلة نهائيًا؟`)) return;
      try {
        await removeCampaign(campaign.id);
        campaigns = campaigns.filter((c) => c.id !== campaign.id);
        activeId = ""; writeActive("");
        notify("تم حذف الحملة");
        renderPanel(); draw();
      } catch (error) { notify(error.message || "تعذر حذف الحملة"); }
    });
    panel.querySelector("#visits-checklist")?.addEventListener("change", (e) => { if (e.target.matches("input[data-visit]")) toggleVisit(e.target); });
  };
  renderPanel();

  for (const [id, key] of [["loc-day", "day"], ["loc-period", "period"], ["loc-session", "session"], ["loc-level", "level"]]) {
    body.querySelector(`#${id}`).addEventListener("change", (e) => { state[key] = e.target.value; draw(); });
  }
  draw();
}
