---
id: TCK-633
title: "Retours du porteur du 2026-10-11 : accès admin, publication sans friction, formulaire de bien, filtres, boost en crédits"
status: doing
phase: P1
family: full
estimate: XL
wave: 74
created: 2026-10-12
updated: 2026-10-12
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#112-agence--équipe
    - docs/features.md#21-authentification--comptes
    - docs/features.md#22-rôles--permissions
    - docs/features.md#27-médias--fichiers
    - docs/features.md#29-administration--configuration
  models:
    - docs/models-spec.md#1-user
    - docs/models-spec.md#2-agency
    - docs/models-spec.md#3-property
    - docs/models-spec.md#4-address
    - docs/models-spec.md#10-tag
    - docs/models-spec.md#30-setting-
    - docs/models-spec.md#58-featureflag-
tags: [api, front, admin, acces, onboarding, publication, recherche, filtres, boost, credits, super-admin, telephone, whatsapp, geo, medias]
---

## Objectif utilisateur

- **L'annonceur particulier** clique sur « Publier » et arrive directement sur la création du bien,
  choisit son adresse dans des listes, publie avec des coordonnées joignables, et peut booster son
  annonce avec des crédits offerts.
- **Le visiteur** trouve « Louer » en premier, filtre sans tomber sur des résultats faux, et voit des
  annonces sponsorisées qui n'écrasent pas les autres.
- **Tout utilisateur** ne voit dans l'administration que ce qu'il peut ouvrir.
- **Le super-admin** règle et suit les crédits, les boosts, les quartiers et les équipements proposés.

## Contexte

Neuf retours du porteur le 2026-10-11, relevés dans le code le même jour puis arbitrés avec lui le
2026-10-12 (décisions D1 à D16, toutes sur la recommandation). Un seul ticket, découpé en **six lots**
livrables par des sous-agents. Le lot E dépend du référentiel du lot D ; les autres sont
indépendants. Décisions structurelles :
[ADR-0061](../../adr/0061-credits-d-espace-et-boost-des-annonces.md) (crédits et boost) et
[ADR-0062](../../adr/0062-referentiel-geographique-region-ville-quartier.md) (référentiel géographique).

Ce qui a été relevé, et qui fonde chaque lot :

- `/admin` renvoie vers `/app` toute agence non `standard` (`ensureStandardAgencyOrRedirect`), alors
  que la sidebar, le menu utilisateur, les raccourcis et la carte « Administration » du profil y
  mènent sur le seul critère `isAdmin`. Trois mécanismes d'accès ne se parlent pas : `isAdmin`,
  `PRO_ROUTES` et la garde « agence standard » page par page.
- La modale de suppression promet une restauration « depuis l'administration » : **aucune route ni
  aucun écran de restauration n'existe**, pour personne.
- `UserMenu` déconnecte vers `/auth/login` ; la navbar publique, vers l'accueil.
- Le wizard hôte demande nom d'espace, ville, devise, type de bien, téléphone avec OTP et CGU. La case
  CGU est exigée mais **n'est enregistrée nulle part**, et l'inscription ne les demande pas.
- L'ordre Acheter / Louer est codé en dur à quatre endroits, avec deux vocabulaires.
- « 5+ chambres », « 3+ salles de bain », « 4e+ » sont des égalités exactes ; la carte n'applique que
  type, transaction, prix et rayon ; ville et quartier sont du texte libre comparé à l'identique.
- Le filigrane n'a qu'un réglage par agence, vrai par défaut ; `PublicPhotoUrl::isServable` cache une
  photo dont le filigrane attendu manque.
- Un seul numéro par compte, aucune notion WhatsApp ; le bouton WhatsApp d'une annonce vise toujours
  `user.phone`.
- Le formulaire n'expose que les 7 tags `amenity` : les 10 `feature` (Piscine, Climatisation…) sont
  insélectionnables. `floor_number` est `unsigned` en base alors que la validation accepte -5.
  Création et modification ne bornent pas l'étage et le parking de la même façon.
- Rien n'est vérifié à la publication : ni nom, ni numéro, ni e-mail. Aucun contact par annonce.
- Aucun crédit, portefeuille ni boost ; `featured` est un booléen sans écran, sans fin, sans effet
  dès qu'un mot est tapé.

## Contrat de données

### Lot A — correctifs

- Drapeau **`media_watermark`** au catalogue `App\Domain\Features\Flag` (lu par le filigrane), éteint.
- Aucune autre donnée.

### Lot B — accès admin

- Aucun endpoint nouveau. Les pages se jugent avec ce que le front lit déjà : rôles, `agency.kind`,
  `GET /api/me/capabilities`.

### Lot C — publication sans friction, numéros, contacts sur place

- Drapeau **`host_auto_space`** au catalogue `Flag`, **allumé** par sa migration de données.
- `POST /api/host/individual/auto-onboard` : corps `{ primary_city?: string }`, crée l'espace
  `individual` sans question ; idempotent (un espace existant est rendu en 200, jamais un 409) ;
  `throttle:5,1`.
- `users` : `phone_whatsapp` (bool, défaut faux), `secondary_phone` (string 30, nullable),
  `secondary_phone_verified_at` (nullable), `secondary_phone_whatsapp` (bool, défaut faux),
  `terms_accepted_at` (nullable), `terms_version` (string 40, nullable).
- Second numéro : `POST /api/auth/secondary-phone/send-otp`, `POST /api/auth/secondary-phone/verify`,
  `DELETE /api/auth/secondary-phone`. Les cases WhatsApp passent par `PUT /api/auth/profile`.
- Table **`property_contacts`** : `property_id`, `label` (string 60, nullable), `phone` (string 30),
  `has_whatsapp` (bool), `position` ; 3 au plus par bien. Lus et écrits par
  `GET|PUT /api/properties/{property}/contacts` (remplacement de la liste).
- `GET /public/properties/{slug}/contact` rend désormais une **liste** de numéros
  `{ phone, whatsapp, label, kind: primary|secondary|on_site }` au lieu d'un seul `phone`.
- Publication : nouvelle erreur 422 **`property.publish_contact_incomplete`** (détail : `missing`
  parmi `first_name`, `verified_phone`, `terms`).

### Lot D — formulaire de bien et référentiel (ADR-0062)

- Tables **`geo_regions`**, **`geo_cities`**, **`geo_neighborhoods`** ; `addresses.geo_city_id`,
  `addresses.geo_neighborhood_id`.
- `GET /api/public/geo/regions`, `GET /api/public/geo/cities?region=`,
  `GET /api/public/geo/neighborhoods?city=` (approuvés ; plus, authentifié, ses propres propositions).
- `POST /api/geo/resolve-link` : `{ url }` → `{ latitude, longitude }` ou 422 `geo.link_unresolved`.
- `tags` : `status` (`approved | pending | rejected`, défaut `approved`), `created_by_id` (nullable).
  `PUT /api/properties/{property}/tags` accepte des noms nouveaux, qui naissent `pending`.
- Réponse de détail du bien : `entry_cost` inchangé ; aucune autre forme nouvelle.

### Lot E — filtres

- `GET /api/public/properties/search` : `bedrooms`, `bathrooms`, `floor` deviennent des **minimums**
  (« au moins »). `furnished` accepte `false` (déjà accepté par l'API, à exposer).
- `GET /api/public/properties/map` accepte **tous** les filtres de la recherche
  (`MapPublicPropertyRequest` aligné sur `SearchPublicPropertyRequest`).

### Lot F — crédits et boost (ADR-0061)

- Tables **`credit_lots`**, **`credit_movements`**, **`credit_welcome_grants`**, **`boost_products`**,
  **`property_boosts`**, **`property_boost_daily_stats`** ; `properties` : `ranked_at`,
  `sponsored_until`, `badge`, `badge_until`.
- Capacité **`boost.spend`** (`Capability::BoostSpend`).
- Annonceur : `GET /api/credits` (solde, lots, mouvements paginés), `GET /api/boost-products`,
  `POST /api/properties/{property}/boosts` (`{ product_id }`), `GET /api/properties/{property}/boosts`.
- Recherche publique et accueil : champ **`sponsored`** (liste de biens) hors pagination et hors `total`.
- Super-admin : `GET|POST|PATCH /api/admin/boost-products`, `GET /api/admin/credit-wallets`,
  `GET /api/admin/credit-wallets/{agency}`, `POST /api/admin/credit-wallets/{agency}/adjustments`
  (`{ amount, reason }`, signé), `GET /api/admin/boosts`, `POST /api/admin/boosts/{boost}/cancel`
  (`{ refund: bool, reason }`), `POST /api/admin/properties/{property}/offered-boost`,
  `GET /api/admin/boost-stats`.
- Réglages `EditablePlatformSettings` : `credits.welcome_amount` (500), `credits.welcome_validity_days`
  (180), `credits.expiry_notice_days` (7), `boost.bump_cooldown_hours` (24),
  `boost.sponsored_slots_per_page` (3), `boost.reserved_top_results` (2).
- Résultats de la première page : chaque bien porte `placement: reserved | organic` ; les places
  réservées comptent dans la pagination et dans `total`.

## Direction UX / Artistique

- **Accès admin.** Un solo ne doit jamais voir un lien qui le renvoie en arrière. Pour une agence
  `individual`, l'entrée s'appelle « Mon espace ». La carte « Administration » du profil n'affiche
  que des liens qui s'ouvrent, et un libellé de rôle compréhensible par un particulier.
- **Publier.** Zéro écran entre le clic et le formulaire. Les coordonnées manquantes se demandent
  au dernier moment, dans le flux de la publication, en un seul bloc court (« Vos coordonnées pour
  les intéressés »), jamais comme un détour vers le profil. Les CGU s'acceptent par une phrase sous
  le bouton Publier, avec le lien.
- **Formulaire.**
  - Les listes avec recherche s'ouvrent au clavier comme au doigt.
  - Le quartier inconnu est proposé dans la liste même (« Ajouter « Keur Gorgui Nord » »).
  - La position montre la carte, la latitude, la longitude et le champ « Collez un lien ou une
    position », avec un retour immédiat de ce qui a été reconnu.
  - Les équipements s'affichent en puces, et un équipement ajouté apparaît tel que saisi.
- **Filtres.** Les filtres essentiels restent visibles (transaction, type, budget, chambres, lieu) ;
  le reste se replie sous « Plus de filtres ». Un seul vocabulaire : Louer, Acheter.
- **Places réservées.** Elles ressemblent aux résultats qu'elles précèdent, avec le badge « En vedette »
  bien visible : jamais un résultat payé sans marque.
- **Sponsorisé.** Les emplacements sont nettement marqués « Sponsorisé », sans imiter un résultat
  organique, et restent sobres : la palette réserve `--accent` aux badges de mise en avant (TCK-450).
- **Crédits.** Le solde est toujours visible là où l'on booste. Un solde insuffisant se dit avec le
  montant manquant. Tant que l'achat n'existe pas, aucun bouton « Acheter ». Les dates d'expiration
  des lots sont lisibles sans les chercher.
- **Super-admin.** Écrans de console existants : mêmes tableaux, mêmes filtres, mêmes confirmations
  2FA que les pages voisines.

## Contraintes strictes (métier)

- **Accès** : une seule table décrit les pages admin (chemin, exigence, place dans le menu). Le
  menu, le lien « Administration », la carte du profil et les gardes des pages en dérivent tous. La
  garde de `scripts/check-pro-routes.mjs` reste verte, adaptée si la table remplace `PRO_ROUTES`.
  Côté API, rien ne s'ouvre : les refus existants (`agency.standard_only`…) restent.
- **Déconnexion** volontaire → l'accueil localisé, depuis tout écran. Session expirée → connexion,
  inchangée.
- **Création automatique** : derrière `host_auto_space`. Drapeau éteint → le wizard actuel,
  intact. Nom « Espace de {prénom} » ou « Mon espace » ; ville = `primary_city` reçue (texte, 120
  caractères au plus), Dakar à défaut — le lot C ne dépend pas du référentiel du lot D ; XOF ;
  aucun type de bien préféré. Aucun bien créé. Drapeau éteint : l'endpoint rend 403
  `onboarding.auto_space_disabled`.
- **Publication** (API, pas seulement l'écran) : refusée en 422 `property.publish_contact_incomplete`
  tant que le contact principal du bien n'a pas de prénom et de numéro vérifié, ou que le
  publieur n'a pas accepté les CGU. La première publication enregistre `terms_accepted_at` et
  `terms_version`.
- **Second numéro** : jamais un identifiant de connexion ; vérifié par OTP ; refusé s'il est le
  numéro principal du compte, ou un numéro vérifié (principal ou second) d'un autre compte ; jamais
  écrit en clair dans les journaux.
- **WhatsApp** : le bouton public vise le premier numéro déclaré WhatsApp, et disparaît s'il n'y en
  a aucun.
- **Contacts sur place** : 3 au plus, numéro au format joignable (`TelephoneJoignable`) mais non
  vérifié ; ils ne sortent que par l'endpoint de contact limité, jamais dans `PropertyResource`
  public.
- **Devise** : XOF. Le formulaire n'offre plus de choix, la géolocalisation ne l'écrase plus, l'API
  force XOF à la création d'un bien. L'enum `Currency` ne change pas.
- **Frais d'agence** : refusés en 422 pour un bien d'espace `individual` ; masqués par le formulaire.
- **Filigrane** : `media_watermark` éteint ⇒ aucune pose, et une photo sans filigrane est servable.
  Allumé ⇒ le comportement actuel, réglage d'agence compris.
- **Crédits et boost** : tout ADR-0061 — registre en insertion seule, verrou sur la ligne de
  l'agence, consommation par expiration croissante, offre unique par empreinte de numéro, prix et
  durée figés à l'achat, `featured` jamais écrit hors du cycle de vie du boost, opérations
  super-admin sous 2FA récente et journalisées avec motif.
- **Référentiel** : tout ADR-0062 — unicité repliée par l'expression d'ADR-0025, texte canonique
  dans `addresses`, liste d'hôtes du résolveur vérifiée à chaque saut.
- **Libellés** : le front les possède (principe 5) ; fr, en et wo, `check:i18n` vert. Les
  équipements du catalogue sont traduits par leur slug ; un équipement saisi par un annonceur
  s'affiche tel quel.

## Delta à produire

### Lot A — correctifs (points 2, 4, 7, texte de suppression)

- [ ] Déconnexion du menu utilisateur vers l'accueil localisé ; toutes les sorties volontaires
      alignées.
- [ ] « Louer » avant « Acheter » dans le sélecteur de transaction (ordre et pastille glissante), le
      menu mobile et le panneau de filtres ; un seul vocabulaire.
- [ ] Texte de la modale de suppression, en ligne et en détail, sans promesse de restauration.
- [ ] `Flag::MediaWatermark` ; `AgencyWatermarkContext::isEnabledFor` et
      `ApplyWatermarkOnConversionListener` le lisent ; `PublicPhotoUrl::isServable` tient un
      filigrane non attendu pour servable.
- [ ] Commande `media:regenerate-without-watermark` (régénère les conversions des photos déjà
      filigranées, par lots, idempotente).
- [ ] Tests : `WatermarkGlobalFlagTest` (drapeau éteint : aucune pose, photo servie ; allumé :
      inchangé), tests front de l'ordre et de la redirection de déconnexion.

### Lot B — accès admin dynamique (point 1)

- [ ] Une table unique des pages d'administration et une fonction serveur qui en tire les pages
      accessibles au profil actif.
- [ ] Menu, lien « Administration » (sidebar, menu utilisateur, raccourcis, états vides), carte
      « Administration » du profil, et gardes de chaque page `/admin/*` dérivés de cette table ; une
      page refusée renvoie à la première accessible, `/app` s'il n'y en a aucune.
- [ ] Libellé « Mon espace » et libellé de rôle pour une agence `individual`.
- [ ] `scripts/check-pro-routes.mjs` adapté à la table.
- [ ] Tests : un solo n'a aucun lien vers une page qui le refuse (menu, profil, raccourcis) ; un
      admin `standard` garde toutes ses pages ; une page refusée renvoie à la première accessible.

### Lot C — publication sans friction, numéros, contacts sur place (points 3, 8, 9f, 9g)

- [ ] `Flag::HostAutoSpace` + migration de données qui l'allume.
- [ ] `HostAutoOnboardController@store`, `HostAutoOnboardRequest`, et
      `HostIndividualOnboardingService::autoOnboard()` (réutilise la création de l'agence et des deux
      profils, sans OTP ni CGU) ; route dans `routes/api/onboarding.php`.
- [ ] Parcours « Publier » : drapeau allumé et aucun espace → création automatique puis
      `/app/properties/new` ; drapeau éteint → wizard actuel.
- [ ] Migration `add_contact_preferences_to_users_table` (les six colonnes du contrat).
- [ ] `SecondaryPhoneController` (send-otp, verify, destroy), `SecondaryPhoneRequest`, purpose OTP
      distinct dans `PhoneVerificationService`, unicité vérifiée contre principal et second de tous
      les comptes.
- [ ] `UpdateProfileRequest` accepte `phone_whatsapp` et `secondary_phone_whatsapp`.
- [ ] Migration `create_property_contacts_table`, modèle `PropertyContact`,
      `PropertyContactController` (index, replace), `ReplacePropertyContactsRequest`, policy
      calquée sur la mise à jour du bien.
- [ ] `PublicPropertyController::contact` rend la liste de numéros (principal, second, sur place).
- [ ] `PublishReadiness` (service) appelé par `PropertyController::publish` et la mise en public
      par visibilité ; erreur `property.publish_contact_incomplete` dans `lang/{fr,en,wo}/errors.php`.
- [ ] Front : bloc « Vos coordonnées pour les intéressés » au moment de publier (prénom, nom,
      numéro avec OTP, WhatsApp, CGU) ; profil : case WhatsApp, second numéro avec OTP ; fiche
      publique : numéros listés derrière le même geste, WhatsApp sur le numéro déclaré.
- [ ] Tests : `HostAutoOnboardTest` (création, idempotence, ville absente → Dakar, drapeau
      éteint → 403 `onboarding.auto_space_disabled`), `SecondaryPhoneTest` (OTP, unicité croisée, jamais un identifiant de
      connexion), `PropertyContactsTest` (plafond 3, format, absent de la ressource publique),
      `PublishReadinessTest` (chaque manque refusé, CGU datées à la première publication),
      `PublicContactEndpointTest` (liste, WhatsApp).

### Lot D — formulaire de bien et référentiel (point 9a à 9e)

- [ ] Migrations `create_geo_regions_table`, `create_geo_cities_table`,
      `create_geo_neighborhoods_table` (index unique replié par ADR-0025, noms d'index explicites
      ≤ 63 caractères), `add_geo_ids_to_addresses_table`.
- [ ] Jeu de données versionné, script d'extraction conservé, `GeoReferentialSeeder` idempotent,
      rattachement des adresses existantes par nom replié.
- [ ] `PublicGeoController` (regions, cities, neighborhoods), `GeoLinkResolverController` +
      `GeoLinkResolver` (liste d'hôtes, https, 3 sauts, en-tête `Location` seul, délai court,
      `throttle`).
- [ ] Proposition de quartier à l'enregistrement d'une adresse ; renommage et fusion qui réécrivent
      le texte des adresses et réindexent.
- [ ] Migration `make_floor_number_signed_on_properties` ; bornes identiques entre
      `StorePropertyRequest` et `UpdatePropertyRequest` (étage, niveaux, parking) ; XOF forcé à la
      création ; frais d'agence refusés pour un espace `individual`.
- [ ] Migration `add_status_to_tags_table` ; types `feature` fondus dans `amenity` (migration de
      données, lecteurs de `feature` vérifiés) ; catalogue enrichi pour le Sénégal (forage, groupe
      électrogène, panneaux solaires, surpresseur, citerne, gardien…) ; tags saisis → `pending`,
      attachés au bien, absents des suggestions des autres jusqu'à validation.
- [ ] Front : région → ville → quartier en listes avec recherche ; latitude / longitude visibles et
      modifiables ; champ « Collez un lien ou une position » (liens longs, WhatsApp, degrés, Plus
      Code complet ou court) et appel au résolveur pour les liens courts ; listes déroulantes pour
      chambres (0–20), salles de bain (0–10), étage (sous-sol, RDC, 1–40), parking (0–20), année
      (de l'an prochain à 1900) ; équipements en multi-sélection avec puces et ajout par Entrée ;
      plus de sélecteur de devise ; frais d'agence masqués en `individual` ; total du coût d'entrée
      dans l'aperçu.
- [ ] Super-admin : file des quartiers proposés (valider, renommer, fusionner, rejeter) et des
      équipements proposés (valider, renommer, fusionner, rejeter).
- [ ] Pages légales : mention ODbL.
- [ ] Tests : `GeoReferentialSeederTest` (idempotent), `GeoNeighborhoodUniquenessTest`
      (« LIBERTÉ 4 » contre « Liberté 4 »), `GeoNeighborhoodProposalTest` (proposée, servie au seul
      proposant, fusionnée : adresses réécrites et biens réindexés), `GeoLinkResolverTest` (hôte
      hors liste refusé avant toute requête, saut hors liste refusé, coordonnées extraites),
      `PropertyFloorNumberTest` (−1 enregistré), `PropertyCurrencyForcedTest`,
      `AgencyFeeIndividualTest`, `TagProposalTest` ; tests front du parseur de positions (chaque
      format, entrée invalide) et de la parité du calcul du coût d'entrée avec `CoutDEntree`.

### Lot E — filtres de recherche (point 5) — dépend du lot D

- [ ] `PropertySearchService` : chambres, salles de bain, étage en minimum ; tests existants qui
      affirmaient l'égalité (`PropertySearchTest`, `bedrooms=3`) mis à jour.
- [ ] `MapPublicPropertyRequest` aligné ; la carte reçoit les mêmes paramètres que la liste.
- [ ] Front : ville et quartier en listes du référentiel ; équipements en multi-sélection du
      catalogue approuvé ; « Meublé » oui / non / indifférent ; filtres essentiels visibles, le reste
      sous « Plus de filtres » ; les puces de catégorie de la navbar n'écrasent plus une sélection
      multiple de types.
- [ ] Tests : `SearchMinimumFiltersTest` (6 chambres trouvées par « 5+ »), `MapFiltersParityTest`
      (mêmes filtres, même compte que la liste), parité front ↔ `rules()` maintenue
      (`search-filters.parity.test.ts`).

### Lot F — crédits et boost (point 6) — ADR-0061

- [ ] Migrations des six tables et des quatre colonnes de `properties` (`ranked_at` initialisé à
      `published_at`) ; noms d'index explicites.
- [ ] `Capability::BoostSpend` ; rôle système `agency_admin` le reçoit ; `agent` non.
- [ ] `CreditLedger` (octroi, dépense sous verrou de l'agence, remboursement, expiration),
      `WelcomeCreditGranter` (à la création de l'espace et à la vérification du numéro, par
      empreinte HMAC), `BoostPurchaseService` (règles des trois genres, délai de remontée, prix figé),
      `BoostLifecycle` (pause, reprise, remboursement au prorata, fin sans remboursement sur
      modération) branché sur l'observer du bien et la suspension d'agence.
- [ ] Commande planifiée `boosts:tick` (toutes les 5 minutes, idempotente) : fins, `featured`
      dérivé, réindexation, expiration des lots, préavis.
- [ ] `PropertySearchService` et `HomepageDiscoveryService` : tri organique par `ranked_at`, plus de
      `featured` en tête ; requête des emplacements (`is_sponsored` au `toSearchableArray`, filtrable),
      rotation déterministe, champ `sponsored` ; places réservées en première page (ordre organique,
      exclues des emplacements de la page et des pages suivantes, `placement`). `config/scout.php` : `is_sponsored`, `ranked_at`
      (filtrable / triable).
- [ ] `UpdatePropertyRequest` refuse `featured` à tous ; seeders : une Vedette offerte là où
      `featured` était posé.
- [ ] Comptage des impressions (cache → `property_boost_daily_stats`) et des clics (`src=sponsored`).
- [ ] Notifications `CreditsGrantedNotification`, `CreditsExpiringNotification`,
      `BoostEndedNotification`, `BoostRefundedNotification` (fr, en, wo).
- [ ] Routes annonceur et super-admin du contrat ; super-admin sous `super-admin`, opérations de
      solde et d'annulation sous 2FA récente (`ProtectedActions`), journalisées.
- [ ] Clés de réglage dans `EditablePlatformSettings` ; `BoostProductSeeder` (catalogue initial).
- [ ] Front annonceur : bouton « Booster » (ligne de « Mes biens », en-tête du bien, écran de succès
      de la publication), panneau de choix avec solde, page « Crédits ».
- [ ] Front public : emplacements « Sponsorisé » en tête de page, badges Urgent / Prix en baisse.
- [ ] Front super-admin : réglages, catalogue, portefeuilles, boosts actifs, mise en avant offerte,
      statistiques.
- [ ] `docs/models-spec.md` : les six tables et les colonnes nouvelles.
- [ ] Tests : `CreditLedgerInvariantTest`, `CreditConsumptionOrderTest`,
      `CreditConcurrentSpendTest` (deux dépenses sur un solde juste : une seule passe),
      `WelcomeCreditOncePerPhoneTest` (compte supprimé puis recréé avec le même numéro : aucune
      seconde offre), `BoostRulesTest` (délai de remontée, vedette prolongée, badge remplacé),
      `BoostPauseAndRefundTest` (pause / reprise, loué → remboursement au prorata avec expiration
      héritée, modération → aucun remboursement), `SponsoredRotationTest` (même page et même heure :
      même tirage ; un cycle sert toutes les vedettes ; hors `total`),
      `ReservedTopResultsTest` (première page seulement, ordre organique avec et sans mot, aucun
      doublon avec les emplacements ni plus bas ni en page 2, moins de X vedettes → places rendues à
      l'organique, X = 0 inerte), `BoostsTickIdempotenceTest`,
      `FeaturedNotWritableTest`, tests des endpoints super-admin (2FA, motif, journal).

## Critères d'acceptation

- [ ] **AC1 — Accès.** Un solo connecté ne rencontre aucun lien, dans aucun menu ni dans son profil,
      qui le renvoie en arrière ; « Mon espace » ouvre une page qui s'affiche. Un admin `standard`
      voit les mêmes pages qu'avant.
- [x] **AC2 — Suppression.** La modale ne promet plus de restauration.
- [x] **AC3 — Déconnexion.** Depuis le tableau de bord comme depuis le site public, on revient à
      l'accueil.
- [x] **AC4 — Publier.** Drapeau allumé : un compte neuf sans espace clique sur « Publier » et voit le
      formulaire de bien, sans écran intermédiaire. Drapeau éteint : le wizard actuel.
- [x] **AC5 — Louer d'abord.** « Louer » précède « Acheter » partout où la transaction se choisit,
      avec le même mot.
- [x] **AC6 — Filtres.** « 5+ chambres » trouve une maison de 6 chambres ; la carte et la liste
      affichent le même compte pour les mêmes filtres ; une ville se choisit, elle ne se tape plus.
- [x] **AC7 — Filigrane.** Une photo téléversée drapeau éteint est servie, sans filigrane.
- [x] **AC8 — Second numéro.** On ajoute, vérifie et retire un second numéro ; il ne permet pas de
      se connecter ; chaque numéro porte sa case WhatsApp ; sur l'annonce, le bouton WhatsApp vise un
      numéro déclaré WhatsApp, ou n'apparaît pas.
- [x] **AC9 — Adresse.** Région, ville et quartier se choisissent dans des listes avec recherche ; un
      quartier inconnu s'ajoute et sert l'annonce ; coller un lien Google Maps (long ou court) ou un
      Plus Code remplit latitude et longitude.
- [x] **AC10 — Formulaire.** Les nombres se choisissent dans des listes ; un sous-sol s'enregistre ;
      Piscine et Climatisation sont sélectionnables ; un équipement nouveau s'ajoute par Entrée et
      s'affiche tel que saisi ; aucun choix de devise ; pas de frais d'agence pour un particulier ;
      l'aperçu affiche le total à l'entrée.
- [x] **AC11 — Publier avec un contact.** Sans prénom, sans numéro vérifié ou sans CGU, l'API refuse
      la publication, et l'écran fait compléter ce qui manque sans quitter la publication.
- [x] **AC12 — Contact sur place.** Jusqu'à 3 numéros titrés par annonce, révélés au même geste que
      le numéro principal, absents de toute réponse publique hors l'endpoint de contact.
- [x] **AC13 — Crédits.** Un espace naît avec 500 crédits dès que son titulaire a un numéro vérifié,
      une seule fois par espace et par numéro ; la page « Crédits » montre solde, lots, expiration et historique.
- [x] **AC14 — Boost.** Remontée, Vedette et Badge s'achètent avec les règles d'ADR-0061 ; une
      Vedette apparaît dans les emplacements « Sponsorisé » des recherches qu'elle satisfait, par
      rotation ; en première page, les 2 premiers résultats sont des vedettes qui correspondent, dans
      l'ordre normal, badgées, jamais en double ; au-delà, l'ordre des résultats ne change pas.
- [x] **AC15 — Vie du boost.** Dépublier met la Vedette en pause, republier la reprend ; louer le
      bien rend les jours restants ; un retrait par la modération ne rend rien.
- [x] **AC16 — Super-admin.** Le super-admin règle les six valeurs, édite le catalogue, crédite ou
      débite un espace avec motif et 2FA, annule un boost avec ou sans remboursement, offre une
      Vedette, lit les statistiques ; chaque geste est journalisé.
- [ ] **AC17 — Gardes.** Suites API et front entières vertes, `tsc`, lint, `check:i18n`, gardes de la
      racine ; chaque test neuf échoue quand on retire le correctif qu'il garde (ablation).

## Hors périmètre

- **L'achat de crédits** par Wave ou Orange Money — phase 2 d'ADR-0061 (D6).
- **La corbeille** et la restauration d'un bien supprimé (D2).
- **Un tableau de bord allégé pour l'agence `individual`** (D1).
- **La comparaison avec le taux de clic organique** (ADR-0061, Conséquences).
- **La refonte visuelle des filtres en pastilles horizontales** (D4, option b).
- **Le second numéro comme identifiant de connexion** (D7).
- **Plus de trois contacts sur place** (D11).
- **La suppression du wizard hôte** : il reste derrière son drapeau.

## Notes d'implémentation

_(à remplir par implementing-specs)_
