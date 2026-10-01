/* SOGARA · Espace de gestion — module Ventes & facturation (order-to-cash).
   Tarifs de cession → devis / offres commerciales → commandes et contrats d'enlèvement → enlèvements
   → factures (TVA) → encaissements → relances → encours et risque client (plafonds, balance âgée, DSO).
   Collections : tarifs, devisClients, commandesClients, factures, encaissements, caMensuel. */
(function () {
  'use strict';
  var E = window.ERP; if (!E) return;
  if (!document.getElementById('fin-css')) { var lk = document.createElement('link'); lk.id = 'fin-css'; lk.rel = 'stylesheet'; lk.href = 'css/finance.css'; document.head.appendChild(lk); }

  var S = E.store, U = E.ui, F = E.fmt, esc = E.esc, ic = E.icon;
  var TVA = 0.18, Y = E.TODAY.getFullYear(), MOD = 'ventes';
  var TONE = { 'Brouillon': 'grey', 'Envoyé': 'blue', 'Accepté': 'green', 'Refusé': 'red', 'Converti': 'violet', 'Expiré': 'grey',
    'Confirmée': 'blue', 'En cours d\'enlèvement': 'violet', 'Enlevée': 'green', 'Clôturée': 'grey',
    'Émise': 'blue', 'Partiellement payée': 'orange', 'Payée': 'green', 'Échue': 'red' };
  function B(s) { return U.badge(s, TONE[s]); }
  function d(n) { return E.addDays(E.today(), n); }
  function today() { return E.today(); }
  function user() { return E.session.user() || {}; }
  function M(n) { return F.short(n) + ' FCFA'; }
  function cl(id) { return S.get('clients', id) || { id: id, nom: id || '—', type: '', ville: '', plafond: 0, delai: 30 }; }
  function clNom(id) { return cl(id).nom; }
  function tarif(id) { return S.get('tarifs', id) || { id: id, produit: id, unite: 'u', prix: 0, color: '#94a3b8' }; }
  function stamp() { return new Date().toISOString(); }
  function nextId(col, prefix) { var max = 0, yy = String(Y); S.all(col).forEach(function (x) { var m = /-(\d{4})-(\d{4})$/.exec(x.id || ''); if (m && x.id.indexOf(prefix + '-') === 0 && m[1] === yy) max = Math.max(max, +m[2]); }); return prefix + '-' + yy + '-' + String((max || 100) + 1).padStart(4, '0'); }
  function firstOfMonth(k) { var dt = new Date(E.TODAY.getFullYear(), E.TODAY.getMonth() + k, 1); return E.iso(dt); }
  function months12(end) { end = end || 0; var out = []; for (var k = 11 - end; k >= -end; k--) { var dt = new Date(E.TODAY.getFullYear(), E.TODAY.getMonth() - k, 1); out.push({ key: E.iso(dt).slice(0, 7), label: E.MOIS[dt.getMonth()] + (dt.getMonth() === 0 || k === 11 - end ? ' ' + String(dt.getFullYear()).slice(2) : '') }); } return out; }

  /* Montant en toutes lettres */
  var UN = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  var DIZ = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  function lt100(n) { if (n < 20) return UN[n]; var t = Math.floor(n / 10), u = n % 10; if (t === 7 || t === 9) return DIZ[t] + (t === 7 && u === 1 ? ' et ' : '-') + UN[10 + u]; if (u === 0) return DIZ[t] + (t === 8 ? 's' : ''); if (u === 1 && t !== 8) return DIZ[t] + ' et un'; return DIZ[t] + '-' + UN[u]; }
  function lt1000(n) { var c = Math.floor(n / 100), r = n % 100, s = ''; if (c > 1) s = UN[c] + ' cent' + (r === 0 ? 's' : ''); else if (c === 1) s = 'cent'; if (r) s += (s ? ' ' : '') + lt100(r); return s; }
  function enLettres(n) { n = Math.round(Math.abs(n)); if (!n) return 'Zéro'; var p = [], md = Math.floor(n / 1e9), mi = Math.floor(n % 1e9 / 1e6), k = Math.floor(n % 1e6 / 1e3), r = n % 1000; if (md) p.push(lt1000(md) + ' milliard' + (md > 1 ? 's' : '')); if (mi) p.push(lt1000(mi) + ' million' + (mi > 1 ? 's' : '')); if (k) p.push(k === 1 ? 'mille' : lt1000(k).replace(/(cent|vingt)s$/, '$1') + ' mille'); if (r) p.push(lt1000(r)); var s = p.join(' '); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ------------------------------------------------------------------ données d'exemple */
  var TARIFS0 = [
    { id: 'P-BUT', produit: 'Butane (GPL)', unite: 't', prix: 425000, famille: 'GPL', color: '#e8780c', densite: '0,58' },
    { id: 'P-SSP', produit: 'Super sans plomb', unite: 'm³', prix: 545000, famille: 'Carburants', color: '#2563eb', densite: '0,74' },
    { id: 'P-JET', produit: 'Kérosène / Jet A1', unite: 'm³', prix: 498000, famille: 'Carburéacteurs', color: '#7c3aed', densite: '0,80' },
    { id: 'P-GO', produit: 'Gasoil', unite: 'm³', prix: 489000, famille: 'Carburants', color: '#0f2d5c', densite: '0,84' },
    { id: 'P-FO', produit: 'Fioul (résidu atmosphérique)', unite: 't', prix: 262000, famille: 'Fiouls', color: '#475569', densite: '0,95' },
    { id: 'P-BIT', produit: 'Bitume 35/50', unite: 't', prix: 395000, famille: 'Bitumes', color: '#0e7490', densite: '1,03' }
  ];
  function seed() {
    var r0 = 11; function rnd() { r0 = (r0 * 16807) % 2147483647; return r0 / 2147483647; }
    var tar = TARIFS0.map(function (t) { return Object.assign({}, t, { maj: d(-48), historique: [{ date: d(-48), prix: t.prix, par: 'Clarisse Nzé', motif: 'Barème du mois (structure des prix)' }] }); });
    var P = {}; tar.forEach(function (t) { P[t.id] = t; });
    var C = {}; S.all('clients').forEach(function (c) { C[c.id] = c; });
    var plans = [
      { c: 'C-01', every: 12, start: 2, lines: [['P-GO', 2600], ['P-SSP', 1600]], pay: 'ontime', moyen: 'Camions-citernes' },
      { c: 'C-02', every: 14, start: 5, lines: [['P-GO', 2000], ['P-SSP', 1200]], pay: 'ontime', moyen: 'Camions-citernes' },
      { c: 'C-03', every: 18, start: 3, lines: [['P-GO', 1400], ['P-SSP', 900]], pay: 'late', moyen: 'Barge fluviale' },
      { c: 'C-04', every: 13, start: 1, lines: [['P-JET', 1700]], pay: 'ontime', moyen: 'Camions avitailleurs' },
      { c: 'C-05', every: 15, start: 4, lines: [['P-BUT', 1150]], pay: 'ontime', moyen: 'Camions GPL' },
      { c: 'C-06', every: 33, start: -150, lines: [['P-BIT', 650]], pay: 'bad', moyen: 'Camions calorifugés' },
      { c: 'C-07', every: 15, start: 6, lines: [['P-FO', 17500]], pay: 'ontime', moyen: 'Navire pétrolier' },
      { c: 'C-08', every: 24, start: 8, lines: [['P-GO', 720]], pay: 'partial', moyen: 'Camions-citernes' }
    ];
    var NAV = ['MT Ogooué Star', 'MT Atlantic Breeze', 'MT Cap Lopez', 'MT Mandji Spirit', 'MT Gulf Pioneer', 'MT Sette Cama', 'MT Iguéla'];
    var factures = [], enc = [], cmds = [], from = firstOfMonth(-3);
    plans.forEach(function (p, pi) {
      var c = C[p.c] || { delai: 30 };
      var cmd = { id: 'CC-' + Y + '-' + String(121 + pi).padStart(4, '0'), client: p.c, type: p.c === 'C-07' ? 'Contrat d\'enlèvement export (FOB)' : 'Contrat d\'enlèvement', date: E.addDays(p.start < 0 ? d(p.start) : from, -10), du: p.start < 0 ? d(p.start) : from, au: E.addDays(firstOfMonth(1), -1), lieu: p.c === 'C-07' ? 'Appontement SOGARA — Port-Gentil' : p.moyen === 'Barge fluviale' ? 'Appontement fluvial — Port-Gentil' : 'Rampe de chargement camions — Port-Gentil', moyen: p.moyen, statut: 'En cours d\'enlèvement', enlevements: [], lignes: [] };
      var t = p.start < 0 ? d(p.start) : E.addDays(from, p.start), k = 0, tot = {};
      while (t <= today()) {
        var ls = p.lines.map(function (l) { var q = Math.round(l[1] * (0.88 + rnd() * 0.24) / 50) * 50; tot[l[0]] = (tot[l[0]] || 0) + q; return { produit: l[0], qte: q }; });
        var el = { id: 'EL-' + cmd.id.slice(-4) + '-' + String(++k).padStart(2, '0'), date: t, lignes: ls, bl: (p.c === 'C-07' ? 'B/L ' : 'BL ') + (52000 + pi * 900 + k * 7), moyen: p.c === 'C-07' ? NAV[(k + pi) % NAV.length] : p.moyen, factureId: null };
        cmd.enlevements.push(el);
        if (t < d(-1)) {
          var fdate = E.addDays(t, 1); if (fdate > today()) fdate = today();
          var f = { id: '', client: p.c, date: fdate, echeance: E.addDays(fdate, c.delai || 30), commandeId: cmd.id, enlevementId: el.id, bl: el.bl, lieu: cmd.lieu, lignes: ls.map(function (l) { return { produit: l.produit, designation: P[l.produit].produit, qte: l.qte, unite: P[l.produit].unite, pu: P[l.produit].prix }; }), remise: 0, relances: [], _pay: p.pay };
          factures.push(f); el._f = f;
        }
        t = E.addDays(t, p.every + (k % 2 ? 1 : -1));
      }
      cmd.lignes = Object.keys(tot).map(function (pr) { return { produit: pr, qte: Math.round(tot[pr] * 1.35 / 100) * 100 }; });
      cmds.push(cmd);
    });
    factures.sort(function (a, b) { return a.date.localeCompare(b.date) || a.client.localeCompare(b.client); });
    var seq = {};
    factures.forEach(function (f) { var yy = f.date.slice(0, 4); seq[yy] = seq[yy] || (yy === String(Y) ? 380 : 900); f.id = 'FA-' + yy + '-' + String(++seq[yy]).padStart(4, '0'); });
    cmds.forEach(function (c) { c.enlevements.forEach(function (e) { if (e._f) { e.factureId = e._f.id; delete e._f; } }); });
    var ne = 0;
    function pay(f, date, montant, mode) { if (date > today()) return; if (date < f.date) date = f.date; enc.push({ id: '', factureId: f.id, client: f.client, date: date, montant: Math.round(montant), mode: mode || 'Virement', banque: ['BGFIBank Gabon', 'UGB', 'BICIG', 'Orabank Gabon'][(ne++) % 4], reference: '' }); }
    factures.forEach(function (f, i) {
      var ttc = Math.round(E.sum(f.lignes, function (l) { return l.qte * l.pu; }) * (1 + TVA)), j = i % 5;
      if (f._pay === 'ontime') pay(f, E.addDays(f.echeance, -j), ttc, f.client === 'C-05' && j === 2 ? 'Chèque' : 'Virement');
      else if (f._pay === 'late') pay(f, E.addDays(f.echeance, 19 + j), ttc);
      else if (f._pay === 'partial') { pay(f, f.echeance, ttc * 0.6); pay(f, E.addDays(f.echeance, 32), ttc * 0.4); }
      else if (f._pay === 'bad') { if (f.date > d(-75) && f.date < d(-40)) pay(f, E.addDays(f.echeance, 5), ttc * 0.5, 'Chèque'); }
      delete f._pay;
    });
    /* relances déjà envoyées */
    factures.forEach(function (f) {
      var paid = E.sum(enc.filter(function (e) { return e.factureId === f.id; }), 'montant'), ttc = Math.round(E.sum(f.lignes, function (l) { return l.qte * l.pu; }) * (1 + TVA));
      if (paid >= ttc - 1 || f.echeance >= today()) return; var j = E.daysBetween(f.echeance, today());
      if (j >= 9) f.relances.push({ niveau: 1, date: E.addDays(f.echeance, 7) + 'T09:30:00', par: 'Clarisse Nzé', canal: 'E-mail' });
      if (j >= 33 && f.client !== 'C-03') f.relances.push({ niveau: 2, date: E.addDays(f.echeance, 30) + 'T10:05:00', par: 'Clarisse Nzé', canal: 'Courrier recommandé' });
    });
    enc.sort(function (a, b) { return a.date.localeCompare(b.date); });
    enc.forEach(function (e, i) { e.id = 'EN-' + e.date.slice(0, 4) + '-' + String(300 + i).padStart(4, '0'); e.reference = (e.mode === 'Chèque' ? 'CHQ ' + (311200 + i * 17) : 'VIR-' + e.date.replace(/-/g, '').slice(2) + '-' + String(100 + (i * 37) % 900)); });
    /* commandes ponctuelles issues de devis */
    cmds.push({ id: 'CC-' + Y + '-0129', client: 'C-04', type: 'Commande ponctuelle', date: d(-9), du: d(4), au: d(34), lieu: 'Rampe de chargement camions — Port-Gentil', moyen: 'Camions avitailleurs', statut: 'Confirmée', devisId: 'DV-' + Y + '-0061', enlevements: [], lignes: [{ produit: 'P-JET', qte: 3000 }] });
    cmds.push({ id: 'CC-' + Y + '-0130', client: 'C-06', type: 'Commande ponctuelle', date: d(-20), du: d(-5), au: d(55), lieu: 'Rampe bitume — Port-Gentil', moyen: 'Camions calorifugés', statut: 'Confirmée', devisId: 'DV-' + Y + '-0062', enlevements: [], lignes: [{ produit: 'P-BIT', qte: 2400 }] });
    /* devis */
    function dv(n, c, off, val, objet, lignes, remise, statut, extra) { var o = { id: 'DV-' + Y + '-' + String(n).padStart(4, '0'), client: c, date: d(off), validite: d(off + val), objet: objet, lignes: lignes.map(function (l) { return { produit: l[0], qte: l[1], pu: l[2] || P[l[0]].prix }; }), remise: remise, conditions: 'Paiement à ' + ((C[c] || {}).delai || 30) + ' jours date de facture, par virement', lieu: c === 'C-07' ? 'FOB Appontement SOGARA — Port-Gentil' : 'Départ raffinerie — Port-Gentil', statut: statut, historique: [{ date: d(off), action: 'Création', user: 'Mamfoumbi Diane' }] }; Object.assign(o, extra || {}); if (statut !== 'Brouillon') o.historique.push({ date: d(off + 1), action: 'Envoyé au client', user: 'Mamfoumbi Diane' }); return o; }
    var devis = [
      dv(61, 'C-04', -16, 30, 'Renfort Jet A1 — saison haute du trafic aérien', [['P-JET', 3000]], 1.5, 'Converti', { commandeId: 'CC-' + Y + '-0129' }),
      dv(62, 'C-06', -28, 30, 'Bitume 35/50 — campagne routière Ngounié', [['P-BIT', 2400]], 2, 'Converti', { commandeId: 'CC-' + Y + '-0130' }),
      dv(63, 'C-08', -7, 30, 'Gasoil — alimentation de la centrale de Moanda (4e trimestre)', [['P-GO', 2100]], 1, 'Accepté'),
      dv(64, 'C-07', -4, 10, 'Cargaison spot de fioul — chargement fin de mois', [['P-FO', 32000, 258000]], 0, 'Envoyé'),
      dv(65, 'C-05', -10, 45, 'Butane — contrat annuel ' + (Y + 1), [['P-BUT', 14500]], 2.5, 'Envoyé'),
      dv(66, 'C-02', -1, 30, 'Super sans plomb — volumes additionnels fin d\'année', [['P-SSP', 4000], ['P-GO', 2500]], 1, 'Brouillon'),
      dv(67, 'C-01', -12, 14, 'Contrat d\'enlèvement T1 ' + (Y + 1) + ' — gasoil et super', [['P-GO', 24000], ['P-SSP', 15000]], 1.8, 'Envoyé'),
      dv(68, 'C-03', -35, 30, 'Gasoil — ouverture de stations à Lastoursville', [['P-GO', 1800]], 0, 'Refusé', { motif: 'Encours au-delà du plafond autorisé : offre conditionnée à une garantie bancaire.' }),
      dv(69, 'C-04', -45, 30, 'Jet A1 — avitaillement de l\'aéroport de Port-Gentil', [['P-JET', 1200]], 1, 'Envoyé')
    ];
    devis.forEach(function (o) { if (o.statut === 'Accepté' || o.statut === 'Converti') o.historique.push({ date: E.addDays(o.date, 4), action: 'Accepté par le client', user: 'Ella Stéphane' }); if (o.statut === 'Converti') o.historique.push({ date: E.addDays(o.date, 6), action: 'Converti en commande ' + o.commandeId, user: 'Mamfoumbi Diane' }); if (o.statut === 'Refusé') o.historique.push({ date: E.addDays(o.date, 6), action: 'Refusé : ' + o.motif, user: 'Ella Stéphane' }); });
    /* historique comptable mensuel (mois clos) */
    var live = {}, cnt = 0; factures.forEach(function (f) { var m = f.date.slice(0, 7); if (m === firstOfMonth(-2).slice(0, 7) || m === firstOfMonth(-1).slice(0, 7)) { f.lignes.forEach(function (l) { live[l.produit] = (live[l.produit] || 0) + l.qte * l.pu; }); } });
    Object.keys(live).forEach(function (k) { live[k] /= 2; });
    var fac = [0.92, 0.95, 1.04, 0.9, 0.97, 1.06, 1.02, 0.94, 1.08, 1.01, 0.98];
    var ca = [];
    for (var k = 12; k >= 3; k--) {
      var dt = new Date(E.TODAY.getFullYear(), E.TODAY.getMonth() - k, 1), key = E.iso(dt).slice(0, 7), pr = {}, fct = fac[k % fac.length];
      Object.keys(live).forEach(function (p, j) { pr[p] = Math.round(live[p] * fct * (0.94 + ((k * 7 + j * 3) % 12) / 100)); });
      var tot = E.sum(Object.keys(pr), function (p) { return pr[p]; });
      ca.push({ id: 'CA-' + key, mois: key, produits: pr, total: tot, encaisse: Math.round(tot * (1 + TVA) * (0.95 + ((k * 5) % 9) / 100)), factures: 22 + (k * 3) % 7 });
    }
    return { tarifs: tar, devisClients: devis, commandesClients: cmds, factures: factures, encaissements: enc, caMensuel: ca };
  }

  /* ------------------------------------------------------------------ calculs */
  function facts() { return S.all('factures'); }
  function encs() { return S.all('encaissements'); }
  function lineHT(l) { return (+l.qte || 0) * (+l.pu || 0); }
  function faHT(f) { return Math.round(E.sum(f.lignes, lineHT) * (1 - (f.remise || 0) / 100)); }
  function faTVA(f) { return Math.round(faHT(f) * TVA); }
  function faTTC(f) { return faHT(f) + faTVA(f); }
  function paid(f) { return E.sum(encs().filter(function (e) { return e.factureId === f.id; }), 'montant'); }
  function reste(f) { return Math.max(0, faTTC(f) - paid(f)); }
  function statut(f) { var r = reste(f); if (r <= 1) return 'Payée'; if (f.echeance < today()) return 'Échue'; if (paid(f) > 0) return 'Partiellement payée'; return 'Émise'; }
  function retardJ(f) { return E.daysBetween(f.echeance, today()); }
  var NIV = { 1: 'Relance amiable (J+7)', 2: 'Relance ferme (J+30)', 3: 'Mise en demeure (J+60)' };
  function niveauDu(f) { var j = retardJ(f); return j >= 60 ? 3 : j >= 30 ? 2 : j >= 7 ? 1 : 0; }
  function lastRel(f) { return Math.max.apply(null, [0].concat((f.relances || []).map(function (r) { return r.niveau; }))); }
  function relanceDue(f) { return statut(f) === 'Échue' && niveauDu(f) > lastRel(f); }
  function openF() { return facts().filter(function (f) { return reste(f) > 1; }); }
  function encours(cid) { return E.sum(openF().filter(function (f) { return !cid || f.client === cid; }), reste); }
  function echu(cid) { return E.sum(openF().filter(function (f) { return (!cid || f.client === cid) && f.echeance < today(); }), reste); }
  var AGES = [{ l: 'Non échu', c: '#2563eb', f: function (j) { return j <= 0; } }, { l: '0-30 j', c: '#f5c400', f: function (j) { return j > 0 && j <= 30; } }, { l: '31-60 j', c: '#e8780c', f: function (j) { return j > 30 && j <= 60; } }, { l: '61-90 j', c: '#d93636', f: function (j) { return j > 60 && j <= 90; } }, { l: '+90 j', c: '#7f1d1d', f: function (j) { return j > 90; } }];
  function aging(cid) { var b = AGES.map(function () { return 0; }); openF().filter(function (f) { return !cid || f.client === cid; }).forEach(function (f) { var j = retardJ(f); AGES.forEach(function (a, i) { if (a.f(j)) b[i] += reste(f); }); }); return b; }
  function caPeriod(a, b, cid) { return E.sum(facts().filter(function (f) { return f.date >= a && f.date <= b && (!cid || f.client === cid); }), faHT); }
  function dso() { var ttc90 = E.sum(facts().filter(function (f) { return f.date > d(-90); }), faTTC); return ttc90 ? encours() / ttc90 * 90 : 0; }
  function monthly(end) {
    var H = {}; S.all('caMensuel').forEach(function (h) { H[h.mois] = h; });
    return months12(end).map(function (m) {
      if (H[m.key]) return { label: m.label, key: m.key, produits: H[m.key].produits, total: H[m.key].total, enc: H[m.key].encaisse };
      var pr = {}, fs = facts().filter(function (f) { return f.date.slice(0, 7) === m.key; });
      fs.forEach(function (f) { var k = 1 - (f.remise || 0) / 100; f.lignes.forEach(function (l) { pr[l.produit] = (pr[l.produit] || 0) + lineHT(l) * k; }); });
      return { label: m.label, key: m.key, produits: pr, total: E.sum(fs, faHT), enc: E.sum(encs().filter(function (e) { return e.date.slice(0, 7) === m.key; }), 'montant') };
    });
  }
  function devisHT(o) { return Math.round(E.sum(o.lignes, lineHT) * (1 - (o.remise || 0) / 100)); }
  function devisStatut(o) { return o.statut === 'Envoyé' && o.validite < today() ? 'Expiré' : o.statut; }
  function cmdQte(c, pr) { return E.sum(c.enlevements, function (e) { return E.sum(e.lignes.filter(function (l) { return l.produit === pr; }), 'qte'); }); }
  function cmdPct(c) { var t = E.sum(c.lignes, 'qte'); return t ? E.sum(c.lignes, function (l) { return Math.min(l.qte, cmdQte(c, l.produit)); }) / t * 100 : 0; }
  function aFacturer(c) { return c.enlevements.filter(function (e) { return !e.factureId; }); }
  function cmdsAll() { return S.all('commandesClients'); }

  /* ------------------------------------------------------------------ documents */
  function docHead(title, num, date, extra) {
    return '<div class="doc__head"><div class="fin-doc-brand"><img src="../assets/img/logo.png" alt="SOGARA"><div><b>SOGARA</b><span>Société Gabonaise de Raffinage</span><span>Route du Dahu · B.P. 530 · Port-Gentil, Gabon</span><span>Direction commerciale & Direction financière</span></div></div>' +
      '<div class="fin-doc-title"><h4>' + esc(title) + '</h4><div>N° <b>' + esc(num) + '</b></div><div>Date : ' + F.date(date) + '</div>' + (extra || '') + '</div></div>';
  }
  function printModal(m) { document.body.classList.add('fin-printing'); m.el.classList.add('fin-print-target'); try { window.print(); } finally { setTimeout(function () { document.body.classList.remove('fin-printing'); m.el.classList.remove('fin-print-target'); }, 300); } }
  function linesTable(lignes) {
    return '<div class="tbl-wrap"><table class="fin-doc-tbl"><thead><tr><th>#</th><th>Produit</th><th class="num">Quantité</th><th>Unité</th><th class="num">Prix unitaire HT</th><th class="num">Montant HT</th></tr></thead><tbody>' +
      lignes.map(function (l, i) { var t = tarif(l.produit); return '<tr><td>' + (i + 1) + '</td><td>' + esc(l.designation || t.produit) + '</td><td class="num">' + F.num(l.qte) + '</td><td>' + esc(l.unite || t.unite) + '</td><td class="num">' + F.num(l.pu) + '</td><td class="num">' + F.num(lineHT(l)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function totals(brut, remise) {
    var ht = Math.round(brut * (1 - (remise || 0) / 100)), tva = Math.round(ht * TVA), ttc = ht + tva;
    return '<div class="fin-doc-tot">' + (remise ? '<div><span>Total brut HT</span><b>' + F.money(brut) + '</b></div><div><span>Remise ' + F.num(remise, 1) + ' %</span><b>− ' + F.money(brut - ht) + '</b></div>' : '') + '<div><span>Total HT</span><b>' + F.money(ht) + '</b></div><div><span>TVA 18 % <span class="fin-demo">taux à paramétrer</span></span><b>' + F.money(tva) + '</b></div><div class="ttc"><span>Total TTC</span><span>' + F.money(ttc) + '</span></div></div>' +
      '<div class="fin-doc-words">Arrêté à la somme de : <b>' + esc(enLettres(ttc)) + ' francs CFA TTC</b>.</div>';
  }
  function clientBlock(c) { return '<div><small>Client</small><b>' + esc(c.nom) + '</b><br>' + esc(c.type) + '<br>' + esc(c.ville) + '<br>Code client : ' + esc(c.id) + '</div>'; }
  function factureDoc(f) {
    var c = cl(f.client);
    return '<div class="doc fin-doc">' + docHead('FACTURE', f.id, f.date, '<div>Échéance : <b>' + F.date(f.echeance) + '</b></div>') +
      '<div class="fin-doc-parties">' + clientBlock(c) + '<div><small>Références</small>' + (f.commandeId ? 'Commande / contrat : ' + esc(f.commandeId) + '<br>' : '') + (f.bl ? 'Enlèvement : ' + esc(f.bl) + '<br>' : '') + 'Lieu : ' + esc(f.lieu || 'Raffinerie de Port-Gentil') + '<br>Conditions : paiement à ' + (c.delai || 30) + ' jours</div></div>' +
      linesTable(f.lignes) + totals(E.sum(f.lignes, lineHT), f.remise) +
      '<div class="fin-doc-cond"><b>Modalités de règlement</b><ul><li>Règlement par virement au compte SOGARA — BGFIBank Gabon, en rappelant le numéro de facture.</li><li>Quantités facturées selon les certificats de jaugeage / bons de livraison contradictoires, ramenées à 15 °C.</li><li>Tout retard de paiement entraîne des pénalités au taux légal et peut conduire à la suspension des enlèvements.</li><li>Prix de cession de démonstration ; TVA et taxes spécifiques sur produits pétroliers à paramétrer selon le régime fiscal applicable.</li></ul></div>' +
      '<div class="fin-doc-sign"><div>La Directrice financière<br><b>Clarisse Nzé</b><em>✓ Facture émise</em></div><div>Cachet de la société</div></div>' +
      '<div class="fin-doc-foot">SOGARA — Société Gabonaise de Raffinage · Route du Dahu, B.P. 530, Port-Gentil · Document de démonstration</div></div>';
  }
  function devisDoc(o) {
    var c = cl(o.client);
    return '<div class="doc fin-doc">' + docHead('OFFRE COMMERCIALE', o.id, o.date, '<div>Valable jusqu\'au : <b>' + F.date(o.validite) + '</b></div>') +
      '<div class="fin-doc-parties">' + clientBlock(c) + '<div><small>Objet</small><b>' + esc(o.objet) + '</b><br>Lieu de livraison : ' + esc(o.lieu) + '<br>' + esc(o.conditions) + '</div></div>' +
      linesTable(o.lignes) + totals(E.sum(o.lignes, lineHT), o.remise) +
      '<div class="fin-doc-cond"><b>Conditions de l\'offre</b><ul><li>Prix de cession <span class="fin-demo">prix de démonstration</span> hors taxes spécifiques, révisables selon la structure officielle des prix.</li><li>Qualité conforme aux spécifications nationales en vigueur ; certificat d\'analyse du laboratoire SOGARA remis à chaque enlèvement.</li><li>Enlèvements programmés avec le service Expéditions au moins 72 heures à l\'avance.</li><li>Offre soumise à l\'acceptation du plafond d\'encours du client par la Direction financière.</li></ul></div>' +
      '<div class="fin-doc-sign"><div>La Responsable commerciale<br><b>Diane Mamfoumbi</b></div><div>Bon pour accord — le client<br><span class="muted">(date, nom, signature)</span></div></div>' +
      '<div class="fin-doc-foot">SOGARA — Société Gabonaise de Raffinage · Route du Dahu, B.P. 530, Port-Gentil · Document de démonstration</div></div>';
  }
  function relanceDoc(f, niv) {
    var c = cl(f.client), lst = openF().filter(function (x) { return x.client === f.client && x.echeance < today(); }), tot = E.sum(lst, reste);
    var txt = niv === 3 ? '<p>Malgré nos précédentes relances restées sans effet, nous constatons que les factures ci-dessous demeurent impayées. <b>Nous vous mettons en demeure</b> de procéder à leur règlement intégral, soit <b>' + F.money(tot) + '</b>, dans un délai de <b>huit (8) jours</b> à compter de la réception du présent courrier.</p><p>À défaut, nous serons contraints de suspendre tout nouvel enlèvement et d\'engager les procédures de recouvrement prévues au contrat, les pénalités de retard restant exigibles.</p>'
      : niv === 2 ? '<p>Sauf erreur ou omission de notre part, les factures ci-dessous restent impayées à ce jour malgré notre premier rappel. Nous vous demandons de bien vouloir procéder à leur règlement, soit <b>' + F.money(tot) + '</b>, <b>sous quinze (15) jours</b>.</p><p>Nous attirons votre attention sur le fait que votre encours conditionne la poursuite des enlèvements.</p>'
        : '<p>Sauf erreur de notre part, le règlement des factures ci-dessous, arrivées à échéance, ne nous est pas encore parvenu. Nous vous remercions de bien vouloir procéder à leur paiement, soit <b>' + F.money(tot) + '</b>, dans les meilleurs délais.</p><p>Si votre règlement a été effectué entre-temps, nous vous prions de ne pas tenir compte du présent rappel.</p>';
    return '<div class="doc fin-doc fin-letter">' + docHead(niv === 3 ? 'MISE EN DEMEURE' : 'RELANCE', f.id + '-R' + niv, today(), '<div>' + esc(NIV[niv]) + '</div>') +
      '<div class="fin-doc-parties">' + clientBlock(c) + '<div><small>Contact</small>Direction financière — recouvrement<br>Clarisse Nzé, Directrice financière<br>Port-Gentil, le ' + F.date(today()) + '</div></div>' +
      '<p><b>Objet : ' + (niv === 3 ? 'mise en demeure de payer' : 'relance — factures échues') + '</b></p><p>Madame, Monsieur,</p>' + txt +
      '<div class="tbl-wrap"><table class="fin-doc-tbl"><thead><tr><th>Facture</th><th>Date</th><th>Échéance</th><th class="num">Retard</th><th class="num">Reste dû TTC</th></tr></thead><tbody>' + lst.map(function (x) { return '<tr><td>' + x.id + '</td><td>' + F.dateShort(x.date) + '</td><td>' + F.dateShort(x.echeance) + '</td><td class="num">' + retardJ(x) + ' j</td><td class="num">' + F.num(reste(x)) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="fin-doc-tot"><div class="ttc"><span>Total échu</span><span>' + F.money(tot) + '</span></div></div>' +
      '<p style="margin-top:14px">Nous vous prions d\'agréer, Madame, Monsieur, l\'expression de nos salutations distinguées.</p>' +
      '<div class="fin-doc-sign"><div>La Directrice financière<br><b>Clarisse Nzé</b></div></div><div class="fin-doc-foot">SOGARA — Route du Dahu, B.P. 530, Port-Gentil · Document de démonstration</div></div>';
  }

  /* ------------------------------------------------------------------ éditeur de lignes produits */
  function prodEditor(id, lines, onChange) {
    var T = S.all('tarifs');
    function row(l) { var t = tarif(l.produit || T[0].id); return '<div class="fin-le__row"><select class="select" data-f="produit">' + T.map(function (x) { return '<option value="' + x.id + '"' + (x.id === (l.produit || T[0].id) ? ' selected' : '') + '>' + esc(x.produit) + '</option>'; }).join('') + '</select><input class="input" data-f="qte" type="number" min="0" step="any" placeholder="Quantité" value="' + (l.qte != null ? l.qte : '') + '"><input class="input" data-f="unite" value="' + esc(t.unite) + '" readonly tabindex="-1"><input class="input" data-f="pu" type="number" min="0" step="any" value="' + (l.pu != null ? l.pu : t.prix) + '"><button type="button" class="btn ghost icon" data-le-del aria-label="Supprimer la ligne">' + ic('trash') + '</button></div>'; }
    var html = '<div class="fin-le" id="' + id + '"><div class="fin-le__head"><span>Produit</span><span>Quantité</span><span>Unité</span><span>Prix HT / unité</span><span></span></div><div class="fin-le__rows">' + (lines && lines.length ? lines : [{}]).map(row).join('') + '</div><div class="fin-le__foot"><button type="button" class="btn sm" data-le-add>' + ic('plus') + 'Ajouter un produit</button><div class="fin-le__tot">Total brut HT : <b data-le-tot>—</b></div></div></div>';
    function el() { return document.getElementById(id); }
    function read() { return E.$$('.fin-le__row', el()).map(function (r) { var p = r.querySelector('[data-f=produit]').value, t = tarif(p); return { produit: p, designation: t.produit, unite: t.unite, qte: +r.querySelector('[data-f=qte]').value || 0, pu: +r.querySelector('[data-f=pu]').value || 0 }; }).filter(function (l) { return l.qte > 0; }); }
    function upd() { var t = E.sum(read(), lineHT); el().querySelector('[data-le-tot]').textContent = F.money(t); if (onChange) onChange(t); }
    function bind() {
      var root = el();
      root.addEventListener('click', function (e) { if (e.target.closest('[data-le-add]')) { root.querySelector('.fin-le__rows').insertAdjacentHTML('beforeend', row({})); upd(); } var dl = e.target.closest('[data-le-del]'); if (dl) { if (E.$$('.fin-le__row', root).length > 1) dl.closest('.fin-le__row').remove(); upd(); } });
      root.addEventListener('change', function (e) { var s = e.target.closest('[data-f=produit]'); if (s) { var t = tarif(s.value), r = s.closest('.fin-le__row'); r.querySelector('[data-f=unite]').value = t.unite; r.querySelector('[data-f=pu]').value = t.prix; upd(); } });
      root.addEventListener('input', upd); upd();
    }
    return { html: html, bind: bind, read: read };
  }

  /* ------------------------------------------------------------------ vue */
  var TABS = [{ k: 'dashboard', l: 'Tableau de bord' }, { k: 'devis', l: 'Devis' }, { k: 'commandes', l: 'Commandes & enlèvements' }, { k: 'factures', l: 'Factures' }, { k: 'encaissements', l: 'Encaissements' }, { k: 'relances', l: 'Relances' }, { k: 'clients', l: 'Encours & risque' }, { k: 'tarifs', l: 'Tarifs' }];
  var st = { tab: 'dashboard', f: {}, lim: {} }, viewEl = null;
  function render(view, params) {
    viewEl = view; params = params || []; var tab = params[0] || 'dashboard'; if (!TABS.some(function (t) { return t.k === tab; })) tab = 'dashboard';
    if (st.tab !== tab) st.lim = {}; st.tab = tab; draw();
    if (params[1]) { var id = decodeURIComponent(params[1]); setTimeout(function () { ({ devis: openDevis, commandes: openCmd, factures: openFacture, relances: openFacture, encaissements: openFacture, clients: openClient, tarifs: editTarif })[tab](id, true); }, 30); }
  }
  function afterClose() { var p = location.hash.replace(/^#\/?/, '').split('/'); if (p[0] === MOD && p.length > 2) history.replaceState(null, '', '#/' + MOD + '/' + p[1]); }
  function refresh() { if (viewEl && location.hash.replace(/^#\/?/, '').split('/')[0] === MOD) draw(); E.renderBadges(); }
  function paged(key, rows) { var lim = st.lim[key] || 25; return { rows: rows.slice(0, lim), more: rows.length > lim ? '<div class="fin-more"><button class="btn sm" data-act="more" data-k="' + key + '">Afficher plus (' + (rows.length - lim) + ' restantes)</button></div>' : '' }; }
  function chips(g, list, cur) { return '<div class="chips">' + list.map(function (v) { return '<button class="chip' + (cur === v ? ' is-active' : '') + '" data-act="chip" data-g="' + g + '" data-v="' + esc(v) + '">' + esc(v) + '</button>'; }).join('') + '</div>'; }
  function clientSelect(id, cur) { return '<select class="select" id="' + id + '"><option value="">Tous les clients</option>' + S.all('clients').map(function (c) { return '<option value="' + c.id + '"' + (cur === c.id ? ' selected' : '') + '>' + esc(c.nom) + '</option>'; }).join('') + '</select>'; }

  function draw() {
    var v = viewEl, u = user(), due = facts().filter(relanceDue).length, af = E.sum(cmdsAll(), function (c) { return aFacturer(c).length; });
    var acts = '';
    if (st.tab === 'devis' || st.tab === 'dashboard') acts += '<button class="btn primary" data-act="new-devis">' + ic('plus') + 'Nouveau devis</button>';
    if (st.tab === 'factures') acts += '<button class="btn primary" data-act="new-fa">' + ic('plus') + 'Nouvelle facture</button>';
    if (st.tab === 'encaissements' || st.tab === 'factures') acts += '<button class="btn' + (st.tab === 'encaissements' ? ' primary' : '') + '" data-act="new-enc">' + ic('money') + 'Encaissement</button>';
    if (st.tab === 'commandes') acts += '<button class="btn primary" data-act="new-cmd">' + ic('plus') + 'Nouvelle commande</button>';
    if (['factures', 'encaissements', 'devis', 'clients'].indexOf(st.tab) >= 0) acts += '<button class="btn" data-act="csv">' + ic('download') + 'Export CSV</button>';
    v.innerHTML = '<div class="fin-root" id="ven-root"><div class="fin-head"><div><h2>Clients, devis & facturation</h2><p>Order-to-cash : offre commerciale, commande, enlèvement, facture, encaissement, recouvrement.</p></div><div class="row"><span class="fin-who">' + U.avatar(u.name || '?', u.color, true) + '<span><b>' + esc(u.name || '') + '</b> · ' + esc(u.role || '') + '</span></span>' + acts + '</div></div>' +
      U.tabs(TABS.map(function (t) { return { k: t.k, l: t.l, n: t.k === 'relances' ? due || null : t.k === 'commandes' ? af || null : t.k === 'factures' ? facts().filter(function (f) { return statut(f) === 'Échue'; }).length || null : null }; }), st.tab, function (k) { E.go(MOD + '/' + k); }) + '<div id="ven-body"></div></div>';
    var body = v.querySelector('#ven-body');
    ({ dashboard: vDash, devis: vDevis, commandes: vCmd, factures: vFact, encaissements: vEnc, relances: vRel, clients: vClients, tarifs: vTarifs })[st.tab](body);
    var root = v.querySelector('#ven-root');
    root.addEventListener('click', function (e) {
      var a = e.target.closest('[data-act]'); if (!a || !root.contains(a)) return; var act = a.dataset.act, id = a.dataset.id;
      if (act === 'new-devis') newDevis();
      else if (act === 'new-fa') newFacture();
      else if (act === 'new-enc') newEnc();
      else if (act === 'new-cmd') newCmd();
      else if (act === 'csv') exportTab();
      else if (act === 'go') E.go(MOD + '/' + a.dataset.k);
      else if (act === 'fa') openFacture(id);
      else if (act === 'dv') openDevis(id);
      else if (act === 'cc') openCmd(id);
      else if (act === 'cli') openClient(id);
      else if (act === 'tar') editTarif(id);
      else if (act === 'rel') sendRelance(id);
      else if (act === 'rel-all') relanceAll();
      else if (act === 'chip') { st.f[a.dataset.g] = a.dataset.v; st.lim = {}; draw(); }
      else if (act === 'more') { st.lim[a.dataset.k] = (st.lim[a.dataset.k] || 25) + 25; draw(); }
    });
  }

  /* ------------------------------------------------------------------ tableau de bord */
  function vDash(body) {
    var ca30 = caPeriod(d(-29), today()), caP = caPeriod(d(-59), d(-30)), var30 = caP ? (ca30 / caP - 1) * 100 : 0;
    var mo = monthly(), cum = E.sum(mo.filter(function (m) { return m.key.slice(0, 4) === String(Y); }), 'total');
    var enc = encours(), ech = echu(), ds = dso(), enc30 = E.sum(encs().filter(function (e) { return e.date > d(-30); }), 'montant');
    var kp = '<div class="fin-kpis">' +
      U.kpi({ label: 'CA facturé · 30 derniers jours', value: F.short(ca30), unit: 'FCFA HT', icon: 'invoice', tone: 'blue', foot: '<span class="' + (var30 >= 0 ? 'up' : 'down') + '">' + (var30 >= 0 ? '▲ +' : '▼ ') + F.num(var30, 1) + ' %</span> vs 30 j précédents' }) +
      U.kpi({ label: 'Cumul ' + Y + ' (à date)', value: F.short(cum), unit: 'FCFA HT', icon: 'trend', tone: 'navy', foot: 'projection annuelle ≈ ' + M(cum / (E.TODAY.getMonth() + E.TODAY.getDate() / 30) * 12) }) +
      U.kpi({ label: 'Encaissé · 30 jours', value: F.short(enc30), unit: 'FCFA', icon: 'money', tone: 'green', foot: encs().filter(function (e) { return e.date > d(-30); }).length + ' règlement(s)' }) +
      U.kpi({ label: 'Encours clients', value: F.short(enc), unit: 'FCFA TTC', icon: 'wallet', tone: 'orange', foot: '<span class="down">' + M(ech) + ' échus</span>' }) +
      U.kpi({ label: 'DSO (délai moyen d\'encaissement)', value: F.num(ds, 0), unit: 'jours', icon: 'clock', tone: ds > 40 ? 'red' : 'violet', foot: 'objectif ≤ 35 j' }) + '</div>';
    var dv = S.all('devisClients'), cmd = cmdsAll(), af = E.sum(cmd, function (c) { return aFacturer(c).length; }), fe = facts().filter(function (f) { return statut(f) === 'Échue'; });
    var flow = [
      { k: 'devis', l: 'Devis en cours', n: dv.filter(function (o) { return devisStatut(o) === 'Envoyé' || o.statut === 'Accepté'; }).length, s: M(E.sum(dv.filter(function (o) { return devisStatut(o) === 'Envoyé' || o.statut === 'Accepté'; }), devisHT)), c: 'var(--blue)' },
      { k: 'commandes', l: 'Contrats actifs', n: cmd.filter(function (c) { return c.statut !== 'Clôturée'; }).length, s: 'commandes & enlèvements', c: 'var(--violet)' },
      { k: 'commandes', l: 'Enlèvements à facturer', n: af, s: af ? 'à facturer aujourd\'hui' : 'à jour', c: 'var(--orange)' },
      { k: 'factures', l: 'Factures non échues', n: openF().filter(function (f) { return f.echeance >= today(); }).length, s: M(enc - ech), c: 'var(--navy-3)' },
      { k: 'relances', l: 'Factures échues', n: fe.length, s: M(ech) + ' · ' + facts().filter(relanceDue).length + ' relance(s) dues', c: 'var(--red)' },
      { k: 'encaissements', l: 'Encaissé 30 j', n: F.short(enc30), s: 'FCFA', c: 'var(--green)' }
    ];
    var flowH = '<div class="card"><div class="card__h"><h3>Chaîne order-to-cash</h3><span class="sub">de l\'offre à l\'encaissement</span></div><div class="card__b"><div class="fin-flow">' + flow.map(function (x) { return '<button class="fin-flow__s' + ((x.l === 'Factures échues' || x.l === 'Enlèvements à facturer') && x.n ? ' hot' : '') + '" style="--c:' + x.c + '" data-act="go" data-k="' + x.k + '"><small>' + esc(x.l) + '</small><b>' + x.n + '</b><span>' + esc(x.s) + '</span></button>'; }).join('') + '</div></div></div>';
    var T = S.all('tarifs');
    var stacked = U.bars({ labels: mo.map(function (m) { return m.label; }), series: T.map(function (t) { return { name: t.produit, color: t.color, values: mo.map(function (m) { return m.produits[t.id] || 0; }) }; }), stacked: true, money: true, height: 240 });
    var cumP = {}; mo.filter(function (m) { return m.key.slice(0, 4) === String(Y); }).forEach(function (m) { Object.keys(m.produits).forEach(function (p) { cumP[p] = (cumP[p] || 0) + m.produits[p]; }); });
    var donut = U.donut(T.map(function (t) { return { label: t.produit, value: cumP[t.id] || 0, color: t.color }; }).filter(function (x) { return x.value > 0; }).sort(function (a, b) { return b.value - a.value; }), { money: true, center: F.short(cum), sub: 'FCFA HT ' + Y });
    var mo2 = monthly(1); var line = U.line({ labels: mo2.map(function (m) { return m.label; }), series: [{ name: 'Facturation TTC', values: mo2.map(function (m) { return Math.round(m.total * (1 + TVA)); }), color: '#163b75' }, { name: 'Encaissements', values: mo2.map(function (m) { return m.enc; }), color: '#1e9e4a' }], height: 220 });
    var tops = S.all('clients').map(function (c) { return { c: c, v: caPeriod(d(-89), today(), c.id) }; }).sort(function (a, b) { return b.v - a.v; }), maxV = tops[0] ? tops[0].v || 1 : 1;
    var topH = '<div class="card"><div class="card__h"><h3>Top clients</h3><span class="sub">CA HT · 90 jours</span></div><div class="list">' + tops.slice(0, 6).map(function (t) { return '<div class="list__item" data-act="cli" data-id="' + t.c.id + '" style="cursor:pointer">' + U.avatar(t.c.nom, null, true) + '<div class="list__body"><b>' + esc(t.c.nom) + '</b><div class="small muted">' + esc(t.c.type) + '</div>' + U.progress(t.v / maxV * 100) + '</div><div class="right"><b>' + F.short(t.v) + '</b><div class="small muted">FCFA</div></div></div>'; }).join('') + '</div></div>';
    var feH = '<div class="card"><div class="card__h"><h3>Factures échues</h3><span class="sub">' + fe.length + ' · ' + M(ech) + '</span><span class="spacer"></span><button class="btn sm ghost" data-act="go" data-k="relances">Relances</button></div><div class="list">' + (fe.length ? fe.sort(function (a, b) { return retardJ(b) - retardJ(a); }).slice(0, 7).map(function (f) { return '<div class="list__item" data-act="fa" data-id="' + f.id + '" style="cursor:pointer"><div class="list__icon ' + (retardJ(f) > 60 ? 'tone-red' : 'tone-orange') + '">' + ic('alert') + '</div><div class="list__body"><b>' + f.id + ' · ' + esc(clNom(f.client)) + '</b><div class="small muted">échue depuis ' + retardJ(f) + ' j · ' + (lastRel(f) ? 'dernière relance : niveau ' + lastRel(f) : 'non relancée') + '</div></div><div class="right"><b>' + F.short(reste(f)) + '</b><div class="small muted">FCFA</div></div></div>'; }).join('') : '<div class="empty">Aucune facture échue</div>') + '</div></div>';
    body.innerHTML = '<div class="stack">' + kp + flowH +
      '<div class="grid g-2-1"><div class="card"><div class="card__h"><h3>Évolution mensuelle du chiffre d\'affaires</h3><span class="sub">12 mois · HT par produit · mois en cours partiel</span></div><div class="card__b">' + stacked + '</div></div><div class="card"><div class="card__h"><h3>CA par produit</h3><span class="sub">cumul ' + Y + '</span></div><div class="card__b">' + donut + '</div></div></div>' +
      '<div class="grid g-2-1"><div class="card"><div class="card__h"><h3>Encaissements vs facturation</h3><span class="sub">TTC · 12 derniers mois clos</span></div><div class="card__b">' + line + '</div></div>' + topH + '</div>' +
      '<div class="grid g2 stack-m">' + feH + riskCard(true) + '</div></div>';
  }

  /* ------------------------------------------------------------------ devis */
  var DV_FLOW = ['Brouillon', 'Envoyé', 'Accepté', 'Converti'];
  function vDevis(body) {
    var all = S.all('devisClients'), s = st.f.dvS || 'Tous', q = E.norm(st.f.dvQ || '');
    var rows = all.filter(function (o) { return (s === 'Tous' || devisStatut(o) === s) && (!q || E.norm(o.id + ' ' + o.objet + ' ' + clNom(o.client)).indexOf(q) >= 0); }).sort(function (a, b) { return b.date.localeCompare(a.date); });
    st.dvRows = rows;
    var pipe = all.filter(function (o) { var x = devisStatut(o); return x === 'Envoyé' || x === 'Accepté'; }), conv = all.filter(function (o) { return o.statut === 'Converti'; }), dec = all.filter(function (o) { return ['Converti', 'Accepté', 'Refusé'].indexOf(o.statut) >= 0; });
    body.innerHTML = '<div class="fin-kpis" style="margin-bottom:16px">' + U.kpi({ label: 'Offres en cours', value: pipe.length, icon: 'send', tone: 'blue', foot: M(E.sum(pipe, devisHT)) + ' HT' }) + U.kpi({ label: 'Taux de transformation', value: F.num(dec.length ? (all.filter(function (o) { return o.statut === 'Converti' || o.statut === 'Accepté'; }).length / dec.length * 100) : 0), unit: '%', icon: 'target', tone: 'green', foot: conv.length + ' converti(s) en commande' }) + U.kpi({ label: 'Offres expirées', value: all.filter(function (o) { return devisStatut(o) === 'Expiré'; }).length, icon: 'clock', tone: 'orange', foot: 'à relancer ou renouveler' }) + '</div>' +
      '<div class="card"><div class="card__b"><div class="filters"><input class="input" id="dv-q" type="search" placeholder="Rechercher (n°, client, objet)" value="' + esc(st.f.dvQ || '') + '" style="max-width:320px"></div>' + chips('dvS', ['Tous', 'Brouillon', 'Envoyé', 'Accepté', 'Converti', 'Refusé', 'Expiré'], s) + '</div>' +
      U.table(DV_COLS, rows, { onRow: function (o) { openDevis(o.id); }, empty: 'Aucun devis' }) + '</div>';
    body.querySelector('#dv-q').addEventListener('change', function (e) { st.f.dvQ = e.target.value; draw(); });
  }
  var DV_COLS = [
    { label: 'N°', render: function (o) { return '<span class="mono fin-strong">' + o.id + '</span><span class="fin-sub">' + F.date(o.date) + '</span>'; }, csv: function (o) { return o.id; } },
    { label: 'Client / objet', render: function (o) { return '<span class="fin-strong">' + esc(clNom(o.client)) + '</span><span class="fin-sub">' + esc(o.objet) + '</span>'; }, csv: function (o) { return clNom(o.client) + ' — ' + o.objet; } },
    { label: 'Produits', render: function (o) { return o.lignes.map(function (l) { return F.num(l.qte) + ' ' + tarif(l.produit).unite + ' ' + esc(tarif(l.produit).produit); }).join('<br>'); }, csv: function (o) { return o.lignes.map(function (l) { return l.qte + ' ' + tarif(l.produit).produit; }).join(' + '); } },
    { label: 'Montant HT', num: true, render: function (o) { return '<b>' + F.money(devisHT(o)) + '</b>' + (o.remise ? '<span class="fin-sub">remise ' + F.num(o.remise, 1) + ' %</span>' : ''); }, csv: devisHT },
    { label: 'Validité', render: function (o) { var j = E.daysBetween(today(), o.validite); return F.date(o.validite) + (o.statut === 'Envoyé' && j >= 0 && j <= 5 ? ' ' + U.badge('J-' + j, 'orange') : ''); }, csv: function (o) { return o.validite; } },
    { label: 'Statut', render: function (o) { return B(devisStatut(o)); }, csv: devisStatut }
  ];
  function openDevis(id, fromUrl) {
    var o = S.get('devisClients', id); if (!o) return; var s = devisStatut(o), idx = s === 'Refusé' ? 2 : s === 'Expiré' ? 1 : DV_FLOW.indexOf(o.statut);
    var c = cl(o.client), enc = encours(c.id), after = enc + Math.round(devisHT(o) * (1 + TVA));
    var html = '<div class="row" style="margin-bottom:12px">' + B(s) + '<span class="spacer"></span><span class="fin-big">' + F.money(devisHT(o)) + '</span><span class="small muted">HT</span></div>' + U.steps(DV_FLOW, Math.max(0, idx), { rejected: s === 'Refusé', finished: o.statut === 'Converti' }) +
      (s === 'Expiré' ? '<div class="alert tone-orange">' + ic('clock') + '<div>Offre expirée le ' + F.date(o.validite) + ' — prolongez la validité ou établissez une nouvelle offre.</div></div>' : '') +
      (o.motif ? '<div class="alert tone-red">' + ic('x') + '<div><b>Refusé</b> — ' + esc(o.motif) + '</div></div>' : '') +
      (after > c.plafond && o.statut !== 'Converti' && o.statut !== 'Refusé' ? '<div class="alert tone-red" style="margin-top:8px">' + ic('alert') + '<div><b>Contrôle de risque :</b> l\'encours du client atteindrait ' + M(after) + ' pour un plafond de ' + M(c.plafond) + '. Garantie ou paiement anticipé recommandés.</div></div>' : '<div class="alert tone-green" style="margin-top:8px">' + ic('shield') + '<div>Contrôle de risque : encours actuel ' + M(enc) + ' / plafond ' + M(c.plafond) + '.</div></div>') +
      '<div class="grid g2 stack-m" style="margin-top:12px"><dl class="kv"><dt>Client</dt><dd><a href="#" data-cli="' + c.id + '">' + esc(c.nom) + '</a></dd><dt>Objet</dt><dd>' + esc(o.objet) + '</dd><dt>Date</dt><dd>' + F.date(o.date) + '</dd><dt>Validité</dt><dd>' + F.date(o.validite) + '</dd></dl><dl class="kv"><dt>Lieu</dt><dd>' + esc(o.lieu) + '</dd><dt>Conditions</dt><dd>' + esc(o.conditions) + '</dd><dt>Remise</dt><dd>' + F.num(o.remise || 0, 1) + ' %</dd><dt>Commande</dt><dd>' + (o.commandeId ? '<a href="#" data-cc="' + o.commandeId + '">' + o.commandeId + '</a>' : '—') + '</dd></dl></div>' +
      '<div class="fin-sect">' + ic('list') + 'Lignes</div>' + U.table([{ label: 'Produit', render: function (l) { return esc(tarif(l.produit).produit); } }, { label: 'Quantité', num: true, render: function (l) { return F.num(l.qte) + ' ' + tarif(l.produit).unite; } }, { label: 'Prix HT', num: true, render: function (l) { return F.money(l.pu) + (l.pu !== tarif(l.produit).prix ? '<span class="fin-sub">barème ' + F.num(tarif(l.produit).prix) + '</span>' : ''); } }, { label: 'Montant HT', num: true, render: function (l) { return '<b>' + F.money(lineHT(l)) + '</b>'; } }], o.lignes, { footer: function () { return '<td colspan="3">Total HT après remise</td><td class="num">' + F.money(devisHT(o)) + '</td>'; } }) +
      '<div class="fin-sect">' + ic('clock') + 'Historique</div><div class="timeline">' + o.historique.map(function (h) { return '<div class="tl-item done"><b>' + esc(h.action) + '</b><span>' + esc(h.user) + ' · ' + F.date(h.date) + '</span></div>'; }).join('') + '</div>';
    function hist(a) { o.historique.push({ date: today(), action: a, user: user().name }); }
    function act(newSt, a, msg, close) { o.statut = newSt; hist(a); S.save(); E.log('Devis ' + a.toLowerCase(), o.id + ' · ' + clNom(o.client), MOD); close(); refresh(); U.toast(msg); openDevis(o.id); }
    var acts = [{ label: 'Aperçu / imprimer', icon: 'print', onClick: function () { var m = U.modal({ title: 'Offre commerciale ' + o.id, sub: 'Aperçu avant impression', size: 'lg', body: devisDoc(o), actions: [{ label: 'Fermer' }, { label: 'Imprimer / PDF', cls: 'primary', icon: 'print', onClick: function () { printModal(m); } }] }); } }];
    if (o.statut === 'Brouillon') acts.push({ label: 'Envoyer au client', cls: 'primary', icon: 'send', onClick: function (close) { act('Envoyé', 'Envoyé au client', 'Offre envoyée à ' + clNom(o.client) + ' (simulation)', close); } });
    if (s === 'Expiré') acts.push({ label: 'Prolonger de 15 jours', icon: 'refresh', onClick: function (close) { o.validite = d(15); act('Envoyé', 'Validité prolongée au ' + F.date(o.validite), 'Validité prolongée', close); } });
    if (o.statut === 'Envoyé' && s !== 'Expiré') { acts.push({ label: 'Refusé', cls: 'danger', icon: 'x', onClick: function (close) { U.formModal({ title: 'Offre refusée', sub: o.id, fields: [{ name: 'motif', label: 'Motif du refus', type: 'textarea', required: true }], onSubmit: function (v) { o.motif = v.motif; act('Refusé', 'Refusé : ' + v.motif, 'Devis marqué refusé', close); } }); } }); acts.push({ label: 'Accepté par le client', cls: 'success', icon: 'check', onClick: function (close) { act('Accepté', 'Accepté par le client', 'Devis accepté', close); } }); }
    if (o.statut === 'Accepté') acts.push({ label: 'Convertir en commande', cls: 'primary', icon: 'arrow', onClick: function (close) {
      var cc = { id: nextId('commandesClients', 'CC'), client: o.client, type: 'Commande ponctuelle', date: today(), du: today(), au: d(45), lieu: o.lieu, moyen: o.client === 'C-07' ? 'Navire pétrolier' : 'Camions-citernes', statut: 'Confirmée', devisId: o.id, enlevements: [], lignes: o.lignes.map(function (l) { return { produit: l.produit, qte: l.qte, pu: Math.round(l.pu * (1 - (o.remise || 0) / 100)) }; }) };
      S.add('commandesClients', cc); o.commandeId = cc.id; act('Converti', 'Converti en commande ' + cc.id, 'Commande ' + cc.id + ' créée', close);
      E.notify('Commande client créée : ' + cc.id, clNom(o.client) + ' · ' + M(devisHT(o)), '#/ventes/commandes/' + cc.id, 'violet');
    } });
    acts.unshift({ label: 'Fermer' });
    var m = U.modal({ title: o.id + ' · ' + clNom(o.client), sub: esc(o.objet), size: 'lg', body: html, actions: acts, onClose: fromUrl ? afterClose : null });
    m.body.addEventListener('click', function (e) { var a = e.target.closest('[data-cli],[data-cc]'); if (!a) return; e.preventDefault(); m.close(); if (a.dataset.cli) openClient(a.dataset.cli); else openCmd(a.dataset.cc); });
  }
  function newDevis() {
    var fields = [{ name: 'client', label: 'Client', type: 'select', options: E.options('clients', function (c) { return c.nom + ' — ' + c.type; }) }, { name: 'objet', label: 'Objet de l\'offre', required: true, placeholder: 'Ex. : Gasoil — volumes du 1er trimestre' }, { name: 'validite', label: 'Valable jusqu\'au', type: 'date', value: d(30) }, { name: 'remise', label: 'Remise commerciale (%)', type: 'number', step: '0.1', value: 0, min: 0 }];
    var pe = prodEditor('dv-le', [], function (t) { var r = +(document.getElementById('f_remise') || {}).value || 0, x = document.getElementById('dv-sum'); if (x) x.innerHTML = 'Total HT après remise : <b>' + F.money(t * (1 - r / 100)) + '</b> · TTC : <b>' + F.money(Math.round(t * (1 - r / 100)) * (1 + TVA)) + '</b>'; });
    var m = U.modal({ title: 'Nouveau devis / offre commerciale', sub: 'Prix pré-remplis depuis le barème (prix de démonstration, modifiables)', size: 'lg', body: U.form(fields) + pe.html + '<p class="small muted" id="dv-sum" style="margin:10px 0 0;text-align:right"></p>', actions: [{ label: 'Annuler' }, { label: 'Enregistrer en brouillon', icon: 'file', onClick: function (c, el) { save(c, el, 'Brouillon'); } }, { label: 'Enregistrer et envoyer', cls: 'primary', icon: 'send', onClick: function (c, el) { save(c, el, 'Envoyé'); } }] });
    pe.bind(); m.el.querySelector('#f_remise').addEventListener('input', function () { m.el.querySelector('#dv-le').dispatchEvent(new Event('input')); });
    function save(close, el, stt) {
      var v = U.readForm(el); if (!v) return; var l = pe.read(); if (!l.length) { U.toast('Ajoutez au moins un produit.', 'err'); return; }
      var c = cl(v.client), o = { id: nextId('devisClients', 'DV'), client: v.client, date: today(), validite: v.validite, objet: v.objet, lignes: l.map(function (x) { return { produit: x.produit, qte: x.qte, pu: x.pu }; }), remise: Math.max(0, +v.remise || 0), conditions: 'Paiement à ' + c.delai + ' jours date de facture, par virement', lieu: v.client === 'C-07' ? 'FOB Appontement SOGARA — Port-Gentil' : 'Départ raffinerie — Port-Gentil', statut: stt, historique: [{ date: today(), action: 'Création', user: user().name }] };
      if (stt === 'Envoyé') o.historique.push({ date: today(), action: 'Envoyé au client', user: user().name });
      S.add('devisClients', o); E.log('Création devis', o.id + ' · ' + c.nom + ' · ' + M(devisHT(o)), MOD); close(); U.toast(stt === 'Envoyé' ? 'Offre ' + o.id + ' envoyée (simulation)' : 'Brouillon ' + o.id + ' enregistré');
      if (st.tab !== 'devis') E.go(MOD + '/devis'); else refresh(); setTimeout(function () { openDevis(o.id); }, 60);
    }
  }

  /* ------------------------------------------------------------------ commandes & enlèvements */
  function vCmd(body) {
    var rows = cmdsAll().slice().sort(function (a, b) { return aFacturer(b).length - aFacturer(a).length || b.date.localeCompare(a.date); });
    var af = []; rows.forEach(function (c) { aFacturer(c).forEach(function (e) { af.push({ c: c, e: e }); }); });
    body.innerHTML = (af.length ? '<div class="alert tone-orange" style="margin-bottom:16px">' + ic('invoice') + '<div><b>' + af.length + ' enlèvement(s) à facturer</b> — ' + af.map(function (x) { return esc(clNom(x.c.client)) + ' (' + esc(x.e.bl) + ')'; }).join(', ') + '. Ouvrez la commande pour générer la facture.</div></div>' : '') +
      '<div class="card"><div class="card__h"><h3>Commandes clients & contrats d\'enlèvement</h3><span class="sub">' + rows.length + '</span></div>' + U.table([
        { label: 'N°', render: function (c) { return '<span class="mono fin-strong">' + c.id + '</span><span class="fin-sub">' + esc(c.type) + '</span>'; } },
        { label: 'Client', render: function (c) { return '<span class="fin-strong">' + esc(clNom(c.client)) + '</span><span class="fin-sub">' + esc(c.moyen) + '</span>'; } },
        { label: 'Période', render: function (c) { return F.dateShort(c.du) + ' → ' + F.dateShort(c.au); } },
        { label: 'Volumes contractuels', render: function (c) { return c.lignes.map(function (l) { return F.num(l.qte) + ' ' + tarif(l.produit).unite + ' ' + esc(tarif(l.produit).produit); }).join('<br>'); } },
        { label: 'Enlevé', render: function (c) { return '<div style="min-width:110px">' + U.progress(cmdPct(c)) + '<span class="fin-sub">' + c.enlevements.length + ' enlèvement(s)</span></div>'; } },
        { label: 'À facturer', num: true, render: function (c) { var n = aFacturer(c).length; return n ? U.badge(n + ' à facturer', 'orange') : '<span class="muted small">—</span>'; } },
        { label: 'Statut', render: function (c) { return B(c.statut); } }
      ], rows, { onRow: function (c) { openCmd(c.id); } }) + '</div>';
  }
  function openCmd(id, fromUrl) {
    var c = cmdsAll().find(function (x) { return x.id === id; }); if (!c) return;
    var af = aFacturer(c);
    var html = '<div class="row" style="margin-bottom:12px">' + B(c.statut) + '<span class="badge tone-grey plain">' + esc(c.type) + '</span><span class="spacer"></span>' + U.progress(cmdPct(c)) + '</div>' +
      (af.length ? '<div class="alert tone-orange">' + ic('invoice') + '<div><b>' + af.length + ' enlèvement(s) non facturé(s)</b> — ' + af.map(function (e) { return esc(e.bl) + ' du ' + F.date(e.date); }).join(', ') + '.</div></div>' : '') +
      '<div class="grid g2 stack-m" style="margin-top:12px"><dl class="kv"><dt>Client</dt><dd><a href="#" data-cli="' + c.client + '">' + esc(clNom(c.client)) + '</a></dd><dt>Période</dt><dd>' + F.date(c.du) + ' → ' + F.date(c.au) + '</dd><dt>Lieu d\'enlèvement</dt><dd>' + esc(c.lieu) + '</dd></dl><dl class="kv"><dt>Moyen</dt><dd>' + esc(c.moyen) + '</dd><dt>Origine</dt><dd>' + (c.devisId ? '<a href="#" data-dv="' + c.devisId + '">' + c.devisId + '</a>' : 'Contrat cadre') + '</dd><dt>Créée le</dt><dd>' + F.date(c.date) + '</dd></dl></div>' +
      '<div class="fin-sect">' + ic('drop') + 'Volumes</div>' + U.table([{ label: 'Produit', render: function (l) { return esc(tarif(l.produit).produit); } }, { label: 'Contractuel', num: true, render: function (l) { return F.num(l.qte) + ' ' + tarif(l.produit).unite; } }, { label: 'Enlevé', num: true, render: function (l) { return F.num(cmdQte(c, l.produit)); } }, { label: 'Reste', num: true, render: function (l) { return F.num(Math.max(0, l.qte - cmdQte(c, l.produit))); } }, { label: 'Avancement', render: function (l) { return '<div style="min-width:100px">' + U.progress(cmdQte(c, l.produit) / l.qte * 100) + '</div>'; } }], c.lignes) +
      '<div class="fin-sect">' + ic('truck') + 'Enlèvements</div>' + U.table([{ label: 'Date', render: function (e) { return F.date(e.date); } }, { label: 'BL / connaissement', render: function (e) { return '<span class="mono">' + esc(e.bl) + '</span><span class="fin-sub">' + esc(e.moyen) + '</span>'; } }, { label: 'Quantités', render: function (e) { return e.lignes.map(function (l) { return F.num(l.qte) + ' ' + tarif(l.produit).unite + ' ' + esc(tarif(l.produit).produit); }).join('<br>'); } }, { label: 'Facture', render: function (e) { return e.factureId ? '<a href="#" data-fa="' + e.factureId + '">' + e.factureId + '</a>' : U.badge('À facturer', 'orange'); } }], c.enlevements.slice().reverse(), { empty: 'Aucun enlèvement enregistré' });
    var acts = [{ label: 'Fermer' }];
    if (c.statut !== 'Clôturée') {
      acts.push({ label: 'Clôturer', icon: 'lock', onClick: function (close) { U.confirm('Clôturer la commande', 'Aucun nouvel enlèvement ne pourra être enregistré sur ' + c.id + '.', 'Clôturer', function () { c.statut = 'Clôturée'; S.save(); E.log('Clôture commande client', c.id, MOD); close(); refresh(); U.toast('Commande clôturée'); }); } });
      acts.push({ label: 'Enregistrer un enlèvement', icon: 'truck', onClick: function (close) { close(); newEnl(c); } });
    }
    if (af.length) acts.push({ label: 'Facturer ' + af.length + ' enlèvement(s)', cls: 'primary', icon: 'invoice', onClick: function (close) {
      var cli = cl(c.client), made = [];
      af.forEach(function (e) {
        var cmdLine = function (p) { return c.lignes.find(function (l) { return l.produit === p; }) || {}; };
        var f = { id: nextId('factures', 'FA'), client: c.client, date: today(), echeance: d(cli.delai || 30), commandeId: c.id, enlevementId: e.id, bl: e.bl, lieu: c.lieu, lignes: e.lignes.map(function (l) { var t = tarif(l.produit); return { produit: l.produit, designation: t.produit, qte: l.qte, unite: t.unite, pu: cmdLine(l.produit).pu || t.prix }; }), remise: 0, relances: [] };
        S.add('factures', f); e.factureId = f.id; made.push(f);
      });
      S.save(); E.log('Facturation enlèvements', c.id + ' · ' + made.map(function (f) { return f.id; }).join(', ') + ' · ' + M(E.sum(made, faTTC)), MOD);
      E.notify('Facture(s) émise(s) : ' + made.map(function (f) { return f.id; }).join(', '), clNom(c.client) + ' · ' + M(E.sum(made, faTTC)) + ' TTC', '#/ventes/factures/' + made[0].id, 'blue');
      close(); refresh(); U.toast(made.length + ' facture(s) émise(s) — ' + M(E.sum(made, faTTC)) + ' TTC'); openFacture(made[0].id);
    } });
    var m = U.modal({ title: c.id + ' · ' + clNom(c.client), sub: esc(c.type) + ' · ' + esc(c.lieu), size: 'lg', body: html, actions: acts, onClose: fromUrl ? afterClose : null });
    m.body.addEventListener('click', function (e) { var a = e.target.closest('[data-cli],[data-dv],[data-fa]'); if (!a) return; e.preventDefault(); m.close(); if (a.dataset.cli) openClient(a.dataset.cli); else if (a.dataset.dv) openDevis(a.dataset.dv); else openFacture(a.dataset.fa); });
  }
  function newEnl(c) {
    var html = '<div class="form-grid"><div class="field"><label>Date d\'enlèvement</label><input class="input" type="date" id="el-date" value="' + today() + '"></div><div class="field"><label>N° BL / connaissement *</label><input class="input" id="el-bl" placeholder="Ex. : BL 54012"></div><div class="field full"><label>Moyen / navire</label><input class="input" id="el-moy" value="' + esc(c.moyen) + '"></div></div>' +
      '<div class="fin-box" style="margin-top:14px">' + c.lignes.map(function (l, i) { var t = tarif(l.produit), r = Math.max(0, l.qte - cmdQte(c, l.produit)); return '<div class="fin-rec" style="grid-template-columns:minmax(0,1fr) 140px"><span>' + esc(t.produit) + '<span class="fin-sub">reste ' + F.num(r) + ' ' + t.unite + ' sur le contrat · quantités à 15 °C</span></span><input class="input num" type="number" min="0" step="any" data-pr="' + l.produit + '" value="' + Math.min(r, Math.round(l.qte / 6 / 50) * 50) + '"></div>'; }).join('') + '</div>';
    U.modal({ title: 'Enregistrer un enlèvement', sub: c.id + ' · ' + esc(clNom(c.client)), body: html, actions: [{ label: 'Annuler' }, { label: 'Enregistrer', cls: 'primary', icon: 'check', onClick: function (close, el) {
      var bl = el.querySelector('#el-bl').value.trim(); if (!bl) { U.toast('Indiquez le n° de BL.', 'err'); return; }
      var ls = E.$$('[data-pr]', el).map(function (i) { return { produit: i.dataset.pr, qte: +i.value || 0 }; }).filter(function (x) { return x.qte > 0; }); if (!ls.length) { U.toast('Aucune quantité saisie.', 'err'); return; }
      var e = { id: 'EL-' + c.id.slice(-4) + '-' + String(c.enlevements.length + 1).padStart(2, '0'), date: el.querySelector('#el-date').value || today(), lignes: ls, bl: bl, moyen: el.querySelector('#el-moy').value, factureId: null };
      c.enlevements.push(e); if (c.statut === 'Confirmée') c.statut = 'En cours d\'enlèvement'; if (cmdPct(c) >= 99.9) c.statut = 'Enlevée'; S.save();
      E.log('Enlèvement client', c.id + ' · ' + bl, MOD); close(); refresh(); U.toast('Enlèvement enregistré — à facturer'); openCmd(c.id);
    } }] });
  }
  function newCmd() {
    var pe = prodEditor('cc-le', []);
    U.modal({ title: 'Nouvelle commande / contrat d\'enlèvement', size: 'lg', body: U.form([{ name: 'client', label: 'Client', type: 'select', options: E.options('clients') }, { name: 'type', label: 'Type', type: 'select', options: ['Commande ponctuelle', 'Contrat d\'enlèvement', 'Contrat d\'enlèvement export (FOB)'] }, { name: 'du', label: 'Début de période', type: 'date', value: today() }, { name: 'au', label: 'Fin de période', type: 'date', value: d(30) }, { name: 'moyen', label: 'Moyen d\'enlèvement', type: 'select', options: ['Camions-citernes', 'Camions GPL', 'Camions avitailleurs', 'Camions calorifugés', 'Barge fluviale', 'Navire pétrolier'] }, { name: 'lieu', label: 'Lieu', value: 'Rampe de chargement camions — Port-Gentil' }]) + pe.html,
      actions: [{ label: 'Annuler' }, { label: 'Créer la commande', cls: 'primary', icon: 'check', onClick: function (close, el) {
        var v = U.readForm(el); if (!v) return; var l = pe.read(); if (!l.length) { U.toast('Ajoutez au moins un produit.', 'err'); return; }
        var c = { id: nextId('commandesClients', 'CC'), client: v.client, type: v.type, date: today(), du: v.du, au: v.au, lieu: v.lieu, moyen: v.moyen, statut: 'Confirmée', enlevements: [], lignes: l.map(function (x) { return { produit: x.produit, qte: x.qte, pu: x.pu }; }) };
        S.add('commandesClients', c); E.log('Création commande client', c.id + ' · ' + clNom(c.client), MOD); close(); refresh(); U.toast('Commande ' + c.id + ' créée'); openCmd(c.id);
      } }] });
    pe.bind();
  }

  /* ------------------------------------------------------------------ factures */
  var FA_COLS = [
    { label: 'N°', render: function (f) { return '<span class="mono fin-strong">' + f.id + '</span><span class="fin-sub">' + F.date(f.date) + '</span>'; }, csv: function (f) { return f.id; } },
    { label: 'Client', render: function (f) { return '<span class="fin-strong">' + esc(clNom(f.client)) + '</span><span class="fin-sub">' + esc(f.lignes.map(function (l) { return F.num(l.qte) + ' ' + l.unite + ' ' + tarif(l.produit).produit; }).join(' + ')) + '</span>'; }, csv: function (f) { return clNom(f.client); } },
    { label: 'Montant TTC', num: true, render: function (f) { return '<b>' + F.money(faTTC(f)) + '</b>'; }, csv: faTTC },
    { label: 'Reste dû', num: true, render: function (f) { var r = reste(f); return r > 1 ? '<span class="' + (f.echeance < today() ? 'fin-red' : '') + '">' + F.money(r) + '</span>' : '<span class="fin-green">0</span>'; }, csv: reste },
    { label: 'Échéance', render: function (f) { var s = statut(f); return F.date(f.echeance) + (s === 'Échue' ? '<span class="fin-sub fin-red">+' + retardJ(f) + ' j</span>' : ''); }, csv: function (f) { return f.echeance; } },
    { label: 'Statut', render: function (f) { return B(statut(f)) + (lastRel(f) ? ' <span class="small muted" title="Dernière relance">R' + lastRel(f) + '</span>' : ''); }, csv: statut }
  ];
  function filteredFA() {
    var s = st.f.faS || 'Toutes', c = st.f.faC || '', q = E.norm(st.f.faQ || '');
    return facts().filter(function (f) { return (s === 'Toutes' || statut(f) === s) && (!c || f.client === c) && (!q || E.norm(f.id + ' ' + clNom(f.client) + ' ' + (f.bl || '') + ' ' + (f.commandeId || '')).indexOf(q) >= 0); }).sort(function (a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); });
  }
  function vFact(body) {
    var all = facts(), op = openF(), em30 = all.filter(function (f) { return f.date > d(-30); });
    body.innerHTML = '<div class="fin-kpis" style="margin-bottom:16px">' + U.kpi({ label: 'Émises sur 30 jours', value: em30.length, icon: 'invoice', tone: 'blue', foot: M(E.sum(em30, faTTC)) + ' TTC' }) + U.kpi({ label: 'Restant à encaisser', value: F.short(E.sum(op, reste)), unit: 'FCFA', icon: 'wallet', tone: 'orange', foot: op.length + ' facture(s) ouvertes' }) + U.kpi({ label: 'Échues', value: all.filter(function (f) { return statut(f) === 'Échue'; }).length, icon: 'alert', tone: 'red', foot: M(echu()) }) + U.kpi({ label: 'Payées sur 30 jours', value: all.filter(function (f) { return statut(f) === 'Payée' && f.date > d(-60); }).length, icon: 'check', tone: 'green', foot: 'taux de recouvrement ' + F.pct(E.sum(all, faTTC) ? (1 - E.sum(op, reste) / E.sum(all, faTTC)) * 100 : 0) }) + '</div>' +
      '<div class="card"><div class="card__b"><div class="filters"><input class="input" id="fa-q" type="search" placeholder="Rechercher (n°, client, BL, commande)" value="' + esc(st.f.faQ || '') + '" style="max-width:300px">' + clientSelect('fa-c', st.f.faC) + '</div>' + chips('faS', ['Toutes', 'Émise', 'Partiellement payée', 'Échue', 'Payée'], st.f.faS || 'Toutes') + '<div class="small muted" style="margin-top:8px">TVA 18 % appliquée — <span class="fin-demo">taux à paramétrer</span> selon le régime fiscal des produits pétroliers.</div></div><div id="fa-list"></div></div>';
    function list() { var rows = filteredFA(), p = paged('fa', rows); body.querySelector('#fa-list').innerHTML = U.table(FA_COLS, p.rows, { onRow: function (f) { openFacture(f.id); }, empty: 'Aucune facture', footer: function () { return '<td colspan="2">' + rows.length + ' facture(s)</td><td class="num">' + F.money(E.sum(rows, faTTC)) + '</td><td class="num">' + F.money(E.sum(rows, reste)) + '</td><td colspan="2"></td>'; } }) + p.more; }
    list();
    body.querySelector('#fa-q').addEventListener('input', function (e) { st.f.faQ = e.target.value; list(); });
    body.querySelector('#fa-c').onchange = function (e) { st.f.faC = e.target.value; list(); };
  }
  function openFacture(id, fromUrl) {
    var f = S.get('factures', id); if (!f) return; var s = statut(f), en = encs().filter(function (e) { return e.factureId === f.id; });
    var idx = s === 'Payée' ? 2 : paid(f) > 0 ? 1 : 0;
    var html = '<div class="row" style="margin-bottom:12px">' + B(s) + (s === 'Échue' ? U.badge('Retard ' + retardJ(f) + ' j', 'red') : '') + '<span class="spacer"></span><span class="fin-big">' + F.money(faTTC(f)) + '</span><span class="small muted">TTC</span></div>' +
      U.steps(['Émise', 'Partiellement payée', 'Payée'], idx, { finished: s === 'Payée', rejected: s === 'Échue' && idx === 0 }) +
      (s === 'Échue' ? '<div class="alert tone-red">' + ic('alert') + '<div>Échue depuis <b>' + retardJ(f) + ' jours</b> — niveau de relance conseillé : <b>' + esc(NIV[niveauDu(f)] || 'rappel') + '</b>' + (lastRel(f) ? ' · dernière relance envoyée : niveau ' + lastRel(f) : ' · aucune relance envoyée') + '.</div></div>' : '') +
      '<div class="grid g2 stack-m" style="margin-top:12px"><dl class="kv"><dt>Client</dt><dd><a href="#" data-cli="' + f.client + '">' + esc(clNom(f.client)) + '</a></dd><dt>Date</dt><dd>' + F.date(f.date) + '</dd><dt>Échéance</dt><dd>' + F.date(f.echeance) + ' (' + cl(f.client).delai + ' j)</dd><dt>Commande</dt><dd>' + (f.commandeId ? '<a href="#" data-cc="' + f.commandeId + '">' + f.commandeId + '</a>' : '—') + (f.bl ? ' · ' + esc(f.bl) : '') + '</dd></dl>' +
      '<dl class="kv"><dt>Total HT</dt><dd>' + F.money(faHT(f)) + '</dd><dt>TVA 18 %</dt><dd>' + F.money(faTVA(f)) + ' <span class="fin-demo">à paramétrer</span></dd><dt>Encaissé</dt><dd class="fin-green">' + F.money(paid(f)) + '</dd><dt>Reste dû</dt><dd><b class="' + (reste(f) > 1 ? 'fin-red' : '') + '">' + F.money(reste(f)) + '</b></dd></dl></div>' +
      '<div class="fin-sect">' + ic('list') + 'Lignes</div>' + U.table([{ label: 'Produit', render: function (l) { return esc(l.designation || tarif(l.produit).produit); } }, { label: 'Quantité', num: true, render: function (l) { return F.num(l.qte) + ' ' + esc(l.unite); } }, { label: 'PU HT', num: true, render: function (l) { return F.money(l.pu); } }, { label: 'Montant HT', num: true, render: function (l) { return '<b>' + F.money(lineHT(l)) + '</b>'; } }], f.lignes) +
      '<div class="grid g2 stack-m"><div><div class="fin-sect">' + ic('money') + 'Encaissements</div>' + (en.length ? '<div class="timeline">' + en.map(function (e) { return '<div class="tl-item done"><b>' + F.money(e.montant) + ' · ' + esc(e.mode) + '</b><span>' + F.date(e.date) + ' · ' + esc(e.reference) + ' · ' + esc(e.banque || '') + '</span></div>'; }).join('') + '</div>' : '<div class="muted small">Aucun encaissement.</div>') + '</div>' +
      '<div><div class="fin-sect">' + ic('send') + 'Relances</div>' + ((f.relances || []).length ? '<div class="timeline">' + f.relances.map(function (r) { return '<div class="tl-item ' + (r.niveau === 3 ? 'rejected' : 'current') + '"><b>' + esc(NIV[r.niveau]) + '</b><span>' + F.datetime(r.date) + ' · ' + esc(r.par) + ' · ' + esc(r.canal || '') + '</span></div>'; }).join('') + '</div>' : '<div class="muted small">Aucune relance.</div>') + '</div></div>';
    var acts = [{ label: 'Fermer' }, { label: 'Aperçu / imprimer', icon: 'print', onClick: function () { var m2 = U.modal({ title: 'Facture ' + f.id, sub: 'Aperçu avant impression', size: 'lg', body: factureDoc(f), actions: [{ label: 'Fermer' }, { label: 'Envoyer au client', icon: 'send', onClick: function () { E.log('Envoi facture', f.id + ' → ' + clNom(f.client), MOD); U.toast('Facture envoyée à ' + clNom(f.client) + ' (simulation)'); } }, { label: 'Imprimer / PDF', cls: 'primary', icon: 'print', onClick: function () { printModal(m2); } }] }); } }];
    if (s === 'Échue' && niveauDu(f) > 0) acts.push({ label: 'Envoyer la relance', icon: 'send', cls: relanceDue(f) ? 'danger' : '', onClick: function (close) { close(); sendRelance(f.id); } });
    if (reste(f) > 1) acts.push({ label: 'Enregistrer un encaissement', cls: 'success', icon: 'money', onClick: function (close) { close(); newEnc(f.id); } });
    var m = U.modal({ title: f.id + ' · ' + clNom(f.client), sub: 'Facture client · ' + F.date(f.date), size: 'lg', body: html, actions: acts, onClose: fromUrl ? afterClose : null });
    m.body.addEventListener('click', function (e) { var a = e.target.closest('[data-cli],[data-cc]'); if (!a) return; e.preventDefault(); m.close(); if (a.dataset.cli) openClient(a.dataset.cli); else openCmd(a.dataset.cc); });
  }
  function newFacture() {
    var pe = prodEditor('fa-le', []);
    U.modal({ title: 'Nouvelle facture (hors contrat)', sub: 'Pour une facturation issue d\'un contrat, utilisez « Facturer les enlèvements » depuis la commande', size: 'lg', body: U.form([{ name: 'client', label: 'Client', type: 'select', options: E.options('clients') }, { name: 'date', label: 'Date de facture', type: 'date', value: today() }, { name: 'bl', label: 'Référence enlèvement / BL', placeholder: 'Facultatif' }, { name: 'remise', label: 'Remise (%)', type: 'number', step: '0.1', value: 0 }]) + pe.html,
      actions: [{ label: 'Annuler' }, { label: 'Émettre la facture', cls: 'primary', icon: 'check', onClick: function (close, el) {
        var v = U.readForm(el); if (!v) return; var l = pe.read(); if (!l.length) { U.toast('Ajoutez au moins un produit.', 'err'); return; }
        var c = cl(v.client), f = { id: nextId('factures', 'FA'), client: v.client, date: v.date || today(), echeance: E.addDays(v.date || today(), c.delai || 30), bl: v.bl, lieu: 'Raffinerie de Port-Gentil', lignes: l, remise: Math.max(0, +v.remise || 0), relances: [] };
        S.add('factures', f); E.log('Émission facture', f.id + ' · ' + c.nom + ' · ' + M(faTTC(f)), MOD); E.notify('Facture émise : ' + f.id, c.nom + ' · ' + M(faTTC(f)), '#/ventes/factures/' + f.id, 'blue');
        close(); refresh(); U.toast('Facture ' + f.id + ' émise'); openFacture(f.id);
      } }] });
    pe.bind();
  }

  /* ------------------------------------------------------------------ encaissements */
  function vEnc(body) {
    var c = st.f.enC || '', rows = encs().filter(function (e) { return !c || e.client === c; }).slice().sort(function (a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); }), p = paged('en', rows);
    st.enRows = rows;
    var e30 = encs().filter(function (e) { return e.date > d(-30); }), vir = E.sum(e30.filter(function (e) { return e.mode === 'Virement'; }), 'montant');
    body.innerHTML = '<div class="fin-kpis" style="margin-bottom:16px">' + U.kpi({ label: 'Encaissé sur 30 jours', value: F.short(E.sum(e30, 'montant')), unit: 'FCFA', icon: 'money', tone: 'green', foot: e30.length + ' règlement(s)' }) + U.kpi({ label: 'Part des virements', value: F.num(E.sum(e30, 'montant') ? vir / E.sum(e30, 'montant') * 100 : 0), unit: '%', icon: 'refresh', tone: 'blue', foot: 'le solde par chèque' }) + U.kpi({ label: 'Reste à encaisser', value: F.short(encours()), unit: 'FCFA', icon: 'wallet', tone: 'orange', foot: M(echu()) + ' échus' }) + '</div>' +
      '<div class="card"><div class="card__b"><div class="filters">' + clientSelect('en-c', c) + '</div></div>' + U.table([
        { label: 'N°', render: function (e) { return '<span class="mono fin-strong">' + e.id + '</span>'; } }, { label: 'Date', render: function (e) { return F.date(e.date); } },
        { label: 'Client', render: function (e) { return '<span class="fin-strong">' + esc(clNom(e.client)) + '</span><span class="fin-sub">facture ' + e.factureId + '</span>'; } },
        { label: 'Mode', render: function (e) { return U.badge(e.mode, e.mode === 'Virement' ? 'blue' : 'violet') + '<span class="fin-sub">' + esc(e.banque || '') + '</span>'; } },
        { label: 'Référence', render: function (e) { return '<span class="mono">' + esc(e.reference) + '</span>'; } },
        { label: 'Montant', num: true, render: function (e) { return '<b class="fin-green">' + F.money(e.montant) + '</b>'; } }
      ], p.rows, { onRow: function (e) { openFacture(e.factureId); }, empty: 'Aucun encaissement', footer: function () { return '<td colspan="5">' + rows.length + ' encaissement(s)</td><td class="num">' + F.money(E.sum(rows, 'montant')) + '</td>'; } }) + p.more + '</div>';
    body.querySelector('#en-c').onchange = function (e) { st.f.enC = e.target.value; st.lim = {}; draw(); };
  }
  function newEnc(fid) {
    var op = openF().sort(function (a, b) { return a.echeance.localeCompare(b.echeance); }); if (!op.length) { U.toast('Aucune facture ouverte.', 'err'); return; }
    var f0 = S.get('factures', fid) || op[0];
    var m = U.modal({ title: 'Enregistrer un encaissement', sub: 'Lettrage automatique sur la facture sélectionnée', body: '<div class="form-grid"><div class="field full"><label>Facture</label><select class="select" id="en-f">' + op.map(function (f) { return '<option value="' + f.id + '"' + (f.id === f0.id ? ' selected' : '') + '>' + f.id + ' · ' + esc(clNom(f.client)) + ' · reste ' + F.money(reste(f)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Montant (FCFA)</label><input class="input" type="number" min="1" id="en-m" value="' + reste(f0) + '"></div><div class="field"><label>Date</label><input class="input" type="date" id="en-d" value="' + today() + '"></div><div class="field"><label>Mode</label><select class="select" id="en-mode"><option>Virement</option><option>Chèque</option></select></div><div class="field"><label>Banque</label><select class="select" id="en-b"><option>BGFIBank Gabon</option><option>UGB</option><option>BICIG</option><option>Orabank Gabon</option></select></div><div class="field full"><label>Référence (n° de virement ou de chèque) *</label><input class="input" id="en-r" placeholder="Ex. : VIR-' + today().replace(/-/g, '').slice(2) + '-512"></div></div><div id="en-info" class="small muted" style="margin-top:10px"></div>',
      actions: [{ label: 'Annuler' }, { label: 'Enregistrer', cls: 'primary', icon: 'check', onClick: function (close, el) {
        var f = S.get('factures', el.querySelector('#en-f').value), mt = Math.round(+el.querySelector('#en-m').value || 0), ref = el.querySelector('#en-r').value.trim();
        if (!ref) { U.toast('Indiquez la référence du règlement.', 'err'); return; }
        if (mt <= 0 || mt > reste(f) + 1) { U.toast('Montant invalide (reste dû : ' + F.money(reste(f)) + ').', 'err'); return; }
        var e = { id: nextId('encaissements', 'EN'), factureId: f.id, client: f.client, date: el.querySelector('#en-d').value || today(), montant: mt, mode: el.querySelector('#en-mode').value, banque: el.querySelector('#en-b').value, reference: ref };
        S.add('encaissements', e); E.log('Encaissement', e.id + ' · ' + f.id + ' · ' + clNom(f.client) + ' · ' + F.money(mt), MOD); E.notify('Encaissement reçu', clNom(f.client) + ' · ' + M(mt) + ' · ' + f.id, '#/ventes/factures/' + f.id, 'green');
        close(); refresh(); U.toast(statut(f) === 'Payée' ? 'Facture ' + f.id + ' soldée' : 'Encaissement partiel enregistré — reste ' + M(reste(f))); openFacture(f.id);
      } }] });
    function info() { var f = S.get('factures', m.el.querySelector('#en-f').value); m.el.querySelector('#en-m').value = reste(f); m.el.querySelector('#en-info').innerHTML = 'Facture du ' + F.date(f.date) + ' · échéance ' + F.date(f.echeance) + ' · TTC ' + F.money(faTTC(f)) + ' · déjà encaissé ' + F.money(paid(f)); }
    info(); m.el.querySelector('#en-f').onchange = info;
  }

  /* ------------------------------------------------------------------ relances */
  function vRel(body) {
    var ech = facts().filter(function (f) { return statut(f) === 'Échue'; }).sort(function (a, b) { return retardJ(b) - retardJ(a); }), due = ech.filter(relanceDue);
    var byN = [1, 2, 3].map(function (n) { return ech.filter(function (f) { return niveauDu(f) === n; }); });
    body.innerHTML = '<div class="fin-kpis" style="margin-bottom:16px">' + [1, 2, 3].map(function (n, i) { return U.kpi({ label: NIV[n], value: byN[i].length, icon: n === 3 ? 'alert' : 'send', tone: n === 3 ? 'red' : n === 2 ? 'orange' : 'yellow', foot: M(E.sum(byN[i], reste)) }); }).join('') + U.kpi({ label: 'Relances à envoyer', value: due.length, icon: 'bell', tone: due.length ? 'red' : 'green', foot: due.length ? 'niveau supérieur au dernier envoi' : 'tout est à jour' }) + '</div>' +
      '<div class="card"><div class="card__h"><h3>Factures échues & niveaux de relance</h3><span class="sub">J+7 relance amiable · J+30 relance ferme · J+60 mise en demeure</span><span class="spacer"></span>' + (due.length ? '<button class="btn sm primary" data-act="rel-all">' + ic('send') + 'Envoyer les ' + due.length + ' relances dues</button>' : '') + '</div>' + U.table([
        { label: 'Facture', render: function (f) { return '<span class="mono fin-strong">' + f.id + '</span><span class="fin-sub">échéance ' + F.date(f.echeance) + '</span>'; } },
        { label: 'Client', render: function (f) { return '<span class="fin-strong">' + esc(clNom(f.client)) + '</span>'; } },
        { label: 'Retard', num: true, render: function (f) { return '<b class="' + (retardJ(f) > 60 ? 'fin-red' : 'fin-orange') + '">' + retardJ(f) + ' j</b>'; } },
        { label: 'Reste dû', num: true, render: function (f) { return F.money(reste(f)); } },
        { label: 'Niveau conseillé', render: function (f) { var n = niveauDu(f); return n ? U.badge(NIV[n], n === 3 ? 'red' : n === 2 ? 'orange' : 'yellow') : U.badge('Rappel J+' + retardJ(f), 'grey'); } },
        { label: 'Dernière relance', render: function (f) { var r = (f.relances || []).slice(-1)[0]; return r ? 'Niveau ' + r.niveau + '<span class="fin-sub">' + F.date(r.date) + '</span>' : '<span class="muted small">Aucune</span>'; } },
        { label: '', render: function (f) { return niveauDu(f) ? '<button class="btn sm ' + (relanceDue(f) ? 'primary' : '') + '" data-act="rel" data-id="' + f.id + '">' + ic('send') + (relanceDue(f) ? 'Envoyer la relance' : 'Renvoyer') + '</button>' : ''; } }
      ], ech, { onRow: function (f) { openFacture(f.id); }, empty: 'Aucune facture échue — bravo !' }) + '</div>';
  }
  function doRelance(f, n, canal) { (f.relances = f.relances || []).push({ niveau: n, date: stamp(), par: user().name, canal: canal }); }
  function sendRelance(id) {
    var f = S.get('factures', id); if (!f) return; var n = Math.max(1, niveauDu(f));
    var m = U.modal({ title: NIV[n] + ' — ' + clNom(f.client), sub: 'Courrier généré automatiquement · toutes les factures échues du client', size: 'lg', body: relanceDoc(f, n), actions: [{ label: 'Annuler' }, { label: 'Imprimer', icon: 'print', onClick: function () { printModal(m); } }, { label: 'Envoyer la relance', cls: 'primary', icon: 'send', onClick: function (close) {
      var canal = n === 3 ? 'Courrier recommandé + e-mail' : n === 2 ? 'E-mail + courrier' : 'E-mail';
      openF().filter(function (x) { return x.client === f.client && x.echeance < today() && niveauDu(x) >= 1 && lastRel(x) < n; }).forEach(function (x) { doRelance(x, Math.min(n, Math.max(1, niveauDu(x))), canal); });
      if (lastRel(f) < n) doRelance(f, n, canal);
      S.save(); E.log('Relance client', clNom(f.client) + ' · ' + NIV[n] + ' · ' + f.id, MOD); E.notify('Relance envoyée', clNom(f.client) + ' · ' + NIV[n], '#/ventes/relances', n === 3 ? 'red' : 'orange');
      close(); refresh(); U.toast('Relance envoyée à ' + clNom(f.client) + ' (' + canal.toLowerCase() + ', simulation)');
    } }] });
  }
  function relanceAll() {
    var due = facts().filter(relanceDue);
    U.confirm('Envoyer les relances dues', due.length + ' relance(s) seront envoyées (simulation) : ' + due.map(function (f) { return f.id + ' (' + NIV[niveauDu(f)] + ')'; }).join(', ') + '.', 'Tout envoyer', function () {
      due.forEach(function (f) { doRelance(f, niveauDu(f), niveauDu(f) === 3 ? 'Courrier recommandé + e-mail' : 'E-mail'); });
      S.save(); E.log('Relances groupées', due.length + ' relance(s)', MOD); refresh(); U.toast(due.length + ' relance(s) envoyée(s)');
    });
  }

  /* ------------------------------------------------------------------ encours & risque */
  function riskCard(compact) {
    var rows = S.all('clients').map(function (c) { var e = encours(c.id); return { c: c, e: e, p: c.plafond ? e / c.plafond * 100 : 0, ech: echu(c.id), ag: aging(c.id) }; }).sort(function (a, b) { return b.p - a.p; });
    var over = rows.filter(function (r) { return r.p > 100; }), near = rows.filter(function (r) { return r.p > 85 && r.p <= 100; });
    return '<div class="card"><div class="card__h"><h3>Encours vs plafond</h3><span class="sub">' + (over.length ? '<span class="fin-red">' + over.length + ' dépassement(s)</span> · ' : '') + near.length + ' proche(s) du plafond</span>' + (compact ? '<span class="spacer"></span><button class="btn sm ghost" data-act="go" data-k="clients">Détail</button>' : '') + '</div><div class="card__b"><div class="fin-risk">' +
      rows.slice(0, compact ? 6 : 99).map(function (r) { return '<div class="fin-risk__row" data-act="cli" data-id="' + r.c.id + '"><div><b>' + esc(r.c.nom) + '</b>' + (r.p > 100 ? ' ' + U.badge('Dépassement', 'red') : r.p > 85 ? ' ' + U.badge('Vigilance', 'orange') : '') + '<span class="fin-sub">' + esc(r.c.type) + ' · ' + r.c.delai + ' j</span></div><div>' + U.progress(Math.min(100, r.p), r.p > 100 ? 'red' : r.p > 85 ? 'orange' : 'green') + '<span class="fin-sub">' + M(r.e) + ' / ' + M(r.c.plafond) + (r.ech ? ' · <span class="fin-red">' + M(r.ech) + ' échus</span>' : '') + '</span></div><div class="right"><b class="' + (r.p > 100 ? 'fin-red' : '') + '">' + F.pct(r.p) + '</b><div class="fin-sub">du plafond</div></div></div>'; }).join('') + '</div></div></div>';
  }
  function vClients(body) {
    var rows = S.all('clients').map(function (c) { return { c: c, ag: aging(c.id), e: encours(c.id) }; }).sort(function (a, b) { return b.e - a.e; }), tot = aging();
    st.agRows = rows;
    body.innerHTML = '<div class="fin-kpis" style="margin-bottom:16px">' + U.kpi({ label: 'Encours total', value: F.short(encours()), unit: 'FCFA', icon: 'wallet', tone: 'orange', foot: openF().length + ' factures ouvertes' }) + U.kpi({ label: 'Dont échu', value: F.short(echu()), unit: 'FCFA', icon: 'alert', tone: 'red', foot: F.pct(encours() ? echu() / encours() * 100 : 0, 1) + ' de l\'encours' }) + U.kpi({ label: 'Créances à plus de 90 j', value: F.short(tot[4]), unit: 'FCFA', icon: 'shield', tone: tot[4] ? 'red' : 'green', foot: tot[4] ? 'provision à étudier' : 'aucune' }) + U.kpi({ label: 'DSO', value: F.num(dso()), unit: 'jours', icon: 'clock', tone: 'violet', foot: 'encours / CA TTC 90 j × 90' }) + '</div>' +
      '<div class="grid g2 stack-m">' + riskCard(false) +
      '<div class="card"><div class="card__h"><h3>Balance âgée</h3><span class="sub">reste dû TTC par ancienneté du retard</span></div><div class="card__b"><div class="fin-age" style="height:16px">' + AGES.map(function (a, i) { var p = encours() ? tot[i] / encours() * 100 : 0; return p ? '<i style="width:' + p + '%;background:' + a.c + '" title="' + a.l + ' : ' + F.money(tot[i]) + '"></i>' : ''; }).join('') + '</div><div class="legend" style="margin-top:10px">' + AGES.map(function (a, i) { return '<span><i style="background:' + a.c + '"></i>' + a.l + ' · <b>' + F.short(tot[i]) + '</b></span>'; }).join('') + '</div></div>' +
      U.table([{ label: 'Client', render: function (r) { return '<span class="fin-strong">' + esc(r.c.nom) + '</span>'; } }].concat(AGES.map(function (a, i) { return { label: a.l, num: true, render: function (r) { return r.ag[i] ? '<span class="' + (i >= 3 ? 'fin-red' : i >= 1 ? 'fin-orange' : '') + '">' + F.short(r.ag[i]) + '</span>' : '<span class="muted">—</span>'; } }; })).concat([{ label: 'Total', num: true, render: function (r) { return '<b>' + F.short(r.e) + '</b>'; } }]), rows, { onRow: function (r) { openClient(r.c.id); }, footer: function () { return '<td>Total</td>' + tot.map(function (v) { return '<td class="num">' + F.short(v) + '</td>'; }).join('') + '<td class="num">' + F.short(encours()) + '</td>'; } }) + '</div></div>';
  }
  function openClient(id, fromUrl) {
    var c = S.get('clients', id); if (!c) return; var e = encours(id), p = c.plafond ? e / c.plafond * 100 : 0, ag = aging(id);
    var fs = facts().filter(function (f) { return f.client === id; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
    var ens = encs().filter(function (x) { return x.client === id; }), dv = S.all('devisClients').filter(function (o) { return o.client === id; }), cc = cmdsAll().filter(function (o) { return o.client === id; });
    var html = '<div class="grid g2 stack-m"><div><dl class="kv"><dt>Type</dt><dd>' + esc(c.type) + '</dd><dt>Ville</dt><dd>' + esc(c.ville) + '</dd><dt>Délai de paiement</dt><dd>' + c.delai + ' jours</dd><dt>Plafond d\'encours</dt><dd>' + F.money(c.plafond) + '</dd><dt>CA HT 90 jours</dt><dd>' + F.money(caPeriod(d(-89), today(), id)) + '</dd><dt>Contrats / devis</dt><dd>' + cc.length + ' commande(s) · ' + dv.length + ' devis</dd></dl></div>' +
      '<div>' + U.gauge(Math.min(100, p), 'Encours ' + M(e) + ' / plafond ' + M(c.plafond), p > 100 ? '#d93636' : p > 85 ? '#e8780c' : '#1e9e4a') + (p > 100 ? '<div class="alert tone-red" style="margin-top:10px">' + ic('alert') + '<div><b>Plafond dépassé de ' + M(e - c.plafond) + '</b> — enlèvements soumis à l\'accord de la Direction financière.</div></div>' : '') +
      '<div class="fin-age" style="margin-top:12px">' + AGES.map(function (a, i) { return ag[i] && e ? '<i style="width:' + ag[i] / e * 100 + '%;background:' + a.c + '" title="' + a.l + '"></i>' : ''; }).join('') + '</div><div class="legend" style="margin-top:6px">' + AGES.map(function (a, i) { return ag[i] ? '<span><i style="background:' + a.c + '"></i>' + a.l + ' ' + F.short(ag[i]) + '</span>' : ''; }).join('') + '</div></div></div>' +
      '<div class="fin-sect">' + ic('invoice') + 'Factures (' + fs.length + ')</div>' + U.table(FA_COLS.filter(function (x) { return x.label !== 'Client'; }), fs.slice(0, 12), { onRow: function (f) { m.close(); openFacture(f.id); }, empty: 'Aucune facture' }) +
      '<div class="fin-sect">' + ic('money') + 'Derniers encaissements</div>' + U.table([{ label: 'Date', render: function (x) { return F.date(x.date); } }, { label: 'Facture', render: function (x) { return x.factureId; } }, { label: 'Mode', render: function (x) { return esc(x.mode) + ' · ' + esc(x.reference); } }, { label: 'Montant', num: true, render: function (x) { return '<b class="fin-green">' + F.money(x.montant) + '</b>'; } }], ens.slice().reverse().slice(0, 6), { empty: 'Aucun encaissement' });
    var acts = [{ label: 'Fermer' }, { label: 'Réviser le plafond', icon: 'shield', onClick: function (close) { U.formModal({ title: 'Révision du plafond d\'encours', sub: c.nom, fields: [{ name: 'plafond', label: 'Nouveau plafond (FCFA)', type: 'money', value: c.plafond, required: true }, { name: 'motif', label: 'Motif (garantie, historique de paiement…)', type: 'textarea', required: true }], onSubmit: function (v) { var old = c.plafond; S.update('clients', id, { plafond: Math.max(0, +v.plafond) }); E.log('Révision plafond client', c.nom + ' · ' + M(old) + ' → ' + M(+v.plafond) + ' · ' + v.motif, MOD); close(); refresh(); U.toast('Plafond révisé'); openClient(id); } }); } }];
    if (fs.some(relanceDue)) acts.push({ label: 'Relancer', cls: 'danger', icon: 'send', onClick: function (close) { close(); sendRelance(fs.filter(relanceDue)[0].id); } });
    acts.push({ label: 'Nouveau devis', cls: 'primary', icon: 'plus', onClick: function (close) { close(); newDevis(); setTimeout(function () { var s = document.getElementById('f_client'); if (s) s.value = id; }, 20); } });
    var m = U.modal({ title: c.nom, sub: esc(c.type) + ' · ' + esc(c.ville) + ' · ' + c.id, size: 'lg', body: html, actions: acts, onClose: fromUrl ? afterClose : null });
  }

  /* ------------------------------------------------------------------ tarifs */
  function vTarifs(body) {
    body.innerHTML = '<div class="alert tone-yellow" style="margin-bottom:16px">' + ic('info') + '<div><b>Prix de démonstration.</b> Les prix de cession réels relèvent de la structure officielle des prix des produits pétroliers ; ils sont modifiables ici (historique conservé) et alimentent automatiquement devis, commandes et factures.</div></div>' +
      '<div class="fin-cards">' + S.all('tarifs').map(function (t) { var last = (t.historique || []).slice(-2); var vari = last.length === 2 ? (last[1].prix / last[0].prix - 1) * 100 : 0; return '<div class="card fin-card" data-act="tar" data-id="' + t.id + '"><div class="card__b"><div class="fin-card__top"><div class="list__icon" style="background:' + t.color + '1a;color:' + t.color + '">' + ic(t.id === 'P-BUT' ? 'fire' : t.id === 'P-BIT' ? 'layers' : 'drop') + '</div><div><b>' + esc(t.produit) + '</b><span class="small muted">' + esc(t.famille) + ' · densité ' + esc(t.densite || '') + '</span></div></div><div class="row"><span class="fin-big">' + F.num(t.prix) + '</span><span class="muted">FCFA HT / ' + t.unite + '</span><span class="spacer"></span><span class="fin-demo">démo</span></div><div class="small muted">Mis à jour le ' + F.date(t.maj) + (vari ? ' · <span class="' + (vari > 0 ? 'up' : 'down') + '">' + (vari > 0 ? '+' : '') + F.num(vari, 1) + ' %</span>' : '') + '</div><div class="fin-kv2"><div><small>Vendu 90 j</small><b>' + F.short(E.sum(facts().filter(function (f) { return f.date > d(-90); }), function (f) { return E.sum(f.lignes.filter(function (l) { return l.produit === t.id; }), 'qte'); })) + ' ' + t.unite + '</b></div><div><small>CA 90 j</small><b>' + M(E.sum(facts().filter(function (f) { return f.date > d(-90); }), function (f) { return E.sum(f.lignes.filter(function (l) { return l.produit === t.id; }), lineHT); })) + '</b></div></div></div></div>'; }).join('') + '</div>';
  }
  function editTarif(id) {
    var t = S.get('tarifs', id); if (!t) return;
    U.formModal({ title: 'Prix de cession — ' + t.produit, sub: 'Prix de démonstration · appliqué aux nouveaux devis et factures', intro: '<div class="timeline" style="margin-bottom:14px">' + (t.historique || []).slice(-4).reverse().map(function (h) { return '<div class="tl-item done"><b>' + F.num(h.prix) + ' FCFA / ' + t.unite + '</b><span>' + F.date(h.date) + ' · ' + esc(h.par) + ' · ' + esc(h.motif || '') + '</span></div>'; }).join('') + '</div>',
      fields: [{ name: 'prix', label: 'Nouveau prix HT (FCFA / ' + t.unite + ')', type: 'money', value: t.prix, required: true }, { name: 'motif', label: 'Motif', value: 'Révision mensuelle du barème', required: true }], onSubmit: function (v) {
        if (!(v.prix > 0)) { U.toast('Prix invalide.', 'err'); return false; }
        t.historique = t.historique || []; t.historique.push({ date: today(), prix: v.prix, par: user().name, motif: v.motif }); t.prix = v.prix; t.maj = today(); S.save();
        E.log('Modification tarif', t.produit + ' → ' + F.num(v.prix) + ' FCFA/' + t.unite, MOD); refresh(); U.toast('Prix de ' + t.produit + ' mis à jour');
      } });
  }

  /* ------------------------------------------------------------------ export, recherche, intégration */
  function exportTab() {
    if (st.tab === 'factures') U.exportCSV('factures-clients-' + today(), FA_COLS.concat([{ label: 'HT', csv: faHT }, { label: 'TVA', csv: faTVA }, { label: 'Commande', csv: function (f) { return f.commandeId || ''; } }]), filteredFA());
    else if (st.tab === 'devis') U.exportCSV('devis-clients-' + today(), DV_COLS, st.dvRows || S.all('devisClients'));
    else if (st.tab === 'encaissements') U.exportCSV('encaissements-' + today(), [{ label: 'N°', key: 'id' }, { label: 'Date', key: 'date' }, { label: 'Client', csv: function (e) { return clNom(e.client); } }, { label: 'Facture', key: 'factureId' }, { label: 'Mode', key: 'mode' }, { label: 'Banque', key: 'banque' }, { label: 'Référence', key: 'reference' }, { label: 'Montant', key: 'montant' }], st.enRows || encs());
    else if (st.tab === 'clients') U.exportCSV('balance-agee-' + today(), [{ label: 'Client', csv: function (r) { return r.c.nom; } }, { label: 'Plafond', csv: function (r) { return r.c.plafond; } }].concat(AGES.map(function (a, i) { return { label: a.l, csv: function (r) { return Math.round(r.ag[i]); } }; })).concat([{ label: 'Encours', csv: function (r) { return Math.round(r.e); } }]), st.agRows || []);
  }
  function search(q) {
    var out = [];
    facts().forEach(function (f) { if (E.norm(f.id + ' ' + clNom(f.client) + ' ' + (f.bl || '')).indexOf(q) >= 0) out.push({ title: f.id + ' · ' + clNom(f.client), sub: 'Facture · ' + statut(f) + ' · ' + M(faTTC(f)), href: '#/ventes/factures/' + f.id }); });
    S.all('devisClients').forEach(function (o) { if (E.norm(o.id + ' ' + o.objet + ' ' + clNom(o.client)).indexOf(q) >= 0) out.push({ title: o.id + ' · ' + clNom(o.client), sub: 'Devis · ' + o.objet + ' · ' + devisStatut(o), href: '#/ventes/devis/' + o.id }); });
    cmdsAll().forEach(function (c) { if (E.norm(c.id + ' ' + clNom(c.client) + ' ' + c.type).indexOf(q) >= 0) out.push({ title: c.id + ' · ' + clNom(c.client), sub: c.type + ' · ' + c.statut, href: '#/ventes/commandes/' + c.id }); });
    S.all('clients').forEach(function (c) { if (E.norm(c.nom + ' ' + c.type + ' ' + c.ville).indexOf(q) >= 0) out.push({ title: c.nom, sub: 'Client · encours ' + M(encours(c.id)), href: '#/ventes/clients/' + c.id }); });
    return out;
  }
  function pending(u) {
    var out = []; if (!u || (u.profile !== 'finance' && u.profile !== 'admin')) return out;
    cmdsAll().forEach(function (c) { var n = aFacturer(c).length; if (n) out.push({ title: c.id + ' · ' + n + ' enlèvement(s) à facturer', sub: clNom(c.client), date: aFacturer(c)[0].date, href: '#/ventes/commandes/' + c.id, tone: 'orange' }); });
    facts().filter(relanceDue).forEach(function (f) { out.push({ title: f.id + ' · ' + NIV[niveauDu(f)], sub: clNom(f.client) + ' · ' + M(reste(f)) + ' échus depuis ' + retardJ(f) + ' j', date: f.echeance, href: '#/ventes/factures/' + f.id, tone: niveauDu(f) === 3 ? 'red' : 'orange' }); });
    S.all('devisClients').filter(function (o) { return o.statut === 'Accepté'; }).forEach(function (o) { out.push({ title: o.id + ' · devis accepté à convertir', sub: clNom(o.client) + ' · ' + M(devisHT(o)), date: o.date, href: '#/ventes/devis/' + o.id, tone: 'green' }); });
    return out;
  }
  function summary() {
    var ca30 = caPeriod(d(-29), today()), fe = facts().filter(function (f) { return statut(f) === 'Échue'; });
    return [
      { label: 'CA facturé (30 jours)', value: F.short(ca30), icon: 'invoice', tone: 'blue', foot: 'FCFA HT', href: '#/ventes' },
      { label: 'Encours clients', value: F.short(encours()), icon: 'wallet', tone: 'orange', foot: 'DSO ' + F.num(dso()) + ' j', href: '#/ventes/clients' },
      { label: 'Factures clients échues', value: String(fe.length), icon: 'alert', tone: 'red', foot: M(echu()), href: '#/ventes/relances' }
    ];
  }

  E.register({
    id: MOD, label: 'Ventes & facturation', title: 'Clients, devis & facturation', icon: 'invoice', group: 'Finances & Achats', roles: ['finance'],
    seed: seed, render: render, pending: pending, search: search, summary: summary,
    badge: function () { return pending(E.session.user()).length; }
  });
})();
