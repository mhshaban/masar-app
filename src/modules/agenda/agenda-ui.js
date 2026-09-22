import { listAgendaEntries, groupByPeriod, groupByMonth, listFollowUpItemOptions } from "./agenda-service.js?v=2026-09-13-period-order-fix-1";
import { mountActionEditor } from "../shared/action-editor.js";
import { buildAgendaReportHtml } from "../../services/report-builders.js?v=2026-09-17-attendance-checkbox-1";
import { downloadAsWordDoc } from "../../services/word-export.js?v=2026-09-13-landscape-export-1";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const PILLAR_BADGE = {
  "الانجاز الاكاديمي": "pill-teal",
  "التطور الشخصي": "pill-warning",
  "القيادة": "pill-critical",
};

const STATUS_LABEL = {
  not_started: ["pill-neutral", "لم يبدأ"],
  ongoing: ["pill-warning", "قيد الإنجاز"],
  done: ["pill-success", "تم"],
};

function statusPill(status) {
  const [cls, label] = STATUS_LABEL[status] || STATUS_LABEL.not_started;
  return `<span class="pill dot ${cls}" data-role="status-pill">${label}</span>`;
}

async function mountEntries(root, entries, followUpOptions, refresh, sortMode) {
  const groups = sortMode === "text" ? await groupByPeriod(entries) : await groupByMonth(entries);
  const followUpLabels = new Map(followUpOptions.map((o) => [o.id, o.label]));

  root.innerHTML = [...groups.entries()].map(([period, items]) => {
    const dates = items.map((e) => e.periodStart).filter(Boolean).sort();
    const dateRange = dates.length
      ? `<span class="pill pill-teal">${esc(dates[0])}${dates[dates.length - 1] !== dates[0] ? ` → ${esc(dates[dates.length - 1])}` : ""}</span>`
      : "";
    return `
    <div class="card" style="margin-bottom:14px;">
      <div class="card-head">
        <h2>${esc(period)}</h2>
        <div style="display:flex; gap:8px; align-items:center;">
          ${dateRange}
          <span class="pill pill-neutral">${items.length} إجراء</span>
        </div>
      </div>
      <ul class="plain">
        ${items.map((entry) => `
          <li class="row-item" data-id="${esc(entry.id)}" style="flex-direction:column; align-items:stretch; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:10px; width:100%;">
              <span class="pill dot ${PILLAR_BADGE[entry.pillar] || "pill-neutral"}">${esc(entry.pillar)}</span>
              <div class="body">
                <div class="title">${esc(entry.action)}</div>
                <div class="meta">${esc(entry.project_title || "")}${entry.executor ? ` · المنفذ: ${esc(entry.executor)}` : ""}${entry.progress.followUpItemId ? ` · مرتبط ببند: ${esc(followUpLabels.get(entry.progress.followUpItemId) || "")}` : ""}</div>
              </div>
              ${statusPill(entry.progress.status)}
            </div>
            <div class="edit-slot"></div>
          </li>
        `).join("")}
      </ul>
    </div>
  `;
  }).join("");

  root.querySelectorAll("li[data-id]").forEach((li) => {
    const id = li.dataset.id;
    const entry = entries.find((e) => e.id === id);

    const openEditor = () => {
      const slot = li.querySelector(".edit-slot");
      mountActionEditor(slot, entry, followUpOptions, {
        onSaved: refresh,
        onDeleted: refresh,
        onCancel: () => { slot.innerHTML = ""; },
      });
    };

    li.addEventListener("click", (e) => {
      if (e.target.closest(".edit-slot")) return;
      const slot = li.querySelector(".edit-slot");
      if (slot.innerHTML) {
        slot.innerHTML = "";
        return;
      }
      root.querySelectorAll(".edit-slot").forEach((s) => { s.innerHTML = ""; });
      openEditor();
    });
  });
}

// نفس حقول بحث خطة القسم بالضبط (searchActions بdepartment-plan-service.js)
// — نص الإجراء/الفئة المستهدفة/دور المكتب/الأقسام المشاركة — عشان يبحث
// المرشد عن نفس الإجراء بنفس الطريقة من أي الشاشتين، بلا فرق سلوك بينهما.
function matchesQuery(entry, q) {
  const haystack = [entry.action, entry.target, entry.executor, entry.follower].filter(Boolean).join(" ");
  return haystack.includes(q);
}

export async function mountAgendaView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>الأجندة التنفيذية</h1></div>
      <button class="btn btn-ghost" id="agenda-export-btn">تصدير Word</button>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <label class="hint" for="agenda-search-input" style="display:block; margin-bottom:6px;">بحث سريع عن إجراء (بنص الإجراء، المستهدف، المنفذ، أو المتابع)</label>
      <input id="agenda-search-input" type="search" placeholder="ابحث عن إجراء..." style="width:100%; box-sizing:border-box; padding:10px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
    </div>
    <div class="tabs" role="tablist" aria-label="ترتيب الإجراءات">
      <div class="tab" data-sort="date" role="tab" aria-selected="false">حسب التاريخ</div>
      <div class="tab active" data-sort="text" role="tab" aria-selected="true">حسب نص الفترة</div>
    </div>
    <div id="agenda-groups"></div>
  `;

  const root = container.querySelector("#agenda-groups");
  const searchInput = container.querySelector("#agenda-search-input");
  let sortMode = "text";

  const refresh = async () => {
    const [allEntries, followUpOptions] = await Promise.all([listAgendaEntries(), listFollowUpItemOptions()]);
    if (!allEntries.length) {
      root.innerHTML = '<div class="card"><div class="empty">لا توجد بيانات أجندة بعد</div></div>';
      return;
    }
    const query = searchInput.value.trim();
    const entries = query ? allEntries.filter((entry) => matchesQuery(entry, query)) : allEntries;
    if (!entries.length) {
      root.innerHTML = '<div class="card"><div class="empty">لا يوجد إجراء مطابق لبحثك</div></div>';
      return;
    }
    await mountEntries(root, entries, followUpOptions, refresh, sortMode);
  };

  container.querySelectorAll("[data-sort]").forEach((tab) => {
    tab.addEventListener("click", async () => {
      if (tab.dataset.sort === sortMode) return;
      sortMode = tab.dataset.sort;
      container.querySelectorAll("[data-sort]").forEach((t) => {
        t.classList.toggle("active", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      await refresh();
    });
  });

  let searchTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refresh, 200);
  });

  await refresh();

  container.querySelector("#agenda-export-btn").addEventListener("click", async () => {
    const entries = await listAgendaEntries();
    const html = buildAgendaReportHtml(entries, new Date().toLocaleString("ar-BH"));
    downloadAsWordDoc("تقرير الإجراءات", html, `تقرير-الاجراءات-${new Date().toISOString().slice(0, 10)}`, { orientation: "landscape" });
  });
}
