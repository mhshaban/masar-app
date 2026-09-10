import './helpers/fake-cloud-backend.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mountImportsView, mountPlanTab } from '../src/modules/imports/imports-ui.js';
import { mountBackupView } from '../src/modules/backup/backup-ui.js';
import { commitSchoolWorkbook } from '../src/services/school-data-import-service.js';
import { createProject } from '../src/modules/department-plan/department-plan-service.js';

class Element {
  children = {}; listeners = {}; style = {}; disabled = false; innerHTML = '';
  querySelector(key) { return this.children[key] ||= new Element(); }
  querySelectorAll() { return []; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  setAttribute() {} showModal() {} remove() {}
  close() { this.listeners.close?.(); }
}

test('school update opens confirmation and cancelling leaves data untouched', async () => {
  let dialog;
  const sheets = {
    'كشف الطلاب': [['الرقم الأكاديمي', 'اسم الطالب'], ['123', 'طالب تجريبي']],
    'المعلمين': [['الرقم الشخصي', 'الاسم باللغة العربية'], ['456', 'معلم تجريبي']],
    'المرفعين': [['الرقم الاكاديمي', 'اسم الطالب', 'المقرر', 'حالة الطالب']],
  };
  const saved = { document: globalThis.document, window: globalThis.window, XLSX: globalThis.XLSX, FileReader: globalThis.FileReader };
  globalThis.XLSX = { read: () => ({ SheetNames: Object.keys(sheets), Sheets: sheets }), utils: { sheet_to_json: s => s } };
  globalThis.window = { XLSX: globalThis.XLSX };
  globalThis.FileReader = class { readAsArrayBuffer() { this.onload({ target: { result: new ArrayBuffer(0) } }); } };
  globalThis.document = { createElement: () => new Element(), body: { appendChild: el => { dialog = el; } } };
  try {
    const root = new Element();
    await mountImportsView(root);
    const school = root.querySelector('#imports-root-school');
    const file = school.querySelector('#school-import-file');
    file.files = [{ name: 'test.xlsx' }];
    await file.listeners.change();
    const preview = school.querySelector('#school-import-preview');
    const click = preview.querySelector('#school-import-commit').listeners.click;
    assert.equal(typeof click, 'function', preview.innerHTML);
    const pending = click();
    assert.ok(dialog, 'confirmation must open without an undefined function error');
    dialog.querySelector('[data-cancel]').listeners.click();
    await pending;
    assert.equal((await globalThis.__MASAR_TEST_BACKEND__.list('students')).length, 0);
  } finally { Object.assign(globalThis, saved); }
});

test('school update commits without reading backup collections or downloading files', async () => {
  const backend = globalThis.__MASAR_TEST_BACKEND__;
  const originalList = backend.list;
  backend.list = async name => {
    assert.notEqual(name, 'departmentPlanProjects', 'school update must not build a full backup');
    return originalList(name);
  };
  try {
    const result = await commitSchoolWorkbook({ students: [{ id: '123', name: 'طالب' }], teachers: [{ id: 'teacher-456', personalNo: '456', name: 'معلم' }], promotedRows: [] }, { fileName: 'test.xlsx' });
    assert.equal(result.studentsCount, 1);
    assert.equal((await backend.list('students'))[0].id, '123');
  } finally { backend.list = originalList; }
});

test('plan update tab replaces the existing plan and cancelling leaves it untouched', async () => {
  const existing = await createProject({ pillar: 'القيادة', project_title: 'مشروع قديم' });
  let dialog;
  const planSheet = [
    ['الخطة التنفيذية'],
    ['م', 'المحور', 'البرنامج', 'الاجراء', 'الفئة المستهدفة', 'الثبوتيات', 'دور المكتب', 'الأقسام المشاركة', 'فترة التنفيذ', 'تاريخ بدء التنفيذ المقترح', 'تاريخ نهاية التنفيذ المقترح', 'حالة التنفيذ', 'بيانات الحصر المطلوبة', 'مؤشر الأداء KPI', 'المستهدف'],
    [1, 'الانجاز الاكاديمي', '١- برنامج', 'إجراء تجريبي', 'طلاب المدرسة', 'الثبوتيات هنا', 'دور المكتب', 'الأقسام المشاركة', 'طوال العام', '', '', 'لم يبدأ', '', '', ''],
  ];
  const sheets = { 'الخطة التنفيذية النهائية': planSheet };
  const saved = { document: globalThis.document, window: globalThis.window, XLSX: globalThis.XLSX, FileReader: globalThis.FileReader };
  globalThis.XLSX = { read: () => ({ SheetNames: Object.keys(sheets), Sheets: sheets }), utils: { sheet_to_json: s => s } };
  globalThis.window = { XLSX: globalThis.XLSX };
  globalThis.FileReader = class { readAsArrayBuffer() { this.onload({ target: { result: new ArrayBuffer(0) } }); } };
  globalThis.document = { createElement: () => new Element(), body: { appendChild: el => { dialog = el; } } };
  try {
    const plan = new Element();
    await mountPlanTab(plan);
    const input = plan.querySelector('#plan-import-file');
    input.files = [{ name: 'plan.xlsx' }];
    await input.listeners.change?.();
    const preview = plan.querySelector('#plan-import-preview');
    const click = preview.querySelector('#plan-import-commit')?.listeners.click;
    assert.equal(typeof click, 'function', preview.innerHTML);
    const pending = click();
    assert.ok(dialog, 'confirmation must open before committing');
    dialog.querySelector('[data-cancel]').listeners.click();
    await pending;
    const remaining = await globalThis.__MASAR_TEST_BACKEND__.list('departmentPlanProjects');
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, existing.id, 'cancelling must leave the existing plan untouched');
  } finally { Object.assign(globalThis, saved); }
});

test('backup download is wired while summary counts are still pending', async () => {
  const backend = globalThis.__MASAR_TEST_BACKEND__;
  const originalCount = backend.count;
  const pending = [];
  backend.count = () => new Promise(resolve => pending.push(resolve));
  try {
    const root = new Element();
    const mounting = mountBackupView(root);
    const button = root.querySelector('#backup-export').querySelector('#export-btn');
    assert.equal(button.disabled, false);
    assert.equal(typeof button.listeners.click, 'function');
    assert.ok(pending.length > 1, 'counts should run concurrently');
    pending.forEach(resolve => resolve(0));
    await mounting;
  } finally { backend.count = originalCount; }
});
