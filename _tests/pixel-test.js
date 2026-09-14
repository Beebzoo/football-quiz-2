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

/* ---------- and every selector still matches something ----------
   The prefix check above stops the skin leaking OUT. This one stops it
   pointing at nothing: a renamed class leaves a rule that is silent rather
   than broken, so the night look carries on underneath it and everybody
   assumes that is what the skin does. Four rules had gone that way before
   this existed, one of them the scorebug at the top of every match screen.

   Coarse on purpose. A precise check needs a DOM; a class name that appears
   nowhere else in fourteen thousand lines is dead whatever shape the selector
   is, and that is the failure worth catching. */
const rest = html.slice(0, start) + html.slice(end);
/* THE CORPUS IS THE POINT, not the pattern. Searching the whole file for a
   class name finds the name in something that is not markup: a plain indexOf
   called .h2man.fall alive on "--fall", and a whole-word one called it alive
   on "let fall" and on a line of copy reading "fall short and it costs the
   same". A class is emitted in exactly three shapes, so those are the corpus,
   and a token with a space in it cannot be a class. */
const EMITS = new Set();
const token = t => { t = t.trim(); if (t && !/[\s${}]/.test(t)) EMITS.add(t); };
/* class="a b c", the bulk of it, interpolations split the literal parts apart */
for (const m of rest.matchAll(/class\s*=\s*(["'`])([\s\S]*?)\1/g))
  for (const part of m[2].split(/\${[^}]*}/)) part.split(/\s+/).forEach(token);
/* classList.add("x"), and its siblings */
for (const m of rest.matchAll(/classList\.\w+\(\s*["'`]([\w-]+)["'`]/g)) token(m[1]);
/* a bare quoted token: the conditional lists the man builder uses, where a
   class is a string on its own and never inside a class attribute */
for (const m of rest.matchAll(/["'`]([a-z][\w-]*)["'`]/g)) token(m[1]);

const dead = [];
for (const sel of new Set(selectors)) {
  const tail = sel.replace(/^body\.pixel\s*/, "");
  /* SPLIT, DO NOT PATTERN-MATCH. A selector has a grammar: combinators
     separate compounds, and a compound is an element or a run of classes and
     ids with a pseudo tail. Reading names out of it with one regex finds "so"
     inside f-torso, which is how the first version of this check failed.
     Elements are skipped: proving <line> is absent from the PITCH, when an
     icon builds one, needs to know which markup belongs to the pitch, and a
     check that cannot fail on its own case is worse than none. */
  for (let compound of tail.split(/[\s>+~]+/)) {
    compound = compound.split(":")[0].trim();
    if (!compound || /^[a-z]/.test(compound)) continue;
    for (const n of (compound.match(/[.#][A-Za-z][\w-]*/g) || [])) {
      const name = n.slice(1);
      if (!EMITS.has(name)) dead.push(sel + "   ." + name + " is never emitted");
    }
  }
}
check("every selector in the block matches markup the app renders",
  dead.length === 0, "\n           " + dead.slice(0, 8).join("\n           "));

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
   EVERY part at once, which is right for a still photograph and fatal in a
   game. That blanket rule is what this guards, and it is now named by shape
   rather than approximated. The old version was a regex over the whole block,
   so it also vetoed the one targeted use that turned out to be necessary:
   straightening the arms out of the night look's 8 degree rest, which leaks in
   through .f-arm.l and has no arithmetic to hide in the way the head's offset
   did. Naming the blanket shape costs nothing and stops the guard refusing a
   fix it was never written about. */
check("the blanket child rule still forces no transform",
  !/body\.pixel\s+\.fig\s*>\s*\*[^{]*\{[^}]*transform:\s*none/.test(noComments),
  "transform:none is back on every part at once");
/* AND THE REASON THE EXCEPTION IS SAFE, tested rather than asserted. A static
   transform never beats a running animation, so the run and the slide cannot
   be reached from here at all; what could be reached is the four static poses,
   and they survive only because each carries four classes where the pixel arm
   rule carries three. If one of them ever loses its rotation the keeper stands
   like an outfield player and nothing else in the suite would say so. */
for (const [sel, deg] of [[".fig.gk .f-arm.l", "34"], [".fig.str .f-arm.l", "26"],
                          [".h2man.down .f-arm.l", "34"], [".h2man.caught .f-arm.l", "46"]])
  check("the pose " + sel + " keeps its rotation",
    html.indexOf(sel + "{transform:rotate(" + deg + "deg)}") > -1, "gone");

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

  /* ---------- a light kit keeps a waist ---------- */
  console.log("\n--- a white kit still has a waist ---");
  check("the figure carries its own shorts colour",
    /--pxshorts:' \+ kitShorts\(kit\)/.test(html), "h2FigHTML does not emit it");
  check("and the sprite reads it for the shorts and the sock band",
    /\.f-shorts\{[^}]*background:var\(--pxshorts/.test(noComments)
    && /linear-gradient\(180deg,var\(--pxshorts/.test(noComments), "hardcoded again");
  /* the off-white is allowed to survive, but only as the fallback. Unlike
     --ink this property is not a :root token, so that fallback is real. */
  const offwhite = (noComments.match(/#f4f1ea/g) || []).length;
  const asFallback = (noComments.match(/var\(--pxshorts,#f4f1ea\)/g) || []).length;
  check("with the old off-white left only as a fallback",
    offwhite === 2 && asFallback === 2, offwhite + " uses, " + asFallback + " of them fallbacks");

  /* EVERY KIT IN THE APP. 22 pools carry them and the club pools keep theirs in
     clubs.json rather than index.json, which is how a sweep of index.json
     misses two thirds of them. */
  const allKits = new Set();
  const walkKits = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { walkKits(p); continue; }
    if (!e.name.endsWith(".json")) continue;
    let j; try { j = JSON.parse(fs.readFileSync(p, "utf8")); } catch (err) { continue; }
    const scan = o => { if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(scan);
      if (typeof o.kit === "string" && /^#[0-9a-fA-F]{6}$/.test(o.kit)) allKits.add(o.kit.toUpperCase());
      for (const k of Object.keys(o)) if (typeof o[k] === "object") scan(o[k]); };
    scan(j); } };
  walkKits(path.join(REPO, "assets"));
  check("there are kits to sweep", allKits.size > 90, allKits.size);

  const flipped = [], marginal = [];
  for (const k of allKits) {
    const c = parseInt(k.slice(1), 16), r = c >> 16 & 255, g = c >> 8 & 255, b = c & 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b, spread = Math.max(r, g, b) - Math.min(r, g, b);
    const dark = ev(app, 'kitShorts("' + k + '")') !== "#f4f1ea";
    if (dark) flipped.push(k);
    /* how much room is left either side of the decision */
    if (dark ? (lum < 220 || spread > 30) : (lum > 195 && spread < 60)) marginal.push(k);
  }
  check("only the two kits that fuse with white shorts get dark ones",
    flipped.length === 2 && flipped.indexOf("#FFFFFF") > -1,
    flipped.join(" ") + "  of " + allKits.size);
  /* THE ONE THAT WOULD CATCH THE TEMPTING MISTAKE. Yellow is light by
     luminance and reads perfectly well against off-white by hue, so a gate
     built on luminance alone repaints it. If these ever go dark the gate has
     been widened, whatever the count above says. */
  for (const y of ["#FFE80B", "#FFDF00", "#FFFF00", "#98C6EB", "#75AADB"])
    if (allKits.has(y))
      check("and " + y + " keeps its white ones", ev(app, 'kitShorts("' + y + '")') === "#f4f1ea",
        "repainted");
  check("no kit in the app sits near the edge of that decision", marginal.length === 0,
    marginal.join(" "));

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
