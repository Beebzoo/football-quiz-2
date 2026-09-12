/* The fun questions carry a sentence of setup, and ten of them ran past the
   150 char card limit the bank test enforces. Shorten the telling, never the
   fact: matched on a unique fragment so a reordered pack cannot mis-target. */
const fs = require("fs");
const FILE = "c:/dev/_Personal/Hobbies/Football Quiz/assets/extra/index.json";

const EDITS = [
  ["a man claiming to be George Weah",
   "In 1996 Graeme Souness signed a player for Southampton after a phone call from a man posing as George Weah, recommending his cousin. Who was he?",
   "Ali Dia, who lasted 53 minutes as a substitute against Leeds"],
  ["Barbados led Grenada",
   "At the 1994 Caribbean Cup a golden goal counted double. Barbados led Grenada 2-1 but needed to win by two. What did they do?", null],
  ["most stupid, appalling",
   "Which 1962 World Cup match did David Coleman call the most stupid, appalling and disgraceful exhibition of football in the game's history?", null],
  ["Lillelien listed Lord Nelson",
   "After Norway beat England in 1981, Bjørge Lillelien listed Nelson, Churchill and Lady Diana, then shouted a line at Britain's prime minister. What?", null],
  ["secret ballot for the captaincy",
   "In 1973 the Ajax squad held a secret ballot for the captaincy and Cruyff lost it, then left for Barcelona. Who had beaten him to the armband?", null],
  ["thrown at the Austrian keeper",
   "Ajax were thrown out of Europe in 1989 after a UEFA Cup tie against Austria Wien was abandoned. What had been thrown at the away keeper?", null],
  ["Kanu did not realise",
   "Kanu did not realise the ball had been put out for an injury and set up Arsenal's 1999 FA Cup winner against Sheffield United. What did Wenger do?", null],
  ["Lutz Pfannenstiel",
   "Goalkeeper Lutz Pfannenstiel was jailed in Singapore and once stopped breathing on a pitch in Bradford. What is he the only footballer to have done?", null],
  ["Long Eaton United",
   "Brian Clough bought a striker from Long Eaton United for 2,000 pounds and won two European Cups with him. What was the player's day job before that?", null],
  ["walked the ball into the net",
   "In 1973 Chile kicked off a World Cup play-off in an empty stadium, walked the ball into the net and the referee ended it. Where was the other team?", null],
];

const d = JSON.parse(fs.readFileSync(FILE, "utf8"));
let done = 0;
for (const [frag, q, a] of EDITS) {
  let hits = 0;
  for (const rows of Object.values(d)) for (const r of rows) {
    if (!r.q.includes(frag)) continue;
    hits++;
    r.q = q;
    if (a) r.a = a;
  }
  if (hits !== 1) { console.log(`!! "${frag}" matched ${hits} rows, expected 1`); process.exit(1); }
  done++;
}
const long = [];
for (const [t, rows] of Object.entries(d)) rows.forEach(r => { if (r.q.length > 150) long.push(t + ": " + r.q.slice(0, 60)); });
console.log(`rewrote ${done}, still over 150: ${long.length}`);
long.forEach(l => console.log("  " + l));
if (/[\u2014\u2013]/.test(JSON.stringify(d))) { console.log("!! em dash introduced"); process.exit(1); }
fs.writeFileSync(FILE, JSON.stringify(d, null, 1), "utf8");
console.log("saved");
