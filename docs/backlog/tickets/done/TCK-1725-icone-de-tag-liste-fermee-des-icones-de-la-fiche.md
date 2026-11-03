---
id: TCK-1725
title: "L'icône d'un tag se choisit parmi celles que la fiche publique sait rendre, et une icône inconnue ne masque plus celle du slug"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#10-tag"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-159--exemples-et-formats-montrés-à-la-saisie-face-à-la-règle-qui-jugera-la-valeur"
tags: [front, console, tags, amenities, pistes]
---

## Contexte

Réf : **P159.02** du fichier de pistes (« Le champ « Icône (nom Lucide) » des tags attend en
réalité un slug du catalogue, et un nom Lucide remplace l'icône par l'icône générique »).

La console des tags offrait un champ libre « Icône (nom Lucide) », d'exemple `wifi`. La fiche
publique cherchait l'icône par `getAmenityIcon(tag.icon ?? tag.slug)` dans `AMENITY_ICONS`, indexée
par les slugs du catalogue : un nom Lucide saisi (`waves`, `tree-pine`) n'y était pas, la fiche
rendait `Building2`, et l'icône que le slug donnait était perdue.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

Recommandation du délégué, que la décision retient : « garder le champ, servi par une liste fermée
des clés de `AMENITY_ICONS`, avec la recherche `AMENITY_ICONS[icon] ?? AMENITY_ICONS[slug] ??
Building2` et le test « un tag `piscine` d'icône `waves` rend `Waves` » ».

Choix de l'implémenteur, là où la recommandation laisse une voie ouverte (« le libellé des options
de la liste ») : chaque option se nomme par l'équipement du catalogue dont la clé est le slug
(`property.amenityCatalog.<slug>`, traductions existantes), plus une option « Aucune (celle du
slug) » ; le libellé du champ devient « Icône » / « Icon ». La liste fermée vit dans le seul front :
l'API accepte toujours toute chaîne, et la recherche retombe sur le slug pour une valeur inconnue.

## Delta à produire

- [x] `amenity-icons.ts` : `getAmenityIcon(icon, slug?)` cherche `icon`, puis `slug`, puis rend
      l'icône générique ; `AMENITY_ICON_KEYS` exporte les clés de la table.
- [x] `PropertyAmenities.tsx` : `getAmenityIcon(tag.icon, tag.slug)`.
- [x] `TagsManager.tsx` : le champ libre devient un `Select` des clés, nommées par le catalogue.
- [x] `adminTags.form.icon` en `fr`/`en`, et `adminTags.form.iconNone` neuve (`wo` = le français).

## Critères d'acceptation

- [x] AC1 — un tag `piscine` d'icône `waves` rend `Waves` sur la fiche ; une icône de la table
      l'emporte sur le slug ; ni l'une ni l'autre connues → `Building2`.
- [x] AC2 — la console n'offre plus de champ libre d'exemple `wifi` : l'icône se choisit parmi les
      clés de `AMENITY_ICONS`, et part par sa clé (`piscine`).

## Hors périmètre

- Borner `icon` côté API à la liste des clés : la table vit dans le front, et la recherche
  retombe désormais sur le slug.
- Le libellé `wo` d'`adminTags.form.icon` (« Ikon (turu Lucide) ») cite encore Lucide : le wolof
  est en pause, il ne se réécrit pas.
- Le message `validation.tag.iconTooLong` n'est plus atteignable depuis le dialogue.

## Notes d'implémentation

- Avant le correctif : AC1 (premier cas) et AC2 rouges — `lucide-building-2` rendu au lieu de
  `lucide-waves`, et le champ `wifi` présent.
- Ablation : `PropertyAmenities.tsx` et `TagsManager.tsx` rendus à leur version d'avant, les tests
  gardés → 2 rouges (les deux cas ci-dessus) ; remis → 50 verts sur les quatre fichiers.
- Le test voisin qui saisissait 61 caractères dans le champ d'icône pour obtenir « Nom d'icône
  trop long » ne peut plus le faire : cette assertion est retirée, comme celle de `description`.
- Option « Aucune » : une `SelectItem` ne porte pas de chaîne vide, d'où la sentinelle
  `__aucune__` (même patron que `__all__` dans `CalendarPage`).
