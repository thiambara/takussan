---
id: TCK-364
title: "Console super-admin — dates et libellés techniques localisés (fr / en / wo)"
status: todo
phase: P2
family: front
estimate: S
wave: 46
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
    - docs/features.md#29-administration--configuration
  models: []
tags: [front, i18n, super-admin]
---

## Objectif utilisateur

Un super-admin qui bascule la console en anglais ou en wolof lit des dates et des libellés dans sa langue — pas des dates françaises et des mots anglais codés en dur.

## Contrat de données

- Ticket purement frontend. L'API émet des codes ; les libellés appartiennent au front (principe non négociable n°5 du dépôt).

## Direction UX / Artistique

Relevé du 2026-08-26 sur la console :

| Constat | Volume |
|---|---|
| `toLocaleString('fr-FR')` / `Intl.*('fr-FR')` codés en dur | **18 occurrences, 13 fichiers** — les dates restent françaises en `en` et en `wo` |
| Libellés de sondes non traduits dans `system-health.tsx` | `DB`, `Cache`, `Storage`, `Mail`, `SMS` — écrits dans un tableau de constantes |
| Statuts affichés bruts | `status?.status` rend `ok` / `error` tels que l'API les émet |

Le patron du dépôt pour ce cas est établi : **la donnée porte la clé, le rendu la résout** (TCK-286) — une table de constantes hors composant transporte une clé de traduction, jamais un libellé.

## Contraintes strictes (métier)

- La locale de formatage vient de next-intl, jamais d'une chaîne littérale.
- Les valeurs qui sont des **jetons d'API ou d'URL** (`pending`, `-reported_at`, `__all__`…) ne se traduisent pas : seuls leurs libellés d'affichage le sont.
- Les trois dictionnaires (`fr`, `en`, `wo`) sont complétés ensemble — une clé ajoutée à un seul est une régression silencieuse.
- La frontière de dictionnaire de `(super-admin)/super-admin` est cumulée et gardée : toute nouvelle clé doit rester dans son périmètre.

## Delta à produire

- [ ] Remplacement des 18 formatages `'fr-FR'` par un formatage piloté par la locale active (utilitaire partagé plutôt que 18 appels dispersés)
- [ ] `system-health.tsx` : libellés de sondes portés par clé, statuts `ok` / `error` traduits
- [ ] Complément des trois dictionnaires `fr` / `en` / `wo`
- [ ] Tests : rendu d'une date et d'un statut de sonde dans les trois locales

## Critères d'acceptation

- [ ] AC1 — `grep -rn "'fr-FR'" takussan-web/src/app/\(super-admin\) takussan-web/src/components/admin/super takussan-web/src/components/super-admin` (hors tests) ne renvoie aucun résultat
- [ ] AC2 — aucun libellé affiché de `system-health.tsx` n'est une chaîne littérale : les cinq sondes et les statuts passent par une clé
- [ ] AC3 — un test rend la même date dans les trois locales et **obtient trois chaînes différentes** (un test qui ne vérifie que `fr` cocherait aussi le comportement actuel)
- [ ] AC4 — les trois dictionnaires portent exactement le même ensemble de clés
- [ ] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- L'i18n du reste du dépôt (dette D-24 : 82 fichiers sur 875).
- Les fuseaux horaires par utilisateur.
- La traduction des contenus saisis par les utilisateurs.

## Notes d'implémentation

_(Rempli pendant le travail par spec-coder — décisions techniques, gotchas, PR liée, etc.)_
