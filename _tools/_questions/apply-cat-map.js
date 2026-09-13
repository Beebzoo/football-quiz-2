#!/usr/bin/env node
/* Retrofit the closed category list onto a deck that shipped without one.
 *
 *     node _tools/_questions/apply-cat-map.js                    dry run on eredivisie
 *     node _tools/_questions/apply-cat-map.js eredivisie --write stamp cat onto the deck
 *     node _tools/_questions/apply-cat-map.js ere --verbose      show every null tag
 *
 * WHY. Five of the six league decks were written after `cat` existed, so every
 * row carries one of the eleven categories and the specialisms idea can read
 * it: each man on the pitch owns a category, a ball to the six draws one kind
 * of question and the ten draws another. The Eredivisie deck was written
 * before that rule and its source files used free text for tags, which came
 * out as 346 distinct ones, several of them one row long. That deck cannot
 * join the specialisms until those tags are collapsed onto the eleven, and no
 * amount of cleverness here will do it: somebody has to read the tags and
 * decide. cat-map.json in the league's source folder is that decision written
 * down, and this is the tool that applies it.
 *
 * THE ONE THING THAT MUST NOT HAPPEN. S.used holds INDEXES into each tier, so
 * a row that moves takes every parked match with it: a player who has already
 * answered question 12 comes back to a different question 12, and the rows he
 * has not seen are marked as seen. So this tool never rebuilds the pack. It
 * reads assets/<league>/index.json, mutates the row objects that are already
 * in it, and writes the same structure back. No row is added, removed or
 * reordered, no tier is touched, and it checks that it kept that promise by
 * comparing a snapshot of every tier's question text taken before the stamping
 * against the same list afterwards. If a single position has moved it writes
 * nothing and says so. This is also why it matches rows by question text
 * rather than by position in a source file: the pack is the truth about order,
 * the source files are only the truth about tags.
 *
 * MATCHING. The builder ran every question through a clean-up on the way in
 * (dashes normalised, whitespace collapsed), so a shipped question is not
 * byte-identical to the source row it came from. Rows are matched on a
 * stripped-down key, accents removed and everything but letters and digits
 * thrown away, which tied all 1,168 shipped Eredivisie rows back to a source
 * row. A key that two different source files claim with two different tags is
 * reported rather than guessed at: the fact-checked file wins over the draft,
 * and two fact-checked files disagreeing is something a human should see.
 *
 * NULL IS AN ANSWER. A tag mapped to null in cat-map.json is one that has no
 * honest home in the eleven, and those rows are left without a cat rather than
 * being swept into stories. They are counted and named in the report so the
 * gap stays visible instead of turning into a wrong category nobody notices.
 *
 * REFUSES TO INVENT A CATEGORY. The eleven are a closed list. A cat-map value
 * that is not one of them, or not null, stops the tool before it reads the
 * deck, and the same check runs again on every value about to be written.
 *
 * LINE ENDINGS. assets/eredivisie/index.json is stored with CRLF while the
 * other five decks are LF. Writing whatever Node feels like would turn a
 * one-field change into a 5,903 line diff and hide the real change, so the
 * file is written back with the endings it already had.
 */
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..");

/* the closed list, in the order the brief gives it */
const CATS = ["champions", "scorers", "transfers", "managers", "grounds",
  "records", "europe", "cups", "relegation", "imports", "stories"];

/* the deck ids the app uses are not all the folder names, same as the checker */
const DIR_FOR = { ere: "eredivisie" };

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const VERBOSE = args.includes("--verbose");
const league = (a => DIR_FOR[a] || a)(args.find(a => !a.startsWith("--")) || "eredivisie");

const SRCDIR = path.join(HERE, league);
const DECK = path.join(REPO, "assets", league, "index.json");
const MAP = path.join(SRCDIR, "cat-map.json");

const rel = p => path.relative(REPO, p).replace(/\\/g, "/");
const die = msg => { console.error(msg); process.exit(2); };
const rd = f => JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));

if (!fs.existsSync(SRCDIR)) die("no question folder at " + rel(SRCDIR));
if (!fs.existsSync(DECK)) die("no shipped pack at " + rel(DECK));
if (!fs.existsSync(MAP)) die("no cat-map.json at " + rel(MAP) + ", there is nothing to apply");

/* ---------- 1. the mapping, checked before anything else is read ---------- */
const catMap = rd(MAP);
{
  const bad = Object.entries(catMap).filter(([, v]) => v !== null && CATS.indexOf(v) === -1);
  if (bad.length) {
    console.error("cat-map.json has " + bad.length + " value(s) outside the closed list:");
    for (const [k, v] of bad) console.error("  " + k + " -> " + JSON.stringify(v));
    console.error("the eleven are: " + CATS.join(" "));
    process.exit(2);
  }
}
const mapped = Object.keys(catMap).filter(k => catMap[k] !== null).length;
console.log(rel(MAP) + ": " + Object.keys(catMap).length + " tags, " +
  mapped + " mapped, " + (Object.keys(catMap).length - mapped) + " left null");

/* ---------- 2. question text to source tag ---------- */
/* Accents off, punctuation off, case off. Loose on purpose: the builder
   rewrote dashes and collapsed whitespace on the way in, so anything tighter
   than this loses rows that are plainly the same question. */
const key = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9]/g, "");

const files = fs.readdirSync(SRCDIR).filter(f => /^(raw|checked)-.*\.json$/.test(f)).sort();
if (!files.length) die("no raw-*.json or checked-*.json in " + rel(SRCDIR));

const tagOf = {}, tagFrom = {}, disputed = [];
let srcRows = 0;
for (const f of files) {
  const checked = /^checked-/.test(f);
  for (const r of rd(path.join(SRCDIR, f))) {
    srcRows++;
    if (r.topic === undefined && r.cat === undefined) continue;
    const k = key(r.q), tag = String(r.topic !== undefined ? r.topic : r.cat);
    if (tagOf[k] === undefined || (checked && !/^checked-/.test(tagFrom[k]))) {
      tagOf[k] = tag; tagFrom[k] = f; continue;
    }
    /* a real disagreement between two files of the same standing */
    if (tagOf[k] !== tag) disputed.push({ q: r.q, kept: tagOf[k], from: tagFrom[k], other: tag, f: f });
  }
}
console.log(files.length + " source file(s), " + srcRows + " rows, " +
  Object.keys(tagOf).length + " distinct questions tagged");
if (disputed.length) {
  console.log("\n" + disputed.length + " question(s) carry two different tags, keeping the first:");
  for (const d of disputed.slice(0, VERBOSE ? disputed.length : 6))
    console.log("  " + d.kept + " (" + d.from + ") over " + d.other + " (" + d.f + ")\n      " + d.q.slice(0, 96));
}

/* ---------- 3. the shipped pack, exactly as it lies ---------- */
const rawDeck = fs.readFileSync(DECK, "utf8");
const eol = rawDeck.indexOf("\r\n") > -1 ? "\r\n" : "\n";
const trailing = /\n$/.test(rawDeck);
const deck = JSON.parse(rawDeck.replace(/^﻿/, ""));
const tiers = Object.keys(deck);
const before = tiers.map(t => (deck[t] || []).map(r => r.q));
const total = before.reduce((n, a) => n + a.length, 0);
console.log("\n" + rel(DECK) + ": " + total + " rows across " + tiers.length + " tiers");
console.log("per tier: " + tiers.map((t, i) => t + " " + before[i].length).join(" / "));
const already = tiers.reduce((n, t) => n + deck[t].filter(r => r.cat).length, 0);
console.log("rows that already carry a cat: " + already);

/* ---------- 4. the stamping ---------- */
const missed = [], unmapped = {}, blank = {}, clash = [];
const dist = {};
let stamped = 0, unchanged = 0;
for (const t of tiers) {
  for (const r of deck[t]) {
    const tag = tagOf[key(r.q)];
    if (tag === undefined) { missed.push({ tier: t, q: r.q }); continue; }
    if (!(tag in catMap)) { (unmapped[tag] = unmapped[tag] || []).push(r.q); continue; }
    const cat = catMap[tag];
    if (cat === null) { blank[tag] = (blank[tag] || 0) + 1; continue; }
    if (r.cat && r.cat !== cat) { clash.push({ q: r.q, had: r.cat, wants: cat, tag: tag }); continue; }
    if (r.cat === cat) { unchanged++; dist[cat] = (dist[cat] || 0) + 1; continue; }
    r.cat = cat;
    stamped++;
    dist[cat] = (dist[cat] || 0) + 1;
  }
}
const nulled = Object.values(blank).reduce((n, v) => n + v, 0);

console.log("\nwould stamp: " + stamped + "   already correct: " + unchanged +
  "   no category in the map: " + nulled + "   no source row: " + missed.length);
console.log("\nresulting distribution over " + total + " rows:");
for (const c of CATS.slice().sort((a, b) => (dist[b] || 0) - (dist[a] || 0)))
  console.log("  " + c.padEnd(12) + String(dist[c] || 0).padStart(4) +
    "   " + (100 * (dist[c] || 0) / total).toFixed(1) + "%");
console.log("  " + "(none)".padEnd(12) + String(total - stamped - unchanged).padStart(4) +
  "   " + (100 * (total - stamped - unchanged) / total).toFixed(1) + "%");

/* THE TAGS THAT HAVE NO HOME. Named, with counts, because a gap you can see is
   a gap somebody can close. Silence here would read as full coverage. */
if (nulled) {
  const rows = Object.entries(blank).sort((a, b) => b[1] - a[1]);
  console.log("\n" + nulled + " rows on " + rows.length + " tags mapped to null:");
  for (const [tag, n] of rows.slice(0, VERBOSE ? rows.length : 20))
    console.log("  " + String(n).padStart(4) + "  " + tag);
  if (!VERBOSE && rows.length > 20) console.log("  ... " + (rows.length - 20) + " more, --verbose for all");
}

/* A ROW THE SOURCE FILES DO NOT HAVE. It cannot be a silent skip: it means the
   pack holds a question that was edited after it shipped, or came from a file
   that is no longer in the folder, and either way it will never get a cat
   until somebody looks at it. */
if (missed.length) {
  console.log("\n" + missed.length + " shipped row(s) matched no source question:");
  for (const m of missed.slice(0, VERBOSE ? missed.length : 25))
    console.log("  [" + m.tier + "] " + m.q.slice(0, 100));
  if (!VERBOSE && missed.length > 25) console.log("  ... " + (missed.length - 25) + " more, --verbose for all");
}
if (Object.keys(unmapped).length) {
  console.log("\ntags on shipped rows that cat-map.json does not mention:");
  for (const [tag, qs] of Object.entries(unmapped).sort((a, b) => b[1].length - a[1].length))
    console.log("  " + String(qs.length).padStart(4) + "  " + tag);
}
if (clash.length) {
  console.log("\n" + clash.length + " row(s) already carry a different cat, left alone:");
  for (const c of clash.slice(0, VERBOSE ? clash.length : 10))
    console.log("  has " + c.had + ", map says " + c.wants + " (tag " + c.tag + ")\n      " + c.q.slice(0, 96));
}

/* ---------- 5. the promise, checked ---------- */
const after = tiers.map(t => (deck[t] || []).map(r => r.q));
let moved = 0;
if (after.length !== before.length) moved++;
for (let i = 0; i < before.length; i++) {
  if (after[i].length !== before[i].length) { moved++; continue; }
  for (let j = 0; j < before[i].length; j++) if (after[i][j] !== before[i][j]) moved++;
}
if (moved) die("\nREFUSING TO WRITE: " + moved + " row(s) are not where they started. " +
  "S.used indexes into these tiers and every parked match would move with them.");
const wrong = tiers.flatMap(t => deck[t].filter(r => r.cat && CATS.indexOf(r.cat) === -1).map(r => r.cat));
if (wrong.length) die("\nREFUSING TO WRITE: " + wrong.length + " row(s) would carry a cat outside the eleven: " +
  [...new Set(wrong)].join(", "));

if (!WRITE) { console.log("\ndry run, add --write to stamp cat onto " + rel(DECK)); process.exit(0); }

const out = JSON.stringify(deck, null, 1).replace(/\n/g, eol) + (trailing ? eol : "");
fs.writeFileSync(DECK, out);
console.log("\nwrote " + rel(DECK) + "  (" + (fs.statSync(DECK).size / 1024).toFixed(1) + " KB, " +
  (eol === "\r\n" ? "CRLF" : "LF") + " kept)");
console.log("rows are in the same order they were in, so S.used still points where it did.");
