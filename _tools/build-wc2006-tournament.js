#!/usr/bin/env node
/* WHAT EACH MAN ACTUALLY DID IN GERMANY.
 *
 * RUN IT AFTER THE ELEVENS. The pipeline is squads, then the real elevens,
 * then this, then the careers: build-wc2006-xi.js rewrites every position to
 * the one the man actually played, and the traits below read positions.
 *
 *     node _tools/build-wc2006-tournament.js            dry run, read the table
 *     node _tools/build-wc2006-tournament.js --write    stamp it onto the deck
 *     node _tools/build-wc2006-tournament.js --who "Klose"
 *
 * The Dugout wants traits, and a trait has to come from somewhere. Typing one
 * out of memory is how a quiz ends up telling a room that somebody was a
 * finisher when he did not score all summer, so every trait in this app is
 * EARNED off the tournament itself: goals, cards, appearances and the armband,
 * read out of the nine match articles Wikipedia keeps for 2006.
 *
 * Nine fetches. Eight group pages and the knockout stage, about 390KB, and the
 * same API call build-man-leagues.js already uses, cached the same way.
 *
 * TWO TRAPS, both found by counting and both worth spelling out, because they
 * do not look like bugs, they look like results.
 *
 *   {{goal|17||48|pen.}} is minute-then-note PAIRS. Split it naively and
 *   "pen." counts as a goal, which on its own turned David Villa's three into
 *   five. Count numeric tokens only.
 *
 *   {{goal|4|o.g.}} is an own goal, and it is listed under the OPPOSING side's
 *   block, because that is where the goal counted. Credit it naively and you
 *   make finishers out of defenders: Gamarra, Sancho, Zaccardo and Petit, who
 *   are precisely 2006's four own goals.
 *
 * The eligibility it produces is deliberately NOT the trait. The harvest says
 * what a man COULD be; the budget in the app says how many are switched on. A
 * side with six eligible finishers still only gets three points to spend, so
 * Brazil having more good players does not become Brazil having more traits.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const REPO = path.join(__dirname, "..");
/* WHICH TOURNAMENT. Wikipedia has used the same squad and match templates for
   every World Cup back to 1930, so the year is the only thing that changes.
   2006 is the default because it is the one whose data has been checked by
   hand, man by man, and it stays the default until another one has been. */
const YEAR = (i => (i > -1 && /^\d{4}$/.test(process.argv[i + 1] || "")) ? process.argv[i + 1] : "2006")(process.argv.indexOf("--year"));
const POOL = "wc" + YEAR;
const OUT = path.join(REPO, "assets", POOL, "index.json");
const CACHE = path.join(__dirname, "_models");
const UA = "ball2-tournament/1.0 (personal quiz project)";
const WRITE = process.argv.includes("--write");
const WHO = (i => i > -1 ? process.argv[i + 1] : null)(process.argv.indexOf("--who"));

/* THE FINAL IS ALWAYS ITS OWN ARTICLE and the knockout page never carries it,
   so a harvest that stops at the knockout stage is missing the goals from the
   one match everybody remembers. EXTRAS are the other matches famous enough to
   have been given a page of their own. */
const EXTRAS = {
  "2006": ["Battle of Nuremberg (2006 FIFA World Cup)"],
};
const PAGES = "ABCDEFGH".split("").map(g => YEAR + " FIFA World Cup Group " + g)
  .concat([YEAR + " FIFA World Cup knockout stage", YEAR + " FIFA World Cup final"])
  .concat(EXTRAS[YEAR] || []);
const SQUADS = YEAR + " FIFA World Cup squads";

/* what the published tournament totals were, so the harvest can be checked
   against something rather than against itself */
/* WHAT EACH TOURNAMENT ACTUALLY PRODUCED, so the harvest is checked against
   something outside itself rather than against its own arithmetic. A year
   with no row here simply prints its counts and claims nothing, which is
   better than comparing 2022 to 2006 and calling the difference a bug. */
const PUBLISHED_BY_YEAR = {
  "2006": { goals: 147, yellows: 345, reds: 28 },
  "2022": { goals: 172, yellows: 227, reds: 4 },
};
const PUBLISHED = PUBLISHED_BY_YEAR[YEAR] || null;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = x => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

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

/* ---------- the deck we are stamping ---------- */
const sides = JSON.parse(fs.readFileSync(OUT, "utf8"));
const men = [];
for (const [side, t] of Object.entries(sides))
  for (const key of ["xi", "bench"])
    for (const p of (t[key] || [])) men.push({ side: side, key: key, p: p });

/* NAME TO MAN, and it has to be precise. Two men in the deck can share a
   surname, so the full name is tried first and a surname only accepted when
   exactly one man in the whole tournament answers to it. */
const byFull = {}, bySur = {};
for (const m of men) {
  byFull[norm(m.p.full)] = byFull[norm(m.p.full)] || [];
  byFull[norm(m.p.full)].push(m);
  const sur = norm(m.p.n);
  bySur[sur] = bySur[sur] || [];
  bySur[sur].push(m);
}
/* article title -> the name the deck actually holds. Checked one at a time
   against assets/wc2006/index.json, not guessed. */
const ALIAS = {
  "Anatoliy Tymoschuk": "Anatoliy Tymoshchuk",
  "Andriy Nesmachnyi": "Andriy Nesmachniy",
  "Abdulaziz Khathran": "Abdulaziz Al-Khathran",
  "Jorge Martín Núñez": "Jorge Núñez",
  "Julio Ricardo Cruz": "Julio Cruz",
  "Luís Manuel Ferreira Delgado": "Delgado",
  /* on the pitch in Germany, not among the twenty-three their country's squad
     page lists. Two articles disagreeing, not something to paper over. */
  "Hussein Sulaimani": null,
  "Haminu Dramani": null,
};
let missed = [];
function find(name, side) {
  /* THE QUALIFIER COMES OFF THE RAW TITLE. norm() turns brackets into spaces,
     so by the time it has run there is nothing left to cut and "Ronaldo
     (Brazilian footballer)" is a four-word name nobody has. */
  let raw = String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (Object.prototype.hasOwnProperty.call(ALIAS, raw)) {
    if (ALIAS[raw] === null) return null;      // known, and known not to be in the deck
    raw = ALIAS[raw];
  }
  const n = norm(raw);
  let hit = byFull[n] || [];
  if (hit.length > 1 && side) hit = hit.filter(m => m.side === side);
  if (hit.length === 1) return hit[0];
  const bare = n;
  hit = byFull[bare] || [];
  if (hit.length > 1 && side) hit = hit.filter(m => m.side === side);
  if (hit.length === 1) return hit[0];
  let s = bySur[bare] || bySur[n] || [];
  if (s.length > 1 && side) s = s.filter(m => m.side === side);
  if (s.length === 1) return s[0];
  /* the final word, which is how a shown name usually differs */
  const last = bare.split(" ").slice(-1)[0];
  let l = bySur[last] || [];
  if (l.length > 1 && side) l = l.filter(m => m.side === side);
  if (l.length === 1) return l[0];
  /* AN ARTICLE TITLE IS OFTEN LONGER THAN THE SHIRT. "Luis Marín Murillo"
     against a deck that holds "Luis Marín", or the other way round. Accepted
     only when exactly one man in the tournament fits, because a loose match
     that picks the wrong man is worse than no match at all. */
  let pre = men.filter(m => {
    const f = norm(m.p.full);
    return f && bare && (f.indexOf(bare + " ") === 0 || bare.indexOf(f + " ") === 0);
  });
  if (pre.length > 1 && side) pre = pre.filter(m => m.side === side);
  if (pre.length === 1) return pre[0];
  missed.push(name + (side ? " [" + side + "]" : ""));
  return null;
}

/* ---------- counters, hung on the deck man himself ---------- */
for (const m of men) { m.g = 0; m.og = 0; m.y = 0; m.r = 0; m.app = 0; m.cap = false; }

/* HOW MANY GOALS ARE IN ONE {{goal|...}}. Minute, note, minute, note, so only
   the numeric tokens count, and an o.g. note disowns the one before it. */
function goalsIn(tpl) {
  /* the wrapper first, or the last token is "o.g.}}" and never matches */
  const parts = tpl.replace(/^\{\{/, "").replace(/\}\}$/, "").split("|").slice(1);
  let n = 0, own = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (!/^\d+/.test(p)) continue;
    const note = (parts[i + 1] || "").trim().toLowerCase();
    if (/^o\.?\s*g\.?$/.test(note) || note === "og") own++;
    else n++;
  }
  return { n: n, own: own };
}

(async () => {
  console.log("reading " + PAGES.length + " match pages for " + YEAR + "...");
  let text = "";
  for (const p of PAGES) { text += "\n" + await wikitext(p); }
  console.log("  " + Math.round(text.length / 1024) + "KB of wikitext");

  /* ---------- goals ---------- */
  /* a scorer line looks like:  *[[Lukas Podolski]] {{goal|4|71}}  */
  let goalEvents = 0, ownEvents = 0;
  for (const m of text.matchAll(/^\s*\*+\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*(\{\{\s*goal\s*\|[^}]*\}\})/gm)) {
    const { n, own } = goalsIn(m[2]);
    goalEvents += n; ownEvents += own;
    const man = find(m[1]);
    if (man) { man.g += n; man.og += own; }
  }
  console.log("goals: " + goalEvents + " credited, " + ownEvents + " own goals" +
    (PUBLISHED ? "   (the tournament had " + PUBLISHED.goals + " in all)" : ""));

  /* ---------- cards and appearances, off the line-up tables ---------- */
  /* a line-up row:  |CM ||'''6''' ||[[Danny Fonseca]] || || {{yel|30}}  */
  let yel = 0, red = 0, rows = 0;
  for (const m of text.matchAll(/^\|\s*[A-Z]{2,3}\s*\|\|[^\n]*?\[\[([^\]|]+)(?:\|[^\]]*)?\]\]([^\n]*)$/gm)) {
    const man = find(m[1]);
    rows++;
    if (!man) continue;
    man.app += 1;
    const rest = m[2] || "";
    const ys = (rest.match(/\{\{\s*yel\b/gi) || []).length;
    const rs = (rest.match(/\{\{\s*(sent off|red|yel-red|dismissed)\b/gi) || []).length;
    man.y += ys; man.r += rs; yel += ys; red += rs;
  }
  console.log("line-up rows: " + rows + ", yellows " + yel + ", reds " + red +
    (PUBLISHED ? "   (the tournament had " + PUBLISHED.yellows + " and " + PUBLISHED.reds + ")" : ""));

  /* ---------- the armband, off the squads page ---------- */
  const sq = await wikitext(SQUADS);
  let caps = 0;
  /* TWO SPELLINGS OF THE ARMBAND. 2006 puts the link after the name and 2022
     gives it a field of its own, and both articles carry exactly thirty-two,
     so finding none is a parser problem rather than a tournament without
     captains. */
  const capRx = [
    /name\s*=\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]\s*\(\s*\[\[Captain/g,
    /name\s*=\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\][^\n}]*?\bother\s*=\s*\[\[Captain/g,
  ];
  const seenCap = new Set();
  for (const rx of capRx)
    for (const m of sq.matchAll(rx)) {
      const man = find(m[1]);
      if (man && !seenCap.has(man)) { man.cap = true; seenCap.add(man); caps++; }
    }
  console.log("captains: " + caps + "/32");

  if (missed.length) {
    const uniq = [...new Set(missed)];
    console.log("\nnames the deck does not know (" + uniq.length + "): " + uniq.slice(0, 14).join(", "));
  } else {
    console.log("\nevery name in the match reports found its man.");
  }
  /* AN ALIAS THAT MATCHES NOTHING IS FOLKLORE, the same rule the league
     harvest learned. If Wikipedia settles on one spelling, the entry should
     go rather than sit here teaching the next reader something untrue. */
  const stale = Object.keys(ALIAS).filter(k => text.indexOf(k) < 0 && sq.indexOf(k) < 0);
  if (stale.length) console.log("STALE ALIASES, no longer in the source: " + stale.join(", "));

  /* ================================================================
     TRAITS: what each man is ELIGIBLE for
     ================================================================
     Eligibility is read off the whole twenty-three rather than the eleven,
     because seven of the shipped XIs contain nobody who scored and a manager
     with budget he cannot spend has been handed a broken screen. Only one
     squad in the tournament, Trinidad and Tobago, has no scorer at all across
     all twenty-three, and that is why Enforcer exists: every single side has
     somebody who was booked. */
  /* EVERY SPELLING OF A FORWARD. A squad list says FW and a match report says
     CF, ST, LW, RW, SS, LF or RF, and after the real elevens landed the second
     kind is what most of these men carry. */
  const UP_TOP = ["FW", "CF", "ST", "SS", "LW", "RW", "LF", "RF"];
  const isFwd = m => UP_TOP.indexOf(m.p.pos) > -1;
  const TRAITS = {
    finisher:  {cost: 2, eligible: m => m.g >= 2,
                says: "His shot comes off a tier cheaper."},
    poacher:   {cost: 2, eligible: m => isFwd(m) && m.g >= 1,
                says: "Route one to him is Extreme, not BALL."},
    captain:   {cost: 2, eligible: m => m.cap,
                says: "Every ball he plays is a tier cheaper."},
    enforcer:  {cost: 1, eligible: m => m.y >= 2 || m.r >= 1,
                says: "His tackle is a tier cheaper, until he is booked."},
    keeper:    {cost: 1, eligible: m => m.p.pos === "GK" && m.app >= 1,   // GK is GK everywhere
                says: "His save is a tier cheaper."},
  };
  for (const m of men) {
    m.tr = Object.keys(TRAITS).filter(k => TRAITS[k].eligible(m));
  }

  console.log("\nELIGIBILITY");
  for (const k of Object.keys(TRAITS))
    console.log("  " + k.padEnd(10) + men.filter(m => m.tr.indexOf(k) > -1).length + " men");

  /* CAN EVERY SIDE SPEND ITS BUDGET? The question the whole design turns on.
     A side that cannot field a single trait has a screen with nothing on it. */
  const bad = [];
  for (const side of Object.keys(sides)) {
    const ours = men.filter(m => m.side === side);
    const any = ours.filter(m => m.tr.length);
    const cheapest = Math.min(...any.map(m => Math.min(...m.tr.map(k => TRAITS[k].cost))), 99);
    if (!any.length || cheapest > 3) bad.push(side + " (" + any.length + " eligible)");
  }
  console.log("\n  sides with nothing to spend a budget on: " + (bad.length ? bad.join(", ") : "none"));
  const thin = Object.keys(sides).map(side => ({
    side: side, n: men.filter(m => m.side === side && m.tr.length).length,
  })).sort((a, b) => a.n - b.n).slice(0, 5);
  console.log("  thinnest squads: " + thin.map(t => t.side + " " + t.n).join(", "));

  if (WHO) {
    console.log("");
    for (const m of men.filter(x => norm(x.p.full).indexOf(norm(WHO)) > -1 || norm(x.p.n) === norm(WHO)))
      console.log("  " + m.p.full.padEnd(26) + m.side.padEnd(16) +
        "goals " + m.g + (m.og ? " (+" + m.og + " o.g.)" : "") +
        "  yellow " + m.y + "  red " + m.r + "  apps " + m.app + (m.cap ? "  (c)" : "") +
        "   -> " + (m.tr.join(", ") || "nothing"));
  }

  console.log("\nthe top of each list, to read once and believe:");
  const top = (label, f) => console.log("  " + label.padEnd(10) +
    men.slice().sort((a, b) => f(b) - f(a)).slice(0, 6).map(m => m.p.n + " " + f(m)).join(", "));
  top("goals", m => m.g);
  top("yellows", m => m.y);
  top("apps", m => m.app);

  if (!WRITE) { console.log("\ndry run, add --write to stamp it onto the deck"); return; }

  for (const m of men) {
    const p = m.p;
    if (m.g) p.g = m.g; else delete p.g;
    if (m.y) p.y = m.y; else delete p.y;
    if (m.r) p.r = m.r; else delete p.r;
    if (m.app) p.app = m.app; else delete p.app;
    if (m.cap) p.cap = 1; else delete p.cap;
    if (m.tr.length) p.tr = m.tr; else delete p.tr;
  }
  fs.writeFileSync(OUT, JSON.stringify(sides));
  console.log("\nwrote " + path.relative(REPO, OUT) + "  (" +
    (fs.statSync(OUT).size / 1024).toFixed(1) + " KB)");
})().catch(e => { console.error(e); process.exit(1); });
