import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createZip, crc32 } from "../src/modules/grades/zip-writer.js";
import { manifestCsv, parseResultCsv } from "../src/modules/grades/checkpoint-bulk.js";
import { emailHtml } from "../src/modules/grades/checkpoint-report.js";
import { buildEml } from "../src/modules/grades/checkpoint-eml.js";

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("zip opens with python zipfile, Arabic names intact", () => {
  const zip = createZip([{ name: "reports/1.html", bytes: "<p>مرحبا</p>" }, { name: "اقرأني.txt", bytes: "نص" }]);
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  const path = join(dir, "t.zip");
  writeFileSync(path, zip);
  const out = execFileSync("python3", ["-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print('|'.join(z.namelist()));print(z.read('reports/1.html').decode())", path]).toString();
  assert.match(out, /reports\/1\.html\|اقرأني\.txt/);
  assert.match(out, /<p>مرحبا<\/p>/);
});

test("manifest csv quotes fields; result csv parses", () => {
  const csv = manifestCsv([{ academicId: "1", name: 'أحمد "الأول"', email: "a@x", subject: "تقرير، الأول", htmlFile: "reports\\1.html" }]);
  assert.ok(csv.startsWith("﻿academicId,name,email,subject,htmlFile\r\n"));
  assert.match(csv, /"أحمد ""الأول"""/);
  const rows = parseResultCsv('﻿"academicId","status","at","error"\r\n"1","sent","2026-11-19T16:00:00",""\r\n"2","failed","2026-11-19T16:00:01","No, bad"\r\n');
  assert.deepEqual(rows.map((r) => [r.academicId, r.status]), [["1", "sent"], ["2", "failed"]]);
  assert.equal(rows[1].error, "No, bad");
});

test("email html embeds the report without the greeting line, eml carries it", () => {
  const html = emailHtml({ name: "طالب" }, { second: null }, "<table><tr><td>REPORT</td></tr></table>");
  assert.ok(!/عزيزي الطالب طالب/.test(html));
  assert.match(html, /فيما يلي تقرير/);
  assert.match(html, /REPORT/);
  assert.match(html, /family=Cairo/);
  assert.ok(!/قسم الإرشاد الأكاديمي والتوجيه المهني<\/div>/.test(html));
  const eml = buildEml({ to: "a@x", subject: "س", text: "نص", html });
  assert.ok(!/Content-Disposition: attachment/.test(eml));
  const b64 = eml.split("Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
  assert.match(Buffer.from(b64, "base64").toString("utf8"), /REPORT/);
});

test("zip keeps the executable bit for the mac launcher", () => {
  const zip = createZip([{ name: "SEND-MAC.command", bytes: "#!/bin/bash\n", mode: 0o755 }, { name: "a.txt", bytes: "x" }]);
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  const path = join(dir, "t.zip");
  writeFileSync(path, zip);
  const out = execFileSync("python3", ["-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);print(oct(z.getinfo('SEND-MAC.command').external_attr>>16), z.getinfo('SEND-MAC.command').create_system)", path]).toString().trim();
  assert.equal(out, "0o100755 3");
});

test("mac send script parses the manifest csv", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../tools/send-reports-mac.js", import.meta.url), "utf8").replace('ObjC.import("Foundation");', "");
  const parseCsv = new Function(src + "; return parseCsv;")();
  const rows = parseCsv(manifestCsv([{ academicId: "7", name: 'علي "ب"', email: "a@x", subject: "تقرير، ١", htmlFile: "reports\\7.html" }]).replace(/^﻿/, ""));
  assert.deepEqual(rows, [{ academicId: "7", name: 'علي "ب"', email: "a@x", subject: "تقرير، ١", htmlFile: "reports\\7.html" }]);
});
