# ADR-0032 — L'API n'écrit plus de prose : une notification est un code rendu par surface, une erreur est un code et un message localisé

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Tickets** : [TCK-588](../backlog/tickets/TCK-588-api-sans-prose-notifications-multicanal.md)
- **Étend** : [ADR-0019](0019-l-erreur-d-api-porte-un-code-pas-un-libelle.md) (« l'erreur d'API porte un code, la
  surface de rendu porte le texte »), qui ne visait que le front, à l'API Laravel. Amende
  `docs/models-spec.md` §12 (AppNotification) ; `/sync-specs` suit.

## Contexte

ADR-0019 a posé le principe n° 5 du dépôt (« le front possède le texte affiché ; l'API émet des
codes et des données ») à l'intérieur du front. L'API, elle, n'y a jamais été tenue. Mesuré le
2026-10-06 sur `e3ab4a4e` (analyse par acteur, vague 73), re-mesuré pour ce ticket :

- **Notifications en prose figée.** 19 appels de `NotificationService::notify/notifyMany` passent un
  titre et un corps littéraux en français ; 9 autres passent par `__()` mais sortent dans la langue
  **du processus** (l'acteur, ou le worker), jamais celle du destinataire. La ligne
  `app_notifications` stocke ce texte, et la cloche l'affiche tel quel : une notification reste à
  jamais dans la langue où elle a été écrite.
- **Un rappel de loyer illisible.** `SendLeasePaymentReminders` concatène « en retard de -7.599…
  jour(s) » (Carbon 3 : `diffInDays` signé et flottant) et « 150000.00 XOF » (montant non formaté).
- **Une pile mobile sans appelant.** WhatsApp (bascule SMS, fenêtre de 24 h, gabarits Meta) et SMS
  (heures calmes ARTP, limite de débit) existent depuis TCK-282/283, mais la seule classe qui les
  implémente, `NewBookingNotification`, n'est envoyée par personne. Le registre de gabarits du
  super-admin n'a donc aucun effet, et la case `whatsapp` de la matrice de préférences ne commande
  rien.
- **Un locataire ou un visiteur sans compte est sauté.** Les relances font `continue` quand
  `lease.tenant.user` est nul ; `app_notifications.user_id` vise `users`, et aucun appelant de
  `Notification::route()` n'existe.
- **Les erreurs sont de la prose, en deux langues, et exposent des classes.** 186 `abort*()` à
  message littéral dans `app/` (relevé par tokenizer), 22 `'message' => '<prose>'`, 10
  `ValidationException::withMessages` en prose, 6 `throw new *HttpException('<prose>')`. Le rendu de
  `bootstrap/app.php` recopie `getMessage()` : « No query results for model [App\Models\Lease] 12 »,
  « This action is unauthorized. », « Error ». `KycWorkflowService::refuse()` construit sa réponse à
  la main et échappe à tout rendu.

## Décision

**L'API n'écrit plus de texte destiné à l'écran dans son code : une notification est un code, des
paramètres bruts et une cible, rendus à la demande dans la langue de leur lecteur ; une erreur métier
est un code, accompagné d'un message que l'API localise dans la langue négociée de la requête.**

### 1. Où vit le texte d'une notification

- **Le catalogue est une enum** : `App\Domain\Notifications\NotificationCode`, valeurs
  `<domaine>.<événement>`. Chaque cas déclare son `type()`, son `preferenceEvent()` (l'interrupteur
  qui le commande, choisi par **message** et non par type), ses `params()` typés (`money`, `date`,
  `datetime`, `count`, `text`), `mobile()`, `reachesContacts()` et `templateEvent()`.
- **La ligne stocke la donnée, pas la phrase** : `app_notifications` gagne `code`, `params` (jsonb)
  et `target` (jsonb). `title`/`body` restent écrits — rendus dans la langue du destinataire au moment
  de l'envoi — pour les lecteurs qui ne connaissent pas les codes (digest, exports).
- **Le rendu est une fonction pure de la surface** :
  `NotificationRenderer::render(code, params, locale, timezone, surface)`, surfaces `title`, `body`,
  `mail_subject`, `mail_body`, `sms`. Les clés vivent dans `lang/{fr,en,wo}/notifications.php` sous
  `codes.<code>.<surface>`. Montants par `CurrencyFormatter` dans la langue du destinataire, dates
  dans son fuseau (`users.timezone`, défaut `Africa/Dakar`), pluriels par `trans_choice`. Un
  `NotificationTemplate` actif pour `templateEvent()`, le canal et la langue l'emporte sur la clé :
  l'éditeur du super-admin devient effectif.
- **Le fil rend à la lecture** : `AppNotificationResource` re-rend `title`/`body` dans la langue
  négociée de la requête (TCK-536). La cloche, elle, rend par son propre dictionnaire
  (`notifications.codes.<code>`) et ne retombe sur le `title` de l'API que pour un code qu'elle ne
  connaît pas — jamais sur une clé brute (ADR-0022).
- **L'émission passe par un seul point** : `NotificationService::send(User|ContactSansCompte $to,
  NotificationCode $code, array $params, ?NotificationTarget $target)`. Pour un `User`, la ligne est
  écrite en synchrone, puis `CodedNotification` (en file) porte l'e-mail, le broadcast et **un** canal
  mobile au plus. `notify()`/`notifyMany()` restent appelables pendant la vague 73, **sans
  littéral** (garde), et disparaissent avec le dernier appelant.
- **Les préférences commandent ce qu'elles nomment** : `matrixFor()` verrouille
  (`channel_unavailable`) toute case qu'aucun envoi ne peut honorer — `push` tant que le broadcast
  part dans le journal (D-65), `sms`/`whatsapp` d'un événement sans émetteur mobile. Les canaux
  mobiles sont **activés par défaut** pour `lease_payment_due`, `lease_payment_overdue`,
  `visit_reminder` et `booking_status_changed` (désactivables, toujours soumis à
  `phone_verified_at`, coût SMS à la charge de la plateforme), désactivés ailleurs.

### 2. La forme d'une erreur

```
HTTP 403  { "code": "payout.landlord_not_in_agency", "message": "<errors.payout.landlord_not_in_agency, langue négociée>" }
```

- `App\Exceptions\ApiError` étend `HttpException` et porte `errorCode` et `params` ; on la lève par
  `abort_code()`, `abort_code_if()`, `abort_code_unless()` (`app/Support/helpers.php`). Le code est un
  **littéral** `^[a-z0-9_]+(\.[a-z0-9_]+)+$`, et sa clé existe dans `lang/{fr,en,wo}/errors.php`.
- **Toute autre `HttpException`** — refus de policy, modèle introuvable, `abort(403)` nu — est rendue
  `{code: "http.<statut>", message: __("errors.http.<statut>")}`. **Le message d'une exception
  n'atteint jamais le corps d'une réponse.** Une `QueryException` n'est pas interceptée par ce rendu.
- **Aucune réponse d'erreur construite à la main** : ni `HttpResponseException`, ni
  `response()->json(['message' => …], 4xx)` hors `abort_code*()`. Un contrôleur qui relaie une
  erreur relaie `code` et `message` d'une `ApiError`.
- Les erreurs de **validation** (422 `errors`) gardent leur forme : elles sont déjà localisées par
  `lang/*/validation.php` et gardées par `ValidationTranslationParityTest`. Seule la prose écrite à la
  main dans un `ValidationException::withMessages` est convertie (clé `__()`).

### 3. Un contact sans compte

- **Le destinataire** est un objet valeur, `App\Services\Notifications\ContactSansCompte` (`phone`
  normalisé E.164, `name`, `locale`, `customerId`), fabriqué par `fromCustomer(Customer)` ou
  `fromVisit(PropertyVisit)`.
- **Aucune base nouvelle** : il n'a pas de ligne `app_notifications` (sa clé étrangère vise `users`)
  et `customers` ne gagne aucune colonne. Le consentement WhatsApp est celui de `whatsapp_contacts`,
  la trace est celle de `notification_delivery_attempts` quand elle existe, et des journaux sinon.
- **Les canaux** : `Notification::route('whatsapp'|'sms', $phone)->locale($locale)`. WhatsApp
  seulement si le numéro est `opted_in`, sinon SMS ; jamais rien vers un numéro invalide ; heures
  calmes ARTP appliquées ; limite de débit **par numéro** (`sms-channel:phone:{e164}`,
  `whatsapp-channel:phone:{e164}`), puisqu'il n'a pas de clé. **Transactionnel seulement** :
  `send()` lève une `LogicException` pour un code dont `reachesContacts()` est faux, et aucune
  catégorie Meta `marketing` n'est jamais employée.
- **La langue** : `customer.user.preferred_language` s'il en a une, sinon **`fr`, explicitement** —
  jamais `app()->getLocale()`, qui est celle du worker. Pour un gabarit WhatsApp, `wo` retombe sur
  `fr` (le texte libre et le SMS restent en wolof).

## Conséquences

- **Une notification se relit dans la langue de son lecteur**, plus dans celle de son émetteur ; une
  langue ajoutée demain s'applique aussi aux lignes anciennes porteuses d'un `code`.
- **Le coût est un catalogue à tenir en trois langues, et deux dictionnaires** (API et front). Il est
  tenu par trois gardes, chacune prouvée par ablation : `ProseLitteraleInterditeTest` (tokenizer sur
  `app/`, positions (a)-(g) du ticket), `LangGroupParityTest` (mêmes fichiers, clés et placeholders
  en fr/en/wo ; chaque `NotificationCode` et chaque code d'`abort_code` présents), et
  `scripts/check-notification-codes.mjs` (chaque code a ses clés côté front). Toutes échouent si
  elles ne lisent rien.
- **Le front n'a rien à changer pour les erreurs** : `proseServeur` affiche déjà `message`, qui est
  désormais localisé. Un composant peut se brancher sur `code`.
- **Le SMS a un coût** porté par la plateforme, et un nombre de destinataires qui augmente (contacts
  sans compte, défauts mobiles). La limite par numéro et les heures calmes le bornent ; chaque rendu
  `sms` tient en deux segments au plus (test).
- **Les lignes anciennes** n'ont ni `code` ni `target` : la ressource dérive la cible des clés connues
  de `data` et de `referenceable_*`, et rend leurs colonnes stockées.
- **Transitoire** : tant que les tickets de la vague 73 ne sont pas tous fusionnés, `notify()` et
  `TYPE_TO_EVENT` survivent pour leurs appels restants. Une exemption nommée et **qui expire** couvre
  `SendSavedSearchAlerts` (TCK-599).

## Alternatives écartées

- **Un code seul, traduit par le front** (question 5 du ticket). Plus pur au regard du principe n° 5,
  mais chaque consommateur de l'API (e-mails, SMS, BFF, futurs clients) devrait embarquer le
  catalogue ; et le front affiche déjà `message` par `proseServeur`. Le code reste là pour qui veut
  s'y brancher.
- **Stocker la phrase rendue et la traduire à la lecture.** Une phrase ne se traduit pas ; seule une
  donnée se rend.
- **Une colonne de langue sur `customers`** (question 2). Elle demande une saisie que personne ne
  fait aujourd'hui ; le repli explicite sur `fr` est vrai pour la population servie. À rouvrir si un
  besoin mesuré apparaît.
- **Exiger un opt-in explicite avant un SMS transactionnel** (question 3). Le SMS sert l'exécution
  d'un bail ou d'une demande de visite que le contact a lui-même engagée ; un message non
  transactionnel reste interdit.
- **Aucun repli de gabarit `wo` → `fr`** (question 4). Un wolophone hors fenêtre de 24 h
  basculerait toujours en SMS, faute de gabarit wolof chez Meta (non mesuré). Le repli ne touche que
  le gabarit ; le texte libre et le SMS restent en wolof.
- **Canaux mobiles désactivés par défaut partout** (question 1). C'est l'état actuel, et il équivaut à
  ne jamais les envoyer : personne ne coche une case dont il ignore l'existence.
- **Convertir les 29 classes `Notification` existantes en codes.** Elles passent déjà par `lang/` et
  sont rendues dans la langue du destinataire à l'envoi ; elles gagnent une cible dérivée. Hors de ce
  ticket.

## Application

- Socle : `app/Domain/Notifications/NotificationCode.php`, `app/Services/Notifications/{NotificationRenderer,NotificationTarget,ContactSansCompte}.php`,
  `app/Notifications/CodedNotification.php`, `NotificationService::send()`,
  `app/Http/Resources/AppNotificationResource.php`.
- Erreurs : `app/Exceptions/ApiError.php`, `app/Support/helpers.php`, le rappel `render` de
  `bootstrap/app.php`, `lang/{fr,en,wo}/errors.php`.
- Gardes : `tests/Unit/Architecture/ProseLitteraleInterditeTest.php`,
  `tests/Unit/Lang/LangGroupParityTest.php`, `tests/Unit/Notifications/MobileClassEventsTest.php`,
  `scripts/check-notification-codes.mjs` (étape de `repo-ci.yml`).
