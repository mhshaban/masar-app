import { list as listAll } from "../../services/cloud-runtime.js";
import { computeStudentAchievement, computeSubjectAchievement, TIER_LABELS } from "./achievement-service.js";
import { computeStudentGradeSummaries } from "./grade-flags-service.js";

function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// إحصائيات بسيطة من academicFlags (صف واحد لكل طالب، أرقام مجمَّعة جاهزة
// من تحليل Cowork) — بدل حساب معدل حسب المقرر من آلاف صفوف الدرجات الخام
// كما كان سابقًا. الآن مجرد متوسط على أرقام قليلة أصلًا.
async function getAcademicStats() {
  const flags = await listAll("academicFlags");
  const withOverall = flags.filter((f) => f.overallPct != null);
  const overallAvg = withOverall.length
    ? Math.round(withOverall.reduce((sum, f) => sum + Number(f.overallPct), 0) / withOverall.length)
    : 0;

  const bySubject = new Map();
  for (const f of flags) {
    for (const s of f.subjects || []) {
      if (s.pct == null) continue;
      if (!bySubject.has(s.subject)) bySubject.set(s.subject, []);
      bySubject.get(s.subject).push(Number(s.pct));
    }
  }
  const subjectStats = [...bySubject.entries()]
    .map(([subject, pcts]) => ({ subject, count: pcts.length, avgPct: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) }))
    .sort((a, b) => a.avgPct - b.avgPct);

  return { studentCount: flags.length, overallAvg, subjectStats };
}

async function renderAnalyticsTab(root) {
  const stats = await getAcademicStats();
  if (!stats.studentCount) {
    root.innerHTML = '<div class="card"><div class="empty">لا توجد بيانات أكاديمية بعد — تُستورَد من تحليل Cowork لشهادات ودرجات الطلبة</div></div>';
    return;
  }
  root.innerHTML = `
    <div class="grid g4" style="margin-bottom:16px;">
      <div class="card stat"><div class="label">طلاب لديهم بيانات أكاديمية</div><div class="value">${stats.studentCount}</div></div>
      <div class="card stat"><div class="label">المعدل العام</div><div class="value">${stats.overallAvg}٪</div></div>
    </div>
    <div class="card">
      <h2>المعدل حسب المقرر</h2>
      <p class="hint">مرتبة من الأضعف إلى الأعلى لتحديد المقررات التي تحتاج دعمًا أولًا.</p>
      <div class="tablewrap"><table>
        <thead><tr><th>المقرر</th><th>عدد الطلاب</th><th>المعدل</th></tr></thead>
        <tbody>
          ${stats.subjectStats.map((s) => `
            <tr><td>${esc(s.subject)}</td><td class="num">${s.count}</td><td class="num">${s.avgPct}٪</td></tr>
          `).join("")}
        </tbody>
      </table></div>
    </div>
  `;
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
        <h2>يحتاجون تدخل (دعم أكاديمي)</h2>
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
    root.innerHTML = '<div class="card"><div class="empty">لا توجد بيانات أكاديمية بعد</div></div>';
    return;
  }

  root.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <label class="hint" for="subject-select" style="display:block;margin-bottom:6px;">اختر مقررًا</label>
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
        <h2>${esc(subject.subject)}</h2>
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
    root.innerHTML = '<div class="card"><div class="empty">لا توجد بيانات أكاديمية بعد</div></div>';
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
      <div><h1>الدرجات والتحليلات</h1><div class="sub">تحليلات ومعدلات الطلبة من تحليل Cowork لشهادات ودرجات الطلبة</div></div>
    </div>
    <div class="tabs">
      <div class="tab active" data-tab="analytics">التحليلات</div>
      <div class="tab" data-tab="classification">تصنيف الطلاب</div>
    </div>
    <div id="grades-analytics-root"></div>
    <div id="grades-classification-root" style="display:none;"></div>
  `;

  const analyticsRoot = container.querySelector("#grades-analytics-root");
  const classificationRoot = container.querySelector("#grades-classification-root");
  const roots = { analytics: analyticsRoot, classification: classificationRoot };

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
