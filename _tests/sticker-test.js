/* The celebration cutouts: the files, the precache, and when they fire.

     node _tests/sticker-test.js

   Two things here are easy to get quietly wrong. The service worker carries an
   explicit list of these files, so a re-run of the build tool that produced a
   different number of them would leave the install asking for files that are
   not there; that list is checked against the folder rather than trusted.

   And the rule Martijn asked for is specific: a right answer celebrates with a
   cutout at every tier EXCEPT ball, which keeps the ball to itself. If
   everything got the big treatment then nothing would be the big treatment.

   Reuses the stub DOM from mp-test.js. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, "")
  .replace("fetch: () => Promise.reject(new Error(\"offline in test\")),",
    `fetch: (u) => { try { const b = require("fs").readFileSync(require("path").join(${JSON.stringify(REPO)}, u), "utf8");
       return Promise.resolve({ ok: true, json: () => Promise.resolve(JSON.parse(b)) }); }
       catch (e) { return Promise.resolve({ ok: false, json: () => Promise.reject(e) }); } },`));

const ev = (ctx, e) => vm.runInContext("(" + e + ")", ctx);
const run = (ctx, s) => vm.runInContext(s, ctx);
const tick = (ms = 200) => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (n, c, x) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (c ? "" : "   <-- got: " + x)); if (!c) fails++; };

(async () => {
  const dir = path.join(REPO, "assets/stickers");
  const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
  const onDisk = fs.readdirSync(dir).filter(f => f.endsWith(".webp"));

  console.log("--- the files ---");
  check("a decent handful of cutouts", index.length >= 20, index.length);
  check("every one in the index is on disk", index.every(f => onDisk.includes(f)),
    index.filter(f => !onDisk.includes(f)).slice(0, 3).join(", "));
  check("and nothing on disk is missing from the index", onDisk.every(f => index.includes(f)),
    onDisk.filter(f => !index.includes(f)).slice(0, 3).join(", "));
  const sizes = index.map(f => fs.statSync(path.join(dir, f)).size);
  check("none is too heavy for a phone", Math.max(...sizes) < 120 * 1024, Math.round(Math.max(...sizes) / 1024) + "KB");
  const total = sizes.reduce((a, b) => a + b, 0);
  check("the whole set stays under two megabytes", total < 2 * 1024 * 1024, Math.round(total / 1024) + "KB");
  /* WebP files start with RIFF....WEBP, and an alpha one carries VP8L or VP8X */
  const heads = index.map(f => fs.readFileSync(path.join(dir, f)).subarray(0, 16).toString("latin1"));
  check("all really are WebP", heads.every(h => h.startsWith("RIFF") && h.includes("WEBP")), "one is not");
  check("all carry transparency", heads.every(h => /VP8L|VP8X/.test(h)),
    index.filter((f, i) => !/VP8L|VP8X/.test(heads[i])).slice(0, 3).join(", "));

  console.log("\n--- the service worker knows about them ---");
  const sw = fs.readFileSync(path.join(REPO, "sw.js"), "utf8");
  const listed = [...sw.matchAll(/assets\/stickers\/(sticker-[\w-]+\.webp)/g)].map(m => m[1]);
  check("the precache list matches the folder exactly",
    listed.length === index.length && index.every(f => listed.includes(f)),
    `${listed.length} listed vs ${index.length} on disk`);
  check("and the index itself is precached", sw.includes("assets/stickers/index.json"), "missing");

  const app = makeInstance("classic");
  await tick(400);
  check("the app loaded the set", ev(app, "STICK && STICK.length") === index.length, ev(app, "STICK && STICK.length"));

  console.log("\n--- when it fires ---");
  run(app, "let popped = 0; const _sp = stickerPop; stickerPop = () => { popped++; };");
  run(app, "popped = 0; goalFx(false, 1);");
  check("a right answer at a small tier throws a cutout up", ev(app, "popped") === 1, ev(app, "popped"));
  run(app, "popped = 0; goalFx(false, 10);");
  check("so does a big one below ball", ev(app, "popped") === 1, ev(app, "popped"));
  run(app, "popped = 0; goalFx(true, 20);");
  check("a BALL answer keeps the ball to itself", ev(app, "popped") === 0, ev(app, "popped"));
  run(app, "stickerPop = _sp;");

  console.log("\n--- it never repeats itself back to back ---");
  run(app, "const seen = []; for(let n=0;n<40;n++){ stickerPop(); seen.push(lastStick); }");
  const seen = ev(app, "seen");
  check("forty pops, never the same one twice running",
    seen.every((v, i) => !i || v !== seen[i - 1]), "a repeat");
  check("and it moves around the set", new Set(seen).size >= 10, new Set(seen).size + " distinct");

  console.log("\n--- offline, and the steal screen ---");
  run(app, "const keep = STICK; STICK = null;");
  let threw = false;
  try { run(app, "stickerPop()"); } catch (e) { threw = true; }
  check("no set loaded means no crash", !threw, "it threw");
  run(app, 'S = freshState(["Ale","Bram"], false, "classic", 0); S.tier="normal"; S.qi=4; S.round=1;');
  check("the steal screen falls back to a shipped cutout when the set is missing",
    ev(app, "stealSticker()").includes("assets/players/"), ev(app, "stealSticker()"));
  run(app, "STICK = keep;");
  const a1 = ev(app, "stealSticker()");
  const a2 = ev(app, "stealSticker()");
  check("the same question shows the same face on every redraw", a1 === a2, a1 + " then " + a2);
  run(app, "S.qi = 5;");
  const b1 = ev(app, "stealSticker()");
  run(app, "S.qi = 9;");
  const c1 = ev(app, "stealSticker()");
  check("a different question shows a different face", new Set([a1, b1, c1]).size > 1, "all the same");
  check("and it points at a real file",
    [a1, b1, c1].every(h => index.some(f => h.includes(f))), a1);

  console.log(fails ? `\n${fails} FAILING CHECK(S)` : "\nAll checks passed.");
  process.exit(fails ? 1 : 0);
})();
