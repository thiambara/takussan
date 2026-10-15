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
| 17 | Qualité des adresses : référentiel ou texte libre, dans le formulaire de création de bien | à faire |
| 18 | Statistiques Boost (clics, impressions) face aux robots, aux rendus serveur et aux revalidations | à faire |
| 19 | Rétention des tables qui grossissent : `activity_log`, `app_notifications`, `scheduled_task_runs` | à faire |
| 20 | Nombre réel de requêtes SQL par écran (`DB::listen`), machine au repos | à faire |
| 21 | Données personnelles d'un `User` sorties par `include=` (`Lease.landlord`, `Booking.customer`, `Payout.landlord`) : qui voit quel téléphone et quel e-mail | à faire |
| 22 | Les 28 FormRequests hors `BaseFormRequest`, et les règles d'autorisation restées dans des services | à faire |
| 23 | Lectures de données personnelles sans step-up, face à `REFUSED_READS` (ADR-0055 §3) | à faire |
| 24 | Crédits et Boost : idempotence et unité des achats Lemon Squeezy (`CreditLedger`, `BoostPurchaseService`) | à faire |
| 25 | Rapprochement bancaire quand une pénalité est incluse dans l'encaissement | à faire |
| 26 | PDF (quittances, contrats, factures) : loyer non mensuel, TVA arrondie, devise | à faire |
| 27 | Routeur SMS (`SmsRouterDriver::walkChain`) : SMS envoyé et facturé deux fois sur un timeout suivi d'un repli | à faire |
| 28 | Cache des pages publiques par langue : les `*_label` localisés entrent-ils dans la clé de cache ? | à faire |
| 29 | Langue des destinataires sans compte (invitations, contacts) : `metadata.locale` jamais transmis ? | à faire |
| 30 | Équipements stockés en français en base (`TagCatalog`) : traduction à l'affichage | à faire |
| 31 | Passage axe ou Lighthouse au navigateur (CDP) sur les cinq parcours, pour trancher les « à vérifier » d'accessibilité | à faire |
| 32 | Taille des envois côté API et proxy (`upload_max_filesize`, `post_max_size`, proxy Dokploy) face à un lot de 20 photos | fait (couvert par l'angle 10) |
| 33 | Poids JS par route publique sur un réseau 3G simulé (fiche bien, recherche) | à faire |
| 34 | Plan de bascule de la phase F côté SEO : Search Console, redirections, ancien index | à faire |
| 35 | Contenu des pages de facettes : texte propre par ville ou quartier, maillage interne | à faire |
| 36 | Webhooks de statut SMS et WhatsApp : jeton dans l'URL, signature, rejeu ; puller DLR Mtarget | à faire |
| 37 | `TRUSTED_PROXIES` derrière Traefik : les limiteurs par IP (`auth-phone-send`…) voient-ils le vrai client ? | à faire |
| 38 | Messagerie : `message_received`, `ConversationInviteNotification`, isolation des conversations | à faire |
| 39 | Webhook de paiement `refund` ou `failed` rejoué sur un paiement déjà soldé : effets, fenêtre de temps de la signature | à faire |
| 40 | Ablation réelle, par la session, des trois 🔴 de l'angle 12 (isolation de l'initiation, obligations RGPD, signature OM) | à faire |
| 41 | Chemins nominaux du BFF : cookie → Bearer, en-têtes relayés (`content-disposition` des exports RGPD) | à faire |
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

---

## Angle 1 — Recherche d'un bien

*Exploré le 2026-10-15 vers 0 h 30. Les trois 🔴 ont été relus contre le code par la session ; les
chiffres « mesurés » viennent de l'agent, sur la base et l'index Meilisearch de développement.*

### La recherche dans `/app` ne trouve ni les brouillons ni les biens privés, et ne trie pas par pertinence
- Réf : P01.01
- Statut : retenu · à valider — V6 : un second chemin de recherche interne demande un ADR (TCK-578)
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Models/Concerns/HasQueryBuilder.php:235`, `takussan-api/app/Models/Property.php:499-508`, `takussan-api/app/Http/Controllers/Api/PropertyController.php:80`, `takussan-web/src/lib/queries/properties-server.ts:126`
- Constat :
  - `filter[search]` de `/api/properties` passe par Meilisearch puis par un `whereIn`, alors que `shouldBeSearchable()` écarte de l'index les biens privés, brouillons, en revue et rejetés.
  - Mesuré : les biens privés 145-147 sont absents de l'index. Une recherche de leur titre exact rend 53, 70 et 103 autres biens, et jamais le bon.
  - Pas de `matchingStrategy` (relâchement `last`, corrigé côté public par TCK-338).
  - `defaultSort('-created_at')` est en dur, et le front envoie toujours `sort=-created_at` : la pertinence est perdue (lu).
- Piste : une recherche SQL sur le titre et la référence pour les listes internes, ou un index interne sans `shouldBeSearchable`. Utiliser `defaultSortsWithRelevance()`, et ne pas forcer `sort` quand une recherche est active.
- Mesure (2026-10-15, c8f7f127, mesureur) : lu `HasQueryBuilder.php:234-236` (filtre `filter[search]` = `search()->keys()` puis `whereIn`), `Property::shouldBeSearchable()` (`Property.php:499-509`), `PropertyController.php:80` (`->defaultSort('-created_at')` en dur) et `properties-server.ts:126` (`sort ?? '-created_at'`) ; tinker en lecture sur la base et l'index de dev, titre exact de trois biens non indexables (822 et 827 privés brouillons, 623 public brouillon) → 211 clés rendues pour chacun, jamais le bien cherché. Le défaut central est déjà décrit par TCK-578 (`todo`, étiqueté `adr-requise`), que le constat ne cite pas. `matchingStrategy` non re-mesuré. Classement : V6, la piste (recherche SQL interne ou second index) ouvre un second mécanisme de recherche que `check-filtering-single-mechanism.mjs` refuse et que TCK-578 renvoie à un ADR ; seule la restitution de la pertinence par `defaultSortsWithRelevance()` relèverait d'A1.

### Les quartiers proposés par le panneau ne correspondent pas aux quartiers indexés
- Réf : P01.02
- Statut : retenu · à valider — V4 : la piste est une migration de données sur les adresses
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

### Les suggestions de recherche ont une limite unique de 60 requêtes par minute pour tout le site
- Réf : P01.03
- Statut : retenu · autonome
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Providers/AppServiceProvider.php:373`
- Constat :
  - `Limit::perMinute(60)` est déclaré sans `->by()`. La clé est alors la même pour tous les visiteurs (lu dans `ThrottleRequests` et `Limit` du framework).
  - Le commentaire qui annonce `search-suggest|{ip}` est faux.
  - Le test (`tests/Feature/Api/Search/SearchSuggestTest.php:198`) vide une clé qui n'existe pas : il resterait vert dans les deux cas.
  - Avec un anti-rebond de 150 ms, une dizaine de personnes qui tapent en même temps font répondre 429 à tout le monde.
- Piste : `->by($this->visitorRateLimitKey($request))`, comme `public-read`, et un test avec deux IP distinctes.
- Mesure (2026-10-15, c8f7f127, mesureur) : lu `AppServiceProvider.php:372-373` (`Limit::perMinute(60)` sans `->by()`) et `ThrottleRequests` (clé `md5($limiterName.$limit->key)`, donc une seule clé pour tous) ; test temporaire, retiré depuis, qui envoie 60 appels de `10.0.0.1` à `/api/search/suggest` → l'appel suivant depuis `10.0.0.2` rend **429**. TCK-107 écrit la règle attendue (« rate-limit 60 req/min/IP », AC5 « depuis la même IP »). Classement : A1, le comportement attendu est écrit dans TCK-107 et dans le commentaire de la ligne 372, et le correctif reprend la clé `visitorRateLimitKey()` des limiteurs voisins, sans choix de produit.

### Deux recherches par changement de filtre, et des impressions Boost gonflées
- Réf : P01.04
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/hooks/useSearch.ts:183,360-364`, `takussan-web/src/app/[locale]/(public)/properties/(liste)/page.tsx:133-134`, `takussan-api/app/Services/Search/PropertySearchService.php:659`
- Constat :
  - `router.push` refait le rendu serveur, qui appelle déjà `rechercherBiensPublics`. La nouvelle graine est ignorée (`useReducer`/`useRef` ne la lisent qu'au montage), et le client relance la même recherche (lu ; à confirmer dans les journaux).
  - Chaque appel enregistre une impression sponsorisée, sans dédoublonnage (`BoostStatsRecorder.php:28`). C'est aussi le cas des revalidations ETag : un 304 recalcule tout (`routes/api/public.php:18-34`).
  - Or les impressions sont une métrique vendue aux agences.
- Piste : naviguer sans rendu serveur, ou consommer la graine à chaque nouvelle clé. Compter l'impression côté client, ou la dédoublonner par visiteur.

### Avec un tri par prix, la recherche élargie classe mal
- Réf : P01.05
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/scout.php:218`, `takussan-api/app/Services/Search/PropertySearchService.php:263-265`
- Constat :
  - `rankingRules` commence par `sort`. En régime élargi avec `price:asc`, le prix passe donc avant le nombre de mots trouvés.
  - Mesuré : `studio climatisation Thiès` rend [2,2,1…] mots trouvés sans tri, et [1,1,1…] avec.
- Piste : ranger `sort` après `words`, ou ne pas envoyer le tri dans le plan de repli.

### `SEARCH_ID_CAP` vaut en fait 1000, et la pagination publique aussi
- Réf : P01.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Models/Concerns/HasQueryBuilder.php:28`, `takussan-api/config/scout.php:150-254`
- Constat :
  - `pagination.maxTotalHits` est à 1000, le défaut de Meilisearch (mesuré). `take(5000)` ne rend donc que 1000 identifiants.
  - Côté public, au-delà de la page 25 (à 40 par page), les pages sont inaccessibles (lu ; à vérifier avec plus de 1000 biens).
  - `takussan-api/CLAUDE.md` annonce 5000.
- Piste : déclarer `maxTotalHits` dans `index-settings`, et corriger la doc.

### Des réglages d'index périmés font échouer la liste par défaut
- Réf : P01.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/scout.php:217`, `takussan-api/app/Services/Search/PropertySearchService.php:615`, `takussan-api/docker/release.sh:27-28`
- Constat :
  - Sur l'index local, `ranked_at` n'est pas triable, et les documents n'ont ni `ranked_at` ni `region`. `sort=ranked_at:desc` rend `invalid_search_sort` (mesuré) : une liste publique sans mot échoue en 500.
  - `release.sh` ne fait qu'avertir quand la synchronisation des réglages échoue.
- Piste : faire échouer le déploiement sur une synchronisation ratée, ou dégrader le tri au lieu de lever.

### Les facettes sont calculées à chaque recherche, et personne ne les lit
- Réf : P01.08
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Search/PropertySearchService.php:76,97,152`
- Constat : `neighborhood`, `bedrooms` et `type` sont demandées à Meilisearch à chaque requête. Le front ne lit `facets` nulle part : seule la déclaration de type `types/search.ts:608` le mentionne.
- Piste : les retirer, ou les afficher (« Mermoz (43) ») en facettes disjonctives.

### Une recherche d'un seul mot sans résultat n'a aucun repli
- Réf : P01.09
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Search/PropertySearchService.php:125`, `takussan-api/app/Models/Property.php:321-338`
- Constat :
  - Le repli exige au moins 2 termes. En dessous de 5 lettres, aucune faute n'est tolérée : `ker` rend 0, sans suggestion (mesuré).
  - Fonctionnent bien (mesuré) : la recherche par référence (`NSRKO42K`, `pr-nsrko42k`) et l'accent dans la requête (`Guediawaye` trouve `Guédiawaye`).
- Piste : en cas de zéro résultat, proposer les suggestions de `SuggestService` dans `SearchEmpty`.

### La carte charge toutes les photos, et les coordonnées ne sont pas indexées
- Réf : P01.10
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:521`, `takussan-api/app/Http/Resources/PropertyMapGeoJsonResource.php:49`
- Constat : `with('media')` charge toutes les photos de jusqu'à 501 biens pour n'en lire qu'une. `addresses` n'a aucun index sur `latitude`/`longitude` (mesuré, `pg_indexes`).
- Piste : charger la seule première photo, et ajouter un index `(latitude, longitude)` si la carte grossit.

## Angle 2 — Performances des requêtes

*Exploré le 2026-10-15 vers 0 h 45, sur la base de développement : `EXPLAIN` sans `ANALYZE` et
catalogue `pg_index`. Les deux 🔴 ont été relus contre le code par la session.*

Déjà sain (mesuré ou lu) :
- toutes les colonnes `agency_id` sont indexées ;
- `staleTime` vaut 5 min par défaut (`takussan-web/src/lib/query-client.ts:18`) ;
- les ressources utilisent `whenLoaded`.

### Liste des membres d'agence : une dizaine de requêtes par ligne
- Réf : P02.01
- Statut : retenu · autonome
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Controllers/Api/AgencyController.php:191`, `takussan-api/app/Http/Resources/UserResource.php:37,86-87`, `takussan-api/app/Models/Concerns/HasProfiles.php:82-95,229-262`, `takussan-api/app/Models/User.php:263-289`
- Constat :
  - Par membre, `UserResource` appelle `profileTypes()` (un `first()` et cinq `exists()`), l'accesseur `agency_id` (quatre `get()` sur les profils) et `getFirstMediaUrl('avatar')`.
  - Le front appelle cette route avec `per_page=100` juste pour remplir des listes de noms : `AuditTrail.tsx:203`, `ContactLeadsInbox.tsx:242`, `role-delegations.ts:157`.
  - Le sparse fieldset ne coupe aucun de ces calculs. Cela fait environ 1 100 requêtes par appel (lu ; le compte exact reste à mesurer).
- Piste : précharger les profils et `media`, ou ne sortir `roles` et `agency_id` que pour soi.
- Mesure (2026-10-15, c8f7f127, mesureur) : test temporaire, retiré depuis, `GET /api/agencies/{id}/members?per_page=1000&fields[users]=id,first_name,last_name` sous `DB::enableQueryLog()` → 129 requêtes pour 11 lignes, 459 pour 41, 1 669 pour 151, soit environ 11 par ligne, sparse fieldset compris. Lu `UserResource.php:37,86-87` (`getFirstMediaUrl`, `agency_id`, `profileTypes()`), `HasProfiles::profileTypes()` (cinq `exists()` sans regard pour les relations chargées, alors que `profiles()` les réutilise déjà). Classement : A2, précharger les profils et `media` et faire relire à `profileTypes()` les relations chargées rend la même sortie ; la variante de la piste qui retire `roles`/`agency_id` de la sortie relèverait de V7 et n'est pas couverte par ce classement.

### `per_page` sans plafond sur une vingtaine de routes
- Réf : P02.02
- Statut : retenu · autonome
- Gravité : 🔴 défaut avéré
- Où : `AgencyController.php:191`, `AuditLogController.php:57`, `PropertyPriceHistoryController.php:18`, `ServiceProviderProfileController.php:44`… (sous `takussan-api/app/Http/Controllers/Api/`)
- Constat :
  - `HasQueryBuilder::PER_PAGE_MAX = 100` ne borne que le `paginate()` sans argument. Un `paginate((int) $request->input('per_page', …))` le contourne.
  - La session en relit 17 de cette forme exacte ; l'agent en compte 23 en incluant les variantes.
  - TCK-599 n'a corrigé que les favoris. Combiné au constat précédent, `per_page=10000` sur les membres d'agence déclenche de l'ordre de 100 000 requêtes.
- Piste : une méthode unique `Controller::perPage($request, $défaut, $max)`, et une garde `scripts/check-*.mjs` qui refuse `paginate(` nourri de `$request->`.
- Mesure (2026-10-15, c8f7f127, mesureur) : `grep -rnE "paginate\([^)]*\$request"` sous `app/Http/Controllers` → 17 `paginate((int) $request->input('per_page', …))`, 3 `paginate($request->integer('per_page', 20))` (`ServiceProviderBillController`, deux `PlatformPayoutController`), 1 `paginate($request->input('per_page', 20))` brut (`RoleDelegationController.php:40`), aucun borné ; `ReviewController` et `FavoriteController` passent par `validated()` et sont exclus du compte. Test temporaire, retiré depuis : `per_page=1000` sur les membres d'agence → 200, `meta.per_page` = 1000. Aucun appelant du front n'envoie plus de 100 à ces routes (`grep per_page` dans `takussan-web/src`). Classement : A1 et A5, le plafond attendu est écrit (`HasQueryBuilder::PER_PAGE_MAX = 100`, borné par `min()`, appliqué aux favoris par TCK-599) et la garde ne resserre aucun seuil existant.

### Le profil plateforme est relu à chaque autorisation
- Réf : P02.03
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Providers/AppServiceProvider.php:678`, `takussan-api/app/Models/Concerns/HasProfiles.php:327-331`, `RequireTwoFactor.php:64`, `RequireRecentTwoFactor.php:45`, `LeaseResource.php:125`
- Constat :
  - `Gate::before` appelle `isSuperAdmin()`, qui fait une requête à chaque `can()`, sans mémoïsation.
  - Les middlewares 2FA ajoutent chacun un `exists()`.
  - `LeaseResource` l'appelle une fois par ligne. `ReviewController.php:67-70` contourne déjà le problème localement (lu).
- Piste : charger `platformProfile` une fois par requête, dans `ResolveActiveProfile`.

### 110 clés étrangères sur 252 sans index, dont une sur le chemin de `/api/auth/me`
- Réf : P02.04
- Statut : à mesurer
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

### `TagController` recompte ce que `withCount` a compté ; le tri des tags CRM pourrait être rejeté
- Réf : P02.05
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/TagController.php:20,45,143-147`, `takussan-web/src/app/(dashboard)/app/properties/[id]/page.tsx:62,104`, `takussan-api/app/Models/Tag.php:32`
- Constat :
  - Deux `count()` par tag sont faits après `withCount`. Cela fait environ 72 comptes à chaque ouverture d'une fiche de bien.
  - Ces équipements ne sont demandés qu'après la réponse du bien : deux requêtes en série (lu).
  - À vérifier : `fetchCrmTags` envoie `sort=-usage_count`, absent de `$requestSortable`. Le 400 serait masqué par `.catch(() => [])`, et les suggestions CRM seraient toujours vides.
- Piste : lire `properties_count`/`customers_count`, et lancer la requête des tags en parallèle de celle du bien.

### `whereDate()` sur un horodatage empêche l'usage de l'index
- Réf : P02.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `CalendarEventCollector.php:195-196,362-363`, `DashboardAgentService.php:114,140`, `Property.php:651,657`, `PaymentController.php:168-180`, `ExportDataService.php:453-460`
- Constat : `scheduled_at::date >= …` force un Seq Scan. Écrite en plage, la même borne passe par l'index `property_visits_scheduled_at_status_index` (mesuré). Sur une colonne `date`, le cast ne coûte rien.
- Piste : des plages `>= début du jour`, `< lendemain`.

### Export synchrone jusqu'à 50 000 modèles complets
- Réf : P02.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Export/ExportDataService.php:109,139,463-467`, `takussan-api/app/Http/Controllers/Api/ExportController.php:82`
- Constat : `limit(≤ 50 000)->get()` sans `select`, jsonb compris, pendant la requête HTTP (lu).
- Piste : sélectionner les colonnes exportées, `lazyById()` avec une réponse en flux, ou une tâche en file au-delà d'un seuil.

### La liste pro des biens fait six requêtes HTTP, dont deux en série
- Réf : P02.08
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/(dashboard)/app/properties/(liste)/page.tsx:97-125,210-229`
- Constat : la liste plus cinq `countProperties` (`per_page=1`), dont « vendus » suivi de « loués » en `.then` (lu).
- Piste : un seul endpoint de compteurs en `COUNT(*) FILTER (WHERE …)`, comme `DashboardAgencyService.php:42-52`.

### Fiche client : les notes sont chargées deux fois
- Réf : P02.09
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/queries/customers.ts:114`, `takussan-api/app/Http/Resources/CustomerResource.php:30`, `takussan-web/src/app/(dashboard)/app/customers/[id]/page.tsx:87-91`
- Constat : `include=notes` sérialise toutes les notes, puis la page les redemande paginées (lu).
- Piste : retirer `notes` de l'`include`.

### Onglets de visites : cinq requêtes au montage, et un cache jamais réutilisé
- Réf : P02.10
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/components/visits/VisitsList.tsx:37-71`
- Constat : un `useVisits` est lancé par onglet. `nowIso` entre dans la `queryKey` et change à chaque montage (lu).
- Piste : `enabled` réservé à l'onglet actif, et `nowIso` arrondi à la minute.

### `scheduled_task_runs` grossit sans purge
- Réf : P02.11
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Admin/HealthcheckService.php:142`
- Constat : environ 11 000 lignes en 34 jours en dev, et aucune purge. La sonde de santé fait un Seq Scan suivi d'un Sort à chaque minute (mesuré).
- Piste : un index `(task, last_run_at DESC, id DESC)` et une purge planifiée.

### Tri du catalogue public sans index adapté
- Réf : P02.12
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:156`
- Constat : `ORDER BY ranked_at DESC NULLS LAST, id DESC` force un Sort : l'index `ranked_at` est en ASC (mesuré).
- Piste : un index partiel `(ranked_at DESC NULLS LAST, id DESC) WHERE visibility = 'public' AND NOT is_test`.

### Pénalités de retard : le plafond est relu pour chaque échéance
- Réf : P02.13
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Lease/LateFeeCalculator.php:185,199`, `takussan-api/app/Jobs/Lease/ApplyLateFeesJob.php:52-56`
- Constat : une à deux lectures de `settings` par échéance, alors que la valeur est constante pour une agence. Le catalogue de TCK-651 met la valeur globale en cache ; la ligne d'agence ne l'est pas (lu).
- Piste : lire le plafond une fois par agence dans `applyForAgency`.

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
- Statut : retenu · à valider — V2 : garde d'autorisation sur un changement de rôle utilisé par le front
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

### `/api/users?include=…Profiles` fait sortir les profils des autres agences
- Réf : P03.02
- Statut : retenu · à valider — V2/V3 : périmètre d'agence et données personnelles exposées
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

### Les étiquettes CRM de toutes les agences sont lisibles par tout compte connecté
- Réf : P03.03
- Statut : retenu · à valider — V2 : restreindre une lecture que la recherche d'étiquettes utilise
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

### Sous impersonation, l'opérateur lit en clair les comptes de reversement de la cible
- Réf : P03.04
- Statut : à mesurer
- Gravité : 🟠 risque
- Où : `takussan-api/app/Http/Controllers/Api/Me/PayoutMethodController.php:21-31`, `takussan-api/app/Http/Resources/PayoutMethodResource.php:19-33`, `takussan-api/app/Http/Middleware/EnforceImpersonationReadOnly.php:44-58`
- Constat :
  - `account_identifier` et `account_holder_name` sont rendus au « titulaire », c'est-à-dire à la cible pendant une impersonation.
  - La route n'est ni dans `REFUSED_READS` ni sous step-up, alors que la donnée est chiffrée et cachée ailleurs (TCK-601). Le RIB du bailleur, lui, exige un step-up.
- Piste : masquer la forme claire sous `ImpersonationContext`, ou ajouter `api/me/payout-methods*` à `REFUSED_READS`.

### Dix endpoints valident avant d'autoriser (422 au lieu de 403)
- Réf : P03.05
- Statut : à mesurer
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

### Oracles d'existence entre agences
- Réf : P03.06
- Statut : à mesurer
- Gravité : 🟠 risque faible
- Où : `Api/DocumentController.php:57-63`, `Api/Accounting/BankStatementLineController.php:42` (avec `ReconciliationManager.php:51-53`), `Requests/Api/StoreConversationRequest.php:103-108`
- Constat :
  - `POST /api/documents` rend 404 `document.owner_not_found` avant l'autorisation : il dit si un bail, un client ou un bien d'une autre agence existe.
  - Le rapprochement bancaire distingue 404 et 403.
  - La conversation distingue « introuvable » et « non joignable » (lu).
- Piste : autoriser avant de résoudre, ou rendre le même code dans les deux cas.

### Le proxy `admin-users` ne relaie pas le profil actif
- Réf : P03.07
- Statut : à mesurer
- Gravité : 🟢 à vérifier
- Où : `takussan-web/src/app/api/admin-users/[[...path]]/route.ts:17-40`
- Constat : seul `Authorization` est relayé, sans `X-Active-Profile-Hint` ni cookie de profil. Pour un admin présent dans plusieurs agences, `UserAdminController:16-22` rendrait 403, et la console d'équipe serait inutilisable pour lui (lu, non mesuré).
- Piste : relayer l'indice de profil comme les fetchers serveur (`RequestOptions` de `src/lib/api.ts`).

## Angle 4 — Argent : montants, devises, arrondis, factures, paiements

*Exploré le 2026-10-15 vers 0 h 55, en lecture (et une mesure jsdom). Les quatre 🔴 ont été relus
contre le code par la session.*

### Échéancier trimestriel ou annuel : un seul mois de loyer facturé par période
- Réf : P04.01
- Statut : retenu · à valider — V1 : montant et période des échéances de loyer
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Model/LeaseService.php:203,220,245`
- Constat :
  - Chaque échéance vaut `monthly_rent`, et `period_end` est la fin du mois de l'échéance. `advancePeriod()`, lui, saute 3 ou 12 mois.
  - Un bail trimestriel de 12 mois produit donc 4 échéances d'un mois chacune : 4 mois de loyer facturés au lieu de 12.
  - Le formulaire propose « Trimestriel » avec un champ « Loyer mensuel » (`CreateLeaseForm.tsx:238`).
  - `GenerateLeasePaymentScheduleTest` ne teste aucune fréquence (lu).
- Piste : multiplier par le nombre de mois de la période, couvrir toute la période, et un test par fréquence.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu `LeaseService.php` `scheduleUnderLock()` (`$amount = monthly_rent`, l. 203 ; `period_start`/`period_end` = début et fin du mois de l'échéance, l. 224-225) et `advancePeriod()` (l. 241-247 : +1, +3 ou +12 mois), `CreateLeaseForm.tsx:43` (`quarterly`, `yearly` proposés) ; `git log -S` et `grep` des tickets → aucun correctif ni ticket ouvert ; seul `LeaseContractTermsTest.php` cite `quarterly`, aucun test d'échéancier par fréquence → le constat tient tel qu'écrit, lignes inchangées. Classement : V1, le correctif réécrit le montant et la période de chaque échéance de loyer.

### La révision de loyer n'atteint jamais les échéances déjà générées
- Réf : P04.02
- Statut : retenu · à valider — V1 : réécriture du montant d'échéances déjà générées
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Lease/RentReviewService.php:109`, `takussan-api/app/Services/Model/LeaseService.php:152,198`
- Constat :
  - `review()` ne modifie que `leases.monthly_rent`. L'échéancier entier est généré à l'activation, et refuse de se régénérer (`lease.schedule_exists`).
  - Aucun observateur ni écouteur ne réagit au loyer : la session n'en trouve aucun.
  - Le locataire est notifié du nouveau loyer, puis facturé à l'ancien jusqu'à la fin du bail. Le docblock (`:19-22`) dit le contraire.
  - Aucun test ne lit les `LeasePayment` après une révision (lu).
- Piste : à `effective_date`, réécrire le montant des échéances `pending` à venir, sous verrou du bail, et un test.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu `RentReviewService.php:109` (seul `forceFill(['monthly_rent' => …])`), `LeaseService.php:198` (`lease.schedule_exists`), `grep -rn effective_date app` → aucun lecteur hors `RentReviewService` et l'historique (`LeaseRentController.php:68`), aucun observateur ni écouteur sur `monthly_rent` ; `RentReviewServiceTest.php` ne lit aucun `LeasePayment` → le défaut tient. Précision : le docblock (l. 18-22) dit que le générateur lira `effective_date` comme borne, et que les échéances déjà émises ne sont PAS modifiées ; il décrit donc un générateur qui n'existe pas plutôt que « le contraire ». Classement : V1, la piste réécrit le montant d'échéances existantes, et le docblock en fait un choix (quelles échéances amender).

### L'annulation d'une résiliation anticipée annule une facture émise sans avoir
- Réf : P04.03
- Statut : retenu · à valider — V1 : annulation d'une facture émise et avoir
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Lease/EarlyTerminationService.php:162-163` (création en `:337`)
- Constat :
  - La facture de pénalité naît émise (`Sent`) et numérotée.
  - `cancel()` la passe en `Cancelled` par `forceFill`, sans `InvoiceService::cancel()`, donc sans avoir. ADR-0039 §7 exige un avoir pour annuler une facture émise.
  - Un numéro `FA-…` disparaît ainsi sans contrepassation. `EarlyTerminationServiceTest.php:151` ne vérifie pas l'avoir (lu).
- Piste : passer par `InvoiceService::cancel()`, et asserter `credited_invoice_id`.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu `EarlyTerminationService.php:162-164` (`$invoice->forceFill(['status' => Cancelled])->save()`), `:338-345` (facture créée `Sent` puis numérotée par `InvoiceNumberAllocator`) et `InvoiceService::cancel()` (l. 119-140 : avoir créé pour une facture `Sent`/`Overdue`, ADR-0039 §7) ; `EarlyTerminationServiceTest.php` ne cite ni `Cancelled` ni avoir → le constat tient, lignes inchangées. Classement : V1, le comportement attendu est écrit (ADR-0039 §7, A1), mais le correctif écrit une facture d'avoir, ce que V1 réserve au porteur.

### Restitution de caution : le champ refuse tout montant rond
- Réf : P04.04
- Statut : retenu · à valider — V1 : saisie des montants de caution, de loyer et de renouvellement
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

### Clôture plateforme : périmètre et devise du reversement
- Réf : P04.05
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Billing/PlatformPayoutService.php:234-276`
- Constat :
  - Tous les paiements `paid` de l'agence entrent dans le calcul, y compris les espèces et ceux encaissés par une intégration propre à l'agence. Or TCK-223 décrit un reversement de ce que la plateforme a encaissé.
  - La devise retenue est celle de la première ligne, sans contrôle de mélange.
  - La pénalité encaissée avec le loyer est absente du brut (lu ; intention à vérifier).
- Piste : borner aux paiements soldés par une intégration globale, inclure la pénalité, et refuser les devises mélangées comme le fait `PayoutCalculator`.

### La garde de sous-paiement ne s'applique pas à Lemon Squeezy, ni peut-être à Orange Money
- Réf : P04.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `PaymentGatewayService.php:606-609`, `LemonSqueezyDriver.php:159-172`, `OrangeMoneyDriver.php:65,148-149` (sous `takussan-api/app/Services/Payments/`)
- Constat :
  - La garde sort quand `metadata.amount` est absent, et `extractFees()` de Lemon Squeezy n'en fournit jamais.
  - Orange Money envoie `OUV`, la devise du bac à sable, pour du XOF. Le format des notifications est à vérifier.
- Piste : chaque pilote fournit le montant (en unité majeure) et la devise ; la devise Orange Money passe en configuration par environnement.

### Lemon Squeezy ignore la devise du payable
- Réf : P04.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Payments/Drivers/LemonSqueezyDriver.php:47-55,164`
- Constat : `$currency` n'est pas lu, et `custom_price` est exprimé dans la devise de la boutique. `extractFees()` mélange `total_usd` et des taxes en devise de boutique (lu ; comportement de l'API à vérifier).
- Piste : refuser quand la devise du payable diffère de celle de la boutique.

### Arrondis au centime sur du XOF
- Réf : P04.08
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `InvoiceService.php:58`, `CommissionLedgerService.php:82`, `DepositRefundService.php:58`, `PlatformPayoutService.php:266` comparé à `:199`
- Constat :
  - Ces calculs arrondissent à 2 décimales, alors que `PayoutCalculator` et `amountDue()` arrondissent à l'unité de la devise. Une TVA de 18 % sur 100 001 donne 118 001,18 XOF facturés pour 118 001 encaissés.
  - La clôture (arrondi par ligne, en PHP) et le détail (`SUM` en SQL) peuvent différer (lu).
- Piste : une seule fonction d'arrondi par devise (`Currency::decimalPlacesOf`), appliquée partout.

### Devise forcée, et affichage sans décimales hors XOF
- Réf : P04.09
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Invoice/InvoiceService.php:75`, `takussan-web/src/lib/format/useFormatteurs.ts:131-133`, `RevenueChart.tsx:171`
- Constat :
  - Une facture sans devise explicite part en XOF, même pour une agence en EUR.
  - `fmt.montant` impose 0 décimale à toute devise : 12,50 € s'affiche « 13 € ».
  - `RevenueChart` formate toujours en XOF (lu).
- Piste : par défaut, la devise de l'agence, et les décimales de `CURRENCY_METADATA`.

### Restitution d'une caution jamais encaissée
- Réf : P04.10
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Lease/DepositRefundService.php:55,74`
- Constat : le restituable part de `leases.deposit_amount`, jamais rapproché d'une `LeasePayment` de type `deposit` payée (lu).
- Piste : borner la restitution à ce qui a été encaissé.

### Référence fournisseur sans index ; paiement partiel inachevé
- Réf : P04.11
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `create_lease_payments_table.php:27`, `create_booking_payments_table.php:26`, `takussan-api/app/Models/Concerns/HasPaymentAttributes.php:219-228`
- Constat :
  - Chaque webhook cherche `transaction_id` sans index, et parcourt le JSON de l'historique.
  - L'idempotence tient malgré tout, grâce au verrou de ligne et à `gateway_events`.
  - Rien n'écrit `metadata.paid_amount` : le statut `partially_paid` n'a pas de montant (lu).
- Piste : un index sur `transaction_id`, et terminer ou retirer le paiement partiel.

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
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `deploy/takussan/compose.api.yml:65-68`, `takussan-api/routes/console.php:106,113,115,151,174`
- Constat :
  - Le service `scheduler` n'a pas de `stop_grace_period`, donc Docker attend 10 s.
  - PID 1 est `schedule:work`, et le sous-processus `schedule:run` ne reçoit jamais le signal : son verrou n'est pas rendu.
  - Le verrou vit dans Redis (`appendonly`) pendant `expiresAt = 1440` minutes.
  - `impersonation:close-expired`, `health:probe` et `boosts:tick` durent de 12 à 25 s en dev (mesuré). Un déploiement qui tombe pendant l'une d'elles la saute donc 24 h (lu ; non observé en préproduction).
- Piste : `->withoutOverlapping(N)` avec N proche de la période, et `stop_grace_period: 120s`.

### Les jobs qui ciblent un jour ou une heure exacts ne rattrapent rien
- Réf : P05.02
- Statut : à mesurer
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

### `SendLeasePaymentReminders` réserve tout un jalon avant d'envoyer
- Réf : P05.03
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Jobs/SendLeasePaymentReminders.php:57-105,115-147`
- Constat :
  - `claim()` marque toutes les échéances du jalon, puis la boucle envoie.
  - Si une exception survient au milieu, ou si le job est coupé à 60 s faute de `$timeout`, le reste est déjà marqué : le rejeu ne le renvoie jamais.
  - Aucun test ne simule un échec en cours de boucle (lu).
- Piste : réserver et envoyer échéance par échéance, ou rendre la réservation en cas d'échec, comme `SendSavedSearchAlerts`.

### `account:execute-deletions` : une suppression en échec bloque toutes les suivantes
- Réf : P05.04
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Console/Commands/ExecuteScheduledAccountDeletions.php:44-47`, `takussan-api/app/Services/Account/AccountDeletionService.php:406-413`
- Constat :
  - Il n'y a ni `catch` par demande ni `orderBy` : une `anonymize()` qui lève bloque, toutes les heures, toutes les suppressions RGPD échues après elle.
  - La seule trace est une ligne `failed` dans `scheduled_task_runs` (lu).
- Piste : un `try/catch` par demande, hors transaction, avec `report()`, et `orderBy('scheduled_for')`.

### Les notifications ne partent après le commit que grâce au driver `database`
- Réf : P05.05
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/queue.php:44,64,73` (`after_commit => false`), par exemple `LateFeeCalculator.php:162` et `BookingExpirationService.php:204-206`
- Constat :
  - Des notifications et des écouteurs `ShouldQueue` sont dispatchés dans des transactions. Avec la file `database`, la ligne `jobs` est annulée avec la transaction, donc le comportement est juste aujourd'hui.
  - Passer `QUEUE_CONNECTION` à `redis` (évoqué en `docs/configuration.md:136`) enverrait des notifications pour des écritures annulées. Rien ne garde cette propriété (lu ; aucun test trouvé).
- Piste : `after_commit => true` sur toutes les connexions de file, ou une garde.

### `retry_after` à 90 s est sous le `$timeout` de quatre jobs ; un seul worker sert aussi la file urgente
- Réf : P05.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `ExpirePendingBookingsJob.php:21,26` (300 s), `SyncPropertyCalendarFeedsJob.php:25` (540 s), `SendSavedSearchAlerts.php:83` et `SendFavoriteChangeAlerts.php:61` (1800 s) ; `docs/infra/hebergement.md:101` ; `deploy/takussan/compose.api.yml:55`
- Constat :
  - Un second consommateur, ou le worker relancé après un SIGKILL, réserve à nouveau un job en cours : rejeu ou échec parasite.
  - `worker` consomme `notifications-urgent,default` : une alerte de 30 min retarde d'autant une notification de maintenance urgente (lu ; durées en production à vérifier).
- Piste : `DB_QUEUE_RETRY_AFTER` au-dessus de 1800 s, ou une file dédiée aux balayages longs.

### `scheduled_task_runs` ne mesure que la mise en file des `Schedule::job`
- Réf : P05.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Admin/ScheduledRunRecorder.php`, et `Schedule.php:217-226` du framework
- Constat :
  - Pour les 19 jobs planifiés, la ligne mesure le dispatch : de 0 à 80 ms, toujours `finished` (mesuré). Un échec dans le worker n'apparaît que dans `failed_jobs`.
  - Le verrou du scheduler ne protège pas l'exécution, et aucun job planifié n'est `ShouldBeUnique` (lu).
- Piste : l'écrire dans `takussan-api/CLAUDE.md` § Tâches planifiées, et le middleware `WithoutOverlapping` sur les balayages.

### Petits écarts entre docblock et code
- Réf : P05.08
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Jobs/SendRawNotificationEmailJob.php:38-48`, `takussan-api/app/Console/Commands/BoostsTick.php:12-15` avec `BoostLifecycle.php:204-218`, `takussan-api/app/Jobs/Crm/SendProspectMatchDigest.php`
- Constat :
  - `SendRawNotificationEmailJob` attrape `\Throwable` dès le premier essai : `$tries` et `backoff()` sont inutiles. Son seul appelant n'est appelé nulle part (code mort, à vérifier). `SendDailyNotificationDigest` n'est ni planifié ni dispatché.
  - `boosts:tick` annonce que « chaque transition » est réclamée, mais `pause()` et `resume()` écrivent le modèle chargé.
  - `SendProspectMatchDigest` envoie avant de poser sa clé d'idempotence, et journalise `$e->getMessage()`, ce que TCK-601 interdit (lu).
- Piste : supprimer le code mort, réclamer par `UPDATE … WHERE`, et passer par `SafeExceptionContext::of($e)`.

### `onOneServer` et le fuseau horaire : pas de défaut aujourd'hui, un piège pour la production
- Réf : P05.09
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `deploy/takussan/compose.api.yml:65`, `takussan-api/config/app.php:70`, `deploy/server/compose.data.yml:31`
- Constat :
  - Il n'y a qu'un scheduler, et Dakar est en UTC+0 sans heure d'été.
  - La préproduction et la future production partageront `redis-takussan`. Avec le même `APP_NAME` et le même `REDIS_CACHE_DB`, leurs verrous de scheduler entreraient en collision : chaque environnement sauterait les tâches de l'autre (à vérifier quand la production existera).
- Piste : un `CACHE_PREFIX` par environnement.

## Angle 6 — Texte affiché par l'API et i18n fr/en/wo

*Exploré le 2026-10-15 vers 1 h 15, par lecture et par scripts node en lecture seule. Les six 🔴
ont été relus contre le code par la session ; le premier est mesuré (`route:list`).*

### La langue choisie dans l'interface n'atteint jamais le compte : e-mails, SMS et cloche partent en français
- Réf : P06.01
- Statut : retenu · autonome
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

### Messages système des groupes : rôle toujours « member », aperçu figé en français
- Réf : P06.02
- Statut : retenu · à valider — V7 : forme de l'aperçu des conversations
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Messaging/SystemMessageFactory.php:75,129-143`, `takussan-web/src/components/messages/SystemMessageBubble.tsx:36`, `takussan-api/app/Observers/MessageObserver.php:13`
- Constat :
  - L'API émet `metadata.role`, le front lit `meta.new_role ?? 'member'` : « X a changé le rôle de Y en member », pour tout changement, en jeton anglais brut, dans les trois langues.
  - `humanise()` écrit des `sprintf` en français dont l'observer tire `last_message_preview`, affiché tel quel par `ConversationList.tsx:194` (lu).
- Piste : aligner la clé, traduire le rôle, et dériver l'aperçu côté front depuis `metadata.event`.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu `SystemMessageFactory.php:68-75` (`metadata.role`), `:113` (`content` = `humanise()`), `:125-143` (`sprintf` français), `SystemMessageBubble.tsx:36` (`meta.new_role ?? 'member'`), `MessageObserver.php:13-17` (aperçu tiré de `content`) et `ConversationList.tsx:194` (affiché tel quel) → les deux défauts tiennent, lignes inchangées. Classement : V7, l'alignement de la clé `role` relèverait seul d'A1, mais dériver l'aperçu de `metadata.event` change le contrat de la liste des conversations et son rendu, un choix de produit.

### Les PDF (bail, état des lieux, quittances, facture) sont en français seulement, avec des dates dans une autre langue
- Réf : P06.03
- Statut : retenu · à valider — V6 : langue des actes juridiques, à décider par ADR
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

### Des messages de validation en français en dur, servis tels quels en `en` et `wo`
- Réf : P06.04
- Statut : retenu · autonome
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Requests/Api/StorePropertyMediaRequest.php:45-48`, `RejectPropertyRequest.php:24-26`, `InventorySignRequest.php:94-126`, `Agency/AssignAgencyRoleRequest.php:53`, `Agency/SyncCapabilitiesRequest.php:55`, `Permissions/StoreRoleDelegationRequest.php:80-86`
- Constat :
  - 14 messages sont des littéraux français.
  - `StoreRoleDelegationRequest` injecte des noms d'attribut français dans le gabarit de la langue active : « The utilisateur field is required. ».
  - Le front affiche `message` en le supposant localisé (`takussan-web/src/lib/api.ts:543`).
- Piste : des clés `lang/*/validation.php` ou des codes, et une garde qui refuse tout littéral dans `messages()`.
- Mesure (2026-10-15, f74f3d21, mesureur) : lu les six FormRequests → 14 littéraux français : `StorePropertyMediaRequest.php:45-48` (4), `RejectPropertyRequest.php:24-26` (3, fichier sous `Http/Requests/`, pas `Api/`), `InventorySignRequest.php` (5 `bail($fail, '…')` vers l. 94-126), `AssignAgencyRoleRequest.php:53` (1), `SyncCapabilitiesRequest.php:55` (1) ; `StoreRoleDelegationRequest.php:80-86` passe `'utilisateur'`, `'rôle'`, `'date de fin'`, `'motif'` comme `attribute` de `__('validation.*')` → le constat tient. Classement : A4, déplacer ces messages existants vers des clés `lang/{fr,en,wo}` sans changer le texte français n'ajoute aucun texte de produit, et la garde proposée relève d'A5 sans seuil à resserrer.

### Dates du site public figées en `fr-FR`
- Réf : P06.05
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyReviews.tsx:32`, `PropertyPriceHistory.tsx:16`, `takussan-web/src/components/public/profile/ReviewsSection.tsx:23`
- Constat :
  - En `/en`, la fiche publique affiche « 12 octobre 2026 ».
  - 11 autres locales sont figées : `PropertyModerationBanner.tsx:86`, `UpgradeRequestStatus.tsx:60,65`, `FilterSidebar.tsx:451-452`, `ActiveSessionsSection.tsx:103`, `PropertyKpiStrip.tsx:71`, `PropertyList.tsx:504`, `types/search.ts:388`.
  - 7 `toLocaleString()` nus dans `components/leases/*`.
  - `check-locale-figee.mjs` les tolère dans son cliquet (mesuré).
- Piste : `useFormatteurs()`, et faire descendre le plafond du cliquet.

### Wolof : 334 valeurs identiques au français, dont des phrases d'interface
- Réf : P06.06
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/messages/wo.json:5731-5734,3549`, `takussan-web/src/messages/fr.json:3897`
- Constat :
  - La parité des clés est exacte, mais 334 valeurs `wo` sont égales au `fr`, dont 46 visiblement françaises. Par exemple la navigation de l'assistant de publication (« Étape {current} sur {total} », « Précédent », « Continuer », « Plus tard »), `property.conditions.*` et `crm.pipeline.stage.*`.
  - `lease.form.customerFallback` vaut « Customer #{id} » en `fr`.
  - En anglais, seules 4 valeurs ressemblent à du français, toutes des noms propres (mesuré).
- Piste : relecture des 46 valeurs par un locuteur, et un cliquet décroissant « wo == fr hors emprunts » dans `check-i18n`.

### L'éditeur de gabarits de notification écrit du français dans les lignes `en` et `wo`
- Réf : P06.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Admin/NotificationTemplateService.php:58-60,96-112,152-165`
- Constat :
  - `fallbackBody()` ignore `$locale` et renvoie le corps français pour les trois langues.
  - Le front renvoie tous les `templates` à l'enregistrement (`notification-templates.tsx:80`). La première sauvegarde écrit donc du français en `en` et `wo`, et `renderActive()` préfère ces lignes à `lang/*` (lu ; lignes en base à vérifier).
- Piste : pré-remplir depuis `lang/{locale}/notifications.php`, et ne persister que les langues modifiées.

### Noms de champs non traduits : « Le champ is active est obligatoire »
- Réf : P06.08
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/lang/fr/validation.php` (bloc `attributes`), `takussan-api/lang/en/validation.php`
- Constat :
  - 55 attributs sont traduits en `fr` et `wo`, aucun en `en`, sur 406 noms de champ validés (mesuré).
  - TCK-651 l'a constaté aussi : « le champ value » pour toutes les clés du catalogue.
- Piste : traduire les champs que les formulaires remontent, ou ne jamais afficher la prose 422 et la remplacer par un libellé du front.

### Journal d'audit : des descriptions brutes qui mêlent français, anglais et codes
- Réf : P06.09
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/admin/AuditTrail.tsx:536`, `admin/super/ConsoleRecentActivity.tsx:77`, `user-detail.tsx:479`
- Constat : 147 `->log('…')` littéraux, dont 31 en français. Les autres sont en anglais (« Exported audit trail ») ou sont des codes (mesuré).
- Piste : afficher `event` traduit (`admin.audit.events.*`), et réserver `description` à l'export.

### Pluriels absents
- Réf : P06.10
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/messages/fr.json:95` (lue par `Navbar.tsx:518`), `takussan-web/src/components/dashboard/admin/AgencyKpis.tsx:51`
- Constat :
  - 49 messages `fr` (50 en `en`) écrivent `{count} <nom>` sans ICU `plural` : « 1 biens », « 1 months ».
  - 7 formes « (s) ».
  - `AgencyKpis` passe un nombre déjà formaté dans `count` (mesuré).
- Piste : ICU `plural`, et une règle de `check-i18n` sur `{count} [a-z]` sans `plural`.

### Titre d'annonce suggéré en langue mêlée
- Réf : P06.11
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/property-form/wizard/suggest-title.ts:47,59`
- Constat : « chambres » et « à » sont en dur. Résultat en `en` : « Apartment 3 chambres à Almadies » (lu).
- Piste : une clé ICU avec `plural`.

### Libellés du catalogue super-admin écrits en français par l'API
- Réf : P06.12
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Domain/Settings/EditableBusinessEnums.php:20-40`, `Domain/Notifications/EditableNotificationEvents.php:13-29`, `Domain/Integrations/Providers/MailProvider.php:26`
- Constat : `name` et `description` sont affichés tels quels par `business-enums.tsx:117-118` et `notification-templates.tsx:101` (lu). Les paramètres plateforme, eux, sont traduits par clé depuis TCK-600.
- Piste : émettre une clé, et rendre le libellé côté front.

### Des documents qui affirment l'inverse de la mesure
- Réf : P06.13
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `CLAUDE.md` (principe n° 5), `takussan-web/CLAUDE.md` (section i18n), `PropertiesDiscoveryPage.tsx:333`
- Constat :
  - `check-i18n --report` mesure 0 texte en dur toléré : « tenue à 82 fichiers sur 875 » est périmé.
  - « wo traîne 88 clés manquantes » est faux : il en manque 0.
  - « `lang/fr/validation.php` ne porte pas `boolean` » est faux aussi (mesuré).
- Piste : remplacer ces chiffres par la commande qui les donne.

### Pages légales vides en wolof
- Réf : P06.14
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/content/legal/terms.ts:445`, `privacy.ts:351`, `notice.ts:125`
- Constat : ``export const wo = ``;``. La page affiche le français avec une mention, et c'est documenté (lu).
- Piste : traduction à planifier, ou mention dans la spec.

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
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/globals.css:758-760,773-777`, `takussan-web/src/components/search/SearchAutocomplete.tsx:65`
- Constat :
  - Pastille de prix : `#fcf9f3` sur `#c87a52` est à **3,14:1**, et **3,83:1** au survol (`#b66c43`), en 12 px gras.
  - Surlignage des suggestions : `<mark>` en `text-primary` sur `bg-primary/15`, à 4,33:1 (mesuré).
- Piste : la pastille lit `--primary` (5,06:1) au lieu d'une valeur recopiée en dur ; `--primary-deep` pour le surlignage.

### Encre atténuée sous le seuil sur quatre parcours
- Réf : P07.02
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/agency/BrandingBanner.tsx:42`, `takussan-web/src/components/leases/EarlyTerminationBanner.tsx:93`, `takussan-web/src/components/property-dashboard/ProprietaireEtResponsable.tsx:45,52`, `PropertyVisitDialog.tsx:288,352`
- Constat :
  - `text-warning/80` sur `bg-warning/10` : 3,53:1.
  - `text-muted-foreground/70` : de 2,95 à 3,03:1.
  - Même famille : `AvailabilityGrid.tsx:109` (3,70:1) et `ui/calendar.tsx:82`, où les jours hors du mois sont à 2,11:1 (mesuré).
- Piste : retirer l'opacité (`text-warning` est à 5,17:1, `text-muted-foreground` à 5,44:1), et une garde « pas d'alpha sur une encre de texte », comme TCK-359 pour les onglets.

### L'erreur de la barre d'actions groupées est illisible
- Réf : P07.03
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/property-dashboard/PropertyList.tsx:688,757`
- Constat : `role="alert"` en `text-destructive` sur `bg-foreground/95`, à **2,22:1**. Les gardes `check-destructive-contrast` ne mesurent pas ce fond (mesuré).
- Piste : une pastille claire (`bg-background text-destructive`), ou l'encre claire de la barre avec une icône.

### La note des avis est invisible au lecteur d'écran
- Réf : P07.04
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyReviews.tsx:73-81`
- Constat :
  - La note n'est rendue que par cinq `<Star>`, que lucide marque `aria-hidden`, et aucun texte ne la porte.
  - Les étoiles vides (`/40`) sont à 1,78:1, sous les 3:1 d'un objet graphique (lu, mesuré).
- Piste : `role="img" aria-label={t('rating', {n})}`, ou un `sr-only` « 4 sur 5 », et les étoiles vides en `text-muted-foreground` plein.

### Une ligne de versement cliquable seulement à la souris
- Réf : P07.05
- Statut : à mesurer
- Gravité : 🔴 défaut avéré (console super-admin)
- Où : `takussan-web/src/components/billing/PayoutTable.tsx:120-123`, appelée avec `onSelect` par `AdminPayoutsClient.tsx:96`
- Constat : `<tr onClick>` sans rôle, sans `tabIndex` ni clavier, et aucun bouton dans la ligne : le détail est inatteignable au clavier (lu).
- Piste : un `<button>` dans la cellule de période, comme `InvoicesTable.tsx:100`.

### Champ de recherche principal : pas de libellé, et focus peu visible
- Réf : P07.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/search/SearchAutocomplete.tsx:226-262`, `takussan-web/src/components/home/Navbar.tsx:419,677`
- Constat :
  - L'input n'a ni `<label>` ni `aria-label` : le placeholder seul le nomme.
  - Il porte `outline-none`, sans `focus-within:` sur la pilule.
  - `role="combobox"` est sur le `div`, selon le motif ARIA 1.1 (lu ; rendu du focus à vérifier).
- Piste : un `aria-label` traduit, le motif ARIA 1.2, et `focus-within:ring-2` sur la pilule.

### Des erreurs de champ ni reliées ni annoncées hors des `Form*`
- Réf : P07.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `PropertyVisitDialog.tsx:263,270,276,283`, `PropertyContactMessageDialog.tsx:96`, `PropertyReservationDialog.tsx:440`, `PropertyReviews.tsx:281`, `leases/CreateLeaseForm.tsx:347,359`, `leases/DepositRefundModal.tsx:182,215`
- Constat : 13 contrôles sur 49 qui portent `aria-invalid` n'ont pas de `aria-describedby`, et 48 `<p class="text-destructive">` n'ont pas de `role`. Les `Form*` sont bien câblés (mesuré).
- Piste : migrer ces champs vers `FormInput`/`FormError`.

### Des champs nommés par le seul placeholder
- Réf : P07.08
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `search/FilterSidebar.tsx:161,172,183`, `PropertyContactMessageDialog.tsx:89`, `PropertyReviewForm.tsx:94,102`, `PropertyPagination.tsx:113`
- Constat :
  - 21 champs ne sont nommés que par leur placeholder, et 2 n'ont aucun nom.
  - Le sélecteur de taille de page (un `SelectTrigger`, donc un `<button role="combobox">`) est sans nom, dans 8 listes (mesuré).
- Piste : `aria-labelledby` vers le titre de section, et un `aria-label` sur le sélecteur de taille de page.

### Anneau de focus à 50 % (2,08:1) et bordure des champs à 1,26:1
- Réf : P07.09
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/ui/button.tsx:31`, `ui/input.tsx:20`, `takussan-web/src/app/globals.css:163,694`
- Constat :
  - `ring-ring/50` est à 2,08:1 sur `--background` ; sur un bouton plein, c'est le seul signal de focus. TCK-371 l'avait relevé, et aucun ticket n'a été ouvert.
  - `--input: #ebe5d5`, seul contour d'un champ, est à 1,26:1 (WCAG 1.4.11, mesuré).
- Piste : un anneau plein ou `outline-2 outline-offset-2`, et un jeton `--input` propre, autour de 3:1.

### Focus du marqueur de carte, visionneuse sans nom, entrée verrouillée hors du clavier
- Réf : P07.10
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/globals.css:773-777`, `PropertyLightbox.tsx:55`, `takussan-web/src/components/layout/AppSidebar.tsx:557-568`
- Constat :
  - Le marqueur au focus n'a qu'un écart de 1,22:1 avec son état normal, et porte `outline: none`.
  - Le `Popup` de la visionneuse n'a pas de nom.
  - `<span role="link" aria-disabled title>` n'est pas focusable, et la raison du verrou n'est que dans `title` (signalé par TCK-371, toujours présent).
- Piste : un `outline` blanc de 2 px décalé ; `aria-label` sur le `Popup` ; `tabIndex={0}` et la raison en `sr-only`.

### Le mouvement réduit est ignoré par les primitives
- Réf : P07.11
- Statut : à mesurer
- Gravité : 🟠 risque ou dette (AAA, mais la charte en fait une règle)
- Où : `ui/sheet.tsx:104-110`, `ui/dialog.tsx:58`, `ui/popover.tsx`, `ui/select.tsx`, `property/cards/PropertyRow.tsx:184`
- Constat : `slide-in` et `zoom-in` de tw-animate-css ignorent `prefers-reduced-motion`, aucun `motion-reduce:` n'apparaît, et `scrollBy({behavior:'smooth'})` n'est pas conditionné (mesuré).
- Piste : `motion-reduce:animate-none` dans les primitives.

### Le lint d'accessibilité est presque éteint
- Réf : P07.12
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/eslint.config.mjs:37-39`
- Constat : 6 règles `jsx-a11y` seulement, en `warn`. Ni `label-has-associated-control`, ni `click-events-have-key-events`, ni `no-static-element-interactions` : aucune garde n'aurait attrapé les constats ci-dessus (lu).
- Piste : ces règles en `error`, sous un cliquet par fichier comme `check-i18n`.

### Boutons « Ouvrir » sans contexte, tableaux sans titre
- Réf : P07.13
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où : `payments/InvoicesTable.tsx:100-106`, `PayoutsTable.tsx:116`, `PaymentsHistoryTable.tsx`, `billing/PayoutTable.tsx`, `PropertyReviewForm.tsx:76`
- Constat : « Ouvrir » répété N fois, des tableaux sans `<caption>`, et des `role="radio"` sans navigation aux flèches (lu).
- Piste : « Ouvrir la facture {réf} », et passer ces tableaux par `console/DataTable`, qui impose une `caption`.

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
- Statut : à mesurer
- Gravité : 🔴 défaut avéré (un envoi réel reste à rejouer)
- Où : `takussan-web/next.config.ts` (pas de clé `serverActions`), `takussan-web/src/app/actions/dashboard-properties.ts:243`, `takussan-web/src/components/property-form/PropertyWizard.tsx:325-329`, `takussan-web/src/components/property-dashboard/PropertyMediaPanel.tsx:71`
- Constat :
  - Sans `serverActions.bodySizeLimit`, Next refuse tout corps de server action au-delà de 1 Mo (`node_modules/next/dist/server/app-render/action-handler.js:517-519`, relu par la session). Le multipart est concerné.
  - Le wizard met toutes les photos dans un seul `FormData`, alors qu'une seule photo réduite pèse 1 446 048 o (mesure de TCK-542, qui dit n'avoir « rejoué aucun envoi réel vers l'API »).
  - Même plafond pour `dashboard-customers.ts:175` (documents) et `admin-agency.ts:110`.
  - `MediaManager.tsx:172-190` simule la progression jusqu'à 85 %, puis tout tombe d'un coup.
- Piste : une photo par requête, par route handler BFF ou directement vers l'API, avec une vraie progression (XHR) et une reprise par fichier. Relever `bodySizeLimit` seul ne règle pas le réseau lent.

### Les dialogues n'ont ni hauteur maximale ni défilement
- Réf : P08.02
- Statut : à mesurer
- Gravité : 🔴 défaut avéré (rendu à vérifier)
- Où : `takussan-web/src/components/ui/dialog.tsx:58`, `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx:172`
- Constat :
  - La primitive est `fixed top-1/2 -translate-y-1/2`, sans `max-h` ni `overflow-y-auto` (relu). Seuls 3 `DialogContent` sur 75 l'ajoutent.
  - Le dialogue de visite empile la date, 20 créneaux en 5 rangées, quatre champs et le bouton : environ 640 px estimés. Sur un 360×640, le titre et « Envoyer » sortent de l'écran, et le verrou de défilement interdit d'y aller.
  - Même risque pour `CreateInvoiceDialog`, `InviteAgentDialog` et `GuarantorSection` (comptage).
- Piste : `max-h-[calc(100dvh-2rem)] overflow-y-auto` dans la primitive, ou un pied collant ; une feuille du bas sous `sm`.

### Un montant hors pas bloque l'envoi des formulaires de bail et de paiement
- Réf : P08.03
- Statut : à mesurer
- Gravité : 🔴 défaut avéré — même famille que « Restitution de caution » à l'angle 4
- Où : `takussan-web/src/components/leases/CreateLeaseForm.tsx:233,243,253`, `LeasePaymentDialog.tsx:92`, `DepositRefundModal.tsx:172`, `bookings/BookingPaymentDialog.tsx:91`, `payments/CreateInvoiceDialog.tsx:227`
- Constat : `FormInput` transmet `step` (`components/forms/FormInput.tsx:90`), et aucun de ces 5 formulaires n'a `noValidate`. Un loyer de 75 500 ou un paiement de 12 350 sont refusés avant `onSubmit` (lu).
- Piste : retirer `step` (zod valide déjà), ou poser `noValidate`. À traiter avec l'angle 4, en un seul ticket.

### Les marges de zone sûre sont sans effet : pas de `viewport-fit=cover`
- Réf : P08.04
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/layout.tsx` (pas d'export `viewport`) ; 9 usages d'`env(safe-area-inset-bottom)`, dont `home/Navbar.tsx:676,811,855`, `search/FilterSidebar.tsx:1099`, `wizard/WizardShell.tsx:99`
- Constat : `viewport-fit` est absent de `src/`, donc iOS rend `env(safe-area-*)` à 0. TCK-477 garde le consommateur, pas le viewport (mesuré ; iPhone réel à vérifier).
- Piste : `export const viewport = { viewportFit: 'cover' }`, puis relire les en-têtes fixes en paysage.

### Brouillons : les photos ne sont jamais sauvées, rien n'est gardé hors ligne
- Réf : P08.05
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/property-form/PropertyWizard.tsx:240,465-470`, `takussan-web/src/hooks/useWizardDraft.ts:166-188`
- Constat :
  - Les photos ne vivent qu'en mémoire : un onglet tué par Android pendant l'appareil photo les perd.
  - L'autosave fait un `PUT` serveur sans copie locale, et sans relance au retour du réseau (aucun `online` ni `offline` dans `src/`, mesuré).
- Piste : une copie IndexedDB (valeurs et `File`) et une relance sur `online`.

### Les formulaires longs hors wizard n'ont aucun brouillon
- Réf : P08.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/leases/CreateLeaseForm.tsx` (11 champs), `customer-form/CustomerForm.tsx` (17), `property-form/PropertyForm.tsx` (13)
- Constat : aucune persistance, et aucun `beforeunload` dans `src/` (mesuré).
- Piste : `useWizardDraft` sous une clé par écran, comme `WizardReprenable`.

### Des tableaux sans alternative en cartes, l'action en dernière colonne
- Réf : P08.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/console/DataTable.tsx:140`, `owners/OwnersList.tsx:209-230`, `service-providers/ServiceProvidersList.tsx:163,223`, `commissions/CommissionsLedger.tsx:126,212`, `payments/InvoicesTable.tsx:74,99-106`
- Constat : sur 32 consommateurs de `DataTable`, seuls `CustomerList` et `PropertyList` ont une liste mobile. Ailleurs, l'action ne s'atteint qu'après un défilement horizontal (mesuré).
- Piste : une option `carteMobile` dans `DataTable`, ou la ligne cliquable avec l'action en tête.

### Barres d'onglets sans défilement
- Réf : P08.08
- Statut : à mesurer
- Gravité : 🟠 risque ou dette (à vérifier)
- Où : `takussan-web/src/components/ui/tabs.tsx:27,87`, `payments/PaymentsTabs.tsx:81`, `property-dashboard/PropertyDetailTabs.tsx:71`
- Constat : 5 onglets totalisent environ 53 caractères pour 328 px, sans enveloppe `overflow-x-auto` (contrairement à `CustomerDetailTabs.tsx:65`). C'est `<main>` qui défilerait de côté, et la sonde de TCK-505 ne le voit pas (lu).
- Piste : reprendre le patron de `CustomerDetailTabs` dans la primitive.

### Zoom iOS sur des champs faits main en `text-sm`
- Réf : P08.09
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `inventory/RoomEditor.tsx:140`, `admin/InviteAgentDialog.tsx:136,154,175,194`, `admin/InviteMemberDialog.tsx:111`
- Constat : les primitives sont saines (`text-base md:text-sm`), mais ces champs sont sous 16 px, et Safari zoome au focus (mesuré).
- Piste : `Input`/`Textarea`, ou `text-base md:text-sm`.

### Petites améliorations
- Réf : P08.10
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Où et constat (lu ou mesuré) :
  - `leases/GuarantorSection.tsx:81-84,188-192` : téléphone du garant sans `type="tel"` ni lien `tel:` ;
  - `CreateLeaseForm.tsx:229-253` : `type="number"` sans `inputMode` ;
  - `ui/sheet.tsx:102` : `max-h-[90vh]`, alors que `PropertyListFilters.tsx:395` corrige déjà en `88dvh` ;
  - fiches publiques de bien, d'agence et d'agent sans `loading.tsx` : ce sont les pages ouvertes depuis WhatsApp ;
  - `capture` absent de l'état des lieux et des photos du bien (`InventoryDetail.tsx:263`, `StepPhotos.tsx:31`).
- Piste : `PhoneInput`, `FormAmountInput`, `90dvh` dans la primitive, des squelettes de chargement, et un second bouton « Prendre une photo » avec `capture="environment"`.

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
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `origin/master` à `fefe2c87` (2026-08-15), servi par Vercel (`docs/infra/frontend-deploiement.md:13`) ; `takussan-web/src/app/robots.ts` date du 2026-08-27 (TCK-431)
- Constat :
  - Sur www.takussan.com, `/robots.txt` et `/sitemap.xml` rendent **404** (mesuré à nouveau par la session).
  - `/fr` rend 404, et `/` rend 200 sans canonique, `hreflang` ni `og:*`.
  - `master` a **1 845 commits** de retard sur `dev`.
  - TCK-431 à 436 et 598 n'existent qu'en préproduction et en local. `docs/ardoise.md` ne dit pas que le SEO n'est pas en ligne.
- Piste : l'écrire dans l'ardoise et le rattacher à la phase F (TCK-517) ; à la bascule, soumettre le sitemap à la Search Console.

### Les combinaisons de facettes sans résultat sont indexables (soft-404)
- Réf : P09.02
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/[locale]/(public)/properties/(liste)/page.tsx:47-55`, `takussan-web/src/lib/canonique.ts:284`
- Constat :
  - `/fr/properties?type=factory&contract_type=rent&city=Dakar` rend 200 avec `total: 0`, le titre « Usine à louer à Dakar », `index, follow` et une canonique vers elle-même (mesuré en local).
  - Chaque valeur de facette est validée seule, jamais leur combinaison : types × contrats × villes × quartiers × 3 langues donne autant de pages vides indexables.
  - `generateMetadata` ne pose aucun `robots` (relu). Les annuaires, eux, ont `facette.indexable` (`agencies/page.tsx:53`).
- Piste : `robots: { index: false, follow: true }` quand `total === 0`, en partageant le résultat de la recherche avec `generateMetadata` par `cache()`.

### Pas d'aperçu WhatsApp ou Facebook hors des fiches
- Réf : P09.03
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/[locale]/(public)/page.tsx:20-23`, `(public)/properties/(liste)/page.tsx:47`, `(public)/agencies/page.tsx:42`, `(public)/properties/[slug]/page.tsx:115-126`
- Constat :
  - `/fr` n'émet aucun `og:*` ni `twitter:*` : l'accueil, une ville ou un quartier partagés sur WhatsApp n'ont ni image ni description.
  - Aucun `opengraph-image`.
  - Sur la fiche manquent `og:url`, `og:locale`, `og:site_name` et les dimensions, et l'image vient de la conversion `preview` en 800×600 (mesuré pour `/fr` ; `og:image` d'une fiche avec photo à vérifier).
- Piste : un `opengraph-image` 1200×630, un `openGraph` par défaut dans le layout public, et une image par ville ou par quartier.

### JSON-LD de la fiche : prix sur le mauvais type, contrat et période absents
- Réf : P09.04
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/jsonld-property.ts:81,97,102`
- Constat :
  - `priceSpecification` est posé sur `Apartment`, `House` ou `Place`, alors qu'il appartient à `Offer`.
  - `contract_type` et `rent_period` ne sont pas émis : un loyer ressemble à un prix de vente.
  - Pour un terrain, un bureau ou un parking, `floorSize`, `numberOfBedrooms` et `yearBuilt` sont hors domaine (mesuré, lu). La devise XOF, elle, est bien présente.
- Piste : `RealEstateListing.offers` → `Offer { price, priceCurrency, businessFunction }`, plus un `UnitPriceSpecification` `unitCode: MON` pour la location.

### Chaque fiche a trois URL au contenu principal identique
- Réf : P09.05
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/alternates.ts:172`, `takussan-web/src/i18n/routing.ts:252`
- Constat :
  - `/fr`, `/en` et `/wo` sont indexables, chacune canonique à elle-même, alors que le titre et la description ne sont saisis qu'en français : l'API ne traduit pas le contenu.
  - Le sitemap triple le volume (lu ; effet sur l'index à vérifier).
- Piste : un ADR qui tranche entre fiches `en`/`wo` indexables, ou canonique vers `fr` et retrait du sitemap.

### Tout le site public est rendu de façon dynamique
- Réf : P09.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/layout.tsx:67`
- Constat : le layout racine lit `cookies()`, ce qui rend toute page publique dynamique, sans cache HTML. Chaque passage de robot refait le rendu complet (lu ; build courant à vérifier).
- Piste : sortir la session du rendu serveur de la coque publique, puis de l'ISR avec `revalidate` et des tags sur les fiches et les facettes.

### La bascule fera répondre 307 aux URL non préfixées déjà indexées
- Réf : P09.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/proxy.ts:161`
- Constat : le 307 avec `Vary: Cookie, Accept-Language` est délibéré (ADR-0026). Mais la production sert aujourd'hui `/properties` sans préfixe : tout l'index actuel passera par une redirection temporaire, et Googlebot finira sur `/fr` (mesuré, lu).
- Piste : le décider dans le plan de bascule, par exemple une 308 pour les robots, ou accepter le délai explicitement.

### Petites améliorations
- Réf : P09.08
- Statut : à mesurer
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

## Angle 10 — Médias : tailles, conversions, disques, nettoyage

Les deux 🔴 ont été relus par la session dans le code : le `catch` de `PropertyMediaController::store`, `FileAdder::processMediaItem` (la ligne est enregistrée avant la copie et la conversion), et l'absence de toute règle `dimensions:` dans `app/Http`.

### Un lot de photos qui échoue laisse le média raté attaché au bien
- Réf : P10.01
- Statut : à mesurer
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

### Aucune borne de dimensions : une bombe de décompression tue la requête
- Réf : P10.02
- Statut : à mesurer
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

### Les limites de taille, couche par couche, ne laissent pas passer 20 photos
- Réf : P10.03
- Statut : à mesurer
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

### `media:cleanup` détruit les médias des modèles supprimés en douceur
- Réf : P10.04
- Statut : à mesurer
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

### Avatars : l'original public garde l'EXIF, GPS compris
- Réf : P10.05
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Models/User.php:405`, `takussan-api/app/Http/Controllers/Api/Auth/AuthController.php:210-213`, `takussan-web/src/lib/reduire-photo.ts:10`, `takussan-api/app/Http/Resources/UserResource.php:37`
- Constat :
  - L'avatar vit sur le disque public et il est servi en original, pages publiques d'agent comprises.
  - Ni le serveur ni le front ne retirent les métadonnées sous 2560 px : un selfie, ou un appel direct à l'API, publie sa position GPS.
  - Les photos de bien ne fuient pas : l'original est privé, et les conversions GD ne recopient pas l'EXIF.
  - Établi comment : lu.
- Piste : servir une conversion carrée réencodée et garder l'original privé, ou retirer l'EXIF à l'upload.

### La règle `image` seule accepte le HEIC, que la chaîne ne sait pas traiter
- Réf : P10.06
- Statut : à mesurer
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

### Collection `documents` : 25 Mo validés, 10 Mo acceptés par Spatie
- Réf : P10.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Requests/MediaUploadRequest.php:16`, `takussan-api/app/Http/Requests/GenericMediaUploadRequest.php:19`, `takussan-api/config/media-library.php:55`
- Constat : un fichier de 10 à 25 Mo passe la validation, puis Spatie lève `FileIsTooBig`. Aucun gestionnaire ne le traduit, et la réponse est un 500 (lu).
- Piste : aligner les deux plafonds, et traduire `FileCannotBeAdded` en 422.

### `POST /api/media/upload` : un point d'écriture mort et ouvert
- Réf : P10.08
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/routes/api/media.php:12`, `takussan-api/app/Http/Controllers/Api/MediaController.php:70-93`
- Constat :
  - Aucun appelant dans le front (grep).
  - Tout compte peut y déposer 30 fichiers par minute dans `User.photos` ou `User.documents`, et rien ne les lit ni ne les nettoie.
  - `HasMediaConversions` produit trois conversions pour chaque image de `User`, avatar compris, sans que rien ne les serve : des écritures R2 de classe A pour rien.
  - Établi comment : lu.
- Piste : retirer la route ; limiter les conversions aux collections affichées (`performOnCollections`).

### Réordonner les photos change leurs URL
- Réf : P10.09
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/PropertyMediaController.php:122`, `takussan-api/config/media-library.php:160`
- Constat : `update(['order_column'])` touche `updated_at`, or `version_urls` construit `?v=<updated_at>`. Chaque déplacement crée donc un défaut de cache, et de nouvelles transformations Cloudflare pour ce qui passe encore par elles (lu).
- Piste : mettre à jour `order_column` sans toucher aux horodatages, ou versionner sur un champ dédié.

### Petites améliorations
- Réf : P10.10
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Constat (lu) :
  - **Optimiseurs** (`config/media-library.php:167-205`) : ils sont configurés, mais ni `jpegoptim`, ni `cwebp`, ni `avifenc` ne sont installés dans l'image (`Dockerfile:20`). Spatie les saute en silence, et le commentaire `--strip-all` laisse croire que l'EXIF est retiré.
  - **`next/image`** (`takussan-web/next.config.ts:113-166`) : `dangerouslyAllowSVG` et `dangerouslyAllowLocalIP` sont actifs en production, sans `contentSecurityPolicy`. Le commentaire de `deviceSizes` cite `preview` 800 px comme plus grande image, alors que c'est `full` 1600 px. Des avatars jusqu'à 2560 px sont affichés en 32 à 64 px.
  - **Fichiers privés** : rien n'est rangé au mauvais endroit (KYC, baux, documents, états des lieux : disque privé). L'URL présignée dure 5 min, l'URL d'API signée 30 min. Reste à vérifier : la signature apparaît-elle dans le journal Traefik ?
- Piste : installer les binaires ou retirer le bloc ; couper les deux options `dangerously*` hors développement ; servir l'avatar en conversion.

Angles voisins : mémoire et `--timeout` de `worker-media` face aux originaux de 48 Mpx ; contenu réel de `storage/media-library/temp` en préproduction ; facture Transformations et R2 au tableau de bord Cloudflare.

## Angle 11 — Notifications : doublons, préférences, échecs

Les trois 🔴 ont été relus par la session dans le code :
- `AuthController::register` crée l'utilisateur sans `preferred_language`, et `NotificationService.php:89` lit `preferredLocale()` ;
- `AgentInvitationService.php:84` appelle `send()` depuis son propre `DB::transaction`, et `InvitationMailable` n'implémente pas `ShouldQueue` ;
- `SmsRouterDriver::deferAll()` (l. 214) remet le texte rendu à `SendDeferredSmsJob`, qui n'implémente que `ShouldQueue`.

### Les comptes inscrits par e-mail reçoivent tout en français, quelle que soit leur langue
- Réf : P11.01
- Statut : à mesurer
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

### Le courriel d'invitation part à l'intérieur de la transaction de l'appelant
- Réf : P11.02
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Invitation/AgentInvitationService.php:84,99`, `OwnerInvitationService.php:96`, `ServiceProviderInvitationService.php:151`, `InvitationService.php:232-238`
- Constat :
  - `InvitationService::send()` déclare envoyer le courriel « intentionally outside the DB transaction ».
  - Mais ses trois appelants l'appellent depuis leur propre `DB::transaction`, et `deliver()` fait un `Mail::send` synchrone.
  - Une panne du transport (la préproduction a relevé 35 échecs Resend) annule le profil et l'invitation, puis rend un 500.
  - À l'inverse, un échec survenu après l'envoi laisse un e-mail dont le jeton ne pointe plus vers rien.
  - Établi comment : lu, et mesuré par l'agent avec une sonde tokenizer.
- Piste : `DB::afterCommit(fn () => $this->deliver(...))`, ou un mailable mis en file avec `afterCommit()`.

### Les SMS reportés la nuit gardent les liens porteurs en clair dans `jobs`
- Réf : P11.03
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Notifications/Sms/SmsRouterDriver.php:56-57,214`, `takussan-api/app/Jobs/SendDeferredSmsJob.php:16`, `takussan-api/config/sms.php:125-129`
- Constat :
  - `CodedNotification` est chiffrée en file exprès (TCK-602).
  - Entre 22 h et 6 h, le routeur remet le texte **déjà rendu** à `SendDeferredSmsJob`, qui n'implémente pas `ShouldBeEncrypted`.
  - Ce texte porte `payment_url`, `receipt_url` et `/invitations/accept?token=`.
  - Le chemin est réel : `invitations:remind` tourne toutes les heures, et le webhook de paiement arrive à toute heure.
  - Établi comment : lu, chemin complet.
- Piste : `ShouldBeEncrypted` sur `SendDeferredSmsJob`, plus une garde qui l'exige de tout job portant un texte de SMS.

### L'e-mail de vérification à l'inscription est synchrone
- Réf : P11.04
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/Auth/AuthController.php:33-46`, `takussan-api/app/Notifications/RegistrationConfirmationNotification.php`
- Constat :
  - `User::create` est appelé hors transaction, puis `Registered` déclenche une notification sans file.
  - Si le transport échoue, la réponse est un 500 alors que le compte existe déjà, et aucun jeton n'est rendu. Une nouvelle tentative bute sur « e-mail déjà pris ».
  - Même chose pour `ResetPasswordNotification` et `AccountDeletion*`.
  - Établi comment : lu.
- Piste : `ShouldQueue`, avec les codes à usage unique sur `notifications-urgent`.

### Un SMS qui échoue ne laisse ni trace ni alerte
- Réf : P11.05
- Statut : à mesurer
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

### Le compte SMS choisi dépend du nombre d'agences du destinataire, et reste en cache dans le worker
- Réf : P11.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette (intention à vérifier)
- Où : `takussan-api/app/Services/Notifications/Sms/IntegrationLocator.php:27-33`, `takussan-api/app/Notifications/Channels/SmsChannel.php:104`, `takussan-api/app/Providers/AppServiceProvider.php:284`
- Constat :
  - Avec un `agency_id`, seule l'intégration de l'agence est cherchée, sans repli sur la plateforme.
  - `agency_id` vaut l'agence pour un professionnel mono-agence et `null` pour un multi-agences. Les SMS du premier dépendent donc du fournisseur de son agence, alors qu'ADR-0032 met le coût à la charge de la plateforme.
  - `IntegrationLocator` est un singleton qui met en cache aussi les résultats nuls. Dans le worker (`--max-time=3600`), une intégration activée ou tournée met jusqu'à une heure à prendre effet.
  - Établi comment : lu.
- Piste : un repli sur la plateforme, et `scoped()` à la place de `singleton()`.

### Diffusion en double, avant le commit, avec le contenu écrit au journal
- Réf : P11.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette (valeur de préproduction à vérifier)
- Où : `takussan-api/app/Services/Model/NotificationService.php:108-114`, `takussan-api/app/Events/NewNotification.php:13`, `takussan-api/app/Notifications/CodedNotification.php:85`, `.env.example:121`
- Constat :
  - `NewNotification` est `ShouldBroadcastNow` et part dans la transaction, avant le commit. `CodedNotification` y ajoute un canal `broadcast` sur le même canal privé.
  - Le front n'écoute rien : aucun `echo`, `pusher` ni `notification.new` (mesuré).
  - Avec `BROADCAST_CONNECTION=log`, titre et corps (noms, montants) sont écrits au niveau info.
  - Établi comment : lu, et mesuré pour le front.
- Piste : supprimer `NewNotification`, ou la passer en `ShouldDispatchAfterCommit` et la faire taire tant que D-65 est ouvert.

### Le résumé par e-mail est injoignable, et doublerait chaque e-mail le jour où il le deviendrait
- Réf : P11.08
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Jobs/Notifications/BuildUserDigestJob.php:36-40`, `takussan-api/app/Services/Notifications/DigestBuilderService.php:28-36`, `takussan-api/app/Notifications/CodedNotification.php:77`, `takussan-api/routes/web.php:12`
- Constat :
  - Aucun point d'API n'écrit `email_frequency`, hormis le lien de désabonnement.
  - `via()` ignore `email_frequency` et `notifications_email_enabled`.
  - Le désabonnement est un `GET` signé, sans expiration, qui modifie l'état : un scanner de liens suffit à désabonner.
  - `SendDailyNotificationDigest` n'est ni planifié ni dispatché.
  - Établi comment : lu.
- Piste : retirer ce sous-système, ou faire lire `email_frequency` par `via()` et passer le désabonnement en `POST`.

### Aucun `afterCommit` : pas de dégât aujourd'hui, grâce à la seule file `database`
- Réf : P11.09
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/queue.php:44,73`, `takussan-api/app/Notifications/CodedNotification.php:40`
- Constat :
  - `after_commit => false` partout.
  - La file `database` écrit le job dans la même transaction, qui les annule ensemble.
  - Un passage à Redis enverrait des notifications pour des transactions annulées.
  - Établi comment : lu.
- Piste : `ShouldQueueAfterCommit` sur `CodedNotification` et les autres notifications en file.

### Petites améliorations
- Réf : P11.10
- Statut : à mesurer
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

## Angle 12 — Tests : zones non gardées, tests verts sans leur code

Les trois 🔴 ont été relus par la session dans le code :
- `PaymentGatewayInitiateTest.php:187-204` n'asserte qu'un `assertOk()`, sous un `Http::fake` Wave qui répond 200 à toute clé ;
- `AccountDeletionRequestTest.php:151-168` ne crée qu'un bail actif ;
- le seul test qui envoie `X-OM-Signature` (`PaymentDriverTest.php:131-150`) envoie une signature valide, et aucun test PHP ne contient « om-signature ».

**Ce sont des tests qui manquent, pas des défauts de production** : le code gardé est juste aujourd'hui. Le 🔴 dit qu'une régression passerait la CI au vert. Aucune ablation n'a été faite : c'est l'angle 40.

### Le test d'isolation à l'initiation du paiement ne peut pas voir le défaut
- Réf : P12.01
- Statut : à mesurer
- Gravité : 🔴 garde absente
- Où : `takussan-api/tests/Feature/Api/PaymentGatewayInitiateTest.php:187-204`, `takussan-api/app/Services/Payments/PaymentGatewayService.php:76-77`
- Constat :
  - Le test crée une intégration Wave dans une autre agence, avec le commentaire « must not be picked ».
  - Sa seule assertion est `assertOk()`. Or `setUp` fait répondre 200 à `api.wave.com/*` quelle que soit la clé.
  - Si on retire `where('agency_id', $agencyId)` (l. 77), la clé d'une autre agence peut être utilisée, et le test reste vert.
  - Le seul test qui regarde `integration_id` (`PaymentWebhookEndpointTest.php:325`) ne crée qu'une intégration.
  - Établi comment : lu.
- Piste : asserter `metadata.gateway.integration_id`, ou `Http::assertSent` sur l'en-tête `Authorization: Bearer wave_test_key`.

### Les obligations qui bloquent la suppression d'un compte ne sont gardées que pour le bail actif
- Réf : P12.02
- Statut : à mesurer
- Gravité : 🔴 garde absente
- Où : `takussan-api/tests/Feature/Auth/AccountDeletionRequestTest.php:151-168`, `takussan-api/app/Services/Account/AccountDeletionService.php:326-375`
- Constat :
  - `test_blocked_when_user_has_pending_lease_payment_via_customer` ne crée aucun loyer impayé, seulement un bail actif. Son commentaire le dit : « The active lease alone is enough ».
  - Dans le clover de la CI du 2026-10-15, les trois autres obligations sont à 0 : loyers en attente (`:335-342`), factures dues (`:351-358`) et réservations ouvertes (`:368-375`).
  - Les supprimer laisserait un ancien locataire débiteur effacer son compte, sans un rouge.
  - Établi comment : mesuré sur le clover CI, et lu.
- Piste : un test par type d'obligation (bail résilié et échéance `Late`, facture due, réservation ouverte), plus le cas d'une restitution de caution en attente, qui ne doit pas bloquer (TCK-595 H-2).

### La signature Orange Money n'est jamais testée en refus
- Réf : P12.03
- Statut : à mesurer
- Gravité : 🔴 garde absente
- Où : `takussan-api/app/Services/Payments/Drivers/OrangeMoneyDriver.php:130-133`, `takussan-api/tests/Feature/Api/PaymentDriverTest.php:131-150`
- Constat :
  - Le seul test envoie une signature valide. La ligne 133 compte comme couverte, mais aucun cas de signature fausse ou absente n'existe.
  - Si on retire `abort_code_unless`, le webhook OM accepte n'importe quel corps, et tout reste vert.
  - Wave a son test de refus (`PaymentWebhookTest.php:84`).
  - Établi comment : lu et grep.
- Piste : trois cas de bout en bout sur `/api/webhooks/payments/orange_money/{token}` (signature fausse, absente, secret d'une autre agence), en vérifiant que le paiement n'a pas bougé.

### L'horodatage de la signature Wave n'est jamais comparé à l'heure
- Réf : P12.04
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Payments/Drivers/WaveDriver.php:146-151`
- Constat :
  - `t` entre dans le HMAC, mais rien ne le compare à `now()` : un webhook signé et capturé reste rejouable indéfiniment.
  - Le test de refus (`t=1,v1=deadbeef`) échoue sur le HMAC, et il resterait vert qu'il y ait une fenêtre de temps ou non.
  - Établi comment : lu. L'effet d'un `refund` ou d'un `failed` rejoué est à vérifier (angle 39).
- Piste : refuser un `t` hors d'une tolérance de 5 min ; tester une signature valide avec un `t` vieux d'une heure.

### Le cliquet de couverture laisse sept points de marge
- Réf : P12.05
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `.github/workflows/api-ci.yml:464`
- Constat :
  - L'artefact `couverture-api-clover` du run 38662423267 (PR de cette branche, PCOV) donne 38 400 instructions couvertes sur 41 226, soit **93,15 %**.
  - Le seuil est à 86 % : environ 2 950 instructions peuvent perdre leur couverture sans rouge.
  - Établi comment : mesuré, sur une seule exécution de PR.
- Piste : selon CLAUDE.md, le seuil se resserre sur un chiffre de CI. Relever un second run sur `dev`, puis passer à 92 %.

### Le clover local est périmé et trompe qui le lit
- Réf : P12.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/storage/coverage/clover.xml`
- Constat :
  - Le fichier date du 2026-08-30.
  - 467 fichiers sur 1 403 dans `app/` en sont absents (33 %), dont `LeaseSignatureService`, `PayoutCalculator`, `WebhookJournal` et `PaymentSupervisionService`.
  - Il mesure aussi 9 fichiers qui n'existent plus.
  - Établi comment : mesuré.
- Piste : lire l'artefact de la CI (`gh run download -n couverture-api-clover`) ; supprimer ou dater le fichier local.

### La policy du registre RGPD n'est jamais exécutée
- Réf : P12.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Policies/PrivacyRequestPolicy.php:18,23,28,33`
- Constat :
  - Ses quatre lignes sont à 0 dans le clover CI, et la carte d'impact ne lui rattache aucun test.
  - Le 403 testé (`PrivacyRequestRegistryTest.php:145`) vient du middleware `super-admin`, avant que la policy soit consultée.
  - Un `return false` changé en `true` resterait vert.
  - Établi comment : mesuré.
- Piste : un test unitaire de la policy par méthode.

### Le code de signature de bail envoyé par e-mail n'est jamais rendu
- Réf : P12.08
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Notifications/LeaseSignatureCodeNotification.php:41-48`
- Constat : `toMail` est à 0 dans le clover CI, alors que le code OTP n'existe que là. Les tests figent la notification sans la rendre (mesuré).
- Piste : rendre le mail et asserter qu'il contient le code.

### Côté front, la plupart des server actions et des handlers BFF n'ont aucun test
- Réf : P12.09
- Statut : à mesurer
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

### Petites améliorations
- Réf : P12.10
- Statut : à mesurer
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

## Angle 14 — Observabilité : ce qu'on ne verrait pas en production

Les deux 🔴 ont été relus par la session dans le code :
- `AlertRuleService.php:76` appelle `SendAdminAlert::dispatch()` sans `onQueue`. `SendAdminAlert` n'implémente que `ShouldQueue` et ne déclare aucune file, donc `default`. Dans `compose.api.yml:55`, seul le `worker` consomme `default`.
- `HealthcheckService.php:139-143` : la sonde `scheduler` n'a pas de `status`, et le statut global ne prend en compte que les autres sondes. Dans `compose.api.yml`, seul `api` déclare un healthcheck (l. 44).

### L'alerte « file à l'arrêt » part sur la file arrêtée
- Réf : P14.01
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Admin/AlertRuleService.php:76`, `takussan-api/app/Jobs/SendAdminAlert.php:14`, `deploy/takussan/compose.api.yml:55`, `takussan-api/app/Console/Commands/EvaluateOperationalAlerts.php:41`
- Constat :
  - `ops_queue_stalled` produit une activité, que `DispatchAlerts` reçoit de façon synchrone (`AppServiceProvider.php:640`).
  - L'alerte est alors mise sur `default`, que seul le conteneur `worker` consomme.
  - Si ce worker meurt ou se fige, `alerts:evaluate` détecte bien la transition, mais l'alerte attend dans `jobs`, sur la file que personne ne lit.
  - Elle n'arrive que si c'est `worker-media` qui tombe.
  - Établi comment : lu, chemin suivi de bout en bout.
- Piste : envoyer les alertes `ops_*` de façon synchrone (`dispatchSync`) ou depuis un autre conteneur. Mieux, par un canal extérieur à l'application, comme le Telegram de `seuils.sh`.

### Si le planificateur meurt, personne ne le voit
- Réf : P14.02
- Statut : à mesurer
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

### Aucune règle d'alerte n'existe par défaut
- Réf : P14.03
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Admin/AlertRuleService.php:71-75`
- Constat : une alerte `ops_*` ne part que si une ligne active existe dans `alert_rules`. Aucun seeder ni aucune commande n'en crée. Sur une production neuve, les alertes vont au journal d'audit et nulle part ailleurs (mesuré sur le dépôt ; l'état de la base de préproduction est à vérifier).
- Piste : créer les trois règles `ops_*` dans `release.sh`, destinataire tiré de l'environnement ; le vérifier dans le runbook de la phase F.

### Un job d'argent qui échoue chaque nuit reste sous le seuil
- Réf : P14.04
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Console/Commands/EvaluateOperationalAlerts.php:27,34`, `takussan-api/routes/console.php:37,43,59`
- Constat :
  - L'alerte ne se déclenche qu'à partir de 20 échecs par heure glissante.
  - `ApplyLateFeesJob`, `SendLeasePaymentReminders` et `SendOverdueRemindersJob` passent par `Schedule::job`, qui ne fait que les mettre en file.
  - `scheduled_task_runs` écrit donc `finished` même quand le job échoue ensuite chez le worker.
  - Un échec par jour ne déclenche jamais rien. Précédent : 35 échecs `Class "Resend" not found` accumulés sans bruit en préproduction.
  - Établi comment : lu.
- Piste : un seuil par classe de job, nul pour l'argent et le bail ; ou un `failed()` qui écrit une activité alertable.

### L'alerte de santé reste verrouillée après le premier « dégradé »
- Réf : P14.05
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Console/Commands/EvaluateOperationalAlerts.php:47`, `takussan-api/app/Services/Admin/AlertRuleService.php:78-82`
- Constat :
  - La transition repose sur un booléen, `status !== 'ok'` : un passage de `degraded` à `failed` ne déclenche rien de nouveau.
  - En préproduction, `MAIL_MAILER=log` tient la sonde `mail` à `degraded` en permanence.
  - Le message d'alerte perd les `properties` : on ne sait pas quelle sonde a échoué.
  - Établi comment : lu.
- Piste : déclencher sur l'ensemble des sondes en échec et sur leur niveau ; inclure `properties` dans le message.

### Le courriel de notification n'est jamais retenté
- Réf : P14.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Jobs/SendRawNotificationEmailJob.php:38-48`
- Constat :
  - Le commentaire promet que « transient failures are still retried via $tries ».
  - Mais le `catch (\Throwable)` attrape chaque tentative, appelle `report()` et rend le job réussi : `$tries = 3` et `backoff` ne servent à rien.
  - Un seul essai, aucune ligne dans `failed_jobs`.
  - Établi comment : lu.
- Piste : ne rattraper qu'à la dernière tentative (`$this->attempts() >= $this->tries`), ou relancer et laisser `failed()` agir.

### Aucun rapporteur d'erreurs, ni côté API ni côté front
- Réf : P14.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/composer.json`, `takussan-web/package.json`, `takussan-web/src/app/error.tsx:35-37`
- Constat :
  - Ni Sentry, ni Flare, ni Nightwatch.
  - Côté front, ni `instrumentation.ts` (`onRequestError`) ni `global-error.tsx`. Les frontières d'erreur font un `console.error` dans le navigateur, et le `digest` montré à l'utilisateur ne renvoie à rien de consultable.
  - Établi comment : mesuré, grep et find.
- Piste : un ADR « rapport d'erreurs » (GlitchTip auto-hébergé ou Sentry), avec la forme `SafeExceptionContext` de TCK-613.

### Les journaux de l'API disparaissent à chaque déploiement
- Réf : P14.08
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `deploy/server/bootstrap.sh:99-102`, `deploy/takussan/compose.api.yml:14-16`, `docs/infra/prod-drivers.json`
- Constat :
  - Le plan prescrit `LOG_CHANNEL=stderr`, donc des journaux Docker `json-file` de 10 Mo × 3.
  - `up -d` recrée les conteneurs à chaque `IMAGE_TAG`, et les journaux de l'ancien partent avec lui. Rien ne les exporte.
  - `LOG_CHANNEL` et `LOG_LEVEL` ne figurent pas dans `prod-drivers.json` : aucune garde ne les voit.
  - Établi comment : lu. La valeur réelle en préproduction est à vérifier.
- Piste : ajouter les clés `LOG_*` au catalogue des drivers ; exporter les journaux (Loki, Vector, ou le rapporteur du constat précédent).

### Des notifications de prospects et de visites avalées sans trace
- Réf : P14.09
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Lead/ContactLeadService.php:232,332,346`, `takussan-api/app/Services/Visit/VisitNotifier.php:181,214`, `takussan-api/app/Services/Messaging/GroupConversationService.php:152`
- Constat : des `catch (\Throwable) {}` sans `report()`. Si l'agent n'est pas prévenu d'une demande venue du site public, rien n'est journalisé, même si la demande est bien enregistrée (lu).
- Piste : `report($e)`, sans changer le caractère non bloquant.

### Données personnelles écrites au journal, hors du périmètre de TCK-613
- Réf : P14.10
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Payments/Drivers/WaveDriver.php:66,95`, `OrangeMoneyDriver.php:83,114,176`, `takussan-api/app/Services/Notifications/Sms/Dlr/DlrReportApplier.php:111`
- Constat :
  - En cas d'échec, les pilotes de paiement journalisent le corps entier de la réponse.
  - Les canaux SMS et WhatsApp journalisent le numéro complet, déjà noté à l'angle 11, et le DLR le `msisdn`.
  - TCK-613 ne couvre aucun de ces emplacements.
  - Établi comment : lu. Le contenu réel des corps Wave et OM est à vérifier.
- Piste : étendre TCK-613 : statut et code du fournisseur seulement, numéro masqué.

### Server actions : un bug devient « erreur réseau », sans journal
- Réf : P14.11
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/actions/notifications.ts:23-35`, `takussan-web/src/app/actions/admin-settings.ts:63-80`
- Constat :
  - Une erreur qui n'est pas une `ApiError` (`TypeError`, parsing) rend le message de repli et n'écrit rien côté serveur Next.
  - On compte 12 `console.*` dans `actions/` et `api/`, pour 27 modules qui attrapent des erreurs.
  - Établi comment : mesuré.
- Piste : un `failure()` commun qui journalise côté serveur toute erreur autre qu'une `ApiError`.

### Petites améliorations
- Réf : P14.12
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Constat :
  - **Paiements et webhooks** : aucun événement alertable ne les concerne, et `SystemMetricsController.php:35-46` n'a aucun taux d'échec. Il faut aller lire `/admin/webhook-logs`. Le SMS, lui, a une sonde de taux d'échec (lu).
  - **Journaux** : ni identifiant de requête ni agence, aucun `Log::withContext` ni `Context::add` (`bootstrap/app.php:151-153`). Une erreur ne se relie ni à l'accessLog Traefik ni à une agence (mesuré).
- Piste :
  - une sonde `payments` (taux d'échec et webhooks `rejected` sur l'heure) dans `HealthcheckService` ;
  - un middleware qui pose `request_id`, le profil et l'agence actifs dans le contexte des journaux.

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
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/leases/LeasePaymentDialog.tsx:55-56,122-127`, `takussan-api/app/Http/Requests/Api/StoreLeasePaymentRequest.php:38-47`, `takussan-api/app/Services/Model/LeasePaymentService.php:26`, `takussan-api/routes/api/leases.php:60`
- Constat :
  - Le dialogue envoie `paid_at` et `reference_number`. Aucun des deux ne figure dans les règles, `status` non plus : `validated()` les retire.
  - `create()` écrit alors une ligne `pending`, sans date. Saisir un loyer reçu ajoute une échéance en attente au lieu de régler l'échéance existante.
  - `POST /api/lease-payments/{id}/mark-paid`, la voie gardée (verrou, checkout ouvert, caution), n'a aucun appelant dans le front.
  - Établi comment : lu de bout en bout, et grep.
- Piste : faire appeler `mark-paid` par l'écran sur l'échéance choisie ; refuser `paid_at` à la création, ou le prendre en compte.

### « Générer l'échéancier » appelle une route qui n'existe pas
- Réf : P13.02
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/lib/queries/leases.ts:436`, `takussan-api/routes/api/leases.php:33`, `takussan-api/app/Http/Controllers/Api/LeaseController.php:154`
- Constat :
  - Le front poste sur `/api/leases/{id}/generate-schedule`, alors que la route est `/api/leases/{id}/payments/generate-schedule` : l'appel rend un 404.
  - Le front attend `generated` dans la réponse, l'API rend `payments_created`.
  - Le bouton est monté sur `/app/leases/[id]` (`LeaseDetail.tsx:181`). L'écart date de TCK-044.
  - Établi comment : mesuré par `route:list`, et lu.
- Piste : aligner le chemin et la clé de réponse.

### Pièces jointes de la messagerie : envoi vers une route absente
- Réf : P13.03
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/messages/ChatView.tsx:226,442`, `takussan-web/src/lib/queries/conversations.ts:423`, `takussan-api/app/Http/Controllers/Api/ConversationController.php:285-299`
- Constat :
  - Le trombone poste sur `/api/conversations/{c}/messages/{m}/attachments`, et aucune route ne contient `attach`.
  - L'API n'accepte que la note vocale, dans `sendMessage` : le texte part, le fichier échoue sur « uploadFailed ».
  - Établi comment : mesuré, et lu.
- Piste : accepter le fichier dans `sendMessage`, comme l'audio, ou retirer le trombone.

### Documents de la fiche client : envoi vers une route absente
- Réf : P13.04
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/lib/queries/customers.ts:187`, `takussan-web/src/components/customer-dashboard/CustomerDocumentsPanel.tsx:46`
- Constat :
  - L'onglet Documents (`CustomerDetailTabs.tsx:107`) poste sur `/api/customers/{id}/documents`, qui n'existe pas.
  - La même page offre `AddDocumentButton`, qui passe par `/api/documents` : deux voies d'ajout, dont une cassée.
  - Établi comment : mesuré, et lu.
- Piste : faire passer le panneau par `AddDocumentButton`.

### `POST /api/payments`, sans appelant, laisse le locataire se déclarer payé
- Réf : P13.05
- Statut : à mesurer
- Gravité : 🔴 défaut avéré (effets en aval à vérifier)
- Où : `takussan-api/app/Http/Controllers/Api/PaymentController.php:37-92,372-382`, `takussan-api/app/Http/Requests/PaymentStoreRequest.php:13-15,30-32`, `takussan-api/app/Services/Model/LeasePaymentService.php:26`, `takussan-api/app/Services/Model/BookingPaymentService.php:22-24`
- Constat :
  - `authorize()` accepte tout compte connecté. `authorizeLeaseManage` admet le locataire (« tenant can create their own **pending** lease payment »), `authorizeBookingManage` le client.
  - Mais `status` (sauf `cancelled`) et `paid_at` sont validés puis transmis tels quels, et `LeasePaymentService::create` garde le statut fourni.
  - Pour une réservation, l'absence de statut vaut déjà `Paid`.
  - La route contourne `recordPayment` (TCK-587) et toutes les gardes de `markPaid`, et aucun test n'essaie le locataire ni le client.
  - Établi comment : écriture lue ; soldes, reçus et relevés en aval à vérifier.
- Piste : retirer la route, qui n'a aucun appelant. À défaut, forcer `pending` et refuser `paid_at` à tout autre que le personnel.

### La colonne « Push » des préférences ne pilote rien
- Réf : P13.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Notifications/PreferenceResolver.php:46`, `takussan-api/app/Notifications/NewBookingNotification.php:75-76`, `takussan-api/app/Events/NewMessage.php`
- Constat :
  - L'écran des préférences affiche une colonne Push. Elle correspond à `broadcast` dans 14 notifications.
  - Le pilote est `log`, et il n'y a ni client Echo ou Pusher, ni Reverb.
  - `NewMessage` n'est jamais déclenché.
  - Le constat est plus large que celui de l'angle 11, qui ne relevait que `NewNotification`.
  - Établi comment : mesuré, et lu.
- Piste : retirer `push` de `CHANNELS` et le canal `broadcast`, ou décider d'un temps réel par un ADR.

### Réglages d'agence : trois magasins, dont deux sans écrivain
- Réf : P13.07
- Statut : à mesurer
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

### Routes en double et routes sans appelant
- Réf : P13.08
- Statut : à mesurer
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

### Page orpheline `/onboarding/agency-admin`
- Réf : P13.09
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/onboarding/agency-admin/page.tsx:9-12`, `takussan-web/src/app/(auth)/auth/reset-password/page.tsx:43`
- Constat : le docblock la dit atteinte par la redirection de l'e-mail d'activation. Mais la réinitialisation renvoie vers `/auth/login`, et aucun lien ne mène à cette page ni à `AgencyAdminOnboardingWizard` (mesuré, et lu).
- Piste : relier la page depuis l'invitation, ou la retirer.

### Petites améliorations
- Réf : P13.10
- Statut : à mesurer
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

## Angle 15 — Parcours d'une agence neuve

Les trois 🔴 ont été relus par la session dans le code :
- `CustomerService::findOrCreateFromUser` (l. 33-48) crée la fiche avec `agency_id = $user->agency_id` et `added_by_id` = le candidat, et `linkUser()` n'a aucun appelant ;
- `LeaseSignatureService.php:55` refuse un locataire sans `user_id` ;
- seuls `AgentProfileController` et `OwnerProfileController` mentionnent `metadata.kyc` ;
- dans `AgencyConfigForm.tsx`, la case `moderation_required` (l. 401-423) est rendue avant le bloc `individual ? null` (l. 497) ;
- `/app/agency/moderation/properties` exige `agence: 'standard'` (`pages-admin.ts:93-94`), et `PropertyObserver` (l. 120-140) n'exempte personne.

### Un locataire ne peut pas être à la fois lié à un compte et visible de l'agence : la signature n'est jamais atteinte
- Réf : P15.01
- Statut : à mesurer
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

### KYC de l'agent et du bailleur : « en revue » pour toujours
- Réf : P15.02
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Controllers/Api/Me/AgentProfileController.php:130-141`, `takussan-api/app/Http/Controllers/Api/Me/OwnerProfileController.php:126-131`, `takussan-api/app/Http/Controllers/Api/DocumentController.php:92-98`, `takussan-api/app/Services/Kyc/KycWorkflowService.php:50-58`, `takussan-web/src/messages/fr.json:4825,4957`
- Constat :
  - L'assistant écrit `metadata.kyc.status = pending_review`. Aucun autre code ne relit ni ne bascule ce statut.
  - Aucune notification ne part, et aucun écran d'agence ne montre ces pièces.
  - La file KYC de la console ne connaît que les dossiers d'agence (`dossierForAgency`), et vérifier un `Document` est réservé au super-admin.
  - L'écran promet pourtant « Votre agence va le vérifier ».
  - Établi comment : lu et grep.
- Piste : une file de relecture (agence ou console) avec notification, ou retirer la promesse et le statut.

### Une agence individuelle qui active la modération ne peut plus publier
- Réf : P15.03
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/admin-agency/AgencyConfigForm.tsx:401-423,497`, `takussan-web/src/lib/access/pages-admin.ts:92-96`, `takussan-api/app/Observers/PropertyObserver.php:120-140`, `takussan-api/app/Http/Requests/AgencyUpdateRequest.php:55`
- Constat :
  - La case « Modération obligatoire » s'affiche sur `/app/agency`, ouverte à l'agence `individual`, hors du bloc `individual ? null`. L'API l'accepte sans condition.
  - Une fois cochée, toute publication passe `pending_review`, celle de l'admin comprise : l'observer n'exempte aucun rôle.
  - La file `/app/agency/moderation/properties` exige une agence `standard`. L'hôte solo n'a aucun écran pour s'approuver, et ses biens restent en attente.
  - Établi comment : lu, front et API.
- Piste : cacher et refuser le réglage en `individual`, ou exempter l'admin unique.

### Le second facteur bloque la mise en service, sans la boîte qui le résout
- Réf : P15.04
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Support/Security/ProtectedActions.php` (`AGENCY_TWO_FACTOR`), `takussan-web/src/components/admin/InviteAgentDialog.tsx:84-100`, `takussan-web/src/components/admin-settings/IntegrationsManager.tsx:191-196`, `takussan-web/src/components/dashboard/admin/MiseEnService.tsx:37-45`
- Constat :
  - Trois gestes de la mise en service exigent la 2FA de l'admin, hôte solo compris : le taux de commission, les intégrations Wave et Orange Money, l'invitation d'un agent.
  - Leurs formulaires ne passent pas par `useApiMutation` : `GardeDoubleFacteur` ne s'ouvre pas, et le refus s'affiche en erreur de champ.
  - L'étape qui imposait la 2FA (`/onboarding/agency-admin`) est orpheline (angle 13).
  - La carte « Mise en service » met la 2FA en dernier, alors qu'elle conditionne trois étapes.
  - Établi comment : lu ; chemin du service 2FA à vérifier.
- Piste : brancher `avecGardeDoubleFacteur` sur ces formulaires ; placer la 2FA en tête de la carte.

### SMS muet : première publication et signature bloquées, sans repli
- Réf : P15.05
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Auth/PhoneVerificationService.php:299-325,381-401`, `takussan-api/app/Services/Property/PublishReadiness.php:73`, `takussan-api/app/Services/Lease/LeaseSignatureService.php:120-135`
- Constat :
  - `issue()` rend `true` même quand aucun fournisseur n'a accepté le SMS, et l'écran affiche « code envoyé ».
  - Publier exige le téléphone vérifié du contact principal, et cette vérification n'a pas d'autre canal que le SMS. Sans SMS, aucun premier bien ne devient public.
  - Pour signer un bail, un numéro vérifié impose le SMS, sans repli par e-mail. En préproduction (`MAIL_MAILER=log`), un signataire sans numéro vérifié ne reçoit rien non plus.
  - Établi comment : lu.
- Piste : rendre l'échec de livraison au client ; offrir un repli par e-mail pour la vérification et la signature.

### Un bien créé par le personnel fait de l'agent le bailleur du contrat
- Réf : P15.06
- Statut : à mesurer
- Gravité : 🟠 risque ou dette (intention à vérifier)
- Où : `takussan-api/app/Http/Controllers/Api/PropertyController.php:131-133`, `takussan-api/app/Services/Model/LeaseService.php:78`, `takussan-web/src/components/leases/CreateLeaseForm.tsx:188-192`
- Constat :
  - `properties.user_id` vaut toujours le créateur, et aucune route ne désigne de bailleur tiers.
  - `landlord_id` du bail vaut `property.user_id` : le PDF, les alertes d'impayé et les relevés visent l'agent.
  - Le formulaire affiche « bailleur : {utilisateur courant} », ce qui est faux dès qu'un autre agent a créé le bien.
  - Établi comment : lu.
- Piste : un champ « bailleur » à la création du bien ou du bail, borné aux bailleurs de l'agence.

### L'activation du gérant provisionné passe par un e-mail de « réinitialisation »
- Réf : P15.07
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Admin/AgencyProvisioningService.php:28-32,108-114`, `takussan-api/lang/fr/notifications.php:42-49`, `takussan-api/config/auth.php:99`
- Constat :
  - Le compte reçoit le gabarit « vous avez demandé une réinitialisation… sinon ignorez », valable 60 min.
  - Un gérant déjà inscrit fait échouer le provisionnement : 409 `agency.admin_email_taken`.
  - Établi comment : lu.
- Piste : un gabarit d'activation dédié, valable plus longtemps, et le rattachement d'un compte existant.

### La carte « Mise en service » n'atteint ni l'agence individuelle ni l'accueil
- Réf : P15.08
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/(dashboard)/app/overview/agency/page.tsx:93`, `takussan-web/src/app/(dashboard)/app/overview/agency/layout.tsx:38-50`, `takussan-web/src/app/(dashboard)/app/(accueil)/page.tsx:46-75`
- Constat :
  - La carte n'est montée que sur `/app/overview/agency`, réservé aux agences `standard`.
  - L'hôte solo ne la voit jamais, et le gérant neuf n'a sur `/app` qu'une bannière de logo et un état vide générique.
  - Établi comment : lu.
- Piste : la monter sur l'accueil pour tout admin, avec des étapes filtrées par `kind`.

### Premier bail : sélecteur de biens vide, sans explication
- Réf : P15.09
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/queries/leases.ts:117`, `takussan-web/src/components/leases/CreateLeaseForm.tsx:133-170`
- Constat :
  - Seuls les biens `available` sont proposés. Un bien neuf est `draft`, un bien modéré `pending_review`, et l'API, elle, n'exige aucun statut.
  - Aucun message ni lien vers « créer le bien » ou « créer le locataire ».
  - Après ce formulaire, l'enregistrement du paiement et la génération de l'échéancier sont cassés (angle 13).
  - Établi comment : lu.
- Piste : élargir le filtre (hors vendu et archivé), et un état vide avec des appels à l'action.

### Petites améliorations
- Réf : P15.10
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Constat (lu) : il n'existe pas de code de notification « bien soumis à modération » (`NotificationCode.php:131-132` : seulement approuvé et refusé). L'admin ne découvre une soumission que par la file du tableau de bord `standard`, alors que les avis ont `review.to_moderate`.
- Piste : notifier les admins actifs au passage en `pending_review`.

## Angle 16 — Listes internes sur un modèle `Searchable`

Les deux 🔴 ont été relus par la session dans le code :
- `YearOfActivitySeeder::SEARCHABLE_MODELS` (l. 123-127) ne contient que `Property`, `Document` et `Message` ;
- les cinq requêtes du front (`customers.ts:91`, `maintenance.ts:111`, `documents.ts:75`, `super-admin.ts:102`, `admin-users.ts:60`) envoient `sort` avec `'-created_at'` comme valeur de repli ;
- le docblock de `HasQueryBuilder.php:150-160` confirme que `defaultSorts()` ne fait rien dès qu'un `sort=` explicite est présent.

⚠ Les comptes d'index ont été pris sur le Meilisearch brew (port 7700) que vise `takussan-api/.env`, alors que la base est celle de docker (5433). C'est le piège D-48 : les nombres décrivent ce poste, pas un environnement déployé.

### Après un seed, les recherches de clients, d'interventions et d'utilisateurs ne trouvent presque rien
- Réf : P16.01
- Statut : à mesurer
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

### La pertinence de TCK-281 n'agit nulle part : le front impose toujours `sort=-created_at`
- Réf : P16.02
- Statut : à mesurer
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/lib/queries/customers.ts:91`, `maintenance.ts:111`, `documents.ts:75`, `super-admin.ts:102`, `admin-users.ts:60` ; `takussan-api/app/Http/Controllers/Api/CustomerController.php:40`, `MaintenanceRequestController.php:55,81`, `AgencyController.php:41,177`
- Constat :
  - `defaultSortsWithRelevance()` passe par `defaultSorts()`, qui s'efface devant tout `sort=` explicite.
  - Les cinq listes du front envoient `sort` sans condition, recherche comprise.
  - Résultat : une recherche tolérante aux fautes, mais classée par date. C'est le défaut de l'angle 1, reproduit sur toutes les listes internes.
  - Établi comment : lu, des deux côtés.
- Piste : ne pas envoyer `sort` quand `search` n'est pas vide (ou envoyer un `sort=relevance` explicite), avec un test front par liste.

### Documents : un `defaultSort` en dur, et une liste bornée à ce qu'on a soi-même déposé
- Réf : P16.03
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/DocumentController.php:41-47`
- Constat :
  - `index()` combine la recherche Scout avec `->defaultSort('-created_at')` en dur, sans `defaultSortsWithRelevance`.
  - Le périmètre est `uploaded_by = moi` : un agent ne retrouve pas le bail déposé par un collègue sur un bien de l'agence.
  - Établi comment : lu.
- Piste : `Document::defaultSortsWithRelevance('-created_at')` ; le périmètre par agence ou par `documentable` dans un ticket à part.

### Plafond réel de 1 000 identifiants, toutes agences confondues
- Réf : P16.04
- Statut : à mesurer
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Models/Concerns/HasQueryBuilder.php:20-27,235`, `takussan-api/config/scout.php:267-288`
- Constat :
  - Le commentaire annonce `SEARCH_ID_CAP = 5000`, mais `pagination.maxTotalHits` vaut 1 000 sur tous les index locaux (mesuré), et `index-settings` ne le relève nulle part (lu).
  - Pour `customers`, `maintenance_requests`, `users` et `agencies`, aucun attribut n'est filtrable (mesuré) : le filtre d'agence s'applique en SQL, **après** les 1 000 premiers résultats pris sur toutes les agences.
  - Sur une requête large (« 77 », « gmail », un patronyme courant), les correspondances de l'agence au-delà du rang 1 000 disparaissent sans signal. Le total reste cohérent, ce qui rend le défaut invisible.
  - Le volume de production est à vérifier.
- Piste : rendre `agency_id` filtrable et le passer à Scout ; à défaut, aligner `maxTotalHits` sur `SEARCH_ID_CAP` et corriger le commentaire.

### `/search/documents` et `/search/messages` : le filtre de dates s'applique après la pagination de Meilisearch
- Réf : P16.05
- Statut : à mesurer
- Gravité : 🟠 risque ou dette (routes sans appelant)
- Où : `takussan-api/app/Services/Search/DocumentSearchService.php:37-48`, `takussan-api/app/Services/Search/MessageSearchService.php:36-49`
- Constat :
  - `date_from` et `date_to` passent par `$search->query(...)`, donc en SQL sur une page déjà découpée par Meilisearch : les pages sont incomplètes, et des correspondances deviennent inatteignables.
  - Le commentaire invoque « datetime vs timestamp », alors que `created_at` est déjà indexé en timestamp et filtrable (`config/scout.php:259,263`).
  - Aucun appelant dans le front (mesuré). Ce sont des routes mortes de l'angle 13.
  - Établi comment : lu.
- Piste : clauses Scout natives en timestamps, ou suppression des deux routes.

### Petites améliorations
- Réf : P16.06
- Statut : à mesurer
- Gravité : 🟢 amélioration
- Constat :
  - **Index fantômes** : 8 documents d'agence indexés pour 5 en base (mesuré). `migrate:fresh` ne vide pas l'index des modèles absents de `SEARCHABLE_MODELS`, et ces fantômes occupent des places sous le plafond de 1 000.
  - **Ce qui tient** :
    - les mises à jour en masse sur des modèles `Searchable` ne touchent que des colonnes non indexées (`AgentHandoverService.php:196,200`, `AccountDeletionService.php:229`) ;
    - aucun index ne dénormalise une relation (lu).
- Piste : couverte par le premier constat (`removeAllFromSearch` sur tous les modèles indexés).
