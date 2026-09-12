/* The league bank behind League Rush: name as many clubs as you can in 30s.

     node _tools/build-leagues.js            build it
     node _tools/build-leagues.js --dry      report only, write nothing

   WHERE THE TEAMS COME FROM. Not Wikidata: its season items are filled in at
   wildly different speeds and the newest Eredivisie season with a team list
   was 2020-21, which would have had the game asking for ADO Den Haag and
   VVV-Venlo in 2026. Wikipedia's current-season article is up to date the
   week the fixtures come out, and every one of them builds its table with the
   Sports table module, so `|name_AJA=[[AFC Ajax|Ajax]]` is a reliable handle
   on exactly the clubs playing this season.

   WHAT MAKES IT PLAYABLE. Typing. Nobody types "Brighton & Hove Albion F.C."
   with eleven seconds left, so every club carries a set of accepted answers:
   its Wikidata aliases (which is where Atleti, Spurs and Barça live), its
   short name, and the display name with the club-type noise stripped off.
   Matching is done on a normalised form, so accents and full stops cost
   nobody a point.

   SAFE TO RE-RUN. Rebuilt from scratch. Worth re-running each August when the
   promoted sides come up. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "assets", "leagues");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const DRY = process.argv.includes("--dry");
const WIKI = "https://en.wikipedia.org/w/api.php";

/* The table is Dutch and Spanish, so the Dutch and Spanish second tiers are
   in here next to the big five. MVV and Las Palmas have to be reachable. */
const LEAGUES = [
  { n: "Eredivisie", page: "Eredivisie", flag: "nl", size: 18 },
  { n: "Eerste Divisie", page: "Eerste Divisie", flag: "nl", size: 20 },
  { n: "Premier League", page: "Premier League", flag: "gb", size: 20 },
  { n: "Championship", page: "EFL Championship", flag: "gb", size: 24 },
  { n: "La Liga", page: "La Liga", flag: "es", size: 20 },
  { n: "Segunda División", page: "Segunda División", flag: "es", size: 22 },
  { n: "Serie A", page: "Serie A", flag: "it", size: 20 },
  { n: "Bundesliga", page: "Bundesliga", flag: "de", size: 18 },
  { n: "Ligue 1", page: "Ligue 1", flag: "fr", size: 18 },
  { n: "Primeira Liga", page: "Primeira Liga", flag: "pt", size: 18 },
  { n: "Belgian Pro League", page: "Belgian Pro League", flag: "be", size: 18 },
  { n: "Süper Lig", page: "Süper Lig", flag: "tr", size: 18 },
  { n: "Major League Soccer", page: "Major League Soccer season", flag: "us", size: 30 },
];

/* Seasons to try, newest first. August is the hinge: the new season's article
   exists and is the one people will be thinking of. */
const SEASONS = ["2026–27", "2025–26", "2026", "2025"];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error("HTTP " + res.status);
    } catch (e) { if (i === tries - 1) throw e; await sleep(1200 * (i + 1)); }
  }
}

/* A season article holds more than one Sports table: the league itself, then
   often a promotion play-off or a relegation group. Each block is read on its
   own and the biggest plausible one wins, which is why the first attempt at
   this returned 22 clubs for a 20-club Premier League. */
/* A Sports table block declares its running order with |team1=AJA |team2=PSV
   and then maps each code to a name with |name_AJA=. Reading the name_ lines
   alone over-counts, because a block can carry names for sides that are not
   in that table: it gave 22 for a 20-club Premier League and 23 for Serie A.
   The teamN= keys are the table, so they decide. */
/* A link target is a title, not prose: underscores are spaces, and anything
   still carrying template syntax is a parse that went wrong rather than a
   club. The first run put "{{nowrap" into the Premier League where Brighton
   should have been. */
function cleanTeam(t) {
  const s = String(t).replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return /[{}|[\]<>]/.test(s) || s.length < 3 ? null : s;
}

function teamsFrom(wikitext, want) {
  const blocks = wikitext.split(/\{\{\s*#invoke:\s*Sports table/i).slice(1);
  let best = [], bestRank = 0;
  for (const b of blocks) {
    const codes = [...b.matchAll(/\|\s*team(\d+)\s*=\s*([A-Za-z0-9]+)/g)]
      .sort((x, y) => Number(x[1]) - Number(y[1])).map(m => m[2]);
    const names = {};
    for (const m of b.matchAll(/\|\s*name_([A-Za-z0-9]+)\s*=\s*(?:\[\[([^\]|]+)(?:\|[^\]]*)?\]\]|([^\n|]+))/g))
      names[m[1]] = (m[2] || m[3] || "").trim();
    /* Only some tables declare their order with teamN=; the module also
       accepts an unordered form where the name_ lines are the whole story.
       Requiring the codes fixed the over-counting and promptly lost the
       Eredivisie, so it is used when it is there and ignored when it is not. */
    const teams = [...new Set((codes.length ? codes.map(c => names[c]) : Object.values(names))
      .map(cleanTeam).filter(Boolean))];
    if (teams.length < 14 || teams.length > 30) continue;
    /* A block that declares its running order is the league table itself and
       always wins. Without that there is no way to tell the league from a
       relegation group, so the FIRST plausible block is taken, which in a
       season article is the standings: taking the largest instead handed
       Serie A 23 clubs. */
    /* A season article carries several tables and nothing in the markup says
       which one is the league. The size does: it is a stable fact, so a block
       that matches it exactly wins outright. Without that, Serie A came back
       with 23 clubs and the Bundesliga with 16. */
    const ranked = (want && teams.length === want ? 4 : 0) + (codes.length ? 2 : 1);
    if (ranked > bestRank || (ranked === bestRank && teams.length > best.length)) {
      best = teams; bestRank = ranked;
    }
  }
  return best;
}

/* Third source, and the one that settles arguments. Every season article has
   a "Stadiums and locations" wikitable, one row per club actually playing.
   The league table is written by hand and drifts: the 2026-27 Serie A module
   carries 23 name_ lines for a 20-club league and the Bundesliga template
   only 16 for an 18-club one. The stadium table is a list of participants and
   nothing else, so where the counts disagree, this wins. */
function teamsFromStadiumTable(wikitext, want) {
  const tables = wikitext.split(/\{\|/).slice(1);
  let best = [];
  for (const t of tables) {
    if (!/!\s*(Team|Club)\b/i.test(t) || !/Stadium/i.test(t)) continue;
    const rows = t.split(/\n\|-/).slice(1);
    const names = [];
    for (const r of rows) {
      const m = r.match(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/);
      if (m) { const c = cleanTeam(m[1]); if (c) names.push(c); }
    }
    const uniq = [...new Set(names)];
    if (uniq.length >= 14 && uniq.length <= 32 && (!want || Math.abs(uniq.length - want) < Math.abs(best.length - want) || !best.length))
      best = uniq;
  }
  return best;
}

async function seasonTeams(page, want) {
  for (const s of SEASONS) {
    const title = `${s} ${page}`;
    try {
      const j = await getJSON(WIKI + "?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page="
        + encodeURIComponent(title));
      if (j.error) continue;
      const wt = j.parse.wikitext || "";
      let teams = teamsFrom(wt, want);
      /* La Liga, the Bundesliga, Ligue 1 and MLS keep their table on a
         separate template page and transclude it, so the season article
         itself has no Sports table in it at all. Follow the transclusion. */
      if (!teams.length) {
        const tpls = [...new Set([...wt.matchAll(/\{\{\s*([^{}\n]*?table)\s*(?:\|[^{}]*?)?\}\}/gi)]
          .map(m => m[1].trim())
          .filter(t => /\d/.test(t) && !/results/i.test(t)))];   // the standings, not the results grid
        const merged = new Set();
        for (const tpl of tpls.slice(0, 3)) {
          /* it is a template, so it lives in the Template: namespace */
          const t = await getJSON(WIKI + "?action=parse&format=json&formatversion=2&prop=wikitext&redirects=1&page="
            + encodeURIComponent(/^template:/i.test(tpl) ? tpl : "Template:" + tpl));
          if (!t.error) for (const team of teamsFrom(t.parse.wikitext || "", want)) merged.add(team);
          await sleep(200);
        }
        /* MLS splits into an Eastern and a Western table and both are the
           league, so the tables are merged rather than picked between. */
        if (merged.size >= 14 && merged.size <= 32) teams = [...merged];
      }
      /* where the league table disagrees with the size the league is known
         to be, the participants table decides */
      if (want && teams.length !== want) {
        const alt = teamsFromStadiumTable(wt, want);
        if (alt.length === want) teams = alt;
        else if (!teams.length && alt.length) teams = alt;
      }
      if (teams.length) return { season: s, title, teams };
    } catch (e) { /* try the season before */ }
    await sleep(200);
  }
  return null;
}

/* article titles -> wikidata ids -> the aliases people actually type */
async function aliases(titles) {
  const qid = {};
  for (let i = 0; i < titles.length; i += 40) {
    const batch = titles.slice(i, i + 40);
    const j = await getJSON(WIKI + "?action=query&format=json&formatversion=2&prop=pageprops&ppprop=wikibase_item"
      + "&redirects=1&titles=" + encodeURIComponent(batch.join("|")));
    const back = {};
    for (const r of (j.query && j.query.redirects) || []) back[r.to] = r.from;
    for (const r of (j.query && j.query.normalized) || []) back[r.to] = back[r.to] || r.from;
    for (const p of (j.query && j.query.pages) || []) {
      const id = p.pageprops && p.pageprops.wikibase_item;
      if (id) qid[back[p.title] || p.title] = id;
    }
    await sleep(200);
  }
  const out = {};
  const ids = [...new Set(Object.values(qid))];
  const byId = {};
  for (let i = 0; i < ids.length; i += 45) {
    const batch = ids.slice(i, i + 45);
    const j = await getJSON("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
      + "&props=labels|aliases|claims&languages=en&ids=" + batch.join("|"));
    for (const [id, e] of Object.entries(j.entities || {})) {
      const names = [];
      if (e.labels && e.labels.en) names.push(e.labels.en.value);
      for (const a of (e.aliases && e.aliases.en) || []) names.push(a.value);
      for (const c of (e.claims && e.claims.P1813) || [])       // short name
        if (c.mainsnak.datavalue) names.push(c.mainsnak.datavalue.value.text || c.mainsnak.datavalue.value);
      byId[id] = names;
    }
    await sleep(250);
  }
  for (const [title, id] of Object.entries(qid)) out[title] = byId[id] || [];
  return out;
}

/* the crest, so a named club can pop onto the board */
function slugFor(name, alts, logos, badgeNames) {
  /* Try the name, then the name with the club-type noise off, then every
     accepted alias. The aliases are what saves this: the badge library files
     Arsenal as "arsenal" and PSV as "psv", while the season table calls them
     "Arsenal F.C." and "PSV Eindhoven". */
  const tries = [name, ...alts];
  for (const t of tries) {
    const n = norm(t);
    if (badgeNames[n]) return badgeNames[n];
    const bare = n.replace(/\b(fc|cf|sc|ac|afc|as|ss|ssc|rc|rcd|cd|ud|sv|vfb|vfl|bsc|fk|nk|hc|club|de|the|f|c|a|s)\b/g, " ")
      .replace(/\s+/g, " ").trim();
    if (bare && badgeNames[bare]) return badgeNames[bare];
    for (const cand of [n, bare]) {
      if (!cand) continue;
      const slug = cand.replace(/ /g, "-");
      if (logos.has(slug + ".png")) return slug;
    }
  }
  return null;
}

/* What counts as having said it. The display name is stripped of the club-type
   noise ("F.C.", "(football club)"), and anything shorter than three letters
   is dropped: "AC" would otherwise answer half of Italy. */
function accepted(display, alts) {
  const out = new Set();
  const add = s => {
    const n = norm(s);
    if (n.length >= 3 && !/^(fc|cf|sc|ac|afc)$/.test(n)) out.add(n);
  };
  const clean = display.replace(/\s*\((football club|football|soccer)[^)]*\)/i, "")
    .replace(/\b(F\.?C\.?|A\.?F\.?C\.?|C\.?F\.?|S\.?C\.?|B\.?C\.?)\b/g, " ").trim();
  add(display); add(clean);
  for (const a of alts) add(a);
  /* one more: the shortest alias tends to be what a table shouts, and dropping
     a leading article helps ("The Arsenal" -> "arsenal") */
  for (const s of [...out]) {
    const t = s.replace(/^(the|de|el|la|los|le|les|il)\s+/, "");
    if (t.length >= 3) out.add(t);
  }
  return [...out].sort();
}

(async () => {
  const logos = new Set(fs.readdirSync(path.join(REPO, "assets/logos")));
  const badges = JSON.parse(fs.readFileSync(path.join(REPO, "assets/badges/index.json"), "utf8"));
  const badgeNames = {};
  for (const tier of Object.values(badges)) for (const b of tier) badgeNames[norm(b.n)] = b.s;

  const out = [];
  for (const L of LEAGUES) {
    const found = await seasonTeams(L.page, L.size);
    if (!found) { console.log(`  DROPPED  ${L.n}: no season article with a league table`); continue; }
    const alts = await aliases(found.teams);
    const clubs = found.teams.map(t => {
      const display = t.replace(/s*((football club|football|soccer)[^)]*)/i, ).trim();
      const a = accepted(display, alts[t] || []);
      return { n: display, s: slugFor(display, a, logos, badgeNames), a };
    });
    /* An answer two clubs in the same league both claim is unusable: the
       first match wins and the other club becomes impossible to name. The
       Premier League had "blues" for Chelsea, Everton AND Ipswich, and "city"
       for Coventry and Hull. Across leagues it does not matter, they are
       never on the screen together. */
    const owners = new Map();
    for (const c of clubs) for (const a of c.a) owners.set(a, (owners.get(a) || 0) + 1);
    let dropped = 0;
    for (const c of clubs) {
      const others = clubs.filter(o => o !== c).flatMap(o => o.a);
      const keep = c.a.filter(a => owners.get(a) === 1
        /* and it must not sit inside another club's name either. Wikidata
           lists a bare "United" as an alias of Leeds, which would have handed
           Leeds the point to anyone typing towards Manchester or Newcastle. */
        && !others.some(o => o.includes(a)));
      dropped += c.a.length - keep.length;
      /* never strip a club of every way of naming it: if the shared name is
         all it had, keep the full name, which is unique by construction */
      c.a = keep.length ? keep : [norm(c.n)];
    }

    const withCrest = clubs.filter(c => c.s).length;
    if (dropped) console.log(`  ${" ".repeat(20)} ${dropped} shared answers dropped from ${L.n}`);
    out.push({ n: L.n, season: found.season, flag: L.flag, clubs });
    console.log(`  ${L.n.padEnd(20)} ${found.season}  ${clubs.length} clubs, ${withCrest} with a crest` + (L.size && clubs.length !== L.size ? `   <-- expected ${L.size}, worth a look` : ''));
    await sleep(300);
  }

  console.log("\nspot check, one league in full:");
  const eredivisie = out.find(l => l.n === "Eredivisie") || out[0];
  eredivisie.clubs.forEach(c => console.log(`   ${c.n.padEnd(24)} ${c.s || "no crest"}   [${c.a.slice(0, 5).join(", ")}]`));

  const total = out.reduce((a, l) => a + l.clubs.length, 0);
  const noCrest = out.flatMap(l => l.clubs.filter(c => !c.s).map(c => l.n + ": " + c.n));
  console.log(`\n${out.length} leagues, ${total} clubs, ${total - noCrest.length} with a crest`);
  if (noCrest.length) {
    console.log(`\nno crest on file (${noCrest.length}), they still count, they just show as a name:`);
    noCrest.slice(0, 20).forEach(s => console.log("   " + s));
  }

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(out, null, 1));
  console.log(`\nwritten to assets/leagues/index.json (${(fs.statSync(path.join(OUT, "index.json")).size / 1024).toFixed(0)} KB)`);
})();
