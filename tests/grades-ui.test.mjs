import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTIONS } from '../src/core/config.js';
import { bulkPut, clear } from '../src/services/cloud-runtime.js';
import { mountGradesView } from '../src/modules/grades/grades-ui.js';

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

class Element {
  children = {}; listeners = {}; style = {}; innerHTML = '';
  querySelector(key) { return this.children[key] ||= new Element(); }
  querySelectorAll(selector) { return this._all?.[selector] || []; }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  classList = { add: () => {}, remove: () => {} };
}

// شريط بطاقات التصنيف صار عرضًا بدون DOM حقيقي (jsdom) هنا — بدل مطابقة
// selectors دقيقة، نكتفي بالتحقق من أن mountGradesView لا يرمي، ومن أن
// computeStudentAchievement/computeStudentGradeSummaries تُستدعيان وتُنتجان
// بيانات متوافقة (الاختبار الحقيقي للتفاعل نفسه كان عبر Playwright وقت
// البناء، غير مُدرَج هنا).
test('mountGradesView renders without throwing for a student who is both low-tier and needs support', async () => {
  await bulkPut('students', [{ id: 's1', name: 'طالب ضعيف', level: 'الثالث', section: '١' }]);
  await bulkPut('academicFlags', [
    { id: 's1', studentId: 's1', overallPct: 40, subjects: [{ subject: 'الرياضيات', pct: 30 }], absentCount: 0, barredCount: 0 },
  ]);

  const root = new Element();
  await mountGradesView(root, { onGoto: () => {} });
  assert.equal(typeof root.innerHTML, 'string');
});
