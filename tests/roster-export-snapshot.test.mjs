import 'fake-indexeddb/auto';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER_EXPORT_SNAPSHOT_DB } from '../src/services/local-security.js';
import { getRosterSnapshot, saveRosterSnapshot } from '../src/services/roster-export-snapshot.js';

beforeEach(async () => {
  await new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(ROSTER_EXPORT_SNAPSHOT_DB);
    request.onsuccess = request.onerror = request.onblocked = resolve;
  });
});

test('getRosterSnapshot returns {} when nothing was saved yet', async () => {
  assert.deepEqual(await getRosterSnapshot('students'), {});
});

test('saveRosterSnapshot then getRosterSnapshot round-trips the same data, scoped per collection', async () => {
  await saveRosterSnapshot('students', { '1': { id: '1', name: 'أحمد' } });
  await saveRosterSnapshot('schoolTeachers', { '2': { id: '2', name: 'سالم' } });

  assert.deepEqual(await getRosterSnapshot('students'), { '1': { id: '1', name: 'أحمد' } });
  assert.deepEqual(await getRosterSnapshot('schoolTeachers'), { '2': { id: '2', name: 'سالم' } });
});

test('saveRosterSnapshot overwrites the previous snapshot for the same collection', async () => {
  await saveRosterSnapshot('students', { '1': { id: '1', name: 'قديم' } });
  await saveRosterSnapshot('students', { '2': { id: '2', name: 'جديد' } });
  assert.deepEqual(await getRosterSnapshot('students'), { '2': { id: '2', name: 'جديد' } });
});
