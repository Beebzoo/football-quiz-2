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
const GK=0,LCB=1,RCB=2,LWB=3,RWB=4,SIX=5,EIGHT=6,TEN=7,LW=8,ST=9,RW=10;
(async () => {
  const app = makeInstance("probe");
  await tick(340);
  const WC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"));
  run(app, "TEAMS.classic = " + JSON.stringify(WC));
  const phase = () => ev(app, "S.phase");
  const H = k => ev(app, "S.h2h." + k);
  const start = async () => {
    run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); ' +
             'h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed = true; render();');
    await tick(150);
  };
  const place = async (w, at, marks) => {
    run(app, `S.h2h.who=${w}; S.h2h.at=${at}; S.h2h.sel=null; S.h2h.caught=null; ` +
             `S.h2h.marks=${JSON.stringify(marks||[])}; S.h2h.markedAgainst=${w}; S.h2h.relief=true; ` +
             `S.h2h.safe=0; S.h2h.shooting=false; S.h2h.pen=false; S.phase="h_pick"; render();`);
    await tick(140);
  };
  const grab = s => { const m = s.match(/<div class="kick">([\s\S]*?)<\/div>/); return m ? m[1] : "(none)"; };
  const bar = s => { const m = s.match(/h2ctier">([^<]*)</); return m ? m[1] : "(no bar)"; };

  await start();
  run(app, "h2TackleOn = true;");

  console.log("=== A) MARKED: preview vs question header ===");
  await place(0, GK, [SIX, ST]);
  run(app, `h2Select(${SIX}); render();`); await tick(140);
  console.log("  confirm bar tier :", bar(stage(app)));
  run(app, `h2Select(${TEN}); render();`); await tick(140);
  console.log("  bar for GK->TEN  :", bar(stage(app)));
  run(app, `h2Play();`); await tick(160);
  console.log("  phase            :", phase(), " S.tier:", ev(app,"S.tier"));
  console.log("  question header  :", grab(stage(app)));
  console.log("  qcard colour     :", (stage(app).match(/qcard" style="--dc:([^"]*)"/)||[])[1]);

  console.log("\n=== B) NO MARKS (let him play): same pass ===");
  await place(0, GK, []);
  run(app, `h2Select(${TEN}); render();`); await tick(140);
  console.log("  bar for GK->TEN  :", bar(stage(app)));
  run(app, `h2Play();`); await tick(160);
  console.log("  phase            :", phase(), " S.tier:", ev(app,"S.tier"));
  console.log("  question header  :", grab(stage(app)));

  console.log("\n=== C) relief pushes a HARD ball into the press streak ===");
  await place(0, GK, [ST, LW]);
  console.log("  ladder GK->SIX   :", ev(app, `h2TierFor(${GK},${SIX})`));
  run(app, `h2Select(${SIX}); h2Play();`); await tick(160);
  console.log("  drawn tier       :", ev(app,"S.tier"));
  run(app, "h2Reveal(); h2Judge(true);"); await tick(220);
  console.log("  safe streak after a LONG BALL:", H("safe"), " phase:", phase());
  console.log("  heat line        :", (stage(app).match(/<div class="h2heat[^>]*>([\s\S]*?)<\/div>/)||[])[1]);
  await place(0, GK, []);
  run(app, `h2Select(${SIX}); h2Play();`); await tick(160);
  run(app, "h2Reveal(); h2Judge(true);"); await tick(220);
  console.log("  same ball, no marks -> safe:", H("safe"), " heat:", (stage(app).match(/<div class="h2heat[^>]*>([\s\S]*?)<\/div>/)||[])[1] || "(none)");

  console.log("\n=== D) shoot preview vs relieved shot ===");
  await place(0, ST, [SIX, TEN]);
  console.log("  shoot button     :", (stage(app).match(/onclick="h2Shoot\(\)">([^<]*)</)||[])[1]);
  run(app, "h2Shoot();"); await tick(160);
  console.log("  drawn tier       :", ev(app,"S.tier"), " header:", grab(stage(app)));

  console.log("\n=== E) toast from the private screen survives the handoff ===");
  await start();
  run(app, "S.h2h.who = 0; h2KickOff();"); await tick(160);
  run(app, "h2HandGo()"); await tick(140);
  run(app, `h2Mark(${SIX}); h2Mark(${ST}); h2Mark(${TEN});`); await tick(120);
  console.log("  toast text now   :", ev(app, "__els['toast'] ? __els['toast'].textContent : '(no toast el)'"));
  console.log("  toast shown      :", ev(app, "__els['toast'] ? __els['toast'].className : ''"));
  run(app, "h2MarksDone(false); h2HandGo();"); await tick(140);
  console.log("  phase now        :", phase());
  console.log("  toast still says :", ev(app, "__els['toast'] ? __els['toast'].textContent : ''"),
              "| class:", ev(app, "__els['toast'] ? __els['toast'].className : ''"));

  console.log("\n=== F) what save() leaves in localStorage ===");
  const raw = ev(app, "JSON.parse(localStorage.getItem(SAVE_KEY)||'null')");
  console.log("  h2h.marks in save:", raw && raw.h2h ? JSON.stringify(raw.h2h.marks) : "(no save)");
  console.log("  phase in save    :", raw ? raw.phase : "");

  console.log("\n=== G) reload during the handoff ===");
  await start();
  run(app, "S.h2h.who = 0; h2KickOff();"); await tick(160);
  run(app, "h2HandGo()"); await tick(140);
  run(app, `h2Mark(${SIX}); h2Mark(${ST}); h2MarksDone(false);`); await tick(140);
  console.log("  phase (down card):", phase(), "marks:", JSON.stringify(H("marks")));
  run(app, "resumeGame();"); await tick(200);
  console.log("  after resume     : phase", phase(), "marks", JSON.stringify(H("marks")),
              "markedAgainst", H("markedAgainst"), "relief", H("relief"));
  run(app, `h2Select(${ST}); h2Play();`); await tick(160);
  console.log("  pass to the ex-marked striker ->", phase(), ev(app,"S.tier"));
  run(app, "h2Reveal(); h2Judge(true);"); await tick(220);
  console.log("  after that pass  : phase", phase());
})();
