---
id: TCK-2906
title: "API — fiches du bien et du bail : interventions en cours, date de révision possible, préavis saisi à la création, téléphone de l'agent responsable, comptes des onglets, et l'aperçu du contrat avant création"
status: todo
phase: P2
family: back
estimate: M
wave: 92
created: 2026-11-15
updated: 2026-11-15
depends_on: []
blocks: [TCK-2908, TCK-2912]
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
    - "docs/features.md#14-location-longue-durée-baux"
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#3-property"
    - "docs/models-spec.md#14-lease-"
    - "docs/models-spec.md#21-maintenancerequest-"
tags: [back, biens, baux, interventions, contrat, audit-ux, app]
---

## Objectif utilisateur

Sur la fiche d'un bien loué comme sur le dossier d'un bail, l'agent voit qu'une intervention est en cours, quand le loyer pourra être révisé, appelle l'agent responsable, et relit le contrat avant de créer le bail.

## Contrat de données

Constat (vérifié à l'écriture) :

- **Interventions** : `filter[lease_id]` et `filter[property_id]` existent sur `maintenance-requests` (`MaintenanceRequest.php:107`), mais ni `PropertyResource` ni `LeaseResource` ne rendent un compte d'interventions ni la dernière ouverte (`maintenanceRequests` n'est pas dans `Property::$requestCountable` ; `Lease::$requestCountable` le permet, `LeaseResource` ne le rend pas). Fiches `TCK-2639.json` a-2 (« 1 intervention en cours » — **aucun code ne la rend**) et `TCK-2645.json` a-1 (« Interventions (3) » — « question posée », aucun ticket).
- **Révision** : seul le plafond `rent_review_cap_pct` est servi (`LeaseResource.php:201`) ; aucune date. La file « À traiter » connaît déjà la règle (« date anniversaire passée sans révision depuis 12 mois », features § 1.4).
- **Préavis** : `notice_period_days` est rendu (`LeaseResource.php:112`) mais **aucune requête de création ou de mise à jour ne l'accepte** (aucune occurrence dans `app/Http/Requests`).
- **Agent responsable** : `party($lease->agent, false)` retire le téléphone (`LeaseResource.php:260-261`).
- **Comptes des onglets** du bail : `documents` est comptable sur `Lease`, mais seul `renewals_count` est rendu ; aucun compte d'historique.
- **Aperçu du contrat** : seul `GET leases/{lease}/contract/pdf` existe, sur un bail créé ; `GET leases/defaults` ne rend que des valeurs. Fiche `TCK-2643.json` a-2-bureau.

Audit (`audit-f4-patrimoine.md`) : app-biens **e2** ; app-baux **e1**, **e2**.

À servir :

1. `PropertyResource` (détail agence) et `LeaseResource` : `maintenance_summary { total, open, latest_open { id, title, status_label_code } }`.
2. `LeaseResource` : `next_revision_date` (prochaine date anniversaire où une révision est possible, nulle sur un bail sans clause de révision ou terminé).
3. Création et mise à jour d'un bail : `notice_period_days` (borné), prérempli depuis les réglages comme les autres termes ; imprimé au contrat.
4. `LeaseResource` : `agent.phone` pour les lecteurs du personnel de l'agence (pas pour le locataire ni le bailleur, sauf décision contraire écrite).
5. `LeaseResource` : `documents_count` et `history_count` (entrées du journal d'activité du bail) sur demande (`include=documentsCount` / équivalent).
6. `POST /api/leases/contract-preview` : rend le PDF (ou le HTML) du contrat à partir des données du formulaire de création, sans rien écrire en base.

## Contraintes strictes (métier)

- `maintenance_summary` ne compte que ce que le lecteur peut lire (même portée que `GET maintenance-requests`) ; jamais une demande d'une autre agence.
- `next_revision_date` suit la règle de la file « À traiter » (une source, pas deux) : test qui compare les deux.
- L'aperçu du contrat : autorisation `LeasePolicy::createOn` sur le bien **avant** la validation (comme TCK-2767) ; aucun `Lease`, aucun média ni aucune ligne de journal créés ; mêmes règles de validation que la création.
- Le téléphone de l'agent ne sort jamais vers un lecteur hors du personnel de l'agence.

## Delta à produire

- [ ] `maintenance_summary` sur les deux ressources (agrégat en une requête ; `maintenanceRequests` ajouté aux comptables de `Property`).
- [ ] `next_revision_date` (service partagé avec la file « À traiter »).
- [ ] `notice_period_days` dans `StoreLeaseRequest` / `UpdateLeaseRequest` et le gabarit du contrat.
- [ ] `agent.phone` conditionnel dans `LeaseResource`.
- [ ] `documents_count`, `history_count`.
- [ ] `LeaseContractPreviewController` + route `leases.contract-preview`.
- [ ] Tests : `PropertyMaintenanceSummaryTest`, `LeaseMaintenanceSummaryTest`, `LeaseNextRevisionDateTest`, `LeaseNoticePeriodTest`, `LeaseAgentPhoneVisibilityTest`, `LeaseContractPreviewTest` (aucune écriture : compte des tables avant/après ; 403 sans `createOn`).

## Critères d'acceptation

- [ ] AC1 — Un bien avec 3 interventions dont 1 au statut en cours (« Rideau métallique ») rend `maintenance_summary = {total: 3, open: 1, latest_open: {title: "Rideau métallique", …}}` ; le bail de ce bien rend le même résumé restreint à ses demandes (`lease_id`).
- [ ] AC2 — Un bail commencé le 1 juil. 2026 avec un plafond de révision rend `next_revision_date = 2027-07-01` ; un bail terminé rend `null`.
- [ ] AC3 — `POST /api/leases` avec `notice_period_days = 90` enregistre 90 et le PDF du contrat mentionne un préavis de 3 mois ; 0 ou 400 → 422.
- [ ] AC4 — Lu par un agent de l'agence, le bail rend `agent.phone` ; lu par le locataire, `agent` n'a pas de `phone`.
- [ ] AC5 — `POST /api/leases/contract-preview` avec un formulaire valide rend un document de contrat qui contient le nom du locataire et le loyer ; le nombre de lignes de `leases`, `media` et `activity_log` est inchangé ; sans le droit d'ouvrir un bail sur ce bien : 403.
- [ ] AC6 — Le bail rend `documents_count` égal au nombre de documents listés pour la cible `lease:{id}`.

## Hors périmètre

- Les écrans (TCK-2908, TCK-2912).
- La date d'avis d'échéance (TCK-2915).

## Notes d'implémentation

_(à remplir par implementing-specs)_
