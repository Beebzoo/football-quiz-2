/* PLAYING THE COMPUTER.
 *
 *     node _tests/ai-test.js
 *
 * The opponent is a policy over choices the rules already offer plus a dice
 * roll per tier, which means there is very little of it to get wrong and
 * exactly two ways it could be badly wrong:
 *
 *   IT COULD STOP. Every decision point in a match is a phase, and a phase the
 *   driver does not know about is a match that sits there forever with nobody
 *   to tap anything. So the real test is not a unit test at all: it is a whole
 *   match, driven only by the clock, run to the final whistle.
 *
 *   IT COULD CHEAT. The dice are the difficulty, so they have to be the
 *   difficulty: ten thousand rolls at each tier, against the published number.
 *
 * And one thing that is not a bug but would feel like one: the phone must
 * never be handed to a computer.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

(async () => {
  const app = makeInstance("ai");
  await tick(340);
  run(app, "TEAMS.wc2006 = " + JSON.stringify(R("assets/wc2006/index.json")));
  /* THE COMPUTER'S PAUSE IS FOR A HUMAN'S EYES. A test playing four hundred
     questions cannot wait two-thirds of a second for each of them. */
  run(app, "AI_BEAT = 4;");
  run(app, 'DECKS["classic-mc"] = ' + JSON.stringify(R("assets/mc/index.json")) + ";");
  for (const [id, dir] of [["seriea", "seriea"], ["laliga", "laliga"], ["premier", "premier"],
                           ["ere", "eredivisie"], ["bundesliga", "bundesliga"]])
    run(app, "DECKS[" + JSON.stringify(id) + "] = " + JSON.stringify(R("assets/" + dir + "/index.json")) + ";");

  console.log("--- the dice are the difficulty ---");
  for (const lvl of ["sunday", "ere", "champs"]) {
    for (const t of ["easy", "hard", "ball"]) {
      const want = ev(app, "AI_LEVELS." + lvl + ".p." + t);
      /* set up with run, measure with ev: ev wraps its argument in parentheses,
         so a statement and an expression cannot travel together */
      run(app, 'S = freshState(["You","It"], false, "classic", 0, "pitch", true); ' +
        'S.players[1].ai = "route1"; S.players[1].level = "' + lvl + '";');
      const got = ev(app,
        "(() => { let n = 0; for(let i=0;i<10000;i++) if(aiAnswer(1, '" + t + "')) n++; return n / 10000; })()");
      check(lvl + " at " + t + " lands on " + want, Math.abs(got - want) < 0.02,
        got.toFixed(3) + " wanted " + want);
    }
  }

  console.log("\n--- and a whole match plays itself ---");
  /* THE REAL TEST. A phase the driver does not know about is a match that sits
     there forever, and no unit test finds that: only running one does. */
  const play = async (who) => {
    run(app, 'S = freshState(["You","It"], false, "classic", 0, "' + who + '", true); ' +
      'S.players[1].ai = "route1"; S.players[1].level = "ere"; h2Start(); render();');
    /* the human is player 0, so the test taps for him and the driver taps for
       the computer; everything else is the clock */
    let guard = 0, handSeen = false;
    while (ev(app, "S.phase") !== "results" && guard++ < 4000) {
      await tick(8);
      const p = ev(app, "S.phase");
      if (p === "h_hand" && ev(app, "S.h2h.hand && S.h2h.hand.w") === 1) handSeen = true;
      const mine = () => {
        const H = ev(app, "S.h2h");
        if (!H) return false;
        switch (p) {
          case "h_teams": return (H.teams[0] == null ? 0 : 1) === 0;
          case "h_squad": return (H.picking || 0) === 0;
          case "h_shape": return (H.shaping || 0) === 0;
          case "h_traits": return (H.tset || 0) === 0;
          case "h_toss": return !H.tossed ? true : H.who === 0;
          case "h_hand": return (H.hand && H.hand.w) === 0;
          case "h_mark": return H.who === 1;
          case "h_pick": case "h_q": case "h_judge": return H.who === 0;
          case "h_save": case "h_sjudge": case "h_tackle": case "h_tjudge": return H.who === 1;
          case "h_sub": return H.sub && H.sub.w === 0;
          case "h_ft": return true;
          case "h_pens": return H.who === 0;
          default: return false;
        }
      };
      if (!mine()) continue;
      /* the human plays like a very ordinary person: the first legal thing */
      run(app, "(() => { const H = S.h2h; switch(S.phase){" +
        "case 'h_teams': { const n = Object.keys(h2Pool()||{}).filter(c => !H.teams.includes(c)); " +
        "  if(n.length) h2PickTeam(n[0]); return; }" +
        "case 'h_squad': return h2SquadDone();" +
        "case 'h_shape': return h2ShapeDone();" +
        "case 'h_traits': return h2TraitsDone();" +
        "case 'h_toss': return H.tossed ? h2KickOff() : (H.flipping ? null : h2Call('heads'));" +
        "case 'h_hand': return h2HandGo();" +
        "case 'h_mark': return h2MarksDone(true);" +
        "case 'h_pick': { for(let i=0;i<11;i++) if(i !== H.at && !h2IsOff(H.who,i)){ h2Select(i); h2Play(); return; } return; }" +
        "case 'h_q': return h2Reveal();" +
        "case 'h_judge': return h2Judge(Math.random() < .5);" +
        "case 'h_save': return h2SaveReveal();" +
        "case 'h_sjudge': return h2SaveJudge(Math.random() < .5);" +
        "case 'h_tackle': return h2TackleReveal();" +
        "case 'h_tjudge': return h2TackleJudge(Math.random() < .5);" +
        "case 'h_sub': return h2SubDecline();" +
        "case 'h_ft': return h2AfterWhistle ? h2AfterWhistle() : endGame();" +
        "case 'h_pens': return h2SoKick();" +
        "} })();");
    }
    return { guard, handSeen, phase: ev(app, "S.phase"), min: ev(app, "S.h2h && S.h2h.min") };
  };

  const one = await play("pitch");
  check("One on One against the computer reaches the end", one.phase === "results",
    one.phase + " after " + one.guard + " ticks");
  check("and the phone was never handed to it", !one.handSeen, "it was");
  const dug = await play("manager");
  check("The Dugout against the computer reaches the end too", dug.phase === "results",
    dug.phase + " after " + dug.guard + " ticks");
  check("and the clock actually ran", (dug.min || 0) > 0, dug.min);

  console.log("\n--- the personalities do what they say ---");
  const setUp = (id, shape) => run(app,
    'S = freshState(["You","It"], false, "classic", 0, "manager", true); ' +
    'S.players[1].ai = "' + id + '"; S.players[1].level = "ere"; h2Start(); ' +
    'h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed = true; ' +
    'S.h2h.form = ["4-2-3-1","' + shape + '"]; S.h2h.who = 1; S.h2h.at = 0; ' +
    'S.h2h.sel = null; S.h2h.markedAgainst = 1; S.phase = "h_pick";');
  /* ROUTE ONE goes to the front line from anywhere, which is the simplest
     policy and the funniest to lose to. */
  setUp("route1", "4-4-2");
  const r1 = ev(app, "aiPass()");
  check("Route One picks a man on the front line",
    ev(app, "h2Shape(1)[" + r1 + "].line") === 6, r1 + " is on line " + ev(app, "h2Shape(1)[" + r1 + "].line"));
  /* THE BUS never plays above Normal, which is what teaches you the press. */
  setUp("bus", "5-3-2");
  let over = 0;
  for (let at = 0; at < 11; at++) {
    run(app, "S.h2h.at = " + at + "; S.h2h.sel = null;");
    const to = ev(app, "aiPass()");
    if (to == null) continue;
    const t = ev(app, "h2Priced(" + at + "," + to + ")");
    const safe = ev(app, "H2_SAFE").indexOf(t) > -1;
    /* only counted when a safe ball was actually available to him */
    const any = ev(app, "(() => { for(let i=0;i<11;i++){ if(i===" + at + ") continue; " +
      "if(H2_SAFE.indexOf(h2Priced(" + at + ", i)) > -1) return true; } return false; })()");
    if (!safe && any) over++;
  }
  check("The Bus never goes above Normal while a Normal is on", over === 0, over + " times");
  /* AND NOBODY PICKS A MAN WHO IS NOT ON THE PITCH. */
  setUp("route1", "4-4-2");
  run(app, "S.h2h.off = [[], [9, 10]]; S.h2h.at = 0; S.h2h.sel = null;");
  const pick = ev(app, "aiPass()");
  check("a sent-off man is never chosen", pick !== 9 && pick !== 10, pick);

  console.log("\n--- and it never plays a human's match ---");
  run(app, 'S = freshState(["A","B"], false, "classic", 0, "pitch", true); h2Start(); render();');
  await tick(400);
  check("two humans are left alone", ev(app, "S.phase") === "h_teams", ev(app, "S.phase"));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
