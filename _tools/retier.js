#!/usr/bin/env node
/* WHICH QUESTIONS ARE IN THE WRONG TIER, ACCORDING TO THE PEOPLE WHO PLAYED THEM.
 *
 *     node _tools/retier.js _outcomes                 read the folder, report
 *     node _tools/retier.js _outcomes --min 30        stricter evidence
 *     node _tools/retier.js _outcomes --write         apply it
 *     node _tools/retier.js _outcomes --deck ere      one deck only
 *
 * RETENTION-PLAN.md §9 calls this the least glamorous item in the document and
 * the one that decides whether any of the rest feels fair. Tiers are
 * hand-assigned, so somewhere in the bank there is an Extreme everybody gets
 * and an Easy nobody does, and every rung of the daily, every dice profile of
 * the computer and every pack earned for reaching the striker inherits that
 * error.
 *
 * WHAT IT READS. Files saved from the app by "Save them as a file, for
 * re-tiering" on The Table. Several phones' worth in one folder is the point:
 * nothing leaves a phone by itself and nothing needs to, because a Friday
 * night is four people and a folder is a merge.
 *
 * WHAT IT DOES NOT DO, AND THIS IS THE RULE THAT MATTERS:
 *
 *   IT NEVER RE-ORDERS A TIER. S.used holds indexes, a parked match holds a
 *   used list, and the daily's spent list is keyed by question rather than
 *   index but its bank is not. Splicing a question out of a tier re-points
 *   every index above it, which changes questions people have already played
 *   and, for a parked match, changes the one on the screen. So a moved
 *   question is MARKED where it is ("x": 1, which every draw skips) and a copy
 *   is APPENDED to its new tier. Indexes never move.
 *
 *   IT NEVER MOVES A QUESTION ON THIN EVIDENCE. Twenty asks is the default and
 *   it is already generous: at twenty, an eight in ten question and a six in
 *   ten question are not reliably distinguishable. The tier boundaries below
 *   are deliberately wide so only the clear cases move.
 *
 *   AND IT NEVER MOVES A QUESTION MORE THAN ONE TIER. A hand-assigned Easy
 *   that nobody gets is far more likely to be a Normal with a hard clue than a
 *   BALL, and one step at a time means the next pass of real data can correct
 *   this one.
 */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const arg = (name, dflt) => { const i = args.indexOf(name); return i > -1 ? args[i + 1] : dflt; };
const MIN = parseInt(arg("--min", "20"), 10);
const ONLY = arg("--deck", null);
const IN = args.filter(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--min" &&
                            args[args.indexOf(a) - 1] !== "--deck")[0] || "_outcomes";

/* ---------- what a tier is supposed to mean ----------
   The share of people who get it right. These are a CLAIM, and they are the
   claim the whole ladder rests on: the pass ladder charges more for a longer
   ball because a longer ball asks a harder question, and the computer's dice
   in AI_LEVELS are written against the same scale. The bands are wide on
   purpose, so a question only moves when it is plainly in the wrong one. */
const TIERS = ["easy", "normal", "hard", "extreme", "ball"];
const BANDS = [
  { tier: "easy",    from: 0.78, to: 1.01 },
  { tier: "normal",  from: 0.58, to: 0.78 },
  { tier: "hard",    from: 0.36, to: 0.58 },
  { tier: "extreme", from: 0.16, to: 0.36 },
  { tier: "ball",    from: -0.01, to: 0.16 },
];
const bandFor = rate => (BANDS.find(b => rate >= b.from && rate < b.to) || BANDS[2]).tier;
/* ONE STEP AT A TIME: an Easy nobody gets is far more likely to be a Normal
   with a hard clue than a BALL, and a single step lets the next pass of real
   data correct this one. */
const step = (from, to) => {
  const a = TIERS.indexOf(from), b = TIERS.indexOf(to);
  if (a < 0 || b < 0 || a === b) return from;
  return TIERS[a + (b > a ? 1 : -1)];
};

/* ---------- the decks a row can name ----------
   A row carries the mode, whether it was Pick One, and in The Dugout the deck
   the ball actually drew from. The file on disk is the same lookup the app
   does: DECKS[mc ? id + "-mc" : id]. */
const FILE = {
  classic: "assets/mc/index.json",          // the classic bank is Pick One only on disk
  "classic-mc": "assets/mc/index.json",
  ere: "assets/eredivisie/index.json",
  premier: "assets/premier/index.json",
  laliga: "assets/laliga/index.json",
  bundesliga: "assets/bundesliga/index.json",
  seriea: "assets/seriea/index.json",
  belgian: "assets/belgian/index.json",
};
const deckIdOf = row => {
  const id = row.qd || row.mode;
  if (id === "classic") return row.mc ? "classic-mc" : "classic";
  return id;
};

/* the same hash the app and the daily use: a question's name is its words */
function qKey(q) {
  const t = (q && q.q) || "";
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* ---------- read the phones ---------- */
const dir = path.isAbsolute(IN) ? IN : path.join(REPO, IN);
if (!fs.existsSync(dir)) {
  console.error("No such folder: " + path.relative(REPO, dir));
  console.error("Save outcomes from The Table on each phone and put the files in it.");
  process.exit(1);
}
const files = fs.statSync(dir).isDirectory()
  ? fs.readdirSync(dir).filter(f => f.endsWith(".json")).map(f => path.join(dir, f))
  : [dir];
if (!files.length) { console.error("No .json files in " + path.relative(REPO, dir)); process.exit(1); }

const rows = [];
for (const f of files) {
  let j;
  try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { console.log("  skipped " + path.basename(f) + ": " + e.message); continue; }
  const list = Array.isArray(j) ? j : (j.rows || []);
  if (!list.length) { console.log("  " + path.basename(f) + ": no rows"); continue; }
  console.log("  " + path.basename(f) + ": " + list.length + " rows");
  rows.push(...list);
}
console.log(rows.length + " outcomes from " + files.length + " file" + (files.length === 1 ? "" : "s"));

/* THE SAME BALL FILED TWICE. Two phones in one match both log the questions
   they were shown, and a host and a guest can log the same one. A row is the
   same ball if it is the same match, the same question and the same moment to
   the second. */
const seen = new Set();
const clean = rows.filter(r => {
  if (!r || !r.k || !r.tier) return false;
  const id = (r.mid || "") + "|" + r.k + "|" + Math.floor((r.t || 0) / 1000);
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
});
console.log(clean.length + " after dropping rows two phones filed twice");
if (!clean.length) {
  console.log("\nNothing carries a question key. The key was added to the log in");
  console.log("September 2026; anything older is tier and index only and cannot be");
  console.log("tied to a question. Play a few nights on this build and try again.");
  process.exit(0);
}

/* ---------- one row per question ---------- */
const tally = new Map();
for (const r of clean) {
  const deck = deckIdOf(r);
  if (ONLY && deck !== ONLY && deck !== ONLY + "-mc") continue;
  const id = deck + "|" + r.tier + "|" + r.k;
  const t = tally.get(id) || { deck: deck, tier: r.tier, k: r.k, asked: 0, right: 0 };
  t.asked++;
  if (r.ok) t.right++;
  tally.set(id, t);
}

/* ---------- what the decks actually hold ---------- */
const decks = {};
const loadDeck = id => {
  if (decks[id] !== undefined) return decks[id];
  const rel = FILE[id];
  const p = rel && path.join(REPO, rel);
  decks[id] = (p && fs.existsSync(p)) ? { file: p, bank: JSON.parse(fs.readFileSync(p, "utf8")) } : null;
  return decks[id];
};

const moves = [];
const thin = [];
let unknown = 0;
for (const t of tally.values()) {
  const d = loadDeck(t.deck);
  if (!d) { unknown++; continue; }
  const bank = d.bank[t.tier];
  if (!Array.isArray(bank)) { unknown++; continue; }
  const at = bank.findIndex(q => qKey(q) === t.k);
  if (at < 0) { unknown++; continue; }
  if (t.asked < MIN) { thin.push(t); continue; }
  const rate = t.right / t.asked;
  const want = bandFor(rate);
  if (want === t.tier) continue;
  moves.push({ ...t, at: at, rate: rate, want: step(t.tier, want), saw: want, q: bank[at] });
}

/* ---------- the report ---------- */
console.log("\n" + tally.size + " question" + (tally.size === 1 ? "" : "s") + " seen, " +
  (tally.size - thin.length - unknown) + " with " + MIN + " asks or more" +
  (unknown ? ", " + unknown + " no longer in the deck" : ""));
if (!moves.length) {
  console.log("\nNothing is far enough out of its tier to move.");
  if (thin.length) console.log(thin.length + " question" + (thin.length === 1 ? "" : "s") +
    " are close but have fewer than " + MIN + " asks.");
  process.exit(0);
}
console.log("\n" + moves.length + " question" + (moves.length === 1 ? "" : "s") + " to move:\n");
moves.sort((a, b) => a.deck < b.deck ? -1 : a.deck > b.deck ? 1 : a.rate - b.rate);
for (const m of moves) {
  console.log("  " + m.deck.padEnd(12) + m.tier.padEnd(8) + "-> " + m.want.padEnd(8) +
    String(Math.round(m.rate * 100)).padStart(3) + "% of " + String(m.asked).padStart(3) +
    (m.saw !== m.want ? "  (the numbers say " + m.saw + ", moved one step)" : ""));
  console.log("      " + String(m.q.q || "").slice(0, 92));
}

if (!WRITE) {
  console.log("\nDry run. --write to apply, which MARKS each question where it is and");
  console.log("APPENDS a copy to its new tier. No index in any deck moves.");
  process.exit(0);
}

/* ---------- apply ----------
   Mark and append. Never splice: S.used holds indexes and a parked match holds
   a used list, so taking a question out of a tier re-points every index above
   it and changes the question on somebody's screen. */
const touched = new Set();
for (const m of moves) {
  const d = loadDeck(m.deck);
  const bank = d.bank[m.tier];
  if (!Array.isArray(d.bank[m.want])) { console.log("  ! " + m.deck + " has no " + m.want + " tier"); continue; }
  const was = bank[m.at];
  if (was.x) continue;                       // already moved by an earlier pass
  was.x = 1;                                 // retired in place; every draw skips it
  was.to = m.want;                           // and says where it went, for the next reader
  const copy = JSON.parse(JSON.stringify(was));
  delete copy.x; delete copy.to;
  copy.was = m.tier;                         // where it used to live, for the same reason
  copy.seen = m.asked;                       // and on how much evidence
  d.bank[m.want].push(copy);
  touched.add(m.deck);
}
for (const id of touched) {
  const d = decks[id];
  /* THE SAME SHAPE THE BUILDERS WRITE, one space of indent, so a re-tier is a
     handful of changed lines in a diff rather than the whole file on one. */
  fs.writeFileSync(d.file, JSON.stringify(d.bank, null, 1));
  console.log("wrote " + path.relative(REPO, d.file));
}
console.log("\nMarked and appended. Nothing was re-ordered, so every parked match and");
console.log("every daily already played still points at the question it did.");
