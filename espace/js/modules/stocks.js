/* SOGARA · Espace de gestion — module « Stocks & bacs »
   Parc de stockage produits (bacs, jaugeages, mouvements, bilan matière, autonomie)
   + magasin pièces de rechange & consommables (articles, bons de sortie, réapprovisionnement, inventaire tournant). */
(function () {
  'use strict';
  var E = window.ERP; if (!E) return;
  var U = E.ui, F = E.fmt, S = E.store, esc = E.esc, sum = E.sum;

  /* feuille de style des modules Opérations (si la coquille ne l'a pas déjà chargée) */
  if (!document.querySelector('link[href*="operations.css"]')) { var lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = 'css/operations.css'; document.head.appendChild(lk); }

  /* ------------------------------------------------------------------ référentiel produits */
  /* prod / conso en m³ par jour (ordres de grandeur pour ~21 000 b/j de brut Rabi, schéma hydroskimming) */
  var PRODUITS = [
    { k: 'brut', l: 'Brut Rabi', c: '#5a3d28', c2: '#2b1a0e', dark: 1, prod: 0, conso: 3340, mode: 'autonomie', lblConso: 'charge des unités' },
    { k: 'butane', l: 'Butane', c: '#38bdf8', c2: '#0284c7', prod: 70, conso: 120, mode: 'autonomie', lblConso: 'ventes GPL' },
    { k: 'super', l: 'Super sans plomb', c: '#22c55e', c2: '#15803d', prod: 600, conso: 650, mode: 'autonomie', lblConso: 'marché national' },
    { k: 'kero', l: 'Kérosène / Jet A1', c: '#facc15', c2: '#d4a106', prod: 400, conso: 380, mode: 'autonomie', lblConso: 'aviation & lampant' },
    { k: 'gasoil', l: 'Gasoil', c: '#f08a24', c2: '#c2410c', prod: 835, conso: 1300, mode: 'autonomie', lblConso: 'marché national' },
    { k: 'fioul', l: 'Fioul (résidu atmosphérique)', c: '#64748b', c2: '#334155', dark: 1, prod: 1335, conso: 85, net: 1250, mode: 'saturation', lblConso: 'production nette' },
    { k: 'bitume', l: 'Bitume', c: '#2b3440', c2: '#0b0f16', dark: 1, prod: 50, conso: 45, mode: 'autonomie', lblConso: 'chantiers routiers' },
    { k: 'slops', l: 'Slops', c: '#a16207', c2: '#713f12', dark: 1, prod: 12, conso: 0, mode: 'none', lblConso: 'réinjectés en charge' }
  ];
  var PMAP = {}; PRODUITS.forEach(function (p) { PMAP[p.k] = p; });
  function P(k) { return PMAP[k] || PRODUITS[0]; }
  var STATUTS_BAC = ['En service', 'En réception', 'En expédition', 'En maintenance', 'Certifié'];
  var STAT_TONE = { 'En service': 'green', 'En réception': 'blue', 'En expédition': 'orange', 'En maintenance': 'grey', 'Certifié': 'violet' };
  var TYPES_P = {
    'Réception navire': { s: 1, tone: 'blue', icon: 'ship' },
    'Production': { s: 1, tone: 'green', icon: 'factory' },
    'Charge unité': { s: -1, tone: 'violet', icon: 'factory' },
    'Expédition camions': { s: -1, tone: 'orange', icon: 'truck' },
    'Expédition navire': { s: -1, tone: 'orange', icon: 'ship' },
    'Transfert': { s: 0, tone: 'grey', icon: 'refresh' },
    'Jaugeage': { s: 0, tone: 'yellow', icon: 'target' }
  };
  var TYPES_S = { 'Entrée': { s: 1, tone: 'green' }, 'Sortie': { s: -1, tone: 'orange' }, 'Retour': { s: 1, tone: 'blue' }, 'Inventaire': { s: 1, tone: 'violet' } };

  /* ------------------------------------------------------------------ petits utilitaires */
  function pad(n) { return String(n).padStart(2, '0'); }
  function nowHM() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function stamp() { return E.today() + ' ' + nowHM(); }
  function signed(n, dec) { return (n > 0 ? '+' : n < 0 ? '−' : '') + F.num(Math.abs(n), dec); }
  function empIdByName(part) { var e = S.all('employes').find(function (x) { return x.nom.indexOf(part) === 0; }); return e ? e.id : ''; }
  function empOpts() { return S.all('employes').map(function (e) { return { v: e.id, l: e.nom + ' — ' + e.poste }; }); }
  function prng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(s) { var x = 7; String(s).split('').forEach(function (c) { x = (x * 31 + c.charCodeAt(0)) >>> 0; }); return x; }
  function dot(c) { return '<i class="ops-dot" style="background:' + c + '"></i>'; }
  function badgeEm(t, tone) { return U.badge(t, tone).replace('<span', '<em').replace(/<\/span>$/, '</em>'); }
  function fmtStamp(s) { if (!s) return '—'; return F.dateShort(s.slice(0, 10)) + (s.length > 10 ? ' ' + s.slice(11, 16) : ''); }

  /* ------------------------------------------------------------------ calculs bacs */
  function bacs() { return S.all('bacs'); }
  function pctOf(b) { return b.capacite ? Math.max(0, Math.min(100, b.volume / b.capacite * 100)) : 0; }
  function utile(b) { return b.statut === 'En maintenance' ? 0 : Math.max(0, b.volume - b.capacite * b.min / 100); }
  function levelAlert(b) { if (b.statut === 'En maintenance') return null; var p = pctOf(b); return p >= b.max ? 'haut' : p <= b.min ? 'bas' : null; }
  function prodStats(k) {
    var p = P(k), list = bacs().filter(function (b) { return b.produit === k; });
    var actifs = list.filter(function (b) { return b.statut !== 'En maintenance'; });
    var vol = sum(list, 'volume'), cap = sum(list, 'capacite'), ut = sum(list, utile);
    var capMax = sum(actifs, function (b) { return b.capacite * b.max / 100; });
    var minPct = cap ? sum(list, function (b) { return b.capacite * b.min; }) / cap : 0;
    var days = null, lbl = '';
    if (p.mode === 'autonomie') { days = ut / p.conso; lbl = 'd\'autonomie'; }
    else if (p.mode === 'saturation') { days = Math.max(0, capMax - vol) / p.net; lbl = 'avant saturation'; }
    return { p: p, list: list, vol: vol, cap: cap, ut: ut, days: days, lbl: lbl, pct: cap ? vol / cap * 100 : 0, minPct: minPct, masse: sum(list, function (b) { return b.volume * b.densite; }) };
  }
  function daysTone(d) { return d == null ? 'grey' : d < 5 ? 'red' : d < 8 ? 'orange' : 'green'; }
  function stockFinis() { return sum(bacs().filter(function (b) { return b.produit !== 'brut' && b.produit !== 'slops'; }), 'volume'); }
  function capFinis() { return sum(bacs().filter(function (b) { return b.produit !== 'brut' && b.produit !== 'slops'; }), 'capacite'); }

  /* ------------------------------------------------------------------ calculs magasin */
  function articles() { return S.all('articles'); }
  function artStatut(a) { return a.qte <= 0 ? 'Rupture' : a.qte <= a.min ? 'Sous seuil' : a.qte > a.max ? 'Surstock' : 'Disponible'; }
  var ART_TONE = { 'Rupture': 'red', 'Sous seuil': 'orange', 'Surstock': 'violet', 'Disponible': 'green' };
  function sousSeuil() { return articles().filter(function (a) { return a.qte <= a.min; }); }
  function valeurStock() { return sum(articles(), function (a) { return a.qte * a.pu; }); }
  function rotation() { var v = valeurStock(); return v ? sum(articles(), function (a) { return (a.consoAn || 0) * a.pu; }) / v : 0; }
  function couvMois(a) { return a.consoAn ? a.qte / (a.consoAn / 12) : null; }
  function fournNom(id) { var f = S.get('fournisseurs', id); return f ? f.nom : id || '—'; }
  function invAValider() { return S.all('inventaires').filter(function (i) { return i.statut === 'À valider'; }); }

  /* ------------------------------------------------------------------ alertes */
  function alerts() {
    var out = [];
    bacs().forEach(function (b) {
      var a = levelAlert(b), p = P(b.produit);
      if (a === 'haut') out.push({ tone: 'red', icon: 'alert', title: 'Niveau haut — bac ' + b.id + ' (' + p.l + ')', sub: F.pct(pctOf(b), 1) + ' pour un seuil haut à ' + b.max + ' % · creux restant ' + F.num(b.capacite - b.volume) + ' m³', href: '#/stocks/bacs/' + b.id });
      if (a === 'bas') out.push({ tone: 'orange', icon: 'alert', title: 'Niveau bas — bac ' + b.id + ' (' + p.l + ')', sub: F.pct(pctOf(b), 1) + ' pour un seuil bas à ' + b.min + ' % (fond de bac non pompable)', href: '#/stocks/bacs/' + b.id });
    });
    PRODUITS.forEach(function (p) {
      var st = prodStats(p.k);
      if (st.days != null && st.days < 8) out.push({ tone: st.days < 5 ? 'red' : 'orange', icon: p.mode === 'saturation' ? 'layers' : 'clock', title: p.l + ' : ' + F.num(st.days, 1) + ' jours ' + st.lbl, sub: p.mode === 'saturation' ? 'Enlèvement fioul export à programmer (production nette ' + F.num(p.net) + ' m³/j)' : 'Stock utile ' + F.num(st.ut) + ' m³ pour ' + F.num(p.conso) + ' m³/j de ' + p.lblConso, href: '#/stocks/apercu' });
    });
    bacs().filter(function (b) { return b.statut === 'En maintenance'; }).forEach(function (b) { out.push({ tone: 'grey', icon: 'wrench', title: 'Bac ' + b.id + ' indisponible', sub: b.note || 'En maintenance', href: '#/stocks/bacs/' + b.id }); });
    var crit = sousSeuil().filter(function (a) { return a.critique; });
    if (crit.length) out.push({ tone: 'red', icon: 'box', title: crit.length + ' article(s) critique(s) sous le seuil mini', sub: crit.slice(0, 3).map(function (a) { return a.designation; }).join(' · '), href: '#/stocks/reappro' });
    var inv = invAValider();
    if (inv.length) out.push({ tone: 'violet', icon: 'check', title: inv.length + ' écart(s) d\'inventaire à valider', sub: inv.map(function (i) { return i.articleId; }).join(', '), href: '#/stocks/inventaire' });
    return out;
  }

  /* ------------------------------------------------------------------ historique 30 jours (reconstitué à partir du stock actuel) */
  var EVENTS = {
    brut: { d: -3340, n: 260, ev: { 4: 47000, 18: 47500, 28: 9400, 29: 9500 } },
    butane: { d: -18, n: 45, ev: { 11: 420 } },
    super: { d: 340, n: 120, ev: { 6: -2400, 13: -2600, 19: -2300, 25: -2200 } },
    kero: { d: 250, n: 70, ev: { 5: -2000, 12: -1900, 18: -2100, 25: -2200 } },
    gasoil: { d: 315, n: 160, ev: { 3: -2600, 9: -2800, 15: -3000, 21: -2700, 27: -2900 } },
    fioul: { d: 1250, n: 140, ev: { 5: -12000, 17: -26000 } },
    bitume: { d: 5, n: 28, ev: {} },
    slops: { d: 10, n: 22, ev: { 14: -600 } }
  };
  function history(k) {
    var st = prodStats(k), cfg = EVENTS[k], rnd = prng(hash(k) + 11), v = new Array(30);
    v[29] = st.vol;
    for (var i = 29; i > 0; i--) { var delta = cfg.d + (rnd() - 0.5) * cfg.n * 2 + (cfg.ev[i] || 0); v[i - 1] = Math.max(0, Math.min(st.cap, v[i] - delta)); }
    return v.map(Math.round);
  }

  /* ------------------------------------------------------------------ données d'exemple */
  function seed() {
    var t = E.today(), D = function (n) { return E.addDays(t, n); };
    var B = [
      ['T-01', 'brut', 'Toit flottant', 40000, 31800, 36, 0.856, 'En service', 10, 92, 'Alimente la charge de la distillation U100'],
      ['T-02', 'brut', 'Toit flottant', 40000, 18900, 34, 0.855, 'En réception', 10, 92, 'Réception du MT Rabi Spirit en cours (appontement)'],
      ['T-03', 'brut', 'Toit flottant', 25000, 6200, 37, 0.857, 'En service', 10, 92, 'Décantation et purge de l\'eau libre avant mise en charge'],
      ['T-04', 'super', 'Toit flottant', 8000, 5350, 31, 0.742, 'Certifié', 10, 92, 'Lot conforme — prêt à l\'expédition', 'LAB-2026-0917'],
      ['T-05', 'super', 'Toit flottant', 6000, 1150, 32, 0.745, 'En réception', 10, 92, 'Reçoit la production du reformage U300'],
      ['T-06', 'kero', 'Toit fixe', 6000, 2450, 30, 0.796, 'En expédition', 10, 92, 'Enlèvements Jet A1 aviation en cours'],
      ['T-07', 'kero', 'Toit fixe', 4000, 380, 31, 0.794, 'En réception', 10, 92, 'Reçoit la production U400 — lot en constitution'],
      ['T-08', 'gasoil', 'Toit fixe', 12000, 9800, 33, 0.842, 'En expédition', 10, 92, 'Postes de chargement camions 1, 2 et 3'],
      ['T-09', 'gasoil', 'Toit fixe', 10000, 7420, 33, 0.844, 'Certifié', 10, 92, 'Lot conforme (soufre 42 ppm)', 'LAB-2026-0921'],
      ['T-10', 'fioul', 'Toit fixe calorifugé', 20000, 18650, 74, 0.947, 'Certifié', 8, 92, 'Lot export constitué — attend le MT Mandji Trader', 'LAB-2026-0919'],
      ['T-11', 'fioul', 'Toit fixe calorifugé', 20000, 9800, 76, 0.945, 'En réception', 8, 92, 'Reçoit le résidu atmosphérique de U100'],
      ['T-12', 'gasoil', 'Toit fixe', 10000, 0, 30, 0.843, 'En maintenance', 10, 92, 'Inspection décennale + remplacement d\'un tronçon de ligne (permis de feu)'],
      ['T-13', 'bitume', 'Toit fixe calorifugé', 3000, 1240, 162, 1.015, 'En service', 10, 90, 'Maintenu à 160 °C — serpentins vapeur'],
      ['T-14', 'slops', 'Toit fixe', 2500, 1480, 42, 0.883, 'En service', 5, 90, 'Réinjection progressive en charge U100'],
      ['SPH-01', 'butane', 'Sphère', 1000, 610, 27, 0.572, 'En expédition', 10, 85, 'Chargement camions GPL — poste 5'],
      ['CIG-01', 'butane', 'Cigare', 250, 175, 28, 0.574, 'Certifié', 10, 85, 'Lot conforme (pression de vapeur OK)', 'LAB-2026-0922'],
      ['CIG-02', 'butane', 'Cigare', 250, 60, 28, 0.573, 'En réception', 10, 85, 'Reçoit la production de l\'unité GPL U500']
    ];
    var jaug = [S.all('employes').length ? empIdByName('Ekomi') : '', empIdByName('Mba Nziengui')];
    var bacsSeed = B.map(function (r, i) {
      return { id: r[0], produit: r[1], type: r[2], capacite: r[3], volume: r[4], temperature: r[5], densite: r[6], statut: r[7], min: r[8], max: r[9], note: r[10], lot: r[11] || '',
        dernierJaugeage: r[7] === 'En maintenance' ? D(-21) + ' 09:00' : (i % 4 === 3 ? D(-1) + ' 18:00' : t + ' 06:00'), jaugeur: jaug[i % 2] };
    });

    /* mouvements produits des 7 derniers jours */
    var M = [], n = 0, rnd = prng(20260930);
    var chefs = [empIdByName('Ekomi'), empIdByName('Mba Nziengui'), empIdByName('Mintsa')], appont = empIdByName('Nzamba');
    function push(d, h, type, produit, src, dst, vol, ref, op) { n++; M.push({ id: 'MP-' + String(n).padStart(4, '0'), date: D(d), heure: h, type: type, produit: produit, bacSource: src || '', bacDest: dst || '', volume: Math.round(vol), ref: ref || '', operateur: op || chefs[(n + d) % 3] }); }
    function nz(v, p) { return v * (1 + (rnd() - 0.5) * (p || 0.08)); }
    for (var d = -7; d <= 0; d++) {
      var chef = chefs[(d + 9) % 3];
      push(d, '06:00', 'Jaugeage', 'gasoil', '', 'T-08', Math.round((rnd() - 0.55) * 24), 'Jaugeage de quart', chef);
      if (d === -2 || d === -5) push(d, '06:10', 'Jaugeage', 'super', '', 'T-04', Math.round((rnd() - 0.5) * 14), 'Jaugeage de quart', chef);
      if (d === 0) {
        push(0, '05:40', 'Réception navire', 'brut', '', 'T-02', 9500, 'MT Rabi Spirit — escale ESC-2026-041', appont);
        continue;
      }
      push(d, '23:50', 'Charge unité', 'brut', d % 3 === 0 ? 'T-03' : 'T-01', 'U100', nz(3340, 0.05), 'Charge distillation atmosphérique U100', chef);
      push(d, '23:55', 'Production', 'super', 'U300', 'T-05', nz(600), 'Bilan de production du jour', chef);
      push(d, '23:55', 'Production', 'kero', 'U400', 'T-07', nz(400), 'Bilan de production du jour', chef);
      push(d, '23:55', 'Production', 'gasoil', 'U100', d < -3 ? 'T-08' : 'T-09', nz(835), 'Bilan de production du jour', chef);
      push(d, '23:55', 'Production', 'fioul', 'U100', 'T-11', nz(1335), 'Bilan de production du jour', chef);
      push(d, '23:55', 'Production', 'butane', 'U500', 'CIG-02', nz(70), 'Bilan de production du jour', chef);
      push(d, '23:55', 'Production', 'bitume', 'U100', 'T-13', nz(50), 'Bilan de production du jour', chef);
      push(d, '18:30', 'Expédition camions', 'super', 'T-04', '', nz(260, 0.3), 'Enlèvements camions-citernes du jour', empIdByName('Bivigou'));
      push(d, '18:30', 'Expédition camions', 'gasoil', 'T-08', '', nz(520, 0.3), 'Enlèvements camions-citernes du jour', empIdByName('Bivigou'));
      push(d, '18:30', 'Expédition camions', 'kero', 'T-06', '', nz(150, 0.3), 'Enlèvements Jet A1 & pétrole lampant', empIdByName('Bivigou'));
      push(d, '18:30', 'Expédition camions', 'butane', 'SPH-01', '', nz(120, 0.2), 'Enlèvements GPL (Gaz du Littoral)', empIdByName('Bivigou'));
      if (d % 2 === 0) push(d, '18:30', 'Expédition camions', 'bitume', 'T-13', '', nz(90, 0.2), 'Enlèvements bitume (Routes & Bitumes du Gabon)', empIdByName('Bivigou'));
      if (d === -4) { push(d, '14:20', 'Expédition navire', 'super', 'T-04', '', 2200, 'Caboteur Komo → dépôt d\'Owendo', appont); push(d, '14:20', 'Expédition navire', 'kero', 'T-06', '', 2200, 'Caboteur Komo → dépôt d\'Owendo (Jet A1 aéroport de Libreville)', appont); }
      if (d === -2) push(d, '10:05', 'Expédition navire', 'gasoil', 'T-08', '', 2900, 'Caboteur Ogooué Express → Owendo', appont);
      if (d === -5) push(d, '11:00', 'Transfert', 'super', 'T-05', 'T-04', 900, 'Constitution du lot LAB-2026-0917', chef);
      if (d === -3) push(d, '09:30', 'Transfert', 'gasoil', 'T-09', 'T-08', 1500, 'Homogénéisation avant expédition', chef);
      if (d === -1) { push(d, '07:10', 'Réception navire', 'brut', '', 'T-02', 9400, 'MT Rabi Spirit — escale ESC-2026-041', appont); push(d, '16:00', 'Transfert', 'slops', 'T-14', 'U100', 180, 'Réinjection des slops en charge', chef); }
      if (d === -6) push(d, '06:15', 'Jaugeage', 'fioul', '', 'T-10', 11, 'Jaugeage de quart', chef);
    }

    /* magasin */
    var A = [
      ['Garniture mécanique double cartouche Ø50 (pompes P-101 A/B)', 'Mécanique', 'u', 2, 2, 6, 4850000, 'F-001', 1, 'A-01-1', 6],
      ['Roulement à billes 6310-2Z/C3', 'Mécanique', 'u', 14, 10, 40, 68000, 'F-001', 0, 'A-02-3', 36],
      ['Roulement à rouleaux coniques 32216', 'Mécanique', 'u', 4, 6, 16, 185000, 'F-001', 1, 'A-02-4', 14],
      ['Joint spiralé 4" ANSI 300 inox/graphite', 'Tuyauterie', 'u', 85, 50, 200, 18500, 'F-003', 0, 'B-01-2', 240],
      ['Joint spiralé 8" ANSI 600 inox/graphite', 'Tuyauterie', 'u', 22, 30, 80, 46000, 'F-003', 0, 'B-01-3', 70],
      ['Vanne à opercule 6" ANSI 300 acier carbone', 'Robinetterie', 'u', 3, 2, 6, 3900000, 'F-003', 1, 'C-01-1', 3],
      ['Vanne papillon DN250 à brides', 'Robinetterie', 'u', 1, 1, 3, 2750000, 'F-003', 0, 'C-01-2', 2],
      ['Soupape de sûreté 1"×2" tarée 12 bar', 'Robinetterie', 'u', 2, 2, 5, 1650000, 'F-003', 1, 'C-02-1', 4],
      ['Transmetteur de pression 0–40 bar HART', 'Instrumentation', 'u', 5, 4, 10, 1180000, 'F-002', 1, 'D-01-1', 6],
      ['Transmetteur de niveau radar (bacs de stockage)', 'Instrumentation', 'u', 1, 2, 4, 3400000, 'F-002', 1, 'D-01-2', 3],
      ['Thermocouple type K, gaine 500 mm', 'Instrumentation', 'u', 26, 15, 50, 72000, 'F-002', 0, 'D-02-1', 40],
      ['Positionneur électropneumatique de vanne', 'Instrumentation', 'u', 3, 2, 6, 1350000, 'F-002', 0, 'D-02-3', 4],
      ['Câble armé 3G2,5 mm²', 'Électricité', 'm', 420, 300, 1500, 4200, 'F-004', 0, 'E-01-1', 1600],
      ['Câble instrumentation 2 paires blindé', 'Électricité', 'm', 180, 250, 1000, 2900, 'F-004', 0, 'E-01-2', 1400],
      ['Disjoncteur moteur 25 A', 'Électricité', 'u', 9, 6, 20, 145000, 'F-004', 0, 'E-02-1', 12],
      ['Luminaire LED antidéflagrant ATEX', 'Électricité', 'u', 12, 10, 30, 265000, 'F-004', 0, 'E-02-4', 16],
      ['Casque de sécurité avec jugulaire', 'EPI & sécurité', 'u', 64, 40, 150, 12500, 'F-007', 0, 'F-01-1', 180],
      ['Combinaison ignifugée antistatique', 'EPI & sécurité', 'u', 38, 60, 200, 58000, 'F-007', 1, 'F-01-2', 260],
      ['Gants anti-coupure niveau 5', 'EPI & sécurité', 'paire', 140, 100, 400, 6800, 'F-007', 0, 'F-01-3', 900],
      ['Appareil respiratoire isolant (ARI) 6 L', 'EPI & sécurité', 'u', 6, 6, 12, 1950000, 'F-007', 1, 'F-02-1', 3],
      ['Détecteur portable 4 gaz (H₂S, CO, O₂, LIE)', 'EPI & sécurité', 'u', 11, 8, 20, 890000, 'F-007', 1, 'F-02-2', 6],
      ['Catalyseur de reformage Pt-Re (fût 200 kg)', 'Catalyseurs & chimie', 'fût', 18, 10, 30, 14500000, 'F-005', 1, 'G-01-1', 8],
      ['Inhibiteur de corrosion tête de colonne (fût 200 L)', 'Catalyseurs & chimie', 'fût', 7, 8, 24, 1250000, 'F-005', 0, 'G-02-1', 30],
      ['Soude caustique 50 % (IBC 1 000 L)', 'Catalyseurs & chimie', 'IBC', 5, 3, 10, 780000, 'F-005', 0, 'G-02-3', 18],
      ['Huile turbine ISO VG 46 (fût 208 L)', 'Lubrifiants', 'fût', 9, 6, 20, 520000, 'F-001', 0, 'H-01-1', 22],
      ['Graisse EP2 au lithium (seau 18 kg)', 'Lubrifiants', 'seau', 21, 10, 40, 68000, 'F-001', 0, 'H-01-2', 48],
      ['Gaz étalon H₂S 25 ppm (bouteille)', 'Laboratoire', 'bouteille', 3, 4, 10, 310000, 'F-010', 0, 'L-01-1', 14],
      ['Kit réactifs point éclair Pensky-Martens', 'Laboratoire', 'kit', 6, 3, 12, 240000, 'F-010', 0, 'L-01-2', 10],
      ['Cartouche filtrante gasoil 10 µm', 'Filtration', 'u', 48, 40, 120, 42000, 'F-001', 0, 'B-03-1', 190],
      ['Filtre à air de compresseur', 'Filtration', 'u', 7, 4, 12, 96000, 'F-001', 0, 'B-03-2', 12],
      ['Goujons B7 + écrous 2H 7/8" (lot de 10)', 'Tuyauterie', 'lot', 35, 20, 80, 38000, 'F-001', 0, 'B-02-1', 90],
      ['Électrodes de soudure E7018 Ø3,2 (carton 5 kg)', 'Tuyauterie', 'carton', 16, 10, 40, 42000, 'F-001', 0, 'B-02-4', 55]
    ];
    var arts = A.map(function (r, i) {
      return { id: 'ART-' + (1001 + i), designation: r[0], categorie: r[1], unite: r[2], qte: r[3], min: r[4], max: r[5], emplacement: r[9], pu: r[6], fournisseurId: r[7], critique: !!r[8], consoAn: r[10], dernierInventaire: D(-(40 + (i * 37) % 170)) };
    });
    var invDates = { 'ART-1019': -6, 'ART-1002': -6, 'ART-1031': -5, 'ART-1016': -3, 'ART-1013': -1, 'ART-1026': -1 };
    arts.forEach(function (a) { if (invDates[a.id] != null) a.dernierInventaire = D(invDates[a.id]); });

    var mag = empIdByName('Mengue');
    var MS = [
      [-1, 'Sortie', 'ART-1001', 1, 'OT-2026-0417', 'Mapangou', 'Pompe P-101 B — fuite de garniture'],
      [-1, 'Sortie', 'ART-1029', 8, 'OT-2026-0419', 'Mapangou', 'Remplacement filtres poste de chargement 3'],
      [-2, 'Entrée', 'ART-1004', 60, 'BC-2026-0131', 'Mengue', 'Réception complète'],
      [-2, 'Sortie', 'ART-1011', 2, 'OT-2026-0414', 'Engonga', 'Four F-101 — sondes zone radiation'],
      [-3, 'Sortie', 'ART-1018', 12, 'Dotation HSE', 'Ntoutoume', 'Dotation équipe de quart C'],
      [-4, 'Retour', 'ART-1031', 4, 'OT-2026-0402', 'Pambou', 'Non utilisés — travaux terminés'],
      [-5, 'Sortie', 'ART-1003', 2, 'OT-2026-0409', 'Mapangou', 'Compresseur K-201 — révision palier'],
      [-6, 'Inventaire', 'ART-1019', -6, 'INV-0001', 'Mengue', 'Écart d\'inventaire tournant validé'],
      [-7, 'Entrée', 'ART-1022', 6, 'BC-2026-0124', 'Mengue', 'Catalyseur de rechange reformage U300'],
      [-8, 'Sortie', 'ART-1023', 3, 'OT-2026-0398', 'Boussougou', 'Injection tête de colonne C-101'],
      [-9, 'Sortie', 'ART-1009', 1, 'OT-2026-0395', 'Engonga', 'PT-1204 défaillant — ligne de charge'],
      [-10, 'Sortie', 'ART-1025', 2, 'OT-2026-0391', 'Mapangou', 'Vidange turbine vapeur TV-801'],
      [-12, 'Entrée', 'ART-1017', 40, 'BC-2026-0119', 'Mengue', 'Réception complète'],
      [-13, 'Sortie', 'ART-1010', 1, 'OT-2026-0388', 'Engonga', 'Bac T-07 — remplacement du radar de niveau'],
      [-15, 'Sortie', 'ART-1032', 6, 'OT-2026-0384', 'Bekale', 'Réparation ligne de gasoil — bac T-12'],
      [-16, 'Sortie', 'ART-1005', 10, 'OT-2026-0380', 'Pambou', 'Échangeur E-104 — remontage'],
      [-18, 'Entrée', 'ART-1026', 12, 'BC-2026-0112', 'Mengue', 'Réception complète'],
      [-20, 'Sortie', 'ART-1020', 1, 'Dotation HSE', 'Makaya', 'Remplacement d\'un ARI endommagé'],
      [-22, 'Sortie', 'ART-1014', 120, 'OT-2026-0371', 'Lendoye', 'Recâblage boucles de niveau parc U600'],
      [-25, 'Sortie', 'ART-1027', 2, 'Étalonnage détecteurs', 'Mayila', 'Étalonnage mensuel des détecteurs fixes'],
      [-28, 'Entrée', 'ART-1029', 40, 'BC-2026-0104', 'Mengue', 'Réception complète']
    ];
    var mvtS = MS.map(function (r, i) { var a = arts.find(function (x) { return x.id === r[2]; }); return { id: 'MS-' + String(i + 1).padStart(4, '0'), date: D(r[0]), type: r[1], articleId: r[2], qte: r[3], pu: a.pu, ref: r[4], demandeur: empIdByName(r[5]), commentaire: r[6] }; });

    var INV = [
      ['INV-0006', -1, 'ART-1013', 420, 420, 'Validé'], ['INV-0005', -1, 'ART-1026', 21, 19, 'À valider'], ['INV-0004', -3, 'ART-1016', 12, 12, 'Validé'],
      ['INV-0003', -5, 'ART-1031', 31, 31, 'Validé'], ['INV-0002', -6, 'ART-1002', 14, 14, 'Validé'], ['INV-0001', -6, 'ART-1019', 146, 140, 'Validé']
    ];
    var invs = INV.map(function (r) { var a = arts.find(function (x) { return x.id === r[2]; }); return { id: r[0], date: D(r[1]), articleId: r[2], theorique: r[3], reel: r[4], ecart: r[4] - r[3], valeurEcart: (r[4] - r[3]) * a.pu, compteur: mag, statut: r[5] }; });

    return { bacs: bacsSeed, mouvementsProduits: M, articles: arts, mouvementsStock: mvtS, inventaires: invs };
  }

  /* ------------------------------------------------------------------ rendu : composants */
  function tankCard(b) {
    var p = P(b.produit), pc = pctOf(b), al = levelAlert(b);
    var shape = b.type === 'Sphère' ? ' sphere' : b.type === 'Cigare' ? ' cigare' : '';
    return '<div class="tank ops' + shape + (b.statut === 'En maintenance' ? ' ops-maint' : '') + '" data-bac="' + esc(b.id) + '" style="--pc:' + p.c + ';--pc2:' + p.c2 + '" title="' + esc(b.note || '') + '">' +
      '<div class="ops-tank__top"><b>' + esc(b.id) + '</b>' + badgeEm(b.statut, STAT_TONE[b.statut]) + '</div>' +
      '<div class="ops-tank__prod' + (al === 'bas' ? ' bas' : '') + '"' + (al ? ' title="Niveau ' + al + '"' : '') + '>' + esc(p.l.split(' (')[0]) + (al ? E.icon('alert') : '') + '</div>' +
      '<div class="tank__vessel"><div class="tank__mark max" style="bottom:' + b.max + '%"></div><div class="tank__mark min" style="bottom:' + b.min + '%"></div>' +
      '<div class="tank__fill ops" style="height:' + pc.toFixed(1) + '%"></div><div class="tank__pct' + (p.dark && pc > 55 ? ' light' : '') + '">' + (b.statut === 'En maintenance' ? '—' : Math.round(pc) + '%') + '</div></div>' +
            '<div class="ops-tank__vol">' + F.num(b.volume) + ' / ' + F.num(b.capacite) + ' m³</div>' +
      '<div class="ops-tank__meta"><span>' + F.num(b.temperature) + ' °C</span><span>d₁₅ ' + F.num(b.densite, 3) + '</span><span>' + esc(b.type) + '</span></div></div>';
  }
  function prodRow(k) {
    var st = prodStats(k), p = st.p, tone = daysTone(st.days);
    return '<div class="ops-prod__row"><div class="ops-prod__name"><i style="background:' + p.c + '"></i><div><b>' + esc(p.l) + '</b><span>' + F.num(st.vol) + ' m³ · ' + st.list.length + ' bac' + (st.list.length > 1 ? 's' : '') + ' · ' + (st.masse >= 1e4 ? F.num(st.masse / 1000, 0) + ' kt' : F.num(st.masse, 0) + ' t') + '</span></div></div>' +
      '<div class="ops-prod__bar"><div class="ops-bar"><i style="width:' + st.pct.toFixed(1) + '%;background:linear-gradient(90deg,' + p.c2 + ',' + p.c + ')"></i><em style="left:' + st.minPct.toFixed(1) + '%" title="Fond de bac non pompable"></em></div>' +
      '<div class="ops-bar__lbl"><span>' + F.pct(st.pct) + ' de ' + F.num(st.cap) + ' m³</span><span>' + (p.mode === 'none' ? p.lblConso : (p.mode === 'saturation' ? '+' + F.num(p.net) : F.num(p.conso)) + ' m³/j · ' + p.lblConso) + '</span></div></div>' +
      '<div class="ops-days ' + tone + '"><b>' + (st.days == null ? '—' : F.num(st.days, 1) + ' j') + '</b><span>' + (st.days == null ? 'recyclés' : st.lbl) + '</span></div></div>';
  }
  function alertsList(list) {
    if (!list.length) return '<div class="empty">Aucune alerte : tous les niveaux sont dans les consignes.</div>';
    return '<div class="list ops-alerts">' + list.map(function (a) { return '<a class="list__item" href="' + a.href + '" style="color:inherit"><div class="list__icon tone-' + a.tone + '">' + E.icon(a.icon) + '</div><div class="list__body"><b>' + esc(a.title) + '</b><div class="small muted">' + esc(a.sub) + '</div></div></a>'; }).join('') + '</div>';
  }
  function docHead(titre, num, date) {
    return '<div class="doc__head"><div class="row" style="gap:12px"><img src="../assets/img/logo.png" alt="SOGARA"><div><b style="font-family:Sora,sans-serif;font-size:16px;color:var(--navy)">SOGARA</b><div class="small muted">Société Gabonaise de Raffinage<br>Raffinerie de Port-Gentil — Gabon</div></div></div>' +
      '<div style="text-align:right"><h4>' + esc(titre) + '</h4><div class="mono">' + esc(num) + '</div><div class="small muted">' + esc(date) + '</div></div></div>';
  }
  function printModal(title, html) {
    U.modal({ title: title, size: 'lg', body: '<div class="doc">' + html + '</div>', actions: [{ label: 'Fermer' }, { label: 'Imprimer', cls: 'primary', icon: 'print', onClick: function () { document.body.classList.add('ops-print'); setTimeout(function () { window.print(); document.body.classList.remove('ops-print'); }, 30); } }] });
  }

  /* ------------------------------------------------------------------ vues */
  var TABS = [
    { k: 'apercu', l: 'Tableau de bord' }, { k: 'bacs', l: 'Parc de stockage' }, { k: 'mouvements', l: 'Mouvements & bilan' },
    { k: 'magasin', l: 'Magasin' }, { k: 'sorties', l: 'Mouvements magasin' }, { k: 'reappro', l: 'Réapprovisionnement' }, { k: 'inventaire', l: 'Inventaire tournant' }
  ];
  var state = { prodChart: 'brut', prodFilter: '', statFilter: '', mvType: '', mvProd: '', mvDay: '', q: '', cat: '', artFilter: '', msType: '' };

  function render(view, params) {
    var tab = params[0] || 'apercu'; if (!TABS.some(function (t) { return t.k === tab; })) tab = 'apercu';
    var al = alerts(), ss = sousSeuil(), brut = prodStats('brut');
    var head = '<div class="grid g4 ops-kpis">' +
      U.kpi({ label: 'Stock produits finis', value: F.num(stockFinis()), unit: 'm³', icon: 'tank', tone: 'blue', foot: F.pct(stockFinis() / capFinis() * 100) + ' de la capacité de stockage' }) +
      U.kpi({ label: 'Autonomie brut Rabi', value: F.num(brut.days, 1), unit: 'jours', icon: 'drop', tone: daysTone(brut.days), foot: F.num(brut.vol) + ' m³ · charge ' + F.num(P('brut').conso) + ' m³/j' }) +
      U.kpi({ label: 'Valeur magasin', value: F.short(valeurStock()), unit: 'FCFA', icon: 'box', tone: 'violet', foot: articles().length + ' références · rotation ' + F.num(rotation(), 1) + '/an' }) +
      U.kpi({ label: 'Alertes actives', value: al.length, icon: 'alert', tone: al.length ? 'red' : 'green', foot: '<span class="' + (ss.length ? 'down' : 'up') + '">' + ss.length + ' article(s) sous seuil</span>' }) +
      '</div>';
    var counts = { bacs: bacs().length, magasin: articles().length, reappro: ss.length || null, inventaire: invAValider().length || null };
    view.innerHTML = head + U.tabs(TABS.map(function (t) { return { k: t.k, l: t.l, n: counts[t.k] }; }), tab, function (k) { E.go('stocks/' + k); }) + '<div id="stk-body" class="ops-scope"></div>';
    var body = view.querySelector('#stk-body');
    ({ apercu: vApercu, bacs: vBacs, mouvements: vMouvements, magasin: vMagasin, sorties: vSorties, reappro: vReappro, inventaire: vInventaire })[tab](body, params);
    if (params[1]) {
      if (tab === 'bacs' && S.get('bacs', params[1])) openBac(params[1], true);
      if ((tab === 'magasin' || tab === 'reappro') && S.get('articles', params[1])) openArticle(params[1], true);
    }
  }
  function clearDeep(tab) { if (location.hash.split('/').length > 3) history.replaceState(null, '', '#/stocks/' + tab); }

  /* ---------- Tableau de bord ---------- */
  function vApercu(el) {
    var cats = E.groupBy(articles(), 'categorie');
    var catItems = Object.keys(cats).map(function (c) { return { label: c, value: sum(cats[c], function (a) { return a.qte * a.pu; }) }; }).sort(function (a, b) { return b.value - a.value; });
    var yesterday = E.addDays(E.today(), -1), bil = bilanJour(yesterday);
    var ss = sousSeuil(), crit = ss.filter(function (a) { return a.critique; });
    var couvMoy = (function () { var l = articles().filter(function (a) { return a.consoAn; }); return l.length ? sum(l, function (a) { return Math.min(36, couvMois(a)); }) / l.length : 0; })();
    var lastM = S.all('mouvementsProduits').slice().sort(cmpMvt).slice(0, 6);
    el.innerHTML =
      '<div class="grid g-2-1">' +
        '<div class="card"><div class="card__h"><h3>Couverture par produit</h3><span class="sub">stock utile ÷ sorties moyennes journalières</span><span class="spacer"></span><a class="btn sm ghost" href="#/stocks/bacs">' + E.icon('tank') + 'Voir les bacs</a></div><div class="ops-prod">' + PRODUITS.map(function (p) { return prodRow(p.k); }).join('') + '</div>' +
          '<div class="card__b" style="border-top:1px solid var(--line-2)"><div class="legend"><span><i style="background:var(--orange);width:3px"></i>Fond de bac (non pompable)</span><span><i style="background:var(--red)"></i>&lt; 5 jours</span><span><i style="background:var(--orange)"></i>&lt; 8 jours</span><span><i style="background:var(--green)"></i>Couverture confortable</span></div></div></div>' +
        '<div class="card"><div class="card__h"><h3>Alertes</h3><span class="badge tone-red">' + alerts().length + '</span></div>' + alertsList(alerts()) + '</div>' +
      '</div>' +
      '<div class="grid g-2-1" style="margin-top:16px">' +
        '<div class="card"><div class="card__h"><h3>Évolution des stocks — 30 jours</h3><span class="sub">m³, fin de journée</span></div><div class="card__b"><div class="ops-linechips chips" id="stk-chips">' + PRODUITS.map(function (p) { return '<button class="chip' + (state.prodChart === p.k ? ' is-active' : '') + '" data-k="' + p.k + '"><i style="background:' + p.c + '"></i>' + esc(p.l.split(' (')[0]) + '</button>'; }).join('') + '</div><div id="stk-chart" style="margin-top:12px"></div></div></div>' +
        '<div class="card"><div class="card__h"><h3>Magasin en bref</h3><span class="spacer"></span><a class="btn sm ghost" href="#/stocks/magasin">Ouvrir</a></div><div class="card__b">' +
          '<div class="ops-stat"><div><span>Valeur du stock</span><b>' + F.short(valeurStock()) + '</b></div><div><span>Taux de rotation</span><b>' + F.num(rotation(), 2) + ' /an</b></div><div><span>Sous seuil mini</span><b class="' + (ss.length ? 'ops-neg' : '') + '">' + ss.length + '</b></div><div><span>Critiques sous seuil</span><b class="' + (crit.length ? 'ops-neg' : '') + '">' + crit.length + '</b></div><div><span>Couverture moyenne</span><b>' + F.num(couvMoy, 1) + ' mois</b></div><div><span>Écarts à valider</span><b>' + invAValider().length + '</b></div></div>' +
          '<div style="margin-top:16px">' + U.donut(catItems.slice(0, 6).concat(catItems.length > 6 ? [{ label: 'Autres', value: sum(catItems.slice(6), 'value') }] : []), { center: F.short(valeurStock()), sub: 'FCFA', money: true, size: 130 }) + '</div>' +
        '</div></div>' +
      '</div>' +
      '<div class="grid g2 stack-m" style="margin-top:16px">' +
        '<div class="card"><div class="card__h"><h3>Bilan matière — ' + F.date(yesterday) + '</h3><span class="spacer"></span><a class="btn sm ghost" href="#/stocks/mouvements">Détail</a></div><div class="card__b"><div class="ops-stat">' +
          '<div><span>Entrées</span><b class="ops-pos">' + F.num(bil.entrees) + ' m³</b></div><div><span>Sorties</span><b>' + F.num(bil.sorties) + ' m³</b></div><div><span>Écart de jaugeage</span><b class="' + (Math.abs(bil.ecartPct) > 0.2 ? 'ops-neg' : '') + '">' + signed(bil.ecart) + ' m³</b></div><div><span>Écart relatif</span><b>' + F.num(bil.ecartPct, 2) + ' %</b></div></div>' +
          '<div class="ops-note" style="margin-top:12px">Brut traité : <b>' + F.num(bil.charge) + ' m³</b> (≈ ' + F.num(bil.charge * 6.2898) + ' barils) · produits fabriqués : <b>' + F.num(bil.production) + ' m³</b> · rendement volume : <b>' + F.pct(bil.charge ? bil.production / bil.charge * 100 : 0, 1) + '</b></div></div></div>' +
        '<div class="card"><div class="card__h"><h3>Derniers mouvements</h3><span class="spacer"></span><a class="btn sm ghost" href="#/stocks/mouvements">Journal</a></div><div class="list">' + lastM.map(function (m) { var tp = TYPES_P[m.type] || {}; return '<div class="list__item"><div class="list__icon tone-' + (tp.tone || 'grey') + '">' + E.icon(tp.icon || 'refresh') + '</div><div class="list__body"><b>' + esc(m.type) + ' · ' + esc(P(m.produit).l) + '</b><div class="small muted">' + esc(mvtRoute(m)) + ' · ' + esc(m.ref) + '</div></div><div class="right" style="flex:none;white-space:nowrap"><b class="ops-num">' + mvtVolTxt(m) + '</b><div class="small muted">' + F.dateShort(m.date) + ' ' + esc(m.heure) + '</div></div></div>'; }).join('') + '</div></div>' +
      '</div>';
    function drawChart() {
      var k = state.prodChart, p = P(k), st = prodStats(k), vals = history(k);
      var mob = window.innerWidth <= 640, labels = vals.map(function (_, i) { var d = E.parseDate(E.addDays(E.today(), i - 29)); return mob && i % 9 ? '' : pad(d.getDate()) + '/' + pad(d.getMonth() + 1); });
      var ref = p.mode === 'saturation' ? { name: 'Niveau haut (saturation)', v: sum(st.list.filter(function (b) { return b.statut !== 'En maintenance'; }), function (b) { return b.capacite * b.max / 100; }) } : { name: 'Seuil d\'alerte (8 jours + fonds)', v: st.cap * st.minPct / 100 + p.conso * 8 };
      el.querySelector('#stk-chart').innerHTML = U.line({ labels: labels, series: [{ name: p.l + ' (m³)', values: vals, color: p.c2 }, { name: ref.name, values: vals.map(function () { return Math.round(ref.v); }), color: p.mode === 'saturation' ? '#d93636' : '#e8780c', dash: true }], height: 230 });
    }
    drawChart();
    el.querySelector('#stk-chips').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; state.prodChart = b.dataset.k; E.$$('#stk-chips .chip').forEach(function (c) { c.classList.toggle('is-active', c === b); }); drawChart(); });
  }

  /* ---------- Parc de stockage ---------- */
  function vBacs(el) {
    var list = bacs().filter(function (b) { return (!state.prodFilter || b.produit === state.prodFilter) && (!state.statFilter || b.statut === state.statFilter); });
    el.innerHTML =
      '<div class="ops-toolbar"><div class="chips" id="bac-prod"><button class="chip' + (!state.prodFilter ? ' is-active' : '') + '" data-k="">Tous les produits</button>' + PRODUITS.map(function (p) { return '<button class="chip' + (state.prodFilter === p.k ? ' is-active' : '') + '" data-k="' + p.k + '">' + dot(p.c) + esc(p.l.split(' (')[0]) + '</button>'; }).join('') + '</div></div>' +
      '<div class="ops-toolbar"><select class="select" id="bac-stat"><option value="">Tous les statuts</option>' + STATUTS_BAC.map(function (s) { return '<option' + (state.statFilter === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select><span class="spacer"></span>' +
      '<button class="btn" id="bac-transf">' + E.icon('refresh') + 'Transfert entre bacs</button><button class="btn" id="bac-csv">' + E.icon('download') + 'Export CSV</button><button class="btn primary" id="bac-jaug">' + E.icon('target') + 'Saisir un jaugeage</button></div>' +
      '<div class="card"><div class="card__h"><h3>Parc de stockage — ' + list.length + ' capacité' + (list.length > 1 ? 's' : '') + '</h3><span class="sub">' + F.num(sum(list, 'volume')) + ' m³ en stock sur ' + F.num(sum(list, 'capacite')) + ' m³</span><span class="spacer"></span><div class="legend"><span><i style="background:var(--red);height:3px"></i>Seuil haut</span><span><i style="background:var(--orange);height:3px"></i>Seuil bas</span></div></div>' +
        '<div class="card__b"><div class="tanks ops-tanks">' + (list.map(tankCard).join('') || '<div class="empty">Aucun bac pour ce filtre.</div>') + '</div></div></div>' +
      '<div class="card ops-hide-m" style="margin-top:16px"><div class="card__h"><h3>Situation détaillée des bacs</h3><span class="sub">cliquez sur une ligne pour ouvrir la fiche</span></div>' + U.table(bacCols(), list, { onRow: function (b) { openBac(b.id); } }) + '</div>';
    el.querySelector('#bac-prod').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) { state.prodFilter = b.dataset.k; vBacs(el); } });
    el.querySelector('#bac-stat').onchange = function () { state.statFilter = this.value; vBacs(el); };
    el.querySelector('#bac-jaug').onclick = function () { jaugeageForm(); };
    el.querySelector('#bac-transf').onclick = function () { transfertForm(); };
    el.querySelector('#bac-csv').onclick = function () { U.exportCSV('parc-de-stockage-' + E.today(), bacCols().filter(function (c) { return c.csv || c.key; }), list); };
    E.$$('.tank[data-bac]', el).forEach(function (t) { t.onclick = function () { openBac(t.dataset.bac); }; });
  }
  function bacCols() {
    return [
      { key: 'id', label: 'Bac', cls: 'nowrap', render: function (b) { return '<b>' + esc(b.id) + '</b>'; } },
      { key: 'produit', label: 'Produit', render: function (b) { return '<span class="nowrap">' + dot(P(b.produit).c) + esc(P(b.produit).l.split(' (')[0]) + '</span>'; }, csv: function (b) { return P(b.produit).l; } },
      { key: 'type', label: 'Type', cls: 'nowrap' },
      { key: 'capacite', label: 'Capacité (m³)', num: 1, render: function (b) { return F.num(b.capacite); } },
      { key: 'volume', label: 'Volume (m³)', num: 1, render: function (b) { return '<b>' + F.num(b.volume) + '</b>'; } },
      { key: 'pct', label: 'Remplissage', render: function (b) { var a = levelAlert(b); return U.progress(pctOf(b), a === 'haut' ? 'red' : a === 'bas' ? 'orange' : ''); }, csv: function (b) { return F.num(pctOf(b), 1); } },
      { key: 'creux', label: 'Creux (m³)', num: 1, render: function (b) { return F.num(b.capacite - b.volume); }, csv: function (b) { return b.capacite - b.volume; } },
      { key: 'temperature', label: 'T° (°C)', num: 1 },
      { key: 'densite', label: 'Densité', num: 1, render: function (b) { return F.num(b.densite, 3); } },
      { key: 'statut', label: 'Statut', render: function (b) { return U.badge(b.statut, STAT_TONE[b.statut]); } },
      { key: 'dernierJaugeage', label: 'Dernier jaugeage', render: function (b) { return '<span class="small">' + fmtStamp(b.dernierJaugeage) + '</span>'; } }
    ];
  }

  function openBac(id, deep) {
    var b = S.get('bacs', id); if (!b) return;
    var p = P(b.produit), pc = pctOf(b), st = prodStats(b.produit), al = levelAlert(b);
    var mv = S.all('mouvementsProduits').filter(function (m) { return m.bacSource === id || m.bacDest === id; }).sort(cmpMvt).slice(0, 8);
    var body =
      (al ? '<div class="alert tone-' + (al === 'haut' ? 'red' : 'orange') + '" style="margin-bottom:14px">' + E.icon('alert') + '<div><b>Niveau ' + al + ' atteint.</b> ' + (al === 'haut' ? 'Réception à suspendre ou à basculer sur un autre bac ; programmer une expédition.' : 'Pompage à arrêter : risque d\'aspiration des fonds et de l\'eau décantée.') + '</div></div>' : '') +
      '<div class="ops-bigtank"><div class="tank__vessel" style="--pc:' + p.c + ';--pc2:' + p.c2 + ';' + (b.type === 'Sphère' ? 'border-radius:50%;width:160px;height:160px' : b.type === 'Cigare' ? 'border-radius:60px;width:190px;height:100px' : '') + '"><div class="tank__mark max" style="bottom:' + b.max + '%"></div><div class="tank__mark min" style="bottom:' + b.min + '%"></div><div class="tank__fill ops" style="height:' + pc.toFixed(1) + '%"></div><div class="tank__pct' + (p.dark && pc > 55 ? ' light' : '') + '" style="z-index:3">' + F.pct(pc, 1) + '</div></div>' +
      '<dl class="kv"><dt>Produit</dt><dd>' + dot(p.c) + esc(p.l) + '</dd><dt>Type de bac</dt><dd>' + esc(b.type) + '</dd><dt>Capacité</dt><dd>' + F.num(b.capacite) + ' m³</dd><dt>Volume jaugé</dt><dd><b>' + F.num(b.volume) + ' m³</b> (' + F.num(b.volume * 6.2898) + ' bbl)</dd>' +
      '<dt>Masse</dt><dd>' + F.num(b.volume * b.densite, 0) + ' t</dd><dt>Creux disponible</dt><dd>' + F.num(b.capacite - b.volume) + ' m³</dd><dt>Stock pompable</dt><dd>' + F.num(utile(b)) + ' m³</dd><dt>Seuils bas / haut</dt><dd>' + b.min + ' % / ' + b.max + ' %</dd>' +
      '<dt>Température / densité à 15 °C</dt><dd>' + F.num(b.temperature) + ' °C · ' + F.num(b.densite, 3) + '</dd><dt>Statut</dt><dd>' + U.badge(b.statut, STAT_TONE[b.statut]) + (b.lot ? ' <span class="mono">' + esc(b.lot) + '</span>' : '') + '</dd>' +
      '<dt>Dernier jaugeage</dt><dd>' + fmtStamp(b.dernierJaugeage) + (b.jaugeur ? ' · ' + esc(E.empName(b.jaugeur)) : '') + '</dd><dt>Observation</dt><dd>' + esc(b.note || '—') + '</dd></dl></div>' +
      '<div class="ops-note" style="margin-top:14px">' + dot(p.c) + 'Stock total ' + esc(p.l) + ' : <b>' + F.num(st.vol) + ' m³</b>' + (st.days != null ? ' · <b>' + F.num(st.days, 1) + ' jours</b> ' + st.lbl : '') + '</div>' +
      '<h4 style="margin:18px 0 8px;font-size:14px">Derniers mouvements du bac</h4>' +
      U.table([
        { key: 'date', label: 'Date', render: function (m) { return F.dateShort(m.date) + ' ' + esc(m.heure); } },
        { key: 'type', label: 'Type', render: function (m) { return U.badge(m.type, (TYPES_P[m.type] || {}).tone); } },
        { key: 'ref', label: 'Référence' },
        { key: 'volume', label: 'Volume', num: 1, render: function (m) { return mvtVolTxt(m, id); } }
      ], mv, { empty: 'Aucun mouvement enregistré' });
    var m = U.modal({ title: 'Bac ' + b.id + ' — ' + p.l, sub: esc(b.type) + ' · parc de stockage U600', size: 'lg', body: body, onClose: deep ? function () { clearDeep('bacs'); } : null,
      actions: [
        { label: 'Changer le statut', icon: 'edit', onClick: function (close) { close(); statutForm(b.id); } },
        { label: 'Transfert', icon: 'refresh', onClick: function (close) { close(); transfertForm(b.id); } },
        { label: 'Saisir un jaugeage', cls: 'primary', icon: 'target', onClick: function (close) { close(); jaugeageForm(b.id); } }
      ] });
    return m;
  }

  function bacOpts(filter) { return bacs().filter(filter || function () { return true; }).map(function (b) { return { v: b.id, l: b.id + ' · ' + P(b.produit).l + ' (' + F.num(b.volume) + ' m³)' }; }); }

  function jaugeageForm(id) {
    var b0 = S.get('bacs', id) || bacs().find(function (b) { return b.statut !== 'En maintenance'; });
    var u = E.session.user(), me = empIdByName(u && u.profile === 'achats' ? 'Mengue' : 'Ekomi');
    var m = U.formModal({ title: 'Saisie d\'un jaugeage', sub: 'Mesure manuelle ou radar — met à jour le volume du bac et le journal des mouvements', okLabel: 'Enregistrer le jaugeage',
      intro: '<div class="ops-note" id="jg-info" style="margin-bottom:14px"></div>',
      fields: [
        { name: 'bac', label: 'Bac', type: 'select', options: bacOpts(), required: true, full: true },
        { name: 'hauteur', label: 'Hauteur de produit (mm)', type: 'number', placeholder: 'ex. 12 480' },
        { name: 'volume', label: 'Volume mesuré (m³)', type: 'number', required: true, step: '1' },
        { name: 'temperature', label: 'Température (°C)', type: 'number', step: '0.1', required: true },
        { name: 'densite', label: 'Densité à 15 °C', type: 'number', step: '0.001', required: true },
        { name: 'operateur', label: 'Opérateur', type: 'select', options: empOpts(), required: true, full: true },
        { name: 'obs', label: 'Observation', type: 'textarea', placeholder: 'Eau libre, état du toit flottant, écart constaté…' }
      ],
      values: { bac: b0.id, volume: b0.volume, temperature: b0.temperature, densite: b0.densite, operateur: me },
      onSubmit: function (v) {
        var b = S.get('bacs', v.bac), vol = Math.round(+v.volume);
        if (vol < 0 || vol > b.capacite) { U.toast('Volume incohérent : la capacité du bac est de ' + F.num(b.capacite) + ' m³.', 'err'); return false; }
        var ecart = vol - b.volume, before = levelAlert(b);
        S.update('bacs', b.id, { volume: vol, temperature: +v.temperature, densite: +v.densite, dernierJaugeage: stamp(), jaugeur: v.operateur });
        addMvtP({ type: 'Jaugeage', produit: b.produit, bacSource: '', bacDest: b.id, volume: ecart, ref: (v.hauteur ? 'Hauteur ' + F.num(v.hauteur) + ' mm' : 'Jaugeage manuel') + (v.obs ? ' — ' + v.obs : ''), operateur: v.operateur });
        E.log('Jaugeage du bac ' + b.id, F.num(vol) + ' m³ (écart ' + signed(ecart) + ' m³)', 'stocks');
        var after = levelAlert(S.get('bacs', b.id));
        if (after && after !== before) E.notify('Niveau ' + after + ' — bac ' + b.id, P(b.produit).l + ' : ' + F.pct(pctOf(b), 1), '#/stocks/bacs/' + b.id, after === 'haut' ? 'red' : 'orange');
        U.toast('Jaugeage enregistré — ' + b.id + ' : ' + F.num(vol) + ' m³ (écart ' + signed(ecart) + ' m³)');
        E.rerender();
      } });
    var sel = m.el.querySelector('#f_bac');
    function info() {
      var b = S.get('bacs', sel.value), p = P(b.produit);
      m.el.querySelector('#jg-info').innerHTML = dot(p.c) + '<b>' + esc(b.id) + '</b> · ' + esc(p.l) + ' — volume théorique <b>' + F.num(b.volume) + ' m³</b> sur ' + F.num(b.capacite) + ' m³ · dernier jaugeage ' + fmtStamp(b.dernierJaugeage);
    }
    sel.onchange = function () { var b = S.get('bacs', sel.value); m.el.querySelector('#f_volume').value = b.volume; m.el.querySelector('#f_temperature').value = b.temperature; m.el.querySelector('#f_densite').value = b.densite; info(); };
    info();
  }

  function transfertForm(src) {
    var ok = function (b) { return b.statut !== 'En maintenance'; };
    var s0 = S.get('bacs', src) || S.get('bacs', 'T-09');
    var dests = function (s) { return bacOpts(function (b) { return ok(b) && b.produit === s.produit && b.id !== s.id; }); };
    var m = U.formModal({ title: 'Transfert entre bacs', sub: 'Même produit uniquement — les deux bacs sont mis à jour', okLabel: 'Valider le transfert',
      fields: [
        { name: 'src', label: 'Bac source', type: 'select', options: bacOpts(function (b) { return ok(b) && bacs().some(function (x) { return x.produit === b.produit && x.id !== b.id && ok(x); }); }), required: true },
        { name: 'dst', label: 'Bac destination', type: 'select', options: dests(s0), required: true },
        { name: 'volume', label: 'Volume à transférer (m³)', type: 'number', required: true, min: 1 },
        { name: 'operateur', label: 'Opérateur', type: 'select', options: empOpts(), required: true },
        { name: 'motif', label: 'Motif', type: 'text', full: true, placeholder: 'Homogénéisation, constitution de lot, libération d\'un bac…' }
      ],
      values: { src: s0.id, operateur: empIdByName('Mintsa') },
      onSubmit: function (v) {
        var a = S.get('bacs', v.src), b = S.get('bacs', v.dst), vol = Math.round(+v.volume);
        if (!b) { U.toast('Choisissez un bac de destination.', 'err'); return false; }
        if (vol <= 0 || vol > a.volume - a.capacite * a.min / 100) { U.toast('Volume supérieur au stock pompable du bac ' + a.id + ' (' + F.num(utile(a)) + ' m³).', 'err'); return false; }
        if (b.volume + vol > b.capacite * b.max / 100) { U.toast('Le bac ' + b.id + ' dépasserait son seuil haut (creux utile ' + F.num(b.capacite * b.max / 100 - b.volume) + ' m³).', 'err'); return false; }
        S.update('bacs', a.id, { volume: a.volume - vol }); S.update('bacs', b.id, { volume: b.volume + vol });
        addMvtP({ type: 'Transfert', produit: a.produit, bacSource: a.id, bacDest: b.id, volume: vol, ref: v.motif || 'Transfert', operateur: v.operateur });
        E.log('Transfert ' + a.id + ' → ' + b.id, F.num(vol) + ' m³ de ' + P(a.produit).l, 'stocks');
        U.toast('Transfert enregistré : ' + F.num(vol) + ' m³ de ' + a.id + ' vers ' + b.id);
        E.rerender();
      } });
    var sSel = m.el.querySelector('#f_src'), dSel = m.el.querySelector('#f_dst');
    sSel.onchange = function () { var s = S.get('bacs', sSel.value); dSel.innerHTML = dests(s).map(function (o) { return '<option value="' + o.v + '">' + esc(o.l) + '</option>'; }).join(''); };
  }

  function statutForm(id) {
    var b = S.get('bacs', id);
    U.formModal({ title: 'Statut du bac ' + b.id, sub: P(b.produit).l, size: 'sm',
      fields: [
        { name: 'statut', label: 'Nouveau statut', type: 'select', options: STATUTS_BAC, required: true, full: true },
        { name: 'lot', label: 'N° de lot / certificat labo (si certifié)', type: 'text', full: true, placeholder: 'LAB-2026-09xx' },
        { name: 'note', label: 'Observation', type: 'textarea' }
      ], values: { statut: b.statut, lot: b.lot, note: b.note },
      onSubmit: function (v) {
        if (v.statut === 'Certifié' && !v.lot) { U.toast('Indiquez le numéro de lot du certificat d\'analyse.', 'err'); return false; }
        S.update('bacs', b.id, { statut: v.statut, lot: v.statut === 'Certifié' ? v.lot : b.lot, note: v.note });
        E.log('Statut du bac ' + b.id, b.statut + ' → ' + v.statut, 'stocks');
        if (v.statut === 'Certifié') E.notify('Bac ' + b.id + ' certifié', P(b.produit).l + ' — lot ' + v.lot + ' libéré pour expédition', '#/stocks/bacs/' + b.id, 'green');
        U.toast('Bac ' + b.id + ' : ' + v.statut); E.rerender();
      } });
  }

  /* ---------- Mouvements & bilan ---------- */
  function cmpMvt(a, b) { return (b.date + b.heure).localeCompare(a.date + a.heure); }
  function mvtRoute(m) { if (!m.bacSource) return (m.type === 'Jaugeage' ? 'Bac ' : '→ ') + m.bacDest; return m.bacSource + ' → ' + (m.bacDest || (TYPES_P[m.type] && TYPES_P[m.type].s < 0 ? 'clients' : '—')); }
  function mvtSign(m) { var t = TYPES_P[m.type]; return t ? t.s : 0; }
  function mvtVolTxt(m, bacId) {
    if (m.type === 'Jaugeage') return '<span class="' + (m.volume < 0 ? 'ops-neg' : m.volume > 0 ? 'ops-pos' : '') + '">' + signed(m.volume) + ' m³</span>';
    var s = mvtSign(m); if (m.type === 'Transfert' && bacId) s = m.bacSource === bacId ? -1 : 1;
    return s > 0 ? '<span class="ops-pos">+' + F.num(m.volume) + ' m³</span>' : s < 0 ? '<span>−' + F.num(m.volume) + ' m³</span>' : F.num(m.volume) + ' m³';
  }
  function addMvtP(o) { o.id = S.next('MP'); o.date = o.date || E.today(); o.heure = o.heure || nowHM(); S.all('mouvementsProduits').unshift(o); S.save(); return o; }
  function bilanJour(d) {
    var l = S.all('mouvementsProduits').filter(function (m) { return m.date === d; });
    var r = { date: d, reception: 0, production: 0, charge: 0, expCamions: 0, expNavires: 0, ecart: 0, n: l.length };
    l.forEach(function (m) {
      if (m.type === 'Réception navire') r.reception += m.volume; else if (m.type === 'Production') r.production += m.volume; else if (m.type === 'Charge unité') r.charge += m.volume;
      else if (m.type === 'Expédition camions') r.expCamions += m.volume; else if (m.type === 'Expédition navire') r.expNavires += m.volume; else if (m.type === 'Jaugeage') r.ecart += m.volume;
    });
    r.entrees = r.reception + r.production; r.sorties = r.charge + r.expCamions + r.expNavires; r.solde = r.entrees - r.sorties; r.ecartPct = r.entrees ? r.ecart / r.entrees * 100 : 0;
    return r;
  }
  function vMouvements(el) {
    var days = []; for (var i = -7; i <= 0; i++) days.push(E.addDays(E.today(), i));
    var bil = days.map(bilanJour).reverse();
    var all = S.all('mouvementsProduits'), lim = state.mvAll ? 400 : 25;
    var list = all.filter(function (m) { return (!state.mvType || m.type === state.mvType) && (!state.mvProd || m.produit === state.mvProd) && (!state.mvDay || m.date === state.mvDay); }).sort(cmpMvt);
    var cols = [
      { key: 'date', label: 'Date', render: function (m) { return '<span class="nowrap">' + F.dateShort(m.date) + ' ' + esc(m.heure) + '</span>'; }, csv: function (m) { return m.date + ' ' + m.heure; } },
      { key: 'type', label: 'Type', render: function (m) { return U.badge(m.type, (TYPES_P[m.type] || {}).tone); } },
      { key: 'produit', label: 'Produit', render: function (m) { return dot(P(m.produit).c) + esc(P(m.produit).l.split(' (')[0]); }, csv: function (m) { return P(m.produit).l; } },
      { key: 'route', label: 'De → vers', render: function (m) { return '<span class="mono">' + esc(mvtRoute(m)) + '</span>'; }, csv: mvtRoute },
      { key: 'volume', label: 'Volume', num: 1, render: function (m) { return mvtVolTxt(m); }, csv: function (m) { return (m.type === 'Jaugeage' ? 1 : mvtSign(m) || 1) * m.volume; } },
      { key: 'ref', label: 'Référence', render: function (m) { return '<span class="small">' + esc(m.ref) + '</span>'; } },
      { key: 'operateur', label: 'Opérateur', render: function (m) { return '<span class="small">' + esc(E.empName(m.operateur)) + '</span>'; }, csv: function (m) { return E.empName(m.operateur); } }
    ];
    var chartDays = bil.slice().reverse().filter(function (b) { return b.date !== E.today(); });
    el.innerHTML =
      '<div class="grid g-2-1">' +
        '<div class="card"><div class="card__h"><h3>Bilan matière journalier</h3><span class="sub">m³ à température ambiante — le jour en cours est provisoire</span></div>' +
        U.table([
          { key: 'date', label: 'Journée', render: function (r) { return '<b class="nowrap">' + F.dateShort(r.date) + '</b>' + (r.date === E.today() ? ' ' + U.badge('En cours', 'blue') : ''); } },
          { key: 'reception', label: 'Brut reçu', num: 1, render: function (r) { return r.reception ? F.num(r.reception) : '<span class="muted">0</span>'; } },
          { key: 'production', label: 'Production', num: 1, render: function (r) { return F.num(r.production); } },
          { key: 'charge', label: 'Charge U100', num: 1, render: function (r) { return F.num(r.charge); } },
          { key: 'exp', label: 'Expéditions', num: 1, render: function (r) { return F.num(r.expCamions + r.expNavires); } },
          { key: 'solde', label: 'Solde', num: 1, render: function (r) { return '<span class="' + (r.solde >= 0 ? 'ops-pos' : 'ops-neg') + '">' + signed(r.solde) + '</span>'; } },
          { key: 'ecart', label: 'Écart jaugé', num: 1, render: function (r) { return '<span class="' + (Math.abs(r.ecartPct) > 0.2 ? 'ops-neg' : '') + '">' + signed(r.ecart) + ' (' + F.num(r.ecartPct, 2) + ' %)</span>'; } }
        ], bil, { footer: function (rows) { var c = rows.filter(function (r) { return r.date !== E.today(); }); return '<td>Total 7 jours clos</td><td class="num">' + F.num(sum(c, 'reception')) + '</td><td class="num">' + F.num(sum(c, 'production')) + '</td><td class="num">' + F.num(sum(c, 'charge')) + '</td><td class="num">' + F.num(sum(c, function (r) { return r.expCamions + r.expNavires; })) + '</td><td class="num">' + signed(sum(c, 'solde')) + '</td><td class="num">' + signed(sum(c, 'ecart')) + '</td>'; } }) + '</div>' +
        '<div class="card"><div class="card__h"><h3>Entrées / sorties</h3><span class="sub">7 derniers jours clos</span></div><div class="card__b">' +
          U.bars({ labels: chartDays.map(function (r) { return F.dateShort(r.date).slice(0, 5); }), series: [{ name: 'Entrées', values: chartDays.map(function (r) { return r.entrees; }), color: '#1e9e4a' }, { name: 'Sorties', values: chartDays.map(function (r) { return r.sorties; }), color: '#e8780c' }], height: 210 }) +
          '<div class="ops-note" style="margin-top:12px">Tolérance d\'écart de jaugeage : <b>± 0,20 %</b> des entrées. Au-delà, une vérification contradictoire (jaugeage manuel + échantillonnage labo) est déclenchée.</div></div></div>' +
      '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Journal des mouvements produits</h3><span class="sub">' + list.length + ' mouvement(s)</span></div><div class="card__b" style="padding-bottom:0">' +
        '<div class="filters"><select class="select" id="mv-type"><option value="">Tous les types</option>' + Object.keys(TYPES_P).map(function (t) { return '<option' + (state.mvType === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
        '<select class="select" id="mv-prod"><option value="">Tous les produits</option>' + PRODUITS.map(function (p) { return '<option value="' + p.k + '"' + (state.mvProd === p.k ? ' selected' : '') + '>' + esc(p.l) + '</option>'; }).join('') + '</select>' +
        '<select class="select" id="mv-day"><option value="">Toutes les journées</option>' + days.slice().reverse().map(function (d) { return '<option value="' + d + '"' + (state.mvDay === d ? ' selected' : '') + '>' + F.date(d) + '</option>'; }).join('') + '</select>' +
        '<span class="spacer"></span><button class="btn" id="mv-csv">' + E.icon('download') + 'Export CSV</button><button class="btn primary" id="mv-new">' + E.icon('plus') + 'Nouveau mouvement</button></div></div>' +
        U.table(cols, list.slice(0, lim), { empty: 'Aucun mouvement pour ces critères' }) + (list.length > lim ? '<div class="card__b row"><span class="small muted">' + lim + ' mouvements affichés sur ' + list.length + '</span><button class="btn sm" id="mv-more">Afficher tout</button></div>' : '') + '</div>';
    el.querySelector('#mv-type').onchange = function () { state.mvType = this.value; vMouvements(el); };
    el.querySelector('#mv-prod').onchange = function () { state.mvProd = this.value; vMouvements(el); };
    el.querySelector('#mv-day').onchange = function () { state.mvDay = this.value; vMouvements(el); };
    el.querySelector('#mv-csv').onclick = function () { U.exportCSV('mouvements-produits-' + E.today(), cols, list); };
    el.querySelector('#mv-new').onclick = mvtForm;
    var more = el.querySelector('#mv-more'); if (more) more.onclick = function () { state.mvAll = true; vMouvements(el); };
  }
  function mvtForm() {
    var types = ['Réception navire', 'Production', 'Charge unité', 'Expédition camions', 'Expédition navire'];
    U.formModal({ title: 'Nouveau mouvement produit', sub: 'Le volume du bac est mis à jour immédiatement', okLabel: 'Enregistrer',
      fields: [
        { name: 'type', label: 'Type de mouvement', type: 'select', options: types, required: true },
        { name: 'bac', label: 'Bac concerné', type: 'select', options: bacOpts(function (b) { return b.statut !== 'En maintenance'; }), required: true },
        { name: 'volume', label: 'Volume (m³)', type: 'number', required: true, min: 1 },
        { name: 'heure', label: 'Heure', type: 'time', value: nowHM() },
        { name: 'ref', label: 'Référence (navire, BL, unité…)', type: 'text', full: true, placeholder: 'ex. MT Rabi Spirit — escale ESC-2026-041' },
        { name: 'operateur', label: 'Opérateur', type: 'select', options: empOpts(), required: true, full: true, value: empIdByName('Ekomi') }
      ],
      onSubmit: function (v) {
        var b = S.get('bacs', v.bac), s = TYPES_P[v.type].s, vol = Math.round(+v.volume);
        if (vol <= 0) { U.toast('Le volume doit être positif.', 'err'); return false; }
        if (s < 0 && vol > b.volume) { U.toast('Volume supérieur au stock du bac ' + b.id + ' (' + F.num(b.volume) + ' m³).', 'err'); return false; }
        if (s > 0 && b.volume + vol > b.capacite) { U.toast('Capacité du bac ' + b.id + ' dépassée (creux ' + F.num(b.capacite - b.volume) + ' m³).', 'err'); return false; }
        if (v.type === 'Réception navire' && b.produit !== 'brut') { U.toast('Les réceptions navire concernent les bacs de brut.', 'err'); return false; }
        var before = levelAlert(b);
        S.update('bacs', b.id, { volume: b.volume + s * vol });
        addMvtP({ type: v.type, produit: b.produit, bacSource: s < 0 ? b.id : (v.type === 'Production' ? 'Unités' : ''), bacDest: s > 0 ? b.id : (v.type === 'Charge unité' ? 'U100' : ''), volume: vol, heure: v.heure || nowHM(), ref: v.ref || v.type, operateur: v.operateur });
        E.log(v.type + ' — bac ' + b.id, F.num(vol) + ' m³ de ' + P(b.produit).l, 'stocks');
        var after = levelAlert(S.get('bacs', b.id));
        if (after && after !== before) E.notify('Niveau ' + after + ' — bac ' + b.id, P(b.produit).l + ' : ' + F.pct(pctOf(b), 1), '#/stocks/bacs/' + b.id, after === 'haut' ? 'red' : 'orange');
        U.toast('Mouvement enregistré : ' + v.type + ' ' + F.num(vol) + ' m³ (' + b.id + ')'); E.rerender();
      } });
  }

  /* ---------- Magasin ---------- */
  function artCols(withVal) {
    return [
      { key: 'id', label: 'Référence', render: function (a) { return '<span class="mono">' + esc(a.id) + '</span>'; } },
      { key: 'designation', label: 'Désignation', render: function (a) { return '<b>' + esc(a.designation) + '</b>' + (a.critique ? ' <span class="badge tone-red plain">Critique</span>' : '') + '<div class="small muted">' + esc(a.categorie) + ' · ' + esc(fournNom(a.fournisseurId)) + '</div>'; }, csv: function (a) { return a.designation; } },
      { key: 'emplacement', label: 'Emplacement', render: function (a) { return '<span class="mono">' + esc(a.emplacement) + '</span>'; } },
      { key: 'qte', label: 'Stock', num: 1, render: function (a) { var st = artStatut(a); return '<b class="' + (st === 'Rupture' || st === 'Sous seuil' ? 'ops-neg' : '') + '">' + F.num(a.qte) + '</b> <span class="small muted">' + esc(a.unite) + '</span>'; } },
      { key: 'minmax', label: 'Mini / maxi', num: 1, render: function (a) { return '<span class="small">' + F.num(a.min) + ' / ' + F.num(a.max) + '</span>'; }, csv: function (a) { return a.min + ' / ' + a.max; } },
      { key: 'pu', label: 'Prix unitaire', num: 1, cls: 'ops-hide-m', render: function (a) { return F.money(a.pu); } },
      withVal ? { key: 'valeur', label: 'Valeur', num: 1, render: function (a) { return '<b>' + F.short(a.qte * a.pu) + '</b>'; }, csv: function (a) { return a.qte * a.pu; } } : null,
      { key: 'couv', label: 'Couverture', num: 1, cls: 'ops-hide-m', render: function (a) { var c = couvMois(a); return c == null ? '—' : F.num(c, 1) + ' mois'; }, csv: function (a) { var c = couvMois(a); return c == null ? '' : c.toFixed(1); } },
      { key: 'statut', label: 'Statut', render: function (a) { var s = artStatut(a); return U.badge(s, ART_TONE[s]) + (a.daEnCours ? '<div class="small muted" style="margin-top:3px">' + esc(a.daEnCours) + '</div>' : ''); }, csv: artStatut }
    ].filter(Boolean);
  }
  function vMagasin(el) {
    var cats = Object.keys(E.groupBy(articles(), 'categorie')).sort();
    var q = E.norm(state.q);
    var list = articles().filter(function (a) {
      if (state.cat && a.categorie !== state.cat) return false;
      if (state.artFilter === 'seuil' && a.qte > a.min) return false;
      if (state.artFilter === 'critique' && !a.critique) return false;
      if (q && E.norm(a.id + ' ' + a.designation + ' ' + a.emplacement + ' ' + a.categorie).indexOf(q) < 0) return false;
      return true;
    });
    el.innerHTML =
      '<div class="ops-toolbar"><div class="chips" id="art-f"><button class="chip' + (!state.artFilter ? ' is-active' : '') + '" data-k="">Tous (' + articles().length + ')</button><button class="chip' + (state.artFilter === 'seuil' ? ' is-active' : '') + '" data-k="seuil">Sous seuil (' + sousSeuil().length + ')</button><button class="chip' + (state.artFilter === 'critique' ? ' is-active' : '') + '" data-k="critique">Critiques (' + articles().filter(function (a) { return a.critique; }).length + ')</button></div></div>' +
      '<div class="ops-toolbar"><input class="input" id="art-q" type="search" placeholder="Rechercher un article, une référence…" value="' + esc(state.q) + '"><select class="select" id="art-cat"><option value="">Toutes les catégories</option>' + cats.map(function (c) { return '<option' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select><span class="spacer"></span>' +
      '<button class="btn" id="art-csv">' + E.icon('download') + 'CSV</button><button class="btn" id="art-new">' + E.icon('plus') + 'Nouvel article</button><button class="btn" id="art-in">' + E.icon('inbox') + 'Entrée / retour</button><button class="btn primary" id="art-out">' + E.icon('send') + 'Bon de sortie</button></div>' +
      '<div class="card"><div class="card__h"><h3>Articles en stock</h3><span class="sub">' + list.length + ' référence(s) · valeur ' + F.money(sum(list, function (a) { return a.qte * a.pu; })) + '</span></div>' +
      U.table(artCols(true), list, { onRow: function (a) { openArticle(a.id); }, empty: 'Aucun article ne correspond' }) + '</div>';
    el.querySelector('#art-f').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) { state.artFilter = b.dataset.k; vMagasin(el); } });
    var qi = el.querySelector('#art-q'); qi.oninput = function () { state.q = qi.value; clearTimeout(qi._t); qi._t = setTimeout(function () { vMagasin(el); var n = el.querySelector('#art-q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    el.querySelector('#art-cat').onchange = function () { state.cat = this.value; vMagasin(el); };
    el.querySelector('#art-csv').onclick = function () { U.exportCSV('magasin-articles-' + E.today(), artCols(true), list); };
    el.querySelector('#art-new').onclick = function () { articleForm(); };
    el.querySelector('#art-in').onclick = function () { entreeForm(); };
    el.querySelector('#art-out').onclick = function () { sortieForm(); };
  }
  function openArticle(id, deep) {
    var a = S.get('articles', id); if (!a) return;
    var st = artStatut(a), mv = S.all('mouvementsStock').filter(function (m) { return m.articleId === id; }).sort(function (x, y) { return y.date.localeCompare(x.date); });
    var body = (a.qte <= a.min ? '<div class="alert tone-' + (a.critique ? 'red' : 'orange') + '" style="margin-bottom:14px">' + E.icon('alert') + '<div><b>Stock sous le seuil mini' + (a.critique ? ' — article critique' : '') + '.</b> Quantité proposée au réapprovisionnement : <b>' + F.num(a.max - a.qte) + ' ' + esc(a.unite) + '</b> (délai fournisseur ' + ((S.get('fournisseurs', a.fournisseurId) || {}).delai || '—') + ' j).' + (a.daEnCours ? ' Demande d\'achat ' + esc(a.daEnCours) + ' en cours.' : '') + '</div></div>' : '') +
      '<div class="grid g2 stack-m"><dl class="kv"><dt>Référence</dt><dd class="mono">' + esc(a.id) + '</dd><dt>Catégorie</dt><dd>' + esc(a.categorie) + '</dd><dt>Emplacement</dt><dd class="mono">' + esc(a.emplacement) + '</dd><dt>Fournisseur habituel</dt><dd>' + esc(fournNom(a.fournisseurId)) + '</dd><dt>Criticité</dt><dd>' + (a.critique ? U.badge('Critique (sécurité / production)', 'red') : U.badge('Standard', 'grey')) + '</dd><dt>Dernier inventaire</dt><dd>' + F.date(a.dernierInventaire) + '</dd></dl>' +
      '<div><div class="ops-stat"><div><span>Stock</span><b>' + F.num(a.qte) + ' ' + esc(a.unite) + '</b></div><div><span>Mini / maxi</span><b>' + a.min + ' / ' + a.max + '</b></div><div><span>Valeur</span><b>' + F.short(a.qte * a.pu) + '</b></div><div><span>Couverture</span><b>' + (couvMois(a) == null ? '—' : F.num(couvMois(a), 1) + ' mois') + '</b></div></div>' +
      '<div style="margin-top:12px">' + U.progress(Math.min(100, a.qte / a.max * 100), st === 'Disponible' ? 'green' : st === 'Surstock' ? '' : 'orange') + '<div class="small muted" style="margin-top:4px">' + U.badge(st, ART_TONE[st]) + ' · PU ' + F.money(a.pu) + ' · consommation ' + F.num(a.consoAn || 0) + ' ' + esc(a.unite) + '/an</div></div></div></div>' +
      '<h4 style="margin:18px 0 8px;font-size:14px">Mouvements de l\'article</h4>' +
      U.table([
        { key: 'date', label: 'Date', render: function (m) { return F.dateShort(m.date); } },
        { key: 'type', label: 'Type', render: function (m) { return U.badge(m.type, TYPES_S[m.type].tone); } },
        { key: 'qte', label: 'Quantité', num: 1, render: function (m) { return msQteTxt(m); } },
        { key: 'ref', label: 'Pièce', render: function (m) { return '<span class="mono">' + esc(m.ref) + '</span>'; } },
        { key: 'demandeur', label: 'Par', render: function (m) { return esc(E.empName(m.demandeur)); } }
      ], mv, { empty: 'Aucun mouvement récent' });
    U.modal({ title: a.designation, sub: a.id + ' · ' + esc(a.categorie), size: 'lg', body: body, onClose: deep ? function () { clearDeep('magasin'); } : null,
      actions: [
        { label: 'Modifier', icon: 'edit', onClick: function (c) { c(); articleForm(a.id); } },
        { label: 'Compter (inventaire)', icon: 'list', onClick: function (c) { c(); countForm(a.id); } },
        { label: 'Entrée', icon: 'inbox', onClick: function (c) { c(); entreeForm(a.id); } },
        { label: 'Bon de sortie', cls: 'primary', icon: 'send', onClick: function (c) { c(); sortieForm(a.id); } }
      ] });
  }
  function artOpts(f) { return articles().filter(f || function () { return true; }).map(function (a) { return { v: a.id, l: a.id + ' · ' + a.designation + ' (' + F.num(a.qte) + ' ' + a.unite + ')' }; }); }
  function otOpts() {
    if (S.has('ordres') && S.all('ordres').length) return S.all('ordres').filter(function (o) { return !/clôtur|termin|annul/i.test(o.statut || ''); }).map(function (o) { return { v: o.id, l: o.id + ' · ' + (o.titre || o.objet || o.libelle || o.equipement || '') }; });
    return null;
  }
  function addMvtS(o) { o.id = S.next('MS'); o.date = o.date || E.today(); S.all('mouvementsStock').unshift(o); S.save(); return o; }
  function sortieForm(id) {
    var ots = otOpts(), u = E.session.user();
    var m = U.formModal({ title: 'Bon de sortie magasin', sub: 'Sortie imputée à un ordre de travail — le stock est décrémenté', okLabel: 'Valider la sortie',
      intro: '<div class="ops-note" id="bs-info" style="margin-bottom:14px"></div>',
      fields: [
        { name: 'article', label: 'Article', type: 'select', options: artOpts(function (x) { return x.qte > 0; }), required: true, full: true },
        { name: 'qte', label: 'Quantité', type: 'number', required: true, min: 1, value: 1 },
        ots ? { name: 'ot', label: 'Ordre de travail imputé', type: 'select', options: ots, empty: '— Choisir un OT —', required: true } : { name: 'ot', label: 'Ordre de travail imputé', type: 'text', required: true, placeholder: 'OT-2026-0420' },
        { name: 'demandeur', label: 'Demandeur', type: 'select', options: empOpts(), required: true, value: empIdByName('Mapangou') },
        { name: 'unite', label: 'Unité / destination', type: 'select', options: E.options('unites', function (x) { return x.id + ' · ' + x.nom; }) },
        { name: 'commentaire', label: 'Motif / commentaire', type: 'textarea', placeholder: 'ex. Remplacement garniture pompe P-102 A' }
      ], values: { article: id },
      onSubmit: function (v) {
        var a = S.get('articles', v.article), q = +v.qte;
        if (!(q > 0)) { U.toast('Quantité invalide.', 'err'); return false; }
        if (q > a.qte) { U.toast('Stock insuffisant : ' + F.num(a.qte) + ' ' + a.unite + ' disponible(s).', 'err'); return false; }
        var wasOk = a.qte > a.min;
        S.update('articles', a.id, { qte: a.qte - q });
        var bs = S.next('BS');
        var mv = addMvtS({ type: 'Sortie', articleId: a.id, qte: q, pu: a.pu, ref: v.ot, bs: bs, demandeur: v.demandeur, unite: v.unite, commentaire: v.commentaire || '', saisiPar: u ? u.name : '' });
        E.log('Bon de sortie ' + bs, F.num(q) + ' ' + a.unite + ' · ' + a.designation + ' → ' + v.ot, 'stocks');
        if (wasOk && a.qte <= a.min) E.notify('Article sous le seuil mini', a.designation + ' (' + F.num(a.qte) + ' ' + a.unite + ')', '#/stocks/reappro', a.critique ? 'red' : 'orange');
        U.toast('Sortie validée — ' + bs);
        E.rerender();
        setTimeout(function () { printBS(mv); }, 60);
      } });
    var sel = m.el.querySelector('#f_article');
    function info() { var a = S.get('articles', sel.value); if (!a) return; m.el.querySelector('#bs-info').innerHTML = '<b>' + esc(a.designation) + '</b><br>Stock : <b>' + F.num(a.qte) + ' ' + esc(a.unite) + '</b> · emplacement <span class="mono">' + esc(a.emplacement) + '</span> · seuil mini ' + a.min + (a.critique ? ' · ' + U.badge('Critique', 'red') : ''); }
    sel.onchange = info; info();
  }
  function printBS(m) {
    var a = S.get('articles', m.articleId) || {}, un = S.get('unites', m.unite);
    printModal('Bon de sortie ' + (m.bs || m.id), docHead('BON DE SORTIE MAGASIN', m.bs || m.id, 'Port-Gentil, le ' + F.date(m.date)) +
      '<div class="ops-doc-meta"><div><span>Ordre de travail : </span><b>' + esc(m.ref) + '</b></div><div><span>Demandeur : </span><b>' + esc(E.empName(m.demandeur)) + '</b></div><div><span>Unité / destination : </span><b>' + esc(un ? un.id + ' · ' + un.nom : '—') + '</b></div><div><span>Magasin : </span><b>Magasin central — U900</b></div></div>' +
      '<table class="ops-doc-tbl"><thead><tr><th>Référence</th><th>Désignation</th><th>Empl.</th><th class="num">Qté</th><th class="num">PU</th><th class="num">Montant</th></tr></thead><tbody><tr><td class="mono">' + esc(a.id) + '</td><td>' + esc(a.designation) + '</td><td class="mono">' + esc(a.emplacement) + '</td><td class="num">' + F.num(m.qte) + ' ' + esc(a.unite) + '</td><td class="num">' + F.money(m.pu) + '</td><td class="num"><b>' + F.money(m.qte * m.pu) + '</b></td></tr></tbody></table>' +
      (m.commentaire ? '<p><span class="muted">Motif : </span>' + esc(m.commentaire) + '</p>' : '') +
      '<p class="small muted">Imputation analytique : coût porté sur l\'ordre de travail ' + esc(m.ref) + '. Le matériel non utilisé doit être retourné au magasin sous 72 h avec ce bon.</p>' +
      '<div class="ops-sign"><div>Magasinier</div><div>Demandeur (réception du matériel)</div><div>Visa chef de service</div></div>');
  }
  function entreeForm(id) {
    U.formModal({ title: 'Entrée en stock', sub: 'Réception d\'une commande fournisseur ou retour de matériel non utilisé', okLabel: 'Enregistrer l\'entrée',
      fields: [
        { name: 'type', label: 'Type', type: 'select', options: [{ v: 'Entrée', l: 'Réception de commande (BC)' }, { v: 'Retour', l: 'Retour de matériel (OT)' }], required: true },
        { name: 'article', label: 'Article', type: 'select', options: artOpts(), required: true, full: true },
        { name: 'qte', label: 'Quantité reçue', type: 'number', required: true, min: 1 },
        { name: 'ref', label: 'N° de BC ou d\'OT', type: 'text', required: true, placeholder: 'BC-2026-0135 ou OT-2026-0417' },
        { name: 'commentaire', label: 'Commentaire', type: 'textarea', placeholder: 'Contrôle qualité, réserves à la réception…' }
      ], values: { article: id },
      onSubmit: function (v) {
        var a = S.get('articles', v.article), q = +v.qte;
        if (!(q > 0)) { U.toast('Quantité invalide.', 'err'); return false; }
        var patch = { qte: a.qte + q }; if (v.type === 'Entrée' && a.daEnCours) patch.daEnCours = '';
        S.update('articles', a.id, patch);
        addMvtS({ type: v.type, articleId: a.id, qte: q, pu: a.pu, ref: v.ref, demandeur: empIdByName('Mengue'), commentaire: v.commentaire || (v.type === 'Entrée' ? 'Réception' : 'Retour magasin') });
        E.log((v.type === 'Entrée' ? 'Réception ' : 'Retour ') + v.ref, F.num(q) + ' ' + a.unite + ' · ' + a.designation, 'stocks');
        U.toast('Stock mis à jour : ' + a.designation + ' → ' + F.num(a.qte) + ' ' + a.unite); E.rerender();
      } });
  }
  function articleForm(id) {
    var a = id ? S.get('articles', id) : null;
    var cats = Object.keys(E.groupBy(articles(), 'categorie')).sort();
    U.formModal({ title: a ? 'Modifier l\'article ' + a.id : 'Nouvel article', okLabel: a ? 'Enregistrer' : 'Créer l\'article',
      fields: [
        { name: 'designation', label: 'Désignation', required: true, full: true },
        { name: 'categorie', label: 'Catégorie', type: 'select', options: cats, required: true },
        { name: 'unite', label: 'Unité', required: true, placeholder: 'u, m, fût, paire…' },
        { name: 'qte', label: 'Stock initial', type: 'number', required: true, min: 0 },
        { name: 'pu', label: 'Prix unitaire (FCFA)', type: 'money', required: true, min: 0 },
        { name: 'min', label: 'Seuil mini', type: 'number', required: true, min: 0 },
        { name: 'max', label: 'Stock maxi', type: 'number', required: true, min: 0 },
        { name: 'emplacement', label: 'Emplacement', placeholder: 'A-01-1' },
        { name: 'fournisseurId', label: 'Fournisseur habituel', type: 'select', options: E.options('fournisseurs') },
        { name: 'consoAn', label: 'Consommation annuelle', type: 'number', min: 0 },
        { name: 'critique', label: 'Article critique', type: 'select', options: [{ v: '0', l: 'Non' }, { v: '1', l: 'Oui — sécurité / production' }] }
      ],
      values: a ? Object.assign({}, a, { critique: a.critique ? '1' : '0' }) : { unite: 'u', qte: 0, min: 1, max: 5, critique: '0', fournisseurId: 'F-001' },
      onSubmit: function (v) {
        if (+v.max < +v.min) { U.toast('Le stock maxi doit être supérieur au seuil mini.', 'err'); return false; }
        var o = { designation: v.designation, categorie: v.categorie, unite: v.unite, qte: +v.qte, pu: +v.pu, min: +v.min, max: +v.max, emplacement: v.emplacement, fournisseurId: v.fournisseurId, consoAn: +v.consoAn || 0, critique: v.critique === '1' };
        if (a) { S.update('articles', a.id, o); E.log('Article modifié ' + a.id, o.designation, 'stocks'); U.toast('Article ' + a.id + ' mis à jour'); }
        else {
          var n = Math.max.apply(null, articles().map(function (x) { return +String(x.id).replace(/\D/g, '') || 0; }).concat([1000])) + 1;
          o.id = 'ART-' + n; o.dernierInventaire = E.today(); articles().push(o); S.save();
          E.log('Article créé ' + o.id, o.designation, 'stocks'); U.toast('Article ' + o.id + ' créé');
        }
        E.rerender();
      } });
  }

  /* ---------- Mouvements magasin ---------- */
  function msSign(m) { return m.type === 'Sortie' ? -1 : 1; }
  function msQteTxt(m) { var a = S.get('articles', m.articleId) || {}, s = msSign(m) * m.qte; return '<span class="' + (s < 0 ? 'ops-neg' : 'ops-pos') + '">' + signed(s) + '</span> <span class="small muted">' + esc(a.unite || '') + '</span>'; }
  function vSorties(el) {
    var all = S.all('mouvementsStock').slice().sort(function (a, b) { return b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)); });
    var list = all.filter(function (m) { return !state.msType || m.type === state.msType; });
    var from30 = E.addDays(E.today(), -30), l30 = all.filter(function (m) { return m.date >= from30; });
    var valIn = sum(l30.filter(function (m) { return m.type === 'Entrée'; }), function (m) { return m.qte * m.pu; });
    var valOut = sum(l30.filter(function (m) { return m.type === 'Sortie'; }), function (m) { return m.qte * m.pu; });
    var byCat = {}; l30.filter(function (m) { return m.type === 'Sortie'; }).forEach(function (m) { var a = S.get('articles', m.articleId); if (a) byCat[a.categorie] = (byCat[a.categorie] || 0) + m.qte * m.pu; });
    var catK = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
    var cols = [
      { key: 'date', label: 'Date', render: function (m) { return F.dateShort(m.date); } },
      { key: 'type', label: 'Type', render: function (m) { return U.badge(m.type, TYPES_S[m.type].tone); } },
      { key: 'article', label: 'Article', render: function (m) { var a = S.get('articles', m.articleId) || {}; return '<b>' + esc(a.designation || m.articleId) + '</b><div class="small muted mono">' + esc(m.articleId) + '</div>'; }, csv: function (m) { return (S.get('articles', m.articleId) || {}).designation; } },
      { key: 'qte', label: 'Quantité', num: 1, render: msQteTxt, csv: function (m) { return msSign(m) * m.qte; } },
      { key: 'valeur', label: 'Valeur', num: 1, render: function (m) { return F.short(m.qte * m.pu); }, csv: function (m) { return m.qte * m.pu; } },
      { key: 'ref', label: 'Pièce', render: function (m) { return '<span class="mono">' + esc(m.bs ? m.bs + ' · ' : '') + esc(m.ref) + '</span>'; } },
      { key: 'demandeur', label: 'Demandeur', render: function (m) { return esc(E.empName(m.demandeur)); }, csv: function (m) { return E.empName(m.demandeur); } },
      { key: 'commentaire', label: 'Commentaire', render: function (m) { return '<span class="small">' + esc(m.commentaire) + '</span>'; } }
    ];
    el.innerHTML =
      '<div class="grid g-2-1">' +
        '<div class="card"><div class="card__h"><h3>Flux du magasin — 30 jours</h3></div><div class="card__b"><div class="ops-stat"><div><span>Entrées (valeur)</span><b class="ops-pos">' + F.short(valIn) + '</b></div><div><span>Sorties (valeur)</span><b>' + F.short(valOut) + '</b></div><div><span>Bons de sortie</span><b>' + l30.filter(function (m) { return m.type === 'Sortie'; }).length + '</b></div><div><span>OT servis</span><b>' + Object.keys(E.groupBy(l30.filter(function (m) { return /^OT-/.test(m.ref); }), 'ref')).length + '</b></div></div>' +
        '<div style="margin-top:14px">' + (catK.length ? U.bars({ labels: catK.map(function (c) { return c.split(' ')[0]; }), series: [{ name: 'Sorties', values: catK.map(function (c) { return byCat[c]; }), color: '#163b75' }], height: 180, money: true }) : '') + '</div></div></div>' +
        '<div class="card"><div class="card__h"><h3>Actions rapides</h3></div><div class="card__b stack">' +
          '<button class="btn primary" id="ms-out">' + E.icon('send') + 'Établir un bon de sortie</button><button class="btn" id="ms-in">' + E.icon('inbox') + 'Réception / retour</button><button class="btn" id="ms-csv">' + E.icon('download') + 'Exporter les mouvements</button>' +
          '<div class="ops-note">Chaque sortie est imputée à un <b>ordre de travail</b> de la maintenance : le coût des pièces remonte automatiquement dans le suivi des OT et le contrôle de gestion.</div></div></div>' +
      '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Mouvements de stock</h3><span class="sub">' + list.length + ' mouvement(s) · cliquez sur une sortie pour réimprimer le bon</span><span class="spacer"></span><div class="chips" id="ms-f">' + ['', 'Entrée', 'Sortie', 'Retour', 'Inventaire'].map(function (t) { return '<button class="chip' + (state.msType === t ? ' is-active' : '') + '" data-k="' + t + '">' + (t || 'Tous') + '</button>'; }).join('') + '</div></div>' +
      U.table(cols, list, { onRow: function (m) { if (m.type === 'Sortie') printBS(m); else openArticle(m.articleId); } }) + '</div>';
    el.querySelector('#ms-f').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) { state.msType = b.dataset.k; vSorties(el); } });
    el.querySelector('#ms-out').onclick = function () { sortieForm(); };
    el.querySelector('#ms-in').onclick = function () { entreeForm(); };
    el.querySelector('#ms-csv').onclick = function () { U.exportCSV('mouvements-magasin-' + E.today(), cols, list); };
  }

  /* ---------- Réapprovisionnement ---------- */
  function vReappro(el) {
    var list = articles().filter(function (a) { return a.qte <= a.min || a.qte <= a.min * 1.15; }).sort(function (a, b) { return (b.critique - a.critique) || (a.qte / Math.max(1, a.min) - b.qte / Math.max(1, b.min)); });
    var sel = {}; list.forEach(function (a) { sel[a.id] = a.qte <= a.min && !a.daEnCours; });
    var qty = {}; list.forEach(function (a) { qty[a.id] = Math.max(1, a.max - a.qte); });
    el.innerHTML =
      '<div class="alert tone-blue" style="margin-bottom:14px">' + E.icon('info') + '<div>Proposition calculée automatiquement : quantité = <b>stock maxi − stock actuel</b> pour les articles au seuil mini ou en dessous (les articles à moins de 15 % au-dessus du seuil sont signalés « à surveiller »). Ajustez les quantités puis générez la demande d\'achat.</div></div>' +
      '<div class="card"><div class="card__h"><h3>Proposition de réapprovisionnement</h3><span class="sub">' + list.length + ' article(s)</span><span class="spacer"></span><b id="ra-total" class="ops-num"></b><button class="btn primary" id="ra-go">' + E.icon('cart') + 'Créer une demande d\'achat</button></div>' +
      U.table([
        { key: 'sel', label: 'Choix', render: function (a) { return '<input type="checkbox" data-sel="' + a.id + '"' + (sel[a.id] ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--navy)">'; } },
        { key: 'designation', label: 'Article', render: function (a) { return '<b>' + esc(a.designation) + '</b>' + (a.critique ? ' <span class="badge tone-red plain">Critique</span>' : '') + '<div class="small muted mono">' + esc(a.id) + ' · ' + esc(a.emplacement) + '</div>'; } },
        { key: 'qte', label: 'Stock / mini', num: 1, render: function (a) { return '<b class="' + (a.qte <= a.min ? 'ops-neg' : '') + '">' + F.num(a.qte) + '</b> / ' + F.num(a.min) + ' <span class="small muted">' + esc(a.unite) + '</span>'; } },
        { key: 'etat', label: 'État', render: function (a) { return a.daEnCours ? U.badge(a.daEnCours + ' en cours', 'blue') : a.qte <= a.min ? U.badge(artStatut(a), ART_TONE[artStatut(a)]) : U.badge('À surveiller', 'yellow'); } },
        { key: 'prop', label: 'Qté à commander', num: 1, render: function (a) { return '<input class="input" type="number" min="1" data-q="' + a.id + '" value="' + qty[a.id] + '" style="width:92px;text-align:right;padding:6px 8px">'; } },
        { key: 'fourn', label: 'Fournisseur', render: function (a) { var f = S.get('fournisseurs', a.fournisseurId) || {}; return esc(f.nom || '—') + '<div class="small muted">délai ' + (f.delai || '—') + ' j</div>'; } },
        { key: 'montant', label: 'Montant estimé', num: 1, render: function (a) { return '<span data-m="' + a.id + '">' + F.money(qty[a.id] * a.pu) + '</span>'; } }
      ], list, { empty: 'Aucun article à réapprovisionner — tous les stocks sont au-dessus des seuils.' }) + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Demandes d\'achat issues du magasin</h3></div><div class="card__b" id="ra-da"></div></div>';
    function total() {
      var t = 0, n = 0; list.forEach(function (a) { if (sel[a.id]) { t += qty[a.id] * a.pu; n++; } });
      el.querySelector('#ra-total').textContent = n + ' ligne(s) · ' + F.money(t); return { t: t, n: n };
    }
    el.addEventListener('change', function (e) {
      var c = e.target.closest('[data-sel]'); if (c) { sel[c.dataset.sel] = c.checked; total(); }
      var q = e.target.closest('[data-q]'); if (q) { var a = S.get('articles', q.dataset.q); qty[a.id] = Math.max(1, +q.value || 1); q.value = qty[a.id]; el.querySelector('[data-m="' + a.id + '"]').textContent = F.money(qty[a.id] * a.pu); total(); }
    });
    total();
    var das = S.has('da') ? S.all('da').filter(function (d) { return d.origine === 'Magasin' || /réapprovisionnement magasin/i.test(d.objet || ''); }) : [];
    el.querySelector('#ra-da').innerHTML = !S.has('da') ? '<div class="ops-note">Le module <b>Achats</b> n\'est pas activé sur cette démonstration : la proposition sera exportée en CSV.</div>' :
      das.length ? '<div class="list">' + das.map(function (d) { return '<a class="list__item" href="#/achats/da/' + esc(d.id) + '" style="color:inherit"><div class="list__icon tone-orange">' + E.icon('cart') + '</div><div class="list__body"><b>' + esc(d.id) + ' · ' + esc(d.objet) + '</b><div class="small muted">' + F.date(d.date) + ' · ' + (d.lignes || []).length + ' ligne(s) · ' + F.money(d.montant) + '</div></div>' + U.badge(d.statut) + '</a>'; }).join('') + '</div>' : '<div class="small muted">Aucune demande d\'achat générée depuis le magasin pour l\'instant.</div>';
    el.querySelector('#ra-go').onclick = function () {
      var lines = list.filter(function (a) { return sel[a.id]; }); if (!lines.length) { U.toast('Sélectionnez au moins un article.', 'err'); return; }
      var lignes = lines.map(function (a) { return { articleId: a.id, designation: a.designation, qte: qty[a.id], unite: a.unite, pu: a.pu, montant: qty[a.id] * a.pu, fournisseurId: a.fournisseurId }; });
      var montant = sum(lignes, 'montant');
      if (!S.has('da')) {
        U.exportCSV('proposition-reappro-' + E.today(), [{ key: 'articleId', label: 'Référence' }, { key: 'designation', label: 'Désignation' }, { key: 'qte', label: 'Quantité' }, { key: 'unite', label: 'Unité' }, { key: 'pu', label: 'PU' }, { key: 'montant', label: 'Montant' }, { key: 'fournisseurId', label: 'Fournisseur' }], lignes);
        return;
      }
      U.confirm('Créer une demande d\'achat', 'Générer une demande d\'achat brouillon de <b>' + lignes.length + ' ligne(s)</b> pour <b>' + F.money(montant) + '</b> ?', 'Créer la DA', function () {
        var u = E.session.user(), crit = lines.some(function (a) { return a.critique; });
        var da = { id: S.next('DA'), objet: 'Réapprovisionnement magasin — ' + lignes.length + ' article(s) sous seuil', lignes: lignes, montant: montant, statut: 'Brouillon', date: E.today(), demandeur: empIdByName('Mengue') || (u ? u.name : ''), direction: 'ACH', origine: 'Magasin', urgence: crit ? 'Haute' : 'Normale', fournisseurId: lignes[0].fournisseurId };
        S.all('da').unshift(da); S.save();
        lines.forEach(function (a) { S.update('articles', a.id, { daEnCours: da.id }); });
        E.log('Demande d\'achat ' + da.id + ' créée depuis le magasin', lignes.length + ' ligne(s) · ' + F.money(montant), 'stocks');
        E.notify('Nouvelle demande d\'achat ' + da.id, 'Réapprovisionnement magasin · ' + F.short(montant) + ' FCFA', '#/achats/da/' + da.id, 'orange');
        U.toast('Demande d\'achat ' + da.id + ' créée (brouillon)');
        E.rerender();
      });
    };
  }

  /* ---------- Inventaire tournant ---------- */
  function vInventaire(el) {
    var inv = S.all('inventaires').slice().sort(function (a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); });
    var pend = {}; invAValider().forEach(function (i) { pend[i.articleId] = 1; });
    var todo = articles().filter(function (a) { return !pend[a.id]; }).sort(function (a, b) {
      var sa = (a.critique ? 2 : 0) + (a.qte * a.pu > 5e6 ? 1 : 0), sb = (b.critique ? 2 : 0) + (b.qte * b.pu > 5e6 ? 1 : 0);
      return (a.dernierInventaire || '').localeCompare(b.dernierInventaire || '') - (sb - sa) * 0.001;
    }).slice(0, 6);
    var from90 = E.addDays(E.today(), -90), l90 = inv.filter(function (i) { return i.date >= from90 && i.statut === 'Validé'; });
    var fiab = l90.length ? l90.filter(function (i) { return i.ecart === 0; }).length / l90.length * 100 : 100;
    var d = E.parseDate(E.today()), wk = (function () { var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); var day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); })();
    el.innerHTML =
      '<div class="grid g4" style="margin-bottom:16px">' +
        U.kpi({ label: 'Comptages (90 j)', value: inv.filter(function (i) { return i.date >= from90; }).length, icon: 'list', tone: 'blue', foot: 'objectif : 100 % des références / an' }) +
        U.kpi({ label: 'Fiabilité du stock', value: F.num(fiab, 0), unit: '%', icon: 'target', tone: fiab >= 95 ? 'green' : 'orange', foot: 'comptages sans écart' }) +
        U.kpi({ label: 'Valeur des écarts', value: F.short(sum(l90, 'valeurEcart')), unit: 'FCFA', icon: 'money', tone: 'orange', foot: 'écarts validés, 90 j' }) +
        U.kpi({ label: 'Écarts à valider', value: invAValider().length, icon: 'check', tone: invAValider().length ? 'violet' : 'green', foot: 'visa chef de service' }) +
      '</div>' +
      '<div class="grid g-1-2">' +
        '<div class="card"><div class="card__h"><h3>Campagne — semaine ' + wk + '</h3><span class="sub">références jamais ou anciennement comptées</span></div><div class="list">' +
          todo.map(function (a) { return '<div class="list__item"><div class="list__icon ' + (a.critique ? 'tone-red' : 'tone-blue') + '">' + E.icon('box') + '</div><div class="list__body"><b>' + esc(a.designation) + '</b><div class="small muted"><span class="mono">' + esc(a.emplacement) + '</span> · dernier comptage ' + F.date(a.dernierInventaire) + '</div></div><button class="btn sm" data-count="' + a.id + '">Compter</button></div>'; }).join('') + '</div></div>' +
        '<div class="card"><div class="card__h"><h3>Comptages & écarts</h3><span class="spacer"></span><button class="btn sm" id="inv-new">' + E.icon('plus') + 'Autre article</button></div>' +
        U.table([
          { key: 'date', label: 'Date', render: function (i) { return F.dateShort(i.date); } },
          { key: 'article', label: 'Article', render: function (i) { var a = S.get('articles', i.articleId) || {}; return '<b>' + esc(a.designation || i.articleId) + '</b><div class="small muted mono">' + esc(i.id) + ' · ' + esc(i.articleId) + '</div>'; } },
          { key: 'theorique', label: 'Théorique', num: 1 },
          { key: 'reel', label: 'Compté', num: 1 },
          { key: 'ecart', label: 'Écart', num: 1, render: function (i) { return '<b class="' + (i.ecart < 0 ? 'ops-neg' : i.ecart > 0 ? 'ops-pos' : '') + '">' + signed(i.ecart) + '</b><div class="small muted">' + (i.valeurEcart ? F.short(i.valeurEcart) + ' FCFA' : '') + '</div>'; } },
          { key: 'statut', label: 'Statut', render: function (i) { return i.statut === 'À valider' ? '<button class="btn sm success" data-val="' + i.id + '">' + E.icon('check') + 'Valider</button> <button class="btn sm danger" data-rec="' + i.id + '">Recompter</button>' : U.badge(i.statut, 'green'); } }
        ], inv) + '</div>' +
      '</div>';
    E.$$('[data-count]', el).forEach(function (b) { b.onclick = function () { countForm(b.dataset.count); }; });
    el.querySelector('#inv-new').onclick = function () { countForm(); };
    E.$$('[data-val]', el).forEach(function (b) { b.onclick = function () { validateInv(b.dataset.val); }; });
    E.$$('[data-rec]', el).forEach(function (b) { b.onclick = function () { var i = S.get('inventaires', b.dataset.rec); S.remove('inventaires', i.id); E.log('Recomptage demandé', i.articleId, 'stocks'); U.toast('Comptage annulé — article remis dans la campagne'); countForm(i.articleId); }; });
  }
  function countForm(id) {
    var m = U.formModal({ title: 'Comptage d\'inventaire', sub: 'Comptage physique en magasin — l\'écart est soumis à validation', okLabel: 'Enregistrer le comptage',
      intro: '<div class="ops-note" id="ct-info" style="margin-bottom:14px"></div>',
      fields: [
        { name: 'article', label: 'Article', type: 'select', options: artOpts(), required: true, full: true },
        { name: 'reel', label: 'Quantité comptée', type: 'number', required: true, min: 0 },
        { name: 'compteur', label: 'Compteur', type: 'select', options: empOpts(), required: true, value: empIdByName('Mengue') }
      ], values: { article: id },
      onSubmit: function (v) {
        var a = S.get('articles', v.article), reel = +v.reel, ec = reel - a.qte;
        var o = { id: 'INV-' + String(Math.max.apply(null, S.all('inventaires').map(function (x) { return +String(x.id).replace(/\D/g, '') || 0; }).concat([0])) + 1).padStart(4, '0'), date: E.today(), articleId: a.id, theorique: a.qte, reel: reel, ecart: ec, valeurEcart: ec * a.pu, compteur: v.compteur, statut: ec === 0 ? 'Validé' : 'À valider' };
        S.all('inventaires').unshift(o); S.update('articles', a.id, { dernierInventaire: E.today() });
        E.log('Comptage ' + o.id, a.designation + ' : ' + reel + ' (écart ' + signed(ec) + ')', 'stocks');
        if (ec !== 0) E.notify('Écart d\'inventaire à valider', a.designation + ' : ' + signed(ec) + ' ' + a.unite + ' (' + F.short(ec * a.pu) + ' FCFA)', '#/stocks/inventaire', 'violet');
        U.toast(ec === 0 ? 'Comptage conforme — aucun écart' : 'Écart de ' + signed(ec) + ' ' + a.unite + ' soumis à validation');
        E.rerender();
      } });
    var sel = m.el.querySelector('#f_article');
    function info() { var a = S.get('articles', sel.value); m.el.querySelector('#ct-info').innerHTML = '<b>' + esc(a.designation) + '</b><br>Emplacement <span class="mono">' + esc(a.emplacement) + '</span> · unité : ' + esc(a.unite) + ' · <span class="muted">stock théorique masqué pendant le comptage (comptage « à l\'aveugle »)</span>'; }
    sel.onchange = info; info();
  }
  function validateInv(id) {
    var i = S.get('inventaires', id), a = S.get('articles', i.articleId);
    U.confirm('Valider l\'écart d\'inventaire', 'Ajuster le stock de <b>' + esc(a.designation) + '</b> de ' + signed(i.ecart) + ' ' + esc(a.unite) + ' (' + F.money(i.ecart * a.pu) + ') ?', 'Valider l\'écart', function () {
      S.update('inventaires', id, { statut: 'Validé', theorique: a.qte, reel: a.qte + i.ecart, valeurEcart: i.ecart * a.pu });
      S.update('articles', a.id, { qte: Math.max(0, a.qte + i.ecart) });
      addMvtS({ type: 'Inventaire', articleId: a.id, qte: i.ecart, pu: a.pu, ref: id, demandeur: i.compteur, commentaire: 'Écart d\'inventaire tournant validé' });
      E.log('Écart d\'inventaire validé ' + id, a.designation + ' ' + signed(i.ecart), 'stocks');
      U.toast('Écart validé — stock ajusté'); E.rerender();
    }, 'success');
  }

  /* ------------------------------------------------------------------ enregistrement */
  E.register({
    id: 'stocks', label: 'Stocks & bacs', title: 'Stocks produits & magasin', icon: 'tank', group: 'Opérations', roles: ['achats', 'projets'],
    seed: seed,
    render: render,
    summary: function () {
      var worst = PRODUITS.map(function (p) { var s = prodStats(p.k); return { p: p, d: s.days, lbl: s.lbl }; }).filter(function (x) { return x.d != null; }).sort(function (a, b) { return a.d - b.d; })[0];
      var ss = sousSeuil();
      return [
        { label: 'Autonomie la plus courte', value: F.num(worst.d, 1) + ' j', icon: 'tank', tone: daysTone(worst.d), foot: worst.p.l + ' — ' + worst.lbl, href: '#/stocks' },
        { label: 'Articles sous seuil mini', value: String(ss.length), icon: 'box', tone: ss.length ? 'orange' : 'green', foot: 'Magasin : ' + F.short(valeurStock()) + ' FCFA en stock', href: '#/stocks/reappro' }
      ];
    },
    pending: function () {
      var out = [];
      invAValider().forEach(function (i) { var a = S.get('articles', i.articleId) || {}; out.push({ title: 'Écart d\'inventaire ' + i.id + ' · ' + (a.designation || i.articleId), sub: signed(i.ecart) + ' ' + (a.unite || '') + ' · ' + F.money(i.valeurEcart), date: i.date, href: '#/stocks/inventaire', tone: 'violet' }); });
      sousSeuil().filter(function (a) { return a.critique && !a.daEnCours; }).forEach(function (a) { out.push({ title: 'Réapprovisionner · ' + a.designation, sub: 'Article critique : ' + F.num(a.qte) + ' ' + a.unite + ' pour un mini de ' + a.min, date: E.today(), href: '#/stocks/reappro', tone: 'red' }); });
      return out;
    },
    search: function (q) {
      var r = [];
      bacs().forEach(function (b) { if (E.norm(b.id + ' bac ' + P(b.produit).l + ' ' + b.statut).indexOf(q) >= 0) r.push({ title: 'Bac ' + b.id + ' · ' + P(b.produit).l, sub: F.num(b.volume) + ' m³ · ' + b.statut, href: '#/stocks/bacs/' + b.id }); });
      articles().forEach(function (a) { if (E.norm(a.id + ' ' + a.designation + ' ' + a.categorie).indexOf(q) >= 0) r.push({ title: a.designation, sub: a.id + ' · stock ' + F.num(a.qte) + ' ' + a.unite, href: '#/stocks/magasin/' + a.id }); });
      return r;
    },
    badge: function () { return sousSeuil().filter(function (a) { return !a.daEnCours; }).length + invAValider().length; }
  });
})();
