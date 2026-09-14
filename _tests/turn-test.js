/* WHOSE TURN IT IS, AND WHAT HE JUST SAID.
 *
 *     node _tests/turn-test.js
 *
 * Everything here is about a solo match being a match rather than a screen that
 * changes by itself.
 *
 *   THE CAPTION. Every phase the computer acts in has to name him, because the
 *   only other tell that it is not your turn is the screen changing, and the
 *   screen changing is also what happens when it IS your turn. The table in
 *   h2ActorOf has to agree with the one in aiTick, and the cheapest way to
 *   keep them agreeing is to park the match on each phase in turn and ask.
 *
 *   THE MARKS. He sets them on a screen you used to be left sitting on, with
 *   his marks tappable and his line buttons live. The mark is the one secret
 *   in the mode, so there is nothing on that screen now, and nothing means
 *   nothing: not a mark button, not a line button, not his bench.
 *
 *   THE ANSWER. He says which option he took before the verdict stamps, and
 *   the two have to be the same fact every single time. They used to be two
 *   dice thrown a beat apart, so this rolls a lot of them.
 *
 *   THE DOTS. They tick while a beat is running and at no other time, which is
 *   not the same thing as ticking while it is his screen: a goal is his screen
 *   and nobody is deciding anything on it.
 *
 * Reuses the stub DOM from mp-test.js like the rest of the suite. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const stage = c => (c.__els["stage"] ? c.__els["stage"].innerHTML : "");
const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

const GK = 0, ST = 9;
const AI = "Route One";

(async () => {
  const app = makeInstance("turn");
  await tick(340);
  run(app, "TEAMS.wc2006 = " + JSON.stringify(R("assets/wc2006/index.json")) + ";");
  run(app, 'DECKS["classic-mc"] = ' + JSON.stringify(R("assets/mc/index.json")) + ";");
  /* AI_BEAT is the reference the bands are measured against, so dropping it to
     four squeezes the whole table to about a hundred and fiftieth of itself.
     His pauses are for a human's eyes and this test has none. */
  run(app, "AI_BEAT = 4;");
  /* nothing left ticking from the section before, so every wait below is the
     one the test is actually watching */
  const quiet = () => run(app, "clearTimeout(aiTimer); clearTimeout(h2StrikeHold); clearTimeout(h2GoalHold);");

  /* One on One, Pick One, against Route One, which is the only way a solo
     match can be played today: index.html forces mc on for every AI game. */
  const solo = async (play) => {
    quiet();
    run(app, 'S = freshState(["Martijn","' + AI + '"], false, "classic", 0, "' + (play || "pitch") + '", true); ' +
             'S.players[1].ai = "route1"; S.players[1].level = "ere"; h2Start(); ' +
             'h2AsActor(() => { h2PickTeam("Netherlands"); h2PickTeam("Italy"); }); ' +
             'S.h2h.tossed = true; S.h2h.who = 0; S.h2h.at = ' + GK + '; S.h2h.markedAgainst = 0;');
    await tick(60);
  };
  const line = ph => {
    const t = ev(app, "h2TurnLine(" + JSON.stringify(ph) + ")");
    return t ? t.line : null;
  };

  console.log("--- the caption names him on every phase he acts in ---");
  await solo("manager");
  run(app, "h2TackleOn = true;");
  /* Each row is a phase and the state that makes the computer the man the
     screen is waiting on, which is the same state aiTick would act on. */
  const PHASES = [
    ["h_teams",  'S.h2h.teams = ["Netherlands", null];'],
    ["h_squad",  "S.h2h.picking = 1;"],
    ["h_shape",  "S.h2h.shaping = 1;"],
    ["h_traits", "S.h2h.tset = 1;"],
    ["h_toss",   "S.h2h.tossed = true; S.h2h.who = 1;"],
    ["h_mark",   "S.h2h.who = 0;"],
    ["h_pick",   "S.h2h.who = 1; S.h2h.at = " + GK + ";"],
    ["h_q",      "S.h2h.who = 1;"],
    ["h_judge",  "S.h2h.who = 1; S.h2h.pick = null;"],
    ["h_aim",    "S.h2h.who = 1;"],
    ["h_dive",   "S.h2h.who = 0;"],
    ["h_tackle", "S.h2h.who = 0;"],
    ["h_tjudge", "S.h2h.who = 0; S.h2h.pick = null;"],
    ["h_sub",    "S.h2h.sub = {kind:'q', w:1, slot:" + ST + "};"],
    ["h_pens",   "S.h2h.so = {first:1, kicks:[[],[]], n:0};"],
  ];
  for (const [ph, set] of PHASES) {
    run(app, set);
    const got = line(ph);
    check(ph + " names him", !!got && got.indexOf(AI) === 0, got);
    check(ph + " says it is his", ev(app, "aiIsOn(h2ActorOf(" + JSON.stringify(ph) + "))") === true,
      ev(app, "h2ActorOf(" + JSON.stringify(ph) + ")"));
  }
  /* THE THREE THE PLAN ASKED FOR, word for word, because they are the voice of
     the thing and not a placeholder. */
  run(app, "S.h2h.who = 1; S.h2h.at = " + GK + ";");
  check('"' + AI + ' has it on ..." on his ball',
    /^Route One has it on .+/.test(line("h_pick")), line("h_pick"));
  check('"' + AI + ' is reading it..." while he reads',
    line("h_q") === AI + " is reading it...", line("h_q"));
  run(app, "S.h2h.pick = null; S.mc = false;");
  check('"' + AI + ' is thinking..." while he answers',
    line("h_judge") === AI + " is thinking...", line("h_judge"));
  run(app, "S.mc = true;");
  /* and nobody is named on a hold, because nobody is deciding anything */
  for (const ph of ["h_goal", "h_strike", "h_ft", "h_hand"])
    check(ph + " names nobody", line(ph) === null, line(ph));

  console.log("\n--- and your ball is announced once ---");
  await solo();
  run(app, "h2TackleOn = false;");
  run(app, 'S.h2h.who = 0; S.h2h.at = ' + GK + '; S.h2h.sel = null; S.phase = "h_pick"; h2Opened = 1; render();');
  await tick(60);
  check("the first render of his possession says Your ball",
    stage(app).indexOf("Your ball.") > -1, stage(app).indexOf("h2where"));
  check("and still says who has it", stage(app).indexOf("Martijn has it on") > -1, "no line");
  run(app, "render();");
  check("the second render does not say it again",
    stage(app).indexOf("Your ball.") === -1, "said twice");
  /* READ BEFORE THE BEAT LANDS. His own possession is four milliseconds long
     in this harness, so anything awaited here is the screen after the pass. */
  run(app, 'S.h2h.who = 1; S.h2h.at = ' + GK + '; render();');
  check("his possession opens with his name on the ball",
    stage(app).indexOf(AI + " has it on") > -1, "no line");
  quiet();
  /* A SECOND MATCH IS STILL A FIRST POSSESSION. h2Opened lives outside S so it
     survives the last match as well as a reload, and the opening ball is the
     one screen this whole line exists for. */
  await solo();
  run(app, 'S.h2h.who = 0; S.h2h.at = ' + GK + '; S.h2h.sel = null; S.phase = "h_pick"; render();');
  await tick(60);
  check("a fresh match announces it again", stage(app).indexOf("Your ball.") > -1, "silent");
  /* two humans are left exactly as they were */
  quiet();
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", true); h2Start(); ' +
           'h2AsActor(() => { h2PickTeam("Netherlands"); h2PickTeam("Italy"); }); S.h2h.tossed = true; ' +
           'S.h2h.who = 0; S.h2h.at = ' + GK + '; S.h2h.markedAgainst = 0; S.phase = "h_pick"; h2Opened = 1; render();');
  await tick(60);
  check("a match between two people is not told whose ball it is",
    stage(app).indexOf("Your ball.") === -1 && stage(app).indexOf("Martijn has it on") > -1, "changed");

  console.log("\n--- the human never sees his marks ---");
  await solo();
  run(app, "h2TackleOn = true;");
  run(app, 'S.h2h.who = 0; S.h2h.at = ' + GK + '; S.h2h.marks = []; S.h2h.markedAgainst = null; ' +
           'S.phase = "h_mark"; render();');
  const card = stage(app);
  check("he gets a card, not the private screen", card.indexOf("h2wait") > -1, "no card");
  check("the card names him", card.indexOf(AI) > -1, "no name");
  check("there is nothing on it to tap", card.indexOf("onclick") === -1,
    (card.match(/onclick="[^"(]*/g) || []).join(","));
  check("no mark buttons", card.indexOf("h2Mark(") === -1, "marks were offered");
  check("no line buttons", card.indexOf("h2SetLine") === -1, "the line was offered");
  check("no way to finish his half-minute for him", card.indexOf("h2MarksDone") === -1, "done was offered");
  check("and not his bench either", card.indexOf("h2SubWant") === -1, "the bench was offered");
  /* the men themselves are not on it: no name, no shirt number, nothing to
     count off against the two he is about to pick */
  const theirs = ev(app, "JSON.stringify([...Array(11).keys()].map(i => h2Who(i, 0)))");
  check("none of the attacker's men are printed on it",
    JSON.parse(theirs).every(n => card.indexOf(n) === -1), "a man was named");
  await tick(120);
  check("the beat sets his marks and hands the ball back",
    ev(app, "S.phase") === "h_pick" && ev(app, "S.h2h.marks.length") === 2,
    ev(app, "S.phase") + " marks=" + ev(app, "JSON.stringify(S.h2h.marks)"));
  check("and the marks stay off the pitch", stage(app).indexOf("h2markring") === -1, "they leaked");

  console.log("\n--- and his half-minute is not run twice ---");
  /* THIS IS A GUARD ON SOMEBODY ELSE'S FIX, kept because the failure it
     describes is expensive and invisible. The mark callback renders on its way
     through, once for the line and once per mark, and every render re-enters
     aiTick, which sees h_mark still on the screen and arms another beat behind
     the one that is running. h2MarksDone then hands the ball to the human,
     aiTick finds him on it and arms nothing, so nothing cancels the beat that
     was queued mid-callback and it used to survive into his possession and run
     the whole thing again: the line set twice, h2MarksDone handing back a tier
     of relief the attacker may already have spent, and h2Mark toggling, which
     means the second pass takes both marks straight back off and the computer
     defends the whole possession unmarked.

     aiLater cues every beat on the state it was armed from and drops it if
     that state has moved, which covers this and every other call site at once.
     If that cue is ever weakened, this is the test that says so. */
  run(app, 'S.h2h.who = 0; S.h2h.marks = []; S.h2h.markedAgainst = null; S.phase = "h_mark"; render();');
  await tick(120);
  const marksAfter = ev(app, "JSON.stringify(S.h2h.marks)");
  run(app, "S.h2h.relief = false;");
  await tick(140);
  check("his two marks are still on", ev(app, "JSON.stringify(S.h2h.marks)") === marksAfter &&
    ev(app, "S.h2h.marks.length") === 2, marksAfter + " then " + ev(app, "JSON.stringify(S.h2h.marks)"));
  check("the ball stays with the attacker", ev(app, "S.phase") === "h_pick", ev(app, "S.phase"));
  check("and no second tier of relief is handed back", ev(app, "S.h2h.relief") === false,
    ev(app, "S.h2h.relief"));

  console.log("\n--- his question, answered on the clock ---");
  /* ONE ROUND WITH REAL BEATS, to prove the driver is wired to all of it: he
     reads it, the reading screen is his and dead, then he answers and the line
     with his name on it is on the screen before the verdict is handed over.
     A slow beat, because the reading screen only exists for the length of one
     and at four milliseconds the test reads whatever came after it. */
  await solo();
  run(app, "h2TackleOn = false; S.h2h.subs = [0,0]; AI_BEAT = 150;");
  run(app, 'S.h2h.who = 1; S.h2h.at = ' + GK + '; S.h2h.sel = ' + ST + '; S.h2h.pick = null; ' +
           'S.h2h.markedAgainst = 1; h2Play();');
  check("his ball put a question on the screen", ev(app, "S.phase") === "h_q", ev(app, "S.phase"));
  const q1 = stage(app);
  check("his four options are on the screen", (q1.match(/class="h2opt/g) || []).length === 4,
    (q1.match(/class="h2opt/g) || []).length);
  check("and none of them can be tapped for him", q1.indexOf("h2McPick") === -1, "they were live");
  check("the caption says he is reading it", q1.indexOf(AI + " is reading it...") > -1, "no line");
  check("and the hint is addressed to the man whose question it is",
    q1.indexOf("Tap the one you think it is") === -1 &&
    q1.indexOf(AI + " has one tap to find it.") > -1, "it told the wrong man to tap");
  check("the dots are ticking on his name", q1.indexOf("sb-dots go") > -1, "no dots");
  let g = 0;
  while (ev(app, "S.phase") === "h_q" && g++ < 200) await tick(20);
  check("the reading beat leaves him with an answer",
    ev(app, "S.phase") === "h_judge" && ev(app, "S.h2h.pick") != null,
    ev(app, "S.phase") + " pick=" + ev(app, "S.h2h.pick"));
  check("and the screen says what it is",
    stage(app).indexOf(AI + " says: ") > -1, "he said nothing");
  run(app, "AI_BEAT = 4;");

  console.log("\n--- and the answer he gives is the verdict that follows ---");
  /* MANY ROLLS, and no clock at all: the beats are pushed out of reach and the
     two halves of a question are called by hand, which is exactly what aiTick
     schedules a beat apart. Sixty of them, because the bug being watched for
     here is two dice thrown instead of one and that only ever shows up as a
     disagreement every so often. */
  quiet();
  run(app, "AI_BEAT = 900000;");
  /* the verdict as the match itself receives it, so the comparison is with the
     real thing rather than with the screen's opinion of it */
  run(app, "var __v = []; (function(){ var j = h2Judge; h2Judge = function(ok){ __v.push(ok); " +
           "return j.apply(null, arguments); }; })();");
  let rounds = 0, right = 0, agreed = 0, said = 0, painted = 0;
  for (let n = 0; n < 60; n++) {
    run(app, 'S.h2h.who = 1; S.h2h.at = ' + GK + '; S.h2h.sel = ' + ST + '; S.h2h.shooting = false; ' +
             'S.h2h.pen = false; S.h2h.safe = 0; S.h2h.markedAgainst = 1; S.h2h.subQ = false; ' +
             'S.h2h.relief = false; S.h2h.pick = null; S.h2h.said = null; __v = []; S.phase = "h_pick"; h2Play();');
    if (ev(app, "S.phase") !== "h_q") continue;      // that tier has run dry
    run(app, "h2AiSay(1); h2Reveal();");             // the reading beat, by hand
    const pick = ev(app, "S.h2h.pick");
    const key = ev(app, "q().k");
    /* the option as the caption would spell it: esc() sits between the two of
       them, and an option with an ampersand in it is still the same answer */
    const says = ev(app, "esc(" + JSON.stringify(AI + " says: ") + " + q().o[S.h2h.pick] + '.')");
    const shown = stage(app);
    rounds++;
    if (pick === key) right++;
    if (shown.indexOf(says) > -1) said++;
    /* and the option he named is the one the card paints */
    if (shown.indexOf(pick === key ? "h2opt right" : "h2opt wrong") > -1) painted++;
    run(app, "h2AiVerdict(1);");                     // the answering beat
    const v = JSON.parse(ev(app, "JSON.stringify(__v)"));
    if (v.length === 1 && v[0] === (pick === key)) agreed++;
  }
  run(app, "AI_BEAT = 4;");
  quiet();
  check("he answered " + rounds + " of them", rounds === 60, rounds);
  check("every answer is spelled out with his name on it", said === rounds, said + " of " + rounds);
  check("every answer is painted on the card he gave it from", painted === rounds, painted + " of " + rounds);
  check("every verdict is the answer he gave", agreed === rounds, agreed + " of " + rounds);
  /* AND HE IS NOT SECRETLY PERFECT. Eredivisie is .90 on an Easy and .08 on a
     BALL, and Route One's are the dear ones, so a run of sixty with nothing
     wrong in it would mean the pick is being read off the key. */
  check("and he gets some of them wrong", right > 0 && right < rounds, right + " of " + rounds);

  console.log("\n--- and he only steps up for his own penalty ---");
  /* H.who at this screen is whoever took the LAST kick, so reading it got the
     wrong man every time: he tapped "Martijn steps up" and then sat there
     while the human had to tap "Route One steps up" back. */
  await solo();
  run(app, 'S.h2h.so = {first: 1, kicks: [[],[]], n: 0}; S.h2h.who = 0; S.phase = "h_pens"; render();');
  await tick(120);
  check("his kick is his to take", ev(app, "S.h2h.who") === 1 && ev(app, "S.phase") !== "h_pens",
    ev(app, "S.phase") + " who=" + ev(app, "S.h2h.who"));
  quiet();
  run(app, 'S.h2h.so = {first: 0, kicks: [[],[]], n: 0}; S.h2h.who = 1; S.h2h.pen = false; ' +
           'S.h2h.shooting = false; S.phase = "h_pens"; render();');
  await tick(120);
  check("and yours is left for you to take", ev(app, "S.phase") === "h_pens", ev(app, "S.phase"));

  console.log("\n--- and the dots only tick while a beat is running ---");
  /* THE SLOT IS ALWAYS IN THE BAR and only the .go turns it on, because the
     names sit either side of the clock and a name that grows by three dots
     shoves the clock sideways on every beat of the match. */
  quiet();
  run(app, 'S.h2h.so = null; S.h2h.pen = false; S.h2h.shooting = false; ' +
           'S.h2h.who = 1; S.h2h.at = ' + GK + '; S.h2h.sel = null; S.phase = "h_pick"; render();');
  check("his name carries the dots on his ball", stage(app).indexOf("sb-dots go") > -1, "no dots");
  check("and the slot is in the bar on both names either way",
    (stage(app).match(/class="sb-dots/g) || []).length === 2,
    (stage(app).match(/class="sb-dots/g) || []).length);
  quiet();
  run(app, 'S.h2h.who = 0; S.h2h.at = ' + GK + '; S.h2h.sel = null; S.phase = "h_pick"; render();');
  check("and nothing ticks on yours", stage(app).indexOf("sb-dots go") === -1, "dots on the human");
  quiet();
  run(app, 'S.h2h.who = 1; S.h2h.scorer = 1; S.phase = "h_goal"; render();');
  check("nothing ticks on a hold either", stage(app).indexOf("sb-dots go") === -1, "dots on a hold");
  /* AND THE TICK IS THE BEAT ITSELF, a pause out of the band table rather than
     a fixed blink, so both the band and the tempo dial reach the dots. */
  quiet();
  run(app, 'AI_BEAT = 620; S.h2h.who = 1; S.h2h.at = ' + GK + '; S.h2h.sel = null; S.phase = "h_pick"; render();');
  const tk = (stage(app).match(/--tk:(\d+)ms/) || [])[1];
  check("the dots are handed the pause that is actually running",
    tk != null && Number(tk) >= 240 && Number(tk) === ev(app, "Math.max(240, aiPendingMs)"),
    tk + " against " + ev(app, "aiPendingMs"));
  run(app, "AI_BEAT = 4;");
  quiet();

  console.log("\n--- and a screen that is his cannot be tapped by you ---");
  /* THE SETUP SCREENS WERE THE ONES WITHOUT A GATE. The answering screen has
     always disabled itself on his turn; the four screens in front of it never
     did, and they are the ones with the longest pause sitting in front of them.
     The computer picks its side on a think delay, and for the whole of that
     delay every country on the screen was still live and still calling the
     setter, so tapping during the pause picked his team for him. */
  await solo("manager");
  run(app, 'clearTimeout(aiTimer); S.h2h.teams = ["Netherlands", null]; S.phase = "h_teams";');
  run(app, 'h2PickTeam("Italy");');
  check("you cannot pick his side for him", ev(app, "S.h2h.teams[1]") === null,
    ev(app, "S.h2h.teams[1]"));
  /* AND HE STILL GETS PAST HIS OWN GATE, which is the half of this that a
     guard like it usually ships broken: everything he does is booked through
     aiLater, so the exemption rides on that rather than on a second argument
     five onclicks would have to remember to pass. */
  run(app, 'h2AsActor(() => h2PickTeam("Italy"));');
  check("but he can, because it is his", ev(app, "S.h2h.teams[1]") === "Italy",
    ev(app, "S.h2h.teams[1]"));
  /* the flag is restored rather than cleared, so the gate is back up the
     instant his decision has finished running */
  check("and the exemption does not stay behind him", ev(app, "h2AiActing") === false,
    ev(app, "h2AiActing"));

  /* The other four setters, refused on his screens and open on yours. Each row
     is the phase, the state that makes it his, and the call a tap would make. */
  const SETUPS = [
    ["h_squad",  "S.h2h.picking = 1;", "h2SquadDone()",           "S.h2h.picking"],
    ["h_shape",  "S.h2h.shaping = 1;", 'h2SetShape("4-4-2")',     "S.h2h.shaping"],
    ["h_traits", "S.h2h.tset = 1;",    "h2SetTrait(9, 'poacher')", "S.h2h.tset"],
  ];
  for (const [ph, set, call, read] of SETUPS) {
    run(app, 'S.phase = ' + JSON.stringify(ph) + '; ' + set);
    const before = ev(app, read);
    run(app, "try{ " + call + "; }catch(e){}");
    check(ph + " is refused while it is his", ev(app, read) === before, ev(app, read));
    check(ph + " knows it is not yours", ev(app, "h2Mine(" + JSON.stringify(ph) + ")") === false,
      ev(app, "h2Mine(" + JSON.stringify(ph) + ")"));
  }

  /* A PHASE NOBODY OWNS IS NOBODY'S TO REFUSE, which is how every screen
     without an actor stays open. */
  check("a phase with no actor is always yours", ev(app, 'h2Mine("h_goal")') === true,
    ev(app, 'h2Mine("h_goal")'));

  /* AND PASS AND PLAY NEVER REFUSES ANYTHING, because neither seat is his.
     This is the row that would catch a gate keyed on the phase alone. */
  quiet();
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", true); h2Start(); ' +
           'h2PickTeam("Netherlands"); h2PickTeam("Italy");');
  check("two people at one phone still pick both sides",
    ev(app, 'JSON.stringify(S.h2h.teams)') === '["Netherlands","Italy"]',
    ev(app, 'JSON.stringify(S.h2h.teams)'));
  check("and every phase is yours", ev(app, 'h2Mine("h_squad") && h2Mine("h_teams") && h2Mine("h_traits")') === true,
    "a phase was refused in a two-human game");
  quiet();

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
