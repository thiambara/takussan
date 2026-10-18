# Pistes d'amélioration et corrections — exploration du 2026-10-15

Relevé en lecture seule, un angle à la fois, par des agents d'exploration lancés depuis la
session de TCK-651 (branche `feat/reglages-metier-au-catalogue`). **Rien ici n'est un ticket** :
chaque piste qui mérite d'être faite passe par `/write-spec`, et toute décision structurelle par un
ADR.

Chaque constat cite `fichier:ligne` et dit comment il a été établi (lu, mesuré, déduit). *Une piste
déduite d'un nom ou d'un docblock n'est pas un constat* : elle est marquée **à vérifier**.

Gravité : 🔴 défaut avéré (comportement faux aujourd'hui) · 🟠 risque ou dette qui coûte · 🟢
amélioration.

**Depuis [ADR-0066](../adr/0066-trois-agents-sur-les-pistes-d-amelioration.md), trois agents
planifiés traitent ce fichier.** L'explorateur relève les angles « à faire ». Le mesureur
re-mesure, puis classe. L'implémenteur corrige ce qui est classé autonome ou validé. Chaque entrée
porte une `Réf` stable et un `Statut`. Le format, le vocabulaire et les critères de classement
sont dans l'ADR, et `node scripts/check-pistes.mjs` les tient. **Pour accorder une piste**, passez
sa ligne `Statut` à `validé` sur `pre-dev`. Les comptes courants se prennent par
`node scripts/check-pistes.mjs --report` : ceux du résumé ci-dessous sont ceux de la clôture.

## Résumé de la clôture (2026-10-15, 03 h 04)

**16 angles explorés** sur les 53 listés, de 00 h à 3 h, chacun par un agent en lecture seule. Chaque 🔴 a été relu
par la session dans le code avant d'être écrit. Aucun angle n'était en cours à la clôture : les angles 17 à 53
restent « à faire ».

| Gravité | Entrées |
|---|---|
| 🔴 défaut avéré | 48 |
| 🟠 risque ou dette | 92 |
| 🟢 amélioration | 23 |

Les entrées sont des sections `###`. Une section « Petites améliorations » regroupe plusieurs constats. Les trois 🔴
de l'angle 12 sont des **gardes absentes** (une régression passerait la CI au vert), pas des défauts de production.

### Les cinq à traiter d'abord

1. **L'argent des baux est faux à plusieurs endroits** (angles 4 et 13) :
   - « Enregistrer un paiement » crée une nouvelle échéance en attente au lieu de régler celle qui est due, et la voie
     gardée `mark-paid` n'a aucun appelant ;
   - « Générer l'échéancier » appelle une route absente (404) ;
   - un échéancier trimestriel ou annuel facture un seul mois de loyer ;
   - la révision de loyer n'atteint pas les échéances.

   Ce sont les montants que voient le bailleur et le locataire.
2. **Des écritures autorisées à qui ne devrait pas** (angles 3 et 13) :
   - `POST /api/payments`, sans appelant, laisse un locataire ou un client enregistrer son propre paiement comme réglé ;
   - `PUT /users/{user}/role` n'a aucune des gardes du parcours normal ;
   - `include=…Profiles` laisse sortir les profils d'autres agences.

   Retirer la route morte suffit pour le premier.
3. **Le locataire n'est jamais rattaché à un compte** (angle 15). Sur un bail créé depuis l'écran, la signature
   électronique (ADR-0042), l'espace résident et la check-list d'entrée sont donc inatteignables. La fiche reliée à un
   compte, celle d'une candidature, reste invisible à l'agence du bien.
4. **Le contrat front ↔ API est rompu en cinq endroits, sans aucune garde** (angles 6, 11 et 13). Les appels suivants
   visent des routes qui n'existent pas :
   - `PATCH /api/users/me` : la langue n'est jamais enregistrée, et toutes les notifications partent en français ;
   - `generate-schedule` ;
   - les pièces jointes de la messagerie ;
   - les documents de la fiche client.

   Une seule garde qui confronte les chemins littéraux du front à `route:list` (angle 45) attrape toute la famille.
5. **Ce qu'on ne verrait pas en production, à régler avant la phase F** (angles 11 et 14) :
   - l'alerte « file à l'arrêt » part sur la file arrêtée ;
   - un planificateur mort ne fait rien rougir, et `/api/health` répond 200 sur un statut inconnu ;
   - les SMS reportés la nuit gardent en clair, dans `jobs`, des liens porteurs de paiement et d'invitation.

**Concerne directement la branche de TCK-651** : les réglages d'agence vivent dans trois magasins, dont deux sans
voie d'écriture (angle 13, puis 47).

## Angles

| # | Angle | État |
|---|-------|------|
| 1 | Recherche d'un bien (public et `/app`) : pertinence, filtres, performances, UX | fait |
| 2 | Performances des requêtes : N+1, index manquants (FK non indexées sous PostgreSQL), pagination | fait |
| 3 | Isolation d'agence et autorisation : routes, policies, fuites entre agences | fait |
| 4 | Argent : montants, devises, arrondis, pénalités, factures, idempotence des paiements | fait |
| 5 | Jobs planifiés et files : idempotence, reprise, `withoutOverlapping`, échecs muets | fait |
| 6 | Texte affiché par l'API (principe n° 5) et trous d'i18n fr/en/wo | fait |
| 7 | Accessibilité du front : formulaires, focus, contrastes, lecteurs d'écran | fait |
| 8 | Parcours mobile : formulaires longs, tableaux, défilement, cibles tactiles | fait |
| 9 | Pages publiques : SEO, métadonnées, temps de chargement, images | fait |
| 10 | Médias : tailles, conversions, disques privés/publics, nettoyage | fait |
| 11 | Notifications (e-mail, SMS, WhatsApp, in-app) : doublons, préférences, échecs | fait |
| 12 | Tests : zones non couvertes, tests qui seraient verts sans le code qu'ils gardent | fait |
| 13 | Code mort et doublons : services, composants, routes, clés i18n | fait |
| 14 | Observabilité : erreurs avalées, journaux, alertes, ce qu'on ne verrait pas en production | fait |
| 15 | Parcours d'une agence neuve : inscription, mise en service, premier bien, premier bail | fait |
| 16 | Listes internes sur un modèle `Searchable` avec `defaultSort` en dur (documents, propriétaires, biens enfants) | fait |
| 17 | Qualité des adresses : référentiel ou texte libre, dans le formulaire de création de bien | fait |
| 18 | Statistiques Boost (clics, impressions) face aux robots, aux rendus serveur et aux revalidations | fait |
| 19 | Rétention des tables qui grossissent : `activity_log`, `app_notifications`, `scheduled_task_runs` | fait |
| 20 | Nombre réel de requêtes SQL par écran (`DB::listen`), machine au repos | fait |
| 21 | Données personnelles d'un `User` sorties par `include=` (`Lease.landlord`, `Booking.customer`, `Payout.landlord`) : qui voit quel téléphone et quel e-mail | fait |
| 22 | Les 28 FormRequests hors `BaseFormRequest`, et les règles d'autorisation restées dans des services | fait |
| 23 | Lectures de données personnelles sans step-up, face à `REFUSED_READS` (ADR-0055 §3) | fait |
| 24 | Crédits et Boost : idempotence et unité des achats Lemon Squeezy (`CreditLedger`, `BoostPurchaseService`) | fait |
| 25 | Rapprochement bancaire quand une pénalité est incluse dans l'encaissement | fait |
| 26 | PDF (quittances, contrats, factures) : loyer non mensuel, TVA arrondie, devise | fait |
| 27 | Routeur SMS (`SmsRouterDriver::walkChain`) : SMS envoyé et facturé deux fois sur un timeout suivi d'un repli | fait |
| 28 | Cache des pages publiques par langue : les `*_label` localisés entrent-ils dans la clé de cache ? | fait |
| 29 | Langue des destinataires sans compte (invitations, contacts) : `metadata.locale` jamais transmis ? | fait |
| 30 | Équipements stockés en français en base (`TagCatalog`) : traduction à l'affichage | fait |
| 31 | Passage axe ou Lighthouse au navigateur (CDP) sur les cinq parcours, pour trancher les « à vérifier » d'accessibilité | fait |
| 32 | Taille des envois côté API et proxy (`upload_max_filesize`, `post_max_size`, proxy Dokploy) face à un lot de 20 photos | fait (couvert par l'angle 10) |
| 33 | Poids JS par route publique sur un réseau 3G simulé (fiche bien, recherche) | fait |
| 34 | Plan de bascule de la phase F côté SEO : Search Console, redirections, ancien index | fait |
| 35 | Contenu des pages de facettes : texte propre par ville ou quartier, maillage interne | fait |
| 36 | Webhooks de statut SMS et WhatsApp : jeton dans l'URL, signature, rejeu ; puller DLR Mtarget | fait |
| 37 | `TRUSTED_PROXIES` derrière Traefik : les limiteurs par IP (`auth-phone-send`…) voient-ils le vrai client ? | fait |
| 38 | Messagerie : `message_received`, `ConversationInviteNotification`, isolation des conversations | fait |
| 39 | Webhook de paiement `refund` ou `failed` rejoué sur un paiement déjà soldé : effets, fenêtre de temps de la signature | fait |
| 40 | Ablation réelle, par la session, des trois 🔴 de l'angle 12 (isolation de l'initiation, obligations RGPD, signature OM) | fait (couvert par l'angle 12) |
| 41 | Chemins nominaux du BFF : cookie → Bearer, en-têtes relayés (`content-disposition` des exports RGPD) | fait |
| 42 | Sauvegardes PostgreSQL : existence, rétention, restauration à blanc mesurée | à faire |
| 43 | File `database` sous charge : `retry_after`, verrous, `jobs` qui grossit | à faire |
| 44 | Front en conteneur : healthcheck de `takussan-web-preview`, journaux Next | à faire |
| 45 | Contrat front ↔ API : chemins, clés de réponse, champs écartés par `validated()` — une garde qui confronte les littéraux du front à `route:list` | à faire |
| 46 | Voies d'écriture en double sur l'argent : `POST /api/payments` contre les routes imbriquées et `recordPayment` | à faire |
| 47 | Réglages d'agence : table `settings` (portée agence), colonne `agencies.settings`, colonnes dédiées — un seul lecteur | à faire |
| 48 | Parcours du locataire : de la candidature à la quittance, rattachement fiche ↔ compte, plusieurs agences | à faire |
| 49 | Passage d'une agence `individual` à `standard` : capacités débloquées, données reprises | à faire |
| 50 | Ce que voit le bailleur invité quand le titulaire du bien est l'agent : biens, baux, relevés | à faire |
| 51 | Recherche de contacts de la messagerie (`MessagingContactController.php:94`, `User::search`) | à faire |
| 52 | `index-settings` Meilisearch réellement appliqués en préproduction (`scout:sync-index-settings` joué partout ?) | à faire |
| 53 | Index Meilisearch `testing_*` et `smoke_*` laissés sur l'instance docker locale | à faire |
| 54 | FormRequests dont une règle `nullable` vise une colonne `NOT NULL` : 500 au lieu de 422 (confronter les règles à `information_schema.columns`) | à faire |
| 55 | Places réservées et emplacements entre la page 1 et la page 2 de la recherche (`PropertySearchService::placements`, décalage `count($reserved)`) : biens sautés ou répétés, `total` | à faire |
| 56 | Lecteurs d'`activity_log` depuis activitylog v5 : qui lit encore `properties` pour `old`/`attributes` au lieu d'`attribute_changes` (export, alertes, flux, `PropertyRedactor`) | à faire |
| 57 | Téléphones et e-mails hors de `users` (`notification_delivery_attempts.to`, journaux, métadonnées, messages) face à `AccountDeletionService::anonymize` | à faire |
| 58 | Ressources qui lisent `$this->x` quand `x` est à la fois une colonne et une relation (`Customer.notes`…) : relation chargée en repli sous sparse fieldset | à faire |
| 59 | Requêtes SQL par page des listes passées par `filter[search]` (Scout puis Eloquent) et de la recherche publique, index peuplé | à faire |
| 60 | `$requestLoadable` confronté aux clés émises par chaque ressource : relations chargées sans être rendues, et contrôleurs `show` qui ignorent `include=`/`fields` | à faire |
| 61 | Modèles rendus bruts par un contrôleur (`->items()`, `relationsToArray()`, paginateur brut) : colonnes qui sortent sans projection, au-delà de `User` | à faire |
| 62 | Règles `exists:` des FormRequests reçues par une route ouverte à tout compte connecté (`exists:users,id`, `exists:properties,id`…) : oracles d'existence par identifiant séquentiel, au-delà des routes en lot de P22.02 | à faire |
| 63 | URL signées rangées en base ou dans un `metadata` (`app_notifications.data`, `LeaseDepositRefundNotification`, `DepositRefundService`, `MaintenanceRequestService::addPhotos`) : durée, lecteurs, liens morts à la relecture | à faire |
| 64 | Pièces KYC des profils (`Document` d'`OwnerProfile`, `AgentProfile`, `ServiceProviderProfile`) à l'effacement du compte, à la fin du profil et au re-téléversement : fichier, versions et lignes réellement supprimés ? | à faire |
| 65 | Durée cumulée des appels sortants synchrones dans une requête HTTP (OTP SMS, step-up, initiation de paiement) face au délai de PHP, du serveur web et de Traefik | à faire |
| 66 | Valeurs d'enum métier ajoutées ou désactivées par le super-admin (`BusinessEnumService`, `settings` `enum.*.values`) : lues par aucune validation ni aucun écran hors de la console ? | à faire |
| 67 | Critères nommés des recherches sauvegardées et des liens partagés (`tags=Piscine`, `location=<quartier>`) après un renommage, une fusion ou un rejet au référentiel (`TagModeration`, `GeoNeighborhoodModeration`) : alertes muettes, filtres vides | à faire |
| 68 | Passage axe au navigateur des écrans connectés (`/app`, console super-admin) derrière un faux API : barre latérale, tableaux, dialogues et feuilles de `@base-ui/react` | à faire |
| 69 | Fiche bien, recherche et accueil servis par `next start` avec l'API de dev, sous 3G simulé par CDP : LCP, TBT, octets du document RSC et ordre des préchargements | à faire |
| 70 | Poids JS initial des écrans de `/app` (`(dashboard)`, 500 à 610 Kio gzip au build du 2026-10-17) : ce que la coque et la barre latérale chargent pour chaque écran | à faire |
| 71 | Variables d'environnement des services de production du plan F3 (`takussan-web-prod`, `takussan-api-prod`) face au relevé de la préproduction dans `docs/infra/hebergement.md` : clés absentes, valeurs reprises de D1 | à faire |
| 72 | Ce qu'un accusé `failed` reçu après coup (SMS ou WhatsApp) déclenche : repli sur un autre canal, renvoi, trace pour l'expéditeur — face aux envois critiques (OTP, code de signature de bail) | à faire |
| 73 | URL signées absolues (`hasValidSignature`, `temporarySignedRoute`, `media.private.show`) derrière Traefik : schéma et hôte vus par l'API face à `APP_URL`, signature refusée en préproduction ? | à faire |
| 74 | Ce que joint sans authentification un service voisin de `dokploy-network` (Dokploy, Compose `donnees`, autres projets) : API sur 8080, Redis, Meilisearch (clé maîtresse ?), PostgreSQL, front Next — et l'alias `api` partagé entre projets | à faire |
| 75 | Classes `Notification` historiques de `AppDatabaseChannel::TYPES`, hors `NotificationCode` : sans `code` ni `target` dans la cloche, préférences lues à la main dans `via()`, couvertes par un test ? | à faire |
| 76 | Effets aval d'un paiement soldé puis passé à `refunded` : quittance déjà envoyée, ligne prise par un reversement de la plateforme (`platform_payout_id`) ou du propriétaire (`PayoutCalculator`), commission, exports et totaux de l'historique | à faire |

---

## Angle 1 — Recherche d'un bien

*Exploré le 2026-10-15 vers 0 h 30. Les trois 🔴 ont été relus contre le code par la session ; les
chiffres « mesurés » viennent de l'agent, sur la base et l'index Meilisearch de développement.*

### La recherche dans `/app` ne trouve ni les brouillons ni les biens privés, et ne trie pas par pertinence
- Réf : P01.01
- Statut : fait · TCK-662 — reste : le second mécanisme de tri, avec TCK-578 et son ADR
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Models/Concerns/HasQueryBuilder.php:235`, `takussan-api/app/Models/Property.php:499-508`, `takussan-api/app/Http/Controllers/Api/PropertyController.php:80`, `takussan-web/src/lib/queries/properties-server.ts:126`
- Constat :
  - `filter[search]` de `/api/properties` passe par Meilisearch puis par un `whereIn`, alors que `shouldBeSearchable()` écarte de l'index les biens privés, brouillons, en revue et rejetés.
  - Mesuré : les biens privés 145-147 sont absents de l'index. Une recherche de leur titre exact rend 53, 70 et 103 autres biens, et jamais le bon.
  - Pas de `matchingStrategy` (relâchement `last`, corrigé côté public par TCK-338).
  - `defaultSort('-created_at')` est en dur, et le front envoie toujours `sort=-created_at` : la pertinence est perdue (lu).
- Piste : une recherche SQL sur le titre et la référence pour les listes internes, ou un index interne sans `shouldBeSearchable`. Utiliser `defaultSortsWithRelevance()`, et ne pas forcer `sort` quand une recherche est active.
- Mesure (2026-10-15, c8f7f127, mesureur) : lu `HasQueryBuilder.php:234-236` (filtre `filter[search]` = `search()->keys()` puis `whereIn`), `Property::shouldBeSearchable()` (`Property.php:499-509`), `PropertyController.php:80` (`->defaultSort('-created_at')` en dur) et `properties-server.ts:126` (`sort ?? '-created_at'`) ; tinker en lecture sur la base et l'index de dev, titre exact de trois biens non indexables (822 et 827 privés brouillons, 623 public brouillon) → 211 clés rendues pour chacun, jamais le bien cherché. Le défaut central est déjà décrit par TCK-578 (`todo`, étiqueté `adr-requise`), que le constat ne cite pas. `matchingStrategy` non re-mesuré. Classement : V6, la piste (recherche SQL interne ou second index) ouvre un second mécanisme de recherche que `check-filtering-single-mechanism.mjs` refuse et que TCK-578 renvoie à un ADR ; seule la restitution de la pertinence par `defaultSortsWithRelevance()` relèverait d'A1.
- Mesure (2026-10-15, bdb71428, implementeur) : avant correctif, `PropertyDashboardSearchTest::test_dashboard_search_ranks_by_relevance_not_by_date` (trois biens créés dans l'ordre inverse de leur pertinence, `filter[search]` sans `sort`) rend `[2 fautes, 1 faute, exact]`, l'ordre par date ; côté front, la page `/app/properties` et `fetchDashboardProperties` envoient `sort=-created_at` pendant une recherche (deux tests vitest rouges). Correctif : `defaultSortsWithRelevance('-created_at')` dans `PropertyController::index`, aucun `sort` par défaut pendant une recherche côté front. Ablation correctif par correctif : chacun retiré rend son seul test rouge, remis tout est vert ; un `sort=` explicite reste souverain (test). Brouillons et biens privés hors index : non traité, TCK-578.

### Les quartiers proposés par le panneau ne correspondent pas aux quartiers indexés
- Réf : P01.02
- Statut : fait · TCK-663
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/search/ChoixDuReferentiel.tsx:227-233`, `takussan-api/app/Services/Search/PropertySearchService.php:446-447`
- Constat :
  - Le panneau propose les noms du référentiel (`geo_neighborhoods`). Le filtre compare ce nom par égalité stricte avec `addresses.neighborhood`, qui est un texte libre.
  - Mesuré : `'Grand Yoff'` (le nom du référentiel) rend 0 bien, et `'Grand-Yoff'` en rend 39.
  - 205 adresses portent un quartier absent du référentiel : Plateau 44, Grand-Yoff 42, Hann Maristes 37…
  - Seules 322 adresses sur 826 sont rattachées à `geo_neighborhood_id`.
  - Le filtre tient compte des accents : `Guediawaye` rend 0, contre 23 pour `Guédiawaye`. `Dieupeul` et `Dieuppeul` coexistent.
  - En production : à vérifier.
- Piste : rattacher les adresses au référentiel (migration de données), puis indexer et filtrer par le nom canonique ou par `geo_neighborhood_id`.
- Mesure (2026-10-15, c8f7f127, mesureur) : lu `PropertySearchService.php:446-447` (`neighborhood = <nom>` en égalité stricte) et `ChoixDuReferentiel.tsx:226-233` (noms du référentiel proposés) ; tinker en lecture → `PropertySearchService::search(['location' => 'Grand Yoff'])` rend 0, `'Grand-Yoff'` en rend 9 (le constat disait 39 : ce chiffre ne compte que les biens publics) ; `geo_neighborhoods` ne connaît que `Grand Yoff`, `addresses` que `Grand-Yoff` (42) ; 205 adresses sur 826 portent un quartier absent du référentiel, 322 sont rattachées à `geo_neighborhood_id`. Classement : V4, rattacher les adresses au référentiel réécrit des données existantes.
- Mesure (2026-10-16, 64d25ff, implementeur) : reproduit avant correctif par `QuartierDuPanneauTest` (liste `/api/public/properties/search` et carte `/map`) → `location=Grand Yoff` rend `[]` pour une adresse non rattachée « Grand-Yoff », et `location=Sacré-Cœur 3` rend `[]` au lieu des biens rattachés à ce quartier ou saisis « Sacre Coeur 3 » ; correctif : `geo_neighborhood_id` et `neighborhood_key` (`CleDeQuartier`) indexés et filtrés, même règle en SQL pour la carte, adresses non réécrites → 2 verts (28 assertions) ; ablation de la clause de liste, de celle de la carte, puis des identifiants du référentiel → rouge à chaque fois sur l'assertion visée, correctif remis → vert.

### Les suggestions de recherche ont une limite unique de 60 requêtes par minute pour tout le site
- Réf : P01.03
- Statut : fait · TCK-652
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Providers/AppServiceProvider.php:373`
- Constat :
  - `Limit::perMinute(60)` est déclaré sans `->by()`. La clé est alors la même pour tous les visiteurs (lu dans `ThrottleRequests` et `Limit` du framework).
  - Le commentaire qui annonce `search-suggest|{ip}` est faux.
  - Le test (`tests/Feature/Api/Search/SearchSuggestTest.php:198`) vide une clé qui n'existe pas : il resterait vert dans les deux cas.
  - Avec un anti-rebond de 150 ms, une dizaine de personnes qui tapent en même temps font répondre 429 à tout le monde.
- Piste : `->by($this->visitorRateLimitKey($request))`, comme `public-read`, et un test avec deux IP distinctes.
- Mesure (2026-10-15, c8f7f127, mesureur) : lu `AppServiceProvider.php:372-373` (`Limit::perMinute(60)` sans `->by()`) et `ThrottleRequests` (clé `md5($limiterName.$limit->key)`, donc une seule clé pour tous) ; test temporaire, retiré depuis, qui envoie 60 appels de `10.0.0.1` à `/api/search/suggest` → l'appel suivant depuis `10.0.0.2` rend **429**. TCK-107 écrit la règle attendue (« rate-limit 60 req/min/IP », AC5 « depuis la même IP »). Classement : A1, le comportement attendu est écrit dans TCK-107 et dans le commentaire de la ligne 372, et le correctif reprend la clé `visitorRateLimitKey()` des limiteurs voisins, sans choix de produit.
- Mesure (2026-10-15, 5e758845, implementeur) : reproduit avant correctif par `SearchSuggestTest::test_rate_limit_is_counted_per_visitor_ip` (60 appels de `198.51.100.1`, puis un de `198.51.100.2`) → **429** au lieu de 200 ; correctif `->by($this->visitorRateLimitKey($request))` → 12/12 verts dans la classe ; ablation (limiteur ramené à `fn () => Limit::perMinute(60)`) → rouge sur la même assertion, correctif remis → vert.

### Deux recherches par changement de filtre, et des impressions Boost gonflées
- Réf : P01.04
- Statut : fait · TCK-708 — reste : la double recherche par changement de filtre (rendu serveur puis client) côté front, qui reste un coût sans plus gonfler les impressions
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/hooks/useSearch.ts:183,360-364`, `takussan-web/src/app/[locale]/(public)/properties/(liste)/page.tsx:133-134`, `takussan-api/app/Services/Search/PropertySearchService.php:659`
- Constat :
  - `router.push` refait le rendu serveur, qui appelle déjà `rechercherBiensPublics`. La nouvelle graine est ignorée (`useReducer`/`useRef` ne la lisent qu'au montage), et le client relance la même recherche (lu ; à confirmer dans les journaux).
  - Chaque appel enregistre une impression sponsorisée, sans dédoublonnage (`BoostStatsRecorder.php:28`). C'est aussi le cas des revalidations ETag : un 304 recalcule tout (`routes/api/public.php:18-34`).
  - Or les impressions sont une métrique vendue aux agences.
- Piste : naviguer sans rendu serveur, ou consommer la graine à chaque nouvelle clé. Compter l'impression côté client, ou la dédoublonner par visiteur.
- Mesure (2026-10-15, 48195c53, mesureur) : lu `useSearch.ts:166-183` (graine et `requeteDejaServie` lues au seul montage, remises à `null` au premier passage de l'effet), `useSearch.ts:258-269` (`router.push`/`replace` dans une transition RSC), `useSearch.ts:360-366` (le client refait `apiFetch` dès que la clé change), `(liste)/page.tsx:120-134` (le rendu serveur appelle `rechercherBiensPublics`, mémoïsé par le seul `cache()` de React, donc par requête), `routes/api/public.php:19-49` (`cache.headers:etag` : un 304 recalcule tout, dit le commentaire mesuré de TCK-341) ; les deux appels n'ont pas été relevés dans un journal. Classement : V7, la partie « impressions comptées à chaque appel et à chaque 304 » tient par lecture, et les deux issues de la piste (naviguer sans rendu serveur, ou compter côté client ou par visiteur) changent la définition d'une impression.
- Mesure (2026-10-16, 4e2a29bb, implementeur) : reproduit avant correctif par `SponsoredImpressionsTest` (même visiteur deux fois, revalidation `If-None-Match` en 304 après 31 min, accueil deux fois) → 2 impressions au lieu de 1 sur les trois tests ; correctif (middleware `boost.impressions` à l'extérieur de `cache.headers:etag`, dédoublonnage `VisitorFingerprint` × bien sur 30 min) → 3/3 verts, 81/81 dans `tests/Feature/Boost` ; ablation (correctif retiré) → 3 rouges, remis → verts ; compteur placé à l'intérieur de `cache.headers` → le seul test du 304 rouge.

### Avec un tri par prix, la recherche élargie classe mal
- Réf : P01.05
- Statut : refusé — un tri explicite prime sur la pertinence
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/scout.php:218`, `takussan-api/app/Services/Search/PropertySearchService.php:263-265`
- Constat :
  - `rankingRules` commence par `sort`. En régime élargi avec `price:asc`, le prix passe donc avant le nombre de mots trouvés.
  - Mesuré : `studio climatisation Thiès` rend [2,2,1…] mots trouvés sans tri, et [1,1,1…] avec.
- Piste : ranger `sort` après `words`, ou ne pas envoyer le tri dans le plan de repli.
- Mesure (2026-10-15, 48195c53, mesureur) : lu `config/scout.php:218` (`rankingRules` ouvre sur `sort`) et `PropertySearchService.php:255-265` (le plan élargi, `matchingStrategy=last`, reçoit le tri) ; `GET` en lecture sur l'index local `takussan_localproperties`, `q=studio climatisation Thiès`, `matchingStrategy=last`, `showRankingScoreDetails=true` → mots trouvés des huit premiers `[2,2,2,2,1,1,1,1]` sans tri, `[1,1,1,1,1,1,1,1]` avec `sort=price:asc` (75 résultats dans les deux cas). Classement : V7, le constat tient, mais aucun texte n'écrit si un tri demandé doit céder devant le nombre de mots trouvés, et les deux issues de la piste changent l'ordre que voit le visiteur.

### `SEARCH_ID_CAP` vaut en fait 1000, et la pagination publique aussi
- Réf : P01.06
- Statut : fait · TCK-709
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Models/Concerns/HasQueryBuilder.php:28`, `takussan-api/config/scout.php:150-254`
- Constat :
  - `pagination.maxTotalHits` est à 1000, le défaut de Meilisearch (mesuré). `take(5000)` ne rend donc que 1000 identifiants.
  - Côté public, au-delà de la page 25 (à 40 par page), les pages sont inaccessibles (lu ; à vérifier avec plus de 1000 biens).
  - `takussan-api/CLAUDE.md` annonce 5000.
- Piste : déclarer `maxTotalHits` dans `index-settings`, et corriger la doc.
- Mesure (2026-10-15, 48195c53, mesureur) : lu `HasQueryBuilder.php:28` (`SEARCH_ID_CAP = 5000`), `config/scout.php` (aucune clé `pagination` dans `index-settings`), `takussan-api/CLAUDE.md:434` (annonce 5000) ; `GET …/indexes/takussan_localproperties/settings/pagination` → `{"maxTotalHits":1000}` ; test temporaire, retiré depuis, sur l'index de test ramené à `maxTotalHits: 3` avec six biens → `Property::search('')->take(5000)->keys()` rend 3 identifiants, et `PropertySearchService::search(per_page 2)` rend `total: 3`, `last_page: 2`, et une page 3 vide : le plafond borne bien la liste d'identifiants et la pagination publique (l'index local, à 795 biens, ne permet pas de le voir à 1000). Classement : V7, la correction de `CLAUDE.md` relèverait d'A6, mais le correctif du code choisit la valeur qui fixe le total affiché et les pages atteignables du catalogue public.
- Mesure (2026-10-16, 201a6842, implementeur) : `SearchIdCapIndexSettingsTest`, avant correctif, lit `maxTotalHits` = 1000 sur l'index de test `agencies` après `scout:sync-index-settings` (rouge « 1000 is identical to 5000 ») → `pagination.maxTotalHits = 5000` déclaré dans les `index-settings` des sept modèles indexés ; le test vérifie les sept index contre `SEARCH_ID_CAP` et le plafond de `MessagingContactController`, 2 verts ; ablation (`config/scout.php` de `pre-dev`) → rouge, remis → vert.

### Des réglages d'index périmés font échouer la liste par défaut
- Réf : P01.07
- Statut : fait · TCK-710
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/scout.php:217`, `takussan-api/app/Services/Search/PropertySearchService.php:615`, `takussan-api/docker/release.sh:27-28`
- Constat :
  - Sur l'index local, `ranked_at` n'est pas triable, et les documents n'ont ni `ranked_at` ni `region`. `sort=ranked_at:desc` rend `invalid_search_sort` (mesuré) : une liste publique sans mot échoue en 500.
  - `release.sh` ne fait qu'avertir quand la synchronisation des réglages échoue.
- Piste : faire échouer le déploiement sur une synchronisation ratée, ou dégrader le tri au lieu de lever.
- Mesure (2026-10-15, 48195c53, mesureur) : lu `config/scout.php:217` (`ranked_at` déclaré triable), `PropertySearchService.php:613-615` (`ranked_at:desc` par défaut sans mot), `docker/release.sh:26-28` (un échec de `scout:sync-index-settings` n'écrit qu'un avertissement) ; `GET` en lecture sur l'index local → attributs triables `[_geo, created_at, featured, price, published_at]`, et `search?q=&sort=ranked_at:desc` → `invalid_search_sort` ; le document 1 n'a ni `ranked_at` ni `region`. Classement : V5, le défaut tient sur l'index local, et l'issue principale de la piste (faire échouer le déploiement) modifie `release.sh` ; l'autre (dégrader le tri au lieu de lever) est un choix sur ce que la liste montre quand l'index est périmé.
- Mesure (2026-10-16, 201a6842, implementeur) : `scripts/test-release-reindex.sh` augmenté d'un passage où `scout:sync-index-settings` échoue → avant correctif, `release.sh` sortait en 0 et lançait 2 `scout:import` ; après, sortie 1 et aucune importation, et `SCOUT_DRIVER=collection` sort toujours en 0. Ablation : `release.sh` de `pre-dev` remis → les deux vérifications rouges ; correctif remis → 13 vérifications vertes. Tri de `PropertySearchService` inchangé.

### Les facettes sont calculées à chaque recherche, et personne ne les lit
- Réf : P01.08
- Statut : validé — retirer les facettes
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Search/PropertySearchService.php:76,97,152`
- Constat : `neighborhood`, `bedrooms` et `type` sont demandées à Meilisearch à chaque requête. Le front ne lit `facets` nulle part : seule la déclaration de type `types/search.ts:608` le mentionne.
- Piste : les retirer, ou les afficher (« Mermoz (43) ») en facettes disjonctives.
- Mesure (2026-10-15, fda326cd, mesureur) : relu `PropertySearchService.php:76` (`FACETS = ['neighborhood', 'bedrooms', 'type']`), `:97` et `:152` ; `grep -rn facets takussan-web/src` hors tests → seules `types/search.ts:580,608` (déclaration) ; la clé `facets` est au contrat de `GET /api/public/properties/search` (ADR-0024 l. 101-112) et assertée par `PropertySearchServiceTest.php:70-81` → le constat tient : facettes calculées, jamais lues. Classement : V7, la piste offre deux voies (retrait de la clé, ou facettes visibles) et choisir entre elles est un choix de produit ; le coût côté Meilisearch n'est pas mesuré.

### Une recherche d'un seul mot sans résultat n'a aucun repli
- Réf : P01.09
- Statut : validé — des suggestions dans l'état vide
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Search/PropertySearchService.php:125`, `takussan-api/app/Models/Property.php:321-338`
- Constat :
  - Le repli exige au moins 2 termes. En dessous de 5 lettres, aucune faute n'est tolérée : `ker` rend 0, sans suggestion (mesuré).
  - Fonctionnent bien (mesuré) : la recherche par référence (`NSRKO42K`, `pr-nsrko42k`) et l'accent dans la requête (`Guediawaye` trouve `Guédiawaye`).
- Piste : en cas de zéro résultat, proposer les suggestions de `SuggestService` dans `SearchEmpty`.
- Mesure (2026-10-15, 6a221e0f, mesureur) : lu `PropertySearchService.php:125` (`totalHits === 0 && count($useful) >= 2` : le repli exige toujours deux termes utiles), `SuggestService.php:157` (`dakr -> rien`, `oneTypo = 5` documenté) et `SearchEmpty.tsx` (aucun appel à `SuggestService`, aucune suggestion) ; `git log -S` et `grep` dans les tickets → aucun commit ni ticket ne l'a traité (TCK-558, `done`, ne propose pas de suggestion). Le rendu « `ker` → 0 » n'a pas été rejoué sur l'index (clé Meilisearch dans le `.env`, non lue) : il repose sur le seuil de 2 termes et le `oneTypo` lus. Classement : V7, afficher des suggestions dans l'état vide est un comportement visible neuf, au texte et à la mise en page à décider.

### La carte charge toutes les photos, et les coordonnées ne sont pas indexées
- Réf : P01.10
- Statut : retenu · autonome
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:521`, `takussan-api/app/Http/Resources/PropertyMapGeoJsonResource.php:49`
- Constat : `with('media')` charge toutes les photos de jusqu'à 501 biens pour n'en lire qu'une. `addresses` n'a aucun index sur `latitude`/`longitude` (mesuré, `pg_indexes`).
- Piste : charger la seule première photo, et ajouter un index `(latitude, longitude)` si la carte grossit.
- Mesure (2026-10-15, 6a221e0f, mesureur) : lu `PublicPropertyController.php:521` (`->with('address', 'media')`, limite `MAP_MAX_RESULTS + 1` l. 554) et `PropertyMapGeoJsonResource.php:49` (seul `getFirstMedia('photos')` est lu) ; tinker en lecture, `pg_indexes` sur `addresses` → trois index (`addressable`, `geo_city_id`, `geo_neighborhood_id`), aucun sur `latitude`/`longitude`, et aucune migration de l'arbre n'en pose. Les deux faits tiennent ; l'index n'est justifié par aucune mesure de lenteur (842 biens en dev), seule la partie photo est retenue comme correctif. Classement : A2, restreindre le chargement anticipé à la première photo de la collection `photos` ne change pas la vignette rendue.

## Angle 2 — Performances des requêtes

*Exploré le 2026-10-15 vers 0 h 45, sur la base de développement : `EXPLAIN` sans `ANALYZE` et
catalogue `pg_index`. Les deux 🔴 ont été relus contre le code par la session.*

Déjà sain (mesuré ou lu) :
- toutes les colonnes `agency_id` sont indexées ;
- `staleTime` vaut 5 min par défaut (`takussan-web/src/lib/query-client.ts:18`) ;
- les ressources utilisent `whenLoaded`.

### Liste des membres d'agence : une dizaine de requêtes par ligne
- Réf : P02.01
- Statut : fait · TCK-653
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Controllers/Api/AgencyController.php:191`, `takussan-api/app/Http/Resources/UserResource.php:37,86-87`, `takussan-api/app/Models/Concerns/HasProfiles.php:82-95,229-262`, `takussan-api/app/Models/User.php:263-289`
- Constat :
  - Par membre, `UserResource` appelle `profileTypes()` (un `first()` et cinq `exists()`), l'accesseur `agency_id` (quatre `get()` sur les profils) et `getFirstMediaUrl('avatar')`.
  - Le front appelle cette route avec `per_page=100` juste pour remplir des listes de noms : `AuditTrail.tsx:203`, `ContactLeadsInbox.tsx:242`, `role-delegations.ts:157`.
  - Le sparse fieldset ne coupe aucun de ces calculs. Cela fait environ 1 100 requêtes par appel (lu ; le compte exact reste à mesurer).
- Piste : précharger les profils et `media`, ou ne sortir `roles` et `agency_id` que pour soi.
- Mesure (2026-10-15, c8f7f127, mesureur) : test temporaire, retiré depuis, `GET /api/agencies/{id}/members?per_page=1000&fields[users]=id,first_name,last_name` sous `DB::enableQueryLog()` → 129 requêtes pour 11 lignes, 459 pour 41, 1 669 pour 151, soit environ 11 par ligne, sparse fieldset compris. Lu `UserResource.php:37,86-87` (`getFirstMediaUrl`, `agency_id`, `profileTypes()`), `HasProfiles::profileTypes()` (cinq `exists()` sans regard pour les relations chargées, alors que `profiles()` les réutilise déjà). Classement : A2, précharger les profils et `media` et faire relire à `profileTypes()` les relations chargées rend la même sortie ; la variante de la piste qui retire `roles`/`agency_id` de la sortie relèverait de V7 et n'est pas couverte par ce classement.
- Mesure (2026-10-15, 6c8a08b0, implementeur) : `AgencyMembersQueryCountTest` écrit d'abord, rouge avant correctif : 85 requêtes pour 7 lignes, 217 pour 19 (`per_page=100`, sparse fieldset). Préchargement des cinq relations de profil, de `tenantLeases` et de `media` après pagination, et relecture des relations chargées dans `profileTypes()` et `hasActiveTenantLease()` → 19 requêtes pour 7 comme pour 19 lignes ; `roles`, `agency_id` et `avatar_url` inchangés sur six sortes de membres. Ablation : sans le préchargement, rouge (85/217) ; sans la relecture dans le trait, rouge (54/114).

### `per_page` sans plafond sur une vingtaine de routes
- Réf : P02.02
- Statut : fait · TCK-654
- Gravité : 🔴 défaut avéré
- Où : `AgencyController.php:191`, `AuditLogController.php:57`, `PropertyPriceHistoryController.php:18`, `ServiceProviderProfileController.php:44`… (sous `takussan-api/app/Http/Controllers/Api/`)
- Constat :
  - `HasQueryBuilder::PER_PAGE_MAX = 100` ne borne que le `paginate()` sans argument. Un `paginate((int) $request->input('per_page', …))` le contourne.
  - La session en relit 17 de cette forme exacte ; l'agent en compte 23 en incluant les variantes.
  - TCK-599 n'a corrigé que les favoris. Combiné au constat précédent, `per_page=10000` sur les membres d'agence déclenche de l'ordre de 100 000 requêtes.
- Piste : une méthode unique `Controller::perPage($request, $défaut, $max)`, et une garde `scripts/check-*.mjs` qui refuse `paginate(` nourri de `$request->`.
- Mesure (2026-10-15, c8f7f127, mesureur) : `grep -rnE "paginate\([^)]*\$request"` sous `app/Http/Controllers` → 17 `paginate((int) $request->input('per_page', …))`, 3 `paginate($request->integer('per_page', 20))` (`ServiceProviderBillController`, deux `PlatformPayoutController`), 1 `paginate($request->input('per_page', 20))` brut (`RoleDelegationController.php:40`), aucun borné ; `ReviewController` et `FavoriteController` passent par `validated()` et sont exclus du compte. Test temporaire, retiré depuis : `per_page=1000` sur les membres d'agence → 200, `meta.per_page` = 1000. Aucun appelant du front n'envoie plus de 100 à ces routes (`grep per_page` dans `takussan-web/src`). Classement : A1 et A5, le plafond attendu est écrit (`HasQueryBuilder::PER_PAGE_MAX = 100`, borné par `min()`, appliqué aux favoris par TCK-599) et la garde ne resserre aucun seuil existant.
- Mesure (2026-10-15, e9f9289c, implementeur) : `PerPagePlafondTest` écrit d'abord, rouge avant correctif : `per_page=1000` → `meta.per_page` = 1000 sur `/api/agencies/{id}/members` et `/api/admin/announcements`, et `per_page=abc` rendait 15 au lieu du défaut 20 ; `PerPageBorneTest` (balayage de `app/Http/Controllers`) rouge sur 28 lectures de `per_page` sans `min(` sur la ligne, dont 26 sans aucun plafond (2 bornées à la ligne suivante). Correctif : `Base\Controller::tailleDePage()` borné à 100 (200 gardé pour l'audit transverse), appliqué aux 26 ; les 2 autres ramenées sur une ligne à l'identique → 5 tests verts. Ablation : contrôleurs remis à l'état d'avant → 4 rouges sur 5 ; plafond retiré du helper seul → 2 rouges (1000 au lieu de 100). Garde écrite en PHPUnit et non en `scripts/check-*.mjs` : `repo-ci.yml` ne joue que les gardes qu'il nomme.

### Le profil plateforme est relu à chaque autorisation
- Réf : P02.03
- Statut : fait · TCK-711
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Providers/AppServiceProvider.php:678`, `takussan-api/app/Models/Concerns/HasProfiles.php:327-331`, `RequireTwoFactor.php:64`, `RequireRecentTwoFactor.php:45`, `LeaseResource.php:125`
- Constat :
  - `Gate::before` appelle `isSuperAdmin()`, qui fait une requête à chaque `can()`, sans mémoïsation.
  - Les middlewares 2FA ajoutent chacun un `exists()`.
  - `LeaseResource` l'appelle une fois par ligne. `ReviewController.php:67-70` contourne déjà le problème localement (lu).
- Piste : charger `platformProfile` une fois par requête, dans `ResolveActiveProfile`.
- Mesure (2026-10-15, 48195c53, mesureur) : lu `AppServiceProvider.php:680` (`Gate::before` → `isSuperAdmin()`), `HasProfiles.php:327-334` (`activePlatformLevel()` relit `platformProfile()->active()->first()` si la relation n'est pas chargée), `RequireTwoFactor.php:64` et `RequireRecentTwoFactor.php:45` (`platformProfile()->exists()`), `LeaseResource.php:125`, `ReviewController.php:68-70` (`loadMissing('platformProfile')` local) ; tinker en lecture sur la base de dev → `isSuperAdmin()` trois fois = 3 requêtes `platform_profiles`, `Gate::allows('leases.terminate')` trois fois = 18 requêtes, dont une `platform_profiles` par appel. Classement : V2, le gain est de performance, mais charger le profil plateforme une fois par requête fige le contournement super-admin de toutes les autorisations pour la durée de la requête, ce qui demande l'accord du porteur.
- Mesure (2026-10-16, 8edb161f, implementeur) : `PlatformProfileLuUneFoisParRequeteTest` écrit d'abord, rouge avant correctif : `GET /api/leases` d'un super-admin sur 3 baux lisait `platform_profiles` 8 fois. Correctif : `ResolveActiveProfile` charge `platformProfile` par `load()` une fois par requête, et les trois `platformProfile()->exists()` de la 2FA (`RequireTwoFactor`, `RequireRecentTwoFactor`, `TwoFactorRequirement`) relisent la relation chargée → 1 lecture, 2 verts. Ablation : `load()` retiré → 8 lectures, rouge ; `loadMissing()` à sa place → la révocation entre deux requêtes sur la même instance n'est plus vue (200 au lieu de 403), rouge.

### 110 clés étrangères sur 252 sans index, dont une sur le chemin de `/api/auth/me`
- Réf : P02.04
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Models/Concerns/HasProfiles.php:281-291`, avec un docblock faux en `:221-223`
- Constat :
  - `hasActiveTenantLease()` parcourt tout `customers_pkey` avec un filtre `user_id`, même quand le Seq Scan est interdit (mesuré). Le docblock dit pourtant que les deux colonnes sont indexées.
  - Au total, 110 FK sur 252 n'ont aucun index qui commence par elles (mesuré). Notamment :
    - `customers.user_id` ;
    - `property_visits.customer_id` et `.agent_id` ;
    - `property_collaborators.user_id` ;
    - `maintenance_requests.lease_id` ;
    - `conversations.lease_id` ;
    - `inventories.property_id` et `.tenant_id`.
- Piste : `customers.user_id` d'abord, puis les autres une par une, sur `EXPLAIN` (piège PostgreSQL n° 8).
- Mesure (2026-10-15, 8ebb0cc3, mesureur) : lu `HasProfiles.php:281-292` (`hasActiveTenantLease()` inchangé) et `:222-225` (le docblock dit encore « les deux colonnes portant un index ») ; `SELECT indexdef FROM pg_indexes` sur la base de dev, migrée jusqu'à `2026_10_14_120100` → `customers` n'a aucun index sur `user_id` (`leases_tenant_id_index` existe) ; `EXPLAIN` de la jointure `customers ⋈ leases` filtrée sur `customers.user_id` → `Seq Scan on customers` ; requête sur `pg_constraint`/`pg_index` → 252 FK, dont 110 sans index qui commence par elles ; aucun ticket ni commit ne pose cet index (`grep` du backlog, `git log -S customers_user_id`). Classement : A2 pour la seule partie `customers.user_id` (migration neuve d'index avec son `down()`, et le docblock de `:222-225` ramené à ce que fait le schéma, A6) ; les 109 autres FK ne sont pas couvertes par ce classement, elles relèvent d'un `EXPLAIN` chacune et de plus d'un ticket.

### `TagController` recompte ce que `withCount` a compté ; le tri des tags CRM pourrait être rejeté
- Réf : P02.05
- Statut : fait · TCK-712 — reste : lancer la requête des équipements en parallèle de celle du bien sur la fiche (`properties/[id]/page.tsx`), que la décision ne reprend pas
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/TagController.php:20,45,143-147`, `takussan-web/src/app/(dashboard)/app/properties/[id]/page.tsx:62,104`, `takussan-api/app/Models/Tag.php:32`
- Constat :
  - Deux `count()` par tag sont faits après `withCount`. Cela fait environ 72 comptes à chaque ouverture d'une fiche de bien.
  - Ces équipements ne sont demandés qu'après la réponse du bien : deux requêtes en série (lu).
  - À vérifier : `fetchCrmTags` envoie `sort=-usage_count`, absent de `$requestSortable`. Le 400 serait masqué par `.catch(() => [])`, et les suggestions CRM seraient toujours vides.
- Piste : lire `properties_count`/`customers_count`, et lancer la requête des tags en parallèle de celle du bien.
- Mesure (2026-10-15, 8ebb0cc3, mesureur) : lu `TagController.php:20,43-47,143-148` et `Tag.php:32` (`$requestSortable = ['id','name','type','created_at']`), `customers.ts:36,232-246`, `customers/[id]/page.tsx:91`, `properties/[id]/page.tsx:62-104` ; test temporaire, retiré depuis, agent d'agence, 5 étiquettes CRM et 5 équipements → `GET /api/tags?filter[type]=crm&fields[tags]=id,name,color,usage_count&sort=-usage_count` rend 400 `http.bad_request`, et rend encore 400 sans le `sort` : c'est `fields[tags]=usage_count` qui suffit à le refuser ; sans `usage_count` → 200 ; `filter[type]=amenity` → 20 requêtes dont 12 `count(*)`, soit deux comptes par étiquette. Correction du constat : le compte `customers` de `format()` est borné à l'agence, ce que `withCount` ne fait pas ; seul le compte `properties` est redondant. Classement : V7, la part de performance seule serait A2, mais corriger le 400 rend visibles des suggestions qui n'ont jamais été affichées, et l'ordre « par usage dans l'agence » demande un tri neuf ou un choix de produit.
- Mesure (2026-10-16, 8edb161f, implementeur) : `TagCrmSuggestionsTest` écrit d'abord ; agent d'agence, la requête de `fetchCrmTags` sans `usage_count` dans `fields` → 400 (le tri seul suffit à le refuser) ; `filter[type]=amenity` sur 4 étiquettes → 4 `count(*)` de biens, 8 sous `fields[tags]=id,name` (le `fields` emportait le `withCount`) → tri `usage_count` (biens + clients de l'agence de l'appelant) dans `Tag::buildQuery()`, `withCount` après `buildQuery()`, `properties_count` lu dans `format()`, `TAG_FIELDS` sans `usage_count` ; 2 verts, et 3 ablations rouges (tri retiré : 400 ; `withCount` remis avant : 8 comptes ; tri sans borne d'agence : ordre global) ; `tests/Feature/Tags` et les classes de `TagController` : 76 + 26 verts.

### `whereDate()` sur un horodatage empêche l'usage de l'index
- Réf : P02.06
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `CalendarEventCollector.php:195-196,362-363`, `DashboardAgentService.php:114,140`, `Property.php:651,657`, `PaymentController.php:168-180`, `ExportDataService.php:453-460`
- Constat : `scheduled_at::date >= …` force un Seq Scan. Écrite en plage, la même borne passe par l'index `property_visits_scheduled_at_status_index` (mesuré). Sur une colonne `date`, le cast ne coûte rien.
- Piste : des plages `>= début du jour`, `< lendemain`.
- Mesure (2026-10-15, 8ebb0cc3, mesureur) : relu par `grep whereDate` : `CalendarEventCollector.php:195-196,362-363`, `DashboardAgentService.php:114,140`, `Property.php:651,657`, `PaymentController.php:168-180`, `ExportDataService.php:456,459` (les lignes citées `453-460` ont glissé à `456,459`, et `:281` porte un `whereDate` sur `due_date`) ; `information_schema` → `property_visits.scheduled_at` est un `timestamp without time zone`, `config/app.php:70` et `SHOW timezone` valent UTC ; `EXPLAIN` avec `enable_seqscan=off` sur la base de dev → `scheduled_at::date >= … AND <= …` reste un `Seq Scan`, la même borne en plage `>= '2026-10-01' AND < '2026-11-01'` passe par `Bitmap Index Scan on property_visits_scheduled_at_status_index`. Classement : A2, sur une colonne horodatée sans fuseau la plage `[début du jour, lendemain)` rend exactement les mêmes lignes que le cast, sans choix de produit ; les colonnes de type `date` (`start_date`, `end_date`, `due_date`) restent hors du correctif.

### Export synchrone jusqu'à 50 000 modèles complets
- Réf : P02.07
- Statut : fait · TCK-713
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Export/ExportDataService.php:109,139,463-467`, `takussan-api/app/Http/Controllers/Api/ExportController.php:82`
- Constat : `limit(≤ 50 000)->get()` sans `select`, jsonb compris, pendant la requête HTTP (lu).
- Piste : sélectionner les colonnes exportées, `lazyById()` avec une réponse en flux, ou une tâche en file au-delà d'un seuil.
- Mesure (2026-10-15, 8ebb0cc3, mesureur) : lu `ExportDataService.php:103-128,134-140,455-467` (`limit(≤ 50 000)->get()` sans `select`, puis `map` en tableau), `ShowExportRequest.php:32,35` (`limit` jusqu'à 50 000, formats `csv`, `xlsx`, `pdf`), `ExportController.php:82` (`collect()` pendant la requête) et le rédacteur d'export (`csv()` diffuse un tableau déjà chargé en entier). Classement : V7, sélectionner les colonnes serait A2, mais le défaut porté par l'entrée (50 000 lignes, PDF compris, dans la requête HTTP) ne se ferme qu'en changeant ce que l'utilisateur reçoit : un flux, une tâche en file avec notification, ou un plafond plus bas.
- Mesure (2026-10-16, 8ca7d33f, implementeur) : reproduit avant correctif par `ExportColonnesEtPlafondTest` → les neuf exports lisent `select * from "<table>"`, `limit=10001` et `format=pdf&limit=2001` rendent 200, un PDF sans `limit` demande `limit 5000` (12 rouges sur 14) → `select` des colonnes exportées sur les neuf requêtes, `limit` au plus 10 000 (2 000 en PDF) dans `ShowExportRequest`, défaut ramené à 2 000 en PDF ; 14 verts sous `preventAccessingMissingAttributes`, ablation → 12 rouges, `metadata` retirée du `select` de la balance âgée → reste dû faux, rouge.

### La liste pro des biens fait six requêtes HTTP, dont deux en série
- Réf : P02.08
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/(dashboard)/app/properties/(liste)/page.tsx:97-125,210-229`
- Constat : la liste plus cinq `countProperties` (`per_page=1`), dont « vendus » suivi de « loués » en `.then` (lu).
- Piste : un seul endpoint de compteurs en `COUNT(*) FILTER (WHERE …)`, comme `DashboardAgencyService.php:42-52`.
- Mesure (2026-10-15, 8ebb0cc3, mesureur) : lu `properties/(liste)/page.tsx:97-125` : `Promise.all` de la liste et de quatre membres, dont le compte « vendus » suivi par `.then` du compte « loués », et `countProperties` en `:210`. Classement : A2, lancer « loués » comme membre propre du `Promise.all` retire la requête en série sans changer aucun chiffre ; l'endpoint de compteurs proposé par la piste ajoute une surface d'API dont le périmètre doit reproduire celui de l'index, et n'est pas couvert par ce classement.

### Fiche client : les notes sont chargées deux fois
- Réf : P02.09
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/queries/customers.ts:114`, `takussan-api/app/Http/Resources/CustomerResource.php:30`, `takussan-web/src/app/(dashboard)/app/customers/[id]/page.tsx:87-91`
- Constat : `include=notes` sérialise toutes les notes, puis la page les redemande paginées (lu).
- Piste : retirer `notes` de l'`include`.
- Mesure (2026-10-15, 8ebb0cc3, mesureur) : lu `customers.ts:108-121` (`include: ['notes','documents','tags']`), `CustomerResource.php:30` (`'notes' => $this->notes` : la colonne `notes` n'est pas dans `DASHBOARD_CUSTOMER_DETAIL_FIELDS`, c'est donc la relation qui est rendue), `customers/[id]/page.tsx:87-91` ; `grep` de `.notes` dans `takussan-web/src` → aucun lecteur de `customer.notes` sur la fiche ni dans `CustomerDetailSheet.tsx`, qui charge ses notes à part ; test temporaire, retiré depuis, client à 30 notes → `GET /api/customers/{id}` avec les champs et l'`include` du front rend `data.notes` à 30 éléments, et `GET /api/customers/{id}/notes` rend 20 notes, `meta.total` 30. Classement : A2, retirer `notes` de l'`include` de `fetchDashboardCustomer` ne change rien à l'écran puisque rien ne lit ce champ.

### Onglets de visites : cinq requêtes au montage, et un cache jamais réutilisé
- Réf : P02.10
- Statut : validé — arrondir `nowIso` à la minute ; reste : `enabled` limité à l'onglet actif, qui ferait perdre les compteurs
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/components/visits/VisitsList.tsx:37-71`
- Constat : un `useVisits` est lancé par onglet. `nowIso` entre dans la `queryKey` et change à chaque montage (lu).
- Piste : `enabled` réservé à l'onglet actif, et `nowIso` arrondi à la minute.
- Mesure (2026-10-15, 6a221e0f, mesureur) : lu `VisitsList.tsx:37-69` (cinq `useVisits`, `nowIso = useMemo(() => new Date().toISOString(), [])`, recalculé à chaque montage, dans les paramètres donc la clé) et l. 88-93 : chaque onglet affiche `query.data.meta.total` en badge, et la requête « Non attribuées » part aussi pour qui n'est pas du personnel. Le constat tient, mais il omet que les quatre requêtes inactives nourrissent les compteurs visibles. Classement : V7, réserver `enabled` à l'onglet actif retire ou change les compteurs affichés, un choix d'interface ; seul l'arrondi de `nowIso` relèverait d'A2.

### `scheduled_task_runs` grossit sans purge
- Réf : P02.11
- Statut : fait · TCK-802 — reste : la purge planifiée à 90 jours, que contredit celle de P19.05 (7 jours) : durée à trancher par le porteur
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Admin/HealthcheckService.php:142`
- Constat : environ 11 000 lignes en 34 jours en dev, et aucune purge. La sonde de santé fait un Seq Scan suivi d'un Sort à chaque minute (mesuré).
- Piste : un index `(task, last_run_at DESC, id DESC)` et une purge planifiée.
- Mesure (2026-10-15, 6a221e0f, mesureur) : lu `HealthcheckService.php:142` (`latest('last_run_at')->value(…)`, sans filtre de tâche), `ScheduledTaskInspector.php:15-37` (dernière exécution par tâche, sous-requête corrélée), la migration `2026_05_07_000226` (seul index `task`), aucun `Prunable` sur `ScheduledTaskRun` ni purge dans `routes/console.php` ; TCK-383 (`done`) écarte la rétention de son périmètre. Tinker en lecture → 14 948 lignes du 2026-09-10 au 2026-10-15, `EXPLAIN ANALYZE` de la requête de la l. 142 → `Seq Scan` puis `Sort` top-N, 3,6 ms. Classement : V4, la purge est une suppression de données dont la durée de rétention est à choisir ; l'index seul relèverait d'A2.
- Mesure (2026-10-17, 7c7bd05bf, implementeur) : avant correctif, `scheduled_task_runs` n'avait que l'index `task`, et la lecture de la dernière exécution d'une tâche passait par un `Sort` (plan relevé sous `enable_seqscan = off`) → migration neuve `(task, last_run_at desc, id desc)` et `ScheduledTaskRunsIndexTest` (index présent, plan sans `Sort`) ; ablation : migration retirée, les deux tests rougissent ; remise, verts. La purge n'est pas posée : sa durée contredit celle de P19.05 (7 jours). La sonde de la l. 142 (aujourd'hui l. 366), sans filtre de tâche, ne profite pas de cet index.

### Tri du catalogue public sans index adapté
- Réf : P02.12
- Statut : retenu · autonome
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:156`
- Constat : `ORDER BY ranked_at DESC NULLS LAST, id DESC` force un Sort : l'index `ranked_at` est en ASC (mesuré).
- Piste : un index partiel `(ranked_at DESC NULLS LAST, id DESC) WHERE visibility = 'public' AND NOT is_test`.
- Mesure (2026-10-15, 6a221e0f, mesureur) : lu `PublicPropertyController.php:156-157` (`orderByRaw('ranked_at DESC NULLS LAST')->orderByDesc('id')`, la ligne n'a pas bougé) et la migration `2026_10_12_500300` (`properties_ranked_at_idx` en ASC) ; tinker en lecture, `EXPLAIN ANALYZE` de la requête de `index()` (scope `public()`, `limit 20`) → `Bitmap Heap Scan` puis `Sort` top-N sur `ranked_at DESC NULLS LAST, id DESC`, 9,2 ms pour 842 biens. Classement : A2, une migration neuve d'ajout d'index partiel `(ranked_at DESC NULLS LAST, id DESC) WHERE visibility = 'public' AND NOT is_test`, avec son `down()`, ne change pas le résultat.

### Pénalités de retard : le plafond est relu pour chaque échéance
- Réf : P02.13
- Statut : fait · TCK-779
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Lease/LateFeeCalculator.php:185,199`, `takussan-api/app/Jobs/Lease/ApplyLateFeesJob.php:52-56`
- Constat : une à deux lectures de `settings` par échéance, alors que la valeur est constante pour une agence. Le catalogue de TCK-651 met la valeur globale en cache ; la ligne d'agence ne l'est pas (lu).
- Piste : lire le plafond une fois par agence dans `applyForAgency`.
- Mesure (2026-10-15, 6a221e0f, mesureur) : lu `LateFeeCalculator.php:183-200` (`applyCap()` appelle `capPercent()` à chaque échéance, `ScopedSetting::agencyRow(…)` lu en base, repli sur `PlatformSettingService::getValue`) et `ApplyLateFeesJob.php:48-60` (`applyForAgency` boucle par échéance sur `$calculator->apply()`) ; aucun commit depuis TCK-651 n'y a touché. Le constat tient. Classement : V1, le correctif modifie la fonction qui calcule le plafond d'une pénalité, même sans changer son résultat.
- Mesure (2026-10-17, 8ef0d0915, implementeur) : reproduit avant correctif par `ApplyLateFeesJobTest::test_le_plafond_de_l_agence_est_lu_une_fois_par_passage` : trois échéances d'une agence à plafond de 3 % lisent sa ligne `settings` trois fois en un passage → `capPercent()` garde la valeur par agence pour la vie de l'instance (le job en résout une par passage) ; une lecture, pénalités inchangées (3 000 sur 100 000) ; ablation : rouge (3 lectures), correctif remis vert ; 10 classes voisines vertes (151 tests).

## Angle 3 — Isolation entre agences et autorisation

*Exploré le 2026-10-15 vers 0 h 50, en lecture du code (aucune requête envoyée). Les trois 🔴 ont
été relus contre le code par la session.*

Ce qui tient (lu) :
- les listes de biens, baux, factures, reversements, contacts et documents ;
- `ResolveActiveProfile` refuse un profil non actif ;
- `PayoutMethodPolicy` et `MediaPolicy` ;
- la route privée signée `media.private.show` ;
- les proxys BFF à segments filtrés (`cheminAmont`).

### `PUT /api/users/{user}/role` contourne les garde-fous de l'équipe
- Réf : P03.01
- Statut : fait · TCK-664
- Gravité : 🔴 défaut avéré, au sein d'une même agence
- Où : `takussan-api/app/Http/Controllers/Api/UserRoleController.php:38-74,104-135`, `takussan-api/app/Http/Requests/Api/UpdateUserRoleRequest.php:10-16`
- Constat :
  - Un admin d'agence change le rôle de tout membre qui a un profil dans l'agence, quel que soit son statut (« appartenance, sans filtre de statut », TCK-587).
  - `setAgent()` et `setOwner()` suppriment les profils `agency_admin` de l'agence. Il n'y a aucune garde sur l'admin principal, le dernier admin, soi-même ni la suspension. Un agent suspendu promu admin repart avec un profil actif neuf.
  - Les voies sœurs ont ces gardes : `AgencyMemberRemovalService.php:52` (`cannot_remove_primary_admin`, dernier admin sous verrou) et `TeamMemberSuspensionService.php:58-59`.
  - Le front appelle cette route (`takussan-web/src/lib/queries/admin-users.ts:81`).
  - Aucun test de `UserRoleControllerTest` ne vise ces cas (lu).
- Piste : une policy `changeMemberRole` qui réutilise les gardes d'`AgencyMemberRemovalService`, un refus des cibles non actives, et un test par garde.
- Mesure (2026-10-15, c8f7f127, mesureur) : lu `UserRoleController.php:37-135` (appartenance sans statut, `setAgent()`/`setOwner()` suppriment les profils `agency_admin`, aucune garde sur soi, le dernier admin ni la suspension) ; test temporaire, retiré depuis, admin unique de l'agence → `PUT /api/users/{agent suspendu}/role {role: agency_admin}` rend 200 et un profil admin `active`, puis `PUT /api/users/{soi}/role {role: agent}` rend 200 et laisse l'agence sans aucun profil admin. Le front l'appelle par le BFF `/api/admin-users/{id}/role` (`admin-users.ts:81`). Classement : V2, le correctif ajoute des refus sur une autorisation qu'un admin d'agence légitime utilise aujourd'hui.
- Mesure (2026-10-16, ddb5f050, implementeur) : avant correctif, `UserRoleControllerTest` (+4 cas) : changer son propre rôle, rétrograder l'admin principal, rétrograder le seul admin (acteur super-admin) et promouvoir un agent suspendu rendent tous 200 → `UserRoleController::assertRoleChangeable()` et le dernier admin compté sous verrou de `agencies` ; 422 `user.role_change_self`, `user.role_primary_admin`, `user.role_last_admin`, `user.role_member_not_active`, rien d'écrit, et un co-admin non protégé se rétrograde toujours (200). Ablation : contrôleur remis à `pre-dev` → 4 rouges sur 18 ; remis → 18 verts.

### `/api/users?include=…Profiles` fait sortir les profils des autres agences
- Réf : P03.02
- Statut : fait · TCK-665
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Controllers/Api/UserAdminController.php:35-49`, `takussan-api/app/Models/User.php:156`, `takussan-api/app/Models/Concerns/HasQueryBuilder.php:277-280`
- Constat :
  - La base de la liste est bien limitée aux personnes qui ont un profil dans l'agence active. Mais `$requestLoadable` (`agentProfiles`, `ownerProfiles`, `agencyAdminProfiles`, `platformProfile`) charge **tous** les profils de la personne, y compris ceux d'autres agences.
  - Sans `fields[…]`, cela livre `commission_rate`, `license_number`, `metadata`, `monthly_income`, `employer` et `guarantor_user_id` d'une agence tierce. Les colonnes `SENSITIVE` restent cachées.
  - Le front refiltre côté client (`takussan-web/src/components/admin/users/team-suspension.ts:27-31`), ce qui confirme que la donnée arrive.
  - `filter[role]=agent` fait un `whereHas` sans agence : il révèle qu'un bailleur de A est agent ailleurs.
  - À vérifier : `include=platformProfile` dit si une personne est opératrice de la plateforme.
  - `UserAdminAgencyScopeTest` n'a aucun cas avec `include` (lu).
- Piste : des `AllowedInclude::custom` contraints à l'agence active, idem pour `filter[role]`, et un test avec une personne présente dans deux agences.
- Mesure (2026-10-15, c8f7f127, mesureur) : test temporaire, retiré depuis, admin de l'agence A, personne bailleur dans A et agent dans B (`license_number` `LIC-B-42`, `commission_rate` 7,5) → `GET /api/users?include=agentProfiles` rend 200 avec le profil d'agent de B entier (`agency_id` de B, licence, commission, `metadata`) ; `GET /api/users?filter[role]=agent` rend cette personne. Lu `User.php:156` (`$requestLoadable`) et `UserAdminController.php:35-50`. Non re-mesuré : `include=platformProfile`, qui reste à vérifier. Classement : V2 et V3, contraindre les includes et le filtre à l'agence active change ce qu'une autorisation livre et touche des données personnelles d'une agence tierce.
- Mesure (2026-10-16, b775f8f6, implementeur) : reproduit avant correctif par `UserAdminIncludeScopeTest`, admin de A, personne bailleur dans A, agent (`LIC-B-42`) et admin dans B → profils de B livrés par `include=…Profiles`, personne retenue par `filter[role]=agent` et par `filter[role]=service_provider` (collaboration avec B seulement), `include=platformProfile` en 200 : 4 rouges sur 6. Correctif : `User::buildAgencyTeamQuery()` hors super-admin (includes de profils bornés à l'agence active par `AgencyScopedRelationship`, sparse fieldsets gardés ; `platformProfile` refusé en 400 ; `filter[role]` jugé dans l'agence, `super_admin` vide), et la console d'équipe ne demande plus `platformProfile`. 6 verts ; ablation (contrôleur remis sur `buildQuery()`) → les mêmes 4 rouges, remis → vert.

### Les étiquettes CRM de toutes les agences sont lisibles par tout compte connecté
- Réf : P03.03
- Statut : fait · TCK-666
- Gravité : 🔴 défaut avéré, impact modéré (des libellés, pas des fiches)
- Où : `takussan-api/app/Http/Controllers/Api/TagController.php:18-45,67-77`, `takussan-api/app/Http/Controllers/Api/CustomerTagController.php:60-66`, `takussan-api/app/Models/Tag.php:21-23`
- Constat :
  - Une étiquette tapée sur un client est créée en type `crm`, statut `approved`.
  - `GET /api/tags` (`auth:sanctum` seul, donc ouvert à un compte auto-inscrit) ne restreint à l'agence que si `filter[type]=crm` est envoyé **et** si `agency_id` est non nul. `show` ne regarde que le statut.
  - `$user->agency_id` donne aussi ce périmètre à un bailleur.
  - La comparaison passe par une variable intermédiaire, que `scripts/check-agency-scope-clause.mjs` ne voit pas.
  - Aucun test entre deux agences (lu).
- Piste : exclure le type `crm` hors de l'agence du personnel, dans `index` comme dans `show`, et un test entre deux agences.
- Mesure (2026-10-15, c8f7f127, mesureur) : lu `TagController.php:17-46,62-73` (le périmètre d'agence n'agit que si `filter[type]=crm` est envoyé et `agency_id` non nul ; `show` ne regarde que le statut) et `Tag.php:21-23` (statut `approved` par défaut) ; test temporaire, retiré depuis, étiquette CRM créée comme `CustomerTagController` la crée et posée sur un client de l'agence A, compte `customer` sans agence → `GET /api/tags` la liste (200) et `GET /api/tags/{id}` la rend (200). Non re-mesuré : l'angle mort de `check-agency-scope-clause.mjs`. Classement : V2, exclure le type `crm` hors de l'agence du personnel restreint une lecture que des appelants légitimes (autocomplétion des étiquettes) utilisent aujourd'hui.
- Mesure (2026-10-16, 1efd784a, implementeur) : `TagCrmAgencyScopeTest` avant correctif, agences A et B chacune avec un client étiqueté CRM → 3 rouges sur 4 : un agent de A, un compte sans agence et un bailleur de A listent l'étiquette de B (le bailleur lit aussi celle de A) ; la console passait déjà. Correctif : scope `Tag::sansCrmHorsDeSonAgence()` (personnel par `staffAgencyId()`) en index et en show (404). Ablation : contrôleur d'origine → 3 rouges ; garde de `show` seule retirée → 3 rouges ; `agency_id` au lieu de `staffAgencyId()` → le cas du bailleur rouge ; remis → 4 verts.

### Sous impersonation, l'opérateur lit en clair les comptes de reversement de la cible
- Réf : P03.04
- Statut : fait · TCK-714 — reste : account_holder_name, toujours rendu en clair sous impersonation, hors de la décision du porteur
- Gravité : 🟠 risque
- Où : `takussan-api/app/Http/Controllers/Api/Me/PayoutMethodController.php:21-31`, `takussan-api/app/Http/Resources/PayoutMethodResource.php:19-33`, `takussan-api/app/Http/Middleware/EnforceImpersonationReadOnly.php:44-58`
- Constat :
  - `account_identifier` et `account_holder_name` sont rendus au « titulaire », c'est-à-dire à la cible pendant une impersonation.
  - La route n'est ni dans `REFUSED_READS` ni sous step-up, alors que la donnée est chiffrée et cachée ailleurs (TCK-601). Le RIB du bailleur, lui, exige un step-up.
- Piste : masquer la forme claire sous `ImpersonationContext`, ou ajouter `api/me/payout-methods*` à `REFUSED_READS`.
- Mesure (2026-10-15, 8ebb0cc3, mesureur) : lu `PayoutMethodResource.php:19-33` (`$holder` = l'utilisateur de la requête), `EnforceImpersonationReadOnly.php:44-58,81-84` (`api/me/payout-methods` absent de `REFUSED_READS`), `ProtectedActions.php:240-242` (step-up sur `store`, `update`, `destroy`, pas sur `index`) ; test temporaire, retiré depuis, par `SessionsDImpersonation` → `GET /api/me/payout-methods` sous le jeton d'impersonation rend 200 avec `account_identifier` en clair et `account_holder_name`. Classement : V2 et V3, refuser ou masquer cette lecture change ce qu'un opérateur peut voir sous impersonation, et touche des coordonnées bancaires.
- Mesure (2026-10-16, 4c7d8810, implementeur) : `ImpersonationPayoutMethodsTest` avant correctif → rouge, `GET /api/me/payout-methods` sous le jeton d'impersonation rend `account_identifier` = `+221 77 123 45 67` ; la cible sous son propre jeton lit la forme claire. Correctif : `PayoutMethodResource` rend `PayoutMethod::mask()` quand `ImpersonationContext` est actif → `•••• 4567`, aucune forme claire dans la réponse. Ablation : ressource d'origine → rouge ; remise → vert.

### Dix endpoints valident avant d'autoriser (422 au lieu de 403)
- Réf : P03.05
- Statut : fait · TCK-730 — reste : les 27 autres FormRequests, une à une
- Gravité : 🟠 dette
- Où :
  - `Api/PropertyController.php:183-185` ;
  - `Api/InventoryController.php:114-116,167` ;
  - `Api/CustomerTagController.php:17-19` ;
  - `Api/DocumentVersionController.php:45-47` ;
  - `Api/Agency/KycController.php:27-30` ;
  - `Api/Accounting/BankStatementController.php:29-31` ;
  - `Api/Accounting/BankStatementLineController.php:37-39` ;
  - `Api/Permissions/RoleDelegationController.php:45-47` ;
  - `Api/LeaseController.php:52-57` (règle dans `LeaseService.php:36-54`).
- Constat :
  - 28 FormRequests (hors `Admin/` et `Auth/`) étendent `FormRequest` directement. Elles échappent au refus par défaut de `BaseFormRequest`, et rendent `true` ou `user() !== null`.
  - `AuthorizationPrecedesValidationTest` n'en couvre aucune.
  - `PUT /api/properties/{id}` est l'endpoint le plus utilisé du lot (lu ; compte par grep).
- Piste : déléguer dans `authorize()` (`can('update', $this->route('property'))`), et une garde qui refuse `extends FormRequest` hors de `BaseFormRequest`.
- Mesure (2026-10-15, 8ebb0cc3, mesureur) : `grep -rlE 'extends FormRequest'` hors `Admin/` et `Auth/` → 28 FormRequests ; lu `UpdatePropertyRequest.php:31-36` (`authorize()` rend `user() !== null`) et `PropertyController.php:183-185` (`authorize('update')` dans le corps) ; test temporaire, retiré depuis, utilisateur sans lien avec le bien → `PUT /api/properties/{id}` avec un corps invalide rend 422 et nomme les champs `type` et `price`, avec un corps vide rend 403. Les autres endpoints cités n'ont pas été rejoués un à un. Classement : V2 et V8, déléguer l'autorisation dans 28 `authorize()` peut refuser un appelant légitime si une délégation diffère de la règle du contrôleur, et l'ensemble, garde comprise, dépasse un ticket.
- Mesure (2026-10-16, 71b58ea4, implementeur) : `grep -rlE 'extends FormRequest'` hors `Admin/` et `Auth/` → toujours 28 ; `AuthorizationPrecedesValidationTest::test_property_update_denies_before_it_validates`, membre d'une autre agence, corps `{type: chateau, price: cher}` → 422 sur `type` et `price` avant correctif → `UpdatePropertyRequest` étend `BaseFormRequest` et délègue à `can('update')` : 403 en PUT et PATCH, 422 gardé pour le super-admin ; garde `FormRequestEtendBaseFormRequestTest` qui fige les 27 autres et expire ; ablation : 2 rouges (le 403, la garde qui nomme `UpdatePropertyRequest.php`), 23 verts une fois remis.

### Oracles d'existence entre agences
- Réf : P03.06
- Statut : fait · TCK-732
- Gravité : 🟠 risque faible
- Où : `Api/DocumentController.php:57-63`, `Api/Accounting/BankStatementLineController.php:42` (avec `ReconciliationManager.php:51-53`), `Requests/Api/StoreConversationRequest.php:103-108`
- Constat :
  - `POST /api/documents` rend 404 `document.owner_not_found` avant l'autorisation : il dit si un bail, un client ou un bien d'une autre agence existe.
  - Le rapprochement bancaire distingue 404 et 403.
  - La conversation distingue « introuvable » et « non joignable » (lu).
- Piste : autoriser avant de résoudre, ou rendre le même code dans les deux cas.
- Mesure (2026-10-15, 92e465d6, mesureur) : relu `DocumentController::store()` (`find()` puis `abort_code_if(null, 404, 'document.owner_not_found')` avant `authorize('attachTo')`, lignes 51-62), `BankStatementLineController::match()` (`findOrFail` du paiement → 404, puis `ReconciliationManager::confirmMatch()` → 403 `reconciliation.cross_agency`, `:51-53`) et `StoreConversationRequest` (`participants_unavailable` quand l'identifiant n'existe pas, puis `guardReach()` pour un utilisateur existant non joignable, lignes 108-130). Les trois distinctions tiennent ; lignes du rapprochement à `:42` comme écrit. Classement : V2, la piste change le code rendu à des appelants légitimes et le choix entre « autoriser d'abord » et « même code partout » n'est écrit nulle part.
- Mesure (2026-10-16, 60b4751b, implementeur) : `DocumentTest`, compte sans lien avec un bien existant → 403 avant correctif, et 404 `document.owner_not_found` pour un identifiant inexistant → `store()` rend 404 `document.owner_not_found` quand `attachTo` refuse ; `test_forbidden_owner_and_missing_owner_get_the_same_response` exige statut et corps identiques ; ablation : 2 rouges, 11 verts une fois remis. Rapprochement et conversation laissés tels quels, selon la décision.

### Le proxy `admin-users` ne relaie pas le profil actif
- Réf : P03.07
- Statut : validé — le proxy admin-users transmet le profil actif
- Gravité : 🟢 à vérifier
- Où : `takussan-web/src/app/api/admin-users/[[...path]]/route.ts:17-40`
- Constat : seul `Authorization` est relayé, sans `X-Active-Profile-Hint` ni cookie de profil. Pour un admin présent dans plusieurs agences, `UserAdminController:16-22` rendrait 403, et la console d'équipe serait inutilisable pour lui (lu, non mesuré).
- Piste : relayer l'indice de profil comme les fetchers serveur (`RequestOptions` de `src/lib/api.ts`).
- Mesure (2026-10-15, 6a221e0f, mesureur) : lu `admin-users/[[...path]]/route.ts:26-29` (seuls `Accept`, `Authorization` et `Content-Type` relayés), `lib/queries/admin-users.ts:64` (le navigateur passe par ce relais), `ResolveActiveProfile.php:101-140` (sans indice ni cookie, auto-bascule seulement si une seule agence) et `UserAdminController.php:16-22` ; test temporaire, retiré depuis, admin de deux agences sur `GET /api/users` → **403** sans indice, **200** avec `X-Active-Profile-Hint: agency_admin:<id>` ; admin d'une seule agence → 200. Le constat « à vérifier » est vérifié côté API. Classement : V2, le correctif change le profil, donc l'agence, sous lequel l'API juge chaque appel de la console d'équipe.

## Angle 4 — Argent : montants, devises, arrondis, factures, paiements

*Exploré le 2026-10-15 vers 0 h 55, en lecture (et une mesure jsdom). Les quatre 🔴 ont été relus
contre le code par la session.*

### Échéancier trimestriel ou annuel : un seul mois de loyer facturé par période
- Réf : P04.01
- Statut : fait · TCK-667
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Model/LeaseService.php:203,220,245`
- Constat :
  - Chaque échéance vaut `monthly_rent`, et `period_end` est la fin du mois de l'échéance. `advancePeriod()`, lui, saute 3 ou 12 mois.
  - Un bail trimestriel de 12 mois produit donc 4 échéances d'un mois chacune : 4 mois de loyer facturés au lieu de 12.
  - Le formulaire propose « Trimestriel » avec un champ « Loyer mensuel » (`CreateLeaseForm.tsx:238`).
  - `GenerateLeasePaymentScheduleTest` ne teste aucune fréquence (lu).
- Piste : multiplier par le nombre de mois de la période, couvrir toute la période, et un test par fréquence.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu `LeaseService.php` `scheduleUnderLock()` (`$amount = monthly_rent`, l. 203 ; `period_start`/`period_end` = début et fin du mois de l'échéance, l. 224-225) et `advancePeriod()` (l. 241-247 : +1, +3 ou +12 mois), `CreateLeaseForm.tsx:43` (`quarterly`, `yearly` proposés) ; `git log -S` et `grep` des tickets → aucun correctif ni ticket ouvert ; seul `LeaseContractTermsTest.php` cite `quarterly`, aucun test d'échéancier par fréquence → le constat tient tel qu'écrit, lignes inchangées. Classement : V1, le correctif réécrit le montant et la période de chaque échéance de loyer.
- Mesure (2026-10-16, 53425e4e, implementeur) : avant correctif, `GenerateLeasePaymentScheduleTest` sur un bail du 2026-01-01 au 2026-12-31 à 100 000 → trimestriel : 4 échéances de 100 000 couvrant janvier, avril, juillet, octobre seuls ; annuel : 1 échéance de 100 000 sur janvier → `LeaseService::scheduleUnderLock()` facture loyer × mois de la période (1, 3, 12), la période couvrant tous ses mois et la dernière s'arrêtant au mois de fin du bail ; 4 tests (un par fréquence, plus la dernière période d'un bail de 10 mois), ablation : correctif retiré → 3 rouges (le mensuel reste vert), borne de fin seule retirée → 1 rouge, remis → 9 verts.

### La révision de loyer n'atteint jamais les échéances déjà générées
- Réf : P04.02
- Statut : fait · TCK-668
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Lease/RentReviewService.php:109`, `takussan-api/app/Services/Model/LeaseService.php:152,198`
- Constat :
  - `review()` ne modifie que `leases.monthly_rent`. L'échéancier entier est généré à l'activation, et refuse de se régénérer (`lease.schedule_exists`).
  - Aucun observateur ni écouteur ne réagit au loyer : la session n'en trouve aucun.
  - Le locataire est notifié du nouveau loyer, puis facturé à l'ancien jusqu'à la fin du bail. Le docblock (`:19-22`) dit le contraire.
  - Aucun test ne lit les `LeasePayment` après une révision (lu).
- Piste : à `effective_date`, réécrire le montant des échéances `pending` à venir, sous verrou du bail, et un test.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu `RentReviewService.php:109` (seul `forceFill(['monthly_rent' => …])`), `LeaseService.php:198` (`lease.schedule_exists`), `grep -rn effective_date app` → aucun lecteur hors `RentReviewService` et l'historique (`LeaseRentController.php:68`), aucun observateur ni écouteur sur `monthly_rent` ; `RentReviewServiceTest.php` ne lit aucun `LeasePayment` → le défaut tient. Précision : le docblock (l. 18-22) dit que le générateur lira `effective_date` comme borne, et que les échéances déjà émises ne sont PAS modifiées ; il décrit donc un générateur qui n'existe pas plutôt que « le contraire ». Classement : V1, la piste réécrit le montant d'échéances existantes, et le docblock en fait un choix (quelles échéances amender).
- Mesure (2026-10-16, 5fa8aefe, implementeur) : reproduit par `RentReviewServiceTest` — révision 200 000 → 220 000, échéances `pending` du mois d'effet et du suivant restées à 200 000, échéance trimestrielle à 600 000 inchangée (2 rouges) → `rewriteUpcomingRentPayments()` sous le verrou du bail : `rent` `pending` dont `period_start >= effective_date`, × mois de la période, jamais `paid`/`partially_paid`/checkout ouvert/acompte ; 11 verts ; ablations (appel, garde checkout, filtres statut et type, multiplication par les mois) chacune rouge.

### L'annulation d'une résiliation anticipée annule une facture émise sans avoir
- Réf : P04.03
- Statut : fait · TCK-669
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Lease/EarlyTerminationService.php:162-163` (création en `:337`)
- Constat :
  - La facture de pénalité naît émise (`Sent`) et numérotée.
  - `cancel()` la passe en `Cancelled` par `forceFill`, sans `InvoiceService::cancel()`, donc sans avoir. ADR-0039 §7 exige un avoir pour annuler une facture émise.
  - Un numéro `FA-…` disparaît ainsi sans contrepassation. `EarlyTerminationServiceTest.php:151` ne vérifie pas l'avoir (lu).
- Piste : passer par `InvoiceService::cancel()`, et asserter `credited_invoice_id`.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu `EarlyTerminationService.php:162-164` (`$invoice->forceFill(['status' => Cancelled])->save()`), `:338-345` (facture créée `Sent` puis numérotée par `InvoiceNumberAllocator`) et `InvoiceService::cancel()` (l. 119-140 : avoir créé pour une facture `Sent`/`Overdue`, ADR-0039 §7) ; `EarlyTerminationServiceTest.php` ne cite ni `Cancelled` ni avoir → le constat tient, lignes inchangées. Classement : V1, le comportement attendu est écrit (ADR-0039 §7, A1), mais le correctif écrit une facture d'avoir, ce que V1 réserve au porteur.
- Mesure (2026-10-16, 5fa8aefe, implementeur) : avant correctif, `InvoiceNumberingTest::test_cancelling_an_early_termination_credits_its_issued_penalty` rouge (pénalité `FA-2026-00001` passée `cancelled`, aucun avoir : `ModelNotFoundException` sur `credited_invoice_id`) → `EarlyTerminationService::cancel()` délègue à `InvoiceService::cancel()` ; avoir `AV-2026-00001` du même montant créé ; une pénalité déjà annulée est laissée telle quelle (`test_cancel_tolerates_a_penalty_already_cancelled`) ; ablation de chacune des deux parties : rouge, puis vert remis.

### Restitution de caution : le champ refuse tout montant rond
- Réf : P04.04
- Statut : fait · TCK-670
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/leases/DepositRefundModal.tsx:171-172`
- Constat :
  - `<input type="number" min={0.01} step={1000}>` dans un `<form>` sans `noValidate`. La base du pas est le `min`, si bien que seuls 0,01 + k×1000 sont valides.
  - Mesuré (jsdom) : `150000` lève un `stepMismatch`. Le navigateur bloque donc le montant pré-rempli, et un montant en `,01` dépasse le restant, que le serveur refuse (`DepositRefundService.php:77`).
  - Une restitution intégrale d'une caution ronde est impossible depuis l'écran.
  - Même défaut, en moins grave, dans `CreateLeaseForm.tsx:233,243,253` et `LeaseRenewalDialog.tsx:230,251` (`step={1000}`) : un loyer de 152 500 est refusé (mesuré).
  - La modale est simulée dans son seul test.
- Piste : `step="any"` ou `step={1}` avec `min={1}`, ou passer par `FormAmountInput`.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu `DepositRefundModal.tsx:158-172` (`<form>` sans `noValidate`, `min={0.01} step={1000}`), `CreateLeaseForm.tsx:233,243,253` et `LeaseRenewalDialog.tsx:230,251` (`step={1000}`) ; mesuré sous jsdom (`node -e`, `validity.stepMismatch`) → `min=0.01 step=1000` : 150000 → `true`, 150000.01 → `false` ; `min=0 step=1000` : 152500 → `true`, 150000 → `false`. Le constat tient tel qu'écrit. Classement : V1, le correctif change les montants qu'un écran de restitution, de bail et de renouvellement peut envoyer, et le choix du pas (`any`, `1`, `FormAmountInput`) en est un ; dans le doute, à valider.
- Mesure (2026-10-16, 8ff39d7a, implementeur) : reproduit avant correctif par `leases/__tests__/montants-hors-pas.test.tsx` → le montant pré-rempli 150 000 de `DepositRefundModal` est en `stepMismatch` (`min=0.01 step=1000`) et le clic sur « Confirmer le remboursement » n'appelle pas l'API ; un loyer de 152 500 en `stepMismatch` dans `CreateLeaseForm` et `LeaseRenewalDialog` (cas ajouté à `LeaseRenewalDialog.test.tsx`) → `min={1} step="any"` sur les montants que zod veut positifs, `step="any"` avec `min={0}` gardé sur les cautions (zod `nonnegative`) ; 6 rouges avant, 9 verts après ; ablation (six composants remis) → les mêmes 6 rouges, correctif remis → verts. Traité avec P08.03.

### Clôture plateforme : périmètre et devise du reversement
- Réf : P04.05
- Statut : fait · TCK-733
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Billing/PlatformPayoutService.php:234-276`
- Constat :
  - Tous les paiements `paid` de l'agence entrent dans le calcul, y compris les espèces et ceux encaissés par une intégration propre à l'agence. Or TCK-223 décrit un reversement de ce que la plateforme a encaissé.
  - La devise retenue est celle de la première ligne, sans contrôle de mélange.
  - La pénalité encaissée avec le loyer est absente du brut (lu ; intention à vérifier).
- Piste : borner aux paiements soldés par une intégration globale, inclure la pénalité, et refuser les devises mélangées comme le fait `PayoutCalculator`.
- Mesure (2026-10-15, 92e465d6, mesureur) : relu `PlatformPayoutService::closeForAgency()` (lignes 220-290) : `BookingPayment` et `LeasePayment` `paid` de l'agence sans filtre de canal ni d'intégration (seul `deposit_refund` est exclu), `currency` prise sur `$eligible->first()` sans contrôle de mélange ; `amountDue()` (`PaymentGatewayService.php:1238-1258`) ajoute au loyer la pénalité restant due quand l'agence l'encaisse en ligne, alors que la clôture ne somme que `amount` : la pénalité encaissée avec le loyer n'entre pas au brut (lu ; intention de TCK-223 non tranchée). Classement : V1, montant et devise d'un reversement.
- Mesure (2026-10-16, 1811897f, implementeur) : reproduit avant correctif par `PlatformPayoutScopeTest` → une réservation en espèces et un loyer soldé par l'intégration de l'agence entrent au brut, un loyer réglé en espèces pendant un checkout plateforme ouvert est reversé, la pénalité de 10 000 soldée avec un loyer de 200 000 manque au brut (200 000 au lieu de 210 000), et XOF et EUR mêlés donnent un reversement (201) : 6 tests sur 7 rouges sur le service de pre-dev. Correctif : seuls les paiements dont le checkout de `settled_by` a été initié par une intégration à `agency_id` nul, pénalité de ce checkout au brut et à la commission, 422 `payout.mixed_currencies` pour une agence et exclusion `mixed_currencies` en clôture globale ; 7 verts. Ablation (service remis à l'état de pre-dev) → les 6 mêmes rouges, et ablations partielles (détail, repli sur `transaction_id`) → un rouge chacune ; correctif remis → verts.

### La garde de sous-paiement ne s'applique pas à Lemon Squeezy, ni peut-être à Orange Money
- Réf : P04.06
- Statut : fait · TCK-734 — reste : Orange Money, sur un exemple réel de notification
- Gravité : 🟠 risque ou dette
- Où : `PaymentGatewayService.php:606-609`, `LemonSqueezyDriver.php:159-172`, `OrangeMoneyDriver.php:65,148-149` (sous `takussan-api/app/Services/Payments/`)
- Constat :
  - La garde sort quand `metadata.amount` est absent, et `extractFees()` de Lemon Squeezy n'en fournit jamais.
  - Orange Money envoie `OUV`, la devise du bac à sable, pour du XOF. Le format des notifications est à vérifier.
- Piste : chaque pilote fournit le montant (en unité majeure) et la devise ; la devise Orange Money passe en configuration par environnement.
- Mesure (2026-10-15, 92e465d6, mesureur) : relu `assertReportedAmountCoversPayment()` (`PaymentGatewayService.php:605-615`, sort quand `metadata.amount` ou `currency` manque), `LemonSqueezyDriver::extractFees()` (rend `gross_amount`, `fees_amount`, `net_amount`, `currency`, jamais `amount`) et `OrangeMoneyDriver.php:65` (`XOF` → `OUV`), `:148-149` (`amount`/`currency` repris du payload). La partie Lemon Squeezy tient ; la forme réelle des notifications Orange Money (devise renvoyée `OUV` ou `XOF`) n'est pas re-mesurée, faute d'exemple dans le dépôt. Classement : V1, garde d'un paiement.
- Mesure (2026-10-16, acc699ce, implementeur) : reproduit avant correctif par `PaymentDriverReportsAmountTest` (neuf) → l'événement « payé » de Lemon Squeezy ne porte aucun `amount` (Wave le porte), et par `LemonSqueezyEventListenerTest` → un ordre de 1 000 centimes solde une échéance de 19,99 USD → `extractFees()` rend `amount = total / 100` dans `currency` ; le test exige `amount` et `currency` de tout pilote de `DRIVERS`, Orange Money excepté et nommé ; deux fixtures à `19_99` (1 999 USD) ramenées à `19.99` ; ablation (ligne retirée) → 2 rouges, remise → 6 verts.

### Lemon Squeezy ignore la devise du payable
- Réf : P04.07
- Statut : fait · TCK-735
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Payments/Drivers/LemonSqueezyDriver.php:47-55,164`
- Constat : `$currency` n'est pas lu, et `custom_price` est exprimé dans la devise de la boutique. `extractFees()` mélange `total_usd` et des taxes en devise de boutique (lu ; comportement de l'API à vérifier).
- Piste : refuser quand la devise du payable diffère de celle de la boutique.
- Mesure (2026-10-15, 92e465d6, mesureur) : relu `LemonSqueezyDriver::initiate()` (lignes 47-60 : `$currency` jamais lu, `custom_price => $amountCents`) et `extractFees()` (`gross` = `total` ou `total_usd`, `net` = `total_usd` ou `total` moins `tax` et `discount_total`, devise par défaut `USD`). Le code tient tel que décrit ; le comportement de l'API Lemon Squeezy n'est pas re-mesuré (hors poste). Classement : V1, montant et devise d'un paiement.
- Mesure (2026-10-17, 0456a55f, implementeur) : reproduit avant correctif par `LemonSqueezyStoreCurrencyTest` → un payable en EUR sur une boutique en USD ouvre un checkout (`POST /v1/checkouts` envoyé, aucun refus), de même qu'une boutique sans devise lisible : 2 rouges sur 3. Correctif : `initiate()` lit `GET /v1/stores/{id}` et rend 422 `payment.currency_unsupported` sur une autre devise, 502 `payment.provider_unavailable` sur une devise illisible, avant tout checkout ; 3 verts. Ablation (comparaison retirée) → les 2 mêmes rouges ; remise → verts. La devise de boutique dans `attributes.currency` vient de la documentation de l'API, non re-mesurée (hors poste).

### Arrondis au centime sur du XOF
- Réf : P04.08
- Statut : fait · TCK-736
- Gravité : 🟠 risque ou dette
- Où : `InvoiceService.php:58`, `CommissionLedgerService.php:82`, `DepositRefundService.php:58`, `PlatformPayoutService.php:266` comparé à `:199`
- Constat :
  - Ces calculs arrondissent à 2 décimales, alors que `PayoutCalculator` et `amountDue()` arrondissent à l'unité de la devise. Une TVA de 18 % sur 100 001 donne 118 001,18 XOF facturés pour 118 001 encaissés.
  - La clôture (arrondi par ligne, en PHP) et le détail (`SUM` en SQL) peuvent différer (lu).
- Piste : une seule fonction d'arrondi par devise (`Currency::decimalPlacesOf`), appliquée partout.
- Mesure (2026-10-15, 92e465d6, mesureur) : relu `app/Services/Model/InvoiceService.php:58` (`round($subtotal * $taxRate / 100, 2)`, le constat ne donnait pas le dossier), `CommissionLedgerService.php:82` (`floor(round($base * $share, 6)) / 100`, au centime), `DepositRefundService.php:58,85,166` (`round(…, 2)`), `PlatformPayoutService` (arrondi par ligne à 2 décimales dans `closeForAgency()`, `SUM` SQL puis `round(…, 2)` dans `breakdown()`), contre `PaymentGatewayService::roundToCurrencyUnit()` (`Currency::decimalPlacesOf`) et `PayoutCalculator::round()`. Constat confirmé ; l'exemple 118 001,18 n'est pas re-calculé par exécution. Classement : V1, calcul de montants de facture, de commission et de reversement.
- Mesure (2026-10-17, 4bf83b81, implementeur) : avant correctif, les quatre tests neufs rendaient en XOF une TVA de 18 000,18 sur 100 001 à 18 %, une caution rendue de 300 000,40, une commission de 30 000,30 sur 100 001 à 30 % et une commission plateforme de 10 001,00 pour deux lignes de 5 000,50 → `Currency::roundAmount()` (arrondi à `decimalPlacesOf`, moitié vers le haut) dans les quatre services, plancher à l'unité de la devise pour la commission du grand livre, `ROUND` par ligne dans le détail du reversement ; ablation des services : 4 rouges, ablation du seul `ROUND` du détail : 1 rouge, correctif remis : 111 verts sur 13 classes.

### Devise forcée, et affichage sans décimales hors XOF
- Réf : P04.09
- Statut : fait · TCK-738
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Invoice/InvoiceService.php:75`, `takussan-web/src/lib/format/useFormatteurs.ts:131-133`, `RevenueChart.tsx:171`
- Constat :
  - Une facture sans devise explicite part en XOF, même pour une agence en EUR.
  - `fmt.montant` impose 0 décimale à toute devise : 12,50 € s'affiche « 13 € ».
  - `RevenueChart` formate toujours en XOF (lu).
- Piste : par défaut, la devise de l'agence, et les décimales de `CURRENCY_METADATA`.
- Mesure (2026-10-15, 8e30c8ef, mesureur) : relu `takussan-api/app/Services/Model/InvoiceService.php:75` (le fichier a quitté `Services/Invoice/`) : `'currency' => $data['currency'] ?? 'XOF'`, alors que `Agency` porte une colonne `currency` castée en `Currency` (`Agency.php:68`) ; `takussan-web/src/lib/format/useFormatteurs.ts:129-135` : `fmt.montant` pose `minimumFractionDigits: 0, maximumFractionDigits: 0` sauf option contraire ; `RevenueChart.tsx:171` : `fmt.montant(…, 'XOF', { maximumFractionDigits: 0 })` → les trois points du constat tiennent, aucun commit ni ticket ne les traite (`grep maximumFractionDigits` dans les tickets : rien). Classement : V1 et V7, la devise par défaut d'une facture est une écriture de montant, et l'affichage des décimales hors XOF change ce que l'utilisateur voit.
- Mesure (2026-10-17, eb6aee73, implementeur) : avant correctif, une facture émise sans devise par un agent d'une agence en EUR rendait `data.currency` = `XOF` (`InvoiceTest`), et `fmt.montant(12.5, 'EUR')` rendait `13 €` → repli sur `agencies.currency` de l'émetteur dans `InvoiceService::create()`, décimales de `CURRENCY_METADATA` dans `fmt.montant` et `PayoutTable`, et `formatCurrency` qui borne le défaut à l'option explicite (sans quoi `{ maximumFractionDigits: 0 }` sur de l'EUR levait une `RangeError`) ; ablation : 1 rouge par correctif (API, `fmt.montant`, bornage), remis : 21 verts sur `InvoiceTest`, 397 sur les 31 fichiers front qui citent `montant`. `RevenueChart` reste en XOF : il somme `plans.monthly_price_xof`, une devise de plateforme.

### Restitution d'une caution jamais encaissée
- Réf : P04.10
- Statut : retenu · à valider — V1 : montant d'une restitution de caution ; porteur (2026-10-15) : plus tard, après P13.01
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Lease/DepositRefundService.php:55,74`
- Constat : le restituable part de `leases.deposit_amount`, jamais rapproché d'une `LeasePayment` de type `deposit` payée (lu).
- Piste : borner la restitution à ce qui a été encaissé.
- Mesure (2026-10-15, 8e30c8ef, mesureur) : relu `takussan-api/app/Services/Lease/DepositRefundService.php:55-80` et `Lease::getDepositRemainingAttribute()` (`Lease.php:383-389`) : le restituable vaut `deposit_amount − deposit_refunded_amount − liveDepositRetention()`, et aucune ligne ne lit une `LeasePayment` de type `deposit` (`LeasePaymentType::Deposit`) payée ; les trois derniers commits du fichier (TCK-594) portent sur la retenue et les quatre yeux, pas sur l'encaissement → constat confirmé. Classement : V1, borner une restitution est un calcul de montant, et le cas d'une caution remise hors plateforme demande un choix.

### Référence fournisseur sans index ; paiement partiel inachevé
- Réf : P04.11
- Statut : validé — l'index sur la référence fournisseur ; reste : terminer ou retirer le paiement partiel
- Gravité : 🟢 amélioration
- Où : `create_lease_payments_table.php:27`, `create_booking_payments_table.php:26`, `takussan-api/app/Models/Concerns/HasPaymentAttributes.php:219-228`
- Constat :
  - Chaque webhook cherche `transaction_id` sans index, et parcourt le JSON de l'historique.
  - L'idempotence tient malgré tout, grâce au verrou de ligne et à `gateway_events`.
  - Rien n'écrit `metadata.paid_amount` : le statut `partially_paid` n'a pas de montant (lu).
- Piste : un index sur `transaction_id`, et terminer ou retirer le paiement partiel.
- Mesure (2026-10-15, 6a221e0f, mesureur) : lu les migrations `create_lease_payments_table.php:27` et `create_booking_payments_table.php:26` (`transaction_id` sans index), `PaymentGatewayService.php:716-729` (`where('transaction_id', …)` puis `whereJsonContains('metadata->gateway->transactions', …)`) et `HasPaymentAttributes.php:205-235` ; `grep paid_amount app/` → lu et validé, jamais écrit ; tinker en lecture, `pg_indexes` → aucun index sur `transaction_id` pour les deux tables (seul `invoices` en a un). Les deux faits tiennent. Classement : V1, terminer ou retirer le paiement partiel touche l'écriture d'un montant reçu ; l'index seul relèverait d'A2.

**Ce qui tient** (lu) :
- la conversion ×100 est faite une seule fois, puis re-divisée par Wave et Orange Money (`PaymentGatewayService.php:215`, `WaveDriver.php:48`, `OrangeMoneyDriver.php:55`) ;
- la numérotation des factures est sérialisée sur la ligne de l'agence, avec un index unique en dernier recours (`InvoiceNumberAllocator.php:36-58`) ;
- les reversements verrouillent leurs pièces (`PayoutService.php:414-473`) ;
- un webhook rejoué n'est pas recompté.

## Angle 5 — Jobs planifiés et files

*Exploré le 2026-10-15 vers 1 h 05, par lecture, avec une mesure sur `scheduled_task_runs` en dev. Aucun
défaut avéré : ce sont des risques, dont trois coûtent cher le jour où ils se produisent.*

### Un verrou `withoutOverlapping` reste orphelin 24 h si le scheduler est tué au redéploiement
- Réf : P05.01
- Statut : fait · TCK-737 — reste : le stop_grace_period dans deploy/, par le porteur, avec P05.06
- Gravité : 🟠 risque ou dette
- Où : `deploy/takussan/compose.api.yml:65-68`, `takussan-api/routes/console.php:106,113,115,151,174`
- Constat :
  - Le service `scheduler` n'a pas de `stop_grace_period`, donc Docker attend 10 s.
  - PID 1 est `schedule:work`, et le sous-processus `schedule:run` ne reçoit jamais le signal : son verrou n'est pas rendu.
  - Le verrou vit dans Redis (`appendonly`) pendant `expiresAt = 1440` minutes.
  - `impersonation:close-expired`, `health:probe` et `boosts:tick` durent de 12 à 25 s en dev (mesuré). Un déploiement qui tombe pendant l'une d'elles la saute donc 24 h (lu ; non observé en préproduction).
- Piste : `->withoutOverlapping(N)` avec N proche de la période, et `stop_grace_period: 120s`.
- Mesure (2026-10-15, 8e30c8ef, mesureur) : relu `deploy/takussan/compose.api.yml:64-67` (service `scheduler` sans `stop_grace_period`), `takussan-api/docker/entrypoint.sh` (`exec "$@"` : `schedule:work` est PID 1), `routes/console.php:106,113,115,151,174` (lignes inchangées), et le framework v13.25.0 : `ScheduleWorkCommand::listenForSignals()` piège SIGTERM et attend la fin des `schedule:run` en cours sans leur relayer le signal, `Event::ensureMutexIsReleasedOnSignal()` ne libère le verrou que si le processus enfant reçoit lui-même le signal, `expiresAt = 1440` ; `CACHE_STORE=redis` en préproduction (`prod-drivers.json`, mesuré le 2026-09-14) → le constat tient, mais seulement pour une exécution qui dépasse les 10 s de grâce : une exécution plus courte finit et rend son verrou, ce que le constat ne disait pas ; le saut de 24 h n'est pas observé. Classement : V5, la moitié du correctif est un réglage de `deploy/takussan/compose.api.yml`.
- Mesure (2026-10-17, 4bf83b81, implementeur) : avant correctif, `ScheduleOverlapLockTest` (neuf, qui parcourt les tâches planifiées et compare `expiresAt` à la période déduite de l'expression cron) relevait 19 tâches infra-quotidiennes, de période 1 à 60 min, sous un verrou de 1 440 min → `withoutOverlapping(N)` avec N égal à la période (1, 5, 15, 60) dans `routes/console.php`, `deploy/` non touché ; ablation : 1 rouge sur les 19 tâches, correctif remis : vert, et 29 verts sur les 7 classes qui lisent le planning.

### Les jobs qui ciblent un jour ou une heure exacts ne rattrapent rien
- Réf : P05.02
- Statut : fait · TCK-739
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Invoice/OverdueReminderService.php:131,256-268`, `takussan-api/app/Jobs/SendLeasePaymentReminders.php:57,68,123`, `takussan-api/app/Jobs/Notifications/SendNotificationDigestJob.php:64`, `takussan-api/app/Jobs/SendPropertyVisitReminders.php`, `takussan-api/routes/console.php:159`
- Constat :
  - Le scheduler ne rattrape pas une exécution manquée. Une panne à la minute prévue perd définitivement :
    - la relance de facture J+3 (`due_date = today − offset`) ;
    - les relances de loyer ;
    - le résumé de notifications du jour ;
    - le rappel de visite, après 10 min d'arrêt ;
    - l'avis du relevé de gérance mensuel.
  - `ApplyLateFeesJob` (`<= today`) et `KycExpiryService` rattrapent, eux.
  - Aucun test ne couvre un jour manqué (lu).
- Piste : `due_date <= today − offset` avec le marqueur par jalon déjà en place, et le résumé sur `digested_at IS NULL` sans borne de 24 h.
- Mesure (2026-10-15, 8e30c8ef, mesureur) : relu `OverdueReminderService.php:127-131` (`in_array($daysOverdue, $offsets, true)`, correspondance exacte), `SendLeasePaymentReminders.php:57,68,123` (`whereDate('due_date', …)` exact), `SendNotificationDigestJob.php:52-66` (heure locale exactement égale à `digest_send_at`, aucune colonne `digested_at` lue), `SendPropertyVisitReminders.php:60-66` (fenêtre de ±5 min), `routes/console.php:159` (`monthlyOn(1, '08:00')`) → aucun ne rattrape une exécution manquée ; mais `TCK-092` (done), l. 170-175, écrit que « la J+3 manquée n'est pas rattrapée (hors scope V1 — comportement documenté) » : pour les factures, c'est un choix posé, pas un oubli. Classement : V7 et V8, rattraper change quelles relances partent, contre un choix écrit, sur cinq jobs distincts.
- Mesure (2026-10-17, ec405f7a, implementeur) : avant correctif, `OverdueReminderService::processOne()` (`in_array($daysOverdue, $offsets)`) et `SendLeasePaymentReminders::claim()` (`whereDate('due_date', $dueDate)`) ne relançaient qu'au jour exact : 4 tests neufs rouges (facture à J+4 et J+8, loyer J+1 rattrapé à J+2, J-3 rattrapé à J-2) → fenêtre de 3 jours par jalon, et garde par jalon sur `last_reminder_sent_at` pour les factures (le compteur seul relançait J+7 rattrapé deux jours de suite) ; ablation : 4 rouges, garde par jalon seule : 1 rouge ; correctif remis : 39 verts sur 4 classes. Digest, visites et relevé de gérance non touchés, selon la décision.

### `SendLeasePaymentReminders` réserve tout un jalon avant d'envoyer
- Réf : P05.03
- Statut : fait · TCK-740
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Jobs/SendLeasePaymentReminders.php:57-105,115-147`
- Constat :
  - `claim()` marque toutes les échéances du jalon, puis la boucle envoie.
  - Si une exception survient au milieu, ou si le job est coupé à 60 s faute de `$timeout`, le reste est déjà marqué : le rejeu ne le renvoie jamais.
  - Aucun test ne simule un échec en cours de boucle (lu).
- Piste : réserver et envoyer échéance par échéance, ou rendre la réservation en cas d'échec, comme `SendSavedSearchAlerts`.
- Mesure (2026-10-15, 8e30c8ef, mesureur) : relu `takussan-api/app/Jobs/SendLeasePaymentReminders.php:55-147` : `claim()` pose `reminder_<jalon>_sent_at` sur toutes les échéances du jalon (une transaction par échéance) avant toute boucle d'envoi, sans `$timeout` ni `catch` ; `NotificationService::send()` (`Services/Model/NotificationService.php:75-117`) ne capture que l'événement de diffusion, l'écriture et `notify()` peuvent lever ; `tests/Feature/Jobs/SendLeasePaymentRemindersTest.php` : 12 tests, aucun n'échoue en cours de boucle → constat confirmé. Classement : V7, réserver par échéance ou rendre la réservation fait passer la relance d'« au plus une fois » à « au moins une fois », un choix que voit le locataire.
- Mesure (2026-10-17, ec405f7a, implementeur) : avant correctif, `test_tck740_un_envoi_qui_leve_ne_prive_pas_les_echeances_suivantes` (deux échéances à J+1, `NotificationService::send()` qui lève au premier envoi, puis rejeu) → 0 relance au rejeu : la seconde échéance restait marquée sans envoi → `claim()` réserve sous verrou et rend les échéances une à une ; ablation : 1 rouge, correctif remis : 16 verts. Aucun `$timeout` ajouté.

### `account:execute-deletions` : une suppression en échec bloque toutes les suivantes
- Réf : P05.04
- Statut : fait · TCK-741
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Console/Commands/ExecuteScheduledAccountDeletions.php:44-47`, `takussan-api/app/Services/Account/AccountDeletionService.php:406-413`
- Constat :
  - Il n'y a ni `catch` par demande ni `orderBy` : une `anonymize()` qui lève bloque, toutes les heures, toutes les suppressions RGPD échues après elle.
  - La seule trace est une ligne `failed` dans `scheduled_task_runs` (lu).
- Piste : un `try/catch` par demande, hors transaction, avec `report()`, et `orderBy('scheduled_for')`.
- Mesure (2026-10-15, 8e30c8ef, mesureur) : relu `takussan-api/app/Console/Commands/ExecuteScheduledAccountDeletions.php:43-50` (boucle sans `try/catch`) et `AccountDeletionService::dueForExecution()` (`AccountDeletionService.php:406-414`, sans `orderBy`) → une exception d'`executeDeletion()` arrête la commande, et les demandes suivantes, dans l'ordre que rend PostgreSQL, attendent l'heure suivante ; aucun ticket ouvert ne le traite (`TCK-080`, `TCK-600` : done). Classement : V3, le correctif touche à l'exécution des suppressions de données personnelles.
- Mesure (2026-10-17, ec405f7a, implementeur) : avant correctif, `test_tck741_une_suppression_en_echec_ne_bloque_pas_les_suivantes` (deux demandes échues, `executeDeletion()` qui lève sur la plus ancienne) → l'exception remontait de la commande et la seconde demande restait non exécutée ; `test_tck741_les_demandes_echues_sont_rendues_par_date_prevue` → ordre de l'identifiant, pas de `scheduled_for` → `try/catch` par demande avec `Log::error` + `SafeExceptionContext::of()` (le message de l'exception absent du journal, vérifié), sortie 1 si une demande a échoué, `orderBy('scheduled_for')` ; ablation : 2 rouges, correctif remis : 8 verts sur 2 classes.

### Les notifications ne partent après le commit que grâce au driver `database`
- Réf : P05.05
- Statut : fait · TCK-746
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/queue.php:44,64,73` (`after_commit => false`), par exemple `LateFeeCalculator.php:162` et `BookingExpirationService.php:204-206`
- Constat :
  - Des notifications et des écouteurs `ShouldQueue` sont dispatchés dans des transactions. Avec la file `database`, la ligne `jobs` est annulée avec la transaction, donc le comportement est juste aujourd'hui.
  - Passer `QUEUE_CONNECTION` à `redis` (évoqué en `docs/configuration.md:136`) enverrait des notifications pour des écritures annulées. Rien ne garde cette propriété (lu ; aucun test trouvé).
- Piste : `after_commit => true` sur toutes les connexions de file, ou une garde.
- Mesure (2026-10-15, 8e30c8ef, mesureur) : relu `takussan-api/config/queue.php:44,53,64,73` : `after_commit => false` sur les quatre connexions ; la file `database` prend `DB_QUEUE_CONNECTION`, vide, donc la connexion par défaut et sa transaction ; `LateFeeCalculator.php:162` dispatche `LeasePaymentLateFeeApplied` dans `DB::transaction` ; `afterCommit` n'apparaît qu'en cinq dispatchs ponctuels (`LeaseService`, `AgencyObserver`, …) ; `docs/configuration.md:136` : `QUEUE_CONNECTION=database # ou redis / sqs` ; aucun test ne garde la propriété → constat confirmé. Classement : V6, passer `after_commit` à `true` partout change le moment de tous les dispatchs, une décision transverse.
- Mesure (2026-10-17, b8b556ed, implementeur) : avant correctif, `QueueAfterCommitTest` (file `database`) lit une ligne dans `jobs` **dans** la transaction qui a mis le job en file, et la propriété `after_commit` vaut `false` sur `database`, `beanstalkd`, `sqs`, `redis` → `after_commit => true` sur ces quatre connexions ; aucune ligne avant le commit, une après, rien pour une transaction annulée, dispatch immédiat hors transaction ; ablation (`false` remis) : 2 rouges sur 4, correctif remis : 4 verts, et les 8 classes qui basculent la file sur `database` restent vertes.

### `retry_after` à 90 s est sous le `$timeout` de quatre jobs ; un seul worker sert aussi la file urgente
- Réf : P05.06
- Statut : retenu · à valider — V5 : `DB_QUEUE_RETRY_AFTER` et workers de `deploy/` ; porteur (2026-10-15) : traité hors agents, avec le stop_grace_period de P05.01
- Gravité : 🟠 risque ou dette
- Où : `ExpirePendingBookingsJob.php:21,26` (300 s), `SyncPropertyCalendarFeedsJob.php:25` (540 s), `SendSavedSearchAlerts.php:83` et `SendFavoriteChangeAlerts.php:61` (1800 s) ; `docs/infra/hebergement.md:101` ; `deploy/takussan/compose.api.yml:55`
- Constat :
  - Un second consommateur, ou le worker relancé après un SIGKILL, réserve à nouveau un job en cours : rejeu ou échec parasite.
  - `worker` consomme `notifications-urgent,default` : une alerte de 30 min retarde d'autant une notification de maintenance urgente (lu ; durées en production à vérifier).
- Piste : `DB_QUEUE_RETRY_AFTER` au-dessus de 1800 s, ou une file dédiée aux balayages longs.
- Mesure (2026-10-15, 8e30c8ef, mesureur) : relu `config/queue.php:43` (`retry_after` = `DB_QUEUE_RETRY_AFTER`, 90 par défaut), les `$timeout` : `Jobs/Booking/ExpirePendingBookingsJob.php:26` (300, le fichier a quitté `Jobs/`), `SyncPropertyCalendarFeedsJob.php:25` (540), `SendSavedSearchAlerts.php:83` et `SendFavoriteChangeAlerts.php:61` (1800), aucun n'appelant `onQueue` ; `docs/infra/hebergement.md:101` : clé non posée en préproduction, 90 s relu dans le conteneur le 2026-09-22 ; `compose.api.yml:53` : `worker` sert `notifications-urgent,default` → constat confirmé ; les durées réelles en préproduction ne sont pas mesurées. Classement : V5, le correctif est une variable d'environnement ou un worker de plus.

### `scheduled_task_runs` ne mesure que la mise en file des `Schedule::job`
- Réf : P05.07
- Statut : retenu · à valider — V1 : le verrou d'exécution toucherait ApplyLateFeesJob, et le choix des jobs à borner ; porteur (2026-10-15) : plus tard, repris par P14.04
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Admin/ScheduledRunRecorder.php`, et `Schedule.php:217-226` du framework
- Constat :
  - Pour les 19 jobs planifiés, la ligne mesure le dispatch : de 0 à 80 ms, toujours `finished` (mesuré). Un échec dans le worker n'apparaît que dans `failed_jobs`.
  - Le verrou du scheduler ne protège pas l'exécution, et aucun job planifié n'est `ShouldBeUnique` (lu).
- Piste : l'écrire dans `takussan-api/CLAUDE.md` § Tâches planifiées, et le middleware `WithoutOverlapping` sur les balayages.
- Mesure (2026-10-15, e9f9289c, mesureur) : `routes/console.php` compte 19 `Schedule::job`, tous `ShouldQueue` (lu) ; `Schedule.php:218-226` du framework ne fait que `dispatchToQueue` dans la fermeture (lu) ; `SELECT task, status, count(*), max(duration_ms) FROM scheduled_task_runs` par tinker → toutes les lignes `App\Jobs\…` sont `finished`, de 0 à 600 ms, une seule à 17 650 ms (`SendPropertyVisitReminders`, dispatch sous charge) ; `grep ShouldBeUnique app` → rien, mais `WithoutOverlapping` existe désormais sur 2 jobs sur 19 (`SendSavedSearchAlerts:90`, `SendFavoriteChangeAlerts:68`, TCK-599) : le constat « aucun » est inexact pour ces deux-là ; `takussan-api/CLAUDE.md` § Tâches planifiées dit encore « presque tous `->withoutOverlapping()` » sans dire que ce verrou ne couvre que le dispatch → tient. Classement : V1, la partie documentaire relève d'A6 mais le middleware sur les balayages touche `ApplyLateFeesJob` (pénalités) et demande de choisir quels jobs borner.

### Petits écarts entre docblock et code
- Réf : P05.08
- Statut : validé — retirer le résumé quotidien jamais planifié, et corriger les deux autres écarts
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Jobs/SendRawNotificationEmailJob.php:38-48`, `takussan-api/app/Console/Commands/BoostsTick.php:12-15` avec `BoostLifecycle.php:204-218`, `takussan-api/app/Jobs/Crm/SendProspectMatchDigest.php`
- Constat :
  - `SendRawNotificationEmailJob` attrape `\Throwable` dès le premier essai : `$tries` et `backoff()` sont inutiles. Son seul appelant n'est appelé nulle part (code mort, à vérifier). `SendDailyNotificationDigest` n'est ni planifié ni dispatché.
  - `boosts:tick` annonce que « chaque transition » est réclamée, mais `pause()` et `resume()` écrivent le modèle chargé.
  - `SendProspectMatchDigest` envoie avant de poser sa clé d'idempotence, et journalise `$e->getMessage()`, ce que TCK-601 interdit (lu).
- Piste : supprimer le code mort, réclamer par `UPDATE … WHERE`, et passer par `SafeExceptionContext::of($e)`.
- Mesure (2026-10-16, ddb5f050, mesureur) : lu `SendRawNotificationEmailJob.php:42-48` (`catch (\Throwable)` → `report()`, sans relance : `$tries` et `backoff()` sont inopérants) ; `grep -rn` dans `app/` : le job n'est dispatché que par `NotificationService::sendEmail()` (l. 207), appelé par `notify()` (l. 173), elle-même appelée seulement par `notifyMany()` (l. 199) — aucun appelant de `notify`/`notifyMany` dans `app/`, seuls `tests/Support/ProseLitteraleScanner.php` et sa fixture les nomment, ce qui lève le « à vérifier » ; `SendDailyNotificationDigest` absent de `routes/console.php` et de tout dispatch (seul `NotificationDigestTest` l'instancie) ; `BoostLifecycle.php:204-218` : `pause()`/`resume()` font `forceFill()->save()` sur le modèle chargé, quand `end()` (l. 221) réclame par `UPDATE … WHERE status IN`, donc le docblock de `BoostsTick.php:11-16` reste inexact pour elles ; `SendProspectMatchDigest.php:93-99` appelle `send()` puis seulement `?->update(['data' => … 'digest_date' …])`, et l. 76-80 journalise `'message' => $e->getMessage()` alors que `App\Support\Logging\SafeExceptionContext` existe → les trois points tiennent. Classement : V7, retirer ou planifier le résumé quotidien est un choix de produit, et réclamer `pause()`/`resume()` touche la durée de boosts payés (V1).

### `onOneServer` et le fuseau horaire : pas de défaut aujourd'hui, un piège pour la production
- Réf : P05.09
- Statut : retenu · à valider — V5 : un `CACHE_PREFIX` par environnement déployé ; porteur (2026-10-16) : traité hors agents, réglage de déploiement ; consigné dans TCK-720
- Gravité : 🟢 amélioration
- Où : `deploy/takussan/compose.api.yml:65`, `takussan-api/config/app.php:70`, `deploy/server/compose.data.yml:31`
- Constat :
  - Il n'y a qu'un scheduler, et Dakar est en UTC+0 sans heure d'été.
  - La préproduction et la future production partageront `redis-takussan`. Avec le même `APP_NAME` et le même `REDIS_CACHE_DB`, leurs verrous de scheduler entreraient en collision : chaque environnement sauterait les tâches de l'autre (à vérifier quand la production existera).
- Piste : un `CACHE_PREFIX` par environnement.
- Mesure (2026-10-16, ddb5f050, mesureur) : `grep -rn onOneServer` dans `takussan-api/routes`, `app`, `bootstrap` → aucun usage (le titre nomme un appel absent du code ; les 46 occurrences sont des `withoutOverlapping`, dont le mutex passe aussi par le cache) ; lu `config/cache.php:115` (`CACHE_PREFIX` dérivé d'`APP_NAME`), `config/database.php:171,194` (`REDIS_PREFIX` dérivé d'`APP_NAME`, `REDIS_CACHE_DB` à `1` par défaut), `config/app.php:70` (`'timezone' => 'UTC'`), `deploy/takussan/compose.api.yml:65-68` (un seul service `scheduler`), `deploy/server/compose.data.yml:27-31` (un `redis-takussan` unique), `.env.example:118` (`# CACHE_PREFIX=` commenté) → le piège tient, sans défaut aujourd'hui puisque aucune production n'existe (CLAUDE.md). Classement : V5, le correctif est une variable d'environnement posée par déploiement.

## Angle 6 — Texte affiché par l'API et i18n fr/en/wo

*Exploré le 2026-10-15 vers 1 h 15, par lecture et par scripts node en lecture seule. Les six 🔴
ont été relus contre le code par la session ; le premier est mesuré (`route:list`).*

### La langue choisie dans l'interface n'atteint jamais le compte : e-mails, SMS et cloche partent en français
- Réf : P06.01
- Statut : fait · TCK-655
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/actions/locale.ts:41`, `takussan-api/routes/api/me.php:32`, `takussan-api/database/migrations/2026_04_15_210400_add_fields_to_users_table.php:28`
- Constat :
  - Le sélecteur de langue envoie `PATCH /api/users/me`, une route qui n'existe pas : `php artisan route:list --path=users/me` ne rend rien (mesuré par la session). L'échec est avalé par un `catch {}`.
  - Aucun FormRequest n'accepte `preferred_language`.
  - L'inscription ne l'écrit pas, et il vaut `'fr'` par défaut. Le provisionnement d'agence l'expose, et l'écrit peut-être (à vérifier).
  - Or `User::preferredLocale()` gouverne la langue des e-mails (`NotificationService.php:89`), des SMS, des résumés (`NotificationDigestMail.php:34`) et des titres stockés.
  - 26 classes de notification écrivent un `title` sans `code`, et le front les affiche tels quels (`texteNotification.ts`).
- Piste : accepter `preferred_language` sur `PATCH /api/me`, corriger le chemin dans `locale.ts`, et le renseigner à l'inscription depuis `Accept-Language`.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu `locale.ts:41-45` (`PATCH /api/users/me`, `catch {}` muet) ; `php artisan route:list --path=users/me` → « doesn't have any routes » ; `route:list --path=api/me` → `PATCH api/me` (`MeController@update`, `UpdateMeRequest`) ; `grep -rn preferred_language app/Http` → aucun FormRequest ne l'accepte. Le « à vérifier » du constat est levé : `AgencyProvisioningService.php:76` écrit `preferred_language` (`$adminPayload['language'] ?? 'fr'`). TCK-550 (done) a relevé le même écart en base et l'a laissé hors périmètre, sans ticket ouvert. Classement : A1, TCK-017 écrit le comportement attendu (sélecteur « persisté via `preferred_language` », l. 36 et 70) ; le correctif autonome se borne à accepter `preferred_language` (`in:fr,en,wo`) dans `UpdateMeRequest` et à viser `/api/me` dans `locale.ts`, et le remplissage à l'inscription depuis `Accept-Language` reste hors de ce classement (V7).
- Mesure (2026-10-15, 1bfcf09c, implementeur) : reproduit par `MeUpdateTest` avant correctif → `PATCH /api/me {preferred_language: "wo"}` rendait 200 et laissait `fr`, `de` rendait 200 ; `locale.persistance.test.ts` lisait `/api/users/me`. Correctif : règle `in:fr,en,wo` dans `UpdateMeRequest`, écriture dans `MeController::update()`, chemin `/api/me` dans `locale.ts` → 13/13 et 2/2 verts. Ablation : contrôleur retiré → AC1 rouge ; règle retirée → 2 rouges ; chemin front remis → rouge. Le remplissage à l'inscription reste hors périmètre (V7).

### Messages système des groupes : rôle toujours « member », aperçu figé en français
- Réf : P06.02
- Statut : fait · TCK-671
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Messaging/SystemMessageFactory.php:75,129-143`, `takussan-web/src/components/messages/SystemMessageBubble.tsx:36`, `takussan-api/app/Observers/MessageObserver.php:13`
- Constat :
  - L'API émet `metadata.role`, le front lit `meta.new_role ?? 'member'` : « X a changé le rôle de Y en member », pour tout changement, en jeton anglais brut, dans les trois langues.
  - `humanise()` écrit des `sprintf` en français dont l'observer tire `last_message_preview`, affiché tel quel par `ConversationList.tsx:194` (lu).
- Piste : aligner la clé, traduire le rôle, et dériver l'aperçu côté front depuis `metadata.event`.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu `SystemMessageFactory.php:68-75` (`metadata.role`), `:113` (`content` = `humanise()`), `:125-143` (`sprintf` français), `SystemMessageBubble.tsx:36` (`meta.new_role ?? 'member'`), `MessageObserver.php:13-17` (aperçu tiré de `content`) et `ConversationList.tsx:194` (affiché tel quel) → les deux défauts tiennent, lignes inchangées. Classement : V7, l'alignement de la clé `role` relèverait seul d'A1, mais dériver l'aperçu de `metadata.event` change le contrat de la liste des conversations et son rendu, un choix de produit.
- Mesure (2026-10-16, a29376a5, implementeur) : reproduit avant correctif → `SystemMessageBubble.test.tsx` rendait « Alice a changé le rôle de Bob en member » pour `role: admin` (2 rouges), `GET /api/conversations` ne rendait aucun `last_message` (`ConversationListSystemPreviewTest`, 2 rouges), et la liste sous `en` affichait l'aperçu français du serveur (`ConversationList.test.tsx`, 1 rouge). Correctif : `last_message` `{id, type, metadata}` (metadata d'un avis système seulement) dans la liste, hook `useTexteMessageSysteme` partagé par la bulle et la liste, lecture de `role` traduite par `messaging.group.info.roleAdmin`/`roleMember` → 2/2 API et 12/12 front verts. Ablation : `lastMessage` retiré → 2 rouges ; filtre système retiré → 1 rouge ; aperçu remis sur `last_message_preview` → 1 rouge ; `new_role` relu → 2 rouges ; rôle non traduit → 2 rouges.

### Les PDF (bail, état des lieux, quittances, facture) sont en français seulement, avec des dates dans une autre langue
- Réf : P06.03
- Statut : fait · TCK-672 — reste : les trois lignes d'ADR qui posent que les actes restent en français, par le porteur
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/resources/views/pdf/leases/contract.blade.php`, `inventories/report.blade.php`, `receipts/rent.blade.php:22`, `receipts/booking.blade.php`, `invoices/default.blade.php`, `layouts/base.blade.php:18`, `takussan-api/app/Services/Pdf/DocumentPdfService.php:143`
- Constat :
  - 5 gabarits portent 55 textes français et aucun `__()` : 0 dans `receipts/rent.blade.php` (relu). Seuls `statements/owner` et `maintenance/quote` sont traduits.
  - `<html lang="fr">` est en dur.
  - `translatedFormat('F Y')` suit la locale active : « Quittance de loyer — October 2026 » pour un anglophone.
  - Les titres `'État des lieux #'` (`InventoryController.php:209`) et `'Réservation #'` (`PaymentReceiptPdf.php:58`) sont en dur.
  - Aucun ADR ne dit que ces actes sont en français par choix (mesuré par script).
- Piste : décider par ADR (français juridique, ou acte bilingue), puis passer par `lang/*`.
- Mesure (2026-10-15, f74f3d21, mesureur) : compté `__(`/`@lang`/`trans(` par gabarit → 0 dans `leases/contract`, `inventories/report`, `receipts/rent`, `receipts/booking` et `invoices/default`, 17 dans `statements/owner`, 1 dans `maintenance/quote` ; lu `layouts/base.blade.php:18` (`<html lang="fr">`), `receipts/rent.blade.php:12` (`translatedFormat('F Y')` ; le constat citait la l. 22), `InventoryController.php:209` et `PaymentReceiptPdf.php:58` (titres en dur ; ce dernier vit sous `app/Services/Payments/`) → le constat tient. Classement : V6, la piste elle-même demande un ADR (français juridique ou acte bilingue), et la langue d'un bail signé est un choix de produit.
- Mesure (2026-10-16, a29376a5, implementeur) : `ActesPdfEnFrancaisTest` avant correctif, pilote PDF remplacé par un pilote qui garde le HTML → la quittance demandée en `Accept-Language: en` imprime « October 2026 », rendue sous `wo` « Oktoobar 2026 » (2 rouges) ; les titres passés par les appelants sont déjà des littéraux français → `DocumentPdfService::render()` rend les cinq gabarits d'actes sous `withLocale('fr')`, « Octobre 2026 » dans les deux cas et locale du lecteur rendue après ; ablation (forçage retiré) → 2 rouges, `fr` forcé partout → le relevé de gérance traduit rougit (« Management statement » perdu) ; remis → 3 verts.

### Des messages de validation en français en dur, servis tels quels en `en` et `wo`
- Réf : P06.04
- Statut : fait · TCK-656
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Requests/Api/StorePropertyMediaRequest.php:45-48`, `RejectPropertyRequest.php:24-26`, `InventorySignRequest.php:94-126`, `Agency/AssignAgencyRoleRequest.php:53`, `Agency/SyncCapabilitiesRequest.php:55`, `Permissions/StoreRoleDelegationRequest.php:80-86`
- Constat :
  - 14 messages sont des littéraux français.
  - `StoreRoleDelegationRequest` injecte des noms d'attribut français dans le gabarit de la langue active : « The utilisateur field is required. ».
  - Le front affiche `message` en le supposant localisé (`takussan-web/src/lib/api.ts:543`).
- Piste : des clés `lang/*/validation.php` ou des codes, et une garde qui refuse tout littéral dans `messages()`.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu les six FormRequests → 14 littéraux français : `StorePropertyMediaRequest.php:45-48` (4), `RejectPropertyRequest.php:24-26` (3, fichier sous `Http/Requests/`, pas `Api/`), `InventorySignRequest.php` (5 `bail($fail, '…')` vers l. 94-126), `AssignAgencyRoleRequest.php:53` (1), `SyncCapabilitiesRequest.php:55` (1) ; `StoreRoleDelegationRequest.php:80-86` passe `'utilisateur'`, `'rôle'`, `'date de fin'`, `'motif'` comme `attribute` de `__('validation.*')` → le constat tient. Classement : A4, déplacer ces messages existants vers des clés `lang/{fr,en,wo}` sans changer le texte français n'ajoute aucun texte de produit, et la garde proposée relève d'A5 sans seuil à resserrer.
- Mesure (2026-10-15, 0b57251a, implementeur) : re-lu les six FormRequests, les 14 littéraux et les 5 noms de champ français de `StoreRoleDelegationRequest` sont là ; `MessagesDeValidationTraduitsTest` avant correctif → 15 rouges sur 30 (les 14 phrases identiques au français en `en` et `wo`, et « The utilisateur field is required. »), les 15 cas `fr` verts → clés `lang/{fr,en,wo}/{properties,moderation,inventories,agencies}.php`, surcharges de la délégation retirées au profit de `validation.attributes`, garde `ProseLitteraleScanner` (h) `messages()`/`attributes()` et (i) `$fail(…)` ; ablation (`app/` et `lang/` remis) → 16 rouges, garde comprise ; remis → vert, 211 tests des classes touchées verts.

### Dates du site public figées en `fr-FR`
- Réf : P06.05
- Statut : fait · TCK-721
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyReviews.tsx:32`, `PropertyPriceHistory.tsx:16`, `takussan-web/src/components/public/profile/ReviewsSection.tsx:23`
- Constat :
  - En `/en`, la fiche publique affiche « 12 octobre 2026 ».
  - 11 autres locales sont figées : `PropertyModerationBanner.tsx:86`, `UpgradeRequestStatus.tsx:60,65`, `FilterSidebar.tsx:451-452`, `ActiveSessionsSection.tsx:103`, `PropertyKpiStrip.tsx:71`, `PropertyList.tsx:504`, `types/search.ts:388`.
  - 7 `toLocaleString()` nus dans `components/leases/*`.
  - `check-locale-figee.mjs` les tolère dans son cliquet (mesuré).
- Piste : `useFormatteurs()`, et faire descendre le plafond du cliquet.
- Mesure (2026-10-15, 5e758845, mesureur) : lu `PropertyReviews.tsx:32`, `PropertyPriceHistory.tsx:16` et `ReviewsSection.tsx:23` (`toLocaleDateString('fr-FR', …)` quelle que soit la locale) et les sites cités, lignes inchangées, sauf `PropertyList.tsx:504`, qui fige `'fr-SN'` par `Intl.DateTimeFormat` et non `'fr-FR'` ; `grep -rn "toLocaleString()" components/leases` → 7 hors tests ; `node scripts/check-locale-figee.mjs --report` → reste du dépôt 20 (cliquet 20) et console hors périmètre 1 (`lib/utils.ts`) ; `lib/format.ts:75-79` a déjà tranché `fr → 'fr-SN'` et `useFormatteurs()` existe → le constat tient. Classement : V8, TCK-347 (`todo`, estimé L) décrit déjà ce delta avec des comptes périmés (86 sites) ; le reprendre ou le découper, et faire descendre les cliquets de la garde (V9), revient au porteur.
- Mesure (2026-10-16, 964d9f59, implementeur) : lu `PropertyReviews.tsx:32`, `PropertyPriceHistory.tsx:16`, `ReviewsSection.tsx:23` → `toLocaleDateString('fr-FR', …)` inconditionnel, le défaut tient ; `node scripts/check-locale-figee.mjs --report` → reste du dépôt 20 (cliquet 20), dont ces trois fichiers à 1 chacun ; essai sur l'arbre (une seule ligne de `PropertyReviews.tsx` passée à la locale, puis remise) → `✗ RESTE DU DÉPÔT : 19 occurrence(s) hors consoles, alors que le cliquet dit 20`, sortie 1. Le correctif validé fait donc descendre le compte à 17 et exige `PLAFOND_RESTE = 17` dans le même diff ; `scripts/check-pistes.mjs` refuse toute modification d'une garde existante (V9), et la précision garde ce cliquet au porteur. Classement : chemin fermé (V9) ; aucune ligne de code écrite. Deux voies pour le porteur : descendre lui-même le cliquet avec le correctif, ou rendre la précision compatible (par exemple, cliquet descendu dans la même PR).
- Mesure (2026-10-16, 55a41109, humain) : fait en session (porteur, hors agents) : `node scripts/check-locale-figee.mjs --report` → reste du dépôt 20 → 1, `PLAFOND_RESTE` descendu à 1 dans le même diff ; le seul reste est `lib/visites/heure-de-dakar.ts`, dont `'en-US'` lit l'heure de Dakar sans l'afficher ; tests `tck-721` vérifiés par ablation (les trois cas `en` rougissent avec `'fr-FR'`). Ce qui reste de TCK-347 est dans les notes de TCK-721.

### Wolof : 334 valeurs identiques au français, dont des phrases d'interface
- Réf : P06.06
- Statut : retenu · à valider — V7 : texte wolof neuf, à écrire par un locuteur ; porteur (2026-10-15) : en attente d'un relecteur wolof ; porteur (2026-10-16) : wolof en pause jusqu'à nouvel ordre
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/messages/wo.json:5731-5734,3549`, `takussan-web/src/messages/fr.json:3897`
- Constat :
  - La parité des clés est exacte, mais 334 valeurs `wo` sont égales au `fr`, dont 46 visiblement françaises. Par exemple la navigation de l'assistant de publication (« Étape {current} sur {total} », « Précédent », « Continuer », « Plus tard »), `property.conditions.*` et `crm.pipeline.stage.*`.
  - `lease.form.customerFallback` vaut « Customer #{id} » en `fr`.
  - En anglais, seules 4 valeurs ressemblent à du français, toutes des noms propres (mesuré).
- Piste : relecture des 46 valeurs par un locuteur, et un cliquet décroissant « wo == fr hors emprunts » dans `check-i18n`.
- Mesure (2026-10-15, 5e758845, mesureur) : `node -e` qui aplatit `fr.json`, `en.json` et `wo.json` → 8 032 clés dans chacun, aucune absente ; **360** valeurs `wo` égales au `fr` (le constat en comptait 334), dont `property.wizard.position` « Étape {current} sur {total} », `.back`, `.continue`, `.skip`, `property.conditions.*` et `crm.pipeline.stage.*` ; `lease.form.customerFallback` vaut « Customer #{id} » en `fr` comme en `en` → le constat tient. Classement : V7, la piste demande une traduction wolof qu'un locuteur doit écrire ; seule la valeur anglaise du `fr` relèverait d'A4.

### L'éditeur de gabarits de notification écrit du français dans les lignes `en` et `wo`
- Réf : P06.07
- Statut : fait · TCK-748
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Admin/NotificationTemplateService.php:58-60,96-112,152-165`
- Constat :
  - `fallbackBody()` ignore `$locale` et renvoie le corps français pour les trois langues.
  - Le front renvoie tous les `templates` à l'enregistrement (`notification-templates.tsx:80`). La première sauvegarde écrit donc du français en `en` et `wo`, et `renderActive()` préfère ces lignes à `lang/*` (lu ; lignes en base à vérifier).
- Piste : pré-remplir depuis `lang/{locale}/notifications.php`, et ne persister que les langues modifiées.
- Mesure (2026-10-15, e9f9289c, mesureur) : `NotificationTemplateService.php:157-165` : `fallbackBody()` ignore `$locale` et rend le corps français, `fallbackSubject()` (l.152-155) rend le `name` français (lu) ; `update()` l.58-70 écrit les trois langues et replie sur `templates['fr']` pour toute langue absente (lu) ; `notification-templates.tsx:80` envoie tout `templates` (lu) ; `renderActive()` l.96-113 préfère la ligne active en base, et sert deux appelants (`NewBookingNotification.php:151`, `NotificationRenderer.php:214`) ; `SELECT` sur `notification_templates` par tinker → 9 lignes, toutes `whatsapp` et traduites, aucune ligne d'un événement éditable : le défaut n'a pas encore écrit en base de dev → tient. Classement : V7, pré-remplir depuis `lang/*` et ne persister que les langues touchées change ce que l'éditeur montre et enregistre.
- Mesure (2026-10-17, d2f24b2c, implementeur) : `NotificationTemplateTest` avant correctif → 2 rouges sur 8 : le `GET` rend en `en` le corps français (clé `lang/en` absente, `fallbackBody()` ignore `$locale`), et un `PATCH` des trois langues, `fr` seule modifiée, écrit `['fr','en','wo']` → bloc `editable_templates` dans `lang/{fr,en,wo}/notifications.php` (`wo` = texte français tel quel, wolof en pause), `update()` n'écrit plus une langue sans ligne restée égale à son texte de départ ; ablation (service d'avant remis) → les 2 mêmes rouges, ligne `fr` porteuse de `is_active=false` retirée → 1 rouge ; remis → 8/8 verts, 42 tests voisins verts.

### Noms de champs non traduits : « Le champ is active est obligatoire »
- Réf : P06.08
- Statut : fait · TCK-749
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/lang/fr/validation.php` (bloc `attributes`), `takussan-api/lang/en/validation.php`
- Constat :
  - 55 attributs sont traduits en `fr` et `wo`, aucun en `en`, sur 406 noms de champ validés (mesuré).
  - TCK-651 l'a constaté aussi : « le champ value » pour toutes les clés du catalogue.
- Piste : traduire les champs que les formulaires remontent, ou ne jamais afficher la prose 422 et la remplacer par un libellé du front.
- Mesure (2026-10-15, e9f9289c, mesureur) : `count(attributes)` dans `lang/{fr,en,wo}/validation.php` → 55, 0, 55 (mesuré) ; `is_active` absent du bloc `fr` ; tinker `Validator::make([], ['is_active'=>'required'])` en `fr` → « Le champ is active est obligatoire. », en `en` → « The is active field is required. » ; TCK-651:138 le relève aussi (« le champ value ») → tient. Classement : V7, la piste ouvre un choix entre traduire des centaines de noms de champ en trois langues et remplacer la prose 422 par des libellés du front.
- Mesure (2026-10-17, d2f24b2c, implementeur) : `count(attributes)` dans `lang/{fr,en,wo}/validation.php` → 55, 0, 55 ; `AttributsDeValidationTraduitsTest` avant correctif → 2 rouges sur 2 (`validation.attributes` absent en `en`, « The property id field is required. ») → bloc `attributes` anglais, mêmes 55 clés dans le même ordre ; ablation (fichier d'avant remis) → les 2 mêmes rouges ; remis → vert, `MessagesDeValidationTraduitsTest` et `ValidationMessagesLocaleTest` verts.

### Journal d'audit : des descriptions brutes qui mêlent français, anglais et codes
- Réf : P06.09
- Statut : retenu · à valider — V7 : libellés neufs par événement, et choix de ce que l'écran montre ; porteur (2026-10-15) : plus tard
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/admin/AuditTrail.tsx:536`, `admin/super/ConsoleRecentActivity.tsx:77`, `user-detail.tsx:479`
- Constat : 147 `->log('…')` littéraux, dont 31 en français. Les autres sont en anglais (« Exported audit trail ») ou sont des codes (mesuré).
- Piste : afficher `event` traduit (`admin.audit.events.*`), et réserver `description` à l'export.
- Mesure (2026-10-15, e9f9289c, mesureur) : `grep -rhoE "->log\('[^']*'\)" app | wc -l` → 141 littéraux entre apostrophes (plus 22 appels non littéraux), dont 31 à motif français (mesuré, compte voisin des 147/31 du constat) ; `AuditTrail.tsx:535` affiche `log.description` brut, `ConsoleRecentActivity.tsx:77` `description ?? event`, `user-detail.tsx:476-479` `event` puis `description` bruts (lu) ; `admin.audit.events` porte 13 clés dans `fr.json` (mesuré) → tient. Classement : V7, afficher l'événement traduit demande d'écrire un libellé pour chaque événement et de décider ce que la colonne montre.

### Pluriels absents
- Réf : P06.10
- Statut : fait · TCK-752 — reste : brancher la règle (`accordsManquants` de `takussan-web/scripts/i18n-pluriels.mjs`) dans `check-i18n.mjs`, garde existante que l'implémenteur ne modifie pas (V9)
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/messages/fr.json:95` (lue par `Navbar.tsx:518`), `takussan-web/src/components/dashboard/admin/AgencyKpis.tsx:51`
- Constat :
  - 49 messages `fr` (50 en `en`) écrivent `{count} <nom>` sans ICU `plural` : « 1 biens », « 1 months ».
  - 7 formes « (s) ».
  - `AgencyKpis` passe un nombre déjà formaté dans `count` (mesuré).
- Piste : ICU `plural`, et une règle de `check-i18n` sur `{count} [a-z]` sans `plural`.
- Mesure (2026-10-15, e9f9289c, mesureur) : parcours de `fr.json` et `en.json` par node, motif `{count} <mot>` sans `plural` → 40 messages dans chaque langue (dont des cas neutres comme « {count} en attente »), et 9 formes « (s) » en `fr`, 5 en `en` (mesuré ; comptes plus bas que les 49/50/7 du constat) ; `fr.json:95` `nav.propertiesCount` = « {count} biens », lu par `Navbar.tsx:518` ; `AgencyKpis.tsx:42,52` passe `formatNumber(…)` dans `count` (lu) → tient. Classement : V7, les formes ICU demandent un texte wolof neuf, et la règle `check-i18n` proposée est une garde de plus à cadrer.
- Mesure (2026-10-17, dfff1f69, implementeur) : avant correctif, `src/i18n/__tests__/pluriels.test.ts` → 11 rouges sur 17 (« 1 biens loués », « 1 months of deposit », « 2 document(s) »), et la règle neuve `accordsManquants` (`scripts/i18n-pluriels.mjs`, tenue par ce test) relève 52 messages en fr et en (mesuré) → plural posé sur 24 messages fr et 27 en, appelants qui passaient `String(n)` ou `formatNumber(…)` ramenés au nombre, `wo.json` inchangé (wolof en pause : sa valeur `{count} …` rend déjà le texte actuel), messages invariables listés dans `scripts/i18n-pluriels.mjs` ; ablation (dictionnaires d'avant) → les 11 mêmes rouges, correctif remis → 17 verts.

### Titre d'annonce suggéré en langue mêlée
- Réf : P06.11
- Statut : refusé — entorse assumée tant que la publication est servie en français
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/property-form/wizard/suggest-title.ts:47,59`
- Constat : « chambres » et « à » sont en dur. Résultat en `en` : « Apartment 3 chambres à Almadies » (lu).
- Piste : une clé ICU avec `plural`.
- Mesure (2026-10-15, e9f9289c, mesureur) : `suggest-title.ts:46` « chambre(s) », `:49` « de … m² », `:59` « à » en dur (lu) ; les commentaires l.41-44 et l.52-58 déclarent une « entorse assumée » au principe n°5 tant que la publication n'est servie qu'en français → tient. Classement : V7, lever l'entorse revient sur un choix écrit dans le code et demande des textes ICU en trois langues.

### Libellés du catalogue super-admin écrits en français par l'API
- Réf : P06.12
- Statut : retenu · à valider — V7 : contrat d'API à changer et libellés neufs en `en` et `wo` ; porteur (2026-10-15) : plus tard
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Domain/Settings/EditableBusinessEnums.php:20-40`, `Domain/Notifications/EditableNotificationEvents.php:13-29`, `Domain/Integrations/Providers/MailProvider.php:26`
- Constat : `name` et `description` sont affichés tels quels par `business-enums.tsx:117-118` et `notification-templates.tsx:101` (lu). Les paramètres plateforme, eux, sont traduits par clé depuis TCK-600.
- Piste : émettre une clé, et rendre le libellé côté front.
- Mesure (2026-10-15, e9f9289c, mesureur) : `EditableBusinessEnums.php:19-41` et `EditableNotificationEvents.php:12-30` portent `name`/`description`/`domain` en français, `MailProvider.php:26-27` des `label` mêlés (« API key », « Adresse expéditeur ») (lu) ; `business-enums.tsx:117-118` et `notification-templates.tsx:100` les affichent tels quels (lu) ; ce `name` sert aussi d'objet de courriel de repli (`NotificationTemplateService.php:154`) → tient. Classement : V7, émettre une clé change le contrat de l'API et demande d'écrire les libellés `en` et `wo`.

### Des documents qui affirment l'inverse de la mesure
- Réf : P06.13
- Statut : fait · TCK-722
- Gravité : 🟢 amélioration
- Où : `CLAUDE.md` (principe n° 5), `takussan-web/CLAUDE.md` (section i18n), `PropertiesDiscoveryPage.tsx:333`
- Constat :
  - `check-i18n --report` mesure 0 texte en dur toléré : « tenue à 82 fichiers sur 875 » est périmé.
  - « wo traîne 88 clés manquantes » est faux : il en manque 0.
  - « `lang/fr/validation.php` ne porte pas `boolean` » est faux aussi (mesuré).
- Piste : remplacer ces chiffres par la commande qui les donne.
- Mesure (2026-10-16, ddb5f050, mesureur) : `node scripts/check-i18n.mjs --report` (dans `takussan-web/`) → « en 0/0, wo 0/0 clé(s) manquante(s) sur 8022 clés fr » et « 0 TOLÉRÉE(S) … sur 0 fichier(s) » ; `CLAUDE.md:401` dit toujours « Tenu à 82 fichiers sur 875 », `takussan-web/CLAUDE.md:245-246` « `wo` traîne 88 clés manquantes » ; `lang/fr/validation.php:38` porte `boolean`, et `tinker` `__('validation.boolean', ['attribute' => 'furnished'], 'fr')` → « Le champ furnished doit être vrai ou faux. » (le `wo` est traduit aussi), contre le commentaire de `PropertiesDiscoveryPage.tsx:332-335` → les trois écarts tiennent. Classement : V9, la correction relève de A6, mais deux des trois fichiers sont des `CLAUDE.md` que l'implémenteur ne touche pas.
- Mesure (2026-10-16, 55a41109, humain) : fait en session : `check-i18n --report` → en 0, wo 0 clé manquante sur 8015, 0 toléré ; les deux `CLAUDE.md` donnent la commande au lieu du chiffre ; `lang/{fr,wo}/validation.php:38` portent `boolean` depuis TCK-536, le commentaire de `PropertiesDiscoveryPage.tsx` dit la vraie raison (le serveur nomme le champ par sa clé technique).

### Pages légales vides en wolof
- Réf : P06.14
- Statut : caduc — comportement voulu et écrit dans `docs/features.md:702-706` et `content/legal/README.md:44-46`
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/content/legal/terms.ts:445`, `privacy.ts:351`, `notice.ts:125`
- Constat : ``export const wo = ``;``. La page affiche le français avec une mention, et c'est documenté (lu).
- Piste : traduction à planifier, ou mention dans la spec.
- Mesure (2026-10-16, ddb5f050, mesureur) : lu `terms.ts:445`, `privacy.ts:351`, `notice.ts:125` (`export const wo = ``;`, inchangés) ; `docs/features.md:702-706` stipule que le wolof n'est pas fourni « à dessein » (« une traduction juridique demande un traducteur qui en réponde ») et que la page affiche alors le français avec la mention, et `takussan-web/src/content/legal/README.md:44-46` le redit → la branche « mention dans la spec » de la piste est déjà faite, et la branche « traduction » est un travail de traducteur juridique, pas un défaut du code. Classement : aucun critère, le comportement constaté est celui que la spec écrit.

## Angle 7 — Accessibilité du front (WCAG 2.2 AA)

*Exploré le 2026-10-15 vers 1 h 25. Les ratios ont été calculés par script depuis `globals.css`, et
la session en a recalculé un (pastille de prix : 3,14:1). Les cinq 🔴 ont été relus contre le code.*

Sain (vérifié par l'agent) :
- `lang` de `<html>` et des fragments ;
- toasts en région `aria-live` ;
- `h1` unique sur les pages principales ;
- cibles tactiles ;
- aucun bouton-icône sans nom ;
- connexion et assistant de publication.

### Pastille de prix de la carte et surlignage des suggestions sous 4,5:1
- Réf : P07.01
- Statut : fait · TCK-657
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/globals.css:758-760,773-777`, `takussan-web/src/components/search/SearchAutocomplete.tsx:65`
- Constat :
  - Pastille de prix : `#fcf9f3` sur `#c87a52` est à **3,14:1**, et **3,83:1** au survol (`#b66c43`), en 12 px gras.
  - Surlignage des suggestions : `<mark>` en `text-primary` sur `bg-primary/15`, à 4,33:1 (mesuré).
- Piste : la pastille lit `--primary` (5,06:1) au lieu d'une valeur recopiée en dur ; `--primary-deep` pour le surlignage.
- Mesure (2026-10-15, 5e758845, mesureur) : lu `globals.css:758,775` (`#c87a52` et `#b66c43` en dur, encre `#fcf9f3`, 12 px en 600) et `SearchAutocomplete.tsx:65` (`<mark>` en `bg-primary/15 text-primary`) ; contraste calculé par la formule WCAG (`node`) → pastille 3,14:1, survol 3,83:1, `--primary` (`#a85332`) 5,06:1 ; surlignage 4,33:1 sur `--popover` blanc, 4,14:1 sur `--background`, et `--primary-deep` (`#823c20`) sur le même aplat 6,53:1 → le constat tient. En thème sombre, `--primary` vaut `#c87a52` : la pastille n'y gagne rien, sans y perdre. Classement : A4, la pastille passe sur `var(--primary)` (et un survol sur `var(--primary-deep)`), le surlignage sur `text-primary-deep`, jetons existants, sans texte ni choix de produit.
- Mesure (2026-10-15, 96d4feb2, implementeur) : avant correctif, `pastille-et-surlignage.contraste.test.ts` (lit `globals.css` et le `<mark>` de `SearchAutocomplete.tsx`, résout les jetons des deux thèmes) → 10 rouges sur 11 : pastille 3,14:1 au repos et 3,83:1 au survol, `<mark>` de 3,49 à 4,33:1 selon la ligne (repos, active, survolée) et le thème. Correctif : pastille sur `var(--primary)`/`var(--primary-foreground)`, survol sur `var(--primary-deep)` (5,06 et 7,64:1 en clair, 5,31 et 6,78:1 en sombre) ; `<mark>` en `text-[var(--primary-deep)]` sur `bg-primary/10`, pire cas 4,81:1 (sombre, ligne active) — à 15 % d'aplat il restait 4,46:1. Ablation (deux fichiers remis, test gardé) → 10 rouges ; correctif remis → 11 verts.

### Encre atténuée sous le seuil sur quatre parcours
- Réf : P07.02
- Statut : fait · TCK-658
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/agency/BrandingBanner.tsx:42`, `takussan-web/src/components/leases/EarlyTerminationBanner.tsx:93`, `takussan-web/src/components/property-dashboard/ProprietaireEtResponsable.tsx:45,52`, `PropertyVisitDialog.tsx:288,352`
- Constat :
  - `text-warning/80` sur `bg-warning/10` : 3,53:1.
  - `text-muted-foreground/70` : de 2,95 à 3,03:1.
  - Même famille : `AvailabilityGrid.tsx:109` (3,70:1) et `ui/calendar.tsx:82`, où les jours hors du mois sont à 2,11:1 (mesuré).
- Piste : retirer l'opacité (`text-warning` est à 5,17:1, `text-muted-foreground` à 5,44:1), et une garde « pas d'alpha sur une encre de texte », comme TCK-359 pour les onglets.
- Mesure (2026-10-15, 5e758845, mesureur) : lu `BrandingBanner.tsx:42` et `EarlyTerminationBanner.tsx:93` (`text-warning/80` sur `bg-warning/10`), `ProprietaireEtResponsable.tsx:45,52` et `PropertyVisitDialog.tsx:288,352` (`text-muted-foreground/70`), `AvailabilityGrid.tsx:109` (`text-muted-foreground/80`) et `ui/calendar.tsx:82` (`outside` à `/50`) ; contraste calculé → 3,53:1, 2,95 à 3,03:1, 3,70:1 et 2,11:1 ; sans opacité, `text-warning` sur `bg-warning/10` rend 5,17:1 et `text-muted-foreground` 5,44:1 sur `--background` → le constat tient, lignes inchangées. Classement : A4, retirer l'opacité ramène chaque encre sur son jeton existant sans texte neuf (les jours hors du mois restent distincts des jours du mois, en `text-foreground`) ; la garde proposée relève d'A5.
- Mesure (2026-10-15, 2d25d35d, implementeur) : avant correctif, `encre-sans-alpha.contraste.test.ts` (retrouve chaque site par une ancre de texte, compose l'encre et son alpha sur le fond réel, deux thèmes) → 16 rouges sur 17 : bannières 3,65:1 en clair et 4,46:1 en sombre sur `bg-warning/10`, `text-muted-foreground/70` 3,03:1 (clair) et 4,17:1 (sombre), horaires 3,70:1, jours hors du mois 2,11 et 2,81:1, et le relevé des encres translucides à 17 fichiers. Correctif : opacité retirée des sept sites et de la classe `outside` du calendrier ; garde = cliquet à deux sens sur les 12 fichiers qui gardent une encre `text-<jeton>/NN` (non mesurés, hors périmètre). Ablation (six fichiers remis, test gardé) → 16 rouges ; correctif remis → 17 verts.

### L'erreur de la barre d'actions groupées est illisible
- Réf : P07.03
- Statut : fait · TCK-659
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/property-dashboard/PropertyList.tsx:688,757`
- Constat : `role="alert"` en `text-destructive` sur `bg-foreground/95`, à **2,22:1**. Les gardes `check-destructive-contrast` ne mesurent pas ce fond (mesuré).
- Piste : une pastille claire (`bg-background text-destructive`), ou l'encre claire de la barre avec une icône.
- Mesure (2026-10-15, 5e758845, mesureur) : lu `PropertyList.tsx:688` (barre `bg-foreground/95`, encre `text-primary-foreground`) et `:757` (`<span role="alert" class="text-destructive">`, dans cette barre) ; contraste calculé → 2,22:1 en clair, 2,11:1 en sombre (`#ff7f7d` sur `#fcf9f3` à 95 %) ; `check-destructive-contrast.mjs:158` ne lit que `bg-destructive/NN`, jamais ce fond → le constat tient. Une pastille `bg-background text-destructive` rendrait 6,61:1 en clair et 7,17:1 en sombre. Classement : A4, le contraste est ramené sur des jetons existants, sans texte neuf.
- Mesure (2026-10-15, d62e3290, implementeur) : avant correctif, `PropertyList.bulk-alerte.contraste.test.tsx` (rend la barre, fait échouer un lot, compose l'encre de l'`alert` sur chacun de ses fonds par `fondsPossibles`, deux thèmes) → rouge : `text-destructive` sur `bg-foreground/95` à 2,23:1 en clair et 2,11:1 en sombre. Correctif : pastille `rounded-md bg-background px-2 py-0.5 text-destructive` (6,61:1 et 7,17:1). Ablation (`PropertyList.tsx` remis, test gardé) → les deux mêmes rouges ; correctif remis → vert.

### La note des avis est invisible au lecteur d'écran
- Réf : P07.04
- Statut : fait · TCK-660
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyReviews.tsx:73-81`
- Constat :
  - La note n'est rendue que par cinq `<Star>`, que lucide marque `aria-hidden`, et aucun texte ne la porte.
  - Les étoiles vides (`/40`) sont à 1,78:1, sous les 3:1 d'un objet graphique (lu, mesuré).
- Piste : `role="img" aria-label={t('rating', {n})}`, ou un `sr-only` « 4 sur 5 », et les étoiles vides en `text-muted-foreground` plein.
- Mesure (2026-10-15, 5e758845, mesureur) : lu `PropertyReviews.tsx:73-81` (cinq `<Star>` sans nom, étoiles vides en `text-muted-foreground/40`) et `node_modules/lucide-react/dist/esm/Icon.mjs:36` (`aria-hidden="true"` posé dès qu'aucun attribut `aria-*` n'est passé) → aucun texte ne porte la note ; étoiles vides à 1,78:1 sur blanc (calculé) ; `ReviewsSection.tsx:77` fait déjà ce qu'il faut avec `publicProfile.reviews.ratingAria` (« {rating} étoiles sur 5 », présent en `en` et `wo`) → le constat tient. Classement : A4, un nom accessible qui reprend un libellé déjà traduit, et les étoiles vides en `text-muted-foreground` plein, sans texte de produit neuf.
- Mesure (2026-10-15, f30bd1cb, implementeur) : avant correctif, `PropertyReviews.note.test.tsx` (rend la fiche avec un avis noté 4, cherche un `img` nommé, compose l'encre de l'étoile vide sur `--card` et `--background`, deux thèmes) → 4 rouges : aucun `img` « 4 étoiles sur 5 » (fr) ni « 4 stars out of 5 » (en), étoile vide à 1,78:1 (clair) et 2,28:1 (sombre) sur `--card`. Correctif : `role="img"` et `aria-label` = `publicProfile.reviews.ratingAria` sur le groupe d'étoiles, étoiles vides en `text-muted-foreground` plein ; `PropertyReviews.tsx` sort du cliquet `RESTANTS` d'`encre-sans-alpha`. Ablation (`PropertyReviews.tsx` remis, tests gardés) → les 4 mêmes rouges, plus le cliquet ; correctif remis → vert.

### Une ligne de versement cliquable seulement à la souris
- Réf : P07.05
- Statut : fait · TCK-661
- Gravité : 🔴 défaut avéré (console super-admin)
- Où : `takussan-web/src/components/billing/PayoutTable.tsx:120-123`, appelée avec `onSelect` par `AdminPayoutsClient.tsx:96`
- Constat : `<tr onClick>` sans rôle, sans `tabIndex` ni clavier, et aucun bouton dans la ligne : le détail est inatteignable au clavier (lu).
- Piste : un `<button>` dans la cellule de période, comme `InvoicesTable.tsx:100`.
- Mesure (2026-10-15, 5e758845, mesureur) : lu `PayoutTable.tsx:120-123` (`<tr onClick>` sans rôle, sans `tabIndex` ni gestion du clavier, aucun élément focusable dans la ligne) et `AdminPayoutsClient.tsx:96-100` (`onSelect` → `setSelectedId`, seul chemin vers `PayoutDetailPanel`) ; `InvoicesTable.tsx:100-106` porte le patron du bouton → le constat tient. Classement : A4, rendre la période cliquable par un `<button>` quand `onSelect` est fourni, avec le texte de période qu'elle affiche déjà, n'ajoute ni texte ni comportement neuf.
- Mesure (2026-10-15, eee06c10, implementeur) : avant correctif, `PayoutTable.clavier.test.tsx` (rend la table avec `onSelect`, Tab puis Entrée ou Espace) → 2 rouges : le focus reste sur `BODY`, `onSelect` jamais appelé. Correctif : la période devient un `<button type="button">` quand `onSelect` est fourni, avec `stopPropagation` pour que le `<tr onClick>` gardé pour la souris ne rejoue pas la sélection ; sans `onSelect`, aucun bouton. Ablation : correctif retiré → les 2 mêmes rouges ; `stopPropagation` seul retiré → 2 rouges « appelé 2 fois » ; correctif remis → 3 verts.

### Champ de recherche principal : pas de libellé, et focus peu visible
- Réf : P07.06
- Statut : fait · TCK-731
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/search/SearchAutocomplete.tsx:226-262`, `takussan-web/src/components/home/Navbar.tsx:419,677`
- Constat :
  - L'input n'a ni `<label>` ni `aria-label` : le placeholder seul le nomme.
  - Il porte `outline-none`, sans `focus-within:` sur la pilule.
  - `role="combobox"` est sur le `div`, selon le motif ARIA 1.1 (lu ; rendu du focus à vérifier).
- Piste : un `aria-label` traduit, le motif ARIA 1.2, et `focus-within:ring-2` sur la pilule.
- Mesure (2026-10-15, e9f9289c, mesureur) : `SearchAutocomplete.tsx:226-262` : `role="combobox"` sur le `div` (l.227), `role="searchbox"` sur l'`input` (l.242), ni `aria-label` ni `<label>` sur l'`input`, `outline-none` l.259, aucun `focus`/`focus-within` sur le `div` (lu) ; `grep focus-within Navbar.tsx` → rien, et `globals.css` n'a de règle `:focus-visible` que pour les marqueurs de carte (l.773, l.809) ; la clé `t('placeholder')` existe déjà et nomme le listbox l.270 ; aucun test ne vise ce composant → tient. Classement : A4, attribut ARIA et anneau de focus sur un jeton existant, sans texte neuf : nommer l'`input` par la clé existante, porter `role="combobox"`/`aria-expanded`/`aria-haspopup` sur l'`input` (motif ARIA 1.2) et poser `focus-within:ring-2 focus-within:ring-ring` sur la pilule.
- Mesure (2026-10-16, 56aed2b1, implementeur) : traité avec P31.01, même composant et même correctif ; reproduit avant correctif par `SearchAutocomplete.aria.test.tsx` : `getByRole('combobox', { name })` ne trouve aucun `input` (rôle `searchbox`, sans nom hors placeholder) → rôle combobox, `aria-expanded`, `aria-haspopup` et `aria-label` (le texte affiché, aucune clé neuve) portés par l'`input`, anneau de focus sur la pilule ; ablation : rouge sans le correctif, vert avec ; tests existants passés de `searchbox` à `combobox`.

### Des erreurs de champ ni reliées ni annoncées hors des `Form*`
- Réf : P07.07
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `PropertyVisitDialog.tsx:263,270,276,283`, `PropertyContactMessageDialog.tsx:96`, `PropertyReservationDialog.tsx:440`, `PropertyReviews.tsx:281`, `leases/CreateLeaseForm.tsx:347,359`, `leases/DepositRefundModal.tsx:182,215`
- Constat : 13 contrôles sur 49 qui portent `aria-invalid` n'ont pas de `aria-describedby`, et 48 `<p class="text-destructive">` n'ont pas de `role`. Les `Form*` sont bien câblés (mesuré).
- Piste : migrer ces champs vers `FormInput`/`FormError`.
- Mesure (2026-10-15, ccabd662, mesureur) : `grep -c aria-invalid` / `aria-describedby` par fichier de `src/` : `PropertyVisitDialog.tsx` 2/0 (le `aria-invalid` est aujourd'hui l.268,281, ses erreurs `<p className="text-xs text-destructive">` l.270,283, sans `id` ni `role`), `CreateLeaseForm.tsx` 1/0 (`SelectTrigger` l.347, erreur l.359), `InviteAgentDialog.tsx` 8/0, `InviteOwnerSheet.tsx` 5/0, `InviteServiceProviderSheet.tsx` 4/0, `KpiConfigList.tsx` 1/0 ; `DepositRefundModal.tsx:182,215`, `PropertyContactMessageDialog.tsx:96`, `PropertyReservationDialog.tsx:440` et `PropertyReviews.tsx:281` portent toujours un `<p className="… text-destructive">` sans `role` ; sur une ligne, 56 `<p … text-destructive>` sans `role=` contre 144 avec (comptage grossier) ; les `Form*` relient bien leur erreur (1/1 partout) → tient. Classement : A4, attributs ARIA sans texte neuf : donner un `id` à chaque `<p>` d'erreur de champ, le citer par `aria-describedby` sur le contrôle `aria-invalid`, et poser `role="alert"` sur ces erreurs et sur les erreurs de formulaire citées, ou passer les champs par `FormInput`/`FormError`, sans changer le rendu.

### Des champs nommés par le seul placeholder
- Réf : P07.08
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `search/FilterSidebar.tsx:161,172,183`, `PropertyContactMessageDialog.tsx:89`, `PropertyReviewForm.tsx:94,102`, `PropertyPagination.tsx:113`
- Constat :
  - 21 champs ne sont nommés que par leur placeholder, et 2 n'ont aucun nom.
  - Le sélecteur de taille de page (un `SelectTrigger`, donc un `<button role="combobox">`) est sans nom, dans 8 listes (mesuré).
- Piste : `aria-labelledby` vers le titre de section, et un `aria-label` sur le sélecteur de taille de page.
- Mesure (2026-10-15, ccabd662, mesureur) : lu `FilterSidebar.tsx:126-185` : `RangeInputs` rend deux `<Input type="number">` (l.161-180) nommés par leur seul `placeholder` (`t('min')`/`t('max')`, `t('minArea')`…), réutilisé pour le budget (l.683) et la surface (l.744) sous un `<Section title>` ; `PropertyContactMessageDialog.tsx:89-95` (`Textarea` sans `aria-label` ni `<label>`) ; `PropertyReviewForm.tsx:94-109` (`Input` et `Textarea` nommés par `placeholder`) ; `property-dashboard/PropertyPagination.tsx:113` : `SelectTrigger` sans `aria-label` ; 9 fichiers combinent `pageSize`/`perPage` et `SelectTrigger` (non recomptés un à un) ; le compte de 21 champs n'a pas été refait → tient pour les exemples relus. Classement : A4, attributs ARIA par des textes existants : `aria-labelledby` vers le titre de `Section` (et la borne), `aria-label` des clés déjà traduites (`messagePlaceholder`, `titlePlaceholder`, `perPagePlaceholder` présent en fr/en/wo) sur les champs et le sélecteur de taille de page, sans texte neuf.

### Anneau de focus à 50 % (2,08:1) et bordure des champs à 1,26:1
- Réf : P07.09
- Statut : fait · TCK-753
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/ui/button.tsx:31`, `ui/input.tsx:20`, `takussan-web/src/app/globals.css:163,694`
- Constat :
  - `ring-ring/50` est à 2,08:1 sur `--background` ; sur un bouton plein, c'est le seul signal de focus. TCK-371 l'avait relevé, et aucun ticket n'a été ouvert.
  - `--input: #ebe5d5`, seul contour d'un champ, est à 1,26:1 (WCAG 1.4.11, mesuré).
- Piste : un anneau plein ou `outline-2 outline-offset-2`, et un jeton `--input` propre, autour de 3:1.
- Mesure (2026-10-15, ccabd662, mesureur) : lu `button.tsx:31` et `input.tsx:20` (`focus-visible:ring-3 focus-visible:ring-ring/50`), `globals.css:29` (`--background: #fcf9f3`), `:163-164` (`--input: #ebe5d5`, `--ring: #a85332`) ; calcul WCAG en `node` : `ring` à 50 % mêlé au fond → 2,08:1 contre `--background` ; `--input` → 1,20:1 contre `--background` et 1,26:1 contre le blanc → tient. Classement : V7, ni l'anneau plein ni un nouveau `--input` ne se ramènent sur un jeton existant : c'est une modification de la palette et du focus de toutes les primitives, un choix de dessin.
- Mesure (2026-10-17, dfff1f69, implementeur) : avant correctif, `src/test/__tests__/focus-et-contour-des-champs.contraste.test.ts` → 4 rouges sur 5 : 84 `ring-ring/50` dans 58 fichiers de `src/` plus `outline-ring/50` dans `globals.css:694`, `--input` à 1,20:1 sur `--background` et 1,26:1 sur `--card` (mesuré par `contraste-wcag.ts`) → anneaux et contour de base pleins, `--input` clair à `#918672` (3,41 / 3,59 / 3,04:1 sur fond, carte, muted), fond désactivé et séparateur de `TagsManager` passés sur `--border` pour garder leur aspect ; ablation (sources d'avant) → les 4 mêmes rouges, correctif remis → 5 verts, et 339 tests verts sur `src/test`, `ui/` et les tests a11y qui lisent l'anneau.

### Focus du marqueur de carte, visionneuse sans nom, entrée verrouillée hors du clavier
- Réf : P07.10
- Statut : fait · TCK-754
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/globals.css:773-777`, `PropertyLightbox.tsx:55`, `takussan-web/src/components/layout/AppSidebar.tsx:557-568`
- Constat :
  - Le marqueur au focus n'a qu'un écart de 1,22:1 avec son état normal, et porte `outline: none`.
  - Le `Popup` de la visionneuse n'a pas de nom.
  - `<span role="link" aria-disabled title>` n'est pas focusable, et la raison du verrou n'est que dans `title` (signalé par TCK-371, toujours présent).
- Piste : un `outline` blanc de 2 px décalé ; `aria-label` sur le `Popup` ; `tabIndex={0}` et la raison en `sr-only`.
- Mesure (2026-10-15, ccabd662, mesureur) : lu `globals.css:772-778` (`.takussan-price-marker__pill:focus-visible` = même règle que `:hover`, `background: #b66c43` contre `#c87a52` au repos, `outline: none`) ; calcul WCAG en `node` → 1,22:1 entre les deux fonds ; `PropertyLightbox.tsx:55` : `DialogPrimitive.Popup` sans `aria-label` ni `Title` (les seuls `aria-label` sont les boutons l.63,93,101) ; `AppSidebar.tsx:557-568` : `<span role="link" aria-disabled="true" title={t('proLocked')}>` sans `tabIndex` → les trois constats tiennent. Classement : V7, le nom de la visionneuse serait A4, mais le contour du marqueur est un dessin neuf et rendre focusable une entrée verrouillée change le parcours clavier de la barre latérale.
- Mesure (2026-10-17, dfff1f69, implementeur) : relu `globals.css:774-780` (`:focus-visible` partagé avec `:hover`, `outline: none`), `PropertyLightbox.tsx:55` (`Popup` sans nom) et `AppSidebar.tsx:557-568` (span cadenassé sans `tabIndex`) → les trois tiennent ; trois tests neufs (`marqueur-focus.test.ts`, `PropertyLightbox.a11y.test.tsx`, un cas d'`AppSidebar.test.tsx`) rouges avant correctif → règle `:focus-visible` à `outline: 2px solid #ffffff` décalé de 2 px, `aria-label` « Photos : {title} » sur la visionneuse (`wo` = texte français), `tabIndex={0}` et raison en `sr-only` ; ablation (sources d'avant) → les 3 mêmes rouges, correctif remis → verts, 345 tests verts sur `components/layout`, `components/map` et la fiche publique.

### Le mouvement réduit est ignoré par les primitives
- Réf : P07.11
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette (AAA, mais la charte en fait une règle)
- Où : `ui/sheet.tsx:104-110`, `ui/dialog.tsx:58`, `ui/popover.tsx`, `ui/select.tsx`, `property/cards/PropertyRow.tsx:184`
- Constat : `slide-in` et `zoom-in` de tw-animate-css ignorent `prefers-reduced-motion`, aucun `motion-reduce:` n'apparaît, et `scrollBy({behavior:'smooth'})` n'est pas conditionné (mesuré).
- Piste : `motion-reduce:animate-none` dans les primitives.
- Mesure (2026-10-15, ccabd662, mesureur) : lu `ui/sheet.tsx:100-110` (`slide-in-from-*`), `ui/dialog.tsx:35,58`, `ui/popover.tsx:62-63` (`zoom-in-95`, `slide-in-from-*`), `ui/select.tsx:97` ; `grep motion-reduce` → aucun dans ces quatre primitives (le constat « aucun `motion-reduce:` » est inexact : `button.tsx:31`, `ChatWidget.tsx`, `SelecteurDeTransaction.tsx`, `WizardReprenable.tsx` en portent) ; `grep reduced-motion node_modules/tw-animate-css/dist/tw-animate.css` → 0 ; les deux blocs `@media (prefers-reduced-motion)` de `globals.css:533,606` ne nomment que des `.animate-*` et `.wizard-*` maison ; `PropertyRow.tsx:184` : `scrollBy({ …, behavior: 'smooth' })` non conditionné → tient. Classement : A4 et A1, `docs/design-guidelines.md:365-369` écrit déjà que toute animation se neutralise sous mouvement réduit : poser `motion-reduce:animate-none` sur les contenus et fonds de `sheet`, `dialog`, `popover` et `select`, et `behavior: 'auto'` quand `matchMedia('(prefers-reduced-motion: reduce)')` répond.

### Le lint d'accessibilité est presque éteint
- Réf : P07.12
- Statut : retenu · à valider — V9 : faire passer des règles de lint en erreur, sous un cliquet neuf, touche le seuil d'une garde ; porteur (2026-10-15) : traité hors agents, règles a11y en error sous cliquet
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/eslint.config.mjs:37-39`
- Constat : 6 règles `jsx-a11y` seulement, en `warn`. Ni `label-has-associated-control`, ni `click-events-have-key-events`, ni `no-static-element-interactions` : aucune garde n'aurait attrapé les constats ci-dessus (lu).
- Piste : ces règles en `error`, sous un cliquet par fichier comme `check-i18n`.
- Mesure (2026-10-15, ccabd662, mesureur) : lu `takussan-web/eslint.config.mjs` (aucune règle `jsx-a11y` propre au dépôt ; l.37-39 étalent `nextVitals` et `nextTs`) et `node_modules/eslint-config-next/dist/index.js:173-188` : `alt-text`, `aria-props`, `aria-proptypes`, `aria-unsupported-elements`, `role-has-required-aria-props`, `role-supports-aria-props`, toutes en `warn` ; ni `label-has-associated-control`, ni `click-events-have-key-events`, ni `no-static-element-interactions` → tient. Classement : V9, la piste resserre une garde (des règles en `error`) et invente un cliquet par fichier, dont la forme est à décider.

### Boutons « Ouvrir » sans contexte, tableaux sans titre
- Réf : P07.13
- Statut : validé — libellés contextuels et captions en fr/en ; en wo, le texte français tel quel (wolof en pause depuis le 2026-10-16)
- Gravité : 🟢 amélioration
- Où : `payments/InvoicesTable.tsx:100-106`, `PayoutsTable.tsx:116`, `PaymentsHistoryTable.tsx`, `billing/PayoutTable.tsx`, `PropertyReviewForm.tsx:76`
- Constat : « Ouvrir » répété N fois, des tableaux sans `<caption>`, et des `role="radio"` sans navigation aux flèches (lu).
- Piste : « Ouvrir la facture {réf} », et passer ces tableaux par `console/DataTable`, qui impose une `caption`.
- Mesure (2026-10-16, ddb5f050, mesureur) : `grep -c caption` → 0 dans `payments/InvoicesTable.tsx`, `payments/PayoutsTable.tsx`, `payments/PaymentsHistoryTable.tsx` et `billing/PayoutTable.tsx`, qui rendent un `<table>` nu (`PayoutsTable.tsx:67`, `PaymentsHistoryTable.tsx:84`, `PayoutTable.tsx:106`) ; `InvoicesTable.tsx:99-106` et `PayoutsTable.tsx:116` rendent `tTable('open')` (« Ouvrir », `messages/fr.json:1779`) sans libellé propre à la ligne ; `PropertyReviewForm.tsx:69,80` pose `role="radiogroup"`/`role="radio"` sans aucun `onKeyDown` ni gestion des flèches ; `console/DataTable.tsx:61-65` impose bien `caption` → tout tient. Classement : V7, chaque caption et chaque libellé contextuel est un texte neuf à écrire dans les trois langues, et passer par `DataTable` refond quatre tableaux.

## Angle 8 — Parcours sur téléphone

*Exploré le 2026-10-15 vers 1 h 35, par lecture et comptage ; aucun rendu réel. Les deux premiers
🔴 ont été relus contre le code par la session, y compris dans le code de Next.*

Sain (vérifié par l'agent) :
- `tel:`, WhatsApp et `navigator.share` sont présents ;
- les cartes Leaflet sont chargées en différé ;
- les actions au survol sont gardées par `pointer-fine:` ;
- les coques sont en `h-dvh` ;
- l'authentification pose ses `autoComplete`.

### Les photos d'un bien partent par une server action plafonnée à 1 Mo
- Réf : P08.01
- Statut : fait · TCK-673
- Gravité : 🔴 défaut avéré (un envoi réel reste à rejouer)
- Où : `takussan-web/next.config.ts` (pas de clé `serverActions`), `takussan-web/src/app/actions/dashboard-properties.ts:243`, `takussan-web/src/components/property-form/PropertyWizard.tsx:325-329`, `takussan-web/src/components/property-dashboard/PropertyMediaPanel.tsx:71`
- Constat :
  - Sans `serverActions.bodySizeLimit`, Next refuse tout corps de server action au-delà de 1 Mo (`node_modules/next/dist/server/app-render/action-handler.js:517-519`, relu par la session). Le multipart est concerné.
  - Le wizard met toutes les photos dans un seul `FormData`, alors qu'une seule photo réduite pèse 1 446 048 o (mesure de TCK-542, qui dit n'avoir « rejoué aucun envoi réel vers l'API »).
  - Même plafond pour `dashboard-customers.ts:175` (documents) et `admin-agency.ts:110`.
  - `MediaManager.tsx:172-190` simule la progression jusqu'à 85 %, puis tout tombe d'un coup.
- Piste : une photo par requête, par route handler BFF ou directement vers l'API, avec une vraie progression (XHR) et une reprise par fichier. Relever `bodySizeLimit` seul ne règle pas le réseau lent.
- Mesure (2026-10-15, 5e758845, mesureur) : lu `next.config.ts` (aucune clé `serverActions`), `next/dist/server/app-render/action-handler.js:517-519` (Next 16.3.1, `'1 MB'` par défaut) et `:665-700` (le corps multipart passe par `sizeLimitTransform` et lève un 413 au-delà), `PropertyWizard.tsx:325-329` (toutes les photos dans un seul `FormData` vers `uploadPropertyPhotosAction`, `dashboard-properties.ts:243`), `reduire-photo.ts:24` (`COTE_MAX = 2560`) et TCK-542 l. 128 (1 446 048 o pour une photo réduite) → le constat tient à la lecture ; ce passage n'a rejoué aucun envoi réel. Classement : V7 et V8, la piste change la voie d'envoi (route handler ou API directe), la progression visible et la reprise par fichier, sur trois écrans : plus d'un ticket et des choix de produit.
- Mesure (2026-10-16, b57126b7, implementeur) : reproduit avant correctif par trois tests rouges : `next.config.ts` sans `serverActions.bodySizeLimit` ; `PropertyWizard` qui envoie un seul `FormData` de trois photos ; `MediaManager` qui passe tout le lot à `uploading` d'un coup → `next-config.server-actions.test.ts`, `MediaManager.test.tsx` (2 tests) et `PropertyWizard.test.tsx` (3 tests : une action par photo, « Envoi des photos : 1 sur 2 », reprise de la seule photo en échec) ; ablation (correctif retiré) → 6 rouges, remis → verts. Aucun envoi réel rejoué ; `proxyClientMaxBodySize` (10 Mo par défaut sur `src/proxy.ts`) reste hors périmètre, noté dans TCK-673.

### Les dialogues n'ont ni hauteur maximale ni défilement
- Réf : P08.02
- Statut : fait · TCK-674
- Gravité : 🔴 défaut avéré (rendu à vérifier)
- Où : `takussan-web/src/components/ui/dialog.tsx:58`, `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx:172`
- Constat :
  - La primitive est `fixed top-1/2 -translate-y-1/2`, sans `max-h` ni `overflow-y-auto` (relu). Seuls 3 `DialogContent` sur 75 l'ajoutent.
  - Le dialogue de visite empile la date, 20 créneaux en 5 rangées, quatre champs et le bouton : environ 640 px estimés. Sur un 360×640, le titre et « Envoyer » sortent de l'écran, et le verrou de défilement interdit d'y aller.
  - Même risque pour `CreateInvoiceDialog`, `InviteAgentDialog` et `GuarantorSection` (comptage).
- Piste : `max-h-[calc(100dvh-2rem)] overflow-y-auto` dans la primitive, ou un pied collant ; une feuille du bas sous `sm`.
- Mesure (2026-10-15, 25820d04, mesureur) : relu `dialog.tsx:58-60` (`fixed top-1/2 … -translate-y-1/2`, ni `max-h` ni `overflow-y-auto` ; dernier changement `f21ccd17`, TCK-529) et `PropertyVisitDialog.tsx:171` (`DialogContent className="sm:max-w-lg"`, sans hauteur bornée) ; `grep` → 71 fichiers utilisent `DialogContent` (le constat disait 75), 3 seulement posent `max-h-[90dvh] overflow-y-auto` (`GardeDoubleFacteur.tsx:70`, `PrivacyRequestsConsole.tsx:463,611`). La primitive ne borne donc pas la hauteur (lu) ; le débordement du dialogue de visite sur un 360×640 n'a **pas** été rendu, et reste une estimation. Classement : V7, borner la hauteur ou passer en feuille du bas sous `sm` change la mise en page des 71 dialogues, et la piste laisse le choix entre deux dessins.
- Mesure (2026-10-16, b57126b7, implementeur) : relu `dialog.tsx:58` sur l'arbre (ni `max-h` ni `overflow-y-auto`) ; `dialog-hauteur-bornee.test.tsx` lit le CSS compilé par Tailwind pour les classes du dialogue rendu (avec `sm:max-w-lg`, classe de `PropertyVisitDialog`) → rouge avant correctif (aucun `max-height` compilé), vert avec `max-h-[calc(100dvh-2rem)] overflow-y-auto` dans la primitive ; ablation (primitive remise à `pre-dev`) → rouge, correctif remis → vert. Rendu réel en navigateur non mesuré.

### Un montant hors pas bloque l'envoi des formulaires de bail et de paiement
- Réf : P08.03
- Statut : fait · TCK-670
- Gravité : 🔴 défaut avéré — même famille que « Restitution de caution » à l'angle 4
- Où : `takussan-web/src/components/leases/CreateLeaseForm.tsx:233,243,253`, `LeasePaymentDialog.tsx:92`, `DepositRefundModal.tsx:172`, `bookings/BookingPaymentDialog.tsx:91`, `payments/CreateInvoiceDialog.tsx:227`
- Constat : `FormInput` transmet `step` (`components/forms/FormInput.tsx:90`), et aucun de ces 5 formulaires n'a `noValidate`. Un loyer de 75 500 ou un paiement de 12 350 sont refusés avant `onSubmit` (lu).
- Piste : retirer `step` (zod valide déjà), ou poser `noValidate`. À traiter avec l'angle 4, en un seul ticket.
- Mesure (2026-10-15, 25820d04, mesureur) : relu `FormInput.tsx` (`...inputProps` transmet `step` et `min` à l'`<input>`) et les cinq `<form>` cités, aucun avec `noValidate` ; `step` toujours présent à `CreateLeaseForm.tsx:233,243,253` (1000), `LeasePaymentDialog.tsx:92` et `BookingPaymentDialog.tsx:91` (100), `DepositRefundModal.tsx:172` (1000, avec `min={0.01}`), `CreateInvoiceDialog.tsx:227` (100) ; test vitest temporaire (retiré) qui soumet un `FormInput type=number` dans un `<form>` par un clic → `min=0 step=100` : 12350 → `stepMismatch`, 0 envoi ; `min=0 step=1000` : 75500 → 0 envoi ; `min=0.01 step=1000` : 50000 → 0 envoi ; témoin 12300 → 1 envoi. Le constat tient, et `DepositRefundModal` refuse même les montants ronds. Classement : V1, le correctif élargit les montants qu'un écran d'argent peut envoyer, et la piste le lie à P04.10 (déjà classé V1) en un seul ticket.
- Mesure (2026-10-16, 8ff39d7a, implementeur) : reproduit avant correctif par `leases/__tests__/montants-hors-pas.test.tsx` → 12 350 en `stepMismatch` dans `LeasePaymentDialog` et `BookingPaymentDialog` (`step=100`), 152 500 et 75 500 dans `CreateLeaseForm` (`step=1000`), un prix unitaire de 12 350 dans `CreateInvoiceDialog` (`step=100`) → `step="any"` partout, `min={1}` sur les paiements, `min={0}` gardé sur `unit_price` (zod `nonnegative`) ; ablation → rouges, correctif remis → verts. Traité avec P04.04 dans TCK-670.

### Les marges de zone sûre sont sans effet : pas de `viewport-fit=cover`
- Réf : P08.04
- Statut : retenu · à valider — V7 : `viewport-fit=cover` étend le rendu sous l'encoche et change la mise en page iOS ; porteur (2026-10-15) : plus tard, à rendre sur un iPhone
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/layout.tsx` (pas d'export `viewport`) ; 9 usages d'`env(safe-area-inset-bottom)`, dont `home/Navbar.tsx:676,811,855`, `search/FilterSidebar.tsx:1099`, `wizard/WizardShell.tsx:99`
- Constat : `viewport-fit` est absent de `src/`, donc iOS rend `env(safe-area-*)` à 0. TCK-477 garde le consommateur, pas le viewport (mesuré ; iPhone réel à vérifier).
- Piste : `export const viewport = { viewportFit: 'cover' }`, puis relire les en-têtes fixes en paysage.
- Mesure (2026-10-15, ccabd662, mesureur) : `grep -rn 'viewport-fit\|viewportFit\|export const viewport\|generateViewport' takussan-web/src` → rien ; `grep -rn safe-area-inset takussan-web/src` → 18 occurrences dans 10 fichiers (le constat disait 9 usages) ; `git log -S viewportFit` → seul le commit qui a écrit cette piste ; aucun rendu sur un iPhone réel → tient à la lecture. Classement : V7, déclarer `viewportFit: 'cover'` fait passer tout le site sous l'encoche et les barres, et la piste demande elle-même de relire les en-têtes fixes en paysage : un changement de mise en page visible, à rendre sur un appareil.

### Brouillons : les photos ne sont jamais sauvées, rien n'est gardé hors ligne
- Réf : P08.05
- Statut : retenu · à valider — V7 et V8 : une copie hors ligne des brouillons et de leurs photos est une fonction neuve ; porteur (2026-10-15) : plus tard
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/property-form/PropertyWizard.tsx:240,465-470`, `takussan-web/src/hooks/useWizardDraft.ts:166-188`
- Constat :
  - Les photos ne vivent qu'en mémoire : un onglet tué par Android pendant l'appareil photo les perd.
  - L'autosave fait un `PUT` serveur sans copie locale, et sans relance au retour du réseau (aucun `online` ni `offline` dans `src/`, mesuré).
- Piste : une copie IndexedDB (valeurs et `File`) et une relance sur `online`.
- Mesure (2026-10-15, ccabd662, mesureur) : lu `PropertyWizard.tsx:240` (`useState<File[]>([])`, photos en mémoire seule) et `useWizardDraft.ts:167-193` (`performSave` : un `PUT /api/me/wizard-drafts/{key}` seul, aucune copie locale) ; `grep "'online'\|'offline'\|indexedDB" takussan-web/src` hors tests → rien → tient. Classement : V7 et V8, garder les `File` en IndexedDB et relancer au retour du réseau est un comportement visible neuf (reprise hors ligne, quota, purge), au-delà d'un ticket M.

### Les formulaires longs hors wizard n'ont aucun brouillon
- Réf : P08.06
- Statut : fait · TCK-755
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/leases/CreateLeaseForm.tsx` (11 champs), `customer-form/CustomerForm.tsx` (17), `property-form/PropertyForm.tsx` (13)
- Constat : aucune persistance, et aucun `beforeunload` dans `src/` (mesuré).
- Piste : `useWizardDraft` sous une clé par écran, comme `WizardReprenable`.
- Mesure (2026-10-15, 66ed4340, mesureur) : `grep -l 'useWizardDraft\|localStorage\|sessionStorage'` sur `CreateLeaseForm.tsx`, `CustomerForm.tsx` et `PropertyForm.tsx` → rien ; `grep -rln beforeunload takussan-web/src` hors tests → `hooks/useWizardDraft.ts:264`, un **commentaire** seulement (le constat disait « aucun » : il n'y a aucun gestionnaire) → tient. Classement : V7, une reprise de brouillon ou un avertissement de départ sur trois écrans est une interaction neuve (quand proposer, quand purger), qu'aucune spec n'écrit pour ces formulaires.
- Mesure (2026-10-17, 18c6141d, implementeur) : `grep -rn beforeunload takussan-web/src` hors tests → le seul commentaire de `useWizardDraft.ts:264` ; un `beforeunload` annulable émis après une saisie dans chacun des trois formulaires n'est pas annulé (3 tests rouges) → tient. Correctif : `useAvertissementDepart(isDirty)`, `isDirty` lu par `useFormState`. Ablation : écouteur retiré → 4 rouges ; branchement retiré de `CustomerForm` → son test rouge ; remis → 46/46 verts.

### Des tableaux sans alternative en cartes, l'action en dernière colonne
- Réf : P08.07
- Statut : retenu · à valider — V7 et V8 : une présentation mobile de 30 tableaux est un choix de design ; porteur (2026-10-15) : plus tard
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/console/DataTable.tsx:140`, `owners/OwnersList.tsx:209-230`, `service-providers/ServiceProvidersList.tsx:163,223`, `commissions/CommissionsLedger.tsx:126,212`, `payments/InvoicesTable.tsx:74,99-106`
- Constat : sur 32 consommateurs de `DataTable`, seuls `CustomerList` et `PropertyList` ont une liste mobile. Ailleurs, l'action ne s'atteint qu'après un défilement horizontal (mesuré).
- Piste : une option `carteMobile` dans `DataTable`, ou la ligne cliquable avec l'action en tête.
- Mesure (2026-10-15, 66ed4340, mesureur) : `grep -rl '<DataTable' takussan-web/src` hors tests → **32** fichiers ; parmi eux, seuls `CustomerList.tsx` et `PropertyList.tsx` portent un `md:hidden`/`sm:hidden`/`lg:hidden` ; `DataTable.tsx:140` enveloppe la table sans vue en cartes → tient. La position de l'action en dernière colonne n'a pas été relue fichier par fichier. Classement : V7 et V8, choisir entre cartes et ligne cliquable est du design, et l'appliquer à 30 consommateurs dépasse un ticket M.

### Barres d'onglets sans défilement
- Réf : P08.08
- Statut : fait · TCK-756
- Gravité : 🟠 risque ou dette (à vérifier)
- Où : `takussan-web/src/components/ui/tabs.tsx:27,87`, `payments/PaymentsTabs.tsx:81`, `property-dashboard/PropertyDetailTabs.tsx:71`
- Constat : 5 onglets totalisent environ 53 caractères pour 328 px, sans enveloppe `overflow-x-auto` (contrairement à `CustomerDetailTabs.tsx:65`). C'est `<main>` qui défilerait de côté, et la sonde de TCK-505 ne le voit pas (lu).
- Piste : reprendre le patron de `CustomerDetailTabs` dans la primitive.
- Mesure (2026-10-15, 66ed4340, mesureur) : relu `tabs.tsx:27` (`inline-flex w-fit`, aucun `overflow`) et `:87` (déclencheurs `whitespace-nowrap`), `PaymentsTabs.tsx:81` et `PropertyDetailTabs.tsx:71` (`<TabsList>` nu), `CustomerDetailTabs.tsx:65` (enveloppe `overflow-x-auto`) ; largeur rendue par Chromium headless des libellés `fr` (14 px, graisse 500, padding de la primitive, **police de repli** Helvetica et non DM Sans) → **454 px** pour les cinq onglets des paiements, **394 px** pour ceux du bien, contre 328 px disponibles → la barre déborde. Que ce soit `<main>` qui défile n'a **pas** été mesuré : retenu pour le débordement seul. Classement : V7, faire défiler la primitive touche toutes les barres, et la règle « défile dans son conteneur » n'est écrite que pour les tables.
- Mesure (2026-10-17, 18c6141d, implementeur) : relu `ui/tabs.tsx:27` (`inline-flex w-fit … justify-center`, aucun `overflow`), `PaymentsTabs.tsx:81` et `PropertyDetailTabs.tsx:71` (`<TabsList>` nu) → tient. Correctif dans la primitive : `max-w-full`, `justify-center-safe` (centré, un débordement perd son début), `overflow-x-auto` sur la variante `default` seule (le liseré de `line` est posé 5 px sous la liste). Test `tabs.defilement.test.tsx` ; ablation : primitive d'avant → rouge ; remise → 99/99 verts sur 18 fichiers. Non observé dans un navigateur.

### Zoom iOS sur des champs faits main en `text-sm`
- Réf : P08.09
- Statut : fait · TCK-757
- Gravité : 🟠 risque ou dette
- Où : `inventory/RoomEditor.tsx:140`, `admin/InviteAgentDialog.tsx:136,154,175,194`, `admin/InviteMemberDialog.tsx:111`
- Constat : les primitives sont saines (`text-base md:text-sm`), mais ces champs sont sous 16 px, et Safari zoome au focus (mesuré).
- Piste : `Input`/`Textarea`, ou `text-base md:text-sm`.
- Mesure (2026-10-15, 66ed4340, mesureur) : relu `RoomEditor.tsx:140` (`<textarea>` en `text-sm`), `InviteAgentDialog.tsx:136,154,175,194` et `InviteMemberDialog.tsx:111` (`<input>` en `text-sm`, sans `text-base`) — lignes inchangées ; `ui/input.tsx:18-20` écrit la règle (« 16 px sous `md` (`text-base md:text-sm`) : iOS ne zoome pas au focus ») et `ui/textarea.tsx:10` l'applique → tient. Le zoom lui-même n'a pas été observé sur un iPhone. Classement : A1, le comportement attendu est écrit dans la primitive, et le correctif aligne six champs sur elle sans choix de produit.
- Mesure (2026-10-17, 18c6141d, implementeur) : garde de source `champs-sans-zoom-ios.test.ts` sur les trois fichiers cités → 3 rouges, exactement les six champs (`RoomEditor.tsx:137`, `InviteAgentDialog.tsx:132,150,170,190`, `InviteMemberDialog.tsx`) → tient. Correctif : `text-base md:text-sm`. Ablation : fichiers d'avant → 3 rouges ; remis → verts. Cinq autres champs du dépôt en `text-sm` seul, hors piste, sont listés dans TCK-757.

### Petites améliorations
- Réf : P08.10
- Statut : validé — selon la piste
- Gravité : 🟢 amélioration
- Où et constat (lu ou mesuré) :
  - `leases/GuarantorSection.tsx:81-84,188-192` : téléphone du garant sans `type="tel"` ni lien `tel:` ;
  - `CreateLeaseForm.tsx:229-253` : `type="number"` sans `inputMode` ;
  - `ui/sheet.tsx:102` : `max-h-[90vh]`, alors que `PropertyListFilters.tsx:395` corrige déjà en `88dvh` ;
  - fiches publiques de bien, d'agence et d'agent sans `loading.tsx` : ce sont les pages ouvertes depuis WhatsApp ;
  - `capture` absent de l'état des lieux et des photos du bien (`InventoryDetail.tsx:263`, `StepPhotos.tsx:31`).
- Piste : `PhoneInput`, `FormAmountInput`, `90dvh` dans la primitive, des squelettes de chargement, et un second bouton « Prendre une photo » avec `capture="environment"`.
- Mesure (2026-10-16, ddb5f050, mesureur) : lu `GuarantorSection.tsx:81-84` (téléphone affiché en texte, sans lien `tel:`) et l. 188-192 (`FormInput` `name="phone"` sans `type`) ; `CreateLeaseForm.tsx:229,239,249,273` : `type="number"` sans `inputMode` ; `ui/sheet.tsx:102` `max-h-[90vh]` contre `PropertyListFilters.tsx:395` `max-h-[88dvh]` ; `ls` de `(public)/properties/[slug]`, `(public)/agencies/[slug]`, `(public)/agents/[slug]` → aucun `loading.tsx` (seul `properties/(liste)/loading.tsx` existe) ; `InventoryDetail.tsx:263` et `StepPhotos.tsx:31` passent par `MediaDropzone` sans `capture`, que seuls trois composants de `maintenance/` posent → les cinq points tiennent. Classement : V7, le second bouton photo et les squelettes sont du comportement visible et du design neufs ; `type="tel"`, `inputMode` et `dvh`, pris seuls, relèveraient de A4.

## Angle 9 — Pages publiques : SEO et partage

*Exploré le 2026-10-15 vers 1 h 45. Par lecture, et par `curl` en local et sur www.takussan.com
(15 requêtes au plus). La session a relu les deux 🔴 : `git rev-list` et `curl` refaits sur la
production.*

Correct (mesuré ou lu) :
- canoniques et `hreflang` absolus, avec `x-default` ;
- `noindex` sur les pages privées ;
- `robots.ts` ;
- 404 réel pour un slug inconnu ;
- bien retiré en 200 `noindex, follow`, par choix (TCK-598) ;
- `next/image` avec `sizes` et `priority` ;
- `alt` traduits ;
- `remotePatterns` R2 ;
- canonique propre malgré les `utm_*`.

### La production sert un build du 15 août : aucun des travaux SEO n'est en ligne
- Réf : P09.01
- Statut : retenu · à valider — V5 : la mise en ligne passe par la phase F (TCK-517), décidée par le porteur ; porteur (2026-10-15) : traité hors agents, dans la phase F (TCK-517)
- Gravité : 🔴 défaut avéré
- Où : `origin/master` à `fefe2c87` (2026-08-15), servi par Vercel (`docs/infra/frontend-deploiement.md:13`) ; `takussan-web/src/app/robots.ts` date du 2026-08-27 (TCK-431)
- Constat :
  - Sur www.takussan.com, `/robots.txt` et `/sitemap.xml` rendent **404** (mesuré à nouveau par la session).
  - `/fr` rend 404, et `/` rend 200 sans canonique, `hreflang` ni `og:*`.
  - `master` a **1 845 commits** de retard sur `dev`.
  - TCK-431 à 436 et 598 n'existent qu'en préproduction et en local. `docs/ardoise.md` ne dit pas que le SEO n'est pas en ligne.
- Piste : l'écrire dans l'ardoise et le rattacher à la phase F (TCK-517) ; à la bascule, soumettre le sitemap à la Search Console.
- Mesure (2026-10-15, 25820d04, mesureur) : `git log -1 origin/master` → `fefe2c87`, 2026-08-15 ; `git rev-list --count origin/master..origin/dev` → **1 885** (le constat disait 1 845) ; `git ls-tree origin/master` → ni `takussan-web/src/app/robots.ts` ni `sitemap.ts`, présents sur `origin/dev` ; `grep -i` de `seo`, `robots`, `sitemap`, `référencement` dans `docs/ardoise.md` et TCK-517 → rien. Les réponses HTTP de www.takussan.com n'ont **pas** été re-mesurées : la production est hors du poste. Retenu pour la partie établie par git. Classement : V5, la seule correction réelle est le déploiement de `master`, qui est la phase F ; l'ajout à l'ardoise en dépend.

### Les combinaisons de facettes sans résultat sont indexables (soft-404)
- Réf : P09.02
- Statut : fait · TCK-675
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/[locale]/(public)/properties/(liste)/page.tsx:47-55`, `takussan-web/src/lib/canonique.ts:284`
- Constat :
  - `/fr/properties?type=factory&contract_type=rent&city=Dakar` rend 200 avec `total: 0`, le titre « Usine à louer à Dakar », `index, follow` et une canonique vers elle-même (mesuré en local).
  - Chaque valeur de facette est validée seule, jamais leur combinaison : types × contrats × villes × quartiers × 3 langues donne autant de pages vides indexables.
  - `generateMetadata` ne pose aucun `robots` (relu). Les annuaires, eux, ont `facette.indexable` (`agencies/page.tsx:53`).
- Piste : `robots: { index: false, follow: true }` quand `total === 0`, en partageant le résultat de la recherche avec `generateMetadata` par `cache()`.
- Mesure (2026-10-15, 25820d04, mesureur) : relu `properties/(liste)/page.tsx:35-55` (`generateMetadata` ne rend que `title`, `description` et `alternates`, aucun `robots`), `(public)/layout.tsx:56` (`robots: { index: true, follow: true }` hérité) et `canonique.ts:284-316` (`filtresCanoniques` juge chaque clé seule contre son domaine, jamais la combinaison) ; `agencies/page.tsx:54` pose bien `noindex` si `!facette.indexable` ; lecture par tinker de la base de dev → 4 biens `factory`, tous en `rent`, à Saint-Louis, Touba et Kaolack : `type=factory&contract_type=rent&city=Dakar` rend donc 0 bien sous une canonique qui garde les trois facettes. Le rendu HTTP n'a pas été rejoué (front et API locaux arrêtés). Classement : V7, aucun ticket ni ADR n'écrit la règle « liste vide ⇒ `noindex` » pour les biens (TCK-433 et TCK-436 ne la posent que pour les valeurs hors domaine et les annuaires).
- Mesure (2026-10-16, b57126b7, implementeur) : relu `properties/(liste)/page.tsx` : `generateMetadata` ne posait toujours aucun `robots` ni ne lisait le total ; test neuf de `(liste)/__tests__/metadata.test.ts` à `total: 0` → `meta.robots` `undefined` (rouge) → `generateMetadata` lit la recherche de la page (même clef, même langue, partagée par `cache()`) et pose `noindex, follow` sur `total === 0`, rien sur un total positif ni sur une panne ; ablation (`vide = false`) → rouge, remis → 40 verts.

### Pas d'aperçu WhatsApp ou Facebook hors des fiches
- Réf : P09.03
- Statut : fait · TCK-759
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/[locale]/(public)/page.tsx:20-23`, `(public)/properties/(liste)/page.tsx:47`, `(public)/agencies/page.tsx:42`, `(public)/properties/[slug]/page.tsx:115-126`
- Constat :
  - `/fr` n'émet aucun `og:*` ni `twitter:*` : l'accueil, une ville ou un quartier partagés sur WhatsApp n'ont ni image ni description.
  - Aucun `opengraph-image`.
  - Sur la fiche manquent `og:url`, `og:locale`, `og:site_name` et les dimensions, et l'image vient de la conversion `preview` en 800×600 (mesuré pour `/fr` ; `og:image` d'une fiche avec photo à vérifier).
- Piste : un `opengraph-image` 1200×630, un `openGraph` par défaut dans le layout public, et une image par ville ou par quartier.
- Mesure (2026-10-15, 66ed4340, mesureur) : `find takussan-web/src/app -name 'opengraph-image*' -o -name 'twitter-image*'` → rien ; `(public)/page.tsx:20-23` ne rend que `alternates`, `(public)/layout.tsx:45-57` et `app/layout.tsx:57-63` aucun `openGraph` ; seules les fiches de bien, d'agence et d'agent en déclarent ; `properties/[slug]/page.tsx:115-126` pose `title`, `description`, `type` et `images` sans `url`, `locale`, `siteName` ni dimensions ; l'image vient de `main_photo_url`, soit la conversion `preview` (`PropertyResource.php:137`), `width(800)->height(600)` (`Property.php:779`) → tient. Aucune page n'a été rendue. Classement : V7, une image de partage 1200×630 et des textes par ville ou quartier sont un visuel et un texte neufs.
- Mesure (2026-10-17, 0785a29d, implementeur) : `find takussan-web/src/app -name 'opengraph-image*'` → rien ; `(public)/layout.tsx` ne rendait ni `openGraph` ni `twitter` ; test neuf `(public)/__tests__/apercu-de-partage.test.ts` → 5 rouges sur 5 → `openGraph` par défaut au layout (`website`, `siteName`, `og:locale` `fr_SN`/`en_US`/`wo_SN`, sans titre ni description, que Next reprend de la page) et `opengraph-image.tsx` 1200×630 rendu depuis le symbole du logo ; le test rend le PNG et lit ses dimensions. Ablation (layout et image retirés) → 5 rouges, remis → 5 verts. Aucune image par ville.

### JSON-LD de la fiche : prix sur le mauvais type, contrat et période absents
- Réf : P09.04
- Statut : fait · TCK-758
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/jsonld-property.ts:81,97,102`
- Constat :
  - `priceSpecification` est posé sur `Apartment`, `House` ou `Place`, alors qu'il appartient à `Offer`.
  - `contract_type` et `rent_period` ne sont pas émis : un loyer ressemble à un prix de vente.
  - Pour un terrain, un bureau ou un parking, `floorSize`, `numberOfBedrooms` et `yearBuilt` sont hors domaine (mesuré, lu). La devise XOF, elle, est bien présente.
- Piste : `RealEstateListing.offers` → `Offer { price, priceCurrency, businessFunction }`, plus un `UnitPriceSpecification` `unitCode: MON` pour la location.
- Mesure (2026-10-15, 66ed4340, mesureur) : relu `jsonld-property.ts:80-113` : `priceSpecification` est posé dans `mainEntity`, typé par `SOUS_TYPE_SCHEMA` (`:17-33`, `Apartment`, `House`, `Room`, `Accommodation` ou `Place`), aucun `offers`, ni `contract_type` ni `rent_period` émis ; `floorSize`, `numberOfBedrooms` et `yearBuilt` sont posés aussi sur `Place` (terrain, bureau, parking), où schema.org ne les définit pas ; `priceCurrency` vaut bien `XOF` par défaut → tient. Aucun validateur de données structurées n'a été lancé. Classement : V7, choisir `businessFunction` et le `unitCode` de chaque `rent_period` n'est écrit par aucun ticket ni ADR.
- Mesure (2026-10-17, 18c6141d, implementeur) : relu `jsonld-property.ts` : `priceSpecification` toujours sur le `mainEntity`, aucun `offers`, champs de logement posés sur `Place` ; 7 tests neufs de `jsonld-property.test.ts` rouges → tient. Correctif : `offers` = `Offer` (`Sell` ou `LeaseOut`, `UnitPriceSpecification` `DAY`/`WEE`/`MON`/`ANN`), plus de prix sur le bien, `Place` sans champ de logement (`numberOfBathroomsTotal` compris). Le test « jamais `Product`/`Offer` » de TCK-335 garde désormais `Product` seul. Ablation : fichier d'avant → 8 rouges ; remis → 22/22. Aucun validateur lancé.

### Chaque fiche a trois URL au contenu principal identique
- Réf : P09.05
- Statut : retenu · à valider — V6 : revenir sur l'indexation des trois langues demande un ADR ; porteur (2026-10-15) : plus tard, après la bascule
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/alternates.ts:172`, `takussan-web/src/i18n/routing.ts:252`
- Constat :
  - `/fr`, `/en` et `/wo` sont indexables, chacune canonique à elle-même, alors que le titre et la description ne sont saisis qu'en français : l'API ne traduit pas le contenu.
  - Le sitemap triple le volume (lu ; effet sur l'index à vérifier).
- Piste : un ADR qui tranche entre fiches `en`/`wo` indexables, ou canonique vers `fr` et retrait du sitemap.
- Mesure (2026-10-15, 66ed4340, mesureur) : relu `alternates.ts:172-185` (hreflang vers les trois langues de `LOCALES_INDEXABLES`), `routing.ts:252` (`LOCALES_INDEXABLES = LOCALES`) ; `grep translat\|title_en Property.php` → aucun champ traduit : titre et description sont ceux qu'on a saisis ; ADR-0026 § 4 décide que `wo` est indexable « dès maintenant » et § 1 la canonique par langue, sans parler du contenu saisi en une seule langue → tient. L'effet sur l'index n'a pas été mesuré, il est hors du poste. Classement : V6, la piste revient sur une décision d'ADR-0026.

### Tout le site public est rendu de façon dynamique
- Réf : P09.06
- Statut : retenu · à valider — V6 et V8 : sortir la session de la mise en page racine est une décision d'architecture, sur plusieurs tickets ; porteur (2026-10-15) : plus tard, après la bascule
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/layout.tsx:67`
- Constat : le layout racine lit `cookies()`, ce qui rend toute page publique dynamique, sans cache HTML. Chaque passage de robot refait le rendu complet (lu ; build courant à vérifier).
- Piste : sortir la session du rendu serveur de la coque publique, puis de l'ISR avec `revalidate` et des tags sur les fiches et les facettes.
- Mesure (2026-10-15, 77c482e1, mesureur) : relu `takussan-web/src/app/layout.tsx:66-80` (inchangé, l. 67 : `await cookies()`, puis `getMe()` quand un jeton ou une impersonation est présent) ; `npx next build` sur cet arbre (6 min 15, sortie 0) → **toutes** les pages de `[locale]` sont `ƒ (Dynamic)`, `/[locale]`, `/[locale]/properties` et `/[locale]/properties/[slug]` compris, et seuls `apple-icon.png`, `icon.svg`, `manifest.webmanifest`, `robots.txt` et `sitemap.xml` sont `○ (Static)`. Le constat tient pour le HTML. TCK-598 (done) a depuis mis en cache les **données** de la fiche (`public-property.ts:88`, `revalidate` et étiquette par slug) et des facettes (`facettes.ts:52,112,147`), et écrit que « l'ISR du HTML reste hors périmètre : c'est une limite d'architecture (la mise en page racine lit le cookie) ». Le robot repaie donc le rendu, pas l'appel de la fiche. Classement : V6 et V8, déplacer la session hors de la coque publique touche l'authentification de toutes les pages et TCK-598 l'a déjà renvoyé à une décision d'architecture.

### La bascule fera répondre 307 aux URL non préfixées déjà indexées
- Réf : P09.07
- Statut : retenu · à valider — V6 : revenir sur le 307 revient sur ADR-0026 § 3 ; porteur (2026-10-15) : traité hors agents, dans la phase F (TCK-517), 308 vers /fr
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/proxy.ts:161`
- Constat : le 307 avec `Vary: Cookie, Accept-Language` est délibéré (ADR-0026). Mais la production sert aujourd'hui `/properties` sans préfixe : tout l'index actuel passera par une redirection temporaire, et Googlebot finira sur `/fr` (mesuré, lu).
- Piste : le décider dans le plan de bascule, par exemple une 308 pour les robots, ou accepter le délai explicitement.
- Mesure (2026-10-15, 77c482e1, mesureur) : relu `takussan-web/src/proxy.ts:153-162` (inchangé : `NextResponse.redirect(url, 307)` puis `Vary: Cookie, Accept-Language`) et ADR-0026 § 3 et « Ce que ça coûte », qui écrit déjà le prix de la bascule (« des signaux d'indexation à reconstruire ») sans parler du plan de bascule ; `grep -rn '307\|308' docs/backlog/tickets/TCK-517*` → vide : le plan de bascule ne tranche pas la question. La production n'a pas été mesurée (sortir du poste est interdit au mesureur) : « la production sert `/properties` sans préfixe » reste à vérifier. Classement : V6, toute réponse autre qu'« accepter le délai » (308 pour les robots, par exemple) revient sur une décision d'ADR, et l'accepter est une décision du porteur.
- Mesure (2026-10-17, 2a2fc6e4, humain) : amendement d'ADR-0026 du 2026-10-17 écrit (option a) : 308 vers `/fr` à la phase F, après la migration des liens internes sans préfixe et le test qui la garde ; plan F2, étape 4.

### Petites améliorations
- Réf : P09.08
- Statut : validé — canonique propre à chaque page et `resumePourMeta()` ; au-delà de `last_page`, `robots: noindex` sur la page (le `loading.tsx` de la liste reste, le code reste 200) ; retirer `robots: index, follow` du layout public, valeur par défaut, pour lever la contradiction de la page introuvable ; reste : `generateSitemaps()`, reporté tant que le parc est loin de 16 600 biens
- Gravité : 🟢 amélioration
- Constat (lu ou mesuré en local) :
  - **Pagination** (`takussan-web/src/lib/canonique.ts:363`) : la canonique pointe toujours vers la page 1, et une page au-delà de `last_page` rend 200.
  - **Méta-descriptions** (`(public)/properties/[slug]/page.tsx:98-99`) : coupées au milieu d'un mot ; une description `""` échappe au `??`. La bio d'agent et la description d'agence passent entières. Les titres de fiche n'ont ni contrat ni prix.
  - **Sitemap** (`takussan-web/src/lib/queries/sitemap-catalogue.ts:43,54`, `takussan-web/src/lib/sitemap.ts:23`) : avec trois URL par fiche, le plafond de 50 000 tombe vers 16 600 biens, et `/sitemap.xml` tombe en entier. Mesuré en local : 1 011 `<loc>`.
  - **Page 404 d'une fiche** : elle porte `noindex` **et** `index, follow`, avec le titre de l'accueil.
  - **Doc périmée** : `takussan-web/CLAUDE.md:234` dit « sans segment `[locale]` », ce que contredit ADR-0026.
- Piste :
  - canonique propre à chaque page, et `notFound()` au-delà de `last_page` ;
  - un utilitaire `resumePourMeta()` ;
  - `generateSitemaps()` ;
  - des métadonnées propres aux `not-found` ;
  - corriger le paragraphe de `takussan-web/CLAUDE.md`.
- Mesure (2026-10-16, ddb5f050, mesureur) : lu `canonique.ts:358-378` (`cheminCanoniqueDeLaListe` retire `page` ; son docblock : `page=3` → `/properties?type=villa`) ; `(public)/properties/(liste)/page.tsx` n'appelle jamais `notFound()` et ne lit pas `last_page` ; `properties/[slug]/page.tsx:98-99` : `property.description?.slice(0, 160) ?? …`, donc une chaîne vide passe le `??` et la coupe tombe au caractère ; `sitemap.ts:23-31,313` lève au-delà de 50 000 `<url>` et `generateSitemaps` n'est cité qu'en commentaire ; `properties/[slug]/not-found.tsx` n'exporte aucune métadonnée, sous `(public)/layout.tsx:56` en `index: true, follow: true` ; `takussan-web/CLAUDE.md:234` dit « sans segment `[locale]` dans l'URL » alors que les pages vivent sous `src/app/[locale]/` → tout tient en lecture ; le double `noindex`/`index, follow` rendu et les 1 011 `<loc>` n'ont pas été remesurés (application non lancée). Classement : V7, canonique par page, `notFound()` au-delà de la dernière page et contenu des titres changent ce que voient les moteurs, et la correction du document est dans un `CLAUDE.md`.
- Mesure (2026-10-16, 55a41109, humain) : le reste documentaire est fait en session (TCK-722) : `takussan-web/CLAUDE.md` décrit le segment `[locale]` d'ADR-0026 ; reste la partie code, à l'implémenteur.
- Mesure (2026-10-17, 0785a29d, implementeur) : les cinq constats tiennent en lecture (`cheminCanoniqueDeLaListe` retire toujours `page`, `(liste)/page.tsx` sans `notFound()`, `description?.slice(0, 160)` sur la fiche, `robots.ts:38` et `sitemap.ts` sans `generateSitemaps`, `properties/[slug]/not-found.tsx` sans métadonnée), mais le correctif dépasse M : (1) `notFound()` au-delà de `last_page` rendrait **200**, car `(liste)/loading.tsx` est une frontière de suspension au-dessus de la page, gardée par `pas-de-frontiere-de-suspension.test.ts:385-390`, et le 404 du site public ne vient que du corps de page hors de toute frontière (mesure du 2026-08-28 écrite dans `agencies/[slug]/page.tsx`) : servir un vrai 404 demande de déplacer ou retirer ce `loading.tsx` ; (2) un `not-found.tsx` de segment n'accepte ni `metadata` ni `generateMetadata` (la doc de Next 16, `not-found.md:185`, ne les ouvre qu'à `global-not-found.js`, derrière `experimental.globalNotFound`) : corriger le titre et le double `robots` passe par ce drapeau ou par le retrait du `robots` explicite du layout public, deux choix ; (3) `generateSitemaps()` sert `/sitemap/<id>.xml` et plus `/sitemap.xml` (`generate-sitemaps.md:20`), que `robots.ts:38` déclare : il faut un index écrit à la main et l'URL publique change. Restent S chacun : la canonique par page et `resumePourMeta()`. Classement : V8, à découper en tickets ; les choix (1) à (3) reviennent au porteur.

## Angle 10 — Médias : tailles, conversions, disques, nettoyage

Les deux 🔴 ont été relus par la session dans le code : le `catch` de `PropertyMediaController::store`, `FileAdder::processMediaItem` (la ligne est enregistrée avant la copie et la conversion), et l'absence de toute règle `dimensions:` dans `app/Http`.

### Un lot de photos qui échoue laisse le média raté attaché au bien
- Réf : P10.01
- Statut : fait · TCK-676
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Controllers/Api/PropertyMediaController.php:39-49`
- Constat :
  - `$media` n'est affecté que si `toMediaCollection()` réussit. Dans le `catch`, il vaut donc toujours `null`, et `$media?->delete()` ne fait rien.
  - Or Spatie a déjà enregistré la ligne (`FileAdder.php:605`, `$model->media()->save($media)`) et copié l'original avant de lancer la miniature synchrone.
  - Une image que GD ne décode pas laisse donc une ligne `photos` sans miniature : une case vide dans la galerie, et l'original sur le seau privé.
  - Le lot n'est pas atomique : les photos 1 à k restent alors que la réponse est un 422. Renvoyer le lot crée des doublons.
  - Le répertoire temporaire de conversion, qui contient une copie de l'original privé, n'est supprimé qu'en cas de succès. Il s'accumule dans `storage/media-library/temp`.
  - Aucun test ne couvre `photo_unprocessable`.
  - Établi comment : lu, chemin vendor suivi.
- Piste : retrouver et supprimer le média raté par `$property->media()->latest('id')`, ou convertir après une transaction. Rendre le lot tout-ou-rien, ou renvoyer un résultat photo par photo. Ajouter un test avec un PNG corrompu.
- Mesure (2026-10-15, 25820d04, mesureur) : relu `PropertyMediaController.php:34-58` (inchangé : `$media = null`, puis `$media?->delete()` dans le `catch`) et `FileAdder.php:605` (`$model->media()->save($media)` avant la copie et les conversions) ; test Feature temporaire (retiré) : un lot `good.jpg` + un PNG tronqué (en-tête valide, corps à zéro) → **422** `photo_unprocessable`, et `getMedia('photos')` en compte **2**, `broken.png` compris. Le test existant `test_corrupted_image_is_rejected_without_persisting_media` ne voit pas le défaut : son faux PNG échoue à la règle `image` et n'atteint jamais le `catch`. Le répertoire temporaire de conversion n'a pas été mesuré. Classement : V7 ; supprimer le média raté relèverait d'A1 (le nom du test existant l'écrit), mais la piste demande aussi de choisir entre un lot atomique et un résultat par photo, ce qui change la réponse vue par l'écran.
- Mesure (2026-10-16, 9c6918fa, implementeur) : test `PropertyMediaTest::test_photo_that_fails_conversion_is_removed_and_listed_while_the_others_stay` (lot `good.jpg`, PNG à en-tête valide et corps à zéro, `after.jpg`) → avant correctif, 422 sur la seule clé `photos` et le premier échec arrêtait le lot ; après, 422 sur `photos.1` seule, le bien garde `good.jpg` et `after.jpg`, et le répertoire temporaire de conversion est vide. Ablation, une pièce à la fois : sans la suppression par `uuid`, `broken.png` reste ; sans la suppression du parent temporaire, un répertoire reste ; avec `break` au lieu de `continue`, `after.jpg` manque. Les trois sont rouges, et le test repasse au vert une fois le correctif remis.

### Aucune borne de dimensions : une bombe de décompression tue la requête
- Réf : P10.02
- Statut : fait · TCK-677
- Gravité : 🔴 défaut avéré (OOM calculé, non mesuré)
- Où : `takussan-api/app/Http/Requests/Api/StorePropertyMediaRequest.php:37`, `takussan-api/app/Http/Requests/Auth/UpdateProfileRequest.php:50`, `takussan-api/app/Models/Property.php:778`, `takussan-api/app/Models/Concerns/HasMediaConversions.php:26-28`, `takussan-api/docker/php.ini:3`
- Constat :
  - Aucune règle `dimensions:` dans `app/Http` (grep vide).
  - La miniature est synchrone (`nonQueued`) pour les photos de bien comme pour les avatars. GD décode l'image entière, à environ 4 octets par pixel.
  - Un PNG uni de 20 000 × 20 000 pèse quelques Ko : il passe `max:10240`, puis demande environ 1,6 Go contre `memory_limit = 256M`.
  - Le résultat est une erreur fatale que le `catch` ne rattrape pas : 500, ligne orpheline, copie temporaire laissée. Pour un avatar, il suffit d'un compte inscrit.
  - Une photo de téléphone de 48 Mpx (≈ 192 Mo décodés) frôle déjà le plafond.
  - Établi comment : lu, mémoire estimée par calcul.
- Piste : refuser au-delà d'un nombre de pixels donné (`dimensions:max_width=…,max_height=…`, ou `getimagesize` sans décoder) avant `addMedia`.
- Mesure (2026-10-15, 25820d04, mesureur) : `grep -rn 'dimensions:' app/Http` → vide ; relu `StorePropertyMediaRequest.php:37` (`max:10240`), `UpdateProfileRequest.php:50` (`avatar` : `image`, `max:2048`), `Property.php:778` et `HasMediaConversions.php:26-28` (`thumbnail` en `nonQueued`), `config/media-library.php:229` (pilote `gd`) ; mesuré en CLI : un PNG uni de 9 000 × 9 000 pèse **237 Ko**, et `imagecreatefrompng` + `imagescale` sous `memory_limit=256M` **réussit** avec un pic PHP de 2 Mo et un RSS de **715 Mo** (`/usr/bin/time -l`). Le constat est inexact sur le mécanisme : GD alloue hors du gestionnaire de mémoire de PHP, `memory_limit` ne l'arrête pas, et il n'y a pas d'erreur fatale ; le risque réel est la mémoire du conteneur (≈ 8,8 o/pixel mesurés, soit plusieurs Go pour 20 000 × 20 000), non mesurée ici. Classement : V7, choisir le plafond (une photo de téléphone de 48 Mpx doit passer) décide quelles images sont refusées.
- Mesure (2026-10-16, e5a71ad8, implementeur) : avant correctif, un PNG réduit à son en-tête annonçant 9 000 × 9 000 passait la validation de `POST /api/properties/{id}/media` (l'échec venait de GD, en `photo_unprocessable`) et rendait **500** sur `PUT /api/auth/profile` (« gd-png: fatal libpng error ») → règle `PixelsAuPlus` (`getimagesize`, refus au-delà de 20 000 000 pixels, message `validation.dimensions`) sur `photos.*` et `avatar` ; 8 tests (`PixelsAuPlusTest`, `PropertyMediaTest`, `AuthProfileTest`) verts ; ablation : règle retirée des deux FormRequests → 2 rouges, `>` changé en `>=` → 1 rouge, remis → verts.

### Les limites de taille, couche par couche, ne laissent pas passer 20 photos
- Réf : P10.03
- Statut : fait · TCK-673
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/media/MediaManager.tsx:78-79`, `takussan-web/src/components/property-dashboard/PropertyMediaPanel.tsx:70`, `takussan-api/docker/Caddyfile:22-31`, `takussan-api/docker/php.ini:5-6`, `takussan-api/config/media-library.php:55`
- Constat : l'interface annonce 20 fichiers de 10 Mo et les envoie en une seule requête. Côté API, les couches se succèdent ainsi :
  - Caddy : 413 au-delà de 25 MiB ;
  - PHP : `post_max_size` 26M ;
  - `max_file_uploads` : non fixé, donc 20 par défaut. Un 21e fichier est ignoré en silence ;
  - FormRequest : aucune borne sur le nombre de fichiers.

  Même réduites à 2560 px (environ 1 à 2 Mo chacune, estimé), 20 photos dépassent 25 MiB et reçoivent un 413 sans corps JSON. Le proxy Traefik n'a pas été mesuré.
  Établi comment : lu ; la valeur par défaut de `max_file_uploads` est mesurée en local.
- Piste : une requête par photo, ou des paquets bornés à moins de 25 MiB. Fixer `max_file_uploads` explicitement et ajouter `photos` `max:20`.
- Mesure (2026-10-15, 77c482e1, mesureur) : relu `MediaManager.tsx:78-79` (`DEFAULT_MAX_SIZE` 10 Mo, `DEFAULT_MAX_FILES` 20), `PropertyMediaPanel.tsx:69-71` (tout le lot dans une seule `FormData`, envoyée à `uploadPropertyPhotosAction`), `dashboard-properties.ts:243-256` puis `properties-server.ts:309-322` (une seule requête `photos[]` vers l'API), `docker/Caddyfile` (`request_body max_size 25MiB`, et 413 sur `Content-Length` > 26214400), `docker/php.ini` (`upload_max_filesize 25M`, `post_max_size 26M`, `max_file_uploads` non fixé), `StorePropertyMediaRequest.php:36` (`photos` : `required`, `array`, sans `max`) ; mesuré `ini_get('max_file_uploads')` en CLI → `20`. Les couches de l'API sont telles que décrites. Le lot n'atteint d'ailleurs pas l'API au-delà de 1 Mo : il passe d'abord par une server action sans `serverActions.bodySizeLimit` (`node_modules/next/dist/server/app-render/action-handler.js:517-519`, 413 « Body exceeded 1 MB »), ce que porte déjà P08.01. Classement : V5 et V7, fixer `max_file_uploads` touche `takussan-api/docker/`, et découper l'envoi change le comportement de l'écran ; à traiter avec P08.01, qui choisit la voie d'envoi.
- Mesure (2026-10-16, b57126b7, implementeur) : reproduit avant correctif : `POST /api/properties/{id}/media` avec 21 photos rendait 201, et `docker/php.ini` ne fixait pas `max_file_uploads` → `PropertyMediaTest` (21 photos → 422 sur `photos`, aucun média ; `max_file_uploads = 20` lu dans `docker/php.ini`) ; ablation → 2 rouges, remis → verts. L'envoi photo par photo vient de P08.01, même ticket.

### `media:cleanup` détruit les médias des modèles supprimés en douceur
- Réf : P10.04
- Statut : fait · TCK-750 — reste : la requête par média de `media:cleanup` (une lecture du modèle par ligne, sur tout le parc, chaque nuit)
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Console/Commands/MediaCleanup.php:28-60`, `takussan-api/routes/console.php:67`, `takussan-api/app/Services/Property/PropertyModerationService.php:175`
- Constat :
  - « Orphelin » est jugé par `exists()` à travers la portée qui exclut les modèles supprimés en douceur.
  - Le délai de 24 h porte sur l'âge du média, pas sur la date de suppression : les photos d'un bien supprimé la veille sont détruites définitivement à 03:00, conversions R2 comprises.
  - Une annonce retirée sur signalement perd ses preuves sous 24 h.
  - Le même chemin contournerait `isLockedEvidence` le jour où un bail serait supprimé en douceur.
  - La commande fait une requête par média, sur tout le parc, chaque nuit.
  - Établi comment : lu.
- Piste : traiter `withTrashed()` comme non orphelin, ou purger après `deleted_at` + délai de rétention ; exclure les collections de preuve.
- Mesure (2026-10-15, 77c482e1, mesureur) : relu `MediaCleanup.php:23-60` (inchangé depuis TCK-050, `git log` : 2 commits ; `isOrphan()` fait `$type::query()->whereKey($id)->exists()`, et son commentaire dit « soft-deleted targets count as orphans (per ticket spec) », ce que TCK-050 écrit l. 96) et `routes/console.php:67` (`dailyAt('03:00')`) ; test Feature temporaire (retiré) : un `Property` avec une photo datée de 2 jours, supprimé en douceur, puis `media:cleanup` → **0** média restant, en 3 requêtes pour un média. `Lease` porte déjà `SoftDeletes` (`Lease.php:28`) : le constat dit « le jour où un bail serait supprimé en douceur », mais aucun `->delete()` de bail n'a été trouvé dans `app/` (grep), donc le chemin reste théorique pour les baux. La requête par média tient (une `exists()` par ligne, lu). Classement : V3, garder les médias d'un bien supprimé, et pour combien de temps, est un choix de conservation qui contredit la règle écrite par TCK-050.
- Mesure (2026-10-17, d2f24b2c, implementeur) : `MediaCleanupTest` avant correctif → 2 rouges sur 7 : la photo d'un bien supprimé en douceur 89 jours plus tôt est purgée (0 média), et `signed_contract` et `room_photos` d'un bail et d'un état des lieux signé supprimés partent aussi → `isOrphan()` lit le modèle `withTrashed()`, purge après `deleted_at` + 90 jours, preuves de TCK-596 exclues ; ablation (commande d'avant remise) → les 2 mêmes rouges, exclusion des preuves retirée seule → 1 rouge ; remis → 7/7 verts.

### Avatars : l'original public garde l'EXIF, GPS compris
- Réf : P10.05
- Statut : fait · TCK-762
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Models/User.php:405`, `takussan-api/app/Http/Controllers/Api/Auth/AuthController.php:210-213`, `takussan-web/src/lib/reduire-photo.ts:10`, `takussan-api/app/Http/Resources/UserResource.php:37`
- Constat :
  - L'avatar vit sur le disque public et il est servi en original, pages publiques d'agent comprises.
  - Ni le serveur ni le front ne retirent les métadonnées sous 2560 px : un selfie, ou un appel direct à l'API, publie sa position GPS.
  - Les photos de bien ne fuient pas : l'original est privé, et les conversions GD ne recopient pas l'EXIF.
  - Établi comment : lu.
- Piste : servir une conversion carrée réencodée et garder l'original privé, ou retirer l'EXIF à l'upload.
- Mesure (2026-10-15, 77c482e1, mesureur) : relu `User.php:404` (collection `avatar` sur le disque public), `AuthController.php:209-213` (`addMediaFromRequest('avatar')`, aucun traitement), `UserResource.php:37` (`getFirstMediaUrl('avatar')`, l'original), et les mêmes URL d'original dans `PublicAgentController.php:180`, `PublicPropertyController.php:1066`, `PropertyResource.php:411` ; test Feature temporaire (retiré) : un JPEG portant un segment EXIF avec `GPSLatitudeRef = N`, envoyé à `PUT /api/auth/profile` → 200, média sur le disque `public`, URL `/storage/1/selfie.jpg`, et `exif_read_data` du fichier stocké rend toujours `GPSLatitudeRef = "N"`. Les trois conversions (`full`, `preview`, `thumbnail`) sont produites et rien ne les sert. Le front ne réencode que l'image au-delà de 2 560 px (`reduire-photo.ts:1-22`). Classement : V3, la piste change ce qui est exposé d'une donnée personnelle, et le choix entre conversion servie et retrait de l'EXIF reste ouvert.
- Mesure (2026-10-17, 7ff3ee356, implementeur) : `AuthProfileTest` avant correctif → 2 rouges : un JPEG portant `GPSLatitudeRef = N` et `Orientation = 6`, envoyé à `PUT /api/auth/profile`, est rangé avec son EXIF, et `avatar_url` vise l'original → `AvatarReencode` (décodage et réencodage GD, orientation appliquée aux pixels) et `User::avatarUrl()` (la miniature, sinon `null`), repris par les huit appelants ; ablation : contrôleur d'avant → le test EXIF rougit, `UserResource` d'avant → le test d'URL rougit, `MessagingContactResource` d'avant → la garde `AvatarServiEnMiniatureTest` rougit ; remis → verts, 75 tests des classes qui rendent un avatar verts. Les originaux déjà déposés gardent leur EXIF (hors périmètre, V4).

### La règle `image` seule accepte le HEIC, que la chaîne ne sait pas traiter
- Réf : P10.06
- Statut : fait · TCK-751
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Requests/Api/UploadRoomPhotosInventoryRequest.php:39`, `takussan-api/app/Http/Requests/Auth/UpdateProfileRequest.php:50`, `takussan-api/app/Services/Media/PdfImageEmbedder.php:30,112`
- Constat :
  - Laravel 13 accepte `heic` et `heif` sous `image`, mais GD ne les décode pas.
  - Une photo d'état des lieux en HEIC est acceptée, figée dans l'empreinte, et manque en silence au PDF contractuel.
  - Un avatar HEIC est servi brut, sans miniature.
  - Le front se limite à jpeg/png/webp : l'exposition passe par l'API directe ou par un poste Mac.
  - Le SVG est refusé partout.
  - Établi comment : lu.
- Piste : `mimes:jpg,jpeg,png,webp` sur ces deux règles, ou une conversion du HEIC à l'entrée.
- Mesure (2026-10-15, 77c482e1, mesureur) : relu `UploadRoomPhotosInventoryRequest.php:39` (`required`, `image`, `max:5120`), `UpdateProfileRequest.php:50` (`nullable`, `image`, `max:2048`), `vendor/…/ValidatesAttributes.php:1533` (`heic`, `heif` dans la liste de `image`), `PdfImageEmbedder.php:30,108-116` (rend `null` hors jpeg, png, webp, gif) ; mesuré `function_exists('imagecreatefromheif')` → `false` et `gd_info()` sans prise en charge HEIF ; HEIC réel produit par `sips -s format heic` (finfo : `image/heic`), puis test Feature temporaire (retiré) : la règle de l'état des lieux **passe**, et `PUT /api/auth/profile` avec ce fichier → 200, média `image/heic` sur le disque public, `generated_conversions` vide, `avatar_url` = l'original `.heic`. L'absence au PDF de l'état des lieux est déduite de `PdfImageEmbedder::encode`, non rejouée. Classement : V7, la piste laisse ouvert le choix entre refuser le HEIC (`mimes:`) et le convertir à l'entrée, et un refus change ce qu'un utilisateur de l'API peut envoyer.
- Mesure (2026-10-17, d2f24b2c, implementeur) : HEIC réduit à sa boîte `ftyp` (finfo → `image/heic`, `image` passe, `mimes:jpg,jpeg,png,webp` échoue, mesuré par tinker) ; `InventoryRoomPhotosTest` et `AuthProfileTest` avant correctif → 2 rouges, 200 au lieu de 422 → `mimes:jpg,jpeg,png,webp` sur les deux règles ; ablation (FormRequests d'avant remis) → les 2 mêmes rouges ; remis → 34/34 verts, 78 tests des classes voisines verts.

### Collection `documents` : 25 Mo validés, 10 Mo acceptés par Spatie
- Réf : P10.07
- Statut : fait · TCK-763
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Requests/MediaUploadRequest.php:16`, `takussan-api/app/Http/Requests/GenericMediaUploadRequest.php:19`, `takussan-api/config/media-library.php:55`
- Constat : un fichier de 10 à 25 Mo passe la validation, puis Spatie lève `FileIsTooBig`. Aucun gestionnaire ne le traduit, et la réponse est un 500 (lu).
- Piste : aligner les deux plafonds, et traduire `FileCannotBeAdded` en 422.
- Mesure (2026-10-15, 77c482e1, mesureur) : relu `MediaUploadRequest.php:16` et `GenericMediaUploadRequest.php:19` (`MAX_DOCUMENT_KB = 25 * 1024`), `config/media-library.php:55` (`max_file_size` 10 Mo) ; `grep -rn 'FileIsTooBig\|FileCannotBeAdded' app bootstrap config` → vide ; test Feature temporaire (retiré) : un PDF réel de 15 Mo, collection `documents`, sur `POST /api/media` et sur `POST /api/media/upload` → **500** sur les deux, message de Spatie « has a size of 15 MB which is greater than the maximum ». Le seul appelant du front (`agencies.ts:144`) envoie un logo, pas un document. Classement : V9, aligner les plafonds demande de choisir entre baisser la validation à 10 Mo et monter le plafond global de Spatie à 25 Mo, qui vaut pour toutes les collections ; la traduction de `FileCannotBeAdded` en 422, seule, serait A1.
- Mesure (2026-10-17, 7ff3ee356, implementeur) : `MediaUploadTest` avant correctif → 2 rouges en 500 (`FileIsTooBig`) : un PDF réel de 15 Mo dans `documents`, et un PDF de 200 Ko sous un plafond de médiathèque abaissé à 100 Ko → `MAX_DOCUMENT_KB` = 10 Mo dans les deux FormRequests, et `FileCannotBeAdded` rendu en 422 `media.file_rejected` par `bootstrap/app.php` ; ablation : FormRequest d'avant → le premier rougit, `bootstrap/app.php` d'avant → le second ; remis → 12/12 verts.

### `POST /api/media/upload` : un point d'écriture mort et ouvert
- Réf : P10.08
- Statut : fait · TCK-764 — reste : limiter les conversions de `User` aux collections affichées (`performOnCollections`)
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/routes/api/media.php:12`, `takussan-api/app/Http/Controllers/Api/MediaController.php:70-93`
- Constat :
  - Aucun appelant dans le front (grep).
  - Tout compte peut y déposer 30 fichiers par minute dans `User.photos` ou `User.documents`, et rien ne les lit ni ne les nettoie.
  - `HasMediaConversions` produit trois conversions pour chaque image de `User`, avatar compris, sans que rien ne les serve : des écritures R2 de classe A pour rien.
  - Établi comment : lu.
- Piste : retirer la route ; limiter les conversions aux collections affichées (`performOnCollections`).
- Mesure (2026-10-15, 77c482e1, mesureur) : relu `routes/api/media.php:12-14` (route `media.upload`, `throttle:30,1`) et `MediaController.php:70-93` (attache le fichier à l'appelant, collection `photos` par défaut) ; `grep -rn 'media/upload\|media.upload' takussan-web/src takussan-api/app takussan-api/routes` → aucun appelant (seul un commentaire de `User.php:403`) ; seuls `tests/Feature/Media/MediaGenericUploadTest.php` et `MediaDiskPrivatePhotosTest.php` l'appellent ; aucune lecture de `User.photos` ni de `User.documents` dans `app/` (grep). Les trois conversions sur chaque image de `User`, avatar compris, sont mesurées sous P10.05 (`generated_conversions` = `full`, `preview`, `thumbnail`), et aucune ressource ne sert une conversion d'avatar (grep `getFirstMediaUrl('avatar'` : l'original partout). La route avait été demandée par TCK-016, sans écran pour l'appeler, et `docs/features.md` ne la cite pas. Classement : A3 pour le seul retrait de la route sans appelant ; la partie « conversions » est laissée à P10.05, qui choisit ce que l'avatar sert.
- Mesure (2026-10-17, 7ff3ee356, implementeur) : `git grep` de `media/upload`, `media.upload` et `GenericMediaUploadRequest` → aucun appelant hors des tests et d'un commentaire ; un cas de garde avant correctif → 1 rouge, la route existe et un envoi crée un média → route, `MediaController::upload()` et `GenericMediaUploadRequest` retirés, `MediaGenericUploadTest` réécrit pour garder le retrait, les deux cas de disque de `MediaDiskPrivatePhotosTest` passés sur `POST /api/media` ; ablation (les trois remis) → le même rouge ; retirés → vert.

### Réordonner les photos change leurs URL
- Réf : P10.09
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/PropertyMediaController.php:122`, `takussan-api/config/media-library.php:160`
- Constat : `update(['order_column'])` touche `updated_at`, or `version_urls` construit `?v=<updated_at>`. Chaque déplacement crée donc un défaut de cache, et de nouvelles transformations Cloudflare pour ce qui passe encore par elles (lu).
- Piste : mettre à jour `order_column` sans toucher aux horodatages, ou versionner sur un champ dédié.
- Mesure (2026-10-15, 4e9acdd7, mesureur) : `PropertyMediaController.php:122` (`->update(['order_column' => …])`) et `config/media-library.php:160` (`version_urls`) relus ; `BaseUrlGenerator` de spatie suffixe `?v=<updated_at>` ; test temporaire retiré : deux photos téléversées, horloge avancée de 5 min, `PUT /api/properties/{id}/media/reorder` → l'URL de la première passe de `/storage/1/a.jpg?v=1792087464` à `?v=1792087765`, fichier inchangé. Le constat tient. Classement : A2, poser `order_column` sans toucher `updated_at` ne change ni le contenu ni l'ordre rendus, seulement la stabilité du cache ; aucun choix de produit.

### Petites améliorations
- Réf : P10.10
- Statut : retenu · à valider — V5 : paquets de l'image de l'API et options de `next/image` en production ; porteur (2026-10-16) : traité hors agents, avec le déploiement ; consigné dans TCK-720
- Gravité : 🟢 amélioration
- Constat (lu) :
  - **Optimiseurs** (`config/media-library.php:167-205`) : ils sont configurés, mais ni `jpegoptim`, ni `cwebp`, ni `avifenc` ne sont installés dans l'image (`Dockerfile:20`). Spatie les saute en silence, et le commentaire `--strip-all` laisse croire que l'EXIF est retiré.
  - **`next/image`** (`takussan-web/next.config.ts:113-166`) : `dangerouslyAllowSVG` et `dangerouslyAllowLocalIP` sont actifs en production, sans `contentSecurityPolicy`. Le commentaire de `deviceSizes` cite `preview` 800 px comme plus grande image, alors que c'est `full` 1600 px. Des avatars jusqu'à 2560 px sont affichés en 32 à 64 px.
  - **Fichiers privés** : rien n'est rangé au mauvais endroit (KYC, baux, documents, états des lieux : disque privé). L'URL présignée dure 5 min, l'URL d'API signée 30 min. Reste à vérifier : la signature apparaît-elle dans le journal Traefik ?
- Piste : installer les binaires ou retirer le bloc ; couper les deux options `dangerously*` hors développement ; servir l'avatar en conversion.
- Mesure (2026-10-16, ddb5f050, mesureur) : lu `config/media-library.php:167-205` (Jpegoptim avec `--strip-all`, Pngquant, Optipng, Svgo, Gifsicle, Cwebp, Avifenc) ; `grep -rn 'jpegoptim|cwebp|avifenc|optipng|pngquant'` dans `takussan-api/Dockerfile` et `deploy/` → rien, et `Dockerfile:20` n'installe que des extensions PHP ; `next.config.ts:161-162` : `dangerouslyAllowSVG` et `dangerouslyAllowLocalIP` à `true` sans condition d'environnement ni `contentSecurityPolicy` ; les commentaires de `next.config.ts:110-145` tiennent `preview` 800 px pour le plafond, quand `Property.php:762-786` déclare une conversion `full` à 1600 px → les deux premiers points tiennent ; la signature dans le journal Traefik n'est pas mesurable depuis le poste (préproduction hors d'atteinte), et la taille des avatars n'a pas été remesurée. Classement : V5, installer des binaires dans l'image ou changer la configuration d'images servie en production relève du déploiement, et retirer le bloc d'optimiseurs est un choix (V6).

Angles voisins : mémoire et `--timeout` de `worker-media` face aux originaux de 48 Mpx ; contenu réel de `storage/media-library/temp` en préproduction ; facture Transformations et R2 au tableau de bord Cloudflare.

## Angle 11 — Notifications : doublons, préférences, échecs

Les trois 🔴 ont été relus par la session dans le code :
- `AuthController::register` crée l'utilisateur sans `preferred_language`, et `NotificationService.php:89` lit `preferredLocale()` ;
- `AgentInvitationService.php:84` appelle `send()` depuis son propre `DB::transaction`, et `InvitationMailable` n'implémente pas `ShouldQueue` ;
- `SmsRouterDriver::deferAll()` (l. 214) remet le texte rendu à `SendDeferredSmsJob`, qui n'implémente que `ShouldQueue`.

### Les comptes inscrits par e-mail reçoivent tout en français, quelle que soit leur langue
- Réf : P11.01
- Statut : fait · TCK-689
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/actions/locale.ts:41`, `takussan-api/app/Http/Requests/Api/Me/UpdateMeRequest.php:35`, `takussan-api/app/Http/Controllers/Api/Auth/AuthController.php:33`, `takussan-api/database/migrations/2026_04_15_210400_add_fields_to_users_table.php:28`, `takussan-api/app/Services/Model/NotificationService.php:89`
- Constat : c'est la conséquence visible du 🔴 de l'angle 6.
  - Le sélecteur de langue écrit par `PATCH /api/users/me`, une route absente (mesuré par `route:list`), et le 404 est avalé par un `catch {}` vide.
  - `PATCH /api/me` n'accepte que `city`, `search_intent` et `entry_intent`.
  - L'inscription n'écrit pas `preferred_language`, qui prend donc le défaut `'fr'`.
  - `send()` fixe donc `->locale('fr')` : e-mails, SMS et WhatsApp partent en français pour tout compte inscrit par e-mail.
  - Seuls la connexion par téléphone (`PhoneLoginService.php:171`) et le provisionnement écrivent la colonne.
  - Établi comment : lu, route mesurée.
- Piste :
  - accepter `preferred_language` dans `UpdateMeRequest` et corriger le chemin côté front ;
  - écrire la langue négociée à l'inscription ;
  - un test bout en bout : changer de langue, puis vérifier la langue d'un `CodedNotification`.
- Mesure (2026-10-15, 25820d04, mesureur) : relu `actions/locale.ts:41` (`PATCH /api/users/me`, erreur avalée), `UpdateMeRequest.php:35` (`PREFERENCE_FIELDS = ['city', 'search_intent', 'entry_intent']`), `AuthController.php:32-37` (inscription sans `preferred_language`) et `NotificationService.php:89` (`preferredLocale() ?? config('app.locale')`) ; `route:list --path=api/users/me` → aucune route ; test Feature temporaire (retiré) : inscription avec `Accept-Language: en` → 201 et `preferred_language = fr` ; `PATCH /api/users/me` → **404** ; `PATCH /api/me {preferred_language: en}` → 200 et la colonne reste `fr`. TCK-550 avait relevé le même écart et l'avait laissé « à ouvrir en ticket ». Classement : A1, TCK-017 écrit que le sélecteur persiste la langue dans `preferred_language` par l'appel que le front fait déjà ; corriger, c'est ajouter `preferred_language` (`fr`, `en`, `wo`) aux préférences de `PATCH /api/me`, faire viser `/api/me` à `setLocaleAction`, et écrire à l'inscription la langue résolue par `SetLocaleMiddleware`, comme `PhoneLoginService.php:171` le fait déjà.
- Mesure (2026-10-16, 1945dbf8, implementeur) : relu `UpdateMeRequest.php` (règle `preferred_language`), `MeController.php:68` et `actions/locale.ts` (`/api/me`) : les deux premiers volets sont livrés par TCK-655 ; `AuthController::register()` n'écrit toujours pas la colonne, mesuré par `AuthRegistrationTest` : inscription sous `Accept-Language: en` puis `wo` → `preferred_language = fr`, et une `CodedNotification` part en `fr` → correctif : `register()` écrit `app()->getLocale()` ; 13 verts ; ablation (ligne retirée) → 3 rouges (`en`, `wo`, bout en bout), remise → 13 verts.

### Le courriel d'invitation part à l'intérieur de la transaction de l'appelant
- Réf : P11.02
- Statut : fait · TCK-690
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Invitation/AgentInvitationService.php:84,99`, `OwnerInvitationService.php:96`, `ServiceProviderInvitationService.php:151`, `InvitationService.php:232-238`
- Constat :
  - `InvitationService::send()` déclare envoyer le courriel « intentionally outside the DB transaction ».
  - Mais ses trois appelants l'appellent depuis leur propre `DB::transaction`, et `deliver()` fait un `Mail::send` synchrone.
  - Une panne du transport (la préproduction a relevé 35 échecs Resend) annule le profil et l'invitation, puis rend un 500.
  - À l'inverse, un échec survenu après l'envoi laisse un e-mail dont le jeton ne pointe plus vers rien.
  - Établi comment : lu, et mesuré par l'agent avec une sonde tokenizer.
- Piste : `DB::afterCommit(fn () => $this->deliver(...))`, ou un mailable mis en file avec `afterCommit()`.
- Mesure (2026-10-15, 25820d04, mesureur) : relu `InvitationService.php:228-235` (commentaire : l'envoi est « intentionally *outside* the DB transaction » pour qu'une panne SMTP n'annule pas l'invitation) et `deliver()` (`:940-947`, `Mail::…->send()` synchrone, `InvitationMailable` sans `ShouldQueue`), et les appels depuis `DB::transaction` à `AgentInvitationService.php:84,99`, `OwnerInvitationService.php:78,96`, `ServiceProviderInvitationService.php:98,151` ; test Feature temporaire (retiré) sur `POST /api/agencies/{id}/agents/invite` en `agency_admin` : transport qui lève `TransportException` → **500**, 0 invitation et 0 profil `Draft` ; témoin avec `Mail::fake()` → 201, 1 et 1. Les 35 échecs Resend de préproduction et le cas « échec après l'envoi » n'ont pas été re-mesurés. Classement : A1, le comportement attendu est écrit dans le commentaire de `send()` ; le correctif enveloppe `$this->deliver(...)` dans `DB::afterCommit(...)`, avec un test qui fait échouer le transport sous `AgentInvitationService::invite` et retrouve l'invitation et le profil.
- Mesure (2026-10-16, 1945dbf8, implementeur) : avant correctif, `InvitationDeliveredAfterCommitTest` (transport `Mail::extend` qui lève `TransportException`) rend 500 et **0 invitation** sur `POST …/agents/invite`, `…/owners/invite` et `…/service-providers/invite`, et un appelant dont la `DB::transaction` échoue après `send()` laisse partir l'`InvitationMailable` (cas « échec après l'envoi », mesuré) → `DB::afterCommit(fn () => $this->deliver(...))` dans `send()` : invitation et profil survivent à la panne (toujours 500), aucun courriel sur rollback, envoi inchangé hors panne ; ablation (appel direct remis) : 4 rouges sur 5, remise : 5 verts ; `tests/Feature/Invitation` + `SuperAdminInvitationLifecycleTest` : 125 verts ; `impacted-tests --run` : 468 verts.

### Les SMS reportés la nuit gardent les liens porteurs en clair dans `jobs`
- Réf : P11.03
- Statut : fait · TCK-678
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Notifications/Sms/SmsRouterDriver.php:56-57,214`, `takussan-api/app/Jobs/SendDeferredSmsJob.php:16`, `takussan-api/config/sms.php:125-129`
- Constat :
  - `CodedNotification` est chiffrée en file exprès (TCK-602).
  - Entre 22 h et 6 h, le routeur remet le texte **déjà rendu** à `SendDeferredSmsJob`, qui n'implémente pas `ShouldBeEncrypted`.
  - Ce texte porte `payment_url`, `receipt_url` et `/invitations/accept?token=`.
  - Le chemin est réel : `invitations:remind` tourne toutes les heures, et le webhook de paiement arrive à toute heure.
  - Établi comment : lu, chemin complet.
- Piste : `ShouldBeEncrypted` sur `SendDeferredSmsJob`, plus une garde qui l'exige de tout job portant un texte de SMS.
- Mesure (2026-10-15, 6c8a08b0, mesureur) : lu `SendDeferredSmsJob.php:16` (`implements ShouldQueue` seul, aucun `ShouldBeEncrypted` ; `git log` : intact depuis TCK-102), `SmsRouterDriver.php:56-57,211-214` (`deferAll` remet le texte rendu au job, retardé à la fin de la fenêtre), `config/sms.php` (`quiet_hours` 22 h-6 h, actif par défaut), `CodedNotification.php:40,172-175` (chiffrée, mais `isCriticalSms()` rend `false`, donc reportée la nuit) et `lang/fr/notifications.php:294,301,328` (`sms_link` porte `:payment_url` et `:receipt_url`) ; `grep ShouldBeEncrypted app/` → seuls `CodedNotification` et `RecordPublicSearchAlert`. Aucun ticket ne le traite. Le lien d'invitation n'a pas été suivi jusqu'au SMS → le constat tient pour les liens de paiement et de quittance. Classement : V3, la piste change ce que la base conserve en clair de liens porteurs ; le comportement attendu est écrit par TCK-602, mais le doute sur V3 classe à valider.
- Mesure (2026-10-16, 6efe6fec, implementeur) : avant correctif, `SmsRouterDriverTest::test_deferred_sms_is_stored_encrypted_in_the_jobs_table` (file `database`, 23 h 30, SMS non critique) lit dans `jobs` une charge qui porte en clair le lien `…?token=jeton-porteur-secret` et le numéro `+221771234567`, et la garde `JobSmsChiffreTest` nomme `App\Jobs\SendDeferredSmsJob` → `ShouldBeEncrypted` ajouté : la charge ne porte plus ni lien ni numéro et se déchiffre en le texte ; ablation (interface retirée) : 2 rouges sur 16, remise : 16 verts.

### L'e-mail de vérification à l'inscription est synchrone
- Réf : P11.04
- Statut : fait · TCK-747 — reste : AccountDeletionExecutedNotification reste synchrone ; la mettre en file demande de ranger l'adresse d'origine dans la charge du job après l'effacement (V3)
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/Auth/AuthController.php:33-46`, `takussan-api/app/Notifications/RegistrationConfirmationNotification.php`
- Constat :
  - `User::create` est appelé hors transaction, puis `Registered` déclenche une notification sans file.
  - Si le transport échoue, la réponse est un 500 alors que le compte existe déjà, et aucun jeton n'est rendu. Une nouvelle tentative bute sur « e-mail déjà pris ».
  - Même chose pour `ResetPasswordNotification` et `AccountDeletion*`.
  - Établi comment : lu.
- Piste : `ShouldQueue`, avec les codes à usage unique sur `notifications-urgent`.
- Mesure (2026-10-15, 4e9acdd7, mesureur) : `AuthController::register` (l. 31-46 : `User::create` hors transaction, `event(new Registered)`) relu, `RegistrationConfirmationNotification` étend `VerifyEmail` sans `ShouldQueue`, ni `ResetPasswordNotification` ; les trois `AccountDeletion*` n'ont que le trait `Queueable`, sans `ShouldQueue` ; test temporaire retiré : SMTP sur `127.0.0.1:1`, `POST /api/auth/register` → 500, aucun jeton, compte créé en base ; même corps rejoué → 422 `email: The email has already been taken.` Le constat tient. Classement : V2, le correctif touche le parcours d'inscription et de réinitialisation, et le choix de file (`notifications-urgent`) en fait partie.
- Mesure (2026-10-17, b8b556ed, implementeur) : avant correctif, `NotificationsDeCompteEnFileTest` (file `database`, SMTP sur `127.0.0.1:1`) → `POST /api/auth/register` et `POST /api/auth/forgot-password` rendent 500 (`TransportException`), aucune ligne `jobs` → `ShouldQueue` et `viaQueues()` = `notifications-urgent` sur l'inscription, la réinitialisation et trois `AccountDeletion*`, `ShouldBeEncrypted` sur les deux qui portent un jeton ou un code ; l'inscription rend un jeton, la réinitialisation 200, le jeton absent en clair de la charge ; `AccountDeletionExecutedNotification` laissée synchrone (le worker relirait la ligne déjà anonymisée) ; ablation : 3 rouges sur 4, correctif remis : 4 verts, et 14 classes voisines (suppression de compte, vérification d'e-mail, réinitialisation, langues) vertes.

### Un SMS qui échoue ne laisse ni trace ni alerte
- Réf : P11.05
- Statut : fait · TCK-799
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Notifications/Sms/SmsRouterDriver.php:195-201,241`, `takussan-api/app/Notifications/Channels/SmsChannel.php:75`, `takussan-api/app/Services/Lease/LeaseSignatureService.php:119-135`
- Constat :
  - `no_provider_available` rend un résultat, sans exception ni log.
  - Sans `notification_id` (contact sans compte), aucune tentative n'est journalisée.
  - Le docblock promet une bascule vers l'e-mail que Laravel ne fait pas.
  - Le code de signature de bail partage le seau de 5 SMS par heure avec les rappels, et l'API répond `channel: sms` même quand rien n'est parti.
  - Les clés `SMS_*` sont absentes en préproduction (`docs/infra/hebergement.md:148`).
  - Établi comment : lu.
- Piste : `Log::warning` et une métrique ; un seau séparé pour les codes critiques, ou un 503 lisible.
- Mesure (2026-10-15, 4e9acdd7, mesureur) : `SmsRouterDriver.php:195-201` et `appendAttempt` (l. 239-243, sort sans rien écrire si `notification_id` est nul), `SmsChannel::withinRateLimit` (l. 143-160, seau unique de `sms.rate_limit.per_user_per_hour` = 5, codes critiques compris) et `LeaseSignatureService::sendCode` (l. 112-136, rend `channel: sms` sans lire le résultat) relus ; test temporaire retiré : chaînes vides, `SmsRouterDriver::send` d'un SMS critique sans `notification_id` → `failed`/`no_provider_available`, et `Log::spy` n'a reçu ni `info`, ni `warning`, ni `error`. Tient pour le chemin « aucun fournisseur » ; inexact sur un point : le seau plein, lui, laisse un `Log::info` (`SmsChannel.php:152`). Classement : V7, la piste choisit entre un seau séparé pour les codes et un 503 visible, et la signature de bail en dépend (V2).
- Mesure (2026-10-17, b8b556ed, implementeur) : relu `database/migrations/2026_04_27_000001_create_notification_delivery_attempts_table.php:20-22` (`app_notification_id` en `foreignId()->constrained()`, non nul) et `SmsRouterDriver::appendAttempt()` (`if (! $notificationId) return;`) → une tentative sans notification ne peut s'écrire dans cette table qu'après une migration qui rend la colonne nullable (ou une table à part) : critère V4, autre que le V7 accordé. Si « tentative journalisée » veut dire au journal applicatif et non en base, la piste redevient faisable sans migration : à préciser. Le reste de la décision (`Log::warning`, seau séparé, 503) n'a pas été commencé.
- Mesure (2026-10-17, 63fb933cd, implementeur) : avant correctif, `SmsFailureTraceTest` → chaîne sans fournisseur : aucun `Log::warning` ; SMS sans notification : aucune ligne `notification_delivery_attempts` ; seau ordinaire plein : le SMS critique refusé (`null`) ; `LeaseSignatureTest` → SMS de code en échec `no_provider_available` : 202 `channel: sms` → migration neuve (`app_notification_id` nullable, `down()` qui supprime les lignes sans notification, jouée aller-retour par un test de mesure retiré), `warning` avec le suffixe du numéro, tentative écrite sans notification sous point de sauvegarde, clé `sms-channel:critical:…` à la même borne, 503 `lease_signature.sms_not_sent` par `afterSending()` ; ablation : routeur seul → 3 rouges, canal seul → 1, service seul → 1, migration retirée → 2 ; correctif remis : 52 verts, et `tests/Feature/Services/Sms` et les classes voisines vertes (102 tests).

### Le compte SMS choisi dépend du nombre d'agences du destinataire, et reste en cache dans le worker
- Réf : P11.06
- Statut : fait · TCK-765
- Gravité : 🟠 risque ou dette (intention à vérifier)
- Où : `takussan-api/app/Services/Notifications/Sms/IntegrationLocator.php:27-33`, `takussan-api/app/Notifications/Channels/SmsChannel.php:104`, `takussan-api/app/Providers/AppServiceProvider.php:284`
- Constat :
  - Avec un `agency_id`, seule l'intégration de l'agence est cherchée, sans repli sur la plateforme.
  - `agency_id` vaut l'agence pour un professionnel mono-agence et `null` pour un multi-agences. Les SMS du premier dépendent donc du fournisseur de son agence, alors qu'ADR-0032 met le coût à la charge de la plateforme.
  - `IntegrationLocator` est un singleton qui met en cache aussi les résultats nuls. Dans le worker (`--max-time=3600`), une intégration activée ou tournée met jusqu'à une heure à prendre effet.
  - Établi comment : lu.
- Piste : un repli sur la plateforme, et `scoped()` à la place de `singleton()`.
- Mesure (2026-10-15, 4e9acdd7, mesureur) : `IntegrationLocator::find` (l. 18-33 : avec `agency_id`, seule l'intégration de l'agence ; cache par clé, nul compris), `SmsChannel::resolveAgencyId` (l. 102-107, lit `User::agency_id`, que `getAgencyIdAttribute` rend nul pour un multi-agences, `User.php:263-288`) et `AppServiceProvider::registerSmsServices` (`singleton(IntegrationLocator::class)`) relus ; `grep -rn 'flush()' app` → aucun appelant de `IntegrationLocator::flush()`. Le constat tient à la lecture ; l'intention (un compte SMS d'agence voulu ou non) n'est écrite nulle part, ADR-0032 l. 74 et 125 met le coût à la plateforme. Classement : V7, le repli sur la plateforme est une décision de facturation et de produit ; seul le passage à `scoped()` serait A1.
- Mesure (2026-10-17, d3380eb58, implementeur) : avant correctif, `IntegrationLocatorTest` → une agence sans intégration propre ne trouve pas celle de la plateforme (`find()` rend nul), et une intégration Orange créée après un premier envoi n'est pas vue après `forgetScopedInstances()` (`lafricamobile` au lieu d'`orange`) → `find()` retombe sur la plateforme, localisateur et ses six consommateurs en `scoped()` ; ablation : `singleton()` remis seul → 1 rouge, ancien `find()` remis seul → 1 rouge ; correctif remis : 3 verts, `tests/Feature/Services/Sms` et `Whatsapp` verts (74 tests).

### Diffusion en double, avant le commit, avec le contenu écrit au journal
- Réf : P11.07
- Statut : refusé — ne rien retirer : NewNotification et le canal broadcast seront travaillés prochainement
- Gravité : 🟠 risque ou dette (valeur de préproduction à vérifier)
- Où : `takussan-api/app/Services/Model/NotificationService.php:108-114`, `takussan-api/app/Events/NewNotification.php:13`, `takussan-api/app/Notifications/CodedNotification.php:85`, `.env.example:121`
- Constat :
  - `NewNotification` est `ShouldBroadcastNow` et part dans la transaction, avant le commit. `CodedNotification` y ajoute un canal `broadcast` sur le même canal privé.
  - Le front n'écoute rien : aucun `echo`, `pusher` ni `notification.new` (mesuré).
  - Avec `BROADCAST_CONNECTION=log`, titre et corps (noms, montants) sont écrits au niveau info.
  - Établi comment : lu, et mesuré pour le front.
- Piste : supprimer `NewNotification`, ou la passer en `ShouldDispatchAfterCommit` et la faire taire tant que D-65 est ouvert.
- Mesure (2026-10-15, 4e9acdd7, mesureur) : `NotificationService.php:108-114` (`event(new NewNotification)` après `notify()`), `NewNotification` (`ShouldBroadcastNow`, `broadcastWith` porte `title` et `body`), `CodedNotification::via` l. 80-86 et `PreferenceResolver::channelsFor` l. 217-223 relus ; `grep -rniE 'laravel-echo|pusher|notification\.new|new Echo' takussan-web/src takussan-web/package.json` → rien ; test temporaire retiré : `broadcasting.default=log`, `NotificationService::send` pour les 98 codes → exactement une ligne `info Broadcasting [notification.new] …` par code, titre en clair (« Loyer à payer le … »). Tient en partie : le contenu va au journal et personne n'écoute ; la diffusion **en double** n'existe pas sous `log`/`null`, puisque `channelsFor()` retire `push` sans transport (D-65), et ne naîtrait qu'avec un vrai transport ; « avant le commit » et la valeur de préproduction ne sont pas mesurés. Classement : V3, la piste décide de ce qui s'écrit d'une notification au journal, ou retire un mécanisme de diffusion (V6).

### Le résumé par e-mail est injoignable, et doublerait chaque e-mail le jour où il le deviendrait
- Réf : P11.08
- Statut : retenu · à valider — V7 : retirer le résumé ou le brancher est un choix de produit ; porteur (2026-10-15) : plus tard
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Jobs/Notifications/BuildUserDigestJob.php:36-40`, `takussan-api/app/Services/Notifications/DigestBuilderService.php:28-36`, `takussan-api/app/Notifications/CodedNotification.php:77`, `takussan-api/routes/web.php:12`
- Constat :
  - Aucun point d'API n'écrit `email_frequency`, hormis le lien de désabonnement.
  - `via()` ignore `email_frequency` et `notifications_email_enabled`.
  - Le désabonnement est un `GET` signé, sans expiration, qui modifie l'état : un scanner de liens suffit à désabonner.
  - `SendDailyNotificationDigest` n'est ni planifié ni dispatché.
  - Établi comment : lu.
- Piste : retirer ce sous-système, ou faire lire `email_frequency` par `via()` et passer le désabonnement en `POST`.
- Mesure (2026-10-15, 89a52efe, mesureur) : lu `grep -rn email_frequency app routes` et le front → seul `NotificationUnsubscribeController.php:20` écrit `email_frequency` (`UpdateNotificationPreferencesRequest` ne l'accepte pas, aucune occurrence dans `takussan-web/src` hors messages), la colonne vaut `instant` par défaut (`2026_04_26_200001_add_digest_preferences_to_users_table.php:20`), donc `BuildUserDigestJob::handle()` sort à sa garde pour tout compte ; `CodedNotification::via()` ne lit ni `email_frequency` ni `notifications_email_enabled` ; le désabonnement est un `GET` signé par `URL::signedRoute` sans expiration (`routes/web.php:12`, `BuildUserDigestJob.php:58`). Constat inexact sur un point : `SendNotificationDigestJob` EST planifié (`routes/console.php:66`, `hourly()`) ; c'est son jumeau `App\Jobs\SendDailyNotificationDigest` qui n'est ni planifié ni dispatché (seul `NotificationDigestTest` le cite). Classement : V7, la piste offre deux voies (retrait d'une fonction ou comportement d'envoi neuf) que seul le porteur tranche.

### Aucun `afterCommit` : pas de dégât aujourd'hui, grâce à la seule file `database`
- Réf : P11.09
- Statut : fait · TCK-746
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/queue.php:44,73`, `takussan-api/app/Notifications/CodedNotification.php:40`
- Constat :
  - `after_commit => false` partout.
  - La file `database` écrit le job dans la même transaction, qui les annule ensemble.
  - Un passage à Redis enverrait des notifications pour des transactions annulées.
  - Établi comment : lu.
- Piste : `ShouldQueueAfterCommit` sur `CodedNotification` et les autres notifications en file.
- Mesure (2026-10-15, 89a52efe, mesureur) : lu `config/queue.php:44,53,64,73` → `after_commit => false` sur les quatre connexions ; `grep -rn 'AfterCommit' app` → seuls `RevalidatePublicPropertyPage` (`afterCommit()`) et trois événements `ShouldDispatchAfterCommit`, aucune notification ; 24 fichiers de `app/Notifications` sont `ShouldQueue` ; `docs/infra/prod-drivers.json` donne `QUEUE_CONNECTION=database` en préproduction (mesuré le 2026-09-14) et en production (prescrit), et `DB_QUEUE_CONNECTION` n'est pas posé dans `.env.example` → le constat tient tel qu'écrit : aucun dégât tant que la file est `database` sur la connexion par défaut. Classement : V6, poser l'envoi après commit sur toutes les notifications (ou par `after_commit` de la connexion) est une décision transverse sur la file, au-delà d'un défaut au comportement écrit.
- Mesure (2026-10-17, b8b556ed, implementeur) : avant correctif, `QueueAfterCommitTest` (file `database`) lit une ligne dans `jobs` **dans** la transaction qui a mis le job en file, et la propriété `after_commit` vaut `false` sur `database`, `beanstalkd`, `sqs`, `redis` → `after_commit => true` sur ces quatre connexions ; aucune ligne avant le commit, une après, rien pour une transaction annulée, dispatch immédiat hors transaction ; ablation (`false` remis) : 2 rouges sur 4, correctif remis : 4 verts, et les 8 classes qui basculent la file sur `database` restent vertes.

### Petites améliorations
- Réf : P11.10
- Statut : fait · TCK-800
- Gravité : 🟢 amélioration
- Constat (lu, sauf mention) :
  - **Échecs en file** : aucun `$tries`, `backoff()` ni `failed()` sur `CodedNotification`. Le worker passe `--tries=3` sans délai : une panne Resend de quelques secondes épuise les trois essais.
  - **Journaux** : `SmsChannel.php:54` et `WhatsappChannel.php:77` écrivent le numéro complet, alors que le reste du dépôt ne journalise que le suffixe (`PhoneVerificationService.php:396`).
  - **Ce qui tient** :
    - `event:list` : 178 écouteurs, aucun doublon (mesuré) ;
    - un seul conteneur `scheduler` ;
    - relances posées sous `lockForUpdate` ;
    - fil in-app isolé par `user_id`, `per_page` plafonné à 50.

    `withoutOverlapping()` sur un `Schedule::job` ne protège que la mise en file, pas l'exécution.
- Piste : `backoff = [60, 300, 900]` et un `failed()` qui journalise le code et le canal ; ne journaliser que le suffixe des numéros.
- Mesure (2026-10-16, b775f8f6, mesureur) : lu `CodedNotification.php:40` (`ShouldQueue` ; aucun `$tries`, `backoff` ni `failed()` dans le fichier), `deploy/takussan/compose.api.yml:55` et `dev.sh:821` (`queue:work … --tries=3`, sans `--backoff`), `SmsChannel.php:54-57` et `WhatsappChannel.php:77-80` (`'phone' => $phone`, le numéro entier), `PhoneVerificationService.php:396` (`phone_suffix` = `substr($phone, -4)`) → les deux constats tiennent tels quels. Classement : V3, ce que les journaux conservent d'un numéro est une donnée personnelle, et les délais de `backoff` sont une valeur à choisir.
- Mesure (2026-10-17, 63fb933cd, implementeur) : avant correctif, `NotificationFailureLoggingTest` → un numéro invalide routé (`0012-34-56-7890`) écrit `phone` entier au `warning` de `SmsChannel` et de `WhatsappChannel` ; le job en file d'une `CodedNotification` rend `null` en `backoff()` et son `failed()` n'écrit rien → `phone_suffix` (4 derniers caractères) sur les deux canaux, `backoff()` = `[60, 300, 900]`, `failed()` qui écrit un `error` avec le code, le canal (retenu par `middleware()` à la mise en file) et l'identifiant de la cloche, sans le message de l'exception ; ablation : chacun des cinq morceaux retiré seul → 1 rouge ; correctif remis : 2 verts, et 147 tests voisins (notifications, WhatsApp, canal SMS) verts.

## Angle 12 — Tests : zones non gardées, tests verts sans leur code

Les trois 🔴 ont été relus par la session dans le code :
- `PaymentGatewayInitiateTest.php:187-204` n'asserte qu'un `assertOk()`, sous un `Http::fake` Wave qui répond 200 à toute clé ;
- `AccountDeletionRequestTest.php:151-168` ne crée qu'un bail actif ;
- le seul test qui envoie `X-OM-Signature` (`PaymentDriverTest.php:131-150`) envoie une signature valide, et aucun test PHP ne contient « om-signature ».

**Ce sont des tests qui manquent, pas des défauts de production** : le code gardé est juste aujourd'hui. Le 🔴 dit qu'une régression passerait la CI au vert. Aucune ablation n'a été faite : c'est l'angle 40.

### Le test d'isolation à l'initiation du paiement ne peut pas voir le défaut
- Réf : P12.01
- Statut : fait · TCK-694
- Gravité : 🔴 garde absente
- Où : `takussan-api/tests/Feature/Api/PaymentGatewayInitiateTest.php:187-204`, `takussan-api/app/Services/Payments/PaymentGatewayService.php:76-77`
- Constat :
  - Le test crée une intégration Wave dans une autre agence, avec le commentaire « must not be picked ».
  - Sa seule assertion est `assertOk()`. Or `setUp` fait répondre 200 à `api.wave.com/*` quelle que soit la clé.
  - Si on retire `where('agency_id', $agencyId)` (l. 77), la clé d'une autre agence peut être utilisée, et le test reste vert.
  - Le seul test qui regarde `integration_id` (`PaymentWebhookEndpointTest.php:325`) ne crée qu'une intégration.
  - Établi comment : lu.
- Piste : asserter `metadata.gateway.integration_id`, ou `Http::assertSent` sur l'en-tête `Authorization: Bearer wave_test_key`.
- Mesure (2026-10-15, 6c8a08b0, mesureur) : lu `PaymentGatewayInitiateTest.php:187-204` (seule assertion `assertOk()`) et `PaymentGatewayService::resolveIntegration` (la ligne citée a bougé : le filtre est aujourd'hui `:76-78`, `where agency_id = ? or agency_id is null`) ; ablation (charge 3,23 / 8 cœurs) en remplaçant le filtre par `orderByDesc('id')->first()` → **rouge** (422 au lieu de 200), mais parce que l'intégration étrangère du test n'a pas de `webhook_secret` (`WaveDriver::CREDENTIAL_KEYS`) et rend le fournisseur indisponible ; même ablation avec `'webhook_secret' => 'foreign_secret'` ajouté au test → **vert**. Code et test restaurés. Le test ne voit donc la fuite que par accident de fixture. Classement : A5, ajouter une assertion sur l'intégration réellement utilisée (`Http::assertSent` sur `Authorization: Bearer`, ou `integration_id`) et compléter les identifiants de la fixture, sans toucher au code ni à un seuil.
- Mesure (2026-10-16, af610be5, implementeur) : filtre `agency_id` retiré de `resolveIntegration()` → l'ancien test vert (1 assertion, `assertOk()`) → test réécrit : intégration étrangère complète et créée avant celle de l'agence, `Http::assertSent` sur `Bearer wave_test_key`, `assertNotSent` sur la clé étrangère, `metadata.gateway.integration_id` = l'intégration de l'agence ; ablation (même retrait) → rouge « An expected request was not recorded » ; filtre remis → `PaymentGatewayInitiateTest` 13 verts (58 assertions).

### Les obligations qui bloquent la suppression d'un compte ne sont gardées que pour le bail actif
- Réf : P12.02
- Statut : fait · TCK-698
- Gravité : 🔴 garde absente
- Où : `takussan-api/tests/Feature/Auth/AccountDeletionRequestTest.php:151-168`, `takussan-api/app/Services/Account/AccountDeletionService.php:326-375`
- Constat :
  - `test_blocked_when_user_has_pending_lease_payment_via_customer` ne crée aucun loyer impayé, seulement un bail actif. Son commentaire le dit : « The active lease alone is enough ».
  - Dans le clover de la CI du 2026-10-15, les trois autres obligations sont à 0 : loyers en attente (`:335-342`), factures dues (`:351-358`) et réservations ouvertes (`:368-375`).
  - Les supprimer laisserait un ancien locataire débiteur effacer son compte, sans un rouge.
  - Établi comment : mesuré sur le clover CI, et lu.
- Piste : un test par type d'obligation (bail résilié et échéance `Late`, facture due, réservation ouverte), plus le cas d'une restitution de caution en attente, qui ne doit pas bloquer (TCK-595 H-2).
- Mesure (2026-10-15, 6c8a08b0, mesureur) : lu `AccountDeletionService::collectOpenObligations` (`:286-380`, loyers en attente `:329-333`, factures `:346-349`, réservations `:362-365`) et `AccountDeletionRequestTest.php:151` ; ablation (charge 3,04 / 8 cœurs) en ajoutant `whereRaw("false")` aux trois requêtes, puis les 13 fichiers de `tests/` qui citent la suppression de compte (`AccountDeletion*`, `AccountErasureListingsTest`, `AdminUserLifecycleTest`, `PrivacyRequestRegistryTest`, `DashboardTenantDepositRefundTest`…) → **79 verts, 376 assertions**. Code restauré. Classement : A5, des tests de bout en bout par type d'obligation (et la restitution de caution qui ne bloque pas, TCK-595 H-2) sur un comportement déjà écrit, sans toucher au code.
- Mesure (2026-10-16, 3b6abb26, implementeur) : chaque requête de `collectOpenObligations` neutralisée par `whereRaw('false')` (loyers, factures, réservations) → les 7 tests d'`AccountDeletionRequestTest` verts → 3 tests de bout en bout sur `POST /api/auth/me/deletion-request` (bail résilié + échéance `late`, facture `overdue`, réservation `confirmed`), plus un témoin soldé (202) ; ablation, une requête à la fois → seul le test de cette obligation rouge ; filtre de statut des factures retiré → le témoin rouge ; code intact → 11 verts (43 assertions). La restitution de caution (TCK-595 H-2) est déjà gardée par `DashboardTenantDepositRefundTest`.

### La signature Orange Money n'est jamais testée en refus
- Réf : P12.03
- Statut : fait · TCK-699
- Gravité : 🔴 garde absente
- Où : `takussan-api/app/Services/Payments/Drivers/OrangeMoneyDriver.php:130-133`, `takussan-api/tests/Feature/Api/PaymentDriverTest.php:131-150`
- Constat :
  - Le seul test envoie une signature valide. La ligne 133 compte comme couverte, mais aucun cas de signature fausse ou absente n'existe.
  - Si on retire `abort_code_unless`, le webhook OM accepte n'importe quel corps, et tout reste vert.
  - Wave a son test de refus (`PaymentWebhookTest.php:84`).
  - Établi comment : lu et grep.
- Piste : trois cas de bout en bout sur `/api/webhooks/payments/orange_money/{token}` (signature fausse, absente, secret d'une autre agence), en vérifiant que le paiement n'a pas bougé.
- Mesure (2026-10-15, 6c8a08b0, mesureur) : lu `OrangeMoneyDriver.php:130-133` ; ablation (charge ≈ 3 / 8 cœurs) en remplaçant la condition de `abort_code_unless` par `true || …`, puis les 12 fichiers de `tests/` qui citent `orange_money` ou `OrangeMoney`, plus `PaymentWebhookTest` et `PaymentWebhookMultiTenantTest` → **117 verts, 798 assertions**. Code restauré ; `grep X-OM-Signature docs/backlog/tickets` → rien. Classement : A5, trois tests de refus de signature (fausse, absente, secret d'une autre agence) sur une garde existante, sans toucher au code.
- Mesure (2026-10-16, 7010f9e7, implementeur) : vérification de `handleWebhook()` neutralisée (`true || …`) → `PaymentDriverTest`, `PaymentWebhookTest`, `PaymentWebhookEndpointTest`, `PaymentWebhookMultiTenantTest`, `PaymentDriverErrorLeakTest` verts (49 tests, 279 assertions) → `OrangeMoneyWebhookSignatureTest` de bout en bout sur `/api/webhooks/payments/orange_money/{token}` (signature fausse, absente, secret d'une autre agence : 401 et paiement resté `pending` ; témoin signé par le bon secret : soldé) ; ablation (même neutralisation) → les trois refus rouges (200 au lieu de 401) ; code remis → 4 verts (17 assertions).

### L'horodatage de la signature Wave n'est jamais comparé à l'heure
- Réf : P12.04
- Statut : retenu · à valider — V2 : authenticité des webhooks de paiement, et lacune assumée par ADR-0046 ; porteur (2026-10-15) : plus tard, vérifier les relivraisons de Wave
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Payments/Drivers/WaveDriver.php:146-151`
- Constat :
  - `t` entre dans le HMAC, mais rien ne le compare à `now()` : un webhook signé et capturé reste rejouable indéfiniment.
  - Le test de refus (`t=1,v1=deadbeef`) échoue sur le HMAC, et il resterait vert qu'il y ait une fenêtre de temps ou non.
  - Établi comment : lu. L'effet d'un `refund` ou d'un `failed` rejoué est à vérifier (angle 39).
- Piste : refuser un `t` hors d'une tolérance de 5 min ; tester une signature valide avec un `t` vieux d'une heure.
- Mesure (2026-10-15, 89a52efe, mesureur) : lu `WaveDriver.php:135-151` → `t` n'entre que dans le HMAC, aucune comparaison à l'heure ; les tests de refus (`PaymentWebhookTest.php:96`, `t=1,v1=deadbeef` ; `PaymentDriverTest.php:91`, `t=1,v1=bad`) échouent sur le HMAC. `docs/adr/0046-un-webhook-de-paiement-par-integration.md:172-174` nomme cette lacune « assumée, hors de ce ticket » et dit que l'idempotence de `gateway_events` (fournisseur, transaction, type) en neutralise l'effet sur les montants ; l'effet d'un `refund` ou `failed` rejoué n'est pas re-mesuré ici. Classement : V2, une fenêtre de temps refuserait des webhooks aujourd'hui acceptés, et sa largeur (retards de relivraison de Wave) se décide ; ADR-0046 la tient pour une lacune assumée.

### Le cliquet de couverture laisse sept points de marge
- Réf : P12.05
- Statut : retenu · à valider — V9 : seuil du cliquet de couverture ; porteur (2026-10-15) : traité hors agents, seuil à 92 % sur un chiffre de CI
- Gravité : 🟠 risque ou dette
- Où : `.github/workflows/api-ci.yml:464`
- Constat :
  - L'artefact `couverture-api-clover` du run 38662423267 (PR de cette branche, PCOV) donne 38 400 instructions couvertes sur 41 226, soit **93,15 %**.
  - Le seuil est à 86 % : environ 2 950 instructions peuvent perdre leur couverture sans rouge.
  - Établi comment : mesuré, sur une seule exécution de PR.
- Piste : selon CLAUDE.md, le seuil se resserre sur un chiffre de CI. Relever un second run sur `dev`, puis passer à 92 %.
- Mesure (2026-10-15, 89a52efe, mesureur) : `gh run download 38700039987 -n couverture-api-clover` (run `schedule` sur `dev`, 53b3d2ee) puis `php bin/coverage-gate.php <clover> --min=86` → « Total: 93.1 % (38381 / 41218 lignes exécutables) … ✓ cliquet tenu » ; `.github/workflows/api-ci.yml:464` porte toujours `--min=86`. C'est le second chiffre de CI que la piste demandait, et il confirme celui de la PR (93,15 %). Le dernier run de `dev` (38711643375) n'a pas d'artefact de couverture : sauté par l'attestation (ADR-0063). Classement : V9, resserrer un seuil de garde revient au porteur.

### Le clover local est périmé et trompe qui le lit
- Réf : P12.06
- Statut : caduc — fichier ignoré par git (`takussan-api/.gitignore:38`), absent de tout arbre propre ; aucun outil du dépôt ne le lit sans l'avoir régénéré, et l'artefact de CI est déjà publié
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/storage/coverage/clover.xml`
- Constat :
  - Le fichier date du 2026-08-30.
  - 467 fichiers sur 1 403 dans `app/` en sont absents (33 %), dont `LeaseSignatureService`, `PayoutCalculator`, `WebhookJournal` et `PaymentSupervisionService`.
  - Il mesure aussi 9 fichiers qui n'existent plus.
  - Établi comment : mesuré.
- Piste : lire l'artefact de la CI (`gh run download -n couverture-api-clover`) ; supprimer ou dater le fichier local.
- Mesure (2026-10-15, 28167fee, mesureur) : `ls takussan-api/storage/coverage/` sur l'arbre du mesureur → absent ; `git check-ignore -v` → `.gitignore:38:/storage/coverage/` ; `git grep clover` → seuls lecteurs `bin/coverage-gate.php`, appelé par `api-ci.yml:464` juste après l'avoir écrit (`:432`), et la carte d'impact qui ne le lit pas (`takussan-api/CLAUDE.md:732-735`) ; l'artefact `couverture-api-clover` est déjà publié (`api-ci.yml:485-490`). Le fichier périmé du constat vit dans l'arbre du porteur, que le mesureur ne peut pas lire : son âge et ses 467 absents n'ont pas été re-mesurés. Classement : aucun, le défaut est un état local du poste, pas du dépôt, et aucun commit ne le corrige.

### La policy du registre RGPD n'est jamais exécutée
- Réf : P12.07
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Policies/PrivacyRequestPolicy.php:18,23,28,33`
- Constat :
  - Ses quatre lignes sont à 0 dans le clover CI, et la carte d'impact ne lui rattache aucun test.
  - Le 403 testé (`PrivacyRequestRegistryTest.php:145`) vient du middleware `super-admin`, avant que la policy soit consultée.
  - Un `return false` changé en `true` resterait vert.
  - Établi comment : mesuré.
- Piste : un test unitaire de la policy par méthode.
- Mesure (2026-10-15, 89a52efe, mesureur) : lu `PrivacyRequestPolicy.php:16-34` (quatre `return false`), appelée par `PrivacyRequestController.php:31,81` et `Store/UpdatePrivacyRequestRequest::authorize()` ; clover CI du run 38700039987 (`dev`, 53b3d2ee, aucun commit depuis sur la policy) → lignes 18, 23, 28, 33 à `count=0` ; `grep -rl PrivacyRequestPolicy tests` → seule `tests/impact-map.json`. Le constat tient : le super-admin passe par `Gate::before` et tout autre appelant est arrêté par le middleware `super-admin` avant la policy. Classement : A5, un test unitaire par méthode (refus pour un non-super-admin, accord du super-admin par `Gate::before`) sans toucher à l'autorisation.

### Le code de signature de bail envoyé par e-mail n'est jamais rendu
- Réf : P12.08
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Notifications/LeaseSignatureCodeNotification.php:41-48`
- Constat : `toMail` est à 0 dans le clover CI, alors que le code OTP n'existe que là. Les tests figent la notification sans la rendre (mesuré).
- Piste : rendre le mail et asserter qu'il contient le code.
- Mesure (2026-10-15, 89a52efe, mesureur) : clover CI du run 38700039987 (`dev`, 53b3d2ee ; fichier inchangé depuis) → `LeaseSignatureCodeNotification::toMail` à `count=0` (lignes 41-48), `toSms` à 1 ; lu `toMail()` (`LeaseSignatureCodeNotification.php:39-49`) : le code n'y paraît qu'en `->line('**'.$code.'**')` ; les deux tests qui la citent (`LeaseSignatureTest.php`, `MobileClassEventsTest.php`) n'appellent pas `toMail`. Classement : A5, ajouter un test qui rend le mail et y cherche le code, sans changer le code de production.

### Côté front, la plupart des server actions et des handlers BFF n'ont aucun test
- Réf : P12.09
- Statut : fait · TCK-760
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/actions/`, `takussan-web/src/app/api/`
- Constat :
  - 15 actions sur 27 ne sont importées par aucun test, dont `account-deletion`, `invitations`, `locale` et `notification-preferences`.
  - 24 handlers sur 36 non plus. Les plus exposés :
    - `data-exports/[id]/download` (export RGPD) ;
    - `me/owner-profiles/[id]/kyc/{submit,upload}` ;
    - `admin-users/[[...path]]` ;
    - `super-admin-properties/[[...path]]` ;
    - `me/wizard-drafts/[key]`.
  - Les deux gardes génériques (`codes-erreur-bff.test.ts`, `segments-amont.garde.test.ts`) n'éprouvent pas le chemin nominal.
  - Établi comment : mesuré, par un script qui résout les imports.
- Piste : commencer par le téléchargement d'export RGPD et par `account-deletion.ts`. Un test de `locale.ts` aurait attrapé le `PATCH /api/users/me` mort (angles 6 et 11).
- Mesure (2026-10-15, 89a52efe, mesureur) : script node hors dépôt qui cherche, dans les `*.test.ts(x)` de `takussan-web/src`, un import de chaque action non remplacé par `vi.mock` → 15 actions sur 27 sans test : `account-deletion`, `agent-onboarding`, `auto-onboard`, `contact-preferences`, `invitations`, `kpis`, `locale`, `notification-preferences`, `notifications`, `onboarding`, `owner-onboarding`, `property-contacts`, `secondary-phone`, `service-provider-onboarding`, `super-admin-cooptation` ; `find src/app/api -name route.ts` → 36 handlers, et aucun `*.test.ts*` sous `data-exports/[id]/download`, `me/owner-profiles/[id]/kyc`, `admin-users`, `super-admin-properties`, `me/wizard-drafts`. Le décompte des 24 handlers n'est pas refait. La PR ouverte #421 touche `locale` et peut en couvrir une. Classement : V8, chaque test relève de A5, mais l'ensemble dépasse M et demande un découpage.
- Mesure (2026-10-17, 0785a29d, implementeur) : `grep -rln "account-deletion\|data-exports" takussan-web/src --include='*.test.*'` → aucun test n'importe `actions/account-deletion.ts` (`AccountDeletionSection.test.tsx` le remplace par `vi.mock`) ni `api/data-exports/[id]/download/route.ts` → tient. Deux tests neufs (`download/__tests__/route.test.ts`, 7 ; `actions/__tests__/account-deletion.test.ts`, 16) → 23 verts. Ablations : `set-cookie` relayé → 1 rouge, `segmentAmont` retiré → 3, `obligations` retirées de `failure()` → 4, clé de repli d'annulation changée → 1 ; remis → 23 verts.

### Petites améliorations
- Réf : P12.10
- Statut : retenu · autonome
- Gravité : 🟢 amélioration
- Constat (mesuré) :
  - **Carte d'impact** (`takussan-api/tests/impact-map.json`) : générée le 2026-10-13 sur `a34d46d9`, avec 806 classes. Il lui manque 18 classes de test, dont `RentalSettingsCatalogueTest` et 5 autres ajoutées le 14 et le 15, que `impacted-tests` ne sélectionnera pas avant la régénération nocturne.
  - **Assertions vides** : trois `assertTrue(true)` (`DigestBuilderServiceTest.php:131`, `SeedingMediaFailuresTest.php:154`…).
  - **Dates du jour** : des assertions sur la date du jour sans `freezeTime` (`SponsoredImpressionsTest.php:38`, `MaintenanceStructuredQuoteTest.php:93`), donc un risque de rouge à minuit.
  - **Mocks** : six tests front ne vérifient qu'un `toHaveBeenCalled()` sans arguments (`MaintenanceScheduler.test.tsx:70`…).
  - **Ce qui tient** :
    - tous les tests de policy essaient le refus ;
    - aucun test back ne moque sa propre classe ;
    - `SystemMessagesTest` a son `orderBy('id')` depuis `ca0a0f93`.
- Piste : `freezeTime()` sur ces tests ; des assertions sur les arguments.
- Mesure (2026-10-16, b775f8f6, mesureur) : `grep -rn 'assertTrue(true)' tests` → 3 (`ExampleTest.php:14`, `SeedingMediaFailuresTest.php:154`, `DigestBuilderServiceTest.php:131`) ; lu `SponsoredImpressionsTest.php:38` (lit la clé de l'heure `now()` après deux recherches) et `MaintenanceStructuredQuoteTest.php:93` (compare à `now()->addDays(10)->toDateString()`), `grep -c 'freezeTime\|travelTo'` → 0 dans les deux fichiers ; la carte d'impact a été régénérée le 2026-10-15 (`3a2c9108`, sur `53b3d2ee`) et il lui manque encore 15 classes dont `RentalSettingsCatalogueTest`, surtout des gardes qui ne couvrent pas `app/` : partie non retenue ; l'exemple front `MaintenanceScheduler.test.tsx:70` est inexact (l. 67-68 vérifient déjà l'argument `mode`) et les six tests ne sont pas nommés : partie non re-mesurée. Retenu : le temps figé dans les deux tests et les trois `assertTrue(true)`. Classement : A5, rendre déterministes et effectifs des tests existants, sans seuil ni choix de produit.

## Angle 14 — Observabilité : ce qu'on ne verrait pas en production

Les deux 🔴 ont été relus par la session dans le code :
- `AlertRuleService.php:76` appelle `SendAdminAlert::dispatch()` sans `onQueue`. `SendAdminAlert` n'implémente que `ShouldQueue` et ne déclare aucune file, donc `default`. Dans `compose.api.yml:55`, seul le `worker` consomme `default`.
- `HealthcheckService.php:139-143` : la sonde `scheduler` n'a pas de `status`, et le statut global ne prend en compte que les autres sondes. Dans `compose.api.yml`, seul `api` déclare un healthcheck (l. 44).

### L'alerte « file à l'arrêt » part sur la file arrêtée
- Réf : P14.01
- Statut : fait · TCK-679
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Admin/AlertRuleService.php:76`, `takussan-api/app/Jobs/SendAdminAlert.php:14`, `deploy/takussan/compose.api.yml:55`, `takussan-api/app/Console/Commands/EvaluateOperationalAlerts.php:41`
- Constat :
  - `ops_queue_stalled` produit une activité, que `DispatchAlerts` reçoit de façon synchrone (`AppServiceProvider.php:640`).
  - L'alerte est alors mise sur `default`, que seul le conteneur `worker` consomme.
  - Si ce worker meurt ou se fige, `alerts:evaluate` détecte bien la transition, mais l'alerte attend dans `jobs`, sur la file que personne ne lit.
  - Elle n'arrive que si c'est `worker-media` qui tombe.
  - Établi comment : lu, chemin suivi de bout en bout.
- Piste : envoyer les alertes `ops_*` de façon synchrone (`dispatchSync`) ou depuis un autre conteneur. Mieux, par un canal extérieur à l'application, comme le Telegram de `seuils.sh`.
- Mesure (2026-10-15, 6c8a08b0, mesureur) : lu `EvaluateOperationalAlerts.php:41,72` (`activity('Ops')->event('ops_queue_stalled')`), `AppServiceProvider.php:640` (`AuditActivity::created` → `DispatchAlerts`, synchrone), `AlertRuleService::dispatchForActivity` (`SendAdminAlert::dispatch` sans `onQueue`), `SendAdminAlert.php:14` (`ShouldQueue`), `config/queue.php:42` (`DB_QUEUE` par défaut `default`) et `compose.api.yml:55,61` (`default` lu par le seul `worker` ; `worker-media` lit `media,reconciliation`) → le chemin du constat tient. Non exécuté : la mort du worker. Classement : V5, la piste (envoi synchrone, autre conteneur, ou canal hors application) est un choix d'infrastructure et de canal.
- Mesure (2026-10-16, 45fd5aab, implementeur) : `OperationalAlertDeliveryTest` sous la connexion `database`, file `default` à l'arrêt : avant correctif, `alerts:evaluate` laisse le `SendAdminAlert` de `ops_queue_stalled` dans `jobs` et ne poste aucun webhook (2 rouges sur 3) → `AlertRuleService::dispatchForActivity` livre les `ops_*` par `dispatch_sync`, un échec attrapé par règle et journalisé (`SafeExceptionContext`) ; 3 verts, ablation du correctif → 2 rouges, ablation du seul `try/catch` → la `RequestException` d'un webhook en 500 fait tomber la commande.

### Si le planificateur meurt, personne ne le voit
- Réf : P14.02
- Statut : fait · TCK-680 — reste : les healthchecks des workers et la sonde UptimeRobot, par le porteur
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/routes/console.php:110-115`, `takussan-api/app/Services/Admin/HealthcheckService.php:139-143`, `takussan-api/app/Http/Controllers/Api/HealthController.php:17`, `deploy/takussan/compose.api.yml:44,67`, `docs/infra/hebergement.md:92`
- Constat :
  - Les battements des files, `health:probe` et `alerts:evaluate` tournent **dans** le conteneur `scheduler`. S'il s'arrête, plus rien n'évalue ni n'alerte.
  - La sonde `scheduler` relève `last_run_at` sans `status` : elle ne compte pas dans le statut global.
  - `/api/health` rend son statut, `unknown` compris, avec un HTTP 200, et UptimeRobot ne sonde que `/up`.
  - `/up` ne vérifie que le démarrage : aucun écouteur `DiagnosingHealth` dans `app/`.
  - `worker`, `worker-media` et `scheduler` n'ont aucun healthcheck, et `restart: unless-stopped` ne relance pas un conteneur figé.
  - Établi comment : lu. Qu'aucune autre sonde n'existe dans UptimeRobot reste à vérifier.
- Piste :
  - `/api/health` en 503 quand le statut est `unknown` ou `failed`, et une sonde UptimeRobot par mot-clé dessus ;
  - un `status` pour la sonde `scheduler` (dernière exécution plus vieille que quelques minutes = échec) ;
  - un healthcheck de battement sur `scheduler` et sur les workers.
- Mesure (2026-10-15, 6c8a08b0, mesureur) : lu `routes/console.php:110-115` (battements, `health:probe`, `alerts:evaluate` planifiés), `HealthcheckService.php:139-143` (sonde `scheduler` sans `status`, hors du `worst()`), `HealthcheckService::publicStatus` (`unknown` par défaut) et `HealthController` (`json()` sans code, donc 200), `grep DiagnosingHealth app bootstrap` → rien ; `compose.api.yml` : un seul `healthcheck` (l. 44, `api`) ; `docs/infra/hebergement.md`, ligne « Surveillance externe » : UptimeRobot ne sonde que `/up` (et la sonde de `deploy.takussan.com`). Le compte UptimeRobot lui-même n'a pas été consulté. Classement : V5, la piste touche `deploy/` et la surveillance externe, et changer le code HTTP de `/api/health` modifie un contrat public.
- Mesure (2026-10-16, 45fd5aab, implementeur) : avant correctif, la sonde `scheduler` n'a pas de clé `status` (`Undefined array key "status"` dans le test) et `/api/health` rend 200 sur un statut `failed` en cache → `HealthcheckProbesTest` (301 s sans exécution : sonde et statut global `failed` ; 60 s : `ok` ; aucune exécution : `failed`) et `HealthCheckTest` (503 sur `failed`, 200 sur `degraded` et `unknown`) ; ablation des deux fichiers d'`app/` : 4 rouges sur 25, correctif remis : 25 verts. Planificateur arrêté, `health:probe` ne tourne plus et le statut public expire en `unknown` (200) après 10 min : la décision ne retient que `failed` pour le 503.

### Aucune règle d'alerte n'existe par défaut
- Réf : P14.03
- Statut : fait · TCK-768
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Admin/AlertRuleService.php:71-75`
- Constat : une alerte `ops_*` ne part que si une ligne active existe dans `alert_rules`. Aucun seeder ni aucune commande n'en crée. Sur une production neuve, les alertes vont au journal d'audit et nulle part ailleurs (mesuré sur le dépôt ; l'état de la base de préproduction est à vérifier).
- Piste : créer les trois règles `ops_*` dans `release.sh`, destinataire tiré de l'environnement ; le vérifier dans le runbook de la phase F.
- Mesure (2026-10-15, 89a52efe, mesureur) : lu `AlertRuleService::dispatchForActivity()` (`AlertRuleService.php:64-75`) → n'envoie que pour une ligne `alert_rules` active ; `grep -rln 'AlertRule\|alert_rules' database app/Console deploy docs/infra` → seule la migration `2026_05_07_000221_create_alert_rules_table.php`, aucun seeder, aucune commande, rien dans `deploy/`. L'état de la base de préproduction n'est pas mesuré : sortir du poste est interdit à ce rôle. Classement : V5, la piste touche au déploiement et à une variable d'environnement.
- Mesure (2026-10-17, 640b250a6, implementeur) : `EnsureOperationalAlertRulesTest` avant correctif → 4 rouges (`alerts:ensure-ops-rules` inexistante, aucune règle `alert_rules` créée) → la commande crée, pour chaque `ops_*` du catalogue sans règle, une règle courriel vers les super-admins actifs, sans réécrire une règle existante ni rien créer sans super-admin ; `docker/release.sh` l'appelle, échec toléré (`test-release-reindex.sh`, 2 vérifications neuves). Ablation : commande retirée → 4 rouges, appel retiré de `release.sh` → 1 rouge ; remis → verts.

### Un job d'argent qui échoue chaque nuit reste sous le seuil
- Réf : P14.04
- Statut : fait · TCK-772
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Console/Commands/EvaluateOperationalAlerts.php:27,34`, `takussan-api/routes/console.php:37,43,59`
- Constat :
  - L'alerte ne se déclenche qu'à partir de 20 échecs par heure glissante.
  - `ApplyLateFeesJob`, `SendLeasePaymentReminders` et `SendOverdueRemindersJob` passent par `Schedule::job`, qui ne fait que les mettre en file.
  - `scheduled_task_runs` écrit donc `finished` même quand le job échoue ensuite chez le worker.
  - Un échec par jour ne déclenche jamais rien. Précédent : 35 échecs `Class "Resend" not found` accumulés sans bruit en préproduction.
  - Établi comment : lu.
- Piste : un seuil par classe de job, nul pour l'argent et le bail ; ou un `failed()` qui écrit une activité alertable.
- Mesure (2026-10-15, 28167fee, mesureur) : lu `EvaluateOperationalAlerts.php:27` (`FAILED_JOBS_SPIKE_THRESHOLD = 20`) et `:33-37` (fenêtre d'une heure) ; `routes/console.php:37,43,59` → les trois jobs passent par `Schedule::job` ; les trois classes `implements ShouldQueue` (`Jobs/Lease/ApplyLateFeesJob.php:22`, `Jobs/SendLeasePaymentReminders.php:43`, `Jobs/Invoice/SendOverdueRemindersJob.php:21`), aucune n'a de `failed()` (grep) ; `vendor/…/Scheduling/Schedule.php:221-222` → un `ShouldQueue` est seulement mis en file, donc `ScheduledTaskFinished` et la ligne `scheduled_task_runs` ne voient que la mise en file. Le constat tient en entier ; le précédent de préproduction n'est pas re-mesurable d'ici. Classement : V7, la piste laisse ouverts le mécanisme et la liste des jobs « d'argent et de bail », et un événement alertable neuf est un comportement visible neuf.
- Mesure (2026-10-17, b6b91c91e, implementeur) : avant correctif, `(new ApplyLateFeesJob)->failed($e)` lève `Call to undefined method` (de même pour `SendLeasePaymentReminders` et `SendOverdueRemindersJob`) : aucun des trois n'a de `failed()` → `CriticalJobFailureAlertTest` : `failed()` de chacun écrit `ops_critical_job_failed` (job, classe de l'exception, sans son message), et une règle active part en synchrone ; ablation du trait `AlertsOnFirstFailure` → 3 rouges sur 4, remis → 4 verts.

### L'alerte de santé reste verrouillée après le premier « dégradé »
- Réf : P14.05
- Statut : fait · TCK-769
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Console/Commands/EvaluateOperationalAlerts.php:47`, `takussan-api/app/Services/Admin/AlertRuleService.php:78-82`
- Constat :
  - La transition repose sur un booléen, `status !== 'ok'` : un passage de `degraded` à `failed` ne déclenche rien de nouveau.
  - En préproduction, `MAIL_MAILER=log` tient la sonde `mail` à `degraded` en permanence.
  - Le message d'alerte perd les `properties` : on ne sait pas quelle sonde a échoué.
  - Établi comment : lu.
- Piste : déclencher sur l'ensemble des sondes en échec et sur leur niveau ; inclure `properties` dans le message.
- Mesure (2026-10-15, 28167fee, mesureur) : lu `EvaluateOperationalAlerts.php:47-53` → `ops_health_degraded` vaut `status !== 'ok'`, un booléen ; `:66-74` n'écrit qu'au passage de faux à vrai, donc `degraded` → `failed` se tait ; `HealthcheckService.php:209-210` → transport `log` ⇒ sonde `mail` `degraded`, et `docs/infra/prod-drivers.json:50-52` relève `MAIL_MAILER=log` en préproduction ; `AlertRuleService.php:76-87` (le constat citait 78-82) → le message ne porte qu'`event`, `actor`, `subject`, les `properties` (dont `failing`) restent dans l'activité. Le constat tient en entier. Classement : V7, la règle de ré-alerte et un message enrichi changent ce que reçoit le destinataire, sans spec qui les fixe.
- Mesure (2026-10-17, 640b250a6, implementeur) : `HealthAlertRealertTest` avant correctif → 3 rouges sur 5 (`degraded` puis `failed` : 1 alerte ; une sonde de plus : 1 alerte ; message sans les sondes) → la transition de la santé porte une signature (statut global et sondes triées), et le message ajoute « sondes en échec : mail (degraded), … ». Ablation : signature retirée → 2 rouges, suffixe retiré → 1 rouge ; remis → 5 verts, et `EvaluateOperationalAlertsTest`, `OperationalAlertDeliveryTest` verts.

### Le courriel de notification n'est jamais retenté
- Réf : P14.06
- Statut : fait · TCK-770
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Jobs/SendRawNotificationEmailJob.php:38-48`
- Constat :
  - Le commentaire promet que « transient failures are still retried via $tries ».
  - Mais le `catch (\Throwable)` attrape chaque tentative, appelle `report()` et rend le job réussi : `$tries = 3` et `backoff` ne servent à rien.
  - Un seul essai, aucune ligne dans `failed_jobs`.
  - Établi comment : lu.
- Piste : ne rattraper qu'à la dernière tentative (`$this->attempts() >= $this->tries`), ou relancer et laisser `failed()` agir.
- Mesure (2026-10-15, 28167fee, mesureur) : lu `Jobs/SendRawNotificationEmailJob.php:23-48` → `$tries = 3`, `backoff [10, 60, 180]`, et un `catch (\Throwable)` sans condition ; test temporaire (Mail::raw qui lève, `handle()` appelé, retiré ensuite) → vert, aucune exception à la première tentative (`attempts() = 1`) : le job est réussi, jamais retenté (charge 2,49 sur 8 cœurs). Classement : A1, le commentaire `:38-41` du job écrit le comportement attendu (retenter par `$tries`, n'avaler qu'à la dernière tentative), et le corriger ne demande aucun choix de produit.
- Mesure (2026-10-17, 640b250a6, implementeur) : `SendRawNotificationEmailJobTest` avant correctif → rouge à la tentative 1 sur 3 (`Mail::raw` qui lève : aucune exception ne sort, le job est réussi) → `handle()` relève tant qu'il reste une tentative, hors file `sync` où l'échec reste avalé ; 3 verts. Ablation : relance retirée → 1 rouge ; garde `SyncJob` retirée → 1 rouge (l'échec atteint l'appelant) ; remis → verts, `NotificationTest` vert.

### Aucun rapporteur d'erreurs, ni côté API ni côté front
- Réf : P14.07
- Statut : retenu · à valider — V6 : dépendance neuve et ADR « rapport d'erreurs » ; porteur (2026-10-15) : traité hors agents, ADR « rapport d'erreurs » à écrire
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/composer.json`, `takussan-web/package.json`, `takussan-web/src/app/error.tsx:35-37`
- Constat :
  - Ni Sentry, ni Flare, ni Nightwatch.
  - Côté front, ni `instrumentation.ts` (`onRequestError`) ni `global-error.tsx`. Les frontières d'erreur font un `console.error` dans le navigateur, et le `digest` montré à l'utilisateur ne renvoie à rien de consultable.
  - Établi comment : mesuré, grep et find.
- Piste : un ADR « rapport d'erreurs » (GlitchTip auto-hébergé ou Sentry), avec la forme `SafeExceptionContext` de TCK-613.
- Mesure (2026-10-15, 28167fee, mesureur) : grep `sentry|flare|nightwatch|bugsnag|glitchtip` dans `takussan-api/composer.json` et `takussan-web/package.json` → rien ; `find takussan-web -maxdepth 3 -name 'instrumentation*' -o -name 'global-error*'` → rien ; lu `takussan-web/src/app/error.tsx:35-37` → `console.error` seul ; aucun ADR ni ticket ne traite d'un rapporteur (grep `docs/adr`, `docs/backlog/tickets`). Le constat tient en entier. Classement : V6, la piste demande un ADR et une dépendance.

### Les journaux de l'API disparaissent à chaque déploiement
- Réf : P14.08
- Statut : retenu · à valider — V5 : configuration de déploiement et catalogue des drivers ; porteur (2026-10-15) : traité hors agents, avec P14.07
- Gravité : 🟠 risque ou dette
- Où : `deploy/server/bootstrap.sh:99-102`, `deploy/takussan/compose.api.yml:14-16`, `docs/infra/prod-drivers.json`
- Constat :
  - Le plan prescrit `LOG_CHANNEL=stderr`, donc des journaux Docker `json-file` de 10 Mo × 3.
  - `up -d` recrée les conteneurs à chaque `IMAGE_TAG`, et les journaux de l'ancien partent avec lui. Rien ne les exporte.
  - `LOG_CHANNEL` et `LOG_LEVEL` ne figurent pas dans `prod-drivers.json` : aucune garde ne les voit.
  - Établi comment : lu. La valeur réelle en préproduction est à vérifier.
- Piste : ajouter les clés `LOG_*` au catalogue des drivers ; exporter les journaux (Loki, Vector, ou le rapporteur du constat précédent).
- Mesure (2026-10-15, 28167fee, mesureur) : lu `deploy/server/bootstrap.sh:101-102` → `json-file`, `10m` × 3 ; `deploy/takussan/compose.api.yml:16-17` → seul `storage/app` est un volume, `storage/logs` part avec le conteneur ; `grep -c LOG_ docs/infra/prod-drivers.json` → 0 ; `LOG_CHANNEL=stderr` est écrit dans `deploy/takussan/.env.smoke.example:12` et `LOG_CHANNEL` est listée parmi les clés fixées par le plan (`docs/infra/hebergement.md:128`), sans valeur. La valeur réelle en préproduction n'est pas mesurable d'ici (Dokploy hors du poste). Classement : V5, le correctif touche `deploy/`, Dokploy et le catalogue des environnements.

### Des notifications de prospects et de visites avalées sans trace
- Réf : P14.09
- Statut : fait · TCK-771
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Lead/ContactLeadService.php:232,332,346`, `takussan-api/app/Services/Visit/VisitNotifier.php:181,214`, `takussan-api/app/Services/Messaging/GroupConversationService.php:152`
- Constat : des `catch (\Throwable) {}` sans `report()`. Si l'agent n'est pas prévenu d'une demande venue du site public, rien n'est journalisé, même si la demande est bien enregistrée (lu).
- Piste : `report($e)`, sans changer le caractère non bloquant.
- Mesure (2026-10-15, 28167fee, mesureur) : lu `Services/Lead/ContactLeadService.php:232,332,346`, `Services/Visit/VisitNotifier.php:181,214`, `Services/Messaging/GroupConversationService.php:152` → six `catch (\Throwable)` vides, sans journal (`git grep 'report($e' app/Services` → 0). Le constat tient en entier. Mais `report($e)` écrit `getMessage()`, qu'`app/Support/Logging/SafeExceptionContext.php` (ADR-0044 §2) interdit : un refus SMTP y recopie l'adresse du destinataire. Classement : V3, il faut décider quoi journaliser depuis ces chemins de données de prospects, et aucun critère A ne couvre l'ajout d'un journal.
- Mesure (2026-10-17, 640b250a6, implementeur) : `SwallowedNotificationFailuresAreLoggedTest` avant correctif → 5 rouges sur 5 (un envoi qui lève « refus SMTP pour <adresse> » ne laisse aucune ligne de journal, sur les six `catch`) → chacun écrit un `Log::warning` à libellé fixe, l'identifiant de l'objet et `SafeExceptionContext::of($e)`, sans l'adresse, et l'action aboutit. Ablation : les trois fichiers remis → 5 rouges ; remis → 5 verts, et 41 tests voisins verts.

### Données personnelles écrites au journal, hors du périmètre de TCK-613
- Réf : P14.10
- Statut : fait · TCK-773
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Payments/Drivers/WaveDriver.php:66,95`, `OrangeMoneyDriver.php:83,114,176`, `takussan-api/app/Services/Notifications/Sms/Dlr/DlrReportApplier.php:111`
- Constat :
  - En cas d'échec, les pilotes de paiement journalisent le corps entier de la réponse.
  - Les canaux SMS et WhatsApp journalisent le numéro complet, déjà noté à l'angle 11, et le DLR le `msisdn`.
  - TCK-613 ne couvre aucun de ces emplacements.
  - Établi comment : lu. Le contenu réel des corps Wave et OM est à vérifier.
- Piste : étendre TCK-613 : statut et code du fournisseur seulement, numéro masqué.
- Mesure (2026-10-15, 28167fee, mesureur) : lu `Payments/Drivers/WaveDriver.php:66,95` et `OrangeMoneyDriver.php:83,114,176` → `'body' => $response->body()` à chaque échec ; `Notifications/Sms/Dlr/DlrReportApplier.php:108-112` → `msisdn` en clair, et `:71-75` journalise aussi `$record->raw` entier ; `grep Wave|Orange|Dlr|msisdn` dans `TCK-613` (`todo`) → aucun de ces emplacements. Le contenu réel des corps Wave et OM reste à vérifier : il faudrait une réponse du fournisseur. Classement : V3, la piste décide de ce qu'un journal garde des données personnelles, sur des pilotes de paiement qui relèvent aussi de V1.
- Mesure (2026-10-17, b6b91c91e, implementeur) : avant correctif, une réponse 400 de Wave ou d'Orange Money portant `221771234567` se retrouve au journal par `body`, et `DlrReportApplier` journalise le `msisdn` en clair (rapport sans tentative) et le `raw` entier (statut inconnu) : 4 rouges → `ProviderResponseContext` (statut et code fournisseur), numéro masqué par `WebhookPayloadRedactor::maskPhone`, `record` retiré ; `PaymentDriverErrorLeakTest` et `MtargetDlrPullingTest` : 23 verts, ablation des trois fichiers → 4 rouges.

### Server actions : un bug devient « erreur réseau », sans journal
- Réf : P14.11
- Statut : fait · TCK-775
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/actions/notifications.ts:23-35`, `takussan-web/src/app/actions/admin-settings.ts:63-80`
- Constat :
  - Une erreur qui n'est pas une `ApiError` (`TypeError`, parsing) rend le message de repli et n'écrit rien côté serveur Next.
  - On compte 12 `console.*` dans `actions/` et `api/`, pour 27 modules qui attrapent des erreurs.
  - Établi comment : mesuré.
- Piste : un `failure()` commun qui journalise côté serveur toute erreur autre qu'une `ApiError`.
- Mesure (2026-10-15, 96d4feb, mesureur) : lu `takussan-web/src/app/actions/notifications.ts:23-35` (`failure()` : hors `ApiError`, rend le repli sans rien écrire) et `admin-settings.ts:63-87` (`mapError()`, même chose) ; `grep -rln catch src/app/actions/*.ts` → 27 modules ; `grep -rn 'console\.' src/app/actions src/app/api` → 2 appels réels dans `actions/` (`dashboard-properties.ts:64,68`) et 9 dans `api/`, les autres occurrences étant des mots de commentaire (« console.ts ») ; `takussan-web/CLAUDE.md` ne fixe aucune convention de journalisation → le constat tient. Classement : V3, aucun critère A ne s'applique (rien n'écrit le comportement attendu) et journaliser côté serveur une erreur qui peut porter des données saisies décide de ce qui est conservé.
- Mesure (2026-10-17, e44272cb7, implementeur) : `erreurs-inattendues-journalisees.test.ts` avant correctif → un `TypeError` levé dans `getNotificationsAction` et un `SyntaxError` dans `createIntegrationAction` rendent le repli sans aucun `console.error`, et 27 modules `'use server'` sur 27 qui attrapent n'ont aucun journal commun (6 ont un `catch` sans nom d'erreur) → `journaliserErreurInattendue` (module, nom, message, pile ; ni arguments ni `cause`) branchée dans chaque repli et chaque `catch`. Ablation : fonction neutralisée → 2 rouges ; `notifications.ts` remis → 2 rouges ; remis → 58 verts, et 200 tests de `actions/__tests__` verts.

### Petites améliorations
- Réf : P14.12
- Statut : fait · TCK-774 — reste : la sonde payments et son seuil d'alerte
- Gravité : 🟢 amélioration
- Constat :
  - **Paiements et webhooks** : aucun événement alertable ne les concerne, et `SystemMetricsController.php:35-46` n'a aucun taux d'échec. Il faut aller lire `/admin/webhook-logs`. Le SMS, lui, a une sonde de taux d'échec (lu).
  - **Journaux** : ni identifiant de requête ni agence, aucun `Log::withContext` ni `Context::add` (`bootstrap/app.php:151-153`). Une erreur ne se relie ni à l'accessLog Traefik ni à une agence (mesuré).
- Piste :
  - une sonde `payments` (taux d'échec et webhooks `rejected` sur l'heure) dans `HealthcheckService` ;
  - un middleware qui pose `request_id`, le profil et l'agence actifs dans le contexte des journaux.
- Mesure (2026-10-16, b775f8f6, mesureur) : lu `SystemMetricsController.php` (l. 35-46 sont aujourd'hui `TREND_KEYS` ; aucun taux d'échec de paiement ni de webhook) et `HealthcheckService::probe` (aucune sonde `payments`) ; `grep -rn 'Context::add\|withContext\|shareContext' app bootstrap` → rien ; `bootstrap/app.php:151-153` journalise `query_exception` avec le seul `user_id` → les deux constats tiennent. Classement : V8, la sonde et le contexte de journal font deux tickets, la sonde demande un seuil, et mettre l'agence dans chaque journal touche V3.
- Mesure (2026-10-17, b6b91c91e, implementeur) : avant correctif, un `Log::info` écrit dans une route du groupe `api` n'a ni `request_id` ni agence ni profil dans son contexte (`Undefined array key "request_id"`, 2 rouges) → middleware `ShareRequestLogContext` après `ResolveActiveProfile` (`Log::withContext`) ; `RequestLogContextTest` : 2 verts, ablation du middleware → 2 rouges. La sonde `payments` n'est pas faite (reste du porteur).

## Angle 13 — Code mort et doublons

Les cinq 🔴 ont été relus par la session dans le code, et les routes relevées par `php artisan route:list --json` :
- `POST api/leases/{lease}/payments/generate-schedule` existe, et `api/leases/{id}/generate-schedule` n'existe pas ;
- aucune route ne contient `attach` ;
- aucune route `api/customers/{customer}/documents` ;
- `POST api/lease-payments/{payment}/mark-paid` existe, et le front n'appelle que `…/late-fee/mark-paid` ;
- `PaymentController::store` transmet `status` et `paid_at`, puis `authorizeLeaseManage` admet le locataire.

L'angle a trouvé des **fonctions cassées par un contrat rompu** plus que du code mort au sens strict. C'est l'objet de l'angle 45.

### « Enregistrer un paiement » crée une échéance en attente, et aucun écran n'atteint `mark-paid`
- Réf : P13.01
- Statut : fait · TCK-681
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/leases/LeasePaymentDialog.tsx:55-56,122-127`, `takussan-api/app/Http/Requests/Api/StoreLeasePaymentRequest.php:38-47`, `takussan-api/app/Services/Model/LeasePaymentService.php:26`, `takussan-api/routes/api/leases.php:60`
- Constat :
  - Le dialogue envoie `paid_at` et `reference_number`. Aucun des deux ne figure dans les règles, `status` non plus : `validated()` les retire.
  - `create()` écrit alors une ligne `pending`, sans date. Saisir un loyer reçu ajoute une échéance en attente au lieu de régler l'échéance existante.
  - `POST /api/lease-payments/{id}/mark-paid`, la voie gardée (verrou, checkout ouvert, caution), n'a aucun appelant dans le front.
  - Établi comment : lu de bout en bout, et grep.
- Piste : faire appeler `mark-paid` par l'écran sur l'échéance choisie ; refuser `paid_at` à la création, ou le prendre en compte.
- Mesure (2026-10-15, 6c8a08b0, mesureur) : lu `LeasePaymentDialog.tsx:55-56,122-131` (envoie `paid_at` et `reference_number`), `StoreLeasePaymentRequest::rules()` (ni `paid_at`, ni `reference_number`, ni `status`), `LeasePaymentController` (`validated()` puis `create`) et `LeasePaymentService::create` (`status` par défaut `pending`) ; `grep -rn 'mark-paid' takussan-web/src` hors tests → seuls `/api/lease-payments/{id}/late-fee/mark-paid`, les commissions et les factures ; la route `lease-payments/{payment}/mark-paid` (`routes/api/leases.php:60`) n'a aucun appelant. TCK-619 (`todo`) ne garde que le verrou serveur de `mark-paid`. Classement : V1, la piste change la façon dont un loyer reçu est écrit et réglé.
- Mesure (2026-10-16, d0957db9, implementeur) : avant correctif, `POST /api/leases/{id}/payments` avec `paid_at` rendait 201 et une échéance `pending` (`LeaseTest::test_create_lease_payment_refuses_paid_at` rouge), et `LeasePaymentDialog` appelait la création ; `paid_at` est désormais `prohibited` (422, aucune ligne), et le dialogue règle l'échéance `pending` ou `late` choisie par `mark-paid` (`LeasePaymentDialog.test.tsx`, `regler-une-echeance.test.tsx`). Ablation : règle retirée → `LeaseTest` 1 rouge sur 9 ; ancien dialogue remis → 3 rouges sur 3 ; remis, verts.

### « Générer l'échéancier » appelle une route qui n'existe pas
- Réf : P13.02
- Statut : fait · TCK-682
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/lib/queries/leases.ts:436`, `takussan-api/routes/api/leases.php:33`, `takussan-api/app/Http/Controllers/Api/LeaseController.php:154`
- Constat :
  - Le front poste sur `/api/leases/{id}/generate-schedule`, alors que la route est `/api/leases/{id}/payments/generate-schedule` : l'appel rend un 404.
  - Le front attend `generated` dans la réponse, l'API rend `payments_created`.
  - Le bouton est monté sur `/app/leases/[id]` (`LeaseDetail.tsx:181`). L'écart date de TCK-044.
  - Établi comment : mesuré par `route:list`, et lu.
- Piste : aligner le chemin et la clé de réponse.
- Mesure (2026-10-15, 6c8a08b0, mesureur) : `php artisan route:list --path=generate-schedule` → une seule route, `POST api/leases/{lease}/payments/generate-schedule` ; lu `leases.ts:434-444` (`/api/leases/${leaseId}/generate-schedule`, réponse typée `{ generated: number }`), `LeaseController.php:149-154` (rend `payments_created`) et `LeaseDetail.tsx:65,181-184` (bouton monté) → le chemin du front n'existe pas. Aucun ticket ouvert ne le traite (TCK-044, TCK-596 `done`). Classement : V1, le correctif est un alignement de chemin et de clé (A1 par le contrat de la route), mais il rend atteignable depuis l'écran l'écriture d'échéances de loyer, et le doute classe à valider.
- Mesure (2026-10-16, d0957db9, implementeur) : `useGenerateSchedule(42).mutateAsync({})` émettait `POST /api/leases/42/generate-schedule` (route absente) et `tsc` refusait `payments_created` sur `{ generated: number }` → chemin aligné sur `/api/leases/{id}/payments/generate-schedule` et réponse typée `payments_created` ; test `generer-echeancier.tck-682.test.tsx` vert, ablation : correctif retiré, chemin rouge et 1 erreur `tsc`, remis, vert.

### Pièces jointes de la messagerie : envoi vers une route absente
- Réf : P13.03
- Statut : fait · TCK-683
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/messages/ChatView.tsx:226,442`, `takussan-web/src/lib/queries/conversations.ts:423`, `takussan-api/app/Http/Controllers/Api/ConversationController.php:285-299`
- Constat :
  - Le trombone poste sur `/api/conversations/{c}/messages/{m}/attachments`, et aucune route ne contient `attach`.
  - L'API n'accepte que la note vocale, dans `sendMessage` : le texte part, le fichier échoue sur « uploadFailed ».
  - Établi comment : mesuré, et lu.
- Piste : accepter le fichier dans `sendMessage`, comme l'audio, ou retirer le trombone.
- Mesure (2026-10-15, 5062193b, mesureur) : lu `ChatView.tsx:221-233` (`uploadAttachment` poste `file` sur `/api/conversations/{c}/messages/{m}/attachments`, appelé l. 255 après l'envoi du texte, erreur `chat.uploadFailed` l. 257) et `conversations.ts:423` (même chemin) ; `php artisan route:list --path=conversations` → 17 routes, aucune ne contient `attach` (`route:list | grep -i attach` vide) ; `ConversationController::sendMessage` (l. 285-299) ne lit que `audio`. Les lignes citées tiennent, à `ChatView.tsx:226` près (l'appel, la fonction commence l. 221). Classement : V7, la piste laisse le choix entre une voie d'envoi neuve côté API (fichier joint à un message, comportement visible neuf) et le retrait du trombone (fonction visible retirée).
- Mesure (2026-10-16, d0957db9, implementeur) : reproduit avant correctif — `route:list --path=conversations` rend 17 routes, aucune avec `attach` ; `ChatView.tsx` montait le trombone (`aria-label="Joindre un fichier"`, `input type="file"`) et postait sur `/messages/${messageId}/attachments`, comme `useUploadAttachment` (`conversations.ts:423`, sans appelant) → trombone et hook retirés, note vocale gardée ; `ChatView.test.tsx` (aucun trombone rendu ; aucun fichier de `src/` ne vise `messages/${…}/attachments`) : 2 rouges sans le correctif, 2 verts avec.

### Documents de la fiche client : envoi vers une route absente
- Réf : P13.04
- Statut : fait · TCK-700
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/lib/queries/customers.ts:187`, `takussan-web/src/components/customer-dashboard/CustomerDocumentsPanel.tsx:46`
- Constat :
  - L'onglet Documents (`CustomerDetailTabs.tsx:107`) poste sur `/api/customers/{id}/documents`, qui n'existe pas.
  - La même page offre `AddDocumentButton`, qui passe par `/api/documents` : deux voies d'ajout, dont une cassée.
  - Établi comment : mesuré, et lu.
- Piste : faire passer le panneau par `AddDocumentButton`.
- Mesure (2026-10-15, 5062193b, mesureur) : lu `customers.ts:179-195` (`uploadCustomerDocument` poste sur `/api/customers/{id}/documents`), appelé par `uploadCustomerDocumentAction` (`dashboard-customers.ts:173-190`) depuis `CustomerDocumentsPanel.tsx:46` ; `php artisan route:list --path=customers | grep -i doc` → vide ; `/api/documents` accepte `documentable_type=customer` (`DocumentController.php:29`) et écrit la même relation `Customer::documents()` (morph `documentable`) que le panneau liste par `include=documents` (`customers.ts:114`) ; `AddDocumentButton` est monté sur la fiche (`customers/[id]/page.tsx:139`). `StoreDocumentRequest` exige `name` et `type`, que le panneau n'envoie pas. Classement : A1, le geste attendu (déposer une pièce sur la fiche) est déjà tenu par `POST /api/documents` et par `AddDocumentButton` ; le correctif branche le panneau sur ce composant, sans choix de produit.
- Mesure (2026-10-16, 7010f9e7, implementeur) : reproduit avant correctif — `route:list --path=customers | grep -i doc` vide ; `CustomerDocumentsPanel` postait par `uploadCustomerDocumentAction` sur `/api/customers/${…}/documents` (`customers.ts:179-195`) → panneau branché sur `AddDocumentButton` (`customer`, id de la fiche), `onUploaded` ajouté au bouton et au dialogue pour `router.refresh()`, action et requête cassées retirées ; `CustomerDocumentsPanel.test.tsx` (bouton monté pour la fiche, refresh après dépôt ; aucun fichier de `src/` ne vise `customers/${…}/documents`) : 2 rouges avant, 1 rouge à l'ablation du panneau, 2 verts ; `DocumentUploadDialog.onUploaded.test.tsx` (vrai formulaire, `documentable_type: 'customer'`, `onUploaded` appelé) : rouge à l'ablation, vert.

### `POST /api/payments`, sans appelant, laisse le locataire se déclarer payé
- Réf : P13.05
- Statut : fait · TCK-684
- Gravité : 🔴 défaut avéré (effets en aval à vérifier)
- Où : `takussan-api/app/Http/Controllers/Api/PaymentController.php:37-92,372-382`, `takussan-api/app/Http/Requests/PaymentStoreRequest.php:13-15,30-32`, `takussan-api/app/Services/Model/LeasePaymentService.php:26`, `takussan-api/app/Services/Model/BookingPaymentService.php:22-24`
- Constat :
  - `authorize()` accepte tout compte connecté. `authorizeLeaseManage` admet le locataire (« tenant can create their own **pending** lease payment »), `authorizeBookingManage` le client.
  - Mais `status` (sauf `cancelled`) et `paid_at` sont validés puis transmis tels quels, et `LeasePaymentService::create` garde le statut fourni.
  - Pour une réservation, l'absence de statut vaut déjà `Paid`.
  - La route contourne `recordPayment` (TCK-587) et toutes les gardes de `markPaid`, et aucun test n'essaie le locataire ni le client.
  - Établi comment : écriture lue ; soldes, reçus et relevés en aval à vérifier.
- Piste : retirer la route, qui n'a aucun appelant. À défaut, forcer `pending` et refuser `paid_at` à tout autre que le personnel.
- Mesure (2026-10-15, 5062193b, mesureur) : lu `PaymentController.php:37-92` (statut et `paid_at` transmis tels quels) et `:372-382` (`authorizeLeaseManage` admet le locataire), `PaymentStoreRequest.php:13-15,30-32`, `LeasePaymentService.php:23-35` (statut fourni gardé) ; test temporaire, retiré depuis : un compte lié par `Customer.user_id` au locataire d'un bail poste `status=paid`, `paid_at` sur `/api/payments` → **201**, `data.status = paid`. Aucun appelant front (`grep` de `/api/payments` hors `history` dans `takussan-web/src` vide) ; seul `PaymentRegistrationTest` appelle la route, sans cas locataire ni client. Effets en aval (soldes, reçus, relevés) non re-mesurés. Classement : V1, retirer la route ou restreindre qui écrit un paiement `paid` touche l'écriture d'un paiement.
- Mesure (2026-10-16, 0f922581, implementeur) : `PaymentRegistrationTest`, six cas neufs : avant correctif, un locataire qui poste `status=paid` et un client qui poste sans statut ou avec `status=paid` obtiennent un paiement `paid`, et `paid_at` envoyé par l'un ou l'autre rend 201 (5 rouges ; le bailleur `paid` reste vert) → les deux helpers de `PaymentController` rendent le rôle, le statut du payeur est forcé à `pending` et son `paid_at` rend 422 sans écriture ; 14 verts, ablation : contrôleur de `pre-dev` remis, 5 rouges, correctif remis, 14 verts.

### La colonne « Push » des préférences ne pilote rien
- Réf : P13.06
- Statut : retenu · à valider — V7 : retirer la colonne Push ou décider d'un temps réel ; porteur (2026-10-15) : traité hors agents, avec le temps réel (P11.07), ADR à écrire
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Notifications/PreferenceResolver.php:46`, `takussan-api/app/Notifications/NewBookingNotification.php:75-76`, `takussan-api/app/Events/NewMessage.php`
- Constat :
  - L'écran des préférences affiche une colonne Push. Elle correspond à `broadcast` dans 14 notifications.
  - Le pilote est `log`, et il n'y a ni client Echo ou Pusher, ni Reverb.
  - `NewMessage` n'est jamais déclenché.
  - Le constat est plus large que celui de l'angle 11, qui ne relevait que `NewNotification`.
  - Établi comment : mesuré, et lu.
- Piste : retirer `push` de `CHANNELS` et le canal `broadcast`, ou décider d'un temps réel par un ADR.
- Mesure (2026-10-15, 96d4feb, mesureur) : lu `PreferenceResolver.php:39,47` (`CHANNEL_PUSH` dans `CHANNELS`) et `NotificationPreferencesMatrix.tsx:92` (`push` dans les canaux par défaut) ; `grep -rln "'broadcast'" app/Notifications` → 14 fichiers ; `config/broadcasting.php:18` (défaut `null`) et `.env.example:121` (`log`), aucune clé `BROADCAST` dans `docs/infra/prod-drivers.json` ; `grep laravel-echo|pusher|reverb takussan-web/package.json` → rien ; `grep -rn NewMessage app routes` hors sa classe → aucun déclenchement. Le constat tient. Classement : V7, retirer une colonne visible de l'écran ou choisir un temps réel (V6, ADR) est un choix de produit.

### Réglages d'agence : trois magasins, dont deux sans écrivain
- Réf : P13.07
- Statut : fait · TCK-778
- Gravité : 🟠 risque ou dette — **concerne cette branche**
- Où : `takussan-api/app/Support/ScopedSetting.php:30`, `takussan-api/app/Http/Controllers/Api/SettingController.php:37`, `takussan-api/app/Services/Booking/BookingExpirationService.php:43`, `takussan-api/app/Services/Payments/PaymentGatewayService.php:1327`, `takussan-api/app/Http/Requests/AgencyUpdateRequest.php:59-66`, `takussan-api/database/seeders/System/SettingsSeeder.php:15-21`
- Constat :
  - **Table `settings`, portée agence** : lue par les cinq services de TCK-651 (`agencyRow()`), mais son seul écrivain est `POST /api/settings`, que le front n'appelle pas. ADR-0065 l'avait écrit dans son hors-périmètre : « l'API seule le permet ».
  - **Colonne JSON `agencies.settings`** : `booking_pending_expiry_hours` et `currency` y sont lues, mais aucune requête ne les écrit. `excludeUnvalidatedArrayKeys` les retire.
  - **Devise** : `settings['currency']` l'emporte sur la colonne `agencies.currency`, la seule validée.
  - **Seeder** : il écrit sept clés globales et `branding`, que rien ne lit, dont `late_payment_penalty_rate`. Ce sont les clés mortes déjà notées hors périmètre de TCK-651.
  - **Déballage** : cinq copies de `$value['value'] ?? array_values($value)[0]` coexistent avec `PlatformSettingService::unwrap()`, qui exige exactement `['value']`. Les deux formes divergent sur `{"months":3}`.
  - Établi comment : lu, et mesuré.
- Piste : un seul lecteur `ScopedSetting::value($key, $agencyId)` qui porte le déballage ; retirer les clés du seeder et la lecture de `settings['currency']`. Voir l'angle 47.
- Mesure (2026-10-15, 96d4feb, mesureur) : lu `ScopedSetting.php:30-40` (`agencyRow()`, lecture seule) ; `routes/api/settings.php:11` (`POST settings`) et `grep -rn "/settings"` dans `takussan-web/src` → aucun appelant de `/api/settings` ; `BookingExpirationService.php:43` et `PaymentGatewayService.php:1328-1329` lisent `agencies.settings` (`booking_pending_expiry_hours`, `currency`) que `AgencyUpdateRequest.php:59-66` ne valide pas ; `SettingsSeeder.php:15-21` : six des sept clés n'ont aucun lecteur dans `app/` ni le front (`default_timezone` n'apparaît que comme mot dans `SetLocaleMiddleware.php:52`, qui lit `user->timezone`) ; le déballage `$value['value'] ?? array_values($value)[0]` est en **quatre** copies, non cinq (`LeaseRenewalService.php:475`, `RentReviewService.php:163`, `EarlyTerminationService.php:299`, `LateFeeCalculator.php:202`), à côté de `PlatformSettingService::unwrap()` (l. 180). Le constat tient, au compte des copies près. Classement : V4, la piste retire des données semées et touche la devise lue au paiement (V1), en plusieurs correctifs (V8).
- Mesure (2026-10-17, 8ef0d0915, implementeur) : reproduit avant correctif : le déballage en quatre copies et une variante (`OverdueReminderService::offsets`), aucune méthode `ScopedSetting::value()`, et une agence à `settings.currency = eur` et colonne `XOF` payait en `EUR` ; `SettingsSeeder` écrit huit clés, aucune lue dans `app/`, `routes/`, `config/`, `database/` ni le front → `ScopedSetting::value()` porte le déballage (type `_list` du catalogue : liste intacte), les cinq lecteurs l'appellent, `paymentCurrency()` ne lit plus `settings['currency']`, `SettingsSeeder` retiré ; `ScopedSettingReadersTest` (formes stockées, repli sur le catalogue, aucune copie restante) et `PaymentCurrencyFromAgencyColumnTest` : ablation 9 rouges sur 18, correctif remis 18 verts, 22 classes voisines vertes (237 tests).

### Routes en double et routes sans appelant
- Réf : P13.08
- Statut : fait · TCK-780 — reste : leases/{l}/terminate et les autres routes sans appelant
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/routes/api/auth.php:70-71,75-76`, `routes/api/notifications.php:15-16`, `routes/api/guarantors.php:7-12`, `routes/api/search.php:13-14`, `routes/api/leases.php:28,55`, `routes/api/agencies.php:57`
- Constat :
  - **Doublons** : `verify-phone` et `phone/verify-otp`, `phone/resend` et `phone/send-otp`, `notifications/preferences` et `me/notification-preferences`.
  - **Sans appelant** :
    - le CRUD des garants ;
    - `search/messages` et `search/documents` ;
    - `archive` et `unarchive` ;
    - `rent-history`, `expire-now`, `agencies/{a}/stats` ;
    - `settings/public` ;
    - `two-factor/qr` et `recovery-codes` (GET).
  - `leases/{l}/terminate` résilie sur-le-champ, à côté du parcours de résiliation anticipée qu'utilise le front.
  - Les routes appelées par des tiers ou par des liens émis par l'API sont classées à part : `health`, `media/{m}/file|sign`, `pay/{t}/receipt`, `share/{t}/download`, `saved-searches/unsubscribe`.
  - Établi comment : mesuré. Sur 686 routes `api/*`, une vingtaine est confirmée à la main ; le reste est à vérifier.
- Piste : retirer d'abord les doublons et `terminate`, puis la garde de l'angle 45.
- Mesure (2026-10-15, 96d4feb, mesureur) : lu `routes/api/auth.php:70-71,75-76` (`verify-phone` et `phone/verify-otp`, `phone/send-otp` et `phone/resend` sur les mêmes actions), `notifications.php:15-20` (`notifications/preferences` et `me/notification-preferences`), `guarantors.php:7-12`, `leases.php:28,55`, `agencies.php:57`, `bookings.php:19`, `conversations.php:36-37` ; `grep -rln` de chaque chemin dans `takussan-web/src` hors tests, puis des formes `cheminApi` `}/terminate|stats|rent-history|expire-now|archive|unarchive` → aucun appelant pour `verify-phone`, `phone/resend`, `notifications/preferences`, `/api/guarantors` (le front passe par `/api/leases/{id}/guarantors`, `lib/queries/leases.ts:462`), `search/messages`, `search/documents`, `terminate`, `rent-history`, `expire-now`, `agencies/{a}/stats`, `settings/public`, `two-factor/qr`, l'archivage des conversations ; `recovery-codes` n'apparaît que sous `/regenerate` (`lib/security.ts:62`). Le constat tient sur ces routes ; un appelant hors du front (application tierce) n'a pas été cherché. Classement : V8, la piste couvre une quinzaine de routes de familles différentes, dont des routes d'authentification et de 2FA (V2) et une résiliation de bail.
- Mesure (2026-10-17, 8ef0d0915, implementeur) : reproduit avant correctif : `auth.php:70,75` et `notifications.php:15-16` enregistrent les trois doublons, et `grep` dans `takussan-web/src`, `app/`, `scripts/` ne leur trouve aucun appelant (seuls `PhoneVerificationTest` et `NotificationPreferenceTest` les visent) → routes retirées, les deux tests repointés sur `phone/verify-otp`, `phone/send-otp` et `me/notification-preferences` ; `RoutesEnDoubleRetireesTest` : ablation rouge, correctif remis vert ; 35 classes voisines vertes (333 tests). ADR-0033 cite encore `phone/resend` (chemin fermé à l'agent).

### Page orpheline `/onboarding/agency-admin`
- Réf : P13.09
- Statut : fait · TCK-781
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/onboarding/agency-admin/page.tsx:9-12`, `takussan-web/src/app/(auth)/auth/reset-password/page.tsx:43`
- Constat : le docblock la dit atteinte par la redirection de l'e-mail d'activation. Mais la réinitialisation renvoie vers `/auth/login`, et aucun lien ne mène à cette page ni à `AgencyAdminOnboardingWizard` (mesuré, et lu).
- Piste : relier la page depuis l'invitation, ou la retirer.
- Mesure (2026-10-15, 96d4feb, mesureur) : lu `takussan-web/src/app/onboarding/agency-admin/page.tsx:9-14` (docblock « Reachable from the activation email's reset-password redirect ») et `(auth)/auth/reset-password/page.tsx:43` (`router.push('/auth/login?reset=1')`) ; `grep -rn "onboarding/agency-admin|AgencyAdminOnboardingWizard"` dans `takussan-web/src` et `takussan-api/app` → aucune référence hors de la page et du composant ; les redirections d'onboarding mènent toutes à `/onboarding/intention`, qui ne cite pas d'agence. Le constat tient. Classement : V7, la piste propose deux options (relier depuis l'invitation ou retirer une page) qui changent un parcours visible.
- Mesure (2026-10-17, 399c500d3, implementeur) : reproduit avant correctif : `reset-password/page.tsx` pousse toujours `/auth/login?reset=1`, et aucun lien ne mène à `/onboarding/agency-admin` → corrigé par le même ticket que P15.07 : le lien d'activation porte `activation=1`, et la page mène à `/auth/login?reset=1&redirect=%2Fonboarding%2Fagency-admin` ; `transactional-links.test.tsx` rouge avant, vert après (5 sur 5).

### Petites améliorations
- Réf : P13.10
- Statut : validé — fichiers et exports morts côté front, et un seul `formatCurrency` ; reste : le retrait des colonnes en base et le rapport des clés i18n inutilisées
- Gravité : 🟢 amélioration
- Constat (mesuré par un script de résolution d'imports, tests exclus, sauf mention) :
  - **Fichiers front morts** : 8, dont :
    - `Money` et `useAgencyCurrency`, un troisième formateur de montant ;
    - `ShareButton` et `lib/share.ts` ;
    - `useRequireAuth`.
  - **Exports sans appelant** : environ 35, dont :
    - `fetch/upsert/deleteWizardDraft`, en double de `useWizardDraft` ;
    - `useUpdateLease`, `useRefundDeposit`, `useConfirmEarlyTermination` ;
    - `switchActiveProfileAction`.
  - **Deux `formatCurrency` homonymes** (`lib/format.ts:158`, `lib/format/currency.ts:73`) : le second argument est une langue dans l'un et une devise dans l'autre. `formatRelativeDate` fixe `'fr'` en dur (lu ; rendu à vérifier).
  - **Téléphone** :
    - `PhoneRule` n'est employée nulle part, et `CurrencyRule`, `DateRangeRule` et `StrongPasswordRule` ne sont atteintes que par les tests ;
    - la recherche admin (`AdminGlobalSearchService.php:155-160`) et `CustomerPhoneNormalizer` ne normalisent pas pareil.
  - **API, sans appelant** :
    - `InvitationService::acceptForAuthenticatedUser` ;
    - `PreferenceResolver::filterChannels`, recopiée par 14 `via()` ;
    - `QuotaResolver::effectiveLimitsForAgency` ;
    - l'enum `UserRole`.
  - **Colonnes jamais lues ni écrites** : `Property.lot_position` et `admin_monitored`, `ServiceProviderProfile.insurance_policy_id` et `hourly_rate_max`, `OwnerProfile.guarantor_user_id`, `NotificationTemplate.meta_category` et `meta_variables`.
  - **Clés i18n** : environ 202 feuilles sur 8 032 ont un nom absent du code, une partie dynamique. Aucune garde ne les voit.
- Piste : supprimer après relecture des cinq ou six éléments qui touchent un parcours ; un seul `formatCurrency` ; documenter ou retirer les colonnes ; un rapport des clés i18n inutilisées (pas encore un cliquet).
- Mesure (2026-10-16, b775f8f6, mesureur) : `grep -rlw` hors tests dans `takussan-web/src` → `Money.tsx` sans importeur ; `ShareButton`, `deleteWizardDraft`, `useUpdateLease`, `useRefundDeposit`, `useConfirmEarlyTermination`, `switchActiveProfileAction` présents dans leur seul fichier de définition, `useRequireAuth` en plus dans un commentaire d'`AuthContext.tsx:63` ; `formatCurrency` défini deux fois (`lib/format.ts:158`, `lib/format/currency.ts:73`) ; `PhoneRule` citée par le seul commentaire de `ResendPhoneVerificationRequest.php:42`, qui l'écarte délibérément ; `acceptForAuthenticatedUser`, `filterChannels`, `effectiveLimitsForAgency` et l'enum `UserRole` (`app/Models/Enums/UserRole.php`) présents dans un seul fichier d'`app` ; les sept colonnes ne figurent que dans leur modèle → tient sur ce qui a été re-mesuré ; les normalisations de téléphone, `formatRelativeDate` et les clés i18n n'ont pas été re-mesurées. Classement : V4 et V8, retirer des colonnes change le schéma, et l'ensemble fait plusieurs tickets.

## Angle 15 — Parcours d'une agence neuve

Les trois 🔴 ont été relus par la session dans le code :
- `CustomerService::findOrCreateFromUser` (l. 33-48) crée la fiche avec `agency_id = $user->agency_id` et `added_by_id` = le candidat, et `linkUser()` n'a aucun appelant ;
- `LeaseSignatureService.php:55` refuse un locataire sans `user_id` ;
- seuls `AgentProfileController` et `OwnerProfileController` mentionnent `metadata.kyc` ;
- dans `AgencyConfigForm.tsx`, la case `moderation_required` (l. 401-423) est rendue avant le bloc `individual ? null` (l. 497) ;
- `/app/agency/moderation/properties` exige `agence: 'standard'` (`pages-admin.ts:93-94`), et `PropertyObserver` (l. 120-140) n'exempte personne.

### Un locataire ne peut pas être à la fois lié à un compte et visible de l'agence : la signature n'est jamais atteinte
- Réf : P15.01
- Statut : retenu · à valider — V7 : rattacher un compte à une fiche (invitation ou appariement) est un parcours neuf ; porteur (2026-10-15) : prioritaire, à cadrer en ticket avant de le confier
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Model/CustomerService.php:28-48`, `takussan-api/app/Models/Customer.php:178-196`, `takussan-api/app/Services/Model/LeaseService.php:49-50`, `takussan-api/app/Services/Lease/LeaseSignatureService.php:55`, `takussan-web/src/components/leases/LeaseSignaturePanel.tsx:140-143`
- Constat :
  - Une fiche client créée par l'agence (`/app/customers/new`, conversion d'un prospect) n'a jamais de `user_id`. `StoreCustomerRequest` ne l'accepte pas, et `linkUser()` n'a aucun appelant.
  - La seule voie qui pose `user_id` est `findOrCreateFromUser()`, sur une candidature ou une réservation publique. Elle crée la fiche avec `agency_id` = celui du visiteur (souvent `null`) et `added_by_id` = le candidat.
  - `visibleTo()` et `CustomerPolicy::view` la cachent donc au personnel de l'agence du bien : le sélecteur de locataire ne la propose pas, et `LeaseService` rend 403.
  - Sur tout bail créé depuis l'écran, « Demander la signature » s'affiche, puis l'API répond 422 `tenant_without_account`. La signature par code (ADR-0042), l'espace résident et la check-list d'entrée ne sont jamais atteints.
  - La fiche réutilisée n'est pas bornée à une agence : `->first()` sur `user_id` seul.
  - Établi comment : lu de bout en bout ; grep des écrivains de `user_id`, sans autre résultat.
- Piste : rattacher un compte à une fiche, par une invitation du locataire ou par appariement sur un téléphone ou un e-mail vérifié. Créer la fiche de candidature dans l'agence du bien.
- Mesure (2026-10-15, 5062193b, mesureur) : lu `CustomerService.php:28` (`linkUser`, aucun appelant : `grep -rn linkUser app` ne rend que sa définition et un docblock de `DashboardTenantService.php:22`) et `:33-49` (`findOrCreateFromUser` : `->first()` sur `user_id` seul, `agency_id` = celui du visiteur, `added_by_id` = le visiteur), appelé par `PublicPropertyController.php:956` et `BookingService.php:98` ; `StoreCustomerRequest`/`UpdateCustomerRequest` sans `user_id` ; les deux autres créateurs (`CustomerController.php:61`, `ContactLeadService.php:263`) n'en posent pas ; `Customer::scopeVisibleTo` (l. 178-196) ; `LeaseService.php:49-50` (`can('view', $tenant)` sinon 403) ; `LeaseSignatureService.php:55` (422 `lease_signature.tenant_without_account`). Lu, non exécuté. Classement : V7, la piste ouvre un parcours visible neuf (invitation ou appariement du locataire) et V3, elle décide quel compte se lie à quelle fiche de données personnelles.

### KYC de l'agent et du bailleur : « en revue » pour toujours
- Réf : P15.02
- Statut : fait · TCK-685
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Controllers/Api/Me/AgentProfileController.php:130-141`, `takussan-api/app/Http/Controllers/Api/Me/OwnerProfileController.php:126-131`, `takussan-api/app/Http/Controllers/Api/DocumentController.php:92-98`, `takussan-api/app/Services/Kyc/KycWorkflowService.php:50-58`, `takussan-web/src/messages/fr.json:4825,4957`
- Constat :
  - L'assistant écrit `metadata.kyc.status = pending_review`. Aucun autre code ne relit ni ne bascule ce statut.
  - Aucune notification ne part, et aucun écran d'agence ne montre ces pièces.
  - La file KYC de la console ne connaît que les dossiers d'agence (`dossierForAgency`), et vérifier un `Document` est réservé au super-admin.
  - L'écran promet pourtant « Votre agence va le vérifier ».
  - Établi comment : lu et grep.
- Piste : une file de relecture (agence ou console) avec notification, ou retirer la promesse et le statut.
- Mesure (2026-10-15, 5062193b, mesureur) : lu `AgentProfileController.php:127-141` et `OwnerProfileController.php:118-131` (seuls écrivains de `metadata.kyc.status = pending_review`) ; `grep` de `kyc.status`, `metadata->kyc` et `metadata['kyc']` dans `takussan-api/app` et `takussan-web/src` → aucun autre lecteur (les clés `kyc.status` du front sont les libellés de la file d'agence) ; `KycWorkflowService.php:50` ne connaît que `dossierForAgency` ; `fr.json:4825,4957` promettent « Votre agence va le vérifier. Vous pouvez continuer. ». Notification et écran d'agence absents : lu par `grep`, non exécuté. Classement : V7, la piste choisit entre une file de relecture neuve (agence ou console) et le retrait d'un statut et d'un texte visibles.
- Mesure (2026-10-16, 215e40d5, implementeur) : reproduit avant correctif — `POST /api/me/{agent-profiles,owner-profiles}/{id}/kyc/submit` rendait `data.kyc.status = pending_review` et l'écrivait dans `metadata.kyc` (tests `AgentOnboardingTest`/`OwnerOnboardingTest` réécrits, rouges), et `submittedBody`/`submittedBadge` promettaient la relecture de l'agence et « en revue » dans les trois langues (`kyc-sans-promesse-de-revue.test.ts`, 6 rouges) → les contrôleurs ne posent ni ne renvoient plus `kyc.status`, les textes gardent « Soumis » et « Vous pouvez continuer. » ; ablation (messages et contrôleurs remis à `pre-dev`) : 6/6 et 2/2 rouges, correctif remis : verts. `docs/features.md` (wizard Owner, « en `pending_review` ») reste à faire converger par `/sync-specs`.

### Une agence individuelle qui active la modération ne peut plus publier
- Réf : P15.03
- Statut : fait · TCK-686
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/admin-agency/AgencyConfigForm.tsx:401-423,497`, `takussan-web/src/lib/access/pages-admin.ts:92-96`, `takussan-api/app/Observers/PropertyObserver.php:120-140`, `takussan-api/app/Http/Requests/AgencyUpdateRequest.php:55`
- Constat :
  - La case « Modération obligatoire » s'affiche sur `/app/agency`, ouverte à l'agence `individual`, hors du bloc `individual ? null`. L'API l'accepte sans condition.
  - Une fois cochée, toute publication passe `pending_review`, celle de l'admin comprise : l'observer n'exempte aucun rôle.
  - La file `/app/agency/moderation/properties` exige une agence `standard`. L'hôte solo n'a aucun écran pour s'approuver, et ses biens restent en attente.
  - Établi comment : lu, front et API.
- Piste : cacher et refuser le réglage en `individual`, ou exempter l'admin unique.
- Mesure (2026-10-15, 5062193b, mesureur) : lu `AgencyConfigForm.tsx:401-423` (case `moderation_required` hors du bloc `individual ? null` de la l. 497), `AgencyUpdateRequest.php:55` (`sometimes|boolean`, sans condition sur le type d'agence), `PropertyObserver.php:43-53` et `:129-131` (`moderation_required` → `pending_review`, « Pas d'exemption par rôle »), `pages-admin.ts:92-96` (`/app/agency/moderation/properties` exige `agence: 'standard'`). L'API d'approbation (`POST /api/properties/{p}/approve`, gate `approve-property`) n'a pas été éprouvée pour un admin `individual` : seul l'écran manquant est établi. Classement : V7, les deux pistes (cacher et refuser le réglage, ou exempter l'admin unique) changent un comportement visible et en choisissent un.
- Mesure (2026-10-16, fe095462, implementeur) : avant correctif, `PATCH /api/agencies/{id}` `moderation_required: true` sur une agence `individual` rendait 200 (`AgencyTest::test_individual_agency_cannot_enable_moderation`, rouge « Expected 422 but received 200 »), et `AgencyConfigForm` rendait la case et l'envoyait (`AgencyConfigForm.moderation.test.tsx`, rouge). Correctif : `declined` pour une agence `individual` dans `AgencyUpdateRequest`, case non rendue, clé non envoyée par `normaliseAgencyForm`. Ablation : chacun des trois retraits rougit son test, remis verts. Non fait : une agence `individual` déjà à `true` en base reste modérée (réécriture de données, V4).

### Le second facteur bloque la mise en service, sans la boîte qui le résout
- Réf : P15.04
- Statut : fait · TCK-761
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Support/Security/ProtectedActions.php` (`AGENCY_TWO_FACTOR`), `takussan-web/src/components/admin/InviteAgentDialog.tsx:84-100`, `takussan-web/src/components/admin-settings/IntegrationsManager.tsx:191-196`, `takussan-web/src/components/dashboard/admin/MiseEnService.tsx:37-45`
- Constat :
  - Trois gestes de la mise en service exigent la 2FA de l'admin, hôte solo compris : le taux de commission, les intégrations Wave et Orange Money, l'invitation d'un agent.
  - Leurs formulaires ne passent pas par `useApiMutation` : `GardeDoubleFacteur` ne s'ouvre pas, et le refus s'affiche en erreur de champ.
  - L'étape qui imposait la 2FA (`/onboarding/agency-admin`) est orpheline (angle 13).
  - La carte « Mise en service » met la 2FA en dernier, alors qu'elle conditionne trois étapes.
  - Établi comment : lu ; chemin du service 2FA à vérifier.
- Piste : brancher `avecGardeDoubleFacteur` sur ces formulaires ; placer la 2FA en tête de la carte.
- Mesure (2026-10-15, 96d4feb, mesureur) : lu `ProtectedActions.php:124-175` (`AGENCY_TWO_FACTOR` contient `IntegrationController@store|update|test`, `AgencyController@update`, `AgentInvitationController@__invoke`) ; `RequireTwoFactor.php:80-82` → `TwoFactorRequirement::requiredAtAgency()`, qui rend `true` pour tout titulaire d'un profil d'admin d'agence, hôte solo compris (vérifie le « chemin du service 2FA à vérifier » du constat) ; `grep DoubleFacteur` dans `InviteAgentDialog.tsx` (passe par `useApiForm`, qui ne la gère pas), `IntegrationsManager.tsx` (server actions, refus versé en erreur de champ l. 191-196) et `AgencyConfigForm.tsx` → aucun ; `MiseEnService.tsx:37-45` met `admin_two_factor` en dernier. Le constat tient. Classement : V2, la piste branche la garde de second facteur sur trois formulaires et réordonne la carte (V7).
- Mesure (2026-10-17, 0785a29d, implementeur) : `grep DoubleFacteur` dans `InviteAgentDialog.tsx`, `IntegrationsManager.tsx` et `AgencyConfigForm.tsx` → rien, et `admin-agency.ts` ne rendait pas le `code` du refus ; tests neufs → 10 rouges (garde jamais appelée, geste non rejoué, `admin_two_factor` pas en tête) → les trois formulaires passent par `avecGardeDoubleFacteur[Action]` (enregistrement et confirmation du seuil ; création, modification, activation, test et suppression d'intégration ; invitation), `admin-agency.ts` rend le `code`, la carte met la 2FA en tête. Ablations : `garde = null` → 7 rouges, tri retiré → 1, `code` retiré → 2 ; remis → verts (192 tests des quatre dossiers).

### SMS muet : première publication et signature bloquées, sans repli
- Réf : P15.05
- Statut : fait · TCK-783 — reste : un repli pour la signature d'un bail quand le SMS ne part pas
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Auth/PhoneVerificationService.php:299-325,381-401`, `takussan-api/app/Services/Property/PublishReadiness.php:73`, `takussan-api/app/Services/Lease/LeaseSignatureService.php:120-135`
- Constat :
  - `issue()` rend `true` même quand aucun fournisseur n'a accepté le SMS, et l'écran affiche « code envoyé ».
  - Publier exige le téléphone vérifié du contact principal, et cette vérification n'a pas d'autre canal que le SMS. Sans SMS, aucun premier bien ne devient public.
  - Pour signer un bail, un numéro vérifié impose le SMS, sans repli par e-mail. En préproduction (`MAIL_MAILER=log`), un signataire sans numéro vérifié ne reçoit rien non plus.
  - Établi comment : lu.
- Piste : rendre l'échec de livraison au client ; offrir un repli par e-mail pour la vérification et la signature.
- Mesure (2026-10-15, 96d4feb, mesureur) : lu `PhoneVerificationService.php:299-323` (`issue()` rend `true` après `deliver()`, quelle qu'en soit l'issue) et `:381-401` (`deliver()` ne fait que journaliser quand aucun fournisseur n'accepte) ; `PublishReadiness.php:73` (contact principal au téléphone vérifié exigé) ; `LeaseSignatureService.php:120-121` (un numéro vérifié impose le canal SMS, sans repli par e-mail). Le constat tient ; la préproduction (`MAIL_MAILER=log`) n'a pas été re-mesurée, hors du poste. Classement : V2, la piste change ce que rend une vérification et ouvre un canal de vérification et de signature.
- Mesure (2026-10-17, 0f8959c99, implementeur) : `SmsCodeUndeliveredTest`, routeur dont tout envoi échoue, avant correctif → `phone/send-otp`, `secondary-phone/send-otp` et `phone/change-code` rendent 200 `sent: true` (3 rouges) → `issue()` lève `SmsCodeUndelivered` (503 `phone.sms_undelivered`, message localisé, que les écrans affichent déjà par `messageErreurApi`) ; la connexion par téléphone reste 202, l'aperçu du code (ADR-0060) reste 200. Ablations : levée retirée → 3 rouges, `catch` de la connexion retiré → 1, condition d'aperçu retirée → 1 ; remis → 5 verts, et 202 tests de `Auth/Phone`, des alertes de recherche, de `Lang` et du SMS verts.

### Un bien créé par le personnel fait de l'agent le bailleur du contrat
- Réf : P15.06
- Statut : retenu · à valider — V7 : désigner un bailleur tiers est une fonction neuve ; porteur (2026-10-15) : prioritaire, à cadrer en ticket avant de le confier
- Gravité : 🟠 risque ou dette (intention à vérifier)
- Où : `takussan-api/app/Http/Controllers/Api/PropertyController.php:131-133`, `takussan-api/app/Services/Model/LeaseService.php:78`, `takussan-web/src/components/leases/CreateLeaseForm.tsx:188-192`
- Constat :
  - `properties.user_id` vaut toujours le créateur, et aucune route ne désigne de bailleur tiers.
  - `landlord_id` du bail vaut `property.user_id` : le PDF, les alertes d'impayé et les relevés visent l'agent.
  - Le formulaire affiche « bailleur : {utilisateur courant} », ce qui est faux dès qu'un autre agent a créé le bien.
  - Établi comment : lu.
- Piste : un champ « bailleur » à la création du bien ou du bail, borné aux bailleurs de l'agence.
- Mesure (2026-10-15, 96d4feb, mesureur) : lu `PropertyController.php:132` (`'user_id' => $request->user()->id` à la création), `LeaseService.php:78` (`'landlord_id' => $property->user_id`, la valeur envoyée par le formulaire étant écrasée) et `CreateLeaseForm.tsx:118-119,190` (`landlord_id` forcé à l'utilisateur courant, libellé `activeLandlord`) ; `bulk-assign` (`PropertyController.php:446-455`) change l'agent responsable, pas `properties.user_id`. Le constat tient. `TCK-616` (`todo`) touche le `landlord_id` d'un agent parti, pas la désignation d'un bailleur. Classement : V7, un champ « bailleur » est un comportement visible neuf, qui touche aussi qui reçoit les reversements (V1).

### L'activation du gérant provisionné passe par un e-mail de « réinitialisation »
- Réf : P15.07
- Statut : fait · TCK-781
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Admin/AgencyProvisioningService.php:28-32,108-114`, `takussan-api/lang/fr/notifications.php:42-49`, `takussan-api/config/auth.php:99`
- Constat :
  - Le compte reçoit le gabarit « vous avez demandé une réinitialisation… sinon ignorez », valable 60 min.
  - Un gérant déjà inscrit fait échouer le provisionnement : 409 `agency.admin_email_taken`.
  - Établi comment : lu.
- Piste : un gabarit d'activation dédié, valable plus longtemps, et le rattachement d'un compte existant.
- Mesure (2026-10-15, 2d25d35d, mesureur) : lu `AgencyProvisioningService.php:27-32` (409 `agency.admin_email_taken` si l'e-mail existe) et `:108-115` (`sendActivationLink` = `Password::broker()->sendResetLink`), `User.php:596-599` → `ResetPasswordNotification`, gabarit `lang/fr/notifications.php:42-49` (« demande de réinitialisation… », « Si vous n'avez pas demandé… »), `config/auth.php:99` (`expire` 60) ; `git log` sans correctif depuis TCK-588. Le 409 est voulu par TCK-209 (« si déjà existant… refuser (409) ») ; TCK-209 promettait un e-mail « Activez votre compte » valable ≤ 7 jours (AC l. 69) mais sa note l. 82 assume le broker de réinitialisation à 60 min → seule la partie gabarit et durée tient. Classement : V2, la durée d'un lien d'activation de gérant et le rattachement d'un compte existant touchent l'authentification, et le gabarit est un texte métier neuf (V7).
- Mesure (2026-10-17, 399c500d3, implementeur) : reproduit avant correctif : `AgencyProvisioningService::sendActivationLink` appelle `Password::broker()->sendResetLink`, et le provisionnement envoie `ResetPasswordNotification` (gabarit de réinitialisation, broker `users` à 60 min) ; `AgencyAdminActivationTest` rouge (3 sur 5) → broker `activations` à 7 jours (même table), `AgencyAdminActivationNotification` « Activez votre compte » (fr, en ; `wo` = texte français), lien `activation=1` ; `POST /api/auth/reset-password` ne juge par ce broker qu'un compte sans mot de passe choisi ; la page de réinitialisation mène à la connexion avec `redirect=/onboarding/agency-admin` ; le 409 reste. Ablation : API remise à `pre-dev` → 4 rouges sur 10, condition `hasUsablePassword()` retirée → 1 rouge ; remis → 20 verts sur 4 classes, et 5 verts côté front.

### La carte « Mise en service » n'atteint ni l'agence individuelle ni l'accueil
- Réf : P15.08
- Statut : fait · TCK-777
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/(dashboard)/app/overview/agency/page.tsx:93`, `takussan-web/src/app/(dashboard)/app/overview/agency/layout.tsx:38-50`, `takussan-web/src/app/(dashboard)/app/(accueil)/page.tsx:46-75`
- Constat :
  - La carte n'est montée que sur `/app/overview/agency`, réservé aux agences `standard`.
  - L'hôte solo ne la voit jamais, et le gérant neuf n'a sur `/app` qu'une bannière de logo et un état vide générique.
  - Établi comment : lu.
- Piste : la monter sur l'accueil pour tout admin, avec des étapes filtrées par `kind`.
- Mesure (2026-10-15, 2d25d35d, mesureur) : lu `overview/agency/page.tsx:92-93` (seul montage de `MiseEnService`, avec son test), `overview/agency/layout.tsx:38,54-59` (non-admin redirigé, `kind !== 'standard'` → `redirect('/app')`) et `(accueil)/page.tsx:52-77` (bannière de logo, brouillons, check-list locataire, KPI ou `DashboardEmpty`, raccourcis : aucune mise en service) ; `grep -rl MiseEnService src` → 4 fichiers, tous sous `overview/agency` ou le composant. Le constat tient. TCK-589 l. 204 place la carte « en tête de `/admin` », sans trancher l'agence individuelle. Classement : V7, monter la carte sur l'accueil et filtrer ses étapes par `kind` change ce que voit l'hôte solo.
- Mesure (2026-10-17, e44272cb7, implementeur) : `(accueil)/__tests__/mise-en-service.test.tsx` et `MiseEnService.kind.test.tsx` avant correctif → l'accueil d'un admin `individual` ou `standard` ne monte aucune carte, et la carte d'une agence `individual` liste « premier membre » (7 étapes) → carte montée sous l'en-tête pour tout `agency_admin`, et étapes dont l'écran exige `standard` dans `PAGES_ADMIN` retirées (6 pour `individual`). Ablation : les deux fichiers remis → 4 rouges sur 6 ; remis → 6 verts, et 34 tests voisins verts.

### Premier bail : sélecteur de biens vide, sans explication
- Réf : P15.09
- Statut : fait · TCK-776
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/queries/leases.ts:117`, `takussan-web/src/components/leases/CreateLeaseForm.tsx:133-170`
- Constat :
  - Seuls les biens `available` sont proposés. Un bien neuf est `draft`, un bien modéré `pending_review`, et l'API, elle, n'exige aucun statut.
  - Aucun message ni lien vers « créer le bien » ou « créer le locataire ».
  - Après ce formulaire, l'enregistrement du paiement et la génération de l'échéancier sont cassés (angle 13).
  - Établi comment : lu.
- Piste : élargir le filtre (hors vendu et archivé), et un état vide avec des appels à l'action.
- Mesure (2026-10-15, 2d25d35d, mesureur) : lu `lib/queries/leases.ts:117` (`filter: { status: 'available' }`) et `CreateLeaseForm.tsx:112,136-146` (options = biens rendus, aucun état vide ni lien) ; `StoreLeaseRequest.php:37` n'exige que `exists:properties,id`, et `LeaseService.php` ne lit aucun `PropertyStatus` (grep) ; `PropertyStatus` compte 11 cas (`draft`, `pending_review`, `published`…). Le renvoi à l'angle 13 n'est pas re-mesuré ici. Classement : V7, choisir quels statuts de bien ouvrent un bail et écrire l'état vide avec ses appels à l'action sont des choix de produit.
- Mesure (2026-10-17, e44272cb7, implementeur) : `CreateLeaseForm.biens-proposes.test.tsx` avant correctif → `useLeasePropertyOptions` envoie `filter[status]=available`, et un sélecteur sans bien ni locataire n'affiche ni texte ni lien → `STATUTS_BIEN_POUR_UN_BAIL` (huit statuts, hors `sold`, `archived`, `rented`) et un état vide avec « Créer un bien » et « Ajouter un locataire ». Ablation : les deux fichiers remis → 2 rouges ; remis → 3 verts, et 70 tests de `components/leases` verts.

### Petites améliorations
- Réf : P15.10
- Statut : fait · TCK-782
- Gravité : 🟢 amélioration
- Constat (lu) : il n'existe pas de code de notification « bien soumis à modération » (`NotificationCode.php:131-132` : seulement approuvé et refusé). L'admin ne découvre une soumission que par la file du tableau de bord `standard`, alors que les avis ont `review.to_moderate`.
- Piste : notifier les admins actifs au passage en `pending_review`.
- Mesure (2026-10-16, b775f8f6, mesureur) : lu `NotificationCode.php:131-132` (`property.approved`, `property.rejected`, aucun code de soumission) et `:161` (`review.to_moderate`) ; `grep -rn PendingReview app/Services app/Http/Controllers` → `PropertyModerationService.php:131` repasse un bien en `pending_review` sans notifier, aucun autre émetteur → le constat tient. Classement : V7, une notification aux admins est un comportement visible et un texte neufs.
- Mesure (2026-10-17, 399c500d3, implementeur) : reproduit avant correctif : `NotificationCode` sans code de soumission, et publier ou resoumettre un bien dans une agence à modération obligatoire n'écrit aucune notification (`PropertySubmittedForReviewNotificationTest`, 2 rouges) → code `property.submitted_for_review` (type `system`, sans interrupteur, comme l'approbation et le refus ; textes fr et en, `wo` = texte français), cible `/app/agency/moderation/properties`, et `PropertyObserver` prévient les admins actifs de l'agence, sauf l'auteur du geste, à l'entrée en `pending_review` (création ou changement de statut). Ablation : observer remis → 3 rouges sur 3 ; remis → 3 verts, et 79 tests voisins verts.

## Angle 16 — Listes internes sur un modèle `Searchable`

Les deux 🔴 ont été relus par la session dans le code :
- `YearOfActivitySeeder::SEARCHABLE_MODELS` (l. 123-127) ne contient que `Property`, `Document` et `Message` ;
- les cinq requêtes du front (`customers.ts:91`, `maintenance.ts:111`, `documents.ts:75`, `super-admin.ts:102`, `admin-users.ts:60`) envoient `sort` avec `'-created_at'` comme valeur de repli ;
- le docblock de `HasQueryBuilder.php:150-160` confirme que `defaultSorts()` ne fait rien dès qu'un `sort=` explicite est présent.

⚠ Les comptes d'index ont été pris sur le Meilisearch brew (port 7700) que vise `takussan-api/.env`, alors que la base est celle de docker (5433). C'est le piège D-48 : les nombres décrivent ce poste, pas un environnement déployé.

### Après un seed, les recherches de clients, d'interventions et d'utilisateurs ne trouvent presque rien
- Réf : P16.01
- Statut : fait · TCK-701 — reste : une garde qui compare, sur un environnement, le nombre de documents indexés au nombre de lignes non supprimées
- Gravité : 🔴 défaut avéré (sur les environnements seedés)
- Où : `takussan-api/database/seeders/YearOfActivitySeeder.php:123-127,266-269`, `takussan-api/app/Models/Concerns/HasQueryBuilder.php:234-235`
- Constat :
  - Le seeder coupe Scout, puis ne réindexe que `Property`, `Document` et `Message`.
  - `Customer`, `MaintenanceRequest`, `User` et `Agency` sont devenus `Searchable` avec TCK-281, mais n'ont pas été ajoutés à la liste.
  - Or `filter[search]` rend un `whereIn(ids)` vide pour tout document absent de l'index.
  - Mesuré : clients, 2 indexés pour 564 en base ; interventions, 0 pour 212 ; utilisateurs, 52 pour 304 ; agences, 8 pour 5.
  - Chemin lu : `lib/queries/customers.ts:83`, puis `CustomerController.php:37`, puis `buildQuery`, puis Scout.
  - `release.sh` (l. 39-46) importe tous les modèles. Un déploiement n'est donc touché que si son marqueur de forme n'a pas bougé depuis TCK-281 (à vérifier sur Dokploy).
- Piste : dériver `SEARCHABLE_MODELS` de la même source que les modèles indexés de `release.sh`, plutôt que d'une liste écrite à la main. Ajouter une garde qui compare le nombre de documents indexés au nombre de lignes non supprimées.
- Mesure (2026-10-15, 5062193b, mesureur) : lu `YearOfActivitySeeder.php:123-127` (`SEARCHABLE_MODELS` = `Property`, `Document`, `Message`) et `:258-272` (`reindexSearchableModels` ne pousse que cette liste) ; `grep -rl 'use Searchable' app/Models` → sept modèles (s'y ajoutent `Customer`, `MaintenanceRequest`, `User`, `Agency`) ; tinker en lecture sur la base et l'index de dev → clients 564 en base pour 2 indexés, interventions 212 pour 82 (le constat disait 0), utilisateurs 304 pour 52, agences 5 pour 8, biens 842 pour 802. `docker/release.sh:39-46` importe tous les modèles indexés : lu, Dokploy non vérifié. Classement : A1, le docblock de la constante (« Searchable models that must be (re)pushed ») et `takussan-api/CLAUDE.md` (« ne pas recopier cette liste ailleurs : elle se dérive du code ») écrivent déjà le comportement attendu.
- Mesure (2026-10-16, 39b5fd85, implementeur) : `SeedingReindexTest` (moteur Scout espion branché sur `reindexSearchableModels()`) rendait `[Document, Message, Property]` contre les sept modèles de `Tests\Support\SearchableModels::all()` → le seeder itère désormais sur `App\Support\Search\SearchableModels::all()`, dérivée du trait `Searchable` ; test vert, ablation (liste écrite à la main remise) rouge, correctif remis vert.

### La pertinence de TCK-281 n'agit nulle part : le front impose toujours `sort=-created_at`
- Réf : P16.02
- Statut : fait · TCK-702
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/lib/queries/customers.ts:91`, `maintenance.ts:111`, `documents.ts:75`, `super-admin.ts:102`, `admin-users.ts:60` ; `takussan-api/app/Http/Controllers/Api/CustomerController.php:40`, `MaintenanceRequestController.php:55,81`, `AgencyController.php:41,177`
- Constat :
  - `defaultSortsWithRelevance()` passe par `defaultSorts()`, qui s'efface devant tout `sort=` explicite.
  - Les cinq listes du front envoient `sort` sans condition, recherche comprise.
  - Résultat : une recherche tolérante aux fautes, mais classée par date. C'est le défaut de l'angle 1, reproduit sur toutes les listes internes.
  - Établi comment : lu, des deux côtés.
- Piste : ne pas envoyer `sort` quand `search` n'est pas vide (ou envoyer un `sort=relevance` explicite), avec un test front par liste.
- Mesure (2026-10-15, 5062193b, mesureur) : lu `customers.ts:79-94` (`sort: sort ?? '-created_at'`, et la page `customers/(liste)/page.tsx:72` ne passe jamais `sort`) et `maintenance.ts:100-112` (`params?.sort ?? '-created_at'`), contre `CustomerController.php:40` et `MaintenanceRequestController.php:55,81` (`defaultSorts(...defaultSortsWithRelevance(...))`, qu'un `sort=` explicite remplace) : sur ces deux listes, la pertinence ne s'applique jamais. Le reste du constat ne tient pas tel qu'écrit : `documents.ts:75` vise `DocumentController.php:46`, qui a un `defaultSort('-created_at')` en dur (c'est P16.03) ; `super-admin.ts` passe par le BFF vers `/api/admin/agencies`, recherche SQL hors Scout par choix (TCK-281, « Hors périmètre ») ; `admin-users.ts` vise `/api/users`, sans `defaultSortsWithRelevance`. `AgencyController.php:177` (membres) n'a pas été rapporté à son appelant (`agent-crm.ts:110` envoie `sort ?? '-created_at'`). Lu, non exécuté. Classement : A1, TCK-281 écrit que la recherche des clients et des interventions est « classée par pertinence », et le correctif ne retire que le tri par défaut quand une recherche est posée.
- Mesure (2026-10-16, 5ddca3b3, implementeur) : reproduit par `recherche-par-pertinence.tck-702.test.tsx` avant correctif : `fetchDashboardCustomers` avec `filters.search` envoyait `sort=-created_at`, et `useMaintenanceRequests` / `useMaintenanceHistoryForProperty` avec `search` aussi (2 rouges sur 6) → plus de tri par défaut quand une recherche est posée, `-created_at` sans recherche, un tri de l'appelant part toujours ; 6 verts. Ablation fichier par fichier : `customers.ts` remis → 1 rouge, `maintenance.ts` remis → 1 rouge ; remis → 6 verts. Documents (P16.03), agences du super-admin et `admin-users` hors du cas, comme la mesure précédente l'établissait ; `fetchAgencyMembers` n'a aucun appelant.

### Documents : un `defaultSort` en dur, et une liste bornée à ce qu'on a soi-même déposé
- Réf : P16.03
- Statut : fait · TCK-785 — reste : le périmètre de lecture des documents, par agence ou par documentable
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/DocumentController.php:41-47`
- Constat :
  - `index()` combine la recherche Scout avec `->defaultSort('-created_at')` en dur, sans `defaultSortsWithRelevance`.
  - Le périmètre est `uploaded_by = moi` : un agent ne retrouve pas le bail déposé par un collègue sur un bien de l'agence.
  - Établi comment : lu.
- Piste : `Document::defaultSortsWithRelevance('-created_at')` ; le périmètre par agence ou par `documentable` dans un ticket à part.
- Mesure (2026-10-15, 2d25d35d, mesureur) : lu `DocumentController.php:35-50` (`where('uploaded_by', $user->id)` hors super-admin, puis `->defaultSort('-created_at')` en dur), `Document.php:42` (`$requestSearchFields` → `filter[search]` passe par Scout, `HasQueryBuilder.php:232-243`) et `lib/queries/documents.ts:69` (le front envoie `filter.search`) ; `defaultSortsWithRelevance` est appelé par 4 contrôleurs (agences, maintenance, clients, utilisateurs), pas par celui-ci. Les deux parties tiennent. TCK-281 AC1 ne cite pas les documents : la pertinence seule n'est donc pas un comportement déjà écrit. Classement : V2, élargir le périmètre à l'agence ou au `documentable` change une autorisation de lecture ; la partie tri, isolée, resterait un choix (V7) faute de spec.
- Mesure (2026-10-17, 0f8959c99, implementeur) : `DocumentListRelevanceTest` avant correctif → `GET /api/documents?filter[search]=Ndiayefall` rend les trois documents par date (2 fautes, 1 faute, exact), 1 rouge sur 3 → `defaultSorts(...Document::defaultSortsWithRelevance('-created_at'))` après `buildQuery()` ; un `sort=` explicite l'emporte, sans recherche le plus récent d'abord. Ablation : contrôleur remis → 1 rouge ; remis → 3 verts. Le périmètre `uploaded_by` n'est pas touché (reste).

### Plafond réel de 1 000 identifiants, toutes agences confondues
- Réf : P16.04
- Statut : caduc — maxTotalHits vaut déjà 5000 sur les 7 index (TCK-709, P01.06), gardé par SearchIdCapIndexSettingsTest ; le reste du porteur (agency_id filtrable et passé à Scout) n'est pas fait
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Models/Concerns/HasQueryBuilder.php:20-27,235`, `takussan-api/config/scout.php:267-288`
- Constat :
  - Le commentaire annonce `SEARCH_ID_CAP = 5000`, mais `pagination.maxTotalHits` vaut 1 000 sur tous les index locaux (mesuré), et `index-settings` ne le relève nulle part (lu).
  - Pour `customers`, `maintenance_requests`, `users` et `agencies`, aucun attribut n'est filtrable (mesuré) : le filtre d'agence s'applique en SQL, **après** les 1 000 premiers résultats pris sur toutes les agences.
  - Sur une requête large (« 77 », « gmail », un patronyme courant), les correspondances de l'agence au-delà du rang 1 000 disparaissent sans signal. Le total reste cohérent, ce qui rend le défaut invisible.
  - Le volume de production est à vérifier.
- Piste : rendre `agency_id` filtrable et le passer à Scout ; à défaut, aligner `maxTotalHits` sur `SEARCH_ID_CAP` et corriger le commentaire.
- Mesure (2026-10-15, 2d25d35d, mesureur) : lu `HasQueryBuilder.php:18-27` (`SEARCH_ID_CAP = 5000`, commentaire) et `:232` (`search()->take(5000)->keys()`), `config/scout.php:273-288` (clients, maintenance, agences, utilisateurs sans `filterableAttributes` ni `pagination`) ; tinker en lecture sur Meilisearch local → `maxTotalHits` vaut 1000 sur les 17 index (`takussan_local*` et `testing_*`), filtrables vides pour `customers`, `maintenance_requests`, `users`, `agencies`. Aucun index local ne dépasse 1 000 documents (802 biens, 52 utilisateurs, 2 clients indexés) : la troncature à 1 000 est déduite du plafond de Meilisearch, pas observée ; le volume de production reste à vérifier. Classement : V2, la piste fait porter le filtre d'agence par l'index au lieu du SQL, et en propose une seconde (relever `maxTotalHits`) entre lesquelles il faut choisir.
- Mesure (2026-10-17, 0121d9360, implementeur) : lu `config/scout.php:11-15` (`$pagination = ['maxTotalHits' => 5000]`, posé par a7e1d4f59, TCK-709) et `:228-303` (le réglage sur `Property`, `Message`, `Document`, `Customer`, `MaintenanceRequest`, `Agency`, `User`) ; `php artisan test tests/Feature/Search/SearchIdCapIndexSettingsTest.php` → 2 verts, dont celui qui confronte chaque index de `SearchableModels::all()` à 5000 ; le commentaire de `HasQueryBuilder::SEARCH_ID_CAP` dit déjà 5000. La décision du porteur est faite ; seul reste son « reste » (`agency_id` filtrable et passé à Scout), qui n'est pas confié.

### `/search/documents` et `/search/messages` : le filtre de dates s'applique après la pagination de Meilisearch
- Réf : P16.05
- Statut : fait · TCK-786
- Gravité : 🟠 risque ou dette (routes sans appelant)
- Où : `takussan-api/app/Services/Search/DocumentSearchService.php:37-48`, `takussan-api/app/Services/Search/MessageSearchService.php:36-49`
- Constat :
  - `date_from` et `date_to` passent par `$search->query(...)`, donc en SQL sur une page déjà découpée par Meilisearch : les pages sont incomplètes, et des correspondances deviennent inatteignables.
  - Le commentaire invoque « datetime vs timestamp », alors que `created_at` est déjà indexé en timestamp et filtrable (`config/scout.php:259,263`).
  - Aucun appelant dans le front (mesuré). Ce sont des routes mortes de l'angle 13.
  - Établi comment : lu.
- Piste : clauses Scout natives en timestamps, ou suppression des deux routes.
- Mesure (2026-10-15, 2d25d35d, mesureur) : lu `DocumentSearchService.php:33-46` et `MessageSearchService.php:35-48` (`date_from`/`date_to` dans `$search->query(...)`), `Document.php:60` et `Message.php:34` (`created_at` indexé en timestamp), Scout v11.3.0 `Builder::paginate`/`getTotalCount` (le total est recompté en SQL, les lignes viennent de la page Meilisearch) ; test temporaire retiré (Meilisearch réel, 4 documents « daterange », un seul dans la plage, créé en dernier, `per_page=1`) → pages 1 à 3 vides, `total` 1 et `last_page` 1, le document n'apparaît qu'en page 4 ; aucun appelant front (`grep` sur `takussan-web/src`), mais les routes sont gardées par `DocumentSearchTest`, `MessageSearchTest` et `MaintenanceThreadAccessTest`. Classement : A1, TCK-094 spécifie `filter[date_from]`/`filter[date_to]` et `DocumentSearchTest::test_date_range_filter` en est le contrat ; le correctif garde les routes et passe la plage en clauses Scout natives sur le timestamp.
- Mesure (2026-10-17, 0121d9360, implementeur) : reproduit par `SearchDateRangeTest` sur Meilisearch réel avant correctif : une correspondance dans la plage et trois plus récentes hors plage, `sort=-created_at&per_page=1` → page 1 vide, sur `/search/documents` comme sur `/search/messages` (2 rouges) → `date_from`/`date_to` passés en clauses Scout natives sur le timestamp (début et fin du jour, bornes inclusives comme `whereDate`) ; 3 verts, et `DocumentSearchTest`, `MessageSearchTest`, `MaintenanceThreadAccessTest` verts (29 tests). Ablation : les deux services remis → 2 rouges, le seul `MessageSearchService` remis → 1 rouge ; remis → verts. Routes gardées.

### Petites améliorations
- Réf : P16.06
- Statut : caduc — le seeder vide et réindexe tous les modèles Searchable depuis TCK-701 (P16.01)
- Gravité : 🟢 amélioration
- Constat :
  - **Index fantômes** : 8 documents d'agence indexés pour 5 en base (mesuré). `migrate:fresh` ne vide pas l'index des modèles absents de `SEARCHABLE_MODELS`, et ces fantômes occupent des places sous le plafond de 1 000.
  - **Ce qui tient** :
    - les mises à jour en masse sur des modèles `Searchable` ne touchent que des colonnes non indexées (`AgentHandoverService.php:196,200`, `AccountDeletionService.php:229`) ;
    - aucun index ne dénormalise une relation (lu).
- Piste : couverte par le premier constat (`removeAllFromSearch` sur tous les modèles indexés).
- Mesure (2026-10-16, b775f8f6, mesureur) : lu `YearOfActivitySeeder.php:123-127` (`SEARCHABLE_MODELS` = `Property`, `Document`, `Message`) et `:258-272` (`removeAllFromSearch` sur cette seule liste) ; `grep -rln 'Searchable;' app/Models` → s'y ajoutent `Agency`, `User`, `Customer`, `MaintenanceRequest`, dont l'index n'est jamais vidé ; décompte « 8 pour 5 » non re-mesuré (il demande la clé Meilisearch), repris de la mesure de P16.01 du 2026-10-15 → tient, et c'est le même défaut que P16.01, toujours `retenu · autonome` et non traité. Classement : A1, le docblock de `reindexSearchableModels` (« every searchable model ») écrit déjà le comportement attendu, et le correctif de P16.01 vide aussi ces index.
- Mesure (2026-10-17, 0121d9360, implementeur) : lu `YearOfActivitySeeder.php:241-254` : `reindexSearchableModels()` parcourt `App\Support\Search\SearchableModels::all()` (liste dérivée du code, a8d008b31, TCK-701) et appelle `removeAllFromSearch()` puis `makeAllSearchable()` pour chacun, `Agency`, `User`, `Customer` et `MaintenanceRequest` compris ; `php artisan test tests/Feature/Database/Seeders/SeedingReindexTest.php` → vert. Le défaut ne tient plus sur l'arbre ; le décompte « 8 pour 5 » de l'index local n'a pas été re-mesuré (il demande la clé Meilisearch).

## Angle 17 — Qualité des adresses : référentiel ou texte libre

*Exploré le 2026-10-15 sur `pre-dev` c8f7f127, par l'explorateur. Tout a été relu par l'explorateur lui-même, sans sous-agent : `GeoAddressCanonicalizer`, `GeoNeighborhoodResolver`, `GeoAddressRules`, `GeoAddressAttacher`, `GeoReferentialLoader`, les trois FormRequests d'adresse, `ChampsLieu.tsx`, `combobox.tsx` et les seeders. Les comportements des entrées P17.01 et P17.02 ont été établis par un test temporaire (`tests/Feature/Geo/`, retiré), charge `3.22 3.28 2.35` sur 8 cœurs. Les comptes viennent de la base docker (5433), en `SELECT` : ils décrivent un environnement seedé, pas la production. Le formulaire est déjà branché sur le référentiel (TCK-633, ADR-0062) : l'angle relève ce qui lui échappe encore.*

### Une adresse envoyée avec `city: null` rend 500 sur les trois voies d'écriture
- Réf : P17.01
- Statut : fait · TCK-703
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Requests/Api/StorePropertyRequest.php:83`, `takussan-api/app/Http/Requests/UpdatePropertyRequest.php:75`, `takussan-api/app/Http/Requests/Api/UpsertPropertyAddressRequest.php:39`, `takussan-api/database/migrations/2026_04_17_160003_create_addresses_table.php:17`
- Constat :
  - Les trois règles déclarent la ville `nullable`, alors que la colonne `addresses.city` est `NOT NULL DEFAULT 'Dakar'` (lu, et mesuré par `\d addresses`). Une valeur `null` explicite ne prend pas le défaut.
  - Mesuré par test temporaire : `POST /api/properties` avec `address: {city: null, street: …}`, `PUT /api/properties/{id}/address` avec `city: null`, et `PATCH /api/properties/{id}` avec `address: {city: null}` rendent **500**. L'exception est `SQLSTATE[23502] null value in column "city"` dans les trois cas.
  - Le front n'y arrive pas : `city` est requis par `lib/schemas/property.ts:163` (lu). Le défaut touche les clients directs de l'API.
- Piste : `address.city` en `required_with:address` (ou `required` sur l'upsert), pour un 422 au lieu d'un 500. Un test par voie, qui attend 422.
- Mesure (2026-10-15, 48195c53, mesureur) : lu `StorePropertyRequest.php:83` et `UpdatePropertyRequest.php:75` (`address.city` `nullable`), `UpsertPropertyAddressRequest.php:39` (`city` `nullable`), migration `2026_04_17_160003…:17` (`string('city')->default('Dakar')`, donc NOT NULL) ; aucun commit ni ticket ne les a touchées depuis TCK-633 ; test temporaire, retiré depuis (charge 3,06 / 2,50 / 2,38 sur 8 cœurs) → `POST /api/properties` avec `address.city: null`, `PUT /api/properties/{id}/address` avec `city: null` et `PATCH /api/properties/{id}` avec `address.city: null` rendent tous trois **500** `SQLSTATE[23502] null value in column "city"` ; le front exige la ville (`lib/schemas/property.ts:163`). Classement : A1, le contrat est écrit par la colonne NOT NULL et par le schéma du front, et retirer `nullable` des trois règles (en gardant `sometimes` pour le PATCH et l'upsert) fait d'un `null` explicite un 422 sans rien changer à un appel qui omet la clé.
- Mesure (2026-10-16, 7f5eaa8d, implementeur) : reproduit par `tests/Feature/Geo/AdresseSansVilleTest.php` avant correctif (charge 1,60 sur 8 cœurs) → les trois voies rendaient 500 sur `city: null`, et `POST` avec `geo_city_id` et `city: null` rendait 201 (la canonisation réécrit la ville) ; `nullable` remplacé par `filled` dans les trois FormRequests → 7 verts (null refusé en 422, base intacte ; ville omise : défaut `Dakar` ou ville conservée) ; ablation, les trois règles remises → 4 rouges ; `php bin/impacted-tests.php --run` → 765 verts. Vu au passage, non traité : `country` a la même forme (`NOT NULL DEFAULT 'SN'`, règles `nullable`).

### Un quartier tapé avec un tiret ou sans accent crée une proposition en double d'un quartier approuvé
- Réf : P17.02
- Statut : fait · TCK-788 — reste : replier les accents dans le résolveur, si le porteur amende ADR-0062 § 1
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Geo/GeoNeighborhoodResolver.php:24-43`, `takussan-web/src/components/ui/combobox.tsx:34-39`, `takussan-web/src/components/property-form/ChampsLieu.tsx:15-21`, `takussan-api/app/Http/Controllers/Api/Admin/GeoNeighborhoodAdminController.php:22-57`
- Constat :
  - Le résolveur ne replie que la casse et les espaces (`CaseInsensitive::fold`, `preg_replace('/\s+/u')`). Ni les tirets ni les accents ne sont repliés (lu).
  - Mesuré par test temporaire, avec « Grand Yoff » et « Médina » approuvés dans Dakar :
    - créer un bien avec le quartier `Grand-Yoff` crée une proposition `pending` « Grand-Yoff » ;
    - créer un bien avec le quartier `Medina` crée une proposition `pending` « Medina ».
  - Côté front, la recherche de la liste replie les accents mais pas les tirets (`replierPourRecherche`, `combobox.tsx:34-35`) : taper « Grand-Yoff » n'affiche pas « Grand Yoff » et propose « Créer « Grand-Yoff » ». Taper « Medina » affiche « Médina », mais l'option de création reste offerte, et un texte laissé tel quel ne se rapproche pas (`seulHomonyme` compare à l'accent près) (lu).
  - L'ADR-0062 § 1 assume les accents (« se résout par la recherche de la liste »). Les tirets n'y sont pas traités.
  - Conséquence : le bien pointe une proposition que les listes publiques ne servent pas (§ 5), et le filtre texte de la recherche ne le trouve pas sous le nom approuvé (voir P01.02). Le rattrapage est la fusion par le super-admin, et la liste de modération ne propose aucun quartier proche (lu).
  - Le nombre de propositions en double en production est à vérifier : la base de dev n'en a aucune (`select status, origin, count(*) from geo_neighborhoods` → 365 `approved/dataset`).
- Piste : replier aussi tirets et apostrophes, des deux côtés (`replierPourRecherche` et une clé de comparaison du résolveur). Montrer dans la liste de modération les quartiers approuvés dont la clé repliée sans accents ni ponctuation coïncide. Ajouter un test « Grand-Yoff se replie sur Grand Yoff ».
- Mesure (2026-10-15, 2d25d35d, mesureur) : lu `GeoNeighborhoodResolver.php:24-43` (`nettoyer` ne replie que les espaces, `trouver` compare par `CaseInsensitive`) et `combobox.tsx:34-40` (`replierPourRecherche` retire les accents, pas les tirets) ; test temporaire retiré, « Grand Yoff » et « Médina » approuvés dans une ville → `resoudreOuProposer` : `grand yoff` et `MÉDINA` rendent le quartier approuvé, `Grand-Yoff` et `Medina` créent chacun une proposition `pending`. Le constat tient en entier. Classement : V7, replier les accents revient sur un choix écrit d'ADR-0062 § 1, et la liste de modération enrichie de quartiers proches est un comportement visible neuf.
- Mesure (2026-10-17, 8d59d1942, implementeur) : reproduit avant correctif par `tests/Feature/Geo/GeoNeighborhoodPunctuationFoldTest.php` (charge 2,02 sur 8 cœurs) → `Grand-Yoff` et `Cité d’Arafat` créaient chacun une proposition, et la file `GET /api/admin/geo/neighborhoods` ne portait aucun quartier proche ; le résolveur compare désormais sur une clé qui replie casse, blancs, tirets et apostrophes (nom exact prioritaire), la file rend `similar` (approuvés de la ville, clé repliée sans accents), `replierPourRecherche` replie les mêmes séparateurs et la file affiche « Proche de : … » → 5 verts côté API (« Medina » reste une proposition), 34 verts côté front ; ablation : 3 rouges sur 5 côté API, 5 rouges sur 34 côté front.

### Rejouer le référentiel ne réaligne pas les adresses existantes
- Réf : P17.03
- Statut : fait · TCK-787
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Geo/GeoReferentialLoader.php:73-85,93-137`, `takussan-api/app/Services/Geo/GeoAddressAttacher.php:20-42`
- Constat :
  - Le chargeur renomme un quartier ou une ville du jeu par un simple `save()` (l. 83 et 134). Il ne réécrit pas le texte `addresses.neighborhood` / `city` qui y pointe, et ne réindexe pas les biens (lu). La modération, elle, le fait (`GeoNeighborhoodModeration::reecrireAdresses`), et l'ADR-0062 § 4 l'exige pour « renommer ou fusionner ».
  - Le rattacheur ne relit que les adresses **sans ville** (`whereNull('geo_city_id')`, l. 24-26). Une adresse déjà rattachée à sa ville, dont le texte de quartier n'existait pas au premier passage, n'est jamais rattachée quand une mise à jour du jeu ajoute ce quartier (lu).
  - Aujourd'hui : 0 adresse de dev dont le texte égale un quartier de sa ville sans y être rattachée (mesuré, `SELECT` avec `LOWER(… COLLATE "und-x-icu")`). Le défaut ne se voit qu'à la prochaine mise à jour du jeu : à vérifier.
- Piste : dans le chargeur, réécrire le texte des adresses et réindexer les biens quand un nom change. Dans le rattacheur, traiter aussi `geo_city_id IS NOT NULL AND geo_neighborhood_id IS NULL AND neighborhood <> ''`. Garder chaque cas par un test de `GeoReferentialSync` rejoué deux fois.
- Mesure (2026-10-15, 2d25d35d, mesureur) : lu `GeoReferentialLoader.php:73-86` (ville renommée par `fill`/`save`) et `:93-137` (quartier renommé si `renamed_at` est nul, sans toucher `addresses` ni réindexer), `GeoAddressAttacher.php:20-42` (`whereNull('geo_city_id')` seulement), `GeoNeighborhoodModeration.php:47,71,100` (`reecrireAdresses`), ADR-0062 l. 76 (« Renommer ou fusionner un quartier réécrit le texte des adresses… et réindexe »). Les deux parties tiennent par lecture ; l'effet attend une mise à jour du jeu, non re-mesuré. Classement : V4, le correctif réécrit des données existantes (texte des adresses) à chaque chargement, même si ADR-0062 § 4 en décrit l'intention.
- Mesure (2026-10-17, 0121d9360, implementeur) : reproduit par `GeoReferentialRealignementTest` (Meilisearch réel, jeu v1 modifié en répertoire temporaire, chaque chargement joué deux fois) avant correctif : quartier « Point E » renommé par le jeu → l'adresse garde « Point E » ; ville « Guédiawaye » renommée → l'adresse garde l'ancien nom ; « liberté 5 » d'une adresse déjà rattachée à Dakar → non rattachée après v2 (3 rouges) → le chargeur réécrit `neighborhood` par `save()` et `city` par une mise à jour SQL (un `save()` ferait tomber le quartier, règle 1 du canoniseur), le rattacheur rapporte aussi les adresses avec ville et sans quartier, sans proposer, et `GeoReferentialSync` réindexe les deux listes ; 4 verts, `tests/Feature/Geo/` vert (70). Ablation : réécritures retirées → 2 rouges, rattacheur remis → 1 rouge, réindexation des renommés retirée → 2 rouges ; remis → verts.

### Les seeders écrivent des adresses que le référentiel ne peut pas rattacher, et faussent les mesures de dev
- Réf : P17.04
- Statut : fait · TCK-789
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/database/seeders/Support/FilterCoverageSeeder.php:241-249`, `takussan-api/database/seeders/Catalog/PropertySeeder.php:62-78,191-204`, `takussan-api/database/seeders/Support/SenegalFakerProvider.php:21-36,168-171`
- Constat :
  - `FilterCoverageSeeder` combine un quartier de Dakar, une ville tirée au hasard, la région `Dakar` et des coordonnées dakaroises (lu). Mesuré : 200 adresses hors de Dakar portent un quartier, dont « Fann » à Kaolack et « Ouakam » à Thiès.
  - `PropertySeeder` tire les coordonnées des villes hors de Dakar dans tout le cadre du pays (lu). Mesuré : en moyenne 100 à 270 km du centre de leur ville, et jusqu'à 584 km pour Thiès.
  - Les noms de quartiers du faker ne sont pas ceux du jeu (lu) :
    - « Plateau » au lieu de « Dakar-Plateau » ;
    - « Grand-Yoff » au lieu de « Grand Yoff » ;
    - « Dieupeul » et « Dieuppeul » au lieu de « Dieuppeul-Derklé » ;
    - « Hann Maristes » au lieu de « Hann Maristes 1 ».

    « Pikine » et « Guédiawaye » y sont des quartiers de Dakar, alors que l'ADR-0062 § 2 en fait des villes.
  - Mesuré : 180 adresses de Dakar ont un texte de quartier sans rattachement. Les 205 « quartiers hors référentiel » de P01.02 sont donc pour l'essentiel un artefact du seed : le défaut de filtre qu'elle décrit tient, mais ses comptes ne disent rien de la production (voir P01.02).
- Piste : tirer les quartiers seedés dans `geo_neighborhoods` de la ville choisie, et les coordonnées autour du centre de cette ville. Une garde de seed : toute adresse seedée avec un texte de quartier est rattachée.
- Mesure (2026-10-15, d62e3290, mesureur) : relu `FilterCoverageSeeder.php:241-251` (quartier `dakarNeighborhood()`, ville `senegaleseCity()`, région `Dakar`, coordonnées 14,6-14,8 / -17,5 à -17,3), `PropertySeeder.php:62-78` et `:191-204` (hors Dakar : latitude 12,5-16,7, longitude -17,5 à -11,5), `SenegalFakerProvider.php:18-40` (`Plateau`, `Grand-Yoff`, `Dieuppeul`, `Hann Maristes`, `Pikine`, `Guédiawaye` comme quartiers de Dakar) ; aucun commit sur ces trois fichiers depuis le constat ; `SELECT` en lecture sur la base de dev (adresses de biens) → 200 adresses hors de Dakar portent un quartier, 180 adresses de Dakar ont un quartier sans `geo_neighborhood_id`, sur 826. Constat confirmé, comptes identiques. Classement : V4, le correctif change les données que les seeders écrivent (noms de quartiers, coordonnées) et la garde de seed porte sur la suite entière (`database/seeders/` est un déclencheur dur), ce qui demande un choix sur le jeu de démonstration plutôt qu'un défaut au comportement écrit.
- Mesure (2026-10-17, fe2d19c09, implementeur) : reproduit avant correctif par `SeededAddressesAttachedTest` (référentiel chargé puis mini-pipeline Tag, Agency, User, Property, FilterCoverage ; charge 2,0 sur 8 cœurs) → `GeoReferentialSeeder` 35ᵉ du pipeline, après `PropertySeeder` (6ᵉ) ; plus de 26 quartiers semés non rattachés (« Plateau (Dakar) », « Pikine (Dakar) », « Fann (Mbour) ») ; 200 adresses à plus de 10 km du centre de leur ville (Ziguinchor 271 km, Louga 167 km) → référentiel en tête du pipeline, quartiers tirés des quartiers approuvés de la ville (`SeedGeo`), coordonnées à ±0,04° de son centre, noms du faker alignés sur le jeu ; 2 verts. Ablation : seeders remis → la garde des quartiers rouge ; ordre du pipeline remis → la garde d'ordre rouge ; remis → verts. `FilterCoverageTagsTest` et `SeedingReindexTest` verts.

### Petites améliorations
- Réf : P17.05
- Statut : retenu · à valider — chemin fermé : retirer les deux routes impose de supprimer `tests/Feature/Api/PropertyAddressTest.php`, que la garde des agents refuse (« un test ne se supprime pas ») ; porteur (2026-10-17) : traité hors agents, en session : retrait des deux routes, de `PropertyAddressController`, d'`UpsertPropertyAddressRequest` et de leurs tests (l'API n'a jamais servi en production, aucun client hors dépôt ne peut les appeler) ; le signal de distance à la ville choisie, plus tard
- Gravité : 🟢 amélioration
- Où : `takussan-api/routes/api/properties.php:53-54`, `takussan-api/app/Http/Requests/Api/UpsertPropertyAddressRequest.php:34-46`, `takussan-api/app/Services/Geo/Senegal.php:10-24`
- Constat :
  - **`PUT` et `DELETE /api/properties/{property}/address` n'ont aucun appelant dans le front** (mesuré, `grep -rn "/address" takussan-web/src`). `payload.ts:17` raconte le retrait du dernier. Leurs règles divergent de la création : 255 caractères au lieu de 120, et ni `geo_city_id` ni `geo_neighborhood_id`. À rapprocher de l'angle 13.
  - **La position n'est confrontée qu'au cadre du pays** (`Senegal::contient`), jamais à la ville choisie (lu). Un bien de Thiès placé à Dakar ne déclenche aucun signal. L'affichage de la carte recentrée côté front est à vérifier.
  - **Ce qui tient** :
    - toute écriture d'adresse passe par le crochet `saving` (`Address.php:41`) ;
    - la règle `GeoAddressRules` refuse la proposition d'un autre ;
    - le chargeur ne recrée pas un quartier refusé ou fusionné ;
    - le jeu n'a aucun quasi-doublon dans une même ville (mesuré : 0 groupe sur la clé repliée sans accents ni ponctuation).
- Piste : retirer les deux routes, ou leur appliquer `GeoAddressRules` et les longueurs de la création. Signaler une position à plus de N km du centre de la ville choisie, comme le hors-Sénégal.
- Mesure (2026-10-16, b775f8f6, mesureur) : lu `routes/api/properties.php:53-54` (`PUT` et `DELETE …/address`) et `UpsertPropertyAddressRequest.php:34-46` (`max:255`, ni `geo_city_id` ni `geo_neighborhood_id`) ; `grep -rn "/address" takussan-web/src` → aucun appel, seul le récit de `property-form/payload.ts:17` ; `grep -rn 'Senegal::contient' app` → un seul usage (`GeoLinkController.php:22`), aucune comparaison à la ville → les deux constats tiennent ; le recentrage de la carte côté front n'a pas été vérifié. Classement : V7, la `Piste` laisse le choix entre retirer et aligner les routes, et le signal de distance est un comportement visible neuf.
- Mesure (2026-10-17, 8d59d1942, implementeur) : `grep` sur tout le dépôt hors tickets → aucun appelant des deux routes ; test temporaire (retiré) → `PUT …/address` rendait 201 au propriétaire. Retirer les routes, `PropertyAddressController` et `UpsertPropertyAddressRequest` rendait obsolètes `tests/Feature/Api/PropertyAddressTest.php` (6 cas) et deux cas d'upsert d'`AdresseSansVilleTest` (TCK-703) ; `check-pistes --role implementeur` refuse la suppression du premier. Classement : chemin fermé, à la main du porteur ; le correctif tient en un S (routes, deux classes, deux fichiers de test), et TCK-490 avait gardé la route faute de preuve qu'aucun client hors dépôt ne l'appelle.
- Mesure (2026-10-17, 034680882, humain) : fait en session (TCK-812) : les deux routes, `PropertyAddressController`, `UpsertPropertyAddressRequest` et `PropertyAddressTest.php` sont retirés ; les deux cas d'upsert d'`AdresseSansVilleTest` deviennent une garde (`PUT` et `DELETE …/address` → 404, adresse inchangée), qui rougit par ablation (routes remises → 200). Le volet « distance à la ville choisie » reste à faire, plus tard.

## Angle 18 — Statistiques Boost face aux robots, aux rendus serveur et aux revalidations

*Exploré le 2026-10-15 sur `pre-dev` 6c8a08b0, par l'explorateur. Tout a été relu par
l'explorateur lui-même, sans sous-agent : `BoostStatsRecorder`, ses trois appelants, `boosts:tick`,
la console super-admin, et côté front l'accueil, la recherche et le compteur de vue. Une mesure par
un test temporaire, retiré depuis, sur la base de test et le Meilisearch du conteneur (charge
2,85 / 2,43 / 2,13 sur 8 cœurs). La production et la préproduction n'ont pas été lues : aucun
volume réel de robots n'est connu. Le double appel de la recherche après un changement de filtre et
les 304 ETag sont déjà décrits par P01.04, et ne sont pas repris ici.*

### La rangée « À vendre » de l'accueil compte des impressions sponsorisées qu'elle n'affiche jamais, et montre des places payées sans le badge
- Réf : P18.01
- Statut : fait · TCK-687
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/lib/queries/raccourcis-de-l-accueil.ts:24-31`, `takussan-web/src/components/property/HomepageDiscovery.tsx:221-231`, `takussan-api/app/Services/Search/PropertySearchService.php:143-146,634-673`, `takussan-api/app/Services/Boost/BoostStatsRecorder.php:28-34`
- Constat :
  - Chaque rendu serveur de l'accueil appelle `GET /public/properties/search?contract_type=sale&per_page=12`, et n'en lit que `data` (lu, `raccourcis-de-l-accueil.ts:26-30`).
  - Ce endpoint tire toujours les emplacements en régime strict et compte une impression par bien sponsorisé servi (lu, `PropertySearchService.php:145-146,657-659`). Aucun paramètre ne l'en dispense.
  - Mesuré par un test temporaire : cinq vedettes actives en vente, sept biens, réglages par défaut (3 emplacements, 2 places réservées). La requête de l'accueil, envoyée avec l'agent `Googlebot/2.1`, rend `sponsored = [4,2,5]` et **3 impressions** comptées. L'accueil ne rend pas ce champ.
  - La même réponse place deux vedettes en tête de `data` avec `placement: "reserved"` (mesuré). La rangée « À vendre » les montre sans robe : `robeVedette` n'est pas passé (lu, `HomepageDiscovery.tsx:221-231`). L'ADR-0061 § 7 dit pourtant qu'« un résultat payé ne se présente jamais comme un résultat organique ».
  - Les places réservées ne comptent pas d'impression, ni sur l'accueil ni sur `/properties` : seules les entrées de `sponsored` sont comptées (lu, `PropertySearchService.php:657-659`). L'ADR-0061 § 10 ne parle que des « emplacements » : est-ce voulu ? À vérifier.
- Piste : un paramètre qui coupe les emplacements, ou un endpoint dédié pour la rangée. Côté front, la robe pour `placement === 'reserved'`, ou pas de place réservée hors de `/properties`. Un test API : la requête de l'accueil ne compte aucune impression. Un test front : une place réservée porte toujours la robe.
- Mesure (2026-10-15, 48195c53, mesureur) : lu `raccourcis-de-l-accueil.ts:24-31` (`contract_type=sale&per_page=12`, seul `data` est lu), `HomepageDiscovery.tsx:221-231` (rangée « À vendre » sans `robeVedette`), `PropertySearchService.php:143-146,634-673` (régime strict → `placements()` → `BoostStatsRecorder::impressions()`), aucun commit sur ces chemins depuis 6c8a08b0 ; test temporaire, retiré depuis : cinq vedettes de vente, sept biens, réglages par défaut, `GET /api/public/properties/search?contract_type=sale&per_page=12` sous `Googlebot/2.1` → `sponsored = [4,5,2]`, **3 impressions** comptées, et `data` ouvre sur deux `placement: "reserved"`. Classement : V7, le défaut tient en entier, mais la piste offre trois issues (paramètre qui coupe, endpoint dédié, robe sur la place réservée) qui changent chacune ce que voit le visiteur, et la question des impressions des places réservées (ADR-0061 § 10) reste au porteur.
- Mesure (2026-10-16, 8ddb3caa, implementeur) : reproduit avant correctif par `AccueilSansEmplacementsTest` (trois vedettes de vente, trois biens organiques, 3 emplacements et 2 places réservées) : `GET /api/public/properties/search?contract_type=sale&per_page=12&placements=false` rendait `sponsored` non vide, le paramètre étant ignoré → `placements=false` coupe emplacements et places réservées (`sponsored = []`, `data` tout `organic`, 0 impression), le témoin sans paramètre sert et compte toujours, `placements=peut-etre` rend 422 ; l'accueil envoie `placements=false` (`raccourcis-de-l-accueil.test.ts`) ; ablation du correctif API puis front, rouge chaque fois, puis vert.

### Les impressions de la rangée vedette de l'accueil ne peuvent jamais devenir des clics
- Réf : P18.02
- Statut : fait · TCK-704
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Property/HomepageDiscoveryService.php:107-113`, `takussan-web/src/components/property/HomepageDiscovery.tsx:207-217`, `takussan-web/src/components/boost/EmplacementSponsorise.tsx:37`, `takussan-web/src/components/boost/arrivee-sponsorisee.ts:9-25`, `takussan-api/app/Http/Controllers/Api/Admin/AdminBoostStatsController.php:15-37`
- Constat :
  - La rangée vedette de l'accueil est un emplacement : ses biens servis comptent une impression (lu, `HomepageDiscoveryService.php:112-113`, et ADR-0061 § 7 « la rangée vedette de l'accueil applique la même rotation »).
  - Un clic n'est compté que si la fiche est ouverte depuis un lien marqué par `marquerArriveeSponsorisee` (lu, `CompteurDeVue.tsx:34`). Seul `EmplacementSponsorise` marque, et il n'est monté que par `PropertiesDiscoveryPage`, la page `/properties` (mesuré : `grep -rln EmplacementSponsorise takussan-web/src`). La rangée de l'accueil passe par `PropertyRow`, qui ne marque rien (lu).
  - La console super-admin somme toutes les impressions et tous les clics par jour, sans distinguer la surface (lu, `AdminBoostStatsController.php:15-19`). Le taux de clic affiché mêle donc des impressions de l'accueil, dont aucune ne peut produire un clic, à celles de la recherche. Il est biaisé vers le bas d'une part inconnue.
- Piste : marquer l'arrivée depuis la rangée vedette, comme le fait l'emplacement de recherche. Ou ne pas compter cette rangée, et le dire dans l'ADR. Un test front : un clic sur une carte de la rangée vedette pose le marqueur.
- Mesure (2026-10-15, 48195c53, mesureur) : lu `HomepageDiscoveryService.php:107-113` (la rangée vedette compte une impression par bien servi), `arrivee-sponsorisee.ts:9-25`, `AdminBoostStatsController.php:15-37` (somme toutes surfaces) ; `grep -rln "EmplacementSponsorise\|marquerArriveeSponsorisee" takussan-web/src` → seuls `EmplacementSponsorise.tsx`, `arrivee-sponsorisee.ts`, `PropertiesDiscoveryPage.tsx` et deux tests ; `PropertyRow.tsx` ne marque rien (lu, l. 147 et 265). L'ADR-0061 § 7 fait de la rangée vedette un emplacement et le § 10 définit le clic comme « une vue de la fiche arrivée par un lien d'emplacement ». Classement : A1, le comportement attendu est écrit dans l'ADR-0061 ; le correctif marque l'arrivée (`marquerArriveeSponsorisee(slug)`) au clic d'une carte de la rangée vedette, sans rien changer à l'affichage, et la variante « ne pas compter cette rangée » de la piste n'est pas couverte par ce classement.
- Mesure (2026-10-16, b14cd410, implementeur) : reproduit avant correctif : `grep -rn marquerArriveeSponsorisee takussan-web/src` → seul `EmplacementSponsorise.tsx` l'appelle, et `PropertyRow` ne pose aucun écouteur ; nouveaux tests rouges sur l'arbre d'origine (clic sur la carte « Bien 2 » d'une rangée `emplacementSponsorise` → `consommerArriveeSponsorisee('bien-2')` faux ; aucune rangée de l'accueil n'est un emplacement) → `PropertyRow` note l'arrivée du bien cliqué quand `emplacementSponsorise` est posée, et seule la rangée vedette de l'accueil la pose (`PropertyCard.robe.test.tsx`, `HomepageDiscovery.test.tsx`, 27 verts) ; ablation de l'écouteur puis de l'option, un rouge chaque fois, puis vert. La variante « ne pas compter cette rangée » n'est pas prise.

### Une visite de l'accueil compte deux impressions vedettes quand la ville du visiteur est devinée
- Réf : P18.03
- Statut : fait · TCK-790
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/queries/public-discovery.ts:54-71`, `takussan-web/src/hooks/useHomepageDiscovery.ts:99-123`, `takussan-api/app/Services/Property/HomepageDiscoveryService.php:107-113`
- Constat :
  - Le rendu serveur appelle `discovery` sans ville, puis le client le rappelle avec `near_city` dès qu'une ville est devinée (lu, `useHomepageDiscovery.ts:104-122`).
  - Chacun des deux appels compte les impressions de la rangée vedette (lu, `HomepageDiscoveryService.php:113`). La graine de cette rangée ne dépend que de la surface et de l'heure (`seed(['surface' => 'homepage.featured'])`) : les deux appels servent les mêmes biens, affichés une seule fois.
  - La part des visiteurs dont la ville est devinée (ipapi.co, échéance de 1 200 ms) n'est pas connue. À vérifier.
- Piste : ne compter la rangée vedette que sur l'appel sans ville, ou passer un paramètre `count=0` au rappel du client. Un test API : deux appels, l'un avec `near_city`, comptent une seule fois.
- Mesure (2026-10-15, d62e3290, mesureur) : relu `HomepageDiscoveryService.php:107-113` (impressions de la rangée vedette à chaque appel), `SponsoredRotation::seed()` (graine = paramètres + heure UTC), `public/page.tsx:62` (rendu serveur sans ville), `useHomepageDiscovery.ts:99-123` (rappel client avec `near_city` quand une ville est devinée) ; test temporaire calqué sur `BoostStatsTest`, retiré depuis : `GET /api/public/properties/discovery` puis `?near_city=Dakar` → compteur d'impressions du boost à 2 pour une rangée vedette affichée une fois. Charge 2,55 sur 8 cœurs. La part des visiteurs dont la ville est devinée reste non mesurée. Classement : V7, « ne compter que l'appel sans ville » perd l'impression quand le rendu serveur a échoué et que le client appelle avec sa ville, et `count=0` ajoute un paramètre public : le choix revient au porteur.
- Mesure (2026-10-17, fe2d19c09, implementeur) : test neuf `SponsoredImpressionsTest::test_l_accueil_rappele_avec_near_city_ne_compte_qu_une_fois` (même IP, accueil sans ville puis `?near_city=Dakar`) → vert d'emblée : 1 impression, le dédoublonnage de TCK-708 couvre le défaut ; ablation (dédoublonnage par visiteur de `commitImpressions()` neutralisé) → rouge, 2 impressions ; remis → vert, 4 verts dans la classe. Non mesuré : l'IP que l'API voit pour l'appel du rendu serveur, qui part du serveur du front.

### Aucune impression ni aucun clic ne distingue un robot d'un visiteur
- Réf : P18.04
- Statut : fait · TCK-792
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Boost/BoostStatsRecorder.php:28-44`, `takussan-web/src/lib/queries/public-search.ts:48-60`, `takussan-web/src/lib/queries/public-discovery.ts:54-71`
- Constat :
  - Aucun filtre d'agent n'existe, ni dans l'API ni dans le front (mesuré : `grep -rn -i "userAgent\|isbot\|crawler\|googlebot"` → seulement des journaux de baux et de leads). Le test temporaire de P18.01 compte 3 impressions sous l'agent `Googlebot/2.1`.
  - Les rendus serveur de `/` et de `/properties` appellent l'API sans `partage` (lu, `public-search.ts:51`, `public-discovery.ts:60`). Ils ne passent donc pas par le cache de données de Next : chaque passage d'un robot, sur chaque URL de facette, compte ses impressions. L'accueil et la recherche ne sont pas mis en cache côté API non plus (mesuré : aucun `Cache::` dans `HomepageDiscoveryService` ni dans `discovery()`).
  - Les clics, eux, exigent un clic réel suivi d'un `POST` depuis le navigateur (lu, `CompteurDeVue.tsx:29-41`). Un robot gonfle donc les impressions sans clic, et le taux de clic baisse d'autant. Le volume réel est à vérifier dans les journaux de préproduction.
- Piste : ne pas compter quand l'agent est reconnu comme robot (liste courte, sans dépendance), ou compter l'impression depuis le navigateur après affichage, comme la vue de fiche (TCK-598). Un test : une recherche sous `Googlebot` ne compte rien.
- Mesure (2026-10-15, d62e3290, mesureur) : `grep -rniE "isbot|crawler|googlebot|bingbot|userAgent\(\)"` sur `takussan-api/app` et `takussan-web/src` → seulement `LeaseSignatureService.php:164` et `ContactLeadService.php:213,311` (journalisation), aucun filtre ; `BoostStatsRecorder::impressions()` est appelé par `HomepageDiscoveryService.php:113` et `PropertySearchService.php:659` sans regarder l'agent (lu) ; `public-search.ts:48-60` appelle sans `partage` (lu) ; test temporaire, retiré depuis : un troisième `GET /api/public/properties/discovery` sous l'agent `Googlebot/2.1` fait passer le compteur de 2 à 3. Le volume réel des robots n'est pas mesuré. Classement : V7, la piste propose deux définitions de l'impression (liste courte d'agents, ou comptage par le navigateur comme TCK-598), et choisir l'une est un choix de mesure produit, la seconde changeant aussi l'architecture du comptage.
- Mesure (2026-10-17, c98fe9c5, implementeur) : reproduit avant correctif par `RobotImpressionsTest` : `GET /api/public/properties/search` sous Googlebot puis `/discovery` sous bingbot comptaient chacun 1 impression ; et `api.agent-du-visiteur.test.ts` : la recherche et l'accueil rendus côté serveur ne transmettaient aucun `User-Agent` → `CountBoostImpressions` écarte les impressions d'un agent que `RobotUserAgent` reconnaît (Googlebot, bingbot… mais pas un téléphone Cubot), et `apiFetch` transmet l'agent du visiteur sur un appel non partagé ; 2 + 25 + 4 verts, témoins navigateur comptés ; ablation du middleware (2 rouges), de l'exception Cubot (1 rouge) et de l'en-tête front (2 rouges), puis vert.

### Un vidage qui échoue perd les compteurs de l'heure
- Réf : P18.05
- Statut : fait · TCK-793 — reste : isoler `flush()` des autres étapes de `boosts:tick`, pour qu'une étape antérieure qui lève ne le saute plus
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Boost/BoostStatsRecorder.php:69-90`, `takussan-api/app/Console/Commands/BoostsTick.php:23-30`
- Constat :
  - `flush()` retire les compteurs du cache (`Cache::pull`) avant d'écrire la ligne (`upsert`) (lu, lignes 70-87). Si l'écriture lève, les valeurs retirées sont perdues : `LAST_FLUSHED_KEY` n'avance pas, mais le tick suivant relit des clés vides.
  - `pull` lit puis efface en deux commandes, sans atomicité (lu). Deux vidages simultanés peuvent lire la même valeur et la verser deux fois. `withoutOverlapping()` les en empêche sur un seul serveur, et l'en-tête de `BoostsTick` affirme pourtant que deux ticks qui se chevauchent « ne produisent rien de plus ». À vérifier si l'API tourne un jour sur plusieurs conteneurs planificateurs.
  - `flush()` vient en dernier dans le tick (lu, ligne 28). Une exception d'une étape précédente le saute tant qu'elle se répète. Les compteurs vivent 48 h (`TTL_HOURS`) : au-delà, ils sont perdus sans trace.
- Piste : lire avec `get`, écrire, puis `forget` dans le même passage, ou `GETDEL` Redis par heure complète. Isoler `flush()` des autres étapes du tick. Un test : un `upsert` qui lève laisse les compteurs en cache pour le tick suivant.
- Mesure (2026-10-15, d62e3290, mesureur) : relu `BoostStatsRecorder::flush()` (`Cache::pull` des deux compteurs, puis `upsert`, puis `LAST_FLUSHED_KEY`) et `BoostsTick.php:23-30` (`flush()` en dernière étape) ; test temporaire, retiré depuis : deux impressions, une heure plus tard un `flush()` dont l'`insert` dans `property_boost_daily_stats` lève (`DB::beforeExecuting`) → exception propagée, clé de cache de l'heure à `NULL`, puis `boosts:tick` normal → 0 ligne, les deux impressions sont perdues. Charge 2,55 sur 8 cœurs. Les deux autres parties ne sont pas re-mesurées par exécution : le double versement demande deux planificateurs (aucun aujourd'hui), et le saut de `flush()` quand une étape antérieure lève tient par lecture seulement. Classement : A1, l'en-tête de la classe et l'ADR-0061 § 10 écrivent que les compteurs sont versés dans `property_boost_daily_stats` ; le correctif lit chaque compteur par `get`, écrit la ligne, puis `forget` la clé après l'`upsert` réussi, sans toucher à l'ordre des étapes du tick ni au verrou entre serveurs, hors de ce classement.
- Mesure (2026-10-17, c98fe9c5, implementeur) : reproduit avant correctif par `BoostStatsFlushFailureTest` : deux impressions et un clic, puis un `flush()` dont l'écriture dans `property_boost_daily_stats` lève (`DB::beforeExecuting`) → compteur des impressions à 0 en cache → `flush()` lit, écrit, puis retire : les compteurs restent après l'échec, et les deux ticks suivants versent 2 impressions et 1 clic une seule fois ; 7 verts sur `BoostStatsFlushFailureTest`, `BoostStatsTest` et `BoostsTickIdempotenceTest` ; ablation (`pull` restauré : 1 rouge ; retrait supprimé : 2 rouges), puis vert. Ni l'ordre des étapes du tick ni le double versement entre planificateurs ne sont touchés, hors du classement A1.

### Petites améliorations
- Réf : P18.06
- Statut : fait · TCK-794
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Boost/BoostStatsRecorder.php:36-44`, `takussan-web/src/components/boost/arrivee-sponsorisee.ts:7-25`, `takussan-web/src/hooks/useProperties.ts:54-66`, `takussan-web/src/app/[locale]/(public)/playground/PlaygroundClient.tsx:30-32`
- Constat :
  - **Un clic par bien, par IP et par heure** (lu, `RateLimiter::hit('boost-click:…', 3600) > 1`), quand la vue de fiche en accepte trois (`PropertyViewCounter::MAX_PAR_HEURE`). Derrière un NAT d'opérateur mobile, beaucoup de visiteurs partagent une IP : les clics sont sous-comptés. La justesse de l'IP elle-même relève de l'angle 37.
  - **Le marqueur d'arrivée est un seul emplacement en `sessionStorage`** (lu). Un clic du milieu ou « ouvrir dans un nouvel onglet » ouvre une session de navigation distincte, qui ne le lit pas, et le marqueur reste dans l'onglet d'origine. Le comportement réel selon les navigateurs est à vérifier.
  - **`/playground` est servi sur le site public** (noindex, mais non interdit par `robots.txt`) et appelle la recherche par `useProperties` pour ses rangées « près de toi » et « location » (lu). Chaque affichage compte des impressions sponsorisées qu'il ne montre pas.
  - **Ce qui tient** : les compteurs sont en Redis (`docs/infra/prod-drivers.json`), donc `increment` est atomique ; une heure versée n'est jamais reversée (`LAST_FLUSHED_KEY`) ; la recherche élargie ne tire aucun emplacement.
- Piste : aligner le plafond des clics sur celui des vues, ou le justifier ; porter le marqueur dans l'URL (`?src=sponsored`) plutôt qu'en stockage de session ; retirer `/playground` des environnements déployés, ou lui faire lire une source sans effet de bord.
- Mesure (2026-10-16, b775f8f6, mesureur) : lu `BoostStatsRecorder.php:36-44` (`RateLimiter::hit(…, 3600) > 1`) contre `PropertyViewCounter.php:31` (`MAX_PAR_HEURE = 3`) ; `arrivee-sponsorisee.ts:7-25` (une seule clé `sessionStorage`) ; `PlaygroundClient.tsx:30-31` (`city` et `transaction`), qui passent par `/public/properties/search` (`useProperties.ts:66`), où `PropertySearchService.php:659` compte les impressions → les trois constats tiennent ; le comportement des onglets selon les navigateurs n'a pas été vérifié. Classement : V7, chaque correctif est un choix (plafond, forme du lien, sort de `/playground`), et ces compteurs mesurent un produit payé (V1).
- Mesure (2026-10-17, c98fe9c5, implementeur) : reproduit avant correctif : `BoostStatsTest` à quatre clics d'une IP puis un d'une autre → 2 clics versés au lieu de 4 ; `EmplacementSponsorise.test.tsx` et `PropertyCard.robe.test.tsx` : le lien d'un emplacement et de la rangée vedette menait à `/fr/properties/<slug>` sans marqueur ; `CompteurDeVueSponsorise.test.tsx` : une fiche ouverte avec `?src=sponsored` envoyait une vue organique ; `playground/__tests__/page.test.tsx` : la page se rendait en production → plafond à `MAX_PAR_HEURE` (3), contexte `ArriveeSponsorisee` qui marque `LienDeCarte`, `CompteurDeVue` qui lit puis retire le marqueur de l'URL, `/playground` en 404 sous `NODE_ENV=production` ; 5 verts API et 40 verts front ; ablation (plafond : 1 rouge ; marqueur, compteur et garde : 4 rouges), puis vert.

## Angle 19 — Rétention des tables qui grossissent

*Exploré le 2026-10-15 sur `pre-dev` 8ebb0cc3, par l'explorateur. Tout a été relu par
l'explorateur lui-même, sans sous-agent : `routes/console.php`, `config/activitylog.php`, la
commande `activitylog:clean` du paquet, `AccountDeletionService::anonymize`, `User::getActivitylogOptions`,
`ActivityLogExporter`, `ScheduledRunRecorder`, `ScheduledTaskInspector`, `NotificationController`,
TCK-537, ADR-0044 § 4 et `privacy.ts` § 6. Volumes lus en `SELECT` sur la base de développement
(port 5433) : une base de dev, alimentée par les seeders et un planificateur qui ne tourne pas en
continu ; elle ne dit rien des volumes de préproduction, qui n'ont pas été lus. Un test temporaire,
retiré depuis, sur la base de test (charge 3,34 / 3,11 / 2,67 sur 8 cœurs). Ce qui touche la purge
du journal d'activité elle-même est déjà porté par TCK-537 et P02.11 : les entrées ci-dessous n'y
ajoutent que des faits neufs.*

### L'anonymisation d'un compte recopie son identité d'origine dans `activity_log`, qui n'est jamais purgé
- Réf : P19.01
- Statut : fait · TCK-688 — reste : les lignes dont ce compte est seulement le causeur, que le correctif ne touche pas
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Account/AccountDeletionService.php:218-271`, `takussan-api/app/Models/User.php:379-398`, `takussan-api/routes/console.php` (aucune entrée `activitylog:clean`), `takussan-web/src/content/legal/privacy.ts:123,129`
- Constat :
  - `User` journalise `email`, `first_name`, `last_name`, `phone`, `username` et `email_verified_at`, avec `logOnlyDirty()` (lu, `User.php:381-392`).
  - `anonymize()` efface ces champs par un `forceFill()->save()`, puis un `delete()` (lu, `AccountDeletionService.php:235-271`). Rien n'y coupe le journal.
  - Mesuré par un test temporaire : un utilisateur créé avec un e-mail, un téléphone, un prénom et un nom, puis anonymisé. `activity_log` porte ensuite quatre lignes `default` sur ce sujet. La ligne `updated` de l'anonymisation contient, sous `attribute_changes.old`, l'e-mail, le téléphone, le prénom, le nom et l'identifiant d'origine. La ligne `created` les contient aussi.
  - `activitylog:clean` n'est pas planifiée (lu, `routes/console.php`), et `clean_after_days` vaut 365 (lu, `config/activitylog.php:18`). Ces lignes restent donc sans limite. Même planifiée, la purge les garderait douze mois.
  - La politique dit qu'après le délai de 30 jours « les données d'identification du compte et des profils sont ensuite effacées ou anonymisées » (lu, `privacy.ts:123`). TCK-537 relève que la purge n'est pas planifiée, mais pas que l'anonymisation elle-même écrit l'identité dans le journal.
  - Établi comment : test temporaire `anonymize()` sur la base de test, puis lecture de `activity_log` filtrée par sujet.
- Piste : anonymiser sans journaliser les valeurs (`$user->disableLogging()` autour du `save()`, ou une ligne `Account` sans diff), et effacer `attribute_changes` des lignes dont le sujet ou le causeur est ce compte. Un test : après `anonymize()`, aucune ligne de `activity_log` ne contient l'e-mail ni le téléphone d'origine. Ablation : retirer la coupure → rouge.
- Mesure (2026-10-15, 92e465d6, mesureur) : relu `AccountDeletionService::anonymize()` (`forceFill([...])->save()` puis `delete()`, aucune coupure du journal, lignes 218-279) et `User::getActivitylogOptions()` (`User.php:379-398`, `email`, `phone`, noms, `username` journalisés) ; `routes/console.php` sans `activitylog:clean` ; `clean_after_days = 365` ; `grep` des tickets → TCK-537 (`todo`) planifie la purge mais ne traite pas l'identité recopiée par l'anonymisation ; test temporaire `tests/Feature/Tmp/MesureurP19Test.php`, retiré depuis (charge 1,58 / 1,54 / 1,89 sur 8 cœurs), qui crée un utilisateur, le modifie puis l'anonymise → quatre lignes `default` sur ce sujet ; la ligne `updated` de l'anonymisation porte sous `attribute_changes.old` l'e-mail, le téléphone, le prénom, le nom et l'identifiant d'origine, la ligne `created` aussi ; `attribute_changes::text like` sur l'e-mail ou le numéro → 2 lignes. Constat confirmé tel qu'écrit. Classement : V3, la piste décide ce que le journal conserve d'un compte supprimé et réécrit des lignes de preuve existantes (V4 aussi pour la réécriture de l'historique).
- Mesure (2026-10-16, 1945dbf8, implementeur) : reproduit avant correctif par `AccountDeletionExecuteTest::test_execute_ne_laisse_pas_l_identite_d_origine_dans_activity_log` (compte créé avec e-mail, téléphone, noms et identifiant, puis modifié, puis `executeDeletion()`) → rouge, 2 lignes d'`activity_log` portent encore l'e-mail d'origine ; correctif dans `anonymize()` (`disableLogging()` autour du `save()` et du `delete()`, `attribute_changes` mis à `null` sur les lignes dont le compte est le sujet) → vert ; ablation : sans `disableLogging()`, rouge (4 lignes sur le sujet au lieu de 2), sans l'effacement, rouge (1 ligne porte l'e-mail). Les lignes dont le compte n'est que le causeur ne sont pas touchées (hypothèse du ticket).

### Le numéro de téléphone survit à l'anonymisation dans `notification_delivery_attempts.to`, une table sans purge
- Réf : P19.02
- Statut : fait · TCK-691
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Account/AccountDeletionService.php:218-271`, `takussan-api/database/migrations/2026_04_27_000001_create_notification_delivery_attempts_table.php:26`, `takussan-api/app/Services/Notifications/Sms/SmsRouterDriver.php:255`, `takussan-api/app/Notifications/Channels/WhatsappChannel.php:320`
- Constat :
  - Chaque envoi SMS ou WhatsApp écrit une ligne avec `to`, le numéro du destinataire (lu, `SmsRouterDriver.php:255`, `WhatsappChannel.php:320`).
  - `anonymize()` ne touche ni cette table ni `app_notifications` (lu). La FK `app_notifications.user_id` est en `cascadeOnDelete`, mais le compte n'est que soft-deleted : rien ne cascade.
  - Mesuré par le même test temporaire : une notification et une tentative `to = +221771234567` pour l'utilisateur, puis `anonymize()`. La tentative garde `to = +221771234567`, et la notification existe toujours.
  - Aucune commande planifiée ne purge `notification_delivery_attempts` (lu, `routes/console.php`). La politique ne lui donne aucune durée (lu, `privacy.ts:121-134`).
- Piste : à l'anonymisation, mettre `to` à `null` (ou le masquer) sur les tentatives des notifications du compte ; fixer une durée de rétention des tentatives et la planifier. Un test : après `anonymize()`, aucune tentative ne porte le numéro d'origine.
- Mesure (2026-10-15, 92e465d6, mesureur) : relu `anonymize()` (ni `notification_delivery_attempts` ni `app_notifications` touchées) et la migration `2026_04_27_000001` (`to` nullable, FK `cascadeOnDelete` sur `app_notifications`, que le soft-delete du compte ne déclenche pas) ; `routes/console.php` : aucune purge de la table ; même test temporaire, retiré depuis, avec une notification et une tentative `to = +221771234567` → après `anonymize()`, la tentative garde `to = +221771234567` et la notification existe toujours. Constat confirmé. Classement : V3, la piste choisit ce qui est effacé ou masqué et une durée de rétention que la politique ne donne pas.
- Mesure (2026-10-16, aa45a57f, implementeur) : reproduit avant correctif par `AccountDeletionExecuteTest::test_execute_efface_le_numero_des_tentatives_d_envoi_du_compte` (tentative `to = +221771234567` sur une notification du compte, puis `executeDeletion()`) → rouge, 1 tentative porte encore le numéro ; et par `PruneNotificationDeliveryAttemptsCommandTest` → rouge, commande et planification absentes ; correctif : `anonymize()` met `to` à `null` sur les tentatives des notifications du compte (celles d'un autre compte gardent le leur), et `notifications:prune-delivery-attempts` supprime les tentatives de plus de 90 jours, planifiée chaque jour à 03:50 sans chevauchement → vert ; ablation : sans l'effacement, rouge (1 ligne au lieu de 0) ; sans la suppression ni la planification, 2 rouges (la tentative de 91 jours reste, l'événement est introuvable).

### L'export CSV du journal rend `properties_diff` vide pour toute modification d'un modèle
- Réf : P19.03
- Statut : fait · TCK-692
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Audit/ActivityLogExporter.php:135-158`, `takussan-api/app/Services/Crm/CustomerActivityFeed.php:65-67`
- Constat :
  - Depuis activitylog v5, les changements de champs vivent dans `attribute_changes`, et `properties` reste `[]` (mesuré : lignes `created`, `updated` et `deleted` de `User` dans le test temporaire). `CustomerActivityFeed` le dit et lit `attribute_changes` (lu, `:65-67`).
  - `mapRow()` cherche `attributes` et `old` dans `properties` seulement (lu, `ActivityLogExporter.php:139-145`).
  - Mesuré : `mapRow()` appelé par réflexion sur la ligne `updated` d'un `User` rend `properties_diff = NULL`. Le CSV d'audit, celui de l'agence comme celui de la console (`payloadForQuery`), ne contient donc aucun avant/après.
  - Aucun test ne vérifie `properties_diff` (mesuré : `grep -rln properties_diff takussan-api/tests` → rien).
- Piste : lire `attribute_changes`, le passer par `PropertyRedactor` comme `properties`. Un test : l'export d'une ligne `updated` porte l'ancienne et la nouvelle valeur, expurgées. L'angle 56 cherche les autres lecteurs restés sur l'ancienne forme.
- Mesure (2026-10-15, 92e465d6, mesureur) : relu `ActivityLogExporter::mapRow()` (cherche `attributes`/`old` dans `properties` seulement) et `CustomerActivityFeed::format()` (lit `attribute_changes`) ; `PropertyRedactor` ne masque que des secrets et `rib`/`iban`/`tax_id`/`ninea`/`id_document`, pas `email` ni `phone` ; même test temporaire, retiré depuis → les lignes `created`/`updated`/`deleted` d'un `User` ont `properties = []` et le diff dans `attribute_changes` ; `mapRow()` appelé par réflexion sur la ligne `updated` rend `properties_diff = NULL` ; `grep properties_diff tests` → seul `tests/impact-map.json`, aucun test ne le vérifie. Constat confirmé. Classement : V3, la correction fait sortir dans un fichier téléchargé les valeurs personnelles avant/après que `PropertyRedactor` laisse passer, ce que TCK-613 (`todo`, export du journal et données personnelles) doit trancher.
- Mesure (2026-10-16, 34b00664, implementeur) : reproduit avant correctif par le test neuf `ActivityLogExporterTest::test_l_export_d_une_modification_porte_l_avant_et_l_apres_expurges` (un `User` modifié, export CSV du super-admin) → `properties_diff` sans `attributes` (« null is identical to 'Apres' »), et `PropertyRedactor` laissait `email`/`phone` en clair (6 clés en rouge). Correctif : `mapRow()` lit `attribute_changes` passé par `PropertyRedactor`, qui masque toute clé de dernier segment `email` ou `phone`. Ablation : `mapRow()` seul remis → 1 rouge ; `PropertyRedactor` seul remis → 7 rouges ; remis → 34 verts.

### La purge que TCK-537 doit planifier n'épargnerait pas la plupart des journaux de preuve
- Réf : P19.04
- Statut : retenu · à valider — V3 : durée de conservation de journaux qui portent des données personnelles ; porteur (2026-10-15) : traité hors agents, durées à écrire dans TCK-537
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/vendor/spatie/laravel-activitylog/src/Commands/CleanActivitylogCommand.php:13-40`, `takussan-api/config/activitylog.php:71-74`, `takussan-api/app/Http/Controllers/Api/Admin/CrossTenantAuditController.php:40-52`, `docs/backlog/tickets/TCK-537-ecarts-entre-la-politique-de-confidentialite-et-le-code.md` (contrainte 5, AC3b)
- Constat :
  - `activitylog:clean {log?}` purge un seul journal ou tous (lu, `CleanActivitylogCommand.php:13-40`). La commande ne sait pas exclure des journaux. L'exemption que demande TCK-537 passe donc par l'action surchargeable `actions.clean_log` (lu, `config/activitylog.php:73`) ou par une commande à part.
  - TCK-537 n'exempte que `PersonalDataAccess` et `Privacy`. La console tient pourtant onze journaux pour sensibles : `PrivacyRequest`, `Security`, `UserSupport`, `KYC`, `KycDossier`, `Membership`, `AgencyRole`, `Integration`, `export`… (lu, `CrossTenantAuditController.php:40-52`). Le registre des droits écrit sous `PrivacyRequest` (lu, `activity(PrivacyRequest::LOG_NAME)`), et l'exécution d'une suppression de compte sous `Account` (lu, `AccountDeletionService.php:115,154,193`). Une purge à 365 jours effacerait ces traces.
  - `LeasePayment`, `BookingPayment`, `Invoice`, `Payout` et `CommissionEntry` portent `Auditable` (mesuré : `grep -rln "use Auditable" app/Models`). La politique garde ces pièces 10 ans (lu, `privacy.ts:125`). Leur journal de modification relève-t-il de cette durée ? À vérifier par le porteur.
- Piste : écrire dans TCK-537 la liste des journaux exemptés à partir de ceux qui existent (`grep -rhoE "activity\('[A-Za-z_]+'\)" app` et `useLogName`), et une durée par journal plutôt qu'une exemption. Un test par journal exempté, en plus de l'AC3b.
- Mesure (2026-10-15, d62e3290, mesureur) : relu `CleanActivitylogCommand.php:13-40` (argument `{log?}` unique, pas d'exclusion), `config/activitylog.php:71-74` (`clean_log` surchargeable), `CrossTenantAuditController::SENSITIVE_LOG_NAMES` (onze journaux), TCK-537 contrainte 5 et AC3b (exempte seulement `PersonalDataAccess` et `Privacy`, ticket `todo`, dernière modification `e8882992`) ; `grep activitylog:clean routes/console.php` → rien, purge toujours non planifiée ; `grep -rhoE "activity\('…'\)|LOG_NAME|useLogName"` → 30 noms de journaux, dont `Account` (3, `AccountDeletionService.php:115,154,193`) que rien n'exempte. Inexact dans le constat : `PrivacyRequest::LOG_NAME` vaut `'Privacy'` (`PrivacyRequest.php:34`), donc le registre des droits écrit sous `Privacy`, déjà exempté par TCK-537, et aucun code n'écrit sous `'PrivacyRequest'` (seule mention : `CrossTenantAuditController.php:43`). Le reste du constat tient. Classement : V3, fixer la durée de conservation de chaque journal (et celle des journaux de pièces comptables) est une décision RGPD que la piste renvoie elle-même au porteur.

### `scheduled_task_runs` : environ 10 000 lignes par jour en production, et la console agrège tout l'historique
- Réf : P19.05
- Statut : fait · TCK-801 — reste : la purge planifiée de `scheduled_task_runs`, à 7 jours ici et à 90 jours en P02.11 : durée à trancher par le porteur
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/routes/console.php:106-115`, `takussan-api/app/Services/Admin/ScheduledRunRecorder.php:56-73`, `takussan-api/app/Services/Admin/ScheduledTaskInspector.php:17-48`
- Constat :
  - Voir P02.11 pour l'absence de purge et le balayage de la sonde. Les faits qui suivent sont neufs.
  - Une ligne par exécution (lu, `ScheduledRunRecorder.php:56`). Chaque minute : quatre battements de file, `impersonation:close-expired` et `health:probe` (lu, `console.php:106-113`). Mesuré en dev : 7 856 lignes `RecordQueueHeartbeat` contre 1 964 `health:probe`, soit quatre par minute. Avec les cinq tâches toutes les cinq minutes, un planificateur continu écrit environ 6 × 1 440 + 5 × 288 ≈ 10 000 lignes par jour, soit 3,7 millions par an. C'est déduit du calendrier : le volume de préproduction est à vérifier.
  - `ScheduledTaskInspector::all()` fait un `GROUP BY task` sur toute la table, avec `avg(duration_ms)` depuis la première exécution et une sous-requête triée par tâche (lu, `:17-48`). Mesuré par `EXPLAIN ANALYZE` en dev : Seq Scan des 14 948 lignes, puis 39 sous-plans en Bitmap Heap Scan et Sort, 7 ms. Le coût croît avec l'historique, et la durée moyenne affichée ne reflète jamais une régression récente.
  - Le nom d'une commande est sa ligne de commande complète, chemin absolu du binaire PHP compris (mesuré : `'/opt/homebrew/Cellar/php/8.4.6/bin/php' 'artisan' health:probe`). Changer de version de PHP ou d'image coupe l'historique en deux, et l'ancien nom reste listé dans la console à jamais : aucune ligne ne disparaît.
- Piste : une purge planifiée à quelques jours, bornée à la dernière exécution conservée par tâche ; une moyenne sur une fenêtre (7 jours) ; un nom stable par `->name()` ou dérivé de la commande Artisan sans le binaire. Un test : deux chemins de binaire différents donnent le même nom.
- Mesure (2026-10-15, d62e3290, mesureur) : relu `routes/console.php:106-113` (quatre battements, `impersonation:close-expired` et `health:probe` chaque minute), `ScheduledRunRecorder::record()` (une ligne par exécution) et `nomDe()` (`description` sinon la commande complète), `ScheduledTaskInspector::all()` (`GROUP BY task`, `avg(duration_ms)` sur tout l'historique, sous-requête triée) ; `grep -rln scheduled_task_runs app/Console database/migrations` → seule la migration de création, aucune purge ; `SELECT` en lecture sur la base de dev → 14 948 lignes, 39 tâches, et `health:probe` nommée `'/opt/homebrew/Cellar/php/8.4.6/bin/php' 'artisan' health:probe` (1 964 lignes). Le volume de préproduction reste à vérifier. Classement : V4, la purge supprime des données, et la fenêtre de moyenne change ce que la console affiche (V7) : deux choix pour le porteur.
- Mesure (2026-10-17, 7c7bd05bf, implementeur) : avant correctif, `ScheduledRunRecorder::nomDe()` rendait la commande entière (deux binaires PHP → deux noms) et `ScheduledTaskInspector::all()` moyennait tout l'historique (5 100 ms pour des exécutions récentes de 100 et 300 ms) → deux tests neufs de `SchedulerRunStatusTest` (nom sans binaire, moyenne sur 7 jours) ; ablation : correctif retiré, les deux rougissent ; remis, la classe est verte (10 tests). La purge n'est pas posée : sa durée contredit celle de P02.11 (90 jours, décision postérieure).

### `app_notifications` : aucune durée de rétention, et l'index `(user_id, is_read)` ne sert aucune lecture
- Réf : P19.06
- Statut : validé — 6 mois pour les notifications lues, ajouté à TCK-537 ; reste : l'index, posé sur une mesure de volume
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Http/Controllers/Api/NotificationController.php:20-31`, `takussan-api/database/migrations/2026_04_17_160032_create_app_notifications_table.php:13,26`, `takussan-web/src/content/legal/privacy.ts:121-134`
- Constat :
  - Aucune purge des notifications in-app (lu, `routes/console.php`), et la politique ne leur donne aucune durée (lu). Mesuré en dev : 10 271 lignes depuis le 2025-07-24, dont 6 202 lues ; l'utilisateur qui en a le plus en porte 253.
  - La liste et le compteur filtrent sur `read_at` (lu, `NotificationController.php:21,29-30`). L'index posé est `(user_id, is_read)`. Mesuré par `EXPLAIN ANALYZE` : PostgreSQL passe par `app_notifications_user_id_digested_at_index` sur `user_id` seul, filtre `read_at` en mémoire, puis trie par `created_at`. 0,2 ms à ce volume.
  - `is_read` et `read_at` disent la même chose : mesuré, 4 069 lignes `false`/`null` et 6 202 `true`/non nul, aucune divergence. Seuls les deux résumés lisent encore `is_read` (lu, `SendDailyNotificationDigest.php:40`, `DigestBuilderService.php:30`).
- Piste : une durée pour les notifications lues (par exemple 6 mois), écrite dans la politique ; un index `(user_id, created_at DESC, id DESC)`, avec une condition partielle `WHERE read_at IS NULL` pour le compteur, posé sur mesure d'un volume réel.
- Mesure (2026-10-16, 1efd784a, mesureur) : relu `NotificationController.php:17-31` (liste et compteur filtrent sur `read_at`, triés `created_at` puis `id`), la migration de création (index `(user_id, is_read)`, l. 26), `routes/console.php` (aucune purge d'`app_notifications`) et `privacy.ts:121-140` (§ 6 sans ligne pour les notifications) ; `is_read` lu seulement par `SendDailyNotificationDigest.php:40` et `DigestBuilderService.php:30` ; en lecture sur la base de dev, `SELECT` → 10 271 lignes depuis le 2025-07-24, 6 202 lues, 0 ligne où `is_read` diverge de `read_at`, et `EXPLAIN` de la liste non lue de l'utilisateur le plus chargé → `Bitmap Index Scan` sur `app_notifications_user_id_digested_at_index`, `Filter: (read_at IS NULL)`, puis `Sort` sur `created_at DESC, id DESC`. Constat confirmé. Classement : V3, la piste fixe ce qui est conservé et combien de temps, et l'écrit dans la politique de confidentialité ; l'index seul (A2) attend, selon la piste elle-même, un volume réel.

### Petites améliorations
- Réf : P19.07
- Statut : fait · TCK-803 — reste : `next_due_at` de l'inspecteur des tâches, à calculer depuis l'expression cron ou à retirer, la `Piste` laissant le choix ouvert
- Gravité : 🟢 amélioration
- Où : `takussan-api/routes/console.php`, `takussan-api/app/Support/Logging/SanitizingFailedJobProvider.php:9-17`, `takussan-api/app/Models/User.php:379-398`, `takussan-api/app/Services/Admin/ScheduledTaskInspector.php:43`
- Constat :
  - **`queue:prune-failed` et `queue:prune-batches` ne sont pas planifiées** (lu). `failed_jobs.payload` est gardé tel quel, pour le rejeu (lu, `SanitizingFailedJobProvider.php:12`), sans limite de durée. La file est `database` en préproduction (lu, `docs/infra/prod-drivers.json`).
  - **Le journal de `User` tombe dans `default`** (mesuré : les quatre lignes du test temporaire), avec les écritures sans nom de journal. `User` ne pose pas `useLogName`, quand `Auditable` nomme par classe (lu, `Auditable.php:31`). Une purge ou une exemption par nom ne peut donc pas viser les changements d'identité seuls.
  - **`next_due_at` vaut toujours `null`** dans l'inspecteur des tâches (lu, `ScheduledTaskInspector.php:43`).
  - **Ce qui tient** : `integration_webhook_logs` (`webhooks:prune`), les jetons (`sanctum:prune-expired`, `sessions:prune-idle`), les brouillons, les archives d'export et les alertes non confirmées ont leur purge planifiée (lu, `console.php:49,79,101-104,118,169`). `platform_metrics_daily` écrit une ligne par jour (lu, ADR-0057 : « ne demande aucune purge ») ; `property_boost_daily_stats` une par bien et par jour (mesuré : 71 lignes en dev). Les sessions sont en Redis (lu, `prod-drivers.json`) : la table `sessions` ne grossit pas.
- Piste : planifier `queue:prune-failed --hours=…` et `queue:prune-batches`, avec une durée dite dans l'ADR-0044 ; nommer le journal de `User` (`useLogName('User')`) ; calculer `next_due_at` depuis l'expression cron ou retirer la clé.
- Mesure (2026-10-16, 1efd784a, mesureur) : relu `routes/console.php` (ni `queue:prune-failed` ni `queue:prune-batches`, aucun `model:prune`), `SanitizingFailedJobProvider.php:17` (le `payload` n'est pas touché, pour le rejeu), `docs/infra/prod-drivers.json` (`QUEUE_CONNECTION` = `database`), `User.php:379-399` (`LogOptions::defaults()` sans `useLogName`, alors qu'`Auditable.php:31` nomme par classe), `config/activitylog.php:24` (`default_log_name` = `default`) et `ScheduledTaskInspector.php:43` (`'next_due_at' => null`, que le front type `string | null` dans `types/super-admin.ts:814`). Lignes citées inchangées, les trois défauts tiennent ; le journal de `User` est lu, pas re-mesuré par test. Classement : V3, la durée de purge des `failed_jobs` décide de ce qui est conservé et doit s'écrire dans l'ADR-0044 ; renommer le journal de `User` change le `log_name` des écritures neuves, que toute lecture par nom distinguerait des anciennes.
- Mesure (2026-10-16, 55a41109, humain) : l'ADR-0044 est amendé en session (TCK-723) : 30 jours pour `failed_jobs`, `payload` compris, et `queue:prune-batches` planifié ; le docblock de `SanitizingFailedJobProvider.php` (« Écarté (ADR-0044) : une purge périodique ») est à mettre à jour avec la purge.
- Mesure (2026-10-17, 7c7bd05bf, implementeur) : avant correctif, ni `queue:prune-failed` ni `queue:prune-batches` parmi les événements du planificateur, et une modification de `User` écrite sous le journal `default` → `QueueRetentionScheduleTest` (deux purges planifiées chaque jour sans chevauchement, `--hours=720` ; journal `User`) ; ablation : correctif retiré, les trois tests rougissent ; remis, verts. Docblock de `SanitizingFailedJobProvider` repris. `next_due_at` n'est pas fait : la `Piste` propose de le calculer ou de retirer la clé, et la précision ne tranche pas.

## Angle 20 — Nombre réel de requêtes SQL par écran

*Exploré le 2026-10-15 sur `pre-dev` ccabd662, par l'explorateur. Mesure par un test temporaire,
retiré depuis : pour chaque liste, l'appel exact du front (champs, `include`, tri, `per_page`, lus
dans `takussan-web/src/lib/queries/*.ts`) est joué par un admin d'agence sous
`DB::enableQueryLog()`, à 2 lignes puis à 12, après un appel d'amorce. Les requêtes en plus sont
attribuées par `debug_backtrace` à leur ligne de `app/`. Charge relevée avant : `vm.loadavg`
2,57 sur 8 cœurs. Tout a été relu par l'explorateur, sans sous-agent. Limites : base de test
`RefreshDatabase`, une ligne de chaque liste a son bien, son client et sa photo propres (le pire
cas, pas la moyenne) ; les listes passées par `filter[search]` et la recherche publique n'ont pas
été mesurées (Scout coupé dans la suite) ; un appel HTTP mesuré n'est pas un écran entier, qui en
fait parfois plusieurs (voir P02.08, P02.10).*

Déjà sain (mesuré, 2 puis 12 lignes) : `GET /api/property-visits` 17 → 17 requêtes,
`GET /api/contact-leads` 23 → 23, `GET /api/invoices` 13 → 13 ; la fiche publique
`GET /api/public/properties/{slug}` 18 requêtes avec 1 photo, 19 avec 10 photos et 5 documents
publics ; `GET /api/auth/me` 12 requêtes pour un admin d'agence. La liste pro des biens, le tableau
de bord, les membres d'agence et les signalements d'avis ont déjà leur budget gardé par un test
(`PropertyIndexQueryBudgetTest`, `DashboardQueryBudgetTest`, `AgencyMembersQueryCountTest`,
`ReviewFlagsQueryCountTest`).

### La liste des clients charge et rend toutes les notes internes de chaque fiche
- Réf : P20.01
- Statut : fait · TCK-705 — reste : le test de budget « 2 lignes = 12 lignes » sur `GET /api/customers`, une fois la lecture `platform_profiles` par ligne retirée (P20.03)
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Resources/CustomerResource.php:30`, `takussan-api/app/Models/Customer.php:60,273`, `takussan-web/src/lib/queries/customers.ts:88-90`
- Constat :
  - `'notes' => $this->notes` lit d'abord l'attribut. `notes` est à la fois une colonne (lu, `Customer.php:60`) et une relation `HasMany` (lu, `:273`). Le front ne demande pas la colonne dans `fields[customers]` (lu, `customers.ts:88`) : l'attribut est absent, et Eloquent retombe sur la relation, chargée paresseusement ligne par ligne (lu).
  - mesuré : `GET /api/customers` avec les champs et l'`include=tags` du front → 29 requêtes pour 2 fiches, 49 pour 12 ; une `select * from "customer_notes" where "customer_id" = ?` par ligne, attribuée à `CustomerResource.php:30`.
  - mesuré : un client à trois notes → `data.0.notes` rend les trois notes entières (`id`, `author_id`, `body`, `pinned`, `kind`, `deleted_at`…), sérialisées brutes, dates en `2026-10-15T16:49:14.000000Z` et non par `iso()` (ADR-0018). Personne ne les a demandées, et la liste n'en lit aucune (à vérifier côté composant).
  - Le même repli vaut pour la fiche (`DASHBOARD_CUSTOMER_DETAIL_FIELDS` n'a pas `notes` non plus, lu) : retirer `notes` de l'`include` comme le propose P02.09 ne suffit pas, la relation serait encore chargée par la ressource (déduit, à vérifier).
- Établi comment : test temporaire, puis relecture de la ressource et du modèle.
- Piste : rendre la colonne seulement si elle est sélectionnée (`array_key_exists('notes', $this->resource->getAttributes())`), et la relation sous une autre clé par `whenLoaded`, ou ne plus la rendre du tout ; garder par un test de budget « 2 lignes = 12 lignes » sur `GET /api/customers`.
- Mesure (2026-10-15, 66ed4340, mesureur) : relu `CustomerResource.php:30` (`'notes' => $this->notes`), `Customer.php:60` (colonne `notes` fillable) et `:273` (relation `notes(): HasMany`), `customers.ts:24-34` (`DASHBOARD_CUSTOMER_FIELDS` sans `notes`) ; test temporaire, retiré, `GET /api/customers` avec ces champs et `include=tags`, une note par client → **28 requêtes pour 2 clients, 47 pour 12**, dont une `customer_notes` par ligne (2, puis 12), et `data.0.notes` rend la note brute (`author_id`, `body`, `deleted_at`, `created_at` en `…000000Z`) ; aucun appelant du front ne lit `customer.notes` : la fiche et le tiroir lisent `/api/customers/<built-in function id>/notes` (`customers/[id]/page.tsx:87`, `CustomerDetailSheet.tsx:45`), et les notes rendues sont celles que `view` sur le client ouvre déjà, sans fuite hors agence. Charge 2,37 sur 8 cœurs. Classement : A2, la requête par ligne disparaît sans retirer rien de ce qu'un appelant demande (colonne si sélectionnée, relation seulement si chargée par `include=notes`).
- Mesure (2026-10-16, 8090ffd7, implementeur) : avant correctif, `CustomerIndexQueryBudgetTest` (liste avec les champs et l'`include=tags` du front, une note par client) → 28 requêtes pour 2 clients, 48 pour 12, une `customer_notes` par ligne, et `data.0.notes` présent ; correctif : `notes` sous `when()`, la colonne si elle est lue, la relation si `include=notes` l'a chargée → 0 lecture de `customer_notes` pour 2 comme pour 12, clé `notes` absente, colonne rendue sans `fields`, `include=notes` toujours rendu (4 verts) ; ablation → 2 rouges, correctif remis → 4 verts. Le budget complet reste à 26 contre 36 : une lecture `platform_profiles` par ligne (`isSuperAdmin()`), qui est P20.03.

### La liste des demandes d'intervention fait six requêtes par ligne
- Réf : P20.02
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Resources/MaintenanceRequestResource.php:71,77,237-253`, `takussan-api/app/Policies/MaintenanceRequestPolicy.php:264-283`, `takussan-api/app/Models/User.php:299`
- Constat :
  - mesuré : `GET /api/maintenance-requests` avec l'appel du front → 37 requêtes pour 2 lignes, 97 pour 12. Par ligne : deux `platform_profiles`, deux `exists` sur `agent_profiles`, deux sur `agency_admin_profiles`, attribuées à `MembershipCapabilityResolver.php:457-480` via `User::staffAgencyId()`.
  - Chaque ligne appelle `seesQuote()` (`:71`) et `isPrincipal()` (`:77`), qui appellent tous deux `MaintenanceRequestPolicy::isPrincipalFor()` : `isSuperAdmin()` puis `staffAgencyId()`, sans mémoïsation (lu). À la page de 20 du front, cela fait de l'ordre de 145 requêtes (déduit de la pente).
  - `LeaseResource` et `CustomerResource` mettent déjà l'agence du personnel en cache dans `$request->attributes` (lu, `LeaseResource.php:128-132`, `CustomerResource.php:90-93`) ; cette ressource ne le fait pas.
- Établi comment : test temporaire avec pile d'appel, relecture de la ressource et de la politique.
- Piste : calculer `isPrincipal` une fois par ligne et le réutiliser dans `seesQuote`, et lire `staffAgencyId()` une fois par requête comme les deux ressources voisines ; test de budget sur la liste.
- Mesure (2026-10-15, d62e3290, mesureur) : relu `MaintenanceRequestResource.php:71,77,237-253` (`seesQuote()` et `isPrincipal()` appellent chacun `MaintenanceRequestPolicy::isPrincipalFor()`), `MaintenanceRequestPolicy.php:264-283` (`isSuperAdmin()` puis `staffAgencyId()`), `User.php:299-302` (résolveur, sans cache) ; test temporaire, retiré depuis, `GET /api/maintenance-requests?include=property&fields[properties]=…&per_page=20` en admin d'agence → 36 requêtes pour 2 lignes, 96 pour 12 (6 par ligne : `agent_profiles`, `agency_admin_profiles`, `platform_profiles`, deux de chaque). Charge 3,45 sur 8 cœurs. Constat confirmé. Classement : A2, la réponse ne change pas ; le correctif calcule `isPrincipal` une fois par ligne et le réutilise dans `seesQuote`, et lit `staffAgencyId()` une fois par requête dans `$request->attributes` comme `LeaseResource.php` et `CustomerResource.php`, avec un test de budget de requêtes sur la liste ; la relecture de `isSuperAdmin()` par ligne relève de P20.03.

### `isSuperAdmin()` est relu à chaque ligne des baux, des clients et des réservations
- Réf : P20.03
- Statut : caduc — fermé par TCK-711 (P02.03) : `ResolveActiveProfile` charge le profil plateforme une fois par requête, et `isSuperAdmin()` ne réinterroge plus `platform_profiles` par ligne
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Resources/LeaseResource.php:119-136`, `takussan-api/app/Models/Customer.php:146-149`, `takussan-api/app/Http/Resources/CustomerResource.php:83-96`, `takussan-api/app/Http/Controllers/Api/LeaseController.php:31`, `takussan-api/app/Http/Controllers/Api/BookingController.php:25`
- Constat :
  - mesuré : une `select * from "platform_profiles"` par ligne de `GET /api/customers` (via `Customer::criteriaBelongTo()`, `Customer.php:148`), de `GET /api/bookings` (même chemin, par le client que le contrôleur charge toujours) et deux par ligne de `GET /api/leases` (`LeaseResource.php:125`, plus le locataire par `Customer.php:148`).
  - Le docblock de `viewerIsAgencyStaff()` dit « son agence de personnel se lit une fois par requête, pas une fois par ligne » (lu, `LeaseResource.php:116-117`) : c'est vrai de l'agence, mais `isSuperAdmin()` est appelé avant le cache, à chaque ligne (lu, `:125`). Même forme dans `CustomerResource::readsCriteria()`, qui met en cache les agences et pas le profil plateforme.
  - Voir P02.03, qui porte la cause (pas de mémoïsation du profil plateforme) et la classe « à valider » (V2). Ce constat ajoute la pente mesurée sur trois listes ; la correction locale, mettre le résultat en cache dans `$request->attributes` comme l'agence, ne touche pas au contournement de `Gate::before`.
- Établi comment : test temporaire avec pile d'appel.
- Piste : lire `isSuperAdmin()` une fois par requête dans les deux ressources, à côté du cache existant ; ou traiter P02.03.
- Mesure (2026-10-15, f30bd1cb, mesureur) : relu `LeaseResource.php:118-136` (`isSuperAdmin()` l. 125, appelé avant le cache de `staffAgencyId()`), `CustomerResource.php:84-96` (cache des seules agences) et `Customer.php:146-149` (`criteriaBelongTo()` relit `isSuperAdmin()`, qui passe par `HasProfiles::activePlatformLevel()`) ; test temporaire, retiré depuis, admin d'agence, lignes dotées d'un bien avec photo, `select … from "platform_profiles"` comptées : `GET /api/leases?include=property,tenant` 7 pour 2 lignes → 27 pour 12 (2 par ligne), `GET /api/bookings?include=property,customer` 5 → 15 (1 par ligne), `GET /api/customers` 9 pour 4 fiches → 25 pour 20 (1 par ligne). Charge 2,02 sur 8 cœurs. Constat confirmé, lignes citées inchangées. Classement : A2, la réponse ne change pas ; le correctif lit `isSuperAdmin()` une fois par requête dans `$request->attributes`, à côté des caches existants de `LeaseResource::viewerIsAgencyStaff()` et `CustomerResource::readsCriteria()` (qui court-circuite alors `criteriaBelongTo()` pour le super-admin), sans toucher au modèle `User` ni à `Gate::before` (P02.03, V2), avec un test de budget « 2 lignes = 12 lignes » sur les trois listes.
- Mesure (2026-10-17, 803747565, implementeur) : test temporaire, retiré ensuite (admin d'agence, requêtes sur `platform_profiles` comptées, charge 2,2 sur 8 cœurs) : `GET /api/leases?include=property,tenant`, `GET /api/bookings?include=property,customer` et `GET /api/customers` → 1 requête pour 2 lignes comme pour 12 ; le `$user->load('platformProfile')` de `ResolveActiveProfile.php:69` (TCK-711, 2026-10-16) retiré à titre d'épreuve → 7 → 27, 5 → 15 et 7 → 17, les chiffres de la mesure du 2026-10-15 ; remis. Le défaut ne tient plus sur cet arbre.

### Le bien imbriqué par `include=property` charge sa photo ligne par ligne
- Réf : P20.04
- Statut : fait · TCK-806
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Resources/PropertyResource.php:137`, `takussan-api/app/Http/Controllers/Api/LeaseController.php:31`, `BookingController.php:25`, `ConversationController.php:37`
- Constat :
  - mesuré : une `select * from "media" where "model_id" in (<un id>)` par ligne de `GET /api/leases`, `GET /api/bookings` et `GET /api/conversations`, attribuée à `PropertyResource.php:137` (`getFirstMedia('photos')` pour `main_photo_url`). Conversations : 24 requêtes pour 2 lignes, 34 pour 12, toute la pente vient de là.
  - La liste pro des biens précharge les médias (TCK-595, gardé par `PropertyIndexQueryBudgetTest`) ; les contrôleurs qui imbriquent le bien chargent `property` sans `property.media` (lu).
  - Le front affiche `main_photo_url` dans la liste des conversations (lu, `components/messages/ConversationList.tsx`) ; dans les baux et les réservations, à vérifier.
- Établi comment : test temporaire avec pile d'appel, relecture des `with()` des trois contrôleurs.
- Piste : précharger `property.media` (filtré sur la collection `photos`) dans les trois `index()`, ou un helper commun aux contrôleurs qui imbriquent `PropertyResource` ; test de budget.
- Mesure (2026-10-15, f30bd1cb, mesureur) : relu `PropertyResource.php:137` (`getFirstMedia('photos')`), les `with()` de `LeaseController.php:31` (`property.address`, `tenant`), `BookingController.php:25` (`property.address`, `customer`, `agency`) et `ConversationController.php:37` (`property`, `participants.media`) : aucun ne charge `property.media` ; test temporaire, retiré depuis, chaque bien avec une photo, `select … from "media"` comptées : baux 2 pour 2 lignes → 12 pour 12, réservations 2 → 12, conversations 3 pour 2 → 15 pour 14 (une par ligne, l'écart constant venant de `participants.media`). Charge 2,02 sur 8 cœurs. Constat confirmé. Classement : A2, préchargement sans changement de réponse ; le correctif ajoute `property.media` aux `with()` des trois `index()` (comme TCK-595 pour la liste des biens), avec un test de budget sur chacune.
- Mesure (2026-10-17, 803747565, implementeur) : reproduit avant correctif par `NestedPropertyPhotoQueryBudgetTest` (chaque bien avec sa photo, requêtes sur `media` comptées) → baux 2 pour 2 lignes et 12 pour 12, réservations 2 → 12, conversations 3 → 13 ; correctif : `property.media` ajouté aux `with()` des trois `index()` → constant, `main_photo_url` toujours rendu ; ablation (`git apply -R` du correctif) → les trois tests rougissent.

### La liste des documents fait deux requêtes de médias par ligne, et un commentaire dit le contraire
- Réf : P20.05
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Resources/DocumentResource.php:16-18`, `takussan-api/app/Models/Document.php:84-91`, `takussan-api/app/Http/Controllers/Api/DocumentController.php:35-49`
- Constat :
  - mesuré : `GET /api/documents` avec les champs du front → 14 requêtes pour 2 documents, 34 pour 12. Par ligne : le chargement de `media` par `getFirstMedia('file')` (`DocumentResource.php:16`) et une requête `Media::query()…->where('collection_name', 'versions')` (`Document.php:86-90`, appelée par `DocumentResource.php:19`).
  - Le commentaire de `DocumentResource.php:18` dit « Active version from the `versions` collection (if the collection is loaded) ». `activeVersion()` interroge la table à chaque appel, sans regarder la relation chargée (lu).
- Établi comment : test temporaire avec pile d'appel, relecture.
- Piste : précharger `media` dans `index()`, et faire lire à `activeVersion()` la relation chargée quand elle l'est ; corriger le commentaire ; test de budget.
- Mesure (2026-10-15, f30bd1cb, mesureur) : relu `DocumentResource.php:16-19` (le commentaire « if the collection is loaded » est toujours là), `Document.php:84-91` (`activeVersion()` interroge `media` à chaque appel, son docblock dit le faire exprès « to avoid Spatie's in-memory collection cache ») et `DocumentController::index` l. 35-49 (`buildQuery` sans `with('media')`) ; test temporaire, retiré depuis, documents avec un fichier : `GET /api/documents` 14 requêtes pour 2 → 34 pour 12, dont `media` 4 → 24 (deux par ligne). Charge 2,02 sur 8 cœurs. Constat confirmé. Classement : A2 et A6, réponse inchangée ; le correctif précharge `media` dans `index()`, fait choisir la version active dans la ressource sur la relation chargée quand elle l'est, en laissant `activeVersion()` interroger la table pour les chemins d'écriture qui l'appellent, corrige le commentaire, et garde par un test de budget.

### Aucune garde générale contre la requête par ligne
- Réf : P20.06
- Statut : validé — la garde générale, après P20.02 à P20.05
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Providers/AppServiceProvider.php`, `takussan-api/tests/Feature/Property/PropertyIndexQueryBudgetTest.php`
- Constat :
  - `Model::preventLazyLoading` n'est posé nulle part, ni dans l'application ni dans les tests (mesuré : `grep -rn preventLazyLoading app tests bootstrap` → aucun résultat).
  - Quatre listes ont un test de budget ; les cinq défauts ci-dessus sont sur des listes qui n'en ont pas (lu).
  - Une interdiction du chargement paresseux en test attraperait P20.01 et P20.04, et le média de P20.05 ; elle ne verrait pas les requêtes directes (`isSuperAdmin()`, `activeVersion()`, `staffAgencyId()`) (déduit, à vérifier).
- Piste : un test paramétré « 2 lignes = 12 lignes » sur les listes pro appelées par le front (baux, clients, réservations, demandes d'intervention, documents, conversations), sur le modèle de `PropertyIndexQueryBudgetTest::test_ac15…` ; et, à mesurer d'abord, `Model::preventLazyLoading()` dans `Tests\TestCase`.
- Mesure (2026-10-16, 1efd784a, mesureur) : `grep -rn "preventLazyLoading\|shouldBeStrict" app tests bootstrap` → aucun résultat ; ajout temporaire de `Model::preventLazyLoading()` dans `Tests\TestCase::setUp()`, retiré depuis, charge 1,99 puis 2,94 sur 8 cœurs : `tests/Feature/Crm` et `tests/Feature/Property` → 135 verts, puis `CustomerTest`, `DocumentTest`, `ConversationTest`, `CustomerTagsTest`, `PerPageQueryParameterTest` et `BookingResponseDeadlineTest` → 57 verts, aucune exception de chargement paresseux, alors que P20.01, P20.04 et P20.05 sont ouvertes : Laravel ne lève que sur un modèle chargé avec d'autres, et ces tests ne créent pas la forme fautive (plusieurs lignes, avec notes ou photo). Le « déduit, à vérifier » est donc infirmé pour les tests existants : l'interdiction seule n'attrape rien sans un test à plusieurs lignes par liste. Classement : V8, chacune des cinq pistes P20.01 à P20.05, `retenu · autonome`, porte déjà son test de budget ; le test paramétré les recouvre, rougit tant qu'elles ne sont pas faites, et l'interdiction globale n'a pas de valeur mesurée.

## Angle 21 — Données personnelles d'un `User` sorties par `include=`

*Exploré le 2026-10-15 sur `pre-dev` 6e43fe24, par l'explorateur. Tout a été relu par
l'explorateur, sans sous-agent. Mesures par trois tests temporaires (`tests/Feature/Tmp/`), retirés
depuis : base de test `RefreshDatabase`, appels HTTP sous `Sanctum::actingAs`. Charge relevée avant
chaque passage : `vm.loadavg` 1,54 à 1,71 sur 8 cœurs. Le schéma de `users` a été lu en `SELECT`
sur `information_schema.columns` de la base de développement. Constat de cadrage : les trois
relations de l'intitulé ne sortent pas de `User` brut. `Booking.customer` est une fiche `Customer`
rendue par `CustomerResource`, et `Lease.landlord` et `Payout.landlord` ne sont jamais émis
(P21.05). Les ressources qui projettent un `User` champ par champ (`PayoutResource`,
`MaintenanceRequestResource`, `CommissionEntryResource`, `PropertyContactLeadResource`,
`KycDossierResource`) ont été relues. Les fuites mesurées passent par les contrôleurs qui rendent
le modèle brut. Le périmètre d'agence de `/api/users` relève de P03 (« `include=…Profiles` ») et
n'est pas repris ici.*

### `include=user` rend la ligne `users` entière (38 colonnes, dont `google_id`, `metadata` et le second numéro) sur quatre listes, à un simple agent pour deux d'entre elles
- Réf : P21.01
- Statut : fait · TCK-693
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Resources/OwnerProfileResource.php:36`, `takussan-api/app/Http/Controllers/Api/Agency/TeamController.php:61`, `takussan-api/app/Http/Controllers/Api/ServiceProviderProfileController.php:46-49`, `takussan-api/app/Http/Controllers/Api/Agency/TenantOnboardingPendingController.php:70`, `takussan-api/app/Models/User.php:77-79`, `takussan-web/src/components/payments/CreatePayoutDialog.tsx:75`, `takussan-web/src/lib/queries/service-providers.ts:115`
- Constat :
  - Ces quatre réponses sérialisent le modèle chargé tel quel : `relationsToArray()` dans `OwnerProfileResource`, `$paginator->items()` ou le paginateur brut dans les trois contrôleurs (lu). Le `User` inclus ne passe donc pas par `UserResource`. Seul `$hidden` le filtre, et `$hidden` ne retire que `password`, `remember_token`, `two_factor_secret` et `two_factor_recovery_codes` (lu, `User.php:77-79`).
  - Sans `fields[users]`, spatie fait un `select *` sur la relation (lu, `HasQueryBuilder::buildQuery` : `$queryFields` est une liste blanche des champs *demandés*, pas une projection par défaut).
  - Mesuré, un `User` portant `secondary_phone`, `google_id`, `metadata` et `last_login_at`. Clés de `data.0.user` rendues :
    - pour un admin d'agence : `GET /api/owners?include=user`, `GET /api/agencies/{a}/team?include=user` et `GET /api/agencies/{a}/service-providers?include=user` ;
    - pour un **agent** : `GET /api/owners?include=user`, `GET /api/agencies/{a}/service-providers?include=user` et `GET /api/agencies/{a}/tenant-onboarding-pending?include=user` (200 pour les trois ; l'agent a 403 sur `/team`) ;
    - dans les six cas, 38 clés : les 42 colonnes de `users` moins les quatre de `$hidden`. Entre autres : `google_id`, `facebook_id`, `apple_id`, `metadata`, `preferences`, `secondary_phone`, `secondary_phone_verified_at`, `last_login_at`, `deletion_requested_at`, `password_set_at`, `terms_accepted_at`, `notifications_*`, `digest_*`.
  - Le front fait lui-même cet appel sans `fields[users]` : `CreatePayoutDialog.tsx:69-80` (`/api/owners`, `include: ['user']`, champs de `owner_profiles` seulement) et `service-providers.ts:113-116` (carnet des prestataires) (lu).
  - Le code dit l'intention contraire. `UserResource.php` réserve le second numéro et les préférences de contact à soi (« le second numéro d'un collègue n'a rien à faire dans cette liste », TCK-633). `TeamController.php:52-54` refuse de mettre `two_factor_enabled` dans `User::$queryFields` « qui l'exposerait à toute liste d'utilisateurs » (lu).
  - Établi comment : lu, et mesuré par test temporaire.
- Piste : faire passer le `User` inclus par une projection fixe (un `UserResource` « public » : id, noms, e-mail, téléphone, avatar) dans ces quatre réponses, au lieu de `relationsToArray()` et du modèle brut ; ou, au minimum, poser une projection par défaut quand `fields[users]` est absent. Test : pour chaque route, `include=user` sans `fields[users]` ne rend ni `google_id`, ni `metadata`, ni `secondary_phone` ; ablation sur la projection.
- Mesure (2026-10-15, 4e9acdd7, mesureur) : code relu (`OwnerProfileResource.php:36` `relationsToArray()`, `TeamController.php:61` `$paginator->items()`, `ServiceProviderProfileController.php:46-49`, `TenantOnboardingPendingController.php:70` paginateur brut, `User::$hidden` l. 77-79 à quatre colonnes), puis test temporaire retiré : `User` bailleur portant `google_id`, `secondary_phone` et `metadata`, `GET /api/owners?include=user` par un agent → 200 et 38 clés dont ces trois, `GET /api/agencies/{a}/team?include=user` par un admin → 200, 38 clés, `google_id` présent. Le constat tient tel qu'écrit. Classement : V3, le correctif décide quelles données personnelles sortent d'un `User` inclus (choix de la projection « publique »).
- Mesure (2026-10-16, 92d8ec12, implementeur) : reproduit avant correctif par `IncludedUserProjectionTest` (agent sur `/api/owners`, `…/service-providers` et `…/tenant-onboarding-pending`, admin sur `…/team`, `include=user` sans `fields[users]`) → 4 rouges, 38 clés dont `google_id` et `secondary_phone*` ; `IncludedUserResource` (id, `first_name`, `last_name`, `full_name`, `email`, `phone`, `avatar_url`) branchée sur les quatre réponses → 5 verts ; ablation (les cinq fichiers de `app/` remis à l'origine) → 5 rouges, correctif remis → 5 verts.

### `/api/users` rend des modèles `User` bruts : sans `fields[users]`, toutes les colonnes non cachées sortent
- Réf : P21.02
- Statut : fait · TCK-791
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/UserAdminController.php:49-63`, `takussan-web/src/lib/queries/admin-users.ts:55`
- Constat :
  - `index()` rend `$paginator->items()` sans ressource (lu). Mesuré, pour un admin d'agence : `GET /api/users` sans paramètre → `data.0` porte les mêmes 38 clés que P21.01, `google_id`, `metadata` et `secondary_phone` compris.
  - Le front passe `fields[users]` (`admin-users.ts:55`, lu) : l'écran de l'équipe ne reçoit donc que ses colonnes. L'exposition tient au contrat de l'API, pas à l'écran (à vérifier : autres appelants de `/api/users`).
  - Établi comment : lu, et mesuré par test temporaire.
- Piste : la même projection que P21.01, appliquée par `UserAdminController::index` ; test sans `fields[users]`.
- Mesure (2026-10-15, f30bd1cb, mesureur) : relu `UserAdminController::index` l. 49-63 (`$this->paginated($paginator, $items)`, `$items` = modèles `User` bruts, seul `two_factor_enabled` y est ajouté) ; seul appelant du front, le proxy `app/api/admin-users/[[...path]]/route.ts:24`, que `admin-users.ts` appelle avec `fields[users]` (lu) ; test temporaire, retiré depuis, admin d'agence, membre portant `google_id`, `secondary_phone` et `metadata` : `GET /api/users` sans paramètre → 200, 38 clés dont ces trois. Constat confirmé. Classement : V3, le correctif décide quelles données personnelles d'un `User` sortent par défaut, le même choix que P21.01.
- Mesure (2026-10-17, fe2d19c09, implementeur) : reproduit avant correctif par `UserAdminDefaultProjectionTest` (admin d'agence, membre portant `google_id` et `metadata`) → `GET /api/users` sans `fields[users]` rend 38 clés dont `google_id` et `metadata`, avec ou sans `include=agencyAdminProfiles` (2 rouges) ; `fields[users]=…,google_id` → 400 déjà → sans `fields[users]`, les lignes passent par `IncludedUserResource` plus `two_factor_enabled` et les relations incluses ; 3 verts. Ablation (contrôleur remis) → 2 rouges ; remis → verts. Seul appelant du front, `fetchAdminUsers`, passe `fields[users]` (lu, `admin-users.ts:55`).

### `include=visitor` rend l'e-mail et le téléphone du visiteur que la ressource masque ailleurs au bailleur
- Réf : P21.03
- Statut : fait · TCK-696
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Resources/PropertyVisitResource.php:13-17,44-50`, `takussan-web/src/lib/queries/visits.ts:138,159`
- Constat :
  - La ressource masque la fiche client au bailleur qui n'est pas du personnel (TCK-590, M7′). Elle masque aussi `visitor_name`, `visitor_phone` et `visitor_email`, que la planification pour une fiche recopie (passe 4, M7″ : « sans la fiche, ils ne se lisent pas davantage par là ») (lu, l. 13-17). Le bloc `visitor` (l. 44-50) émet pourtant `email` et `phone` du compte visiteur sans condition (lu).
  - Mesuré : bien d'agence dont le bailleur actif est le créateur, et visite planifiée pour une fiche liée à un compte (`visitor_id` = `customer.user_id`, ce que pose `PropertyVisitController::planForCustomer`, l. 173-177). Le bailleur appelle `GET /api/property-visits?include=visitor,customer`, puis `GET /api/property-visits/{id}?include=visitor,customer`. Les deux rendent 200, `visitor_phone` à `null`, `customer` à `null`, et `visitor` = `{email: "visiteur@exemple.sn", phone: "+221771112233"}`.
  - Le front demande `include: ['property', 'agent', 'visitor']` sur la liste et le détail (`visits.ts:138,159`, lu).
  - Établi comment : lu, et mesuré par test temporaire.
- Piste : soumettre le bloc `visitor` au même `$visiteurLisible`, au moins pour `email` et `phone`. Test : le bailleur non-personnel ne lit ni l'e-mail ni le téléphone du visiteur par `include=visitor` ; ablation sur la condition.
- Mesure (2026-10-15, 4e9acdd7, mesureur) : `PropertyVisitResource.php:13-17` (`$visiteurLisible`) et l. 44-50 (bloc `visitor` sans condition) relus, inchangés ; test temporaire retiré : bailleur non-personnel, visite planifiée par le personnel pour une fiche liée au compte `visiteur@exemple.sn`, `GET /api/property-visits/{id}?include=visitor,customer` et la liste → 200, `visitor_phone` et `customer` à `null`, `visitor` = `{email: "visiteur@exemple.sn", phone: "+221771112233"}` dans les deux. Le constat tient. Classement : V3, la règle M7″ (TCK-590) est écrite mais le correctif change ce qui est exposé d'une personne, et le nom du visiteur (`first_name`/`last_name`) sort aussi : quelles clés masquer reste à trancher.
- Mesure (2026-10-16, a5e19e2e, implementeur) : reproduit par `ProprietaireDuBienTest::test_p21_03_…` avant correctif (visite planifiée par `POST /api/property-visits` pour une fiche liée à un compte, `visitor_id` = ce compte ; le bailleur reçoit `visitor = {first_name, last_name, email, phone}`) → bloc `visitor` soumis à `$visiteurLisible` : le bailleur reçoit `visitor: null`, au détail et à la liste, sans e-mail, téléphone ni nom dans le corps ; le personnel et le visiteur gardent le bloc. Ablation de la condition : rouge ; remise : classe entière 13 verts.

### Le garant ajouté à un bail n'apparaît jamais sur la fiche : le front lit `lease.guarantor`, que l'API n'émet pas
- Réf : P21.04
- Statut : fait · TCK-695
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Controllers/Api/LeaseController.php:64-73,161-191`, `takussan-api/app/Http/Resources/LeaseResource.php:76-79`, `takussan-api/app/Models/Lease.php:167-181`, `takussan-web/src/lib/queries/leases.ts:184,460-465`, `takussan-web/src/components/leases/LeaseDetail.tsx:306-311`, `takussan-web/src/components/leases/GuarantorSection.tsx:48,75,100-103`
- Constat :
  - Le front ajoute un garant par `POST /api/leases/{id}/guarantors`, qui l'attache par le pivot `lease_guarantor` (`guarantors()`, plusieurs à plusieurs) sans écrire `leases.guarantor_id` (lu, l. 161-191).
  - Il relit la fiche par `GET /api/leases/{id}?include=property,guarantor,payments` et passe `lease.guarantor` à `GuarantorSection` (lu).
  - `show()` ignore `include` et `fields` : il ne passe pas par `buildQuery`, il fait un `load()` fixe (lu). `LeaseResource` n'émet aucune clé `guarantor`, ni `guarantors` (lu).
  - Mesuré, pour un agent de l'agence du bail :
    - `POST …/guarantors` → 201, `guarantors_count: 1` ;
    - `GET /api/leases/{id}?include=property,guarantor,payments` → 200, **sans clé `guarantor`** ;
    - `GET /api/leases/{id}/guarantors` → 1 garant ;
    - `leases.guarantor_id` → `NULL`.
  - La section affiche donc toujours l'état vide (`t('empty')`, l. 100-103). `guarantorsCount` vaut toujours 0 : le bouton n'est jamais désactivé à 3 (l. 48), et seul le serveur tient le plafond (lu).
  - Établi comment : lu, et mesuré par test temporaire.
- Piste : lire les garants par `GET /api/leases/{id}/guarantors`, qui existe, ou les émettre dans `LeaseResource` (`guarantors`, par une projection). Trancher le sort de `Lease.guarantor` / `guarantor_id` (relation à une colonne que l'ajout n'écrit pas). Test front : après ajout, la section affiche le garant ; test API sur la clé émise.
- Mesure (2026-10-15, 4e9acdd7, mesureur) : `LeaseController::show` (l. 63-72, `load()` fixe, `include` ignoré) et `LeaseResource` (aucune clé `guarant*`) relus, `LeaseDetail.tsx:308-309` passe `lease.guarantor` et `guarantorsCount={lease.guarantor ? 1 : 0}` ; test temporaire retiré : bailleur, `POST /api/leases/{id}/guarantors` → 201, puis `GET /api/leases/{id}?include=property,guarantor,payments` → 200 sans aucune clé `guarant*`, pivot à 1 garant, `leases.guarantor_id` à `NULL`. Le constat tient. Classement : V7, la fiche ne sait montrer qu'un garant pour un pivot qui en porte jusqu'à 3, et la piste demande de trancher le sort de `Lease.guarantor`/`guarantor_id` (V4 possible).
- Mesure (2026-10-16, af610be5, implementeur) : avant correctif, `GuarantorSection.test.tsx` (deux garants rendus par `GET /api/leases/{id}/guarantors`, puis trois) → 3 rouges sur 4 : la section ne lit jamais la route, rend « Aucun garant attaché à ce bail. » et laisse le bouton actif au troisième → la section lit désormais la route (`useLeaseGuarantors`, invalidé par l'ajout), `include=guarantor` retiré de `useLease`, `guarantor_id` intact ; 4 verts, ablation (section d'origine remise) → 3 rouges, correctif remis → 4 verts. `LeaseGuarantorListTest` fige la forme lue (2 verts ; ablation de `phone` dans `listGuarantors` → 1 rouge).

### Des `include=` acceptés, chargés en base, puis jamais émis
- Réf : P21.05
- Statut : fait · TCK-807 — reste : les écarts que la garde exempte sur quatorze autres modèles (Agency, AgencyUpgradeRequest, Customer, Document, Inventory, Invitation, Invoice, KycDossier, MaintenanceRequest, OwnerProfile, PrivacyRequest, Property, ServiceProviderBill, User), à retirer ou à émettre un par un
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Models/Lease.php:91`, `takussan-api/app/Http/Resources/LeaseResource.php:76-79`, `takussan-api/app/Models/Payout.php:65`, `takussan-api/app/Http/Resources/PayoutResource.php:12-55`, `takussan-api/app/Http/Controllers/Api/PayoutController.php:66`, `takussan-api/app/Models/Booking.php:48`
- Constat :
  - `Lease::$requestLoadable` déclare `landlord`, `agent`, `guarantor`, `agency` et `onboardingChecklist`, que `LeaseResource` n'émet pas (lu : aucune de ces clés dans la ressource).
  - `Payout::$requestLoadable` déclare `lease`, `booking`, `agency`, `landlord`, `approver` et `processor`, que `PayoutResource` n'émet pas : seul `issuer` est projeté (lu). `Booking.agency` est dans le même cas (lu).
  - Une requête `include=` sur ces relations rend 200 et paie le chargement, sans rien rendre. L'appelant en conclut que la relation est vide (cas réel en P21.04).
  - `PayoutController::show` charge `landlord` (l. 66) sans l'émettre (lu).
  - Établi comment : lu. Le coût en requêtes n'est pas mesuré.
- Piste : retirer de `$requestLoadable` ce qu'aucune ressource n'émet, ou l'émettre par une projection. Une garde qui confronte `$requestLoadable` aux clés `whenLoaded()` de la ressource du modèle.
- Mesure (2026-10-15, f30bd1cb, mesureur) : relu `Lease::$requestLoadable` (l. 91 : `landlord`, `agency`, `agent`, `guarantor`, `onboardingChecklist` sans clé dans `LeaseResource`, qui n'émet que `property`, `tenant`, `renewed_from`, `renewals`, `signatures`), `Payout::$requestLoadable` (l. 65, seul `issuer` est projeté par `PayoutResource.php:26`), `Booking::$requestLoadable` (l. 48, `agency` non émis par `BookingResource`), `PayoutController::show` l. 66 (`load(['landlord', …])`, non émis) ; le front demande `include: ['property', 'guarantor', 'payments']` (`leases.ts:184`, lu). Constat confirmé par lecture ; le coût en requêtes n'a pas été mesuré. Classement : V7, retirer `guarantor` de `$requestLoadable` ferait refuser l'appel actuel du front, et émettre `landlord` ou `agency` décide d'une donnée exposée (V3) : c'est un choix, que P21.04 attend aussi.
- Mesure (2026-10-17, 6cc7d7fa2, implementeur) : avant correctif, `IncludeNonEmisRefuseTest` (owner de l'agence, un bail, un reversement, une réservation) → les 12 `include=` non émis (`landlord`, `agency`, `agent`, `guarantor`, `onboardingChecklist` sur `/api/leases`, `lease`, `booking`, `agency`, `landlord`, `approver`, `processor` sur `/api/payouts`, `agency` sur `/api/bookings`) rendent 200 ; la garde neuve `RequestLoadableEmittedTest` nomme `Booking`, `Lease`, `Payout` → retirés de `$requestLoadable`, `landlord` n'est plus chargé par `PayoutController`, 15 verts ; ablation (`app/` revenu à `pre-dev`) → 13 rouges, correctif remis → 15 verts. La garde exempte, comptés, les écarts de quatorze autres modèles.

### Petites améliorations
- Réf : P21.06
- Statut : retenu · à valider — V7 : retirer `metadata` du carnet, comme le dit la précision, efface du carnet et du choix d'assignation le nom, l'e-mail, les métiers et les disponibilités d'un prestataire en brouillon, que le front lit dans `metadata` ; c'est un comportement visible, autre que le V3 accordé (ce qui est exposé), et le garder demande de choisir les sous-clés à projeter
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Http/Controllers/Api/Agency/TenantOnboardingPendingController.php:70`, `takussan-api/app/Http/Controllers/Api/ServiceProviderProfileController.php:46-49`, `takussan-api/app/Http/Resources/LeaseResource.php:78-80`
- Constat :
  - `tenant-onboarding-pending` rend le paginateur Laravel brut. Mesuré : racines `current_page`, `data`, `first_page_url`, `links`, `next_page_url`, `path`…, sans `meta`. C'est la forme que TCK-304 a retirée, et le type du front (`PaginatedResponse`, `meta` obligatoire) ne la décrit pas. `check-pagination-envelope.mjs` ne voit pas `$this->json($page)` (lu ; le front ne lit que `data`).
  - Le carnet des prestataires rend la ligne `service_provider_profiles` brute. Mesuré : `metadata` et `insurance_policy_id` y figurent, même sans les demander.
  - Sur `GET /api/leases/{id}`, `renewed_from`, `renewals` et `renewals_count` sortent à `[]` alors que rien ne les charge. Mesuré : `whenLoaded`/`whenCounted` sous `toArray()` direct, le même piège que décrit `UserResource`. Aucun lecteur au front (lu : `grep renewals_count|renewed_from` → vide).
  - Établi comment : mesuré par test temporaire, et lu.
- Piste : `$this->paginated()` et une ressource pour les deux listes ; ôter les clés absentes de `LeaseResource`, comme il le fait déjà pour `commission_amount`.
- Mesure (2026-10-16, 1efd784a, mesureur) : relu `TenantOnboardingPendingController.php:68-70` (`$this->json($page)` sur le paginateur brut), `ServiceProviderProfileController.php:46-49` (`'data' => $paginator->items()`, sans ressource), `ServiceProviderProfile.php:29-31,58-63` (`metadata` et `insurance_policy_id` dans `$fillable` et `$queryFields` ; `metadata` porte l'email du brouillon, l. 140-150) et `LeaseResource.php:78-80` ; `tinker` en lecture, `LeaseResource::make(Lease::first())->toArray(request())` → `renewals`, `renewals_count` et `renewed_from` présents, valant chacun un `MissingValue` (rendu `{}` par `json_encode`, le constat écrit `[]`). Les trois parties tiennent. Classement : V3, la ressource du carnet décide de ce qui est exposé d'un profil de prestataire, `metadata` compris ; l'enveloppe (`$this->paginated()`, A1 par TCK-304) et les clés de `LeaseResource` (A1) seraient autonomes seules.
- Mesure (2026-10-17, 6cc7d7fa2, implementeur) : relu `ServiceProviderProfileController.php:47-52` (lignes `service_provider_profiles` brutes, `meta` déjà par `paginationMeta`) et `TenantOnboardingPendingController.php:70` (`$this->json($page)` sur le paginateur, constat tenu) ; côté front, `SERVICE_PROVIDER_PROFILE_FIELDS` demande `metadata` (`service-providers.ts:29`), lu par `ServiceProvidersList.tsx:132,151,244,274` (métiers, zones, nom et e-mail du brouillon, relance de l'invitation par e-mail) et `MaintenanceAssignmentBlock.tsx:163-171` (nom, e-mail, `metadata.availability` du contrôle « travaille ce jour-là ») ; `metadata` porte l'e-mail et le nom du brouillon (`ServiceProviderProfile.php:139-150`). Classement : V7, voir le statut ; l'enveloppe de `tenant-onboarding-pending` (A1, TCK-304) et les clés absentes de `LeaseResource` (A1) restent autonomes seules.

## Angle 22 — FormRequests sans autorisation propre, et règles d'autorisation dans les services

*Exploré le 2026-10-15 sur `pre-dev` 0b57251a, par l'explorateur. Tout a été relu par l'explorateur lui-même, sans sous-agent. Le balayage des FormRequests et des méthodes de contrôleur qui les reçoivent est un script jetable (Node, hors du dépôt) : il apparie par nom court de classe, et `UpdateIntegrationRequest` existe deux fois (`Api/` et `Api/Admin/`), donc un faux « aucune » au moins ; ses comptes sont un relevé, pas un inventaire. Les codes de réponse viennent de deux tests temporaires (`tests/Feature/TmpExplo/`, retirés), charge `2.31 1.95 1.76` puis `2.68 2.17 1.87` sur 8 cœurs, base de test propre au processus. P03.05 couvre déjà l'inversion 422/403 sur dix endpoints ; cet angle en mesure l'étendue réelle et ce qui échappe à la garde qu'il propose.*

Ce qui tient (lu ou mesuré) :
- les neuf FormRequests de `Api/Admin/` rendent `true`, mais `php artisan route:list --path=api/admin -vv` montre `EnsureSuperAdmin` sur chacune des routes `api/admin/*` : le refus précède la validation ;
- les capacités jugées sans contexte dans `LeasePolicy` (`can('leases.terminate')`, `can('leases.rent_review')`…) le sont sur l'agence du profil actif (`AppServiceProvider.php:782-800`), et `isStaffOf()` exige déjà que cette agence soit celle du bail (`BasePolicy.php:108-117`, `MembershipCapabilityResolver.php:450-458`) : pas d'écart entre agences ;
- `StoreAgentAbsenceRequest`, `StoreAgentHandoverRequest`, `RejectQuoteRequest`, `SubmitQuoteRequest` étendent `FormRequest` mais délèguent à une policy dans `authorize()`.

### Le refus par défaut de `BaseFormRequest` est levé par 106 de ses 232 sous-classes, et une garde sur `extends FormRequest` n'en verrait aucune
- Réf : P22.01
- Statut : fait · TCK-816 — reste : les autres FormRequests permissives (44 méthodes qui autorisent dans leur corps, 26 qui n'autorisent rien) et la garde « authorize() qui rend true sec »
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Requests/BaseFormRequest.php:9-12`, `takussan-api/app/Http/Requests/ReviewRentRequest.php:16`, `takussan-api/app/Http/Requests/RenewLeaseRequest.php:19`, `takussan-api/app/Http/Requests/RefundDepositRequest.php:15`, `takussan-api/app/Http/Requests/RequestEarlyTerminationRequest.php:15`, `takussan-api/app/Http/Requests/AgencyUpdateRequest.php:21`, `takussan-api/app/Http/Controllers/Api/LeaseRentController.php:27-30`
- Constat :
  - 232 classes étendent `BaseFormRequest` ; 106 surchargent `authorize()` par `return true;`, `return $this->user() !== null;` ou équivalent. 41 autres étendent `FormRequest` directement, dont les 28 de P03.05 (mesuré : `grep -rlE 'extends (Base)?FormRequest'` puis lecture du corps d'`authorize()` par script).
  - Hors `Admin/`, `Auth/` et `Public/`, ces FormRequests permissives sont reçues par 44 méthodes de contrôleur qui autorisent **dans leur corps**, donc après la validation (`$this->authorize(`, `->can(`, `abort_unless(…403)`), et par 26 méthodes qui n'autorisent rien elles-mêmes (relevé par script, à confirmer une à une).
  - Mesuré, compte sans aucun lien avec l'agence ni le bail (`User::factory()`), corps invalide : `PATCH /api/leases/{id}/rent` → 422 (`new_rent`, `reason`, `effective_date`) ; `POST …/renew` → 422 (`start_date`, `end_date`) ; `POST …/deposit-refund` → 422 (`amount`, `reason`) ; `POST …/early-termination` → 422 (`effective_date`, `reason`) ; `PUT /api/agencies/{id}` → 422 (`email`). Corps vide : `renew` et `agencies` rendent 403, `rent`, `deposit-refund` et `early-termination` rendent encore 422 (champs requis).
  - Aucune de ces cinq routes n'est dans P03.05 ni dans `AuthorizationPrecedesValidationTest`, qui vise `/terminate` mais pas ses quatre voisines sur le même bail (lu : `tests/Feature/Validation/AuthorizationPrecedesValidationTest.php:108-115`).
  - La garde proposée par P03.05 (« refuser `extends FormRequest` hors de `BaseFormRequest` ») laisserait passer ces 106 classes : elles étendent déjà la bonne base (déduit de la forme de la garde proposée).
  - Établi comment : script de balayage, lecture des cinq FormRequests et contrôleurs, test temporaire.
- Piste : voir P03.05. Déléguer à la policy dans `authorize()` pour les 44 méthodes qui autorisent déjà dans leur corps (le geste de TCK-305). La garde serait plutôt : « une sous-classe dont `authorize()` rend `true` sec doit être reçue par une route sous un middleware d'autorisation, ou figurer dans une liste d'exemptions justifiées », et `AuthorizationPrecedesValidationTest` prendrait un cas par route de bail.
- Mesure (2026-10-15, f30bd1cb, mesureur) : relu `BaseFormRequest.php:9-12` (`return false;`), `authorize()` de `ReviewRentRequest`, `RenewLeaseRequest`, `RefundDepositRequest`, `RequestEarlyTerminationRequest` et `AgencyUpdateRequest` (`return true;`) ; `grep -rlE 'extends BaseFormRequest' app/Http/Requests | wc -l` → 232, et un relevé par `awk` des seules formes `return true;` / `return $this->user() !== null;` → 101 (l'explorateur en comptait 106 avec les équivalents) ; test temporaire, retiré depuis, compte `User::factory()` sans lien, corps invalide : `PATCH …/rent` → 422 (`new_rent`, `reason`), `POST …/renew` → 422, `POST …/deposit-refund` → 422, `POST …/early-termination` → 422, `PUT /api/agencies/{id}` → 422 (`email`). Constat confirmé. Classement : V2 et V8, faire passer l'autorisation avant la validation sur des dizaines de routes touche l'autorisation de chaque appelant et demande plus d'un ticket.
- Mesure (2026-10-17, ae4b0c3c0, implementeur) : test `AuthorizationPrecedesValidationTest`, un cas par route, compte agent d'une autre agence et corps invalide : `PATCH …/rent`, `POST …/renew`, `POST …/deposit-refund`, `POST …/early-termination` et `PUT /api/agencies/{id}` rendaient 422 (`new_rent`, `start_date`, `amount`, `effective_date`, `email`) → `authorize()` des cinq FormRequests délègue à l'ability du contrôleur ; 403 sans `errors` pour l'intrus, 422 pour le super-admin ; ablation (`return true;` remis) → 5 rouges, correctif remis → 30 verts.

### Les trois routes de traitement en lot sont ouvertes à tout compte connecté et disent quels identifiants de biens et de comptes existent
- Réf : P22.02
- Statut : fait · TCK-817
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/PropertyController.php:407-458`, `takussan-api/app/Policies/PropertyPolicy.php:223-231`, `takussan-api/app/Http/Requests/PropertyBulkAssignRequest.php`, `takussan-api/app/Http/Requests/PropertyBulkArchiveRequest.php`, `takussan-api/app/Services/Property/PropertyBulkAssignService.php:40-47`, `takussan-api/app/Services/Property/PropertyBulkArchiveService.php:47-63`
- Constat :
  - `bulkVisibility` et `bulkAssign` n'autorisent rien au niveau de la route ; `bulkArchive` appelle `can('bulkArchive', Property::class)`, que `PropertyPolicy::bulkArchive(User $user)` accorde par `return $user !== null;`, toujours vrai pour un `User` typé (lu).
  - Le refus se juge bien par bien dans le service, et le bilan sépare `forbidden` (le bien existe) de `not_found` (il n'existe pas).
  - Mesuré, compte sans agence (`User::factory()`), bien d'une agence tierce et identifiant absent `987654321` :
    - `POST /api/properties/bulk-assign` → 200, `failed: [{id: <bien>, reason: forbidden}, {id: 987654321, reason: not_found}]` ;
    - avec `user_id` absent → 422 « The selected user id is invalid » (`exists:users,id`), donc un oracle d'existence des comptes ;
    - `POST /api/properties/bulk-visibility` → 200, même bilan `forbidden` / `not_found` ;
    - `POST /api/properties/bulk-archive` avec l'identifiant absent → 422 sur `property_ids.0` (`exists:properties,id`), avec le bien tiers → 200 `forbidden`.
  - Un compte auto-inscrit énumère donc les identifiants de biens, brouillons et archivés compris, et ceux des comptes, par lots de 100 à 200. P03.06 relève la même famille d'oracles sur d'autres routes ; celles-ci n'y sont pas.
  - Établi comment : lu, et test temporaire.
- Piste : refuser en tête de route ce qu'aucun profil de personnel ne peut faire (une capacité `properties.update` à l'agence active, dans `authorize()`), confondre `not_found` et `forbidden` dans le bilan d'un appelant qui n'est pas du personnel, et juger `user_id` dans le service plutôt que par `exists:`. Un test par route avec un compte sans agence.
- Mesure (2026-10-15, f30bd1cb, mesureur) : relu `PropertyBulkAssignRequest` et `PropertyBulkArchiveRequest` (`return $this->user() !== null;`), `PropertyPolicy::bulkArchive()` l. 229-232 (`return $user !== null;`) ; test temporaire, retiré depuis, compte `User::factory()` sans agence, bien d'agence tiers et identifiant absent `987654321` : `bulk-assign` → 200, `failed` = `forbidden` pour le bien, `not_found` pour l'absent ; `user_id` absent → 422 « The selected user id is invalid » ; `bulk-visibility` → 200, même bilan ; `bulk-archive` → 200 `forbidden` pour le bien, 422 sur `property_ids.0` pour l'absent. Constat confirmé tel qu'écrit. Classement : V2, le correctif change qui peut appeler ces routes et ce que le bilan dit à l'appelant.
- Mesure (2026-10-17, ae4b0c3c0, implementeur) : `PropertyBulkRoutesGateTest`, avant correctif : compte `User::factory()` sans agence → 200 sur `bulk-visibility` et `bulk-assign`, 422 sur `bulk-archive` (`property_ids.0`) ; agent d'une agence → `forbidden` pour un bien tiers, `not_found` pour un absent ; `user_id` absent → `errors.user_id` → `authorize()` invoque `PropertyPolicy::bulkUpdate()` / `bulkPublish()` (capacité à l'agence active), `exists:` retirés, bien illisible rendu `not_found`, cible cherchée parmi les membres de l'agence active (422 `user.not_in_active_agency` identique pour un absent et un compte d'une autre agence) ; ablation : tout le correctif retiré → 7 rouges, les seuls services → 2 rouges ; remis → 7 verts, et les 71 tests des trois routes verts après réécriture de ceux qui actaient l'ancien comportement.

### Des règles d'autorisation vivent dans les services, recopiées de la policy, hors de portée de `check-controller-authorization.mjs`
- Réf : P22.03
- Statut : fait · TCK-819 — reste : la règle de facture jugée deux fois (StoreInvoiceRequest et InvoiceService), les autres règles des services, et la garde étendue à app/Services
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Invitation/AgentInvitationService.php:222-242`, `takussan-api/app/Policies/AgentProfilePolicy.php:71-95`, `takussan-api/app/Services/Invitation/OwnerInvitationService.php:153-169`, `takussan-api/app/Services/Invitation/ServiceProviderInvitationService.php:213-228`, `takussan-api/app/Services/Model/InvoiceService.php:34-42`, `takussan-api/app/Http/Requests/Api/StoreInvoiceRequest.php`, `takussan-api/app/Services/Model/LeaseService.php:36-54`, `takussan-api/app/Services/Model/BookingService.php:60-102`, `scripts/check-controller-authorization.mjs:1-60`
- Constat :
  - Un grep des formes `->can(`, `canActAt(`, `abort…403`, `HttpException(403` et `AuthorizationException` sous `app/Services` rend 48 lignes dans 35 fichiers, commentaires exclus (mesuré ; les `abort` écrits sur plusieurs lignes n’y sont pas). La garde TCK-306 ne balaie que `app/Http/Controllers/` (lu, en-tête du script) : une règle déplacée d'un contrôleur vers un service lui échappe.
  - `AgentInvitationService::assertInviterCanManageTeam()` recopie la règle d'`AgentProfilePolicy::canManageTeamIn()` (`isAgencyAdminAt() || canActAt(TeamInvite)`), commentaire TCK-395 compris, mot pour mot ; le contrôleur appelle la policy avant le service (`AgentInvitationController.php:30-34`), la règle est donc jugée deux fois, par deux copies (lu). Les services d'invitation de bailleur et de prestataire portent la même forme (lu, non comparés ligne à ligne).
  - La création de facture est jugée par deux règles différentes : la capacité `InvoicesCreate` à l'agence active dans `StoreInvoiceRequest::authorize()`, puis « personnel de l'agence du client, ou client sans agence ajouté par soi » dans `InvoiceService::create()` (lu). Les deux s'additionnent aujourd'hui ; rien ne dit laquelle fait foi si l'une bouge.
  - Établi comment : lu, et grep.
- Piste : ramener chaque règle de service dans la policy de l'action et faire appeler la policy par le service quand il est aussi appelé hors HTTP ; étendre la garde à `app/Services/` avec une liste d'exemptions justifiées (règles métier qui ne sont pas des autorisations : verrou de suspension, seuil d'approbation des reversements).
- Mesure (2026-10-15, f30bd1cb, mesureur) : relu `AgentInvitationService::assertInviterCanManageTeam()` l. 222-243 et `AgentProfilePolicy::canManageTeamIn()` l. 71-92 : la copie n'est plus mot pour mot, la policy refuse d'abord par `AgencyKindGuard::canFormTeam()`, que le service ne regarde pas (les deux copies ont déjà divergé) ; `InvoiceService::create()` l. 34-42 juge « personnel de l'agence du client, ou client sans agence ajouté par soi » quand `StoreInvoiceRequest::authorize()` l. 28-31 passe par `can('create', Invoice::class)`, soit `Capability::InvoicesCreate` (`InvoicePolicy.php:26-29`) ; `scripts/check-controller-authorization.mjs:59` ne balaie que `app/Http/Controllers`. Constat confirmé, précisé sur la copie. Classement : V2 et V8, réunir chaque règle dans sa policy change l'autorisation d'appelants légitimes sur plusieurs domaines ; seule l'extension de la garde serait A5.
- Mesure (2026-10-17, 11118c160, implementeur) : avant correctif, `InvitationServicesFollowPolicyTest` fixe la décision de la policy par `Gate::before` : refusée, un admin d'agence passait quand même les trois invitations, la suspension et le retrait d'un agent ; accordée, un compte sans profil recevait 403 des trois services (6 rouges) → les trois services appellent la policy par `Gate::forUser()->denies()` (`invite`, `suspend`, `delete`), même 403 et même message ; `assertAgencyCanInvite()` reste en tête ; 7 verts, ablation (services d'origine) → 6 rouges, correctif remis → 7 verts ; 166 verts sur les invitations, l'équipe, la suspension et les rôles.

### Petites améliorations
- Réf : P22.04
- Statut : fait · TCK-818 — reste : renommer `Api/Admin/UpdateIntegrationRequest` en `AdminUpdateIntegrationRequest`, que la piste propose et que la décision ne reprend pas
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Policies/PropertyPolicy.php:223-231`, `takussan-api/app/Http/Requests/Accounting/MatchBankStatementLineRequest.php`, `takussan-api/app/Http/Requests/Accounting/StoreBankStatementRequest.php`, `takussan-api/app/Http/Requests/Accounting/UpdateBankCsvMappingRequest.php`, `takussan-api/app/Http/Requests/Permissions/StoreRoleDelegationRequest.php`, `takussan-api/app/Http/Requests/Api/UpdateIntegrationRequest.php`, `takussan-api/app/Http/Requests/Api/Admin/UpdateIntegrationRequest.php`
- Constat :
  - `PropertyPolicy::bulkArchive()` est une tautologie (`$user !== null` sur un `User` non nullable) dont le docblock dit qu'elle délègue au service : une ability qui ne refuse jamais rien (lu).
  - Quatre FormRequests portent `return true; // Policy handles authorization` : le commentaire décrit l'inversion au lieu de la fermer. Mesuré pour l'une : `PUT /api/agencies/{id}/bank-statements/csv-mapping`, compte sans lien, corps vide → 422 et sept champs nommés ; corps valide → 403.
  - Deux classes s'appellent `UpdateIntegrationRequest` (`Api/` et `Api/Admin/`), l'une permissive derrière `EnsureSuperAdmin`, l'autre qui délègue (`mayManage`) : tout inventaire par nom court les confond, comme le balayage de cet angle l'a fait (mesuré : `find app/Http/Requests -name '*.php' -exec basename {} \; | sort | uniq -d`).
  - `POST /api/properties/{id}/duplicate`, compte sans lien : `title_suffix` de 60 caractères → 422, corps vide → 403 (mesuré) ; la policy `duplicate` existe déjà et n'est pas appelée dans `authorize()`.
  - Établi comment : lu, et test temporaire.
- Piste : retirer `bulkArchive` de la policy au profit d'une capacité réelle (voir P22.02) ; déléguer dans `authorize()` pour les quatre FormRequests commentées et pour `PropertyDuplicateRequest` ; renommer la classe d'`Api/Admin/` (`AdminUpdateIntegrationRequest`).
- Mesure (2026-10-16, 1efd784a, mesureur) : relu `PropertyPolicy.php:223-231` (`bulkArchive` rend `$user !== null`), l'`authorize()` des quatre FormRequests : `MatchBankStatementLineRequest.php:12` et `UpdateBankCsvMappingRequest.php:31` (« Policy handles authorization »), `StoreBankStatementRequest.php:15` (« Policy handles fine-grained authorization ») et `StoreRoleDelegationRequest.php:14` (« Fine-grained authorization handled by policy in controller »), toutes `return true` ; `PropertyDuplicateRequest.php:19` (`$this->user() !== null`) ; `Api/UpdateIntegrationRequest.php:34` (`mayManage`) et `Api/Admin/UpdateIntegrationRequest.php:24` (`true`), deux classes de même nom court. Les commentaires diffèrent un peu de la citation, le défaut tient ; l'inversion 422/403 se lit au code et n'a pas été rejouée. Classement : V2, chaque correctif change la réponse d'une route autorisée, et le retrait de `bulkArchive` attend la capacité de P22.02, validée mais non faite.
- Mesure (2026-10-17, ae4b0c3c0, implementeur) : `AuthorizationPrecedesValidationTest`, un cas par route, compte agent d'une autre agence et corps invalide : `POST …/duplicate`, `POST /api/agencies/{id}/bank-statements`, `PUT …/bank-statements/csv-mapping`, `POST /api/bank-statement-lines/{id}/match` et `POST /api/agencies/{id}/role-delegations` rendaient 422 → les cinq `authorize()` invoquent la policy du contrôleur ; 403 sans `errors` pour l'intrus, 422 pour le super-admin ; ablation → 5 rouges, remis → 40 verts ; 141 tests existants des cinq routes verts. `bulkArchive` est sorti de `PropertyPolicy` par TCK-817 (P22.02), remplacé par `bulkUpdate`.

## Angle 23 — Lectures de données personnelles sans step-up, face à `REFUSED_READS`

*Exploré le 2026-10-15 sur `pre-dev` 69360e19, par l'explorateur. Tout a été relu par
l'explorateur, sans sous-agent. Mesures par un test temporaire (`tests/Feature/TmpExplo/`), retiré
depuis : base de test `RefreshDatabase`, session d'impersonation ouverte par le trait
`SessionsDImpersonation`, comme le BFF. Charge relevée avant le passage : `vm.loadavg` 1,65 sur
8 cœurs. Inventaire des `GET` par `php artisan route:list --method=GET --json` (294 routes),
filtré sur documents, médias, KYC, versements, jetons, liens et exports. Comptes de la base de
développement lus par `tinker` en `SELECT` : aucune fiche client ni caution n'y porte de
`id_number`, aucun `Document` de profil n'y existe. Les ordres de grandeur réels ne sont donc pas
mesurés. Relu et trouvé conforme : flux iCal importés (hôte seul), moyens de versement côté agence
(masqués), export CSV des clients (sans `id_number`), demandes de passage en agence (masquées),
pièces des dossiers KYC d'agence (refusées sous impersonation, journalisées). La lecture en clair
des comptes de versement sous impersonation est déjà en P03 (« Sous impersonation, l'opérateur lit
en clair les comptes de reversement de la cible ») et n'est pas reprise.*

### Sous impersonation, l'opérateur ouvre la pièce d'identité du bailleur, de l'agent ou du prestataire par `/api/documents`, alors que `api/kyc/documents/*` est refusé
- Réf : P23.01
- Statut : fait · TCK-697
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Middleware/EnforceImpersonationReadOnly.php:44-58`, `takussan-api/app/Http/Controllers/Api/DocumentController.php:35-49`, `takussan-api/app/Http/Resources/DocumentResource.php:38`, `takussan-api/app/Http/Controllers/Api/Me/OwnerProfileController.php:59-78`, `takussan-api/app/Http/Controllers/Api/Me/AgentProfileController.php:68-87`, `takussan-api/app/Http/Controllers/Api/Me/ServiceProviderProfileController.php:59-80`, `takussan-api/app/Http/Controllers/Api/KycDocumentController.php:18-23`
- Constat :
  - ADR-0055 §3 : « toute route `GET` qui rend […] une pièce d'identité entre dans `REFUSED_READS` ». La constante n'y range que `api/kyc/documents/*` (lu, `EnforceImpersonationReadOnly.php:57`). Cette route ne sert que les médias d'un `KycDossier` d'agence (lu, `KycDocumentController.php:18`).
  - Les pièces des assistants d'accueil (`kind=cni|rib|ninea`) sont des `Document` rattachés à `OwnerProfile`, `AgentProfile` ou `ServiceProviderProfile`, avec `uploaded_by` = le titulaire (lu, les trois contrôleurs `Me/`). `GET /api/documents` liste les documents dont on est le téléverseur (lu, `DocumentController.php:41-42`), et `DocumentResource` émet une `file_url` signée de 30 minutes (lu, `:38`).
  - mesuré, test temporaire : pour chacun des trois profils, téléversement d'une `cni` par la cible, puis session d'impersonation. `GET /api/documents` sous le jeton d'impersonation → 200, un document `type=id_card`. `GET /api/documents/{id}` → 200. `GET <file_url>` sans jeton → 302 vers le fichier. Les trois profils rendent la même chose.
  - mesuré, même test : zéro ligne `PersonalDataAccess` dans `activity_log` après ces lectures. La voie de la pièce d'agence, elle, journalise chaque consultation (lu, `KycDocumentController.php:23`).
  - La justification de l'ADR pour la pièce d'agence (« tout opérateur la lit déjà par `/api/admin/kyc`, sous son nom ») ne vaut pas ici : aucune voie de la console ne sert ces pièces, et leur lecture n'est pas journalisée (voir P23.04).
  - Établi comment : lu, et test temporaire.
- Piste : refuser sous impersonation les `Document` de type pièce (`id_card`, `rib`, `ninea`) rattachés à un profil, au niveau de `DocumentPolicy::view` ou de la ressource (masquer `file_url` quand `ImpersonationContext` est lié). Un préfixe de route ne suffit pas : `api/documents*` sert aussi les baux. Garde : un test qui rejoue le scénario mesuré pour les trois profils.
- Mesure (2026-10-15, d62e3290, mesureur) : relu `EnforceImpersonationReadOnly::REFUSED_READS` (seule `api/kyc/documents/*` pour les pièces), `DocumentController::index()` (`where('uploaded_by', …)` hors super-admin), `DocumentPolicy::view()` (le téléverseur voit), `DocumentResource.php:38` (`file_url` signée) ; aucun commit sur ces fichiers depuis `f7af6b12` ; test temporaire, retiré depuis, sur le seul profil propriétaire : une `id_card` rattachée à l'`OwnerProfile`, téléversée par la cible, puis session d'impersonation (`SessionsDImpersonation`) → `GET /api/documents` 200 avec un document `id_card`, `GET /api/documents/{id}` 200, `GET <file_url>` 302, 0 ligne `PersonalDataAccess` dans `activity_log`. Charge 2,20 sur 8 cœurs. Les profils agent et prestataire ne sont pas rejoués, leurs contrôleurs `Me/` écrivant la même forme (lu). Classement : V2, le correctif refuse une lecture sous impersonation, au niveau de la policy ou de la ressource, que la piste laisse à choisir, et touche l'exposition d'une pièce d'identité (V3).
- Mesure (2026-10-16, e14deb0d, implementeur) : `ImpersonationProfilePiecesTest`, une `cni` téléversée par la voie d'accueil de chacun des trois profils puis session d'impersonation → avant correctif, `GET /api/documents` liste la pièce pour les trois (3 rouges). Correctif : `DocumentPolicy::view()` refuse une pièce (`id_card`, `rib`, `ninea`) rattachée à un profil quand `ImpersonationContext` est actif, et `DocumentController::index()` l'écarte → 4 verts, dont la cible qui lit sa pièce sous son jeton et la licence d'agent lisible sous impersonation. Ablation : sans la clause de `view()`, 3 rouges (403 attendu, 200 rendu) ; sans le filtre d'`index()`, 3 rouges. Charge 1,66 sur 8 cœurs.

### Le bailleur lit la pièce d'identité et le contact d'urgence de son locataire par le bail et la réservation, alors que la fiche client lui est refusée
- Réf : P23.02
- Statut : fait · TCK-808
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Resources/CustomerResource.php:19-27`, `takussan-api/app/Http/Resources/LeaseResource.php:77`, `takussan-api/app/Http/Controllers/Api/LeaseController.php:69`, `takussan-api/app/Http/Resources/BookingResource.php:44`, `takussan-api/app/Http/Controllers/Api/BookingController.php:63`, `takussan-api/app/Policies/CustomerPolicy.php:8-14`
- Constat :
  - mesuré, test temporaire : bailleur d'un bien d'agence, locataire `id_number = SN-998877`. `GET /api/customers/{id}` → 403. `GET /api/leases/{id}` → 200 avec `tenant.id_number` et `tenant.emergency_contact_phone`. `GET /api/bookings/{id}` → 200 avec `customer.id_number`. `GET /api/leases?include=tenant` → 200 avec `tenant.id_number`.
  - `CustomerPolicy` dit pourquoi le bailleur a perdu la fiche : il lisait « tout le CRM, téléphones et pièces d'identité compris » (lu, docblock l. 8-14, TCK-587). `show` des deux contrôleurs charge la fiche sans `include=` (lu).
  - verif-591 m2 a déjà fermé cette voie pour les seuls critères de recherche (`budget_*`, `seeking_*`), « y compris par `include=tenant` / `include=customer` » (lu, `TCK-591` AC38 ; `CustomerResource.php:83-96`). La pièce, le contact d'urgence, `notes` et `metadata` restent rendus au bailleur (lu, `CustomerResource.php:19-27`).
  - Ce que le bailleur doit voir de son locataire (nom, téléphone, pièce pour le contrat ?) n'est écrit nulle part : à vérifier dans `docs/features.md`. Le rendu PDF du contrat ne cite pas `id_number` (grep sur `resources/views` → aucune occurrence).
  - Voir P21.05, qui relève `Booking.customer` rendu par `CustomerResource` sans relever les champs sensibles.
  - Établi comment : lu, et test temporaire.
- Piste : réserver `id_type`, `id_number`, `emergency_contact_*`, `notes` et `metadata` au lecteur que `CustomerPolicy::view` admet, par la même forme que `readsCriteria()`. Étendre `CustomerScopeTest::test_search_criteria_are_rendered_to_agency_staff_only` à ces champs.
- Mesure (2026-10-15, eee06c10, mesureur) : relu `CustomerResource.php:19-30` (`id_type`, `id_number`, `emergency_contact_*`, `metadata`, `notes` hors de `readsCriteria()`), `LeaseController.php:69` et `BookingController.php:63` (chargent `tenant` et `customer` sans `include=`), `CustomerPolicy::view` ; aucun commit sur ces fichiers depuis le 2026-10-14 ; test temporaire, retiré depuis (charge 5,75 sur 8 cœurs) : bailleur membre `owner` d'une agence, locataire ajouté par un agent avec `id_number = SN-998877` → `GET /api/customers/{id}` 403, `GET /api/leases/{id}` 200 avec `tenant.id_number` et `tenant.emergency_contact_phone`, `GET /api/leases?include=tenant` 200 avec `tenant.id_number`. La voie de la réservation n'est pas rejouée, `BookingResource.php:44` rendant le même `CustomerResource` (lu). Classement : V3, le correctif décide ce qui est exposé de la pièce d'identité d'un locataire à son bailleur, et ce que le bailleur doit voir n'est écrit nulle part.
- Mesure (2026-10-17, 6cc7d7fa2, implementeur) : avant correctif, `CustomerScopeTest::test_identity_contact_notes_and_metadata_are_rendered_to_the_customer_reader_only` (bailleur `owner` de l'agence, locataire ajouté par un agent, `id_number = SN-998877`) → `GET /api/customers/{id}` 403, puis `GET /api/leases/{id}` rend `tenant.id_type` : rouge → `CustomerResource` étale les six champs sous `CustomerPolicy::view`, mémorisée par requête et par couple (agence, auteur) ; le bailleur ne les lit plus par le bail, la liste `include=tenant` ni la réservation, l'agent auteur les lit par la fiche et le bail ; 7 verts, ablation (ressource d'origine) → 1 rouge, correctif remis → 7 verts ; 146 verts sur six classes voisines (baux, réservations, clients, isolation du bailleur) ; `impacted-tests` a rougi 2 tests (fiche lue sans `agency_id` ni `added_by_id` par `fields[customers]`, et `notes` non atteinte par `DateInventoryByValueTest`) → les deux colonnes relues pour la fiche quand un champ réservé a été lu, et un sujet dont l'appelant est l'auteur ; la liste du CRM du front ne relit aucune fiche (test neuf de budget, ablation → 1 rouge).

### La pièce d'identité du locataire et de la caution est en clair partout, quand celle du bailleur est chiffrée, masquée, sous step-up et journalisée
- Réf : P23.03
- Statut : retenu · à valider — V8 : le correctif dépasse M et demande plus d'un ticket (quatre colonnes chiffrées par migration réversible, deux lectures dédiées sous step-up et journalisées, le contrat du front), critère distinct de V3, V4 et V6 accordés
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/database/migrations/2026_04_17_160006_create_customers_table.php:20-21`, `takussan-api/database/migrations/2026_04_17_160007_create_guarantors_table.php:18-21`, `takussan-api/app/Models/Customer.php:106`, `takussan-api/app/Http/Resources/CustomerResource.php:20`, `takussan-api/app/Http/Controllers/Api/GuarantorController.php:84-101`, `takussan-api/app/Models/Profiles/OwnerProfile.php:47-53`, `takussan-api/app/Support/Security/ProtectedActions.php:263-266`
- Constat :
  - `owner_profiles.id_document_number`, `rib` et `tax_id` : cast `encrypted`, `$hidden`, forme masquée dans les listes, valeur claire par `GET /api/owners/{id}/sensitive` seulement, sous step-up et journalisée (lu, `OwnerProfile.php:47-53`, `ProtectedActions.php:263-266`, `OwnerProfileController.php:81-95`). ADR-0044 §1 pose la règle (« une donnée personnelle sensible est chiffrée […] ne sort jamais en clair […] dans une réponse par défaut ») et ne retient que ces colonnes et celles des demandes de passage en agence.
  - `customers.id_number` et `guarantors.id_number` sont des `varchar` en clair (lu, migrations). `guarantors.monthly_income` aussi.
  - Rendus en clair à tout lecteur de la fiche : `CustomerResource` (l. 20), `GuarantorController::format` (l. 92-96, avec le revenu). `id_number` est demandable par `fields[customers]` (lu, `Customer.php:106`).
  - mesuré, test temporaire : sous impersonation d'un admin d'agence, `GET /api/customers/{id}` et `GET /api/customers?fields[customers]=id,id_number` → 200 avec `id_number` en clair. Aucun step-up, aucune ligne `PersonalDataAccess`.
  - Le dépôt traite déjà `id_number` comme sensible ailleurs : exclu du journal d'activité (lu, `Customer.php:35-50`), de l'index Meilisearch (lu, `Customer.php:205-219`) et de l'export CSV (lu, `ExportDataService.php:103-127`).
  - Établi comment : lu, et test temporaire.
- Piste : étendre ADR-0044 §1 aux deux colonnes : chiffrement par migration réversible, forme masquée par défaut, valeur claire par une lecture dédiée sous step-up et journalisée, comme `owners/{id}/sensitive`. C'est un choix de produit et de schéma, à poser par ADR. À défaut, au moins la masquer dans les listes et sous impersonation.
- Mesure (2026-10-15, eee06c10, mesureur) : relu les migrations `2026_04_17_160006` (l. 21) et `2026_04_17_160007` (l. 18, 21) : `id_number` et `monthly_income` en `string` et `decimal` clairs ; `grep -n encrypted` sur `Customer.php` et `Guarantor.php` → rien ; `CustomerResource.php:20` et `GuarantorController.php:93,96` les rendent en clair ; aucun ticket ne traite leur chiffrement (`grep` dans `docs/backlog/tickets`). Le scénario sous impersonation n'est pas rejoué : la lecture du code est inchangée, et le test de P23.02 rend `id_number` en clair à un autre lecteur. Classement : V4, la piste chiffre deux colonnes par migration, avec un ADR (V6) sur ce qui est exposé (V3).
- Mesure (2026-10-16, 55a41109, humain) : ADR-0044 amendé en session (TCK-723) : `customers.id_number` et `guarantors.id_number` suivent le § 1 (cast `encrypted`, masqués par défaut, lecture claire dédiée sous step-up et journalisée) ; le porteur a tranché ses deux questions (points 6 et 7 : revenu mensuel de la caution et du bailleur compris, valeur claire pour l'admin d'agence seul). L'application reste à faire.
- Mesure (2026-10-17, 11118c160, implementeur) : relu l'amendement A d'ADR-0044 (§ 1 à 7 et « Application ») : `customers.id_number` et `guarantors.id_number` passent en `text` chiffré, `guarantors.monthly_income` et `owner_profiles.monthly_income` (`decimal(14,2)`, migrations `2026_04_17_160007:21` et `2026_05_02_000001:20`) aussi, chacune par une migration qui chiffre l'existant et dont le `down()` déchiffre, aller-retour testé ; deux routes `…/{id}/sensitive` neuves (client, caution), avec `viewSensitive`, `ProtectedActions::STEP_UP` et `PersonalDataAccessLogger` ; `id_number` hors de `Customer::$queryFields`, masques dans `CustomerResource` et `GuarantorController::format` ; le front lit `id_number` et `monthly_income` dans 9 fichiers (`grep -rln` sous `takussan-web/src` : types, schémas, `CustomerForm`, `GuarantorSection`). Le défaut tient. Classement : V8, à découper par le porteur, par exemple pièce du locataire et de la caution, puis revenus, puis le front.

### Le super-admin liste et ouvre toutes les pièces d'identité de la plateforme par `GET /api/documents`, hors de la console et sans journal de consultation
- Réf : P23.04
- Statut : fait · TCK-820 — reste : `GET /api/search/documents` garde l'exemption du super-admin (`DocumentSearchService.php:22`) et lui rend encore les documents de toute la plateforme
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/DocumentController.php:35-49`, `takussan-api/app/Models/Document.php:36`, `takussan-api/app/Policies/DocumentPolicy.php:38`, `takussan-api/app/Http/Controllers/Api/Admin/KycController.php:37,46`
- Constat :
  - `index` ne filtre par téléverseur que hors super-admin (lu, `DocumentController.php:41-42`). `type` est filtrable (lu, `Document.php:36`). `GET /api/documents?filter[type]=id_card` rend donc au super-admin les pièces de tous les comptes, avec leur `file_url` signée (déduit de la lecture : à vérifier par un appel).
  - `DocumentPolicy::view` ouvre tout document au super-admin (lu, l. 38).
  - Aucun appel à `PersonalDataAccessLogger` sur cette voie (grep `->record(` dans `app/Http/Controllers` → seuls `KycDocumentController`, `OwnerProfileController@sensitive`, `Admin/KycController`, `Admin/AgencyUpgradeRequestController` et `Admin/UserDetailController`). Les dossiers KYC de la console sont journalisés à chaque lecture (lu, `Admin/KycController.php:37,46`).
  - La route est sous `auth:sanctum` et non sous `/api/admin/*` : ni le middleware `super-admin`, ni le refus d'impersonation de `/api/admin/*` ne s'y appliquent.
  - Établi comment : lu et grep.
- Piste : journaliser par `PersonalDataAccessLogger` toute lecture par un profil plateforme d'un `Document` de type pièce dont il n'est pas le téléverseur, ou retirer le pouvoir global de `index` au profit d'une voie de console. Garde : un test qui vérifie la ligne de journal.
- Mesure (2026-10-15, eee06c10, mesureur) : relu `DocumentController::index` (filtre `uploaded_by` hors super-admin seulement), `Document.php:36` (`type` filtrable), `DocumentPolicy.php:38` ; le point « à vérifier » est vérifié par test temporaire, retiré depuis : une `id_card` avec fichier, téléversée par un autre compte, puis super-admin (`operateur()` avec step-up) → `GET /api/documents?filter[type]=id_card` 200, 1 document, `file_url` signée ; `GET /api/documents/{id}` 200 ; `GET <file_url>` 302 ; 0 ligne `PersonalDataAccess` dans `activity_log`. Classement : V3, la piste propose deux voies (journaliser, ou retirer le pouvoir de `index`, ce qui touche aussi V2), un choix sur la consultation des pièces d'identité.
- Mesure (2026-10-17, 11118c160, implementeur) : condition de la décision vérifiée, aucun écran de la console n'appelle `GET /api/documents` (seule `DocumentsLibrary`, sous `/app/documents`) ; avant correctif, `DocumentPieceAccessTest` : la liste `filter[type]=id_card` du super-admin contenait la pièce d'un autre compte, et `GET /api/documents/{id}` comme le téléchargement d'une version ne laissaient aucune ligne `PersonalDataAccess` (3 rouges) → filtre `uploaded_by` pour tous, `PersonalDataAccessLogger::recordPlatformPieceRead()` (surface `document_piece`, pièce de `PIECE_TYPES` lue par un profil plateforme qui ne l'a pas téléversée) appelée par `show` et `download` ; 4 verts, ablation (contrôleurs d'origine) → 3 rouges, correctif remis → 4 verts ; 78 verts sur dix classes voisines.

### Des URL signées de 7 jours vers des pièces privées sont rangées dans `app_notifications.data`, et relues par `GET /api/notifications`
- Réf : P23.05
- Statut : fait · TCK-821
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Notifications/LeaseDepositRefundNotification.php:35,94-104,123-136`, `takussan-api/app/Notifications/Channels/AppDatabaseChannel.php:155-189`, `takussan-api/app/Http/Resources/AppNotificationResource.php:46`
- Constat :
  - `toArray()` porte `attachments`, chacune avec une URL signée vers `media.private.show` valable `ATTACHMENT_LINK_TTL_DAYS = 7` jours (lu, l. 35, 103, 129-132). Ce sont les pièces justificatives d'une retenue sur caution (photos, factures).
  - Le canal `database` du dépôt écrit ce `toArray()` dans `app_notifications.data` (lu, `AppDatabaseChannel.php:174-189`). `AppNotificationResource` le rend tel quel (lu, l. 46).
  - L'URL ouvre le fichier sans session (route `media.private.show` sans `auth:sanctum`, lu, `PrivateMediaController.php` docblock). C'est un « lien qui ouvre sans session » au sens d'ADR-0055 §3. `api/notifications` n'est pas dans `REFUSED_READS` : sous impersonation, l'opérateur la lit et la garde 7 jours (déduit de la lecture : à vérifier par un appel).
  - Au huitième jour, le lien de la cloche ne s'ouvre plus : la notification reste en base avec une URL morte (déduit de la lecture : à vérifier).
  - Aucune donnée réelle en base de dev (`app_notifications` dont `data` contient `attachments` → 0).
  - Établi comment : lu.
- Piste : ne ranger en base que les identifiants des médias, et signer à la lecture, dans `AppNotificationResource` ou un point de lecture dédié, après autorisation. Garder l'URL longue pour le seul courriel. Garde : un test qui vérifie qu'aucune `data` de notification écrite ne contient `signature=`.
- Mesure (2026-10-15, eee06c10, mesureur) : relu `LeaseDepositRefundNotification.php:35,103,129-131` et `AppNotificationResource.php:46` (`data` rendu tel quel) ; `EnforceImpersonationReadOnly` ne cite pas `api/notifications` (grep) ; les trois points « à vérifier » le sont par test temporaire, retiré depuis : remboursement de caution avec une photo → 1 ligne `app_notifications` dont `data` contient `signature=` ; session d'impersonation sur le locataire → `GET /api/notifications` 200, corps avec `signature=` ; l'URL relue sans session → 302 ; la même au huitième jour (`travel(8)->days()`) → 403. Classement : V3, le correctif change ce qui est conservé dans `app_notifications` et la forme de `data` relue par le front.
- Mesure (2026-10-17, 11118c160, implementeur) : avant correctif, `DepositRefundAttachmentLinksTest` : la ligne `app_notifications` d'un remboursement avec une photo contenait `signature=`, et `GET /api/notifications` rendait l'URL de 7 jours au lieu d'une URL courte (3 rouges) → `toArray()` ne range que `{id, name}`, `AppNotificationResource` signe à la lecture par `LeaseDepositRefundNotification::attachmentsAtRead()` (30 min, `LeasePolicy::view` sur le bail, pièce de sa collection, `null` sinon), le courriel garde ses 7 jours ; 4 verts, ablation (notification et ressource d'origine) → 3 rouges, correctif remis → 4 verts ; `PrivateMediaAccessTest` lit désormais le lien long dans le courriel ; 62 verts sur huit classes voisines.

### Petites améliorations
- Réf : P23.06
- Statut : validé — la garde d'impersonation sur les GET, après P23.05
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Http/Middleware/EnforceImpersonationReadOnly.php:15-25,37-43`, `docs/adr/0055-impersonation-en-lecture-seule-sans-jeton-dans-la-page.md`
- Constat :
  - La consigne d'ADR-0055 §3 n'est tenue que par un commentaire : « Rien d'autre ne l'attrape » (lu, l. 37-43). P23.01 et P23.05 sont deux lectures qu'elle aurait dû couvrir. Le premier cas ne se voit pas à la route, il se voit au type du document rendu.
  - Le docblock de la classe annonce le code `impersonation.read_only` (l. 19), l'ADR écrit `impersonation_read_only` (§3). Le code émet `impersonation.read_only` (lu, l. 84) : c'est l'ADR qui diffère.
  - Le relevé des « autres lectures GET » du docblock (l. 21-24 : `auth/sessions`, `me/calendar-feed`, `integrations`, `invitations`) ne cite ni `documents`, ni `customers`, ni `notifications`.
  - Établi comment : lu.
- Piste : une garde qui ouvre une session d'impersonation sur une cible garnie (pièce de profil, fiche client avec pièce, notification à pièces jointes) et balaie les `GET` de `route:list`. Elle échoue sur toute réponse 200 qui porte un champ `signature=`, `token`, `file_url` vers une pièce, ou `id_number`. Corriger l'ADR pour qu'il écrive le code réellement émis.
- Mesure (2026-10-16, 1efd784a, mesureur) : relu `EnforceImpersonationReadOnly.php:14-45` (docblock l. 19 : `impersonation.read_only` ; relevé des lectures GET l. 21-24 sans `documents`, `customers` ni `notifications` ; consigne « Rien d'autre ne l'attrape » l. 37-43) et l. 84 (`abort_code(403, 'impersonation.read_only')`), contre `docs/adr/0055-…md:64` (`impersonation_read_only`). Lignes citées inchangées, constat confirmé. Classement : V2, la garde balaie les lectures sous impersonation et rougit sur P23.01 et P23.05, validées mais non faites ; seule la correction de l'ADR (A6) serait autonome.
- Mesure (2026-10-16, 55a41109, humain) : la correction de l'ADR est faite en session (TCK-723) : ADR-0055 § 3 écrit `impersonation.read_only`, le code émis ; reste la garde, à l'implémenteur.

## Angle 24 — Crédits et Boost : idempotence des achats, remboursements, ce que voit l'espace

*Exploré le 2026-10-15 sur `pre-dev` afc07775, par l'explorateur. Tout a été relu par
l'explorateur, sans sous-agent : `CreditLedger`, `BoostPurchaseService`, `BoostLifecycle`,
`WelcomeCreditService`, `CreditExpiryNotifier`, `BoostsTick`, les contrôleurs `Credits/` et
`AdminCreditWalletController`, `PropertyBoostPolicy`, l'ADR-0061 et, côté front, `BoostDialog`,
`BoostButton`, `CreditsPanel` et `components/boost/api.ts`. Mesures par deux tests temporaires
(`tests/Feature/TmpExplo/`), retirés depuis : base de test `RefreshDatabase`, catalogue initial
d'ADR-0061 § 6. Charge avant les tests : `vm.loadavg` 1,35 sur 8 cœurs. **La moitié « Lemon
Squeezy » de l'intitulé est sans objet** : aucun achat de crédits n'existe (`CreditLedger::grant()`
refuse l'origine `purchase`, `CreditLedger.php:45-47` ; `CreditLotOrigin.php`), et ADR-0061 § 11
prévoit la phase 2 par Wave ou Orange Money, non par Lemon Squeezy. La devise et le montant des
paiements Lemon Squeezy sont déjà en P04 (« Lemon Squeezy ignore la devise du payable », « La garde
de sous-paiement ne s'applique pas à Lemon Squeezy… »). Relu et trouvé conforme : verrou de l'espace
avant la lecture des lots (`spend`), réclamation des clôtures par `UPDATE … WHERE status IN (live)`,
offre de bienvenue par `insertOrIgnore` sur deux index, préavis réclamé par lot, délai de Remontée
(un second achat immédiat rend 422). La pause et la reprise non réclamées sont déjà en P05 et ne
sont pas reprises.*

### Un même achat de boost rejoué est débité deux fois : deux badges identiques coûtent 20 crédits pour un seul badge
- Réf : P24.01
- Statut : fait · TCK-822
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/Credits/PropertyBoostController.php:32-41`, `takussan-api/app/Services/Boost/BoostPurchaseService.php:112-185`, `takussan-web/src/components/boost/BoostDialog.tsx:66-77,143`
- Constat :
  - mesuré, test temporaire : deux `POST /api/properties/{id}/boosts` avec le même `product_id` (badge « Urgent » 7 jours), à 30 s d'écart → 201 et 201, solde 500 → 480, le premier badge `ended` avec ses 7 jours, le second `active`. Même chose pour une Vedette 7 jours rejouée : 201 et 201, 40 crédits débités, durée prolongée deux fois. La Remontée seule est protégée, par son délai (422 `boost.bump_cooldown`).
  - La route ne reçoit aucune clé d'idempotence ; la requête ne porte que `product_id` (lu, `StorePropertyBoostRequest`).
  - Le front empêche le double clic pendant l'envoi (`disabled={… achat.isPending …}`, lu `:143`), et les mutations ne sont pas rejouées (`retry: false`, lu `src/lib/query-client.ts:28`). Mais après une erreur, le bouton « Confirmer » redevient actif : une réponse perdue (coupure réseau, délai du proxy) alors que l'achat a été écrit invite à confirmer de nouveau (lu ; l'occurrence réelle est à vérifier).
  - Pour un badge, le second achat **remplace** le premier sans remboursement (ADR-0061 § 5) : l'espace paie deux fois pour un seul badge, sans rien de plus.
  - Établi comment : lu, et test temporaire.
- Piste : une clé d'idempotence par ouverture du dialogue (`Idempotency-Key` ou champ `request_id`, unique par espace sur une courte fenêtre), rejouée en 200 avec le boost déjà écrit. Garde : un test qui rejoue la même clé et constate un seul débit.
- Mesure (2026-10-15, eee06c10, mesureur) : relu `BoostPurchaseService::purchase` et `badge()` (aucune clé d'idempotence, `debit()` à chaque appel) ; aucun ticket ne la prévoit (`grep -il idempoten` dans `docs/backlog/tickets` croisé avec « boost » → seul TCK-633, sur l'espace automatique) ; test temporaire, retiré depuis : deux `POST /api/properties/{id}/boosts` du premier badge (10 crédits), à 30 s d'écart → 201 et 201, solde 500 → 480, lignes `ended` puis `active`. La Vedette rejouée n'est pas remesurée. Classement : V1, le correctif touche l'écriture d'un débit de crédits et ajoute une clé au contrat de l'achat, dont la forme et la fenêtre sont à choisir.
- Mesure (2026-10-17, 11118c160, implementeur) : avant correctif, `BoostPurchaseIdempotencyTest` rejoue un badge avec la même `Idempotency-Key` à 30 s d'écart → 201 au lieu de 200, et une Vedette rejouée → 201 (deux débits) ; après, 201 puis 200 avec le même boost, un seul débit, la Vedette ni débitée ni prolongée deux fois, la même clé pour une autre offre ou un autre bien → 422 `boost.idempotency_key_reused`, et après 25 h un nouvel achat. Ablation (rejeu court-circuité) : 4 rouges sur 6 ; front, sans l'en-tête ou sans clé neuve à la réouverture, `api.test.ts` et `BoostDialog.test.tsx` rougissent.

### Le dialogue d'achat ne dit rien du boost déjà actif, et `GET /api/properties/{property}/boosts` n'a aucun appelant
- Réf : P24.02
- Statut : fait · TCK-824
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/boost/BoostDialog.tsx:29-55`, `takussan-web/src/components/boost/api.ts:12-31`, `takussan-api/routes/api/credits.php:14`, `takussan-api/app/Http/Controllers/Api/Credits/PropertyBoostController.php:18-30`
- Constat :
  - Le dialogue ne lit que le solde et le catalogue (`useCredits`, `useBoostProducts`, lu `:37-40`). Il propose les trois genres sans dire qu'un badge est déjà actif et sera **remplacé sans remboursement**, qu'une Vedette en cours sera prolongée, ni qu'une Remontée est encore en délai. Les règles d'ADR-0061 § 5 ne sont dites nulle part avant la confirmation (lu, libellés `boost.dialog.*` et `boost.kinds.*` de `src/messages/fr.json`).
  - mesuré : `grep -rn "/boosts" takussan-web/src` → le seul appel est le `POST` de `api.ts:28`. La lecture `GET /api/properties/{property}/boosts`, décrite par TCK-633 (l. 133), n'est appelée par aucun écran.
  - Établi comment : lu, et `grep`.
- Piste : lire `GET …/boosts` à l'ouverture du dialogue et dire, pour l'offre choisie, ce qui arrivera (« remplace le badge “Urgent” actif jusqu'au … », « prolonge la Vedette jusqu'au … », « Remontée possible à partir de … »). Garde : un test du dialogue qui monte un badge actif et attend l'avertissement.
- Mesure (2026-10-15, eee06c10, mesureur) : relu `BoostDialog.tsx:38-39` (seuls `useCredits` et `useBoostProducts`) ; `grep -rn "/boosts" takussan-web/src` → seul le `POST` de `components/boost/api.ts:28`, plus les routes `/super-admin/boosts` et `/api/super-admin/boosts`, sans rapport avec la lecture `GET /api/properties/{property}/boosts`, qui n'a toujours aucun appelant. Classement : V7, la piste ajoute un comportement visible et des textes métier neufs (« remplace le badge… », « prolonge la Vedette… »).
- Mesure (2026-10-17, 464374510, implementeur) : `grep -rn '/boosts' takussan-web/src` → seul le `POST` de `components/boost/api.ts`, la lecture n'a toujours aucun appelant ; `PropertyBoostReadAheadTest` rouge avant correctif (`bump_available_at` absent), 6 cas neufs de `BoostDialog.test.tsx` rouges (5) avant correctif → après : la lecture rend la fin du délai de Remontée (même date que le refus 422), le dialogue lit `GET …/boosts` à l'ouverture et dit le remplacement sans remboursement, la prolongation (date, ou jours si en pause) ou le délai ; ablation : effet retiré → 4 rouges, `bump_available_at` à `null` → 1 rouge ; 3 + 10 verts.

### La page « Crédits » ne montre aucun boost, et une dépense n'y dit ni le bien ni l'offre
- Réf : P24.03
- Statut : fait · TCK-825
- Gravité : 🟠 risque ou dette
- Où : `docs/features.md:428`, `takussan-web/src/components/boost/CreditsPanel.tsx:21-24`, `takussan-api/app/Http/Resources/Credits/CreditMovementResource.php:12-22`, `takussan-api/app/Services/Boost/BoostPurchaseService.php:187-191`
- Constat :
  - `features.md:428` annonce une page « Crédits » avec « solde, lots, historique, boosts » (lu). `CreditsPanel` rend le solde, les lots et le journal, et aucun boost (lu, `grep -n "boost" CreditsPanel.tsx` → rien).
  - Le journal affiche date, type, montant et motif (lu, `:21-24`). Une dépense de boost est écrite sans motif (`spend(…, $boost, $actor)`, lu `BoostPurchaseService.php:190`) : sa ligne se lit « Dépense −20 — », sans bien ni offre. `property_boost_id` est émis par la ressource mais n'est lu par aucune colonne (lu). Une dépense répartie sur deux lots fait deux lignes (ADR-0061 § 2).
  - Un remboursement automatique (bien loué) a lui aussi un motif nul quand l'acteur n'en donne pas (lu, `BoostLifecycle.php:54`).
  - Établi comment : lu.
- Piste : soit rendre le bien et l'offre dans le journal (relation `propertyBoost.property` chargée, colonne « Objet »), soit corriger `features.md` pour dire ce que la page montre. Garde : un test de `CreditsPanel` sur une ligne de dépense rattachée à un boost.
- Mesure (2026-10-15, eee06c10, mesureur) : relu `docs/features.md:428` (« page « Crédits » (solde, lots, historique, boosts) ») ; `CreditsPanel.tsx:22-24` : colonnes type, montant, motif (`m.reason ?? '—'`), aucune occurrence de « boost » ; `BoostPurchaseService::debit()` appelle `spend(…, $boost, $actor)` sans motif (l. 187-191). Classement : V7, la piste laisse le choix entre une colonne visible neuve et le retrait d'une fonction annoncée par la spec.
- Mesure (2026-10-17, 464374510, implementeur) : relu `CreditMovementResource` (seul `property_boost_id`) et `CreditsPanel` (date, type, montant, motif) ; `CreditMovementObjectTest` et le cas neuf de `CreditsPanel.test.tsx` rouges avant correctif → après : `GET /api/credits` rend `boost` (genre, variante, bien) pour la dépense et le remboursement d'un boost, `null` pour un octroi, et la colonne « Objet » les affiche ; ablation : colonne retirée → rouge, chargement anticipé retiré → rouge.

### Le contrôle « bien public » et « offre active » se fait avant le verrou : un achat peut passer sur un bien que l'on vient de dépublier
- Réf : P24.04
- Statut : fait · TCK-823
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Boost/BoostPurchaseService.php:30-48,63-77,79-110`
- Constat :
  - `purchase()` appelle `abort_code_unless($product->is_active, …)` et `assertBoostable($property)` (lu, `:32-33`), **puis** ouvre la transaction et verrouille l'espace et le bien (`:36-37`). Rien n'est re-vérifié sous le verrou (lu).
  - Une dépublication, une location ou un retrait de l'offre écrit entre les deux passe donc (déduit, à vérifier) : une Remontée est débitée sur un bien hors du public et n'est jamais remboursée (ADR-0061 § 5) ; une Vedette ou un Badge naît `active` sur un bien hors du public, l'observateur du bien ayant déjà joué, et ne passe en pause qu'au `boosts:tick` suivant (≤ 5 min, temps consommé).
  - La fenêtre est courte (deux requêtes SQL) ; aucun cas réel n'est observé.
  - Établi comment : lu.
- Piste : déplacer les deux contrôles sous le verrou, sur la ligne verrouillée (`Property::query()->public()->whereKey(…)` après `lock()`). Garde : un test qui dépublie le bien par `DB::beforeExecuting` entre le contrôle et le verrou, et attend 422 sans débit.
- Mesure (2026-10-15, eee06c10, mesureur) : relu `BoostPurchaseService::purchase` : `abort_code_unless($product->is_active, …)` et `assertBoostable()` avant `DB::transaction` et `lock()`, rien de re-vérifié sous le verrou ; le point « à vérifier » l'est par test temporaire, retiré depuis : `DB::beforeExecuting` passe le bien à `rented` juste avant le `FOR UPDATE` sur `agencies` → `POST` d'une Vedette 7 jours 201, boost `active`, solde 500 → 480, bien `rented`. Classement : V1, le correctif touche le chemin qui débite les crédits, et le doute entre A1 et V1 classe à valider.
- Mesure (2026-10-17, 11118c160, implementeur) : avant correctif, `BoostPurchaseUnderLockTest` passe le bien à `rented` (puis l'offre à inactive) par `DB::beforeExecuting` juste avant le `FOR UPDATE` sur `agencies` → 201 et débit dans les deux cas ; après, 422 `boost.property_not_public` et `boost.product_inactive`, solde 500 inchangé, aucune ligne de boost, et l'achat sans changement reste 201. Ablation (service d'avant) : les 2 cas rougissent ; remis, verts, avec les 94 tests de `tests/Feature/Boost`.

### Le remboursement d'une Vedette prolongée répartit le prix cumulé sur la durée cumulée : une Vedette offerte puis achetée ne rend presque rien des jours payés
- Réf : P24.05
- Statut : retenu · à valider — V4 : les tranches d'une Vedette prolongée ne sont écrites nulle part (ni durée ni offre par prolongation, aucun mouvement pour une tranche offerte) ; rembourser par tranche exige une table ou une colonne neuve, migration de schéma autre qu'un index, critère distinct de V1 accordé
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Boost/BoostPurchaseService.php:122-135`, `takussan-api/app/Services/Boost/BoostLifecycle.php:139-152`
- Constat :
  - Une prolongation additionne prix et durée sur la même ligne (`price_credits + $price`, `duration_days + …`, lu `:129-130`), et le remboursement rend `price_credits × jours pleins restants / duration_days` (lu, `:149-151`). Le prix est donc étalé uniformément sur toute la durée cumulée, alors que les jours payés sont au bout.
  - mesuré, test temporaire : Vedette offerte de 30 jours (prix 0), puis Vedette 7 jours achetée (20 crédits) → ligne à prix 20, durée 37. Bien loué au jour 25 : 12 jours pleins restent, dont les 7 payés ; **6 crédits** rendus, solde 486.
  - Le cas inverse (achat, puis Vedette offerte par la plateforme) rend plus que les jours payés restants (déduit du même calcul, à vérifier).
  - ADR-0061 § 8 dit « au prorata du prix figé » sans traiter la prolongation (lu).
  - Établi comment : lu, et test temporaire.
- Piste : rendre les jours restants en commençant par les plus tardifs, au prix de la tranche qui les a achetés (garder les tranches de prolongation, ou les mouvements `spend` datés), ou trancher dans l'ADR que le prorata sur le cumul est voulu. Garde : un test « offerte puis achetée » et « achetée puis offerte ».
- Mesure (2026-10-15, fda326cd, mesureur) : relu `BoostPurchaseService.php:127-131` (prolongation : `price_credits + $price`, `duration_days + …` sur la même ligne) et `BoostLifecycle.php:139-152` (`intdiv(price_credits × jours pleins, duration_days)`), inchangés depuis 6548b29c ; test temporaire `tests/Feature/Tmp/MesureurTmpTest.php` (retiré), load 3,50/3,54/3,31 sur 8 cœurs, `refundableCredits()` sur une Vedette active prix 20 / durée 37 → 6 crédits à 12 jours restants, 3 à 7 jours, 19 à 36 jours → le constat tient dans les deux sens : « offerte (30 j) puis achetée (7 j, 20) » rend 6 sur les 20 payés alors que les 7 jours payés restent ; « achetée puis offerte » à 36 jours restants rend 19, plus que les ≈17 des 6 jours payés restants (le cas « à vérifier » du constat est donc établi). Classement : V1, la règle de remboursement d'un montant de crédits est à trancher (tranches datées ou prorata cumulé assumé dans ADR-0061 § 8).
- Mesure (2026-10-17, 464374510, implementeur) : le défaut tient en lecture (`BoostPurchaseService.php:127-131` cumule toujours `price_credits` et `duration_days` sur la ligne en place, `BoostLifecycle::refundableCredits()` rend `intdiv(price_credits × jours pleins, duration_days)`). Mais rien ne garde les tranches : `property_boosts` n'a qu'un `price_credits`, un `duration_days` et un `boost_product_id` (celui de la première tranche, lu `2026_10_12_500100_create_boost_tables.php:31-57`) ; `credit_movements` n'a ni durée ni offre (lu `2026_10_12_500200_create_credit_ledger_tables.php:38-50`), et une tranche offerte n'écrit aucun mouvement (`debit()` ne fait rien à prix 0, lu `BoostPurchaseService.php:187-191`). Les jours de chaque tranche ne se reconstruisent donc pas : la correction validée demande une table ou une colonne neuve, et la reprise des Vedettes déjà prolongées. Rien n'est implémenté. Classement : V4.

### Petites améliorations
- Réf : P24.06
- Statut : fait · TCK-826 — reste : le message du délai de Remontée (`:hours` et date formatée), que la parité des placeholders oblige à porter aussi dans le texte `wo` existant, en pause
- Gravité : 🟢 amélioration
- Où : `takussan-api/lang/fr/errors.php:93`, `takussan-api/app/Services/Boost/BoostPurchaseService.php:81-89`, `takussan-api/app/Services/Credits/CreditExpiryNotifier.php:26-44`, `takussan-api/app/Services/Credits/CreditLedger.php:219-229`
- Constat :
  - **Délai de Remontée** : le message dit « moins de 24 heures » en dur (lu, `errors.php:93`, même chose en `en` et `wo`), alors que le délai est le réglage `boost.bump_cooldown_hours` (lu, `:81`). Et `available_at` est passé en ISO brut : mesuré, test temporaire → `message` « …Next bump available from 2026-10-13T10:00:30+00:00. ». Le code `boost.bump_cooldown` n'a pas de clé côté front (mesuré, `grep -rn bump_cooldown takussan-web/src` → un commentaire seulement) : c'est cette prose que le dialogue affiche (lu, `messageErreurApi`, `src/lib/api.ts:514-517`).
  - **Préavis d'expiration répété** : un lot `refund` hérite de l'expiration de son lot d'origine et naît sans `expiry_notice_sent_at` (lu, `CreditLedger.php:227`). Mesuré, test temporaire : lot de bienvenue expirant à J+20, Vedette 30 jours, préavis envoyé à J+14 ; bien loué à J+15 → lot `refund` de 30 crédits, même échéance, et un **second préavis** au passage suivant (2 notifications pour la même date).
  - Établi comment : lu, et test temporaire.
- Piste : délai et date passés en paramètres (`:hours`, date formatée), ou une clé `errors.api` côté front qui formate `params.available_at` ; pour le préavis, poser `expiry_notice_sent_at` du lot `refund` quand son lot d'origine a déjà été prévenu. Garde : un test par cas.
- Mesure (2026-10-16, 1efd784a, mesureur) : relu `lang/{fr,en,wo}/errors.php:93` (« 24 heures » en dur dans les trois langues), `BoostPurchaseService.php:80-89` (délai = `bumpCooldownHours()`, `available_at` en `toIso8601String()`), `grep -rn bump_cooldown takussan-web/src` → seules des clés `bump_cooldown_hours` du réglage dans `messages/*.json`, aucune pour le code d'erreur ; `CreditLedger.php:218-229` (`applyRefund` passe par `grant()` avec l'expiration du lot d'origine, sans `expiry_notice_sent_at`) et `CreditExpiryNotifier.php:27,35` (sélectionne les lots `whereNull('expiry_notice_sent_at')`). Lignes à peine décalées, les deux défauts tiennent ; le second préavis se lit au code, il n'a pas été rejoué. Classement : V1, la piste touche l'écriture d'un lot de crédits remboursés, et le message demande un texte neuf dans trois langues (V7).
- Mesure (2026-10-17, 464374510, implementeur) : préavis reproduit avant correctif par `RefundLotExpiryNoticeTest` (lot de bienvenue à J+20, Vedette 15 jours à J+10, préavis à J+14, bien loué) → le lot `refund` naît sans `expiry_notice_sent_at` et le passage suivant envoie un second préavis (`1` au lieu de `0`) ; correctif : `CreditLedger::applyRefund()` reporte l'`expiry_notice_sent_at` du lot d'origine sur le lot remboursé → 2/2 verts, 127 verts sur `tests/Feature/Boost` et `tests/Feature/Credits` ; ablation (`applyRefund()` d'origine) → le même rouge, le témoin « lot d'origine pas encore prévenu » reste vert. Message du délai de Remontée non fait : `LangGroupParityTest` exige les mêmes placeholders en `fr`, `en` et `wo`, et `:hours` réécrirait le texte `wo` existant (`lang/wo/errors.php:93`), en pause.

## Angle 25 — Rapprochement bancaire quand une pénalité est incluse dans l'encaissement

*Exploré le 2026-10-15 sur `pre-dev` bdb71428, par l'explorateur. Tout a été relu par l'explorateur
lui-même, sans sous-agent : `ReconciliationMatcher`, `ReconciliationManager`, `PaymentSearchService`,
`MatchBankStatementJob`, `LateFeeSettlement`, `LeasePaymentService::markPaid` et les parties de
`PaymentGatewayService` qui figent le montant (`recordInitiation`, `markManualSettlement`,
`supersedeOpenCheckout`, `amountDue`). Mesures par un test temporaire (`tests/Feature/Tmp/…`, retiré),
bâti sur `Tests\Support\LeaseDueFixture` (échéance de 150 000, pénalité de 7 500) et lancé seul,
`load average` 1,44 / 1,99 / 2,30 sur 8 cœurs, base de test propre au processus. Non mesuré : un
relevé réel (D-67), et ce que le front affiche d'une suggestion.*

### Un loyer payé en ligne pénalité comprise est introuvable par la recherche manuelle au montant de la ligne
- Réf : P25.01
- Statut : fait · TCK-715
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Accounting/PaymentSearchService.php:159-170`, `takussan-api/app/Services/Accounting/ReconciliationMatcher.php:86-91`, `takussan-web/src/components/admin/reconciliation/PaymentSearchDialog.tsx:46-48`
- Constat :
  - TCK-593 a appris au matcher automatique que l'échéance payée en ligne arrive pour le montant figé, pénalité comprise (`COALESCE((metadata->>'gateway_expected_amount')::numeric, amount)`) (lu, `ReconciliationMatcher.php:86-91`).
  - La recherche manuelle compare toujours `amount` seul (`ABS(amount - ?) < 1`) (lu, `PaymentSearchService.php:168-169`).
  - Le dialogue de recherche préremplit le montant avec celui de la ligne (lu, `PaymentSearchDialog.tsx:46-48`).
  - Mesuré, test temporaire : échéance initiée en ligne puis soldée par webhook Wave à 157 500 ; `GET …/bank-statements/payment-search?amount=157500&direction=credit` → `200 []`. Même appel à `amount=150000` → 1 résultat.
  - Conséquence : quand la suggestion automatique manque (hors fenêtre de ±7 jours, ou ambiguïté), la ligne de 157 500 ne retrouve pas son échéance par la recherche telle qu'elle s'ouvre.
  - Établi comment : lu, puis test temporaire.
- Piste : une seule expression du « montant attendu sur le compte » pour une `LeasePayment`, partagée par le matcher et la recherche (scope ou méthode du modèle). Garde : le test AC14 de `BankReconciliationTest` doublé côté recherche manuelle.
- Mesure (2026-10-15, fda326cd, mesureur) : relu `PaymentSearchService.php:159-170` (`applySearch` : `ABS(amount - ?) < 1`, utilisé par `searchLeasePayments` l. 84) contre `ReconciliationMatcher.php:86-91` (`COALESCE((metadata->>'gateway_expected_amount')::numeric, amount)`) ; test temporaire `tests/Feature/Tmp/MesureurTmpTest.php` (retiré), load 3,50/3,54/3,31 sur 8 cœurs, échéance initiée en ligne puis soldée par webhook Wave à 157 500, `GET /api/agencies/{agency}/bank-statements/payment-search?amount=…&direction=credit` en admin d'agence → `200 []` à 157 500, 1 résultat à 150 000 (le chemin exact de la route est sous `agencies/{agency}`, le constat l'abrégeait). Classement : V1, l'expression à partager est celle du montant attendu d'un paiement, que P25.02 montre fausse après un règlement manuel : la corriger ici sans trancher P25.02 propagerait le défaut.
- Mesure (2026-10-16, de18f26c, implementeur) : reproduit avant correctif par `BankReconciliationTest::test_la_recherche_manuelle_trouve_l_echeance_payee_en_ligne_penalite_comprise` (load 14,31 sur 8 cœurs) : échéance initiée en ligne puis soldée par webhook Wave à 157 500, `payment-search?amount=157500&direction=credit` → `[]` → `LeasePayment::scopeWhereExpectedAmountNear()`, une seule expression appelée par `ReconciliationMatcher` et `PaymentSearchService` ; ablation (trois fichiers d'`app/` remis à `pre-dev`) → rouge `two arrays are identical`, remis → vert, 18 tests verts sur la classe.

### Après un checkout abandonné et un règlement manuel, le matcher cherche encore le montant du checkout
- Réf : P25.02
- Statut : fait · TCK-715
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Payments/PaymentGatewayService.php:671`, `takussan-api/app/Services/Payments/PaymentGatewayService.php:919-926`, `takussan-api/app/Services/Model/LeasePaymentService.php:59-66`, `takussan-api/app/Services/Accounting/ReconciliationMatcher.php:89-91`
- Constat :
  - `recordInitiation()` fige `metadata.gateway_expected_amount` à chaque initiation (lu, `:671`).
  - Un règlement manuel ne fait que poser `gateway.settled_by = manual` (lu, `markManualSettlement`, `:919-926`). `supersedeOpenCheckout()` ne touche pas non plus au montant figé (lu). La clé reste donc sur la ligne.
  - Le matcher la préfère à `amount` sans regarder comment l'échéance a été soldée (lu, `COALESCE`, `:90`).
  - Mesuré, test temporaire : agence qui encaisse la pénalité en ligne, checkout ouvert à 157 500 et abandonné ; deux heures plus tard, `markPaid` (virement) passe sans passage outre. L'échéance est `paid`, `gateway_expected_amount` vaut toujours 157 500 et la pénalité reste due. Un crédit de 150 000 au relevé → `unmatched`.
  - Même effet attendu pour tout checkout initié puis abandonné avant un règlement hors ligne, dès que son montant différait de `amount` (à vérifier pour un checkout sans pénalité : le montant figé y vaut `amount`, donc sans effet).
  - Établi comment : lu, puis test temporaire.
- Piste : ne lire le montant figé que si l'échéance a été soldée en ligne (`gateway.settled_by` ≠ `manual`, ou le montant de la transaction qui a soldé), sinon `amount`. Garde : un test « checkout abandonné puis virement ».
- Mesure (2026-10-15, fda326cd, mesureur) : relu `PaymentGatewayService.php:671` (`gateway_expected_amount` figé à l'initiation), `:919-926` (`markManualSettlement` ne pose que `settled_by = manual`), `:869-893` (`supersedeOpenCheckout` ne touche pas au montant figé) et `ReconciliationMatcher.php:89-91` ; test temporaire `tests/Feature/Tmp/MesureurTmpTest.php` (retiré), load 3,50/3,54/3,31 sur 8 cœurs, agence qui encaisse la pénalité en ligne, checkout ouvert puis abandonné, 3 h plus tard `LeasePaymentService::markPaid` (virement) → `paid`, `gateway_expected_amount = 157500`, `settled_by = manual`, `late_fee_paid_at = null` ; crédit de 150 000 à J+1 → `suggestFor()` rend `null`. Classement : V1, choisir le montant attendu (montant figé, `amount`, ou montant de la transaction qui a soldé) est une règle sur un montant de paiement.
- Mesure (2026-10-16, de18f26c, implementeur) : reproduit avant correctif par `BankReconciliationTest::test_apres_un_checkout_abandonne_puis_un_virement_le_montant_attendu_est_celui_de_l_echeance` (load 14,31 sur 8 cœurs) : checkout de 157 500 abandonné, `markPaid` par virement 3 h plus tard, crédit de 150 000 à J+1 → `unmatched` → le scope ne lit `gateway_expected_amount` que si `gateway.settled_by` est posé et ≠ `manual` ; le test vérifie aussi la recherche (trouvée à 150 000, plus à 157 500) ; ablation de la seule condition « soldée en ligne » → ce test rouge (`Unmatched` au lieu de `Suggested`), celui de P25.01 vert ; remise → vert.

### La règle « contrepartie ≥ 85 % » du matcher ne peut jamais s'appliquer aux encaissements
- Réf : P25.03
- Statut : fait · TCK-706
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Accounting/ReconciliationMatcher.php:98`, `takussan-api/app/Services/Accounting/ReconciliationMatcher.php:184-200`, `takussan-api/app/Services/Accounting/ReconciliationMatcher.php:218-232`
- Constat :
  - Les candidats d'encaissement sont chargés avec `get(['id', $amountColumn, 'currency', 'reference_number', $dateColumn])` (lu, `:98`) : ni `payer_id` (`BookingPayment`, `LeasePayment`), ni `customer_id` (`Invoice`).
  - `resolvePayerName()` lit `$model->payer` ou `$model->customer` sur ces modèles. Sans la clé étrangère, la relation rend `null` sans erreur : aucun mode strict n'est activé (mesuré, `grep -rn "shouldBeStrict\|preventAccessingMissingAttributes" app bootstrap config` → rien).
  - Mesuré, test temporaire : échéance de 150 000 payée, ligne de 150 000 à J+5 dont `counterparty` est exactement le `full_name` du payeur → `suggested`, `conf=60`. La règle 80 aurait dû répondre.
  - Les reversements, eux, chargent `landlord_id` (lu, `:130`) : seule la branche débit a sa règle 80.
  - Établi comment : lu, puis test temporaire.
- Piste : charger la clé étrangère du payeur (et la relation par `with()` pour éviter un N+1). Garde : un test de la règle 80 sur un crédit, rouge aujourd'hui.
- Mesure (2026-10-15, fda326cd, mesureur) : relu `ReconciliationMatcher.php:98` (`get(['id', $amountColumn, 'currency', 'reference_number', $dateColumn])`, sans `payer_id` ni `customer_id`) et `:218-232` (`resolvePayerName` lit `$model->payer` / `$model->customer`), branche débit à `:130` qui charge `landlord_id` ; aucune confirmation automatique sur la confiance (`BankStatementLine::scopeReadyToConfirm` n'a aucun appelant dans `app/`) ; test temporaire `tests/Feature/Tmp/MesureurTmpTest.php` (retiré), load 3,50/3,54/3,31 sur 8 cœurs, échéance payée de 150 000, crédit de 150 000 à J+5 dont `counterparty` est exactement le `full_name` du payeur → `LeasePayment conf=60` au lieu de 80. Classement : A1, la règle 80 est déjà écrite dans `scoreCandidate()` et ne s'applique pas faute de clé chargée ; correctif : charger `payer_id` (`BookingPayment`, `LeasePayment`) et `customer_id` (`Invoice`) avec `with()` de la relation, et un test de la règle 80 sur un crédit, rouge aujourd'hui.
- Mesure (2026-10-16, 8350d37f, implementeur) : reproduit avant correctif par `BankReconciliationTest::test_la_regle_contrepartie_s_applique_aux_encaissements` (load 1,33 sur 8 cœurs) : `LeasePayment` payé de 150 000, crédit de 150 000 à J+5 dont `counterparty` est le nom complet du payeur → `conf=60` au lieu de 80 → `fetchCandidates()` charge `payer_id` / `customer_id` et la relation par `with()` ; le test couvre `LeasePayment`, `BookingPayment` et `Invoice`, vert ; ablation (matcher remis à `pre-dev`) → rouge `60 is identical to 80`, remis → vert, 16 tests verts sur la classe.

### Le matcher propose des factures brouillon, annulées et nulles
- Réf : P25.04
- Statut : fait · TCK-724
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Accounting/ReconciliationMatcher.php:69-96`, `takussan-api/app/Services/Accounting/PaymentSearchService.php:99-114`, `takussan-api/app/Services/Accounting/ReconciliationManager.php:39-97`
- Constat :
  - `fetchCandidates()` ne filtre les factures que par agence, devise, montant, `issue_date` et `bank_reconciled_at` : aucun statut (lu, `:69-96`). La recherche manuelle non plus (lu, `PaymentSearchService.php:101-114`).
  - Mesuré, test temporaire : une facture de 33 333 `draft`, puis `cancelled`, puis `void`, émise le jour même. Un crédit de 33 333 → `suggested Invoice conf=70` dans les trois cas.
  - `confirmMatch()` ne juge pas non plus le statut d'un encaissement : il ne le fait que pour les reversements (`payout_not_completed`) (lu, `:70-74`). Une facture annulée peut donc recevoir `bank_reconciled_at`.
  - `PaymentGatewayService::isPayable()` tient déjà la règle « une facture se paie en `sent|overdue` » (lu, `:1294-1296`).
  - Établi comment : lu, puis test temporaire.
- Piste : borner les factures candidates aux statuts encaissables (`sent`, `overdue`, `paid`) dans le matcher, la recherche et `confirmMatch()`. Garde : un test par statut exclu.
- Mesure (2026-10-15, fda326cd, mesureur) : relu `ReconciliationMatcher.php:69-96` (aucun filtre de statut), `PaymentSearchService.php:99-114` (idem), `ReconciliationManager.php:39-97` (seul `payout_not_completed` juge un statut) et `PaymentGatewayService.php:1294-1296` (`isPayable` : `sent|overdue`) ; test temporaire `tests/Feature/Tmp/MesureurTmpTest.php` (retiré), load 3,50/3,54/3,31 sur 8 cœurs, facture de 33 333 émise le jour même en `draft`, `cancelled` puis `void`, crédit de 33 333 à J+1 → `Invoice conf=70` dans les trois cas. Classement : V1, la liste des statuts rapprochables (`paid` inclus ou non, `isPayable` ne la donne pas) et un refus neuf dans `confirmMatch()` sur une écriture comptable sont à décider.
- Mesure (2026-10-16, 0b77b543, implementeur) : reproduit avant correctif par `BankReconciliationTest::test_une_facture_non_encaissable_n_est_ni_suggeree_ni_confirmable` et `PaymentSearchTest::test_la_recherche_ne_propose_que_les_factures_encaissables` (load 1,20 sur 8 cœurs) : facture `draft` de 33 333, crédit de 33 333 → suggérée (`Failed asserting that 2 is null`), et la recherche rend les six statuts → `Invoice::RECONCILABLE_STATUSES` (`sent`, `overdue`, `paid`) borne le matcher et la recherche, et `confirmMatch()` rend 422 `invoice_not_reconcilable` ; versant autorisé testé pour les trois statuts ; ablation complète (`app/` remis à `pre-dev`) → les deux tests d'exclusion rouges, ablation fine (garde de `confirmMatch()` seule retirée) → `Expected 422 but received 200`, remis → 24 verts sur les deux classes, 67 sur `tests/Feature/Api/Accounting/`.

### À montant égal, deux encaissements du même jour : le matcher en choisit un au hasard, avec 70 de confiance
- Réf : P25.05
- Statut : fait · TCK-827
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Accounting/ReconciliationMatcher.php:144-176`
- Constat :
  - L'ambiguïté n'est jugée qu'au score 60 (`if ($bestScore === 60)`, lu, `:156`). À 70 (montant et date à ±2 jours) ou à 80, le premier candidat rencontré l'emporte (`>` strict, `:149`), dans l'ordre de la requête et des modèles.
  - Mesuré, test temporaire : deux loyers de 150 000 de deux baux de l'agence, payés le même jour ; un crédit de 150 000 → `suggested LeasePayment#1 conf=70`. Les mêmes, cinq jours plus tard (règle 60) → `unmatched`.
  - Le cas est ordinaire : des loyers identiques dans une même résidence, réglés en début de mois.
  - Établi comment : lu, puis test temporaire.
- Piste : juger l'ambiguïté à chaque palier (deux candidats au meilleur score, et aucune ne suggère). Garde : un test à 70 et un à 80.
- Mesure (2026-10-15, fda326cd, mesureur) : relu `ReconciliationMatcher.php:144-176` (ambiguïté jugée seulement `if ($bestScore === 60)`, `>` strict à `:149`) ; test temporaire `tests/Feature/Tmp/MesureurTmpTest.php` (retiré), load 3,50/3,54/3,31 sur 8 cœurs, deux loyers de 150 000 de deux baux de la même agence payés le même jour, crédit de 150 000 à J+1 → `LeasePayment conf=70` (le premier), à J+5 → `null`. Classement : V7, étendre l'ambiguïté aux paliers 70 et 80 change ce que voit l'agence (suggestion retirée, à apparier à la main), et la règle de départage (ambiguïté ou critère de plus) est un choix de produit.
- Mesure (2026-10-17, 464374510, implementeur) : reproduit avant correctif par `ReconciliationAmbiguityTest` → deux loyers de 150 000 à égalité rendent une suggestion au premier candidat aux paliers 70 (même jour, crédit à J+1), 80 (même payeur, crédit à J+5) et 95 (même référence) : 3 rouges ; correctif : `scoreCandidates()` compte les candidats au meilleur score et ne suggère rien à partir de deux → 4/4 verts, 117 verts sur `tests/Feature/Api/Accounting` et les deux classes de reversement ; ablation (`scoreCandidates()` d'origine) → les 3 mêmes rouges, le témoin « un seul au meilleur score, un autre à 60 » reste vert.

### Une pénalité réglée hors ligne n'a rien à quoi se rapprocher
- Réf : P25.06
- Statut : fait · TCK-833 — reste : rendre rapprochable une pénalité réglée seule
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Lease/LateFeeSettlement.php:47-56`, `takussan-api/app/Services/Accounting/ReconciliationMatcher.php:26-30`, `takussan-api/app/Services/Accounting/ReconciliationManager.php:123-134`
- Constat :
  - La pénalité n'est pas un encaissement à part : `LateFeeSettlement::markPaid()` pose `late_fee_paid_at` (et le moyen de règlement en métadonnée) sur l'échéance, rien d'autre (lu, `:47-56`).
  - Le rapprochement est un-pour-un : une ligne vise un seul paiement, et un paiement porte un seul `bank_statement_line_id` (lu, `ReconciliationManager.php:123-134`).
  - Mesuré, test temporaire : agence qui n'encaisse pas la pénalité en ligne, loyer marqué payé puis pénalité marquée réglée, tous deux par virement. Un crédit de 157 500 (loyer et pénalité en un virement) → `unmatched` ; un crédit de 7 500 (pénalité seule) → `unmatched`.
  - Le premier se confirme à la main sur l'échéance : `confirmMatch()` ne compare aucun montant (lu, `:39-97`). Le second ne peut être que `ignored`, et le relevé ne finalise alors en `reconciled` qu'en déclarant ignoré un encaissement réel.
  - Établi comment : lu, puis test temporaire.
- Piste : décider si le montant attendu d'une échéance soldée hors ligne inclut la pénalité réglée le même jour, et si une pénalité réglée seule devient un objet rapprochable. C'est un choix de modèle comptable ; la garde suit le choix.
- Mesure (2026-10-15, fda326cd, mesureur) : relu `LateFeeSettlement.php:47-56` (pose `late_fee_paid_at` et `late_fee_payment_method`, rien d'autre) et `ReconciliationManager.php:123-134` (un-pour-un) ; test temporaire `tests/Feature/Tmp/MesureurTmpTest.php` (retiré), load 3,50/3,54/3,31 sur 8 cœurs, agence sans encaissement en ligne de la pénalité, loyer puis pénalité marqués réglés par virement → crédit de 157 500 : `null` ; crédit de 7 500 : `null` ; témoin à 150 000 : `LeasePayment conf=70`. Classement : V1, la piste elle-même demande un choix de modèle comptable (montant attendu pénalité comprise, ou pénalité rapprochable seule).
- Mesure (2026-10-18, b9850853, implementeur) : reproduit par `ReconciliationLateFeeSameDayTest` avant correctif (load 9,63/9,49/7,07 sur 8 cœurs) : loyer de 150 000 payé par virement et pénalité de 7 500 réglée le même jour → crédit de 157 500 `unmatched` ; `LeasePayment::scopeWhereExpectedAmountNear()` ajoute hors ligne `late_fee_amount` quand `late_fee_paid_at` et `paid_at` tombent le même jour → `suggested` sur l'échéance, et la recherche manuelle à 157 500 la rend ; témoins verts (pénalité un autre jour : `unmatched` ; sans pénalité : 150 000 suggéré). Ablation : branche hors ligne ramenée à `amount`, le cas du même jour rougit, remis vert ; `BankReconciliationTest` et `PaymentSearchTest` verts (29 tests).

### Petites améliorations du rapprochement
- Réf : P25.07
- Statut : fait · TCK-828 — reste : les autres points, un par un
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Accounting/ReconciliationMatcher.php:95`, `takussan-api/app/Services/Accounting/ReconciliationManager.php:39-97`, `takussan-api/app/Services/Accounting/PaymentSearchService.php:75-84`, `takussan-api/app/Jobs/Accounting/MatchBankStatementJob.php:30-49`
- Constat :
  - **Date d'une facture** : la fenêtre de ±7 jours porte sur `issue_date` (lu, `:95`). La table `invoices` n'a pas de date d'encaissement (lu, migration de création : `issue_date`, `due_date`). Une facture réglée à son échéance, à 30 jours, n'est jamais suggérée (à vérifier sur données réelles).
  - **Confirmation sans montant ni statut** : `confirmMatch()` accepte une ligne de 7 500 sur une échéance de 150 000, et une `LeasePayment` `pending` (lu, `:39-97`). Ni avertissement ni trace du montant dans l'activité (`withProperties` : type, id, confiance).
  - **Recherche manuelle sans statut** : les échéances `pending`, `late` ou `cancelled` sortent comme candidates à un crédit (lu, `PaymentSearchService.php:79-84`).
  - **Même paiement suggéré pour deux lignes** : le job ne retire pas des candidats un paiement déjà suggéré sur une autre ligne du relevé (lu, `MatchBankStatementJob.php:30-49`). La seconde confirmation rend `already_reconciled`.
  - Établi comment : lu.
- Piste : à trancher entrée par entrée. Le statut et l'écart de montant à la confirmation peuvent au moins être journalisés (`withProperties`) sans changer le comportement.
- Mesure (2026-10-16, 1efd784a, mesureur) : relu `ReconciliationMatcher.php:94-95` (fenêtre sur `issue_date` pour une facture, `paid_at` pour le reste), les colonnes de date d'`invoices` lues par `SELECT` sur `information_schema` en dev (`issue_date`, `due_date`, `last_reminder_sent_at`, `bank_reconciled_at` : aucune date d'encaissement), `ReconciliationManager.php:39-97` (gardes de statut du relevé, d'agence, de sens, de reversement `Completed`, de devise et de doublon ; ni montant ni statut d'une `LeasePayment`), `PaymentSearchService.php:75-84` (filtre `bank_reconciled_at` et cautions rendues, sans statut) et `MatchBankStatementJob.php:30-49` (aucun retrait des paiements déjà suggérés). Les quatre parties tiennent ; la facture réglée à 30 jours se déduit du code, elle n'a pas été rejouée sur données. Classement : V1, chaque partie touche l'écriture d'un rapprochement de paiement, et la piste renvoie elle-même le choix au porteur.
- Mesure (2026-10-17, 464374510, implementeur) : reproduit avant correctif par `ReconciliationConfirmationAuditTest` → une ligne de 7 500 se confirme sur une échéance `pending` de 150 000 et l'activité `matched` ne porte ni statut ni montant (3 rouges, clé `payment_status` absente) ; correctif : `payment_status`, `expected_amount` et `amount_gap` ajoutés à l'activité, montant attendu d'une échéance par `LeasePayment::expectedBankAmount()` (la règle du scope de TCK-715) → 3/3 verts, 120 verts sur `tests/Feature/Api/Accounting` et les deux classes de reversement ; ablation : `confirmMatch()` d'origine → 3 rouges, `expectedBankAmount()` réduit à `amount` → 1 rouge (échéance soldée en ligne, écart de 7 500). Comportement inchangé : aucun refus ajouté.

## Angle 26 — PDF : quittances, contrats, factures

*Exploré le 2026-10-16 sur `pre-dev` 5fa8aefe, par l'explorateur, sans sous-agent. Relus par
l'explorateur : les sept gabarits de `resources/views/pdf/`, `DocumentPdfService`,
`DocumentPdfController`, `PaymentReceiptPdf`, `CurrencyDirective`, `CurrencyFormatter`, les
créateurs de factures et le diff de la PR #453 (P04.01, ouverte). Les rendus sont mesurés en HTML
par `view(…)->render()` dans `tinker`, sur la base de développement en lecture ou sur un modèle non
enregistré : ni le moteur PDF ni la locale `fr` d'une requête n'ont joué (la CLI est en `en`,
d'où « May 2026 », déjà porté par P06.03). Déjà couverts et non repris : la langue des PDF (P06.03),
l'arrondi au centime à la création (P04.08), la devise par défaut d'une facture (P04, « Devise
forcée »).*

### Une caution, une pénalité ou des charges payées sortent en « Quittance de loyer — Loyer acquitté »
- Réf : P26.01
- Statut : fait · TCK-725
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Controllers/Api/DocumentPdfController.php:30-41`, `takussan-api/resources/views/pdf/receipts/rent.blade.php:22,60,100`, `takussan-api/app/Http/Resources/LeasePaymentResource.php:43`, `takussan-web/src/components/payments/CustomerPayments.tsx:227`, `takussan-api/app/Services/Model/LeaseService.php:283-296`
- Constat :
  - Le contrôleur ne refuse que `deposit_refund` (lu, `:39`). Les types `deposit`, `charges`, `regularization` et `penalty` payés passent, et le gabarit est unique : titre « Quittance de loyer », ligne « Loyer acquitté », mention « atteste du règlement du loyer pour la période indiquée » (lu).
  - `receipt_available` vaut vrai pour ces mêmes types, et le front affiche le bouton de quittance sur l'échéancier et sur la liste des paiements (lu).
  - Mesuré : `tinker`, rendu HTML de `pdf.receipts.rent` pour `lease_payments.id = 1` (`payment_type = deposit`, `paid`, base de dev) → « Quittance de loyer … Période May 2026 · Loyer acquitté 611 895 F CFA · Méthode bank_transfer … atteste du règlement du loyer ». La base de dev porte 332 cautions `paid` (mesuré : `SELECT payment_type, status, count(*)` sur `lease_payments`).
  - L'indemnité de résiliation anticipée naît en `LeasePayment` de type `penalty`, avec `period_start` = jour de la résiliation (lu, `LeaseService.php:283-296`) : réglée, elle s'imprime en loyer du mois de la résiliation (déduit du gabarit, non rendu).
  - Établi comment : lu, et une mesure de rendu sur une caution.
- Piste : un intitulé et une ligne de montant par type (« Reçu de dépôt de garantie », « Reçu d'indemnité »…), ou refuser la quittance hors `rent` comme pour `deposit_refund`. Un test par type, qui lise le texte rendu et non les octets `%PDF-`.
- Mesure (2026-10-16, 8ff39d7a, mesureur) : relu `DocumentPdfController.php:30-41` (seuls l'impayé et `deposit_refund` sont refusés), `rent.blade.php:22,60,100` (titre, « Loyer acquitté » et mention uniques), `LeasePaymentResource.php:43` et `CustomerPayments.tsx:227` (bouton hors `deposit_refund` seulement), aucun commit postérieur sur ces fichiers (`git log` : dernier 1c32de99, TCK-602) ; `tinker` en lecture, rendu de `pdf.receipts.rent` pour `lease_payments.id = 1` (`deposit`, `paid`) → « Quittance de loyer … Période May 2026 · Loyer acquitté 611 895 F CFA · Méthode bank_transfer … atteste du règlement du loyer » ; `SELECT` sur `lease_payments` `paid` → 2 836 `rent`, 332 `deposit`. Le cas `penalty` reste déduit, non rendu. Classement : V7, la piste offre deux voies (texte métier neuf par type, ou retrait de la quittance pour ces types) qui sont un choix de produit.
- Mesure (2026-10-16, 57648350, implementeur) : avant correctif, `ReceiptPdfTest::test_le_recu_hors_loyer_dit_ce_qui_a_ete_paye` (rendu par la route, HTML relu) rougit sur les quatre types `deposit`, `penalty`, `charges`, `regularization` payés : tous impriment « Quittance de loyer … Loyer acquitté … règlement du loyer » → `DocumentPdfController::receiptWording()` donne un intitulé, une ligne de montant et une mention par type, le loyer garde son texte (`test_le_loyer_garde_sa_quittance`) ; 12 verts, et l'ablation du contrôleur et du gabarit rend 4 rouges.

### La facture PDF imprime une TVA et un total qui ne s'additionnent pas
- Réf : P26.02
- Statut : fait · TCK-726
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Formatting/CurrencyFormatter.php:37-39`, `takussan-api/resources/views/pdf/invoices/default.blade.php:106-118`, `takussan-api/app/Services/Model/InvoiceService.php:58`
- Constat :
  - `InvoiceService` range une TVA au centime (`round(…, 2)`, voir P04.08). `CurrencyFormatter` l'affiche à 0 décimale en XOF par `NumberFormatter`, sans régler de mode d'arrondi : celui d'ICU par défaut est l'arrondi au pair (lu).
  - Mesuré (`tinker`, rendu HTML de `pdf.invoices.default` sur une `Invoice` non enregistrée, sous-total 100 025, TVA 18 %) → « Sous-total 100 025 F CFA · TVA (18%) 18 004 F CFA · Total TTC 118 030 F CFA ». 100 025 + 18 004 = 118 029 : le document n'est pas arithmétiquement juste.
  - Le même formateur affiche « 1 250 F CFA » pour 1 250,5 (mesuré : `CurrencyDirective::render("1250.5", "XOF")`), alors que `amountDue()` et `PayoutCalculator` arrondissent au demi supérieur (`PHP_ROUND_HALF_UP`, lu) et encaissent 1 251.
  - Le relevé du bailleur additionne des lignes non arrondies par bien, puis imprime chaque ligne par ce formateur (`OwnerStatementService.php:115-135`) : même risque d'écart entre lignes et total (à vérifier).
  - Aucun test PDF ne porte un montant XOF fractionnaire : `CurrencyPdfRegressionTest` n'en a qu'en EUR (lu).
- Piste : P04.08 supprime la cause en base. Indépendamment, poser `ROUNDING_MODE = ROUND_HALFUP` dans `CurrencyFormatter`, pour que l'affichage arrondisse comme l'encaissement. Un test d'unité sur 0,5, et un test de gabarit qui vérifie sous-total + TVA = total à l'écrit.
- Mesure (2026-10-16, 8ff39d7a, mesureur) : relu `CurrencyFormatter.php:32-49` (`NumberFormatter` DECIMAL, aucun `ROUNDING_MODE`), `InvoiceService.php:58` (`round(…, 2)`), `default.blade.php:106-118` ; `tinker` en lecture, rendu de `pdf.invoices.default` sur une `Invoice` non enregistrée (sous-total 100 025, TVA 18 %) → « Sous-total 100 025 F CFA · TVA (18%) 18 004 F CFA · Total TTC 118 030 F CFA », et `format()` en XOF : 1 250,5 → « 1 250 », 1 251,5 → « 1 252 », 18 004,5 → « 18 004 » (arrondi au pair) ; `git log -S 'ROUND_HALFUP'` → aucun commit de code. Le relevé du bailleur reste à vérifier. Classement : V1, la piste change l'écrit d'un montant de facture, et P04.08 (validé) en traite la cause en base.
- Mesure (2026-10-16, 53575541, implementeur) : avant correctif, `CurrencyFormatter::format()` en XOF rendait 1 250,5 → « 1 250 F CFA » et le gabarit `pdf.invoices.default` (sous-total 100 025, TVA 18 004,5, total 118 029,5) imprimait 100 025 · 18 004 · 118 030 (tests neufs rouges). `ROUNDING_MODE = ROUND_HALFUP` posé dans `CurrencyFormatter` → `test_a_half_rounds_up_like_the_amount_charged` (1 250,5 → 1 251, 18 004,5 → 18 005, 2,125 € → 2,13 €) et `test_invoice_subtotal_and_tax_add_up_to_the_printed_total` (100 025 + 18 005 = 118 030 à l'écrit) verts ; ablation de la ligne → les deux rouges. Le relevé du bailleur reste non mesuré.

### Une quittance trimestrielle ou annuelle n'imprimera que le premier mois de sa période
- Réf : P26.03
- Statut : fait · TCK-834
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/resources/views/pdf/receipts/rent.blade.php:10-13,53-57`
- Constat :
  - La « Période » de la quittance est `period_start->translatedFormat('F Y')`. `period_end` n'est lu par aucun gabarit de quittance (lu ; `grep period_end resources/views/pdf` → seul le relevé du bailleur).
  - Aujourd'hui, chaque échéance couvre un mois (P04.01). La PR #453 (ouverte) fait couvrir à une échéance trimestrielle trois mois, pour trois loyers (`period_end` = fin du 3ᵉ mois, `amount × 3`, lu dans son diff). Elle ne touche pas le gabarit.
  - Une fois fusionnée, une quittance de trimestre dira donc « Période : Janvier 2027 · Loyer acquitté : 3 × le loyer » (déduit, à vérifier après la fusion).
  - La base de dev porte 4 baux trimestriels et 4 annuels (mesuré).
- Piste : imprimer « du … au … » à partir de `period_start` et `period_end` dès que la période dépasse un mois. Le test de quittance porte une échéance trimestrielle.
- Mesure (2026-10-16, 8ff39d7a, mesureur) : relu `rent.blade.php:10-13,53-57` (période = `period_start->translatedFormat('F Y')`) ; `grep -rn period_end resources/views/pdf` → seul `statements/owner.blade.php:19` ; `SELECT` sur `lease_payments` `rent` → 0 échéance sur 3 368 de plus de 32 jours, et `leases` : 4 `quarterly`, 4 `yearly`, 568 `monthly` ; `tinker` en lecture, rendu de `pdf.receipts.rent` avec une échéance non enregistrée du 2027-01-01 au 2027-03-31 → « Période January 2027 ». Le défaut ne se voit qu'une fois la PR #453 fusionnée : aujourd'hui aucune échéance ne couvre plus d'un mois. Classement : V7, la forme de la période imprimée sur une attestation de paiement est un texte d'acte neuf, et dépend de P04.01, encore ouverte.
- Mesure (2026-10-18, b9850853, implementeur) : #453 (P04.01) fusionnée le 2026-10-16 ; reproduit par `QuittancePeriodeTest` avant correctif : échéance du 2027-01-01 au 2027-03-31 → « Janvier 2027 », sans « du … au … ». `rent.blade.php` imprime « du 1 janvier 2027 au 31 mars 2027 » quand `period_end` dépasse `period_start + 1 mois − 1 jour` ; une échéance d'un mois, même du 15 au 14, garde « Octobre 2026 ». Ablation : condition à `false`, les cas trimestriel et annuel rougissent, remis verts ; tests voisins des quittances verts (28 tests).

### La facture PDF n'est atteignable depuis aucun écran ni aucun envoi
- Réf : P26.04
- Statut : fait · TCK-837
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/routes/api/invoices.php:16-17`, `takussan-api/app/Http/Controllers/Api/DocumentPdfController.php:64-80`, `takussan-web/src/components/payments/InvoiceDetailDialog.tsx`
- Constat :
  - `GET /api/invoices/{invoice}/pdf` existe et rend un gabarit qui porte les mentions légales de TCK-594 (lu).
  - Aucun appelant dans `takussan-web/src` : `grep invoices/` ne rend que le détail, l'envoi, le paiement et l'annulation (`lib/queries/payments.ts:167-212`). La modale de détail n'a ni bouton ni lien PDF (mesuré : `grep -i 'pdf\|telecharg\|download'` → rien).
  - Aucun e-mail ne joint de PDF : `grep -rn 'attachData\|->attach(\|Attachment::' app` → seulement des `attach()` de relations (mesuré).
  - `docs/features.md:367` et `:598` promettent la génération et l'export PDF des factures (lu).
  - Établi comment : lu et mesuré par recherche.
- Piste : un bouton de téléchargement dans `InvoiceDetailDialog`, par `BoutonTelechargement` comme la quittance. Un test du composant qui vérifie le chemin `/api/invoices/{id}/pdf`.
- Mesure (2026-10-16, 8ff39d7a, mesureur) : relu `routes/api/invoices.php:16-17` (route `invoices.pdf` présente) ; `grep -rn "invoices/" takussan-web/src` → détail, envoi, paiement, annulation seulement (`lib/queries/payments.ts:167-212`) ; `grep -n -i 'pdf|telecharg|download' InvoiceDetailDialog.tsx` → rien ; `grep -rn 'attachData|->attach(|Attachment::' app` → une seule ligne, un `attach()` de relation (`PropertyConversationResolver.php:92`) ; `docs/features.md:367` et `:598` promettent le PDF des factures, et `TCK-063` (done) laisse non cochée « bouton télécharger PDF si dispo » (`:62`). Classement : V7, un comportement visible neuf, même attendu par un ticket : son emplacement et son public (qui voit la modale, qui passe `InvoicePolicy::view`) restent à décider.
- Mesure (2026-10-18, 41f289014, implementeur) : avant correctif, `grep -rn "invoices/" takussan-web/src` → aucun appelant de `/pdf`, et `InvoiceDetailDialog.pdf.test.tsx` rougit (aucun bouton « PDF de la facture ») ; `InvoiceDetailDialog` porte un `BoutonTelechargement` vers `/api/invoices/{id}/pdf` (`facture-…pdf`, `avoir-…pdf` pour un avoir), la route passant par la même `InvoicePolicy::view` que le détail → 2 verts ; ablation du composant → 2 rouges.

### La facture PDF ne dit pas ce qu'elle facture
- Réf : P26.05
- Statut : fait · TCK-835 — reste : une désignation propre à chaque créateur (indemnité de résiliation, retenue sur caution) quand l'objet facturé est un bail
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/resources/views/pdf/invoices/default.blade.php:10-15`, `takussan-api/app/Http/Controllers/Api/DocumentPdfController.php:72-79`, `takussan-api/app/Services/Lease/EarlyTerminationService.php:338-356`, `takussan-api/app/Services/Lease/DepositRefundService.php:105-124`
- Constat :
  - Le contrôleur ne passe pas `$lines`. Le gabarit retombe donc toujours sur une ligne unique « Prestation × 1 = sous-total » (lu), mesuré dans le rendu de P26.02.
  - Les factures nées du code ont pourtant un objet : l'indemnité de résiliation et la retenue sur caution portent leur libellé dans `notes` (`messages.lease_early_termination_invoice_line`, `messages.deposit_retention_invoice_line`, lu), qui ne s'imprime qu'en bas, sous « Notes ».
  - La table `invoices` n'a ni lignes ni désignation (migration lue) : seule la note dit l'objet.
- Piste : à défaut de lignes, prendre la désignation dans l'objet facturé (`invoiceable`) ou dans une clé de `metadata` posée par le créateur, au lieu de « Prestation ». Un test par créateur qui lise la désignation rendue.
- Mesure (2026-10-16, 8ff39d7a, mesureur) : relu `DocumentPdfController.php:64-80` (aucun `lines` passé), `default.blade.php:10-15` (repli « Prestation × 1 »), `EarlyTerminationService.php:338-356` et `DepositRefundService.php:105-124` (objet porté par `notes` seulement) ; colonnes d'`invoices` lues par `Schema::getColumnListing` en `tinker` → ni lignes ni désignation (`notes`, `metadata` seuls) ; rendu de P26.02 → « Prestation 1 100 025 F CFA ». Classement : V7, la piste laisse le choix entre `invoiceable` et une clé de `metadata`, et le libellé imprimé sur une facture est un texte métier.
- Mesure (2026-10-18, b9850853, implementeur) : reproduit par `FactureDesignationTest` avant correctif : factures sur un bail, sur une réservation, et sans objet avec `metadata.designation` → toutes « Prestation ». `Invoice::designation()` (objet facturé, même supprimé, puis `metadata.designation`) alimente la ligne par défaut du gabarit : « Bail LS-2027-0042 — Villa Almadies », « Réservation BK-0007 — Studio Plateau », « Frais de dossier » ; sans l'un ni l'autre, « Prestation ». Ablation : ligne ramenée à « Prestation », 4 cas sur 5 rougissent, remis verts ; `InvoicePdfTest` et `InvoiceLegalMentionsTest` verts. L'indemnité de résiliation et la retenue sur caution, émises sur le bail, impriment « Bail … » : leur libellé propre reste en `notes`.

### Petites améliorations des gabarits PDF
- Réf : P26.06
- Statut : fait · TCK-836 — reste : libellés des enums (après P06.03) et montant par échéance au contrat
- Gravité : 🟢 amélioration
- Où : `takussan-api/resources/views/pdf/receipts/rent.blade.php:81`, `takussan-api/resources/views/pdf/invoices/default.blade.php:61,112`, `takussan-api/resources/views/pdf/receipts/booking.blade.php:48`, `takussan-api/resources/views/pdf/statements/owner.blade.php:19`, `takussan-api/resources/views/pdf/leases/contract.blade.php:90-107`, `takussan-api/app/Http/Controllers/Api/DocumentPdfController.php:78`
- Constat :
  - **Valeurs d'enum brutes** imprimées : « Méthode bank_transfer » sur la quittance (mesuré au rendu de P26.01), « Statut sent » sur la facture (mesuré au rendu de P26.02), donc « Statut void » sur un avoir (lu), « Type » du reçu de réservation (`$type`, lu). P06.03 traite la langue des gabarits, pas ces valeurs.
  - **Taux de TVA** formaté à l'anglaise : `number_format(…, 2)` puis `rtrim` donne « TVA (18.5%) » pour 18,5 % (lu ; rendu à vérifier).
  - **Période du relevé du bailleur** en dates ISO brutes : « 2026-10-01 — 2026-10-31 » (lu).
  - **Contrat** : pour un bail trimestriel ou annuel, il n'imprime que « Loyer mensuel » et la fréquence, jamais le montant appelé à chaque échéance. Un bail de type `sale` imprime aussi « Loyer mensuel » et caution à côté du prix de vente (lu).
  - **Nom de fichier** : un avoir se télécharge en `facture-….pdf` (lu).
- Piste : des libellés pour les enums imprimés (par la décision de P06.03 sur la langue), `number_format` à la française, des dates formatées, et le montant par échéance au contrat. À trier ligne par ligne.
- Mesure (2026-10-16, 8ff39d7a, mesureur) : rendus de P26.01 et P26.02 → « Méthode bank_transfer », « Statut sent » ; `PaymentReceiptPdf.php:54` passe `payment_type?->value` brut au reçu de réservation (`booking.blade.php:48`) ; `tinker` : `rtrim(rtrim(number_format(18.5, 2), '0'), '.')` → « 18.5 » ; `owner.blade.php:19` imprime `period_start` et `period_end`, posés par `toDateString()` (`OwnerStatementService.php:68`) ; `contract.blade.php:90-107` : « Loyer mensuel » toujours, prix de vente à côté pour un `sale` ; `DocumentPdfController.php:78` : `facture-…` pour un avoir. Les cinq parties tiennent. Classement : V7, chaque partie est un texte d'acte neuf, et la piste les renvoie elle-même à la décision de P06.03 et à un tri ligne par ligne.
- Mesure (2026-10-18, b9850853, implementeur) : reproduit par `GabaritsPdfFormatFrancaisTest` avant correctif : taux de 18,5 % → « TVA (18.5%) » ; relevé d'octobre 2026 → « 2026-10-01 — 2026-10-31 » et reversement « 2026-10-15 ». Taux par `number_format(…, 2, ',', ' ')` → « TVA (18,5%) » (18 % reste « TVA (18%) ») ; période et reversements du relevé en `d/m/Y` → « 01/10/2026 — 31/10/2026 », « 15/10/2026 ». Ablation : gabarits rendus à `pre-dev`, les cas du taux décimal et du relevé rougissent, remis verts ; tests voisins des PDF verts. Le nom de fichier `facture-…` d'un avoir, ni nombre ni date, n'est pas touché.

## Angle 27 — Routeur SMS : double envoi sur un timeout suivi d'un repli

*Exploré le 2026-10-16 sur `pre-dev` b57126b7, par l'explorateur. Relu par l'explorateur lui-même :
`SmsRouterDriver`, les trois pilotes, `SmsChannel`, `SendDeferredSmsJob`, `config/sms.php`,
`routes/api/sms-webhooks.php`, `CloudApiWhatsappDriver`, TCK-102 et `docs/integrations/sms.md`. Aucun
sous-agent. Mesures par un test temporaire (retiré) sur `SmsRouterDriver` avec `Http::fake`, charge
1,40 / 1,71 / 1,88 sur 8 cœurs. Ce qu'un fournisseur réel fait d'une requête coupée par le timeout,
et le format réel d'une réponse Mtarget à plusieurs numéros, ne se mesurent pas depuis le poste.*

### Sans `SMS_WEBHOOK_URL_TOKEN`, LAfricaMobile échoue sur tout SMS rattaché à une notification
- Réf : P27.01
- Statut : fait · TCK-727 — reste : poser `SMS_WEBHOOK_URL_TOKEN` dans Dokploy (porteur)
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Notifications/Sms/Drivers/LAfricaMobileSmsDriver.php:75-76,119-131`, `takussan-api/config/sms.php:174`, `takussan-api/routes/api/sms-webhooks.php:31-33`, `takussan-api/app/Services/Notifications/Sms/SmsRouterDriver.php:166-173`
- Constat :
  - Dès qu'un `notification_id` est présent, le pilote construit le `ret_url` par `URL::temporarySignedRoute('sms.webhook.lafricamobile', …, ['token' => …])`. Cette construction est hors du `try` de l'appel HTTP (lu, l. 75-78).
  - Le jeton vaut `''` par défaut (lu, `config/sms.php:174`), et la route exige le segment `{token}` (lu, `sms-webhooks.php:31`).
  - Mesuré : test temporaire, jeton non posé, `send('+221761234567', …, ['notification_id' => …])`, intégrations LAM et Mtarget actives → tentative 1 `lafricamobile` `failed` / `driver_exception_UrlGenerationException`, tentative 2 `mtarget` `sent`. LAM n'a reçu aucune requête.
  - Toute `CodedNotification` passe un `notification_id` (lu, `CodedNotification.php:230-233`, `SmsChannel.php:84`). Seuls les codes OTP et de step-up, qui n'en ont pas, partent par LAM.
  - Sans Mtarget, le SMS finit en `no_provider_available`, sans journal (voir P11.05).
  - Les clés `SMS_*` sont absentes de l'export de préproduction (lu, `docs/infra/hebergement.md:148`). Le défaut y joue donc dès qu'une intégration LAM existe (déduit, à vérifier).
  - Les tests ne le voient pas : `SmsRouterDriverTest::setUp` pose le jeton (lu, l. 37).
  - Établi comment : lu et mesuré.
- Piste : envoyer sans `ret_url` quand le jeton est vide, avec un `Log::warning` (l'accusé de réception est perdu, pas le SMS) ; ou faire échouer bruyamment au démarrage. Un test du routeur, jeton vide et `notification_id` posé, garde le retour.
- Mesure (2026-10-16, a76d2fe2, mesureur) : relu `LAfricaMobileSmsDriver.php:75-76,119-131` (`ret_url` construit hors du `try`), `config/sms.php:174` (défaut `''`), `sms-webhooks.php:31` (segment `{token}` exigé) ; `git log b57126b7..HEAD` sur ces fichiers → vide ; test temporaire (retiré), jeton vide, `notification_id` posé, LAM et Mtarget actifs → tentative 1 `lafricamobile` `failed` / `driver_exception_UrlGenerationException`, tentative 2 `mtarget` `sent`, 0 requête vers LAM. Le `notification_id` vient de `SmsChannel.php:84` (`resolveAppNotificationId`), pas de `CodedNotification.php`, qui ne le cite plus. `docs/integrations/sms.md:198` fait de la clé un prérequis de déploiement. Classement : V5, le défaut naît d'une variable d'environnement absente, et la piste laisse le choix entre perdre l'accusé et refuser de démarrer.
- Mesure (2026-10-16, 19732e24, implementeur) : test neuf `SmsRouterDriverTest::test_lam_sends_without_return_url_when_webhook_token_is_missing` (jeton vide, `notification_id` posé, LAM seule) rouge avant correctif : `lafricamobile` `failed` / `driver_exception_UrlGenerationException` → `LAfricaMobileSmsDriver` envoie sans `ret_url` et journalise un `Log::warning` ; 17 verts, ablation : le test rougit seul (1 échec sur 17), correctif remis, vert. Le versant jeton posé (`ret_url` présent) est gardé par un second test.

### Un timeout ou une erreur 5xx après acceptation fait partir un second SMS par le fournisseur suivant
- Réf : P27.02
- Statut : fait · TCK-766
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Notifications/Sms/Drivers/OrangeSmsDriver.php:94-105,143-150`, `takussan-api/app/Services/Notifications/Sms/Drivers/LAfricaMobileSmsDriver.php:78-88`, `takussan-api/app/Services/Notifications/Sms/Drivers/MtargetSmsDriver.php:76-87`, `takussan-api/app/Services/Notifications/Sms/SmsRouterDriver.php:175-188`, `takussan-api/app/Services/Notifications/Whatsapp/CloudApiWhatsappDriver.php:82-87`, `takussan-api/app/Notifications/Channels/WhatsappChannel.php:223`
- Constat :
  - Chaque pilote range toute exception HTTP en `failed` (`*_http_exception`), sans distinguer un refus de connexion d'un délai de lecture dépassé (lu). Une réponse 5xx donne aussi `failed` (lu, `OrangeSmsDriver.php:143-150`).
  - Le routeur passe tout `failed` au pilote suivant de la chaîne (lu, l. 185-186). Aucune clé d'idempotence n'est envoyée aux fournisseurs.
  - Mesuré : envoi Orange qui lève `ConnectionException` (« cURL error 28 ») → résultat `lafricamobile` `sent` ; Orange en 502 → résultat `lafricamobile` `sent`. Si Orange avait accepté avant la coupure, le destinataire reçoit deux SMS, et les deux sont facturés (déduit, à vérifier : le comportement réel d'Orange sur une requête coupée n'est pas mesurable ici).
  - Dans ce cas, le plafond de 3 SMS par jour d'Orange n'est pas incrémenté (lu, l. 182-184). La tentative Orange n'a pas de `provider_message_id`, donc son accusé de réception ne trouve aucune ligne (lu, `appendAttempt`).
  - Même schéma d'un canal à l'autre : un timeout WhatsApp donne `whatsapp_http_exception`, puis un repli SMS (lu).
  - Le repli immédiat sur timeout est prescrit : TCK-102:82 dit « Driver throw HTTP / timeout / code erreur provider → fallback immédiat ». Ce choix ne pèse ni le doublon ni le double coût.
  - Établi comment : lu et mesuré (test temporaire).
- Piste : distinguer l'échec sûr (connexion refusée, 4xx) de l'échec ambigu (délai de lecture, 5xx). Un échec ambigu ne passerait pas au fournisseur suivant pour un message non critique : statut `unknown`, réconcilié par l'accusé de réception ou le puller. Choix à faire pour les codes OTP. Un test par pilote garde le classement.
- Mesure (2026-10-16, a76d2fe2, mesureur) : relu `OrangeSmsDriver.php:94-105,143-150`, `SmsRouterDriver.php:175-188`, TCK-102:82 ; test temporaire (retiré) → Orange qui lève `ConnectionException` (« cURL error 28 ») : résultat `lafricamobile` `sent` ; Orange en 502 : résultat `lafricamobile` `sent`. Le doublon côté fournisseur reste non mesurable depuis le poste. Classement : V7, la piste renverse un comportement prescrit par TCK-102 (« timeout → fallback immédiat ») et laisse ouvert le traitement des OTP.
- Mesure (2026-10-17, d3380eb58, implementeur) : avant correctif, `AmbiguousSmsFailureTest` → Orange en « cURL error 28 » ou en 502, LAfricaMobile en délai dépassé et Mtarget en 503 passent tous au pilote suivant (4 rouges) → drapeau `ambiguous` sur `SmsResult` et `WhatsappResult` (délai dépassé, 5xx), la chaîne s'arrête pour le numéro sauf `is_otp` (posé par `PhoneVerificationService`, `DeletionStepUpService` et `LeaseSignatureCodeNotification`), et WhatsApp ne se replie plus en SMS sur un échec ambigu ; connexion refusée et 4xx se replient toujours ; ablation : routeur et `WhatsappChannel` remis → 6 rouges, drapeaux `is_otp` retirés → 1 rouge ; correctif remis : 366 tests verts sur `Services/Sms`, `Services/Whatsapp`, `Auth/Phone`, `AccountDeletionStepUpTest`, `LeaseSignatureTest`, `Notifications`. Quatre tests existants qui prenaient un 500 pour un refus passent en 400.

### Une exception levée après l'acceptation d'un fournisseur fait renvoyer le SMS
- Réf : P27.03
- Statut : fait · TCK-767
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Notifications/Sms/Drivers/OrangeSmsDriver.php:153`, `takussan-api/app/Services/Notifications/Sms/Drivers/LAfricaMobileSmsDriver.php:107`, `takussan-api/app/Services/Notifications/Sms/Drivers/MtargetSmsDriver.php:112`, `takussan-api/app/Services/Notifications/Sms/SmsRouterDriver.php:166-179,239-268`, `deploy/takussan/compose.api.yml:55`
- Constat :
  - Chaque pilote écrit `last_used_at` sur l'intégration **après** les envois, hors de tout `try` (lu). Si cette écriture lève, le routeur range tout le lot en `failed` / `driver_exception_*`, y compris les numéros déjà acceptés, et les passe au pilote suivant (lu, l. 166-173).
  - `appendAttempt` (transaction, `lockForUpdate`, `create`) est hors du `try` du routeur (lu, l. 179). S'il lève après un `sent`, l'exception sort de `SmsChannel`. Le job de notification est alors rejoué (`--tries=3`, lu, `compose.api.yml:55`) et renvoie le SMS depuis le début de la chaîne (déduit, à vérifier).
  - Une violation de l'index unique `(provider, provider_message_id)` suffirait à lever ici, par exemple un fournisseur qui réutilise un identifiant (déduit, à vérifier).
  - Établi comment : lu.
- Piste : sortir `last_used_at` du chemin d'envoi (ou l'entourer d'un `try`), et rendre l'écriture de la tentative non bloquante pour un SMS déjà accepté (journal d'erreur, pas d'exception). Un test qui fait lever l'écriture de la tentative après un `sent` garde le retour.
- Mesure (2026-10-16, a76d2fe2, mesureur) : relu `SmsRouterDriver.php:166-188,239-268` et les `forceFill(['last_used_at' …])->save()` hors `try` (`OrangeSmsDriver.php:153`, `LAfricaMobileSmsDriver.php:107`, `MtargetSmsDriver.php:112`) ; test temporaire (retiré) : `Integration::saving` qui lève sur `last_used_at` après un `push_id` LAM rendu → tentative 1 `lafricamobile` `failed` / `driver_exception_RuntimeException`, tentative 2 `mtarget` `sent` (le doublon est donc mesuré, plus déduit) ; `push_id` LAM déjà présent sur une autre notification → `UniqueConstraintViolationException` sortie du routeur. Le rejeu du job par `--tries=3` reste déduit (`compose.api.yml:54`, et non 55). Classement : A1, le routeur arrête déjà la chaîne sur un succès (`isTerminalSuccess`, l. 181-187) et le défaut viole ce contrat sans choix de produit.
- Mesure (2026-10-17, d3380eb58, implementeur) : avant correctif, `SmsAcceptedThenErrorTest` → `Integration::saving` qui lève sur `last_used_at` après un `push_id` LAM : résultat `mtarget` (renvoi) ; `push_id` LAM déjà enregistré ailleurs : `UniqueConstraintViolationException` sortie du routeur → `Integration::markUsed()` qui journalise sans lever (pilotes SMS et WhatsApp Cloud), `appendAttempt()` sous `try` ; ablation : routeur remis → 1 rouge, pilotes et modèle remis → 1 rouge ; correctif remis : 2 verts, 241 tests verts sur `Services/Sms`, `Services/Whatsapp` et 20 classes qui créent des intégrations.

### La chaîne de repli peut durer plus longtemps que le délai du worker, qui tue le job et le rejoue
- Réf : P27.04
- Statut : fait · TCK-842 — reste : le délai du worker, au déploiement (porteur)
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Notifications/Sms/Drivers/OrangeSmsDriver.php:66,98,111,120,215-225,245`, `takussan-api/config/sms.php` (`fallback_chains`), `deploy/takussan/compose.api.yml:55`, `takussan-api/app/Services/Auth/PhoneVerificationService.php:383`
- Constat :
  - Chaque appel HTTP a `timeout(10)`. Sur un numéro Orange, le pire cas enchaîne : verrou OAuth (attente 5 s), jeton (10 s), envoi (10 s), 401 puis rafraîchissement (5 + 10 s), renvoi (10 s), LAM (10 s), Mtarget (10 s). Soit environ 70 s (lu ; somme non mesurée).
  - Le worker ne pose pas `--timeout` (lu, `compose.api.yml:55`), donc 60 s par défaut ; `CodedNotification` ne déclare ni `$timeout` ni `$tries` (lu, `grep`). Un job tué en cours de chaîne est rejoué (`--tries=3`) et repart d'Orange : un fournisseur qui a déjà accepté renvoie (déduit, à vérifier).
  - Les codes OTP partent de façon synchrone dans la requête HTTP (lu, `PhoneVerificationService.php:383`) : l'utilisateur attend toute la chaîne. Le délai du serveur web et de Traefik n'a pas été relevé.
  - Établi comment : lu, somme des délais déduite.
- Piste : borner la durée totale de la chaîne (budget de temps partagé entre pilotes), et poser `$timeout` sur les notifications SMS au-dessus de ce budget. Le délai du worker est une affaire de déploiement.
- Mesure (2026-10-16, a76d2fe2, mesureur) : relu `OrangeSmsDriver.php:98,120,218-220,245` (`timeout(10)` par appel, verrou 10 s attendu 5 s), `config/sms.php` (`orange` → `orange, lafricamobile, mtarget`), `compose.api.yml:54` (`queue:work … --tries=3`, sans `--timeout`, ligne 54 et non 55), `grep` sur `CodedNotification.php` → ni `$timeout` ni `$tries` ; `PhoneVerificationService.php:383` envoie l'OTP de façon synchrone. Somme des délais et mise à mort du job non mesurées. Classement : V5, le délai du worker est dans `deploy/`, et le budget partagé est un choix de conception.
- Mesure (2026-10-18, e673632a0, implementeur) : `SmsChainTimeBudgetTest`, code à usage unique sur un numéro Orange, chaque appel consommant tout son délai (horloge avancée par le faux HTTP) → avant correctif, jeton, envoi en 401, jeton, renvoi en 400, LAM en délai dépassé, Mtarget : 6 appels de 10 s, 60 s, et aucun job SMS ne déclare `$timeout` (2 rouges) → `SmsTimeBudget` (30 s par traversée), aucun pilote ni appel lancé sans temps, chaque appel borné au temps restant, `$timeout = 50` sur `CodedNotification`, `NewBookingNotification` et `SendDeferredSmsJob` : la chaîne finit à 30 s en `time_budget_exhausted` ; ablation : `app/` remis → 2 rouges, pilotes seuls remis → 1 rouge (40 s) ; correctif remis : 3 verts, 295 tests verts sur `Services/Sms`, `Services/Whatsapp` et `tests/Unit/Services`.

### Petites améliorations du routeur SMS
- Réf : P27.05
- Statut : fait · TCK-784 — reste : reprendre le compteur de tentatives à la dernière enregistrée après les heures calmes, et mettre le renvoi Orange après 401 sous le même `try`
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Notifications/Sms/SmsRouterDriver.php:115,219`, `takussan-api/app/Services/Notifications/Sms/Drivers/OrangeSmsDriver.php:117-121`, `takussan-api/app/Services/Notifications/Sms/Drivers/MtargetSmsDriver.php:89-109`
- Constat :
  - **Numéro de tentative répété après les heures calmes.** `deferAll` écrit la tentative 1 `router` / `quiet_hours`. Au réveil, `walkChain` repart d'un compteur à 0 et écrit une seconde tentative 1 (lu ; mesuré : tentatives `[1 router deferred, 1 lafricamobile failed, 2 mtarget sent]` pour une même notification). `AppNotification::deliveryAttempts` trie sur `attempt` (lu, `AppNotification.php:68`).
  - **Renvoi Orange après 401 hors `try`.** Le second `post` (l. 117-121) n'est pas protégé : une exception sort du pilote, sans le `Log::warning` des autres chemins. Elle est rangée `driver_exception_ConnectionException` par le routeur (lu ; mesuré : 401 puis timeout → deux appels Orange, résultat `lafricamobile` `sent`).
  - **Mtarget lit `results[0]` pour tout le lot.** Le code et le ticket d'un lot viennent du premier élément (l. 90-91). Mesuré : réponse `[{code 0}, {code -3}]` pour deux numéros → les deux `sent`. Le format réel de la réponse Mtarget à plusieurs numéros n'est pas vérifié, et aucun appelant n'envoie aujourd'hui plus d'un numéro (lu : `SmsChannel`, `WhatsappChannel`, `PhoneVerificationService`, `DeletionStepUpService`).
  - Établi comment : lu et mesuré (test temporaire).
- Piste : reprendre le compteur à la dernière tentative enregistrée ; mettre le renvoi après 401 sous le même `try` ; lire le résultat par numéro chez Mtarget, ou n'envoyer qu'un numéro par appel.
- Mesure (2026-10-16, a76d2fe2, mesureur) : test temporaire (retiré) → heures calmes puis envoi avec `bypass_quiet_hours` : tentatives `[1 router deferred_to_fallback, 1 lafricamobile failed, 2 mtarget sent]` ; Orange 401 puis `ConnectionException` au renvoi (`OrangeSmsDriver.php:117-121`, hors `try`) : 2 appels d'envoi, résultat `lafricamobile` `sent` ; Mtarget `results` `[{code 0}, {code -3}]` pour deux numéros → les deux `sent` (`MtargetSmsDriver.php:90-91`). Les trois parties tiennent. Classement : V7, la partie Mtarget laisse deux options sur un format fournisseur non vérifié ; les deux premières seraient A1 si on les séparait.
- Mesure (2026-10-17, 0f8959c99, implementeur) : `MtargetOneNumberPerCallTest` avant correctif → deux numéros partent en un appel (`msisdn` en liste), et la réponse `-3` du second n'est pas la sienne (1 rouge) → un appel par numéro (`array_chunk(…, 1)`), chaque résultat lu dans sa propre réponse. Ablation : pilote remis → 1 rouge ; remis → vert, et 65 tests de `Services/Sms` verts. Les deux autres points de la piste ne sont pas faits (reste).

## Angle 28 — Cache des pages publiques par langue

*Exploré le 2026-10-16 sur `pre-dev` aa45a57f, par l'explorateur, seul (aucun sous-agent). Relu : les
lectures partagées du front (`public-property.ts`, `facettes.ts`, `sitemap-catalogue.ts`, route BFF
`api/maintenance/status`), `apiFetch` (`api.ts:99-138`), la clé du cache de données de Next 16.3.1
(`node_modules/next/dist/server/lib/incremental-cache/index.js:213-290` : les en-têtes de la requête
entrent dans la clé, `Accept-Language` compris), et toutes les réponses de l'API qui portent un
`Cache-Control: public` (`grep -rn "Cache-Control\|cache.headers" routes app/Http`). Ce qui tient sans
défaut, et n'a donc pas d'entrée : la fiche (`getProperty`) passe la langue en `Accept-Language`, que la
clé de Next sépare ; les domaines de facettes et le sitemap ne portent aucun libellé ; `discovery` émet
`Vary: Accept-Language, Authorization`, gardé par `CataloguePublicCacheTest` ; `search` est en
`no-cache` + ETag calculé sur le corps ; `/api/enums/{key}` et `/api/maintenance/status` rendent les
trois langues dans un même corps ; le cache Laravel `search:suggest:types:{locale}` porte la langue.
Mesures par tests temporaires, retirés, sur la base de test ; charge 1,69 sur 8 cœurs. Le
comportement d'un cache partagé (Cloudflare, Traefik) devant `api.takussan.com` n'a pas été observé.*

### `/api/search/suggest` est servie `public, max-age=60` sans `Vary: Accept-Language`, alors que son corps change avec la langue
- Réf : P28.01
- Statut : fait · TCK-707 — reste : la garde générale qui rejouerait chaque route à `Cache-Control: public` sous deux langues et exigerait des corps identiques ou un `Vary: Accept-Language`
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Controllers/Api/Search/SuggestController.php:16-23`, `takussan-api/app/Services/Search/SuggestService.php:200-225`, `takussan-api/tests/Feature/Api/Search/SearchSuggestTest.php:226-233`, `takussan-web/src/hooks/useSuggest.ts:20-28`
- Constat :
  - Le contrôleur pose `Cache-Control: public, max-age=60` et aucun `Vary` (lu, l. 23). Le groupe `property_types` porte un libellé traduit par `trans()` dans la langue de la requête (lu, `SuggestService.php:222`).
  - Mesuré : test temporaire, un bien publié de type `apartment`, `GET /api/search/suggest?q=ap&limit=10` sous `Accept-Language` `fr`, `en`, `wo` → trois corps distincts (`Appartement`, `Apartment`, `Appart` ; md5 `31a267a9…`, `f8ce5fd3…`, `5a133324…`), tous en `max-age=60, public`, `Vary: Origin` seul (posé par CORS).
  - L'appelant est le navigateur, sur une URL qui ne porte pas la langue : `useSuggest` appelle `/api/search/suggest?q=…&limit=10` (lu, `useSuggest.ts:20-28`). La clé React Query porte la langue, pas l'URL : après un changement de langue, la même saisie redemande la même URL, et un cache HTTP sans `Vary` peut rendre le corps de l'autre langue pendant 60 s (sémantique HTTP, à vérifier au navigateur).
  - C'est le défaut que TCK-341 a corrigé sur `discovery` et qu'il décrit dans le commentaire de `PublicPropertyController.php:336-362` (« trois corps distincts servis `public, s-maxage=300` sous UNE seule entrée de cache »). `suggest` ne l'a pas reçu.
  - Le seul test sur l'en-tête vérifie `public` et `max-age=60` (lu, `SearchSuggestTest.php:226-233`) : il serait vert avec le défaut.
  - Établi comment : lu et mesuré (test temporaire).
- Piste : ajouter `Vary: Accept-Language` à la réponse, sans écraser le `Origin` de CORS (même forme que `discovery`). Garder par un test sur le modèle de `CataloguePublicCacheTest` : deux langues, deux corps distincts, et `Accept-Language` présent dans `Vary`. Une garde plus large rejouerait chaque route à `Cache-Control: public` sous deux langues et exigerait des corps identiques ou un `Vary: Accept-Language`.
- Mesure (2026-10-16, af610be5, mesureur) : relu `SuggestController.php:23` (`Cache-Control: public, max-age=60`, aucun `Vary`) et `SuggestService.php:222` (`trans()` dans la langue de la requête) ; `git log -S` et `grep -rn` dans `docs/backlog/tickets` sans correctif (seul `PublicPropertyController.php:362` pose `Vary: Accept-Language, Authorization`) ; test temporaire retiré, un bien `apartment` publié, `GET /api/search/suggest?q=ap&limit=10` sous `fr`, `en`, `wo` (charge 2,41 sur 8 cœurs) → trois corps distincts (`Appartement`, `Apartment`, `Appart` ; md5 `31a267a9…`, `f8ce5fd3…`, `5a133324…`), tous `max-age=60, public` avec `Vary: Origin` seul ; le constat tient en entier, lignes inchangées. Classement : A1, le comportement attendu est écrit par TCK-341 et le commentaire de `PublicPropertyController.php:336-362` (un corps qui change avec la langue sous `public` porte `Vary: Accept-Language`), et le correctif (ajouter `Accept-Language` au `Vary` sans écraser `Origin`, plus un test à deux langues) ne demande aucun choix de produit.
- Mesure (2026-10-16, 8350d37f, implementeur) : test neuf `SearchSuggestTest::test_suggest_varie_avec_la_langue_et_le_declare_sans_chasser_origin`, avant correctif, un bien `apartment` publié, `q=ap&limit=10` sous `fr` et `en` avec `Origin` → corps distincts, `public`, `Vary: Origin` seul (rouge) ; correctif `->header('Vary', 'Accept-Language')` dans `SuggestController` → `Vary` porte `Accept-Language` et `Origin` (vert) ; ablation (en-tête retiré) → rouge sur la même assertion, remis → vert, `SearchSuggestTest` 13 verts. La garde générale sur toutes les routes `public` n'est pas faite.

### `/api/enums/{key}` rend à tout anonyme le compte de tous les biens par valeur, brouillons et biens privés compris, et n'a aucun appelant hors de la console
- Réf : P28.02
- Statut : validé — retirer `usage_count` de la lecture publique ; la route reste
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/routes/api/enums.php:6-8`, `takussan-api/app/Http/Controllers/Api/PublicBusinessEnumController.php:13-16`, `takussan-api/app/Services/Admin/BusinessEnumService.php:29-55`, `:213-231`
- Constat :
  - La route n'a que le groupe `api` et `cache.headers:public;max_age=300;etag` : ni `auth`, ni le limiteur `public-read` du groupe `public.*` (mesuré : `php artisan route:list --path=api/enums -v`).
  - `get()` ajoute à chaque valeur un `usage_count`, compté sur toute la table `properties`, sans filtre de visibilité ni d'agence (lu, `BusinessEnumService.php:224-228`).
  - Mesuré : test temporaire, un bien `villa` publié et deux en brouillon, `GET /api/enums/property_type` anonyme → 200, `usage_count: 3` pour `villa` (le catalogue public en compte 1). Les quatre clés (`property_type`, `contract_type`, `title_type`, `rent_period`) comptent sur `Property` (lu, `EditableBusinessEnums.php:23-41`).
  - Aucun appelant dans le front hors de la console super-admin, qui passe par ses propres chemins (`takussan-web/src/lib/queries/super-admin.ts:707-721`) (mesuré : `grep -rn "enums" takussan-web/src`). Le corps est le même dans les trois langues (même md5 en `fr` et `en`) : il n'y a pas ici de défaut de cache par langue.
  - Établi comment : lu et mesuré (test temporaire).
- Piste : retirer `usage_count` de la lecture publique (`activeOnly: true` est déjà le chemin public), ou retirer la route si aucun appelant n'est prévu. Un test : la lecture anonyme ne porte pas `usage_count`. Voir l'angle 66 pour la question de qui lit ces valeurs.
- Mesure (2026-10-16, af610be5, mesureur) : `php artisan route:list --path=api/enums -v` → groupe `api` et `SetCacheHeaders:public;max_age=300;etag` seuls, ni `auth` ni limiteur ; relu `BusinessEnumService.php:50` (`usage_count`) et `:213-231` (`usageCounts`, `whereIn` sur toute la table, sans filtre de visibilité) ; test temporaire retiré, un `villa` publié et deux passés en `draft`, `GET /api/enums/property_type` anonyme → 200, `max-age=300, public`, `usage_count: 3` pour `villa` contre 1 bien `public()`, même md5 en `fr` et `en` ; `grep -rn enums takussan-web/src` → seuls les chemins `/api/super-admin/enums/…` et des libellés, aucun appelant de la route publique hors `BusinessEnumTest.php:27` ; le constat tient. Classement : V7, la piste propose deux correctifs (retirer `usage_count` de la lecture publique, ou retirer la route) et renvoie à l'angle 66 sur qui doit lire ces valeurs, ce qui est un choix de produit.

## Angle 29 — Langue des destinataires sans compte

*Exploré le 2026-10-16 sur `pre-dev` 39b5fd85, par l'explorateur, seul (aucun sous-agent). Relu :
`InvitationService` (`send`, `deliver`, `remindPending`, `preferredLocale`), les quatre services
d'invitation par rôle et la cooptation super-admin, `InvitationMailable`, `ContactSansCompte` et ses
sept appelants, `NotificationService::send()` pour un contact, `PropertyVisitController::store`,
`ContactLeadService`, `RecordPublicSearchAlert`, `Application::setLocale()` du framework, et côté
front `apiRequest` (`api.ts:620-665`) et les actions publiques de `actions/property.ts`. Ce qui tient
sans défaut, et n'a donc pas d'entrée : la demande de contact et la demande de visite publiques
enregistrent la langue de la page (`apiRequest` la transmet en `Accept-Language`, repli serveur
`getLocale()`), et leurs envois la relisent ; l'abonné aux alertes publiques porte sa `locale`
validée (`AlertSubscriber implements HasLocalePreference`) ; l'avis à l'ancien numéro prend la
langue du compte. Mesures par test temporaire, retiré, sur la base de test ; charge 1,72 sur
8 cœurs. La valeur d'`APP_LOCALE` en préproduction n'a pas été lue (hors du poste) : `.env.example`
déclare `fr`, `config/app.php:83` replie sur `en`.*

### Une invitation sans compte part dans la langue de l'invitant, et sa relance J+2 dans celle du processus : deux langues pour la même invitation
- Réf : P29.01
- Statut : fait · TCK-728
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Invitation/InvitationService.php:946-966`, `:517-538`, `:1000-1012`, `takussan-api/app/Mail/InvitationMailable.php:19-22`, `takussan-api/app/Services/Notifications/ContactSansCompte.php:17-18`, `:75-78`
- Constat :
  - `preferredLocale()` rend `$user?->preferred_language`, sinon `metadata.locale`, sinon `config('app.locale')` (lu, l. 1009-1011). Le docblock présente `metadata.locale` comme un « caller hint », et `InvitationMailable` dit que la langue est « set explicitly by the caller » (lu).
  - Aucun appelant n'écrit `metadata.locale` : `OwnerInvitationService.php:103-107`, `AgentInvitationService.php:106-109`, `ServiceProviderInvitationService.php:142-158` et `SuperAdminCooptationService.php:73-81` passent prénom, nom et drapeaux seulement (lu ; `grep -rn "'locale'" app` ne rend aucune écriture vers une invitation).
  - Pour un destinataire sans compte, la langue retombe donc sur `config('app.locale')`, que `Application::setLocale()` réécrit à chaque requête (lu, `vendor/laravel/framework/src/Illuminate/Foundation/Application.php:1603-1611`). Le premier envoi suit la langue négociée de l'**invitant** ; la relance, jouée par `invitations:remind` hors requête, suit la langue du processus.
  - Mesuré : test temporaire, `POST /api/agencies/{id}/owners/invite` sous `Accept-Language: en` puis `wo` → `InvitationMailable` envoyés en `locale=en` et `locale=wo`, `metadata` = `{first_name, last_name, owner_type}` ; `remindPending()` joué ensuite sous la langue de processus `fr` → les deux relances en `locale=fr`. Même invitation par numéro seul (`auth.phone_login.enabled`) sous `en` → `CodedNotification` routée vers `sms`/`whatsapp` en `locale=en`.
  - Ce SMS est adressé à un `ContactSansCompte`, dont le docblock pose la règle « jamais la langue du processus (`app()->getLocale()`), qui est celle de l'acteur ou du worker » (lu, l. 17-18 ; même règle dans ADR-0032 § 3, l. 109-110). `fromInvitation()` reçoit cette langue telle quelle (l. 72-79).
  - Aucun test ne fixe la langue d'une invitation (mesuré : `grep -rln locale tests | xargs grep -li invitation` → aucun test d'invitation).
  - Accessoire : `CreateInvitationRequest.php:75` accepte `metadata` libre, donc un `metadata.locale` non validé passerait tel quel à `Mail::locale()` (lu, à vérifier).
  - Établi comment : lu et mesuré (test temporaire).
- Piste : écrire la langue résolue dans l'invitation à sa création (`metadata.locale` ou colonne), et la relire à l'envoi comme à la relance, pour qu'une invitation ait une seule langue. Le choix de cette langue (celle de l'invitant, `fr` explicite comme `ContactSansCompte::DEFAULT_LOCALE`, ou un champ du formulaire) reste à trancher. Garder par un test : invitation créée sous `en`, relance jouée sous `fr` → même langue des deux côtés.
- Mesure (2026-10-16, b14cd410, mesureur) : relu `InvitationService.php:946-966` (`deliver` résout la langue par `preferredLocale()`), `:1008-1012` (`preferred_language`, sinon `metadata.locale`, sinon `config('app.locale')`), `:517-538` (`remindPending` rappelle `deliver`) ; `grep -rn "'locale'" app/Services app/Http/Requests | grep -i invit` → la seule lecture de `InvitationService.php:1011`, aucune écriture ; `CreateInvitationRequest.php:75` accepte toujours `metadata` comme tableau libre ; test temporaire retiré (charge 1,27 sur 8 cœurs), deux `POST /api/agencies/{id}/owners/invite` sous `Accept-Language: en` puis `wo`, puis `remindPending()` sous `fr` trois jours plus tard → `InvitationMailable` en `en` et `wo` à l'envoi, `fr` et `fr` à la relance, `metadata` = `{first_name, last_name, owner_type}` ; la voie SMS n'a pas été rejouée, elle passe par le même `deliver()` (lu) ; le constat tient. Classement : V7, la piste laisse ouvert le choix de la langue à écrire (celle de l'invitant, `fr` explicite ou un champ de formulaire), et le stockage en colonne toucherait V4.
- Mesure (2026-10-16, 19732e24, implementeur) : avant correctif, `InvitationLocaleTest` (neuf) rouge sur ses trois cas : `metadata.locale` nul après deux `POST /api/agencies/{id}/owners/invite` sous `en` et `wo` et après une invitation par numéro sous `en`, et relance d'une ligne sans `metadata.locale` partie en `en` sous `app.locale = en` → `send()` écrit `metadata.locale = fr` (`ContactSansCompte::DEFAULT_LOCALE`) et `preferredLocale()` replie sur `fr` au lieu de `config('app.locale')` ; envois et relances jouées sous `en` partent tous en `fr`, 3 verts ; ablation de l'écriture → 2 rouges, du repli → 1 rouge ; `php bin/impacted-tests.php --run` → 658 verts.

### Une visite créée par l'agent pour un client sans compte enregistre la langue de l'agent, et le même client reçoit ses rappels de loyer en français
- Réf : P29.02
- Statut : validé — `fr` (`DEFAULT_LOCALE`), puis la langue de la fiche client une fois P29.03 faite
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/PropertyVisitController.php:190`, `takussan-api/app/Services/Notifications/ContactSansCompte.php:38-47`, `:57-67`, `takussan-api/app/Services/Visit/VisitNotifier.php:197`
- Constat :
  - Sur la route de l'agent (`POST /api/property-visits`), la visite d'un client sans compte enregistre `'locale' => $visitor?->preferredLocale() ?? app()->getLocale()`, soit la langue négociée de l'agent (lu, l. 190).
  - `fromVisit()` relit cette `locale` pour tout envoi au visiteur (lu, l. 65) : confirmation, replanification, annulation et rappels de visite partent dans la langue de l'agent.
  - Le même client, rattaché à un bail, est servi par `fromCustomer()`, qui pose `fr` explicitement à défaut de compte (lu, l. 44). Un client sans compte reçoit donc ses visites dans la langue de l'agent et ses relances de loyer en français.
  - TCK-590 (l. 226-227) écrit « celle enregistrée sur la visite / le lead pour un anonyme » : pour une demande publique, c'est la langue de la page du visiteur ; pour une visite saisie par l'agent, ce n'est celle du visiteur que par hasard (lu).
  - Établi comment : lu. L'envoi effectif dans la langue de l'agent n'a pas été rejoué (à vérifier).
- Piste : sur la route de l'agent, enregistrer `ContactSansCompte::DEFAULT_LOCALE` à défaut de compte, comme `fromCustomer()`, ou la langue de la fiche client si P29.03 en crée une. Garder par un test : visite créée sous `Accept-Language: en` pour un client sans compte → `locale` = `fr`.
- Mesure (2026-10-16, b14cd410, mesureur) : relu `PropertyVisitController.php:190` (`'locale' => $visitor?->preferredLocale() ?? app()->getLocale()` dans `planForCustomer`) et `ContactSansCompte.php:38-47`, `:57-67` ; test temporaire retiré, agent de l'agence, `POST /api/property-visits` avec une fiche client sans compte sous `Accept-Language: en` → 201, `property_visits.locale = en`, `ContactSansCompte::fromVisit()` → `en`, `fromCustomer()` de la même fiche → `fr` ; l'envoi SMS lui-même n'a pas été rejoué, mais il prend la langue de `fromVisit()` (lu) ; le constat tient. Classement : V7, la piste propose deux langues cibles (`fr` explicite, ou celle d'une fiche client que P29.03 créerait), et une langue négociée par l'agent peut être un choix voulu.

### Un client sans compte ne peut rien recevoir dans une autre langue que le français : la fiche client ne porte pas de langue
- Réf : P29.03
- Statut : validé — langue facultative sur la fiche client, migration et champ de formulaire
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Models/Customer.php:55-64`, `takussan-api/app/Services/Notifications/ContactSansCompte.php:38-47`, `docs/adr/0032-l-api-n-ecrit-plus-de-prose.md:109-111`
- Constat :
  - `customers` n'a aucune colonne de langue (mesuré : `grep -n "locale\|lang"` sur les migrations qui créent ou modifient `customers` → rien ; `$fillable` sans langue, lu l. 55-64).
  - `fromCustomer()` rend la langue du compte lié, sinon `fr` (lu, l. 44). C'est un choix écrit par ADR-0032 § 3, et TCK-588:114 note que « `Customer` ne porte ni langue ni consentement » (lu) : ce n'est pas un défaut.
  - Effet : un locataire anglophone ou wolophone saisi par l'agence reçoit avis de retard, quittances par SMS et rappels en français, sans que l'agence puisse rien y changer (déduit des appelants `SendLeasePaymentReminders.php:174` et `SendRentReceiptAfterOnlinePayment.php:44`).
  - Établi comment : lu.
- Piste : une langue facultative sur la fiche client (`in:fr,en,wo`), saisie par l'agence et relue par `fromCustomer()` avant le repli `fr`. Elle servirait aussi P29.02. Migration et champ de formulaire neufs : choix de produit.
- Mesure (2026-10-16, b14cd410, mesureur) : `grep -ln "'customers'" database/migrations/* | xargs grep -n "locale\|lang"` → aucune colonne de langue sur `customers` (seule touche : `property_contact_leads`) ; `Customer.php:55-64` `$fillable` sans langue ; `ContactSansCompte.php:44` rend `user?->preferredLocale() ?? 'fr'` ; le constat tient, comme amélioration et non comme défaut (ADR-0032 § 3). Classement : V4 et V7, la piste demande une migration autre qu'un index et un champ de formulaire neuf.

## Angle 30 — Équipements du catalogue : traduction par slug, renommage et fusion

*Exploré le 2026-10-16 sur `pre-dev` 11df6a87, par l'explorateur, seul (aucun sous-agent). Relu :
`TagCatalog`, `TagProposals`, `TagModeration` (`renommer`, `fusionner`), `TagController::index`
et `update`, `GeoReferentialController::amenities`, `PropertyResource` (bloc `tags`),
`Property::toSearchableArray` et `config/scout.php`, ADR-0062 § 7 ; côté front
`libelle-equipement.ts` et son test, `libelle-equipement-par-nom.ts`, `ChampEquipements`,
`combobox.tsx`, `PropertyAmenities`, `amenity-icons.ts`, `compare-rows.ts`, `CustomerTagPicker`,
`CustomerListFilters`. Ce qui tient, et n'a pas d'entrée : les six écrans publics et le formulaire
traduisent les équipements du catalogue par leur slug, une proposition en attente reste telle que
saisie, et un test rougit sur un équipement sans ses trois traductions ; l'API n'émet aucun nom
d'équipement dans un e-mail, un SMS ou un PDF (`grep tags` sur `app/Mail`, `app/Notifications`,
`resources/views` → rien). Mesures : un test temporaire, retiré, sur la base de test (charge 2,33
sur 8 cœurs) ; `SELECT` et `Property::search()` en lecture par `tinker` sur la base et l'index de
développement (35 équipements approuvés, 1 proposition, 802 documents indexés). Rien n'a été lu en
préproduction : on ne sait pas si un équipement du catalogue y a déjà été renommé ou fusionné.*

### Renommer un équipement du catalogue ne change rien à l'écran, et le déploiement suivant recrée l'ancien nom sous un slug sans traduction
- Réf : P30.01
- Statut : fait · TCK-729
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Tags/TagModeration.php:59-78`, `takussan-api/app/Http/Controllers/Api/TagController.php:77-86`, `takussan-api/app/Services/Tags/TagCatalog.php:68-81`, `takussan-web/src/lib/libelle-equipement.ts:31-34`
- Constat :
  - `renommer()` n'écrit que `name` (lu, l. 70) ; le slug reste celui du nom d'origine. Les deux routes y mènent : `PATCH /api/admin/tags/{tag}` (file de modération) et `PUT /api/tags/{tag}`, que le commentaire désigne comme « la page catalogue » (lu, `TagController.php:81-85`).
  - Le front traduit tout équipement approuvé par son slug, en français comme ailleurs (lu, `libelle-equipement.ts:33` ; `fr.json` `property.amenityCatalog.piscine` = « Piscine »). Un équipement du catalogue renommé s'affiche donc sous l'ancien libellé dans les trois langues : le renommage n'a aucun effet visible hors de la console.
  - `synchroniser()` cherche chaque nom du catalogue par son nom (lu, l. 70). Le nom d'origine n'existe plus : il est recréé, et `slugLibre()` lui donne `<slug>-2`, que les fichiers de traduction ne connaissent pas.
  - Mesuré (test temporaire) : catalogue chargé, `PATCH /api/admin/tags/{Piscine}` `{name: "Piscine privée"}` → 200, slug `piscine` ; `synchroniser()` rejoué → deux lignes approuvées, `Piscine privée|piscine` et `Piscine|piscine-2`. Effet à l'écran (déduit de `libelleEquipement`) : en français, deux options « Piscine » dans le formulaire et la recherche ; en anglais, « Swimming pool » et « Piscine ».
  - À vérifier : une recherche sauvegardée `tags=Piscine` (le filtre porte des noms, `PropertySearchService.php:552-559`) ne trouverait plus les biens du tag renommé, réindexés sous « Piscine privée » : l'alerte se tairait.
- Piste : décider ce qu'est un renommage d'équipement du catalogue. Soit le refuser (409, comme un nom pris) et ne renommer que les propositions ; soit faire suivre le catalogue (le nom versionné se compare aussi au slug, pour ne pas recréer). Garder par un test : renommer puis rejouer `synchroniser()` → une seule ligne pour ce slug.
- Mesure (2026-10-16, 4c7d8810, mesureur) : aucun commit depuis 11df6a87 sur `app/Services/Tags`, `TagController.php` ni `libelle-equipement.ts` (`git log`), aucun ticket (`grep -rln` dans `docs/backlog/tickets`) ; relu `TagModeration::renommer()` (n'écrit que `name`), `TagCatalog::assurer()` (cherche par nom, `slugLibre()` à la création), `libelleEquipement()` (traduit par slug) ; test temporaire retiré (charge 1,58 sur 8 cœurs) : catalogue chargé, `PATCH /api/admin/tags/{Piscine}` → 200 slug `piscine`, `PUT /api/tags/{id}` → 200 slug `piscine`, `synchroniser()` rejoué → `Piscine chauffée|piscine|approved ; Piscine|piscine-2|approved` ; le constat tient, l'alerte de recherche sauvegardée n'a pas été rejouée. Classement : V7, la piste laisse le choix entre refuser le renommage d'un équipement du catalogue et faire suivre le catalogue.
- Mesure (2026-10-16, 71b58ea4, implementeur) : avant correctif, test temporaire retiré : catalogue chargé, `PATCH /api/admin/tags/{Piscine}` `{name: "Piscine privée"}` → 200, puis `synchroniser()` → `Piscine privée|piscine|approved ; Piscine|piscine-2|approved` ; le constat tient → `TagCatalogRenommageTest` (4 cas : file de modération et page catalogue → 409 `tags.catalog_rename_forbidden`, une seule ligne `Piscine|piscine` après `synchroniser()` ; nom du catalogue à la casse près refusé ; proposition toujours renommable), 3 rouges sans la garde de `renommer()` (ablation), 4 verts avec.

### Une fusion qui absorbe un équipement du catalogue est défaite au déploiement suivant
- Réf : P30.02
- Statut : validé — refuser en 422 la fusion dont la source est un équipement du catalogue ; pas de trace de fusion
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Tags/TagModeration.php:80-120`, `takussan-api/app/Services/Tags/TagCatalog.php:17-21`, `:68-81`
- Constat :
  - `fusionner()` accepte pour source tout équipement non refusé et sans liaison hors des biens, catalogue compris, puis le supprime (lu, l. 97 et 113).
  - `tags:sync-catalog`, joué à chaque déploiement, recrée tout nom du catalogue absent (lu, l. 72-79). Le docblock protège un refus (« un refus de modération ne se défait pas par déploiement », l. 21) ; rien ne protège une fusion.
  - Mesuré (test temporaire) : `POST /api/admin/tags/{Ventilateurs}/merge` `{into_id: Climatisation}` → 200 ; `synchroniser()` rejoué → `Ventilateurs` existe de nouveau, approuvé, sous un nouvel identifiant et sans bien. La fusion voulue par la modération est défaite, et l'équipement fusionné revient dans les listes.
  - Aucun test ne fusionne puis resynchronise (lu, `TagCatalogTest.php`, cinq tests).
- Piste : refuser en 422 la fusion d'une source du catalogue (`in_array($src->name, TagCatalog::EQUIPEMENTS)`), ou garder une trace de la fusion que `synchroniser()` respecte, comme pour un refus. Garder par un test : fusionner puis synchroniser.
- Mesure (2026-10-16, 4c7d8810, mesureur) : relu `TagModeration::fusionner()` (aucune exclusion du catalogue, la source est supprimée) et `TagCatalog::assurer()` (recrée tout nom absent) ; test temporaire retiré : catalogue chargé, `POST /api/admin/tags/{Ventilateurs}/merge` `{into_id: Climatisation}` → 200, source supprimée ; `synchroniser()` rejoué → `Ventilateurs` recréé sous l'id 82 (ancien 71), approuvé, 0 bien ; le constat tient. Classement : V7, la piste propose deux comportements de modération (422 sur une source du catalogue, ou trace respectée par la synchronisation), et la trace demanderait un stockage neuf (V4).

### Un équipement ajouté au catalogue prend `<slug>-2` quand une proposition détient déjà son slug, et ne se traduit jamais
- Réf : P30.03
- Statut : validé — réserver les slugs du catalogue : suffixe d'office pour une proposition, et synchroniser() reprend le slug exact à une proposition non approuvée qui le détient
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Tags/TagCatalog.php:57-66`, `:73-77`, `takussan-api/app/Services/Tags/TagProposals.php:64-72`, `takussan-web/src/lib/__tests__/libelle-equipement.test.ts:58-62`
- Constat :
  - Deux noms distincts pour l'index `tags_name_lower_unique` peuvent avoir le même slug : la ponctuation et les accents sortent du slug, pas du repli de casse (lu, `CaseInsensitive` : ICU sans `unaccent`). Une proposition « Forage ! » ou « Fibre optique. » prend ainsi le slug d'un équipement du catalogue.
  - Si la proposition existe avant que le catalogue n'ajoute ce nom, `slugLibre()` donne `forage-2` à l'équipement du catalogue (lu, l. 60-63).
  - Mesuré (test temporaire) : proposition `Forage !` en attente (slug `forage`), puis `synchroniser()` → `Forage|forage-2|approved`. Le front cherche `amenityCatalog.forage-2`, absent : l'équipement du catalogue s'affiche « Forage » en anglais. Si la proposition est approuvée plus tard, c'est elle qui prend la traduction « Borehole » (déduit de `libelleEquipement`).
  - Le test du front calcule le slug à partir du nom (`slugDuCatalogue`) ; il ne voit pas le slug réellement écrit en base (lu, l. 58-62).
- Piste : réserver les slugs du catalogue. `slugLibre()` refuserait à une proposition un slug calculé depuis `TagCatalog::EQUIPEMENTS` (suffixe d'office), et `synchroniser()` reprendrait le slug exact s'il est détenu par une proposition. Garder par le test ci-dessus, inversé.
- Mesure (2026-10-16, 4c7d8810, mesureur) : relu `TagCatalog::slugLibre()` (suffixe `-n` au premier slug pris) et `TagProposals::proposer()` (même `slugLibre()`) ; test temporaire retiré : proposition `Forage !` en attente, slug `forage`, puis `synchroniser()` → `Forage !|forage|pending ; Forage|forage-2|approved` ; le constat tient, l'affichage en anglais est déduit de `libelleEquipement()` (lu, `libelle-equipement.ts:31-34`), non rejoué. Classement : V4, que `synchroniser()` reprenne le slug détenu par une proposition réécrit des lignes existantes, et le suffixe d'office change le slug qu'une proposition reçoit.

### La recherche plein texte ne connaît les équipements qu'en français : « swimming pool » rend 0 bien, « piscine » 52
- Réf : P30.04
- Statut : retenu · à valider — V7 : indexer des libellés anglais, et choisir leur source unique ; porteur (2026-10-16) : plus tard, avec la source unique des libellés et TCK-339
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Models/Property.php:476-479`, `takussan-api/config/scout.php:184-187`
- Constat :
  - Le document indexé porte `tags` = les noms en base, en français (lu, `Property.php:479`) ; `tags` est un attribut cherchable (lu, `scout.php:186`). Les traductions du catalogue n'existent que dans `takussan-web/src/messages/*.json` : l'API ne peut pas les indexer.
  - Mesuré (`tinker`, index de développement) : `Property::search()` → `piscine` 52, `swimming pool` 0, `pool` 0 ; `climatisation` 57, `air conditioning` 0.
  - Le choix d'indexer un vocabulaire français est écrit pour les types et contrats (`Property.php:234-262`, alias français, wolof en attente de validation) ; rien n'est écrit pour l'anglais. La fiche, la recherche et les filtres sont pourtant servis en anglais.
- Piste : un champ dérivé `amenities_label` (ou l'extension de `tags`) qui porte aussi les libellés anglais du catalogue, ce qui suppose de les rendre lisibles par l'API (copie versionnée, ou génération depuis `en.json`). Le wolof attend la validation de TCK-339, comme les types. Choix de produit et de source unique des libellés.
- Mesure (2026-10-16, 4c7d8810, mesureur) : relu `Property::toSearchableArray()` (`tags` = noms en base) et `config/scout.php` (`tags` cherchable) ; `tinker` en lecture sur l'index de développement, `Property::search()` → `piscine` 52, `swimming pool` 0, `pool` 0, `climatisation` 57, `air conditioning` 0 ; le constat tient. Classement : V7 et V6, la piste demande un choix de produit (recherche en anglais) et une source unique des libellés partagée entre front et API.

### 26 équipements du catalogue sur 35 s'affichent avec l'icône générique
- Réf : P30.05
- Statut : validé — clés d'icônes alignées sur les slugs du catalogue, icône Lucide la plus proche, revue à la PR ; un test rougit sur un slug du catalogue sans icône
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/amenity-icons.ts:23-60`, `.../PropertyAmenities.tsx:19`
- Constat :
  - L'icône se cherche par `tag.icon ?? tag.slug` (lu, `PropertyAmenities.tsx:19`). Aucune ligne de `tags` n'a d'`icon` (mesuré : `SELECT type, status, count(icon)` → 0 sur 41), et le catalogue n'en pose pas (lu).
  - Mesuré (script `node` sur les slugs du catalogue face aux clés de `AMENITY_ICONS`) : 9 slugs ont une icône (`piscine`, `climatisation`, `ascenseur`, `parking`, `garage`, `terrasse`, `jardin`, `wifi`, `tv`) ; 26 retombent sur `Building2`, dont `cuisine-equipee`, `securite-247`, `salle-de-sport`, `machine-a-laver`, `groupe-electrogene`.
  - Une partie des clés ne correspond à aucun slug du catalogue : `cuisine`, `securite`, `salle_sport`, `buanderie`, `internet`, `meuble` (lu).
- Piste : clés d'icônes alignées sur les slugs du catalogue, et un test qui rougit sur un slug du catalogue sans icône (même lecture du fichier PHP que `libelle-equipement.test.ts`). Le choix des icônes est un choix de design.
- Mesure (2026-10-16, 4c7d8810, mesureur) : relu `PropertyAmenities.tsx:19` (`tag.icon ?? tag.slug`) et `amenity-icons.ts` ; `SELECT type, status, count(*), count(icon) FROM tags GROUP BY 1,2` en lecture sur la base de développement → 0 icône sur 41 lignes ; script `node` des slugs de `TagCatalog::EQUIPEMENTS` face aux clés de `AMENITY_ICONS` → 9 sur 35 ont une icône (`piscine, climatisation, ascenseur, parking, garage, terrasse, jardin, wifi, tv`), 26 retombent sur `Building2` ; le constat tient. Classement : V7, aligner les clés demande de choisir 26 icônes.

### Petites améliorations
- Réf : P30.06
- Statut : validé — les quatre correctifs, un ticket chacun : étiquettes CRM traduites par slug, options retriées sur le libellé affiché, otherTagNames par le même traducteur, nom tapé égal à un libellé traduit résolu vers l'équipement ; en wo, le texte français tel quel (wolof en pause depuis le 2026-10-16)
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Tags/TagCatalog.php:40`, `takussan-web/src/components/customer-dashboard/CustomerTagPicker.tsx:152`, `:258`, `takussan-web/src/components/customer-dashboard/CustomerListFilters.tsx:214`, `takussan-api/app/Http/Controllers/Api/TagController.php:33`, `takussan-api/app/Http/Controllers/Public/GeoReferentialController.php:27`, `:49`, `takussan-web/src/components/compare/compare-rows.ts:63-68`, `takussan-api/app/Services/Tags/TagProposals.php:46`
- Constat :
  - Les cinq étiquettes CRM du catalogue (`VIP`, `Prospect chaud`, `Étranger`, `Famille`, `Étudiant`) s'affichent par leur nom en base dans les trois langues : `CustomerTagPicker` et `CustomerListFilters` rendent `tag.name` (lu), et aucun message ne les traduit (mesuré : `grep -i 'prospect' src/messages/en.json` → rien). ADR-0062 § 7 ne traite que des équipements.
  - L'ordre des listes d'équipements est celui du nom français (`defaultSort('name')`, `orderByRaw(name COLLATE "und-x-icu")`, lu), et ni `ChampEquipements` ni la combobox ne retrient après traduction (lu). Mesuré (script `node`) : en anglais, la liste commence par « Playground · Lift · Balcony · Security cameras · Staff quarters · Water heater… ». Le comparateur, lui, trie sur le libellé affiché (lu, `compare-rows.ts:56`).
  - Le comparateur rend les étiquettes qui ne sont pas des équipements par leur nom brut (`otherTagNames`, lu).
  - Un anglophone qui tape « Pool » ou « Generator » se voit proposer « Ajouter » à côté de l'équipement traduit (`combobox.tsx:56-58` compare au libellé affiché, lu). Le serveur ne replie que sur les noms français (`TagProposals::parNom`, lu) : le nom anglais devient une proposition en attente, doublon d'un équipement existant que la modération doit fusionner (déduit, à vérifier).
- Piste : traduire les étiquettes CRM du catalogue par slug comme les équipements (même fonction, autre espace de clés) ; retrier les options sur le libellé affiché ; passer `otherTagNames` par le même traducteur. Pour la saisie libre, que le front résolve un nom tapé égal (au repli près) à un libellé traduit vers l'identifiant de l'équipement avant de l'envoyer en `tag_names`.
- Mesure (2026-10-16, 4c7d8810, mesureur) : relu `CustomerTagPicker.tsx:152`, `:155` et `CustomerListFilters.tsx:214` (rendent `tag.name`), `TagController.php:33` (`defaultSort('name')`), `GeoReferentialController.php:27` (tri `und-x-icu`), `ChampEquipements.tsx:51` (traduit sans retrier), `compare-rows.ts:63-68` (`otherTagNames` rend `tag.name`), `combobox.tsx:56-58` (compare au libellé affiché) ; `grep -i prospect src/messages/en.json` rend 14 lignes, contrairement au constat, mais aucune ne traduit l'étiquette « Prospect chaud » ; la proposition d'un nom anglais en doublon n'a pas été rejouée et reste à vérifier ; les trois premiers points tiennent. Classement : V7 et V8, traduire les étiquettes CRM est un texte métier neuf, et l'entrée réunit quatre correctifs indépendants.

## Angle 31 — Passage axe au navigateur sur les parcours publics

*Exploré le 2026-10-16 sur `pre-dev` 7abe36d, par l'explorateur. Tout a été lancé et relu par
l'explorateur lui-même, sans sous-agent. Montage : `next dev` de l'arbre de l'explorateur (port
3199) devant un **faux API** local qui rend des réponses réelles, prises une fois en lecture dans
le processus (`tinker`, `CACHE_STORE=array`, `Request::create` en `GET` sur la base de dev) ; Chrome
sans tête piloté par CDP, `axe-core` 4.13.0 du `node_modules` du front injecté, règles `wcag2a`,
`wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` et `best-practice`, à 1280 et 390 px. Pages passées :
accueil, recherche, fiche bien, index et fiche d'agence, index des agents, comparateur, favoris,
mentions légales, les cinq pages `/auth/*`, `/invitations/accept`, `/maintenance`. **Limites** :
l'API réelle n'a pas tourné (elle aurait écrit dans la base de dev : compteur de vues, jetons de
connexion), les photos de la base de dev sont absentes, et **l'espace connecté (`/app`) n'a pas été
passé** : il demandait de relancer le faux API, et la garde refuse l'arrêt d'un processus. Le
contraste n'est pas tranché par axe : il rend `color-contrast` « incomplete » sur 631 nœuds de
l'accueil et 104 de la recherche, tous « overlapped by another element » — le lien étiré
`a.absolute.inset-0` de `LienDeCarte` couvre chaque carte (mesuré par `elementsFromPoint`). Un
calcul maison sur les styles calculés s'est trompé sur le texte posé sur photo : aucun constat de
contraste n'en est tiré. Sous `prefers-reduced-motion: reduce` émulé, l'accueil ne garde aucune
animation (mesuré), rien n'est donc ajouté à P07.11.*

### Le champ de recherche de la barre ne montre aucun focus au clavier, et pointe vers une liste absente
- Réf : P31.01
- Statut : fait · TCK-731
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/search/SearchAutocomplete.tsx:226-262`, `:266-268`
- Constat :
  - Atteint au clavier (deux Tab sur `/fr/legal/privacy`, `:focus-visible` vrai), l'`input` et ses trois parents gardent exactement le même `box-shadow`, `outline`, fond et bordure qu'avant le focus (mesuré : instantané des styles calculés avant et après, sur Chrome sans tête). Le focus est donc invisible : c'est le « rendu du focus à vérifier » de P07.06, tranché.
  - `aria-controls={listboxId}` est posé sur le `div` `combobox` (l. 230) et sur l'`input` (l. 244) en permanence, alors que l'élément `id={listboxId}` n'est rendu que si `open` (l. 266-268) (lu).
  - axe rend `aria-valid-attr-value` (impact « critical ») sur cet `input` sur chaque page publique à 1280 px : accueil, recherche, fiche, agences, agents, comparateur, favoris, mentions légales (mesuré : `aria-controls="…H1_"` invalide). À 390 px la barre n'affiche pas le champ, et la règle ne sort pas (mesuré).
  - Établi comment : axe et instantané CDP sur `next dev`, code relu.
- Piste : voir P07.06, qui porte le libellé, le motif ARIA 1.2 et le `focus-within:` de la pilule. Ce constat y ajoute : n'émettre `aria-controls` que lorsque la liste est montée (ou la monter vide et masquée), et garder par un test de rendu qui vérifie que tout `aria-controls` et `aria-activedescendant` du composant vise un `id` présent, fermé comme ouvert.
- Mesure (2026-10-16, 979edb0f, mesureur) : relu `SearchAutocomplete.tsx` : `aria-controls={listboxId}` sur le `div` `combobox` (l. 230) et sur l'`input` (l. 244) sans condition, `id={listboxId}` rendu seulement sous `{open && …}` (l. 266-268), `outline-none` sur l'`input` (l. 259) et aucune classe `focus`/`focus-within` sur la pilule (l. 231-235) ; `git log --oneline 7abe36d..979edb0f -- takussan-web` → aucun commit, le code mesuré par l'explorateur est inchangé ; axe et l'instantané CDP non rejoués (pas de navigateur dans ce passage), la référence vide se lit dans le code → tient. Classement : A4 et A5, attribut ARIA conditionné au montage de la liste et test de rendu des `id` visés, sans texte ni design neuf ; l'anneau de focus reste porté par P07.06 (déjà `retenu · autonome`), à traiter dans le même ticket.
- Mesure (2026-10-16, 56aed2b1, implementeur) : reproduit avant correctif par `SearchAutocomplete.aria.test.tsx` : fermé, `div[aria-controls]` et `input[aria-controls]` visent un `id` absent (« _r_1_ »), aucun `input` de rôle combobox, aucune classe de focus sur la pilule → `aria-controls` posé liste ouverte seulement, `aria-activedescendant` seulement si l'option est rendue, anneau `focus-within:ring-2 ring-ring` (contour `primary-foreground` sur la barre de la console) et, en barre de bureau, `has-[input:focus-visible]:ring-2` sur la pilule visible ; ablation : 9 rouges sur 9 sans le correctif, 1 rouge (`aria-activedescendant` pendant un chargement) sans le seul garde de l'option, 1 rouge dans `Navbar.responsive.test.tsx` sans le changement de `Navbar.tsx` ; 61 fichiers de `components/{search,home,layout}` verts. axe non rejoué (pas de navigateur).

### La fiche d'un bien n'a aucun repère `<main>`, dans aucun de ses quatre états
- Réf : P31.02
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/[locale]/(public)/properties/[slug]/page.tsx:170-211`, `[slug]/not-found.tsx:16-38`, `[slug]/bien-retire.tsx:52`, `[slug]/PropertyDetailContent.tsx:134`
- Constat :
  - La page rend `<Navbar />`, `<NavbarSpacer />`, le corps puis `<Footer />`, sans `<main>` autour du corps (l. 205-211) ; même forme pour le bien retiré (l. 172-178), le bien indisponible (corps = un `div`, l. 150-155) et `not-found.tsx` (un `div`, l. 20) (lu). `PropertyDetailContent` commence par un `div` (l. 134) (lu).
  - axe sur la fiche : `landmark-one-main` et `region` sur 89 nœuds à 1280 px, 90 à 390 px (mesuré). Les autres pages publiques passées (accueil, recherche, agences, agents, légales, comparateur, favoris) ont leur `<main>` et ne sortent pas la règle (mesuré).
  - La fiche est aussi la page où le clavier traverse le plus de barre : 18 Tab (logo, recherche, Louer, Acheter, neuf types, favoris, langue, connexion, publier) avant le fil d'Ariane (mesuré). Sans `<main>` ni lien d'évitement (P31.04), un lecteur d'écran n'a pas de saut vers le contenu, hors des titres.
  - Établi comment : axe et parcours au Tab par CDP, code relu.
- Piste : envelopper le corps des quatre états dans `<main>` (dans `page.tsx` et `not-found.tsx`, pas dans `PropertyDetailContent`, pour ne pas en rendre deux). Garde : un test qui rend chaque `page.tsx` publique et `not-found.tsx` et compte exactement un `main`, ou une garde statique sur les pages qui montent `Navbar`.
- Mesure (2026-10-16, 979edb0f, mesureur) : relu `[slug]/page.tsx` : branche retirée (l. 172-178) et rendu final (l. 205-211) en `<>` `Navbar`/`NavbarSpacer`/corps/`Footer` sans `<main>`, `bienIndisponible()` rend un `div` (l. 152) ; `not-found.tsx:20` un `div` ; `bien-retire.tsx:53` un `div` ; `PropertyDetailContent.tsx:134` un `div` ; `grep -n "<main"` sur le dossier `[slug]` et sur `(public)/layout.tsx` et `app/layout.tsx` → 0 ligne ; aucun commit sur `takussan-web` depuis 7abe36d ; axe non rejoué → tient. Classement : A4, repère `<main>` ajouté autour du corps des quatre états, sans rendu visuel ni texte neuf, avec un test qui compte un seul `main`.

### Les pages d'authentification n'ont pas de repère `<main>`
- Réf : P31.03
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/(auth)/layout.tsx:58-138`
- Constat :
  - `AuthPanneau` rend une grille de `div` ; le formulaire est dans `div.w-full.max-w-md` (l. 125), sans `<main>`, et aucun `page.tsx` de `(auth)/auth/` n'en ajoute (lu ; `grep -rn "<main" "src/app/(auth)"` hors tests → 0 ligne, mesuré).
  - axe : `landmark-one-main` et `region` (6 à 15 nœuds) sur `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password` et `/auth/verify-email`, à 1280 px, et sur `/auth/login` à 390 px (mesuré).
  - Établi comment : axe, code relu.
- Piste : `<main>` sur le panneau du formulaire (l. 97), le panneau visuel restant hors du repère. Même garde que P31.02.
- Mesure (2026-10-16, 979edb0f, mesureur) : relu `(auth)/layout.tsx` : le panneau du formulaire est un `div` (l. 97) et le formulaire est dans `div.w-full.max-w-md` (l. 125) ; `grep -rn "<main" "src/app/(auth)"` → 0 ligne, tests compris ; les cinq `page.tsx` de `(auth)/auth/` n'en rendent pas ; aucun commit sur `takussan-web` depuis 7abe36d ; axe non rejoué → tient. Classement : A4, le `div` du panneau devient `<main>` sans changement visuel ni texte neuf.

### Aucun lien d'évitement hors de la console super-admin
- Réf : P31.04
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/layout/SuperAdminShell.tsx:83-91,102-107`, `takussan-web/src/components/layout/AppShell.tsx:120`, `takussan-web/src/components/home/Navbar.tsx`
- Constat :
  - Le seul lien « Aller au contenu principal » du front est celui de `SuperAdminShell` (l. 83-91), qui vise un `<main tabIndex={-1}>` (l. 102-107) ; `grep -rn "skipToContent\|focus:not-sr-only" src` ne rend que ce fichier et les trois dictionnaires (lu).
  - Sur le site public, le premier Tab va au logo, puis 17 autres traversent la barre avant le contenu (mesuré sur l'accueil et la fiche). `AppShell` rend un `<main>` sans `id` ni `tabIndex` (l. 120), sans lien d'évitement devant la barre latérale (lu ; non passé au navigateur, cf. en-tête).
  - Le libellé existe déjà en trois langues sous `nav.superAdmin.skipToContent` (lu, `fr.json:190`) ; il est rangé dans l'espace de la console.
  - Établi comment : parcours au Tab par CDP, code relu.
- Piste : le même lien en tête de `Navbar` (ou du layout public) et d'`AppShell`, vers un `<main id tabIndex={-1}>`, avec le libellé déplacé vers un espace commun (`common`), sans texte neuf. Le test d'AC3 de `SuperAdminShell` sert de modèle.
- Mesure (2026-10-16, 979edb0f, mesureur) : `grep -rn "skipToContent\|focus:not-sr-only" src` → seuls `SuperAdminShell.tsx:88-90`, son test `SuperAdminShell.a11y.test.tsx:111` et la clé `nav.superAdmin.skipToContent` des dictionnaires (`fr.json:190`, `en.json:190`) ; `AppShell.tsx:120` rend `<main className=…>` sans `id` ni `tabIndex` ; `Navbar.tsx` n'a pas de lien d'évitement ; le parcours au Tab n'a pas été rejoué → tient. Classement : A4, le motif (lien `sr-only` révélé au focus vers un `<main id tabIndex={-1}>`) et son libellé existent déjà en trois langues, il se recopie dans la barre publique et `AppShell` avec la clé déplacée vers un espace commun, sans texte neuf.

### Des niveaux de titre sautés : pied de page en `h4`, cartes en `h3` sous le `h1`
- Réf : P31.05
- Statut : validé — pied de page en `h2`, et un `h2` `sr-only` au-dessus des grilles de résultats et de l'index des agences ; garde : `heading-order` d'axe ; en `wo`, le texte français tel quel
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/components/home/Footer.tsx:183,216`, `takussan-web/src/components/property/cards/PropertyCardStandard.tsx:74`, `PropertyCardListing.tsx:82`, `PropertyCardCover.tsx:88`, `PropertyCardCompact.tsx:65`, `takussan-web/src/components/public/index/ProfileCard.tsx:93`
- Constat :
  - Les colonnes du pied de page sont des `h4` (l. 183, et `pied-legal` en `sr-only` l. 216) (lu). Sur les pages dont le contenu n'a qu'un `h1` (mentions légales, CGU, agents, comparateur et favoris vides), axe rend `heading-order` sur `#pied-discover` (mesuré).
  - Sur la recherche (1280 et 390 px), le titre de la première carte est un `h3` qui suit directement le `h1` de la liste ; même règle sur la première carte de `/fr/agencies`, dont le titre est le `h3` de `ProfileCard.tsx:93` sous le `h1` d'`IndexDeProfils.tsx:109` (mesuré, puis lu).
  - Établi comment : axe, code relu.
- Piste : `h2` pour les colonnes du pied de page ; un `h2` (au besoin `sr-only`) au-dessus de la grille de résultats et de l'index des agences, ou les titres de carte au niveau que leur conteneur appelle. Garde : la règle `heading-order` d'axe dans le test de rendu de ces pages.
- Mesure (2026-10-16, 979edb0f, mesureur) : relu `Footer.tsx:183` et `:216` (`h4`), `h3` dans `PropertyCardStandard.tsx:74`, `PropertyCardListing.tsx:82`, `PropertyCardCover.tsx:88`, `PropertyCardCompact.tsx:65` et `ProfileCard.tsx:93`, `h1` dans `IndexDeProfils.tsx:109` ; les cartes sont montées aussi par `ApercuAnnonce.tsx`, `PropertyRow.tsx` et `PortfolioTabs.tsx`, où leur niveau dépend d'autres titres ; axe non rejoué → tient. Classement : V7, le pied de page en `h2` est mécanique, mais l'ordre des titres des cartes demande soit un titre de section neuf (texte), soit un niveau de carte qui vaut pour tous ses conteneurs.

### Les six pages d'authentification portent le même titre d'onglet
- Réf : P31.06
- Statut : validé — libellés d'onglet courts et neufs (Connexion, Inscription, Mot de passe oublié, Nouveau mot de passe, Vérification de l'e-mail) ; en `wo`, le texte français tel quel ; un test par page
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/app/(auth)/layout.tsx:27-35`, `takussan-web/src/messages/fr.json:500-503`, `takussan-web/src/app/(auth)/auth/*/page.tsx`
- Constat :
  - Le layout déclare un modèle `title.template = "%s — Takussan"` et un défaut « Authentification — Takussan » (lu). Aucune des pages `login`, `register`, `forgot-password`, `reset-password`, `verify-email` n'exporte `metadata` ni `generateMetadata` (lu : `grep -c` → 0 pour chacune ; `login/page.tsx` est `'use client'`).
  - Les cinq pages passées au navigateur ont toutes le titre « Authentification — Takussan » (mesuré). Le modèle n'est jamais rempli, et un lecteur d'écran ou un historique ne distingue pas « Connexion » de « Mot de passe oublié ».
  - Établi comment : `document.title` relevé par CDP, code relu.
- Piste : un `layout.tsx` serveur par page d'auth (ou un `generateMetadata` dans un `page.tsx` serveur qui monte le composant client) qui remplit le modèle par le titre déjà affiché dans le formulaire, sans texte neuf. Garde : un test qui vérifie que chaque page de `(auth)/auth/` fournit un titre.
- Mesure (2026-10-16, 979edb0f, mesureur) : relu `(auth)/layout.tsx:27-35` (`generateMetadata` qui ne pose que `template` « %s — Takussan » et `default` « Authentification — Takussan », `fr.json:500-503`) ; `grep -c "Metadata"` → 0 dans les cinq `page.tsx` de `auth/*`, dans `verify-email/[id]/[hash]/page.tsx` et dans `oauth/[provider]/callback/page.tsx`, toutes `'use client'` pour les cinq premières ; les titres de formulaire existants sont `auth.login.title` « Content de vous revoir », `auth.register.title` « Créez votre compte », `auth.forgotPassword.title`, `auth.resetPassword.title`, `auth.verifyEmail.title` ; `document.title` non relevé → tient (le titre « six pages » compte sept pages sans titre propre). Classement : V7, reprendre le titre du formulaire donnerait « Content de vous revoir — Takussan » à la connexion, et nommer la page autrement est un texte neuf.

### Petites améliorations
- Réf : P31.07
- Statut : validé — `min-h-6` et soulignement permanent sur les deux liens de `PropertyAgentCard`, titre de l'invitation par le modèle commun
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyAgentCard.tsx:94-112`, `takussan-web/src/app/invitations/accept/page.tsx:19`
- Constat :
  - Fiche bien : les liens vers l'agent et l'agence mesurent 82 × 17 et 108 × 18 px, l'un au-dessus de l'autre ; axe rend `target-size` (WCAG 2.5.8) sur les deux (mesuré à 1280 px). Ils ne se distinguent du texte voisin que par la graisse et au survol (`hover:underline`, lu).
  - `/invitations/accept` a pour titre « Accepter une invitation », sans le suffixe « — Takussan » des autres pages (mesuré) : `generateMetadata` y rend `t('metaTitle')` seul (lu, l. 19).
  - Établi comment : axe et `document.title` par CDP.
- Piste : `min-h-6` (24 px) et un soulignement permanent ou décalé sur les deux liens de `PropertyAgentCard` ; le titre de l'invitation par le modèle commun.
- Mesure (2026-10-16, 979edb0f, mesureur) : relu `PropertyAgentCard.tsx:94-112` : liens `LienLocalise` vers l'agent (`hover:underline`, sans hauteur minimale) et l'agence (`min-w-0 truncate hover:underline`) ; `invitations/accept/page.tsx:17-19` : `generateMetadata` rend `t('metaTitle')` seul (« Accepter une invitation ») et `invitations/layout.tsx` ne pose aucun `template` (`grep -rn template src/app/invitations` → 0), alors que `(public)/layout.tsx:52` pose « %s — Takussan » ; la taille des cibles n'a pas été remesurée → les deux points tiennent. Classement : V7, le titre de l'invitation est mécanique (A4), mais agrandir et souligner en permanence les liens de la carte change son dessin.

## Angle 33 — Poids JS des routes publiques

*Exploré le 2026-10-17 sur `pre-dev` eb6aee73, par l'explorateur, seul (aucun sous-agent). Deux
`next build` de production (Turbopack, `takussan-web/`, charge 6 à 11 sur 8 cœurs : les temps ne
valent rien, les octets si), l'un sur l'arbre tel quel, l'autre avec `<ChatWidget />` remplacé par
`() => null` dans `src/app/layout.tsx` (ablation, retirée depuis). Le JS initial d'une route est
l'union des `entryJSFiles` de son `page_client-reference-manifest.js` (racine, frontières d'erreur,
layouts, page ; `global-error` intégré exclu) et des `rootMainFiles` de `build-manifest.json`,
compressés en gzip niveau 9 par Node ; les polices viennent de `.next/server/next-font-manifest.json` ;
l'attribution par paquet vient de `next experimental-analyze -o`. **Le réseau 3G n'a pas été
simulé** : `next start` demande l'API (absente pendant le passage), et la charge RSC du document
(dictionnaire, ADR-0022) n'est pas comptée ici. Les durées citées sont des calculs, pas des mesures.*

### Quatre polices que seul `/playground` lit sont préchargées sur toutes les routes, Geist n'étant lue nulle part
- Réf : P33.01
- Statut : fait · TCK-742
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/layout.tsx:2`, `takussan-web/src/app/layout.tsx:24-29`, `takussan-web/src/app/layout.tsx:89`, `takussan-web/src/app/[locale]/(public)/playground/playground.css:117-126`, `takussan-web/src/components/playground/TypographySwitcher.tsx:14-15`
- Constat :
  - Le layout racine déclare six familles `next/font/google` (Geist, Manrope, Inter, Bricolage Grotesque, DM Sans, Fraunces), toutes avec le préchargement par défaut, et pose leurs six variables sur `<html>` (lu).
  - `globals.css:297-300` ne lit que « DM Sans » et « Bricolage Grotesque » (lu). `grep -rn "font-geist\|font-manrope\|font-inter\|font-fraunces" src` ne rend que `playground.css` et `TypographySwitcher.tsx` ; `--font-geist` n'est lue par aucun fichier (mesuré).
  - Mesuré : `next-font-manifest.json` → les **139** routes de l'application préchargent les mêmes **7** fichiers woff2, **257 Kio**. Rapprochés des `@font-face` du CSS émis : Geist 28,6 Kio, Manrope 24,0, Inter 47,3, Fraunces 44,6 + 35,7, soit **180 Kio préchargés sans usage** hors `/playground` ; Bricolage 40,3 et DM Sans 36,1 sont les seuls utiles.
  - Un `preload` de police part avec la priorité haute, en concurrence avec le JS et le CSS de la page. Calcul, non mesuré : à 1,6 Mbit/s, 180 Kio coûtent près d'une seconde de liaison.
  - P18.06 est `validé` pour retirer `/playground` des environnements déployés ; ce retrait ne retire pas les déclarations du layout racine, qui resteraient alors sans aucun lecteur.
- Piste : ne garder au layout racine que Bricolage Grotesque et DM Sans ; déclarer Manrope, Inter et Fraunces dans un layout ou une page propre à `/playground` (ou `preload: false`), retirer Geist. Garde : un test qui lit `layout.tsx` et refuse une famille dont la variable n'est lue par aucun CSS ni composant hors `playground`.
- Mesure (2026-10-17, ec405f7a, mesureur) : relu `src/app/layout.tsx:2,24-29,89` : six familles `next/font/google` sans option `preload`, leurs six variables posées sur `<html>` ; `grep -rn 'font-geist\|font-manrope\|font-inter\|font-fraunces' src` hors layout ne rend que `playground.css:115-126`, `TypographySwitcher.tsx:14-15` et le double de `metadata-base.test.ts:36-41` ; `globals.css:297-300` ne lit que DM Sans et Bricolage ; `next-font-manifest.json` du dernier build local (2026-10-15, layout inchangé depuis) → 139 routes, mêmes 7 woff2, 256,5 Kio ; aucun commit ni ticket ne l'a traité (`git log -S 'preload: false'` vide) → le constat tient tel quel. Classement : A2, performance sans changement de rendu : Bricolage et DM Sans restent au layout racine, Manrope, Inter et Fraunces passent dans un layout propre à `/playground` qui pose leurs variables, Geist est retirée, et un test (A5) refuse au layout racine une famille dont la variable n'est lue hors `playground`.
- Mesure (2026-10-17, 36eeeb59, implementeur) : reproduit avant correctif par `polices-du-layout-racine.test.ts`, rouge sur `Geist`, `Manrope`, `Inter`, `Fraunces` déclarées au layout racine sans lecteur hors du playground → Bricolage et DM Sans seules au layout racine, Manrope, Inter et Fraunces déclarées par `playground/page.tsx` (enveloppe `display: contents`), Geist retirée ; ablation : layout rendu à six familles → rouge, Fraunces retirée de la page → rouge sur `--font-fraunces` ; 2/2 verts, `metadata-base`, `robots` et `canonique-de-chaque-page` verts (32 tests).

### Le widget de messagerie, invisible au visiteur anonyme, met la messagerie, zod et react-hook-form dans le JS initial de toutes les pages
- Réf : P33.02
- Statut : fait · TCK-743
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/layout.tsx:14`, `takussan-web/src/app/layout.tsx:110`, `takussan-web/src/components/chat-widget/ChatWidget.tsx:9-11`, `takussan-web/src/components/chat-widget/ChatWidget.tsx:145`, `takussan-web/src/components/messages/ChatView.tsx:6-8`, `takussan-web/src/components/messages/ChatView.tsx:25`, `takussan-web/src/components/messages/ChatView.tsx:31`
- Constat :
  - `ChatWidget` est monté par le layout racine et importe statiquement `ConversationList`, `ChatView` et `PropertyDraftChatView` (lu). Il rend `null` tant qu'aucun utilisateur n'est connecté (`isVisible = Boolean(user) && …`, lu), mais son code est importé de toute façon. Seule la cartographie passe par `next/dynamic` dans tout `src/` (3 sites, mesuré par `grep -rn "dynamic(" src`).
  - `ChatView` importe `react-hook-form`, `useResolveurValidation` (zod), `sendMessageSchema` (`lib/schemas/message.ts` → `import { z } from 'zod'`) et `VoiceNoteRecorder` (lu).
  - Mesuré, JS initial gzip, avant → sans le widget (même arbre, deux builds) : mentions légales, CGU et confidentialité **450 → 322 Kio** (−28 %) ; accueil **470 → 407** ; index des agences et des agents **452 → 330** ; paiement par lien et partage **452 → 325-331** ; fiche agence 511 → 458 ; fiche bien 580 → 538 ; recherche 555 → 538. En brut, une page légale passe de 1 472 à 994 Kio de JS à analyser.
  - Le morceau de zod (64,2 Kio gzip, chaîne `ZodError`) figure dans les `entryJSFiles` de `[project]/src/app/layout` (mesuré) : il est payé par toute route, `/auth/login` comprise (448 Kio).
- Piste : charger le widget par `next/dynamic` (`ssr: false`) derrière la condition `user`, ou ne monter que le lanceur et importer le panneau à la première ouverture. Garde : un test ou une garde de build qui refuse `zod` et `react-hook-form` dans les `entryJSFiles` du layout racine (voir P33.05).
- Mesure (2026-10-17, ec405f7a, mesureur) : relu `ChatWidget.tsx:9-11` (imports statiques de `ConversationList`, `ChatView`, `PropertyDraftChatView`), `:145` `isVisible = Boolean(user) && !isHiddenByRoute`, `:170` `return null` ; `ChatView.tsx:6-8,25` importe `react-hook-form`, `useResolveurValidation` et `sendMessageSchema` ; `grep -rn 'dynamic(' src` → 3 sites, tous cartographiques ; dans le build local du 2026-10-15, les `entryJSFiles` de `[project]/src/app/layout` de `/legal/notice` contiennent deux morceaux portant `ZodError` (`2a0zrz29ftn70.js`, `1f6glm94c8plh.js`) ; les octets avant/après du constat n'ont pas été rejoués (pas de build sur ec405f7a) → le constat tient. Classement : A2, découpage du code sans changement de résultat : `ChatWidget` garde statiques sa garde `isVisible` et ce qu'elle lit, et ne rend qu'ensuite un corps chargé par `next/dynamic` (`ssr: false`) contenant le lanceur et le panneau actuels, de sorte que le visiteur anonyme ne télécharge rien de la messagerie ; le brouillon de TCK-500 vit dans `ChatDraftContext`, hors du widget, et reste lu au montage.
- Mesure (2026-10-17, 36eeeb59, implementeur) : reproduit avant correctif par `js-initial-du-layout-racine.test.ts`, traceur d'imports statiques du graphe client de `src/app/layout.tsx`, rouge sur quatre chemins, tous par `ChatWidget → ChatView` (zod par `schemas/message.ts`, react-hook-form et `@hookform/resolvers` par `useApiForm.ts`) → `ChatWidget` réduit à la garde `user`, le corps actuel devenu `CorpsDuWidget` chargé par `next/dynamic` (rendu serveur gardé) ; ablation : corps réimporté statiquement → traceur rouge et `ChatWidget.garde.test.tsx` rouge (corps chargé pour l'anonyme) ; 4/4 verts, les 23 tests du widget verts sur le corps.

### zod arrive aussi sur les pages publiques par des listes de valeurs rangées dans les modules de schémas
- Réf : P33.03
- Statut : fait · TCK-744
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/property/PropertyCard.tsx:25`, `takussan-web/src/components/property/cards/NewBuildChip.tsx:4`, `takussan-web/src/components/search/FilterSidebar.tsx:16`, `takussan-web/src/lib/schemas/property.ts:1`, `takussan-web/src/lib/schemas/property.ts:14`, `takussan-web/src/lib/schemas/property.ts:64-67`
- Constat :
  - `PropertyCard`, `NewBuildChip` et `FilterSidebar` n'importent de `@/lib/schemas/property` que des tableaux `as const` (`propertyTypeValues`, `conditionValues`, `newBuildConditionValues`, `titleTypeValues`) pour traduire des libellés (lu) ; ce module commence par `import { z } from 'zod'` et construit ses schémas au chargement (lu).
  - Mesuré, sur le build sans widget : la fiche bien porte encore le morceau zod de 64,2 Kio gzip dans son JS initial, alors que la page légale ne l'a plus. Que `PropertyCard` (par `PropertySimilar`) soit le seul chemin qui l'y amène est **à vérifier** : les dialogues de la fiche relus (`PropertyVisitDialog`, `PropertyReservationDialog`) n'importent ni zod ni un schéma.
  - L'accueil, la recherche et les fiches agence et agent rendent aussi des cartes de bien ; la part de zod qui leur reste sans le widget n'a pas été isolée (à vérifier).
- Piste : sortir les listes de valeurs dans un module sans dépendance (`lib/enums/property.ts`), que `schemas/property.ts` réimporte ; les composants d'affichage importent ce module-là. Garde : une règle `no-restricted-imports` qui interdit `@/lib/schemas/*` sous `src/components/property/` et `src/components/search/` hors formulaires.
- Mesure (2026-10-17, ec405f7a, mesureur) : relu `PropertyCard.tsx:25`, `NewBuildChip.tsx:4`, `FilterSidebar.tsx:16` (seulement des tableaux `as const`) et `lib/schemas/property.ts:1` (`import { z } from 'zod'`) ; le « à vérifier » est levé par un traceur d'imports statiques temporaire depuis `PropertyDetailContent.tsx` : les seuls modules du graphe qui importent zod sont `lib/schemas/property.ts` et `lib/schemas/common.ts` (atteint par lui), et `schemas/property` y entre par **trois** chemins, `PropertyCard`, `NewBuildChip` (par `PropertyHeader`) et `components/property-form/options.ts:2-9`, qui réimporte six listes de valeurs : `PropertyCard` n'est donc pas le seul chemin ; l'accueil (`(public)/page.tsx`) y mène par les mêmes (graphe statique, frontières client non distinguées) → le constat tient, chemins corrigés. Classement : A2, déplacer les listes `as const` dans un module sans dépendance que `schemas/property.ts` réexporte, et y faire pointer `property-form/options.ts`, `NewBuildChip`, `PropertyCard` et `FilterSidebar`, ne change aucune valeur ; la règle `no-restricted-imports` de la piste est une garde neuve (A5).
- Mesure (2026-10-17, 36eeeb59, implementeur) : reproduit avant correctif par `zod-hors-des-pages-publiques.test.ts`, qui trace le graphe client statique de chaque `page.tsx` et `layout.tsx` de `[locale]/(public)` : six entrées (accueil, recherche, fiches bien, agence et agent, favoris) atteignent zod par `PropertyCard` ou `NewBuildChip` → `schemas/property` ; hors de ces chemins, seuls `BookingTunnel` et `SaveSearchButton` (formulaires, admis par la table du test) y mènent → les neuf listes `as const` dans `lib/enums/property.ts` sans import, réexportées par `schemas/property.ts`, et les quatre importeurs repointés ; ablation : `NewBuildChip` seul rendu au module de schémas → les six rouges ; 20/20 verts, `tsc` propre, 37 fichiers de tests des modules touchés verts (un rouge d'interaction sous charge, vert seul).

### La fiche bien est un seul composant client qui charge ses quatre dialogues et un calendrier avant le premier clic
- Réf : P33.04
- Statut : validé — dialogues de la fiche chargés à l'ouverture par `next/dynamic` (`useIntentionDeReservation` sort de leur module), mesurés avant et après ; reste : le rendu serveur des blocs sans interaction, en tickets, plus tard
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/[locale]/(public)/properties/[slug]/PropertyDetailContent.tsx:1`, `takussan-web/src/app/[locale]/(public)/properties/[slug]/PropertyDetailContent.tsx:10-42`, `takussan-web/src/app/[locale]/(public)/properties/[slug]/PropertyDetailContent.tsx:251-270`, `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx:15-16`, `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyReservationDialog.tsx:13`
- Constat :
  - `PropertyDetailContent` est `'use client'` et importe statiquement une trentaine de blocs de la fiche, description et caractéristiques comprises, plus quatre dialogues (`PropertyVisitDialog`, `PropertyReservationDialog`, `PropertyShareDialog`, `PropertyContactMessageDialog`) et les formulaires d'avis (lu). Seule la carte est différée (`PropertyLocationMap.tsx:8`, lu).
  - `PropertyVisitDialog` importe `Calendar` (react-day-picker) et `Popover`, `PropertyReservationDialog` importe `DatePicker` (lu). Mesuré : le morceau de react-day-picker (17,5 Kio gzip, classes `rdp-`) est dans le JS initial de la fiche ; Leaflet (43,2 Kio) ne l'est pas.
  - Mesuré, build sans widget : la fiche ajoute **216 Kio gzip** de JS initial à ce que charge une page légale (538 contre 322), en onze morceaux, dont 64,2 de zod (P33.03), 44,8 et 27,4 qui portent les dialogues de visite et de réservation, 17,5 de react-day-picker.
  - Calcul, non mesuré : à 1,6 Mbit/s (≈ 200 Kio/s), les 580 Kio de JS initial de la fiche demandent environ 3 s de transfert, avant analyse et sans compter les polices (P33.01) ni le document.
- Piste : différer les dialogues par `next/dynamic` au premier `open`, puis rendre côté serveur les blocs sans interaction (description, caractéristiques, équipements, avertissement de sécurité) en ne gardant client que les îlots qui en ont besoin. Mesurer avant et après par la méthode de P33.05.
- Mesure (2026-10-17, ec405f7a, mesureur) : relu `PropertyDetailContent.tsx:1` (`'use client'`, 36 lignes `import`), `:21-27` (dialogues de visite, réservation — dont le crochet `useIntentionDeReservation` exporté du même module —, partage, message), `:37` `PropertyReviews` ; `PropertyVisitDialog.tsx:15-16` importe `Calendar` et `Popover`, `PropertyReservationDialog.tsx:13` `DatePicker` ; seule `PropertyLocationMap.tsx:8` passe par `dynamic` ; les octets du constat n'ont pas été rejoués → le constat tient. Classement : V8, la première moitié (dialogues différés par `next/dynamic`, en sortant `useIntentionDeReservation` de leur module) serait A2, mais la seconde découpe toute la fiche en îlots client et tient sur plus d'un ticket.

### Aucune garde ne voit le poids du JS d'une route
- Réf : P33.05
- Statut : validé — `poids-des-routes.mjs` branché après le build de `web-ci`, en rapport seul, sans seuil ni refus ; le seuil se décide plus tard sur les chiffres
- Gravité : 🟢 amélioration
- Où : `.github/workflows/web-ci.yml`, `takussan-web/scripts/check-i18n-namespaces.mjs`, `takussan-web/next.config.ts`
- Constat :
  - `grep -rln -i "budget\|gzip" scripts .github/workflows takussan-web/scripts` ne rend que `check-i18n-namespaces.mjs` (part du dictionnaire, ADR-0022) et `check-super-admin-tokens.mjs` (sans rapport) (mesuré). Next 16 n'imprime plus la colonne « First Load JS » à la fin de `next build` (mesuré : la sortie ne liste que les routes et leur mode).
  - Les deux défauts P33.01 et P33.02 ne cassent rien et ne se voient dans aucun journal ; l'ADR-0015 chiffrait encore le JS par page en 2026-08, et rien ne l'a remesuré depuis.
  - La mesure de ce passage tient en un script de 30 lignes sur des fichiers que `next build` produit déjà (`page_client-reference-manifest.js`, `build-manifest.json`, `next-font-manifest.json`), sans dépendance.
- Piste : un script `takussan-web/scripts/poids-des-routes.mjs` qui imprime, après le build de `web-ci`, le JS initial gzip et les polices préchargées des routes publiques ; d'abord en rapport seul, le seuil étant à décider à part. Il refuse au moins `zod` dans le layout racine (P33.02).
- Mesure (2026-10-17, ec405f7a, mesureur) : `grep -rlin 'budget\|gzip' scripts .github/workflows takussan-web/scripts` → `check-super-admin-tokens.mjs`, `check-i18n-namespaces.mjs` et `scripts/agents/pistes.sh` (sans rapport) ; `ls takussan-web/scripts | grep -i poids` → vide ; aucun commit ne cite `poids-des-routes` hors l'angle 33 → aucune garde ne voit le poids des routes, le constat tient. Classement : V5, le script ne sert que branché après le build de `.github/workflows/web-ci.yml`, et V9, son refus de `zod` au layout racine est un seuil de garde neuf.

### Petites améliorations
- Réf : P33.06
- Statut : fait · TCK-745 — reste : refaire la mesure du CSS initial des pages publiques après P33.01
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/components/home/Footer.tsx:1-10`, `takussan-web/src/components/home/Footer.tsx:101-102`, `takussan-web/src/app/globals.css`
- Constat :
  - `Footer` est `'use client'` pour deux `useTranslations` et aucun état ni effet (lu) : il pourrait être rendu côté serveur par `getTranslations`, et sortir l'espace `footer` du dictionnaire client.
  - Le CSS initial de toute page publique fait 268 Kio bruts, 39 Kio gzip, en deux fichiers qui bloquent le rendu (mesuré par `entryCSSFiles`) ; il porte les `@font-face` des six familles de P33.01.
  - `@base-ui/react` pèse environ 120 Kio par module compressé dans le graphe d'une page légale (mesuré par `experimental-analyze`), surtout `floating-ui`, `combobox`, `menu` et `toast` : la barre publique (autocomplétion, menus, favoris) les charge partout. Rien à corriger en soi ; à garder en vue si la barre grossit.
- Piste : `Footer` en composant serveur ; refaire la mesure CSS après P33.01.
- Mesure (2026-10-17, ec405f7a, mesureur) : relu `Footer.tsx:1` (`'use client'`), `:101-103` (deux `useTranslations` et `new Date().getFullYear()`, ni état, ni effet, ni gestionnaire), ses enfants `ChoixDeLangue` et `LienLocalise` sont eux-mêmes `'use client'` et `Logo` est neutre ; `grep -rln "home/Footer'" src` → 17 importeurs, dont quatre client (`HomepageDiscovery`, `PropertiesDiscoveryPage`, `PublicFavoritesPage`, `CompareClient`) qui le garderont dans leur JS ; `footer` est dans `src/i18n/namespaces.json:152` ; la mesure CSS n'a pas été refaite, et le point `@base-ui/react` ne demande rien → seule la partie `Footer` tient comme correctif. Classement : A2, retirer `'use client'` de `Footer` (le `useTranslations` de next-intl vaut côté serveur et côté client) et régénérer `namespaces.json` par `check-i18n-namespaces.mjs` ne change aucun rendu ; le gain se limite aux pages serveur qui l'importent.
- Mesure (2026-10-17, 36eeeb59, implementeur) : reproduit avant correctif par `Footer.serveur.test.ts`, qui trace le graphe client des 13 importeurs serveur de `Footer` (fiches bien, agence, agent et leurs `not-found`, réservation, paiement, partage, deux pages d'alertes, `PageLegale`, `IndexDeProfils`) : 13 rouges, `Footer.tsx` dans chacun → `'use client'` retiré, sans autre changement ; ablation : directive remise → les 13 rouges ; 16/16 verts, 155 tests de `components/home` verts ; `check-i18n-namespaces` conforme sans régénérer `namespaces.json` (le dérivateur ne distingue pas client et serveur, et `HomepageDiscovery`, client, lit encore `footer`).

## Angle 34 — Plan de bascule de la phase F côté SEO

*Exploré le 2026-10-17 sur `pre-dev` dfff1f69, par l'explorateur, seul (aucun sous-agent). Tout est
relu dans le dépôt : TCK-517, la phase F du plan d'auto-hébergement
(`docs/plans/2026-09-13-auto-hebergement-vps-dokploy.md:3951` et suivantes), `images.yml`, le
`Dockerfile` du front, `robots.ts`, `sitemap.ts`, `alternates.ts`, `proxy.ts`, et les pages de
`origin/master` (`fefe2c87`) par `git ls-tree` et `git show`. Les deux artefacts cités viennent du
`next build` resté dans `takussan-web/.next` (2026-10-17, 01 h 17) ; aucun des fichiers qui les
produisent n'a changé depuis le 2026-10-16 (`git log --since`). **Rien n'a été mesuré hors du poste** :
ni l'index Google actuel, ni la Search Console, ni le site de production. Ce que Google a gardé de
l'ancien site reste donc inconnu. Déjà couverts, et pas repris ici : le build du 15 août en
production (P09.01), le 307 des URL sans préfixe (P09.07), les trois langues indexables (P09.05).*

### Les décisions SEO du porteur pour la bascule ne sont écrites ni dans TCK-517 ni dans le plan de la phase F
- Réf : P34.01
- Statut : retenu · à valider — V5 et V6 : tâche de bascule (DNS Cloudflare, Search Console) et 308 contraire à ADR-0026 § 3 ; porteur (2026-10-17) : traité hors agents, en session : tâche SEO de la phase F et amendement d'ADR-0026 § 3 pour la 308
- Gravité : 🟠 risque ou dette
- Où : `docs/backlog/tickets/TCK-517-production-auto-hebergee.md`, `docs/plans/2026-09-13-auto-hebergement-vps-dokploy.md:3951-4200`, `docs/adr/0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md:154-168`, `takussan-web/src/proxy.ts:161`
- Constat :
  - Le porteur a tranché le 2026-10-15 que P09.01 (« soumettre le sitemap à la Search Console ») et P09.07 (« 308 vers /fr ») sont « traités hors agents, dans la phase F (TCK-517) ». Ces décisions ne vivent que dans les lignes `Statut` de ce fichier (lu).
  - `grep -rn -i "search console\|google-site-verification\|IndexNow\|bing webmaster" docs`, hors ce fichier → rien. Aucune tâche F1 à F5 ne vérifie la propriété du site, ne soumet le sitemap, ne relève l'index avant la bascule ni ne le suit après (mesuré).
  - `grep -n 308` sur TCK-517, sur le plan et sur ADR-0026 → seule la règle inverse, ADR-0026 § 3 (« redirigent en 307, jamais en 308 »). `proxy.ts:161` répond toujours `NextResponse.redirect(url, 307)` (lu, mesuré).
  - Le contrôle de F3 étape 3 (`attendre …/robots.txt`) prouve le commit servi, pas le contenu de `robots.txt` ni celui du sitemap (lu, `images.yml:157-160`).
  - L'ajout à l'ardoise que demandait P09.01 n'est pas fait non plus : `grep -i "seo\|sitemap\|référencement" docs/ardoise.md` → rien (mesuré ; voir P09.01).
  - Établi comment : lecture et `grep`. Le CLAUDE.md racine écrit qu'« une décision qui ne vit que dans un ticket clos est une décision perdue » ; une ligne `Statut` en est une autre forme.
- Piste : ajouter à la phase F une tâche SEO, F3 étape 7 ou F6 : la propriété Search Console par enregistrement DNS TXT chez Cloudflare (il survit à la bascule, contrairement à un fichier ou à une balise servis par Vercel), un relevé de l'index et des erreurs de couverture avant F3, la soumission du sitemap après la seconde ligne `✓`, un relevé à J+7 avant F5. La redirection 308 demande d'abord un amendement d'ADR-0026 § 3. Garde possible : F3 vérifie que `robots.txt` cite le sitemap de l'origine de production et que le sitemap compte plus d'URL que les seules pages statiques.
- Mesure (2026-10-17, 18c6141d, mesureur) : `git log dfff1f69..18c6141d` sur TCK-517, le plan, ADR-0026, `proxy.ts`, `images.yml` et l'ardoise → aucun commit ; `grep -rni 'search console\|google-site-verification\|IndexNow\|bing webmaster' docs` hors ce fichier → rien ; `grep -n 308` sur TCK-517, le plan et ADR-0026 → seuls ADR-0026:154-168 (307, jamais 308) et deux 308 sans rapport (Mo, tâches) ; `proxy.ts:161` → `NextResponse.redirect(url, 307)` ; plan F3 étape 3 (l. 4104) n'attend que `robots.txt sert <commit>` ; `grep -ni 'seo\|sitemap\|référencement' docs/ardoise.md` → rien → le constat tient en entier. Classement : V5, la tâche ajoutée vit dans le plan de déploiement et passe par un enregistrement DNS, et V6, la 308 demande d'amender ADR-0026 § 3.
- Mesure (2026-10-17, 4e394b92, humain) : le plan de la phase F porte la tâche SEO (F1 étape 7 : propriété Search Console par DNS TXT et relevé de l'index ; F3 étape 3 point 6 : `robots.txt` et compte des `<loc>` ; F3 étape 7 : soumission ; F5 étape 1 : relevé à J+7), TCK-517 la cite (AC5) et l'ardoise porte D-72. Reste : l'amendement d'ADR-0026 § 3 pour la 308, suspendu à une question au porteur (les liens internes sans préfixe de langue).
- Mesure (2026-10-17, 2a2fc6e4, humain) : l'amendement d'ADR-0026 § 3 est écrit (option a du porteur) : 308 vers `/fr`, sans `Vary` ni négociation, à la phase F, à condition qu'aucun lien interne ne rende un chemin localisable sans préfixe, gardé par un test ; plan F2, étape 4. La piste est faite côté documents ; le code suit en F2.

### Le sitemap est figé au build, et le premier build de production se fait sans API
- Réf : P34.02
- Statut : fait · TCK-831
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/sitemap.ts:69,150-183`, `takussan-web/src/lib/queries/sitemap-catalogue.ts`, plan F2 étape 4 et F3 étape 3
- Constat :
  - `/sitemap.xml` est prérendu au build : `prerender-manifest.json` → `"compute":"static"`, `"initialRevalidateSeconds":3600` (mesuré sur le build local). `sitemap.ts:69` déclare `revalidate = 3600`.
  - Chaque source qui échoue est seulement journalisée (`console.error`, `sitemap.ts:178-182`), et le build passe. Le sitemap du build local compte **12 `<loc>`**, les quatre pages statiques dans les trois langues : aucun bien, aucune ville, aucun profil (mesuré : `grep -c "<loc>" .next/server/app/sitemap.xml.body`). L'état de l'API locale à 01 h 17 n'est pas connu.
  - Le catalogue est lu par `apiFetch`, donc sur `NEXT_PUBLIC_API_URL`, l'URL publique (lu). Dans le plan, l'image `:prod` se construit en F2 étape 4, quand l'API de production ne sert encore rien : elle ne se déploie qu'en F3 (lu).
  - L'image servie après la bascule porterait donc un sitemap de 12 URL. Il ne serait refait qu'à la première requête une heure après le démarrage du conteneur, et cette requête recevrait encore l'ancien (à vérifier sur l'image : comportement ISR de Next en `standalone`).
- Piste : en F3, avant de soumettre le sitemap, compter ses `<loc>` contre le nombre de biens publiés. Ou ne pas prérendre le sitemap au build (`dynamic = 'force-dynamic'` avec un cache de données, ou un build qui échoue si la source `catalogue` est vide en production). Un test de `sitemap.ts` peut garder la règle choisie.
- Mesure (2026-10-17, 18c6141d, mesureur) : relu `sitemap.ts` : `revalidate = 3600` est aujourd'hui à la l. 50 (non 69), la boucle des sources et son `catch` qui journalise sans échouer aux l. 151-185 ; `sitemap-catalogue.ts:1,69` lit par `apiFetch` ; le build de cet arbre (`.next`, 2026-10-15 17 h 30) donne `"compute":"static"` pour `/sitemap.xml` dans `prerender-manifest.json` et `grep -c '<loc>' .next/server/app/sitemap.xml.body` → 12 ; plan F2 étape 4 construit `:prod` avant F3, qui déploie l'API → le constat tient ; le comportement ISR en `standalone` (premier visiteur servi périmé) n'est pas mesuré. Classement : V5, le contrôle porte sur l'ordre et les étapes du plan de bascule, et V7, la `Piste` laisse le choix entre un comptage en F3, `force-dynamic` et un build qui échoue.
- Mesure (2026-10-17, 4e394b92, humain) : le reste hors agents est fait : F3 étape 3 point 6 compte les `<loc>` contre `meta.total` de la liste publique avant toute soumission, et F2 étape 1 exige que la piste soit fusionnée avant le build `:prod`.
- Mesure (2026-10-18, 92d8361e, humain) : fait avec l'étape 2 d'ADR-0069 (TCK-831), qui l'exigeait : l'origine du site se lit désormais à l'exécution. `sitemap.ts` et `robots.ts` sont en `dynamic = 'force-dynamic'`, et les appels du sitemap portent `next: { revalidate: 3600 }` (`FRAICHEUR_SITEMAP`, `sitemap-catalogue.ts` et `listerProfilsPublics` en mode partagé ; `facettes.ts` l'avait déjà). Build sans `NEXT_PUBLIC_*` : `prerender-manifest.json` ne prérend plus que `/_global-error`, `/apple-icon.png`, `/favicon.ico`, `/icon.svg`, `/manifest.webmanifest` ; `/robots.txt` et `/sitemap.xml` sont `ƒ` (mesuré). `force-dynamic` ne prive pas ces appels du cache : Next ne force `no-store` que sur un `fetch` sans réglage (`patch-fetch.js`, `noFetchConfigAndForceDynamic`, lu). Le comptage des `<loc>` reste en F3.

### Le plan F2 ne pose pas `media_url` pour `master`, que le `Dockerfile` exige
- Réf : P34.03
- Statut : retenu · à valider — V5 : sortie `media_url` de production dans `images.yml` et médias de production sur R2 ; porteur (2026-10-17) : traité hors agents, en session : `media_url` de production en F2 et étape F1 du seau R2 de production (ADR-0029)
- Gravité : 🟠 risque ou dette
- Où : plan F2 étape 1 (`docs/plans/2026-09-13-auto-hebergement-vps-dokploy.md`, bloc `master)`), `.github/workflows/images.yml:36-44,100-103`, `takussan-web/Dockerfile:17,28`
- Constat :
  - Le bloc que F2 ajoute au `case` d'`images.yml` écrit trois sorties (`environnement`, `api_url`, `site_url`). Le `case` actuel en écrit quatre, avec `media_url`, et le build du front passe `NEXT_PUBLIC_MEDIA_URL=${{ needs.cible.outputs.media_url }}` (lu).
  - `Dockerfile:28` : `test -n "$NEXT_PUBLIC_MEDIA_URL" || … exit 1`. Recopié tel quel, F2 fait échouer le build de l'image `:prod` (lu ; l'échec est bruyant, pas silencieux).
  - Aucune tâche F ne parle des médias de production (`awk 'NR>=3951' … | grep -i "media\|R2\|0029"` → une seule ligne, sur les sauvegardes). `takussan-web/CLAUDE.md` interdit de poser cette variable sans la bascule des médias de l'environnement sur R2 : sinon les photos sortent en pleine taille, sans optimiseur. Les `og:image` des fiches en dépendent (lu).
- Piste : compléter F2 avec la `media_url` de production et une étape F1 pour le seau public et le disque de production (ADR-0029), ou dire explicitement que la production démarre sans R2. Le plan se corrige seul ; une garde qui compare les sorties de chaque branche du `case` d'`images.yml` attraperait la même faute à l'exécution.
- Mesure (2026-10-17, 18c6141d, mesureur) : relu le plan F2 étape 1 (l. 4016-4027) : le bloc `master)` écrit `environnement`, `api_url`, `site_url`, sans `media_url` ; `images.yml:32,42` déclare et écrit `media_url` pour `preview`, `:103` passe `NEXT_PUBLIC_MEDIA_URL` au build du front ; `takussan-web/Dockerfile:28` sort en `exit 1` si elle est vide ; `awk 'NR>=3951' <plan> | grep -i 'media\|R2\|0029'` → une seule ligne, sur les sauvegardes lues dans R2 → le constat tient. Classement : V5, le correctif fixe une URL de production dans `.github/workflows/images.yml` et décide du seau de médias de production (ADR-0029).
- Mesure (2026-10-17, 4e394b92, humain) : fait en session : F2 étape 1 écrit `media_url=https://media.takussan.com` (quatre sorties, jamais trois), F1 étape 6 crée les seaux `takussan-prod-media` et `takussan-prod-private`, le jeton `takussan-prod-app` et la copie nocturne du seau privé, F3 étape 1 porte les clés `MEDIA_*` et `R2_*` de production.

### F3 ne dit pas quelles variables d'exécution reçoivent le front et l'API de production
- Réf : P34.04
- Statut : retenu · à valider — V5 : variables d'environnement du front et de l'API de production ; porteur (2026-10-17) : traité hors agents, en session : variables d'exécution de `takussan-web-prod` et clés `PUBLIC_CACHE_*` de l'API dans le plan F3
- Gravité : 🟠 risque ou dette
- Où : plan F3 étape 1, `docs/infra/hebergement.md:171-180`, `takussan-web/src/app/api/revalidation/fiche/route.ts:78-89`, `takussan-api/config/services.php:55-58`
- Constat :
  - Pour `takussan-web-prod`, F3 ne donne que l'image, le domaine et l'absence d'authentification basique. `hebergement.md:176-180` liste pour `takussan-web-preview` trois variables d'exécution : `PUBLIC_CACHE_REVALIDATE_SECRET`, `API_INTERNAL_URL` et `VISITOR_IP_TRUSTED_HOPS` (lu).
  - Secret vide, le handler de révocation rend 401 à tout appel (`route.ts:84-89`, lu). Une fiche dépubliée ou retirée reste alors servie, à un robot comme à un visiteur, jusqu'à la fin du cache de données (300 s selon `hebergement.md:174`).
  - L'API de production prend « l'environnement de D1, à ces différences près », et la table des différences ne cite ni `PUBLIC_CACHE_REVALIDATE_URL` ni `PUBLIC_CACHE_REVALIDATE_SECRET` (lu). Recopiée de la préproduction, l'URL viserait le handler du front de préproduction, et la production révoquerait le cache de la préproduction (à vérifier : `hebergement.md:171` dit ces clés « à poser » au 2026-10-08, sans dire si elles le sont).
  - À vérifier aussi : en préproduction, cette URL passe par l'authentification basique de Traefik, qui couvre toute l'application (`hebergement.md:183`). Le POST de l'API y recevrait 401 avant d'atteindre Next (déduit, non mesuré).
- Piste : ajouter à F3 la table des variables d'exécution de `takussan-web-prod` et les deux clés `PUBLIC_CACHE_*` dans celle de l'API, avec l'URL de production. Pour la préproduction, mesurer un POST signé contre l'URL publique.
- Mesure (2026-10-17, 18c6141d, mesureur) : relu le plan F3 étape 1 (l. 4067-4087) : `takussan-web-prod` n'a qu'image, domaine et « sans authentification basique », et la table de l'API ne cite aucune clé `PUBLIC_CACHE_*` ; `hebergement.md:171-180` liste les trois variables d'exécution de `takussan-web-preview` et les dit « à poser » au 2026-10-08 ; `route.ts:79-89` rend 401 si le secret est vide ; `config/services.php:55-58` lit les deux clés, vides par défaut → la partie plan tient ; le 401 de Traefik sur le POST de préproduction reste déduit, non mesuré (hors du poste). Classement : V5, ce sont des variables d'environnement de production à fixer dans le plan de bascule.
- Mesure (2026-10-17, 4e394b92, humain) : fait en session : F3 étape 1 porte les clés `PUBLIC_CACHE_*` de l'API de production (URL de production, secret neuf) et la table des variables d'exécution de `takussan-web-prod` ; `API_INTERNAL_URL` y vise le nom du conteneur de production, jamais l'alias `api` partagé avec la préproduction (D-71). Le POST signé en préproduction n'est pas mesuré : il suit la pose des clés (TCK-720).

### Petites améliorations
- Réf : P34.05
- Statut : validé — `Disallow: /app/` et `/app$` avec un test contre les fichiers de la racine, `robots: { index: false }` sur les passages interdits, `noindex` (front et API) dès que l'origine n'est pas celle de la production ; reste : la commande de F3, hors agents en session
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/lib/sitemap.ts:333-341`, `takussan-web/src/app/robots.ts`, `takussan-web/src/app/publish/layout.tsx`, `takussan-api/public/robots.txt`, `takussan-api/routes/web.php`, plan F3 étape 4
- Constat :
  - **`Disallow: /app` interdit aussi `/apple-icon.png`.** Le `robots.txt` du build porte `Disallow: /app` sans barre finale, et `apple-icon.png` est servi à la racine (mesuré dans `.next/server/app/`). La correspondance se fait par préfixe et la règle la plus longue l'emporte sur `Allow: /`. Le commentaire de `sitemap.ts:335-337` affirme pourtant qu'« aucune surface publique ne commence par l'un de ces préfixes » (lu ; l'effet sur l'icône affichée par Google est à vérifier). Aucun test ne confronte la liste aux fichiers de la racine (`grep -rln apple-icon src` → proxy et routage seulement).
  - **`/publish` est interdit aux robots sans porter `noindex`** : `publish/layout.tsx`, `onboarding/layout.tsx`, `invitations/layout.tsx` et `maintenance/page.tsx` ne déclarent aucun `robots`, et la racine non plus (lu). C'est le piège que `robots.ts` décrit pour `/playground`. Sur `master`, `/publish` n'avait ni `noindex` ni `robots.txt` : une URL que Google aurait gardée n'en sortirait plus (index réel à vérifier). `/auth`, lui, portait déjà `noindex` sur `master` (`git show origin/master:…/(auth)/layout.tsx:21`).
  - **Préproduction : une seule barrière contre l'indexation, hors du dépôt.** `robots.ts` rend `Allow: /` quel que soit l'environnement, et rien ne pose `noindex` quand `ORIGINE_SITE` diffère d'`ORIGINE_PRODUCTION` (lu). Seule l'authentification basique de Dokploy protège le front de préproduction, et `hebergement.md:211` laisse ouverte son remplacement par Cloudflare Access. Côté API, `public/robots.txt` vaut `Disallow:` (tout permis) et `/` rend la vue `welcome` en HTML, en préproduction comme en production (lu).
  - **F3 étape 4 éprouve la redirection de l'apex sur `/fr/biens?page=2`**, un chemin qui n'existe pas : la liste est `/fr/properties` (lu). Le 301 se vérifie quand même, mais la commande suivante ne prouve rien de la cible.
- Piste :
  - `Disallow: /app/` et `Disallow: /app$`, ou une liste confrontée aux fichiers servis à la racine par un test ;
  - `robots: { index: false }` sur les passages interdits ;
  - `X-Robots-Tag: noindex` ou `Disallow: /` dès que l'origine n'est pas celle de la production, côté front et côté API ;
  - `/fr/properties?page=2` dans la commande de F3.
- Mesure (2026-10-17, 18c6141d, mesureur) : `.next/server/app/robots.txt.body` de cet arbre → `Disallow: /app` sans barre, et `apple-icon.png` est servi à la racine (`src/app/apple-icon.png`, `.next/server/app/apple-icon.png.body`) ; le commentaire de `src/lib/sitemap.ts:335-337` affirme toujours qu'aucune surface publique ne commence par ces préfixes ; `grep -l robots` sur `publish/layout.tsx`, `onboarding/layout.tsx`, `invitations/layout.tsx`, `maintenance/page.tsx` et `app/layout.tsx` → aucun (seul `(auth)/layout.tsx:34` porte `index: false`) ; `robots.ts` rend `allow: '/'` sans condition d'origine ; `takussan-api/public/robots.txt` → `Disallow:`, `routes/web.php:7-9` → vue `welcome` ; plan F3 étape 4 (l. 4126,4130) éprouve `/fr/biens?page=2` → les quatre points tiennent ; l'effet réel sur l'icône chez Google n'est pas mesuré. Classement : V5, le `noindex` dépend de l'origine déployée et le dernier point corrige le plan de bascule, et V7, `Disallow: /app/` + `/app$` et le `noindex` des passages interdits changent ce qu'on expose aux moteurs ; le seul point `/app` relèverait d'A1.
- Mesure (2026-10-17, 4e394b92, humain) : le reste hors agents est fait : F3 étape 4 éprouve `/fr/properties?page=2`.

## Angle 35 — Pages de facettes : texte propre et maillage interne

*Exploré le 2026-10-17 sur `pre-dev` d3380eb58, par l'explorateur. Tout a été relu par l'explorateur lui-même, sans sous-agent : `(liste)/page.tsx`, `titre-de-la-liste.ts`, `facettes.ts`, `canonique.ts`, `fil-d-ariane.ts` et son test, `bien-retire.tsx`, `sitemap.ts`, `Footer.tsx`, `data/navigation.ts`, `SearchAutocomplete.tsx`, `PublicPropertyController::cities()` et `::neighborhoods()`, `GeoAddressCanonicalizer`, la migration du référentiel géographique. Les comptes viennent de la base de développement (SELECT par `docker exec … psql`, et `cities()`/`neighborhoods()` appelés par tinker), dont toutes les adresses publiques sont rattachées au référentiel : ce que la production contient n'est pas mesuré. Aucune page n'a été rendue : front et API locaux arrêtés.*

### Les pages de quartier annoncées au sitemap ne reçoivent aucun lien du HTML, et le fil d'Ariane refuse ce lien pour une raison que TCK-598 a levée
- Réf : P35.01
- Statut : fait · TCK-839
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/fil-d-ariane.ts:42-64,86-89`, `takussan-web/src/lib/canonique.ts:270,305-307,341-345`, `takussan-web/src/app/sitemap.ts:96-120`, `takussan-web/src/lib/__tests__/jsonld-fil-d-ariane.test.tsx:120-150`, `takussan-web/src/app/[locale]/(public)/properties/[slug]/bien-retire.tsx:32-38`
- Constat :
  - Le maillon de quartier du fil d'Ariane de la fiche n'a pas de `href` (lu, `fil-d-ariane.ts:86-89`). Son docblock le justifie : « `location` est l'une des dix-sept clés ÉCARTÉES […] cette URL rend `<link rel="canonical" href="…/properties">` » (lu, l. 42-64).
  - Cette raison ne tient plus : `CLES_CANONIQUES` porte `location` depuis TCK-598 (lu, `canonique.ts:270`). Un quartier qui atteint `SEUIL_QUARTIER_INDEXABLE` (3 biens) dans sa ville est canonique avec elle (lu, `canonique.ts:305-307,341-345`, `facettes.ts:90,126`).
  - Le sitemap annonce ces pages de quartier (lu, `sitemap.ts:112-117`). Mesuré par tinker sur la base de dev (`cities()`, puis `neighborhoods()` pour chaque ville d'au moins 3 biens) : 10 villes, **20 quartiers indexables**, tous à Dakar.
  - Aucun lien du HTML public ne mène à `?city=…&location=…` : `grep -rn "location="` sur `takussan-web/src` hors tests → le docblock du fil, `canonique.ts`, `facettes.ts`, `sitemap.ts`, et la seule `rechercheDuQuartier` de `bien-retire.tsx:32-38`, rendue sur la page d'un bien loué, vendu ou retiré (mesuré). L'autocomplétion compose bien ce lien, mais par `router.push` (lu, `SearchAutocomplete.tsx:38-46,158`), qu'un robot ne suit pas.
  - Le test du fil fige l'absence de lien : `expect(nav.innerHTML).not.toContain('location=')` et la même assertion sur le JSON-LD (lu, `jsonld-fil-d-ariane.test.tsx:145,150`).
  - Établi comment : lecture et `grep` ; le rendu HTTP d'une fiche du quartier n'a pas été rejoué.
- Piste : rendre le maillon de quartier cliquable vers `cheminCanoniqueDeLaListe({ city, location })` quand ce quartier est dans le domaine indexable de sa ville, et le laisser en libellé sinon. Le fil doit alors recevoir le domaine des quartiers, que la fiche ne charge pas aujourd'hui. Corriger le docblock, et faire passer le test de « jamais `location=` » à « `location=` seulement si le quartier est indexable, et l'`item` est alors canonique de lui-même ».
- Mesure (2026-10-17, c9ee68400, mesureur) : relu `fil-d-ariane.ts:42-64,86-89` (quartier sans `href`, docblock motivé par l'exclusion de `location`) contre `canonique.ts:270` (`CLES_CANONIQUES` porte `location`) et `canonique.ts:305-307,341-345` (quartier retenu s'il est dans le domaine de sa ville) ; `sitemap.ts:96-120` annonce ces quartiers et `construireSitemap` (`lib/sitemap.ts:306-319`) ne dédoublonne rien ; `grep -rn "location=" src` hors tests → docblocks, `canonique.ts`, `facettes.ts`, `lib/sitemap.ts` et seule `rechercheDuQuartier` de `bien-retire.tsx:32-38` ; `npx vitest run src/lib/__tests__/jsonld-fil-d-ariane.test.tsx` → 10 verts, dont celui qui fige `not.toContain('location=')` ; aucun commit ni ticket ouvert ne l'a traité → le constat tient ; le compte de 20 quartiers indexables n'a pas été repris. Classement : V7, rendre le maillon cliquable renverse une décision de produit écrite le 2026-08-28 et ajoute à la fiche le chargement du domaine des quartiers ; seule la correction du docblock relèverait d'A6.
- Mesure (2026-10-18, 41f289014, implementeur) : avant correctif, `fil-d-ariane.ts` pose le quartier sans `href` et `jsonld-fil-d-ariane.test.tsx` fige `not.toContain('location=')` (relu) ; les trois tests neufs rougissent (`hrefDuQuartier` absent). `hrefDuQuartier` (module serveur `fil-d-ariane-quartier.ts`, pour garder zod hors du graphe client de la fiche) rend `cheminCanoniqueDeLaListe({ city, location })` si la canonique retient le quartier, et la page le passe au fil affiché et au `BreadcrumbList` → quartier indexable lié vers `/fr/properties?city=Dakar&location=Ngor` (canonique de lui-même, graphie du catalogue), hors domaine ou domaine `null` : libellé ; 11 verts, et 363 verts sur le fil, `(public)`, `alternates` et `canonique` ; ablation du `href` → 1 rouge, du filtre → 2 rouges.

### Une page de ville ne lie ni ses quartiers, ni les autres villes, et aucune page publique ne présente les villes
- Réf : P35.02
- Statut : validé — liens « Quartiers de <ville> » sur la page de ville et « Chercher par ville » dans le pied de page, chacun vers une canonique présente au sitemap ; en `wo`, le texte français tel quel
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/components/property/PropertiesDiscoveryPage.tsx`, `takussan-web/src/data/navigation.ts:124-139`, `takussan-web/src/components/home/Footer.tsx`, `takussan-web/src/components/property/HomepageDiscovery.tsx:162`
- Constat :
  - La liste ne rend aucun lien vers une autre facette de lieu : `grep href` dans `PropertiesDiscoveryPage.tsx` et `components/search/*.tsx` → seuls les liens de `Pagination.tsx` (mesuré). Les filtres de ville et de quartier naviguent par `router.push` (lu, `SearchAutocomplete.tsx:158`).
  - Le pied de page public ne lie que `/properties`, `?featured=true`, `?sort=created_desc`, `/agencies`, `/agents`, `/favorites`, `/compare` et les pages légales (lu, `navigation.ts:124-139`) : aucune ville.
  - L'accueil ne lie qu'une ville, celle de la rangée « près de vous » (`viewAllHref`, lu, `HomepageDiscovery.tsx:162`), devinée par la géolocalisation du client avec `Dakar` en repli (lu, `UserLocationProvider.tsx:56`). Que ce lien figure dans le HTML servi n'est pas mesuré (à vérifier).
  - Les pages de ville ne sont donc atteintes que par le sitemap, par la ville du fil d'Ariane des fiches (lu, `fil-d-ariane.ts:80-84`) et peut-être par ce lien de l'accueil. Celles de quartier, par le sitemap seul (voir P35.01).
- Piste : une liste de liens « Quartiers de Dakar » sur la page d'une ville, tirée du domaine indexable que `quartiersDeLaVille` sert déjà en cache, et une rangée « Chercher par ville » sur l'accueil ou dans le pied de page, tirée de `villesAvecComptes`. Un test vérifierait que chaque lien rendu est le chemin canonique d'une page présente au sitemap. Choix de produit : emplacement et libellés neufs.
- Mesure (2026-10-17, c9ee68400, mesureur) : `grep -n href` sur `PropertiesDiscoveryPage.tsx` et `components/search/*.tsx` → seuls les liens de `Pagination.tsx`, `SearchAutocomplete.tsx:158` navigue par `router.push` ; `data/navigation.ts:122-140` (pied de page) ne lie aucune ville ; `HomepageDiscovery.tsx:162` lie la seule ville « près de vous » ; aucun commit ni ticket ouvert → le constat tient ; la présence de ce lien dans le HTML servi n'est pas mesurée. Classement : V7, emplacement et libellés neufs visibles, que la piste dit elle-même choix de produit.

### Aucune page de ville ou de quartier ne porte de texte propre : `<title>`, `<h1>` et description sortent d'un seul gabarit
- Réf : P35.03
- Statut : fait · TCK-841 — reste : le palier 2 (colonne de présentation), plus tard
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/lib/titre-de-la-liste.ts:58-104`, `takussan-web/src/messages/fr.json` (`meta.propertiesFiltered`), `takussan-api/database/migrations/2026_10_12_400000_create_geo_referential_tables.php:29-79`
- Constat :
  - Ce qui distingue une page de ville d'une autre se réduit au nom du lieu dans trois gabarits : `titleCity` (« {subject} à {city} »), `titleQuarter` et `description` (« {title} sur Takussan : photos, prix et localisation de chaque annonce. Affinez par budget, surface, nombre de chambres et quartier. ») (mesuré, `node -e` sur `messages/fr.json` ; lu, `titre-de-la-liste.ts:95-104`). La liste ne rend aucun autre texte (lu, `PropertiesDiscoveryPage.tsx`).
  - Ni `geo_regions`, ni `geo_cities`, ni `geo_neighborhoods` n'ont de colonne de texte : `slug`, `name`, coordonnées, et pour le quartier le statut de modération et son origine (lu, migration l. 29-79). Aucune source ne pourrait donc fournir un texte par lieu sans migration.
  - Aucun chiffre propre au lieu (nombre de biens, fourchette de prix) n'entre dans la description, alors que `cities()` et `neighborhoods()` servent déjà le compte (lu, `PublicPropertyController.php:226-301`).
  - Établi comment : lecture. L'effet sur l'indexation (pages jugées en double) n'est pas mesurable sur le poste.
- Piste : deux paliers. Sans texte neuf rédigé à la main : glisser le compte dans la description (« 198 biens à Dakar… »), en le prenant au domaine déjà en cache. Avec texte rédigé : une colonne de présentation par ville et par quartier, saisie depuis la console du référentiel et traduite en `fr`/`en`, rendue sous le `<h1>`. Le second palier demande une migration et un texte métier neuf.
- Mesure (2026-10-17, c9ee68400, mesureur) : `node -e` sur `messages/fr.json` → `meta.propertiesFiltered` ne porte que `titleContract`, `titleCity`, `titleQuarter`, `subjectAny` et `description`, gabarits sans compte ; `titre-de-la-liste.ts` les compose par le seul nom du lieu ; seule la migration `2026_10_12_400000` crée ou modifie les tables `geo_*`, sans colonne de texte → le constat tient. Classement : V7, le premier palier est déjà un texte de description neuf, et V4, le second demande une migration et un texte métier rédigé.
- Mesure (2026-10-18, 41f289014, implementeur) : avant correctif, `meta.propertiesFiltered` sans compte (relu) et les tests neufs de `titre-de-la-liste.test.ts`, `facettes.test.ts` et `metadata.test.ts` rougissent (`compteDuLieu` absent, description sans chiffre) → `compteDuLieu` lit le compte au domaine en cache (mêmes URL que `villesAvecComptes` et `quartiersDeLaVille`), et la description d'une page de lieu passe par `descriptionWithCount` : « Villa à louer à Dakar sur Takussan, parmi 198 biens publiés à Dakar : … », « … 4 biens publiés à Ngor, Dakar … », sans compte la description d'avant ; 297 verts sur `(public)` et les deux modules ; ablation de la page → 1 rouge, de la branche du compte → 4 rouges. En `wo`, la clé neuve porte le texte français.

### `cities()` groupe la ville sans repli de casse, et le front retient alors la graphie la moins fréquente
- Réf : P35.04
- Statut : retenu · autonome
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:226-253`, `takussan-web/src/lib/queries/facettes.ts:63-71`, `takussan-web/src/app/sitemap.ts:99-109`, `takussan-api/app/Services/Geo/GeoAddressCanonicalizer.php:41-42,85-91,96-115`
- Constat :
  - `cities()` fait `groupBy('addresses.city')` sur la valeur brute, triée par compte décroissant (lu, l. 236-237). Son jumeau `neighborhoods()` replie la casse par `CaseInsensitive` et rend la graphie la plus fréquente (lu, l. 255-301).
  - `villesDuCatalogue` replie chaque valeur en minuscules dans une `Map` (lu, `facettes.ts:69-70`). Si l'API rend « Saly » (40) puis « SALY » (2), le second `set` écrase le premier : la graphie canonique de la page devient la moins fréquente. `sitemap.ts:99` construit sa table de la même façon. Sa boucle (l. 102-118) parcourt en outre chaque variante et pousse le même chemin canonique deux fois (lu). Que `construireSitemap` dédoublonne n'est pas vérifié.
  - Le cas suppose des graphies de ville différentes sur des biens publics. `GeoAddressCanonicalizer` réécrit `city` au nom du référentiel quand `villeParNom` trouve la ville (lu, l. 41-42 et 85-91). Il la laisse brute quand le nom est hors référentiel, ou présent dans plusieurs régions sans région fournie (lu, l. 96-115).
  - Mesuré sur la base de dev : 504 villes au référentiel, 0 adresse publique sans `geo_city_id`, une seule graphie par ville. Le défaut n'y est donc **pas** observable (à vérifier sur la préproduction et la production).
- Piste : grouper `cities()` comme `neighborhoods()` (`CaseInsensitive::sql`, `mode()`), ce qui rend une entrée par ville, comptée une fois. Un test d'API avec deux graphies de la même ville garde la règle. Côté front, ne pas écraser une graphie déjà présente dans la `Map`.
- Mesure (2026-10-17, c9ee68400, mesureur) : relu `PublicPropertyController::cities()` (`groupBy('addresses.city')` brut) contre `neighborhoods()` (`CaseInsensitive::sql`, `mode()`), `facettes.ts:66-70` et `sitemap.ts:99` (`Map` en minuscules, le dernier `set` gagne) ; test temporaire retiré (quatre biens publics, « Zzvillex » ×3 et « ZZVILLEX » ×1, ville hors référentiel), `php artisan test` (charge 2,4 sur 8 cœurs) → `cities()` rend `[{Zzvillex,3},{ZZVILLEX,1}]`, donc le front retiendrait « ZZVILLEX » ; `construireSitemap` ne dédoublonne pas ; base de dev par `SELECT` → 826 adresses de biens, 10 graphies, 10 en minuscules, 0 sans `geo_city_id` : non observable en dev. Classement : A1, le repli de casse de la ville est le contrat écrit de l'appelant (`facettes.ts`, « `?city=dakar` et `?city=Dakar` désignent la même page ») et de son jumeau `neighborhoods()`, et le correctif ne demande aucun choix de produit.

### Petites améliorations du maillage des facettes
- Réf : P35.05
- Statut : validé — ville du fil d'Ariane liée avec le contrat du maillon précédent ; page de ville indexable à partir de 3 biens, comme le quartier ; paires contrat × ville au sitemap à partir de 3 biens
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/lib/fil-d-ariane.ts:70-84`, `takussan-web/src/app/sitemap.ts:96-120`, `takussan-web/src/lib/queries/facettes.ts:81-90`
- Constat :
  - Le fil d'Ariane d'une fiche en location est « Accueil › Louer › Dakar », mais le lien de « Dakar » est `/properties?city=Dakar`, sans le contrat (lu, `fil-d-ariane.ts:73-84`). Le maillon qui suit « Louer » mène donc aux ventes aussi. `?contract_type=rent&city=Dakar` est canonique (lu, `canonique.ts:270`).
  - Les combinaisons contrat × ville (« à louer à Dakar »), canoniques, ne sont ni au sitemap ni liées depuis une page (lu, `sitemap.ts:96-120`, `grep "contract_type=" src` hors tests → le fil d'Ariane et les rangées « à louer » et « à vendre » de l'accueil, `HomepageDiscovery.tsx:179,227`, toujours sans ville ; mesuré).
  - Le seuil de 3 biens ne vaut que pour le quartier (lu, `facettes.ts:81-90`). Une ville d'un seul bien public est canonique et entre au sitemap (lu, `sitemap.ts:102-109`), c'est la page mince que le seuil évite au quartier. Dans la base de dev, la plus petite ville publique en compte 3 (mesuré, `cities()` par tinker) : aucune n'est concernée aujourd'hui.
- Piste : lien de la ville du fil vers `?contract_type=<contrat>&city=<ville>`, la canonique du palier affiché, et l'égalité DOM ⇔ JSON-LD tient puisque les deux dérivent de `maillonsDeFiche`. Paires contrat × ville au sitemap pour les villes au-dessus d'un seuil. Même seuil, ou un seuil propre, pour la page de ville. Le choix des seuils revient au porteur.
- Mesure (2026-10-17, c9ee68400, mesureur) : relu `fil-d-ariane.ts:80-84` (ville du fil vers `/properties?city=…`, sans le contrat du maillon précédent), `sitemap.ts:96-120` (villes et quartiers seuls, aucune paire contrat × ville), `facettes.ts:81-90` (`SEUIL_QUARTIER_INDEXABLE` ne vaut que pour le quartier) ; aucun commit ni ticket ouvert → les trois points tiennent ; le compte de la plus petite ville de dev n'a pas été repris. Classement : V7, la piste remet elle-même le choix des seuils au porteur, et le lien du fil change une cible visible.

## Angle 36 — Webhooks de statut SMS et WhatsApp

*Exploré le 2026-10-17 sur `pre-dev` 8ef0d0915, par l'explorateur. Relu par l'explorateur lui-même :
les routes `sms-webhooks.php` et `whatsapp-webhooks.php`, les quatre contrôleurs de `Webhook/`,
`DeliveryAttemptUpdater`, `UpdateWhatsappDeliveryStatusJob`, `DlrReportApplier`, `MtargetDlrPuller`,
`MtargetTicketMatcher`, `SmsPullMtargetDlr`, `RestrictIpMiddleware`, `WebhookJournal`,
`WebhookReplayer`, `LAfricaMobileSmsDriver`, `config/sms.php`, `config/whatsapp.php`, TCK-283,
`docs/integrations/sms.md` et D-49 de l'ardoise. Aucun sous-agent. Mesures par un test temporaire
(retiré) sous `php artisan test`, charge 1,50 / 1,63 / 2,01 sur 8 cœurs. Ce que LAfricaMobile,
Orange, Mtarget et Meta envoient réellement ne se mesure pas depuis le poste : les formats viennent
des docblocks et de `docs/integrations/sms.md`. La validation d'une URL signée derrière Traefik
(schéma, hôte) relève de l'angle 37 et n'est pas traitée ici.*

### Aucun accusé LAfricaMobile ne peut passer : l'URL signée ne couvre pas les paramètres que LAM y ajoute
- Réf : P36.01
- Statut : fait · TCK-795 — reste : confirmer sur un vrai rappel de LAM
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Notifications/Sms/Drivers/LAfricaMobileSmsDriver.php:85,128-140`, `takussan-api/app/Http/Controllers/Webhook/LAfricaMobileSmsStatusController.php:32,50-53`, `takussan-api/tests/Feature/Http/Webhook/LAfricaMobileSmsWebhookTest.php:44-50`
- Constat :
  - Le pilote envoie à LAM un `ret_url` signé par `URL::temporarySignedRoute` avec le seul jeton et l'identifiant de notification (lu, l. 128-140). La signature de Laravel couvre toute la chaîne de requête.
  - Le contrôleur exige `hasValidSignature()` (l. 32), puis lit `push_id`, `status` et `text` dans la chaîne de requête (l. 50-53). Ces paramètres ne peuvent venir que de LAM, ajoutés à l'URL au rappel (docblock du contrôleur, `docs/integrations/sms.md:91-93` : « DLR is GET with query params `push_id`, `ret_id`, `to`, `status`, `text` »).
  - Mesuré (test temporaire retiré) : `ret_url` capturé à l'envoi, puis `GET ret_url&push_id=lam-real&status=6&text=DELIVRD` → **403** `http.forbidden`, tentative restée `sent`. Le même `ret_url` sans paramètre → **404** (`push_id` vide). Aucune des deux formes n'applique l'accusé.
  - Les tests existants signent l'URL **avec** `push_id` et `status` déjà dedans (lu, `LAfricaMobileSmsWebhookTest.php:44-50`) : ils éprouvent une URL que le pilote ne produit jamais, et sont verts.
  - Établi comment : lecture et mesure. Que LAM ajoute ses paramètres à l'URL plutôt que de la remplacer est la lecture des docblocks, non une capture d'un rappel réel.
- Piste : exclure les paramètres du fournisseur de la vérification (`hasValidSignature(ignoreQuery: ['push_id', 'ret_id', 'to', 'status', 'text'])`), ou signer un chemin sans requête et vérifier à la main. Un test qui part du `ret_url` réellement émis par le pilote et y ajoute les paramètres de LAM garde le correctif ; les tests existants qui signent les paramètres de LAM sont à réécrire sur ce modèle.
- Mesure (2026-10-17, 0adbd8e9b, mesureur) : test temporaire (retiré) qui prend le `ret_url` produit par `LAfricaMobileSmsDriver::buildReturnUrl()` lui-même (par réflexion), sous `php artisan test`, charge 2,47 / 2,21 / 2,12 sur 8 cœurs ; relu `LAfricaMobileSmsStatusController.php:32` et la route, qui porte aussi le middleware `signed` (`routes/api/sms-webhooks.php`) ; `git log` des contrôleurs et pilotes : rien depuis TCK-727 → `ret_url` + `&push_id=lam-real&ret_id=x&to=…&status=6&text=DELIVRD` rend 403 `http.forbidden`, tentative restée `sent` ; `ret_url` nu rend 404 ; le constat tient en entier, et le correctif doit traiter le middleware `signed` de la route autant que `hasValidSignature()` du contrôleur. Classement : V2, le correctif desserre la signature qui authentifie le rappel, et que LAM ajoute ses paramètres sans remplacer l'URL reste tiré du seul docblock.
- Mesure (2026-10-17, 512b85ccd, implementeur) : `LAfricaMobileSmsWebhookTest` réécrit depuis le `ret_url` capturé dans la requête sortante du pilote, augmenté de `push_id`, `ret_id`, `to`, `status`, `text` → avant correctif 403 sur l'accusé `status=6` (3 rouges sur 6) ; `signed:push_id,ret_id,to,status,text` sur la route et `hasValidSignatureWhileIgnoring()` dans le contrôleur → 6 verts (notification ou expiration changées et URL expirée toujours 403, mauvais jeton 404) ; ablation : route seule → 3 rouges, contrôleur seul → 2 rouges.

### Les accusés SMS poussés écrasent le dernier statut : un `sent` tardif ou rejoué efface un `delivered`
- Réf : P36.02
- Statut : fait · TCK-796
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Notifications/Sms/DeliveryAttemptUpdater.php:62-73`, `takussan-api/app/Http/Controllers/Webhook/LAfricaMobileSmsStatusController.php:57-70`, `OrangeSmsStatusController.php:84-97`, `MtargetSmsStatusController.php:66-82`, `takussan-api/app/Services/Notifications/Sms/Dlr/DlrReportApplier.php:96-104`, `takussan-api/app/Services/Webhooks/WebhookReplayer.php:85-87`
- Constat :
  - `applyStatus` n'empêche une régression que si l'appelant passe `statusPrecedence` (lu, l. 62-68). WhatsApp et le pulling Mtarget le passent (lu, `UpdateWhatsappDeliveryStatusJob`, `DlrReportApplier.php:96-104`) ; les trois routes SMS poussées, non (lu). Le docblock de l'updater et TCK-283 disent ce choix délibéré pour le SMS (« last-write »). `DlrReportApplier` pose la règle inverse pour le même fournisseur Mtarget : « a report drained after a later one must never regress the row ».
  - Mesuré (test temporaire retiré, URL signées comme dans les tests existants) : LAM `status=6` puis `status=4` → `delivered` puis `sent`, `delivered_at` remis à `NULL`.
  - Le rejeu par le super-admin (`WebhookReplayer`, TCK-602) repasse une ligne ancienne par le même `process()` (lu, l. 85-87) : rejouer un accusé `sent` ou `failed` plus vieux que le dernier appliqué fait reculer la tentative de la même façon (déduit du point précédent, à vérifier).
  - Pendant la période de recouvrement de TCK-294, Mtarget pousse et se fait tirer à la fois : les deux chemins n'appliquent pas la même règle à la même ligne (lu).
- Piste : passer la même précédence `[sent, delivered, failed]` aux trois routes SMS poussées, ce qui aligne le push sur le pulling, et le dire dans le docblock de l'updater. Un test par route : `delivered` puis `sent` laisse `delivered` et `delivered_at`.
- Mesure (2026-10-17, 0adbd8e9b, mesureur) : même test temporaire : LAM signé `status=6` puis `status=4`, Mtarget poussé `Status=3` puis `Status=1` ; relu `DeliveryAttemptUpdater.php:22` (« SMS/payment callers omit it and keep last-write ») → LAM : `delivered` puis `sent`, `delivered_at` remis à `NULL` ; Mtarget : `delivered` puis `failed` ; le constat tient, le point sur le rejeu (`WebhookReplayer`) n'a pas été exécuté et reste déduit. Classement : V7, la piste renverse une règle écrite comme choisie pour le SMS, au profit de la règle contraire de `DlrReportApplier`, et ce choix revient au porteur.
- Mesure (2026-10-17, 512b85ccd, implementeur) : un test par route (LAM `status=6` puis `4` ; Orange `DeliveryImpossible` puis `DeliveredToTerminal` ; Mtarget `Status=5` puis `3`) → avant correctif, les trois rougissent (LAM repasse à `sent`, Orange et Mtarget à `delivered`) ; `DeliveryAttemptUpdater::SMS_STATUS_PRECEDENCE` passée par les trois contrôleurs → verts, `delivered_at` gardé ; ablation : les trois `statusPrecedence:` retirés → 3 rouges.

### Les statuts intermédiaires d'Orange et de Mtarget sont écrits comme des échecs
- Réf : P36.03
- Statut : fait · TCK-797 — reste : établir sur la documentation d'Orange Sénégal et de Mtarget quels statuts du push sont terminaux, et ajuster les tables
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Webhook/OrangeSmsStatusController.php:84-90`, `takussan-api/app/Http/Controllers/Webhook/MtargetSmsStatusController.php:66-69`, `takussan-api/app/Http/Controllers/Webhook/LAfricaMobileSmsStatusController.php:57-61`, `takussan-api/app/Services/Admin/HealthcheckService.php:241-253`
- Constat :
  - Orange : `MessageWaiting` est écrit `failed`, et tout autre statut aussi par le `default` (lu, l. 84-90), dont `DeliveredToNetwork` et `DeliveryUncertain`, des états non terminaux du vocabulaire OneAPI (à vérifier sur la documentation d'Orange Sénégal). Mesuré : `DeliveredToNetwork` → tentative `failed`, `failure_reason = DeliveredToNetwork` ; `MessageWaiting` reçu après un `delivered` → `failed`.
  - Mtarget poussé : tout `Status` différent de 3 est `failed` (lu, l. 66-69), y compris un `Status` absent (`-1`). Le pulling, lui, ignore 0, 1 et 2 comme intermédiaires (lu, `DlrReportApplier.php:52-58`). Le docblock du contrôleur dit les deux jeux de codes différents ; lequel vaut pour le push reste à vérifier. Mesuré : `Status=2` → `failed` ; `Status=1` après `delivered` → `failed`.
  - LAM : un `status` absent ou inconnu vaut 0 et s'écrit `failed` (lu, l. 51 et 57-61).
  - La sonde de santé compte les tentatives `failed` de l'heure (lu, `HealthcheckService.php:241-253`) : un intermédiaire lu comme échec gonfle le taux, et peut passer le SMS en `degraded`.
- Piste : ne rien écrire pour un statut non terminal (comme `DlrReportApplier`), une table explicite des statuts terminaux par fournisseur, et un `Log::warning` sur un statut inconnu au lieu d'un `failed` par défaut. Avec P36.02, un `delivered` n'est plus effacé. Un test par fournisseur sur un statut intermédiaire garde la règle.
- Mesure (2026-10-17, 0adbd8e9b, mesureur) : même test temporaire : Orange `DeliveredToNetwork`, Mtarget poussé `Status=2` et `Status=1` après `delivered` ; relu `OrangeSmsStatusController.php` (`match`, `default => failed`) et `MtargetSmsStatusController.php` (`$statusCode === 3` seul) → Orange : 200, `failed`, `failure_reason = DeliveredToNetwork` ; Mtarget : `Status=2` → `failed`, `Status=1` après `delivered` → `failed` ; le comportement tient, mais quels codes sont terminaux chez Orange Sénégal et dans le push Mtarget n'est établi par aucun document du dépôt. Classement : V7, écrire la table des statuts terminaux est un choix tant que le vocabulaire des fournisseurs n'est pas lu.
- Mesure (2026-10-17, 512b85ccd, implementeur) : tests par fournisseur (Orange `DeliveredToNetwork`, `DeliveryUncertain`, `MessageWaiting`, `DeliveryNotificationNotSupported`, inconnu ; Mtarget poussé 0, 1, 2, 5, 99, absent, 1 après 3 ; LAM 16 et absent) → avant correctif 6 rouges, chacun écrit `failed` ; tables `TERMINAL_STATUSES` (Orange `DeliveredToTerminal`/`DeliveryImpossible`, Mtarget 3/4/6, LAM 6/4/2/12/23), tout autre statut ignoré avec un `Log::warning` → verts ; ablation : contrôleurs remis à l'état de TCK-796 → 6 rouges.

### Un seul jeton d'URL ouvre les trois routes SMS, et LAM le reçoit dans chaque `ret_url`
- Réf : P36.04
- Statut : retenu · à valider — chemin fermé : `takussan-api/.env.example` et `takussan-api/.env.docker`, où les trois clés neuves doivent se déclarer (`check-webhook-env-keys`)
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/sms.php:174`, `takussan-api/app/Http/Controllers/Webhook/OrangeSmsStatusController.php:56`, `MtargetSmsStatusController.php:43`, `LAfricaMobileSmsStatusController.php:28`, `takussan-api/app/Services/Notifications/Sms/Drivers/LAfricaMobileSmsDriver.php:128-140`
- Constat :
  - Les trois contrôleurs comparent le même `sms.webhook_url_token` (lu). Le pilote LAM l'écrit en clair dans le `ret_url` de chaque SMS envoyé (lu, l. 136-139) : il circule chez LAM, dans ses journaux et ses tableaux de bord, ce que D-49 décrit déjà comme le défaut du jeton d'URL.
  - Mesuré : le jeton des tests LAM ouvre la route Orange, et un accusé `DeliveredToTerminal` y est appliqué (200, tentative `delivered`). En production, l'allowlist d'IP d'Orange reste la seule barrière restante (lu, `RestrictIpMiddleware`) ; hors production, une allowlist vide laisse passer (lu, l. 28-33).
  - La rotation d'un jeton fuité chez LAM oblige à reconfigurer Orange et Mtarget (lu, `docs/integrations/sms.md` « Rotater en cas de compromission, mettre à jour le dashboard du provider »).
- Piste : un jeton par fournisseur (`sms.webhook_url_tokens.{orange,mtarget,lafricamobile}`), avec repli sur la clé commune le temps de la bascule. Un test : le jeton LAM refusé sur la route Orange. Une variable d'environnement neuve est en jeu.
- Mesure (2026-10-17, 0adbd8e9b, mesureur) : test temporaire (retiré) : jeton extrait du `ret_url` réellement produit par le pilote LAM, posté sur `/api/webhooks/sms/orange/status/{jeton}` ; relu `config/sms.php:174` et les trois contrôleurs (même `sms.webhook_url_token`) → 200, tentative Orange `delivered` ; le constat tient. Classement : V5, la piste ajoute des variables d'environnement, et elle touche aussi V2 (l'authentification de trois routes que les fournisseurs appellent).
- Mesure (2026-10-18, e673632a0, implementeur) : `grep -rn webhook_url_token app config` → les trois contrôleurs SMS et le pilote LAM lisent toujours la même `sms.webhook_url_token` (`OrangeSmsStatusController.php:68`, `MtargetSmsStatusController.php:55`, `LAfricaMobileSmsStatusController.php:51`, `LAfricaMobileSmsDriver.php:137`) : le défaut tient. Trois jetons par fournisseur, c'est trois `env('SMS_WEBHOOK_URL_TOKEN_…', '')` dans `config/sms.php`, que `scripts/check-webhook-env-keys.mjs` exige déclarées dans `.env.example` et `.env.docker` (lu, sa recherche `env('X', '')` sur `config/sms.php`) ; ces deux fichiers sont fermés à l'implémenteur. Le V5 accordé porte sur les variables, pas sur le chemin : la piste revient au porteur, non implémentée.

### Le webhook WhatsApp ne répond pas à la vérification d'abonnement de Meta
- Réf : P36.05
- Statut : retenu · à valider — chemin fermé : `takussan-api/.env.example` et `takussan-api/.env.docker`, où la valeur de configuration neuve doit se déclarer (`check-webhook-env-keys`)
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/routes/api/whatsapp-webhooks.php:15-19`, `takussan-api/config/whatsapp.php:26-31`
- Constat :
  - Mesuré : `php artisan route:list --path=webhooks` → `POST api/webhooks/whatsapp/status/{token}` seul ; aucune route `GET` sur ce chemin.
  - `grep -rn "hub.challenge|hub_challenge|verify_token|hub.mode" app routes config` → rien (mesuré). `config/whatsapp.php:29` annonce pourtant un « webhook verify token » dans `metadata` de l'intégration ; rien ne le lit.
  - Meta exige, pour enregistrer l'URL de rappel d'une application, qu'un `GET` avec `hub.mode=subscribe`, `hub.verify_token` et `hub.challenge` rende le `challenge` (à vérifier sur la documentation de Meta). Sans lui, l'URL ne s'enregistre pas et aucun statut WhatsApp n'arrive (déduit, à vérifier).
- Piste : une route `GET` sur le même chemin, gardée par le même jeton d'URL, qui compare `hub.verify_token` à une valeur de configuration et rend `hub.challenge` en texte brut. Un test : bon jeton → 200 et le défi, mauvais → 403.
- Mesure (2026-10-17, 0adbd8e9b, mesureur) : `php artisan route:list --path=webhooks` → seule `POST api/webhooks/whatsapp/status/{token}` ; `grep -rnE "hub.challenge|hub_challenge|verify_token|hub\.mode" app routes config` → rien → aucune route `GET` et aucun lecteur du jeton de vérification ; ce que Meta exige pour enregistrer l'URL n'est pas vérifié depuis le poste. Classement : V5, le jeton de vérification est une valeur de configuration neuve à poser par environnement, et l'exigence de Meta, non lue, laisse le correctif hors de A1.
- Mesure (2026-10-18, e673632a0, implementeur) : `php artisan route:list --path=webhooks/whatsapp` → `POST api/webhooks/whatsapp/status/{token}` seule ; `grep -rnE "hub.challenge|hub_challenge|verify_token|hub\.mode" app routes config` → rien : le défaut tient. La valeur neuve est un secret par environnement, donc un `env('…', '')` dans `config/whatsapp.php`, que `scripts/check-webhook-env-keys.mjs` exige déclaré dans `.env.example` et `.env.docker`, fermés à l'implémenteur. Le V5 accordé porte sur la valeur, pas sur le chemin : la piste revient au porteur, non implémentée.

### Rien n'abonne Orange aux accusés, et l'appariement suppose un `resourceURL` dans la notification
- Réf : P36.06
- Statut : retenu · à valider — V7 : la piste ouvre deux options et dépend de la documentation d'Orange ; porteur (2026-10-17) : plus tard, à la mise en service d'Orange, sur sa documentation
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Notifications/Sms/Drivers/OrangeSmsDriver.php:94-140`, `takussan-api/app/Http/Controllers/Webhook/OrangeSmsStatusController.php:72-80`, `docs/integrations/sms.md` (« Operational checklist »)
- Constat :
  - L'envoi Orange ne pose ni `receiptRequest.notifyURL` ni `callbackData` (mesuré : `grep "receiptRequest|notifyURL|callbackData|webhook"` dans le pilote → rien), et aucun code n'appelle l'API d'abonnement aux accusés (mesuré, même `grep` dans `app/`).
  - Le contrôleur prend l'identifiant dans `deliveryInfo.link`, sinon dans `callbackData` (lu, l. 72-80). Dans le vocabulaire OneAPI, `callbackData` est une valeur choisie par l'abonné ; comme le pilote n'en pose aucune, l'appariement repose sur un champ `link` dont la présence dans la notification d'Orange est à vérifier. Sinon chaque accusé finit en 404 « non apparié ».
  - La liste de mise en service parle pour Orange d'une « per-signed URL pattern … same static URL form », sans dire comment l'URL est donnée à Orange (lu).
- Piste : établir sur la documentation d'Orange Sénégal comment l'URL est enregistrée et ce que porte la notification. Puis poser `receiptRequest` (URL et `callbackData` = identifiant de la tentative) à l'envoi, ou documenter l'abonnement manuel dans le runbook. Un test sur une charge utile réelle d'Orange garde l'appariement.
- Mesure (2026-10-17, 0adbd8e9b, mesureur) : `grep -rnE "receiptRequest|notifyURL|callbackData" app` → seulement la lecture de `callbackData` dans `OrangeSmsStatusController.php:75`, son docblock et `WebhookPayloadRedactor.php:61` ; rien dans `OrangeSmsDriver` → l'envoi ne demande aucun accusé, et aucun code ne s'abonne ; que la notification d'Orange porte `deliveryInfo.link` n'est pas vérifiable depuis le poste. Classement : V7, choisir entre `receiptRequest` à l'envoi et un abonnement manuel au runbook suppose la documentation d'Orange Sénégal, que le dépôt ne porte pas.

### Le débit de 120 par minute et par IP refuse les rafales d'accusés, sans trace au journal
- Réf : P36.07
- Statut : fait · TCK-798
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/routes/api/sms-webhooks.php:22-33`, `takussan-api/routes/api/whatsapp-webhooks.php:16-18`, `takussan-api/config/sms.php` (`mtarget.batch_max`)
- Constat :
  - Chaque route d'accusés porte `throttle:120,1` par IP, **avant** `webhook.journal` (lu, ordre des middlewares, et le commentaire TCK-602 « vient juste après le débit »). Un 429 ne laisse donc aucune ligne au journal des webhooks (déduit de l'ordre, à vérifier).
  - Un fournisseur envoie ses accusés depuis quelques IP. Mtarget accepte jusqu'à 500 numéros par appel (lu, `batch_max`), donc jusqu'à 500 accusés poussés pour un envoi ; Meta envoie un statut par message. Au-delà de 120 par minute, le reste prend 429 (déduit). Que le fournisseur réessaie après un 429 est à vérifier ; Meta réessaie sur tout non-2xx (docblock du contrôleur).
  - Le débit sert à freiner le forçage du jeton (docblock des routes), alors que l'allowlist d'IP le fait déjà en production pour les routes SMS.
- Piste : un limiteur nommé par fournisseur, plus large, ou le journal avant le débit pour qu'un refus se voie. À trancher avec la décision sur P36.04.
- Mesure (2026-10-17, 0adbd8e9b, mesureur) : test temporaire (retiré) : 125 accusés Orange postés de la même IP, puis compte d'`IntegrationWebhookLog` ; relu l'ordre `['throttle:120,1', 'webhook.journal:…', …]` des routes SMS et WhatsApp → 120 réponses 200 et 5 réponses 429, 120 lignes au journal, aucune à 429 : un refus ne laisse aucune trace, c'est mesuré et non plus déduit ; la conduite des fournisseurs après un 429 reste à vérifier. Classement : V2, élargir le débit ou le déplacer change la protection du jeton d'URL, et la piste propose deux options liées à P36.04.
- Mesure (2026-10-17, 512b85ccd, implementeur) : `WebhookThrottleTest`, 125 accusés Orange de la même IP → avant correctif le 121ᵉ prend 429 (3 rouges) ; limiteurs `webhook-sms-orange`, `webhook-sms-mtarget`, `webhook-sms-lafricamobile`, `webhook-whatsapp` à 600 par minute et par IP, avant `webhook.journal`, `Log::warning` sur chaque 429 → aucun 429 sur la rafale, un seau plein rend 429 et journalise, l'autre fournisseur passe ; ablation : `throttle:120,1` remis → 3 rouges, rappel de journalisation retiré → 1 rouge.

### Petites améliorations des webhooks de statut
- Réf : P36.08
- Statut : retenu · à valider — chemin fermé : `takussan-api/.env.example` et `takussan-api/.env.docker`, d'où le premier des quatre points retire `WHATSAPP_WEBHOOK_IPS`
- Gravité : 🟢 amélioration
- Où : `takussan-api/config/whatsapp.php:61-65`, `takussan-api/.env.example:328`, `takussan-api/app/Services/Notifications/Sms/Drivers/LAfricaMobileSmsDriver.php:131`, `docs/integrations/sms.md:79`, `takussan-api/app/Http/Controllers/Webhook/WhatsappStatusController.php:84-94`
- Constat :
  - `whatsapp.webhook_allowed_ips` (`WHATSAPP_WEBHOOK_IPS`, déclarée dans `.env.example` et `.env.docker`) n'a aucun lecteur (mesuré : `grep -rn webhook_allowed_ips app config` → seul `RestrictIpMiddleware`, qui lit la clé `sms.`). Son docblock annonce un filtrage « optionnel » qui n'existe pas ; TCK-283 dit le contraire (pas de `restrict.ip`).
  - `sms.lafricamobile.dlr_signature_ttl_days` est lu par le pilote, mais n'existe pas dans `config/sms.php` (mesuré, `grep`) : le délai de 7 jours n'est réglable que par le code.
  - `docs/integrations/sms.md:79` donne l'URL de rappel Mtarget sur `api.takussan.app`, un domaine que le dépôt n'emploie nulle part ailleurs (lu).
  - Hors production, un secret WhatsApp vide laisse passer un statut non signé dès que le jeton d'URL est posé (lu, l. 84-94). La préproduction n'a aujourd'hui aucune clé `WHATSAPP_*` (lu, `docs/infra/hebergement.md`), donc la route y répond 404.
- Piste : retirer la clé morte et son docblock, ou la brancher ; déclarer `dlr_signature_ttl_days` dans la configuration ; corriger le domaine de la documentation ; refuser un statut non signé dès qu'un jeton est posé, quel que soit l'environnement.
- Mesure (2026-10-17, 0adbd8e9b, mesureur) : `grep -rn "webhook_allowed_ips|dlr_signature_ttl_days" app config` → `whatsapp.webhook_allowed_ips` sans lecteur (`RestrictIpMiddleware` lit `sms.`), `WHATSAPP_WEBHOOK_IPS` dans `.env.example:328` et `.env.docker:353` ; `dlr_signature_ttl_days` lu par le pilote (l. 131), absent de `config/sms.php` ; `docs/integrations/sms.md:78` (et non 79) porte `api.takussan.app`, que `docs/infra/hebergement.md` n'emploie pas (`api.takussan.com`, `preview.api.takussan.com`) ; relu `WhatsappStatusController.php:84-94` (secret vide accepté hors production) → les quatre points tiennent ; le seul domaine de la documentation relèverait de A6 seul. Classement : V5, retirer la clé morte touche deux fichiers d'environnement, et le quatrième point (refuser un statut non signé hors production) touche aussi V2.
- Mesure (2026-10-18, e673632a0, implementeur) : `grep -rn "webhook_allowed_ips|WHATSAPP_WEBHOOK_IPS" app config .env.example .env.docker` → `config/whatsapp.php:65` sans lecteur (`RestrictIpMiddleware` lit `sms.`), clé aux lignes 328 et 353 des deux fichiers d'environnement ; `dlr_signature_ttl_days` lu par `LAfricaMobileSmsDriver.php:138`, absent de `config/` ; `docs/integrations/sms.md:78` porte toujours `api.takussan.app` ; `WhatsappStatusController.php:86-93` accepte un statut non signé hors production : les quatre points tiennent. Le premier retire une clé de `.env.example` et `.env.docker`, fermés à l'implémenteur, et la décision porte sur les quatre ensemble : la piste revient au porteur, non implémentée, plutôt que livrée aux trois quarts.

## Angle 37 — `TRUSTED_PROXIES` derrière Traefik et clés des limiteurs par IP

*Exploré le 2026-10-17 sur `pre-dev` 0f8959c99, par l'explorateur. Relu par l'explorateur lui-même :
`bootstrap/app.php` (`trustProxies`), `TrustProxies` et `ThrottleRequests::resolveRequestSignature`
dans `vendor/`, `AppServiceProvider::bootRateLimiters()` et `visitorRateLimitKey()`,
`VisitorFingerprint`, `RestrictIpMiddleware`, `PropertyViewCounter`, `BoostStatsRecorder`,
`ContactLeadService`, `docker/Caddyfile`, `deploy/takussan/compose.api.yml`, `takussan-web/src/lib/api.ts`,
`src/app/actions/property.ts` et les route handlers de `src/app/api/`, ADR-0028 § 8, ADR-0052 § 5-6,
`docs/infra/hebergement.md` (relevé de Dokploy), D-71 de l'ardoise et `php artisan route:list -v`.
Aucun sous-agent. Une mesure par un test temporaire (retiré) sous `php artisan test`, charge
2,54 / 2,49 / 2,58 sur 8 cœurs. La chaîne de confiance elle-même est déjà épinglée par
`PublicReadLimiterPerVisitorTest` (mandataire de confiance, entrée de gauche forgée, client hors
chaîne) et prouvée sur `preview.api` par l'ablation D5 : elle n'est pas reprise ici. Rien n'a été
mesuré hors du poste (Traefik, Cloudflare, réseau `dokploy-network`). Le débit des webhooks d'accusés
est traité par P36.07 ; le schéma et l'hôte des URL signées, par l'angle 73.*

### Les limiteurs d'authentification et les compteurs de vues comptent une IPv6 entière, pas son /64
- Réf : P37.01
- Statut : validé — une seule fonction de clé par IP, `VisitorFingerprint::network`, pour tous les limiteurs et compteurs qui lisent `$request->ip()`, débits numériques des routes publiques compris ; un test par limiteur
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Providers/AppServiceProvider.php:458,466,472-473,482,586-590`, `takussan-api/app/Services/Property/PropertyViewCounter.php` (`cle()`), `takussan-api/app/Services/Boost/BoostStatsRecorder.php:85`, `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:626-629`, `takussan-api/app/Http/Controllers/Api/PropertyController.php:381`
- Constat :
  - `visitorRateLimitKey()` ramène une IPv6 à son /64 (`VisitorFingerprint::network`, l. 586-590), avec la raison écrite : « sinon une adresse neuve du même abonné repart avec un compteur neuf » (verif-597 m6) (lu).
  - Les limiteurs `auth-register` (10/min), `auth-password` (5/min), `auth-phone-send` (20/h), `ical-export` et `calendar-feed` se clés par `'ip:'.$request->ip()` brut (l. 458, 466, 472, 473, 482). Les débits numériques (`throttle:5,10` de `auth/login`, `throttle:6,1` de `pay/{token}/verify`…) aussi : `ThrottleRequests` signe `domaine|ip` pour un appelant sans compte (lu, `resolveRequestSignature`).
  - Mesuré : test temporaire, retiré. Huit `POST /api/auth/forgot-password` depuis `2001:db8:1:2::1` à `::8` (même /64) → `200` ×8. Huit depuis la même adresse → `200` ×5 puis `429` ×3.
  - `auth-phone-send` est la seule borne par IP de l'envoi de codes SMS, `PhoneSendQuota` bornant par numéro (commentaire TCK-622, l. 474-481). Un client IPv6 qui pulvérise des numéros n'a donc aucune borne d'envoi (déduit de la clé ; à vérifier : la part de clients IPv6 réellement vus derrière Cloudflare).
  - Même écart sur les compteurs : la vue d'un bien (`property-view:<id>:<ip>`) et le clic d'un emplacement sponsorisé (`boost-click:<id>:<ip>`) dédoublonnent sur l'IP brute. Les impressions du même emplacement passent, elles, par `VisitorFingerprint::of()` (`CountBoostImpressions.php:39`) (lu).
- Piste : une seule fonction de clé par IP (`VisitorFingerprint::network`) pour tous les limiteurs et compteurs qui lisent `$request->ip()`, y compris une signature maison pour les débits numériques des routes publiques. Un test par limiteur, sur le modèle de la mesure ci-dessus (deux adresses du même /64 → un seul seau), garde le retour.
- Mesure (2026-10-17, 52f3928cd, mesureur) : relu `AppServiceProvider.php` : `auth-register`, `auth-password`, `auth-phone-send` (l. 472-473, 482), `ical-export` (l. 458) et `calendar-feed` (l. 466) toujours clés `'ip:'.$request->ip()`, seul `visitorRateLimitKey()` (l. 568-590) passe par `VisitorFingerprint::network` ; `PropertyViewCounter::cle()` (l. 49-51) et `BoostStatsRecorder::click()` (l. 83-85) sur l'IP brute ; test temporaire (retiré, charge 2,06/2,14/2,20 sur 8 cœurs) : 8 `POST /api/auth/forgot-password` depuis `2001:db8:1:2::1` à `::8` → `200` ×8, 8 depuis une même adresse → `200` ×5 puis `429` ×3 → le constat tient en entier ; la part de clients IPv6 derrière Cloudflare n'est pas mesurée. Classement : V2, changer la clé des limiteurs de l'authentification (et des débits numériques de `auth/login`) peut refuser des appelants légitimes qui partagent un /64, et la piste touche plusieurs limiteurs et compteurs à la fois.

### Les flux iCal lus par Airbnb, Booking.com et Google Agenda sont bornés par IP de la plateforme, pas par flux
- Réf : P37.02
- Statut : validé — 30 par minute et par flux (clé par jeton haché), plus une borne de 600 par minute et par IP
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Providers/AppServiceProvider.php:455-466`, `takussan-api/routes/web.php:18-22`, `takussan-api/routes/api/calendar-feeds.php:14-16`
- Constat :
  - `ical-export` (`GET /ical/{token}.ics`, le calendrier d'un bien) et `calendar-feed` (`GET /api/calendar-feed/{token}.ics`, l'agenda d'un utilisateur) valent 30 par minute, clés `'ip:'.$request->ip()` (lu).
  - Le commentaire de la l. 456-457 dit l'intention : « quelques appels par heure **et par flux** ». La clé ne porte pas le flux : tous les flux qu'une même plateforme relit partagent un seau (lu).
  - ADR-0041 vise Airbnb, Booking.com et Google Agenda (l. 101). Ces services relisent les flux de tous leurs utilisateurs depuis des machines communes (à vérifier : leurs IP et leur fréquence). Au-delà de 30 flux par minute depuis une même IP, le 31ᵉ reçoit 429. Le calendrier exporté cesse alors de se mettre à jour sur l'autre plateforme, sans erreur côté Takussan, et c'est la double réservation qu'ADR-0041 veut empêcher (déduit de la clé).
- Piste : clé par jeton (`'flux:'.hash($token)`), qui borne l'essai de jetons par flux, plus une borne large par IP contre l'énumération. Un test : 31 flux distincts depuis une même IP restent servis, 31 appels d'un même flux reçoivent un 429.
- Mesure (2026-10-17, 52f3928cd, mesureur) : relu `AppServiceProvider.php:456-466` : `ical-export` et `calendar-feed` à 30/min clés `'ip:'.$request->ip()`, commentaire « par flux » l. 457 ; routes `routes/web.php:19-23` (`throttle:ical-export`) et `routes/api/calendar-feeds.php:14-17` (`throttle:calendar-feed`) → la clé ne porte pas le flux ; les IP et la fréquence réelles d'Airbnb, Booking.com et Google Agenda ne sont pas mesurées, l'effet (429 au 31ᵉ flux) reste déduit. Classement : V7, la piste fixe deux bornes neuves (par jeton, et une « borne large » par IP) dont les valeurs sont un choix sur un service que voient les plateformes tierces.

### Tant que `API_INTERNAL_URL` n'est pas posée, les formulaires anonymes envoyés par action serveur partagent un seau pour tout le site
- Réf : P37.03
- Statut : fait · TCK-838 — reste : poser `API_INTERNAL_URL` en préproduction (porteur, TCK-720)
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/actions/property.ts:120,233,263`, `takussan-web/src/lib/api.ts:23-30,672-677`, `takussan-api/app/Providers/AppServiceProvider.php` (`public-contact-lead`, `public-visit-request`), `takussan-api/app/Services/Lead/ContactLeadService.php:214,313`
- Constat :
  - La demande de visite et les deux demandes de contact (bien, agent) partent d'une action serveur (`'use server'`, `apiRequest`), pas du navigateur (lu). Elles sont bornées par visiteur : `public-contact-lead` 5 par 10 min, `public-visit-request` 10 par heure (lu, `route:list -v`).
  - `apiRequest` y ajoute l'IP du visiteur en `X-Forwarded-For`, mais vise l'URL publique quand `API_INTERNAL_URL` manque (`baseServeur()`, l. 23-30, lu). L'ardoise (D-71) mesure cette clé absente sur la préproduction au 2026-10-12, et le porteur l'y laisse pour l'instant.
  - Par l'URL publique, Traefik efface l'en-tête : l'appel ne vient pas de Cloudflare (ADR-0052 § 5 ; inféré, non mesuré, ADR-0052 § 6). L'API voit alors la même IP pour tous les visiteurs. Cinq demandes de contact anonymes en 10 minutes suffiraient à refuser la sixième, pour tout le site (déduit, à vérifier en préproduction).
  - `ContactLeadService` range cette même IP dans `property_contact_leads.ip` (l. 214 et 313) : chaque demande porterait l'adresse du serveur, qui n'aide plus à repérer un abus (lu ; la valeur rangée en préproduction est à vérifier).
  - D-71 dit l'effet en général (« les limiteurs par visiteur sont partagés »). Ce constat nomme les trois formulaires touchés et leurs bornes. Pour la production, voir P34.04.
- Piste : mesurer en préproduction (`RateLimiter::attempts` de la clé, ADR-0052 § 6) ; puis poser `API_INTERNAL_URL` avant la phase F, ou envoyer ces trois formulaires du navigateur. Un test du front peut garder qu'une action serveur anonyme ne part jamais sur l'URL publique quand l'environnement déclare un chemin interne.
- Mesure (2026-10-17, 52f3928cd, mesureur) : relu `takussan-web/src/lib/api.ts:15-34` (`baseServeur()` rend l'URL publique sans `API_INTERNAL_URL`), `src/app/actions/property.ts` (`'use server'`, `apiRequest` vers `visit-request` l. 120 et `contact-lead` l. 233), `AppServiceProvider.php:397-398` (`public-visit-request` 10/h, `public-contact-lead` 5/10 min par `visitorRateLimitKey`), `docs/infra/hebergement.md:84` (IP du visiteur sur ce chemin « non mesurée ») et `docs/ardoise.md:2998` (`API_INTERNAL_URL` absente) → la partie lue tient ; le seau partagé en préproduction et l'IP rangée dans `property_contact_leads.ip` ne se mesurent pas depuis le poste. Classement : V5, le correctif pose une variable d'environnement sur Dokploy, ou déplace l'envoi des formulaires vers le navigateur (V7).
- Mesure (2026-10-18, 41f289014, implementeur) : avant ajout, `grep -rln API_INTERNAL_URL takussan-web/src` → seul `api.ip-du-visiteur.test.ts` garde le chemin interne, sur `apiRequest('/api/test')`, aucune des trois actions ; `property.chemin-interne.test.ts` (environnement `node`, `API_INTERNAL_URL` posée, sans jeton) : `submitVisitRequest`, `submitContactLead` et `submitAgentContactLead` partent sur `http://api:8080/api/public/…`, jamais sur `origineApi()`, avec l'IP du visiteur → 3 verts dès l'écriture (le défaut est l'absence de clé en préproduction, pas le code) ; ablation de la lecture d'`API_INTERNAL_URL` dans `baseServeur()` → 3 rouges.

### `TRUSTED_PROXIES` croit tout `dokploy-network`, que Traefik partage avec d'autres services
- Réf : P37.04
- Statut : retenu · à valider — V5 : réseau Docker et TRUSTED_PROXIES ; porteur (2026-10-17) : traité hors agents, dans la phase F (TCK-517) : réseau dédié Traefik ↔ API, après un relevé sur le serveur
- Gravité : 🟠 risque ou dette
- Où : `docs/infra/hebergement.md:82`, `deploy/takussan/compose.api.yml:19-20,82-83`, `takussan-api/bootstrap/app.php:43-53`, `takussan-api/app/Http/Middleware/RestrictIpMiddleware.php:35-37`
- Constat :
  - Le sous-réseau entier de `dokploy-network` (`10.0.1.0/24`) est en tête de `TRUSTED_PROXIES` (lu, relevé du 2026-09-14). Tous les services de la pile d'API y sont attachés (lu, `compose.api.yml`). Le port 8080 n'est pas publié, mais il reste joignable sur ce réseau (lu).
  - Ce réseau porte aussi Dokploy, ses bases, le Compose `donnees` (PostgreSQL, Meilisearch, Redis) et d'autres projets (D-71 : « `dokploy-network`, qui porte d'autres projets ») (lu ; la liste des services attachés est à vérifier sur le serveur).
  - Un service voisin qui appelle l'API sur le port 8080 est donc un mandataire de confiance. Son `X-Forwarded-For` fixe l'IP que voit Laravel : il franchit la liste d'IP des webhooks (`RestrictIpMiddleware` compare `$request->ip()`, l. 35-37) et choisit son seau dans tout limiteur par IP. ADR-0052 § 5 ne parle que des clients extérieurs (« aucun client extérieur ne peut emprunter ce chemin ») (déduit de la configuration ; à vérifier sur le serveur).
  - ADR-0028 § 8 veut que Laravel ne croie que Traefik et Cloudflare. Croire le sous-réseau, c'est croire aussi tout ce qui y tourne.
- Piste : borner la confiance aux seuls mandataires réels, par exemple un réseau dédié Traefik ↔ API (et front ↔ API pour le chemin interne), dont le sous-réseau seul entre dans `TRUSTED_PROXIES`. L'ablation de D5, rejouée depuis un service voisin, en serait la preuve.
- Mesure (2026-10-17, 52f3928cd, mesureur) : relu `docs/infra/hebergement.md:82` (`10.0.1.0/24` en tête de `TRUSTED_PROXIES`, relevé du 2026-09-14), `deploy/takussan/compose.api.yml:20,83` (`dokploy-network`), `bootstrap/app.php:49-52` (`trustProxies(at:` sur la liste) et `RestrictIpMiddleware.php:35-37` (`in_array($request->ip(), …)`) → la configuration décrite tient ; la liste des services attachés à `dokploy-network` ne se relève que sur le serveur, hors du poste. Classement : V5, le correctif crée un réseau dédié dans `deploy/` et change `TRUSTED_PROXIES` sur Dokploy.

### Les plages Cloudflare sont recopiées à la main dans `traefik.yml` et dans `TRUSTED_PROXIES`, sans contrôle de fraîcheur
- Réf : P37.05
- Statut : retenu · à valider — V5 : minuteur du serveur ; porteur (2026-10-17) : traité hors agents, en session : minuteur à côté de `seuils.timer` qui compare les plages et alerte par Telegram, sans rien écrire
- Gravité : 🟠 risque ou dette
- Où : `docs/infra/hebergement.md:81-82`, `docs/plans/2026-09-13-auto-hebergement-vps-dokploy.md:3523`, `deploy/server/`
- Constat :
  - Traefik ne croit les `X-Forwarded-*` que des plages Cloudflare : 15 en IPv4 et 7 en IPv6, relevées le 2026-09-14. Le plan D1 recopie ces mêmes plages dans `TRUSTED_PROXIES` (lu).
  - La seule vérification est une commande manuelle (`curl … ips-v4`, « puis comparer au fichier »). Aucun minuteur de `deploy/server/` ni aucun workflow ne la rejoue (mesuré : `grep -n -i "cloudflare.com/ips\|ips-v4"` sur `deploy/server/*.sh` et `.github/workflows/*.yml` → rien).
  - Une plage ajoutée par Cloudflare et absente de `traefik.yml` ferait effacer par Traefik l'en-tête de chaque visiteur servi par elle. Absente de `TRUSTED_PROXIES` seulement, elle ferait retenir par Laravel l'IP de la bordure Cloudflare. Dans les deux cas, ces visiteurs partageraient un seau, et les accusés d'un opérateur qui passent par `api.takussan.com` (proxifié) recevraient 403 de la liste d'IP (déduit d'ADR-0028 § 8, qui écrit ces deux effets).
- Piste : un minuteur du serveur, à côté de `seuils.timer`, qui compare les deux listes à `https://www.cloudflare.com/ips-v4` et `ips-v6` et alerte par le canal Telegram existant. Ou une seule source pour les deux listes, écrite par ce minuteur.
- Mesure (2026-10-17, 52f3928cd, mesureur) : `grep -rn -i "cloudflare.com/ips\|ips-v4" deploy/ .github/workflows/ scripts/` → rien ; `ls deploy/server/` → `bootstrap.sh`, `certificats.sh`, `compose.data.yml`, `journaux-traefik.sh`, `sauvegarde-seau-prive.sh`, `seuils.sh`, aucun contrôle des plages ; `docs/infra/hebergement.md:81` ne donne qu'une vérification manuelle → le constat tient. Classement : V5, la piste ajoute un minuteur sous `deploy/server/` et touche `traefik.yml` et `TRUSTED_PROXIES`.
- Mesure (2026-10-17, 4e394b92, humain) : fait en session : `deploy/server/plages-cloudflare.sh` compare chaque jour les plages publiées par Cloudflare à `traefik.yml` et au `TRUSTED_PROXIES` de chaque conteneur `api`, et alerte sur Telegram par franchissement, sans rien écrire ; unités en `bootstrap.sh` § 9, runbook étape 10. Éprouvé en local sur six cas (listes complètes, plage absente de chaque liste, silence au second passage, retour, source illisible, aucun conteneur). Pas encore installé sur le serveur.
- Mesure (2026-10-17, 21b91599, humain) : installé sur le serveur à 18:52 CEST, timer quotidien actif ; `plages-cloudflare --etat` → les 22 plages dans `traefik.yml` et dans le `TRUSTED_PROXIES` de la préproduction ; ablation par une plage ajoutée à la source : alerte par liste, silence, retour, silence (relevé dans `docs/infra/hebergement.md`). La piste est faite, hors agents.

### Petites améliorations
- Réf : P37.06
- Statut : validé — `headers:` restreint à `FOR | PROTO | PORT`, `IpUtils::checkIp` dans `RestrictIpMiddleware` ; un `TRUSTED_PROXIES` qui contient `*` donne un `Log::critical` et une sonde de santé `degraded`, sans refus au démarrage ; reste : la phrase du plan, hors agents
- Gravité : 🟢 amélioration
- Où : `takussan-api/bootstrap/app.php:43-53`, `takussan-api/vendor/laravel/framework/src/Illuminate/Http/Middleware/TrustProxies.php:22-27`, `takussan-api/app/Http/Resources/DataExportResource.php:23`, `takussan-api/app/Http/Resources/KycDossierResource.php:84`, `takussan-api/app/Http/Middleware/RestrictIpMiddleware.php:35-37`
- Constat :
  - `trustProxies(at: …)` est appelé sans `headers:`. Laravel croit donc aussi `X-Forwarded-Host`, `-Port`, `-Proto` et `-Prefix` de tout mandataire de confiance (lu, `TrustProxies::$headers`), et aucun `URL::forceRootUrl` ni `trustHosts` ne borne l'hôte (mesuré : `grep -rn "forceRootUrl\|forceScheme\|trustHosts" app bootstrap config` → rien). Par Cloudflare, que Traefik croit, un `X-Forwarded-Host` écrit par le client atteindrait Laravel (à vérifier : Cloudflare et Traefik le relaient-ils tels quels ?). Les liens des e-mails de réinitialisation et de vérification n'en dépendent pas : ils partent de `app.frontend_url` (lu, `AppServiceProvider.php:835-857`). Les URL rendues dans la réponse, elles, en dépendent (`url()` de `DataExportResource.php:23`, URL signée de `KycDossierResource.php:84`). Voir l'angle 73.
  - `RestrictIpMiddleware` compare l'IP par égalité de chaîne (`in_array(…, true)`, l. 35-37) : ni plage CIDR, ni forme canonique d'une IPv6 (`2001:db8::1` ≠ `2001:0db8::1`) (lu). Un opérateur qui annonce une plage, ou une IPv6 écrite autrement, serait refusé en 403.
  - Le plan dit que `bootstrap/app.php` « accepte pourtant » `TRUSTED_PROXIES=*` (l. 3796). En fait, le découpage par virgules en fait le tableau `['*']`, et `TrustProxies` ne reconnaît `*` que sous forme de chaîne (`$trustedIps === '*'`, l. 83) : le tableau part tel quel à Symfony, qui n'y voit aucune adresse (lu). Mesuré par `php -r` sur `Symfony\Component\HttpFoundation\Request` (`REMOTE_ADDR` 10.1.1.1, `X-Forwarded-For` 203.0.113.9) : `setTrustedProxies(['*'])` → `getClientIp()` rend `10.1.1.1` ; `['0.0.0.0/0']` → `203.0.113.9`. Posé par erreur, `*` ne croirait donc personne, sans erreur : tous les clients prendraient l'IP de Traefik. Rien ne refuse cette valeur au démarrage, et le plan décrit l'effet inverse.
- Piste : `headers:` restreint à `FOR | PROTO` (ou `FOR | PROTO | PORT`) si l'hôte n'a pas à venir d'un mandataire, avec un test qui épingle l'hôte des URL rendues ; `IpUtils::checkIp` dans `RestrictIpMiddleware` ; refuser au démarrage un `TRUSTED_PROXIES` qui contient `*`, et corriger la phrase du plan (l. 3796).
- Mesure (2026-10-17, 52f3928cd, mesureur) : relu `bootstrap/app.php:49-52` (`trustProxies(at: …)` sans `headers:`), `TrustProxies.php:22` (`$headers` par défaut, `X-Forwarded-Host` compris) et l. 83 (`'*'` reconnu en chaîne seulement) ; `grep -rn "forceRootUrl\|forceScheme\|trustHosts" app bootstrap config` → rien ; `DataExportResource.php:23` (`url(…)`), `KycDossierResource.php:84` (`URL::temporarySignedRoute`) ; `RestrictIpMiddleware.php:35-37` (`in_array(…, true)`) ; `php -r` sur `Symfony\Component\HttpFoundation\Request` (`REMOTE_ADDR` 10.1.1.1, `X-Forwarded-For` 203.0.113.9) : `['*']` → `10.1.1.1`, `['0.0.0.0/0']` → `203.0.113.9` ; le plan l. 3796 dit toujours « accepte pourtant » → les trois points tiennent ; le relais de `X-Forwarded-Host` par Cloudflare et Traefik n'est pas mesuré. Classement : V5, restreindre les en-têtes de confiance et refuser `*` au démarrage portent sur une variable d'environnement et la confiance des mandataires, et la liste d'IP des webhooks touche une autorisation d'opérateurs (V2) ; seule la phrase du plan relèverait de A6.
- Mesure (2026-10-17, 4e394b92, humain) : le reste hors agents est fait : la phrase de D7 sur `TRUSTED_PROXIES=*` dit ce que mesure la piste.

## Angle 38 — Messagerie : notifications et isolation des conversations

*Exploré le 2026-10-17 sur `pre-dev` 63fb933cd, par l'explorateur. Relu par l'explorateur lui-même : `ConversationController`, `ConversationParticipantController`, `GroupConversationService`, `ConversationAccess`, `ConversationPolicy`, `MessagingReach`, `PropertyConversationResolver`, `PublicPropertyController::contactMessage()`, `NotifyNewMessageJob`, `ConversationInviteNotification`, `AppDatabaseChannel`, `MessageSearchService`, les FormRequests de la messagerie, et côté front `conversations.ts`, `NewGroupDialog.tsx`, `ConversationList.tsx`, `NotificationRow.tsx`. Aucun sous-agent. Les mesures viennent de deux classes de test temporaires (`QUEUE_CONNECTION=sync`, base de test propre, charge 12,9 sur 8 cœurs au lancement), retirées avant la fin. Rien n'a été mesuré en préproduction.*

### Les membres d'un groupe neuf ne reçoivent aucune notification ; seuls ceux qu'on ajoute après coup sont prévenus
- Réf : P38.01
- Statut : fait · TCK-804
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Messaging/GroupConversationService.php:43-91,146-160`, `takussan-api/app/Http/Controllers/Api/ConversationController.php:144-160`, `takussan-web/src/components/messages/NewGroupDialog.tsx:130`
- Constat :
  - L'en-tête du service promet d'envoyer une `ConversationInviteNotification` aux nouveaux participants (l. 25). Seul `addParticipants()` l'envoie (l. 146-160). `create()` attache les membres et rend la conversation, sans notification ni message système (lu).
  - Le front crée ses groupes par ce chemin : `NewGroupDialog` appelle `useCreateGroupConversation`, qui poste `type: group` sur `POST /api/conversations` (lu).
  - Mesuré (test temporaire) : un groupe créé avec deux membres → 0 ligne `app_notifications` pour chacun ; un troisième membre ajouté ensuite par `POST …/participants` → 1 ligne.
  - Aucun test ne cite `ConversationInviteNotification` (mesuré : `grep -rln ConversationInviteNotification tests --include='*.php'` → rien).
- Piste : envoyer l'invitation depuis `create()`, hors transaction, comme `addParticipants()`. Un test sur `POST /api/conversations` en groupe : chaque membre, sauf le créateur, reçoit une notification.
- Mesure (2026-10-17, 7c7bd05bf, mesureur) : relu `GroupConversationService::create()` (attache les membres, aucune notification, aucun message système) contre `addParticipants()` (notifie hors transaction) ; test temporaire `TmpMesureurP38Test` (charge 2,68 sur 8 cœurs, `QUEUE_CONNECTION=sync`), retiré ensuite : groupe créé par `POST /api/conversations` avec deux membres → 0 ligne `app_notifications` chacun, troisième membre ajouté par `POST …/participants` → 1 ; `git log 63fb933cd..7c7bd05bf` sur la messagerie → aucun commit ; aucun ticket ne le traite. Classement : A1, l'en-tête du service (l. 25) et TCK-085 (l. 121, 163) écrivent déjà que les nouveaux participants reçoivent `ConversationInviteNotification`, et le correctif réutilise la boucle d'`addParticipants()` sans choix de produit.
- Mesure (2026-10-17, 803747565, implementeur) : reproduit avant correctif par le test neuf `GroupConversationCreationTest::test_chaque_membre_d_un_groupe_neuf_recoit_l_invitation_sauf_le_createur` (`Notification::fake()`, groupe créé par `POST /api/conversations` avec deux membres) → rouge, « notification was not sent » ; correctif : la boucle d'envoi d'`addParticipants()` extraite en `sendInvites()` et appelée par `create()` hors transaction → vert, créateur exclu, une invitation par membre, rien sur un 422 ; ablation (appel retiré de `create()`) → le test rougit seul, 30 autres verts.

### Le message de contact d'une annonce peut atterrir dans un groupe, même un groupe que l'expéditeur a quitté
- Réf : P38.02
- Statut : fait · TCK-813
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Messaging/PropertyConversationResolver.php:65-112`, `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:1071-1113`
- Constat :
  - `query()` cherche une conversation sur le bien dont l'expéditeur et le destinataire sont tous deux participants. Elle ne filtre ni `type = direct` ni `left_at` (lu, l. 106-112). `firstOrCreate()` et `findExisting()` reprennent donc un groupe s'il en existe un sur ce bien.
  - Mesuré (test temporaire) : sur un bien, un groupe réunit le propriétaire (admin), un tiers, et le visiteur, qui l'a quitté. Le visiteur envoie « Prive » par `POST /api/public/properties/{slug}/contact-message`. Résultat : la réponse rend l'identifiant du groupe, le tiers lit « Prive » dans ce groupe, et le visiteur reçoit 403 sur le fil vers lequel `redirect_to` l'envoie.
  - Le même chemin, quand le visiteur est encore membre du groupe, montre à tout le groupe un message écrit depuis un formulaire de contact privé (déduit de la même requête, non mesuré séparément).
- Piste : restreindre `query()` aux conversations `direct` dont les deux participations sont actives (`left_at` nul). Un test : un groupe sur le bien ne capte pas le contact, et un fil neuf s'ouvre.
- Mesure (2026-10-17, 7c7bd05bf, mesureur) : relu `PropertyConversationResolver::query()` : ni `type = direct` ni `left_at` ; test temporaire `TmpMesureurP38Test` (charge 2,68 sur 8 cœurs, `QUEUE_CONNECTION=sync`), retiré ensuite : groupe sur le bien (propriétaire admin, tiers, visiteur qui l'a quitté), puis `POST /api/public/properties/{slug}/contact-message` du visiteur → la réponse rend l'identifiant du groupe (type `group`), et `GET …/messages` du visiteur sur ce fil → 403. Constat confirmé tel qu'écrit. Classement : V3, le correctif change ce qui est exposé à des tiers, et restreindre aux participations actives décide aussi du sort d'une directe quittée (fil neuf ou reprise), qui est un choix de produit.
- Mesure (2026-10-17, 8949e4ede, implementeur) : reproduit avant correctif par deux tests neufs de `PropertyContactMessageTest` (un groupe sur le bien réunissant propriétaire, visiteur et tiers ; une directe que le visiteur a quittée) → rouges, le contact rendait l'identifiant du groupe et de la directe quittée ; correctif : `query()` filtre `type = direct` et `left_at` nul sur les deux participations → verts, un fil direct neuf s'ouvre ; ablation clause par clause : sans `type`, le test du groupe rougit seul, sans `left_at`, celui de la directe quittée rougit seul ; 42 tests des quatre classes du contact verts.

### Un premier message joint à la création d'une conversation ne déclenche aucune notification
- Réf : P38.03
- Statut : fait · TCK-805
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/ConversationController.php:102-114,153-159,329`
- Constat :
  - `store()` (directe) et `storeGroup()` créent le message `initial_message` sans dispatcher `NotifyNewMessageJob`. Seul `sendMessage()` le fait (l. 329) (lu).
  - Mesuré (test temporaire) : une directe créée avec `initial_message` → 0 notification pour le destinataire ; le message suivant, par `POST …/messages` → 1.
  - Aucun écran du front n'envoie `initial_message` aujourd'hui : la directe n'a pas d'appelant, et `CreateGroupConversationPayload` ne porte pas ce champ (`conversations.ts:405-425`, lu). Le défaut est donc dans l'API, sans parcours qui l'atteigne : 🟠 et non 🔴.
- Piste : dispatcher `NotifyNewMessageJob` après la transaction, dans les deux branches, ou retirer `initial_message` du contrat. Un test par branche.
- Mesure (2026-10-17, 7c7bd05bf, mesureur) : relu `store()` (directe) et `storeGroup()` : le message `initial_message` est créé sans `NotifyNewMessageJob`, que seul `sendMessage()` dispatche ; test temporaire `TmpMesureurP38Test` (charge 2,68 sur 8 cœurs, `QUEUE_CONNECTION=sync`), retiré ensuite : directe créée avec `initial_message` → 0 notification pour le destinataire, message suivant par `POST …/messages` → 1. Classement : A1, TCK-085 (l. 143, 163) fait passer toute notification de nouveau message par `NotifyNewMessageJob` (sourdine et départs compris), et le correctif attendu est de le dispatcher après la transaction dans les deux branches, sans retirer `initial_message` du contrat.
- Mesure (2026-10-17, 803747565, implementeur) : reproduit avant correctif par deux tests neufs de `ConversationTest` (`Queue::fake()`, directe puis groupe créés par `POST /api/conversations` avec `initial_message`) → rouges, « pushed 0 times instead of 1 time » ; correctif : `NotifyNewMessageJob` dispatché après la transaction dans `store()` et après la création du message dans `storeGroup()` → verts, un seul job sur le message, aucun sans `initial_message` ; ablation (les deux `dispatch` retirés) → les deux tests rougissent, 11 autres verts.

### `contactMessage()` ignore la sourdine et l'archivage que `sendMessage()` respecte
- Réf : P38.04
- Statut : fait · TCK-814
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:1087-1102`, `takussan-api/app/Http/Controllers/Api/ConversationController.php:307-322`, `takussan-api/app/Jobs/NotifyNewMessageJob.php:42-47`
- Constat :
  - `sendMessage()` désarchive le fil pour les autres participants (l. 318-321), et `NotifyNewMessageJob` écarte les participants en sourdine (l. 45). `contactMessage()` écrit dans le même fil puis appelle `NotificationService::send()` en direct, sans l'un ni l'autre (lu).
  - Mesuré (test temporaire) : le destinataire passe le fil en sourdine et l'archive, puis le visiteur écrit une seconde fois par la fiche. Le destinataire reçoit une notification (1 → 2), et le fil reste archivé (`archived_at` non nul).
  - Le docblock de `toggleMute()` dit que les notifications respectent ce drapeau (`ConversationController.php:191-195`).
- Piste : faire passer `contactMessage()` par le même chemin d'envoi que `sendMessage()` (désarchivage, puis `NotifyNewMessageJob`). Choisir avant si un contact par annonce doit percer la sourdine.
- Mesure (2026-10-17, 7c7bd05bf, mesureur) : relu `contactMessage()` : ni désarchivage, ni passage par `NotifyNewMessageJob`, `NotificationService::send()` direct ; test temporaire `TmpMesureurP38Test` (charge 2,68 sur 8 cœurs, `QUEUE_CONNECTION=sync`), retiré ensuite : le destinataire passe le fil en sourdine et l'archive, deuxième contact par la fiche → notifications 1 → 2, `archived_at` toujours non nul. Classement : V7, la piste elle-même demande de choisir si un contact d'annonce perce la sourdine avant d'aligner les deux chemins.
- Mesure (2026-10-17, 8949e4ede, implementeur) : reproduit avant correctif par deux tests neufs de `PropertyContactMessageTest` (`QUEUE_CONNECTION=sync`) : le destinataire archive le fil puis reçoit un second contact → `archived_at` toujours non nul ; il le met en sourdine → notifications 1 → 2 ; correctif : `contactMessage()` reprend les écritures de `sendMessage()` en transaction (désarchivage des autres participants) puis dispatche `NotifyNewMessageJob` → verts ; ablation : sans le désarchivage, le premier rougit seul, avec l'envoi direct par `NotificationService` à la place du job, le second rougit seul.

### Un collaborateur retiré du bien garde la lecture et l'écriture du fil d'un prospect ; la relance du prospect ouvre un second fil
- Réf : P38.05
- Statut : validé — ADR-0068 : sur un fil de prospect, seul le contact principal actuel du bien répond (branche de `ConversationAccess`), l'ancien répondant perd l'accès, et le fil est transmis au nouveau (résolveur, désignation, retrait de collaboration, passation) ; gardes de l'ADR, § Application
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Messaging/ConversationAccess.php:27-51`, `takussan-api/app/Services/Messaging/PropertyConversationResolver.php:65-112`
- Constat :
  - `ConversationAccess::allows()` ne juge que la participation active et, pour un fil d'intervention, la demande. Un fil rattaché à un bien ne dépend d'aucun lien au bien ni à l'agence (lu).
  - Mesuré (test temporaire) : un agent collaborateur du bien reçoit un contact (« Mon numero 77 000 00 00 »). Sa ligne `property_collaborators` est ensuite supprimée. L'agent lit encore le fil (`GET …/messages` → 200, avec le numéro) et y écrit (`POST` → 201). La relance du visiteur par la fiche ouvre un fil neuf avec le nouveau contact principal (conversation 2), et l'historique reste chez l'ancien agent.
  - Aucune règle écrite ne dit qui garde un fil de prospect après la fin d'une collaboration ou le départ d'un agent (à vérifier dans `docs/features.md` § 1.7 et ADR-0053).
- Piste : décider à qui appartient le fil d'un prospect : à l'agence, et suit-il le contact principal ? Puis l'appliquer dans `ConversationAccess`, comme TCK-592 l'a fait pour les fils d'intervention, avec un test « collaboration retirée → 403 ».
- Mesure (2026-10-17, 7c7bd05bf, mesureur) : relu `ConversationAccess::allows()` : participation active et branche intervention seulement ; test temporaire `TmpMesureurP38Test` (charge 2,68 sur 8 cœurs, `QUEUE_CONNECTION=sync`), retiré ensuite : contact reçu par l'agent collaborateur, ligne `property_collaborators` supprimée → l'agent lit (`GET …/messages` 200) et écrit (`POST` 201), la relance du visiteur ouvre un fil neuf (conversation 9 au lieu de 8). Classement : V2, le correctif retire une autorisation dont l'agent se sert aujourd'hui, et dépend d'une règle d'appartenance du fil que rien n'écrit.

### L'adresse e-mail de l'expéditeur sert de nom dans les notifications de message et d'invitation
- Réf : P38.06
- Statut : fait · TCK-815
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Jobs/NotifyNewMessageJob.php:58-60`, `takussan-api/app/Notifications/ConversationInviteNotification.php:96-104`, `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:1130-1133`, `takussan-api/app/Http/Resources/ConversationResource.php:43-44`
- Constat :
  - Les trois chemins remplacent un nom vide par `$user->email`, et le contact public par `username` puis `email` (lu).
  - Mesuré (test temporaire) : un expéditeur sans prénom ni nom (`secret@example.test`) écrit dans une directe. Le destinataire reçoit `params` = `{"sender":"secret@example.test","excerpt":"x"}`.
  - `ConversationResource` pose la règle inverse pour les membres d'un fil : « le nom et l'avatar, jamais les coordonnées » (l. 43-44). La même règle vaut pour `MessagingContactResource`.
- Piste : un repli sans coordonnée (`—`, comme TCK-588 le fait pour un expéditeur absent), commun aux trois chemins. Un test qui épingle les `params` d'un expéditeur sans nom.
- Mesure (2026-10-17, 7c7bd05bf, mesureur) : relu `NotifyNewMessageJob` (repli `$sender->email`), `ConversationInviteNotification::displayInviter()` (repli `email`) et `PublicPropertyController::displayName()` (`username`, puis `email`) ; test temporaire `TmpMesureurP38Test` (charge 2,68 sur 8 cœurs, `QUEUE_CONNECTION=sync`), retiré ensuite : expéditeur sans prénom ni nom (`secret@example.test`) écrit dans le fil → `params` = `{"sender": "secret@example.test", "excerpt": "x"}` ; par la fiche, le même compte avec un `username` rend ce `username`, l'e-mail n'y sort que si `username` est vide (déduit de la ligne lue). Classement : V3, le correctif décide de ce qui est exposé au destinataire, et le repli (`—`, `username`) reste à choisir pour le chemin public.
- Mesure (2026-10-17, 8949e4ede, implementeur) : reproduit avant correctif par quatre tests neufs de `SenderNameWithoutContactTest` : un expéditeur sans nom ni `username` (`secret@example.test`) écrit dans une directe → `params.sender` = l'e-mail ; l'invitation de ce compte → `inviter_name` = l'e-mail ; `GET …/conversation` d'une annonce dont il est le propriétaire → `recipient.name` = l'e-mail ; correctif : `User::nameWithoutContact()` (prénom et nom, `username`, `—`) appelé par les trois chemins → `params` = `{"sender": "—", "excerpt": "x"}`, verts ; ablation (dernier repli remis sur l'e-mail) → les trois tests sans `username` rougissent, celui du `username` reste vert.

### Petites améliorations
- Réf : P38.07
- Statut : validé — quatre correctifs : invitation par `NotificationCode` avec la cible `conversation` (en `wo`, le texte français tel quel) ; `removeParticipant` refusé sur une directe ; `index()` ne charge que les participants actifs ; une ré-invitation pose `last_read_at` à l'heure de la ré-invitation
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Notifications/ConversationInviteNotification.php:73-84`, `takussan-web/src/components/notifications/NotificationRow.tsx:41`, `takussan-api/app/Policies/ConversationPolicy.php:29-37`, `takussan-api/app/Http/Controllers/Api/ConversationController.php:38`, `takussan-api/app/Services/Messaging/GroupConversationService.php:115-134`
- Constat :
  - `ConversationInviteNotification` n'a ni `code` ni `target` (ADR-0032). Mesuré (test temporaire) : la ligne `app_notifications` vaut `code: null, target: null, title: "Invitation à un groupe : G"`. La ligne de la cloche n'est un lien que si `target.path` existe (`NotificationRow.tsx:41`, lu). L'invitation ne mène donc pas au groupe, et son titre est figé dans la langue de l'envoi.
  - `removeParticipant()` permet à tout participant actif de se retirer lui-même, sans vérifier le type du fil (l. 26-35, lu). Une conversation directe peut donc être « quittée ». L'autre partie continue d'y écrire, sans notification pour celui qui est parti (`NotifyNewMessageJob` filtre `left_at`). Un écran du front l'expose-t-il ? (à vérifier)
  - `index()` charge tous les participants, partis compris (`participants.media`, l. 38), là où `show()` ne garde que les actifs. Le front filtre `left_at`, mais le nom et l'avatar des anciens membres partent quand même dans la liste (lu).
  - Une ré-invitation (l. 115-134) remet `left_at` et `archived_at` à nul, mais garde l'ancien `last_read_at`. Tout ce qui a été écrit pendant l'absence compte alors comme non lu (déduit, à vérifier).
- Piste : faire passer l'invitation par `NotificationCode`, avec la cible `conversation`. Refuser `removeParticipant` sur une directe. Filtrer `left_at` dans le chargement de `index()`. Décider du `last_read_at` d'une ré-invitation.
- Mesure (2026-10-17, 7c7bd05bf, mesureur) : test temporaire `TmpMesureurP38Test` (charge 2,68 sur 8 cœurs, `QUEUE_CONNECTION=sync`), retiré ensuite : invitation → ligne `code: null, target: null, title: "Invitation à un groupe : G"` ; `DELETE …/participants/{soi}` sur une directe → 200 ; `GET /api/conversations` rend le membre parti d'un groupe avec son `left_at` ; ré-invitation après un message écrit pendant l'absence → `unread_count` = 1 pour le ré-invité (le point « à vérifier » tient). Lu côté front : seul un groupe ouvre `ConversationInfoSheet` (`ChatView.tsx`, `isGroup && !isWidget`), donc aucun écran n'offre de quitter une directe. Classement : V8, quatre correctifs sans lien qui font plus d'un ticket, et le `last_read_at` d'une ré-invitation est un choix de produit (V7).

## Angle 39 — Webhooks de paiement `refund` et `failed` sur un paiement déjà soldé

*Exploré le 2026-10-17 sur `pre-dev` 0cbbf5371, par l'explorateur. Relu par l'explorateur lui-même :
`PaymentGatewayService::applyEventToMatchingPayment`, `applyStatusToPayment`, `paymentsForEvent`,
`isSettledBy`, `isAlreadyProcessed`, `writeStatus`, `isPayable` ; `HasPaymentAttributes` (matrice
des transitions, `paid_amount`) ; `handleWebhook()` de `WaveDriver` et `OrangeMoneyDriver` ;
`BookingPaymentService::refund`, `BookingRefundTaskService::closeIfSettled` ; `PlatformPayoutService`
(sélection des lignes). Mesuré par un test temporaire `tests/Feature/Tmp/ExplorateurTmpTest.php`
(retiré), sur le `LeaseDueFixture` et le vrai pilote Wave signé, charge 2,24 / 2,61 / 2,55 puis
2,54 / 2,62 / 2,55 sur 8 cœurs. Aucun sous-agent. Limite : le nom réel des événements de
remboursement de Wave et d'Orange Money n'est écrit nulle part dans le dépôt ; les mesures envoient
`checkout.session.refunded`, que `WaveDriver` range en `refunded`. La fenêtre de temps de la
signature Wave est déjà l'objet de P12.04 : ce passage n'y ajoute que ses effets (P39.01 à P39.04
sont atteignables par un webhook légitime, sans rejeu).*

### Rembourser le doublon d'un loyer, comme la notification le demande, passe le loyer à `refunded`
- Réf : P39.01
- Statut : retenu · à valider — V1 : écriture du statut d'un paiement
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Payments/PaymentGatewayService.php:565-569`, `:471-492`, `:1012-1038`, `:1308`
- Constat :
  - La branche `REFUNDED` passe à `refunded` tout payable `paid` qu'apparie la transaction, sans regarder si c'est elle qui l'a soldé (lu, l. 565-569). La branche `SUCCESS`, elle, distingue le règlement (`isSettledBy`) du double encaissement, qu'elle marque et signale « pour rembourser » (lu, l. 471-492).
  - Mesuré, test temporaire : deux checkouts Wave sur la même échéance, `spy_txn_1` puis `spy_txn_2` payés → `paid`, `settled_by = spy_txn_1`, doublon `spy_txn_2` marqué. Webhook `checkout.session.refunded` sur `spy_txn_2` → 200, échéance `refunded`.
  - Même chose après des espèces : `mark-paid` (`settled_by = manual`), puis le checkout encore ouvert payé (doublon marqué), puis son remboursement → échéance `refunded` (mesuré).
  - L'échéance n'est alors plus payable : `isPayable` → `false`, `POST …/initiate` → 409 `payment.not_payable` (mesuré). Le loyer encaissé par `spy_txn_1` ou en espèces disparaît des circuits qui lisent `paid` (reversements, `PayoutCalculator`, tableaux de bord : lu, filtres `status = paid`).
  - Établi comment : lu, puis mesuré de bout en bout sur `/api/webhooks/payments/wave/{token}`.
- Piste : dans la branche `REFUNDED`, ne passer à `refunded` que si `isSettledBy($existingMeta, $transactionId)` ; sinon tracer le remboursement sur l'entrée de `gateway_duplicate_payment` de cette transaction (`refunded_at`). Garde : les deux scénarios ci-dessus en test de bout en bout, plus le témoin (remboursement de la transaction qui a soldé → `refunded`).
- Mesure (2026-10-17, 8949e4ede, mesureur) : test temporaire `MesureurTmpP39Test` (charge 3,02 sur 8 cœurs, `LeaseDueFixture` + vrai pilote Wave signé), retiré ensuite ; code relu par son contenu, inchangé (`git log 0cbbf5371..HEAD` sur `app/Services/Payments` vide ; branche `REFUNDED` toujours sans `isSettledBy`) : `spy_txn_1` puis `spy_txn_2` payés → `paid`, `settled_by = spy_txn_1`, 1 doublon ; `checkout.session.refunded` sur `spy_txn_2` → 200, échéance `refunded`, `paid_amount = 150000`, `isPayable` → false, `POST …/initiate` → 409 `payment.not_payable`. Scénario espèces non rejoué (même branche). Classement : V1, le correctif écrit le statut d'un paiement et la trace du remboursement d'un doublon.

### Un encaissement en ligne sur un payable `refunded` est refusé en 422, à chaque relivraison, et n'est signalé à personne
- Réf : P39.02
- Statut : retenu · à valider — V1 : encaissement d'un paiement
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Payments/PaymentGatewayService.php:471`, `:493-496`, `takussan-api/app/Models/Concerns/HasPaymentAttributes.php:94-96,151`
- Constat :
  - La garde du double encaissement ne couvre que `paid` et `cancelled` (lu, l. 471). Sur un payable `refunded`, la branche `SUCCESS` tente `writeStatus(Paid)`, que la matrice refuse (`refunded` est terminal, lu `HasPaymentAttributes.php:94-96`).
  - Mesuré : échéance soldée par `spy_txn_1`, remboursée, puis `spy_txn_2` (second checkout resté ouvert) payé → 422 `payment.status_transition_invalid`. La transaction est annulée : aucune entrée `gateway_duplicate_payment`, aucun `gateway_events` pour `spy_txn_2`, 0 notification `payment.duplicate`. Le journal des webhooks note `rejected`. Le rejeu rend encore 422.
  - L'argent du second checkout est donc reçu sans trace sur le payable, et le fournisseur se voit refuser son webhook (relivraisons, selon sa politique : à vérifier).
  - Établi comment : lu, puis mesuré.
- Piste : traiter `refunded` comme `cancelled` dans la garde de la l. 471 (doublon marqué, agence prévenue, 200). Garde : le scénario mesuré en test.
- Mesure (2026-10-17, 8949e4ede, mesureur) : test temporaire `MesureurTmpP39Test` (charge 3,02 sur 8 cœurs, `LeaseDueFixture` + vrai pilote Wave signé), retiré ensuite : échéance soldée par `spy_txn_1` puis remboursée, `spy_txn_2` payé → 422 `payment.status_transition_invalid`, 0 entrée `gateway_duplicate_payment`, 0 notification `payment.duplicate` ; rejeu → 422 encore. La politique de relivraison du fournisseur reste non établie. Classement : V1, traiter un encaissement sur un payable remboursé touche l'écriture d'un paiement.

### Un remboursement reçu par webhook n'écrit pas `refund_amount` : l'acompte remboursé compte encore comme encaissé, et la tâche de remboursement reste ouverte
- Réf : P39.03
- Statut : retenu · à valider — V1 : montant remboursé
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Payments/PaymentGatewayService.php:565-569`, `takussan-api/app/Models/Concerns/HasPaymentAttributes.php:231-234`, `takussan-api/app/Services/Model/BookingPaymentService.php:78-90`, `takussan-api/app/Services/Booking/BookingRefundTaskService.php:75-86`, `takussan-api/app/Http/Controllers/Api/PaymentController.php:221-225`
- Constat :
  - Pour `refunded`, `paid_amount` vaut `amount − refund_amount` (lu, l. 231-234). Le webhook écrit le statut seul ; le geste manuel `BookingPaymentService::refund` écrit `refund_amount` et appelle `closeIfSettled` (lu, l. 78-90).
  - Mesuré : acompte de 50 000 soldé par webhook Wave, tâche `booking_refund` ouverte par `openFor`, puis webhook de remboursement → `refunded`, `refund_amount = null`, `paid_amount = 50000`, `remaining_amount = 0`, tâche toujours `open`.
  - Même lecture sur l'échéance de P39.01 : `refunded` avec `paid_amount = 150000` (mesuré). `lease_payments` n'a pas de colonne `refund_amount` (lu, seule `create_booking_payments_table.php:23` la crée) : une échéance `refunded` compte toujours son montant entier comme reçu.
  - Les totaux de l'historique des paiements somment `paid_amount` (lu, `PaymentController.php:223`) : un remboursement par webhook n'y retire rien (déduit, à vérifier sur l'écran).
  - Le montant du remboursement, partiel ou total, n'est lu dans aucun pilote : Wave et Orange Money rendent `amount` comme pour un paiement, Lemon Squeezy ne lit pas `refunded_amount` (lu). Un remboursement partiel passe donc le payable entier à `refunded` (déduit, à vérifier).
- Piste : faire passer le webhook de remboursement par la même écriture que le geste manuel (`refund_amount` depuis le montant rapporté, plafonné à `amount` ; `closeIfSettled` pour un acompte). Pour l'échéance, décider de la colonne ou du `metadata` qui porte le remboursé. Garde : le scénario acompte en test (statut, `paid_amount`, tâche).
- Mesure (2026-10-17, 8949e4ede, mesureur) : test temporaire `MesureurTmpP39Test` (charge 3,02 sur 8 cœurs, `LeaseDueFixture` + vrai pilote Wave signé), retiré ensuite : échéance remboursée par webhook → `refunded`, aucune colonne `refund_amount` sur `lease_payments`, `paid_amount = 150000` ; acompte `BookingPayment` `paid` de 50 000 passé par la branche `REFUNDED` d'`applyStatusToPayment` (appelée directement) → `refunded`, `refund_amount = null`, `paid_amount = 50000`, `remaining = 0`. Lu : la branche n'appelle pas `closeIfSettled` (tâche non rejouée de bout en bout). Le point écran de l'historique et le remboursement partiel restent « à vérifier ». Classement : V1, écrire un montant remboursé ; la colonne de l'échéance est en plus V4.

### Un webhook `refunded` arrivé avant le `paid` de la même transaction est avalé, et le payable finit `paid`
- Réf : P39.04
- Statut : retenu · à valider — V1 : statut d'un paiement
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Payments/PaymentGatewayService.php:565-569`, `:1074-1101`
- Constat :
  - Mesuré : checkout `spy_txn_1` ouvert, webhook `refunded` reçu d'abord → 200, rien ne change, l'événement est marqué traité ; puis `paid` → échéance `paid`.
  - L'événement `refunded` étant déjà dans `gateway_events`, sa relivraison ne le rejoue pas (lu, `isAlreadyProcessed`) : le remboursement est perdu pour de bon.
  - Que Wave ou Orange Money livrent un jour dans le désordre n'est pas établi (à vérifier, aucune documentation des fournisseurs dans le dépôt).
- Piste : ne marquer un `refunded` traité que s'il a été appliqué (ou le garder en attente sur le payable et l'appliquer au `paid` suivant). Garde : le scénario mesuré en test.
- Mesure (2026-10-17, 8949e4ede, mesureur) : test temporaire `MesureurTmpP39Test` (charge 3,02 sur 8 cœurs, `LeaseDueFixture` + vrai pilote Wave signé), retiré ensuite : `checkout.session.refunded` reçu avant le `paid` → 200, échéance restée `late`, `gateway_events = [refunded]` ; puis `paid` → `paid` ; relivraison du `refunded` → toujours `paid` (dédupliquée). L'ordre réel de livraison des fournisseurs reste non établi. Classement : V1, le correctif décide du statut d'un paiement, et garder un remboursement en attente est un choix (V7).

### L'ordre des motifs de `WaveDriver` range en `paid` tout événement qui contient `completed`, remboursement compris
- Réf : P39.05
- Statut : retenu · à valider — V1 : classement des événements de paiement
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Payments/Drivers/WaveDriver.php:122-127`, `takussan-api/tests/Feature/Api/LemonSqueezyEventListenerTest.php:97`
- Constat :
  - Le type se déduit par `str_contains`, `completed`/`succeeded` d'abord, `refund` en dernier (lu, l. 122-127). Un nom d'événement du genre `refund.completed` serait un `paid` : sur un payable déjà `paid`, il ne ferait rien ; sur un payable ouvert, il le solderait (déduit, à vérifier contre la liste réelle des événements Wave, absente du dépôt).
  - Aucun test n'envoie un remboursement Wave ou Orange Money : le seul test de remboursement est celui de Lemon Squeezy (mesuré : `grep -rln "TYPE_REFUNDED\|session.refunded\|'refunded'" tests` → hors `LemonSqueezyEventListenerTest`, des tests de crédits, de cautions, d'export et du remboursement manuel d'acompte, aucun qui poste un webhook Wave ou Orange Money).
- Piste : une table explicite des événements Wave (nom exact → type), un événement inconnu journalisé et ignoré plutôt que deviné. Garde : un test par nom d'événement, dont le remboursement.
- Mesure (2026-10-17, 8949e4ede, mesureur) : relu `WaveDriver::handleWebhook` (bloc `match (true)` des `str_contains`, désormais l. 122-127 inchangées) : `completed`/`succeeded` testés avant `refund` ; aucun test ne poste de remboursement Wave ou Orange Money (`grep` de l'explorateur non contredit). La liste réelle des événements Wave reste absente du dépôt. Classement : V1, la table des événements décide de ce qui solde un paiement, et elle demande la documentation du fournisseur.

### Petites améliorations
- Réf : P39.06
- Statut : retenu · à valider — V1 : métadonnées d'un paiement
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Payments/PaymentGatewayService.php:546-552`, `:577`
- Constat :
  - Le `metadata` de chaque événement est fusionné à la racine du payable (lu, l. 577) : un `refunded` ou un `failed` reçu après le `paid` remplace `amount`, `currency` et `event` (mesuré : après le `failed`, `metadata.event = checkout.session.payment_failed` sur une échéance `paid`). Aucun lecteur de ces clés sur le payable n'a été trouvé (`grep` dans `app/`) : seule la trace du règlement se perd.
  - Un `failed` reçu sur la transaction qui a soldé l'échéance pose encore `gateway.last_failed_at` (mesuré : 200, échéance `paid`, `last_failed_at` posé). Sans effet trouvé aujourd'hui, `openCheckout` ne servant qu'à un payable ouvert (lu).
- Piste : ranger le `metadata` d'un événement sous son entrée de `gateway_events` plutôt qu'à la racine ; ignorer un `failed` sur une transaction `settled_by`.
- Mesure (2026-10-17, 8949e4ede, mesureur) : test temporaire `MesureurTmpP39Test` (charge 3,02 sur 8 cœurs, `LeaseDueFixture` + vrai pilote Wave signé), retiré ensuite : après `paid`, un `checkout.session.payment_failed` sur la transaction `settled_by` → 200, échéance `paid`, `gateway.last_failed_at` posé, `metadata.event = checkout.session.payment_failed` ; après un remboursement, `metadata.event = checkout.session.refunded`. Classement : V1, déplacer le `metadata` d'un événement change la trace d'un règlement que l'argent suit.

### Ce qu'un paiement repassé à `refunded` laisse en aval n'est pas défait
- Réf : P39.07
- Statut : retenu · à valider — V7 : interdire, signaler ou compenser
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Payments/PaymentGatewayService.php:583-585`, `takussan-api/app/Services/Billing/PlatformPayoutService.php:249-268`
- Constat :
  - La quittance part à la transition vers `paid` (`LeasePaymentSettledOnline`, lu l. 583-585) ; rien n'écoute la transition vers `refunded` (lu : aucun événement dans la branche `REFUNDED`).
  - La clôture d'un reversement de la plateforme prend les lignes `paid` sans `platform_payout_id` (lu, l. 249-268). Une ligne déjà reversée puis remboursée garde son `platform_payout_id` et son montant dans le reversement clos (déduit, à vérifier).
  - Combiné à P39.01, un loyer bien encaissé peut ainsi sortir des circuits tout en restant quittancé.
- Piste : relever ces effets un par un (angle 76 proposé) avant de choisir entre interdire, signaler ou compenser.
- Mesure (2026-10-17, 8949e4ede, mesureur) : lu : la branche `REFUNDED` d'`applyStatusToPayment` n'émet aucun événement, seul `LeasePaymentSettledOnline` part (transition vers `paid`) ; `platform_payout_id` n'est remis à nul que par l'annulation d'un reversement (`PlatformPayoutService.php:178-181`), jamais par un remboursement ; la sélection de clôture (`whereNull('platform_payout_id')`, statut `paid`) est inchangée. Que la ligne remboursée reste comptée dans le reversement clos est lu, non mesuré. Classement : V7 et V1, la piste elle-même demande un choix entre interdire, signaler ou compenser.

## Angle 41 — Chemins nominaux du BFF : cookie → Bearer, en-têtes relayés

*Exploré le 2026-10-18 sur `pre-dev` 51fe0cfa4, par l'explorateur. Relu par l'explorateur lui-même :
les 36 `route.ts` de `takussan-web/src/app/api/`, `apiRequest` et `enTetesServeurAmont`
(`src/lib/api.ts`), `origineApi()`, `ResolveActiveProfile` et `SetLocaleMiddleware` côté API, et
les appelants de la console (`src/lib/queries/super-admin.ts`). Aucun sous-agent. Mesures par un
test vitest temporaire, retiré depuis (charge `vm.loadavg` 2,42 sur 8 cœurs), qui appelle chaque
relais avec un `fetch` remplacé ; l'API réelle n'a pas été jointe par le BFF. Le profil actif du
relais `admin-users` est déjà P03.07 (« Le proxy `admin-users` ne relaie pas le profil actif »,
`validé`) : il n'est pas repris. L'export RGPD (`data-exports/[id]/download`) et `export/[entity]`
relaient bien `content-disposition` et sont tenus par leurs tests (TCK-760, TCK-595).*

### La console super-admin rend une erreur 500 quand l'API répond 204 : la suppression d'un bien, d'une règle d'alerte et la remise d'une prise de modération sont faites, mais affichées en échec
- Réf : P41.01
- Statut : retenu · autonome
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/api/super-admin/[...path]/route.ts:48-56`, `takussan-web/src/app/api/super-admin-properties/[[...path]]/route.ts:34-40`, `takussan-web/src/app/api/admin-users/[[...path]]/route.ts:35-41`, `takussan-web/src/app/api/announcements/[...path]/route.ts:25-31`, `takussan-web/src/app/api/impersonation/proxy/[...path]/route.ts:49`
- Constat :
  - Ces relais lisent le corps amont (`arrayBuffer()` ou `text()`) puis construisent `new NextResponse(corps, { status: upstream.status })`. Un corps non nul, même vide, avec un statut 204 fait lever le constructeur (mesuré : `node -e "new Response('', {status: 204})"` et la même chose avec `NextResponse` → `TypeError: Response constructor: Invalid response status code 204` ; `null` passe).
  - Test temporaire, `fetch` remplacé par `new Response(null, { status: 204 })` (mesuré) : `super-admin` DELETE, `super-admin-properties` DELETE, `admin-users` DELETE, `announcements` POST et `impersonation/proxy` DELETE lèvent tous `Invalid response status code 204` ; seul `agencies` rend 204, parce qu'il traite à part 204, 205 et 304 (`agencies/[[...path]]/route.ts:34-36`, lu).
  - Trois routes de l'API répondent 204 et sont appelées par ces relais (lu) :
    - `DELETE /api/admin/moderation/{id}/claim` (`ModerationQueueController.php:80`, `assertNoContent()` dans `ModerationQueueConcurrencyTest.php:125`), appelée par `releaseModerationItem` (`super-admin.ts:687-696`) ;
    - `DELETE /api/admin/alert-rules/{id}` (`AlertRuleController.php:41`), appelée par `deleteAlertRule` (`super-admin.ts:972-976`) ;
    - `DELETE /api/properties/{id}` (`PropertyController.php:243`, `assertNoContent()` dans `PropertyCrudTest.php:353`), appelée par `deleteProperty` (`super-admin.ts:555-561`) via `super-admin-properties`.
  - Les appelants attendent bien un 204 (`if (res.status === 204) return null`, `super-admin.ts:559` et `:974` ; commentaire « L'API répond 204, sans corps », `:686`). Le handler qui lève, Next rend un 500 : la mutation passe en `onError` (`SuperAdminPropertiesTable.tsx:132-136`, `moderation.tsx:441-451`), la liste n'est pas rafraîchie et l'erreur s'affiche alors que l'écriture est faite. Le 500 vu du navigateur est déduit du comportement de Next sur un handler qui lève (à vérifier sur un `next start`).
  - Le test du relais `super-admin` (`super-admin/[...path]/__tests__/route.test.ts`) n'éprouve que des réponses 200 (lu).
  - Établi comment : lu, et mesuré par le test temporaire.
- Piste : rendre `null` comme corps quand le statut amont est 204, 205 ou 304, comme le fait déjà `agencies`, dans les cinq relais. Garde : un test par relais qui renvoie un 204 amont et attend un 204, et mieux, une seule fonction de relais partagée (voir P41.03) que les cinq appellent.
- Mesure (2026-10-18, a2dc95960, mesureur) : relu les cinq relais (`super-admin` l. 49-56, `super-admin-properties` l. 35-40, `admin-users` l. 36-41, `announcements` l. 26-31, `impersonation/proxy` l. 49), inchangés : ils construisent `new NextResponse(<corps lu>, { status: upstream.status })` ; `agencies` (l. 34-35) seul rend `null` sur 204/205/304 ; test vitest temporaire, retiré (charge 2,64 sur 8 cœurs), `fetch` remplacé par `new Response(null, { status: 204 })` → les cinq lèvent `Response constructor: Invalid response status code 204`, `agencies` rend 204 ; côté API, `ModerationQueueController.php:80`, `AlertRuleController.php:41` et `PropertyController.php:243` répondent toujours 204, et `super-admin.ts:560,974` attendent toujours `res.status === 204` ; aucun commit ni ticket ne l'a traité (`git log` des relais, `grep` des tickets). Le 500 vu du navigateur reste déduit, non mesuré sur `next start`. Classement : A1, le comportement attendu est écrit par les appelants (`if (res.status === 204) return null`) et par le relais `agencies`, le correctif (corps `null` sur 204/205/304 dans les cinq relais, un test 204 par relais) ne demande aucun choix de produit.

### 22 relais joignent l'API en `fetch` nu, par son URL publique, sans la langue ni l'IP du visiteur que pose `apiRequest`
- Réf : P41.02
- Statut : retenu · à valider — V5 : chemin interne de l'API (`API_INTERNAL_URL`) pour 22 relais
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/api/**/route.ts` (22 fichiers qui appellent `origineApi()`), `takussan-web/src/lib/api.ts:20-48,166-171,680-693`, `takussan-api/app/Http/Middleware/SetLocaleMiddleware.php:33-41`
- Constat :
  - `grep -rln "origineApi()" src/app/api` → 22 handlers (mesuré). Ils bâtissent l'URL sur `origineApi()`, l'origine **publique** côté serveur (`config-publique.ts:78-83`, lu), et non sur `apiUrl()`/`urlApiServeur()`, qui préfèrent `API_INTERNAL_URL` (`api.ts:20-27`, lu). Seul `impersonation/proxy` passe par `urlApiServeur` et `enTetesServeurAmont`.
  - Ils n'envoient donc ni `X-Forwarded-For` du visiteur, ni les en-têtes du chemin interne, que `apiRequest` pose de lui-même (`api.ts:690-695`, lu). Le jour où `API_INTERNAL_URL` sera posée, ces relais continueront de traverser Traefik et compteront tous les utilisateurs sous l'IP du serveur Next (déduit ; à vérifier). Aujourd'hui les limiteurs des routes qu'ils servent sont par utilisateur (`invitations-send`, `throttle:10,1` des KYC, lu `AppServiceProvider.php:514-535`) : l'effet visible est l'IP des journaux, pas un refus.
  - Ils n'envoient pas non plus `Accept-Language`. Le `fetch` de Node pose alors `accept-language: *` (mesuré : serveur `http` local qui imprime les en-têtes reçus → `"accept-language":"*"`), que `negotiateFromHeader` ne retient pas : la langue retombe sur `preferred_language`, puis sur le défaut de l'API (lu, `SetLocaleMiddleware.php:33-41`, `:105`). Or `messageCorpsErreurBff` affiche le `message` de Laravel en le tenant pour « déjà localisé (`Accept-Language`) » (`api.ts:545`, lu) : `KycUploader.tsx:122` l'utilise sur `POST /api/agencies/{id}/kyc/documents`, qui passe par le relais `agencies`. Un utilisateur en `/en` dont `preferred_language` vaut `fr` y lirait donc le refus de validation en français (déduit ; à vérifier sur un 422 réel).
  - Établi comment : lu, plus les deux mesures ci-dessus.
- Piste : faire passer les relais par `urlApiServeur()` et `enTetesServeurAmont()`, et relayer `accept-language` du navigateur comme le fait `impersonation/proxy` (`:32-35`). Garde : une garde statique qui refuse `origineApi()` sous `src/app/api/`, ou un test commun qui vérifie les en-têtes envoyés par chaque relais.
- Mesure (2026-10-18, a2dc95960, mesureur) : `grep -rln "origineApi()" src/app/api | wc -l` → 22, inchangé ; même test vitest temporaire, retiré, requête entrante portant `accept-language: en` → `agencies`, `super-admin`, `super-admin-properties`, `admin-users` et `announcements` appellent `http://localhost:8002/api/…` sans `accept-language` ni `x-forwarded-for`, seul `impersonation/proxy` relaie `en` ; lu `SetLocaleMiddleware.php:33-41,76-80` : sans en-tête retenu, la langue retombe sur `preferred_language`. La perte de langue est donc établie ; l'effet sur un 422 réel et l'IP vue par l'API une fois `API_INTERNAL_URL` posée restent déduits. Classement : V5, le correctif fait passer 22 relais sur le chemin interne de l'API (`API_INTERNAL_URL`, Traefik), une question de déploiement que le porteur tranche.

### Petites améliorations
- Réf : P41.03
- Statut : retenu · à valider — V5 : relais commun qui porte le chemin interne de P41.02
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/app/api/admin-users/[[...path]]/route.ts:32`, `takussan-web/src/app/api/super-admin-properties/[[...path]]/route.ts:31`, `takussan-web/src/app/api/announcements/[...path]/route.ts:22`, `takussan-web/src/app/api/feature-flags/me/route.ts:11-16`, `takussan-web/src/app/api/maintenance/status/route.ts:9-14`, `takussan-web/CLAUDE.md:72`
- Constat :
  - **Corps lus en texte.** Trois relais relaient le corps de la requête par `request.text()`, le défaut que TCK-601 a corrigé dans `super-admin` (`super-admin/[...path]/route.ts:41-45`, lu). Mesuré par le test temporaire : un corps `multipart` de quatre octets `ff 80 00 41` envoyé à `admin-users` part à l'API en `ef bf bd ef bf bd 00 41` (U+FFFD deux fois). Aucun appelant n'y envoie de fichier aujourd'hui (lu : `admin-users.ts:65,82`, `super-admin.ts:525-561`, `announcements.ts:14-21`, tous en JSON) : le défaut est latent.
  - **Type de contenu perdu.** `feature-flags/me` et `maintenance/status` ne relaient que `cache-control` : le JSON sort en `text/plain;charset=UTF-8`, le type par défaut d'un corps texte (lu ; les appelants `FeatureFlagProvider.tsx:16`, `MaintenanceBanner.tsx:15` font `res.json()`, donc sans effet visible aujourd'hui).
  - **Six copies du même `forward()`.** `super-admin`, `agencies`, `admin-users`, `super-admin-properties`, `announcements` et `impersonation/proxy` réécrivent chacun le relais, et chacun diverge (corps en octets ou en texte, en-têtes de réponse relayés, 204, profil actif) : P41.01, P41.02 et le profil actif d'`admin-users` sont trois effets de cette divergence (lu).
  - **Document.** `takussan-web/CLAUDE.md:72` annonce « 31 route handlers » ; `find src/app/api -name route.ts | wc -l` → 36 (mesuré), dont les quatre de `impersonation/` et `revalidation/fiche`, absents de la liste des namespaces (`:76-78`).
- Piste : une fonction `relayerVersApi(request, cheminAmont, options)` dans `src/lib/`, qui lit le corps en octets, rend `null` sur 204/205/304, relaie `content-type`, `content-disposition`, `cache-control` et `accept-language`, et pose les en-têtes serveur ; les six relais l'appellent. Corriger le compte et la liste de `takussan-web/CLAUDE.md`.
- Mesure (2026-10-18, a2dc95960, mesureur) : même test vitest temporaire, retiré → corps `ff 80 00 41` envoyé à `admin-users` part en `ef bf bd ef bf bd 00 41` (`request.text()` toujours l. 32, et `super-admin-properties` l. 31, `announcements` l. 22) ; `feature-flags/me` et `maintenance/status` rendent un JSON amont en `text/plain;charset=UTF-8` ; `find src/app/api -name route.ts | wc -l` → 36 alors que `takussan-web/CLAUDE.md` dit toujours « 31 route handlers » (l. 72) ; les six `forward()` divergents sont relus. Les quatre parties tiennent. Classement : V5, la `Piste` réunit les relais dans une fonction qui pose aussi les en-têtes serveur et `accept-language` de P41.02, donc le même chemin interne ; prises seules, la lecture en octets et le `content-type` (A1, précédent TCK-601) et le compte du document (A6) seraient autonomes.
