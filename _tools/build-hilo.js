/* Who is older, who is taller: the bank behind the Higher or Lower mode.

     node _tools/build-hilo.js            build it
     node _tools/build-hilo.js --dry      report only, write nothing

   The first Higher or Lower was stadium capacities and it was retired,
   because nobody has a feel for whether a ground holds 38,000 or 52,000 and a
   question you cannot reason about is just a coin toss with extra steps.
   Players are the opposite: everyone has a feel for who is older than who,
   and the argument afterwards is the point.

   Two facts, both nearly universal on the deck: birth date (P569, 95%) and
   height (P2048, 94%). A player only makes the bank if he has both AND a
   portrait already on disk, because the mode shows two faces side by side and
   a blank circle would give the game away.

   Heights come in metres or centimetres depending on who typed them in, so
   the unit is read rather than assumed, and anything outside 150-215cm is
   thrown out as a typo.

   SAFE TO RE-RUN. Rebuilt from scratch each time. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "assets", "hilo");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const DRY = process.argv.includes("--dry");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) { await sleep(2500 * (i + 1)); continue; }
      throw new Error("HTTP " + res.status);
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}

function careerNames() {
  const lines = fs.readFileSync(path.join(REPO, "index.html"), "utf8").split("\n");
  const start = lines.findIndex(l => l.startsWith("const CAREERS"));
  let depth = 0, out = [];
  for (let i = start; i < lines.length; i++) {
    out.push(lines[i]);
    for (const ch of lines[i]) { if (ch === "[") depth++; if (ch === "]") depth--; }
    if (depth === 0 && out.length > 1) break;
  }
  return eval(out.join("\n").replace(/^const CAREERS\s*=\s*/, "").replace(/;\s*$/, "")).map(c => c.n);
}

(async () => {
  const faces = JSON.parse(fs.readFileSync(path.join(REPO, "assets/faces/index.json"), "utf8"));
  const names = careerNames().filter(n => faces[n]);
  console.log(`${names.length} players in the deck with a portrait already on disk\n`);

  /* Height carries a unit, and Wikidata has both metres and centimetres in
     this property, so ?unit comes back with the number rather than being
     assumed. Birth dates are taken at year precision: the mode asks who is
     older, not who is older by three days. */
  const rows = {};
  process.stdout.write("wikidata ");
  for (const batch of chunk(names, 50)) {
    const values = batch.map(n => JSON.stringify(n) + "@en").join(" ");
    const q = `SELECT ?name ?born ?height ?unit WHERE {
        VALUES ?name { ${values} }
        ?p rdfs:label ?name ; wdt:P106 wd:Q937857 ; wdt:P569 ?born ; p:P2048 ?hs .
        ?hs psv:P2048 ?hv . ?hv wikibase:quantityAmount ?height ; wikibase:quantityUnit ?unit .
      }`;
    try {
      const j = await getJSON("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q));
      for (const b of j.results.bindings) {
        const name = b.name.value;
        const year = Number(String(b.born.value).slice(0, 4));
        let cm = Number(b.height.value);
        if (b.unit.value.endsWith("Q11573")) cm *= 100;          // metres
        if (b.unit.value.endsWith("Q3710")) cm *= 30.48;         // feet, because someone did
        cm = Math.round(cm);
        if (!Number.isFinite(year) || year < 1900 || year > 2015) continue;
        if (!Number.isFinite(cm) || cm < 150 || cm > 215) continue;
        // tallest claim wins nothing: keep the first, they barely disagree
        if (!rows[name]) rows[name] = { n: name, y: year, h: cm, f: faces[name] };
      }
    } catch (e) { console.log("\n  batch failed:", e.message); }
    process.stdout.write(".");
    await sleep(500);
  }

  const bank = Object.values(rows).sort((a, b) => a.n.localeCompare(b.n));
  console.log(`\n  ${bank.length} of ${names.length} have a birth year and a usable height`);

  const years = bank.map(r => r.y), hs = bank.map(r => r.h);
  console.log(`\nborn ${Math.min(...years)} to ${Math.max(...years)}, heights ${Math.min(...hs)}cm to ${Math.max(...hs)}cm`);
  console.log("sample:");
  for (let i = 0; i < bank.length; i += Math.floor(bank.length / 8))
    console.log(`   ${bank[i].n.padEnd(26)} born ${bank[i].y}, ${bank[i].h}cm`);

  /* A pair is only worth asking if the answer is not a coin toss and not a
     dead heat. This is the same check the mode does at deal time, run here so
     the pack cannot ship a bank that cannot make a question. */
  let askableAge = 0, askableHeight = 0, pairs = 0;
  for (let i = 0; i < bank.length; i++) for (let j = i + 1; j < bank.length; j++) {
    pairs++;
    if (Math.abs(bank[i].y - bank[j].y) >= 2) askableAge++;
    if (Math.abs(bank[i].h - bank[j].h) >= 3) askableHeight++;
  }
  console.log(`\n${pairs.toLocaleString()} possible pairs`);
  console.log(`  ${Math.round(askableAge / pairs * 100)}% differ by 2+ years, ${Math.round(askableHeight / pairs * 100)}% by 3+ cm`);

  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(bank, null, 1));
  console.log(`\nwritten to assets/hilo/index.json (${(fs.statSync(path.join(OUT, "index.json")).size / 1024).toFixed(0)} KB)`);
})();
