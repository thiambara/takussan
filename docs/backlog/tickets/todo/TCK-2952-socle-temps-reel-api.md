---
id: TCK-2952
title: "Le socle temps réel de l'API : Reverb, un émetteur unique, un registre des canaux, un signal sans donnée"
status: todo
phase: P1
family: back
estimate: M
wave: 93
created: 2026-11-17
updated: 2026-11-17
depends_on: []
blocks: [TCK-2953, TCK-2954, TCK-2955, TCK-2956]
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md#18-conversation-
tags: [back, temps-reel, reverb, broadcasting, messagerie, securite, adr-0129]
---

## Objectif utilisateur

- **Toute personne connectée à `/app`** : l'écran qu'elle regarde peut apprendre qu'un objet a changé
  sans relire l'API toutes les 3 s, et rien de ce qui transite par le temps réel ne lui apprend une
  donnée qu'elle ne pourrait pas relire elle-même.

## Contrat de données

Aucune migration. Les décisions sont celles d'[ADR-0129](../../../adr/0129-le-socle-temps-reel-signale-et-l-api-sert.md)
§§ 1 à 3 : ce ticket les applique, il ne les rediscute pas.

Relevé sur l'arbre du 2026-11-17 :

- `laravel/reverb` n'est pas installé. `config/broadcasting.php` décrit déjà une connexion `reverb`,
  et `phpunit.xml` force `BROADCAST_CONNECTION=null`.
- `routes/channels.php` ne déclare que `App.Models.User.{userId}`. Il est chargé par
  `withRouting(channels:)` dans `bootstrap/app.php`, donc la route d'autorisation est
  `/broadcasting/auth`, dans le groupe `web`, hors du CORS `api/*`.
- **Deux événements diffusés** : `App\Events\NewMessage`, déclenché par personne, qui embarque le
  message entier ; `App\Events\NewNotification`, déclenché par `NotificationService::send()`
  (`app/Services/Model/NotificationService.php`, vers la ligne 117), qui porte le titre, le corps et
  `data` de la notification.
- **Un troisième chemin de diffusion, que l'ADR ne nomme pas** : des classes de `app/Notifications/`
  ajoutent le canal `'broadcast'` à leur `via()` ou définissent `toBroadcast()`. L'inventaire se
  prend par `grep -rlE "'broadcast'|toBroadcast|BroadcastMessage" app`, jamais par un compte recopié.
  Au 2026-11-17, il rend 15 notifications et `VisitNotifier`, dont **`CodedNotification`**, celle de
  `NotificationService::send()` : son `via()` ajoute `'broadcast'` quand la préférence « push » de
  l'événement est permise, et l'associe à `NotificationChannel::Push`. Laravel les diffuse par
  `BroadcastNotificationCreated`, une classe du framework, avec tout `toArray()`, sur
  `App.Models.User.{id}`. Elles ne fuient aujourd'hui que parce que la production est en
  `BROADCAST_CONNECTION=null`. Le jour où Reverb tourne, elles diffuseraient de la donnée.

Ce que le ticket crée, côté code :

- `App\Support\TempsReel\SignalTempsReel` : le seul événement diffusé (`ShouldBroadcastNow`),
  `broadcastAs()` = `signal`, `broadcastWith()` =
  `{subject: "<type>:<id>", event: "<code>", cursor: "<instant>"}`.
- `App\Support\TempsReel\CodeDeSignal` : l'enum des codes connus. Le lot 0 pose les six codes du
  tableau de TCK-2955 : `message.created`, `message.updated`, `conversation.read`,
  `participants.updated`, `boite.updated`, `notifications.updated`. Ce ticket n'émet que le dernier.
- `App\Support\TempsReel\CanauxTempsReel` : le registre fermé. Chaque type est associé à un modèle
  et à une fermeture qui juge la lecture pour un `User`. Le lot 0 n'y inscrit qu'**un** type,
  `conversation` → `Conversation`, jugé par `ConversationAccess::allows`. Les autres types arrivent
  avec leurs lots, une ligne chacun.
- `App\Support\TempsReel\TempsReel` : l'émetteur, avec `signaler(Model $sujet, CodeDeSignal $code)`
  vers `sujet.{type}.{id}`, et `signalerA(User|int|iterable $utilisateurs, CodeDeSignal $code, ?Model $sujet = null)`
  vers `utilisateur.{id}` de chacun. Le `subject` est le sujet s'il est donné, sinon `utilisateur:{id}`. Il
  offre aussi `TempsReel::fake()`, avec des assertions `assertSignale(...)` et `assertRienSignale()`.
- `App\Support\TempsReel\EmetDesSignaux` : le trait de modèle, qui déclare quels événements
  Eloquent émettent quel code sur quel sujet, et appelle l'émetteur.

## Contraintes strictes (métier)

- **Le signal ne porte que trois clés, et aucune n'est une donnée.**
  - `subject` vaut `<type>:<id entier>`, où `type` est un type du registre ou `utilisateur` ;
  - **sur `sujet.{type}.{id}`**, c'est l'objet du canal lui-même ;
  - **sur `utilisateur.{id}`**, c'est l'objet qui a changé (par exemple `conversation:42` pour
    `boite.updated`), **identique pour tous les destinataires** d'un même envoi, puisqu'un envoi n'a
    qu'une charge utile. Sans objet, c'est `utilisateur:{id}`, et l'envoi n'a alors qu'un seul
    destinataire. Le front s'abonne à son canal personnel et trie par `event`.
    *(Décision de ce ticket.)*
  - `event` est une valeur de `CodeDeSignal` ;
  - `cursor` est l'instant d'émission côté serveur, en UTC, au format ISO 8601 à la microseconde
    (`2026-11-17T10:00:00.123456Z`). Une forme fixe se compare comme une chaîne : le front ignore un
    signal dont le `cursor` est inférieur ou égal au dernier qu'il a vu pour ce couple
    `(subject, event)`.
  - *(Décision de ce ticket : l'ADR dit « horodatage ou version » sans trancher.)*
- **Aucun autre code ne diffuse.** Sont supprimés :
  - `NewMessage` ;
  - `NewNotification`, dont l'appel dans `NotificationService::send()` devient
    `TempsReel::signalerA($to, CodeDeSignal::NotificationsUpdated)` ;
  - le canal `'broadcast'` et `toBroadcast()` de toutes les notifications de l'inventaire. Leurs
    canaux `database`, `mail`, WhatsApp et SMS ne changent pas.
  - Pour `CodedNotification`, la préférence « push » reste une préférence (`PreferenceResolver`),
    mais n'ouvre plus aucun canal : il n'y a pas de push hors application (ADR-0129, « Ce que ça ne
    règle pas »). Ce qui lisait `'broadcast'` comme `Push` dans le journal de livraison est relu et
    ajusté.
- **Les canaux sont ceux du registre, et rien d'autre.** `routes/channels.php` déclare
  `sujet.{type}.{id}` et `utilisateur.{id}` :
  - le `type` est cherché dans `CanauxTempsReel` **avant** toute résolution, et un type inconnu est
    refusé ;
  - aucun nom venu du client n'est jamais appelé comme méthode ou comme classe ;
  - un `id` sans modèle est refusé ;
  - `App.Models.User.{userId}` disparaît.
- **La présence ne publie que l'identifiant.** Le même canal sert en privé (`private-sujet.*`) et en
  présence (`presence-sujet.*`). La fermeture rend `['id' => $user->id]` à un lecteur, et rien
  d'autre : ni nom, ni avatar. Le front tient déjà les noms par la liste des participants qu'il
  relit. *(Décision de ce ticket : l'ADR ne dit pas ce que porte un membre de présence, et « aucun
  nom » l'impose.)*
- **L'autorisation passe par `POST /api/broadcasting/auth`**, sous `auth:sanctum` et le groupe
  `api`, donc sous `ResolveActiveProfile` :
  - `Broadcast::routes(['prefix' => 'api', 'middleware' => ['api', 'auth:sanctum']])` ;
  - le paramètre `channels:` est retiré de `withRouting()`, et `routes/channels.php` est chargé par
    `withBroadcasting()` (ou équivalent) avec ces options ;
  - l'ancienne `/broadcasting/auth` du groupe `web` n'existe plus.
- **Aucune autorisation pendant une impersonation** : toute autorisation de canal rend 403, y
  compris `utilisateur.{id}` de la cible. C'est la défense en profondeur de la coupure côté front
  (ADR-0129 § 4), puisque le relais `/api/impersonation/proxy` accepte aussi `POST`.
  - Le contexte est lié par `EnforceImpersonationReadOnly`, en fin du groupe `api`, qui refuse déjà
    les écritures.
  - L'implémenteur relève si ce middleware refuse le `POST` d'autorisation à lui seul, ou s'il faut
    une vérification explicite dans `routes/channels.php` (`ImpersonationContext::active()`).
  - L'ablation de l'AC2 porte sur **le mécanisme qui refuse réellement**.
- **L'émission attend le COMMIT** :
  - elle passe par `DB::afterCommit()`, et part immédiatement s'il n'y a pas de transaction ;
  - une transaction annulée n'émet rien ;
  - le test passe par une **vraie** transaction, seul le transport est remplacé.
- **Elle est synchrone, avec un délai d'1 s.** Le délai est posé dans les options du client de la
  connexion `reverb` de `config/broadcasting.php` (`timeout` et `connect_timeout`, sous
  `client_options`). Rien ne passe par la file.
- **Un échec d'émission est avalé, journalisé et compté**, et ne fait jamais échouer la requête :
  - un `Log::warning` avec le canal et le code seulement ;
  - `Cache::increment('temps-reel:echecs:'.<date du jour>)` ;
  - aucune exception ne remonte.
- **Une requête ne paie le délai qu'une fois.**
  - Plusieurs destinataires d'un même `(sujet, code)` partent dans **un** signal adressé à
    plusieurs canaux, par paquets de 100, la limite d'un appel du protocole Pusher. Ils ne partent
    pas en N appels.
  - Après un premier échec dans une unité de travail, l'émetteur n'essaie plus jusqu'à la fin de
    cette unité, et compte chaque signal abandonné comme un échec.
  - Sans ces deux règles, un groupe de 30 participants, Reverb absent, coûterait 30 s à la
    requête.
- **Dédoublonnage par unité de travail.** Un même `(canal, sujet, code)` part une seule fois par
  requête ou par job :
  - le magasin du dédoublonnage est lié en `scoped` dans le conteneur, pour qu'un worker de file ne
    garde pas d'un job à l'autre la trace des signaux déjà émis ;
  - deux jobs successifs du même worker émettent donc chacun leur signal.
- **Le test 403 ne doit pas être vide.**
  - `NullBroadcaster::auth()` n'évalue aucun canal (corps vide, lu dans `vendor/`). Sous le
    `BROADCAST_CONNECTION=null` de la suite, tout test d'autorisation passerait sans rien juger.
  - Les tests d'autorisation basculent donc la connexion sur `reverb`, avec des clés factices dans
    le test : le diffuseur de Pusher signe la réponse localement, sans réseau.
  - Chaque cas a un **témoin positif** : le lecteur reçoit 200, avec une signature `auth`.

## Delta à produire

- [ ] `composer require laravel/reverb`, puis la configuration publiée (`config/reverb.php`), sans
      toucher à `.env.example` ni à `.env.docker`, que TCK-2953 garnit
  - ⚠ `scripts/check-env-production.mjs` lit les `env()` de `config/`, et exige que chaque clé lue
    soit dans `.env.example` ou dans ses `RESIDUS`. Les clés neuves de `config/reverb.php`
    (`REVERB_SERVER_*`, `REVERB_SCALING_*`, `REVERB_APP_PING_INTERVAL`…) entrent donc dans
    `RESIDUS`, sous un motif qui dit « Reverb installé, serveur posé par TCK-2953 et TCK-2956 ».
    Sinon la Repo CI de ce ticket rougit.
- [ ] `config/broadcasting.php` : options du client de la connexion `reverb` (délai 1 s)
- [ ] `app/Support/TempsReel/` : `SignalTempsReel`, `CodeDeSignal`, `CanauxTempsReel`, `TempsReel`
      (avec `fake()`), `EmetDesSignaux`, et le magasin de dédoublonnage lié en `scoped`
- [ ] `routes/channels.php` réécrit sur le registre (`sujet.{type}.{id}`, `utilisateur.{id}`)
- [ ] `bootstrap/app.php` : les routes de diffusion sous `api` et `auth:sanctum`, sans la route `web`
- [ ] Suppression de `app/Events/NewMessage.php` et de `app/Events/NewNotification.php` ;
      `NotificationService::send()` émet `notifications.updated` par l'émetteur
- [ ] Les notifications de l'inventaire, `CodedNotification` comprise : retrait du canal
      `'broadcast'` et de `toBroadcast()`
- [ ] `tests/Unit/Architecture/DiffusionParLeSignalSeulTest.php` :
  - toute classe de `app/` qui implémente `ShouldBroadcast` ou `ShouldBroadcastNow` est
    `SignalTempsReel` ;
  - son `broadcastWith()` a exactement les clés `subject`, `event`, `cursor` ;
  - aucune classe de `app/` (pas seulement `app/Notifications/`) ne rend `'broadcast'` dans `via()`
    ni ne définit
    `toBroadcast()` ;
  - aucun appel à `broadcast(`, `Broadcast::event(` ou `event(new …Broadcast…)` hors de `TempsReel`.
  - La liste des cibles balayées n'est pas vide (non-vacuité).
- [ ] `tests/Feature/TempsReel/AutorisationDesCanauxTest.php` :
  - un jeu de données **dérivé du registre** : chaque type de `CanauxTempsReel` fournit un lecteur et
    un non-lecteur. Un type ajouté sans fixture fait rougir le test ;
  - pour chaque type : le non-lecteur reçoit 403 et le lecteur 200, en privé comme en présence ;
  - pour `utilisateur.{id}` : soi-même 200, un autre 403 ;
  - un type hors registre rend 403 ;
  - sans jeton : 401 ;
  - sous impersonation : 403 ;
  - `POST /broadcasting/auth` (hors `api`) rend 404.
- [ ] `tests/Feature/TempsReel/EmetteurTest.php` :
  - commit : 1 signal ; rollback : 0 ;
  - deux appels identiques dans une requête : 1 envoi ;
  - deux jobs du même processus : 2 envois ;
  - un transport qui lève : la requête rend son code normal, le compteur du jour vaut 1, et le
    journal ne porte ni contenu ni nom ;
  - `NotificationService::send()` émet `notifications.updated` vers `utilisateur.{id}` du
    destinataire, et rien d'autre.

## Critères d'acceptation

- [ ] **AC1 — Trois clés, pas une de plus.** Le test d'architecture casse si l'on ajoute une
      quatrième clé à `broadcastWith()`, si une classe neuve implémente `ShouldBroadcastNow`, ou si
      une notification remet `'broadcast'` dans son `via()`. Chacune des trois mutations est faite
      à la main, constatée rouge, puis retirée ; les trois sont notées dans les notes
      d'implémentation.
- [ ] **AC2 — La non-fuite se prouve par ablation.** La fermeture de `sujet.{type}.{id}` est
      remplacée par `fn () => true` : le test 403 rougit pour **chaque** type du registre. La
      mécanisme qui refuse sous impersonation (cf. Contraintes) est retiré : le cas « sous
      impersonation » rougit.
- [ ] **AC3 — Le test 403 juge vraiment.** Le témoin positif (lecteur → 200 avec `auth`) passe. La
      même classe, exécutée sous `BROADCAST_CONNECTION=null` sans la bascule du test, voit ses 403
      tomber : la preuve que la bascule est ce qui fait juger.
- [ ] **AC4 — Après le COMMIT.** Dans une vraie transaction annulée, `TempsReel::fake()` ne voit
      aucun signal. Le même code validé en voit un. Remplacer `afterCommit` par un envoi immédiat
      fait rougir le cas « rollback ».
- [ ] **AC5 — Un échec ne casse rien.** Un transport qui lève une exception, ou qui dépasse le
      délai, laisse la requête répondre son code nominal. Le compteur `temps-reel:echecs:<jour>`
      s'incrémente.
- [ ] **AC5 bis — Un seul délai par requête.**
  - `signalerA()` vers 150 personnes fait deux envois au transport, un de 100 canaux et un de 50.
  - Un transport qui échoue au premier envoi n'est plus appelé dans la même requête. Le compteur
    compte les deux signaux.
  - Retirer le disjoncteur fait rougir le test.
- [ ] **AC6 — Le dédoublonnage ne survit pas au job.** Le cas « deux jobs, deux envois » rougit si le
      magasin est lié en `singleton` au lieu de `scoped`.
- [ ] **AC7 — L'ancienne route n'existe plus.** `POST /broadcasting/auth` rend 404, et
      `POST /api/broadcasting/auth` sans jeton rend 401.
- [ ] **AC8 — Rien d'autre ne change à l'API.**
  - `php bin/impacted-tests.php --run` est vert, plus les classes ci-dessus et
    `NotificationService*Test` ;
  - les tests des notifications touchées passent sans leur canal `broadcast` ;
  - `./vendor/bin/pint` est propre ;
  - `node scripts/check-env-production.mjs` et `node scripts/check-env-parity.mjs` sont verts.

## Hors périmètre

- Le service Reverb en développement, et toutes les clés d'environnement : TCK-2953.
- Le client front : TCK-2954. Les émissions de la messagerie (message, lecture, participants,
  boîte) : TCK-2955. Ce ticket ne pose que l'appel de `NotificationService`.
- La préproduction : TCK-2956.
- Les types du registre autres que `conversation` (bail, intervention, paiement…) : leurs lots.
- Le désabonnement forcé d'un abonné qui perd ses droits : accepté par l'ADR.
- L'exposition du compteur d'échecs dans la console de santé.
- `toOthers()` et l'en-tête `X-Socket-ID` : l'émetteur d'un geste reçoit aussi son signal, et sa
  relecture est sans effet.

## Notes d'implémentation

_(à remplir par implementing-specs)_
