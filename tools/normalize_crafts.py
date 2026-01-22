import json
from pathlib import Path

IN_FILE = Path("Craft Items Detail Complete_ALL.json")
OUT_FILE = Path("docs/data/craft_recipes.json")

raw = json.loads(IN_FILE.read_text(encoding="utf-8"))
if isinstance(raw, list) and len(raw) == 2 and isinstance(raw[1], dict):
    recipes_map = raw[1]
elif isinstance(raw, dict):
    recipes_map = raw
else:
    raise ValueError("Unexpected craft JSON shape")

def as_int(x):
    try:
        return int(x)
    except Exception:
        return None

recipes_by_output = {}
recipes_by_recipe_id = {}

for _, payload in recipes_map.items():
    if not isinstance(payload, dict) or not payload.get("status"):
        continue
    ci = payload.get("craftableItem") or {}
    recipe_id = as_int(ci.get("id"))
    output_item_id = as_int(ci.get("itemId"))
    if recipe_id is None or output_item_id is None:
        continue

    mats = []
    for m in (ci.get("craftMaterials") or []):
        mid = as_int(m.get("id"))
        try:
            amt = int(m.get("amount"))
        except Exception:
            continue
        if mid is None:
            continue
        mats.append({"itemId": mid, "amount": amt})

    rec = {
        "recipeId": recipe_id,
        "outputItemId": output_item_id,
        "name": ci.get("itemName"),
        "craft": ci.get("craft"),
        "category": ci.get("category"),
        "outputAmount": int(ci.get("outputAmount") or 1),
        "timeSeconds": int(ci.get("time") or 0),
        "chancePercent": float(ci.get("chance") or 100),
        "reward": ci.get("reward"),
        "materials": mats,
        "price": payload.get("price"),
    }
    recipes_by_recipe_id[str(recipe_id)] = rec
    key = str(output_item_id)
    if key not in recipes_by_output:
        recipes_by_output[key] = rec
    else:
        recipes_by_output[key].setdefault("alternatives", []).append(rec)

normalized = {
    "meta": {
        "source": "ROIdle Socket.IO getCraftItemComplete_ALL",
        "generatedFrom": IN_FILE.name,
    },
    "craftableOutputItemIds": sorted([int(k) for k in recipes_by_output.keys()]),
    "recipesByOutputItemId": recipes_by_output,
    "recipesByRecipeId": recipes_by_recipe_id,
}

OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
OUT_FILE.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
print("Wrote", OUT_FILE)
