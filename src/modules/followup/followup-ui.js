import { getFollowUpReport, getStatsSummary, setManualOverride } from "./followup-service.js";
import { buildFollowUpReportHtml } from "../../services/report-builders.js";
import { downloadAsWordDoc } from "../../services/word-export.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const STATUS_LABEL = {
  not_started: ["pill-neutral", "لم يبدأ"],
  ongoing: ["pill-warning", "قيد الإنجاز"],
  done: ["pill-success", "تم"],
  not_done: ["pill-critical", "لم ينجز"],
  unknown: ["pill-neutral", "غير محدد"],
};

function statusPill(status) {
  const [cls, label] = STATUS_LABEL[status] || STATUS_LABEL.unknown;
  return `<span class="pill dot ${cls}">${label}</span>`;
}

function manualEditForm(item) {
  return `
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; margin-top:8px;">
      <div>
        <label class="hint" style="display:block;margin-bottom:4px;">الحالة (يدوي)</label>
        <select data-field="manualStatus" style="padding:7px 10px; border-radius:8px; border:1px solid var(--border); font-family:inherit; font-size:12px; background:var(--surface); color:inherit;">
          <option value="not_started" ${item.status === "not_started" ? "selected" : ""}>لم يبدأ</option>
          <option value="ongoing" ${item.status === "ongoing" ? "selected" : ""}>قيد الإنجاز</option>
          <option value="done" ${item.status === "done" ? "selected" : ""}>تم</option>
          <option value="not_done" ${item.status === "not_done" ? "selected" : ""}>لم ينجز</option>
        </select>
      </div>
      <div>
        <label class="hint" style="display:block;margin-bottom:4px;">عدد المستفيدين</label>
        <input data-field="manualParticipants" type="number" min="0" value="${item.totalParticipants ?? ""}" style="width:100px; padding:7px 10px; border-radius:8px; border:1px solid var(--border); font-family:inherit; font-size:12px; background:var(--surface); color:inherit;">
      </div>
      <div style="flex:1; min-width:220px;">
        <label class="hint" style="display:block;margin-bottom:4px;">ملخص ما تم إنجازه</label>
        <input data-field="manualSummary" type="text" value="${esc(item.summary ?? "")}" style="width:100%; padding:7px 10px; border-radius:8px; border:1px solid var(--border); font-family:inherit; font-size:12px; background:var(--surface); color:inherit;">
      </div>
      <button class="btn btn-ghost" data-action="save-manual" style="padding:7px 14px;">حفظ</button>
    </div>
  `;
}

function renderItemCard(item) {
  return `
    <div class="row-item" style="flex-direction:column; align-items:stretch;" data-item="${esc(item.id)}">
      <div style="display:flex; align-items:center; gap:10px; width:100%;">
        <span class="pill pill-neutral">${esc(item.no)}</span>
        <div class="body">
          <div class="title">${esc(item.title)}</div>
          ${item.indicator ? `<div class="meta">مؤشر الإنجاز: ${esc(item.indicator)}</div>` : ""}
        </div>
        ${statusPill(item.status)}
      </div>
      <div class="meta" style="margin-right:34px;">
        ${item.isComputed
          ? `<span class="pill pill-teal" style="margin-left:6px;">محسوبة من ${item.linkedActions.length} إجراء</span>`
          : '<span class="pill pill-neutral" style="margin-left:6px;">لا إجراءات مرتبطة — تحديث يدوي</span>'}
        ${item.totalParticipants ? `عدد المستفيدين: ${item.totalParticipants}` : ""}
      </div>
      ${item.summary ? `<p class="hint" style="margin:6px 0 0 34px;">${esc(item.summary)}</p>` : ""}
      ${!item.isComputed ? `<div style="margin-right:34px;">${manualEditForm(item)}</div>` : ""}
    </div>
  `;
}

async function renderReportTab(root) {
  const bySection = await getFollowUpReport();
  root.innerHTML = [...bySection.entries()].map(([section, items]) => `
    <div class="card" style="margin-bottom:14px;">
      <div class="card-head"><h3>${esc(section === "عام" ? "عام" : section)}</h3><span class="pill pill-neutral">${items.length} بند</span></div>
      <ul class="plain">${items.map(renderItemCard).join("")}</ul>
    </div>
  `).join("");

  root.querySelectorAll("[data-action='save-manual']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const card = btn.closest("[data-item]");
      const itemId = card.dataset.item;
      const patch = {
        manualStatus: card.querySelector("[data-field='manualStatus']").value,
        manualParticipants: Number(card.querySelector("[data-field='manualParticipants']").value) || 0,
        manualSummary: card.querySelector("[data-field='manualSummary']").value || null,
      };
      await setManualOverride(itemId, patch);
      await renderReportTab(root);
    });
  });
}

async function renderStatsTab(root) {
  const stats = await getStatsSummary();
  root.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px;">
      <div class="card stat"><div class="label">نسبة الإنجاز الكلية</div><div class="value">${stats.completionPct}٪</div></div>
      <div class="card stat"><div class="label">بنود منجزة</div><div class="value"><span dir="ltr">${stats.doneItems} / ${stats.totalItems}</span></div></div>
      <div class="card stat"><div class="label">إجراءات مُنفَّذة</div><div class="value">${stats.actionsExecuted}</div></div>
      <div class="card stat"><div class="label">إجمالي المستفيدين</div><div class="value">${stats.totalParticipants}</div></div>
    </div>
    <div class="card">
      <h3>الإنجاز حسب القسم في تقرير المتابعة</h3>
      <p class="hint">محسوبة تلقائيًا من حالات البنود أعلاه — نفس الأرقام المطلوبة في استمارة الإحصائيات.</p>
      <div class="tablewrap"><table>
        <thead><tr><th>القسم</th><th>بنود منجزة</th><th>نسبة الإنجاز</th><th>عدد المستفيدين</th></tr></thead>
        <tbody>
          ${stats.sections.map((s) => `
            <tr>
              <td>${esc(s.section)}</td>
              <td class="num"><span dir="ltr">${s.done} / ${s.total}</span></td>
              <td class="num">${s.completionPct}٪</td>
              <td class="num">${s.participants}</td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>
    </div>
  `;
}

export async function mountFollowUpView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>تقرير المتابعة والإحصائيات</h1><div class="sub">بنود تقرير المتابعة الرسمي (المنطقة التعليمية) محسوبة تلقائيًا من إجراءات الأجندة المرتبطة بها</div></div>
      <button class="btn btn-ghost" id="followup-export-btn">تصدير Word</button>
    </div>
    <div class="tabs">
      <div class="tab active" data-tab="report">تقرير المتابعة</div>
      <div class="tab" data-tab="stats">الإحصائيات</div>
    </div>
    <div id="followup-report"></div>
    <div id="followup-stats" style="display:none;"></div>
  `;

  const reportRoot = container.querySelector("#followup-report");
  const statsRoot = container.querySelector("#followup-stats");

  await renderReportTab(reportRoot);
  await renderStatsTab(statsRoot);

  container.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      container.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const isReport = tab.dataset.tab === "report";
      reportRoot.style.display = isReport ? "" : "none";
      statsRoot.style.display = isReport ? "none" : "";
    });
  });

  container.querySelector("#followup-export-btn").addEventListener("click", async () => {
    const [bySection, stats] = await Promise.all([getFollowUpReport(), getStatsSummary()]);
    const html = buildFollowUpReportHtml(bySection, stats, new Date().toLocaleString("ar-BH"));
    downloadAsWordDoc("تقرير المتابعة والإحصائيات", html, `تقرير-المتابعة-${new Date().toISOString().slice(0, 10)}`);
  });
}
