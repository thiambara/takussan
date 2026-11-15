---
id: TCK-2897
title: "API — le coffre range les documents d'un bail dans un sous-dossier du bien (bailleur), et sert au prestataire « Devis et rapports » et le PDF de ses factures"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2898]
spec_refs:
  features:
    - "docs/features.md#110-documents--contrats"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#22-document-"
    - "docs/models-spec.md#77-serviceproviderbill-"
    - "docs/models-spec.md#21-maintenancerequest-"
tags: [back, documents, coffre, bailleur, prestataire, audit-ux, app]
---

## Objectif utilisateur

Le bailleur ouvre le dossier d'un bien et y trouve, à part, le dossier du bail de sa locataire ; le prestataire retrouve ses devis, ses rapports de fin d'intervention et le PDF de chaque facture.

## Contrat de données

Constat (vérifié à l'écriture) :

- `GET /api/me/document-vault` (`App\Services\Documents\DocumentVault`) : pour le bailleur, `mapTarget('lease', …, "property:{id}")` range les documents d'un bail **à plat** dans le dossier du bien (l. 216-218) ; aucun sous-dossier. Genres de dossier : `lease`, `property`, `pieces`, `receipts`, `statements`, `bills`.
- Prestataire : dossier `bills` seul (entrées `service-provider-bills.show`, JSON) — **aucune facture n'a de PDF** (`DocumentVault.php:504-520`). Aucun dossier pour les devis ni les rapports.
- Les devis existent sur la demande : collection privée `quotes`, `GET maintenance-requests/{id}/quote/pdf`. Le « rapport de fin d'intervention » n'existe pas en fichier : la clôture porte `resolution_notes` et `completion_photos` (`CompleteMaintenanceRequestRequest`).

Audit (`audit-f4-patrimoine.md`) : app-documents **e8** (« Sous-dossier « Bail de Fatou Kiné Diallo » DANS le dossier du bien absent »), **e9** (« Devis et rapports » absent, factures sans geste de fin de ligne — aucun PDF) ; fiche `TCK-2656.json` a-8, a-9.

À servir :

1. Bailleur : dans le dossier d'un bien, un **sous-dossier par bail** hors brouillon (nom du locataire, référence), qui reçoit le contrat, les états des lieux et les pièces rattachées au bail ; le dossier du bien garde les pièces du bien.
2. Prestataire : un dossier **« Devis et rapports »** (genre neuf) — ses devis soumis (téléchargés par `quote/pdf`) et un **rapport de fin d'intervention** par demande close qu'il a réalisée (PDF généré depuis la demande : bien, date, travaux, `resolution_notes`, photos avant / après), listés depuis leur source (ADR-0099 § 3, jamais copiés).
3. Prestataire : un **PDF par facture** (`GET service-provider-bills/{bill}/pdf`), que l'entrée du dossier `bills` sert comme `download_path`.

## Contraintes strictes (métier)

- ADR-0099 : la liste suit la lecture ; les générés se listent depuis leur source et se téléchargent par leur endpoint, sous sa propre autorisation. Le rapport et la facture PDF ont donc chacun leur endpoint autorisé (prestataire auteur, personnel de l'agence ; le bailleur pour la facture qui lui est refacturée seulement si `rechargeable_to_landlord`).
- Nombre de requêtes du coffre constant (garde existante), quel que soit le nombre de baux, devis ou rapports.
- Un brouillon de bail ne crée pas de sous-dossier.
- Montants en XOF, sans sous-unité dans le PDF (principe 3).

## Delta à produire

- [ ] `DocumentVault` : sous-dossiers de bail dans le dossier d'un bien (bailleur) — forme de réponse : `parent` sur le dossier, ou `folders[]` imbriqués ; documenter le choix dans models-spec ou laisser à /sync-specs.
- [ ] Genre de dossier `quotes_reports` (prestataire) ; endpoint `GET maintenance-requests/{id}/completion-report/pdf` (vue Blade + autorisation).
- [ ] Endpoint `GET service-provider-bills/{bill}/pdf` ; `download_path` des entrées `bills` vers lui.
- [ ] Tests : `DocumentVaultOwnerLeaseSubfolderTest`, `DocumentVaultProviderQuotesReportsTest`, `ServiceProviderBillPdfTest`, `MaintenanceCompletionReportPdfTest` (autorisations : prestataire non auteur 403, autre agence 404), compte de requêtes constant.

## Critères d'acceptation

- [ ] AC1 — Le coffre d'un bailleur dont le bien a un bail actif rend, dans le dossier du bien, un sous-dossier du bail (nom du locataire, référence) qui contient le contrat ; le dossier du bien ne liste plus ce contrat à plat.
- [ ] AC2 — Un bail en brouillon ne produit aucun sous-dossier.
- [ ] AC3 — Le coffre d'un prestataire qui a soumis 1 devis et réalisé 12 interventions closes rend un dossier « Devis et rapports » de 13 entrées, chacune avec un `download_path` qui répond 200 en PDF pour lui.
- [ ] AC4 — `GET service-provider-bills/{bill}/pdf` rend un PDF au prestataire auteur et au personnel de l'agence ; un autre prestataire reçoit 403 (ou 404 hors agence).
- [ ] AC5 — Un rapport de fin d'intervention demandé par un prestataire qui n'était pas assigné : 403.
- [ ] AC6 — Le nombre de requêtes du coffre d'un prestataire de 30 interventions égale celui d'un prestataire de 1.

## Hors périmètre

- L'écran du coffre (TCK-2898).
- Le coffre de l'agence (TCK-2895).

## Notes d'implémentation

_(à remplir par implementing-specs)_
