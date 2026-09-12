/* The four modes this build carries, driven for real.

     node _tests/modes-test.js

   BALL was cut back from twenty modes to four. What that kind of cut breaks is
   never the mode you kept, it is the registry you forgot: a mode left in
   MODE_META with no MODE_LABEL draws a blank splash, a stale RR_POOL rolls a
   mode whose deck no longer loads. So this checks the registries agree with
   each other, then actually plays a question in each of the four, then proves a
   save from a mode that is gone gets turned away instead of crashing. */
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
const tick = (ms = 280) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

const load = f => JSON.parse(fs.readFileSync(path.join(REPO, f), "utf8"));

(async () => {
  const app = makeInstance("phone");
  await tick(400);

  console.log("--- the app comes up at all ---");
  check("no boot error", ev(app, "typeof render") === "function", ev(app, "typeof render"));
  check("drawer holds exactly five modes",
    ev(app, "Object.keys(MODE_META).sort().join(',')") === "badge,career,ere,h2h,h2mc",
    ev(app, "Object.keys(MODE_META).sort().join(',')"));
  check("six labels in total, Let's Ball included",
    ev(app, "Object.keys(MODE_LABEL).sort().join(',')") === "badge,career,classic,ere,h2h,h2mc",
    ev(app, "Object.keys(MODE_LABEL).sort().join(',')"));
  check("every drawer mode has a label",
    ev(app, "Object.keys(MODE_META).every(m=>!!MODE_LABEL[m])"), "a mode is missing its label");
  check("nothing hidden on a second shelf", ev(app, "MODE_EXTRA.size") === 0, ev(app, "MODE_EXTRA.size"));

  console.log("\n--- Let's Ball (the embedded classic bank) ---");
  run(app, 'S = freshState(["Martijn","Bram","Ale"], false, "classic", 0); render();'); await tick(280);
  run(app, 'pickTier("easy")'); await tick(280);
  check("a question is dealt", ev(app, "S.phase") === "question" && !!ev(app, "q().q"), ev(app, "S.phase"));
  run(app, 'reveal()'); await tick(200);
  run(app, 'judge(true)'); await tick(300);
  check("a right answer scores", ev(app, "S.players[0].score") > 0, ev(app, "S.players[0].score"));

  console.log("\n--- Eredivisie ---");
  run(app, "ERE = " + JSON.stringify(load("assets/eredivisie/index.json")));
  run(app, 'S = freshState(["Martijn","Bram"], false, "ere", 0); render();'); await tick(280);
  const ereTier = ev(app, 'Object.keys(TIERS).find(t=>bankFor(t)&&bankFor(t).length)');
  run(app, 'pickTier("' + ereTier + '")'); await tick(280);
  check("a question is dealt (" + ereTier + ")", !!ev(app, "q().q"), ev(app, "S.phase"));
  run(app, 'reveal()'); await tick(200);
  run(app, 'judge(true)'); await tick(300);
  check("it scores", ev(app, "S.players[0].score") > 0, ev(app, "S.players[0].score"));

  console.log("\n--- Badge Zoom ---");
  run(app, "BADGE = " + JSON.stringify(load("assets/badges/index.json")));
  run(app, 'S = freshState(["Martijn","Bram"], false, "badge", 0); render();'); await tick(280);
  run(app, 'pickTier("easy")'); await tick(280);
  check("a crest is on screen", !!ev(app, "q().img || q().badge || q().q"), ev(app, "S.phase"));
  run(app, 'reveal()'); await tick(200);
  run(app, 'judge(true)'); await tick(300);
  check("it scores", ev(app, "S.players[0].score") > 0, ev(app, "S.players[0].score"));

  console.log("\n--- Career Path ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "career", 0); newCareer(); render();'); await tick(300);
  check("a career is dealt", !!ev(app, "S.career"), ev(app, "JSON.stringify(S.career)").slice(0, 60));
  check("it is on its own phase", String(ev(app, "S.phase")).startsWith("c_"), ev(app, "S.phase"));

  console.log("\n--- a save from a mode that is gone ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0); S.mode="stadium"; save();'); await tick(260);
  run(app, 'S = null; resumeGame();'); await tick(300);
  check("it is refused, not crashed into", ev(app, "S") === null, ev(app, "S && S.mode"));

  console.log(fails ? "\n" + fails + " FAILED" : "\nall green");
  process.exit(fails ? 1 : 0);
})();
