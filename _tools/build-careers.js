/* Top the Career Path deck up towards 1,000 players, from Wikidata.

     node _tools/build-careers.js --dry        report only, write nothing
     node _tools/build-careers.js --target 1000    build it

   The first 503 careers were researched by hand, a fan-out of agents reading
   Wikipedia. That was slow, and it also dated: a deck written from memory
   still had Casemiro at Manchester United. This asks Wikidata instead, which
   is current, machine readable and CC0.

   THE ONE THING THAT MATTERS. P54 is "member of sports team", NOT "member of
   club". A player's P54 list holds his national side, every youth side he ever
   appeared for, and the B team, mixed in with the clubs. Take it at face value
   and Career Path shows you the Brazil under-17 crest as clue one.

   The obvious test, "is it P31 association football club", is WRONG, and wrong
   in the quiet way. Wikidata files big clubs as Q103229495 men's association
   football team and smaller ones as Q476028 association football club, two
   parallel modellings, and the national sides sit in the first one alongside
   Barcelona. So that test called FC Barcelona and Chelsea "not clubs", and
   because a failed test only dropped the item from the route, Ronaldo shipped
   as Cruzeiro, PSV, Inter, Real Madrid, Milan, Corinthians. Every crest right,
   Barcelona missing, and nothing anywhere said so.

   What actually separates them is P1532, country for sport: national teams
   carry it and clubs do not. So national sides are identified positively and
   dropped, and everything else has to find its crest or the WHOLE CAREER is
   thrown away. Silently dropping a club is the one failure this tool must not
   have: a route with a hole in it is not a hard question, it is a wrong one.

   INCOMPLETE RECORDS get caught by the national team dates that are sitting
   right there. A man does not play for his senior country before his first
   club, so if the senior cap predates the first club spell, the club record
   has a hole in it and the career is dropped. That is what catches João Félix,
   whose item knows about Milan and Al-Nassr but not Benfica or Atlético.

   MATCHING CLUBS TO CRESTS is the other half. The logo library is 2,894 flat
   slugs with no ids, and it names clubs the way a supporter would: sampdoria,
   nice, brest, sparta-praha, spartak-moskva. Wikidata says "U.C. Sampdoria",
   "OGC Nice", "Stade Brestois 29", "AC Sparta Prague". So a club is matched on
   a normalised key against EVERY name it has, in every language, and if that
   fails, on its distinctive core word, but only when exactly one crest in the
   library answers to it. The uniqueness test is the whole safety net: "United"
   belongs to a dozen clubs and a wrong crest is worse than a missing player.
   A career ships only if every senior club in it found its crest. A gap in the
   middle is not a career, it is a lie about one.

   FAME IS PAGEVIEWS, sitelinks only shortlist. Sitelink counts flatter anyone
   with a stub in forty languages; a year of English pageviews is what actually
   sorts a name the three of them will get from one they will not. Same measure
   as the kit and badge banks.

   SAFE TO RE-RUN. Every network stage caches to _tools/_models/ (gitignored),
   so re-running costs nothing and the matcher can be tuned for free. Existing
   careers are never touched, only appended to.  */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const HTML = path.join(REPO, "index.html");
const MODELS = path.join(__dirname, "_models");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const WD = "https://www.wikidata.org/w/api.php";
const DRY = process.argv.includes("--dry");
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const TARGET = +(arg("--target") || 1000);

/* Q937857 is association football player, checked rather than trusted: the
   pool has to come back with the famous names on top. A wrong id here is the
   Bundesliga-for-Eredivisie mistake. There is deliberately no club id here,
   see the header: no single class means "club". */
const PLAYER = "Q937857";

/* the shortlist gate. Everything above this many sitelinks gets looked at;
   pageviews then do the real ranking. */
const SITELINKS = 26;
/* a career worth showing: at least this many distinct clubs, and no more than
   this, because a twelve crest reveal is a slideshow, not a question. */
const MIN_CLUBS = 3, MAX_CLUBS = 9;
/* below this many English pageviews a year, nobody at the table has heard of
   him, and Career Path has no consolation for a name you cannot guess. */
const FLOOR = 40000;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

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

/* ---------- names to keys ---------- */

/* Everything a club might be called, flattened to one comparable shape:
   accents off, brackets off, punctuation off, the letters that mean "football
   club" in a dozen languages off, hyphenated. "U.C. Sampdoria" and "Sampdoria"
   both come out "sampdoria". */
const FURNITURE = new RegExp("\\b(" + [
  "fc", "cf", "afc", "sc", "ac", "as", "ss", "ssc", "ud", "cd", "cf", "rcd", "sd", "sv", "tsv", "vfb", "vfl",
  "bv", "bsc", "ks", "fk", "nk", "hnk", "gnk", "pfc", "cfc", "ogc", "uc", "us", "usc", "asd", "ssd", "aas",
  "rc", "rcf", "acf", "aik", "if", "bk", "ik", "gif", "kv", "rsc", "kaa", "kfc", "srl", "spa",
  "club", "clube", "klub", "football", "fotball", "fussball", "futbol", "futebol", "calcio", "voetbal",
  "soccer", "association", "associacao", "asociacion", "athletic", "atletico", "atletic", "deportivo",
  "deportiva", "sporting", "sport", "sports", "sportif", "sportive", "sportclub", "spor", "kulubu",
  "team", "de", "del", "la", "le", "les", "el", "det"
].join("|") + ")\\b", "g");

function keyOf(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[.'`’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(FURNITURE, " ")
    .replace(/\b(1[89]\d\d|20[0-2]\d)\b/g, " ")   /* founding years: "Lucchese 1905" */
    .replace(/\s+/g, " ").trim()
    .replace(/ /g, "-");
}

/* The senior clubs out of an "infobox football biography", in order. Youth
   clubs are a separate field and stay out of it; loan arrows and (loan) notes
   are stripped because a loan is still a club you can be asked about. */
function parseCareer(wikitext) {
  const clubs = {}, years = {};
  for (const line of (wikitext || "").split("\n")) {
    let m = line.match(/^\s*\|\s*clubs(\d+)\s*=\s*(.*)$/);
    if (m) { clubs[+m[1]] = m[2].trim(); continue; }
    m = line.match(/^\s*\|\s*years(\d+)\s*=\s*(.*)$/);
    if (m) years[+m[1]] = m[2].trim();
  }
  const out = [];
  for (const i of Object.keys(clubs).map(Number).sort((a, b) => a - b)) {
    let v = (clubs[i] || "").replace(/\u2192/g, " ").replace(/\(loan\)/ig, " ").replace(/<!--[\s\S]*?-->/g, " ").trim();
    if (!v || /^\{\{/.test(v)) continue;
    const link = v.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    const target = (link ? link[1] : v.replace(/'''?/g, "")).trim();
    const display = (link ? (link[2] || link[1]) : target).trim();
    if (!target || /[{}|]/.test(target)) continue;
    out.push({ target, display, years: years[i] || "" });
  }
  return out;
}

/* ---------- the existing deck ---------- */

function readCareers(html) {
  const i = html.indexOf("const CAREERS = [");
  const j = html.indexOf("\n];", i);
  if (i < 0 || j < 0) throw new Error("could not find CAREERS in index.html");
  const src = html.slice(i + "const CAREERS = ".length, j + 2);
  return { list: eval(src), at: i, end: j };
}

/* Two spellings of one man must not both ship. Accents off, punctuation off,
   and the middle names Wikidata likes ("Carlos Henrique Casimiro") reduced to
   the ends, because that is how the deck already writes them. */
const nameKey = n => n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

(async () => {
  const html = fs.readFileSync(HTML, "utf8");
  const { list: existing } = readCareers(html);
  const have = new Set(existing.map(c => nameKey(c.n)));
  const need = TARGET - existing.length;
  console.log(`${existing.length} careers in the deck, target ${TARGET}, so ${need} to find\n`);
  if (need <= 0) { console.log("nothing to do"); return; }

  const logos = fs.readdirSync(path.join(REPO, "assets/logos")).filter(f => f.endsWith(".png")).map(f => f.slice(0, -4));

  /* ---------- 1. the shortlist ---------- */
  let pool = cacheRead("careers-pool.json");
  if (!pool) {
    console.log(`asking Wikidata for footballers with more than ${SITELINKS} sitelinks...`);
    const rows = await sparql(`SELECT ?p ?sl WHERE {
      ?p wdt:P106 wd:${PLAYER} ; wikibase:sitelinks ?sl .
      FILTER(?sl > ${SITELINKS})
    } ORDER BY DESC(?sl)`);
    if (!rows) throw new Error("the query service would not answer; try again in a minute");
    pool = rows.map(b => b.p.value.split("/").pop());
    cacheWrite("careers-pool.json", pool);
  }
  console.log(`${pool.length} candidates in the pool`);

  /* ---------- 2. their spells ---------- */
  let spells = cacheRead("careers-spells.json") || {};
  const toFetch = pool.filter(q => !spells[q]);
  if (toFetch.length) {
    process.stdout.write(`reading ${toFetch.length} careers  `);
    let n = 0;
    for (const batch of chunk(toFetch, 45)) {
      const j = await getJSON(WD + "?action=wbgetentities&format=json&props=claims%7Clabels%7Csitelinks"
        + "&languages=en&sitefilter=enwiki&ids=" + batch.join("|"));
      for (const id of batch) {
        const e = j && j.entities && j.entities[id];
        if (!e) { spells[id] = { name: null, sp: [] }; continue; }
        const sp = [];
        for (const c of (e.claims && e.claims.P54) || []) {
          const v = c.mainsnak.datavalue && c.mainsnak.datavalue.value.id;
          if (!v) continue;
          const qual = c.qualifiers || {};
          const t = q => { const x = (qual[q] || [])[0]; return x && x.datavalue ? x.datavalue.value.time : null; };
          sp.push({ q: v, from: t("P580"), to: t("P582"), rank: c.rank });
        }
        spells[id] = {
          name: (e.labels && e.labels.en && e.labels.en.value) || null,
          title: (e.sitelinks && e.sitelinks.enwiki && e.sitelinks.enwiki.title) || null,
          sp
        };
      }
      n += batch.length;
      if (n % 450 === 0) { cacheWrite("careers-spells.json", spells); process.stdout.write(`\r reading careers ${n}/${toFetch.length}   `); }
      await sleep(120);
    }
    cacheWrite("careers-spells.json", spells);
    console.log(`\r read ${toFetch.length} careers          `);
  }

  /* ---------- 3. the club items ---------- */
  const wanted = new Set();
  for (const q of pool) for (const s of (spells[q] || {}).sp || []) wanted.add(s.q);
  let clubs = cacheRead("careers-clubs2.json") || {};
  const clubTodo = [...wanted].filter(q => !clubs[q]);
  if (clubTodo.length) {
    process.stdout.write(`reading ${clubTodo.length} team items  `);
    let n = 0;
    for (const batch of chunk(clubTodo, 40)) {
      /* every label and alias, in every language: the crest library speaks
         Czech for Sparta Praha and transliterated Russian for Spartak Moskva */
      const j = await getJSON(WD + "?action=wbgetentities&format=json&props=labels%7Caliases%7Cclaims%7Csitelinks"
        + "&sitefilter=enwiki&ids=" + batch.join("|"));
      for (const id of batch) {
        const e = j && j.entities && j.entities[id];
        if (!e) { clubs[id] = { nat: false, names: [] }; continue; }
        const names = [];
        for (const l of Object.values(e.labels || {})) names.push(l.value);
        for (const arr of Object.values(e.aliases || {})) for (const a of arr) names.push(a.value);
        const title = (e.sitelinks && e.sitelinks.enwiki && e.sitelinks.enwiki.title) || null;
        if (title) names.unshift(title);
        clubs[id] = {
          nat: !!(e.claims && e.claims.P1532),          /* country for sport: only national sides have it */
          league: !!(e.claims && e.claims.P118),
          title,
          en: (e.labels && e.labels.en && e.labels.en.value) || title,
          names: [...new Set(names)].slice(0, 60)
        };
      }
      n += batch.length;
      if (n % 400 === 0) { cacheWrite("careers-clubs2.json", clubs); process.stdout.write(`
 reading teams ${n}/${clubTodo.length}   `); }
      await sleep(120);
    }
    cacheWrite("careers-clubs2.json", clubs);
    console.log(`
 read ${clubTodo.length} team items          `);
  }

  /* ---------- 4. teams to crests, no network ---------- */
  const byKey = {}, keyCount = {};
  for (const s of logos) {
    const k = keyOf(s.replace(/-/g, " "));
    if (!k) continue;
    keyCount[k] = (keyCount[k] || 0) + 1;
    if (!byKey[k]) byKey[k] = s;
  }
  const RESERVE = /(\b(ii|iii|reserves?|youth|academy|amateurs?|juniors?)\b\s*$)|\bunder-?\d|\bu-?(1[5-9]|2[0-3])\b|\b[bc]\s*(team|elftal)?\s*$|\batletic$|\bcastilla$|^jong\b|\bnext\s*gen$|\bjuvenil|\b(women|femenino|femeni|feminine?|feminin|vrouwen|damen|ladies|wfc)\b/i;
  /* a youth or B international side, as opposed to the senior one that dates a
     career: "Portugal national under-21 football team", "England ... B team" */
  const YOUTHNAT = /under-?\d|\bu-?\d{2}\b|youth|olympic|amateur|\bb\b\s*team\s*$/i;
  const plain = v => (v.title || v.en || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+\(.*\)$/, "").replace(/\s+(F\.?C\.?|FC)$/i, "");

  /* CLUB, NATIONAL or RESERVE. Only the last two may be dropped from a route;
     a CLUB that cannot find its crest kills the career instead. */
  function kind(v) {
    if (!v) return "UNKNOWN";
    if (v.nat) return YOUTHNAT.test(plain(v)) ? "YOUTHNAT" : "NATIONAL";
    if (RESERVE.test(plain(v))) return "RESERVE";
    return "CLUB";
  }

  /* WHICH NAME TO TRUST. A club answers to a dozen names across the languages
     and its own history, and the library carries one crest per club, so picking
     the first name that matches is picking at random. Two ways that went wrong:
     Villarreal is Vila-real in Valencian, which is a Portuguese club's crest,
     and Red Bull Salzburg still answers to SV Austria Salzburg, which is now a
     different club entirely and has its own crest in the library.

     So every name proposes a crest, and the crest that best explains the club's
     CURRENT English name wins: what share of the crest's own words appear in
     that name. "salzburg" is one word out of one, "austria-salzburg" is one out
     of two, so Red Bull Salzburg gets the Salzburg crest. Ties go to the longer
     name, which is what separates América Mineiro from Club América. */
  const crest = {}; const noCrest = {};
  const names = {};
  let nNat = 0, nRes = 0;
  for (const [qid, v] of Object.entries(clubs)) {
    const k = kind(v);
    if (k === "NATIONAL" || k === "YOUTHNAT") { nNat++; continue; }
    if (k === "RESERVE") { nRes++; continue; }
    names[qid] = [...new Set([v.title, v.en, ...(v.names || [])].filter(Boolean))];

    const own = new Set(keyOf(v.title || v.en || "").split("-").filter(Boolean));
    let pick = null, pickScore = -1, pickLen = -1;
    for (const n of names[qid]) {
      const key = keyOf(n);
      if (!key || !byKey[key] || keyCount[key] !== 1) continue;
      const toks = key.split("-").filter(Boolean);
      const score = toks.filter(t => own.has(t)).length / toks.length;
      if (score > pickScore || (score === pickScore && toks.length > pickLen)) {
        pick = byKey[key]; pickScore = score; pickLen = toks.length;
      }
    }
    if (pick) crest[qid] = pick;
  }

  /* One crest, several claimants: FC Barcelona shares "barcelona" with Barcelona
     SC of Ecuador, its own B team and its women's team, and Liverpool shares
     "liverpool" with Liverpool FC of Montevideo. Dropping every contested crest
     costs Arsenal, Liverpool and Barcelona themselves, so the PLAYERS DECIDE,
     the same way build-natinfo settles a club: whichever item more of the pool
     actually played for owns the crest. A first team always outvotes its own
     reserves, and Anfield outvotes Montevideo. A dead heat is a real ambiguity
     and both are dropped. */
  const backers = {};
  for (const q of pool) {
    const seen = new Set(((spells[q] || {}).sp || []).map(x => x.q));
    for (const c of seen) backers[c] = (backers[c] || 0) + 1;
  }
  const claims = {};
  for (const [qid, slug] of Object.entries(crest)) (claims[slug] = claims[slug] || []).push(qid);
  let settled = 0, split = 0;
  const ousted = [];
  for (const [, qs] of Object.entries(claims)) {
    if (qs.length < 2) continue;
    const sorted = qs.slice().sort((a, b) => (backers[b] || 0) - (backers[a] || 0));
    if ((backers[sorted[0]] || 0) > (backers[sorted[1]] || 0)) { for (const q of sorted.slice(1)) { delete crest[q]; ousted.push(q); } settled++; }
    else { for (const q of sorted) { delete crest[q]; ousted.push(q); } split++; }
  }
  if (settled || split) console.log(`\n${settled + split} crests had more than one claimant: ${settled} settled on a show of hands, ${split} were a dead heat and dropped`);

  /* A club that lost the vote may still have a crest of its own further down
     its own name list: América Mineiro reads as plain "america" on its first
     name, loses that to Club América of Mexico, and is called América Mineiro
     three names later, which the library does carry. */
  const taken = new Set(Object.values(crest));
  let rescued = 0;
  for (const qid of ousted) {
    for (const n of names[qid] || []) {
      const key = keyOf(n);
      if (key && byKey[key] && keyCount[key] === 1 && !taken.has(byKey[key])) {
        crest[qid] = byKey[key]; taken.add(byKey[key]); rescued++; break;
      }
    }
  }
  if (rescued) console.log(`  ${rescued} of the losers found a crest of their own further down their name list`);

  for (const qid of Object.keys(names)) if (!crest[qid]) noCrest[qid] = (clubs[qid].en || clubs[qid].title || qid);

  console.log(`
team items seen ${Object.keys(clubs).length}`);
  console.log(`  ${nNat} were national sides, ${nRes} were reserve or academy teams`);
  console.log(`  ${Object.keys(crest).length} clubs matched a crest, ${Object.keys(noCrest).length} clubs have no crest in the library`);

  /* ---------- 5. build the careers ---------- */
  const built = [];
  let gapped = 0, tooShort = 0, tooLong = 0, dupe = 0, holed = 0, undated = 0;
  const yr = t => t ? +String(t).slice(1, 5) : null;
  for (const qid of pool) {
    const v = spells[qid];
    if (!v || !v.name) continue;
    if (have.has(nameKey(v.name))) { dupe++; continue; }

    const clubSpells = [], natYears = [];
    for (const sp of v.sp) {
      const k = kind(clubs[sp.q]);
      if (k === "NATIONAL") { const y = yr(sp.from); if (y) natYears.push(y); continue; }
      if (k === "YOUTHNAT" || k === "RESERVE") continue;
      clubSpells.push(sp);                     /* CLUB or UNKNOWN: both must resolve */
    }
    if (!clubSpells.length) { tooShort++; continue; }
    if (!clubSpells.every(sp => crest[sp.q])) { gapped++; continue; }
    /* Career Path IS the order, so a spell nobody dated cannot go in. Lukas
       Nmecha's item dates one club out of three, and the sort duly opened his
       career at Anderlecht and closed it at the Manchester City academy he had
       already left. Roughly one career in six is like this. */
    if (clubSpells.some(sp => !sp.from)) { undated++; continue; }

    /* chronological, and a spell with no start date keeps the order it was
       filed in rather than jumping to the front */
    const dated = clubSpells.map((sp, i) => ({ ...sp, i, y: yr(sp.from) }));
    dated.sort((a, b) => (a.y ?? 9999) - (b.y ?? 9999) || a.i - b.i);

    /* a senior cap before the first club means the club record has a hole */
    const firstClub = dated.map(d => d.y).find(Boolean);
    const firstCap = natYears.length ? Math.min(...natYears) : null;
    if (firstClub && firstCap && firstCap < firstClub - 1) { holed++; continue; }

    /* a contract and a loan inside it are two statements about one spell, and
       a man who leaves and comes back is two spells: collapse only neighbours */
    const route = [];
    for (const d of dated) { const c = crest[d.q]; if (route[route.length - 1] !== c) route.push(c); }
    if (route.length < MIN_CLUBS) { tooShort++; continue; }
    if (route.length > MAX_CLUBS) { tooLong++; continue; }

    /* the article title is usually the football name where the label is the
       legal one: "Antony" against "Antony dos Santos". The deck is checked
       against the SHORTENED name, because that is the one that ships: testing
       the label first let a second Antony and a second Dani Alves through. */
    let name = v.name;
    const short = (v.title || "").replace(/\s*\(.*\)\s*$/, "").trim();
    if (short && short.length < name.length && short.split(" ").length <= name.split(" ").length) name = short;
    if (have.has(nameKey(name))) { dupe++; continue; }

    built.push({ qid, n: name, label: v.name, title: v.title, c: route });
  }
  console.log(`
${built.length} careers resolve fully`);
  console.log(`  ${gapped} lost a club to a missing crest, ${holed} had a hole in the record, ${undated} were not dated, ${tooShort} too short, ${tooLong} too long, ${dupe} already in the deck`);

  /* ---------- 6. fame ---------- */
  let fame = cacheRead("careers-fame.json") || {};
  const fameTodo = built.filter(b => fame[b.qid] === undefined);
  if (fameTodo.length) {
    process.stdout.write(`ranking ${fameTodo.length} by a year of pageviews  `);
    let n = 0;
    for (const b of fameTodo) {
      const t = encodeURIComponent((b.title || b.n).replace(/ /g, "_"));
      const j = await getJSON(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/monthly/2025010100/2025123100`, 2);
      fame[b.qid] = j && j.items ? j.items.reduce((a, i) => a + (i.views || 0), 0) : 0;
      if (++n % 50 === 0) { cacheWrite("careers-fame.json", fame); process.stdout.write(`\r ranking ${n}/${fameTodo.length}   `); }
      await sleep(60);
    }
    cacheWrite("careers-fame.json", fame);
    console.log(`\r ranked ${fameTodo.length}            `);
  }

  let ranked = built.map(b => ({ ...b, v: fame[b.qid] || 0 })).filter(b => b.v >= FLOOR).sort((a, b) => b.v - a.v);
  console.log(`${ranked.length} clear the ${FLOOR.toLocaleString()} pageview floor`);

  /* ---------- 7. the article a human would read ---------- */

  /* Wikidata is machine readable, current and, on a good few items, wrong.
     Rafael Leão's item has him at Porto and Real Madrid and knows nothing of
     Lille or Milan. Lukas Nmecha's dates one club in three. João Félix's has
     forgotten Benfica and Atlético. None of that is visible from inside the
     data: the dates are clean, the crests all resolve, the career looks fine.

     The English Wikipedia infobox is the version a person maintains, in order,
     with years, and it gets all three of those right. So it is the source of
     truth for the ROUTE, and Wikidata keeps the job it is good at, turning a
     club into a crest. Anything the infobox lists that cannot be resolved kills
     the career, same rule as before. */
  let boxes = cacheRead("careers-infobox.json") || {};
  const boxTodo = ranked.filter(r => r.title && !boxes[r.title]);
  if (boxTodo.length) {
    process.stdout.write(`reading ${boxTodo.length} Wikipedia infoboxes  `);
    let n = 0;
    for (const r of boxTodo) {
      /* section 0 only: the lead holds the infobox, and whole articles would be
         hundreds of megabytes for one template */
      const j = await getJSON("https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2"
        + "&prop=revisions&rvprop=content&rvslots=main&rvsection=0&redirects=1&titles=" + encodeURIComponent(r.title));
      const page = j && j.query && j.query.pages && j.query.pages[0];
      const txt = page && !page.missing && page.revisions ? page.revisions[0].slots.main.content : "";
      boxes[r.title] = parseCareer(txt);
      if (++n % 50 === 0) { cacheWrite("careers-infobox.json", boxes); process.stdout.write(`\r reading infoboxes ${n}/${boxTodo.length}   `); }
      await sleep(90);
    }
    cacheWrite("careers-infobox.json", boxes);
    console.log(`\r read ${boxTodo.length} infoboxes          `);
  }

  /* the club links in those infoboxes, turned into items so the crest map can
     answer for them */
  let titleQid = cacheRead("careers-titleqid.json") || {};
  const linkTodo = [...new Set(ranked.flatMap(r => (boxes[r.title] || []).map(c => c.target)))].filter(t => !(t in titleQid));
  if (linkTodo.length) {
    process.stdout.write(`resolving ${linkTodo.length} club links  `);
    let n = 0;
    for (const batch of chunk(linkTodo, 40)) {
      const j = await getJSON("https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2"
        + "&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=" + encodeURIComponent(batch.join("|")));
      const back = {};
      for (const r of (j && j.query && j.query.redirects) || []) back[r.to] = r.from;
      for (const r of (j && j.query && j.query.normalized) || []) back[r.to] = back[r.to] || r.from;
      for (const pg of (j && j.query && j.query.pages) || []) {
        const from = back[pg.title] || pg.title;
        titleQid[from] = (pg.pageprops && pg.pageprops.wikibase_item) || null;
      }
      for (const t of batch) if (!(t in titleQid)) titleQid[t] = null;
      n += batch.length;
      if (n % 400 === 0) { cacheWrite("careers-titleqid.json", titleQid); process.stdout.write(`\r resolving links ${n}/${linkTodo.length}   `); }
      await sleep(120);
    }
    cacheWrite("careers-titleqid.json", titleQid);
    console.log(`\r resolved ${linkTodo.length} club links          `);
  }

  /* rebuild every route from its infobox, and throw away what will not resolve */
  const verified = [];
  let noBox = 0, boxGap = 0, boxShort = 0, boxLong = 0, changed = 0;
  for (const r of ranked) {
    const box = boxes[r.title] || [];
    if (!box.length) { noBox++; continue; }
    const senior = box.filter(c => !RESERVE.test(c.target.replace(/\s*\(.*\)$/, "")) && !RESERVE.test(c.display));
    if (!senior.length) { boxShort++; continue; }
    const slugs = [];
    let ok = true;
    for (const c of senior) {
      const qid = titleQid[c.target];
      let slug = qid && crest[qid];
      if (!slug) {                                  /* not an item we know: try the name itself */
        for (const nm of [c.target, c.display]) { const k = keyOf(nm); if (k && byKey[k] && keyCount[k] === 1) { slug = byKey[k]; break; } }
      }
      if (!slug) { ok = false; break; }
      if (slugs[slugs.length - 1] !== slug) slugs.push(slug);
    }
    if (!ok) { boxGap++; continue; }
    if (slugs.length < MIN_CLUBS) { boxShort++; continue; }
    if (slugs.length > MAX_CLUBS) { boxLong++; continue; }
    if (slugs.join(">") !== r.c.join(">")) changed++;
    verified.push({ ...r, c: slugs });
  }
  console.log(`\n${verified.length} careers survive the article check`);
  console.log(`  ${changed} had a route Wikidata got wrong, ${boxGap} name a club with no crest, ${noBox} have no infobox, ${boxShort} too short, ${boxLong} too long`);
  ranked = verified;

  const picked = ranked.slice(0, need);
  console.log(`\ntaking ${picked.length}`);
  if (picked.length < need) console.log(`  SHORT of the target by ${need - picked.length}; lower SITELINKS or FLOOR and re-run`);
  console.log(`  most famous: ${picked.slice(0, 8).map(p => p.n).join(", ")}`);
  console.log(`  least famous: ${picked.slice(-8).map(p => p.n).join(", ")}`);
  const lens = {}; picked.forEach(p => lens[p.c.length] = (lens[p.c.length] || 0) + 1);
  console.log(`  clubs per career: ${Object.entries(lens).sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ":" + v).join("  ")}`);

  /* ---------- the review the dry run exists for ---------- */
  const mgrs = JSON.parse(fs.readFileSync(path.join(REPO, "assets/managers/index.json"), "utf8"));
  const mgrNames = new Set(mgrs.map(m => nameKey(m.n)));
  const both = picked.filter(p => mgrNames.has(nameKey(p.n)));
  if (both.length) console.log(`
  ${both.length} of these also stand in the Manager Path deck: ${both.slice(0, 12).map(p => p.n).join(", ")}`);
  const longNames = picked.filter(p => p.n.split(" ").length >= 4);
  if (longNames.length) console.log(`
  ${longNames.length} carry a full legal name rather than a football one: ${longNames.slice(0, 12).map(p => p.n).join(" | ")}`);

  /* --audit: which crest each club got, and whether it plausibly belongs to
     it. A crest whose words have nothing to do with the club's English name is
     how Red Bull Salzburg ended up wearing SV Austria Salzburg's badge. Only
     the questionable ones print, because 489 correct rows teach nobody. */
  if (process.argv.includes("--audit")) {
    const usedBy = {};
    for (const pk of picked) for (const c of (boxes[pk.title] || [])) {
      const q = titleQid[c.target];
      if (q && crest[q] && pk.c.includes(crest[q])) usedBy[q] = c.target;
    }
    const rows = [];
    for (const [qid, via] of Object.entries(usedBy)) {
      const slug = crest[qid], en = clubs[qid].title || clubs[qid].en || qid;
      const a = keyOf(slug.replace(/-/g, " ")).split("-").filter(Boolean);
      const b = new Set(keyOf(en).split("-").filter(Boolean));
      const share = a.filter(t => b.has(t)).length / (a.length || 1);
      if (share < 0.5) rows.push({ slug, en, via, share });
    }
    rows.sort((x, y) => x.share - y.share);
    console.log(`\ncrest audit: ${Object.keys(usedBy).length} clubs in the new deck, ${rows.length} where the crest and the name do not obviously match`);
    for (const r of rows.slice(0, 40)) console.log(`   ${r.slug.padEnd(30)} <-  ${r.en}${r.via !== r.en ? "   [linked as " + r.via + "]" : ""}`);
  }

  const show = +(arg("--sample") || 0);
  if (show) {
    console.log(`
--- the ${show} most famous ---`);
    picked.slice(0, show).forEach(p => console.log(`${String(p.v).padStart(9)}  ${p.n}: ${p.c.join(" > ")}`));
    console.log(`
--- ${show} from further down ---`);
    for (let k = 0; k < show; k++) { const p = picked[Math.floor((k * 37 + 11) % picked.length)]; console.log(`${String(p.v).padStart(9)}  ${p.n}: ${p.c.join(" > ")}`); }
  }

  const newSlugs = new Set(picked.flatMap(p => p.c));
  const missing = [...newSlugs].filter(s => !fs.existsSync(path.join(REPO, "assets/logos", s + ".png")));
  if (missing.length) { console.log(`\nSTOP: ${missing.length} slugs have no file: ${missing.slice(0, 10).join(", ")}`); return; }
  console.log(`  ${newSlugs.size} distinct crests used, all present`);

  /* house rules: no em dashes anywhere in this app, and no two spellings of
     one man inside the same batch */
  const dashes = picked.filter(p => /[–—]/.test(p.n));
  if (dashes.length) { console.log(`\nSTOP: ${dashes.length} names carry a dash: ${dashes.map(p => p.n).join(", ")}`); return; }
  const seenName = new Set(), twice = [];
  for (const p of picked) { const k = nameKey(p.n); if (seenName.has(k)) twice.push(p.n); seenName.add(k); }
  if (twice.length) { console.log(`\nSTOP: ${twice.length} names appear twice: ${twice.join(", ")}`); return; }

  if (DRY) { console.log("\n--dry, nothing written"); return; }

  const lines = picked.map(p => "  " + JSON.stringify({ n: p.n, c: p.c }));
  const fresh = fs.readFileSync(HTML, "utf8");
  const { end } = readCareers(fresh);
  /* the deck's last entry already carries a trailing comma. Adding a second
     one writes [ ... ,, {...} ], which is an elision: the array grows by one
     and CAREERS[503] is undefined, waiting to be dealt. */
  const head = fresh.slice(0, end);
  const joiner = /,\s*$/.test(head) ? "\n" : ",\n";
  const out = head + joiner + lines.join(",\n") + "," + fresh.slice(end);
  fs.writeFileSync(HTML, out);
  console.log(`\nwritten: deck is now ${existing.length + picked.length}`);
})();
