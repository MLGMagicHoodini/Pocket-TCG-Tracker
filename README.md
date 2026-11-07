# Pocket TCG Tracker

A static web app for tracking your Pokémon TCG Pocket collection: per-set card checklists, pack summaries with
"chance of a new card" odds, and mission progress with craft costs. Progress is stored in your browser
(`localStorage`) and can be exported/imported as a `.sav` file under Settings → Transfer.

Originally created by **Oa10712**. Card data is synced from
[flibustier/pokemon-tcg-pocket-database](https://github.com/flibustier/pokemon-tcg-pocket-database) (MIT).

## How it works
No framework, no backend. `index.html` + `{HASH}/` (source folder; `{HASH}` is replaced by the commit id at
build time for cache busting).

| Path | Purpose |
| --- | --- |
| `{HASH}/expansions.json` | List of sets (name, id, data file, number of non-secret cards) |
| `{HASH}/expansions/*.json` | Per set: `cards`, `packs` (pull rates per slot), `missions` |
| `{HASH}/global.json` | Generation missions (not wired into the UI yet) |
| `scripts/sync-data.mjs` | Pulls new sets/cards from the open dataset |
| `scripts/validate.mjs` | Checks the data (duplicate IDs, bad rarities, mission cards that don't exist) |
| `scripts/build.mjs` | Produces `dist/` for deployment |

## Develop
```
node scripts/validate.mjs
node scripts/build.mjs && npx serve dist     # open the printed URL
node scripts/sync-data.mjs --dry              # preview what a data sync would add
```

## Deploy (GitHub Pages)
Repo → Settings → Pages → Source: **GitHub Actions**. `.github/workflows/deploy.yml` validates, builds and
deploys on every push to `main`. Every Monday (or via "Run workflow") it first runs the data sync and commits
any new sets/cards.

## What is automatic and what isn't
- Automatic: new sets, new cards, rarities, types, set IDs.
- Hand-maintained: **missions** and **pack pull rates** (new sets start with empty rates; the app hides the odds
  columns until you add them to the set's `packs[].rarities`).
- Sync never overwrites existing entries, so manual edits are safe.
