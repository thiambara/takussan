---
id: TCK-1307
title: "Cas d'enum sans écrivain déclarés réservés ; `BankStatement::scopeOpen()` et l'`AgencyStatus` `pending` du front retirés"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#44-agencysubscription-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-115--statuts-denum-quaucun-chemin-de-app-nécrit"
tags: [api, front, enums, pistes]
---

## Contexte

Réf : **P115.07** du fichier de pistes, `validé` par le porteur.

Sept cas d'enum n'ont aucun écrivain dans `app/` (re-mesuré par `grep`, et aucune règle
`Rule::enum` sur ces statuts) : `ConversationStatus::Archived`/`Closed`,
`BankStatementStatus::Archived`, `PayoutStatus::Processing`, `ServiceProviderBillStatus::Cancelled`,
`RelationshipStatus::Ended`/`Suspended`. `BankStatement::scopeOpen()` n'a aucun appelant et range
`failed` parmi les relevés ouverts quand `isClosed()` le dit clos. Le type `AgencyStatus` du front
ajoute `pending`, que l'enum de l'API n'a pas.

## Décision du porteur

porteur (2026-10-22) : en deux temps : retirer d'abord ce qui est sans choix (`scopeOpen()` de `BankStatement`, `pending` du type `AgencyStatus` du front), puis déclarer réservés les cas sans écrivain

## Objectif

Le code ne laisse plus croire que ces statuts arrivent, et ce qui était sans appelant ou faux est
retiré.

## Delta à produire

- [x] Retirer `BankStatement::scopeOpen()`.
- [x] Retirer `pending` de `AgencyStatus` (`takussan-web/src/types/agency.ts`).
- [x] Docblock « Réservé (TCK-1307, P115.07) » sur les sept cas.
- [x] Garde : `tests/Unit/Architecture/CasDEnumReservesTest.php` — chaque cas réservé le dit, aucun
      chemin de `app/` ne l'écrit (`=> X::Cas` ou `= X::Cas`), `scopeOpen()` absent.

## Critères d'acceptation

- [x] AC1 — `BankStatement` n'a plus de `scopeOpen()`.
- [x] AC2 — `AgencyStatus` du front vaut `active | inactive | suspended`, et `tsc` passe.
- [x] AC3 — Les sept cas portent la marque « Réservé » ; une écriture neuve d'un de ces cas fait
      rougir la garde.

## Hors périmètre

- Retirer ces cas, leurs libellés ou leurs types au front : la décision les garde, réservés.
- Écrire un de ces statuts (geste neuf) : choix de produit.

## Notes d'implémentation

- Ablation : docblock de `PayoutStatus::Processing` retiré → 1 rouge ; fichier temporaire
  `['status' => PayoutStatus::Processing]` dans `app/` → 1 rouge qui le nomme ; `scopeOpen()`
  présent (avant correctif) → 1 rouge ; tout remis → vert.
- La garde ne voit que les écritures par la constante, pas par un littéral `'processing'` :
  plancher, pas preuve.
