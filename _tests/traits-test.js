/* TRAITS, WITH A BUDGET.
 *
 *     node _tests/traits-test.js
 *
 * A trait is the only thing in The Dugout that changes a price for a reason
 * outside the geometry, so it is the one most able to break the ladder quietly.
 * Three things are checked here and all three are the design, not the code:
 *
 *   EARNED. A man can only be given a trait the tournament gave him. Nobody
 *   can make Cannavaro a Finisher.
 *
 *   BUDGETED. Both managers get the same points however good their squad is,
 *   which is the answer to "Brazil is just better".
 *
 *   BASE, NOT SITUATIONAL. A trait changes the tier before the line and the
 *   mark relief are applied to it, so it can never be swallowed by the clamp
 *   and can never combine with it into a free goal.
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
const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

(async () => {
  const app = makeInstance("traits");
  await tick(340);
  run(app, "TEAMS.wc2006 = " + JSON.stringify(R("assets/wc2006/index.json")));

  const start = (play, a, b) => run(app,
    'S = freshState(["Martijn","Bram"], false, "classic", 0, "' + play + '", false); h2Start(); ' +
    'h2PickTeam(' + JSON.stringify(a) + '); h2PickTeam(' + JSON.stringify(b) + '); ' +
    'S.h2h.tossed = true; S.h2h.subs=[0,0]; h2TackleOn = false;');
  const slotOf = (name, w) => {
    for (let i = 0; i < 11; i++) {
      const m = ev(app, "h2Man(" + i + "," + w + ")");
      if (m && (m.full || "").indexOf(name) > -1) return i;
    }
    return -1;
  };

  /* ================================================================ */
  console.log("--- the harvest actually landed on the deck ---");
  const deck = R("assets/wc2006/index.json");
  const all = [];
  for (const [side, t] of Object.entries(deck))
    for (const k of ["xi", "bench"]) for (const p of (t[k] || [])) all.push({ side, p });
  const withTr = all.filter(m => (m.p.tr || []).length);
  check("men carry a tr array", withTr.length > 100, withTr.length);
  const klose = all.find(m => m.p.full === "Miroslav Klose");
  check("Klose scored five", klose && klose.p.g === 5, klose && klose.p.g);
  check("and is eligible as a finisher", klose && klose.p.tr.indexOf("finisher") > -1,
    klose && JSON.stringify(klose.p.tr));
  /* THE OWN GOALS ARE THE TELL. If these four had been credited, every one of
     them would be a Finisher, and they are the only defenders who would be. */
  for (const name of ["Carlos Gamarra", "Brent Sancho", "Cristian Zaccardo"]) {
    const m = all.find(x => x.p.full === name);
    if (!m) { check(name + " is in the deck", false, "missing"); continue; }
    check(name + "'s own goal was not credited to him", !m.p.g, m.p.g);
  }
  /* every side has to be able to spend something, or a screen opens empty */
  const sidesWithNone = Object.keys(deck).filter(side =>
    !all.filter(m => m.side === side && (m.p.tr || []).length).length);
  check("every squad has somebody eligible", sidesWithNone.length === 0, sidesWithNone.join(", "));

  /* ================================================================ */
  console.log("\n--- earned, not chosen ---");
  start("manager", "Netherlands", "Italy");
  /* WHOEVER IS ELIGIBLE, not a named man. The deck carries real elevens now,
     so van Nistelrooy is not in the Dutch side that went out to Portugal. */
  const vn = [...Array(11).keys()].find(i => ((ev(app, "h2Man(" + i + ",0)") || {}).tr || []).indexOf("poacher") > -1);
  check("somebody in the Dutch eleven scored in Germany", vn != null, vn);
  run(app, "S.h2h.tset = 0; h2SetTrait(" + vn + ", 'poacher');"); await tick(100);
  check("he can be a Poacher, because he scored", ev(app, "h2TraitOf(" + vn + ",0)") === "poacher",
    ev(app, "h2TraitOf(" + vn + ",0)"));
  run(app, "h2SetTrait(" + vn + ", 'keeper');"); await tick(100);
  check("but not a Keeper, because he is not one", ev(app, "h2TraitOf(" + vn + ",0)") === "poacher",
    ev(app, "h2TraitOf(" + vn + ",0)"));
  const cb = slotOf("Mathijsen", 0) > -1 ? slotOf("Mathijsen", 0) : 1;
  run(app, "h2SetTrait(" + cb + ", 'finisher');"); await tick(100);
  check("a defender who scored nothing cannot be a Finisher",
    ev(app, "h2TraitOf(" + cb + ",0)") === null, ev(app, "h2TraitOf(" + cb + ",0)"));

  /* ================================================================ */
  console.log("\n--- the same budget, however good the squad ---");
  start("manager", "Germany", "Trinidad and Tobago");
  run(app, "S.h2h.tset = 0;");
  const elig = ev(app, "h2Eligible(0).length");
  check("Germany have plenty eligible", elig >= 3, elig);
  /* switch on everything affordable and check the sum never passes the budget */
  run(app, "for(const e of h2Eligible(0)) for(const k of e.tr) h2SetTrait(e.i, k);");
  await tick(120);
  check("and can still only spend three points", ev(app, "h2TraitSpend(0)") <= 3,
    ev(app, "h2TraitSpend(0)"));
  start("manager", "Trinidad and Tobago", "Germany");
  run(app, "S.h2h.tset = 0; for(const e of h2Eligible(0)) for(const k of e.tr) h2SetTrait(e.i, k);");
  await tick(120);
  check("and so can the weakest squad in the tournament", ev(app, "h2TraitSpend(0)") <= 3,
    ev(app, "h2TraitSpend(0)"));
  check("who still have something to spend it on", ev(app, "h2TraitSpend(0)") > 0,
    ev(app, "h2TraitSpend(0)"));

  /* ================================================================ */
  console.log("\n--- one trait a man ---");
  start("manager", "Netherlands", "Italy");
  const gk = 0;
  run(app, "S.h2h.tset = 0; h2SetTrait(0, 'keeper'); h2SetTrait(0, 'captain');");
  await tick(120);
  check("switching a second on replaces the first",
    ev(app, "h2TraitOf(0,0)") === "captain", ev(app, "h2TraitOf(0,0)"));
  check("and only the second is paid for", ev(app, "h2TraitSpend(0)") === 2, ev(app, "h2TraitSpend(0)"));
  run(app, "h2SetTrait(0, 'captain');"); await tick(100);
  check("tapping it again switches it off", ev(app, "h2TraitOf(0,0)") === null, ev(app, "h2TraitOf(0,0)"));
  check("and gives the points back", ev(app, "h2TraitSpend(0)") === 0, ev(app, "h2TraitSpend(0)"));

  /* ================================================================ */
  console.log("\n--- what each one actually does ---");
  start("manager", "Netherlands", "Italy");
  run(app, "S.h2h.tset = 0; S.h2h.who = 0; S.h2h.at = 0;");
  /* POACHER: route one is BALL from anywhere, and Extreme to him.
     Found by what the man is eligible for and by where he stands, because the
     deck carries real elevens and the man who was up front in one match was
     dropped for the next. */
  const st = [...Array(11).keys()].find(i =>
    ev(app, "h2Shape(0)[" + i + "].line") === 6 &&
    (((ev(app, "h2Man(" + i + ",0)") || {}).tr) || []).indexOf("poacher") > -1);
  check("somebody in the front line scored in Germany", st != null, st);
  const beforeRoute = ev(app, "h2TierFor(1," + st + ")");
  check("route one is BALL to begin with", beforeRoute === "ball", beforeRoute);
  run(app, "h2SetTrait(" + st + ", 'poacher');"); await tick(100);
  check("and Extreme to a Poacher", ev(app, "h2TierFor(1," + st + ")") === "extreme",
    ev(app, "h2TierFor(1," + st + ")"));
  /* FINISHER: the shot comes down one, floored at Normal */
  start("manager", "Germany", "Italy");
  run(app, "S.h2h.tset = 0; S.h2h.who = 0;");
  const kl = slotOf("Klose", 0);
  const shotBefore = ev(app, "H2_SHOT_AT(" + kl + ",0)");
  run(app, "h2SetTrait(" + kl + ", 'finisher');"); await tick(100);
  const shotAfter = ev(app, "H2_SHOT_AT(" + kl + ",0)");
  check("a Finisher's shot comes down a tier",
    ev(app, "H2_ORDER").indexOf(shotAfter) === ev(app, "H2_ORDER").indexOf(shotBefore) - 1,
    shotBefore + " to " + shotAfter);
  check("and never below Normal", ev(app, "H2_ORDER").indexOf(shotAfter) >= ev(app, "H2_ORDER").indexOf("normal"),
    shotAfter);
  /* CAPTAIN: every ball FROM him */
  start("manager", "Netherlands", "Italy");
  run(app, "S.h2h.tset = 0; S.h2h.who = 0;");
  const cap = (() => { for (let i = 0; i < 11; i++) if ((ev(app, "h2Man(" + i + ",0)") || {}).cap) return i; return -1; })();
  check("somebody in the eleven wore the armband", cap > -1, cap);
  /* a ball that is ON the ladder, which is where the discount applies */
  const tgt = (() => { for (let i = 1; i < 11; i++)
    if (i !== cap && ev(app, "h2Shape(0)[" + i + "].line") === 5) return i;
    for (let i = 1; i < 11; i++) if (i !== cap && ev(app, "h2Shape(0)[" + i + "].line") === 4) return i;
    return 6; })();
  const fromBefore = ev(app, "h2TierFor(" + cap + "," + tgt + ")");
  run(app, "h2SetTrait(" + cap + ", 'captain');"); await tick(100);
  const fromAfter = ev(app, "h2TierFor(" + cap + "," + tgt + ")");
  check("a Captain's ball comes down a tier",
    ev(app, "H2_ORDER").indexOf(fromAfter) === Math.max(0, ev(app, "H2_ORDER").indexOf(fromBefore) - 1),
    fromBefore + " to " + fromAfter);
  /* ROUTE ONE IS OUTSIDE THE LADDER and the armband does not reach it. A good
     passer does not make a hoof a good idea, and two traits compounding here
     is the free goal the whole clamp exists to prevent. */
  const front = (() => { for (let i = 1; i < 11; i++)
    if (ev(app, "h2Shape(0)[" + i + "].line") === 6) return i; return 9; })();
  check("but route one stays BALL even from him",
    ev(app, "h2TierFor(" + cap + "," + front + ")") === "ball",
    ev(app, "h2TierFor(" + cap + "," + front + ")"));
  run(app, "h2SetTrait(" + front + ", 'poacher');"); await tick(100);
  check("and a Poacher on the end of it makes it Extreme, not cheaper still",
    ["extreme", "ball"].indexOf(ev(app, "h2TierFor(" + cap + "," + front + ")")) > -1,
    ev(app, "h2TierFor(" + cap + "," + front + ")"));

  /* ================================================================ */
  console.log("\n--- a trait is about the man, not the slot ---");
  start("manager", "Germany", "Italy");
  run(app, "S.h2h.tset = 0; S.h2h.subs = [3,3];");
  const k2 = slotOf("Klose", 0);
  run(app, "h2SetTrait(" + k2 + ", 'finisher');"); await tick(100);
  check("the man in the slot has it", ev(app, "h2TraitOf(" + k2 + ",0)") === "finisher",
    ev(app, "h2TraitOf(" + k2 + ",0)"));
  run(app, "S.h2h.subbed[0][" + k2 + "] = h2Bench(0)[0].p;"); await tick(100);
  check("the man who replaces him does NOT inherit it",
    ev(app, "h2TraitOf(" + k2 + ",0)") === null, ev(app, "h2TraitOf(" + k2 + ",0)"));

  /* ================================================================ */
  console.log("\n--- One on One has never heard of any of this ---");
  start("pitch", "Germany", "Italy");
  const k3 = slotOf("Klose", 0);
  const plain = ev(app, "H2_SHOT_AT(" + k3 + ",0)");
  run(app, "S.h2h.traits = [{}, {}]; S.h2h.traits[0][h2TraitKey(h2Man(" + k3 + ",0))] = 'finisher';");
  await tick(100);
  check("a trait set on the state cannot reach the pitch",
    ev(app, "H2_SHOT_AT(" + k3 + ",0)") === plain, ev(app, "H2_SHOT_AT(" + k3 + ",0)"));
  check("nor can it move the ladder", ev(app, "h2TraitOf(" + k3 + ",0)") === null,
    ev(app, "h2TraitOf(" + k3 + ",0)"));

  /* ================================================================ */
  console.log("\n--- the screen ---");
  start("manager", "Netherlands", "Italy");
  run(app, 'S.h2h.picking=null; S.h2h.shaping=null; S.h2h.tset=0; S.phase="h_traits"; render();');
  await tick(160);
  check("it names the budget", /3 points/.test(stage(app)), "no budget shown");
  check("it shows the evidence, not just the label", /goal|yellow|captain/.test(stage(app)), "no evidence");
  check("and only offers men who earned something",
    (stage(app).match(/h2SetTrait\(/g) || []).length === ev(app, "h2Eligible(0).reduce((n,e)=>n+e.tr.length,0)"),
    (stage(app).match(/h2SetTrait\(/g) || []).length);
  run(app, "h2TraitsDone();"); await tick(120);
  check("then the other manager", ev(app, "S.h2h.tset") === 1, ev(app, "S.h2h.tset"));
  run(app, "h2TraitsDone();"); await tick(120);
  check("and then the toss", ev(app, "S.phase") === "h_toss", ev(app, "S.phase"));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
