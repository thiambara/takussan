# ADR-0078 — Les jobs longs ont leur propre connexion de file et leur propre worker, et aucun job ne vit plus longtemps que le délai de reprise de sa connexion

- **Statut** : Accepté
- **Date** : 2026-10-27
- **Tickets** : TCK-2397, TCK-2402
- **Amendement du 2026-10-29 ([TCK-2402](../backlog/tickets/TCK-2402-file-dediee-aux-appels-ia.md))** : les jobs qui appellent le modèle hors d'une requête HTTP quittent `default` pour une file `ai`, sur la connexion `database`, servie par un `worker-ia` qui ne lit rien d'autre. Voir [§ Amendement du 2026-10-29](#amendement-du-2026-10-29--les-appels-ia-ont-leur-file-et-leur-worker-tck-2402).
- **Dépend de** : [ADR-0028](0028-auto-hebergement-conteneurise-sur-le-vps.md) (le fichier Compose est le déploiement)

## Contexte

Mesuré le 2026-10-27 sur `feat/socle-ia-lot-0` :

- **Le délai de reprise est de 90 s.** La préproduction tourne en `QUEUE_CONNECTION=database` sans
  `DB_QUEUE_RETRY_AFTER` (`docs/infra/hebergement.md`) : `retry_after` vaut le défaut de
  `config/queue.php`, 90 s. Une ligne de `jobs` réservée depuis plus longtemps est rendue à
  n'importe quel worker qui interroge la file, **que le job tourne encore ou non**.
- **Cinq jobs vivent plus longtemps que ça** : `SendSavedSearchAlerts` et `SendFavoriteChangeAlerts`
  (`$timeout` 1800), `Ai\RunAiEvaluation` (1800), `SyncPropertyCalendarFeedsJob` (540),
  `Booking\ExpirePendingBookingsJob` (300). Tous les autres sont sous 90 s
  (`Audit\ExportActivityLogJob` 85, le plus proche).
- **Rien ne casse aujourd'hui, par accident.** Un seul processus consomme `default` (service
  `worker`) : pendant qu'il exécute un job, personne d'autre n'interroge la file, et le job n'est
  pas relivré. Le jour où un second consommateur de `default` existe — un réplica, un worker de
  secours —, une évaluation IA vivante est relivrée après 90 s, déclarée échouée
  (`$tries = 1`) et son résultat perdu ; les balayages d'alertes ne doivent alors leur salut qu'à
  leur verrou `WithoutOverlapping`.
- **Une évaluation bloque les notifications.** Le même `worker` sert
  `notifications-urgent,default` dans cet ordre, mais l'ordre ne joue qu'entre deux jobs : une
  évaluation de 30 min sur `default` retient toute notification urgente pendant 30 min. Les deux
  balayages d'alertes du matin (09:00 et 09:15) font de même, chaque jour.

Le porteur a tranché le 2026-10-27 : traiter spécifiquement les jobs exceptionnellement longs, et
à défaut seulement monter le délai pour tout le monde.

## Décision

**Les jobs longs passent par une connexion de file à eux, `database-long`, servie par un worker à
eux, `worker-long` ; et pour chaque connexion, aucun job n'a un `$timeout` qui atteigne son
délai de reprise.**

1. **`retry_after` appartient à la connexion, pas au job.** « Spécifiquement » veut donc dire une
   connexion à part. `database-long` partage la table `jobs` avec `database` (même driver, même
   base, aucune migration) ; elle a sa file, `long`, et son délai, `DB_LONG_QUEUE_RETRY_AFTER`
   (défaut **1900 s** : 1800 + 100).
2. **Un job long le déclare** par le trait `App\Jobs\Concerns\RunsOnLongQueue`, appelé dans son
   constructeur. La connexion suit `QUEUE_CONNECTION` : `database` → `database-long` ; toute autre
   valeur (`sync` de la suite de tests, `redis`) est gardée telle quelle. La suite exécute donc
   toujours ces jobs en synchrone, sans clé de plus dans `phpunit.xml`.
3. **Un worker de plus**, `worker-long` : `queue:work database-long --queue=long`, `mem_limit`
   384m comme les deux autres (TCK-951). Il est le seul consommateur de `long` ; un worker d'une
   autre connexion qui lirait `long` le ferait avec le délai de cette connexion, ce qui rouvre le
   défaut.
4. **La règle est gardée, pas écrite.** `scripts/check-queues.mjs` lit chaque `$timeout` de `app/`,
   la connexion de sa classe et le `retry_after` par défaut de cette connexion dans
   `config/queue.php`, et rougit si `$timeout + 5 > retry_after`. Les 5 s sont la plus petite
   marge en place (`ExportActivityLogJob`, 85 contre 90) : la règle de Laravel est « quelques
   secondes ». Il vérifie aussi que `long` n'est lue que par des workers de `database-long`.

**Le repli écarté** : `DB_QUEUE_RETRY_AFTER=1860` pour tous. Une seule clé, aucun conteneur — mais
un job court tué en plein vol (une notification, un redémarrage de déploiement) attendrait 31 min
avant d'être repris, au lieu de 90 s. Et il ne règle pas le blocage des notifications.

## Conséquences

- **RAM** : un worker au repos pèse environ 52 Mio (relevé sur la préproduction le 2026-10-18,
  TCK-951), 384 Mio au pire. La préproduction disposait de 5 349 Mo au repos avec ses deux piles
  servies (`docs/infra/hebergement.md`, « Budget au repos »).
- **Les notifications ne sont plus retenues** par une évaluation ou un balayage : `worker` ne voit
  plus jamais ces cinq jobs.
- **Les jobs longs s'attendent entre eux.** `ExpirePendingBookingsJob` (toutes les 15 min) peut
  partir jusqu'à 30 min en retard derrière un balayage d'alertes ou une évaluation. Il est
  idempotent et compte depuis `created_at` : une réservation expire en retard, jamais à tort.
- **Un job long tué** (SIGKILL, redéploiement au-delà de `stop_grace_period`) est rendu après
  1900 s au lieu de 90. `RunAiEvaluation` (`$tries = 1`) échoue alors par `failed()` ;
  `AiEvaluationRun::markLostIfStale()` (2100 s) reste le filet.
- **Passer la file sur Redis** demandera la même séparation (`redis-long`) : le trait garde la
  connexion par défaut hors de `database`, et le délai de Redis n'est pas couvert par la garde.
- Un job neuf de plus de 85 s fait rougir Repo CI tant qu'il n'emprunte pas `RunsOnLongQueue`.

## Application

- `takussan-api/config/queue.php` — connexion `database-long`.
- `takussan-api/app/Jobs/Concerns/RunsOnLongQueue.php` — le trait ; les cinq jobs l'emploient.
- `deploy/takussan/compose.api.yml` — service `worker-long` ; `dev.sh` — le même consommateur ;
  `deploy/takussan/smoke-api.sh` — vérifie qu'il tourne.
- `scripts/check-queues.mjs` — connexion des workers et délai de reprise (Repo CI).
- `takussan-api/tests/Feature/Queue/LongJobsConnectionTest.php` — chaque job long atterrit sur
  `database-long` / `long`, un job court reste sur `database` / `default`.

## Amendement du 2026-10-29 — les appels IA ont leur file et leur worker (TCK-2402)

### Contexte

Mesuré le 2026-10-29 sur `origin/dev` :

- **Deux jobs appellent le modèle hors d'une requête HTTP** : `Radar\ExtractRadarListing` et
  `Radar\VerifyRadarConsentReply`, tous deux `$timeout` **85 s**. Aucun n'avait de file : ils
  tournaient sur `default`, que `worker` lit **derrière** `notifications-urgent`
  (`--queue=notifications-urgent,default`). `RunAiEvaluation` (1800 s) est déjà sur `long`.
- **L'ordre des files ne joue qu'entre deux jobs.** Une extraction en cours retient une notification
  urgente jusqu'à 85 s ; un envoi de 20 URL met 20 extractions (20 × 85 s au pire) devant les
  notifications ordinaires de `default`.
- **Le délai de reprise de `database` (90 s) couvre déjà ces jobs** : `85 + 5 ≤ 90`. Ce qui manque
  n'est pas un délai, c'est un consommateur qui ne retienne personne.

Le porteur a tranché le 2026-10-27 : à traiter avant la production (phase F, TCK-517).

### Décision

**Une file `ai`, sur la connexion `database`, lue par un worker à elle, `worker-ia`.**

1. **Pas de connexion de plus.** `retry_after` appartient à la connexion, et celui de `database`
   convient (90 s pour 85 s). `ai` n'ajoute aucune entrée à `config/queue.php`, aucune clé d'environnement.
2. **Un job qui appelle le modèle le déclare** par le trait `App\Jobs\Concerns\RunsOnAiQueue`
   (`onAiQueue()`, appelée dans le constructeur comme `onLongQueue()`) : `onQueue('ai')`, sans toucher
   à la connexion. `sync` sous la suite de tests, `redis` plus tard : la file est sans effet ou suit
   la connexion par défaut, sans clé de plus dans `phpunit.xml`. Le `$timeout` d'un job de `ai` reste
   sous 85 s (la garde du §4 d'ADR-0078 le juge sur `database`) ; un appel plus long prend
   `RunsOnLongQueue`.
3. **`worker-ia` : `queue:work --queue=ai`**, `mem_limit` 384m comme les autres (TCK-951), `stop_grace_period`
   90 s (de quoi finir un appel de 85 s). Il est le seul à lire `ai` et ne lit rien d'autre : un worker
   qui lirait `ai` derrière `notifications-urgent` retiendrait de nouveau ce qu'on vient de dégager
   (AC2).
4. **La règle est gardée, pas écrite.** `scripts/check-queues.mjs` exige désormais :
   (a) tout job de `app/Jobs` qui référence `AiGateway` ou `SocleAgent` déclare `RunsOnAiQueue`
   (ou `RunsOnLongQueue`) ;
   (b) la file `ai` n'est lue que SEULE (`FILES_ISOLEES`), sur la connexion `database`.
   `ai` est déjà exigée des deux consommateurs (`compose.api.yml`, `dev.sh`) par le contrôle
   « toute file poussée est consommée », parce que le trait la pousse.

### Le choix du consommateur — trois options mesurées

- **a) Un worker à part (retenu).** ~52 Mio au repos par pile (relevé TCK-951), 384 Mio au plafond.
  Budget au repos de la préproduction : 5 349 Mo disponibles avec deux piles servies
  (`docs/infra/hebergement.md`) → +1,0 % ; +1,9 % avec la production en phase F. Aucun effet sur
  `ExpirePendingBookingsJob`, les notifications ou `long`.
- **b) `worker-long` lit aussi `ai`.** 0 Mio, mais un worker lit UNE connexion : `ai` irait sur
  `database-long` (1900 s). Une extraction tuée ne serait reprise qu'après 31 min au lieu de 90 s ;
  une rafale attendrait derrière une évaluation de 30 min ou un balayage d'alertes ; et
  `ExpirePendingBookingsJob` (déjà jusqu'à 30 min de retard derrière les jobs longs, ADR-0078)
  attendrait aussi les 20 × 85 s d'une rafale.
- **c) `worker-media` lit `media,reconciliation,ai`.** 0 Mio, connexion conservée, mais une
  régénération de filigranes pour toute une agence (75 s par job) retient les extractions, et une
  rafale retient la réconciliation des paiements : un blocage en remplace un autre.

### Conséquences

- **RAM** : un processus de plus par pile, ~52 Mio au repos.
- **Les notifications ne sont plus retenues** par un appel au modèle : `worker` ne voit plus jamais
  ces jobs.
- **Les jobs IA s'attendent entre eux**, un à la fois (un seul worker) : une rafale de 20 URL
  prend jusqu'à 20 × 85 s, sans rien retenir d'autre. Un second `worker-ia` est possible le jour où
  la file se remplit : `retry_after` et connexion sont les mêmes, et la garde n'interdit pas deux
  workers de `ai`.
- **Un job IA tué** (SIGKILL, redéploiement au-delà de `stop_grace_period`) est rendu après 90 s.
- Un job neuf qui appelle le modèle sans déclarer de file fait rougir Repo CI.

### Application

- `takussan-api/app/Jobs/Concerns/RunsOnAiQueue.php` — le trait ; `ExtractRadarListing` et
  `VerifyRadarConsentReply` l'emploient.
- `deploy/takussan/compose.api.yml` — service `worker-ia` ; `dev.sh` — le même consommateur ;
  `deploy/takussan/smoke-api.sh` — vérifie qu'il tourne.
- `scripts/check-queues.mjs` — déclaration de la file par tout appelant du modèle, file lue seule.
- `takussan-api/tests/Feature/Queue/AiJobsQueueTest.php` — chaque job IA atterrit sur `ai` en
  `database`, reste synchrone sous la suite, un job de notification reste sur `notifications-urgent`.
