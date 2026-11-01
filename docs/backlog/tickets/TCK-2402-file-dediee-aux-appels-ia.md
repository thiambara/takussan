---
id: TCK-2402
title: "Les appels IA quittent la file des notifications : une file et un consommateur à eux, avant la production"
status: done
phase: P1
family: technique
estimate: M
wave: 80
created: 2026-10-27
updated: 2026-10-29
depends_on: [TCK-2386, TCK-2397]
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#211-socle-ia"
    - "docs/features.md#212-radar--acquisition-dannonces"
  models: []
tags: [api, deploy, queue, worker, ia, radar, adr-requis, adr-0078]
---

## Objectif utilisateur

Une notification urgente part dans la minute même pendant qu'un opérateur saisit une rafale
d'annonces dans le Radar.

## Contrat de données

Aucune donnée ni route nouvelle. Ce qui change, c'est la file que les jobs d'appel IA empruntent,
et le processus qui la consomme.

## Contraintes strictes (métier)

- **Décision structurelle → amendement d'[ADR-0078](../../adr/0078-une-connexion-de-file-pour-les-jobs-longs.md)
  (ou ADR neuf) AVANT l'implémentation.** ADR-0078 a sorti vers `database-long` / `worker-long` les
  jobs plus longs que le délai de reprise (90 s). Il ne traite pas les jobs IA **courts** :
  `App\Jobs\Radar\ExtractRadarListing` (`$timeout` 85 s) tourne aujourd'hui sur `default`, que le
  service `worker` de `deploy/takussan/compose.api.yml` consomme **derrière** `notifications-urgent`
  (`--queue=notifications-urgent,default`). L'ordre ne joue qu'entre deux jobs : une extraction en
  cours retient une notification urgente jusqu'à 85 s, et un envoi de 20 URL met 20 extractions en
  file devant les notifications ordinaires.
- **Décision du porteur du 2026-10-27** : à traiter avant la production (phase F, TCK-517).
- Le délai de reprise de la connexion empruntée doit rester au-dessus du `$timeout` de chaque job
  qui l'emprunte, avec la marge que tient déjà `scripts/check-queues.mjs` (5 s).
- Les usages IA à venir du lot 1 (TCK-2388 démarchage, et tout job qui appelle `AiGateway` hors
  d'une requête HTTP) empruntent la même file sans qu'on ait à s'en souvenir : une déclaration
  explicite sur la classe (comme `RunsOnLongQueue`), gardée.
- La suite de tests reste en `QUEUE_CONNECTION=sync` sans clé de plus dans `phpunit.xml` (même
  principe que `RunsOnLongQueue`).

## Delta à produire

- [x] Amendement d'ADR-0078 (ou ADR neuf) : file des appels IA, connexion, consommateur (worker à
      part, ou `worker-long` qui la lirait en plus — trancher, avec la RAM du VPS
      (`docs/infra/hebergement.md`, « Budget au repos ») et l'effet sur `ExpirePendingBookingsJob`).
- [x] Trait `App\Jobs\Concerns\RunsOnAiQueue` (nom à confirmer dans l'ADR), employé par
      `ExtractRadarListing`.
- [x] `deploy/takussan/compose.api.yml`, `dev.sh`, `deploy/takussan/smoke-api.sh` : le
      consommateur de la file.
- [x] `scripts/check-queues.mjs` : un job qui appelle `AiGateway` (ou étend un `SocleAgent`) depuis
      `app/Jobs` sans déclarer la file IA fait rougir Repo CI ; la file IA n'est lue que par son
      consommateur.
- [x] Tests : `tests/Feature/Queue/AiJobsQueueTest.php` — `ExtractRadarListing` atterrit sur la
      file IA en `QUEUE_CONNECTION=database`, reste en `sync` sous la suite ; un job de notification
      reste sur `notifications-urgent`.
- [x] `docs/infra/hebergement.md` : le service en plus.

## Critères d'acceptation

- [x] AC1 — En `QUEUE_CONNECTION=database`, `ExtractRadarListing` est mis en file hors de `default`
      et hors de `notifications-urgent`.
- [x] AC2 — Aucun processus qui lit `notifications-urgent` n'exécute un job d'appel IA (vérifié
      par la garde sur le fichier Compose).
- [x] AC3 — Un nouveau job qui appelle `AiGateway` sans déclarer la file IA fait rougir
      `scripts/check-queues.mjs` (épreuve par ablation dans le test de la garde).
- [x] AC4 — `smoke-api.sh pile` vérifie que le consommateur de la file IA tourne.

## Hors périmètre

- Le passage de la file sur Redis (ADR-0078, Conséquences).
- Les appels IA faits dans une requête HTTP (la console d'évaluation, `AiProviderController`) :
  ils ne passent par aucune file.
- La surveillance de la file `long` (TCK-2401).

## Notes d'implémentation

- **AC4 joué par la session déléguante** (2026-10-29, après les correctifs de la vérification
  adverse, images reconstruites) : `smoke-api.sh pile` vert, dont « les cinq files de la connexion
  database sont consommées (dont ai) » ; `worker-ia` ~50 Mio au repos, aucun redémarrage.
- **Amendement d'ADR-0078, pas un ADR neuf** : même règle (délai de reprise > `$timeout`), même
  garde, même fichier Compose. Consommateur retenu : un `worker-ia` à part (option a) ; `worker-long`
  et `worker-media` écartés, chiffres dans l'ADR.
- **La file `ai` vit sur la connexion `database`**, sans connexion de plus : 85 + 5 ≤ 90. Le trait ne
  touche donc pas à `connection` (la suite reste en `sync` sans clé de plus).
- **Deux jobs, pas un** : `VerifyRadarConsentReply` appelle aussi `AiGateway` (`$timeout` 85) ; le
  ticket ne citait qu'`ExtractRadarListing`. La garde l'aurait exigé de toute façon.
- **`RunsOnLongQueue` vaut aussi déclaration** pour la garde : un appel de plus de 85 s ne peut pas
  vivre sur `ai`, et exiger `RunsOnAiQueue` seul le mettrait devant deux messages contradictoires
  (le contrôle des délais lui demanderait `RunsOnLongQueue`).
- **`FILES_ISOLEES = ['ai']`** : la file n'est lue que seule. La garde « toute file poussée est
  consommée » exige `worker-ia` des deux consommateurs sans code de plus, parce que le trait pousse
  `ai`.
- **Épreuve de AC3** : fonctions pures de la garde éprouvées en tête de `check-queues.mjs`
  (`EPREUVES`), plus cinq ablations jouées à la main sur l'arbre (trait ôté d'un job, `ai` ajoutée au
  `--queue=` de `worker`, `worker-ia` retiré du compose, retiré de `dev.sh`, job neuf qui appelle
  `AiGateway`) : toutes rouges, tout restauré par `cmp`.
- **La garde lit une fermeture, pas un nom** (vérification adverse I1) : `fermetureModele()` calcule les classes
  d'`app/` qui mènent au modèle (SDK `Laravel\Ai\…`, `AiGateway`, `SocleAgent`, ce qui en étend ou en
  enveloppe un et appelle `->run/prompt/generate/stream(`) ; jobs, contrôleurs, commandes et listeners n'y
  entrent jamais (mettre un job en file n'appelle pas le modèle). Sur l'arbre : exactement 3 jobs
  (`RunAiEvaluation`, `ExtractRadarListing`, `VerifyRadarConsentReply`), tous déclarés. Les listeners en
  file sont jugés de même. Quatre ablations (service enveloppant, agent concret, helper `agent()`,
  listener en file) rouges ; limite connue : une classe qui obtient le modèle par résolution du
  conteneur sans jamais nommer un membre échappe à toute lecture de texte.
- **Les vrais sites de dispatch sont testés** (I2) : `RadarListingStoreTest` (saisie et remise en file) et
  `RadarConsentReplyTest` (dépôt d'un accord) exigent la file `ai` ; l'ablation `->onQueue('default')` aux
  deux sites d'`RadarListingIntake` et `->onQueue('notifications-urgent')` dans `RadarConsentWorkflow` rougit.
- **Smoke** : la boucle de sondes envoie aussi un job sur `ai` ; `long` n'y est pas (autre connexion).
- **Surveillance** : `ai` rejoint `RecordQueueHeartbeat::QUEUES` (une ligne : le battement planifié, la
  sonde `workers` et les tests qui bouclent sur la liste la suivent) ; un `worker-ia` arrêté est `failed`
  à 300 s. Un appel de 85 s au plus reste sous le seuil `degraded` du battement (180 s). ⚠ Non traité :
  la sonde `queue` (âge du plus ancien job disponible, 600 s `degraded`) garde les seuils des files
  courtes ; une rafale d'une dizaine d'extractions lentes (le battement planifié attend derrière elles)
  peut la lever sans que le worker soit en cause — à seuiller, comme TCK-2401 l'a fait pour `long`, si
  la durée réelle d'une extraction le justifie (non mesurée ici).
