/* =====================================================================
   DONNÉES DE BASE — ingrédients et recettes
   ---------------------------------------------------------------------
   Valeurs nutritionnelles pour 100 g (ou 100 ml), à partir de la table
   Ciqual de l'ANSES (valeurs moyennes, arrondies). Les produits de marque
   peuvent varier un peu : tu peux corriger un ingrédient dans l'appli.

   Ingrédient : I(id, nom, rangement, unité, kcal, protéines, glucides, lipides, options)
     rangement : 'frigo' | 'congel' | 'placard'
     unité     : 'g' | 'ml' | 'pc' (pièce)
     options   : pw   = poids d'une pièce en g (pour saisir « 2 poivrons » ou calculer une pièce)
                 fam  = famille (ex. coquillettes → pates) : une recette qui demande « pates »
                        accepte n'importe quelles pâtes du stock
                 base = ingrédient de base, toujours considéré disponible et jamais déduit
                        du stock (sel, huile, épices…). Ses calories comptent quand même.
   ===================================================================== */
'use strict';

const I = (id, name, place, unit, kcal, p, g, l, o = {}) => ({ id, name, place, unit, n: { kcal, p, g, l }, ...o });

const INGREDIENTS = [
  // ---------- Viandes, poissons, œufs ----------
  I('poulet', 'Blanc de poulet', 'frigo', 'g', 110, 23.5, 0, 1.5),
  I('aiguillettes_poulet', 'Aiguillettes de poulet', 'frigo', 'g', 110, 23.5, 0, 1.5, { fam: 'poulet' }),
  I('cuisse_poulet', 'Haut de cuisse de poulet', 'frigo', 'g', 165, 19, 0, 10, { fam: 'poulet' }),
  I('boeuf_hache', 'Bœuf haché (tout type)', 'congel', 'g', 230, 18, 0, 17),
  I('steak_hache_15', 'Steak haché 15 %', 'congel', 'g', 215, 18.5, 0, 15, { fam: 'boeuf_hache', pw: 100 }),
  I('steak_hache_5', 'Steak haché 5 %', 'congel', 'g', 125, 21, 0, 5, { fam: 'boeuf_hache', pw: 100 }),
  I('viande_hachee_20', 'Viande hachée 20 %', 'congel', 'g', 250, 17, 0, 20, { fam: 'boeuf_hache' }),
  I('lardons', 'Lardons', 'frigo', 'g', 245, 15, 0.5, 20),
  I('jambon', 'Jambon blanc', 'frigo', 'g', 115, 20, 1, 3.5, { pw: 40 }),
  I('surimi', 'Surimi', 'frigo', 'g', 100, 8, 14, 1.5, { pw: 17 }),
  I('thon', 'Thon au naturel (boîte)', 'placard', 'g', 115, 26, 0, 1),
  I('poisson_pane', 'Bâtonnets de poisson panés', 'congel', 'g', 200, 12, 18, 9, { pw: 28 }),
  I('saumon', 'Pavé de saumon', 'congel', 'g', 200, 20, 0, 13, { pw: 125 }),
  I('oeuf', 'Œuf', 'frigo', 'pc', 140, 12.5, 0.5, 10, { pw: 50 }),

  // ---------- Produits laitiers ----------
  I('lait', 'Lait demi-écrémé', 'placard', 'ml', 46, 3.3, 4.8, 1.6),
  I('creme', 'Crème (tout type)', 'frigo', 'ml', 160, 2.6, 3.7, 15),
  I('creme_12', 'Crème légère 12 %', 'frigo', 'ml', 135, 2.8, 4, 12, { fam: 'creme' }),
  I('creme_18', 'Crème 18 % (Bridélice…)', 'frigo', 'ml', 185, 2.5, 3.5, 18, { fam: 'creme' }),
  I('creme_30', 'Crème fraîche 30 %', 'frigo', 'ml', 290, 2.2, 3, 30, { fam: 'creme' }),
  I('fromage_blanc', 'Fromage blanc 3 %', 'frigo', 'g', 75, 7.5, 4, 3),
  I('fromage_blanc_0', 'Fromage blanc 0 %', 'frigo', 'g', 47, 7.5, 4, 0.2, { fam: 'fromage_blanc' }),
  I('skyr', 'Skyr', 'frigo', 'g', 62, 10.5, 4, 0.2, { fam: 'fromage_blanc' }),
  I('yaourt_grec', 'Yaourt grec nature', 'frigo', 'g', 120, 4.5, 4, 9.5, { pw: 150 }),
  I('yaourt', 'Yaourt nature', 'frigo', 'g', 60, 4.2, 5.5, 1.5, { pw: 125 }),
  I('emmental', 'Emmental râpé', 'frigo', 'g', 380, 28, 0, 30),
  I('mozzarella', 'Mozzarella', 'frigo', 'g', 250, 18, 1, 19, { pw: 125 }),
  I('chevre', 'Bûche de chèvre', 'frigo', 'g', 300, 19, 1, 24),
  I('fromage_fondu', 'Fromage fondu en tranches (burger)', 'frigo', 'g', 270, 14, 6, 21, { pw: 20 }),
  I('reblochon', 'Reblochon', 'frigo', 'g', 330, 20, 0, 28, { pw: 450 }),
  I('parmesan', 'Parmesan', 'frigo', 'g', 390, 32, 0, 28),
  I('fromage_frais', 'Fromage frais à tartiner', 'frigo', 'g', 250, 7, 3, 24),
  I('beurre', 'Beurre', 'frigo', 'g', 745, 0.7, 0.6, 82),

  // ---------- Féculents, pains ----------
  I('pates', 'Pâtes (tout type)', 'placard', 'g', 355, 12.5, 71, 1.5),
  I('coquillettes', 'Coquillettes', 'placard', 'g', 355, 12.5, 71, 1.5, { fam: 'pates' }),
  I('macaroni', 'Macaroni', 'placard', 'g', 355, 12.5, 71, 1.5, { fam: 'pates' }),
  I('spaghetti', 'Spaghetti', 'placard', 'g', 355, 12.5, 71, 1.5, { fam: 'pates' }),
  I('penne', 'Penne', 'placard', 'g', 355, 12.5, 71, 1.5, { fam: 'pates' }),
  I('capellini', 'Capellini', 'placard', 'g', 355, 12.5, 71, 1.5, { fam: 'pates' }),
  I('tagliatelles', 'Tagliatelles', 'placard', 'g', 360, 13, 70, 2.5, { fam: 'pates' }),
  I('riz', 'Riz', 'placard', 'g', 355, 8, 78, 0.7),
  I('semoule', 'Semoule / couscous', 'placard', 'g', 360, 12, 72, 1.5),
  I('gnocchi', 'Gnocchis à poêler', 'frigo', 'g', 170, 4.5, 34, 1.5),
  I('pdt', 'Pommes de terre', 'placard', 'g', 80, 2, 17, 0.1, { pw: 150 }),
  I('frites_four', 'Frites au four (surgelées)', 'congel', 'g', 150, 2.5, 23, 5),
  I('pommes_noisettes', 'Pommes noisettes (surgelées)', 'congel', 'g', 210, 3, 27, 10),
  I('tortilla', 'Tortilla de blé', 'placard', 'pc', 300, 8.5, 50, 7, { pw: 40 }),
  I('pain_burger', 'Pain à hamburger', 'placard', 'pc', 270, 9, 48, 4.5, { pw: 82 }),
  I('pain_mie', 'Pain de mie (tranche)', 'placard', 'pc', 270, 8.5, 49, 4, { pw: 25 }),
  I('pain', 'Pain / baguette', 'placard', 'g', 270, 9, 55, 1.5, { pw: 250 }),
  I('flocons_avoine', "Flocons d'avoine", 'placard', 'g', 370, 13.5, 58, 7),
  I('muesli', 'Muesli', 'placard', 'g', 430, 9, 60, 16),
  I('cereales', 'Céréales petit-déjeuner', 'placard', 'g', 385, 7, 84, 2),
  I('farine', 'Farine', 'placard', 'g', 340, 10, 72, 1),
  I('pate_tarte', 'Pâte à tarte (tout type)', 'frigo', 'pc', 400, 6, 40, 24, { pw: 230 }),
  I('pate_feuilletee', 'Pâte feuilletée', 'frigo', 'pc', 400, 6, 38, 25, { pw: 230, fam: 'pate_tarte' }),
  I('pate_brisee', 'Pâte brisée', 'frigo', 'pc', 390, 6, 44, 21, { pw: 230, fam: 'pate_tarte' }),

  // ---------- Légumes, fruits, légumineuses ----------
  I('poivron', 'Poivron', 'frigo', 'g', 28, 1, 5, 0.3, { pw: 150 }),
  I('poivrons_surgeles', 'Poivrons en lanières (surgelés)', 'congel', 'g', 28, 1, 5, 0.3, { fam: 'poivron' }),
  I('oignon', 'Oignon', 'placard', 'g', 40, 1.2, 7.5, 0.2, { pw: 100 }),
  I('tomate', 'Tomate', 'frigo', 'g', 19, 0.8, 3, 0.2, { pw: 120 }),
  I('tomates_concassees', 'Tomates concassées (boîte)', 'placard', 'g', 25, 1.2, 4, 0.2),
  I('sauce_tomate', 'Sauce / coulis de tomate', 'placard', 'g', 45, 1.5, 7, 1),
  I('champignons', 'Champignons', 'frigo', 'g', 22, 2.5, 1, 0.4),
  I('champignons_boite', 'Champignons en boîte', 'placard', 'g', 22, 2.2, 1, 0.4, { fam: 'champignons' }),
  I('mais', 'Maïs (boîte)', 'placard', 'g', 100, 3, 17, 1.5),
  I('petits_pois', 'Petits pois', 'congel', 'g', 70, 5, 10, 0.5),
  I('haricots_rouges', 'Haricots rouges (boîte)', 'placard', 'g', 100, 7, 13, 0.5),
  I('pois_chiches', 'Pois chiches (boîte)', 'placard', 'g', 120, 7, 15, 2.5),
  I('courgette', 'Courgette', 'frigo', 'g', 16, 1.2, 2, 0.3, { pw: 250 }),
  I('carotte', 'Carotte', 'frigo', 'g', 36, 0.8, 7, 0.3, { pw: 100 }),
  I('salade', 'Salade verte', 'frigo', 'g', 15, 1.3, 1.5, 0.2, { pw: 250 }),
  I('haricots_verts', 'Haricots verts', 'congel', 'g', 30, 2, 4, 0.2),
  I('brocoli', 'Brocoli', 'congel', 'g', 30, 3, 2.5, 0.4),
  I('epinards', 'Épinards', 'congel', 'g', 25, 3, 1, 0.5),
  I('banane', 'Banane', 'placard', 'g', 90, 1.1, 20, 0.3, { pw: 120 }),
  I('pomme', 'Pomme', 'placard', 'g', 53, 0.3, 11.5, 0.3, { pw: 150 }),
  I('fruits_rouges', 'Fruits rouges (surgelés)', 'congel', 'g', 45, 1, 7, 0.3),

  // ---------- Sauces, épicerie ----------
  I('sauce_tikka', 'Sauce tikka masala (bocal)', 'placard', 'g', 100, 1.5, 8, 6.5),
  I('sauce_fajita', 'Sauce fajita / salsa', 'placard', 'g', 50, 1.5, 8, 1),
  I('lait_coco', 'Lait de coco', 'placard', 'ml', 180, 1.5, 3, 18),
  I('sauce_poivre', 'Sauce au poivre (froide)', 'frigo', 'g', 380, 1, 6, 39),
  I('mayonnaise', 'Mayonnaise', 'frigo', 'g', 700, 1.3, 1, 77),
  I('ketchup', 'Ketchup', 'placard', 'g', 110, 1.3, 24, 0.2),
  I('miel', 'Miel', 'placard', 'g', 320, 0.4, 80, 0),
  I('whey', 'Protéine whey', 'placard', 'g', 380, 78, 6, 6),
  I('chocolat_noir', 'Chocolat noir', 'placard', 'g', 540, 7, 44, 36),

  // ---------- Viandes, poissons (suite) ----------
  I('saucisse', 'Saucisse (Toulouse…)', 'frigo', 'g', 270, 15, 1, 23, { pw: 100 }),
  I('chipolata', 'Chipolatas', 'frigo', 'g', 260, 14, 1, 22, { pw: 55, fam: 'saucisse' }),
  I('merguez', 'Merguez', 'frigo', 'g', 290, 14, 1, 26, { pw: 55, fam: 'saucisse' }),
  I('knacki', 'Saucisses de Strasbourg', 'frigo', 'g', 270, 12, 1.5, 24, { pw: 35, fam: 'saucisse' }),
  I('dinde', 'Escalope de dinde', 'frigo', 'g', 105, 23.5, 0, 1.2, { pw: 130, fam: 'poulet' }),
  I('porc', 'Porc (côte, filet, échine)', 'frigo', 'g', 160, 21, 0, 8.5),
  I('jambon_cru', 'Jambon cru', 'frigo', 'g', 240, 27, 0.5, 14, { pw: 15 }),
  I('bacon', 'Bacon', 'frigo', 'g', 130, 20, 1, 5, { pw: 15 }),
  I('chorizo', 'Chorizo', 'frigo', 'g', 450, 24, 2, 38),
  I('cordon_bleu', 'Cordon bleu', 'frigo', 'g', 230, 14, 15, 13, { pw: 100 }),
  I('nuggets', 'Nuggets de poulet', 'congel', 'g', 250, 14, 18, 13, { pw: 20 }),
  I('saumon_fume', 'Saumon fumé', 'frigo', 'g', 180, 22, 0.5, 10, { pw: 30 }),
  I('crevettes', 'Crevettes', 'frigo', 'g', 95, 21, 0, 1.3),
  I('poisson_blanc', 'Poisson blanc (cabillaud, colin…)', 'congel', 'g', 80, 18, 0, 0.7, { pw: 125 }),
  I('sardines', 'Sardines (boîte)', 'placard', 'g', 200, 24, 0, 12),
  I('maquereau', 'Maquereau (boîte)', 'placard', 'g', 220, 16, 2, 16),

  // ---------- Produits laitiers (suite) ----------
  I('lait_entier', 'Lait entier', 'placard', 'ml', 65, 3.3, 4.7, 3.6, { fam: 'lait' }),
  I('lait_ecreme', 'Lait écrémé', 'placard', 'ml', 34, 3.4, 4.9, 0.1, { fam: 'lait' }),
  I('comte', 'Comté', 'frigo', 'g', 410, 28, 0, 34),
  I('raclette', 'Fromage à raclette', 'frigo', 'g', 340, 23, 0, 27),
  I('feta', 'Feta', 'frigo', 'g', 265, 16, 1, 22),
  I('camembert', 'Camembert / brie', 'frigo', 'g', 280, 20, 0.5, 22),
  I('ricotta', 'Ricotta', 'frigo', 'g', 150, 8, 4, 11),
  I('mascarpone', 'Mascarpone', 'frigo', 'g', 430, 5, 4, 45),
  I('yaourt_fruits', 'Yaourt aux fruits / aromatisé', 'frigo', 'g', 95, 3.5, 14, 2.5, { pw: 125 }),
  I('dessert_lacte', 'Dessert lacté (liégeois, crème dessert…)', 'frigo', 'g', 140, 3.5, 20, 5, { pw: 100 }),

  // ---------- Féculents, épicerie (suite) ----------
  I('lentilles', 'Lentilles', 'placard', 'g', 330, 24, 48, 1.5),
  I('quinoa', 'Quinoa', 'placard', 'g', 360, 13, 62, 6),
  I('boulgour', 'Boulgour', 'placard', 'g', 350, 12, 70, 1.5),
  I('puree_flocons', 'Purée en flocons', 'placard', 'g', 350, 8, 77, 1),
  I('raviolis_frais', 'Raviolis / pâtes farcies fraîches', 'frigo', 'g', 230, 9, 30, 8),
  I('raviolis_boite', 'Raviolis en boîte', 'placard', 'g', 90, 3.5, 12, 3),
  I('plat_cuisine', 'Plat cuisiné (lasagnes, cassoulet…)', 'frigo', 'g', 130, 7, 13, 5),
  I('pizza', 'Pizza', 'congel', 'g', 240, 10, 28, 9),
  I('soupe', 'Soupe', 'frigo', 'ml', 35, 1, 5, 1.2),
  I('biscottes', 'Biscottes', 'placard', 'g', 400, 11, 72, 6),
  I('brioche', 'Brioche', 'placard', 'g', 370, 8, 52, 14),
  I('croissant', 'Croissant', 'congel', 'pc', 420, 8, 45, 22, { pw: 50 }),
  I('pain_chocolat', 'Pain au chocolat', 'congel', 'pc', 420, 7, 46, 23, { pw: 65 }),
  I('biscuits', 'Biscuits / gâteaux', 'placard', 'g', 470, 6, 68, 19),
  I('chips', 'Chips / biscuits apéro', 'placard', 'g', 530, 6, 52, 32),
  I('pate_tartiner', 'Pâte à tartiner', 'placard', 'g', 540, 6, 57, 31),
  I('confiture', 'Confiture', 'placard', 'g', 250, 0.5, 60, 0),
  I('compote', 'Compote', 'placard', 'g', 70, 0.3, 16, 0.2, { pw: 100 }),
  I('chocolat_lait', 'Chocolat au lait', 'placard', 'g', 540, 7, 57, 31),
  I('noix', 'Noix, amandes, fruits secs', 'placard', 'g', 600, 18, 15, 50),
  I('glace', 'Glace', 'congel', 'ml', 110, 2, 14, 5),
  I('preparation_dessert', 'Préparation pour dessert (flan…)', 'placard', 'g', 380, 1, 90, 1),

  // ---------- Fruits & légumes (suite) ----------
  I('orange', 'Orange', 'placard', 'g', 45, 0.9, 9, 0.2, { pw: 200 }),
  I('clementine', 'Clémentine / mandarine', 'placard', 'g', 47, 0.8, 10, 0.2, { pw: 70 }),
  I('poire', 'Poire', 'placard', 'g', 55, 0.4, 12, 0.2, { pw: 170 }),
  I('kiwi', 'Kiwi', 'placard', 'g', 55, 1, 11, 0.6, { pw: 80 }),
  I('fraise', 'Fraises', 'frigo', 'g', 33, 0.7, 6, 0.3),
  I('raisin', 'Raisin', 'frigo', 'g', 70, 0.6, 16, 0.2),
  I('avocat', 'Avocat', 'placard', 'g', 200, 2, 1, 20, { pw: 200 }),
  I('concombre', 'Concombre', 'frigo', 'g', 13, 0.6, 2, 0.1, { pw: 300 }),
  I('aubergine', 'Aubergine', 'frigo', 'g', 22, 1, 3.5, 0.2, { pw: 300 }),
  I('poireau', 'Poireau', 'frigo', 'g', 30, 1.3, 5, 0.3, { pw: 150 }),
  I('chou_fleur', 'Chou-fleur', 'frigo', 'g', 25, 2, 3, 0.3),
  I('melange_legumes', 'Mélange / poêlée de légumes', 'congel', 'g', 45, 2, 6, 1),

  // ---------- Boissons ----------
  I('jus', 'Jus de fruits', 'placard', 'ml', 45, 0.5, 10, 0),
  I('soda', 'Soda (cola, limonade…)', 'placard', 'ml', 42, 0, 10.6, 0),
  I('soda_zero', 'Soda zéro / light', 'placard', 'ml', 1, 0, 0, 0),
  I('boisson_energisante', 'Boisson énergisante', 'placard', 'ml', 46, 0, 11, 0),
  I('sirop', 'Sirop (pur, à diluer)', 'placard', 'ml', 270, 0, 67, 0),

  // ---------- Ingrédients de base (toujours dispo, jamais déduits) ----------
  I('huile', 'Huile', 'placard', 'ml', 900, 0, 0, 100, { base: true }),
  I('sel_poivre', 'Sel & poivre', 'placard', 'g', 0, 0, 0, 0, { base: true }),
  I('epices', 'Épices & herbes', 'placard', 'g', 300, 12, 40, 10, { base: true }),
  I('ail', 'Ail', 'placard', 'g', 130, 6, 25, 0.5, { base: true }),
  I('moutarde', 'Moutarde', 'frigo', 'g', 150, 7, 5, 11, { base: true }),
  I('sauce_soja', 'Sauce soja', 'placard', 'ml', 60, 8, 6, 0, { base: true }),
  I('sucre', 'Sucre', 'placard', 'g', 400, 0, 100, 0, { base: true }),
  I('levure', 'Levure chimique', 'placard', 'g', 0, 0, 0, 0, { base: true }),
  I('bouillon', 'Bouillon cube', 'placard', 'g', 0, 0, 0, 0, { base: true }),
  I('citron', 'Citron / jus de citron', 'frigo', 'ml', 25, 0.4, 2.5, 0.2, { base: true }),
];

/* ---------------------------------------------------------------------
   Recettes — quantités POUR 1 PERSONNE.
   R(id, nom, type, minutes, source, ingrédients, étapes, extra)
     type : 'pdj' (petit-déjeuner) | 'plat' | 'collation'
     ingrédients : [id, quantité] ou [id, quantité, 'opt'] (facultatif : utilisé si tu l'as)
     source : lien vers la recette d'origine (réécrite et adaptée), ou '' pour un classique maison
     extra.boite : se garde bien en boîte (tupperware)
   --------------------------------------------------------------------- */
const R = (id, name, type, time, src, ings, steps, extra = {}) =>
  ({ id, name, type, time, src, ings: ings.map(([ing, q, o]) => ({ ing, q, opt: o === 'opt' })), steps, ...extra });

const RECIPES = [
  R('fajitas_poulet', 'Fajitas au poulet et poivrons', 'plat', 25,
    'https://www.circulaire-en-ligne.ca/recette/fajitas-poulet-aux-poivrons',
    [['poulet', 150], ['poivron', 100], ['oignon', 50], ['tortilla', 2], ['sauce_fajita', 40, 'opt'], ['emmental', 20, 'opt'], ['creme', 20, 'opt'], ['huile', 5], ['epices', 3]],
    ['Émincer le poulet, le poivron et l\'oignon en lanières.',
     'Faire revenir l\'oignon et le poivron 5 min dans l\'huile, à feu vif.',
     'Ajouter le poulet et les épices fajita, cuire 6–8 min jusqu\'à ce qu\'il soit bien cuit. Ajouter la sauce si tu en as.',
     'Réchauffer les tortillas 20 s à la poêle, garnir, ajouter fromage et crème, rouler.'], { boite: true }),

  R('tikka_masala', 'Poulet tikka masala et riz', 'plat', 35,
    'https://www.demotivateur.fr/food/recette/poulet-tikka-masala-1288',
    [['poulet', 150], ['sauce_tikka', 110], ['riz', 75], ['oignon', 40, 'opt'], ['creme', 20, 'opt'], ['huile', 5]],
    ['Lancer la cuisson du riz (environ 12 min dans l\'eau salée).',
     'Couper le poulet en cubes, le faire dorer dans l\'huile avec l\'oignon émincé.',
     'Verser la sauce tikka masala, couvrir et laisser mijoter 15 min.',
     'Ajouter la crème hors du feu et servir avec le riz.'], { boite: true }),

  R('gnocchi_carbonara', 'Gnocchis poêlés façon carbonara', 'plat', 15,
    'https://www.24matins.fr/ces-gnocchis-carbonara-a-la-poele-changent-la-recette-en-15-min-1421272',
    [['gnocchi', 250], ['lardons', 60], ['creme', 40], ['oignon', 30, 'opt'], ['parmesan', 10, 'opt'], ['sel_poivre', 1]],
    ['Faire dorer les lardons et l\'oignon à sec, puis les réserver.',
     'Dans la même poêle, faire dorer les gnocchis en une seule couche, 6–8 min, en les retournant.',
     'Remettre les lardons, verser la crème, poivrer et laisser épaissir 1 min.',
     'Parsemer de parmesan.']),

  R('carbonara_creme', 'Pâtes carbonara à la française', 'plat', 20,
    'https://dubocalalassiette.fr/blog/spaghetti-carbonara-a-la-creme/',
    [['pates', 100], ['lardons', 60], ['creme', 50], ['oeuf', 1, 'opt'], ['oignon', 30, 'opt'], ['parmesan', 15, 'opt'], ['sel_poivre', 1]],
    ['Cuire les pâtes al dente.',
     'Faire revenir doucement les lardons avec l\'oignon émincé.',
     'Mélanger crème, jaune d\'œuf et parmesan dans un bol.',
     'Hors du feu, mélanger les pâtes égouttées, les lardons et la crème. Poivrer généreusement.']),

  R('burger_maison', 'Burger maison', 'plat', 20,
    'https://www.elle.be/fr/3825-recette-lundi-burger-maison-sauce-yaourt.html',
    [['pain_burger', 1], ['boeuf_hache', 125], ['fromage_fondu', 20], ['tomate', 50, 'opt'], ['salade', 15, 'opt'], ['oignon', 20, 'opt'], ['ketchup', 15, 'opt'], ['sel_poivre', 1]],
    ['Saler et poivrer le steak, le cuire 3 min de chaque côté à la poêle bien chaude.',
     'Poser la tranche de fromage sur le steak en fin de cuisson pour qu\'elle fonde.',
     'Toaster le pain coupé en deux.',
     'Monter : sauce, salade, tomate, steak, oignon, chapeau.']),

  R('chili_con_carne', 'Chili con carne', 'plat', 40,
    'https://uneplumedanslacuisine.com/2024/01/chili-con-carne',
    [['boeuf_hache', 125], ['haricots_rouges', 100], ['tomates_concassees', 120], ['oignon', 50], ['riz', 60, 'opt'], ['epices', 3], ['huile', 5]],
    ['Faire revenir l\'oignon émincé dans l\'huile, puis la viande à feu vif en l\'émiettant.',
     'Ajouter les épices (cumin, paprika, chili), puis les tomates concassées.',
     'Ajouter les haricots rouges égouttés et laisser mijoter 20 min.',
     'Servir avec du riz.'], { boite: true }),

  R('quiche_lorraine', 'Quiche lorraine', 'plat', 50,
    'https://www.demotivateur.fr/food/recette/quiche-lorraine-traditionnelle-1560',
    [['pate_tarte', 0.25], ['lardons', 50], ['oeuf', 1], ['creme', 50], ['lait', 30, 'opt'], ['emmental', 15, 'opt'], ['sel_poivre', 1]],
    ['Préchauffer le four à 180 °C. Étaler la pâte dans un moule et la piquer.',
     'Faire revenir les lardons à sec, les répartir sur la pâte.',
     'Battre œufs, crème, lait, muscade, sel et poivre. Verser sur les lardons, parsemer de fromage.',
     'Cuire 35–40 min jusqu\'à ce que la quiche soit dorée.'], { boite: true }),

  R('bolognaise', 'Spaghetti bolognaise', 'plat', 40,
    'https://www.circulaire-en-ligne.ca/recette/spaghettis-bolognaise-faciles',
    [['pates', 100], ['boeuf_hache', 100], ['tomates_concassees', 100], ['sauce_tomate', 50, 'opt'], ['oignon', 40], ['emmental', 15, 'opt'], ['huile', 5], ['epices', 2]],
    ['Faire revenir l\'oignon haché dans l\'huile, puis la viande en l\'émiettant.',
     'Ajouter les tomates, la sauce tomate et les herbes, laisser mijoter 20 min à feu doux.',
     'Cuire les pâtes al dente.',
     'Servir la sauce sur les pâtes, avec du fromage.'], { boite: true }),

  R('tarte_chevre_tomate', 'Tarte feuilletée chèvre et tomate', 'plat', 40,
    'https://www.quiveutdufromage.com/r-tarte-tomate-chevre',
    [['pate_tarte', 0.25], ['chevre', 60], ['tomate', 120], ['moutarde', 8], ['huile', 3], ['epices', 1]],
    ['Préchauffer le four à 180 °C. Étaler la pâte dans un moule.',
     'Badigeonner le fond de moutarde.',
     'Alterner rondelles de tomate et de chèvre, ajouter herbes et un filet d\'huile.',
     'Cuire environ 35 min. Se mange chaud ou tiède.'], { boite: true }),

  R('pancakes_proteines', 'Pancakes protéinés au fromage blanc', 'pdj', 15,
    'https://www.mrcook.app/recipes/018e2a1c-9d68-75ad-aaaf-c6ec810fb9f4',
    [['flocons_avoine', 50], ['fromage_blanc', 100], ['oeuf', 1], ['lait', 30, 'opt'], ['whey', 15, 'opt'], ['levure', 2], ['huile', 2]],
    ['Mixer les flocons d\'avoine en poudre.',
     'Ajouter fromage blanc, œuf, lait, whey et levure, mixer jusqu\'à obtenir une pâte lisse.',
     'Cuire de petites louches dans une poêle huilée ; retourner quand des bulles apparaissent.',
     'Servir avec des fruits ou un peu de miel.']),

  R('curry_coco', 'Curry de poulet au lait de coco', 'plat', 30,
    'https://www.demotivateur.fr/food/curry-de-poulet-cremeux-50948',
    [['poulet', 150], ['lait_coco', 100], ['riz', 75], ['oignon', 40, 'opt'], ['tomate', 60, 'opt'], ['epices', 4], ['huile', 5]],
    ['Lancer la cuisson du riz.',
     'Faire dorer le poulet en morceaux avec l\'oignon dans l\'huile.',
     'Ajouter le curry, mélanger 1 min, puis la tomate en dés et le lait de coco.',
     'Laisser mijoter 10–15 min et servir avec le riz.'], { boite: true }),

  R('hachis_parmentier', 'Hachis parmentier', 'plat', 60,
    'https://www.demotivateur.fr/food/recette-hachis-parmentier-12824',
    [['boeuf_hache', 130], ['pdt', 250], ['lait', 60], ['beurre', 10], ['emmental', 25], ['oignon', 30, 'opt'], ['sel_poivre', 1]],
    ['Cuire les pommes de terre épluchées 20 min dans l\'eau salée, les écraser avec le lait et le beurre.',
     'Faire revenir l\'oignon et la viande, saler, poivrer.',
     'Dans un plat : la viande, puis la purée, puis le fromage.',
     'Gratiner 20 min à 200 °C.'], { boite: true }),

  R('riz_cantonais', 'Riz cantonais', 'plat', 25,
    'https://mesrecettes.leclerc/fr/pdf/recette/895',
    [['riz', 60], ['oeuf', 1], ['jambon', 40], ['petits_pois', 50], ['oignon', 25, 'opt'], ['sauce_soja', 10], ['huile', 5]],
    ['Cuire le riz et le laisser refroidir (idéalement la veille).',
     'Faire une omelette fine, la couper en lanières.',
     'Faire revenir l\'oignon, le jambon en dés et les petits pois.',
     'Ajouter le riz, la sauce soja et l\'omelette, faire sauter 3 min.'], { boite: true }),

  R('quesadillas_poulet', 'Quesadillas poulet fromage', 'plat', 15,
    'https://www.circulaire-en-ligne.ca/recette/quesadillas-au-poulet-et-au-fromage',
    [['tortilla', 2], ['poulet', 100], ['emmental', 40], ['poivron', 50, 'opt'], ['sauce_fajita', 20, 'opt'], ['huile', 3], ['epices', 2]],
    ['Cuire le poulet émincé avec le poivron et les épices.',
     'Garnir la moitié d\'une tortilla de poulet et de fromage, replier.',
     'Dorer 2–3 min de chaque côté à la poêle avec un couvercle pour faire fondre le fromage.',
     'Couper en triangles, servir avec la sauce.']),

  R('salade_pates_surimi', 'Salade de pâtes surimi et maïs', 'plat', 20,
    'https://www.circulaire-en-ligne.ca/recette/salade-de-pates-au-surimi',
    [['pates', 80], ['surimi', 80], ['mais', 60], ['mayonnaise', 20], ['tomate', 60, 'opt'], ['oeuf', 1, 'opt']],
    ['Cuire les pâtes, les refroidir à l\'eau froide.',
     'Couper le surimi et la tomate en morceaux, l\'œuf dur en quartiers.',
     'Mélanger avec le maïs égoutté et la mayonnaise.',
     'Servir bien frais.'], { boite: true }),

  R('coquillettes_jambon', 'Coquillettes jambon emmental gratinées', 'plat', 30,
    'https://www.demotivateur.fr/food/recette-des-coquillettes-gratinees-au-jambon-et-fromage-pour-4-personnes-un-repas-familial-pas-cher-et-reconfortant-47191',
    [['pates', 110], ['jambon', 60], ['creme', 40], ['emmental', 30], ['sel_poivre', 1]],
    ['Cuire les coquillettes juste al dente.',
     'Mélanger avec le jambon en dés, la crème et la moitié du fromage.',
     'Verser dans un plat, couvrir du reste de fromage.',
     'Gratiner 15–20 min à 200 °C.'], { boite: true }),

  R('pates_poulet_champignons', 'Pâtes poulet, crème et champignons', 'plat', 25,
    'https://www.cuisineculinaire.com/pates-poulet-sauce-cremeuse-champignons',
    [['pates', 100], ['poulet', 120], ['champignons', 80], ['creme', 50], ['oignon', 30, 'opt'], ['parmesan', 10, 'opt'], ['huile', 5]],
    ['Cuire les pâtes.',
     'Dorer le poulet en morceaux dans l\'huile, réserver.',
     'Faire revenir l\'oignon et les champignons, ajouter la crème et remettre le poulet.',
     'Mélanger avec les pâtes égouttées, ajouter le parmesan.'], { boite: true }),

  R('shakshuka', 'Shakshuka (œufs à la tomate)', 'plat', 30,
    'https://guide-alimentaire.canada.ca/fr/recettes/chakchouka',
    [['oeuf', 2], ['tomates_concassees', 200], ['poivron', 80], ['oignon', 50], ['pain', 60, 'opt'], ['epices', 2], ['huile', 5]],
    ['Faire revenir l\'oignon et le poivron émincés 8 min dans l\'huile.',
     'Ajouter les épices (cumin, paprika) puis les tomates, laisser mijoter 10 min.',
     'Creuser des puits, y casser les œufs, couvrir et cuire 5–7 min.',
     'Servir avec du pain pour saucer.']),

  R('tartiflette', 'Tartiflette', 'plat', 50,
    'https://www.tourisme-haute-savoie.com/gastronomie/recettes-de-haute-savoie/tartiflette-ou-pela/',
    [['pdt', 300], ['lardons', 50], ['oignon', 50], ['reblochon', 110], ['creme', 25, 'opt'], ['sel_poivre', 1]],
    ['Cuire les pommes de terre 20 min à l\'eau, les couper en rondelles.',
     'Faire revenir l\'oignon et les lardons.',
     'Mélanger dans un plat avec la crème, poser le reblochon coupé en deux, croûte vers le haut.',
     'Cuire 25 min à 200 °C.']),

  R('couscous_poulet', 'Couscous poulet et légumes (simplifié)', 'plat', 45,
    'https://www.quechoisir.org/conseils-recette-de-cuisine-couscous-au-poulet-potiron-et-chou-n113398',
    [['semoule', 70], ['poulet', 150], ['carotte', 80], ['courgette', 100], ['pois_chiches', 60, 'opt'], ['oignon', 30, 'opt'], ['epices', 3], ['bouillon', 3], ['huile', 5]],
    ['Faire dorer le poulet et l\'oignon dans l\'huile avec le ras-el-hanout.',
     'Ajouter les carottes et le bouillon, couvrir d\'eau et cuire 20 min.',
     'Ajouter les courgettes et les pois chiches, cuire encore 10 min.',
     'Préparer la semoule à l\'eau bouillante, l\'égrainer à la fourchette et servir.'], { boite: true }),

  R('porridge_banane', 'Porridge à la banane', 'pdj', 10,
    'https://www.demotivateur.fr/food/recette/porridge-proteine-et-healthy-aux-bananes-1724',
    [['flocons_avoine', 50], ['lait', 200], ['banane', 120], ['fromage_blanc', 100, 'opt'], ['miel', 10, 'opt']],
    ['Chauffer le lait avec les flocons d\'avoine 5 min en remuant.',
     'Ajouter la moitié de la banane écrasée.',
     'Hors du feu, ajouter le fromage blanc pour plus de protéines.',
     'Garnir avec le reste de banane et un filet de miel.']),

  R('pates_thon', 'Pâtes au thon et sauce tomate', 'plat', 20,
    'https://www.croq-kilos.com/actus/recette-de-pates-au-thon-rapide-et-economique',
    [['pates', 100], ['thon', 70], ['sauce_tomate', 120], ['oignon', 30, 'opt'], ['emmental', 15, 'opt'], ['epices', 1], ['huile', 3]],
    ['Cuire les pâtes, garder un peu d\'eau de cuisson.',
     'Faire revenir l\'oignon, ajouter la sauce tomate et les herbes.',
     'Ajouter le thon émietté hors du feu (il ne doit que chauffer).',
     'Mélanger aux pâtes avec un peu d\'eau de cuisson.'], { boite: true }),

  // ---------- Classiques maison (sans source) ----------
  R('omelette_fromage', 'Omelette au fromage', 'plat', 10, '',
    [['oeuf', 3], ['emmental', 25], ['lait', 20, 'opt'], ['huile', 3], ['sel_poivre', 1]],
    ['Battre les œufs avec le lait, saler, poivrer.', 'Verser dans la poêle huilée chaude.', 'Ajouter le fromage quand le dessous est pris, plier et servir.']),

  R('oeufs_brouilles', 'Œufs brouillés et tartines', 'pdj', 10, '',
    [['oeuf', 3], ['pain', 60], ['beurre', 5, 'opt'], ['sel_poivre', 1]],
    ['Battre les œufs, les cuire à feu doux en remuant sans arrêt.', 'Retirer du feu quand ils sont encore crémeux.', 'Servir avec le pain grillé.']),

  R('bowl_fromage_blanc', 'Bowl fromage blanc, muesli et fruits', 'pdj', 5, '',
    [['fromage_blanc', 200], ['muesli', 40], ['fruits_rouges', 80, 'opt'], ['banane', 60, 'opt'], ['miel', 10, 'opt']],
    ['Verser le fromage blanc dans un bol.', 'Ajouter le muesli et les fruits.', 'Un filet de miel si besoin.']),

  R('yaourt_grec_fruits', 'Yaourt grec et fruits rouges', 'collation', 3, '',
    [['yaourt_grec', 150], ['fruits_rouges', 60, 'opt'], ['miel', 8, 'opt']],
    ['Mélanger le yaourt et les fruits, ajouter un peu de miel.']),

  R('steak_pates', 'Steak haché et pâtes', 'plat', 15, '',
    [['boeuf_hache', 125], ['pates', 100], ['emmental', 15, 'opt'], ['ketchup', 15, 'opt'], ['sel_poivre', 1]],
    ['Cuire les pâtes.', 'Cuire le steak 3 min de chaque côté.', 'Servir avec du fromage râpé.']),

  R('steak_frites', 'Steak haché et frites au four', 'plat', 30, '',
    [['boeuf_hache', 125], ['frites_four', 200], ['ketchup', 15, 'opt'], ['sel_poivre', 1]],
    ['Cuire les frites au four selon le paquet (environ 25 min à 220 °C).', 'Cuire le steak 3 min de chaque côté.', 'Servir.']),

  R('poulet_riz_legumes', 'Poulet, riz et légumes (meal prep)', 'plat', 25, '',
    [['poulet', 150], ['riz', 75], ['poivron', 100], ['epices', 2], ['sauce_soja', 5], ['huile', 5]],
    ['Cuire le riz.', 'Faire sauter le poulet en dés, puis les légumes, avec épices et sauce soja.', 'Répartir dans les boîtes.'], { boite: true }),

  R('poisson_pane_puree', 'Poisson pané et purée', 'plat', 25, '',
    [['poisson_pane', 150], ['pdt', 250], ['lait', 50], ['beurre', 10], ['sel_poivre', 1]],
    ['Cuire les pommes de terre 20 min, les écraser avec lait et beurre.', 'Cuire les bâtonnets au four ou à la poêle.', 'Servir.']),

  R('croque_monsieur', 'Croque-monsieur', 'plat', 15, '',
    [['pain_mie', 2], ['jambon', 40], ['emmental', 30], ['beurre', 5]],
    ['Beurrer l\'extérieur des tranches.', 'Garnir de jambon et de fromage.', 'Cuire à la poêle ou au four jusqu\'à ce que ce soit doré.']),

  R('wraps_poulet', 'Wraps poulet crudités', 'plat', 15, '',
    [['tortilla', 2], ['poulet', 100], ['salade', 20], ['tomate', 50], ['fromage_blanc', 30, 'opt'], ['epices', 1], ['huile', 3]],
    ['Cuire le poulet émincé avec les épices.', 'Mélanger le fromage blanc avec herbes, sel et poivre pour la sauce.', 'Garnir les tortillas et rouler.']),
];

/* ---------------------------------------------------------------------
   Visuels : emoji de chaque ingrédient et de chaque recette, rayons pour la liste de courses
   --------------------------------------------------------------------- */
const EMO = {
  poulet: '🍗', aiguillettes_poulet: '🍗', cuisse_poulet: '🍗', dinde: '🍗', cordon_bleu: '🍗', nuggets: '🍗',
  boeuf_hache: '🥩', steak_hache_15: '🥩', steak_hache_5: '🥩', viande_hachee_20: '🥩', porc: '🥩',
  lardons: '🥓', bacon: '🥓', jambon: '🍖', jambon_cru: '🍖', chorizo: '🌭', saucisse: '🌭', chipolata: '🌭', merguez: '🌭', knacki: '🌭',
  surimi: '🦀', thon: '🐟', poisson_pane: '🐟', poisson_blanc: '🐟', saumon: '🐟', saumon_fume: '🐟', sardines: '🐟', maquereau: '🐟', crevettes: '🦐',
  oeuf: '🥚', lait: '🥛', lait_entier: '🥛', lait_ecreme: '🥛', creme: '🥛', creme_12: '🥛', creme_18: '🥛', creme_30: '🥛',
  fromage_blanc: '🥣', fromage_blanc_0: '🥣', skyr: '🥣', yaourt: '🥣', yaourt_grec: '🥣', yaourt_fruits: '🍓', dessert_lacte: '🍮',
  emmental: '🧀', mozzarella: '🧀', chevre: '🧀', fromage_fondu: '🧀', reblochon: '🧀', parmesan: '🧀', fromage_frais: '🧀', comte: '🧀',
  raclette: '🧀', feta: '🧀', camembert: '🧀', ricotta: '🧀', mascarpone: '🧀', beurre: '🧈',
  pates: '🍝', coquillettes: '🍝', macaroni: '🍝', spaghetti: '🍝', penne: '🍝', capellini: '🍝', tagliatelles: '🍝',
  riz: '🍚', semoule: '🍚', quinoa: '🌾', boulgour: '🌾', lentilles: '🫘', gnocchi: '🥔', pdt: '🥔', puree_flocons: '🥔',
  frites_four: '🍟', pommes_noisettes: '🥔', tortilla: '🫓', pain_burger: '🍔', pain_mie: '🍞', pain: '🥖', biscottes: '🍞', brioche: '🍞',
  flocons_avoine: '🌾', muesli: '🥣', cereales: '🥣', farine: '🌾', pate_tarte: '🥧', pate_feuilletee: '🥧', pate_brisee: '🥧',
  raviolis_frais: '🥟', raviolis_boite: '🥫', plat_cuisine: '🍲', pizza: '🍕', soupe: '🍲', croissant: '🥐', pain_chocolat: '🥐',
  biscuits: '🍪', chips: '🥨', pate_tartiner: '🍫', confiture: '🍓', compote: '🍏', chocolat_noir: '🍫', chocolat_lait: '🍫', noix: '🥜',
  glace: '🍨', preparation_dessert: '🍮', whey: '💪', miel: '🍯',
  poivron: '🫑', poivrons_surgeles: '🫑', oignon: '🧅', tomate: '🍅', tomates_concassees: '🥫', sauce_tomate: '🥫', champignons: '🍄', champignons_boite: '🍄',
  mais: '🌽', petits_pois: '🫛', haricots_rouges: '🫘', pois_chiches: '🫘', courgette: '🥒', carotte: '🥕', salade: '🥬', haricots_verts: '🫛',
  brocoli: '🥦', epinards: '🥬', concombre: '🥒', aubergine: '🍆', poireau: '🥬', chou_fleur: '🥦', melange_legumes: '🥦', avocat: '🥑',
  banane: '🍌', pomme: '🍎', fruits_rouges: '🫐', orange: '🍊', clementine: '🍊', poire: '🍐', kiwi: '🥝', fraise: '🍓', raisin: '🍇',
  sauce_tikka: '🍛', sauce_fajita: '🌶️', lait_coco: '🥥', sauce_poivre: '🫙', mayonnaise: '🫙', ketchup: '🍅',
  jus: '🧃', soda: '🥤', soda_zero: '🥤', boisson_energisante: '⚡', sirop: '🧃',
  huile: '🫒', sel_poivre: '🧂', epices: '🌿', ail: '🧄', moutarde: '🫙', sauce_soja: '🫙', sucre: '🍬', levure: '🧁', bouillon: '🫙', citron: '🍋',
};
const REMO = {
  fajitas_poulet: '🌯', tikka_masala: '🍛', gnocchi_carbonara: '🥔', carbonara_creme: '🍝', burger_maison: '🍔', chili_con_carne: '🌶️',
  quiche_lorraine: '🥧', bolognaise: '🍝', tarte_chevre_tomate: '🥧', pancakes_proteines: '🥞', curry_coco: '🍛', hachis_parmentier: '🥘',
  riz_cantonais: '🍚', quesadillas_poulet: '🌮', salade_pates_surimi: '🥗', coquillettes_jambon: '🧀', pates_poulet_champignons: '🍝',
  shakshuka: '🍳', tartiflette: '🧀', couscous_poulet: '🥘', porridge_banane: '🥣', pates_thon: '🐟', omelette_fromage: '🍳',
  oeufs_brouilles: '🍳', bowl_fromage_blanc: '🥣', yaourt_grec_fruits: '🍓', steak_pates: '🥩', steak_frites: '🍟',
  poulet_riz_legumes: '🍱', poisson_pane_puree: '🐟', croque_monsieur: '🥪', wraps_poulet: '🌯',
};
// Rayons de la liste de courses
const RAYONS = [
  ['fl', 'Fruits & légumes', '🥕'], ['vp', 'Viandes & poissons', '🥩'], ['cr', 'Crèmerie & œufs', '🧀'],
  ['ep', 'Épicerie', '🥫'], ['su', 'Surgelés', '❄️'], ['bo', 'Boissons', '🥤'], ['au', 'Autres', '🛒'],
];
const RAYON_OF = {};
'poivron oignon tomate champignons courgette carotte salade concombre aubergine poireau chou_fleur avocat banane pomme orange clementine poire kiwi fraise raisin pdt citron ail'.split(' ').forEach(k => RAYON_OF[k] = 'fl');
'poulet aiguillettes_poulet cuisse_poulet dinde boeuf_hache steak_hache_15 steak_hache_5 viande_hachee_20 porc lardons bacon jambon jambon_cru chorizo saucisse chipolata merguez knacki cordon_bleu surimi saumon_fume crevettes'.split(' ').forEach(k => RAYON_OF[k] = 'vp');
'oeuf lait lait_entier lait_ecreme creme creme_12 creme_18 creme_30 fromage_blanc fromage_blanc_0 skyr yaourt yaourt_grec yaourt_fruits dessert_lacte emmental mozzarella chevre fromage_fondu reblochon parmesan fromage_frais comte raclette feta camembert ricotta mascarpone beurre gnocchi pate_tarte pate_feuilletee pate_brisee raviolis_frais'.split(' ').forEach(k => RAYON_OF[k] = 'cr');
'jus soda soda_zero boisson_energisante sirop'.split(' ').forEach(k => RAYON_OF[k] = 'bo');
