/* THE SHOT SCENE, DRIVEN FRAME BY FRAME AND READ OFF THE PIXELS.
 *
 *     node _tests/shot-test.js
 *
 * The scene is a canvas now, which changes what a test of it can be. There is
 * no markup left to search for a keeper in, so almost everything below runs the
 * real drawing code against a recording context that keeps a framebuffer, and
 * then asks what is actually painted where. That is a better test than the one
 * it replaces, not a worse one: "the markup contains the string g3-keeper" was
 * only ever evidence that a div had been written.
 *
 * THE FOUR THINGS THIS EXISTS TO CATCH.
 *
 * THE PICKER COMING OFF THE GOAL. This is the one that would actually cost
 * somebody a match, and it is the only failure here that is silent: the overlay
 * still looks like a goal divided in four, it is just no longer divided over
 * the goal that got painted. So the four percentages are not compared against
 * a remembered set of numbers, they are walked back into canvas space and the
 * PIXELS either side of each edge are read. Inside the left edge must not be a
 * post and just outside it must be, or the edge is not where the post is. Done
 * for every camera, because a camera is exactly the thing that moves the goal.
 *
 * FOUR CORNERS COLLAPSING BACK INTO TWO. The prototype shipped one dive sprite
 * and mirrored it, so top left and bottom left drew the identical frame. Two
 * frames that differ by a pixel would pass an equality check and still be
 * wrong, so this measures the GLOVES: for a low corner they have to be below
 * where they are for a high one, by enough to see.
 *
 * A FRAME THAT THROWS SOMEWHERE IN THE MIDDLE. A screenshot only tests the
 * instant it lands on. The banner shipped a chip that threw on every frame
 * after it while three separate screenshots all happened to land before the
 * fault. So every camera, every outcome and both mirrors are stepped end to
 * end and the throws are counted rather than sampled.
 *
 * AND getContext AT PARSE TIME, which has taken this whole suite down twice.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const src = html.replace(/\r\n/g, "\n");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 200) => new Promise(r => setTimeout(r, ms));
const stage = c => (c.__els["stage"] ? c.__els["stage"].innerHTML : "");
let fails = 0;
const check = (n, c, x) => {
  console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x));
  if (!c) fails++;
};

/* ---------- the block, as text ---------- */
const g0 = src.indexOf("/* ======================== THE SHOT, IN PIXELS ===");
const g1 = src.indexOf("\n/* One footballer, built once", g0);
console.log("--- it is one closure, and it builds nothing until it is painting ---");
check("the block is in the file", g0 > 0 && g1 > g0, g0 + ".." + g1);
const block = src.slice(g0, g1);
/* THE ONE THAT HAS KILLED THIS SUITE TWICE. Both the menu hero and the banner
   went out with a canvas built at parse time, and the harness's DOM has no
   canvas in it, so every suite in the directory died on load. It is asserted by
   position rather than by absence: there may be as many getContext calls as the
   drawing wants, as long as every one of them is inside the function that is
   only ever reached from a requestAnimationFrame. */
/* comments first: the prose in here says the word getContext several times,
   and a test that cannot tell prose from code is a test that fails on its own
   documentation. */
const code = block.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const paintAt = code.indexOf("function paint(u, el)");
check("paint() is where the context is taken", paintAt > 0, paintAt);
const early = [];
let at = code.indexOf("getContext(");
while (at > -1) { if (at < paintAt) early.push(at); at = code.indexOf("getContext(", at + 1); }
/* a property check is not a call: canvasEl() asks whether el.getContext EXISTS,
   which is the guard that keeps the harness alive, so only an actual call
   counts against this. */
check("and nothing calls for one before it", early.length === 0, early.join(","));
check("every name in it is inside the closure",
  /^const G3 = \(function\(\)\{/m.test(block) && /^\}\)\(\);$/m.test(block.trim()),
  "the closure is not closed");

/* ---------- the stylesheet no longer owns the mouth ---------- */
console.log("\n--- the four numbers live in one place ---");
const styleEnd = src.indexOf("</style>");
const css = src.slice(0, styleEnd);
check("the stylesheet declares none of them",
  !/--gm[LRTH]\s*:/.test(css), (css.match(/--gm[LRTH]\s*:[^;}]*/g) || []).join(" "));
check("and it has no fallback to drift towards either",
  !/var\(--gm[LRTH]\s*,/.test(css), (css.match(/var\(--gm[LRTH][^)]*\)/g) || []).join(" "));
check("the picker is still pinned to them",
  /\.h2gm\{position:absolute;left:var\(--gmL\);right:var\(--gmR\);top:var\(--gmT\);height:var\(--gmH\)/.test(css),
  "the overlay has come off the custom properties");
check("and it still sits over the keeper rather than under the goal",
  /\.h2gm\{[^}]*z-index:7/.test(css), "wrong stacking");
check("h2GoalSceneHTML is the only thing that writes them",
  (src.match(/--gmL:/g) || []).length === 1, (src.match(/--gmL:/g) || []).length);
/* the still frame is the canvas's job now, so this is where it has to be true */
check("a man who asked for less movement is painted the END of the shot",
  /if\(PEND\.hold \|\| PEND\.rm\)\{ paint\(PEND\.hold \? STILL : 1\); return; \}/.test(block) &&
  /cfg\.rm = still\(\);/.test(block),
  "reduced motion does not hold the last frame");
/* AND IT HAS TO OUTRANK THE RULE IT IS SWITCHING OFF, which a bare .g3-cry does
   not: the shout is animated by ".g3.scored .g3-cry", three selectors to one,
   and a media query adds no specificity of its own. Written the short way the
   animation simply wins and the man who asked for less movement watches the
   whole thing scale in anyway, which is what the browser actually did. */
check("and the shout stops moving with it",
  /@media \(prefers-reduced-motion: reduce\)\{\n\s*\.g3\.scored \.g3-cry,\.g3\.saved \.g3-cry,\.g3\.missed \.g3-cry\{animation:none;opacity:1\}/.test(css),
  "the shout still animates");

/* ---------- a recording canvas ----------
   Not a stub that counts calls: a framebuffer. The drawing never reads a pixel
   back, so keeping one costs nothing and it is the difference between "it
   painted eleven thousand times" and "the post is at x=21". */
function recorder(W, H) {
  const px = [];
  for (let y = 0; y < H; y++) px.push(new Array(W).fill(null));
  let cur = "#000000", fills = 0;
  const ctx = {
    imageSmoothingEnabled: false,
    set fillStyle(v) { cur = String(v); },
    get fillStyle() { return cur; },
    setTransform() {}, save() {}, restore() {}, beginPath() {}, ellipse() {}, fill() {},
    clearRect() { for (let y = 0; y < H; y++) px[y].fill(null); },
    fillRect(x, y, w, h) {
      fills++;
      const x0 = Math.round(x), y0 = Math.round(y), x1 = x0 + Math.round(w), y1 = y0 + Math.round(h);
      for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++)
        if (i >= 0 && i < W && j >= 0 && j < H) px[j][i] = cur;
    },
  };
  return {
    el: { width: W * 5, height: H * 5, getContext: () => ctx },
    px: px,
    get fills() { return fills; },
    at: (x, y) => (px[y] && px[y][x]) || null,
    band(y0, y1) { const s = new Set();
      for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) if (px[y][x]) s.add(px[y][x]);
      return s; },
    count(col) { let n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[y][x] === col) n++;
      return n; },
    where(col) { const out = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (px[y][x] === col) out.push([x, y]);
      return out; },
  };
}

(async () => {
  const app = makeInstance("shot");
  await tick(340);
  const WC = JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"));
  run(app, "TEAMS.wc2006 = " + JSON.stringify(WC));
  run(app, "h2TackleOn = false;");

  const SZ = ev(app, "G3.size");
  const CW = SZ.CW, CH = SZ.CH;
  const CAMS = Object.keys(ev(app, "G3.cams"));
  const CORNERS = ev(app, "H2_CORNERS");

  /* ---------- the art ----------
     A row one character short is a missing pixel you will look past for six
     weeks, and there are two hundred rows of it in there. */
  console.log("\n--- every grid is square ---");
  const art = ev(app, "JSON.stringify(G3.art)");
  const A = JSON.parse(art);
  const ragged = [];
  const gridOk = (name, g) => {
    const w = g[0].length;
    g.forEach((r, i) => { if (r.length !== w) ragged.push(name + " row " + i + " is " + r.length + " not " + w); });
    return w;
  };
  check("the striker's body is 36 wide", gridOk("BODY", A.BODY) === 36, A.BODY[0].length);
  A.LEGS.forEach((p, i) => gridOk("LEGS[" + i + "]", p));
  A.RUN.forEach((p, i) => gridOk("RUN[" + i + "]", p));
  A.GK.forEach((p, i) => gridOk("GK[" + i + "]", p));
  gridOk("DEF", A.DEF);
  check("and no row anywhere is short", ragged.length === 0, ragged.slice(0, 4).join(" | "));
  /* THE COUNT IS DERIVED, NEVER WRITTEN DOWN. A hard-coded array length outlives
     the art it was written for: this very app once carried a [0,1,2,3] through a
     move from four poses to eight and killed the animation on frame four. */
  check("the strike is four poses and the approach is two",
    A.LEGS.length === 4 && A.RUN.length === 2, A.LEGS.length + "/" + A.RUN.length);
  check("and the keeper has a set, a high dive and a low one", A.GK.length === 3, A.GK.length);
  check("the legs are a separate strip, stamped under one body",
    A.LEGS[0].length === 9 && A.BODY.length === 31, A.LEGS[0].length + "/" + A.BODY.length);

  /* ---------- the one that matters ---------- */
  console.log("\n--- the picker is pinned to the goal that got painted ---");
  run(app, `function __cfg(o){
    const kit = "#e04a34", gk = "#3d7ae8", P = G3.art.PAL, mix = G3.mix;
    const base = {cam:"close", flip:false, out:"scored", shot:"tl", dive:"tl", hold:false, no:9,
      strPal: Object.assign({}, P, {k:kit, K:mix(kit,"#000000",.34), j:mix(kit,"#ffffff",.26),
                                    n:"#ffffff", w:"#f4f1ea", W:mix("#f4f1ea","#000000",.18)}),
      gkPal:  Object.assign({}, P, {g:gk, G:mix(gk,"#000000",.34), e:mix(gk,"#ffffff",.26),
                                    d:gk, D:mix(gk,"#000000",.34), w:"#f4f1ea", W:mix("#f4f1ea","#000000",.18)}),
      sig:"t" + Math.random()};
    return Object.assign(base, o || {});
  }`);
  const POST = "#eef3f5", POSTD = "#9fb0b4";
  const isPost = c => c === POST || c === POSTD;
  const draw = (o, u) => {
    const r = recorder(CW, CH);
    app.__rec = r;
    run(app, "G3.arm(__cfg(" + JSON.stringify(o) + ")); G3.stop();");
    run(app, "G3.paint(" + u + ", __rec.el)");
    return r;
  };
  for (const cam of CAMS) {
    const m = ev(app, "G3.mouth(" + JSON.stringify(cam) + ")");
    /* back out of per cent into the canvas the per cent was computed from. The
       overlay does this same sum in CSS against the same box, because the canvas
       IS the box: it is an ordinary block whose intrinsic ratio sets the height. */
    const L = Math.round(m.L / 100 * CW), R = CW - Math.round(m.R / 100 * CW);
    const T = Math.round(m.T / 100 * CH), B = T + Math.round(m.H / 100 * CH);
    const r = draw({ cam: cam, hold: true }, 0.16);
    check(cam + ": the left edge of the picker is the inside of the left post",
      !isPost(r.at(L + 1, T + 6)) && isPost(r.at(L - 1, T + 6)),
      "in=" + r.at(L + 1, T + 6) + " out=" + r.at(L - 1, T + 6));
    check(cam + ": the right edge is the inside of the right post",
      !isPost(r.at(R - 1, T + 6)) && isPost(r.at(R, T + 6)),
      "in=" + r.at(R - 1, T + 6) + " out=" + r.at(R, T + 6));
    check(cam + ": the top edge is under the bar",
      !isPost(r.at((L + R) >> 1, T + 1)) && isPost(r.at((L + R) >> 1, T - 2)),
      "in=" + r.at((L + R) >> 1, T + 1) + " out=" + r.at((L + R) >> 1, T - 2));
    /* FIND THE GOAL LINE RATHER THAN SAMPLING IT. It is the one row painted
       white right across the frame, and counting is the only reading of it that
       survives two men standing on it, which at three of the four cameras they
       are. If the brightest row in the grass is not the row the picker calls its
       bottom edge, the overlay is hanging below or above the line. */
    let lineAt = -1, most = -1;
    for (let y = 26; y < CH; y++) {
      const n = r.px[y].filter(c => c === "#ffffff").length;
      if (n > most) { most = n; lineAt = y; }
    }
    check(cam + ": and the bottom edge is the goal line itself",
      lineAt === B, "line at " + lineAt + ", edge at " + B);
    check(cam + ": all four numbers are inside the frame",
      m.L > 0 && m.R > 0 && m.T > 0 && m.H > 0 && m.T + m.H < 100,
      JSON.stringify(m));
  }
  /* AND THE SAME NUMBERS REACH THE SCREEN. The pixels above prove the mouth
     describes the goal; this proves the element is told about it. */
  const mouthOf = s => {
    const m = s.match(/--gmL:([\d.]+)%;--gmR:([\d.]+)%;--gmT:([\d.]+)%;--gmH:([\d.]+)%/);
    return m ? { L: +m[1], R: +m[2], T: +m[3], H: +m[4] } : null;
  };

  /* ---------- four corners, four dives ---------- */
  console.log("\n--- a keeper who called the bottom left does not play the top left frame ---");
  const GLOVE = "#f2f2ee";
  const frames = {};
  for (const c of CORNERS) frames[c] = draw({ dive: c, out: "saved", shot: c }, 0.50);
  const glove = c => {
    const g = frames[c].where(GLOVE);
    if (!g.length) return null;
    return { x: Math.round(g.reduce((a, p) => a + p[0], 0) / g.length),
             y: Math.round(g.reduce((a, p) => a + p[1], 0) / g.length) };
  };
  const G = {}; for (const c of CORNERS) G[c] = glove(c);
  check("he has gloves in all four", CORNERS.every(c => G[c]), JSON.stringify(G));
  check("the two low corners put them lower than the two high ones",
    G.bl.y > G.tl.y + 4 && G.br.y > G.tr.y + 4,
    JSON.stringify([G.tl.y, G.bl.y, G.tr.y, G.br.y]));
  check("the two left corners put them left of the two right ones",
    G.tl.x < G.tr.x - 8 && G.bl.x < G.br.x - 8,
    JSON.stringify([G.tl.x, G.tr.x, G.bl.x, G.br.x]));
  const sig = c => frames[c].px.map(r => r.join("")).join("");
  check("and all four frames are genuinely different pictures",
    new Set(CORNERS.map(sig)).size === 4, new Set(CORNERS.map(sig)).size);
  /* HE GOES WHERE HE SAID HE WAS GOING, which is the half of the mechanic the
     screen is responsible for. A keeper thrown the other way would be the app
     calling the man who just tapped it a liar. */
  for (const c of CORNERS) {
    const m = ev(app, "G3.mouth('close')");
    const mid = (Math.round(m.L / 100 * CW) + (CW - Math.round(m.R / 100 * CW))) / 2;
    const left = c === "tl" || c === "bl";
    check("he throws himself " + (left ? "left" : "right") + " for the " + c,
      left ? G[c].x < mid : G[c].x > mid, G[c].x + " vs " + mid);
  }
  check("and standing on his line he is doing none of it",
    JSON.stringify(glove("tl")) !== JSON.stringify((() => {
      const r = draw({ dive: null, hold: true }, 0.16);
      const g = r.where(GLOVE);
      return { x: Math.round(g.reduce((a, p) => a + p[0], 0) / g.length),
               y: Math.round(g.reduce((a, p) => a + p[1], 0) / g.length) };
    })()), "he dives with nothing to dive at");

  /* ---------- the run-up ---------- */
  console.log("\n--- there is a run-up, and the strike waits for it ---");
  const KIT = "#e04a34";
  const manX = u => { const r = draw({ hold: false }, u); const w = r.where(KIT);
    return w.length ? Math.round(w.reduce((a, p) => a + p[0], 0) / w.length) : null; };
  const manY = u => { const r = draw({ hold: false }, u); const w = r.where(KIT);
    return w.length ? Math.round(w.reduce((a, p) => a + p[1], 0) / w.length) : null; };
  const T0 = ev(app, "G3.clock");
  check("he starts back and to the side of it", manX(0.01) < manX(T0.arrive) - 8,
    manX(0.01) + " -> " + manX(T0.arrive));
  check("and higher up the screen, because he is further away",
    manY(0.01) < manY(T0.arrive) - 3, manY(0.01) + " -> " + manY(T0.arrive));
  check("he has arrived before the leg goes back",
    manX(T0.cock) === manX(T0.arrive) && manX(0.99) === manX(T0.arrive),
    manX(T0.cock) + "/" + manX(T0.arrive) + "/" + manX(0.99));
  /* THE BALL MUST NOT LEAVE DURING THE APPROACH. Every delay in the old scene
     was a literal tuned against a ball that left the boot at time zero, and a
     run-up in front of that is exactly what broke them. Here there is one
     clock, so this is a check that it is being read and not bypassed. */
  const BALLW = "#c3c9d2";   // the ball's rim, and nothing else in the frame
  const ballAt = u => { const r = draw({ hold: false, out: "scored" }, u);
    const w = r.where(BALLW);
    return w.length ? { x: Math.round(w.reduce((a, p) => a + p[0], 0) / w.length),
                        y: Math.round(w.reduce((a, p) => a + p[1], 0) / w.length) } : null; };
  const b0 = ballAt(0.02), bHit = ballAt(T0.hit - .01);
  check("the ball is still on his boot through the whole approach",
    b0 && bHit && Math.abs(b0.x - bHit.x) <= 1 && Math.abs(b0.y - bHit.y) <= 1,
    JSON.stringify([b0, bHit]));
  check("and it is gone by the time he has followed through",
    ballAt(T0.thru).y < bHit.y - 6, JSON.stringify([bHit, ballAt(T0.thru)]));

  /* ---------- where it finishes ---------- */
  console.log("\n--- the three endings look like three different things ---");
  const endOf = o => { const r = draw(Object.assign({ hold: false }, o), 0.995);
    const w = r.where(BALLW);
    return w.length ? { x: Math.round(w.reduce((a, p) => a + p[0], 0) / w.length),
                        y: Math.round(w.reduce((a, p) => a + p[1], 0) / w.length) } : null; };
  const goal = endOf({ out: "scored", shot: "tr", dive: "bl" });
  const save = endOf({ out: "saved", shot: "tr", dive: "tr" });
  const over = draw({ hold: false, out: "over", shot: "tr", dive: null }, 0.995);
  const mC = ev(app, "G3.mouth('close')");
  const mT = Math.round(mC.T / 100 * CH), mB = mT + Math.round(mC.H / 100 * CH);
  check("a goal finishes inside the goal", goal && goal.y > mT && goal.y < mB + 2,
    JSON.stringify(goal) + " mouth " + mT + ".." + mB);
  check("a save finishes somewhere else entirely",
    save && Math.abs(save.x - goal.x) > 10, JSON.stringify([goal, save]));
  check("and one over the bar is above it, or out of the frame",
    over.where(BALLW).filter(p => p[1] > mT).length === 0,
    JSON.stringify(over.where(BALLW).slice(0, 3)));
  /* the net takes it, which is the thing the old scene could not do at all:
     it shrank the ball to a speck in the corner and stopped */
  const netHit = draw({ hold: false, out: "scored", shot: "tr", dive: "bl" }, T0.land + .04);
  check("the mesh lights where it lands", netHit.count("#eefaf1") > 12, netHit.count("#eefaf1"));

  /* ---------- nothing throws, anywhere ---------- */
  console.log("\n--- every camera, every ending, both ways round ---");
  let bad = 0, blank = 0;
  for (const cam of CAMS) for (const out of ["scored", "saved", "over"]) for (const flip of [false, true]) {
    const r = recorder(CW, CH);
    app.__rec = r;
    run(app, "G3.arm(__cfg(" + JSON.stringify({ cam, out, flip, shot: "br", dive: "tl" }) + ")); G3.stop();");
    const n = ev(app, "G3.sweep(__rec.el, .01)");
    if (n !== 0) bad += Math.max(n, 1);
    if (r.fills < 2000) blank++;
  }
  check("not one frame of any of them throws", bad === 0, bad);
  check("and not one of them comes out empty", blank === 0, blank);

  /* ---------- the app picks the camera, nobody chooses it ---------- */
  console.log("\n--- which camera, read off the shape ---");
  check("a penalty is a penalty whoever is taking it",
    ev(app, "G3.cameraFor(9, 0, true)") === "pen" && ev(app, "G3.cameraFor(7, 0, true)") === "pen",
    ev(app, "G3.cameraFor(9, 0, true)"));
  check("the striker is six yards out", ev(app, "G3.cameraFor(9, 0, false)") === "close",
    ev(app, "G3.cameraFor(9, 0, false)"));
  check("a winger is shooting from the angle",
    ev(app, "G3.cameraFor(8, 0, false)") === "angle" && ev(app, "G3.cameraFor(10, 0, false)") === "angle",
    ev(app, "G3.cameraFor(8, 0, false)") + "/" + ev(app, "G3.cameraFor(10, 0, false)"));
  check("and the ten is outside the box, bending it round somebody",
    ev(app, "G3.cameraFor(7, 0, false)") === "curler", ev(app, "G3.cameraFor(7, 0, false)"));
  /* EVERY SLOT IN EVERY SHAPE, because The Dugout has five of them and a shape
     with a shooter this cannot place is a screen that draws the wrong picture
     rather than an error anybody sees. */
  const shapes = ev(app, "Object.keys(H2_SHAPES)");
  const stray = [];
  for (const id of shapes) {
    run(app, 'S = freshState(["a","b"], false, "classic", 0, "pitch", false); h2Start(); S.h2h.form = ["' + id + '","' + id + '"];');
    const n = ev(app, "h2Shape(0).length");
    for (let i = 0; i < n; i++) {
      if (!ev(app, "H2_SHOT_AT(" + i + ", 0)")) continue;
      const cam = ev(app, "G3.cameraFor(" + i + ", 0, false)");
      if (CAMS.indexOf(cam) < 0) stray.push(id + "[" + i + "]=" + cam);
    }
  }
  check("every man in every shape who is allowed a shot gets a camera",
    stray.length === 0, stray.join(" "));

  /* ---------- and the whole thing, through the app ---------- */
  console.log("\n--- driven for real ---");
  const start = async () => {
    run(app, 'S = freshState(["Martijn","Bram"], false, "classic", 0, "pitch", false); h2Start(); S.h2h.subs=[0,0]; ' +
             'h2PickTeam("Netherlands"); h2PickTeam("Italy"); render();');
    await tick(180);
    run(app, '(() => { const H = S.h2h; H.toss = 0; S.phase = "h_pick"; H.who = 0; H.at = 9; })(); render();');
    await tick(140);
  };
  await start();
  run(app, "h2Shoot()"); await tick(170);
  run(app, "h2Reveal()"); await tick(130);
  run(app, "h2Judge(true)"); await tick(180);
  check("a clean strike puts him on the corner picker", ev(app, "S.phase") === "h_aim", ev(app, "S.phase"));
  const aim = stage(app);
  check("the scene is one canvas", (aim.match(/class="g3c"/g) || []).length === 1,
    (aim.match(/class="g3c"/g) || []).length);
  check("with the four corners over it", (aim.match(/class="h2gmc /g) || []).length === 4,
    (aim.match(/class="h2gmc /g) || []).length);
  const aimM = mouthOf(aim);
  check("and the mouth on the element is this camera's mouth",
    aimM && JSON.stringify(aimM) === JSON.stringify((() => {
      const m = ev(app, "G3.mouth(G3.cameraFor(S.h2h.at, S.h2h.who, false))");
      return { L: m.L, R: m.R, T: m.T, H: m.H };
    })()), JSON.stringify(aimM));
  check("both men are named over it",
    aim.includes(ev(app, "h2Who(9,0)")) && aim.includes(ev(app, "h2Who(0,1)")), "the men are anonymous");

  run(app, "h2Aim('tl')"); await tick(150);
  if (ev(app, "S.phase") === "h_hand") { run(app, "h2HandGo()"); await tick(150); }
  const dive = stage(app);
  /* THE SCREEN IS THE WHOLE OF THE SECRET, and a canvas is a better place to
     keep one than a style attribute was: there is no longer anything in the
     markup to read. That is asserted rather than assumed, because "it is on a
     canvas" would stop being true the moment somebody wrote the corner into a
     data attribute for convenience. */
  check("the keeper is choosing", ev(app, "S.phase") === "h_dive", ev(app, "S.phase"));
  check("and the corner the striker picked is nowhere in what he is looking at",
    !/\b(tl|tr|bl|br)\b/.test(dive.replace(/class="h2gmc [a-z]+"/g, "").replace(/h2Dive\('[a-z]+'\)/g, "")),
    "a corner leaked onto the keeper's screen");
  check("no corner is lit on it", !/class="h2gmc [a-z]+ on"/.test(dive), "a corner is already picked");
  check("all four are offered identically",
    (dive.match(/aria-pressed="false"/g) || []).length === 4,
    (dive.match(/aria-pressed="false"/g) || []).length);
  check("and the scene is held rather than looping under his decision",
    ev(app, "(function(){ var r = false; try { r = G3.sweep(null) === -1; } catch(e){ r = String(e); } return r; })()") === true,
    "the still scene could not be checked");

  run(app, "h2Dive('br')"); await tick(240);
  const strike = stage(app);
  check("the reveal is the same canvas", strike.includes('class="g3c"'), "no canvas");
  check("it says GOAL", strike.includes("GOAL") && /class="g3 scored"/.test(strike), "no call");
  /* the shout is the one thing left out here, so its moment has to come off the
     canvas's own clock rather than off a number somebody typed twice */
  const cry = strike.match(/--g3cry:([\d.]+)s/);
  check("and the shout waits for the ball to arrive",
    cry && +cry[1] > T0.land * SZ.dur / 1000 && +cry[1] < SZ.dur / 1000,
    cry ? cry[1] : "no --g3cry");

  /* ---------- the kits are the match's ---------- */
  console.log("\n--- both kits come off the match, not out of the art ---");
  const rec2 = recorder(CW, CH);
  app.__rec = rec2;
  run(app, "G3.paint(0.16, __rec.el)");
  const kitHome = ev(app, "h2Kit(0)"), kitAway = ev(app, "h2Kit(1)");
  check("the man who hit it is in his country's kit", rec2.count(kitHome) > 40,
    kitHome + " x" + rec2.count(kitHome));
  check("the keeper is in the other one", rec2.count(kitAway) > 20,
    kitAway + " x" + rec2.count(kitAway));
  check("and neither of them is the prototype's red and blue",
    kitHome !== kitAway && rec2.count("#d8442f") === 0 && rec2.count("#2f6fd0") === 0,
    rec2.count("#d8442f") + "/" + rec2.count("#2f6fd0"));
  /* HIS OWN NUMBER, COUNTED. Not "there is ink on the shirt", which a stray
     highlight would satisfy: the digits of h2No are looked up in the same grid
     the drawing stamps and the lit pixels are counted, so a seven has to paint
     exactly a seven. */
  const no = String(ev(app, "h2No(S.h2h.at, S.h2h.who)")).replace(/[^0-9]/g, "").slice(-2);
  const ink = ev(app, "kitInk(h2Kit(S.h2h.who))");
  const wanted = [...no].reduce((a, ch) =>
    a + (A.NUM[ch].join("").match(/X/g) || []).length, 0);
  check("the number on his back is his own, to the pixel",
    no.length > 0 && rec2.count(ink) === wanted,
    "shirt " + no + " wants " + wanted + " got " + rec2.count(ink));

  /* ---------- the shootout, which has no duel behind it ---------- */
  console.log("\n--- a shootout still draws something sensible ---");
  run(app, '(() => { const H = S.h2h; H.so = {a:[], b:[], turn:0}; H.pen = true; H.shot = null; H.dive = null; })();');
  const soHTML = ev(app, 'h2GoalSceneHTML("set")');
  check("it builds without a corner to draw", soHTML.includes('class="g3c"'), soHTML.slice(0, 80));
  check("and from twelve yards, with nobody in the way",
    ev(app, "G3.cameraFor(S.h2h.at, S.h2h.who, true)") === "pen" && ev(app, "G3.cams.pen.def") === null,
    ev(app, "G3.cameraFor(S.h2h.at, S.h2h.who, true)"));
  const soMiss = ev(app, 'h2GoalSceneHTML("missed")');
  check("a kick put over the bar says so", soMiss.includes("OVER") && /class="g3 missed"/.test(soMiss),
    soMiss.slice(0, 60));
  const rec3 = recorder(CW, CH);
  app.__rec = rec3;
  run(app, "G3.paint(0.99, __rec.el)");
  check("and the keeper who was never told anything is still on his line",
    rec3.count(GLOVE) > 0, rec3.count(GLOVE));

  console.log(fails ? "\n" + fails + " FAILING CHECK(S)" : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
