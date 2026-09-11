import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffRoster, buildChangesSheetRows, recordsById, STUDENT_IDENTITY_FIELDS, STUDENT_FIELDS } from '../src/services/roster-changes-export-service.js';

const FIELDS = STUDENT_FIELDS;
const IDENTITY = STUDENT_IDENTITY_FIELDS;

test('diffRoster treats every record as "جديد" when there is no previous snapshot', () => {
  const current = [{ id: '1', academicId: '1', name: 'أحمد', email: 'a@x.com' }];
  const { changed, deleted, changedFieldKeys } = diffRoster(current, {}, FIELDS);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].status, 'جديد');
  assert.ok(changed[0].changedKeys.has('email'));
  assert.equal(deleted.length, 0);
  assert.ok(changedFieldKeys.has('email'));
});

test('diffRoster flags only the fields that actually changed, ignores untouched records', () => {
  const previous = recordsById([
    { id: '1', academicId: '1', name: 'أحمد', email: 'old@x.com', section: 'أ' },
    { id: '2', academicId: '2', name: 'سلمى', email: 'b@x.com' },
  ]);
  const current = [
    { id: '1', academicId: '1', name: 'أحمد', email: 'new@x.com', section: 'أ' },
    { id: '2', academicId: '2', name: 'سلمى', email: 'b@x.com' },
  ];
  const { changed, deleted } = diffRoster(current, previous, FIELDS);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].id, '1');
  assert.equal(changed[0].status, 'معدّل');
  assert.deepEqual([...changed[0].changedKeys], ['email']);
  assert.equal(deleted.length, 0);
});

test('diffRoster reports records missing from the current roster as deleted', () => {
  const previous = recordsById([{ id: '1', academicId: '1', name: 'أحمد' }]);
  const { changed, deleted } = diffRoster([], previous, FIELDS);
  assert.equal(changed.length, 0);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].record.name, 'أحمد');
});

test('a phones array is compared as a joined string, not by reference', () => {
  const previous = recordsById([{ id: '1', academicId: '1', name: 'أحمد', phones: ['111', '222'] }]);
  const current = [{ id: '1', academicId: '1', name: 'أحمد', phones: ['111', '222'] }];
  assert.equal(diffRoster(current, previous, FIELDS).changed.length, 0);

  const changedPhones = [{ id: '1', academicId: '1', name: 'أحمد', phones: ['111', '333'] }];
  const result = diffRoster(changedPhones, previous, FIELDS);
  assert.equal(result.changed.length, 1);
  assert.ok(result.changed[0].changedKeys.has('phones'));
});

test('buildChangesSheetRows only emits columns that changed somewhere in the batch, blank elsewhere', () => {
  const previous = recordsById([
    { id: '1', academicId: '1', name: 'أحمد', email: 'old@x.com', section: 'أ' },
  ]);
  const current = [
    { id: '1', academicId: '1', name: 'أحمد', email: 'new@x.com', section: 'أ' },
    { id: '2', academicId: '2', name: 'سلمى', section: 'ب' },
  ];
  const diff = diffRoster(current, previous, FIELDS);
  const { header, rows } = buildChangesSheetRows(diff, IDENTITY, FIELDS);

  assert.deepEqual(header, ['الرقم الأكاديمي', 'الاسم', 'الحالة', 'البريد الإلكتروني', 'الشعبة']);
  assert.equal(rows.length, 2);
  const editedRow = rows.find((r) => r[0] === '1');
  assert.deepEqual(editedRow, ['1', 'أحمد', 'معدّل', 'new@x.com', '']);
  const newRow = rows.find((r) => r[0] === '2');
  assert.deepEqual(newRow, ['2', 'سلمى', 'جديد', '', 'ب']);
});

test('buildChangesSheetRows includes deleted rows with identity columns filled from the snapshot', () => {
  const previous = recordsById([{ id: '9', academicId: '9', name: 'محذوف الاسم', email: 'x@x.com' }]);
  const diff = diffRoster([], previous, FIELDS);
  const { header, rows } = buildChangesSheetRows(diff, IDENTITY, FIELDS);
  // لا صفوف "جديد"/"معدّل" هنا لتساهم بأي عمود حقل — عمود البريد لا يظهر،
  // صف المحذوف يحمل الهوية والحالة فقط.
  assert.deepEqual(header, ['الرقم الأكاديمي', 'الاسم', 'الحالة']);
  assert.deepEqual(rows, [['9', 'محذوف الاسم', 'محذوف']]);
});
