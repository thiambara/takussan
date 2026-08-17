---
id: TCK-322
title: "Deux exécutions `--parallel` simultanées se cassent l'une l'autre au démarrage — une quatrième ressource partagée par machine"
status: todo
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

## Ce que ce ticket ne fait pas

- Il ne remet pas en cause `--parallel` pour un agent seul : les cinq exécutions d'épreuve de
  TCK-321 sont vertes.
- Il ne touche pas à `bin/impacted-tests.php`, qui reste séquentiel et concurrent-safe.
