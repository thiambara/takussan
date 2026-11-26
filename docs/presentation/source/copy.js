/* Textes éditoriaux du dossier. Règle : phrases courtes, mots du métier avant mots du code. */
const COPY = {
  actorOrder: ['visitor', 'customer', 'owner', 'agent', 'agency_admin', 'provider', 'platform'],
  actors: {
    visitor:      { short: 'Visiteur',     icon: 'eye',       color: 'var(--d3)', flow: 'cherche, publie sans compte' },
    customer:     { short: 'Locataire',    icon: 'key',       color: 'var(--d1)', flow: 'réserve, signe, paie' },
    owner:        { short: 'Propriétaire', icon: 'house',     color: 'var(--d0)', flow: 'confie ses biens, encaisse' },
    agent:        { short: 'Agent',        icon: 'briefcase', color: 'var(--d2)', flow: 'gère le portefeuille' },
    agency_admin: { short: 'Agence',       icon: 'building',  color: 'var(--d4)', flow: "pilote l'équipe" },
    provider:     { short: 'Prestataire',  icon: 'wrench',    color: 'var(--d5)', flow: 'répare, facture' },
    platform:     { short: 'Plateforme',   icon: 'shield',    color: 'var(--d8)', flow: 'modère, opère' }
  },
  entryBiz: {
    visitor: { summary: "Le visiteur n'a pas besoin de compte pour regarder. Le compte naît au premier geste qui l'exige, avec son seul numéro de téléphone.", steps: [
      ['Il arrive et cherche', "Accueil, liste et carte des biens sont ouverts à tous, sans inscription."],
      ['Il demande sans compte', "Demander un contact, une visite ou une alerte ne demande qu'un nom et un téléphone."],
      ['Il donne son numéro', "Quand il veut réserver, écrire ou publier, il reçoit un code par SMS. Pas de mot de passe à inventer."],
      ['Le code crée le compte', "Le premier code juste suffit : le compte existe, sans formulaire."],
      ['Il dit ce qu\'il veut', "Chercher, publier ou travailler comme professionnel : chaque choix ouvre le bon espace."] ] },
    customer: { summary: "Le locataire est un visiteur qui a un compte. Il devient client d'une agence à sa première demande, et locataire quand son bail commence.", steps: [
      ['Il a un compte', "Connexion par numéro et code SMS, comme le visiteur."],
      ['Il précise sa recherche', "Il choisit ses quartiers et reçoit des alertes, par e-mail ou WhatsApp."],
      ['Il fait une demande', "Sa première candidature, réservation ou offre crée sa fiche chez l'agence qui gère le bien."],
      ['Ou l\'agence l\'invite', "L'agence l'a déjà enregistré : il reçoit un lien, confirme par SMS, et retrouve son dossier."],
      ['Son bail commence', "Il voit son bail, ses loyers, ses reçus et ses demandes d'intervention au même endroit."] ] },
    owner: { summary: "Deux portes : le particulier qui publie lui-même son bien, ou le bailleur qu'une agence invite parce qu'elle gère ses biens.", steps: [
      ['Il remplit son annonce', "Sans compte : tout reste dans son navigateur, photos comprises. Il voit combien de personnes cherchent dans sa ville."],
      ['Il donne son numéro', "Au moment de publier, un code SMS crée son compte."],
      ['Son espace est prêt', "Takussan lui ouvre un espace à son nom, sans question, et met l'annonce en ligne."],
      ['Ou une agence l\'invite', "Il reçoit un lien, vérifie son numéro et retrouve les biens que l'agence gère pour lui."],
      ['Il fait vérifier son identité', "Pièce d'identité et RIB, pour être payé de ses loyers en toute sécurité."] ] },
    agent: { summary: "L'agent n'entre que sur invitation de son agence. Il hérite des droits que l'agence donne à son poste.", steps: [
      ['L\'agence l\'invite', "L'administrateur saisit son nom et son contact ; un lien lui est envoyé."],
      ['Il ouvre le lien', "Il voit quelle agence l'invite, qui l'invite et pour quel poste."],
      ['Il confirme son numéro', "Un code SMS, puis il accepte : son compte est créé s'il n'existait pas."],
      ['Il complète son profil', "Carte professionnelle, spécialité, quartiers couverts, langues. Son premier prospect l'attend."],
      ['Il travaille', "Ses écrans ne montrent que ce que son poste l'autorise à faire."] ] },
    agency_admin: { summary: "Trois façons d'ouvrir une agence : par l'équipe Takussan, par soi-même, ou en grandissant depuis un espace de particulier.", steps: [
      ['Par l\'équipe Takussan', "Takussan crée l'agence et son gérant, qui reçoit un e-mail d'activation."],
      ['Ou par soi-même', "Avec un numéro vérifié, il ouvre son espace pro. L'agence ne publie rien tant qu'elle n'est pas vérifiée."],
      ['Ou en grandissant', "Un particulier qui publie déjà peut demander à devenir une agence."],
      ['Il sécurise son accès', "Mot de passe et double authentification."],
      ['Il fait vérifier l\'agence', "Registre du commerce (RCCM), NINEA, pièce du dirigeant. Takussan vérifie, puis l'agence publie."] ] },
    provider: { summary: "Le prestataire n'entre que sur invitation d'une agence, souvent à cause d'une panne réelle à réparer.", steps: [
      ['Une agence l\'invite', "Elle saisit son métier, ses quartiers et son contact."],
      ['Il ouvre le lien', "Il voit qui l'invite et ce qui l'attend, puis confirme par SMS."],
      ['Il présente son activité', "Métiers, zones, tarifs indicatifs, pièce d'identité, créneaux de la semaine."],
      ['Il est actif', "Il arrive directement sur sa première intervention. Une autre agence peut l'inviter à son tour."] ] },
    platform: { summary: "Personne ne devient opérateur seul. Les membres de l'équipe Takussan sont cooptés et protégés par une double authentification.", steps: [
      ['Le tout premier', "Le premier opérateur est créé par l'équipe technique, directement sur le serveur."],
      ['La cooptation', "Un super-admin invite un collègue et choisit son niveau : lecture, support ou super-admin."],
      ['L\'acceptation', "Le collègue ouvre le lien et crée son compte."],
      ['La double authentification', "Obligatoire : c'est sa confirmation qui ouvre la console."] ] }
  },
  livreNote: "<b>À lire avant tout chiffre.</b> « Livré » veut dire présent dans le code et couvert par les tests. Ce n'est pas « en production » : aujourd'hui, seule la préproduction est en service, et la production arrive avec la phase F du plan. Plusieurs fonctions attendent aussi une clé de prestataire (SMS, WhatsApp, paiement) à poser au déploiement.",
  livreShort: "« Livré » = dans le code et testé. Seule la préproduction est en service aujourd'hui.",
  prio: { P0: 'indispensable au lancement', P1: 'attendu au lancement', P2: 'version 2', P3: 'plus tard' },
  titles: {
    accueil: 'Takussan en 5 minutes', acteurs: 'Les acteurs', parcours: 'Visites guidées', donnees: 'Le modèle de données',
    architecture: "L'architecture", requete: "La vie d'une requête", acces: 'Profils et capacités', asynchrone: 'Asynchrone et temps réel',
    deploiement: 'Déploiement et CI', ingenieur: 'Guide du premier jour', chiffres: 'En chiffres', glossaire: 'Glossaire'
  },
  home: {
    eyebrow: 'Le dossier Takussan · pour présenter et pour reprendre le code',
    title: "De l'annonce au loyer encaissé, <em>tout l'immobilier</em> au même endroit.",
    lede: "Takussan est une plateforme immobilière pensée pour le Sénégal. Elle relie ceux qui cherchent un logement, ceux qui le possèdent, les agences qui le gèrent et les artisans qui l'entretiennent. Les prix sont en francs CFA, l'interface parle français, anglais et wolof.",
    note: 'Le bouton Technique les remet. La recherche (⌘K ou /) trouve n\'importe quel acteur, écran ou table.',
    statLabels: [{ match: 'Routes sous /api', l: "routes d'API" }, { match: 'Pages Next', l: 'pages dans le front' }, { match: 'Méthodes de test API', l: 'méthodes de test déclarées (API)' }],
    problemTitle: "Ce que l'immobilier vit aujourd'hui, et ce que Takussan change",
    problems: [
      { t: 'Les annonces sont partout et nulle part', d: "Un bien se publie sur WhatsApp, Facebook, des sites d'annonces. Les mêmes photos circulent sous plusieurs prix.", r: "une seule fiche par bien, une recherche par quartier, la détection des doublons, et le Radar qui va chercher les annonces publiées ailleurs pour les ramener sur la plateforme." },
      { t: 'On ne sait pas à qui on parle', d: "Fausses annonces, faux agents, avis invérifiables : la confiance est le premier frein.", r: "les agences sont vérifiées (dossier KYC), les annonces modérées, les avis réservés à ceux qui ont vraiment loué ou visité." },
      { t: "Le loyer se perd entre l'espèce et le carnet", d: "Encaissements en liquide, relances par téléphone, reçus sur papier : le propriétaire ne voit pas ce qui lui revient.", r: "chaque échéance est appelée, payable en ligne, relancée automatiquement, facturée, rapprochée du relevé bancaire, puis reversée au propriétaire, commission déduite." },
      { t: 'Tout se coordonne au téléphone', d: "Une fuite d'eau mobilise le locataire, l'agent, le propriétaire et un plombier, chacun sur son fil WhatsApp.", r: "Le Fil : une conversation attachée au bon sujet (le bail, l'intervention, la visite), avec ce qui a été promis et par qui." }
    ],
    storyLede: "Le parcours central de la plateforme, de la création d'un bien à son reversement. Les pastilles sous chaque étape sont les tables de la base que cette étape remplit.",
    layers: [
      { k: 'Ce que voit l\'utilisateur', t: 'Le site et les espaces', d: "Un site public pour chercher et publier, et un espace de travail (/app) qui change selon le profil : propriétaire, agent, agence. Construit avec Next.js." },
      { k: 'Ce qui décide', t: "L'API", d: "Toutes les règles vivent ici : qui a le droit de faire quoi, dans quelle agence, combien coûte un loyer, quand relancer. Construite avec Laravel." },
      { k: 'Ce qui se souvient', t: 'Les données', d: "PostgreSQL garde tout, y compris la file des tâches de fond. Meilisearch rend la recherche instantanée, Redis garde le cache et les sessions, Reverb pousse les nouveautés en direct." }
    ]
  },
  actorsLede: "Chaque acteur a sa porte d'entrée, son espace et ses droits. Un même compte peut porter plusieurs profils : une propriétaire peut aussi être agente dans une agence. Ses droits se calculent alors agence par agence.",
  profilesLede: "Takussan ne donne pas de « rôle » à un compte. Il lui attache des profils : propriétaire, agent, administrateur d'agence, prestataire, plateforme. Chaque profil apporte des capacités (« créer un bien », « encaisser un loyer »), et elles se cumulent. La question posée à chaque requête est toujours la même : cette personne peut-elle faire cette action dans cette agence ?",
  dataLede: "Toutes les tables de la base, rangées par domaine métier. La carte montre comment les domaines se tiennent entre eux ; chaque domaine a son schéma, et chaque table sa fiche avec ses colonnes, ses liens et les fonctionnalités qui la font vivre.",
  archLede: "Deux applications dans un seul dépôt : le front Next.js, que voit l'utilisateur, et l'API Laravel, où vivent les règles. Autour d'elles, une base PostgreSQL, un moteur de recherche, une file de tâches et un serveur temps réel.",
  asyncLede: "Tout ne se fait pas pendant que l'utilisateur attend. Les envois de messages, les relances de loyer, le traitement des photos et l'IA passent par des files de tâches, rangées dans PostgreSQL et vidées par plusieurs workers spécialisés. D'autres travaux tournent seuls, chaque nuit ou chaque heure.",
  engLede: "Ce qu'il faut savoir pour être utile dès le premier jour : les commandes, les conventions qui ne se devinent pas, les dossiers où chercher et les décisions à lire.",
  arch: {
    browser: ['Site public, espace /app,', 'console /super-admin.', 'Application installable (PWA).'],
    web: ['Pages rendues côté serveur (React Server Components).', 'BFF : route handlers /api/* et server actions, qui portent le cookie de session.', 'Textes affichés : next-intl, en français, anglais et wolof.', 'Interface : Tailwind 4 et composants @base-ui/react.'],
    api: ['Servie par FrankenPHP. Routes /api/* : une même enveloppe JSON.', 'Profil actif résolu à chaque requête, capacités par agence.', 'Lectures par spatie/query-builder : fields, filter, include, sort.', 'Jobs, notifications, planificateur.'],
    webToApi: 'HTTP + jeton Sanctum',
    realtime: ['Laravel Reverb (WebSocket).', 'Un signal « ça a changé »,', 'sans donnée : le front', 'relit l\'objet par l\'API.'],
    stores: [
      { t: 'PostgreSQL 17', d: ['La donnée de référence,', 'la file des jobs,', 'pgvector pour l\'IA.'], c: 2 },
      { t: 'Meilisearch', d: ['Recherche instantanée', 'des biens.'], c: 5 },
      { t: 'Redis 8', d: ['Cache et sessions.', 'Pas de file ici.'], c: 6 }
    ],
    external: ['Wave, Orange Money, Lemon Squeezy,', 'SMS, WhatsApp (Meta), Resend,', 'Anthropic, OpenAI, Voyage,', 'Cloudflare R2 pour les médias.']
  },
  queryExamples: [
    'fields[properties]=id,title,price      → seulement les colonnes de la vue',
    'filter[status]=active&filter[price_min]=50000   → le tri se fait en base, jamais sur la liste reçue',
    'include=address,owner                  → les relations en une requête',
    'sort=-created_at&per_page=20            → tri et pagination côté serveur'
  ],
  commands: [
    { t: 'Tout lancer', c: [['./dev.sh', 'Services docker, API, file de jobs, planificateur et front.'], ['./dev.sh doctor', 'Qui répond, qui manque, quelles migrations attendent.'], ['php artisan migrate:fresh --seed', 'Une base de démo complète (environ 840 biens).']] },
    { t: 'Au quotidien, côté API', c: [['php bin/impacted-tests.php --run', 'Seulement les tests que votre changement touche.'], ['./vendor/bin/pint', 'Le formatage, avant chaque commit.'], ['php artisan test --filter=Foo', 'Une classe de tests précise.']] },
    { t: 'Au quotidien, côté front', c: [['npm run dev', 'Le front en local.'], ['npm run lint && npx tsc --noEmit', 'ESLint et TypeScript : le build ne les lance pas.'], ['npm run test', 'Les tests Vitest.']] },
    { t: 'Les gardes du dépôt', c: [['for g in scripts/check-*.mjs; do node "$g" || echo "✗ $g"; done', 'Toutes les gardes, celles que la CI rejoue.'], ['node docs/backlog/check-backlog.mjs --report', 'Le backlog, compté à la source.']] }
  ],
  tours: {
    business: {
      title: 'Présenter Takussan', duration: 'environ 10 minutes', desc: "Pour un propriétaire, une agence, un partenaire ou un investisseur. Le mode Business est activé : aucun détail technique.", mode: 'business',
      steps: [
        { h: 'accueil', label: "Le problème et la promesse" },
        { h: 'acteurs', label: 'Les sept acteurs' },
        { h: 'acteur-owner', label: 'Le propriétaire' },
        { h: 'acteur-agent', label: "L'agent" },
        { h: 'acteur-agency-admin', label: "L'agence" },
        { h: 'acteur-customer', label: 'Le locataire' },
        { h: 'acteur-provider', label: 'Le prestataire' },
        { h: 'acteur-platform', label: "L'équipe Takussan" }
      ]
    },
    ingenieur: {
      title: 'Parcours ingénieur', duration: 'environ 30 minutes', desc: "Pour qui va écrire du code : l'architecture, une requête de bout en bout, l'autorisation, les données, puis un acteur et ses fonctionnalités jusqu'aux tables.", mode: 'tech',
      steps: [
        { h: 'accueil', label: 'Le produit en 5 minutes' },
        { h: 'architecture', label: "L'architecture" },
        { h: 'requete', label: "La vie d'une requête" },
        { h: 'acces', label: 'Profils et capacités' },
        { h: 'donnees', label: 'La carte des données' },
        { h: 'domaine-biens', label: 'Un domaine : les biens' },
        { h: 'table-properties', label: 'Une table : properties' },
        { h: 'acteur-agent', label: 'Un acteur de bout en bout' },
        { h: 'asynchrone', label: 'Les tâches de fond' },
        { h: 'deploiement', label: 'Déploiement et CI' },
        { h: 'ingenieur', label: 'Le guide du premier jour' }
      ]
    }
  }
};
