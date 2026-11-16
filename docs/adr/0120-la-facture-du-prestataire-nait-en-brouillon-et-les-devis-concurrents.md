# ADR-0120 — La facture du prestataire naît en brouillon et part par « Facturer » ; les devis concurrents consultés sont un modèle à eux

- **Statut** : Accepté le 2026-11-15 — décision prise à l'écriture de TCK-2911, « valide tes choix » du porteur, à confirmer à la revue
- **Date** : 2026-11-15
- **Tickets** : TCK-2911 (API), TCK-2919 (écrans)
- **S'appuie sur** : [ADR-0039](0039-les-sorties-d-argent.md) § 8 (la facture d'intervention, pièce **reçue**) et son amendement du 2026-10-25 (TCK-2270, facture d'une intervention rouverte), [ADR-0118](0118-interventions-motif-d-annulation-telephone-du-demandeur-et-demande-de-creneau.md) (la demande de créneau, même forme de table)

## Contexte

Audit `app-interventions`, mesuré le 2026-11-15 :

- **e7 (prestataire)** : la maquette montre « À facturer · 2 », un bouton « Facturer » par intervention terminée et « Relevé de mes factures ». Aujourd'hui la facture naît **seule** en `pending_validation` à la clôture (`MaintenanceRequestObserver::bill()`), au montant du coût réel ou du devis approuvé : le prestataire ne facture rien, et aucun relevé n'existe.
- **e6 (bailleur)** : « Depuis janvier — 12 interventions, dont 9 closes ; à votre charge 1 521 000 F, déduit de vos revenus », et « Dakar Immo a consulté deux autres artisans (520 000 F et 610 000 F) et recommande ce devis ». Aucun endpoint ne somme les interventions d'un bailleur ; une demande n'a qu'un jeu de colonnes `quote_*`.

## Décision

### 1. La facture naît `draft` et part par « Facturer »

- Nouveau statut `draft` de `ServiceProviderBill`. `MaintenanceRequestObserver` crée la facture **dans les mêmes conditions qu'avant** (prestataire assigné, montant > 0 : coût réel, à défaut devis approuvé, arrondi à l'unité de la devise), mais en `draft`. Pas de colonne ni de contrainte à migrer : `status` est une chaîne, et l'index unique partiel `sp_bills_one_open_per_request` compte déjà `draft` parmi les factures ouvertes.
- **Les factures existantes gardent leur statut** ; seules les clôtures postérieures au déploiement naissent `draft`.
- `POST /api/service-provider-bills/{bill}/submit` (« Facturer ») : **le prestataire de la facture seul** (403 pour tout autre, personnel compris), depuis `draft` seulement (422 `service_provider_bill.not_draft`), et seulement si l'intervention est encore rendue (`completed`/`closed`, 422 `service_provider_bill.request_not_completed`). Sous verrou. Le corps porte, facultatifs : `amount` (le montant final, > 0, arrondi à l'unité de la devise ; à défaut celui du brouillon), `provider_reference` (son numéro de facture), `file` (sa pièce, PDF ou image). `exceeds_quote` est recalculé contre le devis approuvé. La facture passe `pending_validation` et reçoit `submitted_at`.
- **Le brouillon n'est pas une pièce reçue** (ADR-0039 § 8) : il n'est lu que de son prestataire (et du super-admin). La liste et le détail de l'agence ne le rendent pas ; il ne se valide, ne se rejette, ne se paie ni ne s'impute (les gardes en place exigent `pending_validation` ou `validated`). Il n'entre donc ni dans les sorties d'argent ni dans le relevé du bailleur.
- **Contestation ou annulation** de l'intervention : un brouillon n'est jamais engagé, il passe `cancelled` (`ReopenedRequestBills`, explicitement), et la fin des travaux suivante en fait naître un neuf.
- La pièce du prestataire est rangée dans la collection privée `invoice` de la facture, rendue en URL d'API signée (`PrivateMediaAccess`) à qui lit la facture.

### 2. Le relevé des factures du prestataire

`GET /api/service-provider-bills/statement/pdf?from=YYYY-MM-DD&to=YYYY-MM-DD` (défaut : le mois en cours ; 366 jours au plus) : un PDF des factures **dont l'appelant est le prestataire**, hors brouillons (pas encore émises), datées par `submitted_at`, à défaut `created_at` pour les factures antérieures à cet ADR. Ce n'est pas une facture « au nom du prestataire » (ADR-0039 § 8 l'exclut toujours) : c'est une liste de pièces déjà reçues, avec leur statut, le facturé (hors rejetées et annulées) et le payé, par devise. Montants à l'unité de la devise (XOF sans sous-unité).

### 3. Les devis concurrents consultés

Table `maintenance_quote_alternatives` : `maintenance_request_id` (cascade), `provider_id` (utilisateur, nullable, `null` à sa suppression), `provider_name` (nom libre, nullable — l'un des deux est exigé), `amount` (décimal), `currency`, `created_by_id`, horodatages ; pièce facultative dans la collection privée `quote`. Pas d'`agency_id` : la ligne se lit toujours par sa demande.

- **Écriture** (`POST`/`DELETE /api/maintenance-requests/{id}/quote-alternatives[/{alternative}]`) : le **personnel actif de l'agence du bien** qui détient `maintenance.assign` (`isTeamPrincipalFor`, comme « Relancer le bailleur ») — jamais le bailleur, le prestataire ni le locataire. Pas sur une demande close ou annulée (422 `maintenance.terminal_request`). Cinq au plus par demande.
- **Lecture** : `quote_alternatives[]` au détail de la demande, aux seuls **donneurs d'ordre** (bailleur du bien, personnel de l'agence, super-admin). **Clé absente** pour le prestataire — l'assigné compris : le prix d'un concurrent n'est pas le sien — et pour le demandeur locataire. La « recommandation » est le devis en place (`quote_*`) : aucune colonne de plus.

### 4. Le bilan « Depuis janvier » du bailleur

`GET /api/owner/maintenance-summary?since=YYYY-MM-DD` (défaut : 1er janvier de l'année en cours) pour le bailleur du **profil actif** (403 sinon) : `{ since, total, closed, charged_amount, currency, by_property[] { property {id, title}, total, closed, charged_amount } }`.

- Périmètre : ses biens au sens de `BailleurDuBien` **dans l'agence du profil actif** (`PortfolioScope::landlord()->dansLAgence()`) — jamais un bien qu'il a saisi comme agent, jamais une autre agence.
- `total` : les interventions **signalées** depuis `since` (`created_at`), **hors annulées** (une intervention annulée n'a pas eu lieu) ; `closed` : celles d'entre elles au statut `closed`.
- `charged_amount` : la somme des factures de ces interventions **refacturables et validées ou payées** — la règle du relevé du bailleur, posée une fois (`ServiceProviderBill::CHARGED_TO_LANDLORD_STATUSES`) et lue par `PayoutCalculator` comme par le bilan.
- `by_property` : un élément par bien qui a au moins une intervention dans la période ; leurs `total` somment le `total`.

## Conséquences

- L'agence ne paie plus une intervention terminée tant que le prestataire n'a pas « Facturé » : c'est le prix voulu par la maquette (le prestataire est l'émetteur de sa facture). Une intervention dont le prestataire ne facture jamais reste sans facture à valider ; l'agence ne la voit pas dans sa liste des factures. Aucune notification neuve dans ce ticket.
- Les tests qui validaient la facture juste après la clôture la font d'abord partir (`submit`).
- Le front reçoit un statut de plus (`draft`), déclaré dans ses types, et son libellé.

## Application

- `ServiceProviderBillStatus::Draft`, `MaintenanceRequestObserver::bill()`, `ReopenedRequestBills::committed()`, `ServiceProviderBillController::submit()` et `::visibleTo()`, `SubmitServiceProviderBillRequest`, `ServiceProviderBillPolicy::submit()`, colonne `service_provider_bills.submitted_at`.
- `ServiceProviderBillStatementController`, gabarit `pdf.service-provider-bills.statement`.
- `MaintenanceQuoteAlternative`, `MaintenanceQuoteAlternativeController`, `StoreMaintenanceQuoteAlternativeRequest`, `MaintenanceRequestPolicy::manageQuoteAlternatives()`, `MaintenanceRequestResource` (`quote_alternatives`).
- `OwnerMaintenanceSummaryController`, `ServiceProviderBill::CHARGED_TO_LANDLORD_STATUSES`.
- Tests : `ServiceProviderBillDraftSubmitTest`, `ServiceProviderBillStatementPdfTest`, `MaintenanceQuoteAlternativesTest`, `OwnerMaintenanceSummaryTest`.
