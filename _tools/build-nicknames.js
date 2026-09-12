/* Club nicknames, out of the Wikipedia infoboxes and into Classic.

     node _tools/build-nicknames.js            build the pack
     node _tools/build-nicknames.js --dry      report only, write nothing

   "Which club is nicknamed the Cottagers" is the most pub-shaped question
   there is, and Wikidata barely has this: 446 clubs worldwide carry P1449.
   The English Wikipedia infobox has it for nearly everyone, so that is the
   source, same as the player positions.

   THE WHOLE JOB IS THE FILTERING. The field is free text and it shows: some
   clubs list six nicknames, some wrap them in {{plainlist}} or {{lang}}, most
   gloss them ("Gooners (supporters)", "Los Amarillos (The Yellows)"), and a
   fair few list a name that is not theirs alone. A question with two right
   answers is worse than no question, so a nickname only survives if exactly
   one club in the set claims it and it is not one of the colours half of
   football calls itself.

   Tiered by how well known the CLUB is, on a year of English pageviews, the
   same measure the kit bank uses. Fame by sitelink count puts Lithuanian
   minnows above Heerenveen, which is not the order a pub recognises.

   SAFE TO RE-RUN. It rebuilds the pack from scratch every time; the pack is
   appended to the bank last, so nothing already asked gets renumbered. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "assets", "nicknames");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const DRY = process.argv.includes("--dry");
const WIKI = "https://en.wikipedia.org/w/api.php";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

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

/* ---------- 1. club -> wikipedia article ---------- */
async function findTitles(clubs) {
  const title = {};
  // most of the display names are already the article title or a redirect
  for (const batch of chunk(clubs, 40)) {
    const j = await getJSON(WIKI + "?action=query&format=json&formatversion=2&redirects=1&titles="
      + encodeURIComponent(batch.map(c => c.n).join("|")));
    const back = {};
    for (const r of (j.query && j.query.redirects) || []) back[r.to] = r.from;
    for (const r of (j.query && j.query.normalized) || []) back[r.to] = back[r.to] || r.from;
    for (const p of (j.query && j.query.pages) || []) {
      if (p.missing) continue;
      const asked = back[p.title] || p.title;
      const club = batch.find(c => c.n === asked);
      if (club) title[club.s] = p.title;
    }
    process.stdout.write(".");
    await sleep(150);
  }
  // whatever is left gets searched for, one at a time
  const missing = clubs.filter(c => !title[c.s]);
  for (const c of missing) {
    try {
      const j = await getJSON(WIKI + "?action=query&format=json&formatversion=2&list=search&srlimit=1&srsearch="
        + encodeURIComponent(`${c.n} football club`));
      const hit = j.query && j.query.search && j.query.search[0];
      if (hit) title[c.s] = hit.title;
    } catch (e) { /* a club with no article is not a question */ }
    await sleep(150);
  }
  return title;
}

/* ---------- 2. the infobox field ---------- */
async function nicknameField(title) {
  const j = await getJSON(WIKI + "?action=parse&format=json&formatversion=2&prop=wikitext&section=0&redirects=1&page="
    + encodeURIComponent(title), 2);
  const wt = (j.parse && j.parse.wikitext) || "";
  if (!/\{\{\s*Infobox football club/i.test(wt)) return null;   // a town, a stadium, a disambiguation
  const m = wt.match(/\|\s*nicknames?\s*=\s*([\s\S]*?)(?=\n\s*\|\s*[a-z0-9_ ]+\s*=|\n\}\})/i);
  return m ? m[1] : null;
}

/* Templates carry half the answers, so they are unwrapped rather than
   stripped: {{lang|it|La Vecchia Signora}} IS the nickname, and dropping the
   template drops Juventus. */
function unwrap(s) {
  let out = s, last;
  do {
    last = out;
    out = out.replace(/\{\{\s*(?:lang|nowrap|noitalic|nobr|small|smaller|native name)\s*\|([^{}]*)\}\}/gi,
      (_, inner) => inner.split("|").pop());
    out = out.replace(/\{\{\s*(?:plainlist|unbulleted list|ubl|flatlist|hlist)\s*\|([^{}]*)\}\}/gi,
      (_, inner) => inner.replace(/\n?\s*\*/g, "<br>").replace(/\|/g, "<br>"));
  } while (out !== last);
  return out.replace(/\{\{[^{}]*\}\}/g, " ");            // anything else was decoration
}

function splitNicknames(raw, clubName) {
  const text = unwrap(String(raw)
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>|<ref[^>]*\/>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " "));
  const parts = text
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, "$2")
    .replace(/'''?/g, "")
    /* Commas separate nicknames as often as line breaks do: Dinamo Zagreb
       list "Modri, Plavi" and Club Brugge four in a row. Splitting only in
       front of an article kept them glued together as one answer nobody
       would ever say. */
    .split(/\n|;|,/);

  const clubWords = new Set(norm(clubName).split(" ").filter(w => w.length > 2));
  const out = [];
  for (let p of parts) {
    p = p.replace(/\([^)]*\)/g, " ")            // "(supporters)", "(The Yellows)"
         .replace(/["“”']/g, " ")
         .replace(/\s+/g, " ").trim()
         .replace(/^[-–—.*]+|[-–—.*,;:]+$/g, "").trim();
    if (!p || p.length < 3 || p.length > 34) continue;
    if (/\d/.test(p)) continue;                 // years and shirt numbers are not nicknames
    /* Wikitext that survived the unwrap is not a nickname. The first run
       shipped a question whose answer was "{{ubl", from a nested template,
       and another that read "Dikéfalos (Double-headed eagle" because the
       bracket it opened closed on a different line. */
    if (/[{}|[\]<>]/.test(p)) continue;
    if ((p.match(/\(/g) || []).length !== (p.match(/\)/g) || []).length) continue;
    if (/^(and|or|also|formerly|known as)\b/i.test(p)) continue;
    const n = norm(p);
    if (!n) continue;
    // a "nickname" that is just the club's own name is not a question
    if (n.split(" ").every(w => clubWords.has(w) || w === "the")) continue;
    if (!out.some(o => norm(o) === n)) out.push(p);
  }
  return out;
}

/* Half of football calls itself the Reds. These are dropped outright rather
   than left to the uniqueness check, because that check only sees our own 392
   clubs: it cannot know that Torino are also I Granata or that Les Bleus is
   France, so it would hand a shared name to whichever club happens to be in
   the set. Colour nicknames are the whole problem, in every language. */
const TOO_COMMON = new Set([
  // english
  "the reds", "the blues", "the whites", "the greens", "the blacks", "the lions",
  "the eagles", "the wolves", "the tigers", "the rams", "the owls", "the city",
  "the united", "reds", "blues", "whites", "the boys", "the club", "the team",
  "the yellows", "the blue and whites", "the red and whites", "the black and whites",
  "the reds and whites", "the sky blues", "the seagulls", "the robins", "the saints",
  // italian
  "rossoneri", "bianconeri", "giallorossi", "nerazzurri", "granata", "i granata",
  "rossoblu", "biancocelesti", "gialloblu", "i rossoneri", "i bianconeri", "il toro",
  // spanish and portuguese
  "los blancos", "los blaugrana", "blaugrana", "los rojiblancos", "los albinegros",
  "los amarillos", "los verdes", "los rojos", "los azules", "os leoes", "o tricolor",
  "el tricolor", "los granates",
  // german, dutch, french
  "die roten", "die blauen", "die weissen", "de rood witten", "de blauw witten",
  "de zwart witten", "de groenwitten", "les bleus", "les rouges", "les verts",
  "les blancs", "les jaunes",
]);

/* A nickname belonging to a national side is not a club question, whatever a
   club's infobox claims: Paris FC came back as Les Bleus. */
/* And a nickname a club has borrowed from a more famous one is a trap, not a
   question: LA Galaxy's article lists Los Galacticos, but nobody at a table
   is answering anything other than Real Madrid. */
const BORROWED = new Set(["los galacticos", "the galacticos", "the invincibles",
  "the busby babes", "the class of 92", "el clasico"]);

const NATIONAL = new Set(["les bleus", "la roja", "die mannschaft", "oranje", "azzurri",
  "gli azzurri", "the three lions", "selecao", "a selecao", "la albiceleste", "el tri",
  "the socceroos", "the super eagles", "the black stars", "the elephants"]);

/* ---------- 3. how well known is the club ---------- */
async function pageviews(title) {
  const t = encodeURIComponent(title.replace(/ /g, "_"));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${t}/monthly/2024010100/2024123100`;
  try {
    const j = await getJSON(url, 2);
    return (j.items || []).reduce((a, i) => a + (i.views || 0), 0);
  } catch (e) { return 0; }
}

(async () => {
  const badges = JSON.parse(fs.readFileSync(path.join(REPO, "assets/badges/index.json"), "utf8"));
  /* easy + hard only: the BALL tier of the badge bank is 2,196 clubs nobody
     sensible has heard of, and "which club is nicknamed X" is not a question
     when nobody could name the club either way. */
  const clubs = [...badges.easy, ...badges.hard];
  console.log(`${clubs.length} clubs to ask about\n`);

  process.stdout.write("finding articles ");
  const titles = await findTitles(clubs);
  console.log(`\n  ${Object.keys(titles).length} of ${clubs.length} matched an article`);

  process.stdout.write("reading infoboxes");
  const found = {};
  let done = 0;
  for (const c of clubs) {
    if (!titles[c.s]) continue;
    try {
      const raw = await nicknameField(titles[c.s]);
      if (raw) {
        const list = splitNicknames(raw, c.n);
        if (list.length) found[c.s] = { club: c, nicks: list };
      }
    } catch (e) { /* skip */ }
    if (++done % 25 === 0) process.stdout.write(`\r  read ${done}/${clubs.length}, ${Object.keys(found).length} with a nickname`);
    await sleep(120);
  }
  console.log(`\r  read ${done}, ${Object.keys(found).length} clubs have at least one nickname   `);

  /* ---------- 4. one club per nickname, or it is not a question ---------- */
  const owners = new Map();
  for (const [slug, f] of Object.entries(found))
    for (const nick of f.nicks) {
      const k = norm(nick);
      if (!owners.has(k)) owners.set(k, []);
      owners.get(k).push({ slug, nick });
    }
  const clash = [...owners.entries()].filter(([, v]) => v.length > 1);
  const blocked = k => TOO_COMMON.has(k) || NATIONAL.has(k) || BORROWED.has(k);
  const common = [...owners.keys()].filter(blocked);
  console.log(`  ${clash.length} nicknames claimed by more than one club, dropped`);
  console.log(`  ${common.length} too generic to have one answer, dropped`);

  const usable = {};
  for (const [k, v] of owners) {
    if (v.length > 1 || blocked(k)) continue;
    (usable[v[0].slug] = usable[v[0].slug] || []).push(v[0].nick);
  }
  console.log(`  ${Object.keys(usable).length} clubs left with a nickname that is theirs alone\n`);

  process.stdout.write("ranking by fame ");
  const fame = {};
  let i = 0;
  for (const slug of Object.keys(usable)) {
    fame[slug] = await pageviews(titles[slug]);
    if (++i % 25 === 0) process.stdout.write(".");
    await sleep(80);
  }
  const ranked = Object.keys(usable).sort((a, b) => fame[b] - fame[a]);
  console.log(`\n  top: ${ranked.slice(0, 3).map(s => found[s].club.n + " " + fame[s].toLocaleString()).join(", ")}`);

  /* ---------- 5. the questions ---------- */
  const TIER = [["easy", .18], ["normal", .42], ["hard", .75], ["ball", 1]];
  const pack = { easy: [], normal: [], hard: [], ball: [] };
  ranked.forEach((slug, idx) => {
    const share = idx / ranked.length;
    const tier = TIER.find(t => share <= t[1])[0];
    /* one question per club, the first nickname, which is the one the article
       leads with and so the one people actually use */
    const nick = usable[slug][0];
    /* Quoted, and no article bolted on the front. Guessing whether a nickname
       already carries its own article means knowing the article in every
       language football is played in, and the first attempt duly produced
       "the Die Fohlen" and "the I Blucerchiati". */
    pack[tier].push({ q: `Which club is nicknamed "${nick}"?`, a: found[slug].club.n });
  });

  const total = Object.values(pack).reduce((a, r) => a + r.length, 0);
  console.log(`\n${total} questions: ` + Object.entries(pack).map(([t, r]) => `${t} ${r.length}`).join(", "));
  console.log("\nsample:");
  for (const t of Object.keys(pack))
    pack[t].slice(0, 3).forEach(q => console.log(`   [${t}] ${q.q}  ->  ${q.a}`));

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(pack, null, 1));
  console.log(`\nwritten to assets/nicknames/index.json (${(fs.statSync(path.join(OUT, "index.json")).size / 1024).toFixed(0)} KB)`);
  console.log("Add it to PACKS in index.html AFTER the existing packs, or saved matches renumber.");
})();
