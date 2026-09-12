/* Badge Zoom BALL ladder regression test: the zoom rungs, what each pays, what
   survives a steal, and that trading points for a wider shot does not also
   hand out a fresh clock.

     node _tests/badge-test.js

   Reuses the stub DOM and fake realtime bus from mp-test.js. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"))
  ;
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 260) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };
const stage = c => (c.__els["stage"] ? c.__els["stage"].innerHTML : "");

(async () => {
  const app = makeInstance("solo");
  await tick(60);
  // stub the badge bank: the real one comes from a fetch we can't do offline
  run(app, 'BADGE = {easy:[{s:"ajax",n:"Ajax"}], hard:[{s:"psv",n:"PSV"}], ball:[{s:"telstar",n:"Telstar"},{s:"bryne",n:"Bryne"}]};');
  run(app, 'S = freshState(["A","B"], true, "badge", 0);');   // timed = true
  run(app, 'pickTier("ball")'); await tick(60);

  console.log("--- the ladder itself ---");
  check("starts on the tight shot", ev(app, "bzStep()") === 0, ev(app, "bzStep()"));
  check("tight shot pays 20", ev(app, "badgePts()") === 20, ev(app, "badgePts()"));
  check("crest is zoomed 4x", /scale\(4\)/.test(stage(app)), (stage(app).match(/scale\([\d.]+\)/) || [])[0]);
  check("pull button offered", stage(app).indexOf("bzPull()")>-1);

  run(app, "bzPull()"); await tick(60);
  check("one pull -> 12", ev(app, "badgePts()") === 12, ev(app, "badgePts()"));
  check("zoom widened to 2.4", /scale\(2\.4\)/.test(stage(app)), (stage(app).match(/scale\([\d.]+\)/) || [])[0]);
  run(app, "bzPull()"); await tick(60);
  check("two pulls -> 6", ev(app, "badgePts()") === 6, ev(app, "badgePts()"));
  check("whole crest at 1x", /scale\(1\)/.test(stage(app)), (stage(app).match(/scale\([\d.]+\)/) || [])[0]);
  check("no third pull button", !stage(app).indexOf("bzPull()")>-1);
  run(app, "bzPull()"); await tick(60);
  check("a third pull changes nothing", ev(app, "badgePts()") === 6, ev(app, "badgePts()"));

  console.log("\n--- does pulling back reset the clock? ---");
  run(app, 'S.bz=0; S.phase="question"; render();'); await tick(4000);
  const before = ev(app, "T.deadline");
  const leftBefore = before - Date.now();
  run(app, "bzPull()"); await tick(60);
  const leftAfter = ev(app, "T.deadline") - Date.now();
  console.log(`      clock before pull: ${(leftBefore / 1000).toFixed(1)}s   after pull: ${(leftAfter / 1000).toFixed(1)}s`);
  check("pulling back does NOT hand out fresh time", leftAfter <= leftBefore + 100,
        `gained ${((leftAfter - leftBefore) / 1000).toFixed(1)}s`);

  console.log("\n--- payout matches the rung you answered on ---");
  run(app, 'S = freshState(["A","B"], false, "badge", 0); pickTier("ball");'); await tick(60);
  run(app, "bzPull(); reveal(); judge(true);"); await tick(60);
  check("answering after one pull pays 12", ev(app, "S.players[0].score") === 12, ev(app, "S.players[0].score"));

  console.log("\n--- the camera state across a steal ---");
  run(app, 'S = freshState(["A","B"], false, "badge", 0); pickTier("ball"); bzPull(); bzPull();'); await tick(60);
  run(app, "reveal(); judge(false);"); await tick(60);
  run(app, "claimSteal(1)"); await tick(60);
  check("stealer keeps the wide shot already shown", ev(app, "bzStep()") === 2, ev(app, "bzStep()"));
  run(app, "reveal(); judge(true);"); await tick(60);
  check("stealer paid the wide rung, not the tight one", ev(app, "S.players[1].score") === 6, ev(app, "S.players[1].score"));

  console.log("\n--- a new question resets the camera ---");
  run(app, 'pickTier("ball")'); await tick(60);
  check("fresh crest is back to tight", ev(app, "bzStep()") === 0, ev(app, "bzStep()"));

  console.log("\n--- non-BALL badge tiers are untouched ---");
  run(app, 'S = freshState(["A","B"], false, "badge", 0); pickTier("easy");'); await tick(60);
  check("easy has no ladder", ev(app, "isBadgeBall()") === false);
  check("easy offers no pull button", !stage(app).indexOf("bzPull()")>-1);
  run(app, "reveal(); judge(true);"); await tick(60);
  check("easy still pays its tier", ev(app, "S.players[0].score") === 1, ev(app, "S.players[0].score"));

  console.log("\n--- what the menu tells you about BALL ---");
  run(app, 'S = freshState(["A","B"], false, "badge", 0); render();'); await tick(60);
  const hint = stage(app);
  check("pick screen does not still promise a silhouette", !/silhouette/i.test(hint),
        (hint.match(/[^."]*silhouette[^."]*/i) || [])[0]);


  console.log("\n--- the bank on disk: does the crest match the answer? ---");
  /* The mode shows the picture named by the slug and calls the name the
     answer, so a row where the two disagree is unanswerable: the table looks
     at a zoomed Eredivisie logo and the app insists it is PSV. Five of those
     shipped, from the builder's search-rescue path taking the first hit
     without checking it belonged to the slug it asked about. */
  const BADGES = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets/badges/index.json"), "utf8"));
  /* honest renames, where the slug and the answer are the same thing under
     two names, plus two crests whose names are too short to share a word */
  const RENAMED = new Set(["chance-liga", "parva-liga", "persha-liga", "ab", "b-93", "crvena-zvezda", "zvezda"]);
  /* ø, å, æ and ı are letters rather than accents, so stripping diacritics
     leaves them alone and "brondby" never matched "Brøndby IF". Folding them
     by hand keeps real clubs in the bank; the same fold is in the builder. */
  const words = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/å/g, "a").replace(/ß/g, "ss")
    .replace(/đ|ð/g, "d").replace(/ł/g, "l").replace(/ı/g, "i").replace(/þ/g, "th")
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(w => w.length > 2);
  const shares = (a, b) => a.some(w => b.some(v => v.startsWith(w.slice(0, 4)) || w.startsWith(v.slice(0, 4))));
  const mismatched = [];
  for (const [tier, rows] of Object.entries(BADGES))
    rows.forEach((r, ix) => {
      if (RENAMED.has(r.s)) return;
      if (!shares(words(r.s), words(r.n))) mismatched.push(`${tier}[${ix}] ${r.s} -> ${r.n}`);
    });
  check("no crest shows one club and answers another", mismatched.length === 0, mismatched.slice(0, 6).join(" | "));
  /* The other half of the same builder bug: a national side crest kept its own
     slug and picked up a club name off the first search hit. The mode asks
     "Name this club", so a national side has no business in here at all. */
  const sides = [];
  for (const [tier, rows] of Object.entries(BADGES))
    rows.forEach((r, ix) => { if (/national-team/.test(r.s)) sides.push(`${tier}[${ix}] ${r.s} -> ${r.n}`); });
  check("no national side is asked as a club", sides.length === 0, sides.slice(0, 6).join(" | "));
  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("HARNESS ERROR:", e); process.exit(2); });
