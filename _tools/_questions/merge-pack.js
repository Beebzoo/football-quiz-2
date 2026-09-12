/* Merge the new question files into one Classic pack the app can load.
   Validates before it writes: shape, tier names, em dashes, and near-duplicates
   against the 3,226 questions already shipping.

   node merge-pack.js out.json in1.json in2.json ...
   Add --write to actually write; without it, it only reports. */
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = "c:/dev/_Personal/Hobbies/Football Quiz";
const TIERS = ["easy", "normal", "hard", "extreme", "ball"];

const args = process.argv.slice(2);
const write = args.includes("--write");
const [out, ...ins] = args.filter(a => a !== "--write");

/* ---- what already ships ---- */
const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const start = src.indexOf("const BANK"), open = src.indexOf("{", start);
let depth = 0, end = -1, inStr = null;
for (let i = open; i < src.length; i++) {
  const c = src[i], p = src[i - 1];
  if (inStr) { if (c === inStr && p !== "\\") inStr = null; continue; }
  if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
  if (c === "{") depth++; else if (c === "}") { depth--; if (!depth) { end = i + 1; break; } }
}
const BANK = vm.runInNewContext("(" + src.slice(open, end) + ")");
for (const p of ["assets/facts/index.json", "assets/deep/index.json",
                 "assets/nicknames/index.json", "assets/awards/index.json"]) {
  const extra = JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
  for (const [t, rows] of Object.entries(extra)) if (BANK[t] && rows) BANK[t].push(...rows);
}

/* Normalising hard enough that a reworded repeat still collides: strip
   accents, punctuation, and the filler words that make two askings of the same
   fact look different. */
const STOP = new Set(["the","a","an","which","who","what","in","at","of","for","to","did","does","was","were","is","club","team","player"]);
const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
  .filter(w => w && !STOP.has(w)).sort().join(" ");

const seen = new Map();                     // normalised question -> tier it lives in
for (const t of TIERS) for (const r of BANK[t]) seen.set(norm(r.q), t);

/* Same fact asked twice usually means the same answer AND most of the same
   nouns. Matching on the answer alone is useless here: "Netherlands" and
   "Ajax" answer dozens of unrelated questions. So: same answer, and the
   questions share most of their words. */
/* Two questions built on the same template are not duplicates: "which country
   won the 2006 World Cup" and "which country hosted the 1990 World Cup" both
   answer Italy and share most of their words. What separates them is the
   number, so a difference in the years or figures rules a duplicate out. */
const OVERLAP = 0.7;
const nums = s => JSON.stringify([...new Set(String(s).match(/\d+/g) || [])].sort());
const byAns = new Map();                    // normalised answer -> [{tier, words:Set, q}]
for (const t of TIERS) for (const r of BANK[t]) {
  const k = norm(String(r.a));
  if (!byAns.has(k)) byAns.set(k, []);
  byAns.get(k).push({ t, words: new Set(norm(r.q).split(" ")), q: r.q });
}
function nearDupe(q, a) {
  const mine = new Set(norm(q).split(" ")), mynums = nums(q);
  for (const cand of byAns.get(norm(String(a))) || []) {
    if (nums(cand.q) !== mynums) continue;
    let shared = 0;
    for (const w of mine) if (cand.words.has(w)) shared++;
    const j = shared / Math.max(mine.size, cand.words.size);
    if (j >= OVERLAP) return cand;
  }
  return null;
}

const problems = [], kept = { easy: [], normal: [], hard: [], extreme: [], ball: [] };
let n = 0, dupes = 0;
for (const f of ins) {
  const rows = JSON.parse(fs.readFileSync(f, "utf8"));
  for (const r of rows) {
    n++;
    const where = `${path.basename(f)}: ${String(r.q).slice(0, 70)}`;
    if (!TIERS.includes(r.tier)) { problems.push(`BAD TIER (${r.tier}) ${where}`); continue; }
    if (!r.q || !r.a) { problems.push(`EMPTY ${where}`); continue; }
    const text = r.q + " " + r.a;
    if (/[\u2014\u2013]/.test(text)) { problems.push(`EM DASH ${where}`); continue; }
    if (/[{}|]/.test(text)) { problems.push(`TEMPLATE JUNK ${where}`); continue; }
    if (r.verdict && /^(wrong|drop|reject)/i.test(r.verdict)) { problems.push(`CHECKER REJECTED ${where}`); continue; }
    const k = norm(r.q);
    if (seen.has(k)) { dupes++; problems.push(`DUPLICATE of existing ${seen.get(k)} ${where}`); continue; }
    const near = nearDupe(r.q, r.a);
    if (near) { dupes++; problems.push(`NEAR DUPLICATE of [${near.t}] "${near.q}" <- ${where}`); continue; }
    seen.set(k, r.tier);
    /* so this run does not repeat itself either */
    const ak = norm(String(r.a));
    if (!byAns.has(ak)) byAns.set(ak, []);
    byAns.get(ak).push({ t: r.tier, words: new Set(k.split(" ")), q: r.q });
    kept[r.tier].push({ q: r.q, a: r.a });
  }
}

console.log(`read ${n} candidates from ${ins.length} file(s)`);
for (const t of TIERS) console.log(`  ${t.padEnd(8)} +${String(kept[t].length).padStart(4)}  (bank has ${BANK[t].length})`);
console.log(`rejected ${problems.length} (of which ${dupes} duplicates)`);
problems.slice(0, 40).forEach(p => console.log("   ! " + p));
if (problems.length > 40) console.log(`   ... and ${problems.length - 40} more`);

if (write) {
  const trimmed = {};
  for (const t of TIERS) if (kept[t].length) trimmed[t] = kept[t];
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(trimmed, null, 1), "utf8");
  console.log("\nwrote " + out);
} else {
  console.log("\n(dry run, pass --write to save)");
}
