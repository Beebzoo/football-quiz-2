/* Build the Manager Path deck for BALL.

   Two Wikidata queries feed this. Run them at https://query.wikidata.org, save
   the JSON results beside this script, then run:  node _tools/build-managers.js

   mgr.json — every manager with 25+ Wikipedia language versions, and every
   team they have coached, with the date they took the job:

     SELECT ?m ?mLabel ?links ?club ?clubLabel ?clubShort ?start ?isClub ?isNat WHERE {
       ?m wdt:P106 wd:Q628099 ; wikibase:sitelinks ?links .
       FILTER(?links >= 25)
       ?m p:P6087 ?st . ?st ps:P6087 ?club .
       OPTIONAL { ?st pq:P580 ?start }
       OPTIONAL { ?club wdt:P1813 ?clubShort }
       BIND(EXISTS{?club wdt:P31/wdt:P279* wd:Q476028} AS ?isClub)
       BIND(EXISTS{?club wdt:P31/wdt:P279* wd:Q6979593} AS ?isNat)
       SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
     }

   alts.json — every other name those teams go by. This is how "FC Bayern
   Munich" reaches the crest filed on disk as bayern-munchen:

     SELECT ?club ?alt WHERE {
       ?m wdt:P106 wd:Q628099 ; wikibase:sitelinks ?links .
       FILTER(?links >= 25)
       ?m wdt:P6087 ?club .
       { ?club skos:altLabel ?alt . FILTER(LANG(?alt) IN ("en","de","es","it","fr","pt","nl","tr")) }
       UNION { ?club rdfs:label ?alt . FILTER(LANG(?alt) IN ("de","es","it","fr","pt","nl","tr")) }
       UNION { ?club wdt:P1705 ?alt }
     }

   Writes assets/managers/index.json, and manager-logos-block.js to paste into
   sw.js so the dugout crests survive the pub's dead wifi too. Wikidata is CC0,
   so unlike the photo banks this deck carries no attribution tail.

   The hard part is not the careers, it is matching Wikidata's team labels onto
   the logo slugs in assets/logos, which follow no single convention:
   "fiorentina" but "bayern-munchen", "marseille" but "queens-park-rangers". */
const fs = require("fs");
const path = require("path");

const REPO = "c:/dev/_Personal/Hobbies/Football Quiz";
const slugs = new Set(fs.readdirSync(path.join(REPO, "assets/logos"))
  .filter(f => f.endsWith(".png")).map(f => f.slice(0, -4)));

const strip = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const slugify = s => strip(String(s)).toLowerCase()
  .replace(/&/g, " and ").replace(/['’.]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* Sides that are not the senior men's team share a name with it but never a
   crest, and "Germany under-19" is not a career step anyone shouts out.
   Tested against the primary label only: Marseille's English alias is
   "Olympic Marseille", and matching that would delete Marseille. */
const DROP = /(^|-)(under-\d+|u-?\d\d|womens?|olympic-(football-)?team|futsal|beach-soccer|juvenil|juniors?|next-gen|reserves?|academy|youth|b-team|ii|iii)(-|$)/;

// "Romania men's national association football team" -> "romania-national-team"
const natFix = s => s
  .replace(/-mens-/, "-").replace(/-men-/, "-")
  .replace(/-national-(association-)?(football|soccer)-team$/, "-national-team")
  .replace(/-national-team-.*$/, "-national-team");

/* Nations filed on disk under a demonym, an old name, or their federation
   crest, which for Portugal is what the national side actually wears. */
const NAT_ALIAS = {
  "netherlands-national-team": "dutch-national-team",
  "holland-national-team": "dutch-national-team",
  "ivory-coast-national-team": "cote-d-ivoire-national-team",
  "portugal-national-team": "portuguese-football-federation",
  "united-states-national-team": "usa-national-team",
  "united-states-soccer-national-team": "usa-national-team",
  "czechia-national-team": "czech-republic-national-team",
  "republic-of-ireland-national-team": "ireland-national-team",
  "china-pr-national-team": "china-national-team",
};

/* Club-type abbreviations and filler that lead a name without identifying it.
   Only these may be stripped from the FRONT before matching. */
const LEAD = new Set(["fc","afc","cf","cfr","sc","scr","ac","acf","as","asd","ss","ssc","ssd","us","usd","usc",
  "cd","ca","ce","cs","csa","rc","rcd","sv","tsv","tsg","vfb","vfl","fsv","bsc","msv","kfc","krc","kv","kaa","rsc",
  "nk","hnk","fk","ofk","pfc","sk","mfk","ask","bk","if","ifk","ff","gd","ad","ao","aek","apoel","the","1",
  "club","clube","futbol","football","futebol","calcio","sporting","association","associacao","asociacion",
  "deportivo","deportiva","societa","polisportiva","unione","real","royal","koninklijke"]);

/* Candidate names, longest first, anchored at the front once leading club-type
   noise is gone. Anchoring is what stops "Wimbledon F.C." matching the bare
   slug "athletic" via an alias, or "FC Rukh Brest" landing on Stade Brestois:
   the identifying word of a club name comes first, what trails it is usually
   the city. Longest-first keeps "arronches-e-benfica" off the real Benfica. */
const deLead = slug => { let t = slug.split("-"); while (t.length > 1 && LEAD.has(t[0])) t = t.slice(1); return t; };
function prefixes(slug, allowTruncate) {
  const t = deLead(slug), out = [];
  const min = allowTruncate ? 1 : t.length;
  for (let len = t.length; len >= min; len--) out.push({ s: t.slice(0, len).join("-"), len });
  return out;
}
// generic football words that must never stand alone as a match
const GENERIC = new Set(["athletic","atletico","union","internacional","nacional","national","sporting",
  "olympic","olympique","racing","rangers","wanderers","rovers","city","town","united","county","academy",
  "juventud","juventus-next","santa-cruz","central","americano","independiente","universidad","tigre"]);

/* own  = the club's real name and short name. Trusted, so trailing words (the
          city, the founding year) may be dropped to reach the core name.
   alias = every other spelling Wikidata carries. Useful for native forms like
          "FC Bayern München", but trimming them invents clubs: "Racing Club
          Genk" would surrender the slug "racing-club". Leading FC/AC/SC only. */
function resolve(primary, own, alias) {
  if (DROP.test(slugify(primary))) return { drop: true };
  const norm = list => {
    const seen = new Set(), out = [];
    for (const raw of list.filter(Boolean)) {
      const b = natFix(slugify(raw));
      if (!seen.has(b)) { seen.add(b); out.push(b); }
    }
    return out;
  };
  const ownS = norm(own), aliasS = norm(alias);
  for (const p of ownS) if (slugs.has(p)) return { slug: p, how: "exact" };
  /* Wikidata lists "Athletic" as an alias of Wigan, and "athletic.png" is
     Bilbao. A bare generic word is never enough on its own, whoever says it. */
  for (const p of aliasS) if (!GENERIC.has(p) && slugs.has(p)) return { slug: p, how: "exact" };
  for (const p of [...ownS, ...aliasS]) if (NAT_ALIAS[p] && slugs.has(NAT_ALIAS[p])) return { slug: NAT_ALIAS[p], how: "alias" };
  let best = null;
  const tryList = (list, truncate) => {
    for (const p of list)
      for (const c of prefixes(p, truncate))
        if (c.s.length >= 4 && !GENERIC.has(c.s) && slugs.has(c.s))
          if (!best || c.len > best.len || (c.len === best.len && c.s.length > best.s.length)) best = c;
  };
  tryList(ownS, true);
  if (!best) tryList(aliasS, false);
  return best ? { slug: best.s, how: "trimmed" } : null;
}

// ---- read the dumps ------------------------------------------------------
const rows = require("./mgr.json").results.bindings;
const alts = new Map();
for (const r of require("./alts.json").results.bindings) {
  if (!alts.has(r.club.value)) alts.set(r.club.value, new Set());
  alts.get(r.club.value).add(r.alt.value);
}

const teams = new Map(), people = new Map();
for (const r of rows) {
  const tq = r.club.value;
  if (!teams.has(tq)) teams.set(tq, { label: r.clubLabel?.value || "", short: r.clubShort?.value || "", isNat: r.isNat?.value === "true" });
  if (r.clubShort && !teams.get(tq).short) teams.get(tq).short = r.clubShort.value;
  const pq = r.m.value;
  if (!people.has(pq)) people.set(pq, { name: r.mLabel?.value || "", links: +(r.links?.value || 0), spells: [] });
  people.get(pq).spells.push({ tq, start: r.start?.value || null });
}
for (const [q, t] of teams) {
  const r = resolve(t.label, [t.short, t.label], [...(alts.get(q) || [])]) || {};
  t.slug = r.slug || null; t.how = r.how; t.drop = !!r.drop;
}

const live = [...teams.values()].filter(t => !t.drop);
const hit = live.filter(t => t.slug);
console.log(`teams ${teams.size}  (youth/women's dropped ${teams.size - live.length})`);
console.log(`matched ${hit.length}/${live.length} (${(hit.length / live.length * 100).toFixed(1)}%)  ` +
  `exact ${hit.filter(t => t.how === "exact").length} / alias ${hit.filter(t => t.how === "alias").length} / trimmed ${hit.filter(t => t.how === "trimmed").length}`);

// ---- build the careers ---------------------------------------------------
const MIN_CLUBS = 3, MAX_SKIPPED = 2, MIN_LINKS = 30;
const deck = [], missing = new Map();
let cutFame = 0, cutShort = 0, cutGappy = 0;
for (const p of people.values()) {
  const dated = p.spells.filter(s => s.start).sort((a, b) => a.start.localeCompare(b.start));
  if (!dated.length) continue;
  const seq = []; let skipped = 0;
  for (const s of dated) {
    const t = teams.get(s.tq);
    if (t.drop) continue;                       // never was a career step
    if (!t.slug) { if (t.label) missing.set(t.label, (missing.get(t.label) || 0) + 1); skipped++; continue; }
    if (seq[seq.length - 1] !== t.slug) seq.push(t.slug); // fold repeat spells
  }
  if (p.links < MIN_LINKS) { cutFame++; continue; }
  if (seq.length < MIN_CLUBS) { cutShort++; continue; }
  // a career with holes in it points at the wrong man, so only small gaps pass
  if (skipped > MAX_SKIPPED) { cutGappy++; continue; }
  deck.push({ n: p.name, c: seq, links: p.links, skipped });
}
deck.sort((a, b) => b.links - a.links);
console.log(`\ndeck: ${deck.length} managers   (dropped: ${cutFame} too obscure, ${cutShort} too few clubs, ${cutGappy} too gappy)`);
console.log(`  complete careers: ${deck.filter(d => !d.skipped).length}   avg clubs: ${(deck.reduce((s, d) => s + d.c.length, 0) / deck.length).toFixed(1)}`);

console.log(`\ntop 20:`);
deck.slice(0, 20).forEach(d => console.log(`  ${String(d.links).padStart(3)}  ${d.n.padEnd(22)} ${d.c.join(" > ")}${d.skipped ? `   [${d.skipped} skipped]` : ""}`));

console.log(`\nstill-missing crests (most wanted):`);
[...missing.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([l, n]) => console.log(`  ${String(n).padStart(3)}x  ${l}`));

// the shipped bank keeps only what the game reads
const bank = deck.map(d => d.skipped ? { n: d.n, c: d.c, note: "Some spells simplified" } : { n: d.n, c: d.c });
fs.writeFileSync(path.join(REPO,"assets/managers/index.json"), JSON.stringify(bank));
fs.writeFileSync("managers-raw.json", JSON.stringify(deck, null, 1));
fs.writeFileSync("team-matches.json", JSON.stringify([...teams.entries()].map(([q, t]) => ({ q, ...t })), null, 1));
console.log(`\nwrote assets/managers/index.json (${(fs.statSync(path.join(REPO,"assets/managers/index.json")).size / 1024).toFixed(1)} KB)`);

/* ---- the sw.js precache block, so offline play covers the dugout too ---- */
const swText = fs.readFileSync(path.join(REPO, "sw.js"), "utf8");
const inCareer = new Set((((swText.match(/const CAREER_LOGOS = \[([\s\S]*?)\];/) || ["", ""])[1])
  .match(/"[a-z0-9-]+"/g) || []).map(v => v.slice(1, -1)));
const extra = [...new Set(bank.flatMap(m => m.c))].filter(s => !inCareer.has(s)).sort();
const lines = []; let cur = "";
for (const s of extra) {
  const t = JSON.stringify(s);
  if (cur && ("  " + cur + "," + t).length > 94) { lines.push("  " + cur + ","); cur = t; }
  else cur = cur ? cur + "," + t : t;
}
if (cur) lines.push("  " + cur);
fs.writeFileSync("manager-logos-block.js", "const MANAGER_LOGOS = [\n" + lines.join("\n") + "];\n");
console.log(`\n${extra.length} crests Career Path does not already cache -> manager-logos-block.js`);
console.log(`paste it over the MANAGER_LOGOS array in sw.js whenever the deck changes`);
