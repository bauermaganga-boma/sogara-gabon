/* SOGARA · Espace de gestion — module Achats & approvisionnements.
   Chaîne complète « procure-to-pay » : demande d'achat → circuit de validation selon le montant →
   consultation des fournisseurs et comparatif des offres → bon de commande → réception (entrée en stock)
   → facture fournisseur avec rapprochement à 3 voies → bon à payer → paiement.
   Collections : da, consultations, bc, facturesFournisseurs, evalFournisseurs, achatsHisto. */
(function () {
  'use strict';
  var E = window.ERP; if (!E) return;
  if (!document.getElementById('fin-css')) { var lk = document.createElement('link'); lk.id = 'fin-css'; lk.rel = 'stylesheet'; lk.href = 'css/finance.css'; document.head.appendChild(lk); }

  var S = E.store, U = E.ui, F = E.fmt, esc = E.esc, ic = E.icon;
  var TVA = 0.18, Y = E.TODAY.getFullYear();
  var MOD = 'achats';

  /* ------------------------------------------------------------------ référentiels internes */
  var CATS = ['Mécanique & chaudronnerie', 'Instrumentation', 'Vannes & robinetterie', 'Électricité', 'Catalyseurs & chimie', 'Sécurité & EPI', 'Prestations & levage', 'Études & services', 'Laboratoire', 'Fournitures & informatique'];
  var CAT_F = { 'Mécanique & chaudronnerie': ['F-001', 'F-008', 'F-003'], 'Instrumentation': ['F-002', 'F-004', 'F-003'], 'Vannes & robinetterie': ['F-003', 'F-001', 'F-002'], 'Électricité': ['F-004', 'F-001'], 'Catalyseurs & chimie': ['F-005', 'F-010'], 'Sécurité & EPI': ['F-007', 'F-002', 'F-009'], 'Prestations & levage': ['F-008', 'F-006', 'F-001'], 'Études & services': ['F-001', 'F-008', 'F-002'], 'Laboratoire': ['F-010', 'F-005'], 'Fournitures & informatique': ['F-009', 'F-004'] };
  var URG = ['Normale', 'Urgente', 'Critique'];
  var CONDS = ['30 jours fin de mois', '45 jours date de facture', '60 jours date de facture', 'Acompte 30 % à la commande, solde à 30 jours', 'Paiement à réception'];
  var STEP = {
    chef: { label: 'Chef de service', who: 'Serge Ondo Mba', profil: 'achats', login: 'achats' },
    daf: { label: 'Directrice financière', who: 'Clarisse Nzé', profil: 'finance', login: 'finance' },
    dg: { label: 'Direction générale', who: 'Direction générale', profil: 'admin', login: 'direction' }
  };
  var PROFILE_STEP = { achats: 'chef', finance: 'daf', admin: 'dg' };
  var TONE = {
    'Brouillon': 'grey', 'En validation': 'orange', 'Complément demandé': 'yellow', 'Validée': 'green', 'Refusée': 'red', 'En consultation': 'violet', 'Commandée': 'blue',
    'En cours': 'blue', 'Offres reçues': 'orange', 'Attribuée': 'green', 'Infructueuse': 'grey',
    'Émis': 'blue', 'Confirmé': 'violet', 'Partiellement reçu': 'orange', 'Reçu': 'green', 'Facturé': 'navy', 'Soldé': 'grey', 'Annulé': 'grey',
    'À contrôler': 'orange', 'Bon à payer': 'blue', 'Payée': 'green', 'Litige': 'red',
    'Normale': 'grey', 'Urgente': 'orange', 'Critique': 'red', 'Conforme': 'green', 'Conforme avec réserves': 'yellow', 'Non conforme': 'red'
  };
  function B(s) { return U.badge(s, TONE[s]); }
  function niveaux(m) { return m < 5e6 ? ['chef'] : m <= 50e6 ? ['chef', 'daf'] : ['chef', 'daf', 'dg']; }
  function d(n) { return E.addDays(E.today(), n); }
  function today() { return E.today(); }
  function user() { return E.session.user() || {}; }
  function prof() { return user().profile; }
  function isAdmin() { return prof() === 'admin'; }
  function canAchats() { return prof() === 'achats' || isAdmin(); }
  function canFinance() { return prof() === 'finance' || isAdmin(); }
  function fr(id) { return S.get('fournisseurs', id) || { id: id, nom: id || '—', domaine: '', ville: '', note: 0, delai: 0 }; }
  function frNom(id) { return fr(id).nom; }
  function M(n) { return F.short(n) + ' FCFA'; }
  function mkey(dt) { return String(dt).slice(0, 7); }
  function nextId(col, prefix) {
    var max = 0;
    S.all(col).forEach(function (x) { var m = /-(\d{4})$/.exec(x.id || ''); if (m && x.id.indexOf(prefix + '-') === 0) max = Math.max(max, +m[1]); });
    return prefix + '-' + Y + '-' + String((max || 100) + 1).padStart(4, '0');
  }
  function stamp() { return new Date().toISOString(); }
  function empIdByName(name) { var n = E.norm(name); var e = S.all('employes').find(function (x) { return E.norm(x.nom).indexOf(n) === 0; }); return e ? e.id : ''; }
  function myEmp() { var u = user(); if (!u.name) return ''; var toks = E.norm(u.name).split(/\s+/); var e = S.all('employes').find(function (x) { var n = E.norm(x.nom); return toks.every(function (t) { return n.indexOf(t) >= 0; }); }); return e ? e.id : ''; }
  function stars(n) { var r = Math.round(n); return '<span class="fin-stars" title="' + F.num(n, 1) + ' / 5">' + '★★★★★'.slice(0, r) + '<span>' + '★★★★★'.slice(r) + '</span></span>'; }
  function imputations() {
    var base = ['Budget de fonctionnement', 'Budget maintenance courante', 'Arrêt technique 2027 (AT-27)', 'OT-2026-0398 · Échangeur E-104', 'OT-2026-0412 · Révision pompe P-101 A', 'OT-2026-0437 · Ligne de chargement U700', 'OT-2026-0451 · Arrêt partiel U200'];
    var prj = S.has('projets') ? S.all('projets').map(function (p) { return p.id + ' · ' + (p.code || p.nom || ''); }) : ['PRJ-01 · Modernisation', 'PRJ-02 · Nouveau bac de stockage T-30', 'PRJ-04 · Transformation digitale'];
    return base.concat(prj);
  }

  /* Montant en toutes lettres (français) */
  var UN = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  var DIZ = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  function lt100(n) { if (n < 20) return UN[n]; var t = Math.floor(n / 10), u = n % 10; if (t === 7 || t === 9) return DIZ[t] + (t === 7 && u === 1 ? ' et ' : '-') + UN[10 + u]; if (u === 0) return DIZ[t] + (t === 8 ? 's' : ''); if (u === 1 && t !== 8) return DIZ[t] + ' et un'; return DIZ[t] + '-' + UN[u]; }
  function lt1000(n) { var c = Math.floor(n / 100), r = n % 100, s = ''; if (c > 1) s = UN[c] + ' cent' + (r === 0 ? 's' : ''); else if (c === 1) s = 'cent'; if (r) s += (s ? ' ' : '') + lt100(r); return s; }
  function enLettres(n) {
    n = Math.round(Math.abs(n)); if (!n) return 'Zéro';
    var p = [], md = Math.floor(n / 1e9), mi = Math.floor(n % 1e9 / 1e6), k = Math.floor(n % 1e6 / 1e3), r = n % 1000;
    if (md) p.push(lt1000(md) + ' milliard' + (md > 1 ? 's' : ''));
    if (mi) p.push(lt1000(mi) + ' million' + (mi > 1 ? 's' : ''));
    if (k) p.push(k === 1 ? 'mille' : lt1000(k).replace(/(cent|vingt)s$/, '$1') + ' mille');
    if (r) p.push(lt1000(r));
    var s = p.join(' '); return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /* ------------------------------------------------------------------ données d'exemple */
  function seed() {
    var CHEF = STEP.chef.who, DAF = STEP.daf.who, DG = STEP.dg.who;
    function V(et, off, dec, com) { return { etape: et, user: et === 'chef' ? CHEF : et === 'daf' ? DAF : DG, date: d(off) + 'T' + String(8 + (Math.abs(off) % 9)).padStart(2, '0') + ':' + String(10 + (Math.abs(off) * 7) % 49).padStart(2, '0') + ':00', decision: dec || 'Visé', commentaire: com || '' }; }
    function L(arr) { return arr.map(function (l) { var o = { designation: l[0], qte: l[1], unite: l[2], pu: l[3] }; if (l[4]) o.articleId = l[4]; return o; }); }
    var DA = [];
    function da(n, off, dem, dir, objet, cat, imp, urg, just, lignes, statut, visas, extra) {
      var o = { id: 'DA-' + Y + '-' + String(n).padStart(4, '0'), date: d(off), demandeur: empIdByName(dem), direction: dir, objet: objet, categorie: cat, imputation: imp, urgence: urg, besoin: d(off + 35), justification: just, lignes: L(lignes), statut: statut, visas: visas || [] };
      o.montant = E.sum(o.lignes, function (l) { return l.qte * l.pu; });
      Object.assign(o, extra || {}); DA.push(o); return o;
    }
    da(101, -75, 'Owono', 'MAINT', 'Remplacement du faisceau tubulaire de l\'échangeur E-104', 'Mécanique & chaudronnerie', 'OT-2026-0398 · Échangeur E-104', 'Urgente', 'Perte d\'efficacité thermique de 18 % et fuites constatées lors de l\'inspection de juin ; risque d\'arrêt de la distillation U100.',
      [['Faisceau tubulaire E-104 (412 tubes 3/4" acier carbone)', 1, 'u', 31500000], ['Jeu de joints spiralés et goujons', 1, 'lot', 2400000], ['Épreuve hydraulique et PV d\'inspection', 1, 'forfait', 1600000]], 'Commandée', [V('chef', -74, 'Visé', 'Priorité 1 du plan de maintenance.'), V('daf', -72, 'Visé', 'Imputation OT confirmée.')], { consultationId: 'CO-' + Y + '-0041', bcId: 'BC-' + Y + '-0136' });
    da(102, -70, 'Ntoutoume', 'HSE', 'Renouvellement des EPI — dotation du 4e trimestre', 'Sécurité & EPI', 'Budget de fonctionnement', 'Normale', 'Dotation réglementaire des équipes de quart et des intervenants maintenance.',
      [['Combinaisons ignifugées antistatiques', 120, 'u', 38000], ['Chaussures de sécurité S3', 120, 'paire', 22500], ['Casques de sécurité avec jugulaire', 80, 'u', 9500, 'ART-1017'], ['Gants nitrile résistants aux hydrocarbures', 600, 'paire', 1800]], 'Commandée', [V('chef', -69), V('daf', -67)], { bcId: 'BC-' + Y + '-0138' });
    da(103, -66, 'Engonga', 'MAINT', 'Transmetteurs de pression — renouvellement U200', 'Instrumentation', 'Budget maintenance courante', 'Normale', 'Obsolescence des transmetteurs analogiques ; passage au protocole HART pour la maintenance prédictive.',
      [['Transmetteur de pression 0–40 bar HART', 12, 'u', 1320000, 'ART-1009'], ['Manifold 3 voies inox', 12, 'u', 185000]], 'Commandée', [V('chef', -65), V('daf', -63)], { consultationId: 'CO-' + Y + '-0042', bcId: 'BC-' + Y + '-0139' });
    da(104, -60, 'Boussougou', 'PROD', 'Catalyseur de reformage — appoint de charge du réacteur R-301', 'Catalyseurs & chimie', 'Arrêt technique 2027 (AT-27)', 'Urgente', 'Désactivation accélérée constatée (indice d\'octane en baisse de 1,8 point). Appoint indispensable avant la campagne de production.',
      [['Catalyseur de reformage Pt-Re (fûts de 200 kg)', 24, 't', 16500000, 'ART-1022'], ['Billes céramiques de support', 3, 't', 1450000]], 'Commandée', [V('chef', -59), V('daf', -57, 'Visé', 'Montant inscrit au budget AT-27.'), V('dg', -55, 'Visé', 'Accord — impératif pour la campagne de production.')], { consultationId: 'CO-' + Y + '-0043', bcId: 'BC-' + Y + '-0140' });
    da(105, -55, 'Mayila', 'LABO', 'Consommables de laboratoire — analyses ASTM', 'Laboratoire', 'Budget de fonctionnement', 'Normale', 'Réapprovisionnement trimestriel pour les analyses de conformité des produits.',
      [['Réactifs et étalons de référence', 1, 'lot', 1850000], ['Verrerie graduée classe A', 1, 'lot', 640000], ['Filtres et cartouches de filtration', 40, 'u', 21000]], 'Commandée', [V('chef', -54)], { bcId: 'BC-' + Y + '-0141' });
    da(106, -48, 'Mbina', 'MAINT', 'Vannes papillon DN300 — ligne de chargement de l\'appontement', 'Vannes & robinetterie', 'OT-2026-0437 · Ligne de chargement U700', 'Urgente', 'Défaut d\'étanchéité de deux vannes de sectionnement ; exigence de la revue de sécurité du poste de chargement.',
      [['Vanne papillon triple excentrée DN300 PN40', 6, 'u', 9200000], ['Actionneur pneumatique double effet', 6, 'u', 1650000]], 'Commandée', [V('chef', -47), V('daf', -45), V('dg', -44, 'Visé', 'Accord. Suivre le délai de près.')], { consultationId: 'CO-' + Y + '-0044', bcId: 'BC-' + Y + '-0143' });
    da(107, -40, 'Lendoye', 'MAINT', 'Câbles et coffrets électriques — utilités U800', 'Électricité', 'Budget maintenance courante', 'Normale', 'Remplacement des liaisons endommagées après l\'inspection thermographique.',
      [['Câble armé 3x95 mm² (touret)', 800, 'm', 11500], ['Coffret de distribution ATEX', 4, 'u', 890000], ['Presse-étoupes ATEX', 2, 'lot', 310000]], 'Commandée', [V('chef', -39), V('daf', -37)], { consultationId: 'CO-' + Y + '-0045', bcId: 'BC-' + Y + '-0144' });
    da(108, -33, 'Mouketou', 'SI', 'Postes de travail et onduleurs — salle de contrôle', 'Fournitures & informatique', 'Budget de fonctionnement', 'Normale', 'Renouvellement des postes opérateurs (fin de garantie) — achat sur marché cadre informatique.',
      [['Poste de travail industriel double écran', 8, 'u', 890000], ['Onduleur 3 kVA', 4, 'u', 520000]], 'Commandée', [V('chef', -32), V('daf', -30)], { bcId: 'BC-' + Y + '-0146' });
    da(109, -26, 'Ntoutoume', 'HSE', 'Détecteurs de gaz portatifs 4 gaz', 'Sécurité & EPI', 'Budget de fonctionnement', 'Urgente', 'Parc actuel en fin de vie (capteurs H2S hors tolérance) ; obligation du plan de prévention des espaces confinés.',
      [['Détecteur portatif 4 gaz (LIE, O2, H2S, CO)', 20, 'u', 365000, 'ART-1021'], ['Station de calibrage automatique', 1, 'u', 1250000]], 'En consultation', [V('chef', -25), V('daf', -23)], { consultationId: 'CO-' + Y + '-0046' });
    da(110, -20, 'Pambou', 'MAINT', 'Location d\'échafaudages — arrêt partiel U200', 'Prestations & levage', 'OT-2026-0451 · Arrêt partiel U200', 'Normale', 'Accès aux colonnes et échangeurs pendant l\'arrêt partiel programmé.',
      [['Échafaudage multidirectionnel (montage/démontage)', 1800, 'm³', 9800], ['Location mensuelle', 2, 'mois', 3100000]], 'En consultation', [V('chef', -19), V('daf', -17)], { consultationId: 'CO-' + Y + '-0047' });
    da(111, -12, 'Minko', 'PRJ', 'Études géotechniques — nouveau bac de stockage', 'Études & services', S.has('projets') && S.get('projets', 'PRJ-02') ? 'PRJ-02 · ' + (S.get('projets', 'PRJ-02').code || '') : 'PRJ-02 · Nouveau bac de stockage T-30', 'Normale', 'Préalable au dimensionnement des fondations du nouveau bac.',
      [['Sondages carottés 25 m', 6, 'u', 4200000], ['Essais pressiométriques', 12, 'u', 850000], ['Rapport géotechnique G2 AVP', 1, 'forfait', 9500000]], 'Validée', [V('chef', -11), V('daf', -8, 'Visé', 'Lancer une consultation restreinte (3 bureaux d\'études).')]);
    da(112, -6, 'Mbina', 'MAINT', 'Garnitures mécaniques pompes P-101 A/B', 'Mécanique & chaudronnerie', 'OT-2026-0412 · Révision pompe P-101 A', 'Urgente', 'Fuite de garniture sur P-101 B, pompe A en secours seul. Stock magasin insuffisant (2 unités, seuil mini atteint).',
      [['Garniture mécanique double cartouche API 682', 2, 'u', 3850000, 'ART-1001'], ['Kit de joints et bagues', 4, 'u', 185000]], 'En validation', [V('chef', -5, 'Visé', 'Conforme au plan de maintenance.')]);
    da(113, -4, 'Ekomi', 'PROD', 'Pompe doseuse d\'inhibiteur de corrosion', 'Mécanique & chaudronnerie', 'Budget maintenance courante', 'Normale', 'Remplacement de la pompe doseuse de tête de colonne C-101 (membrane percée).',
      [['Pompe doseuse à membrane 0–50 L/h', 1, 'u', 2650000], ['Mise en service', 1, 'forfait', 450000]], 'En validation', []);
    da(114, -3, 'Owono', 'MAINT', 'Campagne d\'inspection des bacs par ultrasons', 'Études & services', 'Arrêt technique 2027 (AT-27)', 'Normale', 'Inspection réglementaire API 653 de 8 bacs avant l\'arrêt technique ; conditionne le plan de rénovation.',
      [['Inspection des fonds de bacs (MFL)', 8, 'bac', 9800000], ['Contrôle d\'épaisseur des robes', 8, 'bac', 1650000], ['Rapport API 653 et recommandations', 1, 'forfait', 2900000]], 'En validation', [V('chef', -3), V('daf', -1, 'Visé', 'Budget AT-27 disponible.')]);
    da(115, -2, 'Ibinga', 'LABO', 'Pièces pour chromatographe en phase gazeuse', 'Laboratoire', 'Budget maintenance courante', 'Normale', 'Panne du détecteur FID — analyses PONA sous-traitées en attendant.',
      [['Colonne capillaire PONA 100 m', 2, 'u', 1450000], ['Détecteur FID (module)', 1, 'u', 6800000], ['Kit de maintenance injecteur', 3, 'u', 420000]], 'Complément demandé', [V('chef', -1, 'Complément', 'Merci de joindre le devis constructeur et de préciser la référence exacte du chromatographe.')]);
    da(116, -9, 'Oyane', 'DG', 'Renouvellement du mobilier des bureaux de direction', 'Fournitures & informatique', 'Budget de fonctionnement', 'Normale', 'Mobilier vétuste.',
      [['Bureau de direction', 6, 'u', 650000], ['Fauteuil ergonomique', 10, 'u', 235000]], 'Refusée', [V('chef', -8), V('daf', -7, 'Refusé', 'Dépense non prioritaire — à reporter au budget 2027.')]);
    da(117, -1, 'Mapangou', 'MAINT', 'Roulements et accouplements — stock de sécurité', 'Mécanique & chaudronnerie', 'Budget maintenance courante', 'Normale', 'Article ART-1003 sous le seuil minimum (4 pour un mini de 6).',
      [['Roulement à rouleaux coniques 32216', 10, 'u', 98000, 'ART-1003'], ['Accouplement élastique à mâchoires', 6, 'u', 165000], ['Graisse EP2 au lithium (seau 18 kg)', 8, 'seau', 72000, 'ART-1026']], 'En validation', []);

    /* consultations */
    function dv(f, off, ref, montant, delai, conf, cond, com) { return { fournisseur: f, date: d(off), ref: ref, montant: montant, delai: delai, conformite: conf, conditions: cond || CONDS[0], validite: d(off + 60), commentaire: com || '' }; }
    var CO = [
      { id: 'CO-' + Y + '-0041', daId: 'DA-' + Y + '-0101', date: d(-71), limite: d(-64), mode: 'Consultation restreinte', fournisseurs: ['F-001', 'F-008', 'F-003'], statut: 'Attribuée', attributaire: 'F-001', dateAttribution: d(-60), bcId: 'BC-' + Y + '-0136',
        devis: [dv('F-001', -66, 'EIS-DV-26-0412', 33900000, 30, 'Conforme'), dv('F-008', -65, 'DS-OFF-1187', 36800000, 45, 'Conforme avec réserves', CONDS[1], 'Sous-traitance de la fabrication des tubes.'), dv('F-003', -64, 'AVE-Q-77310', 41200000, 60, 'Conforme', CONDS[3])] },
      { id: 'CO-' + Y + '-0042', daId: 'DA-' + Y + '-0103', date: d(-62), limite: d(-57), mode: 'Consultation restreinte', fournisseurs: ['F-002', 'F-004', 'F-003'], statut: 'Attribuée', attributaire: 'F-002', dateAttribution: d(-58), bcId: 'BC-' + Y + '-0139',
        devis: [dv('F-002', -60, 'OI-2026-588', 17100000, 28, 'Conforme'), dv('F-004', -59, 'GET-DV-0931', 16400000, 45, 'Non conforme', CONDS[0], 'Certification ATEX non fournie.'), dv('F-003', -58, 'AVE-Q-77402', 19800000, 50, 'Conforme', CONDS[3])] },
      { id: 'CO-' + Y + '-0043', daId: 'DA-' + Y + '-0104', date: d(-54), limite: d(-53), mode: 'Appel d\'offres restreint', fournisseurs: ['F-005', 'F-010'], statut: 'Attribuée', attributaire: 'F-005', dateAttribution: d(-52), bcId: 'BC-' + Y + '-0140',
        devis: [dv('F-005', -54, 'CCI-26-QT-2291', 388000000, 70, 'Conforme', CONDS[3]), dv('F-010', -53, 'LEA-Q-1102', 352000000, 90, 'Non conforme', CONDS[0], 'Produit non homologué par le licencieur du procédé.')] },
      { id: 'CO-' + Y + '-0044', daId: 'DA-' + Y + '-0106', date: d(-43), limite: d(-39), mode: 'Appel d\'offres restreint', fournisseurs: ['F-003', 'F-001', 'F-002'], statut: 'Attribuée', attributaire: 'F-003', dateAttribution: d(-38), bcId: 'BC-' + Y + '-0143',
        devis: [dv('F-003', -41, 'AVE-Q-78015', 61500000, 35, 'Conforme', CONDS[1]), dv('F-001', -40, 'EIS-DV-26-0477', 58900000, 60, 'Conforme avec réserves', CONDS[0], 'Actionneurs d\'une marque non standardisée sur le site.'), dv('F-002', -39, 'OI-2026-612', 66000000, 40, 'Conforme')] },
      { id: 'CO-' + Y + '-0045', daId: 'DA-' + Y + '-0107', date: d(-36), limite: d(-30), mode: 'Consultation restreinte', fournisseurs: ['F-004', 'F-001'], statut: 'Attribuée', attributaire: 'F-004', dateAttribution: d(-17), bcId: 'BC-' + Y + '-0144',
        devis: [dv('F-004', -33, 'GET-DV-0988', 12400000, 15, 'Conforme'), dv('F-001', -31, 'EIS-DV-26-0502', 13900000, 20, 'Conforme')] },
      { id: 'CO-' + Y + '-0046', daId: 'DA-' + Y + '-0109', date: d(-22), limite: d(-8), mode: 'Consultation restreinte', fournisseurs: ['F-007', 'F-002', 'F-009'], statut: 'Offres reçues',
        devis: [dv('F-007', -15, 'SPG-OFF-26-341', 7950000, 10, 'Conforme'), dv('F-002', -12, 'OI-2026-655', 8400000, 21, 'Conforme'), dv('F-009', -10, 'BO-DV-2210', 7100000, 30, 'Non conforme', CONDS[0], 'Appareils sans certification ATEX zone 1.')] },
      { id: 'CO-' + Y + '-0047', daId: 'DA-' + Y + '-0110', date: d(-16), limite: d(2), mode: 'Consultation restreinte', fournisseurs: ['F-008', 'F-001', 'F-006'], statut: 'En cours',
        devis: [dv('F-008', -9, 'DS-OFF-1262', 22900000, 7, 'Conforme'), dv('F-001', -7, 'EIS-DV-26-0561', 24600000, 10, 'Conforme avec réserves', CONDS[0], 'Disponibilité des monteurs à confirmer.')] }
    ];
    CO.forEach(function (c) { var o = DA.find(function (x) { return x.id === c.daId; }); c.objet = o.objet; c.estimation = o.montant; c.categorie = o.categorie; });

    /* bons de commande */
    function scaleLines(daId, montant) { var o = DA.find(function (x) { return x.id === daId; }), r = montant / o.montant; return o.lignes.map(function (l) { return Object.assign({}, l, { pu: Math.round(l.pu * r / 100) * 100 }); }); }
    var BC = [];
    function bc(n, f, off, liv, objet, cat, imp, lignes, statut, extra) {
      var o = { id: 'BC-' + Y + '-' + String(n).padStart(4, '0'), date: d(off), fournisseur: f, objet: objet, categorie: cat, imputation: imp, lignes: lignes.map(function (l) { return Object.assign({ recu: 0 }, l); }), livraisonPrevue: d(liv), conditions: CONDS[0], lieu: 'Magasin central SOGARA — Route du Dahu, Port-Gentil', acheteur: empIdByName('Essono'), statut: statut, receptions: [], historique: [{ date: d(off), statut: 'Émis' }] };
      Object.assign(o, extra || {}); BC.push(o); return o;
    }
    function rec(o, off, qtes, bl, com) { o.receptions.push({ id: 'RC-' + o.id.slice(-4) + '-' + (o.receptions.length + 1), date: d(off), bl: bl, par: 'Mengue Laure', conformite: com ? 'Avec réserves' : 'Conforme', commentaire: com || '', lignes: qtes.map(function (q, i) { return { i: i, qte: q }; }).filter(function (x) { return x.qte > 0; }) }); qtes.forEach(function (q, i) { o.lignes[i].recu = (o.lignes[i].recu || 0) + q; }); }
    var b;
    b = bc(136, 'F-001', -60, -30, 'Faisceau tubulaire de l\'échangeur E-104', 'Mécanique & chaudronnerie', 'OT-2026-0398 · Échangeur E-104', scaleLines('DA-' + Y + '-0101', 33900000), 'Soldé', { daId: 'DA-' + Y + '-0101', consultationId: 'CO-' + Y + '-0041' }); rec(b, -28, [1, 1, 1], 'BL-EIS-26-1452');
    b = bc(137, 'F-006', -55, -50, 'Transport et grutage de colis lourds — appel sur contrat cadre', 'Prestations & levage', 'Budget maintenance courante', L([['Grue mobile 60 t (journée)', 4, 'j', 650000], ['Semi-remorque surbaissée', 3, 'voyage', 720000]]), 'Soldé', { conditions: CONDS[2] }); rec(b, -50, [4, 3], 'PV-MT-0877');
    b = bc(138, 'F-007', -66, -52, 'EPI — dotation du 4e trimestre (marché cadre)', 'Sécurité & EPI', 'Budget de fonctionnement', DA[1].lignes.map(function (l) { return Object.assign({}, l, { pu: Math.round(l.pu * 0.97) }); }), 'Facturé', { daId: 'DA-' + Y + '-0102', conditions: CONDS[1] }); rec(b, -53, [120, 120, 80, 600], 'BL-SPG-2207');
    b = bc(139, 'F-002', -58, -30, 'Transmetteurs de pression HART — U200', 'Instrumentation', 'Budget maintenance courante', scaleLines('DA-' + Y + '-0103', 17100000), 'Partiellement reçu', { daId: 'DA-' + Y + '-0103', consultationId: 'CO-' + Y + '-0042' }); rec(b, -27, [8, 12], 'BL-OI-26-0931', 'Reliquat de 4 transmetteurs annoncé sous 3 semaines.');
    b = bc(140, 'F-005', -52, 18, 'Catalyseur de reformage Pt-Re — appoint R-301', 'Catalyseurs & chimie', 'Arrêt technique 2027 (AT-27)', scaleLines('DA-' + Y + '-0104', 388000000), 'Confirmé', { daId: 'DA-' + Y + '-0104', consultationId: 'CO-' + Y + '-0043', conditions: CONDS[3], lieu: 'Magasin catalyseurs — zone U300', historique: [{ date: d(-52), statut: 'Émis' }, { date: d(-50), statut: 'Confirmé' }] });
    b = bc(141, 'F-010', -51, -21, 'Consommables de laboratoire — analyses ASTM', 'Laboratoire', 'Budget de fonctionnement', DA[4].lignes.map(function (l) { return Object.assign({}, l); }), 'Facturé', { daId: 'DA-' + Y + '-0105' }); rec(b, -20, [1, 1, 40], 'DHL-5521873');
    b = bc(142, 'F-009', -40, -36, 'Fournitures de bureau et consommables d\'impression', 'Fournitures & informatique', 'Budget de fonctionnement', L([['Ramettes papier A4 80 g', 200, 'u', 3200], ['Cartouches de toner', 24, 'u', 48000], ['Classeurs et fournitures diverses', 1, 'lot', 420000]]), 'Soldé', { conditions: CONDS[4] }); rec(b, -36, [200, 24, 1], 'BL-BO-3310');
    b = bc(143, 'F-003', -38, -5, 'Vannes papillon DN300 et actionneurs — appontement', 'Vannes & robinetterie', 'OT-2026-0437 · Ligne de chargement U700', scaleLines('DA-' + Y + '-0106', 61500000), 'Confirmé', { daId: 'DA-' + Y + '-0106', consultationId: 'CO-' + Y + '-0044', conditions: CONDS[1], historique: [{ date: d(-38), statut: 'Émis' }, { date: d(-36), statut: 'Confirmé' }] });
    b = bc(144, 'F-004', -17, -2, 'Câbles et coffrets électriques ATEX — U800', 'Électricité', 'Budget maintenance courante', scaleLines('DA-' + Y + '-0107', 12400000), 'Émis', { daId: 'DA-' + Y + '-0107', consultationId: 'CO-' + Y + '-0045' });
    b = bc(145, 'F-008', -30, -16, 'Calorifugeage de la ligne vapeur 12 bar', 'Prestations & levage', 'OT-2026-0451 · Arrêt partiel U200', L([['Dépose/repose calorifuge laine de roche', 420, 'm', 14500], ['Tôle aluminium de finition', 420, 'm', 4800], ['Échafaudage associé', 1, 'forfait', 650000]]), 'Partiellement reçu'); rec(b, -15, [400, 420, 1], 'PV-DS-0619', '20 m restants (zone non accessible).');
    b = bc(146, 'F-009', -27, 3, 'Postes de travail et onduleurs — salle de contrôle (marché cadre)', 'Fournitures & informatique', 'Budget de fonctionnement', DA[7].lignes.map(function (l) { return Object.assign({}, l, { pu: Math.round(l.pu * 0.96) }); }), 'Confirmé', { daId: 'DA-' + Y + '-0108', historique: [{ date: d(-27), statut: 'Émis' }, { date: d(-25), statut: 'Confirmé' }] });
    b = bc(147, 'F-001', -20, -4, 'Usinage et rechargement d\'arbres de pompes', 'Mécanique & chaudronnerie', 'Budget maintenance courante', L([['Rechargement et rectification arbre de pompe P-205', 2, 'u', 1250000], ['Chemise d\'arbre inox 316L', 4, 'u', 425000]]), 'Partiellement reçu', { historique: [{ date: d(-20), statut: 'Émis' }, { date: d(-19), statut: 'Confirmé' }] }); rec(b, -6, [1, 4], 'BL-EIS-26-1588');
    b = bc(148, 'F-006', -10, 9, 'Location grue 80 t — arrêt partiel U200', 'Prestations & levage', 'OT-2026-0451 · Arrêt partiel U200', L([['Grue télescopique 80 t avec opérateur', 8, 'j', 720000], ['Amenée et repli', 1, 'forfait', 650000]]), 'Confirmé', { conditions: CONDS[2], historique: [{ date: d(-10), statut: 'Émis' }, { date: d(-9), statut: 'Confirmé' }] });
    b = bc(149, 'F-007', -6, 8, 'Cartouches filtrantes et requalification ARI', 'Sécurité & EPI', 'Budget de fonctionnement', L([['Cartouche filtrante ABEK-P3', 120, 'u', 14500], ['Gants anti-coupure niveau 5', 200, 'paire', 6500, 'ART-1019'], ['Requalification bouteille air 6 L', 12, 'u', 58000]]), 'Émis');
    b = bc(150, 'F-002', -3, 42, 'Analyseur d\'oxygène des fumées — four F-101', 'Instrumentation', 'Budget maintenance courante', L([['Analyseur O2 zircone in situ', 1, 'u', 18600000], ['Mise en service et formation', 1, 'forfait', 2300000]]), 'Émis', { conditions: CONDS[3] });
    BC.forEach(function (o) { if (!o.historique.some(function (h) { return h.statut === o.statut; }) && o.statut !== 'Émis') o.historique.push({ date: o.receptions.length ? o.receptions[o.receptions.length - 1].date : o.date, statut: o.statut }); });

    /* factures fournisseurs */
    function ff(n, bcId, ref, off, ech, statut, lignes, extra) {
      var o = BC.find(function (x) { return x.id === bcId; });
      var f = { id: 'FF-' + Y + '-' + String(n).padStart(4, '0'), bcId: bcId, fournisseur: o.fournisseur, ref: ref, date: d(off), echeance: d(ech), statut: statut, lignes: lignes || o.lignes.map(function (l, i) { return { i: i, qte: l.qte, pu: l.pu }; }), historique: [{ date: d(off), action: 'Facture reçue et enregistrée', user: 'Matsanga Irène' }] };
      Object.assign(f, extra || {}); return f;
    }
    var FF = [
      ff(284, 'BC-' + Y + '-0136', 'EIS-F-2026-0877', -27, 3, 'Payée', null, { bap: { par: STEP.daf.who, date: d(-20) }, paiement: { date: d(-5), mode: 'Virement', ref: 'VIR-BGFI-' + d(-5).replace(/-/g, '').slice(2) + '-014' } }),
      ff(285, 'BC-' + Y + '-0137', 'MT/2026/1142', -48, -18, 'Payée', null, { bap: { par: STEP.daf.who, date: d(-40) }, paiement: { date: d(-19), mode: 'Virement', ref: 'VIR-UGB-' + d(-19).replace(/-/g, '').slice(2) + '-007' } }),
      ff(286, 'BC-' + Y + '-0142', 'BO-26-3310', -34, -4, 'Payée', null, { bap: { par: STEP.daf.who, date: d(-30) }, paiement: { date: d(-6), mode: 'Chèque', ref: 'CHQ 0048213' } }),
      ff(287, 'BC-' + Y + '-0138', 'SPG-FAC-2026-771', -50, -5, 'Bon à payer', null, { bap: { par: STEP.daf.who, date: d(-40) } }),
      ff(288, 'BC-' + Y + '-0141', 'LEA/INV/26/0342', -12, 18, 'À contrôler', [{ i: 0, qte: 1, pu: 1950000 }, { i: 1, qte: 1, pu: 640000 }, { i: 2, qte: 40, pu: 21000 }]),
      ff(289, 'BC-' + Y + '-0145', 'DS-2026-0619', -8, 22, 'À contrôler', [{ i: 0, qte: 420, pu: 14500 }, { i: 1, qte: 420, pu: 4800 }, { i: 2, qte: 1, pu: 650000 }]),
      ff(290, 'BC-' + Y + '-0139', 'OI-FA-26-1187', -20, 10, 'À contrôler', null)
    ];
    var f139 = FF[6], b139 = BC.find(function (x) { return x.id === f139.bcId; }); f139.lignes = [{ i: 0, qte: 8, pu: b139.lignes[0].pu }, { i: 1, qte: 12, pu: b139.lignes[1].pu }];
    FF.forEach(function (f) { if (f.bap) f.historique.push({ date: f.bap.date, action: 'Bon à payer', user: f.bap.par }); if (f.paiement) f.historique.push({ date: f.paiement.date, action: 'Paiement ' + f.paiement.mode + ' — ' + f.paiement.ref, user: 'Matsanga Irène' }); });

    /* évaluation & conformité administrative des fournisseurs */
    var EV = [
      ['F-001', 4.6, 4.3, 4.7, 186e6, 'Aubin Nziengui', '+241 01 55 41 20', 140, 210],
      ['F-002', 4.3, 3.9, 4.4, 94e6, 'Gisèle Mavoungou', '+241 01 55 63 18', 75, 260],
      ['F-003', 4.8, 4.2, 4.6, 312e6, 'Pieter van Dijk', '+31 10 000 00 00', 190, 330],
      ['F-004', 3.8, 3.6, 3.9, 41e6, 'Rodrigue Ndong', '+241 01 44 20 87', -12, 120],
      ['F-005', 4.7, 4.4, 4.8, 865e6, 'Isabelle Morel', '+33 4 00 00 00 00', 220, 300],
      ['F-006', 4.1, 4.5, 3.9, 57e6, 'Josué Kombila', '+241 01 55 70 02', -3, 95],
      ['F-007', 4.4, 4.2, 4.9, 38e6, 'Murielle Ondo', '+241 01 44 81 30', 160, 64],
      ['F-008', 4.2, 4.0, 4.1, 73e6, 'Fernand Mabika', '+241 01 55 12 46', 45, 180],
      ['F-009', 3.7, 4.1, 3.8, 22e6, 'Christelle Moubamba', '+241 01 55 33 71', 9, 140],
      ['F-010', 4.4, 3.8, 4.5, 29e6, 'Samuel Ekane', '+237 6 00 00 00 00', 120, 25]
    ].map(function (r, i) {
      return { id: r[0], qualite: r[1], delais: r[2], hse: r[3], volumeHisto: r[4], interlocuteur: r[5], tel: r[6], nif: 'NIF ' + (204718 + i * 3371) + ' ' + 'ABCDEFGHJK'[i], rccm: 'RG/POG ' + (2008 + i) + ' B ' + (1120 + i * 57),
        commentaire: ['Partenaire historique, réactif sur les urgences.', 'Bonne expertise technique, délais parfois tendus.', 'Qualité excellente, délais d\'import maritimes.', 'Plusieurs non-conformités documentaires en 2026.', 'Fournisseur agréé par le licencieur du procédé.', 'Très réactif, flotte récente.', 'Irréprochable sur la sécurité.', 'Bonne tenue des plannings d\'arrêt.', 'Prix compétitifs, qualité variable.', 'Spécialiste laboratoire, délais douaniers.'][i],
        docs: [{ type: 'Attestation de situation fiscale', numero: 'ASF-' + Y + '-' + (4410 + i * 13), expiration: d(r[7]) }, { type: 'Attestation CNSS', numero: 'CNSS-' + (88120 + i * 211), expiration: d(r[8]) }, { type: 'Assurance responsabilité civile', numero: 'RC-' + (5520 + i * 7), expiration: d(200 + i * 11) }].concat(i === 0 || i === 2 || i === 4 ? [{ type: 'Certificat ISO 9001', numero: 'ISO-' + (31000 + i), expiration: d(420 + i * 30) }] : []) };
    });

    /* historique des engagements (mois clos avant la période détaillée) */
    var H = [], w = [[0.22, 0.12, 0.1, 0.08, 0.05, 0.09, 0.14, 0.07, 0.05, 0.08], [0.18, 0.1, 0.16, 0.12, 0.04, 0.06, 0.16, 0.09, 0.04, 0.05]];
    var vals = [214e6, 348e6, 186e6, 271e6, 1240e6, 296e6, 233e6, 318e6, 262e6];
    for (var k = 11; k >= 3; k--) {
      var dt = new Date(E.TODAY.getFullYear(), E.TODAY.getMonth() - k, 1), mt = vals[11 - k], ww = w[k % 2], cats = {};
      CATS.forEach(function (c, j) { cats[c] = Math.round(mt * ww[j]); });
      if (mt > 1e9) { cats['Catalyseurs & chimie'] += 700e6; cats['Mécanique & chaudronnerie'] -= 0; }
      H.push({ id: 'H-' + E.iso(dt).slice(0, 7), mois: E.iso(dt).slice(0, 7), montant: E.sum(Object.keys(cats), function (c) { return cats[c]; }), cats: cats, commandes: 9 + (k * 5) % 9 });
    }
    return { da: DA, consultations: CO, bc: BC, facturesFournisseurs: FF, evalFournisseurs: EV, achatsHisto: H };
  }

  /* ------------------------------------------------------------------ calculs */
  function das() { return S.all('da'); }
  function bcs() { return S.all('bc'); }
  function ffs() { return S.all('facturesFournisseurs'); }
  function cos() { return S.all('consultations'); }
  function daTotal(o) { return E.sum(o.lignes || [], function (l) { return (+l.qte || 0) * (+l.pu || 0); }); }
  function daNext(o) { var ok = (o.visas || []).filter(function (v) { return v.decision === 'Visé'; }).map(function (v) { return v.etape; }); return niveaux(o.montant).find(function (k) { return ok.indexOf(k) < 0; }) || null; }
  function canVisa(o) { if (o.statut !== 'En validation') return false; var n = daNext(o); return !!n && (PROFILE_STEP[prof()] === n || isAdmin()); }
  function bcHT(o) { return E.sum(o.lignes, function (l) { return l.qte * l.pu; }); }
  function bcRecuHT(o) { return E.sum(o.lignes, function (l) { return Math.min(l.recu || 0, l.qte) * l.pu; }); }
  function bcPct(o) { var t = bcHT(o); return t ? bcRecuHT(o) / t * 100 : 0; }
  var OPEN = ['Émis', 'Confirmé', 'Partiellement reçu'];
  function bcLate(o) { return OPEN.indexOf(o.statut) >= 0 && o.livraisonPrevue < today(); }
  function retard(o) { return E.daysBetween(o.livraisonPrevue, today()); }
  function ffHT(f) { return E.sum(f.lignes, function (l) { return l.qte * l.pu; }); }
  function ffTTC(f) { return Math.round(ffHT(f) * (1 + TVA)); }
  function ffOfBC(id) { return ffs().filter(function (f) { return f.bcId === id; }); }
  function factureQte(bcId, i, exceptId) { return E.sum(ffOfBC(bcId).filter(function (f) { return f.id !== exceptId; }), function (f) { return E.sum(f.lignes.filter(function (l) { return l.i === i; }), 'qte'); }); }
  /* rapprochement commande / réception / facture */
  function rappro(f) {
    var o = S.get('bc', f.bcId); if (!o) return { rows: [], ok: true, cmd: 0, rec: 0, fac: ffHT(f) };
    var rows = f.lignes.map(function (fl) {
      var l = o.lignes[fl.i] || { designation: '?', qte: 0, pu: 0, recu: 0 };
      var autres = factureQte(o.id, fl.i, f.id), dispo = Math.max(0, (l.recu || 0) - autres);
      return { l: l, fl: fl, autres: autres, dispo: dispo, eQ: fl.qte > dispo + 1e-9, eP: Math.abs(fl.pu - l.pu) > 0.5 };
    });
    var cmd = E.sum(rows, function (r) { return r.l.qte * r.l.pu; }), rec = E.sum(rows, function (r) { return r.dispo * r.l.pu; }), fac = ffHT(f);
    return { rows: rows, ok: rows.every(function (r) { return !r.eQ && !r.eP; }), cmd: cmd, rec: rec, fac: fac, ecart: fac - Math.min(rec, cmd) };
  }
  function recomputeBC(o) {
    if (!o || o.statut === 'Annulé') return;
    var full = o.lignes.every(function (l) { return (l.recu || 0) >= l.qte; }), any = o.lignes.some(function (l) { return (l.recu || 0) > 0; });
    var fs = ffOfBC(o.id), invoicedAll = o.lignes.every(function (l, i) { return factureQte(o.id, i) >= l.qte; });
    var s = o.statut;
    if (fs.length && full && invoicedAll && fs.every(function (f) { return f.statut === 'Payée'; })) s = 'Soldé';
    else if (fs.length && full) s = 'Facturé';
    else if (full) s = 'Reçu';
    else if (any) s = 'Partiellement reçu';
    else if (s !== 'Confirmé') s = 'Émis';
    if (s !== o.statut) { o.statut = s; (o.historique = o.historique || []).push({ date: today(), statut: s }); S.save(); }
  }
  function scores(co) {
    var ok = co.devis.filter(function (x) { return x.conformite !== 'Non conforme'; });
    var minP = Math.min.apply(null, ok.map(function (x) { return x.montant; }).concat([Infinity])), minD = Math.min.apply(null, ok.map(function (x) { return x.delai; }).concat([Infinity]));
    var list = co.devis.map(function (x) {
      var f = fr(x.fournisseur), ko = x.conformite === 'Non conforme';
      var sp = ko ? 0 : minP / x.montant * 100, sd = ko ? 0 : minD / Math.max(1, x.delai) * 100, sn = (f.note || 0) / 5 * 100;
      return { d: x, f: f, ko: ko, sp: sp, sd: sd, sn: sn, total: ko ? 0 : sp * 0.6 + sd * 0.2 + sn * 0.2 };
    }).sort(function (a, b) { return b.total - a.total; });
    list.forEach(function (x, i) { x.rang = x.ko ? null : i + 1; });
    return list;
  }
  function economie(co) { if (co.statut !== 'Attribuée') return 0; var dv = co.devis.find(function (x) { return x.fournisseur === co.attributaire; }); return dv ? Math.max(0, co.estimation - dv.montant) : 0; }
  function evalOf(id) { return S.get('evalFournisseurs', id) || { id: id, qualite: fr(id).note || 4, delais: fr(id).note || 4, hse: fr(id).note || 4, volumeHisto: 0, docs: [] }; }
  function evalScore(e) { return (e.qualite + e.delais + e.hse) / 3; }
  function docStatus(dc) { var j = E.daysBetween(today(), dc.expiration); return j < 0 ? { l: 'Expiré', t: 'red', j: j } : j <= 30 ? { l: 'Expire dans ' + j + ' j', t: 'orange', j: j } : { l: 'Valide', t: 'green', j: j }; }
  function frDocAlert(id) { var e = evalOf(id); return (e.docs || []).filter(function (dc) { return docStatus(dc).j <= 30; }); }
  function volume(id) { return evalOf(id).volumeHisto + E.sum(bcs().filter(function (o) { return o.fournisseur === id && o.statut !== 'Annulé'; }), bcHT); }
  function months12() { var out = []; for (var k = 11; k >= 0; k--) { var dt = new Date(E.TODAY.getFullYear(), E.TODAY.getMonth() - k, 1); out.push({ key: E.iso(dt).slice(0, 7), label: E.MOIS[dt.getMonth()] + (dt.getMonth() === 0 || k === 11 ? ' ' + String(dt.getFullYear()).slice(2) : '') }); } return out; }
  function engagementsByMonth() {
    var H = {}; S.all('achatsHisto').forEach(function (h) { H[h.mois] = h; });
    return months12().map(function (m) { var v = H[m.key] ? H[m.key].montant : E.sum(bcs().filter(function (o) { return o.statut !== 'Annulé' && mkey(o.date) === m.key; }), bcHT); return { label: m.label, key: m.key, v: v }; });
  }
  function delaiMoyen() { var l = das().filter(function (o) { return o.bcId && S.get('bc', o.bcId); }); if (!l.length) return 0; return E.sum(l, function (o) { return E.daysBetween(o.date, S.get('bc', o.bcId).date); }) / l.length; }

  /* ------------------------------------------------------------------ pièces imprimables */
  function docHead(title, num, date, extra) {
    return '<div class="doc__head"><div class="fin-doc-brand"><img src="../assets/img/logo.png" alt="SOGARA"><div><b>SOGARA</b><span>Société Gabonaise de Raffinage</span><span>Route du Dahu · B.P. 530 · Port-Gentil, Gabon</span><span>Service Achats & Logistique</span></div></div>' +
      '<div class="fin-doc-title"><h4>' + esc(title) + '</h4><div>N° <b>' + esc(num) + '</b></div><div>Date : ' + F.date(date) + '</div>' + (extra || '') + '</div></div>';
  }
  function printModal(m) {
    document.body.classList.add('fin-printing'); m.el.classList.add('fin-print-target');
    try { window.print(); } finally { setTimeout(function () { document.body.classList.remove('fin-printing'); m.el.classList.remove('fin-print-target'); }, 300); }
  }
  function bcDocHTML(o) {
    var f = fr(o.fournisseur), e = evalOf(o.fournisseur), ht = bcHT(o), tva = Math.round(ht * TVA), ttc = ht + tva, niv = niveaux(ht);
    return '<div class="doc fin-doc">' + docHead('BON DE COMMANDE', o.id, o.date, '<div>Réf. : ' + esc(o.daId || 'Commande directe') + (o.consultationId ? ' · ' + esc(o.consultationId) : '') + '</div>') +
      '<div class="fin-doc-parties"><div><small>Fournisseur</small><b>' + esc(f.nom) + '</b><br>' + esc(f.domaine) + '<br>' + esc(f.ville) + '<br>' + esc(e.nif || '') + '<br>' + esc(f.contact || '') + '</div>' +
      '<div><small>Livraison & facturation</small>' + esc(o.lieu) + '<br>Livraison prévue : <b>' + F.date(o.livraisonPrevue) + '</b><br>Imputation : ' + esc(o.imputation || '—') + '<br>Acheteur : ' + esc(E.empName(o.acheteur)) + '</div></div>' +
      '<div class="tbl-wrap"><table class="fin-doc-tbl"><thead><tr><th>#</th><th>Désignation</th><th class="num">Qté</th><th>Unité</th><th class="num">PU HT</th><th class="num">Montant HT</th></tr></thead><tbody>' +
      o.lignes.map(function (l, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(l.designation) + (l.articleId ? ' <span class="muted small">(' + esc(l.articleId) + ')</span>' : '') + '</td><td class="num">' + F.num(l.qte) + '</td><td>' + esc(l.unite) + '</td><td class="num">' + F.num(l.pu) + '</td><td class="num">' + F.num(l.qte * l.pu) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' +
      '<div class="fin-doc-tot"><div><span>Total HT</span><b>' + F.money(ht) + '</b></div><div><span>TVA 18 %</span><b>' + F.money(tva) + '</b></div><div class="ttc"><span>Total TTC</span><span>' + F.money(ttc) + '</span></div></div>' +
      '<div class="fin-doc-words">Arrêté le présent bon de commande à la somme de : <b>' + esc(enLettres(ttc)) + ' francs CFA TTC</b>.</div>' +
      '<div class="fin-doc-cond"><b>Conditions particulières</b><ul><li>Paiement : ' + esc(o.conditions) + ', par virement bancaire.</li><li>Livraison DAP Port-Gentil (Incoterms 2020) au lieu indiqué, accompagnée du bon de livraison et des certificats matière / de conformité.</li><li>Pénalités de retard : 0,5 % du montant HT par jour calendaire, plafonnées à 10 %.</li><li>Garantie : 12 mois à compter de la mise en service, 18 mois au plus après livraison.</li><li>Toute facture doit rappeler le numéro du présent bon de commande ; les attestations fiscale et CNSS du fournisseur doivent être en cours de validité.</li></ul></div>' +
      '<div class="fin-doc-sign"><div>L\'acheteur<br><b>' + esc(E.empName(o.acheteur)) + '</b><em>✓ Émis le ' + F.dateShort(o.date) + '</em></div><div>Chef du service Achats<br><b>' + esc(STEP.chef.who) + '</b><em>✓ Visé</em></div>' +
      (niv.indexOf('daf') >= 0 ? '<div>Directrice financière<br><b>' + esc(STEP.daf.who) + '</b><em>✓ Visé</em></div>' : '') + (niv.indexOf('dg') >= 0 ? '<div>Direction générale<br><b>Le Directeur général</b><em>✓ Visé</em></div>' : '') + '</div>' +
      '<div class="fin-doc-foot">SOGARA — Société Gabonaise de Raffinage · Route du Dahu, B.P. 530, Port-Gentil · Document généré par l\'espace de gestion (démonstration)</div></div>';
  }

  /* ------------------------------------------------------------------ éditeur de lignes */
  function linesEditor(id, lines, opt) {
    opt = opt || {};
    var arts = opt.articles && S.has('articles') ? S.all('articles') : null;
    function row(l) {
      return '<div class="fin-le__row"><input class="input" data-f="designation" placeholder="Désignation de l\'article ou de la prestation" value="' + esc(l.designation || '') + '">' +
        '<input class="input" data-f="qte" type="number" min="0" step="any" placeholder="Qté" value="' + (l.qte != null ? l.qte : '') + '">' +
        '<input class="input" data-f="unite" placeholder="Unité" value="' + esc(l.unite || 'u') + '">' +
        '<input class="input" data-f="pu" type="number" min="0" step="any" placeholder="PU HT (FCFA)" value="' + (l.pu != null ? l.pu : '') + '">' +
        '<button type="button" class="btn ghost icon" data-le-del title="Supprimer la ligne" aria-label="Supprimer la ligne">' + ic('trash') + '</button>' +
        (arts ? '<select class="select fin-le__art" data-f="articleId"><option value="">— Article du magasin (facultatif : entrée en stock à la réception) —</option>' + arts.map(function (a) { return '<option value="' + a.id + '"' + (a.id === l.articleId ? ' selected' : '') + '>' + esc(a.id + ' · ' + a.designation) + '</option>'; }).join('') + '</select>' : '') + '</div>';
    }
    var html = '<div class="fin-le" id="' + id + '"><div class="fin-le__head"><span>Désignation</span><span>Qté</span><span>Unité</span><span>PU estimé HT</span><span></span></div><div class="fin-le__rows">' + (lines && lines.length ? lines : [{}]).map(row).join('') + '</div><div class="fin-le__foot"><button type="button" class="btn sm" data-le-add>' + ic('plus') + 'Ajouter une ligne</button><div class="fin-le__tot">Total HT : <b data-le-tot>—</b></div></div></div>';
    function el() { return document.getElementById(id); }
    function read() {
      return E.$$('.fin-le__row', el()).map(function (r) {
        var o = { designation: r.querySelector('[data-f=designation]').value.trim(), qte: +r.querySelector('[data-f=qte]').value || 0, unite: r.querySelector('[data-f=unite]').value.trim() || 'u', pu: +r.querySelector('[data-f=pu]').value || 0 };
        var a = r.querySelector('[data-f=articleId]'); if (a && a.value) o.articleId = a.value; return o;
      }).filter(function (l) { return l.designation && l.qte > 0; });
    }
    function total() { return E.sum(read(), function (l) { return l.qte * l.pu; }); }
    function upd() { var t = total(); el().querySelector('[data-le-tot]').textContent = F.money(t); if (opt.onChange) opt.onChange(t); }
    function bind() {
      var root = el();
      root.addEventListener('click', function (e) {
        if (e.target.closest('[data-le-add]')) { root.querySelector('.fin-le__rows').insertAdjacentHTML('beforeend', row({})); upd(); }
        var del = e.target.closest('[data-le-del]'); if (del) { if (E.$$('.fin-le__row', root).length > 1) del.closest('.fin-le__row').remove(); upd(); }
      });
      root.addEventListener('input', upd);
      root.addEventListener('change', function (e) {
        var s = e.target.closest('[data-f=articleId]'); if (!s || !s.value) return; var a = S.get('articles', s.value), r = s.closest('.fin-le__row');
        if (a) { var dz = r.querySelector('[data-f=designation]'); if (!dz.value) dz.value = a.designation; var un = r.querySelector('[data-f=unite]'); if (!un.value || un.value === 'u') un.value = a.unite || 'u'; var pu = r.querySelector('[data-f=pu]'); if (!pu.value) pu.value = a.pu || ''; upd(); }
      });
      upd();
    }
    return { html: html, bind: bind, read: read, total: total };
  }
  function circuitHTML(montant) {
    var n = niveaux(montant), labels = ['Demande émise'].concat(n.map(function (k) { return STEP[k].label; })).concat(['Validée']);
    return '<div class="fin-circuit"><b>Circuit de validation</b> — ' + (montant < 5e6 ? 'moins de 5 M FCFA : visa du chef de service' : montant <= 50e6 ? 'de 5 à 50 M FCFA : chef de service puis Directrice financière' : 'plus de 50 M FCFA : chef de service, Directrice financière puis Direction générale') + U.steps(labels, 1) + '</div>';
  }

  /* ------------------------------------------------------------------ état de la vue */
  var TABS = [{ k: 'dashboard', l: 'Tableau de bord' }, { k: 'da', l: 'Demandes d\'achat' }, { k: 'consultations', l: 'Consultations' }, { k: 'bc', l: 'Bons de commande' }, { k: 'receptions', l: 'Réceptions' }, { k: 'factures', l: 'Factures fournisseurs' }, { k: 'fournisseurs', l: 'Fournisseurs' }];
  var st = { tab: 'dashboard', f: {}, lim: {} };
  var viewEl = null;

  function render(view, params) {
    viewEl = view; params = params || [];
    var tab = params[0] || 'dashboard'; if (!TABS.some(function (t) { return t.k === tab; })) tab = 'dashboard';
    if (st.tab !== tab) st.lim = {};
    st.tab = tab; draw();
    if (params[1]) { var id = decodeURIComponent(params[1]); setTimeout(function () { openById(tab, id, true); }, 30); }
  }
  function openById(tab, id, fromUrl) {
    var fn = { da: openDA, consultations: openCO, bc: openBC, receptions: openBC, factures: openFF, fournisseurs: openFournisseur }[tab];
    if (fn) fn(id, fromUrl);
  }
  function afterClose() { var p = location.hash.replace(/^#\/?/, '').split('/'); if (p[0] === MOD && p.length > 2) history.replaceState(null, '', '#/' + MOD + '/' + p[1]); }
  function refresh() { if (viewEl && document.body.contains(viewEl) && (location.hash.replace(/^#\/?/, '').split('/')[0] === MOD)) draw(); E.renderBadges(); }

  function counts() {
    return { da: das().filter(function (o) { return o.statut === 'En validation' || o.statut === 'Complément demandé'; }).length, co: cos().filter(function (c) { return c.statut !== 'Attribuée' && c.statut !== 'Infructueuse'; }).length, bc: bcs().filter(bcLate).length, rc: bcs().filter(function (o) { return OPEN.indexOf(o.statut) >= 0; }).length, ff: ffs().filter(function (f) { return f.statut === 'À contrôler' || f.statut === 'Litige'; }).length };
  }
  function draw() {
    var v = viewEl, u = user(), c = counts();
    var role = { achats: 'Visa niveau 1 · chef de service', finance: 'Visa niveau 2 · Directrice financière', admin: 'Visa niveau 3 · Direction générale' }[u.profile] || '';
    var actions = '';
    if (st.tab === 'da' || st.tab === 'dashboard') actions += '<button class="btn primary" data-act="new-da">' + ic('plus') + 'Nouvelle demande d\'achat</button>';
    if (st.tab === 'bc' && canAchats()) actions += '<button class="btn primary" data-act="new-bc">' + ic('plus') + 'Nouveau bon de commande</button>';
    if (st.tab === 'factures') actions += '<button class="btn primary" data-act="new-ff">' + ic('plus') + 'Enregistrer une facture</button>';
    if (['da', 'bc', 'factures', 'consultations', 'fournisseurs'].indexOf(st.tab) >= 0) actions += '<button class="btn" data-act="csv">' + ic('download') + 'Export CSV</button>';
    v.innerHTML = '<div class="fin-root" id="ach-root"><div class="fin-head"><div><h2>Achats & approvisionnements</h2><p>Chaîne procure-to-pay : demande, validation, consultation, commande, réception, facture, paiement.</p></div>' +
      '<div class="row"><span class="fin-who">' + U.avatar(u.name || '?', u.color, true) + '<span><b>' + esc(u.name || '') + '</b> · ' + esc(role) + '</span></span>' + actions + '</div></div>' +
      U.tabs(TABS.map(function (t) { return { k: t.k, l: t.l, n: t.k === 'da' ? c.da || null : t.k === 'consultations' ? c.co || null : t.k === 'bc' ? (c.bc || null) : t.k === 'receptions' ? c.rc || null : t.k === 'factures' ? c.ff || null : null }; }), st.tab, function (k) { E.go(MOD + '/' + k); }) +
      '<div id="ach-body"></div></div>';
    var body = v.querySelector('#ach-body');
    ({ dashboard: vDash, da: vDA, consultations: vCO, bc: vBC, receptions: vRec, factures: vFF, fournisseurs: vFour })[st.tab](body);
    var root = v.querySelector('#ach-root');
    root.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]'); if (!a || !root.contains(a)) return;
      var act = a.dataset.act, id = a.dataset.id;
      if (act === 'new-da') newDA();
      else if (act === 'new-bc') newBC();
      else if (act === 'new-ff') newFF();
      else if (act === 'csv') exportTab();
      else if (act === 'go') E.go(MOD + '/' + a.dataset.k);
      else if (act === 'da') openDA(id);
      else if (act === 'co') openCO(id);
      else if (act === 'bc') openBC(id);
      else if (act === 'ff') openFF(id);
      else if (act === 'four') openFournisseur(id);
      else if (act === 'launch-co') launchCO(id);
      else if (act === 'recv') receive(id);
      else if (act === 'chip') { st.f[a.dataset.g] = a.dataset.v; st.lim = {}; draw(); }
      else if (act === 'more') { st.lim[a.dataset.k] = (st.lim[a.dataset.k] || 25) + 25; draw(); }
    });
  }
  function chips(group, list, cur) { return '<div class="chips">' + list.map(function (x) { var v = typeof x === 'object' ? x.v : x, l = typeof x === 'object' ? x.l : x; return '<button class="chip' + ((cur || list[0].v || list[0]) === v ? ' is-active' : '') + '" data-act="chip" data-g="' + group + '" data-v="' + esc(v) + '">' + esc(l) + '</button>'; }).join('') + '</div>'; }
  function searchBox(id, ph) { return '<input class="input" id="' + id + '" type="search" placeholder="' + esc(ph) + '" value="' + esc(st.f[id] || '') + '" style="max-width:320px">'; }
  function bindSearch(body, id, redraw) { var i = body.querySelector('#' + id); if (!i) return; i.addEventListener('input', function () { st.f[id] = i.value; redraw(); }); }
  function paged(key, rows) { var lim = st.lim[key] || 25; return { rows: rows.slice(0, lim), more: rows.length > lim ? '<div class="fin-more"><button class="btn sm" data-act="more" data-k="' + key + '">Afficher plus (' + (rows.length - lim) + ' restants)</button></div>' : '' }; }

  /* ------------------------------------------------------------------ tableau de bord */
  function vDash(body) {
    var D = das(), pend = D.filter(function (o) { return o.statut === 'En validation'; });
    var from30 = d(-30), b30 = bcs().filter(function (o) { return o.statut !== 'Annulé' && o.date >= from30; });
    var late = bcs().filter(bcLate), eco = E.sum(cos(), economie), estAttr = E.sum(cos().filter(function (c) { return c.statut === 'Attribuée'; }), 'estimation');
    var dm = delaiMoyen();
    var kp = '<div class="fin-kpis">' +
      U.kpi({ label: 'DA en attente de visa', value: pend.length, icon: 'inbox', tone: 'orange', foot: M(E.sum(pend, 'montant')) + ' · ' + pend.filter(function (o) { return o.urgence !== 'Normale'; }).length + ' urgente(s)' }) +
      U.kpi({ label: 'Engagé sur 30 jours', value: F.short(E.sum(b30, bcHT)), unit: 'FCFA', icon: 'cart', tone: 'blue', foot: b30.length + ' bon(s) de commande émis' }) +
      U.kpi({ label: 'Commandes en retard', value: late.length, icon: 'clock', tone: late.length ? 'red' : 'green', foot: late.length ? M(E.sum(late, bcHT)) + ' en attente de livraison' : 'Aucun retard' }) +
      U.kpi({ label: 'Délai moyen DA → BC', value: F.num(dm, 0), unit: 'jours', icon: 'trend', tone: 'violet', foot: dm <= 21 ? '<span class="up">Objectif ≤ 21 j tenu</span>' : '<span class="down">Objectif ≤ 21 j</span>' }) +
      U.kpi({ label: 'Économies négociées', value: F.short(eco), unit: 'FCFA', icon: 'star', tone: 'green', foot: estAttr ? '<span class="up">' + F.pct(eco / estAttr * 100, 1) + '</span> des montants estimés' : '' }) + '</div>';
    var f = ffs();
    var flow = [
      { k: 'da', l: 'Demandes à viser', n: pend.length, s: M(E.sum(pend, 'montant')), c: 'var(--orange)' },
      { k: 'consultations', l: 'À consulter', n: D.filter(function (o) { return o.statut === 'Validée'; }).length, s: 'DA validées', c: 'var(--green)' },
      { k: 'consultations', l: 'Consultations', n: cos().filter(function (c) { return c.statut === 'En cours' || c.statut === 'Offres reçues'; }).length, s: 'offres en cours d\'analyse', c: 'var(--violet)' },
      { k: 'receptions', l: 'À réceptionner', n: bcs().filter(function (o) { return OPEN.indexOf(o.statut) >= 0; }).length, s: late.length + ' en retard', c: 'var(--blue)' },
      { k: 'factures', l: 'Factures à contrôler', n: f.filter(function (x) { return x.statut === 'À contrôler'; }).length, s: f.filter(function (x) { return x.statut === 'À contrôler' && !rappro(x).ok; }).length + ' avec écart', c: 'var(--red)' },
      { k: 'factures', l: 'Bons à payer', n: f.filter(function (x) { return x.statut === 'Bon à payer'; }).length, s: M(E.sum(f.filter(function (x) { return x.statut === 'Bon à payer'; }), ffTTC)), c: 'var(--navy-3)' }
    ];
    var flowH = '<div class="card"><div class="card__h"><h3>Chaîne procure-to-pay</h3><span class="sub">cliquez sur une étape pour traiter les pièces</span></div><div class="card__b"><div class="fin-flow">' + flow.map(function (x) { return '<button class="fin-flow__s' + (x.n && (x.k === 'da' || x.l === 'Factures à contrôler') ? ' hot' : '') + '" style="--c:' + x.c + '" data-act="go" data-k="' + x.k + '"><small>' + esc(x.l) + '</small><b>' + x.n + '</b><span>' + esc(x.s) + '</span></button>'; }).join('') + '</div></div></div>';
    var em = engagementsByMonth();
    var catTot = {}; S.all('achatsHisto').forEach(function (h) { Object.keys(h.cats).forEach(function (c) { catTot[c] = (catTot[c] || 0) + h.cats[c]; }); });
    bcs().forEach(function (o) { if (o.statut !== 'Annulé' && !S.get('achatsHisto', 'H-' + mkey(o.date))) catTot[o.categorie || 'Autres'] = (catTot[o.categorie || 'Autres'] || 0) + bcHT(o); });
    var cats = Object.keys(catTot).map(function (k) { return { label: k, value: catTot[k] }; }).sort(function (a, b) { return b.value - a.value; });
    var top = cats.slice(0, 6); if (cats.length > 6) top.push({ label: 'Autres', value: E.sum(cats.slice(6), 'value'), color: '#94a3b8' });
    var totalEng = E.sum(em, 'v');
    var charts = '<div class="grid g-2-1"><div class="card"><div class="card__h"><h3>Engagements par mois</h3><span class="sub">bons de commande émis · 12 derniers mois · ' + M(totalEng) + '</span></div><div class="card__b">' + U.bars({ labels: em.map(function (x) { return x.label; }), series: [{ name: 'Engagé', values: em.map(function (x) { return x.v; }), color: '#163b75' }], money: true, height: 230 }) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Dépenses par catégorie</h3><span class="sub">12 mois</span></div><div class="card__b">' + U.donut(top, { money: true, center: F.short(totalEng), sub: 'FCFA HT' }) + '</div></div></div>';
    var tops = S.all('fournisseurs').map(function (x) { return { f: x, v: volume(x.id) }; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 6), maxV = tops.length ? tops[0].v : 1;
    var topH = '<div class="card"><div class="card__h"><h3>Top fournisseurs</h3><span class="sub">volume d\'achats ' + Y + '</span><span class="spacer"></span><button class="btn sm ghost" data-act="go" data-k="fournisseurs">Tous</button></div><div class="list">' + tops.map(function (t) { return '<div class="list__item" data-act="four" data-id="' + t.f.id + '" style="cursor:pointer">' + U.avatar(t.f.nom, null, true) + '<div class="list__body"><b>' + esc(t.f.nom) + '</b><div class="small muted">' + esc(t.f.domaine) + '</div>' + U.progress(t.v / maxV * 100) + '</div><div class="right"><b>' + F.short(t.v) + '</b><div class="small muted">FCFA</div></div></div>'; }).join('') + '</div></div>';
    var al = [];
    late.forEach(function (o) { al.push({ t: 'red', i: 'clock', h: o.id + ' · livraison en retard de ' + retard(o) + ' j', s: frNom(o.fournisseur) + ' · ' + o.objet, act: 'bc', id: o.id }); });
    S.all('fournisseurs').forEach(function (x) { frDocAlert(x.id).forEach(function (dc) { var s = docStatus(dc); al.push({ t: s.t, i: 'file', h: x.nom + ' · ' + dc.type, s: s.l + ' (' + F.date(dc.expiration) + ')', act: 'four', id: x.id }); }); });
    f.filter(function (x) { return x.statut !== 'Payée' && x.echeance < today(); }).forEach(function (x) { al.push({ t: 'orange', i: 'invoice', h: x.id + ' · facture échue', s: frNom(x.fournisseur) + ' · ' + M(ffTTC(x)) + ' · échéance ' + F.date(x.echeance), act: 'ff', id: x.id }); });
    pend.filter(function (o) { return o.urgence !== 'Normale'; }).forEach(function (o) { al.push({ t: 'violet', i: 'alert', h: o.id + ' · DA ' + o.urgence.toLowerCase() + ' en attente', s: o.objet + ' · visa ' + STEP[daNext(o)].label, act: 'da', id: o.id }); });
    var alH = '<div class="card"><div class="card__h"><h3>Alertes & points d\'attention</h3><span class="sub">' + al.length + '</span></div><div class="list">' + (al.length ? al.slice(0, 8).map(function (x) { return '<div class="list__item" data-act="' + x.act + '" data-id="' + x.id + '" style="cursor:pointer"><div class="list__icon tone-' + x.t + '">' + ic(x.i) + '</div><div class="list__body"><b>' + esc(x.h) + '</b><div class="small muted">' + esc(x.s) + '</div></div></div>'; }).join('') : '<div class="empty">Aucune alerte</div>') + '</div></div>';
    body.innerHTML = '<div class="stack">' + kp + flowH + charts + '<div class="grid g2 stack-m">' + topH + alH + '</div></div>';
  }

  /* ------------------------------------------------------------------ demandes d'achat */
  var DA_COLS = [
    { label: 'N°', render: function (o) { return '<span class="mono fin-strong">' + o.id + '</span><span class="fin-sub">' + F.date(o.date) + '</span>'; }, csv: function (o) { return o.id; } },
    { label: 'Objet', render: function (o) { return '<span class="fin-strong">' + esc(o.objet) + '</span><span class="fin-sub">' + esc(E.empName(o.demandeur)) + ' · ' + esc(E.dirName(o.direction)) + '</span>'; }, csv: function (o) { return o.objet; } },
    { label: 'Montant estimé', num: true, render: function (o) { return '<b>' + F.money(o.montant) + '</b>'; }, csv: function (o) { return o.montant; } },
    { label: 'Urgence', render: function (o) { return B(o.urgence); }, csv: function (o) { return o.urgence; } },
    { label: 'Circuit', render: function (o) { var n = niveaux(o.montant), ok = o.visas.filter(function (v) { return v.decision === 'Visé'; }).map(function (v) { return v.etape; }), nx = daNext(o); return '<span class="fin-dots">' + n.map(function (k) { return '<i class="' + (ok.indexOf(k) >= 0 ? 'ok' : o.statut === 'Refusée' && k === nx ? 'ko' : (o.statut === 'En validation' || o.statut === 'Complément demandé') && k === nx ? 'cur' : '') + '" title="' + STEP[k].label + '"></i>'; }).join('') + '</span> <span class="small muted">' + (o.statut === 'En validation' && nx ? 'Visa ' + STEP[nx].label.toLowerCase() : ok.length + '/' + n.length + ' visa(s)') + '</span>'; }, csv: function (o) { return o.visas.length; } },
    { label: 'Statut', render: function (o) { return B(o.statut); }, csv: function (o) { return o.statut; } }
  ];
  function filteredDA() {
    var s = st.f.daS || 'Toutes', q = E.norm(st.f['da-q'] || ''), dir = st.f.daDir || '';
    return das().filter(function (o) { return (s === 'Toutes' || (s === 'À viser par moi' ? canVisa(o) : o.statut === s)) && (!dir || o.direction === dir) && (!q || E.norm(o.id + ' ' + o.objet + ' ' + E.empName(o.demandeur) + ' ' + o.imputation).indexOf(q) >= 0); }).sort(function (a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); });
  }
  function vDA(body) {
    var mine = das().filter(canVisa).length;
    var stats = ['Toutes'].concat(mine ? ['À viser par moi'] : []).concat(['En validation', 'Complément demandé', 'Validée', 'En consultation', 'Commandée', 'Refusée', 'Brouillon']);
    body.innerHTML = (mine ? '<div class="alert tone-orange" style="margin-bottom:14px">' + ic('alert') + '<div><b>' + mine + ' demande(s) attendent votre visa.</b> Ouvrez une demande pour la valider, la refuser ou demander un complément.</div></div>' : '') +
      '<div class="card"><div class="card__b"><div class="filters">' + searchBox('da-q', 'Rechercher (n°, objet, demandeur, imputation)') +
      '<select class="select" id="da-dir"><option value="">Toutes les directions</option>' + S.all('directions').map(function (x) { return '<option value="' + x.id + '"' + (st.f.daDir === x.id ? ' selected' : '') + '>' + esc(x.nom) + '</option>'; }).join('') + '</select></div>' +
      chips('daS', stats, st.f.daS || 'Toutes') + '</div><div id="da-list"></div></div>';
    function list() { var rows = filteredDA(), p = paged('da', rows); body.querySelector('#da-list').innerHTML = U.table(DA_COLS, p.rows, { onRow: function (o) { openDA(o.id); }, empty: 'Aucune demande pour ces critères', footer: function () { return '<td colspan="2">' + rows.length + ' demande(s)</td><td class="num">' + F.money(E.sum(rows, 'montant')) + '</td><td colspan="3"></td>'; } }) + p.more; }
    list(); bindSearch(body, 'da-q', list);
    body.querySelector('#da-dir').onchange = function (e) { st.f.daDir = e.target.value; list(); };
  }

  function openDA(id, fromUrl) {
    var o = S.get('da', id); if (!o) return;
    var n = niveaux(o.montant), nx = daNext(o), okL = o.visas.filter(function (v) { return v.decision === 'Visé'; }).length;
    var labels = ['Demande émise'].concat(n.map(function (k) { return STEP[k].label; })).concat(['Validée']);
    var done = ['Validée', 'En consultation', 'Commandée'].indexOf(o.statut) >= 0;
    var cur = o.statut === 'Brouillon' ? 0 : done ? labels.length - 1 : 1 + okL;
    var stepsH = U.steps(labels, cur, { rejected: o.statut === 'Refusée', finished: done });
    var who = '';
    if (o.statut === 'En validation' && nx) {
      who = canVisa(o) ? '<div class="alert tone-yellow">' + ic('info') + '<div><b>Votre visa est attendu</b> au titre de : ' + esc(STEP[nx].label) + (isAdmin() && PROFILE_STEP.admin !== nx ? ' (par délégation de la Direction générale)' : '') + '.</div></div>'
        : '<div class="alert tone-blue">' + ic('clock') + '<div>En attente du visa : <b>' + esc(STEP[nx].label) + '</b> (' + esc(STEP[nx].who) + '). <span class="muted">Démo : connectez-vous avec le profil « ' + STEP[nx].login + ' » pour viser.</span></div></div>';
    } else if (o.statut === 'Complément demandé') who = '<div class="alert tone-yellow">' + ic('alert') + '<div><b>Complément demandé</b> — ' + esc((o.visas.filter(function (v) { return v.decision === 'Complément'; }).pop() || {}).commentaire || '') + '</div></div>';
    else if (o.statut === 'Refusée') who = '<div class="alert tone-red">' + ic('x') + '<div><b>Demande refusée</b> — ' + esc((o.visas.filter(function (v) { return v.decision === 'Refusé'; }).pop() || {}).commentaire || '') + '</div></div>';
    else if (o.statut === 'Validée') who = '<div class="alert tone-green">' + ic('check') + '<div><b>Demande validée.</b> ' + (canAchats() ? 'Lancez la consultation des fournisseurs ou passez une commande directe (marché cadre).' : 'Le service Achats va lancer la consultation.') + '</div></div>';
    var tl = '<div class="timeline"><div class="tl-item done"><b>Demande émise</b><span>' + esc(E.empName(o.demandeur)) + ' · ' + F.date(o.date) + '</span></div>' +
      o.visas.map(function (v) { return '<div class="tl-item ' + (v.decision === 'Visé' || v.decision === 'Resoumise' ? 'done' : v.decision === 'Refusé' ? 'rejected' : 'current') + '"><b>' + esc(v.decision === 'Resoumise' ? 'Resoumise avec complément' : (STEP[v.etape] ? STEP[v.etape].label : '') + ' — ' + v.decision) + '</b><span>' + esc(v.user) + ' · ' + F.datetime(v.date) + '</span>' + (v.commentaire ? '<div class="small" style="margin-top:3px">« ' + esc(v.commentaire) + ' »</div>' : '') + '</div>'; }).join('') +
      (o.statut === 'En validation' && nx ? '<div class="tl-item current"><b>' + esc(STEP[nx].label) + ' — en attente</b><span>' + esc(STEP[nx].who) + '</span></div>' : '') + '</div>';
    var links = [];
    if (o.consultationId) links.push('<button class="btn sm" data-l="co" data-id="' + o.consultationId + '">' + ic('layers') + 'Consultation ' + o.consultationId + '</button>');
    if (o.bcId) links.push('<button class="btn sm" data-l="bc" data-id="' + o.bcId + '">' + ic('cart') + 'Bon de commande ' + o.bcId + '</button>');
    var bodyH = '<div class="row" style="margin-bottom:12px">' + B(o.statut) + B(o.urgence) + '<span class="badge tone-grey plain">' + esc(o.categorie) + '</span><span class="spacer"></span><span class="fin-big">' + F.money(o.montant) + '</span></div>' + stepsH + who +
      '<div class="grid g2 stack-m" style="margin-top:14px"><dl class="kv"><dt>Demandeur</dt><dd>' + esc(E.empName(o.demandeur)) + '</dd><dt>Direction</dt><dd>' + esc(E.dirName(o.direction)) + '</dd><dt>Date de la demande</dt><dd>' + F.date(o.date) + '</dd><dt>Besoin souhaité le</dt><dd>' + F.date(o.besoin) + '</dd><dt>Imputation</dt><dd>' + esc(o.imputation) + '</dd><dt>Justification</dt><dd>' + esc(o.justification) + '</dd></dl>' +
      '<div><div class="fin-sect">' + ic('check') + 'Visas</div>' + tl + '</div></div>' +
      '<div class="fin-sect">' + ic('list') + 'Lignes de la demande</div>' + U.table([{ label: 'Désignation', render: function (l) { return esc(l.designation) + (l.articleId ? ' <span class="small muted mono">' + esc(l.articleId) + '</span>' : ''); } }, { label: 'Qté', num: true, render: function (l) { return F.num(l.qte) + ' ' + esc(l.unite); } }, { label: 'PU estimé', num: true, render: function (l) { return F.money(l.pu); } }, { label: 'Montant', num: true, render: function (l) { return '<b>' + F.money(l.qte * l.pu) + '</b>'; } }], o.lignes, { footer: function () { return '<td colspan="3">Total estimé HT</td><td class="num">' + F.money(o.montant) + '</td>'; } }) +
      (links.length ? '<div class="row" style="margin-top:12px">' + links.join('') + '</div>' : '');
    var acts = [];
    if (canVisa(o)) {
      acts.push({ label: 'Demander un complément', icon: 'refresh', onClick: function (close) { visa(o, 'Complément', close); } });
      acts.push({ label: 'Refuser', cls: 'danger', icon: 'x', onClick: function (close) { visa(o, 'Refusé', close); } });
      acts.push({ label: 'Valider', cls: 'success', icon: 'check', onClick: function (close) { visa(o, 'Visé', close); } });
    }
    if (o.statut === 'Complément demandé' || o.statut === 'Brouillon') acts.push({ label: o.statut === 'Brouillon' ? 'Soumettre au circuit' : 'Compléter et resoumettre', cls: 'primary', icon: 'send', onClick: function (close) { resubmit(o, close); } });
    if (o.statut === 'Validée' && canAchats()) {
      acts.push({ label: 'Commande directe', icon: 'cart', onClick: function (close) { close(); newBC({ da: o }); } });
      acts.push({ label: 'Lancer la consultation', cls: 'primary', icon: 'layers', onClick: function (close) { close(); launchCO(o.id); } });
    }
    acts.unshift({ label: 'Fermer' });
    var m = U.modal({ title: o.id + ' · ' + o.objet, sub: 'Demande d\'achat · ' + esc(E.dirName(o.direction)), size: 'lg', body: bodyH, actions: acts, onClose: fromUrl ? afterClose : null });
    m.body.addEventListener('click', function (e) { var b = e.target.closest('[data-l]'); if (!b) return; m.close(); if (b.dataset.l === 'co') openCO(b.dataset.id); else openBC(b.dataset.id); });
  }
  function visa(o, decision, closeDetail) {
    var nx = daNext(o), lab = { 'Visé': 'Valider la demande', 'Refusé': 'Refuser la demande', 'Complément': 'Demander un complément' }[decision];
    var need = decision !== 'Visé';
    var m = U.modal({ title: lab, sub: o.id + ' · ' + esc(o.objet) + ' · ' + F.money(o.montant), size: 'sm', body: '<p style="margin:0 0 10px">Visa au titre de : <b>' + esc(STEP[nx].label) + '</b></p><div class="field"><label for="v-com">Commentaire' + (need ? ' *' : ' (facultatif)') + '</label><textarea class="textarea" id="v-com" placeholder="' + (decision === 'Visé' ? 'Ex. : conforme au budget' : 'Motif à communiquer au demandeur') + '"></textarea></div>',
      actions: [{ label: 'Annuler' }, { label: lab, cls: decision === 'Visé' ? 'success' : decision === 'Refusé' ? 'danger' : 'primary', icon: 'check', onClick: function (close, el) {
        var com = el.querySelector('#v-com').value.trim();
        if (need && !com) { U.toast('Merci de préciser le motif.', 'err'); return; }
        o.visas.push({ etape: nx, user: user().name, date: stamp(), decision: decision, commentaire: com });
        var msg;
        if (decision === 'Visé') {
          var nn = daNext(o);
          if (nn) { msg = 'Visa enregistré — transmise à : ' + STEP[nn].label; E.notify('DA à viser : ' + o.id, o.objet + ' · ' + M(o.montant), '#/achats/da/' + o.id, 'orange'); }
          else { o.statut = 'Validée'; msg = 'Demande validée — prête pour consultation'; E.notify('DA validée : ' + o.id, o.objet + ' — à mettre en consultation', '#/achats/da/' + o.id, 'green'); }
        } else if (decision === 'Refusé') { o.statut = 'Refusée'; msg = 'Demande refusée'; E.notify('DA refusée : ' + o.id, com, '#/achats/da/' + o.id, 'red'); }
        else { o.statut = 'Complément demandé'; msg = 'Complément demandé au demandeur'; E.notify('Complément demandé : ' + o.id, com, '#/achats/da/' + o.id, 'orange'); }
        S.save(); E.log('Visa DA ' + decision.toLowerCase(), o.id + ' · ' + STEP[nx].label + (com ? ' · ' + com : ''), MOD);
        close(); closeDetail(); U.toast(msg); refresh(); openDA(o.id);
      } }] });
    return m;
  }
  function resubmit(o, closeDetail) {
    U.formModal({ title: o.statut === 'Brouillon' ? 'Soumettre la demande' : 'Compléter la demande', sub: o.id, fields: [{ name: 'justification', label: 'Justification / complément d\'information', type: 'textarea', value: o.justification, required: true }], okLabel: 'Soumettre', onSubmit: function (v) {
      o.justification = v.justification; if (o.statut === 'Complément demandé') o.visas.push({ etape: 'demandeur', user: user().name, date: stamp(), decision: 'Resoumise', commentaire: 'Complément apporté' });
      o.statut = 'En validation'; S.save(); E.log('DA resoumise', o.id, MOD); E.notify('DA à viser : ' + o.id, o.objet, '#/achats/da/' + o.id, 'orange');
      closeDetail(); U.toast('Demande soumise au circuit de validation'); refresh(); setTimeout(function () { openDA(o.id); }, 10);
    } });
  }
  function newDA() {
    var me = myEmp() || empIdByName('Mbina');
    var fields = [
      { name: 'objet', label: 'Objet de la demande', required: true, full: true, placeholder: 'Ex. : Garnitures mécaniques pompes P-205' },
      { name: 'demandeur', label: 'Demandeur', type: 'select', options: S.all('employes').map(function (e) { return { v: e.id, l: e.nom + ' — ' + e.poste }; }), value: me },
      { name: 'direction', label: 'Direction', type: 'select', options: E.options('directions'), value: (E.emp(me) || {}).direction || 'MAINT' },
      { name: 'categorie', label: 'Catégorie d\'achat', type: 'select', options: CATS },
      { name: 'imputation', label: 'Imputation budgétaire', type: 'select', options: imputations() },
      { name: 'urgence', label: 'Urgence', type: 'select', options: URG },
      { name: 'besoin', label: 'Date de besoin', type: 'date', value: d(30) },
      { name: 'justification', label: 'Justification du besoin', type: 'textarea', required: true, placeholder: 'Contexte technique, risque en cas de non-achat, référence de l\'OT…' }
    ];
    var le = linesEditor('da-le', [], { onChange: function (t) { var c = document.getElementById('da-circ'); if (c) c.innerHTML = circuitHTML(t); } });
    var m = U.modal({ title: 'Nouvelle demande d\'achat', sub: 'Le circuit de validation s\'adapte automatiquement au montant estimé', size: 'lg', body: U.form(fields) + le.html + '<div id="da-circ"></div>',
      actions: [{ label: 'Annuler' }, { label: 'Enregistrer en brouillon', icon: 'file', onClick: function (c, el) { save(c, el, true); } }, { label: 'Soumettre au circuit', cls: 'primary', icon: 'send', onClick: function (c, el) { save(c, el, false); } }] });
    le.bind();
    m.el.querySelector('#f_demandeur').addEventListener('change', function (e) { var em = E.emp(e.target.value); if (em) m.el.querySelector('#f_direction').value = em.direction; });
    function save(close, el, draft) {
      var v = U.readForm(el); if (!v) return; var lignes = le.read();
      if (!lignes.length) { U.toast('Ajoutez au moins une ligne (désignation et quantité).', 'err'); return; }
      var o = { id: nextId('da', 'DA'), date: today(), demandeur: v.demandeur, direction: v.direction, objet: v.objet, categorie: v.categorie, imputation: v.imputation, urgence: v.urgence, besoin: v.besoin, justification: v.justification, lignes: lignes, montant: E.sum(lignes, function (l) { return l.qte * l.pu; }), statut: draft ? 'Brouillon' : 'En validation', visas: [] };
      S.add('da', o); E.log('Création DA', o.id + ' · ' + o.objet + ' · ' + M(o.montant), MOD);
      if (!draft) E.notify('Nouvelle DA à viser : ' + o.id, o.objet + ' · ' + M(o.montant), '#/achats/da/' + o.id, 'orange');
      close(); U.toast(draft ? 'Brouillon enregistré' : 'Demande ' + o.id + ' soumise — circuit : ' + niveaux(o.montant).map(function (k) { return STEP[k].label; }).join(' → '));
      if (st.tab !== 'da') E.go(MOD + '/da'); else refresh();
      setTimeout(function () { openDA(o.id); }, 60);
    }
  }

  /* ------------------------------------------------------------------ consultations */
  function vCO(body) {
    var aLancer = das().filter(function (o) { return o.statut === 'Validée'; });
    var rows = cos().slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    var s = st.f.coS || 'Toutes'; rows = rows.filter(function (c) { return s === 'Toutes' || c.statut === s; });
    var cols = [
      { label: 'N°', render: function (c) { return '<span class="mono fin-strong">' + c.id + '</span><span class="fin-sub">' + esc(c.mode) + '</span>'; }, csv: function (c) { return c.id; } },
      { label: 'Objet', render: function (c) { return '<span class="fin-strong">' + esc(c.objet) + '</span><span class="fin-sub">' + c.daId + ' · estimé ' + M(c.estimation) + '</span>'; }, csv: function (c) { return c.objet; } },
      { label: 'Offres reçues', render: function (c) { return '<div style="min-width:110px">' + U.progress(c.devis.length / c.fournisseurs.length * 100, c.devis.length >= c.fournisseurs.length ? 'green' : 'orange') + '<span class="fin-sub">' + c.devis.length + ' / ' + c.fournisseurs.length + ' fournisseurs</span></div>'; }, csv: function (c) { return c.devis.length + '/' + c.fournisseurs.length; } },
      { label: 'Date limite', render: function (c) { return F.date(c.limite) + (c.statut === 'En cours' && c.limite < today() ? ' ' + U.badge('Dépassée', 'red') : ''); }, csv: function (c) { return c.limite; } },
      { label: 'Mieux-disant', render: function (c) { var sc = scores(c)[0]; return sc && !sc.ko ? '<span class="fin-strong">' + esc(sc.f.nom) + '</span><span class="fin-sub">' + M(sc.d.montant) + ' · note ' + F.num(sc.total, 1) + '/100</span>' : '<span class="muted">—</span>'; }, csv: function (c) { var sc = scores(c)[0]; return sc ? sc.f.nom : ''; } },
      { label: 'Statut', render: function (c) { return B(c.statut); }, csv: function (c) { return c.statut; } }
    ];
    st.coCols = cols; st.coRows = rows;
    body.innerHTML = (aLancer.length ? '<div class="card" style="margin-bottom:16px"><div class="card__h"><h3>Demandes validées à mettre en consultation</h3><span class="sub">' + aLancer.length + '</span></div><div class="list">' + aLancer.map(function (o) { return '<div class="list__item"><div class="list__icon tone-green">' + ic('check') + '</div><div class="list__body"><b>' + o.id + ' · ' + esc(o.objet) + '</b><div class="small muted">' + M(o.montant) + ' · ' + esc(E.empName(o.demandeur)) + ' · validée le ' + F.date((o.visas[o.visas.length - 1] || {}).date || o.date) + '</div></div>' + (canAchats() ? '<button class="btn sm primary" data-act="launch-co" data-id="' + o.id + '">' + ic('layers') + 'Lancer</button>' : '<button class="btn sm" data-act="da" data-id="' + o.id + '">Voir</button>') + '</div>'; }).join('') + '</div></div>' : '') +
      '<div class="card"><div class="card__h"><h3>Consultations & appels d\'offres</h3><span class="sub">notation pondérée : prix 60 % · délai 20 % · note fournisseur 20 %</span></div><div class="card__b" style="padding-bottom:4px">' + chips('coS', ['Toutes', 'En cours', 'Offres reçues', 'Attribuée', 'Infructueuse'], s) + '</div>' + U.table(cols, rows, { onRow: function (c) { openCO(c.id); }, empty: 'Aucune consultation' }) + '</div>';
  }
  function launchCO(daId) {
    var o = S.get('da', daId); if (!o) return;
    var pre = CAT_F[o.categorie] || [];
    var html = '<div class="alert tone-blue">' + ic('info') + '<div><b>' + o.id + ' · ' + esc(o.objet) + '</b><br>Montant estimé ' + F.money(o.montant) + ' — sélectionnez 2 à 4 fournisseurs à consulter.</div></div>' +
      '<div class="form-grid" style="margin-top:14px"><div class="field"><label>Mode</label><select class="select" id="co-mode"><option>' + (o.montant > 50e6 ? 'Appel d\'offres restreint' : 'Consultation restreinte') + '</option><option>Appel d\'offres ouvert</option><option>Consultation restreinte</option></select></div><div class="field"><label>Date limite de remise des offres</label><input class="input" type="date" id="co-lim" value="' + d(o.urgence === 'Normale' ? 10 : 5) + '"></div></div>' +
      '<div class="fin-checks">' + S.all('fournisseurs').map(function (f) { var al = frDocAlert(f.id).filter(function (x) { return docStatus(x).j < 0; }).length; return '<label class="fin-check"><input type="checkbox" value="' + f.id + '"' + (pre.indexOf(f.id) >= 0 ? ' checked' : '') + '><span><b>' + esc(f.nom) + '</b>' + esc(f.domaine) + ' · ' + stars(f.note) + (al ? '<br><span class="fin-red small">⚠ document administratif expiré</span>' : '') + '</span></label>'; }).join('') + '</div>';
    U.modal({ title: 'Lancer une consultation', sub: 'Les fournisseurs reçoivent le dossier de consultation (envoi simulé)', size: 'lg', body: html, actions: [{ label: 'Annuler' }, { label: 'Envoyer le dossier de consultation', cls: 'primary', icon: 'send', onClick: function (close, el) {
      var sel = E.$$('.fin-check input:checked', el).map(function (x) { return x.value; });
      if (sel.length < 2 || sel.length > 4) { U.toast('Sélectionnez entre 2 et 4 fournisseurs.', 'err'); return; }
      var c = { id: nextId('consultations', 'CO'), daId: o.id, objet: o.objet, estimation: o.montant, categorie: o.categorie, date: today(), limite: el.querySelector('#co-lim').value || d(10), mode: el.querySelector('#co-mode').value, fournisseurs: sel, devis: [], statut: 'En cours' };
      S.add('consultations', c); o.statut = 'En consultation'; o.consultationId = c.id; S.save();
      E.log('Lancement consultation', c.id + ' · ' + o.id + ' · ' + sel.length + ' fournisseurs', MOD);
      close(); U.toast('Consultation ' + c.id + ' envoyée à ' + sel.length + ' fournisseurs'); if (st.tab !== 'consultations') E.go(MOD + '/consultations'); else refresh(); setTimeout(function () { openCO(c.id); }, 60);
    } }] });
  }
  function openCO(id, fromUrl) {
    var c = S.get('consultations', id); if (!c) return;
    var sc = scores(c), best = sc.find(function (x) { return !x.ko; }), editable = c.statut === 'En cours' || c.statut === 'Offres reçues';
    var invited = '<div class="fin-box">' + c.fournisseurs.map(function (fid) { var dv = c.devis.find(function (x) { return x.fournisseur === fid; }); return '<div class="list__item" style="padding:10px 14px"><div class="list__icon ' + (dv ? 'tone-green' : 'tone-grey') + '">' + ic(dv ? 'check' : 'clock') + '</div><div class="list__body"><b>' + esc(frNom(fid)) + '</b><div class="small muted">' + (dv ? 'Offre ' + esc(dv.ref) + ' reçue le ' + F.date(dv.date) : 'Offre attendue avant le ' + F.date(c.limite)) + '</div></div>' + (!dv && editable && canAchats() ? '<button class="btn sm" data-rel="' + fid + '">' + ic('send') + 'Relancer</button>' : '') + '</div>'; }).join('') + '</div>';
    var cards = sc.length ? '<div class="fin-offers">' + sc.map(function (x) {
      var won = c.attributaire === x.d.fournisseur, isBest = best && x === best;
      return '<div class="fin-offer' + (x.ko ? ' ko' : '') + (won ? ' won' : isBest ? ' best' : '') + '">' + (won ? '<span class="fin-offer__rank">Attributaire</span>' : isBest ? '<span class="fin-offer__rank">★ Mieux-disant</span>' : x.rang ? '<span class="fin-offer__rank" style="background:#94a3b8">Rang ' + x.rang + '</span>' : '') +
        '<h5>' + esc(x.f.nom) + '</h5><div class="small muted">' + esc(x.d.ref) + ' · ' + B(x.d.conformite) + '</div>' +
        '<div class="fin-score"><b>' + (x.ko ? '—' : F.num(x.total, 1)) + '</b><span class="muted small">/ 100</span><span class="spacer"></span><b style="font-size:15px">' + M(x.d.montant) + '</b></div>' +
        '<div class="fin-meter"><span>Prix 60 %</span>' + '<div class="progress"><i style="width:' + x.sp + '%"></i></div><em>' + F.num(x.sp) + '</em></div>' +
        '<div class="fin-meter"><span>Délai 20 %</span><div class="progress"><i style="width:' + x.sd + '%"></i></div><em>' + F.num(x.sd) + '</em></div>' +
        '<div class="fin-meter"><span>Note 20 %</span><div class="progress"><i style="width:' + x.sn + '%"></i></div><em>' + F.num(x.sn) + '</em></div>' +
        '<div class="small muted">Délai ' + x.d.delai + ' j · ' + esc(x.d.conditions) + '</div>' + (x.d.commentaire ? '<div class="small" style="color:var(--ink-2)">« ' + esc(x.d.commentaire) + ' »</div>' : '') +
        (editable && canAchats() && !x.ko ? '<button class="btn sm ' + (isBest ? 'success' : '') + '" data-att="' + x.d.fournisseur + '">' + ic('check') + 'Attribuer</button>' : '') + '</div>';
    }).join('') + '</div>' : '<div class="empty">Aucune offre reçue pour le moment.</div>';
    var table = sc.length ? U.table([
      { label: 'Fournisseur', render: function (x) { return '<b>' + esc(x.f.nom) + '</b>'; } },
      { label: 'Prix HT', num: true, render: function (x) { return F.money(x.d.montant) + '<span class="fin-sub">' + (x.d.montant <= c.estimation ? '<span class="fin-green">' + F.pct((x.d.montant / c.estimation - 1) * 100, 1) + '</span>' : '<span class="fin-red">+' + F.pct((x.d.montant / c.estimation - 1) * 100, 1) + '</span>') + ' vs estimation</span>'; } },
      { label: 'Délai', num: true, render: function (x) { return x.d.delai + ' j'; } },
      { label: 'Note fourn.', num: true, render: function (x) { return F.num(x.f.note, 1) + ' / 5'; } },
      { label: 'Conformité', render: function (x) { return B(x.d.conformite); } },
      { label: 'Note pondérée', num: true, render: function (x) { return x.ko ? '<span class="fin-red">Écartée</span>' : '<b>' + F.num(x.total, 1) + '</b>'; } },
      { label: 'Rang', num: true, render: function (x) { return x.rang ? (x.rang === 1 ? U.badge('1er', 'green') : x.rang + 'e') : '—'; } }
    ], sc) : '';
    var eco = best ? c.estimation - best.d.montant : 0;
    var html = '<div class="row" style="margin-bottom:12px">' + B(c.statut) + '<span class="badge tone-grey plain">' + esc(c.mode) + '</span><span class="spacer"></span><span class="small muted">Estimation DA</span> <span class="fin-big">' + M(c.estimation) + '</span></div>' +
      (c.statut === 'Attribuée' ? '<div class="alert tone-green">' + ic('check') + '<div>Attribuée à <b>' + esc(frNom(c.attributaire)) + '</b> le ' + F.date(c.dateAttribution) + ' — bon de commande <a href="#/achats/bc/' + c.bcId + '" data-bc="' + c.bcId + '">' + c.bcId + '</a>. Économie négociée : <b>' + M(economie(c)) + '</b>.</div></div>' :
        best ? '<div class="alert tone-yellow">' + ic('star') + '<div>Mieux-disant actuel : <b>' + esc(best.f.nom) + '</b> (' + F.num(best.total, 1) + '/100) — ' + (eco >= 0 ? 'économie potentielle de <b>' + M(eco) + '</b> sur l\'estimation.' : 'dépassement de ' + M(-eco) + ' sur l\'estimation.') + '</div></div>' : '') +
      '<div class="grid g-1-2" style="margin-top:14px"><div><div class="fin-sect">' + ic('users') + 'Fournisseurs consultés</div>' + invited + '<dl class="kv" style="margin-top:12px"><dt>Demande d\'achat</dt><dd><a href="#" data-da="' + c.daId + '">' + c.daId + '</a></dd><dt>Lancée le</dt><dd>' + F.date(c.date) + '</dd><dt>Date limite</dt><dd>' + F.date(c.limite) + '</dd><dt>Catégorie</dt><dd>' + esc(c.categorie) + '</dd></dl></div>' +
      '<div><div class="fin-sect">' + ic('star') + 'Analyse des offres</div>' + cards + '</div></div>' +
      (table ? '<div class="fin-sect">' + ic('grid') + 'Tableau comparatif</div>' + table : '');
    var acts = [{ label: 'Fermer' }];
    if (editable && canAchats()) {
      acts.push({ label: 'Déclarer infructueuse', cls: 'danger', icon: 'x', onClick: function (close) { U.confirm('Consultation infructueuse', 'La demande ' + c.daId + ' repassera au statut « Validée » pour une nouvelle consultation.', 'Confirmer', function () { c.statut = 'Infructueuse'; var o = S.get('da', c.daId); if (o) { o.statut = 'Validée'; o.consultationId = null; } S.save(); E.log('Consultation infructueuse', c.id, MOD); close(); refresh(); U.toast('Consultation déclarée infructueuse'); }, 'danger'); } });
      if (c.devis.length < c.fournisseurs.length) acts.push({ label: 'Saisir un devis reçu', cls: 'primary', icon: 'plus', onClick: function (close) { close(); addDevis(c); } });
    }
    var m = U.modal({ title: c.id + ' · ' + c.objet, sub: 'Consultation fournisseurs · ' + c.fournisseurs.length + ' consultés · ' + c.devis.length + ' offre(s)', size: 'lg', body: html, actions: acts, onClose: fromUrl ? afterClose : null });
    m.body.addEventListener('click', function (e) {
      var a = e.target.closest('[data-att]'); if (a) { attribuer(c, a.dataset.att, m.close); return; }
      var r = e.target.closest('[data-rel]'); if (r) { U.toast('Relance envoyée à ' + frNom(r.dataset.rel) + ' (simulation)'); E.log('Relance fournisseur', c.id + ' · ' + frNom(r.dataset.rel), MOD); r.disabled = true; r.textContent = 'Relancé'; return; }
      var dl = e.target.closest('[data-da]'); if (dl) { e.preventDefault(); m.close(); openDA(dl.dataset.da); return; }
      var bl = e.target.closest('[data-bc]'); if (bl) { e.preventDefault(); m.close(); openBC(bl.dataset.bc); }
    });
  }
  function addDevis(c) {
    var rest = c.fournisseurs.filter(function (f) { return !c.devis.some(function (x) { return x.fournisseur === f; }); });
    U.formModal({ title: 'Saisir un devis reçu', sub: c.id + ' · ' + esc(c.objet) + ' · estimation ' + M(c.estimation), fields: [
      { name: 'fournisseur', label: 'Fournisseur', type: 'select', options: rest.map(function (f) { return { v: f, l: frNom(f) }; }), required: true },
      { name: 'ref', label: 'Référence du devis', required: true, placeholder: 'Ex. : DV-2026-118' },
      { name: 'montant', label: 'Montant HT (FCFA)', type: 'money', required: true, value: Math.round(c.estimation * 0.95) },
      { name: 'delai', label: 'Délai de livraison (jours)', type: 'number', required: true, value: 21 },
      { name: 'conditions', label: 'Conditions de paiement', type: 'select', options: CONDS },
      { name: 'conformite', label: 'Conformité technique', type: 'select', options: ['Conforme', 'Conforme avec réserves', 'Non conforme'] },
      { name: 'validite', label: 'Validité de l\'offre', type: 'date', value: d(60) },
      { name: 'commentaire', label: 'Commentaire de l\'analyse technique', type: 'textarea' }
    ], okLabel: 'Enregistrer le devis', onSubmit: function (v) {
      if (!(v.montant > 0) || !(v.delai > 0)) { U.toast('Montant et délai doivent être positifs.', 'err'); return false; }
      c.devis.push({ fournisseur: v.fournisseur, date: today(), ref: v.ref, montant: v.montant, delai: v.delai, conformite: v.conformite, conditions: v.conditions, validite: v.validite, commentaire: v.commentaire });
      if (c.devis.length >= c.fournisseurs.length) c.statut = 'Offres reçues';
      S.save(); E.log('Saisie devis', c.id + ' · ' + frNom(v.fournisseur) + ' · ' + M(v.montant), MOD); U.toast('Devis enregistré — comparatif mis à jour'); refresh(); setTimeout(function () { openCO(c.id); }, 20);
    } });
  }
  function attribuer(c, fid, closeDetail) {
    var dv = c.devis.find(function (x) { return x.fournisseur === fid; }), sc = scores(c), x = sc.find(function (s) { return s.d === dv; }), best = sc[0];
    var notBest = best && best.d !== dv;
    U.modal({ title: 'Attribuer le marché', sub: c.id, size: 'sm', body: '<p style="margin:0 0 10px">Attribuer à <b>' + esc(frNom(fid)) + '</b> pour <b>' + F.money(dv.montant) + ' HT</b> (délai ' + dv.delai + ' j, note ' + F.num(x.total, 1) + '/100).</p>' + (notBest ? '<div class="alert tone-orange">' + ic('alert') + '<div>Cette offre n\'est pas la mieux-disante. Motivez l\'attribution.</div></div>' : '') + '<div class="field" style="margin-top:10px"><label>Motivation' + (notBest ? ' *' : '') + '</label><textarea class="textarea" id="att-m">' + (notBest ? '' : 'Offre mieux-disante selon la grille de notation (prix 60 %, délai 20 %, note fournisseur 20 %).') + '</textarea></div><p class="small muted">Un bon de commande sera généré automatiquement au statut « Émis ».</p>',
      actions: [{ label: 'Annuler' }, { label: 'Attribuer et générer le BC', cls: 'success', icon: 'check', onClick: function (close, el) {
        var mot = el.querySelector('#att-m').value.trim(); if (notBest && !mot) { U.toast('Merci de motiver l\'attribution.', 'err'); return; }
        var o = S.get('da', c.daId), ratio = dv.montant / (o ? o.montant : dv.montant);
        var bc = { id: nextId('bc', 'BC'), date: today(), fournisseur: fid, daId: c.daId, consultationId: c.id, objet: c.objet, categorie: c.categorie, imputation: o ? o.imputation : '', lignes: (o ? o.lignes : [{ designation: c.objet, qte: 1, unite: 'forfait', pu: dv.montant }]).map(function (l) { return Object.assign({}, l, { pu: Math.round(l.pu * ratio), recu: 0 }); }), livraisonPrevue: d(dv.delai), conditions: dv.conditions, lieu: 'Magasin central SOGARA — Route du Dahu, Port-Gentil', acheteur: myEmp() || empIdByName('Essono'), statut: 'Émis', receptions: [], historique: [{ date: today(), statut: 'Émis' }], motivation: mot };
        var diff = dv.montant - bcHT(bc); if (bc.lignes.length && Math.abs(diff) > 0) { var l0 = bc.lignes[0]; l0.pu = Math.round(l0.pu + diff / l0.qte); }
        S.add('bc', bc);
        c.statut = 'Attribuée'; c.attributaire = fid; c.dateAttribution = today(); c.bcId = bc.id; c.motivation = mot;
        if (o) { o.statut = 'Commandée'; o.bcId = bc.id; }
        S.save(); E.log('Attribution', c.id + ' → ' + frNom(fid) + ' · ' + bc.id + ' · ' + M(dv.montant), MOD); E.notify('Bon de commande émis : ' + bc.id, frNom(fid) + ' · ' + M(dv.montant), '#/achats/bc/' + bc.id, 'blue');
        close(); closeDetail(); U.toast('Marché attribué — ' + bc.id + ' généré'); if (st.tab !== 'bc') E.go(MOD + '/bc'); else refresh(); setTimeout(function () { openBC(bc.id); }, 60);
      } }] });
  }

  /* ------------------------------------------------------------------ bons de commande */
  var BC_COLS = [
    { label: 'N°', render: function (o) { return '<span class="mono fin-strong">' + o.id + '</span><span class="fin-sub">' + F.date(o.date) + '</span>'; }, csv: function (o) { return o.id; } },
    { label: 'Fournisseur / objet', render: function (o) { return '<span class="fin-strong">' + esc(frNom(o.fournisseur)) + '</span><span class="fin-sub">' + esc(o.objet) + '</span>'; }, csv: function (o) { return frNom(o.fournisseur) + ' — ' + o.objet; } },
    { label: 'Montant HT', num: true, render: function (o) { return '<b>' + F.money(bcHT(o)) + '</b>'; }, csv: function (o) { return bcHT(o); } },
    { label: 'Livraison prévue', render: function (o) { return F.date(o.livraisonPrevue) + (bcLate(o) ? ' ' + U.badge('Retard ' + retard(o) + ' j', 'red') : ''); }, csv: function (o) { return o.livraisonPrevue; } },
    { label: 'Réception', render: function (o) { return '<div style="min-width:110px">' + U.progress(bcPct(o)) + '</div>'; }, csv: function (o) { return Math.round(bcPct(o)) + ' %'; } },
    { label: 'Statut', render: function (o) { return B(o.statut); }, csv: function (o) { return o.statut; } }
  ];
  function filteredBC() {
    var s = st.f.bcS || 'Tous', q = E.norm(st.f['bc-q'] || '');
    return bcs().filter(function (o) { return (s === 'Tous' || (s === 'En retard' ? bcLate(o) : s === 'En cours' ? OPEN.indexOf(o.statut) >= 0 : o.statut === s)) && (!q || E.norm(o.id + ' ' + o.objet + ' ' + frNom(o.fournisseur) + ' ' + (o.daId || '')).indexOf(q) >= 0); }).sort(function (a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); });
  }
  function vBC(body) {
    var open = bcs().filter(function (o) { return OPEN.indexOf(o.statut) >= 0; }), late = bcs().filter(bcLate);
    body.innerHTML = '<div class="fin-kpis" style="margin-bottom:16px">' + U.kpi({ label: 'Commandes en cours', value: open.length, icon: 'cart', tone: 'blue', foot: M(E.sum(open, bcHT)) + ' HT' }) + U.kpi({ label: 'En retard de livraison', value: late.length, icon: 'clock', tone: 'red', foot: late.length ? 'retard moyen ' + F.num(E.sum(late, retard) / late.length) + ' j' : 'aucun' }) + U.kpi({ label: 'Reste à recevoir', value: F.short(E.sum(open, function (o) { return bcHT(o) - bcRecuHT(o); })), unit: 'FCFA', icon: 'truck', tone: 'orange', foot: 'valeur HT des reliquats' }) + U.kpi({ label: 'Commandes ' + Y, value: bcs().filter(function (o) { return o.date.slice(0, 4) === String(Y); }).length, icon: 'doc', tone: 'grey', foot: M(E.sum(bcs().filter(function (o) { return o.statut !== 'Annulé'; }), bcHT)) }) + '</div>' +
      '<div class="card"><div class="card__b"><div class="filters">' + searchBox('bc-q', 'Rechercher (n°, fournisseur, objet, DA)') + '</div>' + chips('bcS', ['Tous', 'En cours', 'En retard', 'Émis', 'Confirmé', 'Partiellement reçu', 'Reçu', 'Facturé', 'Soldé', 'Annulé'], st.f.bcS || 'Tous') + '</div><div id="bc-list"></div></div>';
    function list() { var rows = filteredBC(), p = paged('bc', rows); body.querySelector('#bc-list').innerHTML = U.table(BC_COLS, p.rows, { onRow: function (o) { openBC(o.id); }, empty: 'Aucun bon de commande', footer: function () { return '<td colspan="2">' + rows.length + ' commande(s)</td><td class="num">' + F.money(E.sum(rows, bcHT)) + '</td><td colspan="3"></td>'; } }) + p.more; }
    list(); bindSearch(body, 'bc-q', list);
  }
  var BC_FLOW = ['Émis', 'Confirmé', 'Partiellement reçu', 'Reçu', 'Facturé', 'Soldé'];
  function openBC(id, fromUrl) {
    var o = S.get('bc', id); if (!o) return;
    var idx = BC_FLOW.indexOf(o.statut), ht = bcHT(o), fs = ffOfBC(o.id);
    var html = '<div class="row" style="margin-bottom:12px">' + B(o.statut) + (bcLate(o) ? U.badge('Retard de livraison : ' + retard(o) + ' j', 'red') : '') + '<span class="badge tone-grey plain">' + esc(o.categorie || '') + '</span><span class="spacer"></span><span class="fin-big">' + F.money(ht) + '</span><span class="small muted">HT</span></div>' +
      (o.statut === 'Annulé' ? '<div class="alert tone-grey">' + ic('x') + '<div>Commande annulée.</div></div>' : U.steps(BC_FLOW, Math.max(0, idx), { finished: o.statut === 'Soldé' })) +
      (bcLate(o) ? '<div class="alert tone-red">' + ic('clock') + '<div><b>Livraison attendue le ' + F.date(o.livraisonPrevue) + '</b> — pénalités contractuelles applicables : ' + F.money(Math.min(0.1, 0.005 * retard(o)) * (ht - bcRecuHT(o))) + ' à ce jour (0,5 %/j sur le reliquat).</div></div>' : '') +
      '<div class="grid g2 stack-m" style="margin-top:14px"><dl class="kv"><dt>Fournisseur</dt><dd><a href="#" data-four="' + o.fournisseur + '">' + esc(frNom(o.fournisseur)) + '</a></dd><dt>Objet</dt><dd>' + esc(o.objet) + '</dd><dt>Émis le</dt><dd>' + F.date(o.date) + '</dd><dt>Livraison prévue</dt><dd>' + F.date(o.livraisonPrevue) + '</dd><dt>Lieu</dt><dd>' + esc(o.lieu) + '</dd></dl>' +
      '<dl class="kv"><dt>Origine</dt><dd>' + (o.daId ? '<a href="#" data-da="' + o.daId + '">' + o.daId + '</a>' : 'Commande directe') + (o.consultationId ? ' · <a href="#" data-co="' + o.consultationId + '">' + o.consultationId + '</a>' : '') + '</dd><dt>Imputation</dt><dd>' + esc(o.imputation || '—') + '</dd><dt>Conditions</dt><dd>' + esc(o.conditions) + '</dd><dt>Acheteur</dt><dd>' + esc(E.empName(o.acheteur)) + '</dd><dt>Montant TTC</dt><dd>' + F.money(Math.round(ht * (1 + TVA))) + '</dd></dl></div>' +
      '<div class="fin-sect">' + ic('list') + 'Lignes de commande</div>' + U.table([
        { label: 'Désignation', render: function (l) { return esc(l.designation) + (l.articleId ? ' <span class="small muted mono">' + esc(l.articleId) + '</span>' : ''); } },
        { label: 'Commandé', num: true, render: function (l) { return F.num(l.qte) + ' ' + esc(l.unite); } },
        { label: 'Reçu', num: true, render: function (l) { return '<span class="' + ((l.recu || 0) >= l.qte ? 'fin-green' : (l.recu || 0) > 0 ? 'fin-orange' : '') + '">' + F.num(l.recu || 0) + '</span>'; } },
        { label: 'PU HT', num: true, render: function (l) { return F.money(l.pu); } },
        { label: 'Montant HT', num: true, render: function (l) { return '<b>' + F.money(l.qte * l.pu) + '</b>'; } }
      ], o.lignes, { footer: function () { return '<td colspan="4">Total HT</td><td class="num">' + F.money(ht) + '</td>'; } }) +
      '<div class="grid g2 stack-m" style="margin-top:6px"><div><div class="fin-sect">' + ic('truck') + 'Réceptions</div>' + (o.receptions.length ? '<div class="timeline">' + o.receptions.map(function (r) { return '<div class="tl-item done"><b>' + F.date(r.date) + ' · ' + esc(r.bl) + '</b><span>' + esc(r.par) + ' · ' + r.lignes.map(function (x) { return F.num(x.qte) + ' ' + esc(o.lignes[x.i].unite); }).join(' + ') + ' · ' + esc(r.conformite) + '</span>' + (r.commentaire ? '<div class="small">« ' + esc(r.commentaire) + ' »</div>' : '') + '</div>'; }).join('') + '</div>' : '<div class="muted small">Aucune réception enregistrée.</div>') + '</div>' +
      '<div><div class="fin-sect">' + ic('invoice') + 'Factures</div>' + (fs.length ? '<div class="list fin-box">' + fs.map(function (f) { return '<a class="list__item" href="#" data-ff="' + f.id + '" style="color:inherit"><div class="list__body"><b>' + f.id + '</b> · ' + esc(f.ref) + '<div class="small muted">' + F.money(ffTTC(f)) + ' TTC · échéance ' + F.date(f.echeance) + '</div></div>' + B(f.statut) + '</a>'; }).join('') + '</div>' : '<div class="muted small">Aucune facture reçue.</div>') + '</div></div>';
    var acts = [{ label: 'Aperçu du bon de commande', icon: 'print', onClick: function () { previewBC(o); } }];
    if (canAchats() && o.statut === 'Émis') acts.push({ label: 'Annuler', cls: 'danger', icon: 'x', onClick: function (close) { U.confirm('Annuler la commande', 'Le bon ' + o.id + ' sera annulé et le fournisseur informé (simulation).', 'Annuler la commande', function () { o.statut = 'Annulé'; o.historique.push({ date: today(), statut: 'Annulé' }); var da = o.daId && S.get('da', o.daId); if (da) da.statut = 'Validée'; S.save(); E.log('Annulation BC', o.id, MOD); close(); refresh(); U.toast('Commande annulée'); }, 'danger'); } });
    if (canAchats() && bcLate(o)) acts.push({ label: 'Relancer le fournisseur', icon: 'send', onClick: function () { (o.relances = o.relances || []).push({ date: stamp(), par: user().name }); S.save(); E.log('Relance retard BC', o.id + ' · ' + frNom(o.fournisseur), MOD); U.toast('Relance envoyée à ' + frNom(o.fournisseur) + ' (simulation)'); } });
    if (canAchats() && o.statut === 'Émis') acts.push({ label: 'Accusé de réception reçu', icon: 'check', onClick: function (close) { o.statut = 'Confirmé'; o.historique.push({ date: today(), statut: 'Confirmé' }); S.save(); E.log('Confirmation BC', o.id, MOD); close(); refresh(); U.toast('Commande confirmée par le fournisseur'); openBC(o.id); } });
    if (OPEN.indexOf(o.statut) >= 0 && canAchats()) acts.push({ label: 'Réceptionner', cls: 'primary', icon: 'truck', onClick: function (close) { close(); receive(o.id); } });
    if ((o.statut === 'Reçu' || o.statut === 'Partiellement reçu' || o.statut === 'Facturé') && o.lignes.some(function (l, i) { return (l.recu || 0) > factureQte(o.id, i); })) acts.push({ label: 'Saisir la facture', cls: o.statut === 'Reçu' ? 'primary' : '', icon: 'invoice', onClick: function (close) { close(); newFF(o.id); } });
    var m = U.modal({ title: o.id + ' · ' + frNom(o.fournisseur), sub: esc(o.objet), size: 'lg', body: html, actions: acts, onClose: fromUrl ? afterClose : null });
    m.body.addEventListener('click', function (e) {
      var a = e.target.closest('[data-da],[data-co],[data-ff],[data-four]'); if (!a) return; e.preventDefault(); m.close();
      if (a.dataset.da) openDA(a.dataset.da); else if (a.dataset.co) openCO(a.dataset.co); else if (a.dataset.ff) openFF(a.dataset.ff); else openFournisseur(a.dataset.four);
    });
  }
  function previewBC(o) {
    var m = U.modal({ title: 'Bon de commande ' + o.id, sub: 'Aperçu avant impression', size: 'lg', body: bcDocHTML(o), actions: [{ label: 'Fermer' }, { label: 'Envoyer au fournisseur', icon: 'send', onClick: function () { E.log('Envoi BC', o.id + ' → ' + frNom(o.fournisseur), MOD); U.toast('Bon de commande envoyé à ' + (fr(o.fournisseur).contact || frNom(o.fournisseur)) + ' (simulation)'); } }, { label: 'Imprimer / PDF', cls: 'primary', icon: 'print', onClick: function () { printModal(m); } }] });
  }
  function newBC(opt) {
    opt = opt || {}; var da = opt.da;
    var fields = [
      { name: 'fournisseur', label: 'Fournisseur', type: 'select', options: E.options('fournisseurs', function (f) { return f.nom + ' — ' + f.domaine; }), value: opt.fournisseur || (da && (CAT_F[da.categorie] || [])[0]) || 'F-001' },
      { name: 'objet', label: 'Objet', required: true, value: da ? da.objet : '', full: true },
      { name: 'categorie', label: 'Catégorie', type: 'select', options: CATS, value: da ? da.categorie : '' },
      { name: 'imputation', label: 'Imputation', type: 'select', options: imputations(), value: da ? da.imputation : '' },
      { name: 'livraisonPrevue', label: 'Livraison prévue', type: 'date', required: true, value: d(21) },
      { name: 'conditions', label: 'Conditions de paiement', type: 'select', options: CONDS },
      { name: 'motif', label: 'Justification (commande directe)', full: true, value: da ? 'Commande directe sur marché cadre — ' + da.id : 'Appel sur contrat cadre', required: true }
    ];
    var le = linesEditor('bc-le', da ? da.lignes : [], { articles: true });
    U.modal({ title: da ? 'Commande directe — ' + da.id : 'Nouveau bon de commande', sub: 'Le bon est émis au statut « Émis » et peut être imprimé immédiatement', size: 'lg', body: U.form(fields) + le.html, actions: [{ label: 'Annuler' }, { label: 'Émettre le bon de commande', cls: 'primary', icon: 'check', onClick: function (close, el) {
      var v = U.readForm(el); if (!v) return; var lignes = le.read(); if (!lignes.length) { U.toast('Ajoutez au moins une ligne.', 'err'); return; }
      var o = { id: nextId('bc', 'BC'), date: today(), fournisseur: v.fournisseur, objet: v.objet, categorie: v.categorie, imputation: v.imputation, daId: da ? da.id : null, lignes: lignes.map(function (l) { l.recu = 0; return l; }), livraisonPrevue: v.livraisonPrevue, conditions: v.conditions, lieu: 'Magasin central SOGARA — Route du Dahu, Port-Gentil', acheteur: myEmp() || empIdByName('Essono'), statut: 'Émis', receptions: [], historique: [{ date: today(), statut: 'Émis' }], motivation: v.motif };
      S.add('bc', o); if (da) { da.statut = 'Commandée'; da.bcId = o.id; S.save(); }
      E.log('Émission BC', o.id + ' · ' + frNom(o.fournisseur) + ' · ' + M(bcHT(o)), MOD); E.notify('Bon de commande émis : ' + o.id, frNom(o.fournisseur) + ' · ' + M(bcHT(o)), '#/achats/bc/' + o.id, 'blue');
      close(); U.toast('Bon de commande ' + o.id + ' émis'); if (st.tab !== 'bc') E.go(MOD + '/bc'); else refresh(); setTimeout(function () { openBC(o.id); }, 60);
    } }] });
    le.bind();
  }

  /* ------------------------------------------------------------------ réceptions */
  function vRec(body) {
    var open = bcs().filter(function (o) { return OPEN.indexOf(o.statut) >= 0; }).sort(function (a, b) { return a.livraisonPrevue.localeCompare(b.livraisonPrevue); });
    var hist = []; bcs().forEach(function (o) { o.receptions.forEach(function (r) { hist.push({ r: r, o: o }); }); }); hist.sort(function (a, b) { return b.r.date.localeCompare(a.r.date); });
    var p = paged('rc', hist);
    body.innerHTML = '<div class="card"><div class="card__h"><h3>Commandes à réceptionner</h3><span class="sub">' + open.length + ' commande(s) · triées par date de livraison prévue</span></div>' + U.table([
      { label: 'BC', render: function (o) { return '<span class="mono fin-strong">' + o.id + '</span><span class="fin-sub">' + esc(frNom(o.fournisseur)) + '</span>'; } },
      { label: 'Objet', render: function (o) { return esc(o.objet); } },
      { label: 'Livraison prévue', render: function (o) { return F.date(o.livraisonPrevue) + (bcLate(o) ? ' ' + U.badge('Retard ' + retard(o) + ' j', 'red') : E.daysBetween(today(), o.livraisonPrevue) <= 7 ? ' ' + U.badge('Cette semaine', 'blue') : ''); } },
      { label: 'Déjà reçu', render: function (o) { return '<div style="min-width:110px">' + U.progress(bcPct(o)) + '</div>'; } },
      { label: 'Statut', render: function (o) { return B(o.statut); } },
      { label: '', render: function (o) { return canAchats() ? '<button class="btn sm primary" data-act="recv" data-id="' + o.id + '">' + ic('truck') + 'Réceptionner</button>' : ''; } }
    ], open, { onRow: function (o) { openBC(o.id); }, empty: 'Aucune commande en attente de réception' }) + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Historique des réceptions</h3><span class="sub">' + hist.length + ' bon(s) de livraison</span></div>' + U.table([
        { label: 'Date', render: function (x) { return F.date(x.r.date); } },
        { label: 'BL / PV', render: function (x) { return '<span class="mono">' + esc(x.r.bl) + '</span>'; } },
        { label: 'BC · fournisseur', render: function (x) { return '<span class="fin-strong">' + x.o.id + '</span><span class="fin-sub">' + esc(frNom(x.o.fournisseur)) + '</span>'; } },
        { label: 'Quantités reçues', render: function (x) { return x.r.lignes.map(function (l) { var ln = x.o.lignes[l.i] || {}; return F.num(l.qte) + ' ' + esc(ln.unite || '') + ' · ' + esc(String(ln.designation || '').slice(0, 38)); }).join('<br>'); } },
        { label: 'Conformité', render: function (x) { return U.badge(x.r.conformite, x.r.conformite === 'Conforme' ? 'green' : 'yellow'); } },
        { label: 'Réceptionné par', render: function (x) { return esc(x.r.par); } }
      ], p.rows, { onRow: function (x) { openBC(x.o.id); } }) + p.more + '</div>';
  }
  function receive(id) {
    var o = S.get('bc', id); if (!o) return;
    var arts = S.has('articles') ? S.all('articles') : null;
    var html = '<div class="alert tone-blue">' + ic('truck') + '<div><b>' + o.id + ' · ' + esc(frNom(o.fournisseur)) + '</b><br>Saisissez les quantités effectivement livrées. Les lignes liées à un article du magasin génèrent une entrée en stock.</div></div>' +
      '<div class="form-grid" style="margin-top:14px"><div class="field"><label>N° du bon de livraison *</label><input class="input" id="rc-bl" placeholder="Ex. : BL-2026-0412"></div><div class="field"><label>Date de réception</label><input class="input" type="date" id="rc-date" value="' + today() + '"></div><div class="field"><label>Conformité</label><select class="select" id="rc-conf"><option>Conforme</option><option>Avec réserves</option></select></div><div class="field"><label>Commentaire / réserves</label><input class="input" id="rc-com" placeholder="Facultatif"></div></div>' +
      '<div class="fin-box" style="margin-top:14px"><div class="fin-rec head"><span>Ligne</span><span class="num">Commandé</span><span class="num">Déjà reçu</span><span class="num">Reçu ce jour</span></div>' +
      o.lignes.map(function (l, i) { var reste = Math.max(0, l.qte - (l.recu || 0)); return '<div class="fin-rec"><span>' + esc(l.designation) + '<span class="fin-sub">' + esc(l.unite) + ' · reste ' + F.num(reste) + '</span></span><span class="num" data-l="Commandé">' + F.num(l.qte) + '</span><span class="num" data-l="Déjà reçu">' + F.num(l.recu || 0) + '</span><label class="fin-rec__in" data-l="Reçu ce jour"><input class="input num" type="number" min="0" step="any" data-i="' + i + '" value="' + reste + '"' + (reste ? '' : ' disabled') + '></label>' +
        (arts && reste ? '<select class="select fin-le__art" data-art="' + i + '"><option value="">— Pas d\'entrée en stock —</option>' + arts.map(function (a) { return '<option value="' + a.id + '"' + (a.id === l.articleId ? ' selected' : '') + '>Entrée en stock : ' + esc(a.id + ' · ' + a.designation) + ' (stock ' + F.num(a.qte) + ')</option>'; }).join('') + '</select>' : '') + '</div>'; }).join('') + '</div>';
    U.modal({ title: 'Réception de marchandises', sub: o.id + ' · ' + esc(o.objet), size: 'lg', body: html, actions: [{ label: 'Annuler' }, { label: 'Valider la réception', cls: 'primary', icon: 'check', onClick: function (close, el) {
      var bl = el.querySelector('#rc-bl').value.trim(); if (!bl) { U.toast('Indiquez le n° du bon de livraison.', 'err'); el.querySelector('#rc-bl').style.borderColor = 'var(--red)'; return; }
      var lines = [], over = false;
      E.$$('[data-i]', el).forEach(function (inp) { var i = +inp.dataset.i, q = +inp.value || 0, l = o.lignes[i]; if (q > l.qte - (l.recu || 0) + 1e-9) over = true; if (q > 0) lines.push({ i: i, qte: q }); });
      if (!lines.length) { U.toast('Aucune quantité saisie.', 'err'); return; }
      if (over) { U.toast('Quantité reçue supérieure au reste à livrer.', 'err'); return; }
      var date = el.querySelector('#rc-date').value || today(), stockMsg = [];
      lines.forEach(function (x) {
        var l = o.lignes[x.i]; l.recu = (l.recu || 0) + x.qte;
        var sel = el.querySelector('[data-art="' + x.i + '"]'), artId = sel ? sel.value : (arts ? l.articleId : null);
        if (artId && S.has('articles')) {
          var a = S.get('articles', artId);
          if (a) { l.articleId = artId; a.qte = (+a.qte || 0) + x.qte; stockMsg.push(a.id + ' +' + F.num(x.qte));
            if (S.has('mouvementsStock')) S.all('mouvementsStock').unshift({ id: S.next('MS'), date: date, type: 'Entrée', articleId: a.id, qte: x.qte, pu: l.pu, ref: o.id, demandeur: myEmp() || empIdByName('Mengue'), commentaire: 'Réception ' + bl + ' — ' + frNom(o.fournisseur) }); }
        }
      });
      o.receptions.push({ id: 'RC-' + o.id.slice(-4) + '-' + (o.receptions.length + 1), date: date, bl: bl, par: user().name, conformite: el.querySelector('#rc-conf').value, commentaire: el.querySelector('#rc-com').value.trim(), lignes: lines });
      S.save(); recomputeBC(o); S.save();
      E.log('Réception', o.id + ' · ' + bl + ' · ' + lines.length + ' ligne(s)' + (stockMsg.length ? ' · stock ' + stockMsg.join(', ') : ''), MOD);
      E.notify('Réception enregistrée : ' + o.id, frNom(o.fournisseur) + ' · ' + o.statut, '#/achats/bc/' + o.id, 'green');
      close(); U.toast('Réception enregistrée — ' + o.statut + (stockMsg.length ? ' · entrée en stock : ' + stockMsg.join(', ') : '')); refresh(); openBC(o.id);
    } }] });
  }

  /* ------------------------------------------------------------------ factures fournisseurs */
  function vFF(body) {
    var all = ffs(), s = st.f.ffS || 'Toutes', q = E.norm(st.f['ff-q'] || '');
    var aC = all.filter(function (f) { return f.statut === 'À contrôler'; }), bap = all.filter(function (f) { return f.statut === 'Bon à payer'; }), ech = all.filter(function (f) { return f.statut !== 'Payée' && f.echeance < today(); }), pay30 = all.filter(function (f) { return f.statut === 'Payée' && f.paiement && f.paiement.date >= d(-30); });
    var kp = '<div class="fin-kpis" style="margin-bottom:16px">' + U.kpi({ label: 'À contrôler', value: aC.length, icon: 'eye', tone: 'orange', foot: aC.filter(function (f) { return !rappro(f).ok; }).length + ' avec écart · ' + M(E.sum(aC, ffTTC)) }) + U.kpi({ label: 'Bons à payer', value: bap.length, icon: 'check', tone: 'blue', foot: M(E.sum(bap, ffTTC)) + ' TTC' }) + U.kpi({ label: 'Échues non payées', value: ech.length, icon: 'alert', tone: ech.length ? 'red' : 'green', foot: ech.length ? M(E.sum(ech, ffTTC)) : 'aucune' }) + U.kpi({ label: 'Payé sur 30 jours', value: F.short(E.sum(pay30, ffTTC)), unit: 'FCFA', icon: 'money', tone: 'green', foot: pay30.length + ' règlement(s)' }) + '</div>';
    var open = all.filter(function (f) { return f.statut !== 'Payée'; }), buckets = [
      { l: 'Échues', t: 'red', f: function (f) { return f.echeance < today(); } },
      { l: 'Sous 7 jours', t: 'orange', f: function (f) { return f.echeance >= today() && f.echeance <= d(7); } },
      { l: '8 à 30 jours', t: 'blue', f: function (f) { return f.echeance > d(7) && f.echeance <= d(30); } },
      { l: 'Au-delà de 30 jours', t: 'grey', f: function (f) { return f.echeance > d(30); } }];
    var sched = '<div class="card"><div class="card__h"><h3>Échéancier des paiements</h3><span class="sub">factures non réglées · ' + M(E.sum(open, ffTTC)) + ' TTC</span></div><div class="card__b"><div class="fin-kv2" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">' + buckets.map(function (b) { var l = open.filter(b.f); return '<div><small>' + b.l + '</small><b class="' + (b.t === 'red' && l.length ? 'fin-red' : '') + '">' + M(E.sum(l, ffTTC)) + '</b><div class="small muted">' + l.length + ' facture(s)</div></div>'; }).join('') + '</div>' +
      '<div class="timeline" style="margin-top:14px">' + open.slice().sort(function (a, b) { return a.echeance.localeCompare(b.echeance); }).map(function (f) { var late = f.echeance < today(); return '<div class="tl-item ' + (late ? 'rejected' : f.statut === 'Bon à payer' ? 'current' : '') + '" data-act="ff" data-id="' + f.id + '" style="cursor:pointer"><b>' + F.date(f.echeance) + ' · ' + esc(frNom(f.fournisseur)) + ' — ' + F.money(ffTTC(f)) + '</b><span>' + f.id + ' · ' + esc(f.ref) + ' · ' + f.statut + (late ? ' · échue depuis ' + E.daysBetween(f.echeance, today()) + ' j' : '') + '</span></div>'; }).join('') + '</div></div></div>';
    var rows = all.filter(function (f) { return (s === 'Toutes' || (s === 'Échues' ? f.statut !== 'Payée' && f.echeance < today() : s === 'Avec écart' ? f.statut !== 'Payée' && !rappro(f).ok : f.statut === s)) && (!q || E.norm(f.id + ' ' + f.ref + ' ' + frNom(f.fournisseur) + ' ' + f.bcId).indexOf(q) >= 0); }).sort(function (a, b) { return b.date.localeCompare(a.date); });
    st.ffRows = rows;
    body.innerHTML = kp + '<div class="grid g-2-1"><div class="card"><div class="card__b"><div class="filters">' + searchBox('ff-q', 'Rechercher (n°, réf. fournisseur, BC)') + '</div>' + chips('ffS', ['Toutes', 'À contrôler', 'Avec écart', 'Bon à payer', 'Échues', 'Litige', 'Payée'], s) + '</div><div id="ff-list"></div></div>' + sched + '</div>';
    function list() {
      var qq = E.norm(st.f['ff-q'] || ''), r = rows.filter(function (f) { return !qq || E.norm(f.id + ' ' + f.ref + ' ' + frNom(f.fournisseur) + ' ' + f.bcId).indexOf(qq) >= 0; });
      body.querySelector('#ff-list').innerHTML = U.table(FF_COLS, r, { onRow: function (f) { openFF(f.id); }, empty: 'Aucune facture' });
    }
    list(); bindSearch(body, 'ff-q', function () { rows = all.filter(function (f) { return s === 'Toutes' || (s === 'Échues' ? f.statut !== 'Payée' && f.echeance < today() : s === 'Avec écart' ? f.statut !== 'Payée' && !rappro(f).ok : f.statut === s); }); list(); });
  }
  var FF_COLS = [
    { label: 'N°', render: function (f) { return '<span class="mono fin-strong">' + f.id + '</span><span class="fin-sub">' + esc(f.ref) + '</span>'; }, csv: function (f) { return f.id; } },
    { label: 'Fournisseur', render: function (f) { return '<span class="fin-strong">' + esc(frNom(f.fournisseur)) + '</span><span class="fin-sub">' + f.bcId + ' · reçue le ' + F.dateShort(f.date) + '</span>'; }, csv: function (f) { return frNom(f.fournisseur); } },
    { label: 'Montant TTC', num: true, render: function (f) { return '<b>' + F.money(ffTTC(f)) + '</b>'; }, csv: function (f) { return ffTTC(f); } },
    { label: 'Échéance', render: function (f) { return F.date(f.echeance) + (f.statut !== 'Payée' && f.echeance < today() ? ' ' + U.badge('Échue', 'red') : ''); }, csv: function (f) { return f.echeance; } },
    { label: '3 voies', render: function (f) { var r = rappro(f); return r.ok ? U.badge('Conforme', 'green') : U.badge('Écart ' + F.short(r.ecart), 'red'); }, csv: function (f) { return rappro(f).ok ? 'Conforme' : 'Écart'; } },
    { label: 'Statut', render: function (f) { return B(f.statut); }, csv: function (f) { return f.statut; } }
  ];
  function rapproHTML(f) {
    var r = rappro(f);
    return '<div class="fin-3w"><div><small>Commande (lignes facturées)</small><b>' + F.money(r.cmd) + '</b></div><div><small>Réception valorisée</small><b>' + F.money(r.rec) + '</b></div><div class="' + (r.ok ? '' : 'ko') + '"><small>Facture HT</small><b>' + F.money(r.fac) + '</b></div></div>' +
      (r.ok ? '<div class="alert tone-green" style="margin-bottom:12px">' + ic('check') + '<div><b>Rapprochement conforme</b> — quantités facturées ≤ quantités reçues et prix unitaires identiques à la commande.</div></div>' : '<div class="alert tone-red" style="margin-bottom:12px">' + ic('alert') + '<div><b>Écart détecté : ' + F.money(r.ecart) + ' HT</b> — ' + r.rows.filter(function (x) { return x.eQ; }).length + ' écart(s) de quantité, ' + r.rows.filter(function (x) { return x.eP; }).length + ' écart(s) de prix. Bon à payer bloqué sans dérogation.</div></div>') +
      U.table([
        { label: 'Ligne', render: function (x) { return esc(x.l.designation); } },
        { label: 'Commandé', num: true, render: function (x) { return F.num(x.l.qte) + ' × ' + F.num(x.l.pu); } },
        { label: 'Reçu (dispo.)', num: true, render: function (x) { return F.num(x.dispo) + (x.autres ? '<span class="fin-sub">' + F.num(x.autres) + ' déjà facturé</span>' : ''); } },
        { label: 'Qté facturée', num: true, cls: '', render: function (x) { return x.eQ ? '<span class="fin-red">' + F.num(x.fl.qte) + ' ▲</span>' : F.num(x.fl.qte); } },
        { label: 'PU facturé', num: true, render: function (x) { return x.eP ? '<span class="fin-red">' + F.num(x.fl.pu) + ' ▲</span>' : F.num(x.fl.pu); } },
        { label: 'Écart HT', num: true, render: function (x) { var e = x.fl.qte * x.fl.pu - Math.min(x.fl.qte, x.dispo) * x.l.pu; return Math.abs(e) > 0.5 ? '<span class="fin-red">' + F.money(e) + '</span>' : '<span class="fin-green">0</span>'; } }
      ], r.rows);
  }
  function openFF(id, fromUrl) {
    var f = S.get('facturesFournisseurs', id); if (!f) return;
    var r = rappro(f), ht = ffHT(f), late = f.statut !== 'Payée' && f.echeance < today();
    var flow = ['Reçue', 'À contrôler', 'Bon à payer', 'Payée'], idx = f.statut === 'Payée' ? 3 : f.statut === 'Bon à payer' ? 2 : 1;
    var html = '<div class="row" style="margin-bottom:12px">' + B(f.statut) + (late ? U.badge('Échue depuis ' + E.daysBetween(f.echeance, today()) + ' j', 'red') : '') + '<span class="spacer"></span><span class="fin-big">' + F.money(ffTTC(f)) + '</span><span class="small muted">TTC</span></div>' +
      U.steps(flow, idx, { rejected: f.statut === 'Litige', finished: f.statut === 'Payée' }) +
      '<div class="grid g2 stack-m" style="margin-top:12px"><dl class="kv"><dt>Fournisseur</dt><dd>' + esc(frNom(f.fournisseur)) + '</dd><dt>Réf. fournisseur</dt><dd class="mono">' + esc(f.ref) + '</dd><dt>Bon de commande</dt><dd><a href="#" data-bc="' + f.bcId + '">' + f.bcId + '</a></dd><dt>Date facture</dt><dd>' + F.date(f.date) + '</dd><dt>Échéance</dt><dd>' + F.date(f.echeance) + '</dd></dl>' +
      '<dl class="kv"><dt>Total HT</dt><dd>' + F.money(ht) + '</dd><dt>TVA 18 %</dt><dd>' + F.money(ffTTC(f) - ht) + '</dd><dt>Total TTC</dt><dd><b>' + F.money(ffTTC(f)) + '</b></dd><dt>Bon à payer</dt><dd>' + (f.bap ? esc(f.bap.par) + ' · ' + F.date(f.bap.date) + (f.bap.derogation ? '<br><span class="fin-orange small">Dérogation : ' + esc(f.bap.derogation) + '</span>' : '') : '—') + '</dd><dt>Paiement</dt><dd>' + (f.paiement ? F.date(f.paiement.date) + ' · ' + esc(f.paiement.mode) + '<br><span class="mono small">' + esc(f.paiement.ref) + '</span>' : '—') + '</dd></dl></div>' +
      (f.litige ? '<div class="alert tone-red" style="margin-top:10px">' + ic('alert') + '<div><b>Litige</b> — ' + esc(f.litige) + '</div></div>' : '') +
      '<div class="fin-sect">' + ic('layers') + 'Rapprochement à 3 voies : commande · réception · facture</div>' + rapproHTML(f) +
      '<div class="fin-sect">' + ic('clock') + 'Historique</div><div class="timeline">' + (f.historique || []).map(function (h) { return '<div class="tl-item done"><b>' + esc(h.action) + '</b><span>' + esc(h.user) + ' · ' + F.date(h.date) + '</span></div>'; }).join('') + '</div>';
    var acts = [{ label: 'Fermer' }];
    function hist(a) { (f.historique = f.historique || []).push({ date: today(), action: a, user: user().name }); }
    if (f.statut === 'À contrôler' && canFinance()) {
      acts.push({ label: 'Mettre en litige', cls: 'danger', icon: 'alert', onClick: function (close) { U.formModal({ title: 'Mettre la facture en litige', sub: f.id, fields: [{ name: 'motif', label: 'Motif communiqué au fournisseur', type: 'textarea', required: true, value: r.ok ? '' : 'Écart de ' + F.money(r.ecart) + ' HT constaté au rapprochement — merci d\'émettre un avoir.' }], okLabel: 'Mettre en litige', onSubmit: function (v) { f.statut = 'Litige'; f.litige = v.motif; hist('Mise en litige : ' + v.motif); S.save(); E.log('Litige facture fournisseur', f.id + ' · ' + v.motif, MOD); E.notify('Facture en litige : ' + f.id, frNom(f.fournisseur), '#/achats/factures/' + f.id, 'red'); close(); refresh(); U.toast('Facture mise en litige — fournisseur notifié (simulation)'); openFF(f.id); } }); } });
      if (r.ok) acts.push({ label: 'Bon à payer', cls: 'success', icon: 'check', onClick: function (close) { f.statut = 'Bon à payer'; f.bap = { par: user().name, date: today() }; hist('Bon à payer'); S.save(); E.log('Bon à payer', f.id + ' · ' + M(ffTTC(f)), MOD); E.notify('Facture bonne à payer : ' + f.id, frNom(f.fournisseur) + ' · échéance ' + F.date(f.echeance), '#/achats/factures/' + f.id, 'blue'); close(); refresh(); U.toast('Bon à payer délivré'); openFF(f.id); } });
      else acts.push({ label: 'Bon à payer avec dérogation', cls: 'primary', icon: 'check', onClick: function (close) { U.formModal({ title: 'Bon à payer avec dérogation', sub: f.id + ' · écart ' + F.money(r.ecart), fields: [{ name: 'motif', label: 'Justification de la dérogation', type: 'textarea', required: true, placeholder: 'Ex. : hausse de prix acceptée par avenant n°1' }], okLabel: 'Délivrer le bon à payer', onSubmit: function (v) { f.statut = 'Bon à payer'; f.bap = { par: user().name, date: today(), derogation: v.motif }; hist('Bon à payer avec dérogation : ' + v.motif); S.save(); E.log('Bon à payer (dérogation)', f.id + ' · ' + v.motif, MOD); close(); refresh(); U.toast('Bon à payer délivré avec dérogation'); openFF(f.id); } }); } });
    }
    if (f.statut === 'À contrôler' && !canFinance()) acts.push({ label: 'Bon à payer : profil « finance »', icon: 'lock', onClick: function () { U.toast('Le bon à payer est délivré par la Direction financière (profil « finance »).', 'err'); } });
    if (f.statut === 'Litige' && (canFinance() || canAchats())) acts.push({ label: 'Avoir reçu — corriger la facture', cls: 'primary', icon: 'edit', onClick: function (close) { close(); correctFF(f); } });
    if (f.statut === 'Bon à payer' && canFinance()) acts.push({ label: 'Enregistrer le paiement', cls: 'success', icon: 'money', onClick: function (close) {
      U.formModal({ title: 'Paiement de la facture', sub: f.id + ' · ' + frNom(f.fournisseur) + ' · ' + F.money(ffTTC(f)), fields: [{ name: 'date', label: 'Date de paiement', type: 'date', value: today(), required: true }, { name: 'mode', label: 'Mode', type: 'select', options: ['Virement', 'Chèque'] }, { name: 'banque', label: 'Banque', type: 'select', options: ['BGFIBank Gabon', 'UGB', 'Orabank Gabon', 'BICIG'] }, { name: 'ref', label: 'Référence du paiement', required: true, value: 'VIR-' + today().replace(/-/g, '').slice(2) + '-' + String(Math.floor(Math.random() * 900) + 100) }], okLabel: 'Valider le paiement', onSubmit: function (v) {
        f.statut = 'Payée'; f.paiement = { date: v.date, mode: v.mode, ref: v.ref, banque: v.banque }; hist('Paiement ' + v.mode + ' — ' + v.ref + ' (' + v.banque + ')'); S.save(); recomputeBC(S.get('bc', f.bcId)); S.save();
        E.log('Paiement fournisseur', f.id + ' · ' + frNom(f.fournisseur) + ' · ' + F.money(ffTTC(f)) + ' · ' + v.ref, MOD); E.notify('Facture payée : ' + f.id, frNom(f.fournisseur) + ' · ' + M(ffTTC(f)), '#/achats/factures/' + f.id, 'green');
        close(); refresh(); U.toast('Paiement enregistré — facture soldée'); openFF(f.id);
      } });
    } });
    var m = U.modal({ title: f.id + ' · ' + frNom(f.fournisseur), sub: 'Facture fournisseur ' + esc(f.ref), size: 'lg', body: html, actions: acts, onClose: fromUrl ? afterClose : null });
    m.body.addEventListener('click', function (e) { var a = e.target.closest('[data-bc]'); if (a) { e.preventDefault(); m.close(); openBC(a.dataset.bc); } });
  }
  function ffLinesForm(o, lignes, exceptId) {
    return '<div class="fin-box" style="margin-top:14px"><div class="fin-rec head" style="grid-template-columns:minmax(0,1fr) 90px 110px 130px"><span>Ligne du BC</span><span class="num">Reçu non facturé</span><span class="num">Qté facturée</span><span class="num">PU facturé</span></div>' +
      o.lignes.map(function (l, i) { var dispo = Math.max(0, (l.recu || 0) - factureQte(o.id, i, exceptId)), cur = lignes ? lignes.find(function (x) { return x.i === i; }) : null; return '<div class="fin-rec" style="grid-template-columns:minmax(0,1fr) 90px 110px 130px"><span>' + esc(l.designation) + '<span class="fin-sub">BC : ' + F.num(l.qte) + ' ' + esc(l.unite) + ' × ' + F.num(l.pu) + '</span></span><span class="num" data-l="Reçu non facturé">' + F.num(dispo) + '</span><label class="fin-rec__in" data-l="Qté facturée"><input class="input num" type="number" min="0" step="any" data-q="' + i + '" value="' + (cur ? cur.qte : dispo) + '"></label><label class="fin-rec__in" data-l="PU facturé"><input class="input num" type="number" min="0" step="any" data-p="' + i + '" value="' + (cur ? cur.pu : l.pu) + '"></label></div>'; }).join('') + '</div>';
  }
  function readFFLines(el) { return E.$$('[data-q]', el).map(function (q) { var i = +q.dataset.q; return { i: i, qte: +q.value || 0, pu: +el.querySelector('[data-p="' + i + '"]').value || 0 }; }).filter(function (x) { return x.qte > 0; }); }
  function newFF(bcId) {
    var eligible = bcs().filter(function (o) { return o.lignes.some(function (l, i) { return (l.recu || 0) > factureQte(o.id, i); }); });
    if (!eligible.length) { U.toast('Aucune commande réceptionnée en attente de facture.', 'err'); return; }
    var o = S.get('bc', bcId) || eligible[0];
    var html = '<div class="form-grid"><div class="field full"><label>Bon de commande</label><select class="select" id="ff-bc">' + eligible.map(function (x) { return '<option value="' + x.id + '"' + (x.id === o.id ? ' selected' : '') + '>' + x.id + ' · ' + esc(frNom(x.fournisseur)) + ' · ' + esc(x.objet) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Référence de la facture fournisseur *</label><input class="input" id="ff-ref" placeholder="Ex. : FAC-2026-1188"></div><div class="field"><label>Date de facture</label><input class="input" type="date" id="ff-date" value="' + today() + '"></div><div class="field"><label>Échéance</label><input class="input" type="date" id="ff-ech" value="' + d(30) + '"></div></div><div id="ff-lines"></div><p class="small muted" style="margin:10px 0 0">Les quantités sont proposées à partir des réceptions non encore facturées ; saisissez les prix figurant sur la facture : le rapprochement signalera tout écart.</p>';
    var m = U.modal({ title: 'Enregistrer une facture fournisseur', sub: 'Saisie à partir du bon de commande — contrôle à 3 voies automatique', size: 'lg', body: html, actions: [{ label: 'Annuler' }, { label: 'Enregistrer la facture', cls: 'primary', icon: 'check', onClick: function (close, el) {
      var ref = el.querySelector('#ff-ref').value.trim(); if (!ref) { U.toast('Indiquez la référence de la facture.', 'err'); return; }
      var b = S.get('bc', el.querySelector('#ff-bc').value), lignes = readFFLines(el); if (!lignes.length) { U.toast('Aucune ligne facturée.', 'err'); return; }
      var f = { id: nextId('facturesFournisseurs', 'FF'), bcId: b.id, fournisseur: b.fournisseur, ref: ref, date: el.querySelector('#ff-date').value || today(), echeance: el.querySelector('#ff-ech').value || d(30), statut: 'À contrôler', lignes: lignes, historique: [{ date: today(), action: 'Facture reçue et enregistrée', user: user().name }] };
      S.add('facturesFournisseurs', f); recomputeBC(b); S.save();
      var r = rappro(f); E.log('Saisie facture fournisseur', f.id + ' · ' + ref + ' · ' + M(ffTTC(f)) + (r.ok ? '' : ' · ÉCART ' + M(r.ecart)), MOD);
      E.notify('Facture fournisseur à contrôler : ' + f.id, frNom(b.fournisseur) + ' · ' + M(ffTTC(f)) + (r.ok ? '' : ' · écart détecté'), '#/achats/factures/' + f.id, r.ok ? 'blue' : 'red');
      close(); U.toast(r.ok ? 'Facture enregistrée — rapprochement conforme' : 'Facture enregistrée — écart de ' + M(r.ecart) + ' signalé', r.ok ? 'ok' : 'err'); if (st.tab !== 'factures') E.go(MOD + '/factures'); else refresh(); setTimeout(function () { openFF(f.id); }, 60);
    } }] });
    function fill() { var b = S.get('bc', m.el.querySelector('#ff-bc').value); m.el.querySelector('#ff-lines').innerHTML = ffLinesForm(b); var dd = b.conditions.indexOf('45') >= 0 ? 45 : b.conditions.indexOf('60') >= 0 ? 60 : b.conditions.indexOf('réception') >= 0 ? 0 : 30; m.el.querySelector('#ff-ech').value = E.addDays(m.el.querySelector('#ff-date').value || today(), dd); }
    fill(); m.el.querySelector('#ff-bc').onchange = fill;
  }
  function correctFF(f) {
    var o = S.get('bc', f.bcId);
    U.modal({ title: 'Corriger la facture (avoir reçu)', sub: f.id + ' · ' + esc(f.ref), size: 'lg', body: '<div class="field"><label>Référence de l\'avoir</label><input class="input" id="av-ref" placeholder="Ex. : AV-2026-0042"></div>' + ffLinesForm(o, f.lignes, f.id), actions: [{ label: 'Annuler' }, { label: 'Enregistrer et remettre en contrôle', cls: 'primary', icon: 'check', onClick: function (close, el) {
      f.lignes = readFFLines(el); f.statut = 'À contrôler'; f.litige = null; (f.historique = f.historique || []).push({ date: today(), action: 'Avoir ' + (el.querySelector('#av-ref').value || '') + ' — facture corrigée', user: user().name });
      S.save(); E.log('Correction facture fournisseur', f.id, MOD); close(); refresh(); U.toast(rappro(f).ok ? 'Facture corrigée — rapprochement conforme' : 'Facture corrigée — écart persistant', rappro(f).ok ? 'ok' : 'err'); openFF(f.id);
    } }] });
  }

  /* ------------------------------------------------------------------ fournisseurs */
  function vFour(body) {
    var q = E.norm(st.f['fo-q'] || '');
    body.innerHTML = '<div class="filters">' + searchBox('fo-q', 'Rechercher un fournisseur, un domaine, une ville') + '</div><div class="fin-cards" id="fo-list"></div>';
    function list() {
      var qq = E.norm(st.f['fo-q'] || '');
      body.querySelector('#fo-list').innerHTML = S.all('fournisseurs').filter(function (f) { return !qq || E.norm(f.nom + ' ' + f.domaine + ' ' + f.ville).indexOf(qq) >= 0; }).map(function (f) {
        var e = evalOf(f.id), al = frDocAlert(f.id), exp = al.filter(function (x) { return docStatus(x).j < 0; }).length, nb = bcs().filter(function (o) { return o.fournisseur === f.id; }).length;
        return '<div class="card fin-card" data-act="four" data-id="' + f.id + '"><div class="card__b"><div class="fin-card__top">' + U.avatar(f.nom) + '<div style="min-width:0"><b>' + esc(f.nom) + '</b><span class="small muted">' + esc(f.domaine) + ' · ' + esc(f.ville) + '</span></div></div>' +
          '<div class="row" style="gap:8px">' + stars(evalScore(e)) + '<b>' + F.num(evalScore(e), 1) + '</b><span class="spacer"></span>' + (exp ? U.badge(exp + ' document expiré', 'red') : al.length ? U.badge('Document à renouveler', 'orange') : U.badge('Dossier à jour', 'green')) + '</div>' +
          '<div class="fin-meter"><span>Qualité</span><div class="progress green"><i style="width:' + e.qualite * 20 + '%"></i></div><em>' + F.num(e.qualite, 1) + '</em></div><div class="fin-meter"><span>Délais</span><div class="progress"><i style="width:' + e.delais * 20 + '%"></i></div><em>' + F.num(e.delais, 1) + '</em></div><div class="fin-meter"><span>HSE</span><div class="progress orange"><i style="width:' + e.hse * 20 + '%"></i></div><em>' + F.num(e.hse, 1) + '</em></div>' +
          '<div class="fin-kv2"><div><small>Volume ' + Y + '</small><b>' + M(volume(f.id)) + '</b></div><div><small>Commandes suivies</small><b>' + nb + '</b></div></div></div></div>';
      }).join('') || '<div class="empty">Aucun fournisseur</div>';
    }
    list(); bindSearch(body, 'fo-q', list);
  }
  function openFournisseur(id, fromUrl) {
    var f = S.get('fournisseurs', id); if (!f) return; var e = evalOf(id);
    var hist = bcs().filter(function (o) { return o.fournisseur === id; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
    var fs = ffs().filter(function (x) { return x.fournisseur === id; });
    var html = '<div class="grid g2 stack-m"><dl class="kv"><dt>Domaine</dt><dd>' + esc(f.domaine) + '</dd><dt>Ville</dt><dd>' + esc(f.ville) + '</dd><dt>Interlocuteur</dt><dd>' + esc(e.interlocuteur || '—') + '<br><span class="small muted">' + esc(e.tel || '') + ' · ' + esc(f.contact || '') + '</span></dd><dt>Identifiants</dt><dd class="small">' + esc(e.nif || '') + '<br>' + esc(e.rccm || '') + '</dd><dt>Délai moyen annoncé</dt><dd>' + f.delai + ' jours</dd></dl>' +
      '<div><div class="row" style="margin-bottom:8px">' + stars(evalScore(e)) + '<span class="fin-big">' + F.num(evalScore(e), 1) + '</span><span class="muted small">/ 5 · évaluation globale</span></div>' +
      '<div class="fin-meter"><span>Qualité</span><div class="progress green"><i style="width:' + e.qualite * 20 + '%"></i></div><em>' + F.num(e.qualite, 1) + '</em></div><div class="fin-meter"><span>Délais</span><div class="progress"><i style="width:' + e.delais * 20 + '%"></i></div><em>' + F.num(e.delais, 1) + '</em></div><div class="fin-meter"><span>HSE</span><div class="progress orange"><i style="width:' + e.hse * 20 + '%"></i></div><em>' + F.num(e.hse, 1) + '</em></div>' +
      (e.commentaire ? '<p class="small" style="color:var(--ink-2)">« ' + esc(e.commentaire) + ' »</p>' : '') +
      '<div class="fin-kv2"><div><small>Volume d\'achats ' + Y + '</small><b>' + M(volume(id)) + '</b></div><div><small>Factures en attente</small><b>' + M(E.sum(fs.filter(function (x) { return x.statut !== 'Payée'; }), ffTTC)) + '</b></div></div></div></div>' +
      '<div class="fin-sect">' + ic('file') + 'Documents administratifs</div>' + U.table([
        { label: 'Document', render: function (dc) { return '<b>' + esc(dc.type) + '</b>'; } }, { label: 'Numéro', render: function (dc) { return '<span class="mono">' + esc(dc.numero) + '</span>'; } },
        { label: 'Expiration', render: function (dc) { return F.date(dc.expiration); } }, { label: 'État', render: function (dc) { var s = docStatus(dc); return U.badge(s.l, s.t); } },
        { label: '', render: function (dc, i) { return canAchats() ? '<button class="btn sm" data-doc="' + esc(dc.type) + '">' + ic('refresh') + 'Renouveler</button>' : ''; } }
      ], e.docs || []) +
      '<div class="fin-sect">' + ic('cart') + 'Historique des commandes</div>' + U.table([
        { label: 'BC', render: function (o) { return '<span class="mono fin-strong">' + o.id + '</span>'; } }, { label: 'Date', render: function (o) { return F.date(o.date); } }, { label: 'Objet', render: function (o) { return esc(o.objet); } },
        { label: 'Montant HT', num: true, render: function (o) { return F.money(bcHT(o)); } }, { label: 'Ponctualité', render: function (o) { return bcLate(o) ? U.badge('Retard ' + retard(o) + ' j', 'red') : o.receptions.length ? (o.receptions[0].date <= o.livraisonPrevue ? U.badge('À l\'heure', 'green') : U.badge('Livré en retard', 'orange')) : '<span class="muted small">En attente</span>'; } },
        { label: 'Statut', render: function (o) { return B(o.statut); } }
      ], hist, { empty: 'Aucune commande sur la période détaillée' });
    var acts = [{ label: 'Fermer' }];
    if (canAchats()) {
      acts.push({ label: 'Évaluer', icon: 'star', onClick: function (close) { U.formModal({ title: 'Évaluation du fournisseur', sub: f.nom, fields: [{ name: 'qualite', label: 'Qualité (1 à 5)', type: 'number', step: '0.1', min: 1, value: e.qualite, required: true }, { name: 'delais', label: 'Respect des délais (1 à 5)', type: 'number', step: '0.1', min: 1, value: e.delais, required: true }, { name: 'hse', label: 'HSE (1 à 5)', type: 'number', step: '0.1', min: 1, value: e.hse, required: true }, { name: 'commentaire', label: 'Commentaire', type: 'textarea', value: e.commentaire }], onSubmit: function (v) {
        var cl = function (x) { return Math.max(1, Math.min(5, +x)); }; var ev = S.get('evalFournisseurs', id); if (!ev) { ev = Object.assign({}, e); S.all('evalFournisseurs').push(ev); }
        Object.assign(ev, { qualite: cl(v.qualite), delais: cl(v.delais), hse: cl(v.hse), commentaire: v.commentaire }); f.note = Math.round(evalScore(ev) * 10) / 10; S.save(); E.log('Évaluation fournisseur', f.nom + ' · ' + F.num(f.note, 1) + '/5', MOD); close(); refresh(); U.toast('Évaluation enregistrée'); openFournisseur(id);
      } }); } });
      acts.push({ label: 'Nouveau bon de commande', cls: 'primary', icon: 'cart', onClick: function (close) { close(); newBC({ fournisseur: id }); } });
    }
    var m = U.modal({ title: f.nom, sub: esc(f.domaine) + ' · ' + esc(f.ville) + ' · ' + f.id, size: 'lg', body: html, actions: acts, onClose: fromUrl ? afterClose : null });
    m.body.addEventListener('click', function (ev2) {
      var b = ev2.target.closest('[data-doc]'); if (!b) return; var type = b.dataset.doc;
      U.formModal({ title: 'Renouveler : ' + type, sub: f.nom, fields: [{ name: 'numero', label: 'Numéro', required: true }, { name: 'expiration', label: 'Nouvelle date d\'expiration', type: 'date', value: d(type.indexOf('fiscale') >= 0 ? 180 : 365), required: true }], onSubmit: function (v) {
        var ev = S.get('evalFournisseurs', id); var dc = ev && ev.docs.find(function (x) { return x.type === type; }); if (dc) { dc.numero = v.numero; dc.expiration = v.expiration; S.save(); }
        E.log('Renouvellement document fournisseur', f.nom + ' · ' + type, MOD); m.close(); refresh(); U.toast('Document mis à jour'); openFournisseur(id);
      } });
    });
  }

  /* ------------------------------------------------------------------ export */
  function exportTab() {
    if (st.tab === 'da') U.exportCSV('demandes-achat-' + today(), [{ label: 'N°', key: 'id' }, { label: 'Date', key: 'date' }, { label: 'Objet', key: 'objet' }, { label: 'Demandeur', csv: function (o) { return E.empName(o.demandeur); } }, { label: 'Direction', key: 'direction' }, { label: 'Catégorie', key: 'categorie' }, { label: 'Imputation', key: 'imputation' }, { label: 'Urgence', key: 'urgence' }, { label: 'Montant estimé', key: 'montant' }, { label: 'Statut', key: 'statut' }], filteredDA());
    else if (st.tab === 'bc') U.exportCSV('bons-de-commande-' + today(), [{ label: 'N°', key: 'id' }, { label: 'Date', key: 'date' }, { label: 'Fournisseur', csv: function (o) { return frNom(o.fournisseur); } }, { label: 'Objet', key: 'objet' }, { label: 'Montant HT', csv: bcHT }, { label: 'Livraison prévue', key: 'livraisonPrevue' }, { label: 'Reçu %', csv: function (o) { return Math.round(bcPct(o)); } }, { label: 'Statut', key: 'statut' }, { label: 'DA', key: 'daId' }], filteredBC());
    else if (st.tab === 'factures') U.exportCSV('factures-fournisseurs-' + today(), [{ label: 'N°', key: 'id' }, { label: 'Réf. fournisseur', key: 'ref' }, { label: 'Fournisseur', csv: function (f) { return frNom(f.fournisseur); } }, { label: 'BC', key: 'bcId' }, { label: 'Date', key: 'date' }, { label: 'Échéance', key: 'echeance' }, { label: 'HT', csv: ffHT }, { label: 'TTC', csv: ffTTC }, { label: 'Rapprochement', csv: function (f) { return rappro(f).ok ? 'Conforme' : 'Écart'; } }, { label: 'Statut', key: 'statut' }], st.ffRows || ffs());
    else if (st.tab === 'consultations') U.exportCSV('consultations-' + today(), st.coCols, st.coRows || cos());
    else if (st.tab === 'fournisseurs') U.exportCSV('fournisseurs-' + today(), [{ label: 'Code', key: 'id' }, { label: 'Nom', key: 'nom' }, { label: 'Domaine', key: 'domaine' }, { label: 'Ville', key: 'ville' }, { label: 'Note', csv: function (f) { return F.num(evalScore(evalOf(f.id)), 1); } }, { label: 'Volume ' + Y, csv: function (f) { return Math.round(volume(f.id)); } }, { label: 'Documents à renouveler', csv: function (f) { return frDocAlert(f.id).map(function (x) { return x.type; }).join(', '); } }], S.all('fournisseurs'));
  }

  /* ------------------------------------------------------------------ intégration tableau de bord / recherche */
  function pending(u) {
    var p = (u || {}).profile, out = [];
    if (!p) return out;
    das().forEach(function (o) {
      if (o.statut !== 'En validation') return; var nx = daNext(o);
      if (PROFILE_STEP[p] === nx) out.push({ title: o.id + ' · ' + o.objet, sub: M(o.montant) + ' · demandé par ' + E.empName(o.demandeur) + ' · visa ' + STEP[nx].label.toLowerCase(), date: o.date, href: '#/achats/da/' + o.id, tone: o.urgence === 'Normale' ? 'orange' : 'red' });
    });
    if (p === 'achats') {
      das().filter(function (o) { return o.statut === 'Validée'; }).forEach(function (o) { out.push({ title: o.id + ' · à mettre en consultation', sub: o.objet + ' · ' + M(o.montant), date: o.date, href: '#/achats/da/' + o.id, tone: 'green' }); });
      cos().filter(function (c) { return c.statut === 'Offres reçues'; }).forEach(function (c) { out.push({ title: c.id + ' · offres à analyser et attribuer', sub: c.objet + ' · ' + c.devis.length + ' offres', date: c.limite, href: '#/achats/consultations/' + c.id, tone: 'violet' }); });
    }
    if (p === 'finance') {
      ffs().filter(function (f) { return f.statut === 'À contrôler'; }).forEach(function (f) { var r = rappro(f); out.push({ title: f.id + ' · bon à payer', sub: frNom(f.fournisseur) + ' · ' + M(ffTTC(f)) + (r.ok ? ' · rapprochement conforme' : ' · écart ' + M(r.ecart)), date: f.date, href: '#/achats/factures/' + f.id, tone: r.ok ? 'blue' : 'red' }); });
      ffs().filter(function (f) { return f.statut === 'Bon à payer' && f.echeance <= d(7); }).forEach(function (f) { out.push({ title: f.id + ' · paiement à effectuer', sub: frNom(f.fournisseur) + ' · ' + M(ffTTC(f)) + ' · échéance ' + F.date(f.echeance), date: f.echeance, href: '#/achats/factures/' + f.id, tone: f.echeance < today() ? 'red' : 'orange' }); });
    }
    return out;
  }
  function search(q) {
    var out = [];
    das().forEach(function (o) { if (E.norm(o.id + ' ' + o.objet + ' ' + E.empName(o.demandeur)).indexOf(q) >= 0) out.push({ title: o.id + ' · ' + o.objet, sub: 'Demande d\'achat · ' + o.statut + ' · ' + M(o.montant), href: '#/achats/da/' + o.id }); });
    bcs().forEach(function (o) { if (E.norm(o.id + ' ' + o.objet + ' ' + frNom(o.fournisseur)).indexOf(q) >= 0) out.push({ title: o.id + ' · ' + frNom(o.fournisseur), sub: 'Bon de commande · ' + o.objet + ' · ' + o.statut, href: '#/achats/bc/' + o.id }); });
    ffs().forEach(function (f) { if (E.norm(f.id + ' ' + f.ref + ' ' + frNom(f.fournisseur)).indexOf(q) >= 0) out.push({ title: f.id + ' · ' + frNom(f.fournisseur), sub: 'Facture fournisseur ' + f.ref + ' · ' + f.statut, href: '#/achats/factures/' + f.id }); });
    cos().forEach(function (c) { if (E.norm(c.id + ' ' + c.objet).indexOf(q) >= 0) out.push({ title: c.id + ' · ' + c.objet, sub: 'Consultation · ' + c.statut, href: '#/achats/consultations/' + c.id }); });
    S.all('fournisseurs').forEach(function (f) { if (E.norm(f.nom + ' ' + f.domaine).indexOf(q) >= 0) out.push({ title: f.nom, sub: 'Fournisseur · ' + f.domaine, href: '#/achats/fournisseurs/' + f.id }); });
    return out;
  }
  function summary() {
    var pend = das().filter(function (o) { return o.statut === 'En validation'; }), open = bcs().filter(function (o) { return OPEN.indexOf(o.statut) >= 0; }), late = bcs().filter(bcLate);
    var tc = ffs().filter(function (f) { return f.statut === 'À contrôler' || f.statut === 'Bon à payer'; });
    return [
      { label: 'Demandes d\'achat à viser', value: String(pend.length), icon: 'inbox', tone: 'orange', foot: M(E.sum(pend, 'montant')), href: '#/achats/da' },
      { label: 'Commandes en cours', value: String(open.length), icon: 'cart', tone: 'blue', foot: late.length + ' en retard de livraison', href: '#/achats/bc' },
      { label: 'Factures fournisseurs à traiter', value: String(tc.length), icon: 'invoice', tone: 'violet', foot: M(E.sum(tc, ffTTC)) + ' TTC', href: '#/achats/factures' }
    ];
  }

  E.register({
    id: MOD, label: 'Achats', title: 'Achats & approvisionnements', icon: 'cart', group: 'Finances & Achats', roles: ['achats', 'finance'],
    seed: seed, render: render, pending: pending, search: search, summary: summary,
    badge: function () { return pending(E.session.user()).length; },
    init: function () { if (S.has('bc')) bcs().forEach(recomputeBC); }
  });
})();
