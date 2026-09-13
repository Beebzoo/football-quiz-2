/* THE DAILY BALL.
 *
 *     node _tests/daily-test.js
 *
 * Six questions up the ladder, the same six for everybody on the same day.
 * That last clause is the whole feature: the share line is only worth pasting
 * if the person reading it had the same six, so "the same six" is the thing
 * this suite is really about.
 *
 * Two ways it could quietly stop being true, and both are checked:
 *
 *   A REBUILD THAT REORDERS THE BANK. S.used fell into this once already:
 *   it holds indexes, so appending a pack sends every parked match to a
 *   different question. A daily that picked by index would do worse, because
 *   it would change questions people have already played and screenshotted.
 *   It picks by a hash of the words instead, and the test proves it by
 *   shuffling the bank and asking again.
 *
 *   A QUESTION SPENT TWICE. The daily and the Friday night draw from the same
 *   deck and must not burn each other's questions.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const stage = ctx => ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "";
const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 130) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

(async () => {
  const app = makeInstance("daily");
  await tick(340);
  const mc = R("assets/mc/index.json");
  run(app, 'DECKS["classic-mc"] = ' + JSON.stringify(mc) + ";");

  console.log("--- everyone gets the same six on the same day ---");
  const six = d => JSON.stringify(ev(app, "dailySix(" + d + ").map(x => x.k)"));
  const a1 = six(20260914), a2 = six(20260914);
  check("the same date gives the same six", a1 === a2, a1 + " then " + a2);
  check("and six of them", JSON.parse(a1).length === 6, JSON.parse(a1).length);
  check("a different date gives different questions", six(20260915) !== a1, "identical");
  /* ONE PER RUNG, in the ladder's own order, because the daily is the ladder */
  const tiers = ev(app, "dailySix(20260914).map(x => x.tier)");
  check("one per rung, keeper to striker",
    tiers.join() === "easy,normal,hard,extreme,extreme,ball", tiers.join());

  console.log("\n--- and a rebuild that reorders the bank cannot change them ---");
  /* THE TRAP S.used FELL INTO. Appending a pack moves every index below it; a
     daily picked by index would change questions people have already played
     and posted a screenshot of. */
  const before = six(20260914);
  run(app, '(() => { const b = DECKS["classic-mc"]; for(const t of Object.keys(b)){ ' +
    "const a = b[t]; for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); " +
    "const tmp = a[i]; a[i] = a[j]; a[j] = tmp; } } })();");
  run(app, "for(const k of Object.keys(dailyBankCache)) delete dailyBankCache[k];");
  const after = six(20260914);
  check("the same six survive a shuffled bank", before === after, "they moved");
  /* and they are still the same QUESTIONS, not just the same keys */
  const qs = ev(app, 'dailySix(20260914).map(x => DECKS["classic-mc"][x.tier][x.i].q)');
  check("and they still point at real questions", qs.every(x => typeof x === "string" && x.length > 5),
    JSON.stringify(qs).slice(0, 80));

  console.log("\n--- playing it ---");
  run(app, 'localStorage.removeItem("ball2-mine"); MINE = null;');
  run(app, "dailyStart();"); await tick(140);
  check("it opens on the first rung", ev(app, "S.phase") === "d_q", ev(app, "S.phase"));
  check("which is the Easy one", ev(app, "S.tier") === "easy", ev(app, "S.tier"));
  check("and the question is on the screen", /h2opt/.test(stage(app)), "no options");
  /* get four right and the fifth wrong */
  for (let i = 0; i < 4; i++) {
    run(app, "dailyPick(q().k); dailyOn();"); await tick(110);
  }
  check("four right takes you to the fifth rung", ev(app, "mine().daily.rung") === 4,
    ev(app, "mine().daily.rung"));
  run(app, "dailyPick((q().k + 1) % 4); dailyOn();"); await tick(120);
  check("and one wrong ends it", ev(app, "S.phase") === "d_done", ev(app, "S.phase"));
  check("four rungs reached", ev(app, "mine().daily.reached") === 4, ev(app, "mine().daily.reached"));

  console.log("\n--- the share line ---");
  const line = ev(app, "dailyShare()");
  const squares = [...line].filter(c => c === "\u{1F7E9}" || c === "\u{1F7E5}" || c === "⬛").length;
  check("exactly six squares", squares === 6, squares + " in " + JSON.stringify(line));
  check("four green", [...line].filter(c => c === "\u{1F7E9}").length === 4,
    [...line].filter(c => c === "\u{1F7E9}").length);
  check("one red, where it was lost", [...line].filter(c => c === "\u{1F7E5}").length === 1,
    [...line].filter(c => c === "\u{1F7E5}").length);
  check("one black, never reached", [...line].filter(c => c === "⬛").length === 1,
    [...line].filter(c => c === "⬛").length);
  check("and it names where you got to", /made it to the eight/.test(line), line);
  check("and carries the link", /beebzoo\.github\.io/.test(line), line);

  console.log("\n--- the streak ---");
  check("one day", ev(app, "mine().streak.played") === 1, ev(app, "mine().streak.played"));
  check("and one past halfway, because four rungs is past the six",
    ev(app, "mine().streak.half") === 1, ev(app, "mine().streak.half"));
  /* A CONSECUTIVE DAY ADDS ONE. The date is forced rather than waited for. */
  run(app, "mine().streak.last = 20260913; mine().streak.lastHalf = 20260913; " +
    "mine().daily = {date: 20260914, reached: 4, got: [1,1,1,1,0], done: true, spent: {}}; " +
    "dailyStreak(mine().daily);");
  await tick(100);
  check("yesterday plus today is two", ev(app, "mine().streak.played") === 2, ev(app, "mine().streak.played"));
  /* AND A GAP RESETS IT. No freezes and no forgiveness: a streak you can buy
     back is not a streak. */
  run(app, "mine().streak.last = 20260910; mine().streak.lastHalf = 20260910; " +
    "mine().daily = {date: 20260914, reached: 4, got: [1,1,1,1,0], done: true, spent: {}}; " +
    "dailyStreak(mine().daily);");
  await tick(100);
  check("a missed day starts again at one", ev(app, "mine().streak.played") === 1,
    ev(app, "mine().streak.played"));
  /* falling short of halfway breaks the half streak but not the played one */
  run(app, "mine().streak.last = 20260913; mine().streak.played = 5; mine().streak.half = 5; " +
    "mine().streak.lastHalf = 20260913; " +
    "mine().daily = {date: 20260914, reached: 1, got: [1,0], done: true, spent: {}}; " +
    "dailyStreak(mine().daily);");
  await tick(100);
  check("turning up still counts", ev(app, "mine().streak.played") === 6, ev(app, "mine().streak.played"));
  check("but falling short breaks the halfway streak", ev(app, "mine().streak.half") === 0,
    ev(app, "mine().streak.half"));

  console.log("\n--- it does not burn the match bank ---");
  run(app, 'localStorage.removeItem("ball2-mine"); MINE = null; dailyStart();'); await tick(140);
  const k0 = ev(app, "mine().daily.six[0].i");
  run(app, "dailyPick(q().k); dailyOn();"); await tick(120);
  run(app, 'S = freshState(["A","B"], false, "classic", 0, "board", true);');
  check("a question the daily used is not in the match's used list",
    (ev(app, "S.used.easy") || []).indexOf(k0) < 0, ev(app, "S.used.easy"));
  /* AND THE REVERSE. A question spent on a Friday must still be able to come
     up as a daily: two banks, one deck. */
  run(app, "S.used.easy = [" + k0 + "];");
  const stillThere = ev(app, "dailySix(20260914).map(x => x.i)");
  check("and the match cannot burn a daily's", Array.isArray(stillThere) && stillThere.length === 6,
    JSON.stringify(stillThere));

  console.log("\n--- a week does not repeat itself ---");
  run(app, 'localStorage.removeItem("ball2-mine"); MINE = null;');
  run(app, "mine().daily = {date: 1, spent: {}};");
  const seen = {};
  let clash = 0;
  for (let day = 20260901; day <= 20260907; day++) {
    const keys = ev(app, "dailySix(" + day + ").map(x => x.k)");
    for (const k of keys) { if (seen[k]) clash++; seen[k] = 1; }
    run(app, "(() => { const s = mine().daily.spent; for(const x of dailySix(" + day + ")) s[x.k] = 1; })();");
  }
  check("seven days, no question twice", clash === 0, clash + " repeats");

  console.log("\n--- carrying it to another phone ---");
  /* the app saves on every change; the test has been poking the object
     directly, so it has to write it down before asking for an export */
  run(app, "mineSave();");
  const dump = ev(app, "exportMine()");
  check("the export is our own file", JSON.parse(dump).app === "BALL 2", JSON.parse(dump).app);
  check("and carries the namespace", !!JSON.parse(dump).data["ball2-mine"], "missing");
  /* the harness's localStorage has getItem, setItem and removeItem, which is
     all the app ever uses, so a cleared phone is spelled out */
  run(app, '["ball2-mine","ball-quiz-history-v1","ball-crew","ball2-outcomes","ball-names","ball-mp-name"]' +
    '.forEach(k => localStorage.removeItem(k)); MINE = null;');
  check("a cleared phone has nothing", ev(app, "mine().streak.played") === 0, ev(app, "mine().streak.played"));
  run(app, "importMine(" + JSON.stringify(dump) + ");"); await tick(120);
  check("and the import brings it back", ev(app, "mine().daily") !== null, ev(app, "mine().daily"));
  /* IT REFUSES RATHER THAN GUESSES, because an import is the one action here
     that can destroy something. */
  run(app, 'importMine("{\\"app\\":\\"something else\\"}");'); await tick(100);
  check("and refuses anything that is not ours", ev(app, "mine().daily") !== null, "it took it");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
