/* The tackle, driven rule by rule.
 *
 *     node _tests/tackle-test.js
 *
 * The tackle is the first rule in this mode that gives the DEFENDER something
 * to do on every pass, and almost all of it is invisible in the code: whether
 * a card went to the right man, whether a red actually takes him out of the
 * shape, whether a foul in the box becomes a penalty. So it is driven end to
 * end rather than spot-checked.
 *
 * It opens with h2NearestTo, because that function used to compare y and
 * nothing else and everything here stands on it: a card that says "the left
 * wing-back brought him down" is worth nothing if the app cannot tell the left
 * wing-back from the right one.
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

// squad indices, by the names Martijn uses for them
const GK = 0, LCB = 1, RCB = 2, LWB = 3, RWB = 4, SIX = 5, EIGHT = 6, TEN = 7, LW = 8, ST = 9, RW = 10;

(async () => {
  const app = makeInstance("tackle");
  await tick(340);
  const WC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"));
  run(app, "TEAMS.classic = " + JSON.stringify(WC));

  const phase = () => ev(app, "S.phase");
  const H = k => ev(app, "S.h2h." + k);
  const tier = () => ev(app, "S.tier");

  const start = async () => {
    run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); ' +
             'h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed = true; render();');
    await tick(150);
  };
  /* park the ball on a man with the pitch live, skipping the handoff */
  const place = async (w, at) => {
    run(app, `S.h2h.who=${w}; S.h2h.at=${at}; S.h2h.sel=null; S.h2h.mark=null; ` +
             `S.h2h.shooting=false; S.h2h.pen=false; S.phase="h_pick"; render();`);
    await tick(140);
  };

  /* ---------------------------------------------------------------- */
  console.log("--- who picks up a ball lost out wide (h2NearestTo in 2D) ---");
  await start();
  run(app, "h2TackleOn = false;");
  const collects = i => ev(app, `h2NearestTo(${i}, 0, 1)`);
  const rightWing = collects(RW), leftWing = collects(LW);
  check("a ball lost on the right and one lost on the left go to different men",
    rightWing !== leftWing, "both went to " + rightWing);
  check("lost on the right wing, their left wing-back steps out for it",
    rightWing === LWB, rightWing);
  check("lost on the left wing, their right wing-back does",
    leftWing === RWB, leftWing);
  check("and the rule that made the mode good survives: lost on your own line, their striker is through",
    collects(GK) === ST, collects(GK));
  check("lost at their striker, a centre-back has to build from scratch",
    [LCB, RCB].indexOf(collects(ST)) !== -1, collects(ST));

  /* ---------------------------------------------------------------- */
  console.log("\n--- the mark decides whose question it is ---");
  run(app, "h2TackleOn = true;");
  await place(0, GK);
  run(app, "S.h2h.mark = " + ST + "; h2Select(" + ST + "); h2Play();");
  await tick(150);
  check("marking the man he passes to is the defender's question", phase() === "h_tackle", phase());
  check("and it is the tackle, not the press", H("contest") === "tackle", H("contest"));
  check("asked at the tackle's own tier", tier() === ev(app, "H2_TACKLE_TIER"), tier());

  await place(0, GK);
  run(app, "S.h2h.mark = " + SIX + "; h2Select(" + ST + "); h2Play();");
  await tick(150);
  check("marking the wrong man leaves the question with the attacker", phase() === "h_q", phase());
  check("route one would have been a BALL question",
    ev(app, `h2TierFor(${GK},${ST})`) === "ball", ev(app, `h2TierFor(${GK},${ST})`));
  check("but the lunge left space, so it comes a tier cheaper", tier() === "extreme", tier());

  await place(0, GK);
  run(app, "S.h2h.mark = null; h2Select(" + ST + "); h2Play();");
  await tick(150);
  check("letting him play costs the attacker nothing", tier() === "ball", tier());

  /* ---------------------------------------------------------------- */
  console.log("\n--- winning it, and where the ball ends up ---");
  await place(0, GK);
  run(app, "S.h2h.mark = " + ST + "; h2Select(" + ST + "); h2Play(); h2TackleJudge(true);");
  await tick(160);
  check("the ball changes hands", H("who") === 1, H("who"));
  check("collected where the pass was GOING, not where it came from",
    [LCB, RCB].indexOf(H("at")) !== -1, H("at"));
  check("the mark is spent", H("mark") === null, H("mark"));

  /* the press wins it where the ball WAS, which is the difference */
  await place(0, GK);
  run(app, "S.h2h.safe = 99; S.h2h.mark = null; h2Select(" + LCB + "); h2Play();");
  await tick(150);
  check("the press still fires on a short ball", H("contest") === "press", H("contest"));
  run(app, "h2TackleJudge(true)");
  await tick(150);
  check("and the press takes it where the ball was, so their striker is through",
    H("at") === ST, H("at"));

  /* ---------------------------------------------------------------- */
  console.log("\n--- losing it is a foul, and the card goes to a man ---");
  await place(0, SIX);
  run(app, "S.h2h.mark = " + EIGHT + "; h2Select(" + EIGHT + "); h2Play(); h2TackleJudge(false);");
  await tick(160);
  check("the attacker keeps the ball", H("who") === 0, H("who"));
  check("and the pass goes through untouched, no question asked",
    H("at") === EIGHT, H("at"));
  const cards = ev(app, "JSON.stringify(S.h2h.cards[1])");
  check("somebody in the defending side is booked", cards !== "{}", cards);
  const booked = ev(app, "Object.keys(S.h2h.cards[1])[0]");
  check("and it is a man near the one he was marking, not the whole team",
    ev(app, "Object.keys(S.h2h.cards[1]).length") === 1, cards);
  check("nobody is off for a first yellow", ev(app, "S.h2h.off[1].length") === 0, ev(app, "S.h2h.off[1].length"));

  /* ---------------------------------------------------------------- */
  console.log("\n--- through the back of the front three is a penalty ---");
  await start();
  run(app, "h2TackleOn = true;");
  await place(0, SIX);
  run(app, "S.h2h.mark = " + ST + "; h2Select(" + ST + "); h2Play(); h2TackleJudge(false);");
  await tick(170);
  check("it is a spot kick, not a free kick", H("pen") === true, H("pen"));
  check("the attacker is shooting", H("shooting") === true, H("shooting"));
  check("and it is priced to go in", tier() === ev(app, "H2_PEN_TAKER"), tier());
  run(app, "h2Reveal(); h2Judge(true);");
  await tick(170);
  check("put away, the keeper gets one to stop it", phase() === "h_save", phase());
  check("and his is the unfair one", tier() === ev(app, "H2_PEN_KEEPER"), tier());

  /* ---------------------------------------------------------------- */
  console.log("\n--- a second yellow on the same man is a red ---");
  await start();
  run(app, "h2TackleOn = true; S.h2h.cards = [{}, {}]; S.h2h.off = [[], []];");
  const foul = async () => {
    await place(0, SIX);
    run(app, "S.h2h.mark = " + EIGHT + "; h2Select(" + EIGHT + "); h2Play(); h2TackleJudge(false);");
    await tick(160);
  };
  await foul();
  const man = +ev(app, "Object.keys(S.h2h.cards[1])[0]");
  await foul();
  check("the same man fouls again and goes", ev(app, "S.h2h.off[1].length") === 1, ev(app, "S.h2h.off[1].length"));
  check("and it is him", ev(app, "S.h2h.off[1][0]") === man, ev(app, "S.h2h.off[1][0]"));

  console.log("\n--- and a red card is a hole in the shape ---");
  run(app, `S.h2h.who = 1; S.h2h.at = ${GK}; S.h2h.off[1] = [${TEN}]; S.phase = "h_pick"; render();`);
  await tick(160);
  check("nobody can pass to him", ev(app, `(h2Select(${TEN}), S.h2h.sel)`) === null, ev(app, "S.h2h.sel"));
  check("he cannot shoot either", ev(app, `h2CanShoot(${TEN})`) === false, ev(app, `h2CanShoot(${TEN})`));
  check("he is not collecting turnovers", ev(app, `h2NearestTo(${TEN}, 0, 1)`) !== TEN, ev(app, `h2NearestTo(${TEN}, 0, 1)`));
  check("and he is not drawn on the pitch",
    (stage(app).match(/class="h2man [^"]*"/g) || []).length === 21,
    (stage(app).match(/class="h2man [^"]*"/g) || []).length);

  console.log("\n--- a keeper sent off is an outfield man in goal ---");
  run(app, `S.h2h.who = 0; S.h2h.at = ${ST}; S.h2h.off[1] = [${GK}]; S.h2h.pen = false; ` +
           `S.h2h.mark = null; S.phase = "h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true);`);
  await tick(180);
  check("the save is asked at the outfielder's tier", tier() === ev(app, "H2_SAVE_NOGK"), tier());

  /* ---------------------------------------------------------------- */
  console.log("\n--- the phone crosses the table on every pass ---");
  await start();
  run(app, "h2TackleOn = true; h2KickOff();");
  await tick(160);
  check("kick off hands it to the defender first", phase() === "h_hand", phase());
  check("and it is the defending man's card", H("hand.w") === 1, H("hand.w"));
  run(app, "h2HandGo()");
  await tick(140);
  check("he gets the private screen", phase() === "h_mark", phase());
  check("the attacker's eleven are on it", (stage(app).match(/h2markbtn/g) || []).length === 11,
    (stage(app).match(/h2markbtn/g) || []).length);
  run(app, "h2Mark(null)");
  await tick(140);
  check("choosing to sit off still returns the phone the same way", phase() === "h_hand", phase());
  check("and that card says put it down", H("hand.down") === true, H("hand.down"));
  run(app, "h2HandGo()");
  await tick(140);
  check("then the pitch comes back", phase() === "h_pick", phase());
  check("with nobody marked", H("mark") === null, H("mark"));
  check("and the pitch never says who was marked before the pass",
    stage(app).indexOf("h2markring") === -1, "the mark leaked onto the pitch");

  console.log("\n--- and it can be switched off, both rule sets ship ---");
  run(app, "h2TackleOn = false; S.h2h.who = 0; S.h2h.at = 0; h2Next();");
  await tick(150);
  check("with tackles off a turn goes straight to the pitch", phase() === "h_pick", phase());

  console.log(fails ? "\n" + fails + " FAILED" : "\nall green");
  process.exit(fails ? 1 : 0);
})();
