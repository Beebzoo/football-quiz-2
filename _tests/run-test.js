/* The striker's run and the winger's run, as drawn.
 *
 *     node _tests/run-test.js
 *
 * A ball into the front three is played into space and the man STAYS where he
 * took it, until the ball leaves him. That makes the receiving spot a real
 * position rather than a drawing, so this file works in both directions: it
 * reads the pitch HTML the way the CSS will, and it reads the geometry the way
 * the rules do, because a pitch that draws him through on goal while the ladder
 * prices him from the halfway line is the kind of lie that becomes a bug.
 *
 * What the hold is worth is deliberately almost nothing: everything a front
 * three man can do from up there is priced the same. The one thing it changes
 * is who picks it up when he loses it, and that is the right way round.
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
  const app = makeInstance("run");
  await tick(340);
  const WC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"));
  run(app, "TEAMS.wc2006 = " + JSON.stringify(WC));

  const H = k => ev(app, "S.h2h." + k);
  /* the man element for squad index i, ours or theirs, as one string */
  const manEl = (i, mine) => {
    const re = new RegExp('<div class="h2man ' + (mine ? '(?!them)' : 'them') + '[^"]*" style="[^"]*--i:' + i + '[;"][^>]*>');
    const m = stage(app).match(re);
    return m ? m[0] : "";
  };
  const ballEl = () => { const m = stage(app).match(/<div class="h2ballwrap[^"]*" style="[^"]*"/g); return m ? m[m.length - 1] : ""; };

  const start = async () => {
    run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); S.h2h.subs=[0,0]; ' +
             'h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed = true; h2TackleOn = false; render();');
    await tick(150);
  };
  const place = async (w, at) => {
    run(app, `S.h2h.who=${w}; S.h2h.at=${at}; S.h2h.sel=null; S.h2h.shooting=false; S.h2h.pen=false; ` +
             `S.h2h.marks=[]; S.h2h.markedAgainst=${w}; S.phase="h_pick"; render();`);
    await tick(140);
  };
  const play = async (to, ok) => {
    run(app, `h2Select(${to}); h2Play(); h2Reveal(); h2Judge(${ok});`);
    await tick(60);
  };

  /* ---------------------------------------------------------------- */
  console.log("--- the striker's run ---");
  await start();
  await place(0, TEN);
  await play(ST, true);
  let me = manEl(ST, true), ball = ballEl();
  check("the striker is drawn where he ran to", / moved[ "]/.test(me) && me.includes("left:50%;top:13%"), me);
  check("coming out of his spot in the shape", me.includes("--ox:50%;--oy:21%"), me);
  check("on the ball's clock", me.includes("--dur:950ms"), me);
  check("the ball is played into the space, one leg", !/ run[ "]/.test(ball) && ball.includes("--tx:54.2%;--ty:13%"), ball);
  check("and it is lying there off his boot", ball.includes("left:54.2%;top:13%"), ball);
  check("the ball is his", H("at") === ST && H("who") === 0, H("at"));
  check("nobody stepped across", !/ step[ "]/.test(stage(app)), "a step was drawn");
  check("the ten did not move", !/ moved[ "]/.test(manEl(TEN, true)), manEl(TEN, true));

  console.log("\n--- and he stays there ---");
  check("the hold is in the state, not just in the drawing",
    H("adv.i") === ST && H("adv.w") === 0 && H("adv.x") === 50 && H("adv.y") === 13, JSON.stringify(H("adv")));
  run(app, "render()"); await tick(60);
  check("the walk is spent after one render", !/ moved[ "]/.test(stage(app)), "still walking");
  check("but he is still up there", manEl(ST, true).includes("left:50%;top:13%"), manEl(ST, true));
  check("with the ball still at his feet", ballEl().includes("left:54.2%;top:13%"), ballEl());
  check("and it is not a second run", !/ run[ "]/.test(stage(app)), "he ran again");
  check("every frame agrees where he is standing",
    ev(app, "h2VX(9,true)") === 50 && ev(app, "h2VY(9,true)") === 13 &&
    ev(app, "h2X(9,0)") === 50 && ev(app, "h2Y(9,0)") === 13, ev(app, "h2VY(9,true)"));
  check("the shape is untouched around him",
    ev(app, "h2VY(7,true)") === 40 && ev(app, "h2VY(0,true)") === 94, ev(app, "h2VY(7,true)"));
  check("and so is the other eleven", ev(app, "h2VY(9,false)") === 79, ev(app, "h2VY(9,false)"));

  console.log("\n--- what the hold is worth ---");
  /* Nearly nothing, which is the point: a front three man's ball is backwards
     or square from anywhere, so the ladder prices it the same either way. */
  check("a ball back to the ten is Easy, as it is from his spot",
    ev(app, "h2TierFor(9, 7)") === "easy", ev(app, "h2TierFor(9, 7)"));
  check("so is one to a winger", ev(app, "h2TierFor(9, 8)") === "easy", ev(app, "h2TierFor(9, 8)"));
  check("and his shot is priced by who he is, not where he stands",
    ev(app, "H2_SHOT_AT(9, 0)") === "hard", ev(app, "H2_SHOT_AT(9, 0)"));
  /* The one thing it does change, and it is the right way round. */
  check("lose it through on goal and their keeper smothers it",
    ev(app, "h2NearestTo(9, 0, 1)") === GK, ev(app, "h2NearestTo(9, 0, 1)"));
  run(app, "S.h2h.adv = null;");
  check("from his spot in the shape it is a centre-back, as it always was",
    [LCB, RCB].indexOf(ev(app, "h2NearestTo(9, 0, 1)")) !== -1, ev(app, "h2NearestTo(9, 0, 1)"));

  console.log("\n--- he drops back when the ball leaves him ---");
  await start();
  await place(0, TEN);
  await play(ST, true);
  await tick(60);
  run(app, "h2Select(" + SIX + "); h2Play(); h2Reveal(); h2Judge(true);"); await tick(60);
  check("the ball goes back to the six", H("at") === SIX && H("who") === 0, H("at"));
  check("the hold is dropped, because the six stands still", H("adv") === null, JSON.stringify(H("adv")));
  let back = manEl(ST, true);
  check("and he jogs back into the shape", / moved[ "]/.test(back) && back.includes("left:50%;top:21%"), back);
  check("from where he was standing", back.includes("--ox:50%;--oy:13%"), back);
  check("the ball left from up there, not from his spot", ballEl().includes("--fx:54.2%;--fy:13%"), ballEl());

  console.log("\n--- or hands it to the next man who runs ---");
  await start();
  await place(0, TEN);
  await play(ST, true);
  await tick(60);
  run(app, "h2Select(" + TEN + "); h2Play(); h2Reveal(); h2Judge(true);"); await tick(60);
  check("the striker's hold is gone", H("adv.i") !== ST, JSON.stringify(H("adv")));
  check("and the ten has one of his own", H("adv.i") === TEN && H("adv.y") === 31, JSON.stringify(H("adv")));
  check("the striker drops back", / moved[ "]/.test(manEl(ST, true)) && manEl(ST, true).includes("left:50%;top:21%"), manEl(ST, true));
  check("as the ten comes off his man", / moved[ "]/.test(manEl(TEN, true)) && manEl(TEN, true).includes("left:61%;top:31%"), manEl(TEN, true));
  check("only one man is ever holding", ev(app, "typeof S.h2h.adv") === "object", ev(app, "typeof S.h2h.adv"));

  console.log("\n--- or when he loses it up there ---");
  await start();
  await place(0, TEN);
  await play(ST, true);
  await tick(60);
  run(app, "h2Select(" + TEN + "); h2Play(); h2Reveal(); h2Judge(false);"); await tick(60);
  check("their keeper picks it up off his toe", H("who") === 1 && H("at") === GK, H("who") + "/" + H("at"));
  check("the hold is dropped", H("adv") === null, JSON.stringify(H("adv")));
  back = manEl(ST, false);
  check("and he jogs back as one of theirs now, mirrored",
    / moved[ "]/.test(back) && back.includes("--ox:50%;--oy:87%"), back);
  check("into his spot the same way round", back.includes("left:50%;top:79%"), back);

  console.log("\n--- the eight and the ten come off their man ---");
  await start();
  await place(0, SIX);
  await play(EIGHT, true);
  me = manEl(EIGHT, true);
  check("the eight drives off the man shadowing him", me.includes("left:30%;top:43%"), me);
  check("out of his own spot", me.includes("--ox:33%;--oy:52%"), me);
  check("and he stays there", H("adv.i") === EIGHT && H("adv.x") === 30 && H("adv.y") === 43, JSON.stringify(H("adv")));
  check("the man he came off is their ten", ev(app, "h2Shadow(" + EIGHT + ", 0)") === TEN, ev(app, "h2Shadow(" + EIGHT + ", 0)"));
  /* THE RUN MUST NOT KNOW ABOUT THE MARKS. It is read off the shape, so a man
     who is being marked runs exactly as a man who is not; anything else would
     announce the one secret this mode has. */
  run(app, "S.h2h.marks = [" + EIGHT + ", " + TEN + "]; S.h2h.markedAgainst = 0;");
  check("and the shadow is the same whether he is marked or not",
    ev(app, "h2Shadow(" + EIGHT + ", 0)") === TEN && ev(app, "h2RunSpot(" + EIGHT + ", 0, true).y") === 43,
    ev(app, "h2Shadow(" + EIGHT + ", 0)"));

  await start();
  await place(0, SIX);
  await play(TEN, true);
  me = manEl(TEN, true);
  check("the ten does the same the other way", me.includes("left:61%;top:31%"), me);
  check("out of his own spot", me.includes("--ox:64%;--oy:40%"), me);
  check("off their eight", ev(app, "h2Shadow(" + TEN + ", 0)") === EIGHT, ev(app, "h2Shadow(" + TEN + ", 0)"));
  check("the six does not run, he sits", ev(app, "h2RunSpot(" + SIX + ", 0, true)") === null, "the six ran");
  check("and neither does a centre-back", ev(app, "h2RunSpot(" + LCB + ", 0, true)") === null, "a centre-back ran");

  console.log("\n--- what the midfield hold is worth, which is NOT nothing ---");
  /* The front three hold is free: their ball is backwards or square from
     anywhere. These two carry the ball INTO the ladder, so the next ball is
     genuinely shorter and the ladder says so. Pinned here because it is a
     balance decision rather than an accident. H2_PUSH is the dial. */
  check("the ten's ball to the striker is Easy from up there",
    ev(app, "h2TierFor(" + TEN + ", " + ST + ")") === "easy", ev(app, "h2TierFor(" + TEN + ", " + ST + ")"));
  run(app, "S.h2h.adv = null;");
  check("and Normal from his spot, as it always was",
    ev(app, "h2TierFor(" + TEN + ", " + ST + ")") === "normal", ev(app, "h2TierFor(" + TEN + ", " + ST + ")"));
  run(app, "S.h2h.adv = {w:0, i:" + EIGHT + ", x:30, y:43, line:4};");
  check("the eight's ball into the front three is Normal from up there",
    ev(app, "h2TierFor(" + EIGHT + ", " + ST + ")") === "normal" &&
    ev(app, "h2TierFor(" + EIGHT + ", " + LW + ")") === "normal", ev(app, "h2TierFor(" + EIGHT + ", " + ST + ")"));
  run(app, "S.h2h.adv = null;");
  check("and Hard from his spot, as it always was",
    ev(app, "h2TierFor(" + EIGHT + ", " + ST + ")") === "hard", ev(app, "h2TierFor(" + EIGHT + ", " + ST + ")"));
  /* and the thing that stops it running away with the game */
  check("every one of those cheaper balls is one the press counts",
    ev(app, "H2_SAFE.includes('easy') && H2_SAFE.includes('normal')") === true, "the press would not see them");

  console.log("\n--- the wingers' runs ---");
  await start();
  await place(0, EIGHT);
  await play(LW, true);
  me = manEl(LW, true);
  check("the left winger goes outside their right wing-back", me.includes("left:6%;top:22%"), me);
  check("out of his own spot", me.includes("--ox:16%;--oy:25%"), me);
  check("and the ball is played there", ballEl().includes("--tx:10.2%;--ty:22%"), ballEl());
  check("a raking one, so it goes through the air", ballEl().includes(" lob"), ballEl());
  check("and he holds it", H("adv.i") === LW && H("adv.x") === 6, JSON.stringify(H("adv")));
  await start();
  await place(0, TEN);
  await play(RW, true);
  me = manEl(RW, true);
  check("the right winger goes outside their left wing-back", me.includes("left:94%;top:22%"), me);
  check("and the ball is played there, on his inside", ballEl().includes("--tx:89.8%;--ty:22%"), ballEl());
  check("along the floor, because it is a short one", ballEl().includes(" ground"), ballEl());

  console.log("\n--- nobody else runs ---");
  await start();
  await place(0, GK);
  await play(SIX, true);
  check("a ball to the six is a ball to a man standing still", !/ run[ "]/.test(stage(app)) && !ballEl().includes("run"), ballEl());
  await start();
  await place(0, ST);
  run(app, "h2Shoot(); h2Reveal(); h2Judge(true);"); await tick(60);
  check("a shot is not a run", !/ run[ "]/.test(stage(app)) && !/ moved[ "]/.test(stage(app)), "a run was drawn");

  /* ---------------------------------------------------------------- */
  console.log("\n--- lost: the same run, and the other side steps across ---");
  await start();
  await place(0, TEN);
  await play(ST, false);
  const taker = ev(app, `h2NearestTo(${TEN}, 0, 1)`);
  check("the rule decides who has it", H("who") === 1 && H("at") === taker, H("who") + "/" + H("at"));
  const them = manEl(ST, false);
  check("the striker still makes his run, as one of theirs now", / run[ "]/.test(them), them);
  check("to the same spot seen from the other end", them.includes("--rx:50%;--ry:87%"), them);
  const step = manEl(taker, true);
  check("the man the rule picked steps across", / step[ "]/.test(step), step);
  check("to where the ball drops", step.includes("--rx:54.2%;--ry:87%"), step);
  ball = ballEl();
  check("the ball goes to the spot first", / run[ "]/.test(ball) && ball.includes("--rx:54.2%;--ry:87%"), ball);
  check("and comes home on his boot", ball.includes("--tx:" + ev(app, `h2BX(${taker}, true)`) + "%"), ball);
  check("only one man steps", (stage(app).match(/ step[ "]/g) || []).length === 1, (stage(app).match(/ step[ "]/g) || []).length);

  await start();
  await place(0, GK);
  await play(SIX, false);
  check("a lost ball to the six is collected without any run", !/ run[ "]/.test(stage(app)) && !/ step[ "]/.test(stage(app)), "run drawn");

  await start();
  await place(0, EIGHT);
  await play(LW, false);
  check("a lost ball to the left winger: he runs as theirs, mirrored", manEl(LW, false).includes("--rx:94%;--ry:78%"), manEl(LW, false));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
