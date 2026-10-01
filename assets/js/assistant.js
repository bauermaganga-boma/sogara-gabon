/* Assistant SOGARA — questions-réponses programmées (sans serveur, sans IA connectée).
   Répond à partir des informations publiques de l'entreprise et renvoie vers WhatsApp sinon. */
(function () {
  'use strict';

  // À CONFIRMER : numéro WhatsApp de la SOGARA (provisoirement le standard 011 56 33 90)
  var WA_NUMBER = '24111563390';
  var chat = document.getElementById('chat');
  var toggle = document.getElementById('chat-toggle');
  var body = document.getElementById('chat-body');
  var chipsBox = document.getElementById('chat-chips');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var fab = document.getElementById('fab');
  if (!chat || !toggle) return;
  var started = false;
  // Liens vers l'accueil : ancre simple sur la page d'accueil, sinon index.html#…
  var HOME = document.getElementById('entreprise') ? '' : 'index.html';

  function waLink(text) { return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(text); }
  function waButton(text, label) {
    return '<a class="chat__cta" href="' + waLink(text) + '" target="_blank" rel="noopener">' + (label || 'Continuer sur WhatsApp') + '</a>';
  }

  var KB = [
    { id: 'bonjour', keys: ['bonjour', 'bonsoir', 'salut', 'hello', 'coucou', 'bjr', 'mbolo'],
      answer: "Bonjour et bienvenue à la <strong>SOGARA</strong> ! Je peux vous renseigner sur l'entreprise, nos produits, le projet de modernisation, le recrutement ou nos coordonnées. Que souhaitez-vous savoir ?" },
    { id: 'qui', keys: ['qui etes', 'etes qui', 'c est quoi la', 'quoi la sogara', 'que fait', 'presente', 'histoire', 'historique', 'cree', 'creation', 'depuis quand', 'actionna', 'etat gabonais', 'propriet', 'unique raffinerie'],
      answer: "La <strong>Société Gabonaise de Raffinage (SOGARA)</strong> est l'unique raffinerie en activité du Gabon, à <strong>Port-Gentil</strong>. Créée en 1964-1965 (Société Équatoriale de Raffinage), mise en service en <strong>1967</strong>, elle est majoritairement détenue par l'État gabonais depuis 2017. Elle transforme le brut gabonais en carburants pour le marché national.<br>" + '<a class="chat__link" href="#entreprise" data-close>Découvrir l\'entreprise</a>',
      chips: ['Nos produits', 'Chiffres clés', 'Projets de modernisation'] },
    { id: 'client', keys: ['client', 'acheter', 'achat', 'commande', 'commander', 'distributeur', 'prix', 'tarif', 'grossiste', 'station', 'livraison', 'approvisionn', 'cotation', 'devis', 'en gros', 'volumes'],
      answer: "Vous êtes <strong>client professionnel</strong> (distributeur, industriel, compagnie aérienne…) ? Présentez-nous votre besoin (produit, volumes, lieu) via le formulaire de contact en choisissant « Client professionnel » : nos équipes commerciales vous répondront.<br>" + '<a class="chat__link" href="#contact" data-close>Écrire à la SOGARA</a>' + '<br>' + waButton('Bonjour SOGARA, je suis client professionnel et je souhaite des informations sur vos produits.', 'Écrire sur WhatsApp') },
    { id: 'produits', keys: ['produit', 'butane', 'gaz ', 'bouteille', 'super', 'essence', 'carburant', 'kerosene', 'jet ', 'jet a1', 'gasoil', 'gazole', 'diesel', 'fioul', 'fuel', 'residu', 'bitume', 'lampant', 'produisez', 'fabriquez', 'vendez'],
      answer: "La raffinerie produit <strong>six produits</strong> :<ul><li>Butane (gaz domestique)</li><li>Super sans plomb</li><li>Kérosène / Jet A1</li><li>Gasoil</li><li>Fioul / résidu atmosphérique</li><li>Bitume</li></ul>" + '<a class="chat__link" href="#activites" data-close>Voir nos produits et leurs usages</a>',
      chips: ['Clients professionnels', 'Comment ça marche ?', 'Contact'] },
    { id: 'activites', keys: ['activite', 'metier', 'raffin', 'distillation', 'processus', 'fonctionne', 'comment ca marche', 'brut', 'rabi', 'capacite', 'baril', 'hydroskimming', 'laboratoire', 'stockage'],
      answer: "De la réception du <strong>brut gabonais « Rabi »</strong> à l'expédition : distillation, traitement des coupes, contrôle qualité au laboratoire, stockage puis livraison aux distributeurs. La raffinerie, de type hydroskimming, a une capacité d'environ <strong>21 000 barils par jour</strong>.<br>" + '<a class="chat__link" href="#activites" data-close>Voir la chaîne de valeur</a>',
      chips: ['Nos produits', 'Projets de modernisation'] },
    { id: 'chiffres', keys: ['chiffre', 'ca ', 'affaires', 'tonne', 'marche national', 'part de marche', 'combien produi', 'volume', 'resultat', 'performance'],
      answer: "Quelques chiffres clés :<ul><li><strong>716,8 milliards FCFA</strong> de chiffre d'affaires en 2024</li><li><strong>910 113 tonnes</strong> de brut traitées en 2024</li><li>Environ <strong>80 %</strong> du marché national approvisionné</li><li>Capacité d'environ <strong>21 000 barils/jour</strong></li></ul>",
      chips: ['Projets de modernisation', 'Actualités'] },
    { id: 'zone', keys: ['ou etes', 'ou se trouve', 'ou est', 'etes ou', 'adresse', 'situe', 'localisation', 'siege', 'port gentil', 'venir', 'visiter', 'acces', 'itineraire', 'libreville', 'agence', 'bureau'],
      answer: "Notre siège et la raffinerie se trouvent à <strong>Port-Gentil</strong> : Route du Dahu, B.P. 530, Port-Gentil — Gabon.",
      chips: ['Contact', 'Qui êtes-vous ?'] },
    { id: 'projets', keys: ['projet', 'modernis', 'hydrocraq', 'degoulot', 'revamp', 'extension', 'avenir', 'nouvelle raffinerie', 'autosuffis', 'autonomie', 'africa', 'afri', 'norme', 'investiss', 'avancement', 'chantier', '2030', '2027', 'hectare'],
      answer: "La SOGARA modernise sa raffinerie :<ul><li><strong>Dégoulottage</strong> des unités (adoucissement du kérosène, 4 nouveaux bacs)</li><li>Nouveau <strong>complexe d'hydrocraquage</strong> avec production d'hydrogène et jetée maritime</li><li>Aménagement d'un site de <strong>200 hectares</strong></li></ul>Objectifs : autosuffisance en carburant (phase 1, janvier 2027), puis <strong>2,7 millions de tonnes/an</strong> vers 2029-2030 aux normes <strong>Africa 5 / AFRI-6</strong>. Plan de 40 milliards FCFA (30 % fonds propres, 70 % dette).<br>" + '<a class="chat__link" href="#projets" data-close>Suivre l\'avancement des projets</a>',
      chips: ['Technip Energies', 'Environnement'] },
    { id: 'technip', keys: ['technip', 'axens', 'feed', 'partenaire', 'ingenierie'],
      answer: "Le <strong>14 avril 2026</strong>, <strong>Technip Energies</strong> a remporté deux contrats d'ingénierie d'avant-projet détaillée (FEED) : le dégoulottage de la raffinerie existante et le complexe d'hydrocraquage modulaire (hydrogène, jetée maritime). <strong>Axens</strong> est l'autre partenaire technologique cité.<br>" + '<a class="chat__link" href="#actualites" data-close>Lire les actualités</a>',
      chips: ['Projets de modernisation', 'Actualités'] },
    { id: 'emploi', keys: ['emploi', 'recrut', 'offre', 'poste', 'job', 'travailler', 'embauche', 'carriere', 'vacance', 'boulot', 'travail'],
      answer: "Oui, la SOGARA recrute ! Procédés, maintenance, production, HSE, achats, laboratoire… Consultez les offres publiées et postulez en ligne en quelques minutes.<br>" + '<a class="chat__link" href="carrieres.html#offres" data-close>Voir les offres d\'emploi</a>',
      chips: ['Comment postuler ?', 'Stage'] },
    { id: 'candidature', keys: ['candidat', 'postuler', 'cv', 'spontane', 'dossier', 'suivi', 'lettre de motivation', 'motivation'],
      answer: "Pour postuler : choisissez une offre (ou « Candidature spontanée »), remplissez le formulaire et joignez votre <strong>CV (PDF ou Word, 5 Mo maximum)</strong>. Un <strong>numéro de suivi</strong> vous est remis et votre dossier est transmis au service Recrutement.<br>" + '<a class="chat__link" href="carrieres.html#postuler" data-close>Postuler en ligne</a>',
      chips: ['Offres d\'emploi', 'Stage'] },
    { id: 'stage', keys: ['stage', 'stagiaire', 'alternance', 'apprenti', 'etudiant'],
      answer: "Des <strong>stages</strong> sont publiés parmi nos offres (par exemple au laboratoire de contrôle qualité). Vous pouvez aussi envoyer une candidature spontanée en précisant la période souhaitée.<br>" + '<a class="chat__link" href="carrieres.html#offres" data-close>Voir les offres et stages</a>' },
    { id: 'fournisseur', keys: ['fournisseur', 'sous traitan', 'prestataire', 'appel d offre', 'referencement', 'referencer', 'proposer nos services', 'partenariat'],
      answer: "Vous êtes <strong>fournisseur ou prestataire</strong> ? Adressez votre présentation (activité, références, coordonnées) via le formulaire de contact en choisissant « Fournisseur », ou par courriel à <a href=\"mailto:info@sogara.com\">info@sogara.com</a>. Le projet de modernisation mobilise aussi des entreprises locales.<br>" + '<a class="chat__link" href="#contact" data-close>Accéder au formulaire</a>' },
    { id: 'presse', keys: ['presse', 'journalist', 'media', 'interview', 'communique', 'actualite', 'news', 'article', 'reportage', 'nouvelles'],
      answer: "Retrouvez nos dernières actualités (Technip Energies, résultats 2024, modernisation…) dans l'espace presse. <strong>Journalistes</strong> : contactez-nous via le formulaire en choisissant « Presse ».<br>" + '<a class="chat__link" href="#actualites" data-close>Voir les actualités</a>' },
    { id: 'hse', keys: ['securite', 'hse', 'environnement', 'pollution', 'mangrove', 'soufre', 'air ', 'ecolog', 'accident', 'sante', 'climat', 'dechet'],
      answer: "La sécurité et l'environnement guident notre activité : <strong>sécurité industrielle</strong> et culture sécurité partagée, carburants moins soufrés aux normes <strong>Africa 5 / AFRI-6</strong> pour un air plus sain, et <strong>protection de la mangrove</strong> de Port-Gentil sur le site d'extension.<br>" + '<a class="chat__link" href="#hse" data-close>En savoir plus</a>' },
    { id: 'direction', keys: ['directeur', 'dg ', 'adg', 'patron', 'dirigeant', 'avaro', 'yeno', 'direction generale', 'pdg', 'responsable', 'dirige'],
      answer: "La SOGARA est dirigée par <strong>M. Christian Avaro Yeno</strong>, Administrateur Directeur Général. Ancien Directeur général adjoint, il a été nommé à la tête de l'entreprise en 2023 et porte le plan de modernisation." },
    { id: 'contact', keys: ['contact', 'telephone', 'numero', 'appeler', 'joindre', 'mail', 'email', 'courriel', 'whatsapp', 'parler', 'rappeler', 'standard', 'humain', 'conseiller'],
      answer: "Vous pouvez nous joindre :<ul><li>Tél. : <a href=\"tel:+24111563390\">011 56 33 90</a> · <a href=\"tel:+24111563458\">011 56 34 58</a> · <a href=\"tel:+24111563203\">011 56 32 03</a></li><li>E-mail : <a href=\"mailto:info@sogara.com\">info@sogara.com</a></li><li>Adresse : Route du Dahu, B.P. 530, Port-Gentil</li></ul>" + waButton('Bonjour SOGARA, je souhaite être recontacté.', 'Écrire sur WhatsApp') },
    { id: 'espace', keys: ['espace de gestion', 'back office', 'intranet', 'connexion', 'se connecter', 'login', 'erp', 'mot de passe'],
      answer: "L'<strong>espace de gestion</strong> est réservé au personnel de la SOGARA.<br><a class=\"chat__link\" href=\"espace/index.html\">Accéder à l'espace de gestion</a>" },
    { id: 'merci', keys: ['merci', 'au revoir', 'bye', 'a bientot', 'parfait', 'super merci', 'ok merci', 'top'],
      answer: "Avec plaisir ! N'hésitez pas si vous avez d'autres questions. À bientôt sur le site de la SOGARA." }
  ];

  var CHIP_MAP = {
    'Qui êtes-vous ?': 'qui', 'Nos produits': 'produits', 'Comment ça marche ?': 'activites', 'Chiffres clés': 'chiffres',
    'Projets de modernisation': 'projets', 'Technip Energies': 'technip', 'Recrutement': 'emploi', 'Offres d\'emploi': 'emploi',
    'Comment postuler ?': 'candidature', 'Stage': 'stage', 'Clients professionnels': 'client', 'Fournisseurs': 'fournisseur',
    'Actualités': 'presse', 'Environnement': 'hse', 'Contact': 'contact', 'Où êtes-vous ?': 'zone'
  };
  var DEFAULT_CHIPS = ['Qui êtes-vous ?', 'Nos produits', 'Projets de modernisation', 'Recrutement', 'Fournisseurs', 'Contact'];

  function norm(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9+ ]/g, ' ').replace(/\s+/g, ' ');
  }

  function findAnswer(q) {
    var t = ' ' + norm(q) + ' ';
    var best = null, bestScore = 0;
    KB.forEach(function (e) {
      var score = 0;
      e.keys.forEach(function (k) { if (t.indexOf(' ' + k) !== -1) score += k.length > 5 ? 2 : 1; });
      // Les salutations ne l'emportent que si la question ne contient rien d'autre
      if (e.id === 'bonjour' && score) score = 0.5;
      if (score > bestScore) { bestScore = score; best = e; }
    });
    return best;
  }

  function addMsg(html, who) {
    var m = document.createElement('div');
    m.className = 'chat__msg chat__msg--' + who;
    m.innerHTML = html;
    body.appendChild(m);
    body.scrollTop = body.scrollHeight;
    return m;
  }

  function setChips(list) {
    chipsBox.innerHTML = '';
    (list || DEFAULT_CHIPS).forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat__chip';
      b.textContent = c;
      b.addEventListener('click', function () { ask(c, CHIP_MAP[c]); });
      chipsBox.appendChild(b);
    });
  }

  function botReply(html, chips) {
    var typing = addMsg('<span class="chat__typing"><i></i><i></i><i></i></span>', 'bot');
    setTimeout(function () {
      typing.innerHTML = html;
      if (HOME) typing.querySelectorAll('a[href^="#"]').forEach(function (a) { a.setAttribute('href', HOME + a.getAttribute('href')); });
      body.scrollTop = body.scrollHeight;
      setChips(chips);
    }, 550 + Math.min(html.length, 400));
  }

  function ask(text, forcedId) {
    addMsg(text.replace(/&/g, '&amp;').replace(/</g, '&lt;'), 'user');
    var entry = null;
    if (forcedId) KB.forEach(function (e) { if (e.id === forcedId) entry = e; });
    if (!entry) entry = findAnswer(text);
    if (entry) {
      botReply(entry.answer, entry.chips);
    } else {
      botReply("Je n'ai pas la réponse précise à cette question, mais nos équipes peuvent vous répondre directement :<br>" +
        waButton('Bonjour SOGARA, j\'ai une question : ' + text, 'Poser ma question sur WhatsApp') +
        '<br><a class="chat__link" href="mailto:info@sogara.com">ou écrire à info@sogara.com</a>');
    }
  }

  function open() {
    chat.classList.add('is-open');
    fab.classList.add('is-chat-open');
    chat.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    if (!started) {
      started = true;
      botReply("Bonjour 👋 Je suis l'<strong>Assistant SOGARA</strong>. Posez-moi vos questions sur l'entreprise, nos produits, la modernisation de la raffinerie ou le recrutement — je vous réponds tout de suite.");
    }
    setTimeout(function () { input.focus(); }, 300);
  }
  function close() {
    chat.classList.remove('is-open');
    fab.classList.remove('is-chat-open');
    chat.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', function () { chat.classList.contains('is-open') ? close() : open(); });
  document.getElementById('chat-close').addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && chat.classList.contains('is-open')) close(); });
  body.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-close]');
    if (a) close();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q) return;
    input.value = '';
    ask(q);
  });

  // Invitation discrète après quelques secondes, une seule fois par visite
  setTimeout(function () {
    try { if (sessionStorage.getItem('sogaraChatHint')) return; sessionStorage.setItem('sogaraChatHint', '1'); } catch (e) {}
    if (!chat.classList.contains('is-open')) fab.classList.add('is-hint');
    setTimeout(function () { fab.classList.remove('is-hint'); }, 6000);
  }, 5000);
})();
