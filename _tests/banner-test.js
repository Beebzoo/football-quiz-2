/* THE BANNER: the art parses, the whole cycle draws, and the loop dies.
 *
 *     node _tests/banner-test.js
 *
 * Four things can go wrong here and not one of them shows up on a screenshot.
 *
 * A SCREENSHOT ONLY TESTS THE INSTANT IT LANDS ON. This is the spec's own
 * hardest-won rule and it is the reason for the sweep below: while it was being
 * drawn, a function went missing in a bulk edit and the page threw on every
 * frame after the chip. Three separate screenshots all happened to land before
 * it and all looked perfect. So this steps the entire cycle at four hundred
 * points through the real drawing code and counts the throws, rather than
 * sampling it and hoping.
 *
 * A HARD-CODED ARRAY LENGTH OUTLIVES THE ART. The same spec had a [0,1,2,3]
 * survive the move from four poses to eight, which left frames four to seven
 * undefined and killed the animation on the first frame that reached for one.
 * So the pose count is asserted to be derived from the art and not written down
 * twice.
 *
 * A TYPO IN A GRID IS A MISSING PIXEL NOBODY NOTICES. One letter per pixel over
 * eight leg poses and a body is a lot of characters, and a row that is 31 long
 * draws a notch in a boot you will look past for six weeks.
 *
 * AND THE CANVAS IS NOT CALLED "stage". The spec's own markup calls it that,
 * because on a page of its own that is the obvious name. In here #stage is the
 * one element every screen in the app is rendered into, so the two would have
 * fought over the single most load-bearing id in the file. That is asserted
 * here so nobody re-introduces it by pasting the spec in again.
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

/* ---------- the block, run for real against a recording canvas ----------
   Not a regex over the source. The banner is a closure that hands back four
   functions, so the honest test is to run it and drive it, and the only thing
   standing between here and that is a canvas. A recording stub is enough: the
   drawing code does not read anything back, it only paints. */
console.log("--- the banner block loads and runs ---");
const a0 = html.indexOf("/* ======================== THE BANNER ========================");
const a1 = html.indexOf("\nfunction renderSetup", a0);
check("the banner block is in the file", a0 > 0 && a1 > a0, a0 + ".." + a1);

const rec = { fills: 0, draws: 0, clears: 0, styles: new Set() };
const ctxStub = () => ({
  set fillStyle(v){ rec.styles.add(String(v)); }, get fillStyle(){ return "#000"; },
  imageSmoothingEnabled: false,
  setTransform(){}, clearRect(){ rec.clears++; }, fillRect(){ rec.fills++; },
  drawImage(){ rec.draws++; }, beginPath(){}, ellipse(){}, fill(){},
  translate(){}, scale(){}, save(){}, restore(){},
});
const canvasStub = () => ({ width: 0, height: 0, getContext: ctxStub });
const sandbox = {
  document: { createElement: () => canvasStub(), getElementById: () => canvasStub() },
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: () => 0, cancelAnimationFrame(){},
  Math: Math, console: console,
};
let BN = null, loadErr = null;
try { BN = vm.runInNewContext(html.slice(a0, a1) + ";BN", sandbox); }
catch (e) { loadErr = e; }
check("it evaluates without throwing", !loadErr, loadErr && loadErr.message);
check("and hands back its four functions",
  BN && typeof BN.start === "function" && typeof BN.stop === "function"
  && typeof BN.sweep === "function" && typeof BN.paint === "function", BN && Object.keys(BN).join());

/* ---------- the art ---------- */
console.log("\n--- the art is self consistent ---");
const grids = (BN && BN.art) || {PAL:{},BASE:[],LEGS:[],BALL:[],SQUASH:[],NUMBER:[]};
const letters = new Set(Object.keys(grids.PAL));
const widths = g => new Set(g.map(r => r.length));
check("the body is one width all the way down", widths(grids.BASE).size === 1,
  [...widths(grids.BASE)].join());
check("every leg pose is that same width",
  grids.LEGS.every(p => [...widths(p)][0] === [...widths(grids.BASE)][0]
    && widths(p).size === 1), "a pose is a different width");
check("and every pose is the same number of rows",
  new Set(grids.LEGS.map(p => p.length)).size === 1,
  grids.LEGS.map(p => p.length).join());
const stray = new Set();
for (const g of [grids.BASE, grids.SQUASH, grids.NUMBER].concat(grids.LEGS, grids.BALL))
  for (const row of g) for (const ch of row) if (!letters.has(ch)) stray.add(ch);
check("no character outside the palette", stray.size === 0, [...stray].join());
check("and no palette entry that nothing uses", (() => {
  const used = new Set();
  for (const g of [grids.BASE, grids.SQUASH, grids.NUMBER].concat(grids.LEGS, grids.BALL))
    for (const row of g) for (const ch of row) used.add(ch);
  return [...letters].every(k => used.has(k));
})(), "an unused colour");

/* THE POSE COUNT IS DERIVED. A [0,1,2,3] written down beside an eight-pose art
   set is the bug that killed this on its first frame, so the number the code
   uses has to come out of the art rather than out of a literal. */
console.log("\n--- the pose count comes out of the art ---");
check("the block reports as many poses as it has drawn",
  BN && BN.poses === grids.LEGS.length, BN && BN.poses + " vs " + grids.LEGS.length);
/* The bug shape exactly: a written-down list of indices handed straight to the
   frame builder. A data array that merely happens to begin 0, 1, 2, 3 is not
   this, and the first version of this check could not tell the two apart. */
check("and no literal pose list is handed to the frame builder",
  !/\[[\s\d,]+\]\s*\.map\s*\(\s*\w+\s*=>\s*build\(/.test(html.slice(a0, a1)),
  "a hard-coded pose list");

/* ---------- the whole cycle ---------- */
console.log("\n--- the whole cycle draws, not a sample of it ---");
const bad = BN ? BN.sweep(canvasStub(), .0025) : -1;
check("four hundred points through the cycle and nothing throws", bad === 0, bad);
check("and it actually painted", rec.fills > 1000 && rec.draws > 400,
  rec.fills + " fills, " + rec.draws + " blits");

/* ---------- the id, and the one it must not take ---------- */
console.log("\n--- it does not fight the app for an id ---");
check("the app still has exactly one #stage",
  (html.match(/\$\("#stage"\)/g) || []).length === 1,
  (html.match(/\$\("#stage"\)/g) || []).length);
/* the app's own container is legitimately id="stage". What must not exist is a
   CANVAS called that, which is what the spec's markup would have pasted in. */
check("no canvas has taken the app's stage id",
  html.indexOf('<canvas id="stage"') < 0, "the spec's own id got pasted in");
check("it is bnstage, once, in the menu head",
  (html.match(/id="bnstage"/g) || []).length === 1,
  (html.match(/id="bnstage"/g) || []).length);
check("and the canvas sits after the words, so the ball crosses in front",
  html.indexOf('<canvas id="bnstage"') > html.indexOf('<div class="words">'), "behind the type");

/* ---------- the loop's life ---------- */
console.log("\n--- the loop starts and stops with the menu ---");
const r0 = html.indexOf("function render()");
const rEnd = html.indexOf("\nfunction ", r0 + 20);
const body = html.slice(r0, rEnd);
check("render() stops it before it acquires the stage",
  body.indexOf("BN.stop()") > -1 && body.indexOf("BN.stop()") < body.indexOf('$("#stage")'),
  "not stopped first");
check("and nothing else in the file starts it",
  (html.match(/BN\.start\(\)/g) || []).length === 1,
  (html.match(/BN\.start\(\)/g) || []).length);
check("the frames are not built at parse time",
  !/^const (FRAME|BALLC)\s*=/m.test(html.slice(a0, a1)), "built eagerly");

/* ---------- and the fifty-one names stay inside ---------- */
console.log("\n--- nothing leaked out of the closure ---");
/* THE SECOND CLOSURE. The shot scene is built the same way and for the same
   reason, and it uses several of these same short names inside itself, which is
   precisely what a closure is for. So it is excised alongside the banner rather
   than being allowed to fail this. What is asserted here is that none of these
   names is loose at FILE level, not that one function in the app is the only
   one allowed a variable called ctx, and anything sitting between the two
   blocks is still caught. */
const s0 = html.indexOf("/* ======================== THE SHOT, IN PIXELS ===");
const s1 = html.indexOf("\n/* One footballer, built once", s0);
check("the shot scene is a closure too", s0 > 0 && s1 > s0, s0 + ".." + s1);
let outside = html;
for (const [x, y] of [[a0, a1], [s0, s1]].sort((p, q) => q[0] - p[0]))
  if (x > -1 && y > x) outside = outside.slice(0, x) + outside.slice(y);
const leaked = ["W", "H", "PAL", "BASE", "LEGS", "BALL", "draw", "goal", "ball", "pose", "line", "cv", "ctx"]
  .filter(n => new RegExp("^(?:const|let|var|function)\\s+" + n + "\\b", "m").test(outside));
check("none of the spec's top-level names is loose in the file",
  leaked.length === 0, leaked.join(" "));

console.log(fails ? "\n" + fails + " FAILING CHECK(S)" : "\nALL PASS");
process.exit(fails ? 1 : 0);
