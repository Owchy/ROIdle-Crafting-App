// ROIdle Crafting Shopping List (GitHub Pages friendly)
// Loads craft_recipes.json; optionally loads itemsCatalog.json (id -> name) if you add it.

const state = {
  recipes: null,
  itemsById: null, // optional
  cart: new Map(), // outputItemId -> qty
};

const els = {
  search: document.getElementById('search'),
  results: document.getElementById('results'),
  cart: document.getElementById('cart'),
  materials: document.getElementById('materials'),
  btnCopy: document.getElementById('btnCopy'),
  btnExport: document.getElementById('btnExport'),
  btnClear: document.getElementById('btnClear'),
  toggleRecursive: document.getElementById('toggleRecursive'),
  toggleChance: document.getElementById('toggleChance'),
};

function fmt(n){ return new Intl.NumberFormat().format(n); }

function itemName(itemId){
  const fromCatalog = state.itemsById?.[String(itemId)]?.name;
  return fromCatalog || `Item #${itemId}`;
}
function recipeName(rec){
  return rec?.name || itemName(rec?.outputItemId);
}
function craftKey(rec){
  const c = (rec?.craft || '').toString().trim();
  const cat = (rec?.category || '').toString().trim();
  return [c, cat].filter(Boolean).join(' / ') || 'craft';
}

// --- Data loading ---
async function loadJson(path){
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return await res.json();
}

async function init(){
  state.recipes = await loadJson('./data/craft_recipes.json');

  // Optional: itemsCatalog.json (array of {id,name,...} OR {data:[...]})
  try{
    const items = await loadJson('./data/itemsCatalog.json');
    const arr = Array.isArray(items) ? items : (Array.isArray(items?.data) ? items.data : null);
    if (arr){
      state.itemsById = Object.fromEntries(arr.filter(x=>x?.id!=null).map(x => [String(x.id), x]));
    }
  } catch(e){
    // ignore if missing
  }

  wireUI();
  render();
}

function wireUI(){
  els.search.addEventListener('input', renderResults);
  els.btnClear.addEventListener('click', () => { state.cart.clear(); render(); });

  els.btnCopy.addEventListener('click', async () => {
    const text = computeMaterialsText();
    await navigator.clipboard.writeText(text);
    els.btnCopy.textContent = 'Copied!';
    setTimeout(()=>els.btnCopy.textContent='Copy materials', 900);
  });

  els.btnExport.addEventListener('click', () => {
    const exportObj = {
      cart: Object.fromEntries([...state.cart.entries()].map(([id,qty]) => [id, qty])),
      settings: {
        recursive: els.toggleRecursive.checked,
        accountForChance: els.toggleChance.checked,
      },
      materials: computeMaterials(),
      generatedAt: new Date().toISOString(),
    };
    downloadJson(exportObj, 'roidle_shopping_list.json');
  });

  els.toggleRecursive.addEventListener('change', render);
  els.toggleChance.addEventListener('change', render);

  renderResults();
}

function downloadJson(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Search ---
function allRecipes(){
  return Object.values(state.recipes.recipesByOutputItemId || {});
}

function renderResults(){
  const q = els.search.value.trim().toLowerCase();
  const list = allRecipes()
    .filter(r => (r?.name || '').toLowerCase().includes(q))
    .slice(0, 60);

  els.results.innerHTML = '';
  if (!list.length){
    const div = document.createElement('div');
    div.className = 'muted';
    div.textContent = q ? 'No matches.' : 'Type to search craftable items.';
    els.results.appendChild(div);
    return;
  }

  for (const rec of list){
    const row = document.createElement('div');
    row.className = 'result';

    const meta = document.createElement('div');
    meta.className = 'meta';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = recipeName(rec);

    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.innerHTML = `<code>${craftKey(rec)}</code> <span>Output: ${fmt(rec.outputAmount || 1)}</span>`;

    meta.appendChild(name);
    meta.appendChild(pill);

    const btn = document.createElement('button');
    btn.className = 'smallbtn';
    btn.textContent = 'Add';
    btn.addEventListener('click', () => {
      const id = String(rec.outputItemId);
      state.cart.set(id, (state.cart.get(id) || 0) + 1);
      render();
    });

    row.appendChild(meta);
    row.appendChild(btn);
    els.results.appendChild(row);
  }
}

// --- Cart + computation ---
function renderCart(){
  if (state.cart.size === 0){
    els.cart.className = 'cart empty muted';
    els.cart.textContent = 'No items yet. Search on the left and add some.';
    return;
  }

  els.cart.className = 'cart';
  els.cart.innerHTML = '';

  for (const [outputId, qty] of state.cart.entries()){
    const rec = state.recipes.recipesByOutputItemId?.[String(outputId)];
    const row = document.createElement('div');
    row.className = 'cartItem';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.flexDirection = 'column';
    left.style.gap = '2px';

    const title = document.createElement('div');
    title.style.fontWeight = '600';
    title.textContent = rec ? recipeName(rec) : itemName(outputId);

    const sub = document.createElement('div');
    sub.className = 'muted';
    sub.textContent = rec ? craftKey(rec) : '—';

    left.appendChild(title);
    left.appendChild(sub);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '8px';
    right.style.alignItems = 'center';

    const input = document.createElement('input');
    input.className = 'qty';
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.value = String(qty);
    input.addEventListener('change', () => {
      const v = Math.max(1, parseInt(input.value || '1', 10));
      state.cart.set(String(outputId), v);
      render();
    });

    const del = document.createElement('button');
    del.className = 'smallbtn';
    del.textContent = 'Remove';
    del.addEventListener('click', () => {
      state.cart.delete(String(outputId));
      render();
    });

    right.appendChild(input);
    right.appendChild(del);

    row.appendChild(left);
    row.appendChild(right);

    els.cart.appendChild(row);
  }
}

function craftsNeeded(desiredQty, outputAmount, chancePercent, accountForChance){
  const out = Math.max(1, outputAmount || 1);
  if (!accountForChance) return Math.ceil(desiredQty / out);
  const chance = Math.max(0.0001, (chancePercent || 100) / 100);
  return Math.ceil(desiredQty / (out * chance));
}

function computeMaterials(){
  const totals = new Map(); // itemId -> amount
  const recursive = els.toggleRecursive.checked;
  const accountForChance = els.toggleChance.checked;

  const visiting = new Set();

  function addMaterial(itemId, amt){
    const k = String(itemId);
    totals.set(k, (totals.get(k) || 0) + amt);
  }

  function expand(outputItemId, desiredQty){
    const rec = state.recipes.recipesByOutputItemId?.[String(outputItemId)];
    if (!rec){
      addMaterial(outputItemId, desiredQty);
      return;
    }

    const crafts = craftsNeeded(desiredQty, rec.outputAmount, rec.chancePercent, accountForChance);

    for (const m of (rec.materials || [])){
      const need = (m.amount || 0) * crafts;

      if (!recursive){
        addMaterial(m.itemId, need);
        continue;
      }

      const key = String(m.itemId);
      if (visiting.has(key)){
        addMaterial(m.itemId, need);
        continue;
      }

      if (state.recipes.recipesByOutputItemId?.[key]){
        visiting.add(key);
        expand(m.itemId, need);
        visiting.delete(key);
      } else {
        addMaterial(m.itemId, need);
      }
    }
  }

  for (const [outputId, qty] of state.cart.entries()){
    expand(outputId, qty);
  }

  return [...totals.entries()]
    .map(([itemId, amount]) => ({ itemId: parseInt(itemId, 10), name: itemName(itemId), amount }))
    .sort((a,b) => b.amount - a.amount || (a.name||'').localeCompare(b.name||''));
}

function computeMaterialsText(){
  const mats = computeMaterials();
  if (!mats.length) return 'No materials (empty list).';
  return mats.map(m => `${m.name} ×${fmt(m.amount)} (id:${m.itemId})`).join('\n');
}

function renderMaterials(){
  if (state.cart.size === 0){
    els.materials.className = 'materials muted';
    els.materials.textContent = 'Add items to see totals.';
    els.btnCopy.disabled = true;
    els.btnExport.disabled = true;
    return;
  }
  els.materials.className = 'materials';
  els.materials.textContent = computeMaterialsText();
  els.btnCopy.disabled = false;
  els.btnExport.disabled = false;
}

function render(){
  renderResults();
  renderCart();
  renderMaterials();
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<div style="padding:16px;color:#fff;font-family:system-ui">
    <h2>Failed to load data</h2>
    <pre style="white-space:pre-wrap">${String(err)}</pre>
    <p>Make sure <code>docs/data/craft_recipes.json</code> exists and GitHub Pages is serving the <code>/docs</code> folder.</p>
  </div>`;
});
