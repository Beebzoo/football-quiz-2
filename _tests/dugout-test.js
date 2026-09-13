/* The Dugout: the men carry the questions.
 *
 *     node _tests/dugout-test.js
 *
 * The rule is that a ball to a man draws a question from where he actually
 * played, so Italy 2006 is a Serie A quiz, the Netherlands is a mix of four
 * leagues, and a Costa Rican who never left home is the classic bank.
 *
 * Three things can go quietly wrong and all three are tested here. The mode
 * can leak into One on One, which would change a game that is supposed to be
 * frozen. The index can be read back out of the wrong deck, which does not
 * crash, it just answers a different question than the one it drew. And the
 * used lists can cross decks, because question 12 of Serie A is not question
 * 12 of the classic bank, and a shared list would start hiding questions
 * nobody has seen.
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
const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

const GK = 0, LCB = 1, RCB = 2, LWB = 3, RWB = 4, SIX = 5, EIGHT = 6, TEN = 7, LW = 8, ST = 9, RW = 10;

(async () => {
  const app = makeInstance("dugout");
  await tick(340);
  run(app, "TEAMS.classic = " + JSON.stringify(R("assets/wc2006/index.json")));
  for (const [id, dir] of [["seriea", "seriea"], ["laliga", "laliga"], ["premier", "premier"],
                           ["ere", "eredivisie"], ["bundesliga", "bundesliga"]])
    run(app, "DECKS[" + JSON.stringify(id) + "] = " + JSON.stringify(R("assets/" + dir + "/index.json")));

  const qd = () => ev(app, "S.qd");
  const lg = (i, w) => ev(app, "h2Man(" + i + "," + w + ").lg") || null;
  const start = (play, a, b) => run(app,
    'S = freshState(["Martijn","Bram"], false, "classic", 0, "' + play + '", false); h2Start(); ' +
    'h2PickTeam(' + JSON.stringify(a) + '); h2PickTeam(' + JSON.stringify(b) + '); ' +
    'S.h2h.tossed = true; S.h2h.subs=[0,0]; h2TackleOn = false;');
  const passTo = async (from, to) => {
    run(app, `S.h2h.who=0; S.h2h.at=${from}; S.h2h.sel=null; S.h2h.marks=[]; S.h2h.markedAgainst=0; S.phase="h_pick"; render(); h2Select(${to}); h2Play();`);
    await tick();
  };

  /* ---------------------------------------------------------------- */
  console.log("--- the deck comes from the man ---");
  start("manager", "Italy", "Costa Rica");
  await passTo(SIX, RCB);
  /* Cannavaro played in two, and which one a given ball asks is a coin toss by
     design, so the test asks what the rule promises rather than pinning the
     toss: it has to be one of HIS. */
  check("a ball to Cannavaro draws one of his leagues",
    (lg(RCB, 0) || []).includes(qd()), qd() + " / " + JSON.stringify(lg(RCB, 0)));
  check("he has two to draw from", (lg(RCB, 0) || []).length === 2, JSON.stringify(lg(RCB, 0)));
  check("the card names whichever it was",
    stage(app).indexOf(ev(app, "QUIZZES[S.qd].label")) !== -1, "not named: " + qd());
  check("and the question really came out of that deck",
    ev(app, "DECKS[S.qd][S.tier].indexOf(q()) !== -1") === true, "not in the " + qd() + " deck");

  /* a man with two leagues should use both across enough passes */
  start("manager", "Italy", "Costa Rica");
  const seen = {};
  for (let i = 0; i < 40; i++) { await passTo(SIX, ST); seen[qd()] = (seen[qd()] || 0) + 1; run(app, "h2Next();"); }
  const toni = lg(ST, 0) || [];
  check("Toni played in two leagues", toni.length === 2, JSON.stringify(toni));
  check("and forty balls to him used both", Object.keys(seen).length === 2, JSON.stringify(seen));
  check("and nothing but those two", Object.keys(seen).every(k => toni.includes(k)), JSON.stringify(seen));

  console.log("\n--- a man who never left home ---");
  start("manager", "Costa Rica", "Italy");
  await passTo(EIGHT, LCB);
  check("a Costa Rican defender has no leagues", lg(LCB, 0) === null, JSON.stringify(lg(LCB, 0)));
  check("so his ball is the classic bank", qd() === null, qd());
  check("and the card names no league", !/Serie A|La Liga|Premier League/.test(stage(app)), "a league was named");
  /* Costa Rica's XI puts Gomez in the striker's slot, not on the wing */
  await passTo(EIGHT, ST);
  check("but Gomez, who played in Spain, draws La Liga", qd() === "laliga", qd() + " / " + JSON.stringify(lg(ST, 0)));

  console.log("\n--- One on One is not touched ---");
  start("pitch", "Italy", "Costa Rica");
  await passTo(SIX, RCB);
  check("the same ball draws the quiz's own bank", qd() === null, qd());
  check("h2Tactical is false", ev(app, "h2Tactical()") === false, ev(app, "h2Tactical()"));
  check("and no league is named", !/ Serie A/.test(stage(app)), "a league was named");

  console.log("\n--- the contests read a career too ---");
  start("manager", "Italy", "Costa Rica");
  run(app, "h2TackleOn = true;");
  run(app, `S.h2h.who=0; S.h2h.at=${SIX}; S.h2h.marks=[${ST}]; S.h2h.markedAgainst=0; S.h2h.relief=true; S.phase="h_pick"; render(); h2Select(${ST}); h2Play();`);
  await tick(140);
  check("a tackle on a marked man is his league, not the tackler's",
    (lg(ST, 0) || []).includes(qd()), qd() + " / " + JSON.stringify(lg(ST, 0)));
  check("which is the defender reading the other XI", ev(app, "S.phase") === "h_tackle", ev(app, "S.phase"));
  run(app, "h2TackleOn = false;");

  start("manager", "Italy", "Netherlands");
  run(app, `S.h2h.who=0; S.h2h.at=${ST}; S.phase="h_pick"; render(); h2Shoot(); h2Reveal(); h2Judge(true);`);
  await tick(150);
  check("the save comes from the keeper's career, and he is one of THEIRS",
    (lg(GK, 1) || []).includes(qd()) || qd() === null, qd() + " / theirs GK: " + JSON.stringify(lg(GK, 1)));

  console.log("\n--- the indexes never cross decks ---");
  start("manager", "Italy", "Netherlands");
  for (let i = 0; i < 12; i++) { await passTo(SIX, ST); run(app, "h2Next();"); }
  const usedQ = ev(app, "S.usedQ") || {};
  const classic = ev(app, "S.used");
  check("league draws are counted per league", Object.keys(usedQ).length >= 1, JSON.stringify(Object.keys(usedQ)));
  check("and the classic bank's own list is untouched",
    Object.values(classic).every(a => a.length === 0), JSON.stringify(classic));
  const anyDeck = Object.keys(usedQ)[0];
  const tiers = Object.keys(usedQ[anyDeck]);
  check("no question came up twice out of one deck",
    tiers.every(t => new Set(usedQ[anyDeck][t]).size === usedQ[anyDeck][t].length), JSON.stringify(usedQ[anyDeck]));

  console.log("\n--- when his league has nothing left ---");
  start("manager", "Italy", "Costa Rica");
  /* empty every tier of his leagues and check it falls back rather than stalling */
  run(app, 'for(const id of ["seriea","bundesliga"]) for(const t of Object.keys(DECKS[id])) if(Array.isArray(DECKS[id][t])) DECKS[id][t] = [];');
  await passTo(SIX, ST);
  check("a dry league falls back to the bank rather than stalling",
    ev(app, "S.phase") === "h_q" && qd() === null, ev(app, "S.phase") + " / " + qd());
  check("and there is a real question on the card", !!ev(app, "q() && q().q"), "no question");
  run(app, 'DECKS.seriea = ' + JSON.stringify(R("assets/seriea/index.json")) + ";");
  run(app, 'DECKS.bundesliga = ' + JSON.stringify(R("assets/bundesliga/index.json")) + ";");

  console.log("\n--- the menu only offers it where the eleven have careers ---");
  check("Let's Ball can be managed", ev(app, 'canEver("classic","manager")') === true, ev(app, 'canEver("classic","manager")'));
  check("a league quiz cannot, its squads have no careers yet",
    ev(app, 'canEver("premier","manager")') === false, ev(app, 'canEver("premier","manager")'));
  check("nor can Career Path", ev(app, 'canEver("career","manager")') === false, ev(app, 'canEver("career","manager")'));
  check("but Let's Ball is still fine on the pitch", ev(app, 'canEver("classic","pitch")') === true, "no");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
