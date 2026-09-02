import { listAgendaEntries, groupByPeriod, groupByMonth, listFollowUpItemOptions } from "./agenda-service.js";
import { saveProgress, addAttachment, removeAttachment } from "../execution/execution-service.js";
import { buildAgendaReportHtml } from "../../services/report-builders.js?v=2026-09-02-print-approval-1";
import { downloadAsWordDoc } from "../../services/word-export.js?v=2026-09-02-print-approval-1";

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

function formatFileSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}

function attachmentsListHtml(attachments) {
  if (!attachments || !attachments.length) return '<p class="hint" style="margin:0;">لا توجد ثبوتيات مرفَقة بعد</p>';
  return `
    <ul class="plain">
      ${attachments.map((a) => `
        <li class="row-item" data-attachment-id="${esc(a.id)}">
          <div class="body">
            <a href="${esc(a.dataUrl)}" download="${esc(a.name)}" class="title" style="color:var(--teal-600);">${esc(a.name)}</a>
            <div class="meta">${formatFileSize(a.size)}</div>
          </div>
          <button class="link-btn" data-remove-attachment="${esc(a.id)}" style="color:var(--critical);">حذف</button>
        </li>
      `).join("")}
    </ul>
  `;
}

function editForm(entry, followUpOptions) {
  const p = entry.progress;
  return `
    <div class="card" style="margin-top:8px; background:var(--paper-50);">
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
        <div>
          <label class="hint" for="agenda-edit-status" style="display:block;margin-bottom:4px;">الحالة</label>
          <select id="agenda-edit-status" data-field="status" style="padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-family:inherit; font-size:12.5px; background:var(--surface); color:inherit;">
            <option value="not_started" ${p.status === "not_started" ? "selected" : ""}>لم يبدأ</option>
            <option value="ongoing" ${p.status === "ongoing" ? "selected" : ""}>قيد الإنجاز</option>
            <option value="done" ${p.status === "done" ? "selected" : ""}>تم</option>
          </select>
        </div>
        <div>
          <label class="hint" for="agenda-edit-participants" style="display:block;margin-bottom:4px;">عدد المستفيدين</label>
          <input id="agenda-edit-participants" data-field="participantsCount" type="number" min="0" value="${p.participantsCount ?? ""}" style="width:110px; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-family:inherit; font-size:12.5px; background:var(--surface); color:inherit;">
        </div>
        <div style="flex:1; min-width:180px;">
          <label class="hint" for="agenda-edit-proof" style="display:block;margin-bottom:4px;">الثبوتية الفعلية</label>
          <input id="agenda-edit-proof" data-field="proofNote" type="text" value="${esc(p.proofNote ?? "")}" placeholder="ما الدليل الذي تم توثيقه فعليًا؟" style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-family:inherit; font-size:12.5px; background:var(--surface); color:inherit;">
        </div>
        <div style="flex:1; min-width:160px;">
          <label class="hint" for="agenda-edit-obstacles" style="display:block;margin-bottom:4px;">معوقات التنفيذ</label>
          <input id="agenda-edit-obstacles" data-field="obstacles" type="text" value="${esc(p.obstacles ?? "")}" style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-family:inherit; font-size:12.5px; background:var(--surface); color:inherit;">
        </div>
        <div style="flex:1; min-width:200px;">
          <label class="hint" for="agenda-edit-followup" style="display:block;margin-bottom:4px;">ربط ببند تقرير المتابعة</label>
          <select id="agenda-edit-followup" data-field="followUpItemId" style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-family:inherit; font-size:12.5px; background:var(--surface); color:inherit;">
            <option value="">بدون ربط</option>
            ${followUpOptions.map((o) => `<option value="${esc(o.id)}" ${p.followUpItemId === o.id ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
          </select>
        </div>
        <button class="btn btn-primary" data-action="save-progress" style="padding:8px 16px;">حفظ</button>
      </div>
      <div style="margin-top:12px;">
        <label class="hint" for="agenda-edit-effectiveness" style="display:block;margin-bottom:4px;">تقرير الفعالية</label>
        <textarea id="agenda-edit-effectiveness" data-field="effectivenessReport" rows="3" placeholder="ما مدى فعالية هذا الإجراء؟ ماذا تحقق فعليًا؟" style="width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-family:inherit; font-size:12.5px; background:var(--surface); color:inherit; resize:vertical;">${esc(p.effectivenessReport ?? "")}</textarea>
      </div>
      <div style="margin-top:12px;">
        <label class="hint" for="agenda-edit-attachment" style="display:block;margin-bottom:4px;">الثبوتيات المرفَقة (صور، مستندات...)</label>
        <div class="attachments-list">${attachmentsListHtml(p.attachments)}</div>
        <input id="agenda-edit-attachment" type="file" data-role="attachment-input" style="margin-top:8px;">
      </div>
    </div>
  `;
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
      slot.innerHTML = editForm(entry, followUpOptions);

      slot.querySelector("[data-action='save-progress']").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const patch = {
          status: slot.querySelector("[data-field='status']").value,
          participantsCount: slot.querySelector("[data-field='participantsCount']").value || null,
          proofNote: slot.querySelector("[data-field='proofNote']").value || null,
          obstacles: slot.querySelector("[data-field='obstacles']").value || null,
          followUpItemId: slot.querySelector("[data-field='followUpItemId']").value || null,
          effectivenessReport: slot.querySelector("[data-field='effectivenessReport']").value || null,
        };
        await saveProgress(id, patch);
        await refresh();
      });

      const attachmentInput = slot.querySelector("[data-role='attachment-input']");
      attachmentInput.addEventListener("click", (ev) => ev.stopPropagation());
      attachmentInput.addEventListener("change", async () => {
        const file = attachmentInput.files[0];
        if (!file) return;
        try {
          entry.progress = await addAttachment(id, file);
          openEditor();
        } catch (err) {
          alert(err.message);
        }
      });

      slot.querySelectorAll("[data-remove-attachment]").forEach((btn) => {
        btn.addEventListener("click", async (ev) => {
          ev.stopPropagation();
          entry.progress = await removeAttachment(id, btn.dataset.removeAttachment);
          openEditor();
        });
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

export async function mountAgendaView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>الأجندة التنفيذية</h1><div class="sub">كل إجراءات خطة القسم — مجمّعة افتراضيًا بحسب تاريخ التنفيذ، أو بحسب نص الفترة الأصلي من الملف</div></div>
      <button class="btn btn-ghost" id="agenda-export-btn">تصدير Word</button>
    </div>
    <div class="sens" style="border-color: var(--warning); background: var(--warning-bg); color: var(--warning);">
      إجراءات هذه النسخة الأولى من الخطة نصّها الأصلي وصفي بلا تاريخ محدد (مثل "الأسبوع الثاني من سبتمبر")، فتظهر بقسم "بلا تاريخ محدد" بآخر القائمة. من شاشة "خطة القسم"، فتح أي إجراء للتعديل صار فيه حقلا "تاريخ بداية/نهاية التنفيذ" — أي إجراء تحدّد له تاريخين ينتقل تلقائيًا لترتيبه الزمني الصحيح هنا.
    </div>
    <div class="card" style="margin-bottom:16px;">
      <p class="hint" style="margin:0;">اضغط على أي إجراء لتسجيل حالته وعدد المستفيدين والثبوتية، ولربطه ببند من تقرير المتابعة الرسمي — هذا التحديث الوحيد الذي تحتاجه؛ تقرير المتابعة والإحصائيات يُحسبان منه تلقائيًا.</p>
    </div>
    <div class="tabs" role="tablist" aria-label="ترتيب الإجراءات">
      <div class="tab active" data-sort="date" role="tab" aria-selected="true">حسب التاريخ</div>
      <div class="tab" data-sort="text" role="tab" aria-selected="false">حسب نص الفترة</div>
    </div>
    <div id="agenda-groups"></div>
  `;

  const root = container.querySelector("#agenda-groups");
  let sortMode = "date";

  const refresh = async () => {
    const [entries, followUpOptions] = await Promise.all([listAgendaEntries(), listFollowUpItemOptions()]);
    if (!entries.length) {
      root.innerHTML = '<div class="card"><div class="empty">لا توجد بيانات أجندة بعد</div></div>';
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

  await refresh();

  container.querySelector("#agenda-export-btn").addEventListener("click", async () => {
    const entries = await listAgendaEntries();
    const html = buildAgendaReportHtml(entries, new Date().toLocaleString("ar-BH"));
    downloadAsWordDoc("تقرير الإجراءات", html, `تقرير-الاجراءات-${new Date().toISOString().slice(0, 10)}`);
  });
}
