/* SOGARA · Espace de gestion — noyau (données, session, navigation, composants).
   Démonstration 100 % navigateur : les données sont enregistrées dans le localStorage
   (clé sogara_erp_v1). En production, ces mêmes écrans se branchent sur une base de données
   sécurisée (comptes nominatifs, sauvegardes, droits par rôle). */
(function () {
  'use strict';
  var KEY = 'sogara_erp_v1', SESSION = 'sogara_erp_session';
  var TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);

  /* ------------------------------------------------------------------ utils */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(v) { return v == null ? '' : String(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function uid(prefix) { return (prefix || 'ID') + '-' + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2, 5).toUpperCase(); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function sum(arr, f) { return arr.reduce(function (a, x) { return a + (+(typeof f === 'function' ? f(x) : f == null ? x : x[f]) || 0); }, 0); }
  function groupBy(arr, f) { var o = {}; arr.forEach(function (x) { var k = typeof f === 'function' ? f(x) : x[f]; (o[k] = o[k] || []).push(x); }); return o; }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function parseDate(d) { if (!d) return null; if (d instanceof Date) return d; var p = String(d).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function iso(d) { d = parseDate(d); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(d, n) { d = new Date(parseDate(d)); d.setDate(d.getDate() + n); return iso(d); }
  function daysBetween(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 864e5); }

  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var fmt = {
    num: function (n, dec) { if (n == null || isNaN(n)) return '—'; return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 }).replace(/ /g, ' '); },
    money: function (n) { return n == null || isNaN(n) ? '—' : fmt.num(Math.round(n)) + ' FCFA'; },
    /* 1 250 000 000 -> « 1,25 Md » ; 45 000 000 -> « 45 M » */
    short: function (n) { if (n == null || isNaN(n)) return '—'; var a = Math.abs(n); if (a >= 1e9) return fmt.num(n / 1e9, a >= 1e11 ? 0 : a >= 1e10 ? 1 : 2) + ' Md'; if (a >= 1e6) return fmt.num(n / 1e6, a >= 1e8 ? 0 : 1) + ' M'; if (a >= 1e3) return fmt.num(n / 1e3, 0) + ' k'; return fmt.num(n); },
    date: function (d) { d = parseDate(d); return d ? String(d.getDate()).padStart(2, '0') + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear() : '—'; },
    dateShort: function (d) { d = parseDate(d); return d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getFullYear()).slice(2) : '—'; },
    month: function (d) { d = parseDate(d); return MOIS_L[d.getMonth()] + ' ' + d.getFullYear(); },
    datetime: function (d) { d = new Date(d); return fmt.date(d) + ' à ' + String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0'); },
    pct: function (n, dec) { return fmt.num(n, dec || 0) + ' %'; },
    ago: function (d) { var s = (Date.now() - new Date(d)) / 1000; if (s < 60) return 'à l\'instant'; if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min'; if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h'; var j = Math.floor(s / 86400); return j === 1 ? 'hier' : 'il y a ' + j + ' j'; },
    initials: function (n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  };

  /* ------------------------------------------------------------------ store */
  var db = null;
  function load() { try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; } if (!db || !db.c) db = { v: 1, c: {}, audit: [], notifs: [] }; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('Stockage plein', e); } }
  var store = {
    all: function (col) { return db.c[col] || (db.c[col] = []); },
    get: function (col, id) { return store.all(col).find(function (x) { return x.id === id; }); },
    set: function (col, arr) { db.c[col] = arr; save(); },
    add: function (col, obj, prefix) { if (!obj.id) obj.id = uid(prefix || col.slice(0, 3).toUpperCase()); store.all(col).unshift(obj); save(); return obj; },
    update: function (col, id, patch) { var o = store.get(col, id); if (o) { Object.assign(o, patch); save(); } return o; },
    remove: function (col, id) { db.c[col] = store.all(col).filter(function (x) { return x.id !== id; }); save(); },
    has: function (col) { return Array.isArray(db.c[col]); },
    save: save,
    /* numéro de pièce séquentiel : ERP.store.next('BC') -> BC-2026-0143 */
    next: function (prefix) { db.seq = db.seq || {}; var n = (db.seq[prefix] || 100) + 1; db.seq[prefix] = n; save(); return prefix + '-2026-' + String(n).padStart(4, '0'); },
    reset: function () { localStorage.removeItem(KEY); localStorage.removeItem('sogara_candidatures_site'); location.reload(); }
  };

  /* Journal d'audit + notifications */
  function log(action, detail, module) {
    var u = session.user();
    db.audit.unshift({ at: new Date().toISOString(), user: u ? u.name : 'Système', role: u ? u.role : '', action: action, detail: detail || '', module: module || currentModule || '' });
    db.audit = db.audit.slice(0, 300); save();
  }
  function notify(title, detail, href, tone) {
    db.notifs.unshift({ id: uid('N'), at: new Date().toISOString(), title: title, detail: detail || '', href: href || '', tone: tone || 'blue', read: false });
    db.notifs = db.notifs.slice(0, 60); save(); renderNotifDot();
  }

  /* ------------------------------------------------------------------ comptes de démonstration */
  var USERS = [
    { login: 'direction', pass: 'demo2026', name: 'Direction générale', short: 'DG', role: 'Administrateur Directeur Général', profile: 'admin', color: '#0f2d5c',
      desc: 'Accès complet : tous les modules, validations finales, paramètres.' },
    { login: 'rh', pass: 'demo2026', name: 'Aïcha Mboumba', short: 'AM', role: 'Responsable Ressources humaines', profile: 'rh', color: '#7c3aed',
      desc: 'Recrutement, personnel, congés, formation et paie.' },
    { login: 'achats', pass: 'demo2026', name: 'Serge Ondo Mba', short: 'SO', role: 'Chef du service Achats & Logistique', profile: 'achats', color: '#e8780c',
      desc: 'Demandes d\'achat, devis fournisseurs, commandes, stocks, transport.' },
    { login: 'finance', pass: 'demo2026', name: 'Clarisse Nzé', short: 'CN', role: 'Directrice financière', profile: 'finance', color: '#1e9e4a',
      desc: 'Devis et factures clients, factures fournisseurs, paie, budgets.' },
    { login: 'hse', pass: 'demo2026', name: 'Patrick Moussavou', short: 'PM', role: 'Responsable HSE', profile: 'hse', color: '#d93636',
      desc: 'Permis de travail, plans de prévention, incidents, audits.' },
    { login: 'projets', pass: 'demo2026', name: 'Hervé Nguema Obame', short: 'HN', role: 'Chef de projet Modernisation', profile: 'projets', color: '#2563eb',
      desc: 'Portefeuille de projets, planning Gantt, maintenance et arrêts techniques.' }
  ];
  var session = {
    user: function () { try { var l = sessionStorage.getItem(SESSION) || localStorage.getItem(SESSION); return USERS.find(function (u) { return u.login === l; }) || null; } catch (e) { return null; } },
    login: function (login, pass) { var u = USERS.find(function (x) { return x.login === String(login).trim().toLowerCase() && x.pass === pass; }); if (!u) return null; try { localStorage.setItem(SESSION, u.login); } catch (e) {} return u; },
    logout: function () { try { localStorage.removeItem(SESSION); sessionStorage.removeItem(SESSION); } catch (e) {} location.href = 'index.html'; },
    can: function (mod) { var u = session.user(); if (!u) return false; if (u.profile === 'admin') return true; return !mod.roles || mod.roles.indexOf(u.profile) >= 0; }
  };

  /* ------------------------------------------------------------------ icônes (traits 2px, style Lucide) */
  var P = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
    gantt: '<path d="M3 5h9M6 10h11M9 15h8M4 20h7"/><path d="M3 3v18"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    userplus: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/><path d="M6 6V4h11v2"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12L22 7H6"/>',
    invoice: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h5"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    tank: '<ellipse cx="12" cy="5" rx="7" ry="2.5"/><path d="M5 5v14c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5"/><path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.5-.7-.7-2.5z"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.5 8.3 8 9 4.5-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    truck: '<path d="M2 6h11v10H2zM13 9h5l3 3v4h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    ship: '<path d="M3 17c2 2 4 2 6 0 2 2 4 2 6 0 2 2 4 2 6 0"/><path d="M5 14 4 10h16l-1 4M8 10V6h8v4M12 3v3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    file: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    arrow: '<path d="M5 12h14M13 5l7 7-7 7"/>',
    back: '<path d="M19 12H5M11 19l-7-7 7-7"/>',
    flag: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
    fire: '<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-1 3-3 4-4 4 0-3-1-5-3-7 0 4-4 7-4 12 0 4 4 7 8 7z"/>',
    helmet: '<path d="M3 18h18M4 18v-3a8 8 0 0 1 16 0v3M12 7V4M9 7.5 8 5M15 7.5l1-2.5"/>',
    doc: '<path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-5-5z"/><path d="M8 13h8M8 17h5M8 9h2"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7z"/>',
    graduation: '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    drop: '<path d="M12 2.5s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z"/>',
    factory: '<path d="M2 20V9l6 4V9l6 4V4h4l2 16z"/><path d="M6 17h2M11 17h2M16 17h2"/>',
    money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
    filter: '<path d="M3 4h18l-7 8v6l-4 2v-8z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    star: '<path d="m12 2 3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2 2"/>'
  };
  function icon(name, cls) { return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.info) + '</svg>'; }

  /* ------------------------------------------------------------------ composants UI */
  var TONES = { blue: 'tone-blue', green: 'tone-green', orange: 'tone-orange', red: 'tone-red', violet: 'tone-violet', grey: 'tone-grey', yellow: 'tone-yellow', navy: 'tone-navy' };
  /* Couleur automatique d'un statut courant */
  var STATUS_TONE = {
    'brouillon': 'grey', 'en attente': 'orange', 'à valider': 'orange', 'soumis': 'orange', 'soumise': 'orange', 'en validation': 'orange', 'en cours': 'blue', 'ouvert': 'blue', 'ouverte': 'blue', 'actif': 'green', 'active': 'green',
    'validé': 'green', 'validée': 'green', 'approuvé': 'green', 'approuvée': 'green', 'terminé': 'green', 'terminée': 'green', 'payée': 'green', 'payé': 'green', 'livré': 'green', 'livrée': 'green', 'reçu': 'green', 'reçue': 'green', 'clôturé': 'grey', 'clôturée': 'grey', 'fermé': 'grey',
    'rejeté': 'red', 'rejetée': 'red', 'refusé': 'red', 'refusée': 'red', 'annulé': 'grey', 'annulée': 'grey', 'en retard': 'red', 'critique': 'red', 'urgent': 'red', 'haute': 'orange', 'moyenne': 'yellow', 'basse': 'grey',
    'études': 'violet', 'planifié': 'violet', 'planifiée': 'violet', 'publiée': 'green', 'suspendu': 'red', 'suspendue': 'red', 'expiré': 'red', 'expirée': 'red', 'partielle': 'orange', 'partiellement payée': 'orange', 'émise': 'blue', 'envoyé': 'blue', 'envoyée': 'blue', 'en transit': 'blue', 'chargement': 'orange', 'à quai': 'violet'
  };
  function badge(text, tone) { tone = tone || STATUS_TONE[norm(text).replace(/é/g, 'é')] || STATUS_TONE[String(text || '').toLowerCase()] || 'grey'; return '<span class="badge ' + (TONES[tone] || tone) + '">' + esc(text) + '</span>'; }
  function progress(p, color) { p = Math.max(0, Math.min(100, +p || 0)); color = color || (p >= 100 ? 'green' : ''); return '<div class="pbar"><div class="progress ' + color + '"><i style="width:' + p + '%"></i></div><span>' + Math.round(p) + '%</span></div>'; }
  function avatar(name, color, sm) { var c = color; if (!c) { var hsh = 0; String(name).split('').forEach(function (ch) { hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0; }); c = ['#0f2d5c', '#2563eb', '#7c3aed', '#1e9e4a', '#e8780c', '#0e7490', '#be185d', '#475569'][hsh % 8]; } return '<span class="avatar' + (sm ? ' sm' : '') + '" style="background:' + c + '">' + esc(fmt.initials(name)) + '</span>'; }
  function kpi(o) { return '<div class="card kpi">' + (o.icon ? '<div class="kpi__icon ' + (TONES[o.tone || 'blue']) + '">' + icon(o.icon) + '</div>' : '') + '<div class="kpi__label">' + esc(o.label) + '</div><div class="kpi__value">' + o.value + (o.unit ? '<small>' + esc(o.unit) + '</small>' : '') + '</div>' + (o.foot ? '<div class="kpi__foot">' + o.foot + '</div>' : '') + '</div>'; }

  /* Tableau : columns = [{key,label,num,render(row),width,class}] ; options: onRow(row), empty, footer(rows) */
  function table(columns, rows, opt) {
    opt = opt || {};
    var id = uid('T');
    var html = '<div class="tbl-wrap"><table class="tbl responsive" id="' + id + '"><thead><tr>' + columns.map(function (c) { return '<th class="' + (c.num ? 'num ' : '') + (c.cls || '') + '"' + (c.width ? ' style="width:' + c.width + '"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>';
    if (!rows.length) html += '<tr><td colspan="' + columns.length + '" class="tbl-empty">' + esc(opt.empty || 'Aucun élément') + '</td></tr>';
    rows.forEach(function (r, i) {
      html += '<tr data-i="' + i + '"' + (opt.onRow ? ' class="clickable"' : '') + '>' + columns.map(function (c) { var v = c.render ? c.render(r) : esc(r[c.key]); return '<td data-label="' + esc(c.label) + '" class="' + (c.num ? 'num ' : '') + (c.cls || '') + '">' + (v == null || v === '' ? '<span class="muted">—</span>' : v) + '</td>'; }).join('') + '</tr>';
    });
    html += '</tbody>' + (opt.footer ? '<tfoot><tr>' + opt.footer(rows) + '</tr></tfoot>' : '') + '</table></div>';
    if (opt.onRow) setTimeout(function () { var t = document.getElementById(id); if (t) t.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-i]'); if (tr && !e.target.closest('button,a,input,select')) opt.onRow(rows[+tr.dataset.i], e); }); });
    return html;
  }

  /* Modale : modal({title, sub, body (html|Node), size:'lg'|'sm', actions:[{label, cls, onClick(close, el), icon}]}) */
  function modal(o) {
    var back = h('<div class="modal-back"><div class="modal ' + (o.size || '') + '" role="dialog" aria-modal="true"><div class="modal__h"><div><h3>' + esc(o.title) + '</h3>' + (o.sub ? '<div class="sub">' + o.sub + '</div>' : '') + '</div><button class="modal__x" aria-label="Fermer">×</button></div><div class="modal__b"></div>' + (o.actions && o.actions.length ? '<div class="modal__f"></div>' : '') + '</div></div>');
    var body = $('.modal__b', back);
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    function close() { back.remove(); document.removeEventListener('keydown', onKey); if (o.onClose) o.onClose(); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    $('.modal__x', back).onclick = close;
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);
    (o.actions || []).forEach(function (a) { var b = h('<button class="btn ' + (a.cls || '') + '">' + (a.icon ? icon(a.icon) : '') + esc(a.label) + '</button>'); b.onclick = function () { a.onClick ? a.onClick(close, back) : close(); }; $('.modal__f', back).appendChild(b); });
    document.body.appendChild(back);
    var first = $('input,select,textarea', body); if (first && window.innerWidth > 640) setTimeout(function () { first.focus(); }, 50);
    return { el: back, body: body, close: close };
  }
  function confirmBox(title, text, okLabel, onOk, cls) { modal({ title: title, size: 'sm', body: '<p style="margin:0">' + text + '</p>', actions: [{ label: 'Annuler' }, { label: okLabel || 'Confirmer', cls: cls || 'primary', onClick: function (c) { c(); onOk(); } }] }); }

  /* Formulaire : fields = [{name,label,type:'text|number|date|select|textarea|money', options:[..]|[{v,l}], required, full, value, placeholder, step}] */
  function form(fields, values) {
    values = values || {};
    return '<form class="form-grid" onsubmit="return false">' + fields.map(function (f) {
      var v = values[f.name] != null ? values[f.name] : (f.value != null ? f.value : '');
      var attrs = ' name="' + f.name + '" id="f_' + f.name + '"' + (f.required ? ' required' : '') + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (f.readonly ? ' readonly' : '');
      var input;
      if (f.type === 'select') input = '<select class="select"' + attrs + '>' + (f.empty ? '<option value="">' + esc(f.empty) + '</option>' : '') + (f.options || []).map(function (o) { var ov = typeof o === 'object' ? o.v : o, ol = typeof o === 'object' ? o.l : o; return '<option value="' + esc(ov) + '"' + (String(ov) === String(v) ? ' selected' : '') + '>' + esc(ol) + '</option>'; }).join('') + '</select>';
      else if (f.type === 'textarea') input = '<textarea class="textarea"' + attrs + '>' + esc(v) + '</textarea>';
      else input = '<input class="input" type="' + (f.type === 'money' ? 'number' : (f.type || 'text')) + '"' + attrs + ' value="' + esc(v) + '"' + (f.step ? ' step="' + f.step + '"' : '') + (f.min != null ? ' min="' + f.min + '"' : '') + '>';
      return '<div class="field' + (f.full || f.type === 'textarea' ? ' full' : '') + '"><label for="f_' + f.name + '">' + esc(f.label) + (f.required ? ' *' : '') + '</label>' + input + (f.help ? '<span class="small muted">' + esc(f.help) + '</span>' : '') + '</div>';
    }).join('') + '</form>';
  }
  function readForm(root) {
    var f = root.querySelector('form') || root, out = {}, ok = true;
    $$('input,select,textarea', f).forEach(function (el) {
      if (!el.name) return;
      var v = el.value; if (el.type === 'number') v = v === '' ? '' : +v; if (el.type === 'checkbox') v = el.checked;
      out[el.name] = v;
      if (el.required && (v === '' || v == null)) { ok = false; el.style.borderColor = 'var(--red)'; } else el.style.borderColor = '';
    });
    if (!ok) { toast('Merci de remplir les champs obligatoires.', 'err'); return null; }
    return out;
  }
  /* Modale formulaire en une ligne */
  function formModal(o) {
    var m = modal({ title: o.title, sub: o.sub, size: o.size, body: (o.intro || '') + form(o.fields, o.values), actions: [{ label: 'Annuler' }, { label: o.okLabel || 'Enregistrer', cls: 'primary', icon: 'check', onClick: function (close, el) { var v = readForm(el); if (v && o.onSubmit(v, close) !== false) close(); } }] });
    return m;
  }

  function toast(msg, kind) {
    var box = $('.toasts') || document.body.appendChild(h('<div class="toasts"></div>'));
    var t = h('<div class="toast ' + (kind || 'ok') + '"><i></i><span>' + esc(msg) + '</span></div>');
    box.appendChild(t); setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = 0; setTimeout(function () { t.remove(); }, 300); }, 3200);
  }

  function tabs(list, active, onChange) {
    var id = uid('TB');
    setTimeout(function () { var el = document.getElementById(id); if (el) el.addEventListener('click', function (e) { var b = e.target.closest('.tab'); if (b) onChange(b.dataset.k); }); });
    return '<div class="tabs" id="' + id + '">' + list.map(function (t) { return '<button class="tab' + (t.k === active ? ' is-active' : '') + '" data-k="' + t.k + '">' + esc(t.l) + (t.n != null ? '<span class="n">' + t.n + '</span>' : '') + '</button>'; }).join('') + '</div>';
  }

  /* Étapes d'un processus : steps(['A','B','C'], indexCourant, {rejected:bool}) */
  function steps(list, current, opt) {
    opt = opt || {};
    return '<div class="steps">' + list.map(function (s, i) { var c = i < current ? 'done' : i === current ? (opt.rejected ? 'rejected' : (opt.finished ? 'done' : 'current')) : ''; return '<div class="step ' + c + '"><i>' + (i < current || (i === current && opt.finished) ? '✓' : opt.rejected && i === current ? '×' : i + 1) + '</i>' + esc(s) + '</div>'; }).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ graphiques SVG */
  var PALETTE = ['#0f2d5c', '#2563eb', '#1e9e4a', '#f5c400', '#e8780c', '#7c3aed', '#0e7490', '#d93636', '#94a3b8'];
  /* bars({labels, series:[{name,values,color}], height, stacked, money}) */
  function bars(o) {
    var W = o.width || (window.innerWidth < 700 ? Math.max(300, window.innerWidth - 60) : 640), H = o.height || 220, pl = 56, pb = 26, pt = 10, pr = 8;
    var n = o.labels.length, S = o.series;
    var totals = o.labels.map(function (_, i) { return o.stacked ? sum(S, function (s) { return s.values[i]; }) : Math.max.apply(null, S.map(function (s) { return s.values[i]; })); });
    var max = Math.max.apply(null, totals.concat([1])) * 1.1;
    var step = Math.pow(10, Math.floor(Math.log10(max))); var nice = Math.ceil(max / step) * step; max = nice;
    var cw = (W - pl - pr) / n, bw = o.stacked ? cw * 0.56 : (cw * 0.7) / S.length;
    var g = '';
    for (var k = 0; k <= 4; k++) { var y = pt + (H - pt - pb) * (1 - k / 4); g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" stroke="#eef1f5"/><text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + fmt.short(max * k / 4) + '</text>'; }
    o.labels.forEach(function (l, i) {
      var x0 = pl + cw * i + (cw - (o.stacked ? bw : bw * S.length)) / 2, acc = 0;
      S.forEach(function (s, j) {
        var v = s.values[i] || 0, bh = (H - pt - pb) * v / max;
        var x = o.stacked ? x0 : x0 + j * bw, y = H - pb - bh - (o.stacked ? acc : 0);
        g += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw - (o.stacked ? 0 : 3)).toFixed(1) + '" height="' + Math.max(0, bh).toFixed(1) + '" rx="3" fill="' + (s.color || PALETTE[j]) + '"><title>' + esc(s.name + ' · ' + l + ' : ' + (o.money ? fmt.money(v) : fmt.num(v))) + '</title></rect>';
        if (o.stacked) acc += bh;
      });
      g += '<text x="' + (pl + cw * i + cw / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(l) + '</text>';
    });
    var legend = S.length > 1 ? '<div class="legend" style="margin-top:8px">' + S.map(function (s, j) { return '<span><i style="background:' + (s.color || PALETTE[j]) + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>' : '';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:' + H + 'px">' + g + '</svg>' + legend;
  }
  /* line({labels, series:[{name, values, color}], height}) */
  function line(o) {
    var W = o.width || (window.innerWidth < 700 ? Math.max(300, window.innerWidth - 60) : 640), H = o.height || 200, pl = 56, pb = 26, pt = 12, pr = 10;
    var all = [].concat.apply([], o.series.map(function (s) { return s.values; }));
    var max = Math.max.apply(null, all) * 1.1, min = o.zero === false ? Math.min.apply(null, all) * 0.9 : 0;
    var n = o.labels.length, X = function (i) { return pl + (W - pl - pr) * i / Math.max(1, n - 1); }, Y = function (v) { return pt + (H - pt - pb) * (1 - (v - min) / (max - min || 1)); };
    var g = '';
    for (var k = 0; k <= 4; k++) { var v = min + (max - min) * k / 4, y = Y(v); g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y + '" y2="' + y + '" stroke="#eef1f5"/><text x="' + (pl - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + fmt.short(v) + '</text>'; }
    o.labels.forEach(function (l, i) { if (n <= 12 || i % Math.ceil(n / 12) === 0) g += '<text x="' + X(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(l) + '</text>'; });
    o.series.forEach(function (s, j) {
      var c = s.color || PALETTE[j], pts = s.values.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); });
      if (j === 0 && o.area !== false) g += '<path d="M' + X(0) + ',' + Y(min) + ' L' + pts.join(' L') + ' L' + X(n - 1) + ',' + Y(min) + 'Z" fill="' + c + '" opacity=".08"/>';
      g += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + c + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"' + (s.dash ? ' stroke-dasharray="5 5"' : '') + '/>';
      s.values.forEach(function (v, i) { g += '<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="3" fill="#fff" stroke="' + c + '" stroke-width="2"><title>' + esc(s.name + ' · ' + o.labels[i] + ' : ' + fmt.num(v)) + '</title></circle>'; });
    });
    var legend = o.series.length > 1 ? '<div class="legend" style="margin-top:8px">' + o.series.map(function (s, j) { return '<span><i style="background:' + (s.color || PALETTE[j]) + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div>' : '';
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:' + H + 'px">' + g + '</svg>' + legend;
  }
  /* donut([{label, value, color}], {center, sub, size, money}) */
  function donut(items, o) {
    o = o || {}; var size = o.size || 150, r = 54, c = 2 * Math.PI * r, tot = sum(items, 'value') || 1, off = 0;
    var arcs = items.map(function (it, i) { var len = c * it.value / tot, s = '<circle r="' + r + '" cx="70" cy="70" fill="none" stroke="' + (it.color || PALETTE[i]) + '" stroke-width="18" stroke-dasharray="' + len.toFixed(2) + ' ' + (c - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"><title>' + esc(it.label + ' : ' + (o.money ? fmt.money(it.value) : fmt.num(it.value))) + '</title></circle>'; off += len; return s; }).join('');
    return '<div class="donut-wrap"><svg viewBox="0 0 140 140" width="' + size + '" height="' + size + '" style="flex:none"><circle r="' + r + '" cx="70" cy="70" fill="none" stroke="#eef1f5" stroke-width="18"/>' + arcs + '<text x="70" y="' + (o.sub ? 68 : 75) + '" text-anchor="middle" style="font:700 18px Sora,sans-serif;fill:#0d1b2a">' + esc(o.center != null ? o.center : fmt.num(tot)) + '</text>' + (o.sub ? '<text x="70" y="86" text-anchor="middle" style="font:500 10px Inter;fill:#7a879a">' + esc(o.sub) + '</text>' : '') + '</svg><div class="donut-legend">' + items.map(function (it, i) { return '<div><i style="background:' + (it.color || PALETTE[i]) + '"></i><span>' + esc(it.label) + '</span><b>' + (o.money ? fmt.short(it.value) : fmt.num(it.value)) + '</b></div>'; }).join('') + '</div></div>';
  }
  /* jauge semi-circulaire */
  function gauge(pct, label, color) {
    pct = Math.max(0, Math.min(100, pct)); var r = 50, c = Math.PI * r, len = c * pct / 100;
    return '<svg viewBox="0 0 120 70" width="140" style="display:block;margin:auto"><path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="#eef1f5" stroke-width="12" stroke-linecap="round"/><path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="' + (color || '#1e9e4a') + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + len.toFixed(1) + ' ' + c.toFixed(1) + '"/><text x="60" y="56" text-anchor="middle" style="font:700 17px Sora,sans-serif;fill:#0d1b2a">' + Math.round(pct) + '%</text></svg>' + (label ? '<div class="center small muted">' + esc(label) + '</div>' : '');
  }

  /* ------------------------------------------------------------------ Gantt
     gantt({rows:[{label, sub, start, end, progress, group:bool, milestones:[{date,label,done}], cls, onClick}], from, to, unit:'month'|'week'|'day'}) */
  function gantt(o) {
    var rows = o.rows, id = uid('G');
    var from = parseDate(o.from || rows.reduce(function (m, r) { return !m || r.start < m ? r.start : m; }, null));
    var to = parseDate(o.to || rows.reduce(function (m, r) { return !m || r.end > m ? r.end : m; }, null));
    var unit = o.unit || (daysBetween(from, to) > 500 ? 'quarter' : daysBetween(from, to) > 120 ? 'month' : daysBetween(from, to) > 35 ? 'week' : 'day');
    if (unit === 'month' || unit === 'quarter') { from = new Date(from.getFullYear(), unit === 'quarter' ? Math.floor(from.getMonth() / 3) * 3 : from.getMonth(), 1); to = new Date(to.getFullYear(), to.getMonth() + 1, 0); }
    var span = Math.max(1, daysBetween(from, to) + 1);
    var pos = function (d) { return Math.max(0, Math.min(100, daysBetween(from, d) / span * 100)); };
    var ticks = [], t = new Date(from);
    while (t <= to) {
      var lab = unit === 'day' ? String(t.getDate()).padStart(2, '0') + '/' + String(t.getMonth() + 1).padStart(2, '0') : unit === 'week' ? String(t.getDate()).padStart(2, '0') + ' ' + MOIS[t.getMonth()] : unit === 'quarter' ? 'T' + (Math.floor(t.getMonth() / 3) + 1) + ' ' + t.getFullYear() : MOIS[t.getMonth()] + (t.getMonth() === 0 || !ticks.length ? ' ' + String(t.getFullYear()).slice(2) : '');
      ticks.push({ x: pos(t), l: lab });
      if (unit === 'day') t.setDate(t.getDate() + 1); else if (unit === 'week') t.setDate(t.getDate() + 7); else if (unit === 'quarter') t.setMonth(t.getMonth() + 3); else t.setMonth(t.getMonth() + 1);
    }
    var minW = Math.max(o.minWidth || 780, 260 + ticks.length * (unit === 'day' ? 34 : unit === 'week' ? 58 : unit === 'quarter' ? 70 : 52));
    var grid = ticks.map(function (k) { return '<div class="gantt__grid" style="left:' + k.x + '%"></div>'; }).join('');
    var todayX = TODAY >= from && TODAY <= to ? pos(TODAY) : null;
    var html = '<div class="gantt" id="' + id + '"><div class="gantt__inner" style="min-width:' + minW + 'px"><div class="gantt__head"><div class="gantt__label">' + esc(o.title || 'Tâche') + '</div><div class="gantt__scale">' + ticks.map(function (k) { return '<div class="gantt__tick" style="left:' + k.x + '%">' + k.l + '</div>'; }).join('') + '</div></div>';
    rows.forEach(function (r, i) {
      var x1 = pos(r.start), x2 = pos(addDays(r.end, 1)), w = Math.max(0.6, x2 - x1), p = r.progress || 0;
      var late = !r.group && p < 100 && parseDate(r.end) < TODAY;
      var cls = r.cls || (r.group ? 'group' : p >= 100 ? 'done' : late ? 'late' : '');
      var tip = r.label + ' · ' + fmt.date(r.start) + ' → ' + fmt.date(r.end) + (r.group ? '' : ' · ' + p + ' %');
      html += '<div class="gantt__row"><div class="gantt__label' + (r.group ? ' group' : '') + '"><b title="' + esc(r.label) + '">' + esc(r.label) + '</b>' + (r.sub ? '<span>' + esc(r.sub) + '</span>' : '') + '</div><div class="gantt__track">' + grid +
        (r.start && r.end ? '<div class="gantt__bar ' + cls + '" data-i="' + i + '" style="left:' + x1 + '%;width:' + w + '%" title="' + esc(tip) + '"><i style="width:' + p + '%"></i>' + (!r.group && w > 7 ? '<em>' + p + '%</em>' : '') + '</div>' : '') +
        (r.milestones || []).map(function (m) { return '<div class="gantt__ms' + (m.done ? ' done' : '') + '" style="left:' + pos(m.date) + '%" title="' + esc(m.label + ' · ' + fmt.date(m.date)) + '"></div>'; }).join('') +
        '</div></div>';
    });
    html += (todayX != null ? '<div class="gantt__today" style="left:calc(260px + (100% - 260px) * ' + (todayX / 100).toFixed(4) + ')"></div>' : '') + '</div></div>';
    html += '<div class="legend" style="padding:10px 14px"><span><i style="background:var(--navy-3)"></i>Réalisé</span><span><i style="background:#c9d6ea"></i>Reste à faire</span><span><i style="background:var(--green)"></i>Terminé</span><span><i style="background:var(--red)"></i>En retard</span><span><i style="background:var(--yellow);transform:rotate(45deg);border:1px solid var(--navy)"></i>Jalon</span><span><i style="background:var(--red);width:2px"></i>Aujourd\'hui</span></div>';
    setTimeout(function () {
      var el = document.getElementById(id); if (!el) return;
      if (window.innerWidth <= 640) $$('.gantt__head,.gantt__row', el).forEach(function () {});
      var tl = $('.gantt__today', el); if (tl && window.innerWidth <= 640) tl.style.left = 'calc(150px + (100% - 150px) * ' + (todayX / 100).toFixed(4) + ')';
      el.addEventListener('click', function (e) { var b = e.target.closest('.gantt__bar'); if (b && rows[+b.dataset.i].onClick) rows[+b.dataset.i].onClick(rows[+b.dataset.i]); });
      if (todayX != null && o.scrollToday !== false) { var sc = el; sc.scrollLeft = Math.max(0, (sc.scrollWidth - 260) * todayX / 100 - sc.clientWidth / 2 + 130); }
    });
    return html;
  }

  /* Export CSV (ouvert dans Excel) */
  function exportCSV(name, columns, rows) {
    var lines = [columns.map(function (c) { return c.label; }).join(';')].concat(rows.map(function (r) { return columns.map(function (c) { var v = c.csv ? c.csv(r) : r[c.key]; return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'); }));
    var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    toast('Export « ' + name + '.csv » téléchargé');
  }

  /* ------------------------------------------------------------------ référentiel commun (personnel, fournisseurs, clients, unités) */
  function seedCommon() {
    if (!store.has('directions')) store.set('directions', [
      { id: 'DG', nom: 'Direction générale' }, { id: 'PROD', nom: 'Production' }, { id: 'MAINT', nom: 'Maintenance' }, { id: 'HSE', nom: 'HSE' },
      { id: 'LABO', nom: 'Laboratoire' }, { id: 'ACH', nom: 'Achats & Logistique' }, { id: 'COM', nom: 'Commercial' }, { id: 'FIN', nom: 'Finances' }, { id: 'RH', nom: 'Ressources humaines' }, { id: 'PRJ', nom: 'Projets' }, { id: 'SI', nom: 'Systèmes d\'information' }
    ]);
    if (!store.has('employes')) {
      var E = [
        ['Nguema Obame Hervé', 'Chef de projet Modernisation', 'PRJ', 'Cadre', 3200000, '2012-03-01'], ['Mboumba Aïcha', 'Responsable Ressources humaines', 'RH', 'Cadre', 2900000, '2014-09-15'],
        ['Ondo Mba Serge', 'Chef du service Achats & Logistique', 'ACH', 'Cadre', 2700000, '2010-01-04'], ['Nzé Clarisse', 'Directrice financière', 'FIN', 'Cadre sup.', 4100000, '2009-06-01'],
        ['Moussavou Patrick', 'Responsable HSE', 'HSE', 'Cadre', 2800000, '2011-02-14'], ['Ekomi Jean-Baptiste', 'Chef de quart production', 'PROD', 'Agent de maîtrise', 1450000, '2004-05-10'],
        ['Mintsa Rodrigue', 'Opérateur tableau', 'PROD', 'Employé', 780000, '2016-08-01'], ['Koumba Estelle', 'Opératrice extérieure', 'PROD', 'Employé', 690000, '2019-01-07'],
        ['Assoumou Brice', 'Opérateur extérieur', 'PROD', 'Employé', 650000, '2021-03-15'], ['Boussougou Landry', 'Ingénieur procédés', 'PROD', 'Cadre', 2350000, '2015-10-01'],
        ['Mayila Sandrine', 'Chimiste laboratoire', 'LABO', 'Agent de maîtrise', 1150000, '2013-04-22'], ['Ibinga Fabrice', 'Technicien laboratoire', 'LABO', 'Employé', 820000, '2018-06-11'],
        ['Mbina Alain', 'Chef du service Maintenance', 'MAINT', 'Cadre', 2600000, '2007-11-05'], ['Engonga Thierry', 'Technicien instrumentiste', 'MAINT', 'Agent de maîtrise', 1080000, '2012-07-02'],
        ['Mapangou Rostand', 'Mécanicien tournant', 'MAINT', 'Employé', 760000, '2017-02-20'], ['Lendoye Gaël', 'Électricien', 'MAINT', 'Employé', 740000, '2018-09-03'],
        ['Owono Nadège', 'Inspectrice équipements', 'MAINT', 'Agent de maîtrise', 1250000, '2014-01-13'], ['Pambou Yannick', 'Chaudronnier', 'MAINT', 'Employé', 700000, '2020-05-18'],
        ['Ntoutoume Carine', 'Animatrice HSE', 'HSE', 'Agent de maîtrise', 1020000, '2016-03-07'], ['Makaya Olivier', 'Pompier industriel', 'HSE', 'Employé', 690000, '2015-12-01'],
        ['Essono Marcel', 'Acheteur', 'ACH', 'Agent de maîtrise', 1100000, '2013-10-14'], ['Mengue Laure', 'Gestionnaire de stock', 'ACH', 'Employé', 720000, '2017-06-26'],
        ['Bivigou Christian', 'Responsable expéditions', 'ACH', 'Agent de maîtrise', 1180000, '2008-02-11'], ['Nkoghe Paulin', 'Chauffeur poids lourd', 'ACH', 'Employé', 520000, '2019-11-04'],
        ['Mamfoumbi Diane', 'Responsable commerciale', 'COM', 'Cadre', 2400000, '2012-12-03'], ['Ella Stéphane', 'Chargé de clientèle', 'COM', 'Agent de maîtrise', 980000, '2019-04-15'],
        ['Matsanga Irène', 'Comptable', 'FIN', 'Agent de maîtrise', 1060000, '2014-08-18'], ['Ditsougou Franck', 'Contrôleur de gestion', 'FIN', 'Cadre', 1900000, '2016-01-11'],
        ['Ngoua Béatrice', 'Gestionnaire paie', 'RH', 'Agent de maîtrise', 950000, '2015-05-04'], ['Allogho Kevin', 'Chargé de recrutement', 'RH', 'Agent de maîtrise', 900000, '2020-02-03'],
        ['Oyane Sylvie', 'Assistante de direction', 'DG', 'Employé', 850000, '2011-09-19'], ['Minko Arnaud', 'Ingénieur méthodes', 'PRJ', 'Cadre', 2100000, '2018-01-08'],
        ['Obiang Ruth', 'Planificatrice projets', 'PRJ', 'Agent de maîtrise', 1200000, '2021-06-01'], ['Mouketou Ghislain', 'Administrateur systèmes', 'SI', 'Cadre', 1750000, '2017-10-02'],
        ['Nzamba Cédric', 'Opérateur appontement', 'PROD', 'Employé', 700000, '2018-03-12'], ['Ogandaga Linda', 'Opératrice utilités', 'PROD', 'Employé', 690000, '2022-01-10'],
        ['Mba Nziengui Félix', 'Chef de quart production', 'PROD', 'Agent de maîtrise', 1420000, '2006-07-24'], ['Bekale Josué', 'Soudeur qualifié', 'MAINT', 'Employé', 730000, '2019-08-19']
      ];
      store.set('employes', E.map(function (e, i) { return { id: 'MAT-' + String(1041 + i * 7), nom: e[0], poste: e[1], direction: e[2], categorie: e[3], salaire: e[4], entree: e[5], statut: 'Actif', contrat: 'CDI', tel: '+241 07 ' + String(20 + i).padStart(2, '0') + ' ' + String(10 + i * 3).slice(-2) + ' ' + String(40 + i).slice(-2), email: norm(e[0].split(' ').slice(-1)[0]).replace(/[^a-z]/g, '') + '.' + norm(e[0].split(' ')[0]).replace(/[^a-z]/g, '') + '@sogara.ga' }; }));
    }
    if (!store.has('fournisseurs')) store.set('fournisseurs', [
      { id: 'F-001', nom: 'Équatoriale Industrie Services', domaine: 'Mécanique & chaudronnerie', ville: 'Port-Gentil', note: 4.5, delai: 12, contact: 'service.commercial@eis-demo.ga' },
      { id: 'F-002', nom: 'Ogooué Instrumentation', domaine: 'Instrumentation & régulation', ville: 'Port-Gentil', note: 4.2, delai: 21, contact: 'ventes@ogooue-instru-demo.ga' },
      { id: 'F-003', nom: 'Atlantic Valves Europe', domaine: 'Vannes & robinetterie', ville: 'Rotterdam (NL)', note: 4.7, delai: 45, contact: 'orders@atlanticvalves-demo.eu' },
      { id: 'F-004', nom: 'Gabon Électro-Tech', domaine: 'Électricité industrielle', ville: 'Libreville', note: 3.9, delai: 15, contact: 'devis@get-demo.ga' },
      { id: 'F-005', nom: 'Chimie Catalyse International', domaine: 'Catalyseurs & produits chimiques', ville: 'Lyon (FR)', note: 4.6, delai: 60, contact: 'sales@cci-demo.fr' },
      { id: 'F-006', nom: 'Mandji Transports', domaine: 'Transport & levage', ville: 'Port-Gentil', note: 4.0, delai: 3, contact: 'exploitation@mandji-demo.ga' },
      { id: 'F-007', nom: 'Sécurité Pro Gabon', domaine: 'EPI & matériel de sécurité', ville: 'Libreville', note: 4.3, delai: 7, contact: 'contact@secupro-demo.ga' },
      { id: 'F-008', nom: 'Delta Scaffolding', domaine: 'Échafaudages & calorifuge', ville: 'Port-Gentil', note: 4.1, delai: 5, contact: 'planning@delta-demo.ga' },
      { id: 'F-009', nom: 'Bureautique Océane', domaine: 'Fournitures & informatique', ville: 'Port-Gentil', note: 3.8, delai: 4, contact: 'commandes@oceane-demo.ga' },
      { id: 'F-010', nom: 'LabEquip Africa', domaine: 'Équipements de laboratoire', ville: 'Douala (CM)', note: 4.4, delai: 30, contact: 'info@labequip-demo.cm' }
    ]);
    if (!store.has('clients')) store.set('clients', [
      { id: 'C-01', nom: 'Distributeur Estuaire Carburants', type: 'Distributeur', ville: 'Libreville', plafond: 6000000000, delai: 30 },
      { id: 'C-02', nom: 'Ogooué Énergies Distribution', type: 'Distributeur', ville: 'Port-Gentil', plafond: 4500000000, delai: 30 },
      { id: 'C-03', nom: 'Réseau Stations Équateur', type: 'Distributeur', ville: 'Franceville', plafond: 3000000000, delai: 45 },
      { id: 'C-04', nom: 'Aviation Services Gabon', type: 'Aviation (Jet A1)', ville: 'Libreville', plafond: 2500000000, delai: 30 },
      { id: 'C-05', nom: 'Gaz du Littoral', type: 'Emplisseur GPL', ville: 'Port-Gentil', plafond: 1500000000, delai: 30 },
      { id: 'C-06', nom: 'Routes & Bitumes du Gabon', type: 'BTP (bitume)', ville: 'Libreville', plafond: 900000000, delai: 60 },
      { id: 'C-07', nom: 'Atlantic Fuel Trading', type: 'Export (fioul)', ville: 'Genève (CH)', plafond: 8000000000, delai: 15 },
      { id: 'C-08', nom: 'Énergie Électrique Industrielle', type: 'Industrie (gasoil)', ville: 'Moanda', plafond: 1200000000, delai: 45 }
    ]);
    if (!store.has('unites')) store.set('unites', [
      { id: 'U100', nom: 'Distillation atmosphérique' }, { id: 'U200', nom: 'Hydrotraitement naphta' }, { id: 'U300', nom: 'Reformage catalytique' }, { id: 'U400', nom: 'Traitement kérosène' },
      { id: 'U500', nom: 'Unité GPL / butane' }, { id: 'U600', nom: 'Parc de stockage' }, { id: 'U700', nom: 'Appontement & chargement' }, { id: 'U800', nom: 'Utilités (vapeur, électricité, eau)' }, { id: 'U900', nom: 'Laboratoire & bâtiments' }
    ]);
  }
  function emp(id) { return store.get('employes', id); }
  function empName(id) { var e = emp(id); return e ? e.nom : id || '—'; }
  function dirName(id) { var d = store.get('directions', id); return d ? d.nom : id; }
  function options(col, label) { return store.all(col).map(function (x) { return { v: x.id, l: typeof label === 'function' ? label(x) : x[label || 'nom'] }; }); }

  /* ------------------------------------------------------------------ modules & navigation */
  var modules = [], currentModule = null, GROUPS = ['Pilotage', 'Management', 'Finances & Achats', 'Opérations', 'Système'];
  function register(m) { modules.push(m); }
  function mod(id) { return modules.find(function (m) { return m.id === id; }); }
  function go(path) { location.hash = '#/' + path.replace(/^#?\/?/, ''); }
  function route() {
    var parts = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
    var m = mod(parts[0]) || mod('dashboard');
    if (!session.can(m)) { m = mod('dashboard'); parts = ['dashboard']; }
    currentModule = m.id;
    $$('.side__link').forEach(function (a) { a.classList.toggle('is-active', a.dataset.m === m.id); });
    $('#top-title').textContent = m.title || m.label;
    $('#top-crumb').textContent = (m.group || '') + ' · ' + (m.label);
    document.title = m.label + ' · SOGARA — Espace de gestion';
    var view = $('#view'); view.innerHTML = ''; view.className = 'view fade-in'; void view.offsetWidth;
    try { m.render(view, parts.slice(1)); } catch (e) { console.error(e); view.innerHTML = '<div class="card card__b">Erreur d\'affichage du module : ' + esc(e.message) + '</div>'; }
    $('#app').classList.remove('nav-open');
    window.scrollTo(0, 0);
    renderBadges();
  }
  function rerender() { route(); }

  function renderNav() {
    var nav = $('#side-nav'), html = '';
    GROUPS.forEach(function (g) {
      var ms = modules.filter(function (m) { return (m.group || 'Pilotage') === g && session.can(m) && !m.hidden; });
      if (!ms.length) return;
      html += '<div class="side__group">' + esc(g) + '</div>' + ms.map(function (m) { return '<a class="side__link" data-m="' + m.id + '" href="#/' + m.id + '">' + icon(m.icon) + '<span>' + esc(m.label) + '</span><em class="count hide"></em></a>'; }).join('');
    });
    nav.innerHTML = html;
  }
  function renderBadges() {
    $$('.side__link').forEach(function (a) { var m = mod(a.dataset.m), c = a.querySelector('.count'); var n = m && m.badge ? m.badge() : 0; if (c) { c.textContent = n; c.classList.toggle('hide', !n); } });
  }
  function renderNotifDot() { var d = $('#notif-dot'); if (d) d.classList.toggle('hide', !db.notifs.some(function (n) { return !n.read; })); }

  /* Toutes les validations en attente, tous modules confondus */
  function pendingAll() {
    var out = [];
    modules.forEach(function (m) { if (m.pending && session.can(m)) { try { (m.pending(session.user()) || []).forEach(function (p) { p.module = m.label; p.icon = p.icon || m.icon; out.push(p); }); } catch (e) { console.warn(e); } } });
    return out.sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
  }

  function openNotifs(anchor) {
    var old = $('.popover'); if (old) { old.remove(); return; }
    var list = db.notifs.slice(0, 20);
    var pop = h('<div class="popover"><div class="popover__h">Notifications<button class="btn ghost sm" style="margin-left:auto" id="nt-all">Tout marquer comme lu</button></div><div class="popover__b list">' +
      (list.length ? list.map(function (n) { return '<a class="list__item" href="' + (n.href || '#') + '" style="color:inherit;' + (n.read ? '' : 'background:#f7faff') + '"><div class="list__icon ' + TONES[n.tone || 'blue'] + '">' + icon('bell') + '</div><div class="list__body"><b>' + esc(n.title) + '</b><div class="small muted">' + esc(n.detail) + '</div><div class="small muted">' + fmt.ago(n.at) + '</div></div></a>'; }).join('') : '<div class="empty">Aucune notification</div>') + '</div></div>');
    anchor.parentNode.style.position = 'relative'; anchor.parentNode.appendChild(pop);
    $('#nt-all', pop).onclick = function (e) { e.stopPropagation(); db.notifs.forEach(function (n) { n.read = true; }); save(); renderNotifDot(); pop.remove(); };
    setTimeout(function () { document.addEventListener('click', function f(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', f); } }); });
  }
  function openUserMenu(anchor) {
    var old = $('.popover'); if (old) { old.remove(); return; }
    var u = session.user();
    var pop = h('<div class="popover" style="width:290px"><div class="card__b row" style="border-bottom:1px solid var(--line-2)">' + avatar(u.name, u.color) + '<div><b>' + esc(u.name) + '</b><div class="small muted">' + esc(u.role) + '</div></div></div><div class="list">' +
      '<a class="list__item" href="#/admin" style="color:inherit"><div class="list__icon tone-grey">' + icon('settings') + '</div><div class="list__body"><b>Paramètres & journal</b></div></a>' +
      '<a class="list__item" href="index.html" style="color:inherit"><div class="list__icon tone-blue">' + icon('users') + '</div><div class="list__body"><b>Changer de profil de démonstration</b></div></a>' +
      '<a class="list__item" href="../index.html" style="color:inherit"><div class="list__icon tone-green">' + icon('globe') + '</div><div class="list__body"><b>Voir le site public</b></div></a>' +
      '<a class="list__item" href="#" id="um-out" style="color:var(--red)"><div class="list__icon tone-red">' + icon('logout') + '</div><div class="list__body"><b>Se déconnecter</b></div></a></div></div>');
    anchor.parentNode.style.position = 'relative'; anchor.parentNode.appendChild(pop);
    $('#um-out', pop).onclick = function (e) { e.preventDefault(); session.logout(); };
    setTimeout(function () { document.addEventListener('click', function f(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', f); } }); });
  }
  function globalSearch(q) {
    q = norm(q).trim(); if (q.length < 2) return;
    var res = [];
    modules.forEach(function (m) { if (m.search && session.can(m)) { try { (m.search(q) || []).slice(0, 6).forEach(function (r) { r.module = m.label; r.icon = m.icon; res.push(r); }); } catch (e) {} } });
    store.all('employes').filter(function (e) { return norm(e.nom + ' ' + e.poste + ' ' + e.id).indexOf(q) >= 0; }).slice(0, 5).forEach(function (e) { res.push({ title: e.nom, sub: e.poste + ' · ' + e.id, href: '#/personnel/' + e.id, module: 'Personnel', icon: 'users' }); });
    modal({ title: 'Recherche : « ' + q + ' »', sub: res.length + ' résultat(s)', body: res.length ? '<div class="list">' + res.map(function (r) { return '<a class="list__item" href="' + r.href + '" style="color:inherit" data-close><div class="list__icon tone-blue">' + icon(r.icon) + '</div><div class="list__body"><b>' + esc(r.title) + '</b><div class="small muted">' + esc(r.module) + ' · ' + esc(r.sub || '') + '</div></div></a>'; }).join('') + '</div>' : '<div class="empty">Aucun résultat. Essayez un nom, un numéro de pièce ou un projet.</div>' });
    $$('[data-close]').forEach(function (a) { a.addEventListener('click', function () { var b = $('.modal-back'); if (b) b.remove(); }); });
  }

  function boot() {
    load();
    var u = session.user();
    if (!u) { location.href = 'index.html'; return; }
    seedCommon();
    modules.forEach(function (m) { if (m.seed) { var s = m.seed(); if (s) Object.keys(s).forEach(function (k) { if (!store.has(k)) store.set(k, s[k]); }); } });
    modules.forEach(function (m) { if (m.init) try { m.init(); } catch (e) { console.warn(e); } });
    if (!db.welcomed) { db.welcomed = true; seedNotifs(); save(); }
    $('#u-name').textContent = u.name; $('#u-role').textContent = u.role; $('#u-av').outerHTML = avatar(u.name, u.color);
    renderNav(); renderNotifDot();
    $('#burger').onclick = function () { $('#app').classList.toggle('nav-open'); };
    $('#scrim').onclick = function () { $('#app').classList.remove('nav-open'); };
    $('#notif-btn').onclick = function (e) { e.stopPropagation(); openNotifs(e.currentTarget); };
    $('#user-btn').onclick = function (e) { e.stopPropagation(); openUserMenu(e.currentTarget); };
    $('#search').addEventListener('keydown', function (e) { if (e.key === 'Enter') globalSearch(e.target.value); });
    $('#reset-demo').onclick = function () { confirmBox('Réinitialiser la démonstration', 'Toutes les saisies faites pendant la démonstration seront effacées et les données d\'exemple rechargées.', 'Réinitialiser', store.reset, 'danger'); };
    window.addEventListener('hashchange', route);
    route();
  }
  function seedNotifs() {
    var now = Date.now(), m = function (min) { return new Date(now - min * 60000).toISOString(); };
    db.notifs = [
      { id: 'N1', at: m(12), title: 'Nouvelle candidature reçue', detail: 'Ingénieur procédés raffinage — via le site internet', href: '#/recrutement', tone: 'violet', read: false },
      { id: 'N2', at: m(55), title: 'Permis de feu à valider', detail: 'Soudure ligne de gasoil — bac T-12', href: '#/hse', tone: 'red', read: false },
      { id: 'N3', at: m(140), title: 'Demande d\'achat en attente', detail: 'Garnitures mécaniques pompes P-101 A/B', href: '#/achats', tone: 'orange', read: false },
      { id: 'N4', at: m(300), title: 'Jalon atteint', detail: 'Plateforme béton 5 000 m² réceptionnée', href: '#/projets', tone: 'green', read: true },
      { id: 'N5', at: m(1500), title: 'Facture client échue', detail: 'Réseau Stations Équateur — relance à envoyer', href: '#/ventes', tone: 'orange', read: true }
    ];
  }

  window.ERP = {
    $: $, $$: $$, esc: esc, h: h, uid: uid, clone: clone, sum: sum, groupBy: groupBy, norm: norm, parseDate: parseDate, iso: iso, addDays: addDays, daysBetween: daysBetween,
    TODAY: TODAY, today: function () { return iso(TODAY); }, MOIS: MOIS, MOIS_L: MOIS_L, fmt: fmt, store: store, log: log, notify: notify, USERS: USERS, session: session, icon: icon,
    ui: { badge: badge, progress: progress, avatar: avatar, kpi: kpi, table: table, modal: modal, confirm: confirmBox, form: form, readForm: readForm, formModal: formModal, toast: toast, tabs: tabs, steps: steps, bars: bars, line: line, donut: donut, gauge: gauge, gantt: gantt, exportCSV: exportCSV, PALETTE: PALETTE, TONES: TONES },
    emp: emp, empName: empName, dirName: dirName, options: options,
    register: register, mod: mod, modules: modules, go: go, rerender: rerender, renderBadges: renderBadges, pendingAll: pendingAll, boot: boot,
    audit: function () { return db.audit; }
  };
})();
