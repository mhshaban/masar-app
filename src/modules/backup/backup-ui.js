import { buildBackup, downloadBackup, parseBackupFile, summarizeBackup, restoreBackup } from "../../services/backup-service.js";
import { authenticateAndMigrateCloudData } from "../../services/local-migration-service.js?v=local-3";
import { count, save } from "../../services/storage-runtime.js";
import { COLLECTIONS } from "../../core/config.js?v=local-1";
import { loadingHtml, errorHtml, showToast, confirmDialog } from "../shared/ui-states.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const COLLECTION_LABELS = {
  departmentPlanProjects: "مشاريع خطة القسم",
  agendaStatus: "بنود المتابعة المستوردة (تاريخي)",
  actionProgress: "حالة تنفيذ الإجراءات",
  followUpItems: "بنود تقرير المتابعة",
  reminders: "التذكيرات",
  students: "سجل الطلبة",
  academicFlags: "بيانات أكاديمية مجمَّعة (من تحليل Cowork)",
  termAverages: "المعدلات الفصلية الرسمية",
  guidanceCases: "الحالات الإرشادية",
  caseSessions: "جلسات متابعة الحالات",
  supportPlans: "خطط الدعم",
  supportPlanActions: "إجراءات خطط الدعم",
  careerSessions: "جلسات التوجيه المهني",
  promotedSubjects: "مقررات الطلاب المرفعين",
  promotedImportBatches: "دفعات استيراد المرفعين",
  departmentForms: "الاستمارات",
  schoolTeachers: "سجل المعلمين",
  localUsers: "حسابات المستخدمين المحلية",
  appSettings: "إعدادات مسار المحلية",
};

function renderSummary(counts) {
  const rows = Object.entries(counts).filter(([, n]) => n > 0);
  if (!rows.length) return '<p class="hint">لا توجد بيانات في هذه النسخة.</p>';
  return `
    <div class="tablewrap"><table>
      <tbody>
        ${rows.map(([key, n]) => `
          <tr><td>${esc(COLLECTION_LABELS[key] || key)}</td><td class="num">${n}</td></tr>
        `).join("")}
      </tbody>
    </table></div>
  `;
}

// الملخص يستخدم count() بدل بناء نسخة كاملة، والتنزيل الفعلي وحده يقرأ
// السجلات والصور ويجمعها في ملف JSON واحد.
async function renderExportSection(root) {
  root.innerHTML = `
    <div class="card">
      <h2>تصدير نسخة احتياطية</h2>
      <p class="hint">يحمّل ملف JSON واحد يحتوي بيانات مسار المحلية كاملة، بما فيها الحسابات والصور — احفظه في OneDrive أو قرص خارجي آمن.</p>
      <div id="export-summary">${loadingHtml("جارٍ حساب أعداد السجلات…")}</div>
      <button class="btn btn-primary" id="export-btn" style="margin-top:12px;" disabled>تنزيل نسخة احتياطية الآن</button>
      <div id="export-status" style="margin-top:8px;"></div>
    </div>
  `;

  const summaryRoot = root.querySelector("#export-summary");
  const exportBtn = root.querySelector("#export-btn");
  const statusRoot = root.querySelector("#export-status");

  try {
    const counts = {};
    for (const name of COLLECTIONS) counts[name] = await count(name);
    summaryRoot.innerHTML = renderSummary(counts);
  } catch (err) {
    summaryRoot.innerHTML = errorHtml(`تعذّر حساب أعداد السجلات: ${err.message}`);
  }
  exportBtn.disabled = false;

  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    const originalLabel = exportBtn.textContent;
    exportBtn.textContent = "جارٍ التحضير… قد يستغرق دقيقة مع البيانات الكبيرة";
    statusRoot.innerHTML = "";
    try {
      const fresh = await buildBackup();
      downloadBackup(fresh);
      await save("appSettings", { id: "last-backup-export", exportedAt: new Date().toISOString() });
      showToast("تم تنزيل النسخة الاحتياطية بنجاح");
    } catch (err) {
      statusRoot.innerHTML = errorHtml(`تعذّر التصدير: ${err.message}`);
      showToast(`تعذّر التصدير: ${err.message}`, { type: "error" });
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = originalLabel;
    }
  });
}

function renderCloudTransferSection(root) {
  root.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <h2>نقل البيانات من Supabase</h2>
      <p class="hint">استخدم حساب مسار السحابي القديم لنسخ البيانات إلى هذا المتصفح. تعيد العملية استبدال المجموعات المحلية بنسخة Supabase ولا تحذف أي بيانات من السحابة.</p>
      <form id="cloud-transfer-form" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div style="flex:1;min-width:220px;"><label class="hint" for="transfer-email">البريد الإلكتروني في مسار القديم</label><input id="transfer-email" name="email" type="email" required autocomplete="username" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:9px;background:var(--surface);color:inherit;"></div>
        <div style="flex:1;min-width:220px;"><label class="hint" for="transfer-password">كلمة مرور مسار القديم</label><input id="transfer-password" name="password" type="password" required autocomplete="current-password" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:9px;background:var(--surface);color:inherit;"></div>
        <button class="btn btn-primary" type="submit">إعادة نقل البيانات الآن</button>
      </form>
      <div id="cloud-transfer-status" style="margin-top:10px;"></div>
    </div>`;
  const form = root.querySelector("#cloud-transfer-form");
  const status = root.querySelector("#cloud-transfer-status");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true; button.textContent = "جارٍ النقل…"; status.innerHTML = "";
    try {
      const result = await authenticateAndMigrateCloudData(form.email.value, form.password.value, {
        onProgress: ({ index, total }) => { button.textContent = `جارٍ النقل… ${index + 1} من ${total}`; },
      });
      form.password.value = "";
      status.innerHTML = `<div class="login-notice info" role="status">تم نقل البيانات بنجاح. المشاريع: ${result.counts.departmentPlanProjects || 0}، الطلبة: ${result.counts.students || 0}، المعدلات: ${result.counts.termAverages || 0}، المعلمون: ${result.counts.schoolTeachers || 0}. جارٍ إعادة التحميل…</div>`;
      setTimeout(() => location.reload(), 1800);
    } catch (err) {
      form.password.value = "";
      status.innerHTML = errorHtml(err.message || "تعذر نقل البيانات من Supabase");
      button.disabled = false; button.textContent = "إعادة نقل البيانات الآن";
    }
  });
}

export function renderImportSection(root, onRestored) {
  root.innerHTML = `
    <div class="card" style="margin-top:16px;">
      <h2>استيراد نسخة احتياطية</h2>
      <div class="sens">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
        <div><strong>تنبيه:</strong> الاستيراد يستبدل بيانات مسار المحلية على هذا المتصفح فقط. لا يوجد دمج؛ صدّر نسخة من البيانات الحالية أولًا.</div>
      </div>
      <input type="file" id="import-file" aria-label="ملف النسخة الاحتياطية (JSON)" accept="application/json,.json" style="margin-bottom:12px;">
      <div id="import-preview"></div>
    </div>
  `;

  const fileInput = root.querySelector("#import-file");
  const previewRoot = root.querySelector("#import-preview");

  const MAX_BACKUP_BYTES = 100 * 1024 * 1024; // نسخة كاملة حقيقية بأكبر جدول حالي (~23 ألف صف درجات) أقل من هذا بكثير — أي ملف أكبر غالبًا تالف أو ليس نسخة مسار
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!/\.json$/i.test(file.name)) {
      previewRoot.innerHTML = errorHtml("الملف يجب أن يكون بصيغة JSON (.json)");
      fileInput.value = "";
      return;
    }
    if (file.size > MAX_BACKUP_BYTES) {
      previewRoot.innerHTML = errorHtml(`حجم الملف كبير جدًا (${(file.size / 1024 / 1024).toFixed(1)} م.ب) — تأكد أنه نسخة احتياطية حقيقية من مسار`);
      fileInput.value = "";
      return;
    }
    previewRoot.innerHTML = loadingHtml("جارٍ القراءة…");
    try {
      const text = await file.text();
      const data = parseBackupFile(text);
      const counts = summarizeBackup(data);
      previewRoot.innerHTML = `
        <p class="hint">من ${esc(data.exportedAt ? new Date(data.exportedAt).toLocaleString("ar-BH") : "تاريخ غير معروف")}:</p>
        ${renderSummary(counts)}
        <button class="btn btn-primary" id="restore-btn" style="margin-top:12px; background:var(--critical);">استبدال كل البيانات الحالية بهذه النسخة</button>
      `;
      previewRoot.querySelector("#restore-btn").addEventListener("click", async () => {
        if (!confirmDialog("سيُستبدل كل بيانات مسار المحلية على هذا المتصفح بمحتوى الملف. هل أنت متأكد؟")) return;
        previewRoot.innerHTML = loadingHtml("جارٍ الاستعادة…");
        try {
          await restoreBackup(data);
          previewRoot.innerHTML = '<p class="hint" role="status">تم الاستعادة بنجاح. جارٍ إعادة التحميل…</p>';
          await onRestored();
        } catch (err) {
          previewRoot.innerHTML = errorHtml(`تعذّرت الاستعادة: ${err.message}`);
          showToast(`تعذّرت الاستعادة: ${err.message}`, { type: "error" });
        }
      });
    } catch (err) {
      previewRoot.innerHTML = errorHtml(err.message);
    }
  });
}

export async function mountBackupView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>النسخ الاحتياطي المحلي</h1><div class="sub">صدّر ملفًا كاملًا واحفظه في OneDrive أسبوعيًا لحماية بيانات هذا الجهاز</div></div>
    </div>
    <div id="cloud-transfer"></div>
    <div id="backup-export"></div>
  `;

  renderCloudTransferSection(container.querySelector("#cloud-transfer"));
  await renderExportSection(container.querySelector("#backup-export"));
}
