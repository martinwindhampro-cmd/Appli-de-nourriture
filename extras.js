/* =====================================================================
   FONCTIONS EN PLUS — eau, bilan de la semaine, poids, mode cuisine,
   scan de code-barres (Open Food Facts), aliments récents
   (chargé avant app.js : n'utilise les fonctions de app.js qu'au moment des clics / affichages)
   ===================================================================== */
'use strict';

/* ----- 💧 Eau ----- */
const WATER_GOAL = 8;   // verres de 25 cl
function homeWater() {
  const n = (S.water || {})[UI.day] || 0;
  return `<div class="card water"><div class="row"><b class="grow">💧 Eau</b><span class="small mute num">${fr(n * 0.25, 2)} L / ${fr(WATER_GOAL * 0.25, 1)} L</span></div>
    <div class="glasses">${Array.from({ length: WATER_GOAL }, (_, k) => `<button class="glass ${k < n ? 'on' : ''}" data-act="water" data-n="${k + 1}" aria-label="${k + 1} verre${k ? 's' : ''}"><span></span></button>`).join('')}</div></div>`;
}

/* ----- 📊 Bilan de la semaine + ⚖️ poids ----- */
function viewProgress() {
  const { t } = targets(), days = Array.from({ length: 7 }, (_, k) => shiftDay(today(), k - 6));
  const tots = days.map(d => ({ d, n: dayTotals(d), has: (S.days[d] || []).length > 0 }));
  const logged = tots.filter(x => x.has), avg = k => logged.length ? logged.reduce((s, x) => s + x.n[k], 0) / logged.length : 0;
  const onTarget = logged.filter(x => Math.abs(x.n.kcal - t.kcal) <= t.kcal * 0.1).length;
  let streak = 0, k0 = (S.days[today()] || []).length ? 0 : 1;   // aujourd'hui pas encore noté : on part d'hier
  while ((S.days[shiftDay(today(), -(k0 + streak))] || []).length) streak++;
  const max = Math.max(t.kcal * 1.25, ...tots.map(x => x.n.kcal));
  const bars = tots.map(x => { const h = x.n.kcal / max * 100, over = x.n.kcal > t.kcal * 1.1;
    return `<div class="wbar"><div class="wcol"><i style="height:${h}%;background:${!x.has ? 'var(--soft2)' : over ? 'var(--warn)' : 'var(--kcal)'}"></i></div>
      <span>${keyDate(x.d).toLocaleDateString('fr-FR', { weekday: 'narrow' })}</span></div>`; }).join('');
  const W = (S.weights || []).slice().sort((a, b) => a.d < b.d ? -1 : 1);
  const last = W[W.length - 1], first = W.find(w => w.d >= shiftDay(today(), -30)) || W[0];
  const goalW = S.profile.goalWeight;
  return `<div class="card">
    <div class="row" style="margin-bottom:10px"><h3 class="grow" style="margin:0">📊 Ma semaine</h3>${streak ? `<span class="badge ok">🔥 ${streak} jour${streak > 1 ? 's' : ''} de suite</span>` : ''}</div>
    <div class="wchart"><div class="wtarget" style="bottom:${t.kcal / max * 100}%"><span>${fr(t.kcal)}</span></div>${bars}</div>
    <div class="grid3 stats">
      <div><b>${fr(r0(avg('kcal')))}</b><span>kcal / jour</span></div>
      <div><b style="color:var(--p)">${r0(avg('p'))} g</b><span>prot. / jour</span></div>
      <div><b>${onTarget}/${logged.length || 0}</b><span>jours dans l'objectif</span></div>
    </div>
    ${logged.length ? `<p class="tiny mute" style="margin:10px 0 0">${avg('p') >= t.p * 0.9 ? '💪 Protéines au rendez-vous, continue comme ça.' : `Il manque en moyenne ${r0(t.p - avg('p'))} g de protéines par jour : pense aux recettes « Protéiné ».`}</p>` : '<p class="tiny mute" style="margin:10px 0 0">Note tes repas pour voir ton bilan ici.</p>'}
  </div>
  <div class="card">
    <div class="row" style="margin-bottom:8px"><h3 class="grow" style="margin:0">⚖️ Mon poids</h3>${last ? `<b class="num">${fr(last.kg, 1)} kg</b>` : ''}</div>
    ${W.length >= 2 ? weightChart(W.filter(w => w.d >= shiftDay(today(), -90)), goalW) : '<p class="small mute" style="margin:0 0 8px">Pèse-toi régulièrement (même jour, même heure) pour voir ta courbe.</p>'}
    ${last && first && last !== first ? `<p class="small" style="margin:6px 0 0">${last.kg - first.kg <= 0 ? '📉' : '📈'} <b>${last.kg - first.kg > 0 ? '+' : ''}${fr(last.kg - first.kg, 1)} kg</b> <span class="mute">depuis le ${keyDate(first.d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</span>${goalW ? ` · <span class="mute">objectif ${fr(goalW, 1)} kg (encore ${fr(Math.abs(last.kg - goalW), 1)} kg)</span>` : ''}</p>` : ''}
    <div class="row" style="gap:8px;margin-top:12px">
      <input type="number" inputmode="decimal" step="0.1" id="w-in" placeholder="Poids du jour (kg)" value="${last && last.d === today() ? last.kg : ''}">
      <button class="btn pri" data-act="weight-add" style="flex:none">Noter</button></div>
    <div class="row small" style="gap:8px;margin-top:8px"><span class="mute grow">Poids visé (facultatif)</span><input type="number" inputmode="decimal" step="0.5" id="w-goal" value="${goalW || ''}" placeholder="kg" style="width:90px"></div>
  </div>`;
}
function weightChart(W, goal) {
  const w = 320, h = 120, pad = 8, vals = W.map(x => x.kg).concat(goal ? [goal] : []);
  const min = Math.min(...vals) - 0.5, max = Math.max(...vals) + 0.5;
  const t0 = keyDate(W[0].d).getTime(), t1 = Math.max(keyDate(W[W.length - 1].d).getTime(), t0 + 864e5);
  const X = d => pad + (keyDate(d).getTime() - t0) / (t1 - t0) * (w - pad * 2), Y = v => pad + (max - v) / (max - min) * (h - pad * 2);
  const pts = W.map(x => `${X(x.d).toFixed(1)},${Y(x.kg).toFixed(1)}`).join(' ');
  return `<svg class="wline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Courbe de poids">
    ${goal ? `<line x1="0" x2="${w}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--acc)" stroke-dasharray="4 4" stroke-width="1" opacity=".6"/>` : ''}
    <polyline points="${pad},${h} ${pts} ${X(W[W.length - 1].d)},${h}" fill="var(--acc-s)" stroke="none" opacity=".7"/>
    <polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    ${W.map(x => `<circle cx="${X(x.d)}" cy="${Y(x.kg)}" r="3" fill="var(--card)" stroke="var(--acc)" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('')}
  </svg><div class="row tiny mute" style="justify-content:space-between"><span>${fr(Math.min(...W.map(x => x.kg)), 1)} kg min</span><span>${fr(Math.max(...W.map(x => x.kg)), 1)} kg max</span></div>`;
}

/* ----- 👨‍🍳 Mode cuisine : une étape à la fois, minuteurs, écran allumé ----- */
let wakeLock = null, cookTimer = null;
function cookMode(id, persons) {
  const r = recipeById(id); if (!r) return;
  closeSheet();
  const st = recipeState(r, persons), steps = r.steps, total = steps.length + 1;
  let k = 0;
  const root = document.createElement('div'); root.className = 'cookmode'; document.body.appendChild(root); document.body.classList.add('locked');
  try { navigator.wakeLock && navigator.wakeLock.request('screen').then(l => wakeLock = l).catch(() => {}); } catch (e) {}
  const timerOf = s => { const m = s.match(/(\d+)\s*(?:–|-|à)\s*(\d+)\s*min/) || s.match(/(\d+)\s*min/); if (m) return +(m[2] || m[1]); const hh = s.match(/(\d+(?:[.,]\d+)?)\s*h\b/); return hh ? Math.round(num(hh[1]) * 60) : 0; };
  const draw = () => {
    const isIng = k === 0, step = steps[k - 1], tm = !isIng && timerOf(step);
    root.innerHTML = `<div class="cm-top"><button class="icon-btn ghost" id="cm-x" aria-label="Quitter">×</button><div class="cm-prog"><i style="width:${(k + 1) / total * 100}%"></i></div><span class="small mute">${k + 1}/${total}</span></div>
      <div class="cm-body">
        <div class="cm-emo" style="--h:${hueOf(r.id)}">${remoOf(r)}</div>
        ${isIng ? `<h2>${esc(r.name)}</h2><p class="mute">Pour ${persons} personne${persons > 1 ? 's' : ''} · sors tout avant de commencer</p>
          <div class="cm-ings">${st.lines.filter(l => !(l.base && l.q <= 3) && (l.used || !l.opt)).map(l => `<label class="cm-ing"><input type="checkbox"> ${tile(emoOf(l.ing), 'xs')} <span class="grow">${esc(l.i.name)}</span><b>${fmtQty(l.ing, l.q)}</b></label>`).join('')}</div>`
        : `<div class="cm-step-n">Étape ${k}</div><p class="cm-step">${esc(step)}</p>
          ${tm ? `<button class="btn cm-timer" id="cm-t" data-min="${tm}">⏱ Lancer un minuteur de ${tm} min</button>` : ''}`}
        <div id="cm-run"></div>
      </div>
      <div class="cm-nav"><button class="btn" id="cm-prev" ${k === 0 ? 'disabled' : ''}>‹ Précédent</button>
        <button class="btn pri grow" id="cm-next">${k === total - 1 ? '✓ Terminé' : 'Suivant ›'}</button></div>`;
    root.querySelector('#cm-x').onclick = quit;
    root.querySelector('#cm-prev').onclick = () => { k--; draw(); };
    root.querySelector('#cm-next').onclick = () => { if (k === total - 1) { quit(); sheetCook(r, persons); } else { k++; draw(); } };
    const tb = root.querySelector('#cm-t'); if (tb) tb.onclick = () => startTimer(+tb.dataset.min);
    showTimer();
  };
  const quit = () => { root.remove(); document.body.classList.remove('locked'); if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } };
  draw();
}
function startTimer(min) {
  clearInterval(cookTimer && cookTimer.iv);
  cookTimer = { end: Date.now() + min * 60000, iv: setInterval(showTimer, 500) };
  showTimer();
}
function showTimer() {
  const el = document.querySelector('#cm-run'); if (!cookTimer) { if (el) el.innerHTML = ''; return; }
  const left = Math.max(0, cookTimer.end - Date.now()), m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
  if (el) el.innerHTML = `<div class="cm-clock ${left ? '' : 'done'}">${left ? `⏱ ${m}:${String(s).padStart(2, '0')}` : '⏰ C\'est prêt !'}<button class="link" id="cm-stop">${left ? 'Arrêter' : 'OK'}</button></div>`;
  const stop = document.querySelector('#cm-stop'); if (stop) stop.onclick = () => { clearInterval(cookTimer.iv); cookTimer = null; showTimer(); };
  if (!left && !cookTimer.rang) { cookTimer.rang = true; ring3(); }
}
function ring3() {
  try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) {}
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(t => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3); });
  } catch (e) {}
}

/* ----- 📷 Scan de code-barres → Open Food Facts ----- */
const ZXING = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
let scanStop = null;
function loadScript(src) { return new Promise((res, rej) => { if ([...document.scripts].some(s => s.src === src)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
function sheetScan(after = 'ask') {
  openSheet(`${sheetHead('Scanner un produit', '📷')}
    <div class="scan-box"><video id="sc-v" playsinline muted></video><div class="scan-frame"></div><div class="scan-msg" id="sc-msg">Ouverture de la caméra…</div></div>
    <label class="f">Ou tape le code-barres</label>
    <div class="row" style="gap:8px"><input type="text" inputmode="numeric" id="sc-code" placeholder="ex. 3256220456789"><button class="btn pri" id="sc-go" style="flex:none">OK</button></div>
    <p class="tiny mute">Les infos viennent d'Open Food Facts, la base libre des produits alimentaires.</p>`, sh => {
    const go = code => { stopScan(); lookupBarcode(code.replace(/\D/g, ''), after); };
    sh.querySelector('#sc-go').onclick = () => { const c = sh.querySelector('#sc-code').value.trim(); if (c.length >= 8) go(c); else toast('Code trop court'); };
    sh.querySelector('#sc-code').addEventListener('keydown', e => { if (e.key === 'Enter') sh.querySelector('#sc-go').click(); });
    startScan(sh.querySelector('#sc-v'), code => go(code), msg => { const m = sh.querySelector('#sc-msg'); if (m) m.textContent = msg; });
  });
  // Arrêter la caméra si la fiche est fermée
  const obs = new MutationObserver(() => { if (!document.querySelector('#sc-v')) { stopScan(); obs.disconnect(); } });
  obs.observe($('sheet-root'), { childList: true, subtree: true });
}
async function startScan(video, onCode, onMsg) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
    video.srcObject = stream; await video.play(); onMsg('Vise le code-barres');
    let alive = true;
    scanStop = () => { alive = false; stream.getTracks().forEach(t => t.stop()); };
    if ('BarcodeDetector' in window) {
      const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const loop = async () => { if (!alive) return; try { const r = await det.detect(video); if (r.length) return onCode(r[0].rawValue); } catch (e) {} setTimeout(loop, 200); };
      loop();
    } else {
      await loadScript(ZXING);
      const hints = new Map(); hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]);
      const reader = new ZXing.BrowserMultiFormatReader(hints);
      const loop = () => {
        if (!alive) return;
        try { if (video.videoWidth) { const res = reader.decodeBitmap(reader.createBinaryBitmap(video)); if (res) return onCode(res.getText()); } } catch (e) {}
        setTimeout(loop, 250);
      };
      loop();
    }
  } catch (e) { console.warn(e); onMsg('Caméra indisponible : tape le code ci-dessous'); }
}
function stopScan() { if (scanStop) { scanStop(); scanStop = null; } }
async function lookupBarcode(code, after) {
  const known = (S.barcodes || {})[code];
  openSheet(`${sheetHead('Recherche…', '🔎')}<div class="empty">Recherche du produit ${esc(code)}…</div>`);
  let p = null;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_fr,brands,quantity,nutriments,image_front_small_url,categories`);
    const d = await res.json(); if (d.status === 1 || d.product) p = d.product;
  } catch (e) { console.warn(e); }
  if (!p || !(p.product_name_fr || p.product_name)) {
    return openSheet(`${sheetHead('Produit inconnu', '🤷')}
      <p class="small mute">Le code ${esc(code)} n'est pas (encore) dans Open Food Facts. Tu peux créer l'ingrédient avec les valeurs de l'étiquette.</p>
      <button class="btn pri full" id="mk">Créer l'ingrédient</button>`, sh => sh.querySelector('#mk').onclick = () => sheetIngredient(null, '', ing => { (S.barcodes ||= {})[code] = ing.id; save(); sheetStockQty(ing.id); }));
  }
  const name = (p.product_name_fr || p.product_name).trim(), brand = (p.brands || '').split(',')[0].trim(), N = p.nutriments || {};
  const liquid = /\b(ml|cl|l)\b/i.test(p.quantity || '');
  const n = { kcal: r0(N['energy-kcal_100g'] ?? (N.energy_100g ? N.energy_100g / 4.184 : 0)), p: +(N.proteins_100g || 0).toFixed(1), g: +(N.carbohydrates_100g || 0).toFixed(1), l: +(N.fat_100g || 0).toFixed(1) };
  const offId = 'off_' + code, full = name + (brand ? ' (' + brand + ')' : '');
  const size = p.quantity ? parseSize(p.quantity).size : null;
  const guess = known || guessIng(norm(name).toUpperCase(), (p.categories || '').toUpperCase()).ing || '';
  let link = guess && guess !== offId ? guess : '';
  const opts = allIngs().filter(i => !i.id.startsWith('off_')).map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');
  openSheet(`${sheetHead(name, '🏷️')}
    <div class="card row" style="gap:14px">${p.image_front_small_url ? `<img src="${esc(p.image_front_small_url)}" alt="" class="off-img">` : tile('🏷️')}
      <div class="grow"><b>${esc(name)}</b><div class="small mute">${esc(brand)}${p.quantity ? ' · ' + esc(p.quantity) : ''}</div>
      <div class="small num" style="margin-top:6px"><b>${n.kcal} kcal</b> · P ${n.p} · G ${n.g} · L ${n.l} <span class="mute">/ 100 ${liquid ? 'ml' : 'g'}</span></div></div></div>
    <label class="f">Pour mes recettes, c'est…</label>
    <select id="lk"><option value="">Un produit à part (${esc(name)})</option>${opts}</select>
    <p class="tiny mute" style="margin-top:4px">Relier le produit à un ingrédient (ex. « Lardons ») permet aux recettes de le reconnaître.</p>
    <div class="row" style="gap:8px;margin-top:14px">
      <button class="btn grow" id="eat">🍽️ Je le mange</button>
      <button class="btn pri grow" id="stk">🧊 Ajouter au stock</button></div>`, sh => {
    sh.querySelector('#lk').value = link;
    const ensure = () => {
      link = sh.querySelector('#lk').value;
      const prod = { id: offId, name: full, unit: liquid ? 'ml' : 'g', place: link ? ingOf(link).place : (/surgel|frozen/i.test(p.categories || '') ? 'congel' : 'placard'), n, code };
      S.customIngs = S.customIngs.filter(x => x.id !== offId).concat(prod); buildIng();
      (S.barcodes ||= {})[code] = link || offId; save();
      return prod;
    };
    sh.querySelector('#stk').onclick = () => {
      const prod = ensure(), target = link || offId;
      if (size) { addStock(target, size, ingOf(target).place); save(); render(); toast(`${name} ajouté au stock ✓`); closeSheet(); }
      else sheetStockQty(target);
      void prod;
    };
    sh.querySelector('#eat').onclick = () => { ensure(); sheetEntryQty(offId, link); };
  });
}

/* ----- ⏱ Aliments récents ----- */
function recentFoods() {
  const seen = new Map();
  for (const d of Object.keys(S.days).sort().reverse().slice(0, 21)) for (const e of (S.days[d] || []).slice().reverse()) {
    const key = e.name; if (!seen.has(key)) seen.set(key, e);
  }
  return [...seen.values()].slice(0, 25);
}

/* ----- Événements des fonctions en plus ----- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'water': {
      const cur = (S.water || {})[UI.day] || 0, n = +d.n;
      (S.water ||= {})[UI.day] = cur === n ? n - 1 : n;
      for (const k of Object.keys(S.water)) if (k < shiftDay(today(), -60)) delete S.water[k];
      save(); return render();
    }
    case 'weight-add': {
      const kg = num($('w-in').value); if (kg < 25 || kg > 350) return toast('Indique ton poids en kg');
      S.weights = (S.weights || []).filter(w => w.d !== today()).concat({ d: today(), kg });
      S.profile.weight = kg;
      const g = num($('w-goal').value); S.profile.goalWeight = g > 0 ? g : null;
      save(); render(); return toast('Poids noté ✓ (tes besoins sont recalculés)');
    }
    case 'cook-mode': return cookMode(d.id, +d.n || 1);
    case 'scan': return sheetScan();
    case 'recent-add': {
      const e0 = recentFoods()[+d.k]; if (!e0) return;
      const meal = (document.querySelector('#meal button.on') || {}).dataset?.m || currentMeal();
      const ne = { id: uid(), meal, name: e0.name, kcal: e0.kcal, p: e0.p, g: e0.g, l: e0.l, ...(e0.recipe ? { recipe: e0.recipe } : {}) };
      addEntry(UI.day, ne); render();
      return toast(`${e0.name} ajouté`, () => { removeEntry(UI.day, ne.id); render(); });
    }
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'w-goal') { const g = num(e.target.value); S.profile.goalWeight = g > 0 ? g : null; save(); }   // pas de render : ne pas effacer le poids en cours de saisie
});
