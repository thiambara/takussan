---
id: TCK-1291
title: "Le sélecteur de paiement envoie une adresse d'annulation qui porte la référence du paiement"
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
tags: [front, payments, pistes]
---

## Contexte

Réf : **P131.01** du fichier de pistes, `retenu · autonome` (A1).

`PaymentProviderPicker` n'envoie que `returnUrl`. Sans `cancel_url`, Wave (`error_url`) et Orange
Money (`cancel_url`) posent leur repli `…/app/payments/return?status=failed`, sans `payment_type`
ni `payment_id` : la page de retour rend « Paramètres invalides — Lien de retour incorrect » au lieu
de « Paiement échoué ». Le lien de paiement public fournit déjà ses deux adresses.

## Objectif utilisateur

Le payeur qui annule ou échoue chez Wave ou Orange Money revient sur le verdict de son paiement.

## Contrat de données

Aucun changement d'API : `POST /api/{type}/{id}/initiate` accepte déjà `cancel_url`
(`InitiatePaymentRequest`, `nullable|url`), que `useInitiatePayment` transmet depuis `cancelUrl`.

## Delta à produire

- [x] `PaymentProviderPicker` envoie `cancelUrl` = `…/app/payments/return?status=failed&payment_type=…&payment_id=…`.
- [x] Test du sélecteur sur les deux adresses envoyées.
- [x] Test de la page de retour montée sur cette adresse.

## Critères d'acceptation

- [x] AC1 — L'appel d'initiation porte `cancelUrl` avec `status=failed`, `payment_type` et `payment_id`.
- [x] AC2 — La page de retour montée sur cette adresse, échéance encore due, rend « Paiement échoué ».

## Hors périmètre

- Le repli des pilotes quand `cancel_url` manque (API), inchangé : tous les appelants connectés
  passent désormais par le sélecteur.
- Le parcours chez un fournisseur réel, non joué.

## Notes d'implémentation

- Le test de la page de retour est vert sans correctif : la page savait déjà rendre l'échec, c'est
  l'adresse qui manquait. Il garde la destination, pas le correctif.
- Ablation : `PaymentProviderPicker.tsx` rendu à `HEAD` → 1 rouge (`cancelUrl` absent) sur 3 ;
  correctif remis → 3/3 verts.
