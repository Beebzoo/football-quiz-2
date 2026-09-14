/* THE KEEPIE-UPPIE HERO: the art parses, the maths lands, and the loop dies.
 *
 *     node _tests/hero-test.js
 *
 * Three things can go wrong with him and none of them shows up on a screenshot.
 *
 * A TYPO IN A GRID IS A MISSING PIXEL NOBODY NOTICES. One letter per pixel over
 * 34 rows of 32, four leg poses and two ball rotations is about 1,700 characters
 * of art, and a row that is 31 long or a stray "l" where an "I" was meant draws
 * a hole in a boot that you will look straight past for six weeks.
 *
 * THE CONSTANTS ARE MEASURED OFF THE GRIDS, not chosen. HS_FOOT is 63 because
 * the touch pose holds its raised boot at canvas row 72 and the ball is 9 tall.
 * Move that boot in the art and the ball starts landing in mid air, so the
 * relationship is asserted here rather than left in a comment. The same goes
 * for the bob: it lifts the base a pixel on two frames, and before HS_PAD
 * existed that pixel was the top row of the head going over the edge of the
 * baked frame, which took the black cap off the crown for 45% of the cycle.
 *
 * AND A REQUESTANIMATIONFRAME LEFT RUNNING is a phone battery spent on a menu
 * nobody is looking at. The claim the whole design rests on is that render() is
 * the only choke point, so that is tested as a fact about the file and not as a
 * list of call sites somebody has to keep up to date.
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

/* ---------- the art, read out of the file as real arrays ----------
   Slicing and evaluating beats a regex over the quoted rows: the grids are
   already valid JS, so anything that parses here is exactly what the app sees,
   and anything that does not parse fails loudly instead of being skipped. */
console.log("--- the grids parse ---");
const a0 = html.indexOf("const HS_PAL = {");
const a1 = html.indexOf("const HS_W = 32", a0);
check("the art block is in the file", a0 > 0 && a1 > a0, a0 + ".." + a1);
const ART = vm.runInNewContext(html.slice(a0, a1) +
  ";({HS_PAL:HS_PAL,HS_BASE:HS_BASE,HS_LEGS:HS_LEGS,HS_BALL:HS_BALL})");

const HS_W = 32, HS_H = 53, HS_LEGTOP = 34;
check("the base is 34 rows", ART.HS_BASE.length === HS_LEGTOP, ART.HS_BASE.length);
check("there are four leg poses", ART.HS_LEGS.length === 4, ART.HS_LEGS.length);
check("each of 19 rows, so base plus legs is the sprite's 53",
  ART.HS_LEGS.every(p => p.length === HS_H - HS_LEGTOP), ART.HS_LEGS.map(p => p.length).join(","));
check("and two ball rotations of 9", ART.HS_BALL.length === 2 &&
  ART.HS_BALL.every(r => r.length === 9), ART.HS_BALL.map(r => r.length).join(","));

/* EVERY ROW THE SAME WIDTH. A short row is not a crash, it is a column of the
   sprite that silently stops existing partway down. */
const manRows = [].concat(ART.HS_BASE, ...ART.HS_LEGS);
const wrongW = manRows.filter(r => r.length !== HS_W);
check("every row of the man is 32 wide", wrongW.length === 0,
  wrongW.length + " rows, first is " + (wrongW[0] || "").length + " long");
const wrongB = [].concat(...ART.HS_BALL).filter(r => r.length !== 9);
check("every row of the ball is 9 wide", wrongB.length === 0, wrongB.length + " rows");

/* ONLY PALETTE LETTERS. HS_PAL returns undefined for a letter it has never
   heard of, hsGrid skips it the same way it skips a dot, and the pixel is just
   gone. Nothing anywhere would ever say so. */
const pal = new Set(Object.keys(ART.HS_PAL));
const stray = {};
for (const r of [].concat(manRows, ...ART.HS_BALL))
  for (const ch of r) if (!pal.has(ch)) stray[ch] = (stray[ch] || 0) + 1;
check("no character outside the palette", Object.keys(stray).length === 0,
  Object.entries(stray).map(([c, n]) => JSON.stringify(c) + " x" + n).join(" "));
/* and the other way round, because a palette entry with no pixels is a colour
   somebody thought they changed */
const used = new Set([].concat(manRows, ...ART.HS_BALL).join("").split(""));
const unused = [...pal].filter(k => !used.has(k));
check("and no palette entry that nothing uses", unused.length === 0, unused.join(" "));

/* ---------- the app still loads, which is the point of building lazily ----------
   The whole hero used to be two module-scope consts calling
   createElement("canvas").getContext("2d"), and the harness has no canvas, so
   the app threw on the load line and took 24 of the 26 test files with it. This
   check is the one that would have caught that, so it goes first. */
console.log("\n--- the app loads under a DOM with no canvas in it ---");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));
const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);

let app = null;
try { app = makeInstance("hero"); } catch (e) { /* reported by the check below */ }
check("makeInstance got all the way through the script", !!app, "the load threw");
check("and nothing was built on the way in", app && ev(app, "hsFrames") === null,
  app && ev(app, "hsFrames"));
check("so the loop is not running either", app && ev(app, "hsRAF") === null,
  app && ev(app, "hsRAF"));

/* ---------- the constants are measured off the art ---------- */
console.log("\n--- the renderer's numbers still match the grids ---");
const K = n => ev(app, n);
const HS_HR = K("HS_HR"), HS_PAD = K("HS_PAD"), HS_FOOT = K("HS_FOOT"), HS_BOB = ev(app, "HS_BOB");
/* THE BOB MUST NOT WALK OFF THE TOP OF THE BAKED FRAME. hsGrid draws the base
   at HS_PAD + HS_BOB[i]; the instant that goes negative, fillRect is asked for
   row -1, the canvas quietly drops it, and the crown of the head loses its
   outline on exactly the frames that were supposed to be a weight shift. */
check("the pad covers the deepest bob", HS_PAD + Math.min(...HS_BOB) >= 0,
  "HS_PAD " + HS_PAD + " vs bob " + Math.min(...HS_BOB));
check("and the pad is not so deep the legs fall off the bottom",
  HS_PAD + HS_LEGTOP + (HS_H - HS_LEGTOP) <= HS_H + HS_PAD, "frame too short");

/* THE BALL LANDS ON THE LACES, derived rather than asserted. Pose 2 is the
   touch, its raised boot is the run of b and B furthest from the standing leg,
   and the ball is 9 tall, so the top of the ball at contact is the top of that
   boot minus 9. If somebody redraws the boot this is the check that notices. */
const touch = ART.HS_LEGS[2];
let bootTop = -1;
for (let y = 0; y < touch.length && bootTop < 0; y++) {
  /* the standing leg holds cols 9 to 14 in every pose, so anything boot
     coloured out past col 15 is the raised one */
  for (let x = 16; x < HS_W; x++) if (touch[y][x] === "b" || touch[y][x] === "B") { bootTop = y; break; }
}
check("the touch pose has a raised boot", bootTop > -1, bootTop);
const bootCanvasRow = HS_HR + HS_LEGTOP + bootTop;
check("HS_FOOT puts the bottom of the ball on the top of that boot",
  HS_FOOT + 9 === bootCanvasRow, "HS_FOOT " + HS_FOOT + " + 9 = " + (HS_FOOT + 9) +
  ", boot top is canvas row " + bootCanvasRow);

/* AND THE BALL STAYS INSIDE THE CANVAS at both ends of the arc. The headroom is
   the only reason the canvas is taller than the man, so it is worth proving it
   is enough rather than assuming the apex happens to fit. */
const HS_CW = K("HS_CW"), HS_CH = K("HS_CH");
let lo = 1e9, hi = -1e9, rt = -1e9;
for (let i = 0; i <= 1000; i++) {
  const u = i / 1000, arc = 1 - Math.pow(2 * u - 1, 2);
  const by = Math.round(HS_FOOT - arc * HS_FOOT), bx = Math.round(21 + 3 * Math.sin(u * Math.PI));
  lo = Math.min(lo, by); hi = Math.max(hi, by + 8); rt = Math.max(rt, bx + 8);
}
check("the arc clears the top of the canvas", lo >= 0, "apex row " + lo);
check("and the bottom of it", hi < HS_CH, "lowest row " + hi + " of " + HS_CH);
check("and the ball never runs off the right edge", rt < HS_CW, "col " + rt + " of " + HS_CW);

/* ---------- one choke point, proved as a fact about the file ----------
   This is the check that makes "hsStop on every route out of the menu" a thing
   you can rely on instead of a thing somebody remembered. The stage element is
   acquired in exactly one place, so a single hsStop at the top of that function
   covers a match, the album, the Cup, the daily and a guest's own turn. Add a
   second acquirer and this fails, which is the note to whoever added it. */
console.log("\n--- the loop has one way in and one way out ---");
/* COMMENTS OUT FIRST, and not for tidiness: the comment that explains this very
   rule names the stage selector in its own prose, so a raw count of the file
   finds two and the check fails on the strength of the note written to defend
   it. Stripping block comments counts the code, which is what was meant. */
const js = html.slice(html.indexOf("</style>")).replace(/\/\*[\s\S]*?\*\//g, "");
const stageGets = (js.match(/\$\("#stage"\)/g) || []).length +
  (js.match(/getElementById\("stage"\)/g) || []).length;
check("exactly one place in the app acquires the stage", stageGets === 1, stageGets);
const body = js.slice(js.indexOf("function render(){"), js.indexOf("function renderBoard(st){"));
check("render() stops the loop before it acquires the stage",
  body.indexOf("hsStop();") > -1 && body.indexOf("hsStop();") < body.indexOf('$("#stage")'),
  "hsStop is missing or too late");
/* the semicolon is what tells a call apart from the declaration: hsStart(){
   matches a bare hsStart() and would count as the function calling itself */
const starts = (js.match(/hsStart\(\);/g) || []).length;
check("and starts it again only in the branch that renders the menu",
  starts === 1 && /renderSetup\(st\);[\s\S]{0,400}?hsStart\(\);/.test(body),
  starts + " call sites");

/* ---------- the markup ---------- */
console.log("\n--- the head carries the canvas and not the cutout ---");
const headStart = html.indexOf('<div class="mm-head">');
const mmhead = html.slice(headStart, html.indexOf('<div class="mm-page">', headStart));
check("the hero canvas is in the menu head", /<canvas id="herosprite"/.test(mmhead), mmhead.slice(-160));
check("and nothing in the head is an img any more", !/<img/.test(mmhead), "an img survived");
check("the canvas is sized from the same constants the renderer paints with",
  /width="\$\{HS_CW\*hsScale\}" height="\$\{HS_CH\*hsScale\}"/.test(mmhead), "hardcoded px");
check("and the stylesheet keeps the upscale hard",
  /#herosprite\{[^}]*image-rendering:pixelated/.test(html), "no image-rendering:pixelated");
check("with no .mm-head img rule left pointing at nothing",
  html.indexOf(".mm-head img") === -1, "the old rule is still there");

/* ---------- and now drive it ---------- */
(async () => {
  console.log("\n--- it runs on the menu and stops on the way into a match ---");
  /* A CANVAS THIN ENOUGH TO PAINT INTO. The shim's createElement returns a bare
     object, which is the whole reason the frames are built lazily, so the test
     that wants to watch him paint has to supply the one thing the app asks for.
     Recording the calls rather than the pixels is deliberate: what is being
     tested here is the loop's life, and the pixels are tested above as art. */
  const rec = { rects: 0, blits: 0, ellipses: 0 };
  const ctxFor = el => ({ canvas: el, fillStyle: "", globalAlpha: 1, imageSmoothingEnabled: true,
    setTransform() {}, clearRect() {}, beginPath() {}, ellipse() {},
    fill() { rec.ellipses++; }, fillRect() { rec.rects++; }, drawImage() { rec.blits++; } });
  const doc = app.document, made = doc.createElement.bind(doc);
  doc.createElement = t => { const e = made(t); if (t === "canvas") e.getContext = () => ctxFor(e); return e; };
  const cv = doc.__live("herosprite", "");
  cv.getContext = () => ctxFor(cv);

  run(app, "S = null; ALBUM_VIEW = false; CUP_VIEW = false; DREAM_VIEW = false; showBoard = false; render();");
  check("the menu starts him", ev(app, "hsRAF") !== null, "hsRAF is null on the menu");
  check("the frames were built on that first paint", ev(app, "hsFrames.length") === 4,
    ev(app, "hsFrames && hsFrames.length"));
  check("and he actually painted", rec.blits > 0 && rec.ellipses > 0,
    rec.blits + " blits, " + rec.ellipses + " ellipses");
  check("the canvas was sized to the scale the markup asked for",
    ev(app, "hsScale") * ev(app, "HS_CW") === cv.width, cv.width);

  /* THE FIVE ROUTES OUT, each a different early return inside render(). The
     album, the Cup and the daily were named in the plan alongside the match,
     and they leave by different doors, so they are worth walking separately. */
  const away = (name, stmt) => {
    run(app, "S = null; ALBUM_VIEW = false; CUP_VIEW = false; DREAM_VIEW = false; showBoard = false; render();");
    const on = ev(app, "hsRAF") !== null;
    run(app, stmt);
    check("into " + name + ", and the loop is stopped", on && ev(app, "hsRAF") === null,
      on ? "hsRAF survived" : "he was not running to begin with");
  };
  away("a match", 'S = freshState(["Martijn","Bram"], false, "classic", 0, "board", false); render();');
  away("the album", "ALBUM_VIEW = true; render();");
  away("the Cup", "CUP_VIEW = true; render();");
  away("the dream team", "DREAM_VIEW = true; render();");
  away("the table", "showBoard = true; render();");

  run(app, "S = null; ALBUM_VIEW = false; CUP_VIEW = false; DREAM_VIEW = false; showBoard = false; render();");
  check("and coming back to the menu starts him again", ev(app, "hsRAF") !== null, "still stopped");

  /* ---------- reduced motion ---------- */
  console.log("\n--- prefers-reduced-motion parks him ---");
  run(app, "hsStop();");
  app.matchMedia = () => ({ matches: true, addEventListener() {} });
  const before = rec.blits;
  run(app, "render();");
  check("no loop is started", ev(app, "hsRAF") === null, ev(app, "hsRAF"));
  check("but he is still drawn, once", rec.blits > before, "nothing painted");
  /* u = .35 is the planted pose with the ball near the top of its arc. Assert
     the frame he is parked on rather than the number, because the number is
     only interesting for the pose it picks. */
  check("on the planted pose", ev(app, "hsPose(.35)") === 0, ev(app, "hsPose(.35)"));
  check("with the ball high", ev(app, "Math.round(HS_FOOT - (1 - Math.pow(2*.35-1,2)) * HS_FOOT)") < 10,
    ev(app, "Math.round(HS_FOOT - (1 - Math.pow(2*.35-1,2)) * HS_FOOT)"));
  /* AND IT STAYS REPAINTABLE. Leaving hsRAF null under reduced motion is what
     lets the next render draw him again rather than being turned away by the
     guard at the top of hsStart, so a theme change or a toggle tap does not
     leave an empty square in the corner of the menu. */
  const stillOne = rec.blits;
  run(app, "render();");
  check("and every later render repaints him", rec.blits > stillOne, "he went blank");

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
