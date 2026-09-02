#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractPdfRows } from "./lib/pdf-rows.mjs";
import { parseCertificateRows } from "./lib/certificate-parser.mjs";

const [folder, output] = process.argv.slice(2);
if (!folder || !output) throw new Error("الاستخدام: generate-final-cumulative-sql.mjs <مجلد الشهادات> <ملف SQL>");

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.name.toLowerCase().endsWith(".pdf")) files.push(full);
  }
  return files;
}

const values = new Map();
const conflicts = [];
let failed = 0;
for (const file of (await walk(folder)).sort()) {
  try {
    const cert = parseCertificateRows(await extractPdfRows(await readFile(file)));
    if (!cert.academicId || cert.finalCumulativeAverage == null) continue;
    const previous = values.get(cert.academicId);
    if (previous != null && previous !== cert.finalCumulativeAverage) conflicts.push([cert.academicId, previous, cert.finalCumulativeAverage]);
    values.set(cert.academicId, cert.finalCumulativeAverage);
  } catch {
    failed += 1;
  }
}

const tuples = [...values.entries()].map(([studentId, average]) => `('${studentId}', ${average})`).join(",\n  ");
const sql = `begin;
create temporary table masar_final_cumulative (student_id text primary key, average numeric not null) on commit drop;
insert into masar_final_cumulative (student_id, average) values
  ${tuples};

update public."academicFlags" as flags
set data = jsonb_set(flags.data, '{finalCumulativeAverage}', to_jsonb(src.average), true)
from masar_final_cumulative as src
where flags.id = src.student_id or flags.data->>'studentId' = src.student_id;

select count(*) as updated_students
from public."academicFlags"
where data ? 'finalCumulativeAverage' and data->>'finalCumulativeAverage' is not null;
commit;
`;
await writeFile(output, sql, "utf8");
console.log(JSON.stringify({ certificatesWithFinalAverage: values.size, conflicts: conflicts.length, failed, sample: [...values.entries()].slice(0, 5) }));
