/* Add a line of basic player detail to the One & Only bank: what he played
   and when he was at that club.

     node _tools/build-natinfo.js            fill in anything missing
     node _tools/build-natinfo.js --force    redo every row
     node _tools/build-natinfo.js --dry      report only, write nothing

   The bank names a player and a club and nothing else, so the detail has to
   come back out of Wikidata. Three things are wanted per row:

     yr   the spell at THAT club, from the P54 statement's own P580/P582
          qualifiers, not the player's career span
     app  appearances for that club (P1350), when the statement carries it
     gl   goals for that club (P1351), same
     pos  what he played

   POSITION IS NOT TAKEN FROM WIKIDATA. P413 exists but its vocabulary is
   museum-grade: it files both Zidane and Hleb as a "wing half", which is not
   a thing anyone has said out loud since 1962. Wikipedia's own lead sentence
   says "who played as an attacking midfielder", which is the register the
   game wants, so that is the source, whitelisted so a stray clause cannot
   land "deeper lying forward for the remainder of his career" on the card.

   ROW ORDER IS LOAD-BEARING. A resumed match stores S.qi, an index into the
   tier array, so this tool only ever adds keys to existing rows: no sorting,
   no dropping, no inserting. It asserts that before writing.

   SAFE TO RE-RUN. Rows that already have detail are left alone unless
   --force, so a partial run can simply be run again. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const BANK = path.join(REPO, "assets", "nations", "index.json");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry");
const TIERS = ["easy", "normal", "hard", "ball"];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) { await sleep(2500 * (i + 1)); continue; }
      throw new Error("HTTP " + res.status);
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}

/* ---------- 1. player names -> candidate Wikidata ids ----------
   Labels are not unique, so this can hand back several ids for one name. The
   right one is settled later by which candidate actually played for the club
   the bank pairs him with. P106 keeps out the namesakes who never kicked a
   ball; wd:Q937857 is association football player. */
async function nameToIds(names) {
  const out = {};
  for (const batch of chunk(names, 50)) {
    const values = batch.map(n => JSON.stringify(n) + "@en").join(" ");
    const q = `SELECT ?name ?p WHERE { VALUES ?name { ${values} } ?p rdfs:label ?name ; wdt:P106 wd:Q937857 . }`;
    const j = await getJSON("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q));
    for (const b of j.results.bindings) {
      const id = b.p.value.split("/").pop();
      (out[b.name.value] = out[b.name.value] || []).push(id);
    }
    process.stdout.write(".");
    await sleep(400);
  }
  return out;
}

/* A label lookup misses two ways: the bank can spell a man the way his club
   does while Wikidata files him formally (the bank's Alex Manninger is
   Wikidata's Alexander Manninger), and some footballers simply carry no P106.
   Wikipedia's own titles and redirects absorb both, and the club check later
   throws out anything this drags in wrongly. */
async function nameToIdsViaWiki(names) {
  const out = {};
  for (const batch of chunk(names, 40)) {
    const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2"
      + "&prop=pageprops&ppprop=wikibase_item&redirects=1&titles=" + encodeURIComponent(batch.join("|"));
    const j = await getJSON(url);
    const back = {};
    for (const rd of (j.query && j.query.redirects) || []) back[rd.to] = rd.from;
    for (const rd of (j.query && j.query.normalized) || []) back[rd.to] = back[rd.to] || rd.from;
    for (const p of (j.query && j.query.pages) || []) {
      const id = p.pageprops && p.pageprops.wikibase_item;
      if (!id) continue;
      for (const name of [p.title, back[p.title]]) if (name) (out[name] = out[name] || []).push(id);
    }
    process.stdout.write(".");
    await sleep(200);
  }
  return out;
}

/* ---------- 2. ids -> club spells, positions, wiki titles ---------- */
async function getEntities(ids) {
  const out = {};
  for (const batch of chunk(ids, 50)) {
    const url = "https://www.wikidata.org/w/api.php?action=wbgetentities&format=json"
      + "&props=claims|sitelinks&sitefilter=enwiki&ids=" + batch.join("|");
    const j = await getJSON(url);
    for (const [id, e] of Object.entries(j.entities || {})) {
      if (e.missing !== undefined) continue;
      const spells = (e.claims.P54 || [])
        .filter(s => s.rank !== "deprecated" && s.mainsnak.datavalue)
        .map(s => ({
          club: s.mainsnak.datavalue.value.id,
          from: yearOf(s.qualifiers && s.qualifiers.P580),
          to: yearOf(s.qualifiers && s.qualifiers.P582),
          apps: numOf(s.qualifiers && s.qualifiers.P1350),
          goals: numOf(s.qualifiers && s.qualifiers.P1351),
        }));
      out[id] = { spells, title: (e.sitelinks && e.sitelinks.enwiki || {}).title || null };
    }
    process.stdout.write(".");
    await sleep(250);
  }
  return out;
}

/* Wikidata dates carry a precision; anything vaguer than a year is no use on
   a quiz card, and a day-precision transfer date is more than anyone wants to
   read, so everything comes out as a plain year. */
function yearOf(q) {
  if (!q || !q[0] || !q[0].datavalue) return null;
  if ((q[0].datavalue.value.precision || 0) < 9) return null;
  const m = String(q[0].datavalue.value.time).match(/^\+?(-?\d{1,4})-/);
  return m ? Number(m[1]) : null;
}
function numOf(q) {
  if (!q || !q[0] || !q[0].datavalue) return null;
  const n = Number(q[0].datavalue.value.amount);
  return Number.isFinite(n) ? n : null;
}

/* ---------- 3. which Wikidata item is the club the bank means? ----------
   The bank stores a club name and a slug, never an id, and matching "Arsenal"
   against "Arsenal F.C." by string is a losing game across 70 clubs in five
   languages. It does not have to be: every player the bank files under a club
   played for that club, so the id nearly all of them share IS the club. The
   youth and B sides that also show up are held by one or two players each. */
function resolveClubs(rows, cand, ents) {
  const byClub = {};
  for (const r of rows) (byClub[r.slug] = byClub[r.slug] || []).push(r);
  const clubId = {}, weak = [];
  for (const [slug, rs] of Object.entries(byClub)) {
    const votes = {};
    for (const r of rs) {
      const seen = new Set();                       // one vote per player, not per spell
      for (const id of cand[r.player] || []) {
        for (const sp of (ents[id] || { spells: [] }).spells) seen.add(sp.club);
      }
      for (const c of seen) votes[c] = (votes[c] || 0) + 1;
    }
    const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) { weak.push([slug, 0, rs.length]); continue; }
    clubId[slug] = ranked[0][0];
    if (ranked[0][1] < rs.length * 0.5) weak.push([slug, ranked[0][1], rs.length]);
  }
  return { clubId, weak };
}

/* ---------- 4. position, from the Wikipedia lead sentence ----------
   Whitelisted and normalised: an article can wander ("a deeper lying forward
   for the remainder of his career") and the card wants two words. Longest
   match wins so centre-back beats back and attacking midfielder beats
   midfielder. */
const POS = [
  ["goalkeeper", "Goalkeeper"], ["goalie", "Goalkeeper"],
  ["centre-back", "Centre-back"], ["center-back", "Centre-back"], ["central defender", "Centre-back"],
  ["centre back", "Centre-back"], ["center back", "Centre-back"],
  ["left-back", "Left-back"], ["left back", "Left-back"],
  ["right-back", "Right-back"], ["right back", "Right-back"],
  ["full-back", "Full-back"], ["full back", "Full-back"],
  ["wing-back", "Wing-back"], ["wing back", "Wing-back"],
  ["sweeper", "Sweeper"], ["libero", "Sweeper"],
  ["defender", "Defender"],
  ["defensive midfielder", "Defensive midfielder"], ["holding midfielder", "Defensive midfielder"],
  ["attacking midfielder", "Attacking midfielder"],
  ["central midfielder", "Central midfielder"], ["centre midfielder", "Central midfielder"],
  ["left midfielder", "Midfielder"], ["right midfielder", "Midfielder"],
  ["wide midfielder", "Midfielder"], ["box-to-box midfielder", "Central midfielder"],
  ["playmaker", "Attacking midfielder"], ["wing half", "Midfielder"],
  ["midfielder", "Midfielder"],
  ["centre-forward", "Centre-forward"], ["center-forward", "Centre-forward"],
  ["centre forward", "Centre-forward"], ["center forward", "Centre-forward"],
  ["second striker", "Second striker"], ["inside forward", "Inside forward"],
  ["striker", "Striker"], ["winger", "Winger"], ["forward", "Forward"],
].sort((a, b) => b[0].length - a[0].length);

function readPosition(text) {
  if (!text) return null;
  /* Only the first sentence, and only after "as a": later sentences talk about
     other people, and "he was signed as a replacement for the goalkeeper"
     would otherwise make a striker a goalkeeper. */
  const first = String(text).split(/(?<=\.)\s/)[0] || "";
  const m = first.match(/\bplay(?:s|ed|ing)?\s+(?:mainly\s+|mostly\s+|primarily\s+|usually\s+)?as\s+an?\s+([^.;()]{0,80})/i);
  const hay = (m ? m[1] : first).toLowerCase();
  for (const [needle, label] of POS) if (hay.includes(needle)) return label;
  return null;
}

async function getIntros(titles) {
  const out = {};
  for (const batch of chunk(titles, 20)) {
    const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2"
      + "&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=" + encodeURIComponent(batch.join("|"));
    const j = await getJSON(url);
    const back = {};                                 // redirects: asked X, got Y
    for (const rd of (j.query && j.query.redirects) || []) back[rd.to] = rd.from;
    for (const rd of (j.query && j.query.normalized) || []) back[rd.to] = back[rd.to] || rd.from;
    for (const p of (j.query && j.query.pages) || []) {
      if (!p.extract) continue;
      out[p.title] = p.extract;
      if (back[p.title]) out[back[p.title]] = p.extract;
    }
    process.stdout.write(".");
    await sleep(200);
  }
  return out;
}

/* The infobox is the fallback: Hleb's lead sentence is three transliterations
   deep before it gets to football, but |position = Midfielder is right there.
   One request per player, so it only runs for what the lead missed. */
async function infoboxPosition(title) {
  const url = "https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2"
    + "&prop=wikitext&section=0&page=" + encodeURIComponent(title);
  try {
    const j = await getJSON(url, 2);
    const wt = j.parse && j.parse.wikitext;
    if (!wt) return null;
    const m = wt.match(/\|\s*position\s*=\s*([^\n|]+)/i);
    if (!m) return null;
    return readPosition(m[1].replace(/\[\[|\]\]|'''?/g, "").replace(/\{\{[^}]*\}\}/g, " "));
  } catch (e) { return null; }
}

/* ---------- 5. the spell, written out ---------- */
function spellText(spells) {
  /* Two stints at one club is common enough to matter (and the bank is full of
     players who came back), so they are listed rather than smeared into one
     span: "1997 to 2002" and "2007" beats a wrong "1997 to 2007".

     Separate is not the same as overlapping, though. A club often carries the
     senior contract AND the loan year inside it as two statements, which read
     out as "2007 to 2009, 2007" and looks like a typo, so anything that
     overlaps is folded back into the longer one. */
  const raw = spells
    .filter(s => s.from || s.to)
    .map(s => ({ from: s.from || s.to, to: s.to, open: !s.to }))
    .sort((a, b) => a.from - b.from || (b.to || 9999) - (a.to || 9999));
  const merged = [];
  for (const s of raw) {
    const last = merged[merged.length - 1];
    const end = last && (last.open ? 9999 : last.to);
    if (last && s.from <= end) {                     // inside or running into it
      if (s.open) last.open = true;
      else if (!last.open) last.to = Math.max(last.to, s.to);
    } else merged.push({ ...s });
  }
  const parts = merged
    .map(s => ({ from: s.from, to: s.open ? null : s.to }))
    .map(s => {
      if (s.from && s.to) return s.from === s.to ? String(s.from) : `${s.from} to ${s.to}`;
      /* An open end can mean he is still there or that nobody filled it in, so
         it says when he arrived and claims nothing about when he left. */
      if (s.from) return `from ${s.from}`;
      return String(s.to);
    });
  const seen = [], uniq = parts.filter(p => (seen.includes(p) ? false : (seen.push(p), true)));
  return uniq.length ? uniq.join(", ") : null;
}

(async () => {
  const bank = JSON.parse(fs.readFileSync(BANK, "utf8"));
  const before = TIERS.map(t => bank[t].length);
  const rows = TIERS.flatMap(t => bank[t]);
  const players = [...new Set(rows.map(r => r.player))];
  console.log(`${rows.length} rows, ${players.length} players, ${new Set(rows.map(r => r.slug)).size} clubs\n`);

  process.stdout.write("wikidata ids   ");
  const cand = await nameToIds(players);
  const gap = players.filter(p => !cand[p]);
  console.log(`\n  ${players.length - gap.length} matched an item by label, ${gap.length} did not`);

  if (gap.length) {
    process.stdout.write("via wikipedia  ");
    const extra = await nameToIdsViaWiki(gap);
    for (const [n, ids] of Object.entries(extra)) if (players.includes(n)) cand[n] = (cand[n] || []).concat(ids);
    console.log(`\n  ${gap.filter(p => cand[p]).length} of ${gap.length} recovered`);
  }
  const noId = players.filter(p => !cand[p]);

  process.stdout.write("club spells    ");
  const ents = await getEntities([...new Set(Object.values(cand).flat())]);
  console.log(`\n  ${Object.keys(ents).length} items read`);

  const { clubId, weak } = resolveClubs(rows, cand, ents);
  console.log(`  resolved ${Object.keys(clubId).length} club items` + (weak.length ? `, ${weak.length} thin` : ""));

  /* pick the candidate that actually played for this club, and read his spell */
  const pick = {}, titles = new Set();
  let paired = 0;
  for (const r of rows) {
    const want = clubId[r.slug];
    let best = null;
    for (const id of cand[r.player] || []) {
      const e = ents[id]; if (!e) continue;
      const mine = e.spells.filter(s => s.club === want);
      if (!mine.length) continue;
      if (!best || mine.length > best.mine.length) best = { id, e, mine };
    }
    if (!best) continue;
    paired++;
    const apps = best.mine.reduce((a, s) => a + (s.apps || 0), 0);
    const goals = best.mine.reduce((a, s) => a + (s.goals || 0), 0);
    pick[r.player + "|" + r.slug] = { yr: spellText(best.mine), app: apps || null, gl: goals || null, title: best.e.title };
    if (best.e.title) titles.add(best.e.title);
  }
  console.log(`  ${paired} of ${rows.length} rows paired to a spell at their own club\n`);

  process.stdout.write("positions      ");
  const intros = await getIntros([...titles]);
  const pos = {};
  for (const t of titles) pos[t] = readPosition(intros[t]);
  const missing = [...titles].filter(t => !pos[t]);
  console.log(`\n  ${titles.size - missing.length} from the lead sentence, ${missing.length} to check in the infobox`);

  let recovered = 0;
  for (const group of chunk(missing, 4)) {
    await Promise.all(group.map(async t => { const p = await infoboxPosition(t); if (p) { pos[t] = p; recovered++; } }));
    process.stdout.write(`\r  infobox ${recovered} recovered`);
    await sleep(200);
  }
  console.log("");

  /* ---------- write back, keys only ---------- */
  let filled = 0, part = 0;
  for (const t of TIERS) for (const r of bank[t]) {
    if (!FORCE && (r.pos || r.yr)) continue;
    const p = pick[r.player + "|" + r.slug];
    if (!p) continue;
    if (FORCE) { delete r.pos; delete r.yr; delete r.app; delete r.gl; }
    if (p.yr) r.yr = p.yr;
    if (p.app) r.app = p.app;
    if (p.gl) r.gl = p.gl;
    if (p.title && pos[p.title]) r.pos = pos[p.title];
    if (r.pos && r.yr) filled++; else if (r.pos || r.yr) part++;
  }

  const after = TIERS.map(t => bank[t].length);
  if (String(before) !== String(after)) throw new Error("row count changed: " + before + " -> " + after);

  const stat = k => TIERS.reduce((a, t) => a + bank[t].filter(r => r[k]).length, 0);
  console.log(`\nfull detail ${filled}, partial ${part}`);
  console.log(`  position ${stat("pos")}/${rows.length}, years ${stat("yr")}/${rows.length}, apps ${stat("app")}/${rows.length}, goals ${stat("gl")}/${rows.length}`);
  if (weak.length) {
    console.log("\nclubs where the vote was thin, worth an eye:");
    weak.slice(0, 12).forEach(([s, v, n]) => console.log(`   ${s}: ${v}/${n} players agreed`));
  }
  if (noId.length) console.log(`\nno wikidata item for ${noId.length} names, e.g. ${noId.slice(0, 6).join(", ")}`);

  /* A spot check reads better than a count: 20 rows spread across the bank,
     written the way the card will write them. */
  const line = r => [r.pos, r.yr, r.app ? r.app + " games" + (r.gl ? ", " + r.gl + " goals" : "") : null].filter(Boolean).join(" · ");
  const all = TIERS.flatMap(t => bank[t]);
  console.log("\nsample:");
  for (let i = 0; i < all.length; i += Math.floor(all.length / 20)) {
    const r = all[i];
    console.log(`   ${(r.player + " (" + r.club + ")").padEnd(46)} ${line(r) || "nothing found"}`);
  }

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.writeFileSync(BANK, JSON.stringify(bank, null, 1));
  console.log(`\nwritten to ${path.relative(REPO, BANK)} (${(fs.statSync(BANK).size / 1024).toFixed(0)} KB)`);
})();
