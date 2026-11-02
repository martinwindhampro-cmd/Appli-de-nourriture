/* =====================================================================
   IMPORT D'UN TICKET SUPER U — lecture du PDF, reconnaissance des produits, vérification
   ===================================================================== */
'use strict';
// --- Import d'un ticket Super U ---
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
async function loadPdfJs() {
  if (window.pdfjsLib) return;
  await new Promise((res, rej) => { const s = document.createElement('script'); s.src = PDFJS + 'pdf.min.js'; s.onload = res; s.onerror = () => rej(new Error('pdf.js')); document.head.appendChild(s); });
  pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
}
// Reconstitue les lignes du PDF (les morceaux de texte qui ont la même hauteur)
async function pdfToText(file) {
  await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise, out = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const items = (await (await pdf.getPage(n)).getTextContent()).items.filter(i => i.str.trim());
    const rows = [];
    for (const it of items) {
      const y = it.transform[5], x = it.transform[4];
      let row = rows.find(r => Math.abs(r.y - y) < 2.5);
      if (!row) rows.push(row = { y, parts: [] });
      row.parts.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y).forEach(r => out.push(r.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim()));
  }
  return out.join('\n');
}
// Lit le texte du ticket : rayons, produits, prix, code TVA (11 = alimentaire, 13 = non alimentaire), quantités
function parseTicket(text) {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let i = lines.findIndex(l => /\*\*\*\s*VENTE\s*\*\*\*/i.test(l)); i = i < 0 ? 0 : i + 1;
  const items = []; let cat = '';
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (/^(Nombre de lignes|TOTAL\b|SOUS-TOTAL)/i.test(l)) break;
    let m;
    if ((m = l.match(/^(.+?)\s+(-?\d+,\d{2})\s*€?\s+(\d{1,2})$/))) items.push({ label: m[1].trim(), total: num(m[2]), tva: m[3], count: 1, cat });
    else if ((m = l.match(/^(\d+)\s*x\s+[\d,]+\s*(EUR|€)/i)) && items.length) items[items.length - 1].count = +m[1];
    else if ((m = l.match(/^([\d,]+)\s*kg\s*x/i)) && items.length) items[items.length - 1].kg = num(m[1]);
    else if (!/\d,\d{2}/.test(l) && /^[A-Z0-9 .,'&()\/-]+$/.test(l)) cat = l;
  }
  return items;
}
// Contenance d'un produit à partir de son nom : « 4X150G », « 6X1L », « X10 », « 500G », « 1,25L », « BOITE 4/4 »
function parseSize(label) {
  const L = label.toUpperCase().replace(/(\d),(\d)/g, '$1.$2');
  const toBase = (v, u) => v * ({ KG: 1000, G: 1, L: 1000, CL: 10, ML: 1 }[u]);
  let m = L.match(/(\d+)\s*X\s*(\d+(?:\.\d+)?)\s*(KG|G|CL|ML|L)\b/);
  if (m) return { size: +m[1] * toBase(+m[2], m[3]), pieces: +m[1] };
  const all = [...L.matchAll(/(\d+(?:\.\d+)?)\s*(KG|G|CL|ML|L)\b/g)], pc = L.match(/\bX\s?(\d+)\b/);
  const size = all.length ? toBase(+all[all.length - 1][1], all[all.length - 1][2]) : /\b4\/4\b/.test(L) ? 800 : null;
  return { size, pieces: pc ? +pc[1] : null };
}
// Abréviations courantes des tickets de caisse → mots complets
const TICKET_ABBR = {
  FRO: 'FROMAGE', FROM: 'FROMAGE', FROMG: 'FROMAGE', BLC: 'BLANC', BL: 'BLANC', CR: 'CREME', CRE: 'CREME', SCE: 'SAUCE', STK: 'STEAK',
  HACH: 'HACHE', BF: 'BOEUF', BOEU: 'BOEUF', YRT: 'YAOURT', YAO: 'YAOURT', BTE: 'BOITE', DESS: 'DESSERT', BOISS: 'BOISSON', BOIS: 'BOISSON',
  CHAMP: 'CHAMPIGNON', CHAMPI: 'CHAMPIGNON', CER: 'CEREALES', CEREAL: 'CEREALES', EMMENT: 'EMMENTAL', EMMEN: 'EMMENTAL', MOZZA: 'MOZZARELLA',
  CHOC: 'CHOCOLAT', CHOCO: 'CHOCOLAT', SAUC: 'SAUCISSE', SAUCIS: 'SAUCISSE', SAUCISS: 'SAUCISSE', PDT: 'POMME DE TERRE', TOM: 'TOMATE',
  HAR: 'HARICOT', HARIC: 'HARICOT', LEGUM: 'LEGUME', LEGS: 'LEGUMES', BRIOC: 'BRIOCHE', PREP: 'PREPARATION', LIMONAD: 'LIMONADE',
  CONF: 'CONFITURE', COMP: 'COMPOTE', CONC: 'CONCOMBRE', COURG: 'COURGETTE', CAROT: 'CAROTTE', POIV: 'POIVRON', OIGN: 'OIGNON',
  JBN: 'JAMBON', JAMB: 'JAMBON', VOL: 'VOLAILLE', POUL: 'POULET', DIND: 'DINDE', ESCAL: 'ESCALOPE', SAUM: 'SAUMON', CREV: 'CREVETTE',
  PAT: 'PATE', MAYO: 'MAYONNAISE', VINAIG: 'VINAIGRETTE', BISC: 'BISCUIT', GAT: 'GATEAU', SURG: 'SURGELE', CG: 'CREME GLACEE',
};
const expandLabel = s => s.split(/[^A-Z0-9%]+/).filter(Boolean).map(w => TICKET_ABBR[w] || w).join(' ');

// Règles nom du ticket → ingrédient. L'ordre compte : le plus précis d'abord.
// Chaque règle est testée sur le libellé brut ET sur sa version « déabréviée ».
const TICKET_RULES = [
  // Boissons, produits sucrés, plats prêts (avant les ingrédients, pour éviter « JUS … POMME » → pomme)
  [/MONSTER|RED ?BULL|ENERGY|BURN\b/, 'boisson_energisante'], [/SIROP/, 'sirop'],
  [/\bJUS\b|NECTAR|SMOOTHIE|PUR JUS/, 'jus'],
  [/\bCOLA\b|COCA|PEPSI|LIMONADE|LORINA|ORANGINA|FANTA|SPRITE|SCHWEPPES|ICE ?TEA|THE GLACE|SODA|BOISSON|PERRIER|OASIS/, s => /\b0\s?%|ZERO|LIGHT|SANS SUCRE/.test(s) ? 'soda_zero' : 'soda'],
  [/CREME GLACEE|GLACE|SORBET|ESQUIMAU|\bCONES?\b|MAGNUM|\bBAC\b/, 'glace'],
  [/CROISSANT/, 'croissant'], [/PAINS? (AU )?CHOC|CHOCOLATINE/, 'pain_chocolat'], [/BRIOCHE|PASQUIER|HARRYS?/, 'brioche'],
  [/PREPARATION|ALSA|FLAN PAT/, 'preparation_dessert'],
  [/LIEGEOIS|DESSERT|CREME DESS|DANETTE|MOUSSE|RIZ AU LAIT|SEMOULE AU LAIT|FLAN/, 'dessert_lacte'],
  [/RAVIOLI|CANNELLONI/, s => /BOITE|4\/4|CONSERVE/.test(s) ? 'raviolis_boite' : 'raviolis_frais'],
  [/TORTELLINI|GNOCCHI/, s => /GNOCCHI/.test(s) ? 'gnocchi' : 'raviolis_frais'],
  [/FEUILLES? (DE )?LASAGNE|LASAGNES? (U |BARILLA|PANZANI)?\d/, 'feuilles_lasagne'], [/PESTO/, 'pesto'], [/GALETTE.*(SARRASIN|BLE NOIR)|SARRASIN/, 'galette_sarrasin'],
  [/PIZZA/, 'pizza'], [/LASAGNE|CASSOULET|CHOUCROUTE|PARMENTIER|PAELLA|COUSCOUS ROYAL|BLANQUETTE|PLAT CUISINE|TAJINE/, 'plat_cuisine'],
  [/SOUPE|VELOUTE|POTAGE|GASPACHO/, 'soupe'], [/MOUSLINE|PUREE (EN )?FLOCON/, 'puree_flocons'],
  [/NUTELLA|PATE A TARTINER|PATE TARTIN|TARTINER/, 'pate_tartiner'], [/CONFITURE|CONFIT\b/, 'confiture'], [/COMPOTE|POMPOTE/, 'compote'],
  [/BISCOTTE|PAIN GRILLE|CRACOTTE/, 'biscottes'],
  [/BISCUIT|GATEAU|COOKIE|PALMIER|MADELEINE|GAUFRE|PRINCE|PETIT BEURRE|SABLE|BARQUETTE|SPRITS|PIM'?S|FOURRES?/, 'biscuits'],
  [/CHIPS|TUILE|CRACKER|BRETZEL|APERO|CURLY/, 'chips'],
  [/CHOCOLAT.*LAIT|LAIT.*CHOCOLAT|MILKA/, 'chocolat_lait'], [/CHOCOLAT.*(NR|NOIR)|NOIR.*PATISS|PATISSIER/, 'chocolat_noir'],
  [/FLOCON|AVOINE/, 'flocons_avoine'], [/MUESLI/, 'muesli'], [/FROSTIES|CEREALES|CORN ?FLAKES|CHOCAPIC|SPECIAL K|TRESOR|COCO POPS|MIEL POPS/, 'cereales'],
  [/AMANDE|NOISETTES? (DECORT|GRILL)|NOIX|CAJOU|PISTACHE|CACAHUET|RAISINS SECS|ABRICOTS? SEC|FRUITS SECS/, 'noix'],
  // Viandes, poissons
  [/LAIT.*COCO|COCO/, 'lait_coco'], [/BOURGUIGNON|A BRAISER|BRAISER|POT.AU.FEU|PALERON|JOUE/, 'boeuf_braiser'], [/EMINCE.*BOEUF|BOEUF.*EMINCE|LANIERES? (DE )?BOEUF|FAJITAS? BOEUF/, 'boeuf_emince'], [/AIGUILLETTE/, 'aiguillettes_poulet'], [/CUISSE.*POULET|HAUT.*CUISSE|PILON/, 'cuisse_poulet'],
  [/NUGGET/, 'nuggets'], [/CORDON/, 'cordon_bleu'], [/DINDE|ESCALOPE/, 'dinde'], [/POULET|VOLAILLE/, 'poulet'],
  [/STEAK|STK|HACHE.*\b5\s?%/, s => /\b5\s?%/.test(s) ? 'steak_hache_5' : 'steak_hache_15'], [/HACHE|BOLOGNAISE CRUE/, 'viande_hachee_20'],
  [/LARDON/, 'lardons'], [/BACON/, 'bacon'], [/JAMBON CRU|SERRANO|BAYONNE|PARME|PROSCIUTTO/, 'jambon_cru'], [/JAMBON|JBN/, 'jambon'],
  [/CHORIZO|SAUCISSON|SALAMI|ROSETTE/, 'chorizo'], [/CHIPO/, 'chipolata'], [/MERGUEZ/, 'merguez'], [/STRASBOURG|KNACKI|FRANCFORT|KNACK/, 'knacki'],
  [/SAUCISSE/, 'saucisse'], [/PORC|ECHINE|FILET MIGNON|COTE.*PORC|ROTI/, 'porc'],
  [/SURIMI/, 'surimi'], [/THON/, 'thon'], [/SAUMON FUME|SAUMON.*FUME/, 'saumon_fume'], [/SAUMON/, 'saumon'],
  [/CREVETTE|GAMBAS/, 'crevettes'], [/SARDINE/, 'sardines'], [/MAQUEREAU/, 'maquereau'],
  [/BATONNETS? (DE )?POISSON|POISSON PANE|PANE/, 'poisson_pane'], [/CABILLAUD|COLIN|LIEU|MERLU|POISSON|COLINOT/, 'poisson_blanc'],
  [/^OEUFS?\b|\bOEUFS? (PLEIN|FRAIS|BIO|CAT)/, 'oeuf'],
  // Produits laitiers
  [/SKYR/, 'skyr'], [/FROMAGE BLANC|FROM\.BLC|FRO.*BL/, s => /\b0\s?%/.test(s) ? 'fromage_blanc_0' : 'fromage_blanc'],
  [/GREC/, 'yaourt_grec'], [/YAOURT|YRT|YAOS/, s => /FRUIT|AROM|VANILLE|FRAISE|PECHE|CITRON|SUCRE/.test(s) ? 'yaourt_fruits' : 'yaourt'],
  [/EMMENTAL|RAPE/, 'emmental'], [/MOZZARELLA/, 'mozzarella'], [/CHEVRE/, 'chevre'], [/FONDU|CHEDDAR/, 'fromage_fondu'],
  [/LOIK|ST MORET|SAINT MORET|CARRE FRAIS|PHILADELPHIA|FROMAGE FRAIS|BOURSIN/, 'fromage_frais'],
  [/REBLOCHON/, 'reblochon'], [/RACLETTE/, 'raclette'], [/COMTE/, 'comte'], [/FETA/, 'feta'], [/CAMEMBERT|BRIE|COULOMMIERS/, 'camembert'],
  [/RICOTTA/, 'ricotta'], [/MASCARPONE/, 'mascarpone'], [/PARMESAN|PARMIG|GRANA/, 'parmesan'], [/^BEURRE|BEURRE (DOUX|DEMI|SALE|TENDRE)/, 'beurre'],
  [/BRIDELICE|18\s?%/, 'creme_18'], [/CREME LEG|CREME LIQ.*12|12\s?%|15\s?%/, 'creme_12'], [/CREME|^CR\b/, 'creme_30'],
  [/LAIT/, s => /ENTIER/.test(s) ? 'lait_entier' : /ECREME\b(?!.*1\/2)|ECREME U/.test(s) && !/1\/2|DEMI/.test(s) ? 'lait_ecreme' : 'lait'],
  // Féculents
  [/COQUILLETTE/, 'coquillettes'], [/MACARONI/, 'macaroni'], [/SPAGH/, 'spaghetti'], [/PENNE/, 'penne'], [/CAPELLINI/, 'capellini'], [/TAGLIATEL/, 'tagliatelles'],
  [/NOUILLE|RAMEN|UDON|VERMICELLE.*RIZ/, 'nouilles'], [/\bPATES\b|FUSILLI|TORSADE|PAPILLON|FARFALLE|RIGATONI|VERMICELLE/, 'pates'], [/\bRIZ\b/, 'riz'], [/COUSCOUS|SEMOULE/, 'semoule'],
  [/QUINOA/, 'quinoa'], [/BOULGOUR/, 'boulgour'], [/LENTILLE/, 'lentilles'],
  [/NOISETTE/, 'pommes_noisettes'], [/FRITE|POTATOES|\bROSTI\b/, 'frites_four'], [/POMMES? DE TERRE|\bPDT\b|GRENAILLE/, 'pdt'],
  [/TORTILLA|WRAP/, 'tortilla'], [/HAMBURGER|BURGER|BUNS/, (s, c) => /BOUCH|VIANDE|SURGELE SALE/.test(c) && !/BUNS|PAIN/.test(s) ? 'steak_hache_15' : 'pain_burger'], [/PAIN DE MIE|\bMIE\b/, 'pain_mie'], [/BAGUETTE|^PAIN\b|PAIN (COMPLET|CAMPAGNE|TRADITION)/, 'pain'],
  [/FARINE/, 'farine'], [/CACAO|VAN HOUTEN/, 'cacao'], [/FEUILLET/, 'pate_feuilletee'], [/BRISEE/, 'pate_brisee'], [/PATE A (TARTE|PIZZA)|SABLEE/, 'pate_tarte'],
  // Sauces, épicerie
  [/TIKKA/, 'sauce_tikka'], [/SEASON|EPICE|ASSAISONNEMENT|CURRY|PAPRIKA|CUMIN|HERBES/, 'epices'], [/FAJITA|SALSA|TACO/, 'sauce_fajita'],
  [/SAUCE POIVRE/, 'sauce_poivre'], [/MAYONNAISE/, 'mayonnaise'], [/KETCHUP/, 'ketchup'], [/WHEY|PROTEIN/, 'whey'], [/^MIEL/, 'miel'],
  [/CONCASS|PULPE/, 'tomates_concassees'], [/COULIS|SAUCE TOMATE|PASSATA|CONCENTRE/, 'sauce_tomate'],
  // Fruits & légumes
  [/POIVRON/, (s, c) => /SURGEL/.test(c) || /SURGEL/.test(s) ? 'poivrons_surgeles' : 'poivron'], [/OIGNON|ECHALOTE/, 'oignon'], [/TOMATE/, 'tomate'],
  [/CHAMPIGNON/, (s, c) => /CONSERVE/.test(c) || /BOITE|1\/2|4\/4/.test(s) ? 'champignons_boite' : 'champignons'],
  [/PETITS? POIS/, 'petits_pois'], [/\bMAIS\b/, 'mais'], [/HARICOTS? ROUGE/, 'haricots_rouges'], [/HARICOTS? VERT/, 'haricots_verts'],
  [/POIS CHICHE/, 'pois_chiches'], [/COURGETTE/, 'courgette'], [/CAROTTE/, 'carotte'], [/CONCOMBRE/, 'concombre'], [/AUBERGINE/, 'aubergine'],
  [/POIREAU/, 'poireau'], [/CHOU.?FLEUR/, 'chou_fleur'], [/BROCOLI/, 'brocoli'], [/EPINARD/, 'epinards'],
  [/POELEE|MELANGE.*LEGUME|LEGUMES? (POUR|DU|SURG|CUISIN)|JARDINIERE|MACEDOINE|RATATOUILLE|WOK/, 'melange_legumes'],
  [/SALADE|LAITUE|MACHE|ROQUETTE|BATAVIA|SUCRINE|ICEBERG/, 'salade'], [/AVOCAT/, 'avocat'],
  [/BANANE/, 'banane'], [/CLEMENTINE|MANDARINE/, 'clementine'], [/ORANGE/, 'orange'], [/POIRE/, 'poire'], [/KIWI/, 'kiwi'],
  [/ANANAS/, 'ananas'], [/FRAISE/, 'fraise'], [/\bRAISIN/, 'raisin'], [/^POMMES?\b|POMME (GOLDEN|GALA|PINK|GRANNY|CANADA|JAZZ)/, 'pomme'],
  [/FRUITS ROUGES|FRAMBOISE|MYRTILLE|MURE/, 'fruits_rouges'],
  // Ingrédients de base
  [/HUILE/, 'huile'], [/SUCRE/, 'sucre'], [/MOUTARDE/, 'moutarde'], [/SOJA/, 'sauce_soja'], [/BOUILLON/, 'bouillon'], [/LEVURE/, 'levure'],
  [/\bSEL\b|POIVRE/, 'sel_poivre'], [/\bAIL\b/, 'ail'], [/CITRON/, 'citron'],
];
const ticketKey = label => label.toUpperCase().replace(/\s+/g, ' ').trim();
// Renvoie { ing, how } : how = 'memo' (déjà choisi), 'regle' (reconnu), 'devine' (approché : à vérifier)
function guessIng(label, cat) {
  const k = ticketKey(label);
  const m = S.ticketMap[k];   // seuls tes choix manuels sont mémorisés ('__skip' = ne pas suivre)
  if (m && m !== '__ignore') return { ing: m === '__skip' ? '' : m, how: 'memo' };
  const raw = norm(label).toUpperCase(), s = raw + ' | ' + expandLabel(raw), c = norm(cat).toUpperCase();
  for (const [re, id] of TICKET_RULES) if (re.test(s)) return { ing: typeof id === 'function' ? id(s, c) : id, how: 'regle' };
  // Dernier recours : mots en commun avec le nom d'un ingrédient (≥ 5 lettres)
  const words = expandLabel(raw).split(' ').filter(w => w.length >= 5);
  let best = null, score = 0;
  for (const i of allIngs()) {
    const iw = norm(i.name).toUpperCase().split(/[^A-Z]+/).filter(w => w.length >= 5);
    const sc = words.filter(w => iw.some(x => x.slice(0, 5) === w.slice(0, 5))).length;
    if (sc > score) { score = sc; best = i.id; }
  }
  return best ? { ing: best, how: 'devine' } : { ing: '', how: '' };
}
function ticketQty(ingId, it) {
  const i = ingOf(ingId), pk = parseSize(it.label), n = it.count || 1;
  if (it.kg) return i.unit === 'pc' && i.pw ? Math.round(it.kg * 1000 / i.pw) : it.kg * 1000;
  if (i.unit === 'pc') return pk.pieces ? pk.pieces * n : pk.size && i.pw ? Math.max(1, Math.round(pk.size / i.pw)) * n : n;
  if (pk.size) return pk.size * n;
  if (pk.pieces && i.pw) return pk.pieces * i.pw * n;
  return i.pw ? i.pw * n : 0;
}
let IMPORT = null;   // { rows: [ { label, cat, count, ing, qty, place, on } ], skipped: [] }
function buildImport(text) {
  const items = parseTicket(text);
  const food = items.filter(it => it.tva !== '13' && it.total > 0), skipped = items.filter(it => it.tva === '13');
  const rows = food.map(it => {
    const { ing, how } = guessIng(it.label, it.cat), i = ing && ingOf(ing);
    return { ...it, ing, how, qty: ing ? ticketQty(ing, it) : 0,
      place: /SURGEL/i.test(norm(it.cat)) ? 'congel' : i ? i.place : 'frigo', on: !!ing && !(i && i.base) };
  });
  // à vérifier d'abord (devinés), puis reconnus, puis ingrédients de base, puis non suivis
  const rank = r => r.how === 'devine' && r.ing ? 0 : r.on ? 1 : r.ing ? 2 : 3;
  rows.sort((a, b) => rank(a) - rank(b));
  IMPORT = { rows, skipped };
}
function sheetImport() {
  openSheet(`${sheetHead('Importer un ticket')}
    <p class="small mute" style="margin-top:0">Ticket de caisse Super U en PDF (livraison ou magasin). L'appli reconnaît les produits, les quantités et le rangement ; tu vérifies avant d'ajouter.</p>
    <label class="btn pri full">📄 Choisir le PDF du ticket<input type="file" accept="application/pdf,.pdf" id="t-file" hidden></label>
    <div id="t-msg" class="small" style="margin-top:10px"></div>
    <details style="margin-top:14px"><summary class="small" style="cursor:pointer">Pas de PDF ? Coller le texte du ticket</summary>
      <textarea id="t-text" rows="8" style="width:100%;margin-top:8px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--card)" placeholder="Colle ici le contenu du ticket ou de l'e-mail de commande"></textarea>
      <button class="btn full" id="t-go" style="margin-top:8px">Analyser le texte</button></details>`, sh => {
    const done = text => {
      buildImport(text);
      if (!IMPORT.rows.length) { sh.querySelector('#t-msg').innerHTML = '<span style="color:var(--bad)">Aucun produit trouvé. Est-ce bien un ticket Super U ?</span>'; return; }
      sheetImportReview();
    };
    sh.querySelector('#t-file').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      sh.querySelector('#t-msg').textContent = 'Lecture du ticket…';
      try { done(await pdfToText(f)); } catch (err) { console.error(err); sh.querySelector('#t-msg').innerHTML = '<span style="color:var(--bad)">Impossible de lire ce PDF. Essaie de coller le texte.</span>'; }
    });
    sh.querySelector('#t-go').onclick = () => done(sh.querySelector('#t-text').value);
  });
}
function sheetImportReview() {
  const prev = document.querySelector('.sheet'), keep = prev && prev.querySelector('#t-add') ? prev.scrollTop : 0;
  const opts = allIngs().map(i => `<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');
  const nOn = IMPORT.rows.filter(r => r.on && r.ing && r.qty > 0).length, nGuess = IMPORT.rows.filter(r => r.ing && r.how === 'devine').length;
  openSheet(`${sheetHead('Vérifier le ticket')}
    <p class="small mute" style="margin-top:0">${IMPORT.rows.length} produits alimentaires${IMPORT.skipped.length ? ` · ${IMPORT.skipped.length} non alimentaires ignorés` : ''}.
      ${nGuess ? `<b>${nGuess} à vérifier</b> (en haut).` : ''} L'appli retiendra tes choix pour les prochains tickets.</p>
    ${IMPORT.rows.map((r, k) => { const i = r.ing && ingOf(r.ing), first = !r.ing && (k === 0 || IMPORT.rows[k - 1].ing); return `${first ? '<h2>Non suivis</h2><p class="small mute" style="margin-top:-4px">Choisis un ingrédient pour les suivre, sinon ils seront ignorés.</p>' : ''}<div class="card" style="padding:10px 12px;margin-bottom:8px;${r.on ? '' : 'opacity:.6'}">
      <div class="row"><input type="checkbox" data-k="${k}" class="t-on" ${r.on ? 'checked' : ''} ${r.ing ? '' : 'disabled'}>
        <div class="grow tiny mute" style="word-break:break-word">${esc(r.label)}${r.count > 1 ? ` <b>× ${r.count}</b>` : ''}${r.kg ? ` <b>${fr(r.kg, 3)} kg</b>` : ''}</div>
        ${r.ing && r.how === 'devine' ? '<span class="badge warn">à vérifier</span>' : r.how === 'memo' && r.ing && !r.touched ? '<span class="badge ok">mémorisé</span>' : ''}</div>
      <select class="t-ing" data-k="${k}" style="margin-top:6px"><option value="">— Ne pas suivre —</option><option value="__new">+ Créer un ingrédient…</option>${opts}</select>
      ${r.ing ? (i.base ? `<div class="tiny mute" style="margin-top:6px">Ingrédient de base : toujours dispo, pas besoin de l'ajouter.</div>` : `<div class="row" style="margin-top:6px;gap:6px">
        <input type="number" inputmode="decimal" step="any" class="t-qty" data-k="${k}" value="${+(+r.qty).toFixed(1)}" style="flex:1">
        <span class="small mute" style="flex:none">${i.unit === 'pc' ? 'pièce(s)' : i.unit}</span>
        <select class="t-place" data-k="${k}" style="flex:1.3">${PLACES.map(([pk, pl]) => `<option value="${pk}" ${r.place === pk ? 'selected' : ''}>${pl.split(' ')[0]}</option>`).join('')}</select></div>`) : ''}
    </div>`; }).join('')}
    <button class="btn pri full" id="t-add" style="position:sticky;bottom:0" ${nOn ? '' : 'disabled'}>Ajouter ${nOn} produit${nOn > 1 ? 's' : ''} au stock</button>`, sh => {
    sh.querySelectorAll('.t-ing').forEach(sel => { const r = IMPORT.rows[sel.dataset.k]; sel.value = r.ing || ''; });
    sh.scrollTop = keep;
    sh.addEventListener('change', e => {
      const t = e.target, r = IMPORT.rows[t.dataset.k]; if (!r) return;
      if (t.classList.contains('t-on')) { r.on = t.checked; return sheetImportReview(); }
      if (t.classList.contains('t-qty')) { r.qty = num(t.value); return; }
      if (t.classList.contains('t-place')) { r.place = t.value; return; }
      if (t.classList.contains('t-ing')) {
        if (t.value === '__new') {
          const pretty = r.label.toLowerCase().replace(/\b\d.*$/, '').replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
          return sheetIngredient(null, pretty.charAt(0).toUpperCase() + pretty.slice(1), created => { setRowIng(r, created.id); sheetImportReview(); });
        }
        setRowIng(r, t.value); sheetImportReview();
      }
    });
    sh.querySelector('#t-add').onclick = () => {
      let n = 0;
      for (const r of IMPORT.rows) {
        if (r.touched) S.ticketMap[ticketKey(r.label)] = r.ing || '__skip';
        if (r.on && r.ing && r.qty > 0 && !ingOf(r.ing).base) { addStock(r.ing, r.qty, r.place); n++; }
      }
      IMPORT = null; save(); closeSheet(); UI.tab = 'stock'; render(); toast(`${n} produit${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} au stock`);
    };
  });
}
function setRowIng(r, id) {
  r.ing = id; r.how = 'memo'; r.touched = true; if (!id) { r.on = false; r.qty = 0; return; }
  const i = ingOf(id); r.qty = ticketQty(id, r); r.on = !i.base;
  if (!/SURGEL/i.test(norm(r.cat))) r.place = i.place;
}

