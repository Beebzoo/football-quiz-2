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
const OUT = path.join(REPO, "assets", "wc2006", "index.json");
const DRY = process.argv.includes("--dry");
const UA = "BALL-quiz-build/1.0 (personal project; contact via repo owner)";

const get = url => new Promise((res, rej) => {
  https.get(url, { headers: { "User-Agent": UA } }, r => {
    if (r.statusCode !== 200) return rej(new Error("HTTP " + r.statusCode + " for " + url));
    let b = ""; r.setEncoding("utf8");
    r.on("data", d => b += d); r.on("end", () => res(b));
  }).on("error", rej);
});

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

function parseSquads(wikitext) {
  const teams = [];
  // ===Country=== ... {{National football squad start}} ... {{...end}}
  const re = /^===\s*([^=]+?)\s*===\s*$/gm;
  const heads = [...wikitext.matchAll(re)].map(m => ({ name: m[1].trim(), at: m.index }));
  heads.forEach((h, i) => {
    const body = wikitext.slice(h.at, i + 1 < heads.length ? heads[i + 1].at : wikitext.length);
    const players = [];
    for (const m of body.matchAll(/\{\{\s*National football squad player\s*\|([\s\S]*?)\}\}\s*$/gm)) {
      const f = {};
      /* Split on | at depth zero. BOTH kinds of bracket have to be counted:
         the nested {{birth date}} is the obvious one, but a captain is written
         name=[[Edwin van der Sar]] ([[Captain (association football)|c]]) and
         that pipe lives inside [[...]]. Counting only braces cut every
         captain's name in half. */
      let depth = 0, cur = "";
      for (const ch of m[1]) {
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
        name: unlink(f.name),
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
    if (!pick) {   // a squad short of forwards borrows from midfield rather than failing
      pick = players.slice().sort((a, b) => a.no - b.no).find(p => !used.has(p));
    }
    if (!pick) return null;
    used.add(pick);
    xi.push({ n: shortName(pick.name), full: pick.name, no: pick.no, pos: pick.pos });
  }
  return xi;
}

(async () => {
  console.log("fetching the squads...");
  const raw = await get("https://en.wikipedia.org/w/api.php?action=parse" +
    "&page=2006%20FIFA%20World%20Cup%20squads&prop=wikitext&format=json&formatversion=2");
  const wikitext = JSON.parse(raw).parse.wikitext;

  const teams = parseSquads(wikitext);
  console.log("squads parsed: " + teams.length + " (expected 32)");
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
      const raw = await get("https://en.wikipedia.org/w/api.php?action=parse&page=" +
        page + "&prop=wikitext&format=json&formatversion=2");
      const w = JSON.parse(raw).parse.wikitext;
      const grab = k => { const m = w.match(new RegExp("\\|\\s*" + k + "\\s*=\\s*([A-Fa-f0-9]{6})")); return m ? "#" + m[1].toUpperCase() : null; };
      // a white shirt with coloured sleeves reads better as the sleeve colour
      const body = grab("body1"), arm = grab("leftarm1");
      const c = (body === "#FFFFFF" && arm && arm !== "#FFFFFF") ? arm : body;
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
  const FLAG_ALIAS = { "Netherlands": "Kingdom of the Netherlands" };
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
    const code = natFlag.get(FLAG_ALIAS[country] || country) || natFlag.get(country);
    if (code && fs.existsSync(path.join(FLAGDIR, code + ".png"))) return code;
    return DRY ? null : await downloadFlag(country);
  }

  const out = {};
  const missing = [];
  let short = 0;
  for (const t of teams) {
    const xi = pickXI(t.players);
    if (!xi) { console.log("  !! could not field an XI for " + t.name); continue; }
    if (xi.some(p => p.pos !== SHAPE[xi.indexOf(p)])) short++;
    const kit = kitFor(t.name);
    let colour = kit ? kit.c : await harvestKit(t.name);
    if (!colour) missing.push(t.name);
    out[t.name] = {
      kit: colour,
      flag: await flagFor(t.name),
      slug: kit ? kit.s : null,
      squad: t.players.length,
      xi,
    };
  }
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
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log("\nwrote " + path.relative(REPO, OUT) + "  (" + (fs.statSync(OUT).size / 1024).toFixed(1) + " KB)");
})().catch(e => { console.error("FAILED: " + e.message); process.exit(1); });
