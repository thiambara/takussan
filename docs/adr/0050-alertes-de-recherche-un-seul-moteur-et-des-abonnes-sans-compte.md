# ADR-0050 — Une alerte de recherche rend ce que la liste aurait rendu, par le même moteur et le même vocabulaire fermé ; un visiteur s'abonne sans compte, par un contact chiffré et doublement confirmé

- **Statut** : Accepté
- **Date** : 2026-10-08
- **Tickets** : [TCK-599](../backlog/tickets/TCK-599-alertes-de-recherche-et-favoris-qui-previennent.md)
- **Amende** : [ADR-0023](0023-recherche-geographique-par-distances-sans-postgis.md), chemin 3
  (« `SearchService` haversine — conservé, non convergé ») : les alertes convergent.
- **Applique** : [ADR-0024](0024-recherche-publique-conjonctive-avec-repli-nomme.md) (régime
  conjonctif — **sans** son repli), [ADR-0032](0032-l-api-n-ecrit-plus-de-prose.md) (aucune prose),
  [ADR-0044](0044-donnees-personnelles-chiffrement-journal-d-agence-registre-des-droits.md)
  (chiffrement, journaux sans donnée), [ADR-0026](0026-la-langue-est-un-segment-d-url-sur-la-surface-publique.md)
  (liens avec segment de langue).

## Contexte

Relu sur `dev` à `33932c60` (2026-10-08), détail dans les Notes d'implémentation du ticket.

1. **Les alertes qui partaient étaient fausses.** `SendSavedSearchAlerts` passait par
   `SearchService::search()`, qui lit `min_price`, `max_price`, `min_area`, `city`
   (`SearchService.php:48-62`) ; le front écrit `price_min`, `price_max`, `area_min`, `location`,
   `q`, `rent_period`… (`filtersToCriteria`, table `SEARCH_FILTER_KEYS` de
   `takussan-web/src/types/search.ts`). Sur les 22 clés de rôle `filtre`, 11 étaient ignorées sans
   erreur — une alerte « Location · Dakar · ≤ 300 000 F » signalait toute location de Dakar.
   `cities` (formulaire de préférences) n'était lu par aucun moteur. ADR-0023 justifiait la
   non-convergence par un vocabulaire stocké en `min_price` : **la prémisse est réfutée**, aucun
   écrivain réel ne produit ce vocabulaire (seul un test l'écrivait).
2. **Rien n'empêchait la classe du défaut** : `criteria` était validé `['required', 'array']`, sans
   schéma de clés ; une clé inconnue était stockée, puis ignorée.
3. **Les alertes exigeaient un compte** (`auth:sanctum`, `saved_searches.user_id` NOT NULL), alors
   que le visiteur est le premier public d'une alerte « prévenez-moi des nouveaux biens ».

## Décision

### 1. Un seul moteur : celui de `/properties`, sans repli

`SearchService::getMatchingProperties()` délègue à `PropertySearchService::alertMatches()`, qui
construit **le même filtre** que `GET /api/public/properties/search` (`buildFilter()`, dont les
quatre clauses de `publicFilter()`) et l'envoie à Meilisearch :

- **régime conjonctif seul** (`matchingStrategy: all`) — **jamais** le repli élargi d'ADR-0024 :
  une alerte qui relâche un critère prévient d'un bien que la personne n'a pas demandé ;
- **une fenêtre de publication**, filtrée dans le moteur sur `published_at` (timestamp,
  `filterableAttributes`) : `]borne précédente, maintenant − 10 min]`. La marge couvre le délai
  d'indexation : un bien publié dans les dix dernières minutes attend le passage suivant au lieu
  d'être perdu (s'il n'était pas encore indexé) ou renvoyé (s'il l'était). La borne haute devient
  `last_notified_at`. La borne reste un **argument** de méthode, jamais une clé de `criteria`
  (TCK-350) ;
- tri `published_at:desc`, **cinq** biens rendus, et `totalHits` comme total : le compte annoncé
  est celui du moteur, plus celui d'une page ;
- les biens rendus sont rechargés par `Property::public()` au moment de l'envoi — un bien sorti du
  public entre l'indexation et l'envoi n'est jamais décrit.

`cities` est ajouté au filtre du moteur (OU entre villes) ; les valeurs multiples (`type`,
`condition`, `tags`, `cities`) sont normalisées avant d'atteindre `buildFilter()`.

`SearchService::search()` (le chemin 3 d'ADR-0023) **n'a plus d'appelant de production** ; il reste
sous ses tests. Le retirer est un ticket de suite, pas une conséquence implicite de celui-ci.

### 2. Un vocabulaire fermé, en un seul endroit

`App\Support\SavedSearchCriteria::KEYS` = les 22 clés de rôle `filtre` de `SEARCH_FILTER_KEYS` +
`cities`. `StoreSavedSearchRequest` et `UpdateSavedSearchRequest` écrivent à l'identique
`'array:'.implode(',', KEYS)` : **toute autre clé rend 422**, jamais stockée pour être ignorée. Un
test paramétré sur `KEYS` prouve que chacune filtre. La migration
`normalize_saved_search_criteria_vocabulary` réécrit l'existant (`min_price→price_min`,
`max_price→price_max`, `min_area→area_min`, `neighborhoods[0]→location`) et **journalise** sans
les modifier les lignes qui gardent une clé hors liste.

`notification_frequency ∈ {off, daily, weekly}` : `instant` est **retiré par décision du porteur
le 2026-10-06** ; la migration `retire_instant_saved_search_frequency` le ramène à `daily`.

### 3. Une notification dédiée par alerte, gouvernée par son propre interrupteur

`SavedSearchMatchesNotification` (événement `saved_search_match`) et
`FavoriteChangesNotification` (`favorite_price_drop`, `favorite_unavailable` — deux événements
neufs de `PreferenceResolver::EVENTS`) sont des `Notification` Laravel émises directement, **pas**
par `NotificationService::notify()` : l'alerte cesse d'obéir à `threshold_alert`. Leurs textes sont
des clés `saved_search_alerts.*` / `favorite_alerts.*` (`lang/{fr,en,wo}/`), rendues dans la langue
du destinataire ; leur ligne de cloche passe par `toAppNotification()` (un `User` seulement :
`app_notifications.user_id` est une FK). Leur `via()` ne contient **jamais** `sms`.

### 4. L'abonné sans compte

- **Une table `alert_subscribers`, une ligne par DEMANDE** (option retenue par défaut, puis
  précisée ici) : canal (`email` | `whatsapp`), contact, locale, empreintes des jetons,
  `confirmed_at`, preuve de consentement (date, source, version du texte). `saved_searches.user_id`
  devient nullable et gagne `alert_subscriber_id` (FK `cascadeOnDelete`), avec une contrainte
  `CHECK` « exactement un des deux ». **Un seul modèle de recherche, un seul job.** L'abonné est un
  modèle `Notifiable` + `HasLocalePreference`, pas un `AnonymousNotifiable`.
- **Le contact est chiffré** (cast `encrypted`, ADR-0044 §1) et retrouvé par une **empreinte**
  `contact_hash = HMAC-SHA256(forme normalisée, app.key)` — la forme déjà retenue par
  `PayoutMethod` (TCK-594). L'e-mail est replié par `CaseInsensitive::fold()`, le téléphone ramené
  à E.164.
- **Rien ne part avant la double confirmation**, sauf l'unique message qui la demande :
  - e-mail : un lien porteur d'un jeton de 256 bits, stocké **haché** (SHA-256), à usage unique,
    valable tant que la demande n'est pas purgée (48 h) ;
  - WhatsApp : le code à 6 chiffres du **service de TCK-589** (`PhoneVerificationService::
    sendCodeTo('search_alert:<id>', …)`) — haché, 5 essais, envoyé par `SmsRouterDriver`. Sa durée
    de vie est **5 minutes** (celle du service réutilisé), non les 10 du ticket. La confirmation
    écrit `whatsapp_contacts` en `opted_in`, source `search_alert` (garde d'opt-in de 588).
- **Bornes** : au plus 2 messages de confirmation par contact et par 24 h, au plus 5 alertes non
  closes par contact, limiteur `public-search-alert` par visiteur (`visitorRateLimitKey`). La
  réponse de création est **202, toujours la même** — contact connu ou non, borne atteinte ou non.
- **Purge** : une demande non confirmée disparaît à 48 h (`search-alerts:purge-unconfirmed`,
  horaire). **Désinscription** : un jeton de 256 bits haché, valable jusqu'à la désinscription ;
  elle efface **toutes** les demandes de ce contact (et leurs recherches) — « effacer le contact »
  ne laisse pas une seconde copie. Un `GET` ne désinscrit jamais : l'e-mail porte
  `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058), et le lien
  visible ouvre une page à un bouton.
- **Rattachement** (`POST /api/saved-searches/claim`) : seulement par un e-mail **vérifié** égal,
  ou un téléphone **vérifié** égal ; jamais par déclaration.
- **WhatsApp n'est proposé que derrière un drapeau** (`search_alerts.whatsapp_enabled`, faux par
  défaut), lu par la route publique `GET /api/public/search-alerts/capabilities` : tant que le
  gabarit `utility` n'est pas approuvé, l'option n'existe pas.

### Décisions de session réversibles

Non tranchées par le ticket, structurantes, prises dans le sens le plus facile à défaire :

1. **Une ligne d'abonné par demande, pas par contact** — chaque nouvelle alerte se confirme ; un
   tiers ne peut pas greffer une alerte sur un contact déjà confirmé. Revenir à « une ligne par
   contact » est une migration de regroupement par `contact_hash`.
2. **Contact chiffré + empreinte sous `app.key`.** Une rotation d'`APP_KEY` change toutes les
   empreintes `contact_hash`, et `APP_PREVIOUS_KEYS` n'y peut rien : il sert au déchiffrement, pas
   au HMAC. Tant que les empreintes ne sont pas recalculées, **les abonnés existants deviennent
   introuvables par leur contact**. Concrètement :
   - **Le rattachement à un compte ne les trouve plus.** `SavedSearchController` hache l'e-mail et
     le téléphone du compte sous la nouvelle clé.
   - **« Effacer le contact » n'efface que les lignes postérieures à la rotation.**
     `eraseContact()` filtre par empreinte, si bien que les lignes antérieures survivent à une
     demande d'effacement.
   - **Les plafonds par contact repartent de zéro.** Cela vaut pour les 5 demandes ouvertes, les
     2 confirmations par 24 h et le limiteur `contact:`.
   - **Des doublons deviennent possibles.** Une nouvelle demande crée une nouvelle ligne sous la
     nouvelle empreinte, à côté de l'ancienne. La personne qui se réabonne reçoit alors deux fois
     la même alerte.

   Ce qui tient : la désinscription par lien et la confirmation, parce que leurs jetons sont hachés
   en SHA-256 sans clé. Le contact et le jeton de désinscription chiffrés se déchiffrent tant que
   l'ancienne clé figure dans `APP_PREVIOUS_KEYS`. Sans elle, les envois échouent au déchiffrement.

   C'est la même limite que `PayoutMethod`. Elle se traite par la commande de rotation qu'ADR-0044
   renvoie à son premier usage : déchiffrer avec l'ancienne clé, puis ré-hacher avec la nouvelle.
3. **Pas de repli SMS pour une alerte** : la notification déclare `smsFallbackAllowed(): false`, que
   `WhatsappChannel` lit avant de basculer (ajout voisin dans le fichier de 588). Sans ce crochet,
   un échec dur de WhatsApp enverrait l'alerte par SMS.
4. **La désinscription d'une recherche d'un compte** passe par une URL signée relative
   (`saved-searches.unsubscribe`), valable 60 jours, appelée en `POST` depuis la page à un bouton.
   Au-delà, la personne règle l'alerte depuis `/app/saved-searches`.

Ajoutées pendant l'implémentation (2026-10-08), même règle :

5. **Le jeton de désinscription est stocké chiffré ET haché** : l'empreinte sert la recherche, la
   forme chiffrée permet de le rejouer dans chaque envoi (un jeton seulement haché ne pourrait
   figurer que dans le premier). Le lien de confirmation, lui, n'est stocké que haché.
6. **Le premier passage d'une alerte n'a pas de borne basse** : il annonce les biens qui
   correspondent déjà (total réel, cinq décrits), puis la fenêtre ne porte que sur les nouveaux.
   Le borner à la création se fait en posant `last_notified_at` à la création.
7. **Le rattachement ne prend que les abonnés confirmés**, et renomme `nom #id` une recherche dont
   le nom est déjà pris par le compte (`(user_id, name)` est unique) plutôt que de la refuser.
8. **La cloche reste toujours active** (invariant de 588) : couper `saved_search_match` ou
   `favorite_*` coupe l'e-mail (et WhatsApp), pas la ligne de cloche d'un compte.
9. **Un favori déjà hors du public avant la migration est marqué « annoncé »** : le premier passage
   de `SendFavoriteChangeAlerts` n'annonce pas tout l'historique. Les prix se comparent en
   centimes entiers (`Favorite::cents()`), jamais en flottants.
10. **Le formulaire visiteur fixe la fréquence à quotidienne** ; l'API accepte `weekly`, l'écran ne
    le propose pas encore.

Ajoutées à la fusion de TCK-600 (ADR-0048, suspension d'agence), même règle :

11. **Le favori d'un bien d'agence suspendue est gelé, pas annoncé.** `scopePublic()` exclut
    désormais ces biens. Sans précaution, `SendFavoriteChangeAlerts` aurait donc annoncé
    « n'est plus disponible » à tous les favoris de l'agence le jour de la suspension. Le
    moteur de recherche ne serait pas en cause : ce serait l'effet d'un geste de modération.
    Or ADR-0048 tient le bien pour **masqué** : il revient à la levée. Le job écarte donc ces
    favoris par `ofPublicAgency()` : il ne les annonce pas, ne les rebase pas, et ils reprennent
    contre leur base d'avant. Pour annoncer la suspension, il suffit de retirer ce filtre.
12. **L'ajout d'un favori sur un bien d'agence suspendue rend 404, pas 403.** TCK-600 avait écrit
    403 ; la contrainte 11 de 599 veut la même réponse pour un bien absent et un bien non visible.
    `AgencySuspensionAuthenticatedReadsTest` est aligné. La liste garde le filtre de TCK-600 (le
    favori est masqué, et le personnel de l'agence le garde), appliqué `withTrashed()` : un bien
    supprimé reste une carte éteinte.

## Conséquences

- Une alerte et la liste ne peuvent plus diverger sur le sens d'un critère : elles partagent
  `buildFilter()`. Une clé ajoutée au front sans être ajoutée à `KEYS` rend 422 à la sauvegarde —
  un rouge visible, au lieu d'une alerte silencieusement plus large.
- Les alertes dépendent de Meilisearch : un index indisponible fait échouer **une** recherche (le
  `catch` de la boucle la journalise par `SafeExceptionContext`, sans contact) et le passage suivant
  la reprend, la borne n'ayant pas avancé.
- Un bien publié dans les dix dernières minutes d'un passage part au passage suivant (24 h plus
  tard pour une alerte quotidienne).
- Un bien republié, ou dont `published_at` est rétrodaté, reste hors de la fenêtre (limite déjà
  écrite par TCK-350).
- Les abonnés sans compte sont une donnée personnelle neuve : leur droit d'effacement est servi par
  la désinscription et la purge ; leur export relève du registre de TCK-601 (hors de ce ticket).

## Application

- Moteur : `App\Services\Search\PropertySearchService::alertMatches()`,
  `App\Services\Model\SearchService::getMatchingProperties()`.
- Vocabulaire : `App\Support\SavedSearchCriteria`, `tests/Feature/Search/SavedSearchCriteriaVocabularyTest.php`.
- Envoi : `App\Jobs\SendSavedSearchAlerts`, `App\Notifications\SavedSearchMatchesNotification`,
  `tests/Feature/Search/SavedSearchAlertsTest.php`, `SavedSearchAlertFailureLogTest.php`.
- Abonnés : `App\Models\AlertSubscriber`, `App\Http\Controllers\Api\PublicSearchAlertController`,
  `tests/Feature/Search/PublicSearchAlertTest.php`, `SearchAlertClaimTest.php`.
- Favoris qui préviennent : `App\Jobs\SendFavoriteChangeAlerts`,
  `App\Notifications\FavoriteChangesNotification`, `tests/Feature/Favorites/FavoriteChangeAlertsTest.php`.
- Front : `components/favorites/PublicSearchAlertForm.tsx`, `SaveSearchButton.tsx`,
  `SavedSearchesList.tsx`, `components/search-alerts/SearchAlertLinkAction.tsx`, pages
  `[locale]/(public)/search-alerts/{confirm,unsubscribe}`.
