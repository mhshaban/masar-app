import {
  parseGradesFile,
  parseCertificateFiles,
  commitImportBatch,
  listBatches,
  rollbackBatch,
  getGradeStats,
  buildGradesExportRows,
} from "./grades-import-service.js";
import { computeStudentAchievement, computeSubjectAchievement, TIER_LABELS } from "./achievement-service.js";
import { computeStudentGradeSummaries } from "./grade-flags-service.js";
import { downloadRowsAsXlsx } from "../../services/xlsx-export.js";

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

const SCORE_STATUS_LABELS = { absent: "غائب", barred: "محروم" };

function scoreStatusLabel(status) {
  return SCORE_STATUS_LABELS[status] || status;
}

function scoreCell(r) {
  return r.scoreStatus ? esc(scoreStatusLabel(r.scoreStatus)) : (r.score != null ? esc(r.score) : "—");
}

// The commit button is rendered as part of this same innerHTML (not
// appended as a separate DOM node afterward) and re-bound on every call —
// otherwise a later re-render of this root (e.g. clicking "load more" on a
// large batch) wipes it via innerHTML replacement, silently losing the only
// way to actually save the batch. Confirmed against a real ~11,000-row
// import: the button disappeared after paging through the review table.
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
        <thead><tr><th>رقم الطالب</th><th>الاسم في الملف</th><th>المطابقة</th><th>رمز المقرر</th><th>الدرجة</th><th>الدرجة النهائية</th></tr></thead>
        <tbody>
          ${shown.map((r) => `
            <tr>
              <td class="num">${esc(r.studentId)}</td>
              <td>${esc(r.fileStudentName) || esc(r.matchedStudentName) || "—"}</td>
              <td>${matchPill(r.matchStatus)}</td>
              <td>${esc(r.subjectCode) || "—"}</td>
              <td class="num">${scoreCell(r)}</td>
              <td class="num">${r.maxScore != null ? esc(r.maxScore) : "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>
      ${remaining > 0 ? `
        <div style="display:flex; justify-content:center; padding-top:14px;">
          <button class="btn btn-ghost" id="grades-load-more">عرض ${Math.min(remaining, PAGE_SIZE)} صفًا إضافيًا (متبقي ${remaining})</button>
        </div>
      ` : ""}
    </div>
    <div class="card" style="margin-top:16px;">
      <button class="btn btn-primary" id="grades-commit">اعتماد الدفعة (${matched} صف سيُحفظ)</button>
    </div>
  `;
  const loadMoreBtn = root.querySelector("#grades-load-more");
  if (loadMoreBtn) loadMoreBtn.addEventListener("click", onLoadMore);
  root.querySelector("#grades-commit").addEventListener("click", onCommit);
}

function renderCertificateReviewTable(root, rows, termSummaries, visibleCount, onLoadMore, onCommit) {
  const matched = rows.filter((r) => r.matchStatus === "matched").length;
  const unmatched = rows.length - matched;
  const shown = rows.slice(0, visibleCount);
  const remaining = rows.length - shown.length;
  const matchedTermCount = termSummaries.filter((t) => t.matchStatus === "matched").length;

  root.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px;">
      <div class="card stat"><div class="label">إجمالي صفوف الدرجات</div><div class="value">${rows.length}</div></div>
      <div class="card stat"><div class="label">مطابقة لطالب في السجل</div><div class="value">${matched}</div></div>
      <div class="card stat"><div class="label">غير مطابقة (لن تُحفظ)</div><div class="value">${unmatched}</div></div>
      <div class="card stat"><div class="label">معدلات فصلية رسمية ستُحفظ</div><div class="value">${matchedTermCount}</div></div>
    </div>
    <div class="card">
      <div class="tablewrap"><table>
        <thead><tr><th>رقم الطالب</th><th>الاسم</th><th>المطابقة</th><th>الفترة</th><th>المقرر</th><th>الدرجة</th></tr></thead>
        <tbody>
          ${shown.map((r) => `
            <tr>
              <td class="num">${esc(r.studentId)}</td>
              <td>${esc(r.matchedStudentName) || esc(r.fileStudentName) || "—"}</td>
              <td>${matchPill(r.matchStatus)}</td>
              <td>${esc(r.term)}</td>
              <td>${esc(r.subjectCode)} — ${esc(r.subjectName)}</td>
              <td class="num">${scoreCell(r)}${r.notes ? ` (${esc(r.notes)})` : ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table></div>
      ${remaining > 0 ? `
        <div style="display:flex; justify-content:center; padding-top:14px;">
          <button class="btn btn-ghost" id="cert-load-more">عرض ${Math.min(remaining, PAGE_SIZE)} صفًا إضافيًا (متبقي ${remaining})</button>
        </div>
      ` : ""}
    </div>
    <div class="card" style="margin-top:16px;">
      <button class="btn btn-primary" id="cert-commit">اعتماد الدفعة (${matched} صف سيُحفظ)</button>
    </div>
  `;
  const loadMoreBtn = root.querySelector("#cert-load-more");
  if (loadMoreBtn) loadMoreBtn.addEventListener("click", onLoadMore);
  root.querySelector("#cert-commit").addEventListener("click", onCommit);
}

function renderFileSummaries(root, fileSummaries) {
  const failed = fileSummaries.filter((f) => !f.ok);
  if (!failed.length) return;
  root.innerHTML = `
    <div class="card" style="margin-top:12px; border-color:var(--critical);">
      <h3>ملفات تعذّرت قراءتها (${failed.length})</h3>
      <ul class="plain">
        ${failed.map((f) => `<li class="row-item"><div class="body"><div class="title">${esc(f.fileName)}</div><div class="meta">${esc(f.error)}</div></div></li>`).join("")}
      </ul>
    </div>
  `;
}

async function renderCertificateImportSection(root, onCommitted) {
  root.innerHTML = `
    <div class="upload-zone" id="cert-dropzone">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
      <div>اسحب شهادات الطلبة (PDF) هنا أو اضغط للاختيار — يمكن اختيار عدة ملفات دفعة واحدة</div>
      <div class="filetypes">pdf فقط — قالب "سجل الطالب الدراسي" الرسمي لوزارة التربية والتعليم</div>
      <input type="file" id="cert-file-input" accept=".pdf" multiple style="display:none;">
    </div>
    <div id="cert-progress"></div>
    <div id="cert-file-errors"></div>
    <div id="cert-review"></div>
  `;

  const dropzone = root.querySelector("#cert-dropzone");
  const fileInput = root.querySelector("#cert-file-input");
  const progressRoot = root.querySelector("#cert-progress");
  const errorsRoot = root.querySelector("#cert-file-errors");
  const reviewRoot = root.querySelector("#cert-review");

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    progressRoot.innerHTML = `<div class="card"><div class="empty">جارٍ تحليل ${files.length} ملفًا…</div></div>`;
    reviewRoot.innerHTML = "";
    errorsRoot.innerHTML = "";

    const { rows, termSummaries, fileSummaries } = await parseCertificateFiles(files);
    progressRoot.innerHTML = "";
    renderFileSummaries(errorsRoot, fileSummaries);

    if (!rows.length) {
      reviewRoot.innerHTML = '<div class="card"><div class="empty">لم يُستخرج أي صف درجات من الملفات المختارة.</div></div>';
      return;
    }

    let visibleCount = PAGE_SIZE;
    const draw = () => renderCertificateReviewTable(reviewRoot, rows, termSummaries, visibleCount, () => { visibleCount += PAGE_SIZE; draw(); }, commit);
    const commit = async () => {
      reviewRoot.querySelector("#cert-commit").disabled = true;
      await commitImportBatch(rows, { fileName: `${files.length} شهادة PDF` }, termSummaries);
      reviewRoot.innerHTML = '<div class="card"><div class="empty">تم اعتماد الدفعة بنجاح.</div></div>';
      fileInput.value = "";
      await onCommitted();
    };
    draw();
  };

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => handleFiles(fileInput.files));
  dropzone.addEventListener("dragover", (e) => e.preventDefault());
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  });
}

async function renderBatchHistory(root) {
  const batches = await listBatches();
  if (!batches.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا توجد دفعات استيراد بعد</div></div>';
    return;
  }
  root.innerHTML = `
    <div class="card">
      <h3>سجل الاستيراد</h3>
      <div class="tablewrap"><table>
        <thead><tr><th>الملف</th><th>الفترة</th><th>التاريخ</th><th>مطابق/غير مطابق</th><th>الحالة</th><th></th></tr></thead>
        <tbody>
          ${batches.map((b) => `
            <tr data-batch="${esc(b.id)}">
              <td>${esc(b.fileName)}</td>
              <td>${esc(b.term)}</td>
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
      if (!confirm("هل تريد التراجع عن هذه الدفعة؟ سيتم حذف كل الدرجات المستوردة منها.")) return;
      await rollbackBatch(batchId);
      await renderBatchHistory(root);
    });
  });
}

async function renderImportTab(root) {
  root.innerHTML = `
    <div class="upload-zone" id="grades-dropzone">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
      <div>اسحب ملف الإكسل هنا أو اضغط للاختيار</div>
      <div class="filetypes">xlsx فقط — يُتوقَّع عمودا "رقم الطالب" و"الدرجة" على الأقل</div>
      <input type="file" id="grades-file-input" accept=".xlsx" style="display:none;">
    </div>
    <div class="card" style="margin-bottom:16px;">
      <label class="hint" style="display:block;margin-bottom:6px;">تسمية الفترة (تُحفظ مع كل درجة، مثال: الوقفة التقويمية الأولى)</label>
      <input id="grades-term-input" type="text" placeholder="مثال: الوقفة التقويمية الأولى — الفصل الأول 2025/2026" style="width:100%; max-width:420px; padding:10px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
    </div>
    <div id="grades-review"></div>

    <div class="card" style="margin:24px 0 16px; background:transparent; border:none; box-shadow:none; padding:0;">
      <h3 style="margin-bottom:2px;">استيراد شهادات الطلبة (PDF)</h3>
      <p class="hint">مسار ثانوي أقل دقة من الإكسل حسب التصميم — استخراج نصي من قالب "سجل الطالب الدراسي" الرسمي.</p>
    </div>
    <div id="cert-import-root"></div>

    <div id="grades-history" style="margin-top:20px;"></div>
  `;

  const dropzone = root.querySelector("#grades-dropzone");
  const fileInput = root.querySelector("#grades-file-input");
  const termInput = root.querySelector("#grades-term-input");
  const reviewRoot = root.querySelector("#grades-review");
  const historyRoot = root.querySelector("#grades-history");
  const certRoot = root.querySelector("#cert-import-root");

  await renderBatchHistory(historyRoot);
  await renderCertificateImportSection(certRoot, () => renderBatchHistory(historyRoot));

  let currentRows = null;
  let currentFile = null;
  let visibleCount = PAGE_SIZE;

  const handleFile = async (file) => {
    if (!file) return;
    currentFile = file;
    reviewRoot.innerHTML = '<div class="card"><div class="empty">جارٍ التحليل…</div></div>';
    try {
      const { rows } = await parseGradesFile(file);
      currentRows = rows;
      visibleCount = PAGE_SIZE;
      const draw = () => renderReviewTable(reviewRoot, currentRows, visibleCount, () => { visibleCount += PAGE_SIZE; draw(); }, commit);
      const commit = async () => {
        if (!termInput.value.trim()) {
          alert("الرجاء تسمية الفترة قبل الاعتماد.");
          return;
        }
        reviewRoot.querySelector("#grades-commit").disabled = true;
        await commitImportBatch(currentRows, { term: termInput.value.trim(), fileName: currentFile.name });
        reviewRoot.innerHTML = '<div class="card"><div class="empty">تم اعتماد الدفعة بنجاح.</div></div>';
        fileInput.value = "";
        await renderBatchHistory(historyRoot);
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

async function renderAnalyticsTab(root) {
  const stats = await getGradeStats();
  if (!stats.total) {
    root.innerHTML = '<div class="card"><div class="empty">لا توجد درجات مستوردة بعد</div></div>';
    return;
  }
  root.innerHTML = `
    <div class="topbar" style="margin-bottom:16px;">
      <div></div>
      <button class="btn btn-ghost" id="grades-export-xlsx-btn">تصدير الدرجات كإكسل</button>
    </div>
    <div class="grid g4" style="margin-bottom:16px;">
      <div class="card stat"><div class="label">إجمالي الدرجات المستوردة</div><div class="value">${stats.total}</div></div>
      <div class="card stat"><div class="label">المعدل العام</div><div class="value">${stats.overallAvg}٪</div></div>
    </div>
    <div class="card">
      <h3>المعدل حسب المقرر</h3>
      <p class="hint">مرتبة من الأضعف إلى الأعلى لتحديد المقررات التي تحتاج دعمًا أولًا.</p>
      <div class="tablewrap"><table>
        <thead><tr><th>رمز المقرر</th><th>عدد الدرجات</th><th>المعدل</th></tr></thead>
        <tbody>
          ${stats.subjectStats.map((s) => `
            <tr><td>${esc(s.code)}</td><td class="num">${s.count}</td><td class="num">${s.avgPct != null ? s.avgPct + "٪" : "—"}</td></tr>
          `).join("")}
        </tbody>
      </table></div>
    </div>
    <div id="grades-export-status" style="margin-top:10px;"></div>
  `;

  const exportBtn = root.querySelector("#grades-export-xlsx-btn");
  const statusRoot = root.querySelector("#grades-export-status");
  exportBtn.addEventListener("click", async () => {
    exportBtn.disabled = true;
    const originalLabel = exportBtn.textContent;
    exportBtn.textContent = "جارٍ التحضير… قد يستغرق دقيقة مع البيانات الكبيرة";
    statusRoot.innerHTML = "";
    try {
      const rows = await buildGradesExportRows();
      downloadRowsAsXlsx(`درجات-مسار-${new Date().toISOString().slice(0, 10)}`, "الدرجات", rows);
    } catch (err) {
      statusRoot.innerHTML = `<p class="hint" style="color:var(--critical);">تعذّر التصدير: ${esc(err.message)}</p>`;
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = originalLabel;
    }
  });
}

function tierPill(tier) {
  if (tier === "high") return "pill-success";
  if (tier === "medium") return "pill-warning";
  return "pill-critical";
}

function renderOverallClassification(root, achievement, needsSupport, onGoto) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const r of achievement) counts[r.tier] += 1;
  const nameById = new Map(achievement.map((r) => [r.studentId, r.studentName]));

  root.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px;">
      <div class="card stat"><div class="label">متفوقون (90٪ فأكثر)</div><div class="value">${counts.high}</div></div>
      <div class="card stat"><div class="label">متوسطو التحصيل (60–90٪)</div><div class="value">${counts.medium}</div></div>
      <div class="card stat"><div class="label">متدنو التحصيل (أقل من 60٪)</div><div class="value">${counts.low}</div></div>
      <div class="card stat"><div class="label">يحتاجون تدخل (دعم أكاديمي)</div><div class="value" style="color:var(--critical);">${needsSupport.length}</div></div>
    </div>
    <div class="chip-row" id="tier-chips">
      <div class="chip on" data-tier="">الكل (${achievement.length})</div>
      <div class="chip" data-tier="high">${TIER_LABELS.high} (${counts.high})</div>
      <div class="chip" data-tier="medium">${TIER_LABELS.medium} (${counts.medium})</div>
      <div class="chip" data-tier="low">${TIER_LABELS.low} (${counts.low})</div>
    </div>
    <div id="tier-table"></div>

    <div class="card" style="margin-top:20px;">
      <div class="card-head">
        <h3>يحتاجون تدخل (دعم أكاديمي)</h3>
        <button class="link-btn" data-goto="support">فتح شاشة خطط الدعم</button>
      </div>
      <p class="hint">المعدل العام أو إحدى المواد أقل من 50٪ — نفس القائمة المستخدمة لمرشّحي الحالات الإرشادية وخطط الدعم، فلا تختلف الأرقام بين الشاشات.</p>
      <div id="needs-support-list"></div>
    </div>
  `;

  const drawTable = (tier) => {
    const rows = tier ? achievement.filter((r) => r.tier === tier) : achievement;
    root.querySelector("#tier-table").innerHTML = `
      <div class="card">
        <div class="tablewrap"><table>
          <thead><tr><th>الطالب</th><th>الصف</th><th>المعدل العام</th><th>التقدير</th><th>مواد ضعيفة (أقل من 50٪)</th></tr></thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                <td>${esc(r.studentName) || esc(r.studentId)}</td>
                <td>${esc(r.level) || "—"} ${esc(r.section) || ""}</td>
                <td class="num" style="font-weight:700;">${r.avgPct}٪</td>
                <td><span class="pill ${tierPill(r.tier)}">${esc(r.rating)}</span></td>
                <td>${r.weakSubjects.length ? esc(r.weakSubjects.map((w) => `${w.subject} (${w.pct}٪)`).join("، ")) : "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table></div>
      </div>
    `;
  };
  drawTable("");

  root.querySelectorAll("#tier-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      root.querySelectorAll("#tier-chips .chip").forEach((c) => c.classList.remove("on"));
      chip.classList.add("on");
      drawTable(chip.dataset.tier);
    });
  });

  const needsRoot = root.querySelector("#needs-support-list");
  needsRoot.innerHTML = needsSupport.length
    ? `<ul class="plain">${needsSupport.map((s) => `
        <li class="row-item">
          <div class="body">
            <div class="title">${esc(nameById.get(s.studentId)) || esc(s.studentId)}</div>
            <div class="meta">${s.reasons.map(esc).join(" · ")}</div>
          </div>
        </li>
      `).join("")}</ul>`
    : '<div class="empty">لا يوجد طلاب يحتاجون تدخلًا حاليًا</div>';

  root.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => onGoto && onGoto(btn.dataset.goto));
  });
}

function renderSubjectClassification(root, subjectAchievement) {
  if (!subjectAchievement.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا توجد درجات مستوردة بعد</div></div>';
    return;
  }

  root.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <label class="hint" style="display:block;margin-bottom:6px;">اختر مقررًا</label>
      <select id="subject-select" style="width:100%; max-width:320px; padding:9px 12px; border-radius:9px; border:1px solid var(--border); font-family:inherit; font-size:13px; background:var(--surface); color:inherit;">
        ${subjectAchievement.map((s) => `<option value="${esc(s.subject)}">${esc(s.subject)} (${s.students.length} طالبًا)</option>`).join("")}
      </select>
    </div>
    <div id="subject-detail"></div>
  `;

  const detailRoot = root.querySelector("#subject-detail");
  const drawSubject = (subjectName) => {
    const subject = subjectAchievement.find((s) => s.subject === subjectName) || subjectAchievement[0];
    detailRoot.innerHTML = `
      <div class="grid g3" style="margin-bottom:16px;">
        <div class="card stat"><div class="label">${TIER_LABELS.high} (90٪ فأكثر)</div><div class="value">${subject.counts.high}</div></div>
        <div class="card stat"><div class="label">${TIER_LABELS.medium} (60–90٪)</div><div class="value">${subject.counts.medium}</div></div>
        <div class="card stat"><div class="label">${TIER_LABELS.low} (أقل من 60٪)</div><div class="value">${subject.counts.low}</div></div>
      </div>
      <div class="card">
        <h3>${esc(subject.subject)}</h3>
        <p class="hint">مرتبة من الأضعف إلى الأعلى.</p>
        <div class="tablewrap"><table>
          <thead><tr><th>الطالب</th><th>الصف</th><th>الدرجة</th><th>التقدير</th></tr></thead>
          <tbody>
            ${subject.students.map((s) => `
              <tr>
                <td>${esc(s.studentName) || esc(s.studentId)}</td>
                <td>${esc(s.level) || "—"} ${esc(s.section) || ""}</td>
                <td class="num" style="font-weight:700;">${s.pct}٪</td>
                <td><span class="pill ${tierPill(s.tier)}">${esc(s.rating)}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table></div>
      </div>
    `;
  };
  drawSubject(subjectAchievement[0].subject);
  root.querySelector("#subject-select").addEventListener("change", (e) => drawSubject(e.target.value));
}

async function renderClassificationTab(root, onGoto) {
  const [achievement, subjectAchievement, needsSupport] = await Promise.all([
    computeStudentAchievement(),
    computeSubjectAchievement(),
    computeStudentGradeSummaries(),
  ]);
  if (!achievement.length) {
    root.innerHTML = '<div class="card"><div class="empty">لا توجد درجات مستوردة بعد</div></div>';
    return;
  }

  root.innerHTML = `
    <div class="chip-row" id="classification-mode-chips">
      <div class="chip on" data-mode="overall">حسب المعدل العام</div>
      <div class="chip" data-mode="subject">حسب المادة</div>
    </div>
    <div id="classification-content"></div>
  `;

  const contentRoot = root.querySelector("#classification-content");
  const drawMode = (mode) => {
    if (mode === "subject") renderSubjectClassification(contentRoot, subjectAchievement);
    else renderOverallClassification(contentRoot, achievement, needsSupport, onGoto);
  };
  drawMode("overall");

  root.querySelectorAll("#classification-mode-chips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      root.querySelectorAll("#classification-mode-chips .chip").forEach((c) => c.classList.remove("on"));
      chip.classList.add("on");
      drawMode(chip.dataset.mode);
    });
  });
}

export async function mountGradesView(container, { onGoto } = {}) {
  container.innerHTML = `
    <div class="topbar">
      <div><h1>الدرجات والتحليلات</h1><div class="sub">استيراد كشوف الدرجات من إكسل ومراجعتها قبل الاعتماد</div></div>
    </div>
    <div class="tabs">
      <div class="tab active" data-tab="import">استيراد</div>
      <div class="tab" data-tab="analytics">التحليلات</div>
      <div class="tab" data-tab="classification">تصنيف الطلاب</div>
    </div>
    <div id="grades-import-root"></div>
    <div id="grades-analytics-root" style="display:none;"></div>
    <div id="grades-classification-root" style="display:none;"></div>
  `;

  const importRoot = container.querySelector("#grades-import-root");
  const analyticsRoot = container.querySelector("#grades-analytics-root");
  const classificationRoot = container.querySelector("#grades-classification-root");
  const roots = { import: importRoot, analytics: analyticsRoot, classification: classificationRoot };

  await renderImportTab(importRoot);
  await renderAnalyticsTab(analyticsRoot);

  container.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      container.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const active = tab.dataset.tab;
      Object.entries(roots).forEach(([key, root]) => { root.style.display = key === active ? "" : "none"; });
      if (active === "analytics") await renderAnalyticsTab(analyticsRoot);
      if (active === "classification") await renderClassificationTab(classificationRoot, onGoto);
    });
  });
}
