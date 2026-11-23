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
  assert.match(html, /font-family:CairoWeb;/);
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

test("embedded send scripts match tools/ (run scripts/build-send-scripts.mjs)", async () => {
  const { readFileSync } = await import("node:fs");
  const { renderSendScripts } = await import("../scripts/build-send-scripts.mjs");
  assert.equal(readFileSync(new URL("../src/modules/grades/send-scripts.js", import.meta.url), "utf8"), renderSendScripts());
  const { WINDOWS_SCRIPT, MAC_SCRIPT } = await import("../src/modules/grades/send-scripts.js");
  assert.match(WINDOWS_SCRIPT, /Outlook\.Application/);
  assert.match(MAC_SCRIPT, /send-outlook-mac.applescript/);
  const { MAC_OUTLOOK_SCRIPT } = await import("../src/modules/grades/send-scripts.js");
  assert.match(MAC_OUTLOOK_SCRIPT, /make new outgoing message/);
});

test("bulk result marks all sent students in batches and is safe to re-upload", async () => {
  const { applyBulkResult } = await import("../src/modules/grades/checkpoint-bulk.js");
  const saved = new Map();
  let calls = 0;
  globalThis.__MASAR_TEST_BACKEND__ = { bulkPut: async (_c, recs) => { calls++; for (const r of recs) saved.set(r.id, r); } };
  try {
    const term = "الفصل الأول";
    const records = Array.from({ length: 450 }, (_, i) => ({ id: `r${i}`, studentId: String(1000 + i), term, checkpoint: 1 }));
    records.push({ id: "other", studentId: "1000", term: "فصل آخر", checkpoint: 1 });
    const lines = ['"academicId","status","at","error"', ...records.slice(0, 450).map((r) => `"${r.studentId}","sent","2026-11-23T11:21:53",""`), '"9999","sent","2026-11-23T11:30:00",""', '"1001","failed","2026-11-23T11:30:00","x"'];
    const res = await applyBulkResult("﻿" + lines.join("\r\n"), records, term);
    assert.equal(res.marked, 450);
    assert.equal(res.notFound, 1);
    assert.equal(calls, 3);
    assert.ok(!saved.has("other"));
    assert.equal(saved.get("r5").reportSentVia, "outlook-bulk");
    const again = await applyBulkResult(lines.join("\n"), [...saved.values()], term);
    assert.equal(again.marked, 0);
    assert.equal(again.already, 450);
  } finally { delete globalThis.__MASAR_TEST_BACKEND__; }
});
