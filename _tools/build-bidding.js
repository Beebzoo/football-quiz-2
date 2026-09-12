/* Build the Bidding deck: a club, a country, and how many men fit both.

     node _tools/build-bidding.js --dry
     node _tools/build-bidding.js

   "I can name four Brazilians who played for Milan." "Prove it." That is the
   whole game, and it is the only mode here that makes people talk to each
   other rather than to the phone.

   THE APP DOES NOT JUDGE THE NAMES, AND THAT IS DELIBERATE. It knows the men
   in its own deck, which is a thousand careers, not every footballer who ever
   lived. If it marked answers, it would tell somebody that a perfectly real
   Brazilian who played for Milan does not count, and there is no arguing with
   a phone. So the reader marks the names, the way Classic works, and the app's
   own list is only shown once the round is over, as a curiosity.

   What the app does need to get right is the CHALLENGE: a pairing has to have
   enough men behind it that a bid of three or four is fair. That number comes
   from its own deck, so it is a floor rather than a total, which is exactly
   the right way round: the real answer is always at least this big.

   SAFE TO RE-RUN. Reads only files already in the repo plus the cached
   nationalities from the wall build. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const HTML = path.join(REPO, "index.html");
const MODELS = path.join(__dirname, "_models");
const OUT = path.join(REPO, "assets", "bidding");
const DRY = process.argv.includes("--dry");

/* a pairing needs this many in our own deck before it is worth bidding on */
const MIN_KNOWN = 4;
const cacheRead = f => { try { return JSON.parse(fs.readFileSync(path.join(MODELS, f), "utf8")); } catch (e) { return null; } };

(async () => {
  const html = fs.readFileSync(HTML, "utf8");
  const i = html.indexOf("const CAREERS = ["), j = html.indexOf("\n];", i);
  const CAREERS = eval(html.slice(i + "const CAREERS = ".length, j + 2));

  const qid = cacheRead("wall-qid.json") || {};
  const sport = cacheRead("wall-sport.json") || {};
  const teams = cacheRead("careers-clubs2.json") || {};
  const YOUTHNAT = /under-?\d|\bu-?\d{2}\b|youth|olympic|amateur|\bb\b\s*team\s*$/i;
  const spells = cacheRead("careers-spells.json") || {};

  /* the shirt he actually wore, same rule as the mystery bank */
  const capped = {};
  for (const [q, v] of Object.entries(spells)) {
    if (!v.name || !v.sp) continue;
    for (const sp of v.sp) {
      const t = teams[sp.q];
      if (!t || !t.nat) continue;
      const nm = (t.title || t.en || "");
      if (YOUTHNAT.test(nm)) continue;
      const country = nm.replace(/\s*(men's|women's)?\s*national\s*(association\s*)?football\s*team\s*$/i, "").trim();
      if (country && !capped[q]) capped[q] = country;
    }
  }
  const natOf = name => {
    const q = qid[name];
    if (!q) return null;
    if (capped[q]) return capped[q];
    const l = sport[q] || [];
    return l.length === 1 ? l[0] : null;
  };

  /* club names the app can print */
  const named = {};
  try {
    const L = JSON.parse(fs.readFileSync(path.join(REPO, "assets/leagues/index.json"), "utf8"));
    for (const lg of (Array.isArray(L) ? L : Object.values(L))) for (const c of (lg.clubs || lg.teams || [])) if (c.s && c.n) named[c.s] = c.n;
  } catch (e) {}
  try {
    const B = JSON.parse(fs.readFileSync(path.join(REPO, "assets/badges/index.json"), "utf8"));
    for (const t of Object.values(B)) for (const b of t) if (b.s && b.n && !named[b.s]) named[b.s] = b.n;
  } catch (e) {}

  /* only clubs the table would recognise: the ones Alumni already asks about */
  const good = new Set();
  try {
    const A = JSON.parse(fs.readFileSync(path.join(REPO, "assets/alumni/index.json"), "utf8"));
    for (const c of A) good.add(c.s);
  } catch (e) {}

  const pair = {};
  for (const c of CAREERS) {
    const nat = natOf(c.n);
    if (!nat) continue;
    for (const s of new Set(c.c)) {
      if (!good.has(s) || !named[s]) continue;
      const k = s + "|" + nat;
      (pair[k] = pair[k] || []).push(c.n);
    }
  }

  const deck = [];
  for (const [k, players] of Object.entries(pair)) {
    if (players.length < MIN_KNOWN) continue;
    const [s, nat] = k.split("|");
    const label = named[s].replace(/\s+(F\.?C\.?|FC)$/i, "").trim();
    if (/undefined|[{}|]/.test(label)) continue;
    deck.push({ s, c: label, nat, p: players, k: players.length });
  }
  deck.sort((a, b) => b.k - a.k);

  console.log(`${deck.length} pairings with at least ${MIN_KNOWN} men in our own deck`);
  const spread = {};
  deck.forEach(d => spread[Math.min(d.k, 10)] = (spread[Math.min(d.k, 10)] || 0) + 1);
  console.log(`  known men per pairing: ${Object.entries(spread).sort((a, b) => a[0] - b[0]).map(([k, v]) => k + ":" + v).join("  ")}`);
  console.log(`  ${new Set(deck.map(d => d.nat)).size} countries, ${new Set(deck.map(d => d.s)).size} clubs`);
  console.log("\n  sample:");
  for (const d of deck.slice(0, 4).concat(deck.slice(-3)))
    console.log(`   ${String(d.k).padStart(2)}  ${d.nat} at ${d.c}: ${d.p.slice(0, 6).join(", ")}`);

  const noCrest = deck.filter(d => !fs.existsSync(path.join(REPO, "assets/logos", d.s + ".png")));
  if (noCrest.length) { console.log(`STOP: ${noCrest.length} without a crest`); return; }
  console.log(`\n  every crest present`);

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(deck));
  console.log(`\nwritten to assets/bidding/index.json`);
})();
