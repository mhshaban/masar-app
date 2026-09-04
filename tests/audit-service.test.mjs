import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTION_LABELS, TABLE_LABELS, normalizeAuditPage } from "../src/modules/audit/audit-service.js";

test("normalizeAuditPage keeps only safe paging metadata", () => {
  const result = normalizeAuditPage({ total: "51", rows: [{ id: 1 }] }, 2, 25);
  assert.equal(result.total, 51);
  assert.equal(result.pages, 3);
  assert.equal(result.page, 2);
  assert.deepEqual(result.rows, [{ id: 1 }]);
});

test("audit labels cover the sensitive operations shown to the admin", () => {
  assert.equal(ACTION_LABELS.restore_backup, "استعادة نسخة احتياطية");
  assert.equal(ACTION_LABELS.update_student, "تعديل بيانات طالب");
  assert.equal(ACTION_LABELS.update_user, "تعديل بيانات مستخدم");
  assert.equal(TABLE_LABELS.departmentForms, "الاستمارات");
  assert.equal(TABLE_LABELS.profiles, "المستخدمون");
});
