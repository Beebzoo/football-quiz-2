/* IS THERE ENOUGH IN THE DECK TO PLAY A MATCH?
 *
 *     node _tests/depth-test.js
 *
 * A thin tier does not crash anything. It just quietly starts asking the same
 * questions, and the first anybody knows about it is somebody at the table
 * saying "we had this one". That is the failure this exists to catch, and it
 * is invisible to every other suite, because every other suite plays one ball
 * at a time and never runs a deck down.
 *
 * THE NUMBERS COME FROM THE SIMULATOR, not from a guess. _tools/sim-dugout.js
 * plays thousands of matches driving the app's own pricing functions and
 * counts which tiers actually get asked. What it found is not what anybody
 * expected: the short balls are rare and the long ones are constant, because
 * a side walks the cheapest route it can see to a shot and that route is one
 * or two long balls, not eight square ones.
 *
 *     easy 1.6   normal 4.6   hard 6.2   extreme 5.0   ball 0.0
 *
 * So HARD is the tier that runs dry, not Easy. The whole content plan was
 * pointed at the wrong end of the ladder until the simulator said so.
 *
 * Ball reads 0.0 because no optimal route ever plays route one. It is still
 * stocked, because The Board lets a player pick any tier he likes and Ball is
 * the one people pick for fun, so it gets its own floor below.
 *
 * Re-run the simulator and update DEMAND if the ladder, the shapes or the
 * press ever change. The comment above each number is the point.
 */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
let fails = 0, warns = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- " + x));
  if (!c) fails++;
};
const warn = (n, c, x) => {
  if (!c) { console.log("  THIN  " + n + "   <-- " + x); warns++; }
  else console.log("  PASS  " + n);
};

/* questions of each tier a single match asks for, measured */
const DEMAND = { easy: 1.6, normal: 4.6, hard: 6.2, extreme: 5.0, ball: 1.0 };
/* Ball is given 1.0 rather than its measured 0.0 because The Board picks it by
   hand even though no pitch route ever does. */

/* A DECK HAS TO SURVIVE A NIGHT, not a match. Below three matches' worth the
   repeats start inside one sitting, which is the thing people notice, so that
   is the line that fails. Below six is thin enough to say out loud. */
const FAIL_AT = 3;
const WARN_AT = 6;

const DECKS = [
  ["Eredivisie", "eredivisie"],
  ["Premier League", "premier"],
  ["La Liga", "laliga"],
  ["Bundesliga", "bundesliga"],
  ["Serie A", "seriea"],
  ["Belgian Pro League", "belgian"],
];
const TIERS = ["easy", "normal", "hard", "extreme", "ball"];
const pad = (s, n) => String(s).padEnd(n);

console.log("--- how many matches each deck holds, tier by tier ---");
console.log("  " + pad("deck", 20) + TIERS.map(t => pad(t, 13)).join(""));
const rows = {};
for (const [label, dir] of DECKS) {
  const p = path.join(REPO, "assets", dir, "index.json");
  if (!fs.existsSync(p)) { check(label + " has a deck on disk", false, "no index.json"); continue; }
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  const matches = {};
  for (const t of TIERS) matches[t] = (d[t] || []).length / DEMAND[t];
  rows[label] = { d: d, matches: matches };
  console.log("  " + pad(label, 20) +
    TIERS.map(t => pad((d[t] || []).length + " (" + matches[t].toFixed(1) + "x)", 13)).join(""));
}

console.log("\n--- every tier must survive " + FAIL_AT + " matches ---");
for (const [label] of DECKS) {
  const r = rows[label];
  if (!r) continue;
  for (const t of TIERS) {
    const n = (r.d[t] || []).length;
    /* a tier the deck simply does not offer is a different thing from a thin
       one, and the app already falls through to the classic bank for it */
    if (!n) { console.log("  SKIP  " + label + " has no " + t + " tier at all"); continue; }
    check(label + " " + t + " lasts " + FAIL_AT + " matches",
      r.matches[t] >= FAIL_AT, n + " questions is " + r.matches[t].toFixed(1) + " matches");
  }
}

console.log("\n--- and ought to survive " + WARN_AT + " ---");
for (const [label] of DECKS) {
  const r = rows[label];
  if (!r) continue;
  for (const t of TIERS) {
    const n = (r.d[t] || []).length;
    if (!n) continue;
    warn(label + " " + t, r.matches[t] >= WARN_AT,
      n + " questions is " + r.matches[t].toFixed(1) + " matches, want " + Math.ceil(WARN_AT * DEMAND[t]));
  }
}

/* ---------- the classic bank, which every man without a career falls back to ---------- */
console.log("\n--- the classic bank, which is the floor under all of them ---");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const at = html.indexOf("const BANK = ");
if (at < 0) { check("the classic bank is in index.html", false, "BANK not found"); }
else {
  /* it is one object literal on one line; read the tier array lengths without
     evaluating the whole file */
  const chunk = html.slice(at, html.indexOf("\n};", at) + 3);
  for (const t of TIERS) {
    const m = chunk.match(new RegExp(t + "\\s*:\\s*\\["));
    check("the classic bank has a " + t + " tier", !!m, "no " + t + " key");
  }
}

console.log("\n" + (fails ? fails + " FAILED" : "no tier runs dry inside " + FAIL_AT + " matches") +
  (warns ? ", " + warns + " thin" : ""));
process.exit(fails ? 1 : 0);
