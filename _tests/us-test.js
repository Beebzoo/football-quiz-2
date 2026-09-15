/* THE THREE OF US, HANGING ON THE YOUR CLUB BANNER.
 *
 * Heads over the bar, four fingers on its top edge, and the one you tap comes
 * up far enough to show his shirt and his flag. What makes this worth a file is
 * not the toggling, which is three lines, but the four ways it can be quietly
 * wrong, and three of those are invisible without a browser.
 *
 * THE SKIN EATING THE FACES. body.pixel .fig > * sets background-image:none
 * !important on every part and every pseudo of every figure, and the skin is
 * always on. That rule has already silently eaten one thing in this app's
 * history: the mown bands under #pitchbg stopped drawing the day the skin went
 * permanent and nobody noticed for months. These three are the only men in here
 * with faces, so the declarations that beat it are asserted, and so is the rule
 * they beat, because a guard that stops guarding should say so.
 *
 * HOW MUCH OF A MAN SHOWS. "Heads only" and "not more than mid body" are the
 * whole brief and they are geometry, so they are checked as geometry: the
 * figure is 22 units tall with the head at rows 0 to 4, the flag on the chest
 * at 6 to 7.5 and the shorts from 13. A number that drifts past 13 is a man
 * standing up, and nothing on a screenshot would tell you which side of the
 * line you were on.
 *
 * THE PAGE JUMPING. The room above the bar is paid for once so that a man
 * standing up does not shove the banner and everything under it down the page.
 * That is one declaration and losing it would be a regression nobody would
 * describe as a bug, only as "it feels jumpy".
 *
 * AND THE COUNT LEAVING THE APP'S OWN RANGE. setupCount is offered on the setup
 * page as exactly two pills. A strip that can set it to one produces a state no
 * pill can light and nothing else in the app can reach.
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
const tick = (ms = 160) => new Promise(r => setTimeout(r, ms));
const R = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
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

  await tick(340);
  /* THE CLUB SECTION IS NOT ON THE PAGE UNTIL THE CLASSIC PACK LANDS, which is
     dailyCardHTML's own first line, so there is no banner to hang off before
     then and therefore nobody hanging. That is the right behaviour and it is
     why this has to be loaded before anything below can be looked for. */
  run(app, 'DECKS["classic-mc"] = ' + JSON.stringify(R("assets/mc/index.json")) + ";");
  run(app, "S = null; showBoard = false; render();");
  await tick(240);

  console.log("--- they hang on the banner, not in a box of their own ---");
  let h = stage(app);
  check("nobody at all before the pack lands",
    ev(app, '(() => { const d = DECKS["classic-mc"]; delete DECKS["classic-mc"]; ' +
      'const out = dailyCardHTML(); DECKS["classic-mc"] = d; return out; })()') === "",
    "the club section drew without its deck");
  check("they are inside the Your club banner",
    /mm-eyebrow">Your club<span class="usheads"/.test(h), "not on the banner");
  check("all three of them", rx(h, 'class="uspeek') === 3, rx(h, 'class="uspeek'));
  check("each is the app's own figure", rx(h, 'class="fig us"') === 3, rx(h, 'class="fig us"'));
  check("each in a window that clips him", rx(h, 'class="usman"') === 3, rx(h, 'class="usman"'));
  check("two hands each", rx(h, "usgrip") === 6, rx(h, "usgrip"));
  /* NO BACKGROUND OF THEIR OWN. The first version of this gave them a green
     pitch to stand on, which was a second green panel on a page that already
     had one. They hang off the bar now and the bar is the only thing painted. */
  const hung = h.slice(h.indexOf("usheads"), h.indexOf("mm-list"));
  check("and no panel behind them", !/background|usline|h2xipitch/.test(hung),
    "something is painted behind them");

  console.log("\n--- the skin does not eat their faces ---");
  check("the skin really does blank every background-image",
    /body\.pixel \.fig > \*[^{]*\{[^}]*background-image:none !important/.test(SRC),
    "the blanket rule is gone, so this test is now checking nothing");
  check("the face is declared back with !important",
    /\.fig\.us \.f-head::after\{[^}]*background-image:var\(--usface\) !important/.test(SRC),
    "the faces will be blanked by the skin");
  check("and so is the flag on the chest",
    /\.fig\.us \.f-torso\{background-image:var\(--usflag\) !important/.test(SRC),
    "the flags will be blanked by the skin");
  check("the block hair and eyes are turned off under a drawn face",
    /\.fig\.us \.f-head\{background:none !important/.test(SRC) &&
    /\.fig\.us \.f-head::before\{display:none !important/.test(SRC),
    "the drawn face will have blocks on top of it");
  const men = ev(app, "US.length");
  check("every one of them has a face and a flag",
    (SRC.match(/--usface:url\("data:image\/svg\+xml;base64,/g) || []).length === men &&
    (SRC.match(/--usflag:url\("data:image\/svg\+xml;base64,/g) || []).length === men,
    "a face or a flag is missing");

  console.log("\n--- heads only, and never past mid body ---");
  /* THE BRIEF IS GEOMETRY so it is checked as geometry. The figure is 22 units:
     head 0-4, chest with the flag 6-7.5, shorts from 13. */
  const unit = re => { const m = SRC.match(re); return m ? parseFloat(m[1]) : null; };
  const rest = unit(/height:calc\(var\(--ush\) \* ([\d.]+) \/ 22\)[^}]*\}\s*\.uspeek\.up/);
  const risen = unit(/--usup:calc\(var\(--ush\) \* ([\d.]+) \/ 22\)/);
  check("at rest he is a head and a jaw, not a torso",
    rest !== null && rest > 4 && rest < 6, rest);
  check("risen he clears the flag on his chest, which ends at 7.5",
    risen !== null && risen >= 8, risen);
  check("and he never reaches the shorts, which start at 13",
    risen !== null && risen < 13, risen);
  check("so risen is more than at rest and both are under half of him",
    risen > rest && risen <= 11, rest + " -> " + risen);

  console.log("\n--- and the page does not jump when he stands ---");
  /* THE ROOM IS PAID FOR ONCE. Without this the banner and everything under it
     shifts down every time somebody is tapped, which nobody reports as a bug,
     only as "it feels jumpy". */
  check("the space above the bar is reserved for the tallest state",
    /\.mm-club\{[^}]*padding-top:var\(--usup\)/.test(SRC), "the page will shift on a tap");
  check("and the row hangs off the bar rather than sitting in the flow",
    /\.usheads\{position:absolute;[^}]*bottom:100%/.test(SRC), "it is in the flow");
  /* THE FINGERS DO NOT RISE WITH HIM, which is the whole joke and is one rule. */
  check("the fingers stay on the line while he goes up",
    /\.uspeek\.up \.usgrip\{opacity:0/.test(SRC) && !/\.uspeek\.up[^{]*\.usgrip\{[^}]*bottom/.test(SRC),
    "the hands go up with him");

  console.log("\n--- tapping a head ---");
  check("everybody is on to start with", up().length === 3 && count() === 3,
    JSON.stringify(up()) + " / " + count());
  const first = ev(app, "US[0].k");
  run(app, "usTap(" + JSON.stringify(first) + ");");
  await tick();
  check("tapping one sits him out", up().indexOf(first) === -1, JSON.stringify(up()));
  check("the count follows him off", count() === 2, count());
  check("and the slot he left is emptied, not left holding his name",
    names()[2] === "", JSON.stringify(names()));
  run(app, "usTap(" + JSON.stringify(first) + ");");
  await tick();
  check("tapping him again brings him back", up().length === 3 && count() === 3,
    JSON.stringify(up()) + " / " + count());

  console.log("\n--- two is a quiz and one is not ---");
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
