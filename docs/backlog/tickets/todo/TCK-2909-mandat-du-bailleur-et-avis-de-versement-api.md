---
id: TCK-2909
title: "API — le mandat du bailleur (dates, versement, référent, mandat signé) et l'avis de chaque reversement (nature, moyen, PDF)"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2910, TCK-2915, TCK-2916]
spec_refs:
  features:
    - "docs/features.md#15-transactions--paiements"
    - "docs/features.md#110-documents--contrats"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
    - "docs/models-spec.md#28-payout-"
    - "docs/models-spec.md#22-document-"
tags: [back, bailleurs, mandat, reversements, documents, audit-ux, app]
---

## Objectif utilisateur

Sur la fiche d'un bailleur, l'agence lit son mandat — signé le 12 mars 2025, jusqu'au 11 mars 2028, versement par virement avant le 10, suivi par Awa Diop — ouvre le mandat signé, et remet au bailleur l'avis de chaque reversement.

## Contrat de données

Constat (vérifié à l'écriture) :

- `owner_profiles` est **par couple (utilisateur, agence)** (`unique(['user_id','agency_id'])`) : il porte déjà le mandat de fait (`works_approval_threshold`, commission lue sur l'agence). Il n'a **aucune** colonne de dates de mandat, de moyen ni de jour de versement, ni de référent (`create_owner_profiles_table.php:11-25`).
- `GET /api/owners/{id}` (`OwnerDirectory.php:459-515`) : `contact` sans adresse ; `figures` du mois sans nombre d'encaissements.
- **Mandat signé** : aucun `DocumentType` « mandat » ; `POST /api/documents` n'accepte pas la cible `owner_profile` (`DocumentController.php:33-39`, alias pourtant prévu par ADR-0099 § 5) — l'agence ne peut déposer aucune pièce du bailleur.
- **Reversements** (`PayoutResource`) : `payment_method` et `payout_method_masked` servis, **aucune nature** (acompte, solde…) et **aucun PDF** d'avis (`routes/api/payouts.php`) ; seul le relevé mensuel a un PDF.

Audit (`audit-f4-patrimoine.md`, app-bailleurs **e1** : « Mandat de gestion signé » et « Ajouter » de la carte Documents, « Versement : virement, avant le 10 », dates du mandat, adresse et référent, « 9 encaissements », nature et moyen de chaque reversement + « Reçu » — fiche `TCK-2641.json` a-1-bureau « à proposer en suite back », aucun ticket) ; app-paiements **e4** (« Avis » téléchargeable d'un versement + moyen ; fiche `TCK-2651.json` a-4).

À servir :

1. `owner_profiles` : `mandate_starts_on`, `mandate_ends_on`, `payout_method` (énumération : virement, mobile money, espèces…), `payout_day` (1-28, « avant le N du mois »), `referent_agent_id` (personnel de l'agence) ; écrits par `PATCH /api/owners/{ownerProfile}` (`OwnerProfileController::update`, `UpdateOwnerProfileRequest` — la route qui écrit déjà `works_approval_threshold`), rendus par le détail.
2. Détail du bailleur : `contact.address` ; `figures.collections_count` (encaissements du mois).
3. `DocumentType::ManagementMandate` ; cible `owner_profile` acceptée par `POST /api/documents` pour le personnel de l'agence qui gère ce bailleur ; le détail du bailleur rend sa pièce « mandat » (nom, date, pages ou taille, lien).
4. `Payout` : `nature` (acompte, solde, reprise…) servie ; `GET /api/payouts/{payout}/notice/pdf` (l'avis de versement : bailleur, période, montant, moyen masqué, date) — lisible du bailleur et du personnel de l'agence.

## Contraintes strictes (métier)

- Migration pensée pour PostgreSQL, `down()` juste ; colonnes nullables (aucune valeur inventée pour l'existant).
- `referent_agent_id` doit être du personnel actif de **la même agence** (422 sinon).
- La cible `owner_profile` suit ADR-0099 : la liste suit la lecture ; le bailleur lit les pièces déposées sur son profil ; aucune autre agence ne les voit (test de parité).
- Écrire le mandat : même capacité que les réglages du mandat d'aujourd'hui (plafond de travaux).
- L'avis de versement : montant décimal en base, XOF sans sous-unité dans le PDF ; autorisation de `PayoutPolicy::view`.

## Delta à produire

- [ ] Migration `add_mandate_terms_to_owner_profiles_table`.
- [ ] `UpdateOwnerProfileRequest` (champs du mandat) ; `OwnerDirectory` (adresse, `collections_count`, mandat, pièce « mandat »).
- [ ] `DocumentType::ManagementMandate` ; cible `owner_profile` dans `DocumentController::store` + `DocumentPolicy`.
- [ ] `Payout.nature` (colonne ou dérivée — à décider dans le ticket, avec la règle écrite) ; `PayoutNoticePdfController` + vue.
- [ ] `docs/models-spec.md` § 34 et § 28 (ou laisser à /sync-specs).
- [ ] Tests : `OwnerMandateTermsTest`, `OwnerDocumentUploadTest` (parité, autre agence), `OwnerDetailCollectionsCountTest`, `PayoutNoticePdfTest`.

## Critères d'acceptation

- [ ] AC1 — `PATCH /api/owners/{id}` avec `mandate_starts_on=2025-03-12`, `mandate_ends_on=2028-03-11`, `payout_method=bank_transfer`, `payout_day=10`, `referent_agent_id` d'un agent de l'agence : 200, et le détail rend ces valeurs ; un `referent_agent_id` d'une autre agence → 422.
- [ ] AC2 — Le personnel de l'agence dépose un PDF de type `management_mandate` sur `owner_profile:{id}` : 201 ; le détail du bailleur rend la pièce ; le bailleur la voit dans son coffre ; un agent d'une autre agence ne la voit pas.
- [ ] AC3 — Le détail d'un bailleur dont le mois compte 9 loyers encaissés rend `figures.collections_count = 9`.
- [ ] AC4 — Un reversement rend `nature` et `payment_method` ; `GET /api/payouts/{id}/notice/pdf` rend un PDF au bailleur concerné et au personnel de l'agence, 403 à un autre bailleur.
- [ ] AC5 — Le `down()` de la migration s'exécute sans erreur sur PostgreSQL.

## Hors périmètre

- Les écrans (TCK-2910, TCK-2916).
- Le statut juridique du mandat (signature électronique du mandat) : la pièce est déposée signée.

## Notes d'implémentation

_(à remplir par implementing-specs)_
