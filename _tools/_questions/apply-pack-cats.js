#!/usr/bin/env node
/* Stamp the eleven categories onto the five runtime packs under assets/.
 *
 *     node _tools/_questions/apply-pack-cats.js            dry run, says what it would do
 *     node _tools/_questions/apply-pack-cats.js --write    stamps cat onto the five index.json
 *     node _tools/_questions/apply-pack-cats.js --verbose  names every row it skipped
 *     node _tools/_questions/apply-pack-cats.js /path/to/repo --write
 *
 * WHY HERE AND NOT IN index.html. The loader at index.html:6416-6421 fetches each
 * pack and does BANK[tier].push(...rows), spreading the very objects res.json()
 * built. There is no clone, no normalise step, no cat defaulting, so BANK[tier][i]
 * IS the pack's row object and whatever cat the JSON carries is the cat h2Draw
 * reads at index.html:9851. The packs have to be tagged in their own files.
 *
 * THE ONE THING THAT MUST NOT HAPPEN, same as apply-classic-cats.js. S.used holds
 * INDEXES into each tier, and the five packs are appended in a fixed order, so a
 * row that moves takes every parked match with it: a player who answered question
 * 812 comes back to a different question 812 and the rows he has not seen are
 * marked as seen. So this tool never rebuilds a pack and never reorders one. It
 * parses, adds cat to the row objects in place, and re-emits. Three things stand
 * between that and a wrecked save:
 *
 *   1. THE SERIALISER IS PROVED FAITHFUL FIRST. Before a single row is touched,
 *      the file is parsed and written straight back out and the bytes compared to
 *      the bytes on disk. If they do not match to the character, this tool is the
 *      wrong shape for that file and it refuses, rather than quietly reformatting
 *      somebody else's pack.
 *   2. EVERY TIER IS SNAPSHOTTED BEFORE AND AFTER, by question text, position by
 *      position, and the tier key order is compared too. One row out of place and
 *      nothing is written.
 *   3. NO ROW IS ADDED OR REMOVED. Counts are checked per tier and in total.
 *
 * NULL IS A REAL ANSWER. A question the map sends to null is left without a cat.
 * h2Draw falls back to the whole tier and the row still gets asked. Those rows
 * are counted here so the gap stays visible.
 *
 * REFUSES TO INVENT A CATEGORY. The eleven are a closed list. A value outside it
 * stops the tool before any pack is opened, and again on every value about to be
 * written.
 *
 * LINE ENDINGS AND ANY BYTE ORDER MARK are taken from the file and put back, so
 * the diff is the rows that gained a cat and nothing else.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const CATS = ["champions", "scorers", "transfers", "managers", "grounds",
  "records", "europe", "cups", "relegation", "imports", "stories"];
const PACKS = ["facts", "deep", "nicknames", "awards", "extra"];

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const VERBOSE = args.includes("--verbose");
const given = args.find(a => !a.startsWith("--"));
const die = msg => { console.error(msg); process.exit(2); };

const looksRight = d => fs.existsSync(path.join(d, "index.html")) &&
  fs.existsSync(path.join(d, "_tools", "_questions"));
const walkUp = start => {
  let d = path.resolve(start);
  for (;;) { if (looksRight(d)) return d; const up = path.dirname(d); if (up === d) return null; d = up; }
};
const REPO = given ? path.resolve(given) : (walkUp(__dirname) || walkUp(process.cwd()));
if (!REPO || !looksRight(REPO)) die("cannot find the repo, pass its path as the first argument");
const rel = p => path.relative(REPO, p).split(path.sep).join("/");
const MAPS = path.join(REPO, "_tools", "_questions", "packs");

const BOM = String.fromCharCode(0xFEFF);
const COMBINING = new RegExp("[\\u0300-\\u036f]", "g");
const key = s => String(s).normalize("NFD").replace(COMBINING, "")
  .toLowerCase().replace(/[^a-z0-9]/g, "");

/* ---------- 1. the decisions, all five, checked before any pack is opened ---------- */
const decision = {}, spelling = {}, mapRows = {};
for (const pack of PACKS) {
  const src = path.join(MAPS, pack + ".cat-map.json");
  if (!fs.existsSync(src)) die("no map at " + rel(src) + ", run make-pack-cats.js first");
  let text = fs.readFileSync(src, "utf8");
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const m = JSON.parse(text);
  const bad = Object.entries(m).filter(pair => pair[1] !== null && CATS.indexOf(pair[1]) === -1);
  if (bad.length) {
    console.error(rel(src) + " has " + bad.length + " value(s) outside the closed list:");
    for (const pair of bad.slice(0, 10)) console.error("  " + JSON.stringify(pair[1]) + "  " + pair[0].slice(0, 80));
    console.error("the eleven are: " + CATS.join(" "));
    process.exit(2);
  }
  decision[pack] = {}; spelling[pack] = {};
  let collisions = 0;
  for (const q of Object.keys(m)) {
    const k = key(q);
    if (k in decision[pack] && decision[pack][k] !== m[q]) {
      console.error(rel(src) + ": two decisions for the same question\n  " + spelling[pack][k] + "\n  " + q);
      collisions++;
    }
    decision[pack][k] = m[q]; spelling[pack][k] = q;
  }
  if (collisions) die(collisions + " question(s) carry two different decisions, nothing written");
  mapRows[pack] = Object.keys(m).length;
  const withCat = Object.keys(m).filter(q => m[q] !== null).length;
  console.log(rel(src) + ": " + mapRows[pack] + " decisions, " + withCat +
    " with a category, " + (mapRows[pack] - withCat) + " deliberately null");
}

/* ---------- 2. one pack at a time ---------- */
const snap = bank => Object.keys(bank).map(t => ({
  tier: t,
  qs: Array.isArray(bank[t]) ? bank[t].map(r => (r && typeof r.q === "string") ? r.q : null) : null
}));
const moved = (a, b) => {
  if (a.length !== b.length) return "tier count " + a.length + " became " + b.length;
  for (let i = 0; i < a.length; i++) {
    if (a[i].tier !== b[i].tier) return "tier " + i + " was " + a[i].tier + ", is now " + b[i].tier;
    if (a[i].qs === null || b[i].qs === null) return "tier " + a[i].tier + " stopped being an array";
    if (a[i].qs.length !== b[i].qs.length)
      return "tier " + a[i].tier + " had " + a[i].qs.length + " rows, now has " + b[i].qs.length;
    for (let j = 0; j < a[i].qs.length; j++)
      if (a[i].qs[j] !== b[i].qs[j]) return "tier " + a[i].tier + " row " + j + " is a different question";
  }
  return null;
};

const plan = [];
let rows = 0, stamped = 0, unchanged = 0, blank = 0;
const missing = [], clash = [], orphans = [], dist = {};

for (const pack of PACKS) {
  const src = path.join(REPO, "assets", pack, "index.json");
  if (!fs.existsSync(src)) die("no pack at " + rel(src));
  const raw = fs.readFileSync(src, "utf8");
  const bom = raw.charCodeAt(0) === 0xFEFF ? BOM : "";
  const body = bom ? raw.slice(1) : raw;
  const crlf = body.indexOf("\r\n") !== -1;
  let bank;
  try { bank = JSON.parse(body); } catch (e) { die(rel(src) + " will not parse: " + e.message); }
  const emit = obj => {
    const s = JSON.stringify(obj, null, 1);
    return bom + (crlf ? s.split("\n").join("\r\n") : s);
  };

  /* THE FIDELITY CHECK, before a single row is touched. */
  if (emit(bank) !== raw)
    die("REFUSING TO TOUCH " + rel(src) + ": parsing it and writing it straight back out does not " +
      "reproduce the file byte for byte, so writing would reformat rows this tool was not asked to change.");

  const before = snap(bank);
  const rowsBefore = before.reduce((n, t) => n + (t.qs ? t.qs.length : 0), 0);
  const seen = {};
  let packStamped = 0;

  for (const tier of Object.keys(bank)) {
    const arr = bank[tier];
    if (!Array.isArray(arr)) continue;
    for (const r of arr) {
      if (!r || typeof r.q !== "string") die(rel(src) + " has a row with no question text");
      rows++;
      const k = key(r.q);
      seen[k] = true;
      if (!(k in decision[pack])) { missing.push(pack + "  " + r.q); continue; }
      const cat = decision[pack][k];
      if (cat === null) { blank++; continue; }
      if (CATS.indexOf(cat) === -1) die("refusing to write a category outside the eleven: " + cat);
      if (r.cat === cat) { unchanged++; dist[cat] = (dist[cat] || 0) + 1; continue; }
      if (r.cat) { clash.push({ q: r.q, had: r.cat, wants: cat }); continue; }
      r.cat = cat;              /* in place, on the object the loader will push */
      stamped++; packStamped++;
      dist[cat] = (dist[cat] || 0) + 1;
    }
  }
  for (const k of Object.keys(decision[pack])) if (!seen[k]) orphans.push(pack + "  " + spelling[pack][k]);

  /* ---------- 3. the promise, checked ---------- */
  const out = emit(bank);
  let reparsed;
  try { reparsed = JSON.parse(bom ? out.slice(1) : out); }
  catch (e) { die("REFUSING TO WRITE " + rel(src) + ": the stamped pack no longer parses (" + e.message + ")"); }
  const after = snap(reparsed);
  const drift = moved(before, after);
  if (drift) die("REFUSING TO WRITE " + rel(src) + ": " + drift + ".\n" +
    "S.used indexes into these tiers and every parked match would move with them.");
  const rowsAfter = after.reduce((n, t) => n + (t.qs ? t.qs.length : 0), 0);
  if (rowsAfter !== rowsBefore)
    die("REFUSING TO WRITE " + rel(src) + ": " + rowsBefore + " rows became " + rowsAfter + ".");
  const wrong = [];
  for (const t of Object.keys(reparsed)) {
    if (!Array.isArray(reparsed[t])) continue;
    for (const r of reparsed[t]) if (r.cat !== undefined && CATS.indexOf(r.cat) === -1) wrong.push(String(r.cat));
  }
  if (wrong.length) die("REFUSING TO WRITE " + rel(src) + ": " + wrong.length +
    " row(s) would carry a cat outside the eleven: " + Object.keys(wrong.reduce((o, w) => (o[w] = 1, o), {})).join(", "));

  plan.push({ src: src, out: out, stamped: packStamped });
  console.log("\n" + rel(src) + ": " + rowsBefore + " rows   " +
    before.map(t => t.tier + " " + t.qs.length).join(" / "));
  console.log("  would stamp " + packStamped);
}

/* ---------- 4. what it comes to ---------- */
console.log("\n" + rows + " pack rows.  would stamp: " + stamped + "   already correct: " + unchanged +
  "   deliberately null: " + blank + "   no decision in the map: " + missing.length);
console.log("\nresulting spread over " + rows + " pack rows:");
for (const c of CATS.slice().sort((a, b) => (dist[b] || 0) - (dist[a] || 0)))
  console.log("  " + c.padEnd(12) + String(dist[c] || 0).padStart(5) +
    "   " + (100 * (dist[c] || 0) / rows).toFixed(1) + "%");
console.log("  " + "(none)".padEnd(12) + String(rows - stamped - unchanged).padStart(5) +
  "   " + (100 * (rows - stamped - unchanged) / rows).toFixed(1) + "%");

/* A ROW WITH NO DECISION is not a silent skip: the packs are edited by other
   workstreams, so it means a question was added or reworded after the maps were
   written and nobody has judged it yet. It will never get a cat until they do. */
if (missing.length) {
  console.log("\n" + missing.length + " row(s) the maps have no decision for:");
  for (const q of missing.slice(0, VERBOSE ? missing.length : 20)) console.log("  " + q.slice(0, 110));
  if (!VERBOSE && missing.length > 20) console.log("  ... " + (missing.length - 20) + " more, --verbose for all");
}
if (orphans.length) {
  console.log("\n" + orphans.length + " decision(s) matched no row in their pack:");
  for (const q of orphans.slice(0, VERBOSE ? orphans.length : 20)) console.log("  " + q.slice(0, 110));
  if (!VERBOSE && orphans.length > 20) console.log("  ... " + (orphans.length - 20) + " more, --verbose for all");
}
if (clash.length) {
  console.log("\n" + clash.length + " row(s) already carry a different cat, left alone:");
  for (const c of clash.slice(0, VERBOSE ? clash.length : 10))
    console.log("  has " + c.had + ", map says " + c.wants + "\n      " + c.q.slice(0, 96));
}

if (!stamped) { console.log("\nnothing to change, the packs already say what the maps say"); process.exit(0); }
if (!WRITE) { console.log("\ndry run, add --write to stamp cat onto the five packs"); process.exit(0); }

for (const p of plan) {
  fs.writeFileSync(p.src, p.out);
  console.log("wrote " + rel(p.src) + "  (" + (fs.statSync(p.src).size / 1024).toFixed(1) +
    " KB, " + p.stamped + " stamped)");
}
console.log("\nevery tier is the same length and in the same order it was, so S.used still points where it did.");
