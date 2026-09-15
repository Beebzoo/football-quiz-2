#!/usr/bin/env node
/* Decide a category for every row in the five runtime packs and write one
 * cat-map per pack, keyed by question text.
 *
 *     node _tools/_questions/make-pack-cats.js              writes the five maps
 *     node _tools/_questions/make-pack-cats.js --show cups  also prints that category
 *     node _tools/_questions/make-pack-cats.js /path/to/repo
 *
 * WHY. h2Draw filters a tier on bank[n].cat === spec. The five packs are pushed
 * straight into BANK at runtime, object for object (index.html:6421), so the cat
 * their own index.json carries is the cat the draw reads. Nothing in index.html
 * can tag them afterwards. This writes the decisions, apply-pack-cats.js stamps
 * them, and the two halves are kept apart on purpose: nothing under assets/ is
 * opened for writing here.
 *
 * HOW THE DECISIONS ARE CARRIED. The packs were read and judged row by row in
 * slices. A slice is recorded here as one letter per row, in the pack's own
 * array order, so the decision cannot drift from the row it was made about:
 *   c champions   s scorers   t transfers   m managers   g grounds   r records
 *   e europe      u cups      l relegation  i imports    y stories   n none
 * SEQ holds one string per pack tier and its length must equal that tier's row
 * count exactly. A tier whose length is out by one would silently shift every
 * decision after the gap, so a mismatch stops the tool before anything is
 * written, and ANCHOR re-checks the first and last question of every tier by
 * its exact text.
 *
 * THREE PACKS CARRY NO SEQUENCE. facts, nicknames and awards are wholly made of
 * five repeating question shapes, so they are decided by RULES and every row is
 * required to match one: an unmatched row means a new shape was added to those
 * packs and somebody has to judge it. RULES is also run over the sequenced packs
 * as a check, and a row where the two disagree stops the tool.
 *
 * NULL IS A REAL ANSWER. 861 pack rows have no honest home among the eleven and
 * get none. h2Draw falls back to the whole tier, so the row is still asked.
 *
 * NEVER INVENTS A FACT. Every decision is read off the question's own wording.
 * Nothing here looks anything up.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const CATS = ["champions", "scorers", "transfers", "managers", "grounds",
  "records", "europe", "cups", "relegation", "imports", "stories"];
const PACKS = ["facts", "deep", "nicknames", "awards", "extra"];
const TIERS = ["easy", "normal", "hard", "extreme", "ball"];
const LETTER = { c: "champions", s: "scorers", t: "transfers", m: "managers",
  g: "grounds", r: "records", e: "europe", u: "cups", l: "relegation",
  i: "imports", y: "stories", n: null };

const args = process.argv.slice(2);
const showIdx = args.indexOf("--show");
const SHOW = showIdx === -1 ? null : args[showIdx + 1];
const given = args.filter((a, i) => !a.startsWith("--") && i !== showIdx + 1)[0];
const die = m => { console.error(m); process.exit(2); };

const looksRight = d => fs.existsSync(path.join(d, "index.html")) &&
  fs.existsSync(path.join(d, "_tools", "_questions"));
const walkUp = start => {
  let d = path.resolve(start);
  for (;;) { if (looksRight(d)) return d; const up = path.dirname(d); if (up === d) return null; d = up; }
};
const REPO = given ? path.resolve(given) : (walkUp(__dirname) || walkUp(process.cwd()));
if (!REPO || !looksRight(REPO)) die("cannot find the repo, pass its path as the first argument");
const rel = p => path.relative(REPO, p).split(path.sep).join("/");

/* ---------- the question shapes that make up facts, nicknames and awards,
   and that also police the sequenced packs ---------- */
const RULES = [
  [/^Who won (the Eredivisie|the Premier League|the Bundesliga|the Primeira Liga|La Liga|Serie A|Ligue 1) in \d{4}\/\d{2}\?$/, "champions"],
  [/^Who won the Champions League in \d{4}\/\d{2}\?$/, "europe"],
  [/^Who won the (KNVB Cup|Copa del Rey) in \d{4}\/\d{2}\?$/, "cups"],
  [/^Which club plays its home games at .+\?$/, "grounds"],
  [/^In which year were .+ founded\?$/, "records"],
  [/^Which club is nicknamed ".+"\?$/, "records"],
  [/^Who won the Ballon d'Or in \d{4}\?$/, null],
  [/^Who won FIFA World Player of the Year in \d{4}\?$/, null],
  [/^Who won the European Golden Shoe in \d{4}\?$/, "scorers"],
  [/^Who wore (the armband|number \d+) for .+\?$/, null],
  [/lined up in which formation\?$/, null],
  [/^Who kept goal for .+ final \d{4}\?$/, null],
  [/^Which side lined up with .+\?$/, null],
  [/is the only player from which country ever to appear for .+\?$/, "imports"],
  [/is the only .+ player ever to turn out for which club\?$/, "imports"],
  [/^In which city would you find .+\?$/, "grounds"],
  [/ is a ground in which (country|city)\?$/, "grounds"],
  [/^Which club did .+ join after leaving .+\?$/, "transfers"],
  [/^Which club did .+ leave to sign for .+\?$/, "transfers"],
  [/^Which club did .+ start his senior career at\?$/, "transfers"],
  [/^Which club did .+ play for between .+ and .+\?$/, "transfers"],
  [/^Which club have both .+ and .+ played for\?$/, "transfers"],
  [/^Which club have both .+ and .+ managed\?$/, "managers"],
  [/^Which national side has .+ taken charge of\?$/, "managers"],
  [/^Which job did .+\?$/, "managers"],
  [/^Where did .+ take his first coaching job\?$/, "managers"],
  [/^Which position (did|does) .+\?$/, null],
  [/^Which country is (the [a-z\- ]+ )?[A-Z].+ from\?$/, null],
  [/^What is the top division in .+ called\?$/, null],
  [/^Which national team is nicknamed .+\?$/, "records"],
  [/^Which two clubs contest the .+ derby\?$/, "records"]
];
const RULED = ["facts", "nicknames", "awards"];
const byRule = q => { for (const [re, cat] of RULES) if (re.test(q)) return { hit: true, cat: cat }; return { hit: false }; };

/* ---------- one letter per row, in the pack's own array order ---------- */
const SEQ = {
  "deep/easy":
    "nn",
  "deep/normal":
    "nnnnnnnnnrm",
  "deep/hard":
    "csgncycycsssyycsycsycsrnryrmeeeereemeeeeeeeeegeeeyyeeeegeeee" +
    "ecccmcmgggggrrrgggruurggtcrytegryyrttttttttttttttttttttttttt" +
    "ttttttttttttttttttttttttttttttttttttttttttttttttnnntttnnigtm" +
    "ittnnigtmitttnnigitnnigtittnnigtimttnnigtitttnnigmimtttnnigi" +
    "ttnnigimtttnnigitttnnigimtnnigimtnnigtinnigimnnigtinnigimtnn" +
    "igimnnigtitnnigimtnnigtimnnigimnnigtttnnigtmimtttnnigtmimttt" +
    "nnigtmimttnnigtimtttnnigtimtttnnitttnigtnnnnnnnnnnnnnnnnn",
  "deep/extreme":
    "cmrrscscycscscsyrrrcycscsysrrcsegeemmeeemmemeeeeeeeeeemeyeee" +
    "eeeeeeeeccmeueemernnmmyysstttytemeetmemrrmmmmmmmmmmmmmmmmmmm" +
    "mmmmmmmmmmmmmmmmmmmtgtttyucettiiiiiiiiiiiiiiiiiiiiiiiiiiiiii" +
    "iiiitttttttttttttttttttttttnnnnnnnnnnnnnnnnnnnnnnnnnnnnntttc" +
    "tnnnnnggggggggcitngigmcitngigsingmimgmitngimgmritngigmingigm" +
    "ritngigmmyitngimgmitngigmitngigmmitngiggimggimggimggigmgigmg" +
    "imggimggimgmgimggimgmgiggimgmgimgmgimggiggimggiggiggimmtgmim" +
    "gmmtgmimgmmtgmimgmmtgmimgmmtgmimgmmtgimgmmtgimgmmtimgmmtimgm" +
    "mtimgmmmctimgmmctimgnnnnnnnnnnnnnnnnnn",
  "deep/ball":
    "yycyyccsycsyycsycyyyccccccscyyyyeeeeeemeeeeeeeceetttyyyyyyym" +
    "eyyccinyyceeetcyeurttttigrgmeescmrmmcmmmiyttynytttggrttttttt" +
    "tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt" +
    "nnigigttnnigigttnnigigtnnigigtttnnigigtttnnigigttnnigigttnni" +
    "gigtttnnigigttnnigigtnnigigtnnigigtnnigignnigigtnnigignnigig" +
    "nnigignnigigtnnigignnigitttnnigmigtttnnigigtttnnigit",
  "extra/easy":
    "gggnnnnmncengnnnmgngnrnrnuuynngggnnnnnnnnnnntttggnnnnnncgctn" +
    "nnnnnnnnnnnnsnnnnnnennnnrrrrrrrrnnnngggtncgmrrmnnnnnnnnggggg" +
    "nrmctgggggcnnnnsccgtcmntstttttggggnnlltmmrgrgttnnngttcnnstnn" +
    "ngggggggnecclnnnnnngnsgnttnttgggnnnnnncgucttncnntntngggtnnen" +
    "tnnncntntennceentnentmnttgggrncntnnnnnmntntgngtnmneetmtnnlnt" +
    "ttenrrrcttncntnncccgnnnnuttttnsgnnnnnnnnnnnnnnnnnnnnnnnnnnnn" +
    "nnnnnnnnnnnnnnnnnnnncnnnnsnnnnnnnnnnnnnnnggrgccccsgcnrtsttnt" +
    "nnttnrnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn" +
    "nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnllnnnnnllnnnunnnnnnnnn" +
    "nnnnegncnnnttnnsyygyyrrnnnssnnyrnnnnryynynrntssrtnmecmcgyecc" +
    "yygnnnyyyyyyyyyyggyyyttccyymgmymmsnnntnnnggegcnggggggggggttn" +
    "nnnnnnnnnnnnnncnrgnnnrrrrrrrrrrrrrnngnngnnnnnnnnngnnnnncmmmn" +
    "nnntttnnnnyrnctcrtncmnggnnnnnnnnnngcng",
  "extra/normal":
    "gggglmeecutettccmcettmtttttreggtgmceestctcttnsggggccttrtcrcc" +
    "syyttimtttiecetennnggegcccugyuetnnngggttcmmmmmmertemetttnccc" +
    "cttgcctimmgcnstttrgcgeecmccmmtgrtugmttcmtetttttttccgcnnngccc" +
    "cmcemmmeemmcmrrnteegttnttstttttccgrrtueetttteettngetcrmrecgc" +
    "ycccccytcccccsggnnnnlnncgyrtitmmmmemmnnnnnennnnnnnnnnnnggggg" +
    "grrrrrgcgcccccgcemgtsttsccssnmtgmtnnnnnlnnsycccycrnsssyssgns" +
    "cyssygccmnmmyncsccsmcrcrncsyccccgycngsscsscscnnyccngsmmmmscc" +
    "ccccrrrncscgcnsgsccsceyemgmeeegeemeeegeegeeemgeeeeyeegegeegm" +
    "egeemeemgegmmeeeeereeesneggeeeegeeeemeeemgeegegrccyrtrnmmsyy" +
    "snrcymtygrtttttccnitmmmycmmynimmmmmtmmymmnmmmmmmmmmcimmncnni" +
    "nmmmymmtmmmmyrmmmmnrtmmmmmmmumnnnnnnnnnnnnntmttttytgmngnngrg" +
    "nnngnnnnnnnngmyyyynnttuyngtrngnngnuusuuungtttttytttttuttttnt" +
    "cninte",
  "extra/hard":
    "rsecmcscntmmtstmmtttmntmmnnrmyussscgnmnngyrrssgennreecceestn" +
    "irgegcniutyccnmneumggccrnrycymmmnttegryttcccneeeeccccmmcmnmc" +
    "ctteeegeeemysnncctyyyyyyyyyyysyyyttcmngyyyymmcccttctgeernsnn" +
    "nnggrmrnnnnnnnnrrrmgcggntssccsssysssscyysccsmreeeeeeeeeeeeee" +
    "ssusccmmuslrsmelucmcmmcytmcsytmmcmcstecmmmmctmmmmmmmmccccccn" +
    "ccccccnsceescctttyyynsmyyyyyyyyusyyyyynnyyyyyyrrlscnrccccccc" +
    "eggmeeeeeeeeeeeeeeemeeeeeeeeeeeeeegcccccycsrssrnyyegegnyrrny" +
    "rmuusrnirrrcccccyccsntsrecetemrmscmcccmcmisisyyyyumccccrtmrt" +
    "tscntmccuycmimcsmuyrrryrucsmllgmmtcmmyccmcmycrsmsuimulcrttmy" +
    "rimcmlycssygssmuymstmtccmmmgyygmmmmmmnrnnnsryeeyyeyyyyrgyyey" +
    "yyyyyuyyyyyyyyyyyyymyymyyryyyssrrsyyttgnggugtllgyyyyyyyyryyy" +
    "yyyyyyyycsyyyyyysnssuslssuuumuumlnrgmmcttitsrggggummynul",
  "extra/extreme":
    "ccrmmcmeismgcurulleseuucccucgcmmmmecseeeeeyeelcmeececccmtmuy" +
    "yyyryyyyyyryyyemcrrsmurrrryyeryrryyyryyrrmyyreryyyyyyyyrrryy" +
    "ygyrryylygrgrriurrrrrygyrycysyryyyytnuenmemruguttmmrsgegyruu" +
    "smlcscsuygeuyyyceryttmgsttruugyrrnngnsccuurrrrymmtrrtttcmmtn" +
    "cystccgytuuyrrrrusgmcmsccemcssscscrcctusgmtsysyegreetsemummt" +
    "tccinmytcttrcemnyretglluccntrsrysuryyyrryyyysyyrisngysrscyss" +
    "sycsynsgycrcrsssmcmcsynsyrymryrnyyymycmceeeeeemeeeeereeeeenn" +
    "nntrttssrtircccrsycrrrrynurrrtttrrusuucyccrgcccsccccccccccsc" +
    "ccccccscccrrccscccscrcsssscsscccrccssccsyycccstycsscccenneeg" +
    "meceecrscreeeuuuyecmcssersseccsrsssgrgcmmumrmsmulggggegyyrrr" +
    "ygyyyyesryyyyyyyyrryyyyyyyyytyyyysylllssnsssnnrssusussusuuuu" +
    "uuususususuruulrlllyyyllrcgggggyyyynllrrmrcccmyclyrcccclttts" +
    "ssssrggygggsmmmmmuuclluyr",
  "extra/ball":
    "cccrrycsssscgcyesrmrrmsgsiluuectreeecmcmeueemcylermeeeccmcmc" +
    "myyyyyyyyryryyyyyyyyuryyyyynryyyrryiyyyyryyyryryyyyyyyyyyryl" +
    "yryrycyyeecyriryyieyryreyyrggyirryyurrrryyyyyrylyyyyyyylrycr" +
    "yryryyeyyryyyyryryyyyyyyggryyyyyyyyyyyyyyyyyryyryyrcyyryyyne" +
    "cimmrsuyemtryecrycrlmcceyyemgneyrcyycecicstrrrrynycrrrrtmmmt" +
    "yyrtcyriyysyyyyyyyyymcysmyryllyyyelleeysyrgyryyryygyyyyetiii" +
    "tmguyyyyyruryyynggggrgrerirrrrretrylryyyyyrryyyyyyyyyyyyyyyy" +
    "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyygyyyyyyyyyyyyyttyyy" +
    "yyyyygggggggggggggggggggrggygggyygggyyueurggrgyyyyyyyyyyeyyy" +
    "yyyyyryyryyyyrryyyyyyyyyyyyyyyyyyyyyyyyygggyyyygyyyeyyyyryyy" +
    "yyryeyyuuuyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyygggyyyyyyttttyy" +
    "yyyyttytyyytyyyyyyyyyyryyyyyyyyyyyyyyyyyyyyyyyyyyryyyyryyyyy" +
    "syyyyyyyyyyyyylyyyygyyyyyyytyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy" +
    "yryyyyyyyyyyyyyyyyyyyyyyyyyyrmlyyyyy"
};

/* ---------- the row each slice started and ended on, checked by text ---------- */
const ANCHOR = {
  "facts/easy": [
    "Who won the Eredivisie in 2025/26?",
    "Which club plays its home games at RheinEnergie Stadion?"],
  "facts/normal": [
    "Who won the Eredivisie in 2017/18?",
    "Which club plays its home games at Stadion An der Alten Försterei?"],
  "facts/hard": [
    "Who won La Liga in 2007/08?",
    "Which club plays its home games at Estadio El Plantío?"],
  "facts/extreme": [
    "Who won the Eredivisie in 1988/89?",
    "Which club plays its home games at Estadio Francisco de la Hera?"],
  "facts/ball": [
    "Who won the Eredivisie in 1979/80?",
    "Who won the Copa del Rey in 1969/70?"],
  "deep/easy": [
    "Who wore the armband for Argentina, World Cup final 2022?",
    "Who wore the armband for Portugal, Euro final 2016?"],
  "deep/normal": [
    "Who wore the armband for Spain, Euro final 2008?",
    "Who managed Greece to the Euro 2004 title?"],
  "deep/hard": [
    "Which country did the Netherlands beat in the 1988 European Championship final?",
    "Who wore the armband for Brazil, World Cup final 1970?"],
  "deep/extreme": [
    "Which country hosted the 1934 World Cup and won it?",
    "Who wore number 2 for Brazil, World Cup final 1970?"],
  "deep/ball": [
    "The Jules Rimet trophy was stolen in England in 1966. Who found it?",
    "Which club did Jay-Jay Okocha join after leaving Paris Saint Germain?"],
  "nicknames/easy": [
    "Which club is nicknamed \"Los Merengues\"?",
    "Which club is nicknamed \"The Potters\"?"],
  "nicknames/normal": [
    "Which club is nicknamed \"The Swans\"?",
    "Which club is nicknamed \"Recre\"?"],
  "nicknames/hard": [
    "Which club is nicknamed \"The Rave Green\"?",
    "Which club is nicknamed \"Hanseaten\"?"],
  "nicknames/extreme": [
    "Which club is nicknamed \"Faris Ad-Dahna\"?",
    "Which club is nicknamed \"Los Tiburones\"?"],
  "awards/normal": [
    "Who won the Ballon d'Or in 1992?",
    "Who won the Ballon d'Or in 2025?"],
  "awards/hard": [
    "Who won the Ballon d'Or in 1957?",
    "Who won the European Golden Shoe in 1997?"],
  "awards/extreme": [
    "Who won the European Golden Shoe in 1976?",
    "Who won the European Golden Shoe in 1976?"],
  "extra/easy": [
    "In which Dutch city do MVV play?",
    "Barcelona's women drew a world record crowd of over 91,000 in 2022 at which stadium?"],
  "extra/normal": [
    "Which Dutch club is based in Doetinchem?",
    "Lucy Bronze won three Women's Champions Leagues with which French club?"],
  "extra/hard": [
    "Which Dutch goalkeeper set the Premier League record of 1,311 minutes without conceding, in 2009?",
    "Everton came from 2-0 down to beat Wimbledon 3-2 on the last day of 1993-94 and stay up. Which club went down instead?"],
  "extra/extreme": [
    "Which Limburg club won the Dutch national championship in 1950, the first from the province to manage it?",
    "Which club won promotion to the Premier League in 2005, 27 years after being elected to the Football League?"],
  "extra/ball": [
    "Which club won the Eerste Divisie title in 1981-82?",
    "Julio Grondona ran Argentine football for 35 years wearing a ring engraved with which two words?"]
};

/* ---------- decide, checking every guard, then write one map per pack ---------- */
for (const k of Object.keys(SEQ)) {
  const bad = SEQ[k].split("").filter(ch => !(ch in LETTER));
  if (bad.length) die("SEQ " + k + " carries " + bad.length + " letter(s) outside the twelve: " + [...new Set(bad)].join(""));
}

const OUT = path.join(REPO, "_tools", "_questions", "packs");
fs.mkdirSync(OUT, { recursive: true });

const grid = {}, tierRows = {}, shown = [];
let rows = 0, tagged = 0, ruled = 0, sequenced = 0;

for (const pack of PACKS) {
  const src = path.join(REPO, "assets", pack, "index.json");
  if (!fs.existsSync(src)) die("no pack at " + rel(src));
  const bank = JSON.parse(fs.readFileSync(src, "utf8").replace(/^﻿/, ""));
  const unknown = Object.keys(bank).filter(t => TIERS.indexOf(t) === -1);
  if (unknown.length) die(rel(src) + " has a tier this tool does not know: " + unknown.join(", "));
  const map = {};
  let n = 0;

  for (const tier of TIERS) {
    const arr = bank[tier];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) die(rel(src) + " tier " + tier + " is not an array");
    const key = pack + "/" + tier;
    const seq = SEQ[key];

    /* A sequence is one letter per row in array order. Out by one and every
       decision after the gap belongs to the wrong question, so this is fatal. */
    if (seq !== undefined && seq.length !== arr.length)
      die(key + ": the slice carries " + seq.length + " decisions for " + arr.length +
        " rows. Nothing written, because a length that is out by one silently " +
        "moves every decision after the gap onto the wrong question.");
    if (seq === undefined && RULED.indexOf(pack) === -1 && arr.length)
      die(key + ": no slice and " + pack + " is not a rules-only pack, so " +
        arr.length + " row(s) would go undecided. Nothing written.");
    if (arr.length && ANCHOR[key]) {
      if (arr[0].q !== ANCHOR[key][0])
        die(key + ": the first row is no longer the one the slice was cut from.\n  expected " +
          JSON.stringify(ANCHOR[key][0]) + "\n  found    " + JSON.stringify(arr[0].q));
      if (arr[arr.length - 1].q !== ANCHOR[key][1])
        die(key + ": the last row is no longer the one the slice was cut from.\n  expected " +
          JSON.stringify(ANCHOR[key][1]) + "\n  found    " + JSON.stringify(arr[arr.length - 1].q));
    }

    tierRows[tier] = (tierRows[tier] || 0) + arr.length;
    arr.forEach((r, i) => {
      if (!r || typeof r.q !== "string") die(rel(src) + " " + tier + "[" + i + "] has no question text");
      const R = byRule(r.q);
      let cat;
      if (seq !== undefined) {
        cat = LETTER[seq[i]];
        sequenced++;
        /* RULES police the slices: a row whose shape is unmistakable and whose
           slice says otherwise means a slice drifted, and drift is not a thing
           to write out. */
        if (R.hit && R.cat !== cat)
          die(key + "[" + i + "]: the slice says " + String(cat) + " but the shape says " +
            String(R.cat) + ".\n  " + r.q + "\nNothing written.");
      } else {
        if (!R.hit) die(key + "[" + i + "]: " + pack + " is decided by shape and this row " +
          "matches none of them, so nobody has judged it yet.\n  " + r.q + "\nNothing written.");
        cat = R.cat;
        ruled++;
      }
      if (cat !== null && CATS.indexOf(cat) === -1) die("a decision outside the eleven: " + cat);
      /* Two rows with the same text must not carry two decisions: the map is
         keyed by text and one would quietly overwrite the other. */
      if (r.q in map && map[r.q] !== cat)
        die(rel(src) + ": " + JSON.stringify(r.q.slice(0, 70)) + " is decided twice, " +
          String(map[r.q]) + " and " + String(cat) + ". Nothing written.");
      map[r.q] = cat;
      rows++; n++;
      if (cat) tagged++;
      grid[tier] = grid[tier] || {};
      grid[tier][cat || "(none)"] = (grid[tier][cat || "(none)"] || 0) + 1;
      if (SHOW && cat === SHOW) shown.push(pack + "/" + tier + "  " + r.q);
    });
  }

  const sorted = {};
  for (const q of Object.keys(map).sort()) sorted[q] = map[q];
  const dest = path.join(OUT, pack + ".cat-map.json");
  fs.writeFileSync(dest, JSON.stringify(sorted, null, 1) + "\n");
  const withCat = Object.values(sorted).filter(v => v !== null).length;
  console.log(rel(dest) + ": " + n + " rows, " + Object.keys(sorted).length + " distinct questions, " +
    withCat + " with a category, " + (Object.keys(sorted).length - withCat) + " deliberately null");
}

console.log("\n" + rows + " pack rows: " + sequenced + " decided row by row, " + ruled +
  " decided by shape. " + tagged + " carry a category, " + (rows - tagged) + " deliberately null");

console.log("\nrows per tier per category");
console.log("cat".padEnd(12) + TIERS.map(t => t.padStart(9)).join("") + "     total");
for (const c of CATS) {
  const tot = TIERS.reduce((n, t) => n + ((grid[t] || {})[c] || 0), 0);
  console.log(c.padEnd(12) + TIERS.map(t => String((grid[t] || {})[c] || 0).padStart(9)).join("") + String(tot).padStart(10));
}
console.log("(none)".padEnd(12) + TIERS.map(t => String((grid[t] || {})["(none)"] || 0).padStart(9)).join("") + String(rows - tagged).padStart(10));
console.log("tier rows".padEnd(12) + TIERS.map(t => String(tierRows[t] || 0).padStart(9)).join("") + String(rows).padStart(10));

console.log("\nthe packs alone, a tier clears a usable pool at 8 rows or more");
for (const c of CATS) {
  const ok = TIERS.filter(t => ((grid[t] || {})[c] || 0) >= 8);
  console.log("  " + c.padEnd(12) + (ok.length ? ok.join(" ") : "NOTHING CLEARS 8") +
    "   (" + TIERS.map(t => ((grid[t] || {})[c] || 0)).join("/") + ")");
}
if (SHOW) {
  console.log("\n" + shown.length + " row(s) decided " + SHOW + ":");
  for (const s of shown) console.log("  " + s.slice(0, 130));
}
console.log("\nnothing under assets/ was opened for writing. run apply-pack-cats.js to stamp these decisions.");
