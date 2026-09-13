#!/usr/bin/env node
/* THE FORTY FAMOUS FINALS, AS A POOL YOU CAN PLAY AS.
 *
 *     node _tools/build-finals-pool.js            dry run
 *     node _tools/build-finals-pool.js --write
 *
 * assets/xi/index.json has been sitting in this repo since Name the XI, and it
 * is quietly the best "who do you want to be" list in the app: forty real
 * starting elevens with a real formation each, from Brazil 1970 to Argentina
 * 2022, Celtic 1967 and Feyenoord 1970 through Ajax 1995 and Liverpool 2005.
 * Every one of them is eleven men who actually took the field in a final.
 *
 * It is not in the pool shape, and the gap is one field: the men have a name
 * and a shirt number and no position. The formation supplies it. "4-2-4" is
 * four defenders, two midfielders and four forwards after the goalkeeper, and
 * the list is in that order, so the positions are already there, implied, and
 * have been all along.
 *
 * WHAT THESE SIDES DO NOT HAVE, and it is better to say so than to invent it:
 *
 *   NO BENCH. A final's line-up is eleven men. Some of these predate
 *   substitutes existing at all, so the pool ships with an empty bench and the
 *   substitution rule simply has nothing to offer. A famous final with no
 *   substitutes is a defensible thing to play.
 *
 *   NO CAREERS. The lg field that routes a question to a man's own league is
 *   harvested per pool and this one has not been harvested, so every man here
 *   falls through to the quiz's own bank. That is exactly what a Costa Rican
 *   who never left home already does, so the code path is worn in rather than
 *   new. The Dugout stays gated on the pools that do have careers.
 *
 *   NO BADGE. Half of these are countries and half are clubs, and the two
 *   badge folders are keyed differently. The team picker already falls back to
 *   a kit swatch when a side has no flag, which for a pool whose whole
 *   identity is the shirt is arguably the better picture anyway.
 */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SRC = path.join(REPO, "assets", "xi", "index.json");
const OUTDIR = path.join(REPO, "assets", "finals");
const OUT = path.join(OUTDIR, "index.json");
const WRITE = process.argv.includes("--write");

/* the app's eleven slots, in the order every shape indexes them */
const ROLE = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];
/* and what each slot is CALLED, so a man carries a position a reader believes */
const SLOT_POS = ["GK", "CB", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "ST", "RW"];

/* A FORMATION IS A LIST OF COUNTS. "4-2-3-1" is four, two, three and one, and
   everything after the keeper. Anything that does not add to ten is refused
   rather than guessed at. */
function bands(formation) {
  const n = String(formation || "").split("-").map(x => parseInt(x, 10));
  if (!n.length || n.some(x => !(x > 0))) return null;
  if (n.reduce((a, b) => a + b, 0) !== 10) return null;
  /* the first band is the defence and the last is the attack; everything
     between them is midfield, however many bands that is */
  return { d: n[0], m: n.slice(1, -1).reduce((a, b) => a + b, 0), f: n[n.length - 1] };
}

/* the same fit the app uses, so a side lands in the app's slot order */
const NEAR = { GK: ["GK"], DF: ["DF", "MF", "FW"], MF: ["MF", "FW", "DF"], FW: ["FW", "MF", "DF"] };
function fit(men) {
  const pool = { GK: [], DF: [], MF: [], FW: [] };
  for (const m of men) (pool[m.pos] || pool.MF).push(m);
  const out = [], notes = [];
  ROLE.forEach((want, i) => {
    let man = null;
    for (const p of NEAR[want]) if (pool[p].length) { man = pool[p].shift(); break; }
    if (!man) for (const p of ["MF", "DF", "FW", "GK"]) if (pool[p].length) { man = pool[p].shift(); break; }
    if (man && man.pos !== want) notes.push(SLOT_POS[i] + " is a " + man.pos);
    out.push(man);
  });
  return { xi: out, notes: notes };
}

const src = JSON.parse(fs.readFileSync(SRC, "utf8"));
console.log("reading " + src.length + " finals line-ups\n");

/* the five shapes the app can draw, so a side that played one of them can
   default the shape picker to it */
const APP_SHAPES = ["4-2-3-1", "4-4-2", "4-3-3", "3-5-2", "5-3-2"];

const out = {};
let refused = [], guessy = [], matched = 0;
for (const row of src) {
  const b = bands(row.formation);
  if (!b) { refused.push(row.id + " (" + row.formation + ")"); continue; }
  if (!row.players || row.players.length !== 11) { refused.push(row.id + " (not eleven)"); continue; }
  /* THE ORDER IS THE FORMATION. Keeper, then the defence, then the midfield,
     then the attack, which is how every one of these was written down. */
  const men = row.players.map((p, i) => ({
    n: p.n, full: p.n, no: p.num,
    pos: i === 0 ? "GK" : i <= b.d ? "DF" : i <= b.d + b.m ? "MF" : "FW",
    cap: p.cap ? 1 : undefined,
  }));
  const f = fit(men);
  if (f.notes.length) guessy.push(row.id + ": " + f.notes.join(", "));
  if (APP_SHAPES.indexOf(row.formation) > -1) matched++;
  /* THE TITLE IS THE NAME. Two Brazils and three Real Madrids are in here, and
     a picker showing "Brazil" twice is a picker nobody can use. */
  out[row.title.replace(/\s*·\s*/g, " · ")] = {
    kit: row.kit, abbr: (row.team || "").slice(0, 3).toUpperCase(),
    flag: null, slug: row.id, squad: 11,
    xi: f.xi.map((m, i) => ({ n: m.n, full: m.full, no: m.no, pos: SLOT_POS[i],
                              cap: m.cap })).map(m => { if (!m.cap) delete m.cap; return m; }),
    bench: [],
    xiVs: (row.sub || "").split(" · ").slice(-1)[0] || null,
    xiWhen: ((row.sub || "").match(/\b(\d{4})\b/) || [])[1] || null,
    xiShape: APP_SHAPES.indexOf(row.formation) > -1 ? row.formation : null,
    played: row.formation,
  };
}

console.log("sides built: " + Object.keys(out).length + " of " + src.length);
if (refused.length) console.log("refused: " + refused.join(", "));
console.log("played one of the app's five shapes: " + matched + "  (the rest default to 4-2-3-1)");
console.log("\nformations seen: " + [...new Set(src.map(r => r.formation))].sort().join(", "));

console.log("\nWHERE THE SLOT MAPPING HAD TO STRETCH (" + guessy.length + ")");
for (const g of guessy.slice(0, 14)) console.log("  " + g);
if (guessy.length > 14) console.log("  ... and " + (guessy.length - 14) + " more");

const sample = Object.keys(out)[0];
console.log("\n" + sample);
out[sample].xi.forEach((m, i) => console.log("  " + String(i).padStart(2) + "  " +
  m.pos.padEnd(3) + " #" + String(m.no).padEnd(3) + m.full + (m.cap ? "  (c)" : "")));

if (!WRITE) { console.log("\ndry run, add --write to build the pool"); process.exit(0); }
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
console.log("\nwrote " + path.relative(REPO, OUT) + "  (" +
  (fs.statSync(OUT).size / 1024).toFixed(1) + " KB)");
