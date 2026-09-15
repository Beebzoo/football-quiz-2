#!/usr/bin/env node
/* Stamp the eleven categories onto the classic BANK inside index.html.
 *
 *     node _tools/_questions/apply-classic-cats.js            dry run, says what it would do
 *     node _tools/_questions/apply-classic-cats.js --write    stamps cat onto index.html
 *     node _tools/_questions/apply-classic-cats.js --verbose  names every row it skipped
 *     node _tools/_questions/apply-classic-cats.js /path/to/repo --write
 *
 * WHY. h2Draw filters a tier on bank[n].cat === spec. Every league deck carries
 * a cat, the classic bank does not, so in Let's Ball a man's specialism matches
 * nothing and the draw falls through to the whole tier without saying so. The
 * decisions live in _tools/_questions/classic/cat-map.json, keyed by question
 * text because the classic bank has no source tags to key on.
 *
 * THE ONE THING THAT MUST NOT HAPPEN, same as apply-cat-map.js. S.used holds
 * INDEXES into each tier, so a row that moves takes every parked match with it:
 * a player who answered question 12 comes back to a different question 12 and
 * the rows he has not seen are marked as seen. So this tool never rebuilds the
 * bank and never reformats it. It edits the single line each row lives on, in
 * place, inserting cat before the closing brace, and it proves it kept that
 * promise by parsing the bank before and after and comparing every tier's
 * question list position by position. One row out of place and it writes
 * nothing and says so.
 *
 * MATCHING. Rows are matched on a stripped key, accents off, punctuation off,
 * case off, so a question that has been lightly re-punctuated since the map was
 * written still finds its decision. A row the map has no decision for is
 * reported, not guessed at, and a map key that matches no row is reported too:
 * index.html is edited by other workstreams, and both of those mean somebody
 * has to look.
 *
 * NULL IS AN ANSWER. A question mapped to null has no honest home among the
 * eleven and is left without a cat. h2Draw then falls back to the whole tier
 * and the row still gets asked. Those rows are counted here so the gap stays
 * visible.
 *
 * REFUSES TO INVENT A CATEGORY. The eleven are a closed list. A value outside
 * it stops the tool before index.html is opened, and again on every value about
 * to be written.
 *
 * LINE ENDINGS. index.html is stored with CRLF. Every line terminator is
 * captured and put back exactly as it was, so the diff is the rows that gained
 * a cat and nothing else.
 */
const fs = require("fs");
const path = require("path");

const CATS = ["champions", "scorers", "transfers", "managers", "grounds",
  "records", "europe", "cups", "relegation", "imports", "stories"];

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const VERBOSE = args.includes("--verbose");
const given = args.find(a => !a.startsWith("--"));

const die = msg => { console.error(msg); process.exit(2); };

/* the repo is wherever index.html and _tools/_questions sit together */
const looksRight = d => fs.existsSync(path.join(d, "index.html")) &&
  fs.existsSync(path.join(d, "_tools", "_questions"));
const walkUp = start => {
  let d = path.resolve(start);
  for (;;) {
    if (looksRight(d)) return d;
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
};
const REPO = given ? path.resolve(given) : (walkUp(__dirname) || walkUp(process.cwd()));
if (!REPO || !looksRight(REPO)) die("cannot find the repo, pass its path as the first argument");

const PAGE = path.join(REPO, "index.html");
const MAP = path.join(REPO, "_tools", "_questions", "classic", "cat-map.json");
const rel = p => path.relative(REPO, p).replace(/\\/g, "/");
if (!fs.existsSync(MAP)) die("no cat-map.json at " + rel(MAP) + ", there is nothing to apply");

/* ---------- 1. the decisions, checked before index.html is opened ---------- */
const catMap = JSON.parse(fs.readFileSync(MAP, "utf8").replace(/^﻿/, ""));
{
  const bad = Object.entries(catMap).filter(([, v]) => v !== null && CATS.indexOf(v) === -1);
  if (bad.length) {
    console.error(rel(MAP) + " has " + bad.length + " value(s) outside the closed list:");
    for (const [k, v] of bad.slice(0, 10)) console.error("  " + JSON.stringify(v) + "  " + k.slice(0, 80));
    console.error("the eleven are: " + CATS.join(" "));
    process.exit(2);
  }
}
const key = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]/g, "");
const decision = {}, spelling = {};
let collisions = 0;
for (const [q, cat] of Object.entries(catMap)) {
  const k = key(q);
  if (k in decision && decision[k] !== cat) {
    console.error("two decisions for the same question:\n  " + spelling[k] + "\n  " + q);
    collisions++;
  }
  decision[k] = cat; spelling[k] = q;
}
if (collisions) die(collisions + " question(s) carry two different decisions, nothing written");
const mapped = Object.values(catMap).filter(v => v !== null).length;
console.log(rel(MAP) + ": " + Object.keys(catMap).length + " decisions, " +
  mapped + " with a category, " + (Object.keys(catMap).length - mapped) + " deliberately null");

/* ---------- 2. the bank, exactly as it lies ---------- */
const page = fs.readFileSync(PAGE, "utf8");
const anchor = page.indexOf("const BANK = {");
if (anchor === -1) die("no 'const BANK = {' in " + rel(PAGE));
const from = page.indexOf("{", anchor);
let depth = 0, to = from;
for (; to < page.length; to++) {
  const c = page[to];
  if (c === "{") depth++;
  else if (c === "}" && --depth === 0) break;
}
if (depth !== 0) die("the BANK literal in " + rel(PAGE) + " does not close");
const literal = page.slice(from, to + 1);

const read = lit => { let B; eval("B = " + lit); return B; };
const snap = B => Object.keys(B).map(t => ({ tier: t, qs: B[t].map(r => r.q) }));
const before = snap(read(literal));
const total = before.reduce((n, t) => n + t.qs.length, 0);
console.log("\n" + rel(PAGE) + ": " + total + " rows across " + before.length + " tiers");
console.log("per tier: " + before.map(t => t.tier + " " + t.qs.length).join(" / "));

/* ---------- 3. one line per row, edited in place ---------- */
/* Every row sits on its own line and closes on it. The line is rewritten by
   inserting cat before the closing brace, so quoting, spacing, the answer and
   any note come through untouched. */
const parts = literal.split(/(\r\n|\n|\r)/);
const ROW = /^(\s*\{q:.*)(\})(\s*,?\s*)$/;
const missing = [], blank = [], clash = [], unreadable = [];
const seen = {}, dist = {};
let stamped = 0, unchanged = 0;
for (let i = 0; i < parts.length; i += 2) {
  const line = parts[i];
  const m = ROW.exec(line);
  if (!m) continue;
  let row;
  try { eval("row = " + m[1] + m[2]); } catch (e) { unreadable.push(line.trim().slice(0, 90)); continue; }
  if (!row || typeof row.q !== "string") { unreadable.push(line.trim().slice(0, 90)); continue; }
  const k = key(row.q);
  seen[k] = true;
  if (!(k in decision)) { missing.push(row.q); continue; }
  const cat = decision[k];
  if (cat === null) { blank.push(row.q); continue; }
  if (CATS.indexOf(cat) === -1) die("refusing to write a category outside the eleven: " + cat);
  if (row.cat === cat) { unchanged++; dist[cat] = (dist[cat] || 0) + 1; continue; }
  if (row.cat) { clash.push({ q: row.q, had: row.cat, wants: cat }); continue; }
  parts[i] = m[1] + ", cat:" + JSON.stringify(cat) + m[2] + m[3];
  stamped++;
  dist[cat] = (dist[cat] || 0) + 1;
}
const orphans = Object.keys(decision).filter(k => !seen[k]);

console.log("\nwould stamp: " + stamped + "   already correct: " + unchanged +
  "   deliberately null: " + blank.length + "   no decision in the map: " + missing.length);
console.log("\nresulting spread over " + total + " rows:");
for (const c of CATS.slice().sort((a, b) => (dist[b] || 0) - (dist[a] || 0)))
  console.log("  " + c.padEnd(12) + String(dist[c] || 0).padStart(4) +
    "   " + (100 * (dist[c] || 0) / total).toFixed(1) + "%");
console.log("  " + "(none)".padEnd(12) + String(total - stamped - unchanged).padStart(4) +
  "   " + (100 * (total - stamped - unchanged) / total).toFixed(1) + "%");

/* A ROW WITH NO DECISION. Not a silent skip: index.html is edited by other
   workstreams, so this means a question was added or reworded after the map was
   written and nobody has judged it yet. It will never get a cat until they do. */
if (missing.length) {
  console.log("\n" + missing.length + " row(s) the map has no decision for:");
  for (const q of missing.slice(0, VERBOSE ? missing.length : 20)) console.log("  " + q.slice(0, 100));
  if (!VERBOSE && missing.length > 20) console.log("  ... " + (missing.length - 20) + " more, --verbose for all");
}
if (orphans.length) {
  console.log("\n" + orphans.length + " decision(s) matched no row in the bank:");
  for (const k of orphans.slice(0, VERBOSE ? orphans.length : 20)) console.log("  " + spelling[k].slice(0, 100));
  if (!VERBOSE && orphans.length > 20) console.log("  ... " + (orphans.length - 20) + " more, --verbose for all");
}
if (clash.length) {
  console.log("\n" + clash.length + " row(s) already carry a different cat, left alone:");
  for (const c of clash.slice(0, VERBOSE ? clash.length : 10))
    console.log("  has " + c.had + ", map says " + c.wants + "\n      " + c.q.slice(0, 96));
}
if (unreadable.length) die("\nREFUSING TO WRITE: " + unreadable.length +
  " line(s) look like rows but will not parse:\n  " + unreadable.slice(0, 5).join("\n  "));
if (VERBOSE && blank.length) {
  console.log("\n" + blank.length + " row(s) deliberately left without a cat:");
  for (const q of blank) console.log("  " + q.slice(0, 100));
}

/* ---------- 4. the promise, checked ---------- */
const rebuilt = parts.join("");
const out = page.slice(0, from) + rebuilt + page.slice(to + 1);
let after, stampedBank;
try {
  stampedBank = read(out.slice(from, from + rebuilt.length));
  after = snap(stampedBank);
} catch (e) { die("\nREFUSING TO WRITE: the edited bank no longer parses (" + e.message + ")"); }

let moved = 0;
if (after.length !== before.length) moved++;
for (let i = 0; i < Math.min(after.length, before.length); i++) {
  if (after[i].tier !== before[i].tier) { moved++; continue; }
  if (after[i].qs.length !== before[i].qs.length) { moved++; continue; }
  for (let j = 0; j < before[i].qs.length; j++) if (after[i].qs[j] !== before[i].qs[j]) moved++;
}
if (moved) die("\nREFUSING TO WRITE: " + moved + " row(s) are not where they started. " +
  "S.used indexes into these tiers and every parked match would move with them.");

const wrong = [];
for (const t of Object.keys(stampedBank))
  for (const r of stampedBank[t]) if (r.cat && CATS.indexOf(r.cat) === -1) wrong.push(r.cat);
if (wrong.length) die("\nREFUSING TO WRITE: " + wrong.length + " row(s) would carry a cat outside the eleven: " +
  [...new Set(wrong)].join(", "));

if (!stamped) { console.log("\nnothing to change, " + rel(PAGE) + " already says what the map says"); process.exit(0); }
if (!WRITE) { console.log("\ndry run, add --write to stamp cat onto " + rel(PAGE)); process.exit(0); }

fs.writeFileSync(PAGE, out);
console.log("\nwrote " + rel(PAGE) + "  (" + (fs.statSync(PAGE).size / 1024).toFixed(1) + " KB)");
console.log("rows are in the same order they were in, so S.used still points where it did.");
