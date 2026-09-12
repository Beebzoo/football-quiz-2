/* Exact-match file surgery that refuses to guess.

   node _tools/edit.js <file> <spec.json>

   spec.json is an array of {find, repl, count?}. Every find must match EXACTLY
   `count` times (default 1) or nothing is written at all. That is the whole
   point: a sed that silently matches zero times, or matches nine places when
   you meant one, is how an 8,500 line single-file app gets quietly broken. */
const fs = require("fs");
const [, , file, spec] = process.argv;
const edits = JSON.parse(fs.readFileSync(spec, "utf8"));
let src = fs.readFileSync(file, "utf8");
const problems = [];
edits.forEach((e, n) => {
  const want = e.count === undefined ? 1 : e.count;
  let hits = 0, at = 0;
  while ((at = src.indexOf(e.find, at)) !== -1) { hits++; at += e.find.length; }
  if (hits !== want) problems.push("  #" + n + " matched " + hits + ", expected " + want +
    "  <<" + e.find.slice(0, 90).replace(/\n/g, "\n") + ">>");
});
if (problems.length) {
  console.error("NOT WRITING. " + problems.length + " edit(s) did not match:");
  problems.forEach(p => console.error(p));
  process.exit(1);
}
edits.forEach(e => { src = src.split(e.find).join(e.repl); });
fs.writeFileSync(file, src);
console.log("applied " + edits.length + " edit(s) to " + file);
