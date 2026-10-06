---
id: TCK-599
title: "Une alerte de recherche qu'on règle, qui liste les bons biens et marche sans compte ; des favoris qui ne servent plus un bien redevenu privé et préviennent quand il baisse ou disparaît"
status: todo
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-06
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#23-notifications
    - docs/features.md#24-recherche--filtres
  models:
    - docs/models-spec.md#23-savedsearch-
    - docs/models-spec.md#16-favorite-
    - docs/models-spec.md#54-whatsappcontact-
tags: [back, front, recherche, alertes, favoris, notifications, securite, i18n, adr-requise]
---

## Objectif utilisateur

- **Client** : je règle une alerte sur chacune de mes recherches sauvegardées, je reçois dans ma
  langue les biens qui correspondent vraiment (avec photo, prix, quartier et lien), et mes favoris
  me disent quand un bien baisse, est loué, vendu ou retiré — sans jamais me montrer un bien que
  son publieur a retiré du public.
- **Visiteur** : je demande « prévenez-moi des nouveaux biens » sans créer de compte, par e-mail ou
  WhatsApp, je confirme une fois, je me désinscris en un clic, et je peux rattacher l'alerte à un
  compte plus tard.

## Contexte

Analyse par acteur du 2026-10-06 (vague 73), points V13 (`01-visiteur.md`) et C6, C15, C16, C17,
C19 (`02-client.md`). Chaque constat ci-dessous a été **relu dans l'arbre `e3ab4a4e`** ; deux
défauts que les rapports n'avaient pas vus (§2.1, §2.2) ont été trouvés en le faisant, et ils
changent l'ordre du travail : activer des alertes avant de les corriger diffuserait des alertes
fausses.

### 1. Aucune recherche sauvegardée depuis la liste n'alerte (C6)

- Le seul bouton de sauvegarde envoie `notification_frequency: 'off'` en dur
  (`takussan-web/src/components/favorites/SaveSearchButton.tsx:135`). C'est voulu et documenté :
  TCK-552 a gardé le libellé « Sauvegarder la recherche » **parce que** rien n'est créé
  (`PropertiesDiscoveryPage.tsx:474-476`, `SearchEmpty.tsx:40-41`, TCK-552 § « Le libellé de
  sauvegarde ne ment pas aujourd'hui »).
- `/app/saved-searches` ne permet que relancer et supprimer (`SavedSearchesList.tsx:105-126`),
  alors que `PATCH /api/saved-searches/{id}` existe (`routes/api/saved-searches.php:10`).
- Le seul réglage de fréquence est la recherche « préférences » du profil
  (`components/profile/SearchPreferencesForm.tsx:32`).

### 2. Les alertes qui partent sont fausses (C19, et deux constats neufs)

1. **Le vocabulaire des critères n'est pas celui que lit le moteur de l'alerte.** Le front écrit
   `price_min`, `price_max`, `area_min`, `area_max`, `location`, `q`, `rent_period`, `bathrooms`,
   `featured`… (`filtersToCriteria`, `SaveSearchButton.tsx:53-63`, sur la table
   `takussan-web/src/types/search.ts:196-400`) ; le formulaire de préférences écrit `cities` (un
   tableau) et `price_max` (`SearchPreferencesForm.tsx:100-103`) ; le seeder écrit `price_max` et
   `neighborhoods` (`database/seeders/Crm/SavedSearchSeeder.php:36-39`). Or
   `SearchService::search()` lit `min_price`, `max_price`, `min_area`, `city`
   (`app/Services/Model/SearchService.php:47-62`) et ignore le reste **sans erreur**. Une alerte
   « Location · Dakar · ≤ 300 000 F » signale donc tous les biens à louer de Dakar, à tout prix.
   ADR-0023 (l.83-89) croit l'inverse — que les critères stockés sont en `min_price` — et
   `SavedSearchAlertsTest.php:42` éprouve `max_price`, un vocabulaire **qu'aucun écrivain réel ne
   produit**. Le vert de ce test ne dit rien des alertes réelles.
2. **L'interrupteur « Recherche sauvegardée » des préférences ne commande rien.**
   `SendSavedSearchAlerts` notifie en `NotificationType::System` (`SendSavedSearchAlerts.php:140`),
   que `NotificationService` traduit en `threshold_alert` (`NotificationService.php:31`) :
   l'e-mail de l'alerte obéit à « Alerte seuil KPI », et l'événement `saved_search_match`
   (`PreferenceResolver.php:64`, libellé `fr.json:7219`) n'est lu par aucun émetteur.
3. Le titre est un littéral français (l.141), le corps ne porte qu'un compte (l.142), `data` ne
   porte ni bien ni lien (l.143), l'e-mail est du texte brut (`NotificationService.php:92-96`).
4. Le compte annoncé est celui de la **page** (`$matches->count()`, l.142, sur un `paginate(20)`,
   `SearchService.php:122`) : « 20 biens » quand il y en a 60.
5. `instant` est traité comme `daily` (l.70-74, l.163-164) mais l'interface le propose
   (`SearchPreferencesForm.tsx:32`) et l'API l'accepte (`StoreSavedSearchRequest.php:54`).

### 3. Les alertes exigent un compte (V13)

Toutes les routes sont sous `auth:sanctum` (`routes/api/saved-searches.php:6`) ;
`SaveSearchButton.tsx:120-121` renvoie l'anonyme vers la connexion. Le job ne lit que des lignes à
`user_id` (`SendSavedSearchAlerts.php:97`), colonne NOT NULL
(`2026_04_17_160021_create_saved_searches_table.php:13`). `PhoneVerificationService` est lié à un
`User` (`app/Services/Auth/PhoneVerificationService.php:28-57`) : il ne sert pas un anonyme tel
quel. Le canal WhatsApp accepte un destinataire non-`User`, mais ne contrôle alors **ni le
consentement ni le débit** (`WhatsappChannel.php:80`, et relevé TCK-588).

### 4. Les favoris exposent un bien redevenu privé (C16) — défaut de confidentialité

- `FavoriteController::index` charge `property.address` **sans filtre de visibilité**
  (`FavoriteController.php:18-21`) ; la visibilité n'est contrôlée qu'à l'ajout (l.32-37).
- Un bien repassé privé, dépublié, refusé ou en attente reste servi via `PropertyResource` à qui
  l'avait en favori : prix, statut interne, photo, quartier et **coordonnées GPS exactes**
  (`PropertyResource.php:238-239`).
- `per_page` est passé tel quel à `paginate()` (l.21) ; `main_photo_url` appelle
  `getFirstMedia('photos')` (`PropertyResource.php:111`) sans `media` chargé : une requête par
  favori.
- Un bien supprimé (`SoftDeletes`, `Property.php:37`) rend `property: null`, que
  `FavoritesList.tsx:36-42` déréférence (`raw.location`) : la page entière tombe *(inféré à la
  lecture, non exécuté)*.

### 5. Les favoris ne disent rien (C15, C17)

- `FavoritesList.tsx:58` demande 24 favoris sans aucune pagination (l.96-108) : au-delà, les plus
  anciens sont inaccessibles. Aucun état « loué / vendu / retiré ». `notes` existe en base et dans
  l'API (`FavoriteResource.php:16`) mais aucune route ne le modifie et l'écran ne l'affiche pas.
- `PropertyObserver::updated` historise le prix (`PropertyObserver.php:38-47`) sans prévenir
  personne ; `FavoriteObserver` ne tient qu'un compteur (l.9-17). Un passage à loué/vendu n'est
  notifié à personne.

## Contrat de données

**Recherches sauvegardées (compte)** — `GET|POST|PATCH|DELETE /api/saved-searches` inchangés dans
leur forme ; `notification_frequency ∈ {off, daily, weekly}` (plus `instant`, cf. Delta §3).
`SavedSearchResource` ajoute `alert_channels: string[]` — les canaux **effectifs** de
`saved_search_match` pour cet utilisateur (`inapp` toujours ; `email`, `whatsapp` selon
`PreferenceResolver`), pour que l'interface dise par où l'alerte arrivera.

**Alertes sans compte** (routes publiques, sans jeton) :

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/api/public/search-alerts` | `criteria`, `name?`, `frequency` (`daily`/`weekly`), `channel` (`email`/`whatsapp`), `email` ou `phone`, `locale`, `consent: true` | **202, toujours la même** (aucune énumération) |
| POST | `/api/public/search-alerts/confirm` | `token` (lien e-mail) **ou** `phone` + `code` | 200 / 422 |
| POST | `/api/public/search-alerts/unsubscribe` | `token` | 200, idempotent |
| POST | `/api/saved-searches/claim` | — (authentifié) | 200, `{ claimed: n }` |

**Favoris** — `GET /api/favorites?page=&per_page=` (`per_page` 1-50) ; chaque élément porte
`availability ∈ {available, rented, sold, unavailable, removed}` ; `property` = la carte complète
**seulement** si `available`, sinon `{ id, slug, title }` (rien pour `removed`). Nouveau
`PATCH /api/favorites/{property}` `{ notes }` (≤ 500 caractères).

**Notifications** : `data` de l'alerte de recherche = `{ saved_search_id, total, property_ids[] }`,
`referenceable` = la `SavedSearch` ; alerte de favori = `{ property_ids[], kind }`. Les liens des
e-mails suivent ADR-0026 (segment de langue) et `config('app.frontend_url')`.

Modèles : `SavedSearch` (§23), `Favorite` (§16), `WhatsappContact` (§54) ; le modèle de l'abonné
sans compte est **à créer après l'ADR** (Delta §0).

## Direction UX / Artistique

- **L'honnêteté du libellé voulue par TCK-552 est préservée.** « Sauvegarder la recherche » reste
  le geste ; la création d'alerte est une case **décochée par défaut** dans la même boîte, et la
  confirmation dit exactement ce qui a été créé (« recherche sauvegardée » ou « recherche
  sauvegardée, alerte quotidienne par e-mail »). Aucun texte ne promet d'être prévenu quand
  l'alerte est coupée — y compris dans l'écran « aucun résultat ».
- Sur `/app/saved-searches`, chaque ligne montre l'état de son alerte et se règle en place
  (coupée / quotidienne / hebdomadaire), avec le canal effectif en clair.
- Pour le visiteur, le même point d'entrée propose « Me prévenir des nouveaux biens » : un seul
  champ de contact (e-mail **ou** numéro WhatsApp, le téléphone d'abord sur mobile), une case de
  consentement explicite, puis un écran qui dit où chercher la confirmation. Pages de confirmation
  et de désinscription sobres, dans la langue de l'URL, désinscription en **un** bouton.
- Favoris : pagination visible ; une carte d'un bien qui n'est plus disponible est clairement
  éteinte, nomme la raison (loué, vendu, plus disponible, retiré), propose « retirer » et « voir des
  biens similaires », et ne montre ni prix ni localisation. Note personnelle éditable en place.
- Mobile 360 px d'abord ; palette Lin et cartes de `docs/design-guidelines.md`.

## Contraintes strictes (métier)

1. **Aucune prose dans l'API** (règle de coexistence n°1) : titres, corps, e-mails, messages
   WhatsApp/SMS de ce ticket passent par `__('…', $params, $locale)` dans la locale du
   **destinataire** (`User::preferredLocale()`, ou `locale` de l'abonné). Clés en ajout seul,
   dans des blocs propres : `saved_search_alerts.*`, `favorite_alerts.*` (`lang/{fr,en,wo}.json`),
   et un bloc dédié côté `takussan-web/src/messages/*.json`.
2. **Une alerte ne rend que ce que la liste aurait rendu.** Même moteur, même vocabulaire que
   `/properties` (Delta §0-b) ; **jamais le repli élargi d'ADR-0024** (une alerte ne relâche pas un
   critère) ; uniquement des biens qui satisfont `Property::scopePublic` au moment de l'envoi.
   La borne de TCK-350 (argument de méthode, jamais une clé de `criteria`) est conservée.
3. **Un bien non public n'est jamais décrit à qui l'avait en favori** : ni prix, ni localisation,
   ni photo, ni statut interne (`pending_review`, `rejected`, `under_maintenance` → `unavailable`).
   « Public » se juge **en appelant `scopePublic`** (par `withExists`), jamais par une copie de ses
   conditions — TCK-600 y ajoute le filtre « agence active », qui doit s'appliquer ici sans retouche.
4. **Sans compte : rien ne part avant la double confirmation**, sauf l'unique message de
   confirmation. Jeton et code stockés **hachés**, à usage unique ; code à 6 chiffres, 10 min,
   5 essais ; au plus 2 messages de confirmation par contact et par 24 h ; au plus 5 alertes
   actives par contact ; limiteur `public-search-alert` par visiteur
   (`visitorRateLimitKey`, comme `public-contact-lead`). Réponse de création identique que le
   contact soit connu ou non. Une demande non confirmée est **purgée à 48 h** ; une désinscription
   supprime les recherches et efface le contact.
5. **Désinscription en un clic sans être déclenchable par un robot** : en-têtes
   `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058) sur l'e-mail ; le lien visible ouvre une
   page à un bouton. Un simple `GET` ne désinscrit pas (les scanneurs de liens le suivent).
6. **WhatsApp** : confirmation par gabarit de catégorie `authentication`, alertes par gabarit
   `utility` approuvé (spec §2.3, *jamais `marketing`*). Tant que le gabarit d'alerte n'est pas
   approuvé, l'option WhatsApp n'est **pas proposée** (drapeau de config lu par une route publique
   de capacités, pas un libellé du front). Pas de repli SMS pour une alerte de recherche (coût).
7. **Rattachement** : seul un utilisateur dont l'e-mail est **vérifié** et égal (repli
   `CaseInsensitive::sql/fold`, ADR-0025) ou dont le téléphone est **vérifié** et égal (E.164)
   rattache les alertes de ce contact. Jamais par simple déclaration.
8. **Préférences** : l'alerte de recherche obéit à `saved_search_match`, les alertes de favori à
   deux événements neufs `favorite_price_drop` et `favorite_unavailable` — couper l'un ne coupe
   rien d'autre, et couper `threshold_alert` ne coupe plus l'alerte de recherche.
9. **Montants** : les prix comparés sont des décimaux (`decimal(14,2)`, comme `properties.price`) ;
   aucune comparaison en flottant.

**Coordination avec la vague 73** (territoire 599 : `SavedSearch*`, `SendSavedSearchAlerts`,
`FavoriteController`, `FavoriteResource`, `PropertyObserver`, `SaveSearchButton`,
`SavedSearchesList`, `FavoritesList`, `lib/queries/favorites.ts`, alertes sans compte ; ce ticket
y ajoute `SearchPreferencesForm` et `SearchService::getMatchingProperties`, que personne d'autre
ne revendique) :

- **TCK-588** possède `NotificationService`, `PreferenceResolver`, les canaux et la cloche. Ce
  ticket **n'appelle plus** `NotificationService::notify` pour ses alertes : il émet des
  `Notification` Laravel dédiées (patron `ThresholdAlertTriggered`). Il **ajoute** deux entrées à
  `PreferenceResolver::EVENTS` (ajout voisin, aucune réécriture) et leurs libellés de préférence.
  Si 588 fait évoluer `WhatsappChannel` pour exiger un `User`, l'abonné sans compte doit rester
  servi : à arbitrer entre les deux tickets à la fusion du second.
- **TCK-589** introduit le code par téléphone et a mesuré que `PhoneVerificationService::sendSms()`
  n'est qu'un pilote `log-stub` (TCK-589 §1.1) : le code de confirmation d'une alerte part par le
  relais réel (`SmsRouterDriver`) ou par gabarit WhatsApp `authentication`, **jamais** par ce
  pilote. Si le service de code par numéro de 589 est fusionné avant, le réutiliser ; sinon le
  code vit, haché, sur la ligne de l'abonné. Aucun code fixe hors production (cf. 589 §1.3). 589
  peut appeler `POST /api/saved-searches/claim` après une vérification de téléphone.
- **TCK-598** possède les pages publiques (dont `PropertiesDiscoveryPage`) et la page « bien
  retiré » : la carte de favori éteinte y renvoie ; ce ticket ne touche que `SaveSearchButton` et
  crée ses deux pages de confirmation / désinscription.
- **TCK-600** modifie `Property::scopePublic` : cf. contrainte 3.
- **TCK-601** (données personnelles) : l'abonné sans compte est une donnée personnelle neuve ; la
  purge à 48 h et l'effacement à la désinscription sont posés ici, son registre relève de 601.
- Fichiers partagés en ajout voisin seulement : `routes/console.php` (planifications),
  `AppServiceProvider` (un limiteur), `lang/*.json`, `messages/*.json`.

## Delta à produire

### 0. Décisions avant le code

- [ ] **ADR à écrire et accepter avant le code** — « Alertes de recherche : un seul moteur, et des
      abonnés sans compte ». Il tranche deux questions :
  - **(a) Le modèle de l'abonné sans compte.** Option recommandée : table `alert_subscribers`
    (canal, e-mail ou téléphone E.164, locale, hachés du jeton / du code / du jeton de
    désinscription, `confirmed_at`, `unsubscribed_at`, preuve de consentement : date, source,
    version du texte) ; `saved_searches.user_id` devient nullable et gagne
    `alert_subscriber_id` nullable, avec une contrainte `CHECK` « exactement un des deux ». Un seul
    modèle de recherche, un seul job ; le contact personnel vit à un seul endroit. Alternative
    écartée à documenter : une table de recherches anonymes séparée (deux moteurs à tenir).
    L'abonné est un modèle `Notifiable` + `HasLocalePreference` (débit par `getKey()`), pas un
    `AnonymousNotifiable`.
  - **(b) Le moteur de l'alerte.** Option recommandée : `getMatchingProperties()` passe par
    `PropertySearchService` (le moteur de `/properties`, qui parle déjà le vocabulaire écrit),
    **sans repli**, borne `published_at` filtrée dans Meilisearch avec une marge pour le délai
    d'indexation ; cela **amende ADR-0023** (chemin 3), dont la prémisse est réfutée par §2.1.
    Alternative : traduire les clés vers `SearchService` et y ajouter les filtres manquants —
    deux moteurs qui peuvent rediverger, c'est la classe de défaut relevée.

### 1. Favoris : confidentialité et liste (C16, C15)

- [ ] Request : `App\Http\Requests\Api\IndexFavoriteRequest` (`page`, `per_page` 1-50, 422 au-delà).
- [ ] `FavoriteController::index` : `withExists(['property as property_is_public' => fn ($q) => $q->public()])`,
      relation `property` chargée `withTrashed` avec `address` et `media`, colonnes de carte
      limitées ; `availability` calculée sur ce drapeau et le statut.
- [ ] `FavoriteResource` : projection minimale pour tout bien non disponible (Contrat de données) ;
      jamais `PropertyResource` pour ce cas.
- [ ] Route + Request : `PATCH /api/favorites/{property}` → `UpdateFavoriteRequest` (`notes`
      nullable, string, max 500), propriétaire du favori seulement (404 sinon).
- [ ] Front : pagination, carte éteinte, note éditable, tolérance d'un favori `removed` ; requête
      de liste limitée aux champs de la carte.
- [ ] Tests : `tests/Feature/Api/FavoriteVisibilityTest.php`, `FavoriteTest` étendu (pagination,
      notes, nombre de requêtes constant).

### 2. Alertes de recherche : justes, localisées, réglables (C19, C6)

- [ ] Migration `normalize_saved_search_criteria_vocabulary` : `min_price→price_min`,
      `max_price→price_max`, `min_area→area_min`, `neighborhoods[0]→location` ; `down()` inverse.
- [ ] `SearchService::getMatchingProperties` selon l'ADR (b), lisant aussi `cities` (OU entre
      villes) ; `SavedSearchFactory`, `SavedSearchSeeder` et `SavedSearchAlertsTest` passent au
      vocabulaire réel.
- [ ] Notification : `App\Notifications\SavedSearchMatchesNotification` (`via` sur
      `saved_search_match` ; mail, `AppDatabaseChannel` pour un `User`, WhatsApp via
      `SupportsWhatsapp`) : jusqu'à 5 biens (photo, prix formaté, quartier, lien), le **total réel**,
      un lien « voir les N résultats » vers `/properties?…`, un lien de désinscription de **cette**
      recherche (URL signée qui passe sa fréquence à `off`).
- [ ] `SendSavedSearchAlerts` réécrit en entier pour l'émettre (comptes et abonnés confirmés) ;
      plus aucun littéral, plus de `NotificationType::System`.
- [ ] `SavedSearchResource` : `alert_channels`.
- [ ] Front : case « Créer aussi une alerte » (décochée) dans la boîte de sauvegarde ; réglage par
      ligne sur `/app/saved-searches`.
- [ ] Tests : `tests/Feature/Search/SavedSearchAlertsTest.php` (vocabulaire réel, total,
      préférence, locale), `tests/Feature/Api/SavedSearchTest.php` (`alert_channels`).

### 3. Retrait de `instant` (C19) — option recommandée

- [ ] Migration `retire_instant_saved_search_frequency` : `instant → daily` ; `down()` sans effet,
      commenté.
- [ ] `StoreSavedSearchRequest` / `UpdateSavedSearchRequest` : `in:off,daily,weekly`, **à
      l'identique** (TCK-330) ; front : schéma, type et `SearchPreferencesForm` sans `instant`.
- [ ] Docblock de `SendSavedSearchAlerts` : la limite devient une décision datée.

### 4. Alertes sans compte (V13)

- [ ] Migrations (selon l'ADR) : `create_alert_subscribers_table`,
      `add_alert_subscriber_id_to_saved_searches_table` (FK et `CHECK` nommés explicitement,
      < 63 car.).
- [ ] `App\Http\Controllers\Api\PublicSearchAlertController` (`store`, `confirm`, `unsubscribe`)
      dans `routes/api/saved-searches.php`, hors du groupe `auth:sanctum`, limiteur
      `public-search-alert` ; Requests `StorePublicSearchAlertRequest`,
      `ConfirmPublicSearchAlertRequest`, `UnsubscribePublicSearchAlertRequest`.
- [ ] Notification de confirmation (`SearchAlertConfirmationNotification` : lien ou code).
- [ ] `SavedSearchController::claim` + règle de la contrainte 7.
- [ ] Commande planifiée `search-alerts:purge-unconfirmed` (horaire).
- [ ] Front : saisie sans compte depuis le même point d'entrée ; pages de confirmation et de
      désinscription.
- [ ] Tests : `tests/Feature/Search/PublicSearchAlertTest.php`, `SearchAlertClaimTest.php`.

### 5. Favoris qui préviennent (C17)

- [ ] Migration `add_alert_baseline_to_favorites_table` : `alert_baseline_price decimal(14,2)`
      nullable (initialisée au prix à la mise en favori, et pour l'existant),
      `unavailable_notified_at` nullable.
- [ ] Job quotidien `App\Jobs\SendFavoriteChangeAlerts` : par utilisateur, **une** notification
      groupée (`FavoriteChangesNotification`) des baisses (prix courant < base, bien public) et des
      sorties du public (base non notifiée) ; met la base à jour ; une hausse déplace la base sans
      notifier ; un retour au public remet `unavailable_notified_at` à `null` sans notifier.
- [ ] Événements `favorite_price_drop`, `favorite_unavailable` (coordination 588).
- [ ] Tests : `tests/Feature/Favorites/FavoriteChangeAlertsTest.php`.

## Critères d'acceptation

- [ ] **AC1 (C16, sécurité)** — Un client met en favori un bien public ; le bien passe
      `visibility=private`. `GET /api/favorites` rend ce favori avec `availability=unavailable`, et
      **aucune** des clés `price`, `location`, `main_photo_url`, `status` sous `property`. Même
      résultat pour `status=pending_review` et `rejected`. Le test **rougit sur le code actuel** et
      redevient rouge si l'on retire le correctif (ablation consignée).
- [ ] **AC2** — Dans la même réponse, un favori d'un bien public garde sa carte complète (`price`
      et `location.city` présents) : masquer tout ne coche pas AC1.
- [ ] **AC3** — `rented` → `availability=rented`, `sold` → `sold` ; un bien supprimé (soft) →
      `removed`, réponse 200, les autres favoris rendus.
- [ ] **AC4** — `per_page=51` → 422 ; `per_page=50` → 200. Le nombre de requêtes SQL de
      `GET /api/favorites` est **identique** pour 2 et pour 20 favoris avec photo.
- [ ] **AC5 (vocabulaire)** — Une recherche créée par `POST /api/saved-searches` avec exactement
      `{ contract_type: "rent", city: "Dakar", price_max: 300000 }` (la forme de
      `filtersToCriteria`) et `daily` ; deux biens à louer publiés à Dakar à 250 000 et 900 000 F.
      L'alerte liste **le seul** bien à 250 000 F. Rouge sur le code actuel (les deux sont comptés).
- [ ] **AC6** — Une ligne au vocabulaire ancien (`max_price`) filtre encore après la migration.
- [ ] **AC7 (total)** — 25 biens correspondent : la notification annonce **25** et en liste 5.
- [ ] **AC8 (préférence)** — `saved_search_match`/`email` coupé → aucun e-mail d'alerte ;
      `threshold_alert`/`email` coupé et `saved_search_match` actif → l'e-mail part. Rouge sur le
      code actuel.
- [ ] **AC9 (locale)** — Pour un destinataire `wo`, titre et corps sont égaux à
      `__('saved_search_alerts.…', $p, 'wo')` et diffèrent de la version `fr` ; aucun littéral
      dans `SendSavedSearchAlerts` (la garde de 588, si fusionnée, le confirme).
- [ ] **AC10 (`instant`)** — `POST` et `PATCH` avec `instant` rendent 422 **tous les deux** ; une
      ligne `instant` existante vaut `daily` après migration ; l'interface ne le propose plus.
- [ ] **AC11 (C6, honnêteté)** — Case non cochée : charge utile `off` et confirmation sans
      promesse d'alerte ; case cochée : `daily` et confirmation qui le dit. Le réglage d'une ligne
      de `/app/saved-searches` envoie `PATCH { notification_frequency }`.
- [ ] **AC12 (V13, confirmation)** — Après `POST /api/public/search-alerts`, une exécution du job
      n'envoie **rien** à ce contact ; après confirmation, l'exécution suivante envoie. Code faux
      5 fois → refus même avec le bon code ; jeton réutilisé → 422.
- [ ] **AC13 (V13, abus)** — Réponse et code identiques pour un contact connu et inconnu ; un
      troisième message de confirmation au même contact dans les 24 h n'est pas envoyé ; le
      dépassement du limiteur rend 429 ; une demande non confirmée a disparu après 48 h.
- [ ] **AC14 (désinscription)** — `POST …/unsubscribe` avec le jeton → plus aucun envoi, contact
      effacé ; un `GET` du lien visible seul ne désinscrit pas ; l'e-mail porte
      `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- [ ] **AC15 (rattachement)** — Un utilisateur à e-mail vérifié `Awa@Exemple.sn` rattache les
      alertes de `awa@exemple.sn` ; e-mail non vérifié → `claimed: 0` ; un autre utilisateur n'en
      rattache aucune.
- [ ] **AC16 (C17)** — Favori à 500 000 F ; prix → 450 000 → le job du lendemain envoie **une**
      notification à ce client, la suivante n'envoie rien. 500 000 → 450 000 → 520 000 dans la
      journée → aucune notification. Passage à `rented` → une notification « loué », sans prix.
      `favorite_price_drop` coupé → rien pour la baisse, l'indisponibilité part encore.
- [ ] **AC17** — Un bien devenu privé le jour même d'une baisse ne produit que l'alerte
      d'indisponibilité, jamais son nouveau prix.

## Hors périmètre

- Un vrai mode `instant` (déclenché à la publication) — retiré ici, à rouvrir par ticket dédié.
- Les favoris **anonymes** (stockage local, `/public/properties/by-ids`) et la PWA (TCK-598).
- La page publique « bien retiré » (TCK-598) ; le temps réel de la cloche (dette C20).
- Le registre des demandes de droits et l'export des données de l'abonné (TCK-601).
- Une alerte « de nouveau disponible » sur un favori.

## Notes d'implémentation

_(à remplir par implementing-specs)_
