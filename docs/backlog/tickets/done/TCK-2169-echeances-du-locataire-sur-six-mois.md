---
id: TCK-2169
title: "Les échéances du locataire se lisent sur six mois, et le titre dit l'horizon"
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
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-199--listes-chargées-par-morceaux-puis-comptées-groupées-ou-triées-sur-la-seule-page-chargée"
tags: [front, paiements, locataire, pagination, pistes]
---

## Objectif utilisateur

Le locataire sait jusqu'où porte la liste de ses échéances à régler, au lieu d'une liste coupée en
silence à 49 lignes.

## Contexte

Réf : **P199.05** du fichier de pistes, `validé`.

Décision du porteur : validation du porteur (2026-10-24) : front seul : la lecture des dus du locataire est bornée par `date_to` à six mois, les retards passés restent, et le titre dit l'horizon (« Échéances des 6 prochains mois ») avec un lien vers l'historique ; le contrat de l'API ne change pas

Avant (lu) : `CustomerPayments` lit les dus par `status=pending,partially_paid,late,failed`,
`sort=date`, `per_page: 50`, une page, sans borne de date ; l'échéancier d'un bail est émis en
entier à l'activation (`LeaseService`).

## Hypothèses (mode sans humain)

- « Le titre » est celui de la liste « Autres paiements à régler », qui devient « Échéances des 6
  prochains mois » ; « Prochain paiement » reste, il n'a pas d'horizon à dire.
- Six mois se comptent du jour, en UTC (le fuseau de Dakar), jusqu'au même quantième ; `date_to`
  borne le début de période côté API (`PaymentController::history`, existant).
- Le lien vers l'historique mène à la section « Historique » de la même page
  (`#historique-paiements`), libellé « Voir l’historique » (texte neuf minimal ; `wo` au texte
  français, wolof en pause).

## Delta à produire

- [x] `CustomerPayments` : `date_to` à six mois sur la lecture des dus ; titre et lien.
- [x] Clés `payments.customer.otherDuesHorizon` et `historyLink`, à la place de `otherDues`.
- [x] Tests : deux cas de `CustomerPayments.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Le 2026-10-24, la lecture des dus porte `date_to = 2027-04-24` et aucun `date_from`.
- [x] AC2 — La liste des autres échéances est titrée « Échéances des 6 prochains mois », avec un
  lien « Voir l’historique » vers `#historique-paiements`.

## Hors périmètre

- Un filtre de source côté API (le contrat de l'API ne change pas).

## Notes d'implémentation

- **Ablation** : `date_to` retiré et l'ancien titre remis → 2 rouges sur 11 ; correctif remis →
  11 verts.
