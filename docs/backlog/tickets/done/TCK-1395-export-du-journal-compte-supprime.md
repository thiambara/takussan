---
id: TCK-1395
title: "L'export du journal nomme un compte supprimé au lieu de l'imputer au système"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#26-audit--traçabilité"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-139--colonnes-des-exports-quaucun-chemin-nécrit-ou-qui-lisent-une-clé-nommée-autrement"
tags: [back, audit, export, pistes]
---

## Objectif utilisateur

Dans l'export du journal (agence et console), une ligne causée par un compte depuis supprimé ne
dit plus « system » : elle dit `deleted#<id>`, comme l'écran du journal.

## Contexte

Réf : **P139.01** du fichier de pistes, `validé` (critère V7 cité par le classement, accordé ;
le V3 relevé par le délégué est tranché par la précision du porteur).

Mesuré avant correctif (test de garde ci-dessous, rouge sur `e72d2ad69`) : un agent cause une
ligne sur un bien de l'agence, puis son compte est supprimé en douceur → `buildPayload()` et
`payloadForQuery()` rendent `causer_email = "system"`, `causer_role = "system"`. La relation
`causer()` est un `morphTo()` nu : la portée `SoftDeletes` de `User` s'y applique.

## Décision du porteur

> porteur (2026-10-22) : `causer_email` = `deleted#<causer_id>` et `causer_role` = `deleted` quand le causeur ne se charge plus ; `system` réservé aux lignes sans `causer_id`

## Hypothèses (mode sans humain)

- Le causeur n'est pas chargé `withTrashed()` : l'adresse anonymisée ne sort pas (recommandation
  du délégué, conforme à la décision).
- Un causeur chargé mais sans aucun profil garde `causer_role = system`, comme avant : hors de
  la décision, qui ne vise que le causeur qui ne se charge plus.

## Delta à produire

- [x] `ActivityLogExporter::mapRow()` : `deleted#<causer_id>` / `deleted` quand `causer_id` est
  posé et que le causeur est nul.
- [x] Test : `tests/Feature/Audit/CauseurSupprimeDansLExportTest.php` (export d'agence et export
  de la console).

## Critères d'acceptation

- [x] AC1 — Export d'agence : la ligne d'un compte supprimé rend `deleted#<id>` et `deleted`.
- [x] AC2 — Export de la console : idem.
- [x] AC3 — Une ligne sans `causer_id` rend toujours `system` / `system`.

## Notes d'implémentation

- Ablation : `ActivityLogExporter.php` rendu à son état antérieur → 2 rouges (`system` au lieu de
  `deleted#<id>`) ; remis → 2 verts.
