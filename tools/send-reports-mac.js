// إرسال تقارير التحصيل الأكاديمي من Outlook على الماك (حزمة من مسار).
// يُشغَّل من SEND-MAC.command: osascript -l JavaScript send-reports-mac.js <المجلد>
// يقرأ manifest.csv، يعرض العدد وأول اسمين للتأكيد، وبعد «إرسال» يرسل لكل طالب
// تقريره مدمجًا في نص البريد من Outlook على هذا الجهاز. يحفظ result.csv.
ObjC.import("Foundation");

function readText(path) {
  const s = $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null);
  if (!s || s.isNil()) throw new Error("ما قدرت أقرأ " + path);
  return s.js.replace(/^﻿/, "");
}

function writeText(path, text) {
  $(text).writeToFileAtomicallyEncodingError(path, true, $.NSUTF8StringEncoding, null);
}

function parseCsv(text) {
  const rows = [];
  let field = "", row = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((c) => c !== "")) rows.push(row); }
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
}

const csvCell = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
const nowIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 19); };

function run(argv) {
  const app = Application.currentApplication();
  app.includeStandardAdditions = true;
  const TITLE = "مسار - إرسال التقارير";
  const say = (text) => app.displayDialog(text, { withTitle: TITLE, buttons: ["تم"], defaultButton: "تم" });

  const dir = argv[0];
  const manifestPath = dir + "/manifest.csv";
  if (!$.NSFileManager.defaultManager.fileExistsAtPath(manifestPath)) {
    say("ما لقيت manifest.csv.\nفك ضغط الملف أولًا، ثم شغّل SEND-MAC.command من نفس المجلد.");
    return;
  }
  const rows = parseCsv(readText(manifestPath));
  if (!rows.length) { say("القائمة فاضية."); return; }

  const sample = rows.slice(0, 2).map((r) => "• " + r.name + "  <" + r.email + ">").join("\n");
  try {
    app.displayDialog(
      "سيتم إرسال " + rows.length + " رسالة من بريدك في Outlook، ولكل طالب تقريره داخل الرسالة.\n\nأول الرسائل:\n" + sample + "\n\nهل تريد الإرسال الآن؟",
      { withTitle: "مسار - تأكيد الإرسال", buttons: ["إلغاء", "إرسال"], defaultButton: "إلغاء", cancelButton: "إلغاء", withIcon: "caution" });
  } catch (e) {
    say("أُلغي الإرسال. ما انرسل شي.");
    return;
  }

  let outlook;
  try {
    outlook = Application("Microsoft Outlook");
    outlook.activate();
  } catch (e) {
    say("ما قدرت أفتح Microsoft Outlook على هذا الجهاز.\n" + e.message);
    return;
  }

  const results = [];
  let sent = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    console.log((i + 1) + " / " + rows.length + "  " + r.name);
    try {
      const html = readText(dir + "/" + String(r.htmlFile).replace(/\\/g, "/"));
      const msg = outlook.make({ new: "outgoingMessage", withProperties: { subject: r.subject, content: html } });
      outlook.make({ new: "toRecipient", at: msg, withProperties: { emailAddress: { address: r.email } } });
      outlook.send(msg);
      results.push({ academicId: r.academicId, status: "sent", at: nowIso(), error: "" });
      sent++;
    } catch (e) {
      results.push({ academicId: r.academicId, status: "failed", at: nowIso(), error: e.message });
      // أول رسالة فشلت: غالبًا Outlook الجديد (لا يدعم الأوامر). نوقف بدل ما تفشل كلها.
      if (sent === 0) {
        writeResults(dir, results);
        say("ما قدر Outlook يرسل أول رسالة، فوقّفت الإرسال (ما انرسل شي).\n\n"
          + "إذا كان Outlook الجديد مفعّل: من قائمة Outlook (أعلى الشاشة) اختر «Legacy Outlook» ثم شغّل السكربت مرة ثانية.\n"
          + "وإذا طلع لك طلب سماح للتحكم في Outlook اضغط «سماح» (OK).\n\nالخطأ: " + e.message);
        return;
      }
    }
    delay(0.8);
  }
  writeResults(dir, results);
  say("انرسل: " + sent + "\nما انرسل: " + (rows.length - sent) + "\n\nارفع الملف result.csv (في نفس المجلد) في مسار من «رفع نتيجة الإرسال» عشان يتأشر على الطلاب.");
}

function writeResults(dir, results) {
  const head = ["academicId", "status", "at", "error"];
  const lines = [head.map(csvCell).join(",")].concat(results.map((r) => head.map((h) => csvCell(r[h])).join(",")));
  writeText(dir + "/result.csv", "﻿" + lines.join("\r\n") + "\r\n");
}
