import { renderCurriculumResults, curriculumTrack } from "./curriculum-results.js?v=2026-09-11-curriculum-import-1";
import { getStudentTermTimeline, getStudentAcademicSummary, termSlots, officialAverage } from "./term-progress-service.js?v=2026-09-08-academic-1";
import { findStudentCertificates, readStudentCertificate } from "./student-certificate-local.js?v=2026-09-07-academic-fix-1";
import { listWhere } from "../../services/cloud-runtime.js";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const statusLabels = { absent: "غائب", barred: "محروم" };

export function renderCertificateResults(certificate) {
  return certificate.terms.filter((term) => term.subjects.length).map((term) => `<section style="margin-top:16px;"><h3>${esc(term.label)}</h3><div class="tablewrap"><table><thead><tr><th>رمز المقرر</th><th>المادة</th><th>الساعات</th><th>الدرجة</th><th>الملاحظات</th></tr></thead><tbody>${term.subjects.map((subject) => `<tr><td>${esc(subject.code)}</td><td>${esc(subject.name)}</td><td>${esc(subject.hours ?? "—")}</td><td class="num">${esc(subject.scoreStatus ? (statusLabels[subject.scoreStatus] || subject.scoreStatus) : (subject.score ?? "—"))}</td><td>${esc(subject.notes || "—")}</td></tr>`).join("")}</tbody></table></div>${term.average != null ? `<p><strong>المعدل الفصلي: ${esc(term.average)}٪</strong> ${esc(term.rating || "")}</p>` : ""}</section>`).join("");
}

// جدول "سجل المقررات" صار يُبنى من courseGrades المستوردة من ملف كشف
// الطلاب (نفس مصدر تحديث المعدلات)، لا من قراءة PDF حية — متاح فورًا بلا
// أي زر أو اتصال مجلد محلي. renderCurriculumResults/curriculumTrack نفس
// الدالتين المستخدَمتين سابقًا مع الشهادات، بلا تغيير: نبني لهما شكل
// "شهادة" اصطناعي واحد يجمع صفوف courseGrades حسب الفصل، فيبقى منطق
// latestCourseResults (تمييز المعاد، القالب) كما هو تمامًا.
function courseGradesToCertificate(rows) {
  const byTerm = new Map();
  for (const r of rows) {
    if (!byTerm.has(r.term)) byTerm.set(r.term, []);
    byTerm.get(r.term).push({ code: r.subjectCode, name: r.subjectName, score: r.score, scoreStatus: r.scoreStatus, notes: r.notes });
  }
  const terms = [...byTerm.entries()].map(([label, subjects]) => ({ label, subjects, average: null, rating: null }));
  return { terms, track: null };
}

async function mountCourseGradesTable(root, student) {
  const rows = await listWhere("courseGrades", "studentId", String(student.academicId || student.id));
  if (!rows.length) {
    root.innerHTML = '<p class="hint">لا توجد درجات مقررات مستوردة لهذا الطالب بعد.</p>';
    return;
  }
  const certificates = [courseGradesToCertificate(rows)];
  root.innerHTML = await renderCurriculumResults(certificates, curriculumTrack(student, certificates));
}

// "فتح الشهادة الأصلية" يبقى الاستثناء الوحيد اللي يحتاج مجلد "مسار"
// المحلي — فتح/طباعة/تنزيل نسخة PDF الرسمية نفسها، لا بياناتها (سجل
// المقررات فوق كافٍ للبيانات). زر بسيط بأعلى بطاقة "سجل المقررات" (نفس
// نمط "فتح الجدول الأصلي (PDF)" بجدول الطالب)، لا بطاقة مستقلة. يبقى أيضًا
// يغذّي دمج المعدل الفصلي/التراكمي بالرسم البياني لو الشهادة المفتوحة تحمل
// قيمة مختلفة عمّا هو مستورَد — راجع drawAcademic أدناه.
function wireCertificateOriginal(root, student, onCertificates) {
  const button = root.querySelector("#student-certificate-open");
  const status = root.querySelector("#student-certificate-status");
  const originalsRoot = root.querySelector("#student-certificate-originals");
  let urls = [];
  const release = () => { urls.forEach(url => URL.revokeObjectURL(url)); urls = []; };
  const observer = new MutationObserver(() => { if (!root.isConnected) { release(); observer.disconnect(); } });
  observer.observe(document.body, { childList: true, subtree: true });
  button.addEventListener("click", async () => {
    button.disabled = true;
    release();
    originalsRoot.innerHTML = "";
    status.textContent = "جارٍ البحث عن شهادة الطالب…";
    try {
      const found = await findStudentCertificates(student, { prompt: true, refresh: false });
      if (!found.files.length) {
        status.textContent = found.connected ? "لم توجد شهادة باسم الطالب أو رقمه الأكاديمي بمجلد مسار." : "لم يُختَر مجلد مسار.";
        return;
      }
      const certificates = [], sources = [], errors = [];
      for (const source of found.files) {
        status.textContent = `جارٍ قراءة ${source.name}…`;
        try {
          const file = source.handle ? await source.handle.getFile() : source;
          const certificate = await readStudentCertificate(file, student);
          certificates.push({ ...certificate, sourceName: source.name, lastModified: file.lastModified });
          sources.push(file);
        } catch (error) { errors.push(`${source.name}: ${error.message}`); }
      }
      if (certificates.length) {
        originalsRoot.innerHTML = sources.map(file => {
          const url = URL.createObjectURL(file); urls.push(url);
          return `<span class="certificate-source">${sources.length > 1 ? `<small>${esc(file.name)}</small>` : ""}<a class="btn btn-ghost" href="${url}" download="${esc(file.name)}">تنزيل الأصل</a><a class="btn btn-ghost" href="${url}" target="_blank" rel="noopener">فتح / طباعة الأصل</a></span>`;
        }).join("");
        onCertificates(certificates);
      }
      status.textContent = [certificates.length ? `تم فتح ${certificates.length} شهادة.` : "لم تُعرض شهادة مطابقة.", ...errors].join(" ");
    } catch (error) {
      status.textContent = error.message || "تعذّر فتح شهادة الطالب";
    } finally {
      button.disabled = false;
    }
  });
}

const CHART_W = 640;
const CHART_H = 220;
const PAD_L = 30;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 26;

function renderTermLineChart(points) {
  if (!points.length) {
    return '<div class="empty">لا توجد معدلات فصلية رسمية متاحة بعد</div>';
  }

  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;
  const n = points.length;
  const x = (i) => PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => PAD_T + plotH - (v / 100) * plotH;
  const ticks = [0, 25, 50, 75, 100];
  const last = points[n - 1];
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.averagePct).toFixed(1)}`).join(" ");

  return `
    <div class="chart-wrap" style="position:relative;">
      <svg viewBox="0 0 ${CHART_W} ${CHART_H}" style="width:100%; height:auto; display:block;" role="img" aria-label="المعدل الفصلي عبر الزمن">
        ${ticks.map((t) => `
          <line x1="${PAD_L}" y1="${y(t).toFixed(1)}" x2="${CHART_W - PAD_R}" y2="${y(t).toFixed(1)}" stroke="var(--border)" stroke-width="1"/>
          <text x="${PAD_L - 6}" y="${(y(t) + 3).toFixed(1)}" font-size="10" fill="var(--ink-500)" text-anchor="end" font-family="var(--font-ui)">${t}</text>
        `).join("")}
        <path d="${linePath}" fill="none" stroke="var(--teal-600)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        ${points.map((p, i) => `
          <circle cx="${x(i).toFixed(1)}" cy="${y(p.averagePct).toFixed(1)}" r="4.5" fill="var(--teal-600)" stroke="var(--surface)" stroke-width="2"/>
          <circle data-hit="${i}" cx="${x(i).toFixed(1)}" cy="${y(p.averagePct).toFixed(1)}" r="14" fill="transparent" tabindex="0" style="cursor:pointer;"/>
        `).join("")}
        <text x="${x(n - 1).toFixed(1)}" y="${(y(last.averagePct) - 12).toFixed(1)}" font-size="12" font-weight="700" fill="var(--ink-800)" text-anchor="middle" font-family="var(--font-ui)">${last.averagePct}٪</text>
      </svg>
      <div id="term-chart-tooltip" style="position:absolute; display:none; pointer-events:none; background:var(--teal-900); color:var(--paper-50); font-size:11.5px; padding:6px 10px; border-radius:7px; white-space:nowrap; transform:translate(-50%,-100%); z-index:5; box-shadow:var(--shadow);"></div>
    </div>
  `;
}

function wireTermChart(root, points) {
  const svg = root.querySelector("svg");
  const tooltip = root.querySelector("#term-chart-tooltip");
  if (!svg || !tooltip) return;

  svg.querySelectorAll("[data-hit]").forEach((hit) => {
    const p = points[Number(hit.dataset.hit)];
    const show = () => {
      const rect = svg.getBoundingClientRect();
      const cx = (Number(hit.getAttribute("cx")) / CHART_W) * rect.width;
      const cy = (Number(hit.getAttribute("cy")) / CHART_H) * rect.height;
      tooltip.style.left = `${cx}px`;
      tooltip.style.top = `${cy - 10}px`;
      tooltip.style.display = "block";
      const bits = [`${p.term}`, `${p.averagePct}٪`];
      if (p.rating) bits.push(p.rating);
      tooltip.textContent = bits.join(" — ");
    };
    const hide = () => { tooltip.style.display = "none"; };
    hit.addEventListener("pointerenter", show);
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerleave", hide);
    hit.addEventListener("focus", show);
    hit.addEventListener("blur", hide);
  });
}

export async function renderAcademicPath(container, student) {
  if (typeof student !== "object") student = { id: String(student) };
  const [timeline, summary] = await Promise.all([
    getStudentTermTimeline(String(student.academicId || student.id)),
    getStudentAcademicSummary(student),
  ]);

  const subjects = summary.subjects;
  container.innerHTML = `
    <div class="card cumulative-card"><span>المعدل التراكمي النهائي</span><strong data-cumulative></strong><small data-cumulative-note></small></div>
    <div class="card" style="margin-bottom:16px;">
      <h2>المعدل الفصلي عبر الزمن</h2>
      <div class="term-average-cards" data-term-slots></div>
      <div id="term-chart-root"></div>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <div class="card-head">
        <div><h2>سجل المقررات</h2></div>
        <button class="btn btn-ghost" id="student-certificate-open">فتح الشهادة الأصلية (PDF)</button>
      </div>
      <div id="student-course-grades"></div>
      <p class="hint" id="student-certificate-status" role="status"></p>
      <div id="student-certificate-originals"></div>
    </div>
    ${subjects.length ? `<details class="card" style="margin-bottom:16px;" open><summary>ملخص درجات المواد المتاح (${subjects.length})</summary><p class="hint">ملخص التحليل المجمع عبر الفترات؛ درجات كل فصل تظهر بسجل المقررات أعلاه.</p><div class="tablewrap"><table><thead><tr><th>المادة</th><th>النسبة</th></tr></thead><tbody>${subjects.map((subject) => `<tr><td>${esc(subject.subject)}</td><td>${subject.pct == null ? "—" : `${esc(subject.pct)}٪`}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
  `;

  const chartRoot = container.querySelector("#term-chart-root");
  function drawAcademic(certificates = []) {
    const merged = new Map(timeline.map(point => [point.term, point]));
    for (const certificate of certificates) for (const term of certificate.terms) {
      if (officialAverage(term.average) != null) merged.set(term.label, { term: term.label, averagePct: Number(term.average), rating: term.rating });
    }
    const slots = termSlots(student, [...merged.values()]);
    container.querySelector("[data-term-slots]").innerHTML = slots.length ? slots.map(point => `<div class="term-average-card"><span>${esc(point.term)}</span><strong>${officialAverage(point.averagePct) == null ? "غير متوفر" : `${esc(point.averagePct)}٪`}</strong></div>`).join("") : '<p class="hint">معدلات المرحلة الإعدادية بانتظار تزويدها.</p>';
    const points = slots.filter(p => officialAverage(p.averagePct) != null);
    chartRoot.innerHTML = renderTermLineChart(points);
    wireTermChart(chartRoot, points);
    // Conflicting local official totals are surfaced, never averaged or guessed.
    const values = [...new Set(certificates.map(c => officialAverage(c.finalCumulativeAverage)).filter(v => v != null))];
    const cumulative = values.length === 1 ? values[0] : summary.finalCumulativeAverage;
    container.querySelector("[data-cumulative]").textContent = cumulative == null ? "غير متوفر" : `${cumulative}٪`;
    container.querySelector("[data-cumulative-note]").textContent = values.length > 1 ? "توجد قيم تراكمية مختلفة في الشهادات؛ المعروض هو المحفوظ، ويحتاج مراجعة الأصل." : cumulative == null ? "يظهر عند توفر المعدل الرسمي." : "";
  }
  drawAcademic();
  wireCertificateOriginal(container, student, drawAcademic);
  await mountCourseGradesTable(container.querySelector("#student-course-grades"), student);
}
