/* SOGARA · Espace de gestion — module Paie & rémunérations
   Simulation de paie mensuelle : paramètres (barème de simulation), éléments variables,
   bulletins, circuit Préparation → Contrôle RH → Validation DAF → Virements → Clôture,
   livre de paie et états déclaratifs CNSS / CNAMGS / IRPP. */
(function () {
  'use strict';
  var E = window.ERP; if (!E) return;
  var esc = E.esc, fmt = E.fmt, ui = E.ui, icon = E.icon;
  if (!document.getElementById('rh-css')) { var l = document.createElement('link'); l.id = 'rh-css'; l.rel = 'stylesheet'; l.href = 'css/rh.css'; document.head.appendChild(l); }

  var ETAPES = ['Préparation', 'Contrôle RH', 'Validation DAF', 'Virements', 'Clôturé'];
  var ETAPE_SUB = ['Saisie des éléments variables', 'Vérification des bulletins', 'Approbation de la masse salariale', 'Ordres de virement émis', 'Période archivée'];
  var VAR_TYPES = [
    { v: 'HS125', l: 'Heures supplémentaires 125 %', unit: 'h' }, { v: 'HS150', l: 'Heures supplémentaires 150 % (nuit, dimanche)', unit: 'h' },
    { v: 'PRIME', l: 'Prime exceptionnelle', unit: 'FCFA' }, { v: 'REND', l: 'Prime de rendement', unit: 'FCFA' },
    { v: 'ABS', l: 'Absence non rémunérée', unit: 'j' }, { v: 'AVANCE', l: 'Avance sur salaire (retenue)', unit: 'FCFA' }
  ];
  var DEF = {
    id: 'PARAMS', cnssSal: 2.5, cnssPat: 20.1, cnssPlafond: 1500000, cnamgsSal: 2, cnamgsPat: 4.1, abattement: 20,
    ancTaux: 2, ancSeuil: 2, ancPlafond: 30, quartTaux: 10, transport: 40000, heuresMois: 173.33,
    logement: { 'Employé': 60000, 'Agent de maîtrise': 120000, 'Cadre': 250000, 'Cadre sup.': 400000 },
    bareme: [[150000, 0], [300000, 5], [600000, 10], [1200000, 20], [2400000, 30], [null, 35]]
  };
  var FEM = /(Aïcha|Clarisse|Estelle|Sandrine|Nadège|Carine|Laure|Diane|Irène|Béatrice|Sylvie|Ruth|Linda)$/;

  function user() { return E.session.user() || {}; }
  function prof() { return user().profile; }
  function isRH() { return prof() === 'rh' || prof() === 'admin'; }
  function isDAF() { return prof() === 'finance' || prof() === 'admin'; }
  function P() { var p = E.store.get('paie_params', 'PARAMS'); if (!p) { p = E.clone(DEF); E.store.all('paie_params').push(p); E.store.save(); } return p; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function hnum(id) { return +String(id).replace(/\D/g, '') || 0; }
  function moisLabel(m) { return fmt.month(m + '-01'); }
  function moisCourt(m) { var d = E.parseDate(m + '-01'); return E.MOIS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2); }
  function finMois(m) { var d = E.parseDate(m + '-01'); return E.iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
  function moisSuivant(m) { var d = E.parseDate(m + '-01'); d.setMonth(d.getMonth() + 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function periodes() { return E.store.all('paie_periodes').slice().sort(function (a, b) { return a.mois.localeCompare(b.mois); }); }
  function courante() { var ps = periodes(); return ps.filter(function (p) { return p.etape < 4; })[0] || ps[ps.length - 1]; }
  function bulletins(m) { return E.store.all('paies').filter(function (b) { return b.mois === m; }); }
  function moisAvecBulletins() { var o = {}; E.store.all('paies').forEach(function (b) { o[b.mois] = 1; }); return Object.keys(o).sort().reverse(); }
  function hist(o, a) { o.historique = o.historique || []; o.historique.unshift({ date: new Date().toISOString(), par: user().name || 'Système', action: a }); }
  function printDoc(title, html) {
    var w = window.open('', '_blank'); if (!w) { ui.toast('Autorisez les fenêtres pop-up pour imprimer.', 'err'); return; }
    var base = location.href.replace(/#.*$/, '').replace(/[^\/]*$/, '');
    w.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + esc(title) + '</title><base href="' + base + '"><link rel="stylesheet" href="css/erp.css"><link rel="stylesheet" href="css/rh.css"></head><body class="rh-print">' + html + '<script>window.onload=function(){setTimeout(function(){window.print()},400)}<\/script></body></html>');
    w.document.close();
  }
  /* même enrichissement que le module Personnel (idempotent) si celui-ci n'est pas chargé */
  function enrich() {
    var ch = false;
    E.store.all('employes').forEach(function (e) {
      if (e.situation != null && e.quart != null) return;
      var h = hnum(e.id);
      if (e.situation == null) { e.situation = ['Marié(e)', 'Célibataire', 'Marié(e)', 'Marié(e)', 'Célibataire', 'Divorcé(e)'][h % 6]; e.enfants = e.situation === 'Célibataire' ? h % 2 : h % 5; }
      if (e.quart == null) e.quart = e.direction === 'PROD' && /quart|opérat/i.test(e.poste || '');
      if (!e.cnss) e.cnss = '2' + String(10000000 + h * 7919).slice(-8);
      if (!e.sexe) e.sexe = FEM.test(e.nom) ? 'F' : 'M';
      ch = true;
    });
    if (ch) E.store.save();
  }

  /* ------------------------------------------------------------ moteur de calcul */
  function parts(e) { var p = 1 + (/Mari/.test(e.situation || '') ? 1 : 0) + 0.5 * Math.min(+e.enfants || 0, 6); return Math.min(p, 5); }
  function irppCalc(base, nb, prm) {
    var q = base / nb, tax = 0, prev = 0;
    prm.bareme.forEach(function (t) { var top = t[0] == null ? Infinity : +t[0]; if (q > prev) tax += (Math.min(q, top) - prev) * (+t[1]) / 100; prev = top; });
    return Math.round(tax * nb);
  }
  function calcul(e, m, vars, prm) {
    prm = prm || P();
    var fin = finMois(m), debut = m + '-01';
    var prorata = e.entree > debut ? Math.max(0, (E.daysBetween(e.entree, fin) + 1) / 30) : 1; prorata = Math.min(1, prorata);
    var years = Math.max(0, Math.floor(E.daysBetween(e.entree, fin) / 365.25));
    var base = Math.round(e.salaire * prorata), L = [];
    var gain = function (code, lib, b, taux, montant, opt) { opt = opt || {}; montant = Math.round(montant); if (!montant) return; L.push({ code: code, lib: lib, base: b, taux: taux, gain: montant, ret: 0, pat: 0, nonSoumis: !!opt.ns }); };
    gain('100', 'Salaire de base' + (prorata < 1 ? ' (prorata ' + Math.round(prorata * 30) + ' j)' : ''), e.salaire, prorata < 1 ? fmt.num(prorata * 100, 1) + ' %' : '', base);
    var ancT = years >= prm.ancSeuil ? Math.min(prm.ancPlafond, years * prm.ancTaux) : 0;
    gain('110', 'Prime d\'ancienneté (' + years + ' ans)', base, ancT ? fmt.num(ancT, 0) + ' %' : '', base * ancT / 100);
    if (e.quart) gain('120', 'Prime de quart (personnel posté)', base, fmt.num(prm.quartTaux, 0) + ' %', base * prm.quartTaux / 100);
    var th = e.salaire / prm.heuresMois;
    var retNet = [];
    vars.forEach(function (v) {
      var q = +v.quantite || 0;
      if (v.type === 'HS125') gain('130', 'Heures supplémentaires 125 %', q + ' h', fmt.num(th * 1.25, 0), th * 1.25 * q);
      else if (v.type === 'HS150') gain('131', 'Heures supplémentaires 150 %', q + ' h', fmt.num(th * 1.5, 0), th * 1.5 * q);
      else if (v.type === 'PRIME') gain('140', v.libelle || 'Prime exceptionnelle', '', '', q);
      else if (v.type === 'REND') gain('141', v.libelle || 'Prime de rendement', '', '', q);
      else if (v.type === 'ABS') L.push({ code: '150', lib: 'Absence non rémunérée', base: q + ' j', taux: fmt.num(e.salaire / 30, 0), gain: -Math.round(e.salaire / 30 * q), ret: 0, pat: 0 });
      else if (v.type === 'AVANCE') retNet.push({ code: '410', lib: v.libelle || 'Remboursement avance sur salaire', base: '', taux: '', gain: 0, ret: Math.round(q), pat: 0 });
    });
    gain('160', 'Indemnité de logement', '', '', (prm.logement[e.categorie] || 0) * prorata);
    gain('170', 'Prime de transport (non soumise)', '', '', prm.transport * prorata, { ns: true });
    var brut = E.sum(L, 'gain');
    var soumis = brut - E.sum(L.filter(function (x) { return x.nonSoumis; }), 'gain');
    var cnssB = Math.min(soumis, prm.cnssPlafond);
    var cnssS = Math.round(cnssB * prm.cnssSal / 100), cnssP = Math.round(cnssB * prm.cnssPat / 100);
    var camS = Math.round(soumis * prm.cnamgsSal / 100), camP = Math.round(soumis * prm.cnamgsPat / 100);
    var imposable = soumis - cnssS - camS, nb = parts(e);
    var baseIr = imposable * (1 - prm.abattement / 100), ir = irppCalc(baseIr, nb, prm);
    L.push({ code: '300', lib: 'CNSS — vieillesse, AT, prestations familiales', base: cnssB, taux: fmt.num(prm.cnssSal, 1) + ' %', gain: 0, ret: cnssS, pat: cnssP, tauxP: fmt.num(prm.cnssPat, 1) + ' %' });
    L.push({ code: '310', lib: 'CNAMGS — assurance maladie', base: soumis, taux: fmt.num(prm.cnamgsSal, 1) + ' %', gain: 0, ret: camS, pat: camP, tauxP: fmt.num(prm.cnamgsPat, 1) + ' %' });
    L.push({ code: '400', lib: 'IRPP (' + fmt.num(nb, 1) + ' part' + (nb > 1 ? 's' : '') + ', abattement ' + prm.abattement + ' %)', base: Math.round(baseIr), taux: '', gain: 0, ret: ir, pat: 0 });
    L = L.concat(retNet);
    var avances = E.sum(retNet, 'ret');
    var hs = E.sum(L.filter(function (x) { return x.code === '130' || x.code === '131'; }), 'gain');
    return {
      id: 'BUL-' + m + '-' + e.id, mois: m, employe: e.id, nom: e.nom, poste: e.poste, direction: e.direction, categorie: e.categorie, entree: e.entree, cnss: e.cnss, parts: nb, salaireBase: e.salaire,
      lignes: L, brut: brut, soumis: soumis, cnssBase: cnssB, cnssSal: cnssS, cnssPat: cnssP, cnamgsSal: camS, cnamgsPat: camP, cotSal: cnssS + camS, cotPat: cnssP + camP,
      imposable: imposable, irpp: ir, avances: avances, hs: hs, net: brut - cnssS - camS - ir - avances, cout: brut + cnssP + camP
    };
  }
  function eligibles(m) { var fin = finMois(m); return E.store.all('employes').filter(function (e) { return e.entree <= fin && e.statut !== 'Sorti' && e.salaire; }); }
  function generer(m) {
    var prm = P(), vars = E.store.all('paie_variables').filter(function (v) { return v.mois === m; });
    var keep = E.store.all('paies').filter(function (b) { return b.mois !== m; });
    var out = eligibles(m).map(function (e) { return calcul(e, m, vars.filter(function (v) { return v.employe === e.id; }), prm); });
    E.store.set('paies', keep.concat(out));
    var p = E.store.get('paie_periodes', m); if (p) { p.totaux = totaux(out); p.calcule = new Date().toISOString(); E.store.save(); }
    return out;
  }
  function totaux(bs) { return { brut: E.sum(bs, 'brut'), net: E.sum(bs, 'net'), cotSal: E.sum(bs, 'cotSal'), cotPat: E.sum(bs, 'cotPat'), irpp: E.sum(bs, 'irpp'), cout: E.sum(bs, 'cout'), hs: E.sum(bs, 'hs'), effectif: bs.length }; }

  /* ------------------------------------------------------------ données d'exemple */
  function seedVariables() {
    var by = function (n) { var e = E.store.all('employes').find(function (x) { return x.nom.indexOf(n) === 0; }); return e ? e.id : null; };
    var V = [
      ['2026-08', 'Ekomi', 'HS150', 12, 'Arrêt U300 — quart de nuit'], ['2026-08', 'Mintsa', 'HS125', 16, ''], ['2026-08', 'Engonga', 'HS125', 10, ''], ['2026-08', 'Pambou', 'ABS', 2, ''],
      ['2026-09', 'Ekomi', 'HS150', 18, 'Démarrage U300 — nuits et dimanche'], ['2026-09', 'Mba Nziengui', 'HS150', 14, 'Démarrage U300'], ['2026-09', 'Mintsa', 'HS125', 20, 'Remplacement congé'],
      ['2026-09', 'Assoumou', 'HS125', 12, ''], ['2026-09', 'Engonga', 'HS125', 15, 'Étalonnages arrêt U300'], ['2026-09', 'Mapangou', 'HS150', 8, 'Intervention pompe P-101 (dimanche)'],
      ['2026-09', 'Boussougou', 'PRIME', 250000, 'Prime exceptionnelle redémarrage U300'], ['2026-09', 'Owono', 'REND', 150000, 'Prime de rendement inspection'], ['2026-09', 'Makaya', 'ABS', 2, 'Absence injustifiée'],
      ['2026-09', 'Nkoghe', 'AVANCE', 100000, 'Remboursement avance (2/5)'], ['2026-09', 'Bivigou', 'HS125', 9, 'Chargement navire']
    ];
    return V.map(function (v, i) { return { id: 'VAR-' + (501 + i), mois: v[0], employe: by(v[1]), type: v[2], quantite: v[3], libelle: v[4], saisi: v[0] + '-2' + (i % 8) , par: 'Ngoua Béatrice' }; }).filter(function (v) { return v.employe; });
  }
  function initPaie() {
    enrich(); P();
    if (E.store.all('paie_periodes').length) return;
    var aout = generer2('2026-08'), sept = generer2('2026-09');
    var ta = totaux(aout), periods = [];
    var start = E.parseDate('2025-10-01');
    for (var k = 0; k < 10; k++) {
      var d = new Date(start.getFullYear(), start.getMonth() + k, 1), m = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      var f = (0.955 + k * 0.0045) * (d.getMonth() === 11 ? 1.38 : 1) * (1 + ((k * 7) % 5 - 2) * 0.004), fe = d.getMonth() === 11 ? 1 : f;
      var t = {}; Object.keys(ta).forEach(function (x) { t[x] = x === 'effectif' ? ta.effectif - (k < 6 ? 1 : 0) - (k < 3 ? 1 : 0) : Math.round(ta[x] * (x === 'effectif' ? fe : f)); });
      periods.push({ id: m, mois: m, etape: 4, totaux: t, historique: [{ date: E.addDays(finMois(m), 2) + 'T10:00:00', par: 'Clarisse Nzé', action: 'Période clôturée' + (d.getMonth() === 11 ? ' (dont gratification de fin d\'année)' : '') }] });
    }
    periods.push({ id: '2026-08', mois: '2026-08', etape: 4, totaux: ta, historique: [
      { date: '2026-09-02T11:20:00', par: 'Clarisse Nzé', action: 'Période clôturée — virements exécutés' }, { date: '2026-08-28T16:05:00', par: 'Clarisse Nzé', action: 'Virements émis (' + aout.length + ' bénéficiaires)' },
      { date: '2026-08-27T15:30:00', par: 'Clarisse Nzé', action: 'Masse salariale validée par la DAF' }, { date: '2026-08-26T10:10:00', par: 'Mboumba Aïcha', action: 'Contrôle RH validé' }, { date: '2026-08-21T09:00:00', par: 'Ngoua Béatrice', action: 'Éléments variables saisis' }] });
    periods.push({ id: '2026-09', mois: '2026-09', etape: 1, totaux: totaux(sept), historique: [{ date: '2026-09-25T17:40:00', par: 'Ngoua Béatrice', action: 'Préparation terminée — soumise au contrôle RH' }, { date: '2026-09-21T09:00:00', par: 'Ngoua Béatrice', action: 'Éléments variables saisis' }] });
    E.store.set('paie_periodes', periods);
    E.store.all('paies').forEach(function (b) { if (b.mois === '2026-08') b.paye = true; }); E.store.save();
  }
  function generer2(m) { return generer(m); }

  /* ------------------------------------------------------------ workflow */
  function avancer(p) {
    var e = p.etape;
    if ((e === 0 || e === 1) && !isRH()) return ui.toast('Étape réservée aux Ressources humaines.', 'err');
    if ((e === 2 || e === 3) && !isDAF()) return ui.toast('Étape réservée à la Direction administrative et financière.', 'err');
    var txt = ['Préparation terminée — soumise au contrôle RH', 'Contrôle RH validé — transmis à la DAF', 'Masse salariale validée par la DAF', 'Virements émis — période clôturée'][e];
    var go = function () {
      if (e <= 1) generer(p.mois);
      p.etape = e + 1; hist(p, txt);
      if (p.etape === 4) bulletins(p.mois).forEach(function (b) { b.paye = true; });
      E.store.save(); E.log('Paie ' + moisLabel(p.mois), txt, 'paie');
      if (p.etape === 2) E.notify('Paie de ' + moisLabel(p.mois) + ' à valider', 'Masse salariale ' + fmt.short(p.totaux.brut) + ' FCFA brut — validation DAF', '#/paie/periode', 'orange');
      if (p.etape === 3) E.notify('Paie validée par la DAF', moisLabel(p.mois) + ' — virements à émettre', '#/paie/periode', 'green');
      if (p.etape === 4) E.notify('Salaires virés', moisLabel(p.mois) + ' — ' + p.totaux.effectif + ' bénéficiaires, ' + fmt.short(p.totaux.net) + ' FCFA', '#/paie', 'green');
      ui.toast(txt); E.rerender();
    };
    if (e === 3) return ordreVirement(p, go);
    ui.confirm(ETAPES[e + 1], txt.replace(/ —.*/, '') + ' pour la paie de <b>' + moisLabel(p.mois) + '</b> ?<br><span class="small muted">Masse salariale brute : ' + fmt.money(p.totaux.brut) + ' · net à payer : ' + fmt.money(p.totaux.net) + '</span>', 'Confirmer', go, 'success');
  }
  function renvoyer(p) {
    ui.formModal({ title: 'Renvoyer en préparation', sub: 'Paie de ' + moisLabel(p.mois), okLabel: 'Renvoyer', fields: [{ name: 'motif', label: 'Motif / anomalies relevées', type: 'textarea', required: true }], onSubmit: function (v) {
      p.etape = 0; hist(p, 'Renvoyée en préparation — ' + v.motif); E.store.save(); E.log('Paie renvoyée', v.motif, 'paie'); E.notify('Paie renvoyée en préparation', v.motif, '#/paie/periode', 'red'); ui.toast('Période renvoyée en préparation'); setTimeout(E.rerender);
    } });
  }
  function ouvrirSuivante(p) {
    var m = moisSuivant(p.mois);
    if (E.store.get('paie_periodes', m)) return ui.toast('La période de ' + moisLabel(m) + ' existe déjà.', 'err');
    ui.confirm('Ouvrir la période', 'Ouvrir la paie de <b>' + moisLabel(m) + '</b> ? Les bulletins sont pré-calculés à partir des fiches du personnel (nouvelles embauches incluses).', 'Ouvrir', function () {
      var np = { id: m, mois: m, etape: 0, totaux: {}, historique: [] }; hist(np, 'Période ouverte'); E.store.all('paie_periodes').push(np); E.store.save();
      generer(m); E.log('Période de paie ouverte', moisLabel(m), 'paie'); ui.toast('Période de ' + moisLabel(m) + ' ouverte'); E.go('paie/periode'); E.rerender();
    });
  }
  function ordreVirement(p, done) {
    var bs = bulletins(p.mois).sort(function (a, b) { return a.nom.localeCompare(b.nom); });
    var html = '<div class="doc rh-doc">' + docHead('ORDRE DE VIREMENT DES SALAIRES', moisLabel(p.mois)) +
      '<p>Donneur d\'ordre : SOGARA — compte salaires ****7781. Date de valeur : <b>' + fmt.date(finMois(p.mois) > E.today() ? finMois(p.mois) : E.today()) + '</b>.</p>' +
      '<table><thead><tr><th>Matricule</th><th>Bénéficiaire</th><th>Compte</th><th class="n">Montant</th></tr></thead><tbody>' + bs.map(function (b) { return '<tr><td>' + b.employe + '</td><td>' + esc(b.nom) + '</td><td>****' + String(1000 + hnum(b.employe) * 13).slice(-4) + '</td><td class="n">' + fmt.money(b.net) + '</td></tr>'; }).join('') +
      '<tr class="sub"><td colspan="3">Total — ' + bs.length + ' virements</td><td class="n">' + fmt.money(E.sum(bs, 'net')) + '</td></tr></tbody></table>' +
      '<div class="sign"><div>La Directrice financière<br><b>Clarisse Nzé</b></div><div>Le Directeur général<br><b>Direction générale</b></div></div></div>';
    ui.modal({ title: 'Ordre de virement', sub: moisLabel(p.mois) + ' · ' + bs.length + ' bénéficiaires', size: 'lg', body: '<div class="rh-doc-wrap">' + html + '</div>',
      actions: [{ label: 'Annuler' }, { label: 'Imprimer', icon: 'print', onClick: function () { printDoc('Ordre de virement ' + p.mois, html); } }, { label: 'Confirmer l\'émission des virements', cls: 'success', icon: 'send', onClick: function (c) { c(); done(); } }] });
  }

  /* ------------------------------------------------------------ documents */
  function docHead(titre, sous) {
    return '<div class="doc__head"><div class="row" style="gap:14px"><img src="../assets/img/logo.png" alt="SOGARA"><div class="co"><b>SOGARA</b><span>Société Gabonaise de Raffinage</span><span>Zone industrielle — Port-Gentil, Gabon</span><span>N° employeur CNSS : 0-00412-DEMO</span></div></div><div style="text-align:right"><h4>' + esc(titre) + '</h4><b>' + esc(sous) + '</b></div></div>';
  }
  function bulletinHTML(b) {
    var p = E.store.get('paie_periodes', b.mois), mi = +b.mois.slice(5, 7);
    var moisCumul = Math.max(1, mi - Math.max(0, (b.entree.slice(0, 4) === b.mois.slice(0, 4) ? +b.entree.slice(5, 7) - 1 : 0)));
    var n = function (v) { return v ? fmt.num(v) : ''; };
    var rows = b.lignes.map(function (x) { return '<tr><td>' + x.code + '</td><td>' + esc(x.lib) + '</td><td class="n">' + (typeof x.base === 'number' ? fmt.num(x.base) : esc(x.base || '')) + '</td><td class="n">' + esc(x.taux || '') + '</td><td class="n">' + (x.gain ? fmt.num(x.gain) : '') + '</td><td class="n">' + n(x.ret) + '</td><td class="n">' + (x.pat ? fmt.num(x.pat) + (x.tauxP ? '<br><span style="color:#888;font-size:10px">' + x.tauxP + '</span>' : '') : '') + '</td></tr>'; });
    var gainsIdx = b.lignes.filter(function (x) { return x.gain; }).length;
    rows.splice(gainsIdx, 0, '<tr class="sub"><td></td><td>SALAIRE BRUT</td><td></td><td></td><td class="n">' + fmt.num(b.brut) + '</td><td></td><td></td></tr>');
    return '<div class="doc rh-doc">' + docHead('BULLETIN DE PAIE', 'Période : ' + moisLabel(b.mois)) +
      '<div class="two"><div class="box"><dl class="kv"><dt>Matricule</dt><dd>' + b.employe + '</dd><dt>N° CNSS</dt><dd>' + esc(b.cnss || '—') + '</dd><dt>Emploi</dt><dd>' + esc(b.poste) + '</dd><dt>Catégorie</dt><dd>' + esc(b.categorie) + '</dd></dl></div>' +
      '<div class="box"><b style="font-size:14px">' + esc(b.nom) + '</b><dl class="kv" style="margin-top:6px"><dt>Direction</dt><dd>' + esc(E.dirName(b.direction)) + '</dd><dt>Date d\'entrée</dt><dd>' + fmt.date(b.entree) + '</dd><dt>Parts fiscales</dt><dd>' + fmt.num(b.parts, 1) + '</dd><dt>Paiement</dt><dd>Virement ****' + String(1000 + hnum(b.employe) * 13).slice(-4) + '</dd></dl></div></div>' +
      '<table><thead><tr><th>Code</th><th>Rubrique</th><th class="n">Base</th><th class="n">Taux</th><th class="n">Gains</th><th class="n">Retenues</th><th class="n">Part patronale</th></tr></thead><tbody>' + rows.join('') +
      '<tr class="sub"><td></td><td>TOTAUX</td><td></td><td></td><td class="n">' + fmt.num(b.brut) + '</td><td class="n">' + fmt.num(b.cotSal + b.irpp + b.avances) + '</td><td class="n">' + fmt.num(b.cotPat) + '</td></tr></tbody></table>' +
      '<div class="net"><span>NET À PAYER</span><b>' + fmt.money(b.net) + '</b></div>' +
      '<table style="margin-top:12px"><thead><tr><th>Cumuls ' + b.mois.slice(0, 4) + ' (' + moisCumul + ' mois)</th><th class="n">Brut</th><th class="n">Net imposable</th><th class="n">IRPP</th><th class="n">Net payé</th><th class="n">Coût employeur</th></tr></thead><tbody><tr><td>Depuis le 1er janvier</td><td class="n">' + fmt.num(b.brut * moisCumul) + '</td><td class="n">' + fmt.num(b.imposable * moisCumul) + '</td><td class="n">' + fmt.num(b.irpp * moisCumul) + '</td><td class="n">' + fmt.num(b.net * moisCumul) + '</td><td class="n">' + fmt.num(b.cout * moisCumul) + '</td></tr></tbody></table>' +
      '<div class="foot">Bulletin ' + b.id + ' · ' + (p && p.etape >= 4 ? 'payé' : 'en cours de validation') + ' · Barème de simulation, à paramétrer avec le cabinet social · Dans votre intérêt, conservez ce bulletin sans limitation de durée.</div></div>';
  }
  function voirBulletin(b) {
    ui.modal({ title: 'Bulletin de paie — ' + b.nom, sub: moisLabel(b.mois) + ' · ' + b.employe, size: 'lg', body: '<div class="rh-doc-wrap">' + bulletinHTML(b) + '</div>',
      actions: [{ label: 'Fermer' }, { label: 'Fiche employé', icon: 'users', onClick: function (c) { c(); E.go('personnel/' + b.employe); } }, { label: 'Imprimer / PDF', cls: 'primary', icon: 'print', onClick: function () { printDoc('Bulletin ' + b.nom + ' ' + b.mois, bulletinHTML(b)); E.log('Impression bulletin', b.id, 'paie'); } }] });
  }

  /* ------------------------------------------------------------ vues */
  function header(view, active) {
    var p = courante();
    view.innerHTML = '<div class="rh-head"><div><h2>Paie & rémunérations</h2><p>Période en cours : <b>' + (p ? moisLabel(p.mois) : '—') + '</b> · ' + (p ? ETAPES[p.etape] : '') + '</p></div><div class="rh-actions">' +
      (p && p.etape <= 1 && isRH() ? '<button class="btn" data-a="var">' + icon('plus') + 'Élément variable</button>' : '') + '<a class="btn primary" href="#/paie/periode">' + icon('wallet') + 'Période en cours</a></div></div>' +
      ui.tabs([{ k: 'tableau', l: 'Tableau de bord' }, { k: 'periode', l: 'Période en cours' }, { k: 'bulletins', l: 'Bulletins' }, { k: 'variables', l: 'Éléments variables', n: p ? E.store.all('paie_variables').filter(function (v) { return v.mois === p.mois; }).length : null }, { k: 'livre', l: 'Livre de paie' }, { k: 'declarations', l: 'Déclarations' }, { k: 'parametres', l: 'Paramètres' }], active, function (k) { E.go('paie/' + (k === 'tableau' ? '' : k)); }) + '<div id="pa-body"></div>';
    var b = view.querySelector('[data-a=var]'); if (b) b.onclick = function () { ajouterVariable(p); };
    return view.querySelector('#pa-body');
  }

  function renderTableau(body) {
    var p = courante(), bs = bulletins(p.mois), t = totaux(bs), ps = periodes();
    var prev = ps[ps.indexOf(ps.find(function (x) { return x.id === p.id; })) - 1];
    var dv = prev && prev.totaux.brut ? (t.brut - prev.totaux.brut) / prev.totaux.brut * 100 : 0;
    var html = '<div class="grid g4 rh-kpis">' +
      ui.kpi({ label: 'Masse salariale brute · ' + moisCourt(p.mois), value: fmt.short(t.brut), unit: 'FCFA', icon: 'wallet', tone: 'blue', foot: '<span class="' + (dv > 0 ? 'down' : 'up') + '">' + (dv > 0 ? '+' : '') + fmt.num(dv, 1) + ' %</span> vs ' + (prev ? moisCourt(prev.mois) : '—') }) +
      ui.kpi({ label: 'Net à payer', value: fmt.short(t.net), unit: 'FCFA', icon: 'money', tone: 'green', foot: 'Net moyen ' + fmt.short(t.net / (t.effectif || 1)) + ' FCFA' }) +
      ui.kpi({ label: 'Charges patronales', value: fmt.short(t.cotPat), unit: 'FCFA', icon: 'invoice', tone: 'orange', foot: 'Coût employeur ' + fmt.short(t.cout) + ' FCFA' }) +
      ui.kpi({ label: 'Effectif payé', value: t.effectif, icon: 'users', tone: 'violet', foot: ETAPES[p.etape] + (t.hs ? ' · HS ' + fmt.short(t.hs) : '') }) + '</div>';
    var last = ps.slice(-12);
    html += '<div class="card" style="margin-bottom:16px"><div class="card__h"><h3>Circuit de la paie de ' + moisLabel(p.mois) + '</h3><a class="btn sm" style="margin-left:auto" href="#/paie/periode">Ouvrir ' + icon('arrow') + '</a></div><div class="card__b">' + wf(p) + '</div></div>';
    html += '<div class="grid g-2-1" style="margin-bottom:16px"><div class="card"><div class="card__h"><h3>Évolution de la masse salariale</h3><span class="sub">12 derniers mois · coût employeur</span></div><div class="card__b">' + ui.bars({ labels: last.map(function (x) { return moisCourt(x.mois); }), series: [{ name: 'Salaires bruts', values: last.map(function (x) { return x.totaux.brut || 0; }), color: '#0f2d5c' }, { name: 'Charges patronales', values: last.map(function (x) { return x.totaux.cotPat || 0; }), color: '#f5c400' }], stacked: true, money: true, height: 230 }) + '<div class="small muted" style="margin-top:6px">Décembre inclut la gratification de fin d\'année.</div></div></div>';
    var rub = [['Salaire de base', ['100', '150']], ['Ancienneté', ['110']], ['Prime de quart', ['120']], ['Heures sup.', ['130', '131']], ['Logement', ['160']], ['Transport', ['170']], ['Primes', ['140', '141']]].map(function (r, i) { return { label: r[0], value: E.sum(bs, function (b) { return E.sum(b.lignes.filter(function (x) { return r[1].indexOf(x.code) >= 0; }), 'gain'); }), color: ui.PALETTE[i] }; }).filter(function (x) { return x.value > 0; });
    html += '<div class="card"><div class="card__h"><h3>Composition du brut</h3></div><div class="card__b">' + ui.donut(rub, { money: true, center: fmt.short(t.brut), sub: 'FCFA brut' }) + '</div></div></div>';
    var dirs = E.store.all('directions').map(function (d) { var x = bs.filter(function (b) { return b.direction === d.id; }); return { l: d.nom, v: E.sum(x, 'cout'), n: x.length }; }).filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; });
    var max = dirs.length ? dirs[0].v : 1;
    html += '<div class="grid g2"><div class="card"><div class="card__h"><h3>Coût employeur par direction</h3><span class="sub">' + moisLabel(p.mois) + '</span></div><div class="card__b"><div class="rh-hbars">' + dirs.map(function (d) { return '<div class="rh-hbar"><span title="' + esc(d.l) + '">' + esc(d.l) + ' (' + d.n + ')</span><div><i style="width:' + (d.v / max * 100).toFixed(1) + '%"></i></div><b>' + fmt.short(d.v) + '</b></div>'; }).join('') + '</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Charges sociales et fiscales du mois</h3></div><div class="card__b"><div class="rh-decl">' + [['CNSS — part salariale', E.sum(bs, 'cnssSal')], ['CNSS — part patronale', E.sum(bs, 'cnssPat')], ['CNAMGS — part salariale', E.sum(bs, 'cnamgsSal')], ['CNAMGS — part patronale', E.sum(bs, 'cnamgsPat')], ['IRPP retenu à la source', t.irpp]].map(function (r) { return '<div class="rh-decl__row"><span>' + r[0] + '</span><b>' + fmt.money(r[1]) + '</b></div>'; }).join('') +
      '</div><div class="rh-total"><span>Total à reverser aux organismes</span><b>' + fmt.short(t.cotSal + t.cotPat + t.irpp) + ' FCFA</b></div><a class="btn sm" style="margin-top:12px" href="#/paie/declarations">' + icon('doc') + 'États déclaratifs</a></div></div></div>';
    body.innerHTML = html;
  }
  function wf(p) {
    return '<div class="rh-wf">' + ETAPES.map(function (s, i) { var c = i < p.etape || p.etape === 4 ? 'done' : i === p.etape ? 'cur' : ''; var h = (p.historique || []).find(function (x) { return (i === 1 && /soumise au contrôle/i.test(x.action)) || (i === 2 && /Contrôle RH validé/.test(x.action)) || (i === 3 && /validée par la DAF/.test(x.action)) || (i === 4 && /clôturée/i.test(x.action)) || (i === 0 && /ouverte|variables/i.test(x.action)); }); return '<div class="rh-wf__s ' + c + '"><em>' + (c === 'done' ? '✓' : i + 1) + '</em><b>' + s + '</b><span>' + (h && c === 'done' ? fmt.dateShort(h.date) + ' · ' + esc(h.par.split(' ')[0]) : ETAPE_SUB[i]) + '</span></div>'; }).join('') + '</div>';
  }

  function renderPeriode(body) {
    var p = courante(), bs = bulletins(p.mois), t = totaux(bs);
    var acts = [], lock = '';
    if (p.etape === 0 && isRH()) acts.push('<button class="btn" data-x="calc">' + icon('refresh') + 'Recalculer</button><button class="btn primary" data-x="next">' + icon('send') + 'Soumettre au contrôle RH</button>');
    if (p.etape === 1 && isRH()) acts.push('<button class="btn" data-x="calc">' + icon('refresh') + 'Recalculer</button><button class="btn danger" data-x="back">Renvoyer en préparation</button><button class="btn success" data-x="next">' + icon('check') + 'Valider le contrôle RH</button>');
    if (p.etape === 2) { if (isDAF()) acts.push('<button class="btn danger" data-x="back">Renvoyer en préparation</button><button class="btn success" data-x="next">' + icon('check') + 'Valider la masse salariale (DAF)</button>'); else lock = '<div class="rh-lock" style="margin-top:14px">' + icon('lock') + '<div><b>En attente de la Direction financière.</b> La validation de la masse salariale est réservée au profil Finance (DAF) ou à la Direction générale.</div></div>'; }
    if (p.etape === 3) { if (isDAF()) acts.push('<button class="btn success" data-x="next">' + icon('send') + 'Émettre les virements</button>'); else lock = '<div class="rh-lock" style="margin-top:14px">' + icon('lock') + '<div><b>Virements à émettre par la DAF.</b></div></div>'; }
    if (p.etape === 1 && !isRH()) lock = '<div class="rh-lock" style="margin-top:14px">' + icon('lock') + '<div><b>Contrôle en cours par les Ressources humaines.</b></div></div>';
    if (p.etape === 4 && isRH()) acts.push('<button class="btn primary" data-x="open">' + icon('plus') + 'Ouvrir la paie de ' + moisLabel(moisSuivant(p.mois)) + '</button>');
    acts.push('<button class="btn" data-x="livre">' + icon('download') + 'Livre de paie (CSV)</button>');
    var anomalies = [];
    bs.forEach(function (b) { if (b.net < 0.5 * b.brut * 0.6) anomalies.push(['orange', b.nom + ' : net inférieur à 30 % du brut', b]); if (b.hs > 0.25 * b.salaireBase) anomalies.push(['orange', b.nom + ' : heures supplémentaires > 25 % du salaire de base', b]); if (b.entree.slice(0, 7) === p.mois) anomalies.push(['blue', b.nom + ' : premier bulletin (entrée le ' + fmt.dateShort(b.entree) + (b.entree > p.mois + '-01' ? ', prorata appliqué' : '') + ')', b]); });
    var prev = E.store.get('paie_periodes', (function () { var d = E.parseDate(p.mois + '-01'); d.setMonth(d.getMonth() - 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); })());
    var nouveaux = bs.filter(function (b) { return !E.store.get('paies', 'BUL-' + (prev ? prev.mois : '') + '-' + b.employe); });
    if (prev && bulletins(prev.mois).length) nouveaux.forEach(function (b) { if (b.entree.slice(0, 7) !== p.mois) anomalies.push(['violet', b.nom + ' : nouveau dans la paie (embauche récente)', b]); });
    body.innerHTML = '<div class="card" style="margin-bottom:16px"><div class="card__h"><h3>Paie de ' + moisLabel(p.mois) + '</h3>' + ui.badge(ETAPES[p.etape], p.etape === 4 ? 'green' : 'orange') + '</div><div class="card__b">' + wf(p) + lock + '<div class="rh-actions" style="margin-top:14px">' + acts.join('') + '</div>' +
      (p.etape >= 2 ? '<div class="small muted" style="margin-top:10px">' + icon('lock', '').replace('<svg', '<svg style="width:13px;vertical-align:-2px"') + ' Bulletins verrouillés depuis la validation RH : les éléments variables ne sont plus modifiables.</div>' : '') + '</div></div>' +
      '<div class="grid g4 rh-kpis">' + ui.kpi({ label: 'Brut', value: fmt.short(t.brut), unit: 'FCFA', icon: 'wallet', tone: 'blue' }) + ui.kpi({ label: 'Cotisations salariales + IRPP', value: fmt.short(t.cotSal + t.irpp), unit: 'FCFA', icon: 'invoice', tone: 'orange' }) + ui.kpi({ label: 'Net à payer', value: fmt.short(t.net), unit: 'FCFA', icon: 'money', tone: 'green' }) + ui.kpi({ label: 'Bulletins', value: bs.length, icon: 'doc', tone: 'violet', foot: anomalies.length + ' point(s) de contrôle' }) + '</div>' +
      '<div class="grid g-2-1"><div class="card"><div class="card__h"><h3>Bulletins du mois</h3><a class="btn sm" style="margin-left:auto" href="#/paie/bulletins">Tous les bulletins</a></div>' + ui.table(bulCols().slice(0, 6), bs.slice().sort(function (a, b) { return b.brut - a.brut; }).slice(0, 10), { onRow: voirBulletin, footer: function () { return '<td colspan="2">Total (' + bs.length + ' bulletins)</td><td class="num">' + fmt.num(t.brut) + '</td><td class="num">' + fmt.num(t.cotSal) + '</td><td class="num">' + fmt.num(t.irpp) + '</td><td class="num">' + fmt.num(t.net) + '</td>'; } }) + '</div>' +
      '<div class="stack"><div class="card"><div class="card__h"><h3>Contrôles automatiques</h3></div><div class="list">' + (anomalies.length ? anomalies.slice(0, 8).map(function (a, i) { return '<div class="list__item" style="cursor:pointer" data-an="' + i + '"><div class="list__icon tone-' + a[0] + '">' + icon('alert') + '</div><div class="list__body small"><b>' + esc(a[1]) + '</b></div></div>'; }).join('') : '<div class="empty">Aucune anomalie détectée</div>') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Historique</h3></div><div class="card__b"><div class="timeline">' + (p.historique || []).map(function (h, i) { return '<div class="tl-item ' + (i === 0 && p.etape < 4 ? 'current' : 'done') + '"><b>' + esc(h.action) + '</b><span>' + fmt.datetime(h.date) + ' · ' + esc(h.par) + '</span></div>'; }).join('') + '</div></div></div></div></div>';
    var map = { next: function () { avancer(p); }, back: function () { renvoyer(p); }, calc: function () { generer(p.mois); E.log('Recalcul de la paie', moisLabel(p.mois), 'paie'); ui.toast('Bulletins recalculés'); E.rerender(); }, open: function () { ouvrirSuivante(p); }, livre: function () { exportLivre(p.mois); } };
    body.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = function () { map[b.dataset.x](); }; });
    body.querySelectorAll('[data-an]').forEach(function (el) { el.onclick = function () { voirBulletin(anomalies[+el.dataset.an][2]); }; });
  }

  function bulCols() {
    return [
      { label: 'Salarié', render: function (b) { return '<b>' + esc(b.nom) + '</b><div class="small muted">' + b.employe + ' · ' + esc(b.poste) + '</div>'; }, csv: function (b) { return b.nom; } },
      { label: 'Direction', render: function (b) { return esc(E.dirName(b.direction)); }, csv: function (b) { return E.dirName(b.direction); } },
      { label: 'Brut', num: true, render: function (b) { return fmt.num(b.brut); }, csv: function (b) { return b.brut; } },
      { label: 'Cotisations', num: true, render: function (b) { return fmt.num(b.cotSal); }, csv: function (b) { return b.cotSal; } },
      { label: 'IRPP', num: true, render: function (b) { return fmt.num(b.irpp); }, csv: function (b) { return b.irpp; } },
      { label: 'Net à payer', num: true, render: function (b) { return '<b>' + fmt.num(b.net) + '</b>'; }, csv: function (b) { return b.net; } },
      { label: 'Coût employeur', num: true, render: function (b) { return fmt.num(b.cout); }, csv: function (b) { return b.cout; } }
    ];
  }
  var bulF = { mois: '', dir: '', q: '' };
  function monthSelect(id, cur) { return '<select class="select" id="' + id + '">' + moisAvecBulletins().map(function (m) { var p = E.store.get('paie_periodes', m); return '<option value="' + m + '"' + (m === cur ? ' selected' : '') + '>' + moisLabel(m) + (p ? ' — ' + ETAPES[p.etape] : '') + '</option>'; }).join('') + '</select>'; }
  function renderBulletins(body) {
    bulF.mois = bulF.mois || courante().mois;
    body.innerHTML = '<div class="filters">' + monthSelect('bf-m', bulF.mois) + '<select class="select" id="bf-d"><option value="">Toutes les directions</option>' + E.options('directions').map(function (o) { return '<option value="' + o.v + '"' + (bulF.dir === o.v ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select><input class="input" type="search" id="bf-q" placeholder="Nom ou matricule…" value="' + esc(bulF.q) + '"><span class="spacer"></span><button class="btn" id="bf-csv">' + icon('download') + 'Export CSV</button></div><div class="card" id="bf-res"></div>';
    var rows = [];
    var draw = function () {
      var q = E.norm(bulF.q);
      rows = bulletins(bulF.mois).filter(function (b) { return (!bulF.dir || b.direction === bulF.dir) && (!q || E.norm(b.nom + ' ' + b.employe).indexOf(q) >= 0); }).sort(function (a, b) { return a.nom.localeCompare(b.nom); });
      var t = totaux(rows), p = E.store.get('paie_periodes', bulF.mois);
      body.querySelector('#bf-res').innerHTML = '<div class="card__h"><h3>' + rows.length + ' bulletin(s) · ' + moisLabel(bulF.mois) + '</h3>' + (p ? ui.badge(p.etape === 4 ? 'Payé' : ETAPES[p.etape], p.etape === 4 ? 'green' : 'orange') : '') + '<span class="sub" style="margin-left:auto">cliquez une ligne pour ouvrir le bulletin</span></div>' +
        ui.table(bulCols(), rows, { onRow: voirBulletin, empty: 'Aucun bulletin', footer: function () { return '<td colspan="2">Total</td><td class="num">' + fmt.num(t.brut) + '</td><td class="num">' + fmt.num(t.cotSal) + '</td><td class="num">' + fmt.num(t.irpp) + '</td><td class="num">' + fmt.num(t.net) + '</td><td class="num">' + fmt.num(t.cout) + '</td>'; } });
    };
    body.querySelector('#bf-m').onchange = function (e) { bulF.mois = e.target.value; draw(); };
    body.querySelector('#bf-d').onchange = function (e) { bulF.dir = e.target.value; draw(); };
    body.querySelector('#bf-q').oninput = function (e) { bulF.q = e.target.value; draw(); };
    body.querySelector('#bf-csv').onclick = function () { ui.exportCSV('bulletins-' + bulF.mois, [{ label: 'Matricule', key: 'employe' }].concat(bulCols()), rows); };
    draw();
  }

  function ajouterVariable(p) {
    if (!p || p.etape > 1) return ui.toast('La période est verrouillée : plus de saisie possible.', 'err');
    ui.formModal({ title: 'Élément variable de paie', sub: moisLabel(p.mois), okLabel: 'Ajouter et recalculer',
      fields: [{ name: 'employe', label: 'Salarié', type: 'select', options: E.options('employes', function (e) { return e.nom + ' — ' + e.id; }), full: true, required: true },
        { name: 'type', label: 'Rubrique', type: 'select', options: VAR_TYPES.map(function (v) { return { v: v.v, l: v.l }; }), full: true },
        { name: 'quantite', label: 'Quantité (heures, jours) ou montant (FCFA)', type: 'number', min: 0, required: true }, { name: 'libelle', label: 'Libellé / justification' }],
      onSubmit: function (v) {
        var x = { id: 'VAR-' + Date.now().toString(36).toUpperCase(), mois: p.mois, employe: v.employe, type: v.type, quantite: +v.quantite, libelle: v.libelle, saisi: E.today(), par: user().name };
        E.store.add('paie_variables', x); generer(p.mois); E.log('Élément variable', E.empName(v.employe) + ' · ' + v.type + ' ' + v.quantite, 'paie');
        var b = E.store.get('paies', 'BUL-' + p.mois + '-' + v.employe);
        ui.toast('Ajouté — nouveau net de ' + E.empName(v.employe) + ' : ' + (b ? fmt.money(b.net) : '—')); setTimeout(E.rerender);
      } });
  }
  function renderVariables(body) {
    var p = courante(), vs = E.store.all('paie_variables').filter(function (v) { return v.mois === p.mois; });
    var lockd = p.etape > 1;
    var vt = function (t) { return VAR_TYPES.find(function (x) { return x.v === t; }) || { l: t, unit: '' }; };
    var cols = [{ label: 'Salarié', render: function (v) { return '<b>' + esc(E.empName(v.employe)) + '</b><div class="small muted">' + v.employe + '</div>'; }, csv: function (v) { return E.empName(v.employe); } }, { label: 'Rubrique', render: function (v) { return esc(vt(v.type).l); }, csv: function (v) { return vt(v.type).l; } }, { label: 'Quantité', num: true, render: function (v) { var u = vt(v.type).unit; return u === 'FCFA' ? fmt.money(v.quantite) : fmt.num(v.quantite) + ' ' + u; }, csv: function (v) { return v.quantite; } }, { label: 'Justification', render: function (v) { return esc(v.libelle || '—'); }, csv: function (v) { return v.libelle; } },
      { label: 'Impact net', num: true, render: function (v) { var b = E.store.get('paies', 'BUL-' + p.mois + '-' + v.employe); return b ? fmt.num(b.net) : '—'; }, csv: function () { return ''; } }, { label: '', render: function (v) { return lockd || !isRH() ? '' : '<button class="btn sm danger" data-del="' + v.id + '">' + icon('trash') + '</button>'; }, csv: function () { return ''; } }];
    var hs = E.sum(vs.filter(function (v) { return /^HS/.test(v.type); }), 'quantite');
    body.innerHTML = '<div class="grid g4 rh-kpis">' + ui.kpi({ label: 'Éléments saisis', value: vs.length, icon: 'list', tone: 'blue', foot: moisLabel(p.mois) }) + ui.kpi({ label: 'Heures supplémentaires', value: fmt.num(hs), unit: 'h', icon: 'clock', tone: 'orange', foot: fmt.short(totaux(bulletins(p.mois)).hs) + ' FCFA' }) +
      ui.kpi({ label: 'Primes exceptionnelles', value: fmt.short(E.sum(vs.filter(function (v) { return v.type === 'PRIME' || v.type === 'REND'; }), 'quantite')), unit: 'FCFA', icon: 'star', tone: 'green' }) + ui.kpi({ label: 'Absences non rémunérées', value: E.sum(vs.filter(function (v) { return v.type === 'ABS'; }), 'quantite'), unit: 'j', icon: 'calendar', tone: 'red' }) + '</div>' +
      (lockd ? '<div class="alert tone-grey" style="margin-bottom:14px">' + icon('lock') + '<div>Période en « ' + ETAPES[p.etape] + ' » : les éléments variables sont verrouillés.</div></div>' : '') +
      '<div class="card"><div class="card__h"><h3>Éléments variables · ' + moisLabel(p.mois) + '</h3>' + (!lockd && isRH() ? '<button class="btn sm primary" style="margin-left:auto" id="va-add">' + icon('plus') + 'Ajouter</button>' : '') + '</div>' + ui.table(cols, vs, { empty: 'Aucun élément variable ce mois-ci' }) + '</div>';
    var add = body.querySelector('#va-add'); if (add) add.onclick = function () { ajouterVariable(p); };
    body.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { E.store.remove('paie_variables', b.dataset.del); generer(p.mois); ui.toast('Élément supprimé, bulletins recalculés'); E.rerender(); }; });
  }

  var livreCols = [{ label: 'Matricule', key: 'employe' }, { label: 'Nom', key: 'nom' }, { label: 'Direction', key: 'direction' }, { label: 'Catégorie', key: 'categorie' },
    { label: 'Base', code: ['100', '150'] }, { label: 'Ancienneté', code: ['110'] }, { label: 'Quart', code: ['120'] }, { label: 'HS', code: ['130', '131'] }, { label: 'Primes', code: ['140', '141'] }, { label: 'Logement', code: ['160'] }, { label: 'Transport', code: ['170'] },
    { label: 'Brut', key: 'brut' }, { label: 'CNSS sal.', key: 'cnssSal' }, { label: 'CNAMGS sal.', key: 'cnamgsSal' }, { label: 'IRPP', key: 'irpp' }, { label: 'Avances', key: 'avances' }, { label: 'Net', key: 'net' }, { label: 'CNSS pat.', key: 'cnssPat' }, { label: 'CNAMGS pat.', key: 'cnamgsPat' }, { label: 'Coût', key: 'cout' }];
  function lv(b, c) { return c.code ? E.sum(b.lignes.filter(function (x) { return c.code.indexOf(x.code) >= 0; }), 'gain') : b[c.key]; }
  function exportLivre(m) { ui.exportCSV('livre-de-paie-' + m, livreCols.map(function (c) { return { label: c.label, csv: function (b) { return lv(b, c); } }; }), bulletins(m).sort(function (a, b) { return a.employe.localeCompare(b.employe); })); }
  var livreM = '';
  function renderLivre(body) {
    livreM = livreM || courante().mois;
    var bs = bulletins(livreM).sort(function (a, b) { return a.employe.localeCompare(b.employe); });
    var cols = livreCols.map(function (c) { var num = !/Matricule|Nom|Direction|Catégorie/.test(c.label); return { label: c.label, num: num, render: function (b) { var v = lv(b, c); return num ? (v ? fmt.num(v) : '<span class="muted">0</span>') : (c.key === 'nom' ? '<b>' + esc(v) + '</b>' : esc(v)); } }; });
    body.innerHTML = '<div class="filters">' + monthSelect('lv-m', livreM) + '<span class="spacer"></span><button class="btn primary" id="lv-csv">' + icon('download') + 'Exporter le livre de paie (CSV)</button></div>' +
      '<div class="card"><div class="card__h"><h3>Livre de paie · ' + moisLabel(livreM) + '</h3><span class="sub">' + bs.length + ' salariés · toutes rubriques</span></div>' + ui.table(cols, bs, { footer: function () { return livreCols.map(function (c, i) { if (i < 4) return i === 0 ? '<td colspan="4">Totaux</td>' : ''; return '<td class="num">' + fmt.num(E.sum(bs, function (b) { return lv(b, c); })) + '</td>'; }).join(''); } }) + '</div>';
    body.querySelector('#lv-m').onchange = function (e) { livreM = e.target.value; renderLivre(body); };
    body.querySelector('#lv-csv').onclick = function () { exportLivre(livreM); };
  }

  var declM = '';
  function declData(m) {
    var bs = bulletins(m), p = E.store.get('paie_periodes', m), ech = moisSuivant(m) + '-15';
    var paid = p && p.etape === 4 && E.today() > ech;
    return { bs: bs, ech: ech, statut: paid ? 'Déclarée et payée' : p && p.etape === 4 ? 'À déclarer' : 'Paie non clôturée',
      cnss: { base: E.sum(bs, 'cnssBase'), sal: E.sum(bs, 'cnssSal'), pat: E.sum(bs, 'cnssPat') }, cnamgs: { base: E.sum(bs, 'soumis'), sal: E.sum(bs, 'cnamgsSal'), pat: E.sum(bs, 'cnamgsPat') }, irpp: { base: E.sum(bs, 'imposable'), montant: E.sum(bs, 'irpp') } };
  }
  function declDoc(m, kind) {
    var d = declData(m), prm = P();
    var titre = { cnss: 'DÉCLARATION CNSS', cnamgs: 'DÉCLARATION CNAMGS', irpp: 'ÉTAT DES RETENUES IRPP' }[kind];
    var head = kind === 'irpp' ? '<th>Matricule</th><th>Nom</th><th class="n">Net imposable</th><th class="n">Parts</th><th class="n">IRPP retenu</th>' : '<th>Matricule</th><th>Nom</th><th>N° CNSS</th><th class="n">Assiette</th><th class="n">Part salariale</th><th class="n">Part patronale</th>';
    var rows = d.bs.slice().sort(function (a, b) { return a.employe.localeCompare(b.employe); }).map(function (b) { return kind === 'irpp' ? '<tr><td>' + b.employe + '</td><td>' + esc(b.nom) + '</td><td class="n">' + fmt.num(b.imposable) + '</td><td class="n">' + fmt.num(b.parts, 1) + '</td><td class="n">' + fmt.num(b.irpp) + '</td></tr>' : '<tr><td>' + b.employe + '</td><td>' + esc(b.nom) + '</td><td>' + esc(b.cnss || '') + '</td><td class="n">' + fmt.num(kind === 'cnss' ? b.cnssBase : b.soumis) + '</td><td class="n">' + fmt.num(kind === 'cnss' ? b.cnssSal : b.cnamgsSal) + '</td><td class="n">' + fmt.num(kind === 'cnss' ? b.cnssPat : b.cnamgsPat) + '</td></tr>'; }).join('');
    var x = d[kind], tot = kind === 'irpp' ? '<tr class="sub"><td colspan="2">Total</td><td class="n">' + fmt.num(x.base) + '</td><td></td><td class="n">' + fmt.num(x.montant) + '</td></tr>' : '<tr class="sub"><td colspan="3">Total</td><td class="n">' + fmt.num(x.base) + '</td><td class="n">' + fmt.num(x.sal) + '</td><td class="n">' + fmt.num(x.pat) + '</td></tr>';
    var total = kind === 'irpp' ? x.montant : x.sal + x.pat;
    return '<div class="doc rh-doc">' + docHead(titre, moisLabel(m)) + '<p>' + (kind === 'cnss' ? 'Taux : ' + prm.cnssSal + ' % salarié, ' + prm.cnssPat + ' % employeur, plafond mensuel ' + fmt.money(prm.cnssPlafond) + '.' : kind === 'cnamgs' ? 'Taux : ' + prm.cnamgsSal + ' % salarié, ' + prm.cnamgsPat + ' % employeur.' : 'Impôt sur le revenu des personnes physiques retenu à la source — à reverser à la Direction générale des impôts.') + ' Échéance : <b>' + fmt.date(d.ech) + '</b>.</p>' +
      '<table><thead><tr>' + head + '</tr></thead><tbody>' + rows + tot + '</tbody></table><div class="net"><span>MONTANT À REVERSER</span><b>' + fmt.money(total) + '</b></div><div class="foot">Barème de simulation, à paramétrer avec le cabinet social — document de démonstration.</div></div>';
  }
  function renderDeclarations(body) {
    declM = declM || moisAvecBulletins().find(function (m) { var p = E.store.get('paie_periodes', m); return p && p.etape === 4; }) || courante().mois;
    var d = declData(declM);
    var card = function (kind, titre, org, lines, total, ic) {
      return '<div class="card"><div class="card__h"><div class="list__icon tone-blue">' + icon(ic) + '</div><div><h3>' + titre + '</h3><div class="sub">' + org + '</div></div><span style="margin-left:auto">' + ui.badge(d.statut, /payée/.test(d.statut) ? 'green' : /À déclarer/.test(d.statut) ? 'orange' : 'grey') + '</span></div><div class="card__b"><div class="rh-decl">' + lines.map(function (r) { return '<div class="rh-decl__row"><span>' + r[0] + '</span><b>' + fmt.money(r[1]) + '</b></div>'; }).join('') + '<div class="rh-decl__row"><span>Échéance</span><b>' + fmt.date(d.ech) + '</b></div></div><div class="rh-total"><span>À reverser</span><b>' + fmt.short(total) + ' FCFA</b></div>' +
        '<div class="rh-actions" style="margin-top:12px"><button class="btn sm" data-dv="' + kind + '">' + icon('eye') + 'Aperçu de l\'état</button><button class="btn sm" data-dc="' + kind + '">' + icon('download') + 'CSV</button></div></div></div>';
    };
    body.innerHTML = '<div class="filters">' + monthSelect('dc-m', declM) + '<span class="spacer"></span><span class="rh-note">' + icon('info') + 'Barème de simulation, à paramétrer avec le cabinet social</span></div>' +
      '<div class="grid g3">' + card('cnss', 'CNSS', 'Caisse nationale de sécurité sociale', [['Assiette plafonnée', d.cnss.base], ['Part salariale', d.cnss.sal], ['Part patronale', d.cnss.pat]], d.cnss.sal + d.cnss.pat, 'shield') +
      card('cnamgs', 'CNAMGS', 'Caisse nationale d\'assurance maladie et de garantie sociale', [['Assiette', d.cnamgs.base], ['Part salariale', d.cnamgs.sal], ['Part patronale', d.cnamgs.pat]], d.cnamgs.sal + d.cnamgs.pat, 'helmet') +
      card('irpp', 'IRPP', 'Direction générale des impôts — retenue à la source', [['Net imposable total', d.irpp.base], ['Salariés concernés', 0], ['IRPP retenu', d.irpp.montant]].map(function (r) { return r[0] === 'Salariés concernés' ? [r[0], null] : r; }).filter(function (r) { return r[1] != null; }), d.irpp.montant, 'invoice') + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Récapitulatif annuel des versements</h3><span class="sub">périodes clôturées</span></div>' + ui.table([{ label: 'Période', render: function (p) { return '<b>' + moisLabel(p.mois) + '</b>'; } }, { label: 'Effectif', num: true, render: function (p) { return p.totaux.effectif; } }, { label: 'Brut', num: true, render: function (p) { return fmt.num(p.totaux.brut); } }, { label: 'Cotisations sociales', num: true, render: function (p) { return fmt.num(p.totaux.cotSal + p.totaux.cotPat); } }, { label: 'IRPP', num: true, render: function (p) { return fmt.num(p.totaux.irpp); } }, { label: 'Statut', render: function (p) { return ui.badge(p.etape === 4 ? 'Versé' : ETAPES[p.etape], p.etape === 4 ? 'green' : 'orange'); } }], periodes().slice(-12).reverse()) + '</div>';
    body.querySelector('#dc-m').onchange = function (e) { declM = e.target.value; renderDeclarations(body); };
    body.querySelectorAll('[data-dv]').forEach(function (b) { b.onclick = function () { var k = b.dataset.dv, html = declDoc(declM, k); ui.modal({ title: 'État ' + k.toUpperCase(), sub: moisLabel(declM), size: 'lg', body: '<div class="rh-doc-wrap">' + html + '</div>', actions: [{ label: 'Fermer' }, { label: 'Imprimer / PDF', cls: 'primary', icon: 'print', onClick: function () { printDoc('Déclaration ' + k.toUpperCase() + ' ' + declM, html); } }] }); }; });
    body.querySelectorAll('[data-dc]').forEach(function (b) { b.onclick = function () { var k = b.dataset.dc; ui.exportCSV('declaration-' + k + '-' + declM, k === 'irpp' ? [{ label: 'Matricule', key: 'employe' }, { label: 'Nom', key: 'nom' }, { label: 'Net imposable', key: 'imposable' }, { label: 'Parts', key: 'parts' }, { label: 'IRPP', key: 'irpp' }] : [{ label: 'Matricule', key: 'employe' }, { label: 'Nom', key: 'nom' }, { label: 'N° CNSS', key: 'cnss' }, { label: 'Assiette', key: k === 'cnss' ? 'cnssBase' : 'soumis' }, { label: 'Part salariale', key: k === 'cnss' ? 'cnssSal' : 'cnamgsSal' }, { label: 'Part patronale', key: k === 'cnss' ? 'cnssPat' : 'cnamgsPat' }], d.bs); }; });
  }

  function renderParametres(body) {
    var p = P(), can = isRH() || isDAF();
    var f = function (name, label, val, unit, step) { return '<div class="field"><label for="pp_' + name + '">' + esc(label) + (unit ? ' (' + unit + ')' : '') + '</label><input class="input" type="number" step="' + (step || 'any') + '" id="pp_' + name + '" data-k="' + name + '" value="' + val + '"' + (can ? '' : ' disabled') + '></div>'; };
    body.innerHTML = '<div class="rh-note" style="margin-bottom:14px">' + icon('alert') + '<span><b>Barème de simulation, à paramétrer avec le cabinet social.</b> Les taux ci-dessous servent à la démonstration ; en production ils sont validés par le cabinet social et versionnés par date d\'effet.</span></div>' +
      '<div class="grid g2"><div class="card"><div class="card__h"><h3>Cotisations sociales</h3></div><div class="card__b"><div class="rh-param">' + f('cnssSal', 'CNSS salarié', p.cnssSal, '%') + f('cnssPat', 'CNSS employeur', p.cnssPat, '%') + f('cnssPlafond', 'Plafond mensuel CNSS', p.cnssPlafond, 'FCFA', 1000) + f('cnamgsSal', 'CNAMGS salarié', p.cnamgsSal, '%') + f('cnamgsPat', 'CNAMGS employeur', p.cnamgsPat, '%') + f('abattement', 'Abattement frais professionnels (IRPP)', p.abattement, '%') + '</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Primes et indemnités</h3></div><div class="card__b"><div class="rh-param">' + f('ancTaux', 'Ancienneté : taux par année', p.ancTaux, '%') + f('ancSeuil', 'Ancienneté : à partir de', p.ancSeuil, 'ans', 1) + f('ancPlafond', 'Ancienneté : plafond', p.ancPlafond, '%') + f('quartTaux', 'Prime de quart (postés PROD)', p.quartTaux, '%') + f('transport', 'Prime de transport', p.transport, 'FCFA', 1000) + f('heuresMois', 'Heures mensuelles de référence', p.heuresMois, 'h') + '</div>' +
      '<h4 style="margin:16px 0 8px;font-size:13px">Indemnité de logement par catégorie (FCFA)</h4><div class="rh-param">' + Object.keys(p.logement).map(function (k) { return '<div class="field"><label>' + esc(k) + '</label><input class="input" type="number" step="1000" data-log="' + esc(k) + '" value="' + p.logement[k] + '"' + (can ? '' : ' disabled') + '></div>'; }).join('') + '</div></div></div></div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Barème IRPP progressif (simplifié, mensuel, par part)</h3></div>' + '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tranche</th><th class="num">Jusqu\'à (FCFA / part)</th><th class="num">Taux</th></tr></thead><tbody>' + p.bareme.map(function (t, i) { return '<tr><td>Tranche ' + (i + 1) + '</td><td class="num">' + (t[0] == null ? 'au-delà' : '<input class="input" style="max-width:150px;text-align:right" type="number" step="1000" data-b="' + i + '" value="' + t[0] + '"' + (can ? '' : ' disabled') + '>') + '</td><td class="num"><input class="input" style="max-width:90px;text-align:right" type="number" step="0.5" data-t="' + i + '" value="' + t[1] + '"' + (can ? '' : ' disabled') + '> %</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="card__b small muted">Quotient familial : 1 part + 1 si marié(e) + 0,5 par enfant à charge (plafonné à 5 parts).</div></div>' +
      (can ? '<div class="rh-actions" style="margin-top:16px;justify-content:flex-end"><button class="btn" id="pp-reset">Rétablir les valeurs de démonstration</button><button class="btn primary" id="pp-save">' + icon('check') + 'Enregistrer et recalculer la période en cours</button></div>' : '');
    if (!can) return;
    body.querySelector('#pp-save').onclick = function () {
      body.querySelectorAll('[data-k]').forEach(function (i) { p[i.dataset.k] = +i.value; });
      body.querySelectorAll('[data-log]').forEach(function (i) { p.logement[i.dataset.log] = +i.value; });
      body.querySelectorAll('[data-b]').forEach(function (i) { p.bareme[+i.dataset.b][0] = +i.value; });
      body.querySelectorAll('[data-t]').forEach(function (i) { p.bareme[+i.dataset.t][1] = +i.value; });
      E.store.save(); E.log('Paramètres de paie modifiés', '', 'paie');
      var c = courante(); if (c && c.etape <= 1) { generer(c.mois); ui.toast('Paramètres enregistrés — paie de ' + moisLabel(c.mois) + ' recalculée'); } else ui.toast('Paramètres enregistrés (s\'appliqueront à la prochaine période)');
      E.rerender();
    };
    body.querySelector('#pp-reset').onclick = function () { ui.confirm('Rétablir les paramètres', 'Revenir aux valeurs de démonstration ?', 'Rétablir', function () { var d = E.clone(DEF); Object.keys(d).forEach(function (k) { p[k] = d[k]; }); E.store.save(); var c = courante(); if (c && c.etape <= 1) generer(c.mois); ui.toast('Paramètres rétablis'); E.rerender(); }); };
  }

  E.register({
    id: 'paie', label: 'Paie', title: 'Paie & rémunérations', icon: 'wallet', group: 'Management', roles: ['rh', 'finance'],
    seed: function () { return { paie_params: [E.clone(DEF)], paie_variables: seedVariables(), paie_periodes: [], paies: [] }; },
    init: function () { initPaie(); },
    render: function (view, p) {
      initPaie();
      var tab = p[0] || 'tableau';
      if (['tableau', 'periode', 'bulletins', 'variables', 'livre', 'declarations', 'parametres'].indexOf(tab) < 0) tab = 'tableau';
      var body = header(view, tab);
      ({ tableau: renderTableau, periode: renderPeriode, bulletins: renderBulletins, variables: renderVariables, livre: renderLivre, declarations: renderDeclarations, parametres: renderParametres })[tab](body);
      if (p[1] && tab === 'bulletins') { var b = E.store.get('paies', p[1]); if (b) voirBulletin(b); }
    },
    summary: function () {
      var p = courante(); if (!p) return [];
      return [{ label: 'Masse salariale · ' + moisCourt(p.mois), value: fmt.short(p.totaux.brut || 0), icon: 'wallet', tone: 'green', foot: 'Paie : ' + ETAPES[p.etape].toLowerCase() + ' · ' + (p.totaux.effectif || 0) + ' salariés', href: '#/paie/periode' }];
    },
    pending: function (u) {
      var p = courante(); if (!p || p.etape >= 4) return [];
      var mine = (p.etape <= 1 && (u.profile === 'rh' || u.profile === 'admin')) || (p.etape >= 2 && (u.profile === 'finance' || u.profile === 'admin'));
      if (!mine) return [];
      return [{ title: 'Paie de ' + moisLabel(p.mois) + ' · ' + ['préparation à terminer', 'contrôle RH à valider', 'validation DAF', 'virements à émettre'][p.etape], sub: 'Brut ' + fmt.short(p.totaux.brut) + ' FCFA · net ' + fmt.short(p.totaux.net) + ' FCFA · ' + p.totaux.effectif + ' bulletins', date: finMois(p.mois), href: '#/paie/periode', tone: 'orange' }];
    },
    search: function (q) {
      var p = courante(); if (!p) return [];
      return bulletins(p.mois).filter(function (b) { return E.norm(b.nom + ' ' + b.employe).indexOf(q) >= 0; }).map(function (b) { return { title: 'Bulletin ' + b.nom, sub: moisLabel(b.mois) + ' · net ' + fmt.money(b.net), href: '#/paie/bulletins/' + b.id }; });
    },
    badge: function () { var p = courante(), u = user(); if (!p || p.etape >= 4) return 0; return ((p.etape <= 1 && (u.profile === 'rh' || u.profile === 'admin')) || (p.etape >= 2 && (u.profile === 'finance' || u.profile === 'admin'))) ? 1 : 0; }
  });
})();
