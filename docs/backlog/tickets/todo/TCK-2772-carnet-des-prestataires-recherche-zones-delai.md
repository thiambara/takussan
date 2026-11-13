---
id: TCK-2772
title: "Carnet des prestataires : chercher par nom ou téléphone, filtrer par zone sur la liste des zones servies, et le délai de réponse de chacun"
status: todo
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-13
depends_on: [TCK-2653]
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  models:
    - "docs/models-spec.md#37-serviceproviderprofile-"
tags: [back, front, maintenance, prestataires, carnet, suite-de-tck-2653, audit-ux, app]
---

## Objectif utilisateur

L'agent qui cherche « le plombier de Sacré-Cœur » ou un numéro qu'on vient de lui donner le trouve dans le carnet en tapant son nom, son numéro ou sa zone. Il voit aussi lequel répond vite.

## Constat (2026-11-13, relu dans le code)

TCK-2653 (lot 3) livre le carnet de la maquette « Agence — carnet des prestataires » (`/app/maintenance/providers`, `ServiceProvidersList`) sans trois éléments que l'API ne permet pas de tenir :

1. **Pas de recherche par nom.** `GET /api/agencies/{agency}/service-providers` déclare `filter[search]`, mais `ServiceProviderProfile::$requestSearchFields = ['insurance_policy_id']` (`takussan-api/app/Models/Profiles/ServiceProviderProfile.php:61`). Une recherche par nom ne trouve donc rien. Le prénom, le nom et le téléphone vivent sur `users`, ou dans `metadata` pour une invitation sans compte.
2. **Pas de filtre de zone utilisable.** `filter[zone]` existe (`customQueryFilters`, `orWhereJsonContains('service_areas', …)`), mais aucune liste des zones n'est servie. Le front ne peut proposer que ce qu'il a déjà chargé, ce qui n'est pas un filtre serveur.
3. **Pas de « Délai de réponse ».** La maquette l'affiche par prestataire (« répond en ~2 h »). Aucun champ n'est servi : ni délai médian entre l'assignation et l'acceptation, ni horodatage d'acceptation agrégé.

## Delta

- **API, recherche :** `filter[search]` cherche aussi le prénom, le nom et le téléphone du compte (`users`), ainsi que `metadata->first_name`, `metadata->last_name` et `metadata->phone` d'une invitation. La recherche est insensible à la casse par `App\Support\CaseInsensitive` (sous `--locale=C`, `lower()` ne replie que l'ASCII).
- **API, zones :** les zones distinctes du carnet de l'agence (`service_areas` des prestataires collaborateurs), triées, dans `meta.zones` de la liste ou sur un endpoint dédié. Ce ticket tranche entre les deux.
- **API, délai :** si la donnée existe, un `response_delay_minutes` (médiane sur les interventions de l'agence) ; sinon, ce ticket l'écrit comme non mesurable et la maquette perd la ligne. Ce point se re-mesure d'abord : trouver l'horodatage qui dit « accepté ».
- **Front :** un champ de recherche (`DebouncedSearchInput`) et un sélecteur de zone, tous deux passés au serveur (`filter[search]`, `filter[zone]`), dans `ServiceProvidersList`, sur le modèle du filtre de métier. Le délai s'affiche dans la colonne Note ou sur la carte téléphone.

## Critères d'acceptation

- [ ] `filter[search]=Sy` rend Astou Sy, `filter[search]=77538` rend le prestataire de ce numéro, et une invitation sans compte se trouve par son nom. Les trois cas sont couverts par des tests de fonctionnalité qui échouent sans le correctif (vérifié par ablation).
- [ ] La recherche ne rend jamais un prestataire hors des collaborations de l'agence (test de fuite inter-agence).
- [ ] La liste des zones ne contient que celles des prestataires de l'agence (test de fuite inter-agence).
- [ ] Le carnet relit la liste avec `filter[search]` et `filter[zone]` (test front sur le faux serveur, comme `ServiceProvidersList.carnet.tck-2653.test.tsx`).
- [ ] Le délai de réponse est servi et affiché, ou ce ticket écrit, mesure à l'appui, qu'il ne se calcule pas, et la fiche de fidélité de TCK-2653 note l'écart comme définitif.
