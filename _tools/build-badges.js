/* Rebuild the Badge Zoom bank so BALL is hard rather than impossible.

     node _tools/build-badges.js            build it
     node _tools/build-badges.js --dry      report only, write nothing

   WHAT WAS WRONG. The bank was the logo library minus a filter: easy was the
   70 One & Only clubs, hard was the career deck, and BALL was everything
   else, all 2,196 of it. "Everything else" turned out to include FC Carrazeda
   de Ansiaes, Kendal Tornado and Maguary PE, which nobody at a table could
   name from the whole crest let alone a corner of it, and also the EFL Cup,
   the Scottish Championship and the CONCACAF Champions Cup, which are not
   clubs at all.

   HOW IT IS BUILT NOW. Two questions per crest, both answered from data.

   Is it a club? Wikidata says so or it does not go in: the article behind the
   logo has to be an instance of an association football club. That is what
   throws out the competitions and the national teams.

   Would anyone know it? A year of English Wikipedia pageviews, the same
   measure the kit bank uses, because sitelink counts rank a Lithuanian side
   that once reached a European tie above Heerenveen. Tiers are bands of that,
   and everything under the floor is dropped rather than filed under BALL.

   A crest you could not name with the whole thing in front of you is not a
   question, it is a shrug.

   SAFE TO RE-RUN. Slow: it asks about every crest in the library. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "assets", "badges");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const DRY = process.argv.includes("--dry");
const WIKI = "https://en.wikipedia.org/w/api.php";
const CACHE = path.join(__dirname, "_models", "badge-fame.json");   // gitignored, saves a re-run

/* how many views a year before a crest is worth asking about at all */
const FLOOR = 12000;
/* Tier sizes, not view thresholds. Thresholds were guesswork and put
   Aldershot Town in hard at +5, which is not hard, it is unanswerable for
   three men in Maastricht. Sizes are honest about what this is: a ranking,
   cut into four. */
const BANDS = [["easy", 140], ["normal", 210], ["hard", 250], ["ball", Infinity]];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      return null;
    } catch (e) { if (i === tries - 1) return null; await sleep(1200 * (i + 1)); }
  }
  return null;
}

/* slug -> a title to ask Wikipedia about. The library is flat slugs, so the
   name in the old bank is the better starting point where there is one. */
/* A crest that is not a club's, whatever an article search says. The search
   fallback is willing: it answered "chile-national-team" with Club
   Universidad de Chile and "egypt-national-team" with National Bank of Egypt
   SC, both real clubs, so the club test passed and a national badge nearly
   shipped as a club to name. */
const NOT_A_CLUB = /(^|-)(national-team|nationalteam|federation|fa|selection|league|cup|championship|liga|serie|eredivisie|bundesliga)(-|$)/;

/* Does the answer belong to the crest? The search rescue is willing: it
   answered "tau-calcio-altopascio" with Como 1907 and "1st-lig" with
   Trabzonspor, and the mode would then show one badge and insist on another
   club's name.

   This is deliberately the SAME test _tests/badge-test.js runs on the shipped
   bank, prefix-matched on four letters so Crvena Zvezda still answers to Red
   Star and a rename is not treated as a mismatch. A stricter whole-word
   version was tried first and took the bank from 1,493 to 613, because a club
   is routinely filed under a name its crest file never used. Anything that
   genuinely reads as two different clubs is listed at the end rather than
   silently dropped. */
const RENAMED = new Set(["chance-liga", "parva-liga", "persha-liga", "ab", "b-93", "crvena-zvezda", "zvezda"]);
const wordsOf = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a").replace(/ß/g, "ss")
    .replace(/đ|ð/g, "d").replace(/ł/g, "l").replace(/ı/g, "i").replace(/þ/g, "th")
  .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(w => w.length > 2);
const answersToCrest = (slug, name) => {
  if (RENAMED.has(slug)) return true;
  const a = wordsOf(slug), b = wordsOf(name);
  return a.some(w => b.some(v => v.startsWith(w.slice(0, 4)) || w.startsWith(v.slice(0, 4))));
};

function titleGuess(slug, name) {
  if (name) return name;
  return slug.split("-").map(w => w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)).join(" ");
}

async function resolve(titles) {
  const out = {};
  for (const batch of chunk(titles, 40)) {
    const j = await getJSON(WIKI + "?action=query&format=json&formatversion=2&redirects=1"
      + "&prop=pageprops&ppprop=wikibase_item&titles=" + encodeURIComponent(batch.join("|")));
    const back = {};
    for (const r of (j && j.query && j.query.redirects) || []) back[r.to] = r.from;
    for (const r of (j && j.query && j.query.normalized) || []) back[r.to] = back[r.to] || r.from;
    for (const p of (j && j.query && j.query.pages) || []) {
      if (p.missing || !p.pageprops) continue;
      out[back[p.title] || p.title] = { title: p.title, qid: p.pageprops.wikibase_item };
    }
    process.stdout.write(".");
    await sleep(150);
  }
  return out;
}

/* is it a football club, or is it a cup, a league or a country? */
async function areClubs(qids) {
  /* Q476028 is association football club, checked rather than remembered.
     The first pass also allowed Q15991303, which is association football
     LEAGUE, and duly filed the Ekstraklasa as a club to guess. */
  const CLUB = new Set(["Q476028"]);
  const ok = new Set();
  for (const batch of chunk(qids, 45)) {
    const j = await getJSON("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
      + "&props=claims&ids=" + batch.join("|"));
    for (const [id, e] of Object.entries((j && j.entities) || {})) {
      const types = ((e.claims && e.claims.P31) || [])
        .map(c => c.mainsnak.datavalue && c.mainsnak.datavalue.value.id).filter(Boolean);
      if (types.some(t => CLUB.has(t))) ok.add(id);
    }
    process.stdout.write(".");
    await sleep(200);
  }
  return ok;
}

async function areClubsQuiet(qids){
  const before = process.stdout.write;
  process.stdout.write = () => true;          // no dots from the retry loop
  try { return await areClubs(qids); } finally { process.stdout.write = before; }
}

async function views(title) {
  const t = encodeURIComponent(title.replace(/ /g, "_"));
  const j = await getJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/monthly/2024010100/2024123100`, 2);
  return j && j.items ? j.items.reduce((a, i) => a + (i.views || 0), 0) : 0;
}

(async () => {
  const logos = fs.readdirSync(path.join(REPO, "assets/logos")).filter(f => f.endsWith(".png"));
  const old = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8"));
  const nameOf = {};
  for (const tier of Object.values(old)) for (const b of tier) nameOf[b.s] = b.n;
  const slugs = logos.map(f => f.slice(0, -4));
  console.log(`${slugs.length} crests in the library, ${Object.keys(nameOf).length} already named\n`);

  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, "utf8")); } catch (e) {}

  /* A flat slug is not a title: "fc-carrazeda-de-ansiaes" will never match
     "F.C. Carrazeda de Ansiães", and the first pass counted every miss as
     "not a football club", which is how 1,891 crests were thrown out of a
     library that is almost entirely football clubs. Anything that failed the
     exact lookup gets searched for instead, once, and the answer is cached
     with how it was found so a re-run does not repeat the work. */
  const todo = slugs.filter(s => !cache[s] && !NOT_A_CLUB.test(s));
  const retry = slugs.filter(s => cache[s] && !cache[s].club && cache[s].how !== "search" && !NOT_A_CLUB.test(s));
  console.log(`${todo.length} to look up, ${retry.length} to search for again, ${slugs.length - todo.length - retry.length} settled`);

  if (retry.length) {
    process.stdout.write("searching  ");
    let done = 0, rescued = 0;
    for (const batch of chunk(retry, 1)) {
      const slug = batch[0];
      const q = titleGuess(slug, nameOf[slug]) + " football club";
      const j = await getJSON(WIKI + "?action=query&format=json&formatversion=2&list=search&srlimit=1&srsearch="
        + encodeURIComponent(q));
      const hit = j && j.query && j.query.search && j.query.search[0];
      cache[slug] = { title: hit ? hit.title : null, club: false, views: 0, how: "search" };
      if (hit) {
        const r = await resolve([hit.title]);
        const f = r[hit.title];
        if (f) {
          const isClub = (await areClubsQuiet([f.qid])).has(f.qid);
          cache[slug] = { title: f.title, qid: f.qid, club: isClub, views: isClub ? await views(f.title) : 0, how: "search" };
          if (isClub) rescued++;
        }
      }
      if (++done % 25 === 0) {
        process.stdout.write(`\r  searched ${done}/${retry.length}, ${rescued} were clubs after all   `);
        fs.mkdirSync(path.dirname(CACHE), { recursive: true });
        fs.writeFileSync(CACHE, JSON.stringify(cache));
      }
      await sleep(120);
    }
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    console.log(`\r  searched ${done}, ${rescued} were clubs after all            `);
  }

  if (todo.length) {
    process.stdout.write("wikipedia  ");
    const asked = {};
    for (const s of todo) asked[titleGuess(s, nameOf[s])] = s;
    const found = await resolve(Object.keys(asked));
    console.log(`\n  ${Object.keys(found).length} of ${todo.length} matched an article`);

    process.stdout.write("wikidata   ");
    const clubs = await areClubs([...new Set(Object.values(found).map(f => f.qid))]);
    console.log(`\n  ${clubs.size} of them are football clubs`);

    process.stdout.write("pageviews  ");
    let n = 0;
    for (const [asking, slug] of Object.entries(asked)) {
      const f = found[asking];
      const isClub = !!(f && clubs.has(f.qid));
      /* the id is kept so a later change to what counts as a club can be
         re-checked in place. The first version of this did not, and when the
         club test turned out to be wrong there was no way to re-run it
         without re-resolving 2,894 articles. */
      cache[slug] = { title: f ? f.title : null, qid: f ? f.qid : null, club: isClub, views: 0 };
      if (isClub) cache[slug].views = await views(f.title);
      if (++n % 40 === 0) {
        process.stdout.write(`\r  ${n}/${todo.length}`);
        fs.mkdirSync(path.dirname(CACHE), { recursive: true });
        fs.writeFileSync(CACHE, JSON.stringify(cache));
      }
      await sleep(70);
    }
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    console.log(`\r  ${n}/${todo.length} done          `);
  }

  /* how many language editions write about each club, the second fame signal */
  const needLinks = slugs.filter(s => cache[s] && cache[s].club && cache[s].qid && cache[s].links === undefined);
  if (needLinks.length) {
    process.stdout.write("sitelinks  ");
    for (const batch of chunk(needLinks, 45)) {
      const j = await getJSON("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
        + "&props=sitelinks&ids=" + batch.map(s => cache[s].qid).join("|"));
      for (const s of batch) {
        const e = j && j.entities && j.entities[cache[s].qid];
        cache[s].links = e && e.sitelinks ? Object.keys(e.sitelinks).length : 0;
      }
      process.stdout.write(".");
      await sleep(180);
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    console.log("");
  }

  /* ---------- who this table actually knows ----------
     Pageviews are English Wikipedia, so they rank Port Vale and Bury above
     Willem II and Tenerife. True of the world, useless for three men who
     follow the Eredivisie and LaLiga. Dutch and Spanish clubs are worth more
     to this table than the raw number says, so they carry a multiplier, and
     the country comes from Wikidata rather than from a guess at the name. */
  const HOME = { Q55: 2.6, Q29: 2.4 };            // Netherlands, Spain
  const needCountry = slugs.filter(s => cache[s] && cache[s].club && cache[s].qid && cache[s].country === undefined);
  if (needCountry.length) {
    process.stdout.write("countries  ");
    for (const batch of chunk(needCountry, 45)) {
      const j = await getJSON("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
        + "&props=claims&ids=" + batch.map(s => cache[s].qid).join("|"));
      for (const s of batch) {
        const e = (j && j.entities || {})[cache[s].qid];
        const c = e && e.claims && e.claims.P17 && e.claims.P17[0]
          && e.claims.P17[0].mainsnak.datavalue && e.claims.P17[0].mainsnak.datavalue.value.id;
        cache[s].country = c || null;
      }
      process.stdout.write(".");
      await sleep(200);
    }
    fs.writeFileSync(CACHE, JSON.stringify(cache));
    console.log("");
  }

  /* ---------- ranking ----------
     TWO SIGNALS, AND THE BETTER OF THE TWO WINS.

     English pageviews are an English audience: they put Aldershot Town at 536
     and Ascoli at 890, true of England and no use to a table in Maastricht.
     Sitelinks, the number of language editions that bother to write about a
     club, are the opposite bias and inflate small European sides, which is
     the trap the kit bank fell into.

     Neither alone works and multiplying them punishes a club for one bad
     number: Hertha BSC has a sitelink count that reads like a fourth-tier
     side and dropped to 420 on a geometric mean. Taking the better rank is
     forgiving of a broken signal and strict about genuine obscurity, and it
     moves the ones that were wrong: Grasshopper 1080 to 223, Ascoli 890 to
     324, Aldershot 536 down to 636. */
  let rows = slugs.map(s => ({ s, n: nameOf[s] || (cache[s] && cache[s].title) || s, ...(cache[s] || {}) }))
    .filter(r => r.club && r.views >= FLOOR)
    .filter(r => !NOT_A_CLUB.test(r.s))
    .filter(r => answersToCrest(r.s, r.n))
    .map(r => ({ ...r, w: r.views * (HOME[r.country] || 1), l: (r.links || 0) * (HOME[r.country] || 1) }));

  const rankBy = key => {
    const order = [...rows].sort((a, b) => b[key] - a[key]);
    const m = new Map();
    order.forEach((r, i) => m.set(r.s, i + 1));
    return m;
  };
  /* One club, one crest. Two logo files can resolve to the same article, and
     then the same answer turns up at two difficulties: Real Zaragoza was easy
     as "zaragoza" and normal as "real-zaragoza". Worse, some of those pairs
     are a mis-map rather than a duplicate, and the slug that matches the name
     least is the wrong one: "zurich" was answering Grasshopper Club Zurich,
     which is the other club in that city. Keep the closest match, drop the
     rest, and say how many went. */
  const overlap = (slug, name) => {
    const a = wordsOf(slug), b = wordsOf(name);
    return a.filter(w => b.some(v => v.startsWith(w.slice(0, 4)) || w.startsWith(v.slice(0, 4)))).length;
  };
  const best = new Map();
  for (const r of rows) {
    const cur = best.get(r.n);
    if (!cur || overlap(r.s, r.n) > overlap(cur.s, cur.n)) best.set(r.n, r);
  }
  const twins = rows.length - best.size;
  rows = rows.filter(r => best.get(r.n) === r);

  const byViews = rankBy("w"), byLinks = rankBy("l");
  rows.forEach(r => r.rank = Math.min(byViews.get(r.s), byLinks.get(r.s)));
  rows.sort((a, b) => a.rank - b.rank || b.w - a.w);

  const bank = { easy: [], normal: [], hard: [], ball: [] };
  let at = 0;
  for (const [tier, size] of BANDS) {
    for (const r of rows.slice(at, size === Infinity ? undefined : at + size)) bank[tier].push({ s: r.s, n: r.n });
    at += size === Infinity ? rows.length : size;
  }

  const wrongName = slugs.map(s => ({ s, n: nameOf[s] || (cache[s] && cache[s].title) || s, ...(cache[s] || {}) }))
    .filter(r => r.club && r.views >= FLOOR && !NOT_A_CLUB.test(r.s) && !answersToCrest(r.s, r.n));
  const dropped = slugs.length - rows.length;
  const notClub = slugs.filter(s => cache[s] && !cache[s].club).length;
  console.log(`\n${rows.length} crests kept, ${dropped} dropped`);
  console.log(`  ${notClub} were not football clubs at all (cups, leagues, countries)`);
  console.log(`  ${dropped - notClub - wrongName.length} were clubs nobody could name`);
  console.log(`  ${wrongName.length} answered to a club that was not the one on the crest`);
  console.log(`  ${twins} were a second crest for a club already in the bank`);
  wrongName.slice(0, 8).forEach(r => console.log(`      ${r.s} -> ${r.n}`));
  console.log("\n" + Object.entries(bank).map(([t, r]) => `  ${t.padEnd(7)} ${String(r.length).padStart(4)}`).join("\n"));
  for (const [t, r] of Object.entries(bank)) {
    console.log(`\n${t}, hardest five:`);
    r.slice(-5).forEach(x => console.log(`   ${x.n}`));
  }

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(bank, null, 1));
  console.log(`\nwritten to assets/badges/index.json`);
})();
