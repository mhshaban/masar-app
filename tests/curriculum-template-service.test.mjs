import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clear } from '../src/services/cloud-runtime.js';
import { parseCurriculumTemplateSheets, commitCurriculumTemplates, loadCurriculumTemplates } from '../src/services/curriculum-template-service.js';

beforeEach(async () => {
  await clear('curriculumTemplates');
});

const HEADER = ['القسم', 'نوع المقرر', 'الفصل١', 'الفصل٢', 'الفصل٣', 'الفصل٤', 'الفصل٥', 'الفصل٦'];

test('parseCurriculumTemplateSheets returns {} when neither track sheet is present', () => {
  assert.deepEqual(parseCurriculumTemplateSheets({ 'كشف الطلاب': [HEADER] }), {});
});

test('parseCurriculumTemplateSheets parses only the tracks whose sheet is present, skipping blank separator rows', () => {
  const sheets = {
    'الصناعي': [
      HEADER,
      ['قسم أ', 'تخصصية', 'كود801', 'كود801', '', '', '', ''],
      [null, null, null, null, null, null, null, null],
      ['قسم ب', 'مساندة', '', '', 'كود803', '', '', ''],
    ],
  };
  const templates = parseCurriculumTemplateSheets(sheets);
  assert.deepEqual(Object.keys(templates), ['الصناعي']);
  assert.equal(templates['الصناعي'].length, 2);
  assert.equal(templates['الصناعي'][0].department, 'قسم أ');
  assert.deepEqual(templates['الصناعي'][0].codes, ['كود801', 'كود801', '', '', '', '']);
  assert.deepEqual(templates['الصناعي'][1].codes, ['', '', 'كود803', '', '', '']);
});

test('commitCurriculumTemplates writes only the tracks given, and loadCurriculumTemplates reads them back', async () => {
  const templates = { 'الصناعي': [{ department: 'قسم أ', type: 'تخصصية', codes: ['كود801', '', '', '', '', ''] }] };
  const result = await commitCurriculumTemplates(templates);
  assert.deepEqual(result.updatedTracks, ['الصناعي']);
  const loaded = await loadCurriculumTemplates();
  assert.deepEqual(loaded['الصناعي'], templates['الصناعي']);
  assert.equal(loaded['التجاري'], undefined, 'a track absent from the file must not be touched');
});

test('commitCurriculumTemplates is a no-op when no track sheets were found', async () => {
  const result = await commitCurriculumTemplates({});
  assert.deepEqual(result.updatedTracks, []);
  assert.deepEqual(await loadCurriculumTemplates(), {});
});
