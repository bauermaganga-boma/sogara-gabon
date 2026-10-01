/* SOGARA · Espace de gestion — module Personnel & compétences
   Effectifs, annuaire, fiche employé, congés & absences (circuit manager → RH),
   plan de formation 2026 et habilitations réglementaires avec alertes d'expiration. */
(function () {
  'use strict';
  var E = window.ERP; if (!E) return;
  var esc = E.esc, fmt = E.fmt, ui = E.ui, icon = E.icon;
  if (!document.getElementById('rh-css')) { var l = document.createElement('link'); l.id = 'rh-css'; l.rel = 'stylesheet'; l.href = 'css/rh.css'; document.head.appendChild(l); }

  var TYPES_CONGE = ['Congé annuel', 'Maladie', 'Événement familial', 'Récupération'];
  var TYPE_CLS = { 'Congé annuel': 's-ann', 'Maladie': 's-mal', 'Événement familial': 's-fam', 'Récupération': 's-rec', 'Formation': 's-for' };
  var TYPE_COL = { 'Congé annuel': '#2563eb', 'Maladie': '#d93636', 'Événement familial': '#7c3aed', 'Récupération': '#1e9e4a', 'Formation': '#e8780c' };
  var ST_CONGE = { 'En attente manager': 'orange', 'En attente RH': 'orange', 'Validé': 'green', 'Refusé': 'red', 'Annulé': 'grey' };
  var HAB = {
    'H0B0 (habilitation électrique non électricien)': 3, 'B1V / BR (habilitation électrique)': 3, 'ATEX niveau 1': 3, 'ATEX niveau 2': 3, 'Travail en hauteur': 3,
    'SST — Sauveteur secouriste du travail': 2, 'Permis poids lourd (C/CE)': 5, 'CACES R489 (chariots)': 5, 'CACES R486 (nacelles)': 5,
    'ARI — Appareil respiratoire isolant': 1, 'Sensibilisation H2S': 2, 'Travail en espace confiné': 3, 'Lutte contre l\'incendie (EPI)': 1
  };
  var HAB_ORG = { 'Permis poids lourd (C/CE)': 'Ministère des Transports', 'CACES R489 (chariots)': 'Centre de formation Mandji', 'CACES R486 (nacelles)': 'Centre de formation Mandji', 'ARI — Appareil respiratoire isolant': 'Service HSE SOGARA', 'Lutte contre l\'incendie (EPI)': 'Service HSE SOGARA' };
  var DOMAINES_F = ['Sécurité', 'Technique', 'Réglementaire', 'Management', 'Informatique', 'Langues'];
  var FEM = /(Aïcha|Clarisse|Estelle|Sandrine|Nadège|Carine|Laure|Diane|Irène|Béatrice|Sylvie|Ruth|Linda|Chancelle|Prisca|Ornella|Yolande|Christelle|Laetitia|Brenda|Joëlle|Merveille|Nadia|Emmanuella|Rolande|Sidonie|Pélagie|Esther|Grâce)$/;
  var SORTIES = [
    { nom: 'Mouity Germain', poste: 'Chef d\'équipe utilités', direction: 'PROD', date: '2026-03-31', motif: 'Départ à la retraite' },
    { nom: 'Nkoulou Sabine', poste: 'Assistante achats', direction: 'ACH', date: '2026-06-15', motif: 'Démission' },
    { nom: 'Ondjani Rufin', poste: 'Électricien', direction: 'MAINT', date: '2025-12-31', motif: 'Départ à la retraite' },
    { nom: 'Boukinda Max', poste: 'Technicien méthodes (CDD)', direction: 'PRJ', date: '2026-08-31', motif: 'Fin de CDD' }
  ];

  function user() { return E.session.user() || {}; }
  function canSalary() { var p = user().profile; return p === 'rh' || p === 'admin' || p === 'finance'; }
  function today() { return E.today(); }
  function emps() { return E.store.all('employes').filter(function (e) { return e.statut !== 'Sorti'; }); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function hnum(id) { return +String(id).replace(/\D/g, '') || 0; }
  function age(d) { if (!d) return 0; var b = E.parseDate(d), t = E.parseDate(today()); var a = t.getFullYear() - b.getFullYear(); if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--; return a; }
  function anc(e) { return Math.max(0, E.daysBetween(e.entree, today()) / 365.25); }
  function ancTxt(e) { var y = Math.floor(anc(e)), m = Math.floor((anc(e) - y) * 12); return y ? y + ' an' + (y > 1 ? 's' : '') + (m ? ' ' + m + ' mois' : '') : m + ' mois'; }
  function hist(o, a) { o.historique = o.historique || []; o.historique.unshift({ date: new Date().toISOString(), par: user().name || 'Système', action: a }); }
  function workDays(a, b) { var n = 0, d = E.parseDate(a), end = E.parseDate(b); while (d <= end) { var w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1); } return n; }
  function printDoc(title, html) {
    var w = window.open('', '_blank'); if (!w) { ui.toast('Autorisez les fenêtres pop-up pour imprimer.', 'err'); return; }
    var base = location.href.replace(/#.*$/, '').replace(/[^\/]*$/, '');
    w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + esc(title) + '</title><base href="' + base + '"><link rel="stylesheet" href="css/erp.css"><link rel="stylesheet" href="css/rh.css"></head><body class="rh-print">' + html + '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>');
    w.document.close();
  }
  function nextId(col, prefix) { var max = 100; E.store.all(col).forEach(function (x) { var m = new RegExp(prefix + '-\\d{4}-(\\d+)').exec(x.id); if (m && +m[1] > max) max = +m[1]; }); return prefix + '-2026-' + String(max + 1).padStart(3, '0'); }

  /* Compléments d'état civil des fiches du référentiel (déterministes, une seule fois) */
  function enrich() {
    var ch = false;
    E.store.all('employes').forEach(function (e) {
      if (e.naissance) return;
      var h = hnum(e.id), ey = +String(e.entree || '2015').slice(0, 4);
      var a0 = ey < 2012 ? 26 + (h * 7) % 14 : 22 + (h * 7) % 10;
      e.naissance = Math.min(ey - a0, 2003) + '-' + pad(1 + h % 12) + '-' + pad(1 + (h * 3) % 28);
      e.sexe = FEM.test(e.nom) ? 'F' : 'M';
      e.situation = ['Marié(e)', 'Célibataire', 'Marié(e)', 'Marié(e)', 'Célibataire', 'Divorcé(e)'][h % 6];
      e.enfants = e.situation === 'Célibataire' ? h % 2 : h % 5;
      e.cnss = '2' + String(10000000 + h * 7919).slice(-8);
      e.quart = e.direction === 'PROD' && /quart|opérat/i.test(e.poste || '');
      e.adresse = ['Quartier Balise', 'Cité SOGARA', 'Quartier Grand Village', 'Quartier Sindara', 'Matanda', 'Quartier Château'][h % 6] + ', Port-Gentil';
      ch = true;
    });
    if (ch) E.store.save();
  }

  /* ------------------------------------------------------------ données d'exemple */
  function seedConges() {
    var t = today(), list = E.store.all('employes');
    var by = function (n) { var e = list.find(function (x) { return x.nom.indexOf(n) === 0; }); return e ? e.id : list[0].id; };
    var rows = [
      ['Mintsa', 'Congé annuel', -6, 8, 'Validé'], ['Mayila', 'Congé annuel', 5, 18, 'En attente RH'], ['Engonga', 'Maladie', -2, 3, 'Validé'],
      ['Mengue', 'Événement familial', 2, 4, 'En attente manager'], ['Ditsougou', 'Congé annuel', 12, 25, 'En attente manager'], ['Ntoutoume', 'Récupération', 1, 1, 'En attente RH'],
      ['Essono', 'Congé annuel', -20, -9, 'Validé'], ['Koumba', 'Congé annuel', 20, 33, 'Validé'], ['Makaya', 'Maladie', -9, -5, 'Validé'],
      ['Ella', 'Congé annuel', 8, 12, 'Refusé'], ['Lendoye', 'Récupération', -1, 0, 'Validé'], ['Owono', 'Congé annuel', 15, 29, 'En attente RH'],
      ['Matsanga', 'Événement familial', -14, -12, 'Validé'], ['Bekale', 'Congé annuel', 26, 40, 'En attente manager'], ['Obiang', 'Congé annuel', -40, -27, 'Validé'],
      ['Nzamba', 'Récupération', 3, 4, 'Validé'], ['Mouketou', 'Congé annuel', -3, 6, 'Validé']
    ];
    return rows.map(function (r, i) {
      var d = E.addDays(t, r[2]), f = E.addDays(t, r[3]); if (E.parseDate(d).getDay() === 0) d = E.addDays(d, 1); if (E.parseDate(d).getDay() === 6) d = E.addDays(d, 2);
      var demande = E.addDays(d, -(6 + i % 9)), emp = by(r[0]);
      var c = { id: 'CG-2026-' + String(201 + i).padStart(3, '0'), employe: emp, type: r[1], debut: d, fin: f < d ? d : f, jours: workDays(d, f < d ? d : f), statut: r[4], demande: demande,
        motif: r[1] === 'Maladie' ? 'Arrêt de travail — certificat médical fourni' : r[1] === 'Événement familial' ? ['Mariage d\'un enfant', 'Naissance', 'Décès d\'un parent'][i % 3] : r[1] === 'Récupération' ? 'Récupération des heures de l\'arrêt U300' : 'Congés annuels', historique: [] };
      c.historique.push({ date: demande + 'T08:30:00', par: E.empName(emp), action: 'Demande déposée' });
      if (r[4] !== 'En attente manager') c.historique.unshift({ date: E.addDays(demande, 1) + 'T10:00:00', par: 'Responsable hiérarchique', action: 'Validée par le manager' });
      if (r[4] === 'Validé') c.historique.unshift({ date: E.addDays(demande, 2) + 'T15:00:00', par: 'Mboumba Aïcha', action: 'Validée par la DRH' });
      if (r[4] === 'Refusé') c.historique.unshift({ date: E.addDays(demande, 2) + 'T15:00:00', par: 'Mboumba Aïcha', action: 'Refusée — période de forte activité (préparation arrêt technique)' });
      return c;
    });
  }
  function seedFormations() {
    var by = function (dir, n) { return E.store.all('employes').filter(function (e) { return !dir || dir.indexOf(e.direction) >= 0; }).slice(0, n || 99).map(function (e) { return e.id; }); };
    var F = [
      ['Recyclage ARI — appareil respiratoire isolant', 'Service HSE SOGARA', 'Sécurité', '2026-02-10', '2026-02-11', by(['PROD', 'HSE'], 9), 1800000, 'Terminée', 'Centre incendie SOGARA', 'ARI — Appareil respiratoire isolant'],
      ['Habilitation électrique B1V/BR — recyclage', 'Gabon Électro-Tech', 'Réglementaire', '2026-03-16', '2026-03-18', by(['MAINT'], 4), 3200000, 'Terminée', 'Port-Gentil', 'B1V / BR (habilitation électrique)'],
      ['Conduite des unités de distillation (simulateur)', 'IFP Training', 'Technique', '2026-04-20', '2026-04-30', by(['PROD'], 6), 14500000, 'Terminée', 'Rueil-Malmaison (FR)', ''],
      ['Management d\'équipe et leadership sécurité', 'Cabinet Ogooué Conseil', 'Management', '2026-05-12', '2026-05-14', ['MAT-1041', 'MAT-1055', 'MAT-1069', 'MAT-1125', 'MAT-1076', 'MAT-1293'], 5400000, 'Terminée', 'Libreville', ''],
      ['SST — Sauveteur secouriste du travail (initiale)', 'Croix-Rouge gabonaise', 'Sécurité', '2026-06-08', '2026-06-09', by(['ACH', 'LABO', 'COM'], 8), 2100000, 'Terminée', 'Port-Gentil', 'SST — Sauveteur secouriste du travail'],
      ['ATEX niveau 2 — intervention en zone explosive', 'Bureau Veritas Formation', 'Réglementaire', '2026-07-06', '2026-07-08', by(['MAINT'], 6), 6600000, 'Terminée', 'Port-Gentil', 'ATEX niveau 2'],
      ['Excel avancé et tableaux de bord', 'Bureautique Océane', 'Informatique', '2026-09-14', '2026-09-16', by(['FIN', 'RH', 'ACH'], 6), 1500000, 'Terminée', 'Salle de formation SOGARA', ''],
      ['Sensibilisation H2S et gaz dangereux', 'Service HSE SOGARA', 'Sécurité', '2026-09-28', '2026-10-02', by(['PROD', 'LABO'], 12), 1200000, 'En cours', 'Centre incendie SOGARA', 'Sensibilisation H2S'],
      ['Travail en hauteur et port du harnais', 'Delta Scaffolding', 'Sécurité', '2026-10-12', '2026-10-13', by(['MAINT', 'HSE'], 8), 2400000, 'Planifiée', 'Port-Gentil', 'Travail en hauteur'],
      ['Analyse vibratoire niveau I', 'Équatoriale Industrie Services', 'Technique', '2026-10-19', '2026-10-23', ['MAT-1139', 'MAT-1132', 'MAT-1153'], 7800000, 'Planifiée', 'Port-Gentil', ''],
      ['Anglais technique pétrolier', 'Institut des langues Océan', 'Langues', '2026-10-05', '2026-12-18', ['MAT-1104', 'MAT-1258', 'MAT-1209', 'MAT-1181'], 4800000, 'Planifiée', 'Port-Gentil (cours du soir)', ''],
      ['Lutte contre l\'incendie — exercice annuel', 'Service HSE SOGARA', 'Sécurité', '2026-11-09', '2026-11-13', by(['PROD', 'HSE', 'MAINT'], 16), 2600000, 'Planifiée', 'Centre incendie SOGARA', 'Lutte contre l\'incendie (EPI)'],
      ['CACES R489 — chariots élévateurs', 'Centre de formation Mandji', 'Réglementaire', '2026-11-23', '2026-11-25', ['MAT-1188', 'MAT-1195', 'MAT-1202'], 1950000, 'Planifiée', 'Port-Gentil', 'CACES R489 (chariots)'],
      ['Normes Africa 5 — analyses carburants', 'LabEquip Africa', 'Technique', '2026-12-07', '2026-12-09', by(['LABO'], 3), 3900000, 'Planifiée', 'Douala (CM)', ''],
      ['Cybersécurité des systèmes industriels', 'Cabinet Ogooué Conseil', 'Informatique', '2026-08-24', '2026-08-26', ['MAT-1272'], 2800000, 'Annulée', 'Libreville', '']
    ];
    return F.map(function (f, i) { return { id: 'FOR-2026-' + String(101 + i).padStart(3, '0'), intitule: f[0], organisme: f[1], domaine: f[2], debut: f[3], fin: f[4], participants: f[5], cout: f[6], statut: f[7], lieu: f[8], habilitation: f[9] }; });
  }
  function seedHabilitations() {
    var t = today(), out = [], k = 0;
    E.store.all('employes').forEach(function (e) {
      var types = [], p = e.poste || '';
      if (e.direction === 'PROD') types = ['H0B0 (habilitation électrique non électricien)', 'ATEX niveau 1', 'Sensibilisation H2S', 'ARI — Appareil respiratoire isolant'];
      else if (e.direction === 'MAINT') types = (/lectric|instrument/i.test(p) ? ['B1V / BR (habilitation électrique)'] : ['H0B0 (habilitation électrique non électricien)']).concat(['ATEX niveau 2', 'Travail en hauteur'], /chaudron|soud|méca/i.test(p) ? ['Travail en espace confiné'] : []);
      else if (e.direction === 'HSE') types = ['SST — Sauveteur secouriste du travail', 'Lutte contre l\'incendie (EPI)', 'ARI — Appareil respiratoire isolant', 'Sensibilisation H2S'];
      else if (e.direction === 'ACH') types = /chauffeur/i.test(p) ? ['Permis poids lourd (C/CE)', 'H0B0 (habilitation électrique non électricien)'] : /stock|expédition/i.test(p) ? ['CACES R489 (chariots)', 'SST — Sauveteur secouriste du travail'] : ['SST — Sauveteur secouriste du travail'];
      else if (e.direction === 'LABO') types = ['Sensibilisation H2S', 'ATEX niveau 1'];
      else if (hnum(e.id) % 3 === 0) types = ['SST — Sauveteur secouriste du travail'];
      types.forEach(function (ty) {
        k++; var v = HAB[ty], exp;
        if (k % 11 === 0) exp = E.addDays(t, -(5 + k % 35));
        else if (k % 7 === 0) exp = E.addDays(t, 6 + (k * 13) % 54);
        else exp = E.addDays(t, 62 + (k * 97) % Math.max(60, v * 365 - 70));
        var obt = E.addDays(exp, -Math.round(v * 365.25));
        out.push({ id: 'HAB-' + String(1001 + k), employe: e.id, type: ty, organisme: HAB_ORG[ty] || ['Bureau Veritas Formation', 'APAVE Gabon', 'Service HSE SOGARA'][k % 3], obtention: obt, expiration: exp, numero: 'N° ' + (240000 + k * 37) });
      });
    });
    return out;
  }

  /* ------------------------------------------------------------ calculs */
  function habState(h) { var d = E.daysBetween(today(), h.expiration); return d < 0 ? { l: 'Expirée', t: 'red', d: d } : d <= 60 ? { l: 'Expire dans ' + d + ' j', t: 'orange', d: d } : { l: 'Valide', t: 'green', d: d }; }
  function soldeConges(e) {
    var y = today().slice(0, 4), h = hnum(e.id);
    var acquis = 24, report = h % 7, pris = (h * 3) % 9;
    E.store.all('conges').forEach(function (c) { if (c.employe === e.id && c.type === 'Congé annuel' && c.statut === 'Validé' && c.debut.slice(0, 4) === y) pris += c.jours; });
    return { acquis: acquis, report: report, pris: pris, solde: acquis + report - pris };
  }
  function absentToday() { var t = today(); return E.store.all('conges').filter(function (c) { return c.statut === 'Validé' && c.debut <= t && c.fin >= t; }); }

  /* ------------------------------------------------------------ actions */
  function congeAction(c, act) {
    if (act === 'manager') { c.statut = 'En attente RH'; hist(c, 'Validée par le manager (N+1)'); E.notify('Congé à valider (RH)', E.empName(c.employe) + ' — ' + c.type + ', ' + c.jours + ' j', '#/personnel/conges', 'orange'); }
    else if (act === 'rh') { c.statut = 'Validé'; hist(c, 'Validée par la DRH'); E.notify('Congé validé', E.empName(c.employe) + ' — du ' + fmt.dateShort(c.debut) + ' au ' + fmt.dateShort(c.fin), '#/personnel/conges', 'green'); }
    else if (act === 'refus') {
      return ui.formModal({ title: 'Refuser la demande', sub: esc(E.empName(c.employe)) + ' · ' + esc(c.type), okLabel: 'Refuser', fields: [{ name: 'motif', label: 'Motif', type: 'textarea', required: true, value: 'Période de forte activité' }], onSubmit: function (v) { c.statut = 'Refusé'; hist(c, 'Refusée — ' + v.motif); E.store.save(); E.log('Congé refusé', c.id, 'personnel'); ui.toast('Demande refusée'); setTimeout(E.rerender); } });
    }
    E.store.save(); E.log('Congé · ' + c.statut, c.id + ' · ' + E.empName(c.employe), 'personnel'); ui.toast(c.statut === 'Validé' ? 'Congé validé — l\'employé est notifié' : 'Validé par le manager — transmis à la RH'); E.rerender();
  }
  function nouveauConge(empId) {
    ui.formModal({ title: 'Nouvelle demande d\'absence', sub: 'Circuit : manager (N+1) → Ressources humaines', okLabel: 'Déposer la demande',
      fields: [
        { name: 'employe', label: 'Employé', type: 'select', options: E.options('employes', function (e) { return e.nom + ' — ' + e.id; }), value: empId || '', required: true, full: true },
        { name: 'type', label: 'Type', type: 'select', options: TYPES_CONGE }, { name: 'motif', label: 'Motif / commentaire' },
        { name: 'debut', label: 'Du', type: 'date', required: true, value: E.addDays(today(), 7) }, { name: 'fin', label: 'Au (inclus)', type: 'date', required: true, value: E.addDays(today(), 18) }
      ],
      onSubmit: function (v) {
        if (v.fin < v.debut) { ui.toast('La date de fin précède la date de début.', 'err'); return false; }
        var c = { id: nextId('conges', 'CG'), employe: v.employe, type: v.type, debut: v.debut, fin: v.fin, jours: workDays(v.debut, v.fin), statut: 'En attente manager', demande: today(), motif: v.motif || v.type, historique: [] };
        hist(c, 'Demande déposée'); E.store.add('conges', c); E.log('Demande de congé', c.id + ' · ' + E.empName(v.employe), 'personnel');
        ui.toast('Demande ' + c.id + ' déposée (' + c.jours + ' jour(s) ouvré(s))'); setTimeout(E.rerender);
      } });
  }
  function nouvelleHab(empId) {
    ui.formModal({ title: 'Ajouter une habilitation', okLabel: 'Enregistrer',
      fields: [
        { name: 'employe', label: 'Employé', type: 'select', options: E.options('employes', function (e) { return e.nom + ' — ' + e.id; }), value: empId || '', full: true },
        { name: 'type', label: 'Habilitation / certification', type: 'select', options: Object.keys(HAB), full: true },
        { name: 'organisme', label: 'Organisme', value: 'Bureau Veritas Formation' }, { name: 'numero', label: 'N° de titre', value: 'N° ' + (250000 + Math.floor(Math.random() * 9999)) },
        { name: 'obtention', label: 'Date d\'obtention', type: 'date', value: today(), required: true }
      ],
      onSubmit: function (v) {
        var h = { id: 'HAB-' + (2000 + E.store.all('habilitations').length + 1), employe: v.employe, type: v.type, organisme: v.organisme, numero: v.numero, obtention: v.obtention, expiration: E.addDays(v.obtention, Math.round(HAB[v.type] * 365.25)) };
        E.store.add('habilitations', h); E.log('Habilitation ajoutée', v.type + ' · ' + E.empName(v.employe), 'personnel'); ui.toast('Habilitation enregistrée — valable jusqu\'au ' + fmt.date(h.expiration)); setTimeout(E.rerender);
      } });
  }
  function renouveler(h) {
    ui.formModal({ title: 'Renouveler l\'habilitation', sub: esc(h.type) + ' · ' + esc(E.empName(h.employe)), okLabel: 'Renouveler',
      fields: [{ name: 'obtention', label: 'Date du recyclage', type: 'date', value: today(), required: true }, { name: 'organisme', label: 'Organisme', value: h.organisme }],
      onSubmit: function (v) { h.obtention = v.obtention; h.organisme = v.organisme; h.expiration = E.addDays(v.obtention, Math.round((HAB[h.type] || 3) * 365.25)); E.store.save(); E.log('Habilitation renouvelée', h.type + ' · ' + E.empName(h.employe), 'personnel'); ui.toast('Renouvelée jusqu\'au ' + fmt.date(h.expiration)); setTimeout(E.rerender); } });
  }
  function modifierEmp(e) {
    ui.formModal({ title: 'Modifier la fiche', sub: esc(e.nom) + ' · ' + e.id,
      fields: [
        { name: 'poste', label: 'Poste', value: e.poste, required: true, full: true }, { name: 'direction', label: 'Direction', type: 'select', options: E.options('directions'), value: e.direction },
        { name: 'categorie', label: 'Catégorie', type: 'select', options: ['Employé', 'Agent de maîtrise', 'Cadre', 'Cadre sup.'], value: e.categorie },
        { name: 'contrat', label: 'Contrat', type: 'select', options: ['CDI', 'CDD', 'Stage'], value: e.contrat }, { name: 'statut', label: 'Statut', type: 'select', options: ['Actif', 'Période d\'essai', 'Suspendu'], value: e.statut },
        { name: 'salaire', label: 'Salaire de base mensuel (FCFA)', type: 'money', value: e.salaire }, { name: 'tel', label: 'Téléphone', value: e.tel }, { name: 'email', label: 'Courriel', value: e.email },
        { name: 'situation', label: 'Situation familiale', type: 'select', options: ['Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf(ve)'], value: e.situation }, { name: 'enfants', label: 'Enfants à charge', type: 'number', min: 0, value: e.enfants || 0 }
      ],
      onSubmit: function (v) { Object.assign(e, v); e.salaire = +v.salaire; e.enfants = +v.enfants; e.quart = e.direction === 'PROD' && /quart|opérat/i.test(e.poste); E.store.save(); E.log('Fiche employé modifiée', e.id + ' · ' + e.nom, 'personnel'); ui.toast('Fiche mise à jour'); setTimeout(E.rerender); } });
  }
  function attestationHTML(e) {
    return '<div class="doc rh-doc"><div class="doc__head"><div class="row" style="gap:14px"><img src="../assets/img/logo.png" alt="SOGARA"><div class="co"><b>SOGARA</b><span>Société Gabonaise de Raffinage</span><span>Zone industrielle — Port-Gentil, Gabon</span></div></div><div style="text-align:right"><span class="small muted">Réf. DRH/ATT/' + esc(e.id) + '</span><br><b>Port-Gentil, le ' + fmt.date(today()) + '</b></div></div>' +
      '<h4 style="text-align:center;margin:18px 0">ATTESTATION DE TRAVAIL</h4>' +
      '<p>Je soussignée, <b>Mboumba Aïcha</b>, Responsable des Ressources humaines de la Société Gabonaise de Raffinage (SOGARA), atteste que :</p>' +
      '<div class="box" style="margin:12px 0"><dl class="kv"><dt>Nom et prénoms</dt><dd><b>' + esc(e.nom) + '</b></dd><dt>Matricule</dt><dd>' + esc(e.id) + '</dd><dt>N° CNSS</dt><dd>' + esc(e.cnss || '—') + '</dd><dt>Emploi occupé</dt><dd>' + esc(e.poste) + '</dd><dt>Direction</dt><dd>' + esc(E.dirName(e.direction)) + '</dd><dt>Catégorie</dt><dd>' + esc(e.categorie) + '</dd><dt>Nature du contrat</dt><dd>' + esc(e.contrat) + '</dd></dl></div>' +
      '<p>est employé(e) dans notre société depuis le <b>' + fmt.date(e.entree) + '</b> et y exerce à ce jour ses fonctions' + (e.statut === 'Période d\'essai' ? ' (période d\'essai en cours)' : '') + '.</p><p>La présente attestation est délivrée à l\'intéressé(e), sur sa demande, pour servir et valoir ce que de droit.</p>' +
      '<div class="sign"><div></div><div>La Responsable des Ressources humaines<br><b>Mboumba Aïcha</b></div></div><div class="foot">SOGARA · Société Gabonaise de Raffinage · Port-Gentil — Document généré par l\'espace de gestion (démonstration)</div></div>';
  }

  /* ------------------------------------------------------------ vues */
  function header(view, active) {
    var pend = E.store.all('conges').filter(function (c) { return /attente/.test(c.statut); }).length;
    var alerts = E.store.all('habilitations').filter(function (h) { return habState(h).d <= 60; }).length;
    view.innerHTML = '<div class="rh-head"><div><h2>Personnel & compétences</h2><p>' + emps().length + ' collaborateurs · ' + E.store.all('directions').length + ' directions · raffinerie de Port-Gentil</p></div><div class="rh-actions">' +
      '<button class="btn" data-a="conge">' + icon('calendar') + 'Demande d\'absence</button><button class="btn" data-a="hab">' + icon('shield') + 'Ajouter une habilitation</button><button class="btn primary" data-a="form">' + icon('graduation') + 'Nouvelle formation</button></div></div>' +
      ui.tabs([{ k: 'effectifs', l: 'Effectifs' }, { k: 'annuaire', l: 'Annuaire', n: emps().length }, { k: 'conges', l: 'Congés & absences', n: pend || null }, { k: 'formations', l: 'Formations' }, { k: 'habilitations', l: 'Habilitations', n: alerts || null }], active, function (k) { E.go('personnel/' + (k === 'effectifs' ? '' : k)); }) + '<div id="pe-body"></div>';
    view.querySelector('[data-a=conge]').onclick = function () { nouveauConge(); };
    view.querySelector('[data-a=hab]').onclick = function () { nouvelleHab(); };
    view.querySelector('[data-a=form]').onclick = nouvelleFormation;
    return view.querySelector('#pe-body');
  }

  function hbars(items, fmtv) {
    var max = Math.max.apply(null, items.map(function (x) { return x.v; }).concat([1]));
    return '<div class="rh-hbars">' + items.map(function (x) { return '<div class="rh-hbar"><span title="' + esc(x.l) + '">' + esc(x.l) + '</span><div><i style="width:' + (x.v / max * 100).toFixed(1) + '%' + (x.c ? ';background:' + x.c : '') + '"></i></div><b>' + (fmtv ? fmtv(x.v) : x.v) + '</b></div>'; }).join('') + '</div>';
  }

  function renderEffectifs(body) {
    var list = emps(), t = today();
    var fem = list.filter(function (e) { return e.sexe === 'F'; }).length;
    var ancM = E.sum(list, anc) / (list.length || 1), ageM = E.sum(list, function (e) { return age(e.naissance); }) / (list.length || 1);
    var y1 = E.addDays(t, -365);
    var entrees = list.filter(function (e) { return e.entree >= y1; }), sorties = SORTIES.filter(function (s) { return s.date >= y1; });
    var turnover = ((entrees.length + sorties.length) / 2) / (list.length || 1) * 100;
    var essai = list.filter(function (e) { return e.statut === 'Période d\'essai'; });
    var html = '<div class="grid g4 rh-kpis">' +
      ui.kpi({ label: 'Effectif total', value: list.length, icon: 'users', tone: 'blue', foot: essai.length ? essai.length + ' en période d\'essai' : 'Tous en CDI confirmés' }) +
      ui.kpi({ label: 'Part des femmes', value: fmt.num(fem / (list.length || 1) * 100), unit: '%', icon: 'users', tone: 'violet', foot: fem + ' femmes · ' + (list.length - fem) + ' hommes' }) +
      ui.kpi({ label: 'Ancienneté moyenne', value: fmt.num(ancM, 1), unit: 'ans', icon: 'clock', tone: 'green', foot: 'Âge moyen ' + fmt.num(ageM, 1) + ' ans' }) +
      ui.kpi({ label: 'Turnover (12 mois)', value: fmt.num(turnover, 1), unit: '%', icon: 'refresh', tone: 'orange', foot: entrees.length + ' entrée(s) · ' + sorties.length + ' sortie(s)' }) + '</div>';
    var dirs = E.store.all('directions').map(function (d) { return { l: d.nom, v: list.filter(function (e) { return e.direction === d.id; }).length }; }).filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; });
    var cats = ['Employé', 'Agent de maîtrise', 'Cadre', 'Cadre sup.'].map(function (c, i) { return { label: c, value: list.filter(function (e) { return e.categorie === c; }).length, color: ['#94a3b8', '#2563eb', '#0f2d5c', '#f5c400'][i] }; });
    var bands = [['60 +', 60, 99], ['55-59', 55, 59], ['50-54', 50, 54], ['45-49', 45, 49], ['40-44', 40, 44], ['35-39', 35, 39], ['30-34', 30, 34], ['< 30', 0, 29]];
    var pmax = 1; var pdata = bands.map(function (b) { var m = list.filter(function (e) { var a = age(e.naissance); return e.sexe !== 'F' && a >= b[1] && a <= b[2]; }).length, f = list.filter(function (e) { var a = age(e.naissance); return e.sexe === 'F' && a >= b[1] && a <= b[2]; }).length; pmax = Math.max(pmax, m, f); return [b[0], m, f]; });
    var pyr = '<div class="rh-pyr"><div class="rh-pyr__row small"><div style="text-align:right;color:#2563eb;font-weight:600">Hommes</div><span></span><div style="color:#be185d;font-weight:600">Femmes</div></div>' + pdata.map(function (r) { return '<div class="rh-pyr__row"><div class="rh-pyr__l"><i style="width:' + (r[1] / pmax * 100) + '%"></i><b>' + (r[1] || '') + '</b></div><span>' + r[0] + '</span><div class="rh-pyr__r"><i style="width:' + (r[2] / pmax * 100) + '%"></i><b>' + (r[2] || '') + '</b></div></div>'; }).join('') + '</div>';
    var retraite = list.filter(function (e) { return age(e.naissance) >= 55; }).length;
    html += '<div class="grid g-2-1" style="margin-bottom:16px"><div class="card"><div class="card__h"><h3>Répartition par direction</h3><span class="sub">effectif</span></div><div class="card__b">' + hbars(dirs) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Par catégorie</h3></div><div class="card__b">' + ui.donut(cats, { center: list.length, sub: 'salariés' }) + '</div></div></div>';
    /* mouvements 12 mois */
    var labels = [], ent = [], sor = [], d0 = E.parseDate(t);
    for (var i = 11; i >= 0; i--) { var d = new Date(d0.getFullYear(), d0.getMonth() - i, 1), key = d.getFullYear() + '-' + pad(d.getMonth() + 1); labels.push(E.MOIS[d.getMonth()]); ent.push(E.store.all('employes').filter(function (e) { return String(e.entree).slice(0, 7) === key; }).length); sor.push(SORTIES.filter(function (s) { return s.date.slice(0, 7) === key; }).length); }
    var habs = E.store.all('habilitations'), exp = habs.filter(function (h) { return habState(h).d < 0; }), soon = habs.filter(function (h) { var d = habState(h).d; return d >= 0 && d <= 60; });
    var pend = E.store.all('conges').filter(function (c) { return /attente/.test(c.statut); });
    var alerts = [];
    if (exp.length) alerts.push(['red', 'shield', exp.length + ' habilitation(s) expirée(s)', 'Personnel non autorisé à intervenir tant que le recyclage n\'est pas fait', '#/personnel/habilitations']);
    if (soon.length) alerts.push(['orange', 'clock', soon.length + ' habilitation(s) expirent sous 60 jours', 'Planifier les recyclages', '#/personnel/habilitations']);
    essai.forEach(function (e) { var fin = E.addDays(e.entree, 90); alerts.push(['violet', 'userplus', 'Période d\'essai · ' + e.nom, 'Fin le ' + fmt.date(fin) + ' — entretien de confirmation à prévoir', '#/personnel/' + e.id]); });
    if (pend.length) alerts.push(['blue', 'calendar', pend.length + ' demande(s) d\'absence à traiter', 'Circuit manager → RH', '#/personnel/conges']);
    if (retraite) alerts.push(['grey', 'users', retraite + ' collaborateur(s) de 55 ans et plus', 'Anticiper la transmission des savoirs', '#/personnel/annuaire']);
    html += '<div class="grid g3"><div class="card"><div class="card__h"><h3>Pyramide des âges</h3></div><div class="card__b">' + pyr + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Entrées et sorties</h3><span class="sub">12 derniers mois</span></div><div class="card__b">' + ui.bars({ labels: labels, series: [{ name: 'Entrées', values: ent, color: '#1e9e4a' }, { name: 'Sorties', values: sor, color: '#d93636' }], height: 180 }) +
      '<div class="list" style="margin-top:8px">' + SORTIES.filter(function (s) { return s.date >= y1; }).map(function (s) { return '<div class="small" style="padding:4px 0;border-bottom:1px dashed var(--line)"><b>' + esc(s.nom) + '</b> · ' + esc(s.motif) + ' · ' + fmt.dateShort(s.date) + '</div>'; }).join('') + '</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Points d\'attention</h3></div><div class="list">' + alerts.map(function (a) { return '<a class="list__item" href="' + a[4] + '" style="color:inherit"><div class="list__icon tone-' + a[0] + '">' + icon(a[1]) + '</div><div class="list__body"><b>' + esc(a[2]) + '</b><div class="small muted">' + esc(a[3]) + '</div></div></a>'; }).join('') + '</div></div></div>';
    body.innerHTML = html;
  }

  var annF = { q: '', dir: '', cat: '', mode: 'cards' };
  function renderAnnuaire(body) {
    var sel = function (id, cur, opts, empty) { return '<select class="select" id="' + id + '"><option value="">' + empty + '</option>' + opts.map(function (o) { return '<option value="' + esc(o.v) + '"' + (cur === o.v ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select>'; };
    body.innerHTML = '<div class="filters"><input class="input" id="an-q" type="search" placeholder="Nom, poste, matricule…" value="' + esc(annF.q) + '">' + sel('an-dir', annF.dir, E.options('directions'), 'Toutes les directions') + sel('an-cat', annF.cat, ['Employé', 'Agent de maîtrise', 'Cadre', 'Cadre sup.'].map(function (c) { return { v: c, l: c }; }), 'Toutes catégories') +
      '<span class="spacer"></span><div class="rh-seg"><button data-m="cards" class="' + (annF.mode === 'cards' ? 'is-active' : '') + '" title="Cartes">' + icon('grid') + '</button><button data-m="table" class="' + (annF.mode === 'table' ? 'is-active' : '') + '" title="Tableau">' + icon('list') + '</button></div><button class="btn" id="an-csv">' + icon('download') + 'CSV</button></div><div id="an-res"></div>';
    var rows = [];
    var cols = [{ label: 'Matricule', key: 'id', render: function (e) { return '<span class="mono">' + e.id + '</span>'; } }, { label: 'Nom', render: function (e) { return '<div class="row" style="gap:8px;flex-wrap:nowrap">' + ui.avatar(e.nom, null, true) + '<b>' + esc(e.nom) + '</b></div>'; }, csv: function (e) { return e.nom; } }, { label: 'Poste', key: 'poste' }, { label: 'Direction', render: function (e) { return esc(E.dirName(e.direction)); }, csv: function (e) { return E.dirName(e.direction); } }, { label: 'Catégorie', key: 'categorie' }, { label: 'Ancienneté', render: ancTxt, csv: function (e) { return fmt.num(anc(e), 1); } }, { label: 'Statut', render: function (e) { return ui.badge(e.statut, e.statut === 'Actif' ? 'green' : 'violet'); }, csv: function (e) { return e.statut; } }, { label: 'Téléphone', key: 'tel' }];
    var draw = function () {
      var q = E.norm(annF.q);
      rows = emps().filter(function (e) { return (!q || E.norm(e.nom + ' ' + e.poste + ' ' + e.id).indexOf(q) >= 0) && (!annF.dir || e.direction === annF.dir) && (!annF.cat || e.categorie === annF.cat); }).sort(function (a, b) { return a.nom.localeCompare(b.nom); });
      var res = body.querySelector('#an-res');
      if (annF.mode === 'table') { res.innerHTML = '<div class="card">' + ui.table(cols, rows, { onRow: function (e) { E.go('personnel/' + e.id); } }) + '</div>'; return; }
      res.innerHTML = '<div class="rh-people">' + (rows.map(function (e) {
        return '<div class="card rh-emp" data-id="' + e.id + '"><div class="rh-person__top">' + ui.avatar(e.nom) + '<div><b>' + esc(e.nom) + '</b><span class="small muted">' + esc(e.poste) + '</span></div></div><div class="rh-person__info"><span>' + icon('factory') + esc(E.dirName(e.direction)) + ' · ' + esc(e.categorie) + '</span><span>' + icon('phone') + esc(e.tel || '—') + '</span><span>' + icon('mail') + esc(e.email || '—') + '</span></div>' +
          '<div class="rh-person__f"><span class="mono small muted">' + e.id + '</span><span class="spacer"></span>' + (e.statut !== 'Actif' ? ui.badge(e.statut, 'violet') : '<span class="small muted">' + ancTxt(e) + '</span>') + '</div></div>';
      }).join('') || '<div class="card empty">Aucun résultat</div>') + '</div>';
      res.querySelectorAll('.rh-emp').forEach(function (c) { c.onclick = function () { E.go('personnel/' + c.dataset.id); }; });
    };
    body.querySelector('#an-q').oninput = function (e) { annF.q = e.target.value; draw(); };
    body.querySelector('#an-dir').onchange = function (e) { annF.dir = e.target.value; draw(); };
    body.querySelector('#an-cat').onchange = function (e) { annF.cat = e.target.value; draw(); };
    body.querySelectorAll('[data-m]').forEach(function (b) { b.onclick = function () { annF.mode = b.dataset.m; body.querySelectorAll('[data-m]').forEach(function (x) { x.classList.toggle('is-active', x === b); }); draw(); }; });
    body.querySelector('#an-csv').onclick = function () { ui.exportCSV('annuaire-sogara', cols, rows); };
    draw();
  }

  function congeButtons(c) {
    if (c.statut === 'En attente manager') return '<button class="btn sm success" data-ca="manager" data-id="' + c.id + '">' + icon('check') + 'Valider N+1</button><button class="btn sm danger" data-ca="refus" data-id="' + c.id + '">Refuser</button>';
    if (c.statut === 'En attente RH') return '<button class="btn sm success" data-ca="rh" data-id="' + c.id + '">' + icon('check') + 'Valider RH</button><button class="btn sm danger" data-ca="refus" data-id="' + c.id + '">Refuser</button>';
    return '';
  }
  function bindConge(root) { root.querySelectorAll('[data-ca]').forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); congeAction(E.store.get('conges', b.dataset.id), b.dataset.ca); }; }); }
  var calMonth = null, cgF = 'attente';
  function calendar(month) {
    var d0 = E.parseDate(month + '-01'), y = d0.getFullYear(), m = d0.getMonth(), n = new Date(y, m + 1, 0).getDate(), t = today();
    var first = month + '-01', last = month + '-' + pad(n);
    var cg = E.store.all('conges').filter(function (c) { return c.statut !== 'Refusé' && c.statut !== 'Annulé' && c.debut <= last && c.fin >= first; });
    var forms = E.store.all('formations').filter(function (f) { return f.statut !== 'Annulée' && f.debut <= last && f.fin >= first && E.daysBetween(f.debut, f.fin) < 15; });
    var rows = {};
    cg.forEach(function (c) { (rows[c.employe] = rows[c.employe] || []).push({ debut: c.debut, fin: c.fin, type: c.type, pending: c.statut !== 'Validé' }); });
    forms.forEach(function (f) { f.participants.slice(0, 6).forEach(function (p) { (rows[p] = rows[p] || []).push({ debut: f.debut, fin: f.fin, type: 'Formation', pending: false }); }); });
    var head = '<tr><th class="who">Collaborateur</th>';
    for (var i = 1; i <= n; i++) { var dd = new Date(y, m, i), we = dd.getDay() === 0 || dd.getDay() === 6, key = month + '-' + pad(i); head += '<th class="' + (we ? 'we ' : '') + (key === t ? 'today' : '') + '">' + 'DLMMJVS'[dd.getDay()] + '<br>' + i + '</th>'; }
    head += '</tr>';
    var body = Object.keys(rows).sort(function (a, b) { return E.empName(a).localeCompare(E.empName(b)); }).map(function (id) {
      var r = '<tr><td class="who" title="' + esc(E.empName(id)) + '">' + esc(E.empName(id)) + '</td>';
      for (var i = 1; i <= n; i++) { var key = month + '-' + pad(i), dd = new Date(y, m, i), we = dd.getDay() === 0 || dd.getDay() === 6; var a = rows[id].find(function (x) { return x.debut <= key && x.fin >= key; }); r += '<td class="' + (we ? 'we' : '') + '">' + (a && !we ? '<i class="' + TYPE_CLS[a.type] + (a.pending ? ' pending' : '') + '" title="' + esc(a.type + (a.pending ? ' (en attente)' : '')) + '"></i>' : '') + '</td>'; }
      return r + '</tr>';
    }).join('');
    return '<div class="rh-cal"><table>' + head + (body || '<tr><td class="who">Aucune absence</td><td colspan="' + n + '"></td></tr>') + '</table></div>' +
      '<div class="legend" style="padding:10px 14px">' + Object.keys(TYPE_COL).map(function (k) { return '<span><i style="background:' + TYPE_COL[k] + '"></i>' + k + '</span>'; }).join('') + '<span><i style="background:#2563eb;opacity:.45"></i>En attente de validation</span></div>';
  }
  function renderConges(body) {
    var all = E.store.all('conges'), t = today();
    calMonth = calMonth || t.slice(0, 7);
    var pend = all.filter(function (c) { return /attente/.test(c.statut); });
    var abs = absentToday();
    var mois = t.slice(0, 7), joursMois = E.sum(all.filter(function (c) { return c.statut === 'Validé' && c.debut.slice(0, 7) === mois; }), 'jours');
    var mal = E.sum(all.filter(function (c) { return c.type === 'Maladie' && c.statut === 'Validé'; }), 'jours');
    var html = '<div class="grid g4 rh-kpis">' + ui.kpi({ label: 'Demandes à valider', value: pend.length, icon: 'inbox', tone: 'orange', foot: pend.filter(function (c) { return c.statut === 'En attente RH'; }).length + ' au niveau RH' }) +
      ui.kpi({ label: 'Absents aujourd\'hui', value: abs.length, icon: 'calendar', tone: 'blue', foot: abs.map(function (c) { return E.empName(c.employe).split(' ')[0]; }).join(', ') || '—' }) +
      ui.kpi({ label: 'Jours posés ce mois', value: joursMois, icon: 'clock', tone: 'violet', foot: 'jours ouvrés validés' }) +
      ui.kpi({ label: 'Taux d\'absentéisme maladie', value: fmt.num(mal / (emps().length * 21) * 100, 1), unit: '%', icon: 'alert', tone: 'red', foot: mal + ' jours d\'arrêt sur le mois' }) + '</div>';
    var d = E.parseDate(calMonth + '-01');
    html += '<div class="card" style="margin-bottom:16px"><div class="card__h"><h3>Calendrier des absences</h3><span class="spacer"></span><button class="btn sm" id="cal-prev" aria-label="Mois précédent">‹</button><b style="min-width:120px;text-align:center;text-transform:capitalize">' + fmt.month(d) + '</b><button class="btn sm" id="cal-next" aria-label="Mois suivant">›</button></div>' + calendar(calMonth) + '</div>';
    var groups = { attente: pend, valides: all.filter(function (c) { return c.statut === 'Validé'; }), refuses: all.filter(function (c) { return c.statut === 'Refusé'; }), toutes: all };
    var cols = [{ label: 'N°', render: function (c) { return '<span class="mono">' + c.id + '</span>'; }, csv: function (c) { return c.id; } }, { label: 'Employé', render: function (c) { return '<b>' + esc(E.empName(c.employe)) + '</b><div class="small muted">' + esc(E.dirName((E.emp(c.employe) || {}).direction)) + '</div>'; }, csv: function (c) { return E.empName(c.employe); } }, { label: 'Type', render: function (c) { return '<span class="row" style="gap:6px;flex-wrap:nowrap"><i style="width:9px;height:9px;border-radius:3px;background:' + TYPE_COL[c.type] + '"></i>' + esc(c.type) + '</span>'; }, csv: function (c) { return c.type; } },
      { label: 'Période', render: function (c) { return fmt.dateShort(c.debut) + ' → ' + fmt.dateShort(c.fin); }, csv: function (c) { return c.debut + ' > ' + c.fin; } }, { label: 'Jours', key: 'jours', num: true }, { label: 'Statut', render: function (c) { return ui.badge(c.statut, ST_CONGE[c.statut]); }, csv: function (c) { return c.statut; } }, { label: 'Actions', render: congeButtons, csv: function () { return ''; } }];
    var rows = groups[cgF].slice().sort(function (a, b) { return a.debut.localeCompare(b.debut); });
    html += '<div class="card"><div class="card__h"><h3>Demandes d\'absence</h3><div class="chips" style="margin-left:auto">' + [['attente', 'À valider'], ['valides', 'Validées'], ['refuses', 'Refusées'], ['toutes', 'Toutes']].map(function (k) { return '<button class="chip' + (cgF === k[0] ? ' is-active' : '') + '" data-cf="' + k[0] + '">' + k[1] + ' (' + groups[k[0]].length + ')</button>'; }).join('') + '</div></div>' +
      '<div class="card__b" style="padding-bottom:0">' + ui.steps(['Demande déposée', 'Validation manager (N+1)', 'Validation RH', 'Absence planifiée'], 4) + '</div>' + ui.table(cols, rows, { onRow: function (c) { ficheConge(c); }, empty: 'Aucune demande' }) + '</div>';
    body.innerHTML = html;
    body.querySelector('#cal-prev').onclick = function () { var x = E.parseDate(calMonth + '-01'); x.setMonth(x.getMonth() - 1); calMonth = x.getFullYear() + '-' + pad(x.getMonth() + 1); renderConges(body); };
    body.querySelector('#cal-next').onclick = function () { var x = E.parseDate(calMonth + '-01'); x.setMonth(x.getMonth() + 1); calMonth = x.getFullYear() + '-' + pad(x.getMonth() + 1); renderConges(body); };
    body.querySelectorAll('[data-cf]').forEach(function (b) { b.onclick = function () { cgF = b.dataset.cf; renderConges(body); }; });
    bindConge(body);
  }
  function ficheConge(c) {
    var e = E.emp(c.employe) || {}, s = soldeConges(e), cur = { 'En attente manager': 1, 'En attente RH': 2, 'Validé': 3, 'Refusé': c.historique && /RH/.test(JSON.stringify(c.historique)) ? 2 : 1 }[c.statut] || 1;
    var acts = [{ label: 'Fermer' }];
    if (c.statut === 'En attente manager') acts.push({ label: 'Refuser', cls: 'danger', onClick: function (cl) { cl(); congeAction(c, 'refus'); } }, { label: 'Valider (manager N+1)', cls: 'success', icon: 'check', onClick: function (cl) { cl(); congeAction(c, 'manager'); } });
    if (c.statut === 'En attente RH') acts.push({ label: 'Refuser', cls: 'danger', onClick: function (cl) { cl(); congeAction(c, 'refus'); } }, { label: 'Valider (RH)', cls: 'success', icon: 'check', onClick: function (cl) { cl(); congeAction(c, 'rh'); } });
    ui.modal({ title: c.type + ' · ' + E.empName(c.employe), sub: c.id + ' · déposée le ' + fmt.date(c.demande), body:
      ui.steps(['Demande', 'Manager (N+1)', 'RH', 'Validée'], cur, { rejected: c.statut === 'Refusé', finished: c.statut === 'Validé' }) +
      '<dl class="kv" style="margin-top:12px"><dt>Période</dt><dd>du ' + fmt.date(c.debut) + ' au ' + fmt.date(c.fin) + '</dd><dt>Durée</dt><dd><b>' + c.jours + ' jour(s) ouvré(s)</b></dd><dt>Motif</dt><dd>' + esc(c.motif || '—') + '</dd><dt>Poste</dt><dd>' + esc(e.poste || '') + ' · ' + esc(E.dirName(e.direction)) + '</dd>' + (c.type === 'Congé annuel' ? '<dt>Solde congés annuels</dt><dd>' + s.solde + ' jours (acquis ' + s.acquis + ' + report ' + s.report + ' − pris ' + s.pris + ')</dd>' : '') + '</dl>' +
      '<div class="timeline" style="margin-top:14px">' + (c.historique || []).map(function (h, i) { return '<div class="tl-item ' + (i === 0 && /attente/.test(c.statut) ? 'current' : c.statut === 'Refusé' && i === 0 ? 'rejected' : 'done') + '"><b>' + esc(h.action) + '</b><span>' + fmt.datetime(h.date) + ' · ' + esc(h.par) + '</span></div>'; }).join('') + '</div>', actions: acts });
  }

  function renderFormations(body) {
    var all = E.store.all('formations'), act = all.filter(function (f) { return f.statut !== 'Annulée'; });
    var budget = 95000000, engage = E.sum(act, 'cout'), realise = E.sum(all.filter(function (f) { return f.statut === 'Terminée'; }), 'cout');
    var part = {}; act.forEach(function (f) { f.participants.forEach(function (p) { part[p] = 1; }); });
    var html = '<div class="grid g4 rh-kpis">' + ui.kpi({ label: 'Budget formation 2026', value: fmt.short(budget), unit: 'FCFA', icon: 'wallet', tone: 'blue', foot: fmt.pct(engage / budget * 100) + ' engagé' }) +
      ui.kpi({ label: 'Réalisé', value: fmt.short(realise), unit: 'FCFA', icon: 'check', tone: 'green', foot: all.filter(function (f) { return f.statut === 'Terminée'; }).length + ' sessions terminées' }) +
      ui.kpi({ label: 'Sessions à venir', value: all.filter(function (f) { return f.statut === 'Planifiée' || f.statut === 'En cours'; }).length, icon: 'calendar', tone: 'violet', foot: all.filter(function (f) { return f.statut === 'En cours'; }).length + ' en cours' }) +
      ui.kpi({ label: 'Collaborateurs formés', value: Object.keys(part).length, icon: 'graduation', tone: 'orange', foot: fmt.pct(Object.keys(part).length / (emps().length || 1) * 100) + ' de l\'effectif' }) + '</div>';
    var byDom = DOMAINES_F.map(function (d) { return { l: d, v: E.sum(act.filter(function (f) { return f.domaine === d; }), 'cout') }; }).filter(function (x) { return x.v; });
    html += '<div class="grid g-2-1" style="margin-bottom:16px"><div class="card"><div class="card__h"><h3>Plan de formation 2026</h3><span class="sub">calendrier des sessions</span></div>' + ui.gantt({ rows: all.filter(function (f) { return f.statut !== 'Annulée'; }).map(function (f) { return { label: f.intitule, sub: f.organisme, start: f.debut, end: f.fin, progress: f.statut === 'Terminée' ? 100 : f.statut === 'En cours' ? 50 : 0, onClick: function () { ficheFormation(f); } }; }), from: '2026-01-01', to: '2026-12-31', unit: 'month', title: 'Session' }) + '</div>' +
      '<div class="card"><div class="card__h"><h3>Coût par domaine</h3></div><div class="card__b">' + ui.donut(byDom.map(function (x, i) { return { label: x.l, value: x.v, color: ui.PALETTE[i] }; }), { money: true, center: fmt.short(engage), sub: 'FCFA engagés' }) + '<div style="margin-top:14px">' + ui.progress(engage / budget * 100) + '<div class="small muted" style="margin-top:4px">Consommation du budget annuel</div></div></div></div></div>';
    var cols = [{ label: 'Formation', render: function (f) { return '<b>' + esc(f.intitule) + '</b><div class="small muted">' + esc(f.organisme) + ' · ' + esc(f.lieu) + '</div>'; }, csv: function (f) { return f.intitule; } }, { label: 'Domaine', key: 'domaine' }, { label: 'Dates', render: function (f) { return fmt.dateShort(f.debut) + ' → ' + fmt.dateShort(f.fin); }, csv: function (f) { return f.debut; } }, { label: 'Participants', num: true, render: function (f) { return f.participants.length; }, csv: function (f) { return f.participants.length; } }, { label: 'Coût', num: true, render: function (f) { return fmt.money(f.cout); }, csv: function (f) { return f.cout; } }, { label: 'Statut', render: function (f) { return ui.badge(f.statut, { 'Terminée': 'green', 'En cours': 'blue', 'Planifiée': 'violet', 'Annulée': 'grey' }[f.statut]); }, csv: function (f) { return f.statut; } }];
    var rows = all.slice().sort(function (a, b) { return a.debut.localeCompare(b.debut); });
    html += '<div class="card"><div class="card__h"><h3>Sessions</h3><span class="sub">' + all.length + '</span><button class="btn sm" style="margin-left:auto" id="fo-csv">' + icon('download') + 'Export CSV</button></div>' + ui.table(cols, rows, { onRow: ficheFormation, footer: function (r) { return '<td colspan="3">Total plan 2026 (hors annulées)</td><td class="num">' + E.sum(act, function (f) { return f.participants.length; }) + '</td><td class="num">' + fmt.money(engage) + '</td><td></td>'; } }) + '</div>';
    body.innerHTML = html;
    body.querySelector('#fo-csv').onclick = function () { ui.exportCSV('plan-formation-2026', cols.concat([{ label: 'Organisme', key: 'organisme' }]), rows); };
  }
  function ficheFormation(f) {
    var acts = [{ label: 'Fermer' }];
    if (f.statut === 'Planifiée' || f.statut === 'En cours') {
      acts.push({ label: 'Inscrire un participant', icon: 'plus', onClick: function (cl) { cl(); ui.formModal({ title: 'Inscrire un participant', sub: esc(f.intitule), fields: [{ name: 'p', label: 'Collaborateur', type: 'select', options: E.store.all('employes').filter(function (e) { return f.participants.indexOf(e.id) < 0; }).map(function (e) { return { v: e.id, l: e.nom + ' — ' + e.poste }; }) }], onSubmit: function (v) { f.participants.push(v.p); E.store.save(); E.log('Inscription formation', f.intitule + ' · ' + E.empName(v.p), 'personnel'); ui.toast(E.empName(v.p) + ' inscrit(e)'); setTimeout(function () { E.rerender(); ficheFormation(f); }); } }); } });
      acts.push({ label: 'Marquer comme réalisée', cls: 'success', icon: 'check', onClick: function (cl) {
        f.statut = 'Terminée'; var n = 0;
        if (f.habilitation) f.participants.forEach(function (p) { var h = E.store.all('habilitations').find(function (x) { return x.employe === p && x.type === f.habilitation; }); var exp = E.addDays(f.fin, Math.round((HAB[f.habilitation] || 3) * 365.25)); if (h) { h.obtention = f.fin; h.expiration = exp; h.organisme = f.organisme; } else E.store.all('habilitations').push({ id: 'HAB-' + (3000 + E.store.all('habilitations').length), employe: p, type: f.habilitation, organisme: f.organisme, obtention: f.fin, expiration: exp, numero: 'N° ' + (260000 + n) }); n++; });
        E.store.save(); E.log('Formation réalisée', f.intitule, 'personnel'); cl(); ui.toast('Session clôturée' + (n ? ' — ' + n + ' habilitation(s) mises à jour automatiquement' : '')); E.rerender();
      } });
    }
    ui.modal({ title: f.intitule, sub: f.id + ' · ' + esc(f.organisme), size: 'lg', body:
      '<div class="grid g2"><dl class="kv"><dt>Domaine</dt><dd>' + esc(f.domaine) + '</dd><dt>Dates</dt><dd>du ' + fmt.date(f.debut) + ' au ' + fmt.date(f.fin) + '</dd><dt>Lieu</dt><dd>' + esc(f.lieu) + '</dd></dl><dl class="kv"><dt>Coût</dt><dd><b>' + fmt.money(f.cout) + '</b></dd><dt>Coût / participant</dt><dd>' + fmt.money(f.cout / (f.participants.length || 1)) + '</dd><dt>Statut</dt><dd>' + ui.badge(f.statut) + '</dd></dl></div>' +
      (f.habilitation ? '<div class="alert tone-blue" style="margin-top:12px">' + icon('shield') + '<div>Formation qualifiante : à sa réalisation, l\'habilitation <b>' + esc(f.habilitation) + '</b> des participants est renouvelée automatiquement.</div></div>' : '') +
      '<h4 style="margin:16px 0 8px;font-size:14px">Participants (' + f.participants.length + ')</h4><div class="list">' + f.participants.map(function (p) { var e = E.emp(p) || {}; return '<a class="list__item" href="#/personnel/' + p + '" style="color:inherit;padding:8px 0">' + ui.avatar(e.nom || p, null, true) + '<div class="list__body"><b>' + esc(e.nom || p) + '</b><div class="small muted">' + esc(e.poste || '') + ' · ' + esc(E.dirName(e.direction)) + '</div></div></a>'; }).join('') + '</div>', actions: acts });
    document.querySelectorAll('.modal-back .list__item').forEach(function (a) { a.addEventListener('click', function () { var b = document.querySelector('.modal-back'); if (b) b.remove(); }); });
  }
  function nouvelleFormation() {
    ui.formModal({ title: 'Nouvelle session de formation', sub: 'Plan de formation 2026', okLabel: 'Planifier',
      fields: [{ name: 'intitule', label: 'Intitulé', required: true, full: true }, { name: 'organisme', label: 'Organisme', required: true }, { name: 'domaine', label: 'Domaine', type: 'select', options: DOMAINES_F },
        { name: 'debut', label: 'Début', type: 'date', required: true, value: E.addDays(today(), 21) }, { name: 'fin', label: 'Fin', type: 'date', required: true, value: E.addDays(today(), 23) },
        { name: 'cout', label: 'Coût total (FCFA)', type: 'money', required: true }, { name: 'lieu', label: 'Lieu', value: 'Salle de formation SOGARA' },
        { name: 'habilitation', label: 'Habilitation délivrée (facultatif)', type: 'select', options: [''].concat(Object.keys(HAB)), full: true },
        { name: 'participants', label: 'Participants : direction concernée', type: 'select', options: [{ v: '', l: 'Aucun pour l\'instant' }].concat(E.options('directions')), full: true }],
      onSubmit: function (v) {
        var f = { id: nextId('formations', 'FOR'), intitule: v.intitule, organisme: v.organisme, domaine: v.domaine, debut: v.debut, fin: v.fin, cout: +v.cout, lieu: v.lieu, habilitation: v.habilitation, statut: 'Planifiée', participants: v.participants ? E.store.all('employes').filter(function (e) { return e.direction === v.participants; }).map(function (e) { return e.id; }) : [] };
        E.store.add('formations', f); E.log('Formation planifiée', f.intitule, 'personnel'); ui.toast('Session planifiée (' + f.participants.length + ' participant(s))'); setTimeout(function () { E.go('personnel/formations'); E.rerender(); });
      } });
  }

  var habF = { etat: 'alerte', type: '', dir: '' };
  function renderHabilitations(body) {
    var all = E.store.all('habilitations');
    var exp = all.filter(function (h) { return habState(h).d < 0; }), soon = all.filter(function (h) { var d = habState(h).d; return d >= 0 && d <= 60; }), ok = all.length - exp.length - soon.length;
    var html = '<div class="grid g4 rh-kpis">' + ui.kpi({ label: 'Titres suivis', value: all.length, icon: 'shield', tone: 'blue', foot: Object.keys(HAB).length + ' types d\'habilitation' }) + ui.kpi({ label: 'Valides', value: ok, icon: 'check', tone: 'green', foot: fmt.pct(ok / (all.length || 1) * 100) + ' de conformité' }) +
      ui.kpi({ label: 'À renouveler (≤ 60 j)', value: soon.length, icon: 'clock', tone: 'orange', foot: 'Recyclages à planifier' }) + ui.kpi({ label: 'Expirées', value: exp.length, icon: 'alert', tone: 'red', foot: exp.length ? 'Interdiction d\'intervention' : 'Aucune' }) + '</div>';
    if (exp.length || soon.length) html += '<div class="alert tone-orange" style="margin-bottom:16px">' + icon('alert') + '<div><b>' + (exp.length + soon.length) + ' habilitation(s) en alerte.</b> Le système bloque la délivrance d\'un permis de travail à un intervenant dont l\'habilitation requise est expirée (lien avec le module HSE).</div></div>';
    var types = Object.keys(HAB).map(function (t) { var hs = all.filter(function (h) { return h.type === t; }); return { t: t, n: hs.length, bad: hs.filter(function (h) { return habState(h).d <= 60; }).length }; }).filter(function (x) { return x.n; });
    var rows = all.filter(function (h) { var s = habState(h), e = E.emp(h.employe) || {}; return (habF.etat === 'toutes' || (habF.etat === 'alerte' ? s.d <= 60 : habF.etat === 'expirees' ? s.d < 0 : s.d > 60)) && (!habF.type || h.type === habF.type) && (!habF.dir || e.direction === habF.dir); }).sort(function (a, b) { return a.expiration.localeCompare(b.expiration); });
    var cols = [{ label: 'Employé', render: function (h) { var e = E.emp(h.employe) || {}; return '<b>' + esc(e.nom || h.employe) + '</b><div class="small muted">' + esc(e.poste || '') + '</div>'; }, csv: function (h) { return E.empName(h.employe); } }, { label: 'Habilitation', key: 'type' }, { label: 'Organisme', key: 'organisme' }, { label: 'Obtenue le', render: function (h) { return fmt.dateShort(h.obtention); }, csv: function (h) { return h.obtention; } }, { label: 'Expire le', render: function (h) { return '<b>' + fmt.date(h.expiration) + '</b>'; }, csv: function (h) { return h.expiration; } }, { label: 'État', render: function (h) { var s = habState(h); return ui.badge(s.d < 0 ? 'Expirée depuis ' + (-s.d) + ' j' : s.l, s.t); }, csv: function (h) { return habState(h).l; } }, { label: '', render: function (h) { return habState(h).d <= 60 ? '<button class="btn sm" data-ren="' + h.id + '">' + icon('refresh') + 'Renouveler</button>' : ''; }, csv: function () { return ''; } }];
    html += '<div class="grid g-1-2"><div class="card"><div class="card__h"><h3>Couverture par type</h3></div><div class="card__b">' + hbars(types.map(function (x) { return { l: x.t, v: x.n, c: x.bad ? 'linear-gradient(90deg,#ea580c,#f59e0b)' : '' }; }), function (v) { return v + ' titres'; }) + '<div class="small muted" style="margin-top:10px">En orange : au moins un titre à renouveler.</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Échéancier</h3><div class="chips" style="margin-left:auto">' + [['alerte', 'En alerte (≤ 60 j)'], ['expirees', 'Expirées'], ['valides', 'Valides'], ['toutes', 'Toutes']].map(function (k) { return '<button class="chip' + (habF.etat === k[0] ? ' is-active' : '') + '" data-hf="' + k[0] + '">' + k[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="card__b" style="padding-bottom:0"><div class="filters"><select class="select" id="hb-type"><option value="">Tous les types</option>' + Object.keys(HAB).map(function (t) { return '<option' + (habF.type === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select><select class="select" id="hb-dir"><option value="">Toutes les directions</option>' + E.options('directions').map(function (o) { return '<option value="' + o.v + '"' + (habF.dir === o.v ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select><span class="spacer"></span><button class="btn sm" id="hb-csv">' + icon('download') + 'CSV</button></div></div>' +
      ui.table(cols, rows, { empty: 'Aucune habilitation dans cette sélection' }) + '</div></div>';
    body.innerHTML = html;
    body.querySelectorAll('[data-hf]').forEach(function (b) { b.onclick = function () { habF.etat = b.dataset.hf; renderHabilitations(body); }; });
    body.querySelector('#hb-type').onchange = function (e) { habF.type = e.target.value; renderHabilitations(body); };
    body.querySelector('#hb-dir').onchange = function (e) { habF.dir = e.target.value; renderHabilitations(body); };
    body.querySelector('#hb-csv').onclick = function () { ui.exportCSV('habilitations-sogara', cols.slice(0, 6), rows); };
    body.querySelectorAll('[data-ren]').forEach(function (b) { b.onclick = function () { renouveler(E.store.get('habilitations', b.dataset.ren)); }; });
  }

  /* ---- fiche employé */
  function renderFiche(view, id) {
    var e = E.emp(id);
    if (!e) { view.innerHTML = '<a class="rh-back" href="#/personnel/annuaire">' + icon('back') + 'Annuaire</a><div class="card empty">Employé introuvable.</div>'; return; }
    var habs = E.store.all('habilitations').filter(function (h) { return h.employe === id; }).sort(function (a, b) { return a.expiration.localeCompare(b.expiration); });
    var forms = E.store.all('formations').filter(function (f) { return f.participants.indexOf(id) >= 0; }).sort(function (a, b) { return b.debut.localeCompare(a.debut); });
    var cgs = E.store.all('conges').filter(function (c) { return c.employe === id; }).sort(function (a, b) { return b.debut.localeCompare(a.debut); });
    var s = soldeConges(e), alertH = habs.filter(function (h) { return habState(h).d <= 60; });
    var cand = e.origine ? E.store.get('candidatures', e.origine) : null;
    var essai = e.statut === 'Période d\'essai';
    var docs = [['Contrat de travail', 'Contrat_' + e.id + '.pdf', e.entree], ['Fiche de poste — ' + e.poste, 'Fiche_poste_' + e.id + '.pdf', e.entree], ['Aptitude médicale', 'Aptitude_' + e.id + '_2026.pdf', E.addDays(today(), -(hnum(e.id) % 200))], ['Pièce d\'identité', 'CNI_' + e.id + '.pdf', e.entree], ['Attestation CNSS', 'CNSS_' + e.id + '.pdf', e.entree]];
    if (cand) docs.push(['Lettre de proposition', 'Proposition_' + cand.id + '.pdf', cand.dateEmbauche]);
    view.innerHTML = '<a class="rh-back" href="#/personnel/annuaire">' + icon('back') + 'Annuaire</a>' +
      '<div class="card" style="margin-bottom:16px"><div class="card__b"><div class="rh-hero">' + ui.avatar(e.nom) + '<div style="flex:1;min-width:0"><h2>' + esc(e.nom) + '</h2><div class="rh-hero__meta"><span class="mono">' + e.id + '</span><span>' + icon('helmet') + esc(e.poste) + '</span><span>' + icon('factory') + esc(E.dirName(e.direction)) + '</span><span>' + icon('calendar') + 'Entré(e) le ' + fmt.date(e.entree) + ' · ' + ancTxt(e) + '</span></div></div><div class="rh-hero__side">' + ui.badge(e.statut, e.statut === 'Actif' ? 'green' : 'violet') + (alertH.length ? ui.badge(alertH.length + ' habilitation(s) en alerte', 'orange') : '') + '</div></div>' +
      (essai ? '<div class="alert tone-violet" style="margin-top:14px">' + icon('userplus') + '<div><b>Période d\'essai jusqu\'au ' + fmt.date(E.addDays(e.entree, 90)) + '.</b>' + (cand ? ' Recruté(e) via le module Recrutement (<a href="#/recrutement/candidat/' + cand.id + '">dossier ' + cand.id + '</a>).' : '') + '</div></div>' : '') +
      '<div class="rh-actions" style="margin-top:14px"><button class="btn" data-x="edit">' + icon('edit') + 'Modifier</button><button class="btn" data-x="conge">' + icon('calendar') + 'Demande d\'absence</button><button class="btn" data-x="hab">' + icon('shield') + 'Ajouter une habilitation</button><button class="btn" data-x="att">' + icon('print') + 'Attestation de travail</button>' + (essai ? '<button class="btn success" data-x="confirm">' + icon('check') + 'Confirmer l\'embauche</button>' : '') + '</div></div></div>' +
      '<div class="grid g-2-1"><div class="stack">' +
      '<div class="card"><div class="card__h"><h3>Habilitations & certifications</h3><span class="sub">' + habs.length + '</span></div>' + ui.table([{ label: 'Habilitation', key: 'type' }, { label: 'Organisme', key: 'organisme' }, { label: 'Expire le', render: function (h) { return fmt.date(h.expiration); } }, { label: 'État', render: function (h) { var st = habState(h); return ui.badge(st.l, st.t); } }, { label: '', render: function (h) { return habState(h).d <= 60 ? '<button class="btn sm" data-ren="' + h.id + '">Renouveler</button>' : ''; } }], habs, { empty: 'Aucune habilitation requise pour ce poste' }) + '</div>' +
      '<div class="card"><div class="card__h"><h3>Formations</h3><span class="sub">' + forms.length + '</span></div>' + ui.table([{ label: 'Formation', render: function (f) { return '<b>' + esc(f.intitule) + '</b><div class="small muted">' + esc(f.organisme) + '</div>'; } }, { label: 'Dates', render: function (f) { return fmt.dateShort(f.debut); } }, { label: 'Statut', render: function (f) { return ui.badge(f.statut, { 'Terminée': 'green', 'En cours': 'blue', 'Planifiée': 'violet', 'Annulée': 'grey' }[f.statut]); } }], forms, { empty: 'Aucune formation en 2026', onRow: ficheFormation }) + '</div>' +
      '<div class="card"><div class="card__h"><h3>Congés & absences</h3><span class="sub">solde : <b>' + s.solde + ' j</b></span></div><div class="card__b" style="padding-bottom:6px"><div class="grid g4" style="gap:10px">' + [['Acquis 2026', s.acquis], ['Report 2025', s.report], ['Pris', s.pris], ['Solde', s.solde]].map(function (x) { return '<div style="background:var(--bg);border-radius:10px;padding:10px;text-align:center"><div class="small muted">' + x[0] + '</div><b style="font-size:18px;font-family:Sora">' + x[1] + '</b></div>'; }).join('') + '</div></div>' +
      ui.table([{ label: 'Type', key: 'type' }, { label: 'Période', render: function (c) { return fmt.dateShort(c.debut) + ' → ' + fmt.dateShort(c.fin); } }, { label: 'Jours', key: 'jours', num: true }, { label: 'Statut', render: function (c) { return ui.badge(c.statut, ST_CONGE[c.statut]); } }], cgs, { empty: 'Aucune demande', onRow: ficheConge }) + '</div>' +
      '</div><div class="stack"><div class="card"><div class="card__h"><h3>Identité & contrat</h3></div><div class="card__b"><dl class="kv"><dt>Né(e) le</dt><dd>' + fmt.date(e.naissance) + ' (' + age(e.naissance) + ' ans)</dd><dt>Sexe</dt><dd>' + (e.sexe === 'F' ? 'Féminin' : 'Masculin') + '</dd><dt>Situation</dt><dd>' + esc(e.situation || '—') + ', ' + (e.enfants || 0) + ' enfant(s)</dd><dt>Adresse</dt><dd>' + esc(e.adresse || '—') + '</dd><dt>Téléphone</dt><dd>' + esc(e.tel || '—') + '</dd><dt>Courriel</dt><dd>' + esc(e.email || '—') + '</dd><dt>N° CNSS</dt><dd class="mono">' + esc(e.cnss || '—') + '</dd><dt>Contrat</dt><dd>' + esc(e.contrat) + '</dd><dt>Catégorie</dt><dd>' + esc(e.categorie) + '</dd><dt>Régime</dt><dd>' + (e.quart ? 'Personnel posté (3x8)' : 'Horaires de journée') + '</dd></dl></div></div>' +
      '<div class="card"><div class="card__h"><h3>Rémunération</h3>' + icon('lock', '').replace('<svg', '<svg style="width:15px;margin-left:auto;color:var(--ink-3)"') + '</div><div class="card__b">' + (canSalary() ? '<dl class="kv"><dt>Salaire de base</dt><dd><b>' + fmt.money(e.salaire) + '</b> / mois</dd><dt>Prime d\'ancienneté</dt><dd>' + (anc(e) >= 2 ? fmt.pct(Math.min(30, Math.floor(anc(e)) * 2)) : 'Non éligible (< 2 ans)') + '</dd><dt>Prime de quart</dt><dd>' + (e.quart ? '10 % du salaire de base' : '—') + '</dd></dl><a class="btn sm" style="margin-top:12px" href="#/paie/bulletins">' + icon('wallet') + 'Voir les bulletins</a>' : '<div class="muted small">Information confidentielle — visible par la RH et la Direction uniquement.</div>') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Documents</h3></div><div class="list">' + docs.map(function (d) { return '<div class="list__item"><div class="list__icon tone-red" style="font-size:9px;font-weight:800">PDF</div><div class="list__body"><b>' + esc(d[0]) + '</b><div class="small muted">' + esc(d[1]) + ' · ' + fmt.dateShort(d[2]) + '</div></div></div>'; }).join('') + '</div></div></div></div>';
    var map = { edit: function () { modifierEmp(e); }, conge: function () { nouveauConge(e.id); }, hab: function () { nouvelleHab(e.id); }, att: function () { ui.modal({ title: 'Attestation de travail', sub: esc(e.nom), size: 'lg', body: '<div class="rh-doc-wrap">' + attestationHTML(e) + '</div>', actions: [{ label: 'Fermer' }, { label: 'Imprimer / PDF', cls: 'primary', icon: 'print', onClick: function () { printDoc('Attestation — ' + e.nom, attestationHTML(e)); E.log('Attestation de travail', e.nom, 'personnel'); } }] }); },
      confirm: function () { ui.confirm('Confirmer l\'embauche', 'Mettre fin à la période d\'essai de <b>' + esc(e.nom) + '</b> et confirmer son contrat ?', 'Confirmer', function () { e.statut = 'Actif'; E.store.save(); E.log('Embauche confirmée', e.nom, 'personnel'); E.notify('Embauche confirmée', e.nom + ' — fin de période d\'essai', '#/personnel/' + e.id, 'green'); ui.toast('Contrat confirmé'); E.rerender(); }, 'success'); } };
    view.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { map[b.dataset.x](); }; });
    view.querySelectorAll('[data-ren]').forEach(function (b) { b.onclick = function () { renouveler(E.store.get('habilitations', b.dataset.ren)); }; });
  }

  E.register({
    id: 'personnel', label: 'Personnel', title: 'Personnel & compétences', icon: 'users', group: 'Management', roles: ['rh'],
    seed: function () { enrich(); return { conges: seedConges(), formations: seedFormations(), habilitations: seedHabilitations() }; },
    init: function () { enrich(); },
    render: function (view, p) {
      enrich();
      var tab = p[0] || 'effectifs';
      if (/^MAT-/.test(tab)) return renderFiche(view, tab);
      if (['effectifs', 'annuaire', 'conges', 'formations', 'habilitations'].indexOf(tab) < 0) tab = 'effectifs';
      var body = header(view, tab);
      ({ effectifs: renderEffectifs, annuaire: renderAnnuaire, conges: renderConges, formations: renderFormations, habilitations: renderHabilitations })[tab](body);
    },
    summary: function () {
      var a = E.store.all('habilitations').filter(function (h) { return habState(h).d <= 60; }).length;
      return [{ label: 'Effectif', value: String(emps().length), icon: 'users', tone: 'blue', foot: absentToday().length + ' absent(s) aujourd\'hui' + (a ? ' · ' + a + ' habilitation(s) en alerte' : ''), href: '#/personnel' }];
    },
    pending: function (u) {
      if (u.profile !== 'rh' && u.profile !== 'admin') return [];
      var out = E.store.all('conges').filter(function (c) { return c.statut === 'En attente RH' || (u.profile === 'rh' && c.statut === 'En attente manager'); }).map(function (c) { return { title: c.type + ' · ' + E.empName(c.employe), sub: c.jours + ' j du ' + fmt.dateShort(c.debut) + ' au ' + fmt.dateShort(c.fin) + ' · ' + c.statut.toLowerCase(), date: c.demande, href: '#/personnel/conges', tone: 'orange' }; });
      var exp = E.store.all('habilitations').filter(function (h) { return habState(h).d < 0; });
      if (exp.length && u.profile === 'rh') out.push({ title: exp.length + ' habilitation(s) expirée(s)', sub: 'Recyclages à planifier', date: today(), href: '#/personnel/habilitations', tone: 'red' });
      return out;
    },
    search: function (q) {
      return E.store.all('formations').filter(function (f) { return E.norm(f.intitule + ' ' + f.organisme).indexOf(q) >= 0; }).map(function (f) { return { title: f.intitule, sub: 'Formation · ' + fmt.date(f.debut), href: '#/personnel/formations' }; });
    },
    badge: function () { return E.store.all('conges').filter(function (c) { return c.statut === 'En attente RH'; }).length + E.store.all('habilitations').filter(function (h) { return habState(h).d < 0; }).length; }
  });
})();
