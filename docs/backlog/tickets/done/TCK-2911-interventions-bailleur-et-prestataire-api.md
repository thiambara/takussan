---
id: TCK-2911
title: "API — interventions côté bailleur et prestataire : le bilan « Depuis janvier », les devis concurrents consultés, « À facturer » et « Facturer », et le relevé des factures du prestataire"
status: done
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: [TCK-2919]
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#21-maintenancerequest-"
    - "docs/models-spec.md#77-serviceproviderbill-"
tags: [back, interventions, bailleur, prestataire, factures, devis, audit-ux, app]
---

## Objectif utilisateur

Le bailleur sait ce que les interventions lui ont coûté depuis janvier, bien par bien, et voit que l'agence a comparé trois devis avant de lui recommander l'un d'eux ; le prestataire facture lui-même ce qu'il a terminé et télécharge le relevé de ses factures.

## Contrat de données

Constat (vérifié à l'écriture) :

- **Bilan du bailleur** : aucun endpoint ne somme les interventions d'un bailleur depuis une date ; `dashboard/owner` ignore la maintenance. Ce qui est « à sa charge » est un booléen par facture (`ServiceProviderBill.rechargeable_to_landlord`), repris en lignes du relevé (`OwnerStatementService.php:227-252`). Historique par bien : `GET properties/{property}/maintenance-requests`.
- **Mise en concurrence** : un seul jeu de colonnes `quote_*` par demande (`MaintenanceRequest.php:72-76`) ; aucun devis concurrent.
- **Factures du prestataire** : la facture naît **seule** en `pending_validation` quand la demande passe `completed` (`MaintenanceRequestObserver.php:64-87`) ; aucun état « à facturer », aucun geste « Facturer » ; routes `service-provider-bills` : index, show, validate, reject, pay ; aucun relevé.
- **Calendrier** : `GET /api/calendar` rend déjà les interventions assignées à l'appelant (`CalendarEventCollector.php:62,431-455`) — rien à faire ici.

Audit (`audit-f4-patrimoine.md`, app-interventions **e6** bailleur : « Depuis janvier » absent, mise en concurrence absente ; **e7** prestataire : « À facturer · 2 », « Facturer », « Relevé de mes factures » absents ; fiche `TCK-2654.json` a-7 « question produit renvoyée au porteur »).

> **Décision prise à l'écriture du ticket (à confirmer par le porteur à la revue)** : la maquette fait facturer le prestataire. La facture naît donc en **brouillon** (`draft`) à la clôture, avec le montant du devis approuvé. Elle est « à facturer » tant que le prestataire ne l'a pas envoyée. « Facturer » lui permet d'ajuster le montant final et de joindre sa pièce, puis la fait passer en `pending_validation`. Le reste du cycle (validation, refus, paiement) ne change pas.

À servir :

1. `GET /api/owner/maintenance-summary?since=YYYY-MM-DD` (défaut : 1er janvier de l'année en cours) : `{ total, closed, charged_amount, by_property[] { property, total, closed, charged_amount } }` pour le bailleur du profil actif.
2. Devis concurrents : le personnel de l'agence enregistre sur une demande les devis consultés et non retenus (prestataire ou nom libre, montant, pièce facultative) ; le détail de la demande les rend au bailleur avec la recommandation.
3. Statut `draft` de `ServiceProviderBill` ; `POST service-provider-bills/{bill}/submit` (le prestataire auteur : montant final, pièce) ; la liste du prestataire filtre `status=draft` (« À facturer »).
4. `GET service-provider-bills/statement/pdf?from=&to=` : le relevé des factures du prestataire sur une période.

## Contraintes strictes (métier)

- Le bilan ne compte que les biens du bailleur dans l'agence du profil actif ; `charged_amount` = somme des factures `rechargeable_to_landlord` validées ou payées (même règle que le relevé du bailleur, une source).
- Une facture `draft` n'entre ni dans le relevé du bailleur ni dans les sorties d'argent (ADR-0039) avant `submit`.
- Migration du statut : les factures existantes gardent leur statut ; seules les clôtures postérieures naissent `draft`.
- Devis concurrents : écrits par le seul personnel de l'agence, jamais visibles d'un autre prestataire.
- Montants décimaux en base, XOF sans sous-unité dans les PDF.

## Delta à produire

- [ ] **Écrire l'ADR** (numéro suivant libre) avant le code : la facture du prestataire naît en brouillon et part par « Facturer » (cycle de vie de `ServiceProviderBill`, à articuler avec [ADR-0039](../../../adr/0039-les-sorties-d-argent.md)), et la table des devis concurrents (modèle neuf).
- [ ] `OwnerMaintenanceSummaryController` + route `owner.maintenance-summary`.
- [ ] Migration `create_maintenance_quote_alternatives_table` ; endpoints `POST/DELETE maintenance-requests/{id}/quote-alternatives` ; `MaintenanceRequestResource` : `quote_alternatives[]`.
- [ ] `ServiceProviderBillStatus::Draft` ; `MaintenanceRequestObserver` crée `draft` ; `SubmitServiceProviderBillRequest` + route `service-provider-bills.submit`.
- [ ] `ServiceProviderBillStatementController` (PDF).
- [ ] Tests : `OwnerMaintenanceSummaryTest` (année, autre agence, charge), `MaintenanceQuoteAlternativesTest` (écriture agence seule, lecture bailleur, invisible d'un autre prestataire), `ServiceProviderBillDraftSubmitTest`, `ServiceProviderBillStatementPdfTest`, garde : une facture `draft` absente du relevé du bailleur.

## Critères d'acceptation

- [ ] AC1 — Un bailleur dont les biens ont eu 12 interventions depuis le 1er janvier, dont 9 closes, et 1 521 000 F de factures refacturées validées, reçoit `{total: 12, closed: 9, charged_amount: 1521000}` et un `by_property` dont la somme égale le total.
- [ ] AC2 — L'agence enregistre deux devis concurrents (520 000 F, 610 000 F) ; le détail lu par le bailleur les rend ; lu par un prestataire non retenu, `quote_alternatives` est absent.
- [ ] AC3 — À la clôture d'une demande, la facture naît `draft` ; `GET service-provider-bills?filter[status]=draft` du prestataire la rend ; `POST …/submit` par lui la passe `pending_validation` ; par un autre prestataire : 403.
- [ ] AC4 — Une facture `draft` n'apparaît pas dans le relevé du bailleur du mois.
- [ ] AC5 — `GET service-provider-bills/statement/pdf?from=2026-11-01&to=2026-11-30` rend un PDF listant les factures du prestataire de la période, et aucune d'un autre prestataire.

## Hors périmètre

- Les écrans (TCK-2919).
- La fiche de l'agence et le locataire (TCK-2917).

## Notes d'implémentation

Implémenté le 2026-11-15 (worktree `feat/audit-manques-2026-11-15`), [ADR-0120](../../../adr/0120-la-facture-du-prestataire-nait-en-brouillon-et-les-devis-concurrents.md) écrit d'abord.

**Prémisses re-mesurées — ce qui différait :**
- Aucune migration de statut n'était nécessaire : `service_provider_bills.status` est une chaîne sans contrainte, et l'index unique partiel `sp_bills_one_open_per_request` compte déjà `draft` parmi les factures ouvertes. Migration ajoutée pour `submitted_at` (l'instant de « Facturer »).
- AC4 était déjà vrai par construction (un brouillon ne se valide pas, donc ne s'impute pas) : la garde a été vérifiée par ablation de la vraie porte (la liste de statuts de `scopeChargedToLandlord`), pas de l'observateur.
- « Montant du devis approuvé » : l'observateur garde ses conditions (prestataire assigné, montant > 0 : coût réel, à défaut devis approuvé). Une intervention sans montant ne naît toujours pas de facture.

**Choix (décisions mineures tranchées, « valide tes choix ») :**
- Le brouillon n'est lu que de son prestataire : la liste et le détail de l'agence l'excluent (pièce non encore reçue, ADR-0039 § 8). `submit` : 403 pour tout autre que le prestataire (personnel compris), 422 `service_provider_bill.not_draft`, 422 `request_not_completed` rejugé sous verrou ; `amount` facultatif arrondi à l'unité de la devise, `exceeds_quote` recalculé, `provider_reference` et pièce (`invoice`, privée) facultatifs. La contestation annule le brouillon (`ReopenedRequestBills`, explicitement).
- Relevé : hors brouillons, daté `COALESCE(submitted_at, created_at)`, défaut le mois en cours, 366 jours au plus ; totaux « facturé » (hors rejetées/annulées) et « dont payé » par devise. Gabarit `pdf.service-provider-bills.statement`, libellés `maintenance.bill_statement_pdf.*` (fr/en/wo).
- Bilan : `total` = interventions signalées depuis `since`, **hors annulées** ; `closed` = statut `closed` seul ; `charged_amount` = factures de ces interventions, refacturables, `validated`/`paid` (`ServiceProviderBill::CHARGED_TO_LANDLORD_STATUSES`, lu aussi par `PayoutCalculator::rechargeableBills` et `PayoutService::billImputable` — une source). Périmètre `PortfolioScope::landlord()->dansLAgence()`. Route dans `routes/api/owners.php`.
- Devis concurrents : écriture `isTeamPrincipalFor` + `maintenance.assign` (règle de `remindOwner`), lecture aux seuls donneurs d'ordre (clé absente pour le prestataire assigné et le demandeur), 5 au plus, pas sur une demande close/annulée ; pièce privée `quote`. Les gestes rendent la demande au détail.

**Mesures :** 19 tests neufs verts (4 fichiers) ; 26 ablations rouges puis restaurées (md5) — seule la garde `requestIsBillable` de `submit` restait verte sous le premier test (le brouillon est annulé avant) : test dédié ajouté (statut écrit hors observateur). `ServiceProviderBillTest` et `FactureDInterventionRouverteTest` adaptés (la facture est d'abord « envoyée »). Gardes : `MediaDiskCollectionsTest` (deux collections privées), `LimiteDeDebitDuPilotePdfTest` (ligne du relevé), `LabelKeysCoverValuesTest` (statuts du relevé), architecture ×3, balayages ×3, `LangGroupParityTest`, `scripts/check-*.mjs` verts.

**Front (types seulement, écrans = TCK-2919) :** `draft` dans l'union `ServiceProviderBillStatus`, `submitted_at` et `invoice` déclarés (`types/invoice.ts`), ton `draft` (`components/payments/constants.ts`), libellé `payments.serviceProviderBills.status.draft` (« À facturer ») — exigés par `check-status-unions` / `check-status-labels`.
