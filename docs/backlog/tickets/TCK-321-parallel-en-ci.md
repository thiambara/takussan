---
id: TCK-321
title: "Rouvrir `--parallel` — un de ses deux verrous était levé depuis six semaines, et l'autre était mal posé"
status: todo
phase: P2
family: technique
estimate: M
wave: 41
created: 2026-08-17
updated: 2026-08-17
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, tests, ci, determinisme, dette]
---

## Objectif utilisateur

Que le rituel de fin de branche — et la CI si la mesure le justifie — joue la suite en 66-83 s au
lieu de 204-235 s, sans réintroduire la panne que D-44 a soldée.

## Contrat de données

Aucune donnée applicative. Deux jetons d'isolation, **composés** au lieu d'être mis en concurrence.

## Contexte — les deux conditions de D-30, et ce qu'elles sont devenues

L'ardoise **D-30** a mesuré `--parallel` le 2026-08-16 — **2,6× : 204 s → 66-83 s** — puis l'a
**refusé** sur cinq exécutions rouges sur cinq, en posant deux conditions de réouverture.

**La première est remplie depuis le 2026-08-16, et l'ardoise l'ignore encore.**
[TCK-314](TCK-314-test-recherche-dependant-de-l-ordre.md) est `done` et mergé (PR #192, commit
`4929df7f`). *Une condition levée qu'un document continue de présenter comme bloquante bloque pour
de bon* — c'est exactement le défaut que l'ardoise existe pour attraper ailleurs.

**La seconde est mal formulée, et la corriger change le travail à faire.** D-30 la pose comme
« décider lequel des deux jetons gouverne ». Cela suppose qu'ils répondent à la même question. Ils
n'y répondent pas :

| Jeton | Isole | Valeur |
|---|---|---|
| `ParallelTesting::token()` (Laravel) | les workers **entre eux** | `1`, `2`, … `N` |
| `Tests\Support\TestProcessToken` (dépôt) | les **exécutions simultanées** entre elles | `pid` + 3 octets d'aléa |

Élire le premier redonne `public_test_1` à deux agents simultanés — **exactement la panne que D-44 a
soldée**. Il faut les **composer** : `<pid+aléa>_<index worker>`.

**Un défaut préexistant, trouvé en lisant le code pour ce ticket** :
`TestFilesystemIsolation::install()` **sort par le haut** quand `TEST_TOKEN` est déjà posé. En
`--parallel`, l'isolation par exécution ne s'applique donc **pas du tout** au système de fichiers.
Le défaut est déjà là, en sommeil, parce que personne ne lance `--parallel`.

## Le fait qui gouverne le périmètre

Mesuré le 2026-08-17 : la suite séquentielle occupe **0,73 cœur sur 8**
(`user 417,40 s + sys 29,42 s` pour 611,4 s d'horloge). **Sept cœurs inutilisés de bout en bout.**

`--parallel` la fait passer de 1 à 8 cœurs. Un agent seul y gagne 2,6× ; **deux agents qui
parallélisent simultanément demandent 16 cœurs à une machine qui en a 8**, et retombent dans le
régime ×11 que `CLAUDE.md` documente. D'où le périmètre : `--parallel` est la commande du **rituel
de fin de branche** et, si la mesure le justifie, de la **CI** — jamais de la boucle quotidienne,
que [TCK-320](TCK-320-selection-des-tests-par-impact.md) couvre beaucoup mieux (~5 s dans 81 % des
cas).

## Critères d'acceptation

- **AC1** — `TestProcessToken::value()` rend `<pid+aléa>` hors mode parallèle et
  `<pid+aléa>_<index worker>` en mode parallèle. Le discriminant d'exécution est **en tête** et
  survit toujours.
- **AC2** — `TestFilesystemIsolation` **compose** au lieu de renoncer : la racine des disques
  factices est unique par *(exécution, worker)* dans les deux modes.
- **AC3** — `FakeDiskIsolationTest` garde la propriété qui compte — l'unicité par
  *(exécution, worker)* — et non deux affirmations que `--parallel` rend fausses par construction.
  Il passe dans les **deux** modes.
- **AC4** — **Cinq exécutions consécutives de `php artisan test --parallel` à 0 échec**, machine au
  repos, `uptime` et `sysctl -n hw.ncpu` relevés à côté de chaque durée. Une seule rouge sur cinq
  refuse. Un rouge Meilisearch se relance **seul** avant d'être compté (D-44).
- **AC5** — **Deux exécutions simultanées** de `php artisan test --parallel` — le cas de deux
  agents — rendent 0 échec des deux côtés. C'est la propriété que la composition existe pour tenir ;
  elle ne se présume pas.
- **AC6** — La décision CI est prise **sur mesure du runner** (`nproc` + durée), pas par analogie
  avec les 8 cœurs locaux. **Aucun gain mesuré → pas d'activation en CI, et on le dit.** Le cliquet
  `--min=86` n'est **pas** touché : PCOV agrège mal entre processus.
- **AC7** — D-30 est soldée : les cinq durées, les cinq comptes d'échecs, les conditions de mesure,
  la décision et son motif. **Les chiffres de l'épreuve, pas ceux du plan.**

## Ce que ce ticket ne fait pas

- Il ne fait pas de `--parallel` le défaut local — c'est la conclusion de « 0,73 cœur sur 8 ».
- Il ne touche pas au cliquet de couverture.
- Il ne dépend pas de TCK-320, et TCK-320 ne dépend pas de lui.

## Plan d'implémentation

[`docs/plans/2026-08-17-parallel-en-ci-phase-2.md`](../../plans/2026-08-17-parallel-en-ci-phase-2.md)
— quatre tâches, TDD, code complet.
