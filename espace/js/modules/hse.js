/* SOGARA · Espace de gestion — Module HSE & permis de travail
   Permis de travail (workflow avec contrôles bloquants, mesures de gaz), plans de prévention,
   événements HSE & actions correctives, indicateurs (TF1/TF2/TG, pyramide de Bird), visites & audits, environnement. */
(function () {
  'use strict';
  var E = window.ERP; if (!E) return;
  var ui = E.ui, fmt = E.fmt, esc = E.esc, icon = E.icon, S = E.store;

  /* feuille de style propre au module */
  if (!document.querySelector('link[data-hse]')) { var lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = 'css/hse.css'; lk.setAttribute('data-hse', ''); document.head.appendChild(lk); }

  /* ================================================================== utilitaires */
  function M(i) { return 'MAT-' + (1041 + i * 7); }
  function N(i) { return E.empName(M(i)); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function localISO(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function toDate(s) { return s ? new Date(String(s).length <= 10 ? s + 'T00:00' : s) : null; }
  function nowISO() { return localISO(new Date()); }
  function shift(s, h) { return localISO(new Date(toDate(s).getTime() + h * 36e5)); }
  function dayAt(off, hh, mm) { var d = new Date(E.TODAY); d.setDate(d.getDate() + off); d.setHours(hh, mm || 0, 0, 0); return localISO(d); }
  function D(off) { return E.addDays(E.today(), off); }
  function hoursBetween(a, b) { return (toDate(b) - toDate(a)) / 36e5; }
  function fDT(s) { var d = toDate(s); if (!d) return '—'; return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + 'h' + pad(d.getMinutes()); }
  function fH(s) { var d = toDate(s); return d ? pad(d.getHours()) + 'h' + pad(d.getMinutes()) : '—'; }
  function dur(h) { var neg = h < 0; h = Math.abs(h); var hh = Math.floor(h), mm = Math.round((h - hh) * 60); if (mm === 60) { hh++; mm = 0; } return (neg ? '-' : '') + (hh ? hh + ' h' + (mm ? ' ' + pad(mm) : '') : mm + ' min'); }
  function num(v, d) { return fmt.num(v, d == null ? (v % 1 ? 1 : 0) : d); }
  function user() { return E.session.user() || { name: 'Utilisateur', profile: '' }; }
  function isHSE() { var u = user(); return u.profile === 'hse' || u.profile === 'admin'; }
  function uName(id) { var u = S.get('unites', id); return u ? u.nom : (id || '—'); }
  function ent(id) { if (!id || id === 'INT') return 'SOGARA (interne)'; var f = S.get('fournisseurs', id); return f ? f.nom : id; }
  function empOpts() { return S.all('employes').map(function (e) { return { v: e.id, l: e.nom + ' · ' + e.poste }; }); }
  function entOpts() { return [{ v: 'INT', l: 'SOGARA (interne)' }].concat(E.options('fournisseurs')); }
  function uniteOpts() { return S.all('unites').map(function (u) { return { v: u.id, l: u.id + ' · ' + u.nom }; }); }
  function nextId(col, prefix, width) {
    var max = 0; S.all(col).forEach(function (x) { if (String(x.id).indexOf(prefix) === 0) { var n = parseInt(String(x.id).slice(prefix.length), 10); if (n > max) max = n; } });
    return prefix + String(max + 1).padStart(width, '0');
  }
  function yr() { return E.TODAY.getFullYear(); }
  function after(fn) { setTimeout(fn, 0); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function stamp(note) { var u = user(); return { at: nowISO(), par: u.name, note: note || '' }; }
  function alertBox(tone, ic, html) { return '<div class="alert tone-' + tone + '">' + icon(ic) + '<div>' + html + '</div></div>'; }

  /* ================================================================== référentiels HSE */
  var TYPES = {
    GEN: { l: 'Permis général (travail à froid)', s: 'Travail à froid', c: '#2563eb', ic: 'wrench' },
    FEU: { l: 'Permis de feu (travail à chaud)', s: 'Permis de feu', c: '#d93636', ic: 'fire' },
    ESP: { l: 'Pénétration en espace confiné', s: 'Espace confiné', c: '#7c3aed', ic: 'tank' },
    HAU: { l: 'Travail en hauteur', s: 'Travail en hauteur', c: '#e8780c', ic: 'layers' },
    LOTO: { l: 'Consignation électrique / mécanique (LOTO)', s: 'Consignation LOTO', c: '#a16207', ic: 'lock' },
    FOU: { l: 'Fouille / excavation', s: 'Fouille', c: '#78552b', ic: 'box' },
    LEV: { l: 'Levage', s: 'Levage', c: '#0e7490', ic: 'truck' },
    H2S: { l: 'Travail sur ligne H2S / produits toxiques', s: 'Ligne H2S / toxiques', c: '#0f2d5c', ic: 'alert' },
    RAD: { l: 'Radiographie industrielle', s: 'Radiographie', c: '#be185d', ic: 'target' }
  };
  var TYPE_KEYS = Object.keys(TYPES);
  var GAS_REQ = { FEU: 1, ESP: 1, H2S: 1 };
  var ST_TONE = { 'Demandé': 'orange', 'Préparé': 'violet', 'Autorisé': 'green', 'En cours': 'blue', 'Suspendu': 'red', 'Clôturé': 'grey', 'Annulé': 'grey' };
  var ACTIFS = ['Autorisé', 'En cours', 'Suspendu'];
  var FLOW = ['Demandé', 'Préparé', 'Autorisé', 'En cours', 'Clôturé'];
  var DANGERS = [
    ['atex', 'Atmosphère explosive (ATEX)'], ['hc', 'Hydrocarbures / produits inflammables'], ['h2s', 'H₂S / gaz toxiques'], ['anoxie', 'Anoxie (manque d\'oxygène)'],
    ['chute', 'Chute de hauteur'], ['objets', 'Chute d\'objets'], ['elec', 'Électrisation / électrocution'], ['energie', 'Énergie résiduelle (pression, mécanique)'],
    ['brulure', 'Brûlure / surfaces chaudes'], ['rayon', 'Rayonnements ionisants'], ['ensev', 'Ensevelissement'], ['charge', 'Charge suspendue'],
    ['bruit', 'Bruit'], ['coactivite', 'Coactivité / interférences'], ['chimique', 'Produits chimiques (soude, amines)'], ['chaleur', 'Chaleur / coup de chaleur']
  ];
  var SECU = [
    ['consignation', 'Consignation électrique / mécanique (LOTO) effectuée'],
    ['isolement', 'Isolement process : vannes cadenassées, joints pleins posés'],
    ['purge', 'Vidange, purge et inertage (azote / vapeur)'],
    ['degazage', 'Dégazage et ventilation forcée'],
    ['gaz', 'Mesures de gaz réalisées (explosimètre 4 gaz étalonné)'],
    ['detecteur', 'Détecteur 4 gaz portatif en continu sur la zone'],
    ['surveillant', 'Surveillant / veilleur désigné en permanence'],
    ['extincteurs', 'Extincteurs et lance incendie en place'],
    ['bache', 'Bâches ignifugées, regards et caniveaux obturés'],
    ['balisage', 'Zone balisée et signalisée'],
    ['ari', 'ARI (appareil respiratoire isolant) disponible sur place'],
    ['harnais', 'Harnais, ligne de vie, échafaudage réceptionné (étiquette verte)'],
    ['radio', 'Liaison radio avec la salle de contrôle'],
    ['sauvetage', 'Moyens de sauvetage et d\'évacuation (trépied, treuil)'],
    ['reseaux', 'Réseaux enterrés repérés, blindage / talutage de la fouille'],
    ['levage', 'Plan de levage validé, élingues et grue contrôlées'],
    ['radioprot', 'Périmètre de radioprotection balisé, dosimètres, PCR présente']
  ];
  var REQ = {
    GEN: ['isolement', 'balisage', 'radio'],
    FEU: ['isolement', 'purge', 'gaz', 'detecteur', 'surveillant', 'extincteurs', 'bache', 'balisage'],
    ESP: ['consignation', 'isolement', 'purge', 'degazage', 'gaz', 'detecteur', 'surveillant', 'ari', 'radio', 'sauvetage'],
    HAU: ['harnais', 'balisage', 'sauvetage'],
    LOTO: ['consignation', 'balisage'],
    FOU: ['reseaux', 'balisage'],
    LEV: ['levage', 'balisage', 'radio'],
    H2S: ['isolement', 'purge', 'gaz', 'detecteur', 'ari', 'surveillant', 'balisage', 'radio'],
    RAD: ['radioprot', 'balisage', 'radio']
  };
  var EPI = [['casque', 'Casque'], ['lunettes', 'Lunettes de sécurité'], ['chaussures', 'Chaussures de sécurité'], ['combi', 'Combinaison ignifugée'], ['gants', 'Gants adaptés'],
    ['auditif', 'Protection auditive'], ['masque', 'Masque à cartouche'], ['ari', 'ARI'], ['harnais', 'Harnais antichute'], ['ecran', 'Écran / cagoule de soudeur'], ['detect', 'Détecteur 4 gaz individuel'], ['dosi', 'Dosimètre']];
  var EPI_BASE = ['casque', 'lunettes', 'chaussures', 'combi', 'gants'];
  var EPI_TYPE = { FEU: ['ecran', 'detect'], ESP: ['ari', 'detect', 'harnais'], HAU: ['harnais'], H2S: ['ari', 'detect'], RAD: ['dosi'], LEV: [], LOTO: [], FOU: ['detect'], GEN: [] };
  var RETOUR = [['travaux', 'Travaux terminés'], ['propre', 'Zone propre et rangée, déchets évacués'], ['materiel', 'Matériel, outillage et échafaudages retirés'], ['deconsig', 'Déconsignation / remise en service effectuée'], ['restitue', 'Installation restituée à l\'exploitation']];
  function lbl(list, k) { var x = list.find(function (a) { return a[0] === k; }); return x ? x[1] : k; }

  /* Mesures de gaz : seuils & couleurs */
  var GAS = [
    { k: 'o2', l: 'O₂', u: '%', step: '0.1', lvl: function (v) { return v < 19.5 || v > 23.5 ? 'bad' : v < 20.5 ? 'warn' : 'ok'; }, seuil: '19,5 – 23,5 %' },
    { k: 'lie', l: 'LIE', u: '%', step: '1', lvl: function (v) { return v >= 10 ? 'bad' : v > 0 ? 'warn' : 'ok'; }, seuil: '0 % (feu) · < 10 %' },
    { k: 'h2s', l: 'H₂S', u: 'ppm', step: '0.1', lvl: function (v) { return v >= 5 ? 'bad' : v >= 1 ? 'warn' : 'ok'; }, seuil: '< 1 ppm (5 ppm sous ARI)' },
    { k: 'co', l: 'CO', u: 'ppm', step: '1', lvl: function (v) { return v >= 50 ? 'bad' : v >= 20 ? 'warn' : 'ok'; }, seuil: '< 20 ppm (VME)' }
  ];
  function gasPills(m) {
    if (!m) return '<span class="muted small">Aucune mesure</span>';
    return '<span class="gzs">' + GAS.map(function (g) { return '<span class="gz ' + g.lvl(m[g.k]) + '">' + g.l + ' ' + num(m[g.k]) + '</span>'; }).join('') + '</span>';
  }
  function gasWorst(m) { if (!m) return null; var l = GAS.map(function (g) { return g.lvl(m[g.k]); }); return l.indexOf('bad') >= 0 ? 'bad' : l.indexOf('warn') >= 0 ? 'warn' : 'ok'; }
  function lastGas(p) { return p.gaz && p.gaz.length ? p.gaz[p.gaz.length - 1] : null; }
  /* règles bloquantes selon le type de permis */
  function gasRules(type, m, secu) {
    if (!m) return [{ ok: false, l: 'Mesure de gaz obligatoire pour ce type de permis' }];
    var r = [];
    r.push({ ok: m.o2 >= 19.5 && m.o2 <= 23.5, l: 'O₂ entre 19,5 et 23,5 % (mesuré : ' + num(m.o2) + ' %)' });
    if (type === 'FEU') r.push({ ok: m.lie <= 0, l: 'LIE = 0 % pour un travail par point chaud (mesuré : ' + num(m.lie) + ' %)' });
    else r.push({ ok: m.lie < 10, l: 'LIE < 10 % (mesuré : ' + num(m.lie) + ' %)' });
    if (type === 'H2S') r.push({ ok: m.h2s < 5 && !!(secu && secu.ari), l: 'H₂S < 5 ppm avec ARI en place (mesuré : ' + num(m.h2s) + ' ppm)' });
    else r.push({ ok: m.h2s < 1, l: 'H₂S < 1 ppm (mesuré : ' + num(m.h2s) + ' ppm)' });
    var coMax = type === 'ESP' ? 20 : 50;
    r.push({ ok: m.co < coMax, l: 'CO < ' + coMax + ' ppm (mesuré : ' + num(m.co) + ' ppm)' });
    return r;
  }
  function authChecks(p) {
    var c = [];
    c.push({ ok: (p.dangers || []).length > 0 && !!p.mesuresRisques, l: 'Analyse de risques renseignée (dangers + mesures)' });
    var req = REQ[p.type] || [], miss = req.filter(function (k) { return !(p.secu || {})[k]; });
    c.push({ ok: !miss.length, l: 'Mesures de sécurité obligatoires : ' + (req.length - miss.length) + '/' + req.length + (miss.length ? ' — manque : ' + miss.map(function (k) { return lbl(SECU, k).split(' (')[0]; }).join(', ') : '') });
    c.push({ ok: (p.epi || []).length > 0, l: 'EPI requis définis' });
    var d = hoursBetween(p.debut, p.fin);
    c.push({ ok: d > 0 && d <= 12, l: 'Durée de validité ≤ 12 h (' + dur(d) + ')' });
    if ((p.type === 'FEU' || p.type === 'ESP') && !p.surveillant) c.push({ ok: false, l: 'Surveillant désigné' });
    (p.associes || []).forEach(function (id) { var a = S.get('permis', id); if (a && a.type === 'LOTO') c.push({ ok: ACTIFS.indexOf(a.statut) >= 0, l: 'Consignation associée ' + id + ' autorisée (' + a.statut.toLowerCase() + ')' }); });
    if (GAS_REQ[p.type]) c = c.concat(gasRules(p.type, lastGas(p), p.secu));
    return c;
  }
  function checklist(c) { return '<ul class="hse-ctl">' + c.map(function (x) { return '<li class="' + (x.ok ? 'ok' : 'ko') + '"><i>' + (x.ok ? '✓' : '✕') + '</i><span>' + esc(x.l) + '</span></li>'; }).join('') + '</ul>'; }

  function stBadge(s) { return ui.badge(s, ST_TONE[s]); }
  function tt(type, long) { var t = TYPES[type] || TYPES.GEN; return '<span class="hse-tt" style="--c:' + t.c + '">' + icon(t.ic) + '<span>' + esc(long ? t.l : t.s) + '</span></span>'; }
  function isOverdue(p) { return (p.statut === 'En cours' || p.statut === 'Suspendu') && toDate(p.fin) < new Date(); }

  /* Événements */
  var EVT = {
    AAA: { l: 'Accident avec arrêt', c: '#b91c1c', tone: 'red', ic: 'alert' },
    ASA: { l: 'Accident sans arrêt', c: '#e8780c', tone: 'orange', ic: 'helmet' },
    PA: { l: 'Presque-accident', c: '#ca8a04', tone: 'yellow', ic: 'flag' },
    SD: { l: 'Situation dangereuse', c: '#2563eb', tone: 'blue', ic: 'eye' },
    FEU: { l: 'Départ de feu', c: '#d93636', tone: 'red', ic: 'fire' },
    FUI: { l: 'Fuite / déversement', c: '#7c3aed', tone: 'violet', ic: 'drop' },
    ENV: { l: 'Environnement (mangrove, rejet)', c: '#1e9e4a', tone: 'green', ic: 'globe' }
  };
  var GRAV = ['', 'Mineure', 'Modérée', 'Sérieuse', 'Majeure'];
  var GRAV_TONE = ['', 'grey', 'yellow', 'orange', 'red'];
  var EV_FLOW = ['Déclaré', 'En analyse', 'Actions en cours', 'Clôturé'];
  var EV_TONE = { 'Déclaré': 'orange', 'En analyse': 'violet', 'Actions en cours': 'blue', 'Clôturé': 'grey' };
  var CAT5M = ['Main-d\'œuvre', 'Méthode', 'Matériel', 'Milieu', 'Management'];
  function evBadge(type) { var t = EVT[type]; return ui.badge(t ? t.l : type, t ? t.tone : 'grey'); }
  function gravBadge(g) { return '<span class="badge plain ' + ui.TONES[GRAV_TONE[g] || 'grey'] + '">G' + g + ' · ' + GRAV[g] + '</span>'; }
  function actLate(a) { return a.statut !== 'Réalisée' && a.echeance < E.today(); }

  /* Plans de prévention */
  var PDP_FLOW = ['Brouillon', 'Inspection commune', 'Signé', 'Actif', 'Expiré'];
  var PDP_TONE = { 'Brouillon': 'grey', 'Inspection commune': 'orange', 'Signé': 'violet', 'Actif': 'green', 'Expiré': 'red' };

  /* ================================================================== données d'exemple */
  function seed() {
    var nb = new Date(); nb.setMinutes(0, 0, 0);
    var now = new Date();
    var HB = function (h) { return localISO(new Date(nb.getTime() + h * 36e5)); };
    var cl = function (s) { return toDate(s) <= now ? s : localISO(new Date(now.getTime() - 25 * 60000)); };
    var g = function (at, phase, o2, lie, h2s, co, par, point) { return { at: cl(at), phase: phase, o2: o2, lie: lie, h2s: h2s, co: co, par: par, point: point || 'Zone de travail' }; };
    var all = function (type, extra) { var o = {}; (REQ[type] || []).concat(extra || []).forEach(function (k) { o[k] = true; }); return o; };
    var epi = function (type, extra) { return EPI_BASE.concat(EPI_TYPE[type] || []).concat(extra || []); };

    function build(o) {
      var p = Object.assign({ gaz: [], associes: [], prolong: [], secu: {}, dangers: [], epi: [], intervenants: 3, sig: {}, hist: [], surveillant: '' }, o);
      var dem = E.empName(p.demandeur), emi = E.empName(p.emetteur), res = E.empName(p.responsable);
      var idx = FLOW.indexOf(p.statut === 'Suspendu' ? 'En cours' : p.statut);
      var t0 = cl(o.cree || shift(p.debut, -20));
      p.cree = t0; p.sig.demandeur = { nom: dem, at: t0 };
      p.hist = [{ at: t0, statut: 'Demandé', par: dem, note: 'Demande de permis créée' }];
      if (idx >= 1) { var tp = cl(o.tPrep || shift(p.debut, -14)); p.hist.push({ at: tp, statut: 'Préparé', par: N(18), note: 'Analyse de risques, mesures de sécurité et EPI renseignés' }); }
      if (idx >= 2) { var ta = cl(shift(p.debut, -0.75)); p.sig.emetteur = { nom: emi, at: ta }; p.sig.responsable = { nom: res, at: cl(shift(ta, 0.1)) }; p.hist.push({ at: ta, statut: 'Autorisé', par: emi, note: 'Autorisé par l\'émetteur et le responsable d\'unité' }); }
      if (idx >= 3) { p.sig.executant = { nom: p.executant, at: p.debut }; p.hist.push({ at: p.debut, statut: 'En cours', par: emi, note: 'Ouverture sur le terrain avec l\'exécutant — visite des lieux réalisée' }); }
      if (p.statut === 'Suspendu') p.hist.push({ at: p.suspension.at, statut: 'Suspendu', par: p.suspension.par, note: p.suspension.motif + ' — ' + p.suspension.note });
      if (p.statut === 'Clôturé') {
        var tc = shift(p.fin, -0.5);
        p.cloture = { at: tc, par: emi, retour: RETOUR.map(function (r) { return r[0]; }), obs: o.obsCloture || 'Zone restituée propre, aucune anomalie.' };
        p.sig.cloture = { nom: emi, at: tc };
        p.hist.push({ at: tc, statut: 'Clôturé', par: emi, note: 'Retour d\'état : travaux terminés, zone propre' });
      }
      return p;
    }
    var EIS = 'Obame Nzé Rufin (chef d\'équipe EIS)';
    var permis = [
      build({ id: 'PT-2026-0405', type: 'FEU', statut: 'En cours', unite: 'U100', equipement: 'Colonne C-101 · trou d\'homme plateau 3', ot: 'OT-2026-0861', entreprise: 'F-001', intervenants: 4,
        description: 'Soudure de 6 clapets de plateaux neufs à l\'intérieur de la colonne de distillation (cumul avec l\'espace confiné PT-2026-0406).',
        demandeur: M(12), emetteur: M(36), responsable: M(9), surveillant: M(19), executant: EIS, debut: HB(-2), fin: HB(8),
        dangers: ['atex', 'hc', 'anoxie', 'brulure', 'h2s', 'coactivite'], mesuresRisques: 'Colonne isolée par joints pleins, vaporisée puis ventilée 48 h. Mesures de gaz en continu au trou d\'homme, veilleur à l\'extérieur, extraction des fumées de soudage.',
        secu: all('FEU', ['consignation', 'degazage', 'ari', 'radio', 'sauvetage']), epi: epi('FEU', ['ari']), associes: ['PT-2026-0406'],
        gaz: [g(HB(-3), 'Préparation', 20.9, 0, 0, 2, N(19), 'Trou d\'homme plateau 3'), g(HB(-2), 'Ouverture', 20.8, 0, 0, 1, N(19), 'Trou d\'homme plateau 3'), g(HB(0), 'Contrôle', 20.9, 0, 0, 3, N(19), 'Intérieur colonne, plateau 3')] }),
      build({ id: 'PT-2026-0406', type: 'ESP', statut: 'En cours', unite: 'U100', equipement: 'Colonne C-101 · plateaux 1 à 5', ot: 'OT-2026-0861', entreprise: 'F-001', intervenants: 4,
        description: 'Pénétration dans la colonne pour remplacement des clapets et nettoyage des plateaux 1 à 5.',
        demandeur: M(12), emetteur: M(36), responsable: M(9), surveillant: M(19), executant: EIS, debut: HB(-3), fin: HB(7),
        dangers: ['anoxie', 'h2s', 'atex', 'chute', 'chaleur'], mesuresRisques: 'Ventilation forcée, contrôle atmosphère avant chaque entrée, veilleur permanent au trou d\'homme, trépied et treuil de sauvetage, registre des entrées / sorties.',
        secu: all('ESP', ['balisage']), epi: epi('ESP'), associes: ['PT-2026-0405'],
        gaz: [g(HB(-4), 'Préparation', 20.7, 0, 0, 4, N(19), 'Trou d\'homme bas'), g(HB(-3), 'Ouverture', 20.8, 0, 0, 2, N(19), 'Trou d\'homme bas'), g(HB(-1), 'Contrôle', 20.9, 0, 0, 2, N(19), 'Plateau 2')] }),
      build({ id: 'PT-2026-0408', type: 'LEV', statut: 'En cours', unite: 'U700', equipement: 'Appontement · bras de chargement n°2', ot: 'OT-2026-0869', entreprise: 'F-006', intervenants: 5,
        description: 'Dépose du bras de chargement n°2 à la grue mobile 80 t pour révision du joint tournant.',
        demandeur: M(12), emetteur: M(5), responsable: M(22), executant: 'Nziengui Arsène (chef de manœuvre Mandji Transports)', debut: HB(-1), fin: HB(6),
        dangers: ['charge', 'objets', 'coactivite', 'hc'], mesuresRisques: 'Plan de levage n° PL-2026-044 validé, zone d\'évolution balisée, chargement navire suspendu pendant la manœuvre, vent < 40 km/h.',
        secu: all('LEV'), epi: epi('LEV') }),
      build({ id: 'PT-2026-0409', type: 'H2S', statut: 'En cours', unite: 'U200', equipement: 'Ligne gaz acide 4" · vanne V-214', ot: 'OT-2026-0858', entreprise: 'INT', intervenants: 3,
        description: 'Remplacement de la vanne V-214 sur la ligne de gaz acide vers la torche — intervention sous ARI.',
        demandeur: M(12), emetteur: M(36), responsable: M(9), surveillant: M(18), executant: N(17), debut: HB(-1), fin: HB(5),
        dangers: ['h2s', 'atex', 'energie', 'hc'], mesuresRisques: 'Ligne dépressurisée et balayée à l\'azote, joints pleins amont/aval, intervention sous ARI, binôme obligatoire, sens du vent vérifié (manche à air).',
        secu: all('H2S'), epi: epi('H2S'),
        gaz: [g(HB(-2), 'Préparation', 20.9, 0, 3.5, 0, N(18), 'Bride amont V-214'), g(HB(-1), 'Ouverture', 20.9, 0, 2, 0, N(18), 'Bride amont V-214')] }),
      build({ id: 'PT-2026-0410', type: 'GEN', statut: 'En cours', unite: 'U800', equipement: 'Chaudière B-801 · pompe alimentaire P-803B', ot: 'OT-2026-0866', entreprise: 'INT', intervenants: 2,
        description: 'Remplacement de la garniture mécanique de la pompe alimentaire P-803B (secours en service).',
        demandeur: M(12), emetteur: M(5), responsable: M(35), executant: N(14), debut: HB(-3), fin: HB(5),
        dangers: ['energie', 'brulure', 'bruit'], mesuresRisques: 'Pompe consignée électriquement (cadenas LOTO), vannes aspiration / refoulement fermées et purgées, ligne refroidie.',
        secu: all('GEN', ['consignation']), epi: epi('GEN', ['auditif']) }),
      build({ id: 'PT-2026-0403', type: 'HAU', statut: 'Suspendu', unite: 'U600', equipement: 'Bac T-07 · robe et toit flottant', ot: 'OT-2026-0849', entreprise: 'F-008', intervenants: 6,
        description: 'Montage d\'échafaudage périphérique et reprise du calorifuge sur la robe du bac T-07.',
        demandeur: M(12), emetteur: M(36), responsable: M(22), executant: 'Moukagni Didier (chef de chantier Delta Scaffolding)', debut: HB(-4), fin: HB(6),
        dangers: ['chute', 'objets', 'chaleur'], mesuresRisques: 'Échafaudage réceptionné, harnais double longe, plinthes et filets, arrêt si vent > 50 km/h ou orage.',
        secu: all('HAU', ['radio']), epi: epi('HAU'),
        suspension: { at: cl(HB(-1)), par: N(36), motif: 'Alerte météo (orage, vent)', note: 'Orage annoncé par la salle de contrôle — personnel redescendu, échafaudage sécurisé.' } }),
      build({ id: 'PT-2026-0404', type: 'RAD', statut: 'Autorisé', unite: 'U500', equipement: 'Sphère GPL S-502 · soudures de piquages', ot: 'OT-2026-0855', entreprise: 'F-001', intervenants: 2,
        description: 'Contrôle radiographique (gammagraphie Ir-192) de 8 soudures de piquages — périmètre de sécurité 30 m, hors présence du personnel.',
        demandeur: M(16), emetteur: M(36), responsable: M(9), executant: 'Ndong Martial (opérateur CND, EIS)', debut: HB(3), fin: HB(9),
        dangers: ['rayon', 'atex', 'coactivite'], mesuresRisques: 'Tir de nuit, balisage et feux à éclats, annonce radio générale, dosimètres opérationnels, PCR présente.',
        secu: all('RAD'), epi: epi('RAD'), tPrep: HB(-5) }),
      build({ id: 'PT-2026-0411', type: 'LOTO', statut: 'Autorisé', unite: 'U600', equipement: 'Pompe de transfert P-612A · ligne gasoil bac T-12', ot: 'OT-2026-0877', entreprise: 'INT', intervenants: 2,
        description: 'Consignation électrique (départ MCC-6, cellule 12) et mécanique de la pompe P-612A, isolement de la ligne de gasoil par joints pleins pour travaux au bac T-12.',
        demandeur: M(12), emetteur: M(5), responsable: M(22), executant: N(15), debut: dayAt(1, 6), fin: dayAt(1, 18),
        dangers: ['elec', 'energie', 'hc'], mesuresRisques: 'Consignation en 4 étapes (séparation, condamnation, identification, VAT), cadenas personnels, joints pleins repérés.',
        secu: all('LOTO', ['isolement']), epi: epi('LOTO'), tPrep: HB(-6) }),
      build({ id: 'PT-2026-0412', type: 'FEU', statut: 'Préparé', unite: 'U600', equipement: 'Bac T-12 · ligne de gasoil 8" en pied de bac', ot: 'OT-2026-0877', entreprise: 'F-001', intervenants: 3,
        description: 'Soudure d\'un piquage DN50 et reprise de corrosion sur la ligne de gasoil en pied du bac T-12.',
        demandeur: M(12), emetteur: M(36), responsable: M(22), surveillant: M(19), executant: EIS, debut: dayAt(1, 7), fin: dayAt(1, 17),
        dangers: ['atex', 'hc', 'brulure', 'coactivite'], mesuresRisques: 'Ligne vidangée, inertée à l\'azote et isolée (consignation PT-2026-0411). Caniveaux obturés, bâches ignifugées, surveillant feu avec extincteur 50 kg.',
        secu: all('FEU', ['consignation', 'radio']), epi: epi('FEU'), associes: ['PT-2026-0411'], tPrep: HB(-1),
        gaz: [g(HB(-1), 'Préparation', 20.9, 0, 0, 0, N(19), 'Pied de bac T-12, point de soudure')] }),
      build({ id: 'PT-2026-0415', type: 'FEU', statut: 'Préparé', unite: 'U100', equipement: 'Four F-101 · passerelle niveau +12 m', ot: 'OT-2026-0871', entreprise: 'F-001', intervenants: 2,
        description: 'Découpe à la meuleuse et remplacement de caillebotis corrodés sur la passerelle du four F-101.',
        demandeur: M(16), emetteur: M(5), responsable: M(9), surveillant: M(19), executant: EIS, debut: dayAt(1, 8), fin: dayAt(1, 16),
        dangers: ['atex', 'hc', 'chute', 'objets', 'brulure'], mesuresRisques: 'Bâches ignifugées sous la zone, balisage au sol, harnais, surveillant feu. Mesure LIE à refaire après remise en état de la bride fuyarde.',
        secu: all('FEU', ['harnais']), epi: epi('FEU', ['harnais']), tPrep: HB(-2),
        gaz: [g(HB(-1), 'Préparation', 20.9, 3, 0, 0, N(18), 'Bride fuel gas sous passerelle')] }),
      build({ id: 'PT-2026-0413', type: 'GEN', statut: 'Préparé', unite: 'U500', equipement: 'Poste de chargement GPL camions · bras n°3', ot: 'OT-2026-0874', entreprise: 'INT', intervenants: 2,
        description: 'Remplacement du flexible de chargement n°3 et test d\'étanchéité à l\'azote.',
        demandeur: M(22), emetteur: M(5), responsable: M(22), executant: N(14), debut: dayAt(1, 8), fin: dayAt(1, 16),
        dangers: ['atex', 'hc', 'energie'], mesuresRisques: 'Bras dépressurisé et inerté, outillage antidéflagrant, poste de chargement arrêté.',
        secu: all('GEN', ['consignation', 'purge']), epi: epi('GEN'), tPrep: HB(-3) }),
      build({ id: 'PT-2026-0416', type: 'ESP', statut: 'Demandé', unite: 'U200', equipement: 'Ballon séparateur D-203', ot: 'OT-2026-0880', entreprise: 'INT', intervenants: 3,
        description: 'Inspection interne du ballon D-203 : mesures d\'épaisseur, contrôle corrosion et état des internes.',
        demandeur: M(16), emetteur: M(36), responsable: M(9), debut: dayAt(2, 7), fin: dayAt(2, 17), cree: HB(-3) }),
      build({ id: 'PT-2026-0417', type: 'FEU', statut: 'Demandé', unite: 'U300', equipement: 'Échangeur E-305 · supports de tuyauterie', ot: 'OT-2026-0882', entreprise: 'F-001', intervenants: 2,
        description: 'Soudure de reprise sur deux supports de tuyauterie fissurés en sortie de l\'échangeur E-305.',
        demandeur: M(12), emetteur: M(5), responsable: M(9), debut: dayAt(1, 13), fin: dayAt(1, 19), cree: HB(-2) }),
      build({ id: 'PT-2026-0418', type: 'HAU', statut: 'Demandé', unite: 'U400', equipement: 'Colonne C-401 · plateforme +28 m', ot: 'OT-2026-0884', entreprise: 'INT', intervenants: 3,
        description: 'Remplacement de la soupape PSV-402 en tête de colonne (+28 m) — levage par palan.',
        demandeur: M(13), emetteur: M(5), responsable: M(9), debut: dayAt(2, 7), fin: dayAt(2, 15), cree: HB(-1) }),
      build({ id: 'PT-2026-0398', type: 'FOU', statut: 'Clôturé', unite: 'U800', equipement: 'Réseau eau incendie · regard R-14', ot: 'OT-2026-0832', entreprise: 'F-001', intervenants: 4,
        description: 'Fouille pour réparation d\'une fuite sur le réseau d\'eau incendie DN150.', demandeur: M(12), emetteur: M(5), responsable: M(35), executant: EIS, debut: dayAt(-5, 7), fin: dayAt(-5, 16),
        dangers: ['ensev', 'energie', 'coactivite'], mesuresRisques: 'Plans des réseaux consultés, détection de câbles, talutage à 45°, barrières.', secu: all('FOU'), epi: epi('FOU') }),
      build({ id: 'PT-2026-0399', type: 'FEU', statut: 'Clôturé', unite: 'U600', equipement: 'Bac T-12 · robe virole 1', ot: 'OT-2026-0829', entreprise: 'F-001', intervenants: 3,
        description: 'Soudure de tôles de renfort sur la virole 1 du bac T-12 (suite au suintement constaté).', demandeur: M(12), emetteur: M(36), responsable: M(22), surveillant: M(19), executant: EIS, debut: dayAt(-4, 7), fin: dayAt(-4, 17),
        dangers: ['atex', 'hc', 'brulure'], mesuresRisques: 'Bac vidangé, dégazé et nettoyé, certificat de dégazage, surveillant feu.', secu: all('FEU', ['degazage']), epi: epi('FEU'),
        gaz: [g(dayAt(-4, 6, 30), 'Préparation', 20.9, 0, 0, 0, N(19)), g(dayAt(-4, 7), 'Ouverture', 20.9, 0, 0, 0, N(19)), g(dayAt(-4, 12), 'Contrôle', 20.9, 0, 0, 1, N(19))] }),
      build({ id: 'PT-2026-0400', type: 'LOTO', statut: 'Clôturé', unite: 'U800', equipement: 'Sous-station SS-2 · cellule HT 5,5 kV', ot: 'OT-2026-0837', entreprise: 'F-004', intervenants: 2,
        description: 'Consignation de la cellule HT n°4 pour remplacement du disjoncteur.', demandeur: M(15), emetteur: M(5), responsable: M(35), executant: 'Mbadinga Serge (électricien habilité H2V, Gabon Électro-Tech)', debut: dayAt(-3, 6), fin: dayAt(-3, 15),
        dangers: ['elec', 'energie'], mesuresRisques: 'Consignation par chargé de consignation habilité, VAT, mise à la terre et en court-circuit.', secu: all('LOTO'), epi: epi('LOTO') }),
      build({ id: 'PT-2026-0401', type: 'GEN', statut: 'Clôturé', unite: 'U900', equipement: 'Laboratoire · sorbonne n°3', ot: 'OT-2026-0826', entreprise: 'INT', intervenants: 1,
        description: 'Remplacement du moteur du ventilateur d\'extraction de la sorbonne n°3.', demandeur: M(10), emetteur: M(18), responsable: M(10), executant: N(15), debut: dayAt(-6, 8), fin: dayAt(-6, 12),
        dangers: ['elec', 'chimique'], mesuresRisques: 'Sorbonne vidée des produits, alimentation consignée.', secu: all('GEN', ['consignation']), epi: epi('GEN') }),
      build({ id: 'PT-2026-0402', type: 'LEV', statut: 'Clôturé', unite: 'U300', equipement: 'Réacteur R-301 · couvercle', ot: 'OT-2026-0821', entreprise: 'F-006', intervenants: 5,
        description: 'Levage du couvercle du réacteur R-301 pour chargement du catalyseur neuf.', demandeur: M(31), emetteur: M(36), responsable: M(9), executant: 'Nziengui Arsène (chef de manœuvre Mandji Transports)', debut: dayAt(-7, 7), fin: dayAt(-7, 18),
        dangers: ['charge', 'objets', 'chute'], mesuresRisques: 'Plan de levage PL-2026-039, grue 80 t, balisage, élingues contrôlées.', secu: all('LEV'), epi: epi('LEV') })
    ];

    var plans = [
      { id: 'PDP-2026-031', entreprise: 'F-008', travaux: 'Montage / démontage d\'échafaudages et reprise de calorifuge — arrêt partiel distillation', chantier: 'Arrêt partiel U100', zones: ['U100', 'U600'], debut: D(-40), fin: D(12), effectif: 18, respEE: 'Didier Moukagni (chef de chantier)', respSOG: M(12), statut: 'Actif',
        inspection: { date: D(-43), participants: [N(4) + ' (HSE)', N(12) + ' (Maintenance)', N(5) + ' (Exploitation)', 'Didier Moukagni (Delta Scaffolding)'], obs: 'Accès chantier par la porte n°3. Aire de stockage des tubes définie au nord de U600. Vestiaires dans la base vie EE.' },
        interferences: [{ risque: 'Chute d\'objets sur le personnel d\'exploitation', mesure: 'Balisage au sol, plinthes et filets sur les échafaudages', charge: 'EE' }, { risque: 'Travaux par point chaud à proximité', mesure: 'Réunion de coordination quotidienne à 7h00 avec l\'émetteur des permis', charge: 'SOGARA' }, { risque: 'Circulation d\'engins dans l\'unité', mesure: 'Plan de circulation, homme trafic lors des livraisons', charge: 'EE' }],
        habilitations: [{ l: 'Monteurs d\'échafaudage formés et certifiés', ok: true }, { l: 'Attestation travail en hauteur', ok: true }, { l: 'Aptitude médicale à jour', ok: true }, { l: 'Sensibilisation H₂S / port de l\'ARI', ok: true }],
        accueil: { date: D(-39), personnes: 18 }, sig: { sogara: { nom: N(4), at: D(-42) }, ee: { nom: 'Didier Moukagni', at: D(-42) } } },
      { id: 'PDP-2026-029', entreprise: 'F-001', travaux: 'Réhabilitation du bac T-12 : renforts de robe, piquages et peinture', chantier: 'Parc de stockage — fiabilisation des bacs', zones: ['U600'], debut: D(-55), fin: D(5), effectif: 9, respEE: 'Rufin Obame Nzé (conducteur de travaux)', respSOG: M(12), statut: 'Actif',
        inspection: { date: D(-58), participants: [N(18) + ' (HSE)', N(12) + ' (Maintenance)', N(22) + ' (Expéditions)', 'Rufin Obame Nzé (EIS)'], obs: 'Bac T-12 hors exploitation pendant toute la durée du chantier. Rétention à maintenir propre.' },
        interferences: [{ risque: 'Mouvements de produits sur les bacs voisins T-11 / T-13', mesure: 'Information préalable du parc avant toute opération de transfert', charge: 'SOGARA' }, { risque: 'Point chaud en zone ATEX', mesure: 'Permis de feu systématique, mesures LIE avant chaque reprise', charge: 'EE' }],
        habilitations: [{ l: 'Soudeurs qualifiés (QMOS / QS)', ok: true }, { l: 'Aptitude médicale à jour', ok: true }, { l: 'Formation espace confiné', ok: true }],
        accueil: { date: D(-54), personnes: 9 }, sig: { sogara: { nom: N(4), at: D(-57) }, ee: { nom: 'Rufin Obame Nzé', at: D(-57) } } },
      { id: 'PDP-2026-032', entreprise: 'F-001', travaux: 'Remplacement du faisceau de l\'échangeur E-104 et chaudronnerie associée', chantier: 'Arrêt partiel U100', zones: ['U100'], debut: D(-20), fin: D(35), effectif: 12, respEE: 'Rufin Obame Nzé (conducteur de travaux)', respSOG: M(16), statut: 'Actif',
        inspection: { date: D(-24), participants: [N(4) + ' (HSE)', N(16) + ' (Inspection)', N(36) + ' (Exploitation)', 'Rufin Obame Nzé (EIS)'], obs: 'Extraction du faisceau à la grue : coordination avec Mandji Transports (PDP-2026-035).' },
        interferences: [{ risque: 'Coactivité avec le chantier échafaudage (Delta)', mesure: 'Planning commun hebdomadaire, zones de travail séparées', charge: 'SOGARA' }, { risque: 'Résidus hydrocarbures dans le faisceau', mesure: 'Nettoyage haute pression sur aire étanche dédiée', charge: 'EE' }],
        habilitations: [{ l: 'Soudeurs qualifiés', ok: true }, { l: 'Élingueurs habilités', ok: true }, { l: 'Aptitude médicale à jour', ok: true }],
        accueil: { date: D(-19), personnes: 12 }, sig: { sogara: { nom: N(4), at: D(-23) }, ee: { nom: 'Rufin Obame Nzé', at: D(-23) } } },
      { id: 'PDP-2026-034', entreprise: 'F-004', travaux: 'Modernisation de la sous-station électrique SS-2 : nouveaux tableaux HT/BT', chantier: 'Programme de modernisation — fiabilité électrique', zones: ['U800'], debut: D(5), fin: D(75), effectif: 8, respEE: 'Serge Mbadinga (chargé d\'affaires)', respSOG: M(15), statut: 'Signé',
        inspection: { date: D(-6), participants: [N(4) + ' (HSE)', N(15) + ' (Électricité)', N(35) + ' (Utilités)', 'Serge Mbadinga (Gabon Électro-Tech)'], obs: 'Basculement des départs prévu en 3 phases de nuit. Groupe électrogène de secours à prévoir.' },
        interferences: [{ risque: 'Coupure d\'alimentation des utilités', mesure: 'Procédure de basculement validée par l\'exploitation', charge: 'SOGARA' }, { risque: 'Risque électrique HT', mesure: 'Habilitations H2V / HC, chargé de consignation SOGARA', charge: 'EE' }],
        habilitations: [{ l: 'Habilitations électriques H2V / BR / HC', ok: true }, { l: 'Aptitude médicale à jour', ok: true }, { l: 'Formation incendie (manipulation extincteurs)', ok: true }],
        accueil: { date: '', personnes: 3 }, sig: { sogara: { nom: N(4), at: D(-4) }, ee: { nom: 'Serge Mbadinga', at: D(-4) } } },
      { id: 'PDP-2026-035', entreprise: 'F-006', travaux: 'Levages lourds (grue mobile 80 t) et transport de colis pour l\'arrêt partiel', chantier: 'Arrêt partiel U100', zones: ['U100', 'U700'], debut: D(3), fin: D(40), effectif: 6, respEE: 'Arsène Nziengui (chef de manœuvre)', respSOG: M(12), statut: 'Inspection commune',
        inspection: { date: D(-2), participants: [N(18) + ' (HSE)', N(12) + ' (Maintenance)', 'Arsène Nziengui (Mandji Transports)'], obs: 'Calage de la grue sur plaques de répartition. Vérifier la portance de la dalle près de E-104.' },
        interferences: [{ risque: 'Charges suspendues au-dessus des unités en marche', mesure: 'Plans de levage validés, interdiction de survol des lignes en service', charge: 'EE' }, { risque: 'Circulation de la grue sur le site', mesure: 'Escorte et itinéraire validé par l\'exploitation', charge: 'SOGARA' }],
        habilitations: [{ l: 'CACES grue mobile / autorisation de conduite', ok: true }, { l: 'Élingueurs habilités', ok: true }, { l: 'Rapport de vérification périodique de la grue', ok: false }, { l: 'Aptitude médicale à jour', ok: true }],
        accueil: { date: '', personnes: 0 }, sig: {} },
      { id: 'PDP-2026-036', entreprise: 'F-002', travaux: 'Remplacement de transmetteurs de pression et migration de boucles vers le nouveau DCS', chantier: 'Programme de modernisation — contrôle-commande', zones: ['U200', 'U300'], debut: D(14), fin: D(90), effectif: 5, respEE: 'Hugues Mavoungou (ingénieur instrumentation)', respSOG: M(13), statut: 'Brouillon',
        inspection: { date: '', participants: [], obs: '' }, interferences: [{ risque: 'Mise hors service de boucles de sécurité', mesure: 'Gestion des by-pass (registre des inhibitions)', charge: 'SOGARA' }],
        habilitations: [{ l: 'Habilitation électrique BR', ok: false }, { l: 'Formation ATEX niveau 1', ok: false }, { l: 'Aptitude médicale à jour', ok: true }], accueil: { date: '', personnes: 0 }, sig: {} },
      { id: 'PDP-2026-037', entreprise: 'F-008', travaux: 'Échafaudages pour le chantier de la nouvelle unité d\'isomérisation (plateforme préparatoire)', chantier: 'Projet de modernisation de la raffinerie', zones: ['U300', 'U400'], debut: D(10), fin: D(120), effectif: 14, respEE: 'Didier Moukagni (chef de chantier)', respSOG: M(31), statut: 'Inspection commune',
        inspection: { date: D(-1), participants: [N(4) + ' (HSE)', N(31) + ' (Projets)', N(0) + ' (Chef de projet)', 'Didier Moukagni (Delta Scaffolding)'], obs: 'Chantier en limite d\'unités en service : clôture de chantier et accès dédié à créer.' },
        interferences: [{ risque: 'Proximité du reformage en service (ATEX)', mesure: 'Clôture de chantier, détecteurs gaz fixes reportés en salle de contrôle', charge: 'SOGARA' }, { risque: 'Travail en hauteur au-dessus de passages', mesure: 'Balisage, filets, réception des échafaudages par un tiers', charge: 'EE' }],
        habilitations: [{ l: 'Monteurs d\'échafaudage certifiés', ok: true }, { l: 'Attestation travail en hauteur', ok: true }, { l: 'Aptitude médicale à jour', ok: true }],
        accueil: { date: '', personnes: 0 }, sig: {} },
      { id: 'PDP-2026-028', entreprise: 'F-007', travaux: 'Maintenance du réseau de détection gaz / incendie et vérification des extincteurs', chantier: 'Contrat annuel de maintenance sécurité', zones: ['U100', 'U200', 'U300', 'U400', 'U500', 'U600', 'U700', 'U800', 'U900'], debut: D(-100), fin: D(-8), effectif: 4, respEE: 'Lionel Bouanga (technicien sécurité)', respSOG: M(18), statut: 'Actif',
        inspection: { date: D(-104), participants: [N(18) + ' (HSE)', N(19) + ' (Sécurité incendie)', 'Lionel Bouanga (Sécurité Pro Gabon)'], obs: 'Intervention par zone, information systématique de la salle de contrôle avant inhibition d\'un détecteur.' },
        interferences: [{ risque: 'Inhibition de détecteurs gaz', mesure: 'Détecteur portatif compensatoire + registre des inhibitions', charge: 'SOGARA' }],
        habilitations: [{ l: 'Formation ATEX', ok: true }, { l: 'Aptitude médicale à jour', ok: true }], accueil: { date: D(-99), personnes: 4 }, sig: { sogara: { nom: N(4), at: D(-103) }, ee: { nom: 'Lionel Bouanga', at: D(-103) } } }
    ];

    function ev(o) {
      var d = D(o.off);
      return Object.assign({ id: 'EV-' + d.slice(0, 4) + '-' + String(o.n).padStart(3, '0'), date: d, heure: o.h || '10:30', joursArret: 0, victime: '', causes: null, mesuresImm: '' }, o, { off: undefined, n: undefined });
    }
    var incidents = [
      ev({ n: 41, off: -352, type: 'ASA', gravite: 2, unite: 'U600', lieu: 'Escalier du bac T-04', titre: 'Glissade dans l\'escalier du bac T-04', description: 'Un opérateur a glissé sur des marches souillées d\'hydrocarbures lors d\'une ronde. Contusion au genou, soins à l\'infirmerie, reprise du poste.', victime: M(8), declarant: M(7), statut: 'Clôturé', h: '06:40', mesuresImm: 'Nettoyage des marches, balisage provisoire.' }),
      ev({ n: 44, off: -318, type: 'PA', gravite: 3, unite: 'U500', lieu: 'Sphère S-501 · passerelle +8 m', titre: 'Chute d\'une clé depuis +8 m', description: 'Une clé à molette est tombée depuis la passerelle de la sphère S-501 et a atterri à 2 m d\'un opérateur. La zone n\'était pas balisée.', declarant: M(18), statut: 'Clôturé', h: '14:15', mesuresImm: 'Arrêt des travaux, balisage de la zone.',
        causes: { methode: '5 pourquoi', pourquoi: ['La clé est tombée de la passerelle', 'Elle était posée sur le garde-corps', 'Pas de porte-outils ni de longe d\'outil', 'L\'équipement n\'était pas prévu dans la préparation', 'Le risque de chute d\'objets n\'était pas coché sur le permis'], racine: 'Analyse de risques du permis incomplète (chute d\'objets non identifiée).' } }),
      ev({ n: 46, off: -301, type: 'AAA', gravite: 3, unite: 'U800', lieu: 'Chaudière B-802 · échelle d\'accès', titre: 'Entorse de la cheville en descendant une échelle', description: 'L\'opérateur a manqué un barreau en descendant l\'échelle d\'accès au ballon de la chaudière B-802. Entorse de la cheville droite, 6 jours d\'arrêt.', victime: M(9 + 26), joursArret: 6, declarant: M(5), statut: 'Clôturé', h: '22:10',
        causes: { methode: 'Arbre des causes', facteurs: { 'Main-d\'œuvre': ['Descente face au vide, mains chargées'], 'Matériel': ['Barreau usé et glissant'], 'Milieu': ['Éclairage insuffisant de nuit'], 'Méthode': ['Pas de sac de transport pour l\'outillage'], 'Management': [] } } }),
      ev({ n: 49, off: -270, type: 'FUI', gravite: 2, unite: 'U700', lieu: 'Appontement · bras de chargement n°1', titre: 'Fuite sur bride du bras de chargement n°1', description: 'Fuite de gasoil sur une bride du bras n°1 pendant le chargement du navire. Environ 150 L récupérés dans la rétention, aucun rejet en mer.', declarant: M(34), statut: 'Clôturé', h: '03:25', mesuresImm: 'Arrêt du chargement, fermeture des vannes, absorbants.' }),
      ev({ n: 52, off: -240, type: 'SD', gravite: 3, unite: 'U100', lieu: 'Pompe P-104B', titre: 'Joint plein absent sur une ligne consignée', description: 'Lors d\'une visite terrain, le joint plein prévu au plan d\'isolement n\'était pas posé sur l\'aspiration de P-104B alors que le permis était autorisé.', declarant: M(4), statut: 'Clôturé', h: '09:00' }),
      ev({ n: 55, off: -205, type: 'FEU', gravite: 3, unite: 'U100', lieu: 'Ligne de résidu atmosphérique', titre: 'Départ de feu sur calorifuge imbibé', description: 'Inflammation d\'un calorifuge imbibé de résidu sur une ligne à 320 °C. Feu éteint en 2 minutes à l\'extincteur par l\'opérateur, intervention des pompiers en reconnaissance.', declarant: M(6), statut: 'Clôturé', h: '16:50', mesuresImm: 'Extinction, refroidissement, dépose du calorifuge.',
        causes: { methode: '5 pourquoi', pourquoi: ['Le calorifuge a pris feu', 'Il était imbibé de résidu chaud', 'Une fuite au presse-étoupe de vanne s\'écoulait dessus', 'La fuite était connue mais non traitée', 'Pas de suivi des petites fuites dans le plan de maintenance'], racine: 'Absence de suivi formalisé des fuites mineures.' } }),
      ev({ n: 58, off: -187, type: 'AAA', gravite: 3, unite: 'U300', lieu: 'Réacteur R-302 · bride de sortie', titre: 'Brûlure à la main lors d\'un démontage de bride', description: 'Brûlure du 2e degré à la main gauche lors du démontage d\'une bride encore chaude (environ 90 °C). 12 jours d\'arrêt.', victime: M(17), joursArret: 12, declarant: M(12), statut: 'Clôturé', h: '11:20',
        causes: { methode: 'Arbre des causes', facteurs: { 'Main-d\'œuvre': ['Gants non adaptés (manutention au lieu d\'anti-chaleur)'], 'Méthode': ['Délai de refroidissement non précisé sur le permis'], 'Matériel': ['Pas de thermomètre de contact disponible'], 'Milieu': ['Travail en fin de poste, pression sur le délai'], 'Management': ['Planning d\'arrêt trop serré'] } } }),
      ev({ n: 61, off: -160, type: 'ENV', gravite: 2, unite: 'U700', lieu: 'Crique en aval du séparateur API', titre: 'Irisations dans la crique après forte pluie', description: 'Irisations constatées sur 50 m dans la crique en aval du séparateur API après un épisode de forte pluie. Débordement du séparateur.', declarant: M(18), statut: 'Clôturé', h: '07:30', mesuresImm: 'Pose de barrages flottants et absorbants, prélèvements.' }),
      ev({ n: 64, off: -128, type: 'PA', gravite: 4, unite: 'U200', lieu: 'Purge ballon D-202', titre: 'Détecteur H₂S en alarme (12 ppm) lors d\'une purge', description: 'Le détecteur portatif de l\'opératrice est passé en alarme (12 ppm) lors d\'une purge d\'eau acide. Évacuation immédiate vers le point de rassemblement, sans conséquence.', declarant: M(7), statut: 'Clôturé', h: '05:10',
        causes: { methode: '5 pourquoi', pourquoi: ['Dégagement d\'H₂S à la purge', 'Purge ouverte en grand', 'Procédure de purge non affichée au poste', 'Opératrice récemment affectée à l\'unité', 'Parcours d\'intégration non terminé'], racine: 'Formation au poste incomplète pour les opérations à risque H₂S.' } }),
      ev({ n: 67, off: -96, type: 'ASA', gravite: 2, unite: 'U400', lieu: 'Atelier chaudronnerie', titre: 'Coupure à l\'avant-bras en manutention de tôles', description: 'Coupure superficielle lors de la manutention d\'une tôle sans manchettes. Soins à l\'infirmerie.', victime: M(37), declarant: M(12), statut: 'Clôturé', h: '10:05' }),
      ev({ n: 70, off: -70, type: 'SD', gravite: 3, unite: 'U600', lieu: 'Bac T-09', titre: 'Échafaudage non réceptionné utilisé', description: 'Une équipe d\'entreprise extérieure (Delta Scaffolding) travaillait sur un échafaudage portant une étiquette rouge (non réceptionné).', declarant: M(18), statut: 'Actions en cours', h: '13:40', mesuresImm: 'Arrêt immédiat, descente de l\'équipe, rappel au chef de chantier.' }),
      ev({ n: 73, off: -44, type: 'FUI', gravite: 3, unite: 'U600', lieu: 'Bac T-12 · robe virole 1', titre: 'Suintement de gasoil sur la robe du bac T-12', description: 'Suintement détecté lors d\'une ronde sur la virole 1 du bac T-12. Mise en surveillance, vidange partielle puis totale du bac.', declarant: M(8), statut: 'Actions en cours', h: '08:15', mesuresImm: 'Balisage, absorbants, transfert du produit vers T-11.',
        causes: { methode: '5 pourquoi', pourquoi: ['Fuite par la robe', 'Corrosion localisée sous calorifuge', 'Eau piégée sous le calorifuge dégradé', 'Inspection sous calorifuge non programmée depuis 2019', 'Plan d\'inspection basé sur le temps et non sur le risque'], racine: 'Plan d\'inspection des bacs à revoir (approche RBI).' } }),
      ev({ n: 76, off: -21, type: 'ASA', gravite: 1, unite: 'U700', lieu: 'Appontement · poste 2', titre: 'Pincement de doigt lors du raccordement d\'un flexible', description: 'Pincement de l\'index lors du raccordement d\'un flexible au manifold du navire. Soins sur place.', victime: M(34), declarant: M(22), statut: 'Actions en cours', h: '19:30' }),
      ev({ n: 79, off: -9, type: 'PA', gravite: 4, unite: 'U100', lieu: 'Échangeur E-104', titre: 'Charge suspendue au-dessus d\'une équipe', description: 'Lors d\'un levage, la charge (faisceau de 4 t) est passée au-dessus d\'une équipe de calorifugeurs non informée.', declarant: M(18), statut: 'En analyse', h: '15:05', mesuresImm: 'Arrêt du levage, briefing des équipes, révision du plan de levage.',
        causes: { methode: 'Arbre des causes', facteurs: { 'Méthode': ['Zone d\'évolution de la charge non balisée'], 'Management': ['Pas de coordination entre deux entreprises extérieures'], 'Main-d\'œuvre': ['Chef de manœuvre sans visibilité directe'], 'Matériel': [], 'Milieu': ['Coactivité forte pendant l\'arrêt'] } } }),
      ev({ n: 82, off: -3, type: 'ENV', gravite: 2, unite: 'U800', lieu: 'Bassin de rétention des eaux pluviales', titre: 'Débordement du bassin vers la mangrove Est', description: 'Débordement ponctuel du bassin de rétention des eaux pluviales vers la mangrove Est après 85 mm de pluie en 3 h. Prélèvements réalisés.', declarant: M(35), statut: 'En analyse', h: '04:50', mesuresImm: 'Barrage flottant à l\'exutoire, prélèvements eau et sédiments.' }),
      ev({ n: 85, off: -1, type: 'SD', gravite: 2, unite: 'U500', lieu: 'Poste de chargement GPL n°3', titre: 'Extincteur manquant au poste de chargement GPL', description: 'L\'extincteur à poudre 50 kg du poste n°3 est absent (envoyé en recharge sans remplacement).', declarant: M(19), statut: 'Déclaré', h: '08:20' })
    ];
    var A = function (n, src, lib, resp, ech, st, prio) { return { id: 'ACT-2026-' + String(n).padStart(3, '0'), source: src, libelle: lib, responsable: M(resp), echeance: D(ech), statut: st, priorite: prio || 'Moyenne', creee: D(Math.min(ech - 30, -2)) }; };
    var actions = [
      A(112, 'EV-' + D(-70).slice(0, 4) + '-070', 'Rappel « étiquette rouge = accès interdit » à toutes les entreprises (quart d\'heure sécurité)', 18, -50, 'Réalisée', 'Haute'),
      A(113, 'EV-' + D(-70).slice(0, 4) + '-070', 'Audit de la procédure de réception des échafaudages de Delta Scaffolding', 4, -12, 'En cours', 'Haute'),
      A(118, 'EV-' + D(-44).slice(0, 4) + '-073', 'Inspection sous calorifuge de tous les bacs de gasoil (T-10 à T-14)', 16, 20, 'En cours', 'Haute'),
      A(119, 'EV-' + D(-44).slice(0, 4) + '-073', 'Réviser le plan d\'inspection des bacs selon une approche RBI', 16, -5, 'À faire', 'Moyenne'),
      A(120, 'EV-' + D(-44).slice(0, 4) + '-073', 'Réparer la virole 1 du bac T-12 (renforts soudés)', 12, -4, 'Réalisée', 'Haute'),
      A(124, 'EV-' + D(-21).slice(0, 4) + '-076', 'Fournir des outils de raccordement de flexibles (clés à griffes) à l\'appontement', 22, -3, 'À faire', 'Moyenne'),
      A(125, 'EV-' + D(-21).slice(0, 4) + '-076', 'Mettre à jour le mode opératoire de raccordement navire', 22, 15, 'En cours', 'Basse'),
      A(127, 'EV-' + D(-9).slice(0, 4) + '-079', 'Baliser systématiquement la zone d\'évolution des charges (plan de levage type)', 12, 7, 'À faire', 'Haute'),
      A(128, 'EV-' + D(-9).slice(0, 4) + '-079', 'Réunion de coordination quotidienne des entreprises pendant l\'arrêt', 4, -2, 'Réalisée', 'Haute'),
      A(130, 'EV-' + D(-3).slice(0, 4) + '-082', 'Curer le bassin de rétention et vérifier la pompe de relevage', 35, 10, 'À faire', 'Haute'),
      A(131, 'EV-' + D(-1).slice(0, 4) + '-085', 'Remettre en place un extincteur 50 kg au poste GPL n°3', 19, 1, 'À faire', 'Haute'),
      A(105, 'EV-' + D(-128).slice(0, 4) + '-064', 'Afficher les modes opératoires de purge eau acide aux postes', 9, -100, 'Réalisée', 'Haute'),
      A(106, 'EV-' + D(-128).slice(0, 4) + '-064', 'Compléter le parcours d\'intégration H₂S pour les nouveaux opérateurs', 1, -30, 'En cours', 'Moyenne'),
      A(101, 'EV-' + D(-187).slice(0, 4) + '-058', 'Doter les équipes de thermomètres de contact et de gants anti-chaleur', 21, -160, 'Réalisée', 'Haute'),
      A(102, 'EV-' + D(-187).slice(0, 4) + '-058', 'Ajouter le délai de refroidissement dans le modèle de permis', 4, -170, 'Réalisée', 'Moyenne'),
      A(108, 'AUD-2026-014', 'Remplacer 6 extincteurs périmés zone U600', 19, -18, 'En cours', 'Moyenne'),
      A(109, 'AUD-2026-016', 'Repeindre le marquage des voies piétonnes U100', 12, 25, 'À faire', 'Basse'),
      A(110, 'AUD-2026-017', 'Exiger le registre de vérification des élingues de Mandji Transports', 21, -6, 'À faire', 'Moyenne'),
      A(114, 'AUD-2026-018', 'Former 4 nouveaux émetteurs de permis (chefs de quart adjoints)', 18, 30, 'En cours', 'Moyenne'),
      A(116, 'AUD-2026-019', 'Réparer l\'éclairage de l\'escalier de la colonne C-101', 15, 4, 'À faire', 'Moyenne')
    ];
    var Au = function (n, off, type, unite, entreprise, aud, theme, statut, score, ecarts, constats) { return { id: 'AUD-2026-' + String(n).padStart(3, '0'), date: D(off), type: type, unite: unite, entreprise: entreprise || '', auditeur: M(aud), theme: theme, statut: statut, score: score, ecarts: ecarts, constats: constats || [] }; };
    var audits = [
      Au(11, -80, 'Visite terrain', 'U500', '', 4, 'Visite managériale — zone GPL', 'Réalisé', 88, 2, [{ txt: 'Deux flexibles de chargement sans date de contrôle', niv: 'Mineur' }, { txt: 'Bonne tenue générale de la zone', niv: 'Observation' }]),
      Au(12, -66, 'Audit entreprise extérieure', 'U600', 'F-008', 18, 'Échafaudages : réception, étiquetage, port du harnais', 'Réalisé', 71, 4, [{ txt: 'Échafaudage utilisé sans réception (étiquette rouge)', niv: 'Majeur' }, { txt: 'Registre de réception incomplet', niv: 'Mineur' }, { txt: 'Harnais sans date de contrôle', niv: 'Mineur' }, { txt: 'Plinthes manquantes niveau 3', niv: 'Mineur' }]),
      Au(13, -52, 'Quart d\'heure sécurité', 'U100', '', 18, 'Risque H₂S et port du détecteur 4 gaz', 'Réalisé', 95, 0, [{ txt: '22 participants, quiz de fin de session réussi', niv: 'Observation' }]),
      Au(14, -40, 'Visite terrain', 'U600', '', 19, 'Moyens de lutte incendie du parc de stockage', 'Réalisé', 79, 3, [{ txt: '6 extincteurs à date de vérification dépassée', niv: 'Mineur' }, { txt: 'Couronne de refroidissement T-09 partiellement obstruée', niv: 'Majeur' }, { txt: 'Accès au poteau incendie PI-12 encombré', niv: 'Mineur' }]),
      Au(15, -31, 'Audit permis de travail', 'U100', '', 4, 'Conformité des permis affichés sur le terrain (12 permis contrôlés)', 'Réalisé', 84, 2, [{ txt: '1 permis non affiché au poste de travail', niv: 'Mineur' }, { txt: '1 mesure de gaz de contrôle non tracée', niv: 'Mineur' }]),
      Au(16, -24, 'Visite terrain', 'U100', '', 9, 'Tenue des unités pendant l\'arrêt partiel', 'Réalisé', 82, 2, [{ txt: 'Marquage des voies piétonnes effacé', niv: 'Mineur' }, { txt: 'Stockage de bouteilles de gaz non arrimées', niv: 'Mineur' }]),
      Au(17, -16, 'Audit entreprise extérieure', 'U700', 'F-006', 18, 'Levage : plans de levage, élingues, habilitations', 'Réalisé', 76, 3, [{ txt: 'Registre de vérification des élingues non disponible', niv: 'Majeur' }, { txt: 'Plan de levage non signé par le chef de manœuvre', niv: 'Mineur' }, { txt: 'Bon balisage de la zone', niv: 'Observation' }]),
      Au(18, -10, 'Audit permis de travail', 'U600', '', 4, 'Processus d\'émission : compétences des émetteurs', 'Réalisé', 87, 1, [{ txt: 'Manque d\'émetteurs habilités en quart de nuit', niv: 'Mineur' }]),
      Au(19, -6, 'Visite terrain', 'U100', '', 0, 'Visite de la direction — chantier d\'arrêt', 'Réalisé', 90, 1, [{ txt: 'Éclairage de l\'escalier C-101 défaillant', niv: 'Mineur' }]),
      Au(20, -2, 'Quart d\'heure sécurité', 'U700', '', 18, 'Raccordement des flexibles navire — retour d\'expérience', 'Réalisé', 92, 0, []),
      Au(21, 4, 'Audit entreprise extérieure', 'U100', 'F-001', 4, 'Chaudronnerie : soudage, permis de feu, rangement', 'Planifié', null, null, []),
      Au(22, 9, 'Exercice POI', 'U500', '', 19, 'Exercice POI : fuite enflammée sur sphère GPL S-501', 'Planifié', null, null, []),
      Au(23, 15, 'Visite terrain', 'U800', '', 4, 'Visite managériale — utilités et sous-station SS-2', 'Planifié', null, null, [])
    ];
    /* Statistiques mensuelles (heures travaillées, cartes d'observation, quarts d'heure sécurité) */
    var mois = [];
    var ee = [21000, 19500, 18800, 22000, 24500, 31000, 26500, 20500, 19800, 23500, 33000, 36500], obs = [18, 21, 15, 19, 24, 27, 22, 20, 17, 23, 29, 31], qhs = [22, 21, 18, 22, 22, 23, 22, 21, 20, 22, 22, 22], pm = [68, 72, 61, 70, 78, 96, 84, 71, 66, 79, 104, 112];
    for (var i = 11; i >= 0; i--) { var dm = new Date(E.TODAY.getFullYear(), E.TODAY.getMonth() - i, 1); var k = 11 - i; mois.push({ id: dm.getFullYear() + '-' + pad(dm.getMonth() + 1), heures: 61500 + (k % 3) * 900 - (k === 2 ? 2400 : 0), heuresEE: ee[k], observations: obs[k], qhs: qhs[k], permis: pm[k] }); }
    var rejets = mois.map(function (m, k) { var hc = [4.1, 3.8, 4.6, 5.2, 4.4, 12.4, 6.1, 4.9, 4.2, 3.9, 5.6, 7.8][k]; return { id: m.id, hc: hc, dco: [88, 81, 95, 102, 90, 131, 99, 86, 84, 80, 97, 108][k], ph: [7.4, 7.3, 7.6, 7.5, 7.2, 6.9, 7.3, 7.4, 7.5, 7.4, 7.2, 7.1][k], mes: [22, 19, 25, 27, 21, 41, 26, 23, 20, 18, 24, 29][k], volume: [41000, 39500, 44800, 46500, 52000, 61000, 48500, 43000, 40200, 39800, 50500, 58500][k], torchage: [182, 175, 168, 190, 205, 312, 240, 176, 171, 165, 228, 264][k] }; });
    var mangrove = [
      { id: 'MG-1', station: 'Exutoire bassin de rétention (mangrove Est)', date: D(-2), hc: 340, vegetation: 'Stress léger', faune: 'Crabes violonistes présents, densité réduite', statut: 'Surveillance renforcée', obs: 'Prélèvements après débordement du ' + fmt.date(D(-3)) + '. Résultats laboratoire attendus.' },
      { id: 'MG-2', station: 'Crique Est — aval séparateur API', date: D(-12), hc: 180, vegetation: 'Bon', faune: 'Périophtalmes, crabes, aigrettes', statut: 'Conforme', obs: 'Plus d\'irisations visibles depuis la mise en place des barrages permanents.' },
      { id: 'MG-3', station: 'Front de mer — appontement', date: D(-12), hc: 120, vegetation: 'Bon', faune: 'Huîtres de palétuviers', statut: 'Conforme', obs: '' },
      { id: 'MG-4', station: 'Mangrove Sud — transect T1', date: D(-34), hc: 95, vegetation: 'Bon', faune: 'Crabes, oiseaux limicoles', statut: 'Conforme', obs: 'Régénération naturelle des palétuviers (Rhizophora) observée.' },
      { id: 'MG-5', station: 'Mangrove Sud — transect T2', date: D(-34), hc: 140, vegetation: 'Bon', faune: 'Crabes, poissons juvéniles', statut: 'Conforme', obs: '' },
      { id: 'MG-6', station: 'Station témoin (hors influence du site)', date: D(-34), hc: 60, vegetation: 'Bon', faune: 'Référence', statut: 'Référence', obs: 'Station de référence pour comparaison.' }
    ];
    var dch = function (n, off, type, cat, q, fil, prest, st) { return { id: 'BSD-2026-' + String(n).padStart(3, '0'), date: D(off), type: type, categorie: cat, quantite: q, filiere: fil, prestataire: prest, statut: st }; };
    var dechets = [
      dch(88, -3, 'Absorbants et chiffons souillés', 'Dangereux', 1.2, 'Incinération', 'Gabon Recyclage Industriel (démo)', 'En attente d\'enlèvement'),
      dch(87, -9, 'Ferrailles (caillebotis, tuyauteries)', 'Non dangereux', 14.5, 'Recyclage', 'Gabon Recyclage Industriel (démo)', 'Enlevé'),
      dch(86, -15, 'Boues de fond de bac T-12', 'Dangereux', 38, 'Centre de traitement agréé', 'Gabon Recyclage Industriel (démo)', 'Enlevé'),
      dch(85, -21, 'Huiles usagées', 'Dangereux', 6.4, 'Régénération', 'Gabon Recyclage Industriel (démo)', 'Enlevé'),
      dch(84, -33, 'Catalyseur usé (reformage)', 'Dangereux', 22, 'Valorisation matière (régénération)', 'Chimie Catalyse International', 'Enlevé'),
      dch(83, -40, 'Terres polluées (fuite appontement)', 'Dangereux', 9.8, 'Biocentre (traitement biologique)', 'Gabon Recyclage Industriel (démo)', 'Enlevé'),
      dch(82, -48, 'Déchets banals (DIB)', 'Non dangereux', 18.2, 'Enfouissement (CET)', 'Mandji Transports', 'Enlevé'),
      dch(81, -60, 'DEEE (matériel informatique)', 'Dangereux', 0.8, 'Recyclage', 'Gabon Recyclage Industriel (démo)', 'Enlevé'),
      dch(80, -75, 'Bois et palettes', 'Non dangereux', 5.5, 'Valorisation matière', 'Mandji Transports', 'Enlevé'),
      dch(89, 0, 'Calorifuge déposé (laine de roche)', 'Non dangereux', 3.1, 'Enfouissement (CET)', 'Mandji Transports', 'Stocké sur site')
    ];
    return { permis: permis, plansPrevention: plans, incidents: incidents, actionsHSE: actions, audits: audits, hseMois: mois, envRejets: rejets, envMangrove: mangrove, envDechets: dechets };
  }

  function init() {
    /* expiration automatique des plans de prévention */
    S.all('plansPrevention').forEach(function (p) {
      if ((p.statut === 'Actif' || p.statut === 'Signé') && p.fin < E.today()) {
        p.statut = 'Expiré'; p.hist = p.hist || []; p.hist.push({ at: nowISO(), par: 'Système', note: 'Expiration automatique (fin de validité le ' + fmt.date(p.fin) + ')' });
      }
    });
    S.save();
  }

  /* ================================================================== calculs */
  function permis() { return S.all('permis'); }
  function actifs() { return permis().filter(function (p) { return ACTIFS.indexOf(p.statut) >= 0; }); }
  function lastAAA() { var l = S.all('incidents').filter(function (i) { return i.type === 'AAA'; }).sort(function (a, b) { return b.date.localeCompare(a.date); }); return l[0] || null; }
  function joursSans() { var l = lastAAA(); return l ? E.daysBetween(l.date, E.today()) : 400; }
  function lateActions() { return S.all('actionsHSE').filter(actLate); }
  function months12() { var out = []; for (var i = 11; i >= 0; i--) { var d = new Date(E.TODAY.getFullYear(), E.TODAY.getMonth() - i, 1); out.push({ key: d.getFullYear() + '-' + pad(d.getMonth() + 1), l: E.MOIS[d.getMonth()] }); } return out; }
  function rates() {
    var from = months12()[0].key + '-01';
    var inc = S.all('incidents').filter(function (i) { return i.date >= from; });
    var h = E.sum(S.all('hseMois'), function (m) { return m.heures + m.heuresEE; }) || 1;
    var aaa = inc.filter(function (i) { return i.type === 'AAA'; }).length, asa = inc.filter(function (i) { return i.type === 'ASA'; }).length;
    var jp = E.sum(inc, 'joursArret');
    return { inc: inc, h: h, aaa: aaa, asa: asa, jp: jp, tf1: aaa * 1e6 / h, tf2: (aaa + asa) * 1e6 / h, tg: jp * 1e3 / h };
  }
  function pdpDaysLeft(p) { return E.daysBetween(E.today(), p.fin); }
  function pdpExpiring() { return S.all('plansPrevention').filter(function (p) { return p.statut === 'Actif' && pdpDaysLeft(p) <= 15; }); }

  /* ================================================================== rendu principal */
  var state = { permis: { q: '', type: '', st: 'actifs', unite: '' }, zone: '', ev: { q: '', type: '' }, act: { st: 'ouvertes', resp: '' }, pdp: { st: '' }, aud: { type: '' } };

  function render(view, params) {
    var tab = params[0] || 'apercu', id = params[1];
    var tabsList = [
      { k: 'apercu', l: 'Vue d\'ensemble' },
      { k: 'permis', l: 'Permis de travail', n: actifs().length },
      { k: 'prevention', l: 'Plans de prévention', n: S.all('plansPrevention').filter(function (p) { return p.statut === 'Actif'; }).length },
      { k: 'evenements', l: 'Événements', n: S.all('incidents').filter(function (i) { return i.statut !== 'Clôturé'; }).length },
      { k: 'actions', l: 'Actions correctives', n: lateActions().length || null },
      { k: 'indicateurs', l: 'Indicateurs' },
      { k: 'audits', l: 'Visites & audits' },
      { k: 'environnement', l: 'Environnement' }
    ];
    if (!tabsList.some(function (t) { return t.k === tab; })) tab = 'apercu';
    view.innerHTML = '<div class="hse">' +
      '<div class="section-title hse-top"><div><h2>Sécurité du site · Raffinerie de Port-Gentil</h2><p>' + fmt.date(E.today()) + ' · ' + actifs().length + ' permis actifs · ' + joursSans() + ' jours sans accident avec arrêt</p></div><div class="spacer"></div>' +
      '<div class="row hse-top__btns"><button class="btn danger" data-act="declare">' + icon('alert') + 'Déclarer un événement</button><button class="btn primary" data-act="new-permit">' + icon('plus') + 'Nouveau permis</button></div></div>' +
      ui.tabs(tabsList, tab, function (k) { E.go('hse/' + k); }) +
      '<div id="hse-body"></div>' +
      '<button class="hse-fab" data-act="declare" aria-label="Déclarer un événement">' + icon('alert') + '<span>Déclarer</span></button></div>';
    $$('[data-act="declare"]', view).forEach(function (b) { b.onclick = declareEvent; });
    $('[data-act="new-permit"]', view).onclick = function () { newPermit(); };
    var body = $('#hse-body', view);
    if (tab === 'permis' && id) return viewPermis(body, id);
    if (tab === 'prevention' && id) return viewPDP(body, id);
    if (tab === 'evenements' && id) return viewEvent(body, id);
    ({ apercu: tabApercu, permis: tabPermis, prevention: tabPDP, evenements: tabEvents, actions: tabActions, indicateurs: tabIndic, audits: tabAudits, environnement: tabEnv })[tab](body);
  }

  /* ------------------------------------------------------------------ compteur « jours sans accident » */
  function counterCard() {
    var j = joursSans(), l = lastAAA(), record = Math.max(412, j);
    return '<div class="card hse-counter"><div class="hse-counter__n">' + j + '</div><div class="hse-counter__t"><b>jours sans accident avec arrêt</b>' +
      (l ? '<span>Dernier : ' + fmt.date(l.date) + ' · ' + esc(l.titre) + '</span>' : '') +
      '<div class="hse-counter__bar"><i style="width:' + Math.min(100, j / record * 100) + '%"></i></div><span>Record du site : ' + record + ' jours · objectif ' + (record + 1) + '</span></div>' + icon('shield', 'hse-counter__ic') + '</div>';
  }

  /* ------------------------------------------------------------------ plan de zones (SVG) */
  var ZONES = {
    U100: { x: 20, y: 20, w: 220, h: 150, s: 'Distillation' }, U200: { x: 255, y: 20, w: 140, h: 150, s: 'HDT naphta' }, U300: { x: 410, y: 20, w: 140, h: 150, s: 'Reformage' },
    U400: { x: 565, y: 20, w: 120, h: 150, s: 'Kérosène' }, U500: { x: 20, y: 190, w: 190, h: 125, s: 'GPL / butane' }, U800: { x: 225, y: 190, w: 175, h: 125, s: 'Utilités' },
    U900: { x: 415, y: 190, w: 135, h: 125, s: 'Labo & bâtiments' }, U600: { x: 20, y: 335, w: 530, h: 115, s: 'Parc de stockage' }, U700: { x: 565, y: 190, w: 120, h: 260, s: 'Appontement' }
  };
  function zoneMap(list, sel) {
    var by = E.groupBy(list, 'unite');
    var deco = '<g class="dz">' +
      '<rect x="45" y="50" width="18" height="90" rx="8"/><rect x="75" y="68" width="14" height="72" rx="7"/><rect x="120" y="92" width="72" height="48" rx="4"/><rect x="150" y="60" width="6" height="32"/>' +
      '<rect x="280" y="55" width="16" height="80" rx="7"/><circle cx="335" cy="100" r="18"/><rect x="435" y="55" width="16" height="80" rx="7"/><circle cx="480" cy="85" r="14"/><circle cx="515" cy="110" r="14"/>' +
      '<rect x="590" y="60" width="14" height="80" rx="6"/><circle cx="640" cy="100" r="16"/>' +
      '<circle cx="60" cy="245" r="22"/><circle cx="115" cy="245" r="22"/><circle cx="170" cy="245" r="22"/>' +
      '<rect x="250" y="215" width="70" height="45" rx="4"/><rect x="340" y="205" width="10" height="55"/><rect x="455" y="215" width="70" height="40" rx="3"/>' +
      [70, 140, 210, 280, 350, 420, 490].map(function (x) { return '<circle cx="' + x + '" cy="383" r="27"/>'; }).join('') +
      '</g>';
    var sea = '<path d="M705 0 Q715 40 705 80 T705 160 T705 240 T705 320 T705 400 T705 470 L800 470 L800 0Z" class="sea"/>' +
      '<rect x="685" y="300" width="80" height="10" class="jetty"/><path d="M738 318 h50 l-6 46 h-38z" class="ship"/>' +
      '<text x="752" y="40" class="seal" text-anchor="middle">Océan</text><text x="752" y="55" class="seal" text-anchor="middle">Atlantique</text>';
    var zones = Object.keys(ZONES).map(function (u) {
      var z = ZONES[u], ps = by[u] || [], n = ps.length, feu = ps.some(function (p) { return p.type === 'FEU'; }), susp = ps.some(function (p) { return p.statut === 'Suspendu'; });
      var cls = 'zone' + (n ? ' has' : '') + (feu ? ' feu' : '') + (sel === u ? ' sel' : '');
      var cx = z.x + z.w - 22, cy = z.y + 22;
      return '<g class="' + cls + '" data-u="' + u + '"><title>' + esc(u + ' · ' + uName(u) + ' — ' + n + ' permis actif(s)' + (n ? ' : ' + ps.map(function (p) { return p.id + ' (' + TYPES[p.type].s + ')'; }).join(', ') : '')) + '</title>' +
        '<rect x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h + '" rx="12" class="zr"/>' +
        '<text x="' + (z.x + 12) + '" y="' + (z.y + z.h - 28) + '" class="zid">' + u + '</text><text x="' + (z.x + 12) + '" y="' + (z.y + z.h - 11) + '" class="zn">' + esc(z.s) + '</text>' +
        (n ? (feu ? '<circle cx="' + cx + '" cy="' + cy + '" r="16" class="pulse"/>' : '') + '<circle cx="' + cx + '" cy="' + cy + '" r="16" class="pin' + (feu ? ' red' : susp ? ' orange' : '') + '"/><text x="' + cx + '" y="' + (cy + 6) + '" class="pinn" text-anchor="middle">' + n + '</text>' : '') + '</g>';
    }).join('');
    return '<svg class="hse-map" viewBox="0 0 800 470" role="img" aria-label="Plan schématique des unités de la raffinerie">' + '<rect x="0" y="0" width="800" height="470" class="land"/>' + sea + '<path d="M0 180 H700 M0 325 H560 M247 0 V470 M557 0 V470" class="road"/>' + deco + zones +
      '<g transform="translate(740 420)" class="north"><path d="M0 -22 L8 4 L0 -2 L-8 4Z"/><text y="18" text-anchor="middle">N</text></g></svg>';
  }

  function permitItem(p) {
    var t = TYPES[p.type], m = lastGas(p), od = isOverdue(p), now = new Date(), tot = hoursBetween(p.debut, p.fin), el = (now - toDate(p.debut)) / 36e5;
    var pct = Math.max(0, Math.min(100, el / tot * 100)), rest = hoursBetween(localISO(now), p.fin);
    var when = p.statut === 'Autorisé' ? (el < 0 ? 'Ouverture prévue ' + fDT(p.debut) : 'Prêt à ouvrir · fin ' + fH(p.fin)) : od ? '<b class="late">Validité dépassée de ' + dur(-rest) + '</b>' : 'Reste ' + dur(rest) + ' · fin ' + fH(p.fin);
    return '<a class="hse-pi" href="#/hse/permis/' + p.id + '" style="--c:' + t.c + '"><div class="hse-pi__ic">' + icon(t.ic) + '</div><div class="hse-pi__b"><div class="row" style="gap:6px"><b>' + p.id + '</b>' + stBadge(p.statut) + '<span class="small muted">' + esc(t.s) + '</span></div>' +
      '<div class="hse-pi__d">' + esc(p.unite + ' · ' + p.equipement) + '</div><div class="small muted">' + esc(ent(p.entreprise)) + ' · ' + when + '</div>' +
      (p.statut !== 'Autorisé' ? '<div class="progress ' + (od ? 'red' : pct > 80 ? 'orange' : '') + '" style="margin:6px 0 4px"><i style="width:' + pct + '%"></i></div>' : '') +
      (m ? gasPills(m) : '') + '</div></a>';
  }

  /* ------------------------------------------------------------------ onglet Vue d'ensemble */
  function tabApercu(el) {
    var act = actifs(), feu = act.filter(function (p) { return p.type === 'FEU'; }), att = permis().filter(function (p) { return p.statut === 'Préparé' || p.statut === 'Demandé'; });
    var late = lateActions(), r = rates();
    var html = '<div class="grid hse-ov">' + counterCard() +
      '<div class="grid g2 hse-ov__k">' +
      ui.kpi({ label: 'Permis actifs sur le site', value: act.length, icon: 'shield', tone: 'blue', foot: '<span class="' + (feu.length ? 'down' : '') + '">' + feu.length + ' permis de feu</span> · ' + act.filter(function (p) { return p.statut === 'Suspendu'; }).length + ' suspendu(s)' }) +
      ui.kpi({ label: 'Permis à traiter', value: att.length, icon: 'clock', tone: 'orange', foot: att.filter(function (p) { return p.statut === 'Préparé'; }).length + ' à autoriser · ' + att.filter(function (p) { return p.statut === 'Demandé'; }).length + ' à préparer' }) +
      ui.kpi({ label: 'Actions correctives en retard', value: late.length, icon: 'alert', tone: late.length ? 'red' : 'green', foot: S.all('actionsHSE').filter(function (a) { return a.statut !== 'Réalisée'; }).length + ' actions ouvertes' }) +
      ui.kpi({ label: 'TF1 glissant 12 mois', value: num(r.tf1, 2), icon: 'trend', tone: 'violet', foot: 'TF2 ' + num(r.tf2, 2) + ' · TG ' + num(r.tg, 3) }) +
      '</div></div>';
    html += '<div class="grid g-2-1" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Permis actifs sur le site</h3><span class="sub">autorisés, en cours ou suspendus · cliquez une zone pour filtrer</span><div class="spacer"></div><div class="legend"><span><i style="background:var(--navy-3)"></i>Actifs</span><span><i style="background:var(--red)"></i>Dont permis de feu</span><span><i style="background:var(--orange)"></i>Suspendu</span></div></div>' +
      '<div class="card__b"><div class="hse-mapwrap">' + zoneMap(act, state.zone) + '</div><div class="chips hse-zchips">' +
      Object.keys(ZONES).map(function (u) { var n = act.filter(function (p) { return p.unite === u; }).length; return '<button class="chip' + (state.zone === u ? ' is-active' : '') + '" data-z="' + u + '">' + u + ' · ' + esc(ZONES[u].s) + (n ? ' <b>' + n + '</b>' : '') + '</button>'; }).join('') + '</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>' + (state.zone ? 'Zone ' + state.zone + ' · ' + esc(uName(state.zone)) : 'Tous les permis actifs') + '</h3>' + (state.zone ? '<button class="btn ghost sm" data-z="">Toutes les zones</button>' : '') + '</div><div class="hse-pl">' +
      (function () { var l = act.filter(function (p) { return !state.zone || p.unite === state.zone; }); return l.length ? l.map(permitItem).join('') : '<div class="empty">Aucun permis actif dans cette zone.</div>'; })() + '</div></div></div>';
    /* alertes + événements récents */
    var alerts = [];
    act.filter(isOverdue).forEach(function (p) { alerts.push(['red', 'clock', '<b>' + p.id + '</b> — validité dépassée (' + fH(p.fin) + ') : à prolonger ou clôturer.', '#/hse/permis/' + p.id]); });
    act.filter(function (p) { return p.statut === 'Suspendu'; }).forEach(function (p) { alerts.push(['orange', 'alert', '<b>' + p.id + '</b> suspendu : ' + esc(p.suspension ? p.suspension.motif : ''), '#/hse/permis/' + p.id]); });
    act.forEach(function (p) { var m = lastGas(p); if (m && gasWorst(m) !== 'ok') alerts.push([gasWorst(m) === 'bad' ? 'red' : 'yellow', 'drop', '<b>' + p.id + '</b> — dernière mesure de gaz à surveiller : ' + gasPills(m), '#/hse/permis/' + p.id]); });
    permis().filter(function (p) { return p.statut === 'Préparé' && authChecks(p).some(function (c) { return !c.ok; }); }).forEach(function (p) { alerts.push(['red', 'lock', '<b>' + p.id + '</b> (' + TYPES[p.type].s + ') — autorisation bloquée par les contrôles de sécurité.', '#/hse/permis/' + p.id]); });
    pdpExpiring().forEach(function (p) { alerts.push(['orange', 'calendar', 'Plan de prévention <b>' + p.id + '</b> (' + esc(ent(p.entreprise)) + ') expire dans ' + pdpDaysLeft(p) + ' j.', '#/hse/prevention/' + p.id]); });
    S.all('plansPrevention').filter(function (p) { return p.statut === 'Expiré'; }).forEach(function (p) { alerts.push(['red', 'calendar', 'Plan de prévention <b>' + p.id + '</b> expiré — l\'entreprise ' + esc(ent(p.entreprise)) + ' ne peut plus intervenir.', '#/hse/prevention/' + p.id]); });
    if (late.length) alerts.push(['red', 'flag', '<b>' + late.length + ' actions correctives en retard</b> — plus ancienne : ' + esc(late.sort(function (a, b) { return a.echeance.localeCompare(b.echeance); })[0].libelle), '#/hse/actions']);
    var recent = S.all('incidents').slice().sort(function (a, b) { return b.date.localeCompare(a.date); }).slice(0, 5);
    html += '<div class="grid g2 keep-1" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Alertes sécurité</h3><span class="badge tone-red">' + alerts.length + '</span></div><div class="list">' +
      (alerts.length ? alerts.map(function (a) { return '<a class="list__item" href="' + a[3] + '" style="color:inherit"><div class="list__icon tone-' + a[0] + '">' + icon(a[1]) + '</div><div class="list__body small">' + a[2] + '</div></a>'; }).join('') : '<div class="empty">Aucune alerte</div>') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Derniers événements HSE</h3><div class="spacer"></div><a class="btn ghost sm" href="#/hse/evenements">Tout voir</a></div><div class="list">' +
      recent.map(function (i) { var t = EVT[i.type]; return '<a class="list__item" href="#/hse/evenements/' + i.id + '" style="color:inherit"><div class="list__icon" style="background:' + t.c + '1a;color:' + t.c + '">' + icon(t.ic) + '</div><div class="list__body"><b>' + esc(i.titre) + '</b><div class="small muted">' + fmt.date(i.date) + ' · ' + esc(i.unite + ' · ' + i.lieu) + '</div><div class="row" style="gap:6px;margin-top:4px">' + evBadge(i.type) + ui.badge(i.statut, EV_TONE[i.statut]) + '</div></div></a>'; }).join('') + '</div></div></div>';
    el.innerHTML = html;
    $$('[data-z]', el).forEach(function (b) { b.onclick = function () { state.zone = state.zone === b.dataset.z ? '' : b.dataset.z; tabApercu(el); }; });
    $$('.hse-map .zone', el).forEach(function (g) { g.addEventListener('click', function () { state.zone = state.zone === g.dataset.u ? '' : g.dataset.u; tabApercu(el); }); });
  }

  /* ------------------------------------------------------------------ onglet Permis */
  var PT_COLS = [
    { label: 'N°', render: function (p) { return '<b class="nowrap">' + p.id + '</b>'; }, csv: function (p) { return p.id; } },
    { label: 'Type', render: function (p) { return tt(p.type); }, csv: function (p) { return TYPES[p.type].l; } },
    { label: 'Unité · équipement', render: function (p) { return '<div class="hse-cell"><b>' + esc(p.unite) + '</b> · ' + esc(p.equipement) + '<div class="small muted">' + esc(p.ot) + '</div></div>'; }, csv: function (p) { return p.unite + ' · ' + p.equipement; } },
    { label: 'Entreprise', render: function (p) { return esc(ent(p.entreprise)); }, csv: function (p) { return ent(p.entreprise); } },
    { label: 'Validité', render: function (p) { return '<span class="nowrap' + (isOverdue(p) ? ' late' : '') + '">' + fDT(p.debut) + ' → ' + fH(p.fin) + '</span>'; }, csv: function (p) { return fDT(p.debut) + ' - ' + fDT(p.fin); } },
    { label: 'Dernière mesure gaz', render: function (p) { return GAS_REQ[p.type] || p.gaz.length ? gasPills(lastGas(p)) : '<span class="muted small">Non requise</span>'; }, csv: function (p) { var m = lastGas(p); return m ? 'O2 ' + m.o2 + ' / LIE ' + m.lie + ' / H2S ' + m.h2s + ' / CO ' + m.co : ''; } },
    { label: 'Statut', render: function (p) { return stBadge(p.statut); }, csv: function (p) { return p.statut; } }
  ];
  function tabPermis(el) {
    var st = state.permis, all = permis();
    var cnt = function (f) { return all.filter(f).length; };
    el.innerHTML = '<div class="grid g4">' +
      ui.kpi({ label: 'En cours sur le terrain', value: cnt(function (p) { return p.statut === 'En cours'; }), icon: 'helmet', tone: 'blue', foot: cnt(function (p) { return p.statut === 'Autorisé'; }) + ' autorisé(s) à ouvrir' }) +
      ui.kpi({ label: 'À autoriser', value: cnt(function (p) { return p.statut === 'Préparé'; }), icon: 'key', tone: 'violet', foot: cnt(function (p) { return p.statut === 'Demandé'; }) + ' demande(s) à préparer' }) +
      ui.kpi({ label: 'Permis de feu actifs', value: cnt(function (p) { return p.type === 'FEU' && ACTIFS.indexOf(p.statut) >= 0; }), icon: 'fire', tone: 'red', foot: 'LIE exigée : 0 %' }) +
      ui.kpi({ label: 'Suspendus', value: cnt(function (p) { return p.statut === 'Suspendu'; }), icon: 'alert', tone: 'orange', foot: 'Reprise après nouvelle mesure' }) + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Registre des permis de travail</h3><div class="spacer"></div><button class="btn sm" id="pt-csv">' + icon('download') + 'Export CSV</button><button class="btn primary sm" id="pt-new">' + icon('plus') + 'Nouveau permis</button></div><div class="card__b" style="padding-bottom:0">' +
      '<div class="filters"><input class="input" id="pt-q" placeholder="Rechercher (n°, équipement, OT…)" value="' + esc(st.q) + '">' +
      '<select class="select" id="pt-type"><option value="">Tous les types</option>' + TYPE_KEYS.map(function (k) { return '<option value="' + k + '"' + (st.type === k ? ' selected' : '') + '>' + esc(TYPES[k].s) + '</option>'; }).join('') + '</select>' +
      '<select class="select" id="pt-unite"><option value="">Toutes les unités</option>' + uniteOpts().map(function (o) { return '<option value="' + o.v + '"' + (st.unite === o.v ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select></div>' +
      '<div class="chips" id="pt-st" style="margin-bottom:14px">' + [['actifs', 'Actifs'], ['traiter', 'À traiter'], ['clotures', 'Clôturés / annulés'], ['tous', 'Tous']].map(function (c) { return '<button class="chip' + (st.st === c[0] ? ' is-active' : '') + '" data-k="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div></div><div id="pt-list"></div></div>';
    function rows() {
      var q = E.norm(st.q);
      return all.filter(function (p) {
        if (st.type && p.type !== st.type) return false;
        if (st.unite && p.unite !== st.unite) return false;
        if (st.st === 'actifs' && ACTIFS.indexOf(p.statut) < 0) return false;
        if (st.st === 'traiter' && ['Demandé', 'Préparé'].indexOf(p.statut) < 0) return false;
        if (st.st === 'clotures' && ['Clôturé', 'Annulé'].indexOf(p.statut) < 0) return false;
        return !q || E.norm([p.id, p.equipement, p.description, p.ot, ent(p.entreprise), TYPES[p.type].l].join(' ')).indexOf(q) >= 0;
      }).sort(function (a, b) { return b.id.localeCompare(a.id); });
    }
    function draw() { $('#pt-list', el).innerHTML = ui.table(PT_COLS, rows(), { onRow: function (p) { E.go('hse/permis/' + p.id); }, empty: 'Aucun permis pour ces critères' }); }
    draw();
    $('#pt-q', el).oninput = function (e) { st.q = e.target.value; draw(); };
    $('#pt-type', el).onchange = function (e) { st.type = e.target.value; draw(); };
    $('#pt-unite', el).onchange = function (e) { st.unite = e.target.value; draw(); };
    $$('#pt-st .chip', el).forEach(function (b) { b.onclick = function () { st.st = b.dataset.k; $$('#pt-st .chip', el).forEach(function (x) { x.classList.toggle('is-active', x === b); }); draw(); }; });
    $('#pt-csv', el).onclick = function () { ui.exportCSV('permis-de-travail', PT_COLS, rows()); };
    $('#pt-new', el).onclick = function () { newPermit(); };
  }

  /* ------------------------------------------------------------------ fiche permis */
  function validityBlock(p) {
    var now = new Date(), tot = hoursBetween(p.debut, p.fin), el = (now - toDate(p.debut)) / 36e5, rest = hoursBetween(localISO(now), p.fin);
    var pct = Math.max(0, Math.min(100, el / tot * 100)), txt, tone = '';
    if (p.statut === 'Clôturé') txt = 'Clôturé le ' + fDT(p.cloture ? p.cloture.at : p.fin);
    else if (p.statut === 'Annulé') txt = 'Permis annulé';
    else if (el < 0) txt = 'Débute dans ' + dur(-el);
    else if (rest < 0) { txt = 'Validité dépassée de ' + dur(-rest); tone = 'red'; }
    else { txt = 'Reste ' + dur(rest); tone = rest < 1.5 ? 'orange' : ''; }
    return '<div class="hse-valid"><div class="row"><b>' + fDT(p.debut) + '</b><div class="spacer"></div><b>' + fDT(p.fin) + '</b></div><div class="progress ' + tone + '"><i style="width:' + (p.statut === 'Clôturé' ? 100 : pct) + '%"></i></div>' +
      '<div class="row small"><span class="' + (tone === 'red' ? 'late' : 'muted') + '">' + txt + '</span><div class="spacer"></div><span class="muted">Durée ' + dur(tot) + ' (max 12 h)' + (p.prolong.length ? ' · ' + p.prolong.length + ' prolongation(s)' : '') + '</span></div></div>';
  }
  function sigBox(label, s) { return '<div class="hse-sig' + (s ? ' ok' : '') + '"><span>' + esc(label) + '</span>' + (s ? '<b>' + esc(s.nom) + '</b><em>' + fDT(s.at) + '</em>' : '<i>En attente</i>') + '</div>'; }
  function gasTable(p) {
    if (!p.gaz.length) return '<div class="empty" style="padding:20px">Aucune mesure de gaz enregistrée.' + (GAS_REQ[p.type] ? ' <b class="late">Obligatoire pour ce type de permis.</b>' : '') + '</div>';
    return ui.table([{ label: 'Heure', render: function (m) { return '<b class="nowrap">' + fDT(m.at) + '</b>'; } }, { label: 'Phase', key: 'phase' }].concat(GAS.map(function (g) { return { label: g.l + ' (' + g.u + ')', num: true, render: function (m) { return '<span class="gz ' + g.lvl(m[g.k]) + '">' + num(m[g.k]) + '</span>'; } }; })).concat([{ label: 'Point de mesure', key: 'point' }, { label: 'Opérateur', key: 'par' }]), p.gaz.slice().reverse());
  }
  function viewPermis(el, id) {
    var p = S.get('permis', id);
    if (!p) { el.innerHTML = '<div class="card empty">Permis introuvable. <a href="#/hse/permis">Retour au registre</a></div>'; return; }
    var t = TYPES[p.type], checks = authChecks(p), blocked = checks.some(function (c) { return !c.ok; });
    var idx = { 'Demandé': 0, 'Préparé': 1, 'Autorisé': 2, 'En cours': 3, 'Suspendu': 3, 'Clôturé': 4, 'Annulé': 0 }[p.statut];
    var btns = [];
    if (p.statut === 'Demandé') btns.push(['prepare', 'primary', 'edit', 'Préparer le permis']);
    if (p.statut === 'Préparé') { btns.push(['authorize', blocked ? 'danger' : 'success', blocked ? 'lock' : 'check', blocked ? 'Autoriser (bloqué)' : 'Autoriser le permis']); btns.push(['prepare', '', 'edit', 'Compléter la préparation']); }
    if (p.statut === 'Autorisé') btns.push(['open', 'success', 'helmet', 'Ouvrir sur le terrain']);
    if (p.statut === 'En cours') { btns.push(['suspend', 'danger', 'alert', 'Suspendre']); btns.push(['extend', '', 'clock', 'Prolonger']); btns.push(['close', 'primary', 'check', 'Clôturer']); }
    if (p.statut === 'Suspendu') { btns.push(['resume', 'success', 'refresh', 'Reprendre les travaux']); btns.push(['close', 'primary', 'check', 'Clôturer']); }
    if (['Préparé', 'Autorisé', 'En cours', 'Suspendu'].indexOf(p.statut) >= 0) btns.push(['gas', '', 'drop', 'Mesure de gaz']);
    if (p.statut === 'Demandé' || p.statut === 'Préparé' || p.statut === 'Autorisé') btns.push(['cancel', 'ghost', 'x', 'Annuler']);
    btns.push(['print', 'ghost', 'print', 'Aperçu imprimable']);
    var assoc = (p.associes || []).map(function (aid) { var a = S.get('permis', aid); return a ? '<a class="hse-assoc" href="#/hse/permis/' + a.id + '">' + tt(a.type) + '<b>' + a.id + '</b>' + stBadge(a.statut) + '</a>' : ''; }).join('');
    var also = permis().filter(function (x) { return x.id !== p.id && (x.associes || []).indexOf(p.id) >= 0 && (p.associes || []).indexOf(x.id) < 0; });
    assoc += also.map(function (a) { return '<a class="hse-assoc" href="#/hse/permis/' + a.id + '">' + tt(a.type) + '<b>' + a.id + '</b>' + stBadge(a.statut) + '</a>'; }).join('');
    var m = lastGas(p);
    var html = '<a class="btn ghost sm" href="#/hse/permis" style="margin-bottom:10px">' + icon('back') + 'Registre des permis</a>' +
      '<div class="card hse-ph" style="--c:' + t.c + '"><div class="hse-ph__band"></div><div class="card__b"><div class="row" style="align-items:flex-start"><div class="hse-ph__ic">' + icon(t.ic) + '</div><div style="flex:1;min-width:0"><div class="row" style="gap:8px"><h3 class="hse-ph__t">' + esc(t.l) + '</h3>' + stBadge(p.statut) + (isOverdue(p) ? '<span class="badge tone-red">Validité dépassée</span>' : '') + '</div>' +
      '<div class="mono" style="margin:3px 0 6px">' + p.id + ' · ' + esc(p.ot) + '</div><div>' + esc(p.description) + '</div></div></div>' +
      '<div class="row hse-ph__btns">' + btns.map(function (b) { return '<button class="btn ' + b[1] + '" data-do="' + b[0] + '">' + icon(b[2]) + esc(b[3]) + '</button>'; }).join('') + '</div></div>' +
      '<div class="card__b" style="border-top:1px solid var(--line-2)">' + ui.steps(['Demandé', 'Préparé', 'Autorisé', p.statut === 'Suspendu' ? 'Suspendu' : 'En cours', 'Clôturé'], idx, { rejected: p.statut === 'Suspendu' || p.statut === 'Annulé', finished: p.statut === 'Clôturé' }) + '</div></div>';
    if (p.statut === 'Suspendu' && p.suspension) html += alertBox('red', 'alert', '<b>Permis suspendu</b> le ' + fDT(p.suspension.at) + ' par ' + esc(p.suspension.par) + ' — ' + esc(p.suspension.motif) + (p.suspension.note ? ' : ' + esc(p.suspension.note) : '') + '. Une nouvelle mesure de gaz conforme est exigée pour reprendre.');
    html += '<div class="grid g-2-1" style="margin-top:16px"><div class="stack">' +
      '<div class="card"><div class="card__h"><h3>Identification</h3></div><div class="card__b"><dl class="kv">' +
      '<dt>Unité / zone</dt><dd>' + esc(p.unite + ' · ' + uName(p.unite)) + '</dd><dt>Équipement / lieu</dt><dd>' + esc(p.equipement) + '</dd><dt>Ordre de travail</dt><dd class="mono">' + esc(p.ot) + '</dd>' +
      '<dt>Entreprise</dt><dd>' + esc(ent(p.entreprise)) + ' · ' + (p.intervenants || 1) + ' intervenant(s)</dd><dt>Demandeur</dt><dd>' + esc(E.empName(p.demandeur)) + '</dd><dt>Émetteur (exploitation)</dt><dd>' + esc(E.empName(p.emetteur)) + '</dd>' +
      '<dt>Responsable d\'unité</dt><dd>' + esc(E.empName(p.responsable)) + '</dd>' + (p.surveillant ? '<dt>Surveillant</dt><dd>' + esc(E.empName(p.surveillant)) + '</dd>' : '') + (p.executant ? '<dt>Exécutant</dt><dd>' + esc(p.executant) + '</dd>' : '') + '</dl></div></div>' +
      '<div class="card"><div class="card__h"><h3>Analyse de risques</h3></div><div class="card__b">' + ((p.dangers || []).length ? '<div class="chips">' + p.dangers.map(function (d) { return '<span class="hse-danger">' + icon('alert') + esc(lbl(DANGERS, d)) + '</span>'; }).join('') + '</div><p class="hse-p">' + esc(p.mesuresRisques || '') + '</p>' : '<div class="muted">Analyse à réaliser lors de la préparation.</div>') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Mesures de sécurité</h3><span class="sub">obligatoires pour ce type : ' + (REQ[p.type] || []).length + '</span></div><div class="card__b"><ul class="hse-secu">' +
      SECU.filter(function (s) { return (REQ[p.type] || []).indexOf(s[0]) >= 0 || p.secu[s[0]]; }).map(function (s) { var req = (REQ[p.type] || []).indexOf(s[0]) >= 0; return '<li class="' + (p.secu[s[0]] ? 'ok' : req ? 'ko' : '') + '"><i>' + (p.secu[s[0]] ? '✓' : '') + '</i>' + esc(s[1]) + (req ? '<em>obligatoire</em>' : '') + '</li>'; }).join('') + '</ul>' +
      '<div class="small muted" style="margin:12px 0 6px;font-weight:600">EPI requis</div><div class="chips">' + ((p.epi || []).length ? p.epi.map(function (e) { return '<span class="hse-epi">' + icon('helmet') + esc(lbl(EPI, e)) + '</span>'; }).join('') : '<span class="muted small">À définir</span>') + '</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Mesures de gaz</h3><span class="sub">explosimètre 4 gaz · seuils : O₂ 19,5–23,5 % · LIE 0 % (feu) · H₂S &lt; 1 ppm · CO &lt; 20 ppm</span></div>' +
      (m ? '<div class="hse-gasnow">' + GAS.map(function (g) { return '<div class="hse-gt ' + g.lvl(m[g.k]) + '"><span>' + g.l + '</span><b>' + num(m[g.k]) + '<small>' + g.u + '</small></b><em>' + esc(g.seuil) + '</em></div>'; }).join('') + '</div>' : '') +
      gasTable(p) + '</div></div>' +
      '<div class="stack">' +
      (['Demandé', 'Préparé'].indexOf(p.statut) >= 0 ? '<div class="card"><div class="card__h"><h3>Contrôles avant autorisation</h3>' + (blocked ? '<span class="badge tone-red">Bloquant</span>' : '<span class="badge tone-green">Conforme</span>') + '</div><div class="card__b">' + checklist(checks) + '</div></div>' : '') +
      '<div class="card"><div class="card__h"><h3>Validité</h3></div><div class="card__b">' + validityBlock(p) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Signatures</h3></div><div class="card__b hse-sigs">' + sigBox('Demandeur', p.sig.demandeur) + sigBox('Émetteur', p.sig.emetteur) + sigBox('Responsable d\'unité', p.sig.responsable) + sigBox('Exécutant', p.sig.executant) + sigBox('Clôture', p.sig.cloture) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Permis associés</h3><span class="sub">cumul de risques</span></div><div class="card__b">' + (assoc || '<span class="muted small">Aucun permis associé</span>') + '</div></div>' +
      (p.cloture ? '<div class="card"><div class="card__h"><h3>Retour d\'état</h3></div><div class="card__b"><ul class="hse-secu">' + RETOUR.map(function (r) { return '<li class="ok"><i>✓</i>' + esc(r[1]) + '</li>'; }).join('') + '</ul><p class="hse-p small">' + esc(p.cloture.obs || '') + '</p></div></div>' : '') +
      '<div class="card"><div class="card__h"><h3>Historique</h3></div><div class="card__b"><div class="timeline">' + p.hist.slice().reverse().map(function (h, i) { return '<div class="tl-item ' + (i === 0 ? (h.statut === 'Suspendu' || h.statut === 'Annulé' ? 'rejected' : 'current') : 'done') + '"><b>' + esc(h.statut) + ' · ' + fDT(h.at) + '</b><span>' + esc(h.par) + (h.note ? ' — ' + esc(h.note) : '') + '</span></div>'; }).join('') + '</div></div></div>' +
      '</div></div>';
    el.innerHTML = html;
    $$('[data-do]', el).forEach(function (b) { b.onclick = function () { ACTIONS_PT[b.dataset.do](p); }; });
  }

  /* --- formulaires utilitaires */
  function checkGroup(grp, items, selected, req) {
    selected = selected || {}; req = req || [];
    return '<div class="hse-checks">' + items.map(function (it) {
      var on = Array.isArray(selected) ? selected.indexOf(it[0]) >= 0 : !!selected[it[0]], r = req.indexOf(it[0]) >= 0;
      return '<label class="hse-ck' + (r ? ' req' : '') + '"><input type="checkbox" data-grp="' + grp + '" value="' + it[0] + '"' + (on ? ' checked' : '') + '><span>' + esc(it[1]) + (r ? ' <em>obligatoire</em>' : '') + '</span></label>';
    }).join('') + '</div>';
  }
  function readGroup(root, grp) { return $$('input[data-grp="' + grp + '"]:checked', root).map(function (i) { return i.value; }); }
  function gasInputs(m, opt) {
    opt = opt || {};
    return '<div class="hse-gasin">' + GAS.map(function (g) { return '<label class="hse-gi" data-g="' + g.k + '"><span>' + g.l + ' <small>' + g.u + '</small></span><input class="input" type="number" inputmode="decimal" step="' + g.step + '" min="0" data-gas="' + g.k + '" value="' + (m && m[g.k] != null ? m[g.k] : '') + '" placeholder="—"><em>' + esc(g.seuil) + '</em></label>'; }).join('') + '</div>' +
      '<div class="form-grid" style="margin-top:12px"><div class="field"><label>Point de mesure</label><input class="input" data-gas-point value="' + esc(opt.point || 'Zone de travail') + '"></div><div class="field"><label>Opérateur de mesure</label><input class="input" data-gas-par value="' + esc(opt.par || user().name) + '"></div></div>';
  }
  function bindGas(root) {
    $$('[data-gas]', root).forEach(function (inp) {
      var f = function () { var g = GAS.find(function (x) { return x.k === inp.dataset.gas; }), lab = inp.closest('.hse-gi'); lab.classList.remove('ok', 'warn', 'bad'); if (inp.value !== '') lab.classList.add(g.lvl(+inp.value)); };
      inp.addEventListener('input', f); f();
    });
  }
  function readGas(root, phase) {
    var m = { at: nowISO(), phase: phase }, ok = true;
    $$('[data-gas]', root).forEach(function (i) { if (i.value === '') { ok = false; i.style.borderColor = 'var(--red)'; } else m[i.dataset.gas] = +i.value; });
    var pt = $('[data-gas-point]', root), pr = $('[data-gas-par]', root);
    m.point = pt ? pt.value : ''; m.par = pr ? pr.value : user().name;
    return ok ? m : null;
  }
  function blockedModal(title, rules, extra) {
    ui.modal({ title: title, sub: 'Contrôle de sécurité bloquant', size: 'sm', body: alertBox('red', 'lock', '<b>Action refusée.</b> Les conditions suivantes ne sont pas remplies :') + '<div style="margin-top:12px">' + checklist(rules) + '</div>' + (extra || ''), actions: [{ label: 'Compris', cls: 'primary' }] });
    ui.toast('Action bloquée : condition de sécurité non remplie', 'err');
  }
  function addHist(p, statut, note) { var s = stamp(note); s.statut = statut; p.hist.push(s); }
  function setStatus(p, statut, note, extra) {
    Object.assign(p, extra || {}); p.statut = statut; addHist(p, statut, note); S.save();
    E.log('Permis ' + p.id + ' → ' + statut, TYPES[p.type].s + ' · ' + p.equipement);
  }

  var ACTIONS_PT = {
    prepare: function (p) {
      var req = REQ[p.type] || [], secuSel = Object.keys(p.secu || {}).length ? p.secu : {};
      var epiSel = (p.epi || []).length ? p.epi : EPI_BASE.concat(EPI_TYPE[p.type] || []);
      var body = '<div class="hse-form">' +
        '<h4 class="hse-h4">1. Analyse de risques</h4>' + checkGroup('dg', DANGERS, p.dangers) +
        '<div class="field" style="margin-top:10px"><label>Mesures de prévention décidées *</label><textarea class="textarea" id="pp-mes" placeholder="Isolement, inertage, balisage, coordination…">' + esc(p.mesuresRisques || '') + '</textarea></div>' +
        '<h4 class="hse-h4">2. Mesures de sécurité <span class="muted small">(' + req.length + ' obligatoires pour « ' + esc(TYPES[p.type].s) + ' »)</span></h4>' + checkGroup('sc', SECU, secuSel, req) +
        (p.type === 'FEU' || p.type === 'ESP' || p.type === 'H2S' ? '<div class="field" style="margin-top:10px"><label>Surveillant désigné' + (p.type !== 'H2S' ? ' *' : '') + '</label><select class="select" id="pp-surv"><option value="">— choisir —</option>' + empOpts().map(function (o) { return '<option value="' + o.v + '"' + (o.v === p.surveillant ? ' selected' : '') + '>' + esc(o.l) + '</option>'; }).join('') + '</select></div>' : '') +
        '<h4 class="hse-h4">3. EPI requis</h4>' + checkGroup('epi', EPI, epiSel) +
        '<h4 class="hse-h4">4. Mesure de gaz de préparation ' + (GAS_REQ[p.type] ? '<span class="badge tone-red">obligatoire</span>' : '<span class="muted small">(facultative)</span>') + '</h4>' + gasInputs(null) + '</div>';
      var mo = ui.modal({ title: 'Préparer le permis ' + p.id, sub: TYPES[p.type].l + ' · ' + esc(p.equipement), size: 'lg', body: body, actions: [{ label: 'Annuler' }, { label: 'Enregistrer la préparation', cls: 'primary', icon: 'check', onClick: function (close, root) {
        var dg = readGroup(root, 'dg'), mes = $('#pp-mes', root).value.trim(), gi = $$('[data-gas]', root).some(function (i) { return i.value !== ''; });
        if (!dg.length || !mes) { ui.toast('Cochez au moins un danger et décrivez les mesures de prévention.', 'err'); return; }
        var g = null;
        if (GAS_REQ[p.type] || gi) { g = readGas(root, 'Préparation'); if (!g) { ui.toast('Mesure de gaz incomplète (O₂, LIE, H₂S et CO).', 'err'); return; } }
        var surv = $('#pp-surv', root);
        if (surv && !surv.value && p.type !== 'H2S') { ui.toast('Désignez le surveillant.', 'err'); surv.style.borderColor = 'var(--red)'; return; }
        var secu = {}; readGroup(root, 'sc').forEach(function (k) { secu[k] = true; });
        p.dangers = dg; p.mesuresRisques = mes; p.secu = secu; p.epi = readGroup(root, 'epi'); if (surv) p.surveillant = surv.value;
        if (g) p.gaz.push(g);
        var first = p.statut === 'Demandé';
        if (first) setStatus(p, 'Préparé', 'Analyse de risques et mesures de sécurité renseignées'); else { addHist(p, p.statut, 'Préparation complétée'); S.save(); E.log('Permis ' + p.id + ' — préparation complétée', ''); }
        if (first) E.notify('Permis à autoriser', p.id + ' · ' + TYPES[p.type].s + ' — ' + p.equipement, '#/hse/permis/' + p.id, p.type === 'FEU' ? 'red' : 'orange');
        close(); ui.toast(first ? 'Permis préparé — en attente d\'autorisation' : 'Préparation mise à jour');
        var bad = authChecks(p).filter(function (c) { return !c.ok; });
        if (bad.length) setTimeout(function () { ui.toast('Attention : ' + bad.length + ' contrôle(s) bloqueront l\'autorisation', 'err'); }, 400);
        E.rerender();
      } }] });
      bindGas(mo.el);
    },
    authorize: function (p) {
      if (!isHSE()) { ui.toast('L\'autorisation est réservée aux émetteurs habilités (profil HSE).', 'err'); return; }
      var c = authChecks(p), bad = c.filter(function (x) { return !x.ok; });
      if (bad.length) return blockedModal('Autorisation impossible — ' + p.id, c, GAS_REQ[p.type] ? '<p class="small muted" style="margin:12px 0 0">Corrigez la situation sur le terrain puis enregistrez une nouvelle mesure de gaz conforme (bouton « Mesure de gaz »).</p>' : '');
      var body = alertBox('green', 'check', 'Tous les contrôles de sécurité sont conformes.') + '<div style="margin:12px 0">' + checklist(c) + '</div>' +
        ui.form([{ name: 'emetteur', label: 'Émetteur (exploitation)', type: 'select', options: empOpts(), required: true, value: p.emetteur }, { name: 'responsable', label: 'Responsable d\'unité', type: 'select', options: empOpts(), required: true, value: p.responsable }]) +
        '<label class="hse-ck" style="margin-top:12px"><input type="checkbox" id="au-ok"><span>Je certifie avoir vérifié sur place la mise en œuvre des mesures de sécurité.</span></label>';
      ui.modal({ title: 'Autoriser le permis ' + p.id, sub: TYPES[p.type].l, body: body, actions: [{ label: 'Annuler' }, { label: 'Signer et autoriser', cls: 'success', icon: 'check', onClick: function (close, root) {
        if (!$('#au-ok', root).checked) { ui.toast('Cochez la certification de vérification sur place.', 'err'); return; }
        var v = ui.readForm(root); if (!v) return;
        p.emetteur = v.emetteur; p.responsable = v.responsable;
        p.sig.emetteur = { nom: E.empName(v.emetteur), at: nowISO() }; p.sig.responsable = { nom: E.empName(v.responsable), at: nowISO() };
        setStatus(p, 'Autorisé', 'Autorisé par ' + E.empName(v.emetteur) + ' et ' + E.empName(v.responsable));
        E.notify('Permis autorisé', p.id + ' — ' + p.equipement, '#/hse/permis/' + p.id, 'green');
        close(); ui.toast('Permis ' + p.id + ' autorisé'); E.rerender();
      } }] });
    },
    open: function (p) {
      var body = '<p class="small muted" style="margin-top:0">Validation sur le terrain avec l\'exécutant : visite des lieux, vérification des mesures, mesure de gaz d\'ouverture.</p>' +
        '<div class="form-grid"><div class="field full"><label>Exécutant (chef d\'équipe) *</label><input class="input" id="op-exe" value="' + esc(p.executant || '') + '" placeholder="Nom et entreprise"></div></div>' +
        '<label class="hse-ck" style="margin:12px 0"><input type="checkbox" id="op-visite"><span>Visite des lieux réalisée avec l\'exécutant, consignes comprises, permis affiché au poste de travail.</span></label>' +
        (GAS_REQ[p.type] ? '<h4 class="hse-h4">Mesure de gaz d\'ouverture <span class="badge tone-red">obligatoire</span></h4>' + gasInputs(null, { point: p.equipement }) : '');
      var mo = ui.modal({ title: 'Ouvrir le permis ' + p.id, sub: TYPES[p.type].l + ' · ' + esc(p.equipement), body: body, actions: [{ label: 'Annuler' }, { label: 'Démarrer les travaux', cls: 'success', icon: 'helmet', onClick: function (close, root) {
        var exe = $('#op-exe', root).value.trim();
        if (!exe || !$('#op-visite', root).checked) { ui.toast('Renseignez l\'exécutant et confirmez la visite des lieux.', 'err'); return; }
        var g = null;
        if (GAS_REQ[p.type]) {
          g = readGas(root, 'Ouverture'); if (!g) { ui.toast('Mesure de gaz d\'ouverture incomplète.', 'err'); return; }
          var r = gasRules(p.type, g, p.secu);
          if (r.some(function (x) { return !x.ok; })) { p.gaz.push(g); S.save(); close(); blockedModal('Ouverture refusée — ' + p.id, r, '<p class="small muted" style="margin:12px 0 0">La mesure a été enregistrée. Les travaux ne peuvent pas démarrer.</p>'); E.log('Ouverture refusée ' + p.id, 'Mesure de gaz non conforme'); E.rerender(); return; }
          p.gaz.push(g);
        }
        p.executant = exe; p.sig.executant = { nom: exe, at: nowISO() };
        var note = '';
        if (toDate(p.debut) > new Date()) { var d0 = hoursBetween(p.debut, p.fin); p.debut = nowISO(); p.fin = shift(p.debut, d0); note = ' (ouverture anticipée, validité recalée : fin ' + fDT(p.fin) + ')'; }
        setStatus(p, 'En cours', 'Ouverture sur le terrain' + (g ? ' — mesure de gaz conforme' : '') + note);
        close(); ui.toast('Travaux démarrés — permis ' + p.id + ' en cours'); E.rerender();
      } }] });
      bindGas(mo.el);
    },
    gas: function (p) {
      var phase = p.statut === 'En cours' ? 'Contrôle' : p.statut === 'Suspendu' ? 'Contrôle' : 'Préparation';
      var mo = ui.modal({ title: 'Mesure de gaz · ' + p.id, sub: 'Saisie de l\'explosimètre 4 gaz — les couleurs indiquent la conformité', body: '<div class="field" style="margin-bottom:12px"><label>Phase</label><select class="select" id="gz-ph">' + ['Préparation', 'Contrôle', 'Ouverture', 'Reprise'].map(function (x) { return '<option' + (x === phase ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></div>' + gasInputs(null, { point: p.equipement }),
        actions: [{ label: 'Annuler' }, { label: 'Enregistrer la mesure', cls: 'primary', icon: 'check', onClick: function (close, root) {
          var g = readGas(root, $('#gz-ph', root).value); if (!g) { ui.toast('Renseignez les 4 valeurs.', 'err'); return; }
          p.gaz.push(g); S.save(); E.log('Mesure de gaz ' + p.id, 'O2 ' + g.o2 + ' % · LIE ' + g.lie + ' % · H2S ' + g.h2s + ' ppm · CO ' + g.co + ' ppm');
          close();
          var bad = GAS_REQ[p.type] ? gasRules(p.type, g, p.secu).filter(function (x) { return !x.ok; }) : (gasWorst(g) === 'bad' ? [{ ok: false, l: 'Seuil dépassé' }] : []);
          if (bad.length && p.statut === 'En cours') {
            p.suspension = { at: nowISO(), par: user().name, motif: 'Alarme gaz / mesure non conforme', note: bad.map(function (x) { return x.l; }).join(' ; ') };
            setStatus(p, 'Suspendu', 'Suspension automatique : mesure de gaz non conforme');
            E.notify('Permis suspendu — alarme gaz', p.id + ' · ' + p.equipement, '#/hse/permis/' + p.id, 'red');
            ui.toast('Mesure non conforme : permis suspendu automatiquement, évacuez la zone', 'err');
          } else ui.toast(bad.length ? 'Mesure enregistrée — non conforme' : 'Mesure de gaz enregistrée — conforme', bad.length ? 'err' : 'ok');
          E.rerender();
        } }] });
      bindGas(mo.el);
    },
    suspend: function (p) {
      ui.formModal({ title: 'Suspendre le permis ' + p.id, sub: 'Arrêt immédiat des travaux, mise en sécurité du chantier', okLabel: 'Suspendre', fields: [
        { name: 'motif', label: 'Motif', type: 'select', options: ['Fin de poste', 'Alarme gaz / détection', 'Alerte météo (orage, vent)', 'Déclenchement POI / sirène', 'Écart constaté lors d\'une visite', 'Demande de l\'exploitation', 'Autre'], required: true, full: true },
        { name: 'note', label: 'Commentaire', type: 'textarea', placeholder: 'Situation, mise en sécurité réalisée…' }],
        onSubmit: function (v) {
          p.suspension = { at: nowISO(), par: user().name, motif: v.motif, note: v.note };
          setStatus(p, 'Suspendu', v.motif + (v.note ? ' — ' + v.note : ''));
          E.notify('Permis suspendu', p.id + ' — ' + v.motif, '#/hse/permis/' + p.id, 'red');
          ui.toast('Permis suspendu'); E.rerender();
        } });
    },
    resume: function (p) {
      var body = alertBox('yellow', 'info', 'Reprise après suspension (« ' + esc(p.suspension ? p.suspension.motif : '') + ' ») : vérification des lieux' + (GAS_REQ[p.type] ? ' et nouvelle mesure de gaz obligatoire.' : '.')) +
        '<label class="hse-ck" style="margin:12px 0"><input type="checkbox" id="rs-ok"><span>Les conditions ayant motivé la suspension sont levées, l\'équipe a été re-briefée.</span></label>' + (GAS_REQ[p.type] ? gasInputs(null, { point: p.equipement }) : '');
      var mo = ui.modal({ title: 'Reprendre les travaux · ' + p.id, body: body, actions: [{ label: 'Annuler' }, { label: 'Reprendre', cls: 'success', icon: 'refresh', onClick: function (close, root) {
        if (!$('#rs-ok', root).checked) { ui.toast('Confirmez la levée des conditions de suspension.', 'err'); return; }
        if (GAS_REQ[p.type]) {
          var g = readGas(root, 'Reprise'); if (!g) { ui.toast('Mesure de gaz incomplète.', 'err'); return; }
          p.gaz.push(g); var r = gasRules(p.type, g, p.secu);
          if (r.some(function (x) { return !x.ok; })) { S.save(); close(); blockedModal('Reprise refusée — ' + p.id, r); E.rerender(); return; }
        }
        setStatus(p, 'En cours', 'Reprise des travaux après suspension'); close(); ui.toast('Travaux repris'); E.rerender();
      } }] });
      bindGas(mo.el);
    },
    extend: function (p) {
      if (p.prolong.length >= 2) { ui.toast('Nombre maximal de prolongations atteint (2) : établir un nouveau permis.', 'err'); return; }
      var body = ui.form([{ name: 'h', label: 'Prolongation (heures, max 12)', type: 'number', value: 4, min: 1, required: true }, { name: 'motif', label: 'Motif', type: 'text', value: 'Travaux non terminés', required: true }]) +
        '<p class="small muted">Fin actuelle : ' + fDT(p.fin) + '. ' + (GAS_REQ[p.type] ? 'Une mesure de gaz conforme est exigée.' : '') + '</p>' + (GAS_REQ[p.type] ? gasInputs(null, { point: p.equipement }) : '');
      var mo = ui.modal({ title: 'Prolonger le permis ' + p.id, body: body, actions: [{ label: 'Annuler' }, { label: 'Prolonger', cls: 'primary', icon: 'clock', onClick: function (close, root) {
        var v = ui.readForm(root); if (!v) return;
        if (!(v.h > 0 && v.h <= 12)) { ui.toast('La prolongation doit être comprise entre 1 et 12 heures.', 'err'); return; }
        if (GAS_REQ[p.type]) { var g = readGas(root, 'Prolongation'); if (!g) { ui.toast('Mesure de gaz incomplète.', 'err'); return; } p.gaz.push(g); var r = gasRules(p.type, g, p.secu); if (r.some(function (x) { return !x.ok; })) { S.save(); close(); blockedModal('Prolongation refusée — ' + p.id, r); E.rerender(); return; } }
        var base = toDate(p.fin) < new Date() ? nowISO() : p.fin;
        p.prolong.push({ at: nowISO(), h: v.h, motif: v.motif, par: user().name }); p.fin = shift(base, v.h);
        addHist(p, p.statut, 'Prolongé de ' + v.h + ' h (' + v.motif + ') — nouvelle fin ' + fDT(p.fin)); S.save(); E.log('Permis ' + p.id + ' prolongé', v.h + ' h');
        close(); ui.toast('Permis prolongé jusqu\'à ' + fDT(p.fin)); E.rerender();
      } }] });
      bindGas(mo.el);
    },
    close: function (p) {
      var items = RETOUR.slice(); if (p.type === 'FEU') items.push(['ronde', 'Ronde de surveillance post-travaux par point chaud réalisée (1 h)']);
      var body = '<p class="small muted" style="margin-top:0">Retour d\'état : toutes les cases doivent être cochées pour clôturer le permis.</p>' + checkGroup('rt', items, []) +
        '<div class="field" style="margin-top:12px"><label>Observations</label><textarea class="textarea" id="cl-obs" placeholder="État de la zone, réserves…"></textarea></div>';
      ui.modal({ title: 'Clôturer le permis ' + p.id, sub: 'Retour d\'état et restitution à l\'exploitation', body: body, actions: [{ label: 'Annuler' }, { label: 'Clôturer le permis', cls: 'primary', icon: 'check', onClick: function (close, root) {
        var sel = readGroup(root, 'rt'), miss = items.filter(function (i) { return sel.indexOf(i[0]) < 0; });
        if (miss.length) { ui.toast('Retour d\'état incomplet : ' + miss.length + ' point(s) non validé(s).', 'err'); return; }
        p.cloture = { at: nowISO(), par: user().name, retour: sel, obs: $('#cl-obs', root).value || 'Zone restituée propre.' }; p.sig.cloture = { nom: user().name, at: nowISO() };
        setStatus(p, 'Clôturé', 'Retour d\'état : travaux terminés, zone propre'); close(); ui.toast('Permis ' + p.id + ' clôturé'); E.rerender();
      } }] });
    },
    cancel: function (p) { ui.confirm('Annuler le permis ' + p.id, 'Le permis sera annulé et ne pourra plus être utilisé.', 'Annuler le permis', function () { setStatus(p, 'Annulé', 'Permis annulé'); ui.toast('Permis annulé'); E.rerender(); }, 'danger'); },
    print: function (p) { printPermit(p); }
  };

  /* --- nouveau permis */
  function newPermit(pre) {
    pre = pre || {};
    var start = new Date(); start.setDate(start.getDate() + 1); start.setHours(7, 0, 0, 0);
    var fields = [
      { name: 'type', label: 'Type de permis', type: 'select', options: TYPE_KEYS.map(function (k) { return { v: k, l: TYPES[k].l }; }), required: true, full: true, value: pre.type || 'GEN' },
      { name: 'unite', label: 'Unité / zone', type: 'select', options: uniteOpts(), required: true, value: pre.unite || 'U100' },
      { name: 'equipement', label: 'Équipement / lieu précis', required: true, placeholder: 'ex. Pompe P-104B, bride aspiration' },
      { name: 'description', label: 'Description des travaux', type: 'textarea', required: true },
      { name: 'ot', label: 'Ordre de travail lié', placeholder: 'OT-' + yr() + '-0xxx', value: 'OT-' + yr() + '-0' + (885 + Math.floor(Math.random() * 40)) },
      { name: 'entreprise', label: 'Entreprise intervenante', type: 'select', options: entOpts(), value: 'INT' },
      { name: 'intervenants', label: 'Nombre d\'intervenants', type: 'number', value: 2, min: 1 },
      { name: 'demandeur', label: 'Demandeur', type: 'select', options: empOpts(), value: M(12), required: true },
      { name: 'emetteur', label: 'Émetteur pressenti', type: 'select', options: empOpts(), value: M(36) },
      { name: 'responsable', label: 'Responsable d\'unité', type: 'select', options: empOpts(), value: M(9) },
      { name: 'debut', label: 'Début de validité', type: 'datetime-local', value: localISO(start), required: true },
      { name: 'duree', label: 'Durée (heures, max 12)', type: 'number', value: 10, min: 1, required: true }
    ];
    var open = permis().filter(function (p) { return ['Clôturé', 'Annulé'].indexOf(p.statut) < 0; });
    var body = ui.form(fields) + '<div class="field" style="margin-top:14px"><label>Permis associés (cumul de risques, ex. feu + espace confiné, consignation)</label><div class="hse-checks hse-checks--sm">' +
      open.map(function (p) { return '<label class="hse-ck"><input type="checkbox" data-grp="as" value="' + p.id + '"><span><b>' + p.id + '</b> · ' + esc(TYPES[p.type].s) + ' · ' + esc(p.unite + ' ' + p.equipement) + '</span></label>'; }).join('') + '</div></div>';
    ui.modal({ title: 'Nouvelle demande de permis de travail', sub: 'La demande sera ensuite préparée (analyse de risques, mesures) puis autorisée', size: 'lg', body: body, actions: [{ label: 'Annuler' }, { label: 'Créer la demande', cls: 'primary', icon: 'check', onClick: function (close, root) {
      var v = ui.readForm(root); if (!v) return;
      if (!(v.duree > 0 && v.duree <= 12)) { ui.toast('La durée de validité d\'un permis est limitée à 12 heures.', 'err'); $('#f_duree', root).style.borderColor = 'var(--red)'; return; }
      var p = { id: nextId('permis', 'PT-' + yr() + '-', 4), type: v.type, statut: 'Demandé', unite: v.unite, equipement: v.equipement, description: v.description, ot: v.ot, entreprise: v.entreprise, intervenants: v.intervenants || 1,
        demandeur: v.demandeur, emetteur: v.emetteur, responsable: v.responsable, debut: v.debut, fin: shift(v.debut, v.duree), gaz: [], associes: readGroup(root, 'as'), prolong: [], secu: {}, dangers: [], epi: [], surveillant: '', cree: nowISO(),
        sig: { demandeur: { nom: E.empName(v.demandeur), at: nowISO() } }, hist: [] };
      addHist(p, 'Demandé', 'Demande créée par ' + user().name);
      p.associes.forEach(function (aid) { var a = S.get('permis', aid); if (a) { a.associes = a.associes || []; if (a.associes.indexOf(p.id) < 0) a.associes.push(p.id); } });
      S.add('permis', p); E.log('Demande de permis ' + p.id, TYPES[p.type].s + ' · ' + p.equipement);
      E.notify('Nouvelle demande de permis', p.id + ' · ' + TYPES[p.type].s, '#/hse/permis/' + p.id, 'orange');
      close(); ui.toast('Demande ' + p.id + ' créée'); E.go('hse/permis/' + p.id);
    } }] });
  }

  /* --- impression */
  function printDoc(title, html) {
    ui.modal({ title: title, size: 'lg', body: html, actions: [{ label: 'Fermer' }, { label: 'Imprimer', cls: 'primary', icon: 'print', onClick: function () { document.body.classList.add('hse-printing'); window.print(); setTimeout(function () { document.body.classList.remove('hse-printing'); }, 500); } }] });
  }
  function docHead(title, sub, ref, st) {
    return '<div class="doc__head"><div class="row" style="align-items:center"><img src="../assets/img/logo.png" alt="SOGARA"><div><b style="font-size:15px">SOGARA</b><div class="small muted">Société Gabonaise de Raffinage<br>Raffinerie de Port-Gentil · Service HSE</div></div></div>' +
      '<div class="right"><h4>' + esc(title) + '</h4><div class="small">' + esc(sub) + '</div><div class="mono" style="margin-top:4px">' + esc(ref) + '</div>' + (st ? '<div style="margin-top:4px">' + st + '</div>' : '') + '</div></div>';
  }
  function printPermit(p) {
    var t = TYPES[p.type], box = function (on) { return '<span class="hse-box">' + (on ? '✕' : '') + '</span>'; };
    var html = '<div class="doc hse-doc" style="--c:' + t.c + '">' + docHead(t.l.toUpperCase(), 'Permis de travail — à afficher sur le lieu de travail', p.id, stBadge(p.statut)) +
      '<div class="hse-dsec"><h5>1. Identification des travaux</h5><table class="hse-dt"><tr><th>Unité / zone</th><td>' + esc(p.unite + ' · ' + uName(p.unite)) + '</td><th>Ordre de travail</th><td>' + esc(p.ot) + '</td></tr>' +
      '<tr><th>Équipement</th><td colspan="3">' + esc(p.equipement) + '</td></tr><tr><th>Description</th><td colspan="3">' + esc(p.description) + '</td></tr>' +
      '<tr><th>Entreprise</th><td>' + esc(ent(p.entreprise)) + ' (' + (p.intervenants || 1) + ' pers.)</td><th>Demandeur</th><td>' + esc(E.empName(p.demandeur)) + '</td></tr>' +
      '<tr><th>Validité du</th><td>' + fDT(p.debut) + '</td><th>au</th><td>' + fDT(p.fin) + (p.prolong.length ? ' (prolongé)' : '') + '</td></tr></table></div>' +
      '<div class="hse-dsec"><h5>2. Analyse de risques</h5><div class="hse-dgrid">' + DANGERS.map(function (d) { return '<div>' + box((p.dangers || []).indexOf(d[0]) >= 0) + esc(d[1]) + '</div>'; }).join('') + '</div><p><b>Mesures :</b> ' + esc(p.mesuresRisques || '—') + '</p></div>' +
      '<div class="hse-dsec"><h5>3. Mesures de sécurité</h5><div class="hse-dgrid two">' + SECU.map(function (s) { return '<div>' + box(p.secu[s[0]]) + esc(s[1]) + ((REQ[p.type] || []).indexOf(s[0]) >= 0 ? ' <b>*</b>' : '') + '</div>'; }).join('') + '</div><p class="small">* obligatoire pour ce type de permis' + (p.surveillant ? ' · Surveillant : <b>' + esc(E.empName(p.surveillant)) + '</b>' : '') + '</p></div>' +
      '<div class="hse-dsec"><h5>4. Mesures de gaz</h5><div class="hse-dscroll"><table class="hse-dt c"><tr><th>Heure</th><th>Phase</th><th>O₂ %</th><th>LIE %</th><th>H₂S ppm</th><th>CO ppm</th><th>Opérateur</th><th>Visa</th></tr>' +
      (p.gaz.length ? p.gaz.map(function (m) { return '<tr><td>' + fDT(m.at) + '</td><td>' + esc(m.phase) + '</td>' + GAS.map(function (g) { return '<td class="gz-' + g.lvl(m[g.k]) + '">' + num(m[g.k]) + '</td>'; }).join('') + '<td>' + esc(m.par) + '</td><td></td></tr>'; }).join('') : '') +
      '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table></div><p class="small">Seuils : O₂ 19,5–23,5 % · LIE 0 % pour tout point chaud (&lt; 10 % sinon) · H₂S &lt; 1 ppm (&lt; 5 ppm sous ARI) · CO &lt; 20 ppm.</p></div>' +
      '<div class="hse-dsec"><h5>5. EPI requis</h5><div class="hse-dgrid">' + EPI.map(function (e) { return '<div>' + box((p.epi || []).indexOf(e[0]) >= 0) + esc(e[1]) + '</div>'; }).join('') + '</div>' +
      ((p.associes || []).length ? '<p><b>Permis associés :</b> ' + p.associes.map(function (a) { var x = S.get('permis', a); return a + (x ? ' (' + TYPES[x.type].s + ')' : ''); }).join(', ') + '</p>' : '') + '</div>' +
      '<div class="hse-dsec"><h5>6. Signatures</h5><div class="hse-dsigs">' + [['Demandeur', p.sig.demandeur], ['Émetteur', p.sig.emetteur], ['Responsable d\'unité', p.sig.responsable], ['Exécutant', p.sig.executant], ['Clôture / retour d\'état', p.sig.cloture]].map(function (s) { return '<div><span>' + s[0] + '</span><b>' + (s[1] ? esc(s[1].nom) : '') + '</b><em>' + (s[1] ? fDT(s[1].at) : 'Date / heure :') + '</em><i>Signature</i></div>'; }).join('') + '</div></div>' +
      '<p class="hse-dfoot">Toute alarme gaz, sirène POI ou modification des conditions entraîne l\'arrêt immédiat des travaux et la suspension du permis. Validité maximale 12 h. Document généré le ' + fDT(nowISO()) + '.</p></div>';
    printDoc('Aperçu du permis ' + p.id, html);
  }

  /* ------------------------------------------------------------------ Plans de prévention */
  var PDP_COLS = [
    { label: 'N°', render: function (p) { return '<b class="nowrap">' + p.id + '</b>'; }, csv: function (p) { return p.id; } },
    { label: 'Entreprise · travaux', render: function (p) { return '<div class="hse-cell"><b>' + esc(ent(p.entreprise)) + '</b><div class="small muted">' + esc(p.travaux) + '</div></div>'; }, csv: function (p) { return ent(p.entreprise) + ' — ' + p.travaux; } },
    { label: 'Zones', render: function (p) { return esc(p.zones.length > 4 ? 'Tout le site' : p.zones.join(', ')); }, csv: function (p) { return p.zones.join(' '); } },
    { label: 'Période', render: function (p) { var d = pdpDaysLeft(p); return '<span class="nowrap">' + fmt.dateShort(p.debut) + ' → ' + fmt.dateShort(p.fin) + '</span>' + (p.statut === 'Actif' && d <= 15 ? '<div><span class="badge tone-' + (d < 0 ? 'red' : 'orange') + '">' + (d < 0 ? 'Échu' : 'Expire dans ' + d + ' j') + '</span></div>' : ''); }, csv: function (p) { return p.debut + ' - ' + p.fin; } },
    { label: 'Effectif', num: true, render: function (p) { return p.effectif; }, csv: function (p) { return p.effectif; } },
    { label: 'Accueil sécurité', render: function (p) { return ui.progress((p.accueil.personnes || 0) / p.effectif * 100, p.accueil.personnes >= p.effectif ? 'green' : 'orange'); }, csv: function (p) { return p.accueil.personnes + '/' + p.effectif; } },
    { label: 'Statut', render: function (p) { return ui.badge(p.statut, PDP_TONE[p.statut]); }, csv: function (p) { return p.statut; } }
  ];
  function tabPDP(el) {
    var all = S.all('plansPrevention'), st = state.pdp, exp = pdpExpiring();
    var act = all.filter(function (p) { return p.statut === 'Actif'; });
    el.innerHTML = '<div class="grid g4">' +
      ui.kpi({ label: 'Plans actifs', value: act.length, icon: 'doc', tone: 'green', foot: E.sum(act, 'effectif') + ' intervenants extérieurs sur site' }) +
      ui.kpi({ label: 'À signer', value: all.filter(function (p) { return p.statut === 'Inspection commune'; }).length, icon: 'edit', tone: 'orange', foot: 'après inspection commune' }) +
      ui.kpi({ label: 'Expirent sous 15 jours', value: exp.length, icon: 'calendar', tone: exp.length ? 'red' : 'grey', foot: exp.map(function (p) { return p.id; }).join(', ') || '—' }) +
      ui.kpi({ label: 'Entreprises extérieures', value: Object.keys(E.groupBy(all.filter(function (p) { return p.statut !== 'Expiré'; }), 'entreprise')).length, icon: 'users', tone: 'blue', foot: 'avec un plan en cours' }) + '</div>' +
      (exp.length || all.some(function (p) { return p.statut === 'Expiré'; }) ? '<div class="stack" style="margin-top:16px;gap:8px">' + exp.map(function (p) { return alertBox('orange', 'calendar', '<b>' + p.id + '</b> — ' + esc(ent(p.entreprise)) + ' : le plan expire le ' + fmt.date(p.fin) + ' (' + pdpDaysLeft(p) + ' j). Prolonger ou préparer le renouvellement.'); }).join('') +
        all.filter(function (p) { return p.statut === 'Expiré'; }).map(function (p) { return alertBox('red', 'alert', '<b>' + p.id + '</b> — ' + esc(ent(p.entreprise)) + ' : plan expiré depuis le ' + fmt.date(p.fin) + '. Aucune intervention autorisée sans renouvellement.'); }).join('') + '</div>' : '') +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Plans de prévention — entreprises extérieures</h3><div class="spacer"></div><button class="btn sm" id="pdp-csv">' + icon('download') + 'Export CSV</button><button class="btn primary sm" id="pdp-new">' + icon('plus') + 'Nouveau plan</button></div>' +
      '<div class="card__b" style="padding-bottom:0"><div class="chips" id="pdp-st" style="margin-bottom:14px">' + [''].concat(PDP_FLOW).map(function (s) { return '<button class="chip' + (st.st === s ? ' is-active' : '') + '" data-k="' + s + '">' + (s || 'Tous') + '</button>'; }).join('') + '</div></div><div id="pdp-list"></div></div>';
    function rows() { return all.filter(function (p) { return !st.st || p.statut === st.st; }).sort(function (a, b) { return PDP_FLOW.indexOf(a.statut) - PDP_FLOW.indexOf(b.statut) || a.fin.localeCompare(b.fin); }); }
    function draw() { $('#pdp-list', el).innerHTML = ui.table(PDP_COLS, rows(), { onRow: function (p) { E.go('hse/prevention/' + p.id); } }); }
    draw();
    $$('#pdp-st .chip', el).forEach(function (b) { b.onclick = function () { st.st = b.dataset.k; $$('#pdp-st .chip', el).forEach(function (x) { x.classList.toggle('is-active', x === b); }); draw(); }; });
    $('#pdp-csv', el).onclick = function () { ui.exportCSV('plans-de-prevention', PDP_COLS, rows()); };
    $('#pdp-new', el).onclick = newPDP;
  }
  function newPDP() {
    ui.formModal({ title: 'Nouveau plan de prévention', sub: 'Intervention d\'une entreprise extérieure', size: 'lg', okLabel: 'Créer le brouillon', fields: [
      { name: 'entreprise', label: 'Entreprise extérieure', type: 'select', options: E.options('fournisseurs'), required: true },
      { name: 'respEE', label: 'Responsable de l\'entreprise', required: true, placeholder: 'Nom, fonction' },
      { name: 'travaux', label: 'Nature des travaux', type: 'textarea', required: true },
      { name: 'chantier', label: 'Chantier / projet', value: 'Programme de modernisation' },
      { name: 'zone', label: 'Zone principale', type: 'select', options: uniteOpts() },
      { name: 'debut', label: 'Début', type: 'date', value: D(7), required: true }, { name: 'fin', label: 'Fin', type: 'date', value: D(60), required: true },
      { name: 'effectif', label: 'Effectif prévu', type: 'number', value: 6, min: 1, required: true },
      { name: 'respSOG', label: 'Donneur d\'ordre SOGARA', type: 'select', options: empOpts(), value: M(12) }],
      onSubmit: function (v) {
        if (v.fin <= v.debut) { ui.toast('La date de fin doit être postérieure au début.', 'err'); return false; }
        var p = { id: nextId('plansPrevention', 'PDP-' + yr() + '-', 3), entreprise: v.entreprise, travaux: v.travaux, chantier: v.chantier, zones: [v.zone], debut: v.debut, fin: v.fin, effectif: v.effectif, respEE: v.respEE, respSOG: v.respSOG, statut: 'Brouillon',
          inspection: { date: '', participants: [], obs: '' }, interferences: [], habilitations: [{ l: 'Aptitude médicale à jour', ok: false }, { l: 'Formations / habilitations requises pour les travaux', ok: false }, { l: 'Sensibilisation H₂S / port de l\'ARI', ok: false }], accueil: { date: '', personnes: 0 }, sig: {}, hist: [stamp('Brouillon créé')] };
        S.add('plansPrevention', p); E.log('Plan de prévention ' + p.id + ' créé', ent(p.entreprise)); ui.toast('Plan ' + p.id + ' créé'); E.go('hse/prevention/' + p.id);
      } });
  }
  function viewPDP(el, id) {
    var p = S.get('plansPrevention', id);
    if (!p) { el.innerHTML = '<div class="card empty">Plan introuvable. <a href="#/hse/prevention">Retour</a></div>'; return; }
    var idx = PDP_FLOW.indexOf(p.statut), d = pdpDaysLeft(p), tot = Math.max(1, E.daysBetween(p.debut, p.fin)), el0 = E.daysBetween(p.debut, E.today());
    var habOk = p.habilitations.every(function (h) { return h.ok; });
    var btns = [];
    if (p.statut === 'Brouillon') btns.push(['insp', 'primary', 'users', 'Réaliser l\'inspection commune']);
    if (p.statut === 'Inspection commune') btns.push(['sign', 'success', 'edit', 'Signer le plan']);
    if (p.statut === 'Signé') btns.push(['start', 'success', 'helmet', 'Démarrer le chantier']);
    if (p.statut === 'Actif') { btns.push(['extend', '', 'clock', 'Prolonger']); btns.push(['expire', 'danger', 'x', 'Clôturer le plan']); }
    if (p.statut === 'Expiré') btns.push(['renew', 'primary', 'refresh', 'Renouveler']);
    if (p.statut !== 'Expiré') { btns.push(['risk', '', 'plus', 'Risque d\'interférence']); btns.push(['welcome', '', 'userplus', 'Accueil sécurité']); }
    btns.push(['print', 'ghost', 'print', 'Aperçu imprimable']);
    var html = '<a class="btn ghost sm" href="#/hse/prevention" style="margin-bottom:10px">' + icon('back') + 'Plans de prévention</a>' +
      '<div class="card"><div class="card__b"><div class="row" style="align-items:flex-start"><div class="hse-ph__ic" style="--c:#0e7490">' + icon('doc') + '</div><div style="flex:1;min-width:0"><div class="row" style="gap:8px"><h3 class="hse-ph__t">' + esc(ent(p.entreprise)) + '</h3>' + ui.badge(p.statut, PDP_TONE[p.statut]) + '</div><div class="mono" style="margin:3px 0 6px">' + p.id + ' · ' + esc(p.chantier || '') + '</div><div>' + esc(p.travaux) + '</div></div></div>' +
      '<div class="row hse-ph__btns">' + btns.map(function (b) { return '<button class="btn ' + b[1] + '" data-do="' + b[0] + '">' + icon(b[2]) + esc(b[3]) + '</button>'; }).join('') + '</div></div>' +
      '<div class="card__b" style="border-top:1px solid var(--line-2)">' + ui.steps(PDP_FLOW, idx, { rejected: p.statut === 'Expiré' }) + '</div></div>';
    if (p.statut === 'Actif' && d <= 15) html += alertBox(d < 0 ? 'red' : 'orange', 'calendar', 'Le plan ' + (d < 0 ? 'est échu depuis ' + (-d) + ' j' : 'expire dans <b>' + d + ' jours</b>') + ' (' + fmt.date(p.fin) + ').');
    html += '<div class="grid g-2-1" style="margin-top:16px"><div class="stack">' +
      '<div class="card"><div class="card__h"><h3>Informations générales</h3></div><div class="card__b"><dl class="kv"><dt>Entreprise extérieure</dt><dd>' + esc(ent(p.entreprise)) + '</dd><dt>Responsable EE</dt><dd>' + esc(p.respEE) + '</dd><dt>Donneur d\'ordre SOGARA</dt><dd>' + esc(E.empName(p.respSOG)) + '</dd>' +
      '<dt>Zones d\'intervention</dt><dd>' + p.zones.map(function (z) { return esc(z + ' · ' + uName(z)); }).join('<br>') + '</dd><dt>Période</dt><dd>' + fmt.date(p.debut) + ' → ' + fmt.date(p.fin) + '</dd><dt>Effectif</dt><dd>' + p.effectif + ' personnes</dd></dl>' +
      '<div style="margin-top:14px">' + ui.progress(Math.max(0, Math.min(100, el0 / tot * 100)), p.statut === 'Expiré' ? 'red' : d <= 15 ? 'orange' : '') + '<div class="small muted">Avancement de la période</div></div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Inspection commune préalable</h3></div><div class="card__b">' + (p.inspection.date ? '<dl class="kv"><dt>Date</dt><dd>' + fmt.date(p.inspection.date) + '</dd><dt>Participants</dt><dd>' + p.inspection.participants.map(esc).join('<br>') + '</dd><dt>Observations</dt><dd>' + esc(p.inspection.obs || '—') + '</dd></dl>' : '<div class="muted">Inspection commune non encore réalisée.</div>') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Risques d\'interférence et mesures</h3><span class="sub">' + p.interferences.length + ' risque(s)</span></div>' + ui.table([{ label: 'Risque', key: 'risque' }, { label: 'Mesure de prévention', key: 'mesure' }, { label: 'À la charge de', render: function (r) { return ui.badge(r.charge === 'EE' ? 'Entreprise ext.' : 'SOGARA', r.charge === 'EE' ? 'violet' : 'navy'); } }], p.interferences, { empty: 'Aucun risque d\'interférence identifié' }) + '</div></div>' +
      '<div class="stack"><div class="card"><div class="card__h"><h3>Habilitations vérifiées</h3>' + (habOk ? '<span class="badge tone-green">Complet</span>' : '<span class="badge tone-orange">À vérifier</span>') + '</div><div class="card__b"><div class="hse-checks one">' +
      p.habilitations.map(function (h, i) { return '<label class="hse-ck"><input type="checkbox" data-hab="' + i + '"' + (h.ok ? ' checked' : '') + (p.statut === 'Expiré' ? ' disabled' : '') + '><span>' + esc(h.l) + '</span></label>'; }).join('') + '</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Accueil sécurité</h3></div><div class="card__b"><div class="hse-big">' + (p.accueil.personnes || 0) + '<small> / ' + p.effectif + ' personnes</small></div>' + ui.progress((p.accueil.personnes || 0) / p.effectif * 100, p.accueil.personnes >= p.effectif ? 'green' : 'orange') + '<div class="small muted">' + (p.accueil.date ? 'Dernière session le ' + fmt.date(p.accueil.date) : 'Aucune session enregistrée') + '</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Signatures</h3></div><div class="card__b hse-sigs">' + sigBox('Donneur d\'ordre (SOGARA)', p.sig.sogara) + sigBox('Entreprise extérieure', p.sig.ee) + '</div></div>' +
      ((p.hist || []).length ? '<div class="card"><div class="card__h"><h3>Historique</h3></div><div class="card__b"><div class="timeline">' + p.hist.slice().reverse().map(function (h) { return '<div class="tl-item done"><b>' + fDT(h.at) + '</b><span>' + esc(h.par) + ' — ' + esc(h.note) + '</span></div>'; }).join('') + '</div></div></div>' : '') +
      '</div></div>';
    el.innerHTML = html;
    var save = function (note, statut) { if (statut) p.statut = statut; p.hist = p.hist || []; p.hist.push(stamp(note)); S.save(); E.log('Plan de prévention ' + p.id, note); };
    $$('[data-hab]', el).forEach(function (c) { c.onchange = function () { p.habilitations[+c.dataset.hab].ok = c.checked; save((c.checked ? 'Habilitation vérifiée : ' : 'Habilitation à revoir : ') + p.habilitations[+c.dataset.hab].l); E.rerender(); }; });
    var A = {
      insp: function () { ui.formModal({ title: 'Inspection commune préalable', sub: p.id + ' · ' + ent(p.entreprise), fields: [{ name: 'date', label: 'Date de l\'inspection', type: 'date', value: E.today(), required: true }, { name: 'participants', label: 'Participants (un par ligne)', type: 'textarea', required: true, value: user().name + ' (HSE)\n' + E.empName(p.respSOG) + ' (donneur d\'ordre)\n' + p.respEE }, { name: 'obs', label: 'Observations / consignes', type: 'textarea' }],
        onSubmit: function (v) { p.inspection = { date: v.date, participants: v.participants.split('\n').map(function (s) { return s.trim(); }).filter(Boolean), obs: v.obs }; save('Inspection commune réalisée', 'Inspection commune'); E.notify('Plan de prévention à signer', p.id + ' · ' + ent(p.entreprise), '#/hse/prevention/' + p.id, 'orange'); ui.toast('Inspection commune enregistrée'); E.rerender(); } }); },
      sign: function () {
        var c = [{ ok: !!p.inspection.date, l: 'Inspection commune réalisée' }, { ok: p.interferences.length > 0, l: 'Risques d\'interférence analysés (' + p.interferences.length + ')' }, { ok: habOk, l: 'Habilitations vérifiées (' + p.habilitations.filter(function (h) { return h.ok; }).length + '/' + p.habilitations.length + ')' }];
        if (c.some(function (x) { return !x.ok; })) return blockedModal('Signature impossible — ' + p.id, c);
        ui.confirm('Signer le plan ' + p.id, 'Signature conjointe du donneur d\'ordre SOGARA (' + esc(user().name) + ') et de l\'entreprise extérieure (' + esc(p.respEE) + ').', 'Signer', function () { p.sig = { sogara: { nom: user().name, at: nowISO() }, ee: { nom: p.respEE.split(' (')[0], at: nowISO() } }; save('Plan signé par les deux parties', 'Signé'); ui.toast('Plan de prévention signé'); E.rerender(); }, 'success');
      },
      start: function () {
        var c = [{ ok: (p.accueil.personnes || 0) >= p.effectif, l: 'Accueil sécurité de tout l\'effectif (' + (p.accueil.personnes || 0) + '/' + p.effectif + ')' }, { ok: p.debut <= E.addDays(E.today(), 1), l: 'Date de début atteinte (' + fmt.date(p.debut) + ')' }];
        if (c.some(function (x) { return !x.ok; })) return blockedModal('Démarrage impossible — ' + p.id, c);
        save('Chantier démarré — plan actif', 'Actif'); ui.toast('Plan actif'); E.rerender();
      },
      extend: function () { ui.formModal({ title: 'Prolonger le plan ' + p.id, fields: [{ name: 'fin', label: 'Nouvelle date de fin', type: 'date', value: E.addDays(p.fin, 30), required: true }], onSubmit: function (v) { if (v.fin <= p.fin) { ui.toast('La nouvelle date doit être postérieure.', 'err'); return false; } save('Prolongé du ' + fmt.date(p.fin) + ' au ' + fmt.date(v.fin)); p.fin = v.fin; S.save(); ui.toast('Plan prolongé'); E.rerender(); } }); },
      expire: function () { ui.confirm('Clôturer le plan ' + p.id, 'Le plan passera au statut « Expiré » : l\'entreprise ne pourra plus intervenir.', 'Clôturer', function () { save('Plan clôturé', 'Expiré'); ui.toast('Plan clôturé'); E.rerender(); }, 'danger'); },
      renew: function () {
        var n = E.clone(p); n.id = nextId('plansPrevention', 'PDP-' + yr() + '-', 3); n.statut = 'Brouillon'; n.debut = E.today(); n.fin = E.addDays(E.today(), Math.max(30, tot)); n.inspection = { date: '', participants: [], obs: '' }; n.accueil = { date: '', personnes: 0 }; n.sig = {}; n.habilitations.forEach(function (h) { h.ok = false; }); n.hist = [stamp('Renouvellement de ' + p.id)];
        S.add('plansPrevention', n); E.log('Renouvellement ' + p.id + ' → ' + n.id, ''); ui.toast('Brouillon ' + n.id + ' créé'); E.go('hse/prevention/' + n.id);
      },
      risk: function () { ui.formModal({ title: 'Ajouter un risque d\'interférence', fields: [{ name: 'risque', label: 'Risque', required: true, full: true }, { name: 'mesure', label: 'Mesure de prévention', type: 'textarea', required: true }, { name: 'charge', label: 'À la charge de', type: 'select', options: [{ v: 'SOGARA', l: 'SOGARA' }, { v: 'EE', l: 'Entreprise extérieure' }] }], onSubmit: function (v) { p.interferences.push(v); save('Risque ajouté : ' + v.risque); ui.toast('Risque ajouté'); E.rerender(); } }); },
      welcome: function () { ui.formModal({ title: 'Session d\'accueil sécurité', sub: 'Consignes du site, POI, H₂S, permis de travail', fields: [{ name: 'date', label: 'Date', type: 'date', value: E.today(), required: true }, { name: 'n', label: 'Nombre de personnes accueillies', type: 'number', value: Math.max(1, p.effectif - (p.accueil.personnes || 0)), min: 1, required: true }], onSubmit: function (v) { p.accueil = { date: v.date, personnes: Math.min(p.effectif, (p.accueil.personnes || 0) + v.n) }; save('Accueil sécurité : ' + v.n + ' personne(s)'); ui.toast('Accueil enregistré'); E.rerender(); } }); },
      print: function () { printPDP(p); }
    };
    $$('[data-do]', el).forEach(function (b) { b.onclick = function () { A[b.dataset.do](); }; });
  }
  function printPDP(p) {
    var html = '<div class="doc hse-doc">' + docHead('PLAN DE PRÉVENTION', 'Intervention d\'une entreprise extérieure', p.id, ui.badge(p.statut, PDP_TONE[p.statut])) +
      '<div class="hse-dsec"><h5>1. Parties et travaux</h5><table class="hse-dt"><tr><th>Entreprise utilisatrice</th><td>SOGARA — Raffinerie de Port-Gentil</td><th>Donneur d\'ordre</th><td>' + esc(E.empName(p.respSOG)) + '</td></tr><tr><th>Entreprise extérieure</th><td>' + esc(ent(p.entreprise)) + '</td><th>Responsable</th><td>' + esc(p.respEE) + '</td></tr>' +
      '<tr><th>Travaux</th><td colspan="3">' + esc(p.travaux) + '</td></tr><tr><th>Zones</th><td>' + esc(p.zones.join(', ')) + '</td><th>Période</th><td>' + fmt.date(p.debut) + ' → ' + fmt.date(p.fin) + '</td></tr><tr><th>Effectif</th><td>' + p.effectif + ' personnes</td><th>Accueil sécurité</th><td>' + (p.accueil.personnes || 0) + ' / ' + p.effectif + '</td></tr></table></div>' +
      '<div class="hse-dsec"><h5>2. Inspection commune préalable</h5><p>' + (p.inspection.date ? 'Réalisée le ' + fmt.date(p.inspection.date) + ' — ' + p.inspection.participants.map(esc).join(' ; ') + '<br>' + esc(p.inspection.obs || '') : 'Non réalisée.') + '</p></div>' +
      '<div class="hse-dsec"><h5>3. Risques d\'interférence et mesures de prévention</h5><table class="hse-dt"><tr><th>Risque</th><th>Mesure</th><th>Charge</th></tr>' + p.interferences.map(function (r) { return '<tr><td>' + esc(r.risque) + '</td><td>' + esc(r.mesure) + '</td><td>' + (r.charge === 'EE' ? 'EE' : 'SOGARA') + '</td></tr>'; }).join('') + '</table></div>' +
      '<div class="hse-dsec"><h5>4. Habilitations et aptitudes</h5><div class="hse-dgrid two">' + p.habilitations.map(function (h) { return '<div><span class="hse-box">' + (h.ok ? '✕' : '') + '</span>' + esc(h.l) + '</div>'; }).join('') + '</div></div>' +
      '<div class="hse-dsec"><h5>5. Signatures</h5><div class="hse-dsigs">' + [['Donneur d\'ordre SOGARA', p.sig.sogara], ['Entreprise extérieure', p.sig.ee], ['Service HSE', null]].map(function (s) { return '<div><span>' + s[0] + '</span><b>' + (s[1] ? esc(s[1].nom) : '') + '</b><em>' + (s[1] ? fDT(s[1].at) : 'Date :') + '</em><i>Signature</i></div>'; }).join('') + '</div></div></div>';
    printDoc('Aperçu du plan ' + p.id, html);
  }

  /* ------------------------------------------------------------------ Événements */
  var EV_COLS = [
    { label: 'N°', render: function (i) { return '<b class="nowrap">' + i.id + '</b>'; }, csv: function (i) { return i.id; } },
    { label: 'Date', render: function (i) { return '<span class="nowrap">' + fmt.dateShort(i.date) + ' ' + esc(i.heure) + '</span>'; }, csv: function (i) { return i.date + ' ' + i.heure; } },
    { label: 'Type', render: function (i) { return evBadge(i.type); }, csv: function (i) { return EVT[i.type].l; } },
    { label: 'Événement', render: function (i) { return '<div class="hse-cell"><b>' + esc(i.titre) + '</b><div class="small muted">' + esc(i.unite + ' · ' + i.lieu) + '</div></div>'; }, csv: function (i) { return i.titre; } },
    { label: 'Gravité', render: function (i) { return gravBadge(i.gravite); }, csv: function (i) { return GRAV[i.gravite]; } },
    { label: 'Actions', render: function (i) { var a = S.all('actionsHSE').filter(function (x) { return x.source === i.id; }); if (!a.length) return '<span class="muted small">—</span>'; var l = a.filter(actLate).length; return '<span class="nowrap">' + a.filter(function (x) { return x.statut === 'Réalisée'; }).length + '/' + a.length + (l ? ' <span class="badge tone-red">' + l + ' en retard</span>' : '') + '</span>'; }, csv: function (i) { return S.all('actionsHSE').filter(function (x) { return x.source === i.id; }).length; } },
    { label: 'Statut', render: function (i) { return ui.badge(i.statut, EV_TONE[i.statut]); }, csv: function (i) { return i.statut; } }
  ];
  function tabEvents(el) {
    var all = S.all('incidents'), st = state.ev, r = rates();
    var by = E.groupBy(r.inc, 'type');
    el.innerHTML = '<div class="hse-evk">' + Object.keys(EVT).map(function (k) { var t = EVT[k]; return '<button class="hse-evt' + (st.type === k ? ' on' : '') + '" data-t="' + k + '" style="--c:' + t.c + '">' + icon(t.ic) + '<b>' + ((by[k] || []).length) + '</b><span>' + esc(t.l) + '</span></button>'; }).join('') + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Registre des événements HSE</h3><span class="sub">12 derniers mois</span><div class="spacer"></div><button class="btn sm" id="ev-csv">' + icon('download') + 'Export CSV</button><button class="btn danger sm" id="ev-new">' + icon('alert') + 'Déclarer</button></div>' +
      '<div class="card__b" style="padding-bottom:0"><div class="filters"><input class="input" id="ev-q" placeholder="Rechercher (lieu, description…)" value="' + esc(st.q) + '">' + (st.type ? '<button class="btn ghost sm" id="ev-all">' + icon('x') + esc(EVT[st.type].l) + '</button>' : '') + '</div></div><div id="ev-list"></div></div>';
    function rows() { var q = E.norm(st.q); return all.filter(function (i) { return (!st.type || i.type === st.type) && (!q || E.norm([i.id, i.titre, i.description, i.lieu, i.unite].join(' ')).indexOf(q) >= 0); }).sort(function (a, b) { return b.date.localeCompare(a.date); }); }
    function draw() { $('#ev-list', el).innerHTML = ui.table(EV_COLS, rows(), { onRow: function (i) { E.go('hse/evenements/' + i.id); }, empty: 'Aucun événement' }); }
    draw();
    $('#ev-q', el).oninput = function (e) { st.q = e.target.value; draw(); };
    $$('.hse-evt', el).forEach(function (b) { b.onclick = function () { st.type = st.type === b.dataset.t ? '' : b.dataset.t; tabEvents(el); }; });
    if ($('#ev-all', el)) $('#ev-all', el).onclick = function () { st.type = ''; tabEvents(el); };
    $('#ev-csv', el).onclick = function () { ui.exportCSV('evenements-hse', EV_COLS, rows()); };
    $('#ev-new', el).onclick = declareEvent;
  }
  function declareEvent() {
    var body = '<div class="hse-decl"><div class="field"><label>Type d\'événement *</label><div class="hse-tiles">' + Object.keys(EVT).map(function (k, i) { var t = EVT[k]; return '<label class="hse-tile" style="--c:' + t.c + '"><input type="radio" name="evtype" value="' + k + '"' + (k === 'SD' ? ' checked' : '') + '>' + icon(t.ic) + '<span>' + esc(t.l) + '</span></label>'; }).join('') + '</div></div>' +
      '<div class="field"><label>Gravité (réelle ou potentielle) *</label><div class="hse-seg">' + [1, 2, 3, 4].map(function (g) { return '<label class="g' + g + '"><input type="radio" name="evgrav" value="' + g + '"' + (g === 2 ? ' checked' : '') + '><span>' + GRAV[g] + '</span></label>'; }).join('') + '</div></div>' +
      '<div class="form-grid"><div class="field"><label>Date et heure *</label><input class="input" type="datetime-local" id="ev-dt" value="' + nowISO() + '"></div><div class="field"><label>Unité *</label><select class="select" id="ev-u">' + uniteOpts().map(function (o) { return '<option value="' + o.v + '">' + esc(o.l) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field full"><label>Lieu précis *</label><input class="input" id="ev-lieu" placeholder="ex. Pompe P-104B, passerelle +8 m"></div>' +
      '<div class="field full"><label>Que s\'est-il passé ? *</label><textarea class="textarea" id="ev-desc" placeholder="Décrivez les faits, sans chercher de coupable."></textarea></div>' +
      '<div class="field full"><label>Mesures immédiates prises</label><input class="input" id="ev-imm" placeholder="Balisage, arrêt, mise en sécurité…"></div></div>' +
      '<label class="hse-ck" style="margin-top:12px"><input type="checkbox" id="ev-bl"><span>Une personne a été blessée</span></label>' +
      '<div class="form-grid hide" id="ev-vic" style="margin-top:10px"><div class="field"><label>Victime</label><select class="select" id="ev-v"><option value="">— Personne extérieure / non listée —</option>' + empOpts().map(function (o) { return '<option value="' + o.v + '">' + esc(o.l) + '</option>'; }).join('') + '</select></div><div class="field"><label>Jours d\'arrêt (si connus)</label><input class="input" type="number" min="0" id="ev-ja" value="0"></div></div></div>';
    var mo = ui.modal({ title: 'Déclarer un événement HSE', sub: 'Déclaration rapide depuis le terrain — moins d\'une minute', body: body, actions: [{ label: 'Annuler' }, { label: 'Envoyer la déclaration', cls: 'danger', icon: 'send', onClick: function (close, root) {
      var type = ($('input[name="evtype"]:checked', root) || {}).value, g = +(($('input[name="evgrav"]:checked', root) || {}).value || 2), lieu = $('#ev-lieu', root).value.trim(), desc = $('#ev-desc', root).value.trim(), dt = $('#ev-dt', root).value;
      if (!type || !lieu || !desc || !dt) { ui.toast('Type, lieu et description sont obligatoires.', 'err'); [$('#ev-lieu', root), $('#ev-desc', root)].forEach(function (i) { if (!i.value.trim()) i.style.borderColor = 'var(--red)'; }); return; }
      var ja = +$('#ev-ja', root).value || 0;
      if (type === 'AAA' && !ja) ja = 1;
      var y = dt.slice(0, 4), i = { id: nextId('incidents', 'EV-' + y + '-', 3), date: dt.slice(0, 10), heure: dt.slice(11, 16), type: type, gravite: g, unite: $('#ev-u', root).value, lieu: lieu,
        titre: desc.length > 70 ? desc.slice(0, 67).replace(/\s+\S*$/, '') + '…' : desc, description: desc, mesuresImm: $('#ev-imm', root).value, victime: $('#ev-bl', root).checked ? $('#ev-v', root).value : '', joursArret: type === 'AAA' ? ja : 0,
        declarant: '', declarantNom: user().name, statut: 'Déclaré', causes: null };
      S.add('incidents', i); E.log('Événement HSE déclaré ' + i.id, EVT[type].l + ' · ' + lieu);
      E.notify('Événement HSE déclaré : ' + EVT[type].l, i.unite + ' · ' + lieu, '#/hse/evenements/' + i.id, g >= 3 || type === 'AAA' || type === 'FEU' ? 'red' : 'orange');
      close(); ui.toast('Déclaration ' + i.id + ' envoyée au service HSE'); E.go('hse/evenements/' + i.id);
    } }] });
    $('#ev-bl', mo.el).onchange = function (e) { $('#ev-vic', mo.el).classList.toggle('hide', !e.target.checked); };
  }
  function causesHtml(c) {
    if (!c) return '<div class="muted">Analyse des causes non réalisée.</div>';
    if (c.methode === '5 pourquoi') return '<div class="small muted" style="margin-bottom:8px">Méthode des 5 pourquoi</div><ol class="hse-5p">' + c.pourquoi.filter(Boolean).map(function (w, i) { return '<li><i>' + (i + 1) + '</i><span><b>Pourquoi ?</b> ' + esc(w) + '</span></li>'; }).join('') + '</ol>' + (c.racine ? '<div class="alert tone-violet" style="margin-top:10px">' + icon('target') + '<div><b>Cause racine :</b> ' + esc(c.racine) + '</div></div>' : '');
    var f = c.facteurs || {};
    return '<div class="small muted" style="margin-bottom:8px">Arbre des causes simplifié (méthode des 5M)</div><div class="hse-tree"><div class="hse-tree__cats">' + CAT5M.map(function (k) { var l = (f[k] || []).filter(Boolean); return '<div class="hse-tree__c' + (l.length ? '' : ' empty') + '"><b>' + esc(k) + '</b>' + (l.length ? l.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') : '<em>—</em>') + '</div>'; }).join('') + '</div><div class="hse-tree__ev">' + icon('arrow') + '<b>Événement</b></div></div>';
  }
  function viewEvent(el, id) {
    var i = S.get('incidents', id);
    if (!i) { el.innerHTML = '<div class="card empty">Événement introuvable. <a href="#/hse/evenements">Retour</a></div>'; return; }
    var t = EVT[i.type], acts = S.all('actionsHSE').filter(function (a) { return a.source === i.id; }), idx = EV_FLOW.indexOf(i.statut);
    var btns = [];
    if (i.statut !== 'Clôturé') { btns.push(['analyse', 'primary', 'search', i.causes ? 'Modifier l\'analyse' : 'Analyser les causes']); btns.push(['action', '', 'plus', 'Action corrective']); btns.push(['close', 'success', 'check', 'Clôturer']); }
    var html = '<a class="btn ghost sm" href="#/hse/evenements" style="margin-bottom:10px">' + icon('back') + 'Registre des événements</a>' +
      '<div class="card hse-ph" style="--c:' + t.c + '"><div class="hse-ph__band"></div><div class="card__b"><div class="row" style="align-items:flex-start"><div class="hse-ph__ic">' + icon(t.ic) + '</div><div style="flex:1;min-width:0"><div class="row" style="gap:8px"><h3 class="hse-ph__t">' + esc(i.titre) + '</h3></div>' +
      '<div class="row" style="gap:6px;margin:6px 0">' + evBadge(i.type) + gravBadge(i.gravite) + ui.badge(i.statut, EV_TONE[i.statut]) + '</div><div class="mono">' + i.id + ' · ' + fmt.date(i.date) + ' à ' + esc(i.heure) + '</div></div></div>' +
      '<div class="row hse-ph__btns">' + btns.map(function (b) { return '<button class="btn ' + b[1] + '" data-do="' + b[0] + '">' + icon(b[2]) + esc(b[3]) + '</button>'; }).join('') + '</div></div><div class="card__b" style="border-top:1px solid var(--line-2)">' + ui.steps(EV_FLOW, idx, { finished: i.statut === 'Clôturé' }) + '</div></div>' +
      '<div class="grid g-2-1" style="margin-top:16px"><div class="stack"><div class="card"><div class="card__h"><h3>Description des faits</h3></div><div class="card__b"><p class="hse-p" style="margin-top:0">' + esc(i.description) + '</p>' + (i.mesuresImm ? '<div class="alert tone-blue">' + icon('shield') + '<div><b>Mesures immédiates :</b> ' + esc(i.mesuresImm) + '</div></div>' : '') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Analyse des causes</h3></div><div class="card__b">' + causesHtml(i.causes) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Actions correctives</h3><span class="sub">' + acts.filter(function (a) { return a.statut === 'Réalisée'; }).length + '/' + acts.length + ' réalisées</span></div>' + actTable(acts) + '</div></div>' +
      '<div class="stack"><div class="card"><div class="card__h"><h3>Informations</h3></div><div class="card__b"><dl class="kv"><dt>Unité</dt><dd>' + esc(i.unite + ' · ' + uName(i.unite)) + '</dd><dt>Lieu</dt><dd>' + esc(i.lieu) + '</dd><dt>Déclarant</dt><dd>' + esc(i.declarant ? E.empName(i.declarant) : i.declarantNom || '—') + '</dd>' +
      (i.victime ? '<dt>Victime</dt><dd>' + esc(E.empName(i.victime)) + '</dd>' : '') + (i.type === 'AAA' ? '<dt>Jours d\'arrêt</dt><dd><b class="late">' + i.joursArret + ' jours</b></dd>' : '') + '</dl></div></div>' +
      (i.type === 'AAA' ? alertBox('red', 'alert', 'Accident avec arrêt : déclaration à la CNSS sous 48 h et information de l\'inspection du travail.') : '') + '</div></div>';
    el.innerHTML = html;
    bindActRows(el);
    var A = {
      analyse: function () {
        var c = i.causes || {}, f = c.facteurs || {}, five = c.pourquoi || [];
        var body = '<div class="hse-seg" style="margin-bottom:14px" id="an-m"><label><input type="radio" name="anm" value="5p"' + (c.methode !== 'Arbre des causes' ? ' checked' : '') + '><span>5 pourquoi</span></label><label><input type="radio" name="anm" value="arbre"' + (c.methode === 'Arbre des causes' ? ' checked' : '') + '><span>Arbre des causes (5M)</span></label></div>' +
          '<div id="an-5p">' + [0, 1, 2, 3, 4].map(function (k) { return '<div class="field" style="margin-bottom:8px"><label>Pourquoi n°' + (k + 1) + '</label><input class="input" data-w="' + k + '" value="' + esc(five[k] || '') + '"></div>'; }).join('') + '<div class="field"><label>Cause racine</label><input class="input" id="an-r" value="' + esc(c.racine || '') + '"></div></div>' +
          '<div id="an-tr" class="hide">' + CAT5M.map(function (k) { return '<div class="field" style="margin-bottom:8px"><label>' + esc(k) + ' <span class="muted">(une cause par ligne)</span></label><textarea class="textarea" style="min-height:52px" data-c="' + esc(k) + '">' + esc((f[k] || []).join('\n')) + '</textarea></div>'; }).join('') + '</div>';
        var mo = ui.modal({ title: 'Analyse des causes · ' + i.id, body: body, actions: [{ label: 'Annuler' }, { label: 'Enregistrer l\'analyse', cls: 'primary', icon: 'check', onClick: function (close, root) {
          var m = $('input[name="anm"]:checked', root).value;
          if (m === '5p') { var w = $$('[data-w]', root).map(function (x) { return x.value.trim(); }); if (!w[0]) { ui.toast('Renseignez au moins le premier pourquoi.', 'err'); return; } i.causes = { methode: '5 pourquoi', pourquoi: w.filter(Boolean), racine: $('#an-r', root).value.trim() }; }
          else { var fx = {}; $$('[data-c]', root).forEach(function (x) { fx[x.dataset.c] = x.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }); i.causes = { methode: 'Arbre des causes', facteurs: fx }; }
          if (i.statut === 'Déclaré') i.statut = 'En analyse';
          S.save(); E.log('Analyse des causes ' + i.id, i.causes.methode); close(); ui.toast('Analyse enregistrée'); E.rerender();
        } }] });
        var sw = function () { var v = $('input[name="anm"]:checked', mo.el).value; $('#an-5p', mo.el).classList.toggle('hide', v !== '5p'); $('#an-tr', mo.el).classList.toggle('hide', v === '5p'); };
        $$('input[name="anm"]', mo.el).forEach(function (r) { r.onchange = sw; }); sw();
      },
      action: function () { newAction(i.id, function () { if (i.statut === 'Déclaré' || i.statut === 'En analyse') { i.statut = 'Actions en cours'; S.save(); } }); },
      close: function () {
        var open = acts.filter(function (a) { return a.statut !== 'Réalisée'; });
        var c = [{ ok: !!i.causes, l: 'Analyse des causes réalisée' }, { ok: acts.length > 0 || i.gravite <= 1, l: 'Au moins une action corrective définie' }, { ok: !open.length, l: 'Toutes les actions réalisées (' + (acts.length - open.length) + '/' + acts.length + ')' }];
        if (c.some(function (x) { return !x.ok; })) return blockedModal('Clôture impossible — ' + i.id, c);
        i.statut = 'Clôturé'; S.save(); E.log('Événement clôturé ' + i.id, ''); ui.toast('Événement clôturé'); E.rerender();
      }
    };
    $$('[data-do]', el).forEach(function (b) { b.onclick = function () { A[b.dataset.do](); }; });
  }

  /* ------------------------------------------------------------------ Actions correctives */
  function srcLabel(s) { if (!s) return 'Autre'; var i = S.get('incidents', s); if (i) return s + ' · ' + i.titre; var a = S.get('audits', s); if (a) return s + ' · ' + a.theme; return s; }
  function echeanceHtml(a) { if (a.statut === 'Réalisée') return '<span class="nowrap muted">' + fmt.dateShort(a.echeance) + '</span>'; var d = E.daysBetween(E.today(), a.echeance); return d < 0 ? '<span class="nowrap late">' + fmt.dateShort(a.echeance) + ' · ' + (-d) + ' j de retard</span>' : '<span class="nowrap">' + fmt.dateShort(a.echeance) + (d <= 7 ? ' <span class="muted">(J-' + d + ')</span>' : '') + '</span>'; }
  var ACT_COLS = [
    { label: 'N°', render: function (a) { return '<b class="nowrap' + (actLate(a) ? ' late' : '') + '">' + a.id + '</b>'; }, csv: function (a) { return a.id; } },
    { label: 'Action', render: function (a) { return '<div class="hse-cell"><b>' + esc(a.libelle) + '</b><div class="small muted">' + esc(srcLabel(a.source)) + '</div></div>'; }, csv: function (a) { return a.libelle; } },
    { label: 'Responsable', render: function (a) { return '<span class="nowrap">' + esc(E.empName(a.responsable)) + '</span>'; }, csv: function (a) { return E.empName(a.responsable); } },
    { label: 'Priorité', render: function (a) { return ui.badge(a.priorite); }, csv: function (a) { return a.priorite; } },
    { label: 'Échéance', render: echeanceHtml, csv: function (a) { return a.echeance; } },
    { label: 'Statut', render: function (a) { return actLate(a) ? ui.badge('En retard', 'red') : ui.badge(a.statut, a.statut === 'Réalisée' ? 'green' : a.statut === 'En cours' ? 'blue' : 'orange'); }, csv: function (a) { return actLate(a) ? 'En retard' : a.statut; } }
  ];
  function actList(list) { return '<div class="list">' + (list.length ? list.map(function (a) { return '<a class="list__item" href="#/hse/actions" style="color:inherit"><div class="list__icon tone-red">' + icon('flag') + '</div><div class="list__body"><b>' + esc(a.libelle) + '</b><div class="small muted">' + a.id + ' · ' + esc(E.empName(a.responsable)) + '</div><div class="small">' + echeanceHtml(a) + '</div></div></a>'; }).join('') : '<div class="empty">Aucune action en retard</div>') + '</div>'; }
  function actTable(list) { return '<div class="hse-acts">' + ui.table(ACT_COLS, list, { empty: 'Aucune action corrective', onRow: function (a) { editAction(a); } }) + '</div>'; }
  function bindActRows() {}
  function editAction(a) {
    ui.modal({ title: a.id + ' · Action corrective', sub: esc(srcLabel(a.source)), body: '<dl class="kv"><dt>Action</dt><dd>' + esc(a.libelle) + '</dd><dt>Responsable</dt><dd>' + esc(E.empName(a.responsable)) + '</dd><dt>Échéance</dt><dd>' + echeanceHtml(a) + '</dd><dt>Priorité</dt><dd>' + ui.badge(a.priorite) + '</dd><dt>Statut</dt><dd>' + ui.badge(a.statut) + '</dd>' + (a.realiseeLe ? '<dt>Réalisée le</dt><dd>' + fmt.date(a.realiseeLe) + '</dd>' : '') + '</dl>' +
      (a.statut !== 'Réalisée' ? '<div class="field" style="margin-top:14px"><label>Reporter l\'échéance</label><input class="input" type="date" id="ac-ech" value="' + a.echeance + '"></div>' : ''),
      actions: a.statut === 'Réalisée' ? [{ label: 'Rouvrir', onClick: function (c) { a.statut = 'En cours'; delete a.realiseeLe; S.save(); c(); ui.toast('Action rouverte'); E.rerender(); } }, { label: 'Fermer', cls: 'primary' }] :
        [{ label: 'Enregistrer l\'échéance', onClick: function (c, root) { var v = $('#ac-ech', root).value; if (v && v !== a.echeance) { E.log('Échéance reportée ' + a.id, a.echeance + ' → ' + v); a.echeance = v; S.save(); ui.toast('Échéance mise à jour'); } c(); E.rerender(); } },
          a.statut === 'À faire' ? { label: 'Démarrer', cls: 'primary', onClick: function (c) { a.statut = 'En cours'; S.save(); E.log('Action démarrée ' + a.id, a.libelle); c(); ui.toast('Action en cours'); E.rerender(); } } : null,
          { label: 'Marquer réalisée', cls: 'success', icon: 'check', onClick: function (c) { a.statut = 'Réalisée'; a.realiseeLe = E.today(); S.save(); E.log('Action réalisée ' + a.id, a.libelle); c(); ui.toast('Action réalisée'); E.rerender(); } }].filter(Boolean) });
  }
  function newAction(source, after) {
    var srcs = [{ v: '', l: 'Autre (initiative HSE)' }].concat(S.all('incidents').filter(function (i) { return i.statut !== 'Clôturé'; }).map(function (i) { return { v: i.id, l: i.id + ' · ' + i.titre }; })).concat(S.all('audits').filter(function (a) { return a.statut === 'Réalisé'; }).map(function (a) { return { v: a.id, l: a.id + ' · ' + a.theme }; }));
    ui.formModal({ title: 'Nouvelle action corrective', fields: [{ name: 'libelle', label: 'Action', type: 'textarea', required: true }, { name: 'source', label: 'Origine', type: 'select', options: srcs, value: source || '', full: true }, { name: 'responsable', label: 'Responsable', type: 'select', options: empOpts(), value: M(12), required: true }, { name: 'echeance', label: 'Échéance', type: 'date', value: D(30), required: true }, { name: 'priorite', label: 'Priorité', type: 'select', options: ['Haute', 'Moyenne', 'Basse'], value: 'Moyenne' }],
      onSubmit: function (v) { var a = { id: nextId('actionsHSE', 'ACT-' + yr() + '-', 3), source: v.source, libelle: v.libelle, responsable: v.responsable, echeance: v.echeance, priorite: v.priorite, statut: 'À faire', creee: E.today() }; S.add('actionsHSE', a); if (after) after(a); E.log('Action corrective ' + a.id, a.libelle); E.notify('Action corrective assignée', a.libelle, '#/hse/actions', 'blue'); ui.toast('Action ' + a.id + ' créée'); E.rerender(); } });
  }
  function tabActions(el) {
    var all = S.all('actionsHSE'), st = state.act, late = all.filter(actLate);
    var open = all.filter(function (a) { return a.statut !== 'Réalisée'; }), done = all.filter(function (a) { return a.statut === 'Réalisée'; });
    el.innerHTML = '<div class="grid g4">' + ui.kpi({ label: 'Actions ouvertes', value: open.length, icon: 'list', tone: 'blue', foot: open.filter(function (a) { return a.priorite === 'Haute'; }).length + ' de priorité haute' }) +
      ui.kpi({ label: 'En retard', value: late.length, icon: 'alert', tone: 'red', foot: late.length ? 'jusqu\'à ' + Math.max.apply(null, late.map(function (a) { return E.daysBetween(a.echeance, E.today()); })) + ' j de retard' : 'aucune' }) +
      ui.kpi({ label: 'Réalisées', value: done.length, icon: 'check', tone: 'green', foot: 'sur ' + all.length + ' actions' }) +
      ui.kpi({ label: 'Taux de réalisation dans les délais', value: Math.round(done.length / Math.max(1, done.length + late.length) * 100), unit: '%', icon: 'target', tone: 'violet', foot: 'objectif 90 %' }) + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Plan d\'actions HSE</h3><div class="spacer"></div><button class="btn sm" id="ac-csv">' + icon('download') + 'Export CSV</button><button class="btn primary sm" id="ac-new">' + icon('plus') + 'Nouvelle action</button></div>' +
      '<div class="card__b" style="padding-bottom:0"><div class="filters"><div class="chips" id="ac-st">' + [['ouvertes', 'Ouvertes'], ['retard', 'En retard'], ['realisees', 'Réalisées'], ['toutes', 'Toutes']].map(function (c) { return '<button class="chip' + (st.st === c[0] ? ' is-active' : '') + '" data-k="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<select class="select" id="ac-resp"><option value="">Tous les responsables</option>' + Object.keys(E.groupBy(all, 'responsable')).map(function (r) { return '<option value="' + r + '"' + (st.resp === r ? ' selected' : '') + '>' + esc(E.empName(r)) + '</option>'; }).join('') + '</select></div></div><div id="ac-list"></div></div>';
    function rows() { return all.filter(function (a) { return (!st.resp || a.responsable === st.resp) && (st.st === 'toutes' || (st.st === 'ouvertes' && a.statut !== 'Réalisée') || (st.st === 'retard' && actLate(a)) || (st.st === 'realisees' && a.statut === 'Réalisée')); }).sort(function (a, b) { return a.echeance.localeCompare(b.echeance); }); }
    function draw() { $('#ac-list', el).innerHTML = actTable(rows()); }
    draw();
    $$('#ac-st .chip', el).forEach(function (b) { b.onclick = function () { st.st = b.dataset.k; $$('#ac-st .chip', el).forEach(function (x) { x.classList.toggle('is-active', x === b); }); draw(); }; });
    $('#ac-resp', el).onchange = function (e) { st.resp = e.target.value; draw(); };
    $('#ac-csv', el).onclick = function () { ui.exportCSV('actions-correctives-hse', ACT_COLS.concat([{ label: 'Origine', csv: function (a) { return srcLabel(a.source); } }]), rows()); };
    $('#ac-new', el).onclick = function () { newAction(''); };
  }

  /* ------------------------------------------------------------------ Indicateurs */
  function bird(r) {
    var inc = r.inc, cnt = function (types) { return inc.filter(function (i) { return types.indexOf(i.type) >= 0; }).length; };
    var obs = E.sum(S.all('hseMois'), 'observations');
    var tiers = [['Accidents graves / mortels', 0, '#7f1d1d'], ['Accidents avec arrêt', cnt(['AAA']), '#d93636'], ['Accidents sans arrêt / soins', cnt(['ASA']), '#e8780c'], ['Presque-accidents & incidents sans blessé', cnt(['PA', 'FEU', 'FUI', 'ENV']), '#f5c400'], ['Situations dangereuses & observations terrain', cnt(['SD']) + obs, '#1e9e4a']];
    var w = [7, 26, 45, 64, 82, 100];
    return '<div class="hse-bird">' + tiers.map(function (t, i) { var a = w[i], b = w[i + 1], inset = (1 - a / b) / 2 * 100; return '<div class="hse-bird__p"><div style="width:' + b + '%;background:' + t[2] + ';clip-path:polygon(' + inset + '% 0,' + (100 - inset) + '% 0,100% 100%,0 100%)"><b>' + t[1] + '</b></div></div><div class="hse-bird__l"><b>' + t[1] + '</b> ' + esc(t[0]) + '</div>'; }).join('') + '</div><div class="small muted" style="margin-top:8px">12 derniers mois · base : registre des événements + ' + obs + ' cartes d\'observation terrain. Ratio de Bird de référence 1 / 10 / 30 / 600.</div>';
  }
  function tabIndic(el) {
    var r = rates(), ms = months12(), mois = S.all('hseMois');
    var mk = function (types) { return ms.map(function (m) { return r.inc.filter(function (i) { return i.date.slice(0, 7) === m.key && types.indexOf(i.type) >= 0; }).length; }); };
    var byType = E.groupBy(permis(), 'type'), mm = function (k) { var x = mois.find(function (m) { return m.id === k; }); return x || {}; };
    var late = lateActions();
    el.innerHTML = '<div class="grid hse-ov">' + counterCard() + '<div class="grid g2 hse-ov__k">' +
      ui.kpi({ label: 'TF1 (avec arrêt)', value: num(r.tf1, 2), icon: 'trend', tone: 'red', foot: r.aaa + ' AAA / ' + fmt.short(r.h) + ' h travaillées' }) +
      ui.kpi({ label: 'TF2 (avec + sans arrêt)', value: num(r.tf2, 2), icon: 'trend', tone: 'orange', foot: (r.aaa + r.asa) + ' accidents sur 12 mois' }) +
      ui.kpi({ label: 'TG (gravité)', value: num(r.tg, 3), icon: 'chart', tone: 'violet', foot: r.jp + ' jours perdus' }) +
      ui.kpi({ label: 'Heures travaillées', value: fmt.short(r.h), icon: 'clock', tone: 'blue', foot: 'dont ' + fmt.short(E.sum(mois, 'heuresEE')) + ' entreprises ext.' }) + '</div></div>' +
      '<p class="small muted" style="margin:8px 2px 0">TF1 = AAA × 10⁶ / heures travaillées · TF2 = (AAA + ASA) × 10⁶ / heures · TG = jours perdus × 10³ / heures — personnel SOGARA et entreprises extérieures.</p>' +
      '<div class="grid g2 keep-1" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Pyramide de Bird</h3></div><div class="card__b">' + bird(r) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Évolution mensuelle des événements</h3></div><div class="card__b">' + ui.bars({ labels: ms.map(function (m) { return m.l; }), stacked: true, height: 240, series: [{ name: 'Accidents (AAA + ASA)', values: mk(['AAA', 'ASA']), color: '#d93636' }, { name: 'Presque-accidents & incidents', values: mk(['PA', 'FEU', 'FUI']), color: '#f5c400' }, { name: 'Situations dangereuses', values: mk(['SD']), color: '#2563eb' }, { name: 'Environnement', values: mk(['ENV']), color: '#1e9e4a' }] }) + '</div></div></div>' +
      '<div class="grid g3" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Permis émis par type</h3><span class="sub">registre actuel</span></div><div class="card__b">' + ui.donut(TYPE_KEYS.filter(function (k) { return byType[k]; }).map(function (k) { return { label: TYPES[k].s, value: byType[k].length, color: TYPES[k].c }; }), { sub: 'permis' }) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Prévention terrain</h3><span class="sub">par mois</span></div><div class="card__b">' + ui.bars({ labels: ms.map(function (m) { return m.l; }), height: 200, series: [{ name: 'Cartes d\'observation', values: ms.map(function (m) { return mm(m.key).observations || 0; }), color: '#1e9e4a' }, { name: 'Quarts d\'heure sécurité', values: ms.map(function (m) { return mm(m.key).qhs || 0; }), color: '#0f2d5c' }] }) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Permis de travail émis</h3><span class="sub">par mois</span></div><div class="card__b">' + ui.line({ labels: ms.map(function (m) { return m.l; }), height: 200, series: [{ name: 'Permis émis', values: ms.map(function (m) { return mm(m.key).permis || 0; }), color: '#d93636' }] }) + '</div></div></div>' +
      '<div class="grid g2 keep-1" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Actions en retard</h3><span class="badge tone-red">' + late.length + '</span><div class="spacer"></div><a class="btn ghost sm" href="#/hse/actions">Plan d\'actions</a></div>' + actList(late) + '</div>' +
      '<div class="card"><div class="card__h"><h3>Visites & audits sécurité</h3><div class="spacer"></div><a class="btn ghost sm" href="#/hse/audits">Tout voir</a></div><div class="card__b">' + auditSummary() + '</div></div></div>';
  }
  function auditSummary() {
    var done = S.all('audits').filter(function (a) { return a.statut === 'Réalisé'; }), by = E.groupBy(done, 'type');
    return '<div class="hse-audsum">' + Object.keys(by).map(function (k) { var avg = E.sum(by[k], 'score') / by[k].length; return '<div><div class="row"><b>' + esc(k) + '</b><span class="muted small">' + by[k].length + ' réalisé(s) · ' + E.sum(by[k], 'ecarts') + ' écart(s)</span></div>' + ui.progress(avg, avg >= 85 ? 'green' : avg >= 75 ? 'orange' : 'red') + '</div>'; }).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ Visites & audits */
  var AUD_TYPES = ['Visite terrain', 'Quart d\'heure sécurité', 'Audit entreprise extérieure', 'Audit permis de travail', 'Exercice POI'];
  var AUD_COLS = [
    { label: 'N°', render: function (a) { return '<b class="nowrap">' + a.id + '</b>'; }, csv: function (a) { return a.id; } },
    { label: 'Date', render: function (a) { return '<span class="nowrap">' + fmt.dateShort(a.date) + '</span>'; }, csv: function (a) { return a.date; } },
    { label: 'Type', render: function (a) { return esc(a.type); }, csv: function (a) { return a.type; } },
    { label: 'Thème', render: function (a) { return '<div class="hse-cell"><b>' + esc(a.theme) + '</b><div class="small muted">' + esc(a.unite + (a.entreprise ? ' · ' + ent(a.entreprise) : '')) + '</div></div>'; }, csv: function (a) { return a.theme; } },
    { label: 'Auditeur', render: function (a) { return '<span class="nowrap">' + esc(E.empName(a.auditeur)) + '</span>'; }, csv: function (a) { return E.empName(a.auditeur); } },
    { label: 'Score', render: function (a) { return a.score == null ? '<span class="muted small">—</span>' : '<span class="hse-score ' + (a.score >= 85 ? 'ok' : a.score >= 75 ? 'warn' : 'bad') + '">' + a.score + ' %</span>'; }, csv: function (a) { return a.score; } },
    { label: 'Écarts', num: true, render: function (a) { return a.ecarts == null ? '—' : a.ecarts; }, csv: function (a) { return a.ecarts; } },
    { label: 'Statut', render: function (a) { return ui.badge(a.statut, a.statut === 'Réalisé' ? 'green' : 'violet'); }, csv: function (a) { return a.statut; } }
  ];
  function tabAudits(el) {
    var all = S.all('audits'), st = state.aud, done = all.filter(function (a) { return a.statut === 'Réalisé'; }), plan = all.filter(function (a) { return a.statut === 'Planifié'; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
    var maj = E.sum(done, function (a) { return a.constats.filter(function (c) { return c.niv === 'Majeur'; }).length; });
    el.innerHTML = '<div class="grid g4">' + ui.kpi({ label: 'Visites & audits réalisés', value: done.length, icon: 'eye', tone: 'blue', foot: 'derniers 90 jours' }) +
      ui.kpi({ label: 'Score moyen', value: Math.round(E.sum(done, 'score') / Math.max(1, done.length)), unit: '%', icon: 'target', tone: 'green', foot: 'objectif ≥ 85 %' }) +
      ui.kpi({ label: 'Écarts relevés', value: E.sum(done, 'ecarts'), icon: 'flag', tone: 'orange', foot: maj + ' écart(s) majeur(s)' }) +
      ui.kpi({ label: 'Prochaine visite', value: plan[0] ? fmt.dateShort(plan[0].date) : '—', icon: 'calendar', tone: 'violet', foot: plan[0] ? esc(plan[0].type) : '' }) + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Programme de visites et d\'audits sécurité</h3><div class="spacer"></div><button class="btn sm" id="au-csv">' + icon('download') + 'Export CSV</button><button class="btn primary sm" id="au-new">' + icon('plus') + 'Planifier</button></div>' +
      '<div class="card__b" style="padding-bottom:0"><div class="chips" id="au-t" style="margin-bottom:14px">' + [''].concat(AUD_TYPES).map(function (t) { return '<button class="chip' + (st.type === t ? ' is-active' : '') + '" data-k="' + esc(t) + '">' + esc(t || 'Tous') + '</button>'; }).join('') + '</div></div><div id="au-list"></div></div>';
    function rows() { return all.filter(function (a) { return !st.type || a.type === st.type; }).sort(function (a, b) { return b.date.localeCompare(a.date); }); }
    function draw() { $('#au-list', el).innerHTML = ui.table(AUD_COLS, rows(), { onRow: openAudit }); }
    draw();
    $$('#au-t .chip', el).forEach(function (b) { b.onclick = function () { st.type = b.dataset.k; $$('#au-t .chip', el).forEach(function (x) { x.classList.toggle('is-active', x === b); }); draw(); }; });
    $('#au-csv', el).onclick = function () { ui.exportCSV('visites-audits-hse', AUD_COLS, rows()); };
    $('#au-new', el).onclick = function () {
      ui.formModal({ title: 'Planifier une visite / un audit', fields: [{ name: 'type', label: 'Type', type: 'select', options: AUD_TYPES, required: true }, { name: 'date', label: 'Date', type: 'date', value: D(7), required: true }, { name: 'theme', label: 'Thème', required: true, full: true }, { name: 'unite', label: 'Unité', type: 'select', options: uniteOpts() }, { name: 'entreprise', label: 'Entreprise auditée (si EE)', type: 'select', options: [{ v: '', l: '—' }].concat(E.options('fournisseurs')) }, { name: 'auditeur', label: 'Auditeur / animateur', type: 'select', options: empOpts(), value: M(4) }],
        onSubmit: function (v) { var a = Object.assign({ id: nextId('audits', 'AUD-' + yr() + '-', 3), statut: 'Planifié', score: null, ecarts: null, constats: [] }, v); S.add('audits', a); E.log('Audit planifié ' + a.id, a.theme); ui.toast('Visite ' + a.id + ' planifiée'); E.rerender(); } });
    };
  }
  function openAudit(a) {
    if (a.statut === 'Planifié') {
      var body = '<dl class="kv"><dt>Type</dt><dd>' + esc(a.type) + '</dd><dt>Thème</dt><dd>' + esc(a.theme) + '</dd><dt>Date</dt><dd>' + fmt.date(a.date) + '</dd><dt>Auditeur</dt><dd>' + esc(E.empName(a.auditeur)) + '</dd></dl><h4 class="hse-h4">Saisir le résultat</h4>' +
        ui.form([{ name: 'score', label: 'Score de conformité (%)', type: 'number', min: 0, value: 85, required: true }, { name: 'constats', label: 'Écarts / constats (un par ligne, préfixer « ! » pour un écart majeur)', type: 'textarea' }]);
      return ui.modal({ title: a.id + ' · ' + a.type, body: body, actions: [{ label: 'Fermer' }, { label: 'Enregistrer le résultat', cls: 'primary', icon: 'check', onClick: function (c, root) {
        var v = ui.readForm(root); if (!v) return;
        a.constats = String(v.constats || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean).map(function (s) { return s[0] === '!' ? { txt: s.slice(1).trim(), niv: 'Majeur' } : { txt: s, niv: 'Mineur' }; });
        a.score = Math.max(0, Math.min(100, v.score)); a.ecarts = a.constats.length; a.statut = 'Réalisé'; if (a.date > E.today()) a.date = E.today(); S.save(); E.log('Audit réalisé ' + a.id, a.score + ' %'); c(); ui.toast('Résultat enregistré'); E.rerender();
      } }] });
    }
    var acts = S.all('actionsHSE').filter(function (x) { return x.source === a.id; });
    var m = ui.modal({ title: a.id + ' · ' + a.type, sub: fmt.date(a.date) + ' · ' + esc(a.unite) + (a.entreprise ? ' · ' + esc(ent(a.entreprise)) : ''), body:
      '<div class="row" style="gap:16px;align-items:center"><div style="width:150px">' + ui.gauge(a.score, 'Score', a.score >= 85 ? '#1e9e4a' : a.score >= 75 ? '#e8780c' : '#d93636') + '</div><div style="flex:1;min-width:200px"><b>' + esc(a.theme) + '</b><div class="small muted">Auditeur : ' + esc(E.empName(a.auditeur)) + '</div><div class="small muted">' + a.ecarts + ' écart(s) · ' + acts.length + ' action(s) corrective(s)</div></div></div>' +
      '<h4 class="hse-h4">Constats</h4>' + (a.constats.length ? '<div class="list hse-constats">' + a.constats.map(function (c, k) { return '<div class="list__item"><div class="list__icon tone-' + (c.niv === 'Majeur' ? 'red' : c.niv === 'Mineur' ? 'orange' : 'blue') + '">' + icon(c.niv === 'Observation' ? 'eye' : 'flag') + '</div><div class="list__body"><b>' + esc(c.txt) + '</b><div class="small muted">' + esc(c.niv) + '</div></div>' + (c.niv !== 'Observation' ? '<button class="btn sm" data-ca="' + k + '">' + icon('plus') + 'Action</button>' : '') + '</div>'; }).join('') + '</div>' : '<div class="muted">Aucun écart relevé.</div>') +
      (acts.length ? '<h4 class="hse-h4">Actions liées</h4>' + acts.map(function (x) { return '<div class="small">• ' + x.id + ' — ' + esc(x.libelle) + ' (' + (actLate(x) ? '<span class="late">en retard</span>' : esc(x.statut)) + ')</div>'; }).join('') : ''),
      actions: [{ label: 'Fermer', cls: 'primary' }] });
    $$('[data-ca]', m.el).forEach(function (b) { b.onclick = function () { var c = a.constats[+b.dataset.ca]; m.close(); newAction(a.id); setTimeout(function () { var t = document.querySelector('.modal textarea[name="libelle"]'); if (t) t.value = 'Corriger : ' + c.txt; }, 30); }; });
  }

  /* ------------------------------------------------------------------ Environnement */
  function tabEnv(el) {
    var rj = S.all('envRejets'), mg = S.all('envMangrove'), dc = S.all('envDechets').slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    var last = rj[rj.length - 1] || {}, ms = months12();
    var lab = function (k) { var x = ms.find(function (m) { return m.key === k; }); return x ? x.l : k; };
    var dang = dc.filter(function (d) { return d.categorie === 'Dangereux'; }), tot = E.sum(dc, 'quantite'), valo = E.sum(dc.filter(function (d) { return /valoris|recycl|régén/i.test(d.filiere); }), 'quantite');
    var alertSt = mg.filter(function (m) { return m.statut !== 'Conforme' && m.statut !== 'Référence'; });
    el.innerHTML = '<div class="grid g4">' + ui.kpi({ label: 'Hydrocarbures dans les eaux rejetées', value: num(last.hc, 1), unit: 'mg/l', icon: 'drop', tone: last.hc > 10 ? 'red' : last.hc > 7 ? 'orange' : 'green', foot: 'limite réglementaire 10 mg/l' }) +
      ui.kpi({ label: 'Torchage du mois', value: last.torchage, unit: 't', icon: 'fire', tone: 'orange', foot: 'moyenne 12 mois ' + Math.round(E.sum(rj, 'torchage') / Math.max(1, rj.length)) + ' t' }) +
      ui.kpi({ label: 'Déchets évacués / stockés', value: num(tot, 1), unit: 't', icon: 'box', tone: 'violet', foot: num(E.sum(dang, 'quantite'), 1) + ' t de déchets dangereux' }) +
      ui.kpi({ label: 'Taux de valorisation', value: Math.round(valo / Math.max(1, tot) * 100), unit: '%', icon: 'refresh', tone: 'green', foot: 'objectif 60 %' }) + '</div>' +
      (alertSt.length ? '<div style="margin-top:16px">' + alertBox('orange', 'globe', '<b>Surveillance de la mangrove :</b> ' + alertSt.map(function (m) { return esc(m.station) + ' — ' + esc(m.statut.toLowerCase()); }).join(' ; ') + '.') + '</div>' : '') +
      '<div class="grid g2 keep-1" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Hydrocarbures dans les eaux rejetées</h3><span class="sub">moyenne mensuelle, sortie séparateur</span></div><div class="card__b">' + ui.line({ labels: rj.map(function (r) { return lab(r.id); }), height: 210, series: [{ name: 'HC (mg/l)', values: rj.map(function (r) { return r.hc; }), color: '#0f2d5c' }, { name: 'Limite 10 mg/l', values: rj.map(function () { return 10; }), color: '#d93636', dash: true }] }) + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Torchage</h3><span class="sub">tonnes de gaz brûlées par mois</span></div><div class="card__b">' + ui.bars({ labels: rj.map(function (r) { return lab(r.id); }), height: 210, series: [{ name: 'Torchage (t)', values: rj.map(function (r) { return r.torchage; }), color: '#e8780c' }] }) + '</div></div></div>' +
      '<div class="card" style="margin-top:16px"><div class="card__h"><h3>Suivi des rejets aqueux</h3><span class="sub">6 derniers mois · analyses laboratoire</span></div>' + ui.table([
        { label: 'Mois', render: function (r) { return '<b>' + esc(fmt.month(r.id + '-01')) + '</b>'; } },
        { label: 'HC (mg/l)', num: true, render: function (r) { return '<span class="gz ' + (r.hc > 10 ? 'bad' : r.hc > 7 ? 'warn' : 'ok') + '">' + num(r.hc, 1) + '</span>'; } },
        { label: 'DCO (mg/l)', num: true, render: function (r) { return '<span class="gz ' + (r.dco > 125 ? 'bad' : 'ok') + '">' + r.dco + '</span>'; } },
        { label: 'MES (mg/l)', num: true, render: function (r) { return '<span class="gz ' + (r.mes > 35 ? 'bad' : 'ok') + '">' + r.mes + '</span>'; } },
        { label: 'pH', num: true, render: function (r) { return num(r.ph, 1); } },
        { label: 'Volume rejeté (m³)', num: true, render: function (r) { return fmt.num(r.volume); } }], rj.slice(-6).reverse()) + '<div class="small muted" style="padding:10px 18px">Limites de rejet : HC 10 mg/l · DCO 125 mg/l · MES 35 mg/l · pH 5,5 – 8,5.</div></div>' +
      '<div class="grid g2 keep-1" style="margin-top:16px"><div class="card"><div class="card__h"><h3>Surveillance de la mangrove</h3><div class="spacer"></div><button class="btn sm" id="mg-new">' + icon('plus') + 'Observation</button></div><div class="list">' +
      mg.map(function (m) { var tone = m.statut === 'Conforme' ? 'green' : m.statut === 'Référence' ? 'grey' : 'orange'; return '<div class="list__item"><div class="list__icon tone-' + tone + '">' + icon('globe') + '</div><div class="list__body"><div class="row" style="gap:6px"><b>' + esc(m.station) + '</b>' + ui.badge(m.statut, tone) + '</div><div class="small muted">' + fmt.date(m.date) + ' · HC sédiments ' + m.hc + ' mg/kg · végétation : ' + esc(m.vegetation) + ' · ' + esc(m.faune) + '</div>' + (m.obs ? '<div class="small">' + esc(m.obs) + '</div>' : '') + '</div></div>'; }).join('') + '</div></div>' +
      '<div class="card"><div class="card__h"><h3>Registre des déchets</h3><div class="spacer"></div><button class="btn sm" id="dc-csv">' + icon('download') + 'CSV</button><button class="btn sm" id="dc-new">' + icon('plus') + 'Enlèvement</button></div>' + ui.table(DC_COLS, dc) + '</div></div>';
    $('#dc-csv', el).onclick = function () { ui.exportCSV('registre-dechets', DC_COLS, dc); };
    $('#dc-new', el).onclick = function () {
      ui.formModal({ title: 'Enregistrer un enlèvement de déchets', fields: [{ name: 'type', label: 'Nature du déchet', required: true, full: true }, { name: 'categorie', label: 'Catégorie', type: 'select', options: ['Dangereux', 'Non dangereux'] }, { name: 'quantite', label: 'Quantité (t)', type: 'number', step: '0.1', value: 1, required: true }, { name: 'filiere', label: 'Filière', type: 'select', options: ['Valorisation matière', 'Recyclage', 'Régénération', 'Incinération', 'Centre de traitement agréé', 'Biocentre (traitement biologique)', 'Enfouissement (CET)'] }, { name: 'prestataire', label: 'Prestataire', value: 'Gabon Recyclage Industriel (démo)' }, { name: 'date', label: 'Date', type: 'date', value: E.today() }, { name: 'statut', label: 'Statut', type: 'select', options: ['Enlevé', 'En attente d\'enlèvement', 'Stocké sur site'] }],
        onSubmit: function (v) { v.id = nextId('envDechets', 'BSD-' + yr() + '-', 3); S.add('envDechets', v); E.log('Déchets ' + v.id, v.type + ' · ' + v.quantite + ' t'); ui.toast('Bordereau ' + v.id + ' enregistré'); E.rerender(); } });
    };
    $('#mg-new', el).onclick = function () {
      ui.formModal({ title: 'Observation de la mangrove', fields: [{ name: 'id', label: 'Station', type: 'select', options: mg.map(function (m) { return { v: m.id, l: m.station }; }), full: true }, { name: 'date', label: 'Date', type: 'date', value: E.today() }, { name: 'hc', label: 'HC sédiments (mg/kg)', type: 'number', value: 150 }, { name: 'vegetation', label: 'État de la végétation', type: 'select', options: ['Bon', 'Stress léger', 'Dégradé'] }, { name: 'statut', label: 'Statut', type: 'select', options: ['Conforme', 'Surveillance renforcée', 'Non conforme'] }, { name: 'obs', label: 'Observations', type: 'textarea' }],
        onSubmit: function (v) { var m = S.get('envMangrove', v.id); Object.assign(m, { date: v.date, hc: v.hc, vegetation: v.vegetation, statut: v.statut, obs: v.obs || m.obs }); S.save(); E.log('Observation mangrove', m.station); ui.toast('Observation enregistrée'); E.rerender(); } });
    };
  }
  var DC_COLS = [
    { label: 'Bordereau', render: function (d) { return '<b class="nowrap">' + d.id + '</b><div class="small muted">' + fmt.dateShort(d.date) + '</div>'; }, csv: function (d) { return d.id; } },
    { label: 'Déchet', render: function (d) { return '<div class="hse-cell"><b>' + esc(d.type) + '</b><div class="small muted">' + esc(d.filiere) + '</div></div>'; }, csv: function (d) { return d.type + ' — ' + d.filiere; } },
    { label: 'Quantité', num: true, render: function (d) { return num(d.quantite, 1) + ' t'; }, csv: function (d) { return d.quantite; } },
    { label: 'Catégorie', render: function (d) { return ui.badge(d.categorie, d.categorie === 'Dangereux' ? 'red' : 'grey'); }, csv: function (d) { return d.categorie; } }
  ];

  /* ================================================================== enregistrement */
  E.register({
    id: 'hse', label: 'HSE & permis', title: 'HSE — Permis de travail & prévention', icon: 'shield', group: 'Opérations', roles: ['hse', 'projets'],
    seed: seed, init: init, render: render,
    summary: function () {
      var a = actifs(), feu = a.filter(function (p) { return p.type === 'FEU'; }).length, late = lateActions().length;
      return [{ label: 'Jours sans accident avec arrêt', value: String(joursSans()), icon: 'shield', tone: 'green', foot: 'Record du site : ' + Math.max(412, joursSans()) + ' jours', href: '#/hse/indicateurs' },
        { label: 'Permis de travail actifs', value: String(a.length), icon: 'helmet', tone: feu ? 'red' : 'blue', foot: feu + ' permis de feu en cours', href: '#/hse' },
        { label: 'Actions HSE en retard', value: String(late), icon: 'alert', tone: late ? 'orange' : 'green', foot: S.all('actionsHSE').filter(function (x) { return x.statut !== 'Réalisée'; }).length + ' actions ouvertes', href: '#/hse/actions' }];
    },
    pending: function (u) {
      var out = [], hse = u && (u.profile === 'hse' || u.profile === 'admin');
      if (hse) {
        permis().filter(function (p) { return p.statut === 'Préparé'; }).forEach(function (p) { var bl = authChecks(p).some(function (c) { return !c.ok; }); out.push({ title: p.id + ' · ' + TYPES[p.type].s + ' — ' + p.equipement, sub: 'À autoriser' + (bl ? ' (contrôle bloquant)' : '') + ' · ' + uName(p.unite) + ' · ' + ent(p.entreprise), date: p.debut.slice(0, 10), href: '#/hse/permis/' + p.id, tone: p.type === 'FEU' ? 'red' : 'orange', icon: p.type === 'FEU' ? 'fire' : 'shield' }); });
        permis().filter(function (p) { return p.statut === 'Demandé'; }).forEach(function (p) { out.push({ title: p.id + ' · ' + TYPES[p.type].s + ' — ' + p.equipement, sub: 'Demande à préparer · demandé par ' + E.empName(p.demandeur), date: p.debut.slice(0, 10), href: '#/hse/permis/' + p.id, tone: 'violet', icon: 'edit' }); });
      }
      S.all('plansPrevention').filter(function (p) { return p.statut === 'Inspection commune'; }).forEach(function (p) { out.push({ title: p.id + ' · Plan de prévention à signer', sub: ent(p.entreprise) + ' · ' + p.travaux, date: p.debut, href: '#/hse/prevention/' + p.id, tone: 'orange', icon: 'doc' }); });
      lateActions().forEach(function (a) { out.push({ title: a.id + ' · Action HSE en retard', sub: a.libelle + ' · ' + E.empName(a.responsable), date: a.echeance, href: '#/hse/actions', tone: 'red', icon: 'alert' }); });
      return out;
    },
    search: function (q) {
      var out = [];
      permis().forEach(function (p) { if (E.norm([p.id, p.equipement, p.description, p.ot, TYPES[p.type].l, ent(p.entreprise)].join(' ')).indexOf(q) >= 0) out.push({ title: p.id + ' · ' + TYPES[p.type].s, sub: p.equipement + ' · ' + p.statut, href: '#/hse/permis/' + p.id }); });
      S.all('plansPrevention').forEach(function (p) { if (E.norm([p.id, p.travaux, ent(p.entreprise)].join(' ')).indexOf(q) >= 0) out.push({ title: p.id + ' · Plan de prévention', sub: ent(p.entreprise) + ' · ' + p.statut, href: '#/hse/prevention/' + p.id }); });
      S.all('incidents').forEach(function (i) { if (E.norm([i.id, i.titre, i.lieu, EVT[i.type].l].join(' ')).indexOf(q) >= 0) out.push({ title: i.id + ' · ' + i.titre, sub: EVT[i.type].l + ' · ' + fmt.date(i.date), href: '#/hse/evenements/' + i.id }); });
      S.all('actionsHSE').forEach(function (a) { if (E.norm(a.id + ' ' + a.libelle).indexOf(q) >= 0) out.push({ title: a.id + ' · Action HSE', sub: a.libelle, href: '#/hse/actions' }); });
      return out;
    },
    badge: function () { return permis().filter(function (p) { return p.statut === 'Préparé' || p.statut === 'Demandé'; }).length; }
  });
})();
