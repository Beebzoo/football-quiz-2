/* Three answers ran past the 110 char card limit. Same rule as the question
   trims: shorten the telling, keep every fact the answer turns on. Matched on
   a unique fragment, and the script refuses to run if a fragment is not
   exactly one row. */
const fs = require("fs");
const FILE = "c:/dev/_Personal/Hobbies/Football Quiz/assets/extra/index.json";

const EDITS = [
  ["Their name came out of a hat",
   "Their name came out of a hat to play Israel, whose scheduled opponents had all refused to face them"],
  ["no TV cameras there and the photographers",
   "No cameras were there and the photographers stood behind the other goal, expecting Werder Bremen to score"],
  ["The Old Firm final and its replay were both drawn",
   "The Old Firm final and replay were both drawn, fans rioted over the lack of extra time and the clubs refused a third game"],
];

const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
for (const [frag, a] of EDITS) {
  let hits = 0;
  for (const rows of Object.values(d)) for (const r of rows) if (r.a.includes(frag)) { hits++; r.a = a; }
  if (hits !== 1) { console.log(`!! "${frag}" matched ${hits} rows, expected 1`); process.exit(1); }
}
const bad = [];
for (const [t, rows] of Object.entries(d)) rows.forEach(r => {
  if (r.a.length > 110) bad.push(`${t} answer ${r.a.length}`);
  if (r.q.length > 150) bad.push(`${t} question ${r.q.length}`);
});
if (/[\u2014\u2013]/.test(JSON.stringify(d))) { console.log("!! em dash introduced"); process.exit(1); }
console.log(`rewrote ${EDITS.length}, still over limit: ${bad.length}`, bad);
fs.writeFileSync(FILE, JSON.stringify(d, null, 1), "utf8");
console.log("saved");
