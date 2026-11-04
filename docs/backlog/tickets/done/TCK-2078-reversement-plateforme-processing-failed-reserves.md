---
id: TCK-2078
title: "Un reversement plateforme `processing` ou `failed` est déclaré réservé, et la console ne les propose plus en filtre"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features: []
  models:
    - "docs/models-spec.md#45-platformpayout-"
  adr: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#un-reversement-plateforme-ne-passe-jamais-processing-ni-failed-mais-la-console-les-propose-en-filtre-et-la-matrice-en-fait-des-étapes"
tags: [api, web, console, reversements, pistes]
---

## Contexte

Réf : **P196.01** du fichier de pistes (🟠, `validé`). Aucun chemin de `app/` ne pose
`PlatformPayoutStatus::Processing` ni `::Failed` : `approve`, `markPaid`, `cancel` et la clôture
posent `approved`, `paid`, `cancelled` et `pending` ; seule la matrice de `PlatformPayoutService`
les nomme (re-mesuré : `grep -rn "PlatformPayoutStatus::Processing\|PlatformPayoutStatus::Failed" app database routes`
→ les deux lignes de la matrice). Le filtre de statut de la console super-admin (`AdminPayoutsClient`)
les proposait pourtant, et rendait toujours une liste vide.

**Décision du porteur** : validé — validation du porteur (2026-10-23) : retirer `processing` et `failed` de la console et les marquer « Réservé », comme TCK-1307 ; après P182.05

P182.05 est faite (TCK-2056).

## Objectif utilisateur

Le super-admin ne se voit plus proposer deux statuts qu'aucun reversement ne prend.

## Contraintes strictes (métier)

- Les cas restent dans l'enum et dans la matrice : rien ne change en base ni dans les transitions.
- Le patron de TCK-1307 : docblock « Réservé » et liste de `CasDEnumReservesTest`, qui rougit le jour
  où un chemin de `app/` les écrit.

## Hypothèses (mode sans humain)

- « La console » : le filtre de statut de la liste. La pastille (`PayoutTable`) garde un ton pour
  chaque cas de l'enum, et le panneau de détail son geste « marquer payé » depuis `processing`, que la
  matrice admet : sans écrivain, ni l'un ni l'autre n'est visible.

## Delta à produire

- [x] `PlatformPayoutStatus` : docblock « Réservé » sur `Processing` et `Failed`.
- [x] `tests/Unit/Architecture/CasDEnumReservesTest.php` : les deux cas ajoutés.
- [x] `AdminPayoutsClient` : `processing` et `failed` retirés des options du filtre.
- [x] Test : `src/components/billing/__tests__/AdminPayoutsClient.pagination.tck-1751.test.tsx`.

## Critères d'acceptation

- [x] AC1 — les deux cas sont déclarés réservés, et aucun chemin de `app/` ne les écrit.
- [x] AC2 — le filtre de statut propose « En attente », « Approuvé », « Payé », « Annulé », ni « En cours » ni « Échec ».

## Hors périmètre

- Des gestes `mark-processing` / `mark-failed` (l'autre branche de la piste, non retenue).
- La ligne de `docs/models-spec.md` qui énumère les six valeurs de l'enum : elle reste juste.

## Notes d'implémentation

- Ablation : docblocks retirés → `CasDEnumReservesTest` 1 rouge ; filtre d'origine remis → 1 rouge ; tout remis → vert.
