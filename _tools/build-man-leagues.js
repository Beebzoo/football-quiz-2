/* Where every man in the 2006 deck played his club football, as deck ids.
 *
 *     node _tools/build-man-leagues.js --dry      look, report, write nothing
 *     node _tools/build-man-leagues.js --write    stamp lg onto the deck
 *
 * WHY. The Dugout's flagship rule is that a ball to a man draws a question
 * from where he played: van Nistelrooy pulls Eredivisie, Premier League or La
 * Liga, Cannavaro pulls Serie A, a Costa Rican centre-back who never left home
 * pulls the classic bank. The deck currently carries {n, full, no, pos} and no
 * career at all, so the rule has nothing to read. This is that missing field.
 *
 * COUNTRY, NOT LEAGUE. The obvious key is the club's league, and it is the
 * wrong one: Wikidata's P118 is the league a club is in TODAY, so Deportivo
 * and Parma would come back Segunda and Serie B and a 2006 career would be
 * quietly mis-filed. Where a club plays its football does not change when it
 * goes down. So a club is keyed on its country, and a country maps to the deck
 * we have for it. "He played in Spain" is exactly what the rule wants to know.
 *
 * THE TRAP THIS INHERITS. P54 is "member of sports team" and holds national
 * sides and youth teams alongside clubs, which is the mistake build-careers.js
 * documents at length. National sides are dropped positively, by P1532 (country
 * for sport), because the obvious class tests are wrong in both directions.
 *
 * DISAMBIGUATION. Searching a name alone puts three Luis Garcias on the table.
 * A candidate is only accepted if it can be tied back to the side he played
 * for in 2006, either by citizenship or by having that national team in his own
 * P54. The squad list is the evidence; the search is only a shortlist.
 *
 * SAFE TO RE-RUN. Every fetch caches to _tools/_models/ (gitignored), so tuning
 * the mapping costs nothing after the first pass.
 */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const DECK = path.join(REPO, "assets", "wc2006", "index.json");
const MODELS = path.join(__dirname, "_models");
const UA = "BALL2-quiz-build/1.0 (https://github.com/Beebzoo/football-quiz-2; personal hobby project)";
const WD = "https://www.wikidata.org/w/api.php";
const WRITE = process.argv.includes("--write");
const VERBOSE = process.argv.includes("--verbose");

/* country of the club -> which deck its questions come from. Anything not on
   this list has no deck of its own and falls back to the classic bank, which
   is most of the world and is the correct answer for it. */
const DECK_FOR = {
  "Netherlands": "ere",
  "England": "premier",
  "Spain": "laliga",
  "Germany": "bundesliga",
  "Italy": "seriea",
  "Belgium": "belgian",
};
/* Clubs whose country comes back as the United Kingdom, or not at all, need
   deciding by hand rather than by guessing: Celtic is not the Premier League.
   Only English clubs map to premier. */
const UK_ENGLISH = /^(?!.*(Celtic|Rangers|Aberdeen|Hearts|Hibernian|Dundee|Motherwell|Kilmarnock|Cardiff|Swansea|Wrexham|Newport|Derry|Linfield)).*$/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const norm = x => String(x || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z ]/gi, " ").replace(/\s+/g, " ").toLowerCase().trim();

async function getJSON(url, tries = 4) {
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
async function sparql(q, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q),
        { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
      if (res.ok) return (await res.json()).results.bindings;
      await sleep(5000 * (i + 1));
    } catch (e) { await sleep(5000 * (i + 1)); }
  }
  return null;
}
const cacheRead = f => { try { return JSON.parse(fs.readFileSync(path.join(MODELS, f), "utf8")); } catch (e) { return null; } };
const cacheWrite = (f, v) => { fs.mkdirSync(MODELS, { recursive: true }); fs.writeFileSync(path.join(MODELS, f), JSON.stringify(v)); };

/* ---------- 1. the men ---------- */
const deck = JSON.parse(fs.readFileSync(DECK, "utf8"));
const sides = deck.teams || deck;
const men = [];
for (const side of Object.keys(sides)) {
  for (const key of ["xi", "bench"])
    for (const p of (sides[side][key] || [])) men.push({ side, key, n: p.n, full: p.full });
}
console.log(men.length + " men across " + Object.keys(sides).length + " sides");

/* ---------- 2. name to Wikidata item ---------- */
/* the shortlist: whatever the search says for his full name */
async function searchItems(name) {
  /* hashed, not spelled: one 2006 squad entry arrived with a whole UEFA
     citation where its name should be, and a 400 character filename is an
     ENOENT rather than a bad question. */
  const key = "mlq-" + require("crypto").createHash("sha1").update(String(name)).digest("hex").slice(0, 16) + ".json";
  const hit = cacheRead(key);
  if (hit) return hit;
  const url = WD + "?action=wbsearchentities&format=json&language=en&uselang=en&type=item&limit=8&search=" + encodeURIComponent(name);
  const j = await getJSON(url);
  const out = (j && j.search ? j.search : []).map(r => ({ id: r.id, label: r.label, desc: r.description || "" }));
  cacheWrite(key, out);
  await sleep(120);
  return out;
}
/* the evidence: only accept a candidate we can tie to the side he played for */
async function entities(ids) {
  const out = {};
  for (const group of chunk(ids, 40)) {
    const key = "mle-" + require("crypto").createHash("sha1").update(group.join("_")).digest("hex").slice(0, 16) + ".json";
    let j = cacheRead(key);
    if (!j) {
      j = await getJSON(WD + "?action=wbgetentities&format=json&props=claims|labels&languages=en&ids=" + group.join("|"));
      cacheWrite(key, j);
      await sleep(150);
    }
    Object.assign(out, (j && j.entities) || {});
  }
  return out;
}

(async () => {
  /* ---------- 3. resolve ---------- */
  console.log("\nresolving names to Wikidata items...");
  const resolved = {};
  let done = 0;
  for (const m of men) {
    const cands = await searchItems(m.full || m.n);
    /* EVERY candidate goes forward, and the description is not a gate.
       Wikidata describes Ronaldinho as a "Brazilian associaton fooball
       player", with two typos, so a filter requiring the word football threw
       away the real one and left a samba musician who is also Brazilian and
       has no clubs. Prose is a hint; claims are evidence. */
    m.cands = cands.slice(0, 5).map(c => c.id);
    m.desc = Object.fromEntries(cands.map(c => [c.id, c.desc || ""]));
    if (++done % 100 === 0) console.log("  " + done + "/" + men.length);
  }
  const allIds = [...new Set(men.flatMap(m => m.cands))];
  console.log("fetching " + allIds.length + " candidate items...");
  const ents = await entities(allIds);

  const claimIds = (e, p) => ((e && e.claims && e.claims[p]) || [])
    .map(c => c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value && c.mainsnak.datavalue.value.id)
    .filter(Boolean);

  /* country labels, so citizenship can be compared to the side he played for */
  const countryIds = [...new Set(Object.values(ents).flatMap(e => claimIds(e, "P27")))];
  const countryEnts = await entities(countryIds);
  const labelOf = (id, pool) => { const e = (pool || ents)[id]; return (e && e.labels && e.labels.en && e.labels.en.value) || ""; };

  /* SCORED ON WHAT THE ITEM CLAIMS, not on how it is described. Citizenship
     matching the side he played for in 2006 is the strongest signal, having
     played for ANY team at all is the next, and the description only breaks
     ties. A man with the right passport and no teams is not our man. */
  let tied = 0, sure = 0;
  for (const m of men) {
    const sideish = norm(m.side);
    let best = null, bestScore = -1;
    for (const id of m.cands) {
      const e = ents[id];
      if (!e) continue;
      const cits = claimIds(e, "P27").map(c => labelOf(c, countryEnts));
      const nation = cits.some(c => norm(c) === sideish || norm(c).includes(sideish) || sideish.includes(norm(c)));
      const teams = claimIds(e, "P54").length;
      const prose = /footbal|fooball|soccer/i.test((m.desc && m.desc[id]) || "");
      const score = (nation ? 4 : 0) + (teams ? 3 : 0) + (prose ? 1 : 0) + Math.min(teams, 2) * 0.1;
      if (score > bestScore) { bestScore = score; best = id; }
    }
    m.qid = best || m.cands[0];
    if (bestScore >= 7) sure++;
    if (bestScore >= 4) tied++;
  }
  console.log("tied to their 2006 side by passport AND club record: " + sure + "/" + men.length);
  console.log("tied by at least one of the two: " + tied + "/" + men.length);

  /* ---------- 4. the clubs, and where they are ---------- */
  const qids = [...new Set(men.map(m => m.qid).filter(Boolean))];
  console.log("\nasking Wikidata for club spells of " + qids.length + " players...");
  const clubsOf = {};
  const countries = {};
  for (const group of chunk(qids, 60)) {
    /* the WHOLE group, hashed. Keyed on its first id and its length, a group
       whose membership changed after a better resolver landed hit the stale
       cache instead: twelve groups, twelve hits, and the corrected ids were
       never asked about. A cache key has to name everything the answer
       depends on. */
    const key = "mlc-" + require("crypto").createHash("sha1").update(group.join(",")).digest("hex").slice(0, 16) + ".json";
    let rows = cacheRead(key);
    if (!rows) {
      const q = `SELECT ?p ?club ?clubLabel ?countryLabel WHERE {
        VALUES ?p { ${group.map(id => "wd:" + id).join(" ")} }
        ?p p:P54 ?st . ?st ps:P54 ?club .
        FILTER NOT EXISTS { ?club wdt:P1532 [] }
        OPTIONAL { ?club wdt:P17 ?country . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }`;
      rows = await sparql(q);
      if (rows) cacheWrite(key, rows);
      await sleep(1200);
    }
    for (const r of (rows || [])) {
      const p = r.p.value.split("/").pop();
      const club = r.clubLabel ? r.clubLabel.value : "";
      const country = r.countryLabel ? r.countryLabel.value : "";
      if (!club) continue;
      (clubsOf[p] = clubsOf[p] || []).push({ club, country });
      countries[country] = (countries[country] || 0) + 1;
    }
  }

  /* ---------- 5. countries to decks ---------- */
  const deckOf = ({ club, country }) => {
    if (DECK_FOR[country]) return DECK_FOR[country];
    if (/United Kingdom/i.test(country)) return UK_ENGLISH.test(club) ? "premier" : null;
    return null;
  };
  let withAny = 0;
  const per = {};
  for (const m of men) {
    const spells = clubsOf[m.qid] || [];
    const lg = [...new Set(spells.map(deckOf).filter(Boolean))];
    m.lg = lg;
    if (lg.length) withAny++;
    for (const l of lg) per[l] = (per[l] || 0) + 1;
  }
  console.log("\nmen with at least one deck league: " + withAny + "/" + men.length +
              "  (" + (withAny / men.length * 100).toFixed(1) + "%)");
  console.log("per deck: " + Object.entries(per).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => k + " " + v).join("  "));
  console.log("\ntop club countries seen (to check the mapping catches the right ones):");
  console.log("  " + Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([k, v]) => (k || "?") + " " + v).join("  "));

  if (VERBOSE) {
    console.log("\nspot checks:");
    for (const name of ["Ruud van Nistelrooy", "Fabio Cannavaro", "Thierry Henry", "Ronaldinho", "Álvaro Mesén"]) {
      const m = men.find(x => norm(x.full) === norm(name));
      if (m) console.log("  " + name.padEnd(24) + (m.lg.join(", ") || "classic only") +
        "   [" + (clubsOf[m.qid] || []).map(c => c.club).slice(0, 8).join(", ") + "]");
    }
  }

  if (!WRITE) { console.log("\ndry run, add --write to stamp lg onto the deck"); return; }

  for (const side of Object.keys(sides)) {
    for (const key of ["xi", "bench"]) {
      for (const p of (sides[side][key] || [])) {
        const m = men.find(x => x.side === side && x.key === key && x.full === p.full && x.n === p.n);
        if (m && m.lg && m.lg.length) p.lg = m.lg; else delete p.lg;
      }
    }
  }
  fs.writeFileSync(DECK, JSON.stringify(deck));
  console.log("\nwrote " + path.relative(REPO, DECK) + "  (" + (fs.statSync(DECK).size / 1024).toFixed(1) + " KB)");
})();
