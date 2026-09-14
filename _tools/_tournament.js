/* WHICH TOURNAMENT, AND WHERE WIKIPEDIA KEEPS IT.
 *
 * Four harvesters read the same pages: the squads, the real elevens, what
 * every man did, and the groups and bracket for the Cup. Until now each of
 * them built its own article titles out of a hardcoded "<year> FIFA World
 * Cup", which was fine while there was one tournament and quietly wrong the
 * moment there were nine.
 *
 * So the titles live here, once, and a tool asks for them by competition and
 * year. Everything that differs between competitions is a line in this file:
 *
 *   THE GROUP LETTERS. Eight groups at a World Cup, twelve from 2026. Four at
 *   a sixteen-team Euro, six from 2016 when it went to twenty-four.
 *
 *   THE KNOCKOUT PAGE. "knockout stage" at a World Cup and at the older
 *   Euros, "knockout phase" at the newer ones, and there is no rule to it:
 *   different editors named different articles. Both are tried and the one
 *   that exists wins.
 *
 *   THE POOL ID, which is what the app calls the deck: wc2006, euro2004.
 *
 * WHAT IS DELIBERATELY NOT HERE: how many sides a tournament has, what its
 * bracket looks like, or how many men are in a squad. Those are facts about
 * the data that comes back, and a harvest that counts them and reports what
 * it found is worth more than one that is told in advance and agrees.
 */
const COMPS = {
  wc: {
    label: "World Cup",
    title: year => year + " FIFA World Cup",
    /* twelve groups from 2026: forty-eight sides */
    groups: year => (+year >= 2026 ? "ABCDEFGHIJKL" : "ABCDEFGH").split(""),
    pool: year => "wc" + year,
  },
  euro: {
    label: "European Championship",
    title: year => "UEFA Euro " + year,
    /* six groups from 2016, when it went from sixteen sides to twenty-four */
    groups: year => (+year >= 2016 ? "ABCDEF" : "ABCD").split(""),
    pool: year => "euro" + year,
  },
};

/* "knockout stage" and "knockout phase" are the same page under two names,
   and which one an article uses is down to whoever created it. Both are
   offered; the harvesters fetch and keep whichever comes back with text. */
const KNOCKOUT = ["knockout stage", "knockout phase"];

function comp(id) {
  const c = COMPS[id];
  if (!c) {
    console.error("Unknown competition: " + id + ". Try one of: " + Object.keys(COMPS).join(", "));
    process.exit(1);
  }
  return c;
}

/* every page a tournament harvest reads, in the order it reads them */
function pages(id, year) {
  const c = comp(id), t = c.title(year);
  return c.groups(year).map(g => t + " Group " + g)
    .concat(KNOCKOUT.map(k => t + " " + k))
    .concat([t + " final"]);
}

/* the two arguments every harvester takes, read the same way in each */
function argsOf(argv) {
  const at = argv.indexOf("--comp");
  const id = (at > -1 && argv[at + 1]) ? argv[at + 1] : "wc";
  const yi = argv.indexOf("--year");
  const year = (yi > -1 && /^\d{4}$/.test(argv[yi + 1] || "")) ? argv[yi + 1] : "2006";
  return { comp: id, year: year, title: comp(id).title(year),
           groups: comp(id).groups(year), pool: comp(id).pool(year),
           label: comp(id).label, pages: pages(id, year) };
}

module.exports = { COMPS: COMPS, KNOCKOUT: KNOCKOUT, comp: comp, pages: pages, argsOf: argsOf };
