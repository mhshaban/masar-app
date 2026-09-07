import { readPositionedPdfRows } from '../../services/pdf-positioned-rows.js?v=2026-09-07-review-1';
import { parseScheduleRows, renderScheduleTable } from './student-schedule-parser.js?v=2026-09-07-review-1';

export function mountScheduleViewer(root, fileHandle, { studentName = '', section = '', onClose = () => {} } = {}) {
  const panel = document.createElement('section');
  panel.className = 'schedule-viewer';
  panel.innerHTML = `<div class="schedule-toolbar"><strong data-name></strong><div class="schedule-controls"><a class="btn btn-ghost" data-download hidden>تنزيل الأصل</a><a class="btn btn-ghost" data-original target="_blank" rel="noopener" hidden>فتح الأصل / طباعة</a><button class="btn btn-ghost" data-close>إغلاق</button></div></div><p class="hint" data-status role="status">جارٍ قراءة الحصص…</p><div data-table></div>`;
  root.replaceChildren(panel);
  panel.querySelector('[data-name]').textContent = `جدول ${studentName}`;
  const status = panel.querySelector('[data-status]');
  let disposed = false, objectUrl = null;
  const observer = new MutationObserver(() => { if (!panel.isConnected) dispose(); });
  observer.observe(document.body, { childList: true, subtree: true });
  function dispose() { if (disposed) return; disposed = true; observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); }
  panel.querySelector('[data-close]').addEventListener('click', () => { dispose(); panel.remove(); onClose(); });
  void (async () => {
    try {
      const file = await fileHandle.getFile();
      if (disposed) return;
      const rows = await readPositionedPdfRows(file);
      if (disposed) return;
      const schedule = parseScheduleRows(rows, section);
      objectUrl = URL.createObjectURL(file);
      for (const link of panel.querySelectorAll('[data-download], [data-original]')) { link.href = objectUrl; link.hidden = false; }
      panel.querySelector('[data-download]').download = file.name;
      panel.querySelector('[data-table]').innerHTML = renderScheduleTable(schedule);
      status.textContent = `${schedule.days.length} أيام · ${schedule.lessons.length} حصص يوميًا`;
    } catch (error) { if (!disposed) status.textContent = error.message || 'تعذّر قراءة الجدول.'; }
  })();
  return dispose;
}
