import './helpers/fake-cloud-backend.mjs';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clear } from '../src/services/cloud-runtime.js';
import { listReminders, addReminder, toggleReminder, removeReminder, isOverdue, isDueToday } from '../src/modules/reminders/reminders-service.js';

function bahrainToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const today = bahrainToday();
const yesterday = addDays(today, -1);
const tomorrow = addDays(today, 1);

beforeEach(async () => {
  await clear('reminders');
});

test('addReminder requires a non-empty title', async () => {
  await assert.rejects(() => addReminder({ title: '  ' }), /عنوان التذكير/);
});

test('addReminder trims the title, defaults dueDate/note, and starts as open', async () => {
  const reminder = await addReminder({ title: '  متابعة أ  ' });
  assert.equal(reminder.title, 'متابعة أ');
  assert.equal(reminder.dueDate, null);
  assert.equal(reminder.note, '');
  assert.equal(reminder.status, 'open');
  assert.ok(reminder.createdAt);
});

test('listReminders sorts by dueDate ascending', async () => {
  await addReminder({ title: 'ب', dueDate: tomorrow });
  await addReminder({ title: 'أ', dueDate: yesterday });
  const rows = await listReminders();
  assert.deepEqual(rows.map((r) => r.title), ['أ', 'ب']);
});

test('toggleReminder flips status between open and done without touching other fields', async () => {
  const reminder = await addReminder({ title: 'أ', note: 'ملاحظة' });
  const done = await toggleReminder(reminder);
  assert.equal(done.status, 'done');
  assert.equal(done.note, 'ملاحظة');
  const reopened = await toggleReminder(done);
  assert.equal(reopened.status, 'open');
});

test('removeReminder deletes the reminder', async () => {
  const reminder = await addReminder({ title: 'أ' });
  await removeReminder(reminder.id);
  assert.deepEqual(await listReminders(), []);
});

test('isOverdue is true only for a past dueDate on an open reminder', () => {
  assert.equal(isOverdue({ dueDate: yesterday, status: 'open' }), true);
  assert.equal(isOverdue({ dueDate: today, status: 'open' }), false);
  assert.equal(isOverdue({ dueDate: tomorrow, status: 'open' }), false);
  assert.equal(isOverdue({ dueDate: yesterday, status: 'done' }), false);
  assert.equal(isOverdue({ dueDate: null, status: 'open' }), false);
});

test('isDueToday is true only for a reminder due exactly today and still open', () => {
  assert.equal(isDueToday({ dueDate: today, status: 'open' }), true);
  assert.equal(isDueToday({ dueDate: yesterday, status: 'open' }), false);
  assert.equal(isDueToday({ dueDate: today, status: 'done' }), false);
});
