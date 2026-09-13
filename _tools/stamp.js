/* Stamp the build date into index.html. The last thing you run before pushing.
 *
 *     node _tools/stamp.js
 *
 * WHY THIS EXISTS. Nearly everything built lately happens during a match: the
 * runs, the hold, the scouting line, the bench, the clock. So a phone on last
 * week's build and a phone on today's look identical sitting on the menu, and
 * "where is the new version?" had no answer you could see. Now the menu carries
 * the date at the bottom, and a tap on it clears the caches and reloads.
 *
 * The date, not the commit hash: the hash of the commit you are about to make
 * does not exist yet, and a date is the thing somebody actually compares.
 */
const fs = require("fs");
const path = require("path");
const F = path.join(__dirname, "..", "index.html");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = n => String(n).padStart(2, "0");
const d = new Date();
const stamp = d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() +
              " · " + pad(d.getHours()) + ":" + pad(d.getMinutes());

let s = fs.readFileSync(F, "utf8");
const re = /const BUILD = "[^"]*";/;
if (!re.test(s)) {
  console.error("no BUILD constant in index.html, so there is nothing to stamp");
  process.exit(1);
}
const was = s.match(re)[0].slice('const BUILD = "'.length, -2);
fs.writeFileSync(F, s.replace(re, 'const BUILD = "' + stamp + '";'));
console.log("was:  " + was);
console.log("now:  " + stamp);
