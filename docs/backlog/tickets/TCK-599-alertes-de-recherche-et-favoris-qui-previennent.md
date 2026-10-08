---
id: TCK-599
title: "Une alerte de recherche qu'on règle, qui liste les bons biens et marche sans compte ; des favoris qui ne servent plus un bien redevenu privé et préviennent quand il baisse ou disparaît"
status: done
phase: P1
family: full
estimate: XL
wave: 73
created: 2026-10-06
updated: 2026-10-08
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
fausses. La passe de correction du même jour en a ajouté deux autres, sur les favoris : l'ajout
par identifiant, plus large que la liste, et le favori d'un bien supprimé qu'on ne peut plus
retirer (§4).

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

   Mesure clé par clé : sur les **22** clés de rôle `filtre` que `filtersToCriteria` peut écrire,
   `SearchService::search()` en ignore **11** — `q`, `location` (le quartier), `price_min`,
   `price_max`, `area_min`, `area_max`, `rent_period`, `bathrooms`, `featured`, `floor_number`,
   `available_from` — quand `PropertySearchService` les lit **toutes**
   (`app/Services/Search/PropertySearchService.php:71`, `:372-456`). `cities` (le formulaire de
   préférences) n'est lu par **aucun** des deux moteurs. Et rien ne l'empêche :
   `criteria` est validé `['required', 'array']` sans schéma de clés
   (`StoreSavedSearchRequest.php:53`, `UpdateSavedSearchRequest.php:47`) — une clé inconnue est
   stockée, puis ignorée en silence. C'est la classe du défaut, pas seulement ses occurrences.
2. **L'interrupteur « Recherche sauvegardée » des préférences ne commande rien.**
   `SendSavedSearchAlerts` notifie en `NotificationType::System` (`SendSavedSearchAlerts.php:140`),
   que `NotificationService` traduit en `threshold_alert` (`NotificationService.php:31`) :
   l'e-mail de l'alerte obéit à « Alerte seuil KPI », et l'événement `saved_search_match`
   (`PreferenceResolver.php:64`, libellé `fr.json:7219`) n'est lu par aucun émetteur. *(Le même
   mappage gouverne les avis KYC — `KycWorkflowService.php:211,232` — mais ce défaut-là est hors
   du domaine de ce ticket : `NotificationService` et la disparition de `TYPE_TO_EVENT` sont à
   TCK-588 ; cf. Contraintes, coordination.)*
3. Le titre est un littéral français (l.141), le corps ne porte qu'un compte (l.142), `data` ne
   porte ni bien ni lien (l.143), l'e-mail est du texte brut (`NotificationService.php:92-96`).
4. Le compte annoncé est celui de la **page** (`$matches->count()`, l.142, sur un `paginate(20)`,
   `SearchService.php:122`) : « 20 biens » quand il y en a 60.
5. `instant` est traité comme `daily` (l.70-74, l.163-164) mais l'interface le propose
   (`SearchPreferencesForm.tsx:32,79`, type `lib/queries/saved-searches.ts:25`) et l'API l'accepte
   (`StoreSavedSearchRequest.php:54`, `UpdateSavedSearchRequest.php:48`). **Tranché par le porteur
   le 2026-10-06 : `instant` est retiré** (Delta §3).
6. **Un échec d'alerte écrit le contact du destinataire dans le journal.** Le `catch` de la boucle
   journalise `'message' => $e->getMessage()` (`SendSavedSearchAlerts.php:101-106`). Le message
   d'une `QueryException` recopie la requête **avec ses bindings** (`Str::replaceArray('?',
   $bindings, $sql)`, `Illuminate/Database/QueryException.php:86`) — critères, identifiants,
   e-mail ; celui d'un refus SMTP recopie la réponse du serveur
   (`symfony/mailer/Transport/Smtp/SmtpTransport.php:332-335`), qui cite d'ordinaire l'adresse
   refusée au `RCPT TO` (`:261`). L'e-mail part en synchrone (la notification n'est pas
   `ShouldQueue`, comme `ThresholdAlertTriggered.php:17`) : son échec tombe dans **ce** `catch`.
   Avec les abonnés sans compte (§3), la valeur fuitée est le seul identifiant de la personne.

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
  lecture, non exécuté)*. Et ce favori **ne peut plus être retiré** : `DELETE /api/favorites/{property}`
  lie le bien par la liaison implicite (`routes/api/properties.php:73`), qui exclut un bien
  supprimé (soft) → 404.
- **L'ajout est une seconde porte, plus large que la liste** (constat neuf de la passe de
  correction). `FavoriteController::store` juge la visibilité par une **copie partielle** de
  `scopePublic` : `visibility = public` et `published_at` non nul (`FavoriteController.php:32-33`),
  sans le statut ni `is_test` (`Property.php:458-473`). N'importe quel compte peut donc mettre en
  favori, **par identifiant**, un bien `pending_review`, `rejected`, `archived`,
  `under_maintenance` ou de test resté `public` avec `published_at`, et la réponse **201** sert
  déjà la carte complète (`FavoriteResource` → `PropertyResource`, l.45 et
  `FavoriteResource.php:17`). La règle `exists:properties,id` (`StoreFavoriteRequest`) rend 422
  pour un identifiant inexistant et le contrôleur 403 pour un bien privé : un **oracle
  d'existence** des identifiants. La branche « personnel » lit `$user->agency_id`, le pont de
  compatibilité (l.36).

### 5. Les favoris ne disent rien (C15, C17)

- `FavoritesList.tsx:58` demande 24 favoris sans aucune pagination (l.96-108) : au-delà, les plus
  anciens sont inaccessibles. Aucun état « loué / vendu / retiré ». `notes` existe en base et dans
  l'API (`FavoriteResource.php:16`) mais aucune route ne le modifie et l'écran ne l'affiche pas.
- `PropertyObserver::updated` historise le prix (`PropertyObserver.php:38-47`) sans prévenir
  personne ; `FavoriteObserver` ne tient qu'un compteur (l.9-17). Un passage à loué/vendu n'est
  notifié à personne.

## Contrat de données

**Recherches sauvegardées (compte)** — `GET|POST|PATCH|DELETE /api/saved-searches` inchangés dans
leur forme ; `notification_frequency ∈ {off, daily, weekly}` (`instant` retiré — tranché par le
porteur le 2026-10-06, Delta §3) ; `criteria` n'accepte que les clés de
`SavedSearchCriteria::KEYS` (422 sinon, contrainte 10).
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
`PATCH /api/favorites/{property}` `{ notes }` (≤ 500 caractères). `POST /api/favorites` rend 201
avec la **même** projection, ou **404** — identique pour un identifiant inexistant et un bien non
visible (plus de 422/403). `DELETE` et `PATCH` acceptent un bien supprimé.

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
   supprime les recherches et efface le contact. *Durées et plafonds (48 h, 5 alertes, 2
   confirmations / 24 h, 10 min, 5 essais) : option retenue par défaut, le porteur ne les a pas
   arbitrés.*
5. **Désinscription en un clic sans être déclenchable par un robot** : en-têtes
   `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058) sur l'e-mail ; le lien visible ouvre une
   page à un bouton. Un simple `GET` ne désinscrit pas (les scanneurs de liens le suivent).
6. **WhatsApp** : confirmation par gabarit de catégorie `authentication`, alertes par gabarit
   `utility` approuvé (spec §2.3, *jamais `marketing`*). Tant que le gabarit d'alerte n'est pas
   approuvé, l'option WhatsApp n'est **pas proposée** (drapeau de config lu par une route publique
   de capacités, pas un libellé du front). Pas de repli SMS pour une alerte de recherche (coût).
   *Option retenue par défaut (non arbitrée par le porteur).*
7. **Rattachement** : seul un utilisateur dont l'e-mail est **vérifié** et égal (repli
   `CaseInsensitive::sql/fold`, ADR-0025) ou dont le téléphone est **vérifié** et égal (E.164)
   rattache les alertes de ce contact. Jamais par simple déclaration.
8. **Préférences** : l'alerte de recherche obéit à `saved_search_match`, les alertes de favori à
   deux événements neufs `favorite_price_drop` et `favorite_unavailable` — couper l'un ne coupe
   rien d'autre, et couper `threshold_alert` ne coupe plus l'alerte de recherche.
9. **Montants** : les prix comparés sont des décimaux (`decimal(14,2)`, comme `properties.price`) ;
   aucune comparaison en flottant.
10. **Un critère accepté est un critère appliqué.** `criteria` n'accepte que les clés du
    vocabulaire que le moteur lit ; une clé inconnue est **refusée (422)**, jamais stockée pour
    être ignorée. La liste vit à un seul endroit côté API, et un test prouve que **chacune** filtre.
11. **Ajouter un favori ne révèle rien que la liste ne révélerait pas** : même juge de visibilité
    (`Property::public()` ou `can('view', $property)`), même projection, et la même réponse pour
    un identifiant inexistant et un bien non visible.

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
  - **Le défaut « `system` → `threshold_alert` » (§2.2) se corrige ici sans toucher
    `NotificationService.php`** : l'alerte quitte `notify()` et sa nouvelle classe porte son
    propre événement (`saved_search_match`) dans `via()`. Ce ticket ne modifie **ni**
    `TYPE_TO_EVENT` **ni** aucune ligne de `NotificationService.php` ; 588 remplace
    `TYPE_TO_EVENT` par `preferenceEvent()` et y traite les autres émetteurs `System` (KYC).
    Ordre de fusion indifférent : après 599, `SendSavedSearchAlerts` n'est plus un appelant de
    `notify()`, et l'exemption nommée de la garde de 588 expire d'elle-même.
  - Les classes de ce ticket déclarent `toAppNotification()` : `AppDatabaseChannel::TYPES`
    (fichier 588) n'est **pas** touché. `AppDatabaseChannel` refuse un notifiable non-`User`
    (`app_notifications.user_id` est une FK) : le `via()` d'un abonné sans compte ne contient
    jamais `database`.
  - La garde d'opt-in WhatsApp que 588 pose pour un destinataire sans compte (588 Delta B,
    AC3) doit laisser passer un abonné confirmé : la confirmation WhatsApp écrit donc la ligne
    `whatsapp_contacts` en `opted_in` (source `search_alert`), et ce ticket n'ajoute **jamais**
    `sms` au `via()` d'une alerte, même quand 588 bascule un contact non inscrit vers le SMS.
- **TCK-587** possède `PropertyPolicy` : `FavoriteController::store` **appelle**
  `can('view', $property)` pour la branche « personnel » au lieu de lire `$user->agency_id` ; il
  hérite sans retouche du resserrement que 587 y apporte. Ce ticket ne modifie pas la policy.
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
  - **`App\Support\Logging\SafeExceptionContext` est créé par 601 (son Delta B) ; ce ticket
    l'appelle, ne le crée ni ne le modifie.** 601 désigne lui-même ce `catch` comme territoire de
    599 (« `SendSavedSearchAlerts.php:101-106` → TCK-599 », Hors périmètre de 601). Seul le bloc
    `catch` de `SendSavedSearchAlerts::handle` est concerné ; ordre de fusion **601 d'abord de
    préférence**. Si 599 fusionne avant 601, le `catch` journalise `saved_search_id` /
    `alert_subscriber_id`, `exception` (classe) et `code` seulement — aucun message — et c'est **le second
    des deux à fusionner** qui y substitue l'appel à `SafeExceptionContext::of($e)`. AC13b est le
    même dans les deux ordres.
  - Le rapporteur global de 601 (`QueryException` → `query_exception`) ne couvre **pas** ce `catch` :
    l'exception y est avalée et journalisée à la main, jamais passée à `report()`.
- Fichiers partagés en ajout voisin seulement : `routes/console.php` (planifications),
  `AppServiceProvider` (un limiteur), `lang/*.json`, `messages/*.json`.

## Delta à produire

### 0. Décisions avant le code

- [x] **ADR à écrire et accepter avant le code** — « Alertes de recherche : un seul moteur, et des
      abonnés sans compte ». Il tranche deux questions :
  - **(a) Le modèle de l'abonné sans compte.** Option retenue par défaut : table `alert_subscribers`
    (canal, e-mail ou téléphone E.164, locale, hachés du jeton / du code / du jeton de
    désinscription, `confirmed_at`, `unsubscribed_at`, preuve de consentement : date, source,
    version du texte) ; `saved_searches.user_id` devient nullable et gagne
    `alert_subscriber_id` nullable, avec une contrainte `CHECK` « exactement un des deux ». Un seul
    modèle de recherche, un seul job ; le contact personnel vit à un seul endroit. Alternative
    écartée à documenter : une table de recherches anonymes séparée (deux moteurs à tenir).
    L'abonné est un modèle `Notifiable` + `HasLocalePreference` (débit par `getKey()`), pas un
    `AnonymousNotifiable`.
  - **(b) Le moteur de l'alerte.** Option retenue par défaut : `getMatchingProperties()` passe par
    `PropertySearchService` (le moteur de `/properties`, qui parle déjà le vocabulaire écrit),
    **sans repli**, borne `published_at` filtrée dans Meilisearch avec une marge pour le délai
    d'indexation ; cela **amende ADR-0023** (chemin 3), dont la prémisse est réfutée par §2.1.
    Alternative : traduire les clés vers `SearchService` et y ajouter les filtres manquants —
    deux moteurs qui peuvent rediverger, c'est la classe de défaut relevée.
  - Le retrait de `instant` n'est plus une question : **tranché par le porteur le 2026-10-06**
    (§3).
- [ ] **Découpage — option retenue par défaut** : trois PR dans cet ordre, chacune verte seule.
      **(A)** §1 (favoris, porte le défaut de sécurité, sans dépendance — à livrer d'abord) ;
      **(B)** l'ADR + §2 + §3 ; **(C)** §4 (après B) ; §5 peut suivre A ou B.
      *Non fait tel quel : la vague 73 livre ce ticket sur UNE branche (`feat/tck-599-alertes-et-favoris`).
      Les commits restent séparables — A seul en `769e888f` (+ `a327a4b1`), le back B+C+§5 en
      `4af165dd`, le front en `cd6c9d57` — si la session veut livrer A d'abord.*

### 1. Favoris : confidentialité et liste (C16, C15)

- [x] Request : `App\Http\Requests\Api\IndexFavoriteRequest` (`page`, `per_page` 1-50, 422 au-delà).
- [x] `FavoriteController::index` : `withExists(['property as property_is_public' => fn ($q) => $q->public()])`,
      relation `property` chargée `withTrashed` avec `address` et `media`, colonnes de carte
      limitées ; `availability` calculée sur ce drapeau et le statut.
- [x] `FavoriteResource` : projection minimale pour tout bien non disponible (Contrat de données) ;
      jamais `PropertyResource` pour ce cas.
- [x] Route + Request : `PATCH /api/favorites/{property}` → `UpdateFavoriteRequest` (`notes`
      nullable, string, max 500), propriétaire du favori seulement (404 sinon).
- [x] `FavoriteController::store` : la copie partielle de `scopePublic` (l.32-33) et la lecture de
      `$user->agency_id` (l.36) sont **supprimées** ; le bien est accepté si
      `Property::public()->whereKey($id)->exists()` **ou** `$user->can('view', $property)` (587).
      Sinon **404**, le même que pour un identifiant inexistant : `StoreFavoriteRequest` passe
      `property_id` de `exists:properties,id` à `['required', 'integer']`, et l'inexistence se
      juge dans le contrôleur. La réponse 201 passe par la **même** `FavoriteResource` que la liste
      (projection minimale si le bien n'est pas `available`).
- [x] Routes `DELETE` et `PATCH /api/favorites/{property}` : liaison `->withTrashed()`, pour qu'un
      favori `removed` se retire et s'annote.
- [x] Front : pagination, carte éteinte, note éditable, tolérance d'un favori `removed` ; requête
      de liste limitée aux champs de la carte (côté API : `FavoriteController::CARD_COLUMNS`).
- [x] Tests : `tests/Feature/Api/FavoriteVisibilityTest.php` (liste **et** ajout),
      `FavoriteTest` étendu (pagination, notes, retrait d'un bien supprimé, nombre de requêtes
      constant) ; test de composant de la liste des favoris (`removed`, pagination).

### 2. Alertes de recherche : justes, localisées, réglables (C19, C6)

- [x] Migration `normalize_saved_search_criteria_vocabulary` : `min_price→price_min`,
      `max_price→price_max`, `min_area→area_min`, `neighborhoods[0]→location` ; `down()` inverse.
- [x] `SearchService::getMatchingProperties` selon l'ADR (b), lisant aussi `cities` (OU entre
      villes) ; `SavedSearchFactory`, `SavedSearchSeeder` (`neighborhoods` → `location`) et
      `SavedSearchAlertsTest` passent au vocabulaire réel.
- [x] Vocabulaire fermé (contrainte 10) : constante `App\Support\SavedSearchCriteria::KEYS` = les
      22 clés de rôle `filtre` de `takussan-web/src/types/search.ts` + `cities`. Règle
      `criteria` de `StoreSavedSearchRequest` **et** `UpdateSavedSearchRequest`, écrite à
      l'identique : `['required'|'sometimes', 'array:'.implode(',', KEYS)]` → 422 sur toute autre
      clé. La migration de vocabulaire ci-dessus **journalise** (nombre et clés) les lignes qui
      gardent une clé hors liste, sans les modifier.
- [x] Notification : `App\Notifications\SavedSearchMatchesNotification` (`via` sur
      `saved_search_match` ; mail, `AppDatabaseChannel` pour un `User`, WhatsApp via
      `SupportsWhatsapp`) : jusqu'à 5 biens (photo, prix formaté, quartier, lien), le **total réel**,
      un lien « voir les N résultats » vers `/properties?…`, un lien de désinscription de **cette**
      recherche (URL signée qui passe sa fréquence à `off`).
- [x] `SendSavedSearchAlerts` réécrit en entier pour l'émettre (comptes et abonnés confirmés) ;
      plus aucun littéral, plus de `NotificationType::System`.
- [x] Le `catch` de la boucle (Contexte §2.6) :
      `Log::error('saved_search_alert.failed', ['saved_search_id' => $search->id, 'alert_subscriber_id' => $search->alert_subscriber_id] + Arr::except(SafeExceptionContext::of($e), ['message']))`.
      **Jamais** `getMessage()`, ni le contact, ni `criteria`, ni l'objet exception. `message` est
      retiré **ici** même pour une exception non SQL, parce que toute exception de cette boucle
      peut citer le destinataire (réponse SMTP, numéro WhatsApp). La boucle continue sur la
      recherche suivante, comme aujourd'hui (coordination 601 : Contraintes).
- [x] `SavedSearchResource` : `alert_channels`.
- [x] Front : case « Créer aussi une alerte » (décochée) dans la boîte de sauvegarde ; réglage par
      ligne sur `/app/saved-searches`.
- [x] Tests : `tests/Feature/Search/SavedSearchAlertsTest.php` (vocabulaire réel clé par clé,
      total, préférence, locale), `tests/Feature/Search/SavedSearchCriteriaVocabularyTest.php`
      (chaque clé de `KEYS` filtre ; clé inconnue → 422), `tests/Feature/Api/SavedSearchTest.php`
      (`alert_channels`), `tests/Feature/Search/SavedSearchAlertFailureLogTest.php` (AC13b).

### 3. Retrait de `instant` (C19) — tranché par le porteur le 2026-10-06

- [x] Migration `retire_instant_saved_search_frequency` : `instant → daily` ; `down()` sans effet,
      commenté.
- [x] `StoreSavedSearchRequest` / `UpdateSavedSearchRequest` : `in:off,daily,weekly`, **à
      l'identique** (TCK-330) ; front : type (`lib/queries/saved-searches.ts:25`), schéma et
      `SearchPreferencesForm` (l.32 et l.79) sans `instant` ; les libellés
      `…frequency.instant` des trois `messages/*.json` sont retirés. ⚠ Ne pas toucher
      `EmailFrequency::Instant` (`app/Models/Enums/EmailFrequency.php:7`) : c'est la fréquence
      du **digest** d'e-mails, un autre réglage.
- [x] `SendSavedSearchAlerts::doitEnvoyer` : la branche `default` ne couvre plus que `daily` ;
      le docblock (l.70-74) dit « retiré le 2026-10-06 par décision du porteur », plus
      « une limite ».

### 4. Alertes sans compte (V13)

- [x] Migrations (selon l'ADR) : `create_alert_subscribers_table`,
      `add_alert_subscriber_id_to_saved_searches_table` (FK et `CHECK` nommés explicitement,
      < 63 car.).
- [x] `App\Http\Controllers\Api\PublicSearchAlertController` (`store`, `confirm`, `unsubscribe`)
      dans `routes/api/saved-searches.php`, hors du groupe `auth:sanctum`, limiteur
      `public-search-alert` ; Requests `StorePublicSearchAlertRequest`,
      `ConfirmPublicSearchAlertRequest`, `UnsubscribePublicSearchAlertRequest`.
- [x] Notification de confirmation (`SearchAlertConfirmationNotification` : lien ou code).
- [x] `SavedSearchController::claim` + règle de la contrainte 7.
- [x] Commande planifiée `search-alerts:purge-unconfirmed` (horaire).
- [x] Front : saisie sans compte depuis le même point d'entrée ; pages de confirmation et de
      désinscription.
- [x] Tests : `tests/Feature/Search/PublicSearchAlertTest.php`, `SearchAlertClaimTest.php`.

### 5. Favoris qui préviennent (C17)

- [x] Migration `add_alert_baseline_to_favorites_table` : `alert_baseline_price decimal(14,2)`
      nullable (initialisée au prix à la mise en favori, et pour l'existant),
      `unavailable_notified_at` nullable.
- [x] Job quotidien `App\Jobs\SendFavoriteChangeAlerts` : par utilisateur, **une** notification
      groupée (`FavoriteChangesNotification`) des baisses (prix courant < base, bien public) et des
      sorties du public (base non notifiée) ; met la base à jour ; une hausse déplace la base sans
      notifier ; un retour au public remet `unavailable_notified_at` à `null` sans notifier.
- [x] Événements `favorite_price_drop`, `favorite_unavailable` (coordination 588).
- [x] Tests : `tests/Feature/Favorites/FavoriteChangeAlertsTest.php`.

## Critères d'acceptation

Chaque AC marqué **Rouge aujourd'hui** est écrit avant le correctif, rougit sur `e3ab4a4e`, puis
**redevient rouge quand on retire le correctif** (ablation consignée dans les Notes
d'implémentation).

**Favoris (§1)**

- [x] **AC1 (C16, sécurité — liste)** — Un client met en favori un bien public ; le bien passe
      `visibility=private`. `GET /api/favorites` rend ce favori avec `availability=unavailable`, et
      **aucune** des clés `price`, `location`, `main_photo_url`, `status` sous `property`. Même
      résultat pour `status=pending_review` et `rejected`. **Rouge aujourd'hui** (la carte complète
      est servie).
      ✓ `FavoriteVisibilityTest::test_un_bien_sorti_du_public_n_est_plus_decrit_par_la_liste` (7 sorties : privé, `pending_review`, `rejected`, maintenance, dépublié, loué, vendu) — run du 2026-10-08, ablations Delta A.
- [x] **AC2** — Dans la même réponse, un favori d'un bien public garde sa carte complète (`price`
      et `location.city` présents) : masquer tout ne coche pas AC1.
      ✓ `FavoriteVisibilityTest::test_la_meme_reponse_garde_la_carte_complete_d_un_bien_public` — run du 2026-10-08.
- [x] **AC3 (sécurité — ajout)** — Bien `visibility=public`, `published_at` non nul,
      `status=pending_review` (puis `rejected`, puis `is_test=true`) : un client sans lien avec
      l'agence fait `POST /api/favorites { property_id }` → **404**, aucune ligne `favorites`
      créée, aucune clé `price` dans la réponse. Un identifiant inexistant rend **le même** statut
      et **le même** corps. Le personnel de l'agence du bien (`can('view')`) obtient 201 ; un bien
      public obtient 201 avec la carte complète. **Rouge aujourd'hui** (201 + carte complète ;
      422 contre 403).
      ✓ `FavoriteVisibilityTest::test_l_ajout_d_un_bien_non_public_rend_404_comme_un_identifiant_inexistant` (`pending_review`, `rejected`, `archived`, `is_test`), `…_le_personnel_de_l_agence_et_un_bien_public_obtiennent_201`, `…_le_personnel_d_une_autre_agence_recoit_404` — run du 2026-10-08.
- [x] **AC4** — `rented` → `availability=rented`, `sold` → `sold` ; un bien supprimé (soft) →
      `removed`, réponse 200, les autres favoris rendus. `DELETE /api/favorites/{id}` sur ce bien
      supprimé → 204 et la ligne disparaît. **Rouge aujourd'hui** (pas d'`availability` ; le
      `DELETE` rend 404).
      ✓ `FavoriteVisibilityTest::test_un_bien_supprime_rend_removed_et_son_favori_se_retire` + lignes `loué` / `vendu` du fournisseur d'AC1 — run du 2026-10-08.
- [x] **AC5** — `per_page=51` → 422 ; `per_page=50` → 200. Le nombre de requêtes SQL de
      `GET /api/favorites` est **identique** pour 2 et pour 20 favoris avec photo. **Rouge
      aujourd'hui** (51 → 200 ; une requête `media` par favori).
      ✓ `FavoriteTest::test_per_page_est_borne_a_50` et le test du nombre de requêtes (2 = 20, photos à filigrane lu) — run du 2026-10-08.
- [x] **AC6 (notes)** — `PATCH /api/favorites/{id} { notes: "Appeler lundi" }` → 200 et `notes`
      relu à l'identique ; 501 caractères → 422 ; le favori d'un autre utilisateur → 404.
      **Rouge aujourd'hui** (route absente, 405).
      ✓ `FavoriteTest::test_la_note_d_un_favori_se_modifie` + second chemin (favori d'un autre → 404) — run du 2026-10-08.
- [x] **AC7 (front)** — Test de composant de la liste des favoris : une réponse qui contient un
      favori `removed` (`property` minimal ou nul) et un favori `available` rend les deux cartes,
      sans exception ; avec `meta.last_page = 2`, la page 2 est atteignable et demandée avec
      `page=2`. **Rouge aujourd'hui** (`raw.location` sur `null` ; aucune pagination).
      ✓ `takussan-web/src/components/favorites/__tests__/FavoritesList.test.tsx` (4 tests : retiré + loué + disponible, `page=2` lu sur l'URL émise, DELETE sur l'id du bien, PATCH de la note) — vitest du 2026-10-08.

**Alertes de recherche (§2, §3)**

- [x] **AC8 (vocabulaire, clé par clé)** — Recherches créées par `POST /api/saved-searches`, en
      `daily`, dans la forme exacte qu'écrit le front ; deux biens publics publiés après la
      dernière alerte, `A` qui correspond et `B` qui ne correspond **que** par le critère testé.
      L'alerte liste `A` et **jamais** `B` :
      ✓ `SavedSearchAlertsTest::test_l_alerte_applique_le_vocabulaire_ecrit_par_le_front` (les 6 lignes, créées par `POST /api/saved-searches`) — run du 2026-10-08.

      | Critère | `A` | `B` |
      |---|---|---|
      | `{ contract_type: "rent", city: "Dakar", price_max: 300000 }` | 250 000 F | 900 000 F |
      | `{ city: "Dakar", area_min: 100 }` | 120 m² | 60 m² |
      | `{ city: "Dakar", location: "Almadies" }` | Almadies | Médina |
      | `{ cities: ["Dakar", "Thiès"] }` (formulaire de préférences) | Thiès | Saint-Louis |
      | `{ city: "Dakar", q: "piscine" }` | « piscine » dans le titre | sans |
      | `{ contract_type: "rent", rent_period: "monthly" }` | `monthly` | `daily` |

      **Rouge aujourd'hui sur chaque ligne** (`B` est listé).
- [x] **AC9 (vocabulaire fermé)** — `POST` puis `PATCH /api/saved-searches` avec
      `criteria: { max_price: 1 }` → **422 tous les deux** ; un test paramétré sur
      `SavedSearchCriteria::KEYS` prouve, pour **chacune** des 23 clés, qu'une valeur choisie
      écarte un bien qu'elle doit écarter ; `SavedSearchFactory` et `SavedSearchSeeder` ne
      produisent que des clés de `KEYS`. **Rouge aujourd'hui** (201 ; 11 clés sans effet ;
      `neighborhoods`).
      ✓ `SavedSearchCriteriaVocabularyTest` : `test_une_cle_inconnue_rend_422_a_la_creation_comme_a_la_modification`, `test_chaque_cle_filtre_l_alerte` (23 lignes, avec témoin sans la clé), `test_la_fabrique_et_le_seeder_n_ecrivent_que_le_vocabulaire`, `test_une_cle_hors_vocabulaire_n_atteint_pas_le_moteur` — run du 2026-10-08.
- [x] **AC10** — Une ligne au vocabulaire ancien (`max_price`, `min_area`) filtre encore après la
      migration ; une ligne à clé inconnue est comptée dans le journal de la migration.
      ✓ `SavedSearchCriteriaVocabularyTest::test_la_migration_de_vocabulaire_reecrit_l_ancien_et_journalise_l_inconnu` — run du 2026-10-08.
- [x] **AC11 (total et contenu)** — 25 biens correspondent : la notification porte
      `data.total = 25`, `count(data.property_ids) = 5`, et son e-mail contient le prix formaté et
      le quartier de ces 5 biens et un lien `…/{locale}/properties?…` vers les 25. **Rouge
      aujourd'hui** (« 20 », aucun bien, aucun lien).
      ✓ `SavedSearchAlertsTest::test_l_alerte_annonce_le_total_reel_et_decrit_cinq_biens` (25 → `total` 25, 5 ids, prix formaté, quartier, lien `/fr/properties?city=Dakar&price_max=200000`) — run du 2026-10-08.
- [x] **AC12 (préférence)** — `saved_search_match`/`email` coupé → aucun e-mail d'alerte ;
      `threshold_alert`/`email` coupé et `saved_search_match` actif → l'e-mail part. **Rouge
      aujourd'hui** (c'est `threshold_alert` qui gouverne). `NotificationService.php` n'a pas
      changé dans le diff de ce ticket.
      ✓ `SavedSearchAlertsTest::test_l_e_mail_obeit_a_saved_search_match_et_plus_a_threshold_alert` ; `NotificationService.php` absent du diff (`git diff 33932c60 -- takussan-api/app/Services/NotificationService.php` vide) — run du 2026-10-08.
- [x] **AC13 (locale)** — Pour un destinataire `wo`, titre et corps sont égaux à
      `__('saved_search_alerts.…', $p, 'wo')` et diffèrent de la version `fr` ; aucun littéral
      dans `SendSavedSearchAlerts` (la garde de 588, si fusionnée, le confirme). **Rouge
      aujourd'hui** (titre français en dur).
      ✓ `SavedSearchAlertsTest::test_le_titre_et_le_corps_sont_dans_la_langue_du_destinataire` ; `ProseLitteraleInterditeTest` sans exemption (`EXEMPTIONS = []`) — run du 2026-10-08.
- [x] **AC13b (journal sans contact)** — `SavedSearchAlertFailureLogTest`, un abonné confirmé
      d'e-mail témoin `temoin-599@exemple.sn` et une seconde recherche saine, écouteur
      `MessageLogged` (message + contexte encodés en JSON, chaque `Throwable` rendu par
      `(string) $e`) :
      (a) `SearchService` lié dans le conteneur à un double dont `getMatchingProperties` lève
      `new QueryException('pgsql', 'select * from saved_searches where email = ?', ['temoin-599@exemple.sn'], new PDOException('SQLSTATE[23505]'))` ;
      (b) un mailer dont le transport lève
      `new UnexpectedResponseException('Expected response code "250" but got code "550", with message "550 5.1.1 <temoin-599@exemple.sn>: Recipient address rejected".')`.
      Dans les deux cas : **aucune** entrée de log ne contient `temoin-599` ; une entrée
      `saved_search_alert.failed` porte `saved_search_id` et la classe de l'exception ; la seconde
      recherche est notifiée. **Rouge aujourd'hui** (a et b : `message` porte le témoin). Rouge à
      nouveau si l'on remet `getMessage()` dans le `catch`, **et** (b seul) si l'on garde le
      `message` de `SafeExceptionContext::of($e)`.
      ✓ `SavedSearchAlertFailureLogTest` (a) et (b) — run du 2026-10-08 ; ablation `getMessage()` remis au journal → 2 échecs.
- [x] **AC14 (`instant`, tranché le 2026-10-06)** — `POST` et `PATCH` avec `instant` rendent 422
      **tous les deux** ; une ligne `instant` existante vaut `daily` après migration ; le formulaire
      de préférences ne le propose plus. **Rouge aujourd'hui** (201/200).
      ✓ `SavedSearchTest::test_instant_est_refuse_a_la_creation_comme_a_la_modification`, `SavedSearchCriteriaVocabularyTest::test_la_migration_ramene_instant_a_daily` ; `SearchPreferencesForm` sans `instant` (`SearchPreferencesForm.test.tsx` vert) — run du 2026-10-08.
- [x] **AC15 (C6, honnêteté)** — Case non cochée : charge utile `off` et confirmation sans
      promesse d'alerte ; case cochée : `daily` et confirmation qui le dit. Le réglage d'une ligne
      de `/app/saved-searches` envoie `PATCH { notification_frequency }`.
      ✓ `SaveSearchButton.alerte.test.tsx` (case décochée → `off` sans promesse ; cochée → `daily` et canaux rendus par l'API) et `SavedSearchesList.alerte.test.tsx` (PATCH `{ notification_frequency }` sur la bonne ligne, canaux effectifs) — vitest du 2026-10-08.

**Alertes sans compte (§4)**

- [x] **AC16 (V13, confirmation)** — Après `POST /api/public/search-alerts`, une exécution du job
      n'envoie **rien** à ce contact ; après confirmation, l'exécution suivante envoie. Code faux
      5 fois → refus même avec le bon code ; jeton réutilisé → 422. Une confirmation WhatsApp
      laisse `whatsapp_contacts` en `opted_in`.
      ✓ `PublicSearchAlertTest` : `test_rien_ne_part_avant_la_confirmation_et_le_jeton_ne_sert_qu_une_fois`, `test_un_jeton_de_plus_de_48_h_ne_confirme_rien`, `test_la_confirmation_whatsapp_par_code` (5 codes faux, `opted_in`) — run du 2026-10-08.
- [x] **AC17 (V13, abus)** — Réponse et code identiques pour un contact connu et inconnu ; un
      troisième message de confirmation au même contact dans les 24 h n'est pas envoyé ; le
      dépassement du limiteur rend 429 ; une demande non confirmée a disparu après 48 h.
      ✓ `PublicSearchAlertTest` : `test_aucune_enumeration_et_deux_confirmations_par_jour`, `test_cinq_alertes_au_plus_par_contact`, `test_le_limiteur_rend_429`, `test_le_limiteur_compte_par_contact_quelle_que_soit_l_adresse_ip`, `test_une_demande_non_confirmee_est_purgee_a_48_h` — run du 2026-10-08.
      ✓ Le temps de réponse, demandé par la session : la requête ne fait que pousser `RecordPublicSearchAlert`, un job chiffré (ADR-0050, décision 13). Preuve : `test_la_requete_ne_fait_que_pousser_un_job_chiffre`, avec `Queue::fake` et `Notification::fake`. Cinq cas sont envoyés : contact neuf, connu, à sa borne, déjà confirmé, et un WhatsApp. Chacun rend le même 202 et pousse son job, aucun sur `sync`. La requête n'écrit rien et n'envoie ni mail ni SMS. `test_l_echec_du_job_ne_journalise_pas_le_contact`. Run du 2026-10-08.
- [x] **AC18 (désinscription)** — `POST …/unsubscribe` avec le jeton → plus aucun envoi, contact
      effacé ; un `GET` du lien visible seul ne désinscrit pas ; l'e-mail porte
      `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
      ✓ `PublicSearchAlertTest::test_la_desinscription_efface_le_contact_et_ne_cede_qu_a_un_post`, `SavedSearchAlertsTest::test_l_e_mail_porte_la_desinscription_en_un_clic_qui_ne_cede_qu_a_un_post` (en-têtes RFC 8058, GET → 405) ; pages : `SearchAlertLinkAction.test.tsx` (aucune requête au rendu) — run du 2026-10-08.
- [x] **AC19 (rattachement)** — Un utilisateur à e-mail vérifié `Awa@Exemple.sn` rattache les
      alertes de `awa@exemple.sn` ; e-mail non vérifié → `claimed: 0` ; un autre utilisateur n'en
      rattache aucune.
      ✓ `SearchAlertClaimTest` (4 tests : casse, non vérifié, autre utilisateur, téléphone vérifié) — run du 2026-10-08.

**Favoris qui préviennent (§5)**

- [x] **AC20 (C17)** — Favori à 500 000 F ; prix → 450 000 → le job du lendemain envoie **une**
      notification à ce client, la suivante n'envoie rien. 500 000 → 450 000 → 520 000 dans la
      journée → aucune notification. Passage à `rented` → une notification « loué », sans prix.
      `favorite_price_drop` coupé → rien pour la baisse, l'indisponibilité part encore.
      ✓ `FavoriteChangeAlertsTest` : `test_une_baisse_est_annoncee_une_fois`, `test_une_baisse_effacee_par_une_hausse_ne_dit_rien`, `test_un_bien_loue_est_annonce_une_fois_sans_prix`, `test_couper_la_baisse_ne_coupe_pas_l_indisponibilite` — run du 2026-10-08.
- [x] **AC21** — Un bien devenu privé le jour même d'une baisse ne produit que l'alerte
      d'indisponibilité, jamais son nouveau prix.
      ✓ `FavoriteChangeAlertsTest::test_un_bien_prive_le_jour_d_une_baisse_ne_dit_que_son_indisponibilite` — run du 2026-10-08.

## Hors périmètre

- Un vrai mode `instant` (déclenché à la publication) — **retiré par décision du porteur le
  2026-10-06** ; à rouvrir par ticket dédié si la demande se manifeste.
- Les favoris **anonymes** (stockage local, `/public/properties/by-ids`) et la PWA (TCK-598).
- La page publique « bien retiré » (TCK-598) ; le temps réel de la cloche (dette C20).
- Le registre des demandes de droits et l'export des données de l'abonné (TCK-601).
- Une alerte « de nouveau disponible » sur un favori.

## Notes d'implémentation

### Re-mesure sur `33932c60` (2026-10-08, avant le code)

Chaque constat cité par ligne a été relu. **Tenus tels quels** : `FavoriteController.php:18-21`
(liste sans filtre, `per_page` brut), `:32-33` (copie partielle de `scopePublic`), `:36`
(`$user->agency_id`) ; `SendSavedSearchAlerts.php:101-106` (`getMessage()` dans le `catch`),
`:140-143` (`NotificationType::System`, titre et corps littéraux, `count` de la page), `:70-74` et
`:163-164` (`instant` = `daily`) ; `StoreSavedSearchRequest.php:53-54`,
`UpdateSavedSearchRequest.php:47-48` ; `SaveSearchButton.tsx:53-63`, `:120-121`, `:135` ;
`SavedSearchesList.tsx:105-127` ; `SearchPreferencesForm.tsx:32`, `:79`, `:100-103` ;
`FavoritesList.tsx:36-42`, `:58`.

**Décalés sans changer de sens** : `SearchService.php` lit toujours `min_price`/`max_price`/
`min_area`/`city` (`:48-62`), mais `paginate` est en `:127` (TCK-508 a ajouté les clés
multi-valuées `type`/`condition`, l.41-46) ; `PropertySearchService::buildFilter` est en `:368-487` ;
les routes des favoris en `routes/api/properties.php:75-77`.

**Changés par les tickets fusionnés depuis `e3ab4a4e`** :

- **588** — `WhatsappChannel` exige désormais, pour un destinataire sans compte, un contact
  `opted_in` (`:146`) et le borne par numéro (`:287-302`) : le « ni consentement ni débit » du
  Contexte §3 est fermé. **Reste** : un destinataire non éligible retombe sur le SMS
  (`fallbackToSms`, `:118` et `:129`), ce que la contrainte 6 interdit pour une alerte.
  `ProseLitteraleInterditeTest` porte une exemption expirante `Jobs/SendSavedSearchAlerts.php`
  (forme `notify`, TCK-599) : elle part avec la réécriture du job. `NotificationService::TYPE_TO_EVENT`
  porte toujours `'system' => 'threshold_alert'` (`:43`) — non touché ici, le job quitte `notify()`.
- **589** — `PhoneVerificationService::sendCodeTo(scope, phone)` / `verifyCodeFor()` existe
  (« TCK-596 / TCK-599 » dans son en-tête) : code à 6 chiffres haché, 5 essais, envoi par
  `SmsRouterDriver`, plafond journalier. **Réutilisé** comme le demande la coordination 589 — sa
  durée de vie est **5 min** et non les 10 min de la contrainte 4.
- **601** — `SafeExceptionContext::of()` existe et ne porte **déjà** aucune clé `message` : la
  seconde moitié de l'ablation d'AC13b (« garder le `message` de `of()` ») n'a plus d'objet sur ce
  code ; elle est rejouée en substituant `getMessage()`.
- **594** — précédent de chiffrement + empreinte de recherche : `PayoutMethod` (`encrypted` +
  `hash_hmac` sous `app.key`), suivi pour le contact de l'abonné (ADR-0050).

### Delta A — favoris (§1), 2026-10-08

- **Rouge d'abord** : `FavoriteVisibilityTest` écrit avant le correctif, 15 échecs sur `33932c60`
  (clé `availability` absente, 201 + carte complète à l'ajout, `DELETE` 404 sur un bien supprimé).
- **Juge unique** : `withExists(['property as property_is_public' => fn ($q) => $q->public()])` ;
  `FavoriteResource::availability()` lit ce drapeau, jamais une copie des conditions. `rented` /
  `sold` ne se disent que d'un bien qui serait public sans son statut (privé ou de test loué →
  `unavailable`, sinon le statut interne fuirait).
- **Ajout** : `Property::public()` ou `can('view')`, sinon `abort(404)` — un identifiant inexistant
  et un bien non visible rendent le même statut et le même corps (`http.not_found`).
  `PropertyDomainValidationTest` attendait 422 pour `property_id=999999` : passé à 404, avec la
  raison en commentaire (le 422 `exists` était l'oracle).
- **PATCH** `favorites/{property}` (le bien, comme `DELETE` — l'identifiant que le front manipule
  déjà), lié `withTrashed()` comme `DELETE`.
- **Colonnes limitées** : `FavoriteController::CARD_COLUMNS` (ce que `PropertyCard` lit + ce que la
  disponibilité juge) ; `PropertyResource` émet par `whenHas`, une colonne non lue sort absente.
- **AC5, nombre de requêtes** : le premier test (photos filigranées ou exemptées) ne voyait pas le
  lot de filigrane — l'ablation de `WatermarkRequirement::attach()` restait verte. Le test pose
  désormais des photos **antérieures à la trace** (cas `absente` de TCK-539, agence sans
  filigrane) : la règle doit être lue, et l'ablation rougit.

| Ablation (`ablate.py`, cp + md5) | Test | Résultat |
|---|---|---|
| `FavoriteResource` sert `PropertyResource` pour tout favori | `FavoriteVisibilityTest` | 9 échecs |
| Copie partielle de `scopePublic` à l'ajout | idem | 5 échecs |
| 403 au lieu du 404 identique | idem | 5 échecs |
| Refus universel (personnel de l'agence compris) | idem | 1 échec |
| `DELETE` sans `withTrashed()` | idem | 1 échec |
| `per_page` non borné | `FavoriteTest` | 1 échec |
| Médias non préchargés | idem | 1 échec |
| `WatermarkRequirement::attach()` retiré | idem | 1 échec (après correction du test) |
| PATCH sans contrôle du propriétaire | idem | 1 échec |
| Note non bornée | idem | 1 échec |

Restauration vérifiée par md5 après chaque ablation.

### Delta B, C et §5 — back (2026-10-08)

- **Un moteur** : `PropertySearchService::alertMatches()` — `buildFilter()` de `/properties`,
  `matchingStrategy all` sans repli ADR-0024, fenêtre `published_at` filtrée dans Meilisearch,
  tri `published_at:desc`, 5 biens, `totalHits` comme total ; les biens rechargés par
  `Property::public()` (un bien sorti du public entre l'index et l'envoi n'est pas décrit).
  `buildFilter()` apprend `cities` (OU). `SearchService::getMatchingProperties()` rend désormais
  `{properties, total}` ; son ancien chemin SQL n'a plus d'appelant en production (raccord).
- **Borne** relevée AVANT la requête, en retrait de `search_alerts.index_margin_minutes` (10) ;
  `last_notified_at` n'avance que sur un envoi.
- **Vocabulaire** : `SavedSearchCriteria::KEYS` (23), règle `array:` commune aux deux Requests et à
  l'alerte publique ; `toSearchParams()` ne transmet que `KEYS` et ramène les listes à la forme
  que lit le moteur. `SearchServiceGeoTest` perd son test du chemin SQL des recherches
  sauvegardées : le rayon est éprouvé contre le moteur réel par les lignes `radius_km`/`lat`/`lng`.
- **Notification dédiée** (`SavedSearchMatchesNotification`) : cloche toujours (invariant 588),
  e-mail selon `saved_search_match`, WhatsApp derrière `SEARCH_ALERTS_WHATSAPP_ENABLED` et sans
  repli SMS (`smsFallbackAllowed(): false`, lu par `WhatsappChannel`). Aucun `NotificationCodes`
  ajouté : la cloche porte le titre localisé stocké.
- **Sans compte** : `alert_subscribers` (contact chiffré, empreinte HMAC, jetons hachés), 202
  identique, 2 confirmations / 24 h, 5 demandes ouvertes, limiteur par visiteur ET par contact,
  purge horaire à 48 h, désinscription qui efface toutes les lignes du contact, rattachement sur
  contact vérifié. Le code WhatsApp vit 5 minutes (service de 589), pas 10.
- **Favoris qui préviennent** : `SendFavoriteChangeAlerts` quotidien (09:15), prix comparés en
  centimes entiers, base posée par `FavoriteObserver::creating`, bases avancées APRÈS l'envoi.
- **Gardes** : l'exemption `FavoriteController::store` de `check-agency-scope-clause` est morte
  depuis Delta A — retirée, cliquet 1 → 0 (`a327a4b1`). `docs/models-spec.md` : §84
  `AlertSubscriber` (§80 avant la fusion de 596 et 600), colonnes neuves de `Favorite` et `SavedSearch`.

| Ablation (`ablate.py` / `ablate2.py`, cp + md5) | Test | Résultat |
|---|---|---|
| `getMessage()` remis au journal d'échec | `SavedSearchAlertFailureLogTest` | 2 échecs |
| `matchingStrategy` élargi (`last`) | `SavedSearchAlertsTest` | 1 échec |
| Filtre `cities` retiré | vocabulaire + alertes | 2 échecs |
| Listes réduites à leur premier élément | idem | 3 échecs (survivait — témoin passé à la SECONDE valeur) |
| Règle `array:` retirée | `SavedSearchCriteriaVocabularyTest` | 1 échec |
| Clés hors vocabulaire transmises au moteur | idem | 1 échec (survivait — test ajouté) |
| Marge d'indexation retirée | `SavedSearchAlertsTest` | 1 échec |
| Borne basse ignorée | idem | 3 échecs |
| Borne avancée sur passage muet | idem | 1 échec |
| `off` envoie / `weekly` envoie chaque jour | idem | 1 échec chacune |
| Préférence e-mail ignorée | alertes + `SavedSearchTest` | 2 échecs |
| `total` = nombre décrit | `SavedSearchAlertsTest` | 1 échec |
| Rechargement sans `public()` | idem | 1 échec |
| Abonné non confirmé servi par le job | `PublicSearchAlertTest` | 1 échec |
| Jeton réutilisable (`whereNull` + empreinte gardée, ensemble) | idem | 1 échec |
| Jeton sans échéance | idem | 1 échec (test `…_48_h_…` ajouté) |
| Code faux accepté / confirmation sans opt-in | idem | 1 échec chacune |
| Plafond de confirmations / d'alertes ouvertes levé | idem | 1 échec chacune |
| 409 sur un contact connu (énumération) | idem | 5 échecs |
| Limiteur par contact relevé à 5000 | idem | 1 échec |
| Purge retirée / purge qui efface les confirmés | idem | 1 échec chacune |
| Désinscription qui n'efface que la ligne | idem | 1 échec |
| Désinscription de compte sans `signed` / en GET | `SavedSearchAlertsTest` | 1 échec chacune |
| Rattachement : e-mail / téléphone non vérifié, non confirmé, collision, abonnés gardés | `SearchAlertClaimTest` | 1 échec chacune |
| Baisse annoncée à chaque passage / hausse sans rebase | `FavoriteChangeAlertsTest` | 1 échec chacune |
| Indisponibilité répétée / retour au public sans réarmement | idem | 1 échec chacune |
| Préférence de baisse ignorée | idem | 1 échec |
| Visibilité jugée sans `scopePublic` | idem | 3 échecs |
| Base non posée à la mise en favori | idem | 3 échecs |
| Seeder remis à `neighborhoods` / fabrique à `max_price` | vocabulaire | 1 échec chacune |
| Crochet `smsFallbackAllowed` qui refuse toujours | `WhatsappChannelTest` | 6 échecs |
| Crochet inversé / crochet retiré | idem | 2 échecs / 1 échec |
| Clé `whatsapp-channel:user:{id}` perdue pour un `User` | idem | 1 échec |

**La demande d'un visiteur est mise en file** (demande de session, ADR-0050, décision 13) :

| Ablation | Test | Résultat |
|---|---|---|
| `dispatchSync()` dans le contrôleur | `PublicSearchAlertTest` | 1 échec |
| Le contrôleur fait le travail en ligne (`->handle()`) | idem | 1 échec |
| `ShouldBeEncrypted` retiré | idem | 1 échec |
| `getMessage()` ajouté au journal d'échec | idem | 1 échec |
| L'erreur est relancée par le job | idem | 1 échec |

**`WhatsappChannel` reste strictement additif** (demande de session) : une notification sans
`smsFallbackAllowed()` — toutes celles d'avant 599 — garde le repli SMS, et la clé `user:{id}` d'un
`User` est inchangée. Seuls `User` et `AlertSubscriber` sont `Notifiable` dans `app/`, et
`AnonymousNotifiable` n'a pas de `getKey()` : aucun notifiable existant ne change de clé. Quatre
tests `test_tck599_*` dans `WhatsappChannelTest` (17/17).

**Fusion d'`origin/dev` (`bcade3bc`, TCK-596 et TCK-600), commit `52fc29bd`** :
- `FavoriteController::index` garde le masquage de TCK-600 (agence suspendue ; le personnel de
  l'agence garde son favori). Il passe sous la projection de 599, en `withTrashed()`.
- L'ajout d'un favori sur un bien d'agence suspendue rend 404, la même réponse qu'un bien absent
  (contrainte 11). Le test de 600 qui attendait 403 a été aligné.
- `SendFavoriteChangeAlerts` gèle le favori d'une agence suspendue : il ne l'annonce pas et ne le
  rebase pas (ADR-0050, décision 11).
- Les chemins d'API du front passent par `cheminApi`, la garde de TCK-600 : `cheminFavori`,
  `cheminRecherche`, la pagination des cœurs et la désinscription signée.

| Ablation de la fusion | Test | Résultat |
|---|---|---|
| Gel retiré du job | `FavoriteChangeAlertsTest` | 1 échec |
| Masquage de TCK-600 retiré de la liste | `AgencySuspensionAuthenticatedReadsTest` | 1 échec |
| `withTrashed()` retiré de la liste | `FavoriteVisibilityTest` | 1 échec |

**Gardes doubles, assumées** : l'usage unique du jeton tient par l'empreinte effacée ET par
`whereNull('confirmed_at')` — chacune seule survit à l'ablation de l'autre, les deux ensemble
rougissent. Le `isConfirmed()` de `via()` double le filtre du job : non éprouvé seul.

### Front (2026-10-08)

- `FavoritesList` : carte éteinte (raison, retirer, biens similaires ; ni prix ni lieu),
  pagination `console/Pagination`, note éditable (PATCH). `AuthContext` lisait
  `/api/favorites?per_page=100` — **rendu 422 par AC5**, avalé en « best-effort » : les cœurs d'un
  connecté seraient restés vides. Remplacé par `fetchAllFavoritePropertyIds()` (pages de 50).
- `SaveSearchButton` : case « Me prévenir chaque jour » décochée ; confirmation selon
  `alert_channels`. Visiteur : `PublicSearchAlertForm` dans la même boîte (plus de redirection
  forcée), lien de connexion conservé. `SavedSearchesList` : réglage en place + canaux effectifs.
- Pages `[locale]/(public)/search-alerts/{confirm,unsubscribe}` : `noindex`, `no-referrer`, action
  au clic seulement, paramètres d'URL contrôlés (`lireLienDeCompte`, forme du jeton).
- `instant` retiré du type, du schéma, de `SearchPreferencesForm` et des trois dictionnaires.
- Préférences : `favorite_price_drop`, `favorite_unavailable` dans le groupe « Alertes ».
- Délais affichés inscrits au registre `promesses-de-delai` (48 h, 5 min). Encres atténuées des
  nouvelles surfaces publiques posées sur `bg-popover`/`bg-card` (cliquet de contraste inchangé).
- `toggleFavoriteAction` retirée : action serveur morte qui visait `/favorites/{id du favori}`.

| Ablation (`ablate-web.py`, cp + md5) | Test | Résultat |
|---|---|---|
| Page figée à 1 / pagination non rendue | `FavoritesList.test.tsx` | 1 échec chacune |
| Favori éteint rendu en carte complète | idem | 3 échecs |
| Retrait sur l'id du favori | idem | 1 échec |
| Case cochée par défaut / ignorée | `SaveSearchButton.alerte.test.tsx` | 2 / 1 échecs |
| Confirmation qui suppose les canaux | idem | 1 échec |
| Visiteur renvoyé à la connexion / consentement non exigé / langue non transmise | idem | 1 échec chacune |
| Réglage de ligne qui ne part pas | `SavedSearchesList.alerte.test.tsx` | 1 échec |
| Canaux supposés | idem | 1 échec (survivait — fixture à canal unique) |
| Action au rendu / jeton non contrôlé / 422 traité en panne | `SearchAlertLinkAction.test.tsx` | 3 / 2 / 2 échecs |
| `search` / `signature` non contrôlés | `identifiants-d-alerte.tck-599.test.ts` | 1 / 5 échecs |
| `cheminFavori` / `cheminRecherche` non contrôlés | idem | 18 échecs chacune |
| `per_page=100` rétabli dans la synchro des cœurs | `favoris-du-magasin.tck-599.test.ts` | 1 échec (survivait — test ajouté) |

**Non vérifié ici** (au porteur) : un envoi WhatsApp réel (gabarit `utility` non approuvé, drapeau
faux) ; un essai sur téléphone réel des pages de confirmation et de désinscription ; le rendu de
l'e-mail dans un vrai client (Gmail : bouton « Se désabonner » en un clic).

**La suite entière** (back et front) n'a pas été lancée par l'agent : lancée par la session.

### Après la contre-vérification (verif-599, passe 1 et addendum)

Un point, un commit, un test nommé, des ablations rouges. Décisions dans ADR-0050, n° 14 à 18.

| Point | Commit | Test | Ablations (`ablate.py` / `ablate-web.py`, cp + md5) |
|---|---|---|---|
| **B1** saisie rendue en Markdown | `5eb4bd67` | `SaisieDansLesEmailsTest` (4) | échappement neutralisé · nom repris dans la confirmation · titre brut (favoris) · nom brut (alerte) · titre de carte brut — 5 rouges |
| **M1** annonce doublée sous course | `1375c2db` | recouvrement, échec d'envoi, verrou (`FavoriteChangeAlertsTest`, `SavedSearchAlertsTest`) | réservation ignorée · non rendue · sans verrou, pour chacun des deux jobs — 6 rouges |
| **m1** alias `+` | `c29cee43` | `test_les_alias_plus_partagent_les_plafonds_de_la_boite` | alias non retiré · alertes ouvertes et confirmations comptées par contact saisi · limiteur par contact saisi — 4 rouges |
| **m2** `X-RateLimit-Remaining` | `0c00e08a` | `test_les_en_tetes_du_limiteur_ne_trahissent_pas_le_contact` | borne remise dans le limiteur de route · borne retirée — 2 rouges |
| **m3** désinscription WhatsApp | `a18b5d86` | 3 tests (`abonnementWhatsappPuisDesinscription`) | consentement jamais retiré · retiré même venu d'ailleurs · consentement existant réécrit · ligne toujours supprimée — 4 rouges |
| **m4** valeurs du vocabulaire | `12a8ec13` | `test_une_valeur_hors_vocabulaire_rend_422` (13 cas), `test_les_deux_formes_d_une_liste_sont_acceptees` | `type` / `tags` libres · `condition` hors énumération · rayon nul · latitude / longitude non exigées · contrat / titre libres — 9 rouges |
| **m5** A13, A19 | `dd115b4f` | `test_tck599_l_alerte_de_recherche_ne_se_replie_jamais_en_sms` ; casses alternées (`test_cinq_alertes_au_plus_par_contact`, rattachement) | `smsFallbackAllowed()` → `true` · repli de casse retiré (deux fichiers) — 3 rouges |
| **m7** fuite temporelle | `eba4d577` | `DB::listen` dans `test_la_requete_ne_fait_que_pousser_un_job_chiffre` | `forContact()->count()` · UPDATE si connu · UPDATE seul · lecture de `saved_searches` — 4 rouges |
| **m8** `no-referrer` | `cb4413eb` | `search-alerts/__tests__/metadata.test.ts` | retiré · affaibli à `origin`, sur chaque page — 4 rouges |

- **M1, course réelle** : deux processus sur une base jetable (`takussan_tck599_conc`, créée puis
  supprimée), 300 favoris en baisse. Avec réservation : `{"1":300}`. Témoin sans réservation :
  `{"1":12,"2":288}`.
- **m2 ne suit pas le remède proposé** : mettre la limite par visiteur en dernier n'y change rien.
  `ThrottleRequests::getHeaders` garde le plus petit reste de toutes les limites (lu dans le code,
  puis mesuré). La borne par contact a donc quitté la route (décision 17).
- **m4** : la normalisation de `BaseFormRequest` ramène un champ vide à `null` ;
  `BaseFormRequestNormalizationTest` en envoie un dans `tags`. Une entrée `null` reste acceptée.
  Un tableau imbriqué, un objet ou une valeur hors énumération rendent 422. Les règles `lat` et
  `lng` se couvraient l'une l'autre : la première ablation est restée verte jusqu'à l'ajout des
  cas « point sans latitude » et « point sans longitude ».
- **m6** : fait par la fusion de TCK-603 (`47f86b59`).
- **m9** (Analytics) : attend TCK-602. Le ticket fusionné en second ajoute à `urlSansSecret` les
  cas `/fr/search-alerts/confirm?token=…` et `/fr/search-alerts/unsubscribe?search=12&…`.
