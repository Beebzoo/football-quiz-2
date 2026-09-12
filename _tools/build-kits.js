/* Expand Guess the Kit from the Commons kit diagrams.

   The limit on this mode is not supply, it is ambiguity. A plain red shirt is
   Manchester United, Benfica, Bayern and forty others, so every kit added has
   to be visually separable from every kit already in the deck. New shirts are
   taken in fame order and rejected when they collide with one already chosen.

   The 80 kits shipped before this are kept exactly as they are, in their
   existing tiers, even the ones that collide with each other. Breaking a deck
   Martijn already tuned is not this script's business; it reports those pairs
   and leaves the call to him. */
const fs = require("fs");
const path = require("path");
const { signature, distance, plainness } = require("./similar.js");

const REPO = path.join(__dirname, "..");
const KITS = path.join(REPO, "assets/kits");
const DL = process.env.KIT_DL || "kitdl";  // where the Commons downloads landed

const MIN_DISTANCE = +(process.argv[2] || 16);   // how far apart two shirts must look

/* Tier by a year of English Wikipedia pageviews, not by sitelink count.
   Sitelinks say Hegelmann and Riteriai are better known than Heerenveen,
   because small wikis stub every club that reaches a European tie. Readers
   per year puts them where a pub would put them. */
const TIERS = [[900000, "easy"], [300000, "normal"], [100000, "hard"], [0, "ball"]];

const params = require("./kit-params-all.json");
const lic = new Map(require("./kit-licence-all.json"));
const views = require("./kit-views.json");
const fameOf = c => views[c.title] || 0;
const existing = require(path.join(KITS, "index.json"));

/* Wikidata's label is the legal name; the deck wants what a table shouts.
   "Germany men's national association football team" has to come out as
   "Germany", and "Bologna F.C. 1909" as "Bologna". Order matters: the long
   national-side tail goes first, then club suffixes, then a trailing year. */
const CLEAN = [
  [/\s+men's\s+national\s+(association\s+)?(football|soccer)\s+team$/i, ""],
  [/\s+national\s+(association\s+)?(football|soccer)\s+team$/i, ""],
  [/\s+men's$/i, ""],
  [/\s*\((football|soccer)\)$/i, ""],
  [/\s+(Club de Fútbol|Fussball Club|Football Club|Futebol Clube|Calcio|Kalcio)$/i, ""],
  [/^(Club de Fútbol|Football Club|Futbol Club|Clube de Regatas do|Sociedade Esportiva|Club Atlético|Club Social y Deportivo|Club Deportivo|Associação|Esporte Clube|Clube Desportivo|Atlético Clube)\s+/i, ""],
  [/\s+(F\.?C\.?|A\.?F\.?C\.?|C\.?F\.?|S\.?C\.?|A\.?C\.?|S\.?S\.?|B\.?K\.?|S\.?K\.?|F\.?K\.?|J\.?K\.?|K\.?S\.?V\.?|C\.?S\.?V\.?|O\.?S\.?C\.?|S\.?V\.?|U\.?C\.?|A\.?J\.?|P\.?F\.?C\.?|B\.?S\.?C\.?)$/i, ""],
  [/^(F\.?C\.?|A\.?F\.?C\.?|C\.?F\.?|S\.?S\.?C\.?|S\.?C\.?|A\.?C\.?|A\.?C\.?F\.?|S\.?S\.?|A\.?S\.?|N\.?K\.?|F\.?K\.?|P\.?F\.?C\.?|K\.?F\.?|R\.?C\.?|U\.?C\.?)\s+/i, ""],
  [/\s+\d{4}$/, ""],                                   // "Bologna 1909"
  [/\s*[·,]\s*$/, ""],
];
const clean = n => {
  let s = n;
  for (let pass = 0; pass < 2; pass++) for (const [re, to] of CLEAN) s = s.replace(re, to).trim();
  return s || n;
};

/* A national side counts only if its article is titled like one. This is the
   line between a real team and a novelty: it keeps East Germany, Czechoslovakia
   and the Soviet Union, and drops Seborga, Occitania, Cascadia, the autonomous
   regional sides, and "Vatican City ... el mejor del mundo", which is someone's
   page-move vandalism rather than a football team. */
const NATION_TITLE = /^(.+?) (men's )?national (association )?(football|soccer) team$/i;
const NOT_A_NATION = /official|autonomous|regional|unofficial/i;
function nationName(title) {
  if (NOT_A_NATION.test(title)) return null;
  const m = title.match(NATION_TITLE);
  return m ? m[1].trim() : null;   // "Canada men's national soccer team" -> "Canada"
}
const slugify = n => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---- what is already in the deck -----------------------------------------
const chosen = [];               // {slug, name, sig} for everything in the final deck
const taken = new Set();
for (const [tier, rows] of Object.entries(existing)) {
  for (const r of rows) {
    const f = path.join(KITS, r.s + ".png");
    if (!fs.existsSync(f)) { console.log("  existing kit missing its png:", r.s); continue; }
    chosen.push({ slug: r.s, name: r.n, tier, sig: signature(fs.readFileSync(f)), old: true });
    taken.add(r.s);
  }
}
console.log(`kept from the existing deck: ${chosen.length}`);

/* Wikidata often carries the same club twice under different labels ("Inter"
   and "Inter Milan"), and both point at the same Commons pattern. Matching on
   the pattern catches that properly instead of leaning on the look-alike
   check to notice they are byte-identical. */
const usedPatterns = new Set();
for (const line of fs.readFileSync(path.join(KITS, "ATTRIBUTION.csv"), "utf8").trim().split("\n").slice(1)) {
  const p = line.split(";")[2];
  if (p) usedPatterns.add(p.trim());
}
console.log(`patterns already used by those kits: ${usedPatterns.size}`);

// ---- consider every new candidate, most famous first ----------------------
const haveName = new Set(chosen.map(c => c.name.toLowerCase()));
let noFile = 0, dupName = 0, dupPattern = 0, tooClose = 0, added = 0, notATeam = 0;
const collisions = [];

for (const c of params.sort((a, b) => fameOf(b) - fameOf(a))) {
  if (usedPatterns.has(c.pattern)) { dupPattern++; continue; }   // same club, other label
  const file = path.join(DL, "kit" + c.pattern + ".png");
  if (!fs.existsSync(file)) { noFile++; continue; }
  /* National sides are named off the article title, not the Wikidata label:
     the label for Canada is "Canadian men's national soccer team", and
     stripping the tail off that leaves the adjective, "Canadian". */
  let name;
  if (c.nat) {
    name = nationName(c.title);
    if (!name) { notATeam++; continue; }
  } else name = clean(c.name);
  if (haveName.has(name.toLowerCase())) { dupName++; continue; }

  let sig;
  try { sig = signature(fs.readFileSync(file)); } catch { noFile++; continue; }

  let worst = null;
  for (const other of chosen) {
    const d = distance(sig, other.sig);
    if (!worst || d < worst.d) worst = { d, other };
    if (d < MIN_DISTANCE) break;
  }
  if (worst && worst.d < MIN_DISTANCE) {
    tooClose++;
    if (collisions.length < 12) collisions.push(`${name} ~ ${worst.other.name} (${worst.d.toFixed(1)})`);
    continue;
  }

  let slug = slugify(name), n = 2;
  while (taken.has(slug)) slug = slugify(name) + "-" + n++;
  taken.add(slug); haveName.add(name.toLowerCase()); usedPatterns.add(c.pattern);
  const tier = TIERS.find(([min]) => fameOf(c) >= min)[1];
  chosen.push({ slug, name, tier, sig, pattern: c.pattern, colour: c.colour, views: fameOf(c), nat: c.nat, file });
  added++;
}

console.log(`\nconsidered ${params.length} candidates`);
console.log(`  added:              ${added}`);
console.log(`  rejected, too alike: ${tooClose}`);
console.log(`  rejected, duplicate name: ${dupName}`);
console.log(`  rejected, pattern already used: ${dupPattern}`);
console.log(`  rejected, not a real national side: ${notATeam}`);
console.log(`  no pattern file on disk: ${noFile}`);
console.log(`\nsample rejections (new kit ~ the one it clashes with):`);
collisions.forEach(c => console.log("  " + c));

const byTier = {};
for (const c of chosen) (byTier[c.tier] ||= []).push(c);
console.log(`\nfinal deck: ${chosen.length} kits`);
for (const t of ["easy", "normal", "hard", "ball"])
  console.log(`  ${t.padEnd(7)} ${String((byTier[t] || []).length).padStart(4)}  (was ${existing[t].length})`);
console.log(`  national sides added: ${chosen.filter(c => c.nat).length}`);

if (process.argv.includes("--write")) {
  for (const c of chosen) if (!c.old) fs.copyFileSync(c.file, path.join(KITS, c.slug + ".png"));
  const out = {};
  for (const t of ["easy", "normal", "hard", "ball"])
    out[t] = (byTier[t] || []).map(c => ({ s: c.slug, n: c.name, c: c.colour || "#FFFFFF" }));
  fs.writeFileSync(path.join(KITS, "index.json"), JSON.stringify(out));

  const rows = [];
  for (const c of chosen) {
    if (c.old) continue;
    const l = lic.get(c.pattern) || {};
    rows.push([c.slug + ".png", c.name, c.pattern, l.licence || "unknown", l.author || "unknown",
               "https://commons.wikimedia.org/wiki/File:Kit_body" + c.pattern + ".png"].join(";"));
  }
  // rewrite rather than append: the file already ends in a newline, and
  // appending another one leaves a blank row in the middle of the credits
  const csvPath = path.join(KITS, "ATTRIBUTION.csv");
  const csv = fs.readFileSync(csvPath, "utf8").split("\n").map(l => l.replace(/\r$/, "")).filter(l => l.trim());
  fs.writeFileSync(csvPath, csv.concat(rows).join("\n") + "\n");
  console.log(`\nwrote ${chosen.length} kits, ${rows.length} new attribution rows`);
}
