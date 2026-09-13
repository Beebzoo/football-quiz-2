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
/* WHICH POOL. The harvest is identical for every one of them: resolve each man
   to a Wikidata item through the article his own squad page links him from,
   ask for his club spells, map each club's country to a deck. Only the file
   and the squad page change. */
const POOL = (i => (i > -1 && process.argv[i + 1]) ? process.argv[i + 1] : "wc2006")(process.argv.indexOf("--pool"));
const DECK = path.join(REPO, "assets", POOL, "index.json");
const MODELS = path.join(__dirname, "_models");
const UA = "BALL2-quiz-build/1.0 (https://github.com/Beebzoo/football-quiz-2; personal hobby project)";
const WD = "https://www.wikidata.org/w/api.php";
const WRITE = process.argv.includes("--write");
const VERBOSE = process.argv.includes("--verbose");
/* --who "Raúl" explains one man: his item, his clubs, and what each mapped to.
   --dump <file> writes every man's clubs and leagues out to be read. */
const WHO = (i => i > -1 ? process.argv[i + 1] : null)(process.argv.indexOf("--who"));
const DUMP = (i => i > -1 ? (process.argv[i + 1] || "man-leagues.txt") : null)(process.argv.indexOf("--dump"));

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
/* EVERY CLUB THAT HAS PLAYED IN THE PREMIER LEAGUE since it started in 1992.
   Fifty-two names, and it will not grow by much. A list is worth more than a
   rule here: the rule it replaces read "a UK club that is not obviously
   Scottish", which quietly enrolled Forfar Athletic and Glenavon, and threw
   out Queens Park Rangers for having Rangers in the name. */
const PL_CLUBS = [
  "Arsenal", "Aston Villa", "Barnsley", "Birmingham City", "Blackburn Rovers",
  "Blackpool", "Bolton Wanderers", "AFC Bournemouth", "Bradford City",
  "Brentford", "Brighton & Hove Albion", "Burnley", "Cardiff City",
  "Charlton Athletic", "Chelsea", "Coventry City", "Crystal Palace",
  "Derby County", "Everton", "Fulham", "Huddersfield Town", "Hull City",
  "Ipswich Town", "Leeds United", "Leicester City", "Liverpool", "Luton Town",
  "Manchester City", "Manchester United", "Middlesbrough", "Millwall",
  "Newcastle United", "Norwich City", "Nottingham Forest", "Oldham Athletic",
  "Portsmouth", "Queens Park Rangers", "Reading", "Sheffield United",
  "Sheffield Wednesday", "Southampton", "Stoke City", "Sunderland",
  "Swansea City", "Swindon Town", "Tottenham Hotspur", "Watford",
  "West Bromwich Albion", "West Ham United", "Wigan Athletic", "Wimbledon",
  "Wolverhampton Wanderers",
];
const isPremier = club => PL_CLUBS.some(p => String(club).toLowerCase().startsWith(p.toLowerCase()));

/* RESERVE AND YOUTH SIDES. They carry the parent's name and the parent's
   country, so nothing but the suffix tells them apart. None of them is a top
   flight, in any of the six countries. */
const RESERVE = /( B| II| C| U21| U23)$|\b(Castilla|Mestalla|Cantabria|Under-21|Academy|Reserves)\b|\b(Atl[eè]tic[o]?|Fortuna)$/;
const isReserve = club => RESERVE.test(String(club).trim());

/* LEAGUES TO STRIKE, and why. Wikidata is right about almost everything and
   occasionally confidently wrong; the card names the league out loud on every
   ball, so a wrong one is wrong all night. Keyed on the man's full name. */
const STRIKE = {
  "Edwin van der Sar": { laliga: "Wikidata has him at Barcelona. Ajax, Juventus, Fulham, United." },
  "Sylvain Wiltord": { laliga: "Wikidata has him at Deportivo. Rennes, Bordeaux, Arsenal, Lyon, Marseille, Metz, Nantes." },
};
/* Raúl used to be struck out of Serie A here. That was covering for a broken
   resolver rather than a bad claim: the squad page links a redirect, Wikidata
   returned nothing for it, the name search found Raúl Albiol instead, and
   Albiol really did play for Napoli. The resolver follows enwiki redirects now
   and Raúl is Q11576, so the strike fired at nothing and has gone. */
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

/* ---------- 1b. the squad lists, which link every man to his own article ---------- */
/* THE SQUAD PAGE FOR THIS POOL. Resolution goes through the article the squad
   page links each man from, which is the whole reason this harvest is exact
   rather than a name search, so it has to be that tournament's own page. */
const SQUAD_PAGES = [
  /^wc\d{4}$/.test(POOL) ? POOL.slice(2) + " FIFA World Cup squads" : null,
].filter(Boolean);
async function wikitext(title){
  const key = "mlw-" + require("crypto").createHash("sha1").update(title).digest("hex").slice(0, 16) + ".json";
  const hit = cacheRead(key);
  if (hit) return hit.t || "";
  const url = "https://en.wikipedia.org/w/api.php?action=parse&format=json&prop=wikitext&redirects=1&page=" + encodeURIComponent(title);
  const j = await getJSON(url);
  const t = (j && j.parse && j.parse.wikitext && j.parse.wikitext["*"]) || "";
  cacheWrite(key, { t });
  await sleep(400);
  return t;
}
/* every [[Article|shown]] inside an {{Fs player}} row, as shown -> Article */
async function squadLinks(){
  const map = {};
  for (const page of SQUAD_PAGES) {
    const t = await wikitext(page);
    for (const m of t.matchAll(/\|\s*name\s*=\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
      const article = m[1].trim();
      const shown = (m[2] || m[1]).trim();
      map[norm(shown)] = article;
      map[norm(article)] = article;
    }
  }
  return map;
}
/* WIKIPEDIA'S OWN REDIRECTS, resolved by Wikipedia. A title that redirects is
   not a title Wikidata knows, and the difference between the two is the whole
   Raúl problem. Chained redirects are followed a few hops and then left alone,
   because a redirect loop is Wikipedia's business, not ours. */
async function canonicalTitles(titles){
  const map = {};
  for (const group of chunk(titles, 40)) {
    const key = "mlr-" + require("crypto").createHash("sha1").update(group.join("|")).digest("hex").slice(0, 16) + ".json";
    let j = cacheRead(key);
    if (!j) {
      j = await getJSON("https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&titles=" +
        group.map(encodeURIComponent).join("|"));
      cacheWrite(key, j);
      await sleep(250);
    }
    const q = (j && j.query) || {};
    const step = {};
    for (const k of ["normalized", "redirects"])
      for (const r of (q[k] || [])) step[r.from] = r.to;
    for (const t of group) {
      let cur = t, hops = 0;
      while (step[cur] && hops++ < 4) cur = step[cur];
      map[norm(t)] = cur;
    }
  }
  return map;
}
/* an article title is one item, with no scoring and nothing to get wrong */
/* An article title is one item. Ask for the SITELINKS and match on them:
   wbgetentities keys its response by entity id in its own order, so pairing
   the ids with the titles you asked for by position hands Raul the Premier
   League and Figo the Bundesliga. Redirects are followed and mapped back, so
   a squad page linking an old title still lands on the right man. */
async function itemsForTitles(titles){
  const out = {};
  for (const group of chunk(titles, 40)) {
    const key = "mls2-" + require("crypto").createHash("sha1").update(group.join("|")).digest("hex").slice(0, 16) + ".json";
    let j = cacheRead(key);
    if (!j) {
      j = await getJSON(WD + "?action=wbgetentities&format=json&sites=enwiki&props=sitelinks&sitefilter=enwiki&redirects=yes&titles=" +
        group.map(encodeURIComponent).join("|"));
      cacheWrite(key, j);
      await sleep(200);
    }
    /* what the API renamed on the way in, so the asked-for title still resolves */
    const alias = {};
    for (const k of ["normalized", "redirects"])
      for (const r of ((j && j[k]) || [])) alias[norm(r.from)] = norm(r.to);
    for (const [, e] of Object.entries((j && j.entities) || {})) {
      if (!e || !e.id || e.missing !== undefined) continue;
      const t = e.sitelinks && e.sitelinks.enwiki && e.sitelinks.enwiki.title;
      if (!t) continue;
      out[norm(t)] = e.id;
      for (const [from, to] of Object.entries(alias)) if (to === norm(t)) out[from] = e.id;
    }
  }
  return out;
}

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
  /* the squad lists first: exact, and they cannot pick the wrong Raul */
  console.log("\nreading the 2006 squad lists for article titles...");
  const links = await squadLinks();
  const wanted = [...new Set(men.map(m => links[norm(m.full)] || links[norm(m.n)]).filter(Boolean))];
  console.log("  " + wanted.length + " articles linked; following enwiki redirects...");
  const canon = await canonicalTitles(wanted);
  const real = [...new Set(wanted.map(t => canon[norm(t)] || t))];
  const moved = wanted.filter(t => (canon[norm(t)] || t) !== t).length;
  console.log("  " + moved + " of them were redirects; asking Wikidata for " + real.length + " items...");
  const byTitle = await itemsForTitles(real);
  let viaArticle = 0;
  for (const m of men) {
    const art = links[norm(m.full)] || links[norm(m.n)];
    const qid = art && byTitle[norm(canon[norm(art)] || art)];
    if (qid) { m.qid = qid; m.viaArticle = true; viaArticle++; }
  }
  console.log("  resolved straight from the squad page: " + viaArticle + "/" + men.length);

  console.log("\nresolving the rest by name...");
  const resolved = {};
  let done = 0;
  for (const m of men) {
    if (m.viaArticle) { m.cands = [m.qid]; continue; }
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
    if (m.viaArticle) { sure++; tied++; continue; }
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
  /* ---------- 3b. the ones the search could not find ----------
     A candidate list where nobody has ever played for a team means the search
     handed back a given name, a family name or a company. Ask Wikidata for
     footballers with that label instead, which is precise where a text search
     is not. */
  const hasTeams = id => { const e = ents[id]; return e && claimIds(e, "P54").length > 0; };
  const lost = men.filter(m => !m.viaArticle && !m.cands.some(hasTeams));
  console.log("\nsearch found nobody with a club for " + lost.length + " men; asking Wikidata by label...");
  const byLabel = {};
  for (const group of chunk([...new Set(lost.map(m => m.full || m.n))], 18)) {
    const key = "mlx-" + require("crypto").createHash("sha1").update(group.join("|")).digest("hex").slice(0, 16) + ".json";
    let rows = cacheRead(key);
    if (!rows) {
      const vals = group.map(n => '"' + String(n).replace(/["\\]/g, "") + '"@en').join(" ");
      const q = `SELECT ?name ?p ?pLabel WHERE {
        VALUES ?name { ${vals} }
        ?p rdfs:label|skos:altLabel ?name .
        ?p wdt:P106 wd:Q937857 .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }`;
      rows = await sparql(q) || [];
      cacheWrite(key, rows);
      await sleep(1200);
    }
    for (const r of rows) {
      const nm = r.name.value;
      (byLabel[nm] = byLabel[nm] || []).push(r.p.value.split("/").pop());
    }
  }
  const found = [...new Set(Object.values(byLabel).flat())];
  if (found.length) {
    console.log("  " + found.length + " candidate footballers to check");
    Object.assign(ents, await entities(found));
    const moreCountries = [...new Set(found.flatMap(id => claimIds(ents[id], "P27")))]
      .filter(id => !countryEnts[id]);
    if (moreCountries.length) Object.assign(countryEnts, await entities(moreCountries));
    for (const m of lost) {
      const cands = (byLabel[m.full || m.n] || []).filter(hasTeams);
      if (!cands.length) continue;
      const sideish = norm(m.side);
      /* the passport decides, and a man with clubs beats one without */
      const best = cands.map(id => {
        const cits = claimIds(ents[id], "P27").map(c => labelOf(c, countryEnts));
        const nation = cits.some(c => norm(c) === sideish || norm(c).includes(sideish) || sideish.includes(norm(c)));
        return { id, score: (nation ? 4 : 0) + Math.min(claimIds(ents[id], "P54").length, 3) };
      }).sort((a, b) => b.score - a.score)[0];
      if (best && best.score >= 4) { m.qid = best.id; m.rescued = true; }
    }
    console.log("  rescued: " + lost.filter(m => m.rescued).length + "/" + lost.length +
      "   (" + lost.filter(m => m.rescued).map(m => m.full).slice(0, 10).join(", ") + ")");
  }

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
    if (isReserve(club)) return null;
    if (/United Kingdom/i.test(country)) return isPremier(club) ? "premier" : null;
    return DECK_FOR[country] || null;
  };
  let withAny = 0;
  const per = {}, struck = {};
  for (const m of men) {
    const spells = clubsOf[m.qid] || [];
    let lg = [...new Set(spells.map(deckOf).filter(Boolean))];
    const strike = STRIKE[m.full];
    if (strike) {
      for (const id of Object.keys(strike)) if (lg.includes(id)) (struck[m.full] = struck[m.full] || []).push(id);
      lg = lg.filter(id => !strike[id]);
    }
    m.lg = lg;
    if (lg.length) withAny++;
    for (const l of lg) per[l] = (per[l] || 0) + 1;
  }
  console.log("\nmen with at least one deck league: " + withAny + "/" + men.length +
              "  (" + (withAny / men.length * 100).toFixed(1) + "%)");
  console.log("per deck: " + Object.entries(per).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => k + " " + v).join("  "));
  /* WHAT THE TWO FILTERS THREW OUT. Printed, because a filter you cannot see
     working is a filter you cannot tell is over-eager. */
  const dropped = { reserve: new Set(), uk: new Set() };
  for (const m of men) for (const sp of (clubsOf[m.qid] || [])) {
    if (isReserve(sp.club)) dropped.reserve.add(sp.club);
    else if (/United Kingdom/i.test(sp.country) && !isPremier(sp.club)) dropped.uk.add(sp.club);
  }
  console.log("\nnot a top flight, so not a league tag:");
  console.log("  reserve and youth sides (" + dropped.reserve.size + "): " + [...dropped.reserve].sort().slice(0, 12).join(", "));
  console.log("  UK clubs never in the Premier League (" + dropped.uk.size + "): " + [...dropped.uk].sort().slice(0, 12).join(", "));

  /* A STRIKE THAT FIRES AT NOTHING IS FOLKLORE. Either Wikidata fixed the
     claim or we fixed the resolver, and either way the entry should go rather
     than sit there teaching the next reader something untrue. */
  /* ONLY THE MEN IN THIS POOL. A strike written for a 2006 man matches
     nothing in a 2022 harvest, which is not staleness, it is a different
     tournament. Saying so would train the next reader to ignore the warning. */
  const here = new Set(men.map(m => m.full));
  const idle = Object.keys(STRIKE).filter(n => here.has(n) && !struck[n]);
  if (Object.keys(struck).length)
    console.log("\nstruck: " + Object.entries(struck).map(([n, ids]) => n + " (" + ids.join(", ") + ")").join(", "));
  if (idle.length)
    console.log("STALE STRIKES, they matched nothing and should be deleted: " + idle.join(", "));

  console.log("\ntop club countries seen (to check the mapping catches the right ones):");
  console.log("  " + Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 14)
    .map(([k, v]) => (k || "?") + " " + v).join("  "));

  /* ONE MAN, IN FULL. When the checker says a league is missing, this says
     whether the item was wrong, the claim was absent or the country did not
     map, which are three different bugs with three different fixes. */
  if (WHO) {
    const m = men.find(x => norm(x.full) === norm(WHO)) || men.find(x => norm(x.n) === norm(WHO));
    if (!m) console.log("\nno man called " + WHO);
    else {
      console.log("\n" + (m.full || m.n) + "   " + m.side + "   item " + (m.qid || "unresolved") +
        (m.viaArticle ? " (from the squad page)" : m.rescued ? " (rescued by label)" : " (by search)"));
      for (const sp of (clubsOf[m.qid] || []))
        console.log("   " + sp.club.padEnd(38) + (sp.country || "?").padEnd(18) +
          (deckOf(sp) || "not a deck league"));
      console.log("   leagues: " + (m.lg.join(", ") || "none, so he asks the classic bank"));
      const st = STRIKE[m.full];
      if (st) for (const [id, why] of Object.entries(st)) console.log("   struck " + id + ": " + why);
    }
  }

  /* EVERY MAN, TO A FILE. Reading it once is the only way to know the harvest
     is right rather than merely plausible. */
  if (DUMP) {
    const out = [];
    for (const m of men) {
      out.push((m.full || m.n) + "  [" + m.side + "]  -> " + (m.lg.join(", ") || "-"));
      for (const sp of (clubsOf[m.qid] || []))
        out.push("      " + sp.club.padEnd(38) + (sp.country || "?"));
    }
    fs.writeFileSync(DUMP, out.join("\n") + "\n");
    console.log("\nwrote " + men.length + " men to " + DUMP);
  }

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
