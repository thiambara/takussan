---
id: TCK-2397
title: "Les jobs longs passent sur leur propre connexion de file et leur propre worker, et une garde tient leur délai de reprise au-dessus de leur timeout"
status: done
phase: P2
family: technique
estimate: M
wave: 80
created: 2026-10-27
updated: 2026-10-27
depends_on: [TCK-2385]
blocks: [TCK-2401]
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#211-socle-ia"
  models:
    - "docs/models-spec.md#106-aievaluationrun-"
tags: [api, deploy, queue, worker, ia, adr-requis]
---

## Objectif utilisateur

Une notification urgente part dans la minute même pendant qu'une évaluation IA ou un balayage
d'alertes tourne, et un job long interrompu n'est ni rejoué en double, ni perdu.

## Contexte

Relevé pendant la revue du lot 0 du socle IA (2026-10-27).

- **Délai de reprise.** La préproduction tourne en `QUEUE_CONNECTION=database` sans
  `DB_QUEUE_RETRY_AFTER` dans Dokploy : `retry_after` vaut **90 s** (défaut de `config/queue.php`,
  relevé dans `docs/infra/hebergement.md`). Cinq jobs ont un `$timeout` au-dessus :
  `SendSavedSearchAlerts` (1800), `SendFavoriteChangeAlerts` (1800), `RunAiEvaluation` (1800),
  `SyncPropertyCalendarFeedsJob` (540) et `Booking\ExpirePendingBookingsJob` (300). Tant qu'un seul
  processus consomme leur file, aucun autre ne les relivre pendant qu'ils tournent ; dès qu'un second
  consommateur existe, un job vivant au-delà de 90 s est relivré. `RunAiEvaluation` (`$tries = 1`)
  le déclare alors échoué et perd son résultat ; les deux balayages d'alertes ne doivent leur
  protection qu'à leur verrou `WithoutOverlapping`.
- **Blocage.** Le service `worker` de `deploy/takussan/compose.api.yml` est l'**unique**
  consommateur de `notifications-urgent,default`. Une évaluation de 30 min sur `default` l'occupe
  entièrement : aucune notification urgente ne part pendant ce temps.

**Décision du porteur (2026-10-27)** : traiter spécifiquement les jobs exceptionnellement longs ; à
défaut, monter `DB_QUEUE_RETRY_AFTER` à 1800 pour tout le monde. Le repli a un coût que le premier
choix évite : un job court interrompu (une notification) attendrait alors 30 min avant d'être
repris. `retry_after` est une propriété de la **connexion**, pas du job : « spécifiquement » veut
donc dire une connexion à part, avec son propre consommateur.

**Un nouveau conteneur est une décision structurelle** (RAM du VPS, `mem_limit` 384m par worker,
TCK-951) : elle s'écrit en ADR **avant** l'implémentation.

## Contrat de données

- Table `jobs` inchangée : la nouvelle connexion la partage, sous une file à elle.
- Aucun endpoint touché. `ai_evaluation_runs` (cf. `spec_refs`) inchangée.

## Contraintes strictes (métier)

- Pour **chaque** connexion déployée : `retry_after` > le plus grand `$timeout` des jobs qui y
  passent, avec une marge écrite. *(Amendé le 2026-10-27 à l'implémentation : 5 s, la plus petite
  marge en place — `ExportActivityLogJob`, 85 contre 90 ; « au moins 60 s » n'avait pas été mesuré.
  `database-long` garde 100 s. ADR-0078 §4.)*
- Ordre de priorité inchangé sur le worker principal : `notifications-urgent` avant `default`.
- Aucune file poussée sans consommateur (`scripts/check-queues.mjs`), en préproduction comme dans
  `dev.sh`.
- Ne jamais modifier l'environnement Dokploy sans l'accord explicite du porteur : la clé neuve se
  pose par la procédure de `docs/infra/hebergement.md`, au moment du déploiement.

## Delta à produire

- [x] ADR `docs/adr/00NN-une-connexion-de-file-pour-les-jobs-longs.md` (numéro suivant libre) :
      le problème mesuré ci-dessus, l'option retenue (connexion dédiée) contre le repli
      (`DB_QUEUE_RETRY_AFTER=1860` global), le coût en RAM relevé sur la préproduction, et la règle
      « `retry_after` > `$timeout` ». Index `docs/adr/README.md`.
- [x] `config/queue.php` : connexion `database-long` (driver `database`, table `jobs`, file
      `long`, `retry_after` lu de `DB_LONG_QUEUE_RETRY_AFTER`, défaut 1900).
- [x] Les cinq jobs ci-dessus déclarent `$connection = 'database-long'` et `$queue = 'long'`
      (ou l'équivalent `onConnection`/`onQueue` à la mise en file, un seul des deux styles).
- [x] `RunAiEvaluation` : docblock et dépendance « unique consommateur » relus et réécrits.
- [x] `deploy/takussan/compose.api.yml` : service `worker-long`
      (`php artisan queue:work database-long --queue=long --sleep=3 --max-time=3600`,
      `stop_grace_period` couvrant un arrêt propre, `mem_limit: 384m`) ; note du service `worker`
      mise à jour.
- [x] `dev.sh` : un consommateur de `database-long` / `long`.
- [ ] ~~`.env.example` et `.env.docker` : `DB_LONG_QUEUE_RETRY_AFTER`~~ *(non fait, voir les notes)* (parité,
      `scripts/check-env-parity.mjs`).
- [x] `scripts/check-queues.mjs` : apprend la connexion (`queue:work <connexion> --queue=…`) et
      **rougit si un job a un `$timeout` ≥ le `retry_after` par défaut de sa connexion** ; ses
      épreuves couvrent les deux cas.
- [x] `docs/infra/hebergement.md` : la ligne « File de la préproduction et délai de reprise » dit
      les deux connexions et la clé à poser.
- [x] Tests : `tests/Feature/Queue/LongJobsConnectionTest.php` — chacun des cinq jobs, mis en file,
      atterrit sur `database-long` / `long` ; un job court reste sur `default`.

## Critères d'acceptation

- [x] AC1 — L'ADR est mergé avant le code (ou dans la même PR, en premier commit).
- [x] AC2 — `LongJobsConnectionTest` est vert, et rouge si l'un des cinq jobs perd sa connexion
      (ablation consignée).
- [x] AC3 — `node scripts/check-queues.mjs` est vert, et rougit si l'on remet `RunAiEvaluation` sur
      `default` avec `retry_after` 90, ou si l'on retire le consommateur `worker-long`.
- [x] AC4 — `deploy/takussan/smoke-api.sh pile` démarre les trois workers.
- [x] AC5 — Pendant qu'une évaluation tourne sur `worker-long`, une notification
      `notifications-urgent` est consommée par `worker` (épreuve sur la pile locale, consignée).

## Hors périmètre

- Passer la file sur Redis (`QUEUE_CONNECTION=redis`).
- Le réglage de l'environnement Dokploy lui-même (action du porteur au déploiement).
- Découper les balayages d'alertes en jobs plus courts.

## Notes d'implémentation

Branche `feat/file-jobs-longs`, empilée sur `feat/socle-ia-lot-0` (TCK-2385, dépendance non
fusionnée) : `doing` tant qu'elle n'est pas sur `dev`. ADR-0078 en premier commit (`6c961a575`),
code en `0252e92ae`.

- **Connexion par le trait, pas par une propriété.** `$connection = 'database-long'` en dur aurait
  sorti ces jobs de la suite (`QUEUE_CONNECTION=sync`) : ils seraient partis dans `jobs` sans
  s'exécuter. `RunsOnLongQueue::onLongQueue()`, appelé au constructeur, ne bascule que si la
  connexion par défaut est `database` ; aucune clé de plus dans `phpunit.xml`.
- **Aucune clé d'environnement ajoutée.** `DB_QUEUE_RETRY_AFTER` ne figure pas non plus dans
  `.env.example` ni `.env.docker` ; le défaut de 1900 s suffit, et Dokploy n'a rien à recevoir.
  Le nouveau worker arrive avec `compose.api.yml` au prochain déploiement de `preview`.
- **La garde a eu un défaut, attrapé par ablation** : `^\s+use` sous le drapeau `m` traversait le
  saut de ligne et prenait l'import `use App\Jobs\Concerns\RunsOnLongQueue;` pour un `use` de
  classe, si bien qu'un job privé du trait restait déclaré « long ». Corrigé (`[ \t]+`) avec une
  épreuve qui rougit sans le correctif.
- **Ablations consignées** : appel du trait retiré → `LongJobsConnectionTest` 2 rouges ; trait
  retiré de `RunAiEvaluation` → garde rouge (`1800 s sur database, retry_after 90 s`) ;
  `worker-long` retiré du compose → garde rouge (`long` non consommée) ; `long` ajoutée au worker
  principal → garde rouge (mauvaise connexion).
- **AC5, mesuré sur base jetable** (`takussan_epreuve_2397`, supprimée), deux vrais `queue:work` :
  job long de 25 s sur `database-long`, urgent mis en file à 3 s → urgent exécuté à **3,5 s** ;
  même épreuve avec le job long sur `default` (avant) → urgent à **25,2 s**.
- **AC4** : `smoke-api.sh pile` vert le 2026-10-27 (10:56 Z), `worker-long` compris dans les
  vérifications « tourne » et « ne redémarre pas ». Un premier essai avait échoué à la
  construction de l'image seed sur `composer install` (code 100, téléchargement), passager.
- **Tests** : 46 classes qui touchent ces jobs, la file ou le planificateur + `tests/Feature/Queue`
  → 408 verts ; 64 gardes vertes ; Pint propre. Suite entière non rejouée (rituel de fin de
  branche).
- **Suite** : la surveillance de `long` (battement, seuils à la mesure de ses jobs) → TCK-2401.
