---
id: TCK-904
title: "Carnet des prestataires sans numéro de police ni metadata non lue ; file d'onboarding en enveloppe canonique ; détail du bail sans renouvellements non chargés"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
    - "docs/features.md#14-location-longue-durée-baux"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-21--données-personnelles-dun-user-sorties-par-include"
tags: [back, ressources, pagination, donnees-personnelles, pistes]
---

## Contexte

Réf : **P21.06** du fichier de pistes, `validé` (critère V7 du dernier classement accordé, V3 du
classement précédent tranché par la précision).

- `GET /api/agencies/{agency}/service-providers` rendait la ligne `service_provider_profiles`
  brute : tout `metadata` et `insurance_policy_id`, même sans les demander.
- `GET /api/agencies/{agency}/tenant-onboarding-pending` rendait le paginateur Laravel brut
  (`current_page`, `links`, `next_page_url`…), la forme que TCK-304 a retirée.
- `GET /api/leases/{id}` rendait `renewed_from`, `renewals` et `renewals_count` en `{}` : le
  détail appelle `toArray()` directement, qui ne filtre pas les `MissingValue`.

## Décision du porteur

validé — la ressource du carnet des prestataires ne sort de `metadata` que les sous-clés que le front lit (`ServiceProvidersList.tsx`, `MaintenanceAssignmentBlock.tsx` : nom, e-mail, métiers, zones et disponibilités du brouillon), et jamais `insurance_policy_id` ; `tenant-onboarding-pending` passe par `$this->paginated()` ; les clés non chargées de `LeaseResource` sont ôtées comme `commission_amount`

## Objectif utilisateur

Aucun changement visible : les écrans lisent les mêmes clés. Le numéro de police d'assurance d'un
prestataire et ce que `metadata` porte au-delà du brouillon ne sortent plus.

## Contraintes strictes

- Carnet : `metadata` réduit à `first_name`, `last_name`, `email`, `trades`,
  `intervention_zones` et `availability` ; `insurance_policy_id` retiré même s'il est demandé par
  `fields[service_provider_profiles]`. Le reste de la ligne, la note moyenne et le `User` inclus
  (TCK-693) inchangés.
- File d'onboarding : `$this->paginated()`, les lignes et leur `User` inclus inchangés.
- Bail : seules les trois clés de renouvellement sont ôtées quand elles ne sont pas chargées ; une
  relation chargée (`property`, `tenant`…) reste rendue.

## Delta à produire

- [x] `App\Http\Resources\ServiceProviderDirectoryResource`, employée par
      `ServiceProviderProfileController::index()` avec `$this->paginated()`.
- [x] `TenantOnboardingPendingController` par `$this->paginated()`.
- [x] `LeaseResource` ôte `renewed_from`, `renewals` et `renewals_count` restés `MissingValue`.
- [x] Tests : `ServiceProviderDirectoryProjectionTest`, `LeaseResourceUnloadedRelationsTest`, un
      test ajouté à `TenantOnboardingChecklistTest` ; l'assertion de `IncludedUserProjectionTest`
      qui épinglait le paginateur brut suit l'enveloppe canonique.

## Critères d'acceptation

- [x] AC1 — Le carnet, avec les champs du front, rend `metadata` réduit aux six sous-clés et sans
      `insurance_policy_id`.
- [x] AC2 — `insurance_policy_id` ne sort ni par défaut ni quand `fields[…]` le demande.
- [x] AC3 — La file d'onboarding rend `data` et `meta` (`total`, `per_page`, `current_page`,
      `last_page`), et rien d'autre à la racine.
- [x] AC4 — Le détail du bail ne rend aucune des trois clés de renouvellement, et rend `property`.

## Hors périmètre

- `metadata.phone` : déclaré dans le type du front, lu par aucun composant, donc retiré avec le
  reste, comme la précision le prévoit.
- `insurance_policy_id` reste dans `$queryFields` du modèle : le retirer changerait un 400 en
  réponse, pour un gain nul puisque la ressource ne le rend plus.

## Notes d'implémentation

- **Mesure avant** : les quatre tests rouges — `metadata` complet et `insurance_policy_id` rendus,
  racine `current_page`/`links`… sans `meta`, `renewed_from` présent.
- **Ablation** : chacun des trois fichiers rendu à sa forme d'avant rougit ses seuls tests (2, 1,
  1) ; remis → 24 verts.
- `IncludedUserProjectionTest` (TCK-693) assertait `current_page` à la racine : sa phrase « la
  forme du paginateur brut ne change pas » valait pour TCK-693. Assertion changée, pas retirée.
- Le front lit déjà cette réponse en `PaginatedResponse`, `meta` obligatoire : rien à y changer.
