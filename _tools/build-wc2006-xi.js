#!/usr/bin/env node
/* THE ELEVEN WHO ACTUALLY STARTED.
 *
 *     node _tools/build-wc2006-xi.js              dry run, read the elevens
 *     node _tools/build-wc2006-xi.js --write      stamp them onto the deck
 *     node _tools/build-wc2006-xi.js --who Italy
 *
 * There is no starting eleven in a squad list, so build-wc2006.js picked one
 * by shirt number within position and said so in its own comment. That is a
 * reasonable eleven and it is not anybody's eleven. It puts Robben on the
 * Dutch bench and Landzaat in the side, and it has Zaccardo at right-back for
 * the Italy that won the thing. Anyone who watched the tournament sees it in
 * ten seconds, which makes it exactly the sort of quietly-wrong data this repo
 * exists to avoid.
 *
 * THE RULE: the eleven who started that team's LAST match at the tournament.
 * The final for the two who got there, the exit for everyone else. It is the
 * eleven people remember, it is one table per match on Wikipedia in the same
 * template every tournament has used for decades, and it comes with the real
 * positions and a real shape.
 *
 * POSITIONS COME FROM THE LINE-UP, NOT THE SQUAD LIST. A man listed as a
 * midfielder who started at right-back started at right-back. That is the
 * whole point of reading the match report rather than the squad.
 *
 * AND THEN THE HARD PART. The shapes index the eleven in a fixed order: slot 0
 * is the keeper, 1 and 2 the centre-backs, 3 and 4 the wide defenders, 5 the
 * holding midfielder, 6 and 7 the two in front of him, 8 to 10 the front line.
 * A real line-up is not in that order and sometimes does not fit it at all: a
 * back three has no wide defenders and a 4-4-2 has no ten. So the mapping is
 * done here, once, by preference, and every team where it had to make a
 * judgement is PRINTED rather than silently accepted. A wrong mapping is a
 * keeper on the wing, which is the bug the position sort was written to stop.
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
const UA = "ball2-xi/1.0 (personal quiz project)";
const WRITE = process.argv.includes("--write");
const WHO = (i => i > -1 ? process.argv[i + 1] : null)(process.argv.indexOf("--who"));

/* THE FINAL ALWAYS HAS ITS OWN ARTICLE and the knockout page never carries it.
   Without it Italy's last match in 2006 is the semi-final against Germany,
   which is the one side in that tournament where being a game out is most
   obvious: no Materazzi sending-off, no Grosso penalty, the wrong eleven for
   the team that won it.

   EXTRAS are the matches famous enough to have been given their own page too,
   which likewise leaves them off the knockout article. One per tournament at
   most, and a missing one shows up as a side whose last match is too early. */
const EXTRAS = {
  "2006": ["Battle of Nuremberg (2006 FIFA World Cup)"],
};
const PAGES = "ABCDEFGH".split("").map(g => YEAR + " FIFA World Cup Group " + g)
  .concat([YEAR + " FIFA World Cup knockout stage", YEAR + " FIFA World Cup final"])
  .concat(EXTRAS[YEAR] || []);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = x => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
/* A TEAM NAME ENDS WHERE ITS FOOTNOTE BEGINS. Group A hangs two citations off
   every kit title and the final wraps its titles in nowrap, which between them
   cost four teams their line-up and moved Italy's last match to the semi. Cut
   the footnote first, unwrap second: a nowrap can contain a ref, not the
   reverse. */
const tidy = x => String(x || "")
  .split(/<ref/)[0]
  /* AND ANY OTHER TAG. 2022 wraps every kit title in a nowrap span, which is
     invisible on the page and is six unknown teams to a parser. */
  .replace(/<[^>]*>/g, "")
  .replace(/\{\{\s*nowrap\s*\|/gi, "")
  .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
  .replace(/\[\[|\]\]|\}\}|'''/g, "")
  .replace(/\s+/g, " ")
  .trim();

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

/* the deck, and the men in it, so a line-up name can be tied to a squad man */
const sides = JSON.parse(fs.readFileSync(OUT, "utf8"));
/* THE SAME ALIASES THE TOURNAMENT HARVEST NEEDS, for the same reason: the
   squad page and the match reports transliterate differently. */
const ALIAS = {
  "Anatoliy Tymoschuk": "Anatoliy Tymoshchuk",
  "Andriy Nesmachnyi": "Andriy Nesmachniy",
  "Abdulaziz Khathran": "Abdulaziz Al-Khathran",
  "Jorge Martín Núñez": "Jorge Núñez",
  "Julio Ricardo Cruz": "Julio Cruz",
  "Luís Manuel Ferreira Delgado": "Delgado",
};
/* COUNTRY NAMES DIFFER between the kit titles and the deck keys. Checked one
   at a time against the deck rather than guessed. */
const SIDE_ALIAS = {
  "Korea Republic": "South Korea", "IR Iran": "Iran", "Côte d'Ivoire": "Ivory Coast",
  "Serbia & Montenegro": "Serbia and Montenegro", "USA": "United States",
  "Trinidad & Tobago": "Trinidad and Tobago", "Czechia": "Czech Republic",
};

function manIn(side, name) {
  const t = sides[side];
  if (!t) return null;
  let raw = String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (ALIAS[raw]) raw = ALIAS[raw];
  const n = norm(raw);
  const all = [...(t.xi || []), ...(t.bench || [])];
  let hit = all.filter(m => norm(m.full) === n);
  if (hit.length === 1) return hit[0];
  hit = all.filter(m => norm(m.n) === n);
  if (hit.length === 1) return hit[0];
  const last = n.split(" ").slice(-1)[0];
  hit = all.filter(m => norm(m.n) === last);
  if (hit.length === 1) return hit[0];
  hit = all.filter(m => norm(m.full).indexOf(n + " ") === 0 || n.indexOf(norm(m.full) + " ") === 0);
  if (hit.length === 1) return hit[0];
  return null;
}

/* ---------- the app's eleven slots, and what each one wants ----------
   In order of preference, most specific first. The last resort on every slot
   is "anybody left", which is what makes a back three or a 4-4-2 fit at all,
   and every time it is reached the team is flagged. */
const SLOTS = [
  { n: "GK",  want: ["GK"] },
  { n: "CB",  want: ["CB", "SW", "DF"] },
  { n: "CB",  want: ["CB", "SW", "DF"] },
  { n: "LB",  want: ["LB", "LWB", "LM", "CB"] },
  { n: "RB",  want: ["RB", "RWB", "RM", "CB"] },
  { n: "DM",  want: ["DM", "CM", "MF"] },
  { n: "CM",  want: ["CM", "DM", "MF"] },
  { n: "AM",  want: ["AM", "CM", "SS", "MF"] },
  { n: "LW",  want: ["LW", "LM", "LF", "SS"] },
  { n: "ST",  want: ["CF", "ST", "FW", "SS"] },
  { n: "RW",  want: ["RW", "RM", "RF", "SS"] },
];

/* Order a real line-up into the app's slots, and say where it had to guess. */
function fit(lineup) {
  const pool = lineup.slice();
  const out = [], notes = [];
  for (const slot of SLOTS) {
    let at = -1;
    for (const w of slot.want) { at = pool.findIndex(p => p.pos === w); if (at > -1) break; }
    if (at < 0) {
      at = 0;
      if (pool.length) notes.push(slot.n + " filled by a " + pool[0].pos);
    }
    out.push(pool.splice(at, 1)[0] || null);
  }
  return { xi: out, notes: notes };
}

/* what shape a line-up actually was, for the record and for the shape picker */
function shapeOf(lineup) {
  const c = p => lineup.filter(x => x.pos === p).length;
  const def = c("CB") + c("SW") + c("LB") + c("RB") + c("LWB") + c("RWB") + c("DF");
  const fwd = c("CF") + c("ST") + c("FW") + c("LF") + c("RF");
  const mid = 10 - def - fwd;
  return def + "-" + mid + "-" + fwd;
}

(async () => {
  console.log("reading " + PAGES.length + " match pages for " + YEAR + "...");
  let text = "";
  for (const p of PAGES) text += "\n" + await wikitext(p);
  console.log("  " + Math.round(text.length / 1024) + "KB\n");

  /* ---------- every match, in order ---------- */
  const kits = [...text.matchAll(/\{\{\s*Football kit/gi)].map(m => m.index);
  console.log("kit blocks found: " + kits.length + "  (two a match, so " + (kits.length / 2) + " matches)");
  /* every date on every page, found once rather than once a match */
  const allDates = [...text.matchAll(/\{\{\s*[Ss]tart date\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/g)]
    .map(m => ({ at: m.index,
      when: m[1] + "-" + String(m[2]).padStart(2, "0") + "-" + String(m[3]).padStart(2, "0") }));
  console.log("dates found: " + allDates.length + "  (one a match)");
  const badSplit = [];
  const matches = [];
  for (let i = 0; i + 1 < kits.length; i += 2) {
    const seg = text.slice(kits[i], kits[i + 2] === undefined ? text.length : kits[i + 2]);
    /* the two sides, off the kit blocks themselves rather than off any
       "title=" in the section, because the citations carry titles too */
    const names = [];
    for (const k of [kits[i], kits[i + 1]]) {
      /* 2600 rather than 900: a title with two citations hanging off it is
         longer than a whole kit block without them. */
      const block = text.slice(k, k + 2600);
      const m = block.match(/\|\s*title\s*=\s*([\s\S]*?)(?:\n\s*\}\}|\n\s*\|)/);
      names.push(m ? tidy(m[1]) : null);
    }
    if (!names[0] || !names[1]) continue;
    /* THE DATE, exactly: the last one declared before this match's kits. A
       fixed lookback window landed inside the previous match on the knockout
       pages, which put Italy out at the semi-final. */
    const d = allDates.filter(x => x.at < kits[i]).pop();
    const when = d ? d.when : "0000-00-00";

    /* EACH SIDE'S TABLE ENDS WITH A MANAGER ROW, twice a match and never more,
       and that is the one thing every spelling of this table agrees on. Within
       each half the first eleven rows are the eleven who started, whatever is
       listed under them: some tables carry substitutes who never came on, which
       is what broke counting to twenty-two. */
    const halves = seg.split(/Manager:/);
    if (halves.length < 3) continue;
    const rowsIn = t => {
      const out = [];
      for (const m of t.matchAll(/^\|\s*([A-Z]{2,3})\s*\|\|\s*'''(\d+)'''\s*\|\|\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/gm))
        out.push({ pos: m[1], no: parseInt(m[2], 10), name: m[3] });
      return out;
    };
    const a = rowsIn(halves[0]).slice(0, 11), b = rowsIn(halves[1]).slice(0, 11);
    if (a.length !== 11 || b.length !== 11) { badSplit.push(names[0] + " v " + names[1]); continue; }
    /* BOTH ELEVENS BEGIN WITH A GOALKEEPER. A free check that the split landed
       where it should, and the only way this can go wrong silently. */
    if (a[0].pos !== "GK" || b[0].pos !== "GK") { badSplit.push(names[0] + " v " + names[1]); continue; }
    matches.push({ when: when, sides: [
      { name: names[0], line: a },
      { name: names[1], line: b },
    ]});
  }
  console.log("matches parsed: " + matches.length + " of " + (kits.length / 2));
  if (badSplit.length) console.log("  the eleven-eleven split did not land: " + badSplit.join(", "));

  /* ---------- each team's LAST match ---------- */
  /* EVERY MATCH A SIDE PLAYED, newest first. Only the last one is wanted, but
     two line-ups name a man his own squad page does not list, and walking back
     one match is worth far more than falling back to a sorted squad list. */
  const played = {};
  let unknownSide = new Set();
  for (const m of matches) {
    for (const s of m.sides) {
      const side = SIDE_ALIAS[s.name] || s.name;
      if (!sides[side]) { unknownSide.add(s.name); continue; }
      if (s.line.length !== 11) continue;
      (played[side] = played[side] || []).push(
        { when: m.when, line: s.line, against: m.sides.filter(x => x !== s)[0].name });
    }
  }
  const last = {};
  for (const side of Object.keys(played)) {
    played[side].sort((a, b) => (a.when < b.when ? 1 : -1));
    last[side] = played[side][0];
  }
  if (unknownSide.size)
    console.log("kit titles the deck does not know: " + [...unknownSide].join(", "));
  console.log("teams with a last match: " + Object.keys(last).length + "/" + Object.keys(sides).length);
  const missing = Object.keys(sides).filter(s => !last[s]);
  if (missing.length) console.log("  NO LINE-UP FOUND: " + missing.join(", "));

  /* ---------- tie every name to a squad man ---------- */
  let lost = [];
  const built = {}, walked = [];
  for (const side of Object.keys(played)) {
    for (const info of played[side]) {
      const men = [];
      let missed = null;
      for (const row of info.line) {
        const m = manIn(side, row.name);
        if (!m) { missed = row.name; break; }
        /* THE POSITION HE PLAYED THAT DAY, not the one the squad list gave him */
        men.push({ n: m.n, full: m.full, no: m.no, pos: row.pos, lg: m.lg, tr: m.tr,
                   g: m.g, y: m.y, r: m.r, app: m.app, cap: m.cap });
      }
      if (men.length !== 11) {
        if (info === played[side][0]) lost.push(side + ": " + missed);
        continue;                       // try the match before it
      }
      if (info !== played[side][0]) walked.push(side + " (back to " + info.when + ")");
      const f = fit(men);
      built[side] = { xi: f.xi, notes: f.notes, when: info.when, against: info.against,
                      shape: shapeOf(men) };
      break;
    }
  }
  if (walked.length) console.log("walked back a match to get a complete eleven: " + walked.join(", "));
  if (lost.length) console.log("\nnames in a line-up the squad does not have (" + lost.length + "): " +
    lost.slice(0, 10).join(", "));
  console.log("teams with a complete real eleven: " + Object.keys(built).length);

  /* ---------- what changed, and where it had to guess ---------- */
  console.log("\nWHAT THE SHIRT-NUMBER GUESS GOT WRONG");
  let changed = 0, totalOut = 0;
  for (const [side, b] of Object.entries(built)) {
    const had = new Set((sides[side].xi || []).map(m => m.full));
    const now = b.xi.map(m => m.full);
    const out = [...had].filter(f => now.indexOf(f) < 0);
    const inn = now.filter(f => !had.has(f));
    if (!out.length) continue;
    changed++; totalOut += out.length;
    if (out.length >= 4 || WHO)
      console.log("  " + side.padEnd(22) + out.length + " wrong: out " + out.map(x => x.split(" ").pop()).join(", ") +
        "  in " + inn.map(x => x.split(" ").pop()).join(", "));
  }
  console.log("  " + changed + " of " + Object.keys(built).length + " sides changed, " +
    totalOut + " men in all (showing the four-plus)");

  const guessed = Object.entries(built).filter(([, b]) => b.notes.length);
  console.log("\nSIDES WHERE THE SLOT MAPPING HAD TO JUDGE (" + guessed.length + ")");
  for (const [side, b] of guessed)
    console.log("  " + side.padEnd(22) + b.shape.padEnd(8) + b.notes.join("; "));

  if (WHO) {
    const b = built[WHO];
    console.log("\n" + WHO + (b ? "  " + b.shape + ", last played " + b.when + " against " + b.against : " has no eleven"));
    if (b) b.xi.forEach((m, i) => console.log("  " + String(i).padStart(2) + "  " +
      SLOTS[i].n.padEnd(4) + (m.pos + "").padEnd(4) + "#" + String(m.no).padEnd(3) + m.full));
  }

  if (!WRITE) { console.log("\ndry run, add --write to stamp the real elevens onto the deck"); return; }

  for (const [side, b] of Object.entries(built)) {
    const t = sides[side];
    const wasAll = [...(t.xi || []), ...(t.bench || [])];
    const inXi = new Set(b.xi.map(m => m.full));
    t.xi = b.xi;
    /* THE BENCH IS THE REST OF THE TWENTY-THREE, and it has to be exactly that:
       a man in both lists would be two men, and h2Bench indexes into it. */
    t.bench = wasAll.filter(m => !inXi.has(m.full));
    t.xiWhen = b.when;
    t.xiVs = b.against;
    t.xiShape = b.shape;
  }
  /* NO MARKER KEY ON THE POOL. sides is a map of country to squad and the
     app iterates it; a rule name sitting in there is a thirty-third team. The
     per-team xiWhen and xiVs already say what the rule was, one team at a
     time, which is more useful anyway. */
  fs.writeFileSync(OUT, JSON.stringify(sides));
  console.log("\nwrote " + path.relative(REPO, OUT) + "  (" +
    (fs.statSync(OUT).size / 1024).toFixed(1) + " KB)");
})().catch(e => { console.error(e); process.exit(1); });
