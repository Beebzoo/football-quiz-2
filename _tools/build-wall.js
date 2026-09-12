/* Build The Wall: sixteen players, four hidden fours.

     node _tools/build-wall.js --dry        report only
     node _tools/build-wall.js --walls 140  write assets/wall/index.json

   THE ONLY THING THAT MAKES A WALL WORK is that each name belongs to exactly
   one of the four groups on the board. Get that wrong and the puzzle is not
   hard, it is broken: the player finds a perfectly good four, the app says no,
   and there is no argument you can win. Barcelona and Chelsea have over a
   hundred career-deck players each, so a wall built by picking four clubs and
   four names apiece collides almost every time.

   So every name is tested against all four groups before it goes on the board,
   and the whole wall is tested again at the end. A name that answers to two
   groups is dropped, not placed and hoped for.

   TWO KINDS OF LINK, because a wall where every group is "played for X" is a
   sorting exercise rather than a puzzle. Clubs come from the career deck,
   nationalities from Wikidata P27. Mixing them is what creates the good trap:
   the Dutchman who played for Milan is exactly the name you want on a board
   with a Dutch group and a Milan group, and he is exactly the name that has to
   come off it.

   NATIONALITY MEANS THE SHIRT, NOT THE PASSPORT. The first build used P27,
   citizenship, and produced a Cameroon group containing Kylian Mbappé, who
   holds his father's passport and has played 90 times for France. It also
   filed every British player under "United Kingdom", which is not a thing
   anyone has ever supported. P1532, country for sport, is the property that
   means what football means: Mbappé France, Embolo Switzerland, Joe Allen
   Wales, Trippier England. A player with no P1532 is left out of nationality
   groups rather than guessed at.

   A man who has turned out for two countries answers to two groups, so he is
   only ever safe on a board where at most one of them is up.

   SAFE TO RE-RUN. Lookups cache in _tools/_models/ (gitignored). */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const HTML = path.join(REPO, "index.html");
const MODELS = path.join(__dirname, "_models");
const OUT = path.join(REPO, "assets", "wall");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const WD = "https://www.wikidata.org/w/api.php";
const WIKI = "https://en.wikipedia.org/w/api.php";
const DRY = process.argv.includes("--dry");
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const WALLS = +(arg("--walls") || 140);

/* a name nobody at the table has heard of is not a clue, it is noise */
const FAME_FLOOR = 60000;
/* a group needs spare members or the board can never be built around it */
const MIN_POOL = 6;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const cacheRead = f => { try { return JSON.parse(fs.readFileSync(path.join(MODELS, f), "utf8")); } catch (e) { return null; } };
const cacheWrite = (f, v) => { fs.mkdirSync(MODELS, { recursive: true }); fs.writeFileSync(path.join(MODELS, f), JSON.stringify(v)); };

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      return null;
    } catch (e) { if (i === tries - 1) return null; await sleep(1500 * (i + 1)); }
  }
  return null;
}

(async () => {
  const html = fs.readFileSync(HTML, "utf8");
  const i = html.indexOf("const CAREERS = ["), j = html.indexOf("\n];", i);
  const CAREERS = eval(html.slice(i + "const CAREERS = ".length, j + 2));
  const fame = cacheRead("alumni-fame.json") || {};
  const named = {};
  try {
    const L = JSON.parse(fs.readFileSync(path.join(REPO, "assets/leagues/index.json"), "utf8"));
    for (const lg of (Array.isArray(L) ? L : Object.values(L))) for (const c of (lg.clubs || lg.teams || [])) if (c.s && c.n) named[c.s] = c.n;
  } catch (e) {}
  try {
    const B = JSON.parse(fs.readFileSync(path.join(REPO, "assets/badges/index.json"), "utf8"));
    for (const tier of Object.values(B)) for (const b of tier) if (b.s && b.n && !named[b.s]) named[b.s] = b.n;
  } catch (e) {}

  /* ---------- 1. every player as an item ---------- */
  let qid = cacheRead("wall-qid.json") || {};
  const spells = cacheRead("careers-spells.json");
  if (spells) for (const [q, v] of Object.entries(spells)) {
    if (!v.name) continue;
    const short = (v.title || "").replace(/\s*\(.*\)\s*$/, "").trim();
    for (const nm of [v.name, short]) if (nm && !qid[nm]) qid[nm] = q;
  }
  const titles = cacheRead("alumni-titles.json") || {};
  const needQ = CAREERS.map(c => c.n).filter(n => !qid[n]);
  if (needQ.length) {
    process.stdout.write(`resolving ${needQ.length} players to items  `);
    for (const batch of chunk(needQ, 40)) {
      const ask = batch.map(n => titles[n] || n);
      const q = await getJSON(WIKI + "?action=query&format=json&formatversion=2&redirects=1&prop=pageprops&ppprop=wikibase_item"
        + "&titles=" + encodeURIComponent(ask.join("|")));
      const byTitle = {};
      for (const pg of (q && q.query && q.query.pages) || []) if (!pg.missing && pg.pageprops) byTitle[pg.title] = pg.pageprops.wikibase_item;
      const back = {};
      for (const r of (q && q.query && q.query.redirects) || []) back[r.from] = r.to;
      for (const r of (q && q.query && q.query.normalized) || []) back[r.from] = r.to;
      batch.forEach((n, k) => {
        const t = ask[k];
        qid[n] = byTitle[t] || byTitle[back[t]] || null;
      });
      process.stdout.write(".");
      await sleep(150);
    }
    cacheWrite("wall-qid.json", qid);
    console.log("");
  }

  /* ---------- 2. nationality ---------- */
  let nat = cacheRead("wall-sport.json") || {};
  const wantNat = [...new Set(CAREERS.map(c => qid[c.n]).filter(q => q && !nat[q]))];
  if (wantNat.length) {
    process.stdout.write(`reading ${wantNat.length} sporting nationalities  `);
    const countryQ = new Set();
    const raw = {};
    for (const batch of chunk(wantNat, 45)) {
      const j2 = await getJSON(WD + "?action=wbgetentities&format=json&props=claims&ids=" + batch.join("|"));
      for (const id of batch) {
        const e = j2 && j2.entities && j2.entities[id];
        const cs = e ? ((e.claims && e.claims.P1532) || []).map(c => c.mainsnak.datavalue && c.mainsnak.datavalue.value.id).filter(Boolean) : [];
        raw[id] = cs; cs.forEach(c => countryQ.add(c));
      }
      process.stdout.write(".");
      await sleep(150);
    }
    const label = {};
    for (const batch of chunk([...countryQ], 45)) {
      const j2 = await getJSON(WD + "?action=wbgetentities&format=json&props=labels&languages=en&ids=" + batch.join("|"));
      for (const [id, e] of Object.entries((j2 && j2.entities) || {})) label[id] = (e.labels && e.labels.en && e.labels.en.value) || null;
      await sleep(150);
    }
    for (const [id, cs] of Object.entries(raw)) nat[id] = cs.map(c => label[c]).filter(Boolean);
    cacheWrite("wall-sport.json", nat);
    console.log("");
  }

  /* ---------- 3. what each name answers to ---------- */
  const item = {};
  for (const c of CAREERS) {
    const q = qid[c.n];
    item[c.n] = { clubs: new Set(c.c), nats: new Set(q && nat[q] ? nat[q] : []), fame: fame[c.n] || 0 };
  }
  const known = Object.entries(item).filter(([, v]) => v.fame >= FAME_FLOOR).map(([n]) => n);
  console.log(`${known.length} of ${CAREERS.length} players clear the ${FAME_FLOOR.toLocaleString()} view floor`);
  console.log(`${Object.values(item).filter(v => v.nats.size).length} have a nationality on file`);

  /* ---------- 4. the groups worth building a board around ---------- */
  const groups = [];
  const byClub = {}, byNat = {};
  for (const n of known) {
    for (const s of item[n].clubs) (byClub[s] = byClub[s] || []).push(n);
    for (const c of item[n].nats) (byNat[c] = byNat[c] || []).push(n);
  }
  /* a label is going on screen as the answer, so it has to read like a club.
     The badge bank ships at least one "Galatasaray S.K. (undefined)". */
  const presentable = n => n && !/undefined|null|[{}|]|^\s*$/i.test(n);
  let unnamed = 0;
  for (const [s, members] of Object.entries(byClub)) {
    if (members.length < MIN_POOL) continue;
    if (!presentable(named[s])) { unnamed++; continue; }
    groups.push({ kind: "club", key: s, label: named[s].replace(/\s+(F\.?C\.?|FC|S\.?K\.?|A\.?F\.?C\.?)$/i, "").trim(), members });
  }
  if (unnamed) console.log(`  ${unnamed} clubs had no presentable name and were left out`);
  for (const [c, members] of Object.entries(byNat))
    if (members.length >= MIN_POOL) groups.push({ kind: "nat", key: c, label: c, members });
  console.log(`${groups.filter(g => g.kind === "club").length} club groups and ${groups.filter(g => g.kind === "nat").length} nationality groups`);

  const answersTo = (name, g) => g.kind === "club" ? item[name].clubs.has(g.key) : item[name].nats.has(g.key);

  /* ---------- 5. boards ---------- */
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const walls = [];
  const seen = new Set();
  let tries = 0;
  while (walls.length < WALLS && tries < WALLS * 400) {
    tries++;
    /* aim for a mix: a board of four clubs is a sorting exercise */
    const clubs = groups.filter(g => g.kind === "club"), nats = groups.filter(g => g.kind === "nat");
    const wantNats = 1 + Math.floor(Math.random() * 2);         // one or two nationality groups
    const chosen = [];
    while (chosen.length < wantNats && nats.length) { const g = pick(nats); if (!chosen.includes(g)) chosen.push(g); }
    while (chosen.length < 4 && clubs.length) { const g = pick(clubs); if (!chosen.includes(g)) chosen.push(g); }
    if (chosen.length < 4) continue;

    /* a name goes on the board only if it answers to its own group and to no
       other group up there */
    const used = new Set();
    const board = [];
    let ok = true;
    for (const g of chosen) {
      const safe = g.members.filter(n => !used.has(n) && chosen.every(o => o === g || !answersTo(n, o)));
      if (safe.length < 4) { ok = false; break; }
      const take = [];
      while (take.length < 4) { const n = pick(safe); if (!take.includes(n)) take.push(n); }
      take.forEach(n => used.add(n));
      board.push({ k: g.kind, l: g.label, p: take });
    }
    if (!ok) continue;

    /* prove it once more, from the board rather than from the intent */
    const flat = board.flatMap(g => g.p);
    if (new Set(flat).size !== 16) continue;
    /* the real test, asked of the finished board rather than of the intent:
       every one of the sixteen answers to exactly one group up there */
    if (!flat.every(n => chosen.filter(g => answersTo(n, g)).length === 1)) continue;

    const sig = board.map(g => g.k + ":" + g.l).sort().join("|");
    if (seen.has(sig)) continue;
    seen.add(sig);
    walls.push({ g: board });
  }

  console.log(`\n${walls.length} boards built in ${tries} attempts`);
  const kinds = {};
  walls.forEach(w => { const k = w.g.filter(g => g.k === "nat").length; kinds[k] = (kinds[k] || 0) + 1; });
  console.log(`  nationality groups per board: ${Object.entries(kinds).map(([k, v]) => k + " -> " + v).join(", ")}`);

  for (const w of walls.slice(0, 3)) {
    console.log("");
    for (const g of w.g) console.log(`   ${(g.k === "nat" ? g.l : g.l).padEnd(20)} ${g.p.join(" · ")}`);
  }

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(walls));
  console.log(`\nwritten to assets/wall/index.json`);
})();
