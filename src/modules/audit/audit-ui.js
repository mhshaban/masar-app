import { ensureXlsx } from "../../services/vendor-loader.js";
import { ACTION_LABELS, TABLE_LABELS, listAuditLogs } from "./audit-service.js?v=2026-09-04-users-1";
import { loadingHtml, emptyHtml, errorHtml, showToast } from "../shared/ui-states.js";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-BH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bahrain",
  }).format(date);
}

function actionPill(action) {
  const critical = action === "delete" || action === "deactivate_user";
  const warning = action === "update" || action === "update_user" || action === "set_role" || action === "restore_backup";
  const css = critical ? "pill-critical" : warning ? "pill-warning" : "pill-teal";
  return `<span class="pill ${css}">${esc(ACTION_LABELS[action] || action || "غير محدد")}</span>`;
}

function renderRows(rows) {
  if (!rows.length) return emptyHtml("لا توجد عمليات مطابقة للمرشحات الحالية");
  return `<div class="tablewrap"><table class="audit-table">
    <thead><tr><th>التاريخ والوقت</th><th>المستخدم</th><th>العملية</th><th>القسم</th><th>السجل</th></tr></thead>
    <tbody>${rows.map((item) => `<tr>
      <td class="num">${esc(formatDate(item.ts))}</td>
      <td>${esc(item.actor || "مستخدم مسجل")}</td>
      <td>${actionPill(item.action)}</td>
      <td>${esc(TABLE_LABELS[item.table_name] || item.table_name || "عملية عامة")}</td>
      <td class="num">${esc(item.record_id || (item.row_count ? `دفعة: ${item.row_count}` : "—"))}</td>
    </tr>`).join("")}</tbody>
  </table></div>`;
}

function exportRows(rows, total) {
  return rows.map((item) => ({
    "التاريخ والوقت": formatDate(item.ts),
    "المستخدم": item.actor || "مستخدم مسجل",
    "العملية": ACTION_LABELS[item.action] || item.action || "غير محدد",
    "القسم": TABLE_LABELS[item.table_name] || item.table_name || "عملية عامة",
    "معرف السجل": item.record_id || "",
    "عدد السجلات": item.row_count || "",
    "إجمالي النتائج": total,
  }));
}

export async function mountAuditView(container) {
  let page = 1;
  let lastResult = null;
  container.innerHTML = `
    <div class="topbar">
      <div><h1>سجل العمليات</h1><div class="sub">تتبّع التعديلات الحساسة دون نسخ محتوى الطلاب أو المرفقات</div></div>
      <button class="btn btn-ghost" id="audit-export" type="button">تصدير Excel</button>
    </div>
    <div class="card audit-filters-card">
      <form id="audit-filters" class="audit-filters">
        <label><span>العملية</span><select name="action"><option value="">كل العمليات</option>${Object.entries(ACTION_LABELS).map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("")}</select></label>
        <label><span>القسم</span><select name="tableName"><option value="">كل الأقسام</option>${Object.entries(TABLE_LABELS).map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("")}</select></label>
        <label><span>المستخدم</span><input name="actor" type="search" placeholder="الاسم أو البريد"></label>
        <label><span>معرّف السجل</span><input name="recordId" type="search" placeholder="رقم السجل"></label>
        <label><span>من تاريخ</span><input name="from" type="date"></label>
        <label><span>إلى تاريخ</span><input name="to" type="date"></label>
        <div class="audit-filter-actions"><button class="btn btn-primary" type="submit">تطبيق</button><button class="btn btn-ghost" id="audit-reset" type="button">مسح</button></div>
      </form>
    </div>
    <div class="card audit-results-card">
      <div class="card-head"><div><h2>العمليات المسجلة</h2><p class="hint" id="audit-summary">جارٍ التحميل…</p></div></div>
      <div id="audit-results">${loadingHtml()}</div>
      <div class="audit-pagination" id="audit-pagination" hidden>
        <button class="btn btn-ghost" id="audit-prev" type="button">السابق</button>
        <span id="audit-page-label"></span>
        <button class="btn btn-ghost" id="audit-next" type="button">التالي</button>
      </div>
    </div>`;

  const form = container.querySelector("#audit-filters");
  const results = container.querySelector("#audit-results");
  const summary = container.querySelector("#audit-summary");
  const pagination = container.querySelector("#audit-pagination");
  const prev = container.querySelector("#audit-prev");
  const next = container.querySelector("#audit-next");
  const pageLabel = container.querySelector("#audit-page-label");

  const filters = () => Object.fromEntries(new FormData(form).entries());
  const load = async () => {
    results.innerHTML = loadingHtml("جارٍ تحميل سجل العمليات…");
    pagination.hidden = true;
    try {
      lastResult = await listAuditLogs({ ...filters(), page, pageSize: 25 });
      if (page > lastResult.pages) { page = lastResult.pages; return load(); }
      results.innerHTML = renderRows(lastResult.rows);
      summary.textContent = `${lastResult.total.toLocaleString("ar-BH")} عملية — تعرض الصفحة ${lastResult.page} من ${lastResult.pages}`;
      pageLabel.textContent = `صفحة ${lastResult.page} من ${lastResult.pages}`;
      prev.disabled = lastResult.page <= 1;
      next.disabled = lastResult.page >= lastResult.pages;
      pagination.hidden = lastResult.total <= lastResult.pageSize;
    } catch (error) {
      results.innerHTML = errorHtml(`تعذّر تحميل سجل العمليات: ${error.message}`);
      summary.textContent = "لم يكتمل التحميل";
    }
  };

  form.addEventListener("submit", (event) => { event.preventDefault(); page = 1; load(); });
  container.querySelector("#audit-reset").addEventListener("click", () => { form.reset(); page = 1; load(); });
  prev.addEventListener("click", () => { if (page > 1) { page -= 1; load(); } });
  next.addEventListener("click", () => { if (lastResult && page < lastResult.pages) { page += 1; load(); } });

  container.querySelector("#audit-export").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const exported = await listAuditLogs({ ...filters(), page: 1, pageSize: 500 });
      if (!exported.rows.length) throw new Error("لا توجد نتائج لتصديرها");
      const XLSX = await ensureXlsx();
      const sheet = XLSX.utils.json_to_sheet(exportRows(exported.rows, exported.total));
      sheet["!cols"] = [{ wch: 24 }, { wch: 28 }, { wch: 28 }, { wch: 24 }, { wch: 28 }, { wch: 14 }, { wch: 14 }];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "سجل العمليات");
      workbook.Workbook = { Views: [{ RTL: true }] };
      XLSX.writeFile(workbook, `سجل-عمليات-مسار-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
      showToast(exported.total > 500 ? "تم تصدير أحدث 500 عملية" : "تم تصدير سجل العمليات");
    } catch (error) {
      showToast(error.message || "تعذّر التصدير", { type: "error" });
    } finally {
      button.disabled = false;
    }
  });

  await load();
}
