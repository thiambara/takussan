# ADR-0072 — Une écriture rejouée sous la même `Idempotency-Key` rend la réponse de la première, par un intergiciel commun

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Tickets** : aucun ticket encore — pistes P144.01 à P144.08 (angle 144 du fichier de pistes)
- **Généralise** : la clé d'achat des boosts de [TCK-822](../backlog/tickets/TCK-822-achat-de-boost-idempotent.md),
  qui reste en place (§ 8)

## Contexte

L'angle 144 du fichier de pistes a été relevé le 2026-10-22 par l'explorateur, puis re-mesuré par le
mesureur sur `83f10e21d`. Le test était temporaire (`tests/Feature/TmpMesure/RejeuMesureTest.php`,
retiré depuis). Il envoie deux fois le même `POST`, à 30 s d'écart par `travel`, avec une charge de
2,41 sur 8 cœurs. Il établit ce que l'API fait d'un rejeu, pas la fréquence des réponses perdues en
production.

| Route | Rejeu | Ce qui est écrit |
|---|---|---|
| `POST /api/conversations/{id}/messages` (P144.02) | 201, 201 | deux messages dans le fil |
| `POST /api/bookings` (P144.03) | 201, 201 | deux réservations `pending`, deux notifications au bailleur |
| `POST /api/public/properties/{slug}/booking-request` (P144.03) | 201, 201 | deux réservations pour un client, deux notifications |
| `POST /api/bookings/{id}/payments` (P144.04) | 201, 201 | deux encaissements `paid`, reçus `RCP-1PPKS1` et `RCP-L3N1ME` |
| `POST /api/invoices` (P144.05) | 201, 201 | deux factures `draft` (`INV-202610-JAEXVD`, `INV-202610-90RAEU`), sans numéro légal |
| `POST /api/maintenance-requests` (P144.06) | 201, 201 | deux interventions, deux notifications |
| `POST /api/public/properties/{slug}/contact-lead` (P144.08) | 201, 201 | deux demandes |

Rien, côté front, n'empêche ce rejeu. Tout y invite :

- **Le formulaire garde sa saisie après un échec.** `useApiForm` affiche le message dans
  `globalError` sur toute erreur autre qu'un 422. Il ne remet le formulaire à zéro que sur succès et
  réactive le bouton dans un `finally` (`takussan-web/src/hooks/useApiForm.ts:262-299`). Une coupure
  réseau, un 502 ou un 504 du mandataire laissent la saisie intacte et le bouton actif.
- **Le rejeu vient de l'utilisateur, jamais de la bibliothèque.** Les mutations ne sont pas
  rejouées (`retry: false`, `takussan-web/src/lib/query-client.ts:28`). C'est le clic de
  l'utilisateur qui rejoue, et l'écran l'y invite.
- **Le front ne sait pas distinguer un refus d'une écriture peut-être faite.** `apiRequest` lève
  `ApiError` sur tout statut non 2xx (`takussan-web/src/lib/api.ts:797-798`), et `fetch` lève sur une
  coupure.
- **Depuis P79.01, le serveur Next abandonne de lui-même une écriture lente.** TCK-1215 (#972,
  fusionnée) borne tout appel serveur d'`apiRequest` à 30 s, et à 90 s pour un `formData`
  (`api.ts:36-39`, appliqué en `api.ts:792`). Les actions serveur de
  `takussan-web/src/app/actions/property.ts` passent par là : réservation, offre, message, contact.
  Une écriture que l'API finit après la borne est rendue au visiteur comme un échec
  (`{ ok: false }`), et il la rejoue (P144.07, déduit, non mesuré).

**Une seule route sait aujourd'hui reconnaître un rejeu : l'achat de boost (TCK-822).**
`StorePropertyBoostRequest::idempotencyKey()` lit l'en-tête `Idempotency-Key`
(`takussan-api/app/Http/Requests/Credits/StorePropertyBoostRequest.php:28-34`).
`BoostPurchaseService::purchaseOnce()` range ensuite la clé en cache, par espace, pendant 24 h
(`takussan-api/app/Services/Boost/BoostPurchaseService.php:49-115`). La clé se lit et s'écrit sous le
verrou de l'espace, dans la transaction de l'achat. Un rejeu rend 200 et le boost relu (`fresh()`),
et la même clé pour un autre achat rend 422 `boost.idempotency_key_reused`. Côté front,
`BoostDialog` engendre un UUID à l'ouverture (`takussan-web/src/components/boost/BoostDialog.tsx:37-52`),
et `useBuyBoost` l'envoie dans l'en-tête (`takussan-web/src/components/boost/api.ts:41-49`).

`grep -rn -i idempotency app routes` (hors webhooks) ne rend que ces deux fichiers. Aucun
intergiciel ni aucune option de `useApiMutation` ne permet à une autre route de reprendre la
forme. La forme de TCK-822 est d'ailleurs propre à son service : elle rejoue en relisant un
`PropertyBoost` qu'elle connaît. CORS accepte déjà tout en-tête (`allowed_headers => ['*']`,
`takussan-api/config/cors.php:27`).

Le cache applicatif est `redis` en préproduction (`docs/infra/prod-drivers.json`, relevé du
2026-09-14) et `array` dans la suite (`takussan-api/phpunit.xml:26`). Ce Redis a 128 Mo, en
`volatile-lru` : seules les clés **à durée de vie** sont évincées sous pression mémoire
(`deploy/takussan/compose.api.yml:67-74`).

Le porteur a tranché le 2026-10-22 (statuts de P144.01 à P144.08). Il retient une brique commune
sur le modèle de TCK-822, appliquée à chaque route mesurée, sans `client_id` propre au message et
sans rapprochement des réservations par client, bien et dates. Les visites se rapprochent par
(visiteur, bien, créneau) dans `VisitSchedulingService::createOrFail`, **sans** la brique (P144.08).

## Décision

**Une route d'écriture qui porte l'intergiciel `idempotent` rejoue, telle quelle, la réponse 2xx
qu'elle a déjà rendue pour la même `Idempotency-Key` du même auteur pendant 24 h. Elle refuse en 422
la même clé présentée pour une autre requête. Côté front, une option de `useApiMutation` engendre la
clé à l'ouverture du formulaire et la garde jusqu'au succès.**

### 1. L'en-tête

- **Nom** : `Idempotency-Key`, celui de TCK-822 et du brouillon IETF
  `draft-ietf-httpapi-idempotency-key-header`.
- **Facultatif**, comme pour le boost. Sans l'en-tête, ou avec un en-tête vide après `trim`, la
  route se comporte exactement comme avant. Aucun appelant existant ni aucun test existant ne
  change.
- **Forme** : de 8 à 255 caractères pris dans `[A-Za-z0-9._:-]`. Un UUID et la clé composée du
  boost (`<uuid>-<id>`) y entrent. Hors de cette forme, la réponse est 422
  `idempotency.key_invalid`, rien n'est écrit, et l'erreur signale un défaut de l'appelant au lieu
  de le taire.

### 2. La portée de la clé

- **L'auteur** est l'utilisateur authentifié (`$request->user()`). Sur une route anonyme
  (`contact-lead`), c'est `anonyme`. La clé est un UUID v4 que seul le navigateur de son auteur
  connaît, et elle ne désigne qu'un seul envoi.
- **La route** est son nom (`conversations.messages.store`, `invoices.store`…), pas son URI.
- **La clé de cache** est `idempotency:<auteur>:<nom de route>:<sha256 de la clé>`. La clé n'est
  jamais rangée en clair, comme pour le boost (`BoostPurchaseService.php:91-94`).

### 3. Même clé, autre requête : 422

Une **empreinte** est rangée avec la réponse. C'est le `sha256` de cinq éléments :

- la méthode ;
- le chemin résolu, paramètres compris (`/api/conversations/12/messages`) ;
- l'identifiant du profil actif (`request()->activeProfile()`, ADR-0004) ;
- l'entrée de la requête (`$request->all()`, clés triées récursivement, encodée en JSON) ;
- le `sha256` du contenu de chaque fichier envoyé, sous le nom de son champ.

Une même clé qui arrive avec une autre empreinte est refusée en **422 `idempotency.key_reused`**,
et rien n'est écrit. C'est le cas d'un autre fil, d'un autre corps, d'un autre profil ou d'un
autre fichier.

Le profil actif entre dans l'empreinte, et non dans la portée, pour deux raisons. La clé reste
« par utilisateur », comme l'a décidé le porteur. Et une clé présentée sous le profil d'une autre
agence est refusée au lieu de rejouer une réponse écrite pour la première (principe n° 2 :
l'agence est la frontière d'isolation).

Les fichiers entrent dans l'empreinte parce que les notes vocales passent par la route des
messages en `multipart` (`useSendVoiceNote`, `takussan-web/src/lib/queries/conversations.ts:299-305`).

### 4. Ce qui se range et ce qui se rejoue

- **Seule une réponse 2xx se range.** Le reste repasse : 4xx et 5xx ne laissent ni réponse ni
  empreinte en cache.
  - **Le 422 de validation surtout.** `useApiForm` garde la clé jusqu'au succès (§ 6).
    L'utilisateur corrige sa saisie et la renvoie sous la même clé. Si le 422 avait rangé une
    empreinte, la saisie corrigée serait refusée comme une autre requête.
  - **401, 403, 404, 409, 429** dépendent d'un état qui change : la session, le profil, la
    double authentification de TCK-589 (que `useApiMutation` rejoue avec les mêmes en-têtes), le
    limiteur.
  - **5xx** : la transaction de l'écriture est présumée défaite. Le 500 rendu **après** un geste
    fait relève de l'angle 123, pas de cette décision.
- **Ce qui se range** : le statut, le corps brut et le `Content-Type`. Jamais `Set-Cookie`, ni
  aucun autre en-tête.
- **Le rejeu rend le même statut et le même corps**, plus un en-tête `Idempotent-Replayed: true`.
  Il n'est pas exposé en CORS (`exposed_headers => []`) : il sert aux tests et aux journaux, le
  front n'en a pas besoin.
- **Le rejeu rend la réponse d'hier, et non l'état d'aujourd'hui.** C'est la seule forme générique
  possible : un intergiciel ne sait pas relire une ressource qu'il ne connaît pas. Le boost
  relisait la sienne (`fresh()`), cet intergiciel ne le fait pas. Le front invalide ses requêtes
  au succès, et c'est la relecture qui montre l'état courant. Un message rejoué porte le même `id`,
  et `mergeNewMessages` dédoublonne par `id` (`conversations.ts:151-160`).

### 5. Deux requêtes simultanées : un verrou, puis 409

C'est le cas que P144.07 rend probable. Le serveur Next abandonne à 30 s, l'API travaille encore,
et le visiteur rejoue.

- L'intergiciel prend `Cache::lock('idempotency-lock:<…même suffixe…>', 120)` **sans attendre**,
  avant de passer la requête au contrôleur. Il le rend dans un `finally`.
- **Un second envoi qui trouve le verrou pris reçoit 409 `idempotency.in_progress`**, sans rien
  écrire, comme le prévoit le brouillon IETF. Il ne bloque pas de processus PHP pendant que le
  premier finit. Le front garde sa clé, et l'essai suivant reçoit le rejeu.
- **La durée du verrou est de 120 s**, au-dessus de la plus longue borne du serveur Next (90 s
  pour un `formData`). Elle n'existe que pour qu'un processus mort ne fige pas la clé.
- **Ordre des contrôles** : verrou, puis lecture de la réponse rangée, puis comparaison de
  l'empreinte, puis exécution.

### 6. Le stockage : le cache applicatif, 24 h, sans migration

- `Cache::put(…, now()->addHours(24))`, après la réponse 2xx, dans une constante de l'intergiciel
  (`IDEMPOTENCY_TTL_HOURS = 24`, comme pour le boost). La fenêtre court à partir de la première
  réponse.
- **Pas de table.** C'est la forme qui existe déjà. Elle ne demande aucune migration. Et
  l'éviction de Redis ne fait jamais pire qu'aujourd'hui (§ Conséquences).
- **Redis indisponible** : la requête échoue comme échouent déjà le limiteur et la session, qui
  dépendent du même Redis. Aucun repli sans clé.

### 7. Le front

**L'option de `useApiMutation`** (`takussan-web/src/hooks/useApiQuery.ts`) s'appelle
`idempotence: true`.

- La clé naît au montage du hook (`crypto.randomUUID()`), c'est-à-dire à l'ouverture du
  formulaire qui l'appelle.
- Elle part dans `Idempotency-Key` à chaque `mutate`. Un en-tête `Idempotency-Key` déjà posé par
  `request.headers` l'emporte (c'est le cas du boost).
- Elle reste la même d'un essai à l'autre tant qu'aucun envoi n'a réussi, quelle que soit l'erreur
  (réseau, 5xx, 409, 422 de validation).
- Elle est renouvelée sur succès.
- Elle est aussi renouvelée sur 422 `idempotency.key_reused`. Cela veut dire que l'utilisateur a
  modifié une saisie dont le premier envoi est arrivé : le message de l'API le lui dit, et
  l'envoi suivant est une écriture neuve.
- Le hook rend le moyen de renouveler la clé à la main. C'est pour un composant qui survit à son
  formulaire, comme un dialogue qui reste monté fermé : il la renouvelle à la fermeture, comme
  `BoostDialog`.

**Les actions serveur de `property.ts` reçoivent la clé en argument, et ne l'engendrent jamais.**

- Une clé engendrée dans l'action serait neuve à chaque appel, donc à chaque clic : elle ne
  protégerait de rien.
- Le composant client du formulaire engendre la clé une fois par soumission voulue, la garde tant
  que l'action rend `{ ok: false }`, et la renouvelle sur `{ ok: true }`.
- L'action la transmet dans `Idempotency-Key` à `apiRequest`.
- Le porteur a choisi cette voie plutôt qu'un délai plus long pour les écritures. Un délai plus
  long ne fait que déplacer le seuil où une écriture finie est rendue comme un échec.

### 8. Ce que cette décision ne touche pas

- **L'achat de boost** garde sa clé dans la transaction, sous le verrou de l'espace
  (TCK-822). Il ne passe pas par l'intergiciel. Sa garantie est plus forte : la clé est posée avant
  le COMMIT, et aucun intervalle ne la sépare de l'écriture.
- **Les visites** (P144.08) se rapprochent par (visiteur, bien, créneau), sans la brique.
- **Les signalements et les avis** de `property.ts` (`report`, `reviews`, `reply`). L'angle 144
  ne les a pas relus : ils n'entrent dans aucun lot.
- **Les webhooks entrants**, qui ont leur propre idempotence (`DlrReportApplier`,
  `PaymentGatewayService`).
- **Les règles de rapprochement métier** : aucune réservation `pending` n'est rendue à la place
  d'une autre (P144.03), aucun message n'a de `client_id` (P144.02).

## Conséquences

- **Le doublon d'un rejeu disparaît sur les routes équipées, sans règle métier neuve.** Un visiteur
  qui refait volontairement une demande obtient une nouvelle clé, donc une seconde écriture,
  comme aujourd'hui.
- **Un intervalle reste ouvert entre le COMMIT et le `Cache::put`.** Si le processus meurt
  entre les deux, le verrou expire et un rejeu écrit une seconde fois. Le boost n'a pas cet
  intervalle. C'est le prix d'une brique qui ne connaît pas la transaction de la route.
- **L'éviction de Redis rouvre le doublon, sans erreur.** Sous pression mémoire, `volatile-lru`
  évince d'abord des clés à durée de vie, celles-ci comprises. Un rejeu après l'éviction
  redevient une écriture neuve : c'est le comportement d'aujourd'hui, jamais pire. Les réponses
  rangées sont celles de routes qui créent une seule ressource. Leur poids se mesure au premier
  lot, à côté des 1,65 Mo relevés le 2026-10-18 (`compose.api.yml:70`).
- **Un rejeu consomme le limiteur.** L'intergiciel se place après `throttle` : le limiteur protège
  aussi le cache. Sur `contact-lead` (5 par 10 min), un rejeu compte pour un envoi.
- **Le rejeu montre l'état de la première réponse.** Une réservation confirmée entre-temps est
  rejouée `pending`. C'est le front qui relit l'état courant, en invalidant ses requêtes.
- **Deux formes d'idempotence coexistent** : celle du boost, dans son service, et l'intergiciel.
  C'est délibéré (§ 8), mais un lecteur doit savoir que la seconde ne remplace pas la première.
- **Trois codes neufs à traduire** (ADR-0032) dans `lang/{fr,en,wo}/errors.php` :
  `idempotency.key_invalid`, `idempotency.key_reused` et `idempotency.in_progress`. En `wo`, on
  écrit le texte français tel quel, le wolof étant en pause depuis le 2026-10-16.
- **Un en-tête que personne n'envoie ne protège de rien.** L'en-tête est facultatif, donc la
  garde d'une route doit vérifier aussi que son appelant l'envoie (§ Application).

## Application

**Où la brique vit**

- `takussan-api/app/Http/Middleware/EnsureIdempotentWrite.php`. L'alias `idempotent` s'ajoute dans
  `takussan-api/bootstrap/app.php`, à côté de `boost.impressions`. L'intergiciel se pose route par
  route, après `auth:sanctum` et `throttle` :
  `->middleware(['throttle:conversation-message', 'idempotent'])`.
- `takussan-web/src/hooks/useApiQuery.ts` : l'option `idempotence` de `useApiMutation`.
- `takussan-web/src/app/actions/property.ts` : un argument `cleIdempotence` sur les actions
  concernées, et leurs composants appelants.

**Les gardes, chacune vérifiée par ablation**

- `takussan-api/tests/Feature/Middleware/EnsureIdempotentWriteTest.php` doit couvrir :
  - le rejeu (même statut, même corps, `Idempotent-Replayed`, une seule ligne) ;
  - une autre empreinte (422 `idempotency.key_reused` : autre corps, autre chemin, autre profil,
    autre fichier) ;
  - le 422 de validation non rangé (la saisie corrigée passe sous la même clé) ;
  - le verrou pris (409 `idempotency.in_progress`) ;
  - l'absence d'en-tête (deux lignes, comme avant) ;
  - la forme invalide (422 `idempotency.key_invalid`) ;
  - 25 h plus tard (`travel`), une écriture neuve.
- `takussan-api/tests/Feature/Routes/IdempotentRoutesTest.php` porte la **liste écrite** des noms
  de route équipés, et vérifie que chacun porte `idempotent` (`gatherMiddleware()`). La liste
  grandit à chaque lot. Une route renommée ou dépouillée rougit.
- Par route : le scénario mesuré de l'angle 144 rejoué sous la même clé doit compter une ligne, et
  une notification là où il en comptait deux.
- Front : un test vitest de l'option vérifie que la clé est la même après un échec, neuve après un
  succès et neuve après `idempotency.key_reused`. Pour chaque appelant équipé, un test vérifie que
  l'en-tête part. Pour chaque action serveur, un test vérifie que la clé reçue part telle quelle
  d'un essai à l'autre (la garde de P144.07).

**L'ordre des lots**

1. **La brique et les messages** (P144.01, P144.02) : l'intergiciel, l'option, les trois codes,
   `IdempotentRoutesTest`, puis `conversations.messages.store` pour le texte et la note vocale.
   C'est l'écriture la plus fréquente, et le `multipart` éprouve l'empreinte des fichiers dès le
   premier lot.
2. **Les écritures du personnel et du locataire par `useApiMutation`** (P144.03 pour
   `POST /api/bookings`, P144.04, P144.05, P144.06) : `bookings.store`,
   `POST bookings/{booking}/payments`, `invoices.store` et `maintenance-requests.store`, avec
   `useCreateBooking`, `useCreateBookingPayment`, `useCreateInvoice` et
   `useCreateMaintenanceRequest`.
3. **Les actions serveur du site public** (P144.07, P144.03 pour `booking-request`, P144.08) :
   `booking-request` (réservation et offre d'achat), `contact-message`, et `contact-lead` du bien
   et de l'agent. La clé est engendrée dans les composants clients et passée aux actions.

**Questions laissées au porteur**

- **Le boost rejoint-il un jour l'intergiciel ?** Par défaut non (§ 8). Le faire supprimerait la
  seconde forme, mais au prix de l'intervalle entre COMMIT et cache que sa forme actuelle n'a pas.
- **L'en-tête devient-il obligatoire sur une route une fois que tous ses appelants l'envoient ?**
  Par défaut non. L'obliger fermerait le cas « un appelant oublie l'en-tête ». En revanche, chaque
  test existant qui écrit sur ces routes devrait alors le porter.
- **Les signalements et les avis** (`report`, `reviews`, `reply`) : faut-il les mesurer pour les
  faire entrer dans un lot ?
