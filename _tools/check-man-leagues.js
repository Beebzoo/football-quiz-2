#!/usr/bin/env node
/* CHECK THE CAREERS HARVEST, FOR ANY POOL.
 *
 *     node _tools/check-man-leagues.js                   the 2006 squads, as always
 *     node _tools/check-man-leagues.js --pool euro2024   one other pool
 *     node _tools/check-man-leagues.js --all             every pool the app declares
 *     node _tools/check-man-leagues.js --all --strict    and no standing debt allowed
 *     node _tools/check-man-leagues.js --floor 60        gate coverage at 60% for this run
 *
 * build-man-leagues.js writes an lg array onto every man in a squad pool, and
 * The Dugout says that league out loud on the card for every ball. A wrong lg
 * is therefore wrong all night, in front of everyone, in a mode whose whole
 * point is that you knew Cannavaro asks Serie A.
 *
 * So the harvest gets a second opinion. Two of them, in fact:
 *
 *   1. COVERAGE. How many men carry a league at all, and how thin the thinnest
 *      squads are. A harvest that resolves everybody and finds nothing is a
 *      harvest that failed quietly.
 *
 *   2. AGREEMENT. Some of the men in a pool also appear in the hand-curated
 *      CAREERS entries in index.html, written by a human who was not consulting
 *      Wikidata. Where those two disagree, one of them is wrong and it is worth
 *      knowing which. This half is the reason the file exists, and until now it
 *      had only ever been pointed at one pool, because the 2006 deck was read
 *      in rather than asked for. The comparison is the same for every pool, so
 *      there was no reason for that beyond nobody having typed the argument in,
 *      and unpinning it found real gaps the first time it ran. See the
 *      paragraph above BLANKS.
 *
 * WHY --pool AND NOT --comp AND --year. The three tournament harvesters take a
 * competition and a year through _tournament.js, because they go and read that
 * tournament's Wikipedia pages and the page titles are what they are arguing
 * about. This file reads no pages. It reads the file build-man-leagues.js
 * wrote, so it takes the argument build-man-leagues.js takes, spelled the same
 * way, at its line 42. A checker that names its subject differently from the
 * tool it is checking is one more thing to get wrong at eleven at night.
 * --pool also says things --comp and --year cannot: finals is a pool and is not
 * a tournament year, and the six club pools are pools with no men in them.
 *
 * WHERE THE FILE COMES FROM. The app's own POOLS registry in index.html,
 * parsed rather than assumed, so a pool whose file does not sit at the tidy
 * assets/<id>/index.json still resolves, and so --all is exactly the set of
 * pools the menu will offer rather than a list in here that goes stale. The
 * club pools point at a clubs.json, which is a list of clubs and not of men,
 * so there is nothing here to check and the run says so and moves on.
 *
 * WHERE THE FLOORS COME FROM, and this is the one number deliberately not
 * written in this file. _tests/assets-test.js already carries a measured lg
 * floor per pool in LG_FLOOR and asserts it on every test run. Two tables in
 * two files guarding one number is a drift waiting to happen, so this reads
 * that one and stops rather than guessing if it cannot find it. A pool in the
 * registry with no floor and no clubs.json is a FAILURE here, which is what
 * makes adding a tournament safe: a new pool cannot slip in carrying nothing.
 *
 * Run it after every harvest. It exits non-zero on the gates above, so it can
 * sit in front of a commit.
 *
 * Source of the club-to-league mapping: assets/<deck>/clubs.json, which is the
 * app's own list, plus the HISTORIC table below for sides that have since gone
 * down and so are not in a current clubs.json.
 *
 * WHAT THIS DOES NOT DO, said plainly. It reads what is on disk and it reads
 * the app, and it never fetches anything. So it cannot tell you a man's lg is
 * wrong, only that it disagrees with the curated list or is not there at all.
 * Every number it prints is counted off the files in this repo.
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
   you to ignore it. Each one is a top-flight spell in that country.

   IT IS A 2006-ERA LIST, and that matters now that this runs on every pool. A
   slug it does not know is dropped from what the curated list is taken to
   claim, so a thin table makes this check LOOSER on a pool from another decade
   rather than wrong: it can miss a disagreement, it cannot invent one. The
   count of slugs it could not place is printed on every run, so the looseness
   is a number on the screen rather than an assumption. Growing it for another
   era means writing down which sides were top flight in which year, which is
   real work with a source behind it and is not this file's to do quietly. */
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
  "west-ham": "premier", "west-ham-united": "premier", "newcastle": "premier",
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

/* ---------- which pool, and where its file is ---------- */
/* Read exactly the way build-man-leagues.js reads it at its line 42, character
   for character, so the two cannot drift into two spellings of one idea. */
const POOL = (i => (i > -1 && process.argv[i + 1]) ? process.argv[i + 1] : "wc2006")(process.argv.indexOf("--pool"));
const ALL = process.argv.includes("--all");
const STRICT = process.argv.includes("--strict");
const FLOOR_ARG = (i => (i > -1 && /^\d+$/.test(process.argv[i + 1] || "")) ? Number(process.argv[i + 1]) : null)(process.argv.indexOf("--floor"));

/* index.html is read once and used twice, for the pool registry here and for
   the curated CAREERS list below. It is the largest file in the repo and there
   is no reason to read it twice, least of all once per pool under --all. */
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

/* THE APP'S OWN REGISTRY, parsed rather than typed, which is the same trick
   _tests/assets-test.js plays for the same reason: a pool added to the app and
   not to a list in here would otherwise never be checked and nothing would say
   so. The only thing wanted off a row is the file it names. */
const REG = (() => {
  const a = html.indexOf("const POOLS = {"), b = html.indexOf("const QUIZZES = {");
  const rows = {};
  if (a < 0 || b < a) return rows;
  for (const m of html.slice(a, b).matchAll(/^\s*"?([a-z0-9-]+)"?:\s*\{[\s\S]*?file:\s*"([^"]+)"/gm))
    rows[m[1]] = m[2];
  return rows;
})();
if (!Object.keys(REG).length) { console.error("could not parse the POOLS registry out of index.html"); process.exit(2); }

/* A CLUB POOL IS THE ONE THIS FILE HAS NOTHING TO SAY ABOUT, and it is told
   apart by the file the app points it at rather than by its shape. A clubs.json
   does carry an xi, because a league is played as a club and a club puts eleven
   out, so "has it got men in it" answers yes and would have this file report
   every league player as missing a career. What a clubs.json has not got is an
   lg field: build-man-leagues.js writes assets/<pool>/index.json for a
   tournament squad and has never written a clubs.json, and a man in a league
   deck is already in that league, which is the thing lg exists to say. */
const isClubPool = id => /clubs\.json$/.test(REG[id] || "");

/* A pool the registry has not heard of still gets checked, at the path the
   harvest would have written it to. That is the case where a deck has been
   built and not yet wired into the app, which is a normal half hour. */
const fileFor = id => path.join(ROOT, REG[id] || path.join("assets", id, "index.json"));

/* THE FLOORS, READ OUT OF THE TEST that already measures and asserts them for
   all 22 pools, rather than kept a second time here. The old copy in this file
   was a single FLOOR of 0.55 for the only pool it could see; the test says 60
   for wc2006, measured off the deck with about eight points of tolerance, so
   the gate gets slightly stricter today and wc2006 passes it at the number this
   run prints. If that table is renamed or moved, this stops rather than falling
   back to a number nobody chose. */
const LG_FLOOR = (() => {
  const t = fs.readFileSync(path.join(ROOT, "_tests/assets-test.js"), "utf8");
  const a = t.indexOf("const LG_FLOOR = {");
  if (a < 0) { console.error("LG_FLOOR not found in _tests/assets-test.js, which is where the floors live"); process.exit(2); }
  const b = t.indexOf("};", a);
  try { return eval("(" + t.slice(a + "const LG_FLOOR = ".length, b + 1) + ")"); }
  catch (e) { console.error("could not read LG_FLOOR: " + e.message); process.exit(2); }
})();

/* A FLOOR OF ZERO MEANS THE OPPOSITE THING, and it is checked as an equality.
   finals is the only pool carrying one today. A floor of zero is satisfied by
   every number there is and would guard nothing, so a pool that is meant to
   carry nothing is asked to prove it still carries nothing. _tests/assets-test.js
   makes the same assertion about finals for the same reason, and
   _tools/build-finals-pool.js:26 is where the decision is written down. Three
   files now say it, so a harvest that ever does run against finals gets three
   hellos on the same afternoon rather than one quiet agreement. */

/* THE DEBT, MEASURED RATHER THAN CHOSEN. These are men the curated list knows
   and the harvest returned with no league at all, counted per pool off the
   decks as they stand today. It is a ratchet and not a target: the gate fails
   if a pool goes above its number, so the debt can be worked down and cannot
   quietly grow back, and the run tells you to lower the number when it shrinks.
   --strict ignores this table and demands zero.

   euro2024 is the reason the table exists. The first run of this check against
   a pool other than 2006 found 31 of them there, men whose careers the curated
   list spells out in full, on a pool whose coverage passes its floor. Nothing
   in the repo was looking, because this file could only ever see 2006. Setting
   the gate to zero on the spot would have made it red on arrival for a fault
   that predates it, and the paragraph above HISTORIC already says what a check
   that is wrong on arrival does: it trains you to ignore it. */
const BLANKS = { euro2024: 31, wc2026: 4, euro2020: 2 };

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
const at = html.indexOf("const CAREERS = [");
if (at < 0) { console.error("CAREERS not found in index.html"); process.exit(2); }
const end = html.indexOf("\n];", at);
const body = html.slice(at + "const CAREERS = ".length, end + 2);
let CAREERS;
try { CAREERS = eval(body); }                 // it is our own file, one line, no imports
catch (e) { console.error("could not read CAREERS: " + e.message); process.exit(2); }

const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const curated = {};
for (const c of CAREERS) curated[norm(c.n)] = c;

const say = a => a.map(id => LABEL[id] || id).join(", ") || "nothing";
const rel = f => path.relative(ROOT, f).split("\\").join("/");

/* ---------- one pool ---------- */
/* Returns the number of failures, so --all can add them up rather than having
   every pool race to call process.exit first. */
function checkPool(pool) {
  console.log("\n================ " + pool + " ================");
  const f = fileFor(pool);
  if (!fs.existsSync(f)) {
    console.log("  no file at " + rel(f) + ", nothing to check");
    return 1;
  }
  const deck = JSON.parse(fs.readFileSync(f, "utf8"));
  const sides = deck.teams || deck;

  if (isClubPool(pool)) {
    console.log("  " + Object.keys(sides).length + " clubs from " + rel(f) +
      ": a league deck carries no lg, by design. Nothing here for this check. Skipped.");
    return 0;
  }

  const men = [];
  for (const [side, t] of Object.entries(sides))
    for (const m of [...(t.xi || []), ...(t.bench || [])])
      men.push({ side, ...m });
  if (!men.length) {
    console.log("  " + rel(f) + " has no men in it at all, which is not a shape this check can read");
    return 1;
  }

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

  console.log("COVERAGE  (" + pool + ", " + rel(f) + ")");
  console.log("  men in the squads: " + men.length + " across " + Object.keys(sides).length + " sides");
  console.log("  carrying at least one league: " + withLg.length +
    "  (" + (100 * withLg.length / men.length).toFixed(1) + "%)");
  console.log("  club slugs mapped: " + fromClubs + " from clubs.json, " +
    Object.keys(HISTORIC).length + " historic");
  console.log("  per deck: " + (Object.entries(per).sort((a, b) => b[1] - a[1])
    .map(([id, n]) => (LABEL[id] || id) + " " + n).join(", ") || "nothing"));

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
    const want = [...new Set((c.c || []).map(x => slugLeague[x]).filter(Boolean))];
    const unmapped = (c.c || []).filter(x => !slugLeague[x]);
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

  /* HOW BLIND THIS HALF IS, as a number, and read it before you read either of
     the two lists underneath on any pool that is not 2006. Every one of these
     is a club in a curated career that neither clubs.json nor HISTORIC could
     place in a league, so it was dropped from what the curated list is taken to
     claim. A big number here does not mean the harvest is wrong, it means this
     check is only reading part of the sentence. */
  const unmapped = {};
  for (const r of rows) for (const sl of r.unmapped) unmapped[sl] = (unmapped[sl] || 0) + 1;
  const unKeys = Object.entries(unmapped).sort((a, b) => b[1] - a[1]);
  console.log("  curated club slugs this mapping does not know: " + unKeys.length +
    (unKeys.length ? " (" + unKeys.slice(0, 12).map(([k, n]) => k + (n > 1 ? " x" + n : "")).join(", ") +
      (unKeys.length > 12 ? ", ..." : "") + ")" : ""));

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
  const cover = 100 * withLg.length / men.length;
  const blank = rows.filter(r => r.want.length && !r.got.length);
  const floor = FLOOR_ARG !== null ? FLOOR_ARG : LG_FLOOR[pool];
  let bad = 0;
  console.log("");

  if (floor === undefined) {
    /* A POOL NOBODY HAS JUDGED IS A FAILURE, not a silence. This is the check
       that makes adding a tournament safe: a new pool has no floor, so it
       cannot slip through carrying nothing at all while every gate passes. */
    console.log("FAIL: " + pool + " is in the app's registry and nothing says what it should carry.");
    console.log("  It measured " + cover.toFixed(1) + "%. Give it a floor in LG_FLOOR in");
    console.log("  _tests/assets-test.js, measured off today's deck less about eight points.");
    bad++;
  } else if (floor === 0) {
    if (withLg.length) {
      console.log("FAIL: " + pool + " is meant to carry no careers at all and " + withLg.length +
        " of its " + men.length + " men now do.");
      console.log("  If that was on purpose it needs saying in three places at once: a real floor");
      console.log("  in LG_FLOOR in _tests/assets-test.js, the equality check beside it, and the");
      console.log("  paragraph at _tools/build-finals-pool.js:26 that states the opposite.");
      bad++;
    } else {
      console.log("OK: " + pool + " still carries no careers, which is the deliberate part.");
    }
  } else {
    if (cover < floor) {
      console.log("FAIL: coverage is " + cover.toFixed(1) + "%, under the " + floor +
        "% floor: the harvest came back thin");
      bad++;
    }
    const owed = STRICT ? 0 : (BLANKS[pool] || 0);
    if (blank.length > owed) {
      console.log("FAIL: " + blank.length + " men the curated list knows came back with no league at all" +
        (owed ? ", against a standing debt of " + owed : "") + ":");
      for (const r of blank) console.log("  " + (r.m.full || r.m.n) + " (" + say(r.want) + ")");
      bad++;
    } else if (blank.length) {
      console.log("DEBT: " + blank.length + " known blanks are still here, which is the number this file");
      console.log("  already owns for " + pool + ". They are:");
      for (const r of blank) console.log("  " + (r.m.full || r.m.n) + " (" + say(r.want) + ")");
    }
    if (blank.length < owed) {
      console.log("NOTE: " + pool + " is down to " + blank.length + " blanks against a debt of " + owed +
        ". Lower BLANKS." + pool + " in this file so it cannot creep back.");
    }
    if (!bad) console.log("OK: coverage holds at " + cover.toFixed(1) +
      "% against a floor of " + floor + "%, and every curated man resolved to something.");
  }
  return bad;
}

/* ---------- run it ---------- */
const pools = ALL ? Object.keys(REG) : [POOL];
let bad = 0;
const scores = [];
for (const p of pools) { const n = checkPool(p); bad += n; scores.push([p, n]); }
if (ALL) {
  console.log("\n================ all pools ================");
  for (const [p, n] of scores) console.log("  " + p.padEnd(18) + (n ? n + " FAILING" : "ok"));
}
process.exit(bad ? 1 : 0);
