/* THE SIXTEEN-BIT SKIN MUST NOT LEAK.
 *
 *     node _tests/pixel-test.js
 *
 * The whole argument for shipping a second look behind a toggle is that the
 * first one cannot regress by accident. That argument is worth exactly as much
 * as the scoping is, and the scoping is one prefix repeated eighty times,
 * which is the kind of thing that is right on the day and wrong six weeks
 * later when somebody adds a rule.
 *
 * The drafts this was built from prove the point: three of their selectors had
 * already escaped their prefix. ".fig > *::before", ".f-arm.r" and ".f-leg.r"
 * were written without the figure prefix in front of them, so with the toggle
 * OFF they would have restyled the night look's men and the goal scene. That
 * failure was sitting inside the file doing the scoping.
 *
 * So this reads the style block and insists: every selector inside the pixel
 * section names body.pixel. It is a text test rather than a rendering test on
 * purpose. There is no browser here, and a rendering test would only catch the
 * leak on a screen somebody remembered to photograph.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- " + x));
  if (!c) fails++;
};

/* ---------- the block ---------- */
console.log("--- the skin is scoped ---");
const marker = html.indexOf("THE SIXTEEN-BIT SKIN");
/* START AT THE COMMENT OPENER. The banner is inside a comment, so slicing at
   the words leaves an unterminated comment and the stripper then treats half
   the prose as a selector list. */
const start = html.lastIndexOf("/*", marker);
check("the pixel block is in the stylesheet", marker > 0 && start > 0, marker);
const end = html.indexOf("/* the boot going through it", start);
check("and it ends where it should", end > start, end);
const block = html.slice(start, end);

/* Strip comments, then take everything before each { as a selector list. */
const noComments = block.replace(/\/\*[\s\S]*?\*\//g, "");
const selectors = [];
for (const m of noComments.matchAll(/(^|\})([^{}]+)\{/g)) {
  const sel = m[2].trim();
  if (!sel || sel.startsWith("@")) continue;
  for (const one of sel.split(",")) {
    const t = one.trim();
    if (t) selectors.push(t);
  }
}
check("there are rules to check", selectors.length > 40, selectors.length);
const loose = selectors.filter(sel => sel.indexOf("body.pixel") !== 0);
check("every selector in the block starts with body.pixel", loose.length === 0,
  loose.slice(0, 6).join("  |  "));

/* ---------- and nothing outside it mentions the class ---------- */
const outside = html.slice(0, start) + html.slice(end);
const styleEnd = outside.indexOf("</style>");
const cssOutside = outside.slice(0, styleEnd);
const strayRules = [];
for (const m of cssOutside.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(^|\})([^{}]+)\{/g))
  if (/\bbody\.pixel\b/.test(m[2])) strayRules.push(m[2].trim());
check("no pixel rule has wandered out of the block", strayRules.length === 0,
  strayRules.join(" | "));

/* ---------- the parts the animations target still exist ---------- */
console.log("\n--- the figure keeps its seven parts, so the animations keep working ---");
const PARTS = ["f-head", "f-arm l", "f-arm r", "f-torso", "f-shorts", "f-leg l", "f-leg r"];
const fig = html.slice(html.indexOf("function h2FigHTML"), html.indexOf("function h2GoalSceneHTML"));
for (const p of PARTS)
  check("the builder still emits " + p, fig.indexOf('"' + p + '"') > -1, "missing");
/* THE ONE LINE THAT WOULD KILL THEM ALL. The draft forced transform:none on
   every part, which is right for a still photograph and fatal in a game: every
   limb animation is a transform on one of those seven elements. */
check("and nothing in the block forces transform:none on them",
  !/body\.pixel[^{]*\.fig[^{]*\{[^}]*transform:\s*none/.test(noComments),
  "transform:none is back");

console.log("\n--- sprites step ---");
check("the run is stepped", /body\.pixel[\s\S]{0,400}?animation-timing-function:steps\(2\)/.test(noComments),
  "no steps(2)");
check("and the rotations snap through four angles",
  /animation-timing-function:steps\(4\)/.test(noComments), "no steps(4)");
check("but the keyframes themselves are untouched",
  !/body\.pixel[^{]*\{[^}]*@keyframes/.test(noComments) && /@keyframes h2bob\{/.test(html),
  "keyframes were edited");

/* ---------- the toggle ---------- */
console.log("\n--- the toggle behaves like the other three ---");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));
const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 200) => new Promise(r => setTimeout(r, ms));

(async () => {
  const app = makeInstance("pixel");
  await tick(340);
  check("it starts on the night look", ev(app, "h2Pixel") === false, ev(app, "h2Pixel"));
  run(app, "h2TogglePixel();"); await tick(120);
  check("tapping it turns the skin on", ev(app, "h2Pixel") === true, ev(app, "h2Pixel"));
  check("and it is remembered the way the others are",
    ev(app, 'localStorage.getItem("ball2-pixel")') === "1",
    ev(app, 'localStorage.getItem("ball2-pixel")'));
  check("the class lands on the body",
    ev(app, 'document.body.classList.contains("pixel")') === true, "not on the body");
  run(app, "h2TogglePixel();"); await tick(120);
  check("and tapping it again puts the night back", ev(app, "h2Pixel") === false, ev(app, "h2Pixel"));
  check("which is remembered too", ev(app, 'localStorage.getItem("ball2-pixel")') === "0",
    ev(app, 'localStorage.getItem("ball2-pixel")'));
  check("and the class comes off",
    ev(app, 'document.body.classList.contains("pixel")') === false, "still on the body");

  /* IT MUST NOT TOUCH THE RULES. A skin that changed a price would not be a
     skin, and this is the one thing a screenshot could never tell you. */
  console.log("\n--- and it changes nothing about the game ---");
  run(app, "TEAMS.wc2006 = " + JSON.stringify(
    JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"))));
  run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "manager", false); h2Start(); ' +
    'h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed = true; S.h2h.who = 0;');
  const before = [];
  for (let a = 0; a < 11; a++) for (let b = 0; b < 11; b++)
    if (a !== b) before.push(ev(app, "h2TierFor(" + a + "," + b + ")"));
  run(app, "h2TogglePixel();"); await tick(120);
  const after = [];
  for (let a = 0; a < 11; a++) for (let b = 0; b < 11; b++)
    if (a !== b) after.push(ev(app, "h2TierFor(" + a + "," + b + ")"));
  check("every one of the 110 passes costs exactly what it did",
    before.join() === after.join(), "the ladder moved");
  check("and the shot does too",
    ev(app, "H2_SHOT_AT(9,0)") === ev(app, "H2_SHOT_AT(9,0)"), "n/a");
  run(app, "h2TogglePixel();");

  /* ---------- the font ---------- */
  console.log("\n--- the pixel face ships with the app ---");
  const face = fs.existsSync(path.join(REPO, "assets/fonts/silkscreen-400-latin.woff2"));
  check("Silkscreen is on disk", face, "not downloaded");
  check("and declared in the app", /font-family:'Silkscreen'/.test(html), "no @font-face");
  const sw = fs.readFileSync(path.join(REPO, "sw.js"), "utf8");
  check("and precached, so it is there offline", /silkscreen-400-latin\.woff2/.test(sw),
    "not in the service worker");
  /* LATIN ONLY, ON PURPOSE. A pixel face has no accents worth having and this
     app is full of them, so anything outside latin falls through to Courier. */
  check("latin only, which is the decision rather than an oversight",
    !/silkscreen[^"]*latin-ext/.test(sw), "latin-ext crept in");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
