import { test } from "node:test";
import assert from "node:assert/strict";
import { locationOfRoom, levelOfSection, locateSections } from "../src/modules/schedule/section-locations-service.js";

test("locationOfRoom classifies real room codes from the schedule", () => {
  assert.equal(locationOfRoom("101-2"), "b2");
  assert.equal(locationOfRoom("101-2+102-2"), "b2");
  assert.equal(locationOfRoom("315-20+316-20"), "b20");
  assert.equal(locationOfRoom("B38+215-20"), "b20");
  assert.equal(locationOfRoom("كهر1"), "practical");
  assert.equal(locationOfRoom("لحام+لحا2"), "practical");
  assert.equal(locationOfRoom("101-9"), "other");
  assert.equal(locationOfRoom("101-7+101-11"), "other");
  assert.equal(locationOfRoom(""), "other");
});

test("levelOfSection reads the level from the section's first digit", () => {
  assert.equal(levelOfSection("١تلم١"), "الأول");
  assert.equal(levelOfSection("٣كهر٢"), "الثاني");
  assert.equal(levelOfSection("٥الكا٣"), "الثالث");
  assert.equal(levelOfSection(""), null);
});

test("locateSections filters by day, period, session and level, and groups by location", () => {
  const rows = [
    { section: "١تلم١", day: "الأحد", period: "3", session: "صباحي", room: "101-2", subjectCode: "طاق801" },
    { section: "٣كهر٢", day: "الأحد", period: "3", session: "صباحي", room: "كهر1" },
    { section: "٥الكا٣", day: "الأحد", period: "3", session: "صباحي", room: "315-20" },
    { section: "٥تجر١", day: "الأحد", period: "3", session: "مسائي", room: "202-20" },
    { section: "١تلم٢", day: "الأحد", period: "4", session: "صباحي", room: "102-2" },
    { section: "١تلم٣", day: "الاثنين", period: "3", session: "صباحي", room: "103-2" },
  ];
  const names = (groups) => Object.fromEntries(groups.map((g) => [g.key, g.sections.map((s) => s.section)]));

  assert.deepEqual(names(locateSections(rows, { day: "الأحد", period: "3", session: "صباحي" })),
    { practical: ["٣كهر٢"], b2: ["١تلم١"], b20: ["٥الكا٣"], other: [] });
  assert.deepEqual(names(locateSections(rows, { day: "الأحد", period: "3", session: "" })).b20, ["٥الكا٣", "٥تجر١"]);
  assert.deepEqual(names(locateSections(rows, { day: "الأحد", period: "3", session: "صباحي", level: "الأول" })),
    { practical: [], b2: ["١تلم١"], b20: [], other: [] });
});
