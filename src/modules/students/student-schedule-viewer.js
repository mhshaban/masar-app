import { ensurePdfJs } from "../../services/vendor-loader.js?v=2026-09-07-academic-fix-1";

export function mountScheduleViewer(root, fileHandle, { studentName = "", onClose = () => {} } = {}) {
  const panel = document.createElement("section");
  panel.className = "schedule-viewer";
  panel.innerHTML = `<div class="schedule-toolbar"><strong data-file-name></strong><div class="schedule-controls"><label>الصفحة <select data-page aria-label="صفحة الجدول" disabled></select></label><label>العرض <select data-zoom aria-label="تكبير الجدول" disabled><option value="fit">ملاءمة العرض</option><option value="1">100٪</option><option value="1.5">150٪</option><option value="2">200٪</option></select></label><a class="btn btn-ghost" data-download hidden>تنزيل PDF</a><a class="btn btn-ghost" data-original target="_blank" rel="noopener" hidden>فتح الأصل / طباعة</a><button class="btn btn-ghost" data-close>إغلاق</button></div></div><p class="hint" data-status role="status">جارٍ تجهيز الجدول…</p><div class="schedule-page" data-page-host><canvas role="img"></canvas></div>`;
  root.replaceChildren(panel);
  const pageSelect = panel.querySelector("[data-page]");
  const zoomSelect = panel.querySelector("[data-zoom]");
  const status = panel.querySelector("[data-status]");
  const canvas = panel.querySelector("canvas");
  const pageHost = panel.querySelector("[data-page-host]");
  canvas.setAttribute("aria-label", `جدول ${studentName}`);
  let disposed = false, task = null, documentPdf = null, rendering = null, objectUrl = null, version = 0, resizeTimer = null;
  const observer = new MutationObserver(() => { if (!panel.isConnected) dispose(); });
  observer.observe(document.body, { childList: true, subtree: true });
  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    if (zoomSelect.value === "fit") resizeTimer = setTimeout(() => void draw(), 120);
  });
  resizeObserver.observe(pageHost);

  function dispose() {
    if (disposed) return;
    disposed = true; version++;
    clearTimeout(resizeTimer);
    observer.disconnect(); resizeObserver.disconnect();
    rendering?.cancel();
    if (task) void task.destroy().catch(() => {});
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }

  async function draw() {
    if (disposed || !documentPdf) return;
    const ticket = ++version;
    const previous = rendering;
    previous?.cancel();
    if (previous) { try { await previous.promise; } catch {} }
    if (disposed || ticket !== version) return;
    status.textContent = "جارٍ عرض الصفحة…";
    try {
      const page = await documentPdf.getPage(Number(pageSelect.value));
      if (disposed || ticket !== version) return;
      const natural = page.getViewport({ scale: 1 });
      const scale = zoomSelect.value === "fit" ? Math.max(0.2, (pageHost.clientWidth - 32) / natural.width) : Number(zoomSelect.value);
      const viewport = page.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * ratio);
      canvas.height = Math.ceil(viewport.height * ratio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      rendering = page.render({ canvasContext: canvas.getContext("2d"), viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await rendering.promise;
      if (ticket === version && !disposed) status.textContent = `صفحة ${pageSelect.value} من ${documentPdf.numPages}`;
    } catch (error) {
      if (!disposed && ticket === version && error.name !== "RenderingCancelledException") status.textContent = "تعذّر عرض الصفحة؛ يمكنك فتح الأصل أو تنزيله.";
    }
  }

  panel.querySelector("[data-close]").addEventListener("click", () => { dispose(); panel.remove(); onClose(); });
  pageSelect.addEventListener("change", () => void draw());
  zoomSelect.addEventListener("change", () => void draw());
  void (async () => {
    try {
      const file = await fileHandle.getFile();
      if (disposed) return;
      objectUrl = URL.createObjectURL(file);
      panel.querySelector("[data-file-name]").textContent = file.name;
      for (const link of panel.querySelectorAll("[data-download], [data-original]")) { link.href = objectUrl; link.hidden = false; }
      panel.querySelector("[data-download]").download = file.name;
      const library = await ensurePdfJs();
      if (disposed) return;
      const data = await file.arrayBuffer();
      if (disposed) return;
      task = library.getDocument({ data, isEvalSupported: false });
      documentPdf = await task.promise;
      if (disposed) return;
      for (let page = 1; page <= documentPdf.numPages; page++) {
        const option = document.createElement("option"); option.value = String(page); option.textContent = String(page); pageSelect.append(option);
      }
      pageSelect.disabled = documentPdf.numPages < 2; zoomSelect.disabled = false;
      await draw();
    } catch (error) { if (!disposed) status.textContent = "تعذّر تجهيز الجدول؛ جرّب فتح الأصل أو إعادة اختيار الملف."; }
  })();
  return dispose;
}
