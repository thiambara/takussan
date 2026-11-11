---
id: TCK-2720
title: "« Argent » : les bailleurs des reversements en cours comptés une fois, les montants d'un milliard tiennent dans leur colonne, le module mort retiré"
status: todo
phase: P2
family: full
estimate: S
wave: 90
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2659]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#28-payout-"
tags: [full, argent, finances, reversements, fidelite, suivi-lot-1]
---

## Objectif utilisateur

L'admin d'agence lit sur la tuile « Reversements en attente » combien de bailleurs attendent leur argent, et lit en
entier un encaissement d'un milliard de francs sur un écran de bureau.

## Contexte

Restes de TCK-2659 (b5552cdb2), re-mesurés sur 2fcd7fb57 (après les correctifs b10afead0, a66aea9ce, f1bd713ae) :

1. **La tuile ne dit pas combien de bailleurs.** La maquette retenue (`app-argent`, a-0 bureau 1280 et 1440) écrit
   « Reversements en attente · 8 748 000 F · **5 bailleurs** · 3 à approuver ». La tuile additionne `payouts_pending` et
   `payouts_awaiting_approval` (montant et nombre) ; or `FinanceSummaryService::payouts()` ne compte les bailleurs que
   pour la file d'approbation (`payouts_awaiting_approval.landlords_count`, `COUNT(DISTINCT landlord_id)` filtré par
   `payee_role = landlord`). Deux comptes distincts ne s'additionnent pas : un bailleur qui a un reversement en attente
   d'approbation et un autre à verser compterait deux fois.
2. **`takussan-web/src/lib/queries/admin-finances.ts` n'a plus de lecteur** (`usePendingPayoutsCount`,
   `useDraftInvoicesCount` : leur seul consommateur, `FinanceKpis`, a été retiré par TCK-2659) ; seul son test l'importe.
3. **Un montant ≥ 1 000 000 000 F déborde la colonne Montant du registre** sous 1440 px (colonnes à largeur fixe,
   `table-fixed`, aux largeurs de la maquette).

## Décision

**Aucune décision du porteur requise** : fidélité à la maquette retenue et nettoyage.

## Contrat de données

- `GET /api/agencies/{agency}/finance/summary` : nouvelle clé `payouts_open {count, amount, landlords_count}` — les
  reversements `pending` **et** `awaiting_approval` de l'agence, au net ; `landlords_count` = bailleurs **distincts** sur
  l'union, même filtre `payee_role = landlord` que la file d'approbation. Les clés existantes restent, à l'identique.

## Direction UX / Artistique

- Tuile « Reversements en attente » : le détail de la maquette, « N bailleurs · M à approuver » (« M à approuver » réservé
  à qui le lit aujourd'hui) ; montant et nombre lus sur `payouts_open`.
- Colonne Montant du registre, à 1280 et 1440 : un montant à dix chiffres (« 1 234 567 890 F ») se lit en entier, sans
  ellipse ni chevauchement de la colonne voisine, et les colonnes gardent leurs proportions de la maquette pour les
  montants courants.

## Contraintes strictes (métier)

- `landlords_count` ne compte ni le prestataire payé (`payee_role` ≠ landlord) ni une caution rendue comptée comme
  reversement d'un autre rôle : la règle de la vérification adverse de TCK-2657, sur l'union.
- Une requête agrégée, comme aujourd'hui (pas de requête par statut).
- Les clés i18n de la tuile (`argent.tuiles.reversementsDetail`) se coordonnent avec qui édite les dictionnaires ; wo =
  texte français.

## Delta à produire

- [ ] `FinanceSummaryService::payouts()` : `payouts_open` dans la même requête (`COUNT(DISTINCT landlord_id) FILTER
      (WHERE status IN (…) AND payee_role = ?)`).
- [ ] Tuile du bureau et ligne du téléphone : lisent `payouts_open` ; détail « bailleurs · à approuver ».
- [ ] Suppression de `lib/queries/admin-finances.ts` et de son test.
- [ ] Largeur de la colonne Montant tenue pour dix chiffres.
- [ ] Tests : `FinanceSummaryPayoutsOpenTest` (API) ; test de la tuile (front).

## Critères d'acceptation

- [ ] AC1 — Agence avec : bailleur L1 → un reversement `awaiting_approval` et un `pending` ; bailleur L2 → un `pending` ;
      prestataire P → un `pending`. `payouts_open = {count: 4, landlords_count: 2}` ; `payouts_awaiting_approval.landlords_count
      = 1` (inchangé).
- [ ] AC2 — La tuile du bureau affiche « 2 bailleurs · 1 à approuver » sur ce décor.
- [ ] AC3 — `grep -rn "admin-finances" takussan-web/src` ne rend rien ; `npx tsc --noEmit` propre.
- [ ] AC4 — À 1280 px, un encaissement de 1 234 567 890 F : la cellule Montant a `scrollWidth ≤ clientWidth` et le texte
      rendu est le montant entier.

## Hors périmètre

- La barre d'onglets du téléphone (écart de fidélité de 4,8 à 5,4 %, navigation de la famille 3).
- La lisibilité des groupes de milliers (TCK-2714).
- L'export du registre (TCK-2721).

## Notes d'implémentation

_(à remplir par implementing-specs)_
