---
id: TCK-1365
title: "Le lien de la facture de résiliation mène aux factures pour l'équipe, aux paiements dus pour le client"
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
    - "docs/features.md#15-transactions--paiements"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-131--paramètres-de-requête-des-liens-profonds-et-leur-survie-aux-redirections"
tags: [front, baux, paiements, pistes]
---

## Contexte

Réf : **P131.03** du fichier de pistes, `validé` (V7 accordé).

Le bandeau de résiliation anticipée du bail rend le numéro de la facture de pénalité en `<a href>`
vers `/app/payments?invoice=<id>`. Rien ne lit `invoice` : le clic recharge la page entière et
ouvre l'historique des encaissements, ni sur l'onglet « Factures », ni sur la facture.

## Décision du porteur

> porteur (2026-10-22) : un `Link` vers `/app/payments?tab=invoices` pour l'équipe, et vers `CustomerPayments` pour le client

## Objectif utilisateur

Depuis le bandeau de résiliation, l'équipe arrive sur l'onglet des factures, et le client sur sa
page de paiements, où la pénalité apparaît comme une somme due.

## Contrat de données

Aucun changement d'API. `CustomerPayments` est rendu par `/app/payments` au client seul
(`isCustomerOnly`, `payments/page.tsx`) : le lien du client vise donc `/app/payments`.

## Delta à produire

- [x] Le numéro de facture du bandeau est un `Link` (navigation douce).
- [x] `href` : `/app/payments?tab=invoices` pour l'équipe, `/app/payments` pour le client
  (`isCustomerOnly` sur les rôles de `useAuth()`).
- [x] Test du bandeau sur les deux `href`.

## Critères d'acceptation

- [x] AC1 — Un membre de l'équipe voit un lien vers `/app/payments?tab=invoices`.
- [x] AC2 — Un client seul voit un lien vers `/app/payments`.
- [x] AC3 — Aucun lien ne porte plus `?invoice=`.

## Hors périmètre

- Ouvrir la facture désignée (filtre `id` ou page `/app/…/invoices/[id]`) : aucune des deux
  n'existe, et la décision du porteur ne la demande pas.

## Hypothèses

- Tant que l'utilisateur n'est pas chargé (`user` nul), le lien vise l'onglet des factures : la
  page de paiements du client ignore `tab`, il y arrive donc de toute façon sur `CustomerPayments`.

## Notes d'implémentation

- Le test historique `EarlyTerminationBanner.test.tsx` cherchait `a[href*="invoice=42"]` : il vise
  désormais `/app/payments?tab=invoices` (monté sans `AuthProvider`, donc `user` nul).
- Ablation : `EarlyTerminationBanner.tsx` rendu à `HEAD` → 3 rouges sur 5 (les deux cas du test
  neuf et le lien du test historique) ; correctif remis → 5/5 verts.
