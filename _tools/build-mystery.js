/* Build the Mystery Man bank: every career player, with the handful of facts a
   guess can be measured against.

     node _tools/build-mystery.js --dry     report only
     node _tools/build-mystery.js           write assets/mystery/index.json

   The mode names nobody. You guess a player, and the app tells you how close
   that guess was: same country or not, same position or not, older or younger,
   and whether the two of them ever shared a club. Everyone at the table sees
   every answer, so the information piles up and whoever cracks it takes what
   is left of the pot.

   That only works if the facts are right, and one of them is harder than it
   looks. POSITION DOES NOT COME FROM WIKIDATA. P413 files Zidane as a wing
   half and Hleb likewise, which is true of nobody who watched them. The
   Wikipedia infobox has a position field maintained by people who did, so that
   is the source, folded down to the four buckets a clue can actually compare:
   goalkeeper, defender, midfielder, forward. The words as written are kept too,
   because "Sweeper" is a better reveal than "Defender".

   NATIONALITY IS THE SHIRT HE ACTUALLY WORE. P1532 is the right property but
   it often holds two: Ziyech is filed Netherlands and Morocco, Taarabt France
   and Morocco, because both were eligible and both played youth football for
   one before senior football for the other. Taking the first value gave a
   Dutch Ziyech and a French Taarabt, which is not how anyone watching would
   describe either. So the senior national team out of P54 decides it, and
   P1532 is only trusted when it holds exactly one country. No fact beats a
   wrong fact in a mode that judges by facts.

   BIRTH YEARS COME FROM WIKIDATA, NOT FROM THE OLDER OR TALLER BANK. Seeding
   from that bank looked free and imported thirteen wrong men: it has Luis
   Suárez born 1997, Pepe 1935 and Romário 1985, because those names resolve to
   namesakes. That bank needs its own fix; this one does not wait for it.

   SAFE TO RE-RUN. Everything caches in _tools/_models/ (gitignored). */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const HTML = path.join(REPO, "index.html");
const MODELS = path.join(__dirname, "_models");
const OUT = path.join(REPO, "assets", "mystery");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const WD = "https://www.wikidata.org/w/api.php";
const WIKI = "https://en.wikipedia.org/w/api.php";
const DRY = process.argv.includes("--dry");

/* a mystery man nobody could name is not a puzzle. Guesses may be anyone in
   the deck; the man being hunted has to clear this. */
const TARGET_FLOOR = 250000;

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

/* the four buckets a clue can compare, and the words people actually use */
const BUCKET = [
  [/goal\s*keep|keeper|\bgk\b/i, "GK"],
  [/sweeper|back|defend|centre-?half|center-?half|libero|\bcb\b|\bdf\b/i, "DF"],
  [/midfield|winger|wing-?half|\bmf\b/i, "MF"],
  [/forward|strik|strieker|attack|strike|centre-?forward|inside|\bfw\b|\bcf\b/i, "FW"],
];
function bucketOf(text) {
  if (!text) return null;
  /* order matters: "attacking midfielder" is a midfielder, and "wing-half" is
     not a winger, so midfield is tested before forward and back before both */
  if (/goal\s*keep|keeper/i.test(text)) return "GK";
  if (/midfield|wing-?half/i.test(text)) return "MF";
  if (/back\b|defend|centre-?half|center-?half|libero|sweeper/i.test(text)) return "DF";
  if (/winger|forward|strik|attack|inside/i.test(text)) return "FW";
  for (const [re, b] of BUCKET) if (re.test(text)) return b;
  return null;
}

/* the position line out of an infobox, unwrapped from its links and templates */
function positionOf(wikitext) {
  const m = (wikitext || "").match(/^\s*\|\s*position\s*=\s*(.*)$/mi);
  if (!m) return null;
  let v = m[1];
  v = v.replace(/<ref[\s\S]*?(\/>|<\/ref>)/gi, " ")
       .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
       .replace(/\[\[([^\]]+)\]\]/g, "$1")
       .replace(/\{\{[^}]*\}\}/g, " ")
       .replace(/'''?/g, "")
       .replace(/<!--[\s\S]*?-->/g, " ")
       .replace(/\s+/g, " ").trim();
  if (!v || /[{}|<>]/.test(v)) return null;
  if (v.length > 40) v = v.split(/[,/]/)[0].trim();
  return v || null;
}

(async () => {
  const html = fs.readFileSync(HTML, "utf8");
  const i = html.indexOf("const CAREERS = ["), j = html.indexOf("\n];", i);
  const CAREERS = eval(html.slice(i + "const CAREERS = ".length, j + 2));
  const fame = cacheRead("alumni-fame.json") || {};
  const qid = cacheRead("wall-qid.json") || {};
  const sport = cacheRead("wall-sport.json") || {};
  const titles = cacheRead("alumni-titles.json") || {};
  const spells = cacheRead("careers-spells.json") || {};
  for (const [q, v] of Object.entries(spells)) if (v.name && v.title && !titles[v.name]) titles[v.name] = v.title;

  /* ---------- 1. the infobox line ---------- */
  let box = cacheRead("mystery-box.json") || {};
  const todo = CAREERS.map(c => c.n).filter(n => !(n in box));
  if (todo.length) {
    process.stdout.write(`reading ${todo.length} infoboxes  `);
    let n = 0;
    for (const name of todo) {
      const t = titles[name] || name;
      const j2 = await getJSON(WIKI + "?action=query&format=json&formatversion=2&prop=revisions&rvprop=content"
        + "&rvslots=main&rvsection=0&redirects=1&titles=" + encodeURIComponent(t));
      const pg = j2 && j2.query && j2.query.pages && j2.query.pages[0];
      const txt = pg && !pg.missing && pg.revisions ? pg.revisions[0].slots.main.content : "";
      box[name] = positionOf(txt);
      if (++n % 50 === 0) { cacheWrite("mystery-box.json", box); process.stdout.write(`\r reading infoboxes ${n}/${todo.length}   `); }
      await sleep(90);
    }
    cacheWrite("mystery-box.json", box);
    console.log(`\r read ${todo.length} infoboxes          `);
  }

  /* ---------- 2. birth year ---------- */
  let born = cacheRead("mystery-born.json") || {};
  const needBorn = [...new Set(CAREERS.map(c => c.n).filter(n => !born[n] && qid[n]))];
  if (needBorn.length) {
    process.stdout.write(`reading ${needBorn.length} birth years  `);
    for (const batch of chunk(needBorn, 45)) {
      const ids = batch.map(n => qid[n]);
      const j2 = await getJSON(WD + "?action=wbgetentities&format=json&props=claims&ids=" + ids.join("|"));
      batch.forEach((nm, k) => {
        const e = j2 && j2.entities && j2.entities[ids[k]];
        const t = e && ((e.claims && e.claims.P569) || [])[0];
        const time = t && t.mainsnak.datavalue && t.mainsnak.datavalue.value.time;
        const y = time ? +String(time).slice(1, 5) : null;
        if (y && y > 1900 && y < 2015) born[nm] = y;
      });
      process.stdout.write(".");
      await sleep(150);
    }
    cacheWrite("mystery-born.json", born);
    console.log("");
  }

  /* ---------- 2b. the shirt he actually wore ---------- */
  const teams = cacheRead("careers-clubs2.json") || {};
  const YOUTHNAT = /under-?\d|\bu-?\d{2}\b|youth|olympic|amateur|\bb\b\s*team\s*$/i;
  const capped = {};
  let fromCaps = 0;
  for (const [q, v] of Object.entries(spells)) {
    if (!v.name || !v.sp) continue;
    for (const sp of v.sp) {
      const t = teams[sp.q];
      if (!t || !t.nat) continue;
      const nm = (t.title || t.en || "");
      if (YOUTHNAT.test(nm)) continue;
      /* "Morocco men's national football team" is the country plus furniture */
      const country = nm.replace(/\s*(men's|women's)?\s*national\s*(association\s*)?football\s*team\s*$/i, "").trim();
      if (country && !capped[q]) { capped[q] = country; fromCaps++; }
    }
  }
  console.log(`\n${fromCaps} players have a senior international side on file`);

  /* ---------- 3. the bank ---------- */
  const rows = [];
  let noPos = 0, noNat = 0, noYear = 0;
  for (const c of CAREERS) {
    const q = qid[c.n];
    /* the shirt first, then a P1532 that does not contradict itself */
    const listed = (q && sport[q]) || [];
    const nats = capped[q] ? [capped[q]] : (listed.length === 1 ? listed : []);
    const label = box[c.n];
    const pos = bucketOf(label);
    if (!pos) noPos++;
    if (!nats.length) noNat++;
    if (!born[c.n]) noYear++;
    rows.push({
      n: c.n,
      p: pos || null,
      pl: label || null,
      nat: nats[0] || null,
      y: born[c.n] || null,
      c: c.c,
      f: fame[c.n] || 0,
    });
  }
  const full = rows.filter(r => r.p && r.nat && r.y);
  console.log(`\n${rows.length} players, ${full.length} with all four facts`);
  console.log(`  missing: ${noPos} a position, ${noNat} a nationality, ${noYear} a birth year`);
  const twoPassports = CAREERS.filter(c => { const q = qid[c.n]; return q && (sport[q] || []).length > 1; }).length;
  console.log(`  ${twoPassports} are listed under more than one country; the senior shirt settled ${CAREERS.filter(c => capped[qid[c.n]]).length} of them`);
  const targets = full.filter(r => r.f >= TARGET_FLOOR);
  console.log(`  ${targets.length} are famous enough to be the mystery man`);
  const byPos = {};
  full.forEach(r => byPos[r.p] = (byPos[r.p] || 0) + 1);
  console.log(`  positions: ${Object.entries(byPos).map(([k, v]) => k + " " + v).join("  ")}`);

  const odd = full.filter(r => r.pl && r.pl.split(" ").length > 4);
  if (odd.length) console.log(`  ${odd.length} position labels read oddly, e.g. ${odd.slice(0, 3).map(r => r.n + ": " + r.pl).join(" | ")}`);
  console.log("\n  sample:");
  for (const r of targets.slice(0, 8)) console.log(`   ${r.n.padEnd(22)} ${r.p}  ${String(r.pl).padEnd(22)} ${String(r.nat).padEnd(14)} ${r.y}`);

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.mkdirSync(OUT, { recursive: true });
  /* the deck ships everyone (any of them may be guessed) with a flag for who
     may be the answer */
  const out = rows.map(r => ({ ...r, t: r.p && r.nat && r.y && r.f >= TARGET_FLOOR ? 1 : 0 }));
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(out));
  console.log(`\nwritten to assets/mystery/index.json (${out.filter(r => r.t).length} possible answers)`);
})();
