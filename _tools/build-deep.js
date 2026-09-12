/* Top up the Hard, Extreme and BALL packs with questions built from data the
   app already ships and Martijn already curates, so the answer cannot be
   wrong: the career deck, the dugout careers, the historical line-ups, the
   dated timeline events, the verified nationality one-offs and the stadiums.

     node _tools/build-deep.js

   Targets live in TARGETS below. Extreme draws on the manager and timeline
   data the other two tiers never touch, so it does not play like a rerun.

   SAFE TO RE-RUN. Everything already in assets/deep/index.json is kept exactly
   as it is, handwritten questions included, and this only adds what is needed
   to reach the target. It will never overwrite a question you wrote by hand.

   Every shape is capped. The bank already had one shape at 10% of the whole
   thing ("which club plays its home ground at X") and that is the flaw we are
   trying not to repeat. */
const fs = require("fs");
const REPO = require("path").join(__dirname, "..") + "/";
const CAP = 45;                        // no single shape may exceed this per tier

const badges = JSON.parse(fs.readFileSync(REPO + "assets/badges/index.json", "utf8"));
const NAME = {}, FAME = {};
["easy", "hard", "ball"].forEach(t => badges[t].forEach(b => { NAME[b.s] = b.n; FAME[b.s] = t; }));

/* The badge index only covers clubs, so every national-team job in the manager
   deck was being silently skipped: 205 references, the Dutch job among them.
   Name them here so a manager's international spells count as jobs too. */
const NAT_IRREGULAR = {
  "dutch-national-team": "the Netherlands", "portuguese-football-federation": "Portugal",
  "english-national-team": "England", "usa-national-team": "the United States",
  "republic-of-ireland-national-team": "the Republic of Ireland",
  "south-korea-national-team": "South Korea", "saudi-arabia-national-team": "Saudi Arabia",
  "ivory-coast-national-team": "the Ivory Coast", "south-africa-national-team": "South Africa",
  "czech-republic-national-team": "the Czech Republic", "uae-national-team": "the UAE",
};
const NATIONAL = new Set();
function resolveNationalTeams(decks) {
  for (const deck of decks) for (const p of deck) for (const s of p.c) {
    if (NAME[s] || !/-national-team$|-football-federation$/.test(s)) continue;
    NAME[s] = NAT_IRREGULAR[s] || s.replace(/-(national-team|football-federation)$/, "")
      .split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
    FAME[s] = "hard";
    NATIONAL.add(s);
  }
  Object.keys(NAT_IRREGULAR).forEach(s => NATIONAL.add(s));
}

const html = fs.readFileSync(REPO + "index.html", "utf8");
const block = html.slice(html.indexOf("const CAREERS = ["), html.indexOf("const SAVE_KEY"));
const CAREERS = eval(block.slice(block.indexOf("["), block.lastIndexOf("]") + 1));
const XI = JSON.parse(fs.readFileSync(REPO + "assets/xi/index.json", "utf8"));
const NAT = JSON.parse(fs.readFileSync(REPO + "assets/nations/index.json", "utf8"));
const STAD = JSON.parse(fs.readFileSync(REPO + "assets/stadiums/index.json", "utf8"));
const MGRS = JSON.parse(fs.readFileSync(REPO + "assets/managers/index.json", "utf8"));
const TLINE = JSON.parse(fs.readFileSync(REPO + "assets/timeline/index.json", "utf8"));
resolveNationalTeams([MGRS, CAREERS]);

/* what is already in the bank, so we never generate a question it already has */
const facts = JSON.parse(fs.readFileSync(REPO + "assets/facts/index.json", "utf8"));
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const existing = new Set();
["easy", "normal", "hard", "extreme", "ball"].forEach(t => (facts[t] || []).forEach(q => existing.add(norm(q.q))));
(html.match(/^ \{q:"(?:[^"\\]|\\.)*"/gm) || []).forEach(m => existing.add(norm(m.slice(5, -1))));

const out = { hard: [], ball: [], extreme: [] };
const used = new Set();
const shapeCount = {};
function add(tier, shape, q, a) {
  const k = shape + "|" + tier;
  if ((shapeCount[k] || 0) >= CAP) return false;
  const n = norm(q);
  if (used.has(n) || existing.has(n)) return false;
  used.add(n);
  shapeCount[k] = (shapeCount[k] || 0) + 1;
  out[tier].push({ q, a, shape });   // shape is stripped again before writing
  return true;
}
// deterministic spread so we don't take the first N of everything
const spread = (arr, seed) => arr.map((v, i) => [v, (i * 2654435761 + seed) % 1000003]).sort((a, b) => a[1] - b[1]).map(x => x[0]);

/* Both decks are curated for PLAYING, not for citation, and they say so: 255
   of 503 careers and 78 of 227 dugout careers carry a note like "Loans
   simplified", "Started at HFC Haarlem (not shown)" or "Some spells
   simplified". Career Path can show a simplified route quite happily, because
   you see the route. A Classic question cannot: "which club did he join after
   leaving Motherwell" is simply wrong if the deck dropped Rangers, which is
   exactly what Alex McLeish's entry does.

   So any question that asserts one club came straight after another is built
   only from entries that make no such admission. Shapes drawing on the
   nationality, line-up, stadium and timeline data are unaffected: different
   sources, no adjacency claim. */
/* A second way an adjacency question goes wrong even on a complete entry:
   the club named in the question appears twice. Buffon's route is Parma,
   Juventus, PSG, Juventus, Parma, so "which club did he join after leaving
   Juventus" has two right answers. 124 of 503 careers and 87 of 227 dugout
   careers double back like this. These helpers only allow the question when
   every occurrence leads to the same place, which keeps the good ones
   (leaving Parma always led to Juventus) and drops the ambiguous ones. */
const afterIsUnique = (c, i) => {
  const from = c[i - 1];
  const next = new Set();
  c.forEach((s, k) => { if (s === from && k + 1 < c.length) next.add(c[k + 1]); });
  return next.size === 1;
};
const beforeIsUnique = (c, i) => {
  const to = c[i];
  const prev = new Set();
  c.forEach((s, k) => { if (s === to && k > 0) prev.add(c[k - 1]); });
  return prev.size === 1;
};
const pairIsUnique = (c, i) => {
  let hits = 0;
  for (let k = 1; k < c.length - 1; k++) if (c[k - 1] === c[i - 1] && c[k + 1] === c[i + 1]) hits++;
  return hits === 1;
};

const GAPPY = /simplif|skipp?ed|not shown|omitted|started at|early|finale|wind-down|via |loan|also|too\b/i;
const solid = p => !(p.note && GAPPY.test(p.note));
const SOLID_CAREERS = CAREERS.filter(solid);
const SOLID_MGRS = MGRS.filter(solid);
console.log(`adjacency-safe entries: ${SOLID_CAREERS.length}/${CAREERS.length} careers, ${SOLID_MGRS.length}/${MGRS.length} managers`);

/* ---------- 1. career transitions ---------- */
for (const p of spread(SOLID_CAREERS, 11)) {
  const c = p.c.filter(s => NAME[s]);
  if (c.length < 3) continue;
  const i = 1 + (p.n.length % (c.length - 1));
  const from = c[i - 1], to = c[i];
  if (from === to || !afterIsUnique(c, i)) continue;
  add(FAME[to] === "easy" ? "hard" : "ball", "transition",
      `Which club did ${p.n} join after leaving ${NAME[from]}?`, NAME[to]);
}

/* ---------- 2. where an obscure career began ---------- */
for (const p of spread(SOLID_CAREERS, 23)) {
  const c = p.c.filter(s => NAME[s]);
  if (c.length < 3 || FAME[c[0]] === "easy") continue;
  add("ball", "start", `Which club did ${p.n} start his senior career at?`, NAME[c[0]]);
}

/* ---------- 3. where a long career ended ---------- */
for (const p of spread(SOLID_CAREERS, 37)) {
  const c = p.c.filter(s => NAME[s]);
  if (c.length < 5 || FAME[c[c.length - 1]] === "easy") continue;
  // "played for last" silently rots the day that player signs anywhere else.
  // Joining a club is a past event, so it cannot. Same fact, safe wording.
  if (!afterIsUnique(c, c.length - 1)) continue;
  add("hard", "finish", `Which club did ${p.n} join after leaving ${NAME[c[c.length - 2]]}?`, NAME[c[c.length - 1]]);
}

/* ---------- 4. the club sandwiched between two big ones ---------- */
for (const p of spread(SOLID_CAREERS, 53)) {
  const c = p.c.filter(s => NAME[s]);
  for (let i = 1; i < c.length - 1; i++) {
    if (FAME[c[i - 1]] === "easy" && FAME[c[i + 1]] === "easy" && FAME[c[i]] !== "easy" && pairIsUnique(c, i)) {
      add("ball", "between", `Which club did ${p.n} play for between ${NAME[c[i - 1]]} and ${NAME[c[i + 1]]}?`, NAME[c[i]]);
      break;
    }
  }
}

/* ---------- 5. which club he left to join a giant ---------- */
for (const p of spread(SOLID_CAREERS, 67)) {
  const c = p.c.filter(s => NAME[s]);
  for (let i = 1; i < c.length; i++) {
    if (FAME[c[i]] === "easy" && FAME[c[i - 1]] !== "easy" && beforeIsUnique(c, i)) {
      add("hard", "leftfor", `Which club did ${p.n} leave to sign for ${NAME[c[i]]}?`, NAME[c[i - 1]]);
      break;
    }
  }
}

/* ---------- 6. historical line-ups ---------- */
for (const line of spread(XI, 91)) {
  const where = line.title.replace(" · ", ", ");
  const cap = line.players.find(pl => pl.cap);
  if (cap) add("ball", "xi-cap", `Who wore the armband for ${where}?`, cap.n);
  const gk = line.players.find(pl => pl.num === 1);
  if (gk) add("ball", "xi-gk", `Who kept goal for ${where}?`, gk.n);
  const ten = line.players.find(pl => pl.num === 10);
  if (ten) add("hard", "xi-num", `Who wore number 10 for ${where}?`, ten.n);
  add("hard", "xi-form", `${where} lined up in which formation?`, line.formation);
  // three names, name the side: the whole table shouts at this one
  const trio = line.players.filter(pl => pl.num >= 4 && pl.num <= 11).slice(0, 3).map(pl => pl.n);
  if (trio.length === 3) add("ball", "xi-trio", `Which side lined up with ${trio[0]}, ${trio[1]} and ${trio[2]}?`, where);
}

/* ---------- 7. the only player of their country at a club ---------- */
for (const tier of ["hard", "ball"]) {
  const src = tier === "hard" ? (NAT.easy || []).concat(NAT.normal || []) : (NAT.hard || []).concat(NAT.ball || []);
  for (const r of spread(src, tier === "hard" ? 101 : 103)) {
    add(tier, "oneoff", `${r.player} is the only player from which country ever to appear for ${r.club}?`, r.country);
  }
}

/* ---------- 8. grounds: capacity and country, not "who plays there" ---------- */
const big = STAD.filter(s => s.capacity && s.city).sort((a, b) => b.capacity - a.capacity);
for (const s of spread(big.slice(0, 120), 131)) {
  add(s.sitelinks > 40 ? "hard" : "ball", "stad-city", `In which city would you find ${s.name}?`, `${s.city}, ${s.country}`);
}

/* ================= EXTREME: harder than Hard, short of BALL's lottery =======
   Two sources the other tiers never touched, so Extreme does not feel like a
   rerun: the 227 dugout careers and the 200 dated timeline events. */

/* ---------- 9. managers: the next job ---------- */
for (const m of spread(SOLID_MGRS, 151)) {
  const c = m.c.filter(s => NAME[s]);
  if (c.length < 3) continue;
  const i = 1 + (m.n.length % (c.length - 1));
  if (c[i - 1] === c[i] || !afterIsUnique(c, i)) continue;
  add("extreme", "mgr-next", `Which job did ${m.n} take after ${NAME[c[i - 1]]}?`, NAME[c[i]]);
}

/* ---------- 10. managers: where the dugout career began ---------- */
for (const m of spread(SOLID_MGRS, 157)) {
  const c = m.c.filter(s => NAME[s]);
  if (c.length < 4) continue;
  // "start out as a manager" overclaims: some of these first jobs were
  // assistant or specialist coaching roles. "First coaching job" is true of
  // every one of them.
  add("extreme", "mgr-first", `Where did ${m.n} take his first coaching job?`, NAME[c[0]]);
}

/* ---------- 11. put a year on it ----------
   Timeline items are written to be read inside their own set, so some of them
   ("Club founded by Hans Gamper") do not say which club once you pull them out
   on their own. Only take the ones that name a club we know, which is what
   makes them answerable as a standalone question. */
const CLUBNAMES = Object.values(NAME).filter(n => n.length > 4);
/* Naming a club is necessary but not sufficient. These are captions written to
   sit under their own Timeline set, so plenty of them have no subject at all
   once pulled out alone: "Signs for Barcelona" (who signs?), "First European
   Cup, beat Panathinaikos" (who won it?), "Passes away in Barcelona" (who?).
   Two structural tells catch them: a bare present-tense verb with nothing in
   front of it, and a competition named before a comma. */
const NO_SUBJECT = [
  /^(Signs|Passes|Joins|Wins|Beats|Loses|Retires|Debuts|Moves|Returns|Scores|Dies)\b/,
  /^[A-Z][\w' ]*?(Cup|League|Liga|final|match|title)\b[^,]*,/i,
  /^(Olympic|Bronze|Silver|Gold)\b/,
  /^[A-Z][\w' ]*? runners-up\b/,
];
const standalone = t => CLUBNAMES.some(n => t.includes(n)) && !NO_SUBJECT.some(re => re.test(t));
for (const set of spread(TLINE, 163)) {
  for (const it of set.items) {
    if (!standalone(it.t)) continue;
    if (add("extreme", "year", `In which year did this happen: ${it.t}?`, String(it.y))) break;
  }
}

/* ---------- 12. the middle fame band of the nationality one-offs ---------- */
for (const r of spread(NAT.normal || [], 167)) {
  add("extreme", "oneoff", `${r.player} is the only player from which country ever to appear for ${r.club}?`, r.country);
}

/* ---------- 13. a second transition per career, further along ---------- */
for (const p of spread(SOLID_CAREERS, 173)) {
  const c = p.c.filter(s => NAME[s]);
  if (c.length < 4) continue;
  for (let i = c.length - 1; i >= 2; i--) {
    if (c[i - 1] === c[i]) continue;
    if (add("extreme", "transition", `Which club did ${p.n} join after leaving ${NAME[c[i - 1]]}?`, NAME[c[i]])) break;
  }
}

/* ---------- 14. the shirts nobody remembers ---------- */
for (const line of spread(XI, 179)) {
  const where = line.title.replace(" · ", ", ");
  for (const n of [5, 9, 7, 6, 8]) {
    const pl = line.players.find(x => x.num === n);
    if (pl && add("extreme", "xi-num", `Who wore number ${n} for ${where}?`, pl.n)) break;
  }
}

/* ---------- 15. which country is that ground in ---------- */
for (const s of spread(STAD.filter(x => x.country && x.sitelinks < 40), 181)) {
  add("extreme", "stad-country", `${s.name} is a ground in which country?`, s.country);
}

/* ================= DEPTH: more shapes, so more volume stays varied ========= */

const clubsOf = p => p.c.filter(s => NAME[s] && !NATIONAL.has(s));
const tierOfClub = s => FAME[s] === "easy" ? "hard" : FAME[s] === "hard" ? "extreme" : "ball";

/* ---------- 16. the club two careers have in common ----------
   Only usable when the pair shares EXACTLY one club, otherwise the question
   has more than one right answer and the table will rightly riot. */
function sharedClub(deck, verb, seed) {
  const list = spread(deck.filter(p => clubsOf(p).length >= 3), seed);
  for (let i = 0; i + 1 < list.length; i += 2) {
    const a = list[i], b = list[i + 1];
    const sa = new Set(clubsOf(a)), sb = new Set(clubsOf(b));
    const shared = [...sa].filter(s => sb.has(s));
    if (shared.length !== 1) continue;
    add(tierOfClub(shared[0]), "shared-" + verb,
        `Which club have both ${a.n} and ${b.n} ${verb}?`, NAME[shared[0]]);
  }
}
sharedClub(SOLID_CAREERS, "played for", 191);
sharedClub(SOLID_MGRS, "managed", 193);

/* ---------- 17. the one-offs, asked the other way round ---------- */
for (const [band, tier] of [["easy", "hard"], ["normal", "extreme"], ["hard", "ball"]]) {
  for (const r of spread(NAT[band] || [], 197)) {
    add(tier, "oneoff-rev", `${r.player} is the only ${r.country} player ever to turn out for which club?`, r.club);
  }
}

/* ---------- 18. managers: the job in the middle, and the international one -- */
for (const m of spread(SOLID_MGRS, 199)) {
  const c = m.c.filter(s => NAME[s]);
  for (let i = 1; i < c.length - 1; i++) {
    if (c[i - 1] === c[i] || c[i] === c[i + 1] || !pairIsUnique(c, i)) continue;
    if (add("extreme", "mgr-between", `Which job did ${m.n} hold between ${NAME[c[i - 1]]} and ${NAME[c[i + 1]]}?`, NAME[c[i]])) break;
  }
}
for (const m of spread(SOLID_MGRS, 211)) {
  const nat = m.c.filter(s => NATIONAL.has(s));
  if (nat.length !== 1) continue;   // two international jobs would be ambiguous
  add("hard", "mgr-nat", `Which national side has ${m.n} taken charge of?`, NAME[nat[0]]);
}

/* ---------- 19. deeper into the playing careers ---------- */
for (const pass of [0, 1, 2]) {
  for (const p of spread(SOLID_CAREERS, 223 + pass * 6)) {
    const c = clubsOf(p);
    if (c.length < 3) continue;
    for (let k = 0; k < c.length - 1; k++) {
      const i = 1 + ((k + pass * 2 + p.n.length) % (c.length - 1));
      if (c[i - 1] === c[i] || !afterIsUnique(c, i)) continue;
      if (add(tierOfClub(c[i]), "transition", `Which club did ${p.n} join after leaving ${NAME[c[i - 1]]}?`, NAME[c[i]])) break;
    }
  }
}

/* ---------- 20. the rest of the shirts ---------- */
for (const n of [2, 3, 4, 11, 6, 8, 7, 9, 5]) {
  for (const line of spread(XI, 227 + n)) {
    const pl = line.players.find(x => x.num === n);
    if (pl) add(n <= 4 ? "ball" : "extreme", "xi-num",
                `Who wore number ${n} for ${line.title.replace(" · ", ", ")}?`, pl.n);
  }
}

/* ---------- 21. more grounds ---------- */
for (const s of spread(STAD.filter(x => x.city), 241)) {
  add(s.sitelinks > 25 ? "extreme" : "ball", "stad-city2", `${s.name} is a ground in which city?`, `${s.city}, ${s.country}`);
}

/* ---------- keep everything that is already there, then top up ---------- */
const TARGETS = { hard: 400, ball: 400, extreme: 500 };
const LIVE = REPO + 'assets/deep/index.json';
let deep = { hard: [], ball: [], extreme: [] };
try { deep = JSON.parse(fs.readFileSync(LIVE, 'utf8')); } catch (e) {}

/* One key set across BOTH tiers, not one per tier. Two shapes can land on the
   same wording for the same player (his last move is also a transition), and
   a per-tier check would happily file one copy in Hard and another in BALL. */
const haveKeys = new Set();
["hard", "ball", "extreme"].forEach(t => (deep[t] || []).forEach(q => haveKeys.add(norm(q.q))));
for (const tier of ['hard', 'ball', 'extreme']) {
  const TARGET = TARGETS[tier];
  const have = deep[tier] || [];
  const fresh = out[tier].filter(q => !haveKeys.has(norm(q.q)));
  const need = Math.max(0, TARGET - have.length);

  /* Round-robin across shapes rather than taking the first N in the order the
     generator happened to emit them. Straight slicing lets whichever shapes
     are defined earliest eat the whole quota, which is how "shared club" got
     one question into Hard while "transition" took ninety-nine. */
  const buckets = new Map();
  fresh.forEach(q => { if (!buckets.has(q.shape)) buckets.set(q.shape, []); buckets.get(q.shape).push(q); });
  const order = [...buckets.values()];
  const take = [];
  for (let i = 0; take.length < need; i++) {
    let progressed = false;
    for (const b of order) {
      if (i >= b.length) continue;
      take.push(b[i]); progressed = true;
      if (take.length >= need) break;
    }
    if (!progressed) break;   // every bucket exhausted
  }
  take.forEach(q => haveKeys.add(norm(q.q)));
  deep[tier] = have.concat(take.map(({ q, a }) => ({ q, a })));
  console.log(`${tier.padEnd(5)} kept ${have.length} (handwritten included) + added ${take.length} = ${deep[tier].length}   [${buckets.size} shapes available]`);
}
fs.mkdirSync(REPO + 'assets/deep', { recursive: true });
fs.writeFileSync(LIVE, JSON.stringify(deep, null, 1));
console.log('wrote assets/deep/index.json');
console.log('now run: node _tests/bank-test.js');
