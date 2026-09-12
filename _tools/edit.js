/* Exact-match file surgery that refuses to guess.

   node _tools/edit.js <file> <spec.json>

   spec.json is an array of {find, repl, count?}. Every find must match EXACTLY
   `count` times (default 1) or nothing is written at all. That is the whole
   point: a sed that silently matches zero times, or matches nine places when
   you meant one, is how an 8,500 line single-file app gets quietly broken.

   LINE ENDINGS. This repo is mixed: .gitattributes is not set, so git hands
   out CRLF on checkout while anything written since is LF, and a multi-line
   find written with \n silently matches nothing in a file that has \r\n. That
   failure looks exactly like a typo in the search string, which is an
   expensive thing to debug twice. So matching is done on a normalised copy and
   the file is written back in whatever it already used. */
const fs = require("fs");
const [, , file, spec] = process.argv;
const edits = JSON.parse(fs.readFileSync(spec, "utf8"));
const raw = fs.readFileSync(file, "utf8");
const crlf = raw.includes("\r\n");
const norm = s => s.replace(/\r\n/g, "\n");
let src = norm(raw);
const problems = [];
edits.forEach((e, n) => {
  const want = e.count === undefined ? 1 : e.count;
  const find = norm(e.find);
  let hits = 0, at = 0;
  while ((at = src.indexOf(find, at)) !== -1) { hits++; at += find.length; }
  if (hits !== want) problems.push("  #" + n + " matched " + hits + ", expected " + want +
    "  <<" + find.slice(0, 90).replace(/\n/g, "\n") + ">>");
});
if (problems.length) {
  console.error("NOT WRITING. " + problems.length + " edit(s) did not match:");
  problems.forEach(p => console.error(p));
  process.exit(1);
}
edits.forEach(e => { src = src.split(norm(e.find)).join(norm(e.repl)); });
fs.writeFileSync(file, crlf ? src.replace(/\n/g, "\r\n") : src);
console.log("applied " + edits.length + " edit(s) to " + file + (crlf ? "  (CRLF preserved)" : ""));
