const fs = require("fs");
const path = require("path");
const vm = require("vm");
const REPO = "C:/dev/_Personal/PROJECTS/BALL2/Github Repo";
const harness = fs.readFileSync(path.join(REPO, "_tests/mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));
const stage = ctx => ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "";
const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 170) => new Promise(r => setTimeout(r, ms));
const GK=0,LCB=1,RCB=2,LWB=3,RWB=4,SIX=5,EIGHT=6,TEN=7,LW=8,ST=9,RW=10;
(async () => {
  const app = makeInstance("probe");
  await tick(340);
  const WC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"));
  run(app, "TEAMS.classic = " + JSON.stringify(WC));
  const phase = () => ev(app, "S.phase");
  const H = k => ev(app, "S.h2h." + k);
  const tier = () => ev(app, "S.tier");
  const start = async () => {
    run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed = true; h2TackleOn = true; render();');
    await tick(150);
  };
  const place = async (w, at, marks, relief=true) => {
    run(app, `S.h2h.who=${w}; S.h2h.at=${at}; S.h2h.sel=null; S.h2h.caught=null; S.h2h.marks=${JSON.stringify(marks||[])}; S.h2h.markedAgainst=${w}; S.h2h.relief=${relief}; S.h2h.shooting=false; S.h2h.pen=false; S.h2h.safe=0; S.phase="h_pick"; render();`);
    await tick(140);
  };

  console.log("=== 1. THE 'LET HIM PLAY' LEAK ===");
  await start();
  await place(0, GK, [SIX, LCB]);
  run(app, `h2Select(${RWB});`); await tick(80);
  console.log("  confirm bar says:", stage(app).match(/h2ctier">([^<]*)</) && RegExp.$1);
  run(app, "h2Play();"); await tick(120);
  console.log("  marks exist -> question drawn at:", tier(), " ladder says:", ev(app,`h2TierFor(${GK},${RWB})`));
  console.log("  h_q kick line:", (stage(app).match(/class="kick">([^<]*)</)||[])[1]);
  await place(0, GK, []);
  run(app, `h2Select(${RWB}); h2Play();`); await tick(120);
  console.log("  let him play -> question drawn at:", tier());
  console.log("  h_q kick line:", (stage(app).match(/class="kick">([^<]*)</)||[])[1]);

  console.log("\n=== 2. RELIEF BURNED SILENTLY ON A BACKWARDS/EASY BALL ===");
  await place(0, LCB, [SIX, ST]);
  run(app, `h2Select(${GK}); h2Play();`); await tick(120);
  console.log("  CB -> own keeper drew:", tier(), " ladder:", ev(app,`h2TierFor(${LCB},${GK})`), " relief now:", H("relief"));

  console.log("\n=== 3. SHOOTING TAKES THE RELIEF; MARKS CANNOT TOUCH A SHOT ===");
  await place(0, ST, [SIX, TEN]);
  run(app, "h2Shoot();"); await tick(120);
  console.log("  striker shot with marks up:", tier(), "(H2_SHOT[9] =", ev(app,"H2_SHOT[9]") + ")");
  await place(0, ST, []);
  run(app, "h2Shoot();"); await tick(120);
  console.log("  striker shot after 'let him play':", tier());
  await place(0, TEN, [SIX, ST]);
  run(app, "h2Shoot();"); await tick(120);
  console.log("  ten shot with marks up:", tier(), "(H2_SHOT[7] =", ev(app,"H2_SHOT[7]") + ")");

  console.log("\n=== 4. MARK ON THE STRIKER TURNS A BALL QUESTION INTO NOTHING ===");
  await place(0, GK, [ST, SIX]);
  run(app, `h2Select(${ST}); h2Play();`); await tick(140);
  console.log("  GK->ST, striker marked. phase:", phase(), "attacker asked anything?", phase()==="h_tackle" ? "no" : "yes", "tier:", tier());
  run(app, "h2TackleReveal(); h2TackleJudge(true);"); await tick(200);
  console.log("  defender WINS it -> he collects on his", ev(app,`H2_SQUAD[${H("at")}].n`), "(index "+H("at")+"), who:", H("who"));

  console.log("\n=== 5. PENALTY IS TAKEN FROM WHEREVER THE BALL WAS ===");
  await start();
  await place(0, GK, [ST]);
  run(app, `h2Select(${ST}); h2Play(); h2TackleReveal(); h2TackleJudge(false);`); await tick(200);
  console.log("  pen:", H("pen"), " shooting:", H("shooting"), " ball is at:", ev(app,`H2_SQUAD[${H("at")}].n`), " tier:", tier());
  console.log("  screen head:", (stage(app).match(/class="kick">([^<]*)</)||[])[1]);
  run(app, "h2Reveal(); h2Judge(false);"); await tick(220);
  console.log("  MISSED the pen -> who:", H("who"), " collects on:", ev(app,`H2_SQUAD[${H("at")}].n`), " phase:", phase());

  console.log("\n=== 6. THE TACKLES TOGGLE MID-MATCH ===");
  await start();
  run(app, `S.h2h.who=0; S.h2h.at=${GK}; S.h2h.marks=[${SIX},${ST}]; S.h2h.markedAgainst=0; S.h2h.relief=true; S.phase="h_pick"; render();`);
  await tick(140);
  console.log("  attacker 0 taps 'Tackles off' (button is on his own h_pick screen):", stage(app).indexOf("h2ToggleTackle") !== -1);
  run(app, "h2ToggleTackle();"); await tick(120);
  run(app, `h2Select(${SIX}); h2Play();`); await tick(140);
  console.log("  pass straight into a standing mark now:", phase(), "tier:", tier(), "(no tackle screen)");
  run(app, "h2Reveal(); h2Judge(false);"); await tick(220);
  console.log("  he loses it. who:", H("who"), " phase:", phase(), " markedAgainst:", H("markedAgainst"), " marks still:", JSON.stringify(H("marks")));
  run(app, "h2ToggleTackle();"); await tick(140);
  console.log("  toggled back ON. phase:", phase(), " who:", H("who"), " markedAgainst:", H("markedAgainst"), " marks:", JSON.stringify(H("marks")));
  const at = H("at");
  console.log("  new attacker (player " + H("who") + ") is on", ev(app,`H2_SQUAD[${at}].n`));
  run(app, `S.h2h.at=${GK}; render(); h2Select(${SIX}); h2Play();`); await tick(160);
  console.log("  he passes to his OWN six -> phase:", phase(), " contest:", H("contest"), " caught:", H("caught"), " tier:", tier());
  console.log("  (player 0 never marked anybody this possession)");

  console.log("\n=== 7. PRESS vs MARKS ORDER ===");
  await start();
  await place(0, GK, [LCB], false);
  run(app, "S.h2h.safe = 99;"); await tick(40);
  run(app, `h2Select(${LCB}); h2Play();`); await tick(140);
  console.log("  safe=99 and the pass lands on a mark -> contest:", H("contest"), " tier:", tier());
  console.log("  (press never consulted; H.safe still", H("safe") + ")");
  run(app, "h2TackleReveal(); h2TackleJudge(false);"); await tick(200);
  console.log("  foul, pass completes. H.safe:", H("safe"), " phase:", phase());

  console.log("\n=== 8. SAFE STREAK DURING A FOUL-COMPLETED PASS ===");
  await place(0, GK, [LCB], false);
  run(app, "S.h2h.safe = 0;"); await tick(40);
  run(app, `h2Select(${LCB}); h2Play(); h2TackleReveal(); h2TackleJudge(false);`); await tick(220);
  console.log("  pass completed by foul, H.safe =", H("safe"), "(a real easy pass would have made it 1)");

  console.log("\n=== 9. TIER SHOWN ON h_pick vs WHAT IS DRAWN (full table) ===");
  for (const [a,b] of [[GK,RWB],[GK,SIX],[GK,TEN],[GK,ST],[RWB,EIGHT],[EIGHT,TEN],[TEN,ST]]) {
    await place(0, a, [LCB], true);
    run(app, `h2Select(${b}); h2Play();`); await tick(110);
    console.log("  " + ev(app,`H2_SQUAD[${a}].n`) + " -> " + ev(app,`H2_SQUAD[${b}].n`) +
      ": bar says " + ev(app,`h2TierFor(${a},${b})`) + ", drawn " + tier());
  }
  process.exit(0);
})();
