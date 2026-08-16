---
id: TCK-319
title: "Porter `WatermarkService` sur intervention/image 4 — `place()` devient `insert()`, et l'opacité change d'unité"
status: todo
phase: P3
family: back
estimate: S
wave: 39
created: 2026-08-16
updated: 2026-08-16
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
tags: [back, media, dette, dependances]
---

## Objectif utilisateur

Que le filigrane apposé sur les photos reste **exactement** celui qu'on a réglé — même position,
même opacité — quand la bibliothèque qui le dessine change de version majeure.

## Le constat

La PR #181 monte `intervention/image` de 3.11.8 à 4.2.1. Mesuré le 2026-08-16 sur la branche de la
PR : **7 tests de `WatermarkServiceTest` et 4 de `MediaPolicyTest` rougissent**, tous sur la même
cause.

```
Call to undefined method Intervention\Image\ImageManager::read()
  at app/Services/Media/WatermarkService.php:14
```

*(Les 4 de `MediaPolicyTest` ne sont pas un dommage collatéral d'environnement : cette classe
exerce `WatermarkService`. Vérifié.)*

Un seul fichier est concerné — `app/Services/Media/WatermarkService.php` — mais l'écart n'est pas
un simple renommage.

### Ce que v4 change, mesuré par réflexion sur le paquet installé

| v3 (installé) | v4.2.1 | nature du changement |
|---|---|---|
| `ImageManager::read($path)` | `ImageManager::decodePath($path)` | **supprimée** — v4 expose des décodeurs explicites (`decode`, `decodePath`, `decodeBinary`, `decodeStream`, …) |
| `Image::place($img, $position, $x, $y, $opacity)` | `Image::insert($img, $x, $y, $alignment, $transparency)` | **supprimée**, et son remplaçant n'a NI le même ordre d'arguments NI la même unité |

Le second point est le piège, et c'est lui qui justifie une fiche plutôt qu'une case dans un bump :

- **l'ordre change** — `place()` prend la position en 2ᵉ argument, `insert()` la prend en 4ᵉ, après
  `$x` et `$y` ;
- **l'unité change** — `place()` prenait `$opacity` en entier `0-100`, `insert()` prend
  `$transparency` en flottant `0.0-1.0`. Passer `$context->opacity` (60) tel quel à `insert()` ne
  lèvera **aucune erreur** : ça produira un filigrane silencieusement faux ;
- la position passe d'une chaîne v3 à `Intervention\Image\Alignment` — il faut reprendre
  `AgencyWatermarkContext::position->toInterventionPosition()`.

Ce qui NE change pas, vérifié : `scaleDown()`, `save()`, `width()`, `height()` existent toujours.

## Delta à produire

- [ ] `ImageManager::read()` → `decodePath()` — 2 sites d'appel (lignes 14 et 27).
- [ ] `Image::place()` → `insert()` — 2 sites, en reprenant l'ordre des arguments.
- [ ] **Convertir l'opacité** `0-100` → `0.0-1.0`, à UN seul endroit, et nommer la conversion.
      Ne pas la disséminer dans les appels.
- [ ] Reprendre `AgencyWatermarkContext::position->toInterventionPosition()` pour rendre un
      `Intervention\Image\Alignment` plutôt qu'une chaîne v3.
- [ ] Vérifier que `intervention/gif` (monté à 5.0.1 par la même PR) n'introduit rien d'autre.

## Critères d'acceptation

- [ ] AC1 — `php artisan test --filter='Watermark|MediaPolicy'` : 0 échec.
- [ ] AC2 — **L'opacité est vérifiée en valeur, pas seulement en différence.** Le test actuel
      (« opacity 60 vs 30 produces different pixels ») passerait avec une conversion fausse dans
      les deux sens : il compare deux rendus entre eux, jamais à une attente. Ajouter une
      assertion qui échoue si l'unité est mal convertie.
- [ ] AC3 — La suite backend complète reste à 0 échec.
- [ ] AC4 — Un rendu avant/après est comparé à l'œil sur une photo réelle, aux quatre positions.
      C'est du visuel : aucun test de pixels ne remplace un coup d'œil.

## Hors périmètre

- Toute évolution du filigrane lui-même (police, marges, nouvelles positions).
- `maatwebsite/excel` 4 — traité à part, mergé, sans rupture pour ce dépôt.

## Notes d'implémentation

⑴ La PR #181 reste ouverte tant que ce portage n'est pas fait. Dependabot est en pause
(#194) : elle ne sera pas recréée ni rebasée toute seule.

⑵ Pourquoi ce n'est pas fait directement dans le bump : une conversion d'unité qui ne lève pas
d'erreur est exactement le genre de correctif qu'on croit terminé parce que les tests passent. Le
test d'opacité existant compare deux rendus l'un à l'autre — il ne peut pas distinguer une échelle
juste d'une échelle fausse. Il faut d'abord renforcer le test, ensuite porter.
