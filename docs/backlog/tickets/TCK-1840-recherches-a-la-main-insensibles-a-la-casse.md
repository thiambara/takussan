---
id: TCK-1840
title: "La file de modération des biens, le journal de l'agence et le repli SQL de filter[search] cherchent sans tenir compte de la casse, et `%` n'y est plus un joker"
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
  features:
    - "docs/features.md#26-audit--traçabilité"
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-186--paramètres-du-front-lus-par-une-liste-écrite-à-la-main"
tags: [api, recherche, postgresql, casse, pistes]
---

## Contexte

Réf : **P186.02** du fichier de pistes, `retenu · autonome` (A1). Trois recherches écrites à la
main gardaient un `like` nu : `PropertyModerationController::index` (`title`, `reference_number`),
le filtre `search` d'`AuditLogController` (`description`) et le repli SQL de `filter[search]` dans
`HasQueryBuilder` (modèles non `Searchable` : `AgencyRole`, `BankStatementLine`, `GeoNeighborhood`,
`Invitation`, `Tag`, profils). Sous PostgreSQL, `like` est sensible à la casse (piège n° 9 du
CLAUDE.md de l'API), et `%` saisi valait un joker qui rendait tout. TCK-600 a corrigé les deux
recherches voisines de la console ; ces trois-là sont restées.

## Objectif utilisateur

Un admin d'agence qui tape « villa » dans la file de modération trouve « Villa Almadies » ; « diop »
trouve « Relance Diop » dans le journal ; un `%` ne rend plus toute la liste.

## Contrat de données

Aucun changement de forme : mêmes routes, mêmes paramètres (`filter[search]`), mêmes réponses.

## Contraintes strictes (métier)

- Forme de TCK-600 : `CaseInsensitive::sql($col).' like ?'` avec `CaseInsensitive::fold()` et
  `addcslashes($valeur, '\\%_')`.
- Pas de repli d'accents (ADR-0025) ; `MARCHÉ` trouve `Marché` par la collation ICU.

## Delta à produire

- [x] `PropertyModerationController::index` : recherche sur `title` et `reference_number`.
- [x] `AuditLogController` : rappel `search` sur `description`.
- [x] `HasQueryBuilder` : repli SQL de `filter[search]`.
- [x] Test : `tests/Feature/Api/RechercheEcriteALaMainCasseTest.php`.

## Critères d'acceptation

- [x] AC1 — File de modération, « Villa Almadies » : `Villa`, `villa`, `VILLA` → le bien ; `%` → rien.
- [x] AC2 — Journal, « Relance Diop » : `Diop`, `diop`, `relance` → l'entrée ; `%` → rien.
- [x] AC3 — `Tag::buildQuery`, « Marché Sandaga » : `Sandaga`, `sandaga`, `MARCHÉ` → l'étiquette ; `%` → rien.

## Hors périmètre

- Les autres `like` nus du dépôt qui ne sont pas cités par la piste.

## Notes d'implémentation

- Reproduction : les trois tests neufs rouges avant correctif (`villa`, `diop`, `sandaga` → aucune ligne).
- Ablation : `git checkout -- app` → 3 rouges ; correctif remis → 3 verts (20 assertions).
- Le repli de `HasQueryBuilder` passe chaque champ déclaré par `CaseInsensitive::sql()`, qui
  refuse tout identifiant non littéral : les `$requestSearchFields` actuels sont tous des colonnes
  `string` simples.
