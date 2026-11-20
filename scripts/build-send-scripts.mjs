// يولّد src/modules/grades/send-scripts.js من ملفات tools/ حتى تُضمَّن سكربتات
// الإرسال داخل التطبيق نفسه (بدل تحميلها من الموقع وقت تجهيز الحزمة).
// شغّله بعد أي تعديل على أي ملف من سكربتات الإرسال في tools/:
//   node scripts/build-send-scripts.mjs
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8").replace(/^﻿/, "");

export function renderSendScripts() {
  return `// ملف مولَّد — لا تعدّله يدويًا. المصدر: tools/send-reports.ps1 و tools/send-reports-mac.js و tools/send-outlook-mac.applescript
// التوليد: node scripts/build-send-scripts.mjs
export const WINDOWS_SCRIPT = ${JSON.stringify(read("tools/send-reports.ps1"))};

export const MAC_SCRIPT = ${JSON.stringify(read("tools/send-reports-mac.js"))};

export const MAC_OUTLOOK_SCRIPT = ${JSON.stringify(read("tools/send-outlook-mac.applescript"))};
`;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  writeFileSync(new URL("src/modules/grades/send-scripts.js", root), renderSendScripts());
  console.log("send-scripts.js updated");
}
