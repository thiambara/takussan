---
id: TCK-2237
title: "La liste des visites exige un propriétaire joignable sur un bien sans agence, et la policy des commissions dit que view n'a pas de lecteur"
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
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
    - "docs/models-spec.md#85-commissionentry-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-217--clauses-de-périmètre-des-listes-écrites-à-la-main-face-à-la-policy-view"
tags: [api, visites, commissions, autorisation, pistes]
---

## Objectif

Aligner la clause du propriétaire d'un bien sans agence de `GET /api/property-visits` sur
`PropertyVisitPolicy::view`, et écrire dans `CommissionEntryPolicy` que `view` n'a pas de lecteur.

## Contexte

Réf : **P217.05** du fichier de pistes, `validé`.

- Visites : la clause d'un bien sans agence ne jugeait que `properties.user_id`, quand `view`
  passe par `PrimaryPropertyContact::estProprietaire`, qui exige aussi `joignable` (ni bloqué ni
  supprimé).
- Commissions : `CommissionEntryPolicy::view` admet le bénéficiaire sans condition, mais aucune
  route ni aucun code ne l'invoque (`grep` de `'view'` sur `app/` et `routes/api/commissions.php`).

## Décision du porteur

validé — validation du porteur (2026-10-24) : visites : `joignable` ajouté à la clause d'un bien sans agence ; commissions : `CommissionEntryPolicy` dit que `view` n'a pas de lecteur ; garants : la branche `added_by_id` de `view`, `update`, `delete` et de la liste suit la règle d'auteur d'ADR-0031 (amendement du 2026-10-24), même ticket que P218.03

## Delta à produire

- [x] `PropertyVisitController::index` : la branche `whereNull('agency_id')` de la clause du
  propriétaire n'est posée que si l'appelant est joignable.
- [x] `CommissionEntryPolicy::view` : docblock qui dit l'absence de lecteur et renvoie à
  `CommissionEntry::scopeVisibleTo`.
- [x] `VisitesDuProprietaireInjoignableTest`.

## Critères d'acceptation

- [x] AC1 — propriétaire d'un bien sans agence, bloqué puis supprimé : `show` 403 et la liste ne
  rend pas la visite.
- [x] AC2 — propriétaire joignable : `show` 200 et la liste rend la visite.

## Reste à faire

- Garants : la branche `added_by_id` de `GuarantorPolicy::view`, `update`, `delete` et de
  `GuarantorController::index` suit la règle d'auteur d'ADR-0031 (amendement du 2026-10-24). La
  décision la met dans le ticket de P218.03 (TCK-2196, PR #1491, ouverte) : la règle
  `BasePolicy::auteurEncoreMembre` y est écrite, et l'ADR veut qu'elle ne s'écrive qu'une fois.
  La reprendre ici l'aurait écrite une seconde fois et mis les deux PR en conflit.

## Hypothèses

- « `CommissionEntryPolicy` dit que `view` n'a pas de lecteur » se lit comme une correction de
  docblock seule : la règle de `view` reste inchangée.

## Notes d'implémentation

- Avant correctif : `show` 403 mais liste à 1 (2 rouges, bloqué et supprimé).
- Ablation : `when(true, …)` au lieu de `when($proprietaireSansAgence, …)` → 2 rouges ; remis →
  3 verts.
