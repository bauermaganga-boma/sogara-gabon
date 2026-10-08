/* SOGARA · Espace de gestion — module « Projets » (portefeuille, planning Gantt, fiches projet).
   La collection `projets` est partagée avec le site public (page Projets) : champs public, avancement,
   statut, jalons, resume, partenaire, fin. Toute mise à jour faite ici apparaît aussitôt sur le site. */
(function () {
  'use strict';
  var E = window.ERP, S = E.store, U = E.ui, F = E.fmt, esc = E.esc, COL = 'projets';
  var STATUTS = ['Études', 'Planifié', 'En cours', 'Suspendu', 'Terminé'];
  var METEO = {
    soleil: { l: 'Au vert', tone: 'green', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="#fde68a" stroke="#e8a50c"/><path stroke="#e8a50c" d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>' },
    nuage: { l: 'Vigilance', tone: 'orange', svg: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><circle cx="8.5" cy="8.5" r="3.2" fill="#fde68a" stroke="#e8a50c"/><path d="M7 19h10.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.2A4 4 0 0 0 7 19z" fill="#e2e8f0" stroke="#64748b"/></svg>' },
    orage: { l: 'Critique', tone: 'red', svg: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16h10.5a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.2A4 4 0 0 0 7 16z" fill="#cbd5e1" stroke="#475569"/><path d="M12.5 13.5 10.5 17h3l-2 4" stroke="#d93636" stroke-width="2"/></svg>' }
  };
  var M = function (i) { return 'MAT-' + (1041 + i * 7); };
  var cur = { view: null, params: [] };
  var flt = { q: '', vue: 'tous', statut: '' };
  var planUnit = null, ficheUnit = 'month';

  /* ------------------------------------------------------------------ utilitaires */
  function all() { return S.all(COL); }
  function get(id) { return S.get(COL, id); }
  function today() { return E.today(); }
  function mIdx(d) { var p = String(d).slice(0, 7).split('-'); return +p[0] * 12 + (+p[1] - 1); }
  function mFrac(d) { var x = E.parseDate(d), dim = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate(); return x.getFullYear() * 12 + x.getMonth() + (x.getDate() - 1) / dim; }
  function mLabel(i) { return E.MOIS[i % 12] + ' ' + String(Math.floor(i / 12)).slice(2); }
  function ymOf(i) { return Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0'); }
  function interp(anchors, x) {
    if (!anchors || !anchors.length) return 0;
    var a = anchors.map(function (k) { return [mIdx(k[0] + '-01'), k[1]]; }).sort(function (p, q) { return p[0] - q[0]; });
    if (x <= a[0][0]) return a[0][1];
    for (var i = 1; i < a.length; i++) if (x <= a[i][0]) { var t = (x - a[i - 1][0]) / (a[i][0] - a[i - 1][0] || 1); return a[i - 1][1] + (a[i][1] - a[i - 1][1]) * t; }
    return a[a.length - 1][1];
  }
  function dur(t) { return Math.max(1, E.daysBetween(t.s, t.e) + 1); }
  function calcAv(p) { var T = p.taches || []; if (!T.length) return p.avancement || 0; var d = E.sum(T, dur); return Math.round(E.sum(T, function (t) { return (+t.p || 0) * dur(t); }) / d); }
  function planned(p, d) { if (!p.courbe) return null; return Math.round(interp(p.courbe.prevu, mFrac(d || today()))); }
  function isActive(p) { return p.statut !== 'Terminé' && p.statut !== 'Suspendu'; }
  function overdueJalons(p) { var t = today(); return (p.jalons || []).filter(function (j) { return !j.fait && j.d < t; }); }
  function lateTasks(p) { var t = today(); return (p.taches || []).filter(function (x) { return (+x.p || 0) < 100 && x.e < t; }); }
  function ecart(p) { var pl = planned(p); return pl == null ? 0 : (p.avancement || 0) - pl; }
  function isLate(p) { return p.statut !== 'Terminé' && (overdueJalons(p).length > 0 || lateTasks(p).length > 0 || ecart(p) <= -8); }
  function nextJalon(p) { return (p.jalons || []).filter(function (j) { return !j.fait; }).sort(function (a, b) { return a.d < b.d ? -1 : 1; })[0]; }
  function taskStatus(t) { var d = today(); if ((+t.p || 0) >= 100) return ['Terminé', 'green']; if (t.e < d) return ['En retard', 'red']; if (t.s <= d) return ['En cours', 'blue']; return ['À venir', 'grey']; }
  function meteo(p) { return METEO[p.meteo] || METEO.soleil; }
  function meteoPill(p, withLabel) { var m = meteo(p); return '<span class="prj-meteo tone-' + m.tone + '" title="Météo projet : ' + m.l + '">' + m.svg + (withLabel === false ? '' : m.l) + '</span>'; }
  function pubBadge(p) { return p.public ? '<span class="badge prj-pub" title="L\'avancement et les jalons sont affichés sur la page Projets du site public">' + E.icon('globe') + 'Visible sur le site</span>' : '<span class="badge tone-grey">' + E.icon('lock') + 'Interne</span>'; }
  function statBadge(s) { return U.badge(s, { 'Études': 'violet', 'Planifié': 'violet', 'En cours': 'blue', 'Suspendu': 'red', 'Terminé': 'green' }[s]); }
  function score(r) { return (+r.probabilite || 1) * (+r.impact || 1); }
  function scoreTone(s) { return s >= 15 ? 'red' : s >= 8 ? 'orange' : s >= 4 ? 'yellow' : 'green'; }
  function ring(pct, size, color) {
    var r = 42, c = 2 * Math.PI * r, len = c * Math.max(0, Math.min(100, pct)) / 100;
    return '<svg class="prj-ring" viewBox="0 0 100 100" width="' + (size || 110) + '" height="' + (size || 110) + '"><circle cx="50" cy="50" r="' + r + '" fill="none" stroke="#eef1f5" stroke-width="10"/><circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + (color || '#163b75') + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + len.toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 50 50)"/><text x="50" y="50" text-anchor="middle" style="font:700 21px Sora,sans-serif;fill:#0d1b2a">' + Math.round(pct) + '%</text><text x="50" y="66" text-anchor="middle" style="font:500 9px Inter,sans-serif;fill:#7a879a">avancement</text></svg>';
  }
  function empOpts() { return S.all('employes').map(function (e) { return { v: e.id, l: e.nom + ' — ' + e.poste }; }); }
  function refresh() { if (cur.view) { var y = window.scrollY; render(cur.view, cur.params); window.scrollTo(0, y); } E.renderBadges(); }
  function nextId() { var n = all().reduce(function (m, p) { var k = +(String(p.id).split('-')[1]) || 0; return Math.max(m, k); }, 0) + 1; return 'PRJ-' + String(n).padStart(2, '0'); }
  function publicNote(p) { return p.public ? ' (mis à jour sur le site public)' : ''; }

  /* ------------------------------------------------------------------ données d'exemple */
  var EXTRA = {
    'PRJ-01': { responsable: M(0), equipe: [M(0), M(31), M(32), M(9), M(20)], meteo: 'nuage',
      courbe: { prevu: [['2025-01', 0], ['2025-06', 4], ['2025-12', 9], ['2026-03', 13], ['2026-06', 24], ['2026-09', 40], ['2026-10', 44], ['2026-12', 68], ['2027-01', 100]], reel: [['2025-01', 0], ['2025-06', 4], ['2025-12', 8], ['2026-03', 11], ['2026-06', 19], ['2026-09', 35]] },
      budgetLignes: [{ lot: 'Ingénierie (FEED)', budget: 2.4e9, engage: 2.25e9, facture: 1.4e9 }, { lot: 'Achats équipements', budget: 6.2e9, engage: 2.6e9, facture: 0.9e9 }, { lot: 'Construction', budget: 8.3e9, engage: 1.1e9, facture: 0.35e9 }, { lot: 'Démarrage', budget: 0.6e9, engage: 0, facture: 0 }, { lot: 'Provisions & aléas', budget: 1.0e9, engage: 0.15e9, facture: 0.05e9 }],
      risques: [
        { titre: 'Retard de livraison des équipements longs délais (pompes, échangeurs)', probabilite: 4, impact: 4, mitigation: 'Commandes anticipées, suivi hebdomadaire des fabricants, inspections en usine.', statut: 'Ouvert', resp: M(20) },
        { titre: 'Raccordements aux unités en service', probabilite: 3, impact: 5, mitigation: 'Raccordements (tie-ins) programmés pendant l\'arrêt technique général de mars 2027.', statut: 'Ouvert', resp: M(31) },
        { titre: 'Hausse du coût de l\'acier et du fret maritime', probabilite: 3, impact: 3, mitigation: 'Clause de révision plafonnée ; provision pour aléas de 1 Md FCFA.', statut: 'Ouvert', resp: M(27) },
        { titre: 'Disponibilité de soudeurs et tuyauteurs qualifiés', probabilite: 3, impact: 3, mitigation: 'Programme de qualification avec les entreprises de Port-Gentil.', statut: 'Maîtrisé', resp: M(29) },
        { titre: 'Autorisation environnementale des nouveaux bacs', probabilite: 2, impact: 4, mitigation: 'Notice d\'impact actualisée déposée auprès de l\'administration.', statut: 'Maîtrisé', resp: M(4) }],
      journal: [
        { d: '2026-09-24', type: 'Comité de pilotage', auteur: M(0), titre: 'COPIL mensuel — septembre 2026', texte: 'Avancement des études FEED à 62 %. La liste des équipements longs délais est figée. Retard de trois semaines sur les études de génie civil des nouveaux bacs, sans impact à ce stade sur le jalon de fin des études.', decisions: ['Lancer les consultations pour les pompes de transfert', 'Recaler la revue HAZOP au 20 octobre', 'Présenter un point budgétaire détaillé au prochain COPIL'] },
        { d: '2026-09-10', type: 'Revue technique', auteur: M(31), titre: 'Revue du modèle 3D à 60 %', texte: 'Revue conjointe avec Technip Energies de l\'implantation de l\'unité d\'adoucissement du kérosène. 42 commentaires émis, dont 6 bloquants (accès maintenance des échangeurs).', decisions: ['Déplacer le rack de tuyauteries nord de 3 m', 'Ajouter une plateforme d\'accès sur la colonne de lavage'] },
        { d: '2026-08-27', type: 'Réunion de chantier', auteur: M(32), titre: 'Point planning — lots Achats', texte: 'Onze demandes d\'achat émises sur les quinze prévues. Les délais annoncés pour les échangeurs à plaques sont de 28 semaines.', decisions: ['Relancer les fabricants d\'échangeurs pour un délai amélioré'] }],
      documents: [{ nom: 'Rapport mensuel d\'avancement — septembre 2026', type: 'PDF', d: '2026-09-28' }, { nom: 'Planning directeur REVAMP rév. C', type: 'XLSX', d: '2026-09-15' }, { nom: 'Registre des risques', type: 'XLSX', d: '2026-09-24' }, { nom: 'Compte rendu COPIL du 24/09/2026', type: 'PDF', d: '2026-09-25' }] },
    'PRJ-02': { responsable: M(0), equipe: [M(0), M(9), M(31), M(27)], meteo: 'soleil', budget: 14e9, engage: 3.9e9,
      courbe: { prevu: [['2026-04', 0], ['2026-10', 13], ['2027-06', 25], ['2028-06', 55], ['2029-06', 88], ['2029-12', 100]], reel: [['2026-04', 0], ['2026-06', 3], ['2026-08', 8], ['2026-09', 11]] },
      budgetLignes: [{ lot: 'FEED hydrocraqueur', budget: 4.2e9, engage: 1.6e9, facture: 0.9e9 }, { lot: 'FEED hydrogène (SMR)', budget: 3.1e9, engage: 1.2e9, facture: 0.6e9 }, { lot: 'Études jetée maritime', budget: 2.4e9, engage: 0.7e9, facture: 0.25e9 }, { lot: 'Montage financier & conseils', budget: 1.3e9, engage: 0.4e9, facture: 0.15e9 }, { lot: 'Études environnementales', budget: 1.0e9, engage: 0, facture: 0 }, { lot: 'Provisions & aléas', budget: 2.0e9, engage: 0, facture: 0 }],
      risques: [
        { titre: 'Bouclage du financement (70 % dette)', probabilite: 3, impact: 5, mitigation: 'Mandat de conseil financier, contacts avancés avec les bailleurs, garanties publiques à l\'étude.', statut: 'Ouvert', resp: M(3) },
        { titre: 'Conditions géotechniques du site de la jetée', probabilite: 3, impact: 4, mitigation: 'Campagne de sondages marins programmée en novembre.', statut: 'Ouvert', resp: M(31) },
        { titre: 'Approvisionnement en gaz naturel pour l\'unité hydrogène', probabilite: 2, impact: 5, mitigation: 'Protocole d\'accord en négociation avec les producteurs locaux.', statut: 'Ouvert', resp: M(0) },
        { titre: 'Évolution des spécifications AFRI-6', probabilite: 2, impact: 3, mitigation: 'Marges de conception prises sur le soufre et les aromatiques.', statut: 'Maîtrisé', resp: M(9) }],
      journal: [
        { d: '2026-09-18', type: 'Revue technique', auteur: M(9), titre: 'Revue de configuration du hydrocraqueur modulaire', texte: 'Validation du schéma de procédé en un seul étage avec recyclage. Les rendements attendus en gazole et kérosène sont conformes aux objectifs de production.', decisions: ['Figer le bilan matière de base', 'Lancer l\'étude de la jetée en variante à deux postes'] },
        { d: '2026-07-02', type: 'Réunion de lancement', auteur: M(0), titre: 'Lancement des études FEED', texte: 'Réunion de lancement avec Technip Energies et Axens. Organisation, planning, circuit de validation des livrables et règles de communication définis.', decisions: ['Réunion d\'avancement toutes les deux semaines', 'Point mensuel à la Direction générale'] }],
      documents: [{ nom: 'Base de conception (design basis) rév. B', type: 'PDF', d: '2026-08-30' }, { nom: 'Planning FEED hydrocraquage', type: 'XLSX', d: '2026-07-10' }] },
    'PRJ-03': { responsable: M(31), equipe: [M(31), M(32), M(18), M(4)], meteo: 'soleil',
      courbe: { prevu: [['2025-01', 0], ['2025-06', 30], ['2025-12', 68], ['2026-09', 80], ['2026-10', 83], ['2026-12', 100]], reel: [['2025-01', 0], ['2025-06', 28], ['2025-12', 66], ['2026-06', 76], ['2026-09', 80]] },
      budgetLignes: [{ lot: 'Clôture & gardiennage', budget: 0.55e9, engage: 0.55e9, facture: 0.55e9 }, { lot: 'Voie de contournement 5 km', budget: 1.6e9, engage: 1.6e9, facture: 1.52e9 }, { lot: 'Plateforme béton 5 000 m²', budget: 0.9e9, engage: 0.9e9, facture: 0.88e9 }, { lot: 'Base vie', budget: 0.95e9, engage: 0.26e9, facture: 0.12e9 }, { lot: 'Suivi environnemental', budget: 0.2e9, engage: 0.04e9, facture: 0.03e9 }],
      risques: [
        { titre: 'Saison des pluies pendant les travaux de la base vie', probabilite: 4, impact: 2, mitigation: 'Priorité aux ouvrages couverts d\'octobre à décembre ; drainage provisoire.', statut: 'Ouvert', resp: M(32) },
        { titre: 'Atteinte à la mangrove en bordure de site', probabilite: 1, impact: 5, mitigation: 'Zone tampon balisée, suivi trimestriel par un bureau d\'études environnemental.', statut: 'Maîtrisé', resp: M(18) },
        { titre: 'Intrusions sur le site', probabilite: 2, impact: 2, mitigation: 'Clôture, gardiennage 24 h/24 et éclairage périmétrique.', statut: 'Clos', resp: M(4) }],
      journal: [
        { d: '2026-09-16', type: 'Réunion de chantier', auteur: M(31), titre: 'Base vie — point hebdomadaire', texte: 'Gros œuvre des bureaux terminé, charpente du réfectoire en cours. Raccordement électrique en attente du transformateur.', decisions: ['Relancer la livraison du transformateur 630 kVA'] },
        { d: '2025-12-15', type: 'Réception', auteur: M(31), titre: 'Réception de la voie de contournement et de la plateforme', texte: 'Réception sans réserve majeure de la voie de 5 km et de la plateforme béton de 5 000 m².', decisions: ['Lever les 4 réserves mineures sous 30 jours'] }],
      documents: [{ nom: 'PV de réception voie de contournement', type: 'PDF', d: '2025-12-15' }, { nom: 'Suivi environnemental mangrove — T3 2026', type: 'PDF', d: '2026-09-30' }] },
    'PRJ-04': { responsable: M(9), equipe: [M(9), M(12), M(16), M(10)], meteo: 'soleil',
      courbe: { prevu: [['2025-03', 0], ['2025-06', 35], ['2025-09', 75], ['2025-12', 100]], reel: [['2025-03', 0], ['2025-06', 30], ['2025-09', 72], ['2025-12', 100]] },
      budgetLignes: [{ lot: 'Catalyseur', budget: 1.4e9, engage: 1.38e9, facture: 1.38e9 }, { lot: 'Inspection & maintenance', budget: 0.7e9, engage: 0.69e9, facture: 0.69e9 }, { lot: 'Essais & redémarrage', budget: 0.4e9, engage: 0.39e9, facture: 0.39e9 }],
      risques: [{ titre: 'Délai d\'approvisionnement du catalyseur', probabilite: 3, impact: 4, mitigation: 'Commande passée dès l\'annonce du financement.', statut: 'Clos', resp: M(20) }, { titre: 'Défauts découverts à l\'ouverture du réacteur', probabilite: 2, impact: 4, mitigation: 'Inspection préalable par ultrasons.', statut: 'Clos', resp: M(16) }],
      journal: [{ d: '2025-12-15', type: 'Réception', auteur: M(9), titre: 'Remise en service du réacteur', texte: 'Démarrage réussi, production d\'essence et de kérosène conformes aux spécifications dès le deuxième jour.', decisions: ['Clôturer le projet et archiver le dossier'] }],
      documents: [{ nom: 'Rapport de fin de projet', type: 'PDF', d: '2026-01-20' }] }
  };
  var INTERNES = [
    { id: 'PRJ-05', code: 'DCS', nom: 'Remplacement du système de contrôle-commande (DCS) de la salle de contrôle', public: false,
      resume: 'Migration du système numérique de contrôle-commande vieillissant vers une plateforme moderne et redondante, avec simulateur de formation. Basculement pendant l\'arrêt technique général 2027.',
      partenaire: 'Ogooué Instrumentation (intégrateur)', debut: '2025-11-03', fin: '2027-04-30', statut: 'En cours', budget: 3.4e9, engage: 2.15e9, chef: 'Direction Technique', responsable: M(31), equipe: [M(31), M(13), M(36), M(33)], meteo: 'nuage',
      jalons: [{ d: '2025-12-19', t: 'Validation de l\'architecture et du cahier des charges', fait: true }, { d: '2026-06-30', t: 'Commande du matériel et des licences', fait: true }, { d: '2026-09-15', t: 'Essais usine (FAT) du nouveau système', fait: false }, { d: '2027-03-10', t: 'Basculement pendant l\'arrêt technique général', fait: false }, { d: '2027-04-30', t: 'Réception définitive', fait: false }],
      taches: [{ t: 'Spécifications et architecture', s: '2025-11-03', e: '2026-01-30', p: 100, lot: 'Ingénierie', resp: M(31) }, { t: 'Configuration et programmation', s: '2026-02-02', e: '2026-08-28', p: 100, lot: 'Ingénierie', resp: M(13) }, { t: 'Essais usine (FAT)', s: '2026-08-31', e: '2026-09-25', p: 70, lot: 'Essais', resp: M(13) }, { t: 'Formation des opérateurs sur simulateur', s: '2026-10-05', e: '2027-02-19', p: 0, lot: 'Formation', resp: M(36) }, { t: 'Pose des armoires et câblage', s: '2026-11-02', e: '2027-02-26', p: 0, lot: 'Construction', resp: M(15) }, { t: 'Basculement boucle par boucle', s: '2027-03-01', e: '2027-04-10', p: 0, lot: 'Démarrage', resp: M(31) }, { t: 'Mise en service et réception', s: '2027-04-12', e: '2027-04-30', p: 0, lot: 'Démarrage', resp: M(31) }],
      courbe: { prevu: [['2025-11', 0], ['2026-01', 14], ['2026-06', 38], ['2026-09', 55], ['2027-02', 80], ['2027-04', 100]], reel: [['2025-11', 0], ['2026-01', 13], ['2026-06', 36], ['2026-09', 48]] },
      budgetLignes: [{ lot: 'Matériel & licences', budget: 1.6e9, engage: 1.6e9, facture: 1.2e9 }, { lot: 'Ingénierie & programmation', budget: 0.9e9, engage: 0.45e9, facture: 0.4e9 }, { lot: 'Installation & câblage', budget: 0.5e9, engage: 0.05e9, facture: 0 }, { lot: 'Formation & simulateur', budget: 0.2e9, engage: 0.05e9, facture: 0 }, { lot: 'Provisions & aléas', budget: 0.2e9, engage: 0, facture: 0 }],
      risques: [{ titre: 'Essais usine (FAT) : 14 anomalies encore ouvertes', probabilite: 4, impact: 4, mitigation: 'Task-force quotidienne avec l\'intégrateur, second passage des essais planifié le 12 octobre.', statut: 'Ouvert', resp: M(13) }, { titre: 'Fenêtre de basculement limitée à l\'arrêt général', probabilite: 3, impact: 5, mitigation: 'Répétition du basculement sur simulateur, plan de repli boucle par boucle.', statut: 'Ouvert', resp: M(31) }, { titre: 'Défaillance de cartes d\'entrées/sorties obsolètes avant la migration', probabilite: 2, impact: 4, mitigation: 'Stock de cartes de rechange reconditionnées.', statut: 'Ouvert', resp: M(12) }, { titre: 'Appropriation de la nouvelle interface par les opérateurs', probabilite: 2, impact: 3, mitigation: 'Formation sur simulateur pour les cinq équipes de quart.', statut: 'Maîtrisé', resp: M(36) }],
      journal: [{ d: '2026-09-26', type: 'Revue technique', auteur: M(13), titre: 'Bilan de la première campagne de FAT', texte: '212 boucles testées sur 240. 14 anomalies ouvertes, dont 3 sur les séquences de sécurité du four F-101. Le jalon FAT du 15 septembre n\'est pas atteint.', decisions: ['Second passage des essais le 12 octobre', 'Présence de l\'ingénieur procédés pour les séquences du four'] }, { d: '2026-06-30', type: 'Comité de pilotage', auteur: M(31), titre: 'Validation de la commande', texte: 'Commande du matériel, des licences et du simulateur validée par la Direction générale.', decisions: ['Engager la totalité du lot Matériel & licences'] }],
      documents: [{ nom: 'Cahier des charges DCS rév. 2', type: 'PDF', d: '2025-12-19' }, { nom: 'Rapport FAT — campagne 1', type: 'PDF', d: '2026-09-26' }] },
    { id: 'PRJ-06', code: 'BACS', nom: 'Rénovation des bacs de stockage T-12 et T-14', public: false,
      resume: 'Remise à niveau de deux bacs de gasoil : nettoyage, inspection, remplacement des tôles de fond, revêtement intérieur et épreuve hydraulique.',
      partenaire: 'Équatoriale Industrie Services', debut: '2026-03-02', fin: '2026-12-18', statut: 'En cours', budget: 1.85e9, engage: 1.42e9, chef: 'Direction Technique', responsable: M(12), equipe: [M(12), M(16), M(17), M(37), M(18)], meteo: 'orage',
      jalons: [{ d: '2026-03-02', t: 'Mise à disposition du bac T-12 (vidangé, dégazé)', fait: true }, { d: '2026-05-29', t: 'Rapport d\'inspection du fond T-12', fait: true }, { d: '2026-10-16', t: 'Remise en service du bac T-12', fait: false }, { d: '2026-12-18', t: 'Remise en service du bac T-14', fait: false }],
      taches: [{ t: 'Vidange, dégazage et nettoyage T-12', s: '2026-03-02', e: '2026-04-10', p: 100, lot: 'Préparation', resp: M(12) }, { t: 'Inspection fond, robe et toit flottant T-12', s: '2026-04-13', e: '2026-05-29', p: 100, lot: 'Inspection', resp: M(16) }, { t: 'Remplacement du fond du bac T-12', s: '2026-06-01', e: '2026-09-20', p: 85, lot: 'Chaudronnerie', resp: M(17) }, { t: 'Revêtement intérieur et peinture T-12', s: '2026-09-21', e: '2026-10-09', p: 10, lot: 'Revêtement', resp: M(17) }, { t: 'Épreuve hydraulique T-12', s: '2026-10-12', e: '2026-10-16', p: 0, lot: 'Essais', resp: M(16) }, { t: 'Travaux bac T-14 (nettoyage, inspection, réparations)', s: '2026-08-17', e: '2026-12-11', p: 30, lot: 'Chaudronnerie', resp: M(37) }, { t: 'Épreuve et remise en service T-14', s: '2026-12-14', e: '2026-12-18', p: 0, lot: 'Essais', resp: M(16) }],
      courbe: { prevu: [['2026-03', 0], ['2026-05', 25], ['2026-07', 48], ['2026-09', 72], ['2026-10', 82], ['2026-12', 100]], reel: [['2026-03', 0], ['2026-05', 24], ['2026-07', 42], ['2026-09', 60]] },
      budgetLignes: [{ lot: 'Nettoyage & dégazage', budget: 0.18e9, engage: 0.18e9, facture: 0.18e9 }, { lot: 'Chaudronnerie (fonds, robes)', budget: 1.05e9, engage: 0.98e9, facture: 0.62e9 }, { lot: 'Revêtement & peinture', budget: 0.32e9, engage: 0.12e9, facture: 0 }, { lot: 'Inspection & essais', budget: 0.12e9, engage: 0.08e9, facture: 0.05e9 }, { lot: 'Aléas & avenants', budget: 0.18e9, engage: 0.06e9, facture: 0 }],
      risques: [{ titre: 'Surcoût : remplacement complet du fond T-12 au lieu d\'un rapiéçage', probabilite: 5, impact: 4, mitigation: 'Avenant négocié au bordereau de prix unitaires ; arbitrage budgétaire demandé en COPIL.', statut: 'Ouvert', resp: M(12) }, { titre: 'Glissement de la remise en service T-12 : tension sur le stockage gasoil', probabilite: 4, impact: 4, mitigation: 'Équipe de soudure renforcée (2 postes), coordination avec la programmation des expéditions.', statut: 'Ouvert', resp: M(12) }, { titre: 'Travaux par points chauds à proximité de bacs en service', probabilite: 2, impact: 5, mitigation: 'Permis de feu journalier, détection gaz en continu, piquet incendie.', statut: 'Ouvert', resp: M(4) }, { titre: 'Pluies pendant l\'application du revêtement', probabilite: 3, impact: 2, mitigation: 'Tente de protection et déshumidificateurs.', statut: 'Maîtrisé', resp: M(17) }],
      journal: [{ d: '2026-09-22', type: 'Réunion de chantier', auteur: M(12), titre: 'Point d\'avancement T-12', texte: 'Soudure des tôles de fond à 85 %. Contrôle radiographique : 4 soudures à reprendre. La remise en service du 16 octobre est menacée d\'environ une semaine.', decisions: ['Passer en deux postes de soudure', 'Informer la programmation des expéditions'] }],
      documents: [{ nom: 'Rapport d\'inspection fond T-12', type: 'PDF', d: '2026-05-29' }, { nom: 'Avenant n°1 — Équatoriale Industrie Services', type: 'PDF', d: '2026-07-08' }] },
    { id: 'PRJ-07', code: 'ERP', nom: 'Déploiement de l\'ERP et digitalisation des processus', public: false,
      resume: 'Mise en place d\'un espace de gestion unique : achats, stocks, maintenance, RH, paie, finance, commercial et tableaux de bord en temps réel.',
      partenaire: 'Nendja (intégrateur)', debut: '2026-06-01', fin: '2027-06-30', statut: 'En cours', budget: 0.95e9, engage: 0.31e9, chef: 'Direction générale', responsable: M(33), equipe: [M(33), M(27), M(28), M(21), M(32)], meteo: 'soleil',
      jalons: [{ d: '2026-07-15', t: 'Cadrage et cartographie des processus validés', fait: true }, { d: '2026-09-30', t: 'Démonstrateur présenté à la Direction générale', fait: true }, { d: '2026-12-15', t: 'Lot 1 en production : achats, stocks, maintenance', fait: false }, { d: '2027-03-31', t: 'Lot 2 en production : RH, paie, finance', fait: false }, { d: '2027-06-30', t: 'Lot 3 : commercial, logistique, tableaux de bord', fait: false }],
      taches: [{ t: 'Cadrage et cartographie des processus', s: '2026-06-01', e: '2026-07-15', p: 100, lot: 'Cadrage', resp: M(33) }, { t: 'Démonstrateur fonctionnel', s: '2026-07-16', e: '2026-09-30', p: 100, lot: 'Conception', resp: M(33) }, { t: 'Paramétrage du lot 1', s: '2026-10-01', e: '2026-12-11', p: 5, lot: 'Lot 1', resp: M(33) }, { t: 'Reprise des données (articles, équipements, fournisseurs)', s: '2026-10-15', e: '2026-12-04', p: 0, lot: 'Données', resp: M(21) }, { t: 'Formation des utilisateurs clés', s: '2026-11-16', e: '2027-06-15', p: 0, lot: 'Conduite du changement', resp: M(29) }, { t: 'Paramétrage du lot 2', s: '2027-01-04', e: '2027-03-31', p: 0, lot: 'Lot 2', resp: M(28) }, { t: 'Paramétrage du lot 3', s: '2027-04-01', e: '2027-06-30', p: 0, lot: 'Lot 3', resp: M(33) }],
      courbe: { prevu: [['2026-06', 0], ['2026-09', 18], ['2026-12', 40], ['2027-03', 70], ['2027-06', 100]], reel: [['2026-06', 0], ['2026-08', 12], ['2026-09', 20]] },
      budgetLignes: [{ lot: 'Licences & hébergement', budget: 0.18e9, engage: 0.09e9, facture: 0.045e9 }, { lot: 'Intégration & paramétrage', budget: 0.52e9, engage: 0.18e9, facture: 0.09e9 }, { lot: 'Reprise de données', budget: 0.07e9, engage: 0.02e9, facture: 0 }, { lot: 'Formation & conduite du changement', budget: 0.12e9, engage: 0.02e9, facture: 0 }, { lot: 'Matériel (tablettes terrain)', budget: 0.06e9, engage: 0, facture: 0 }],
      risques: [{ titre: 'Qualité des données historiques (articles, équipements)', probabilite: 4, impact: 3, mitigation: 'Campagne de nettoyage des données avant la reprise, validation par les métiers.', statut: 'Ouvert', resp: M(21) }, { titre: 'Disponibilité des utilisateurs clés pendant l\'arrêt 2027', probabilite: 3, impact: 3, mitigation: 'Formations planifiées avant février 2027.', statut: 'Ouvert', resp: M(29) }, { titre: 'Couverture réseau sur les unités (tablettes terrain)', probabilite: 2, impact: 2, mitigation: 'Mode hors connexion et bornes Wi-Fi industrielles.', statut: 'Maîtrisé', resp: M(33) }],
      journal: [{ d: '2026-09-30', type: 'Comité de pilotage', auteur: M(33), titre: 'Présentation du démonstrateur', texte: 'Démonstration des modules projets, maintenance, achats, stocks, RH et paie à la Direction générale. Accueil très favorable des directions.', decisions: ['Lancer le paramétrage du lot 1 le 1er octobre', 'Désigner un utilisateur clé par direction'] }],
      documents: [{ nom: 'Cartographie des processus', type: 'PDF', d: '2026-07-15' }, { nom: 'Plan de déploiement par lots', type: 'PDF', d: '2026-09-30' }] },
    { id: 'PRJ-08', code: 'LABO-A5', nom: 'Mise aux normes Africa 5 — laboratoire de contrôle qualité', public: false,
      resume: 'Équiper et qualifier le laboratoire pour certifier les carburants aux normes Africa 5 (soufre, benzène, aromatiques) et préparer l\'accréditation ISO/IEC 17025.',
      partenaire: 'LabEquip Africa', debut: '2026-02-02', fin: '2027-03-31', statut: 'En cours', budget: 0.78e9, engage: 0.42e9, chef: 'Direction Technique', responsable: M(10), equipe: [M(10), M(11), M(9)], meteo: 'soleil',
      jalons: [{ d: '2026-04-30', t: 'Analyse des écarts vs normes Africa 5', fait: true }, { d: '2026-09-25', t: 'Réception des analyseurs de soufre (fluorescence X)', fait: true }, { d: '2026-12-18', t: 'Qualification des méthodes ASTM D4294 / D5453', fait: false }, { d: '2027-03-31', t: 'Dépôt du dossier d\'accréditation ISO/IEC 17025', fait: false }],
      taches: [{ t: 'Diagnostic des écarts', s: '2026-02-02', e: '2026-04-30', p: 100, lot: 'Études', resp: M(10) }, { t: 'Achat des analyseurs', s: '2026-05-04', e: '2026-09-25', p: 100, lot: 'Achats', resp: M(20) }, { t: 'Aménagement de la salle instrumentale', s: '2026-07-01', e: '2026-10-30', p: 60, lot: 'Travaux', resp: M(11) }, { t: 'Qualification des méthodes', s: '2026-10-05', e: '2026-12-18', p: 0, lot: 'Qualité', resp: M(10) }, { t: 'Formation des chimistes', s: '2026-11-02', e: '2027-01-29', p: 0, lot: 'Formation', resp: M(10) }, { t: 'Dossier d\'accréditation', s: '2027-01-04', e: '2027-03-31', p: 0, lot: 'Qualité', resp: M(10) }],
      courbe: { prevu: [['2026-02', 0], ['2026-06', 25], ['2026-10', 50], ['2027-03', 100]], reel: [['2026-02', 0], ['2026-06', 24], ['2026-09', 47]] },
      budgetLignes: [{ lot: 'Analyseurs & équipements', budget: 0.46e9, engage: 0.38e9, facture: 0.3e9 }, { lot: 'Aménagement de la salle', budget: 0.14e9, engage: 0.04e9, facture: 0.02e9 }, { lot: 'Étalons & consommables', budget: 0.06e9, engage: 0, facture: 0 }, { lot: 'Formation & accréditation', budget: 0.08e9, engage: 0, facture: 0 }, { lot: 'Provisions & aléas', budget: 0.04e9, engage: 0, facture: 0 }],
      risques: [{ titre: 'Délai de qualification des méthodes', probabilite: 3, impact: 3, mitigation: 'Essais interlaboratoires réservés dès novembre.', statut: 'Ouvert', resp: M(10) }, { titre: 'Stabilité de l\'alimentation électrique des analyseurs', probabilite: 2, impact: 4, mitigation: 'Onduleur dédié et climatisation redondante.', statut: 'Ouvert', resp: M(15) }],
      journal: [{ d: '2026-09-25', type: 'Réception', auteur: M(10), titre: 'Réception des analyseurs de soufre', texte: 'Deux analyseurs livrés et installés, essais de réception concluants.', decisions: ['Planifier la formation constructeur la semaine 41'] }],
      documents: [{ nom: 'Étude des écarts Africa 5', type: 'PDF', d: '2026-04-30' }] }
  ];
  function seed() {
    var base = E.clone(window.SOGARA_DATA ? window.SOGARA_DATA.projetsDefaut : []);
    base.forEach(function (p) { var x = EXTRA[p.id]; if (x) Object.keys(x).forEach(function (k) { p[k] = E.clone(x[k]); }); });
    INTERNES.forEach(function (p) { var q = E.clone(p); q.avancement = calcAv(q); base.push(q); });
    base.forEach(function (p) {
      (p.risques || []).forEach(function (r, i) { r.id = 'R' + (i + 1); });
      (p.journal || []).forEach(function (j, i) { j.id = p.id + '-CR' + (i + 1); });
      p.equipe = p.equipe || []; p.documents = p.documents || []; p.journal = p.journal || []; p.risques = p.risques || [];
      if (!p.budgetLignes) p.budgetLignes = [{ lot: 'Budget global', budget: p.budget || 0, engage: p.engage || 0, facture: 0 }];
    });
    return { projets: base };
  }

  /* ------------------------------------------------------------------ CSS du module */
  function css() {
    if (document.getElementById('prj-css')) return;
    var s = document.createElement('style'); s.id = 'prj-css';
    s.textContent = [
      '.prj-ch .chart{overflow:visible}.tbl.responsive td .prj-range{flex:1;max-width:220px}',
      '.prj-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}',
      '.prj-card{padding:18px 18px 16px;display:flex;flex-direction:column;gap:12px;cursor:pointer;position:relative;overflow:hidden;transition:transform .15s,box-shadow .15s}',
      '.prj-card:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(13,27,42,.12)}',
      '.prj-card::before{content:"";position:absolute;left:0;top:0;right:0;height:4px;background:var(--green)}',
      '.prj-card.m-nuage::before{background:var(--orange)}.prj-card.m-orage::before{background:var(--red)}',
      '.prj-card h3{font-size:15.5px;line-height:1.3}',
      '.prj-top{display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
      '.prj-code{font:700 11px/1 ui-monospace,Consolas,monospace;letter-spacing:.06em;background:var(--navy);color:#fff;padding:5px 7px;border-radius:6px}',
      '.prj-meteo{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:2px 9px 2px 3px;border-radius:20px;white-space:nowrap}',
      '.prj-meteo svg{width:22px;height:22px}',
      '.badge.prj-pub{background:#fff6b8;color:#7a5d00}.badge svg{width:12px;height:12px}.badge.prj-pub::before,.badge.tone-grey:has(svg)::before{display:none}',
      '.prj-av__lbl{display:flex;align-items:baseline;gap:8px;margin-bottom:6px;font-size:12px;color:var(--ink-3)}',
      '.prj-av__lbl b{font-family:Sora,sans-serif;font-size:19px;color:var(--ink)}',
      '.prj-av .progress{height:9px}',
      '.prj-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;border-top:1px solid var(--line-2);padding-top:12px}',
      '.prj-stats>div{min-width:0}',
      '.prj-stats span{display:block;font-size:10.5px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;font-weight:600}',
      '.prj-stats b{display:block;font-size:13.5px;margin-top:3px}',
      '.prj-stats small{display:block;font-size:11.5px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.prj-foot{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink-2)}',
      '.prj-alert{display:flex;gap:6px;align-items:center;font-size:12px;font-weight:600;color:var(--red);background:var(--red-bg);padding:6px 10px;border-radius:8px}',
      '.prj-alert svg{width:15px;flex:none}',
      '.prj-head{overflow:hidden;background:linear-gradient(135deg,#0a1f44 0%,#163b75 100%);color:#fff;border:0}',
      '.prj-head .card__b{padding:20px 22px}',
      '.prj-head h2{font-size:22px;line-height:1.25;color:#fff;margin:8px 0 6px}',
      '.prj-head p{margin:0;color:#c9d6ea;max-width:820px}',
      '.prj-head__main{display:flex;gap:22px;align-items:center}',
      '.prj-head__txt{flex:1;min-width:0}',
      '.prj-head .prj-ring{flex:none;background:#fff;border-radius:50%;padding:4px}',
      '.prj-head .prj-code{background:var(--yellow);color:var(--navy)}',
      '.prj-meta{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:14px;font-size:12.5px;color:#c9d6ea}',
      '.prj-meta b{color:#fff;font-weight:600}',
      '.prj-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}',
      '.prj-head .btn.ghost{color:#fff}.prj-head .btn.ghost:hover{background:rgba(255,255,255,.1)}',
      '.prj-head .btn.line{background:transparent;border-color:rgba(255,255,255,.35);color:#fff}.prj-head .btn.line:hover{background:rgba(255,255,255,.1)}',
      '.prj-back{display:inline-flex;align-items:center;gap:6px;color:#c9d6ea;font-size:12.5px;font-weight:600}.prj-back svg{width:15px}',
      '.prj-range{display:flex;align-items:center;gap:10px;min-width:170px}',
      '.prj-range input{flex:1;accent-color:#163b75;min-width:90px;height:22px}',
      '.prj-range output{font-weight:700;font-size:12.5px;width:40px;text-align:right}',
      '.prj-matrix{display:grid;grid-template-columns:22px repeat(5,minmax(0,1fr));gap:5px;align-items:stretch}',
      '.prj-matrix .c{min-height:52px;border-radius:9px;display:flex;flex-wrap:wrap;gap:3px;align-content:center;justify-content:center;padding:4px;font-size:11px;font-weight:700}',
      '.prj-matrix .c i{font-style:normal;background:#fff;color:var(--ink);border-radius:20px;padding:1px 6px;box-shadow:0 1px 2px rgba(0,0,0,.12)}',
      '.prj-matrix .ax{font-size:11px;color:var(--ink-3);display:flex;align-items:center;justify-content:center;font-weight:600}',
      '.prj-matrix .h-green{background:#d7f2e0}.prj-matrix .h-yellow{background:#fff3b0}.prj-matrix .h-orange{background:#ffd9b0}.prj-matrix .h-red{background:#f9c0c0}',
      '.prj-jal{display:flex;gap:14px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--line-2)}',
      '.prj-jal:last-child{border-bottom:0}',
      '.prj-jal__d{width:16px;height:16px;transform:rotate(45deg);background:var(--yellow);border:2px solid var(--navy);flex:none;margin:0 4px}',
      '.prj-jal__d.done{background:var(--green);border-color:#0f6b31}.prj-jal__d.late{background:var(--red);border-color:#8f1d1d}',
      '.prj-jal__b{flex:1;min-width:0}',
      '.prj-cr{border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:#fff}',
      '.prj-cr h4{font-size:14px;margin:4px 0 6px}',
      '.prj-cr ul{margin:8px 0 0;padding-left:18px;font-size:12.5px}',
      '.prj-cr .dec{margin-top:10px;background:#f8fafc;border-radius:8px;padding:8px 12px}',
      '.prj-team{display:flex;flex-direction:column;gap:10px}',
      '.prj-team>div{display:flex;align-items:center;gap:10px}',
      '.prj-seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}',
      '.prj-seg button{border:0;background:none;padding:6px 12px;font-weight:600;font-size:12.5px;cursor:pointer;color:var(--ink-3)}',
      '.prj-seg button.is-active{background:var(--navy);color:#fff}',
      '.prj-kv{display:grid;grid-template-columns:1fr auto;gap:8px 12px;font-size:13px}.prj-kv dt{color:var(--ink-3)}.prj-kv dd{margin:0;font-weight:600;text-align:right}',
      '.prj-pubbox{border:1px dashed #c9d2de;border-radius:12px;padding:14px;background:#fbfcfe}',
      '@media (max-width:640px){.prj-grid{grid-template-columns:1fr}.prj-head__main{flex-direction:column-reverse;align-items:flex-start}.prj-head h2{font-size:18px}.prj-head .card__b{padding:16px}.prj-stats{gap:8px}.prj-stats b{font-size:12.5px}.prj-jal{flex-wrap:wrap;padding:12px 14px}.prj-matrix .c{min-height:40px}.prj-actions .btn{flex:1 1 auto}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ------------------------------------------------------------------ rendu principal */
  function render(view, params) {
    css(); cur.view = view; cur.params = params || [];
    var a = cur.params[0];
    if (a && get(a)) return renderFiche(view, get(a), cur.params[1] || 'synthese');
    if (a === 'planning') return renderPlanning(view, cur.params[1] || 'ALL', cur.params[2]);
    return renderPortefeuille(view);
  }

  function topTabs(active) {
    return U.tabs([{ k: 'portefeuille', l: 'Portefeuille', n: all().length }, { k: 'planning', l: 'Planning global' }], active, function (k) { E.go('projets' + (k === 'planning' ? '/planning' : '')); });
  }

  function kpiRow() {
    var P = all(), act = P.filter(isActive), t = today(), t30 = E.addDays(t, 30);
    var wsum = E.sum(act, function (p) { return p.budget || 1; }), wav = wsum ? E.sum(act, function (p) { return (p.avancement || 0) * (p.budget || 1); }) / wsum : 0;
    var bud = E.sum(P, 'budget'), eng = E.sum(P, 'engage');
    var jal = []; P.forEach(function (p) { (p.jalons || []).forEach(function (j) { if (!j.fait && j.d >= t && j.d <= t30) jal.push(j); }); });
    var late = P.filter(isLate);
    return '<div class="grid g4" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">' +
      U.kpi({ label: 'Projets actifs', value: act.length, unit: '/ ' + P.length, icon: 'layers', tone: 'blue', foot: P.filter(function (p) { return p.public; }).length + ' visibles sur le site public' }) +
      U.kpi({ label: 'Avancement moyen', value: Math.round(wav), unit: '%', icon: 'trend', tone: 'green', foot: 'pondéré par le budget des projets actifs' }) +
      U.kpi({ label: 'Budget engagé', value: F.short(eng), unit: '/ ' + F.short(bud), icon: 'wallet', tone: 'violet', foot: '<span class="' + (eng / bud > .8 ? 'down' : 'up') + '">' + F.pct(bud ? eng / bud * 100 : 0) + '</span> du budget total' }) +
      U.kpi({ label: 'Jalons à 30 jours', value: jal.length, icon: 'flag', tone: 'yellow', foot: jal.length ? 'prochain : ' + F.date(jal.sort(function (a, b) { return a.d < b.d ? -1 : 1; })[0].d) : 'aucun jalon imminent' }) +
      U.kpi({ label: 'Projets en retard', value: late.length, icon: 'alert', tone: late.length ? 'red' : 'green', foot: late.length ? late.map(function (p) { return p.code; }).join(' · ') : 'tous dans les temps' }) +
      '</div>';
  }

  function card(p) {
    var nj = nextJalon(p), pl = planned(p), late = isLate(p), oj = overdueJalons(p), lt = lateTasks(p);
    var cons = p.budget ? p.engage / p.budget * 100 : 0, rest = E.daysBetween(today(), p.fin);
    var alertTxt = [];
    if (oj.length) alertTxt.push(oj.length + ' jalon' + (oj.length > 1 ? 's' : '') + ' dépassé' + (oj.length > 1 ? 's' : ''));
    if (lt.length) alertTxt.push(lt.length + ' tâche' + (lt.length > 1 ? 's' : '') + ' en retard');
    if (!alertTxt.length && late) alertTxt.push('Écart de ' + Math.abs(ecart(p)) + ' pts sur le prévu');
    return '<article class="card prj-card m-' + (p.meteo || 'soleil') + '" data-id="' + p.id + '" tabindex="0">' +
      '<div class="prj-top"><span class="prj-code">' + esc(p.code) + '</span>' + statBadge(p.statut) + pubBadge(p) + '<span class="spacer"></span>' + meteoPill(p) + '</div>' +
      '<div><h3>' + esc(p.nom) + '</h3><div class="small muted" style="margin-top:4px">' + esc(p.partenaire || '—') + ' · ' + esc(E.empName(p.responsable)) + '</div></div>' +
      '<div class="prj-av"><div class="prj-av__lbl"><b>' + (p.avancement || 0) + ' %</b><span>réalisé</span>' + (pl != null && p.statut !== 'Terminé' ? '<span class="spacer"></span><span>prévu ' + pl + ' %</span>' : '') + '</div>' +
      '<div class="progress ' + (p.avancement >= 100 ? 'green' : late ? 'orange' : '') + '"><i style="width:' + (p.avancement || 0) + '%"></i></div></div>' +
      '<div class="prj-stats"><div><span>Budget</span><b>' + F.pct(cons) + '</b><small>' + F.short(p.engage) + ' / ' + F.short(p.budget) + '</small></div>' +
      '<div><span>Prochain jalon</span><b>' + (nj ? F.date(nj.d) : '—') + '</b><small title="' + esc(nj ? nj.t : '') + '">' + esc(nj ? nj.t : 'Tous atteints') + '</small></div>' +
      '<div><span>Échéance</span><b>' + F.date(p.fin) + '</b><small>' + (p.statut === 'Terminé' ? 'achevé' : rest >= 0 ? 'dans ' + rest + ' j' : 'dépassée de ' + (-rest) + ' j') + '</small></div></div>' +
      (alertTxt.length && p.statut !== 'Terminé' ? '<div class="prj-alert">' + E.icon('alert') + esc(alertTxt.join(' · ')) + '</div>' : '') +
      '</article>';
  }

  function filtered() {
    var q = E.norm(flt.q);
    return all().filter(function (p) {
      if (flt.vue === 'publics' && !p.public) return false;
      if (flt.vue === 'internes' && p.public) return false;
      if (flt.vue === 'retard' && !isLate(p)) return false;
      if (flt.statut && p.statut !== flt.statut) return false;
      if (q && E.norm(p.nom + ' ' + p.code + ' ' + p.id + ' ' + p.partenaire + ' ' + E.empName(p.responsable)).indexOf(q) < 0) return false;
      return true;
    });
  }

  function renderPortefeuille(view) {
    var P = all();
    view.innerHTML = topTabs('portefeuille') +
      '<div class="section-title" style="margin-bottom:14px"><div><h2>Portefeuille de projets</h2><p>Modernisation de la raffinerie et projets internes — suivi de l\'avancement, des coûts et des risques.</p></div><span class="spacer"></span>' +
      '<button class="btn" id="pj-csv">' + E.icon('download') + 'Exporter</button><button class="btn primary" id="pj-new">' + E.icon('plus') + 'Nouveau projet</button></div>' +
      kpiRow() +
      '<div class="filters" style="margin-top:18px"><div class="chips" id="pj-vue">' + [['tous', 'Tous', P.length], ['publics', 'Visibles sur le site', P.filter(function (p) { return p.public; }).length], ['internes', 'Internes', P.filter(function (p) { return !p.public; }).length], ['retard', 'En retard', P.filter(isLate).length]].map(function (c) { return '<button class="chip' + (flt.vue === c[0] ? ' is-active' : '') + '" data-v="' + c[0] + '">' + c[1] + ' · ' + c[2] + '</button>'; }).join('') + '</div>' +
      '<span class="spacer"></span><select class="select" id="pj-st"><option value="">Tous les statuts</option>' + STATUTS.map(function (s) { return '<option' + (flt.statut === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<input class="input" id="pj-q" type="search" placeholder="Rechercher un projet…" value="' + esc(flt.q) + '"></div>' +
      '<div id="pj-cards"></div>';
    function draw() {
      var L = filtered();
      E.$('#pj-cards', view).innerHTML = L.length ? '<div class="prj-grid">' + L.map(card).join('') + '</div>' : '<div class="card empty">Aucun projet ne correspond à ces critères.</div>';
    }
    draw();
    E.$('#pj-vue', view).addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; flt.vue = b.dataset.v; E.$$('#pj-vue .chip', view).forEach(function (c) { c.classList.toggle('is-active', c === b); }); draw(); });
    E.$('#pj-st', view).onchange = function (e) { flt.statut = e.target.value; draw(); };
    E.$('#pj-q', view).oninput = function (e) { flt.q = e.target.value; draw(); };
    E.$('#pj-cards', view).addEventListener('click', function (e) { var c = e.target.closest('.prj-card'); if (c) E.go('projets/' + c.dataset.id); });
    E.$('#pj-cards', view).addEventListener('keydown', function (e) { var c = e.target.closest('.prj-card'); if (c && e.key === 'Enter') E.go('projets/' + c.dataset.id); });
    E.$('#pj-new', view).onclick = newProject;
    E.$('#pj-csv', view).onclick = function () {
      U.exportCSV('portefeuille-projets', [{ label: 'Réf.', key: 'id' }, { label: 'Code', key: 'code' }, { label: 'Projet', key: 'nom' }, { label: 'Statut', key: 'statut' }, { label: 'Public', csv: function (p) { return p.public ? 'Oui' : 'Non'; } }, { label: 'Responsable', csv: function (p) { return E.empName(p.responsable); } }, { label: 'Début', key: 'debut' }, { label: 'Fin', key: 'fin' }, { label: 'Avancement %', key: 'avancement' }, { label: 'Prévu %', csv: function (p) { return planned(p); } }, { label: 'Budget FCFA', key: 'budget' }, { label: 'Engagé FCFA', key: 'engage' }, { label: 'Météo', csv: function (p) { return meteo(p).l; } }], filtered());
    };
  }

  /* ------------------------------------------------------------------ planning global */
  function renderPlanning(view, pid, unit) {
    var P = all().slice().sort(function (a, b) { return a.debut < b.debut ? -1 : 1; });
    var sel = pid !== 'ALL' && get(pid) ? [get(pid)] : P;
    unit = unit || planUnit || (sel.length > 1 ? 'quarter' : 'month');
    var rows = [];
    sel.forEach(function (p) {
      rows.push({ label: p.code + ' — ' + p.nom, sub: p.statut + ' · ' + (p.avancement || 0) + ' % · ' + E.empName(p.responsable), start: p.debut, end: p.fin, progress: p.avancement || 0, group: true,
        milestones: (p.jalons || []).map(function (j) { return { date: j.d, label: j.t, done: j.fait }; }), onClick: function () { E.go('projets/' + p.id); } });
      (p.taches || []).slice().sort(function (a, b) { return a.s < b.s ? -1 : 1; }).forEach(function (t) {
        rows.push({ label: t.t, sub: t.lot + (t.resp ? ' · ' + E.empName(t.resp) : ''), start: t.s, end: t.e, progress: +t.p || 0, onClick: function () { E.go('projets/' + p.id + '/taches'); } });
      });
    });
    var from = sel.reduce(function (m, p) { return !m || p.debut < m ? p.debut : m; }, null), to = sel.reduce(function (m, p) { return !m || p.fin > m ? p.fin : m; }, null);
    var t = today(), t90 = E.addDays(t, 90), up = [];
    sel.forEach(function (p) { (p.jalons || []).forEach(function (j) { if (!j.fait && j.d <= t90) up.push({ p: p, j: j }); }); });
    up.sort(function (a, b) { return a.j.d < b.j.d ? -1 : 1; });
    view.innerHTML = topTabs('planning') +
      '<div class="card"><div class="card__h"><h3>Planning multi-projets</h3><span class="sub">' + sel.length + ' projet(s) · ' + (rows.length - sel.length) + ' tâches · cliquez une barre pour ouvrir le projet</span><span class="spacer"></span>' +
      '<select class="select" id="pl-p" style="width:auto;max-width:100%"><option value="ALL">Tous les projets</option>' + P.map(function (p) { return '<option value="' + p.id + '"' + (p.id === pid ? ' selected' : '') + '>' + esc(p.code + ' — ' + p.nom) + '</option>'; }).join('') + '</select>' +
      '<div class="prj-seg" id="pl-u"><button data-u="month" class="' + (unit === 'month' ? 'is-active' : '') + '">Mois</button><button data-u="quarter" class="' + (unit === 'quarter' ? 'is-active' : '') + '">Trimestre</button></div></div>' +
      U.gantt({ rows: rows, from: from, to: to, unit: unit, title: 'Projet / tâche' }) + '</div>' +
      '<div class="grid g2 stack-m" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Jalons des 90 prochains jours</h3><span class="sub">et jalons dépassés</span></div><div class="list">' +
      (up.length ? up.map(function (x) { var late = x.j.d < t; return '<a class="list__item" href="#/projets/' + x.p.id + '/jalons" style="color:inherit"><div class="list__icon ' + (late ? 'tone-red' : 'tone-yellow') + '">' + E.icon('flag') + '</div><div class="list__body"><b>' + esc(x.j.t) + '</b><div class="small muted">' + esc(x.p.code) + ' · ' + F.date(x.j.d) + (late ? ' · <span class="down">dépassé de ' + E.daysBetween(x.j.d, t) + ' j</span>' : ' · dans ' + E.daysBetween(t, x.j.d) + ' j') + '</div></div></a>'; }).join('') : '<div class="empty">Aucun jalon dans les 90 prochains jours.</div>') +
      '</div></div><div class="card"><div class="card__h"><h3>Charge par projet</h3><span class="sub">tâches en cours ce mois-ci</span></div><div class="card__b">' + chargeBars(sel) + '</div></div></div>';
    E.$('#pl-p', view).onchange = function (e) { planUnit = null; E.go('projets/planning/' + e.target.value); };
    E.$('#pl-u', view).addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; planUnit = b.dataset.u; renderPlanning(view, pid, b.dataset.u); });
  }
  function chargeBars(list) {
    var t = today();
    var data = list.filter(isActive).map(function (p) { return { p: p, n: (p.taches || []).filter(function (x) { return x.s <= t && x.e >= E.addDays(t, -30) && (+x.p || 0) < 100; }).length, late: lateTasks(p).length }; });
    if (!data.length) return '<div class="empty">Aucun projet actif.</div>';
    var max = Math.max.apply(null, data.map(function (d) { return d.n; }).concat([1]));
    return '<div class="stack" style="gap:12px">' + data.map(function (d) { return '<div><div class="row" style="justify-content:space-between;margin-bottom:5px"><b class="small">' + esc(d.p.code) + ' <span class="muted" style="font-weight:500">' + esc(d.p.nom.length > 44 ? d.p.nom.slice(0, 42) + '…' : d.p.nom) + '</span></b><span class="small">' + d.n + ' en cours' + (d.late ? ' · <span class="down">' + d.late + ' en retard</span>' : '') + '</span></div><div class="progress ' + (d.late ? 'orange' : '') + '"><i style="width:' + (d.n / max * 100) + '%"></i></div></div>'; }).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ fiche projet */
  var TABS = [['synthese', 'Synthèse'], ['planning', 'Planning'], ['taches', 'Tâches'], ['jalons', 'Jalons'], ['risques', 'Risques'], ['budget', 'Budget'], ['journal', 'Journal']];
  function renderFiche(view, p, tab) {
    var late = isLate(p);
    var tabs = TABS.map(function (t) {
      var n = t[0] === 'taches' ? (p.taches || []).length : t[0] === 'jalons' ? (p.jalons || []).length : t[0] === 'risques' ? (p.risques || []).filter(function (r) { return r.statut !== 'Clos'; }).length : t[0] === 'journal' ? (p.journal || []).length : null;
      return { k: t[0], l: t[1], n: n };
    });
    view.innerHTML =
      '<div class="card prj-head"><div class="card__b">' +
      '<a class="prj-back" href="#/projets">' + E.icon('back') + 'Portefeuille de projets</a>' +
      '<div class="prj-head__main" style="margin-top:10px"><div class="prj-head__txt"><div class="prj-top"><span class="prj-code">' + esc(p.code) + '</span>' + statBadge(p.statut) + pubBadge(p) + meteoPill(p) + (late && p.statut !== 'Terminé' ? U.badge('En retard', 'red') : '') + '</div>' +
      '<h2>' + esc(p.nom) + '</h2><p>' + esc(p.resume || '') + '</p>' +
      '<div class="prj-meta"><span>Réf. <b>' + p.id + '</b></span><span>Partenaire <b>' + esc(p.partenaire || '—') + '</b></span><span>Responsable <b>' + esc(E.empName(p.responsable)) + '</b></span><span>Période <b>' + F.date(p.debut) + ' → ' + F.date(p.fin) + '</b></span><span>Budget <b>' + F.short(p.budget) + ' FCFA</b></span></div></div>' +
      ring(p.avancement || 0, 118, p.avancement >= 100 ? '#1e9e4a' : late ? '#e8780c' : '#163b75') + '</div>' +
      '<div class="prj-actions"><button class="btn accent" id="pf-pub">' + E.icon('globe') + (p.public ? 'Retirer du site' : 'Publier sur le site') + '</button>' +
      '<button class="btn line" id="pf-edit">' + E.icon('edit') + 'Modifier</button><button class="btn line" id="pf-task">' + E.icon('plus') + 'Tâche</button>' +
      (p.public ? '<a class="btn line" href="../index.html#projets" target="_blank" rel="noopener">' + E.icon('eye') + 'Voir sur le site</a>' : '') + '</div>' +
      '</div></div>' +
      '<div style="margin-top:16px">' + U.tabs(tabs, tab, function (k) { E.go('projets/' + p.id + '/' + k); }) + '</div><div id="pf-body"></div>';
    var body = E.$('#pf-body', view);
    ({ synthese: tSynthese, planning: tPlanning, taches: tTaches, jalons: tJalons, risques: tRisques, budget: tBudget, journal: tJournal }[tab] || tSynthese)(body, p);
    E.$('#pf-pub', view).onclick = function () { publish(p); };
    E.$('#pf-edit', view).onclick = function () { editProject(p); };
    E.$('#pf-task', view).onclick = function () { editTask(p, null); };
  }

  function sCurve(p) {
    var a = mIdx(p.debut), b = mIdx(p.fin), now = mIdx(today()), labels = [], pv = [], rv = [];
    var reel = (p.courbe && p.courbe.reel || []).slice();
    if (p.statut !== 'Terminé' || now <= b) reel = reel.filter(function (k) { return mIdx(k[0] + '-01') < now; }).concat([[ymOf(Math.min(now, b)), p.avancement || 0]]);
    for (var i = a; i <= b; i++) { labels.push(mLabel(i)); pv.push(Math.round(interp(p.courbe ? p.courbe.prevu : [[ymOf(a), 0], [ymOf(b), 100]], i))); if (i <= now) rv.push(Math.round(interp(reel, i))); }
    return U.line({ labels: labels, height: 230, series: [{ name: 'Prévu (référence)', values: pv, color: '#94a3b8', dash: true }, { name: 'Réalisé', values: rv, color: '#163b75' }] });
  }

  function tSynthese(el, p) {
    var pl = planned(p), ec = ecart(p), T = p.taches || [], done = T.filter(function (t) { return (+t.p || 0) >= 100; }).length;
    var rest = E.daysBetween(today(), p.fin), BL = p.budgetLignes || [];
    var nj = (p.jalons || []).filter(function (j) { return !j.fait; }).sort(function (a, b) { return a.d < b.d ? -1 : 1; }).slice(0, 4);
    var R = (p.risques || []).filter(function (r) { return r.statut !== 'Clos'; }).sort(function (a, b) { return score(b) - score(a); }).slice(0, 3);
    el.innerHTML =
      '<div class="grid g-2-1"><div class="card"><div class="card__h"><h3>Courbe d\'avancement</h3><span class="sub">courbe en S · prévu / réalisé</span></div><div class="card__b prj-ch">' + sCurve(p) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Situation à date</h3><span class="spacer"></span>' + meteoPill(p) + '</div><div class="card__b">' + U.gauge(p.avancement || 0, 'avancement physique réalisé', p.avancement >= 100 ? '#1e9e4a' : ec <= -8 ? '#e8780c' : '#163b75') +
      '<dl class="prj-kv" style="margin-top:16px"><dt>Prévu à date</dt><dd>' + (pl == null ? '—' : pl + ' %') + '</dd><dt>Écart</dt><dd class="' + (ec < 0 ? 'down' : 'up') + '">' + (ec > 0 ? '+' : '') + ec + ' pts</dd>' +
      '<dt>Tâches terminées</dt><dd>' + done + ' / ' + T.length + '</dd><dt>Tâches en retard</dt><dd class="' + (lateTasks(p).length ? 'down' : '') + '">' + lateTasks(p).length + '</dd>' +
      '<dt>Budget consommé</dt><dd>' + F.pct(p.budget ? p.engage / p.budget * 100 : 0) + '</dd><dt>' + (p.statut === 'Terminé' ? 'Achevé le' : 'Fin prévue') + '</dt><dd>' + F.date(p.fin) + (p.statut !== 'Terminé' ? '<div class="small muted" style="font-weight:500">' + (rest >= 0 ? 'dans ' + rest + ' jours' : 'dépassée') + '</div>' : '') + '</dd></dl></div></div></div>' +
      '<div class="grid g2 stack-m" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Budget par lot</h3><span class="sub">en FCFA</span><span class="spacer"></span><a class="btn ghost sm" href="#/projets/' + p.id + '/budget">Détail ' + E.icon('arrow') + '</a></div><div class="card__b prj-ch">' +
      (BL.length ? U.bars({ labels: BL.map(function (l) { return l.lot.length > 16 ? l.lot.slice(0, 15) + '…' : l.lot; }), series: [{ name: 'Budget', values: BL.map(function (l) { return l.budget; }), color: '#c9d6ea' }, { name: 'Engagé', values: BL.map(function (l) { return l.engage; }), color: '#163b75' }, { name: 'Facturé', values: BL.map(function (l) { return l.facture; }), color: '#1e9e4a' }], height: 220, money: true }) : '<div class="empty">Aucune ligne budgétaire.</div>') + '</div></div>' +
      '<div class="stack"><div class="card"><div class="card__h"><h3>Prochains jalons</h3><span class="spacer"></span><a class="btn ghost sm" href="#/projets/' + p.id + '/jalons">Tous ' + E.icon('arrow') + '</a></div><div class="list">' +
      (nj.length ? nj.map(function (j) { var l = j.d < today(); return '<div class="list__item"><div class="list__icon ' + (l ? 'tone-red' : 'tone-yellow') + '">' + E.icon('flag') + '</div><div class="list__body"><b>' + esc(j.t) + '</b><div class="small muted">' + F.date(j.d) + (l ? ' · <span class="down">dépassé</span>' : ' · dans ' + E.daysBetween(today(), j.d) + ' j') + '</div></div></div>'; }).join('') : '<div class="empty">Tous les jalons sont atteints.</div>') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Risques majeurs</h3><span class="spacer"></span><a class="btn ghost sm" href="#/projets/' + p.id + '/risques">Matrice ' + E.icon('arrow') + '</a></div><div class="list">' +
      (R.length ? R.map(function (r) { var s = score(r); return '<div class="list__item"><div class="list__icon tone-' + scoreTone(s) + '" style="font-weight:800">' + s + '</div><div class="list__body"><b>' + esc(r.titre) + '</b><div class="small muted">' + esc(r.mitigation || '') + '</div></div></div>'; }).join('') : '<div class="empty">Aucun risque ouvert.</div>') + '</div></div></div></div>' +
      '<div class="grid g2 stack-m" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Équipe projet</h3><span class="sub">' + (p.equipe || []).length + ' personnes</span></div><div class="card__b prj-team">' +
      (p.equipe || []).map(function (id) { var e = E.emp(id); if (!e) return ''; return '<div>' + U.avatar(e.nom, null, true) + '<div style="min-width:0"><b class="small">' + esc(e.nom) + (id === p.responsable ? ' <span class="badge tone-navy plain">Responsable</span>' : '') + '</b><div class="small muted">' + esc(e.poste) + ' · ' + esc(E.dirName(e.direction)) + '</div></div></div>'; }).join('') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Documents du projet</h3><span class="sub">GED</span></div><div class="list">' +
      ((p.documents || []).length ? p.documents.map(function (d) { return '<div class="list__item"><div class="list__icon ' + (d.type === 'PDF' ? 'tone-red' : 'tone-green') + '">' + E.icon('doc') + '</div><div class="list__body"><b>' + esc(d.nom) + '</b><div class="small muted">' + esc(d.type) + ' · déposé le ' + F.date(d.d) + '</div></div></div>'; }).join('') : '<div class="empty">Aucun document.</div>') + '</div></div></div>';
  }

  function tPlanning(el, p) {
    var groups = E.groupBy((p.taches || []).slice().sort(function (a, b) { return a.s < b.s ? -1 : 1; }), 'lot'), rows = [];
    rows.push({ label: 'Jalons du projet', sub: (p.jalons || []).filter(function (j) { return j.fait; }).length + ' / ' + (p.jalons || []).length + ' atteints', milestones: (p.jalons || []).map(function (j) { return { date: j.d, label: j.t, done: j.fait }; }) });
    Object.keys(groups).forEach(function (lot) {
      var L = groups[lot], s = L.reduce(function (m, t) { return !m || t.s < m ? t.s : m; }, null), e = L.reduce(function (m, t) { return !m || t.e > m ? t.e : m; }, null);
      rows.push({ label: lot, sub: L.length + ' tâche(s)', start: s, end: e, group: true, progress: Math.round(E.sum(L, function (t) { return (+t.p || 0) * dur(t); }) / E.sum(L, dur)) });
      L.forEach(function (t) { rows.push({ label: t.t, sub: t.resp ? E.empName(t.resp) : '', start: t.s, end: t.e, progress: +t.p || 0, onClick: function () { editTask(p, (p.taches || []).indexOf(t)); } }); });
    });
    el.innerHTML = '<div class="card"><div class="card__h"><h3>Planning du projet</h3><span class="sub">cliquez une barre pour modifier la tâche</span><span class="spacer"></span><div class="prj-seg" id="pp-u">' + [['week', 'Semaine'], ['month', 'Mois'], ['quarter', 'Trimestre']].map(function (u) { return '<button data-u="' + u[0] + '" class="' + (ficheUnit === u[0] ? 'is-active' : '') + '">' + u[1] + '</button>'; }).join('') + '</div></div>' +
      U.gantt({ rows: rows, from: p.debut, to: p.fin, unit: ficheUnit, title: 'Lot / tâche' }) + '</div>';
    E.$('#pp-u', el).addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { ficheUnit = b.dataset.u; tPlanning(el, p); } });
  }

  function tTaches(el, p) {
    var T = p.taches || [];
    var cols = [
      { label: 'Tâche', render: function (t) { return '<b>' + esc(t.t) + '</b><div class="small muted">' + esc(t.lot || '') + '</div>'; } },
      { label: 'Responsable', render: function (t) { return t.resp ? esc(E.empName(t.resp)) : ''; } },
      { label: 'Début', render: function (t) { return F.dateShort(t.s); }, cls: 'nowrap' },
      { label: 'Fin', render: function (t) { return F.dateShort(t.e); }, cls: 'nowrap' },
      { label: 'Durée', num: true, render: function (t) { return dur(t) + ' j'; } },
      { label: 'Avancement', render: function (t) { var i = T.indexOf(t); return '<div class="prj-range"><input type="range" min="0" max="100" step="5" value="' + (+t.p || 0) + '" data-ti="' + i + '" aria-label="Avancement de ' + esc(t.t) + '"><output>' + (+t.p || 0) + ' %</output></div>'; } },
      { label: 'Statut', render: function (t) { var s = taskStatus(t); return U.badge(s[0], s[1]); } },
      { label: '', render: function (t) { var i = T.indexOf(t); return '<span class="nowrap"><button class="btn ghost sm" data-ed="' + i + '" aria-label="Modifier">' + E.icon('edit') + '</button><button class="btn ghost sm" data-del="' + i + '" aria-label="Supprimer">' + E.icon('trash') + '</button></span>'; } }
    ];
    el.innerHTML = '<div class="alert tone-blue" style="margin-bottom:14px">' + E.icon('info') + '<div>Faites glisser le curseur pour mettre à jour l\'avancement d\'une tâche : l\'avancement global du projet est recalculé automatiquement (moyenne pondérée par la durée des tâches)' + (p.public ? ' et <b>mis à jour sur le site public</b>.' : '.') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Tâches</h3><span class="sub">' + T.length + ' tâches · avancement calculé ' + calcAv(p) + ' %</span><span class="spacer"></span><button class="btn sm" id="pt-csv">' + E.icon('download') + 'CSV</button><button class="btn primary sm" id="pt-add">' + E.icon('plus') + 'Ajouter une tâche</button></div>' +
      U.table(cols, T.slice().sort(function (a, b) { return a.s < b.s ? -1 : 1; }), { empty: 'Aucune tâche. Ajoutez la première tâche du projet.' }) + '</div>';
    E.$$('input[type=range]', el).forEach(function (r) {
      r.addEventListener('input', function () { r.nextElementSibling.textContent = r.value + ' %'; });
      r.addEventListener('change', function () { setTaskProgress(p, +r.dataset.ti, +r.value); });
    });
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ed]'); if (b) return editTask(p, +b.dataset.ed);
      b = e.target.closest('[data-del]'); if (b) { var t = T[+b.dataset.del]; U.confirm('Supprimer la tâche', 'Supprimer « ' + esc(t.t) + ' » du planning ?', 'Supprimer', function () { T.splice(+b.dataset.del, 1); applyAv(p, 'Tâche supprimée : ' + t.t); }, 'danger'); }
    });
    E.$('#pt-add', el).onclick = function () { editTask(p, null); };
    E.$('#pt-csv', el).onclick = function () { U.exportCSV('taches-' + p.code, [{ label: 'Tâche', key: 't' }, { label: 'Lot', key: 'lot' }, { label: 'Responsable', csv: function (t) { return E.empName(t.resp); } }, { label: 'Début', key: 's' }, { label: 'Fin', key: 'e' }, { label: 'Avancement %', key: 'p' }, { label: 'Statut', csv: function (t) { return taskStatus(t)[0]; } }], T); };
  }
  function applyAv(p, what) {
    var old = p.avancement || 0, nv = calcAv(p), patch = { taches: p.taches, avancement: nv };
    if (nv >= 100 && p.statut !== 'Terminé') { patch.statut = 'Terminé'; E.notify('Projet achevé', p.code + ' — ' + p.nom, '#/projets/' + p.id, 'green'); }
    S.update(COL, p.id, patch);
    E.log('Mise à jour du planning ' + p.code, what + ' — avancement projet ' + old + ' % → ' + nv + ' %', 'projets');
    U.toast(old !== nv ? 'Avancement du projet recalculé : ' + old + ' % → ' + nv + ' %' + publicNote(p) : 'Tâche enregistrée');
    refresh();
  }
  function setTaskProgress(p, i, v) { var t = p.taches[i]; if (!t) return; var o = t.p; t.p = v; applyAv(p, '« ' + t.t + ' » ' + o + ' % → ' + v + ' %'); }

  function editTask(p, i) {
    var t = i != null ? p.taches[i] : null, lots = [];
    (p.taches || []).forEach(function (x) { if (x.lot && lots.indexOf(x.lot) < 0) lots.push(x.lot); });
    U.formModal({ title: t ? 'Modifier la tâche' : 'Nouvelle tâche', sub: p.code + ' — ' + p.nom, okLabel: t ? 'Enregistrer' : 'Ajouter la tâche',
      fields: [{ name: 't', label: 'Intitulé de la tâche', required: true, full: true, placeholder: 'Ex. Épreuve hydraulique du bac' },
        { name: 'lot', label: 'Lot / phase', required: true, placeholder: lots.slice(0, 3).join(', ') || 'Ingénierie' },
        { name: 'resp', label: 'Responsable', type: 'select', empty: '— Non affecté —', options: empOpts() },
        { name: 's', label: 'Début', type: 'date', required: true }, { name: 'e', label: 'Fin', type: 'date', required: true },
        { name: 'p', label: 'Avancement (%)', type: 'number', min: 0, step: 5 }],
      values: t ? { t: t.t, lot: t.lot, resp: t.resp || '', s: t.s, e: t.e, p: t.p } : { lot: lots[0] || '', s: today(), e: E.addDays(today(), 30), p: 0 },
      onSubmit: function (v) {
        if (v.e < v.s) { U.toast('La date de fin doit suivre la date de début.', 'err'); return false; }
        var o = { t: v.t, lot: v.lot, resp: v.resp || '', s: v.s, e: v.e, p: Math.max(0, Math.min(100, +v.p || 0)) };
        p.taches = p.taches || [];
        if (t) Object.assign(t, o); else p.taches.push(o);
        applyAv(p, (t ? 'Tâche modifiée : ' : 'Tâche ajoutée : ') + o.t);
      } });
  }

  function tJalons(el, p) {
    var J = (p.jalons || []).map(function (j, i) { return { j: j, i: i }; }).sort(function (a, b) { return a.j.d < b.j.d ? -1 : 1; }), t = today();
    el.innerHTML = (p.public ? '<div class="alert tone-yellow" style="margin-bottom:14px">' + E.icon('globe') + '<div>Ces jalons sont <b>affichés sur la page Projets du site public</b>. Marquer un jalon comme atteint le fait apparaître instantanément comme « réalisé » pour les visiteurs.</div></div>' : '') +
      '<div class="card"><div class="card__h"><h3>Jalons</h3><span class="sub">' + J.filter(function (x) { return x.j.fait; }).length + ' atteints sur ' + J.length + '</span><span class="spacer"></span><button class="btn primary sm" id="pj-add">' + E.icon('plus') + 'Ajouter un jalon</button></div>' +
      (J.length ? J.map(function (x) {
        var j = x.j, late = !j.fait && j.d < t, dd = E.daysBetween(t, j.d);
        return '<div class="prj-jal"><span class="prj-jal__d' + (j.fait ? ' done' : late ? ' late' : '') + '"></span><div class="prj-jal__b"><b>' + esc(j.t) + '</b><div class="small muted">' + F.date(j.d) + ' · ' + (j.fait ? 'réalisé' + (j.le ? ' (validé le ' + F.date(j.le) + ')' : '') : late ? '<span class="down">dépassé de ' + (-dd) + ' jours</span>' : 'dans ' + dd + ' jours') + '</div></div>' +
          (j.fait ? U.badge('Atteint', 'green') + '<button class="btn ghost sm" data-undo="' + x.i + '">Rouvrir</button>' : (late ? U.badge('En retard', 'red') : U.badge('À venir', 'yellow')) + '<button class="btn success sm" data-ok="' + x.i + '">' + E.icon('check') + 'Marquer comme atteint</button>') + '</div>';
      }).join('') : '<div class="empty">Aucun jalon défini.</div>') + '</div>';
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ok]');
      if (b) { var j = p.jalons[+b.dataset.ok]; U.confirm('Jalon atteint', 'Confirmer que le jalon « <b>' + esc(j.t) + '</b> » est atteint ?' + (p.public ? '<br><br><span class="small muted">Il apparaîtra comme réalisé sur le site public.</span>' : ''), 'Confirmer', function () {
        j.fait = true; j.le = today(); S.update(COL, p.id, { jalons: p.jalons });
        E.log('Jalon atteint', p.code + ' — ' + j.t, 'projets'); E.notify('Jalon atteint', p.code + ' — ' + j.t, '#/projets/' + p.id + '/jalons', 'green');
        U.toast('Jalon marqué comme atteint' + publicNote(p)); refresh();
      }, 'success'); return; }
      b = e.target.closest('[data-undo]');
      if (b) { var k = p.jalons[+b.dataset.undo]; k.fait = false; delete k.le; S.update(COL, p.id, { jalons: p.jalons }); E.log('Jalon rouvert', p.code + ' — ' + k.t, 'projets'); U.toast('Jalon rouvert'); refresh(); }
    });
    E.$('#pj-add', el).onclick = function () {
      U.formModal({ title: 'Nouveau jalon', sub: p.code + ' — ' + p.nom, fields: [{ name: 't', label: 'Intitulé du jalon', required: true, full: true }, { name: 'd', label: 'Date', type: 'date', required: true }, { name: 'fait', label: 'État', type: 'select', options: [{ v: '0', l: 'À venir' }, { v: '1', l: 'Déjà atteint' }] }], values: { d: E.addDays(today(), 30) },
        onSubmit: function (v) { p.jalons = p.jalons || []; p.jalons.push({ d: v.d, t: v.t, fait: v.fait === '1' }); S.update(COL, p.id, { jalons: p.jalons }); E.log('Jalon ajouté', p.code + ' — ' + v.t, 'projets'); U.toast('Jalon ajouté' + publicNote(p)); refresh(); } });
    };
  }

  function tRisques(el, p) {
    var R = p.risques || [], open = R.filter(function (r) { return r.statut !== 'Clos'; });
    var m = '<div class="prj-matrix">';
    for (var imp = 5; imp >= 1; imp--) {
      m += '<div class="ax">' + imp + '</div>';
      for (var pr = 1; pr <= 5; pr++) {
        var here = open.filter(function (r) { return +r.impact === imp && +r.probabilite === pr; });
        m += '<div class="c h-' + scoreTone(imp * pr) + '" title="Probabilité ' + pr + ' × Impact ' + imp + ' = ' + imp * pr + '">' + here.map(function (r) { return '<i title="' + esc(r.titre) + '">' + r.id + '</i>'; }).join('') + '</div>';
      }
    }
    m += '<div></div>' + [1, 2, 3, 4, 5].map(function (i) { return '<div class="ax">' + i + '</div>'; }).join('') + '</div>' +
      '<div class="row small muted" style="justify-content:space-between;margin-top:8px"><span>↑ Impact</span><span>Probabilité →</span></div>' +
      '<div class="legend" style="margin-top:10px"><span><i style="background:#d7f2e0"></i>Faible</span><span><i style="background:#fff3b0"></i>Modéré</span><span><i style="background:#ffd9b0"></i>Élevé</span><span><i style="background:#f9c0c0"></i>Critique</span></div>';
    var cols = [
      { label: 'N°', render: function (r) { return '<b>' + r.id + '</b>'; } },
      { label: 'Risque', render: function (r) { return '<b>' + esc(r.titre) + '</b><div class="small muted">' + esc(r.mitigation || '') + '</div>'; } },
      { label: 'P × I', num: true, render: function (r) { return r.probabilite + ' × ' + r.impact; } },
      { label: 'Criticité', render: function (r) { var s = score(r); return U.badge(String(s), scoreTone(s)); } },
      { label: 'Responsable', render: function (r) { return esc(E.empName(r.resp)); } },
      { label: 'Statut', render: function (r) { return U.badge(r.statut, { 'Ouvert': 'orange', 'Maîtrisé': 'blue', 'Clos': 'grey' }[r.statut]); } }
    ];
    el.innerHTML = '<div class="grid g-1-2"><div class="card"><div class="card__h"><h3>Matrice des risques</h3><span class="sub">' + open.length + ' risques non clos</span></div><div class="card__b">' + m + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Registre des risques</h3><span class="spacer"></span><button class="btn primary sm" id="pr-add">' + E.icon('plus') + 'Nouveau risque</button></div>' +
      U.table(cols, R.slice().sort(function (a, b) { return (a.statut === 'Clos') - (b.statut === 'Clos') || score(b) - score(a); }), { onRow: function (r) { editRisk(p, r); }, empty: 'Aucun risque identifié.' }) + '</div></div>';
    E.$('#pr-add', el).onclick = function () { editRisk(p, null); };
  }
  function editRisk(p, r) {
    var sc = [1, 2, 3, 4, 5].map(function (i) { return { v: i, l: i + ' — ' + ['Très faible', 'Faible', 'Moyen', 'Fort', 'Très fort'][i - 1] }; });
    U.formModal({ title: r ? 'Risque ' + r.id : 'Nouveau risque', sub: p.code + ' — ' + p.nom,
      fields: [{ name: 'titre', label: 'Description du risque', required: true, full: true }, { name: 'probabilite', label: 'Probabilité', type: 'select', options: sc }, { name: 'impact', label: 'Impact', type: 'select', options: sc },
        { name: 'resp', label: 'Responsable', type: 'select', options: empOpts() }, { name: 'statut', label: 'Statut', type: 'select', options: ['Ouvert', 'Maîtrisé', 'Clos'] }, { name: 'mitigation', label: 'Plan de mitigation', type: 'textarea' }],
      values: r || { probabilite: 3, impact: 3, statut: 'Ouvert', resp: p.responsable },
      onSubmit: function (v) {
        v.probabilite = +v.probabilite; v.impact = +v.impact; p.risques = p.risques || [];
        if (r) Object.assign(r, v); else { v.id = 'R' + (p.risques.reduce(function (m, x) { return Math.max(m, +String(x.id).slice(1) || 0); }, 0) + 1); p.risques.push(v); }
        S.update(COL, p.id, { risques: p.risques }); E.log(r ? 'Risque modifié' : 'Risque ajouté', p.code + ' — ' + v.titre + ' (criticité ' + score(v) + ')', 'projets');
        if (!r && score(v) >= 15) E.notify('Nouveau risque critique', p.code + ' — ' + v.titre, '#/projets/' + p.id + '/risques', 'red');
        U.toast(r ? 'Risque mis à jour' : 'Risque ajouté au registre'); refresh();
      } });
  }

  function tBudget(el, p) {
    var BL = p.budgetLignes || [], b = E.sum(BL, 'budget'), en = E.sum(BL, 'engage'), fa = E.sum(BL, 'facture');
    var cols = [
      { label: 'Lot', render: function (l) { return '<b>' + esc(l.lot) + '</b>'; } },
      { label: 'Budget', num: true, render: function (l) { return F.money(l.budget); } },
      { label: 'Engagé', num: true, render: function (l) { return F.money(l.engage); } },
      { label: 'Facturé', num: true, render: function (l) { return F.money(l.facture); } },
      { label: 'Reste à engager', num: true, render: function (l) { var r = l.budget - l.engage; return '<span class="' + (r < 0 ? 'down' : '') + '">' + F.money(r) + '</span>'; } },
      { label: 'Consommation', render: function (l) { var c = l.budget ? l.engage / l.budget * 100 : 0; return '<div style="min-width:120px">' + U.progress(c, c > 100 ? 'red' : c > 90 ? 'orange' : '') + '</div>'; } }
    ];
    el.innerHTML = '<div class="grid g4">' + U.kpi({ label: 'Budget', value: F.short(b), unit: 'FCFA', icon: 'wallet', tone: 'navy' }) + U.kpi({ label: 'Engagé', value: F.short(en), unit: 'FCFA', icon: 'cart', tone: 'blue', foot: F.pct(b ? en / b * 100 : 0) + ' du budget' }) +
      U.kpi({ label: 'Facturé', value: F.short(fa), unit: 'FCFA', icon: 'invoice', tone: 'green', foot: F.pct(en ? fa / en * 100 : 0) + ' de l\'engagé' }) + U.kpi({ label: 'Reste à engager', value: F.short(b - en), unit: 'FCFA', icon: 'money', tone: b - en < 0 ? 'red' : 'orange' }) + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Lignes budgétaires</h3><span class="sub">cliquez une ligne pour la modifier</span><span class="spacer"></span><button class="btn sm" id="pb-csv">' + E.icon('download') + 'CSV</button><button class="btn primary sm" id="pb-add">' + E.icon('plus') + 'Ajouter une ligne</button></div>' +
      U.table(cols, BL, { onRow: function (l) { editLine(p, l); }, footer: function () { return '<td>Total</td><td class="num">' + F.money(b) + '</td><td class="num">' + F.money(en) + '</td><td class="num">' + F.money(fa) + '</td><td class="num">' + F.money(b - en) + '</td><td>' + U.progress(b ? en / b * 100 : 0) + '</td>'; } }) + '</div>' +
      '<div class="grid g2 stack-m" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Répartition du budget</h3></div><div class="card__b">' + U.donut(BL.map(function (l) { return { label: l.lot, value: l.budget }; }), { money: true, center: F.short(b), sub: 'FCFA' }) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Engagé vs facturé</h3></div><div class="card__b prj-ch">' + U.bars({ labels: BL.map(function (l) { return l.lot.length > 14 ? l.lot.slice(0, 13) + '…' : l.lot; }), series: [{ name: 'Engagé', values: BL.map(function (l) { return l.engage; }), color: '#163b75' }, { name: 'Facturé', values: BL.map(function (l) { return l.facture; }), color: '#1e9e4a' }], height: 200, money: true }) + '</div></div></div>';
    E.$('#pb-add', el).onclick = function () { editLine(p, null); };
    E.$('#pb-csv', el).onclick = function () { U.exportCSV('budget-' + p.code, [{ label: 'Lot', key: 'lot' }, { label: 'Budget', key: 'budget' }, { label: 'Engagé', key: 'engage' }, { label: 'Facturé', key: 'facture' }, { label: 'Reste à engager', csv: function (l) { return l.budget - l.engage; } }], BL); };
  }
  function editLine(p, l) {
    U.formModal({ title: l ? 'Ligne budgétaire' : 'Nouvelle ligne budgétaire', sub: p.code + ' — montants en FCFA',
      fields: [{ name: 'lot', label: 'Lot', required: true, full: true }, { name: 'budget', label: 'Budget', type: 'money', required: true }, { name: 'engage', label: 'Engagé (commandes passées)', type: 'money' }, { name: 'facture', label: 'Facturé', type: 'money' }],
      values: l || { engage: 0, facture: 0 },
      onSubmit: function (v) {
        var o = { lot: v.lot, budget: +v.budget || 0, engage: +v.engage || 0, facture: +v.facture || 0 };
        p.budgetLignes = p.budgetLignes || [];
        if (l) Object.assign(l, o); else p.budgetLignes.push(o);
        var nb = E.sum(p.budgetLignes, 'budget'), ne = E.sum(p.budgetLignes, 'engage');
        S.update(COL, p.id, { budgetLignes: p.budgetLignes, budget: nb, engage: ne });
        E.log('Budget projet mis à jour', p.code + ' — ' + o.lot + ' : engagé ' + F.money(o.engage), 'projets');
        if (nb && ne / nb > 0.9) E.notify('Budget projet consommé à ' + Math.round(ne / nb * 100) + ' %', p.code + ' — ' + p.nom, '#/projets/' + p.id + '/budget', 'orange');
        U.toast('Budget mis à jour : ' + F.short(ne) + ' engagés sur ' + F.short(nb)); refresh();
      } });
  }

  function tJournal(el, p) {
    var J = (p.journal || []).slice().sort(function (a, b) { return a.d < b.d ? 1 : -1; });
    el.innerHTML = '<div class="card"><div class="card__h"><h3>Journal du projet</h3><span class="sub">comptes rendus de réunion et faits marquants</span><span class="spacer"></span><button class="btn primary sm" id="pjn-add">' + E.icon('plus') + 'Nouveau compte rendu</button></div><div class="card__b">' +
      (J.length ? '<div class="timeline">' + J.map(function (j) {
        return '<div class="tl-item done"><div class="prj-cr"><div class="row small muted"><b style="display:inline;color:var(--ink)">' + F.date(j.d) + '</b>' + U.badge(j.type, j.type === 'Comité de pilotage' ? 'navy' : j.type === 'Revue technique' ? 'violet' : j.type === 'Réception' ? 'green' : 'blue') + '<span>par ' + esc(E.empName(j.auteur)) + '</span></div>' +
          '<h4>' + esc(j.titre) + '</h4><div style="font-size:13px;color:var(--ink-2)">' + esc(j.texte) + '</div>' +
          ((j.decisions || []).length ? '<div class="dec"><b class="small">Décisions et actions</b><ul>' + j.decisions.map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul></div>' : '') + '</div></div>';
      }).join('') + '</div>' : '<div class="empty">Aucun compte rendu. Ajoutez le premier.</div>') + '</div></div>';
    E.$('#pjn-add', el).onclick = function () {
      var u = E.session.user(), me = S.all('employes').find(function (e) { return u && E.norm(e.nom).indexOf(E.norm(u.name.split(' ').slice(-1)[0])) >= 0; });
      U.formModal({ title: 'Nouveau compte rendu', sub: p.code + ' — ' + p.nom,
        fields: [{ name: 'd', label: 'Date', type: 'date', required: true }, { name: 'type', label: 'Type', type: 'select', options: ['Comité de pilotage', 'Réunion de chantier', 'Revue technique', 'Réception', 'Note'] }, { name: 'titre', label: 'Titre', required: true, full: true },
          { name: 'auteur', label: 'Rédacteur', type: 'select', options: empOpts() }, { name: 'texte', label: 'Compte rendu', type: 'textarea', required: true }, { name: 'decisions', label: 'Décisions / actions (une par ligne)', type: 'textarea' }],
        values: { d: today(), type: 'Réunion de chantier', auteur: me ? me.id : p.responsable },
        onSubmit: function (v) {
          p.journal = p.journal || [];
          p.journal.push({ id: p.id + '-CR' + (p.journal.length + 1), d: v.d, type: v.type, auteur: v.auteur, titre: v.titre, texte: v.texte, decisions: String(v.decisions || '').split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean) });
          S.update(COL, p.id, { journal: p.journal }); E.log('Compte rendu ajouté', p.code + ' — ' + v.titre, 'projets'); U.toast('Compte rendu enregistré'); refresh();
        } });
    };
  }

  /* ------------------------------------------------------------------ actions projet */
  function publish(p) {
    var nj = (p.jalons || []).length;
    var body = p.public
      ? '<p style="margin-top:0">Le projet <b>' + esc(p.nom) + '</b> est actuellement affiché sur la page <b>Projets</b> du site public.</p><p>En le retirant, il disparaîtra immédiatement du site. Les données restent conservées ici.</p>'
      : '<p style="margin-top:0">La page <b>Projets</b> du site public affichera automatiquement :</p><div class="prj-pubbox"><div class="prj-top"><span class="prj-code">' + esc(p.code) + '</span>' + statBadge(p.statut) + '</div><b style="display:block;margin:8px 0 4px">' + esc(p.nom) + '</b><div class="small muted">Partenaire : ' + esc(p.partenaire || '—') + '</div><div style="margin:10px 0">' + U.progress(p.avancement || 0) + '</div><div class="small">' + nj + ' jalon(s) · fin visée ' + F.month(p.fin) + '</div></div>' +
        '<p class="small muted" style="margin-bottom:0">Publiés : nom, résumé, partenaire, statut, avancement, jalons et date de fin — mis à jour en temps réel à chaque modification. <b>Restent internes</b> : budget, risques, équipe, comptes rendus et documents.</p>';
    U.modal({ title: p.public ? 'Retirer du site public' : 'Publier sur le site public', sub: p.code + ' — ' + p.id, size: 'sm', body: body,
      actions: [{ label: 'Annuler' }, { label: p.public ? 'Retirer du site' : 'Publier', cls: p.public ? 'danger' : 'accent', icon: 'globe', onClick: function (close) {
        close(); var nv = !p.public; S.update(COL, p.id, { public: nv });
        E.log(nv ? 'Projet publié sur le site' : 'Projet retiré du site', p.code + ' — ' + p.nom, 'projets');
        E.notify(nv ? 'Projet publié sur le site' : 'Projet retiré du site', p.code + ' — ' + p.nom, '#/projets/' + p.id, nv ? 'green' : 'grey');
        U.toast(nv ? 'Projet visible sur la page Projets du site public' : 'Projet retiré du site public'); refresh();
      } }] });
  }
  function projectFields() {
    return [{ name: 'code', label: 'Code court', required: true, placeholder: 'Ex. TORCHE' }, { name: 'statut', label: 'Statut', type: 'select', options: STATUTS },
      { name: 'nom', label: 'Intitulé du projet', required: true, full: true }, { name: 'partenaire', label: 'Partenaire / entreprise', placeholder: 'Ex. Équatoriale Industrie Services' },
      { name: 'responsable', label: 'Responsable', type: 'select', options: empOpts() }, { name: 'debut', label: 'Début', type: 'date', required: true }, { name: 'fin', label: 'Fin prévue', type: 'date', required: true },
      { name: 'meteo', label: 'Météo projet', type: 'select', options: [{ v: 'soleil', l: 'Au vert' }, { v: 'nuage', l: 'Vigilance' }, { v: 'orage', l: 'Critique' }] }, { name: 'budget', label: 'Budget (FCFA)', type: 'money' },
      { name: 'resume', label: 'Résumé (affiché sur le site si le projet est publié)', type: 'textarea' }];
  }
  function newProject() {
    U.formModal({ title: 'Nouveau projet', sub: 'Le projet est créé en interne ; vous pourrez le publier sur le site ensuite.', okLabel: 'Créer le projet', fields: projectFields(),
      values: { statut: 'Études', debut: today(), fin: E.addDays(today(), 365), meteo: 'soleil', responsable: M(0) },
      onSubmit: function (v) {
        if (v.fin <= v.debut) { U.toast('La date de fin doit suivre la date de début.', 'err'); return false; }
        var a = mIdx(v.debut), b = mIdx(v.fin), q = function (f) { return ymOf(Math.round(a + (b - a) * f)); };
        var p = { id: nextId(), code: String(v.code).toUpperCase(), nom: v.nom, public: false, resume: v.resume || '', partenaire: v.partenaire || '', debut: v.debut, fin: v.fin, avancement: 0, statut: v.statut, budget: +v.budget || 0, engage: 0, chef: 'Direction Projets',
          responsable: v.responsable, equipe: [v.responsable], meteo: v.meteo, jalons: [{ d: v.debut, t: 'Lancement du projet', fait: false }], taches: [], risques: [], journal: [], documents: [],
          budgetLignes: [{ lot: 'Budget global', budget: +v.budget || 0, engage: 0, facture: 0 }],
          courbe: { prevu: [[ymOf(a), 0], [q(.25), 12], [q(.5), 45], [q(.75), 82], [ymOf(b), 100]], reel: [[ymOf(a), 0]] } };
        all().push(p); S.save();
        E.log('Projet créé', p.id + ' — ' + p.nom, 'projets'); E.notify('Nouveau projet créé', p.code + ' — ' + p.nom, '#/projets/' + p.id, 'blue');
        U.toast('Projet ' + p.id + ' créé'); E.go('projets/' + p.id + '/taches');
      } });
  }
  function editProject(p) {
    U.formModal({ title: 'Modifier le projet', sub: p.id + (p.public ? ' · visible sur le site public' : ''), fields: projectFields(), values: p,
      onSubmit: function (v) {
        if (v.fin <= v.debut) { U.toast('La date de fin doit suivre la date de début.', 'err'); return false; }
        var patch = { code: String(v.code).toUpperCase(), nom: v.nom, statut: v.statut, partenaire: v.partenaire, responsable: v.responsable, debut: v.debut, fin: v.fin, meteo: v.meteo, resume: v.resume };
        if (+v.budget && +v.budget !== p.budget) { patch.budget = +v.budget; if ((p.budgetLignes || []).length === 1) p.budgetLignes[0].budget = +v.budget; }
        if (p.equipe && p.equipe.indexOf(v.responsable) < 0) p.equipe.unshift(v.responsable);
        S.update(COL, p.id, patch); E.log('Projet modifié', p.code + ' — ' + p.nom, 'projets'); U.toast('Projet mis à jour' + publicNote(p)); refresh();
      } });
  }

  /* ------------------------------------------------------------------ enregistrement */
  E.register({
    id: 'projets', label: 'Projets', title: 'Gestion de projets', icon: 'gantt', group: 'Pilotage', roles: ['projets', 'finance'],
    seed: seed, render: render,
    init: function () {
      /* Complète les projets créés par une version antérieure (sans champs enrichis). */
      if (!S.has(COL)) return;
      var changed = false;
      all().forEach(function (p) { if (!p.budgetLignes) { p.budgetLignes = [{ lot: 'Budget global', budget: p.budget || 0, engage: p.engage || 0, facture: 0 }]; changed = true; } ['equipe', 'risques', 'journal', 'documents', 'jalons', 'taches'].forEach(function (k) { if (!p[k]) { p[k] = []; changed = true; } }); });
      if (changed) S.save();
    },
    summary: function () {
      var P = all(), act = P.filter(isActive), late = P.filter(isLate);
      var wsum = E.sum(act, function (p) { return p.budget || 1; }), wav = wsum ? E.sum(act, function (p) { return (p.avancement || 0) * (p.budget || 1); }) / wsum : 0;
      var t = today(), t30 = E.addDays(t, 30), n = 0; P.forEach(function (p) { (p.jalons || []).forEach(function (j) { if (!j.fait && j.d >= t && j.d <= t30) n++; }); });
      return [{ label: 'Projets actifs', value: String(act.length), icon: 'gantt', tone: 'blue', foot: late.length ? late.length + ' en retard' : 'tous dans les temps', href: '#/projets' },
        { label: 'Avancement moyen', value: Math.round(wav) + ' %', icon: 'trend', tone: 'green', foot: n + ' jalon(s) dans les 30 j', href: '#/projets/planning' }];
    },
    pending: function (user) {
      var out = [], prof = user && user.profile, t = today();
      if (prof === 'admin' || prof === 'projets') {
        all().forEach(function (p) {
          overdueJalons(p).forEach(function (j) { out.push({ title: p.code + ' · Jalon dépassé : ' + j.t, sub: 'Prévu le ' + F.date(j.d) + ' · à confirmer ou replanifier', date: j.d, href: '#/projets/' + p.id + '/jalons', tone: 'red' }); });
          lateTasks(p).forEach(function (x) { out.push({ title: p.code + ' · Tâche en retard : ' + x.t, sub: 'Fin prévue ' + F.date(x.e) + ' · ' + x.p + ' % réalisé · ' + E.empName(x.resp), date: x.e, href: '#/projets/' + p.id + '/taches', tone: 'orange' }); });
        });
      }
      if (prof === 'admin' || prof === 'finance') {
        all().forEach(function (p) { if (isActive(p) && p.budget && p.engage / p.budget >= 0.75 && (p.avancement || 0) < 90) out.push({ title: p.code + ' · Budget engagé à ' + Math.round(p.engage / p.budget * 100) + ' %', sub: 'Avancement ' + p.avancement + ' % · reste ' + F.short(p.budget - p.engage) + ' FCFA', date: t, href: '#/projets/' + p.id + '/budget', tone: 'orange' }); });
      }
      return out;
    },
    search: function (q) {
      var res = [];
      all().forEach(function (p) {
        if (E.norm(p.id + ' ' + p.code + ' ' + p.nom + ' ' + p.partenaire).indexOf(q) >= 0) res.push({ title: p.code + ' — ' + p.nom, sub: p.statut + ' · ' + p.avancement + ' %', href: '#/projets/' + p.id });
        (p.taches || []).forEach(function (t) { if (E.norm(t.t).indexOf(q) >= 0) res.push({ title: t.t, sub: 'Tâche · ' + p.code + ' · ' + t.p + ' %', href: '#/projets/' + p.id + '/taches' }); });
      });
      return res;
    },
    badge: function () { var u = E.session.user(); if (!u || (u.profile !== 'admin' && u.profile !== 'projets')) return 0; return all().reduce(function (n, p) { return n + overdueJalons(p).length + lateTasks(p).length; }, 0); }
  });
})();
