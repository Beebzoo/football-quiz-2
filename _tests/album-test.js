/* THE ALBUM.
 *
 *     node _tests/album-test.js
 *
 * Not cards in the abstract: the 2006 World Cup sticker album, 736 men who are
 * already in the deck, drawn rather than fetched. It needs no new data and no
 * new images, which means the only things that can go wrong are the rules.
 *
 * Three of them matter and all three are here:
 *
 *   A STICKER IS A SLUG AND A SHIRT NUMBER. Not a name, because names change
 *   spelling between harvests, and not an index, because indexes move. Every
 *   id has to be unique and every one has to resolve to a man.
 *
 *   A PACK IS THREE, and it can never hand out something that is not in the
 *   album, because an album with a sticker in it that has no slot is an album
 *   nobody can finish.
 *
 *   AND FINISHING A PAGE HAS TO PAY. The bench in The Dugout is the reward,
 *   which means an unfinished page is a real cost: eleven men and nobody to
 *   bring on.
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

(async () => {
  const app = makeInstance("album");
  await tick(340);
  const wc = R("assets/wc2006/index.json");
  run(app, "TEAMS.wc2006 = " + JSON.stringify(wc) + ";");
  const clean = () => run(app, 'localStorage.removeItem("ball2-mine"); MINE = null;');

  console.log("--- 736 men, and every one of them has a slot ---");
  const c = ev(app, 'albumCount("wc2006")');
  check("the album is the whole squad list", c.all === 736, c.all);
  check("and none of it is stuck in yet", c.have === 0, c.have);
  /* EVERY ID UNIQUE. A slug and a shirt number collide only if a squad has two
     men in the same shirt, which would be a harvest bug wearing an album bug's
     clothes. */
  const ids = ev(app, '(() => { const out = []; for(const s of albumSides("wc2006")) ' +
    'for(const m of albumMen("wc2006", s)) out.push(albumId("wc2006", s, m)); return out; })()');
  check("every sticker has an id", ids.every(x => typeof x === "string" && x.indexOf("/") > 0),
    ids.filter(x => !x || x.indexOf("/") < 1).slice(0, 3).join(", "));
  check("and no two men share one", new Set(ids).size === ids.length,
    ids.length - new Set(ids).size + " collisions");
  /* AND THE BOOK IS ON THE FRONT OF EVERY ONE OF THEM, which is the whole of
     this stage: italy/10 is Totti in 2006 and somebody else at Euro 2020, and
     the two have to be able to sit in one save. */
  check("and every id says which book it came out of",
    ids.every(x => x.indexOf("wc2006:") === 0), ids.filter(x => x.indexOf("wc2006:")).slice(0, 3).join(", "));
  check("and it parses back to the man", ev(app, 'JSON.stringify(albumParse(' +
    JSON.stringify(ids[0]) + '))') === JSON.stringify({book: "wc2006",
      slug: ids[0].split(":")[1].split("/")[0], no: ids[0].split("/")[1], tag: "", id: ids[0]}),
    ev(app, 'JSON.stringify(albumParse(' + JSON.stringify(ids[0]) + '))'));

  console.log("\n--- a pack is three, and always from the album ---");
  clean();
  run(app, "mine().album.packs = 1; albumOpen();"); await tick(130);
  const have = ev(app, 'albumBookState("wc2006").have');
  const total = Object.values(have).reduce((a, b) => a + b, 0);
  check("three stickers", total === 3, total);
  check("and every one of them is in the album",
    Object.keys(have).every(id => ids.indexOf(id) > -1), Object.keys(have).join(", "));
  check("the pack was spent", ev(app, "mine().album.packs") === 0, ev(app, "mine().album.packs"));
  run(app, "albumOpen();"); await tick(120);
  check("and you cannot open one you do not have",
    Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0) === 3,
    Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0));

  console.log("\n--- doubles, and what they are for ---");
  clean();
  /* three doubles and one gap, which is the oldest trade in the playground */
  run(app, '(() => { const b = albumBookState("wc2006"), s = albumSides("wc2006")[0]; ' +
    'const men = albumMen("wc2006", s); ' +
    'for(let i = 0; i < 3; i++) b.have[albumId("wc2006", s, men[i])] = 2; mineSave(); })();');
  const want = ev(app, '(() => { const s = albumSides("wc2006")[0]; ' +
    'return albumId("wc2006", s, albumMen("wc2006", s)[7]); })()');
  check("three doubles", ev(app, 'albumDupes("wc2006").length') === 3, ev(app, 'albumDupes("wc2006").length'));
  check("and he is missing", ev(app, "albumHas(" + JSON.stringify(want) + ")") === false, "already there");
  run(app, "albumSwap(" + JSON.stringify(want) + ");"); await tick(120);
  check("swapping gets him", ev(app, "albumHas(" + JSON.stringify(want) + ")") === true, "not stuck in");
  check("and costs exactly three", ev(app, 'albumDupes("wc2006").length') === 0, ev(app, 'albumDupes("wc2006").length'));
  check("leaving the three still in the album",
    Object.keys(ev(app, 'albumBookState("wc2006").have')).length === 4,
    Object.keys(ev(app, 'albumBookState("wc2006").have')).length);
  /* AND IT REFUSES rather than quietly taking three for nothing */
  const dup2 = ev(app, '(() => { const s = albumSides("wc2006")[0]; ' +
    'return albumId("wc2006", s, albumMen("wc2006", s)[0]); })()');
  run(app, "albumSwap(" + JSON.stringify(dup2) + ");"); await tick(110);
  check("you cannot swap for a man you already have",
    Object.keys(ev(app, 'albumBookState("wc2006").have')).length === 4,
    Object.keys(ev(app, 'albumBookState("wc2006").have')).length);

  console.log("\n--- finishing a page pays, and that is the whole point ---");
  clean();
  run(app, 'S = freshState(["You","It"], false, "classic", 0, "manager", false); h2Start(); ' +
    'h2PickTeam("Italy"); h2PickTeam("Brazil"); S.h2h.tossed = true;');
  await tick(130);
  check("an unfinished page means no bench in The Dugout",
    ev(app, "h2Bench(0).length") === 0, ev(app, "h2Bench(0).length"));
  check("and no change can be made", ev(app, "h2CanSub(0, 5)") === false, ev(app, "h2CanSub(0, 5)"));
  run(app, '(() => { for(const m of albumMen("wc2006", "Italy")) ' +
    'albumStick(albumId("wc2006", "Italy", m)); mineSave(); })();');
  check("the page is complete", ev(app, 'albumDone("wc2006", "Italy")') === true, "not complete");
  run(app, 'albumCheckPage("wc2006", "Italy");'); await tick(110);
  check("which makes it a foil", ev(app, 'albumFoil("wc2006", "Italy")') === true, "no foil");
  check("and their bench is yours", ev(app, "h2Bench(0).length") === 12, ev(app, "h2Bench(0).length"));
  /* THE OTHER SIDE IS UNAFFECTED, because a page is a country and not a game */
  check("the other side is still shut", ev(app, "h2Bench(1).length") === 0, ev(app, "h2Bench(1).length"));

  console.log("\n--- and One on One is left alone ---");
  /* THE FRIDAY NIGHT IS THE PRODUCT. Progression belongs in The Dugout; taking
     substitutions off a shared phone would be taking something away. */
  run(app, 'S = freshState(["A","B"], false, "classic", 0, "pitch", false); h2Start(); ' +
    'h2PickTeam("Brazil"); h2PickTeam("France"); S.h2h.tossed = true;');
  await tick(130);
  check("a bench with no album page at all", ev(app, "h2Bench(0).length") === 12,
    ev(app, "h2Bench(0).length"));

  console.log("\n--- packs come from playing ---");
  clean();
  run(app, 'S = freshState(["You","It"], false, "classic", 0, "pitch", false); h2Start();');
  await tick(120);
  run(app, 'h2PickTeam("Angola");'); await tick(130);
  check("three of a country the first time you play as them",
    Object.keys(ev(app, 'albumBookState("wc2006").have')).length === 3 ||
    Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0) === 3,
    JSON.stringify(ev(app, 'albumBookState("wc2006").have')));
  check("and they are all Angolans, out of the book that was on the pitch",
    Object.keys(ev(app, 'albumBookState("wc2006").have')).every(id => id.indexOf("wc2006:angola/") === 0),
    Object.keys(ev(app, 'albumBookState("wc2006").have')).join(", "));
  const was = Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0);
  run(app, 'S.h2h.teams = [null, null]; h2PickTeam("Angola");'); await tick(130);
  check("but only the first time",
    Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0) === was,
    Object.values(ev(app, 'albumBookState("wc2006").have')).reduce((a, b) => a + b, 0));

  console.log("\n--- the screens ---");
  clean();
  run(app, "mine().album.packs = 2; mineSave(); openAlbum(); render();"); await tick(150);
  check("the album opens in front of the menu", /The album/.test(stage(app)), "menu instead");
  check("with all thirty-two pages", (stage(app).match(/openAlbum\(/g) || []).length >= 32,
    (stage(app).match(/openAlbum\(/g) || []).length);
  run(app, 'openAlbum("wc2006", "Italy"); render();'); await tick(140);
  check("a page shows all twenty-three", (stage(app).match(/class="alst/g) || []).length === 23,
    (stage(app).match(/class="alst/g) || []).length);
  /* THE GAP IS THE FEELING. A missing man is drawn and emptied, never left
     out, because his number and his name still being there is the whole thing. */
  check("and the ones you do not have are still drawn",
    (stage(app).match(/alst empty/g) || []).length === 23,
    (stage(app).match(/alst empty/g) || []).length);
  check("with the name still in the gap", /Cannavaro/.test(stage(app)), "no names on the gaps");
  run(app, "closeAlbum(); render();"); await tick(130);
  check("and closing it goes back", !/alpages/.test(stage(app)), "still on the album");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
