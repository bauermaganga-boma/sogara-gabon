/* SOGARA · Espace de gestion — module « Logistique & transport »
   Enlèvements camions-citernes (planning des postes de chargement, contrôle sécurité, pesée, bon de livraison),
   appontement (escales, surestaries), flotte & engins, réservations de véhicules / transport de quart, livraisons dépôts. */
(function () {
  'use strict';
  var E = window.ERP; if (!E) return;
  var U = E.ui, F = E.fmt, S = E.store, esc = E.esc, sum = E.sum;

  if (!document.querySelector('link[href*="operations.css"]')) { var lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = 'css/operations.css'; document.head.appendChild(lk); }

  /* ------------------------------------------------------------------ référentiels */
  var PRD = {
    super: { l: 'Super sans plomb', c: '#22c55e', d: 0.745 }, gasoil: { l: 'Gasoil', c: '#f08a24', d: 0.843 }, kero: { l: 'Jet A1', c: '#eab308', d: 0.795 },
    butane: { l: 'Butane', c: '#38bdf8', d: 0.573 }, bitume: { l: 'Bitume', c: '#2b3440', d: 1.015 }, fioul: { l: 'Fioul', c: '#64748b', d: 0.946 }, brut: { l: 'Brut Rabi', c: '#5a3d28', d: 0.856 }
  };
  var PRD_CAMION = ['super', 'gasoil', 'kero', 'butane', 'bitume', 'fioul'];
  function pr(k) { return PRD[k] || { l: k, c: '#94a3b8', d: 0.85 }; }
  var CRENEAUX = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00'];
  function crFin(c) { var h = +c.slice(0, 2) + 2; return String(h).padStart(2, '0') + ':00'; }
  var POSTES = [
    { n: 1, p: ['super', 'gasoil'], l: 'Super / gasoil' }, { n: 2, p: ['super', 'gasoil'], l: 'Super / gasoil' }, { n: 3, p: ['gasoil'], l: 'Gasoil' },
    { n: 4, p: ['kero'], l: 'Jet A1 (aviation)' }, { n: 5, p: ['butane'], l: 'GPL butane' }, { n: 6, p: ['bitume', 'fioul'], l: 'Bitume / fioul' }
  ];
  var ST = ['Planifié', 'À l\'entrée', 'Chargement', 'Pesée / BL', 'Sorti'];
  var ST_TONE = { 'Planifié': 'violet', 'À l\'entrée': 'orange', 'Chargement': 'blue', 'Pesée / BL': 'yellow', 'Sorti': 'green', 'Refusé': 'red' };
  var ST_CLS = { 'Planifié': 's-plan', 'À l\'entrée': 's-entree', 'Chargement': 's-charg', 'Pesée / BL': 's-pesee', 'Sorti': 's-sorti', 'Refusé': 's-refus' };
  var ONSITE = ['À l\'entrée', 'Chargement', 'Pesée / BL'];
  var CHECK = [
    { k: 'extincteur', l: 'Extincteurs', s: '2 extincteurs 9 kg présents, plombés, contrôle périodique à jour' },
    { k: 'terre', l: 'Mise à la terre', s: 'Câble et pince de terre en bon état — continuité vérifiée au poste' },
    { k: 'epi', l: 'EPI du chauffeur', s: 'Casque, lunettes, chaussures de sécurité, vêtement ignifugé, gilet' },
    { k: 'citerne', l: 'État de la citerne', s: 'Aucune fuite, compartiments vides, trous d\'homme et vannes de fond fermés' },
    { k: 'adr', l: 'Papiers ADR', s: 'Certificat d\'agrément ADR du véhicule, formation ADR du chauffeur, consignes écrites' }
  ];
  var TRANSP_EXT = [{ id: 'TR-02', nom: 'Trans-Ogooué Citernes' }, { id: 'TR-03', nom: 'Cap Lopez Logistique' }, { id: 'TR-04', nom: 'Flotte propre du client' }];
  function transpOpts() { var f = S.get('fournisseurs', 'F-006'); return [{ v: 'F-006', l: f ? f.nom : 'Mandji Transports' }].concat(TRANSP_EXT.map(function (t) { return { v: t.id, l: t.nom }; })); }
  function transpNom(id) { var f = S.get('fournisseurs', id); if (f) return f.nom; var t = TRANSP_EXT.find(function (x) { return x.id === id; }); return t ? t.nom : id || '—'; }
  function clientNom(id) { var c = S.get('clients', id); return c ? c.nom : id || '—'; }
  var SHIP_ST = function (s) { return ['Annoncé', 'En rade', 'À quai', s.sens === 'Réception' ? 'Déchargement' : 'Chargement', 'Parti']; };
  var SHIP_TONE = { 'Annoncé': 'grey', 'En rade': 'orange', 'À quai': 'violet', 'Chargement': 'blue', 'Déchargement': 'blue', 'Parti': 'green' };
  var SHIP_COL = { 'Annoncé': '#94a3b8', 'En rade': '#e8780c', 'À quai': '#7c3aed', 'Chargement': '#2563eb', 'Déchargement': '#2563eb', 'Parti': '#1e9e4a' };
  var MIS_TONE = { 'Demandée': 'orange', 'Validée': 'violet', 'En cours': 'blue', 'Terminée': 'green', 'Refusée': 'red' };
  var CIRCUITS = [
    { quart: 'Quart du matin (06h–14h)', dep: '05:15', circuit: 'Circuit Nord — Balise, Château, Aviation', bus: 'VH-05', inscrits: 26 },
    { quart: 'Quart du matin (06h–14h)', dep: '05:20', circuit: 'Circuit Sud — Grand Village, Salsa, Ntchengue', bus: 'VH-07', inscrits: 22 },
    { quart: 'Quart d\'après-midi (14h–22h)', dep: '13:15', circuit: 'Circuit Nord — Balise, Château, Aviation', bus: 'VH-05', inscrits: 24 },
    { quart: 'Quart d\'après-midi (14h–22h)', dep: '13:20', circuit: 'Circuit Sud — Grand Village, Salsa, Ntchengue', bus: 'VH-07', inscrits: 21 },
    { quart: 'Quart de nuit (22h–06h)', dep: '21:15', circuit: 'Circuit unique — Centre-ville, Quartier Chic, Sud', bus: 'VH-14', inscrits: 13, note: 'Remplace le bus VH-06 (immobilisé)' }
  ];

  /* ------------------------------------------------------------------ utilitaires */
  function pad(n) { return String(n).padStart(2, '0'); }
  function nowHM() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function nowISO() { return E.today() + 'T' + nowHM(); }
  function nextNum(prefix, list, field) { var n = Math.max.apply(null, list.map(function (x) { var m = String(x[field || 'id'] || '').match(/(\d+)$/); return m ? +m[1] : 0; }).concat([100])) + 1; return prefix + '-2026-' + String(n).padStart(4, '0'); }
  function dt(day, hm) { return E.addDays(E.today(), day) + 'T' + hm; }
  function fdtS(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + ' ' + s.slice(11, 16) : '—'; }
  function pl(k) { return pr(k).l.replace(' sans plomb', ' SP'); }
  function fdt(s) { return s ? F.dateShort(s.slice(0, 10)) + ' ' + s.slice(11, 16) : '—'; }
  function mins(a, b) { if (!a || !b) return null; return (+b.slice(0, 2) * 60 + +b.slice(3, 5)) - (+a.slice(0, 2) * 60 + +a.slice(3, 5)); }
  function hmDur(m) { if (m == null) return '—'; return m >= 60 ? Math.floor(m / 60) + ' h ' + pad(m % 60) : m + ' min'; }
  function dot(c) { return '<i class="ops-dot" style="background:' + c + '"></i>'; }
  function empIdByName(part) { var e = S.all('employes').find(function (x) { return x.nom.indexOf(part) === 0; }); return e ? e.id : ''; }
  function empOpts() { return S.all('employes').map(function (e) { return { v: e.id, l: e.nom + ' — ' + e.poste }; }); }
  function dayLabel(d) { var x = E.parseDate(d), j = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][x.getDay()]; return j + ' ' + pad(x.getDate()) + '/' + pad(x.getMonth() + 1); }
  function dayLong(d) { var x = E.parseDate(d), j = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'][x.getDay()]; return j + ' ' + F.date(d); }
  function docHead(titre, num, date) {
    return '<div class="doc__head"><div class="row" style="gap:12px"><img src="../assets/img/logo.png" alt="SOGARA"><div><b style="font-family:Sora,sans-serif;font-size:16px;color:var(--navy)">SOGARA</b><div class="small muted">Société Gabonaise de Raffinage<br>Raffinerie de Port-Gentil — Gabon</div></div></div>' +
      '<div style="text-align:right"><h4>' + esc(titre) + '</h4><div class="mono">' + esc(num) + '</div><div class="small muted">' + esc(date) + '</div></div></div>';
  }
  function printModal(title, html) {
    U.modal({ title: title, size: 'lg', body: '<div class="doc">' + html + '</div>', actions: [{ label: 'Fermer' }, { label: 'Imprimer', cls: 'primary', icon: 'print', onClick: function () { document.body.classList.add('ops-print'); setTimeout(function () { window.print(); document.body.classList.remove('ops-print'); }, 30); } }] });
  }

  /* ------------------------------------------------------------------ calculs */
  function enls() { return S.all('enlevements'); }
  function enlDay(d) { return enls().filter(function (e) { return e.date === d; }); }
  function onSite() { return enlDay(E.today()).filter(function (e) { return ONSITE.indexOf(e.statut) >= 0; }); }
  function passage(list) { var l = list.filter(function (e) { return e.statut === 'Sorti' && e.heureEntree && e.heureSortie; }).map(function (e) { return mins(e.heureEntree, e.heureSortie); }); return l.length ? Math.round(sum(l) / l.length) : null; }
  function volEnl(e) { return e.statut === 'Sorti' || e.statut === 'Pesée / BL' ? (e.volumeCharge || e.volume) : 0; }
  function fillRate(d) { return enlDay(d).filter(function (e) { return e.statut !== 'Refusé'; }).length / (CRENEAUX.length * POSTES.length) * 100; }
  function lateTrucks() {
    var now = nowHM(); return enlDay(E.today()).filter(function (e) { return e.statut === 'Planifié' && crFin(e.creneau) <= now; });
  }
  function demurrage(s) {
    if (!s.nor) return { used: 0, ex: 0, fcfa: 0, running: false };
    var start = +new Date(s.nor) + 6 * 3600e3, end = s.fin ? +new Date(s.fin) : Date.now();
    var used = Math.max(0, (end - start) / 3600e3), ex = Math.max(0, used - s.planche);
    return { used: used, ex: ex, fcfa: ex / 24 * s.taux, running: !s.fin && s.statut !== 'Annoncé' };
  }
  function navires() { return S.all('navires'); }
  function attendus(n) { var lim = E.addDays(E.today(), n || 7); return navires().filter(function (s) { return s.statut === 'Annoncé' && s.eta.slice(0, 10) <= lim; }); }
  function vehs() { return S.all('vehicules'); }
  function echeance(d) { var j = E.daysBetween(E.today(), d); return { j: j, tone: j < 0 ? 'red' : j <= 30 ? 'orange' : 'green', txt: j < 0 ? 'échue depuis ' + (-j) + ' j' : j === 0 ? 'aujourd\'hui' : 'dans ' + j + ' j' }; }
  function vehAlerts() {
    var out = [];
    vehs().forEach(function (v) {
      [['vt', v.type === 'Engin de levage' ? 'VGP' : 'Visite technique'], ['assurance', 'Assurance']].forEach(function (k) {
        var e = echeance(v[k[0]]); if (e.j <= 30) out.push({ v: v, k: k[1], e: e });
      });
    });
    return out.sort(function (a, b) { return a.e.j - b.e.j; });
  }
  function livs() { return S.all('livraisons'); }
  function livEcart(l) { return l.volumeLivre == null ? null : (l.volumeLivre - l.volumeCharge) / l.volumeCharge * 100; }
  function livLate(l) { return l.statut === 'En transit' && l.arriveePrevue < E.today(); }
  var TOL = 0.3;

  function alerts() {
    var out = [];
    vehAlerts().forEach(function (a) { out.push({ tone: a.e.j < 0 ? 'red' : 'orange', icon: 'truck', title: a.k + ' ' + a.e.txt + ' — ' + a.v.modele, sub: a.v.immat + ' · ' + a.v.type + (a.e.j < 0 ? ' · véhicule à immobiliser' : ' · échéance le ' + F.date(a.k === 'Assurance' ? a.v.assurance : a.v.vt)), href: '#/logistique/flotte/' + a.v.id }); });
    navires().forEach(function (s) { var d = demurrage(s); if (d.running && d.ex > 0) out.push({ tone: 'red', icon: 'ship', title: 'Surestaries en cours — ' + s.navire, sub: F.num(d.ex, 1) + ' h au-delà du temps de planche · ' + F.short(d.fcfa) + ' FCFA estimés', href: '#/logistique/navires/' + s.id }); });
    lateTrucks().forEach(function (e) { out.push({ tone: 'orange', icon: 'clock', title: 'Camion non présenté — ' + e.immat, sub: clientNom(e.clientId) + ' · créneau ' + e.creneau + '–' + crFin(e.creneau) + ' · poste ' + e.poste, href: '#/logistique/enlevements/' + e.id }); });
    livs().filter(livLate).forEach(function (l) { out.push({ tone: 'orange', icon: 'pin', title: 'Livraison en retard — ' + l.depot, sub: l.id + ' · ' + pr(l.produit).l + ' ' + F.num(l.volumeCharge) + ' m³ · attendue le ' + F.date(l.arriveePrevue), href: '#/logistique/livraisons/' + l.id }); });
    livs().filter(function (l) { var e = livEcart(l); return e != null && Math.abs(e) > TOL && !l.ecartTraite; }).forEach(function (l) { out.push({ tone: 'red', icon: 'alert', title: 'Écart de livraison ' + F.num(livEcart(l), 2) + ' % — ' + l.depot, sub: l.id + ' · ' + F.num(l.volumeLivre - l.volumeCharge, 1) + ' m³ · tolérance ± ' + F.num(TOL, 1) + ' %', href: '#/logistique/livraisons/' + l.id }); });
    return out;
  }

  /* ------------------------------------------------------------------ données d'exemple */
  function seed() {
    var CH = ['Nzigou Armand', 'Mouele Jérôme', 'Ndong Ella Fabrice', 'Boukandou Serge', 'Mabiala Roger', 'Obame Nkoghe Lucien', 'Moukagni Patrice', 'Kombila Hugues', 'Ivanga Didier', 'Nziengui Thierry', 'Ekouaga Romuald', 'Mbadinga Victor'];
    var TR = ['F-006', 'F-006', 'TR-02', 'F-006', 'TR-03', 'TR-04'];
    var L = 'ABCDEFGHJKLMNPRST';
    var DEST = { 'C-01': 'Dépôt Estuaire Carburants — zone portuaire', 'C-02': 'Stations Ogooué Énergies — Port-Gentil', 'C-03': 'Réseau Stations Équateur — dépôt de transit du port', 'C-04': 'Avitaillement aéroport de Port-Gentil', 'C-05': 'Centre emplisseur Gaz du Littoral', 'C-06': 'Centrale d\'enrobage — Routes & Bitumes du Gabon', 'C-08': 'Énergie Électrique Industrielle — expédition par barge' };
    var R = [
      [-3, 0, 1, 'C-02', 'super', 33, 'Sorti', '06:05', '07:02'], [-3, 0, 3, 'C-01', 'gasoil', 38, 'Sorti', '06:10', '07:15'], [-3, 1, 5, 'C-05', 'butane', 20, 'Sorti', '08:02', '08:55'], [-3, 2, 4, 'C-04', 'kero', 33, 'Sorti', '10:05', '11:10'], [-3, 3, 6, 'C-06', 'bitume', 25, 'Sorti', '12:10', '13:40'],
      [-2, 0, 2, 'C-02', 'gasoil', 36, 'Sorti', '06:02', '06:57'], [-2, 1, 1, 'C-03', 'super', 33, 'Sorti', '08:15', '09:20'], [-2, 1, 5, 'C-05', 'butane', 20, 'Sorti', '08:20', '09:05'], [-2, 3, 3, 'C-08', 'gasoil', 36, 'Sorti', '12:05', '13:12'], [-2, 4, 4, 'C-04', 'kero', 33, 'Sorti', '14:02', '15:01'],
      [-1, 0, 1, 'C-02', 'super', 33, 'Sorti', '06:04', '06:59'], [-1, 0, 3, 'C-01', 'gasoil', 38, 'Sorti', '06:08', '07:20'], [-1, 1, 5, 'C-05', 'butane', 20, 'Sorti', '08:01', '08:49'], [-1, 1, 4, 'C-04', 'kero', 33, 'Sorti', '08:12', '09:18'], [-1, 2, 2, 'C-02', 'gasoil', 36, 'Refusé', '10:03', ''], [-1, 3, 6, 'C-06', 'bitume', 25, 'Sorti', '12:20', '13:55'], [-1, 4, 1, 'C-03', 'super', 33, 'Sorti', '14:05', '15:02'],
      [0, 0, 1, 'C-02', 'super', 33, 'Sorti', '06:05', '06:58'], [0, 0, 3, 'C-02', 'gasoil', 36, 'Sorti', '06:12', '07:20'], [0, 0, 5, 'C-05', 'butane', 20, 'Sorti', '06:20', '07:15'], [0, 1, 2, 'C-01', 'gasoil', 38, 'Sorti', '08:04', '09:02'],
      [0, 1, 4, 'C-04', 'kero', 33, 'Pesée / BL', '08:10', ''], [0, 1, 6, 'C-06', 'bitume', 25, 'Chargement', '08:25', ''], [0, 2, 1, 'C-03', 'super', 33, 'Chargement', '09:50', ''], [0, 2, 3, 'C-08', 'gasoil', 36, 'À l\'entrée', '10:02', ''], [0, 2, 5, 'C-05', 'butane', 20, 'À l\'entrée', '10:06', ''],
      [0, 3, 2, 'C-02', 'super', 33, 'Planifié'], [0, 3, 4, 'C-04', 'kero', 33, 'Planifié'], [0, 4, 3, 'C-01', 'gasoil', 38, 'Planifié'], [0, 4, 1, 'C-02', 'gasoil', 36, 'Planifié'], [0, 5, 5, 'C-05', 'butane', 20, 'Planifié'],
      [1, 0, 1, 'C-02', 'super', 33, 'Planifié'], [1, 0, 3, 'C-01', 'gasoil', 38, 'Planifié'], [1, 1, 5, 'C-05', 'butane', 20, 'Planifié'], [1, 2, 4, 'C-04', 'kero', 33, 'Planifié'], [1, 3, 6, 'C-06', 'bitume', 25, 'Planifié'],
      [2, 0, 2, 'C-02', 'gasoil', 36, 'Planifié'], [2, 1, 5, 'C-05', 'butane', 20, 'Planifié'], [2, 2, 1, 'C-03', 'super', 33, 'Planifié']
    ];
    var bl = 830;
    var enl = R.map(function (r, i) {
      var st = r[6], p = pr(r[4]), loaded = st === 'Sorti' || st === 'Pesée / BL';
      var vc = loaded ? Math.round((r[5] - (i % 3) * 0.04 - 0.02) * 100) / 100 : null, vide = 14200 + (i * 137) % 1600;
      var all = ['Chargement', 'Pesée / BL', 'Sorti'].indexOf(st) >= 0;
      var chk = {}; CHECK.forEach(function (c, j) { chk[c.k] = all || (st === 'À l\'entrée' && i % 2 === 0 && j < 2) || (st === 'Refusé' && c.k !== 'extincteur'); });
      return {
        id: 'ENL-' + (2401 + i), date: E.addDays(E.today(), r[0]), creneau: CRENEAUX[r[1]], poste: r[2], clientId: r[3], produit: r[4], volume: r[5],
        transporteurId: TR[i % TR.length], immat: (1000 + (i * 487) % 8999) + ' G' + (i % 5 === 0 ? 1 : 8) + ' ' + L[i % L.length] + (i % 3 ? '' : L[(i * 7) % L.length]),
        chauffeur: CH[i % CH.length], destination: DEST[r[3]] || '', statut: st, heureEntree: r[7] || '', heureSortie: r[8] || '', checklist: chk,
        volumeCharge: vc, temperature: loaded ? 30 + (i % 4) : null, densite: p.d, poidsVide: loaded ? vide : null, poidsPlein: loaded ? Math.round(vide + vc * p.d * 1000) : null,
        bl: loaded ? 'BL-2026-0' + (bl++) : '', plombs: loaded ? 'P' + (40210 + i * 3) + ' à P' + (40212 + i * 3) : '',
        motifRefus: st === 'Refusé' ? 'Extincteur périmé (dernier contrôle 03/2025) — véhicule renvoyé, créneau à reprogrammer' : ''
      };
    });

    var nav = [
      { id: 'ESC-2026-041', navire: 'MT Rabi Spirit', type: 'Pétrolier (brut)', sens: 'Réception', produit: 'brut', quantite: 47500, fait: 18900, partenaire: 'Terminal de Cap Lopez', pavillon: 'Libéria', longueur: 183, tirant: 10.2, eta: dt(-2, '20:00'), etd: dt(0, '22:00'), nor: dt(-2, '22:00'), accostage: dt(-1, '05:30'), debut: dt(-1, '07:00'), fin: '', depart: '', statut: 'Déchargement', planche: 48, taux: 9000000, bacs: 'T-02' },
      { id: 'ESC-2026-042', navire: 'MT Mandji Trader', type: 'Pétrolier (produits noirs)', sens: 'Export', produit: 'fioul', quantite: 30000, fait: 0, partenaire: 'Atlantic Fuel Trading', clientId: 'C-07', pavillon: 'Malte', longueur: 176, tirant: 9.8, eta: dt(-3, '14:00'), etd: dt(2, '06:00'), nor: dt(-3, '15:30'), accostage: '', debut: '', fin: '', depart: '', statut: 'En rade', planche: 42, taux: 13200000, bacs: 'T-10 / T-11', note: 'Attente de l\'appontement occupé par le MT Rabi Spirit' },
      { id: 'ESC-2026-043', navire: 'Caboteur Nyanga', type: 'Caboteur produits blancs', sens: 'Cabotage', produit: 'gasoil', quantite: 4500, fait: 0, partenaire: 'Dépôt d\'Owendo (Libreville)', pavillon: 'Gabon', longueur: 92, tirant: 5.6, eta: dt(2, '06:00'), etd: dt(3, '02:00'), nor: '', accostage: '', debut: '', fin: '', depart: '', statut: 'Annoncé', planche: 18, taux: 3000000, bacs: 'T-08 / T-04', note: 'Gasoil 3 000 m³ + super 1 500 m³' },
      { id: 'ESC-2026-044', navire: 'Barge Lambaréné II', type: 'Barge fluviale', sens: 'Cabotage', produit: 'super', quantite: 650, fait: 0, partenaire: 'Dépôt de Lambaréné (Ogooué)', pavillon: 'Gabon', longueur: 48, tirant: 2.1, eta: dt(4, '07:00'), etd: dt(4, '18:00'), nor: '', accostage: '', debut: '', fin: '', depart: '', statut: 'Annoncé', planche: 10, taux: 900000, bacs: 'T-04 / T-08' },
      { id: 'ESC-2026-045', navire: 'MT Cap Lopez Pioneer', type: 'Pétrolier (brut)', sens: 'Réception', produit: 'brut', quantite: 47000, fait: 0, partenaire: 'Terminal de Cap Lopez', pavillon: 'Bahamas', longueur: 183, tirant: 10.4, eta: dt(13, '08:00'), etd: dt(15, '12:00'), nor: '', accostage: '', debut: '', fin: '', depart: '', statut: 'Annoncé', planche: 48, taux: 9000000, bacs: 'T-01 / T-03' },
      { id: 'ESC-2026-040', navire: 'Caboteur Ogooué Express', type: 'Caboteur produits blancs', sens: 'Cabotage', produit: 'gasoil', quantite: 2900, fait: 2900, partenaire: 'Dépôt d\'Owendo (Libreville)', pavillon: 'Gabon', longueur: 88, tirant: 5.4, eta: dt(-3, '06:00'), etd: dt(-2, '12:00'), nor: dt(-3, '06:30'), accostage: dt(-3, '08:00'), debut: dt(-3, '09:00'), fin: dt(-2, '10:00'), depart: dt(-2, '11:30'), statut: 'Parti', planche: 18, taux: 3000000, bacs: 'T-08' },
      { id: 'ESC-2026-039', navire: 'Caboteur Komo', type: 'Caboteur produits blancs', sens: 'Cabotage', produit: 'kero', quantite: 4400, fait: 4400, partenaire: 'Dépôt d\'Owendo (Libreville)', pavillon: 'Gabon', longueur: 92, tirant: 5.6, eta: dt(-5, '08:00'), etd: dt(-4, '16:00'), nor: dt(-5, '08:30'), accostage: dt(-5, '10:00'), debut: dt(-5, '11:00'), fin: dt(-4, '13:00'), depart: dt(-4, '15:00'), statut: 'Parti', planche: 24, taux: 3000000, bacs: 'T-04 / T-06', note: 'Super 2 200 m³ + Jet A1 2 200 m³' },
      { id: 'ESC-2026-037', navire: 'MT Atlantic Grace', type: 'Pétrolier (produits noirs)', sens: 'Export', produit: 'fioul', quantite: 26000, fait: 26000, partenaire: 'Atlantic Fuel Trading', clientId: 'C-07', pavillon: 'Grèce', longueur: 179, tirant: 9.9, eta: dt(-14, '04:00'), etd: dt(-12, '16:00'), nor: dt(-14, '06:00'), accostage: dt(-13, '09:00'), debut: dt(-13, '10:30'), fin: dt(-12, '12:00'), depart: dt(-12, '15:00'), statut: 'Parti', planche: 36, taux: 13200000, bacs: 'T-10 / T-11', note: 'Surestaries refacturées à l\'affréteur : retard de mise à disposition du lot (analyse labo)' }
    ];

    var V = [
      ['VH-01', '3184 G8 A', 'Véhicule de service', 'Toyota Hilux double cabine', 'HSE', 'Makaya', 84300, 120, 200, 210, 'Disponible', 5],
      ['VH-02', '0457 G1 C', 'Véhicule de service', 'Toyota Land Cruiser 200', 'DG', '', 61200, -6, 140, 320, 'Disponible', 5],
      ['VH-03', '2219 G8 B', 'Véhicule de service', 'Toyota Hilux simple cabine', 'MAINT', 'Mapangou', 132500, 15, 95, 280, 'En mission', 3],
      ['VH-04', '5560 G8 D', 'Véhicule de service', 'Mitsubishi L200', 'PROD', 'Mintsa', 98700, 210, 230, 190, 'Disponible', 5],
      ['VH-05', '7712 G8 E', 'Bus du personnel', 'Toyota Coaster 30 places', 'RH', 'Nkoghe', 241000, 45, 180, 1450, 'Disponible', 30],
      ['VH-06', '7713 G8 E', 'Bus du personnel', 'Toyota Coaster 30 places', 'RH', '', 268400, -3, 180, 980, 'Immobilisé', 30],
      ['VH-07', '6620 G8 F', 'Bus du personnel', 'Hyundai County 25 places', 'RH', '', 154900, 90, 60, 1320, 'Disponible', 25],
      ['VH-08', '8841 G8 H', 'Camion', 'Mercedes Actros plateau-grue 10 t', 'MAINT', '', 187300, 60, 12, 860, 'Disponible', 2],
      ['VH-09', '8902 G8 J', 'Camion', 'Renault Kerax citerne eau / incendie', 'HSE', 'Makaya', 76400, 150, 170, 410, 'Disponible', 3],
      ['VH-10', 'ENG-050', 'Engin de levage', 'Grue mobile Liebherr 50 t', 'MAINT', '', 9800, 25, 210, 640, 'En mission', 1],
      ['VH-11', 'ENG-012', 'Engin de levage', 'Chariot élévateur Toyota 5 t', 'ACH', 'Mengue', 6200, -10, 160, 120, 'Immobilisé', 1],
      ['VH-12', 'ENG-031', 'Engin de levage', 'Nacelle articulée 16 m', 'MAINT', '', 3400, 70, 120, 95, 'Disponible', 2],
      ['VH-13', '1190 G8 K', 'Ambulance', 'Toyota Land Cruiser ambulance', 'HSE', 'Ntoutoume', 45600, 30, 260, 150, 'Disponible', 3],
      ['VH-14', '4471 G8 L', 'Véhicule de service', 'Toyota Hiace 14 places', 'ACH', 'Nkoghe', 119800, 100, 75, 540, 'En mission', 14]
    ];
    var veh = V.map(function (r) { return { id: r[0], immat: r[1], type: r[2], modele: r[3], affectation: r[4], conducteur: r[5] ? empIdByName(r[5]) : '', km: r[6], vt: E.addDays(E.today(), r[7]), assurance: E.addDays(E.today(), r[8]), carburantMois: r[9], statut: r[10], places: r[11] }; });

    var M = [
      ['MIS-2026-118', 'Mission', 'Boussougou', 'Réunion technique au terminal de Cap Lopez', 'Terminal de Cap Lopez', 0, '13:30', 0, 3, '', 'Demandée'],
      ['MIS-2026-119', 'Mission', 'Mayila', 'Prélèvement d\'échantillons — MT Mandji Trader (en rade)', 'Appontement / vedette du port', 0, '15:00', 0, 2, '', 'Demandée'],
      ['MIS-2026-120', 'Navette', 'Allogho', 'Accueil de 4 stagiaires ingénieurs — aéroport', 'Aéroport de Port-Gentil', 1, '07:30', 1, 5, '', 'Demandée'],
      ['MIS-2026-117', 'Mission', 'Moussavou', 'Inspection HSE du dépôt de transit portuaire', 'Port môle — dépôt de transit', 0, '09:00', 0, 3, 'VH-01', 'En cours'],
      ['MIS-2026-116', 'Mission', 'Mbina', 'Enlèvement de pièces au transitaire (garnitures P-101)', 'Port-Gentil — zone portuaire', 1, '08:00', 1, 2, 'VH-03', 'Validée'],
      ['MIS-2026-115', 'Transport de quart', 'Ekomi', 'Renfort de quart — arrêt de l\'unité U300', 'Raffinerie (circuit Sud)', 2, '05:20', 2, 12, 'VH-14', 'Validée'],
      ['MIS-2026-114', 'Mission', 'Nzé', 'Rendez-vous banque et Trésor', 'Port-Gentil — centre-ville', -1, '10:00', -1, 2, 'VH-04', 'Terminée'],
      ['MIS-2026-113', 'Navette', 'Mboumba', 'Visite médicale annuelle — groupe 3', 'Centre médical interentreprises', -2, '08:00', -2, 12, 'VH-14', 'Terminée'],
      ['MIS-2026-112', 'Mission', 'Ondo Mba', 'Audit fournisseur Mandji Transports', 'Mandji Transports — dépôt', -3, '09:30', -3, 3, 'VH-04', 'Terminée'],
      ['MIS-2026-111', 'Mission', 'Mamfoumbi', 'Visite client — stations du centre-ville', 'Port-Gentil — centre-ville', -2, '14:00', -2, 2, '', 'Refusée']
    ];
    var mis = M.map(function (r) { return { id: r[0], type: r[1], demandeur: empIdByName(r[2]), motif: r[3], destination: r[4], date: E.addDays(E.today(), r[5]), heure: r[6], retour: E.addDays(E.today(), r[7]), passagers: r[8], vehiculeId: r[9], statut: r[10], motifRefus: r[10] === 'Refusée' ? 'Aucun véhicule disponible sur le créneau — proposer le lendemain' : '' }; });

    var LV = [
      ['LIV-2026-061', 'Libreville (Owendo)', 'C-01', 'super', 'Caboteur', 'Caboteur Komo', 2200, 2195, -4, -3, -3],
      ['LIV-2026-062', 'Libreville (Owendo)', 'C-04', 'kero', 'Caboteur', 'Caboteur Komo', 2200, 2192, -4, -3, -3],
      ['LIV-2026-063', 'Libreville (Owendo)', 'C-01', 'gasoil', 'Caboteur', 'Caboteur Ogooué Express', 2900, 2896, -2, -1, -1],
      ['LIV-2026-064', 'Franceville', 'C-03', 'gasoil', 'Caboteur + Transgabonais', 'Wagons-citernes WC-2231 à 2242', 480, null, -6, 1, null],
      ['LIV-2026-065', 'Moanda', 'C-08', 'gasoil', 'Caboteur + Transgabonais', 'Wagons-citernes WC-2190 à 2198', 360, null, -6, -1, null],
      ['LIV-2026-066', 'Lambaréné', 'C-02', 'super', 'Barge fluviale (Ogooué)', 'Barge Lambaréné I', 180, null, -2, 0, null],
      ['LIV-2026-067', 'Lambaréné', 'C-02', 'gasoil', 'Barge fluviale (Ogooué)', 'Barge Lambaréné I', 240, 239.4, -9, -7, -7],
      ['LIV-2026-068', 'Oyem', 'C-01', 'gasoil', 'Caboteur + route', 'Camions Trans-Ogooué Citernes', 300, 299.3, -8, -3, -2],
      ['LIV-2026-069', 'Oyem', 'C-01', 'super', 'Caboteur + route', 'Camions Trans-Ogooué Citernes', 150, null, -3, 2, null],
      ['LIV-2026-060', 'Franceville', 'C-03', 'super', 'Caboteur + Transgabonais', 'Wagons-citernes WC-2101 à 2109', 300, 296.5, -12, -5, -5],
      ['LIV-2026-059', 'Mouila', 'C-03', 'gasoil', 'Caboteur + route', 'Camions Mandji Transports', 120, 119.8, -14, -9, -9]
    ];
    var lv = LV.map(function (r) { return { id: r[0], depot: r[1], clientId: r[2], produit: r[3], mode: r[4], vecteur: r[5], volumeCharge: r[6], volumeLivre: r[7], depart: E.addDays(E.today(), r[8]), arriveePrevue: E.addDays(E.today(), r[9]), arrivee: r[10] == null ? '' : E.addDays(E.today(), r[10]), statut: r[7] == null ? 'En transit' : 'Livré' }; });

    return { enlevements: enl, navires: nav, vehicules: veh, missions: mis, livraisons: lv };
  }

  /* ------------------------------------------------------------------ vues */
  var TABS = [
    { k: 'apercu', l: 'Tableau de bord' }, { k: 'enlevements', l: 'Enlèvements camions' }, { k: 'navires', l: 'Appontement' },
    { k: 'flotte', l: 'Flotte & engins' }, { k: 'missions', l: 'Réservations & transport' }, { k: 'livraisons', l: 'Livraisons dépôts' }
  ];
  var state = { day: null, mode: 'planning', fType: '', livF: '', misF: '' };

  function render(view, params) {
    var tab = params[0] || 'apercu'; if (!TABS.some(function (t) { return t.k === tab; })) tab = 'apercu';
    if (!state.day) state.day = E.today();
    var td = enlDay(E.today()), vToday = sum(td, volEnl), wk = [], i;
    for (i = -6; i <= 0; i++) wk = wk.concat(enlDay(E.addDays(E.today(), i)));
    var vWeek = sum(wk, volEnl), pass = passage(wk), att = attendus(7), demur = navires().filter(function (s) { return demurrage(s).running && demurrage(s).ex > 0; });
    var head = '<div class="grid g4 ops-kpis">' +
      U.kpi({ label: 'Enlevé aujourd\'hui', value: F.num(vToday), unit: 'm³', icon: 'truck', tone: 'blue', foot: td.filter(function (e) { return e.statut === 'Sorti'; }).length + ' camions sortis · ' + F.num(vWeek) + ' m³ sur 7 j' }) +
      U.kpi({ label: 'Camions sur site', value: onSite().length, icon: 'pin', tone: onSite().length ? 'orange' : 'green', foot: td.filter(function (e) { return e.statut === 'Planifié'; }).length + ' encore attendus aujourd\'hui' }) +
      U.kpi({ label: 'Temps de passage', value: pass == null ? '—' : pass, unit: 'min', icon: 'clock', tone: pass != null && pass > 70 ? 'orange' : 'green', foot: 'entrée → sortie · objectif 60 min' }) +
      U.kpi({ label: 'Navires attendus', value: att.length, icon: 'ship', tone: 'violet', foot: demur.length ? '<span class="down">' + demur.length + ' en surestaries</span>' : 'aucune surestarie en cours' }) +
      '</div>';
    var counts = { enlevements: td.length, navires: navires().filter(function (s) { return s.statut !== 'Parti'; }).length, flotte: vehs().length, missions: S.all('missions').filter(function (m) { return m.statut === 'Demandée'; }).length || null, livraisons: livs().filter(function (l) { return l.statut === 'En transit'; }).length };
    view.innerHTML = head + U.tabs(TABS.map(function (t) { return { k: t.k, l: t.l, n: counts[t.k] }; }), tab, function (k) { E.go('logistique/' + k); }) + '<div id="lg-body" class="ops-scope"></div>';
    var body = view.querySelector('#lg-body');
    ({ apercu: vApercu, enlevements: vEnl, navires: vNav, flotte: vFlotte, missions: vMissions, livraisons: vLiv })[tab](body);
    var id = params[1];
    if (id) {
      if (tab === 'enlevements' && S.get('enlevements', id)) openEnl(id, true);
      if (tab === 'navires' && S.get('navires', id)) openShip(id, true);
      if (tab === 'flotte' && S.get('vehicules', id)) openVeh(id, true);
      if (tab === 'livraisons' && S.get('livraisons', id)) openLiv(id, true);
      if (tab === 'missions' && S.get('missions', id)) openMission(id, true);
    }
  }
  function clearDeep(tab) { if (location.hash.split('/').length > 3) history.replaceState(null, '', '#/logistique/' + tab); }
  function alertsList(list) {
    if (!list.length) return '<div class="empty">Aucune alerte en cours.</div>';
    return '<div class="list ops-alerts">' + list.map(function (a) { return '<a class="list__item" href="' + a.href + '" style="color:inherit"><div class="list__icon tone-' + a.tone + '">' + E.icon(a.icon) + '</div><div class="list__body"><b>' + esc(a.title) + '</b><div class="small muted">' + esc(a.sub) + '</div></div></a>'; }).join('') + '</div>';
  }

  /* ---------- Tableau de bord ---------- */
  function vApercu(el) {
    var days = []; for (var i = -3; i <= 2; i++) days.push(E.addDays(E.today(), i));
    var prods = ['super', 'gasoil', 'kero', 'butane', 'bitume'];
    var series = prods.map(function (k) { return { name: pr(k).l, color: pr(k).c, values: days.map(function (d) { return sum(enlDay(d).filter(function (e) { return e.produit === k && e.statut !== 'Refusé'; }), function (e) { return d > E.today() || e.statut === 'Planifié' ? e.volume : volEnl(e) || e.volume; }); }) }; });
    var wk = []; for (var j = -6; j <= 0; j++) wk = wk.concat(enlDay(E.addDays(E.today(), j)));
    var td = enlDay(E.today()), site = onSite(), fr = fillRate(E.today());
    var actifs = navires().filter(function (s) { return s.statut !== 'Parti'; }).sort(function (a, b) { return a.eta.localeCompare(b.eta); });
    var transit = livs().filter(function (l) { return l.statut === 'En transit'; });
    var al = alerts();
    el.innerHTML =
      '<div class="grid g-2-1">' +
        '<div class="card"><div class="card__h"><h3>Enlèvements camions par jour</h3><span class="sub">m³ — réalisés, puis programmés à partir de demain</span></div><div class="card__b">' + U.bars({ labels: days.map(function (d) { return d === E.today() ? 'Aujourd\'hui' : dayLabel(d); }), series: series, stacked: true, height: 230 }) + '</div></div>' +
        '<div class="card"><div class="card__h"><h3>Volumes par produit</h3></div>' +
          U.table([
            { key: 'p', label: 'Produit', cls: 'nowrap', render: function (k) { return dot(pr(k).c) + esc(pr(k).l.replace(' sans plomb', '')); } },
            { key: 'j', label: 'Aujourd\'hui', num: 1, render: function (k) { return '<b>' + F.num(sum(td.filter(function (e) { return e.produit === k; }), volEnl)) + '</b>'; } },
            { key: 's', label: '7 jours', num: 1, render: function (k) { return F.num(sum(wk.filter(function (e) { return e.produit === k; }), volEnl)); } },
            { key: 'n', label: 'Camions', num: 1, render: function (k) { return wk.filter(function (e) { return e.produit === k && e.statut === 'Sorti'; }).length; } }
          ], prods, { footer: function () { return '<td>Total (m³)</td><td class="num">' + F.num(sum(td, volEnl)) + '</td><td class="num">' + F.num(sum(wk, volEnl)) + '</td><td class="num">' + wk.filter(function (e) { return e.statut === 'Sorti'; }).length + '</td>'; } }) + '</div>' +
      '</div>' +
      '<div class="grid g3" style="margin-top:16px">' +
        '<div class="card"><div class="card__h"><h3>Remplissage des créneaux</h3><span class="sub">aujourd\'hui</span></div><div class="card__b">' + U.gauge(fr, td.filter(function (e) { return e.statut !== 'Refusé'; }).length + ' camions sur ' + CRENEAUX.length * POSTES.length + ' créneaux-postes', fr > 85 ? '#d93636' : fr > 50 ? '#1e9e4a' : '#e8780c') +
          '<div style="margin-top:14px" class="stack">' + POSTES.map(function (p) { var n = td.filter(function (e) { return e.poste === p.n && e.statut !== 'Refusé'; }).length; return '<div><div class="row small" style="justify-content:space-between"><span><b>Poste ' + p.n + '</b> · ' + esc(p.l) + '</span><span>' + n + '/' + CRENEAUX.length + '</span></div>' + U.progress(n / CRENEAUX.length * 100) + '</div>'; }).join('') + '</div></div></div>' +
        '<div class="card"><div class="card__h"><h3>Camions sur site</h3><span class="badge tone-orange">' + site.length + '</span><span class="spacer"></span><a class="btn sm ghost" href="#/logistique/enlevements">Planning</a></div>' +
          (site.length ? '<div class="list">' + site.map(function (e) { return '<a class="list__item" href="#/logistique/enlevements/' + e.id + '" style="color:inherit"><div class="list__icon tone-' + ST_TONE[e.statut] + '">' + E.icon('truck') + '</div><div class="list__body"><b>' + esc(e.immat) + ' · ' + esc(pr(e.produit).l) + '</b><div class="small muted">' + esc(clientNom(e.clientId)) + ' · poste ' + e.poste + ' · entré à ' + esc(e.heureEntree) + '</div></div>' + U.badge(e.statut, ST_TONE[e.statut]) + '</a>'; }).join('') + '</div>' : '<div class="empty">Aucun camion sur site.</div>') + '</div>' +
        '<div class="card"><div class="card__h"><h3>Appontement</h3><span class="spacer"></span><a class="btn sm ghost" href="#/logistique/navires">Escales</a></div><div class="list">' +
          actifs.slice(0, 5).map(function (s) { var d = demurrage(s); return '<a class="list__item" href="#/logistique/navires/' + s.id + '" style="color:inherit"><div class="list__icon" style="background:' + SHIP_COL[s.statut] + '22;color:' + SHIP_COL[s.statut] + '">' + E.icon('ship') + '</div><div class="list__body"><b>' + esc(s.navire) + '</b><div class="small muted">' + esc(s.sens) + ' · ' + esc(pr(s.produit).l) + ' ' + F.num(s.quantite) + ' m³ · ' + (s.statut === 'Annoncé' ? 'ETA ' + fdt(s.eta) : 'ETD ' + fdt(s.etd)) + '</div>' + (d.running && d.ex > 0 ? '<div class="small ops-neg">Surestaries : ' + F.short(d.fcfa) + ' FCFA</div>' : '') + '</div>' + U.badge(s.statut, SHIP_TONE[s.statut]) + '</a>'; }).join('') + '</div></div>' +
      '</div>' +
      '<div class="grid g2 stack-m" style="margin-top:16px">' +
        '<div class="card"><div class="card__h"><h3>Alertes</h3><span class="badge tone-red">' + al.length + '</span></div>' + alertsList(al.slice(0, 7)) + (al.length > 7 ? '<div class="card__b small muted" style="border-top:1px solid var(--line-2)">+ ' + (al.length - 7) + ' autre(s) alerte(s) — voir les onglets Flotte et Livraisons</div>' : '') + '</div>' +
        '<div class="card"><div class="card__h"><h3>Livraisons en transit vers l\'intérieur</h3><span class="spacer"></span><a class="btn sm ghost" href="#/logistique/livraisons">Suivi</a></div><div class="list">' +
          transit.map(function (l) { return '<a class="list__item" href="#/logistique/livraisons/' + l.id + '" style="color:inherit"><div class="list__icon tone-' + (livLate(l) ? 'red' : 'blue') + '">' + E.icon('pin') + '</div><div class="list__body"><b>' + esc(l.depot) + ' · ' + esc(pr(l.produit).l) + ' ' + F.num(l.volumeCharge) + ' m³</b><div class="small muted">' + esc(l.mode) + ' · arrivée prévue ' + F.date(l.arriveePrevue) + '</div></div>' + (livLate(l) ? U.badge('En retard', 'red') : U.badge('En transit', 'blue')) + '</a>'; }).join('') + '</div></div>' +
      '</div>';
  }

  /* ---------- Enlèvements ---------- */
  function slotHTML(e) {
    return '<div class="ops-slot ' + ST_CLS[e.statut] + '" data-enl="' + e.id + '"><b>' + esc(e.immat) + '</b><span>' + dot(pr(e.produit).c) + esc(pr(e.produit).l) + ' · ' + F.num(e.volume) + ' m³</span><span>' + esc(clientNom(e.clientId)) + '</span>' + U.badge(e.statut, ST_TONE[e.statut]).replace('<span', '<em').replace(/<\/span>$/, '</em>') + '</div>';
  }
  function vEnl(el) {
    var d = state.day, list = enlDay(d), now = nowHM(), isToday = d === E.today();
    var modes = [['planning', 'Planning des postes'], ['kanban', 'Suivi par statut'], ['liste', 'Liste de la semaine']];
    var html = '<div class="ops-toolbar"><div class="ops-daynav"><button class="btn icon" id="d-prev" aria-label="Jour précédent">' + E.icon('back') + '</button><b>' + dayLong(d) + '</b><button class="btn icon" id="d-next" aria-label="Jour suivant">' + E.icon('arrow') + '</button>' + (isToday ? '' : '<button class="btn sm ghost" id="d-today">Aujourd\'hui</button>') + '</div><span class="spacer"></span>' +
      '<div class="chips" id="e-mode">' + modes.map(function (m) { return '<button class="chip' + (state.mode === m[0] ? ' is-active' : '') + '" data-k="' + m[0] + '">' + m[1] + '</button>'; }).join('') + '</div>' +
      '<button class="btn primary" id="e-new">' + E.icon('plus') + 'Programmer un enlèvement</button></div>';
    var stat = '<div class="ops-stat sm" style="margin-bottom:14px">' + ST.concat(['Refusé']).map(function (s) { return '<div><span>' + esc(s) + '</span><b style="color:var(--' + ({ violet: 'violet', orange: 'orange', blue: 'blue', yellow: 'ink', green: 'green', red: 'red' })[ST_TONE[s]] + ')">' + list.filter(function (e) { return e.statut === s; }).length + '</b></div>'; }).join('') + '<div><span>Remplissage</span><b>' + F.pct(fillRate(d)) + '</b></div></div>';
    if (state.mode === 'planning') {
      var g = '<div class="ops-plan"><div class="ops-plan__h">Créneau</div>' + POSTES.map(function (p) { return '<div class="ops-plan__h">Poste ' + p.n + '<span>' + esc(p.l) + '</span></div>'; }).join('');
      CRENEAUX.forEach(function (c) {
        var cur = isToday && now >= c && now < crFin(c);
        g += '<div class="ops-plan__t' + (cur ? ' now' : '') + '">' + c + '<span>→ ' + crFin(c) + (cur ? ' · en cours' : '') + '</span></div>';
        POSTES.forEach(function (p) {
          var here = list.filter(function (e) { return e.creneau === c && e.poste === p.n; });
          g += '<div class="ops-plan__c' + (cur ? ' now' : '') + '">' + here.map(slotHTML).join('') + (here.every(function (e) { return e.statut === 'Refusé'; }) && d >= E.today() ? '<div class="ops-plan__free" data-free="' + c + '|' + p.n + '">+ Libre</div>' : '') + '</div>';
        });
      });
      g += '</div>';
      html += '<div class="card"><div class="card__h"><h3>Planning du jour — postes de chargement</h3><span class="sub">' + list.length + ' enlèvement(s) · cliquez sur un camion pour le faire avancer, sur un créneau libre pour programmer</span></div><div class="card__b" style="padding-bottom:0">' + stat + '</div><div class="ops-plan-wrap">' + g + '</div>' +
        '<div class="card__b"><div class="legend">' + ST.concat(['Refusé']).map(function (s) { return '<span><i class="ops-slot ' + ST_CLS[s] + '" style="background:var(--sc);display:inline-block;width:10px;height:10px;padding:0;border:0"></i>' + esc(s) + '</span>'; }).join('') + '</div></div></div>';
    } else if (state.mode === 'kanban') {
      var cols = ST.concat(list.some(function (e) { return e.statut === 'Refusé'; }) ? ['Refusé'] : []);
      html += '<div class="card"><div class="card__h"><h3>Suivi des camions par statut</h3><span class="sub">' + dayLong(d) + '</span></div><div class="card__b">' + stat + '<div class="kanban">' + cols.map(function (s) {
        var l = list.filter(function (e) { return e.statut === s; }).sort(function (a, b) { return a.creneau.localeCompare(b.creneau) || a.poste - b.poste; });
        return '<div class="kcol"><div class="kcol__h">' + U.badge(s, ST_TONE[s]) + '<span class="n">' + l.length + '</span></div>' + l.map(function (e) {
          return '<div class="kcard" data-enl="' + e.id + '"><div class="row" style="justify-content:space-between"><b>' + esc(e.immat) + '</b><span class="mono small">' + esc(e.id) + '</span></div><div class="small">' + dot(pr(e.produit).c) + esc(pr(e.produit).l) + ' · <b>' + F.num(e.volume) + ' m³</b></div><div class="meta"><span>' + esc(clientNom(e.clientId)) + '</span></div><div class="meta">' + E.icon('clock').replace('<svg ', '<svg style="width:13px" ') + '<span>' + e.creneau + ' · poste ' + e.poste + (e.heureEntree ? ' · entré ' + e.heureEntree : '') + '</span></div></div>';
        }).join('') + '</div>';
      }).join('') + '</div></div></div>';
    } else {
      var wk = enls().filter(function (e) { return E.daysBetween(E.today(), e.date) >= -6 && E.daysBetween(E.today(), e.date) <= 6; }).sort(function (a, b) { return (b.date + b.creneau).localeCompare(a.date + a.creneau) || a.poste - b.poste; });
      var cols2 = enlCols();
      html += '<div class="card"><div class="card__h"><h3>Enlèvements de la semaine</h3><span class="sub">' + wk.length + ' enlèvements · ' + F.num(sum(wk, volEnl)) + ' m³ chargés</span><span class="spacer"></span><button class="btn sm" id="e-csv">' + E.icon('download') + 'Export CSV</button></div>' + U.table(cols2, wk, { onRow: function (e) { openEnl(e.id); } }) + '</div>';
      setTimeout(function () { var b = el.querySelector('#e-csv'); if (b) b.onclick = function () { U.exportCSV('enlevements-semaine-' + E.today(), cols2, wk); }; });
    }
    el.innerHTML = html;
    el.querySelector('#d-prev').onclick = function () { state.day = E.addDays(state.day, -1); vEnl(el); };
    el.querySelector('#d-next').onclick = function () { state.day = E.addDays(state.day, 1); vEnl(el); };
    var t = el.querySelector('#d-today'); if (t) t.onclick = function () { state.day = E.today(); vEnl(el); };
    el.querySelector('#e-mode').addEventListener('click', function (ev) { var b = ev.target.closest('.chip'); if (b) { state.mode = b.dataset.k; vEnl(el); } });
    el.querySelector('#e-new').onclick = function () { enlForm({ date: state.day }); };
    E.$$('[data-enl]', el).forEach(function (n) { n.onclick = function () { openEnl(n.dataset.enl); }; });
    E.$$('[data-free]', el).forEach(function (n) { n.onclick = function () { var p = n.dataset.free.split('|'); enlForm({ date: state.day, creneau: p[0], poste: +p[1] }); }; });
    var cur = el.querySelector('.ops-plan__t.now'); if (cur && window.innerWidth > 640) { /* rien : le créneau courant est surligné */ }
  }
  function enlCols() {
    return [
      { key: 'id', label: 'N°', render: function (e) { return '<span class="mono">' + esc(e.id) + '</span>'; } },
      { key: 'date', label: 'Créneau', render: function (e) { return '<span class="nowrap">' + dayLabel(e.date) + ' · ' + e.creneau + '</span>'; }, csv: function (e) { return e.date + ' ' + e.creneau; } },
      { key: 'poste', label: 'Poste', num: 1 },
      { key: 'client', label: 'Client', render: function (e) { return esc(clientNom(e.clientId)); }, csv: function (e) { return clientNom(e.clientId); } },
      { key: 'produit', label: 'Produit', cls: 'nowrap', render: function (e) { return dot(pr(e.produit).c) + esc(pl(e.produit)); }, csv: function (e) { return pr(e.produit).l; } },
      { key: 'volume', label: 'Commandé (m³)', num: 1, render: function (e) { return F.num(e.volume); } },
      { key: 'volumeCharge', label: 'Chargé (m³)', num: 1, render: function (e) { return e.volumeCharge ? '<b>' + F.num(e.volumeCharge, 2) + '</b>' : ''; } },
      { key: 'immat', label: 'Camion', render: function (e) { return '<b>' + esc(e.immat) + '</b><div class="small muted">' + esc(e.chauffeur) + ' · ' + esc(transpNom(e.transporteurId)) + '</div>'; }, csv: function (e) { return e.immat + ' / ' + e.chauffeur; } },
      { key: 'passage', label: 'Passage', render: function (e) { return e.heureEntree ? esc(e.heureEntree) + ' → ' + esc(e.heureSortie || '…') : ''; }, csv: function (e) { return (e.heureEntree || '') + '-' + (e.heureSortie || ''); } },
      { key: 'statut', label: 'Statut', render: function (e) { return U.badge(e.statut, ST_TONE[e.statut]); } }
    ];
  }
  function enlForm(v) {
    var f = U.formModal({ title: 'Programmer un enlèvement', sub: 'Réservation d\'un créneau sur un poste de chargement', okLabel: 'Programmer',
      fields: [
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'creneau', label: 'Créneau', type: 'select', options: CRENEAUX.map(function (c) { return { v: c, l: c + ' – ' + crFin(c) }; }), required: true },
        { name: 'poste', label: 'Poste de chargement', type: 'select', options: POSTES.map(function (p) { return { v: p.n, l: 'Poste ' + p.n + ' — ' + p.l }; }), required: true },
        { name: 'produit', label: 'Produit', type: 'select', options: PRD_CAMION.map(function (k) { return { v: k, l: pr(k).l }; }), required: true },
        { name: 'clientId', label: 'Client', type: 'select', options: E.options('clients'), required: true },
        { name: 'volume', label: 'Volume commandé (m³)', type: 'number', required: true, min: 1, value: 33 },
        { name: 'transporteurId', label: 'Transporteur', type: 'select', options: transpOpts(), required: true },
        { name: 'immat', label: 'Immatriculation', required: true, placeholder: '4521 G8 B' },
        { name: 'chauffeur', label: 'Chauffeur', required: true, placeholder: 'Nom et prénom' },
        { name: 'destination', label: 'Destination', placeholder: 'Station, dépôt…' }
      ], values: Object.assign({ creneau: CRENEAUX[0], poste: 1, produit: 'super', clientId: 'C-02', transporteurId: 'F-006' }, v),
      onSubmit: function (x) {
        var po = POSTES[+x.poste - 1];
        if (po.p.indexOf(x.produit) < 0) { U.toast('Le poste ' + po.n + ' est dédié : ' + po.l + '.', 'err'); return false; }
        if (enls().some(function (e) { return e.date === x.date && e.creneau === x.creneau && e.poste === +x.poste && e.statut !== 'Refusé'; })) { U.toast('Ce créneau est déjà occupé sur le poste ' + po.n + '.', 'err'); return false; }
        if (+x.volume > 45) { U.toast('Volume supérieur à la capacité d\'une citerne routière (45 m³).', 'err'); return false; }
        var n = Math.max.apply(null, enls().map(function (e) { return +e.id.replace(/\D/g, '') || 0; }).concat([2400])) + 1;
        var o = { id: 'ENL-' + n, date: x.date, creneau: x.creneau, poste: +x.poste, clientId: x.clientId, produit: x.produit, volume: +x.volume, transporteurId: x.transporteurId, immat: x.immat.toUpperCase(), chauffeur: x.chauffeur, destination: x.destination, statut: 'Planifié', heureEntree: '', heureSortie: '', checklist: {}, densite: pr(x.produit).d };
        enls().unshift(o); S.save();
        E.log('Enlèvement programmé ' + o.id, clientNom(o.clientId) + ' · ' + pr(o.produit).l + ' ' + o.volume + ' m³ · ' + o.date + ' ' + o.creneau + ' poste ' + o.poste, 'logistique');
        U.toast('Enlèvement ' + o.id + ' programmé — poste ' + o.poste + ' à ' + o.creneau);
        state.day = o.date; E.rerender();
      } });
    var ps = f.el.querySelector('#f_poste'), pd = f.el.querySelector('#f_produit');
    ps.onchange = function () { var po = POSTES[+ps.value - 1]; if (po.p.indexOf(pd.value) < 0) pd.value = po.p[0]; f.el.querySelector('#f_volume').value = pd.value === 'butane' ? 20 : pd.value === 'bitume' ? 25 : 33; };
    pd.onchange = function () { var po = POSTES.find(function (p) { return p.p.indexOf(pd.value) >= 0; }); if (POSTES[+ps.value - 1].p.indexOf(pd.value) < 0) ps.value = po.n; f.el.querySelector('#f_volume').value = pd.value === 'butane' ? 20 : pd.value === 'bitume' ? 25 : 33; };
  }

  function openEnl(id, deep) {
    var e = S.get('enlevements', id); if (!e) return;
    var idx = ST.indexOf(e.statut), p = pr(e.produit), chk = e.checklist || {};
    var nOk = CHECK.filter(function (c) { return chk[c.k]; }).length;
    var body = U.steps(ST, e.statut === 'Refusé' ? 1 : idx, { rejected: e.statut === 'Refusé', finished: e.statut === 'Sorti' }) +
      (e.statut === 'Refusé' ? '<div class="alert tone-red" style="margin:10px 0">' + E.icon('x') + '<div><b>Accès refusé.</b> ' + esc(e.motifRefus) + '</div></div>' : '') +
      '<div class="grid g2 stack-m" style="margin-top:10px"><dl class="kv"><dt>Client</dt><dd>' + esc(clientNom(e.clientId)) + '</dd><dt>Destination</dt><dd>' + esc(e.destination || '—') + '</dd><dt>Produit</dt><dd>' + dot(p.c) + esc(p.l) + '</dd><dt>Volume commandé</dt><dd><b>' + F.num(e.volume) + ' m³</b></dd><dt>Créneau</dt><dd>' + dayLabel(e.date) + ' · ' + e.creneau + '–' + crFin(e.creneau) + ' · poste ' + e.poste + '</dd></dl>' +
      '<dl class="kv"><dt>Transporteur</dt><dd>' + esc(transpNom(e.transporteurId)) + '</dd><dt>Camion</dt><dd><b>' + esc(e.immat) + '</b></dd><dt>Chauffeur</dt><dd>' + esc(e.chauffeur) + '</dd><dt>Entrée / sortie</dt><dd>' + (e.heureEntree || '—') + ' → ' + (e.heureSortie || '—') + (e.heureSortie ? ' (' + hmDur(mins(e.heureEntree, e.heureSortie)) + ')' : '') + '</dd>' + (e.bl ? '<dt>Bon de livraison</dt><dd class="mono">' + esc(e.bl) + '</dd><dt>Volume chargé</dt><dd><b>' + F.num(e.volumeCharge, 2) + ' m³</b> à ' + e.temperature + ' °C</dd>' : '') + '</dl></div>';
    var actions = [];
    if (e.statut === 'Planifié') {
      body += '<div class="ops-note" style="margin-top:14px">À l\'arrivée du camion à la barrière, le poste de garde enregistre l\'entrée puis réalise le <b>contrôle sécurité</b> avant tout accès aux postes de chargement.</div>';
      actions.push({ label: 'Annuler l\'enlèvement', cls: 'danger', onClick: function (c) { U.confirm('Annuler ' + e.id, 'Libérer le créneau ' + e.creneau + ' du poste ' + e.poste + ' ?', 'Annuler l\'enlèvement', function () { S.remove('enlevements', e.id); E.log('Enlèvement annulé ' + e.id, '', 'logistique'); c(); U.toast('Enlèvement annulé — créneau libéré'); E.rerender(); }, 'danger'); } });
      actions.push({ label: 'Enregistrer l\'arrivée', cls: 'primary', icon: 'check', onClick: function (c) { S.update('enlevements', e.id, { statut: 'À l\'entrée', heureEntree: nowHM() }); E.log('Arrivée camion ' + e.immat, e.id, 'logistique'); c(); U.toast('Camion ' + e.immat + ' à l\'entrée — contrôle sécurité'); E.rerender(); openEnl(e.id); } });
    }
    if (e.statut === 'À l\'entrée') {
      body += '<h4 style="margin:18px 0 8px;font-size:14px">Check-list sécurité à l\'entrée</h4><div class="ops-check" id="chk">' + CHECK.map(function (c) { return '<label class="' + (chk[c.k] ? 'ok' : '') + '"><input type="checkbox" data-k="' + c.k + '"' + (chk[c.k] ? ' checked' : '') + '><div><b>' + esc(c.l) + '</b><span>' + esc(c.s) + '</span></div></label>'; }).join('') + '</div>' +
        '<div class="ops-check__score"><div style="flex:1">' + U.progress(nOk / CHECK.length * 100, nOk === CHECK.length ? 'green' : 'orange') + '</div><span class="small" id="chk-n">' + nOk + '/' + CHECK.length + ' points conformes</span></div>' +
        '<div class="field" style="margin-top:12px"><label for="chk-poste">Poste de chargement affecté</label><select class="select" id="chk-poste">' + POSTES.filter(function (po) { return po.p.indexOf(e.produit) >= 0; }).map(function (po) { return '<option value="' + po.n + '"' + (po.n === e.poste ? ' selected' : '') + '>Poste ' + po.n + ' — ' + po.l + '</option>'; }).join('') + '</select></div>';
      actions.push({ label: 'Refuser l\'accès', cls: 'danger', icon: 'x', onClick: function (c) {
        var ko = CHECK.filter(function (x) { return !(S.get('enlevements', e.id).checklist || {})[x.k]; }).map(function (x) { return x.l; });
        S.update('enlevements', e.id, { statut: 'Refusé', motifRefus: ko.length ? 'Non-conformité : ' + ko.join(', ') : 'Refus du chef de poste' });
        E.log('Accès refusé ' + e.immat, e.id + ' · ' + ko.join(', '), 'logistique'); E.notify('Camion refusé à l\'entrée', e.immat + ' (' + transpNom(e.transporteurId) + ') — ' + (ko.join(', ') || 'refus'), '#/logistique/enlevements/' + e.id, 'red');
        c(); U.toast('Accès refusé — transporteur informé', 'err'); E.rerender(); } });
      actions.push({ label: 'Autoriser le chargement', cls: 'primary', icon: 'check', onClick: function (c, root) {
        var cur = S.get('enlevements', e.id).checklist || {};
        if (CHECK.some(function (x) { return !cur[x.k]; })) { U.toast('Tous les points de la check-list doivent être conformes.', 'err'); return; }
        var po = +root.querySelector('#chk-poste').value;
        S.update('enlevements', e.id, { statut: 'Chargement', poste: po, debutCharge: nowHM() });
        E.log('Chargement autorisé ' + e.immat, e.id + ' · poste ' + po, 'logistique'); c(); U.toast('Camion ' + e.immat + ' dirigé vers le poste ' + po); E.rerender(); } });
    }
    if (e.statut === 'Chargement') {
      body += '<div class="alert tone-blue" style="margin-top:14px">' + E.icon('drop') + '<div>Chargement en source au <b>poste ' + e.poste + '</b> — mise à la terre active, compteur volumétrique en cours. Après chargement, le camion passe au pont-bascule pour la pesée en charge.</div></div>';
      actions.push({ label: 'Fin de chargement & pesée', cls: 'primary', icon: 'check', onClick: function (c) { c(); peseeForm(e.id); } });
    }
    if (e.statut === 'Pesée / BL') {
      actions.push({ label: 'Bon de livraison', icon: 'print', onClick: function () { printBL(S.get('enlevements', e.id)); } });
      actions.push({ label: 'Valider la sortie du site', cls: 'primary', icon: 'logout', onClick: function (c) { S.update('enlevements', e.id, { statut: 'Sorti', heureSortie: nowHM() }); E.log('Sortie camion ' + e.immat, e.id + ' · ' + e.bl, 'logistique'); c(); U.toast('Camion ' + e.immat + ' sorti — BL ' + e.bl); E.rerender(); } });
    }
    if (e.statut === 'Sorti') actions.push({ label: 'Bon de livraison', cls: 'primary', icon: 'print', onClick: function () { printBL(S.get('enlevements', e.id)); } });
    var m = U.modal({ title: 'Enlèvement ' + e.id, sub: esc(e.immat) + ' · ' + esc(clientNom(e.clientId)), size: 'lg', body: body, actions: actions.length ? actions : [{ label: 'Fermer' }], onClose: deep ? function () { clearDeep('enlevements'); } : null });
    var box = m.el.querySelector('#chk');
    if (box) box.addEventListener('change', function (ev) {
      var k = ev.target.dataset.k; if (!k) return;
      var cur = Object.assign({}, S.get('enlevements', e.id).checklist || {}); cur[k] = ev.target.checked;
      S.update('enlevements', e.id, { checklist: cur }); ev.target.closest('label').classList.toggle('ok', ev.target.checked);
      var n = CHECK.filter(function (x) { return cur[x.k]; }).length;
      m.el.querySelector('#chk-n').textContent = n + '/' + CHECK.length + ' points conformes';
      var bar = m.el.querySelector('.ops-check__score .progress'); bar.className = 'progress ' + (n === CHECK.length ? 'green' : 'orange'); bar.firstChild.style.width = (n / CHECK.length * 100) + '%'; m.el.querySelector('.ops-check__score .pbar span').textContent = Math.round(n / CHECK.length * 100) + '%';
    });
  }
  function peseeForm(id) {
    var e = S.get('enlevements', id), p = pr(e.produit), vide = 14000 + Math.round(Math.random() * 1800);
    var f = U.formModal({ title: 'Pesée et bon de livraison', sub: e.id + ' · ' + e.immat + ' · ' + p.l, okLabel: 'Établir le bon de livraison',
      intro: '<div class="ops-note" id="ps-info" style="margin-bottom:14px"></div>',
      fields: [
        { name: 'poidsVide', label: 'Poids à vide (kg) — pesée d\'entrée', type: 'number', required: true },
        { name: 'poidsPlein', label: 'Poids en charge (kg)', type: 'number', required: true },
        { name: 'temperature', label: 'Température produit (°C)', type: 'number', step: '0.1', required: true },
        { name: 'densite', label: 'Densité à 15 °C', type: 'number', step: '0.001', required: true },
        { name: 'plombs', label: 'N° des plombs (scellés)', full: true, placeholder: 'P40310 à P40312' }
      ], values: { poidsVide: vide, poidsPlein: Math.round(vide + e.volume * p.d * 1000 * 0.998), temperature: 31, densite: p.d, plombs: 'P' + (40300 + Math.round(Math.random() * 90)) + ' à P' + (40393 + Math.round(Math.random() * 6)) },
      onSubmit: function (v) {
        var net = v.poidsPlein - v.poidsVide; if (net <= 0) { U.toast('Le poids en charge doit dépasser le poids à vide.', 'err'); return false; }
        var vol = Math.round(net / (v.densite * 1000) * 100) / 100, bl = nextNum('BL', enls(), 'bl');
        S.update('enlevements', id, { statut: 'Pesée / BL', poidsVide: v.poidsVide, poidsPlein: v.poidsPlein, temperature: v.temperature, densite: v.densite, volumeCharge: vol, bl: bl, plombs: v.plombs });
        E.log('Bon de livraison ' + bl, e.id + ' · ' + F.num(vol, 2) + ' m³ ' + p.l, 'logistique');
        U.toast('BL ' + bl + ' établi — ' + F.num(vol, 2) + ' m³'); E.rerender();
        setTimeout(function () { printBL(S.get('enlevements', id)); }, 60);
      } });
    function upd() { var a = +f.el.querySelector('#f_poidsVide').value, b = +f.el.querySelector('#f_poidsPlein').value, d = +f.el.querySelector('#f_densite').value || p.d, net = b - a; f.el.querySelector('#ps-info').innerHTML = 'Poids net : <b>' + F.num(net) + ' kg</b> → volume chargé : <b>' + F.num(net / (d * 1000), 2) + ' m³</b> pour ' + F.num(e.volume) + ' m³ commandés (écart ' + F.num((net / (d * 1000) - e.volume) / e.volume * 100, 2) + ' %)'; }
    E.$$('input', f.el).forEach(function (i) { i.addEventListener('input', upd); }); upd();
  }
  function printBL(e) {
    var p = pr(e.produit), c = S.get('clients', e.clientId) || {};
    printModal('Bon de livraison ' + e.bl, docHead('BON DE LIVRAISON', e.bl, 'Port-Gentil, le ' + F.date(e.date)) +
      '<div class="ops-doc-meta"><div><span>Client : </span><b>' + esc(c.nom || e.clientId) + '</b></div><div><span>Code client : </span><b>' + esc(e.clientId) + '</b></div><div><span>Destination : </span><b>' + esc(e.destination || c.ville || '—') + '</b></div><div><span>Enlèvement : </span><b>' + esc(e.id) + '</b></div>' +
      '<div><span>Transporteur : </span><b>' + esc(transpNom(e.transporteurId)) + '</b></div><div><span>Immatriculation : </span><b>' + esc(e.immat) + '</b></div><div><span>Chauffeur : </span><b>' + esc(e.chauffeur) + '</b></div><div><span>Poste / créneau : </span><b>Poste ' + e.poste + ' · ' + e.creneau + '</b></div></div>' +
      '<table class="ops-doc-tbl"><thead><tr><th>Produit</th><th class="num">Commandé</th><th class="num">Chargé (amb.)</th><th class="num">T °C</th><th class="num">Densité 15 °C</th><th class="num">Masse nette</th></tr></thead><tbody><tr><td><b>' + esc(p.l) + '</b></td><td class="num">' + F.num(e.volume) + ' m³</td><td class="num"><b>' + F.num(e.volumeCharge, 2) + ' m³</b></td><td class="num">' + F.num(e.temperature, 1) + '</td><td class="num">' + F.num(e.densite, 3) + '</td><td class="num">' + F.num(e.poidsPlein - e.poidsVide) + ' kg</td></tr></tbody></table>' +
      '<div class="ops-doc-meta"><div><span>Pesée à vide : </span><b>' + F.num(e.poidsVide) + ' kg</b></div><div><span>Pesée en charge : </span><b>' + F.num(e.poidsPlein) + ' kg</b></div><div><span>Plombs : </span><b>' + esc(e.plombs || '—') + '</b></div><div><span>Entrée / sortie : </span><b>' + esc(e.heureEntree || '—') + ' → ' + esc(e.heureSortie || '—') + '</b></div></div>' +
      '<p class="small" style="margin-top:12px">Contrôle sécurité à l\'entrée : ' + CHECK.map(function (x) { return (e.checklist && e.checklist[x.k] ? '☑ ' : '☐ ') + x.l; }).join(' · ') + '</p>' +
      '<p class="small muted">Marchandise dangereuse — ONU ' + ({ super: '1203 essence', gasoil: '1202 gazole', kero: '1863 carburéacteur', butane: '1011 butane', bitume: '3257 liquide transporté à chaud', fioul: '1202 fioul' })[e.produit] + '. Le transporteur reconnaît avoir reçu le produit en bon état, citerne plombée. Toute réserve doit être portée sur ce bon avant le départ.</p>' +
      '<div class="ops-sign"><div>Chargeur SOGARA</div><div>Chauffeur (bon pour réception)</div><div>Client — réception à destination</div></div>');
  }

  /* ---------- Navires ---------- */
  function shipCard(s) {
    var d = demurrage(s), steps = SHIP_ST(s), idx = steps.indexOf(s.statut), col = SHIP_COL[s.statut];
    return '<div class="ops-ship" data-ship="' + s.id + '" style="--sc:' + col + '"><div class="ops-ship__h"><div class="ops-ship__ico" style="background:' + col + '1f;color:' + col + '">' + E.icon('ship') + '</div><div><b>' + esc(s.navire) + '</b><div class="small">' + esc(s.type) + ' · ' + esc(s.pavillon) + ' · ' + s.longueur + ' m</div></div>' + U.badge(s.statut, SHIP_TONE[s.statut]) + '</div>' +
      '<div class="ops-ship__grid"><div><span>' + (s.sens === 'Réception' ? 'Réception' : s.sens) + '</span><b>' + dot(pr(s.produit).c) + esc(pl(s.produit)) + '</b></div><div><span>Quantité</span><b>' + F.num(s.quantite) + ' m³</b></div><div><span>' + (s.statut === 'Parti' ? 'Parti le' : 'ETA') + '</span><b>' + fdtS(s.statut === 'Parti' ? s.depart : s.eta) + '</b></div></div>' +
      U.steps(steps.map(function (x) { return x === 'Déchargement' ? 'Décharg.' : x; }), idx, { finished: s.statut === 'Parti' }) +
      (s.fait && s.statut !== 'Parti' ? '<div><div class="small muted" style="margin-bottom:4px">Opérations : ' + F.num(s.fait) + ' / ' + F.num(s.quantite) + ' m³</div>' + U.progress(s.fait / s.quantite * 100) + '</div>' : '') +
      (d.ex > 0 ? '<div class="ops-demur tone-' + (d.running ? 'red' : 'orange') + '">' + E.icon('alert') + '<span>Surestaries ' + (d.running ? 'en cours' : 'constatées') + ' : ' + F.num(d.ex, 1) + ' h · ' + F.money(d.fcfa) + '</span></div>' : (s.nor ? '<div class="ops-demur tone-green">' + E.icon('clock') + '<span>Temps de planche : ' + F.num(d.used, 1) + ' h utilisées sur ' + s.planche + ' h</span></div>' : '')) + '</div>';
  }
  function vNav(el) {
    var actifs = navires().filter(function (s) { return s.statut !== 'Parti'; }).sort(function (a, b) { return a.eta.localeCompare(b.eta); });
    var partis = navires().filter(function (s) { return s.statut === 'Parti'; }).sort(function (a, b) { return b.depart.localeCompare(a.depart); });
    var from = E.addDays(E.today(), -16), to = E.addDays(E.today(), 16);
    var rows = navires().filter(function (s) { return (s.depart || s.etd).slice(0, 10) >= from && s.eta.slice(0, 10) <= to; }).sort(function (a, b) { return a.eta.localeCompare(b.eta); }).map(function (s) {
      var idx = SHIP_ST(s).indexOf(s.statut);
      return { label: s.navire, sub: s.sens + ' · ' + pr(s.produit).l + ' ' + F.num(s.quantite) + ' m³', start: s.eta.slice(0, 10), end: (s.depart || s.etd).slice(0, 10), progress: [0, 15, 35, 65, 100][idx], cls: s.statut === 'En rade' ? 'warn' : '', milestones: s.accostage ? [{ date: s.accostage.slice(0, 10), label: 'Accostage', done: true }] : [], onClick: function () { openShip(s.id); } };
    });
    var month = navires().filter(function (s) { return (s.fin || s.etd).slice(0, 7) === E.today().slice(0, 7) || (s.fin || '').slice(0, 7) === E.addDays(E.today(), -20).slice(0, 7); });
    var dTot = sum(navires(), function (s) { return demurrage(s).fcfa; });
    el.innerHTML =
      '<div class="ops-toolbar"><div><b style="font-family:Sora,sans-serif">Appontement pétrolier</b><div class="small muted">1 poste à quai (tirant d\'eau max. 11 m) · ' + actifs.length + ' escale(s) en cours ou annoncée(s)</div></div><span class="spacer"></span><button class="btn primary" id="sh-new">' + E.icon('plus') + 'Annoncer une escale</button></div>' +
      '<div class="ops-ships">' + actifs.map(shipCard).join('') + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Timeline des escales</h3><span class="sub">du ' + F.date(from) + ' au ' + F.date(to) + '</span></div>' + U.gantt({ rows: rows, from: from, to: to, unit: 'day', title: 'Navire' }) + '</div>' +
      '<div class="grid g-2-1" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Escales terminées</h3></div>' +
        U.table([
          { key: 'navire', label: 'Navire', render: function (s) { return '<b>' + esc(s.navire) + '</b><div class="small muted mono">' + esc(s.id) + '</div>'; } },
          { key: 'op', label: 'Opération', render: function (s) { return esc(s.sens) + ' · ' + dot(pr(s.produit).c) + esc(pr(s.produit).l); } },
          { key: 'quantite', label: 'Quantité', num: 1, render: function (s) { return F.num(s.quantite) + ' m³'; } },
          { key: 'sejour', label: 'Séjour', render: function (s) { return fdt(s.nor) + ' → ' + fdt(s.depart); } },
          { key: 'planche', label: 'Planche utilisée', num: 1, render: function (s) { var d = demurrage(s); return F.num(d.used, 1) + ' / ' + s.planche + ' h'; } },
          { key: 'dem', label: 'Surestaries', num: 1, render: function (s) { var d = demurrage(s); return d.fcfa ? '<b class="ops-neg">' + F.short(d.fcfa) + '</b>' : '<span class="ops-pos">Aucune</span>'; } }
        ], partis, { onRow: function (s) { openShip(s.id); } }) + '</div>' +
        '<div class="card"><div class="card__h"><h3>Surestaries</h3></div><div class="card__b"><div class="ops-stat"><div><span>Total estimé (escales listées)</span><b class="ops-neg">' + F.short(dTot) + ' FCFA</b></div><div><span>Escales concernées</span><b>' + navires().filter(function (s) { return demurrage(s).ex > 0; }).length + ' / ' + navires().filter(function (s) { return s.nor; }).length + '</b></div></div>' +
        '<div class="ops-note" style="margin-top:12px">Calcul : temps décompté à partir de la <b>NOR + 6 h</b> jusqu\'à la fin des opérations ; au-delà du <b>temps de planche</b> contractuel, le taux journalier de surestarie de la charte-partie s\'applique au prorata.</div></div></div></div>';
    el.querySelector('#sh-new').onclick = shipForm;
    E.$$('[data-ship]', el).forEach(function (n) { n.onclick = function () { openShip(n.dataset.ship); }; });
  }
  function openShip(id, deep) {
    var s = S.get('navires', id); if (!s) return;
    var steps = SHIP_ST(s), idx = steps.indexOf(s.statut), d = demurrage(s);
    var body = U.steps(steps, idx, { finished: s.statut === 'Parti' }) +
      (s.note ? '<div class="ops-note" style="margin:10px 0">' + esc(s.note) + '</div>' : '') +
      '<div class="grid g2 stack-m" style="margin-top:10px"><dl class="kv"><dt>Escale</dt><dd class="mono">' + esc(s.id) + '</dd><dt>Navire</dt><dd><b>' + esc(s.navire) + '</b> · ' + esc(s.type) + '</dd><dt>Pavillon / LOA / tirant</dt><dd>' + esc(s.pavillon) + ' · ' + s.longueur + ' m · ' + F.num(s.tirant, 1) + ' m</dd><dt>Opération</dt><dd>' + esc(s.sens) + ' · ' + dot(pr(s.produit).c) + esc(pr(s.produit).l) + '</dd><dt>Quantité</dt><dd><b>' + F.num(s.quantite) + ' m³</b> (' + F.num(s.quantite * 6.2898) + ' bbl)</dd><dt>' + (s.sens === 'Export' ? 'Client' : 'Origine / destination') + '</dt><dd>' + esc(s.partenaire) + '</dd><dt>Bacs</dt><dd>' + esc(s.bacs || '—') + '</dd></dl>' +
      '<dl class="kv"><dt>ETA</dt><dd>' + fdt(s.eta) + '</dd><dt>NOR (notice of readiness)</dt><dd>' + fdt(s.nor) + '</dd><dt>Accostage</dt><dd>' + fdt(s.accostage) + '</dd><dt>Début / fin d\'opérations</dt><dd>' + fdt(s.debut) + ' → ' + fdt(s.fin) + '</dd><dt>ETD / départ</dt><dd>' + fdt(s.etd) + ' / ' + fdt(s.depart) + '</dd></dl></div>' +
      '<h4 style="margin:18px 0 8px;font-size:14px">Surestaries (demurrage)</h4><div class="ops-stat"><div><span>Temps de planche</span><b>' + s.planche + ' h</b></div><div><span>Temps décompté</span><b>' + F.num(d.used, 1) + ' h</b></div><div><span>Dépassement</span><b class="' + (d.ex ? 'ops-neg' : 'ops-pos') + '">' + F.num(d.ex, 1) + ' h</b></div><div><span>Taux journalier</span><b>' + F.short(s.taux) + '</b></div><div><span>Montant ' + (d.running ? 'à date' : 'final') + '</span><b class="' + (d.fcfa ? 'ops-neg' : '') + '">' + F.money(d.fcfa) + '</b></div></div>';
    var actions = [];
    if (s.statut !== 'Parti') {
      var nxt = steps[idx + 1];
      actions.push({ label: 'Modifier ETA / ETD', icon: 'calendar', onClick: function (c) { c(); etaForm(s.id); } });
      actions.push({ label: { 'En rade': 'Navire en rade (NOR reçue)', 'À quai': 'Accostage effectué', 'Chargement': 'Début du chargement', 'Déchargement': 'Début du déchargement', 'Parti': 'Fin d\'opérations & départ' }[nxt], cls: 'primary', icon: 'arrow', onClick: function (c) {
        var now = nowISO(), patch = { statut: nxt };
        if (nxt === 'En rade') patch.nor = now; if (nxt === 'À quai') patch.accostage = now; if (nxt === 'Chargement' || nxt === 'Déchargement') patch.debut = now;
        if (nxt === 'Parti') { patch.fin = now; patch.depart = now; patch.fait = s.quantite; }
        if (nxt === 'À quai' && navires().some(function (x) { return x.id !== s.id && ['À quai', 'Chargement', 'Déchargement'].indexOf(x.statut) >= 0; })) { U.toast('L\'appontement est occupé : libérez d\'abord le poste à quai.', 'err'); return; }
        S.update('navires', s.id, patch);
        E.log('Escale ' + s.id + ' — ' + nxt, s.navire, 'logistique');
        var dd = demurrage(S.get('navires', s.id));
        E.notify(s.navire + ' : ' + nxt, s.sens + ' ' + pr(s.produit).l + ' ' + F.num(s.quantite) + ' m³' + (nxt === 'Parti' && dd.fcfa ? ' · surestaries ' + F.short(dd.fcfa) + ' FCFA' : ''), '#/logistique/navires/' + s.id, nxt === 'Parti' ? 'green' : 'blue');
        c(); U.toast(s.navire + ' : ' + nxt); E.rerender(); } });
    } else actions.push({ label: 'Fermer' });
    U.modal({ title: s.navire, sub: s.id + ' · ' + esc(s.type), size: 'lg', body: body, actions: actions, onClose: deep ? function () { clearDeep('navires'); } : null });
  }
  function etaForm(id) {
    var s = S.get('navires', id);
    U.formModal({ title: 'ETA / ETD — ' + s.navire, size: 'sm', fields: [
      { name: 'eta', label: 'ETA', type: 'datetime-local', required: true, full: true }, { name: 'etd', label: 'ETD', type: 'datetime-local', required: true, full: true }
    ], values: { eta: s.eta, etd: s.etd }, onSubmit: function (v) {
      if (v.etd <= v.eta) { U.toast('L\'ETD doit être postérieure à l\'ETA.', 'err'); return false; }
      S.update('navires', id, { eta: v.eta, etd: v.etd }); E.log('ETA modifiée ' + id, s.navire + ' · ' + v.eta, 'logistique'); U.toast('Horaires mis à jour'); E.rerender();
    } });
  }
  function shipForm() {
    U.formModal({ title: 'Annoncer une escale', sub: 'Avis d\'arrivée transmis par l\'agent maritime', okLabel: 'Enregistrer l\'escale',
      fields: [
        { name: 'navire', label: 'Nom du navire', required: true, placeholder: 'MT …' },
        { name: 'type', label: 'Type', type: 'select', options: ['Pétrolier (brut)', 'Pétrolier (produits noirs)', 'Caboteur produits blancs', 'Barge fluviale'], required: true },
        { name: 'sens', label: 'Opération', type: 'select', options: ['Réception', 'Export', 'Cabotage'], required: true },
        { name: 'produit', label: 'Produit', type: 'select', options: Object.keys(PRD).map(function (k) { return { v: k, l: pr(k).l }; }), required: true },
        { name: 'quantite', label: 'Quantité (m³)', type: 'number', required: true, min: 1 },
        { name: 'partenaire', label: 'Client / origine / destination', required: true },
        { name: 'eta', label: 'ETA', type: 'datetime-local', required: true },
        { name: 'etd', label: 'ETD', type: 'datetime-local', required: true },
        { name: 'planche', label: 'Temps de planche (h)', type: 'number', required: true, min: 1 },
        { name: 'taux', label: 'Taux de surestarie (FCFA/jour)', type: 'money', required: true },
        { name: 'pavillon', label: 'Pavillon' }, { name: 'longueur', label: 'Longueur (m)', type: 'number' }
      ], values: { sens: 'Réception', produit: 'brut', type: 'Pétrolier (brut)', eta: dt(7, '08:00'), etd: dt(9, '08:00'), planche: 48, taux: 9000000, quantite: 47000, partenaire: 'Terminal de Cap Lopez', pavillon: 'Libéria', longueur: 180 },
      onSubmit: function (v) {
        if (v.etd <= v.eta) { U.toast('L\'ETD doit être postérieure à l\'ETA.', 'err'); return false; }
        var o = { id: nextNum('ESC', navires()), navire: v.navire, type: v.type, sens: v.sens, produit: v.produit, quantite: +v.quantite, fait: 0, partenaire: v.partenaire, pavillon: v.pavillon || '—', longueur: +v.longueur || 0, tirant: 0, eta: v.eta, etd: v.etd, nor: '', accostage: '', debut: '', fin: '', depart: '', statut: 'Annoncé', planche: +v.planche, taux: +v.taux };
        navires().unshift(o); S.save(); E.log('Escale annoncée ' + o.id, o.navire + ' · ETA ' + v.eta, 'logistique'); E.notify('Escale annoncée : ' + o.navire, 'ETA ' + fdt(v.eta), '#/logistique/navires/' + o.id, 'violet');
        U.toast('Escale ' + o.id + ' enregistrée'); E.rerender();
      } });
  }

  /* ---------- Flotte ---------- */
  function vFlotte(el) {
    var types = ['Véhicule de service', 'Bus du personnel', 'Camion', 'Engin de levage', 'Ambulance'];
    var list = vehs().filter(function (v) { return !state.fType || v.type === state.fType; });
    var va = vehAlerts();
    var cols = [
      { key: 'id', label: 'Véhicule', render: function (v) { return '<b>' + esc(v.modele) + '</b><div class="small muted"><span class="mono">' + esc(v.immat) + '</span> · ' + esc(v.id) + '</div>'; }, csv: function (v) { return v.modele + ' ' + v.immat; } },
      { key: 'type', label: 'Type' },
      { key: 'affectation', label: 'Affectation', render: function (v) { return esc(E.dirName(v.affectation)) + (v.conducteur ? '<div class="small muted">' + esc(E.empName(v.conducteur)) + '</div>' : ''); }, csv: function (v) { return E.dirName(v.affectation); } },
      { key: 'km', label: 'Compteur', num: 1, render: function (v) { return F.num(v.km) + (v.type === 'Engin de levage' ? ' h' : ' km'); } },
      { key: 'vt', label: 'Visite (VT / VGP)', render: function (v) { var e = echeance(v.vt); return '<span class="badge tone-' + e.tone + ' plain">' + F.dateShort(v.vt) + '</span><div class="small muted">' + e.txt + '</div>'; } },
      { key: 'assurance', label: 'Assurance', render: function (v) { var e = echeance(v.assurance); return '<span class="badge tone-' + e.tone + ' plain">' + F.dateShort(v.assurance) + '</span><div class="small muted">' + e.txt + '</div>'; } },
      { key: 'carburantMois', label: 'Carburant (mois)', num: 1, render: function (v) { return F.num(v.carburantMois) + ' L'; } },
      { key: 'statut', label: 'Statut', render: function (v) { return U.badge(v.statut, { 'Disponible': 'green', 'En mission': 'blue', 'En maintenance': 'orange', 'Immobilisé': 'red' }[v.statut]); } }
    ];
    var top = vehs().slice().sort(function (a, b) { return b.carburantMois - a.carburantMois; }).slice(0, 7);
    el.innerHTML =
      '<div class="grid g4" style="margin-bottom:16px">' +
        U.kpi({ label: 'Parc', value: vehs().length, icon: 'truck', tone: 'blue', foot: vehs().filter(function (v) { return v.statut === 'Disponible'; }).length + ' disponibles · ' + vehs().filter(function (v) { return v.statut === 'En mission'; }).length + ' en mission' }) +
        U.kpi({ label: 'Immobilisés', value: vehs().filter(function (v) { return v.statut === 'Immobilisé' || v.statut === 'En maintenance'; }).length, icon: 'wrench', tone: 'orange', foot: 'maintenance ou visite échue' }) +
        U.kpi({ label: 'Échéances ≤ 30 j', value: va.length, icon: 'calendar', tone: va.some(function (a) { return a.e.j < 0; }) ? 'red' : 'orange', foot: va.filter(function (a) { return a.e.j < 0; }).length + ' échue(s)' }) +
        U.kpi({ label: 'Carburant du mois', value: F.num(sum(vehs(), 'carburantMois')), unit: 'L', icon: 'drop', tone: 'violet', foot: '≈ ' + F.short(sum(vehs(), 'carburantMois') * 690) + ' FCFA (gasoil à la pompe)' }) +
      '</div>' +
      '<div class="ops-toolbar"><div class="chips" id="fl-f"><button class="chip' + (!state.fType ? ' is-active' : '') + '" data-k="">Tous</button>' + types.map(function (t) { return '<button class="chip' + (state.fType === t ? ' is-active' : '') + '" data-k="' + t + '">' + t + '</button>'; }).join('') + '</div><span class="spacer"></span><button class="btn" id="fl-csv">' + E.icon('download') + 'CSV</button><button class="btn primary" id="fl-new">' + E.icon('plus') + 'Ajouter un véhicule</button></div>' +
      '<div class="card">' + U.table(cols, list, { onRow: function (v) { openVeh(v.id); } }) + '</div>' +
      '<div class="grid g2 stack-m" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Échéances réglementaires</h3><span class="sub">visites techniques, VGP des engins de levage, assurances</span></div>' +
        (va.length ? '<div class="list">' + va.map(function (a) { return '<a class="list__item" href="#/logistique/flotte/' + a.v.id + '" style="color:inherit"><div class="list__icon tone-' + a.e.tone + '">' + E.icon('calendar') + '</div><div class="list__body"><b>' + esc(a.k) + ' — ' + esc(a.v.modele) + '</b><div class="small muted">' + esc(a.v.immat) + ' · ' + esc(a.v.type) + '</div></div>' + U.badge(a.e.txt, a.e.tone) + '</a>'; }).join('') + '</div>' : '<div class="empty">Aucune échéance dans les 30 jours.</div>') + '</div>' +
        '<div class="card"><div class="card__h"><h3>Consommation de carburant — mois en cours</h3></div><div class="card__b">' + U.bars({ labels: top.map(function (v) { return v.id; }), series: [{ name: 'Litres', values: top.map(function (v) { return v.carburantMois; }), color: '#163b75' }], height: 200 }) + '</div></div></div>';
    el.querySelector('#fl-f').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) { state.fType = b.dataset.k; vFlotte(el); } });
    el.querySelector('#fl-csv').onclick = function () { U.exportCSV('flotte-' + E.today(), cols, list); };
    el.querySelector('#fl-new').onclick = function () { vehForm(); };
  }
  function openVeh(id, deep) {
    var v = S.get('vehicules', id); if (!v) return;
    var mis = S.all('missions').filter(function (m) { return m.vehiculeId === id; });
    var ev = echeance(v.vt), ea = echeance(v.assurance);
    var body = (ev.j < 0 || ea.j < 0 ? '<div class="alert tone-red" style="margin-bottom:14px">' + E.icon('alert') + '<div><b>Échéance dépassée.</b> Le véhicule ne doit pas circuler ni être affecté à une mission tant que la ' + (ev.j < 0 ? (v.type === 'Engin de levage' ? 'VGP' : 'visite technique') : 'assurance') + ' n\'est pas renouvelée.</div></div>' : '') +
      '<div class="grid g2 stack-m"><dl class="kv"><dt>Immatriculation</dt><dd class="mono">' + esc(v.immat) + '</dd><dt>Type</dt><dd>' + esc(v.type) + '</dd><dt>Affectation</dt><dd>' + esc(E.dirName(v.affectation)) + '</dd><dt>Conducteur attitré</dt><dd>' + esc(v.conducteur ? E.empName(v.conducteur) : 'Pool') + '</dd><dt>Places</dt><dd>' + v.places + '</dd></dl>' +
      '<dl class="kv"><dt>Compteur</dt><dd>' + F.num(v.km) + (v.type === 'Engin de levage' ? ' h' : ' km') + '</dd><dt>' + (v.type === 'Engin de levage' ? 'Prochaine VGP' : 'Visite technique') + '</dt><dd>' + F.date(v.vt) + ' ' + U.badge(ev.txt, ev.tone) + '</dd><dt>Assurance</dt><dd>' + F.date(v.assurance) + ' ' + U.badge(ea.txt, ea.tone) + '</dd><dt>Carburant du mois</dt><dd>' + F.num(v.carburantMois) + ' L</dd><dt>Statut</dt><dd>' + U.badge(v.statut) + '</dd></dl></div>' +
      '<h4 style="margin:18px 0 8px;font-size:14px">Missions</h4>' + U.table([{ key: 'id', label: 'N°', render: function (m) { return '<span class="mono">' + esc(m.id) + '</span>'; } }, { key: 'date', label: 'Date', render: function (m) { return F.dateShort(m.date) + ' ' + esc(m.heure); } }, { key: 'motif', label: 'Motif' }, { key: 'statut', label: 'Statut', render: function (m) { return U.badge(m.statut, MIS_TONE[m.statut]); } }], mis, { empty: 'Aucune mission' });
    U.modal({ title: v.modele, sub: esc(v.immat) + ' · ' + esc(v.id), size: 'lg', body: body, onClose: deep ? function () { clearDeep('flotte'); } : null, actions: [
      { label: 'Modifier', icon: 'edit', onClick: function (c) { c(); vehForm(v.id); } },
      { label: 'Enregistrer un plein', cls: 'primary', icon: 'drop', onClick: function (c) { c(); pleinForm(v.id); } }
    ] });
  }
  function pleinForm(id) {
    var v = S.get('vehicules', id);
    U.formModal({ title: 'Plein de carburant — ' + v.id, sub: v.modele + ' · ' + v.immat, size: 'sm', fields: [
      { name: 'litres', label: 'Litres', type: 'number', required: true, min: 1, full: true }, { name: 'km', label: 'Compteur relevé', type: 'number', required: true, full: true }
    ], values: { km: v.km }, onSubmit: function (x) {
      if (+x.km < v.km) { U.toast('Le compteur ne peut pas diminuer.', 'err'); return false; }
      S.update('vehicules', id, { carburantMois: v.carburantMois + +x.litres, km: +x.km }); E.log('Plein ' + v.id, x.litres + ' L · ' + x.km, 'logistique'); U.toast('Plein enregistré : ' + x.litres + ' L'); E.rerender();
    } });
  }
  function vehForm(id) {
    var v = id ? S.get('vehicules', id) : null;
    U.formModal({ title: v ? 'Modifier ' + v.id : 'Ajouter un véhicule', fields: [
      { name: 'modele', label: 'Modèle', required: true }, { name: 'immat', label: 'Immatriculation', required: true, placeholder: '4521 G8 B' },
      { name: 'type', label: 'Type', type: 'select', options: ['Véhicule de service', 'Bus du personnel', 'Camion', 'Engin de levage', 'Ambulance'], required: true },
      { name: 'affectation', label: 'Affectation', type: 'select', options: E.options('directions'), required: true },
      { name: 'conducteur', label: 'Conducteur attitré', type: 'select', options: empOpts(), empty: 'Pool (sans conducteur attitré)' },
      { name: 'statut', label: 'Statut', type: 'select', options: ['Disponible', 'En mission', 'En maintenance', 'Immobilisé'] },
      { name: 'km', label: 'Compteur', type: 'number', required: true, min: 0 }, { name: 'places', label: 'Places', type: 'number', min: 1 },
      { name: 'vt', label: 'Prochaine visite (VT / VGP)', type: 'date', required: true }, { name: 'assurance', label: 'Échéance assurance', type: 'date', required: true }
    ], values: v || { type: 'Véhicule de service', affectation: 'ACH', statut: 'Disponible', km: 0, places: 5, vt: E.addDays(E.today(), 365), assurance: E.addDays(E.today(), 365) },
    onSubmit: function (x) {
      var o = { modele: x.modele, immat: x.immat.toUpperCase(), type: x.type, affectation: x.affectation, conducteur: x.conducteur, statut: x.statut, km: +x.km, places: +x.places || 1, vt: x.vt, assurance: x.assurance };
      if (v) { S.update('vehicules', v.id, o); U.toast('Véhicule mis à jour'); }
      else { var n = Math.max.apply(null, vehs().map(function (y) { return +y.id.replace(/\D/g, '') || 0; })) + 1; o.id = 'VH-' + pad(n); o.carburantMois = 0; vehs().push(o); S.save(); U.toast('Véhicule ' + o.id + ' ajouté'); }
      E.log(v ? 'Véhicule modifié ' + v.id : 'Véhicule ajouté', o.modele + ' ' + o.immat, 'logistique'); E.rerender();
    } });
  }

  /* ---------- Missions & transport du personnel ---------- */
  function vMissions(el) {
    var all = S.all('missions').slice().sort(function (a, b) { return (b.date + b.heure).localeCompare(a.date + a.heure); });
    var list = all.filter(function (m) { return !state.misF || m.statut === state.misF; });
    var cols = [
      { key: 'id', label: 'Demande', render: function (m) { return '<b>' + esc(m.motif) + '</b><div class="small muted"><span class="mono">' + esc(m.id) + '</span> · ' + esc(m.type) + '</div>'; }, csv: function (m) { return m.id + ' ' + m.motif; } },
      { key: 'demandeur', label: 'Demandeur', render: function (m) { return esc(E.empName(m.demandeur)); }, csv: function (m) { return E.empName(m.demandeur); } },
      { key: 'date', label: 'Départ', render: function (m) { return '<span class="nowrap">' + dayLabel(m.date) + ' ' + esc(m.heure) + '</span>'; }, csv: function (m) { return m.date + ' ' + m.heure; } },
      { key: 'destination', label: 'Destination' },
      { key: 'passagers', label: 'Pass.', num: 1 },
      { key: 'vehiculeId', label: 'Véhicule', render: function (m) { var v = S.get('vehicules', m.vehiculeId); return v ? esc(v.modele) + '<div class="small muted mono">' + esc(v.immat) + '</div>' : '<span class="muted">À affecter</span>'; } },
      { key: 'statut', label: 'Statut', render: function (m) { return U.badge(m.statut, MIS_TONE[m.statut]); } }
    ];
    el.innerHTML =
      '<div class="grid g-2-1"><div class="card"><div class="card__h"><h3>Demandes de véhicule & missions</h3><span class="spacer"></span><button class="btn primary sm" id="mi-new">' + E.icon('plus') + 'Nouvelle demande</button></div>' +
        '<div class="card__b" style="padding-bottom:0"><div class="chips" id="mi-f" style="margin-bottom:12px">' + ['', 'Demandée', 'Validée', 'En cours', 'Terminée', 'Refusée'].map(function (s) { return '<button class="chip' + (state.misF === s ? ' is-active' : '') + '" data-k="' + s + '">' + (s || 'Toutes') + ' (' + (s ? all.filter(function (m) { return m.statut === s; }).length : all.length) + ')</button>'; }).join('') + '</div></div>' +
        U.table(cols, list, { onRow: function (m) { openMission(m.id); } }) + '</div>' +
      '<div class="card"><div class="card__h"><h3>Transport du personnel de quart</h3><span class="sub">rotations quotidiennes</span></div><div class="list">' +
        CIRCUITS.map(function (c) { var v = S.get('vehicules', c.bus) || {}; return '<div class="list__item"><div class="list__icon tone-navy" style="font:700 12px Sora,sans-serif">' + c.dep.replace(':', 'h') + '</div><div class="list__body"><b>' + esc(c.quart) + '</b><div class="small muted">' + esc(c.circuit) + '</div><div class="small">' + esc(v.modele || c.bus) + ' · <span class="mono">' + esc(v.immat || '') + '</span>' + (c.note ? ' · <span class="ops-neg">' + esc(c.note) + '</span>' : '') + '</div></div><div class="right"><b>' + c.inscrits + '</b><div class="small muted">/ ' + (v.places || '—') + ' pl.</div></div></div>'; }).join('') +
      '</div><div class="card__b" style="border-top:1px solid var(--line-2)"><div class="ops-note">Les listes de passagers sont générées depuis le planning des quarts (module Personnel). Tout retard de bus de plus de 10 minutes est signalé au chef de quart.</div></div></div></div>';
    el.querySelector('#mi-f').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) { state.misF = b.dataset.k; vMissions(el); } });
    el.querySelector('#mi-new').onclick = missionForm;
  }
  function vehOptsFree(date) {
    return vehs().filter(function (v) { return v.statut !== 'Immobilisé' && v.statut !== 'En maintenance' && echeance(v.vt).j >= 0 && echeance(v.assurance).j >= 0 && !S.all('missions').some(function (m) { return m.vehiculeId === v.id && m.date === date && (m.statut === 'Validée' || m.statut === 'En cours'); }); })
      .sort(function (a, b) { return (a.statut === 'Disponible' ? 0 : 1) - (b.statut === 'Disponible' ? 0 : 1); }).map(function (v) { return { v: v.id, l: v.id + ' · ' + v.modele + ' (' + v.places + ' pl.) — ' + v.statut.toLowerCase() }; });
  }
  function openMission(id, deep) {
    var m = S.get('missions', id); if (!m) return;
    var v = S.get('vehicules', m.vehiculeId), free = vehOptsFree(m.date);
    var body = U.steps(['Demandée', 'Validée', 'En cours', 'Terminée'], m.statut === 'Refusée' ? 1 : ['Demandée', 'Validée', 'En cours', 'Terminée'].indexOf(m.statut), { rejected: m.statut === 'Refusée', finished: m.statut === 'Terminée' }) +
      '<dl class="kv" style="margin-top:12px"><dt>Motif</dt><dd><b>' + esc(m.motif) + '</b></dd><dt>Type</dt><dd>' + esc(m.type) + '</dd><dt>Demandeur</dt><dd>' + esc(E.empName(m.demandeur)) + '</dd><dt>Départ</dt><dd>' + dayLong(m.date) + ' à ' + esc(m.heure) + '</dd><dt>Retour prévu</dt><dd>' + F.date(m.retour) + '</dd><dt>Destination</dt><dd>' + esc(m.destination) + '</dd><dt>Passagers</dt><dd>' + m.passagers + '</dd><dt>Véhicule</dt><dd>' + (v ? esc(v.modele) + ' · <span class="mono">' + esc(v.immat) + '</span>' : '—') + '</dd>' + (m.motifRefus ? '<dt>Motif du refus</dt><dd class="ops-neg">' + esc(m.motifRefus) + '</dd>' : '') + '</dl>' +
      (m.statut === 'Demandée' ? '<div class="field" style="margin-top:14px"><label for="mi-veh">Véhicule à affecter</label><select class="select" id="mi-veh">' + free.filter(function (o) { return (S.get('vehicules', o.v) || {}).places >= m.passagers; }).map(function (o) { return '<option value="' + o.v + '">' + esc(o.l) + '</option>'; }).join('') + '</select><span class="small muted">Seuls les véhicules disponibles, en règle (VT, assurance) et de capacité suffisante sont proposés.</span></div>' : '');
    var acts = [];
    if (m.statut === 'Demandée') {
      acts.push({ label: 'Refuser', cls: 'danger', icon: 'x', onClick: function (c) { S.update('missions', id, { statut: 'Refusée', motifRefus: 'Refusée par le service Logistique' }); E.log('Mission refusée ' + id, m.motif, 'logistique'); c(); U.toast('Demande refusée', 'err'); E.rerender(); } });
      acts.push({ label: 'Valider et affecter', cls: 'primary', icon: 'check', onClick: function (c, root) { var vid = root.querySelector('#mi-veh').value; if (!vid) { U.toast('Aucun véhicule disponible pour ce créneau.', 'err'); return; } S.update('missions', id, { statut: 'Validée', vehiculeId: vid }); E.log('Mission validée ' + id, m.motif + ' · ' + vid, 'logistique'); E.notify('Mission ' + id + ' validée', m.motif + ' — véhicule ' + vid, '#/logistique/missions/' + id, 'green'); c(); U.toast('Mission validée — véhicule ' + vid); E.rerender(); } });
    }
    if (m.statut === 'Validée') acts.push({ label: 'Démarrer la mission', cls: 'primary', icon: 'arrow', onClick: function (c) { S.update('missions', id, { statut: 'En cours' }); if (m.vehiculeId) S.update('vehicules', m.vehiculeId, { statut: 'En mission' }); E.log('Mission démarrée ' + id, '', 'logistique'); c(); U.toast('Mission en cours'); E.rerender(); } });
    if (m.statut === 'En cours') acts.push({ label: 'Clôturer (retour)', cls: 'primary', icon: 'check', onClick: function (c) { S.update('missions', id, { statut: 'Terminée' }); if (m.vehiculeId) S.update('vehicules', m.vehiculeId, { statut: 'Disponible' }); E.log('Mission terminée ' + id, '', 'logistique'); c(); U.toast('Mission clôturée — véhicule disponible'); E.rerender(); } });
    if (!acts.length) acts.push({ label: 'Fermer' });
    U.modal({ title: 'Mission ' + m.id, sub: esc(m.type), body: body, actions: acts, onClose: deep ? function () { clearDeep('missions'); } : null });
  }
  function missionForm() {
    var u = E.session.user();
    U.formModal({ title: 'Nouvelle demande de véhicule', sub: 'Mission, navette ou transport de personnel', okLabel: 'Envoyer la demande', fields: [
      { name: 'type', label: 'Type', type: 'select', options: ['Mission', 'Navette', 'Transport de quart'], required: true },
      { name: 'demandeur', label: 'Demandeur', type: 'select', options: empOpts(), required: true },
      { name: 'motif', label: 'Motif', required: true, full: true },
      { name: 'destination', label: 'Destination', required: true },
      { name: 'passagers', label: 'Nombre de passagers', type: 'number', required: true, min: 1 },
      { name: 'date', label: 'Date de départ', type: 'date', required: true }, { name: 'heure', label: 'Heure', type: 'time', required: true },
      { name: 'retour', label: 'Date de retour', type: 'date', required: true }
    ], values: { type: 'Mission', demandeur: empIdByName(u && u.profile === 'achats' ? 'Ondo Mba' : 'Oyane'), passagers: 2, date: E.addDays(E.today(), 1), retour: E.addDays(E.today(), 1), heure: '08:00' },
    onSubmit: function (x) {
      if (x.retour < x.date) { U.toast('La date de retour précède le départ.', 'err'); return false; }
      var o = { id: nextNum('MIS', S.all('missions')), type: x.type, demandeur: x.demandeur, motif: x.motif, destination: x.destination, passagers: +x.passagers, date: x.date, heure: x.heure, retour: x.retour, vehiculeId: '', statut: 'Demandée' };
      S.all('missions').unshift(o); S.save(); E.log('Demande de véhicule ' + o.id, o.motif, 'logistique'); E.notify('Demande de véhicule ' + o.id, o.motif + ' · ' + F.date(o.date), '#/logistique/missions/' + o.id, 'orange');
      U.toast('Demande ' + o.id + ' envoyée au service Logistique'); E.rerender();
    } });
  }

  /* ---------- Livraisons ---------- */
  function vLiv(el) {
    var all = livs().slice().sort(function (a, b) { return b.depart.localeCompare(a.depart); });
    var list = all.filter(function (l) { return !state.livF || (state.livF === 'retard' ? livLate(l) : state.livF === 'ecart' ? Math.abs(livEcart(l) || 0) > TOL : l.statut === state.livF); });
    var depots = E.groupBy(all, 'depot');
    var done = all.filter(function (l) { return l.statut === 'Livré'; });
    var perte = sum(done, 'volumeCharge') ? (sum(done, 'volumeLivre') - sum(done, 'volumeCharge')) / sum(done, 'volumeCharge') * 100 : 0;
    var cols = [
      { key: 'id', label: 'Livraison', render: function (l) { return '<b>' + esc(l.depot) + '</b><div class="small muted"><span class="mono">' + esc(l.id) + '</span> · ' + esc(clientNom(l.clientId)) + '</div>'; }, csv: function (l) { return l.id + ' ' + l.depot; } },
      { key: 'produit', label: 'Produit', cls: 'nowrap', render: function (l) { return dot(pr(l.produit).c) + esc(pl(l.produit)); }, csv: function (l) { return pr(l.produit).l; } },
      { key: 'mode', label: 'Acheminement', render: function (l) { return esc(l.mode) + '<div class="small muted">' + esc(l.vecteur) + '</div>'; } },
      { key: 'depart', label: 'Départ', render: function (l) { return F.dateShort(l.depart); } },
      { key: 'arrivee', label: 'Arrivée', render: function (l) { return l.arrivee ? F.dateShort(l.arrivee) + (l.arrivee > l.arriveePrevue ? ' <span class="small ops-neg">+' + E.daysBetween(l.arriveePrevue, l.arrivee) + ' j</span>' : '') : '<span class="muted">prévue ' + F.dateShort(l.arriveePrevue) + '</span>'; } },
      { key: 'volumeCharge', label: 'Chargé (m³)', num: 1, render: function (l) { return F.num(l.volumeCharge); } },
      { key: 'volumeLivre', label: 'Livré (m³)', num: 1, render: function (l) { return l.volumeLivre == null ? '' : F.num(l.volumeLivre, 1); } },
      { key: 'ecart', label: 'Écart', num: 1, render: function (l) { var e = livEcart(l); return e == null ? '' : '<b class="' + (Math.abs(e) > TOL ? 'ops-neg' : '') + '">' + F.num(e, 2) + ' %</b>'; }, csv: function (l) { var e = livEcart(l); return e == null ? '' : e.toFixed(2); } },
      { key: 'statut', label: 'Statut', render: function (l) { return livLate(l) ? U.badge('En retard', 'red') : l.statut === 'En transit' ? '<button class="btn sm" data-rcv="' + l.id + '">' + E.icon('check') + 'Réception</button>' : Math.abs(livEcart(l)) > TOL && !l.ecartTraite ? U.badge('Écart à analyser', 'orange') : U.badge('Livré', 'green'); }, csv: function (l) { return l.statut; } }
    ];
    el.innerHTML =
      '<div class="grid g4" style="margin-bottom:16px">' +
        U.kpi({ label: 'En transit', value: F.num(sum(all.filter(function (l) { return l.statut === 'En transit'; }), 'volumeCharge')), unit: 'm³', icon: 'truck', tone: 'blue', foot: all.filter(function (l) { return l.statut === 'En transit'; }).length + ' livraisons' }) +
        U.kpi({ label: 'Livraisons en retard', value: all.filter(livLate).length, icon: 'clock', tone: all.filter(livLate).length ? 'red' : 'green', foot: 'date d\'arrivée prévue dépassée' }) +
        U.kpi({ label: 'Écart moyen à la livraison', value: F.num(perte, 2), unit: '%', icon: 'drop', tone: Math.abs(perte) > TOL ? 'orange' : 'green', foot: 'tolérance contractuelle ± ' + F.num(TOL, 1) + ' %' }) +
        U.kpi({ label: 'Ponctualité', value: F.num(done.length ? done.filter(function (l) { return l.arrivee <= l.arriveePrevue; }).length / done.length * 100 : 100), unit: '%', icon: 'target', tone: 'violet', foot: done.length + ' livraisons réceptionnées' }) +
      '</div>' +
      '<div class="card" style="margin-bottom:16px"><div class="card__h"><h3>Dépôts de l\'intérieur</h3><span class="sub">Port-Gentil n\'étant pas relié par la route, les produits partent par caboteur vers Owendo, par barge sur l\'Ogooué, puis par le Transgabonais ou la route</span></div><div class="card__b"><div class="ops-stat">' +
        Object.keys(depots).map(function (d) { var l = depots[d], tr = l.filter(function (x) { return x.statut === 'En transit'; }); return '<div><span>' + E.icon('pin').replace('<svg ', '<svg style="width:12px;vertical-align:-1px" ') + ' ' + esc(d) + '</span><b>' + F.num(sum(tr, 'volumeCharge')) + ' m³</b><span>en transit · ' + l.length + ' livraison(s)</span></div>'; }).join('') + '</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Suivi des livraisons</h3><span class="spacer"></span><div class="chips" id="lv-f">' + [['', 'Toutes'], ['En transit', 'En transit'], ['Livré', 'Livrées'], ['retard', 'En retard'], ['ecart', 'Avec écart']].map(function (c) { return '<button class="chip' + (state.livF === c[0] ? ' is-active' : '') + '" data-k="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div><button class="btn sm" id="lv-csv">' + E.icon('download') + 'CSV</button></div>' +
      U.table(cols, list, { onRow: function (l) { openLiv(l.id); }, empty: 'Aucune livraison pour ce filtre' }) + '</div>';
    el.querySelector('#lv-f').addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (b) { state.livF = b.dataset.k; vLiv(el); } });
    el.querySelector('#lv-csv').onclick = function () { U.exportCSV('livraisons-depots-' + E.today(), cols, list); };
    E.$$('[data-rcv]', el).forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); rcvForm(b.dataset.rcv); }; });
  }
  function openLiv(id, deep) {
    var l = S.get('livraisons', id); if (!l) return;
    var e = livEcart(l);
    var body = U.steps(['Chargé à Port-Gentil', 'En transit', 'Livré'], l.statut === 'Livré' ? 2 : 1, { finished: l.statut === 'Livré' }) +
      (livLate(l) ? '<div class="alert tone-red" style="margin:10px 0">' + E.icon('clock') + '<div>Arrivée prévue le <b>' + F.date(l.arriveePrevue) + '</b> — retard de ' + E.daysBetween(l.arriveePrevue, E.today()) + ' jour(s). Contacter le transporteur.</div></div>' : '') +
      (e != null && Math.abs(e) > TOL ? '<div class="alert tone-orange" style="margin:10px 0">' + E.icon('alert') + '<div>Écart de <b>' + F.num(e, 2) + ' %</b> (' + F.num(l.volumeLivre - l.volumeCharge, 1) + ' m³) au-delà de la tolérance de ± ' + F.num(TOL, 1) + ' % : réserve à notifier au transporteur et vérification des certificats de jaugeage.' + (l.ecartTraite ? ' <b>Écart traité.</b>' : '') + '</div></div>' : '') +
      '<dl class="kv" style="margin-top:12px"><dt>Dépôt</dt><dd><b>' + esc(l.depot) + '</b></dd><dt>Client</dt><dd>' + esc(clientNom(l.clientId)) + '</dd><dt>Produit</dt><dd>' + dot(pr(l.produit).c) + esc(pr(l.produit).l) + '</dd><dt>Acheminement</dt><dd>' + esc(l.mode) + ' · ' + esc(l.vecteur) + '</dd><dt>Départ</dt><dd>' + F.date(l.depart) + '</dd><dt>Arrivée prévue / réelle</dt><dd>' + F.date(l.arriveePrevue) + ' / ' + (l.arrivee ? F.date(l.arrivee) : '—') + '</dd><dt>Volume chargé</dt><dd>' + F.num(l.volumeCharge) + ' m³</dd><dt>Volume livré</dt><dd>' + (l.volumeLivre == null ? '—' : F.num(l.volumeLivre, 1) + ' m³ (' + F.num(e, 2) + ' %)') + '</dd></dl>';
    var acts = [];
    if (l.statut === 'En transit') acts.push({ label: 'Confirmer la réception', cls: 'primary', icon: 'check', onClick: function (c) { c(); rcvForm(id); } });
    else if (e != null && Math.abs(e) > TOL && !l.ecartTraite) acts.push({ label: 'Marquer l\'écart comme traité', cls: 'primary', icon: 'check', onClick: function (c) { S.update('livraisons', id, { ecartTraite: true }); E.log('Écart de livraison traité ' + id, F.num(e, 2) + ' %', 'logistique'); c(); U.toast('Écart traité — réserve notifiée'); E.rerender(); } });
    else acts.push({ label: 'Fermer' });
    U.modal({ title: 'Livraison ' + l.id, sub: esc(l.depot) + ' · ' + esc(pr(l.produit).l), body: body, actions: acts, onClose: deep ? function () { clearDeep('livraisons'); } : null });
  }
  function rcvForm(id) {
    var l = S.get('livraisons', id);
    U.formModal({ title: 'Réception au dépôt de ' + l.depot, sub: l.id + ' · ' + pr(l.produit).l + ' · ' + F.num(l.volumeCharge) + ' m³ chargés', size: 'sm', okLabel: 'Confirmer la réception', fields: [
      { name: 'volumeLivre', label: 'Volume réceptionné (m³, ramené à 15 °C)', type: 'number', step: '0.1', required: true, full: true },
      { name: 'arrivee', label: 'Date d\'arrivée', type: 'date', required: true, full: true }
    ], values: { volumeLivre: l.volumeCharge, arrivee: E.today() }, onSubmit: function (v) {
      var vl = +v.volumeLivre; if (!(vl > 0)) { U.toast('Volume invalide.', 'err'); return false; }
      S.update('livraisons', id, { volumeLivre: vl, arrivee: v.arrivee, statut: 'Livré' });
      var e = (vl - l.volumeCharge) / l.volumeCharge * 100;
      E.log('Livraison réceptionnée ' + id, l.depot + ' · ' + F.num(vl, 1) + ' m³ (' + F.num(e, 2) + ' %)', 'logistique');
      if (Math.abs(e) > TOL) E.notify('Écart de livraison ' + F.num(e, 2) + ' %', l.depot + ' · ' + pr(l.produit).l + ' — ' + id, '#/logistique/livraisons/' + id, 'red');
      U.toast(Math.abs(e) > TOL ? 'Réception enregistrée — écart de ' + F.num(e, 2) + ' % hors tolérance' : 'Réception conforme enregistrée', Math.abs(e) > TOL ? 'err' : 'ok'); E.rerender();
    } });
  }

  /* ------------------------------------------------------------------ enregistrement */
  E.register({
    id: 'logistique', label: 'Logistique & transport', title: 'Logistique, expéditions & transport', icon: 'truck', group: 'Opérations', roles: ['achats'],
    seed: seed,
    render: render,
    summary: function () {
      var td = enlDay(E.today()), att = attendus(7);
      return [
        { label: 'Camions sur site', value: String(onSite().length), icon: 'truck', tone: 'orange', foot: F.num(sum(td, volEnl)) + ' m³ enlevés aujourd\'hui', href: '#/logistique/enlevements' },
        { label: 'Navires attendus (7 j)', value: String(att.length), icon: 'ship', tone: 'violet', foot: navires().filter(function (s) { return demurrage(s).running && demurrage(s).ex > 0; }).length + ' navire(s) en surestaries', href: '#/logistique/navires' }
      ];
    },
    pending: function () {
      var out = [];
      enlDay(E.today()).filter(function (e) { return e.statut === 'À l\'entrée'; }).forEach(function (e) { out.push({ title: 'Contrôle sécurité · ' + e.immat, sub: clientNom(e.clientId) + ' · ' + pr(e.produit).l + ' ' + e.volume + ' m³ · entré à ' + e.heureEntree, date: e.date, href: '#/logistique/enlevements/' + e.id, tone: 'orange' }); });
      S.all('missions').filter(function (m) { return m.statut === 'Demandée'; }).forEach(function (m) { out.push({ title: 'Demande de véhicule ' + m.id + ' · ' + m.motif, sub: E.empName(m.demandeur) + ' · ' + m.passagers + ' pers. · ' + m.destination, date: m.date, href: '#/logistique/missions/' + m.id, tone: 'orange' }); });
      return out;
    },
    search: function (q) {
      var r = [];
      enls().forEach(function (e) { if (E.norm(e.id + ' ' + e.immat + ' ' + e.chauffeur + ' ' + clientNom(e.clientId) + ' ' + (e.bl || '')).indexOf(q) >= 0) r.push({ title: 'Enlèvement ' + e.id + ' · ' + e.immat, sub: clientNom(e.clientId) + ' · ' + F.date(e.date) + ' · ' + e.statut, href: '#/logistique/enlevements/' + e.id }); });
      navires().forEach(function (s) { if (E.norm(s.id + ' ' + s.navire).indexOf(q) >= 0) r.push({ title: s.navire, sub: s.id + ' · ' + s.statut, href: '#/logistique/navires/' + s.id }); });
      vehs().forEach(function (v) { if (E.norm(v.id + ' ' + v.immat + ' ' + v.modele).indexOf(q) >= 0) r.push({ title: v.modele, sub: v.immat + ' · ' + v.statut, href: '#/logistique/flotte/' + v.id }); });
      livs().forEach(function (l) { if (E.norm(l.id + ' ' + l.depot).indexOf(q) >= 0) r.push({ title: 'Livraison ' + l.id + ' · ' + l.depot, sub: pr(l.produit).l + ' · ' + l.statut, href: '#/logistique/livraisons/' + l.id }); });
      return r;
    },
    badge: function () { return enlDay(E.today()).filter(function (e) { return e.statut === 'À l\'entrée'; }).length + S.all('missions').filter(function (m) { return m.statut === 'Demandée'; }).length + vehAlerts().filter(function (a) { return a.e.j < 0; }).length; }
  });
})();
