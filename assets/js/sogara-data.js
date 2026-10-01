/* Données partagées entre le site public et l'espace de gestion (démonstration).
   Le site public lit d'abord les données enregistrées par l'espace de gestion (localStorage),
   sinon il utilise ces valeurs par défaut. Ainsi, une offre publiée ou un avancement mis à jour
   dans le back-office apparaît aussitôt sur le site. */
(function () {
  var OFFRES = [
    { id: 'OF-2026-014', titre: 'Ingénieur procédés raffinage', direction: 'Production', lieu: 'Port-Gentil', contrat: 'CDI', niveau: 'Bac+5 · 5 ans d\'expérience', publie: '2026-09-02', cloture: '2026-10-31', statut: 'publiee',
      resume: 'Optimiser la marche des unités de distillation et de reformage, suivre les bilans matière et participer aux études du projet de dégoulottage.',
      missions: ['Suivre les performances des unités et proposer des optimisations', 'Établir les bilans matière et énergie journaliers', 'Participer aux revues d\'ingénierie du projet de modernisation', 'Rédiger les consignes opératoires et former les opérateurs'],
      profil: ['Ingénieur génie chimique ou procédés', 'Expérience en raffinerie ou pétrochimie', 'Maîtrise des outils de simulation (Hysys, Pro/II)', 'Rigueur, culture sécurité, anglais technique'] },
    { id: 'OF-2026-015', titre: 'Technicien instrumentiste', direction: 'Maintenance', lieu: 'Port-Gentil', contrat: 'CDI', niveau: 'BTS / DUT · 3 ans', publie: '2026-09-05', cloture: '2026-10-20', statut: 'publiee',
      resume: 'Assurer la maintenance préventive et corrective des boucles de régulation, transmetteurs et vannes automatiques.',
      missions: ['Étalonner et dépanner les instruments de mesure', 'Intervenir sur les vannes de régulation et systèmes de sécurité', 'Préparer les travaux de l\'arrêt technique', 'Renseigner les ordres de travail dans la GMAO'],
      profil: ['BTS/DUT en instrumentation ou électrotechnique', 'Connaissance des normes ATEX', 'Habilitations électriques appréciées', 'Disponible pour les astreintes'] },
    { id: 'OF-2026-016', titre: 'Opérateur de fabrication (quart)', direction: 'Production', lieu: 'Port-Gentil', contrat: 'CDI', niveau: 'Bac pro / BT · débutant accepté', publie: '2026-09-10', cloture: '2026-10-15', statut: 'publiee',
      resume: 'Conduire les installations en équipe postée (3x8) dans le respect des consignes de sécurité et de qualité.',
      missions: ['Surveiller les paramètres des unités en salle de contrôle et sur le terrain', 'Réaliser les rondes et les prélèvements', 'Appliquer les procédures de démarrage et d\'arrêt', 'Signaler toute anomalie et participer aux exercices HSE'],
      profil: ['Bac pro, BT ou BTS industriel', 'Aptitude au travail posté', 'Sens de l\'observation et de la sécurité', 'Formation assurée en interne'] },
    { id: 'OF-2026-017', titre: 'Responsable HSE chantier', direction: 'HSE', lieu: 'Port-Gentil', contrat: 'CDD 24 mois', niveau: 'Bac+3/5 · 7 ans', publie: '2026-09-12', cloture: '2026-10-25', statut: 'publiee',
      resume: 'Piloter la sécurité des chantiers de modernisation : plans de prévention, permis de travail, audits des entreprises extérieures.',
      missions: ['Valider les plans de prévention et analyses de risques', 'Animer les accueils sécurité et quarts d\'heure HSE', 'Suivre les indicateurs (TF, TG) et les presque-accidents', 'Veiller à la protection de la mangrove et à la gestion des déchets'],
      profil: ['Diplôme HSE / QHSE', 'Expérience de grands chantiers industriels', 'Certifications NEBOSH ou équivalent appréciées', 'Leadership et pédagogie'] },
    { id: 'OF-2026-018', titre: 'Acheteur industriel', direction: 'Achats & Logistique', lieu: 'Port-Gentil', contrat: 'CDI', niveau: 'Bac+4/5 · 4 ans', publie: '2026-09-15', cloture: '2026-10-30', statut: 'publiee',
      resume: 'Gérer les consultations fournisseurs pour les pièces de rechange, équipements et prestations du projet de modernisation.',
      missions: ['Lancer les appels d\'offres et comparer les devis', 'Négocier prix, délais et conditions', 'Suivre les commandes jusqu\'à la livraison', 'Évaluer et développer le panel fournisseurs local'],
      profil: ['Formation achats, commerce ou ingénierie', 'Expérience en milieu industriel', 'Maîtrise d\'un ERP', 'Anglais courant'] },
    { id: 'OF-2026-019', titre: 'Stagiaire laboratoire contrôle qualité', direction: 'Laboratoire', lieu: 'Port-Gentil', contrat: 'Stage 6 mois', niveau: 'Bac+3 chimie', publie: '2026-09-20', cloture: '2026-11-15', statut: 'publiee',
      resume: 'Participer aux analyses des produits finis (densité, point éclair, soufre, distillation) et à la certification des lots.',
      missions: ['Réaliser les analyses selon les normes ASTM', 'Enregistrer les résultats et éditer les certificats', 'Participer à la préparation des normes Africa 5'],
      profil: ['Licence ou master en chimie', 'Rigueur et minutie', 'Intérêt pour l\'industrie pétrolière'] }
  ];

  /* Grands projets. Les faits et dates « fait » viennent de la presse (voir sources) ;
     les pourcentages d'avancement sont des valeurs de démonstration, mises à jour par la SOGARA
     depuis l'espace de gestion. */
  var PROJETS = [
    { id: 'PRJ-01', code: 'REVAMP', nom: 'Dégoulottage de la raffinerie existante', public: true,
      resume: 'Modernisation et fluidification des unités actuelles : nouvelle unité d\'adoucissement du kérosène et quatre nouveaux réservoirs de stockage.',
      partenaire: 'Technip Energies (FEED)', debut: '2025-01-15', fin: '2027-01-31', avancement: 38, statut: 'En cours', budget: 18500000000, engage: 6100000000, chef: 'Direction Projets',
      jalons: [
        { d: '2025-04-15', t: 'Bilan d\'étape présenté au ministère du Pétrole', fait: true },
        { d: '2026-04-14', t: 'Attribution du contrat FEED à Technip Energies', fait: true },
        { d: '2026-11-30', t: 'Fin des études d\'avant-projet (FEED)', fait: false },
        { d: '2027-01-31', t: 'Phase 1 : objectif d\'autosuffisance en carburant', fait: false }
      ],
      taches: [
        { t: 'Études FEED dégoulottage', s: '2026-04-15', e: '2026-11-30', p: 62, lot: 'Ingénierie' },
        { t: 'Unité d\'adoucissement du kérosène', s: '2026-07-01', e: '2027-01-15', p: 20, lot: 'Construction' },
        { t: '4 nouveaux bacs de stockage', s: '2026-06-01', e: '2027-01-31', p: 28, lot: 'Construction' },
        { t: 'Achats équipements longs délais', s: '2026-05-15', e: '2026-12-15', p: 45, lot: 'Achats' },
        { t: 'Mise en service et essais', s: '2027-01-05', e: '2027-01-31', p: 0, lot: 'Démarrage' }
      ] },
    { id: 'PRJ-02', code: 'HCK', nom: 'Complexe d\'hydrocraquage modulaire', public: true,
      resume: 'Nouveau complexe d\'hydrocraquage avec production d\'hydrogène (technologie SMR), nouvelle jetée maritime et installations de déchargement, pour des carburants aux normes Africa 5 / AFRI-6.',
      partenaire: 'Technip Energies · Axens', debut: '2026-04-14', fin: '2029-12-31', avancement: 12, statut: 'Études', budget: 0, engage: 0, chef: 'Direction Projets',
      jalons: [
        { d: '2026-04-14', t: 'Attribution du contrat FEED hydrocraquage + hydrogène + jetée', fait: true },
        { d: '2027-06-30', t: 'Décision finale d\'investissement (objectif)', fait: false },
        { d: '2029-12-31', t: 'Démarrage : 2,7 millions de tonnes/an (objectif 2029-2030)', fait: false }
      ],
      taches: [
        { t: 'FEED hydrocraqueur modulaire', s: '2026-04-15', e: '2027-03-31', p: 30, lot: 'Ingénierie' },
        { t: 'FEED unité hydrogène (SMR)', s: '2026-04-15', e: '2027-03-31', p: 26, lot: 'Ingénierie' },
        { t: 'Études jetée maritime', s: '2026-06-01', e: '2027-05-31', p: 15, lot: 'Ingénierie' },
        { t: 'Montage financier (30 % fonds propres / 70 % dette)', s: '2026-09-01', e: '2027-06-30', p: 10, lot: 'Finance' },
        { t: 'Construction et montage', s: '2027-07-01', e: '2029-09-30', p: 0, lot: 'Construction' },
        { t: 'Démarrage et montée en charge', s: '2029-10-01', e: '2029-12-31', p: 0, lot: 'Démarrage' }
      ] },
    { id: 'PRJ-03', code: 'SITE200', nom: 'Aménagement du site d\'extension (200 ha)', public: true,
      resume: 'Préparation du terrain de 200 hectares : clôture et surveillance, voie de contournement de 5 km, plateforme béton de 5 000 m² pour la base vie, dans le respect de la mangrove.',
      partenaire: 'Entreprises locales', debut: '2025-01-10', fin: '2026-12-31', avancement: 81, statut: 'En cours', budget: 4200000000, engage: 3350000000, chef: 'Direction Projets',
      jalons: [
        { d: '2025-01-10', t: 'Acquisition du terrain de 200 hectares', fait: true },
        { d: '2025-06-30', t: 'Clôture et surveillance du site', fait: true },
        { d: '2025-12-15', t: 'Voie de contournement de 5 km et plateforme béton de 5 000 m²', fait: true },
        { d: '2026-12-31', t: 'Base vie opérationnelle', fait: false }
      ],
      taches: [
        { t: 'Clôture et gardiennage', s: '2025-01-15', e: '2025-06-30', p: 100, lot: 'Génie civil' },
        { t: 'Voie de contournement 5 km', s: '2025-03-01', e: '2025-12-15', p: 100, lot: 'Génie civil' },
        { t: 'Plateforme béton 5 000 m²', s: '2025-07-01', e: '2025-12-15', p: 100, lot: 'Génie civil' },
        { t: 'Base vie (bureaux, réfectoire, sanitaires)', s: '2026-02-01', e: '2026-12-31', p: 55, lot: 'Bâtiment' },
        { t: 'Suivi environnemental de la mangrove', s: '2025-01-15', e: '2026-12-31', p: 70, lot: 'HSE' }
      ] },
    { id: 'PRJ-04', code: 'REACT', nom: 'Remise en service du réacteur (essence et kérosène)', public: true,
      resume: 'Remise en service du réacteur permettant de produire à nouveau l\'essence et le kérosène localement et de réduire les importations.',
      partenaire: 'Équipes SOGARA', debut: '2025-03-01', fin: '2025-12-15', avancement: 100, statut: 'Terminé', budget: 2500000000, engage: 2460000000, chef: 'Direction Technique',
      jalons: [
        { d: '2025-05-04', t: 'Injection de 2,5 milliards FCFA annoncée', fait: true },
        { d: '2025-12-15', t: 'Réacteur remis en service', fait: true }
      ],
      taches: [
        { t: 'Inspection et remplacement du catalyseur', s: '2025-03-01', e: '2025-08-31', p: 100, lot: 'Maintenance' },
        { t: 'Essais et redémarrage', s: '2025-09-01', e: '2025-12-15', p: 100, lot: 'Démarrage' }
      ] }
  ];

  function read(key) { try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  var db = read('sogara_erp_v1');
  var col = function (name, def) { return db && db.c && Array.isArray(db.c[name]) ? db.c[name] : def; };

  window.SOGARA_DATA = {
    offresDefaut: OFFRES,
    projetsDefaut: PROJETS,
    offres: function () { return col('offres', OFFRES).filter(function (o) { return o.statut === 'publiee'; }); },
    projets: function () { return col('projets', PROJETS).filter(function (p) { return p.public; }); },
    /* Candidature envoyée depuis le site : stockée localement, reprise par le module Recrutement. */
    candidater: function (c) {
      var list = read('sogara_candidatures_site') || [];
      c.id = 'WEB-' + Date.now().toString(36).toUpperCase();
      c.date = new Date().toISOString();
      list.push(c);
      try { localStorage.setItem('sogara_candidatures_site', JSON.stringify(list)); } catch (e) {}
      return c.id;
    }
  };
})();
