# Eredivisie deck: how it was made

The mode `ere` plays the Classic engine on its own five-tier bank at
`assets/eredivisie/index.json`. Everything in that bank came through this
folder, so the paper trail for any question is here.

1. `BRIEF.md` is what the writers were given: tiers, house style, the
   2007-08 to 2017-18 focus, and the "a superlative has a shelf life" rule.
2. `already-shipping-dutch.txt` is every Dutch-flavoured question in the
   Classic bank at the time (1,571 rows), so the writers did not draft them
   again. Regenerate with `node ../dump-bank.js` and a grep if the Classic
   bank moves.
3. `raw-*.json` are the drafts, one file per writer slice, each row with a
   `src` URL and the writer's own `conf`.
4. `checked-*.json` are the same rows after a second agent opened every
   source: `verdict` ok / fixed / drop and a `note`. Rows are never removed
   from a checked file, a drop stays in it, so the two files line up.
5. `build-ere.js` folds the checked files into the pack: keeps ok and fixed,
   enforces the card limits (150 / 110 / 110), throws out anything still
   phrased as a live record, and drops near-duplicates of the Classic bank
   or of itself. `--raw` previews the drafts, `--verbose` lists rejects,
   `--write` ships.

**After the first ship, append, never rebuild.** `S.used` holds indexes into
each tier, so reordering a tier points every parked match at the wrong
questions. `build-ere.js --append` adds new checked files onto the shipping
pack without touching the existing rows.

The old league mark (2007 to 2018) in `assets/eredivisie/logo.png` is a
rendering of `eredivisie-2007-logo-source.svg`, which is the copy the French
Wikipedia holds as a non-free logo. It is the league's own artwork, used here
the way the club crests are: not freely licensed, present because a quiz about
the league wants its badge.
