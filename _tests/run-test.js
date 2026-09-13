/* The striker's run and the winger's run, as drawn.
 *
 *     node _tests/run-test.js
 *
 * The run is animation only: the rules never see the receiving spot, and the
 * whole thing is a set of classes and CSS variables written on one render.
 * So this reads the pitch HTML the way the CSS will, and checks the rules
 * underneath were not touched: the ball still lives on the man's own spot,
 * the turnover still goes to whoever h2NearestTo picks, and a man who is not
 * one of the front three does not run anywhere.
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
  run(app, "TEAMS.classic = " + JSON.stringify(WC));

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
  check("the striker is drawn running", / run[ "]/.test(me), me);
  check("from his own spot", me.includes("--ox:50%;--oy:21%"), me);
  check("to between and past their centre-backs", me.includes("--rx:50%;--ry:13%"), me);
  check("on the ball's clock", me.includes("--dur:1400ms"), me);
  check("the ball is a two-leg flight", / run[ "]/.test(ball), ball);
  check("its first leg lands off his boot at the spot", ball.includes("--rx:54.2%;--ry:13%"), ball);
  check("its second leg is home", ball.includes("--tx:54.2%;--ty:21%"), ball);
  check("and it takes the run's time", ball.includes("--dur:1400ms"), ball);
  check("the rules never saw the spot: the ball is on the striker", H("at") === ST && H("who") === 0, H("at"));
  check("nobody stepped across", !/ step[ "]/.test(stage(app)), "a step was drawn");
  check("the ten did not run", !/ run[ "]/.test(manEl(TEN, true)), manEl(TEN, true));
  run(app, "render()"); await tick(60);
  check("one render and it is spent", !/ run[ "]/.test(stage(app)), "still running");

  console.log("\n--- the wingers' runs ---");
  await start();
  await place(0, EIGHT);
  await play(LW, true);
  me = manEl(LW, true);
  check("the left winger goes outside their right wing-back", me.includes("--rx:6%;--ry:22%"), me);
  check("and the ball is played there", ballEl().includes("--rx:10.2%;--ry:22%"), ballEl());
  await start();
  await place(0, TEN);
  await play(RW, true);
  me = manEl(RW, true);
  check("the right winger goes outside their left wing-back", me.includes("--rx:94%;--ry:22%"), me);
  check("and the ball is played there, on his inside", ballEl().includes("--rx:89.8%;--ry:22%"), ballEl());

  console.log("\n--- nobody else runs ---");
  await start();
  await place(0, GK);
  await play(SIX, true);
  check("a ball to the six is a ball to a man standing still", !/ run[ "]/.test(stage(app)) && !ballEl().includes("run"), ballEl());
  await start();
  await place(0, ST);
  run(app, "h2Shoot(); h2Reveal(); h2Judge(true);"); await tick(60);
  check("a shot is not a run", !/ run[ "]/.test(stage(app)), "a run was drawn");

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
