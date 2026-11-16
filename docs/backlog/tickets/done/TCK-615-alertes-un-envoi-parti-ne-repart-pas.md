---
id: TCK-615
title: "Alertes de recherche : un e-mail parti ne repart pas, le premier envoi ne vend pas l'historique comme nouveau, et un tiers n'épuise pas l'abonnement d'un contact (suites de TCK-599)"
status: done
phase: P2
family: back
estimate: M
wave: 76
created: 2026-10-08
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#23-notifications
  models:
    - docs/models-spec.md#23-savedsearch-
    - docs/models-spec.md#87-alertsubscriber-
tags: [back, alertes, recherche, favoris, file, idempotence, rate-limit, adr-0050, decision-porteur]
---

# TCK-615 — Un e-mail d'alerte parti ne repart pas

## Re-vérification du 2026-11-16 (sur dev @ 9112194ec)

**Verdict : partiellement fermé, le reste bloqué sur les trois décisions du porteur.**
`git log --grep=TCK-615` → vide.

- Fermé entre-temps : le point 3 (`$timeout` 1800 contre `retry_after` 90) par **TCK-2397**
  (0252e92ae, ADR-0078) — les deux jobs appellent `onLongQueue()` → connexion `database-long`
  (`retry_after` 1900), servie par `worker-long` ; `scripts/check-queues.mjs` compare chaque
  `$timeout` au `retry_after` de sa connexion (AC3). Nuance : sous `QUEUE_CONNECTION=redis`,
  `RunsOnLongQueue` garde la connexion par défaut (90 s) ; préproduction et production sont en
  `database`.
- Toujours vrai : points 1 (réservation rendue sur tout `Throwable`), 2 (`last_notified_at` nul à
  la création), 4 (borne de 5 demandes ouvertes, confirmées ou non), 5 (`DB::listen` seul).
- Reste à faire : amender ADR-0050 (§6, §15 — dont sa fin, périmée depuis ADR-0078 —, borne par
  contact) ; garder la réservation dès qu'un canal sortant est parti ; poser `last_notified_at` ;
  borne sur les seules demandes confirmées ; `Cache::spy()` dans la garde d'oracle.
- **Décisions attendues du porteur** : (1) après un e-mail parti, perdre la cloche (recommandé) ou
  répéter l'e-mail ? (2) le premier envoi annonce-t-il l'historique — non (recommandé) / oui ?
  (3) déni d'abonnement : éviction de la plus ancienne demande non confirmée (recommandé) / statu quo ?

## Objectif utilisateur

Un abonné reçoit chaque alerte une fois, et sa première alerte ne lui annonce pas comme « nouveaux »
des biens en ligne depuis des mois ; un visiteur peut toujours s'abonner avec son propre contact.

## Contexte

Suites de **TCK-599** (verif-599 passe 1, observations 1, 2 et 5 ; passe 2, observation sur
`retry_after` ; passe 3, « garder la réservation dès qu'un canal sortant est parti »), consignées
dans `FILE-D-ATTENTE.md` (21:00, 21:45), `TCK-599-corrections.md` (« En suite ») et la dernière ligne
du ticket 599 (« En suite : garder la réservation une fois l'e-mail parti »). Plusieurs points
touchent des décisions d'[ADR-0050](../../../adr/0050-alertes-de-recherche-un-seul-moteur-et-des-abonnes-sans-compte.md),
qui les a prises réversibles.

**Re-mesure sur `839be671` (2026-10-08)** :

1. **Un échec après l'e-mail fait repartir l'e-mail.** `SendSavedSearchAlerts` réserve la fenêtre
   (`deplacer`, `app/Jobs/SendSavedSearchAlerts.php:136-139` ; `:183-186` au 2026-11-16), puis
   `notify()` ; **tout** `Throwable` rend la réservation (`:141-146` ; `:188-194` au 2026-11-16), y compris quand l'e-mail est déjà parti et que la cloche, partie
   en dernier, échoue. Même forme dans `SendFavoriteChangeAlerts.php:159-172` (`:155-176` au 2026-11-16). verif-599 passe 3 l'a
   mesuré avec m12 (cloche en échec : `mails=3 cloches=0` sur trois passages) ; m12 est fermé par la
   borne `max:100`, la cause générale non. ADR-0050 décision 15 l'assume : « plutôt renvoyer que
   perdre ».
2. **Le premier passage n'a pas de borne basse.** `getMatchingProperties($search, $search->last_notified_at, $borne)`
   (`:124-128` ; `:169-173` au 2026-11-16) avec `last_notified_at` nul à la création : la première alerte annonce « N **nouveaux**
   biens » pour tout l'historique (ADR-0050 décision 6, verif-599 observation 1).
3. *Fermé par TCK-2397 (ADR-0078) : les deux jobs passent par `database-long` (`retry_after` 1900 >
   1800), servie par `worker-long`. Constat d'origine conservé :* **`$timeout = 1800` contre `retry_after = 90`.** `SendSavedSearchAlerts.php:83`,
   `SendFavoriteChangeAlerts.php:61` ; `config/queue.php:43` (`DB_QUEUE_RETRY_AFTER`, 90), même valeur
   pour Redis (`:71`). Laravel demande `retry_after > timeout` : un second worker re-réserve le job à
   90 s et, `$tries = 1`, le marque échoué (`MaxAttemptsExceeded`) pendant que le premier tourne. Pas
   de double envoi (réservation + `WithoutOverlapping`), mais un faux `failed_jobs`. Inerte avec un
   seul worker, ce qu'aucune configuration ne garantit.
4. **Déni d'abonnement.** `max_open_per_contact = 5`, `confirmation_ttl_hours = 48`
   (`config/search_alerts.php:20`, `:26`) : avec des IP tournantes, un tiers remplit les 5 demandes
   ouvertes d'un contact pendant 48 h, et le vrai titulaire ne peut plus s'abonner — sans le savoir,
   puisque la borne atteinte se tait (verif-599 observation 5 ; m2 fermé par le silence voulu).
5. **Garde de test incomplète.** `test_la_requete_ne_fait_que_pousser_un_job_chiffre` enveloppe la
   requête dans `DB::listen` : une lecture **de cache** dépendant du contact (ablation de verif-599
   passe 3, « lecture cache par contact ») y reste invisible et verte.

## Décision du porteur

**Tranché par le porteur le 2026-11-16** (amendement d'ADR-0050 du même jour) :

1. **Après un e-mail parti, l'alerte perd la cloche** — un e-mail parti ne repart jamais ; pas de
   répétition de l'e-mail.
2. **Le premier envoi n'annonce pas l'historique** : il ne porte que ce qui est apparu depuis la
   création de l'alerte (ou rien) — `last_notified_at` posé à la création (compte) ou à la
   confirmation (sans compte), comme recommandé ci-dessous.
3. **Déni d'abonnement : évincer la plus ancienne demande non confirmée** quand la borne par contact
   est atteinte ; la borne ne retient plus que les demandes confirmées.

*Les questions et recommandations d'origine :*

1. **Après un e-mail parti, faut-il préférer perdre la cloche ou répéter l'e-mail ?** ADR-0050 (15)
   a choisi « répéter ». *Recommandation de la session : garder la réservation dès qu'un canal
   sortant (e-mail, WhatsApp) est parti ;* une cloche manquée se voit dans l'application, un e-mail
   répété chaque matin se lit comme du spam et fait marquer l'expéditeur.
2. **Le premier envoi annonce-t-il l'historique ?** *Recommandation : non* — `last_notified_at` posé
   à la création (compte) ou à la confirmation (sans compte), comme l'ADR le propose déjà ; l'écran de
   création peut offrir « voir les biens qui correspondent déjà » par un lien de recherche.
3. **Déni d'abonnement** : *recommandation* — une nouvelle demande confirmée par son titulaire
   expulse la plus ancienne demande **non confirmée** du même contact, au lieu d'être refusée ; la
   borne ne retient plus que les demandes confirmées. Le silence (pas d'oracle) est gardé.

## Contraintes strictes (métier)

1. ADR-0050 est amendé (décisions 6, 15, et la borne par contact) avant le code. L'amendement corrige
   aussi la fin de §15 (l.221-225, « à régler le jour où l'on en ajoute »), périmée depuis ADR-0078.
2. La réservation se rend **seulement** si aucun canal sortant n'est parti ; l'ordre des canaux de
   599 (cloche en dernier, m11) est gardé.
3. *(tenu par TCK-2397, relevé 2026-11-16)* Les deux jobs tiennent sous N workers : `retry_after` de leur connexion **strictement supérieur**
   à leur `$timeout`, par une connexion ou une file dédiée (`alerts`), sans changer `retry_after` des
   autres jobs.
4. Aucune réponse de l'API ne dépend de l'état du contact (pas d'oracle, TCK-599 m2) — ni par la base,
   ni par le cache.

## Delta à produire

- [x] ADR-0050 amendé.
- [x] `SendSavedSearchAlerts`, `SendFavoriteChangeAlerts` : contrainte 2 (savoir quels canaux sont
      partis : envoi canal par canal, ou écouteur `NotificationSent`).
- [x] Création d'une recherche et confirmation d'un abonné : `last_notified_at` posé (décision 2).
- [x] *(tenu par TCK-2397 : `database-long` + `worker-long`, relevé 2026-11-16)* `config/queue.php` : connexion ou file `alerts` à `retry_after` > 1800 ; les deux jobs y vont ;
      `routes/console.php` et le worker de `docker-compose` / Dokploy la consomment (documenté dans
      `docs/infra/hebergement.md`).
- [x] Borne par contact (décision 3).
- [x] Garde de la fuite temporelle : `Cache::spy()` (ou un magasin de cache qui journalise) en plus de
      `DB::listen`.
- [x] Tests : `AlertSendOnceTest`, `AlertFirstRunTest`, ~~`AlertQueueRetryTest`~~ (caduc depuis TCK-2397 :
      `scripts/check-queues.mjs` le garde), `AlertContactQuotaTest`.

## Critères d'acceptation

- [x] **AC1 (rouge sur `839be671`).** La cloche lève après l'e-mail (fausse cloche) : trois passages →
      **un** e-mail. Un e-mail qui lève avant tout envoi : la réservation est rendue et le passage
      suivant envoie.
- [x] **AC2 (rouge sur `839be671`, si décision 2).** 30 biens publiés hier ; recherche créée
      aujourd'hui ; passage de demain : aucun e-mail. Un bien publié après la création : un e-mail,
      « 1 nouveau bien ».
- [x] **AC3.** *(tenu par TCK-2397 : `scripts/check-queues.mjs` résout le `$timeout` des classes et
      le compare au `retry_after` de leur connexion, relevé 2026-11-16)* `config('queue.connections.<connexion des alertes>.retry_after')` > `$timeout` de chaque
      job d'alertes — test qui lit la configuration et les classes, pas une constante recopiée.
- [x] **AC4 (décision 3).** Cinq demandes non confirmées pour `cible@` depuis cinq IP ; le titulaire
      demande et confirme : son abonnement est actif ; la réponse HTTP est identique dans tous les cas.
      *Tenu sous condition (2026-11-16) : le titulaire revient plus de 24 h après le tiers — dans les 24 h,
      le plafond de 2 confirmations et le limiteur horaire (inchangés) le retardent encore ; à trancher
      par le porteur (amendement d'ADR-0050, C).*
- [x] **AC5.** Ablation « lecture de cache par contact dans la requête » : la garde de la fuite
      temporelle rougit (elle survivait en passe 3).
- [x] Les classes de 599 restent vertes (`SaisieDansLesEmailsTest`, `PublicSearchAlertTest`,
      `SavedSearchAlertsTest`, `FavoriteChangeAlertsTest`).

## Hors périmètre

- Le vrai mode `instant` (retiré par le porteur, TCK-599).
- L'envoi WhatsApp réel (gabarit à faire approuver, drapeau à `false`).
- L'injection Markdown dans les e-mails (TCK-605).

## Notes d'implémentation

_(à remplir par implementing-specs)_

## Livré (2026-11-16)

- **Envoi canal par canal** (`App\Jobs\Concerns\EnvoieCanalParCanal`, `notifyNow($n, [$canal])` dans l'ordre de
  `via()`) : la réservation n'est rendue que si aucun canal sortant (tout canal hors `database`) n'est parti. AC1 :
  `AlertSendOnceTest` (recherches et favoris) ; ablation « rendre toujours » → 2 rouges (cloche après e-mail),
  ablation « ne jamais rendre » → 2 rouges (e-mail qui lève avant tout envoi).
- **Borne du premier envoi** : posée à la création (`SavedSearchController::store`, `SearchService::saveSearch()`) et
  à la confirmation (lien et code, même transaction) ; migration `2026_11_16_400100_borne_les_alertes_jamais_envoyees`
  (nul → `created_at`, sans retour). AC2 : `AlertFirstRunTest` (30 biens d'hier, route réelle) ; ablation de la pose à
  la confirmation → rouge. Trois tests de 599 adaptés (le bien est publié après la création/confirmation).
- **Éviction** : la borne de 5 ne compte que les confirmées ; à 5 muettes, la plus ancienne est évincée — **jamais une
  dont le message de confirmation est parti depuis moins de 24 h**, sinon l'éviction rendait le plafond de 2
  confirmations/24 h au tiers (un e-mail par heure). AC4 : `AlertContactQuotaTest` ; ablations « pas d'éviction » et
  « sans la protection 24 h » → rouges.
- **Verrou par boîte** (`Cache::lock`, attente `search_alerts.contact_lock_wait_seconds`) autour de compter/évincer/
  créer/plafond : deux workers ne dépassent aucune borne ; ablation du verrou → rouge.
- **AC5** : la garde journalise les clés de cache (événements `RetrievingKey`/`KeyWritten`/…) par requête — même
  ensemble de clés pour chaque contact, aucune ne cite le contact ni ses empreintes. Ablations `RateLimiter` par boîte
  et `Cache::get()` par contact plantées dans `store()` → rouges. Un `Cache::lock()` n'émet pas d'événement : invisible.
- **Reste, assumé dans l'amendement** : le plafond de 2 confirmations/24 h, épuisé par un tiers, retarde encore la
  confirmation du titulaire (AC4 joue son retour 25 h plus tard). Le relever est une autre décision du porteur.

