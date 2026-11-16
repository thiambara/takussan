---
id: TCK-2951
title: "CI — le job `couverture` de l'API en `--parallel` : même `Total:`, 77 → ~42 min"
status: doing
phase: P2
family: technique
estimate: S
wave: null
created: 2026-11-16
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
  models: []
tags: [infra, github, ci, couverture, adr-0063]
---

## Objectif utilisateur

- **Le porteur, qui livre** : le chemin critique d'une PR vers `dev` — le job `couverture` — passe
  d'environ 77 à environ 42 min, sans que le cliquet de couverture mesure moins bien.

## Contrat de données

Aucune donnée applicative. Fait suite à
[TCK-637](../done/TCK-637-ci-parallele-couverture-decouplee.md) (done), qui a sorti la couverture
dans le job `couverture` mais l'y a gardée en **un seul processus**, parce que « PCOV agrège mal entre
processus » ([J-12](../../../journal-des-corrections.md#j-12), ardoise D-30,
[ADR-0063](../../../adr/0063-attestation-de-ci-par-arbre.md) § 4). Cette affirmation **n'avait jamais
été mesurée**.

**Constat — mesure du 2026-11-16, décision du porteur : oui.** Même arbre (`5b5e5c98f`), PCOV 1.0.12,
runner `ubuntu-latest` à `nproc` 4, une seule variable — la commande du step de test de `couverture` :

| commande | run | durée du job `couverture` | `Total:` |
|---|---|---|---|
| `php vendor/phpunit/phpunit/phpunit` | 43942819541 | **77 min** | `96.9 % (74260 / 76633 lignes exécutables)` |
| `php artisan test --parallel --processes="$(nproc)"` (branche jetable, supprimée) | 43956403876 | **42,5 min** (step 2506 s) | `96.9 % (74265 / 76633)` · 17 498 tests |

- Les deux clovers, comparés ligne par ligne : mêmes 2 175 fichiers, mêmes lignes exécutables ; le
  parallèle couvre **toutes** les lignes du séquentiel plus 5 —
  `app/Console/Commands/SearchVerifyIndexes.php:90,94` (boucle d'attente de la file Meilisearch) et
  `app/Services/Admin/HealthcheckService.php:331,332,335` (index absent → 404) : des branches qui
  dépendent de l'état d'un Meilisearch partagé par 4 processus. Non-déterminisme de chemin, pas une
  erreur de fusion (0,007 %).
- En local (Xdebug 3.4.2, 8 processus) sur `tests/Feature/Auth` (586 tests) : séquentiel 169 s,
  parallèle 58 s ; `cov.php` comparé ligne par ligne : 0 ligne couverte différente, métriques du clover
  identiques, et pour la carte d'impact **aucun test perdu par ligne** (133 lignes où le parallèle en
  attribue **plus** — lignes jouées une fois par processus, attribuées au premier test de chaque
  worker) : la carte relance un sur-ensemble, ce qui est sûr.
- Sous Xdebug local, `tests/Feature/Radar/RadarWhatsappReceiptGuardTest.php::test_i1_…` fait segfault
  (139) avec couverture, séquentiel comme parallèle : bug d'Xdebug, sans rapport avec la CI (PCOV).

## Contraintes strictes (métier)

- Le cliquet `bin/coverage-gate.php storage/coverage/clover.xml --min=92` reste évalué sur chaque PR
  vers `dev`, sur un clover de la suite **entière**.
- Les trois sorties de la même exécution restent : clover (cliquet, série), HTML (jours rouges),
  `cov.php` (la nuit ou à la demande sur `dev`, carte d'impact) — attribution test → lignes comprise.
- La structure de TCK-637 ne bouge pas : deux jobs, deux attestations, `couverture` reste le check
  requis (action de déploiement `2026-11-16-exiger-le-check-de-couverture.md`, inchangée — le nom du
  job ne change pas).
- `--parallel` **en premier** sur la ligne, et **jamais** le drapeau `--coverage` de Collision (les
  deux pièges de TCK-331).

## Delta à produire

- [x] `.github/workflows/api-ci.yml`, job `couverture` : `php artisan test --parallel
      --processes="$processus"` (`processus=$(nproc)`, imprimé) à la place de `php
      vendor/phpunit/phpunit/phpunit` ; mêmes sorties, même `set +e`/`pipefail`/`tee`, même cliquet ;
      commentaires qui justifiaient le séquentiel réécrits en histoire datée.
- [x] `scripts/check-ci-attestation.mjs` : la commande de `couverture` qui écrit le clover doit être
      `php artisan test --parallel --processes=…` ; aucun PHPUnit ni ParaTest direct dans le job ; pas
      de `--coverage` ; le cliquet suit dans le même step.
- [x] ADR-0063 § 4 : amendement daté (TCK-2951) ; ligne du registre `docs/adr/README.md`.
- [x] Documentation qui affirmait le contraire : journal J-12 (et renvoi de J-11), ardoise D-30,
      `CLAUDE.md` (§ État courant, bloc des commandes), `takussan-api/CLAUDE.md` (carte d'impact).

## Critères d'acceptation

- [x] AC1 — Sur la PR de ce ticket, le job `couverture` **a tourné** (pas sauté sur une attestation :
      `api-ci.yml` est dans la clé, toute attestation existante est invalidée), son journal porte
      `Processus ParaTest : 4` (ou le `nproc` du runner), une ligne `Durée de la suite AVEC couverture
      --parallel`, et une ligne `Total:` de `coverage-gate.php` ; la durée du **job** est relevée et
      comparée aux 77 min du séquentiel (run 43942819541).
- [x] AC2 — `Total:` égal au séquentiel à ±0,01 % **sur le même arbre** : tenu par la mesure ci-dessus
      (`5b5e5c98f`, runs 43942819541 et 43956403876 : 74260 contre 74265 / 76633, clovers comparés
      ligne par ligne, aucune ligne du séquentiel perdue). Un `Total:` relevé sur un autre arbre ne
      coche pas cet AC.
- [x] AC3 — Le cliquet rougit toujours : sur le `couverture-api-clover` **téléchargé de la PR**,
      `php bin/coverage-gate.php clover.xml --min=<Total + 0,1>` sort en 1 et `--min=92` en 0 (un
      clover vide ou absent le ferait aussi sortir en 1 : les deux appels sont requis).
- [ ] AC4 — La nuit (ou par `workflow_dispatch` sur `dev`) après la fusion, `cov.php` est produit par
      la forme parallèle, le step « Régénérer la carte d'impact » passe et pousse
      `tests/impact-map.json`, **et** la carte ne perd aucune classe de test par fichier face à la
      dernière carte issue d'un `cov.php` séquentiel (comparaison fichier par fichier des classes
      listées), **sauf** les pertes que le diff entre les deux commits explique (test supprimé ou
      déplacé, fichier d'`app/` modifié) — chacune nommée. Une carte « valide » pour
      `check-impact-map.mjs` ne suffit pas : un `cov.php` d'un seul worker la rendrait valide aussi.
- [x] AC5 — `scripts/check-ci-attestation.mjs` rougit par ablation (copie + `md5`, restauration
      vérifiée) sur trois mutants : `couverture` repassé en `php vendor/phpunit/phpunit/phpunit` ;
      `--parallel` déplacé après `--coverage-clover=` ; `--coverage` ajouté.

## Hors périmètre

- Refondre les deux jobs en un seul (les tests jugés et la couverture mesurée par la même exécution) :
  la structure de TCK-637 tient, et `lint-and-test` rend son verdict plus tôt.
- `scripts/ci-attestation.mjs` : son commentaire « PCOV séquentiel » est périmé, mais le fichier est
  dans la clé des **deux** suites ; le toucher rejouerait aussi le front pour un commentaire
  (ADR-0063 § 4, amendement TCK-2951, fait foi).
- Le segfault d'Xdebug sur le radar (local seulement, non touché).
- Le seuil `--min=92` (un resserrement se décide sur un chiffre de CI, ailleurs).

## Notes d'implémentation

- **Risque non éprouvé en CI** : l'écriture de `cov.php` en parallèle sur la suite entière. La fusion,
  elle, est déjà éprouvée par le run 43956403876 : `WrapperRunner::generateCodeCoverageReports()`
  fusionne une fois les fichiers des workers (`CoverageMerger`) et écrit clover, HTML **et** PHP depuis
  le même objet, que `build-impact-map.php` relit par `include` (instance de `CodeCoverage` exigée,
  puis `getData()->lineCoverage()`). Seul l'écrivain PHP (~100 Mo, `memory_limit=8G`) n'a pas tourné
  en CI. Un échec y est bruyant — step rouge, carte non poussée —, jamais une carte silencieusement
  fausse : c'est AC4.
- Les rapports sont écrits **avant** le calcul du code de sortie (`WrapperRunner::complete()`) : sur
  une suite rouge, clover et HTML existent toujours, et l'artefact HTML `if: failure()` garde son sens.
- **L'avertissement du lanceur** (`grep 'PHPUnit test runner warning'`) garde son sens sous ParaTest :
  `WrapperRunner` additionne les `testRunnerTriggeredWarningEvents` des workers et les imprime par le
  `ResultPrinter` de PHPUnit (avertissements du lanceur affichés). Une option de ligne de commande
  inconnue n'y arrive plus : ParaTest la refuse (Symfony, sans `ignoreValidationErrors`), sortie ≠ 0.
  Une option en double est prise en silence (la dernière gagne) — d'où l'interdiction de `--coverage`.
- Hors nuit, `"${COV_PHP[@]}"` est vide et ne produit aucun argument (`bash -e`, sans `-u`) : la ligne
  de la PR est exactement celle du run mesuré 43956403876.

## Relevé sur la PR #1689 (2026-11-16)

- **AC1** — run 43968059763, job `couverture` : **37 min 21 s** (suite seule 2186 s), `Processus ParaTest : 4`,
  `Tests: 17498`, `Total: 96.9 % (74263 / 76633 lignes exécutables)`. Contre 77 min en séquentiel sur le même
  dépôt (run 43942819541). Le chiffre couvert (74 263) tombe entre les deux mesures précédentes (74 260 et
  74 265) : c'est le non-déterminisme des chemins d'attente Meilisearch décrit plus haut, pas une dérive.
- **AC3** — `bin/coverage-gate.php` sur le clover de ce run : `--min=92` → 0, `--min=96.9` → 0, `--min=97` →
  **1**. Le cliquet rougit toujours au-dessus de la mesure ; l'attestation `ci-vert-api-couverture-*` n'est
  déposée que par un job vert.
- **AC4** — reste à relever la première nuit après la fusion (`cov.php` produit en parallèle, carte
  d'impact régénérée).

## Reste sur dev

Le code est fusionné (#1689, `1575eea77`) ; AC1 et AC3 sont relevés. **Reste l'AC4** : la première nuit
après la fusion (ou un `workflow_dispatch` d'`api-ci.yml` sur `dev`), vérifier que le job `couverture`
produit `cov.php` en `--parallel` et que le step « Régénérer la carte d'impact » pousse un
`tests/impact-map.json` sans perte inexpliquée de tests. Puis passer le ticket à `done`.
