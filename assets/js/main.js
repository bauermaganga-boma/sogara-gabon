/* SOGARA — scripts communs du site public (accueil + carrières) */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var DATA = window.SOGARA_DATA || null;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function parseDate(d) { var p = String(d || '').split('-'); return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1); }
  function fmtDate(d, opts) {
    var dt = parseDate(d);
    if (isNaN(dt)) return esc(d);
    return dt.toLocaleDateString('fr-FR', opts || { day: 'numeric', month: 'short', year: 'numeric' });
  }
  var ICON_ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  window.SOGARA_UI = { esc: esc, fmtDate: fmtDate, parseDate: parseDate };

  /* ---------- Projets (accueil) ---------- */
  function statusClass(s) {
    var n = String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (n.indexOf('termin') === 0) return 'termine';
    if (n.indexOf('etude') === 0) return 'etudes';
    return 'encours';
  }
  function renderProjets() {
    var box = $('#pcards');
    if (!box || !DATA) return;
    var list = DATA.projets() || [];
    var C = 2 * Math.PI * 40;
    box.innerHTML = list.map(function (p) {
      var pct = Math.max(0, Math.min(100, +p.avancement || 0));
      var jal = (p.jalons || []).slice().sort(function (a, b) { return parseDate(a.d) - parseDate(b.d); }).map(function (j) {
        return '<li class="' + (j.fait ? 'is-done' : '') + '"><span class="jalon__dot">' +
          (j.fait ? '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>' : '') + '</span>' +
          '<span class="jalon__date">' + fmtDate(j.d) + (j.fait ? ' · réalisé' : ' · à venir') + '</span><span class="t">' + esc(j.t) + '</span></li>';
      }).join('');
      return '<article class="pcard reveal" data-pct="' + pct + '">' +
        '<div class="pcard__top"><div>' +
          '<span class="pcard__code">' + esc(p.code) + '</span> ' +
          '<span class="pstatus pstatus--' + statusClass(p.statut) + '"><i></i>' + esc(p.statut) + '</span>' +
          '<h3>' + esc(p.nom) + '</h3>' +
          '<p class="pcard__partner">Partenaire : <b>' + esc(p.partenaire) + '</b></p>' +
        '</div>' +
        '<div class="ring" role="img" aria-label="Avancement ' + pct + ' %"><svg viewBox="0 0 100 100"><circle class="ring__bg" cx="50" cy="50" r="40"/>' +
          '<circle class="ring__fg" cx="50" cy="50" r="40" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" data-c="' + C.toFixed(1) + '"/></svg>' +
          '<span class="ring__val"><span data-count="' + pct + '">0</span><small>%</small></span></div>' +
        '</div>' +
        '<p class="pcard__resume">' + esc(p.resume) + '</p>' +
        '<div class="pbar-legend"><span>Avancement global</span><span>' + pct + ' %</span></div>' +
        '<div class="pbar"><span data-w="' + pct + '"></span></div>' +
        '<div class="jalons"><h4>Jalons</h4><ol>' + jal + '</ol></div>' +
        '<p class="pcard__end"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>' +
          (pct >= 100 ? 'Achevé : <b>' : 'Fin visée : <b>') + fmtDate(p.fin, { month: 'long', year: 'numeric' }) + '</b></p>' +
      '</article>';
    }).join('') || '<p>Les projets seront bientôt présentés ici.</p>';
  }

  function renderGantt() {
    var box = $('#gantt');
    if (!box || !DATA) return;
    var y0 = 2025, y1 = 2031;
    var start = new Date(y0, 0, 1), span = new Date(y1, 0, 1) - start;
    function pos(d) { return Math.max(0, Math.min(100, (parseDate(d) - start) / span * 100)); }
    var years = '';
    for (var y = y0; y < y1; y++) years += '<span>' + y + '</span>';
    var rows = (DATA.projets() || []).map(function (p) {
      var a = pos(p.debut), b = pos(p.fin), pct = Math.max(0, Math.min(100, +p.avancement || 0));
      return '<div class="gantt__row"><div class="gantt__name">' + esc(p.nom) + '<small>' + esc(p.partenaire) + '</small></div>' +
        '<div class="gantt__track"><div class="gantt__bar" style="left:' + a.toFixed(2) + '%;width:' + Math.max(1.5, b - a).toFixed(2) + '%" title="' +
        esc(fmtDate(p.debut) + ' → ' + fmtDate(p.fin)) + '"><span data-w="' + pct + '"></span><b>' + pct + ' %</b></div></div></div>';
    }).join('');
    rows += '<div class="gantt__row"><div class="gantt__name">Objectif 2,7 Mt/an<small>Normes Africa 5 / AFRI-6</small></div>' +
      '<div class="gantt__track"><div class="gantt__bar gantt__bar--goal" style="left:' + pos('2029-10-01').toFixed(2) + '%;width:' + (pos('2030-12-31') - pos('2029-10-01')).toFixed(2) + '%"><b>2029-2030</b></div></div></div>';
    var today = new Date(), tp = (today - start) / span * 100;
    var marker = (tp > 0 && tp < 100) ? '<div class="gantt__today" style="left:calc(var(--gcol) + (100% - var(--gcol)) * ' + (tp / 100).toFixed(4) + ')"></div>' : '';
    box.innerHTML = '<div class="gantt__years"><span>Projet</span><div class="gantt__scale">' + years + '</div></div>' + rows + marker;
  }

  /* ---------- Offres (aperçu accueil) ---------- */
  function renderJobsTeaser() {
    var box = $('#jobs-teaser');
    if (!box || !DATA) return;
    var list = (DATA.offres() || []).slice().sort(function (a, b) { return parseDate(b.publie) - parseDate(a.publie); }).slice(0, 3);
    box.innerHTML = list.map(function (o) {
      return '<a class="job reveal" href="carrieres.html?offre=' + encodeURIComponent(o.id) + '#offres">' +
        '<div><h3>' + esc(o.titre) + '</h3><div class="job__meta"><span>' + esc(o.direction) + '</span><span class="c">' + esc(o.contrat) + '</span><span>' + esc(o.lieu) + '</span></div></div>' +
        '<span class="job__go">Voir l\'offre ' + ICON_ARROW + '</span>' +
        '<span class="job__date">Publiée le ' + fmtDate(o.publie, { day: 'numeric', month: 'long', year: 'numeric' }) + (o.cloture ? ' · clôture le ' + fmtDate(o.cloture, { day: 'numeric', month: 'long' }) : '') + '</span></a>';
    }).join('') || '<p class="jobs__empty">Aucune offre publiée pour le moment. Vous pouvez déposer une candidature spontanée.</p>';
  }

  renderProjets();
  renderGantt();
  renderJobsTeaser();

  /* ---------- En-tête ---------- */
  var header = $('#header');
  if (header && !header.classList.contains('header--solid')) {
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 40); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Menu mobile ---------- */
  var burger = $('#burger'), nav = $('#nav');
  if (burger && nav) {
    var closeNav = function () {
      nav.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Ouvrir le menu');
      document.body.classList.remove('nav-open');
      document.body.style.overflow = '';
    };
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
      document.body.style.overflow = open ? 'hidden' : '';
      document.body.classList.toggle('nav-open', open);
    });
    $$('a', nav).forEach(function (a) { a.addEventListener('click', closeNav); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('is-open')) closeNav(); });
  }

  /* ---------- Compteurs et barres ---------- */
  function fmtNum(v, dec) {
    return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/[\u202f\u00a0]/g, '\u00a0');
  }
  function runCounter(el) {
    if (el.dataset.done) return;
    el.dataset.done = '1';
    var target = parseFloat(el.dataset.count) || 0, dec = +el.dataset.decimals || 0;
    var pre = el.dataset.prefix || '', raw = el.hasAttribute('data-raw');
    var out = function (v) { el.textContent = pre + (raw ? Math.round(v) : fmtNum(v, dec)); };
    if (reduce) { out(target); return; }
    var t0 = null, dur = 1800, from = raw ? Math.max(0, target - 60) : 0;
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      out(from + (target - from) * e);
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function animateIn(root) {
    $$('[data-count]', root).forEach(runCounter);
    $$('[data-w]', root).forEach(function (b) { b.style.width = b.dataset.w + '%'; });
    $$('.ring__fg', root).forEach(function (c) {
      var C = parseFloat(c.dataset.c), pct = parseFloat(c.closest('.pcard').dataset.pct) || 0;
      c.style.strokeDashoffset = (C * (1 - pct / 100)).toFixed(1);
    });
  }
  var animTargets = $$('.kpis, .pcard, .gantt-wrap');
  if ('IntersectionObserver' in window) {
    var aio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { animateIn(e.target); aio.unobserve(e.target); } });
    }, { threshold: 0.25 });
    animTargets.forEach(function (t) { aio.observe(t); });
  } else animTargets.forEach(animateIn);

  /* ---------- Apparition au défilement ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el, i) { el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Lien actif dans la navigation ---------- */
  if (nav) {
    var links = $$('a[href^="#"]:not(.btn)', nav);
    var sections = links.map(function (l) { return document.querySelector(l.getAttribute('href')); });
    if ('IntersectionObserver' in window) {
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          links.forEach(function (l) { l.classList.toggle('is-active', l.getAttribute('href') === '#' + e.target.id); });
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(function (s) { if (s) spy.observe(s); });
    }
  }

  /* ---------- Visionneuse ---------- */
  var lb = $('#lightbox');
  if (lb) {
    var lbImg = $('img', lb), lbCap = $('figcaption', lb), group = [], idx = 0;
    var show = function (i) {
      idx = (i + group.length) % group.length;
      var fig = group[idx], img = $('img', fig), cap = $('figcaption', fig);
      lbImg.src = img.currentSrc || img.src; lbImg.alt = img.alt;
      lbCap.textContent = cap ? cap.textContent : img.alt;
    };
    var openLb = function (list, fig) {
      group = list.filter(function (f) { return !f.classList.contains('is-hidden'); });
      show(group.indexOf(fig));
      lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      $('.lightbox__close', lb).focus();
    };
    var closeLb = function () {
      lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    };
    var items = $$('.g-item');
    items.forEach(function (fig) {
      fig.tabIndex = 0;
      fig.setAttribute('role', 'button');
      fig.addEventListener('click', function () { openLb(items, fig); });
      fig.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLb(items, fig); } });
    });
    $('.lightbox__close', lb).addEventListener('click', closeLb);
    $('.lightbox__prev', lb).addEventListener('click', function (e) { e.stopPropagation(); show(idx - 1); });
    $('.lightbox__next', lb).addEventListener('click', function (e) { e.stopPropagation(); show(idx + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeLb();
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });
  }

  /* ---------- Formulaire de contact : ouvre la messagerie ---------- */
  var form = $('#contact-form');
  if (form) {
    $$('[data-contact-type]').forEach(function (a) {
      a.addEventListener('click', function () { var s = $('#contact-type'); if (s) s.value = a.dataset.contactType; });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      $$('[required]', form).forEach(function (f) {
        var valid = f.value.trim() !== '' && (f.type !== 'email' || /^\S+@\S+\.\S+$/.test(f.value.trim()));
        f.classList.toggle('is-invalid', !valid);
        if (!valid) ok = false;
      });
      var note = $('#form-note');
      note.classList.toggle('is-error', !ok);
      if (!ok) { note.textContent = 'Merci de compléter les champs obligatoires (nom, courriel valide, message).'; return; }
      var d = new FormData(form);
      var subject = 'Contact site SOGARA — ' + d.get('type');
      var body = 'Nom : ' + d.get('nom') + '\nSociété / organisme : ' + (d.get('societe') || '—') + '\nCourriel : ' + d.get('email') +
        '\nTéléphone : ' + (d.get('tel') || '—') + '\nVous êtes : ' + d.get('type') + '\n\n' + d.get('message');
      window.location.href = 'mailto:' + (form.dataset.mail || '') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      note.textContent = 'Merci ! Votre messagerie va s\'ouvrir pour finaliser l\'envoi.';
    });
  }
})();
