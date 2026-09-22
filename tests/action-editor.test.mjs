import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { COLLECTIONS } from '../src/core/config.js';
import { clear, bulkPut, list } from '../src/services/cloud-runtime.js';
import { readActionEditorForm, saveActionEditor } from '../src/modules/shared/action-editor.js';

beforeEach(async () => {
  for (const name of COLLECTIONS) await clear(name);
});

// A minimal stand-in for an HTMLFormElement — only the named-field `.value`
// access readActionEditorForm actually uses.
function fakeForm(fields) {
  return fields;
}

test('readActionEditorForm splits plan fields and progress fields into two separate patches', () => {
  const form = fakeForm({
    action: { value: 'نص الإجراء' },
    target: { value: 'الفئة المستهدفة' },
    executor: { value: 'دور المكتب' },
    follower: { value: 'الأقسام المشاركة' },
    evidence: { value: 'الثبوتيات' },
    period: { value: 'طوال العام الدراسي' },
    periodStart: { value: '2026-09-01' },
    periodEnd: { value: '' },
    status: { value: 'ongoing' },
    participantsCount: { value: '25' },
    proofNote: { value: 'ثبوتية فعلية' },
    obstacles: { value: '' },
    followUpItemId: { value: 'item-1' },
    effectivenessReport: { value: 'تقرير الفعالية' },
  });
  const { actionPatch, progressPatch } = readActionEditorForm(form);
  assert.deepEqual(actionPatch, {
    action: 'نص الإجراء', target: 'الفئة المستهدفة', executor: 'دور المكتب', follower: 'الأقسام المشاركة',
    evidence: 'الثبوتيات', period: 'طوال العام الدراسي', periodStart: '2026-09-01', periodEnd: null,
  });
  assert.deepEqual(progressPatch, {
    status: 'ongoing', participantsCount: '25', proofNote: 'ثبوتية فعلية', obstacles: null,
    followUpItemId: 'item-1', effectivenessReport: 'تقرير الفعالية',
  });
});

test('saveActionEditor writes both departmentPlanProjects.actions[] and actionProgress from one call', async () => {
  await bulkPut('departmentPlanProjects', [{
    id: 'proj1', pillar: 'الانجاز الاكاديمي', project_title: 'مشروع', order: 0,
    actions: [{ no: 1, action: 'قديم', target: '', executor: '', follower: '', evidence: '', period: '', periodStart: null, periodEnd: null }],
  }]);
  const entry = { id: 'proj1-a1', projectId: 'proj1', no: 1 };
  const form = fakeForm({
    action: { value: 'إجراء محدَّث' }, target: { value: 'هدف جديد' }, executor: { value: '' }, follower: { value: '' },
    evidence: { value: '' }, period: { value: '' }, periodStart: { value: '' }, periodEnd: { value: '' },
    status: { value: 'done' }, participantsCount: { value: '10' }, proofNote: { value: '' }, obstacles: { value: '' },
    followUpItemId: { value: '' }, effectivenessReport: { value: '' },
  });

  await saveActionEditor(entry, form);

  const [projects, progress] = await Promise.all([list('departmentPlanProjects'), list('actionProgress')]);
  const savedAction = projects[0].actions.find((a) => a.no === 1);
  assert.equal(savedAction.action, 'إجراء محدَّث');
  assert.equal(savedAction.target, 'هدف جديد');
  const savedProgress = progress.find((p) => p.id === 'proj1-a1');
  assert.equal(savedProgress.status, 'done');
  assert.equal(savedProgress.participantsCount, '10');
});
