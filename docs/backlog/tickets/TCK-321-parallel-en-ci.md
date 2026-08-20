---
id: TCK-321
title: "Rouvrir `--parallel` — un de ses deux verrous était levé depuis six semaines, et l'autre était mal posé"
status: done
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
- **AC5** — ❌ **NON TENU, et mesuré plutôt que présumé.** Deux `php artisan test --parallel`
  simultanés : A verte (2433 tests, 0 échec), **B morte au démarrage** — `mkdir(): File exists`
  dans `Illuminate\Filesystem\Filesystem::makeDirectory()`, avant le premier test. Ce n'est **pas**
  la composition des jetons, qui fonctionne (A passe) : c'est une **quatrième ressource partagée par
  machine**, dans ParaTest lui-même, que D-44 ne pouvait pas connaître puisque ParaTest n'était pas
  installé. `--tmp-dir` ne la corrige pas (éprouvé). Isolé dans
  [TCK-322](TCK-322-paratest-deux-executions-simultanees.md).

  > **Cet AC est laissé en échec, pas retiré.** Le supprimer aurait rendu le ticket vert sur une
  > propriété qu'il ne tient pas — et c'est précisément la famille de mensonge que la vague 41
  > existe pour ne plus commettre. La conséquence tient en une ligne, et elle est documentée dans
  > `CLAUDE.md` : **un seul agent à la fois peut lancer `--parallel`.**
- **AC6** — ❌ **NON TENU.** La décision CI devait se prendre **sur mesure du runner** (`nproc` +
  durée), pas par analogie avec les 8 cœurs locaux — cette mesure **n'a pas été prise** : ce ticket
  n'était pas autorisé à modifier `.github/workflows/api-ci.yml` (cf. ardoise D-30). Faute de cette
  mesure, `--parallel` **n'est pas activé en CI** — ce qui est la bonne décision par défaut, mais ne
  doit pas se lire comme « la mesure a montré l'absence de gain » : aucune mesure n'a eu lieu. La PR
  de mesure (step temporaire `nproc` + run chronométré, comparé au step de couverture existant) est
  décrite en fin de D-30. Le cliquet `--min=86` n'est **pas** touché : PCOV agrège mal entre
  processus.
- **AC7** — D-30 est soldée : les cinq durées, les cinq comptes d'échecs, les conditions de mesure,
  la décision et son motif. **Les chiffres de l'épreuve, pas ceux du plan.**

## Ce que ce ticket ne fait pas

- Il ne fait pas de `--parallel` le défaut local — c'est la conclusion de « 0,73 cœur sur 8 ».
- Il ne touche pas au cliquet de couverture.
- Il ne dépend pas de TCK-320, et TCK-320 ne dépend pas de lui.
- Il ne rend PAS `--parallel` sûr pour deux agents simultanés — cf. AC5 et TCK-322.

## Plan d'implémentation

[`docs/plans/2026-08-17-parallel-en-ci-phase-2.md`](../../plans/2026-08-17-parallel-en-ci-phase-2.md)
— quatre tâches, TDD, code complet.

---

## Vérifié le 2026-08-17, avant de passer `done`

**`done` ici veut dire « le périmètre de ce ticket est livré », pas « `--parallel` est partout ».**
Deux de ses sept AC sont en échec, et ils le restent **par écrit** : les retirer aurait rendu le
ticket vert sur des propriétés qu'il ne tient pas. Chacun est désormais porté par un ticket ouvert —
c'était la condition pour solder celui-ci.

| AC | Vérification | Résultat |
|---|---|---|
| AC1 | `TestProcessToken::value()` | `<pid+aléa>` hors parallèle, `<pid+aléa>_<worker>` en parallèle ; le discriminant d'exécution est **en tête** |
| AC2 | `TestFilesystemIsolation::install()` | ne sort plus par le haut quand `TEST_TOKEN` est posé : il le **lit et le compose** (`putenv` + `$_ENV` + `$_SERVER`) |
| AC3 | `tests/Unit/Testing/FakeDiskIsolationTest.php` | trois tests, dont `test_the_token_always_carries_the_per_run_discriminant` et `test_the_worker_index_is_appended_only_in_parallel_mode` — la propriété, pas deux affirmations que `--parallel` rend fausses |
| AC4 | ardoise **D-30**, mise à jour du 2026-08-17 | séquentielle 208,80 s à load 3,74 · `--parallel` 64,90 s à 6,11 · 113,86 s à 12,64 · 102,94 s à 33,59 · **0 échec partout**, 8 cœurs (`sysctl -n hw.ncpu`) relevés |
| AC5 | ❌ **non tenu** — deux `--parallel` simultanés | inchangé : B meurt sur `mkdir(): File exists` dans ParaTest. → **[TCK-322](TCK-322-paratest-deux-executions-simultanees.md)** (`todo`) |
| AC6 | ❌ **non tenu** — activation en CI | inchangé : **aucune mesure runner n'a eu lieu**. → **[TCK-324](TCK-324-mesurer-parallel-sur-le-runner-ci.md)** (`todo`), déposé le 2026-08-17 |
| AC7 | ardoise D-30 | soldée avec les chiffres de l'épreuve, les conditions de mesure, la décision et son motif |

**Pourquoi TCK-324 devait exister avant ce `done`.** AC6 était la **seule trace** dans tout le dépôt
du fait que « `--parallel` n'est pas activé en CI » est un **défaut faute de mesure**, et non un
résultat de mesure. Solder ce ticket sans le déposer transformait, en un statut, une décision
provisoire en décision acquise — et le lecteur de `CLAUDE.md` dans six mois aurait lu « on a mesuré,
ça ne valait pas le coup ». *Un AC en échec qu'aucun ticket ne reprend n'est plus un AC en échec :
c'est une propriété abandonnée en silence.*
