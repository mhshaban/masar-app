import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { bulkPut, clear } from '../src/services/cloud-runtime.js';
import { latestCourseResults, renderCurriculumResults, curriculumTrack } from '../src/modules/grades/curriculum-results.js';

const cert = (term, score, extra = {}) => ({ terms:[{label:term,subjects:[{code:'ريض813',name:'الرياضيات',score,...extra}]}] });

// قالب صغير كافٍ لاختبار آلية العرض/المطابقة — المحتوى الحقيقي (25 قسمًا
// لكل مسار) صار بيانات سحابية (curriculumTemplates)، تُحدَّث من تبويب
// "تحديث شامل"، لا من هذا الملف.
const SEED = {
  'الصناعي': [
    { department: 'قسم أ', type: 'تخصصية', codes: ['ريض813', '', '', '', '', ''] },
    { department: 'قسم ب', type: 'ثقافة عامة', codes: ['رسم803/رسم813', '', '', '', '', ''] },
  ],
  'التجاري': [
    { department: 'قسم ج', type: 'تخصصية', codes: ['ريض813', '', '', '', '', ''] },
  ],
};

beforeEach(async () => {
  await clear('curriculumTemplates');
  await bulkPut('curriculumTemplates', Object.entries(SEED).map(([id, departments]) => ({ id, departments })));
});

test('latest attempt wins chronologically, not highest mark or PDF file order', () => {
  const later=cert('المستوى الثاني الفصل الدراسي الأول ٢٠٢٦/٢٠٢٧',0);
  const earlier=cert('المستوى الأول الفصل الدراسي الثاني 2025/2026',90);
  const result=latestCourseResults([later,earlier]).get('ريض813');
  assert.equal(result.score,0);assert.equal(result.repeated,true);
});
test('same certificate in multiple files is not a repeated course', () => {
  const c=cert('الفصل الدراسي الأول 2025/2026',85);
  assert.equal(latestCourseResults([c,c]).get('ريض813').repeated,false);
});
test('latest absence is retained and a same-term second round follows the initial result', () => {
  const c=cert('الفصل الدراسي الأول 2025/2026',40);
  const retake=cert('الفصل الدراسي الأول 2025/2026',null,{scoreStatus:'absent',notes:'دور ثاني'});
  const result=latestCourseResults([retake,c]).get('ريض813');
  assert.equal(result.scoreStatus,'absent');assert.equal(result.repeated,true);
});
test('templates retain all six columns and blank score cells, with additional courses preserved separately', async () => {
  for(const track of ['الصناعي','التجاري']){
    const html=await renderCurriculumResults([],track);
    assert.equal((html.match(/class="curriculum-scores"/g)||[]).length,SEED[track].length);
    assert.ok(html.includes('الفصل 6'));
    assert.ok(html.includes('<td></td>'));
  }
  const extra={terms:[{label:'الفصل الأول',subjects:[{code:'غير999',name:'<script>',score:88}]}]};
  const html=await renderCurriculumResults([extra],'الصناعي');
  assert.ok(html.includes('غير999'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});
test('unknown track with no stored template shows a clear message instead of throwing', async () => {
  const html = await renderCurriculumResults([], 'غير معروف');
  assert.ok(html.includes('لم يُحدد المسار'));
});
test('repeated grade gets both a color class and a readable label', async () => {
  const html=await renderCurriculumResults([cert('الفصل الدراسي الأول 2025/2026',30),cert('الفصل الدراسي الثاني 2025/2026',77)],'التجاري');
  assert.ok(html.includes('curriculum-grade curriculum-retaken'));assert.ok(html.includes('77<small>معاد</small>'));
  assert.equal(curriculumTrack({track:'الصناعي'}),'الصناعي');
  assert.equal(curriculumTrack({track:'التجاري'}),'التجاري');
});
test('failing scores are red, including repeated failure, while zero and passing boundary remain distinct', async () => {
  for (const score of [0, 49, 49.5]) {
    const html = await renderCurriculumResults([cert('الفصل الأول', score)], 'التجاري');
    assert.match(html, /class="curriculum-grade curriculum-failed"/);
  }
  assert.doesNotMatch(await renderCurriculumResults([cert('الفصل الأول', 50)], 'التجاري'), /class="curriculum-grade curriculum-failed"/);
  const repeated = await renderCurriculumResults([cert('الفصل الأول', 20), cert('الفصل الثاني', 40)], 'التجاري');
  assert.match(repeated, /curriculum-retaken curriculum-failed/);
  assert.match(repeated, /40<small>معاد<\/small>/);
  assert.doesNotMatch(await renderCurriculumResults([cert('الفصل الأول', null, {scoreStatus:'absent'})], 'التجاري'), /class="curriculum-grade curriculum-failed"/);
});
test('a template cell with two alternate codes ("code1/code2") matches whichever one the certificate actually has', async () => {
  const withSecondCode = { terms: [{ label: 'الفصل الأول', subjects: [{ code: 'رسم813', name: 'رسم فني', score: 82 }] }] };
  const html = await renderCurriculumResults([withSecondCode], 'الصناعي');
  assert.ok(html.includes('رسم803/رسم813'), 'template still shows the combined code label');
  assert.ok(html.includes('>82<'), 'the grade for the second alternate code is matched and shown');
  assert.ok(!html.includes('غير مدرجة بالقالب'), 'the alternate code must not also leak into the "unlisted courses" section');
});

test('student track takes precedence over certificate metadata', () => {
  assert.equal(curriculumTrack({track:'الصناعي'}, [{track:'التجاري'}]), 'الصناعي');
  assert.equal(curriculumTrack({department:'التجاري'}), 'التجاري');
});
