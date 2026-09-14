#!/usr/bin/env node
/* CAN A CLUB SEASON BE A POOL? A second opinion, with the evidence.
 *
 *     node _tools/check-club-seasons.js
 *
 * SQUADS-PLAN.md §2.5 wants the Eredivisie's clubs from the era its questions
 * come from, 2007-08 to 2017-18, rather than the current squads
 * build-clubs.js harvests: PSV 2008, AZ 2009, Twente 2010, Ajax 2011,
 * Feyenoord 2017. The questions and the eleven would then come from the same
 * years, which is what The Dugout's career routing wants.
 *
 * THE SQUAD IS THERE AND THE ELEVEN IS NOT, and this file exists to show that
 * rather than assert it, because it is the reason that item is not built.
 *
 * §2.2 of the same plan is the rule everything since has been held to: THE
 * ELEVEN WHO STARTED THE TEAM'S LAST MATCH, read off a match report, because
 * an eleven picked by shirt number within position is a reasonable eleven and
 * is not anybody's. Every pool in the app now follows it.
 *
 * A club season article has no match report. It has an infobox, a squad list
 * in the same {{Fs player}} template the tournaments use, and results as
 * scorelines. No line-ups, and no appearance table either, so neither "the
 * eleven who started the last match" nor "the eleven who played the most" is
 * in the data. A pool built from it would ship guessed elevens into an app
 * that has spent its whole life taking them out.
 *
 * WHAT WOULD UNLOCK IT is line-ups for league matches, which Wikipedia keeps
 * for tournaments and not for league seasons. Until then, the club sides that
 * DO have a real eleven are already in the app: assets/finals/index.json is
 * forty of them, Ajax 1995 and Real Madrid 1960 included, because a final is
 * a match with a report.
 *
 * Run it again whenever somebody wants to reopen the question. It fetches five
 * pages and prints what it found.
 */
const https = require("https");

const UA = "BALL2-quiz-build/1.0 (https://github.com/Beebzoo/football-quiz-2; personal hobby project)";
const SEASONS = [
  { side: "PSV Eindhoven", page: "2007–08 PSV Eindhoven season", why: "champions, and the deck's earliest season" },
  { side: "AZ Alkmaar",    page: "2008–09 AZ Alkmaar season",    why: "champions, the one nobody saw coming" },
  { side: "FC Twente",     page: "2009–10 FC Twente season",     why: "champions, under Steve McClaren" },
  { side: "Ajax",          page: "2010–11 AFC Ajax season",      why: "the first of four in a row" },
  { side: "Feyenoord",     page: "2016–17 Feyenoord season",     why: "champions, and the deck's latest season" },
];

const get = url => new Promise((res, rej) => {
  https.get(url, { headers: { "User-Agent": UA } }, r => {
    if (r.statusCode !== 200) { r.resume(); return rej(new Error("HTTP " + r.statusCode)); }
    let d = ""; r.setEncoding("utf8");
    r.on("data", c => d += c); r.on("end", () => res(d));
  }).on("error", rej);
});
const wikitext = async title => {
  const j = JSON.parse(await get("https://en.wikipedia.org/w/api.php?action=parse&page=" +
    encodeURIComponent(title) + "&prop=wikitext&redirects=1&format=json&formatversion=2"));
  return (j && j.parse && j.parse.wikitext) || "";
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  console.log("Five Eredivisie seasons from the era the deck covers.\n");
  let squads = 0, elevens = 0;
  for (const s of SEASONS) {
    let w = "";
    try { w = await wikitext(s.page); } catch (e) { console.log("  " + s.page + ": " + e.message); continue; }
    /* THE SQUAD: the same template the tournament squad pages use. */
    const men = (w.match(/\{\{\s*[Ff]s player/g) || []).length;
    /* THE ELEVEN: a line-up row is a position, a bold shirt number and a
       linked name, which is what every tournament harvest in this repo reads.
       An appearance table would do instead, and is not there either. */
    const rows = (w.match(/^\|\s*(?:\{\{\s*abbr[^}]*\}\}|[A-Z]{2,3})\s*\|\|\s*'''\d+'''/gm) || []).length;
    const apps = /Appearances and goals|\|\s*apps\s*=/.test(w);
    if (men >= 11) squads++;
    if (rows >= 11 || apps) elevens++;
    console.log("  " + s.side.padEnd(15) + s.page.replace(/ season$/, "").padEnd(26) +
      String(Math.round(w.length / 1024)).padStart(3) + "KB" +
      "   squad " + (men >= 11 ? String(men).padStart(2) + " men" : "  none ") +
      "   line-up rows " + String(rows).padStart(3) +
      "   apps table " + (apps ? "yes" : "no"));
    console.log("                 " + s.why);
    await sleep(1200);
  }

  console.log("\n" + squads + " of " + SEASONS.length + " have a squad in the machine-readable template.");
  console.log(elevens + " of " + SEASONS.length + " have anything an eleven could be read from.\n");
  if (elevens === 0) {
    console.log("SO THE POOL IS NOT BUILT. Every pool in this app follows the rule in");
    console.log("SQUADS-PLAN.md §2.2: the eleven is the one that actually started a");
    console.log("match, read off the report. A league season article carries no");
    console.log("line-ups and no appearance table, so the only eleven available would");
    console.log("be a guess by shirt number within position, which is the thing §2.2");
    console.log("was written to stop.");
    console.log("");
    console.log("The club sides that DO have a real eleven are already in the app:");
    console.log("assets/finals/index.json is forty of them, because a final is a match");
    console.log("with a report. What would unlock the rest is league line-ups, which");
    console.log("Wikipedia does not keep.");
  } else {
    console.log("Something here carries an eleven. Worth another look at §2.5.");
  }
})().catch(e => { console.error(e); process.exit(1); });
