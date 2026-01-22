// ROIdle Crafting Shopping List (GitHub Pages friendly)
// Loads craft_recipes.json and itemsCatalog.json (id -> name).
// Icons are loaded from the official ROIdle static paths:
//   items: /assets/images/items/<itemId>.png
//   mobs:  /assets/images/mobs/<monsterId>.png

const state = {
  recipes: null,
  itemsById: null,
  monsters: null,
  dropsByItemId: null,
  cart: new Map(), // outputItemId -> qty
};

const els = {
  search: document.getElementById('search'),
  results: document.getElementById('results'),
  cart: document.getElementById('cart'),
  materials: document.getElementById('materials'),
  craftSummary: document.getElementById('craftSummary'),
  huntList: document.getElementById('huntList'),
  btnCopy: document.getElementById('btnCopy'),
  btnShare: document.getElementById('btnShare'),
  btnTheme: document.getElementById('btnTheme'),
  btnExport: document.getElementById('btnExport'),
  btnClear: document.getElementById('btnClear'),
  toggleRecursive: document.getElementById('toggleRecursive'),
  toggleChance: document.getElementById('toggleChance'),
  filterCraft: document.getElementById('filterCraft'),
  filterCategory: document.getElementById('filterCategory'),
};

function fmt(n){ return new Intl.NumberFormat().format(n); }

// ---- Share link helpers (base64url) ----
function b64urlEncode(str){
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(b64url){
  const b64 = b64url.replace(/-/g,'+').replace(/_/g,'/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const str = atob(b64 + pad);
  return decodeURIComponent(escape(str));
}

// ---- Icon paths ----
// Put your downloaded icons here (recommended):
//   docs/assets/items/<id>.png
//   docs/assets/mobs/<id>.png   (future use)
// If a local icon is missing, we fall back to ROIdle-hosted paths.
function localItemIcon(itemId){ return `./assets/items/${itemId}.png`; }
function remoteItemIcon(itemId){
  // Fallback candidates (try multiple in case ROIdle uses a different mount path)
  return [
    `https://roidle.com/assets/images/items/${itemId}.png`,
    `https://roidle.com/seasonal/assets/images/items/${itemId}.png`,
    `https://roidle.com/assets/items/${itemId}.png`,
    `https://roidle.com/seasonal/assets/items/${itemId}.png`,
  ];
}

function setItemIcon(imgEl, itemId){
  const fallbacks = remoteItemIcon(itemId);
  let i = -1;
  imgEl.src = localItemIcon(itemId);
  imgEl.onerror = () => {
    i += 1;
    if (i < fallbacks.length){
      imgEl.src = fallbacks[i];
    } else {
      imgEl.style.visibility = 'hidden';
    }
  };
}

function localMobIcon(monsterId){ return `./assets/mobs/${monsterId}.png`; }
function remoteMobIcon(monsterId){
  return [
    `https://roidle.com/assets/images/mobs/${monsterId}.png`,
    `https://roidle.com/seasonal/assets/images/mobs/${monsterId}.png`,
    `https://roidle.com/assets/images/monsters/${monsterId}.png`,
    `https://roidle.com/seasonal/assets/images/monsters/${monsterId}.png`,
  ];
}
function setMobIcon(imgEl, monsterId){
  const fallbacks = remoteMobIcon(monsterId);
  let i = -1;
  imgEl.src = localMobIcon(monsterId);
  imgEl.onerror = () => {
    i += 1;
    if (i < fallbacks.length){
      imgEl.src = fallbacks[i];
    } else {
      imgEl.style.visibility = 'hidden';
    }
  };
}


function itemName(itemId){
  const fromCatalog = state.itemsById?.[String(itemId)]?.name;
  return fromCatalog || `Item #${itemId}`;
}

function itemTooltip(itemId){
  const it = state.itemsById?.[String(itemId)];
  if (!it) return itemName(itemId);
  const bits = [];
  if (it.tier != null) bits.push(`Tier ${it.tier}`);
  if (it.type) bits.push(it.type);
  if (it.subType && it.subType !== it.type) bits.push(it.subType);
  const head = `${it.name}${bits.length ? ' • ' + bits.join(' • ') : ''}`;
  const desc = it.description ? `\n${it.description}` : '';
  return head + desc;
}
function recipeTooltip(rec){
  const base = recipeName(rec);
  const bits = [];
  if (rec?.craft) bits.push(rec.craft);
  if (rec?.category) bits.push(rec.category);
  if (rec?.timeSeconds != null) bits.push(`Time: ${fmtTime(rec.timeSeconds)}`);
  if (rec?.chancePercent != null) bits.push(`Chance: ${rec.chancePercent}%`);
  return base + (bits.length ? `\n${bits.join(' • ')}` : '') + (state.itemsById?.[String(rec.outputItemId)]?.description ? `\n${state.itemsById[String(rec.outputItemId)].description}` : '');
}
function fmtTime(totalSeconds){
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(s/3600);
  const m = Math.floor((s%3600)/60);
  const sec = s%60;
  if (h>0) return `${h}h ${m}m ${sec}s`;
  if (m>0) return `${m}m ${sec}s`;
  return `${sec}s`;
}


function applySavedTheme(){
  try{
    const t = localStorage.getItem('roidle_theme');
    if (t === 'amber') document.body.classList.add('amber');
  } catch(e){}
}
function toggleTheme(){
  const isAmber = document.body.classList.toggle('amber');
  try{
    localStorage.setItem('roidle_theme', isAmber ? 'amber' : 'green');
  } catch(e){}
}


function recipeName(rec){
  return rec?.name || itemName(rec?.outputItemId);
}
function craftKey(rec){
  const c = (rec?.craft || '').toString().trim();
  const cat = (rec?.category || '').toString().trim();
  return { craft: c || '—', category: cat || '—' };
}

// --- Data loading ---
async function loadJson(path){
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return await res.json();
}

function buildFilterOptions(){
  const recs = Object.values(state.recipes.recipesByOutputItemId || {});
  const crafts = new Set();
  for (const r of recs){
    const k = craftKey(r);
    if (k.craft && k.craft !== '—') crafts.add(k.craft);
  }
  const craftList = ['All', ...Array.from(crafts).sort((a,b)=>a.localeCompare(b))];

  els.filterCraft.innerHTML = '';
  for (const c of craftList){
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    els.filterCraft.appendChild(opt);
  }

  rebuildCategoryOptions(); // depends on current craft selection
}

function rebuildCategoryOptions(){
  const recs = Object.values(state.recipes.recipesByOutputItemId || {});
  const fc = els.filterCraft?.value || 'All';
  const cats = new Set();

  for (const r of recs){
    const k = craftKey(r);
    if (fc !== 'All' && k.craft !== fc) continue;
    if (k.category && k.category !== '—') cats.add(k.category);
  }

  const prev = els.filterCategory?.value || 'All';
  const catList = ['All', ...Array.from(cats).sort((a,b)=>a.localeCompare(b))];

  els.filterCategory.innerHTML = '';
  for (const c of catList){
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    els.filterCategory.appendChild(opt);
  }

  // preserve selection if still available
  if (catList.includes(prev)){
    els.filterCategory.value = prev;
  } else {
    els.filterCategory.value = 'All';
  }
}

async function init(){
  applySavedTheme();

  state.recipes = await loadJson('./data/craft_recipes.json');

  // itemsCatalog.json: array OR {data:[...]}
  // monsters.json: generated from getMonsterListComplete

  try{
    const items = await loadJson('./data/itemsCatalog.json');
    const arr = Array.isArray(items) ? items : (Array.isArray(items?.data) ? items.data : null);
    if (arr){
      state.itemsById = Object.fromEntries(arr.filter(x=>x?.id!=null).map(x => [String(x.id), x]));
    }
  } catch(e){
    // optional but recommended
  }

  // Monsters (for drop sources). Optional but recommended.
  try{
    const mon = await loadJson('./data/monsters.json');
    const arr = Array.isArray(mon) ? mon : (Array.isArray(mon?.monsters) ? mon.monsters : null);
    if (arr){
      state.monsters = arr;
      // Build drop index: itemId -> [{monsterId,name,level,tier,gatheringNode,chance}]
      const map = {};
      for (const m of arr){
        for (const d of (m.drops || [])){
          if (d?.itemId == null) continue;
          const k = String(d.itemId);
          (map[k] ||= []).push({
            monsterId: m.id,
            name: m.name,
            level: m.level,
            tier: m.tier,
            gatheringNode: !!m.gatheringNode,
            chance: d.chance
          });
        }
      }
      state.dropsByItemId = map;
    }
  } catch(e){
    // ok
  }

  buildFilterOptions();
  restoreCartFromUrl();
  wireUI();
  render();
}

function restoreCartFromUrl(){
  const params = new URLSearchParams(location.search);
  const packed = params.get('cart');
  if (!packed) return;
  try{
    const decoded = b64urlDecode(packed);
    const obj = JSON.parse(decoded);
    if (obj && typeof obj === 'object'){
      for (const [k,v] of Object.entries(obj)){
        const qty = Math.max(1, parseInt(v, 10) || 1);
        state.cart.set(String(k), qty);
      }
    }
  } catch(e){
    // ignore malformed links
  }
}

function updateUrlFromCart(){
  const obj = Object.fromEntries([...state.cart.entries()]);
  const params = new URLSearchParams(location.search);
  if (Object.keys(obj).length === 0){
    params.delete('cart');
  } else {
    params.set('cart', b64urlEncode(JSON.stringify(obj)));
  }
  const newUrl = `${location.pathname}?${params.toString()}`;
  history.replaceState(null, '', newUrl);
}

function wireUI(){
  els.search.addEventListener('input', renderResults);
  els.btnClear.addEventListener('click', () => { state.cart.clear(); updateUrlFromCart(); render(); });

  els.btnCopy.addEventListener('click', async () => {
    const text = computeMaterialsText();
    await navigator.clipboard.writeText(text);
    els.btnCopy.textContent = 'Copied!';
    setTimeout(()=>els.btnCopy.textContent='Copy materials', 900);
  });

  if (els.btnTheme) els.btnTheme.addEventListener('click', toggleTheme);

  els.btnShare.addEventListener('click', async () => {
    updateUrlFromCart();
    await navigator.clipboard.writeText(location.href);
    els.btnShare.textContent = 'Link copied!';
    setTimeout(()=>els.btnShare.textContent='Copy share link', 900);
  });

  els.btnExport.addEventListener('click', () => {
    const exportObj = {
      cart: Object.fromEntries([...state.cart.entries()].map(([id,qty]) => [id, qty])),
      settings: {
        recursive: els.toggleRecursive.checked,
        accountForChance: els.toggleChance.checked,
        filterCraft: els.filterCraft.value,
        filterCategory: els.filterCategory.value,
        search: els.search.value,
      },
      materials: computeMaterials(),
      generatedAt: new Date().toISOString(),
    };
    downloadJson(exportObj, 'roidle_shopping_list.json');
  });

  els.toggleRecursive.addEventListener('change', render);
  els.toggleChance.addEventListener('change', render);
  els.filterCraft.addEventListener('change', () => { rebuildCategoryOptions(); renderResults(); });
  els.filterCategory.addEventListener('change', renderResults);
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

function passFilters(rec){
  const { craft, category } = craftKey(rec);
  const fc = els.filterCraft.value;
  const fcat = els.filterCategory.value;
  if (fc && fc !== 'All' && craft !== fc) return false;
  if (fcat && fcat !== 'All' && category !== fcat) return false;
  return true;
}

function renderResults(){
  const q = els.search.value.trim().toLowerCase();
  const list = allRecipes()
    .filter(passFilters)
    .filter(r => (r?.name || '').toLowerCase().includes(q))
    .slice(0, 80);

  els.results.innerHTML = '';
  if (!list.length){
    const div = document.createElement('div');
    div.className = 'muted';
    div.textContent = (q || els.filterCraft.value !== 'All' || els.filterCategory.value !== 'All')
      ? 'No matches for your filters.'
      : 'Type to search craftable items.';
    els.results.appendChild(div);
    return;
  }

  for (const rec of list){
    const row = document.createElement('div');
    row.className = 'result';

    const left = document.createElement('div');
    left.className = 'resultLeft';

    const img = document.createElement('img');
    img.className = 'thumb';
    img.loading = 'lazy';
    setItemIcon(img, rec.outputItemId);
    img.alt = recipeName(rec);
    

    const meta = document.createElement('div');
    meta.className = 'meta';

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = recipeName(rec);
    name.title = recipeTooltip(rec);

    const k = craftKey(rec);
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.innerHTML = `<code>${k.craft}</code><code>${k.category}</code><span>Output: ${fmt(rec.outputAmount || 1)}</span>`;

    meta.appendChild(name);
    meta.appendChild(pill);

    left.appendChild(img);
    left.appendChild(meta);

    const btn = document.createElement('button');
    btn.className = 'smallbtn';
    btn.textContent = 'Add';
    btn.addEventListener('click', () => {
      const id = String(rec.outputItemId);
      state.cart.set(id, (state.cart.get(id) || 0) + 1);
      updateUrlFromCart();
      render();
    });

    row.appendChild(left);
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
    left.className = 'cartItemLeft';

    const img = document.createElement('img');
    img.className = 'thumb';
    img.loading = 'lazy';
    setItemIcon(img, outputId);
    img.alt = rec ? recipeName(rec) : itemName(outputId);
    

    const text = document.createElement('div');
    text.className = 'cartText';

    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = rec ? recipeName(rec) : itemName(outputId);
    title.title = rec ? recipeTooltip(rec) : itemTooltip(outputId);

    const sub = document.createElement('div');
    sub.className = 'muted';
    if (rec){
      const k = craftKey(rec);
      sub.textContent = `${k.craft} / ${k.category}`;
    } else {
      sub.textContent = '—';
    }

    text.appendChild(title);
    text.appendChild(sub);

    left.appendChild(img);
    left.appendChild(text);

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
      updateUrlFromCart();
      render();
    });

    const del = document.createElement('button');
    del.className = 'smallbtn';
    del.textContent = 'Remove';
    del.addEventListener('click', () => {
      state.cart.delete(String(outputId));
      updateUrlFromCart();
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
  return mats.map(m => `${m.name} ×${fmt(m.amount)}`).join('\n'); // removed (id:xxx)
}

function renderMaterials(){
  if (state.cart.size === 0){
    els.materials.className = 'materials muted';
    els.materials.textContent = 'Add items to see totals.';
    els.btnCopy.disabled = true;
    els.btnShare.disabled = true;
    els.btnExport.disabled = true;
    return;
  }

  const mats = computeMaterials();
  els.materials.className = 'materials';
  els.materials.innerHTML = '';

  for (const m of mats){
    const row = document.createElement('div');
    row.className = 'matRow';

    const left = document.createElement('div');
    left.className = 'matLeft';

    const img = document.createElement('img');
    img.className = 'thumb';
    img.loading = 'lazy';
    setItemIcon(img, m.itemId);
    img.alt = m.name;
    

    const name = document.createElement('div');
    name.className = 'matName';
    name.textContent = m.name;
    name.title = itemTooltip(m.itemId);

    left.appendChild(img);
    left.appendChild(name);

    const amt = document.createElement('div');
    amt.className = 'matAmt';
    amt.textContent = `×${fmt(m.amount)}`;

    row.appendChild(left);
    row.appendChild(amt);
    els.materials.appendChild(row);
  }

  els.btnCopy.disabled = mats.length === 0;
  els.btnShare.disabled = mats.length === 0;
  els.btnExport.disabled = mats.length === 0;
}


function computeCraftPlan(){
  // Returns { craftCounts: Map<outputItemId, crafts>, totalSeconds }
  const craftCounts = new Map();
  const recursive = els.toggleRecursive.checked;
  const accountForChance = els.toggleChance.checked;
  const visiting = new Set();

  function addCraft(outputItemId, crafts){
    const k = String(outputItemId);
    craftCounts.set(k, (craftCounts.get(k) || 0) + crafts);
  }

  function expand(outputItemId, desiredQty){
    const rec = state.recipes.recipesByOutputItemId?.[String(outputItemId)];
    if (!rec) return;

    const crafts = craftsNeeded(desiredQty, rec.outputAmount, rec.chancePercent, accountForChance);
    addCraft(outputItemId, crafts);

    if (!recursive) return;

    for (const m of (rec.materials || [])){
      const need = (m.amount || 0) * crafts;
      const key = String(m.itemId);
      if (visiting.has(key)) continue;
      if (state.recipes.recipesByOutputItemId?.[key]){
        visiting.add(key);
        expand(m.itemId, need);
        visiting.delete(key);
      }
    }
  }

  for (const [outputId, qty] of state.cart.entries()){
    expand(outputId, qty);
  }

  let totalSeconds = 0;
  for (const [outputId, crafts] of craftCounts.entries()){
    const rec = state.recipes.recipesByOutputItemId?.[String(outputId)];
    if (rec?.timeSeconds) totalSeconds += rec.timeSeconds * crafts;
  }
  return { craftCounts, totalSeconds };
}

function renderCraftSummary(){
  const el = els.craftSummary;
  if (!el) return;
  if (state.cart.size === 0){
    el.className = 'summary muted';
    el.textContent = '';
    return;
  }
  const plan = computeCraftPlan();
  const lines = [];
  lines.push({k:'Total craft time', v: fmtTime(plan.totalSeconds)});
  lines.push({k:'Craft actions', v: fmt([...plan.craftCounts.values()].reduce((a,b)=>a+b,0))});
  el.className = 'summary';
  el.innerHTML = `<div class="line"><span class="small">Crafting summary</span><span></span></div>` +
    lines.map(x => `<div class="line"><span>${x.k}</span><span class="muted">${x.v}</span></div>`).join('');
}

function bestDropSourcesForItem(itemId, limit=5){
  const arr = state.dropsByItemId?.[String(itemId)] || [];
  // Sort by chance desc
  const sorted = [...arr].sort((a,b)=> (b.chance||0) - (a.chance||0));
  // de-dupe by monsterId
  const seen = new Set();
  const out = [];
  for (const s of sorted){
    if (seen.has(s.monsterId)) continue;
    seen.add(s.monsterId);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

function renderHuntList(){
  const el = els.huntList;
  if (!el) return;
  if (!state.dropsByItemId){
    el.className = 'hunt muted';
    el.innerHTML = `<span class="small">Drop sources</span><div class="muted">No monsters dataset found. Add <code>docs/data/monsters.json</code> to enable drop recommendations.</div>`;
    return;
  }
  if (state.cart.size === 0){
    el.className = 'hunt muted';
    el.textContent = '';
    return;
  }

  const mats = computeMaterials();
  const withSources = mats
    .map(m => ({...m, sources: bestDropSourcesForItem(m.itemId, 5)}))
    .filter(m => m.sources.length > 0)
    .slice(0, 40); // keep UI light

  el.className = 'hunt';
  if (withSources.length === 0){
    el.innerHTML = `<h3>Hunt targets</h3><div class="muted">No drop sources found for these materials (they may be shop-only, craft-only, or missing from the monster dump).</div>`;
    return;
  }

  el.innerHTML = `<h3>Hunt targets for materials</h3>` + withSources.map(m => {
    const srcHtml = m.sources.map(s => {
      const chancePct = s.chance >= 100 ? (s.chance/100).toFixed(2) + '%' : (s.chance) + ' (raw)';
      const tag = s.gatheringNode ? 'Node' : 'Mob';
      return `
        <div class="sourceRow">
          <div class="sourceLeft">
            <img class="thumb" alt="${s.name}" />
            <div class="sourceName" title="${s.name} (Lv ${s.level}, Tier ${s.tier})">${s.name} <span class="small">• Lv ${s.level} • ${tag}</span></div>
          </div>
          <div class="small">${chancePct}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="huntItem">
        <div class="huntItemTop">
          <div class="matLeft">
            <img class="thumb" alt="${m.name}" />
            <div class="matName" title="${itemTooltip(m.itemId)}">${m.name}</div>
          </div>
          <div class="matAmt">×${fmt(m.amount)}</div>
        </div>
        <div class="huntSources">${srcHtml}</div>
      </div>
    `;
  }).join('');

  // After HTML inserted, set icons (local-first + fallbacks)
  // materials icons:
  const matThumbs = el.querySelectorAll('.huntItemTop .thumb');
  withSources.forEach((m, i) => setItemIcon(matThumbs[i], m.itemId));

  // mob icons:
  const mobImgs = el.querySelectorAll('.sourceRow .thumb');
  let idx = 0;
  for (const m of withSources){
    for (const s of m.sources){
      setMobIcon(mobImgs[idx], s.monsterId);
      idx += 1;
    }
  }
}

function render(){
  renderResults();
  renderCart();
  renderMaterials();
  renderCraftSummary();
  renderHuntList();
}

init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<div style="padding:16px;color:#fff;font-family:system-ui">
    <h2>Failed to load data</h2>
    <pre style="white-space:pre-wrap">${String(err)}</pre>
    <p>Make sure <code>docs/data/craft_recipes.json</code> exists and GitHub Pages is serving the <code>/docs</code> folder.</p>
  </div>`;
});
