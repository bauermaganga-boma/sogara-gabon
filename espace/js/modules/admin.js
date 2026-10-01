/* Administration : utilisateurs & droits, circuits de validation, journal d'audit, intégrations, données de démonstration. */
(function () {
  var E = ERP, ui = E.ui, fmt = E.fmt, esc = E.esc;
  var PROFILS = [['admin', 'Direction générale'], ['rh', 'Ressources humaines'], ['achats', 'Achats & Logistique'], ['finance', 'Finances'], ['hse', 'HSE'], ['projets', 'Projets & Maintenance']];

  function render(view, params) {
    var tab = params[0] || 'droits';
    view.innerHTML = '<div class="section-title" style="margin-bottom:14px"><div><h2>Administration</h2><p>Comptes, droits d\'accès, circuits de validation et traçabilité.</p></div></div>' +
      ui.tabs([{ k: 'droits', l: 'Utilisateurs & droits' }, { k: 'circuits', l: 'Circuits de validation' }, { k: 'journal', l: 'Journal d\'audit', n: E.audit().length }, { k: 'integrations', l: 'Intégrations' }, { k: 'demo', l: 'Données de démonstration' }], tab, function (k) { E.go('admin/' + k); }) +
      '<div id="adm"></div>';
    var el = E.$('#adm', view);
    if (tab === 'droits') droits(el); else if (tab === 'circuits') circuits(el); else if (tab === 'journal') journal(el); else if (tab === 'integrations') integrations(el); else demo(el);
  }

  function droits(el) {
    var mods = E.modules.filter(function (m) { return !m.hidden && m.id !== 'admin'; });
    el.innerHTML = '<div class="grid g-1-2">' +
      '<div class="card"><div class="card__h"><h3>Comptes</h3><span class="sub">' + E.USERS.length + ' comptes de démonstration</span></div><div class="card__b flush"><div class="list">' +
      E.USERS.map(function (u) { return '<div class="list__item">' + ui.avatar(u.name, u.color) + '<div class="list__body"><b>' + esc(u.name) + '</b><div class="small muted">' + esc(u.role) + '</div><div class="small"><span class="mono">' + u.login + '</span> · ' + ui.badge('Actif', 'green') + '</div></div></div>'; }).join('') +
      '</div></div></div>' +
      '<div class="card"><div class="card__h"><h3>Matrice des droits</h3><span class="sub">modules accessibles par profil</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Module</th>' + PROFILS.map(function (p) { return '<th class="center">' + esc(p[1]) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      mods.map(function (m) { return '<tr><td class="strong nowrap">' + esc(m.label) + '</td>' + PROFILS.map(function (p) { var ok = p[0] === 'admin' || !m.roles || m.roles.indexOf(p[0]) >= 0; return '<td class="center">' + (ok ? '<span style="color:var(--green)">' + E.icon('check') + '</span>' : '<span class="muted">—</span>') + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div><div class="card__b small muted">En production : comptes nominatifs pour chaque agent, mot de passe personnel, double authentification pour la Direction et la Finance, droits réglables par module et par action (lecture, saisie, validation).</div></div>' +
      '</div>';
    E.$$('svg', el).forEach(function (s) { s.style.width = '16px'; });
  }

  function circuits(el) {
    var C = [
      ['Demande d\'achat < 5 M FCFA', ['Demandeur', 'Chef de service', 'Achats']],
      ['Demande d\'achat 5 à 50 M FCFA', ['Demandeur', 'Chef de service', 'Directrice financière', 'Achats']],
      ['Demande d\'achat > 50 M FCFA', ['Demandeur', 'Chef de service', 'Directrice financière', 'Direction générale', 'Achats']],
      ['Recrutement', ['Besoin du manager', 'Validation DRH', 'Validation DG', 'Publication', 'Sélection', 'Validation embauche DG']],
      ['Paie mensuelle', ['Préparation', 'Contrôle RH', 'Validation DAF', 'Virements', 'Clôture']],
      ['Permis de feu', ['Demande', 'Analyse de risques', 'Mesure de gaz', 'Autorisation émetteur', 'Visa chef d\'unité', 'Clôture']],
      ['Congés', ['Demande', 'Manager', 'RH']],
      ['Facture fournisseur', ['Réception', 'Rapprochement commande / réception', 'Bon à payer', 'Paiement']]
    ];
    el.innerHTML = '<div class="grid g2">' + C.map(function (c) { return '<div class="card"><div class="card__h"><h3>' + esc(c[0]) + '</h3></div><div class="card__b">' + ui.steps(c[1], -1) + '</div></div>'; }).join('') + '</div>' +
      '<div class="alert tone-blue" style="margin-top:16px">' + E.icon('info') + '<div>Les circuits, seuils et valideurs sont paramétrables. Chaque visa est horodaté et conservé dans le journal d\'audit.</div></div>';
  }

  function journal(el) {
    var rows = E.audit();
    el.innerHTML = '<div class="card"><div class="card__h"><h3>Journal d\'audit</h3><span class="sub">toutes les actions réalisées pendant la démonstration</span><span class="spacer"></span><button class="btn sm" id="exp">' + E.icon('download') + 'Exporter</button></div>' +
      ui.table([{ label: 'Date', render: function (r) { return '<span class="nowrap">' + fmt.datetime(r.at) + '</span>'; } }, { label: 'Utilisateur', render: function (r) { return esc(r.user); } }, { label: 'Module', key: 'module' }, { label: 'Action', render: function (r) { return '<b>' + esc(r.action) + '</b>'; } }, { label: 'Détail', key: 'detail' }], rows, { empty: 'Aucune action pour le moment : validez une demande, créez un bon de commande… elles apparaîtront ici.' }) + '</div>';
    E.$('#exp', el).onclick = function () { ui.exportCSV('journal-audit', [{ label: 'Date', key: 'at' }, { label: 'Utilisateur', key: 'user' }, { label: 'Module', key: 'module' }, { label: 'Action', key: 'action' }, { label: 'Détail', key: 'detail' }], rows); };
  }

  function integrations(el) {
    var I = [
      ['globe', 'Site internet SOGARA', 'Offres d\'emploi, candidatures et avancement des projets synchronisés avec le site public.', 'Actif', 'green'],
      ['lock', 'Base de données sécurisée', 'Hébergement des données, sauvegardes quotidiennes, comptes nominatifs.', 'À activer', 'orange'],
      ['mail', 'Messagerie professionnelle', 'Envoi automatique des bons de commande, factures, convocations et relances par e-mail.', 'À activer', 'orange'],
      ['phone', 'WhatsApp Business', 'Notifications aux candidats, transporteurs et fournisseurs.', 'Option', 'grey'],
      ['money', 'Comptabilité', 'Export des écritures (achats, ventes, paie) vers le logiciel comptable.', 'Option', 'grey'],
      ['download', 'Excel / PDF', 'Export de toutes les listes et impression des documents.', 'Actif', 'green']
    ];
    el.innerHTML = '<div class="grid g3">' + I.map(function (i) { return '<div class="card card__b"><div class="row" style="margin-bottom:10px"><div class="list__icon tone-navy">' + E.icon(i[0]) + '</div><b>' + esc(i[1]) + '</b></div><p class="small muted" style="margin:0 0 12px">' + esc(i[2]) + '</p>' + ui.badge(i[3], i[4]) + '</div>'; }).join('') + '</div>';
  }

  function demo(el) {
    var n = 0; try { n = Math.round((localStorage.getItem('sogara_erp_v1') || '').length / 1024); } catch (e) {}
    el.innerHTML = '<div class="grid g2"><div class="card card__b"><h3 style="margin-bottom:8px">Données de démonstration</h3><p class="muted">Toutes les données sont fictives (sauf les faits publics sur les projets de modernisation) et sont enregistrées dans ce navigateur (' + n + ' Ko). Réinitialisez pour retrouver le jeu d\'exemple d\'origine.</p><button class="btn danger" id="rst">' + E.icon('refresh') + 'Réinitialiser la démonstration</button></div>' +
      '<div class="card card__b"><h3 style="margin-bottom:8px">Scénario de présentation conseillé</h3><ol class="muted" style="margin:0;padding-left:18px;line-height:1.7"><li>Sur le site public, page Carrières : envoyer une candidature.</li><li>Se connecter avec le profil <b>Ressources humaines</b> : la candidature est arrivée dans le Recrutement.</li><li>Profil <b>Achats</b> : créer une demande d\'achat, puis la valider avec <b>Finance</b> et <b>Direction</b>.</li><li>Profil <b>HSE</b> : autoriser un permis de feu (mesure de gaz obligatoire).</li><li>Profil <b>Projets</b> : mettre à jour l\'avancement d\'un projet public → visible sur le site.</li></ol></div></div>';
    E.$('#rst', el).onclick = function () { ui.confirm('Réinitialiser la démonstration', 'Toutes les saisies seront effacées.', 'Réinitialiser', E.store.reset, 'danger'); };
  }

  E.register({ id: 'admin', label: 'Administration', title: 'Administration', icon: 'settings', group: 'Système', roles: ['__admin_only'], render: render });
})();
