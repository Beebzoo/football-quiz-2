/* THE PICKER IS LAID OUT AS THE TOURNAMENT WAS.
 *
 *     node _tests/groups-test.js
 *
 * Thirty-two flags in ABC order is a list. The same thirty-two in eight rows
 * of four is the tournament, and the whole thing hangs off one plain letter
 * stamped on every side of the fifteen tournament pool files. That letter is
 * harvested, which means it is exactly the kind of thing that goes quietly
 * wrong: a pool re-harvested without it does not crash, it just goes back to
 * the alphabet and nobody notices for a month.
 *
 * So this walks the files first and the screen second, and it checks the one
 * claim the album leans on as well: that the four sides of a group sit next to
 * each other in the file, because albumSides sorts on the letter alone and
 * trusts the file for the order inside a group.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const stage = ctx => ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "";
const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 130) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

/* Fifteen pools and the shape each one was drawn in. Written out rather than
   worked out from the side count, because "thirty-two sides so eight groups"
   is the assumption, and an assumption is not a test. */
const DRAWS = [
  {id: "wc1998", groups: 8},  {id: "wc2002", groups: 8},  {id: "wc2006", groups: 8},
  {id: "wc2010", groups: 8},  {id: "wc2014", groups: 8},  {id: "wc2018", groups: 8},
  {id: "wc2022", groups: 8},
  /* 2026 IS THE ODD ONE and the reason none of this reads the Cup: forty-eight
     sides, twelve groups, where cupGroupOf only ever looks through ABCDEFGH. */
  {id: "wc2026", groups: 12},
  {id: "euro2000", groups: 4}, {id: "euro2004", groups: 4},
  {id: "euro2008", groups: 4}, {id: "euro2012", groups: 4},
  /* twenty-four from 2016, six of four and the four best thirds go through */
  {id: "euro2016", groups: 6}, {id: "euro2020", groups: 6}, {id: "euro2024", groups: 6},
];
const LETTERS = "ABCDEFGHIJKL";

console.log("--- every tournament pool knows which group every side was in ---");
const books = {};
for (const d of DRAWS) {
  const book = books[d.id] = R("assets/" + d.id + "/index.json");
  const keys = Object.keys(book);
  const missing = keys.filter(k => !book[k].group);
  check(d.id + ": every side has a group", missing.length === 0, missing.slice(0, 5).join(", "));
  const want = LETTERS.slice(0, d.groups).split("");
  const got = [];
  for (const k of keys) if (got.indexOf(book[k].group) < 0) got.push(book[k].group);
  check(d.id + ": " + d.groups + " groups, A to " + want[want.length - 1],
    got.slice().sort().join("") === want.join(""), got.join("") || "none");
  const sizes = want.map(g => keys.filter(k => book[k].group === g).length);
  check(d.id + ": four sides in each of them",
    sizes.every(n => n === 4), want.map((g, i) => g + "=" + sizes[i]).join(" "));
}

/* THE ALBUM LEANS ON THIS ONE. albumSides sorts on the group letter and
   nothing else, trusting a stable sort to leave the four inside a group where
   the file put them, so if a file ever interleaves its groups the album's page
   order goes with it and the picker rows still look perfect. */
console.log("\n--- and lists them in blocks, which is what the album page order rides on ---");
for (const d of DRAWS) {
  const keys = Object.keys(books[d.id]);
  const blocks = keys.map(k => books[d.id][k].group).filter((g, i, a) => g !== a[i - 1]);
  check(d.id + ": the four of a group are together in the file",
    blocks.length === d.groups && blocks.join("") === LETTERS.slice(0, d.groups),
    blocks.join(""));
}

/* THE FALLBACK HAS TO STAY REACHABLE. If somebody ever stamps a group onto a
   league by accident the picker will start drawing rows for it, so this is
   here to say out loud that a league has no groups and is not supposed to. */
console.log("\n--- a league and the finals carry no group at all ---");
for (const rel of ["assets/eredivisie/clubs.json", "assets/finals/index.json"]) {
  const book = R(rel);
  check(rel + " has none", Object.values(book).every(t => !t.group),
    Object.entries(book).filter(([, t]) => t.group).map(([k]) => k).slice(0, 4).join(", "));
}

(async () => {
  const app = makeInstance("groups");
  await tick(340);

  /* THE CUP AND THE POOL MUST NOT DISAGREE. They are two copies of the same
     draw, and the day they drift the Cup sends you into a group whose sides
     are not the ones the picker showed you standing next to. Seven years have
     both, and this drives cupGroupOf itself rather than re-reading the JSON,
     because cupGroupOf is what the wall chart actually calls. */
  console.log("\n--- the pool's letter and the Cup's own draw are the same draw ---");
  for (const y of ["1998", "2002", "2006", "2010", "2014", "2018", "2022"]) {
    run(app, "CUPS[" + JSON.stringify(y) + "] = " + JSON.stringify(R("assets/cup/" + y + ".json")) + ";");
    run(app, "CUP_YEAR = " + JSON.stringify(y) + ";");
    const book = books["wc" + y];
    const bad = Object.keys(book).filter(k => ev(app, "cupGroupOf(" + JSON.stringify(k) + ")") !== book[k].group);
    check(y + ": all thirty-two agree", bad.length === 0,
      bad.slice(0, 4).map(k => k + " pool=" + book[k].group +
        " cup=" + ev(app, "cupGroupOf(" + JSON.stringify(k) + ")")).join("; "));
  }

  console.log("\n--- the picker draws one row per group ---");
  run(app, "TEAMS.wc2006 = " + JSON.stringify(books.wc2006) + ";");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); render();');
  await tick(180);
  const wc = stage(app);
  check("it is the team screen", ev(app, "S.phase") === "h_teams", ev(app, "S.phase"));
  check("eight rows, one per group",
    (wc.match(/class="cupgrp letter"/g) || []).length === 8,
    (wc.match(/class="cupgrp letter"/g) || []).length);
  check("labelled A to H in order",
    (wc.match(/<h3>([A-H])<\/h3>/g) || []).join("") === "<h3>A</h3><h3>B</h3><h3>C</h3>" +
      "<h3>D</h3><h3>E</h3><h3>F</h3><h3>G</h3><h3>H</h3>",
    (wc.match(/<h3>[^<]*<\/h3>/g) || []).join(""));
  check("and the flat alphabetical grid is gone", !/class="h2teams"/.test(wc), "still flat");
  /* THE SIDES ARE STILL ALL THERE. Rearranging a list is exactly the change
     that loses one off the end of it. */
  check("all thirty-two sides are still offered",
    (wc.match(/class="h2teambtn"/g) || []).length === 32,
    (wc.match(/class="h2teambtn"/g) || []).length);
  /* GROUP A OF 2006 IS GERMANY'S GROUP, and it is in the file's order rather
     than the finishing order, which is the order the squads page uses. */
  const rowA = wc.slice(wc.indexOf("<h3>A</h3>"), wc.indexOf("<h3>B</h3>"));
  check("Group A is the four who were in Group A",
    (rowA.match(/<span>([^<]+)<\/span>/g) || []).join("") ===
      "<span>Costa Rica</span><span>Ecuador</span><span>Germany</span><span>Poland</span>",
    (rowA.match(/<span>[^<]+<\/span>/g) || []).join(""));

  /* THE ONE THING A ROW MUST NOT SWALLOW. Your XI is not in anybody's group
     and it hangs above the grid, so it has to come before the first row in the
     markup and not inside one. */
  console.log("\n--- Your XI keeps its place above the rows ---");
  /* BUILT BY THE APP, not spelled out here: the ids carry a book now and a
     test that writes its own would be a second copy of that grammar. */
  const ids = ev(app, "albumMen('wc2006', 'Italy').slice(0, 11).map(m => albumId('wc2006', 'Italy', m))");
  run(app, "(() => { for(const id of " + JSON.stringify(ids) + ") albumStick(id); " +
    "mine().dream = {men: " + JSON.stringify(ids) + "}; DREAM_SIG = ''; })(); render();");
  await tick(180);
  const xi = stage(app);
  check("the eleven is ready", ev(app, "dreamReady()") === true, ev(app, "dreamOk()"));
  check("its button is drawn", /dreambtn/.test(xi), "no Your XI button");
  check("above the first group row, not inside one",
    xi.indexOf("dreambtn") < xi.indexOf('class="cupgrp'), "swallowed into a row");

  console.log("\n--- a league has no groups, so it stays as it was ---");
  run(app, "TEAMS['ere-clubs'] = " + JSON.stringify(R("assets/eredivisie/clubs.json")) + ";");
  run(app, 'S = freshState(["Martijn","Bram"], false, "ere", 0, "pitch", false); h2Start(); render();');
  await tick(180);
  const ere = stage(app);
  check("the pool is the Dutch clubs", ev(app, "h2PoolId()") === "ere-clubs", ev(app, "h2PoolId()"));
  check("it is the flat grid", /class="h2teams"/.test(ere), "grouped a league");
  check("with no group rows", !/class="cupgrp/.test(ere), "a league grew a group");
  check("and every club is on it",
    (ere.match(/class="h2teambtn"/g) || []).length === Object.keys(R("assets/eredivisie/clubs.json")).length,
    (ere.match(/class="h2teambtn"/g) || []).length);

  /* THE FORTY FINALS group off the slug alone, which is the one grouping in
     the app that needed no harvest at all. */
  console.log("\n--- the finals group by what was played for, and when ---");
  const finals = R("assets/finals/index.json");
  run(app, "TEAMS.finals = " + JSON.stringify(finals) + ";");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); h2SetPool("finals"); render();');
  await tick(180);
  const fin = stage(app);
  check("all forty are still offered",
    (fin.match(/class="h2teambtn"/g) || []).length === 40,
    (fin.match(/class="h2teambtn"/g) || []).length);
  const heads = (fin.match(/<h3>([^<]+)<\/h3>/g) || []).map(h => h.slice(4, -5));
  check("the competitions come in order, World Cup first and Copa America last",
    heads[0].indexOf("World Cup") === 0 && heads[heads.length - 1].indexOf("Copa") === 0,
    heads.join(" | "));
  check("a decade on every row that shares its competition",
    heads.filter(h => h.indexOf("World Cup") === 0).every(h => /\d{4}-\d\d$/.test(h)),
    heads.filter(h => h.indexOf("World Cup") === 0).join(" | "));
  /* ONE SIDE, ONE ROW, AND NO DECADE ON IT. "Copa America, 2020-29" over a
     single flag reads like a filing cabinet. */
  check("Copa America gets its own row and no decade",
    heads.filter(h => h.indexOf("Copa") === 0).length === 1 &&
    !/\d/.test(heads.filter(h => h.indexOf("Copa") === 0)[0]),
    heads.filter(h => h.indexOf("Copa") === 0).join(" | "));
  check("the European Cup and the Champions League are both named",
    heads.some(h => h.indexOf("European Cup") === 0) &&
    heads.some(h => h.indexOf("Champions League") === 0), heads.join(" | "));
  /* DATE ORDER INSIDE A ROW, which the file's own order is not: Netherlands
     2010 sits after Euro 2020 in the JSON, landed by a later harvest. */
  const wcRow = fin.slice(fin.indexOf("World Cup · 1970-79"), fin.indexOf("World Cup · 1980-89"));
  check("and a row runs in date order",
    (wcRow.match(/<span>([^<]+)<\/span>/g) || []).join("") ===
      "<span>Brazil 1970</span><span>Netherlands 1974</span><span>Argentina 1978</span>",
    (wcRow.match(/<span>[^<]+<\/span>/g) || []).join(""));
  /* THE KEY IS UNTOUCHED. The button shows "Brazil 1970" because the heading
     has already said the rest, but what it hands h2PickTeam is still the key
     the pool is filed under. */
  check("the button still picks by the pool's own key",
    fin.indexOf("h2PickTeam(&quot;Brazil · World Cup final 1970&quot;)") > -1,
    "the key was shortened too");

  console.log("\n--- the album's pages follow the groups, not the alphabet ---");
  const order = ev(app, "JSON.stringify(albumSides('wc2006'))");
  check("it is the file's own order, which is the tournament's",
    order === JSON.stringify(Object.keys(books.wc2006)), order);
  check("and not the alphabet",
    order !== JSON.stringify(Object.keys(books.wc2006).slice().sort()), "still alphabetical");
  /* A BOOK WITH NO GROUPS still has to open, because the album will not be one
     pool forever and a half-harvested second book must not blank the shelf. */
  const bare = JSON.parse(JSON.stringify(books.wc2006));
  for (const k of Object.keys(bare)) delete bare[k].group;
  run(app, "TEAMS.wc2006 = " + JSON.stringify(bare) + ";");
  check("a book with no groups falls back to the alphabet",
    ev(app, "JSON.stringify(albumSides('wc2006'))") === JSON.stringify(Object.keys(bare).slice().sort()),
    ev(app, "JSON.stringify(albumSides('wc2006').slice(0,3))"));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
