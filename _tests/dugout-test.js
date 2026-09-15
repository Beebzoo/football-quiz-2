/* The Dugout: the men carry the questions.
 *
 *     node _tests/dugout-test.js
 *
 * The rule is that a ball to a man draws a question from where he actually
 * played, so Italy 2006 is a Serie A quiz, the Netherlands is a mix of four
 * leagues, and a Costa Rican who never left home is the classic bank.
 *
 * Three things can go quietly wrong and all three are tested here. The mode
 * can leak into One on One, which would change a game that is supposed to be
 * frozen. The index can be read back out of the wrong deck, which does not
 * crash, it just answers a different question than the one it drew. And the
 * used lists can cross decks, because question 12 of Serie A is not question
 * 12 of the classic bank, and a shared list would start hiding questions
 * nobody has seen.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const stage = ctx => ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "";
const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

const GK = 0, LCB = 1, RCB = 2, LWB = 3, RWB = 4, SIX = 5, EIGHT = 6, TEN = 7, LW = 8, ST = 9, RW = 10;

(async () => {
  const app = makeInstance("dugout");
  await tick(340);
  run(app, "TEAMS.wc2006 = " + JSON.stringify(R("assets/wc2006/index.json")));
  for (const [id, dir] of [["seriea", "seriea"], ["laliga", "laliga"], ["premier", "premier"],
                           ["ere", "eredivisie"], ["bundesliga", "bundesliga"]])
    run(app, "DECKS[" + JSON.stringify(id) + "] = " + JSON.stringify(R("assets/" + dir + "/index.json")));

  const qd = () => ev(app, "S.qd");
  const qd2 = () => ev(app, "S.qd");
  const lg = (i, w) => ev(app, "h2Man(" + i + "," + w + ").lg") || null;
  /* WHICH SLOT IS HE IN. Never hardcode it: the shape decides, and so does
     the squad file, which changes when the harvest improves. */
  const slotOf = (name, w) => {
    for(let i = 0; i < 11; i++){
      const m = ev(app, "h2Man(" + i + "," + w + ")");
      if(m && (m.full || "").indexOf(name) > -1) return i;
    }
    return -1;
  };
  const start = (play, a, b) => run(app,
    'S = freshState(["Martijn","Bram"], false, "classic", 0, "' + play + '", false); h2Start(); ' +
    'h2PickTeam(' + JSON.stringify(a) + '); h2PickTeam(' + JSON.stringify(b) + '); ' +
    'S.h2h.tossed = true; S.h2h.subs=[0,0]; h2TackleOn = false;');
  const passTo = async (from, to) => {
    run(app, `S.h2h.who=0; S.h2h.at=${from}; S.h2h.sel=null; S.h2h.marks=[]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(${to}); h2Play();`);
    await tick();
  };

  /* ---------------------------------------------------------------- */
  console.log("--- the deck comes from the man ---");
  start("manager", "Italy", "Costa Rica");
  const CANNA = slotOf("Cannavaro", 0);
  check("Cannavaro is in the Italian eleven", CANNA > -1, CANNA);
  await passTo(SIX, CANNA);
  /* He played in two, and which one a given ball asks is a coin toss by
     design, so the test asks what the rule promises rather than pinning the
     toss: it has to be one of HIS. */
  check("a ball to Cannavaro draws one of his leagues",
    (lg(CANNA, 0) || []).includes(qd()), qd() + " / " + JSON.stringify(lg(CANNA, 0)));
  check("he has two to draw from", (lg(CANNA, 0) || []).length === 2, JSON.stringify(lg(CANNA, 0)));
  /* AND THE SAME FUNCTION FOR THE POSITIVE. Proving the label was somewhere on
     screen is satisfied by a question that happens to mention that league,
     whether or not the card named it, so this was passing for the wrong reason
     in precisely the runs where the negative one failed. */
  check("the card names whichever it was",
    ev(app, "h2League()").indexOf(ev(app, "QUIZZES[S.qd].label")) !== -1,
    "not named: " + qd() + " / " + ev(app, "h2League()"));
  check("and the question really came out of that deck",
    ev(app, "DECKS[S.qd][S.tier].indexOf(q()) !== -1") === true, "not in the " + qd() + " deck");

  /* a man with two leagues should use both across enough passes */
  start("manager", "Italy", "Costa Rica");
  /* ASK WHERE HE IS STANDING, which is what slotOf is for and what the note on
     it says. Italy in 2006 is recorded as a 4-5-1 and now starts in one, so
     slot 9 is the man off the front and Toni is the slot behind him. This was
     the only assertion in the file still reading a man out of a slot number
     that only meant him in the 4-2-3-1. */
  const TONI = slotOf("Toni", 0);
  check("Toni is in the Italian eleven", TONI > -1, TONI);
  const seen = {};
  for (let i = 0; i < 40; i++) { await passTo(SIX, TONI); seen[qd()] = (seen[qd()] || 0) + 1; run(app, "h2Next();"); }
  const toni = lg(TONI, 0) || [];
  check("Toni played in two leagues", toni.length === 2, JSON.stringify(toni));
  check("and forty balls to him used both", Object.keys(seen).length === 2, JSON.stringify(seen));
  check("and nothing but those two", Object.keys(seen).every(k => toni.includes(k)), JSON.stringify(seen));

  console.log("\n--- a man who never left home ---");
  start("manager", "Costa Rica", "Italy");
  await passTo(EIGHT, LCB);
  check("a Costa Rican defender has no leagues", lg(LCB, 0) === null, JSON.stringify(lg(LCB, 0)));
  check("so his ball is the classic bank", qd() === null, qd());
  /* ASK THE FUNCTION THAT NAMES IT, not the screen it is printed on. The
     question is on that screen too, and forty-two of the classic rows mention
     one of these three leagues in their own text, so this used to call a
     question about the Premier League a leak and did it about one ball in
     twenty-seven. h2League is what writes the deck onto the kick line and it
     has two call sites, both of them that line. */
  check("and the card names no league",
    !/Serie A|La Liga|Premier League/.test(ev(app, "h2League()")),
    "named: " + ev(app, "h2League()"));
  /* A MAN WHO DID GO ABROAD. Found by looking rather than named, because the
     deck carries real elevens now and the eleven that started Costa Rica's
     last match is not the one sorted by shirt number. */
  /* NOT THE MAN ON THE BALL. The passer is the eight, and a pass to yourself
     is not a pass: the moment the harvest moved a travelled Costa Rican into
     that slot, this quietly stopped testing anything. */
  const abroad = [...Array(11).keys()].find(i => i !== EIGHT && (lg(i, 0) || []).length);
  check("somebody in the Costa Rican eleven played abroad", abroad != null,
    [...Array(11).keys()].map(i => JSON.stringify(lg(i, 0))).join(" "));
  if(abroad != null){
    await passTo(EIGHT, abroad);
    /* NOT A NAMED LEAGUE. He may carry two and the draw shuffles them on
       purpose, so asserting which one comes out is asserting a coin toss. */
    check("and a ball to him draws one of HIS leagues, not the bank",
      qd() != null && (lg(abroad, 0) || []).indexOf(qd()) > -1,
      qd() + " / " + JSON.stringify(lg(abroad, 0)));
  }

  console.log("\n--- One on One is not touched ---");
  start("pitch", "Italy", "Costa Rica");
  await passTo(SIX, RCB);
  check("the same ball draws the quiz's own bank", qd() === null, qd());
  check("h2Tactical is false", ev(app, "h2Tactical()") === false, ev(app, "h2Tactical()"));
  check("and no league is named", !/ Serie A/.test(stage(app)), "a league was named");

  console.log("\n--- the contests read a career too ---");
  start("manager", "Italy", "Costa Rica");
  run(app, "h2TackleOn = true;");
  run(app, `S.h2h.who=0; S.h2h.at=${SIX}; S.h2h.marks=[${ST}]; S.h2h.markedAgainst=0; S.h2h.relief=true; S.phase="h_pick"; render(); h2Select(${ST}); h2Play();`);
  await tick(140);
  check("a tackle on a marked man is his league, not the tackler's",
    (lg(ST, 0) || []).includes(qd()), qd() + " / " + JSON.stringify(lg(ST, 0)));
  check("which is the defender reading the other XI", ev(app, "S.phase") === "h_tackle", ev(app, "S.phase"));
  run(app, "h2TackleOn = false;");

  start("manager", "Italy", "Netherlands");
  run(app, `S.h2h.who=0; S.h2h.at=${ST}; S.phase="h_pick"; render(); h2Shoot();`);
  await tick(150);
  check("the shot itself comes from the striker's own career",
    (lg(ST, 0) || []).includes(qd()) || qd() === null, qd() + " / his ST: " + JSON.stringify(lg(ST, 0)));
  const shotDeck = qd();
  run(app, "h2Reveal(); h2Judge(true);");
  await tick(150);
  /* AND THE SAVE AFTER IT COMES FROM NOWHERE, which is the one thing The
     Dugout loses to the corner duel and is worth saying out loud rather than
     letting a check quietly stop meaning anything. The keeper used to be asked
     something out of his own career, which was the mode at its best: Buffon
     being asked about Serie A to keep a shot out. There is no question in a
     corner duel, so there is no deck for it to come out of, and the striker's
     is left loaded underneath it untouched. */
  check("and the save after it draws nothing, because there is nothing to draw",
    ev(app, "S.phase") === "h_aim" && qd() === shotDeck, ev(app, "S.phase") + " / " + qd());

  console.log("\n--- the indexes never cross decks ---");
  start("manager", "Italy", "Netherlands");
  for (let i = 0; i < 12; i++) { await passTo(SIX, ST); run(app, "h2Next();"); }
  const usedQ = ev(app, "S.usedQ") || {};
  const classic = ev(app, "S.used");
  check("league draws are counted per league", Object.keys(usedQ).length >= 1, JSON.stringify(Object.keys(usedQ)));
  check("and the classic bank's own list is untouched",
    Object.values(classic).every(a => a.length === 0), JSON.stringify(classic));
  const anyDeck = Object.keys(usedQ)[0];
  const tiers = Object.keys(usedQ[anyDeck]);
  check("no question came up twice out of one deck",
    tiers.every(t => new Set(usedQ[anyDeck][t]).size === usedQ[anyDeck][t].length), JSON.stringify(usedQ[anyDeck]));

  console.log("\n--- when his league has nothing left ---");
  start("manager", "Italy", "Costa Rica");
  /* empty every tier of his leagues and check it falls back rather than stalling */
  run(app, 'for(const id of ["seriea","bundesliga"]) for(const t of Object.keys(DECKS[id])) if(Array.isArray(DECKS[id][t])) DECKS[id][t] = [];');
  await passTo(SIX, ST);
  check("a dry league falls back to the bank rather than stalling",
    ev(app, "S.phase") === "h_q" && qd() === null, ev(app, "S.phase") + " / " + qd());
  check("and there is a real question on the card", !!ev(app, "q() && q().q"), "no question");
  run(app, 'DECKS.seriea = ' + JSON.stringify(R("assets/seriea/index.json")) + ";");
  run(app, 'DECKS.bundesliga = ' + JSON.stringify(R("assets/bundesliga/index.json")) + ";");

  console.log("\n--- the ten shapes are all legal elevens ---");
  const shapes = ev(app, "Object.keys(H2_SHAPES)");
  check("there are ten of them", shapes.length === 10, JSON.stringify(shapes));
  for (const id of shapes) {
    const sl = ev(app, "H2_SHAPES[" + JSON.stringify(id) + "].slots");
    const froms = sl.map(p => p.from).sort((x, y) => x - y);
    check(id + ": eleven slots, every man once, keeper first",
      sl.length === 11 && JSON.stringify(froms) === JSON.stringify([0,1,2,3,4,5,6,7,8,9,10]) &&
      sl[0].from === 0 && sl[0].line === 0, JSON.stringify(froms));
  }

  console.log("\n--- a shape is a different ladder, which is the whole point ---");
  const inShape = (id, a, b) => {
    run(app, `S.h2h.form = [${JSON.stringify(id)}, ${JSON.stringify(id)}];`);
    return ev(app, "h2TierFor(" + a + ", " + b + ")");
  };
  start("manager", "Netherlands", "Italy");
  /* slot 5 is the holding midfielder in every one of them */
  check("keeper to the holder is Hard in a 4-2-3-1", inShape("4-2-3-1", GK, 5) === "hard", inShape("4-2-3-1", GK, 5));
  check("but Normal in the bus, where everything at the back is short",
    inShape("5-3-2", GK, 5) === "normal", inShape("5-3-2", GK, 5));
  check("a wing-back is Normal in a 4-2-3-1", inShape("4-2-3-1", GK, 3) === "normal", inShape("4-2-3-1", GK, 3));
  check("and Extreme in a 3-5-2, where he starts up the pitch",
    inShape("3-5-2", GK, 4) === "extreme", inShape("3-5-2", GK, 4));

  console.log("\n--- and a different set of men who can shoot ---");
  const shooters = id => { run(app, `S.h2h.form=[${JSON.stringify(id)},${JSON.stringify(id)}];`);
    return ev(app, "h2Shape(0).filter(p => p.shot).length"); };
  check("a 4-2-3-1 has four", shooters("4-2-3-1") === 4, shooters("4-2-3-1"));
  check("a 4-4-2 has two", shooters("4-4-2") === 2, shooters("4-4-2"));
  check("a 4-3-3 has three", shooters("4-3-3") === 3, shooters("4-3-3"));
  run(app, 'S.h2h.form=["4-4-2","4-4-2"];');
  check("and the ten cannot shoot in a 4-4-2, because there is no ten",
    ev(app, "h2Shape(0)[7].shot") == null, ev(app, "h2Shape(0)[7].shot"));

  console.log("\n--- the same eleven men, rearranged ---");
  run(app, 'S.h2h.form=["4-2-3-1","4-2-3-1"];');
  const asIs = ev(app, "h2Shape(0).map((_,i)=>h2Man(i,0).n)");
  run(app, 'S.h2h.form=["4-4-2","4-4-2"];');
  const flat = ev(app, "h2Shape(0).map((_,i)=>h2Man(i,0).n)");
  check("nobody is added or dropped by changing shape",
    JSON.stringify([...asIs].sort()) === JSON.stringify([...flat].sort()), JSON.stringify(flat));
  check("but they are standing somewhere else", JSON.stringify(asIs) !== JSON.stringify(flat), "identical");
  check("the keeper is still the keeper", asIs[0] === flat[0], asIs[0] + " / " + flat[0]);
  check("and the ten has gone up front alongside the striker",
    ev(app, "h2Shape(0)[9].line") === 6 && ev(app, "h2Man(9,0).n") === asIs[7],
    ev(app, "h2Man(9,0).n") + " vs the old ten " + asIs[7]);

  console.log("\n--- every run goes forward, in every shape ---");
  for (const id of shapes) {
    run(app, `S.h2h.form=[${JSON.stringify(id)},${JSON.stringify(id)}];`);
    const sl = ev(app, "h2Shape(0)");
    let runners = 0, back = 0;
    sl.forEach((p, i) => {
      if (!ev(app, "h2Runs(" + i + ",0)")) return;
      runners++;
      const sp = ev(app, "h2RunSpot(" + i + ",0,true)");
      if (!sp || sp.y >= p.y) back++;
    });
    check(id + ": " + runners + " men run, none of them backwards", runners > 0 && back === 0, back + " ran backwards");
  }

  console.log("\n--- One on One is always the shape it was tuned on ---");
  start("pitch", "Netherlands", "Italy");
  run(app, 'S.h2h.form = ["5-3-2", "5-3-2"];');
  check("even with a shape set on the state, the ladder does not move",
    ev(app, "h2TierFor(0, 5)") === "hard", ev(app, "h2TierFor(0, 5)"));
  check("and the four shooters are still there", ev(app, "h2Shape(0).filter(p=>p.shot).length") === 4,
    ev(app, "h2Shape(0).filter(p=>p.shot).length"));

  console.log("\n--- picking one, before a ball is kicked ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "manager", false); h2Start(); render();');
  await tick(140);
  run(app, 'h2PickTeam("Netherlands"); h2PickTeam("Italy");'); await tick(140);
  check("both sides picked, and it asks for an eleven first", ev(app, "S.phase") === "h_squad", ev(app, "S.phase"));
  check("all twenty-three are offered", (stage(app).match(/h2SquadPick/g) || []).length === 23,
    (stage(app).match(/h2SquadPick/g) || []).length);
  check("the deck's own eleven is already ticked, so Done is one tap",
    ev(app, "S.h2h.picked[0].length") === 11 && ev(app, "h2SquadOk(0)") === true,
    ev(app, "S.h2h.picked[0].length"));
  /* a manager who leaves his keeper out cannot kick off, because slot 0 of
     every shape IS the keeper and the save, the restart and the shootout all
     assume it */
  const gkAt = ev(app, "h2TwentyThree(0).findIndex(m => m.pos === 'GK')");
  run(app, "h2SquadPick(" + gkAt + ");"); await tick(100);
  check("dropping the only keeper blocks kick-off", ev(app, "h2SquadOk(0)") === false, "still ok");
  check("and the screen says why", /goalkeeper/.test(stage(app)), "no reason given");
  run(app, "h2SquadDone();"); await tick(100);
  check("Done does nothing while it is wrong", ev(app, "S.h2h.picking") == null || ev(app, "S.h2h.picking") === 0,
    ev(app, "S.h2h.picking"));
  run(app, "h2SquadPick(" + gkAt + ");"); await tick(100);
  /* now swap a starter for a man off the bench and check he actually plays */
  const benchAt = ev(app, "(() => { const sel = S.h2h.picked[0]; " +
    "for(let i=0;i<23;i++) if(sel.indexOf(i)<0 && h2TwentyThree(0)[i].pos !== 'GK') return i; return -1; })()");
  const outAt = ev(app, "(() => { const sel = S.h2h.picked[0]; " +
    "for(const i of sel) if(h2TwentyThree(0)[i].pos !== 'GK') return i; return -1; })()");
  const inName = ev(app, "h2TwentyThree(0)[" + benchAt + "].full");
  run(app, "h2SquadPick(" + outAt + "); h2SquadPick(" + benchAt + ");"); await tick(100);
  check("eleven again after the swap", ev(app, "h2SquadOk(0)") === true, ev(app, "S.h2h.picked[0].length"));
  run(app, "h2SquadDone();"); await tick(120);
  check("then the other manager names his", ev(app, "S.h2h.picking") === 1, ev(app, "S.h2h.picking"));
  check("the man he brought in is on the pitch",
    [...Array(11).keys()].some(i => (ev(app, "h2Man(" + i + ",0)") || {}).full === inName), inName + " not found");
  check("and slot 0 is still a goalkeeper",
    (ev(app, "h2Man(0,0)") || {}).pos === "GK", JSON.stringify(ev(app, "h2Man(0,0)")));
  /* THE BENCH IN THE DUGOUT IS EARNED, so this asks the lineup rather than the
     bench: the twelve he left out are the twelve he left out whether or not
     the album has unlocked them yet. */
  check("the man he dropped is among the twelve he left out",
    ev(app, "S.h2h.lineup[0].bench.length") === 12, ev(app, "S.h2h.lineup[0].bench.length"));
  check("and the bench is shut until the album page is finished",
    ev(app, "h2Bench(0).length") === 0, ev(app, "h2Bench(0).length"));
  run(app, "(() => { for(const m of albumMen('wc2006', 'Netherlands')) " +
    "albumStick(albumId('wc2006', 'Netherlands', m)); " +
    "albumCheckPage('wc2006', 'Netherlands'); mineSave(); })();");
  check("and open once it is", ev(app, "h2Bench(0).length") === 12, ev(app, "h2Bench(0).length"));
  run(app, "h2SquadDone();"); await tick(120);
  check("and then it asks for a shape", ev(app, "S.phase") === "h_shape", ev(app, "S.phase"));
  check("the first man is up", (ev(app, "S.h2h.shaping") || 0) === 0, ev(app, "S.h2h.shaping"));
  check("all ten are offered, drawn rather than named",
    (stage(app).match(/h2shapeb/g) || []).length === 10 && /h2mini/.test(stage(app)),
    (stage(app).match(/h2shapeb/g) || []).length);
  run(app, 'h2SetShape("4-3-3");'); await tick(120);
  check("his pick sticks", ev(app, "S.h2h.form[0]") === "4-3-3", JSON.stringify(ev(app, "S.h2h.form")));
  run(app, "h2ShapeDone();"); await tick(120);
  check("then the other man", ev(app, "S.h2h.shaping") === 1, ev(app, "S.h2h.shaping"));
  run(app, 'h2SetShape("5-3-2");'); await tick(120);
  check("and his, without touching the first", ev(app, "S.h2h.form[1]") === "5-3-2" && ev(app, "S.h2h.form[0]") === "4-3-3",
    JSON.stringify(ev(app, "S.h2h.form")));
  run(app, "h2ShapeDone();"); await tick(120);
  /* and then what they are good at, which is its own suite */
  check("then the traits", ev(app, "S.phase") === "h_traits", ev(app, "S.phase"));
  run(app, "h2TraitsDone(); h2TraitsDone();"); await tick(140);
  check("then the toss", ev(app, "S.phase") === "h_toss", ev(app, "S.phase"));
  check("and the two sides are in different shapes",
    ev(app, "h2Shape(0)[9].line") === 6 && ev(app, "h2Shape(1)[6].line") === 3,
    ev(app, "h2Shape(0)[9].line") + "/" + ev(app, "h2Shape(1)[6].line"));

  console.log("\n--- One on One never asks ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy");');
  await tick(140);
  check("it goes straight to the toss", ev(app, "S.phase") === "h_toss", ev(app, "S.phase"));
  /* and a lineup left lying about in the state must not change who plays */
  const before = ev(app, "h2Man(9,0).full");
  run(app, "S.h2h.lineup = [{xi: h2Squad(0).bench.slice(0,11), bench: h2Squad(0).xi.slice()}, null];");
  await tick(100);
  check("a lineup on the state cannot reach One on One", ev(app, "h2Man(9,0).full") === before,
    ev(app, "h2Man(9,0).full") + " was " + before);

  console.log("\n--- line height ---");
  /* A short ball is one the press would count (Easy or Normal); everything
     above it is a long one. Pressing high squeezes the short ball and leaves
     grass in behind, and sitting deep is the same trade the other way. */
  const priceOf = (from, to, k) => {
    run(app, `S.h2h.line=["mid","mid"]; S.h2h.line[1]=${JSON.stringify(k)}; S.h2h.who=0; S.h2h.at=${from}; ` +
             `S.h2h.sel=null; S.h2h.marks=[]; S.h2h.markedAgainst=0; S.h2h.relief=false; S.phase="h_pick"; render(); h2Select(${to}); h2Play();`);
    const t = ev(app, "S.tier"); run(app, "h2Next();"); return t;
  };
  start("manager", "Netherlands", "Italy");
  check("a short ball is Normal against a normal line", priceOf(SIX, TEN, "mid") === "normal", priceOf(SIX, TEN, "mid"));
  check("a high press makes it Hard", priceOf(SIX, TEN, "high") === "hard", priceOf(SIX, TEN, "high"));
  check("a low block makes it Easy", priceOf(SIX, TEN, "low") === "easy", priceOf(SIX, TEN, "low"));
  check("a long ball is Hard against a normal line", priceOf(EIGHT, ST, "mid") === "hard", priceOf(EIGHT, ST, "mid"));
  check("a high press makes THAT one cheaper, for the grass behind",
    priceOf(EIGHT, ST, "high") === "normal", priceOf(EIGHT, ST, "high"));
  check("and a low block makes it dearer", priceOf(EIGHT, ST, "low") === "extreme", priceOf(EIGHT, ST, "low"));

  /* the clamp: two cheapenings would make route one nearly free.
     The relief only exists when tackling is on, so it has to be on here or
     neither of these is testing anything. */
  run(app, "h2TackleOn = true;");
  run(app, `S.h2h.line=["mid","low"]; S.h2h.who=0; S.h2h.at=${GK}; S.h2h.sel=null; S.h2h.marks=[${TEN}]; ` +
           `S.h2h.markedAgainst=0; S.h2h.relief=true; S.phase="h_pick"; render(); h2Select(${ST}); h2Play();`);
  await tick(140);
  check("relief and a low block cancel rather than stacking",
    ev(app, "S.tier") === "ball", ev(app, "S.tier"));
  run(app, "h2Next();");
  run(app, `S.h2h.line=["mid","mid"]; S.h2h.who=0; S.h2h.at=${GK}; S.h2h.sel=null; S.h2h.marks=[${TEN}]; ` +
           `S.h2h.markedAgainst=0; S.h2h.relief=true; S.phase="h_pick"; render(); h2Select(${ST}); h2Play();`);
  await tick(140);
  check("relief alone still moves it one", ev(app, "S.tier") === "extreme", ev(app, "S.tier"));
  run(app, "h2Next(); h2TackleOn = false;");

  console.log("\n--- and One on One never sees it ---");
  start("pitch", "Netherlands", "Italy");
  check("the same ball is priced off the ladder alone",
    priceOf(SIX, TEN, "low") === "normal", priceOf(SIX, TEN, "low"));

  console.log("\n--- the defender always gets his moment in The Dugout ---");
  start("manager", "Netherlands", "Italy");
  run(app, "h2TackleOn = false; S.h2h.who = 0; h2KickOff();"); await tick(140);
  check("the phone crosses even with tackles off", ev(app, "S.phase") === "h_hand", ev(app, "S.phase"));
  run(app, "h2HandGo();"); await tick(140);
  check("and it asks for the line", /Where your line stands/.test(stage(app)), "not asked");
  check("but not for marks", !/Mark two of them/.test(stage(app)), "marks offered");
  run(app, 'h2SetLine("high");'); await tick(120);
  check("which is stored against the defender", ev(app, "S.h2h.line[1]") === "high", JSON.stringify(ev(app, "S.h2h.line")));
  run(app, "h2MarksDone(true); h2HandGo();"); await tick(140);
  check("and the attacker is shown it, because a high line is visible",
    /pushed up/.test(stage(app)), "not shown");

  start("pitch", "Netherlands", "Italy");
  run(app, "h2TackleOn = false; S.h2h.who = 0; h2KickOff();"); await tick(140);
  check("One on One with tackles off still hands nothing over",
    ev(app, "S.phase") === "h_pick", ev(app, "S.phase"));

  /* ---------------------------------------------------------------- */
  console.log("\n--- the shot reads his line ---");
  start("manager", "Italy", "Netherlands");
  const SHOOTER = [...Array(11).keys()].find(i => ev(app, "H2_SHOT_AT(" + i + ",0)"));
  check("somebody in the shape can shoot", SHOOTER != null, SHOOTER);
  const base = ev(app, "H2_SHOT_AT(" + SHOOTER + ",0)");
  const at = k => { run(app, 'S.h2h.line = S.h2h.line || {}; S.h2h.line[1] = ' + JSON.stringify(k) + ';');
                    return ev(app, "h2ShotTier(" + SHOOTER + ",0)"); };
  const idx = t => ev(app, "H2_ORDER").indexOf(t);
  check("a normal line leaves the shot where the shape put it", at("mid") === base, at("mid") + " vs " + base);
  /* pushed up means grass in front of the keeper, so hitting it is cheaper */
  check("a high press makes the shot a tier cheaper", idx(at("high")) === idx(base) - 1,
    at("high") + " from " + base);
  /* a low block is eleven men between the ball and the net */
  check("a low block makes it a tier dearer", idx(at("low")) === idx(base) + 1,
    at("low") + " from " + base);
  run(app, 'S.h2h.line[1] = "high";');
  check("and the button says the price it will really be",
    (() => { run(app, 'S.h2h.who=0; S.h2h.at=' + SHOOTER + '; S.h2h.sel=null; S.phase="h_pick"; render();');
             return stage(app).indexOf("Shoot \u00b7 " + ev(app, "TIERS[h2ShotTier(" + SHOOTER + ",0)].label")) > -1; })(),
    "button does not match");

  /* One on One has no lines to set, so the shot must be exactly the shape's */
  start("pitch", "Italy", "Netherlands");
  run(app, 'S.h2h.line = {0:"high", 1:"high"};');
  check("One on One prices the shot off the shape alone",
    ev(app, "h2ShotTier(" + SHOOTER + ",0)") === ev(app, "H2_SHOT_AT(" + SHOOTER + ",0)"),
    ev(app, "h2ShotTier(" + SHOOTER + ",0)"));

  /* ---------------------------------------------------------------- */
  console.log("\n--- a dry league falls through to his other one, not to the bank ---");
  start("manager", "Netherlands", "Italy");
  /* a man with more than one league, so there is something to fall through TO.
     van Nistelrooy is the four league case and the reason the rule exists. */
  const many = [...Array(11).keys()].find(i => ((lg(i, 0) || []).length) > 1);
  check("somebody in the Dutch eleven carries more than one league", many != null, many);
  if (many != null) {
    const his = ev(app, "h2Man(" + many + ",0).lg");
    /* empty every one of his leagues at Easy except the last, and check the
       draw finds the last rather than giving up on the first */
    const keep = his[his.length - 1];
    for (const id of his) if (id !== keep)
      run(app, 'S.usedQ[' + JSON.stringify(id) + '] = {easy: (DECKS[' + JSON.stringify(id) + '].easy||[]).map((_,n)=>n)};');
    run(app, "S.qd = null; S.qfall = null; h2Draw('easy', " + many + ", 0);");
    check("it draws from the one league he has left", qd() === keep, qd());
    check("and says nothing about a fallback", ev(app, "S.qfall") === null, JSON.stringify(ev(app, "S.qfall")));

    /* now empty that one too: the bank answers, and the card says why */
    run(app, 'S.usedQ[' + JSON.stringify(keep) + '] = {easy: (DECKS[' + JSON.stringify(keep) + '].easy||[]).map((_,n)=>n)};');
    run(app, "S.qd = null; S.qfall = null; h2Draw('easy', " + many + ", 0);");
    check("with all of them dry the classic bank answers", qd() === null, qd());
    check("and the card is told which leagues went dry",
      (ev(app, "S.qfall") || []).length === his.length, JSON.stringify(ev(app, "S.qfall")));
    check("so it says so out loud", /empty tonight/.test(ev(app, "h2League()")), ev(app, "h2League()"));
  }

  /* a man with no leagues at all was always the bank, and must not start
     claiming a league went dry */
  start("manager", "Costa Rica", "Italy");
  const none = [...Array(11).keys()].find(i => !((lg(i, 0) || []).length));
  if (none != null) {
    run(app, "S.qd = null; S.qfall = null; h2Draw('easy', " + none + ", 0);");
    check("a man with no career draws the bank quietly", qd() === null && ev(app, "S.qfall") === null,
      qd() + " / " + JSON.stringify(ev(app, "S.qfall")));
    check("and the card says nothing about leagues", ev(app, "h2League()") === "", ev(app, "h2League()"));
  }

  /* ---------------------------------------------------------------- */
  console.log("\n--- the line screen belongs to the man reading it ---");
  start("manager", "Italy", "Netherlands");
  run(app, "h2TackleOn = false; S.h2h.who = 0; h2KickOff();"); await tick(140);
  run(app, "h2HandGo();"); await tick(140);
  /* Martijn is on the ball, Bram has the phone and is setting HIS OWN line.
     It used to read "Martijn is holding a normal line" on Bram's screen. */
  check("it does not tell the defender the attacker set his line",
    !/Martijn is (holding|pushed|sitting)/.test(stage(app)), "still blames the attacker");
  check("it says the line is yours", /Your side is/.test(stage(app)), "no owner named");
  check("and that the other man can see it", /Martijn can see it/.test(stage(app)), "not told");

  /* ================================================================
     EVERY MAN ASKS ABOUT SOMETHING
     ================================================================
     Eleven slots, eleven categories, one each. The league rule made the eleven
     a choice about nations; this makes it a choice about the eleven itself,
     because where a man stands now decides what he asks as well as what it
     costs to find him. */
  console.log("\n--- every man asks about something ---");
  start("manager", "Italy", "Netherlands");
  check("there is one category per slot", ev(app, "H2_SPEC.length") === 11, ev(app, "H2_SPEC.length"));
  check("and no two men ask the same thing",
    ev(app, "new Set(H2_SPEC).size") === 11, ev(app, "new Set(H2_SPEC).size"));
  check("the striker asks about goalscorers", ev(app, "h2Spec(9)") === "scorers", ev(app, "h2Spec(9)"));
  check("the ten asks about Europe", ev(app, "h2Spec(7)") === "europe", ev(app, "h2Spec(7)"));
  check("the keeper asks about records", ev(app, "h2Spec(0)") === "records", ev(app, "h2Spec(0)"));
  /* IT FOLLOWS THE SLOT, not the formation. A shape rearranges the same eleven,
     so the rule has to stay sayable when the ten goes up front. */
  run(app, 'S.h2h.form = ["4-4-2","4-4-2"];');
  check("and it is still the slot in a different shape", ev(app, "h2Spec(9)") === "scorers",
    ev(app, "h2Spec(9)"));
  run(app, 'S.h2h.form = ["4-2-3-1","4-2-3-1"];');

  /* DRAWING IT. Italy's eleven all carry Serie A, which has categories on every
     row, so a ball to the striker should land on a scorers question. */
  const drew = [];
  for(let k = 0; k < 12; k++){
    run(app, "S.qd = null; S.qspec = null; h2Draw('normal', 9, 0);");
    const qd = qd2(), sp = ev(app, "S.qspec");
    drew.push(sp);
  }
  check("a ball to the striker keeps landing on goalscorers",
    drew.filter(x => x === "scorers").length >= 8, JSON.stringify(drew));
  const drew8 = [];
  for(let k = 0; k < 12; k++){
    run(app, "S.qd = null; S.qspec = null; h2Draw('normal', 6, 0);");
    drew8.push(ev(app, "S.qspec"));
  }
  /* THREE, not twelve, and that is the rule working. Serie A's Normal tier
     holds three cup questions, so the eight gets his specialism three times
     and then the deck honestly runs out of them and hands him anything. A
     requirement would have repeated those three all night. */
  check("and a ball to the eight lands on cup finals while there are any",
    drew8.filter(x => x === "cups").length >= 3, JSON.stringify(drew8));
  check("and then stops claiming it rather than repeating them",
    drew8.filter(x => x === null).length > 0, JSON.stringify(drew8));

  /* A PREFERENCE, NEVER A REQUIREMENT. Empty his category and the ball is still
     played: refusing it would break a rule the geometry already promised. */
  run(app, "S.usedQ = {}; S.qd = null; S.qspec = null;");
  run(app, "(() => { const b = DECKS.seriea.normal; const used = []; " +
    "b.forEach((r,n) => { if(r.cat === 'scorers') used.push(n); }); " +
    "S.usedQ.seriea = {normal: used}; })();");
  run(app, "h2Draw('normal', 9, 0);");
  check("with his category gone he still gets a question", ev(app, "S.qi") != null, ev(app, "S.qi"));
  /* THE REAL INVARIANT, which holds however the fallback went. Emptying Serie A
     does not empty La Liga, and an Italian defender carries both, so the draw
     can honestly still find a scorers question somewhere. What must never
     happen is the card claiming a specialism the question it drew does not
     have. */
  check("and the card never claims a specialism the question does not have",
    ev(app, "S.qspec") === null || ev(app, "q().cat") === ev(app, "S.qspec"),
    ev(app, "S.qspec") + " but the question is " + ev(app, "q().cat"));

  /* the card says it when it lands */
  run(app, "S.usedQ = {}; S.qd = null; S.qspec = null; h2Draw('normal', 9, 0);");
  if(ev(app, "S.qspec") === "scorers")
    check("and says it out loud when it does", /goalscorers/.test(ev(app, "h2League()")), ev(app, "h2League()"));
  else
    check("and says it out loud when it does", true, "no scorers question was left");

  console.log("\n--- One on One asks nobody anything in particular ---");
  start("pitch", "Italy", "Netherlands");
  check("no slot has a specialism on the pitch", ev(app, "h2Spec(9)") === null, ev(app, "h2Spec(9)"));

  console.log("\n--- the menu only offers it where the eleven have careers ---");
  check("Let's Ball can be managed", ev(app, 'canEver("classic","manager")') === true, ev(app, 'canEver("classic","manager")'));
  check("a league quiz cannot, its squads have no careers yet",
    ev(app, 'canEver("premier","manager")') === false, ev(app, 'canEver("premier","manager")'));
  check("nor can Career Path", ev(app, 'canEver("career","manager")') === false, ev(app, 'canEver("career","manager")'));
  check("but Let's Ball is still fine on the pitch", ev(app, 'canEver("classic","pitch")') === true, "no");

  /* ================================================================
     THE DECK'S SHAPES ARE SHAPES THE APP CAN DRAW

     Nothing in this suite ever read xiShape. That is how 234 of the 434 sides
     carrying a recorded formation came to be standing in a 4-2-3-1 they never
     played without one assertion going red: every check about shapes was about
     the table, and none was about the gap between the table and the harvest.
     These are about the gap, and they read the pools off disk rather than off
     a list typed in here, so the day a harvest lands a new formation this is
     the file that says so.
     ================================================================ */
  console.log("\n--- every formation the harvest recorded lands somewhere on purpose ---");
  const shSides = [];
  for (const dir of fs.readdirSync(path.join(REPO, "assets"))) {
    for (const f of ["index.json", "clubs.json"]) {
      const p = path.join(REPO, "assets", dir, f);
      if (!fs.existsSync(p)) continue;
      const pool = JSON.parse(fs.readFileSync(p, "utf8"));
      for (const k of Object.keys(pool)) {
        const t = pool[k];
        if (!t || !Array.isArray(t.xi) || t.xi.length !== 11 || !t.xiShape) continue;
        shSides.push({at: dir + " " + k, said: t.xiShape, xi: t.xi.map(m => ({pos: (m || {}).pos}))});
      }
    }
  }
  /* RESOLVED BY THE APP'S OWN TABLE, inside the sandbox and in one hop. It
     calls h2Fit for the order and H2_SHAPE_SAME for the decision, so this
     tests the rule that ships rather than a copy of it written out here. */
  run(app, "var SH_SIDES = " + JSON.stringify(shSides) + ";");
  const shOut = ev(app, "(() => {" +
    "const out = {n:0, own:0, other:0, lost:0, strays:{}, byLabel:{}, examples:{}};" +
    "for(const s of SH_SIDES){" +
    "  out.n++;" +
    "  const same = H2_SHAPE_SAME[s.said];" +
    "  const id = (same && (!same.when || same.when(h2Fit(s.xi)))) ? same.id : s.said;" +
    "  const key = s.said + ' -> ' + id;" +
    "  out.byLabel[key] = (out.byLabel[key] || 0) + 1;" +
    "  if(!out.examples[key]) out.examples[key] = s.at;" +
    "  if(!H2_SHAPES[id]){ out.lost++; out.strays[s.said] = (out.strays[s.said] || 0) + 1; }" +
    "  else if(id === s.said) out.own++; else out.other++;" +
    "} return out; })()");
  check("the pools were walked and the sides that record a shape were found",
    shOut.n === 434, shOut.n + " sides with a recorded shape, expected 434");
  /* THE ONE THAT MATTERS. A label nothing knows about falls silently into the
     default, which is how this bug lived: it never threw, it just said
     something false about a real eleven. */
  check("no recorded formation falls through to the default unnoticed",
    shOut.lost === 0, JSON.stringify(shOut.strays));
  check("so every side that records a shape is drawn on a board chosen for it",
    shOut.own + shOut.other === shOut.n && shOut.n > 0, shOut.own + " + " + shOut.other + " of " + shOut.n);
  /* AND THE SPLIT IS PINNED rather than printed. These two numbers are the
     whole claim of the change, so they are written down: if a harvest retags a
     man and a side moves between boards, this comes red and somebody looks,
     which is the point. 293 under the name the record gives them, 141 on a
     board with another name because their own eleven says so. */
  check("293 of them are drawn under the name the record gives them",
    shOut.own === 293, shOut.own);
  check("and 141 on a board their eleven fits better than their label does",
    shOut.other === 141, shOut.other);
  check("which is all 434 of them, and none left over",
    shOut.own + shOut.other === 434 && shOut.lost === 0,
    JSON.stringify(shOut.byLabel));
  /* THE TWO BUCKETS OF 4-5-1, which is the reading the whole table turns on:
     140 of the 183 have a winger tagged on both flanks and are drawn as the
     4-2-3-1 they lined up in, and 43 do not and are drawn flat. */
  check("140 of the 4-5-1 sides carry wingers and get the 4-2-3-1",
    shOut.byLabel["4-5-1 -> 4-2-3-1"] === 140, shOut.byLabel["4-5-1 -> 4-2-3-1"]);
  check("and 43 of them are flat or narrow and get the 4-5-1 board",
    shOut.byLabel["4-5-1 -> 4-5-1"] === 43, shOut.byLabel["4-5-1 -> 4-5-1"]);
  check("and Spain's 4-6-0 is the only side sent anywhere by name alone",
    shOut.byLabel["4-6-0 -> 4-5-1"] === 1 && /euro2012/.test(shOut.examples["4-6-0 -> 4-5-1"] || ""),
    shOut.examples["4-6-0 -> 4-5-1"]);
  check("every entry in the table points at a board that exists",
    ev(app, "Object.keys(H2_SHAPE_SAME).every(k => !!H2_SHAPES[H2_SHAPE_SAME[k].id])") === true,
    "an entry goes nowhere");
  check("and every entry carries the reason it was made, for the screen to print",
    ev(app, "Object.keys(H2_SHAPE_SAME).every(k => typeof H2_SHAPE_SAME[k].says === 'string' && H2_SHAPE_SAME[k].says.length > 20)") === true,
    "an entry has no reason on it");

  console.log("\n--- ten boards, and every one of them a side the game can play ---");
  const shIds = ev(app, "Object.keys(H2_SHAPES)");
  check("there are ten", shIds.length === 10, JSON.stringify(shIds));
  const shSeen = {};
  for (const id of shIds) {
    const sl = ev(app, "H2_SHAPES[" + JSON.stringify(id) + "].slots");
    const froms = sl.map(p => p.from).sort((x, y) => x - y);
    check(id + ": eleven slots, every man once, keeper first",
      sl.length === 11 && JSON.stringify(froms) === JSON.stringify([0,1,2,3,4,5,6,7,8,9,10]) &&
      sl[0].from === 0 && sl[0].line === 0, JSON.stringify(froms));
    check(id + ": eleven shirts, one to eleven",
      JSON.stringify(sl.map(p => p.no).sort((x, y) => x - y)) === JSON.stringify([1,2,3,4,5,6,7,8,9,10,11]),
      JSON.stringify(sl.map(p => p.no)));
    /* NOBODY STANDS ON ANYBODY. Two men on one spot is a drawing that hides a
       man and a mark the other side can never find. */
    check(id + ": nobody is standing on anybody, and everybody is on the pitch",
      new Set(sl.map(p => p.x + "," + p.y)).size === 11 &&
      sl.every(p => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100 && p.line >= 0 && p.line <= 6),
      JSON.stringify(sl.map(p => p.x + "," + p.y)));
    /* SLOTS RUN BACK TO FRONT. The sub table, the captions and h2DLineHTML all
       read a slot number, so a shape listed in some other order would be
       correct and unreadable. */
    check(id + ": the slots run back to front",
      sl.every((p, i) => i === 0 || p.line >= sl[i - 1].line), JSON.stringify(sl.map(p => p.line)));
    /* TWO SHOOTERS IS THE FLOOR. h2CanShoot refuses a man who has been sent
       off, so one shooter is one red card away from a side that cannot score. */
    check(id + ": at least two men can shoot, so a red card cannot end the side",
      sl.filter(p => p.shot).length >= 2, sl.filter(p => p.shot).length);
    const key = JSON.stringify(sl.map(p => p.from + "@" + p.x + "," + p.y));
    check(id + ": is a board of its own and not a second name for one",
      !shSeen[key], "the same eleven in the same places as " + shSeen[key]);
    shSeen[key] = id;
  }

  console.log("\n--- every run goes forward, against every shape and not just its own ---");
  /* THE HOLE THE OTHER SHAPE TEST LEFT. The loop above this one plays a shape
     against a mirror of itself, which cannot see the failure that actually
     exists: a wide forward runs round the OUTSIDE of their widest line 2 man,
     and against a shape whose line 2 stands at halfway that spot is behind the
     one he set off from. Four such instances were on the board before this
     change, across the 4-2-3-1 and the 4-3-3 playing a 3-5-2, and a green
     suite had been reporting them as fine for as long as they existed. The
     guard in h2RunSpot is one line and nothing would have noticed it being
     deleted, so the whole grid is pinned at nought here. */
  start("manager", "Netherlands", "Italy");
  const shBack = ev(app, "(() => {" +
    "const ids = Object.keys(H2_SHAPES), bad = [];" +
    "for(const a of ids) for(const b of ids){" +
    "  S.h2h.form = [a, b];" +
    "  h2Shape(0).forEach((p, i) => {" +
    "    if(!h2Runs(i, 0)) return;" +
    "    const sp = h2RunSpot(i, 0, true);" +
    "    if(!sp || sp.y >= p.y) bad.push(a + ' at ' + b + ': ' + p.n + ' from ' + p.y + ' to ' + (sp ? sp.y : 'nowhere'));" +
    "  });" +
    "} return bad; })()");
  check(shIds.length * shIds.length + " orderings and nobody runs the wrong way",
    shBack.length === 0, shBack.length + ", first " + shBack.slice(0, 3).join("; "));
  /* AND SOMEBODY IS ACTUALLY RUNNING in all of them, so the check above cannot
     be passing because nothing moved. */
  const shRunners = ev(app, "(() => { const out = {}; for(const id of Object.keys(H2_SHAPES)){" +
    "S.h2h.form = [id, id]; out[id] = h2Shape(0).filter((p, i) => h2Runs(i, 0)).length; } return out; })()");
  check("and every shape has men making runs to check",
    Object.values(shRunners).every(n => n >= 2), JSON.stringify(shRunners));

  console.log("\n--- a side is stood in the shape it played, before anybody taps anything ---");
  start("manager", "Italy", "Australia");
  check("Italy in 2006 are recorded as a 4-5-1", ev(app, "h2ShapeSaid(0)") === "4-5-1", ev(app, "h2ShapeSaid(0)"));
  /* THEIR WIDE PAIR ARE TAGGED LM AND RM, so they get the flat board the label
     describes rather than the 4-2-3-1 the label cannot distinguish it from. */
  check("and their eleven has no winger in it, so they are drawn flat",
    ev(app, "h2ShapeId(0)") === "4-5-1" && ev(app, "h2Shape(0)[10].line") === 6 &&
    ev(app, "h2Shape(0).filter(p => p.line === 6).length") === 1,
    ev(app, "h2ShapeId(0)"));
  check("Australia's 3-6-1 comes through under its own name",
    ev(app, "h2ShapeSaid(1)") === "3-6-1" && ev(app, "h2ShapeId(1)") === "3-6-1",
    ev(app, "h2ShapeSaid(1)") + " drawn as " + ev(app, "h2ShapeId(1)"));
  start("manager", "France", "Netherlands");
  check("France in 2006 are recorded as a 4-5-1 too", ev(app, "h2ShapeSaid(0)") === "4-5-1",
    ev(app, "h2ShapeSaid(0)"));
  check("but Malouda and Ribery are wingers, so Zidane gets to stand off the striker",
    ev(app, "h2ShapeId(0)") === "4-2-3-1" && ev(app, "h2Shape(0)[7].line") === 5,
    ev(app, "h2ShapeId(0)"));
  check("and the same label on the same day can reach two different boards",
    ev(app, "h2ShapeSaid(0)") === "4-5-1" && ev(app, "h2ShapeId(1)") === "4-2-3-1", "no");
  /* THROUGH THE GRAMMAR AND NOT BY NAME, so the rule is the rule rather than
     four sides somebody happened to check. */
  let shWrong = [];
  for (const side of ["Italy", "Germany", "Brazil", "England", "Ghana", "Angola", "Mexico", "Spain", "Portugal", "Argentina"]) {
    start("manager", side, "Italy");
    const ok = ev(app, "(() => { const said = h2ShapeSaid(0); if(!said) return true; " +
      "const same = H2_SHAPE_SAME[said]; " +
      "const want = (same && (!same.when || same.when(h2Squad(0).xi))) ? same.id : said; " +
      "return h2ShapeId(0) === want; })()");
    if (ok !== true) shWrong.push(side + " recorded " + ev(app, "h2ShapeSaid(0)") + " and drawn " + ev(app, "h2ShapeId(0)"));
  }
  check("every side kicks off on the board its own record resolves to",
    shWrong.length === 0, shWrong.join("; "));
  check("and One on One is told none of it",
    (run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); h2PickTeam("Italy"); h2PickTeam("Australia");'),
     ev(app, "h2ShapeId(0)") === "4-2-3-1" && ev(app, "h2ShapeId(1)") === "4-2-3-1"),
    ev(app, "h2ShapeId(0)") + "/" + ev(app, "h2ShapeId(1)"));

  console.log("\n--- and the screens say which name is which ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "manager", false); h2Start(); ' +
           'h2PickTeam("France"); h2PickTeam("Italy"); render();');
  await tick(160);
  check("it asks for the elevens first", ev(app, "S.phase") === "h_squad", ev(app, "S.phase"));
  run(app, "h2SquadDone(); h2SquadDone();"); await tick(160);
  check("and then for a shape", ev(app, "S.phase") === "h_shape", ev(app, "S.phase"));
  check("which opens on the board the record resolved to, written into the state",
    ev(app, "S.h2h.form[0]") === "4-2-3-1" && ev(app, "S.h2h.form[1]") === "4-5-1",
    JSON.stringify(ev(app, "S.h2h.form")));
  check("the lit button is that one",
    /h2shapeb sel[^>]*4-2-3-1/.test(stage(app)), "the wrong button is lit");
  check("the line above it quotes the record rather than the board",
    /They played 4-5-1 that day/.test(stage(app)), "the record is not named");
  check("and then owns up to the difference instead of papering over it",
    /the board is the 4-2-3-1/.test(stage(app)) && /winger tagged on each flank/.test(stage(app)),
    "nothing said about the two names");
  /* AND THE TEAM SHEET CARRIES BOTH, because printing the board and calling it
     the shape is the same false statement this change exists to remove. */
  check("the team sheet says both names", ev(app, "h2ShapeName(0)") === "4-5-1 as 4-2-3-1",
    ev(app, "h2ShapeName(0)"));
  check("and the outcome record files the board it was played on and the name on the report",
    ev(app, "h2LogWho(0, 9).form") === "4-2-3-1" && ev(app, "h2LogWho(0, 9).said") === "4-5-1",
    JSON.stringify(ev(app, "h2LogWho(0, 9)")));
  /* IT IS STILL A PICKER, and a manager who overrules the record is not told
     he played something he did not. */
  run(app, 'h2SetShape("5-4-1");'); await tick(140);
  check("a manager can still overrule it", ev(app, "S.h2h.form[0]") === "5-4-1",
    JSON.stringify(ev(app, "S.h2h.form")));
  check("and the sheet then reads the shape he picked, with no claim about the record",
    ev(app, "h2ShapeName(0)") === "5-4-1", ev(app, "h2ShapeName(0)"));
  check("and the hint stops saying they played it",
    !/They played 4-5-1 that day/.test(stage(app)), "it still says they played it");
  /* AND GOING BACK DOES NOT EAT IT. The seed only fills an empty slot, so a
     route that re-enters the squad screen cannot quietly stand him back in the
     record's shape. */
  run(app, "S.h2h.picking = 1; h2SquadDone();"); await tick(140);
  check("and a second trip through the squad screen leaves his pick alone",
    ev(app, "S.h2h.form[0]") === "5-4-1", JSON.stringify(ev(app, "S.h2h.form")));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
