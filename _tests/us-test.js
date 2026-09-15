/* THE THREE OF US, BEHIND THE HALFWAY LINE.
 *
 * Three men on the front door, tap a head to bring him on. What makes this
 * worth a file of its own is not the toggling, which is three lines, but the
 * two ways it can be quietly wrong.
 *
 * THE FIRST IS THE SKIN EATING THE FACES. body.pixel .fig > * sets
 * background-image:none !important on every part and every pseudo of every
 * figure in the app, and the sixteen-bit skin is always on. That rule has
 * already silently eaten one thing in this app's history: the mown bands under
 * #pitchbg stopped drawing the day the skin went permanent and nobody noticed
 * for months, because CSS that loses does not throw. These three are the only
 * men in here with faces, so the declarations that beat it are asserted rather
 * than assumed.
 *
 * THE SECOND IS THE COUNT DRIFTING OUT OF THE APP'S OWN RANGE. setupCount is
 * offered on this page as exactly two pills, 2 players and 3 players. A strip
 * that can set it to one produces a state no pill can light and nothing else in
 * the app can reach, which is the kind of thing that looks fine until somebody
 * opens the page with it saved.
 *
 * And the names are checked for a clean tail rather than just a right head:
 * writing the men who are up into the first slots and stopping leaves whoever
 * was dropped sitting in the slot after, which nothing reads while the count is
 * down and everything reads the moment it goes back up.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const harness = fs.readFileSync(path.join(__dirname, "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head);

const stage = ctx => ctx.__els["stage"] ? ctx.__els["stage"].innerHTML : "";
const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 150) => new Promise(r => setTimeout(r, ms));
const SRC = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

let fails = 0;
const check = (n, c, x) => {
  if (c) console.log("  PASS  " + n);
  else { fails++; console.log("  FAIL  " + n + "   <-- got: " + x); }
};

(async () => {
  const app = makeInstance("us");
  const up = () => ev(app, "usUp");
  const names = () => ev(app, "setupNames");
  const count = () => ev(app, "setupCount");
  const rx = (h, n) => (h.match(new RegExp(n, "g")) || []).length;

  run(app, "S = null; showBoard = false; render();");
  await tick(240);

  console.log("--- they are on the front door ---");
  let h = stage(app);
  check("the strip is drawn", /class="usline"/.test(h), "no strip");
  check("all three of them", rx(h, 'class="uspeek') === 3, rx(h, 'class="uspeek'));
  check("each one is the app's own figure", rx(h, 'class="fig us"') === 3, rx(h, 'class="fig us"'));
  check("two hands each", rx(h, "usgrip") === 6, rx(h, "usgrip"));
  /* FOUR FINGERS A HAND, and they are counted because they are eight little
     boxes rather than a drawing: a loop that lost one would look like a hand. */
  check("four fingers a hand", rx(h, "<i></i>") === 24, rx(h, "<i></i>"));
  check("a line to hide behind", rx(h, "uschalk") === 2, rx(h, "uschalk"));
  check("and the numbers they wear",
    US_NUMS().every(n => h.indexOf(">" + n + "<") !== -1), "a shirt number is missing");
  function US_NUMS(){ return ev(app, "US.map(m => m.no)"); }

  console.log("\n--- the skin does not eat their faces ---");
  /* THE RULE THEY HAVE TO BEAT, quoted so this fails loudly if it ever stops
     existing rather than passing for the wrong reason. */
  check("the skin really does blank every background-image",
    /body\.pixel \.fig > \*[^{]*\{[^}]*background-image:none !important/.test(SRC),
    "the blanket rule is gone, so this test is now checking nothing");
  check("the face is declared back with !important",
    /\.fig\.us \.f-head::after\{[^}]*background-image:var\(--usface\) !important/.test(SRC),
    "the faces will be blanked by the skin");
  check("and so is the flag on the chest",
    /\.fig\.us \.f-torso\{background-image:var\(--usflag\) !important/.test(SRC),
    "the flags will be blanked by the skin");
  /* THE HEAD'S OWN FURNITURE HAS TO GO or the skin's hair bar and its two eye
     pixels sit on top of the drawing. */
  check("the block hair and eyes are turned off under a face",
    /\.fig\.us \.f-head\{background:none !important/.test(SRC) &&
    /\.fig\.us \.f-head::before\{display:none !important/.test(SRC),
    "the drawn face will have blocks on top of it");
  const art = ev(app, "US.length");
  check("every one of them has a face and a flag",
    (SRC.match(/--usface:url\("data:image\/svg\+xml;base64,/g) || []).length === art &&
    (SRC.match(/--usflag:url\("data:image\/svg\+xml;base64,/g) || []).length === art,
    "a face or a flag is missing");

  console.log("\n--- tapping a head ---");
  check("everybody is on to start with", up().length === 3, JSON.stringify(up()));
  check("and the count agrees", count() === 3, count());
  check("the names are in the boxes", names().slice(0, 3).filter(Boolean).length === 3,
    JSON.stringify(names()));
  const first = ev(app, "US[0].k");
  run(app, "usTap(" + JSON.stringify(first) + ");");
  await tick();
  check("tapping one sits him out", up().indexOf(first) === -1, JSON.stringify(up()));
  check("the count follows him off", count() === 2, count());
  /* THE TAIL, which is the half of this that nothing reads until it does. */
  check("and the slot he left is emptied, not left holding his name",
    names()[2] === "", JSON.stringify(names()));
  check("the two who are left are in the first two boxes",
    names()[0] && names()[1] && names()[0] !== names()[1], JSON.stringify(names()));
  run(app, "usTap(" + JSON.stringify(first) + ");");
  await tick();
  check("tapping him again brings him back", up().length === 3 && count() === 3,
    JSON.stringify(up()) + " / " + count());

  console.log("\n--- two is a quiz and one is not ---");
  /* THE APP'S OWN RANGE, read off the page rather than stated here: the pills
     are the only way a count is offered, so they are what the floor means.
     They only exist on THE BOARD, and that is the point rather than a hurdle:
     One on One is two men and against the computer is one, both decided inside
     startGame whatever this page says, so the board is the only mode where a
     count is a question and therefore the only place the range is stated. */
  run(app, "setMode('classic'); setPlay('board');");
  await tick(220);
  const pills = (stage(app).match(/setCount\((\d)\)/g) || []).map(x => +x.replace(/\D/g, ""));
  check("the page offers two counts and they are 2 and 3",
    pills.length === 2 && Math.min(...pills) === 2, JSON.stringify(pills));
  const keys = ev(app, "US.map(m => m.k)");
  run(app, "usTap(" + JSON.stringify(keys[0]) + "); usTap(" + JSON.stringify(keys[1]) + ");");
  await tick();
  check("the second-to-last man will not step off", up().length === 2, JSON.stringify(up()));
  check("so the count never leaves the range the pills offer",
    count() >= Math.min(...pills), count());

  console.log("\n--- and it remembers, within reason ---");
  check("what is up is written down",
    JSON.parse(ev(app, 'localStorage.getItem("ball2-us")')).length === 2,
    ev(app, 'localStorage.getItem("ball2-us")'));
  /* LOCALSTORAGE OUTLIVES THE RULE THAT WROTE IT. A list of one saved by a build
     that allowed one would come back and sit under the floor for ever, because
     the tap guard only stops you going down and never brings you back up. */
  run(app, 'localStorage.setItem("ball2-us", JSON.stringify(["mar"]));');
  check("a saved list of one is refused on the way back in",
    ev(app, "usLoad().length") === 3, JSON.stringify(ev(app, "usLoad()")));
  run(app, 'localStorage.setItem("ball2-us", JSON.stringify(["nobody","mar","bra"]));');
  check("and a name that is not one of us is dropped",
    ev(app, "usLoad().indexOf('nobody')") === -1, JSON.stringify(ev(app, "usLoad()")));
  run(app, 'localStorage.setItem("ball2-us", "not json at all");');
  check("rubbish on the disk does not take the front door down",
    ev(app, "usLoad().length") === 3, JSON.stringify(ev(app, "usLoad()")));

  console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
