/* Build the Special deck: MVV, Las Palmas, Morocco, and the three national
   sides that matter at this table.

     node _tools/build-special.js --dry
     node _tools/build-special.js

   This is the one mode written for the three people who play it. Martijn
   follows MVV, Alejandro follows Las Palmas and Gran Canaria, and Morocco is
   the third flag on the front of the app, so the deck is those three clubs and
   country plus the record books of the Netherlands, Spain and Morocco.

   EVERY FACT COMES OFF WIKIPEDIA AND NOTHING IS TYPED FROM MEMORY. A quiz
   about your own club is exactly where a confidently wrong answer gets found
   out, and a model's recollection of the 1970 Intertoto Cup is worth nothing
   next to the article. Anything the parser cannot read cleanly is dropped
   rather than guessed at.

   TARGET THE SECTION, NEVER SCAN FOR A TABLE. The first build looked for any
   table with a player column and a goals column and confidently made Sergio
   Ramos Spain's leading scorer with 23, because some other table happened to
   be bigger. Section titles are the reliable handle, and they differ per side:
   "Most-capped players" for the Dutch, "Most caps" for Spain, "Most
   appearances" for Morocco, with the tables living on the main article for
   some and on a separate records page for others. The near misses are worse
   than the misses, so "Top goalscorers in World Cup finals" and "Past
   most-capped record holders" are excluded by name.

   TIES ARE WHY THIS PARSES ROWSPANS PROPERLY. When two players share a rank
   the second row is short by every cell the row above spans, and on the Dutch
   table that is two of them, so guessing an offset read Memphis Depay's debut
   year as his cap count. The carried cells are tracked by column instead. The
   caps column is also called Matches on that page and Appearances elsewhere,
   which is why the column is matched by pattern and not by name.

   ACTIVE PLAYERS MOVE THE NUMBERS, so a question that asks for a total says to
   accept a near answer, and the "name three of the top five" shape is used
   where the exact order is still moving.

   SAFE TO RE-RUN. Wikitext is cached in _tools/_models/ (gitignored); pass
   --fresh to ignore the cache. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const MODELS = path.join(__dirname, "_models");
const OUT = path.join(REPO, "assets", "special");
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const WIKI = "https://en.wikipedia.org/w/api.php";
const DRY = process.argv.includes("--dry");
const FRESH = process.argv.includes("--fresh");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cacheRead = f => { try { return JSON.parse(fs.readFileSync(path.join(MODELS, f), "utf8")); } catch (e) { return null; } };
const cacheWrite = (f, v) => { fs.mkdirSync(MODELS, { recursive: true }); fs.writeFileSync(path.join(MODELS, f), JSON.stringify(v)); };

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch (e) {}
    await sleep(1500 * (i + 1));
  }
  return null;
}

let cache = FRESH ? {} : (cacheRead("special-wiki.json") || {});
const save = () => cacheWrite("special-wiki.json", cache);

async function sections(title) {
  const k = "S:" + title;
  if (cache[k] === undefined) {
    const j = await getJSON(WIKI + "?action=parse&format=json&prop=sections&redirects=1&page=" + encodeURIComponent(title));
    cache[k] = (j && j.parse) ? j.parse.sections.map(s => ({ i: s.index, t: s.line })) : null;
    save(); await sleep(200);
  }
  return cache[k];
}
async function sectionText(title, index) {
  const k = "T:" + title + ":" + index;
  if (cache[k] === undefined) {
    const j = await getJSON(WIKI + "?action=parse&format=json&prop=wikitext&redirects=1&section=" + index + "&page=" + encodeURIComponent(title));
    cache[k] = (j && j.parse && j.parse.wikitext) ? j.parse.wikitext["*"] : null;
    save(); await sleep(200);
  }
  return cache[k];
}
async function fullText(title) {
  const k = "F:" + title;
  if (cache[k] === undefined) {
    const j = await getJSON(WIKI + "?action=parse&format=json&prop=wikitext&redirects=1&page=" + encodeURIComponent(title));
    cache[k] = (j && j.parse && j.parse.wikitext) ? j.parse.wikitext["*"] : null;
    save(); await sleep(200);
  }
  return cache[k];
}

/* ---------- wikitext down to something a person would say ---------- */
function plain(v) {
  return String(v || "")
    .replace(/<ref[\s\S]*?(?:\/>|<\/ref>)/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\{\{(?:nowrap|nobr|sortname|small)\|([^{}]*)\}\}/gi, "$1")
    .replace(/\{\{[^{}]*\}\}/g, " ")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'''?/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/* A cell may open with html attributes before a single pipe: style="..."|,
   align=left|, rowspan=2|. Strip those without eating a [[link|label]], and
   hand back how many rows the cell spans, because that is what keeps a tie
   from shifting every column to its left. */
function cell(c) {
  const m = String(c).match(/^\s*((?:[a-zA-Z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s|]+)\s*)+)\|(?!\|)/);
  const attrs = m ? m[1] : "";
  const span = (attrs.match(/rowspan\s*=\s*"?(\d+)/i) || [, "1"])[1];
  return { v: plain(m ? String(c).slice(m[0].length) : c), span: Math.max(1, +span) };
}
const num = v => { const m = plain(v).replace(/[,\s]/g, "").match(/\d+/); return m ? +m[0] : null; };

function firstTable(wikitext) {
  const src = String(wikitext || "");
  const start = src.indexOf("{|");
  if (start < 0) return null;
  let depth = 0, j = start;
  for (; j < src.length - 1; j++) {
    if (src[j] === "{" && src[j + 1] === "|") { depth++; j++; }
    else if (src[j] === "|" && src[j + 1] === "}") { depth--; j++; if (!depth) break; }
  }
  const head = [], raw = [];
  let cur = null;
  for (let line of src.slice(start, j + 1).split("\n")) {
    line = line.trim();
    if (line.startsWith("!")) { for (const c of line.replace(/^!+/, "").split("!!")) head.push(cell(c).v); }
    else if (line.startsWith("|-")) { if (cur && cur.length) raw.push(cur); cur = []; }
    else if (line.startsWith("|") && !line.startsWith("|}") && cur) {
      for (const c of line.replace(/^\|+/, "").split("||")) cur.push(cell(c));
    }
  }
  if (cur && cur.length) raw.push(cur);

  /* put the spanned cells back where they belong before anything reads a column */
  const rows = [];
  const held = {};                       // column -> { v, left }
  for (const cells of raw) {
    const row = [];
    let k = 0;
    while (row.length < head.length) {
      const at = row.length;
      if (held[at] && held[at].left > 0) { row.push(held[at].v); held[at].left--; continue; }
      if (k >= cells.length) break;
      const c = cells[k++];
      row.push(c.v);
      if (c.span > 1) held[at] = { v: c.v, left: c.span - 1 };
    }
    for (const at of Object.keys(held)) if (held[at].left <= 0) delete held[at];
    if (row.length) rows.push(row);
  }
  return head.length && rows.length ? { head, rows } : null;
}

/* Read a name column and a number column. Tie rows are one cell short because
   the rank above spans them, so columns are counted from the right. */
function readTable(tab, want) {
  if (!tab) return [];
  const h = tab.head.map(x => x.toLowerCase());
  const pi = h.findIndex(x => /player|name/.test(x));
  const wi = h.findIndex(x => new RegExp("^" + want).test(x));
  if (pi < 0 || wi < 0) return [];
  const out = [];
  for (const r of tab.rows) {
    const name = r[pi], val = num(r[wi]);
    if (!name || !/[a-zA-Z]/.test(name) || val === null) continue;
    const clean = name.replace(/\s*\(.*?\)\s*$/, "").replace(/\s*\d+\s*$/, "").trim();
    if (!clean || clean.length > 40) continue;
    if (out.some(o => o.name === clean)) continue;
    out.push({ name: clean, val });
  }
  return out;
}

/* find the section that really is the list we want, on any of these pages */
async function tableFor(pages, wantSection, avoid, column) {
  for (const p of pages) {
    const secs = await sections(p);
    if (!secs) continue;
    for (const s of secs) {
      if (!wantSection.test(s.t)) continue;
      if (avoid && avoid.test(s.t)) continue;
      const rows = readTable(firstTable(await sectionText(p, s.i)), column);
      if (rows.length >= 5) return { rows, from: `${p} / ${s.t}` };
    }
  }
  return null;
}

/* ---------- clubs ---------- */

/* One infobox field, unwrapped. Clubs keep the founding year, the ground and
   the capacity here and nowhere else tidy. */
function infobox(text, field) {
  const m = String(text || "").match(new RegExp("^\\s*\\|\\s*" + field + "\\s*=\\s*(.*)$", "mi"));
  return m ? plain(m[1]) : null;
}
/* The founding year is written {{Start date and age|df=yes|1902|4|2}}, and the
   cleaner strips templates whole, so that field has to be read raw. */
function infoboxYear(text, field) {
  const m = String(text || "").match(new RegExp("^\\s*\\|\\s*" + field + "\\s*=\\s*(.*)$", "mi"));
  if (!m) return null;
  const y = m[1].match(/\b(1[89]\d\d|20[0-2]\d)\b/);
  return y ? y[1] : null;
}

/* Honours are a bullet list, and the two clubs write them differently: MVV
   puts the competition in bold and the result on an indented bullet, Las
   Palmas puts the result on a colon line. Both boil down to the same thing:
   remember the last competition named, then read any line that says who won
   what and when. */
function honours(text) {
  const out = [];
  let comp = null;
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    /* Test the CLEANED line, not the raw one. The Dutch write it
       "** '''Champions''': 1988", with the colon outside the bold, so a test
       against the raw text sees "Champions''':" and calls it a competition
       name. That is how Spain ended up with a trophy called Champions. */
    const flat = plain(t);
    const isResult = /(winners?|champions?|winner|runners?-up|third place|promotion|promoted)\s*(\(\d+\))?\s*:/i.test(flat);
    if (!isResult) {
      /* a competition line: bold, usually a link, and no result words */
      const m = t.match(/^[*:;]*\s*'''\s*\[?\[?([^'\]|]+)/);
      if (m && /^[*:;]/.test(t)) { const c = plain(m[1]); if (c && c.length < 60) comp = c; }
      continue;
    }
    const kind = /runners?-up/i.test(flat) ? "runners-up"
               : /third place/i.test(flat) ? "third"
               : /promot/i.test(flat) ? "promotion" : "winner";
    const years = [];
    for (const y of flat.matchAll(/\b(1[89]\d\d|20\d\d)(\s*[-–]\s*(\d{2,4}))?/g)) {
      years.push(y[3] ? y[1] + "-" + y[3] : y[1]);
    }
    /* the "(4)" in "Winners (4):" is a count, not a year, and never looks like one */
    if (comp && years.length) out.push({ comp, kind, years: [...new Set(years)] });
  }
  return out;
}

/* "2 times" is not how anyone says it */
/* a possessive that reads right for a plural country: the Netherlands' */
const poss = c => /s$/i.test(c) ? c + "'" : c + "'s";
const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const TIMES = n => n === 1 ? "once" : n === 2 ? "twice" : (WORDS[n] || n) + " times";
/* English takes "the" before most competitions but never before La Liga */
const the = c => /^(la|le|les)\s/i.test(c) ? c : "the " + c;
/* infobox fields often stack values behind <br />, and the first is the one
   people actually use */
const firstOf = v => plain(String(v || "").split(/<br\s*\/?>|\n/)[0]);

const CLUBS = [
  { key: "mvv", name: "MVV Maastricht", short: "MVV", page: "MVV Maastricht" },
  { key: "lp", name: "UD Las Palmas", short: "Las Palmas", page: "UD Las Palmas" },
];

/* ---------- the deck ---------- */
const Q = [];
/* A question is only as good as the string that came out of the wikitext. Any
   answer still carrying a template, a pipe or a stray bracket did not parse,
   and a half-parsed answer on screen is worse than one fewer question. En
   dashes in scorelines become hyphens, because this app does not ship dashes. */
const tidy = v => String(v).replace(/[\u2012-\u2015]/g, "-").replace(/\s+/g, " ").trim();
const junk = v => !v || /[{}|\[\]]|^\s*$/.test(v) || v.length > 160;
let dropped = 0;
const add = (s, p, q, a, note) => {
  const qq = tidy(q), aa = tidy(a);
  if (junk(qq) || junk(aa)) { dropped++; return; }
  Q.push({ s, p, q: qq, a: aa, ...(note ? { note: tidy(note) } : {}) });
};

const NATIONS = [
  { key: "nl", side: "the Netherlands", pos: "Dutch", pages: ["Netherlands national football team records and statistics", "Netherlands national football team"] },
  { key: "es", side: "Spain", pos: "Spanish", pages: ["Spain national football team", "Spain national football team records and statistics"] },
  { key: "ma", side: "Morocco", pos: "Moroccan", pages: ["Morocco national football team", "Morocco national football team records and statistics"] },
];
const CAPS_SEC = /^(most[- ]capped players?|most caps|most appearances|appearances)$/i;
const CAPS_AVOID = /past|former|record holding|progression/i;
const GOALS_SEC = /^top goalscorers?$/i;
const GOALS_AVOID = /world cup|record holding|progression|qualif/i;

(async () => {
  console.log("--- the record books ---");
  for (const n of NATIONS) {
    const caps = await tableFor(n.pages, CAPS_SEC, CAPS_AVOID, "caps|matches|apps|appearances");
    const goals = await tableFor(n.pages, GOALS_SEC, GOALS_AVOID, "goals");
    console.log(`${n.side}:`);
    console.log(`   caps  ${caps ? caps.rows.length + " rows from " + caps.from : "NOT FOUND"}`);
    if (caps) console.log(`         top: ${caps.rows.slice(0, 3).map(r => r.name + " " + r.val).join(", ")}`);
    console.log(`   goals ${goals ? goals.rows.length + " rows from " + goals.from : "NOT FOUND"}`);
    if (goals) console.log(`         top: ${goals.rows.slice(0, 3).map(r => r.name + " " + r.val).join(", ")}`);

    const g = goals && goals.rows, c = caps && caps.rows;
    if (g && g[0]) {
      add(n.key, 3, `Who is ${poss(n.side)} all time leading goalscorer?`, g[0].name);
      add(n.key, 5, `How many goals did ${g[0].name} score for ${n.side}?`, g[0].val, "Within two either way counts.");
    }
    if (g && g[1]) add(n.key, 5, `Who sits second on ${poss(n.side)} all time scoring list?`, g[1].name);
    if (g && g.length >= 5) add(n.key, 8, `Name any three of ${poss(n.side)} five leading scorers of all time.`,
      g.slice(0, 5).map(x => `${x.name} (${x.val})`).join(", "), "Any three of the five.");
    if (c && c[0]) {
      add(n.key, 3, `Who has won the most caps for ${n.side}?`, c[0].name);
      add(n.key, 5, `How many caps did ${c[0].name} win for ${n.side}?`, c[0].val, "Within three either way counts.");
    }
    if (c && c[1]) add(n.key, 5, `Who is second on ${poss(n.side)} all time caps list?`, c[1].name);
    if (c && c.length >= 5) add(n.key, 8, `Name any three of the five most capped ${n.pos} players.`,
      c.slice(0, 5).map(x => `${x.name} (${x.val})`).join(", "), "Any three of the five.");
    if (c && g) {
      const both = g.slice(0, 8).filter(x => c.slice(0, 8).some(y => y.name === x.name));
      if (both.length) add(n.key, 8, `Which player makes the top eight for BOTH caps and goals for ${n.side}?`,
        both.map(b => b.name).join(" or "), both.length > 1 ? "More than one answer counts." : null);
    }
  }

  /* ---------- the two clubs ---------- */
  console.log("\n--- the clubs ---");
  for (const c of CLUBS) {
    const text = await fullText(c.page);
    if (!text) { console.log(`${c.name}: no article`); continue; }
    const founded = infoboxYear(text, "founded");
    const ground = infobox(text, "ground") || infobox(text, "stadium");
    const cap = num(infobox(text, "capacity"));
    const full = infobox(text, "fullname");
    const nickRaw = String(text || "").match(/^\s*\|\s*nickname\s*=\s*(.*)$/mi);
    const nick = nickRaw ? firstOf(nickRaw[1]) : null;

    const secs = await sections(c.page);
    const hs = (secs || []).find(x => /^honours?$/i.test(x.t));
    const hon = hs ? honours(await sectionText(c.page, hs.i)) : [];
    console.log(`${c.name}: founded ${founded}, ground ${ground} (${cap}), ${hon.length} honours lines`);
    for (const h of hon) console.log(`   ${h.kind.padEnd(11)} ${h.comp}: ${h.years.join(", ")}`);

    const fy = founded;
    if (fy) add(c.key, 3, `In which year were ${c.short} founded?`, fy, "Within five years counts.");
    if (ground) add(c.key, 3, `What is ${c.short}'s home ground called?`, ground);
    if (cap) add(c.key, 5, `Roughly how many does ${c.short}'s ground hold?`, cap.toLocaleString("en-GB"), "Within two thousand counts.");
    if (full && /\s/.test(full)) add(c.key, 8, `What does the full name of ${c.short} spell out?`, full);
    if (nick) add(c.key, 5, `What is ${c.short}'s nickname?`, nick);

    for (const h of hon) {
      const eu = /uefa|intertoto|european|cup winners/i.test(h.comp);
      if (eu && h.kind === "winner") {
        add(c.key, 10, `${c.short} have won a European trophy. Which one, and in what year?`,
          `${h.comp}, ${h.years.join(" and ")}`);
      } else if (h.kind === "winner" && h.years.length >= 2) {
        add(c.key, 8, `${c.short} have won ${the(h.comp)} ${TIMES(h.years.length)}. Name any one of the years.`,
          h.years.join(", "), "Any one of them.");
        add(c.key, 5, `How many times have ${c.short} won ${the(h.comp)}?`, h.years.length);
      } else if (h.kind === "winner") {
        add(c.key, 8, `In which year did ${c.short} win ${the(h.comp)}?`, h.years[0]);
      } else if (h.kind === "runners-up") {
        add(c.key, 10, `${c.short} finished runners-up in ${the(h.comp)}. In which season?`, h.years.join(", "));
      } else if (h.kind === "promotion") {
        add(c.key, 8, `${c.short} have been promoted to the top flight in which years?`, h.years.join(", "), "Any one counts.");
      }
    }
  }

  /* ---------- Morocco, beyond the record book ---------- */
  console.log("\n--- Morocco ---");
  const maText = await fullText("Morocco national football team");
  if (maText) {
    const secs = await sections("Morocco national football team");
    const hs = (secs || []).find(x => /^honours?$/i.test(x.t));
    if (hs) {
      const hon = honours(await sectionText("Morocco national football team", hs.i));
      for (const h of hon) console.log(`   ${h.kind.padEnd(11)} ${h.comp}: ${h.years.join(", ")}`);
      const afcon = hon.find(h => /^africa cup of nations$/i.test(h.comp) && h.kind === "winner");
      if (afcon) {
        /* say how many, because the article does, and it is not always one */
        const n = afcon.years.length;
        add("ma", 8, n === 1
          ? "Morocco have won the Africa Cup of Nations once. In which year?"
          : `Morocco have won the Africa Cup of Nations ${TIMES(n)}. Name a year.`,
          afcon.years.join(", "), n > 1 ? "Any one counts." : null);
        if (n > 1) add("ma", 10, "Name both years Morocco have won the Africa Cup of Nations.", afcon.years.join(" and "));
      }
      const runner = hon.find(h => /^africa cup of nations$/i.test(h.comp) && h.kind === "runners-up");
      if (runner) add("ma", 10, "In which year did Morocco lose an Africa Cup of Nations final?", runner.years.join(", "));
      for (const h of hon) {
        if (h.kind !== "winner" || /africa/i.test(h.comp)) continue;
        add("ma", 10, `Morocco have won the ${h.comp}. Name a year they did it.`, h.years.join(", "), "Any one counts.");
      }
    }
    const coach = infobox(maText, "coach") || infobox(maText, "manager");
    if (coach) add("ma", 5, "Who manages Morocco?", coach);
    const cap = infobox(maText, "captain");
    if (cap) add("ma", 5, "Who captains Morocco?", cap);
    const fifa = infobox(maText, "FIFA Trigramme") || infobox(maText, "fifa_trigramme");
    if (fifa) add("ma", 3, "What is Morocco's three letter FIFA code?", fifa);
    const nickname = infobox(maText, "Nickname") || infobox(maText, "nickname");
    if (nickname) add("ma", 5, "What are Morocco known as?", nickname);
    /* The opponent sits inside a flag template, which the cleaner strips, so
       the answer can only speak to the score, the place and the date. Ask what
       the answer actually knows. */
    const first = infobox(maText, "First game") || infobox(maText, "first_game");
    if (first) add("ma", 10, "Where and when did Morocco play their first ever international?", first);
    const big = infobox(maText, "Largest win") || infobox(maText, "largest_win");
    if (big) add("ma", 10, "What is the score in Morocco's biggest ever win, and where was it?", big);
    const worst = infobox(maText, "Biggest defeat") || infobox(maText, "largest_loss");
    if (worst) add("ma", 10, "What is Morocco's heaviest ever defeat?", worst);
  }

  /* ---------- what the three countries have actually won ---------- */
  console.log("\n--- national honours ---");
  for (const n of NATIONS) {
    const secs = await sections(n.pages[n.pages.length - 1]) || await sections(n.pages[0]);
    let page = n.pages[n.pages.length - 1], hs = (secs || []).find(x => /^honours?$/i.test(x.t));
    if (!hs) { page = n.pages[0]; hs = ((await sections(page)) || []).find(x => /^honours?$/i.test(x.t)); }
    if (!hs) { console.log(`${n.side}: no honours section`); continue; }
    const hon = honours(await sectionText(page, hs.i));
    console.log(`${n.side}: ${hon.map(h => h.kind + " " + h.comp + " " + h.years.join("/")).join(" | ") || "(nothing parsed)"}`);
    for (const h of hon) {
      const major = /world cup|euro|nations league|olympic|confederations/i.test(h.comp);
      if (!major) continue;
      if (h.kind === "winner") {
        add(n.key, h.years.length > 1 ? 8 : 5,
          h.years.length > 1
            ? `${n.side === "the Netherlands" ? "The Netherlands" : n.side} have won ${the(h.comp)} ${TIMES(h.years.length)}. Name a year.`
            : `In which year did ${n.side === "the Netherlands" ? "the Netherlands" : n.side} win ${the(h.comp)}?`,
          h.years.join(", "), h.years.length > 1 ? "Any one counts." : null);
      } else if (h.kind === "third" && /world cup|european championship/i.test(h.comp)) {
        add(n.key, 10, `${n.side === "the Netherlands" ? "The Netherlands" : n.side} finished third at ${the(h.comp)}. Name a year.`,
          h.years.join(", "), h.years.length > 1 ? "Any one counts." : null);
      } else if (h.kind === "runners-up" && /world cup/i.test(h.comp)) {
        add(n.key, 8, `${n.side === "the Netherlands" ? "The Netherlands" : n.side} have lost ${TIMES(h.years.length)} in a World Cup final. Name a year.`,
          h.years.join(", "), "Any one counts.");
      }
    }
  }

  /* ---------- Morocco at the World Cup ---------- */
  {
    const secs = await sections("Morocco national football team");
    const wc = (secs || []).find(x => /^fifa world cup$/i.test(x.t)) || (secs || []).find(x => /world cup/i.test(x.t) && !/qualif/i.test(x.t));
    if (wc) {
      const tab = firstTable(await sectionText("Morocco national football team", wc.i));
      if (tab) {
        const h = tab.head.map(x => x.toLowerCase());
        const yi = h.findIndex(x => /year/.test(x)), ri = h.findIndex(x => /result|round|position/.test(x));
        const runs = [];
        if (yi >= 0 && ri >= 0) for (const r of tab.rows) {
          const y = num(r[yi]), res = plain(r[ri]);
          /* a World Cup year is a World Cup year, and a result is words. Without
             this the wrong table sailed through as "2 2, 3 0, 4 3". */
          if (!y || y < 1930 || y > 2034) continue;
          if (!res || !/[a-z]{4}/i.test(res)) continue;
          if (/did not|withdrew|banned|to be/i.test(res)) continue;
          runs.push({ y, res });
        }
        if (runs.length < 3) { console.log("  World Cup table did not read cleanly, skipped"); runs.length = 0; }
        console.log(`Morocco at the World Cup: ${runs.map(r => r.y + " " + r.res).join(", ")}`);
        const ko = runs.filter(r => !/group|first round/i.test(r.res));
        if (ko.length) {
          add("ma", 8, "In which year did Morocco first reach the knockout rounds of a World Cup, the first African side to do it?", ko[0].y);
          const best = ko.find(r => /fourth|semi|third|final/i.test(r.res));
          if (best) add("ma", 5, `Morocco's best World Cup run ended where, and in which year?`, `${best.res}, ${best.y}`);
        }
        if (runs.length) add("ma", 8, "How many World Cups have Morocco played in?", runs.length, "Within one counts.");
      }
    }
  }

  cacheWrite("special-wiki.json", cache);
  console.log(`\n${Q.length} questions, ${dropped} dropped for not parsing cleanly`);
  fs.mkdirSync(OUT, { recursive: true });
  if (DRY) { console.log("\n--dry, nothing written"); return; }
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(Q));
  console.log(`written to assets/special/index.json`);
})();
