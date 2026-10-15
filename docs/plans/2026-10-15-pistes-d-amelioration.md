# Pistes d'amélioration et corrections — exploration du 2026-10-15

Relevé en lecture seule, un angle à la fois, par des agents d'exploration lancés depuis la
session de TCK-651 (branche `feat/reglages-metier-au-catalogue`). **Rien ici n'est un ticket** :
chaque piste qui mérite d'être faite passe par `/write-spec`, et toute décision structurelle par un
ADR.

Chaque constat cite `fichier:ligne` et dit comment il a été établi (lu, mesuré, déduit). *Une piste
déduite d'un nom ou d'un docblock n'est pas un constat* : elle est marquée **à vérifier**.

Gravité : 🔴 défaut avéré (comportement faux aujourd'hui) · 🟠 risque ou dette qui coûte · 🟢
amélioration.

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
| 13 | Code mort et doublons : services, composants, routes, clés i18n | à faire |
| 14 | Observabilité : erreurs avalées, journaux, alertes, ce qu'on ne verrait pas en production | à faire |
| 15 | Parcours d'une agence neuve : inscription, mise en service, premier bien, premier bail | à faire |
| 16 | Listes internes sur un modèle `Searchable` avec `defaultSort` en dur (documents, propriétaires, biens enfants) | à faire |
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

---

## Angle 1 — Recherche d'un bien

*Exploré le 2026-10-15 vers 0 h 30. Les trois 🔴 ont été relus contre le code par la session ; les
chiffres « mesurés » viennent de l'agent, sur la base et l'index Meilisearch de développement.*

### La recherche dans `/app` ne trouve ni les brouillons ni les biens privés, et ne trie pas par pertinence
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Models/Concerns/HasQueryBuilder.php:235`, `takussan-api/app/Models/Property.php:499-508`, `takussan-api/app/Http/Controllers/Api/PropertyController.php:80`, `takussan-web/src/lib/queries/properties-server.ts:126`
- Constat :
  - `filter[search]` de `/api/properties` passe par Meilisearch puis par un `whereIn`, alors que `shouldBeSearchable()` écarte de l'index les biens privés, brouillons, en revue et rejetés.
  - Mesuré : les biens privés 145-147 sont absents de l'index. Une recherche de leur titre exact rend 53, 70 et 103 autres biens, et jamais le bon.
  - Pas de `matchingStrategy` (relâchement `last`, corrigé côté public par TCK-338).
  - `defaultSort('-created_at')` est en dur, et le front envoie toujours `sort=-created_at` : la pertinence est perdue (lu).
- Piste : une recherche SQL sur le titre et la référence pour les listes internes, ou un index interne sans `shouldBeSearchable`. Utiliser `defaultSortsWithRelevance()`, et ne pas forcer `sort` quand une recherche est active.

### Les quartiers proposés par le panneau ne correspondent pas aux quartiers indexés
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

### Les suggestions de recherche ont une limite unique de 60 requêtes par minute pour tout le site
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Providers/AppServiceProvider.php:373`
- Constat :
  - `Limit::perMinute(60)` est déclaré sans `->by()`. La clé est alors la même pour tous les visiteurs (lu dans `ThrottleRequests` et `Limit` du framework).
  - Le commentaire qui annonce `search-suggest|{ip}` est faux.
  - Le test (`tests/Feature/Api/Search/SearchSuggestTest.php:198`) vide une clé qui n'existe pas : il resterait vert dans les deux cas.
  - Avec un anti-rebond de 150 ms, une dizaine de personnes qui tapent en même temps font répondre 429 à tout le monde.
- Piste : `->by($this->visitorRateLimitKey($request))`, comme `public-read`, et un test avec deux IP distinctes.

### Deux recherches par changement de filtre, et des impressions Boost gonflées
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/hooks/useSearch.ts:183,360-364`, `takussan-web/src/app/[locale]/(public)/properties/(liste)/page.tsx:133-134`, `takussan-api/app/Services/Search/PropertySearchService.php:659`
- Constat :
  - `router.push` refait le rendu serveur, qui appelle déjà `rechercherBiensPublics`. La nouvelle graine est ignorée (`useReducer`/`useRef` ne la lisent qu'au montage), et le client relance la même recherche (lu ; à confirmer dans les journaux).
  - Chaque appel enregistre une impression sponsorisée, sans dédoublonnage (`BoostStatsRecorder.php:28`). C'est aussi le cas des revalidations ETag : un 304 recalcule tout (`routes/api/public.php:18-34`).
  - Or les impressions sont une métrique vendue aux agences.
- Piste : naviguer sans rendu serveur, ou consommer la graine à chaque nouvelle clé. Compter l'impression côté client, ou la dédoublonner par visiteur.

### Avec un tri par prix, la recherche élargie classe mal
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/scout.php:218`, `takussan-api/app/Services/Search/PropertySearchService.php:263-265`
- Constat :
  - `rankingRules` commence par `sort`. En régime élargi avec `price:asc`, le prix passe donc avant le nombre de mots trouvés.
  - Mesuré : `studio climatisation Thiès` rend [2,2,1…] mots trouvés sans tri, et [1,1,1…] avec.
- Piste : ranger `sort` après `words`, ou ne pas envoyer le tri dans le plan de repli.

### `SEARCH_ID_CAP` vaut en fait 1000, et la pagination publique aussi
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Models/Concerns/HasQueryBuilder.php:28`, `takussan-api/config/scout.php:150-254`
- Constat :
  - `pagination.maxTotalHits` est à 1000, le défaut de Meilisearch (mesuré). `take(5000)` ne rend donc que 1000 identifiants.
  - Côté public, au-delà de la page 25 (à 40 par page), les pages sont inaccessibles (lu ; à vérifier avec plus de 1000 biens).
  - `takussan-api/CLAUDE.md` annonce 5000.
- Piste : déclarer `maxTotalHits` dans `index-settings`, et corriger la doc.

### Des réglages d'index périmés font échouer la liste par défaut
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/scout.php:217`, `takussan-api/app/Services/Search/PropertySearchService.php:615`, `takussan-api/docker/release.sh:27-28`
- Constat :
  - Sur l'index local, `ranked_at` n'est pas triable, et les documents n'ont ni `ranked_at` ni `region`. `sort=ranked_at:desc` rend `invalid_search_sort` (mesuré) : une liste publique sans mot échoue en 500.
  - `release.sh` ne fait qu'avertir quand la synchronisation des réglages échoue.
- Piste : faire échouer le déploiement sur une synchronisation ratée, ou dégrader le tri au lieu de lever.

### Les facettes sont calculées à chaque recherche, et personne ne les lit
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Search/PropertySearchService.php:76,97,152`
- Constat : `neighborhood`, `bedrooms` et `type` sont demandées à Meilisearch à chaque requête. Le front ne lit `facets` nulle part : seule la déclaration de type `types/search.ts:608` le mentionne.
- Piste : les retirer, ou les afficher (« Mermoz (43) ») en facettes disjonctives.

### Une recherche d'un seul mot sans résultat n'a aucun repli
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Search/PropertySearchService.php:125`, `takussan-api/app/Models/Property.php:321-338`
- Constat :
  - Le repli exige au moins 2 termes. En dessous de 5 lettres, aucune faute n'est tolérée : `ker` rend 0, sans suggestion (mesuré).
  - Fonctionnent bien (mesuré) : la recherche par référence (`NSRKO42K`, `pr-nsrko42k`) et l'accent dans la requête (`Guediawaye` trouve `Guédiawaye`).
- Piste : en cas de zéro résultat, proposer les suggestions de `SuggestService` dans `SearchEmpty`.

### La carte charge toutes les photos, et les coordonnées ne sont pas indexées
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
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Controllers/Api/AgencyController.php:191`, `takussan-api/app/Http/Resources/UserResource.php:37,86-87`, `takussan-api/app/Models/Concerns/HasProfiles.php:82-95,229-262`, `takussan-api/app/Models/User.php:263-289`
- Constat :
  - Par membre, `UserResource` appelle `profileTypes()` (un `first()` et cinq `exists()`), l'accesseur `agency_id` (quatre `get()` sur les profils) et `getFirstMediaUrl('avatar')`.
  - Le front appelle cette route avec `per_page=100` juste pour remplir des listes de noms : `AuditTrail.tsx:203`, `ContactLeadsInbox.tsx:242`, `role-delegations.ts:157`.
  - Le sparse fieldset ne coupe aucun de ces calculs. Cela fait environ 1 100 requêtes par appel (lu ; le compte exact reste à mesurer).
- Piste : précharger les profils et `media`, ou ne sortir `roles` et `agency_id` que pour soi.

### `per_page` sans plafond sur une vingtaine de routes
- Gravité : 🔴 défaut avéré
- Où : `AgencyController.php:191`, `AuditLogController.php:57`, `PropertyPriceHistoryController.php:18`, `ServiceProviderProfileController.php:44`… (sous `takussan-api/app/Http/Controllers/Api/`)
- Constat :
  - `HasQueryBuilder::PER_PAGE_MAX = 100` ne borne que le `paginate()` sans argument. Un `paginate((int) $request->input('per_page', …))` le contourne.
  - La session en relit 17 de cette forme exacte ; l'agent en compte 23 en incluant les variantes.
  - TCK-599 n'a corrigé que les favoris. Combiné au constat précédent, `per_page=10000` sur les membres d'agence déclenche de l'ordre de 100 000 requêtes.
- Piste : une méthode unique `Controller::perPage($request, $défaut, $max)`, et une garde `scripts/check-*.mjs` qui refuse `paginate(` nourri de `$request->`.

### Le profil plateforme est relu à chaque autorisation
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Providers/AppServiceProvider.php:678`, `takussan-api/app/Models/Concerns/HasProfiles.php:327-331`, `RequireTwoFactor.php:64`, `RequireRecentTwoFactor.php:45`, `LeaseResource.php:125`
- Constat :
  - `Gate::before` appelle `isSuperAdmin()`, qui fait une requête à chaque `can()`, sans mémoïsation.
  - Les middlewares 2FA ajoutent chacun un `exists()`.
  - `LeaseResource` l'appelle une fois par ligne. `ReviewController.php:67-70` contourne déjà le problème localement (lu).
- Piste : charger `platformProfile` une fois par requête, dans `ResolveActiveProfile`.

### 110 clés étrangères sur 252 sans index, dont une sur le chemin de `/api/auth/me`
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
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/TagController.php:20,45,143-147`, `takussan-web/src/app/(dashboard)/app/properties/[id]/page.tsx:62,104`, `takussan-api/app/Models/Tag.php:32`
- Constat :
  - Deux `count()` par tag sont faits après `withCount`. Cela fait environ 72 comptes à chaque ouverture d'une fiche de bien.
  - Ces équipements ne sont demandés qu'après la réponse du bien : deux requêtes en série (lu).
  - À vérifier : `fetchCrmTags` envoie `sort=-usage_count`, absent de `$requestSortable`. Le 400 serait masqué par `.catch(() => [])`, et les suggestions CRM seraient toujours vides.
- Piste : lire `properties_count`/`customers_count`, et lancer la requête des tags en parallèle de celle du bien.

### `whereDate()` sur un horodatage empêche l'usage de l'index
- Gravité : 🟠 risque ou dette
- Où : `CalendarEventCollector.php:195-196,362-363`, `DashboardAgentService.php:114,140`, `Property.php:651,657`, `PaymentController.php:168-180`, `ExportDataService.php:453-460`
- Constat : `scheduled_at::date >= …` force un Seq Scan. Écrite en plage, la même borne passe par l'index `property_visits_scheduled_at_status_index` (mesuré). Sur une colonne `date`, le cast ne coûte rien.
- Piste : des plages `>= début du jour`, `< lendemain`.

### Export synchrone jusqu'à 50 000 modèles complets
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Export/ExportDataService.php:109,139,463-467`, `takussan-api/app/Http/Controllers/Api/ExportController.php:82`
- Constat : `limit(≤ 50 000)->get()` sans `select`, jsonb compris, pendant la requête HTTP (lu).
- Piste : sélectionner les colonnes exportées, `lazyById()` avec une réponse en flux, ou une tâche en file au-delà d'un seuil.

### La liste pro des biens fait six requêtes HTTP, dont deux en série
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/(dashboard)/app/properties/(liste)/page.tsx:97-125,210-229`
- Constat : la liste plus cinq `countProperties` (`per_page=1`), dont « vendus » suivi de « loués » en `.then` (lu).
- Piste : un seul endpoint de compteurs en `COUNT(*) FILTER (WHERE …)`, comme `DashboardAgencyService.php:42-52`.

### Fiche client : les notes sont chargées deux fois
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/queries/customers.ts:114`, `takussan-api/app/Http/Resources/CustomerResource.php:30`, `takussan-web/src/app/(dashboard)/app/customers/[id]/page.tsx:87-91`
- Constat : `include=notes` sérialise toutes les notes, puis la page les redemande paginées (lu).
- Piste : retirer `notes` de l'`include`.

### Onglets de visites : cinq requêtes au montage, et un cache jamais réutilisé
- Gravité : 🟢 amélioration
- Où : `takussan-web/src/components/visits/VisitsList.tsx:37-71`
- Constat : un `useVisits` est lancé par onglet. `nowIso` entre dans la `queryKey` et change à chaque montage (lu).
- Piste : `enabled` réservé à l'onglet actif, et `nowIso` arrondi à la minute.

### `scheduled_task_runs` grossit sans purge
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Services/Admin/HealthcheckService.php:142`
- Constat : environ 11 000 lignes en 34 jours en dev, et aucune purge. La sonde de santé fait un Seq Scan suivi d'un Sort à chaque minute (mesuré).
- Piste : un index `(task, last_run_at DESC, id DESC)` et une purge planifiée.

### Tri du catalogue public sans index adapté
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Http/Controllers/Public/PublicPropertyController.php:156`
- Constat : `ORDER BY ranked_at DESC NULLS LAST, id DESC` force un Sort : l'index `ranked_at` est en ASC (mesuré).
- Piste : un index partiel `(ranked_at DESC NULLS LAST, id DESC) WHERE visibility = 'public' AND NOT is_test`.

### Pénalités de retard : le plafond est relu pour chaque échéance
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
- Gravité : 🔴 défaut avéré, au sein d'une même agence
- Où : `takussan-api/app/Http/Controllers/Api/UserRoleController.php:38-74,104-135`, `takussan-api/app/Http/Requests/Api/UpdateUserRoleRequest.php:10-16`
- Constat :
  - Un admin d'agence change le rôle de tout membre qui a un profil dans l'agence, quel que soit son statut (« appartenance, sans filtre de statut », TCK-587).
  - `setAgent()` et `setOwner()` suppriment les profils `agency_admin` de l'agence. Il n'y a aucune garde sur l'admin principal, le dernier admin, soi-même ni la suspension. Un agent suspendu promu admin repart avec un profil actif neuf.
  - Les voies sœurs ont ces gardes : `AgencyMemberRemovalService.php:52` (`cannot_remove_primary_admin`, dernier admin sous verrou) et `TeamMemberSuspensionService.php:58-59`.
  - Le front appelle cette route (`takussan-web/src/lib/queries/admin-users.ts:81`).
  - Aucun test de `UserRoleControllerTest` ne vise ces cas (lu).
- Piste : une policy `changeMemberRole` qui réutilise les gardes d'`AgencyMemberRemovalService`, un refus des cibles non actives, et un test par garde.

### `/api/users?include=…Profiles` fait sortir les profils des autres agences
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

### Les étiquettes CRM de toutes les agences sont lisibles par tout compte connecté
- Gravité : 🔴 défaut avéré, impact modéré (des libellés, pas des fiches)
- Où : `takussan-api/app/Http/Controllers/Api/TagController.php:18-45,67-77`, `takussan-api/app/Http/Controllers/Api/CustomerTagController.php:60-66`, `takussan-api/app/Models/Tag.php:21-23`
- Constat :
  - Une étiquette tapée sur un client est créée en type `crm`, statut `approved`.
  - `GET /api/tags` (`auth:sanctum` seul, donc ouvert à un compte auto-inscrit) ne restreint à l'agence que si `filter[type]=crm` est envoyé **et** si `agency_id` est non nul. `show` ne regarde que le statut.
  - `$user->agency_id` donne aussi ce périmètre à un bailleur.
  - La comparaison passe par une variable intermédiaire, que `scripts/check-agency-scope-clause.mjs` ne voit pas.
  - Aucun test entre deux agences (lu).
- Piste : exclure le type `crm` hors de l'agence du personnel, dans `index` comme dans `show`, et un test entre deux agences.

### Sous impersonation, l'opérateur lit en clair les comptes de reversement de la cible
- Gravité : 🟠 risque
- Où : `takussan-api/app/Http/Controllers/Api/Me/PayoutMethodController.php:21-31`, `takussan-api/app/Http/Resources/PayoutMethodResource.php:19-33`, `takussan-api/app/Http/Middleware/EnforceImpersonationReadOnly.php:44-58`
- Constat :
  - `account_identifier` et `account_holder_name` sont rendus au « titulaire », c'est-à-dire à la cible pendant une impersonation.
  - La route n'est ni dans `REFUSED_READS` ni sous step-up, alors que la donnée est chiffrée et cachée ailleurs (TCK-601). Le RIB du bailleur, lui, exige un step-up.
- Piste : masquer la forme claire sous `ImpersonationContext`, ou ajouter `api/me/payout-methods*` à `REFUSED_READS`.

### Dix endpoints valident avant d'autoriser (422 au lieu de 403)
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
- Gravité : 🟠 risque faible
- Où : `Api/DocumentController.php:57-63`, `Api/Accounting/BankStatementLineController.php:42` (avec `ReconciliationManager.php:51-53`), `Requests/Api/StoreConversationRequest.php:103-108`
- Constat :
  - `POST /api/documents` rend 404 `document.owner_not_found` avant l'autorisation : il dit si un bail, un client ou un bien d'une autre agence existe.
  - Le rapprochement bancaire distingue 404 et 403.
  - La conversation distingue « introuvable » et « non joignable » (lu).
- Piste : autoriser avant de résoudre, ou rendre le même code dans les deux cas.

### Le proxy `admin-users` ne relaie pas le profil actif
- Gravité : 🟢 à vérifier
- Où : `takussan-web/src/app/api/admin-users/[[...path]]/route.ts:17-40`
- Constat : seul `Authorization` est relayé, sans `X-Active-Profile-Hint` ni cookie de profil. Pour un admin présent dans plusieurs agences, `UserAdminController:16-22` rendrait 403, et la console d'équipe serait inutilisable pour lui (lu, non mesuré).
- Piste : relayer l'indice de profil comme les fetchers serveur (`RequestOptions` de `src/lib/api.ts`).

## Angle 4 — Argent : montants, devises, arrondis, factures, paiements

*Exploré le 2026-10-15 vers 0 h 55, en lecture (et une mesure jsdom). Les quatre 🔴 ont été relus
contre le code par la session.*

### Échéancier trimestriel ou annuel : un seul mois de loyer facturé par période
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Model/LeaseService.php:203,220,245`
- Constat :
  - Chaque échéance vaut `monthly_rent`, et `period_end` est la fin du mois de l'échéance. `advancePeriod()`, lui, saute 3 ou 12 mois.
  - Un bail trimestriel de 12 mois produit donc 4 échéances d'un mois chacune : 4 mois de loyer facturés au lieu de 12.
  - Le formulaire propose « Trimestriel » avec un champ « Loyer mensuel » (`CreateLeaseForm.tsx:238`).
  - `GenerateLeasePaymentScheduleTest` ne teste aucune fréquence (lu).
- Piste : multiplier par le nombre de mois de la période, couvrir toute la période, et un test par fréquence.

### La révision de loyer n'atteint jamais les échéances déjà générées
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Lease/RentReviewService.php:109`, `takussan-api/app/Services/Model/LeaseService.php:152,198`
- Constat :
  - `review()` ne modifie que `leases.monthly_rent`. L'échéancier entier est généré à l'activation, et refuse de se régénérer (`lease.schedule_exists`).
  - Aucun observateur ni écouteur ne réagit au loyer : la session n'en trouve aucun.
  - Le locataire est notifié du nouveau loyer, puis facturé à l'ancien jusqu'à la fin du bail. Le docblock (`:19-22`) dit le contraire.
  - Aucun test ne lit les `LeasePayment` après une révision (lu).
- Piste : à `effective_date`, réécrire le montant des échéances `pending` à venir, sous verrou du bail, et un test.

### L'annulation d'une résiliation anticipée annule une facture émise sans avoir
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Lease/EarlyTerminationService.php:162-163` (création en `:337`)
- Constat :
  - La facture de pénalité naît émise (`Sent`) et numérotée.
  - `cancel()` la passe en `Cancelled` par `forceFill`, sans `InvoiceService::cancel()`, donc sans avoir. ADR-0039 §7 exige un avoir pour annuler une facture émise.
  - Un numéro `FA-…` disparaît ainsi sans contrepassation. `EarlyTerminationServiceTest.php:151` ne vérifie pas l'avoir (lu).
- Piste : passer par `InvoiceService::cancel()`, et asserter `credited_invoice_id`.

### Restitution de caution : le champ refuse tout montant rond
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/leases/DepositRefundModal.tsx:171-172`
- Constat :
  - `<input type="number" min={0.01} step={1000}>` dans un `<form>` sans `noValidate`. La base du pas est le `min`, si bien que seuls 0,01 + k×1000 sont valides.
  - Mesuré (jsdom) : `150000` lève un `stepMismatch`. Le navigateur bloque donc le montant pré-rempli, et un montant en `,01` dépasse le restant, que le serveur refuse (`DepositRefundService.php:77`).
  - Une restitution intégrale d'une caution ronde est impossible depuis l'écran.
  - Même défaut, en moins grave, dans `CreateLeaseForm.tsx:233,243,253` et `LeaseRenewalDialog.tsx:230,251` (`step={1000}`) : un loyer de 152 500 est refusé (mesuré).
  - La modale est simulée dans son seul test.
- Piste : `step="any"` ou `step={1}` avec `min={1}`, ou passer par `FormAmountInput`.

### Clôture plateforme : périmètre et devise du reversement
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Billing/PlatformPayoutService.php:234-276`
- Constat :
  - Tous les paiements `paid` de l'agence entrent dans le calcul, y compris les espèces et ceux encaissés par une intégration propre à l'agence. Or TCK-223 décrit un reversement de ce que la plateforme a encaissé.
  - La devise retenue est celle de la première ligne, sans contrôle de mélange.
  - La pénalité encaissée avec le loyer est absente du brut (lu ; intention à vérifier).
- Piste : borner aux paiements soldés par une intégration globale, inclure la pénalité, et refuser les devises mélangées comme le fait `PayoutCalculator`.

### La garde de sous-paiement ne s'applique pas à Lemon Squeezy, ni peut-être à Orange Money
- Gravité : 🟠 risque ou dette
- Où : `PaymentGatewayService.php:606-609`, `LemonSqueezyDriver.php:159-172`, `OrangeMoneyDriver.php:65,148-149` (sous `takussan-api/app/Services/Payments/`)
- Constat :
  - La garde sort quand `metadata.amount` est absent, et `extractFees()` de Lemon Squeezy n'en fournit jamais.
  - Orange Money envoie `OUV`, la devise du bac à sable, pour du XOF. Le format des notifications est à vérifier.
- Piste : chaque pilote fournit le montant (en unité majeure) et la devise ; la devise Orange Money passe en configuration par environnement.

### Lemon Squeezy ignore la devise du payable
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Payments/Drivers/LemonSqueezyDriver.php:47-55,164`
- Constat : `$currency` n'est pas lu, et `custom_price` est exprimé dans la devise de la boutique. `extractFees()` mélange `total_usd` et des taxes en devise de boutique (lu ; comportement de l'API à vérifier).
- Piste : refuser quand la devise du payable diffère de celle de la boutique.

### Arrondis au centime sur du XOF
- Gravité : 🟠 risque ou dette
- Où : `InvoiceService.php:58`, `CommissionLedgerService.php:82`, `DepositRefundService.php:58`, `PlatformPayoutService.php:266` comparé à `:199`
- Constat :
  - Ces calculs arrondissent à 2 décimales, alors que `PayoutCalculator` et `amountDue()` arrondissent à l'unité de la devise. Une TVA de 18 % sur 100 001 donne 118 001,18 XOF facturés pour 118 001 encaissés.
  - La clôture (arrondi par ligne, en PHP) et le détail (`SUM` en SQL) peuvent différer (lu).
- Piste : une seule fonction d'arrondi par devise (`Currency::decimalPlacesOf`), appliquée partout.

### Devise forcée, et affichage sans décimales hors XOF
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Invoice/InvoiceService.php:75`, `takussan-web/src/lib/format/useFormatteurs.ts:131-133`, `RevenueChart.tsx:171`
- Constat :
  - Une facture sans devise explicite part en XOF, même pour une agence en EUR.
  - `fmt.montant` impose 0 décimale à toute devise : 12,50 € s'affiche « 13 € ».
  - `RevenueChart` formate toujours en XOF (lu).
- Piste : par défaut, la devise de l'agence, et les décimales de `CURRENCY_METADATA`.

### Restitution d'une caution jamais encaissée
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Lease/DepositRefundService.php:55,74`
- Constat : le restituable part de `leases.deposit_amount`, jamais rapproché d'une `LeasePayment` de type `deposit` payée (lu).
- Piste : borner la restitution à ce qui a été encaissé.

### Référence fournisseur sans index ; paiement partiel inachevé
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
- Gravité : 🟠 risque ou dette
- Où : `deploy/takussan/compose.api.yml:65-68`, `takussan-api/routes/console.php:106,113,115,151,174`
- Constat :
  - Le service `scheduler` n'a pas de `stop_grace_period`, donc Docker attend 10 s.
  - PID 1 est `schedule:work`, et le sous-processus `schedule:run` ne reçoit jamais le signal : son verrou n'est pas rendu.
  - Le verrou vit dans Redis (`appendonly`) pendant `expiresAt = 1440` minutes.
  - `impersonation:close-expired`, `health:probe` et `boosts:tick` durent de 12 à 25 s en dev (mesuré). Un déploiement qui tombe pendant l'une d'elles la saute donc 24 h (lu ; non observé en préproduction).
- Piste : `->withoutOverlapping(N)` avec N proche de la période, et `stop_grace_period: 120s`.

### Les jobs qui ciblent un jour ou une heure exacts ne rattrapent rien
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
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Jobs/SendLeasePaymentReminders.php:57-105,115-147`
- Constat :
  - `claim()` marque toutes les échéances du jalon, puis la boucle envoie.
  - Si une exception survient au milieu, ou si le job est coupé à 60 s faute de `$timeout`, le reste est déjà marqué : le rejeu ne le renvoie jamais.
  - Aucun test ne simule un échec en cours de boucle (lu).
- Piste : réserver et envoyer échéance par échéance, ou rendre la réservation en cas d'échec, comme `SendSavedSearchAlerts`.

### `account:execute-deletions` : une suppression en échec bloque toutes les suivantes
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Console/Commands/ExecuteScheduledAccountDeletions.php:44-47`, `takussan-api/app/Services/Account/AccountDeletionService.php:406-413`
- Constat :
  - Il n'y a ni `catch` par demande ni `orderBy` : une `anonymize()` qui lève bloque, toutes les heures, toutes les suppressions RGPD échues après elle.
  - La seule trace est une ligne `failed` dans `scheduled_task_runs` (lu).
- Piste : un `try/catch` par demande, hors transaction, avec `report()`, et `orderBy('scheduled_for')`.

### Les notifications ne partent après le commit que grâce au driver `database`
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/queue.php:44,64,73` (`after_commit => false`), par exemple `LateFeeCalculator.php:162` et `BookingExpirationService.php:204-206`
- Constat :
  - Des notifications et des écouteurs `ShouldQueue` sont dispatchés dans des transactions. Avec la file `database`, la ligne `jobs` est annulée avec la transaction, donc le comportement est juste aujourd'hui.
  - Passer `QUEUE_CONNECTION` à `redis` (évoqué en `docs/configuration.md:136`) enverrait des notifications pour des écritures annulées. Rien ne garde cette propriété (lu ; aucun test trouvé).
- Piste : `after_commit => true` sur toutes les connexions de file, ou une garde.

### `retry_after` à 90 s est sous le `$timeout` de quatre jobs ; un seul worker sert aussi la file urgente
- Gravité : 🟠 risque ou dette
- Où : `ExpirePendingBookingsJob.php:21,26` (300 s), `SyncPropertyCalendarFeedsJob.php:25` (540 s), `SendSavedSearchAlerts.php:83` et `SendFavoriteChangeAlerts.php:61` (1800 s) ; `docs/infra/hebergement.md:101` ; `deploy/takussan/compose.api.yml:55`
- Constat :
  - Un second consommateur, ou le worker relancé après un SIGKILL, réserve à nouveau un job en cours : rejeu ou échec parasite.
  - `worker` consomme `notifications-urgent,default` : une alerte de 30 min retarde d'autant une notification de maintenance urgente (lu ; durées en production à vérifier).
- Piste : `DB_QUEUE_RETRY_AFTER` au-dessus de 1800 s, ou une file dédiée aux balayages longs.

### `scheduled_task_runs` ne mesure que la mise en file des `Schedule::job`
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Admin/ScheduledRunRecorder.php`, et `Schedule.php:217-226` du framework
- Constat :
  - Pour les 19 jobs planifiés, la ligne mesure le dispatch : de 0 à 80 ms, toujours `finished` (mesuré). Un échec dans le worker n'apparaît que dans `failed_jobs`.
  - Le verrou du scheduler ne protège pas l'exécution, et aucun job planifié n'est `ShouldBeUnique` (lu).
- Piste : l'écrire dans `takussan-api/CLAUDE.md` § Tâches planifiées, et le middleware `WithoutOverlapping` sur les balayages.

### Petits écarts entre docblock et code
- Gravité : 🟢 amélioration
- Où : `takussan-api/app/Jobs/SendRawNotificationEmailJob.php:38-48`, `takussan-api/app/Console/Commands/BoostsTick.php:12-15` avec `BoostLifecycle.php:204-218`, `takussan-api/app/Jobs/Crm/SendProspectMatchDigest.php`
- Constat :
  - `SendRawNotificationEmailJob` attrape `\Throwable` dès le premier essai : `$tries` et `backoff()` sont inutiles. Son seul appelant n'est appelé nulle part (code mort, à vérifier). `SendDailyNotificationDigest` n'est ni planifié ni dispatché.
  - `boosts:tick` annonce que « chaque transition » est réclamée, mais `pause()` et `resume()` écrivent le modèle chargé.
  - `SendProspectMatchDigest` envoie avant de poser sa clé d'idempotence, et journalise `$e->getMessage()`, ce que TCK-601 interdit (lu).
- Piste : supprimer le code mort, réclamer par `UPDATE … WHERE`, et passer par `SafeExceptionContext::of($e)`.

### `onOneServer` et le fuseau horaire : pas de défaut aujourd'hui, un piège pour la production
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
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/actions/locale.ts:41`, `takussan-api/routes/api/me.php:32`, `takussan-api/database/migrations/2026_04_15_210400_add_fields_to_users_table.php:28`
- Constat :
  - Le sélecteur de langue envoie `PATCH /api/users/me`, une route qui n'existe pas : `php artisan route:list --path=users/me` ne rend rien (mesuré par la session). L'échec est avalé par un `catch {}`.
  - Aucun FormRequest n'accepte `preferred_language`.
  - L'inscription ne l'écrit pas, et il vaut `'fr'` par défaut. Le provisionnement d'agence l'expose, et l'écrit peut-être (à vérifier).
  - Or `User::preferredLocale()` gouverne la langue des e-mails (`NotificationService.php:89`), des SMS, des résumés (`NotificationDigestMail.php:34`) et des titres stockés.
  - 26 classes de notification écrivent un `title` sans `code`, et le front les affiche tels quels (`texteNotification.ts`).
- Piste : accepter `preferred_language` sur `PATCH /api/me`, corriger le chemin dans `locale.ts`, et le renseigner à l'inscription depuis `Accept-Language`.

### Messages système des groupes : rôle toujours « member », aperçu figé en français
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Services/Messaging/SystemMessageFactory.php:75,129-143`, `takussan-web/src/components/messages/SystemMessageBubble.tsx:36`, `takussan-api/app/Observers/MessageObserver.php:13`
- Constat :
  - L'API émet `metadata.role`, le front lit `meta.new_role ?? 'member'` : « X a changé le rôle de Y en member », pour tout changement, en jeton anglais brut, dans les trois langues.
  - `humanise()` écrit des `sprintf` en français dont l'observer tire `last_message_preview`, affiché tel quel par `ConversationList.tsx:194` (lu).
- Piste : aligner la clé, traduire le rôle, et dériver l'aperçu côté front depuis `metadata.event`.

### Les PDF (bail, état des lieux, quittances, facture) sont en français seulement, avec des dates dans une autre langue
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/resources/views/pdf/leases/contract.blade.php`, `inventories/report.blade.php`, `receipts/rent.blade.php:22`, `receipts/booking.blade.php`, `invoices/default.blade.php`, `layouts/base.blade.php:18`, `takussan-api/app/Services/Pdf/DocumentPdfService.php:143`
- Constat :
  - 5 gabarits portent 55 textes français et aucun `__()` : 0 dans `receipts/rent.blade.php` (relu). Seuls `statements/owner` et `maintenance/quote` sont traduits.
  - `<html lang="fr">` est en dur.
  - `translatedFormat('F Y')` suit la locale active : « Quittance de loyer — October 2026 » pour un anglophone.
  - Les titres `'État des lieux #'` (`InventoryController.php:209`) et `'Réservation #'` (`PaymentReceiptPdf.php:58`) sont en dur.
  - Aucun ADR ne dit que ces actes sont en français par choix (mesuré par script).
- Piste : décider par ADR (français juridique, ou acte bilingue), puis passer par `lang/*`.

### Des messages de validation en français en dur, servis tels quels en `en` et `wo`
- Gravité : 🔴 défaut avéré
- Où : `takussan-api/app/Http/Requests/Api/StorePropertyMediaRequest.php:45-48`, `RejectPropertyRequest.php:24-26`, `InventorySignRequest.php:94-126`, `Agency/AssignAgencyRoleRequest.php:53`, `Agency/SyncCapabilitiesRequest.php:55`, `Permissions/StoreRoleDelegationRequest.php:80-86`
- Constat :
  - 14 messages sont des littéraux français.
  - `StoreRoleDelegationRequest` injecte des noms d'attribut français dans le gabarit de la langue active : « The utilisateur field is required. ».
  - Le front affiche `message` en le supposant localisé (`takussan-web/src/lib/api.ts:543`).
- Piste : des clés `lang/*/validation.php` ou des codes, et une garde qui refuse tout littéral dans `messages()`.

### Dates du site public figées en `fr-FR`
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyReviews.tsx:32`, `PropertyPriceHistory.tsx:16`, `takussan-web/src/components/public/profile/ReviewsSection.tsx:23`
- Constat :
  - En `/en`, la fiche publique affiche « 12 octobre 2026 ».
  - 11 autres locales sont figées : `PropertyModerationBanner.tsx:86`, `UpgradeRequestStatus.tsx:60,65`, `FilterSidebar.tsx:451-452`, `ActiveSessionsSection.tsx:103`, `PropertyKpiStrip.tsx:71`, `PropertyList.tsx:504`, `types/search.ts:388`.
  - 7 `toLocaleString()` nus dans `components/leases/*`.
  - `check-locale-figee.mjs` les tolère dans son cliquet (mesuré).
- Piste : `useFormatteurs()`, et faire descendre le plafond du cliquet.

### Wolof : 334 valeurs identiques au français, dont des phrases d'interface
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/messages/wo.json:5731-5734,3549`, `takussan-web/src/messages/fr.json:3897`
- Constat :
  - La parité des clés est exacte, mais 334 valeurs `wo` sont égales au `fr`, dont 46 visiblement françaises. Par exemple la navigation de l'assistant de publication (« Étape {current} sur {total} », « Précédent », « Continuer », « Plus tard »), `property.conditions.*` et `crm.pipeline.stage.*`.
  - `lease.form.customerFallback` vaut « Customer #{id} » en `fr`.
  - En anglais, seules 4 valeurs ressemblent à du français, toutes des noms propres (mesuré).
- Piste : relecture des 46 valeurs par un locuteur, et un cliquet décroissant « wo == fr hors emprunts » dans `check-i18n`.

### L'éditeur de gabarits de notification écrit du français dans les lignes `en` et `wo`
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Admin/NotificationTemplateService.php:58-60,96-112,152-165`
- Constat :
  - `fallbackBody()` ignore `$locale` et renvoie le corps français pour les trois langues.
  - Le front renvoie tous les `templates` à l'enregistrement (`notification-templates.tsx:80`). La première sauvegarde écrit donc du français en `en` et `wo`, et `renderActive()` préfère ces lignes à `lang/*` (lu ; lignes en base à vérifier).
- Piste : pré-remplir depuis `lang/{locale}/notifications.php`, et ne persister que les langues modifiées.

### Noms de champs non traduits : « Le champ is active est obligatoire »
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/lang/fr/validation.php` (bloc `attributes`), `takussan-api/lang/en/validation.php`
- Constat :
  - 55 attributs sont traduits en `fr` et `wo`, aucun en `en`, sur 406 noms de champ validés (mesuré).
  - TCK-651 l'a constaté aussi : « le champ value » pour toutes les clés du catalogue.
- Piste : traduire les champs que les formulaires remontent, ou ne jamais afficher la prose 422 et la remplacer par un libellé du front.

### Journal d'audit : des descriptions brutes qui mêlent français, anglais et codes
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/admin/AuditTrail.tsx:536`, `admin/super/ConsoleRecentActivity.tsx:77`, `user-detail.tsx:479`
- Constat : 147 `->log('…')` littéraux, dont 31 en français. Les autres sont en anglais (« Exported audit trail ») ou sont des codes (mesuré).
- Piste : afficher `event` traduit (`admin.audit.events.*`), et réserver `description` à l'export.

### Pluriels absents
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/messages/fr.json:95` (lue par `Navbar.tsx:518`), `takussan-web/src/components/dashboard/admin/AgencyKpis.tsx:51`
- Constat :
  - 49 messages `fr` (50 en `en`) écrivent `{count} <nom>` sans ICU `plural` : « 1 biens », « 1 months ».
  - 7 formes « (s) ».
  - `AgencyKpis` passe un nombre déjà formaté dans `count` (mesuré).
- Piste : ICU `plural`, et une règle de `check-i18n` sur `{count} [a-z]` sans `plural`.

### Titre d'annonce suggéré en langue mêlée
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/property-form/wizard/suggest-title.ts:47,59`
- Constat : « chambres » et « à » sont en dur. Résultat en `en` : « Apartment 3 chambres à Almadies » (lu).
- Piste : une clé ICU avec `plural`.

### Libellés du catalogue super-admin écrits en français par l'API
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Domain/Settings/EditableBusinessEnums.php:20-40`, `Domain/Notifications/EditableNotificationEvents.php:13-29`, `Domain/Integrations/Providers/MailProvider.php:26`
- Constat : `name` et `description` sont affichés tels quels par `business-enums.tsx:117-118` et `notification-templates.tsx:101` (lu). Les paramètres plateforme, eux, sont traduits par clé depuis TCK-600.
- Piste : émettre une clé, et rendre le libellé côté front.

### Des documents qui affirment l'inverse de la mesure
- Gravité : 🟢 amélioration
- Où : `CLAUDE.md` (principe n° 5), `takussan-web/CLAUDE.md` (section i18n), `PropertiesDiscoveryPage.tsx:333`
- Constat :
  - `check-i18n --report` mesure 0 texte en dur toléré : « tenue à 82 fichiers sur 875 » est périmé.
  - « wo traîne 88 clés manquantes » est faux : il en manque 0.
  - « `lang/fr/validation.php` ne porte pas `boolean` » est faux aussi (mesuré).
- Piste : remplacer ces chiffres par la commande qui les donne.

### Pages légales vides en wolof
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
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/globals.css:758-760,773-777`, `takussan-web/src/components/search/SearchAutocomplete.tsx:65`
- Constat :
  - Pastille de prix : `#fcf9f3` sur `#c87a52` est à **3,14:1**, et **3,83:1** au survol (`#b66c43`), en 12 px gras.
  - Surlignage des suggestions : `<mark>` en `text-primary` sur `bg-primary/15`, à 4,33:1 (mesuré).
- Piste : la pastille lit `--primary` (5,06:1) au lieu d'une valeur recopiée en dur ; `--primary-deep` pour le surlignage.

### Encre atténuée sous le seuil sur quatre parcours
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/agency/BrandingBanner.tsx:42`, `takussan-web/src/components/leases/EarlyTerminationBanner.tsx:93`, `takussan-web/src/components/property-dashboard/ProprietaireEtResponsable.tsx:45,52`, `PropertyVisitDialog.tsx:288,352`
- Constat :
  - `text-warning/80` sur `bg-warning/10` : 3,53:1.
  - `text-muted-foreground/70` : de 2,95 à 3,03:1.
  - Même famille : `AvailabilityGrid.tsx:109` (3,70:1) et `ui/calendar.tsx:82`, où les jours hors du mois sont à 2,11:1 (mesuré).
- Piste : retirer l'opacité (`text-warning` est à 5,17:1, `text-muted-foreground` à 5,44:1), et une garde « pas d'alpha sur une encre de texte », comme TCK-359 pour les onglets.

### L'erreur de la barre d'actions groupées est illisible
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/components/property-dashboard/PropertyList.tsx:688,757`
- Constat : `role="alert"` en `text-destructive` sur `bg-foreground/95`, à **2,22:1**. Les gardes `check-destructive-contrast` ne mesurent pas ce fond (mesuré).
- Piste : une pastille claire (`bg-background text-destructive`), ou l'encre claire de la barre avec une icône.

### La note des avis est invisible au lecteur d'écran
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyReviews.tsx:73-81`
- Constat :
  - La note n'est rendue que par cinq `<Star>`, que lucide marque `aria-hidden`, et aucun texte ne la porte.
  - Les étoiles vides (`/40`) sont à 1,78:1, sous les 3:1 d'un objet graphique (lu, mesuré).
- Piste : `role="img" aria-label={t('rating', {n})}`, ou un `sr-only` « 4 sur 5 », et les étoiles vides en `text-muted-foreground` plein.

### Une ligne de versement cliquable seulement à la souris
- Gravité : 🔴 défaut avéré (console super-admin)
- Où : `takussan-web/src/components/billing/PayoutTable.tsx:120-123`, appelée avec `onSelect` par `AdminPayoutsClient.tsx:96`
- Constat : `<tr onClick>` sans rôle, sans `tabIndex` ni clavier, et aucun bouton dans la ligne : le détail est inatteignable au clavier (lu).
- Piste : un `<button>` dans la cellule de période, comme `InvoicesTable.tsx:100`.

### Champ de recherche principal : pas de libellé, et focus peu visible
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/search/SearchAutocomplete.tsx:226-262`, `takussan-web/src/components/home/Navbar.tsx:419,677`
- Constat :
  - L'input n'a ni `<label>` ni `aria-label` : le placeholder seul le nomme.
  - Il porte `outline-none`, sans `focus-within:` sur la pilule.
  - `role="combobox"` est sur le `div`, selon le motif ARIA 1.1 (lu ; rendu du focus à vérifier).
- Piste : un `aria-label` traduit, le motif ARIA 1.2, et `focus-within:ring-2` sur la pilule.

### Des erreurs de champ ni reliées ni annoncées hors des `Form*`
- Gravité : 🟠 risque ou dette
- Où : `PropertyVisitDialog.tsx:263,270,276,283`, `PropertyContactMessageDialog.tsx:96`, `PropertyReservationDialog.tsx:440`, `PropertyReviews.tsx:281`, `leases/CreateLeaseForm.tsx:347,359`, `leases/DepositRefundModal.tsx:182,215`
- Constat : 13 contrôles sur 49 qui portent `aria-invalid` n'ont pas de `aria-describedby`, et 48 `<p class="text-destructive">` n'ont pas de `role`. Les `Form*` sont bien câblés (mesuré).
- Piste : migrer ces champs vers `FormInput`/`FormError`.

### Des champs nommés par le seul placeholder
- Gravité : 🟠 risque ou dette
- Où : `search/FilterSidebar.tsx:161,172,183`, `PropertyContactMessageDialog.tsx:89`, `PropertyReviewForm.tsx:94,102`, `PropertyPagination.tsx:113`
- Constat :
  - 21 champs ne sont nommés que par leur placeholder, et 2 n'ont aucun nom.
  - Le sélecteur de taille de page (un `SelectTrigger`, donc un `<button role="combobox">`) est sans nom, dans 8 listes (mesuré).
- Piste : `aria-labelledby` vers le titre de section, et un `aria-label` sur le sélecteur de taille de page.

### Anneau de focus à 50 % (2,08:1) et bordure des champs à 1,26:1
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/ui/button.tsx:31`, `ui/input.tsx:20`, `takussan-web/src/app/globals.css:163,694`
- Constat :
  - `ring-ring/50` est à 2,08:1 sur `--background` ; sur un bouton plein, c'est le seul signal de focus. TCK-371 l'avait relevé, et aucun ticket n'a été ouvert.
  - `--input: #ebe5d5`, seul contour d'un champ, est à 1,26:1 (WCAG 1.4.11, mesuré).
- Piste : un anneau plein ou `outline-2 outline-offset-2`, et un jeton `--input` propre, autour de 3:1.

### Focus du marqueur de carte, visionneuse sans nom, entrée verrouillée hors du clavier
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/globals.css:773-777`, `PropertyLightbox.tsx:55`, `takussan-web/src/components/layout/AppSidebar.tsx:557-568`
- Constat :
  - Le marqueur au focus n'a qu'un écart de 1,22:1 avec son état normal, et porte `outline: none`.
  - Le `Popup` de la visionneuse n'a pas de nom.
  - `<span role="link" aria-disabled title>` n'est pas focusable, et la raison du verrou n'est que dans `title` (signalé par TCK-371, toujours présent).
- Piste : un `outline` blanc de 2 px décalé ; `aria-label` sur le `Popup` ; `tabIndex={0}` et la raison en `sr-only`.

### Le mouvement réduit est ignoré par les primitives
- Gravité : 🟠 risque ou dette (AAA, mais la charte en fait une règle)
- Où : `ui/sheet.tsx:104-110`, `ui/dialog.tsx:58`, `ui/popover.tsx`, `ui/select.tsx`, `property/cards/PropertyRow.tsx:184`
- Constat : `slide-in` et `zoom-in` de tw-animate-css ignorent `prefers-reduced-motion`, aucun `motion-reduce:` n'apparaît, et `scrollBy({behavior:'smooth'})` n'est pas conditionné (mesuré).
- Piste : `motion-reduce:animate-none` dans les primitives.

### Le lint d'accessibilité est presque éteint
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/eslint.config.mjs:37-39`
- Constat : 6 règles `jsx-a11y` seulement, en `warn`. Ni `label-has-associated-control`, ni `click-events-have-key-events`, ni `no-static-element-interactions` : aucune garde n'aurait attrapé les constats ci-dessus (lu).
- Piste : ces règles en `error`, sous un cliquet par fichier comme `check-i18n`.

### Boutons « Ouvrir » sans contexte, tableaux sans titre
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
- Gravité : 🔴 défaut avéré (un envoi réel reste à rejouer)
- Où : `takussan-web/next.config.ts` (pas de clé `serverActions`), `takussan-web/src/app/actions/dashboard-properties.ts:243`, `takussan-web/src/components/property-form/PropertyWizard.tsx:325-329`, `takussan-web/src/components/property-dashboard/PropertyMediaPanel.tsx:71`
- Constat :
  - Sans `serverActions.bodySizeLimit`, Next refuse tout corps de server action au-delà de 1 Mo (`node_modules/next/dist/server/app-render/action-handler.js:517-519`, relu par la session). Le multipart est concerné.
  - Le wizard met toutes les photos dans un seul `FormData`, alors qu'une seule photo réduite pèse 1 446 048 o (mesure de TCK-542, qui dit n'avoir « rejoué aucun envoi réel vers l'API »).
  - Même plafond pour `dashboard-customers.ts:175` (documents) et `admin-agency.ts:110`.
  - `MediaManager.tsx:172-190` simule la progression jusqu'à 85 %, puis tout tombe d'un coup.
- Piste : une photo par requête, par route handler BFF ou directement vers l'API, avec une vraie progression (XHR) et une reprise par fichier. Relever `bodySizeLimit` seul ne règle pas le réseau lent.

### Les dialogues n'ont ni hauteur maximale ni défilement
- Gravité : 🔴 défaut avéré (rendu à vérifier)
- Où : `takussan-web/src/components/ui/dialog.tsx:58`, `takussan-web/src/app/[locale]/(public)/properties/[slug]/components/PropertyVisitDialog.tsx:172`
- Constat :
  - La primitive est `fixed top-1/2 -translate-y-1/2`, sans `max-h` ni `overflow-y-auto` (relu). Seuls 3 `DialogContent` sur 75 l'ajoutent.
  - Le dialogue de visite empile la date, 20 créneaux en 5 rangées, quatre champs et le bouton : environ 640 px estimés. Sur un 360×640, le titre et « Envoyer » sortent de l'écran, et le verrou de défilement interdit d'y aller.
  - Même risque pour `CreateInvoiceDialog`, `InviteAgentDialog` et `GuarantorSection` (comptage).
- Piste : `max-h-[calc(100dvh-2rem)] overflow-y-auto` dans la primitive, ou un pied collant ; une feuille du bas sous `sm`.

### Un montant hors pas bloque l'envoi des formulaires de bail et de paiement
- Gravité : 🔴 défaut avéré — même famille que « Restitution de caution » à l'angle 4
- Où : `takussan-web/src/components/leases/CreateLeaseForm.tsx:233,243,253`, `LeasePaymentDialog.tsx:92`, `DepositRefundModal.tsx:172`, `bookings/BookingPaymentDialog.tsx:91`, `payments/CreateInvoiceDialog.tsx:227`
- Constat : `FormInput` transmet `step` (`components/forms/FormInput.tsx:90`), et aucun de ces 5 formulaires n'a `noValidate`. Un loyer de 75 500 ou un paiement de 12 350 sont refusés avant `onSubmit` (lu).
- Piste : retirer `step` (zod valide déjà), ou poser `noValidate`. À traiter avec l'angle 4, en un seul ticket.

### Les marges de zone sûre sont sans effet : pas de `viewport-fit=cover`
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/layout.tsx` (pas d'export `viewport`) ; 9 usages d'`env(safe-area-inset-bottom)`, dont `home/Navbar.tsx:676,811,855`, `search/FilterSidebar.tsx:1099`, `wizard/WizardShell.tsx:99`
- Constat : `viewport-fit` est absent de `src/`, donc iOS rend `env(safe-area-*)` à 0. TCK-477 garde le consommateur, pas le viewport (mesuré ; iPhone réel à vérifier).
- Piste : `export const viewport = { viewportFit: 'cover' }`, puis relire les en-têtes fixes en paysage.

### Brouillons : les photos ne sont jamais sauvées, rien n'est gardé hors ligne
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/property-form/PropertyWizard.tsx:240,465-470`, `takussan-web/src/hooks/useWizardDraft.ts:166-188`
- Constat :
  - Les photos ne vivent qu'en mémoire : un onglet tué par Android pendant l'appareil photo les perd.
  - L'autosave fait un `PUT` serveur sans copie locale, et sans relance au retour du réseau (aucun `online` ni `offline` dans `src/`, mesuré).
- Piste : une copie IndexedDB (valeurs et `File`) et une relance sur `online`.

### Les formulaires longs hors wizard n'ont aucun brouillon
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/leases/CreateLeaseForm.tsx` (11 champs), `customer-form/CustomerForm.tsx` (17), `property-form/PropertyForm.tsx` (13)
- Constat : aucune persistance, et aucun `beforeunload` dans `src/` (mesuré).
- Piste : `useWizardDraft` sous une clé par écran, comme `WizardReprenable`.

### Des tableaux sans alternative en cartes, l'action en dernière colonne
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/components/console/DataTable.tsx:140`, `owners/OwnersList.tsx:209-230`, `service-providers/ServiceProvidersList.tsx:163,223`, `commissions/CommissionsLedger.tsx:126,212`, `payments/InvoicesTable.tsx:74,99-106`
- Constat : sur 32 consommateurs de `DataTable`, seuls `CustomerList` et `PropertyList` ont une liste mobile. Ailleurs, l'action ne s'atteint qu'après un défilement horizontal (mesuré).
- Piste : une option `carteMobile` dans `DataTable`, ou la ligne cliquable avec l'action en tête.

### Barres d'onglets sans défilement
- Gravité : 🟠 risque ou dette (à vérifier)
- Où : `takussan-web/src/components/ui/tabs.tsx:27,87`, `payments/PaymentsTabs.tsx:81`, `property-dashboard/PropertyDetailTabs.tsx:71`
- Constat : 5 onglets totalisent environ 53 caractères pour 328 px, sans enveloppe `overflow-x-auto` (contrairement à `CustomerDetailTabs.tsx:65`). C'est `<main>` qui défilerait de côté, et la sonde de TCK-505 ne le voit pas (lu).
- Piste : reprendre le patron de `CustomerDetailTabs` dans la primitive.

### Zoom iOS sur des champs faits main en `text-sm`
- Gravité : 🟠 risque ou dette
- Où : `inventory/RoomEditor.tsx:140`, `admin/InviteAgentDialog.tsx:136,154,175,194`, `admin/InviteMemberDialog.tsx:111`
- Constat : les primitives sont saines (`text-base md:text-sm`), mais ces champs sont sous 16 px, et Safari zoome au focus (mesuré).
- Piste : `Input`/`Textarea`, ou `text-base md:text-sm`.

### Petites améliorations
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
- Gravité : 🔴 défaut avéré
- Où : `origin/master` à `fefe2c87` (2026-08-15), servi par Vercel (`docs/infra/frontend-deploiement.md:13`) ; `takussan-web/src/app/robots.ts` date du 2026-08-27 (TCK-431)
- Constat :
  - Sur www.takussan.com, `/robots.txt` et `/sitemap.xml` rendent **404** (mesuré à nouveau par la session).
  - `/fr` rend 404, et `/` rend 200 sans canonique, `hreflang` ni `og:*`.
  - `master` a **1 845 commits** de retard sur `dev`.
  - TCK-431 à 436 et 598 n'existent qu'en préproduction et en local. `docs/ardoise.md` ne dit pas que le SEO n'est pas en ligne.
- Piste : l'écrire dans l'ardoise et le rattacher à la phase F (TCK-517) ; à la bascule, soumettre le sitemap à la Search Console.

### Les combinaisons de facettes sans résultat sont indexables (soft-404)
- Gravité : 🔴 défaut avéré
- Où : `takussan-web/src/app/[locale]/(public)/properties/(liste)/page.tsx:47-55`, `takussan-web/src/lib/canonique.ts:284`
- Constat :
  - `/fr/properties?type=factory&contract_type=rent&city=Dakar` rend 200 avec `total: 0`, le titre « Usine à louer à Dakar », `index, follow` et une canonique vers elle-même (mesuré en local).
  - Chaque valeur de facette est validée seule, jamais leur combinaison : types × contrats × villes × quartiers × 3 langues donne autant de pages vides indexables.
  - `generateMetadata` ne pose aucun `robots` (relu). Les annuaires, eux, ont `facette.indexable` (`agencies/page.tsx:53`).
- Piste : `robots: { index: false, follow: true }` quand `total === 0`, en partageant le résultat de la recherche avec `generateMetadata` par `cache()`.

### Pas d'aperçu WhatsApp ou Facebook hors des fiches
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/[locale]/(public)/page.tsx:20-23`, `(public)/properties/(liste)/page.tsx:47`, `(public)/agencies/page.tsx:42`, `(public)/properties/[slug]/page.tsx:115-126`
- Constat :
  - `/fr` n'émet aucun `og:*` ni `twitter:*` : l'accueil, une ville ou un quartier partagés sur WhatsApp n'ont ni image ni description.
  - Aucun `opengraph-image`.
  - Sur la fiche manquent `og:url`, `og:locale`, `og:site_name` et les dimensions, et l'image vient de la conversion `preview` en 800×600 (mesuré pour `/fr` ; `og:image` d'une fiche avec photo à vérifier).
- Piste : un `opengraph-image` 1200×630, un `openGraph` par défaut dans le layout public, et une image par ville ou par quartier.

### JSON-LD de la fiche : prix sur le mauvais type, contrat et période absents
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/jsonld-property.ts:81,97,102`
- Constat :
  - `priceSpecification` est posé sur `Apartment`, `House` ou `Place`, alors qu'il appartient à `Offer`.
  - `contract_type` et `rent_period` ne sont pas émis : un loyer ressemble à un prix de vente.
  - Pour un terrain, un bureau ou un parking, `floorSize`, `numberOfBedrooms` et `yearBuilt` sont hors domaine (mesuré, lu). La devise XOF, elle, est bien présente.
- Piste : `RealEstateListing.offers` → `Offer { price, priceCurrency, businessFunction }`, plus un `UnitPriceSpecification` `unitCode: MON` pour la location.

### Chaque fiche a trois URL au contenu principal identique
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/lib/alternates.ts:172`, `takussan-web/src/i18n/routing.ts:252`
- Constat :
  - `/fr`, `/en` et `/wo` sont indexables, chacune canonique à elle-même, alors que le titre et la description ne sont saisis qu'en français : l'API ne traduit pas le contenu.
  - Le sitemap triple le volume (lu ; effet sur l'index à vérifier).
- Piste : un ADR qui tranche entre fiches `en`/`wo` indexables, ou canonique vers `fr` et retrait du sitemap.

### Tout le site public est rendu de façon dynamique
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/app/layout.tsx:67`
- Constat : le layout racine lit `cookies()`, ce qui rend toute page publique dynamique, sans cache HTML. Chaque passage de robot refait le rendu complet (lu ; build courant à vérifier).
- Piste : sortir la session du rendu serveur de la coque publique, puis de l'ISR avec `revalidate` et des tags sur les fiches et les facettes.

### La bascule fera répondre 307 aux URL non préfixées déjà indexées
- Gravité : 🟠 risque ou dette
- Où : `takussan-web/src/proxy.ts:161`
- Constat : le 307 avec `Vary: Cookie, Accept-Language` est délibéré (ADR-0026). Mais la production sert aujourd'hui `/properties` sans préfixe : tout l'index actuel passera par une redirection temporaire, et Googlebot finira sur `/fr` (mesuré, lu).
- Piste : le décider dans le plan de bascule, par exemple une 308 pour les robots, ou accepter le délai explicitement.

### Petites améliorations
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
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Models/User.php:405`, `takussan-api/app/Http/Controllers/Api/Auth/AuthController.php:210-213`, `takussan-web/src/lib/reduire-photo.ts:10`, `takussan-api/app/Http/Resources/UserResource.php:37`
- Constat :
  - L'avatar vit sur le disque public et il est servi en original, pages publiques d'agent comprises.
  - Ni le serveur ni le front ne retirent les métadonnées sous 2560 px : un selfie, ou un appel direct à l'API, publie sa position GPS.
  - Les photos de bien ne fuient pas : l'original est privé, et les conversions GD ne recopient pas l'EXIF.
  - Établi comment : lu.
- Piste : servir une conversion carrée réencodée et garder l'original privé, ou retirer l'EXIF à l'upload.

### La règle `image` seule accepte le HEIC, que la chaîne ne sait pas traiter
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
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Requests/MediaUploadRequest.php:16`, `takussan-api/app/Http/Requests/GenericMediaUploadRequest.php:19`, `takussan-api/config/media-library.php:55`
- Constat : un fichier de 10 à 25 Mo passe la validation, puis Spatie lève `FileIsTooBig`. Aucun gestionnaire ne le traduit, et la réponse est un 500 (lu).
- Piste : aligner les deux plafonds, et traduire `FileCannotBeAdded` en 422.

### `POST /api/media/upload` : un point d'écriture mort et ouvert
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/routes/api/media.php:12`, `takussan-api/app/Http/Controllers/Api/MediaController.php:70-93`
- Constat :
  - Aucun appelant dans le front (grep).
  - Tout compte peut y déposer 30 fichiers par minute dans `User.photos` ou `User.documents`, et rien ne les lit ni ne les nettoie.
  - `HasMediaConversions` produit trois conversions pour chaque image de `User`, avatar compris, sans que rien ne les serve : des écritures R2 de classe A pour rien.
  - Établi comment : lu.
- Piste : retirer la route ; limiter les conversions aux collections affichées (`performOnCollections`).

### Réordonner les photos change leurs URL
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/PropertyMediaController.php:122`, `takussan-api/config/media-library.php:160`
- Constat : `update(['order_column'])` touche `updated_at`, or `version_urls` construit `?v=<updated_at>`. Chaque déplacement crée donc un défaut de cache, et de nouvelles transformations Cloudflare pour ce qui passe encore par elles (lu).
- Piste : mettre à jour `order_column` sans toucher aux horodatages, ou versionner sur un champ dédié.

### Petites améliorations
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
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Http/Controllers/Api/Auth/AuthController.php:33-46`, `takussan-api/app/Notifications/RegistrationConfirmationNotification.php`
- Constat :
  - `User::create` est appelé hors transaction, puis `Registered` déclenche une notification sans file.
  - Si le transport échoue, la réponse est un 500 alors que le compte existe déjà, et aucun jeton n'est rendu. Une nouvelle tentative bute sur « e-mail déjà pris ».
  - Même chose pour `ResetPasswordNotification` et `AccountDeletion*`.
  - Établi comment : lu.
- Piste : `ShouldQueue`, avec les codes à usage unique sur `notifications-urgent`.

### Un SMS qui échoue ne laisse ni trace ni alerte
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
- Gravité : 🟠 risque ou dette (intention à vérifier)
- Où : `takussan-api/app/Services/Notifications/Sms/IntegrationLocator.php:27-33`, `takussan-api/app/Notifications/Channels/SmsChannel.php:104`, `takussan-api/app/Providers/AppServiceProvider.php:284`
- Constat :
  - Avec un `agency_id`, seule l'intégration de l'agence est cherchée, sans repli sur la plateforme.
  - `agency_id` vaut l'agence pour un professionnel mono-agence et `null` pour un multi-agences. Les SMS du premier dépendent donc du fournisseur de son agence, alors qu'ADR-0032 met le coût à la charge de la plateforme.
  - `IntegrationLocator` est un singleton qui met en cache aussi les résultats nuls. Dans le worker (`--max-time=3600`), une intégration activée ou tournée met jusqu'à une heure à prendre effet.
  - Établi comment : lu.
- Piste : un repli sur la plateforme, et `scoped()` à la place de `singleton()`.

### Diffusion en double, avant le commit, avec le contenu écrit au journal
- Gravité : 🟠 risque ou dette (valeur de préproduction à vérifier)
- Où : `takussan-api/app/Services/Model/NotificationService.php:108-114`, `takussan-api/app/Events/NewNotification.php:13`, `takussan-api/app/Notifications/CodedNotification.php:85`, `.env.example:121`
- Constat :
  - `NewNotification` est `ShouldBroadcastNow` et part dans la transaction, avant le commit. `CodedNotification` y ajoute un canal `broadcast` sur le même canal privé.
  - Le front n'écoute rien : aucun `echo`, `pusher` ni `notification.new` (mesuré).
  - Avec `BROADCAST_CONNECTION=log`, titre et corps (noms, montants) sont écrits au niveau info.
  - Établi comment : lu, et mesuré pour le front.
- Piste : supprimer `NewNotification`, ou la passer en `ShouldDispatchAfterCommit` et la faire taire tant que D-65 est ouvert.

### Le résumé par e-mail est injoignable, et doublerait chaque e-mail le jour où il le deviendrait
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
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/config/queue.php:44,73`, `takussan-api/app/Notifications/CodedNotification.php:40`
- Constat :
  - `after_commit => false` partout.
  - La file `database` écrit le job dans la même transaction, qui les annule ensemble.
  - Un passage à Redis enverrait des notifications pour des transactions annulées.
  - Établi comment : lu.
- Piste : `ShouldQueueAfterCommit` sur `CodedNotification` et les autres notifications en file.

### Petites améliorations
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
- Gravité : 🔴 garde absente
- Où : `takussan-api/tests/Feature/Auth/AccountDeletionRequestTest.php:151-168`, `takussan-api/app/Services/Account/AccountDeletionService.php:326-375`
- Constat :
  - `test_blocked_when_user_has_pending_lease_payment_via_customer` ne crée aucun loyer impayé, seulement un bail actif. Son commentaire le dit : « The active lease alone is enough ».
  - Dans le clover de la CI du 2026-10-15, les trois autres obligations sont à 0 : loyers en attente (`:335-342`), factures dues (`:351-358`) et réservations ouvertes (`:368-375`).
  - Les supprimer laisserait un ancien locataire débiteur effacer son compte, sans un rouge.
  - Établi comment : mesuré sur le clover CI, et lu.
- Piste : un test par type d'obligation (bail résilié et échéance `Late`, facture due, réservation ouverte), plus le cas d'une restitution de caution en attente, qui ne doit pas bloquer (TCK-595 H-2).

### La signature Orange Money n'est jamais testée en refus
- Gravité : 🔴 garde absente
- Où : `takussan-api/app/Services/Payments/Drivers/OrangeMoneyDriver.php:130-133`, `takussan-api/tests/Feature/Api/PaymentDriverTest.php:131-150`
- Constat :
  - Le seul test envoie une signature valide. La ligne 133 compte comme couverte, mais aucun cas de signature fausse ou absente n'existe.
  - Si on retire `abort_code_unless`, le webhook OM accepte n'importe quel corps, et tout reste vert.
  - Wave a son test de refus (`PaymentWebhookTest.php:84`).
  - Établi comment : lu et grep.
- Piste : trois cas de bout en bout sur `/api/webhooks/payments/orange_money/{token}` (signature fausse, absente, secret d'une autre agence), en vérifiant que le paiement n'a pas bougé.

### L'horodatage de la signature Wave n'est jamais comparé à l'heure
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Services/Payments/Drivers/WaveDriver.php:146-151`
- Constat :
  - `t` entre dans le HMAC, mais rien ne le compare à `now()` : un webhook signé et capturé reste rejouable indéfiniment.
  - Le test de refus (`t=1,v1=deadbeef`) échoue sur le HMAC, et il resterait vert qu'il y ait une fenêtre de temps ou non.
  - Établi comment : lu. L'effet d'un `refund` ou d'un `failed` rejoué est à vérifier (angle 39).
- Piste : refuser un `t` hors d'une tolérance de 5 min ; tester une signature valide avec un `t` vieux d'une heure.

### Le cliquet de couverture laisse sept points de marge
- Gravité : 🟠 risque ou dette
- Où : `.github/workflows/api-ci.yml:464`
- Constat :
  - L'artefact `couverture-api-clover` du run 38662423267 (PR de cette branche, PCOV) donne 38 400 instructions couvertes sur 41 226, soit **93,15 %**.
  - Le seuil est à 86 % : environ 2 950 instructions peuvent perdre leur couverture sans rouge.
  - Établi comment : mesuré, sur une seule exécution de PR.
- Piste : selon CLAUDE.md, le seuil se resserre sur un chiffre de CI. Relever un second run sur `dev`, puis passer à 92 %.

### Le clover local est périmé et trompe qui le lit
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/storage/coverage/clover.xml`
- Constat :
  - Le fichier date du 2026-08-30.
  - 467 fichiers sur 1 403 dans `app/` en sont absents (33 %), dont `LeaseSignatureService`, `PayoutCalculator`, `WebhookJournal` et `PaymentSupervisionService`.
  - Il mesure aussi 9 fichiers qui n'existent plus.
  - Établi comment : mesuré.
- Piste : lire l'artefact de la CI (`gh run download -n couverture-api-clover`) ; supprimer ou dater le fichier local.

### La policy du registre RGPD n'est jamais exécutée
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Policies/PrivacyRequestPolicy.php:18,23,28,33`
- Constat :
  - Ses quatre lignes sont à 0 dans le clover CI, et la carte d'impact ne lui rattache aucun test.
  - Le 403 testé (`PrivacyRequestRegistryTest.php:145`) vient du middleware `super-admin`, avant que la policy soit consultée.
  - Un `return false` changé en `true` resterait vert.
  - Établi comment : mesuré.
- Piste : un test unitaire de la policy par méthode.

### Le code de signature de bail envoyé par e-mail n'est jamais rendu
- Gravité : 🟠 risque ou dette
- Où : `takussan-api/app/Notifications/LeaseSignatureCodeNotification.php:41-48`
- Constat : `toMail` est à 0 dans le clover CI, alors que le code OTP n'existe que là. Les tests figent la notification sans la rendre (mesuré).
- Piste : rendre le mail et asserter qu'il contient le code.

### Côté front, la plupart des server actions et des handlers BFF n'ont aucun test
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
