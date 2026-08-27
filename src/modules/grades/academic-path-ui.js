import { getStudentTermTimeline } from "./term-progress-service.js";

const CHART_W = 640;
const CHART_H = 220;
const PAD_L = 30;
const PAD_R = 16;
const PAD_T = 18;
const PAD_B = 26;

function renderTermLineChart(points) {
  if (!points.length) {
    return '<div class="empty">لا توجد معدلات فصلية بعد — تُستخرج من تحليل شهادات الطالب بواسطة Cowork</div>';
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

export async function renderAcademicPath(container, studentId) {
  const timeline = await getStudentTermTimeline(studentId);

  container.innerHTML = `
    <div class="card">
      <h2>المعدل الفصلي عبر الزمن</h2>
      <p class="hint">المعدل الرسمي المطبوع على شهادات الطالب فقط — من تحليل Cowork، لا يشمل درجات الوقفة التقويمية.</p>
      <div id="term-chart-root"></div>
    </div>
  `;

  const chartRoot = container.querySelector("#term-chart-root");
  chartRoot.innerHTML = renderTermLineChart(timeline);
  wireTermChart(chartRoot, timeline);
}
