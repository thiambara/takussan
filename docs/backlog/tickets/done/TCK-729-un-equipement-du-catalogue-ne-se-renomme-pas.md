---
id: TCK-729
title: "Un équipement du catalogue ne se renomme pas : 409, seules les propositions se renomment"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-30--équipements-du-catalogue--traduction-par-slug-renommage-et-fusion"
tags: [back, tags, moderation, pistes]
---

## Contexte

Réf : **P30.01** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

`TagModeration::renommer()` n'écrit que `name` : le slug reste celui du nom d'origine. Les deux
routes de renommage y mènent (`PATCH /api/admin/tags/{tag}`, `PUT /api/tags/{tag}`). Le front
traduit un équipement du catalogue par son slug, si bien qu'un renommage ne change rien à l'écran ;
et `TagCatalog::synchroniser()`, joué à chaque déploiement, cherche chaque nom du catalogue par son
nom, ne le trouve plus, et le recrée sous `<slug>-2`, que les fichiers de traduction ne connaissent
pas.

## Décision du porteur

refuser en 409 le renommage d'un équipement du catalogue ; seules les propositions se renomment ; un test : renommage refusé puis synchroniser() → une seule ligne pour ce slug

## Objectif utilisateur

Le super-admin ne peut plus renommer un équipement du catalogue : la console lui répond qu'il ne
se renomme pas, et le déploiement suivant ne crée aucun doublon.

## Contraintes strictes (métier)

- Un équipement hors du catalogue (proposition, en attente ou approuvée) se renomme comme avant.
- Le nom se compare comme `TagCatalog::assurer()` : casse repliée (`CaseInsensitive::fold`),
  accents gardés.

## Delta à produire

- [x] `TagCatalog::estUnEquipement(string $nom)` : le nom figure-t-il dans `EQUIPEMENTS`, casse
  repliée.
- [x] `TagModeration::renommer()` : sur la ligne verrouillée, 409 `tags.catalog_rename_forbidden`
  si son nom est celui d'un équipement du catalogue. Les deux routes passent par là.
- [x] `lang/{fr,en,wo}/errors.php` : le message de `tags.catalog_rename_forbidden` (en `wo`, le
  texte français tel quel : wolof en pause depuis le 2026-10-16).
- [x] `tests/Feature/Tags/TagCatalogRenommageTest.php`.

## Critères d'acceptation

- [x] AC1 — Catalogue chargé, `PATCH /api/admin/tags/{Piscine}` → 409
  `tags.catalog_rename_forbidden`, le nom reste « Piscine » ; `synchroniser()` rejoué → une seule
  ligne pour le slug `piscine` (`Piscine|piscine`).
- [x] AC2 — Même chose par `PUT /api/tags/{Piscine}`.
- [x] AC3 — Une ligne qui porte un nom du catalogue à la casse près (`SÈCHE-LINGE`) est refusée
  de même.
- [x] AC4 — Une proposition (`Piscinne`) se renomme toujours (200).

## Hors périmètre

- P30.02 (fusion dont la source est un équipement du catalogue) et P30.03 (slug du catalogue pris
  par une proposition) : leurs entrées propres.
- Les étiquettes CRM du catalogue (`TagCatalog::CRM`) : la décision ne vise que les équipements.
  Leur renommage reste possible, et `synchroniser()` les recréerait de même (lu, `assurer()`).
- La console n'empêche pas d'ouvrir le renommage d'un équipement du catalogue : elle affiche le
  refus que l'API rend (la prose localisée, `messageErreurApi`).

Hypothèses (mode sans humain) :
- « équipement du catalogue » = une ligne dont le nom figure dans `TagCatalog::EQUIPEMENTS`, casse
  repliée, quels que soient son type et son statut : c'est la ligne que `synchroniser()` retrouve ;
- « proposition » = tout équipement hors de cette liste, approuvé compris.

## Notes d'implémentation

- Ablation : garde du 409 retirée de `renommer()`, « 3 failed, 1 passed » (200 au lieu de 409) ;
  remise, 4 verts.
- Le cas AC4 est vert sans le correctif : il garde l'autre versant, pour qu'un refus de tout
  renommage ne passe pas.
