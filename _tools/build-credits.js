/* Turn the attribution files into something a player can actually read.

     node _tools/build-credits.js

   Every photo in this game is somebody's work, and the licences on them are
   not decoration: CC BY and CC BY-SA both require the author to be named in a
   way that suits the medium. Until now the names lived in three CSVs in the
   repo, which credits nobody who is holding the phone. This writes
   assets/credits.json, and the app renders it on a Credits screen.

   The counts and the licence split are worked out from the files rather than
   written by hand here, so the screen cannot drift from what actually ships.

   SAFE TO RE-RUN. Rebuild it after any harvest. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "assets", "credits.json");

/* which column holds what, per file, because the three grew separately */
const SETS = [
  { dir: "faces", title: "Player and manager portraits",
    lic: "license", auth: "author",
    note: "Cropped to the head and resized for the reveal circle." },
  { dir: "stadiums", title: "Stadium photographs", lic: "license", auth: "author" },
  { dir: "kits", title: "Kit diagrams", lic: "license", auth: "author",
    note: "Drawn by hand on Commons, which is why they can be redistributed at all." },
];

function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  const head = lines[0].split(";");
  return lines.slice(1).map(l => {
    const c = l.split(";"), row = {};
    head.forEach((h, i) => row[h.trim()] = (c[i] || "").trim());
    return row;
  });
}

const tidy = s => String(s || "").replace(/\s+/g, " ").trim();

const sets = [];
for (const set of SETS) {
  const file = path.join(REPO, "assets", set.dir, "ATTRIBUTION.csv");
  if (!fs.existsSync(file)) { console.log(`skipped ${set.dir}, no attribution file`); continue; }
  const rows = readCsv(file);
  const licences = {}, authors = new Map();
  for (const r of rows) {
    const lic = tidy(r[set.lic]) || "see source";
    licences[lic] = (licences[lic] || 0) + 1;
    const a = tidy(r[set.auth]);
    /* One photographer shot forty grounds. Count them once, and keep the
       count so the busiest names can be shown first. */
    if (a && a !== "unknown") authors.set(a, (authors.get(a) || 0) + 1);
  }
  sets.push({
    title: set.title,
    count: rows.length,
    source: "Wikimedia Commons",
    note: set.note || "",
    licences: Object.entries(licences).sort((a, b) => b[1] - a[1]).map(([l, n]) => ({ l, n })),
    authors: [...authors.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([a]) => a),
  });
  console.log(`${set.dir}: ${rows.length} files, ${authors.size} people to credit`);
}

/* The rest of what the game is made of, including the part that is not free */
const notes = [
  { h: "Questions and facts",
    t: "Generated from Wikidata, which is released into the public domain under CC0. "
     + "No permission is needed and none is implied: mistakes in a question are ours, not theirs." },
  { h: "Club badges",
    t: "The crests are the property of the clubs and are not freely licensed. They are here "
     + "because a football quiz without badges is not a football quiz. This is a private game "
     + "made for three people and sold to nobody. If you are a club and would rather yours "
     + "was not here, say so and it goes." },
  { h: "Flags",
    t: "National flags from flagcdn, self-hosted. Flag designs themselves are not copyrightable." },
  { h: "Typeface",
    t: "Barlow Semi Condensed by Jeremy Tribby, SIL Open Font License 1.1. "
     + "The licence travels with the files in assets/fonts/OFL.txt." },
  { h: "Face detection",
    t: "Portraits are framed by OpenCV's YuNet detector, run on a laptop in Maastricht. "
     + "No photo of anybody was ever sent to a third party to do it." },
];

const out = { built: null, sets, notes };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const authors = sets.reduce((a, s) => a + s.authors.length, 0);
console.log(`\n${sets.length} sets, ${authors} people credited, ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
