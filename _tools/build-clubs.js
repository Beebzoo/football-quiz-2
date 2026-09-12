/* The clubs you can play AS in a league's football game.
 *
 *     node _tools/build-clubs.js [league...] [--dry] [--force]
 *
 * One file per league: assets/<dir>/clubs.json, shaped exactly like the 2006
 * World Cup deck build-wc2006.js writes, so h2Squad cannot tell them apart.
 *
 * WHY IT IS HARVESTED AND NOT TYPED. Six leagues is a hundred and twelve clubs
 * and well over twelve hundred players in the elevens alone, and this repo has
 * learned more than once that a name typed from memory is a name that is
 * quietly wrong. Everything here comes off Wikipedia, where every club article
 * carries its first team in one machine-readable template per man:
 *
 *   {{Fs player|no=1|pos=GK|nat=GER|name=[[Marc-Andre ter Stegen]]}}
 *
 * WHICH CLUBS. Getting the list of clubs right turned out to be the hard part,
 * and three plausible sources all lied in different ways:
 *
 *   - Wikidata P118 returns every club that was EVER in the league, because
 *     the property sits on the club and editors do not always close the old
 *     statement. Filtering to statements with no end date helps and is still
 *     not the current table. It also matches players and seasons, so an
 *     unfiltered query came back with two and a half thousand rows, most of
 *     them footballers.
 *   - The season article's standings template is authoritative when it is
 *     there, and the Bundesliga keeps its table in a SEPARATE transcluded
 *     template, so the article itself parses to zero teams.
 *   - That separate template, fetched directly, came back missing two clubs
 *     the same article's own location map listed.
 *
 * So nothing here trusts one source. Candidates are pooled from all of them,
 * and then every candidate has to EARN its place by having a first-team squad
 * on its own article. That check is not extra work, it is the work: the squad
 * has to be fetched anyway, and a candidate that is not a club (the Premier
 * League map labels the city of London exactly the way it labels Aston Villa)
 * simply has no squad and falls out. The count is then reported against what
 * the league is supposed to have, and a mismatch refuses to write.
 *
 * WHICH ELEVEN. A squad list is not a team sheet, so there is no starting XI
 * in the data to read. Players are picked by SHIRT NUMBER within each
 * position, lowest first, which is deterministic and checkable and is the same
 * rule build-wc2006.js uses. It is not a claim about who started on Saturday.
 * Shape is 1 GK, 4 DF, 3 MF, 3 FW, which is what the pitch wants.
 *
 * THE BENCH is kept too, twelve more by the same rule, because a substitution
 * that says "Sneijder replaces Landzaat" needs a Sneijder to name.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO = path.join(__dirname, "..");
const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");
const UA = "BALL-quiz-build/1.0 (personal project; contact via repo owner)";

/* The season is resolved at run time rather than pinned, so this keeps working
   next August without an edit. Both the current and the previous season are
   tried: in July the new article exists but is empty, in May the old one is
   the only one that is right. */
const now = new Date();
const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
const season = y => y + "–" + String(y + 1).slice(2);   // en dash, as Wikipedia writes it

const LEAGUES = {
  premier:    {dir: "premier",    league: "Premier League",     qid: "Q9448",   teams: 20, label: "Premier League"},
  laliga:     {dir: "laliga",     league: "La Liga",            qid: "Q324867", teams: 20, label: "La Liga"},
  bundesliga: {dir: "bundesliga", league: "Bundesliga",         qid: "Q82595",  teams: 18, label: "Bundesliga"},
  seriea:     {dir: "seriea",     league: "Serie A",            qid: "Q15804",  teams: 20, label: "Serie A"},
  belgian:    {dir: "belgian",    league: "Belgian Pro League", qid: "Q216022", teams: 16, label: "Belgian Pro League"},
  ere:        {dir: "eredivisie", league: "Eredivisie",         qid: "Q167541", teams: 18, label: "Eredivisie"},
};

/* ---------- being polite to Wikipedia ----------
   The same lesson build-wc2006.js records: the damage from being throttled is
   not a crash, it is a build that "succeeds" and writes a deck full of nulls. */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const once = (url, headers) => new Promise((res, rej) => {
  https.get(url, {headers: Object.assign({"User-Agent": UA}, headers || {})}, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(once(r.headers.location, headers));
    if (r.statusCode !== 200) {
      r.resume();
      const e = new Error("HTTP " + r.statusCode);
      e.status = r.statusCode;
      return rej(e);
    }
    let b = "";
    r.setEncoding("utf8");
    r.on("data", d => b += d);
    r.on("end", () => res(b));
  }).on("error", rej);
});
/* ONE REQUEST PER CLUB GOT THIS THROTTLED INTO USELESSNESS.
   At 170ms apart, fetching a season article and then eighteen club articles
   drew 429s on almost every call, and the damage was not a crash: the retries
   fell through to the fallbacks and the build reported eleven clubs out of
   eighteen as though that were a result. So two things changed. The gap is
   most of a second, and the club articles are fetched in BATCHES: the API
   takes up to fifty titles in one query, so a whole league is one request
   rather than twenty. Six leagues now cost about thirty requests in total. */
let lastCall = 0;
const GAP = 900;
async function get(url, tries, headers) {
  tries = tries || 4;
  for (let i = 0; i < tries; i++) {
    const wait = GAP - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      return await once(url, headers);
    } catch (e) {
      const retryable = e.status === 429 || e.status >= 500 || !e.status;
      if (!retryable || i === tries - 1) throw e;
      const back = 1200 * Math.pow(2, i);
      console.log("      " + (e.status || e.message) + ", waiting " + (back / 1000) + "s");
      await sleep(back);
    }
  }
}
const API = "https://en.wikipedia.org/w/api.php?action=parse&prop=wikitext&format=json&formatversion=2&redirects=1&page=";
async function wikitext(page) {
  try {
    const j = JSON.parse(await get(API + encodeURIComponent(page)));
    if (j.error) return null;
    return j.parse.wikitext;
  } catch (e) {
    return null;
  }
}
/* Many articles, few requests. Returns a Map keyed by the title that was ASKED
   FOR, not the one that came back: "Feyenoord" redirects to "Feyenoord
   Rotterdam" and the caller is holding the former. normalized and redirects
   are both followed so nothing is silently dropped. */
const QAPI = "https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main" +
             "&format=json&formatversion=2&redirects=1&titles=";
async function wikitexts(titles) {
  const out = new Map();
  const BATCH = 12;
  for (let i = 0; i < titles.length; i += BATCH) {
    const slice = titles.slice(i, i + BATCH);
    let j;
    try { j = JSON.parse(await get(QAPI + encodeURIComponent(slice.join("|")))); }
    catch (e) { console.log("      batch failed (" + e.message + "), " + slice.length + " clubs skipped"); continue; }
    const q = (j && j.query) || {};
    /* asked-for title -> the title the content actually came back under */
    const alias = new Map();
    (q.normalized || []).forEach(n => alias.set(n.from, n.to));
    (q.redirects || []).forEach(r => {
      for (const [from, to] of alias) if (to === r.from) alias.set(from, r.to);
      alias.set(r.from, r.to);
    });
    const byTitle = new Map();
    (q.pages || []).forEach(p => {
      const c = p.revisions && p.revisions[0] && p.revisions[0].slots && p.revisions[0].slots.main;
      if (c && c.content) byTitle.set(p.title, c.content);
    });
    slice.forEach(t => {
      const real = alias.get(t) || t;
      const hit = byTitle.get(real) || byTitle.get(t);
      if (hit) out.set(t, hit);
    });
    process.stdout.write("  [" + out.size + "/" + titles.length + "]");
  }
  return out;
}

/* ---------- wikitext helpers ---------- */
function unlink(t) {
  return String(t)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\{\{(?:nowrap|nobr|sortname)\|([^}]*)\}\}/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\(\s*c\s*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
/* the LINK TARGET, which is the article to fetch, not the display text */
function linkTarget(t) {
  const m = String(t).match(/\[\[([^\]|]+)/);
  return m ? m[1].trim() : null;
}
const PARTICLES = new Set(["van", "von", "de", "del", "della", "di", "da", "dos", "das", "du",
  "der", "den", "el", "al", "ter", "ten", "la", "le", "bin", "ibn", "mc", "op"]);
function shortName(full) {
  const parts = String(full).split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0];
  for (let i = 1; i < parts.length - 1; i++) {
    if (PARTICLES.has(parts[i].toLowerCase())) return parts.slice(i).join(" ");
  }
  return parts[parts.length - 1];
}
const SHAPE = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];

/* ---------- who is in the league ----------
   Everything that comes out of here is a GUESS. It is proved or dropped by
   whether its own article carries a first-team squad. */
async function candidates(row) {
  const found = new Map();             // page title -> display name
  const add = raw => {
    const page = linkTarget(raw);
    if (!page) return;
    if (/^(Football|Association football|List of|Category:|File:|Image:|:)/i.test(page)) return;
    if (!found.has(page)) found.set(page, unlink(raw));
  };
  const names = w => { for (const m of w.matchAll(/\|\s*name_[A-Za-z0-9]+\s*=\s*(.+)/g)) add(m[1]); };
  const maps = w => { for (const m of w.matchAll(/\{\{[Ll]ocation map~[^}]*?\|\s*label\s*=\s*([^|}]+)/g)) add(m[1]); };

  for (const y of [startYear, startYear - 1]) {
    const page = season(y) + " " + row.league;
    const w = await wikitext(page);
    if (!w) continue;
    console.log("    season article: " + page);
    names(w);
    maps(w);
    /* the Bundesliga keeps its table in a template of its own, and the article
       parses to zero teams without it */
    const t = await wikitext("Template:" + page + " table");
    if (t) {
      const before = found.size;
      names(t);
      if (found.size !== before) console.log("    +" + (found.size - before) + " from the table template");
    }
    /* the stadium table: the first cell of each row is the club */
    const si = w.search(/==+\s*Stadiums? and locations?\s*==+/i);
    if (si > 0) {
      for (const m of w.slice(si, si + 24000).matchAll(/^\|\s*(\[\[[^\]]+\]\])\s*$/gm)) add(m[1]);
    }
    if (found.size >= row.teams) break;
  }

  // Wikidata as a third opinion, never as the only one
  try {
    const q = "SELECT ?article WHERE { ?c p:P118 ?st . ?st ps:P118 wd:" + row.qid + " ." +
      " FILTER NOT EXISTS { ?st pq:P582 ?e } ?c wdt:P31/wdt:P279* wd:Q476028 ." +
      " ?article schema:about ?c ; schema:isPartOf <https://en.wikipedia.org/> . }";
    const j = JSON.parse(await get("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q),
      3, {Accept: "application/sparql-results+json"}));
    let n = 0;
    for (const b of j.results.bindings) {
      const page = decodeURIComponent(b.article.value.replace("https://en.wikipedia.org/wiki/", "")).replace(/_/g, " ");
      if (!found.has(page)) { found.set(page, page); n++; }
    }
    if (n) console.log("    +" + n + " Wikidata only (unproven until a squad is found)");
  } catch (e) {
    console.log("    Wikidata unavailable (" + e.message + "), carrying on with the article");
  }
  return found;
}

/* ---------- the squad ---------- */
function parseSquad(w) {
  /* Block 0 is the first team, every time: block 1 onward is the youth side,
     the reserves, or men out on loan, and a man out on loan is not in the
     side. Checked against Ajax, Arsenal, Bayern and Real Madrid, which have
     three or four blocks each. */
  const block = w.match(/\{\{[Ff]s start[\s\S]*?\{\{[Ff]s end\}\}/);
  if (!block) return [];
  const players = [];
  for (const m of block[0].matchAll(/\{\{\s*[Ff]s player\s*\|([\s\S]*?)\}\}/g)) {
    const f = {};
    /* Split on | at depth zero. BOTH kinds of bracket have to be counted: the
       obvious nested template, and name=[[Some Player]] ([[Captain|c]]) whose
       pipe lives inside [[...]]. Counting only braces cut every captain in
       half when build-wc2006.js first tried it. */
    let depth = 0, cur = "";
    for (const ch of m[1]) {
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") depth--;
      if (ch === "|" && depth === 0) {
        const e = cur.indexOf("=");
        if (e > 0) f[cur.slice(0, e).trim()] = cur.slice(e + 1);
        cur = "";
      } else cur += ch;
    }
    const e = cur.indexOf("=");
    if (e > 0) f[cur.slice(0, e).trim()] = cur.slice(e + 1);
    if (!f.name || !f.pos) continue;
    /* listed with the first team but away for the season is not available */
    if (/on loan (at|to)/i.test(f.other || "")) continue;
    players.push({
      no: parseInt(f.no, 10) || 99,
      pos: String(f.pos).trim().toUpperCase(),
      name: unlink(f.name),
      nat: String(f.nat || "").trim().toUpperCase(),
    });
  }
  return players;
}

function pickXI(players) {
  const by = p => players.filter(x => x.pos === p).sort((a, b) => a.no - b.no);
  const pools = {GK: by("GK"), DF: by("DF"), MF: by("MF"), FW: by("FW")};
  const used = new Set();
  const xi = [];
  for (const want of SHAPE) {
    let pick = pools[want] ? pools[want].find(p => !used.has(p)) : null;
    /* a squad short of forwards borrows from midfield rather than failing */
    if (!pick) pick = players.slice().sort((a, b) => a.no - b.no).find(p => !used.has(p));
    if (!pick) return null;
    used.add(pick);
    xi.push({n: shortName(pick.name), full: pick.name, no: pick.no, pos: pick.pos});
  }
  const bench = players.filter(p => !used.has(p)).sort((a, b) => a.no - b.no).slice(0, 12)
    .map(p => ({n: shortName(p.name), full: p.name, no: p.no, pos: p.pos}));
  return {xi: xi, bench: bench};
}

/* ---------- kit colour and crest ----------
   Both out of the app's own harvested banks rather than invented. kits carries
   1,021 sides with a slug and a first-shirt colour; logos is 2,894 crests
   already on disk and already shipping for Badge Zoom. A club that cannot be
   matched is REPORTED, never guessed at. */
function slugify(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
/* the noise that sits round a club's real name */
const AFFIX = /\b(f\.?c\.?|a\.?f\.?c\.?|s\.?c\.?|c\.?f\.?|v\.?v\.?|s\.?v\.?|k\.?v\.?|b\.?c\.?|a\.?c\.?|s\.?s\.?|u\.?s\.?|calcio|club|football|association)\b/gi;
function bare(s) {
  return String(s).replace(/\([^)]*\)/g, " ").replace(AFFIX, " ").replace(/\s+/g, " ").trim();
}

function buildMatchers() {
  const kits = JSON.parse(fs.readFileSync(path.join(REPO, "assets/kits/index.json"), "utf8"));
  const rows = Object.values(kits).flat();
  const byName = new Map();
  rows.forEach(k => {
    byName.set(slugify(k.n), k);
    byName.set(slugify(bare(k.n)), k);
    if (k.s) byName.set(k.s, k);
  });
  const logos = new Set(fs.readdirSync(path.join(REPO, "assets/logos"))
    .filter(f => f.endsWith(".png")).map(f => f.slice(0, -4)));
  return {byName: byName, logos: logos};
}

/* AAA for the scorebug. Clubs have no FIFA trigram the way countries do, so
   this is DERIVED and says so: the first three letters of the short name, and
   where two clubs in one league collide (Manchester United and Manchester City
   both give MAN) the initial of the first word plus two of the second, which
   is how a broadcast writes MUN and MCI anyway. */
function codes(names) {
  const out = {};
  const taken = new Map();
  const first = n => slugify(bare(n) || n).replace(/-/g, "").slice(0, 3).toUpperCase().padEnd(3, "X");
  names.forEach(n => { const c = first(n); taken.set(c, (taken.get(c) || 0) + 1); });
  names.forEach(n => {
    let c = first(n);
    if (taken.get(c) > 1) {
      const w = (bare(n) || n).split(/\s+/).filter(Boolean);
      if (w.length >= 2) c = (w[0][0] + w[1].slice(0, 2)).toUpperCase();
    }
    let c2 = c, i = 1;
    while (Object.values(out).indexOf(c2) !== -1) c2 = c.slice(0, 2) + String(++i);
    out[n] = c2;
  });
  return out;
}

(async () => {
  const want = Object.keys(LEAGUES).filter(k => process.argv.indexOf(k) !== -1);
  const todo = want.length ? want : Object.keys(LEAGUES);
  const m = buildMatchers();
  console.log("season: " + season(startYear) + "   leagues: " + todo.join(", ") + (DRY ? "   (dry)" : ""));

  for (const id of todo) {
    const row = LEAGUES[id];
    console.log("\n=== " + row.label + " ===");
    const cands = await candidates(row);
    console.log("    " + cands.size + " candidates, expecting " + row.teams + " real clubs");

    const clubs = {};
    const noKit = [], noCrest = [], thin = [];
    const pages = [...cands.keys()];
    const texts = await wikitexts(pages);
    console.log("");
    for (const [page, display] of cands) {
      const w = texts.get(page);
      if (!w) continue;
      const players = parseSquad(w);
      if (players.length < 14) continue;          // not a club, or not a squad
      const got = pickXI(players);
      if (!got) continue;
      /* the name under the crest: what the season table called it, tidied */
      const name = unlink(display).replace(/\s+/g, " ").trim() || page;
      const key = slugify(name), keyBare = slugify(bare(name));
      const hit = m.byName.get(key) || m.byName.get(keyBare) ||
                  m.byName.get(slugify(page)) || m.byName.get(slugify(bare(page)));
      let kit = hit ? hit.c : null;
      if (!kit) {
        const grab = k => {
          const g = w.match(new RegExp("\\|\\s*" + k + "\\s*=\\s*([A-Fa-f0-9]{6})"));
          return g ? "#" + g[1].toUpperCase() : null;
        };
        const body = grab("body1"), arm = grab("leftarm1");
        kit = (body === "#FFFFFF" && arm && arm !== "#FFFFFF") ? arm : body;
      }
      if (!kit) noKit.push(name);
      const crest = [hit && hit.s, key, keyBare, slugify(page), slugify(bare(page))]
        .find(s => s && m.logos.has(s)) || null;
      if (!crest) noCrest.push(name);
      if (players.length < 18) thin.push(name + " (" + players.length + ")");
      clubs[name] = {
        kit: kit, abbr: null, flag: crest, slug: crest,
        squad: players.length, xi: got.xi, bench: got.bench,
      };
      process.stdout.write(".");
    }
    console.log("");
    const names = Object.keys(clubs);
    const code = codes(names);
    names.forEach(n => clubs[n].abbr = code[n]);

    console.log("    clubs with an XI: " + names.length + " / " + row.teams);
    if (noKit.length) console.log("    NO KIT COLOUR (left null, not guessed): " + noKit.join(", "));
    if (noCrest.length) console.log("    NO CREST: " + noCrest.join(", "));
    if (thin.length) console.log("    thin squads: " + thin.join(", "));
    console.log("    codes: " + names.map(n => code[n]).join(" "));
    const sample = names[0];
    if (sample) {
      console.log("    sample, " + sample + ":");
      clubs[sample].xi.forEach((p, i) =>
        console.log("      " + SHAPE[i].padEnd(3) + " #" + String(p.no).padEnd(4) + p.n + "  (" + p.full + ")"));
      console.log("      bench: " + clubs[sample].bench.map(p => p.n).join(", "));
    }

    /* REFUSE TO WRITE A DECK THAT IS KNOWN TO BE WRONG, the same rule
       build-wc2006.js learned the hard way when a throttled run wrote a deck
       full of nulls and invented country codes and called itself a success. */
    const problems = [];
    if (names.length !== row.teams) problems.push("found " + names.length + " clubs, the league has " + row.teams);
    for (const n of names) {
      const v = clubs[n];
      if (!v.kit) problems.push(n + ": no kit colour");
      if (!v.xi || v.xi.length !== 11) problems.push(n + ": not eleven men");
      if (!/^[A-Z0-9]{3}$/.test(v.abbr || "")) problems.push(n + ": '" + v.abbr + "' is not a code");
    }
    if (DRY) {
      console.log("    --dry, nothing written" + (problems.length ? "  (" + problems.length + " problem(s))" : ""));
      problems.slice(0, 8).forEach(p => console.log("      " + p));
      continue;
    }
    if (problems.length && !FORCE) {
      console.log("    NOT WRITING. " + problems.length + " problem(s):");
      problems.slice(0, 10).forEach(p => console.log("      " + p));
      console.log("    Most likely a rate limit, or a season article mid-edit. --force writes it anyway.");
      process.exitCode = 1;
      continue;
    }
    const out = path.join(REPO, "assets", row.dir, "clubs.json");
    fs.mkdirSync(path.dirname(out), {recursive: true});
    fs.writeFileSync(out, JSON.stringify(clubs));
    console.log("    wrote " + path.relative(REPO, out) + "  (" + (fs.statSync(out).size / 1024).toFixed(1) + " KB)");
  }
})().catch(e => { console.error("FAILED: " + e.message); process.exit(1); });
