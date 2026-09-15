/* Asset integrity test.

     node _tests/assets-test.js

   Every image set that ships with an index and an attribution file has to
   agree with what is actually on disk. A missing file shows as a broken image
   mid-round; an unattributed one is a licence problem, since all of this comes
   from Wikimedia Commons under CC terms that require credit. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- " + x)); if (!c) fails++; };

/* The three CSVs grew separately and have different shapes, so the licence and
   author columns have to be named per set rather than assumed. */
const SETS = [
  { dir: "assets/faces", index: "index.json", files: j => Object.values(j),
    attrib: "ATTRIBUTION.csv", fileCol: 0, licCol: 2, authCol: 3 },
  { dir: "assets/stadiums", index: null,
    attrib: "ATTRIBUTION.csv", fileCol: 0, licCol: 4, authCol: 5 },
  { dir: "assets/kits", index: "index.json", files: j => Object.values(j).flat().map(k => k.s + ".png"),
    attrib: "ATTRIBUTION.csv", fileCol: 0, licCol: 3, authCol: 4 },
];

for (const set of SETS) {
  const dir = path.join(REPO, set.dir);
  if (!fs.existsSync(dir)) { check(`${set.dir} exists`, false, "missing"); continue; }
  console.log(`\n--- ${set.dir} ---`);
  const onDisk = new Set(fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f)));

  if (set.index) {
    const idx = JSON.parse(fs.readFileSync(path.join(dir, set.index), "utf8"));
    const wanted = set.files(idx);
    const missing = wanted.filter(f => !onDisk.has(f));
    check("every file the index points at is on disk", missing.length === 0, `${missing.length} missing, e.g. ${missing[0]}`);
    check("index is not empty", wanted.length > 0, wanted.length);
    console.log(`      ${wanted.length} indexed, ${onDisk.size} on disk`);
  }

  const csv = fs.readFileSync(path.join(dir, set.attrib), "utf8").trim().split("\n").slice(1);
  const credited = new Set(csv.map(l => l.split(";")[set.fileCol]));
  const uncredited = [...onDisk].filter(f => !credited.has(f));
  check("every image on disk is credited", uncredited.length === 0,
        `${uncredited.length} uncredited, e.g. ${uncredited[0]}`);

  /* An author is owed where the licence asks for one. Public domain and CC0
     ask for nothing, and Batistuta's photo genuinely has no author recorded
     on Commons, so demanding one there was the test being wrong rather than
     the data. Anything with BY in it still has to name somebody. */
  const needsAuthor = lic => /\bBY\b/i.test(lic) && !/^(public domain|CC0)/i.test(lic);
  const blank = csv.filter(l => {
    const c = l.split(";");
    if (!c[set.licCol]) return true;
    return needsAuthor(c[set.licCol]) && (!c[set.authCol] || c[set.authCol] === "unknown");
  });
  check("every credit names a licence, and an author where one is owed", blank.length === 0,
        `${blank.length} incomplete, e.g. ${(blank[0] || "").split(";")[0]}`);
  console.log(`      ${csv.length} attribution rows`);
}

/* A portrait is drawn in a circle, so a photo taller than it is wide gets its
   middle shown and the man's head cut off above the frame. _tools/
   build-facecrop.py finds the face and crops a square, and this is the check
   that the square actually shipped. */
console.log("\n--- portraits are framed for a circle ---");
function jpegSize(file) {
  const b = fs.readFileSync(file);
  let i = 2;                                          // skip SOI
  while (i < b.length - 9) {
    if (b[i] !== 0xFF) { i++; continue; }
    const marker = b[i + 1];
    // SOF0..SOF15, minus the four that are not frame headers
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC, 0xD8].includes(marker)) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}
const faceDir = path.join(REPO, "assets/faces");
const faceFiles = fs.readdirSync(faceDir).filter(f => f.endsWith(".jpg"));
const sizes = faceFiles.map(f => ({ f, ...(jpegSize(path.join(faceDir, f)) || {}) }));
const oblong = sizes.filter(s => s.w !== s.h);
const pct = Math.round((sizes.length - oblong.length) / sizes.length * 100);
console.log(`      ${sizes.length - oblong.length} of ${sizes.length} are square (${pct}%)`);
check("at least 90% of portraits are cropped square", pct >= 90,
      `${oblong.length} still oblong, e.g. ${oblong.slice(0, 3).map(s => s.f + " " + s.w + "x" + s.h).join(", ")}`);
/* the leftovers are faces the detector could not find; they fall back to the
   CSS anchor, which only works on something roughly upright */
check("nothing left oblong is a tower", oblong.every(s => s.h / s.w < 2.2),
      oblong.filter(s => s.h / s.w >= 2.2).map(s => s.f).join(", "));
const heavy = sizes.filter(s => fs.statSync(path.join(faceDir, s.f)).size > 120 * 1024);
check("no portrait weighs more than 120KB", heavy.length === 0,
      `${heavy.length} heavy, e.g. ${heavy[0] && heavy[0].f}`);

/* the faces are deliberately kept out of the precache: they would triple it */
/* ---------- every squad pool ---------- */
console.log("\n--- the squad pools ---");
{
  /* the registry as the app declares it, read out of index.html rather than
     typed here, so a pool added to one and not the other shows up */
  const app = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const block = app.slice(app.indexOf("const POOLS = {"), app.indexOf("const QUIZZES = {"));
  const rows = [...block.matchAll(/^\s*"?([a-z0-9-]+)"?:\s*\{[\s\S]*?file:\s*"([^"]+)"[\s\S]*?flags:\s*(null|"[^"]*")[\s\S]*?ext:\s*"([^"]*)"/gm)]
    .map(m => ({id: m[1], file: m[2], flags: m[3] === "null" ? null : m[3].slice(1, -1), ext: m[4]}));
  check("the pool registry parses", rows.length >= 3, rows.length + " pools found");

  /* MEASURED, NOT CHOSEN. Every one of these is what the pool actually carries
     today, less about eight points of tolerance. The spread is real: sixteen
     European squads in 2000 were almost all inside the five leagues this repo
     has data for, and forty-eight squads in 2026 reach a long way past them.

     finals is zero deliberately, stated in _tools/build-finals-pool.js:26, and
     it is checked for EQUALITY below rather than as a floor, because a floor of
     zero is satisfied by every number there is and would have guarded nothing.
     A gap nothing guards reads the same as a gap nobody noticed. */
  const LG_FLOOR = {
    euro2000: 80, euro2004: 70, euro2008: 70, euro2012: 75,
    euro2016: 70, euro2020: 65, euro2024: 55,
    wc1998: 60, wc2002: 60, wc2006: 60, wc2010: 65,
    wc2014: 65, wc2018: 60, wc2022: 60, wc2026: 45,
    finals: 0,
  };
  for(const row of rows){
    const p = path.join(REPO, row.file);
    if(!fs.existsSync(p)){ check(row.id + ": the file is on disk", false, row.file); continue; }
    const deck = JSON.parse(fs.readFileSync(p, "utf8"));
    const sides = Object.keys(deck);
    const bad = [], broken = [], plain = [];
    const kits = {};
    let men = 0, withLg = 0;
    for(const name of sides){
      const t = deck[name];
      const xi = t.xi || [], bench = t.bench || [];
      if(xi.length !== 11) bad.push(name + " has " + xi.length + " in the XI");
      const gks = xi.filter(m => m.pos === "GK").length;
      if(gks !== 1) bad.push(name + " has " + gks + " keepers in the XI");
      /* A MAN IN BOTH LISTS IS TWO MEN as far as a substitution is concerned,
         and it is the sort of thing a harvest does silently. */
      const seen = new Set();
      for(const m of [...xi, ...bench]){
        const k = String(m.no) + "|" + m.n;
        if(seen.has(k)) bad.push(name + ": " + m.n + " is in the squad twice");
        seen.add(k);
        men++;
        if(m.lg && m.lg.length) withLg++;
      }
      if(row.flags){
        /* NO BADGE IS A DESIGN: the picker draws a kit-coloured swatch for a
           side that has none, so a pool can ship before every crest is found.
           A NAMED badge with no file is the bug, because that is a broken
           image on the first screen anybody sees. */
        if(!t.flag) plain.push(name);
        else if(!fs.existsSync(path.join(REPO, row.flags + t.flag + row.ext))) broken.push(name + " (" + t.flag + ")");
      }
      const k = String(t.kit || "").toUpperCase();
      if(k) kits[k] = (kits[k] || 0) + 1;
    }
    const lgPc = Math.round(withLg / Math.max(1, men) * 100);
    console.log("      " + row.id + ": " + sides.length + " sides, " + men + " men, " +
      lgPc + "% with a career" +
      (plain.length ? ", " + plain.length + " with no badge" : ""));
    /* AND NOW IT IS ASSERTED, not only printed. lg is what routes a ball in The
       Dugout to a league deck, so a harvest that collapsed on one pool would
       not fail anything: the mode would go on working and quietly become the
       classic bank with extra steps. Floors are today's measured numbers less
       about eight points, so a re-harvest that moves a few men is fine and one
       that broke is not. They only ever move downward, because finding more
       careers never trips a floor. */
    /* AN EQUALITY FOR THE ONE POOL THAT IS MEANT TO HAVE NONE, and a floor for
       the rest. A floor of zero is satisfied by every number there is, so
       writing finals: 0 into the table and calling it a guard would have been a
       comment describing something that was not happening. Finals carries no
       careers on purpose, build-finals-pool.js:26 says so, and the day that
       changes this line is the one that should say hello. */
    if(row.id === "finals")
      check(row.id + ": still has no careers, which is the deliberate part",
        lgPc === 0, lgPc + "% now, so raise LG_FLOOR.finals off zero and give it a real floor");
    else if(LG_FLOOR[row.id] !== undefined)
      check(row.id + ": the careers harvest still covers the squad",
        lgPc >= LG_FLOOR[row.id], lgPc + "% against a floor of " + LG_FLOOR[row.id] + "%");
    check(row.id + ": every side is eleven men and one keeper", bad.length === 0,
      bad.slice(0, 3).join("; "));
    if(row.flags) check(row.id + ": every badge it names is on disk", broken.length === 0,
      broken.slice(0, 5).join(", "));
    /* THE DOMINANT COLOUR, PRINTED EVERY RUN, because this is the one number
       that says whether the kit harvest worked and it is worth looking at
       rather than only worth failing on.

       WHITE IS THE BASE OF EVERY STRIPED SHIRT, which is why half of La Liga
       comes back #FFFFFF: Athletic, Espanyol, Racing, Malaga and Rayo are all
       white with something on top, and the harvest reads the base. That is a
       real gap (ten identical kits on one pitch) and it is recorded in
       PLAN.md rather than papered over here, so the bar is set where a
       genuinely failed harvest sits: three fifths of a pool in one colour. */
    const worst = Object.entries(kits).sort((a, b) => b[1] - a[1])[0] || ["", 0];
    console.log("      " + row.id + ": most common kit " + worst[0] + " on " +
      worst[1] + " of " + sides.length);
    check(row.id + ": kit colours were actually harvested",
      worst[1] <= Math.max(4, sides.length * 0.6),
      worst[1] + " of " + sides.length + " sides in " + worst[0]);
  }
}

/* ---------- the elevens everybody can recite ----------
   Structure checks pass on an eleven with Lahm in goal, which is exactly what
   the 2014 harvest produced for a while. These are the sides the room would
   notice, typed off the match rather than off the deck. */
console.log("\n--- the finals, by name ---");
{
  const XI = {
    "wc1998/France":    ["Barthez", "Thuram", "Leboeuf", "Desailly", "Lizarazu", "Karembeu", "Deschamps", "Petit", "Zidane", "Djorkaeff", "Guivarc'h"],
    "wc1998/Brazil":    ["Taffarel", "Cafu", "Júnior Baiano", "Aldair", "Roberto Carlos", "César Sampaio", "Dunga", "Leonardo", "Rivaldo", "Bebeto", "Ronaldo"],
    "wc2002/Brazil":    ["Marcos", "Lúcio", "Edmílson", "Roque Júnior", "Cafu", "Roberto Carlos", "Gilberto Silva", "Kléberson", "Ronaldinho", "Rivaldo", "Ronaldo"],
    "wc2006/Italy":     ["Buffon", "Zambrotta", "Cannavaro", "Materazzi", "Grosso", "Camoranesi", "Pirlo", "Gattuso", "Perrotta", "Totti", "Toni"],
    "wc2010/Spain":     ["Casillas", "Ramos", "Piqué", "Puyol", "Capdevila", "Busquets", "Xabi Alonso", "Xavi", "Pedro", "Iniesta", "Villa"],
    "wc2014/Germany":   ["Neuer", "Lahm", "Boateng", "Hummels", "Höwedes", "Schweinsteiger", "Kramer", "Müller", "Özil", "Kroos", "Klose"],
    "wc2014/Argentina": ["Romero", "Zabaleta", "Demichelis", "Garay", "Rojo", "Mascherano", "Biglia", "Pérez", "Messi", "Higuaín", "Lavezzi"],
    "wc2018/France":    ["Lloris", "Pavard", "Varane", "Umtiti", "Hernandez", "Kanté", "Pogba", "Mbappé", "Griezmann", "Matuidi", "Giroud"],
    "wc2022/Argentina": ["Martínez", "Molina", "Romero", "Otamendi", "Tagliafico", "De Paul", "Fernández", "Mac Allister", "Messi", "Álvarez", "Di María"],
    "euro2004/Greece":   ["Nikopolidis", "Seitaridis", "Dellas", "Kapsis", "Fyssas", "Zagorakis", "Katsouranis", "Basinas", "Giannakopoulos", "Charisteas", "Vryzas"],
    "euro2004/Portugal": ["Ricardo", "Miguel", "Andrade", "Carvalho", "Valente", "Costinha", "Maniche", "Deco", "Figo", "Ronaldo", "Pauleta"],
    "euro2016/Portugal": ["Patrício", "Cédric", "Pepe", "Fonte", "Guerreiro", "Carvalho", "Sanches", "Mário", "Nani", "Ronaldo", "Silva"],
    "euro2020/Italy":    ["Donnarumma", "Emerson", "Bonucci", "Chiellini", "Di Lorenzo", "Jorginho", "Verratti", "Barella", "Insigne", "Immobile", "Chiesa"],
  };
  const norm = x => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  for (const [where, want] of Object.entries(XI)) {
    const [pool, sideName] = where.split("/");
    const p = path.join(REPO, "assets", pool, "index.json");
    if (!fs.existsSync(p)) { check(where + ": the pool is on disk", false, pool); continue; }
    const t = JSON.parse(fs.readFileSync(p, "utf8"))[sideName];
    if (!t) { check(where + ": the side is in the pool", false, sideName); continue; }
    const got = (t.xi || []).map(m => norm(m.n) + "|" + norm(m.full));
    const missing = want.filter(n => !got.some(g => g.indexOf(norm(n)) > -1));
    check(where + ": the eleven who played it", missing.length === 0, "missing " + missing.join(", "));
    /* AND THE KEEPER IS THE KEEPER, which is the failure this is really for */
    const gk = (t.xi || [])[0];
    check(where + ": " + want[0] + " is in goal",
      gk && norm(gk.n + gk.full).indexOf(norm(want[0])) > -1, gk && gk.n);
  }
}

console.log("\n--- service worker ---");
const sw = fs.readFileSync(path.join(REPO, "sw.js"), "utf8");
check("faces index is precached", sw.includes("assets/faces/index.json"));
check("the 221 face images are NOT precached", !/assets\/faces\/[a-z0-9-]+\.jpg/.test(sw),
      "a portrait is listed in the service worker, which would bloat the install");

/* The one check that would have caught the three weeks the app shipped with no
   cache at all. Two generated lists are spliced into this file by build tools,
   and one of them landed BELOW the array that spreads it. const is not hoisted,
   so every install from v111 to v123 threw a ReferenceError before registering
   and nothing was ever precached. Nothing in the app breaks visibly when the
   service worker dies, which is exactly why it went unnoticed: it just quietly
   stops working offline. So: actually run the file. */
{
  const sandbox = { self: { addEventListener() {} }, caches: {}, clients: {}, fetch: () => {} };
  let threw = null;
  try {
    vm.runInNewContext(sw, sandbox);
  } catch (e) { threw = e.message; }
  check("the service worker evaluates without throwing", threw === null, threw);

  /* THE LINE THAT USED TO BE HERE WAS THE DEFECT IT WAS MEANT TO CATCH, and it
     is worth writing down how rather than quietly deleting it, because the
     shape of the mistake is an easy one to make again. It read

       check("and it lists something to precache",
         Array.isArray(sandbox.EXTRA_ASSETS) ? sandbox.EXTRA_ASSETS.length > 20
           : "EXTRA_ASSETS did not survive evaluation", ...)

     and handed that sentence to check() as the condition. A non-empty string is
     truthy, so the branch that meant "I could not see the list at all" printed
     PASS. And it took that branch on every run it ever had: a top-level const in
     a vm script lives in the script's own lexical scope and never lands on the
     sandbox object, so sandbox.EXTRA_ASSETS was always undefined. The check
     counted nothing and asserted nothing for as long as it existed, in the one
     part of this file whose whole job is to notice that the service worker has
     quietly stopped working.

     So: ask the script for its own bindings, with an epilogue appended to the
     source, and measure everything below off the real arrays. The epilogue asks
     for three names and no more, on purpose. Every question underneath is a
     question about what ends up in ASSETS, which is the only list the install
     ever sees, so naming CLUB_DECKS or POOL_FILES here would tie this test to
     how sw.js happens to be assembled today and make it throw on the day
     somebody renames a part rather than breaks the whole. */
  const probe = { self: { addEventListener() {} }, caches: {}, clients: {}, fetch: () => {} };
  let got = null, probeThrew = null;
  try {
    vm.runInNewContext(sw + "\n;this.__SW = { ASSETS, EXTRA_ASSETS, CACHE };", probe);
    got = probe.__SW;
  } catch (e) { probeThrew = e.message; }
  check("the precache lists can be read back out of the evaluated file", probeThrew === null,
    probeThrew + "   <- ASSETS, EXTRA_ASSETS or CACHE is gone from sw.js, or was renamed");

  if (got) {
    check("EXTRA_ASSETS is a real array with something in it",
      Array.isArray(got.EXTRA_ASSETS) && got.EXTRA_ASSETS.length > 20,
      "EXTRA_ASSETS is " + (Array.isArray(got.EXTRA_ASSETS) ? got.EXTRA_ASSETS.length + " long" : typeof got.EXTRA_ASSETS));
    check("ASSETS is a real array and is the longer of the two",
      Array.isArray(got.ASSETS) && got.ASSETS.length > got.EXTRA_ASSETS.length,
      "ASSETS is " + (Array.isArray(got.ASSETS) ? got.ASSETS.length + " long" : typeof got.ASSETS));

    const unique = [...new Set(got.ASSETS)].filter(p => p !== "./");
    let bytes = 0;

    /* addAll IS ALL OR NOTHING. One entry that 404s and the whole install
       rejects, the cache is never written, and nothing on screen says a word:
       the app simply stops working offline and keeps looking fine online. This
       is the check that would say so, and it is cheap, so it opens all of them
       rather than sampling. */
    const gone = unique.filter(p => { const f = path.join(REPO, p);
      if (!fs.existsSync(f)) return true; bytes += fs.statSync(f).size; return false; });
    check("every precached path is on disk, because addAll is all or nothing",
      gone.length === 0, gone.length + " missing, e.g. " + gone.slice(0, 3).join(", "));
    console.log("      " + got.ASSETS.length + " entries, " + unique.length + " unique files, " +
      (bytes / 1048576).toFixed(2) + "MB, cache " + got.CACHE);

    /* AND THE SAME FILE IS ONLY ASKED FOR ONCE. Seven lists written by four
       tools go into ASSETS and several of them legitimately name the same
       crest, so the install de-duplicates rather than making every list know
       what the other six hold. That is one expression in one place and it would
       be an easy thing to lose in a tidy-up, so it is asserted rather than
       trusted. */
    check("the install de-duplicates the list before handing it to addAll",
      /addAll\(\s*\[\s*\.\.\.new Set\(ASSETS\)\s*\]\s*\)/.test(sw),
      "sw.js hands ASSETS to addAll as it stands, repeats and all");

    /* EVERY POOL IN THE REGISTRY IS IN THE INSTALL. Thirteen of the twenty-two
       were not: the menu offered them on a phone with no signal and tapping one
       did nothing, because only the six club pools and three hand-typed entries
       were ever precached. This does not care WHICH list supplies the path,
       only that ASSETS ends up holding it, so the hand-typed entries in
       EXTRA_ASSETS and the generated POOL_FILES both satisfy it and neither is
       load-bearing on its own. It goes red on the day somebody adds a pool to
       index.html and does not run node _tools/sw-clubs.js, which is the day it
       is for. */
    const inAssets = new Set(got.ASSETS);
    /* the registry again, parsed the way the squad-pool section above parses
       it. Re-read rather than shared, because that one lives inside its own
       block and reaching across two hundred lines for a variable is how a test
       grows a dependency nobody can see. */
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    const reg = [...html.slice(html.indexOf("const POOLS = {"), html.indexOf("const QUIZZES = {")).matchAll(
      /^\s*"?([a-z0-9-]+)"?:\s*\{[\s\S]*?file:\s*"([^"]+)"[\s\S]*?flags:\s*(null|"[^"]*")[\s\S]*?ext:\s*"([^"]*)"/gm)]
      .map(m => ({ id: m[1], file: m[2], flags: m[3] === "null" ? null : m[3].slice(1, -1), ext: m[4] }));
    check("the pool registry parses for the service worker check too", reg.length >= 3, reg.length + " pools found");
    const notCached = reg.filter(r => !inAssets.has(r.file));
    check("every pool the app declares is precached", notCached.length === 0,
      notCached.length + " not in ASSETS: " + notCached.map(r => r.id).join(", ") +
      "   (run node _tools/sw-clubs.js)");

    /* AND SO IS EVERY CUP YEAR, which is a separate list in index.html and not
       a pool: the Cup mode fetches assets/cup/<year>.json and those used to be
       typed into EXTRA_ASSETS one line each. */
    const cup = (() => { const m = /const CUP_YEARS = \[([^\]]*)\]/.exec(html);
      return m ? [...m[1].matchAll(/"(\d{4})"/g)].map(x => x[1]) : []; })();
    const coldCup = cup.filter(y => !inAssets.has("assets/cup/" + y + ".json"));
    check("every cup year the app declares is precached", cup.length > 0 && coldCup.length === 0,
      cup.length ? coldCup.join(", ") + " not in ASSETS" : "CUP_YEARS did not parse out of index.html");

    /* AND THE BADGES THOSE POOLS DRAW. A pool file in the cache whose picker
       paints a screen of grey boxes is half the job, and it is the half nobody
       notices until the wifi goes. Only the badges a side actually names: a
       side with no flag gets a kit-coloured swatch by design, and the whole of
       assets/natflags is a separate decision from this one. */
    const badges = new Set();
    for (const r of reg) {
      if (!r.flags || !inAssets.has(r.file)) continue;
      const p = path.join(REPO, r.file);
      if (!fs.existsSync(p)) continue;
      for (const t of Object.values(JSON.parse(fs.readFileSync(p, "utf8"))))
        if (t && t.flag) badges.add(r.flags + t.flag + r.ext);
    }
    const coldBadges = [...badges].filter(b => !inAssets.has(b));
    check("every badge a precached pool names is precached too", coldBadges.length === 0,
      coldBadges.length + " of " + badges.size + " cold, e.g. " + coldBadges.slice(0, 3).join(", "));

    /* A LIST DECLARED AND NEVER SPREAD IS NOT A PRECACHE, it is a comment that
       looks like one. sw.js carries two of them: NATFLAGS, 156 national flag
       codes, and MANAGER_LOGOS, 291 crests written with a comment saying they
       exist so the dugout deck survives the pub wifi, and neither is in ASSETS.
       Only nine MANAGER_LOGOS slugs are cached at all and those nine are there
       by accident, because CAREER_LOGOS happens to name the same crest.

       This asserts the set is EXACTLY those two, which fails in both directions
       on purpose. A new dead list fails it, which is the bug this is here for.
       Reviving NATFLAGS or MANAGER_LOGOS also fails it, which is right: that is
       a decision about install weight with a measured price on it, and it
       should be taken by a person deleting a name from this line rather than
       arrived at by a tool. The prices, counted off disk against the install as
       it stands with the pool badges in it: NATFLAGS is 156 codes of which 84
       are not cached any other way, so 60KB; MANAGER_LOGOS is 291 crests of
       which 282 are not, so 4.07MB, a quarter again on a 17.4MB install. */
    const DEAD_ON_PURPOSE = ["MANAGER_LOGOS", "NATFLAGS"];
    const declared = [...sw.matchAll(/^const ([A-Z][A-Z_0-9]*) = (.*)$/gm)]
      .filter(m => /^\[/.test(m[2]) || /\.split\(/.test(m[2]))   // list-shaped, so CACHE is not a candidate
      .map(m => m[1]);
    const dead = declared.filter(n => n !== "ASSETS" && !sw.includes("..." + n)).sort();
    check("the only lists sw.js declares and never uses are the two known ones",
      dead.join(",") === DEAD_ON_PURPOSE.join(","),
      "dead now: [" + dead.join(", ") + "], recorded: [" + DEAD_ON_PURPOSE.join(", ") + "]");
  }
}

console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
process.exit(fails ? 1 : 0);
