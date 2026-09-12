/* Multiple Choice: four options for the classic bank, built rather than written.

     node _tools/build-mc.js                     build the default tier (hard, 200)
     node _tools/build-mc.js --tier=ball --n=50  a different tier or size
     node _tools/build-mc.js --all               every tier at --n each
     node _tools/build-mc.js --dry               report only, write nothing
     node _tools/build-mc.js --dry --show=20     ...and print 20 built questions

   WHY THIS IS A BUILD AND NOT A WRITING JOB
   The bank is ~7,000 questions and every one of them already has a correct
   answer. What multiple choice needs is three wrong ones, and three wrong ones
   picked at random are worse than useless: "Which club plays at Old Trafford?"
   with Ajax, DWS and Palmeiras underneath it is not a question, it is a
   formality. The wrong answers have to cost you something to rule out.

   So this does not invent distractors, it FINDS them, out of the data the app
   already ships: 13 league rosters in assets/leagues, 1,311 nationality-club
   rows in assets/nations, 1,000 players with position and birth year in
   assets/mystery, and the CAREERS deck inside index.html. A club answer gets
   three clubs from its own league. A player answer gets three players of the
   same position, born within a few years, ideally sharing a club. A year gets
   years from the same cycle, so a World Cup question moves in fours.

   SELECTION, NOT GENERATION
   Only about half the bank has an answer that can be surrounded tightly.
   "The Zarra Trophy", "John Jensen and Kim Vilfort" and "'The Cannibal of
   Ajax'" have no natural neighbours and never will. Rather than pad those
   with filler, every question is scored on how tight its pool is and only the
   best --n survive. There are more than 200 clean candidates in every tier,
   BALL included, so nothing has to be forced. The rejects stay in the bank and
   keep working fine in the read-aloud modes, which is where they belong.

   THE GIVEAWAY CHECKS
   A distractor that is named in the question is a free elimination, and an
   answer that is named in the question is not a question at all. Both are
   dropped. So is any option that contains another option, because "Brazil" next
   to "Brazil (5)" tells you the answer without you knowing a thing about
   football. Trailing parentheticals are stripped from the options for the same
   reason: "Sadio Mane (for Southampton)" sitting beside three bare names is a
   neon sign. The full answer is kept on the row and is what gets revealed.

   DETERMINISTIC
   The shuffle is seeded off the question text, so a rebuild puts the same
   options in the same order. PACKS are folded in strictly in order, the way
   dump-bank.js does it, because the bank's identity depends on position.

   SAFE TO RE-RUN. Rebuilt from scratch each time. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "assets", "mc");
const TIERS = ["easy", "normal", "hard", "extreme", "ball"];

const arg = (k, d) => {
  const hit = process.argv.find(a => a.startsWith("--" + k + "="));
  return hit ? hit.split("=").slice(1).join("=") : d;
};
const DRY = process.argv.includes("--dry");
const ALL = process.argv.includes("--all");
const WANT = Number(arg("n", 200));
const SHOW = Number(arg("show", 0));
const ONLY = ALL ? TIERS : [arg("tier", "hard")];

/* ---------- reading the bank out of index.html ---------- */
/* Brace-walking rather than regex, and the pack list is read from PACKS in the
   page rather than kept here: the copy that lived in dump-bank.js went stale
   and silently dropped a third of the bank. Not making that mistake twice. */
const SRC = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

function literalAt(marker, open, close) {
  const start = SRC.indexOf(marker);
  if (start < 0) throw new Error("cannot find " + marker + " in index.html");
  const from = SRC.indexOf(open, start);
  let depth = 0, end = -1, inStr = null;
  for (let i = from; i < SRC.length; i++) {
    const c = SRC[i], p = SRC[i - 1];
    if (inStr) { if (c === inStr && p !== "\\") inStr = null; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (!depth) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error("unterminated " + marker);
  return vm.runInNewContext("(" + SRC.slice(from, end) + ")");
}

const BANK = literalAt("const BANK", "{", "}");
const CAREERS = literalAt("const CAREERS", "[", "]");
const PACKS = literalAt("const PACKS", "[", "]");
for (const p of PACKS) {
  const extra = JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
  for (const [tier, rows] of Object.entries(extra))
    if (Array.isArray(BANK[tier]) && Array.isArray(rows)) BANK[tier].push(...rows);
}

const readJSON = p => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const LEAGUES = readJSON("assets/leagues/index.json");
const NATIONS = readJSON("assets/nations/index.json");
const MYSTERY = readJSON("assets/mystery/index.json");
const ALUMNI = readJSON("assets/alumni/index.json");

/* ---------- normalising ---------- */
const strip = a => String(a).replace(/\s*\([^)]*\)\s*$/, "").trim();
const norm = s => String(s).toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[.'’]/g, "")
  .replace(/^(the|a)\s+/, "")
  .replace(/\s+(fc|afc|cf|sc|ac|bv|bsc)$/, "")
  .replace(/^(fc|afc|cf|sc|ac|as|ss|ssc|rc|cd|ca)\s+/, "")
  .replace(/\s+/g, " ").trim();

/* ---------- club reference: name -> league, plus a stature proxy ---------- */
/* Stature is how many nationality-club rows a club owns in assets/nations. A
   club that 40 different nationalities have passed through is a big club; one
   with two is not. It is a rough proxy and it does not need to be better than
   rough: it only decides which three of a league's twenty clubs get offered,
   so that Manchester United is surrounded by clubs of its own size instead of
   by whoever happens to sort first. */
/* ---------- club display names ----------
   The bank writes clubs plain: "Nottingham Forest", "Derby County", "Ajax".
   assets/leagues writes 93 of its 264 clubs with the legal suffix attached:
   "Arsenal F.C.", "Aston Villa F.C.", "Cadiz CF". Mixing the two is the worst
   tell there is, because the option formatted differently from the other three
   IS the answer and you do not need to know any football to spot it. So every
   option goes through the same cleaner, the correct one included. The
   unabridged bank answer is still what gets revealed afterwards.

   Three clubs in assets/leagues carry a literal "(undefined)" in the name and
   in their aliases: Willem II, Fenerbahce and Galatasaray. That is a bug in
   build-leagues.js rather than here, but it would ship straight into the
   options, so it is scrubbed on the way in. */
const CLUB_TAIL = /\s+(?:F\.?C\.?|A\.?F\.?C\.?|C\.?F\.?|S\.?C\.?|A\.?C\.?|S\.?K\.?|B\.?K\.?|F\.?K\.?|S\.?V\.?|V\.?V\.?|B\.?V\.?|A\.?S\.?|S\.?S\.?|U\.?S\.?|C\.?P\.?)$/;
const CLUB_HEAD = /^(?:F\.?C\.?|A\.?F\.?C\.?|C\.?F\.?|S\.?C\.?|A\.?C\.?|S\.?K\.?|F\.?K\.?|S\.?V\.?|A\.?S\.?|S\.?S\.?C?\.?|R\.?C\.?D?\.?|C\.?D\.?|C\.?A\.?|G\.?D\.?|S\.?D\.?|U\.?D\.?|N\.?K\.?|H\.?N\.?K\.?)\s+/;
const clubDisplay = n => String(n)
  .replace(/\s*\(undefined\)\s*/g, " ")
  .replace(CLUB_TAIL, "")
  .replace(CLUB_HEAD, "")
  .replace(/\s+/g, " ").trim();

/* Reserve sides share a league with real clubs and are not a fair wrong answer
   to "which club plays at X". Jong Ajax and Real Sociedad B go; Willem II
   stays, which is why "ends in II" is not the test. A name only counts as a
   reserve side if the club it is the reserve OF is in the same league. */
function isReserve(name, siblings) {
  if (/^Jong\s/i.test(name)) return true;
  if (/\s(?:Castilla|Fortuna)$/i.test(name)) return true;
  const m = name.match(/^(.*)\s+(?:B|II)$/i);
  return !!(m && siblings.has(norm(m[1])));
}

const CLUBS = new Map();   // norm(name) -> {n, league, flag, stature}
const BY_LEAGUE = new Map();

for (const lg of LEAGUES) {
  const siblings = new Set(lg.clubs.map(c => norm(clubDisplay(c.n))));
  const bucket = [];
  for (const c of lg.clubs) {
    const rec = { n: clubDisplay(c.n), league: lg.n, flag: lg.flag, stature: 0 };
    CLUBS.set(norm(c.n), rec);
    CLUBS.set(norm(rec.n), rec);
    for (const a of c.a || []) {
      const k = norm(String(a).replace(/\s*undefined\s*/g, " "));
      if (k && !CLUBS.has(k)) CLUBS.set(k, rec);
    }
    if (!isReserve(c.n, siblings)) bucket.push(rec);
  }
  BY_LEAGUE.set(lg.n, bucket);
}
for (const rows of Object.values(NATIONS))
  for (const r of rows) {
    const hit = CLUBS.get(norm(r.club));
    if (hit) hit.stature++;
  }
const clubOf = a => CLUBS.get(norm(a));

/* ---------- player reference ---------- */
/* Three sources, merged richest-last so the fullest record wins: CAREERS
   carries a club list and nothing else, the nations rows add a position and a
   country, mystery adds position, nationality and birth year. A player known
   only from CAREERS can still be surrounded, just by club overlap rather than
   by age, which is why that source is kept at all. */
const POSMAP = { GK: "GK", DF: "DF", MF: "MF", FW: "FW" };
const posGroup = s => {
  if (!s) return null;
  if (POSMAP[s]) return POSMAP[s];
  const t = String(s).toLowerCase();
  if (/goalkeep|keeper/.test(t)) return "GK";
  if (/back|defend|sweeper/.test(t)) return "DF";
  if (/midfield/.test(t)) return "MF";
  if (/forward|strik|wing/.test(t)) return "FW";
  return null;
};

const PLAYERS = new Map(); // norm(name) -> {n, pos, nat, y, clubs:Set}
const touch = n => {
  const k = norm(n);
  if (!PLAYERS.has(k)) PLAYERS.set(k, { n, pos: null, nat: null, y: null, clubs: new Set() });
  return PLAYERS.get(k);
};
for (const c of CAREERS) { const p = touch(c.n); (c.c || []).forEach(s => p.clubs.add(s)); }
for (const rows of Object.values(NATIONS))
  for (const r of rows) {
    if (!r.player) continue;
    const p = touch(r.player);
    p.pos = p.pos || posGroup(r.pos);
    p.nat = p.nat || r.country || null;
    if (r.slug) p.clubs.add(r.slug);
  }
for (const m of MYSTERY) {
  const p = touch(m.n);
  p.pos = posGroup(m.p) || p.pos;
  p.nat = m.nat || p.nat;
  p.y = m.y || p.y;
  (m.c || []).forEach(s => p.clubs.add(s));
}
for (const c of ALUMNI) (c.p || []).forEach(n => touch(n).clubs.add(c.s));
const playerOf = a => PLAYERS.get(norm(a));
const PLAYER_LIST = [...PLAYERS.values()];

/* ---------- country reference ---------- */
/* Confederation, so that a World Cup answer is not surrounded by three
   countries from the wrong continent. Hand-listed because there is no
   confederation field anywhere in the assets and inventing one from flags
   would be guesswork. Only nations that actually turn up as answers. */
const CONF = {
  UEFA: ["England", "Scotland", "Wales", "Northern Ireland", "Republic of Ireland", "France", "Germany", "West Germany", "Italy", "Spain", "Portugal", "Netherlands", "Belgium", "Denmark", "Sweden", "Norway", "Finland", "Iceland", "Poland", "Czech Republic", "Czechoslovakia", "Slovakia", "Hungary", "Austria", "Switzerland", "Croatia", "Serbia", "Yugoslavia", "Slovenia", "Bosnia and Herzegovina", "Greece", "Turkey", "Russia", "Soviet Union", "Ukraine", "Romania", "Bulgaria", "Albania", "North Macedonia", "Georgia", "Armenia", "Azerbaijan", "Belarus", "Estonia", "Latvia", "Lithuania", "Luxembourg", "Malta", "Cyprus", "Israel"],
  CONMEBOL: ["Brazil", "Argentina", "Uruguay", "Chile", "Colombia", "Peru", "Paraguay", "Ecuador", "Bolivia", "Venezuela"],
  CAF: ["Morocco", "Senegal", "Nigeria", "Ghana", "Cameroon", "Egypt", "Algeria", "Tunisia", "Ivory Coast", "South Africa", "Mali", "Zambia", "DR Congo", "Guinea", "Burkina Faso", "Angola", "Togo", "Kenya"],
  AFC: ["Japan", "South Korea", "North Korea", "China", "Australia", "Iran", "Saudi Arabia", "Qatar", "Iraq", "Uzbekistan", "Thailand", "Vietnam", "India", "Indonesia", "Brunei"],
  CONCACAF: ["Mexico", "United States", "USA", "Costa Rica", "Canada", "Jamaica", "Honduras", "Panama", "Trinidad and Tobago", "El Salvador", "Haiti", "Cuba", "Curacao"],
  OFC: ["New Zealand", "Fiji", "Papua New Guinea", "Tahiti", "Solomon Islands"],
};
const CONF_OF = new Map();
for (const [k, list] of Object.entries(CONF)) for (const n of list) CONF_OF.set(norm(n), { conf: k, n });
const countryOf = a => CONF_OF.get(norm(a));

/* ---------- deterministic shuffle ---------- */
/* Seeded off the question text so a rebuild does not reshuffle every row and
   turn a no-op into a 200-line diff. */
function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rngFrom(s) {
  let x = s || 1;
  return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; };
}
function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const pick = (pool, n, rnd) => shuffle(pool, rnd).slice(0, n);

/* The words in a club or player name that actually identify it. "Borussia",
   "United" and "City" are shared by too many clubs to mean anything on their
   own, so they do not count as a match when checking whether an option has
   already been named in its own question. */
const GENERIC = new Set(["fc", "afc", "cf", "sc", "ac", "united", "city", "town", "county", "rovers",
  "albion", "wanderers", "athletic", "atletico", "real", "borussia", "sporting", "olympique", "dynamo",
  "rapid", "sparta", "inter", "club", "deportivo", "racing", "union", "stade", "villa", "north", "south",
  "east", "west", "de", "la", "el", "and", "the"]);
const distinctive = s => norm(s).split(" ").filter(w => w.length >= 5 && !GENERIC.has(w));

/* ---------- the distractor builders ----------
   Each returns {opts:[3 strings], score} or null. Score is how tight the pool
   was, 0 to 1, and it is what decides which questions make the cut. */

function clubDistractors(ans, rnd) {
  const me = clubOf(ans);
  if (!me) return null;
  const mates = (BY_LEAGUE.get(me.league) || []).filter(c => norm(c.n) !== norm(me.n));
  if (mates.length < 3) return null;
  // nearest in stature first, then a seeded pick from that shortlist, so the
  // same club does not always draw the same three neighbours
  const ranked = mates.slice().sort((a, b) => Math.abs(a.stature - me.stature) - Math.abs(b.stature - me.stature));
  const shortlist = ranked.slice(0, Math.max(6, Math.min(10, ranked.length)));
  const spread = shortlist.reduce((n, c) => n + Math.abs(c.stature - me.stature), 0) / shortlist.length;
  return {
    opts: pick(shortlist, 3, rnd).map(c => c.n),
    disp: clubDisplay,
    score: 0.75 + 0.25 / (1 + spread / 10),   // same league is already tight
  };
}

function playerDistractors(ans, rnd) {
  const me = playerOf(ans);
  if (!me) return null;
  const scored = [];
  for (const p of PLAYER_LIST) {
    if (norm(p.n) === norm(me.n)) continue;
    let s = 0;
    if (me.pos && p.pos) s += me.pos === p.pos ? 3 : -2;
    if (me.y && p.y) { const d = Math.abs(me.y - p.y); s += d <= 3 ? 3 : d <= 6 ? 2 : d <= 10 ? 0 : -3; }
    if (me.nat && p.nat && me.nat === p.nat) s += 2;
    for (const c of me.clubs) if (p.clubs.has(c)) { s += 2; break; }
    if (s > 0) scored.push({ p, s });
  }
  if (scored.length < 3) return null;
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, 12);
  const best = top[0].s;
  // a pool where the three best are all strong matches is a tight pool
  const tight = top.slice(0, 3).reduce((n, x) => n + x.s, 0) / (3 * Math.max(best, 1));
  return { opts: pick(top, 3, rnd).map(x => x.p.n), score: Math.min(1, 0.35 + 0.6 * tight * (best / 10)) };
}

function countryDistractors(ans, rnd) {
  const me = countryOf(ans);
  if (!me) return null;
  const mates = CONF[me.conf].filter(n => norm(n) !== norm(me.n));
  if (mates.length < 3) return null;
  return { opts: pick(mates, 3, rnd), score: 0.8 };
}

function yearDistractors(ans, q, rnd) {
  const y = Number(strip(ans));
  if (!Number.isFinite(y) || y < 1850 || y > 2030) return null;
  // tournament questions move in fours or the wrong answers are not even legal
  const cycle = /world cup|euros?\b|european championship|olympic|copa am/i.test(q);
  const steps = cycle ? [-12, -8, -4, 4, 8, 12] : [-6, -4, -3, -2, -1, 1, 2, 3, 4, 6];
  const pool = [...new Set(steps.map(s => y + s))].filter(v => v >= 1850 && v <= 2030);
  if (pool.length < 3) return null;
  return { opts: pick(pool, 3, rnd).map(String), score: cycle ? 0.9 : 0.7 };
}

function numberDistractors(ans, rnd) {
  const n = Number(strip(ans));
  if (!Number.isFinite(n)) return null;
  const mag = n > 30 ? Math.max(1, Math.round(Math.abs(n) * 0.25)) : 1;
  const pool = [...new Set([-3, -2, -1, 1, 2, 3].map(s => n + s * mag))].filter(v => v >= 0 && v !== n);
  if (pool.length < 3) return null;
  return { opts: pick(pool, 3, rnd).map(String), score: 0.6 };
}

function scoreDistractors(ans, rnd) {
  const m = strip(ans).match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  const cand = new Set();
  for (const da of [-1, 0, 1]) for (const db of [-1, 0, 1]) {
    const x = a + da, y = b + db;
    if (x < 0 || y < 0 || (x === a && y === b)) continue;
    cand.add(x + "-" + y);
  }
  if (cand.size < 3) return null;
  return { opts: pick([...cand], 3, rnd), score: 0.65 };
}

/* ---------- build one row ---------- */
function build(row) {
  if (!row || !row.q || !row.a) return null;
  const q = String(row.q), full = String(row.a), ans = strip(full);
  if (!ans) return null;

  // an answer sitting in its own question is not a question
  if (norm(ans).length > 3 && norm(q).includes(norm(ans))) return null;
  // multi-part answers have no single pool to draw from
  if (!clubOf(ans) && /\band\b|,|\+|\//.test(ans)) return null;

  const rnd = rngFrom(seedOf(q));
  const built =
    yearDistractors(full, q, rnd) ||
    scoreDistractors(full, rnd) ||
    numberDistractors(full, rnd) ||
    clubDistractors(full, rnd) ||
    countryDistractors(full, rnd) ||
    playerDistractors(full, rnd);
  if (!built) return null;

  // one cleaner over the answer and its distractors alike, so that no option
  // can be picked out by its formatting instead of by its football
  const disp = built.disp || (x => x);
  const right = disp(ans);
  const opts = [right, ...built.opts.map(disp)];

  // every giveaway check, applied to the finished set
  const seen = new Set();
  for (const o of opts) {
    if (!o || !String(o).trim()) return null;
    const k = norm(o);
    if (seen.has(k)) return null;                                       // duplicate option
    seen.add(k);
  }
  /* "Named in the question" has to look at the distinctive part of a name and
     not only at the whole string. This was offering Borussia Monchengladbach
     as a wrong answer to "Monchengladbach beat Dortmund 12-0 and still lost
     the title to whom?", because the full name is not a substring of the
     question even though the half that identifies the club is. Anyone can
     strike that one out without knowing a thing. Generic club words are
     skipped or every question mentioning a City would lose its distractors. */
  for (const o of opts.slice(1)) {
    if (norm(o).length > 3 && norm(q).includes(norm(o))) return null;
    if (distinctive(o).some(w => norm(q).includes(w))) return null;
  }
  for (const a of opts) for (const b of opts)
    if (a !== b && norm(a).includes(norm(b))) return null;              // one contains another

  const shuffled = shuffle(opts, rnd);
  return { q, a: full, o: shuffled, k: shuffled.indexOf(right), _score: built.score };
}

/* mc-test.js reads these rather than keeping its own copies. Two normalisers
   that are meant to agree will not stay in agreement: the first version of the
   test had its own and failed a row the builder had got right, because the
   test could not strip "RCD Espanyol de Barcelona" down to what the options
   actually show. One definition, imported. */
module.exports = { strip, norm, clubDisplay, distinctive, build, TIERS };

if (require.main !== module) return;

/* ---------- run ---------- */
for (const t of ONLY) if (!TIERS.includes(t)) { console.log("unknown tier:", t); process.exit(1); }
const out = {};
const report = [];
for (const tier of ONLY) {
  const rows = BANK[tier] || [];
  const built = [];
  for (const r of rows) { const b = build(r); if (b) built.push(b); }
  // best-scoring first, then trim to the ask
  built.sort((a, b) => b._score - a._score);
  const keep = built.slice(0, WANT).map(({ _score, ...rest }) => rest);
  // back into bank order so the pack reads like the bank it came from
  const pos = new Map(rows.map((r, i) => [r.q, i]));
  keep.sort((a, b) => (pos.get(a.q) ?? 0) - (pos.get(b.q) ?? 0));
  out[tier] = keep;
  report.push({ tier, pool: rows.length, built: built.length, kept: keep.length });
}

console.log("tier       bank   buildable   kept   coverage");
for (const r of report)
  console.log(r.tier.padEnd(9), String(r.pool).padStart(6), String(r.built).padStart(10),
    String(r.kept).padStart(7), ((100 * r.built / r.pool).toFixed(0) + "%").padStart(9));
for (const r of report)
  if (r.kept < WANT) console.log(`\n  ! ${r.tier} only made ${r.kept} of ${WANT}`);

if (SHOW) {
  const tier = ONLY[0];
  console.log(`\n--- ${SHOW} from ${tier} ---`);
  for (const row of pick(out[tier], SHOW, rngFrom(12345))) {
    console.log("\n" + row.q);
    row.o.forEach((o, i) => console.log(`   ${i === row.k ? "*" : " "} ${o}`));
  }
}

if (DRY) { console.log("\n--dry, nothing written"); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, "index.json");
const existing = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
const merged = { ...existing, ...out };          // a single-tier build does not wipe the others
fs.writeFileSync(file, JSON.stringify(merged, null, 1));
console.log(`\nwritten to assets/mc/index.json (${(fs.statSync(file).size / 1024).toFixed(0)} KB, tiers: ${Object.keys(merged).join(", ")})`);
