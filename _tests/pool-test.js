/* WHO YOU PLAY AS IS ITS OWN CHOICE.
 *
 *     node _tests/pool-test.js
 *
 * The squad pool used to be a property of the quiz: one quiz, one file, one
 * set of sides, and no way to say "the 2006 questions and the Ajax of 1972".
 * Splitting them is a refactor rather than a feature, which is the kind of
 * change that breaks something three screens away and says nothing, so this
 * checks the seam rather than the screen.
 *
 * The one thing that MUST hold is that a player who never touches a pool
 * picker gets exactly the game he had before: the quiz names a default pool
 * and everything falls back to it.
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

/* ---------- the file on disk ---------- */
console.log("--- the finals pool is the same shape as every other pool ---");
const finals = R("assets/finals/index.json");
const wc = R("assets/wc2006/index.json");
check("forty sides", Object.keys(finals).length === 40, Object.keys(finals).length);
const bad = [];
for (const [name, t] of Object.entries(finals)) {
  if (!t.xi || t.xi.length !== 11) bad.push(name + " xi " + (t.xi || []).length);
  else if (t.xi.filter(m => m.pos === "GK").length !== 1) bad.push(name + " keepers");
  else if (t.xi.some(m => !m.n || !m.no)) bad.push(name + " a man with no name or number");
  if (!t.kit) bad.push(name + " no kit");
}
check("every side is eleven men with one keeper", bad.length === 0, bad.slice(0, 4).join(", "));
/* THE NAME IS THE TITLE, not the country. Three Real Madrids and two Brazils
   are in this list and a picker showing "Brazil" twice is unusable. */
check("and every side has its own name",
  Object.keys(finals).length === new Set(Object.keys(finals)).size, "a name repeats");
check("Ajax 1995 and Ajax 1972 are both in it, separately",
  Object.keys(finals).filter(k => /Ajax/.test(k)).length === 2,
  Object.keys(finals).filter(k => /Ajax/.test(k)).join(" / "));
/* NO BENCH, ON PURPOSE. Said out loud here so nobody later reads an empty
   array as a harvest that failed. */
check("no bench, which is the point", Object.values(finals).every(t => (t.bench || []).length === 0),
  "somebody has a bench");

(async () => {
  const app = makeInstance("pool");
  await tick(340);
  run(app, "TEAMS.wc2006 = " + JSON.stringify(wc));
  run(app, "TEAMS.finals = " + JSON.stringify(finals));

  console.log("\n--- a player who never touches it gets what he always got ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start();');
  await tick(120);
  check("no pool chosen", ev(app, "S.pool") === null, ev(app, "S.pool"));
  check("but the quiz names one", ev(app, "h2PoolId()") === "wc2006", ev(app, "h2PoolId()"));
  check("and the sides are the 2006 nations",
    ev(app, "Object.keys(h2Pool()).length") === 32, ev(app, "Object.keys(h2Pool()).length"));
  check("badges come from the pool's own folder",
    /natflags/.test(ev(app, 'h2Badge("nl")') || ""), ev(app, 'h2Badge("nl")'));

  console.log("\n--- and Let's Ball can be played as a famous final ---");
  check("both pools are offered", ev(app, "h2Pools().length") === 2, ev(app, "h2Pools()"));
  run(app, 'h2SetPool("finals");'); await tick(120);
  check("choosing one sticks", ev(app, "h2PoolId()") === "finals", ev(app, "h2PoolId()"));
  check("and the sides are the forty finals",
    ev(app, "Object.keys(h2Pool()).length") === 40, ev(app, "Object.keys(h2Pool()).length"));
  const side = ev(app, "Object.keys(h2Pool()).find(k => /Ajax/.test(k))");
  run(app, "h2PickTeam(" + JSON.stringify(side) + "); h2PickTeam(Object.keys(h2Pool()).find(k => /Liverpool/.test(k)));");
  await tick(140);
  run(app, "S.h2h.tossed = true; S.h2h.who = 0;");
  check("a man off that side is on the pitch",
    ev(app, "h2Man(9,0)") && ev(app, "h2Man(9,0)").n.length > 0, JSON.stringify(ev(app, "h2Man(9,0)")));
  check("the ladder prices him like anybody else",
    ["easy", "normal", "hard", "extreme", "ball"].indexOf(ev(app, "h2TierFor(0,9)")) > -1,
    ev(app, "h2TierFor(0,9)"));
  /* NO CAREERS IN THIS POOL, so every man falls through to the quiz's own bank,
     which is exactly the path a Costa Rican who never left home already takes. */
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "manager", false); S.pool = "finals"; h2Start(); ' +
    "h2PickTeam(Object.keys(h2Pool())[0]); h2PickTeam(Object.keys(h2Pool())[1]); S.h2h.tossed = true;");
  await tick(140);
  run(app, "S.qd = null; h2Draw('normal', 9, 0);");
  check("a man with no career asks the quiz's own bank", ev(app, "S.qd") === null, ev(app, "S.qd"));
  check("and gets a question rather than nothing", ev(app, "S.qi") != null, ev(app, "S.qi"));

  console.log("\n--- changing the pool cannot leave a side behind ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); h2PickTeam("Italy");');
  await tick(120);
  check("a side is picked", ev(app, "S.h2h.teams[0]") === "Italy", ev(app, "S.h2h.teams[0]"));
  run(app, 'h2SetPool("finals");'); await tick(120);
  /* A NAME FROM ONE POOL MEANS NOTHING IN ANOTHER, so keeping it would be a
     side that does not exist. */
  check("and switching pool clears it", ev(app, "S.h2h.teams[0]") === null, ev(app, "S.h2h.teams[0]"));

  console.log("\n--- a quiz is only offered its own pools ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "premier", 0, "pitch", false); h2Start();');
  await tick(120);
  run(app, "TEAMS['premier-clubs'] = {a:{xi:[],bench:[]}};");
  check("the Premier League quiz is not offered the finals",
    ev(app, "h2Pools()").indexOf("finals") < 0, ev(app, "h2Pools()"));
  run(app, 'h2SetPool("finals");'); await tick(100);
  check("and cannot be talked into them", ev(app, "h2PoolId()") !== "finals", ev(app, "h2PoolId()"));
  /* AND A PARKED MATCH CANNOT SMUGGLE ONE IN. The setter is a guard on the way
     in, which is no use against a value that arrived from localStorage. */
  run(app, 'S.pool = "finals";'); await tick(100);
  check("nor can a saved state that already holds one", ev(app, "h2PoolId()") === "premier-clubs",
    ev(app, "h2PoolId()"));

  console.log("\n--- the picker ---");
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); render();');
  await tick(160);
  check("it is on the team screen", /h2SetPool/.test(stage(app)), "no picker");
  check("with both pools named", /World Cup 2006/.test(stage(app)) && /Famous finals/.test(stage(app)),
    "a pool is missing from the row");
  run(app, 'h2PickTeam("Italy"); render();'); await tick(140);
  /* ONCE ONE SIDE IS PICKED IT IS TOO LATE. Changing the pool would clear his
     pick, which from the second man's seat looks like the app losing it. */
  check("and it goes away once somebody has picked", !/h2SetPool/.test(stage(app)),
    "still offered mid-pick");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
