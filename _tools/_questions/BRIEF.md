# League decks: writers' brief

One brief for the five new league decks. The Eredivisie has its own, older one
in `eredivisie/BRIEF.md`; this is that brief generalised, with what the
Eredivisie build actually taught folded back in.

BALL is a football quiz played on one phone by friends on a Friday night.
In **normal mode** a reader reads the question out loud, a player answers, and
the reader judges. In the **football game** the same question decides whether a
pass is completed. Either way: every question must have ONE answer a reader can
judge in a second.

## The five decks

| folder | league | the core |
|---|---|---|
| `premier/` | Premier League | 1992 onwards, weighted to 2005-2020 |
| `laliga/` | La Liga | the modern era, and not only the two of them |
| `bundesliga/` | Bundesliga | 1963 onwards, weighted to the Ruhr and the ones who broke Bayern's run |
| `seriea/` | Serie A | the 1990s peak, Calciopoli, and out the other side |
| `belgian/` | Pro League | Anderlecht, Club Brugge, Genk, and the small clubs' moments |

Roughly **60% of each deck is the league itself**: champions, title races, top
scorers, cup finals, promotion and relegation, managers, transfers in and out,
breakthroughs, imports, cult heroes, records, grounds, kits, odd incidents.
The remaining 40% is that league **all-time**: the founding, the decades before
the money, vanished and merged clubs, small clubs' moments.

It is NOT about the national team, and not about that country's players abroad.
A club's European night is fine if the question is really about the club.

## Tiers

The player picks the tier before seeing the question in normal mode. On the
pitch the tier is decided by how far the pass travels, which makes a tier a
**promise about failure rate**: a raking diagonal has to fail more often than a
short square ball or the geometry is lying. Write to that.

| tier | pts | who gets it |
|---|---|---|
| easy | 1 | anyone who watches football. Champions, big clubs, big names, grounds. |
| normal | 2 | a regular watcher. A season's top scorer, cup winners, well known transfers and managers. |
| hard | 5 | a serious fan. Who finished second, who went down, who scored in a given final, where an import came from. |
| extreme | 10 | an anorak. Play-off details, one-season wonders, exact numbers, obscure clubs and seasons. |
| ball | 20 | the stories. The answer makes the table laugh or gasp. |

**BALL is not a synonym for obscure.** A question whose answer is a name nobody
reacts to belongs in extreme. The mascot, the protest, the 10-0, the keeper who
scored, the club that went bust mid-season: those are BALL.

**Easy matters more than it looks.** On the pitch, short balls are Easy and they
come up constantly, so a thin Easy tier runs dry inside one match. Do not treat
it as the tier to get out of the way.

## House style

- Plain, spoken English. It is read aloud, so no brackets, no slashes, no
  abbreviations a reader would stumble on. Write "2007-08", not "2007/2008".
- Question at most **150** characters. Answer at most **110**. Optional `sub`,
  a fun fact shown only after the answer, at most **110**.
- One unambiguous answer. If two are defensible, put both in the answer
  ("Ajax and PSV") or rewrite until only one fits.
- **No em dashes, no en dashes.** Hyphens only. Avoid semicolons.
- Every question ends in a question mark or a full stop.
- Counts in words in the question ("three times", not "3 times"). Years and
  scores in digits.
- **Superlatives have a shelf life.** Nothing in the present tense about
  records, "most", "current", "still holds", "all-time". Anchor to a closed
  season: "By the end of 2017-18, which club had the most titles?". Anything
  phrased as a live record is thrown out by the build, automatically.
- No question whose answer is a bare number unless the number is the point.
  A 10-0 scoreline is fine; "how many goals did X score in 2011-12" usually is not.
- **Facts only. Nothing invented, nothing "probably".** If you are not sure,
  leave it out. Every row carries a `src` URL you believe confirms it and
  `conf` as "sure" or "likely". Honesty in `conf` saves everyone time.
- Do not repeat the Classic bank. The build checks this automatically against
  all 6,984 of its rows and against this deck itself, by near-duplicate rather
  than exact match, so a reworded repeat is caught too.
- One question per fact.

## Naming the club is worth doing

The app puts a club's crest under the question whenever the question names a
club that is not the answer, so the table has something to look at while they
think. Where a question reads naturally either way, name the club:

- better: "Which striker did Liverpool sign from Newcastle in 2025?"
- worse: "Which striker moved from Tyneside to Merseyside in 2025?"

Never name the club whose name is the answer. Do not contort a question to fit
a crest in. Detection is automatic at build time; you tag nothing.

## `cat`: the category

New for these decks, and the one thing the Eredivisie deck cannot do without a
retrofit. Every row carries a `cat` from this closed list:

`champions` `scorers` `transfers` `managers` `grounds` `records` `europe`
`cups` `relegation` `imports` `stories`

It is there for **specialisms**: the plan is that each of the eleven on the
pitch owns a category, so passing to the six draws one kind of question and the
ten draws another. Use the closed list, not free text. The Eredivisie source
files used free text and produced 257 distinct tags, which is why that deck
needs collapsing before it can do the same.

## Format

A JSON array, one object per question, written to `<league>/raw-<topic>.json`:

```json
{"tier":"hard","cat":"champions","q":"Which club won the 2015-16 Premier League under Claudio Ranieri?","a":"Leicester City","sub":"They were 5000-1 in the summer.","src":"https://en.wikipedia.org/wiki/2015%E2%80%9316_Premier_League","conf":"sure"}
```

`sub` is optional. Fact-checked files are `checked-<topic>.json` with a
`verdict` of `ok`, `fixed` or `drop` on every row.

## Building

```sh
node _tools/_questions/build-league.js premier --verbose     # dry run, see the rejects
node _tools/_questions/build-league.js premier --write       # ship it
node _tools/sw-clubs.js                                      # precache any new crest
```

**First build only.** Once a pack has shipped, use `--append`: `S.used` holds
indexes into each tier, so a rebuild that reorders a tier points every parked
match at the wrong questions.
