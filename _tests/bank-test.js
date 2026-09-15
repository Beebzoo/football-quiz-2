/* Classic question bank regression test.

     node _tests/bank-test.js

   Loads the app for real, with fetch wired to the repo so the question packs
   actually load, then checks the things that would spoil a night: a question
   that turns up twice, an answer that is missing or runs off the card, a bank
   that renumbers itself between page loads, and one question shape swallowing
   a tier.

   Reuses the stub DOM from mp-test.js. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));

let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

// the stub fetch rejects; swap in one that serves files off disk
function boot() {
  eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, "")
    .replace("fetch: () => Promise.reject(new Error(\"offline in test\")),",
      `fetch: (u) => { try { const b = require("fs").readFileSync(require("path").join(${JSON.stringify(REPO)}, u), "utf8");
         return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(b)) }); }
         catch (e) { return Promise.resolve({ ok: false, json: () => Promise.reject(e) }); } },`));
  return makeInstance("bank");
}

(async () => {
  const app = boot();
  await new Promise(r => setTimeout(r, 400));           // let the packs land
  const ev = e => vm.runInContext("(" + e + ")", app);
  const TIERS = ["easy", "normal", "hard", "extreme", "ball"];

  const counts = {};
  TIERS.forEach(t => { counts[t] = ev(`BANK.${t}.length`); });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log("--- bank size ---");
  TIERS.forEach(t => console.log(`      ${t.padEnd(9)} ${counts[t]}`));
  console.log(`      ${"TOTAL".padEnd(9)} ${total}`);
  check("every tier has questions", TIERS.every(t => counts[t] > 0), JSON.stringify(counts));
  check("the deep pack reached Hard", counts.hard >= 500, counts.hard);
  check("the deep pack reached BALL", counts.ball >= 350, counts.ball);
  check("the deep pack reached Extreme", counts.extreme >= 480, counts.extreme);

  console.log("\n--- nothing asked twice ---");
  const all = [];
  TIERS.forEach(t => JSON.parse(ev(`JSON.stringify(BANK.${t})`)).forEach(q => all.push({ t, ...q })));
  const byQ = new Map(), dupes = [];
  all.forEach(q => {
    const k = norm(q.q);
    if (byQ.has(k)) dupes.push(`${byQ.get(k)} / ${q.t}: ${q.q}`); else byQ.set(k, q.t);
  });
  check("no duplicate questions anywhere in the bank", dupes.length === 0, dupes.length + " found");
  dupes.slice(0, 6).forEach(d => console.log("        " + d));

  console.log("\n--- answers fit on a card ---");
  check("no missing answers", all.every(q => q.a && String(q.a).trim()), all.filter(q => !q.a).length);
  check("no question over 150 chars", all.every(q => q.q.length <= 150), all.filter(q => q.q.length > 150).map(q => q.q.slice(0, 60))[0]);
  check("no answer over 110 chars", all.every(q => String(q.a).length <= 110), all.filter(q => String(q.a).length > 110).map(q => String(q.a).slice(0, 60))[0]);

  /* The deep pack is handwritten history, so nothing in it should depend on
     who happens to play where this season. "Netherlands' all-time leading
     scorer" was written as Van Persie and was already wrong: Depay passed him
     in 2025. Ask about the event, not the current holder. Scoped to the deep
     pack; the older bank still has these and they are tracked separately. */
  console.log("\n--- nothing in the deep pack has a shelf life ---");
  const deep = JSON.parse(fs.readFileSync(path.join(REPO, "assets/deep/index.json"), "utf8"));
  /* Present tense is the tell. "Which club did X join after leaving Y" is a
     past event and safe forever; "which club does X play for" is a bet on the
     transfer window. Likewise a question about who broke a record is history,
     while one asking who currently holds it is not. */
  const ROT = [
    [/\bplays for\b|\bdoes .+ play for\b|\bcurrently\b|\bnow plays\b|\bplay for last\b/i, "present tense, breaks on a transfer"],
    [/\bis the (manager|coach) of\b|\bmanages\b/i, "breaks on a sacking"],
    [/^who (is|are|holds)\b.*\b(all-time|record|most|oldest|youngest)\b/i, "asks for the current holder of a record"],
    [/\bhas won the most\b|\bholds the record for\b/i, "a running record, not a settled fact"],
    [/\breigning\b|\bdefending champions?\b/i, "breaks every season"],
  ];
  const rotten = [];
  ["hard", "ball"].forEach(t => deep[t].forEach(q => {
    ROT.forEach(([re, why]) => { if (re.test(q.q)) rotten.push(`[${t}] ${why}: ${q.q}`); });
  }));
  check("no question in the deep pack goes stale", rotten.length === 0, rotten.length + " found");
  rotten.slice(0, 5).forEach(r => console.log("        " + r));

  /* Both decks are curated for playing, not citing, and they say so in their
     note fields. Career Path can show a simplified route because you see the
     route; a Classic question asserting "he joined X straight after Y" cannot.
     Alex McLeish's entry drops Rangers, so "which job between Motherwell and
     Scotland" had two right answers until this gate went in. */
  console.log("\n--- no question claims a move the deck admits it simplified ---");
  const MG = JSON.parse(fs.readFileSync(path.join(REPO, "assets/managers/index.json"), "utf8"));
  const htmlSrc = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const cblk = htmlSrc.slice(htmlSrc.indexOf("const CAREERS = ["), htmlSrc.indexOf("const SAVE_KEY"));
  const CA = eval(cblk.slice(cblk.indexOf("["), cblk.lastIndexOf("]") + 1));
  const GAPPY = /simplif|skipp?ed|not shown|omitted|started at|early|finale|wind-down|via |loan|also|too\b/i;
  /* Check each question against the deck it was actually built from. Several
     people are in both decks, and a simplified DUGOUT career says nothing
     about whether their PLAYING career is complete: Van Nistelrooy's manager
     entry is simplified, his playing entry is not. */
  const gappyOf = deck => new Set(deck.filter(p => p.note && GAPPY.test(p.note)).map(p => p.n));
  const gappyPlayers = gappyOf(CA), gappyMgrs = gappyOf(MG);
  const ADJACENT = [
    [/^Which club did (.+) join after leaving /, gappyPlayers],
    [/^Which club did (.+) start his senior career at\?/, gappyPlayers],
    [/^Which club did (.+) play for between /, gappyPlayers],
    [/^Which club did (.+) leave to sign for /, gappyPlayers],
    [/^Which club have both (.+) and (.+) played for\?/, gappyPlayers],
    [/^Which job did (.+) take after /, gappyMgrs],
    [/^Where did (.+) take his first coaching job\?/, gappyMgrs],
    [/^Which job did (.+) hold between /, gappyMgrs],
    [/^Which national side has (.+) taken charge of\?/, gappyMgrs],
    [/^Which club have both (.+) and (.+) managed\?/, gappyMgrs],
  ];
  const tainted = [];
  ["hard", "ball", "extreme"].forEach(t => deep[t].forEach(q => {
    for (const [re, set] of ADJACENT) {
      const m = q.q.match(re);
      if (!m) continue;
      for (let i = 1; i < m.length; i++) if (m[i] && set.has(m[i].trim())) tainted.push(`[${t}] ${q.q}`);
      break;
    }
  }));
  check("no adjacency claim rests on a simplified deck entry", tainted.length === 0, tainted.length + " found");
  tainted.slice(0, 4).forEach(t => console.log("        " + t));

  console.log("\n--- the bank numbers itself the same way every load ---");
  /* S.used stores indexes, so a resumed match points at the wrong questions if
     two packs can land in either order. Boot a second copy and compare. */
  const app2 = boot();
  await new Promise(r => setTimeout(r, 400));
  const ev2 = e => vm.runInContext("(" + e + ")", app2);
  const sameOrder = TIERS.every(t => ev(`BANK.${t}.map(q=>q.q).join("|")`) === ev2(`BANK.${t}.map(q=>q.q).join("|")`));
  check("two loads produce an identical bank order", sameOrder, "packs raced");

  console.log("\n--- no single shape swallows a tier ---");
  let worst = null;
  TIERS.forEach(t => {
    const rows = JSON.parse(ev(`JSON.stringify(BANK.${t})`)), sh = {};
    rows.forEach(q => {
      /* Collapse every number, not just years. "Who wore number 5 for" and
         "number 7 for" are one shape to anyone sitting at the table, and
         counting them separately hid 115 of them in a single tier. */
      const s = q.q.replace(/\b\d+(\/\d+)?\b/g, "<n>").split(" ").slice(0, 5).join(" ");
      sh[s] = (sh[s] || 0) + 1;
    });
    const [top, n] = Object.entries(sh).sort((a, b) => b[1] - a[1])[0];
    const pct = Math.round(n / rows.length * 100);
    console.log(`      ${t.padEnd(9)} biggest shape ${String(pct).padStart(3)}%  (${n}/${rows.length})  "${top} ..."`);
    if (!worst || pct > worst.pct) worst = { t, pct, top };
  });
  check("no shape is more than a quarter of its tier", worst.pct <= 25, `${worst.pct}% in ${worst.t}: "${worst.top}"`);

  /* ---------- a specialism has something to draw from ---------- */
  console.log("\n--- the eleven specialisms ---");
  const CATS = ["champions", "scorers", "transfers", "managers", "grounds",
    "records", "europe", "cups", "relegation", "imports", "stories"];
  /* THERE IS NO SHORT LIST ANY MORE, and how it went is the argument for
     writing a guard this way round. Three categories could not be fed from the
     inline bank: relegation had one row in 6,984, imports nine, cups sixteen.
     They were named here rather than skipped, so that feeding them would FAIL
     this test rather than pass it quietly. Tagging the five packs fed them, and
     it failed and named all three, which is exactly what it was for.

       relegation   1 -> 59, a pool in four tiers of five
       imports      9 -> 226, a pool in four tiers
       cups        16 -> 152, a pool in all five */
  const PER_CAT = 8;        // rows of one category in one tier before it is a pool
  const WORKING = 10;       // categories that must clear that, per tier

  const catPer = {};
  let catTagged = 0, catRows = 0;
  const strays = new Set();
  TIERS.forEach(t => {
    catPer[t] = {};
    JSON.parse(ev(`JSON.stringify(BANK.${t})`)).forEach(r => {
      catRows++;
      if (!r.cat) return;
      catTagged++;
      if (CATS.indexOf(r.cat) < 0) strays.add(r.cat);
      catPer[t][r.cat] = (catPer[t][r.cat] || 0) + 1;
    });
  });
  TIERS.forEach(t => {
    const live = CATS.filter(c => (catPer[t][c] || 0) >= PER_CAT);
    console.log(`      ${t.padEnd(9)} ${String(Object.values(catPer[t]).reduce((a, b) => a + b, 0)).padStart(4)} tagged, ` +
      `${live.length} of 11 with a real pool: ${live.join(" ")}`);
  });
  console.log(`      ${"LIVE".padEnd(9)} ${catTagged} of ${catRows} rows carry a category, ` +
    `${Math.round(catTagged / catRows * 100)}%`);

  check("the classic bank carries categories at all", catTagged > 900, catTagged + " of " + catRows);
  check("and every one is on the closed list of eleven", strays.size === 0, [...strays].join(", "));
  /* AND THE SHARE IS A NUMBER RATHER THAN A NOTE. This read thirteen per cent
     when only the inline bank was tagged and the five packs were the gap. The
     packs are tagged now, so it reads eighty-five, and the floor moves with it.
     The 1,029 rows still carrying nothing are the ones with no honest home
     among the eleven, which is a real answer: h2Draw falls back to the whole
     tier, so they are still asked. */
  check("the tagged share has not gone backwards",
    catTagged / catRows >= 0.82, Math.round(catTagged / catRows * 100) + "%");
  /* AND EVERY TIER HAS ENOUGH WORKING CATEGORIES TO BE WORTH FILTERING ON,
     because h2Draw filters one tier at a time and a category that is fat across
     the bank and empty in this tier leaves its man drawing from everything. */
  const weak = TIERS.filter(t => CATS.filter(c => (catPer[t][c] || 0) >= PER_CAT).length < WORKING);
  check("every tier has at least ten categories with a real pool", weak.length === 0,
    weak.map(t => t + " has " + CATS.filter(c => (catPer[t][c] || 0) >= PER_CAT).length).join(", "));
  /* AND THE THREE THAT HAD NOTHING HAVE A POOL SOMEWHERE, which is what tagging
     the packs was for. Kept as its own line rather than folded into the floor
     above, because those three are what a regression would hit first: they are
     the thinnest, and they are thin because the bank is world football rather
     than one league's foreign legion. */
  const WAS_STARVED = ["relegation", "imports", "cups"];
  const starved = WAS_STARVED.filter(c => !TIERS.some(t => (catPer[t][c] || 0) >= PER_CAT));
  check("the three that used to have nothing all have a pool now", starved.length === 0,
    "back to starving: " + starved.join(", "));

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("HARNESS ERROR:", e); process.exit(2); });
