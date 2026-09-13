#!/usr/bin/env node
/* PLAY IT, TEN THOUSAND TIMES.
 *
 *     node _tools/sim-dugout.js              the whole report
 *     node _tools/sim-dugout.js --board      just the ladder tables
 *     node _tools/sim-dugout.js --matches    just the simulated matches
 *     node _tools/sim-dugout.js --n 20000    more matches per cell
 *
 * The Dugout asks the manager to make choices, and a choice is only a choice
 * if the options are close. Five formations and three line heights is fifteen
 * combinations, and nobody is going to find out by playing which of them is
 * quietly free money. So this does two things the eye cannot.
 *
 * THE BOARD. It walks every pass available in every formation at every line
 * and prints what it costs. That is the whole ladder, laid out, so a shape
 * that is cheap everywhere or a line that is never worth setting shows up as a
 * column of numbers rather than as a feeling three weeks from now.
 *
 * THE MATCHES. It then plays matches between every pair of settings with a
 * fixed idea of how often a human gets a tier right, and counts goals, length
 * and wins. The answer rate is the assumption and it is stated out loud rather
 * than buried: a tier is a promise about failure rate, so if the promise is
 * wrong the numbers are wrong in a way you can go and check.
 *
 * It drives the app's OWN functions through the test harness rather than
 * reimplementing the rules, because a simulator that reimplements the thing it
 * is measuring measures itself.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const num = (f, d) => { const i = argv.indexOf(f); return i > -1 ? (parseInt(argv[i + 1], 10) || d) : d; };
const N = num("--n", 4000);
const ONLY_BOARD = has("--board");
const ONLY_MATCH = has("--matches");

/* ---------- the app, in a box ---------- */
const harness = fs.readFileSync(path.join(REPO, "_tests", "mp-test.js"), "utf8");
const head = harness.slice(0, harness.indexOf("/* ---------- drive an instance from outside ---------- */"));
eval(head.replace(/^const (fs|vm|path) = require\(.*\);$/gm, ""));

const ev = (c, e) => vm.runInContext("(" + e + ")", c);
const run = (c, s) => vm.runInContext(s, c);
const tick = (ms = 120) => new Promise(r => setTimeout(r, ms));

/* A SEEDED GENERATOR, so a run is repeatable and a surprising number can be
   chased rather than shrugged at. */
let seed = 20060609;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = a => a[Math.floor(rnd() * a.length)];

/* HOW OFTEN A HUMAN GETS ONE RIGHT. This is the assumption the whole match
   simulation rests on, so it is written here in the open. It is the failure
   rate each tier is supposed to promise: a short ball nearly always finds its
   man, a raking diagonal usually does not. */
const HIT = { easy: 0.90, normal: 0.72, hard: 0.50, extreme: 0.30, ball: 0.15 };

const LINES = ["high", "mid", "low"];
const pad = (s, n) => String(s).padEnd(n);
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + "%" : "-";

(async () => {
  const app = makeInstance("sim");
  await tick(360);
  run(app, "TEAMS.wc2006 = " + JSON.stringify(
    JSON.parse(fs.readFileSync(path.join(REPO, "assets/wc2006/index.json"), "utf8"))));
  for (const [id, dir] of [["seriea", "seriea"], ["laliga", "laliga"], ["premier", "premier"],
                           ["ere", "eredivisie"], ["bundesliga", "bundesliga"], ["belgian", "belgian"]])
    run(app, "DECKS[" + JSON.stringify(id) + "] = " + JSON.stringify(
      JSON.parse(fs.readFileSync(path.join(REPO, "assets/" + dir + "/index.json"), "utf8"))));

  const SHAPES = ev(app, "Object.keys(H2_SHAPES)");
  const ORDER = ev(app, "H2_ORDER");
  const SAFE = ev(app, "H2_SAFE");
  const PRESS_AT = ev(app, "H2_PRESS_AT");
  const TARGET = ev(app, "H2_TARGET");
  const MINUTES = ev(app, "H2_MINUTES");
  const PER_Q = ev(app, "H2_PER_Q");

  /* a match, set up and ready to be interrogated */
  const board = (play, shapeA, shapeB, lineA, lineB) => {
    run(app, 'S = freshState(["Home","Away"], false, "classic", 0, "' + play + '", false); h2Start(); ' +
      'h2PickTeam("Netherlands"); h2PickTeam("Italy"); S.h2h.tossed = true; S.h2h.subs=[0,0]; h2TackleOn = false;');
    /* the formation lives on H.form, one id per side */
    run(app, "S.h2h.form = " + JSON.stringify([shapeA, shapeB]) + ";");
    run(app, "S.h2h.line = " + JSON.stringify({ 0: lineA, 1: lineB }) + ";");
  };

  /* ================================================================
     1. THE BOARD
     ================================================================ */
  if (!ONLY_MATCH) {
    console.log("=".repeat(74));
    console.log("THE LADDER, SHAPE BY SHAPE");
    console.log("=".repeat(74));
    console.log("Every pass a side can play, priced off the ladder alone, with no line set.");
    console.log("H2_SAFE is " + SAFE.join(" and ") + ": the balls a line height makes DEARER when");
    console.log("you press and cheaper when you sit. Everything else moves the other way.\n");

    console.log(pad("shape", 10) + ORDER.map(t => pad(t, 9)).join("") + pad("passes", 8) + "safe share");
    const shapeRows = {};
    for (const sh of SHAPES) {
      board("manager", sh, sh, "mid", "mid");
      const counts = Object.fromEntries(ORDER.map(t => [t, 0]));
      let n = 0, safe = 0;
      for (let a = 0; a < 11; a++) for (let b = 0; b < 11; b++) {
        if (a === b) continue;
        const t = ev(app, "h2TierFor(" + a + "," + b + ")");
        counts[t]++; n++;
        if (SAFE.includes(t)) safe++;
      }
      shapeRows[sh] = { counts, n, safe };
      console.log(pad(sh, 10) + ORDER.map(t => pad(counts[t], 9)).join("") + pad(n, 8) + pct(safe, n));
    }

    console.log("\nREADING IT. A shape whose safe share is high is a shape that keeps the ball,");
    console.log("so a high press hurts it and a low block suits it. The spread across the five");
    console.log("is what makes the formation a choice rather than a skin.\n");

    /* ---- what the line actually does to the whole board ---- */
    console.log("=".repeat(74));
    console.log("WHAT A LINE HEIGHT IS WORTH");
    console.log("=".repeat(74));
    console.log("The same passes, priced as the ATTACKER is allowed to see them, against each");
    console.log("of the three lines. A number is the average tier index, 0 easy to 4 ball, so");
    console.log("lower is cheaper for the man on the ball.\n");
    console.log(pad("shape", 10) + LINES.map(l => pad(l, 12)).join("") + "high minus low");
    for (const sh of SHAPES) {
      const avg = {};
      for (const line of LINES) {
        /* the DEFENDER's line is what prices the ball, and the defender is
           side 1 while side 0 has it */
        board("manager", sh, sh, "mid", line);
        let sum = 0, n = 0;
        for (let a = 0; a < 11; a++) for (let b = 0; b < 11; b++) {
          if (a === b) continue;
          sum += ORDER.indexOf(ev(app, "h2Priced(" + a + "," + b + ")")); n++;
        }
        avg[line] = sum / n;
      }
      console.log(pad(sh, 10) + LINES.map(l => pad(avg[l].toFixed(3), 12)).join("") +
        (avg.high - avg.low >= 0 ? "+" : "") + (avg.high - avg.low).toFixed(3));
    }
    console.log("\nA POSITIVE NUMBER means pressing makes the average ball DEARER for him, so the");
    console.log("press is the defensive setting it claims to be. A number near zero would mean");
    console.log("the line is decoration.\n");

    /* ---- the cheapest route to a shot, which is where a free goal would hide ---- */
    console.log("=".repeat(74));
    console.log("THE CHEAPEST ROUTE TO A SHOT");
    console.log("=".repeat(74));
    console.log("From the keeper, the cheapest sequence of passes that ends in a shot, and what");
    console.log("that whole sequence costs. This is where route one under a high press would");
    console.log("show up as free money.\n");
    console.log(pad("shape", 10) + pad("line", 7) + pad("hops", 6) + pad("cost", 7) + "route");
    for (const sh of SHAPES) {
      for (const line of LINES) {
        board("manager", sh, sh, "mid", line);
        /* Dijkstra over the eleven, weighted by the expected number of
           questions a hop costs: 1 / the chance he gets it right. A tier you
           fail is a tier you play again, which is what makes an Easy chain
           genuinely cheaper than one raking ball. */
        const cost = Array(11).fill(Infinity), from = Array(11).fill(-1);
        cost[0] = 0;
        const seen = new Set();
        for (;;) {
          let u = -1;
          for (let i = 0; i < 11; i++) if (!seen.has(i) && cost[i] < (u < 0 ? Infinity : cost[u])) u = i;
          if (u < 0) break;
          seen.add(u);
          for (let v = 0; v < 11; v++) {
            if (v === u) continue;
            const t = ev(app, "h2Priced(" + u + "," + v + ")");
            const w = 1 / HIT[t];
            if (cost[u] + w < cost[v]) { cost[v] = cost[u] + w; from[v] = u; }
          }
        }
        let best = null;
        for (let i = 0; i < 11; i++) {
          const shot = ev(app, "h2ShotTier(" + i + ",0)");
          if (!shot) continue;
          const total = cost[i] + 1 / HIT[shot];
          if (!best || total < best.total) best = { i: i, total: total, shot: shot };
        }
        const route = [];
        for (let v = best.i; v >= 0; v = from[v]) route.unshift(ev(app, "h2Shape(0)[" + v + "].n"));
        console.log(pad(sh, 10) + pad(line, 7) + pad(route.length - 1, 6) +
          pad(best.total.toFixed(2), 7) + route.join(" > ") + " > shot(" + best.shot + ")");
      }
    }
    console.log("\nCOST is the expected number of QUESTIONS to get from the keeper to a shot,");
    console.log("counting a failed question as a ball lost and played again. Lower is easier.");
    console.log("If one row is far below the others, that shape and line is the free goal.\n");
  }

  /* ================================================================
     2. THE MATCHES
     ================================================================ */
  if (!ONLY_BOARD) {
    console.log("=".repeat(74));
    console.log("SIMULATED MATCHES");
    console.log("=".repeat(74));
    console.log("First to " + TARGET + " goals or " + MINUTES + " minutes, " + PER_Q +
      " minutes a question, so " + (MINUTES / PER_Q) + " questions.");
    console.log("Answer rates assumed: " + ORDER.map(t => t + " " + Math.round(HIT[t] * 100) + "%").join(", "));
    console.log("Each cell is " + N + " matches.\n");

    /* ONE MATCH. A side in possession walks the cheapest route it can see to a
       shot, which is what a manager does after two minutes of looking at it.
       Getting a question wrong loses the ball where he stands, which is the
       app's own rule. */
    const routeFor = (shape, line, mine) => {
      board("manager", shape, shape, mine ? "mid" : line, mine ? line : "mid");
      const cost = Array(11).fill(Infinity), from = Array(11).fill(-1);
      cost[0] = 0;
      const seen = new Set();
      for (;;) {
        let u = -1;
        for (let i = 0; i < 11; i++) if (!seen.has(i) && cost[i] < (u < 0 ? Infinity : cost[u])) u = i;
        if (u < 0) break;
        seen.add(u);
        for (let v = 0; v < 11; v++) {
          if (v === u) continue;
          const t = ev(app, "h2Priced(" + u + "," + v + ")");
          if (cost[u] + 1 / HIT[t] < cost[v]) { cost[v] = cost[u] + 1 / HIT[t]; from[v] = u; }
        }
      }
      let best = null;
      for (let i = 0; i < 11; i++) {
        const shot = ev(app, "h2ShotTier(" + i + ",0)");
        if (!shot) continue;
        const total = cost[i] + 1 / HIT[shot];
        if (!best || total < best.total) best = { i: i, total: total, shot: shot };
      }
      const hops = [];
      for (let v = best.i; from[v] >= 0; v = from[v]) hops.unshift({ a: from[v], b: v });
      /* the priced tier of each hop, read once here rather than per match */
      return {
        hops: hops.map(h => ev(app, "h2Priced(" + h.a + "," + h.b + ")")),
        shot: best.shot,
      };
    };

    /* cache the route for each (shape, line) pair so the vm is not asked
       hundreds of thousands of times */
    const routes = {};
    for (const sh of SHAPES) for (const line of LINES)
      routes[sh + "|" + line] = routeFor(sh, line, false);

    const playMatch = (shA, lineA, shB, lineB) => {
      /* what side 0 faces is decided by side 1's line, and the other way */
      const planA = routes[shA + "|" + lineB];
      const planB = routes[shB + "|" + lineA];
      let goals = [0, 0], q = 0, who = 0, step = 0, safe = 0;
      const played = Object.fromEntries(ORDER.map(t => [t, 0]));
      const QMAX = MINUTES / PER_Q;
      while (q < QMAX && goals[0] < TARGET && goals[1] < TARGET) {
        const plan = who === 0 ? planA : planB;
        const tier = step < plan.hops.length ? plan.hops[step] : plan.shot;
        q++; played[tier]++;
        /* the press: three short balls in a row and the next one is contested,
           which is an extra question at the tackle tier */
        if (SAFE.includes(tier)) { safe++; } else safe = 0;
        const pressed = safe > PRESS_AT;
        if (pressed) { q++; safe = 0; if (rnd() > HIT.normal) { who = 1 - who; step = 0; continue; } }
        if (rnd() < HIT[tier]) {
          if (step < plan.hops.length) step++;
          else { goals[who]++; who = 1 - who; step = 0; safe = 0; }
        } else { who = 1 - who; step = 0; safe = 0; }
      }
      return { goals: goals, q: q, full: q >= QMAX, played: played };
    };

    /* ---- does one line dominate ---- */
    console.log("LINE AGAINST LINE, both sides in 4-2-3-1.");
    console.log(pad("", 8) + LINES.map(l => pad("v " + l, 20)).join("") + "  (row wins, draws excluded)");
    for (const a of LINES) {
      const cells = [];
      for (const b of LINES) {
        let w = 0, d = 0, l = 0;
        for (let i = 0; i < N; i++) {
          const r = playMatch("4-2-3-1", a, "4-2-3-1", b);
          if (r.goals[0] > r.goals[1]) w++; else if (r.goals[0] < r.goals[1]) l++; else d++;
        }
        cells.push(pad(pct(w, w + l) + " w, " + pct(d, N) + " d", 20));
      }
      console.log(pad(a, 8) + cells.join(""));
    }
    console.log("\nA row that wins everywhere is a line nobody would ever not set. Near fifty");
    console.log("per cent across the board is the shape a real choice has.\n");

    /* ---- does one shape dominate ---- */
    console.log("SHAPE AGAINST SHAPE, both sides holding a normal line.");
    console.log(pad("", 10) + SHAPES.map(s => pad(s, 10)).join(""));
    for (const a of SHAPES) {
      const cells = [];
      for (const b of SHAPES) {
        let w = 0, l = 0;
        for (let i = 0; i < N; i++) {
          const r = playMatch(a, "mid", b, "mid");
          if (r.goals[0] > r.goals[1]) w++; else if (r.goals[0] < r.goals[1]) l++;
        }
        cells.push(pad(pct(w, w + l), 10));
      }
      console.log(pad(a, 10) + cells.join(""));
    }

    /* ---- how long a match actually is ---- */
    console.log("\nHOW LONG A MATCH RUNS, all fifteen settings against each other.");
    let qs = [], fulls = 0, goalsTotal = 0, played = 0, nil = 0;
    for (const sa of SHAPES) for (const la of LINES) for (const sb of SHAPES) for (const lb of LINES) {
      for (let i = 0; i < Math.max(40, Math.floor(N / 40)); i++) {
        const r = playMatch(sa, la, sb, lb);
        qs.push(r.q); if (r.full) fulls++;
        goalsTotal += r.goals[0] + r.goals[1];
        if (!r.goals[0] && !r.goals[1]) nil++;
        played++;
      }
    }
    qs.sort((a, b) => a - b);
    const at = p => qs[Math.min(qs.length - 1, Math.floor(p * qs.length))];
    console.log("  matches simulated:        " + played);
    console.log("  questions: median " + at(0.5) + ", tenth " + at(0.1) + ", ninetieth " + at(0.9) +
      ", cap " + (MINUTES / PER_Q));
    console.log("  reached full time:        " + pct(fulls, played) + "  (the rest ended at " + TARGET + " goals)");
    console.log("  goals per match:          " + (goalsTotal / played).toFixed(2));
    console.log("  goalless:                 " + pct(nil, played));
    console.log("\nA match that nearly always hits the cap is a match the clock is deciding");
    console.log("rather than the football. A match that nearly never does is a clock doing");
    console.log("nothing at all.\n");

    /* ---- is the deck deep enough for that ---- */
    console.log("=".repeat(74));
    console.log("DECK DEPTH AGAINST THAT MATCH LENGTH");
    console.log("=".repeat(74));
    console.log("A tier runs dry when a match asks for more of it than the deck holds. The");
    console.log("Dugout draws a man's own league, so the number that matters is the THINNEST");
    console.log("league on the pitch, not the total.\n");
    /* WHAT A MATCH ACTUALLY ASKS FOR, counted inside the simulation rather
       than inferred from the route plans, because a plan is what a side
       intends and a match is what it gets: every failed ball is replayed from
       wherever the other side picks it up. */
    const spend = Object.fromEntries(ORDER.map(t => [t, 0]));
    let deep = 0;
    for (const sa of SHAPES) for (const la of LINES) for (const sb of SHAPES) for (const lb of LINES) {
      for (let i = 0; i < 200; i++) {
        const r = playMatch(sa, la, sb, lb);
        for (const t of ORDER) spend[t] += r.played[t];
        deep++;
      }
    }
    console.log(pad("tier", 10) + pad("share of the balls played", 28) + "questions per match");
    const totalSpend = Object.values(spend).reduce((x, y) => x + y, 0);
    for (const t of ORDER)
      console.log(pad(t, 10) + pad(pct(spend[t], totalSpend), 28) +
        (spend[t] / deep).toFixed(1));
    console.log("");
    console.log(pad("deck", 14) + ORDER.map(t => pad(t, 9)).join(""));
    for (const [id, dir] of [["ere", "eredivisie"], ["premier", "premier"], ["laliga", "laliga"],
                             ["bundesliga", "bundesliga"], ["seriea", "seriea"], ["belgian", "belgian"]]) {
      const d = JSON.parse(fs.readFileSync(path.join(REPO, "assets/" + dir + "/index.json"), "utf8"));
      console.log(pad(id, 14) + ORDER.map(t => pad((d[t] || []).length, 9)).join(""));
    }
    console.log("\nA deck whose count for a tier is below the per-match figure runs dry inside");
    console.log("one match. Anything under about four matches' worth means the same questions");
    console.log("come round on a Friday night, which is the thing people notice.\n");
  }

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
