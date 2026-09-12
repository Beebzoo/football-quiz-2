/* Pull portrait photos for the Manager Path deck from Wikimedia Commons.

     node _tools/build-faces.js            fetch anything missing
     node _tools/build-faces.js --force    refetch everything

   Wikidata's P18 property points at a Commons file, and Commons is free
   licensed by definition, so everything here can ship as long as it is
   attributed. That is what assets/faces/ATTRIBUTION.csv is for, same as the
   stadium and kit sets already do.

   Commons resizes server-side, so there is no image processing step: we ask
   for a 400px-wide thumbnail and save what comes back, about 18KB each.

   What ships is not what this downloads: _tools/build-facecrop.py then finds
   the face in each photo and crops it to a square head-and-shoulders, because
   a circle drawn on a full-body touchline shot cuts the man's head off. Run
   that after this, and ALWAYS after a --force here, which throws the crops
   away and puts the original framing back.

   SAFE TO RE-RUN. Files already on disk are left alone unless --force. */
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "assets", "faces");
const WIKI = "https://en.wikipedia.org/w/api.php";
const UA = "BallQuizBot/1.0 (personal football quiz; https://github.com/Beebzoo/football-quiz)";
const FORCE = process.argv.includes("--force");
const THUMB = 400;

const slug = n => n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (res.ok) return await res.json();
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      throw new Error("HTTP " + res.status);
    } catch (e) { if (i === tries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}

/* ---------- 1. names -> Commons filenames, via Wikidata ---------- */
async function findImages(names) {
  const found = {};                       // name -> [filename, ...]
  for (const batch of chunk(names, 60)) {
    const values = batch.map(n => JSON.stringify(n) + "@en").join(" ");
    const q = `SELECT ?name ?img WHERE { VALUES ?name { ${values} } ?p rdfs:label ?name ; wdt:P18 ?img . }`;
    const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(q);
    const j = await getJSON(url);
    for (const b of j.results.bindings) {
      const file = decodeURIComponent(b.img.value.split("/").pop()).replace(/_/g, " ");
      (found[b.name.value] = found[b.name.value] || []).push(file);
    }
    process.stdout.write(".");
    await sleep(400);                     // be polite to the query service
  }
  return found;
}

/* ---------- 1b. whoever Wikidata has no P18 for ----------
   Thirty of the best-known players in the deck have no photo statement on
   Wikidata at all: Messi, Ramos, Xavi, Cantona, Puyol, Alves. Their articles
   all carry one anyway, so the article's own lead image is the fallback.

   It is checked before use. English Wikipedia can host non-free images
   locally, and a fair-use press photo is exactly what must not end up in a
   game on the open web, so anything not living on Commons is refused. */
async function leadImages(names) {
  const found = {};
  for (const batch of chunk(names, 20)) {
    const j = await getJSON(WIKI + "?action=query&format=json&formatversion=2&prop=pageimages"
      + "&piprop=name&pilimit=max&redirects=1&titles=" + encodeURIComponent(batch.join("|")));
    const back = {};
    for (const r of (j.query && j.query.redirects) || []) back[r.to] = r.from;
    for (const r of (j.query && j.query.normalized) || []) back[r.to] = back[r.to] || r.from;
    for (const p of (j.query && j.query.pages) || []) {
      if (!p.pageimage) continue;
      const asked = back[p.title] || p.title;
      if (batch.includes(asked)) found[asked] = p.pageimage.replace(/_/g, " ");
    }
    process.stdout.write(".");
    await sleep(200);
  }
  return found;
}

async function onCommons(files) {
  const ok = new Set();
  for (const batch of chunk(files, 40)) {
    const j = await getJSON("https://commons.wikimedia.org/w/api.php?action=query&format=json"
      + "&formatversion=2&prop=imageinfo&iiprop=url&titles="
      + encodeURIComponent(batch.map(f => "File:" + f).join("|")));
    for (const p of (j.query && j.query.pages) || [])
      if (!p.missing && p.imageinfo) ok.add(p.title.replace(/^File:/, ""));
    await sleep(200);
  }
  return ok;
}

/* ---------- 2. filenames -> licence, author, sized thumbnail ---------- */
async function getMeta(files) {
  const meta = {};
  for (const batch of chunk(files, 50)) {
    const url = "https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo"
      + "&iiprop=extmetadata|url|size&iiurlwidth=" + THUMB + "&format=json&formatversion=2&titles="
      + encodeURIComponent(batch.map(f => "File:" + f).join("|"));
    const j = await getJSON(url);
    for (const p of (j.query && j.query.pages) || []) {
      const i = p.imageinfo && p.imageinfo[0];
      if (!i || !i.thumburl) continue;
      const e = i.extmetadata || {};
      const txt = v => String((v && v.value) || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      meta[p.title.replace(/^File:/, "")] = {
        thumb: i.thumburl.split("?")[0],
        w: i.thumbwidth, h: i.thumbheight,
        license: txt(e.LicenseShortName) || "see source",
        author: txt(e.Artist).slice(0, 120) || "unknown",
        source: i.descriptionurl,
      };
    }
    process.stdout.write(".");
    await sleep(300);
  }
  return meta;
}

/* A face wants a portrait, not a pitch-wide action shot. Prefer the tallest
   aspect ratio, and nudge anything already cropped to the front: on Commons a
   "(cropped)" file is nearly always someone having tightened it onto the head. */
function pick(files, meta) {
  const scored = files.filter(f => meta[f]).map(f => {
    const m = meta[f];
    return { f, score: (m.h / m.w) + (/cropped/i.test(f) ? 0.35 : 0) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.length ? scored[0].f : null;
}

/* upload.wikimedia.org throttles a burst hard: eight at a time died after the
   first 43. Back off and retry rather than losing the file. */
async function download(url, dest, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) { fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer())); return; }
      if (res.status !== 429 && res.status < 500) throw new Error("HTTP " + res.status);
    } catch (e) { if (i === tries - 1) throw e; }
    await sleep(1200 * (i + 1));
  }
  throw new Error("gave up");
}

/* The player deck lives inside index.html rather than in its own file, so it
   is read out of the source: find `const CAREERS = [` and take lines until the
   brackets balance again. Cheaper and safer than a regex across 500 entries. */
function careerNames() {
  const lines = fs.readFileSync(path.join(REPO, "index.html"), "utf8").split("\n");
  const start = lines.findIndex(l => l.startsWith("const CAREERS"));
  if (start < 0) return [];
  let depth = 0, out = [];
  for (let i = start; i < lines.length; i++) {
    out.push(lines[i]);
    for (const ch of lines[i]) { if (ch === "[") depth++; if (ch === "]") depth--; }
    if (depth === 0 && out.length > 1) break;
  }
  const src = out.join("\n").replace(/^const CAREERS\s*=\s*/, "").replace(/;\s*$/, "");
  return eval(src).map(c => c.n);
}

(async () => {
  /* Both decks share one folder and one index, keyed by name. A man who
     played and then managed is one photo, not two, and faceHTML(name) does
     not need to know which deck it came from. */
  const managers = JSON.parse(fs.readFileSync(path.join(REPO, "assets/managers/index.json"), "utf8")).map(m => m.n);
  const players = careerNames();
  const names = [...new Set([...managers, ...players])];
  console.log(`${managers.length} managers + ${players.length} players = ${names.length} unique faces wanted\n`);
  fs.mkdirSync(OUT, { recursive: true });

  process.stdout.write("asking wikidata ");
  const found = await findImages(names);
  let misses = names.filter(n => !found[n]);
  console.log(`\n  ${names.length - misses.length} matched, ${misses.length} with no photo statement`);

  if (misses.length) {
    process.stdout.write("wikipedia leads ");
    const lead = await leadImages(misses);
    const free = await onCommons([...new Set(Object.values(lead))]);
    let rescued = 0;
    for (const [n, file] of Object.entries(lead)) {
      if (!free.has(file)) continue;              // lives on en.wiki, so possibly non-free
      found[n] = [file];
      rescued++;
    }
    misses = names.filter(n => !found[n]);
    console.log(`\n  ${rescued} rescued from article lead images, ${misses.length} still with nothing`);
  }

  process.stdout.write("reading commons  ");
  const allFiles = [...new Set(Object.values(found).flat())];
  const meta = await getMeta(allFiles);
  console.log(`\n  metadata for ${Object.keys(meta).length} of ${allFiles.length} files`);

  const chosen = {};
  for (const n of Object.keys(found)) {
    const f = pick(found[n], meta);
    if (f) chosen[n] = f;
  }
  console.log(`  picked one portrait each for ${Object.keys(chosen).length} of them\n`);

  // download, 8 at a time
  const jobs = Object.entries(chosen).map(([n, f]) => ({ n, f, file: slug(n) + ".jpg" }));
  const todo = FORCE ? jobs : jobs.filter(j => !fs.existsSync(path.join(OUT, j.file)));
  console.log(`downloading ${todo.length} (${jobs.length - todo.length} already on disk)`);
  let done = 0, failed = [];
  for (const group of chunk(todo, 4)) {
    await Promise.all(group.map(async j => {
      try { await download(meta[j.f].thumb, path.join(OUT, j.file)); done++; }
      catch (e) { failed.push(j.n); }
    }));
    process.stdout.write(`\r  ${done}/${todo.length}`);
  }
  console.log("");

  /* index + attribution, in the same shape the stadium set uses */
  const index = {}, rows = ["file;manager;license;author;source"];
  for (const j of jobs.sort((a, b) => a.n.localeCompare(b.n))) {
    if (!fs.existsSync(path.join(OUT, j.file))) continue;
    index[j.n] = j.file;
    const m = meta[j.f];
    const clean = s => String(s).replace(/[;\r\n]/g, ",");
    rows.push([j.file, clean(j.n), clean(m.license), clean(m.author), m.source].join(";"));
  }
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index, null, 1));
  fs.writeFileSync(path.join(OUT, "ATTRIBUTION.csv"), rows.join("\n") + "\n");

  const bytes = Object.values(index).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`\n${Object.keys(index).length} portraits, ${(bytes / 1024 / 1024).toFixed(1)} MB, avg ${Math.round(bytes / Object.keys(index).length / 1024)} KB`);
  if (failed.length) console.log(`download failed: ${failed.join(", ")}`);
  if (misses.length) {
    console.log(`\nno free image on Commons (${misses.length}):`);
    misses.forEach(n => console.log("   " + n));
  }
})();
