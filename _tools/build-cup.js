#!/usr/bin/env node
/* THE REAL TOURNAMENT, AS A TABLE.
 *
 *     node _tools/build-cup.js            dry run, read what it found
 *     node _tools/build-cup.js --write    write assets/cup/2006.json
 *     node _tools/build-cup.js --year 2022 --write
 *
 * The Cup in the app is a run through a real World Cup, which means it needs
 * the real thing: eight groups in the order they actually finished, all
 * twenty-four group matches with their scores, the bracket slots in the order
 * the draw put them in, and every knockout result.
 *
 * TYPING IT OUT IS THE ONE THING NOT TO DO. Eight groups is thirty-two names
 * and twenty-four scores, and a table typed from memory is wrong in exactly
 * the places nobody checks: third and fourth in a group nobody remembers, and
 * the goal difference that separated them. All of it is already in the cache
 * this repo built for build-wc2006-tournament.js, so this reads the same nine
 * pages and asks them.
 *
 * WHAT COMES OUT AND WHY EACH PIECE IS THERE:
 *
 *   groups[X].sides   the four, in the order the table finished. A run needs
 *                     the real first and second of the seven groups you are
 *                     not in, because those are the fourteen sides that fill
 *                     the bracket around you.
 *   groups[X].played  all six matches with scores. Your three are replayed by
 *                     you; the other three are real, so your group table is
 *                     the actual 2006 table with your results swapped in
 *                     rather than a table of dice.
 *   slots             the sixteen bracket positions in draw order, as group
 *                     and finishing place: A1, B2, C1, D2 and so on. This is
 *                     what makes winning a group worth something, because it
 *                     changes which half of the draw you are in.
 *   ko                every knockout result. When two sides meet in the app's
 *                     bracket in a tie that really happened, the real result
 *                     settles it, which is why Italy keep beating Germany in
 *                     Dortmund unless you are one of them.
 *   rank              how far each side really went, 7 down to 1. It decides
 *                     how hard the computer plays and who wins the ties that
 *                     never happened.
 *
 * THE CODES COME FROM THE DECK. assets/wc<year>/index.json already carries an
 * abbr for every side, so a code this tool cannot place is a real mismatch
 * between the deck and the tournament pages, and it stops rather than guesses.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const REPO = path.join(__dirname, "..");
const YEAR = (i => (i > -1 && /^\d{4}$/.test(process.argv[i + 1] || "")) ? process.argv[i + 1] : "2006")(process.argv.indexOf("--year"));
const POOL = "wc" + YEAR;
const DECK = path.join(REPO, "assets", POOL, "index.json");
const OUT = path.join(REPO, "assets", "cup", YEAR + ".json");
const CACHE = path.join(__dirname, "_models");
const UA = "ball2-cup/1.0 (personal quiz project)";
const WRITE = process.argv.includes("--write");

const GROUPS = "ABCDEFGH".split("");
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync(CACHE)) fs.mkdirSync(CACHE, { recursive: true });
const cacheRead = k => { try { return JSON.parse(fs.readFileSync(path.join(CACHE, k), "utf8")); } catch (e) { return null; } };
const cacheWrite = (k, v) => { try { fs.writeFileSync(path.join(CACHE, k), JSON.stringify(v)); } catch (e) {} };
const get = url => new Promise((res, rej) => {
  https.get(url, { headers: { "User-Agent": UA } }, r => {
    if (r.statusCode !== 200) return rej(new Error("HTTP " + r.statusCode));
    let d = ""; r.setEncoding("utf8");
    r.on("data", c => d += c); r.on("end", () => res(d));
  }).on("error", rej);
});
/* THE SAME CACHE KEY build-wc2006-tournament.js uses, so a repo that has run
   that tool does not fetch a single page to run this one. */
async function wikitext(title) {
  const key = "wct-" + crypto.createHash("sha1").update(title).digest("hex").slice(0, 16) + ".json";
  const hit = cacheRead(key);
  if (hit) return hit.t || "";
  const j = JSON.parse(await get("https://en.wikipedia.org/w/api.php?action=parse&format=json" +
    "&prop=wikitext&redirects=1&page=" + encodeURIComponent(title)));
  const t = (j && j.parse && j.parse.wikitext && j.parse.wikitext["*"]) || "";
  cacheWrite(key, { t: t });
  await sleep(400);
  return t;
}

/* ---------- code to country ---------- */
const deck = JSON.parse(fs.readFileSync(DECK, "utf8"));
const BY_CODE = {};
for (const [name, t] of Object.entries(deck)) if (t.abbr) BY_CODE[t.abbr] = name;
const unknown = new Set();
const side = code => {
  const n = BY_CODE[String(code || "").toUpperCase()];
  if (!n) unknown.add(code);
  return n || null;
};

/* ---------- the group tables ----------
   Sports table puts the four sides in finishing order as team1..team4, which
   is the table itself rather than something to be recomputed from results. */
function standings(t) {
  const out = [];
  for (let i = 1; i <= 4; i++) {
    const m = t.match(new RegExp("\\|\\s*team" + i + "\\s*=\\s*([A-Za-z]{3})"));
    if (m) out.push(side(m[1]));
  }
  return out;
}
/* ---------- the matches ----------
   A football box is |team1={{fb-rt|USA}} |score=...|0-3}} |team2={{fb|CZE}},
   and the dash in the score is an en dash rather than a hyphen. Extra time and
   penalties only happen in the knockout, where the score shown is the one at
   the end of extra time with the shootout in brackets after it. */
const DASH = "[\\u2013\\u2014-]";
function boxes(t) {
  const out = [];
  const re = /\{\{#invoke:Football box\|main([\s\S]*?)\n\}\}/g;
  let m;
  while ((m = re.exec(t))) {
    const b = m[1];
    const t1 = b.match(/\|\s*team1\s*=\s*\{\{fb[^|}]*\|\s*([A-Za-z]{3})/);
    const t2 = b.match(/\|\s*team2\s*=\s*\{\{fb[^|}]*\|\s*([A-Za-z]{3})/);
    const sc = b.match(new RegExp("\\|\\s*score\\s*=[^\\n]*?(\\d+)\\s*" + DASH + "\\s*(\\d+)"));
    if (!t1 || !t2 || !sc) continue;
    const pen = b.match(new RegExp("\\|\\s*penaltyscore\\s*=[^\\n]*?(\\d+)\\s*" + DASH + "\\s*(\\d+)"));
    const row = { a: side(t1[1]), b: side(t2[1]), f: +sc[1], g: +sc[2] };
    if (pen) { row.pf = +pen[1]; row.pg = +pen[2]; }
    out.push(row);
  }
  return out;
}

/* ---------- the bracket ----------
   The Round16 template lists its matches in bracket order: eight in the round
   of sixteen, then four quarters, two semis, the final and the third place
   play-off. Reading the order off the template is the whole point, because the
   order IS the draw: which group winner meets which runner-up, and therefore
   which half of the draw a run ends up in. */
function bracket(t) {
  /* TWO SPELLINGS OF THE SAME BRACKET. 2006 writes {{Round16}} and 2018
     writes {{#invoke:RoundN|N16}}, which is the module the template now
     wraps. The rows inside are identical, so only the way in differs. */
  let i = t.indexOf("{{Round16");
  if (i < 0) i = t.search(/{{#invoke:RoundN|N16/);
  if (i < 0) return [];
  const end = t.indexOf("\n}}", i);
  const body = t.slice(i, end < 0 ? t.length : end);
  const out = [];
  /* LINE BY LINE rather than one regex over the whole block. A bracket row is
     pipe-separated, but {{fb|GER}} carries its own pipe, and the bold quotes,
     the {{aet}} marker and the shootout brackets all sit inside the cells. So
     the two sides are found first and the number after each of them is read
     off, which is far steadier than matching a whole row at once. */
  for (const line of body.split("\n")) {
    if (!/^\|.*\{\{fb/.test(line)) continue;
    const codes = [];
    const cre = /\{\{fb\|([A-Za-z]{3})(?:\|\d+)?\}\}/g;
    let cm;
    while ((cm = cre.exec(line))) codes.push(cm[1]);
    if (codes.length !== 2) continue;
    const scores = [];
    let rest = line;
    rest = line;
    for (const c of codes) {
      const at = rest.indexOf("{{fb|" + c);
      const after = rest.slice(rest.indexOf("}}", at) + 2);
      const s = after.match(/^[^|]*\|[^\d|]*(\d+)/);
      scores.push(s ? +s[1] : null);
      rest = after;
    }
    if (scores.some(s => s == null)) continue;
    const shoot = [];
    const sre = /\((\d+)\)/g;
    let sm;
    while ((sm = sre.exec(line))) shoot.push(+sm[1]);
    const row = { a: side(codes[0]), b: side(codes[1]), f: scores[0], g: scores[1] };
    if (shoot.length === 2) { row.pf = shoot[0]; row.pg = shoot[1]; }
    out.push(row);
  }
  return out;
}

(async () => {
  const groups = {};
  for (const g of GROUPS) {
    const t = await wikitext(YEAR + " FIFA World Cup Group " + g);
    if (!t) throw new Error("no page for group " + g);
    groups[g] = { sides: standings(t), played: boxes(t) };
  }
  const ko = bracket(await wikitext(YEAR + " FIFA World Cup knockout stage"));

  /* ---------- the draw, read back off the bracket ----------
     Which bracket position each side occupied is not written down anywhere as
     A1 or B2; it is implied by who is in which round of sixteen tie. So the
     sixteen qualifiers are looked up in their own group tables and the slot
     order comes out as the thing the app actually wants. */
  const place = {};
  for (const g of GROUPS) groups[g].sides.forEach((s, i) => { place[s] = g + (i + 1); });
  const r16 = ko.slice(0, 8);
  const slots = [];
  for (const m of r16) { slots.push(place[m.a] || "?"); slots.push(place[m.b] || "?"); }

  /* ---------- how far everybody went ----------
     Seven for the winners down to one for a side that lost all three. It is
     the only ranking in the data anybody would recognise, and the app uses it
     for both how hard a side plays and who wins a tie that never happened. */
  const rank = {};
  for (const g of GROUPS) groups[g].sides.forEach((s, i) => { rank[s] = i === 2 ? 2 : 1; });
  for (const s of slots.map(x => Object.keys(place).find(k => place[k] === x))) if (s) rank[s] = 3;
  const winner = m => m.f > m.g ? m.a : m.f < m.g ? m.b : ((m.pf || 0) > (m.pg || 0) ? m.a : m.b);
  const round = (rows, score) => rows.forEach(m => { rank[winner(m)] = score; });
  round(ko.slice(0, 8), 4);    // through to the quarters
  round(ko.slice(8, 12), 5);   // through to the semis
  round(ko.slice(12, 14), 6);  // through to the final
  round(ko.slice(14, 15), 7);  // and won it
  /* THE BEATEN FINALIST IS A SIX. The round above gave both of them seven,
     because both of them reached the final, so the one who lost it has to be
     put back. Reading the winner off the goals alone made Italy the
     runners-up: the 2006 final finished level. */
  const final = ko[14];
  if (final) rank[winner(final) === final.a ? final.b : final.a] = 6;

  const out = { year: YEAR, groups: groups, slots: slots, ko: ko.slice(0, 15), rank: rank };

  /* ---------- what it found, so it can be read rather than trusted ---------- */
  for (const g of GROUPS) {
    console.log("Group " + g + ": " + groups[g].sides.join(", ") +
      "   (" + groups[g].played.length + " matches)");
  }
  console.log("\nBracket order: " + slots.join(" "));
  console.log("Knockout: " + ko.length + " matches");
  for (const m of ko.slice(0, 15))
    console.log("  " + m.a + " " + m.f + (m.pf != null ? " (" + m.pf + ")" : "") +
      " - " + m.g + (m.pg != null ? " (" + m.pg + ")" : "") + " " + m.b);
  console.log("\nRank: " + Object.entries(rank).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => k + " " + v).join(", "));

  /* ---------- refuse to write something that is not a tournament ---------- */
  const bad = [];
  if (unknown.size) bad.push("codes the deck does not have: " + [...unknown].join(", "));
  for (const g of GROUPS) {
    if (groups[g].sides.length !== 4 || groups[g].sides.some(x => !x)) bad.push("group " + g + " is not four sides");
    if (groups[g].played.length !== 6) bad.push("group " + g + " has " + groups[g].played.length + " matches, not 6");
  }
  if (slots.length !== 16 || slots.some(s => s === "?")) bad.push("the bracket is not sixteen placed sides");
  if (new Set(slots).size !== 16) bad.push("two sides in one bracket slot");
  if (ko.length < 15) bad.push("the knockout is " + ko.length + " matches, not 15");
  if (Object.keys(rank).length !== 32) bad.push("ranked " + Object.keys(rank).length + " sides, not 32");
  if (bad.length) {
    console.error("\nNOT WRITTEN:\n  " + bad.join("\n  "));
    process.exit(1);
  }

  if (!WRITE) { console.log("\nDry run. --write to save " + path.relative(REPO, OUT)); return; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log("\nwrote " + path.relative(REPO, OUT) + " (" +
    (fs.statSync(OUT).size / 1024).toFixed(1) + "KB)");
})().catch(e => { console.error(e); process.exit(1); });
