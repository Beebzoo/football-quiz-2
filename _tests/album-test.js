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


  /* ================= HOW LUCKY THE DRAW IS ALLOWED TO BE =================
     ALBUM_LUCK is a claim about a number, so it is measured rather than
     reasoned about. A book is filled to order, four hundred packs are opened
     against it, and the new men out of every three are counted. The bands are
     wide because it is a draw and has to stay one; what they catch is the ramp
     being switched off, and the ceiling coming off. */
  console.log("\n--- the draw goes weighted past halfway ---");
  const rate = own => ev(app, '(() => { ' +
    'localStorage.removeItem("ball2-mine"); MINE = null; ' +
    'const b = albumBookState("wc2006"), all = []; ' +
    'for(const s of albumSides("wc2006")) for(const m of albumMen("wc2006", s)) all.push(albumId("wc2006", s, m)); ' +
    'for(let i = 0; i < ' + own + '; i++) b.have[all[i]] = 1; ' +
    'const snap = JSON.stringify(b.have); let neu = 0, tot = 0; ' +
    'for(let k = 0; k < 400; k++){ b.have = JSON.parse(snap); mine().album.packs = 1; albumOpen(); ' +
    '  for(const g of mine().album.last){ tot++; if(g.isNew) neu++; } } ' +
    'return neu / tot; })()');
  const pcOf = v => Math.round(v * 1000) / 10 + "%";
  const r25 = rate(184), r50 = rate(368), r95 = rate(699), r99 = rate(729);
  /* BELOW THE TURN NOTHING HAS CHANGED, which is half the design. A quarter of
     the way into a book, three quarters of what you pull is new all on its own
     and there is nothing there worth helping. */
  check("a quarter in, the draw is still flat", Math.abs(r25 - .75) < .085, pcOf(r25));
  check("and at the turn itself it is still flat", Math.abs(r50 - .50) < .075, pcOf(r50));
  /* AND PAST IT THE BOOK HELPS, WITHIN THE CEILING. Flat would be five per cent
     at 699 of 736. A delivery would be most of the packet. Three times as
     likely is neither of those, which is the whole of ALBUM_LUCK. */
  check("at ninety-five per cent it is lifted well clear of flat", r95 > .08 && r95 < .20, pcOf(r95));
  check("and lifted, not handed over", r95 < .5, pcOf(r95));
  /* THE DRAW DELIBERATELY DOES NOT FINISH THE BOOK. The last handful is what
     the swap screen is for, so at seven gaps left a pack is still mostly
     doubles and the ceiling is doing its job. */
  check("but the last few are still a long shot", r99 < .09, pcOf(r99));
  check("and the ramp is monotone, so nothing steps backwards",
    r25 - r50 > 0 && r50 > r95 && r95 > r99, [r25, r50, r95, r99].map(pcOf).join(" "));
  /* AND THE RAMP IS THE ARITHMETIC IN THE COMMENT, checked directly rather than
     inferred off four hundred packs. */
  check("the weight is one at the turn and ALBUM_LUCK at a full book",
    ev(app, "ALBUM_TURN") === .5 && ev(app, "ALBUM_LUCK") === 3, ev(app, "ALBUM_TURN + '/' + ALBUM_LUCK"));

  /* ================= AND A PACKET NEVER REPEATS ITSELF ================= */
  console.log("\n--- and a packet never repeats itself ---");
  clean();
  /* THE DETERMINISTIC VERSION. With the coin pinned, three independent draws
     returned the same man three times over, every time. Under ALBUM_PACK_SAME
     the second and third draws see him at weight nought and have to move on, so
     a frozen coin still comes back with three different men. */
  const frozen = ev(app, '(() => { const R0 = Math.random; Math.random = () => 0; ' +
    'try { mine().album.packs = 1; albumOpen(); return mine().album.last.map(g => g.id); } ' +
    'finally { Math.random = R0; } })()');
  check("three draws off a frozen coin are three different men",
    new Set(frozen).size === 3, frozen.join(", "));
  clean();
  const twice = ev(app, '(() => { let w = 0; for(let k = 0; k < 300; k++){ mine().album.packs = 1; albumOpen(); ' +
    'const g = mine().album.last; w = Math.max(w, g.length - new Set(g.map(x => x.id)).size); } return w; })()');
  check("and three hundred packets later it has still never happened", twice === 0, twice);
  /* AND NOTHING WITHOUT A SLOT EVER COMES OUT, which used to be true by luck
     and is now true by construction, because the pool is filtered before the
     first weight is worked out. */
  clean();
  const ghosts = ev(app, '(() => { let n = 0; for(let k = 0; k < 200; k++){ mine().album.packs = 1; albumOpen(); ' +
    'for(const g of mine().album.last) if(!g.id || !albumParse(g.id) || !albumHas(g.id)) n++; } return n; })()');
  check("and every sticker drawn has a slot to go in", ghosts === 0, ghosts);
  check("and a pack is still three", ev(app, '(() => { mine().album.packs = 1; albumOpen(); ' +
    'return mine().album.last.length; })()') === 3, "short pack on a full book");

  /* ================= FINISHING A BOOK PAYS ================= */
  console.log("\n--- finishing the book pays, and says so on the shelf ---");
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"); ' +
    'for(const s of albumSides("wc2006")) for(const m of albumMen("wc2006", s)) b.have[albumId("wc2006", s, m)] = 1; ' +
    'mine().album.packs = 0; mineSave(); ' +
    'for(const s of albumSides("wc2006").slice(0, 31)) albumCheckPage("wc2006", s); mineSave(); })();');
  check("thirty-one pages is not a book", ev(app, 'albumBookIsDone("wc2006")') === false, "latched early");
  check("and pays nothing yet", ev(app, "mine().album.packs") === 0, ev(app, "mine().album.packs"));
  run(app, 'albumCheckPage("wc2006", albumSides("wc2006")[31]); mineSave();'); await tick(120);
  check("the thirty-second page closes it", ev(app, 'albumBookIsDone("wc2006")') === true, "not latched");
  check("and twelve packs land for the next one",
    ev(app, "mine().album.packs") === ev(app, "ALBUM_BOOK_PACKS") && ev(app, "ALBUM_BOOK_PACKS") === 12,
    ev(app, "mine().album.packs"));
  check("in the drawer, not only on the screen",
    ev(app, 'JSON.parse(localStorage.getItem("ball2-mine")).album.packs') === 12,
    ev(app, 'JSON.parse(localStorage.getItem("ball2-mine")).album.packs'));
  /* THE LATCH IS THE ONLY THING STOPPING A SECOND PAYOUT, so it is worth two
     lines to prove that it holds against both doors into it. */
  run(app, 'albumCheckBook("wc2006"); for(const s of albumSides("wc2006")) albumCheckPage("wc2006", s);');
  await tick(90);
  check("and it cannot be collected twice", ev(app, "mine().album.packs") === 12,
    ev(app, "mine().album.packs"));
  /* THE COVER. The shelf draws nothing at all until a second book has landed,
     which is why Euro 2008 turns up here and nowhere else in this file. */
  run(app, "TEAMS.euro2008 = " + JSON.stringify(R("assets/euro2008/index.json")) + ";");
  run(app, 'openAlbum("wc2006"); render();'); await tick(150);
  check("the finished cover is plated on the shelf", /class="alcov[^"]*plate/.test(stage(app)),
    (stage(app).match(/class="alcov[^"]*"/g) || []).join(" | ").slice(0, 160));
  check("and exactly one of them is, not the whole shelf",
    (stage(app).match(/class="alcov[^"]*plate/g) || []).length === 1,
    (stage(app).match(/class="alcov[^"]*plate/g) || []).length);
  check("the man on the front has become the cup", /class="alcov-c"/.test(stage(app)), "still a player");
  /* AND IT WEARS BOTH SENTENCES AT ONCE. Finishing the book your packs come
     from must not cost you the gold spine that says so, which is what the
     .alcov.plate.coll rule exists for. */
  check("and it is still the book you are collecting", /class="alcov[^"]*coll plate/.test(stage(app)),
    "the spine and the plate cannot co-exist");
  /* THE RIBBON STAYS, because it says a true thing in words and the plate says
     a different thing in gold. */
  check("with the Complete ribbon still on it", /class="alcov-r"/.test(stage(app)), "ribbon gone");

  /* ================= AND THE PRIZE IS ADVERTISED BEFOREHAND ================= */
  console.log("\n--- and the book screen says what finishing it is worth ---");
  clean();
  run(app, 'openAlbum("wc2006"); render();'); await tick(140);
  check("an empty drawer is told about the twelve", /12 more packs land/.test(stage(app)), "no prize line");
  /* THE ONE PLAYER WHO MUST NOT BE THE ONLY ONE MISSING IT is the one with
     packs waiting, which is exactly who the sentence used to be hidden from. */
  run(app, "mine().album.packs = 4; mineSave(); render();"); await tick(140);
  check("and so is somebody with packs waiting", /12 more packs land/.test(stage(app)),
    "the prize line hides behind the Open a pack button");
  check("and the Open a pack button is still there", /Open a pack/.test(stage(app)), "button gone");

  /* ================= THE SLOT THAT LIGHTS UP ================= */
  console.log("\n--- the one you just got is lit, and the one that closed a page is lit louder ---");
  clean();
  /* ONE MAN SHORT OF ITALY, bought with doubles, because that is the only way
     to make a page close on demand without opening four hundred packets. */
  run(app, '(() => { const b = albumBookState("wc2006"), men = albumMen("wc2006", "Italy"); ' +
    'for(let i = 0; i < men.length - 1; i++) b.have[albumId("wc2006", "Italy", men[i])] = 3; ' +
    'ALBUM_VIEW = {book: "wc2006", side: "Italy"}; ' +
    'albumSwap(albumId("wc2006", "Italy", men[men.length - 1])); })();'); await tick(150);
  check("the man who closed the page is marked as having closed it",
    /class="alst[^"]* shut"/.test(stage(app)), "no closer");
  check("and the page went foil underneath him",
    ev(app, 'albumFoil("wc2006", "Italy")') === true, "no foil");
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"), men = albumMen("wc2006", "Italy"); ' +
    'for(let i = 0; i < 6; i++) b.have[albumId("wc2006", "Italy", men[i])] = 3; ' +
    'ALBUM_VIEW = {book: "wc2006", side: "Italy"}; ' +
    'albumSwap(albumId("wc2006", "Italy", men[10])); })();'); await tick(150);
  check("an ordinary one you needed is marked too, and differently",
    /class="alst[^"]* fresh"/.test(stage(app)) && !/ shut"/.test(stage(app)), "wrong grade");
  check("and only one slot on the page is lit",
    (stage(app).match(/ fresh"| shut"/g) || []).length === 1,
    (stage(app).match(/ fresh"| shut"/g) || []).length);
  /* NEWS IS NEWS ONCE, so walking away and coming back must not announce it a
     second time. */
  run(app, 'openAlbum("wc2006", "Italy"); render();'); await tick(140);
  check("and walking away puts it out", !/ fresh"| shut"/.test(stage(app)), "still lit");
  /* AND NOBODY ELSE ON THE PAGE LIGHTS UP WITH HIM. lit is null on an ordinary
     render and albumId is null for a man the harvest left without a number, so
     a bare === would light every numberless slot at once. */
  check("and an ordinary render lights nothing at all",
    (stage(app).match(/alst[^"]*fresh|alst[^"]*shut/g) || []).length === 0,
    (stage(app).match(/class="alst[^"]*"/g) || []).slice(0, 4).join(" | "));
  /* A DOUBLE IS NEVER CREDITED WITH CLOSING A PAGE, even though the check that
     latches the foil has to run on every sticker that lands. */
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"); ' +
    'for(const m of albumMen("wc2006", "Italy")) b.have[albumId("wc2006", "Italy", m)] = 2; ' +
    'mine().album.packs = 60; mineSave(); albumSetBook("wc2006"); })();');
  run(app, '(() => { globalThis.__dupeshut = 0; for(let k = 0; k < 60; k++){ albumOpen(); ' +
    'for(const g of mine().album.last) if(g.shut && !g.isNew) __dupeshut++; } })();'); await tick(130);
  check("a page sitting complete and unfoiled still latches off a double",
    ev(app, 'albumFoil("wc2006", "Italy")') === true, "the page never foiled");
  check("but the double is never given the star", ev(app, "__dupeshut") === 0, ev(app, "__dupeshut"));

  /* ================= AND YOU CHOOSE WHICH THREE GO ================= */
  console.log("\n--- and you choose which three doubles go ---");
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"), men = albumMen("wc2006", "Italy"); ' +
    'b.have[albumId("wc2006","Italy",men[0])] = 4; b.have[albumId("wc2006","Italy",men[1])] = 2; ' +
    'b.have[albumId("wc2006","Italy",men[2])] = 3; b.have[albumId("wc2006","Italy",men[3])] = 2; ' +
    'mineSave(); openAlbum("wc2006", "Italy"); })();'); await tick(150);
  const mark = ev(app, 'albumId("wc2006", "Italy", albumMen("wc2006","Italy")[9])');
  check("a gap is offered once you have three doubles", stage(app).indexOf("albumSwapTo(") > -1, "not offered");
  /* AND THE PAGE NO LONGER CHARGES FOR THE TAP, because the tap is now free and
     a screen that says otherwise is the one sentence this whole change exists
     to stop being true. */
  check("and the page says the tap picks rather than pays",
    /Tap a gap and pick which three doubles go\./.test(stage(app)), "still the old promise");
  run(app, 'albumSwapTo(' + JSON.stringify(mark) + ');'); await tick(150);
  check("tapping it opens the chooser rather than spending them",
    /alswant/.test(stage(app)) && /Three for one/.test(stage(app)), "swapped on the spot");
  check("and not one double has gone", ev(app, 'albumDupes("wc2006").length') === 4,
    ev(app, 'albumDupes("wc2006").length'));
  check("with the whole pile on the screen",
    (stage(app).match(/albumSwapPick\(/g) || []).length === 4,
    (stage(app).match(/albumSwapPick\(/g) || []).length);
  /* DEEPEST FIRST is what makes the screen usable on a full book: the three you
     can most afford are the first three under your thumb. */
  check("deepest stack first",
    ev(app, 'albumPile("wc2006").map(id => albumBookRead("wc2006").have[id]).join(",")') === "4,3,2,2",
    ev(app, 'albumPile("wc2006").map(id => albumBookRead("wc2006").have[id]).join(",")'));
  /* AND THE SORT IS LEGIBLE, because a rule the player has to take on trust is
     not a rule, it is a rumour. */
  check("and each card says how deep its stack is",
    (stage(app).match(/class="alsx">(\d+) copies/g) || []).join(" ") ===
      'class="alsx">4 copies class="alsx">3 copies class="alsx">2 copies class="alsx">2 copies',
    (stage(app).match(/class="alsx">\d+ copies/g) || []).join(" "));
  check("and nothing can be confirmed at nought", !/albumSwapDo/.test(stage(app)), "confirm offered early");
  check("and the line asks for three", /Pick any three of your doubles and he is yours\./.test(stage(app)),
    "wrong opening line");
  const pile = ev(app, 'albumPile("wc2006")');
  const tap = i => run(app, 'albumSwapPick(' + JSON.stringify(pile[i]) + ');');
  tap(3); await tick(120);
  check("one chosen card lights up", (stage(app).match(/alsgo/g) || []).length === 1,
    (stage(app).match(/alsgo/g) || []).length);
  check("and the line counts down rather than reporting a total",
    /Pick two more and he is yours\./.test(stage(app)), "no escalation");
  tap(3); await tick(120);
  check("and tapping it again puts it back", !/alsgo/.test(stage(app)), "still chosen");
  tap(3); tap(2); await tick(120);
  check("two picked, and it says so in English", /One more and he is yours\./.test(stage(app)),
    "wrong line at two");
  tap(1); await tick(140);
  check("three chosen offers the trade", /albumSwapDo/.test(stage(app)), "no way to confirm");
  check("and the line stops asking", /Tap one again if you want him back\./.test(stage(app)),
    "still asking for more");
  /* A BUTTON THAT STOPS ANSWERING IS A BUTTON SOMEBODY DECIDES IS BROKEN, so a
     fourth tap pushes the oldest choice out instead of doing nothing. */
  tap(0); await tick(120);
  check("a fourth tap pushes the first choice out rather than doing nothing",
    ev(app, 'JSON.stringify(ALBUM_VIEW.swap.give)') === JSON.stringify([pile[2], pile[1], pile[0]]),
    ev(app, 'JSON.stringify(ALBUM_VIEW.swap.give)'));
  run(app, "albumSwapDo();"); await tick(150);
  check("the man is yours", ev(app, "albumHas(" + JSON.stringify(mark) + ")") === true, "not stuck in");
  /* AND IT TOOK THE THREE THAT WERE PICKED, not the three at the front of the
     pile, which is the only reason the screen was built. */
  check("and the three that went are the three that were picked",
    ev(app, 'JSON.stringify(' + JSON.stringify(pile) + '.map(id => albumBookRead("wc2006").have[id] || 0))') ===
      JSON.stringify([3, 2, 1, 2]),
    ev(app, 'JSON.stringify(' + JSON.stringify(pile) + '.map(id => albumBookRead("wc2006").have[id] || 0))'));
  check("and it lands back on the page with him lit",
    /class="alst[^"]* fresh"/.test(stage(app)) && !/alswant/.test(stage(app)), "wrong screen");
  /* AND THE OLD DOOR STILL WORKS. album-test drives albumSwap with one argument
     further up this file, and anything else in the app that turns up to trade
     with no opinion about which spares to give should still get a fair trade
     rather than nothing at all. */
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"), men = albumMen("wc2006", "Italy"); ' +
    'for(let i = 0; i < 3; i++) b.have[albumId("wc2006","Italy",men[i])] = 2; ' +
    'ALBUM_VIEW = null; mineSave(); ' +
    'albumSwap(albumId("wc2006", "Italy", men[9])); })();'); await tick(140);
  check("called with no opinion it still pays from the top of the pile",
    ev(app, 'albumDupes("wc2006").length') === 0 &&
    ev(app, 'albumHas(albumId("wc2006", "Italy", albumMen("wc2006","Italy")[9]))') === true,
    ev(app, 'albumDupes("wc2006").length'));
  /* AND IT REFUSES A LIST IT CANNOT TRUST, because give comes off an inline
     onclick and that is as public as an interface gets. */
  clean();
  run(app, '(() => { const b = albumBookState("wc2006"), men = albumMen("wc2006", "Italy"); ' +
    'for(let i = 0; i < 4; i++) b.have[albumId("wc2006","Italy",men[i])] = 2; ' +
    'ALBUM_VIEW = null; mineSave(); ' +
    'const one = albumId("wc2006","Italy",men[0]); ' +
    'albumSwap(albumId("wc2006", "Italy", men[9]), [one, one, one]); })();'); await tick(140);
  check("the same double named three times does not count as three men",
    ev(app, 'albumBookRead("wc2006").have[albumId("wc2006","Italy",albumMen("wc2006","Italy")[0])]') !== undefined &&
    ev(app, 'albumDupes("wc2006").length') === 1,
    ev(app, 'albumDupes("wc2006").length') + " doubles left");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
