---
id: TCK-1012
title: "Le relevé d'un bailleur s'ouvre depuis le dialogue de reversement, une fois le bailleur choisi"
status: todo
phase: P2
family: applicatif
estimate: S
wave: null
created: 2026-10-19
updated: 2026-10-19
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-50--le-bailleur-invité-face-aux-biens-dont-lagent-est-titulaire"
tags: [front, payments, payouts, owner-statements, pistes]
---

## Contexte

Réf : **P50.04** du fichier de pistes, `validé` par le porteur (critère accordé : V7), sur la
recommandation du délégué.

L'API sert au personnel qui tient `payouts.create` le relevé de gérance d'un bailleur
(`GET /api/owner-statements?landlord_id=…`, et ses variantes `pdf` et `csv`, même
`OwnerStatementRequest`, TCK-594). Le front n'en a aucun écran : `OwnerStatementPanel` n'est monté
que pour un bailleur (`PaymentsTabs.tsx`), et `useOwnerStatement` n'envoie jamais `landlord_id`.

## Décision du porteur

ouvrir le relevé d'un bailleur depuis le dialogue de reversement, une fois le bailleur choisi (« voir le relevé du mois », `OwnerStatementPanel` avec `landlord_id`), et non depuis le carnet des propriétaires (porteur, 2026-10-19, sur la recommandation du délégué)

## Objectif utilisateur

Avant de reverser, l'agence lit le relevé du mois du bailleur qu'elle a choisi.

## Contrat de données

Routes existantes, inchangées : `GET /api/owner-statements`, `/pdf`, `/csv`, avec `period` et
`landlord_id` (`OwnerStatementRequest`, `OwnerStatementPolicy::view`).

## Contraintes strictes

- Le geste n'apparaît qu'une fois un bailleur choisi dans le dialogue.
- Le relevé affiché, le PDF et le CSV portent `landlord_id` = le bailleur choisi ; le panneau du
  bailleur (`PaymentsTabs`, sans `landlord_id`) reste inchangé.
- **Hypothèse** : « du mois » = le mois du début de période choisi dans le dialogue, sinon le mois
  courant ; le sélecteur de mois du panneau reste disponible.
- Libellé neuf « Voir le relevé du mois » en `fr`, `en` ; en `wo` le texte français (wolof en pause).

## Delta à produire

- [ ] `useOwnerStatement(period, landlordId?)` : `landlord_id` envoyé et porté par la clé de cache.
- [ ] `OwnerStatementPanel` : props `landlordId?` et `initialMonth?`, `landlord_id` passé aussi au
      PDF et au CSV.
- [ ] `CreatePayoutDialog` : bouton « Voir le relevé du mois » (`aria-expanded`), qui monte le
      panneau avec le bailleur choisi.
- [ ] Tests vitest du dialogue et du panneau.

## Critères d'acceptation

- [ ] AC1 — Sans bailleur choisi, le dialogue n'a pas le bouton ; bailleur choisi, le bouton ouvre
      le relevé, demandé avec `landlord_id` = le bailleur et le mois du début de période.
- [ ] AC2 — Le PDF du panneau ouvert pour un bailleur part avec `landlord_id` dans l'URL.
- [ ] AC3 — Sans `landlordId`, le panneau du bailleur reste tel quel (tests existants verts).

## Hors périmètre

- Le carnet des propriétaires (écarté par la décision).
- La description du panneau, écrite pour le bailleur (« ce qui a été encaissé pour vous ») : un
  texte propre au personnel serait un texte métier neuf.

## Notes d'implémentation

_(à remplir par implementing-specs)_
