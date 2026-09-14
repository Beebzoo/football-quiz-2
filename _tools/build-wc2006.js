/* The 2006 World Cup squads, for One on One's team picker.
 *
 *     node _tools/build-wc2006.js [--dry]
 *
 * WHY IT IS HARVESTED AND NOT TYPED. Thirty-two squads is 352 names in the
 * elevens alone, and this repo has learned twice over that a name typed from
 * memory is a name that is quietly wrong. Everything here comes off one
 * Wikipedia article, "2006 FIFA World Cup squads", which carries all 736
 * players in a single machine-readable template per man:
 *
 *   {{National football squad player|no=1|pos=GK|name=[[Edwin van der Sar]]
 *     |age=...|caps=130|club=[[Fulham F.C.|Fulham]]|clubnat=ENG}}
 *
 * WHICH ELEVEN. The article is a squad list, not a team sheet, so there is no
 * "starting XI" in the data to read. Players are picked by SHIRT NUMBER within
 * each position, lowest first, which in 2006 still tracked the first-choice
 * side closely and, more to the point, is deterministic and checkable. It is
 * not a claim about who started a particular match and the comment on the
 * mode's data says so. Shape is 1 GK, 4 DF, 3 MF, 3 FW, which is what the
 * pitch wants: keeper, two centre-backs, two wing-backs, a midfield three and
 * a front three.
 *
 * KIT COLOURS are NOT invented either. They are read out of the app's own
 * assets/kits/index.json, which build-kits.js harvested from Wikipedia
 * infoboxes and which already carries 174 senior national sides. Anything that
 * cannot be matched is REPORTED rather than guessed at, because a made-up
 * colour is exactly the sort of quiet wrongness this file exists to avoid.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const REPO = path.join(__dirname, "..");
/* WHICH TOURNAMENT. Wikipedia has used the same squad and match templates for
   every World Cup back to 1930, so the year is the only thing that changes.
   2006 is the default because it is the one whose data has been checked by
   hand, man by man, and it stays the default until another one has been. */
const YEAR = (i => (i > -1 && /^\d{4}$/.test(process.argv[i + 1] || "")) ? process.argv[i + 1] : "2006")(process.argv.indexOf("--year"));
const POOL = "wc" + YEAR;
const OUT = path.join(REPO, "assets", POOL, "index.json");
const DRY = process.argv.includes("--dry");
/* THE USER AGENT IS NOT DECORATION, it is the difference between a build that
   works and one that 429s on every single call.

   This started as "BALL-quiz-build/1.0 (personal project; contact via repo
   owner)" and Wikimedia throttled it into uselessness: every request came back
   429 with retry-after 35, the retries fell through to the fallbacks, and the
   build cheerfully reported eleven clubs out of eighteen as though that were a
   result. The same URL with a User-Agent naming a real, reachable project
   returned 200 on the first try and 174KB of wikitext.

   Wikimedia's policy asks for something that identifies the client and gives a
   way to contact whoever is running it. A vague phrase does not; a public repo
   URL does. Nothing else about the requests changed. */
const UA = "BALL2-quiz-build/1.0 (https://github.com/Beebzoo/football-quiz-2; personal hobby project)";

const sleep = ms => new Promise(r => setTimeout(r, ms));

const once = url => new Promise((res, rej) => {
  https.get(url, { headers: { "User-Agent": UA } }, r => {
    if (r.statusCode !== 200) {
      r.resume();
      const e = new Error("HTTP " + r.statusCode + " for " + url);
      e.status = r.statusCode;
      return rej(e);
    }
    let b = ""; r.setEncoding("utf8");
    r.on("data", d => b += d); r.on("end", () => res(b));
  }).on("error", rej);
});

/* BE POLITE OR BE THROTTLED.
   The first version of this fired a search plus up to six entity lookups for
   every one of the 32 countries, back to back and as fast as node could manage.
   Wikipedia answered with 429s, and the damage was not a crash: the failures
   fell through to fallbacks, so the build "succeeded" and quietly wrote a deck
   with three null kit colours and 27 made-up country codes. A throttle and a
   backoff are cheap; a build that lies is not. */
let lastCall = 0;
const GAP = 180;            // ms between requests
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const wait = GAP - (Date.now() - lastCall);
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      return await once(url);
    } catch (e) {
      const retryable = e.status === 429 || e.status >= 500;
      if (!retryable || i === tries - 1) throw e;
      const back = 1500 * Math.pow(2, i);
      console.log("    " + e.status + ", waiting " + (back / 1000) + "s");
      await sleep(back);
    }
  }
}

/* [[Álvaro Mesén]] -> Álvaro Mesén ; [[Luis Marín Murillo|Luis Marín]] -> Luis Marín */
function unlink(t) {
  return t.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
          .replace(/\[\[([^\]]+)\]\]/g, "$1")
          .replace(/\(\s*c\s*\)/gi, "")           // the captain's armband
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim();
}

/* What goes under a 24px shirt. Surname only, except that a lowercase particle
   belongs to the name: "Edwin van der Sar" is "van der Sar", not "Sar". */
const PARTICLES = new Set(["van","von","de","del","della","di","da","dos","das","du",
                           "el","al","ter","ten","der","den","la","le","bin","ibn","mc","o'"]);
function shortName(full) {
  const parts = full.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0];
  for (let i = 1; i < parts.length - 1; i++) {
    if (PARTICLES.has(parts[i].toLowerCase())) return parts.slice(i).join(" ");
  }
  return parts[parts.length - 1];
}

/* the eleven slots the pitch draws, in order */
const SHAPE = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];

/* every {{name|...}} in the text, returned as its raw inside, found by
   counting braces rather than by hoping the line ends politely */
function templates(body, name) {
  const out = [];
  const open = new RegExp("\\{\\{\\s*" + name + "\\s*\\|", "gi");
  let m;
  while ((m = open.exec(body))) {
    let i = m.index + 2, depth = 1;
    while (i < body.length && depth > 0) {
      if (body.startsWith("{{", i)) { depth += 1; i += 2; }
      else if (body.startsWith("}}", i)) { depth -= 1; i += 2; }
      else i += 1;
    }
    if (depth === 0) out.push(body.slice(m.index + m[0].length, i - 2));
  }
  return out;
}

function parseSquads(wikitext) {
  const teams = [];
  // ===Country=== ... {{National football squad start}} ... {{...end}}
  const re = /^===\s*([^=]+?)\s*===\s*$/gm;
  const heads = [...wikitext.matchAll(re)].map(m => ({ name: m[1].trim(), at: m.index }));
  heads.forEach((h, i) => {
    const body = wikitext.slice(h.at, i + 1 < heads.length ? heads[i + 1].at : wikitext.length);
    const players = [];
    /* BOTH NAMES. 2006 says National football squad player and 2022 says
       nat fs g player, with identical fields, so a tool that knows only the
       first returns zero men for the second and blames the headings. */
    const rows = [];
    for (const name of ["National football squad player", "nat fs g player", "nat fs player"])
      for (const inside of templates(body, name)) rows.push(inside);
    for (const inside of rows) {
      const f = {};
      /* Split on | at depth zero. BOTH kinds of bracket have to be counted:
         the nested {{birth date}} is the obvious one, but a captain is written
         name=[[Edwin van der Sar]] ([[Captain (association football)|c]]) and
         that pipe lives inside [[...]]. Counting only braces cut every
         captain's name in half. */
      let depth = 0, cur = "";
      for (const ch of inside) {
        if (ch === "{" || ch === "[") depth++;
        else if (ch === "}" || ch === "]") depth--;
        if (ch === "|" && depth === 0) { const e = cur.indexOf("="); if (e > 0) f[cur.slice(0, e).trim()] = cur.slice(e + 1); cur = ""; }
        else cur += ch;
      }
      const e = cur.indexOf("="); if (e > 0) f[cur.slice(0, e).trim()] = cur.slice(e + 1);
      if (!f.name || !f.pos) continue;
      players.push({
        no: parseInt(f.no, 10) || 99,
        pos: f.pos.trim().toUpperCase(),
        /* A NAME ENDS WHERE THE FIRST FOOTNOTE BEGINS. unlink strips HTML
           tags, so a <ref> vanished and left the {{cite news}} inside it
           behind, plus the sentence after it: Serbia and Montenegro shipped
           a bench man called "squad." whose full name was four hundred
           characters of UEFA citation. Cut first, clean second. */
        name: unlink(String(f.name).split(/<ref|{{/)[0]),
        caps: parseInt(f.caps, 10) || 0,
        club: unlink(f.club || ""),
      });
    }
    if (players.length >= 11) teams.push({ name: h.name, players });
  });
  return teams;
}

function pickXI(players) {
  const by = p => players.filter(x => x.pos === p).sort((a, b) => a.no - b.no);
  const pools = { GK: by("GK"), DF: by("DF"), MF: by("MF"), FW: by("FW") };
  const used = new Set();
  const xi = [];
  for (const want of SHAPE) {
    let pick = pools[want].find(p => !used.has(p));
    if (!pick) {
      /* A SQUAD SHORT OF FORWARDS BORROWS FROM MIDFIELD, not from the reserve
         goalkeepers. Mexico took three keepers and two forwards to 2006, and
         a plain shirt-number sort handed the eleventh slot to José de Jesús
         Corona at number 12, which put a goalkeeper on the right wing with a
         shot on goal. Any outfielder first, a keeper only if there is nobody
         else left at all. */
      const free = players.slice().sort((a, b) => a.no - b.no).filter(p => !used.has(p));
      pick = free.find(p => p.pos !== "GK") || free[0];
    }
    if (!pick) return null;
    used.add(pick);
    xi.push({ n: shortName(pick.name), full: pick.name, no: pick.no, pos: pick.pos });
  }
  /* THE BENCH, the other twelve, by the same rule. A substitution that says
     "Sneijder replaces Landzaat" needs a Sneijder to name, and until this the
     deck stored only squad: 23 and threw the other twelve away. Same shape
     build-clubs.js writes, so the app reads both decks the same way. */
  /* THE REST OF THE SQUAD, however many that is. It was capped at twelve,
     which is exactly right for the twenty-three men a 2006 squad had and wrong
     for the twenty-six a 2022 one has: Caicedo, Molina, Laporte and Frankowski
     all started matches in Qatar and none of them was in the deck, because they
     wore high numbers. A squad is a squad. */
  const bench = players.filter(p => !used.has(p)).sort((a, b) => a.no - b.no)
    .map(p => ({ n: shortName(p.name), full: p.name, no: p.no, pos: p.pos }));
  return { xi, bench };
}

(async () => {
  console.log("fetching the squads...");
  const raw = await get("https://en.wikipedia.org/w/api.php?action=parse" +
    "&page=" + encodeURIComponent(YEAR + " FIFA World Cup squads") + "&prop=wikitext&format=json&formatversion=2");
  const wikitext = JSON.parse(raw).parse.wikitext;

  const teams = parseSquads(wikitext);
  /* HOW MANY SIDES A WORLD CUP HAS. Thirty-two from 1998 to 2022, and
     forty-eight from 2026. Printed rather than asserted, because a harvest
     that finds forty-seven is worth looking at whichever year it is. */
  const EXPECTED = +YEAR >= 2026 ? 48 : 32;
  console.log("squads parsed: " + teams.length + " (expected " + EXPECTED + ")");
  if (teams.length !== 32) console.log("  !! not 32, check the article's headings");

  // kit colours out of the app's own harvested bank
  const kits = JSON.parse(fs.readFileSync(path.join(REPO, "assets/kits/index.json"), "utf8"));
  const flat = Object.values(kits).flat();
  const byName = new Map();
  flat.forEach(k => byName.set(k.n.toLowerCase(), k));
  const ALIAS = {   // what the squad article calls them vs what the kit bank calls them
    "ivory coast": ["ivory coast", "côte d'ivoire", "cote d'ivoire"],
    "south korea": ["south korea", "korea republic"],
    "united states": ["united states", "usa", "united states of america"],
    "czech republic": ["czech republic", "czechia"],
    "serbia and montenegro": ["serbia and montenegro", "serbia"],
    "trinidad and tobago": ["trinidad and tobago"],
    "iran": ["iran", "ir iran"],
    "saudi arabia": ["saudi arabia"],
    "china pr": ["china pr", "china"],
    "republic of ireland": ["republic of ireland", "ireland"],
  };
  const kitFor = name => {
    const keys = ALIAS[name.toLowerCase()] || [name.toLowerCase()];
    for (const k of keys) { const hit = byName.get(k); if (hit) return hit; }
    return null;
  };

  /* A handful of sides are not in the kit bank at all. Rather than pick a
     colour that looks about right, read the same field build-kits.js reads,
     straight off that team's own infobox. Note this is the CURRENT first
     shirt, not the 2006 one: national colours barely move, but it is an
     approximation and the mode's comment says so. */
  const fetched = {};
  async function harvestKit(name) {
    const page = encodeURIComponent(name + " national football team");
    try {
      /* REDIRECTS=1, which every other fetch in this repo passes. Without it
         "China PR national football team" resolves to nothing, because the
         article lives at "China national football team". */
      const raw = await get("https://en.wikipedia.org/w/api.php?action=parse&page=" +
        page + "&prop=wikitext&redirects=1&format=json&formatversion=2");
      const w = JSON.parse(raw).parse.wikitext;
      const grab = k => { const m = w.match(new RegExp("\\|\\s*" + k + "\\s*=\\s*([A-Fa-f0-9]{6})")); return m ? "#" + m[1].toUpperCase() : null; };
      /* A WHITE SHIRT WITH COLOURED SLEEVES reads better as the sleeve colour,
         and a shirt with no body colour at all reads as the sleeve for the
         same reason: Uzbekistan's 2026 shirt is a pattern, so its infobox
         leaves body1 empty and only the sleeves are stated. */
      const body = grab("body1"), arm = grab("leftarm1");
      const c = (!body || (body === "#FFFFFF" && arm && arm !== "#FFFFFF")) ? (arm || body) : body;
      if (c) { fetched[name] = c; console.log("  harvested " + name + " -> " + c); return c; }
    } catch (e) { console.log("  could not read a kit for " + name + ": " + e.message); }
    return null;
  }

  /* ---------- flags ----------
     The app already ships 156 of them in assets/natflags, and the One & Only
     bank already carries a harvested country -> flag-code mapping, so 29 of
     the 32 need nothing new at all. The rest are downloaded from the flag
     Wikidata itself names for that country (P41), never from a filename I
     guessed: "Flag of Serbia and Montenegro" has several and only the item
     knows which one belongs to the state that played in 2006. */
  const FLAGDIR = path.join(REPO, "assets", "natflags");
  const natRows = Object.values(JSON.parse(fs.readFileSync(path.join(REPO, "assets/nations/index.json"), "utf8"))).flat();
  const natFlag = new Map();
  natRows.forEach(r => { if (r.country && r.flag) natFlag.set(r.country, r.flag); });
  /* THE FLAG LIST IS A LIST OF STATES, and a football team is not always one.
     "Kingdom of the Netherlands" and "Kingdom of Denmark" are what the nations
     bank calls them, England is not a state at all, and the pattern repeats
     every time a tournament adds a monarchy. So the alias is tried, then the
     kingdom form, then the plain name, before anything is downloaded. */
  const FLAG_ALIAS = { "Netherlands": "Kingdom of the Netherlands" };
  const flagTries = c => [FLAG_ALIAS[c], "Kingdom of " + c, "Kingdom of the " + c, c].filter(Boolean);
  const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const getBuf = url => new Promise((res, rej) => {
    https.get(url, { headers: { "User-Agent": UA } }, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(getBuf(r.headers.location));
      if (r.statusCode !== 200) return rej(new Error("HTTP " + r.statusCode));
      const c = []; r.on("data", d => c.push(d)); r.on("end", () => res(Buffer.concat(c)));
    }).on("error", rej);
  });

  async function downloadFlag(country) {
    const code = slug(country);
    const file = path.join(FLAGDIR, code + ".png");
    if (fs.existsSync(file)) return code;
    const found = JSON.parse(await get("https://www.wikidata.org/w/api.php?action=wbsearchentities" +
      "&search=" + encodeURIComponent(country) + "&language=en&format=json&type=item&limit=5"));
    for (const cand of (found.search || [])) {
      const ent = JSON.parse(await get("https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" +
        cand.id + "&props=claims&format=json"));
      const p41 = ent.entities[cand.id]?.claims?.P41?.[0]?.mainsnak?.datavalue?.value;
      if (!p41) continue;
      const buf = await getBuf("https://commons.wikimedia.org/wiki/Special:FilePath/" +
        encodeURIComponent(p41) + "?width=160");
      if (buf.length < 100 || buf.readUInt32BE(0) !== 0x89504e47) continue;   // must be a real PNG
      fs.writeFileSync(file, buf);
      console.log("  flag for " + country + ": " + cand.id + " -> " + p41 +
                  " (" + buf.readUInt32BE(16) + "x" + buf.readUInt32BE(20) + ", " + buf.length + " bytes)");
      return code;
    }
    console.log("  !! no flag found for " + country);
    return null;
  }

  async function flagFor(country) {
    for (const name of flagTries(country)) {
      const code = natFlag.get(name);
      if (code && fs.existsSync(path.join(FLAGDIR, code + ".png"))) return code;
    }
    return DRY ? null : await downloadFlag(country);
  }

  /* ---------- three-letter codes for the scoreboard ----------
     A broadcast scorebug says NED 1-0 ITA, not Netherlands 1-0 Italy, and
     definitely not the first three letters of the name, which would give NET
     and SER. So the trigram is read off Wikidata: P3441 is the code FIFA
     assigns, P984 the IOC one as a fallback for anywhere FIFA has not. Both
     property ids were found by SEARCHING for them rather than typed from
     memory, which is the rule in this repo and the reason none of the six
     wrong competition ids in the original app happened again here.

     Only a country carries either property, which conveniently doubles as the
     check that the right entity was picked out of the search results. */
  /* TWO QUERIES, NOT SIXTY-FOUR.
     The first attempt at this searched Wikidata once per country and then
     fetched each candidate's claims, and got itself throttled into uselessness
     inside a minute. Both code lists are small and public, so they come down
     whole in a single SPARQL query each and the matching happens here.

     P3441 does NOT sit on the country. It sits on the national TEAM, which is
     why the labels being matched read "Netherlands national association
     football team" rather than "Netherlands", and why the junk filter has to
     throw out the women's, youth, futsal and beach sides that all legitimately
     share a country's code. P984, the IOC one, does sit on the country, and it
     is what covers Serbia and Montenegro: FIFA's code for them is not recorded
     anywhere on Wikidata, but the IOC's is SCG and so is their ISO alpha-3. */
  const SPARQL = "https://query.wikidata.org/sparql?format=json&query=";
  const sparqlRows = async prop => {
    const q = "SELECT ?code ?label WHERE { ?i wdt:" + prop + " ?code . " +
              "?i rdfs:label ?label . FILTER(lang(?label)='en') }";
    const j = JSON.parse(await get(SPARQL + encodeURIComponent(q)));
    return j.results.bindings.map(b => ({ code: b.code.value, label: b.label.value }));
  };
  const JUNK = /women|under-|futsal|beach|olympic|amateur|federation|B team/i;
  const CODE_ALIAS = {
    "United States": ["United States", "United States of America"],
    "Czech Republic": ["Czech Republic", "Czechia"],
    "South Korea": ["South Korea", "Korea Republic"],
    "Ivory Coast": ["Ivory Coast", "Côte d'Ivoire"],
    "Iran": ["Iran", "IR Iran"],
    /* FIFA calls them CHN. Without this the search misses, the code falls back
       to the first three letters of the flag file (china-pr), and China ends
       up wearing Chile’s trigram. */
    "China PR": ["China PR", "China"],
    "Republic of Ireland": ["Republic of Ireland", "Ireland"],
  };
  const rx = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let TEAM_CODES = [], COUNTRY_CODES = [];

  /* SIDES THAT NO LONGER EXIST, and therefore have no code left to look up.
     FIFA used YUG for FR Yugoslavia through 1998 and 2002 qualifying, and
     Wikidata records neither a FIFA nor an Olympic code for them because the
     body is gone. Only for the genuinely defunct: anything still playing must
     come off the harvest, which does not go stale. */
  const ABBR_OVERRIDE = {
    "FR Yugoslavia": "YUG",
    "Yugoslavia": "YUG",
    "Zaire": "ZAI",
  };
  function codeFor(country) {
    if (ABBR_OVERRIDE[country]) return ABBR_OVERRIDE[country];
    const names = CODE_ALIAS[country] || [country];
    // the men's senior side, named exactly
    for (const n of names) {
      const re = new RegExp("^" + rx(n) + " (men's )?national (association )?football team$", "i");
      const hit = TEAM_CODES.find(r => !JUNK.test(r.label) && re.test(r.label));
      if (hit) return hit.code;
    }
    // any national side of theirs that is not one of the excluded kinds
    for (const n of names) {
      const hit = TEAM_CODES.find(r => !JUNK.test(r.label) &&
        r.label.toLowerCase().startsWith(n.toLowerCase() + " ") && /national/i.test(r.label));
      if (hit) return hit.code;
    }
    // the country's own Olympic code, for states that no longer field a team
    for (const n of names) {
      const hit = COUNTRY_CODES.find(r => r.label.toLowerCase() === n.toLowerCase());
      if (hit) return hit.code;
    }
    return null;
  }

  if(!DRY){
    console.log("fetching country codes...");
    TEAM_CODES = await sparqlRows("P3441");
    COUNTRY_CODES = await sparqlRows("P984");
    console.log("  " + TEAM_CODES.length + " team codes, " + COUNTRY_CODES.length + " country codes");
  }

  const out = {};
  const missing = [];
  let short = 0;
  for (const t of teams) {
    const got = pickXI(t.players);
    if (!got) { console.log("  !! could not field an XI for " + t.name); continue; }
    const xi = got.xi;
    if (xi.some(p => p.pos !== SHAPE[xi.indexOf(p)])) short++;
    const kit = kitFor(t.name);
    let colour = kit ? kit.c : await harvestKit(t.name);
    if (!colour) missing.push(t.name);
    const flag = await flagFor(t.name);
    /* last resort is the two letter flag code in caps, which is at least real
       and never a guess at what a trigram might be */
    const abbr = codeFor(t.name) || (flag ? flag.slice(0,3).toUpperCase() : "???");
    out[t.name] = {
      kit: colour,
      abbr,
      flag,
      slug: kit ? kit.s : null,
      squad: t.players.length,
      xi,
      bench: got.bench,
    };
  }
  console.log("\ncodes: " + Object.entries(out).map(([c, v]) => v.abbr).join(" "));
  const guessed = Object.entries(out).filter(([, v]) => v.abbr.length !== 3 || v.abbr === "???");
  if(guessed.length) console.log("  !! not a real trigram: " + guessed.map(([c, v]) => c + "=" + v.abbr).join(", "));
  const noflag = Object.entries(out).filter(([, v]) => !v.flag).map(([c]) => c);
  console.log("flags resolved:    " + (Object.keys(out).length - noflag.length) + "/" + Object.keys(out).length +
              (noflag.length ? "   MISSING: " + noflag.join(", ") : ""));

  console.log("\nteams with an XI: " + Object.keys(out).length);
  console.log("kit colour found:  " + (Object.keys(out).length - missing.length));
  if (missing.length) console.log("  NO KIT COLOUR (left null, not guessed): " + missing.join(", "));
  console.log("\nsample, Netherlands:");
  (out["Netherlands"] || { xi: [] }).xi.forEach((p, i) =>
    console.log("  " + SHAPE[i].padEnd(3) + " #" + String(p.no).padEnd(3) + p.n + "   (" + p.full + ")"));

  if (DRY) { console.log("\n--dry, nothing written"); return; }

  /* REFUSE TO WRITE A DECK THAT IS KNOWN TO BE WRONG.
     Every fallback in this file is there so a single missing field cannot take
     the whole build down. Put together, though, they are perfectly capable of
     producing a deck that looks fine and is full of nulls and invented country
     codes, and that is exactly what a throttled run did once. So the fallbacks
     stay, and the build now checks its own output before it replaces anything. */
  const problems = [];
  for (const [c, v] of Object.entries(out)) {
    if (!v.kit) problems.push(c + ": no kit colour");
    if (!v.flag) problems.push(c + ": no flag");
    if (!/^[A-Z]{3}$/.test(v.abbr || "")) problems.push(c + ": '" + v.abbr + "' is not a country code");
    if (!v.xi || v.xi.length !== 11) problems.push(c + ": not eleven men");
  }
  /* AN EMPTY POOL IS WORSE THAN NO POOL. It ships a quiz that offers a pitch
     with nobody on it, and it looks like a successful run. */
  if (!Object.keys(out).length) {
    console.error("\nnothing was parsed, so nothing is written. Check the article's template names.");
    process.exit(1);
  }
  if (problems.length && !process.argv.includes("--force")) {
    console.log("\nNOT WRITING. " + problems.length + " problem(s):");
    problems.slice(0, 12).forEach(p => console.log("  " + p));
    if (problems.length > 12) console.log("  ...and " + (problems.length - 12) + " more");
    console.log("\nMost likely a rate limit. Wait a minute and run it again.");
    console.log("--force writes it anyway.");
    process.exitCode = 1;
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log("\nwrote " + path.relative(REPO, OUT) + "  (" + (fs.statSync(OUT).size / 1024).toFixed(1) + " KB)");
})().catch(e => { console.error("FAILED: " + e.message); process.exit(1); });
