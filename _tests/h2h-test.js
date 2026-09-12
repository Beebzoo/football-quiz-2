/* One on One, driven rule by rule.

     node _tests/h2h-test.js

   The ladder is the mode, so it is checked position by position against the
   worked example rather than spot-checked. Everything else is directional:
   player 1 attacks the other way, so a sign error looks perfect for the home
   side and sends the away side backwards. Movement is tested from both ends. */
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
const tick = (ms = 190) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

// squad indices, by the names Martijn used
const GK = 0, LCB = 1, RCB = 2, LWB = 3, RWB = 4, SIX = 5, EIGHT = 6, TEN = 7, LW = 8, ST = 9, RW = 10;

(async () => {
  const app = makeInstance("pitch");
  await tick(340);
  /* the harness answers every fetch with a rejection, so the 2006 deck is put
     in by hand. It is the real file off disk, not a fixture, so the shape
     being driven is the shape that ships. */
  const WC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"));
  run(app, "WC06 = " + JSON.stringify(WC));

  const tier = (a, b) => ev(app, `h2TierFor(${a},${b})`);
  const pos = () => ev(app, "S.h2h.at");
  const squad = () => ev(app, "H2_SQUAD");
  // where the ball is drawn, as a percentage down the pitch
  const ballTop = () => {
    const m = stage(app).match(/class="h2ballwrap[^"]*" style="left:[\d.]+%;top:([\d.]+)%/);
    return m ? +m[1] : -1;
  };
  const who = () => ev(app, "S.h2h.who");
  const phase = () => ev(app, "S.phase");

  // a match with both countries already chosen, parked on the toss
  const start = async () => {
    run(app, 'S = freshState(["Martijn","Bram"], false, "h2h", 0); h2Start(); ' +
             'h2PickTeam("Netherlands"); h2PickTeam("Italy"); render();');
    await tick(180);
  };
  const place = async (w, at) => {
    run(app, `S.h2h.who=${w}; S.h2h.at=${at}; S.h2h.sel=null; S.h2h.shooting=false; S.h2h.tossed=true; S.phase="h_pick"; render();`);
    await tick(160);
  };
  const passTo = async (i, ok) => {
    run(app, `h2Select(${i})`); await tick(150);
    run(app, "h2Play()"); await tick(160);
    run(app, "h2Reveal()"); await tick(130);
    run(app, `h2Judge(${ok})`); await tick(200);
  };

  await start();

  console.log("--- the ladder from the keeper, as described ---");
  check("to a centre-back is Easy",      tier(GK, LCB)  === "easy",    tier(GK, LCB));
  check("to a wing-back is Normal",      tier(GK, LWB)  === "normal",  tier(GK, LWB));
  check("to the six is Hard",            tier(GK, SIX)  === "hard",    tier(GK, SIX));
  check("to the eight is Extreme",       tier(GK, EIGHT)=== "extreme", tier(GK, EIGHT));
  check("to the ten is Extreme",         tier(GK, TEN)  === "extreme", tier(GK, TEN));
  check("to the striker is a BALL",      tier(GK, ST)   === "ball",    tier(GK, ST));
  check("to a winger is a BALL",         tier(GK, LW)   === "ball",    tier(GK, LW));

  console.log("\n--- route one from the back, whatever the gap looks like ---");
  check("centre-back to the striker",    tier(LCB, ST)  === "ball",    tier(LCB, ST));
  check("centre-back to a winger",       tier(RCB, RW)  === "ball",    tier(RCB, RW));
  check("wing-back to the striker",      tier(LWB, ST)  === "ball",    tier(LWB, ST));
  check("but the six to the striker is not (he is not a defender)",
        tier(SIX, ST) !== "ball", tier(SIX, ST));

  console.log("\n--- shorter balls through the middle ---");
  check("six to the ten is Normal",      tier(SIX, TEN) === "normal",  tier(SIX, TEN));
  check("centre-back to the eight is Hard", tier(LCB, EIGHT) === "hard", tier(LCB, EIGHT));
  check("a ball backwards is always safe", tier(TEN, GK)  === "easy",   tier(TEN, GK));
  check("and so is a square one",        tier(LCB, RCB) === "easy",    tier(LCB, RCB));

  console.log("\n--- picking a country ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "h2h", 0); h2Start(); render();');
  await tick(180);
  check("it opens on the team picker", phase() === "h_teams", phase());
  check("all thirty two sides are offered",
    (stage(app).match(/class="h2teambtn"/g) || []).length === 32,
    (stage(app).match(/class="h2teambtn"/g) || []).length);
  check("every one of them has a kit colour",
    Object.values(WC).every(t => /^#[0-9A-Fa-f]{6}$/.test(t.kit || "")),
    Object.entries(WC).filter(([, t]) => !t.kit).map(([c]) => c).join(","));
  check("and eleven men", Object.values(WC).every(t => t.xi.length === 11), "a squad is not eleven");
  check("and a flag that is actually on disk",
    Object.values(WC).every(t => t.flag && fs.existsSync(path.join(REPO, "assets/natflags", t.flag + ".png"))),
    Object.entries(WC).filter(([, t]) => !t.flag || !fs.existsSync(path.join(REPO, "assets/natflags", t.flag + ".png"))).map(([c]) => c).join(","));
  check("the flags are on the picker",
    (stage(app).match(/class="h2flag"/g) || []).length === 32,
    (stage(app).match(/class="h2flag"/g) || []).length);
  check("England gets England, not the Union Jack",
    WC["England"].flag !== "gb", WC["England"].flag);
  check("Serbia and Montenegro gets its own flag, not modern Serbia",
    WC["Serbia and Montenegro"].flag !== "rs", WC["Serbia and Montenegro"].flag);
  run(app, 'h2PickTeam("Netherlands")'); await tick(160);
  check("the first pick is taken", ev(app, 'S.h2h.teams[0]') === "Netherlands", ev(app, "S.h2h.teams[0]"));
  check("still on the picker for the second man", phase() === "h_teams", phase());
  run(app, 'h2PickTeam("Netherlands")'); await tick(160);
  check("the same country cannot be taken twice", ev(app, 'S.h2h.teams[1]') === null, ev(app, "S.h2h.teams[1]"));
  run(app, 'h2PickTeam("Italy")'); await tick(160);
  check("two countries starts the toss", phase() === "h_toss", phase());

  console.log("\n--- the 2006 elevens ---");
  await start();
  await place(0, GK);
  check("the keeper is van der Sar", ev(app, "h2Who(0,0)") === "van der Sar", ev(app, "h2Who(0,0)"));
  check("the striker is van Nistelrooy", ev(app, "h2Who(9,0)") === "van Nistelrooy", ev(app, "h2Who(9,0)"));
  check("the ten is van der Vaart", ev(app, "h2Who(7,0)") === "van der Vaart", ev(app, "h2Who(7,0)"));
  check("Italy is the other side", ev(app, "h2Who(0,1)") === "Buffon", ev(app, "h2Who(0,1)"));
  check("the kit is the country's", ev(app, "h2Kit(0)") === WC["Netherlands"].kit, ev(app, "h2Kit(0)"));
  check("the men wear their names", stage(app).includes("van Bronckhorst"), "no names on the pitch");
  run(app, 'h2Select(' + SIX + ')'); await tick(150);
  check("and the pass is named after the man",
    stage(app).includes("Landzaat"), "the pass still talks about positions");

  console.log("\n--- the toss ---");
  await start();
  check("it opens on the toss", phase() === "h_toss", phase());
  check("nobody has called yet", stage(app).includes("call it"), "no call prompt");
  check("heads and tails are both offered",
    stage(app).includes("Heads") && stage(app).includes("Tails"), "a side is missing");
  run(app, 'h2Call("heads")'); await tick(160);
  check("the coin is in the air", ev(app, "S.h2h.flipping") === true, ev(app, "S.h2h.flipping"));
  check("and it is spinning on screen", stage(app).includes("h2coin flip"), "no flip animation");
  run(app, "h2Land()"); await tick(200);
  check("it lands on a side", ["heads", "tails"].includes(ev(app, "S.h2h.coin")), ev(app, "S.h2h.coin"));
  check("calling right wins it, calling wrong loses it",
    ev(app, "S.h2h.who") === (ev(app, "S.h2h.coin") === "heads" ? 0 : 1),
    ev(app, "S.h2h.coin") + " -> player " + who());
  check("the winner starts on his own goal line", pos() === GK, pos());
  run(app, "h2KickOff()"); await tick(180);
  check("kick off starts the match", phase() === "h_pick", phase());

  console.log("\n--- passing by tapping a man ---");
  await place(0, GK);
  check("twenty two men are out", (stage(app).match(/class="h2man/g) || []).length === 22,
    (stage(app).match(/class="h2man/g) || []).length);
  run(app, `h2Select(${SIX})`); await tick(150);
  check("tapping one shows who the ball is going to", stage(app).includes("Landzaat"), "no confirm bar");
  check("and names the level", stage(app).includes("Hard"), "no tier on the bar");
  run(app, "h2Play()"); await tick(160);
  check("playing it deals that level", ev(app, "S.tier") === "hard", ev(app, "S.tier"));
  run(app, "h2Reveal()"); await tick(130);
  run(app, "h2Judge(true)"); await tick(200);
  check("the ball arrives at the man you picked", pos() === SIX, pos());

  console.log("\n--- the same from the other end ---");
  await place(1, GK);
  await passTo(EIGHT, true);
  check("away: the ball reaches his eight", pos() === EIGHT && who() === 1, pos() + "/" + who());

  console.log("\n--- the camera sits behind whoever has the ball ---");
  await place(0, GK);
  const homeKeeper = ballTop();
  await place(1, GK);
  const awayKeeper = ballTop();
  check("both keepers are drawn at the near end",
    homeKeeper === awayKeeper && homeKeeper > 80, homeKeeper + " vs " + awayKeeper);
  await place(0, ST);
  const homeStriker = ballTop();
  await place(1, ST);
  check("and both strikers at the far end",
    homeStriker === ballTop() && homeStriker < 30, homeStriker + " vs " + ballTop());

  console.log("\n--- you can see who has it ---");
  await place(0, ST);
  check("the man on the ball stands in a ring",
    (stage(app).match(/class="h2ring"/g) || []).length === 1,
    (stage(app).match(/class="h2ring"/g) || []).length);
  {
    // the ball should be beside his boot, not sitting on top of him
    const manY = squad()[9].y;
    const m = stage(app).match(/class="h2ballwrap[^"]*" style="left:([\d.]+)%;top:([\d.]+)%/);
    const bx = m ? +m[1] : -1, by = m ? +m[2] : -1;
    check("the ball is next to him, not on him",
      Math.abs(bx - squad()[9].x) > 3 && by > manY,
      "ball " + bx + "," + by + " vs man " + squad()[9].x + "," + manY);
    check("and still on the grass", bx > 2 && bx < 98, bx);
  }
  await place(0, RW);
  {
    // the wide men tuck it infield rather than hanging it off the touchline
    const m = stage(app).match(/class="h2ballwrap[^"]*" style="left:([\d.]+)%/);
    check("a wide man keeps it infield", m && +m[1] < squad()[10].x, m && m[1]);
  }

  console.log("\n--- knocking it about ---");
  {
    /* The hole this rule exists to close: short balls alone walked the length
       of the pitch for free, and Easy mixed with Normal was the FASTEST route
       there is. So the streak counts both, and the threshold has to be low
       enough to fire on a four pass route. */
    const SQ = squad();
    const cheap = t => ev(app, "H2_SAFE").includes(t);
    let at = 0, hops = 0, guard = 0;
    while (SQ[at].line < 6 && guard++ < 20) {
      let best = null;
      for (let i = 0; i < 11; i++) {
        if (SQ[i].y >= SQ[at].y) continue;
        if (!cheap(tier(at, i))) continue;
        if (best === null || SQ[i].y < SQ[best].y) best = i;
      }
      if (best === null) break;
      at = best; hops++;
    }
    check("the fastest route on short balls alone is four passes",
      SQ[at].line === 6 && hops === 4, "reached line " + SQ[at].line + " in " + hops);
    check("so the tackle fires before it can finish",
      ev(app, "H2_TACKLE_AT") < hops, "threshold " + ev(app, "H2_TACKLE_AT") + " vs " + hops + " passes");
    check("and it counts Normal too, or you would just alternate",
      ev(app, "H2_SAFE.join(',')") === "easy,normal", ev(app, "H2_SAFE.join(',')"));
  }

  const safePass = async (i) => {
    run(app, "h2Select(" + i + ")"); await tick(140);
    run(app, "h2Play()"); await tick(150);
    if (phase() === "h_q") {
      run(app, "h2Reveal()"); await tick(120);
      run(app, "h2Judge(true)"); await tick(200);
    }
  };

  await start();
  await place(0, GK);
  check("nobody is on him yet", ev(app, "S.h2h.safe") === 0, ev(app, "S.h2h.safe"));
  await safePass(LCB);
  await safePass(LWB);
  await safePass(SIX);
  check("three short balls counted", ev(app, "S.h2h.safe") === 3, ev(app, "S.h2h.safe"));
  check("and the screen says he is on him", stage(app).includes("is on him"), "no warning");
  run(app, "h2Select(" + EIGHT + ")"); await tick(150);
  check("the ball you are about to play is marked contested",
    stage(app).includes("Contested"), "no contested marking");
  run(app, "h2Play()"); await tick(180);
  check("the fourth short ball brings him in", phase() === "h_tackle", phase());
  check("at the level a tackle costs", ev(app, "S.tier") === ev(app, "H2_TACKLE_TIER"), ev(app, "S.tier"));
  check("and it is named as his", stage(app).includes("comes in for it"), "not named");

  console.log("\n--- he wins it ---");
  run(app, "h2TackleReveal()"); await tick(130);
  run(app, "h2TackleJudge(true)"); await tick(240);
  check("possession flips", who() === 1, who());
  check("the streak dies with it", ev(app, "S.h2h.safe") === 0, ev(app, "S.h2h.safe"));
  check("and play is live again", phase() === "h_pick", phase());

  console.log("\n--- he misses, and is left on the floor ---");
  await start();
  await place(0, GK);
  await safePass(LCB); await safePass(LWB); await safePass(SIX);
  run(app, "h2Select(" + EIGHT + ")"); await tick(140);
  run(app, "h2Play()"); await tick(170);
  run(app, "h2TackleReveal()"); await tick(130);
  run(app, "h2TackleJudge(false)"); await tick(240);
  check("the pass goes straight through, no question asked",
    pos() === EIGHT && who() === 0, pos() + "/" + who());
  check("and he is still on him, so it does not buy a free run",
    ev(app, "S.h2h.safe") >= ev(app, "H2_TACKLE_AT"), ev(app, "S.h2h.safe"));

  console.log("\n--- committing to a real ball clears it ---");
  await start();
  await place(0, GK);
  await safePass(LCB); await safePass(LWB); await safePass(SIX);
  check("three short balls again", ev(app, "S.h2h.safe") === 3, ev(app, "S.h2h.safe"));
  check("a ball into the front three is not a short one", tier(SIX, ST) !== "easy", tier(SIX, ST));
  run(app, "h2Select(" + ST + ")"); await tick(140);
  run(app, "h2Play()"); await tick(160);
  check("so nobody comes in for it", phase() === "h_q", phase());
  run(app, "h2Reveal()"); await tick(120);
  run(app, "h2Judge(true)"); await tick(200);
  check("and the streak is cleared by committing", ev(app, "S.h2h.safe") === 0, ev(app, "S.h2h.safe"));

  await start();

  console.log("\n--- the scorebug ---");
  await place(0, GK);
  check("it shows the country codes, not the country names",
    stage(app).includes(">NED<") && stage(app).includes(">ITA<"),
    "no codes in the bug");
  check("every country in the deck has a real three letter code",
    Object.values(WC).every(t => /^[A-Z]{3}$/.test(t.abbr || "")),
    Object.entries(WC).filter(([, t]) => !/^[A-Z]{3}$/.test(t.abbr || "")).map(([c, t]) => c + "=" + t.abbr).join(","));
  check("and they are the real ones, not the first three letters",
    WC["Netherlands"].abbr === "NED" && WC["Germany"].abbr === "GER" &&
    WC["Ivory Coast"].abbr === "CIV" && WC["South Korea"].abbr === "KOR",
    [WC["Netherlands"].abbr, WC["Germany"].abbr, WC["Ivory Coast"].abbr, WC["South Korea"].abbr].join(","));
  check("including the side that no longer exists",
    WC["Serbia and Montenegro"].abbr === "SCG", WC["Serbia and Montenegro"].abbr);
  check("both flags are in the bar", (stage(app).match(/class="sb-flag"/g) || []).length === 2,
    (stage(app).match(/class="sb-flag"/g) || []).length);
  check("the side on the ball is lit", /class="sb-t on"/.test(stage(app)), "nothing lit");
  await place(1, GK);
  check("and it moves with possession", /class="sb-t away on"/.test(stage(app)), "the light did not move");

  console.log("\n--- the ground ---");
  await place(0, ST);
  run(app, "h2Shoot()"); await tick(160);
  run(app, "h2Reveal()"); await tick(130);
  run(app, "h2Judge(true)"); await tick(180);
  const scene = stage(app);
  check("there is a crowd behind the goal", scene.includes("g3-stand"), "no stand");
  check("boards along the back of the pitch", scene.includes("g3-ads"), "no boards");
  check("floodlights over it", (scene.match(/g3-flood/g) || []).length >= 2,
    (scene.match(/g3-flood/g) || []).length);
  check("and light falling on the grass", scene.includes("g3-wash"), "no wash");
  check("camera flashes ready in the stand",
    (scene.match(/class="g3-flash"/g) || []).length === 1 && scene.includes("animation-delay"),
    "no flashes");

  console.log("\n--- the two men ---");
  check("both are drawn figures, not shirts",
    (scene.match(/class="fig /g) || []).length === 2,
    (scene.match(/class="fig /g) || []).length);
  check("the keeper has a head, arms and legs",
    /class="fig gk"[\s\S]{0,400}f-head[\s\S]{0,400}f-arm[\s\S]{0,400}f-leg/.test(scene),
    "the keeper is missing parts");
  check("so does the man who hit it",
    /class="fig str"[\s\S]{0,400}f-head[\s\S]{0,400}f-torso[\s\S]{0,400}f-leg/.test(scene),
    "the striker is missing parts");
  check("the keeper wears the other country's kit",
    scene.includes("--kit:" + WC["Italy"].kit), "wrong keeper kit");
  check("and they are named", scene.includes("Buffon") && scene.includes("van Nistelrooy"),
    "the men are anonymous");

  run(app, "h2SaveReveal()"); await tick(130);
  run(app, "h2SaveJudge(false)"); await tick(220);
  check("a goal puts the scene in its scored state",
    /class="g3 scored"/.test(stage(app)), "not scored");
  run(app, "h2AfterStrike()"); await tick(260);
  run(app, "h2KickOn()"); await tick(260);
  /* that was a real goal, so the match is 1-0 now. Everything below assumes a
     fresh one, so give it one rather than leaving a score lying around. */
  await start();

  console.log("\n--- sound ---");
  await place(0, ST);
  check("it is on by default", ev(app, "h2Sound") === true, ev(app, "h2Sound"));
  check("and there is a switch for it", stage(app).includes("Sound off"), "no sound toggle");
  run(app, "h2ToggleSound()"); await tick(160);
  check("turning it off sticks", ev(app, "h2Sound") === false, ev(app, "h2Sound"));
  check("and the switch says so", stage(app).includes("Sound on"), "the label did not flip");
  check("it is remembered", ev(app, 'localStorage.getItem("ball2-mute")') === "1",
    ev(app, 'localStorage.getItem("ball2-mute")'));
  /* The harness has no Audio constructor, which is the point: every call is
     wrapped, so a browser that refuses to play must never take the game down
     with it. */
  check("a muted goal roar is silent, not an exception",
    ev(app, '(function(){ try{ h2Sfx("goal", 1); return "fine"; }catch(e){ return "threw: "+e.message; } })()') === "fine",
    ev(app, '(function(){ try{ h2Sfx("goal", 1); return "fine"; }catch(e){ return "threw: "+e.message; } })()'));
  run(app, "h2ToggleSound()"); await tick(160);
  check("and back on again", ev(app, "h2Sound") === true, ev(app, "h2Sound"));
  check("an unplayable one does not throw either",
    ev(app, '(function(){ try{ h2Sfx("goal", 1); h2CrowdStart(); h2CrowdStop(); return "fine"; }catch(e){ return "threw: "+e.message; } })()') === "fine",
    ev(app, '(function(){ try{ h2Sfx("goal", 1); h2CrowdStart(); h2CrowdStop(); return "fine"; }catch(e){ return "threw: "+e.message; } })()'));
  {
    const sfx = ["goal", "crowd"];
    check("both files are actually there",
      sfx.every(f => fs.existsSync(path.join(REPO, "assets/sfx", f + ".wav"))),
      sfx.filter(f => !fs.existsSync(path.join(REPO, "assets/sfx", f + ".wav"))).join(","));
    const kb = sfx.map(f => fs.statSync(path.join(REPO, "assets/sfx", f + ".wav")).size / 1024);
    check("and small enough to precache (under 1MB together)",
      kb.reduce((a, b) => a + b, 0) < 1024, kb.map(k => k.toFixed(0) + "KB").join(" + "));
  }

  console.log("\n--- the men themselves ---");
  await place(0, GK);
  check("they wear a squad number", /<i>\d+<\/i>/.test(stage(app)), "no numbers on the shirts");
  check("van Persie wears 17", ev(app, "h2No(10,0)") === 17 || ev(app, "h2No(8,0)") === 17 ||
    squad().some((_, i) => ev(app, "h2No(" + i + ",0)") === 17), "17 is not in the Dutch eleven");
  check("nobody has a floating head any more", !stage(app).includes("h2head"), "heads are still drawn");
  /* the pitch used to draw little jerseys and the goal scene drew footballers.
     They are the same component now, so the pitch men have torsos and legs. */
  check("the pitch men are drawn figures, same as in the goal",
    (stage(app).match(/class="fig pm"/g) || []).length === 22,
    (stage(app).match(/class="fig pm"/g) || []).length);
  check("with a torso carrying the number", stage(app).includes("f-torso"), "no torso");
  await place(0, GK);
  run(app, "h2Select(" + SIX + ")"); await tick(140);
  run(app, "h2Play()"); await tick(150);
  run(app, "h2Reveal()"); await tick(120);
  run(app, "h2Judge(true)"); await tick(120);
  check("a pass leaves a trail behind the ball",
    (stage(app).match(/h2ballwrap[^"]*ghost/g) || []).length === 2,
    (stage(app).match(/h2ballwrap[^"]*ghost/g) || []).length);
  check("and the ball is lofted, higher for a longer ball",
    /--lift:\d+px/.test(stage(app)), "no arc on the pass");
  check("the eight and the ten are off the centre line, and not on top of each other",
    squad()[6].x !== 50 && squad()[7].x !== 50 && squad()[6].x !== squad()[7].x,
    JSON.stringify([squad()[6].x, squad()[7].x]));
  check("but the ladder still only reads the y axis",
    tier(GK, EIGHT) === "extreme" && tier(GK, SIX) === "hard",
    tier(GK, EIGHT) + "/" + tier(GK, SIX));

  console.log("\n--- losing it ---");
  await place(0, GK);
  await passTo(LCB, false);
  check("possession flips", who() === 1, who());
  check("and he collects it on his front line, through on goal",
    ev(app, "H2_SQUAD[S.h2h.at].line") === 6, ev(app, "H2_SQUAD[S.h2h.at].long"));
  await place(0, ST);
  await passTo(LW, false);
  check("lose it up their end and they start at the back",
    ev(app, "H2_SQUAD[S.h2h.at].line") <= 1, ev(app, "H2_SQUAD[S.h2h.at].long"));

  console.log("\n--- shooting ---");
  await place(0, SIX);
  check("the six cannot shoot", !stage(app).includes("Shoot ·"), "a shot was offered");
  await place(0, ST);
  check("the striker can", stage(app).includes("Shoot ·"), "no shot offered");
  check("and it is a Hard chance", ev(app, "H2_SHOT[9]") === "hard", ev(app, "H2_SHOT[9]"));
  check("a winger's angle is worse", ev(app, "H2_SHOT[8]") === "extreme", ev(app, "H2_SHOT[8]"));
  run(app, "h2Shoot()"); await tick(170);
  check("the shot is on", ev(app, "S.h2h.shooting") === true, ev(app, "S.h2h.shooting"));
  run(app, "h2Reveal()"); await tick(130);
  run(app, "h2Judge(true)"); await tick(190);
  check("a clean strike brings the keeper out", phase() === "h_save", phase());
  check("who always faces the same level", ev(app, "S.tier") === "hard", ev(app, "S.tier"));
  run(app, "h2SaveReveal()"); await tick(130);
  run(app, "h2SaveJudge(true)"); await tick(220);
  /* Neither outcome lands until the strike has been watched: the camera drops
     behind the striker and you see the ball hit the net or the keeper. */
  check("the camera goes behind the striker", phase() === "h_strike", phase());
  check("there is a goal with a net in it", stage(app).includes("g3-net"), "no net");
  check("the keeper is in it", stage(app).includes("g3-keeper"), "no keeper");
  check("and so is the man who hit it", stage(app).includes("g3-striker"), "no striker");
  check("it says SAVED", stage(app).includes("SAVED"), "no call");
  check("nothing has changed hands yet", who() === 0, who());
  run(app, "h2AfterStrike()"); await tick(240);
  check("a save gives him the ball on his line", who() === 1 && pos() === GK, who() + "/" + pos());
  check("and nobody scored", ev(app, "S.players[0].score") === 0, ev(app, "S.players[0].score"));

  console.log("\n--- goals, and first to two ---");
  const score = async () => {
    await place(0, ST);
    run(app, "h2Shoot()"); await tick(160);
    run(app, "h2Reveal()"); await tick(130);
    run(app, "h2Judge(true)"); await tick(160);
    run(app, "h2SaveReveal()"); await tick(130);
    run(app, "h2SaveJudge(false)"); await tick(240);
    run(app, "h2AfterStrike()"); await tick(260);
  };
  const kickOn = async () => { run(app, "h2KickOn()"); await tick(280); };

  // the strike, watched, before any of it counts
  await place(0, ST);
  run(app, "h2Shoot()"); await tick(160);
  run(app, "h2Reveal()"); await tick(130);
  run(app, "h2Judge(true)"); await tick(160);
  check("the keeper is asked over the goal, not the tactics board",
    stage(app).includes("g3-net") && !stage(app).includes("h2pitch"), "wrong view for the save");
  run(app, "h2SaveReveal()"); await tick(130);
  run(app, "h2SaveJudge(false)"); await tick(240);
  check("a goal is watched before it is counted",
    phase() === "h_strike" && ev(app, "S.players[0].score") === 0,
    phase() + "/" + ev(app, "S.players[0].score"));
  check("it says GOAL over the net", stage(app).includes("GOAL"), "no call");
  run(app, "h2AfterStrike()"); await tick(260);
  check("that is one", ev(app, "S.players[0].score") === 1, ev(app, "S.players[0].score"));
  /* The goal stops the game where it was scored: possession does NOT change
     until the celebration is over, so the eleven who scored are still the ones
     the camera is behind and still the ones in colour. */
  check("the ground stops for it", phase() === "h_goal", phase());
  check("the scorer still has the camera", who() === 0, who());
  check("the word lands on the pitch", stage(app).includes("h2goalcry"), "no GOAL");
  check("and the eleven celebrate", stage(app).includes("h2pitch") && stage(app).includes(" cele"), "nobody celebrated");
  check("the net takes it", stage(app).includes("h2net"), "no net flash");
  await kickOn();
  check("then the man who conceded restarts on his own line", who() === 1 && pos() === GK, who() + "/" + pos());
  check("and play is live again", phase() === "h_pick", phase());

  await score();
  check("and two wins it", ev(app, "S.players[0].score") === 2, ev(app, "S.players[0].score"));
  check("the winner gets his celebration too", phase() === "h_goal", phase());
  await kickOn();
  check("the match is over", phase() === "results", phase());
  check("it is in the record book", ev(app, "history().length") >= 1, ev(app, "history().length"));

  console.log(fails ? "\n" + fails + " FAILED" : "\nall green");
  process.exit(fails ? 1 : 0);
})();
