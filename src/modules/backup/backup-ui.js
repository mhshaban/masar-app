import { buildBackup, downloadBackup, parseBackupFile, summarizeBackup, restoreBackup } from "../../services/backup-service.js";
import { count } from "../../services/cloud-runtime.js";
import { COLLECTIONS } from "../../core/config.js";

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
  grades: "الدرجات",
  termAverages: "المعدلات الفصلية الرسمية",
  guidanceCases: "الحالات الإرشادية",
  caseSessions: "جلسات متابعة الحالات",
  supportPlans: "خطط الدعم",
  supportPlanActions: "إجراءات خطط الدعم",
  careerSessions: "جلسات التوجيه المهني",
  importBatches: "دفعات استيراد الدرجات",
  promotedSubjects: "مقررات الطلاب المرفعين",
  promotedImportBatches: "دفعات استيراد المرفعين",
  teacherSchedule: "الجدول الدراسي التفصيلي",
  officeHours: "الساعات المكتبية للمعلمين",
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

// كان فتح هذه الشاشة يجيب نسخة احتياطية كاملة (كل صفوف كل مجموعة، بما فيها
// جدول الدرجات الضخم — 22,982+ صفًا فعليًا) فقط لعرض جدول أعداد صغير، ثم
// الضغط على "تنزيل" يعيد نفس الجلب الكامل من جديد — فحصان كاملان بدون أي
// مؤشر تحميل أو رسالة خطأ لو صار عطل شبكة بالمنتصف، فيبدو التصدير "معلّقًا"
// أو "ما يشتغل" بصمت. الملخص الآن يستخدم count() (عدّ سريع من طرف الخادم،
// بدون تنزيل الصفوف نفسها) بدل بناء نسخة كاملة، والتنزيل الفعلي وحده يبني
// النسخة الكاملة — مع مؤشر تحميل ورسالة خطأ واضحة لو تعذّر.
async function renderExportSection(root) {
  root.innerHTML = `
    <div class="card">
      <h2>تصدير نسخة احتياطية</h2>
      <p class="hint">يحمّل ملف JSON واحد يحتوي كل بيانات مسار (الخطة، الأجندة، سجل الطلبة، الدرجات، التذكيرات...) — احتفظ به في مكان آمن (بريدك، قرص خارجي).</p>
      <div id="export-summary"><p class="hint">جارٍ حساب أعداد السجلات…</p></div>
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
    summaryRoot.innerHTML = `<p class="hint" style="color:var(--critical);">تعذّر حساب أعداد السجلات: ${esc(err.message)}</p>`;
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
    } catch (err) {
      statusRoot.innerHTML = `<p class="hint" style="color:var(--critical);">تعذّر التصدير: ${esc(err.message)}</p>`;
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = originalLabel;
    }
  });
}

function renderImportSection(root, onRestored) {
  root.innerHTML = `
    <div class="card" style="margin-top:16px;">
      <h2>استيراد نسخة احتياطية</h2>
      <div class="sens">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
        <div><strong>تنبيه:</strong> البيانات مشتركة سحابيًا لكل الحسابات النشطة — هذا الاستيراد يستبدل بيانات الجميع (كل المرشدين، من أي جهاز)، وليس بيانات هذا الجهاز فقط. لا يوجد دمج. صدّر نسخة من البيانات الحالية أولًا إن أردت الاحتفاظ بها.</div>
      </div>
      <input type="file" id="import-file" aria-label="ملف النسخة الاحتياطية (JSON)" accept="application/json,.json" style="margin-bottom:12px;">
      <div id="import-preview"></div>
    </div>
  `;

  const fileInput = root.querySelector("#import-file");
  const previewRoot = root.querySelector("#import-preview");

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    previewRoot.innerHTML = '<p class="hint">جارٍ القراءة…</p>';
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
        if (!confirm("سيُستبدل كل بيانات مسار المشتركة (لكل المرشدين، وليس هذا الجهاز فقط) بمحتوى الملف نهائيًا. هل أنت متأكد؟")) return;
        await restoreBackup(data);
        previewRoot.innerHTML = '<p class="hint">تم الاستعادة بنجاح. جارٍ إعادة التحميل…</p>';
        await onRestored();
      });
    } catch (err) {
      previewRoot.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(err.message)}</p>`;
    }
  });
}

export async function mountBackupView(container) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>النسخ الاحتياطي</h1><div class="sub">بيانات مسار مخزّنة سحابيًا ومشتركة لكل الحسابات النشطة — هذه الشاشة لتصدير نسخة JSON للأرشفة، أو لاستيراد بيانات قديمة/محلية إلى السحابة</div></div>
    </div>
    <div id="backup-export"></div>
    <div id="backup-import"></div>
  `;

  await renderExportSection(container.querySelector("#backup-export"));
  renderImportSection(container.querySelector("#backup-import"), async () => {
    window.location.reload();
  });
}
