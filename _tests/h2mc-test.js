/* Pick One: One on One asked as multiple choice.

     node _tests/h2mc-test.js

   The point of this suite is that Pick One is NOT a second copy of the mode.
   It is the same pitch, the same ladder and the same shot, with the question
   screens swapped, so what is worth checking is that the shared machinery is
   genuinely shared: the ball still moves by the ladder, a wrong tap still
   hands possession over on the spot, and the shot still goes through the
   keeper. If those ever start behaving differently from One on One, somebody
   has quietly forked the mode and it needs putting back. */
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
const tick = (ms = 180) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

const GK = 0, LCB = 1, SIX = 5, EIGHT = 6, TEN = 7, ST = 9;

(async () => {
  const app = makeInstance("mc");
  await tick(340);
  const MC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/mc/index.json"), "utf8"));
  const WC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"));
  run(app, "DECKS['classic-mc'] = " + JSON.stringify(MC));
  run(app, "TEAMS.classic = " + JSON.stringify(WC));
  /* These checks are the ORIGINAL rules: the ladder, the turnover and the
     press. The tackle changes the shape of a turn (the phone crosses the table
     before every pass), so it is switched off here and driven on its own in
     _tests/tackle-test.js. Both rule sets ship, so both are tested. */
  run(app, "h2TackleOn = false;");

  const phase = () => ev(app, "S.phase");
  const pos = () => ev(app, "S.h2h.at");
  const who = () => ev(app, "S.h2h.who");
  const right = () => ev(app, "q().k");
  const opts = () => (stage(app).match(/class="h2opt/g) || []).length;

  /* the bench is shut for this whole file (subs=[0,0]): a wrong answer here is
   meant to be a turnover, and the bench has its own suite in subs-test.js */
  const start = async () => {
    run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", true); h2Start(); S.h2h.subs=[0,0]; ' +
             'h2PickTeam("Netherlands"); h2PickTeam("Italy"); render();');
    await tick(180);
  };
  const place = async (w, at) => {
    run(app, `S.h2h.who=${w}; S.h2h.at=${at}; S.h2h.sel=null; S.h2h.shooting=false; S.h2h.tossed=true; S.phase="h_pick"; render();`);
    await tick(160);
  };

  console.log("--- the deck ---");
  check("every tier has questions, not just the one",
    ["easy", "normal", "hard", "extreme", "ball"].every(t => (MC[t] || []).length > 0),
    Object.keys(MC).join(","));
  check("a thousand of them", Object.values(MC).flat().length === 1000, Object.values(MC).flat().length);
  check("every row carries four options and a key",
    Object.values(MC).flat().every(r => r.o && r.o.length === 4 && r.k >= 0 && r.k < 4), "a row is malformed");
  /* The option is not always the answer spelled out in full: the builder trims
     the parts that would give it away, so "RCD Espanyol de Barcelona" is
     offered as "Espanyol de Barcelona". What has to hold is that the two are
     the same thing, which is containment once the punctuation is out of it. */
  {
    const norm = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "");
    const off = Object.values(MC).flat().filter(r => {
      const a = norm(r.a), o = norm(r.o[r.k]);
      return !(a.includes(o) || o.includes(a));
    });
    check("and the key points at the answer", off.length === 0,
      off.slice(0, 2).map(r => r.a + " vs " + r.o[r.k]).join(" | "));
  }
  check("no row offers the same option twice",
    Object.values(MC).flat().every(r => new Set(r.o).size === 4), "a row has a duplicate option");

  console.log("\n--- it is the same mode, asked differently ---");
  await start();
  /* Pick One is no longer a mode id: it is the classic quiz on the pitch with
     multiple choice on. What the menu has to offer is that combination. */
  check("the multiple choice toggle exists", ev(app, 'typeof setMc === "function"'), "missing");
  check("picking the pitch sets the table to two", ev(app, '(setMode("classic"), setPlay("pitch"), setMc(true), setupCount)') === 2, ev(app, "setupCount"));
  await start();
  check("it opens on the same country picker", phase() === "h_toss", phase());
  check("the ladder is the ladder",
    ev(app, "h2TierFor(0,1)") === "easy" && ev(app, "h2TierFor(0,9)") === "ball",
    ev(app, "h2TierFor(0,1)") + "/" + ev(app, "h2TierFor(0,9)"));
  await place(0, GK);
  check("and the same eleven are out", stage(app).includes("van der Sar"), "no Dutch keeper");

  console.log("\n--- answering by tapping ---");
  await place(0, GK);
  run(app, `h2Select(${SIX})`); await tick(150);
  run(app, "h2Play()"); await tick(160);
  check("the question comes from the choice bank", ev(app, "S.tier") === "hard", ev(app, "S.tier"));
  check("four options are on screen", opts() === 4, opts());
  check("nothing to reveal and nobody to judge",
    !stage(app).includes("Reveal the answer") && !stage(app).includes("Missed"), "the spoken buttons are still there");
  const k = right();
  run(app, `h2McPick(${k})`); await tick(160);
  check("tapping one calls it", phase() === "h_judge", phase());
  check("the right one is marked", stage(app).includes("h2opt right"), "nothing marked right");
  run(app, "h2McPlayOn()"); await tick(220);
  check("a right tap moves the ball to the man you picked", pos() === SIX, pos());
  check("and play is live again", phase() === "h_pick", phase());

  console.log("\n--- a wrong tap still costs you the ball ---");
  await place(0, GK);
  run(app, `h2Select(${LCB})`); await tick(150);
  run(app, "h2Play()"); await tick(160);
  run(app, `h2McPick(${(right() + 1) % 4})`); await tick(160);
  check("your wrong one is marked too", stage(app).includes("h2opt wrong"), "nothing marked wrong");
  run(app, "h2McPlayOn()"); await tick(240);
  check("possession flips", who() === 1, who());
  check("and he collects it where you lost it, on his front line",
    ev(app, "H2_SQUAD[S.h2h.at].line") === 6, ev(app, "H2_SQUAD[S.h2h.at].long"));

  console.log("\n--- running out of time is a miss, not a freeze ---");
  await place(0, GK);
  run(app, `h2Select(${SIX})`); await tick(150);
  run(app, "h2Play()"); await tick(160);
  run(app, "h2TimeUp()"); await tick(160);
  check("the clock calls it", phase() === "h_judge", phase());
  check("with nothing picked", ev(app, "S.h2h.pick") === null, ev(app, "S.h2h.pick"));
  run(app, "h2McPlayOn()"); await tick(240);
  check("and the ball is gone", who() === 1, who());

  console.log("\n--- the shot still goes through the keeper ---");
  await place(0, ST);
  run(app, "h2Shoot()"); await tick(170);
  check("the shot is on", ev(app, "S.h2h.shooting") === true, ev(app, "S.h2h.shooting"));
  check("four ways to hit it", opts() === 4, opts());
  run(app, `h2McPick(${right()})`); await tick(160);
  run(app, "h2McPlayOn()"); await tick(220);
  check("a clean strike brings the keeper out", phase() === "h_save", phase());
  check("who gets four of his own", opts() === 4, opts());
  const sk = right();
  run(app, `h2McPick(${(sk + 1) % 4})`); await tick(160);
  run(app, "h2McPlayOn()"); await tick(240);
  check("a keeper who taps the wrong one is beaten", phase() === "h_strike", phase());
  check("and it is watched before it counts",
    ev(app, "S.h2h.result") === "scored" && ev(app, "S.players[0].score") === 0,
    ev(app, "S.h2h.result") + "/" + ev(app, "S.players[0].score"));
  run(app, "h2AfterStrike()"); await tick(260);
  check("then it is a goal", ev(app, "S.players[0].score") === 1, ev(app, "S.players[0].score"));

  console.log("\n--- and a keeper who gets it right keeps it out ---");
  await place(0, ST);
  run(app, "h2Shoot()"); await tick(170);
  run(app, `h2McPick(${right()})`); await tick(160);
  run(app, "h2McPlayOn()"); await tick(220);
  run(app, `h2McPick(${right()})`); await tick(160);
  run(app, "h2McPlayOn()"); await tick(240);
  check("saved", ev(app, "S.h2h.result") === "saved", ev(app, "S.h2h.result"));
  run(app, "h2AfterStrike()"); await tick(260);
  check("and the keeper has it on his line", who() === 1 && pos() === GK, who() + "/" + pos());

  console.log("\n--- the spoken version is untouched ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); S.h2h.subs=[0,0]; ' +
           'h2PickTeam("Netherlands"); h2PickTeam("Italy"); render();');
  await tick(180);
  await place(0, GK);
  run(app, `h2Select(${SIX})`); await tick(150);
  run(app, "h2Play()"); await tick(160);
  check("One on One still reveals and judges",
    opts() === 0 && stage(app).includes("Reveal the answer"), "the choice screen leaked into it");

  console.log(fails ? "\n" + fails + " FAILED" : "\nall green");
  process.exit(fails ? 1 : 0);
})();
