---
id: TCK-1511
title: "Les écritures d'une facture rendent la forme de son show, avoirs compris (ADR-0071)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1509]
blocks: []
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#25-invoice-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-actions-de-neuf-contrôleurs-rendent-la-ressource-sans-les-relations-et-les-clés-que-le-show-ajoute"
tags: [api, invoices, resources, contract, pistes]
---

## Contexte

Réf : **P95.03** du fichier de pistes, `validé`. Second modèle de l'ordre d'application
d'[ADR-0071](../../adr/0071-une-ecriture-rend-la-projection-de-son-show.md), après la réservation
(TCK-1509).

Seul `InvoiceController::show` chargeait `creditNotes`. `cancel`, qui crée l'avoir, rendait la
facture sans lui : la réponse du geste qui produit l'avoir était la seule où il manquait.

## Décision du porteur

validé — porteur (2026-10-22) : appliquer ADR-0071 : un seul chemin de présentation pour le `show` et les écritures, exception écrite dans le docblock de la ressource, test de contrat de forme par modèle ; la réservation d'abord, puis la facture

## Objectif utilisateur

La réponse de l'annulation d'une facture émise porte l'avoir qu'elle vient de créer, comme le
détail.

## Contrat de données

`POST /api/invoices`, `POST /api/invoices/{id}/send|mark-paid|cancel` rendent `credit_notes`,
comme `GET /api/invoices/{id}`.

## Contraintes strictes (métier)

- Aucun montant n'est calculé : l'avoir est lu tel que `InvoiceService::cancel` l'a écrit
  (ADR-0071, « La facture touche le domaine de l'argent »).
- Condition d'ADR-0071 vérifiée sur `InvoicePolicy` : `create` (`invoices.create`) rend
  l'appelant émetteur ; `send`, `markPaid`, `cancel` exigent le personnel de l'agence ou
  l'émetteur d'une facture hors agence ; tous sont lecteurs par `view`. Aucune exception à écrire.

## Delta à produire

- [x] `InvoiceController::presenter()`, privé, appelé par `show`, `store`, `send`, `markPaid`,
  `cancel`.
- [x] `InvoiceWriteMatchesShowTest`, sur l'assertion partagée de TCK-1509.

## Critères d'acceptation

- [x] AC1 — les quatre écritures ont la forme du `show`.
- [x] AC2 — l'annulation d'une facture émise rend l'avoir.

## Hors périmètre

- Les autres modèles de l'ordre d'application d'ADR-0071 (au porteur).

## Notes d'implémentation

- Avant correctif : `store`, `send` et `cancel` rouges sur `credit_notes` (absente de l'écriture,
  liste au `show`). `markPaid` n'est pas atteint, joué dans le même test après `send`.
- Ablation : chargement de `creditNotes` retiré du `presenter()` → rouge ; remis → 3/3.
