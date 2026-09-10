import test from 'node:test';
import assert from 'node:assert/strict';
import { latestCourseResults, renderCurriculumResults, curriculumTrack } from '../src/modules/grades/curriculum-results.js';
import { CURRICULUM_TEMPLATES } from '../src/modules/grades/curriculum-template.js';
const cert = (term, score, extra = {}) => ({ terms:[{label:term,subjects:[{code:'ريض813',name:'الرياضيات',score,...extra}]}] });

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
test('templates retain all six columns and blank score cells, with additional courses preserved separately', () => {
  assert.equal(CURRICULUM_TEMPLATES['الصناعي'].length,25);
  assert.equal(CURRICULUM_TEMPLATES['التجاري'].length,25);
  for(const track of ['الصناعي','التجاري']){
    const html=renderCurriculumResults([],track);
    assert.equal((html.match(/class="curriculum-scores"/g)||[]).length,CURRICULUM_TEMPLATES[track].length);
    assert.ok(html.includes('الفصل 6'));
    assert.ok(html.includes('<td></td>'));
  }
  const extra={terms:[{label:'الفصل الأول',subjects:[{code:'غير999',name:'<script>',score:88}]}]};
  const html=renderCurriculumResults([extra],'الصناعي');
  assert.ok(html.includes('غير999'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
});
test('repeated grade gets both a color class and a readable label', () => {
  const html=renderCurriculumResults([cert('الفصل الدراسي الأول 2025/2026',30),cert('الفصل الدراسي الثاني 2025/2026',77)],'التجاري');
  assert.ok(html.includes('curriculum-grade curriculum-retaken'));assert.ok(html.includes('77<small>معاد</small>'));
  assert.equal(curriculumTrack({track:'الصناعي'}),'الصناعي');
  assert.equal(curriculumTrack({track:'التجاري'}),'التجاري');
});
test('failing scores are red, including repeated failure, while zero and passing boundary remain distinct', () => {
  for (const score of [0, 49, 49.5]) {
    const html = renderCurriculumResults([cert('الفصل الأول', score)], 'التجاري');
    assert.match(html, /class="curriculum-grade curriculum-failed"/);
  }
  assert.doesNotMatch(renderCurriculumResults([cert('الفصل الأول', 50)], 'التجاري'), /class="curriculum-grade curriculum-failed"/);
  const repeated = renderCurriculumResults([cert('الفصل الأول', 20), cert('الفصل الثاني', 40)], 'التجاري');
  assert.match(repeated, /curriculum-retaken curriculum-failed/);
  assert.match(repeated, /40<small>معاد<\/small>/);
  assert.doesNotMatch(renderCurriculumResults([cert('الفصل الأول', null, {scoreStatus:'absent'})], 'التجاري'), /class="curriculum-grade curriculum-failed"/);
});
test('a template cell with two alternate codes ("code1/code2") matches whichever one the certificate actually has', () => {
  const withSecondCode = { terms: [{ label: 'الفصل الأول', subjects: [{ code: 'رسم813', name: 'رسم فني', score: 82 }] }] };
  const html = renderCurriculumResults([withSecondCode], 'الصناعي');
  assert.ok(html.includes('رسم803/رسم813'), 'template still shows the combined code label');
  assert.ok(html.includes('>82<'), 'the grade for the second alternate code is matched and shown');
  assert.ok(!html.includes('غير مدرجة بالقالب'), 'the alternate code must not also leak into the "unlisted courses" section');
});

test('student track takes precedence over certificate metadata', () => {
  assert.equal(curriculumTrack({track:'الصناعي'}, [{track:'التجاري'}]), 'الصناعي');
  assert.equal(curriculumTrack({department:'التجاري'}), 'التجاري');
});
