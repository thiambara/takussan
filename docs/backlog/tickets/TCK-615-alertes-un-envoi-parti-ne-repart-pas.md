---
id: TCK-615
title: "Alertes de recherche : un e-mail parti ne repart pas, le premier envoi ne vend pas l'historique comme nouveau, le job tient sous plusieurs workers, et un tiers n'épuise pas l'abonnement d'un contact (suites de TCK-599)"
status: todo
phase: P2
family: back
estimate: M
wave: 74
created: 2026-10-08
updated: 2026-10-08
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

## Objectif utilisateur

Un abonné reçoit chaque alerte une fois, et sa première alerte ne lui annonce pas comme « nouveaux »
des biens en ligne depuis des mois ; un visiteur peut toujours s'abonner avec son propre contact.

## Contexte

Suites de **TCK-599** (verif-599 passe 1, observations 1, 2 et 5 ; passe 2, observation sur
`retry_after` ; passe 3, « garder la réservation dès qu'un canal sortant est parti »), consignées
dans `FILE-D-ATTENTE.md` (21:00, 21:45), `TCK-599-corrections.md` (« En suite ») et la dernière ligne
du ticket 599 (« En suite : garder la réservation une fois l'e-mail parti »). Plusieurs points
touchent des décisions d'[ADR-0050](../../adr/0050-alertes-de-recherche-un-seul-moteur-et-des-abonnes-sans-compte.md),
qui les a prises réversibles.

**Re-mesure sur `839be671` (2026-10-08)** :

1. **Un échec après l'e-mail fait repartir l'e-mail.** `SendSavedSearchAlerts` réserve la fenêtre
   (`deplacer`, `app/Jobs/SendSavedSearchAlerts.php:136-139`), puis `notify()` ; **tout** `Throwable`
   rend la réservation (`:141-146`), y compris quand l'e-mail est déjà parti et que la cloche, partie
   en dernier, échoue. Même forme dans `SendFavoriteChangeAlerts.php:159-172`. verif-599 passe 3 l'a
   mesuré avec m12 (cloche en échec : `mails=3 cloches=0` sur trois passages) ; m12 est fermé par la
   borne `max:100`, la cause générale non. ADR-0050 décision 15 l'assume : « plutôt renvoyer que
   perdre ».
2. **Le premier passage n'a pas de borne basse.** `getMatchingProperties($search, $search->last_notified_at, $borne)`
   (`:124-128`) avec `last_notified_at` nul à la création : la première alerte annonce « N **nouveaux**
   biens » pour tout l'historique (ADR-0050 décision 6, verif-599 observation 1).
3. **`$timeout = 1800` contre `retry_after = 90`.** `SendSavedSearchAlerts.php:83`,
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

1. ADR-0050 est amendé (décisions 6, 15, et la borne par contact) avant le code.
2. La réservation se rend **seulement** si aucun canal sortant n'est parti ; l'ordre des canaux de
   599 (cloche en dernier, m11) est gardé.
3. Les deux jobs tiennent sous N workers : `retry_after` de leur connexion **strictement supérieur**
   à leur `$timeout`, par une connexion ou une file dédiée (`alerts`), sans changer `retry_after` des
   autres jobs.
4. Aucune réponse de l'API ne dépend de l'état du contact (pas d'oracle, TCK-599 m2) — ni par la base,
   ni par le cache.

## Delta à produire

- [ ] ADR-0050 amendé.
- [ ] `SendSavedSearchAlerts`, `SendFavoriteChangeAlerts` : contrainte 2 (savoir quels canaux sont
      partis : envoi canal par canal, ou écouteur `NotificationSent`).
- [ ] Création d'une recherche et confirmation d'un abonné : `last_notified_at` posé (décision 2).
- [ ] `config/queue.php` : connexion ou file `alerts` à `retry_after` > 1800 ; les deux jobs y vont ;
      `routes/console.php` et le worker de `docker-compose` / Dokploy la consomment (documenté dans
      `docs/infra/hebergement.md`).
- [ ] Borne par contact (décision 3).
- [ ] Garde de la fuite temporelle : `Cache::spy()` (ou un magasin de cache qui journalise) en plus de
      `DB::listen`.
- [ ] Tests : `AlertSendOnceTest`, `AlertFirstRunTest`, `AlertQueueRetryTest`, `AlertContactQuotaTest`.

## Critères d'acceptation

- [ ] **AC1 (rouge sur `839be671`).** La cloche lève après l'e-mail (fausse cloche) : trois passages →
      **un** e-mail. Un e-mail qui lève avant tout envoi : la réservation est rendue et le passage
      suivant envoie.
- [ ] **AC2 (rouge sur `839be671`, si décision 2).** 30 biens publiés hier ; recherche créée
      aujourd'hui ; passage de demain : aucun e-mail. Un bien publié après la création : un e-mail,
      « 1 nouveau bien ».
- [ ] **AC3.** `config('queue.connections.<connexion des alertes>.retry_after')` > `$timeout` de chaque
      job d'alertes — test qui lit la configuration et les classes, pas une constante recopiée.
- [ ] **AC4 (décision 3).** Cinq demandes non confirmées pour `cible@` depuis cinq IP ; le titulaire
      demande et confirme : son abonnement est actif ; la réponse HTTP est identique dans tous les cas.
- [ ] **AC5.** Ablation « lecture de cache par contact dans la requête » : la garde de la fuite
      temporelle rougit (elle survivait en passe 3).
- [ ] Les classes de 599 restent vertes (`SaisieDansLesEmailsTest`, `PublicSearchAlertTest`,
      `SavedSearchAlertsTest`, `FavoriteChangeAlertsTest`).

## Hors périmètre

- Le vrai mode `instant` (retiré par le porteur, TCK-599).
- L'envoi WhatsApp réel (gabarit à faire approuver, drapeau à `false`).
- L'injection Markdown dans les e-mails (TCK-605).

## Notes d'implémentation

_(à remplir par implementing-specs)_
