/* SOGARA · Espace de gestion — module « Maintenance & arrêts techniques » (GMAO).
   Collections : equipements, ordres (OT), arrets (arrêts techniques), gammes (plans préventifs). */
(function () {
  'use strict';
  var E = window.ERP, S = E.store, U = E.ui, F = E.fmt, esc = E.esc;
  var M = function (i) { return 'MAT-' + (1041 + i * 7); };
  var STEPS = ['Demandé', 'Approuvé', 'Planifié', 'En cours', 'Terminé', 'Clôturé'];
  var ST_TONE = { 'Demandé': 'orange', 'Approuvé': 'yellow', 'Planifié': 'violet', 'En cours': 'blue', 'Terminé': 'green', 'Clôturé': 'grey', 'Annulé': 'red' };
  var PRIO_TONE = { 'Urgente': 'red', 'Haute': 'orange', 'Normale': 'blue', 'Basse': 'grey' };
  var TYPES = ['Préventif', 'Correctif', 'Amélioration', 'Inspection réglementaire'];
  var TYPE_COL = { 'Préventif': '#1e9e4a', 'Correctif': '#e8780c', 'Amélioration': '#2563eb', 'Inspection réglementaire': '#7c3aed' };
  var PERMIS = ['Permis de travail à froid', 'Permis de feu', 'Espace confiné', 'Travail en hauteur', 'Consignation électrique', 'Consignation mécanique', 'Fouille / excavation', 'Levage'];
  var CRIT_TONE = { A: 'red', B: 'orange', C: 'grey' };
  var EQ_TONE = { 'En service': 'green', 'Secours': 'blue', 'En maintenance': 'orange', 'À l\'arrêt': 'red' };
  var cur = { view: null, params: [] }, otMode = 'liste';
  var fOT = { st: 'ouverts', type: '', prio: '', unite: '', q: '' }, fEQ = { unite: '', crit: '', q: '', alerte: false };

  function today() { return E.today(); }
  function OT() { return S.all('ordres'); }
  function EQ() { return S.all('equipements'); }
  function eq(id) { return S.get('equipements', id); }
  function isOpen(o) { return ['Terminé', 'Clôturé', 'Annulé'].indexOf(o.statut) < 0; }
  function echue(e) { return e.prochaineInspection && e.prochaineInspection < today(); }
  function stB(s) { return U.badge(s, ST_TONE[s] || 'grey'); }
  function prB(p) { return U.badge(p, PRIO_TONE[p] || 'grey'); }
  function crB(c) { return '<span class="badge plain mnt-crit tone-' + CRIT_TONE[c] + '">' + c + '</span>'; }
  function techs() { return S.all('employes').filter(function (e) { return e.direction === 'MAINT'; }); }
  function techOpts() { return techs().map(function (e) { return { v: e.id, l: e.nom + ' — ' + e.poste }; }); }
  function eqOpts() { return EQ().map(function (e) { return { v: e.id, l: e.id + ' — ' + e.designation }; }); }
  function me() { var u = E.session.user(); return u ? u.name : 'Système'; }
  function nextOT() { var n = OT().reduce(function (m, o) { return Math.max(m, +String(o.id).split('-')[2] || 0); }, 400) + 1; return 'OT-2026-' + String(n).padStart(4, '0'); }
  function refresh() { if (cur.view) { var y = window.scrollY; render(cur.view, cur.params); window.scrollTo(0, y); } E.renderBadges(); }
  function dur(t) { return Math.max(1, E.daysBetween(t.s, t.e) + 1); }
  function arrAv(a) { var L = a.lots || []; if (!L.length) return 0; return Math.round(E.sum(L, function (l) { return (+l.p || 0) * dur(l); }) / E.sum(L, dur)); }
  function monday(d) { var x = E.parseDate(d), k = (x.getDay() + 6) % 7; return E.addDays(x, -k); }
  function weekNo(d) { var x = E.parseDate(d); x = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())); var day = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - day); var y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - y0) / 864e5 + 1) / 7); }

  /* ------------------------------------------------------------------ données d'exemple */
  function seed() {
    var Q = [
      ['P-101A', 'Pompe de charge brut', 'Pompe centrifuge', 'U100', 'A', '2026-03-12', 6, 41250, 'En service', 4200, 97.8, false, 1998],
      ['P-101B', 'Pompe de charge brut (secours)', 'Pompe centrifuge', 'U100', 'A', '2026-04-02', 6, 18400, 'Secours', 5100, 99.1, false, 1998],
      ['C-101', 'Colonne de distillation atmosphérique', 'Colonne', 'U100', 'A', '2023-03-20', 48, 186000, 'En service', 26000, 99.6, true, 1967],
      ['F-101', 'Four de préchauffe du brut', 'Four', 'U100', 'A', '2025-05-10', 18, 172300, 'En service', 9800, 98.7, true, 1967],
      ['E-104', 'Échangeur brut / résidu atmosphérique', 'Échangeur', 'U100', 'B', '2025-10-05', 12, 93500, 'En service', 7300, 98.2, true, 2004],
      ['V-102', 'Ballon de reflux de tête', 'Ballon', 'U100', 'B', '2024-09-20', 24, 150000, 'En service', 30000, 99.9, true, 1967],
      ['P-201A', 'Pompe d\'alimentation hydrotraitement', 'Pompe centrifuge', 'U200', 'B', '2026-05-18', 6, 38800, 'En service', 3900, 97.1, false, 2001],
      ['K-201', 'Compresseur d\'hydrogène d\'appoint', 'Compresseur alternatif', 'U200', 'A', '2026-02-10', 6, 52100, 'En service', 3100, 96.4, false, 1995],
      ['R-201', 'Réacteur d\'hydrotraitement naphta', 'Réacteur', 'U200', 'A', '2023-03-25', 48, 118000, 'En service', 40000, 99.8, true, 1979],
      ['R-301', 'Réacteurs de reformage (train de 3)', 'Réacteur', 'U300', 'A', '2026-09-25', 48, 104000, 'En maintenance', 38000, 99.5, true, 1979],
      ['F-301', 'Four de reformage', 'Four', 'U300', 'A', '2025-03-15', 18, 98000, 'En maintenance', 8800, 97.9, true, 1979],
      ['K-301', 'Compresseur de recyclage d\'hydrogène', 'Compresseur centrifuge', 'U300', 'A', '2025-09-30', 12, 61500, 'En maintenance', 6200, 97.6, false, 1979],
      ['E-305', 'Aéroréfrigérant effluent réacteurs', 'Aéroréfrigérant', 'U300', 'B', '2025-11-12', 12, 70500, 'En service', 8900, 98.9, false, 1990],
      ['V-301', 'Ballon séparateur haute pression', 'Ballon', 'U300', 'B', '2026-09-25', 24, 104000, 'En maintenance', 35000, 99.9, true, 1979],
      ['P-401', 'Pompe d\'expédition kérosène', 'Pompe centrifuge', 'U400', 'C', '2026-06-10', 6, 22600, 'En service', 5600, 99.0, false, 2008],
      ['V-501', 'Sphère de stockage butane', 'Sphère', 'U500', 'A', '2022-10-12', 48, 0, 'En service', 0, 99.9, true, 1985],
      ['T-12', 'Bac gasoil 12 000 m³', 'Bac à toit fixe', 'U600', 'B', '2026-05-29', 120, 0, 'À l\'arrêt', 0, 0, true, 1969],
      ['T-14', 'Bac gasoil 12 000 m³', 'Bac à toit fixe', 'U600', 'B', '2016-09-15', 120, 0, 'À l\'arrêt', 0, 0, true, 1969],
      ['T-21', 'Bac essence à toit flottant', 'Bac à toit flottant', 'U600', 'B', '2019-03-01', 120, 0, 'En service', 0, 99.0, true, 1975],
      ['BC-701', 'Bras de chargement marine n°1', 'Bras de chargement', 'U700', 'B', '2026-04-20', 12, 9800, 'En service', 2600, 96.8, false, 2006],
      ['CH-801', 'Chaudière vapeur haute pression', 'Chaudière', 'U800', 'A', '2025-08-28', 12, 128000, 'En service', 7600, 98.5, true, 1988],
      ['TG-801', 'Turbo-alternateur 6 MW', 'Turbine', 'U800', 'A', '2026-08-20', 12, 96500, 'En service', 5400, 98.1, false, 1988],
      ['GE-802', 'Groupe électrogène de secours 1,2 MVA', 'Groupe électrogène', 'U800', 'B', '2026-09-03', 1, 1850, 'Secours', 1900, 99.3, false, 2012],
      ['AN-901', 'Analyseur de soufre (fluorescence X)', 'Analyseur', 'U900', 'C', '2026-09-25', 1, 120, 'En service', 0, 100, false, 2026]
    ];
    var equipements = Q.map(function (q) { var nx = E.parseDate(q[5]); nx.setMonth(nx.getMonth() + q[6]); return { id: q[0], designation: q[1], type: q[2], unite: q[3], criticite: q[4], derniereInspection: q[5], periodicite: q[6], prochaineInspection: E.iso(nx), heures: q[7], statut: q[8], mtbf: q[9], disponibilite: q[10], reglementaire: q[11], miseEnService: q[12] }; });
    /* quelques échéances réglementaires recalées sur l'arrêt général */
    equipements.forEach(function (e) { if (e.id === 'C-101' || e.id === 'R-201') e.prochaineInspection = '2027-03-15'; if (e.id === 'T-12') e.prochaineInspection = '2026-10-14'; if (e.id === 'T-14') e.prochaineInspection = '2026-12-18'; if (e.id === 'K-301' || e.id === 'F-301') { e.derniereInspection = '2026-09-28'; e.prochaineInspection = e.id === 'K-301' ? '2027-09-28' : '2028-03-28'; } if (e.id === 'K-201') { e.derniereInspection = '2026-04-10'; e.prochaineInspection = '2026-10-10'; } });

    var P = function (d, q) { return { designation: d, qte: q }; };
    var O = [
      ['0412', 'Fuite à la garniture mécanique côté accouplement', 'Correctif', 'Haute', 'P-101A', M(6), M(14), 'En cours', '2026-09-26', '2026-09-29', 16, 9, 4200000, ['Consignation électrique'], [P('Garniture mécanique double 2"', 1), P('Jeu de joints toriques Viton', 1)], 'Fuite goutte à goutte constatée lors de la ronde de nuit. Basculement sur la pompe de secours P-101B effectué.'],
      ['0413', 'Vibrations anormales sur palier côté moteur', 'Correctif', 'Urgente', 'K-201', M(36), '', 'Demandé', '2026-09-30', '', 12, 0, 0, ['Consignation électrique', 'Consignation mécanique'], [], 'Vibrations à 7,8 mm/s relevées (seuil d\'alarme 6,5). Bruit métallique intermittent.'],
      ['0414', 'Remplacement du transmetteur de pression PT-1045', 'Correctif', 'Normale', 'C-101', M(5), M(13), 'Approuvé', '2026-09-24', '', 6, 0, 0, ['Permis de travail à froid'], [P('Transmetteur de pression 0-10 bar', 1)], 'Mesure figée depuis le 23/09, écart avec le manomètre local.'],
      ['0415', 'Ramonage et contrôle des brûleurs', 'Préventif', 'Normale', 'F-101', M(5), M(17), 'Planifié', '2026-09-15', '2026-10-06', 24, 0, 0, ['Permis de feu', 'Espace confiné'], [P('Nez de brûleur', 4)], 'Gamme semestrielle : nettoyage des brûleurs, contrôle des flammes et de la combustion.'],
      ['0416', 'Contrôle réglementaire des soupapes du ballon V-102', 'Inspection réglementaire', 'Haute', 'V-102', M(16), M(16), 'Demandé', '2026-09-22', '', 8, 0, 0, ['Travail en hauteur'], [], 'Échéance réglementaire dépassée : requalification à programmer en priorité.'],
      ['0417', 'Nettoyage du faisceau tubulaire (encrassement)', 'Correctif', 'Haute', 'E-104', M(9), M(17), 'Planifié', '2026-09-18', '2026-10-08', 40, 0, 0, ['Consignation mécanique', 'Levage'], [P('Joint spiralé 24" classe 300', 2), P('Goujons B7 (lot)', 1)], 'Perte de rendement thermique de 18 % : nettoyage haute pression du faisceau.'],
      ['0418', 'Remplacement du catalyseur des réacteurs R-301', 'Préventif', 'Haute', 'R-301', M(9), M(12), 'En cours', '2026-07-01', '2026-09-20', 320, 236, 285000000, ['Espace confiné', 'Travail en hauteur'], [P('Catalyseur de reformage (t)', 42), P('Billes céramique support (t)', 6)], 'Lot principal de l\'arrêt partiel U300.', 'ARR-2026-03'],
      ['0419', 'Réfection du réfractaire du four F-301', 'Correctif', 'Haute', 'F-301', M(9), M(17), 'En cours', '2026-07-08', '2026-09-17', 180, 140, 96000000, ['Espace confiné', 'Permis de feu'], [P('Béton réfractaire (t)', 8), P('Ancrages inox', 400)], 'Points chauds détectés par thermographie sur la zone de radiation.', 'ARR-2026-03'],
      ['0420', 'Révision générale du compresseur K-301', 'Préventif', 'Haute', 'K-301', M(12), M(14), 'En cours', '2026-07-08', '2026-09-18', 140, 112, 64000000, ['Consignation électrique', 'Levage'], [P('Kit de révision paliers', 1), P('Garnitures sèches', 2)], 'Révision 24 000 h programmée pendant l\'arrêt.', 'ARR-2026-03'],
      ['0421', 'Inspection réglementaire du ballon V-301', 'Inspection réglementaire', 'Haute', 'V-301', M(16), M(16), 'Terminé', '2026-07-08', '2026-09-21', 24, 28, 3800000, ['Espace confiné'], [], 'Inspection interne, mesures d\'épaisseur et contrôle des piquages.', 'ARR-2026-03'],
      ['0422', 'Graissage et analyse vibratoire des pompes U400', 'Préventif', 'Basse', 'P-401', M(5), M(14), 'Clôturé', '2026-08-28', '2026-09-02', 6, 5, 350000, [], [P('Graisse lithium (kg)', 2)], 'Gamme mensuelle.'],
      ['0423', 'Étalonnage de l\'analyseur de soufre', 'Préventif', 'Normale', 'AN-901', M(10), M(13), 'Clôturé', '2026-09-20', '2026-09-26', 4, 4, 180000, [], [P('Étalons certifiés', 3)], 'Étalonnage après installation.'],
      ['0424', 'Remplacement du joint tournant du bras de chargement', 'Correctif', 'Haute', 'BC-701', M(34), M(14), 'Terminé', '2026-09-10', '2026-09-15', 20, 26, 12400000, ['Travail en hauteur', 'Levage'], [P('Joint tournant 8"', 1)], 'Suintement de gasoil lors du chargement du navire du 9 septembre.'],
      ['0425', 'Essai de démarrage mensuel du groupe de secours', 'Préventif', 'Normale', 'GE-802', M(35), M(15), 'Clôturé', '2026-08-30', '2026-09-03', 3, 3, 150000, [], [], 'Essai en charge 30 minutes conforme.'],
      ['0426', 'Inspection visuelle externe de la sphère de butane', 'Inspection réglementaire', 'Haute', 'V-501', M(16), M(16), 'Planifié', '2026-09-12', '2026-10-13', 16, 0, 0, ['Travail en hauteur'], [], 'Inspection périodique annuelle, contrôle des supports et de la protection incendie.'],
      ['0427', 'Remplacement du disjoncteur départ moteur', 'Correctif', 'Haute', 'P-201A', M(8), M(15), 'Approuvé', '2026-09-27', '', 8, 0, 0, ['Consignation électrique'], [P('Disjoncteur moteur 90 kW', 1)], 'Déclenchements intempestifs du moteur (3 en une semaine).'],
      ['0428', 'Pose de capteurs de vibration en ligne', 'Amélioration', 'Normale', 'K-201', M(9), '', 'Demandé', '2026-09-29', '', 32, 0, 0, ['Consignation électrique'], [P('Capteur de vibration 4-20 mA', 4)], 'Surveillance continue pour passer en maintenance conditionnelle.'],
      ['0429', 'Mesures d\'épaisseur des tuyauteries de tête', 'Inspection réglementaire', 'Normale', 'C-101', M(16), M(16), 'Planifié', '2026-09-16', '2026-10-15', 12, 0, 0, ['Travail en hauteur'], [], 'Suivi de la corrosion de tête de colonne (programme annuel).'],
      ['0430', 'Remplacement de la soupape de sûreté de la chaudière', 'Inspection réglementaire', 'Urgente', 'CH-801', M(35), M(17), 'Approuvé', '2026-09-28', '', 10, 0, 0, ['Permis de feu', 'Travail en hauteur'], [P('Soupape de sûreté 3" × 4"', 1)], 'Soupape non conforme lors du tarage réglementaire.'],
      ['0431', 'Réparation de l\'étanchéité du toit flottant', 'Correctif', 'Normale', 'T-21', M(7), '', 'Demandé', '2026-09-25', '', 24, 0, 0, ['Permis de feu', 'Travail en hauteur'], [P('Joint d\'étanchéité primaire (m)', 30)], 'Odeur d\'essence en bordure de robe signalée par la ronde.'],
      ['0408', 'Révision 8 000 h du turbo-alternateur', 'Préventif', 'Haute', 'TG-801', M(15), M(15), 'Clôturé', '2026-08-01', '2026-08-18', 96, 104, 28000000, ['Consignation électrique'], [P('Filtres à huile', 4), P('Huile turbine (L)', 800)], 'Révision programmée.'],
      ['0410', 'Contrôle radiographique des soudures du fond T-12', 'Inspection réglementaire', 'Haute', 'T-12', M(16), M(16), 'Terminé', '2026-09-14', '2026-09-21', 30, 34, 6800000, ['Espace confiné'], [], 'Projet BACS : 4 soudures à reprendre.'],
      ['0411', 'Remplacement de l\'éclairage par des projecteurs LED', 'Amélioration', 'Basse', 'BC-701', M(34), M(15), 'Clôturé', '2026-08-05', '2026-08-25', 18, 16, 5600000, ['Travail en hauteur'], [P('Projecteur LED ATEX 150 W', 12)], 'Économie d\'énergie et meilleure visibilité de nuit.']
    ];
    var ordres = O.map(function (o) {
      var st = o[7], i = STEPS.indexOf(st), d0 = o[8], dp = o[9];
      var x = { id: 'OT-2026-' + o[0], titre: o[1], type: o[2], priorite: o[3], equipement: o[4], unite: (Q.find(function (q) { return q[0] === o[4]; }) || [])[3], demandeur: o[5], intervenant: o[6], statut: st,
        dateDemande: d0, datePrevue: dp, dateDebut: i >= 3 ? dp : '', dateFin: i >= 4 ? E.addDays(dp, Math.max(1, Math.ceil((o[11] || 8) / 16))) : '', dateCloture: i >= 5 ? E.addDays(dp, Math.max(2, Math.ceil((o[11] || 8) / 16) + 1)) : '',
        hPrevues: o[10], hReelles: o[11], cout: o[12], permis: o[13], pieces: o[14], description: o[15], arret: o[16] || '', historique: [] };
      if (x.dateFin > today()) x.dateFin = today();
      if (x.dateCloture > today()) x.dateCloture = today();
      var dates = [d0, E.addDays(d0, 1), E.addDays(d0, 2), x.dateDebut, x.dateFin, x.dateCloture];
      for (var k = 0; k <= i; k++) x.historique.push({ d: dates[k] || d0, statut: STEPS[k], par: k === 0 ? E.empName(o[5]) : k === 1 ? 'Mbina Alain' : k === 2 ? 'Obiang Ruth' : E.empName(o[6]) || 'Équipe maintenance' });
      return x;
    });

    var L = function (t, s, e, p, lot, ent, crit, eff, cout) { return { t: t, s: s, e: e, p: p, lot: lot, entreprise: ent, critique: !!crit, effectif: eff, cout: cout, statut: p >= 100 ? 'Terminé' : p > 0 ? 'En cours' : 'À démarrer' }; };
    var arrets = [
      { id: 'ARR-2026-03', nom: 'Arrêt partiel U300 — reformage catalytique', type: 'Arrêt partiel', unites: ['U300'], debut: '2026-09-14', fin: '2026-10-09', statut: 'En cours', budget: 1.65e9, engage: 1.42e9, responsable: M(12),
        objectifs: 'Remplacement du catalyseur des réacteurs R-301 en fin de cycle, réfection du réfractaire du four F-301 et révision du compresseur K-301.', prep: { ot: 100, permis: 100, pieces: 96 },
        lots: [L('Mise à l\'arrêt et inertage à l\'azote', '2026-09-14', '2026-09-16', 100, 'Arrêt', '', 1, 18, 12e6), L('Montage des échafaudages et calorifuge', '2026-09-15', '2026-10-05', 90, 'Accès', 'F-008', 0, 22, 85e6),
          L('Ouverture des réacteurs R-301', '2026-09-17', '2026-09-19', 100, 'Mécanique', 'F-001', 1, 16, 48e6), L('Réfection du réfractaire four F-301', '2026-09-17', '2026-10-03', 85, 'Four', 'F-001', 0, 14, 96e6),
          L('Révision compresseur K-301', '2026-09-18', '2026-10-02', 80, 'Machines tournantes', 'F-001', 0, 8, 64e6), L('Déchargement du catalyseur usé', '2026-09-20', '2026-09-24', 100, 'Catalyseur', 'F-005', 1, 12, 70e6),
          L('Inspection réglementaire ballon V-301', '2026-09-21', '2026-09-25', 100, 'Inspection', '', 0, 4, 4e6), L('Inspection des réacteurs et internes', '2026-09-25', '2026-09-28', 100, 'Inspection', '', 1, 6, 15e6),
          L('Chargement du catalyseur neuf', '2026-09-29', '2026-10-02', 60, 'Catalyseur', 'F-005', 1, 12, 860e6), L('Fermeture, épreuves et tests d\'étanchéité', '2026-10-03', '2026-10-06', 0, 'Essais', 'F-001', 1, 14, 30e6),
          L('Séchage, réduction du catalyseur et redémarrage', '2026-10-07', '2026-10-09', 0, 'Démarrage', '', 1, 20, 18e6)] },
      { id: 'ARR-2027-01', nom: 'Arrêt technique général 2027', type: 'Grand arrêt', unites: ['U100', 'U200', 'U300', 'U400', 'U500', 'U800'], debut: '2027-03-01', fin: '2027-04-15', statut: 'En préparation', budget: 9.8e9, engage: 2.9e9, responsable: M(12),
        objectifs: 'Grand arrêt quadriennal : inspections réglementaires des capacités sous pression, révision des fours et machines tournantes, remplacement du catalyseur d\'hydrotraitement, raccordements du projet de dégoulottage et basculement du nouveau DCS.', prep: { ot: 62, permis: 34, pieces: 48 },
        lots: [L('Montage des échafaudages (3 200 m³)', '2027-02-15', '2027-03-08', 0, 'Accès', 'F-008', 0, 60, 420e6), L('Mise à l\'arrêt progressive des unités', '2027-03-01', '2027-03-04', 0, 'Arrêt', '', 1, 40, 60e6),
          L('Basculement du DCS (projet PRJ-05)', '2027-03-01', '2027-04-10', 0, 'Instrumentation', 'F-002', 0, 18, 380e6), L('Nettoyage et dégazage des équipements', '2027-03-03', '2027-03-10', 0, 'Nettoyage', 'F-001', 1, 45, 310e6),
          L('Ouverture et inspection de la colonne C-101', '2027-03-05', '2027-03-20', 0, 'Mécanique', 'F-001', 1, 38, 640e6), L('Révision du four F-101 (brûleurs, tubes)', '2027-03-05', '2027-03-25', 0, 'Four', 'F-001', 0, 26, 720e6),
          L('Révision des machines tournantes (18 pompes, 2 compresseurs)', '2027-03-05', '2027-03-31', 0, 'Machines tournantes', 'F-001', 0, 30, 980e6), L('Inspection réglementaire des capacités (42 équipements)', '2027-03-06', '2027-03-30', 0, 'Inspection', '', 0, 16, 260e6),
          L('Remplacement du catalyseur R-201', '2027-03-08', '2027-03-22', 0, 'Catalyseur', 'F-005', 1, 20, 1450e6), L('Remplacement des vannes de sécurité', '2027-03-08', '2027-03-28', 0, 'Robinetterie', 'F-003', 0, 12, 860e6),
          L('Raccordements du projet de dégoulottage (tie-ins)', '2027-03-10', '2027-03-31', 0, 'Projet', 'F-001', 1, 48, 1900e6), L('Révision des installations électriques HT', '2027-03-08', '2027-03-26', 0, 'Électricité', 'F-004', 0, 14, 540e6),
          L('Épreuves hydrauliques et remontage', '2027-03-28', '2027-04-05', 0, 'Essais', 'F-001', 1, 36, 420e6), L('Redémarrage et mise en régime', '2027-04-06', '2027-04-15', 0, 'Démarrage', '', 1, 50, 180e6)] },
      { id: 'ARR-2026-01', nom: 'Arrêt partiel U100 — distillation atmosphérique', type: 'Arrêt partiel', unites: ['U100'], debut: '2026-05-04', fin: '2026-05-18', statut: 'Terminé', budget: 0.82e9, engage: 0.79e9, responsable: M(12),
        objectifs: 'Nettoyage du train d\'échange, remplacement de plateaux de la colonne C-101 et révision des pompes P-101 A/B.', prep: { ot: 100, permis: 100, pieces: 100 },
        lots: [L('Mise à l\'arrêt et vidange', '2026-05-04', '2026-05-05', 100, 'Arrêt', '', 1, 16, 10e6), L('Nettoyage du train d\'échange', '2026-05-05', '2026-05-12', 100, 'Nettoyage', 'F-001', 0, 18, 180e6),
          L('Remplacement de plateaux C-101', '2026-05-06', '2026-05-14', 100, 'Mécanique', 'F-001', 1, 20, 390e6), L('Révision pompes P-101 A/B', '2026-05-06', '2026-05-12', 100, 'Machines tournantes', 'F-001', 0, 6, 95e6),
          L('Épreuves et redémarrage', '2026-05-15', '2026-05-18', 100, 'Démarrage', '', 1, 18, 115e6)] }
    ];
    var G = [['Analyse vibratoire des pompes U100', 'P-101A', 30, '2026-10-05', 2, 'Mécanique', M(14)], ['Graissage des moteurs électriques U200', 'P-201A', 30, '2026-10-12', 4, 'Électricité', M(15)],
      ['Contrôle des détecteurs de gaz U300', 'V-301', 90, '2026-10-20', 6, 'Instrumentation', M(13)], ['Essai en charge du groupe de secours', 'GE-802', 30, '2026-10-02', 3, 'Électricité', M(15)],
      ['Ramonage de la chaudière', 'CH-801', 60, '2026-11-03', 10, 'Chaudronnerie', M(17)], ['Étalonnage de l\'analyseur de soufre', 'AN-901', 30, '2026-10-23', 4, 'Instrumentation', M(13)],
      ['Thermographie des armoires électriques', 'TG-801', 90, '2026-10-14', 6, 'Électricité', M(15)], ['Contrôle des soupapes de respiration', 'T-21', 180, '2026-11-10', 5, 'Inspection', M(16)],
      ['Vidange d\'huile du compresseur', 'K-201', 90, '2026-10-08', 5, 'Mécanique', M(14)], ['Test des vannes d\'arrêt d\'urgence (ESD)', 'F-101', 90, '2026-11-17', 8, 'Instrumentation', M(13)],
      ['Nettoyage des faisceaux de l\'aéroréfrigérant', 'E-305', 60, '2026-10-19', 12, 'Mécanique', M(37)], ['Contrôle du bras de chargement', 'BC-701', 30, '2026-10-09', 3, 'Mécanique', M(14)]];
    var gammes = G.map(function (g, i) { return { id: 'GP-' + String(i + 1).padStart(2, '0'), titre: g[0], equipement: g[1], periodicite: g[2], prochaine: g[3], duree: g[4], metier: g[5], intervenant: g[6], generes: [] }; });
    return { equipements: equipements, ordres: ordres, arrets: arrets, gammes: gammes };
  }

  /* ------------------------------------------------------------------ CSS */
  function css() {
    if (document.getElementById('mnt-css')) return;
    var s = document.createElement('style'); s.id = 'mnt-css';
    s.textContent = [
      '.mnt-ch .chart{overflow:visible}',
      '.mnt-crit{font-weight:800;min-width:24px;justify-content:center}',
      '.mnt-head{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}',
      '.mnt-head h2{font-size:20px;line-height:1.25;margin:6px 0 4px}',
      '.mnt-id{font:700 12px ui-monospace,Consolas,monospace;background:var(--navy);color:#fff;padding:4px 8px;border-radius:6px;letter-spacing:.03em}',
      '.mnt-seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}',
      '.mnt-seg button{border:0;background:none;padding:7px 12px;font-weight:600;font-size:12.5px;cursor:pointer;color:var(--ink-3);display:inline-flex;gap:6px;align-items:center}',
      '.mnt-seg button svg{width:15px}.mnt-seg button.is-active{background:var(--navy);color:#fff}',
      '.mnt-kanban{grid-auto-columns:minmax(240px,1fr)}',
      '.mnt-kanban .kcard{border-left:4px solid var(--line)}',
      '.mnt-kanban .kcard.p-Urgente{border-left-color:var(--red)}.mnt-kanban .kcard.p-Haute{border-left-color:var(--orange)}.mnt-kanban .kcard.p-Normale{border-left-color:var(--blue)}',
      '.mnt-kanban .kcard.dragging{opacity:.4}',
      '.mnt-next{margin-left:auto;border:1px solid var(--line);background:#fff;border-radius:8px;padding:2px 8px;font-size:11px;font-weight:600;cursor:pointer;color:var(--navy)}',
      '.mnt-next:hover{background:var(--grey-bg)}',
      '.mnt-permis{display:flex;flex-wrap:wrap;gap:6px}',
      '.mnt-permis span{display:inline-flex;gap:6px;align-items:center;border:1px solid #f3c2c2;background:var(--red-bg);color:#a82424;font-weight:600;font-size:12px;padding:4px 10px;border-radius:20px}',
      '.mnt-permis svg{width:14px}',
      '.mnt-gauges{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
      '.mnt-gauges>div{text-align:center;min-width:0}.mnt-gauges svg{width:100%!important;max-width:140px}',
      '.mnt-head>div:first-child{flex:1 1 360px!important}.mnt-id{white-space:nowrap}',
      '.mnt-week{display:flex;flex-direction:column}',
      '.mnt-week .card__h{background:#f8fafc}',
      '.mnt-it{display:flex;gap:10px;align-items:flex-start;padding:10px 14px;border-bottom:1px solid var(--line-2);font-size:12.5px}',
      '.mnt-it:last-child{border-bottom:0}',
      '.mnt-it b{font-weight:600;display:block}',
      '.mnt-dot{width:9px;height:9px;border-radius:50%;flex:none;margin-top:5px}',
      '.mnt-arr{padding:18px;display:flex;flex-direction:column;gap:12px;cursor:pointer;transition:transform .15s,box-shadow .15s}',
      '.mnt-arr:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(13,27,42,.12)}',
      '.mnt-arr h3{font-size:16px}',
      '.mnt-count{font-family:Sora,sans-serif;font-weight:800;font-size:28px;color:var(--navy)}',
      '.mnt-mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;font-size:11.5px;color:var(--ink-3)}',
      '.mnt-mini b{display:block;font-size:14px;color:var(--ink)}',
      '.mnt-range{display:flex;align-items:center;gap:8px;min-width:150px}.mnt-range input{flex:1;accent-color:#163b75;min-width:80px}.mnt-range output{font-weight:700;font-size:12px;width:38px;text-align:right}',
      '.mnt-avail{display:flex;flex-direction:column;gap:10px}',
      '.mnt-avail>div{display:grid;grid-template-columns:70px 1fr;gap:10px;align-items:center;font-size:12.5px}',
      '@media (max-width:640px){.mnt-gauges{grid-template-columns:1fr 1fr 1fr;gap:4px}.mnt-gauges svg{width:100%!important}.mnt-head h2{font-size:17px}.mnt-mini b{font-size:12.5px}.mnt-actions .btn{flex:1 1 auto}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ navigation */
  function render(view, params) {
    css(); cur.view = view; cur.params = params || [];
    var a = cur.params[0] || 'tableau', b = cur.params[1];
    if (a === 'ot' && b && S.get('ordres', b)) return ficheOT(view, S.get('ordres', b));
    if (a === 'equipements' && b && eq(b)) return ficheEQ(view, eq(b));
    if (a === 'arrets' && b && S.get('arrets', b)) return ficheArret(view, S.get('arrets', b));
    var html = topTabs(a) + '<div id="mnt-body"></div>';
    view.innerHTML = html;
    var body = E.$('#mnt-body', view);
    ({ tableau: vDash, ot: vOT, equipements: vEQ, arrets: vArrets, preventif: vPrev }[a] || vDash)(body);
  }
  function topTabs(a) {
    return U.tabs([{ k: 'tableau', l: 'Tableau de bord' }, { k: 'ot', l: 'Ordres de travail', n: OT().filter(isOpen).length }, { k: 'equipements', l: 'Équipements', n: EQ().length }, { k: 'arrets', l: 'Arrêts techniques' }, { k: 'preventif', l: 'Planning préventif' }], a, function (k) { E.go('maintenance' + (k === 'tableau' ? '' : '/' + k)); });
  }
  function back(href, label) { return '<a class="btn ghost sm" href="' + href + '" style="margin-bottom:10px">' + E.icon('back') + esc(label) + '</a>'; }

  /* ------------------------------------------------------------------ tableau de bord */
  var BASE_C = [41, 38, 45, 39, 58, 44, 40, 43, 47], BASE_X = [39, 40, 41, 42, 55, 47, 41, 42, 44];
  function vDash(el) {
    var O = OT(), open = O.filter(isOpen), t = today(), y = t.slice(0, 4);
    var backlog = E.sum(open.filter(function (o) { return ['Demandé', 'Approuvé', 'Planifié'].indexOf(o.statut) >= 0; }), 'hPrevues');
    var critA = EQ().filter(function (e) { return e.criticite === 'A' && e.mtbf; });
    var dispo = E.sum(critA, 'disponibilite') / (critA.length || 1), mtbf = E.sum(critA, 'mtbf') / (critA.length || 1);
    var t30 = E.addDays(t, -30), cout = E.sum(O.filter(function (o) { var d = o.dateFin || o.dateDebut; return d && d >= t30 && !o.arret; }), 'cout');
    var coutArr = E.sum(O.filter(function (o) { var d = o.dateFin || o.dateDebut; return d && d >= t30 && o.arret; }), 'cout');
    var byType = TYPES.map(function (ty) { return { label: ty, value: O.filter(function (o) { return o.type === ty && o.dateDemande.slice(0, 4) === y; }).length, color: TYPE_COL[ty] }; });
    var prevPct = Math.round((byType[0].value + byType[3].value) / (E.sum(byType, 'value') || 1) * 100);
    var nowM = E.parseDate(t).getMonth(), labels = [], cr = [], cl = [];
    for (var m = Math.max(0, nowM - 8); m <= nowM; m++) {
      var ym = y + '-' + String(m + 1).padStart(2, '0');
      labels.push(E.MOIS[m]);
      cr.push((BASE_C[m] || 0) + O.filter(function (o) { return o.dateDemande.slice(0, 7) === ym; }).length);
      cl.push((BASE_X[m] || 0) + O.filter(function (o) { return (o.dateCloture || '').slice(0, 7) === ym; }).length);
    }
    var ech = EQ().filter(echue), urg = open.filter(function (o) { return o.priorite === 'Urgente'; });
    var arr = S.all('arrets').find(function (a) { return a.statut === 'En cours'; });
    var units = S.all('unites'), cu = units.map(function (u) { return E.sum(O.filter(function (o) { return o.unite === u.id && o.dateDemande.slice(0, 4) === y; }), 'cout'); });
    el.innerHTML =
      '<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">' +
      U.kpi({ label: 'OT ouverts', value: open.length, icon: 'wrench', tone: 'blue', foot: urg.length ? '<span class="down">' + urg.length + ' urgent(s)</span>' : 'aucun urgent' }) +
      U.kpi({ label: 'Backlog', value: F.num(backlog), unit: 'h', icon: 'clock', tone: 'orange', foot: '≈ ' + F.num(backlog / (techs().length * 8), 1) + ' jours-équipe' }) +
      U.kpi({ label: 'Part du préventif', value: prevPct, unit: '%', icon: 'shield', tone: 'green', foot: 'objectif 70 % (préventif + réglementaire)' }) +
      U.kpi({ label: 'Dispo. critiques', value: F.num(dispo, 1), unit: '%', icon: 'target', tone: dispo >= 98 ? 'green' : 'orange', foot: critA.length + ' équipements de criticité A' }) +
      U.kpi({ label: 'MTBF moyen', value: F.num(mtbf), unit: 'h', icon: 'trend', tone: 'violet', foot: 'équipements critiques · 12 mois' }) +
      U.kpi({ label: 'Coûts 30 jours', value: F.short(cout), unit: 'FCFA', icon: 'money', tone: 'navy', foot: '+ ' + F.short(coutArr) + ' sur l\'arrêt U300' }) + '</div>' +
      '<div class="grid g-2-1" style="margin-top:16px"><div class="card"><div class="card__h"><h3>OT créés / clôturés par mois</h3><span class="sub">' + y + ' · tous ordres de travail</span></div><div class="card__b mnt-ch">' +
      U.bars({ labels: labels, series: [{ name: 'Créés', values: cr, color: '#c9d6ea' }, { name: 'Clôturés', values: cl, color: '#163b75' }], height: 230 }) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Répartition par type</h3><span class="sub">OT ' + y + '</span></div><div class="card__b">' + U.donut(byType, { center: prevPct + ' %', sub: 'préventif' }) + '</div></div></div>' +
      '<div class="grid g3" style="margin-top:16px">' +
      '<div class="card"><div class="card__h"><h3>Alertes</h3><span class="sub">' + (ech.length + urg.length) + '</span></div><div class="list">' +
      ech.map(function (e) { return '<a class="list__item" style="color:inherit" href="#/maintenance/equipements/' + e.id + '"><div class="list__icon tone-red">' + E.icon('alert') + '</div><div class="list__body"><b>Inspection échue · ' + e.id + '</b><div class="small muted">' + esc(e.designation) + ' · depuis le ' + F.date(e.prochaineInspection) + '</div></div></a>'; }).join('') +
      urg.map(function (o) { return '<a class="list__item" style="color:inherit" href="#/maintenance/ot/' + o.id + '"><div class="list__icon tone-orange">' + E.icon('fire') + '</div><div class="list__body"><b>' + o.id + ' · urgent</b><div class="small muted">' + esc(o.titre) + ' · ' + o.equipement + ' · ' + o.statut + '</div></div></a>'; }).join('') +
      (ech.length + urg.length ? '' : '<div class="empty">Aucune alerte.</div>') + '</div></div>' +
      (arr ? '<div class="card mnt-arr" data-href="#/maintenance/arrets/' + arr.id + '"><div class="row">' + U.badge('Arrêt en cours', 'blue') + '<span class="spacer"></span><span class="small muted">J' + (E.daysBetween(arr.debut, t) + 1) + ' / ' + (E.daysBetween(arr.debut, arr.fin) + 1) + '</span></div><h3>' + esc(arr.nom) + '</h3><div>' + U.gauge(arrAv(arr), 'avancement des lots de travaux', '#163b75') + '</div>' +
        '<div class="mnt-mini"><div>Redémarrage<b>' + F.date(arr.fin) + '</b></div><div>Budget engagé<b>' + F.pct(arr.engage / arr.budget * 100) + '</b></div><div>Lots terminés<b>' + arr.lots.filter(function (l) { return l.p >= 100; }).length + ' / ' + arr.lots.length + '</b></div></div></div>' : '<div class="card empty">Aucun arrêt en cours.</div>') +
      '<div class="card"><div class="card__h"><h3>Disponibilité des équipements critiques</h3></div><div class="card__b mnt-avail">' +
      critA.slice().sort(function (a, b) { return a.disponibilite - b.disponibilite; }).slice(0, 7).map(function (e) { return '<div><a href="#/maintenance/equipements/' + e.id + '" class="mono">' + e.id + '</a>' + U.progress(e.disponibilite, e.disponibilite < 97 ? 'orange' : 'green') + '</div>'; }).join('') + '</div></div></div>' +
      '<div class="grid g2 stack-m" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Coûts de maintenance par unité</h3><span class="sub">' + y + ' · OT saisis (FCFA)</span></div><div class="card__b mnt-ch">' + U.bars({ labels: units.map(function (u) { return u.id; }), series: [{ name: 'Coût', values: cu, color: '#0f2d5c' }], height: 210, money: true }) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Équipements les plus coûteux</h3><span class="sub">' + y + '</span></div><div class="list">' + topEq(O, y) + '</div></div></div>';
    E.$$('[data-href]', el).forEach(function (c) { c.onclick = function () { location.hash = c.dataset.href; }; });
  }

  function topEq(O, y) {
    var m = {};
    O.forEach(function (o) { if (o.dateDemande.slice(0, 4) === y && o.cout) { m[o.equipement] = m[o.equipement] || { c: 0, n: 0 }; m[o.equipement].c += o.cout; m[o.equipement].n++; } });
    var L = Object.keys(m).sort(function (a, b) { return m[b].c - m[a].c; }).slice(0, 5), mx = L.length ? m[L[0]].c : 1;
    return L.map(function (k) {
      var e = eq(k) || {};
      return '<a class="list__item" style="color:inherit" href="#/maintenance/equipements/' + k + '"><div class="list__icon tone-' + (CRIT_TONE[e.criticite] || 'grey') + '" style="font-weight:800">' + (e.criticite || '') + '</div><div class="list__body"><div class="row" style="justify-content:space-between;flex-wrap:nowrap"><b style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + k + ' · ' + esc(e.designation || '') + '</b><b class="nowrap">' + F.short(m[k].c) + '</b></div><div class="progress" style="margin-top:6px"><i style="width:' + (m[k].c / mx * 100) + '%"></i></div><div class="small muted" style="margin-top:4px">' + m[k].n + ' OT</div></div></a>';
    }).join('') || '<div class="empty">Aucun coût saisi.</div>';
  }

  /* ------------------------------------------------------------------ ordres de travail */
  function otFiltered() {
    var q = E.norm(fOT.q);
    return OT().filter(function (o) {
      if (fOT.st === 'ouverts' && !isOpen(o) && !(otMode === 'kanban' && o.statut !== 'Annulé' && (o.dateCloture || o.dateFin || '') >= E.addDays(today(), -30))) return false;
      if (fOT.st !== 'ouverts' && fOT.st !== 'tous' && o.statut !== fOT.st) return false;
      if (fOT.type && o.type !== fOT.type) return false;
      if (fOT.prio && o.priorite !== fOT.prio) return false;
      if (fOT.unite && o.unite !== fOT.unite) return false;
      if (q && E.norm(o.id + ' ' + o.titre + ' ' + o.equipement + ' ' + E.empName(o.intervenant) + ' ' + E.empName(o.demandeur)).indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return a.id < b.id ? 1 : -1; });
  }
  var OT_COLS = [
    { label: 'N° OT', render: function (o) { return '<b class="mono">' + o.id + '</b>'; } },
    { label: 'Intervention', render: function (o) { return '<b>' + esc(o.titre) + '</b><div class="small muted">' + o.equipement + ' · ' + esc((eq(o.equipement) || {}).designation || '') + '</div>'; } },
    { label: 'Type', render: function (o) { return '<span class="small" style="color:' + TYPE_COL[o.type] + ';font-weight:600">' + esc(o.type) + '</span>'; } },
    { label: 'Priorité', render: function (o) { return prB(o.priorite); } },
    { label: 'Intervenant', render: function (o) { return o.intervenant ? esc(E.empName(o.intervenant)) : ''; } },
    { label: 'Prévu le', cls: 'nowrap', render: function (o) { return o.datePrevue ? F.dateShort(o.datePrevue) : ''; } },
    { label: 'Heures', num: true, render: function (o) { return (o.hReelles ? o.hReelles + ' / ' : '') + o.hPrevues + ' h'; } },
    { label: 'Statut', render: function (o) { return stB(o.statut); } }
  ];
  function vOT(el) {
    var O = OT();
    el.innerHTML = '<div class="section-title" style="margin-bottom:14px"><div><h2>Ordres de travail</h2><p>Demandes d\'intervention, planification et suivi de l\'exécution.</p></div><span class="spacer"></span>' +
      '<div class="mnt-seg" id="ot-mode"><button data-m="liste" class="' + (otMode === 'liste' ? 'is-active' : '') + '">' + E.icon('list') + 'Liste</button><button data-m="kanban" class="' + (otMode === 'kanban' ? 'is-active' : '') + '">' + E.icon('grid') + 'Kanban</button></div>' +
      '<button class="btn" id="ot-csv">' + E.icon('download') + 'Exporter</button><button class="btn primary" id="ot-new">' + E.icon('plus') + 'Demande d\'intervention</button></div>' +
      '<div class="filters"><div class="chips" id="ot-st">' + [['ouverts', 'Ouverts', O.filter(isOpen).length], ['tous', 'Tous', O.length]].concat(STEPS.map(function (s) { return [s, s, O.filter(function (o) { return o.statut === s; }).length]; })).map(function (c) { return '<button class="chip' + (fOT.st === c[0] ? ' is-active' : '') + '" data-v="' + c[0] + '">' + c[1] + ' · ' + c[2] + '</button>'; }).join('') + '</div></div>' +
      '<div class="filters"><select class="select" id="ot-type"><option value="">Tous les types</option>' + TYPES.map(function (t) { return '<option' + (fOT.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
      '<select class="select" id="ot-prio"><option value="">Toutes priorités</option>' + Object.keys(PRIO_TONE).map(function (t) { return '<option' + (fOT.prio === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
      '<select class="select" id="ot-un"><option value="">Toutes les unités</option>' + S.all('unites').map(function (u) { return '<option value="' + u.id + '"' + (fOT.unite === u.id ? ' selected' : '') + '>' + u.id + ' — ' + esc(u.nom) + '</option>'; }).join('') + '</select>' +
      '<input class="input" id="ot-q" type="search" placeholder="N°, équipement, intervenant…" value="' + esc(fOT.q) + '"></div><div id="ot-res"></div>';
    function draw() {
      var L = otFiltered(), box = E.$('#ot-res', el);
      if (otMode === 'kanban') { box.innerHTML = kanban(L); bindKanban(box); }
      else box.innerHTML = '<div class="card">' + U.table(OT_COLS, L, { onRow: function (o) { E.go('maintenance/ot/' + o.id); }, empty: 'Aucun ordre de travail ne correspond.' }) + '</div>';
    }
    draw();
    E.$('#ot-st', el).onclick = function (e) { var b = e.target.closest('.chip'); if (!b) return; fOT.st = b.dataset.v; E.$$('#ot-st .chip', el).forEach(function (c) { c.classList.toggle('is-active', c === b); }); draw(); };
    E.$('#ot-type', el).onchange = function (e) { fOT.type = e.target.value; draw(); };
    E.$('#ot-prio', el).onchange = function (e) { fOT.prio = e.target.value; draw(); };
    E.$('#ot-un', el).onchange = function (e) { fOT.unite = e.target.value; draw(); };
    E.$('#ot-q', el).oninput = function (e) { fOT.q = e.target.value; draw(); };
    E.$('#ot-mode', el).onclick = function (e) { var b = e.target.closest('button'); if (!b) return; otMode = b.dataset.m; E.$$('#ot-mode button', el).forEach(function (c) { c.classList.toggle('is-active', c === b); }); draw(); };
    E.$('#ot-new', el).onclick = function () { newDI(); };
    E.$('#ot-csv', el).onclick = function () { U.exportCSV('ordres-de-travail', [{ label: 'N° OT', key: 'id' }, { label: 'Intitulé', key: 'titre' }, { label: 'Type', key: 'type' }, { label: 'Priorité', key: 'priorite' }, { label: 'Équipement', key: 'equipement' }, { label: 'Unité', key: 'unite' }, { label: 'Demandeur', csv: function (o) { return E.empName(o.demandeur); } }, { label: 'Intervenant', csv: function (o) { return E.empName(o.intervenant); } }, { label: 'Statut', key: 'statut' }, { label: 'Demandé le', key: 'dateDemande' }, { label: 'Prévu le', key: 'datePrevue' }, { label: 'H prévues', key: 'hPrevues' }, { label: 'H réelles', key: 'hReelles' }, { label: 'Coût FCFA', key: 'cout' }, { label: 'Permis', csv: function (o) { return (o.permis || []).join(', '); } }], otFiltered()); };
  }
  function kanban(L) {
    var cols = fOT.st === 'ouverts' || fOT.st === 'tous' ? STEPS : [fOT.st];
    return '<div class="kanban mnt-kanban">' + cols.map(function (s) {
      var items = L.filter(function (o) { return o.statut === s; });
      return '<div class="kcol" data-st="' + s + '"><div class="kcol__h">' + stB(s) + '<span class="n">' + items.length + '</span></div>' + items.map(function (o) {
        var nx = STEPS[STEPS.indexOf(o.statut) + 1];
        return '<div class="kcard p-' + o.priorite + '" draggable="true" data-id="' + o.id + '"><div class="meta"><b class="mono" style="color:var(--ink)">' + o.id + '</b>' + prB(o.priorite) + '</div><b>' + esc(o.titre) + '</b><div class="meta">' + E.icon('wrench').replace('<svg', '<svg width="13"') + o.equipement + ' · ' + o.unite + (o.datePrevue ? ' · ' + F.dateShort(o.datePrevue) : '') + '</div>' +
          '<div class="meta">' + (o.intervenant ? U.avatar(E.empName(o.intervenant), null, true).replace('avatar sm', 'avatar sm" style="width:22px;height:22px;font-size:9.5px') + esc(E.empName(o.intervenant)) : '<span>Non affecté</span>') + (nx ? '<button class="mnt-next" data-next="' + o.id + '" title="Passer à : ' + nx + '">' + nx + ' →</button>' : '') + '</div></div>';
      }).join('') + '</div>';
    }).join('') + '</div><p class="small muted" style="margin-top:6px">Glissez une carte vers une autre colonne (ou utilisez le bouton « → ») pour faire avancer l\'ordre de travail.</p>';
  }
  function bindKanban(box) {
    var dragId = null;
    box.addEventListener('dragstart', function (e) { var c = e.target.closest('.kcard'); if (!c) return; dragId = c.dataset.id; c.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', dragId); } catch (x) {} });
    box.addEventListener('dragend', function (e) { var c = e.target.closest('.kcard'); if (c) c.classList.remove('dragging'); E.$$('.kcol', box).forEach(function (k) { k.classList.remove('drop'); }); });
    E.$$('.kcol', box).forEach(function (col) {
      col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', function () { col.classList.remove('drop'); });
      col.addEventListener('drop', function (e) { e.preventDefault(); col.classList.remove('drop'); var o = S.get('ordres', dragId); if (o && o.statut !== col.dataset.st) moveTo(o, col.dataset.st); });
    });
    box.addEventListener('click', function (e) {
      var n = e.target.closest('[data-next]'); if (n) { var o = S.get('ordres', n.dataset.next); moveTo(o, STEPS[STEPS.indexOf(o.statut) + 1]); return; }
      var c = e.target.closest('.kcard'); if (c) E.go('maintenance/ot/' + c.dataset.id);
    });
  }

  /* Workflow : transitions avec saisie quand nécessaire */
  function setStatus(o, st, patch, note) {
    patch = patch || {}; patch.statut = st;
    patch.historique = (o.historique || []).concat([{ d: today(), statut: st, par: me(), note: note || '' }]);
    S.update('ordres', o.id, patch);
    E.log('OT ' + o.id + ' → ' + st, o.titre + (note ? ' — ' + note : ''), 'maintenance');
    var tone = { 'Approuvé': 'blue', 'Planifié': 'violet', 'En cours': 'blue', 'Terminé': 'green', 'Clôturé': 'green', 'Annulé': 'red' }[st];
    E.notify('OT ' + st.toLowerCase() + ' : ' + o.id, o.titre + ' · ' + o.equipement, '#/maintenance/ot/' + o.id, tone);
    U.toast(o.id + ' : ' + st);
    refresh();
  }
  function moveTo(o, st) {
    if (!o || !st) return;
    var i = STEPS.indexOf(st);
    if (st === 'Planifié') return planifier(o);
    if (st === 'Terminé') return terminer(o);
    if (st === 'Approuvé') return setStatus(o, st, {}, 'Demande approuvée');
    if (st === 'En cours') { if (!o.intervenant) return planifier(o, true); return setStatus(o, st, { dateDebut: today() }, 'Intervention démarrée'); }
    if (st === 'Clôturé') return cloturer(o);
    if (i < STEPS.indexOf(o.statut)) return setStatus(o, st, {}, 'Retour à l\'étape « ' + st + ' »');
    setStatus(o, st);
  }
  function planifier(o, thenStart) {
    U.formModal({ title: 'Planifier ' + o.id, sub: esc(o.titre), okLabel: thenStart ? 'Planifier et démarrer' : 'Planifier',
      fields: [{ name: 'datePrevue', label: 'Date d\'intervention', type: 'date', required: true }, { name: 'intervenant', label: 'Intervenant', type: 'select', required: true, options: techOpts() }, { name: 'hPrevues', label: 'Heures prévues', type: 'number', min: 1 }],
      values: { datePrevue: o.datePrevue || E.addDays(today(), 3), intervenant: o.intervenant || techs()[0].id, hPrevues: o.hPrevues },
      onSubmit: function (v) {
        var p = { datePrevue: v.datePrevue, intervenant: v.intervenant, hPrevues: +v.hPrevues || o.hPrevues };
        if (thenStart) { p.dateDebut = today(); setStatus(o, 'En cours', p, 'Planifié et démarré — ' + E.empName(v.intervenant)); }
        else setStatus(o, 'Planifié', p, 'Prévu le ' + F.date(v.datePrevue) + ' — ' + E.empName(v.intervenant));
      } });
  }
  function terminer(o) {
    U.formModal({ title: 'Terminer ' + o.id, sub: esc(o.titre), okLabel: 'Déclarer terminé',
      fields: [{ name: 'hReelles', label: 'Heures réelles', type: 'number', required: true, min: 0 }, { name: 'cout', label: 'Coût total (FCFA)', type: 'money' },
        { name: 'pieces', label: 'Pièces consommées (une par ligne : quantité × désignation)', type: 'textarea' }, { name: 'cr', label: 'Compte rendu d\'intervention', type: 'textarea', placeholder: 'Travaux réalisés, constats, recommandations…' }],
      values: { hReelles: o.hReelles || o.hPrevues, cout: o.cout || Math.round((o.hReelles || o.hPrevues) * 18500), pieces: (o.pieces || []).map(function (p) { return p.qte + ' × ' + p.designation; }).join('\n') },
      onSubmit: function (v) {
        var pcs = String(v.pieces || '').split(/\n+/).map(function (l) { l = l.trim(); if (!l) return null; var m = l.match(/^(\d+[.,]?\d*)\s*[×x*]\s*(.+)$/i); return m ? { designation: m[2].trim(), qte: +m[1].replace(',', '.') } : { designation: l, qte: 1 }; }).filter(Boolean);
        setStatus(o, 'Terminé', { hReelles: +v.hReelles, cout: +v.cout || 0, pieces: pcs, dateFin: today(), compteRendu: v.cr || '' }, v.hReelles + ' h réalisées');
      } });
  }
  function cloturer(o) {
    U.confirm('Clôturer ' + o.id, 'La clôture valide techniquement l\'intervention et fige les coûts (' + F.money(o.cout) + ').' + (o.type === 'Inspection réglementaire' ? '<br><br><b>Inspection réglementaire :</b> la date de prochaine inspection de ' + o.equipement + ' sera recalculée.' : ''), 'Clôturer', function () {
      if (o.type === 'Inspection réglementaire') inspecter(eq(o.equipement), true);
      setStatus(o, 'Clôturé', { dateCloture: today() }, 'Clôture technique');
    }, 'success');
  }
  function inspecter(e, silent) {
    if (!e) return;
    var nx = E.parseDate(today()); nx.setMonth(nx.getMonth() + (e.periodicite || 12));
    S.update('equipements', e.id, { derniereInspection: today(), prochaineInspection: E.iso(nx) });
    E.log('Inspection enregistrée', e.id + ' — prochaine le ' + F.date(E.iso(nx)), 'maintenance');
    if (!silent) { U.toast('Inspection enregistrée · prochaine le ' + F.date(E.iso(nx))); refresh(); }
  }
  function newDI(eqId) {
    U.formModal({ title: 'Demande d\'intervention', sub: 'Elle sera transmise au service Maintenance pour approbation.', okLabel: 'Envoyer la demande',
      fields: [{ name: 'titre', label: 'Objet de la demande', required: true, full: true, placeholder: 'Ex. Fuite sur la bride d\'aspiration' }, { name: 'equipement', label: 'Équipement', type: 'select', required: true, options: eqOpts() },
        { name: 'type', label: 'Type', type: 'select', options: TYPES }, { name: 'priorite', label: 'Priorité', type: 'select', options: Object.keys(PRIO_TONE) }, { name: 'hPrevues', label: 'Estimation (heures)', type: 'number', min: 1 },
        { name: 'permis', label: 'Permis de travail requis', type: 'select', options: [{ v: '', l: 'Aucun / à définir' }].concat(PERMIS.map(function (p) { return { v: p, l: p }; })) },
        { name: 'description', label: 'Description / constat', type: 'textarea', required: true }],
      values: { equipement: eqId || 'P-101A', type: 'Correctif', priorite: 'Normale', hPrevues: 8 },
      onSubmit: function (v) {
        var e = eq(v.equipement), id = nextOT();
        var o = { id: id, titre: v.titre, type: v.type, priorite: v.priorite, equipement: v.equipement, unite: e ? e.unite : '', demandeur: me(), intervenant: '', statut: 'Demandé', dateDemande: today(), datePrevue: '', dateDebut: '', dateFin: '', dateCloture: '',
          hPrevues: +v.hPrevues || 8, hReelles: 0, cout: 0, permis: v.permis ? [v.permis] : [], pieces: [], description: v.description, arret: '', historique: [{ d: today(), statut: 'Demandé', par: me() }] };
        OT().unshift(o); S.save();
        E.log('Demande d\'intervention ' + id, v.titre + ' — ' + v.equipement, 'maintenance');
        E.notify('Nouvelle demande d\'intervention', id + ' · ' + v.titre, '#/maintenance/ot/' + id, v.priorite === 'Urgente' ? 'red' : 'orange');
        U.toast('Demande ' + id + ' envoyée'); E.go('maintenance/ot/' + id);
      } });
  }

  function ficheOT(view, o) {
    var e = eq(o.equipement) || {}, i = STEPS.indexOf(o.statut), acts = [];
    if (o.statut === 'Demandé') acts.push(['ap', 'success', 'check', 'Approuver'], ['an', 'danger', 'x', 'Refuser']);
    if (o.statut === 'Approuvé') acts.push(['pl', 'primary', 'calendar', 'Planifier']);
    if (o.statut === 'Planifié') acts.push(['go', 'primary', 'arrow', 'Démarrer'], ['pl', '', 'calendar', 'Replanifier']);
    if (o.statut === 'En cours') acts.push(['te', 'success', 'check', 'Terminer']);
    if (o.statut === 'Terminé') acts.push(['cl', 'success', 'lock', 'Clôturer']);
    acts.push(['pr', '', 'print', 'Bon de travail']);
    view.innerHTML = back('#/maintenance/ot', 'Ordres de travail') +
      '<div class="card"><div class="card__b"><div class="mnt-head"><div style="flex:1;min-width:0"><div class="row"><span class="mnt-id">' + o.id + '</span>' + stB(o.statut) + prB(o.priorite) + '<span class="badge plain" style="background:' + TYPE_COL[o.type] + '1a;color:' + TYPE_COL[o.type] + '">' + esc(o.type) + '</span>' + (o.arret ? '<a class="badge tone-navy plain" href="#/maintenance/arrets/' + o.arret + '">' + o.arret + '</a>' : '') + '</div>' +
      '<h2>' + esc(o.titre) + '</h2><div class="muted">' + o.equipement + ' — ' + esc(e.designation || '') + ' · ' + o.unite + ' ' + esc(E.dirName ? (S.get('unites', o.unite) || {}).nom || '' : '') + '</div></div>' +
      '<div class="row mnt-actions">' + acts.map(function (a) { return '<button class="btn ' + a[1] + '" data-a="' + a[0] + '">' + E.icon(a[2]) + a[3] + '</button>'; }).join('') + '</div></div>' +
      '<div style="margin-top:16px">' + (o.statut === 'Annulé' ? U.steps(['Demandé', 'Refusé'], 1, { rejected: true }) : U.steps(STEPS, i, { finished: o.statut === 'Clôturé' })) + '</div></div></div>' +
      '<div class="grid g-2-1" style="margin-top:16px"><div class="stack"><div class="card"><div class="card__h"><h3>Détails de l\'intervention</h3></div><div class="card__b"><dl class="kv">' +
      '<dt>Équipement</dt><dd><a href="#/maintenance/equipements/' + o.equipement + '">' + o.equipement + '</a> — ' + esc(e.designation || '') + ' ' + (e.criticite ? crB(e.criticite) : '') + '</dd>' +
      '<dt>Demandeur</dt><dd>' + esc(E.empName(o.demandeur)) + ' · le ' + F.date(o.dateDemande) + '</dd>' +
      '<dt>Intervenant</dt><dd>' + (o.intervenant ? esc(E.empName(o.intervenant)) : '<span class="muted">Non affecté</span>') + '</dd>' +
      '<dt>Date prévue</dt><dd>' + (o.datePrevue ? F.date(o.datePrevue) : '—') + '</dd>' +
      '<dt>Réalisation</dt><dd>' + (o.dateDebut ? 'du ' + F.date(o.dateDebut) + (o.dateFin ? ' au ' + F.date(o.dateFin) : ' · en cours') : '—') + '</dd>' +
      '<dt>Heures</dt><dd>' + (o.hReelles || 0) + ' h réalisées / ' + o.hPrevues + ' h prévues</dd>' +
      '<dt>Coût</dt><dd>' + (o.cout ? F.money(o.cout) : '—') + '</dd>' +
      '<dt>Description</dt><dd style="font-weight:400">' + esc(o.description || '') + '</dd>' + (o.compteRendu ? '<dt>Compte rendu</dt><dd style="font-weight:400">' + esc(o.compteRendu) + '</dd>' : '') + '</dl></div></div>' +
      '<div class="card"><div class="card__h"><h3>Pièces consommées</h3><span class="sub">' + (o.pieces || []).length + ' référence(s)</span></div>' +
      U.table([{ label: 'Désignation', key: 'designation' }, { label: 'Quantité', num: true, render: function (p) { return F.num(p.qte); } }], o.pieces || [], { empty: 'Aucune pièce saisie.' }) + '</div></div>' +
      '<div class="stack"><div class="card"><div class="card__h"><h3>Permis de travail requis</h3></div><div class="card__b">' +
      ((o.permis || []).length ? '<div class="mnt-permis">' + o.permis.map(function (p) { return '<span>' + E.icon(/feu/i.test(p) ? 'fire' : /confin/i.test(p) ? 'alert' : /hauteur/i.test(p) ? 'helmet' : 'lock') + esc(p) + '</span>'; }).join('') + '</div><p class="small muted" style="margin:12px 0 0">Les permis sont émis et validés par le service HSE avant le démarrage. <a href="#/hse">Ouvrir le module HSE →</a></p>' : '<div class="muted">Aucun permis spécifique.</div>') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Historique</h3></div><div class="card__b"><div class="timeline">' +
      (o.historique || []).map(function (h, k, arr) { return '<div class="tl-item ' + (h.statut === 'Annulé' ? 'rejected' : k === arr.length - 1 && o.statut !== 'Clôturé' ? 'current' : 'done') + '"><b>' + esc(h.statut) + '</b><span>' + F.date(h.d) + ' · ' + esc(h.par || '') + (h.note ? ' — ' + esc(h.note) : '') + '</span></div>'; }).join('') + '</div></div></div></div></div>';
    E.$$('[data-a]', view).forEach(function (b) {
      b.onclick = function () {
        var a = b.dataset.a;
        if (a === 'ap') setStatus(o, 'Approuvé', {}, 'Demande approuvée');
        else if (a === 'an') U.formModal({ title: 'Refuser ' + o.id, size: 'sm', fields: [{ name: 'motif', label: 'Motif du refus', type: 'textarea', required: true }], okLabel: 'Refuser', onSubmit: function (v) { setStatus(o, 'Annulé', {}, v.motif); } });
        else if (a === 'pl') planifier(o);
        else if (a === 'go') setStatus(o, 'En cours', { dateDebut: today() }, 'Intervention démarrée');
        else if (a === 'te') terminer(o);
        else if (a === 'cl') cloturer(o);
        else if (a === 'pr') printOT(o);
      };
    });
  }
  function printOT(o) {
    var e = eq(o.equipement) || {};
    U.modal({ title: 'Bon de travail ' + o.id, size: 'lg', body: '<div class="doc"><div class="doc__head"><div><img src="../assets/img/logo.png" alt="SOGARA"><div class="small muted" style="margin-top:6px">Société Gabonaise de Raffinage · Port-Gentil</div></div><div style="text-align:right"><h4>BON DE TRAVAIL</h4><div class="mono">' + o.id + '</div><div class="small muted">Émis le ' + F.date(today()) + '</div></div></div>' +
      '<dl class="kv"><dt>Intervention</dt><dd>' + esc(o.titre) + '</dd><dt>Type / priorité</dt><dd>' + esc(o.type) + ' · ' + esc(o.priorite) + '</dd><dt>Équipement</dt><dd>' + o.equipement + ' — ' + esc(e.designation || '') + ' (' + o.unite + ', criticité ' + (e.criticite || '—') + ')</dd>' +
      '<dt>Demandeur</dt><dd>' + esc(E.empName(o.demandeur)) + '</dd><dt>Intervenant</dt><dd>' + esc(E.empName(o.intervenant) || '—') + '</dd><dt>Date prévue</dt><dd>' + (o.datePrevue ? F.date(o.datePrevue) : '—') + '</dd><dt>Heures prévues</dt><dd>' + o.hPrevues + ' h</dd>' +
      '<dt>Permis requis</dt><dd>' + ((o.permis || []).join(', ') || 'Aucun') + '</dd><dt>Description</dt><dd>' + esc(o.description || '') + '</dd></dl>' +
      '<h4 style="font-size:14px;margin:18px 0 8px">Pièces et consommables</h4>' + U.table([{ label: 'Désignation', key: 'designation' }, { label: 'Qté', num: true, key: 'qte' }], o.pieces || [], { empty: 'Néant' }) +
      '<div class="grid g3" style="margin-top:26px"><div class="small">Visa exploitation<br><br>…………………</div><div class="small">Visa HSE (permis)<br><br>…………………</div><div class="small">Visa maintenance<br><br>…………………</div></div></div>',
      actions: [{ label: 'Fermer' }, { label: 'Imprimer', cls: 'primary', icon: 'print', onClick: function () { window.print(); } }] });
  }

  /* ------------------------------------------------------------------ équipements */
  function vEQ(el) {
    var L0 = EQ(), nE = L0.filter(echue).length;
    el.innerHTML = '<div class="section-title" style="margin-bottom:14px"><div><h2>Parc d\'équipements</h2><p>' + L0.length + ' équipements suivis · ' + L0.filter(function (e) { return e.reglementaire; }).length + ' soumis à inspection réglementaire.</p></div><span class="spacer"></span><button class="btn" id="eq-csv">' + E.icon('download') + 'Exporter</button></div>' +
      (nE ? '<div class="alert tone-red" style="margin-bottom:14px">' + E.icon('alert') + '<div><b>' + nE + ' inspection(s) échue(s)</b> — à programmer en priorité (obligation réglementaire des équipements sous pression).</div></div>' : '') +
      '<div class="filters"><select class="select" id="eq-un"><option value="">Toutes les unités</option>' + S.all('unites').map(function (u) { return '<option value="' + u.id + '"' + (fEQ.unite === u.id ? ' selected' : '') + '>' + u.id + ' — ' + esc(u.nom) + '</option>'; }).join('') + '</select>' +
      '<select class="select" id="eq-cr"><option value="">Toutes criticités</option><option value="A"' + (fEQ.crit === 'A' ? ' selected' : '') + '>Criticité A (critique)</option><option value="B"' + (fEQ.crit === 'B' ? ' selected' : '') + '>Criticité B</option><option value="C"' + (fEQ.crit === 'C' ? ' selected' : '') + '>Criticité C</option></select>' +
      '<button class="chip' + (fEQ.alerte ? ' is-active' : '') + '" id="eq-al">Inspection échue · ' + nE + '</button>' +
      '<input class="input" id="eq-q" type="search" placeholder="Repère, désignation…" value="' + esc(fEQ.q) + '"></div><div class="card" id="eq-res"></div>';
    var cols = [
      { label: 'Repère', render: function (e) { return '<b class="mono">' + e.id + '</b>'; } },
      { label: 'Désignation', render: function (e) { return '<b>' + esc(e.designation) + '</b><div class="small muted">' + esc(e.type) + '</div>'; } },
      { label: 'Unité', render: function (e) { return e.unite; } },
      { label: 'Criticité', render: function (e) { return crB(e.criticite); } },
      { label: 'Statut', render: function (e) { return U.badge(e.statut, EQ_TONE[e.statut]); } },
      { label: 'Dernière insp.', cls: 'nowrap', render: function (e) { return F.dateShort(e.derniereInspection); } },
      { label: 'Prochaine insp.', cls: 'nowrap', render: function (e) { return echue(e) ? '<span class="badge tone-red">' + F.dateShort(e.prochaineInspection) + ' · échue</span>' : F.dateShort(e.prochaineInspection); } },
      { label: 'Heures de marche', num: true, render: function (e) { return e.heures ? F.num(e.heures) + ' h' : '—'; } },
      { label: 'Disponibilité', render: function (e) { return e.disponibilite ? '<div style="min-width:110px">' + U.progress(e.disponibilite, e.disponibilite < 97 ? 'orange' : 'green') + '</div>' : '<span class="muted">—</span>'; } }
    ];
    function list() { var q = E.norm(fEQ.q); return EQ().filter(function (e) { return (!fEQ.unite || e.unite === fEQ.unite) && (!fEQ.crit || e.criticite === fEQ.crit) && (!fEQ.alerte || echue(e)) && (!q || E.norm(e.id + ' ' + e.designation + ' ' + e.type).indexOf(q) >= 0); }); }
    function draw() { E.$('#eq-res', el).innerHTML = U.table(cols, list(), { onRow: function (e) { E.go('maintenance/equipements/' + e.id); }, empty: 'Aucun équipement.' }); }
    draw();
    E.$('#eq-un', el).onchange = function (e) { fEQ.unite = e.target.value; draw(); };
    E.$('#eq-cr', el).onchange = function (e) { fEQ.crit = e.target.value; draw(); };
    E.$('#eq-q', el).oninput = function (e) { fEQ.q = e.target.value; draw(); };
    E.$('#eq-al', el).onclick = function (e) { fEQ.alerte = !fEQ.alerte; e.currentTarget.classList.toggle('is-active', fEQ.alerte); draw(); };
    E.$('#eq-csv', el).onclick = function () { U.exportCSV('equipements', [{ label: 'Repère', key: 'id' }, { label: 'Désignation', key: 'designation' }, { label: 'Type', key: 'type' }, { label: 'Unité', key: 'unite' }, { label: 'Criticité', key: 'criticite' }, { label: 'Statut', key: 'statut' }, { label: 'Dernière inspection', key: 'derniereInspection' }, { label: 'Prochaine inspection', key: 'prochaineInspection' }, { label: 'Heures', key: 'heures' }, { label: 'MTBF h', key: 'mtbf' }, { label: 'Disponibilité %', key: 'disponibilite' }], list()); };
  }
  function ficheEQ(view, e) {
    var O = OT().filter(function (o) { return o.equipement === e.id; }).sort(function (a, b) { return a.dateDemande < b.dateDemande ? 1 : -1; });
    var G = S.all('gammes').filter(function (g) { return g.equipement === e.id; });
    var ech = echue(e), dd = E.daysBetween(today(), e.prochaineInspection);
    view.innerHTML = back('#/maintenance/equipements', 'Parc d\'équipements') +
      '<div class="card"><div class="card__b"><div class="mnt-head"><div style="flex:1;min-width:0"><div class="row"><span class="mnt-id">' + e.id + '</span>' + crB(e.criticite) + U.badge(e.statut, EQ_TONE[e.statut]) + (e.reglementaire ? U.badge('Équipement réglementé', 'violet') : '') + '</div><h2>' + esc(e.designation) + '</h2><div class="muted">' + esc(e.type) + ' · ' + e.unite + ' — ' + esc((S.get('unites', e.unite) || {}).nom || '') + ' · en service depuis ' + e.miseEnService + '</div></div>' +
      '<div class="row mnt-actions"><button class="btn primary" id="eq-di">' + E.icon('plus') + 'Demande d\'intervention</button><button class="btn" id="eq-in">' + E.icon('check') + 'Enregistrer une inspection</button></div></div></div></div>' +
      (ech ? '<div class="alert tone-red" style="margin-top:16px">' + E.icon('alert') + '<div><b>Inspection échue depuis le ' + F.date(e.prochaineInspection) + '</b> (' + (-dd) + ' jours). L\'équipement doit être inspecté ou faire l\'objet d\'une dérogation.</div></div>' : '') +
      '<div class="grid g4" style="margin-top:16px">' + U.kpi({ label: 'Disponibilité', value: e.disponibilite ? F.num(e.disponibilite, 1) : '—', unit: '%', icon: 'target', tone: 'green' }) + U.kpi({ label: 'MTBF', value: e.mtbf ? F.num(e.mtbf) : '—', unit: 'h', icon: 'trend', tone: 'violet' }) +
      U.kpi({ label: 'Heures de marche', value: e.heures ? F.num(e.heures) : '—', icon: 'clock', tone: 'blue' }) + U.kpi({ label: 'OT ouverts', value: O.filter(isOpen).length, unit: '/ ' + O.length, icon: 'wrench', tone: 'orange' }) + '</div>' +
      '<div class="grid g-2-1" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Historique des interventions</h3><span class="sub">' + O.length + ' OT · ' + F.short(E.sum(O, 'cout')) + ' FCFA</span></div>' +
      U.table([OT_COLS[0], { label: 'Intervention', render: function (o) { return '<b>' + esc(o.titre) + '</b><div class="small muted">' + esc(o.type) + '</div>'; } }, { label: 'Date', cls: 'nowrap', render: function (o) { return F.dateShort(o.dateFin || o.datePrevue || o.dateDemande); } }, { label: 'Coût', num: true, render: function (o) { return o.cout ? F.short(o.cout) : '—'; } }, OT_COLS[7]], O, { onRow: function (o) { E.go('maintenance/ot/' + o.id); }, empty: 'Aucune intervention enregistrée.' }) + '</div>' +
      '<div class="stack"><div class="card"><div class="card__h"><h3>Inspections</h3><span class="sub">périodicité ' + e.periodicite + ' mois</span></div><div class="card__b"><div class="timeline">' +
      '<div class="tl-item done"><b>Dernière inspection</b><span>' + F.date(e.derniereInspection) + '</span></div>' +
      '<div class="tl-item ' + (ech ? 'rejected' : 'current') + '"><b>Prochaine inspection</b><span>' + F.date(e.prochaineInspection) + ' · ' + (ech ? 'échue' : 'dans ' + dd + ' jours') + '</span></div></div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Gammes préventives</h3></div><div class="list">' + (G.length ? G.map(function (g) { return '<div class="list__item"><div class="list__icon tone-green">' + E.icon('refresh') + '</div><div class="list__body"><b>' + esc(g.titre) + '</b><div class="small muted">Tous les ' + g.periodicite + ' j · prochaine le ' + F.date(g.prochaine) + ' · ' + g.duree + ' h</div></div></div>'; }).join('') : '<div class="empty">Aucune gamme associée.</div>') + '</div></div></div></div>';
    E.$('#eq-di', view).onclick = function () { newDI(e.id); };
    E.$('#eq-in', view).onclick = function () { U.confirm('Enregistrer une inspection', 'Inspection de <b>' + e.id + '</b> réalisée ce jour avec un résultat conforme ? La prochaine échéance sera fixée à ' + e.periodicite + ' mois.', 'Enregistrer', function () { inspecter(e); }, 'success'); };
  }

  /* ------------------------------------------------------------------ arrêts techniques */
  function vArrets(el) {
    var A = S.all('arrets').slice().sort(function (a, b) { var r = { 'En cours': 0, 'En préparation': 1, 'Planifié': 1, 'Terminé': 2 }; return (r[a.statut] - r[b.statut]) || (a.debut < b.debut ? 1 : -1); });
    el.innerHTML = '<div class="section-title" style="margin-bottom:14px"><div><h2>Arrêts techniques</h2><p>Préparation, planning des lots de travaux et suivi des entreprises intervenantes.</p></div></div><div class="grid g3" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">' + A.map(function (a) {
      var av = arrAv(a), t = today(), j = E.daysBetween(t, a.debut);
      return '<article class="card mnt-arr" data-id="' + a.id + '"><div class="row"><span class="mnt-id">' + a.id + '</span>' + U.badge(a.statut, { 'En cours': 'blue', 'En préparation': 'violet', 'Terminé': 'green' }[a.statut]) + '<span class="spacer"></span><span class="small muted">' + esc(a.type) + '</span></div>' +
        '<h3>' + esc(a.nom) + '</h3><div class="small muted">' + F.date(a.debut) + ' → ' + F.date(a.fin) + ' · ' + (E.daysBetween(a.debut, a.fin) + 1) + ' jours · ' + a.unites.join(', ') + '</div>' +
        (a.statut === 'En préparation' ? '<div class="row"><span class="mnt-count">J-' + j + '</span><span class="small muted">avant le début de l\'arrêt</span></div><div class="mnt-mini"><div>OT préparés<b>' + a.prep.ot + ' %</b></div><div>Permis prêts<b>' + a.prep.permis + ' %</b></div><div>Pièces reçues<b>' + a.prep.pieces + ' %</b></div></div>'
          : '<div><div class="small muted" style="margin-bottom:5px">Avancement des travaux</div>' + U.progress(av) + '</div>') +
        '<div class="mnt-mini"><div>Budget<b>' + F.short(a.budget) + '</b></div><div>Engagé<b>' + F.pct(a.engage / a.budget * 100) + '</b></div><div>Lots<b>' + a.lots.length + '</b></div></div></article>';
    }).join('') + '</div>';
    el.onclick = function (e) { var c = e.target.closest('.mnt-arr'); if (c) E.go('maintenance/arrets/' + c.dataset.id); };
  }
  function ficheArret(view, a) {
    var av = arrAv(a), t = today(), F2 = S.all('fournisseurs');
    var rows = [], groups = E.groupBy(a.lots.slice().sort(function (x, y) { return x.s < y.s ? -1 : 1; }), 'lot');
    Object.keys(groups).forEach(function (g) {
      var L = groups[g];
      if (L.length > 1) rows.push({ label: g, sub: L.length + ' lots', group: true, start: L.reduce(function (m, l) { return !m || l.s < m ? l.s : m; }, null), end: L.reduce(function (m, l) { return !m || l.e > m ? l.e : m; }, null) });
      L.forEach(function (l) {
        var late = l.p < 100 && l.e < t;
        rows.push({ label: (l.critique ? '★ ' : '') + l.t, sub: (L.length > 1 ? '' : g + ' · ') + (l.entreprise ? (S.get('fournisseurs', l.entreprise) || {}).nom : 'Équipes SOGARA') + ' · ' + l.effectif + ' pers.', start: l.s, end: l.e, progress: l.p, cls: l.p >= 100 ? 'done' : late ? 'late' : l.critique ? 'warn' : '' });
      });
    });
    var ent = {}; a.lots.forEach(function (l) { var k = l.entreprise || 'SOGARA'; ent[k] = ent[k] || { lots: 0, eff: 0, cout: 0 }; ent[k].lots++; ent[k].eff += l.effectif; ent[k].cout += l.cout || 0; });
    var crit = a.lots.filter(function (l) { return l.critique; }).sort(function (x, y) { return x.s < y.s ? -1 : 1; });
    var Ot = OT().filter(function (o) { return o.arret === a.id; });
    var jx = a.statut === 'En préparation' ? 'J-' + E.daysBetween(t, a.debut) : a.statut === 'En cours' ? 'J' + (E.daysBetween(a.debut, t) + 1) + ' / ' + (E.daysBetween(a.debut, a.fin) + 1) : 'Terminé';
    view.innerHTML = back('#/maintenance/arrets', 'Arrêts techniques') +
      '<div class="card"><div class="card__b"><div class="mnt-head"><div style="flex:1;min-width:0"><div class="row"><span class="mnt-id">' + a.id + '</span>' + U.badge(a.statut, { 'En cours': 'blue', 'En préparation': 'violet', 'Terminé': 'green' }[a.statut]) + U.badge(a.type, 'grey') + '</div><h2>' + esc(a.nom) + '</h2><div class="muted">' + F.date(a.debut) + ' → ' + F.date(a.fin) + ' · unités ' + a.unites.join(', ') + ' · responsable ' + esc(E.empName(a.responsable)) + '</div><p style="margin:10px 0 0;color:var(--ink-2);max-width:900px">' + esc(a.objectifs) + '</p></div>' +
      '<div style="text-align:right"><div class="mnt-count">' + jx + '</div><div class="small muted">' + (a.statut === 'En préparation' ? 'avant le démarrage' : 'durée de l\'arrêt') + '</div>' + (a.statut !== 'Terminé' ? '<button class="btn sm" id="ar-prep" style="margin-top:8px">' + E.icon('edit') + 'Mettre à jour la préparation</button>' : '') + '</div></div></div></div>' +
      '<div class="grid g-1-2" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Indicateurs de préparation</h3></div><div class="card__b"><div class="mnt-gauges">' +
      [['ot', 'OT préparés'], ['permis', 'Permis prêts'], ['pieces', 'Pièces reçues']].map(function (k) { var v = a.prep[k[0]]; return '<div>' + U.gauge(v, k[1], v >= 90 ? '#1e9e4a' : v >= 60 ? '#f5c400' : '#e8780c') + '</div>'; }).join('') + '</div>' +
      '<div style="margin-top:16px"><div class="small muted" style="margin-bottom:5px">Avancement des travaux</div>' + U.progress(av) + '</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Budget de l\'arrêt</h3></div><div class="card__b"><div class="grid g3" style="gap:12px"><div><div class="small muted">Budget</div><b style="font:700 20px Sora">' + F.short(a.budget) + '</b></div><div><div class="small muted">Engagé</div><b style="font:700 20px Sora">' + F.short(a.engage) + '</b></div><div><div class="small muted">Reste à engager</div><b style="font:700 20px Sora">' + F.short(a.budget - a.engage) + '</b></div></div><div style="margin:12px 0 16px">' + U.progress(a.engage / a.budget * 100, a.engage / a.budget > .9 ? 'orange' : '') + '</div>' +
      '<div class="small muted" style="margin-bottom:8px">Montant des lots par entreprise</div>' + U.donut(Object.keys(ent).sort(function (x, y) { return ent[y].cout - ent[x].cout; }).map(function (k) { return { label: k === 'SOGARA' ? 'SOGARA (interne)' : (S.get('fournisseurs', k) || {}).nom || k, value: ent[k].cout }; }), { money: true, size: 130, center: F.short(E.sum(Object.keys(ent).map(function (k) { return ent[k].cout; }))), sub: 'FCFA' }) + '</div></div></div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Planning des lots de travaux</h3><span class="sub">★ = chemin critique (barres orange)</span></div>' + U.gantt({ rows: rows, from: E.addDays(a.lots.reduce(function (m, l) { return !m || l.s < m ? l.s : m; }, null), -1), to: E.addDays(a.fin, 1), unit: E.daysBetween(a.debut, a.fin) > 40 ? 'week' : 'day', title: 'Lot de travaux' }) + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Avancement des lots</h3><span class="sub">mise à jour quotidienne</span></div>' +
      U.table([{ label: 'Lot', render: function (l) { return '<b>' + (l.critique ? '★ ' : '') + esc(l.t) + '</b><div class="small muted">' + esc(l.lot) + '</div>'; } }, { label: 'Entreprise', render: function (l) { return esc(l.entreprise ? (S.get('fournisseurs', l.entreprise) || {}).nom : 'Équipes SOGARA'); } },
        { label: 'Dates', cls: 'nowrap', render: function (l) { return F.dateShort(l.s) + ' → ' + F.dateShort(l.e); } }, { label: 'Effectif', num: true, render: function (l) { return l.effectif; } },
        { label: 'Avancement', render: function (l) { return a.statut === 'Terminé' ? U.progress(l.p) : '<div class="mnt-range"><input type="range" min="0" max="100" step="5" value="' + l.p + '" data-li="' + a.lots.indexOf(l) + '"><output>' + l.p + ' %</output></div>'; } },
        { label: 'Statut', render: function (l) { var late = l.p < 100 && l.e < t; return U.badge(late ? 'En retard' : l.statut, late ? 'red' : { 'Terminé': 'green', 'En cours': 'blue', 'À démarrer': 'grey' }[l.statut]); } }], a.lots.slice().sort(function (x, y) { return x.s < y.s ? -1 : 1; })) + '</div>' +
      '<div class="grid g3" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Entreprises intervenantes</h3><span class="sub">' + Object.keys(ent).length + ' · ' + E.sum(Object.keys(ent).map(function (k) { return ent[k].eff; })) + ' personnes au pic</span></div><div class="list">' +
      Object.keys(ent).map(function (k) { var f = F2.find(function (x) { return x.id === k; }); return '<div class="list__item">' + U.avatar(f ? f.nom : 'SOGARA', f ? null : '#0a1f44') + '<div class="list__body"><b>' + esc(f ? f.nom : 'SOGARA — équipes internes') + '</b><div class="small muted">' + esc(f ? f.domaine : 'Exploitation, inspection, maintenance') + ' · ' + ent[k].lots + ' lot(s) · ' + ent[k].eff + ' pers.</div></div></div>'; }).join('') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Chemin critique</h3><span class="sub">' + crit.length + ' lots</span></div><div class="card__b"><div class="timeline">' + crit.map(function (l) { return '<div class="tl-item ' + (l.p >= 100 ? 'done' : l.s <= t ? 'current' : '') + '"><b>' + esc(l.t) + '</b><span>' + F.dateShort(l.s) + ' → ' + F.dateShort(l.e) + ' · ' + l.p + ' %</span></div>'; }).join('') + '</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Ordres de travail rattachés</h3><span class="sub">' + Ot.length + '</span></div><div class="list">' + (Ot.length ? Ot.map(function (o) { return '<a class="list__item" style="color:inherit" href="#/maintenance/ot/' + o.id + '"><div class="list__icon tone-blue">' + E.icon('wrench') + '</div><div class="list__body"><b>' + o.id + '</b> ' + stB(o.statut) + '<div class="small muted">' + esc(o.titre) + '</div></div></a>'; }).join('') : '<div class="empty">Les OT seront rattachés au fil de la préparation.</div>') + '</div></div></div>';
    E.$$('input[type=range]', view).forEach(function (r) {
      r.oninput = function () { r.nextElementSibling.textContent = r.value + ' %'; };
      r.onchange = function () { var l = a.lots[+r.dataset.li], o = l.p; l.p = +r.value; l.statut = l.p >= 100 ? 'Terminé' : l.p > 0 ? 'En cours' : 'À démarrer'; S.update('arrets', a.id, { lots: a.lots }); E.log('Arrêt ' + a.id + ' — avancement lot', l.t + ' : ' + o + ' % → ' + l.p + ' %', 'maintenance'); if (l.p >= 100 && l.critique) E.notify('Lot critique terminé', a.id + ' · ' + l.t, '#/maintenance/arrets/' + a.id, 'green'); U.toast('Lot mis à jour · avancement de l\'arrêt ' + arrAv(a) + ' %'); refresh(); };
    });
    var pb = E.$('#ar-prep', view);
    if (pb) pb.onclick = function () {
      U.formModal({ title: 'Indicateurs de préparation', sub: a.nom, size: 'sm', fields: [{ name: 'ot', label: '% d\'OT préparés (gammes, devis, pièces identifiées)', type: 'number', min: 0 }, { name: 'permis', label: '% de permis prêts', type: 'number', min: 0 }, { name: 'pieces', label: '% de pièces reçues', type: 'number', min: 0 }], values: a.prep,
        onSubmit: function (v) { var p = { ot: Math.min(100, +v.ot || 0), permis: Math.min(100, +v.permis || 0), pieces: Math.min(100, +v.pieces || 0) }; S.update('arrets', a.id, { prep: p }); E.log('Préparation arrêt ' + a.id, 'OT ' + p.ot + ' % · permis ' + p.permis + ' % · pièces ' + p.pieces + ' %', 'maintenance'); U.toast('Indicateurs de préparation mis à jour'); refresh(); } });
    };
  }

  /* ------------------------------------------------------------------ planning préventif (8 semaines) */
  function vPrev(el) {
    var t = today(), w0 = monday(t), wEnd = E.addDays(w0, 56), G = S.all('gammes'), items = [];
    G.forEach(function (g) {
      var d = g.prochaine; while (d < w0) d = E.addDays(d, g.periodicite);
      for (; d < wEnd; d = E.addDays(d, g.periodicite)) {
        var ot = OT().find(function (o) { return o.gamme === g.id && o.occ === d; });
        items.push({ kind: 'gamme', d: d, g: g, ot: ot, h: g.duree, color: '#1e9e4a' });
      }
    });
    OT().forEach(function (o) { if (!o.gamme && o.datePrevue && o.datePrevue >= w0 && o.datePrevue < wEnd && ['Planifié', 'Approuvé', 'En cours'].indexOf(o.statut) >= 0) items.push({ kind: 'ot', d: o.datePrevue, o: o, h: o.hPrevues, color: TYPE_COL[o.type] }); });
    EQ().forEach(function (e) { if (e.prochaineInspection >= w0 && e.prochaineInspection < wEnd) items.push({ kind: 'insp', d: e.prochaineInspection, e: e, h: 0, color: '#7c3aed' }); });
    var late = EQ().filter(echue);
    var weeks = []; for (var k = 0; k < 8; k++) { var a = E.addDays(w0, k * 7), b = E.addDays(a, 6); weeks.push({ a: a, b: b, it: items.filter(function (x) { return x.d >= a && x.d <= b; }).sort(function (x, y) { return x.d < y.d ? -1 : 1; }) }); }
    var cap = techs().length * 40;
    el.innerHTML = '<div class="section-title" style="margin-bottom:14px"><div><h2>Planning préventif — 8 semaines</h2><p>Gammes de maintenance préventive, OT planifiés et échéances d\'inspection réglementaire.</p></div></div>' +
      (late.length ? '<div class="alert tone-red" style="margin-bottom:14px">' + E.icon('alert') + '<div><b>En retard :</b> ' + late.map(function (e) { return '<a href="#/maintenance/equipements/' + e.id + '">' + e.id + '</a> (inspection échue le ' + F.date(e.prochaineInspection) + ')'; }).join(', ') + '</div></div>' : '') +
      '<div class="grid g-2-1"><div class="card"><div class="card__h"><h3>Charge planifiée par semaine</h3><span class="sub">heures · capacité ' + cap + ' h/semaine (' + techs().length + ' techniciens)</span></div><div class="card__b mnt-ch">' +
      U.bars({ labels: weeks.map(function (w) { return 'S' + weekNo(w.a); }), series: [{ name: 'Préventif (gammes)', values: weeks.map(function (w) { return E.sum(w.it.filter(function (x) { return x.kind === 'gamme'; }), 'h'); }), color: '#1e9e4a' }, { name: 'OT planifiés', values: weeks.map(function (w) { return E.sum(w.it.filter(function (x) { return x.kind === 'ot'; }), 'h'); }), color: '#163b75' }], stacked: true, height: 200 }) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Sur 8 semaines</h3></div><div class="card__b"><dl class="kv"><dt>Interventions préventives</dt><dd>' + items.filter(function (x) { return x.kind === 'gamme'; }).length + '</dd><dt>OT déjà générés</dt><dd>' + items.filter(function (x) { return x.kind === 'gamme' && x.ot; }).length + '</dd><dt>OT planifiés (autres)</dt><dd>' + items.filter(function (x) { return x.kind === 'ot'; }).length + '</dd><dt>Inspections réglementaires</dt><dd>' + items.filter(function (x) { return x.kind === 'insp'; }).length + '</dd><dt>Gammes actives</dt><dd>' + G.length + '</dd></dl>' +
      '<div class="legend" style="margin-top:14px"><span><i style="background:#1e9e4a"></i>Gamme préventive</span><span><i style="background:#163b75"></i>OT planifié</span><span><i style="background:#7c3aed"></i>Inspection</span></div></div></div></div>' +
      '<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(290px,1fr));margin-top:16px">' + weeks.map(function (w, i) {
        return '<div class="card mnt-week"><div class="card__h"><h3>Semaine ' + weekNo(w.a) + '</h3><span class="sub">' + F.dateShort(w.a) + ' → ' + F.dateShort(w.b) + '</span>' + (i === 0 ? U.badge('En cours', 'blue') : '') + '<span class="spacer"></span><span class="small muted">' + E.sum(w.it, 'h') + ' h</span></div>' +
          (w.it.length ? w.it.map(function (x) {
            var day = E.parseDate(x.d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit' });
            if (x.kind === 'gamme') return '<div class="mnt-it"><span class="mnt-dot" style="background:' + x.color + '"></span><div style="flex:1;min-width:0"><b>' + esc(x.g.titre) + '</b><span class="muted">' + day + ' · ' + x.g.equipement + ' · ' + x.g.duree + ' h · ' + esc(E.empName(x.g.intervenant)) + '</span></div>' + (x.ot ? '<a class="badge tone-green" href="#/maintenance/ot/' + x.ot.id + '">' + x.ot.id + '</a>' : '<button class="btn sm" data-gen="' + x.g.id + '|' + x.d + '">Créer l\'OT</button>') + '</div>';
            if (x.kind === 'ot') return '<a class="mnt-it" style="color:inherit" href="#/maintenance/ot/' + x.o.id + '"><span class="mnt-dot" style="background:' + x.color + '"></span><div style="flex:1;min-width:0"><b>' + esc(x.o.titre) + '</b><span class="muted">' + day + ' · ' + x.o.id + ' · ' + x.o.equipement + ' · ' + x.o.hPrevues + ' h</span></div>' + stB(x.o.statut) + '</a>';
            return '<a class="mnt-it" style="color:inherit" href="#/maintenance/equipements/' + x.e.id + '"><span class="mnt-dot" style="background:' + x.color + '"></span><div style="flex:1;min-width:0"><b>Échéance d\'inspection · ' + x.e.id + '</b><span class="muted">' + day + ' · ' + esc(x.e.designation) + '</span></div>' + U.badge('Réglementaire', 'violet') + '</a>';
          }).join('') : '<div class="empty" style="padding:24px">Aucune intervention</div>') + '</div>';
      }).join('') + '</div>';
    el.onclick = function (e) {
      var b = e.target.closest('[data-gen]'); if (!b) return;
      var p = b.dataset.gen.split('|'), g = S.get('gammes', p[0]), q = eq(g.equipement), id = nextOT();
      OT().unshift({ id: id, titre: g.titre, type: 'Préventif', priorite: 'Normale', equipement: g.equipement, unite: q ? q.unite : '', demandeur: 'Plan de maintenance', intervenant: g.intervenant, statut: 'Planifié', dateDemande: today(), datePrevue: p[1], dateDebut: '', dateFin: '', dateCloture: '',
        hPrevues: g.duree, hReelles: 0, cout: 0, permis: [], pieces: [], description: 'OT généré automatiquement depuis la gamme ' + g.id + ' (périodicité ' + g.periodicite + ' jours).', arret: '', gamme: g.id, occ: p[1],
        historique: [{ d: today(), statut: 'Demandé', par: 'Plan de maintenance' }, { d: today(), statut: 'Approuvé', par: me() }, { d: today(), statut: 'Planifié', par: me(), note: 'Prévu le ' + F.date(p[1]) }] });
      S.save(); E.log('OT préventif généré ' + id, g.titre + ' — ' + F.date(p[1]), 'maintenance'); U.toast(id + ' planifié le ' + F.date(p[1])); refresh();
    };
  }

  /* ------------------------------------------------------------------ enregistrement */
  E.register({
    id: 'maintenance', label: 'Maintenance & arrêts', title: 'Maintenance & arrêts techniques', icon: 'wrench', group: 'Opérations', roles: ['projets', 'hse'],
    seed: seed, render: render,
    summary: function () {
      var open = OT().filter(isOpen), critA = EQ().filter(function (e) { return e.criticite === 'A' && e.mtbf; }), arr = S.all('arrets').find(function (a) { return a.statut === 'En cours'; });
      var out = [{ label: 'OT de maintenance ouverts', value: String(open.length), icon: 'wrench', tone: 'orange', foot: open.filter(function (o) { return o.priorite === 'Urgente'; }).length + ' urgent(s) · ' + OT().filter(function (o) { return o.statut === 'Demandé'; }).length + ' à approuver', href: '#/maintenance/ot' },
        { label: 'Disponibilité équipements critiques', value: F.num(E.sum(critA, 'disponibilite') / (critA.length || 1), 1) + ' %', icon: 'target', tone: 'green', foot: EQ().filter(echue).length + ' inspection(s) échue(s)', href: '#/maintenance/equipements' }];
      if (arr) out.push({ label: 'Arrêt en cours · ' + arr.unites.join(', '), value: arrAv(arr) + ' %', icon: 'factory', tone: 'blue', foot: 'redémarrage prévu le ' + F.date(arr.fin), href: '#/maintenance/arrets/' + arr.id });
      return out;
    },
    pending: function (user) {
      var p = user && user.profile, out = [];
      if (p === 'admin' || p === 'projets') OT().filter(function (o) { return o.statut === 'Demandé'; }).forEach(function (o) { out.push({ title: o.id + ' · ' + o.titre, sub: 'OT à approuver · ' + o.equipement + ' · priorité ' + o.priorite.toLowerCase() + ' · ' + E.empName(o.demandeur), date: o.dateDemande, href: '#/maintenance/ot/' + o.id, tone: o.priorite === 'Urgente' ? 'red' : 'orange' }); });
      if (p === 'admin' || p === 'projets' || p === 'hse') EQ().filter(echue).forEach(function (e) { out.push({ title: 'Inspection échue · ' + e.id, sub: e.designation + ' · échéance ' + F.date(e.prochaineInspection), date: e.prochaineInspection, href: '#/maintenance/equipements/' + e.id, tone: 'red' }); });
      if (p === 'hse') OT().filter(function (o) { return o.statut === 'Planifié' && (o.permis || []).length; }).forEach(function (o) { out.push({ title: 'Permis à préparer · ' + o.id, sub: o.permis.join(', ') + ' · ' + o.equipement + ' · le ' + F.date(o.datePrevue), date: o.datePrevue, href: '#/maintenance/ot/' + o.id, tone: 'orange' }); });
      return out;
    },
    search: function (q) {
      var r = [];
      OT().forEach(function (o) { if (E.norm(o.id + ' ' + o.titre + ' ' + o.equipement).indexOf(q) >= 0) r.push({ title: o.id + ' · ' + o.titre, sub: o.equipement + ' · ' + o.statut, href: '#/maintenance/ot/' + o.id }); });
      EQ().forEach(function (e) { if (E.norm(e.id + ' ' + e.designation + ' ' + e.type).indexOf(q) >= 0) r.push({ title: e.id + ' — ' + e.designation, sub: 'Équipement · ' + e.unite + ' · ' + e.statut, href: '#/maintenance/equipements/' + e.id }); });
      S.all('arrets').forEach(function (a) { if (E.norm(a.id + ' ' + a.nom).indexOf(q) >= 0) r.push({ title: a.nom, sub: 'Arrêt technique · ' + a.statut, href: '#/maintenance/arrets/' + a.id }); });
      return r;
    },
    badge: function () { var u = E.session.user(), p = u && u.profile; var n = EQ().filter(echue).length; if (p === 'admin' || p === 'projets') n += OT().filter(function (o) { return o.statut === 'Demandé'; }).length; return n; }
  });
})();
