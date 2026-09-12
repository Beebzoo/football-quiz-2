/* Build the Alumni deck: a club, and the men who turned out for it.

     node _tools/build-alumni.js --dry     report only, write nothing
     node _tools/build-alumni.js           write assets/alumni/index.json

   Career Path with the roles swapped. There the crests come out one at a time
   and you name the man; here the men come out one at a time and you name the
   club. It needs no new research at all: the 1,000 careers already say who
   played where, so this deck is that same data read down the other axis.

   THE ORDER IS THE GAME. A club's players come out obscure first and famous
   last, so the question opens hard and softens with every reveal, which is what
   makes the points ladder mean anything. Deal them at random and the whole
   thing collapses the moment a household name lands first. Fame is a year of
   English pageviews, the same measure the kit, badge and career banks use.

   WHAT COUNTS AS A CLUB WORTH ASKING ABOUT. Five players from the deck, so
   there is a ladder to climb, and a name to put on the answer screen. The name
   comes from the banks the app already ships, the leagues list first because it
   is the most current, then the badge bank. A club nobody can name is dropped
   rather than shown with its slug tidied up, because "Fc Porto" on the reveal
   is worse than the club simply not being in the deck.

   SAFE TO RE-RUN. Fame is cached in _tools/_models/ (gitignored). */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const HTML = path.join(REPO, "index.html");
const MODELS = path.join(__dirname, "_models");
const OUT = path.join(REPO, "assets", "alumni");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const WIKI = "https://en.wikipedia.org/w/api.php";
const DRY = process.argv.includes("--dry");

/* five players is a ladder; fewer is a coin toss. Nine is where a reveal stops
   being a clue and starts being a list. */
const MIN_PLAYERS = 5, MAX_PLAYERS = 8;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const cacheRead = f => { try { return JSON.parse(fs.readFileSync(path.join(MODELS, f), "utf8")); } catch (e) { return null; } };
const cacheWrite = (f, v) => { fs.mkdirSync(MODELS, { recursive: true }); fs.writeFileSync(path.join(MODELS, f), JSON.stringify(v)); };

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      return null;
    } catch (e) { if (i === tries - 1) return null; await sleep(1500 * (i + 1)); }
  }
  return null;
}

(async () => {
  const html = fs.readFileSync(HTML, "utf8");
  const i = html.indexOf("const CAREERS = ["), j = html.indexOf("\n];", i);
  const CAREERS = eval(html.slice(i + "const CAREERS = ".length, j + 2));
  console.log(`${CAREERS.length} careers to read down the other axis`);

  /* ---------- club names, from what the app already ships ---------- */
  const named = {};
  try {
    const L = JSON.parse(fs.readFileSync(path.join(REPO, "assets/leagues/index.json"), "utf8"));
    for (const lg of (Array.isArray(L) ? L : Object.values(L)))
      for (const c of (lg.clubs || lg.teams || [])) if (c.s && c.n) named[c.s] = c.n;
  } catch (e) {}
  const fromLeagues = Object.keys(named).length;
  try {
    const B = JSON.parse(fs.readFileSync(path.join(REPO, "assets/badges/index.json"), "utf8"));
    for (const tier of Object.values(B)) for (const b of tier) if (b.s && b.n && !named[b.s]) named[b.s] = b.n;
  } catch (e) {}
  console.log(`${Object.keys(named).length} club names available (${fromLeagues} from the leagues bank)`);

  /* ---------- fame, so the reveals can run obscure to famous ---------- */
  let fame = cacheRead("alumni-fame.json") || {};

  /* the careers build already paid for half of these: its cache is keyed by
     item, and the spells cache says which name each item carries */
  const spells = cacheRead("careers-spells.json"), cfame = cacheRead("careers-fame.json");
  if (spells && cfame) {
    let borrowed = 0;
    for (const [qid, v] of Object.entries(spells)) {
      if (!v.name || cfame[qid] === undefined) continue;
      for (const nm of [v.name, (v.title || "").replace(/\s*\(.*\)\s*$/, "").trim()]) {
        if (nm && fame[nm] === undefined) { fame[nm] = cfame[qid]; borrowed++; }
      }
    }
    if (borrowed) console.log(`  ${borrowed} fame figures borrowed from the careers build`);
  }

  const needFame = CAREERS.map(c => c.n).filter(n => fame[n] === undefined);
  if (needFame.length) {
    /* a name is not a title: resolve it first, following redirects, or the
       pageview call answers about a disambiguation page */
    let titles = cacheRead("alumni-titles.json") || {};
    const toResolve = needFame.filter(n => !(n in titles));
    if (toResolve.length) {
      process.stdout.write(`resolving ${toResolve.length} player names  `);
      for (const batch of chunk(toResolve, 40)) {
        const q = await getJSON(WIKI + "?action=query&format=json&formatversion=2&redirects=1"
          + "&titles=" + encodeURIComponent(batch.join("|")));
        const back = {};
        for (const r of (q && q.query && q.query.redirects) || []) back[r.to] = r.from;
        for (const r of (q && q.query && q.query.normalized) || []) back[r.to] = back[r.to] || r.from;
        for (const pg of (q && q.query && q.query.pages) || []) {
          const from = back[pg.title] || pg.title;
          titles[from] = pg.missing ? null : pg.title;
        }
        for (const n of batch) if (!(n in titles)) titles[n] = null;
        process.stdout.write(".");
        await sleep(150);
      }
      cacheWrite("alumni-titles.json", titles);
      console.log("");
    }
    process.stdout.write(`ranking ${needFame.length} players  `);
    let n = 0;
    for (const name of needFame) {
      const t = titles[name];
      if (!t) { fame[name] = 0; continue; }
      const enc = encodeURIComponent(t.replace(/ /g, "_"));
      const j2 = await getJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${enc}/monthly/2025010100/2025123100`, 2);
      fame[name] = j2 && j2.items ? j2.items.reduce((a, x) => a + (x.views || 0), 0) : 0;
      if (++n % 50 === 0) { cacheWrite("alumni-fame.json", fame); process.stdout.write(`\r ranking ${n}/${needFame.length}   `); }
      await sleep(60);
    }
    cacheWrite("alumni-fame.json", fame);
    console.log(`\r ranked ${needFame.length} players          `);
  }

  /* ---------- the deck ---------- */
  const byClub = {};
  for (const c of CAREERS) for (const s of new Set(c.c)) (byClub[s] = byClub[s] || []).push(c.n);

  const deck = [];
  let thin = 0, nameless = 0;
  for (const [slug, players] of Object.entries(byClub)) {
    if (players.length < MIN_PLAYERS) { thin++; continue; }
    if (!named[slug]) { nameless++; continue; }
    /* obscure first, famous last: the ladder softens as it goes */
    const ordered = players.slice().sort((a, b) => (fame[a] || 0) - (fame[b] || 0));
    /* keep the most famous MAX, then put them back in obscure-first order, so
       a big club's list is its best known names rather than its longest tail */
    const kept = ordered.slice(-MAX_PLAYERS);
    deck.push({ s: slug, n: named[slug], p: kept });
  }
  deck.sort((a, b) => b.p.length - a.p.length || a.n.localeCompare(b.n));

  console.log(`\n${deck.length} clubs in the deck`);
  console.log(`  ${thin} had fewer than ${MIN_PLAYERS} players, ${nameless} had no name to show`);
  const missingCrest = deck.filter(d => !fs.existsSync(path.join(REPO, "assets/logos", d.s + ".png")));
  if (missingCrest.length) { console.log(`STOP: ${missingCrest.length} clubs have no crest: ${missingCrest.slice(0, 6).map(d => d.s).join(", ")}`); return; }
  console.log(`  every crest present`);

  const show = deck.slice(0, 6).concat(deck.slice(-4));
  for (const d of show) console.log(`   ${d.n.padEnd(24)} ${d.p.join(" · ")}`);

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(deck));
  console.log(`\nwritten to assets/alumni/index.json`);
})();
