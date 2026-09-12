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
  /* h2h and h2mc are gone as mode ids: One on One is the classic quiz with
     play "pitch", and Pick One is that with mc on. So the drawer is one row
     per QUIZ plus the two picture modes, and how a match is played is two
     toggles rather than two more ids. */
  check("every mode is a quiz or a picture mode",
    ev(app, "Object.keys(MODE_META).sort().join(',')") === "badge,career,classic,ere",
    ev(app, "Object.keys(MODE_META).sort().join(',')"));
  check("Let's Ball is the classic quiz, not a label of its own",
    ev(app, "matchLabel({mode:'classic'})") === "Let's Ball", ev(app, "matchLabel({mode:'classic'})"));
  check("every mode has a label", ev(app, "Object.keys(MODE_META).every(m=>!!matchLabel({mode:m}))"),
    "a mode is missing its label");
  check("the pitch is offered where there are teams, and only there",
    ev(app, "Object.keys(MODE_META).filter(canPitch).sort().join(',')") === "classic,ere",
    ev(app, "Object.keys(MODE_META).filter(canPitch).sort().join(',')"));
  check("One on One reads back as the classic quiz on the pitch",
    ev(app, "matchLabel({mode:'classic',play:'pitch'}) + ' / ' + playLabel({mode:'classic',play:'pitch'})") === "Let's Ball / One on One",
    ev(app, "matchLabel({mode:'classic',play:'pitch'}) + ' / ' + playLabel({mode:'classic',play:'pitch'})"));
  check("and an old h2h row in the record book still reads right",
    ev(app, "matchLabel({mode:'h2h'})") === "One on One", ev(app, "matchLabel({mode:'h2h'})"));
  check("nothing hidden on a second shelf", ev(app, "MODE_EXTRA.size") === 0, ev(app, "MODE_EXTRA.size"));

  console.log("\n--- Let's Ball (the embedded classic bank) ---");
  run(app, 'S = freshState(["Martijn","Bram","Ale"], false, "classic", 0); render();'); await tick(280);
  run(app, 'pickTier("easy")'); await tick(280);
  check("a question is dealt", ev(app, "S.phase") === "question" && !!ev(app, "q().q"), ev(app, "S.phase"));
  run(app, 'reveal()'); await tick(200);
  run(app, 'judge(true)'); await tick(300);
  check("a right answer scores", ev(app, "S.players[0].score") > 0, ev(app, "S.players[0].score"));

  console.log("\n--- Eredivisie ---");
  run(app, "DECKS.ere = " + JSON.stringify(load("assets/eredivisie/index.json")));
  run(app, 'S = freshState(["Martijn","Bram"], false, "ere", 0, "board", false); render();'); await tick(280);
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
