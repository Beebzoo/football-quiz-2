#!/usr/bin/env node
/* WHICH GROUP EVERY SIDE WAS DRAWN INTO, and not one byte of network to get it.
 *
 *     node _tools/build-groups.js              dry run, read the table
 *     node _tools/build-groups.js --write      stamp it onto every tournament deck
 *     node _tools/build-groups.js --pool euro2016 --write    just the one
 *
 * THE LETTER WAS ALWAYS THERE. build-squads.js reads the "<tournament> squads"
 * article by level-three country headings, /^===\s*([^=]+?)\s*===\s*$/gm, and
 * that regex cannot see the level-two "==Group A==" sitting directly above the
 * first four of them. So every squad in the app was harvested out of a document
 * that stated its group on the line above, and the group was dropped on the
 * floor fifteen times over. Nothing here fetches anything: it re-reads the
 * articles build-tournament.js already pulled and parked in _tools/_models,
 * keyed wct-<first sixteen hex of sha1(title)>.json with the text under "t",
 * which is the scheme in build-tournament.js at its wikitext() helper. All
 * fifteen were already sitting there, so this whole harvest is a re-read of
 * work that happened weeks ago.
 *
 * THE ONE TRAP, and it is not hypothetical. The obvious walk is "each country
 * takes the nearest preceding group heading", and that is wrong, because the
 * group headings are not the only level-two headings in the article. Every one
 * of the fifteen ends with some run of "Statistics", "Notes", "Player
 * representation by league", "References" and "External links", all at level
 * two, and several of them carry level-three headings of their own underneath.
 * A nearest-preceding walk hands Group H or Group L or Group F to whatever sits
 * under "Player representation by league", which at the 1998 article is a list
 * of leagues that reads exactly like a list of countries. So a level-two
 * heading that is not a group does not merely fail to set a letter, it CLEARS
 * the one in hand and the run is over. That single line is the difference
 * between a clean parse and a pool with forty sides in eight groups.
 *
 * WHAT IT REFUSES TO DO. Three checks, and a pool that fails one is skipped
 * rather than written, because a wrong letter is worse than no letter: the app
 * would then draw a confident group row that lies.
 *
 *   The letters must be exactly the ones _tournament.js names for that year.
 *   That file already knows eight groups at a World Cup, twelve from 2026, four
 *   at a sixteen-side Euro and six from 2016, so the group COUNT is not retyped
 *   here, it is asked for.
 *
 *   Every group must hold exactly four sides. That is the one number
 *   _tournament.js deliberately refuses to hold, on the stated grounds that a
 *   harvest which counts what it found beats one that is told in advance and
 *   agrees, so it lives here instead, once, as the shape a first-round group
 *   has had at every tournament in the decks.
 *
 *   And for the seven World Cups that already have a Cup file, the letters have
 *   to agree with assets/cup/<year>.json, which was harvested off a different
 *   article by a different tool. Two independent readings of the same draw
 *   landing on the same answer is the strongest evidence there is that this is
 *   right, and a disagreement gets shouted rather than written.
 *
 * RE-RUNNABLE. A side that already carries a group has it dropped and put back
 * at the same spot in the key order, so a second run rewrites the file byte for
 * byte identically. The file itself is written the way build-tournament.js
 * writes it, JSON.stringify with no spacing and no trailing newline, because
 * that is what all fifteen deck files on disk already look like and a
 * pretty-printed one would land as a diff of the entire repository.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.join(__dirname, "..");
const CACHE = path.join(__dirname, "_models");
const ASSETS = path.join(REPO, "assets");
const COMPS = require("./_tournament.js").COMPS;
const WRITE = process.argv.includes("--write");
const ONLY = (i => i > -1 ? process.argv[i + 1] : null)(process.argv.indexOf("--pool"));

/* THE SIZE OF A FIRST ROUND GROUP, and the only tournament fact typed out in
   this file. All fifteen decks are four to a group, 2026 included, which is
   exactly what makes it worth asserting: the day a format changes this throws
   rather than quietly stamping a half-empty group. */
const PER_GROUP = 4;

/* the cache key build-tournament.js uses, copied off its wikitext() helper
   rather than reinvented, because a different slice length reads nothing */
const cacheKey = title => "wct-" + crypto.createHash("sha1").update(title).digest("hex").slice(0, 16) + ".json";
const cached = title => {
  const at = path.join(CACHE, cacheKey(title));
  if (!fs.existsSync(at)) return null;
  try { return JSON.parse(fs.readFileSync(at, "utf8")).t || ""; } catch (e) { return null; }
};

/* A HEADING IS A WHOLE LINE OF ITS OWN, which is what lets one pattern read
   both levels at once: the backreference makes the closing run of equals signs
   match the opening run, so "==Group A==" and "===Brazil===" both come back,
   and they arrive in document order, which is the entire point. */
const HEAD = /^(={2,3})\s*([^=\n]+?)\s*\1\s*$/gm;
const GROUP_HEAD = /^Group\s+([A-L])$/;

/* country -> letter, by walking the article top to bottom once */
const groupsIn = text => {
  const out = {};
  let letter = null;
  for (const m of text.matchAll(HEAD)) {
    const level = m[1].length, head = m[2].trim();
    if (level === 2) {
      /* the clearing is the whole trick, see the note at the top of the file */
      const g = GROUP_HEAD.exec(head);
      letter = g ? g[1] : null;
    } else if (letter) {
      out[head] = letter;
    }
  }
  return out;
};

/* THE LETTER GOES WITH THE OTHER ONE-WORD FACTS, right after squad and ahead of
   the xi. Appending it would be less code and would strand a one-character
   string behind an eleven-man array, which is a miserable thing to find in a
   minified file when you are trying to work out what a side holds. Dropping any
   group already there before putting the new one back is what makes a second
   run produce the same bytes as the first. */
const stamped = (side, letter) => {
  const out = {};
  for (const k of Object.keys(side)) {
    if (k === "group") continue;
    out[k] = side[k];
    if (k === "squad") out.group = letter;
  }
  /* a deck with no squad count is not one we have, but if one ever turns up it
     still gets its letter rather than silently losing it */
  if (!Object.prototype.hasOwnProperty.call(out, "group")) out.group = letter;
  return out;
};

/* every tournament deck on disk, discovered rather than listed, so a sixteenth
   one is picked up by dropping its folder in */
const pools = fs.readdirSync(ASSETS)
  .map(d => /^(wc|euro)(\d{4})$/.exec(d))
  .filter(m => m && COMPS[m[1]] && fs.existsSync(path.join(ASSETS, m[0], "index.json")))
  .map(m => ({ pool: m[0], comp: m[1], year: m[2] }))
  .filter(p => !ONLY || p.pool === ONLY)
  .sort((a, b) => a.comp.localeCompare(b.comp) || (+a.year - +b.year));

if (!pools.length) {
  console.error("no tournament decks found under " + path.relative(REPO, ASSETS) +
    (ONLY ? ", and --pool " + ONLY + " is not one of them" : ""));
  process.exit(1);
}

let refused = 0, written = 0;
for (const p of pools) {
  const C = COMPS[p.comp];
  const title = C.title(p.year) + " squads";
  const want = C.groups(p.year);
  const file = path.join(ASSETS, p.pool, "index.json");
  const sides = JSON.parse(fs.readFileSync(file, "utf8"));
  const names = Object.keys(sides);
  const bad = [];

  const text = cached(title);
  if (text === null) {
    console.log(p.pool.padEnd(9) + "NO CACHED WIKITEXT for " + title + " (" + cacheKey(title) + ")." +
      " Run build-tournament.js --comp " + p.comp + " --year " + p.year + " once to fetch it.");
    refused++;
    continue;
  }

  const byCountry = groupsIn(text);
  const got = {};
  for (const name of names) {
    const letter = byCountry[name];
    if (!letter) { bad.push(name + " has no group heading above it in the article"); continue; }
    got[name] = letter;
  }

  /* the counts, which are the thing worth printing whatever else happens */
  const tally = {};
  for (const letter of Object.values(got)) tally[letter] = (tally[letter] || 0) + 1;
  const letters = Object.keys(tally).sort();

  if (letters.join("") !== want.join(""))
    bad.push("groups came out " + (letters.join("") || "none") + ", " + C.label + " " + p.year + " has " + want.join(""));
  for (const letter of want)
    if ((tally[letter] || 0) !== PER_GROUP)
      bad.push("group " + letter + " holds " + (tally[letter] || 0) + " sides, not " + PER_GROUP);

  /* THE SECOND OPINION. build-cup.js names its file after the pool with the wc
     stripped off, so wc2006 is assets/cup/2006.json and a Euro would keep its
     full pool name. Seven of the fifteen have one, and where there is one it is
     a completely separate harvest of the same draw off the group-stage pages. */
  const cupAt = path.join(ASSETS, "cup", p.pool.replace(/^wc/, "") + ".json");
  let cupVerdict = "no cup file";
  if (fs.existsSync(cupAt)) {
    const cup = JSON.parse(fs.readFileSync(cupAt, "utf8"));
    let checked = 0, clashes = 0;
    for (const [letter, g] of Object.entries(cup.groups || {}))
      for (const side of (g.sides || [])) {
        checked++;
        if (got[side] === letter) continue;
        clashes++;
        bad.push("THE CUP AND THE SQUADS PAGE DISAGREE about " + side + ": " +
          path.basename(cupAt) + " says " + letter + ", the article says " + (got[side] || "nothing"));
      }
    cupVerdict = clashes ? (clashes + " of " + checked + " CLASH") : ("cup agrees on all " + checked);
  }

  console.log(p.pool.padEnd(9) + names.length + " sides   " +
    want.map(l => l + " " + (tally[l] || 0)).join("  ") + "   " + cupVerdict);

  if (bad.length) {
    for (const b of bad) console.log("  REFUSED: " + b);
    refused++;
    continue;
  }
  if (!WRITE) continue;

  const next = {};
  for (const name of names) next[name] = stamped(sides[name], got[name]);
  fs.writeFileSync(file, JSON.stringify(next));
  written++;
}

console.log("");
if (refused) console.log(refused + " pool" + (refused === 1 ? "" : "s") + " refused, see above");
if (WRITE) console.log("wrote " + written + " of " + pools.length + " decks");
else console.log("dry run over " + pools.length + " decks, add --write to stamp the letters on");
process.exit(refused ? 1 : 0);
