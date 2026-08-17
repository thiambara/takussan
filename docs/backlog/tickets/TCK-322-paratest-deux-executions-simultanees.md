---
id: TCK-322
title: "Deux exécutions `--parallel` simultanées se cassent l'une l'autre au démarrage — une quatrième ressource partagée par machine"
status: doing
phase: P2
family: technique
estimate: S
wave: 41
created: 2026-08-17
updated: 2026-08-17
depends_on: [TCK-321]
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, tests, determinisme, paratest, dette]
---

## Objectif utilisateur

Que deux agents puissent lancer `php artisan test --parallel` en même temps sans se détruire — le
cas exact pour lequel l'isolation par exécution de D-44 existe.

## Ce qui est mesuré

Le 2026-08-17, machine à **8 cœurs**, `load average` 4,22 au départ, sur la branche de TCK-321
(jetons composés, ParaTest 7.20.0, PHPUnit 12.5.30) — **deux `php artisan test --parallel` lancés
simultanément** :

| Exécution | Résultat |
|---|---|
| A | **verte** — 2433 tests, 7523 assertions, 2 ignorés, 0 échec |
| B | **morte au démarrage**, sortie 1, avant le moindre test |

Message de B :

```
In Filesystem.php line 662:
  mkdir(): File exists
```

`Illuminate\Filesystem\Filesystem::makeDirectory()` — appelé pendant l'amorçage de ParaTest, **avant
que le premier test ne s'exécute**. B n'imprime aucun résumé : ce n'est pas un test rouge, c'est un
démarrage impossible.

**Ce n'est PAS la composition des jetons de TCK-321.** A passe, et le jeton composé
(`<pid+aléa>_<index worker>`) fonctionne — c'est ce que TCK-321 a livré et vérifié. La collision est
en amont, dans le harnais lui-même.

**`--tmp-dir` ne suffit pas.** Éprouvé : deux exécutions avec `--tmp-dir=/tmp/pt-A` et
`--tmp-dir=/tmp/pt-B`, sur `tests/Unit/Testing/` seulement — A verte (37 tests), B morte sur le
**même** message. Le répertoire qui entre en collision n'est donc pas celui que cette option
gouverne, et **il reste à nommer** : c'est la première chose à faire.

## Pourquoi ça compte

D-44 a soldé la non-reproductibilité de la suite en isolant **trois** ressources partagées par
machine : les index Meilisearch, la racine des disques `Storage::fake()`, et le préfixe Scout.
TCK-321 en a ajouté un étage pour les workers.

**En voici une quatrième**, et elle ne pouvait pas être vue avant : ParaTest n'était pas installé
quand D-44 a été écrit. *Chaque fois qu'on ajoute un outil au harnais, on ajoute la question de ce
qu'il partage par machine.*

## Conséquence, en attendant

**Un seul agent à la fois peut lancer `--parallel`.** C'est écrit dans `CLAUDE.md` et dans
l'ardoise D-30. Ce n'est pas une gêne théorique : c'est le scénario qui a motivé tout le chantier
de la vague 41 — plusieurs agents travaillant en même temps sur ce dépôt.

Le mode séquentiel, lui, **supporte les exécutions simultanées** depuis D-44, et
`php bin/impacted-tests.php --run` (TCK-320) aussi. La boucle quotidienne n'est donc pas bloquée ;
c'est le rituel de fin de branche qui doit rester sériel.

## Critères d'acceptation

- **AC1** — Le répertoire qui entre en collision est **nommé**, avec la ligne de code qui le crée.
  Le nommer avant de corriger : sinon on déplace la collision au lieu de la supprimer (même règle
  que TCK-314).
- **AC2** — Deux `php artisan test --parallel` simultanés rendent **0 échec des deux côtés**, et
  aucun des deux ne meurt au démarrage.
- **AC3** — Éprouvé **cinq fois**, `uptime` et `sysctl -n hw.ncpu` relevés à côté de chaque
  exécution. Une seule paire rouge refuse.
- **AC4** — Une garde de test affirme la propriété, à la manière de
  `tests/Unit/Testing/FakeDiskIsolationTest.php` — sinon la correction se perdra au prochain
  changement d'outil, comme la troisième garde de TCK-321 l'a montré.
- **AC5** — `CLAUDE.md` et l'ardoise D-30 sont mis à jour : la restriction « un seul agent à la
  fois » disparaît **le jour où elle cesse d'être vraie**, pas avant.

## Notes d'implémentation

**AC1 — le répertoire, et il n'était pas là où le ticket le cherchait.** Ce n'est pas ParaTest :
c'est `storage/framework/views/test_<index worker>`, créé par le rappel `setUpProcess` de
`Illuminate\Testing\Concerns\TestViews::bootTestViews()` (ligne 24-28) via
`File::ensureDirectoryExists()` — un `is_dir()` **suivi** d'un `mkdir()` sans `force`
(`Filesystem.php:643` puis `:662`), donc ni atomique ni silencieux. Il tourne dans le processus
**PARENT** de ParaTest, où `RunsInParallel::forEachProcess()` pose lui-même le jeton `1, 2… N`.
Deux exécutions demandent les mêmes huit chemins. Trace complète obtenue en rejouant la paire avec
`-vvv` ; détail et lignes dans l'ardoise D-49.

Deux corollaires que le ticket supposait et qui sont maintenant expliqués : le jeton composé de
TCK-321 ne pouvait rien y faire (il vit dans `tests/bootstrap.php`, que le parent n'exécute jamais),
et `--tmp-dir` non plus (le répertoire est celui de l'application). Un **second danger, silencieux**,
tenait au même chemin : le `tearDownProcess` fait `File::deleteDirectory($path)` — la première
exécution à finir effaçait les vues compilées de l'autre, en pleine course.

**Le point d'accroche est un trait que rien n'importe.** `Tests\CreatesApplication` est trouvé par
`trait_exists()` dans `RunsInParallel::createApplication()` (ligne 168) : c'est le seul code du dépôt
qui s'exécute dans ce processus-là avant les rappels. Le supprimer ne casse **aucun `use`** et
rouvre la panne en silence — d'où les quatre gardes de
`tests/Unit/Testing/CompiledViewIsolationTest.php`, dont une qui affirme que **le framework consulte
encore ce trait** et une autre qui rougira le jour où Laravel corrigera le défaut en amont, pour
qu'on sache retirer ce contournement plutôt que le traîner.

**AC2/AC3 — cinq paires vertes, mais sur des SOUS-ENSEMBLES.** 8 cœurs, 2026-08-17, `load average`
au départ : 21,96 · 23,18 · 22,77 · 21,26 · 93,80 — **0 échec des deux côtés, cinq fois sur cinq**,
et aucun démarrage impossible. Une sixième paire, sur des tests qui compilent réellement du Blade,
verte à `load average` 215,72. **Ablation** : le correctif retiré, l'une des deux remeurt aussitôt
sur `mkdir(): File exists`, sortie 1, sans résumé.
**La paire sur la suite ENTIÈRE n'a pas été jouée** — elle dépasse ce qu'un agent délégué peut
lancer (cf. `CLAUDE.md`, § « Qui lance quoi »). La panne étant un démarrage impossible, elle ne
dépend pas des tests choisis ; mais l'AC2 demande « 0 échec des deux côtés » sur la suite entière, et
tant que ce n'est pas mesuré, `CLAUDE.md` et D-49 gardent la prudence — c'est l'AC5 appliquée à la
lettre : la restriction ne disparaît pas avant de cesser d'être vraie.

**Hors ticket, mais bloquant, et à corriger dans le worktree, pas ici** : `takussan-api/vendor`
était un lien symbolique vers celui du worktree principal. `__DIR__` résolvant les liens, `$baseDir`
de l'autoloader Composer pointait sur le worktree PRINCIPAL : **tout `App\…` et tout `Tests\Support\…`
était chargé depuis l'autre arbre**, y compris `Application::inferBasePath()` et donc `storage/`.
Aucune modification de `tests/Support/` n'était exécutable ici. Remplacé par une copie réelle
(121 Mo, `cp -R`, sans réseau ni `composer install`). Un lien symbolique par entrée ne suffit pas :
les binaires (`vendor/phpunit/phpunit/phpunit`) chargent l'autoload de leur propre `__DIR__` résolu,
et deux autoloaders se percutent sur `Cannot redeclare ComposerAutoloaderInit…`.

## Ce que ce ticket ne fait pas

- Il ne remet pas en cause `--parallel` pour un agent seul : les cinq exécutions d'épreuve de
  TCK-321 sont vertes.
- Il ne touche pas à `bin/impacted-tests.php`, qui reste séquentiel et concurrent-safe.
