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
  check("and it lists something to precache",
    Array.isArray(sandbox.EXTRA_ASSETS) ? sandbox.EXTRA_ASSETS.length > 20 : "EXTRA_ASSETS did not survive evaluation",
    sandbox.EXTRA_ASSETS && sandbox.EXTRA_ASSETS.length);
}

console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
process.exit(fails ? 1 : 0);
