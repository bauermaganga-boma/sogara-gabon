/* Tableau de bord général : production, indicateurs de chaque module, validations en attente, projets, activité. */
(function () {
  var E = ERP, ui = E.ui, fmt = E.fmt, esc = E.esc;

  /* Production mensuelle 2026 (tonnes de brut traité) — valeurs de simulation. */
  var PROD = {
    mois: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.'],
    brut: [71800, 60400, 67900, 74300, 78100, 80200, 61500, 79400, 81200],
    objectif: [76000, 76000, 76000, 78000, 78000, 78000, 80000, 80000, 80000],
    produits: [
      { label: 'Gasoil', value: 27400, color: '#0f2d5c' }, { label: 'Fioul (résidu atm.)', value: 24100, color: '#475569' },
      { label: 'Kérosène / Jet A1', value: 10300, color: '#2563eb' }, { label: 'Super sans plomb', value: 9800, color: '#1e9e4a' },
      { label: 'Butane', value: 3100, color: '#f5c400' }, { label: 'Bitume', value: 2300, color: '#e8780c' }
    ]
  };

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function greeting() { var hr = new Date().getHours(); return hr < 12 ? 'Bonjour' : hr < 18 ? 'Bon après-midi' : 'Bonsoir'; }

  function render(view) {
    var u = E.session.user();
    var pend = E.pendingAll();
    var sums = [];
    E.modules.forEach(function (m) { if (m.summary && m.id !== 'dashboard' && E.session.can(m)) { try { (m.summary() || []).slice(0, 2).forEach(function (s) { s.mod = m; sums.push(s); }); } catch (e) { console.warn(e); } } });
    var projets = E.store.all('projets').filter(function (p) { return p.statut !== 'Terminé'; });
    var last = PROD.brut[PROD.brut.length - 1], prev = PROD.brut[PROD.brut.length - 2];
    var cumul = E.sum(PROD.brut);
    var today = new Date();

    view.innerHTML =
      '<div class="dash-hero card" style="background:linear-gradient(120deg,#0a1f44 0%,#12366d 60%,#1b4a8f 100%);color:#fff;border:0;overflow:hidden;position:relative;margin-bottom:16px">' +
        '<div style="position:absolute;inset:0;background:url(../assets/img/raffinerie-panorama.jpg) right center/cover;opacity:.18;mask-image:linear-gradient(90deg,transparent 25%,#000 80%);-webkit-mask-image:linear-gradient(90deg,transparent 25%,#000 80%)"></div>' +
        '<div class="card__b" style="position:relative;padding:22px 24px;display:flex;gap:20px;align-items:center;flex-wrap:wrap">' +
          '<div style="flex:1;min-width:240px"><div style="color:#aebbd4;font-size:12.5px">' + esc(cap(today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))) + '</div>' +
          '<h2 style="font-size:24px;margin:4px 0 6px">' + greeting() + ', ' + esc(u.name.split(' ')[0] === 'Direction' ? 'Direction générale' : u.name.split(' ')[0]) + '</h2>' +
          '<div style="color:#c9d4e6">' + (pend.length ? 'Vous avez <b style="color:#fce700">' + pend.length + ' élément' + (pend.length > 1 ? 's' : '') + ' à valider</b> aujourd\'hui.' : 'Aucune validation en attente. Tout est à jour.') + '</div></div>' +
          '<div class="dash-stats">' +
            heroStat(fmt.num(last), 't', 'Brut traité en septembre') +
            heroStat(fmt.num(Math.round(last / 30)), 't/j', 'Moyenne journalière') +
            heroStat(fmt.num(last / 30 * 7.33 / 1000, 1) + ' k', 'b/j', 'Équivalent barils') +
          '</div>' +
        '</div></div>' +

      (sums.length ? '<div class="grid g4" style="margin-bottom:16px">' + sums.slice(0, 8).map(function (s) {
        return '<a href="' + (s.href || '#/' + s.mod.id) + '" style="color:inherit">' + ui.kpi({ label: s.label, value: s.value, unit: s.unit, icon: s.icon || s.mod.icon, tone: s.tone || 'blue', foot: s.foot }) + '</a>';
      }).join('') + '</div>' : '') +

      '<div class="grid g-2-1" style="margin-bottom:16px">' +
        '<div class="card"><div class="card__h"><h3>Production — brut traité 2026</h3><span class="sub">tonnes par mois · cumul ' + fmt.num(cumul) + ' t</span><span class="spacer"></span>' + ui.badge((last >= prev ? '+' : '') + fmt.num((last - prev) / prev * 100, 1) + ' % vs août', last >= prev ? 'green' : 'red') + '</div>' +
          '<div class="card__b">' + ui.bars({ labels: PROD.mois, series: [{ name: 'Réalisé', values: PROD.brut, color: '#0f2d5c' }, { name: 'Objectif', values: PROD.objectif, color: '#fce700' }], height: 230 }) + '<div class="small muted" style="margin-top:6px">Juillet : arrêt partiel de l\'unité de reformage (voir Maintenance & arrêts). Valeurs de simulation.</div></div></div>' +
        '<div class="card"><div class="card__h"><h3>Production par produit</h3><span class="sub">septembre, en tonnes</span></div><div class="card__b">' + ui.donut(PROD.produits, { center: fmt.short(E.sum(PROD.produits, 'value')) + ' t', sub: 'produits finis', size: 140 }) + '</div></div>' +
      '</div>' +

      '<div class="grid g-2-1" style="margin-bottom:16px">' +
        '<div class="card"><div class="card__h"><h3>Mes validations</h3><span class="sub">' + pend.length + ' en attente</span></div><div class="card__b flush">' +
          (pend.length ? '<div class="list">' + pend.slice(0, 8).map(function (p) {
            return '<a class="list__item" href="' + (p.href || '#') + '" style="color:inherit"><div class="list__icon ' + (ui.TONES[p.tone || 'orange']) + '">' + E.icon(p.icon || 'check') + '</div><div class="list__body"><b>' + esc(p.title) + '</b><div class="small muted">' + esc(p.module) + (p.sub ? ' · ' + esc(p.sub) : '') + '</div></div>' + (p.date ? '<span class="small muted nowrap">' + fmt.dateShort(p.date) + '</span>' : '') + '</a>';
          }).join('') + (pend.length > 8 ? '<div class="list__item small muted">… et ' + (pend.length - 8) + ' autre(s)</div>' : '') + '</div>' : '<div class="empty">' + E.icon('check') + '<br>Rien à valider pour le moment.</div>') +
        '</div></div>' +
        '<div class="card"><div class="card__h"><h3>Activité récente</h3></div><div class="card__b flush"><div class="list">' + activity() + '</div></div></div>' +
      '</div>' +

      (projets.length && E.session.can(E.mod('projets') || {}) ? '<div class="card" style="margin-bottom:16px"><div class="card__h"><h3>Projets en cours</h3><span class="sub">planning consolidé</span><span class="spacer"></span><a class="btn sm" href="#/projets">Tous les projets ' + E.icon('arrow') + '</a></div>' +
        ui.gantt({ title: 'Projet', rows: projets.map(function (p) { return { label: p.nom, sub: (p.partenaire || '') + ' · ' + p.statut, start: p.debut, end: p.fin, progress: p.avancement, milestones: (p.jalons || []).map(function (j) { return { date: j.d, label: j.t, done: j.fait }; }), onClick: function () { E.go('projets/' + p.id); } }; }), unit: 'quarter' }) + '</div>' : '') +

      '<div class="grid g3">' + quick(u) + '</div>';
  }

  function heroStat(v, unit, label) { return '<div><div style="font:700 26px Sora,sans-serif;letter-spacing:-.02em">' + v + '<small style="font-size:13px;color:#aebbd4;margin-left:4px">' + unit + '</small></div><div style="font-size:12px;color:#aebbd4">' + label + '</div></div>'; }

  function activity() {
    var a = E.audit().slice(0, 7);
    if (!a.length) {
      var base = Date.now();
      a = [
        { at: new Date(base - 18 * 60000), user: 'Aïcha Mboumba', action: 'Entretien planifié', detail: 'Ingénieur procédés raffinage — jury technique' },
        { at: new Date(base - 95 * 60000), user: 'Serge Ondo Mba', action: 'Bon de commande émis', detail: 'Vannes papillon DN300 — Atlantic Valves Europe' },
        { at: new Date(base - 4 * 3600000), user: 'Patrick Moussavou', action: 'Permis de feu autorisé', detail: 'Unité U600 — soudure ligne gasoil' },
        { at: new Date(base - 7 * 3600000), user: 'Clarisse Nzé', action: 'Facture émise', detail: 'Distributeur Estuaire Carburants' },
        { at: new Date(base - 26 * 3600000), user: 'Hervé Nguema Obame', action: 'Avancement mis à jour', detail: 'Études FEED dégoulottage : 62 %' }
      ];
    }
    return a.map(function (x) { return '<div class="list__item">' + ui.avatar(x.user, null, true) + '<div class="list__body"><b>' + esc(x.action) + '</b><div class="small muted">' + esc(x.detail) + '</div><div class="small muted">' + esc(x.user) + ' · ' + fmt.ago(x.at) + '</div></div></div>'; }).join('');
  }

  function quick(u) {
    var Q = [
      ['projets', 'gantt', 'Planning des projets', 'Gantt, jalons, risques et budgets de la modernisation.'],
      ['recrutement', 'userplus', 'Suivre les recrutements', 'Du dépôt de candidature en ligne jusqu\'à l\'embauche.'],
      ['achats', 'cart', 'Créer une demande d\'achat', 'Circuit de validation, devis comparés, bon de commande.'],
      ['hse', 'shield', 'Permis de travail', 'Permis de feu, espace confiné, consignations, mesures de gaz.'],
      ['maintenance', 'wrench', 'Ordres de travail', 'Maintenance préventive, corrective et arrêts techniques.'],
      ['ventes', 'invoice', 'Facturation clients', 'Devis, factures, encaissements et relances.'],
      ['stocks', 'tank', 'Niveau des bacs', 'Stocks produits, autonomie en jours, magasin de pièces.'],
      ['logistique', 'truck', 'Expéditions du jour', 'Camions-citernes, navires à l\'appontement, flotte.'],
      ['paie', 'wallet', 'Paie du mois', 'Bulletins, cotisations, validation et virements.']
    ].filter(function (q) { var m = E.mod(q[0]); return m && E.session.can(m); }).slice(0, 6);
    return Q.map(function (q) { return '<a class="card card__b row" href="#/' + q[0] + '" style="color:inherit;align-items:flex-start;flex-wrap:nowrap"><div class="list__icon tone-navy">' + E.icon(q[1]) + '</div><div><b>' + esc(q[2]) + '</b><div class="small muted">' + esc(q[3]) + '</div></div></a>'; }).join('');
  }

  E.register({ id: 'dashboard', label: 'Tableau de bord', title: 'Tableau de bord', icon: 'home', group: 'Pilotage', render: render });
})();
