/* Dump every Classic question the app currently ships, per tier, so the
   question writers can see the house style and avoid repeating anything.
   Runs the BANK literal out of index.html in a vm, then folds the packs in.

   The pack list is read from PACKS in index.html rather than kept here, the
   way append-pack.js already does it. The hardcoded copy had gone stale and
   was missing assets/extra, so the writers' reference silently dropped a
   third of the bank and they drafted duplicates of questions that ship.

     node dump-bank.js out.txt  */
const fs = require("fs"), path = require("path"), vm = require("vm");
const REPO = path.resolve(__dirname, "..", "..");
const OUT = process.argv[2];
if (!OUT) { console.log("usage: node dump-bank.js out.txt"); process.exit(1); }

const src = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const start = src.indexOf("const BANK");
const open = src.indexOf("{", start);
// walk braces to find the end of the object literal
let depth = 0, end = -1, inStr = null;
for (let i = open; i < src.length; i++) {
  const c = src[i], p = src[i - 1];
  if (inStr) { if (c === inStr && p !== "\\") inStr = null; continue; }
  if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
  if (c === "{") depth++;
  else if (c === "}") { depth--; if (!depth) { end = i + 1; break; } }
}
const BANK = vm.runInNewContext("(" + src.slice(open, end) + ")");

const packs = vm.runInNewContext("(" + src.slice(src.indexOf("[", src.indexOf("const PACKS")),
  src.indexOf("]", src.indexOf("const PACKS")) + 1) + ")");
console.log("packs the app loads:", packs.join(", "));
for (const p of packs) {
  const extra = JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
  for (const [tier, rows] of Object.entries(extra)) {
    if (Array.isArray(BANK[tier]) && Array.isArray(rows)) BANK[tier].push(...rows);
  }
}

let out = "";
for (const tier of ["easy", "normal", "hard", "extreme", "ball"]) {
  out += `\n===== ${tier.toUpperCase()} (${BANK[tier].length} questions) =====\n`;
  for (const r of BANK[tier]) out += `Q: ${r.q}\nA: ${r.a}\n`;
  console.log(tier, BANK[tier].length);
}
fs.writeFileSync(OUT, out, "utf8");
console.log("total", Object.values(BANK).reduce((n, a) => n + a.length, 0), "->", OUT);
