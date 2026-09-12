# Eredivisie mode: writers' brief

BALL is a football quiz app played on one phone by three friends on a Friday
night: Martijn (Dutch, MVV Maastricht, Limburg), Bram (Go Ahead Eagles expert,
Dutch football anorak) and Alejandro (Spanish football, UD Las Palmas). A reader
reads the question out loud, the player answers, the reader judges. So every
question must have ONE answer a reader can judge in a second.

This deck is a new mode called **Eredivisie**. Everything in it is about the
Dutch top flight. Two lenses:

- **The core, about 60% of the deck: the Eredivisie from 2007-08 to 2017-18.**
  These three grew up on those seasons. Champions, title races, top scorers,
  cup finals, promotion and relegation play-offs, the play-offs for European
  tickets, managers, transfers in and out, breakthrough stars, foreign players
  who came and went, cult heroes, records set, grounds, kits, odd incidents.
- **The rest: the Eredivisie all-time**, 1956-57 onwards. Legends, the
  1960s-1990s, small clubs' moments, records, the founding of the league,
  merged and vanished clubs, the modern era after 2018 only sparingly.

It is NOT about the Dutch national team, Dutch clubs in Europe as a theme, or
Dutch players abroad (those get their own mode later). A Dutch club's European
night is fine if the question is really about the club and the league.

## Tiers (the player picks the tier before seeing the question)

| tier    | pts | who gets it                                                       |
|---------|-----|-------------------------------------------------------------------|
| easy    | 1   | anyone who has watched some Dutch football. Champions, big clubs, big names, grounds. |
| normal  | 2   | a regular Eredivisie watcher. Top scorers of a season, cup winners, well known transfers, well known managers. |
| hard    | 5   | a serious fan. Who finished second, who went down, who scored in a specific final, a foreign import's club. |
| extreme | 10  | an anorak. Play-off details, one-season wonders, exact numbers, obscure clubs and seasons. |
| ball    | 20  | the stories. Not "hard"; BALL means the answer makes the table laugh or gasp. The mascot, the protest, the 10-0, the goalkeeper who scored, the club that went bust mid-season, the nickname with a story. A BALL question can be easy to answer if the story is good. |

BALL is not a synonym for obscure. A question whose answer is a name nobody
reacts to belongs in extreme, not ball.

## House style (read the shipping examples in already-shipping-dutch.txt)

- Plain, spoken English. The reader reads it aloud, so no brackets, no
  slashes, no abbreviations a reader would stumble on. Write "2007-08", not
  "2007/2008 season".
- Question at most 150 characters. Answer at most 110 characters. Optional
  `sub` line (a fun fact shown only after the answer) at most 110 characters.
- One unambiguous answer. If two answers are defensible, put both in the answer
  ("Ajax and PSV") or rewrite until only one fits.
- No em dashes, no en dashes. Hyphens only. Avoid semicolons.
- Every question ends in a question mark or a full stop.
- Counts in words in the question ("three times", not "3 times"). Years and
  scores in digits.
- **Superlatives have a shelf life.** Nothing in the present tense about
  records, "most", "current", "still holds", "all-time". Anchor to a closed
  season: "By the end of 2017-18, which club had the most titles?" or ask about
  a finished event instead. Anything phrased as a live record will be thrown
  out.
- No question whose answer is a bare number unless the number is the whole
  point (a 10-0 scoreline is fine, "how many goals did X score in 2011-12" is
  usually not).
- Facts only. Nothing invented, nothing "probably". If you are not sure, leave
  it out. Every row carries a `src` URL you believe confirms it (Wikipedia
  season articles, club articles, UEFA, KNVB, Transfermarkt) and `conf` as
  "sure" or "likely". Everything gets fact-checked by a second agent before it
  ships, so honesty in `conf` saves everyone time.
- Do not repeat or reword anything in already-shipping-dutch.txt (the Dutch
  questions in the main Classic bank) or in already-shipping-ere.txt (the
  Eredivisie deck as it already ships). Both are in this folder.
- Do not repeat yourself: one question per fact.

## Naming the club is worth doing

The app now puts a club's crest under the question whenever the question
names a club that is not the answer. So "Which coach did Giovanni van
Bronckhorst succeed at Feyenoord in 2015?" shows the Feyenoord crest, and the
table gets a picture to look at while they think. Where a question reads
naturally either way, name the club:

- better: "Which striker did PSV sign from Heerenveen in 2013?"
- worse:  "Which striker moved from Heerenveen to Eindhoven in 2013?"

Never name the club whose name is the answer, obviously, and do not contort a
question to fit a crest in. The detection is automatic at build time, you do
not tag anything.

## Format

A JSON array, one object per question:

```json
{"tier":"hard","q":"Which club won the 2009-10 Eredivisie under Steve McClaren?","a":"FC Twente","sub":"Twente's first title, sealed at NAC on the final day.","src":"https://en.wikipedia.org/wiki/2009%E2%80%9310_Eredivisie","conf":"sure","topic":"champions"}
```

`sub` is optional. `topic` is a short free tag for your own grouping.
Write the file with the Write tool, UTF-8, to the path you were given.
