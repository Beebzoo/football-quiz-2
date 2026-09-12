/* Build the Order Them deck: five things, one number, drag them into line.

     node _tools/build-order.js --dry
     node _tools/build-order.js --sets 120

   Timeline already asks you to put five things in order and already has the
   drag that took a day to get right, so this mode is that machine pointed at
   numbers that are not years: how big a ground is, how old a club is, how old
   a player is. The bank therefore ships in Timeline's own shape, {q, items:
   [{t, y}]}, and the app runs both off one engine the way Career Path and
   Manager Path share theirs.

   ALWAYS SMALLEST FIRST. The engine scores an ascending order, so every prompt
   is phrased to ask for one. "Biggest first" would score every answer exactly
   backwards and the mode would look broken rather than wrong.

   FIVE CLEARLY DIFFERENT NUMBERS, or the puzzle is a coin toss with extra
   steps. Two grounds 300 seats apart is not a question anyone can answer, so
   each set is checked for a real gap between neighbours before it ships.

   SAFE TO RE-RUN. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const MODELS = path.join(__dirname, "_models");
const OUT = path.join(REPO, "assets", "order");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const WD = "https://www.wikidata.org/w/api.php";
const DRY = process.argv.includes("--dry");
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SETS = +(arg("--sets") || 120);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const cacheRead = f => { try { return JSON.parse(fs.readFileSync(path.join(MODELS, f), "utf8")); } catch (e) { return null; } };
const cacheWrite = (f, v) => { fs.mkdirSync(MODELS, { recursive: true }); fs.writeFileSync(path.join(MODELS, f), JSON.stringify(v)); };
async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } }); if (r.ok) return r.json(); if (r.status === 404) return null; } catch (e) {}
    await sleep(1500 * (i + 1));
  }
  return null;
}

const pick = a => a[Math.floor(Math.random() * a.length)];
/* neighbours must differ by this much, as a share of the smaller value, or the
   set is a guess rather than a question */
const GAP = 0.12;

function makeSets(pool, prompt, want, fmt) {
  const out = [];
  let tries = 0;
  const seen = new Set();
  while (out.length < want && tries < want * 300) {
    tries++;
    const five = [];
    while (five.length < 5) { const c = pick(pool); if (!five.some(x => x.t === c.t)) five.push(c); }
    five.sort((a, b) => a.y - b.y);
    if (new Set(five.map(x => x.y)).size !== 5) continue;
    let ok = true;
    for (let i = 1; i < 5; i++) if ((five[i].y - five[i - 1].y) < Math.abs(five[i - 1].y) * GAP && (five[i].y - five[i - 1].y) < 4) ok = false;
    if (!ok) continue;
    const sig = five.map(x => x.t).sort().join("|");
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ q: prompt, items: five.map(x => ({ t: x.t, y: x.y })), f: fmt });
  }
  return out;
}

(async () => {
  const sets = [];

  /* ---------- grounds ---------- */
  const stad = JSON.parse(fs.readFileSync(path.join(REPO, "assets/stadiums/index.json"), "utf8"));
  const grounds = (Array.isArray(stad) ? stad : Object.values(stad).flat())
    .filter(r => r.capacity > 8000 && r.name)
    .map(r => ({ t: r.name, y: r.capacity }));
  console.log(`${grounds.length} grounds with a capacity`);
  sets.push(...makeSets(grounds, "Order these grounds, smallest first", Math.round(SETS * 0.4), "n"));

  /* ---------- players ---------- */
  let players = [];
  try {
    const mys = JSON.parse(fs.readFileSync(path.join(REPO, "assets/mystery/index.json"), "utf8"));
    players = mys.filter(r => r.y && r.f >= 300000).map(r => ({ t: r.n, y: r.y }));
  } catch (e) {}
  console.log(`${players.length} players with a birth year and a name worth reading`);
  sets.push(...makeSets(players, "Order these players, oldest first", Math.round(SETS * 0.3), "y"));

  /* ---------- clubs ---------- */
  const named = {};
  try {
    const L = JSON.parse(fs.readFileSync(path.join(REPO, "assets/leagues/index.json"), "utf8"));
    for (const lg of (Array.isArray(L) ? L : Object.values(L))) for (const c of (lg.clubs || lg.teams || [])) if (c.s && c.n) named[c.s] = c.n;
  } catch (e) {}
  try {
    const B = JSON.parse(fs.readFileSync(path.join(REPO, "assets/badges/index.json"), "utf8"));
    for (const tier of Object.values(B)) for (const b of tier) if (b.s && b.n && !named[b.s]) named[b.s] = b.n;
  } catch (e) {}

  /* the club items the careers build already resolved, with their crests */
  const teams = cacheRead("careers-clubs2.json") || {};
  let founded = cacheRead("order-founded.json") || {};
  const wanted = Object.entries(teams).filter(([q, v]) => v && !v.nat && v.en && !(q in founded)).map(([q]) => q);
  if (wanted.length) {
    process.stdout.write(`reading ${wanted.length} founding years  `);
    let n = 0;
    for (const batch of chunk(wanted, 45)) {
      const j = await getJSON(WD + "?action=wbgetentities&format=json&props=claims&ids=" + batch.join("|"));
      for (const id of batch) {
        const e = j && j.entities && j.entities[id];
        const c = e && ((e.claims && e.claims.P571) || [])[0];
        const t = c && c.mainsnak.datavalue && c.mainsnak.datavalue.value.time;
        const y = t ? +String(t).slice(1, 5) : null;
        founded[id] = (y && y > 1820 && y < 2025) ? y : null;
      }
      n += batch.length;
      if (n % 450 === 0) { cacheWrite("order-founded.json", founded); process.stdout.write("."); }
      await sleep(150);
    }
    cacheWrite("order-founded.json", founded);
    console.log("");
  }
  /* Only clubs somebody could actually place. The first build asked players to
     sort MŠK Púchov against Persma Manado and Al-Karma, which is not a puzzle,
     it is a lottery. The gate is the same fame the other banks use: a club has
     to be one the Alumni deck already asks about, or sit in the top two tiers
     of the badge bank. */
  const famous = new Set();
  const key = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  try {
    const A = JSON.parse(fs.readFileSync(path.join(REPO, "assets/alumni/index.json"), "utf8"));
    for (const c of A) famous.add(key(c.n));
  } catch (e) {}
  try {
    const B = JSON.parse(fs.readFileSync(path.join(REPO, "assets/badges/index.json"), "utf8"));
    for (const t of ["easy", "normal"]) for (const b of (B[t] || [])) famous.add(key(b.n));
  } catch (e) {}
  console.log(`${famous.size} clubs are well enough known to be ordered`);

  const byName = {};
  for (const [q, y] of Object.entries(founded)) {
    if (!y || !teams[q]) continue;
    const en = teams[q].title || teams[q].en;
    if (!en || /undefined|[{}|]/.test(en)) continue;
    const clean = en.replace(/\s*\(.*\)\s*$/, "").replace(/\s+(F\.?C\.?|FC|A\.?F\.?C\.?)$/i, "").trim();
    if (clean.length < 3 || byName[clean]) continue;
    if (!famous.has(key(clean)) && !famous.has(key(en))) continue;
    byName[clean] = y;
  }
  const clubs = Object.entries(byName).map(([t, y]) => ({ t, y }));
  console.log(`${clubs.length} clubs with a founding year`);
  sets.push(...makeSets(clubs, "Order these clubs, oldest first", SETS - sets.length, "y"));

  /* ---------- report ---------- */
  const byQ = {};
  sets.forEach(s => byQ[s.q] = (byQ[s.q] || 0) + 1);
  console.log(`\n${sets.length} sets`);
  Object.entries(byQ).forEach(([q, n]) => console.log(`   ${n}  ${q}`));
  console.log("\n  sample:");
  for (const s of [sets[0], sets[Math.floor(sets.length * 0.5)], sets[sets.length - 1]]) {
    console.log(`   ${s.q}`);
    s.items.forEach(i => console.log(`      ${String(i.y).padStart(7)}  ${i.t}`));
  }

  /* the engine scores an ascending order, so every set must actually be one */
  const notSorted = sets.filter(s => s.items.some((it, i) => i && it.y <= s.items[i - 1].y));
  console.log(`\n  sets stored out of order: ${notSorted.length}`);
  const dashes = sets.filter(s => /[–—]/.test(s.q) || s.items.some(i => /[–—]/.test(i.t)));
  console.log(`  em dashes: ${dashes.length}`);

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(sets));
  console.log(`\nwritten to assets/order/index.json`);
})();
