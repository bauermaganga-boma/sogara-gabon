/* SOGARA — page Carrières : offres filtrables, fiche d'offre, candidature en ligne */
(function () {
  'use strict';
  var DATA = window.SOGARA_DATA, UI = window.SOGARA_UI;
  if (!DATA || !UI) return;
  var esc = UI.esc, fmtDate = UI.fmtDate, parseDate = UI.parseDate;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var MAX_CV = 5 * 1024 * 1024;
  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  var offres = (DATA.offres() || []).slice().sort(function (a, b) { return parseDate(b.publie) - parseDate(a.publie); });
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function uniq(key) {
    var seen = {};
    return offres.map(function (o) { return o[key]; }).filter(function (v) { if (!v || seen[v]) return false; seen[v] = 1; return true; }).sort();
  }

  /* ---------- Filtres ---------- */
  var fQ = $('#f-q'), fDir = $('#f-dir'), fCt = $('#f-ct'), list = $('#jobs-list'), count = $('#jobs-count');
  uniq('direction').forEach(function (d) { fDir.insertAdjacentHTML('beforeend', '<option>' + esc(d) + '</option>'); });
  uniq('contrat').forEach(function (d) { fCt.insertAdjacentHTML('beforeend', '<option>' + esc(d) + '</option>'); });

  function render() {
    var q = norm(fQ.value.trim()), dir = fDir.value, ct = fCt.value;
    var res = offres.filter(function (o) {
      if (dir && o.direction !== dir) return false;
      if (ct && o.contrat !== ct) return false;
      if (!q) return true;
      var hay = norm([o.titre, o.direction, o.resume, o.niveau, o.lieu, o.contrat].concat(o.missions || [], o.profil || []).join(' '));
      return q.split(/\s+/).every(function (w) { return hay.indexOf(w) !== -1; });
    });
    count.textContent = res.length + (res.length > 1 ? ' offres' : ' offre') + (res.length === offres.length ? ' publiées' : ' correspondant à votre recherche');
    list.innerHTML = res.map(function (o) {
      return '<button type="button" class="job" data-id="' + esc(o.id) + '">' +
        '<div><h3>' + esc(o.titre) + '</h3><div class="job__meta"><span>' + esc(o.direction) + '</span><span class="c">' + esc(o.contrat) + '</span><span>' + esc(o.lieu) + '</span></div></div>' +
        '<span class="job__go">Détails ' + ARROW + '</span>' +
        '<p class="job__resume">' + esc(o.resume) + '</p>' +
        '<span class="job__date">' + esc(o.niveau) + ' · clôture le ' + fmtDate(o.cloture, { day: 'numeric', month: 'long', year: 'numeric' }) + '</span></button>';
    }).join('') || '<p class="jobs__empty">Aucune offre ne correspond à votre recherche. <a href="#postuler" data-spontanee><strong>Déposez une candidature spontanée</strong></a>.</p>';
  }
  [fQ, fDir, fCt].forEach(function (el) { el.addEventListener('input', render); });
  list.addEventListener('click', function (e) {
    var b = e.target.closest('.job');
    if (b) openJob(b.dataset.id);
  });

  /* ---------- Fiche d'une offre ---------- */
  var modal = $('#job-modal'), current = null, lastFocus = null;
  function li(arr) { return (arr || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); }
  function openJob(id) {
    var o = offres.filter(function (x) { return x.id === id; })[0];
    if (!o) return;
    current = o; lastFocus = document.activeElement;
    $('#jm-ref').textContent = 'Réf. ' + o.id + ' · ' + o.direction;
    $('#jm-title').textContent = o.titre;
    $('#jm-meta').innerHTML = '<span>' + esc(o.contrat) + '</span><span>' + esc(o.lieu) + '</span><span>' + esc(o.niveau) + '</span>';
    $('#jm-resume').textContent = o.resume || '';
    $('#jm-missions').innerHTML = li(o.missions);
    $('#jm-profil').innerHTML = li(o.profil);
    $('#jm-dates').textContent = 'Publiée le ' + fmtDate(o.publie, { day: 'numeric', month: 'long', year: 'numeric' }) + ' · clôture le ' + fmtDate(o.cloture, { day: 'numeric', month: 'long', year: 'numeric' });
    modal.classList.add('is-open'); modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('.modal__box', modal).scrollTop = 0;
    setTimeout(function () { $('#jm-close').focus(); }, 50);
  }
  function closeJob() {
    modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $('#jm-close').addEventListener('click', closeJob);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeJob(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeJob(); });
  $('#jm-apply').addEventListener('click', function () {
    var id = current && current.id;
    closeJob();
    choose(id);
    goForm();
  });

  /* ---------- Formulaire ---------- */
  var form = $('#apply-form'), poste = $('#a-poste'), domWrap = $('#a-domaine-wrap'), dom = $('#a-domaine');
  var cv = $('#a-cv'), fileBox = $('#a-file'), fileName = $('#a-file-name'), note = $('#apply-note');
  poste.innerHTML = '<option value="">Choisissez un poste…</option>' +
    offres.map(function (o) { return '<option value="' + esc(o.id) + '">' + esc(o.titre) + ' — ' + esc(o.contrat) + '</option>'; }).join('') +
    '<option value="SPONTANEE">Candidature spontanée</option>';
  function syncDomaine() {
    var sp = poste.value === 'SPONTANEE';
    domWrap.hidden = !sp;
    dom.required = sp;
    if (!sp) dom.classList.remove('is-invalid');
  }
  function choose(id) { poste.value = id || ''; syncDomaine(); }
  function goForm() {
    var t = $('#postuler');
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () { poste.focus({ preventScroll: true }); }, 600);
  }
  poste.addEventListener('change', syncDomaine);
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-spontanee]');
    if (a && $('#apply-form')) { choose('SPONTANEE'); }
  });

  function cvCheck() {
    var f = cv.files && cv.files[0];
    fileBox.classList.remove('is-ok', 'is-invalid');
    if (!f) { fileName.textContent = 'PDF ou Word · 5 Mo maximum'; return false; }
    var okType = /\.(pdf|docx?|PDF|DOCX?)$/.test(f.name);
    if (f.size > MAX_CV || !okType) {
      fileBox.classList.add('is-invalid');
      fileName.textContent = f.name + ' — ' + (f.size > MAX_CV ? 'fichier trop lourd (5 Mo maximum)' : 'format non accepté (PDF ou Word)');
      return false;
    }
    fileBox.classList.add('is-ok');
    fileName.textContent = f.name + ' · ' + (f.size / 1024 / 1024).toFixed(2).replace('.', ',') + ' Mo';
    return true;
  }
  cv.addEventListener('change', cvCheck);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true, first = null;
    $$('[required]', form).forEach(function (f) {
      var v = f.type === 'checkbox' ? f.checked : String(f.value).trim() !== '';
      if (v && f.type === 'email') v = /^\S+@\S+\.\S+$/.test(f.value.trim());
      if (v && f.name === 'telephone') v = f.value.replace(/\D/g, '').length >= 8;
      if (v && f.type === 'number') v = +f.value >= 0 && +f.value <= 50;
      f.classList.toggle('is-invalid', !v);
      if (!v) { ok = false; first = first || f; }
    });
    var cvOk = cvCheck();
    if (!cvOk) { fileBox.classList.add('is-invalid'); ok = false; first = first || cv; }
    if (!ok) {
      note.classList.add('is-error');
      note.textContent = !cvOk && cv.files && cv.files[0] ? 'Vérifiez votre CV : ' + fileName.textContent.split(' — ')[1] + '.' : 'Merci de compléter les champs signalés en rouge (CV compris).';
      if (first && first.focus) first.focus();
      return;
    }
    var d = new FormData(form), o = offres.filter(function (x) { return x.id === d.get('poste'); })[0];
    var spont = d.get('poste') === 'SPONTANEE', f = cv.files[0];
    var cand = {
      offreId: spont ? null : o.id,
      poste: spont ? 'Candidature spontanée' : o.titre,
      direction: spont ? null : o.direction,
      spontanee: spont,
      domaine: spont ? d.get('domaine') : o.direction,
      nom: String(d.get('nom')).trim().toUpperCase(),
      prenom: String(d.get('prenom')).trim(),
      email: String(d.get('email')).trim(),
      telephone: String(d.get('telephone')).trim(),
      ville: String(d.get('ville')).trim(),
      diplome: d.get('diplome'),
      experience: +d.get('experience'),
      message: String(d.get('message')).trim(),
      cv: f.name,
      cvTaille: f.size,
      statut: 'Nouvelle',
      source: 'Site internet'
    };
    var id = DATA.candidater(cand);
    showConfirm(id, cand);
  });

  function showConfirm(id, c) {
    var box = $('#apply-box');
    box.innerHTML = '<div class="confirm" tabindex="-1" id="confirm">' +
      '<div class="confirm__ico"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></div>' +
      '<h3>Merci ' + esc(c.prenom) + ', votre candidature est envoyée</h3>' +
      '<p>Votre dossier est transmis au service Recrutement. Conservez votre numéro de suivi :</p>' +
      '<div class="confirm__id">' + esc(id) + '</div>' +
      '<dl class="confirm__recap">' +
        '<div><dt>Poste</dt><dd>' + esc(c.poste) + '</dd></div>' +
        (c.spontanee ? '<div><dt>Domaine</dt><dd>' + esc(c.domaine) + '</dd></div>' : '') +
        '<div><dt>Candidat</dt><dd>' + esc(c.prenom + ' ' + c.nom) + '</dd></div>' +
        '<div><dt>CV</dt><dd>' + esc(c.cv) + '</dd></div>' +
      '</dl>' +
      '<p>Le service Recrutement vous contactera si votre profil est retenu pour la suite du processus.</p>' +
      '<div class="hero__actions" style="justify-content:center"><a class="btn btn--navy" href="#offres">Voir les autres offres</a><a class="btn btn--outline" href="index.html">Retour à l\'accueil</a></div>' +
      '</div>';
    var el = $('#confirm');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }

  /* ---------- Paramètres d'URL ---------- */
  render();
  syncDomaine();
  var params = new URLSearchParams(location.search);
  if (params.get('spontanee')) choose('SPONTANEE');
  var pre = params.get('offre');
  if (pre && offres.some(function (o) { return o.id === pre; })) {
    choose(pre);
    setTimeout(function () { openJob(pre); }, 400);
  }
})();
