import {
  parsePromotedFile, commitPromotedBatch, listPromotedBatches, rollbackPromotedBatch, listStudentsWithPendingSubjects,
} from "./promoted-service.js";
import { parseScheduleWorkbook, commitSchedule, commitScheduleFromPdfSections, getScheduleSummary } from "../schedule/schedule-service.js";
import { extractPdfSectionSchedule } from "../../services/schedule-pdf-parser.js";
import { getCurrentProfile } from "../../services/auth-service.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const PAGE_SIZE = 50;

function matchPill(status) {
  return status === "matched"
    ? '<span class="match-matched">✓ مطابق</span>'
    : '<span class="match-unmatched">✕ غير مطابق</span>';
}

// The commit button lives inside this same re-rendered markup (not appended
// separately) from the start — a lesson learned the hard way on the grades
// import screen, where "load more" wiped a separately-appended button.
function renderReviewTable(root, rows, visibleCount, onLoadMore, onCommit) {
  const matched = rows.filter((r) => r.matchStatus === "matched").length;
  const unmatched = rows.length - matched;
  const shown = rows.slice(0, visibleCount);
  const remaining = rows.length - shown.length;

  root.innerHTML = `
    <div class="grid g3" style="margin-bottom:16px;">
      <div class="card stat"><div class="label">إجمالي الصفوف</div><div class="value">${rows.length}</div></div>
      <div class="card stat"><div class="label">مطابقة لطالب في السجل</div><div class="value">${matched}</div></div>
      <div class="card stat"><div class="label">غير مطابقة (لن تُحفظ)</div><div class="value">${unmatched}</div></div>
    </div>
    <div class="card">
      <div class="tablewrap"><table>
        <thead><tr><th>رقم الطالب</th><th>الاسم</th><th>المطابقة</th><th>المقرر</th><th>الحالة</th></tr></thead>
        <tbody>
          ${shown.map((r) => `
            <tr>
              <td class="num">${esc(r.studentId)}</td>
              <td>${esc(r.matchedStudentName) || esc(r.fileStudentName) || "—"}</td>
              <td>${matchPill(r.matchStatus)}</td>
              <td>${esc(r.subjectCode) || "—"}</td>
              <td>${r.cleared ? '<span class="pill pill-success">اجتاز</span>' : '<span class="pill pill-critical">لم يجتز بعد</span>'}</td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>
      ${remaining > 0 ? `
        <div style="display:flex; justify-content:center; padding-top:14px;">
          <button class="btn btn-ghost" id="promoted-load-more">عرض ${Math.min(remaining, PAGE_SIZE)} صفًا إضافيًا (متبقي ${remaining})</button>
        </div>
      ` : ""}
    </div>
    <div class="card" style="margin-top:16px;">
      <button class="btn btn-primary" id="promoted-commit">اعتماد الدفعة (${matched} صف سيُحفظ)</button>
    </div>
  `;
  const loadMoreBtn = root.querySelector("#promoted-load-more");
  if (loadMoreBtn) loadMoreBtn.addEventListener("click", onLoadMore);
  root.querySelector("#promoted-commit").addEventListener("click", onCommit);
}

export async function renderImportSection(root, onCommitted) {
  root.innerHTML = `
    <div class="upload-zone" id="promoted-dropzone">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
      <div>اسحب ملف كشف الطلاب الكامل (xlsx) هنا أو اضغط للاختيار</div>
      <div class="filetypes">xlsx فقط — يقرأ شيت "المرفعين" تلقائيًا من داخل الملف</div>
      <input type="file" id="promoted-file-input" accept=".xlsx" style="display:none;">
    </div>
    <div id="promoted-review"></div>
  `;

  const dropzone = root.querySelector("#promoted-dropzone");
  const fileInput = root.querySelector("#promoted-file-input");
  const reviewRoot = root.querySelector("#promoted-review");

  const handleFile = async (file) => {
    if (!file) return;
    reviewRoot.innerHTML = '<div class="card"><div class="empty">جارٍ التحليل…</div></div>';
    try {
      const { rows } = await parsePromotedFile(file);
      if (!rows.length) {
        reviewRoot.innerHTML = '<div class="card"><div class="empty">لم يُستخرج أي صف من شيت المرفعين.</div></div>';
        return;
      }
      let visibleCount = PAGE_SIZE;
      const draw = () => renderReviewTable(reviewRoot, rows, visibleCount, () => { visibleCount += PAGE_SIZE; draw(); }, commit);
      const commit = async () => {
        reviewRoot.querySelector("#promoted-commit").disabled = true;
        await commitPromotedBatch(rows, { fileName: file.name });
        reviewRoot.innerHTML = '<div class="card"><div class="empty">تم اعتماد الدفعة بنجاح.</div></div>';
        fileInput.value = "";
        await onCommitted();
      };
      draw();
    } catch (err) {
      reviewRoot.innerHTML = `<div class="card"><div class="empty">${esc(err.message)}</div></div>`;
    }
  };

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  dropzone.addEventListener("dragover", (e) => e.preventDefault());
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  });
}

export async function renderBatchHistory(root) {
  const batches = await listPromotedBatches();
  if (!batches.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا توجد دفعات استيراد بعد</div></div>';
    return;
  }
  root.innerHTML = `
    <div class="card">
      <h2>سجل الاستيراد</h2>
      <div class="tablewrap"><table>
        <thead><tr><th>الملف</th><th>التاريخ</th><th>مطابق/غير مطابق</th><th>الحالة</th><th></th></tr></thead>
        <tbody>
          ${batches.map((b) => `
            <tr data-batch="${esc(b.id)}">
              <td>${esc(b.fileName)}</td>
              <td>${esc(new Date(b.importedAt).toLocaleString("ar-BH"))}</td>
              <td class="num"><span dir="ltr">${b.matchedCount} / ${b.unmatchedCount}</span></td>
              <td>${b.status === "Committed"
                ? '<span class="pill pill-success">معتمدة</span>'
                : '<span class="pill pill-neutral">مُتراجَع عنها</span>'}</td>
              <td>${b.status === "Committed" ? '<button class="link-btn" data-action="rollback" style="color:var(--critical);">تراجع</button>' : ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>
    </div>
  `;
  root.querySelectorAll("[data-action='rollback']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const batchId = btn.closest("[data-batch]").dataset.batch;
      if (!confirm("هل تريد التراجع عن هذه الدفعة؟")) return;
      await rollbackPromotedBatch(batchId);
      await renderBatchHistory(root);
    });
  });
}

async function renderPendingList(root, onGoto) {
  const rows = await listStudentsWithPendingSubjects();
  if (!rows.length) {
    const isAdmin = !!getCurrentProfile()?.is_admin;
    root.innerHTML = `
      <div class="card"><h2>طلاب لديهم مقررات لم تُجتَز بعد</h2>
        <div class="empty">
          لا يوجد طلاب حاليًا (أو لم يُستورَد كشف المرفعين بعد)
          ${isAdmin ? '<div style="margin-top:12px;"><button class="btn btn-primary" id="promoted-goto-imports">الذهاب لتبويب الاستيراد</button></div>' : ""}
        </div>
      </div>
    `;
    const gotoBtn = root.querySelector("#promoted-goto-imports");
    if (gotoBtn && onGoto) gotoBtn.addEventListener("click", () => onGoto("imports"));
    return;
  }
  root.innerHTML = `
    <div class="card">
      <h2>طلاب لديهم مقررات لم تُجتَز بعد (${rows.length})</h2>
      <div class="tablewrap"><table>
        <thead><tr><th>الطالب</th><th>الصف</th><th>المقررات المتبقية</th></tr></thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td>${esc(r.studentName) || esc(r.studentId)}</td>
              <td>${esc(r.level) || "—"} ${esc(r.section) || ""}</td>
              <td>${r.pendingSubjects.map(esc).join("، ")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>
    </div>
  `;
}

async function renderScheduleSummary(root) {
  const { scheduleRowCount, officeHoursTeacherCount } = await getScheduleSummary();
  root.innerHTML = `
    <div class="grid g2" style="margin-bottom:12px;">
      <div class="card stat"><div class="label">صفوف الجدول الدراسي المستوردة</div><div class="value">${scheduleRowCount}</div></div>
      <div class="card stat"><div class="label">معلمون لديهم ساعات مكتبية</div><div class="value">${officeHoursTeacherCount}</div></div>
    </div>
  `;
}

export async function renderScheduleImportSection(root, onCommitted) {
  root.innerHTML = `
    <div class="card">
      <h2>الجدول الدراسي والساعات المكتبية</h2>
      <p class="hint">من نفس ملف كشف الطلاب الكامل — شيتَي "جداول المعلمين" و"الساعات المكتبية". كل استيراد يستبدل البيانات السابقة بالكامل (بيانات مرجعية، لا حاجة لتراجع تدريجي).</p>
      <div id="schedule-summary"></div>
      <input type="file" id="schedule-file-input" aria-label="ملف كشف الطلاب (جداول المعلمين والساعات المكتبية)" accept=".xlsx" style="margin-bottom:10px;">
      <div id="schedule-parse-result"></div>
    </div>
  `;

  await renderScheduleSummary(root.querySelector("#schedule-summary"));
  const fileInput = root.querySelector("#schedule-file-input");
  const resultRoot = root.querySelector("#schedule-parse-result");

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    resultRoot.innerHTML = '<p class="hint">جارٍ التحليل…</p>';
    try {
      const parsed = await parseScheduleWorkbook(file);
      resultRoot.innerHTML = `
        <p class="hint">
          ${parsed.scheduleFound ? `تم إيجاد ${parsed.scheduleRows.length} صف جدول دراسي.` : "لم يُعثر على شيت جداول المعلمين."}
          ${parsed.officeHoursFound ? ` ${parsed.officeHoursRows.length} معلم لديهم ساعات مكتبية.` : " لم يُعثر على شيت الساعات المكتبية."}
        </p>
        <button class="btn btn-primary" id="schedule-commit" style="background:var(--critical);">استبدال البيانات الحالية بهذا الاستيراد</button>
      `;
      resultRoot.querySelector("#schedule-commit").addEventListener("click", async () => {
        if (!confirm("سيُستبدل الجدول الدراسي والساعات المكتبية الحاليان بالكامل بهذا الملف. هل أنت متأكد؟")) return;
        await commitSchedule(parsed);
        resultRoot.innerHTML = '<p class="hint">تم الاستيراد بنجاح.</p>';
        fileInput.value = "";
        await renderScheduleSummary(root.querySelector("#schedule-summary"));
        await onCommitted();
      });
    } catch (err) {
      resultRoot.innerHTML = `<p class="hint" style="color:var(--critical);">${esc(err.message)}</p>`;
    }
  });
}

// مصدر ثانٍ لنفس بيانات الجدول الدراسي — بدل شيت "جداول المعلمين" الكامل،
// المدرسة ترفع ملف PDF "جدول حصص الفصل الدراسي" الرسمي منفصلًا لكل شعبة.
// يقبل عدة ملفات دفعة واحدة (شعبة واحدة لكل ملف)، ويعرض تقرير الشعب
// المستخرجة قبل أي اعتماد فعلي — نفس فلسفة استيراد صور الطلبة.
export async function renderSchedulePdfImportSection(root, onCommitted) {
  root.innerHTML = `
    <div class="card" style="margin-top:16px;">
      <h2>استيراد جدول شعب (PDF)</h2>
      <p class="hint">اختر عدة ملفات PDF دفعة واحدة — ملف "جدول حصص الفصل الدراسي" الرسمي لكل شعبة على حِدة. كل شعبة تُستبدل بياناتها بالكامل دون التأثير على بقية الشعب المستوردة مسبقًا.</p>
      <input type="file" id="schedule-pdf-input" aria-label="ملفات جدول حصص الشعب (PDF)" accept="application/pdf,.pdf" multiple style="margin-bottom:12px;">
      <div id="schedule-pdf-preview"></div>
    </div>
  `;

  const fileInput = root.querySelector("#schedule-pdf-input");
  const previewRoot = root.querySelector("#schedule-pdf-preview");

  fileInput.addEventListener("change", async () => {
    const files = [...fileInput.files];
    if (!files.length) return;
    previewRoot.innerHTML = '<p class="hint">جارٍ قراءة الملفات…</p>';

    const parsed = []; // { fileName, section }
    const failed = []; // { fileName, reason }
    for (const file of files) {
      try {
        const result = await extractPdfSectionSchedule(file);
        if (!result.section || !result.rows.length) {
          failed.push({ fileName: file.name, reason: "تعذّر التعرّف على الشعبة أو الحصص داخل الملف" });
        } else {
          parsed.push({ fileName: file.name, ...result });
        }
      } catch (err) {
        failed.push({ fileName: file.name, reason: err.message || "تعذّرت قراءة الملف" });
      }
    }

    previewRoot.innerHTML = `
      ${parsed.length ? `
        <div class="tablewrap"><table>
          <thead><tr><th>الملف</th><th>الشعبة</th><th>المستوى</th><th>عدد الحصص</th></tr></thead>
          <tbody>
            ${parsed.map((p) => `
              <tr><td>${esc(p.fileName)}</td><td>${esc(p.section)}</td><td>${esc(p.level) || "—"}</td><td class="num">${p.rows.length}</td></tr>
            `).join("")}
          </tbody>
        </table></div>
      ` : ""}
      ${failed.length ? `
        <details style="margin-top:10px;">
          <summary class="hint" style="cursor:pointer;">ملفات تعذّرت قراءتها (${failed.length})</summary>
          <ul class="plain">${failed.map((f) => `<li class="row-item"><div class="body"><div class="title">${esc(f.fileName)}</div><div class="meta">${esc(f.reason)}</div></div></li>`).join("")}</ul>
        </details>
      ` : ""}
      ${parsed.length ? `<button class="btn btn-primary" id="schedule-pdf-commit" style="margin-top:12px; background:var(--critical);">استبدال جدول ${parsed.length} شعبة بهذا الاستيراد</button>` : ""}
    `;

    const commitBtn = previewRoot.querySelector("#schedule-pdf-commit");
    if (!commitBtn) return;
    commitBtn.addEventListener("click", async () => {
      if (!confirm(`سيُستبدل الجدول الدراسي لـ${parsed.length} شعبة بمحتوى هذه الملفات. بقية الشعب لن تتأثر. هل أنت متأكد؟`)) return;
      commitBtn.disabled = true;
      const total = await commitScheduleFromPdfSections(parsed);
      previewRoot.innerHTML = `<p class="hint">تم استيراد ${total} صفًا عبر ${parsed.length} شعبة بنجاح.</p>`;
      fileInput.value = "";
      await onCommitted();
    });
  });
}

export async function mountPromotedView(container, { onGoto } = {}) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>الطلاب المرفعين</h1><div class="sub">طلاب انتقلوا من الإعدادية بمقررات لم تُستوفَ بعد — من شيت "المرفعين" في كشف الطلاب</div></div>
    </div>
    <div id="promoted-pending" style="margin-bottom:16px;"></div>
  `;

  const pendingRoot = container.querySelector("#promoted-pending");
  await renderPendingList(pendingRoot, onGoto);
}
