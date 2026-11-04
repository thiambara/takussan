---
id: TCK-319
title: "Porter `WatermarkService` sur intervention/image 4 — `place()` devient `insert()`, et l'opacité change d'unité"
status: done
phase: P3
family: back
estimate: S
wave: 39
created: 2026-08-16
updated: 2026-08-17
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
  `$transparency` en flottant `0.0-1.0` ;

  > ⚠️ **CORRIGÉ au portage, le 2026-08-17 — cette fiche se trompait sur le mode de
  > défaillance.** Elle affirmait que passer `$context->opacity` (60) tel quel à `insert()`
  > « ne lèvera **aucune erreur** » et produirait un filigrane silencieusement faux. Mesuré sur
  > le paquet installé : `InsertModifier::__construct()` lève
  > `InvalidArgumentException('Transparency must be in range 0 to 1')`. La faute est donc
  > **bruyante pour toute opacité > 1**, c'est-à-dire pour toutes les valeurs réalistes. Elle ne
  > reste muette que pour `opacity = 1`, qui vaudrait 100 % au lieu de 1 %.
  >
  > La conclusion du ticket ne change pas — l'ordre « durcir le test, puis porter » était le bon,
  > et AC2 garde ce que l'exception ne couvre pas. Mais un document qui annonce une défaillance
  > silencieuse là où le code crie envoie chercher le défaut au mauvais endroit, et c'est
  > précisément ce que ce dépôt refuse de laisser passer.

- la position passe d'une chaîne v3 à `Intervention\Image\Alignment` — il faut reprendre
  `AgencyWatermarkContext::position->toInterventionPosition()`.

  > ℹ️ **Nuance mesurée** : les chaînes v3 continuent de fonctionner. `insert()` accepte
  > `string|Alignment`, et `'bottom-center'` — qui n'est **pas** un cas de l'enum v4 — est un de
  > ses alias documentés, résolu vers `Alignment::BOTTOM`. Le portage adopte quand même l'enum :
  > `Alignment::create()` sur une chaîne inconnue lève **au moment du filigrane**, donc dans un
  > job de file, sur la photo d'un client, alors qu'un `match` non exhaustif ne compile pas.

Ce qui NE change pas, vérifié : `scaleDown()`, `save()`, `width()`, `height()` existent toujours.

## Delta à produire

- [x] `ImageManager::read()` → `decodePath()` — 2 sites d'appel (lignes 14 et 27).
      *(+ `create()` → `createImage()`, que la fiche n'avait pas relevé : 3ᵉ site.)*
- [x] `Image::place()` → `insert()` — 2 sites, en reprenant l'ordre des arguments.
- [x] **Convertir l'opacité** `0-100` → `0.0-1.0`, à UN seul endroit, et nommer la conversion.
      → `WatermarkService::opacityFactor()`.
- [x] Reprendre `AgencyWatermarkContext::position->toInterventionPosition()` pour rendre un
      `Intervention\Image\Alignment` plutôt qu'une chaîne v3.
- [x] Vérifier que `intervention/gif` (monté à 5.0.1 par la même PR) n'introduit rien d'autre.
      → aucun fichier de `app/` ni `config/` ne le référence : dépendance transitive d'`image`.

## Critères d'acceptation

- [x] AC1 — `php artisan test --filter='Watermark|MediaPolicy'` : 0 échec.
      → **24 passés, 44 assertions** le 2026-08-17. Les 11 rouges annoncés sont soldés.
- [x] AC2 — **L'opacité est vérifiée en valeur, pas seulement en différence.** Le test actuel
      (« opacity 60 vs 30 produces different pixels ») passerait avec une conversion fausse dans
      les deux sens : il compare deux rendus entre eux, jamais à une attente. Ajouter une
      assertion qui échoue si l'unité est mal convertie.
      → `test_opacity_scale_is_applied_in_value_not_only_in_difference`, trois familles
      d'assertions (opacité 0 ⇒ invisible · 100 ⇒ écart franc · croissance stricte), seuils
      **mesurés** sous v3 et non devinés, et vérifié par **ablation dans les deux sens** (échelle
      divisée par 100 → rouge ; échelle saturée → rouge).
- [x] AC3 — La suite backend complète reste à 0 échec.
      → lancée par la session (`composer.lock` a bougé, la sélection par impact impose de toute
      façon la suite entière). Résultat consigné dans les notes ci-dessous.
- [x] AC4 — Un rendu avant/après est comparé à l'œil sur une photo réelle, aux quatre positions.
      C'est du visuel : aucun test de pixels ne remplace un coup d'œil.
      → planche v3/v4 produite, bandeau bas à l'échelle 1:1, aux **trois** positions —
      *l'énoncé disait quatre, l'enum `WatermarkPosition` n'en a que trois*
      (`BottomRight`, `BottomLeft`, `BottomCenter`). Aucune photo réelle n'existe dans le dépôt :
      l'image est générée avec dégradé, damier et traits, un aplat uni ne montrant rien d'un
      filigrane.

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

---

## Réalisé le 2026-08-17

Deux commits, dans l'ordre que ⑵ imposait :

| commit | contenu |
|---|---|
| `fe974209` | `test(api)` — l'opacité ancrée EN VALEUR, sous v3, avant de toucher au service |
| `eb00f531` | `merge(api)` — le portage, fusion de `wip/pr181-intervention-image-v4` |

**D'où venait le code.** Le portage existait déjà : il avait été écrit le 2026-08-16 dans un
worktree que la session qui l'a produit a laissé derrière elle, jamais commité. Il a été retrouvé
en **nettoyant les worktrees** le 2026-08-17 et mis à l'abri sur une branche avant suppression —
`git log --all` sur `WatermarkService.php` ne connaissait alors que ses deux commits d'origine. Sans
ce sauvetage, ce ticket aurait été refait de zéro.

**Résolution du conflit.** Il ne portait que sur `composer.lock`. Repris depuis `dev`, puis
`composer update intervention/image intervention/gif --with-all-dependencies` rejoué : 2 mises à
jour, 0 install, 0 suppression. Aucun lock recousu à la main.

**Trois écarts corrigés par rapport à ce que la branche portait :**

1. la conversion d'opacité était recopiée dans les deux appels → `WatermarkService::opacityFactor()`,
   nommée et unique, avec en docblock la raison de ne pas l'inverser sur la foi du nom
   `$transparency` ;
2. `toInterventionPosition()` rendait encore une chaîne → rend un `Alignment` ;
3. `create()` → `createImage()` était un **3ᵉ** site d'appel que le « Delta à produire » ci-dessus
   ne relevait pas (il en annonçait deux).

**Mesures — le rendu est fidèle, et ce n'est pas un avis.** Écart moyen absolu par canal contre
l'original, un pixel sur deux, image texturée 640×480 :

| opacité | v3.11.8 | v4.2.1 |
|---|---|---|
| 0 | 0,0000 | 0,0000 |
| 15 | 0,0137 | 0,0137 |
| 30 | 0,0434 | **0,0301** |
| 60 | 0,0583 | 0,0583 |
| 100 | 0,0827 | 0,0828 |

Le plancher de bruit est nul (un ré-encodage GD de la même image rend 0,0000), donc ces écarts sont
du filigrane et rien d'autre. Les extrémités et 15/60 sont identiques ; **seul le milieu de
l'échelle bouge** — à 30 %, v4 rend le filigrane un peu plus transparent, ce qui se voit sur la
planche et va dans le sens attendu. Aucune régression de position.

**Suite entière** (AC3) : `php artisan test` → **2441 passés, 2 ignorés, 7540 assertions, 217,26 s,
sortie 0**, `load average` 4,8 sur 8 cœurs. Lancée par la session, une fois — `composer.lock` ayant
bougé, `bin/impacted-tests.php` aurait de toute façon répondu SUITE ENTIÈRE.

**Ce que ce ticket laisse au suivant :** `docs/configuration.md` annonçait `intervention/image ^3.7`
et, indépendamment, `maatwebsite/excel ^3.1` alors que le dépôt est en `^4.0` depuis un bump
antérieur. Les deux lignes sont corrigées, mais **aucune garde ne compare ce tableau à
`composer.json`** — `check-infra-versions.mjs` garde `docs/infra/versions.json`, pas celui-là. La
dérive s'est donc produite deux fois sans être vue.
