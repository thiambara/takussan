---
id: TCK-2809
title: "La quittance PDF d'un bail se juge par BailleurDuBien : l'agent créateur parti de l'agence ne la télécharge plus"
status: todo
phase: P1
family: back
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2770]
blocks: []
spec_refs:
  features:
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#15-leasepayment-"
tags: [back, baux, quittances, pdf, confidentialite, suite-de-tck-2803]
---

## Objectif utilisateur

Un agent qui a quitté l'agence ne peut plus télécharger les quittances des baux qu'il avait saisis. Seuls les
lecteurs du bail les obtiennent.

## Contrat de données

**Origine.** Inventaire de TCK-2803 (notes, « Inventaire des autres comparaisons brutes à `landlord_id` ») : même
cause que la fuite que TCK-2803 a fermée dans `LandlordSignatory`. `leases.landlord_id` recopie le créateur du bien,
sur un bien d'agence l'agent qui l'a saisi (TCK-1926). Lu tel quel, il garde à l'agent parti une porte que
`LeasePolicy::view` lui ferme.

**Constat, relu sur HEAD (`765093279`) le 2026-11-14. Lecture du code seulement : rien n'a été exécuté.**

- **Porte lue comme ouverte : `GET /api/leases/{lease}/receipts/{payment}/pdf`** (`DocumentPdfController::receipt` →
  `authorizeReceipt` → `mayReadReceipts`). `mayReadReceipts` admet `$lease->landlord_id === $user->id` sans
  condition de profil, avant tout autre jugement. L'agent créateur parti, qui garde ce `landlord_id`, y passe. La route
  ne juge rien d'autre (pas de `view` en amont). Le PDF porte le nom du locataire, le bien, le montant et la date.
- **Le coffre est lu comme FERMÉ à ce lecteur, contrairement à la prémisse d'origine** :
  - `DocumentVault::for()` (la liste du coffre, et donc l'archive de TCK-2770, qui ne juge rien et prend ses entrées
    là) n'appelle `addReceipts()` que sur `tenantLeases()`, les baux dont l'appelant est le LOCATAIRE ;
  - `GET /api/documents/generated?target=lease:N` (`DocumentVaultController::generated`) pose
    `authorize('view', $target)` avant `DocumentVault::generatedFor()`. L'agent parti y reçoit 403.
- `DocumentVaultPrimedVerdictParityTest` lit `mayReadReceipts` pour comparer le verdict amorcé au verdict direct.

**Fuite : probable, non mesurée.** AC1 la mesure avant toute correction.

**Endpoint touché :** `GET /api/leases/{lease}/receipts/{payment}/pdf`. Le reçu du lien de paiement public
(`PublicPaymentLinkController::receipt`) sert la même quittance par `streamRentReceipt`, mais sous un jeton, sans
`mayReadReceipts` : il n'est pas concerné.

**Dépendance.** TCK-2770 modifie `DocumentPdfController` (extraction des rendus pour l'archive), sans commit à cette
date : le correctif part de l'arbre où TCK-2770 est fusionné.

## Contraintes strictes (métier)

- **La branche « bailleur » de `mayReadReceipts` est celle de `LeasePolicy::view`** : `BailleurDuBien::est($user,
  $lease->landlord_id, $lease->agency_id)`. Sans condition de statut : le bailleur suspendu ou parti garde la lecture
  de ses quittances (il reste partie au bail, ADR-0031 §2).
- Les autres branches (locataire, personnel du profil actif, collaborateur `agent`/`manager` encore personnel,
  super-admin) ne changent pas.
- L'agent créateur EN POSTE garde la quittance, par la branche du personnel.
- Le coffre garde ses verdicts : `DocumentVaultPrimedVerdictParityTest` reste vert, amorce comprise (la moitié
  « agence » de `BailleurDuBien` se lit dans l'amorce `owner_any`).

## Delta à produire

- [ ] `DocumentPdfController::mayReadReceipts` : la comparaison brute à `landlord_id` passe par `BailleurDuBien::est`.
- [ ] Docblock de `mayReadReceipts` et de `authorizeReceipt` : la règle du bailleur s'y écrit au sens de `view`.
- [ ] Tests `QuittanceDuBailleurAuSensDeViewTest`.

## Critères d'acceptation

- [ ] AC1 — **Mesure exécutée, sur l'arbre d'avant le correctif**, par le test lui-même (ablation a1) : bail d'agence
  saisi par un agent (`landlord_id` = l'agent), échéance payée, agent passé `inactive`. `GET /api/leases/{id}` rend
  403 (témoin) ; `GET …/receipts/{payment}/pdf` rend 200. La mesure est consignée dans les notes, avec la commande. Si
  elle rend 403, le ticket le dit, passe en P3 et ne garde que la cohérence de la règle.
- [ ] AC2 — Après le correctif, le même appel rend 403. Le test vérifie aussi que la réponse ne porte aucun octet PDF.
- [ ] AC3 — Rendent 200, chacun nommé dans le test : le bailleur avec profil propriétaire (actif, suspendu, parti), le
  bailleur d'un bail sans agence, le locataire, le personnel de l'agence du bail (profil actif), l'agent créateur EN
  POSTE, le collaborateur `manager` encore personnel, le super-admin.
- [ ] AC4 — Pour chacun des lecteurs d'AC2 et AC3, le verdict de la route est égal à celui de `LeasePolicy::view` ;
  seule exception admise, nommée et assertée telle quelle : le collaborateur du bien (branche propre à ce geste, TCK-1154).
- [ ] AC5 — `DocumentVaultPrimedVerdictParityTest` reste vert ; le coffre de l'agent créateur parti (`GET
  /api/me/document-vault`) et `documents/generated?target=lease:N` (403) sont relus dans le même test : aucune
  quittance de ce bail.
- [ ] AC6 — Ablation : `mayReadReceipts` revenu à la comparaison brute rend AC2 rouge.

## Hors périmètre

- Les autres comparaisons brutes de l'inventaire de TCK-2803 (`PayoutPolicy::view`, `PayoutController::index`,
  `LeaseResource`, `MarkLateFeePaidRequest`, `MarkPaidLeasePaymentRequest`) : jugées légitimes ou déjà fermées par
  `view` dans ces notes.
- Le reçu public par lien de paiement (jeton).

## Notes d'implémentation

_(à remplir par implementing-specs)_
