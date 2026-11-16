---
id: TCK-2897
title: "API — le coffre range les documents d'un bail dans un sous-dossier du bien (bailleur), et sert au prestataire « Devis et rapports » et le PDF de ses factures"
status: done
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
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

**2026-11-15 — implémentation (agent, vague 92).** [ADR-0099](../../../adr/0099-le-coffre-de-documents-la-liste-suit-la-lecture.md) amendé d'abord (§ « le dossier d'un bail sous son bien, les devis et rapports du prestataire, le PDF d'une facture »).

**Prémisses re-mesurées** : justes (`mapTarget('lease', …, "property:{id}")` à plat ; `addBills` vers `service-provider-bills.show` ; devis par `quote/pdf` sous `viewQuote` ; aucun fichier de rapport). Écart : depuis TCK-2911, une facture naît en **brouillon** et la liste `bills` les inclut — le PDF suit la même branche (le prestataire lit son brouillon), la liste et l'endpoint s'accordent.

**Choix (décisions mineures tranchées)** :
- **Forme : liste PLATE + `parent`** (et `reference`), nuls sur tout autre dossier — la recherche, l'archive (`firstWhere('key')`) et le front parcourent une liste plate ; des `folders[]` imbriqués les auraient cassés. Sous-dossier : clé `lease:{id}` (déjà acceptée par l'archive), genre `lease`, nom = `tenant.full_name`, hérite de `read_only` (bailleur bloqué). Le dossier de bail du locataire garde sa clé s'il existe déjà. `reference` aussi sur le dossier de bail du locataire. La cible d'un bail offerte au dépôt range désormais dans le sous-dossier. L'archive d'un bien ne contient plus les pièces de ses baux (chaque bail s'archive par `lease:{id}`). La recherche garde sa forme de dossier (`parent` non recopié).
- **« Devis et rapports »** (`quotes_reports`, existe même vide, après `bills`) : devis = demande assignée à l'appelant avec `quote_submitted_at` ; rapport = demande au travail rendu, **`completed` OU `closed`** (`ServiceProviderBill::BILLABLE_REQUEST_STATUSES`, une source ; le ticket dit « close » — un rapport existe dès la clôture du prestataire, et une contestation le retire). Catégories `maintenance_quote`, `maintenance_completion_report`, titre = titre de la demande, plus récent d'abord. Règle = forme SQL d'`actAsProvider` : `agencyIdsWhereAssignable()` une fois, puis une requête sur les demandes (assigné, bien d'une de ces agences).
- **Rapport** `GET maintenance-requests/{id}/completion-report/pdf` (`MaintenanceCompletionReportController`, vue `pdf.maintenance.completion-report`, clés `maintenance.completion_report_pdf.*` fr/en/wo) : bien, prestataire, dates, coût réel, travaux demandés, notes de résolution, photos avant (`before_photos`) / après (`completion_photos`) en URI `data:` (`PdfImageEmbedder`). `MaintenanceRequestPolicy::viewCompletionReport` (`Response`) : prestataire assigné (`actAsProvider`) ou personnel de l'agence (`isTeamPrincipalFor`) ; dans le cercle (lecteur de la demande — demandeur, bailleur — ou prestataire/personnel de l'agence) 403, hors cercle 404 (`denyAsNotFound`). Le bailleur n'est PAS lecteur du rapport (le ticket ne le nomme pas). 404 tant que le travail n'est pas rendu.
- **Facture** `GET service-provider-bills/{bill}/pdf` (`ServiceProviderBillPdfController`, vue `pdf.service-provider-bills.bill`, clés `maintenance.bill_pdf.*`) : `ServiceProviderBillPolicy::downloadPdf` — prestataire (brouillon compris), personnel de l'agence hors brouillon (la fiche), bailleur du bien si `rechargeable_to_landlord` ET validée/payée (`CHARGED_TO_LANDLORD_STATUSES` : « refacturée » = imputée). Autre prestataire de l'agence ou bailleur du bien non imputé : 403 ; sinon 404.
- **Front, compatibilité seulement** (l'écran est TCK-2898) : `coffre.ts` — genre `quotes_reports` (« Devis et rapports »), natures `devis`/`rapport`, `parent`/`reference` typés, le sous-dossier se range juste après son bien (`rangDuDossier`) et s'intitule « Bail · {locataire} », un sous-dossier vide ne se liste pas, un bien dont seul le bail a des entrées n'est pas « sans document », la facture se **télécharge** (le geste `aucun` tombe). Clés `documents.coffre.dossiers.devisEtRapports`, `entrees.devis`, `entrees.rapport` (wo = fr) ; vocabulaire du coffre régénéré. ⚠ Pour TCK-2898 : l'imbrication visuelle des sous-dossiers reste à faire.

**Mesures** : tests neufs `DocumentVaultOwnerLeaseSubfolderTest` (6), `DocumentVaultProviderQuotesReportsTest` (5), `ServiceProviderBillPdfTest` (6), `MaintenanceCompletionReportPdfTest` (5), front `coffre.tck-2897.test.ts` (2) — verts. Adaptés : `DocumentVaultOwnerTest`, `DocumentVaultBlockedLandlordTest`, `DocumentVaultProviderTest`, `DocumentVaultArchiveTest`, `LimiteDeDebitDuPilotePdfTest` (deux lignes : `factureDuPrestataire`, `rapportDeFinDIntervention`), `ValeursEnListeParcoursDesRoutesTest` (`HORS_PARCOURS` : `{bill}/pdf`), `RechercheDuCoffreVocabulaireTest`, front `coffre.tck-2656` et `vocabulaire-du-coffre.tck-2769`. 28 ablations, une à une, toutes rouges puis restaurées (md5) — dont la condition d'agence du coffre prestataire, d'abord VERTE (la liste vide d'agences court-circuitait) : le test garde désormais un prestataire encore assignable ailleurs ; AC6 rougit sous un jugement par demande (`isAssignable` dans la boucle). Joués aussi : `DocumentVault{Search,PrimedVaultParity,PrimedVerdictParity,Tenant,Impersonation,ReceiptsArchiveAllYears}Test`, `ArchiveAsynchroneDuCoffreTest`, `OwnerDocumentUploadTest`, `ServiceProviderBillTest`, `ImpersonationReadSweepTest`, `DateInventoryByValueTest`, `LangGroupParityTest`, les trois gardes d'architecture, `scripts/check-*.mjs` ; front : `src/lib/documents/__tests__`, `components/documents/coffre/__tests__`, `tsc`, `eslint`, `check:i18n`. Les deux gabarits se rendent sous le VRAI pilote local (`%PDF`, photos `data:` comprises : un test chacun, sans double). ⚠ `Response::denyAsNotFound()` est neuf dans `app/` : les deux policies jugent elles-mêmes le 404 « hors cercle » (là où `ServiceProviderBillController` résout la fiche dans le périmètre avant toute policy). Le téléchargement du front passe par `useTelechargementApi` (aucune liste de chemins à compléter). `docs/features.md` / `docs/models-spec.md` laissés à `/sync-specs`.
