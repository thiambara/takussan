---
id: TCK-2316
title: "Le bail renouvelé naît sans garant et le dit ; l'avoir reprend les lignes et la désignation de la facture qu'il annule"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#15-transactions--paiements"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#25-invoice-"
  adr:
    - "docs/adr/0042-preuve-de-consentement-a-la-signature-du-bail.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-231--gestes-qui-clôturent-une-ligne-et-en-ouvrent-une-neuve-face-aux-champs-quils-ne-reportent-pas"
tags: [api, web, baux, factures, pistes]
---

## Contexte

Réfs : **P231.01** et **P231.04** du fichier de pistes (angle 231 : gestes qui clôturent une ligne
et en ouvrent une neuve, face aux champs qu'ils ne reportent pas), `validé` par le porteur le
2026-10-25.

- **P231.01** (critère accordé : V7). `LeaseRenewalService::renew` construit l'enfant colonne par
  colonne : il recopiait l'ancienne colonne `guarantor_id`, mais pas le pivot `lease_guarantor`,
  qui porte les garants imprimés. Un enfant né `active` fige son contrat dans la même transaction,
  donc sans garants, et rien ne le disait : ni la réponse, ni l'écran.
- **P231.04** (critère accordé : V1). `InvoiceService::creditNoteFor` recopiait les montants, le
  client et la cible, mais pas `metadata` : l'avoir d'une facture saisie par lignes s'imprimait
  sur une ligne unique « Prestation ».

## Décision du porteur

- P231.01 : validation du porteur (2026-10-25) : le bail renouvelé naît sans garant, et la réponse et l'écran le disent ; reste : recopier les garants si un avis juridique dit que le cautionnement suit le bail renouvelé (OHADA)
- P231.04 : validation du porteur (2026-10-25) : l'avoir recopie `metadata.lines` et `metadata.designation` de la facture qu'il annule

## Reste à faire

- P231.01 : recopier les garants si un avis juridique dit que le cautionnement suit le bail renouvelé (OHADA)

## Delta à produire

- [x] `LeaseRenewalService::renew` : l'enfant naît avec `guarantor_id` nul, et rien ne recopie le
  pivot. `guarantorsNotCarriedOver()` compte les garants du parent (pivot, plus l'ancienne colonne
  quand elle en désigne un autre).
- [x] `POST /api/leases/{lease}/renew` : `meta.guarantors_not_carried_over` dans la réponse 201.
- [x] `LeaseRenewalDialog` : au récapitulatif, un `WarningBanner` dit que le ou les garants du bail
  actuel ne sont pas reportés, quand le bail en a (`useLeaseGuarantors`). Clé
  `lease.renewal.guarantors_not_carried_over` (ICU, `fr`/`en`, `wo` = français).
- [x] `InvoiceService::creditNoteFor` : l'avoir reprend `metadata.lines` et
  `metadata.designation` de l'originale, et rien d'autre de `metadata` ; la numérotation fige
  ensuite `issued.designation` comme pour une facture. Les notes ne suivent pas.
- [x] ADR-0042 amendé (2026-10-25) ; `docs/features.md` § 1.4 et § 1.5.

## Critères d'acceptation

- [x] AC1 — Bail actif figé, deux garants au pivot dont un aussi dans `guarantor_id` :
  `POST /renew` → 201, `meta.guarantors_not_carried_over` = 2 ; l'enfant n'a aucun garant au pivot,
  `guarantor_id` nul, et son contrat figé n'imprime pas leur nom ; le parent garde ses deux garants.
- [x] AC2 — Sans garant au parent : `meta.guarantors_not_carried_over` = 0.
- [x] AC3 — Le récapitulatif du dialogue dit « Le garant … n'est pas reporté » (un garant),
  « Les 2 garants … ne sont pas reportés » (deux), et rien sans garant.
- [x] AC4 — Facture de deux lignes avec une note, émise puis annulée : l'avoir a les mêmes
  `lines()`, aucune note, et son PDF imprime les deux libellés, sans « Prestation ».
- [x] AC5 — Facture à `metadata.designation`, émise puis annulée : l'avoir porte la désignation, la
  fige dans `metadata.issued.designation`, et son PDF l'imprime.

## Hors périmètre

- Recopier les garants (le reste du porteur, ci-dessus).
- Un garant rattaché à l'enfant après coup défige son contrat (ADR-0042 § 1) : non re-mesuré ici.
- L'écran ne lit pas `meta.guarantors_not_carried_over` : le dialogue se ferme au succès, et
  l'avertissement est donné avant la confirmation, depuis les garants du bail affiché.

## Notes d'implémentation

- Prémisses re-mesurées : `LeaseRenewalFrozenContractTest` neuf, rouge avant correctif
  (`meta` absent ; `guarantor_id` de l'enfant recopié = 1) ; `InvoiceCreditNoteTest` neuf, rouge
  (`lines()` nul, `metadata.designation` nul).
- Ablations : `guarantor_id` recopié → AC1 rouge (« 1 is null ») ; `meta` retiré → AC1 et AC2
  rouges ; bandeau retiré → 2 rouges sur 3 au dialogue ; `metadata` de l'avoir retiré → AC4 et AC5
  rouges. Correctifs remis → verts.
- `guarantor_id` nul à la naissance est la lecture littérale de « naît sans garant » : recopié, il
  laissait l'enfant dans `Guarantor::leases()`, qui refuse la suppression du garant tant qu'un bail
  ouvert le cite (`GuarantorController::destroy`).
