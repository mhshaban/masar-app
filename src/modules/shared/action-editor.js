// محرر إجراء موحَّد — يعرض ويحفظ حقلي خطة القسم (نص الإجراء، الفئة
// المستهدفة، دور المكتب، الأقسام المشاركة، الثبوتيات، الفترة) وحقول
// الأجندة التنفيذية (الحالة، عدد المستفيدين، الثبوتية الفعلية، المعوقات،
// بند تقرير المتابعة، تقرير الفعالية، المرفقات) بمكان واحد — بدل نموذجين
// منفصلين بكل شاشة يعرض كل منهما نصف البيانات فقط. يُستخدَم من
// department-plan-ui.js (تعديل إجراء موجود) وagenda-ui.js (كل إجراء)
// معًا، فتعديل أي إجراء من أي الشاشتين يحفظ نفس الحقول الكاملة دفعة واحدة.
import { notify, confirmDialog } from "./ui-states.js?v=2026-09-06-polish-1";
import { updateAction, deleteAction } from "../department-plan/department-plan-service.js";
import { saveProgress, addAttachmentLink, removeAttachment } from "../execution/execution-service.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const FIELD_STYLE = "padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;";
const SMALL_FIELD_STYLE = "padding:8px 10px; border-radius:8px; border:1px solid var(--border); font-family:inherit; font-size:12.5px; background:var(--surface); color:inherit;";

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
            <a href="${esc(a.url || a.dataUrl)}" ${a.url ? 'target="_blank" rel="noopener noreferrer"' : `download="${esc(a.name)}"`} class="title" style="color:var(--teal-600);">${esc(a.name)}</a>
            <div class="meta">${a.url ? "رابط OneDrive أو تخزين سحابي" : formatFileSize(a.size)}</div>
          </div>
          <button class="link-btn" data-remove-attachment="${esc(a.id)}" style="color:var(--critical);">حذف</button>
        </li>
      `).join("")}
    </ul>
  `;
}

// entry بشكل listAgendaEntries()‎ (agenda-service.js): يحمل حقلي خطة القسم
// (action/target/executor/follower/evidence/period/periodStart/periodEnd
// + projectId/no) وحقول التقدّم (progress.*) معًا بكائن واحد جاهز.
export function actionEditorHtml(entry, followUpOptions) {
  const p = entry.progress || {};
  return `
    <form class="action-full-editor" style="display:flex; flex-direction:column; gap:10px; padding:10px 0;">
      <textarea name="action" placeholder="نص الإجراء" required rows="2" style="${FIELD_STYLE} resize:vertical;">${esc(entry.action) || ""}</textarea>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <input name="target" placeholder="الفئة المستهدفة" value="${esc(entry.target) || ""}" style="flex:1; min-width:140px; ${FIELD_STYLE}">
        <input name="executor" placeholder="دور المكتب" value="${esc(entry.executor) || ""}" style="flex:1; min-width:140px; ${FIELD_STYLE}">
        <input name="follower" placeholder="الأقسام المشاركة" value="${esc(entry.follower) || ""}" style="flex:1; min-width:140px; ${FIELD_STYLE}">
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <input name="evidence" placeholder="الثبوتيات" value="${esc(entry.evidence) || ""}" style="flex:1; min-width:140px; ${FIELD_STYLE}">
        <input name="period" placeholder="وصف الفترة (مثال: طوال العام الدراسي)" value="${esc(entry.period) || ""}" style="flex:1; min-width:140px; ${FIELD_STYLE}">
      </div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
        <div style="flex:1; min-width:140px;">
          <label class="hint" style="display:block;margin-bottom:4px;">تاريخ بداية التنفيذ (اختياري)</label>
          <input name="periodStart" type="date" value="${esc(entry.periodStart) || ""}" style="width:100%; ${FIELD_STYLE}">
        </div>
        <div style="flex:1; min-width:140px;">
          <label class="hint" style="display:block;margin-bottom:4px;">تاريخ نهاية التنفيذ (اختياري)</label>
          <input name="periodEnd" type="date" value="${esc(entry.periodEnd) || ""}" style="width:100%; ${FIELD_STYLE}">
        </div>
      </div>
      <hr style="width:100%; border:none; border-top:1px solid var(--border); margin:2px 0;">
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
        <div>
          <label class="hint" style="display:block;margin-bottom:4px;">الحالة</label>
          <select name="status" style="${SMALL_FIELD_STYLE}">
            <option value="not_started" ${p.status === "not_started" ? "selected" : ""}>لم يبدأ</option>
            <option value="ongoing" ${p.status === "ongoing" ? "selected" : ""}>قيد الإنجاز</option>
            <option value="done" ${p.status === "done" ? "selected" : ""}>تم</option>
          </select>
        </div>
        <div>
          <label class="hint" style="display:block;margin-bottom:4px;">عدد المستفيدين</label>
          <input name="participantsCount" type="number" min="0" value="${p.participantsCount ?? ""}" style="width:110px; ${SMALL_FIELD_STYLE}">
        </div>
        <div style="flex:1; min-width:180px;">
          <label class="hint" style="display:block;margin-bottom:4px;">الثبوتية الفعلية</label>
          <input name="proofNote" type="text" value="${esc(p.proofNote ?? "")}" placeholder="ما الدليل الذي تم توثيقه فعليًا؟" style="width:100%; ${SMALL_FIELD_STYLE}">
        </div>
        <div style="flex:1; min-width:160px;">
          <label class="hint" style="display:block;margin-bottom:4px;">معوقات التنفيذ</label>
          <input name="obstacles" type="text" value="${esc(p.obstacles ?? "")}" style="width:100%; ${SMALL_FIELD_STYLE}">
        </div>
      </div>
      <div>
        <label class="hint" style="display:block;margin-bottom:4px;">بند تقرير المتابعة الرسمي</label>
        <select name="followUpItemId" style="width:100%; ${SMALL_FIELD_STYLE}">
          <option value="">بدون ربط</option>
          ${followUpOptions.map((o) => `<option value="${esc(o.id)}" ${p.followUpItemId === o.id ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
        </select>
      </div>
      <div>
        <label class="hint" style="display:block;margin-bottom:4px;">تقرير الفعالية</label>
        <textarea name="effectivenessReport" rows="3" placeholder="ما مدى فعالية هذا الإجراء؟ ماذا تحقق فعليًا؟" style="width:100%; ${SMALL_FIELD_STYLE} resize:vertical;">${esc(p.effectivenessReport ?? "")}</textarea>
      </div>
      <div>
        <label class="hint" style="display:block;margin-bottom:4px;">الثبوتيات المرفَقة</label>
        <div class="attachments-list">${attachmentsListHtml(p.attachments)}</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; align-items:center;">
          <input type="text" data-role="attachment-name" placeholder="اسم المرفق" style="min-width:160px; flex:1; ${SMALL_FIELD_STYLE}">
          <input type="url" data-role="attachment-url" placeholder="الصق رابط مشاركة OneDrive هنا" style="min-width:260px; flex:2; ${SMALL_FIELD_STYLE} direction:ltr;">
          <button class="btn btn-ghost" type="button" data-action="add-attachment-link" style="padding:8px 14px;">إضافة الرابط</button>
        </div>
        <p class="hint" style="margin:6px 0 0;">ارفع الملف في OneDrive والصق رابط المشاركة؛ مسار يحفظ الرابط فقط لتخفيف البيانات. المرفقات القديمة محفوظة كما هي.</p>
      </div>
      <div data-role="form-actions" style="display:flex; gap:8px;">
        <button class="btn btn-primary" type="submit">حفظ</button>
        <button class="btn btn-ghost" type="button" data-cancel="1">إلغاء</button>
        <button class="link-btn" type="button" data-action="delete-action" style="color:var(--critical);">حذف الإجراء</button>
      </div>
    </form>
  `;
}

export function readActionEditorForm(form) {
  return {
    actionPatch: {
      action: form.action.value,
      target: form.target.value,
      executor: form.executor.value,
      follower: form.follower.value,
      evidence: form.evidence.value,
      period: form.period.value,
      periodStart: form.periodStart.value || null,
      periodEnd: form.periodEnd.value || null,
    },
    progressPatch: {
      status: form.status.value,
      participantsCount: form.participantsCount.value || null,
      proofNote: form.proofNote.value || null,
      obstacles: form.obstacles.value || null,
      followUpItemId: form.followUpItemId.value || null,
      effectivenessReport: form.effectivenessReport.value || null,
    },
  };
}

// يحفظ نصفَي الإجراء معًا (departmentPlanProjects.actions[] عبر
// updateAction، وactionProgress عبر saveProgress) بنفس الاستدعاء —
// المستخدِم يضغط "حفظ" مرة واحدة بلا داعٍ يعرف إن البيانات موزَّعة فعليًا
// بين مجموعتين مختلفتين بقاعدة البيانات.
export async function saveActionEditor(entry, form) {
  const { actionPatch, progressPatch } = readActionEditorForm(form);
  await updateAction(entry.projectId, entry.no, actionPatch);
  await saveProgress(entry.id, progressPatch);
}

// يبني النموذج ضمن root ويوصّل كل أحداثه (حفظ/إلغاء/حذف/مرفقات) داخليًا —
// المستدعي (خطة القسم أو الأجندة) يزوّد فقط ردود أفعال ما بعد الحفظ/الحذف/
// الإلغاء (إعادة رسم شاشته هو بالطريقة المناسبة له)، بلا حاجة يعرف أي شيء
// عن حقول actionProgress أو منطق المرفقات.
export async function mountActionEditor(root, entry, followUpOptions, { onSaved, onDeleted, onCancel } = {}) {
  root.innerHTML = actionEditorHtml(entry, followUpOptions);
  const form = root.querySelector("form");
  const remount = () => mountActionEditor(root, entry, followUpOptions, { onSaved, onDeleted, onCancel });

  form.addEventListener("click", (e) => e.stopPropagation());
  form.querySelectorAll("input, textarea, select").forEach((el) => el.addEventListener("click", (e) => e.stopPropagation()));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await saveActionEditor(entry, form);
      await onSaved?.();
    } catch (err) { notify(err.message); }
  });

  form.querySelector("[data-cancel]").addEventListener("click", (e) => {
    e.stopPropagation();
    onCancel?.();
  });

  form.querySelector("[data-action='delete-action']").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!await confirmDialog("حذف هذا الإجراء نهائيًا؟ سيُحذف معه أي تقدم أو تقرير فعالية مسجَّل له.")) return;
    await deleteAction(entry.projectId, entry.no);
    await onDeleted?.();
  });

  form.querySelector("[data-action='add-attachment-link']").addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      const url = form.querySelector("[data-role='attachment-url']").value;
      const name = form.querySelector("[data-role='attachment-name']").value;
      entry.progress = await addAttachmentLink(entry.id, { name, url });
      await remount();
    } catch (err) { notify(err.message); }
  });

  form.querySelectorAll("[data-remove-attachment]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      entry.progress = await removeAttachment(entry.id, btn.dataset.removeAttachment);
      await remount();
    });
  });
}
