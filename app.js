/* =====================================================================
   MES REPAS — stock, recettes, planning et suivi nutritionnel
   Organisation :
     1. Firebase             5. Planning & liste de courses
     2. Outils               6. Écrans : Accueil · Planning · Recettes · Stock · Profil
     3. Données & synchro    7. Fiches (bottom sheets)
     4. Calculs              8. Événements & démarrage
   (L'import du ticket Super U est dans ticket.js, les ingrédients et recettes dans data.js)
   ===================================================================== */
'use strict';

/* ============================== 1. FIREBASE ============================== */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAqfrPS3L3XvrP3Jmt5urtewjsU1pm6rj8",
  authDomain: "appli-de-suivis-repas.firebaseapp.com",
  projectId: "appli-de-suivis-repas",
  storageBucket: "appli-de-suivis-repas.firebasestorage.app",
  messagingSenderId: "284665491645",
  appId: "1:284665491645:web:e935e754a9b3bdd44347d4"
};
let auth = null, db = null, currentUser = null;
if (FIREBASE_CONFIG && window.firebase && !window.LOCAL_ONLY) {
  firebase.initializeApp(FIREBASE_CONFIG);
  auth = firebase.auth(); auth.languageCode = 'fr';
  db = firebase.firestore();
  db.enablePersistence({ synchronizeTabs: true }).catch(e => console.warn('Persistance hors-ligne indisponible :', e.code));
}
const CLOUD = !!db;

/* ============================== 2. OUTILS ============================== */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
const r0 = v => Math.round(v);
const fr = (v, d = 0) => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: d });
const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = n => String(n).padStart(2, '0');
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const shiftDay = (k, n) => { const d = keyDate(k); d.setDate(d.getDate() + n); return dateKey(d); };
const today = () => dateKey();
const dayLabel = (k, long = true) => {
  const t = today();
  if (k === t) return "Aujourd'hui";
  if (k === shiftDay(t, -1)) return 'Hier';
  if (k === shiftDay(t, 1)) return 'Demain';
  return keyDate(k).toLocaleDateString('fr-FR', long ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'long', day: 'numeric' });
};
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const hueOf = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const MEALS = [['pdj', 'Petit-déjeuner', '☀️'], ['dej', 'Déjeuner', '🍽️'], ['diner', 'Dîner', '🌙'], ['collation', 'Collation', '🍎']];
const MEAL_NAME = Object.fromEntries(MEALS.map(m => [m[0], m[1]]));
const currentMeal = () => { const h = new Date().getHours() + new Date().getMinutes() / 60; return h < 10.5 ? 'pdj' : h < 14.5 ? 'dej' : h < 17.5 ? 'collation' : 'diner'; };
const PLACES = [['frigo', 'Frigo', '🧊'], ['congel', 'Congélateur', '❄️'], ['placard', 'Placard', '🥫']];
const PLACE_NAME = Object.fromEntries(PLACES.map(p => [p[0], p[1]]));
const RTYPES = { pdj: 'Petit-déj', plat: 'Plat', collation: 'Collation' };
let toastT;
function toast(msg, undo) {
  let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.innerHTML = esc(msg) + (undo ? ' <button class="toast-undo">Annuler</button>' : '');
  if (undo) t.querySelector('.toast-undo').onclick = () => { undo(); t.remove(); };
  clearTimeout(toastT); toastT = setTimeout(() => t.remove(), undo ? 5000 : 2600);
}
const snapshot = () => JSON.parse(JSON.stringify({ stock: S.stock, plan: S.plan }));

/* ============================== 3. DONNÉES & SYNCHRO ============================== */
const LS_KEY = 'repas-v1';
const blank = () => ({
  profile: { sex: 'h', age: 30, height: 175, weight: 75, activity: 1.55, goal: 'maintien', persons: 1, custom: null, planPdj: false, batch: true },
  stock: [],        // { id, ing, qty, place, full }   ou boîte : { id, dish: { name, rid, n }, qty (portions), place }
  customIngs: [],   // ingrédients créés ou corrigés
  days: {},         // 'AAAA-MM-JJ' → [ { id, meal, name, kcal, p, g, l, recipe? } ]
  ticketMap: {},    // libellé du ticket → ingrédient (tes choix)
  plan: {},         // 'AAAA-MM-JJ' → { pdj|dej|diner : { r, n, done } | { left: recipeId, done } | { out: 'texte', done } }
  shop: { checked: {}, extra: [] },   // liste de courses : cases cochées, articles ajoutés à la main
  myRecipes: [],    // recettes perso (même format que RECIPES)
  favs: {},         // recettes favorites
});
const MAIN_FIELDS = ['profile', 'stock', 'customIngs', 'ticketMap', 'plan', 'shop', 'myRecipes', 'favs'];
let S = blank();
const UI = { tab: 'home', day: today(), rType: 'all', rSearch: '', persons: null, sSearch: '', sPlace: 'all', week: 0, planView: 'week' };

function loadLocal() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) { const d = JSON.parse(raw); S = Object.assign(blank(), d); S.profile = Object.assign(blank().profile, d.profile); S.shop = Object.assign(blank().shop, d.shop); } } catch (e) { console.warn(e); }
}
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { console.warn(e); } }
function prunePlan() { const lim = shiftDay(today(), -21); for (const k of Object.keys(S.plan)) if (k < lim) delete S.plan[k]; }
let saveT = null;
function save() {
  saveLocal();
  if (!CLOUD || !currentUser) return;
  clearTimeout(saveT); setSync('busy');
  saveT = setTimeout(() => {
    prunePlan();
    const data = { updatedAt: Date.now() }; for (const f of MAIN_FIELDS) data[f] = S[f];
    db.collection('users').doc(currentUser.uid).set(JSON.parse(JSON.stringify(data)))
      .then(() => setSync('on')).catch(e => { console.error(e); setSync('err'); toast('Erreur de synchro : ' + e.code); });
  }, 600);
}
const dayDoc = day => db.collection('users').doc(currentUser.uid).collection('days').doc(day);
function addEntry(day, e) {
  e = JSON.parse(JSON.stringify(e));
  (S.days[day] ||= []).push(e); saveLocal();
  if (CLOUD && currentUser) dayDoc(day).set({ entries: firebase.firestore.FieldValue.arrayUnion(e) }, { merge: true }).catch(err => toast('Erreur : ' + err.code));
}
function removeEntry(day, id) {
  const list = S.days[day] || [], e = list.find(x => x.id === id); if (!e) return;
  S.days[day] = list.filter(x => x.id !== id); saveLocal();
  if (CLOUD && currentUser) dayDoc(day).update({ entries: firebase.firestore.FieldValue.arrayRemove(e) }).catch(err => toast('Erreur : ' + err.code));
}
function setSync(s) {
  $('sync').innerHTML = !CLOUD ? '<span class="dot"></span>Local'
    : s === 'busy' ? '<span class="dot busy"></span>Synchro…'
    : s === 'err' ? '<span class="dot bad"></span>Erreur'
    : '<span class="dot on"></span>Synchronisé';
}
let unsubMain = null, unsubDays = [];
function listenCloud() {
  unsubMain = db.collection('users').doc(currentUser.uid).onSnapshot(snap => {
    if (snap.metadata.hasPendingWrites) return;
    if (!snap.exists) { save(); return; }
    const d = snap.data();
    for (const f of MAIN_FIELDS) if (d[f] !== undefined) S[f] = d[f];
    S.profile = Object.assign(blank().profile, d.profile || {}); S.shop = Object.assign(blank().shop, d.shop || {});
    saveLocal(); setSync('on'); render();
  }, e => { console.error(e); setSync('err'); });
  listenDays();
}
// Le journal : on écoute le jour affiché, plus les 3 jours précédents (pour varier les suggestions)
function listenDays() {
  if (!CLOUD || !currentUser) return;
  unsubDays.forEach(u => u()); unsubDays = [];
  const keys = new Set([UI.day, today(), shiftDay(today(), -1), shiftDay(today(), -2), shiftDay(today(), -3)]);
  for (const day of keys) unsubDays.push(dayDoc(day).onSnapshot(snap => {
    if (snap.metadata.hasPendingWrites) return;
    S.days[day] = snap.exists ? (snap.data().entries || []) : (S.days[day] || []);
    saveLocal(); if (UI.tab === 'home') render();
  }));
}

/* ============================== 4. CALCULS ============================== */
// --- Ingrédients ---
let ING = {};
function buildIng() { ING = {}; for (const i of INGREDIENTS) ING[i.id] = i; for (const i of S.customIngs) ING[i.id] = Object.assign({}, ING[i.id] || {}, i); }
const ingOf = id => ING[id] || { id, name: id, unit: 'g', place: 'placard', n: { kcal: 0, p: 0, g: 0, l: 0 } };
const allIngs = () => Object.values(ING).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
const emoOf = id => { const i = ingOf(id); return i.emo || EMO[id] || EMO[i.fam] || ({ frigo: '🧊', congel: '❄️', placard: '🥫' })[i.place] || '🍽️'; };
const rayonOf = id => { const i = ingOf(id); return RAYON_OF[id] || RAYON_OF[i.fam] || (i.place === 'congel' ? 'su' : 'ep'); };

// Portion « typique » d'un ingrédient : la médiane des quantités dans les recettes (pour les boutons −/+)
let PORTION = null;
function portionOf(id) {
  if (!PORTION) {
    PORTION = {};
    const acc = {};
    for (const r of allRecipes()) for (const x of r.ings) { (acc[x.ing] ||= []).push(x.q); }
    for (const [k, v] of Object.entries(acc)) { v.sort((a, b) => a - b); PORTION[k] = v[Math.floor(v.length / 2)]; }
  }
  const i = ingOf(id);
  const p = PORTION[id] || PORTION[i.fam];
  if (p) return i.unit === 'pc' ? Math.max(1, Math.round(p)) : Math.max(i.unit === 'ml' ? 100 : 10, Math.round(p / 10) * 10);
  return i.unit === 'pc' ? 1 : 100;
}
// Pas des boutons −/+ du stock : 1 pièce si l'ingrédient se compte en pièces, sinon 1 portion
function stepOf(it) {
  if (it.dish) return 1;
  const i = ingOf(it.ing);
  if (i.unit === 'pc') return 1;
  if (i.pw && i.pw <= 400) return i.pw;
  return portionOf(it.ing);
}
const stepLabel = it => {
  if (it.dish) return '1 portion';
  const i = ingOf(it.ing), s = stepOf(it);
  if (i.unit === 'pc' || (i.pw && i.pw <= 400 && s === i.pw)) return '1 pièce';
  return `1 portion (${fr(s)} ${i.unit})`;
};
// Affichage d'une quantité : { big, small } — ex. « 10 pièces » + « 1 kg »
function qtyParts(id, q) {
  const i = ingOf(id);
  const w = q >= 1000 ? fr(q / 1000, 2) + (i.unit === 'ml' ? ' L' : ' kg') : fr(q, q < 10 ? 1 : 0) + ' ' + i.unit;
  if (i.unit === 'pc') return { big: fmtPieces(q), small: '' };
  if (i.pw && i.pw <= 400 && q >= i.pw * 0.75) return { big: fmtPieces(q / i.pw, true), small: w };
  return { big: w, small: '' };
}
function fmtPieces(n, approx) {
  const fr4 = { 0.25: '¼', 0.5: '½', 0.75: '¾' }, w = Math.floor(n + 1e-9), f = Math.round((n - w) * 4) / 4;
  let s = f === 1 ? String(w + 1) : f > 0 && fr4[f] ? (w ? w + ' ' : '') + fr4[f] : String(w);
  if (approx && f > 0 && f < 1) s = String(Math.round(n));
  return (approx ? '≈ ' : '') + s + (n > 1 ? ' pièces' : ' pièce');
}
const fmtQty = (id, q) => { const p = qtyParts(id, q); return p.small ? `${p.big} · ${p.small}` : p.big; };

function nutrOf(id, q) {
  const i = ingOf(id), f = i.unit === 'pc' ? q * (i.pw || 100) / 100 : q / 100;
  return { kcal: i.n.kcal * f, p: i.n.p * f, g: i.n.g * f, l: i.n.l * f };
}
const addN = (a, b, k = 1) => ({ kcal: a.kcal + b.kcal * k, p: a.p + b.p * k, g: a.g + b.g * k, l: a.l + b.l * k });
const ZERO = () => ({ kcal: 0, p: 0, g: 0, l: 0 });
const roundN = n => ({ kcal: r0(n.kcal), p: r0(n.p), g: r0(n.g), l: r0(n.l) });

// --- Stock ---
const matches = (it, id) => !it.dish && (it.ing === id || ingOf(it.ing).fam === id);
const available = (id, stock = S.stock) => stock.reduce((s, it) => s + (matches(it, id) ? it.qty : 0), 0);
const PLACE_ORDER = { frigo: 0, congel: 1, placard: 2 };
function deduct(id, qty, stock = S.stock) {
  const items = stock.filter(it => matches(it, id))
    .sort((a, b) => (a.ing === id ? 0 : 1) - (b.ing === id ? 0 : 1) || PLACE_ORDER[a.place] - PLACE_ORDER[b.place] || a.qty - b.qty);
  let left = qty;
  for (const it of items) { if (left <= 0) break; const t = Math.min(it.qty, left); it.qty -= t; left -= t; }
  for (let k = stock.length - 1; k >= 0; k--) if (stock[k].qty <= 1e-6) stock.splice(k, 1);
}
function addStock(id, qty, place) {
  const ex = S.stock.find(it => !it.dish && it.ing === id && it.place === place);
  if (ex) { ex.qty += qty; ex.full = Math.max(ex.full || 0, ex.qty); }
  else S.stock.push({ id: uid(), ing: id, qty, place, full: qty });
}
const levelOf = it => Math.max(0, Math.min(1, it.qty / (it.full || it.qty || 1)));

// --- Recettes ---
const allRecipes = () => RECIPES.concat(S.myRecipes || []);
const recipeById = id => allRecipes().find(r => r.id === id);
const remoOf = r => r.emo || REMO[r.id] || ({ pdj: '🥣', plat: '🍽️', collation: '🍎' })[r.type];
function recipeState(r, persons, stock = S.stock) {
  let need = 0, have = 0, n = ZERO();
  const lines = r.ings.map(x => {
    const i = ingOf(x.ing), q = x.q * persons, av = i.base ? Infinity : available(x.ing, stock);
    const ok = i.base || av >= q - 1e-6;
    const used = !x.opt || av > 0;
    if (used) n = addN(n, nutrOf(x.ing, x.q));
    if (!x.opt && !i.base) { need++; if (ok) have++; }
    return { ...x, i, q, av, ok, partial: !ok && av > 0, base: !!i.base, used };
  });
  const missing = lines.filter(l => !l.opt && !l.ok);
  return { lines, missing, ratio: need ? have / need : 1, ok: !missing.length, n };
}
// Ce que j'ai mangé ou prévu récemment (pour varier)
function recentRecipes(daysBack = 3) {
  const set = new Set();
  for (let k = 0; k <= daysBack; k++) for (const e of S.days[shiftDay(today(), -k)] || []) if (e.recipe) set.add(e.recipe);
  return set;
}
// Suggestions de recettes pour un repas : faisables d'abord, adaptées aux calories restantes, variées
function suggest(meal = currentMeal(), max = 8) {
  const persons = S.profile.persons || 1, { t } = targets(), tot = dayTotals(today());
  const share = { pdj: 0.25, dej: 0.35, diner: 0.3, collation: 0.1 }[meal];
  const aim = Math.max(250, Math.min(t.kcal * share * 1.3, t.kcal - tot.kcal));
  const types = meal === 'pdj' ? ['pdj'] : meal === 'collation' ? ['collation', 'pdj'] : ['plat'];
  const recent = recentRecipes();
  return allRecipes().filter(r => types.includes(r.type)).map(r => {
    const st = recipeState(r, persons);
    let sc = st.ok ? 100 : st.missing.length === 1 ? 35 : st.ratio * 20;
    if (S.favs[r.id]) sc += 15;
    if (recent.has(r.id)) sc -= 30;
    sc += Math.min(st.n.p, 50) * 0.3 - Math.abs(st.n.kcal - aim) / aim * 15 + (r.time <= 20 ? 6 : 0);
    return { r, st, sc };
  }).sort((a, b) => b.sc - a.sc).slice(0, max);
}

// --- Profil & objectifs ---
const GOALS = { perte: ['Perte de poids', -0.15, 2.0, '📉'], maintien: ['Maintien', 0, 1.6, '⚖️'], masse: ['Prise de masse', 0.10, 1.8, '💪'] };
const ACTIVITIES = [[1.2, 'Sédentaire (peu ou pas de sport)'], [1.375, 'Légère (1–3 séances / semaine)'], [1.55, 'Modérée (3–5 séances / semaine)'], [1.725, 'Élevée (6–7 séances / semaine)'], [1.9, 'Très élevée (travail physique + sport)']];
function targets(p = S.profile) {
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === 'f' ? -161 : 5);
  const tdee = bmr * p.activity, [, adj, pkg] = GOALS[p.goal] || GOALS.maintien;
  const kcal = tdee * (1 + adj), prot = pkg * p.weight, lip = kcal * 0.30 / 9, glu = Math.max(0, (kcal - prot * 4 - lip * 9) / 4);
  const auto = { kcal: r0(kcal), p: r0(prot), g: r0(glu), l: r0(lip) };
  return { bmr: r0(bmr), tdee: r0(tdee), auto, t: p.custom ? Object.assign({}, auto, p.custom) : auto };
}
const dayTotals = day => (S.days[day] || []).reduce((a, e) => addN(a, e), ZERO());

/* ============================== 5. PLANNING & COURSES ============================== */
const planSlots = () => (S.profile.planPdj ? [['pdj', 'Matin', '☀️']] : []).concat([['dej', 'Midi', '🍽️'], ['diner', 'Soir', '🌙']]);
const slotOf = (day, s) => (S.plan[day] || {})[s];
function setSlot(day, s, v) { if (v) (S.plan[day] ||= {})[s] = v; else if (S.plan[day]) { delete S.plan[day][s]; if (!Object.keys(S.plan[day]).length) delete S.plan[day]; } }
const weekDays = (offset = UI.week) => Array.from({ length: 7 }, (_, k) => shiftDay(today(), offset * 7 + k));
const slotPast = (day, s) => day < today() || (day === today() && new Date().getHours() >= ({ pdj: 11, dej: 15, diner: 22 })[s]);
const slotNutr = sl => { if (!sl) return ZERO(); const r = recipeById(sl.r || sl.left); return r ? recipeState(r, 1).n : ZERO(); };

// Planning de la semaine à partir d'aujourd'hui, en tenant compte du stock « réservé » par les repas déjà prévus
function plannedFuture() {
  const out = [];
  for (const day of Object.keys(S.plan).sort()) {
    if (day < today()) continue;
    for (const [s] of [['pdj'], ['dej'], ['diner']]) { const sl = slotOf(day, s); if (sl && sl.r && !sl.done) out.push({ day, s, sl }); }
  }
  return out;
}
// Remplissage automatique des créneaux vides
function autoFill(days) {
  const sim = JSON.parse(JSON.stringify(S.stock.filter(it => !it.dish)));
  for (const { sl } of plannedFuture()) { const r = recipeById(sl.r); if (r) for (const l of recipeState(r, sl.n, sim).lines) if (!l.base && l.av > 0) deduct(l.ing, Math.min(l.q, l.av), sim); }
  const used = new Map();   // recette → dernier jour prévu
  const recent = recentRecipes();
  for (const day of Object.keys(S.plan)) for (const s in S.plan[day]) { const id = S.plan[day][s].r || S.plan[day][s].left; if (id) used.set(id, day); }
  let filled = 0, prev = null;
  for (const day of days) for (const [s] of planSlots()) {
    if (slotOf(day, s) || slotPast(day, s)) { prev = (slotOf(day, s) || {}).r || prev; continue; }
    const persons = S.profile.persons || 1, types = s === 'pdj' ? ['pdj'] : ['plat'];
    const nextDay = shiftDay(day, 1), batch = s === 'diner' && S.profile.batch && !slotOf(nextDay, 'dej') && days.includes(nextDay);
    let best = null;
    for (const r of allRecipes().filter(r => types.includes(r.type))) {
      const n = persons + (batch && r.boite ? 1 : 0), st = recipeState(r, n, sim);
      let sc = st.ok ? 100 : st.ratio * 55 - st.missing.length * 8;
      if (S.favs[r.id]) sc += 12;
      if (r.id === prev) sc -= 100;
      const last = used.get(r.id);
      if (last) sc -= Math.abs(keyDate(last) - keyDate(day)) < 3 * 864e5 ? 45 : 20;   // varier sur la semaine
      if (recent.has(r.id)) sc -= 20;
      if (batch && r.boite) sc += 8;
      sc += Math.min(st.n.p, 45) * 0.25 + Math.random() * 6;
      if (!best || sc > best.sc) best = { r, n, st, sc };
    }
    if (!best) continue;
    setSlot(day, s, { r: best.r.id, n: best.n });
    for (const l of best.st.lines) if (!l.base && l.av > 0) deduct(l.ing, Math.min(l.q, l.av), sim);
    used.set(best.r.id, day); prev = best.r.id; filled++;
    if (best.n > persons && batch) { setSlot(nextDay, 'dej', { left: best.r.id }); filled++; }
  }
  return filled;
}
// Liste de courses : ce qui manque pour les repas prévus (non cuisinés), moins le stock
function shoppingNeeds() {
  const need = {};
  for (const { sl } of plannedFuture()) {
    const r = recipeById(sl.r); if (!r) continue;
    for (const x of r.ings) { const i = ingOf(x.ing); if (i.base || x.opt) continue; need[x.ing] = (need[x.ing] || 0) + x.q * sl.n; }
  }
  const out = [];
  for (const [id, q] of Object.entries(need)) {
    const miss = q - available(id);
    if (miss > 1e-6) out.push({ key: 'i:' + id, ing: id, qty: miss, ray: rayonOf(id) });
  }
  return out;
}
const lowStock = () => S.stock.filter(it => !it.dish && it.full && levelOf(it) <= 0.2 && !ingOf(it.ing).base);
const roundBuy = (id, q) => { const i = ingOf(id); if (i.unit === 'pc') return Math.ceil(q - 1e-6); if (i.pw && i.pw <= 400) return Math.ceil(q / i.pw - 1e-6) * i.pw; return Math.ceil(q / 50) * 50; };

/* ============================== 6. ÉCRANS ============================== */
const ICONS = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  plan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  recipes: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M8 7c0-1.5 1-2 1-3M12 7c0-1.5 1-2 1-3M16 7c0-1.5 1-2 1-3"/>',
  stock: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 10h14M9 6v1M9 13v3"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};
const TABS = [['home', 'Accueil'], ['plan', 'Planning'], ['recipes', 'Recettes'], ['stock', 'Stock'], ['profile', 'Profil']];
const svgI = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>`;

function render() {
  buildIng(); PORTION = null;
  $('tabs').innerHTML = `<div class="in">${TABS.map(([k, l]) => `<button data-tab="${k}" class="${UI.tab === k ? 'on' : ''}">${svgI(k)}${l}</button>`).join('')}</div>`;
  $('title').textContent = { home: helloText(), plan: 'Planning', recipes: 'Recettes', stock: 'Mon stock', profile: 'Profil' }[UI.tab];
  $('view').innerHTML = { home: viewHome, plan: viewPlan, recipes: viewRecipes, stock: viewStock, profile: viewProfile }[UI.tab]();
  $('fab').hidden = UI.tab !== 'home';
}
const helloText = () => { const h = new Date().getHours(); return h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir'; };

// --- Briques communes ---
const tile = (emo, cls = '') => `<span class="tile ${cls}">${emo}</span>`;
function ring(v, max, size = 112) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r, pct = Math.min(1, max ? v / max : 0), over = v > max;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--soft)" stroke-width="12"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${over ? 'var(--bad)' : 'var(--kcal)'}" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
function recipeCard(r, st, { cta = true, wide = false } = {}) {
  const status = st.ok ? '<span class="badge ok">✓ Prêt</span>' : st.missing.length === 1 ? `<span class="badge warn">Manque ${esc(st.missing[0].i.name.split(' (')[0].toLowerCase())}</span>` : `<span class="badge">${st.missing.length} manquants</span>`;
  return `<div class="rc ${wide ? 'wide' : ''}" style="--h:${hueOf(r.id)}" data-act="open-recipe" data-id="${esc(r.id)}">
    <div class="hero">${remoOf(r)}${S.favs[r.id] ? '<span class="fav">♥</span>' : ''}</div>
    <div class="rc-b"><div class="rc-t">${esc(r.name)}</div>
      <div class="rc-m">⏱ ${r.time} min · ${r0(st.n.kcal)} kcal · <b>${r0(st.n.p)} g</b> prot.</div>
      <div class="rc-s">${status}</div>
      ${cta && st.ok ? `<button class="btn pri sm full" data-act="quick-cook" data-id="${esc(r.id)}" style="margin-top:8px">Cuisiner</button>` : ''}
    </div></div>`;
}

/* ----- Accueil ----- */
function viewHome() {
  const { t } = targets(), tot = dayTotals(UI.day), left = t.kcal - tot.kcal, isToday = UI.day === today();
  const macro = (k, lbl, col) => { const pc = Math.min(100, t[k] ? tot[k] / t[k] * 100 : 0); return `<div class="mac">
    <div class="row"><span class="k grow">${lbl}</span><span class="n">${r0(tot[k])}<span class="mute">/${t[k]} g</span></span></div>
    <div class="bar"><i style="width:${pc}%;background:${col}"></i></div></div>`; };
  let h = `<div class="daynav">
    <button class="icon-btn" data-act="day" data-n="-1" aria-label="Jour précédent">‹</button>
    <div class="t">${esc(cap(dayLabel(UI.day)))}${isToday ? '' : ` <button class="link" data-act="day-today">revenir à aujourd'hui</button>`}</div>
    <button class="icon-btn" data-act="day" data-n="1" aria-label="Jour suivant">›</button></div>
  <div class="card summary">
    <div class="ring-wrap">${ring(tot.kcal, t.kcal)}<div class="ring-c"><b>${fr(r0(Math.abs(left)))}</b><span>${left >= 0 ? 'kcal restantes' : 'kcal en trop'}</span></div></div>
    <div class="grow">
      <div class="small mute" style="margin-bottom:6px"><b class="num" style="color:var(--ink)">${fr(r0(tot.kcal))}</b> / ${fr(t.kcal)} kcal</div>
      ${macro('p', 'Protéines', 'var(--p)')}${macro('g', 'Glucides', 'var(--g)')}${macro('l', 'Lipides', 'var(--l)')}
    </div></div>`;
  // Menu prévu
  const slots = planSlots().map(([s, lbl, emo]) => ({ s, lbl, emo, sl: slotOf(UI.day, s) })).filter(x => x.sl);
  if (slots.length) h += `<div class="sec-h"><h2>Au menu</h2><button class="link" data-act="tab" data-tab="plan">Planning ›</button></div>
    <div class="card">${slots.map(x => planRow(UI.day, x.s, x.lbl, x.sl)).join('')}</div>`;
  else if (isToday) h += `<div class="card cta-card" data-act="tab" data-tab="plan"><span class="tile">🗓️</span><div class="grow"><b>Rien de prévu aujourd'hui</b><div class="small mute">Prépare tes repas de la semaine en un clic</div></div><span class="chev">›</span></div>`;
  // Boîtes
  const boxes = S.stock.filter(it => it.dish);
  if (boxes.length) h += `<div class="sec-h"><h2>🥡 Mes boîtes</h2></div><div class="carousel">${boxes.map(b => `
    <div class="box-c"><div class="row" style="gap:8px">${tile(b.dish.rid ? remoOf(recipeById(b.dish.rid) || {}) : '🥡')}<div class="grow"><b class="clamp2">${esc(b.dish.name)}</b></div></div>
      <div class="tiny mute" style="margin:6px 0">${fr(b.qty)} portion${b.qty > 1 ? 's' : ''} · ${b.dish.n.kcal} kcal</div>
      <button class="btn sm full" data-act="eat-box" data-id="${b.id}">J'en mange une</button></div>`).join('')}</div>`;
  // Suggestions
  if (isToday) {
    const meal = currentMeal(), sug = suggest(meal), ready = sug.filter(x => x.st.ok);
    h += `<div class="sec-h"><h2>Idées pour ${meal === 'pdj' ? 'le petit-déj' : meal === 'dej' ? 'ce midi' : meal === 'diner' ? 'ce soir' : 'une collation'}</h2><button class="link" data-act="tab" data-tab="recipes">Tout voir ›</button></div>`;
    if (!S.stock.length) h += `<div class="card cta-card" data-act="tab" data-tab="stock"><span class="tile">🧊</span><div class="grow"><b>Remplis ton stock</b><div class="small mute">Importe ton ticket Super U ou ajoute tes ingrédients : les idées de recettes apparaîtront ici</div></div><span class="chev">›</span></div>`;
    else h += `<div class="carousel">${(ready.length >= 3 ? ready : sug).slice(0, 8).map(x => recipeCard(x.r, x.st)).join('')}</div>`;
  }
  // Journal
  const entries = S.days[UI.day] || [];
  h += `<div class="sec-h"><h2>Journal</h2><button class="link" data-act="add-entry">+ Ajouter</button></div>`;
  if (!entries.length) h += `<div class="card empty small">Rien de noté ${isToday ? "aujourd'hui" : 'ce jour-là'}. Appuie sur <b>+</b> pour ajouter ce que tu as mangé.</div>`;
  for (const [m, lbl, emo] of MEALS) {
    const list = entries.filter(e => e.meal === m); if (!list.length) continue;
    const s = list.reduce((a, e) => addN(a, e), ZERO());
    h += `<div class="card tight"><div class="row meal-h"><span>${emo}</span><b class="grow">${lbl}</b><span class="small mute num">${r0(s.kcal)} kcal</span></div>
    ${list.map(e => `<div class="entry"><div class="grow">${esc(e.name)}<div class="tiny mute num">${r0(e.kcal)} kcal · P ${r0(e.p)} · G ${r0(e.g)} · L ${r0(e.l)}</div></div>
      <button class="icon-btn ghost" data-act="del-entry" data-id="${e.id}" aria-label="Supprimer">×</button></div>`).join('')}</div>`;
  }
  return h;
}

/* ----- Planning ----- */
function planRow(day, s, lbl, sl) {
  const label = `<span class="slot-l">${lbl}</span>`;
  if (!sl) return `<div class="slot">${label}<button class="slot-empty" data-act="slot" data-day="${day}" data-s="${s}">${slotPast(day, s) ? '—' : '+ Choisir'}</button></div>`;
  if (sl.out) return `<div class="slot" data-act="slot" data-day="${day}" data-s="${s}">${label}${tile('🍴')}<div class="grow"><b>${esc(sl.out)}</b><div class="tiny mute">Repas à l'extérieur</div></div><span class="chev">›</span></div>`;
  const r = recipeById(sl.r || sl.left);
  if (!r) return `<div class="slot" data-act="slot" data-day="${day}" data-s="${s}">${label}<div class="grow mute">Recette supprimée</div></div>`;
  let sub, st;
  if (sl.left) sub = `🥡 Restes de la veille · ${r0(recipeState(r, 1).n.kcal)} kcal`;
  else { st = recipeState(r, sl.n); sub = `${sl.n} portion${sl.n > 1 ? 's' : ''} · ${r0(st.n.kcal)} kcal · ${r.time} min`; }
  const status = sl.done ? '<span class="badge ok">✓ Fait</span>' : sl.left ? '' : st.ok ? '<span class="badge ok">Prêt</span>' : `<span class="badge warn">Manque ${st.missing.length}</span>`;
  return `<div class="slot ${sl.done ? 'done' : ''}" data-act="slot" data-day="${day}" data-s="${s}">${label}<span class="tile sm" style="--h:${hueOf(r.id)}">${remoOf(r)}</span>
    <div class="grow"><b class="clamp1">${esc(r.name)}</b><div class="tiny mute">${sub}</div></div>${status}</div>`;
}
function viewPlan() {
  const days = weekDays(), seg = `<div class="seg" style="margin-bottom:12px">
    <button class="${UI.planView === 'week' ? 'on' : ''}" data-act="plan-view" data-v="week">🗓️ Semaine</button>
    <button class="${UI.planView === 'shop' ? 'on' : ''}" data-act="plan-view" data-v="shop">🛒 Courses${shoppingCount() ? ` <span class="pill">${shoppingCount()}</span>` : ''}</button></div>`;
  if (UI.planView === 'shop') return seg + viewShop();
  const { t } = targets(), first = keyDate(days[0]), last = keyDate(days[6]);
  const fmt = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  let h = seg + `<div class="daynav">
    <button class="icon-btn" data-act="week" data-n="-1" ${UI.week <= -2 ? 'disabled' : ''}>‹</button>
    <div class="t">${UI.week === 0 ? 'Les 7 prochains jours' : `${fmt(first)} – ${fmt(last)}`}<div class="tiny mute">${UI.week === 0 ? `${fmt(first)} – ${fmt(last)}` : ''}</div></div>
    <button class="icon-btn" data-act="week" data-n="1" ${UI.week >= 3 ? 'disabled' : ''}>›</button></div>
  <div class="row" style="gap:8px;margin-bottom:12px">
    <button class="btn pri grow" data-act="autofill">✨ Remplir automatiquement</button>
    <button class="btn" data-act="clear-week" aria-label="Vider la semaine">Vider</button></div>`;
  for (const day of days) {
    const kc = planSlots().reduce((s, [k]) => s + slotNutr(slotOf(day, k)).kcal, 0);
    h += `<div class="card tight day-card ${day === today() ? 'is-today' : ''}"><div class="row day-h"><b class="grow">${esc(cap(dayLabel(day, false)))}</b>
      ${kc ? `<span class="tiny mute num">≈ ${fr(r0(kc))} kcal prévues${t.kcal ? ` / ${fr(t.kcal)}` : ''}</span>` : ''}</div>
      ${planSlots().map(([s, lbl]) => planRow(day, s, lbl, slotOf(day, s))).join('')}</div>`;
  }
  h += `<p class="tiny mute center">Le remplissage automatique choisit des recettes faisables avec ton stock, varie les plats${S.profile.batch ? ' et cuisine une portion de plus le soir pour le lendemain midi' : ''}. Réglages dans Profil.</p>`;
  return h;
}
const shoppingCount = () => shoppingNeeds().filter(x => !S.shop.checked[x.key]).length + S.shop.extra.filter(x => !S.shop.checked['x:' + x.id]).length;
function viewShop() {
  const needs = shoppingNeeds(), extra = S.shop.extra, low = lowStock().filter(it => !extra.some(x => x.ing === it.ing) && !needs.some(n => n.ing === it.ing));
  const items = needs.map(n => ({ key: n.key, ray: n.ray, emo: emoOf(n.ing), name: ingOf(n.ing).name, qty: fmtQty(n.ing, roundBuy(n.ing, n.qty)), why: 'pour le planning' }))
    .concat(extra.map(x => ({ key: 'x:' + x.id, ray: x.ing ? rayonOf(x.ing) : 'au', emo: x.ing ? emoOf(x.ing) : '🛒', name: x.name, qty: x.qty ? fmtQty(x.ing, x.qty) : '', why: '', del: x.id })));
  let h = `<div class="row" style="gap:8px;margin-bottom:12px">
    <input type="text" id="shop-add" placeholder="Ajouter un article (ex. lessive, pain…)">
    <button class="btn pri" data-act="shop-add" style="flex:none">Ajouter</button></div>`;
  if (!items.length) h += `<div class="card empty">Ta liste est vide.<br><span class="small">Planifie des repas : ce qui manque s'ajoutera ici tout seul.</span></div>`;
  for (const [rk, rl, re] of RAYONS) {
    const list = items.filter(x => x.ray === rk); if (!list.length) continue;
    h += `<div class="card tight"><div class="row meal-h"><span>${re}</span><b class="grow">${rl}</b></div>${list.map(x => `
      <label class="shop-i ${S.shop.checked[x.key] ? 'checked' : ''}"><input type="checkbox" data-act="shop-check" data-key="${esc(x.key)}" ${S.shop.checked[x.key] ? 'checked' : ''}>
        ${tile(x.emo, 'sm')}<div class="grow"><span class="nm">${esc(x.name)}</span>${x.why ? `<div class="tiny mute">${x.why}</div>` : ''}</div>
        <span class="small num">${x.qty}</span>${x.del ? `<button class="icon-btn ghost" data-act="shop-del" data-id="${x.del}" aria-label="Retirer">×</button>` : ''}</label>`).join('')}</div>`;
  }
  if (low.length) h += `<div class="sec-h"><h2>Bientôt fini</h2></div><div class="card tight">${low.map(it => `
    <div class="shop-i">${tile(emoOf(it.ing), 'sm')}<div class="grow">${esc(ingOf(it.ing).name)}<div class="tiny mute">reste ${fmtQty(it.ing, it.qty)}</div></div>
    <button class="btn sm" data-act="shop-low" data-ing="${esc(it.ing)}">+ Liste</button></div>`).join('')}</div>`;
  if (items.length) h += `<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:4px">
    <button class="btn grow" data-act="shop-copy">📋 Copier la liste</button>
    <button class="btn grow" data-act="shop-done">✓ Courses faites</button></div>
    <p class="tiny mute center">« Courses faites » ajoute les articles cochés au stock. Pour des quantités exactes, importe plutôt ton ticket Super U.</p>`;
  return h;
}

/* ----- Recettes ----- */
function viewRecipes() {
  const persons = UI.persons ?? S.profile.persons ?? 1, q = norm(UI.rSearch), f = UI.rType;
  let list = allRecipes().map(r => ({ r, st: recipeState(r, persons) }));
  list = list.filter(({ r, st }) => (!q || norm(r.name).includes(q) || r.ings.some(x => norm(ingOf(x.ing).name).includes(q)))
    && (f === 'all' || f === r.type || (f === 'fav' && S.favs[r.id]) || (f === 'fast' && r.time <= 20) || (f === 'prot' && st.n.p >= 30) || (f === 'mine' && r.mine) || (f === 'boite' && r.boite)));
  list.sort((a, b) => b.st.ratio - a.st.ratio || (S.favs[b.r.id] ? 1 : 0) - (S.favs[a.r.id] ? 1 : 0) || b.st.n.p - a.st.n.p);
  const ready = list.filter(x => x.st.ok), near = list.filter(x => x.st.missing.length === 1), rest = list.filter(x => x.st.missing.length > 1);
  const chips = [['all', 'Tout'], ['plat', '🍽️ Plats'], ['pdj', '☀️ Petit-déj'], ['collation', '🍎 Collations'], ['fav', '♥ Favoris'], ['fast', '⚡ Rapide'], ['prot', '💪 Protéiné'], ['boite', '🥡 Boîtes'], ['mine', '👤 Mes recettes']];
  let h = `<div class="row" style="margin-bottom:10px;gap:8px">
    <input type="search" id="r-search" placeholder="Recette ou ingrédient…" value="${esc(UI.rSearch)}">
    <div class="persons" title="Nombre de personnes"><button data-act="persons" data-d="-1" aria-label="Moins">−</button><span>👤 ${persons}</span><button data-act="persons" data-d="1" aria-label="Plus">+</button></div></div>
  <div class="chips">${chips.map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="rtype" data-f="${k}">${l}</button>`).join('')}</div>`;
  const sec = (title, sub, arr) => arr.length ? `<div class="sec-h"><h2>${title} <span class="count">${arr.length}</span></h2></div>${sub ? `<p class="small mute" style="margin:-4px 0 8px">${sub}</p>` : ''}<div class="rgrid">${arr.map(x => recipeCard(x.r, x.st)).join('')}</div>` : '';
  if (!list.length) h += `<div class="empty">Aucune recette ne correspond.</div>`;
  h += sec('Prêtes à cuisiner', 'Tu as tout ce qu\'il faut', ready) + sec('Il manque un ingrédient', '', near) + sec('Autres recettes', '', rest);
  h += `<button class="btn full" data-act="new-recipe" style="margin-top:16px">+ Créer ma recette</button>`;
  return h;
}

/* ----- Stock ----- */
function viewStock() {
  const q = norm(UI.sSearch), pf = UI.sPlace;
  const nameOf = it => it.dish ? it.dish.name : ingOf(it.ing).name;
  const all = S.stock.filter(it => !q || norm(nameOf(it)).includes(q));
  const count = p => all.filter(it => p === 'all' || it.place === p).length;
  let h = `<div class="row" style="gap:8px;margin-bottom:10px">
    <button class="btn pri grow" data-act="add-stock">+ Ajouter</button>
    <button class="btn grow" data-act="import-ticket">📄 Ticket Super U</button></div>
  <input type="search" id="s-search" placeholder="Chercher dans mon stock…" value="${esc(UI.sSearch)}" style="margin-bottom:10px">
  <div class="chips">${[['all', 'Tout', '📦']].concat(PLACES).map(([k, l, e]) => `<button class="chip ${pf === k ? 'on' : ''}" data-act="splace" data-p="${k}">${e} ${l} <span class="cnt">${count(k)}</span></button>`).join('')}</div>`;
  if (!S.stock.length) return h + `<div class="card empty"><div style="font-size:40px">🧺</div><b>Ton stock est vide</b><p class="small mute">Importe ton dernier ticket Super U, ou ajoute à la main ce que tu as dans le frigo, le congélateur et le placard.</p>
    <button class="btn pri" data-act="import-ticket">📄 Importer un ticket</button></div>`;
  for (const [pl, lbl, emo] of PLACES) {
    if (pf !== 'all' && pf !== pl) continue;
    const list = all.filter(it => it.place === pl).sort((a, b) => (a.dish ? 0 : 1) - (b.dish ? 0 : 1) || nameOf(a).localeCompare(nameOf(b), 'fr'));
    if (!list.length) continue;
    h += `<div class="sec-h"><h2>${emo} ${lbl} <span class="count">${list.length}</span></h2></div><div class="card tight">${list.map(it => stockRow(it)).join('')}</div>`;
  }
  if (!all.length) h += `<div class="empty">Rien ne correspond à « ${esc(UI.sSearch)} ».</div>`;
  return h;
}
function stockRow(it) {
  if (it.dish) return `<div class="srow"><div class="srow-m" data-act="edit-stock" data-id="${it.id}">${tile('🥡')}<div class="grow"><div class="nm">${esc(it.dish.name)}</div>
    <div class="qty"><b>${fr(it.qty)} portion${it.qty > 1 ? 's' : ''}</b> <span class="mute">en boîte</span></div></div></div>
    <button class="icon-btn" data-act="qty" data-id="${it.id}" data-d="-1" aria-label="Retirer une portion">−</button></div>`;
  const p = qtyParts(it.ing, it.qty), lv = levelOf(it), col = lv <= 0.2 ? 'var(--bad)' : lv <= 0.45 ? 'var(--warn)' : 'var(--ok)';
  return `<div class="srow"><div class="srow-m" data-act="edit-stock" data-id="${it.id}">${tile(emoOf(it.ing))}<div class="grow">
      <div class="nm">${esc(ingOf(it.ing).name)}</div>
      <div class="qty"><b>${p.big}</b>${p.small ? ` <span class="mute">· ${p.small}</span>` : ''}</div>
      <div class="level"><i style="width:${r0(lv * 100)}%;background:${col}"></i></div></div></div>
    <div class="stepper2"><button data-act="qty" data-id="${it.id}" data-d="-1" aria-label="Retirer ${esc(stepLabel(it))}">−</button><button data-act="qty" data-id="${it.id}" data-d="1" aria-label="Ajouter ${esc(stepLabel(it))}">+</button></div></div>`;
}

/* ----- Profil ----- */
function viewProfile() {
  const p = S.profile, T = targets(), t = T.t;
  return `<div class="card">
    <h3>🧍 Mon profil</h3>
    <div class="grid2">
      <div><label class="f">Sexe</label><div class="seg">${[['h', 'Homme'], ['f', 'Femme']].map(([k, l]) => `<button class="${p.sex === k ? 'on' : ''}" data-act="pf-seg" data-k="sex" data-v="${k}">${l}</button>`).join('')}</div></div>
      <div><label class="f">Âge</label><input type="number" inputmode="numeric" data-pf="age" value="${p.age}"></div>
      <div><label class="f">Taille (cm)</label><input type="number" inputmode="numeric" data-pf="height" value="${p.height}"></div>
      <div><label class="f">Poids (kg)</label><input type="number" inputmode="decimal" step="0.1" data-pf="weight" value="${p.weight}"></div>
    </div>
    <label class="f">Activité</label>
    <select data-pf="activity">${ACTIVITIES.map(([v, l]) => `<option value="${v}" ${p.activity == v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label class="f">Objectif</label>
    <div class="goals">${Object.entries(GOALS).map(([k, [l, , , e]]) => `<button class="goal ${p.goal === k ? 'on' : ''}" data-act="pf-seg" data-k="goal" data-v="${k}"><span>${e}</span>${l}</button>`).join('')}</div>
  </div>
  <div class="card">
    <h3>🎯 Mes besoins par jour</h3>
    <div class="grid4 targets">
      ${[['kcal', 'kcal', 'var(--kcal)'], ['p', 'Protéines', 'var(--p)'], ['g', 'Glucides', 'var(--g)'], ['l', 'Lipides', 'var(--l)']].map(([k, l, c]) => `<div style="--c:${c}">
        <input type="number" inputmode="numeric" data-tg="${k}" value="${t[k]}" ${p.custom ? '' : 'disabled'}><div class="tiny mute">${l}${k === 'kcal' ? '' : ' (g)'}</div></div>`).join('')}
    </div>
    <label class="check"><input type="checkbox" data-act="custom-tg" ${p.custom ? 'checked' : ''}> Je fixe mes objectifs moi-même</label>
    <p class="tiny mute" style="margin:8px 0 0">Métabolisme de base ${fr(T.bmr)} kcal · dépense estimée ${fr(T.tdee)} kcal (Mifflin-St Jeor).</p>
  </div>
  <div class="card">
    <h3>🗓️ Repas & planning</h3>
    <label class="f">Nombre de personnes par défaut</label>
    <div class="persons big"><button data-act="pf-persons" data-d="-1">−</button><span>👤 ${p.persons}</span><button data-act="pf-persons" data-d="1">+</button></div>
    <label class="check"><input type="checkbox" data-act="pf-toggle" data-k="batch" ${p.batch ? 'checked' : ''}> Le soir, cuisiner une portion de plus pour le midi suivant 🥡</label>
    <label class="check"><input type="checkbox" data-act="pf-toggle" data-k="planPdj" ${p.planPdj ? 'checked' : ''}> Planifier aussi le petit-déjeuner</label>
  </div>
  <div class="card">
    <h3>🥕 Mes ingrédients</h3>
    <p class="small mute" style="margin:0 0 8px">Crée un ingrédient ou corrige les valeurs nutritionnelles d'après l'étiquette.</p>
    ${S.customIngs.map(i => `<div class="srow"><div class="srow-m" data-act="edit-ing" data-id="${esc(i.id)}">${tile(emoOf(i.id), 'sm')}<div class="grow"><div class="nm">${esc(ingOf(i.id).name)}</div><div class="tiny mute">${r0(ingOf(i.id).n.kcal)} kcal · P ${ingOf(i.id).n.p} g / 100 ${ingOf(i.id).unit === 'ml' ? 'ml' : 'g'}</div></div></div></div>`).join('')}
    <div class="row" style="gap:8px;margin-top:10px"><button class="btn sm" data-act="new-ing">+ Créer</button><button class="btn sm" data-act="pick-edit-ing">Corriger un ingrédient</button></div>
  </div>
  <div class="card">
    <h3>💾 Données</h3>
    <p class="small mute" style="margin:0 0 10px">${CLOUD ? `Connecté : ${esc(currentUser?.email || '')}. Synchronisé entre tes appareils.` : 'Mode local : données sur cet appareil.'}</p>
    <div class="row" style="gap:8px;flex-wrap:wrap">
      <button class="btn sm" data-act="export">Exporter</button>
      <label class="btn sm">Importer<input type="file" accept="application/json" id="import-file" hidden></label>
      ${CLOUD ? '<button class="btn sm danger" data-act="logout">Se déconnecter</button>' : ''}
    </div>
  </div>
  <p class="tiny mute center">Valeurs nutritionnelles : table Ciqual (ANSES), valeurs moyennes.</p>`;
}

/* ============================== 7. FICHES ============================== */
function openSheet(html, onMount) {
  const root = $('sheet-root'), had = !!root.firstChild;
  root.innerHTML = `<div class="backdrop ${had ? 'no-anim' : ''}"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  const bd = root.firstChild;
  bd.addEventListener('click', e => { if (e.target === bd) closeSheet(); });
  document.body.classList.add('locked');
  if (onMount) onMount(bd.querySelector('.sheet'));
}
function closeSheet() { $('sheet-root').innerHTML = ''; document.body.classList.remove('locked'); }
const sheetHead = (t, emo) => `<div class="sheet-h">${emo ? tile(emo) : ''}<h2>${esc(t)}</h2><button class="icon-btn ghost" data-act="close" aria-label="Fermer">×</button></div>`;

// --- Recherche d'un ingrédient ---
function ingPicker(sh, { onPick, filter = i => !i.base, showStock = false }) {
  const inp = sh.querySelector('.ip-search'), res = sh.querySelector('.results');
  const draw = () => {
    const q = norm(inp.value.trim());
    let list = allIngs().filter(filter).filter(i => !q || norm(i.name).includes(q));
    if (showStock && !q) list.sort((a, b) => (available(b.id) > 0) - (available(a.id) > 0));
    res.innerHTML = list.slice(0, 80).map(i => `<div class="res" data-id="${esc(i.id)}">${tile(emoOf(i.id), 'sm')}<div class="grow">${esc(i.name)}<div class="tiny mute">${showStock && available(i.id) ? '✓ en stock : ' + fmtQty(i.id, available(i.id)) : PLACE_NAME[i.place]}</div></div><span class="tiny mute">${r0(i.n.kcal)} kcal${i.unit === 'pc' ? '/pce' : '/100' + i.unit}</span></div>`).join('')
      + `<div class="res" data-new="1">${tile('➕', 'sm')}<div class="grow" style="color:var(--acc)">Créer « ${esc(inp.value.trim() || 'nouvel ingrédient')} »</div></div>`;
  };
  inp.addEventListener('input', draw);
  res.addEventListener('click', e => {
    const r = e.target.closest('.res'); if (!r) return;
    if (r.dataset.new) return sheetIngredient(null, inp.value.trim(), created => onPick(created.id));
    onPick(r.dataset.id);
  });
  draw(); if (matchMedia('(min-width: 640px)').matches) setTimeout(() => inp.focus(), 50);
}
function qtyField(id, val) {
  const i = ingOf(id), canPc = i.unit !== 'pc' && i.pw;
  return `<div class="row">
    <input type="number" inputmode="decimal" step="any" class="q-in big-in" value="${val ?? ''}" placeholder="${i.unit === 'pc' ? 'nombre' : 'quantité'}">
    ${canPc ? `<div class="seg" style="flex:none"><button class="on" data-u="base">${i.unit}</button><button data-u="pc">pièces</button></div>` : `<span class="mute" style="flex:none">${i.unit === 'pc' ? 'pièce(s)' : i.unit}</span>`}
  </div>${canPc ? `<div class="tiny mute" style="margin-top:4px">1 pièce ≈ ${i.pw} g</div>` : ''}`;
}
function readQty(sh, id) {
  const i = ingOf(id), v = num(sh.querySelector('.q-in').value), u = sh.querySelector('.seg button.on[data-u]');
  return u && u.dataset.u === 'pc' ? v * i.pw : v;
}
function wireSeg(sh) {
  sh.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !seg.contains(b) || b.dataset.act) return;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  }));
}
const placeSeg = cur => `<div class="seg" id="pl">${PLACES.map(([k, l, e]) => `<button data-p="${k}" class="${cur === k ? 'on' : ''}">${e} ${l}</button>`).join('')}</div>`;

// --- Stock : ajouter ---
function sheetAddStock() {
  openSheet(`${sheetHead('Ajouter au stock')}<input type="search" class="ip-search" placeholder="Poulet, pâtes, yaourt…"><div class="results"></div>`,
    sh => ingPicker(sh, { onPick: id => sheetStockQty(id), showStock: true }));
}
function sheetStockQty(id) {
  const i = ingOf(id);
  const presets = i.unit === 'pc' ? [1, 2, 4, 6, 10] : i.pw && i.pw <= 400 ? [1, 2, 4, 6].map(n => ['p', n]) : i.unit === 'ml' ? [250, 500, 1000, 2000] : [100, 250, 500, 1000];
  openSheet(`${sheetHead(i.name, emoOf(id))}
    <label class="f">Combien ?</label>
    <div class="chips wrap">${presets.map(p => Array.isArray(p) ? `<button class="chip" data-pre="${p[1]}" data-pu="pc">${p[1]} pièce${p[1] > 1 ? 's' : ''}</button>` : `<button class="chip" data-pre="${p}">${i.unit === 'pc' ? p : fmtQty(id, p)}</button>`).join('')}</div>
    ${qtyField(id)}
    <label class="f">Où ?</label>${placeSeg(i.place)}
    <div class="row" style="gap:8px;margin-top:16px"><button class="btn" data-act="add-stock">‹ Retour</button><button class="btn pri grow" id="ok">Ajouter au stock</button></div>`, sh => {
    wireSeg(sh);
    sh.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => {
      sh.querySelector('.q-in').value = b.dataset.pre;
      const u = sh.querySelector(`.seg button[data-u="${b.dataset.pu || 'base'}"]`); if (u) u.click();
    });
    const go = () => {
      const q = readQty(sh, id); if (q <= 0) return toast('Indique une quantité');
      addStock(id, q, sh.querySelector('#pl button.on').dataset.p); save(); render();
      toast(`${i.name} ajouté ✓`); sheetAddStock();
    };
    sh.querySelector('#ok').onclick = go;
    sh.querySelector('.q-in').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}
// --- Stock : ajuster (le plus pratique possible) ---
function sheetEditStock(id) {
  const it = S.stock.find(x => x.id === id); if (!it) return closeSheet();
  if (it.dish) return sheetEditBox(it);
  const i = ingOf(it.ing), p = qtyParts(it.ing, it.qty), step = stepOf(it), sl = stepLabel(it);
  const apply = (q, msg) => {
    const before = snapshot();
    it.qty = Math.max(0, q); S.stock = S.stock.filter(x => x.qty > 1e-6); save(); render();
    if (!S.stock.includes(it)) { closeSheet(); toast(`${i.name} : terminé`, () => { Object.assign(S, before); save(); render(); }); }
    else { sheetEditStock(id); if (msg) toast(msg); }
  };
  openSheet(`${sheetHead(i.name, emoOf(it.ing))}
    <div class="qty-hero"><b>${p.big}</b>${p.small ? `<span>${p.small}</span>` : ''}<div class="level lg"><i style="width:${r0(levelOf(it) * 100)}%"></i></div></div>
    <label class="f">J'en ai utilisé</label>
    <div class="quick">
      <button data-q="${step}">−${esc(sl.replace(/^1 /, '1 '))}</button>
      <button data-q="${step * 2}">−2 ${i.unit === 'pc' || (i.pw && i.pw <= 400) ? 'pièces' : 'portions'}</button>
      <button data-q="half">La moitié</button>
      <button data-q="all" class="danger">C'est fini</button>
    </div>
    <label class="f">Ou corriger : il en reste exactement</label>
    ${qtyField(it.ing, +(it.qty).toFixed(1))}
    <label class="f">Rangement</label>${placeSeg(it.place)}
    <div class="row" style="gap:8px;margin-top:16px"><button class="btn danger" id="del">Supprimer</button><button class="btn pri grow" id="ok">Enregistrer</button></div>`, sh => {
    wireSeg(sh);
    sh.querySelectorAll('.quick button').forEach(b => b.onclick = () => {
      const v = b.dataset.q;
      apply(v === 'all' ? 0 : v === 'half' ? it.qty / 2 : it.qty - +v, v === 'all' ? '' : 'Stock mis à jour');
    });
    sh.querySelector('#ok').onclick = () => {
      it.place = sh.querySelector('#pl button.on').dataset.p;
      const q = readQty(sh, it.ing); if (q > it.full) it.full = q;
      apply(q); closeSheet(); toast('Enregistré');
    };
    sh.querySelector('#del').onclick = () => apply(0);
  });
}
function sheetEditBox(it) {
  openSheet(`${sheetHead(it.dish.name, '🥡')}
    <div class="qty-hero"><b>${fr(it.qty)} portion${it.qty > 1 ? 's' : ''}</b><span>${it.dish.n.kcal} kcal · ${it.dish.n.p} g prot. par portion</span></div>
    <button class="btn pri full" data-act="eat-box" data-id="${it.id}">🍽️ J'en mange une</button>
    <label class="f">Portions restantes</label><input type="number" inputmode="decimal" class="q-in big-in" value="${it.qty}">
    <div class="row" style="gap:8px;margin-top:16px"><button class="btn danger" id="del">Jeter / supprimer</button><button class="btn grow" id="ok">Enregistrer</button></div>`, sh => {
    sh.querySelector('#ok').onclick = () => { it.qty = num(sh.querySelector('.q-in').value); S.stock = S.stock.filter(x => x.qty > 1e-6); save(); closeSheet(); render(); };
    sh.querySelector('#del').onclick = () => { S.stock = S.stock.filter(x => x !== it); save(); closeSheet(); render(); };
  });
}

// --- Créer / corriger un ingrédient ---
function sheetIngredient(id, presetName = '', onDone) {
  const base = id ? ingOf(id) : { name: presetName, unit: 'g', place: 'frigo', n: { kcal: '', p: '', g: '', l: '' } };
  const isBuiltin = id && INGREDIENTS.some(x => x.id === id), isCustom = id && S.customIngs.some(x => x.id === id);
  openSheet(`${sheetHead(id ? 'Modifier l\'ingrédient' : 'Nouvel ingrédient', id ? emoOf(id) : '🥕')}
    <label class="f">Nom</label><input type="text" id="i-name" value="${esc(base.name)}">
    <div class="grid2">
      <div><label class="f">Unité</label><select id="i-unit">${[['g', 'grammes'], ['ml', 'millilitres'], ['pc', 'pièces']].map(([k, l]) => `<option value="${k}" ${base.unit === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="f">Poids d'une pièce (g)</label><input type="number" inputmode="decimal" id="i-pw" value="${base.pw ?? ''}" placeholder="facultatif"></div>
    </div>
    <label class="f">Rangement habituel</label>
    <select id="i-place">${PLACES.map(([k, l]) => `<option value="${k}" ${base.place === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <label class="f">Valeurs pour 100 g / 100 ml (voir l'étiquette)</label>
    <div class="grid4">${[['kcal', 'kcal'], ['p', 'Prot.'], ['g', 'Gluc.'], ['l', 'Lip.']].map(([k, l]) => `<div><input type="number" inputmode="decimal" step="any" id="i-${k}" value="${base.n[k]}" placeholder="0"><div class="tiny mute center">${l}</div></div>`).join('')}</div>
    <label class="check"><input type="checkbox" id="i-base" ${base.base ? 'checked' : ''}> Ingrédient de base (toujours dispo, jamais déduit)</label>
    <div class="row" style="gap:8px;margin-top:16px">${isCustom ? `<button class="btn danger" id="del">${isBuiltin ? 'Valeurs d\'origine' : 'Supprimer'}</button>` : ''}<button class="btn pri grow" id="ok">Enregistrer</button></div>`, sh => {
    sh.querySelector('#ok').onclick = () => {
      const name = sh.querySelector('#i-name').value.trim(); if (!name) return toast('Donne un nom');
      const g = k => num(sh.querySelector('#i-' + k).value);
      const obj = { id: id || 'c_' + uid(), name, unit: sh.querySelector('#i-unit').value, place: sh.querySelector('#i-place').value,
        n: { kcal: g('kcal'), p: g('p'), g: g('g'), l: g('l') }, base: sh.querySelector('#i-base').checked };
      const pw = num(sh.querySelector('#i-pw').value); if (pw > 0) obj.pw = pw; else if (isBuiltin && base.pw) obj.pw = base.pw;
      if (isBuiltin && base.fam) obj.fam = base.fam;
      S.customIngs = S.customIngs.filter(x => x.id !== obj.id).concat(obj); buildIng(); save();
      toast('Ingrédient enregistré');
      if (onDone) onDone(obj); else { closeSheet(); render(); }
    };
    const del = sh.querySelector('#del');
    if (del) del.onclick = () => { S.customIngs = S.customIngs.filter(x => x.id !== id); buildIng(); save(); closeSheet(); render(); };
  });
}

// --- Recette ---
function sheetRecipe(id, persons) {
  const r = recipeById(id); if (!r) return;
  persons = persons ?? UI.persons ?? S.profile.persons ?? 1;
  const st = recipeState(r, persons), n = st.n, tot = n.p * 4 + n.g * 4 + n.l * 9 || 1;
  openSheet(`<div class="r-hero" style="--h:${hueOf(r.id)}"><span>${remoOf(r)}</span>
      <button class="icon-btn ghost r-close" data-act="close" aria-label="Fermer">×</button>
      <button class="icon-btn ghost r-fav ${S.favs[r.id] ? 'on' : ''}" data-act="fav" data-id="${esc(r.id)}" aria-label="Favori">${S.favs[r.id] ? '♥' : '♡'}</button></div>
    <h2 class="r-title">${esc(r.name)}</h2>
    <div class="chips wrap" style="margin-bottom:8px"><span class="badge">${RTYPES[r.type]}</span><span class="badge">⏱ ${r.time} min</span>${r.boite ? '<span class="badge">🥡 se garde en boîte</span>' : ''}${r.mine ? '<span class="badge">👤 ma recette</span>' : ''}</div>
    <div class="card macro-card">
      <div class="macro-big"><b>${r0(n.kcal)}</b><span>kcal / portion</span></div>
      <div class="grow">
        <div class="stack"><i style="width:${n.p * 4 / tot * 100}%;background:var(--p)"></i><i style="width:${n.g * 4 / tot * 100}%;background:var(--g)"></i><i style="width:${n.l * 9 / tot * 100}%;background:var(--l)"></i></div>
        <div class="row small" style="justify-content:space-between;margin-top:6px"><span><b style="color:var(--p)">${r0(n.p)} g</b> prot.</span><span><b style="color:var(--g)">${r0(n.g)} g</b> gluc.</span><span><b style="color:var(--l)">${r0(n.l)} g</b> lip.</span></div>
      </div></div>
    <div class="card">
      <div class="row" style="margin-bottom:6px"><h3 class="grow" style="margin:0">Ingrédients</h3>
        <div class="persons"><button id="pm" aria-label="Moins">−</button><span>👤 ${persons}</span><button id="pp" aria-label="Plus">+</button></div></div>
      ${st.lines.filter(l => !(l.base && l.q <= 3)).map(l => `<div class="ing-line ${l.base ? 'is-base' : ''}">
        ${tile(emoOf(l.ing), 'sm')}
        <div class="grow">${esc(l.i.name)}${l.opt ? ' <span class="tiny mute">facultatif</span>' : ''}
          ${!l.base && !l.ok ? `<div class="tiny" style="color:${l.opt ? 'var(--mute)' : 'var(--bad)'}">${l.av > 0 ? 'en stock : ' + fmtQty(l.ing, l.av) : 'pas en stock'}</div>` : ''}</div>
        <span class="small num">${fmtQty(l.ing, l.q)}</span>
        <span class="ico ${l.base ? 'base' : l.ok ? 'ok' : l.opt ? 'base' : 'no'}">${l.base ? '•' : l.ok ? '✓' : l.opt ? '–' : '✗'}</span></div>`).join('')}
      ${st.lines.some(l => l.base && l.q <= 3) ? `<div class="tiny mute" style="margin-top:6px">+ ${st.lines.filter(l => l.base && l.q <= 3).map(l => l.i.name.toLowerCase()).join(', ')}</div>` : ''}
    </div>
    <div class="card"><h3>Préparation</h3><ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      ${r.src ? `<p class="tiny mute" style="margin:8px 0 0">Recette adaptée de <a href="${esc(r.src)}" target="_blank" rel="noopener">${esc(new URL(r.src).hostname.replace('www.', ''))}</a></p>` : ''}</div>
    ${!st.ok ? `<div class="banner">Il manque : <b>${st.missing.map(m => esc(m.i.name)).join(', ')}</b>.
      <button class="link" data-act="add-missing" data-id="${esc(r.id)}" data-n="${persons}">Ajouter à la liste de courses</button></div>` : ''}
    <div class="sheet-actions">
      <button class="btn" data-act="plan-recipe" data-id="${esc(r.id)}" data-n="${persons}">🗓️ Planifier</button>
      <button class="btn pri grow" id="cook">🍳 Je cuisine</button></div>
    <div class="row center" style="gap:4px;margin-top:10px;justify-content:center">
      ${r.mine ? `<button class="link" data-act="edit-recipe" data-id="${esc(r.id)}">Modifier</button> · <button class="link danger" data-act="del-recipe" data-id="${esc(r.id)}">Supprimer</button>` : `<button class="link" data-act="copy-recipe" data-id="${esc(r.id)}">Créer ma version de cette recette</button>`}</div>`, sh => {
    sh.querySelector('#pm').onclick = () => sheetRecipe(id, Math.max(1, persons - 1));
    sh.querySelector('#pp').onclick = () => sheetRecipe(id, persons + 1);
    sh.querySelector('#cook').onclick = () => sheetCook(r, persons);
  });
}
// --- Cuisiner ---
function sheetCook(r, persons, plan) {
  let eat = Math.min(1, persons);
  const meal0 = plan ? plan.s : currentMeal();
  const draw = () => {
    const boxes = persons - eat, st = recipeState(r, persons);
    openSheet(`${sheetHead('Je cuisine', remoOf(r))}
      <p style="margin:0 0 12px"><b>${esc(r.name)}</b></p>
      <div class="card">
        <div class="row"><div class="grow">Portions cuisinées</div><div class="persons"><button id="nm">−</button><span>${persons}</span><button id="np">+</button></div></div>
        <div class="row" style="margin-top:10px"><div class="grow">Je mange maintenant</div><div class="persons"><button id="em">−</button><span>${eat}</span><button id="ep">+</button></div></div>
        ${boxes > 0 ? `<label class="check"><input type="checkbox" id="box" checked> Mettre ${boxes} portion${boxes > 1 ? 's' : ''} en boîte 🥡</label>
          <div class="tiny mute" style="margin-left:26px">Décoche si elles sont pour d'autres personnes.</div>` : ''}
        <label class="f">Repas</label>
        <div class="seg" id="meal">${MEALS.map(([k, l, e]) => `<button data-m="${k}" class="${k === meal0 ? 'on' : ''}" title="${l}">${e}</button>`).join('')}</div>
      </div>
      <div class="card tight"><div class="tiny mute" style="margin-bottom:4px">Retiré du stock</div>${st.lines.filter(l => !l.base && l.av > 0).map(l => `<div class="row small" style="padding:3px 0">${tile(emoOf(l.ing), 'xs')}<span class="grow">${esc(l.i.name)}</span><span class="num mute">−${fmtQty(l.ing, Math.min(l.q, l.av))}</span></div>`).join('') || '<div class="small mute">Rien (ingrédients de base seulement)</div>'}</div>
      <button class="btn pri full" id="go">Valider</button>`, sh => {
      wireSeg(sh);
      sh.querySelector('#nm').onclick = () => { persons = Math.max(1, persons - 1); eat = Math.min(eat, persons); draw(); };
      sh.querySelector('#np').onclick = () => { persons++; draw(); };
      sh.querySelector('#em').onclick = () => { eat = Math.max(0, eat - 1); draw(); };
      sh.querySelector('#ep').onclick = () => { eat = Math.min(persons, eat + 1); draw(); };
      sh.querySelector('#go').onclick = () => {
        const before = snapshot(), meal = sh.querySelector('#meal button.on').dataset.m, box = sh.querySelector('#box');
        for (const l of st.lines) if (!l.base && l.av > 0) deduct(l.ing, Math.min(l.q, l.av));
        const n = roundN(st.n), day = today(), ids = [];
        for (let k = 0; k < eat; k++) { const e = { id: uid(), meal, name: r.name, ...n, recipe: r.id }; ids.push(e.id); addEntry(day, e); }
        if (box && box.checked && boxes > 0) S.stock.push({ id: uid(), dish: { name: r.name, rid: r.id, n }, qty: boxes, place: 'frigo' });
        if (plan) { const sl = slotOf(plan.day, plan.s); if (sl) sl.done = true; }
        save(); closeSheet(); UI.day = day; UI.tab = 'home'; window.scrollTo(0, 0); render();
        toast('Bon appétit ! Stock mis à jour', () => { S.stock = before.stock; S.plan = before.plan; ids.forEach(x => removeEntry(day, x)); save(); render(); });
      };
    });
  };
  draw();
}
function sheetEatBox(id, plan) {
  const b = S.stock.find(x => x.id === id); if (!b) return;
  openSheet(`${sheetHead(b.dish.name, '🥡')}
    <p class="small mute" style="margin-top:0">1 portion : ${b.dish.n.kcal} kcal · P ${b.dish.n.p} g · G ${b.dish.n.g} g · L ${b.dish.n.l} g</p>
    <label class="f">Repas</label>
    <div class="seg" id="meal">${MEALS.map(([k, l, e]) => `<button data-m="${k}" class="${k === (plan ? plan.s : currentMeal()) ? 'on' : ''}">${e} ${l.split('-')[0]}</button>`).join('')}</div>
    <button class="btn pri full" id="ok" style="margin-top:16px">J'en mange une</button>`, sh => {
    wireSeg(sh);
    sh.querySelector('#ok').onclick = () => {
      addEntry(UI.day, { id: uid(), meal: sh.querySelector('#meal button.on').dataset.m, name: b.dish.name + ' (boîte)', ...b.dish.n, recipe: b.dish.rid });
      b.qty -= 1; S.stock = S.stock.filter(x => x.qty > 1e-6);
      if (plan) { const sl = slotOf(plan.day, plan.s); if (sl) sl.done = true; }
      save(); closeSheet(); render(); toast('Bon appétit !');
    };
  });
}

// --- Journal : ajouter ---
function sheetAddEntry(mode = 'stock') {
  const tabs = `<div class="seg" style="margin-bottom:12px">
    <button class="${mode === 'stock' ? 'on' : ''}" data-act="entry-mode" data-m="stock">🧊 De mon stock</button>
    <button class="${mode === 'food' ? 'on' : ''}" data-act="entry-mode" data-m="food">🔎 Aliment</button>
    <button class="${mode === 'free' ? 'on' : ''}" data-act="entry-mode" data-m="free">🍴 Resto…</button></div>`;
  if (mode === 'stock') {
    const items = S.stock.filter(it => !it.dish);
    const boxes = S.stock.filter(it => it.dish);
    openSheet(`${sheetHead('Ajouter un repas')}${tabs}
      ${boxes.map(b => `<div class="res" data-box="${b.id}">${tile('🥡', 'sm')}<div class="grow">${esc(b.dish.name)}<div class="tiny mute">boîte · ${b.dish.n.kcal} kcal / portion</div></div></div>`).join('')}
      <input type="search" class="ip-search" placeholder="Chercher dans mon stock"><div class="results"></div>`, sh => {
      sh.querySelectorAll('[data-box]').forEach(x => x.onclick = () => sheetEatBox(x.dataset.box));
      const inp = sh.querySelector('.ip-search'), res = sh.querySelector('.results');
      const draw = () => {
        const q = norm(inp.value);
        res.innerHTML = items.filter(it => !q || norm(ingOf(it.ing).name).includes(q)).sort((a, b) => ingOf(a.ing).name.localeCompare(ingOf(b.ing).name, 'fr'))
          .map(it => `<div class="res" data-id="${esc(it.ing)}">${tile(emoOf(it.ing), 'sm')}<div class="grow">${esc(ingOf(it.ing).name)}<div class="tiny mute">${fmtQty(it.ing, it.qty)}</div></div></div>`).join('')
          || '<div class="empty small">Rien dans ton stock.</div>';
      };
      inp.addEventListener('input', draw); draw();
      res.addEventListener('click', e => { const r = e.target.closest('.res'); if (r) sheetEntryQty(r.dataset.id); });
    });
  } else if (mode === 'food') {
    openSheet(`${sheetHead('Ajouter un repas')}${tabs}<input type="search" class="ip-search" placeholder="Chercher un aliment"><div class="results"></div>`,
      sh => ingPicker(sh, { onPick: id => sheetEntryQty(id), filter: () => true, showStock: true }));
  } else {
    openSheet(`${sheetHead('Ajouter un repas')}${tabs}
      <label class="f">Quoi ?</label><input type="text" id="e-name" placeholder="ex. Menu burger au resto">
      <label class="f">Repas</label><div class="seg" id="meal">${MEALS.map(([k, l, e]) => `<button data-m="${k}" class="${k === currentMeal() ? 'on' : ''}">${e}</button>`).join('')}</div>
      <label class="f">Estimation</label>
      <div class="chips wrap">${[['Snack', 300, 10, 35, 12], ['Sandwich', 500, 22, 55, 20], ['Burger frites', 1000, 35, 100, 50], ['Pizza', 900, 35, 100, 35], ['Kebab', 1000, 45, 90, 50], ['Sushis', 600, 25, 90, 12], ['Plat au resto', 800, 35, 70, 35]].map(x => `<button class="chip" data-pre='${JSON.stringify(x)}'>${x[0]}</button>`).join('')}</div>
      <div class="grid4">${[['kcal', 'kcal'], ['p', 'Prot. g'], ['g', 'Gluc. g'], ['l', 'Lip. g']].map(([k, l]) => `<div><input type="number" inputmode="decimal" id="e-${k}" placeholder="0"><div class="tiny mute center">${l}</div></div>`).join('')}</div>
      <button class="btn pri full" id="ok" style="margin-top:16px">Ajouter</button>`, sh => {
      wireSeg(sh);
      sh.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => {
        const [nm, k, p, g, l] = JSON.parse(b.dataset.pre);
        if (!sh.querySelector('#e-name').value) sh.querySelector('#e-name').value = nm;
        Object.entries({ kcal: k, p, g, l }).forEach(([f, v]) => sh.querySelector('#e-' + f).value = v);
      });
      sh.querySelector('#ok').onclick = () => {
        const name = sh.querySelector('#e-name').value.trim() || 'Repas', g = k => num(sh.querySelector('#e-' + k).value);
        addEntry(UI.day, { id: uid(), meal: sh.querySelector('#meal button.on').dataset.m, name, kcal: g('kcal'), p: g('p'), g: g('g'), l: g('l') });
        closeSheet(); render(); toast('Ajouté au journal');
      };
    });
  }
}
function sheetEntryQty(id) {
  const i = ingOf(id), av = i.base ? 0 : available(id), por = i.unit === 'pc' ? 1 : i.pw && i.pw <= 400 ? i.pw : portionOf(id);
  openSheet(`${sheetHead(i.name, emoOf(id))}
    <label class="f">Quantité</label>
    <div class="chips wrap">${[0.5, 1, 2].map(k => `<button class="chip" data-pre="${+(por * k).toFixed(1)}">${fmtQty(id, por * k)}</button>`).join('')}</div>
    ${qtyField(id, por)}
    <label class="f">Repas</label><div class="seg" id="meal">${MEALS.map(([k, l, e]) => `<button data-m="${k}" class="${k === currentMeal() ? 'on' : ''}">${e}</button>`).join('')}</div>
    <div id="prev" class="card tight small num center" style="margin-top:12px"></div>
    ${av > 0 ? `<label class="check"><input type="checkbox" id="ded" checked> Retirer de mon stock (j'en ai ${fmtQty(id, av)})</label>` : ''}
    <button class="btn pri full" id="ok" style="margin-top:12px">Ajouter</button>`, sh => {
    wireSeg(sh);
    const prev = () => { const q = readQty(sh, id), n = nutrOf(id, q); sh.querySelector('#prev').innerHTML = q > 0 ? `<b>${r0(n.kcal)} kcal</b> · P ${r0(n.p)} g · G ${r0(n.g)} g · L ${r0(n.l)} g` : '—'; };
    sh.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => { sh.querySelector('.q-in').value = b.dataset.pre; const u = sh.querySelector('.seg button[data-u="base"]'); if (u) u.click(); prev(); });
    sh.addEventListener('input', prev); sh.addEventListener('click', prev); prev();
    sh.querySelector('#ok').onclick = () => {
      const q = readQty(sh, id); if (q <= 0) return toast('Indique une quantité');
      const n = nutrOf(id, q), ded = sh.querySelector('#ded');
      addEntry(UI.day, { id: uid(), meal: sh.querySelector('#meal button.on').dataset.m, name: `${i.name} (${fmtQty(id, q)})`, ...roundN(n) });
      if (ded && ded.checked) { deduct(id, Math.min(q, av)); save(); }
      closeSheet(); render(); toast('Ajouté au journal');
    };
  });
}

// --- Planning : un créneau ---
function sheetSlot(day, s) {
  const sl = slotOf(day, s), lbl = planSlots().find(x => x[0] === s)?.[1] || MEAL_NAME[s];
  const title = `${cap(dayLabel(day, false))} · ${lbl}`;
  if (sl && (sl.r || sl.left || sl.out)) {
    const r = recipeById(sl.r || sl.left);
    const box = sl.left && S.stock.find(b => b.dish && b.dish.rid === sl.left);
    return openSheet(`${sheetHead(title)}
      ${r ? `<div class="card cta-card" data-act="open-recipe" data-id="${esc(r.id)}" data-n="${sl.n || 1}"><span class="tile" style="--h:${hueOf(r.id)}">${remoOf(r)}</span><div class="grow"><b>${esc(r.name)}</b><div class="small mute">${sl.left ? 'Restes de la veille' : `${sl.n} portion${sl.n > 1 ? 's' : ''}`} · voir la recette</div></div><span class="chev">›</span></div>` : `<div class="card"><b>${esc(sl.out || '')}</b></div>`}
      ${sl.r && !sl.done ? `<div class="row" style="margin-bottom:12px"><div class="grow">Portions à cuisiner</div><div class="persons"><button data-act="slot-n" data-day="${day}" data-s="${s}" data-d="-1">−</button><span>${sl.n}</span><button data-act="slot-n" data-day="${day}" data-s="${s}" data-d="1">+</button></div></div>` : ''}
      <div class="list-actions">
        ${sl.r && !sl.done ? `<button class="btn pri full" data-act="slot-cook" data-day="${day}" data-s="${s}">🍳 Je le cuisine maintenant</button>` : ''}
        ${sl.left && !sl.done ? (box ? `<button class="btn pri full" data-act="slot-eatbox" data-day="${day}" data-s="${s}" data-id="${box.id}">🥡 Manger la boîte</button>` : '<p class="small mute">La boîte sera disponible après avoir cuisiné le plat la veille.</p>') : ''}
        <button class="btn full" data-act="slot-change" data-day="${day}" data-s="${s}">🔄 Changer</button>
        ${!sl.done ? `<button class="btn full" data-act="slot-done" data-day="${day}" data-s="${s}">✓ Marquer comme fait</button>` : ''}
        <button class="btn full danger" data-act="slot-clear" data-day="${day}" data-s="${s}">Retirer du planning</button>
      </div>`);
  }
  sheetSlotPick(day, s);
}
function sheetSlotPick(day, s, q = '') {
  const title = `${cap(dayLabel(day, false))} · ${planSlots().find(x => x[0] === s)?.[1] || MEAL_NAME[s]}`;
  const persons = S.profile.persons || 1, types = s === 'pdj' ? ['pdj'] : ['plat', 'collation'];
  // Stock « réservé » par les repas déjà planifiés
  const sim = JSON.parse(JSON.stringify(S.stock.filter(it => !it.dish)));
  for (const p of plannedFuture()) { if (p.day === day && p.s === s) continue; const r = recipeById(p.sl.r); if (r) for (const l of recipeState(r, p.sl.n, sim).lines) if (!l.base && l.av > 0) deduct(l.ing, Math.min(l.q, l.av), sim); }
  const list = allRecipes().filter(r => types.includes(r.type)).map(r => ({ r, st: recipeState(r, persons, sim) }))
    .sort((a, b) => b.st.ratio - a.st.ratio || (S.favs[b.r.id] ? 1 : 0) - (S.favs[a.r.id] ? 1 : 0) || b.st.n.p - a.st.n.p);
  const boxes = S.stock.filter(b => b.dish);
  openSheet(`${sheetHead(title)}
    <input type="search" class="ip-search" id="sp-q" placeholder="Chercher une recette" value="${esc(q)}">
    <div class="results" id="sp-res"></div>
    <div class="row" style="gap:8px;margin-top:10px">${boxes.length ? `<button class="btn grow" id="sp-box">🥡 Une boîte</button>` : ''}<button class="btn grow" id="sp-out">🍴 Repas dehors</button></div>`, sh => {
    const draw = () => {
      const qq = norm(sh.querySelector('#sp-q').value);
      sh.querySelector('#sp-res').innerHTML = list.filter(x => !qq || norm(x.r.name).includes(qq)).map(({ r, st }) => `
        <div class="res" data-rid="${esc(r.id)}"><span class="tile sm" style="--h:${hueOf(r.id)}">${remoOf(r)}</span>
          <div class="grow"><b>${esc(r.name)}</b>${S.favs[r.id] ? ' <span style="color:var(--bad)">♥</span>' : ''}<div class="tiny mute">${r0(st.n.kcal)} kcal · ${r0(st.n.p)} g prot. · ${r.time} min</div></div>
          ${st.ok ? '<span class="badge ok">Prêt</span>' : `<span class="badge ${st.missing.length === 1 ? 'warn' : ''}">−${st.missing.length}</span>`}</div>`).join('');
    };
    sh.querySelector('#sp-q').addEventListener('input', draw); draw();
    sh.querySelector('#sp-res').addEventListener('click', e => {
      const x = e.target.closest('[data-rid]'); if (!x) return;
      const r = recipeById(x.dataset.rid), nextDay = shiftDay(day, 1);
      const batch = s === 'diner' && S.profile.batch && r.boite && !slotOf(nextDay, 'dej');
      setSlot(day, s, { r: r.id, n: persons + (batch ? 1 : 0) });
      if (batch) setSlot(nextDay, 'dej', { left: r.id });
      save(); closeSheet(); render(); toast(batch ? `${r.name} prévu, + restes pour demain midi 🥡` : `${r.name} prévu ✓`);
    });
    const ob = sh.querySelector('#sp-box');
    if (ob) ob.onclick = () => { const b = boxes[0]; setSlot(day, s, { left: b.dish.rid || '', out: b.dish.rid ? undefined : b.dish.name }); save(); closeSheet(); render(); };
    sh.querySelector('#sp-out').onclick = () => { const t = prompt('Où / quoi ?', 'Resto'); if (t === null) return; setSlot(day, s, { out: t || 'Repas dehors' }); save(); closeSheet(); render(); };
  });
}
function sheetPlanRecipe(id, n) {
  const r = recipeById(id), days = Array.from({ length: 14 }, (_, k) => shiftDay(today(), k));
  let day = days.find(d => planSlots().some(([s]) => !slotOf(d, s) && !slotPast(d, s))) || days[0];
  let s = planSlots().find(([k]) => !slotOf(day, k) && !slotPast(day, k))?.[0] || 'diner';
  const draw = () => openSheet(`${sheetHead('Planifier', remoOf(r))}
    <p style="margin:0 0 10px"><b>${esc(r.name)}</b> · ${n} portion${n > 1 ? 's' : ''}</p>
    <label class="f">Quel jour ?</label>
    <div class="chips">${days.map(d => `<button class="chip ${d === day ? 'on' : ''}" data-d="${d}">${esc(cap(dayLabel(d, false)).replace(/^(\w+)\.?\s/, (m, w) => w.slice(0, 3) + '. '))}</button>`).join('')}</div>
    <label class="f">Quel repas ?</label>
    <div class="seg" id="sl">${planSlots().map(([k, l, e]) => { const o = slotOf(day, k), rr = o && recipeById(o.r || o.left); return `<button data-s="${k}" class="${k === s ? 'on' : ''}">${e} ${l}${o ? `<div class="tiny mute clamp1">${esc(rr ? rr.name : o.out || '')}</div>` : ''}</button>`; }).join('')}</div>
    ${slotOf(day, s) ? '<p class="tiny" style="color:var(--warn)">Ce créneau est déjà pris : il sera remplacé.</p>' : ''}
    <button class="btn pri full" id="ok" style="margin-top:14px">Ajouter au planning</button>`, sh => {
    sh.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { day = b.dataset.d; draw(); });
    sh.querySelectorAll('#sl button').forEach(b => b.onclick = () => { s = b.dataset.s; draw(); });
    const chips = sh.querySelector('.chips .on'); if (chips) chips.scrollIntoView({ inline: 'center', block: 'nearest' });
    sh.querySelector('#ok').onclick = () => { setSlot(day, s, { r: id, n }); save(); closeSheet(); render(); toast(`Prévu ${dayLabel(day, false).toLowerCase()} ✓`); };
  });
  draw();
}

// --- Recettes perso ---
let ED = null;
function sheetRecipeEditor(src) {
  if (src !== undefined) {
    const r = src ? recipeById(src) : null, n = S.profile.persons || 1;
    ED = r ? { id: r.mine ? r.id : null, name: r.mine ? r.name : r.name + ' (ma version)', emo: remoOf(r), type: r.type, time: r.time, persons: n, boite: !!r.boite,
      ings: r.ings.map(x => ({ ing: x.ing, q: +(x.q * n).toFixed(1), opt: x.opt })), steps: r.steps.join('\n') }
      : { id: null, name: '', emo: '🍽️', type: 'plat', time: 20, persons: n, boite: false, ings: [], steps: '' };
  }
  const E = ED, emos = ['🍽️', '🍝', '🍛', '🍲', '🥘', '🍗', '🥩', '🐟', '🍳', '🥗', '🌯', '🍔', '🍕', '🥧', '🥣', '🥞', '🍚', '🥔', '🧀', '🍰'];
  openSheet(`${sheetHead(E.id ? 'Modifier ma recette' : 'Nouvelle recette')}
    <label class="f">Nom</label><input type="text" id="ed-name" value="${esc(E.name)}" placeholder="ex. Poulet sauce moutarde">
    <label class="f">Icône</label><div class="chips">${emos.map(e => `<button class="chip emo ${E.emo === e ? 'on' : ''}" data-emo="${e}">${e}</button>`).join('')}</div>
    <div class="grid2">
      <div><label class="f">Type</label><select id="ed-type">${Object.entries(RTYPES).map(([k, l]) => `<option value="${k}" ${E.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="f">Temps (min)</label><input type="number" inputmode="numeric" id="ed-time" value="${E.time}"></div>
    </div>
    <div class="row" style="margin-top:12px"><b class="grow">Ingrédients pour</b><div class="persons"><button id="ed-pm">−</button><span>👤 ${E.persons}</span><button id="ed-pp">+</button></div></div>
    <div id="ed-ings">${E.ings.map((x, k) => `<div class="ing-line">${tile(emoOf(x.ing), 'sm')}<div class="grow">${esc(ingOf(x.ing).name)}
        <label class="tiny mute"><input type="checkbox" data-opt="${k}" ${x.opt ? 'checked' : ''}> facultatif</label></div>
        <input type="number" inputmode="decimal" step="any" data-q="${k}" value="${x.q}" style="width:80px"><span class="tiny mute" style="width:34px">${ingOf(x.ing).unit === 'pc' ? 'pce' : ingOf(x.ing).unit}</span>
        <button class="icon-btn ghost" data-rm="${k}" aria-label="Retirer">×</button></div>`).join('') || '<div class="small mute" style="padding:8px 0">Aucun ingrédient pour l\'instant.</div>'}</div>
    <button class="btn full" id="ed-add" style="margin-top:6px">+ Ajouter un ingrédient</button>
    <label class="f">Étapes (une par ligne)</label>
    <textarea id="ed-steps" rows="5" placeholder="Couper le poulet…">${esc(E.steps)}</textarea>
    <label class="check"><input type="checkbox" id="ed-boite" ${E.boite ? 'checked' : ''}> Se garde bien en boîte 🥡</label>
    <button class="btn pri full" id="ed-save" style="margin-top:14px">Enregistrer la recette</button>`, sh => {
    const sync = () => {
      E.name = sh.querySelector('#ed-name').value; E.type = sh.querySelector('#ed-type').value; E.time = num(sh.querySelector('#ed-time').value) || 20;
      E.steps = sh.querySelector('#ed-steps').value; E.boite = sh.querySelector('#ed-boite').checked;
      sh.querySelectorAll('[data-q]').forEach(x => E.ings[x.dataset.q].q = num(x.value));
      sh.querySelectorAll('[data-opt]').forEach(x => E.ings[x.dataset.opt].opt = x.checked);
    };
    sh.querySelectorAll('[data-emo]').forEach(b => b.onclick = () => { sync(); E.emo = b.dataset.emo; sheetRecipeEditor(); });
    sh.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { sync(); E.ings.splice(+b.dataset.rm, 1); sheetRecipeEditor(); });
    sh.querySelector('#ed-pm').onclick = () => { sync(); E.persons = Math.max(1, E.persons - 1); sheetRecipeEditor(); };
    sh.querySelector('#ed-pp').onclick = () => { sync(); E.persons++; sheetRecipeEditor(); };
    sh.querySelector('#ed-add').onclick = () => {
      sync();
      openSheet(`${sheetHead('Ajouter un ingrédient')}<input type="search" class="ip-search" placeholder="Chercher"><div class="results"></div><button class="btn full" id="back" style="margin-top:10px">‹ Retour à la recette</button>`, s2 => {
        ingPicker(s2, { filter: () => true, onPick: id => { E.ings.push({ ing: id, q: portionOf(id) * E.persons, opt: false }); sheetRecipeEditor(); } });
        s2.querySelector('#back').onclick = () => sheetRecipeEditor();
      });
    };
    sh.querySelector('#ed-save').onclick = () => {
      sync();
      if (!E.name.trim()) return toast('Donne un nom à ta recette');
      if (!E.ings.length) return toast('Ajoute au moins un ingrédient');
      const r = { id: E.id || 'm_' + uid(), name: E.name.trim(), emo: E.emo, type: E.type, time: E.time, src: '', mine: true, boite: E.boite,
        ings: E.ings.filter(x => x.q > 0).map(x => ({ ing: x.ing, q: +(x.q / E.persons).toFixed(2), opt: !!x.opt })),
        steps: E.steps.split('\n').map(x => x.trim()).filter(Boolean) };
      S.myRecipes = (S.myRecipes || []).filter(x => x.id !== r.id).concat(r);
      ED = null; save(); render(); sheetRecipe(r.id); toast('Recette enregistrée ✓');
    };
  });
}

/* ============================== 8. ÉVÉNEMENTS & DÉMARRAGE ============================== */
document.addEventListener('click', e => {
  const tab = e.target.closest('#tabs button');
  if (tab) { UI.tab = tab.dataset.tab; window.scrollTo(0, 0); return render(); }
  if (e.target.closest('#fab')) return sheetAddEntry();
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id, d = el.dataset;
  switch (a) {
    case 'close': return closeSheet();
    case 'tab': UI.tab = d.tab; window.scrollTo(0, 0); return render();
    // Accueil & journal
    case 'day': UI.day = shiftDay(UI.day, +d.n); listenDays(); return render();
    case 'day-today': UI.day = today(); listenDays(); return render();
    case 'add-entry': return sheetAddEntry();
    case 'entry-mode': return sheetAddEntry(d.m);
    case 'del-entry': {
      const e0 = (S.days[UI.day] || []).find(x => x.id === id); removeEntry(UI.day, id); render();
      return toast('Supprimé du journal', () => { addEntry(UI.day, e0); render(); });
    }
    case 'eat-box': return sheetEatBox(id);
    case 'quick-cook': e.stopPropagation(); return sheetCook(recipeById(id), UI.tab === 'recipes' ? (UI.persons ?? S.profile.persons ?? 1) : (S.profile.persons || 1));
    // Recettes
    case 'open-recipe': return sheetRecipe(id, d.n ? +d.n : undefined);
    case 'persons': UI.persons = Math.max(1, (UI.persons ?? S.profile.persons ?? 1) + +d.d); return render();
    case 'rtype': UI.rType = d.f; return render();
    case 'fav': S.favs[id] ? delete S.favs[id] : (S.favs[id] = true); save(); render(); return sheetRecipe(id);
    case 'plan-recipe': return sheetPlanRecipe(id, +d.n || 1);
    case 'add-missing': {
      const r = recipeById(id), st = recipeState(r, +d.n || 1); let k = 0;
      for (const m of st.missing) if (!S.shop.extra.some(x => x.ing === m.ing)) { S.shop.extra.push({ id: uid(), ing: m.ing, name: m.i.name, qty: roundBuy(m.ing, m.q - m.av) }); k++; }
      save(); render(); return toast(`${k} article${k > 1 ? 's' : ''} ajouté${k > 1 ? 's' : ''} à la liste 🛒`);
    }
    case 'new-recipe': return sheetRecipeEditor(null);
    case 'edit-recipe': case 'copy-recipe': return sheetRecipeEditor(id);
    case 'del-recipe': if (confirm('Supprimer cette recette ?')) { S.myRecipes = S.myRecipes.filter(x => x.id !== id); save(); closeSheet(); render(); } return;
    // Stock
    case 'add-stock': return sheetAddStock();
    case 'import-ticket': return sheetImport();
    case 'edit-stock': return sheetEditStock(id);
    case 'splace': UI.sPlace = d.p; return render();
    case 'qty': {
      const it = S.stock.find(x => x.id === id); if (!it) return;
      const before = snapshot(), nm = it.dish ? it.dish.name : ingOf(it.ing).name;
      it.qty = Math.max(0, it.qty + stepOf(it) * +d.d);
      if (+d.d > 0) it.full = Math.max(it.full || 0, it.qty);
      S.stock = S.stock.filter(x => x.qty > 1e-6); save(); render();
      if (!S.stock.includes(it)) toast(`${nm} : terminé`, () => { S.stock = before.stock; save(); render(); });
      return;
    }
    // Planning
    case 'plan-view': UI.planView = d.v; return render();
    case 'week': UI.week += +d.n; return render();
    case 'slot': return sheetSlot(d.day, d.s);
    case 'slot-n': { const sl = slotOf(d.day, d.s); sl.n = Math.max(1, sl.n + +d.d); save(); render(); return sheetSlot(d.day, d.s); }
    case 'slot-cook': { const sl = slotOf(d.day, d.s); return sheetCook(recipeById(sl.r), sl.n, { day: d.day, s: d.s }); }
    case 'slot-eatbox': return sheetEatBox(id, { day: d.day, s: d.s });
    case 'slot-change': return sheetSlotPick(d.day, d.s);
    case 'slot-done': slotOf(d.day, d.s).done = true; save(); closeSheet(); return render();
    case 'slot-clear': {
      const before = snapshot(), sl = slotOf(d.day, d.s), nd = shiftDay(d.day, 1);
      setSlot(d.day, d.s, null);
      if (sl && sl.r && d.s === 'diner' && slotOf(nd, 'dej')?.left === sl.r) setSlot(nd, 'dej', null);
      save(); closeSheet(); render(); return toast('Retiré du planning', () => { S.plan = before.plan; save(); render(); });
    }
    case 'autofill': {
      const n = autoFill(weekDays()); save(); render();
      return toast(n ? `${n} repas ajoutés au planning ✨` : 'La semaine est déjà remplie');
    }
    case 'clear-week': {
      const before = snapshot(), days = weekDays(); let n = 0;
      for (const day of days) for (const [s] of [['pdj'], ['dej'], ['diner']]) { const sl = slotOf(day, s); if (sl && !sl.done && !slotPast(day, s)) { setSlot(day, s, null); n++; } }
      save(); render(); return toast(n ? `${n} repas retirés` : 'Rien à retirer', n ? () => { S.plan = before.plan; save(); render(); } : null);
    }
    // Courses
    case 'shop-check': S.shop.checked[d.key] = el.checked; if (!el.checked) delete S.shop.checked[d.key]; save(); return render();
    case 'shop-add': {
      const inp = $('shop-add'), name = inp.value.trim(); if (!name) return;
      const m = allIngs().find(i => norm(i.name) === norm(name));
      S.shop.extra.push({ id: uid(), name: m ? m.name : name, ing: m ? m.id : undefined }); save(); render(); $('shop-add').focus(); return;
    }
    case 'shop-del': S.shop.extra = S.shop.extra.filter(x => x.id !== id); delete S.shop.checked['x:' + id]; save(); return render();
    case 'shop-low': { const i = ingOf(d.ing); S.shop.extra.push({ id: uid(), ing: i.id, name: i.name }); save(); return render(); }
    case 'shop-copy': {
      const lines = [];
      for (const n of shoppingNeeds()) if (!S.shop.checked[n.key]) lines.push(`- ${ingOf(n.ing).name} : ${fmtQty(n.ing, roundBuy(n.ing, n.qty))}`);
      for (const x of S.shop.extra) if (!S.shop.checked['x:' + x.id]) lines.push(`- ${x.name}${x.qty ? ' : ' + fmtQty(x.ing, x.qty) : ''}`);
      const txt = 'Liste de courses\n' + lines.join('\n');
      if (navigator.share && matchMedia('(pointer: coarse)').matches) navigator.share({ text: txt }).catch(() => {});
      else navigator.clipboard.writeText(txt).then(() => toast('Liste copiée 📋'), () => toast('Copie impossible'));
      return;
    }
    case 'shop-done': {
      let n = 0;
      for (const x of shoppingNeeds()) if (S.shop.checked[x.key]) { addStock(x.ing, roundBuy(x.ing, x.qty), ingOf(x.ing).place); n++; }
      for (const x of S.shop.extra) if (S.shop.checked['x:' + x.id]) { if (x.ing) { addStock(x.ing, x.qty || (ingOf(x.ing).unit === 'pc' ? 1 : ingOf(x.ing).pw || portionOf(x.ing)), ingOf(x.ing).place); n++; } }
      S.shop.extra = S.shop.extra.filter(x => !S.shop.checked['x:' + x.id]); S.shop.checked = {};
      save(); render(); return toast(n ? `${n} article${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} au stock ✓` : 'Coche les articles achetés d\'abord');
    }
    // Profil
    case 'pf-seg': S.profile[d.k] = d.v; save(); return render();
    case 'pf-persons': S.profile.persons = Math.max(1, (S.profile.persons || 1) + +d.d); UI.persons = null; save(); return render();
    case 'pf-toggle': S.profile[d.k] = el.checked; save(); return render();
    case 'custom-tg': S.profile.custom = el.checked ? { ...targets().auto } : null; save(); return render();
    case 'new-ing': return sheetIngredient(null);
    case 'edit-ing': return sheetIngredient(id);
    case 'pick-edit-ing': return openSheet(`${sheetHead('Corriger un ingrédient')}<input type="search" class="ip-search" placeholder="Chercher"><div class="results"></div>`,
      sh => ingPicker(sh, { onPick: iid => sheetIngredient(iid), filter: () => true }));
    case 'export': {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), lnk = document.createElement('a');
      lnk.href = url; lnk.download = `mes-repas-${today()}.json`; lnk.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    case 'logout': if (confirm('Se déconnecter ?')) auth.signOut(); return;
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  for (const [idk, key] of [['s-search', 'sSearch'], ['r-search', 'rSearch']]) if (t.id === idk) {
    UI[key] = t.value; const pos = t.selectionStart; render(); const n = $(idk); n.focus(); n.setSelectionRange(pos, pos);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSheet();
  if (e.key === 'Enter' && e.target.id === 'shop-add') e.target.closest('.row').querySelector('[data-act=shop-add]').click();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.pf) { const k = t.dataset.pf; S.profile[k] = num(t.value) || blank().profile[k]; save(); render(); }
  if (t.dataset.tg && S.profile.custom) { S.profile.custom[t.dataset.tg] = num(t.value); save(); render(); }
  if (t.id === 'import-file' && t.files[0]) {
    t.files[0].text().then(txt => {
      const d = JSON.parse(txt); if (!d.profile || !Array.isArray(d.stock)) throw new Error('format');
      if (!confirm('Remplacer tes données actuelles par celles du fichier ?')) return;
      S = Object.assign(blank(), d); save();
      if (CLOUD && currentUser) Object.entries(S.days).forEach(([k, v]) => dayDoc(k).set({ entries: v }));
      toast('Données importées'); render();
    }).catch(() => toast('Fichier invalide'));
  }
});

function showLogin() {
  $('tabs').style.display = 'none'; $('fab').hidden = true; $('title').textContent = 'Mes repas';
  $('view').innerHTML = `<div class="login"><div class="login-hero">🥗</div><h2 class="center">Mes repas</h2>
    <p class="small mute center">Ton stock, tes recettes et ton suivi, sur tous tes appareils.</p>
    <div class="card"><label class="f">E-mail</label><input type="email" id="l-mail" autocomplete="email">
    <label class="f">Mot de passe</label><input type="password" id="l-pass" autocomplete="current-password">
    <div class="small" id="l-err" style="color:var(--bad);margin-top:8px"></div>
    <button class="btn pri full" id="l-in" style="margin-top:12px">Se connecter</button>
    <button class="btn ghost full" id="l-up">Créer un compte</button></div></div>`;
  const go = up => {
    const m = $('l-mail').value.trim(), p = $('l-pass').value;
    (up ? auth.createUserWithEmailAndPassword(m, p) : auth.signInWithEmailAndPassword(m, p))
      .catch(err => { $('l-err').textContent = ({ 'auth/invalid-credential': 'E-mail ou mot de passe incorrect.', 'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).', 'auth/email-already-in-use': 'Ce compte existe déjà.', 'auth/invalid-email': 'E-mail invalide.' })[err.code] || err.message; });
  };
  $('l-in').onclick = () => go(false); $('l-up').onclick = () => go(true);
  $('l-pass').addEventListener('keydown', e => { if (e.key === 'Enter') go(false); });
}
function start() {
  loadLocal(); setSync('idle');
  // Migration : niveau de remplissage pour les articles déjà en stock
  for (const it of S.stock) if (!it.dish && !it.full) it.full = it.qty;
  if (!CLOUD) return render();
  auth.onAuthStateChanged(u => {
    if (unsubMain) { unsubMain(); unsubMain = null; } unsubDays.forEach(x => x()); unsubDays = [];
    currentUser = u;
    if (!u) return showLogin();
    $('tabs').style.display = ''; setSync('busy'); render(); listenCloud();
  });
}
start();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
