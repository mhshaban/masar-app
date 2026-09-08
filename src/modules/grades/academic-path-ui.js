import { renderCurriculumResults, curriculumTrack } from "./curriculum-results.js?v=2026-09-08-academic-1";
import { getStudentTermTimeline, getStudentAcademicSummary, termSlots, officialAverage } from "./term-progress-service.js?v=2026-09-08-academic-1";
import { findStudentCertificates, readStudentCertificate } from "./student-certificate-local.js?v=2026-09-07-academic-fix-1";

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const statusLabels = { absent: "غائب", barred: "محروم" };

export function renderCertificateResults(certificate) {
  return certificate.terms.filter((term) => term.subjects.length).map((term) => `<section style="margin-top:16px;"><h3>${esc(term.label)}</h3><div class="tablewrap"><table><thead><tr><th>رمز المقرر</th><th>المادة</th><th>الساعات</th><th>الدرجة</th><th>الملاحظات</th></tr></thead><tbody>${term.subjects.map((subject) => `<tr><td>${esc(subject.code)}</td><td>${esc(subject.name)}</td><td>${esc(subject.hours ?? "—")}</td><td class="num">${esc(subject.scoreStatus ? (statusLabels[subject.scoreStatus] || subject.scoreStatus) : (subject.score ?? "—"))}</td><td>${esc(subject.notes || "—")}</td></tr>`).join("")}</tbody></table></div>${term.average != null ? `<p><strong>المعدل الفصلي: ${esc(term.average)}٪</strong> ${esc(term.rating || "")}</p>` : ""}</section>`).join("");
}

async function mountCertificateResults(root, student, onCertificates) {
  root.innerHTML = `<div class="certificate-heading"><h2>شهادة الطالب</h2><div class="forms-actions"><button class="btn btn-primary" data-show>عرض الشهادة</button><button class="btn btn-ghost" data-folder>اختيار مجلد مسار</button><label class="btn btn-ghost">اختيار شهادة PDF<input data-certificate type="file" accept=".pdf" multiple hidden></label></div></div><p data-status role="status"></p><section class="schedule-viewer" data-preview hidden><div class="schedule-toolbar"><strong>${esc(student.name || student.studentName || "شهادة الطالب")}</strong><div class="schedule-controls certificate-controls"><div data-originals class="forms-actions"></div><button class="btn btn-ghost" data-close>إغلاق</button></div></div><div data-results></div></section>`;
  const status = root.querySelector("[data-status]");
  const results = root.querySelector("[data-results]");
  const preview = root.querySelector("[data-preview]");
  const originals = root.querySelector("[data-originals]");
  let loadedCertificates = [], urls = [], version = 0;
  const release = () => { urls.forEach(url => URL.revokeObjectURL(url)); urls = []; };
  const observer = new MutationObserver(() => {
    if (!root.isConnected) { ++version; release(); observer.disconnect(); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  root.querySelector("[data-close]").addEventListener("click", () => { ++version; preview.hidden = true; });
  async function readFiles(files, ticket) {
    const certificates = [], sources = [], errors = [];
    for (const source of files) {
      if (ticket !== version || !root.isConnected) return;
      status.textContent = `جارٍ قراءة ${source.name}…`;
      try {
        const file = source.handle ? await source.handle.getFile() : source;
        const certificate = await readStudentCertificate(file, student);
        certificates.push({ ...certificate, sourceName: source.name, lastModified: file.lastModified });
        sources.push(file);
      } catch (error) { errors.push(`${source.name}: ${error.message}`); }
    }
    if (ticket !== version || !root.isConnected) return;
    if (certificates.length) {
      release();
      loadedCertificates = certificates;
      originals.innerHTML = sources.map(file => {
        const url = URL.createObjectURL(file); urls.push(url);
        return `<span class="certificate-source">${sources.length > 1 ? `<small>${esc(file.name)}</small>` : ""}<a class="btn btn-ghost" href="${url}" download="${esc(file.name)}">تنزيل الأصل</a><a class="btn btn-ghost" href="${url}" target="_blank" rel="noopener">فتح / طباعة الأصل</a></span>`;
      }).join("");
      results.innerHTML = renderCurriculumResults(certificates, curriculumTrack(student, certificates));
      preview.hidden = false;
      onCertificates(certificates);
    }
    status.textContent = [certificates.length ? `تم عرض ${certificates.length} شهادة.` : "لم تُعرض شهادة مطابقة.", ...errors].join(" ");
  }
  async function loadFolder(prompt) {
    const ticket = ++version;
    status.textContent = "جارٍ البحث عن شهادة الطالب…";
    try {
      const found = await findStudentCertificates(student, { prompt, refresh: prompt });
      if (ticket !== version || !root.isConnected) return;
      if (!found.files.length) {
        status.textContent = found.connected ? "لم توجد شهادة باسم الطالب أو رقمه الأكاديمي؛ يمكنك اختيار ملف الشهادة مباشرة." : "اختر مجلد مسار أو ملف الشهادة لعرضها.";
        return;
      }
      await readFiles(found.files, ticket);
    } catch (error) { if (ticket === version) status.textContent = error.name === "AbortError" ? "أُلغي اختيار المجلد." : error.message; }
  }
  root.querySelector("[data-show]").addEventListener("click", () => {
    if (loadedCertificates.length) preview.hidden = false;
    else void loadFolder(false);
  });
  root.querySelector("[data-folder]").addEventListener("click", () => loadFolder(true));
  root.querySelector("[data-certificate]").addEventListener("change", (event) => {
    const files = [...event.target.files];
    if (files.length) void readFiles(files, ++version);
    event.target.value = "";
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
    <div class="card" id="student-certificate-results" style="margin-bottom:16px;"></div>
    ${subjects.length ? `<details class="card" style="margin-bottom:16px;" open><summary>ملخص درجات المواد المتاح (${subjects.length})</summary><p class="hint">ملخص التحليل المجمع عبر الفترات؛ درجات كل فصل تظهر في الشهادة أعلاه.</p><div class="tablewrap"><table><thead><tr><th>المادة</th><th>النسبة</th></tr></thead><tbody>${subjects.map((subject) => `<tr><td>${esc(subject.subject)}</td><td>${subject.pct == null ? "—" : `${esc(subject.pct)}٪`}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
    <div class="card">
      <h2>المعدل الفصلي عبر الزمن</h2>
      <p class="hint">المعدل الرسمي المطبوع على شهادات الطالب فقط.</p>
      <div class="term-average-cards" data-term-slots></div>
      <div id="term-chart-root"></div>
    </div>
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
    container.querySelector("[data-cumulative-note]").textContent = values.length > 1 ? "توجد قيم تراكمية مختلفة في الشهادات؛ المعروض هو المحفوظ، ويحتاج مراجعة الأصل." : cumulative == null ? "يظهر عند توفر المعدل الرسمي." : "المعدل الرسمي المسجل؛ لا يُحسب من متوسط المعدلات الفصلية.";
  }
  drawAcademic();
  await mountCertificateResults(container.querySelector("#student-certificate-results"), student, drawAcademic);
}
