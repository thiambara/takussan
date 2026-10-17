---
id: TCK-749
title: "Noms de champs de validation traduits en anglais"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-17
updated: 2026-10-17
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-6--texte-affiché-par-lapi-et-i18n-frenwo"
tags: [back, i18n, validation, pistes]
---

## Contexte

Réf : **P06.08** du fichier de pistes, `validé` (critère accordé : V7). `lang/fr/validation.php`
et `lang/wo/validation.php` traduisent 55 noms de champ (bloc `attributes`, TCK-536) ;
`lang/en/validation.php` n'en a aucun, et l'anglais rend le nom brut : « The property id field is
required. », « The guests field is required. ».

## Décision du porteur

traduire en anglais les 55 attributs déjà traduits en fr

## Objectif

Les 55 noms de champ traduits en français le sont aussi en anglais.

## Contrat de données

Aucun changement de forme : seul le texte des messages 422 en anglais change pour ces 55 champs.

## Contraintes strictes

- Mêmes clés et même ordre que le bloc français, pour qu'une relecture les confronte ligne à ligne.
- Le wolof n'est pas touché (en pause depuis le 2026-10-16).

## Delta à produire

- [x] Bloc `attributes` dans `lang/en/validation.php`.
- [x] `tests/Feature/Http/Requests/AttributsDeValidationTraduitsTest.php`.

## Critères d'acceptation

- [x] AC1 — Les clés de `validation.attributes` sont les mêmes en `fr` et en `en`, aucune vide.
- [x] AC2 — En `en`, `property_id`, `guests` et `id_number` requis rendent « The property field… »,
  « The number of guests field… », « The ID number field… ».

## Hors périmètre

- Les quelque 350 autres noms de champ validés, sans nom en aucune langue (autre option de la
  `Piste`, non retenue par le porteur).

## Notes d'implémentation

- Avant correctif : 2 rouges sur 2 (`validation.attributes` absent en `en`). Ablation : fichier
  d'avant remis → les 2 mêmes rouges ; remis → 2/2 verts.
