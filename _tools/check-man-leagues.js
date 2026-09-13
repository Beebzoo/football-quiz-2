#!/usr/bin/env node
/* CHECK THE CAREERS HARVEST.
 *
 * build-man-leagues.js writes an lg array onto every man in the 2006 squads,
 * and The Dugout says that league out loud on the card for every ball. A wrong
 * lg is therefore wrong all night, in front of everyone, in a mode whose whole
 * point is that you knew Cannavaro asks Serie A.
 *
 * So the harvest gets a second opinion. Two of them, in fact:
 *
 *   1. COVERAGE. How many men carry a league at all, and how thin the thinnest
 *      squads are. A harvest that resolves everybody and finds nothing is a
 *      harvest that failed quietly.
 *
 *   2. AGREEMENT. Around ninety of the 2006 men also appear in the 503
 *      hand-curated CAREERS entries in index.html, written by a human who was
 *      not consulting Wikidata. Where those two disagree, one of them is wrong
 *      and it is worth knowing which.
 *
 * Run it after every harvest:  node _tools/check-man-leagues.js
 * It exits non-zero if coverage collapses or a man the curated list knows has
 * come back with nothing, so it can sit in front of a commit.
 *
 * Source of the club-to-league mapping: assets/<deck>/clubs.json, which is the
 * app's own list, plus the HISTORIC table below for sides that have since gone
 * down and so are not in a current clubs.json.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DECKS = ["eredivisie", "premier", "laliga", "bundesliga", "seriea", "belgian"];
/* the deck ids the app uses are not all the folder names */
const DECK_ID = { eredivisie: "ere" };
const idOf = d => DECK_ID[d] || d;
const LABEL = {
  ere: "Eredivisie", premier: "Premier League", laliga: "La Liga",
  bundesliga: "Bundesliga", seriea: "Serie A", belgian: "Belgian Pro League",
};

/* CLUBS THE CURATED LIST NAMES THAT ARE NOT IN A CURRENT clubs.json, because
   they have been relegated, renamed or folded since. Without these the check
   reports a real league as a phantom, which is worse than no check: it trains
   you to ignore it. Each one is a top-flight spell in that country. */
const HISTORIC = {
  // Spain
  "tenerife": "laliga", "real-zaragoza": "laliga", "zaragoza": "laliga",
  "deportivo": "laliga", "deportivo-la-coruna": "laliga", "racing-santander": "laliga",
  "sporting-gijon": "laliga", "malaga": "laliga", "valladolid": "laliga",
  "las-palmas": "laliga", "cadiz": "laliga", "almeria": "laliga", "granada": "laliga",
  "eibar": "laliga", "huesca": "laliga", "leganes": "laliga", "sd-huesca": "laliga",
  // Germany
  "hertha-bsc": "bundesliga", "hertha-berlin": "bundesliga", "schalke": "bundesliga",
  "schalke-04": "bundesliga", "hamburger-sv": "bundesliga", "hamburg": "bundesliga",
  "hannover-96": "bundesliga", "kaiserslautern": "bundesliga", "bielefeld": "bundesliga",
  "nurnberg": "bundesliga", "duisburg": "bundesliga", "rostock": "bundesliga",
  "karlsruhe": "bundesliga", "bochum": "bundesliga", "greuther-furth": "bundesliga",
  "darmstadt": "bundesliga", "paderborn": "bundesliga", "ingolstadt": "bundesliga",
  // Italy
  "parma": "seriea", "brescia": "seriea", "chievo": "seriea", "chievo-verona": "seriea",
  "palermo": "seriea", "siena": "seriea", "reggina": "seriea", "livorno": "seriea",
  "catania": "seriea", "bari": "seriea", "ancona": "seriea", "messina": "seriea",
  "treviso": "seriea", "perugia": "seriea", "piacenza": "seriea", "sampdoria": "seriea",
  "salernitana": "seriea", "spal": "seriea", "benevento": "seriea", "crotone": "seriea",
  "verona": "seriea", "hellas-verona": "seriea", "empoli": "seriea", "spezia": "seriea",
  // England
  "portsmouth": "premier", "blackburn": "premier", "blackburn-rovers": "premier",
  "bolton": "premier", "bolton-wanderers": "premier", "wigan": "premier",
  "charlton": "premier", "charlton-athletic": "premier", "middlesbrough": "premier",
  "reading": "premier", "birmingham-city": "premier", "stoke-city": "premier",
  "swansea-city": "premier", "hull-city": "premier", "cardiff-city": "premier",
  "norwich-city": "premier", "watford": "premier", "west-bromwich-albion": "premier",
  "queens-park-rangers": "premier", "sheffield-united": "premier", "derby-county": "premier",
  "leicester": "premier", "leicester-city": "premier", "fulham": "premier",
  "burnley": "premier", "southampton": "premier", "sunderland": "premier",
  "leeds-united": "premier", "wimbledon": "premier", "portsmouth-fc": "premier",
  "huddersfield-town": "premier", "coventry-city": "premier", "ipswich-town": "premier",
  // Netherlands
  "ado-den-haag": "ere", "vitesse": "ere", "roda-jc": "ere", "de-graafschap": "ere",
  "willem-ii": "ere", "rkc-waalwijk": "ere", "nac-breda": "ere", "sparta-rotterdam": "ere",
  "fc-den-bosch": "ere", "fc-volendam": "ere", "cambuur": "ere", "excelsior": "ere",
  // Belgium
  "beveren": "belgian", "germinal-beerschot": "belgian", "lierse": "belgian",
  "mouscron": "belgian", "westerlo": "belgian", "roeselare": "belgian",
};

/* ---------- the harvest ---------- */
const teams = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/wc2006/index.json"), "utf8"));
const men = [];
for (const [side, t] of Object.entries(teams))
  for (const m of [...(t.xi || []), ...(t.bench || [])])
    men.push({ side, ...m });

/* ---------- slug to league ---------- */
const slugLeague = {};
for (const d of DECKS) {
  const p = path.join(ROOT, "assets", d, "clubs.json");
  if (!fs.existsSync(p)) continue;
  for (const c of Object.values(JSON.parse(fs.readFileSync(p, "utf8"))))
    if (c && c.slug) slugLeague[c.slug] = idOf(d);
}
const fromClubs = Object.keys(slugLeague).length;
for (const [slug, lg] of Object.entries(HISTORIC))
  if (!slugLeague[slug]) slugLeague[slug] = lg;

/* ---------- the curated list, read out of the app ---------- */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const at = html.indexOf("const CAREERS = [");
if (at < 0) { console.error("CAREERS not found in index.html"); process.exit(2); }
const end = html.indexOf("\n];", at);
const body = html.slice(at + "const CAREERS = ".length, end + 2);
let CAREERS;
try { CAREERS = eval(body); }                 // it is our own file, one line, no imports
catch (e) { console.error("could not read CAREERS: " + e.message); process.exit(2); }

const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const curated = {};
for (const c of CAREERS) curated[norm(c.n)] = c;

/* ---------- 1. coverage ---------- */
const withLg = men.filter(m => (m.lg || []).length);
const per = {};
for (const m of men) for (const id of (m.lg || [])) per[id] = (per[id] || 0) + 1;
const bySide = {};
for (const m of men) {
  bySide[m.side] = bySide[m.side] || { n: 0, lg: 0 };
  bySide[m.side].n++;
  if ((m.lg || []).length) bySide[m.side].lg++;
}

console.log("COVERAGE");
console.log("  men in the 2006 squads: " + men.length);
console.log("  carrying at least one league: " + withLg.length +
  "  (" + (100 * withLg.length / men.length).toFixed(1) + "%)");
console.log("  club slugs mapped: " + fromClubs + " from clubs.json, " +
  Object.keys(HISTORIC).length + " historic");
console.log("  per deck: " + Object.entries(per).sort((a, b) => b[1] - a[1])
  .map(([id, n]) => (LABEL[id] || id) + " " + n).join(", "));

const thin = Object.entries(bySide).filter(([, v]) => v.lg / v.n < 0.35)
  .sort((a, b) => a[1].lg / a[1].n - b[1].lg / b[1].n);
if (thin.length) {
  console.log("\n  squads where most men carry nothing (they ask the classic bank):");
  for (const [side, v] of thin) console.log("    " + side.padEnd(22) + v.lg + "/" + v.n);
}

/* ---------- 2. agreement ---------- */
const rows = [];
for (const m of men) {
  const c = curated[norm(m.full)] || curated[norm(m.n)];
  if (!c) continue;
  const want = [...new Set((c.c || []).map(s => slugLeague[s]).filter(Boolean))];
  const unmapped = (c.c || []).filter(s => !slugLeague[s]);
  const got = [...new Set(m.lg || [])];
  rows.push({
    m, c, want, got, unmapped,
    extra: got.filter(x => !want.includes(x)),
    missing: want.filter(x => !got.includes(x)),
  });
}
const agreed = rows.filter(r => !r.extra.length && !r.missing.length);

console.log("\nAGREEMENT with the hand-curated CAREERS list");
console.log("  men in both: " + rows.length);
console.log("  identical: " + agreed.length + "/" + rows.length);

const say = a => a.map(id => LABEL[id] || id).join(", ") || "nothing";
const flag = (title, list, note) => {
  if (!list.length) return;
  console.log("\n  " + title + " (" + list.length + "):");
  for (const r of list) {
    console.log("    " + (r.m.full || r.m.n).padEnd(24) + say(r.got));
    console.log("      curated: " + say(r.want) + note(r));
  }
};

/* MISSING IS THE SERIOUS ONE. The curated list says he played there and the
   harvest did not find it, so the card will never ask that league of him. */
flag("the harvest is missing a league the curated list has",
  rows.filter(r => r.missing.length),
  r => "   missing: " + say(r.missing) +
    (r.unmapped.length ? "   (unmapped slugs: " + r.unmapped.join(", ") + ")" : ""));

/* EXTRA IS USUALLY FINE. The curated list simplifies loans away on purpose, so
   a real Everton loan shows up here. Read it, do not automate it. */
flag("the harvest has a league the curated list does not",
  rows.filter(r => r.extra.length && !r.missing.length),
  r => "   extra: " + say(r.extra) +
    (r.unmapped.length ? "   (unmapped slugs: " + r.unmapped.join(", ") + ")" : ""));

/* ---------- the gate ---------- */
const FLOOR = 0.55;          // where the harvest stood when this was written
const blank = rows.filter(r => r.want.length && !r.got.length);
let bad = 0;
console.log("");
if (withLg.length / men.length < FLOOR) {
  console.log("FAIL: coverage is under " + (FLOOR * 100) + "%, the harvest came back thin");
  bad++;
}
if (blank.length) {
  console.log("FAIL: " + blank.length + " men the curated list knows came back with no league at all:");
  for (const r of blank) console.log("  " + (r.m.full || r.m.n) + " (" + say(r.want) + ")");
  bad++;
}
if (!bad) console.log("OK: coverage holds and every curated man resolved to something.");
process.exit(bad ? 1 : 0);
