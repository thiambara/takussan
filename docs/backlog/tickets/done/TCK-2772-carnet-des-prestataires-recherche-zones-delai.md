---
id: TCK-2772
title: "Carnet des prestataires : chercher par nom ou téléphone, filtrer par zone sur la liste des zones servies, et le délai de réponse de chacun"
status: done
phase: P2
family: full
estimate: M
wave: 90
created: 2026-11-13
updated: 2026-11-14
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

- [x] `filter[search]=Sy` rend Astou Sy, `filter[search]=77538` rend le prestataire de ce numéro, et une invitation sans compte se trouve par son nom. Les trois cas sont couverts par des tests de fonctionnalité qui échouent sans le correctif (vérifié par ablation).
  - Preuve : `tests/Feature/ServiceProvider/CarnetRechercheZonesDelaiTest.php` (trois premiers tests) ; ablation « hook de recherche retiré » : 3 rouges. ⚠ L'invitation se trouve par la requête qui demande `filter[collaboration_status]=active,paused`, ce que le carnet n'envoie pas : à l'écran, une invitation en attente n'est ni listée ni trouvable (voir Notes).
- [x] La recherche ne rend jamais un prestataire hors des collaborations de l'agence (test de fuite inter-agence).
  - Preuve : un « Sy » et un « Froid » d'une autre agence dans les fixtures ; ablation « clauses posées hors du groupe `OR` » : 2 rouges.
- [x] La liste des zones ne contient que celles des prestataires de l'agence (test de fuite inter-agence).
  - Preuve : `test_les_zones_du_carnet_…` ; ablations « zones sans agence » et « zones de la requête filtrée » : rouges.
- [x] Le carnet relit la liste avec `filter[search]` et `filter[zone]` (test front sur le faux serveur, comme `ServiceProvidersList.carnet.tck-2653.test.tsx`).
  - Preuve : `ServiceProvidersList.recherche-zone-delai.tck-2772.test.tsx` ; le faux serveur rend une ligne qu'aucun filtre client n'aurait gardée ; ablation « paramètres retirés de la lecture » : 2 rouges.
- [x] Le délai de réponse est servi et affiché, ou ce ticket écrit, mesure à l'appui, qu'il ne se calcule pas, et la fiche de fidélité de TCK-2653 note l'écart comme définitif.
  - Preuve : servi et affiché. `response_delay_minutes` = médiane de `accepted_at` moins la dernière entrée `status.assigned` du journal (TCK-2786) antérieure, sur les biens de l'agence. Tests : `test_le_delai_…` (deux) ; ablations « sans agence » et « sans borne `accepted_at` » : rouges. Front : colonne « Délai de réponse » et « Répond en ~… » sur la carte.
  - La démo n'a aucune mesure (0 `accepted_at` sur 122 demandes, aucune entrée `status.*` au journal, relevé du 2026-11-14) : l'écart de fidélité de TCK-2653 devient « donnée », non définitif.

## Notes d'implémentation (2026-11-14)

- **Délai, option a) retenue par la session** : une requête pour toute la page (sous-requête corrélée agrégée). `test_le_delai_ne_coute_aucune_requete_par_prestataire` épingle le nombre de requêtes (1 prestataire contre 6 : même compte, une seule lecture du journal) ; ablation « une requête par ligne » : rouge (17 contre 12). Sans mesure, la colonne montre « — » et la carte n'a pas la ligne (test front).
- **Zones : `meta.zones` de la liste**, et non un endpoint dédié : une lecture de moins, et la même autorisation. Elles sont lues sur une requête neuve du périmètre (agence, statuts de collaboration), donc elles ne suivent ni la recherche ni la zone choisie. Tri par la collation `und-x-icu`.
- **Recherche** : un point d'extension `HasQueryBuilder::extraSearchClauses()`, appelé DANS le groupe `OR` du repli SQL de `filter[search]`, reste le seul chemin de recherche (garde `check-filtering-single-mechanism` verte). `CaseInsensitive::sqlCleJson()` est la forme pour une clé JSON. La recherche couvre aussi le quartier (texte de `service_areas`), puisque la maquette annonce « Nom, métier, quartier ».
- **Alias** : la consigne de la recherche est « Nom, téléphone, quartier ». Le métier est un code (`plumbing`) et ne se cherche pas en texte ; il garde son filtre.
- **Écart constaté hors périmètre** : une invitation crée sa collaboration en `paused`, et le carnet n'en liste par défaut que les `active`. Les invitations en attente n'apparaissent donc pas sans `filter[collaboration_status]=active,paused`, ce que le front n'envoie pas. Les tests de la recherche d'une invitation passent ce filtre. Décision de la session (2026-11-14) : ticket à part, [TCK-2829](TCK-2829-invitation-en-attente-visible-dans-le-carnet.md) — `paused` couvre aussi les collaborations suspendues, et les mêler au carnet par défaut serait un changement de produit.

- 2026-11-14 : clôturé — jugé au HEAD 0053d0bbd, tous les AC tenus avec preuve (verdict de clôture 2026-11-14-b).
