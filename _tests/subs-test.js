/* The bench, the clock and the shootout, driven rule by rule.
 *
 *     node _tests/subs-test.js
 *
 * Three things landed together and they lean on each other: a sub is offered
 * at the moment of a wrong answer, the clock ticks on every judged question
 * (including the sub's fresh one), and level at the whistle goes to penalties
 * where nobody is offered a sub at all. Most of what can go wrong is a door
 * left open: a second sub offered on the sub's own question, the clock ticking
 * during the shootout, a beaten keeper with no keeper being offered a keeper,
 * a shot in the air being whistled off before its save.
 *
 * The two older pitch suites run with the bench shut, so everything about the
 * bench lives here.
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
const tick = (ms = 170) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

const GK = 0, LCB = 1, RCB = 2, LWB = 3, RWB = 4, SIX = 5, EIGHT = 6, TEN = 7, LW = 8, ST = 9, RW = 10;

(async () => {
  const app = makeInstance("subs");
  await tick(340);
  const WC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"));
  run(app, "TEAMS.wc2006 = " + JSON.stringify(WC));
  const MC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/mc/index.json"), "utf8"));
  run(app, "DECKS['classic-mc'] = " + JSON.stringify(MC));

  const phase = () => ev(app, "S.phase");
  const H = k => ev(app, "S.h2h." + k);
  const tier = () => ev(app, "S.tier");
  const qi = () => ev(app, "S.qi");
  const benchBtns = () => (stage(app).match(/onclick="h2SubOn\(/g) || []).length;

  const start = async (mc) => {
    run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", ' + (!!mc) + '); h2Start(); ' +
             'h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed = true; h2TackleOn = false; render();');
    await tick(150);
  };
  const place = async (w, at) => {
    run(app, `S.h2h.who=${w}; S.h2h.at=${at}; S.h2h.sel=null; S.h2h.shooting=false; S.h2h.pen=false; ` +
             `S.h2h.marks=[]; S.h2h.markedAgainst=${w}; S.phase="h_pick"; render();`);
    await tick(140);
  };
  /* play a pass and get the question on the table */
  const pass = async (to) => {
    run(app, `h2Select(${to}); h2Play();`); await tick(150);
    run(app, "h2Reveal()"); await tick(120);
  };

  /* ---------------------------------------------------------------- */
  console.log("--- a wrong answer is offered the bench ---");
  await start();
  await place(0, SIX);
  await pass(TEN);
  const t0 = tier(), q0 = qi();
  run(app, "h2Judge(false)"); await tick(160);
  check("a wrong pass goes to the bench, not to a turnover", phase() === "h_sub", phase());
  check("the ball has not changed hands", H("who") === 0 && H("at") === SIX, H("who") + "/" + H("at"));
  check("the offer is for the man on the ball", H("sub.kind") === "q" && H("sub.w") === 0 && H("sub.slot") === SIX,
    JSON.stringify(H("sub")));
  check("the real bench is on the screen, all twelve of them", benchBtns() === 12, benchBtns());
  check("and they are the 2006 men", stage(app).includes("Robben") && stage(app).includes("Sneijder"), "no Robben");
  check("the man coming off is named", stage(app).includes(ev(app, "h2Who(" + SIX + ", 0)")), "not named");
  check("three changes still in hand", H("subs[0]") === 3, H("subs[0]"));
  check("the question that went wrong is still loaded", tier() === t0 && qi() === q0, tier() + "/" + qi());

  console.log("\n--- no thanks: the miss stands ---");
  run(app, "h2SubDecline()"); await tick(180);
  check("declining is the turnover it always was", H("who") === 1, H("who"));
  check("collected where it was lost", H("at") === ev(app, `h2NearestTo(${SIX}, 0, 1)`), H("at"));
  check("and no change was charged", H("subs[0]") === 3, H("subs[0]"));
  check("play is live", phase() === "h_pick", phase());

  /* ---------------------------------------------------------------- */
  console.log("\n--- yes: a fresh question, the same ball, the same price ---");
  await start();
  await place(0, SIX);
  await pass(TEN);
  const t1 = tier(), q1 = qi();
  const wasOn = ev(app, "h2Who(" + SIX + ", 0)");
  run(app, "h2Judge(false)"); await tick(160);
  const benchIdx = ev(app, "h2Bench(0)[0].i");
  const benchMan = ev(app, "h2Bench(0)[0].p.n");
  const benchNo = ev(app, "h2Bench(0)[0].p.no");
  run(app, "h2SubOn(" + benchIdx + ")"); await tick(160);
  check("back on the question card", phase() === "h_q", phase());
  check("at the same tier", tier() === t1, tier() + " v " + t1);
  check("but a different question", qi() !== q1, qi() + " v " + q1);
  check("one change spent", H("subs[0]") === 2, H("subs[0]"));
  check("the slot now reads the bench man", ev(app, "h2Who(" + SIX + ", 0)") === benchMan,
    ev(app, "h2Who(" + SIX + ", 0)"));
  check("with his own number", ev(app, "h2No(" + SIX + ", 0)") === benchNo, ev(app, "h2No(" + SIX + ", 0)"));
  check("the man who came off is gone", ev(app, "h2Who(" + SIX + ", 0)") !== wasOn, wasOn);
  check("he is off the bench list", ev(app, "h2Bench(0).map(b=>b.i)").indexOf(benchIdx) === -1, "still listed");
  check("the pass target is untouched", H("sel") === TEN, H("sel"));
  check("the card still says who is playing it", stage(app).includes(benchMan), "no name on the card");
  check("this is flagged as the sub's one go", H("subQ") === true, H("subQ"));
  check("and he is drawn on the pitch by name", stage(app).includes('class="h2lb">' + benchMan), "not on the pitch");
  const minBefore = H("min");
  run(app, "h2Reveal(); h2Judge(false)"); await tick(180);
  check("get that one wrong too and it is simply lost", phase() === "h_pick" && H("who") === 1, phase() + "/" + H("who"));
  check("no second bench offered on the sub's own question", H("sub") === null, JSON.stringify(H("sub")));
  check("the sub's question took its five minutes", H("min") === minBefore + 5, H("min"));
  check("the flag is cleared for the next ball", H("subQ") === false, H("subQ"));
  check("the sub is still in the slot afterwards", ev(app, "h2Who(" + SIX + ", 0)") === benchMan,
    ev(app, "h2Who(" + SIX + ", 0)"));

  console.log("\n--- the sub gets it right and the pass goes ---");
  await start();
  await place(0, SIX);
  await pass(TEN);
  run(app, "h2Judge(false)"); await tick(160);
  run(app, "h2SubOn(" + ev(app, "h2Bench(0)[0].i") + ")"); await tick(160);
  run(app, "h2Reveal(); h2Judge(true)"); await tick(180);
  check("right, and the ball arrives", H("who") === 0 && H("at") === TEN, H("who") + "/" + H("at"));
  check("the flag is cleared", H("subQ") === false, H("subQ"));

  /* ---------------------------------------------------------------- */
  console.log("\n--- when there is nobody to bring on ---");
  await start();
  run(app, "S.h2h.subs = [0, 3];");
  await place(0, SIX);
  await pass(TEN);
  run(app, "h2Judge(false)"); await tick(160);
  check("no changes left means no offer", phase() === "h_pick" && H("who") === 1, phase() + "/" + H("who"));
  await start();
  run(app, "S.h2h.benchUsed = [[0,1,2,3,4,5,6,7,8,9,10,11], []];");
  await place(0, SIX);
  await pass(TEN);
  run(app, "h2Judge(false)"); await tick(160);
  check("an empty bench means no offer", phase() === "h_pick" && H("who") === 1, phase() + "/" + H("who"));
  await start();
  run(app, "delete S.h2h.subs; delete S.h2h.subbed; delete S.h2h.benchUsed;");
  check("a match parked before the bench existed still has three", ev(app, "h2SubsLeft(0)") === 3, ev(app, "h2SubsLeft(0)"));
  await place(0, SIX);
  await pass(TEN);
  run(app, "h2Judge(false)"); await tick(160);
  check("and is offered the bench", phase() === "h_sub", phase());
  run(app, "h2SubOn(" + ev(app, "h2Bench(0)[0].i") + ")"); await tick(160);
  check("which works once it is set up on the way in", phase() === "h_q" && H("subs[0]") === 2, phase() + "/" + H("subs[0]"));

  /* ---------------------------------------------------------------- */
  console.log("\n--- nobody comes on once the ball is struck ---");
  /* A change is a break in play and a shot is not one. This used to offer the
     shooter his bench so he could take it again, and the beaten keeper his so a
     fresh man could re-take the save, which is somebody running on while the
     ball is travelling past him. */
  await start();
  await place(0, ST);
  run(app, "h2Shoot()"); await tick(150);
  check("a shot is on", phase() === "h_q" && H("shooting") === true, phase());
  check("three changes still in hand", H("subs[0]") === 3, H("subs[0]"));
  run(app, "h2Reveal(); h2Judge(false)"); await tick(200);
  check("miss it and there is no bench offered", phase() !== "h_sub", phase());
  check("it is simply lost, as it always was", H("who") === 1, H("who"));
  check("and nothing was spent", H("subs[0]") === 3, H("subs[0]"));

  await start();
  await place(0, ST);
  run(app, "h2Shoot()"); await tick(150);
  run(app, "h2Reveal(); h2Judge(true)"); await tick(160);
  check("struck, and the keeper is asked", phase() === "h_save", phase());
  const gk0 = ev(app, "h2Who(0, 1)");
  run(app, "h2SaveReveal(); h2SaveJudge(false)"); await tick(160);
  check("beaten, and his bench is NOT offered", phase() !== "h_sub", phase());
  check("it is a goal, watched before it counts", phase() === "h_strike" && H("result") === "scored",
    phase() + "/" + H("result"));
  check("and the same man is still in goal", ev(app, "h2Who(0, 1)") === gk0, ev(app, "h2Who(0, 1)"));
  check("with his side's changes untouched", H("subs[1]") === 3, H("subs[1]"));

  console.log("\n--- nor at a penalty ---");
  await start();
  run(app, "h2TackleOn = true;");
  run(app, `S.h2h.who=0; S.h2h.at=${SIX}; S.h2h.marks=[${ST}]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(${ST}); h2Play();`);
  await tick(150);
  run(app, "h2TackleReveal(); h2TackleJudge(false)"); await tick(200);
  check("a foul on the striker is a penalty", H("pen") === true && phase() === "h_q", phase() + "/" + H("pen"));
  run(app, "h2Reveal(); h2Judge(false)"); await tick(200);
  check("miss it and there is no bench for the taker", phase() !== "h_sub", phase());
  run(app, "h2TackleOn = false;");

  console.log("\n--- but a pass still has one ---");
  await start();
  await place(0, SIX);
  await pass(TEN);
  run(app, "h2Judge(false)"); await tick(160);
  check("the bench is there for a misplaced pass", phase() === "h_sub", phase());
  check("which is the only door it has", H("sub.kind") === "q", JSON.stringify(H("sub")));
  run(app, "h2SubDecline()"); await tick(160);
  /* ---------------------------------------------------------------- */
  console.log("\n--- the contests are not covered ---");
  await start();
  run(app, "h2TackleOn = true;");
  run(app, `S.h2h.who=0; S.h2h.at=SIX; S.h2h.marks=[${TEN}]; S.h2h.markedAgainst=0; S.h2h.relief=true; S.phase="h_pick"; render();`
    .replace("SIX", SIX));
  await tick(140);
  run(app, `h2Select(${TEN}); h2Play();`); await tick(150);
  check("the pass into the marked man is the defender's question", phase() === "h_tackle", phase());
  run(app, "h2TackleReveal(); h2TackleJudge(false)"); await tick(180);
  check("a mistimed tackle is a foul, not a bench offer", phase() !== "h_sub" && H("who") === 0 && H("at") === TEN,
    phase() + "/" + H("who") + "/" + H("at"));
  check("and it still took its five minutes", H("min") === 5, H("min"));
  run(app, "h2TackleOn = false;");

  /* ---------------------------------------------------------------- */
  console.log("\n--- the clock ---");
  await start();
  check("kick-off is at nought", H("min") === 0, H("min"));
  check("the label says kick off before a ball is kicked", ev(app, "h2ClockLabel()") === "KICK OFF", ev(app, "h2ClockLabel()"));
  await place(0, GK);
  check("and on the pitch it shows the minute", stage(app).includes("<em>0'</em>"), "no minute");
  await pass(SIX);
  run(app, "h2Judge(true)"); await tick(160);
  check("one question is five minutes", H("min") === 5 && stage(app).includes("<em>5'</em>"), H("min"));
  await pass(TEN);
  run(app, "h2Judge(true)"); await tick(160);
  check("two is ten", H("min") === 10, H("min"));
  check("the toss line names both ends of the match", (() => {
    run(app, 'S.phase = "h_toss"; S.h2h.tossed = false; render();');
    return stage(app).includes("first to 2 or 90 minutes");
  })(), "no ninety");

  console.log("\n--- the whistle ---");
  await start();
  run(app, "S.h2h.min = 85; S.players[0].score = 1;");
  await place(0, SIX);
  await pass(TEN);
  run(app, "h2Judge(true)"); await tick(180);
  check("ninety on the clock and the next dead ball is the whistle", phase() === "h_ft", phase());
  check("the pass that took it there landed first", H("at") === TEN, H("at"));
  check("the scorebug reads full time", stage(app).includes("FULL TIME"), "no full time");
  check("and the screen says who has it", stage(app).includes("Martijn wins it, 1 to 0"), "no result line");
  run(app, "h2AfterWhistle()"); await tick(200);
  check("out of it to the results", phase() === "results", phase());
  check("filed as a win", ev(app, "history().slice(-1)[0].winner") === "Martijn", ev(app, "history().slice(-1)[0].winner"));
  check("timed in minutes, not rounds", stage(app).includes("Full time · 90 minutes"), "wrong line");

  await start();
  run(app, "S.h2h.min = 85;");
  await place(0, ST);
  run(app, "h2Shoot()"); await tick(150);
  run(app, "h2Reveal(); h2Judge(true)"); await tick(160);
  check("a shot at ninety still gets its save", phase() === "h_save" && H("min") === 90, phase() + "/" + H("min"));
  run(app, "h2SaveReveal(); h2SaveJudge(true)"); await tick(160);
  run(app, "h2AfterStrike()"); await tick(180);
  check("and the save is the dead ball that ends it", phase() === "h_ft", phase());

  await start();
  run(app, "S.h2h.min = 85; S.h2h.subs = [3, 0]; S.players[1].score = 1;");
  await place(0, ST);
  run(app, "h2Shoot()"); await tick(150);
  run(app, "h2Reveal(); h2Judge(true)"); await tick(160);
  run(app, "h2SaveReveal(); h2SaveJudge(false)"); await tick(160);
  run(app, "h2AfterStrike()"); await tick(180);
  check("a late equaliser is celebrated", phase() === "h_goal" && ev(app, "S.players[0].score") === 1, phase());
  check("and the button already knows it is penalties", stage(app).includes("Full time. Penalties"), "wrong button");
  run(app, "h2KickOn()"); await tick(180);
  check("kick on and the whistle goes", phase() === "h_ft", phase());
  check("level, so the screen says penalties", stage(app).includes("Level at 1 each"), "no level line");
  run(app, "h2AfterWhistle()"); await tick(180);
  check("and it is a shootout", phase() === "h_pens" && !!H("so"), phase());

  /* ---------------------------------------------------------------- */
  console.log("\n--- penalties ---");
  check("the side without the ball at the whistle goes first", H("so.first") === 0, H("so.first"));
  check("the scorebug says so", stage(app).includes("PENALTIES"), "no PENALTIES");
  check("the board names the first man up", stage(app).includes("Martijn steps up"), "wrong man");
  const minSo = H("min");
  run(app, "h2SoKick()"); await tick(160);
  check("a kick is a penalty question", phase() === "h_q" && H("pen") === true && H("shooting") === true, phase());
  check("for the striker", H("at") === ST && H("who") === 0, H("at") + "/" + H("who"));
  check("priced as a shootout kick", tier() === "normal", tier());
  check("the card says PENALTY", stage(app).includes("PENALTY ·"), "no PENALTY");
  check("in front of the goal, not on the pitch", stage(app).includes("g3-keeper") && !stage(app).includes("h2pitch"), "wrong scene");
  run(app, "h2Reveal(); h2Judge(false)"); await tick(160);
  check("a miss is a miss: no bench in a shootout", phase() === "h_strike" && H("result") === "missed", phase() + "/" + H("result"));
  check("and it goes over", stage(app).includes("g3 missed") && stage(app).includes("OVER"), "no OVER");
  run(app, "h2AfterStrike()"); await tick(160);
  check("onto the tally", JSON.stringify(H("so.kicks")) === "[[0],[]]", JSON.stringify(H("so.kicks")));
  check("the other man is next", stage(app).includes("Bram steps up") && stage(app).includes("Martijn misses"), "wrong next");
  check("the clock did not move", H("min") === minSo, H("min"));
  run(app, "h2SoKick()"); await tick(160);
  check("Bram's kick", H("who") === 1 && H("at") === ST, H("who") + "/" + H("at"));
  run(app, "h2Reveal(); h2Judge(true)"); await tick(160);
  check("struck, and the keeper is asked", phase() === "h_save" && tier() === "hard", phase() + "/" + tier());
  run(app, "h2SaveReveal(); h2SaveJudge(false)"); await tick(160);
  check("beaten, and no keeper change either", phase() === "h_strike" && H("result") === "scored", phase() + "/" + H("result"));
  run(app, "h2AfterStrike()"); await tick(160);
  check("one each side taken, Bram in front", JSON.stringify(H("so.kicks")) === "[[0],[1]]", JSON.stringify(H("so.kicks")));
  check("the match score itself has not moved", ev(app, "S.players.map(p=>p.score).join()") === "1,1", ev(app, "S.players.map(p=>p.score).join()"));
  check("the board shows a miss and a goal", (stage(app).match(/<i class="out">/g) || []).length === 1 &&
    (stage(app).match(/<i class="in">/g) || []).length === 1, "pips wrong");
  check("the clock still has not moved", H("min") === minSo, H("min"));

  console.log("\n--- when it is decided ---");
  const decided = k => ev(app, "h2SoDecided({first:0, n:0, kicks:" + JSON.stringify(k) + "})");
  check("three up with two to go is over", decided([[1,1,1],[0,0,0]]) === 0, decided([[1,1,1],[0,0,0]]));
  check("three to nought after three each, the other way", decided([[0,0,0],[1,1,1]]) === 1, decided([[0,0,0],[1,1,1]]));
  check("five to four after five each is over", decided([[1,1,1,1,1],[1,1,1,1,0]]) === 0, decided([[1,1,1,1,1],[1,1,1,1,0]]));
  check("five to four with one still to take is not", decided([[1,1,1,1,1],[1,1,1,1]]) === null, decided([[1,1,1,1,1],[1,1,1,1]]));
  check("four to three with one left each is not", decided([[1,1,1,1],[1,1,1,0]]) === null, decided([[1,1,1,1],[1,1,1,0]]));
  check("level after five is not", decided([[1,1,1,1,1],[1,1,1,1,1]]) === null, "decided");
  check("sudden death, level after a pair, carries on", decided([[1,1,1,1,1,1],[1,1,1,1,1,1]]) === null, "decided");
  check("sudden death, a miss then a score, ends it", decided([[1,1,1,1,1,0],[1,1,1,1,1,1]]) === 1, decided([[1,1,1,1,1,0],[1,1,1,1,1,1]]));
  check("sudden death, half a pair in, does not", decided([[1,1,1,1,1,1],[1,1,1,1,1]]) === null, "decided");

  /* drive this one to the end: Martijn misses every one, Bram scores */
  run(app, "S.h2h.so.kicks = [[0,0],[1,1]]; S.h2h.so.n = 4;");
  run(app, "h2SoKick()"); await tick(120);
  run(app, "h2Reveal(); h2Judge(false)"); await tick(120);
  run(app, "h2AfterStrike()"); await tick(160);
  check("nought from three, Bram two from two, still on (he could miss two)", phase() === "h_pens", phase());
  run(app, "h2SoKick()"); await tick(120);
  run(app, "h2Reveal(); h2Judge(true)"); await tick(120);
  run(app, "h2SaveReveal(); h2SaveJudge(false)"); await tick(120);
  run(app, "h2AfterStrike()"); await tick(200);
  check("three from three against nought from three, with two left, is over", phase() === "results", phase());
  check("the tally is on the record", JSON.stringify(ev(app, "S.pens")) === "[0,3]", JSON.stringify(ev(app, "S.pens")));
  check("filed as Bram's win", ev(app, "history().slice(-1)[0].winner") === "Bram", ev(app, "history().slice(-1)[0].winner"));
  check("with the shootout on the record", JSON.stringify(ev(app, "history().slice(-1)[0].pens")) === "[0,3]",
    JSON.stringify(ev(app, "history().slice(-1)[0].pens")));
  check("the results say how", stage(app).includes("0-3 on penalties"), "no penalties line");
  check("the score stays what it was, tally beside it", stage(app).includes("1 <small") && stage(app).includes("(3)"), "no tally");
  check("Bram is top of the list", /class="frow w"[\s\S]*?Bram/.test(stage(app)), "wrong man top");

  /* ---------------------------------------------------------------- */
  console.log("\n--- multiple choice takes the same doors ---");
  await start(true);
  await place(0, SIX);
  run(app, `h2Select(${TEN}); h2Play();`); await tick(150);
  run(app, "h2McPick((q().k + 1) % 4)"); await tick(120);
  run(app, "h2McPlayOn()"); await tick(160);
  check("a wrong tap is offered the bench", phase() === "h_sub", phase());
  run(app, "h2SubOn(" + ev(app, "h2Bench(0)[0].i") + ")"); await tick(160);
  check("the sub's question has four options and no pick", phase() === "h_q" && H("pick") === null &&
    (stage(app).match(/class="h2opt/g) || []).length === 4, phase() + "/" + H("pick"));
  run(app, "h2McPick(q().k)"); await tick(120);
  run(app, "h2McPlayOn()"); await tick(160);
  check("and the right tap plays it", H("at") === TEN && H("who") === 0, H("at") + "/" + H("who"));

  /* ================================================================
     A CHANGE HE MEANT TO MAKE
     ================================================================
     The bench was a rescue: the only way to use one was to get a question
     wrong first, which means you never choose it, and the man who comes on is
     decided by whichever slot happened to lose the ball. A manager should be
     able to look at the pitch and take a man off because he wants to.

     The whole risk is WHERE. A change is a break in play, so it must never be
     reachable with a ball in the air or a question live. */
  /* a Dugout match, which is the only place a voluntary change lives */
  const mgr = () => run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "manager", false); h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed = true; S.h2h.subs=[3,3]; h2TackleOn = false; render();');

  console.log("\n--- a change he asked for ---");
  mgr();
  await tick(140);
  run(app, 'S.h2h.who=0; S.h2h.at=5; S.h2h.sel=null; S.h2h.markedAgainst=0; S.phase="h_pick"; render();');
  await tick(120);
  check("the man on the ball is offered a change", /h2SubWant/.test(stage(app)), "no button");
  const mins0 = ev(app, "S.h2h.min") || 0;
  const subs0 = ev(app, "S.h2h.subs[0]");
  run(app, "h2Select(7); render();"); await tick(120);
  check("but not once he has picked a ball out", !/h2SubWant/.test(stage(app)), "still offered mid-pass");
  run(app, "S.h2h.sel=null; render(); h2SubWant();"); await tick(120);
  check("it opens the change screen", ev(app, "S.phase") === "h_sub", ev(app, "S.phase"));
  check("and it knows nobody was forced into it", ev(app, "S.h2h.sub.kind") === "tactic",
    JSON.stringify(ev(app, "S.h2h.sub")));
  check("the eleven are offered, to say who is going off",
    (stage(app).match(/h2SubOff\(/g) || []).length === 11, (stage(app).match(/h2SubOff\(/g) || []).length);
  check("and nobody is offered to come on yet, because nobody is going off",
    (stage(app).match(/h2SubSwap\(/g) || []).length === 0, (stage(app).match(/h2SubSwap\(/g) || []).length);
  const offName = ev(app, "h2Man(7,0).n");
  run(app, "h2SubOff(7);"); await tick(120);
  check("picking a man opens the bench",
    (stage(app).match(/h2SubSwap\(/g) || []).length === 12, (stage(app).match(/h2SubSwap\(/g) || []).length);
  check("and it says who is coming off", stage(app).indexOf(offName + " is coming off") > -1, "not named");
  const onName = ev(app, "h2Bench(0)[3].p.n");
  run(app, "h2SubSwap(h2Bench(0)[3].i);"); await tick(160);
  check("the man he chose is on the pitch", ev(app, "h2Man(7,0).n") === onName,
    ev(app, "h2Man(7,0).n") + " wanted " + onName);
  check("a change was spent", ev(app, "S.h2h.subs[0]") === subs0 - 1, ev(app, "S.h2h.subs[0]"));
  check("and five minutes with it", (ev(app, "S.h2h.min") || 0) === mins0 + 5,
    (ev(app, "S.h2h.min") || 0) + " was " + mins0);
  check("NO question was asked, because nothing was being answered",
    ev(app, "S.phase") !== "h_q" && ev(app, "S.tier") == null, ev(app, "S.phase") + "/" + ev(app, "S.tier"));
  check("and the ball is still his, where it was", ev(app, "S.h2h.who") === 0 && ev(app, "S.h2h.at") === 5,
    ev(app, "S.h2h.who") + "/" + ev(app, "S.h2h.at"));

  console.log("\n--- and one he thought better of ---");
  run(app, 'S.h2h.who=0; S.h2h.at=5; S.h2h.sel=null; S.phase="h_pick"; render(); h2SubWant();');
  await tick(120);
  const subs1 = ev(app, "S.h2h.subs[0]"), mins1 = ev(app, "S.h2h.min") || 0;
  run(app, "h2SubDecline();"); await tick(120);
  check("backing out costs no change", ev(app, "S.h2h.subs[0]") === subs1, ev(app, "S.h2h.subs[0]"));
  check("and no time", (ev(app, "S.h2h.min") || 0) === mins1, ev(app, "S.h2h.min"));
  check("and puts him back where he was", ev(app, "S.phase") === "h_pick", ev(app, "S.phase"));

  console.log("\n--- the defender gets his, on his own screen ---");
  mgr();
  run(app, "h2TackleOn = false; S.h2h.who = 0; h2KickOff();"); await tick(160);
  check("the phone crosses", ev(app, "S.phase") === "h_hand", ev(app, "S.phase"));
  run(app, "h2HandGo();"); await tick(160);
  check("and the private screen offers HIM a change", /h2SubWant/.test(stage(app)), "not offered");
  run(app, "h2SubWant();"); await tick(120);
  check("which belongs to the defending side", ev(app, "S.h2h.sub.w") === 1, ev(app, "S.h2h.sub.w"));
  run(app, "h2SubOff(9); h2SubSwap(h2Bench(1)[0].i);"); await tick(160);
  check("and it hands the phone back to the same private screen, not across the table",
    ev(app, "S.phase") === "h_mark", ev(app, "S.phase"));

  console.log("\n--- never with a ball in the air ---");
  mgr();
  run(app, 'S.h2h.who=0; S.h2h.at=9; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Shoot();');
  await tick(160);
  check("a live question does not offer one", !/h2SubWant/.test(stage(app)), "offered mid-question");
  mgr();
  run(app, 'S.h2h.so = {kicks:[[],[]], n:0}; S.h2h.who=0; S.h2h.at=5; S.h2h.sel=null; S.h2h.markedAgainst=0; S.phase="h_pick"; render();');
  await tick(120);
  check("nor does a shootout", !/h2SubWant/.test(stage(app)), "offered in the shootout");

  console.log("\n--- and never when there is nothing left to bring on ---");
  mgr();
  run(app, 'S.h2h.subs=[0,0]; S.h2h.who=0; S.h2h.at=5; S.h2h.sel=null; S.h2h.markedAgainst=0; S.phase="h_pick"; render();');
  await tick(120);
  check("no changes left, no button", !/h2SubWant/.test(stage(app)), "offered with none left");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
