---
id: TCK-1332
title: "Une fiche client titulaire d'un bail ouvert ne se supprime plus (422)"
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
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#14-location-longue-durée-baux"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-130--fiches-client-garant-et-bien-supprimées-en-douceur-et-encore-citées"
tags: [api, crm, baux, suppression-douce, pistes]
---

## Contexte

Réf : **P130.05** du fichier de pistes, `validé`.

`DELETE /api/customers/{id}` supprimait (suppression douce) la fiche du titulaire d'un bail actif
en 204. Le bail continuait de courir sans locataire : `SendLeasePaymentReminders::notifyTenant`
finit sur « locataire injoignable » sans prévenir l'agence, et `ApplyLateFeesJob` applique la
pénalité (mesuré par le mesureur). Le locataire à compte perdait aussi l'accès à son bail, ses
quittances et ses factures (P130.01).

## Décision du porteur

« validé — porteur (2026-10-22) : la garde de P130.01 (refus de supprimer une fiche sous bail actif) ferme le cas ; un relevé des fiches déjà supprimées sous bail actif précède tout choix de reprise »

Critère accordé : V1.

## Objectif

La suppression d'une fiche que porte un bail ouvert est refusée, dans la forme du garant
(`GuarantorController::destroy`, VERIF-596) que décrit la `Piste` de P130.01.

## Delta à produire

- [x] `CustomerController::destroy` : 422 `customer.attached_to_open_lease` si un bail
      `pending_signature` ou `active` a la fiche pour locataire.
- [x] Messages `errors.customer.attached_to_open_lease` en `fr` et `en` ; en `wo`, le texte
      français tel quel (wolof en pause).
- [x] Test `CustomerSousBailTest`.

## Critères d'acceptation

- [x] AC1 — Fiche titulaire d'un bail `active` ou `pending_signature` → 422
      `customer.attached_to_open_lease`, fiche intacte.
- [x] AC2 — Fiche sans bail, ou dont le bail est `terminated` ou `draft` → 204, fiche supprimée.

## Hypothèses (mode sans humain)

- « Bail actif » se lit comme la `Piste` de P130.01, à laquelle la décision renvoie : les statuts
  `pending_signature` et `active`, ceux de la garde du garant. Un bail `terminating` (préavis en
  cours) n'est pas compté : la garde du garant ne le compte pas non plus. Écrit au rapport.
- La « réservation non terminée » que la `Piste` de P130.01 évoque n'est pas comptée : la décision
  ne parle que du bail.
- Le front n'appelle pas `DELETE /api/customers/{id}` (relevé `grep` de `takussan-web/src`) :
  aucun écran à adapter.

## Reste à faire

Le relevé des fiches déjà supprimées sous bail actif (`SELECT` des baux `active` dont `tenant_id`
vise une fiche `deleted_at` non nulle), avant tout choix de reprise. Il ne se fait que sur une
base de production, qui n'existe pas pour l'API.

## Hors périmètre

- L'entrée P130.01 reste au porteur : son statut n'est pas du ressort de l'implémenteur. La garde
  qu'elle propose est livrée ici, au titre de P130.05.

## Notes d'implémentation

- Ablation : condition de `abort_code_if` neutralisée → `test_une_fiche_sous_bail_ouvert_ne_se_supprime_pas`
  rouge (204 au lieu de 422) ; remise → 2/2 verts.
