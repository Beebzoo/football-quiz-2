/* "Who won the Ballon d'Or in 1995" and the rest of the prize cabinet.

     node _tools/build-awards.js            build the pack
     node _tools/build-awards.js --dry      report only, write nothing

   Wikidata files awards as P166 with the year as a qualifier, which is
   exactly the shape a Classic question wants: one winner, one year, no
   argument at the table.

   NO QID IS TYPED IN HERE. The last generated pack was built on ids written
   from memory and six of ten were wrong: Q82595 is the Bundesliga rather than
   the Eredivisie, and the mistake only surfaced when a question asked who won
   the Bundesliga in 1960/61 and answered Monaco. So every award is looked up
   by name and then has to prove itself: it must return a decent run of
   winners, they must be footballers, and the years must spread across
   decades rather than clustering in whatever slice the query happened to
   grab. Anything that fails is dropped and said out loud.

   SAFE TO RE-RUN. Rebuilt from scratch; appended to the bank last. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "assets", "awards");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const DRY = process.argv.includes("--dry");

/* name to search for, how to word the question, and which tier a win lands in.
   The Dutch and Spanish ones are here because the table is Dutch and Spanish. */
const AWARDS = [
  { q: "Ballon d'Or", ask: "the Ballon d'Or", tier: y => y >= 1990 ? "normal" : "hard" },
  { q: "FIFA World Player of the Year", ask: "FIFA World Player of the Year", tier: () => "hard" },
  { q: "The Best FIFA Men's Player", ask: "The Best FIFA Men's Player", tier: () => "normal" },
  { q: "European Golden Shoe", ask: "the European Golden Shoe", tier: y => y >= 2000 ? "hard" : "ball" },
  { q: "UEFA Club Footballer of the Year", ask: "UEFA Club Footballer of the Year", tier: () => "ball" },
  { q: "Golden Shoe Netherlands football", ask: "the Dutch Golden Shoe", tier: () => "ball" },
  { q: "Golden Boy football award Tuttosport", ask: "the Golden Boy award", tier: () => "ball" },
  { q: "FIFA World Cup Golden Ball award", ask: "the World Cup Golden Ball", tier: y => y >= 1994 ? "hard" : "ball" },
  { q: "Onze d Or", ask: "the Onze d Or", tier: () => "ball" },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) { await sleep(2500 * (i + 1)); continue; }
      throw new Error("HTTP " + res.status);
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}
const sparql = async q => (await getJSON("https://query.wikidata.org/sparql?format=json&query="
  + encodeURIComponent(q))).results.bindings;

async function search(name) {
  const j = await getJSON("https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json"
    + "&language=en&limit=6&search=" + encodeURIComponent(name));
  return (j.search || []).map(s => ({ id: s.id, label: s.label, desc: s.description || "" }));
}

/* The verification. Ask the candidate for its winners and see whether the
   answer looks like football: enough of them, all human footballers, spread
   over more than one era. */
async function winners(qid) {
  /* Men only, and that is a data decision rather than an editorial one:
     Wikidata files the men's and women's Ballon d'Or against the same item,
     so without the filter "who won it in 2015" has two right answers, Messi
     and Carli Lloyd, and the game would mark one of them wrong. This deck is
     a men's football quiz; a women's round would be its own bank. */
  const q = `SELECT ?year ?name WHERE {
      ?p p:P166 ?st . ?st ps:P166 wd:${qid} ; pq:P585 ?when .
      ?p wdt:P106 wd:Q937857 ; wdt:P21 wd:Q6581097 ; rdfs:label ?name .
      FILTER(LANG(?name) = "en")
      BIND(YEAR(?when) AS ?year)
    } ORDER BY ?year`;
  try {
    const rows = await sparql(q);
    const byYear = new Map();
    for (const r of rows) {
      const y = Number(r.year.value);
      if (!Number.isFinite(y)) continue;
      if (!byYear.has(y)) byYear.set(y, new Set());
      byYear.get(y).add(r.name.value);
    }
    /* A year with two winners is a shared award or a modelling mess. Either
       way it cannot be asked as one question, so it is dropped rather than
       guessed at. */
    return [...byYear.entries()]
      .filter(([, names]) => names.size === 1)
      .map(([year, names]) => ({ year, name: [...names][0] }))
      .sort((a, b) => a.year - b.year);
  } catch (e) { return []; }
}

(async () => {
  const pack = { easy: [], normal: [], hard: [], extreme: [], ball: [] };
  const report = [];
  const usedIds = new Set();   // two names can resolve to one item; ask about it once

  for (const a of AWARDS) {
    const cands = await search(a.q);
    await sleep(300);
    let best = null;
    for (const c of cands) {
      const w = await winners(c.id);
      await sleep(500);
      const years = w.map(x => x.year);
      const spread = years.length ? Math.max(...years) - Math.min(...years) : 0;
      /* 12 winners over 15 years is a real award with a real history. Fewer
         than that and it is a one-off trophy, a namesake, or the wrong item. */
      if (usedIds.has(c.id)) continue;
      if (w.length >= 12 && spread >= 15 && (!best || w.length > best.w.length)) best = { c, w };
      if (best && best.w.length >= 30) break;      // convincing enough, stop paying for queries
    }
    if (best) usedIds.add(best.c.id);
    if (!best) { report.push(`  DROPPED  ${a.q}: nothing that looks like an award with winners`); continue; }

    for (const { year, name } of best.w) {
      pack[a.tier(year)].push({ q: `Who won ${a.ask} in ${year}?`, a: name });
    }
    const yrs = best.w.map(x => x.year);
    report.push(`  ${best.c.id} ${a.q}: ${best.w.length} winners, ${Math.min(...yrs)} to ${Math.max(...yrs)}`
      + `   [${best.w[0].name} … ${best.w[best.w.length - 1].name}]`);
  }

  console.log("what each award resolved to:");
  report.forEach(r => console.log(r));

  const total = Object.values(pack).reduce((a, r) => a + r.length, 0);
  console.log(`\n${total} questions: ` + Object.entries(pack).map(([t, r]) => `${t} ${r.length}`).join(", "));
  console.log("\nspot check, one per decade where there is one:");
  const all = Object.values(pack).flat();
  const byDecade = {};
  for (const q of all) { const d = (q.q.match(/(\d{4})/) || [])[1]; if (d) byDecade[d.slice(0, 3)] = q; }
  Object.keys(byDecade).sort().forEach(d => console.log(`   ${byDecade[d].q}  ->  ${byDecade[d].a}`));

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(pack, null, 1));
  console.log(`\nwritten to assets/awards/index.json (${(fs.statSync(path.join(OUT, "index.json")).size / 1024).toFixed(0)} KB)`);
})();
