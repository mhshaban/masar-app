import test from "node:test";
import assert from "node:assert/strict";
import { buildEml } from "../src/modules/grades/checkpoint-eml.js";

test("eml has recipient, unsent flag, encoded subject and pdf attachment", () => {
  const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]);
  const eml = buildEml({ to: "s@example.com", subject: "تقرير التحصيل الأكاديمي — طالب", text: "عزيزي الطالب\nمرفق التقرير", attachment: { name: "تقرير - 1.pdf", bytes: pdf } });
  assert.match(eml, /^To: s@example\.com\r\n/);
  assert.match(eml, /\r\nX-Unsent: 1\r\n/);
  assert.match(eml, /Subject: =\?UTF-8\?B\?/);
  assert.match(eml, /Content-Disposition: attachment; filename\*=UTF-8''/);
  assert.ok(eml.includes(Buffer.from(pdf).toString("base64")));
  const subj = [...eml.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].slice(0, 3).map((m) => Buffer.from(m[1], "base64").toString("utf8")).join("");
  assert.ok(subj.startsWith("تقرير التحصيل"));
  for (const line of eml.split("\r\n")) assert.ok(line.length <= 998);
});
