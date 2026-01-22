# ROIdle Crafting Shopping List (GitHub Pages)

Static site: pick craftable items and generate a combined materials list.

## Deploy on GitHub Pages
1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Source: **Deploy from a branch**.
4. Branch: `main` and folder: `/docs`.
5. Open the URL GitHub gives you.

## Data files
- `docs/data/craft_recipes.json` (included) — normalized from ROIdle Socket.IO craft dump.
- Optional: `docs/data/itemsCatalog.json` — add item names for material IDs.

### itemsCatalog.json format (optional)
Either:
- an array of `{ "id": 15000, "name": "Copper Ore", ... }`
or
- `{ "data": [ ...same items... ] }`

## Update crafting data
If you extract a newer `Craft Items Detail Complete_ALL.json`, drop it in the repo root and run:

```bash
python tools/normalize_crafts.py
```

Then commit the updated `docs/data/craft_recipes.json`.
