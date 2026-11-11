---
id: TCK-2591
title: "Pipeline : des indicateurs datés par le journal d'étapes, une portée « Moi / Agence », et l'étape suivante proposée par les événements"
status: done
phase: P1
family: back
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-11
depends_on: [TCK-2578, TCK-2579, TCK-2588]
blocks: [TCK-2592]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#25-reporting--tableaux-de-bord"
  models:
    - "docs/models-spec.md#7-customer"
tags: [back, crm, pipeline, reporting, audit-ux, app, adr]
---

## Objectif utilisateur

L'admin pilote sur des chiffres justes et filtrables par agent ; l'agent ne déplace plus ses cartes à la main : Takussan lui propose l'étape que les faits justifient, il confirme d'un geste (décision 11a).

## Contrat de données

**Re-mesuré sur `1bce3798a`** (`PipelineStatsService.php`) :
- `stage_changes_last_30d` lit bien `attribute_changes` (`:111-136`) — **le point 3 de TCK-617 est déjà corrigé** (P56.01) ;
- `conversion_rate` (`:212-238`) compte les fiches **actuellement** `converted`/`lost` dont `updated_at` a moins de 30 jours : toute retouche d'une vieille fiche gagnée gonfle le taux — **défaut confirmé** ;
- `avg_time_in_stage` est une moyenne (pas une médiane) ; le front n'en montre qu'une étape ;
- portée : `visibleTo($user)` + `status = active` (`:58-64`) ; ni « Moi », ni filtre de référent, d'étiquette ou de recherche ; `GET customers/pipeline-stats` ne prend aucun paramètre (`CustomerController.php:326-331`).

À créer (règles : [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md)) :
- `GET /api/customers/pipeline-stats` accepte `scope=mine|agency` (`mine` = `filter[referent]=me` de TCK-2588 ; `agency` exige `crm.view_all`) et les mêmes filtres que la liste (`referent`, `tags`, `search`, `follow_up`).
- `conversion_rate` = sorties **datées par le journal** : passages vers `converted` / (vers `converted` + vers `lost`) dans les 30 derniers jours, d'après `attribute_changes` ; `exits_last_30d = {converted, lost}` servi à côté.
- `median_days_in_stage` pour les six étapes (médiane des durées tirées du journal) ; `avg_time_in_stage` gardé pour compatibilité.
- `suggested_stage` sur `CustomerResource` (demandé par `fields[customers]`) : `{to, reason, at}` ou `null`, calculé d'après le dernier événement **postérieur** au dernier changement d'étape :
  - visite confirmée → `prospect` (depuis `lead`) ;
  - compte rendu `interested` → `qualified` (depuis `lead`/`prospect`, cf. TCK-2578) ;
  - candidature ou offre créée (TCK-2579) → `negotiating` (depuis une étape antérieure) ;
  - bail signé → `converted` (depuis toute étape vivante) ;
  - jamais vers `lost`, jamais en arrière ; une proposition écartée (« Plus tard ») ne revient pas pour le même événement.
- `POST /api/customers/{customer}/suggested-stage/dismiss` (`{reason_event}`) : écarte la proposition courante (journalisé).

## Contraintes strictes (métier)

- **Décisions d'architecture à respecter** : [ADR-0102](../../../adr/0102-une-reservation-porte-sa-nature.md).
- **Aucune étape ne change sans geste** : `suggested_stage` est une lecture ; le passage reste `PATCH …/pipeline-stage` (motif exigé pour `converted` et `lost`, note épinglée — inchangé).
- `scope=agency` : 403 sans `crm.view_all` ; `mine` par défaut pour un agent, `agency` pour l'admin (règle de la maquette retenue ; le front choisit, l'API applique).
- Les chiffres d'une portée ne lisent que les fiches de cette portée dans l'agence active.
- Le calcul des propositions tient en requêtes groupées sur la page (pas une requête par fiche).

## Delta à produire

- [ ] `PipelineStatsService` : portée et filtres, conversion sur sorties datées, médianes ; `PipelineStatsRequest`.
- [ ] `CustomerSuggestedStageQuery` + attribut `suggested_stage` ; route `suggested-stage/dismiss` (`DismissSuggestedStageRequest`, `CustomerPolicy::update`).
- [ ] Tests : `PipelineConversionRateTest` (**retouche d'une fiche gagnée il y a 60 j ne change pas le taux** ; sorties du mois comptées), `PipelineMedianDurationTest`, `PipelineStatsScopeTest` (`mine`, `agency` 403 sans capacité), `CustomerSuggestedStageTest` (quatre événements, jamais en arrière, écartée ne revient pas, nouvelle proposition après un nouvel événement), `SuggestedStageQueryCountTest`.

## Critères d'acceptation

- [ ] AC1 (rouge sur `1bce3798a`) — Une fiche passée en `converted` il y a 60 jours puis retouchée aujourd'hui (téléphone modifié) ne compte pas dans `conversion_rate` ; deux passages vers `converted` et un vers `lost` ce mois-ci donnent `0.6667` et `exits_last_30d = {converted: 2, lost: 1}`.
- [ ] AC2 — `median_days_in_stage` rend une valeur pour chacune des six étapes sur un jeu de journal connu.
- [ ] AC3 — `scope=mine` pour l'agent Sokhna Sène rend les compteurs de ses seules fiches (38 sur la donnée de la maquette, test sur un jeu construit) ; `scope=agency` par un agent sans `crm.view_all` : 403.
- [ ] AC4 — Après une visite confirmée de Mouhamed (étape `lead`), sa fiche porte `suggested_stage = {to: prospect, reason: visit_confirmed}` ; après `dismiss`, `null` ; après un compte rendu `interested`, `{to: qualified}`.
- [ ] AC5 — Une candidature saisie pour une fiche `qualified` propose `negotiating` ; une fiche `negotiating` dont une visite est confirmée ne se voit rien proposer.
- [ ] Ablations consignées (AC1, AC4).

## Hors périmètre

- L'écran du pipeline et le vocabulaire (TCK-2592).
- Le passage automatique sans confirmation (décision 11a : non).
- Le reste de TCK-617 (cloisonnement du tableau de bord, liens d'agenda, libellé de `calendar.feed_*`) : non touché.

## Notes d'implémentation

Implémenté le 2026-11-11 (agent back-commercial-2, branche `feat/audit-ux-app-lot-1`).

**Prémisses re-mesurées, et ce qui différait**

- `conversion_rate` lisait bien `updated_at` (AC1 rouge avant) ; `pipeline-stats` ne prenait aucun paramètre.
- **Une visite n'avait aucune date de confirmation** : ni `confirmed_at`, ni journal (`PropertyVisit` n'est pas
  `Auditable`) ; `updated_at` est écarté par ADR-0103 § 6. Migration `2026_11_11_130500_add_confirmed_at_to_property_visits`
  (reprise : visites `confirmed` ← `updated_at` ; aucune sur la base de démonstration, 935 terminées sans date) ;
  `PropertyVisit::performInsert/Update` la posent à chaque passage en `confirmed`, `withoutEvents()` compris.
- Le rôle système d'agent tient `crm.view_all` : « admin » et « agent » ne se distinguent pas par la capacité.

**Décisions**

- Sans `scope`, la portée d'avant (lecture de la fiche) : le front choisit « Moi » ou « Agence » selon le rôle
  (maquette) et l'API applique ; les tests d'avant restent verts sans retouche.
- `scope=mine` = `filter[referent]=me` (TCK-2588), appliqué par une requête NEUVE : un FormRequest validé porte ses
  paramètres dans sa source d'entrée, que spatie lit avant la query string — le filtre ajouté y était masqué dès qu'un
  autre filtre était passé (trouvé par le test). `filter[referent]` avec `scope=mine` : 422.
- `scope=agency` : `CustomerPolicy::viewAgencyPipeline` (`crm.view_all` dans l'agence active) dans
  `PipelineStatsRequest::authorize()`, avant la validation ; les ajouts de l'appelant hors agence n'y entrent pas.
- Les filtres de la liste par `Customer::buildQuery`, réduits à une sous-requête d'identifiants.
- Sorties : lignes du journal dont `attributes.pipeline_stage` ∈ {converted, lost} et différente de `old`, des
  30 derniers jours — une fiche CRÉÉE dans l'étape y entre (le test d'avant « 0.5 » reste vrai).
- `median_days_in_stage` : durées CLOSES (entrée → sortie), `null` sans durée ; une passe, moyenne et médiane.
- `suggested_stage` (`CustomerSuggestedStageQuery`, attribut calculé de `CustomerCommercialAttributes`) : le DERNIER
  fait postérieur au dernier changement d'étape, à la lettre (une visite récente masque une candidature antérieure) ;
  à égalité d'instant, le plus avancé. Visite (fiche ou compte, comme TCK-2593) confirmée et ni annulée ni manquée ;
  compte rendu `interested` (`reported_at`) ; candidature/offre ni refusée, ni annulée, ni expirée ; bail signé
  (`signed_at`, lecture seule des baux). Rien vers l'arrière, sur place, vers `lost`, ni depuis `converted`/`lost`.
- Écart : `POST customers/{customer}/suggested-stage/dismiss {reason_event}` → 204, journalisé sur la fiche
  (`event = suggested_stage_dismissed`, le fait en propriétés) ; 409 `customer.suggested_stage_stale` si la
  proposition a changé ; un fait NOUVEAU propose à nouveau. Libellé `admin.audit.events.suggested_stage_dismissed`.

**Reprise du 2026-11-11 (agent reprise-2591, après le plantage de la machine)** — le rapport de
back-commercial-2 est perdu avec `/private/tmp` ; ce qui suit est re-mesuré sur l'arbre.

- `depends_on` : TCK-2578 (`2b203b4bb`), TCK-2579 (`f34d5d998`) et TCK-2588 (`fba85c3f9`) sont commités sur la
  branche ; leur `status: todo` attend la bascule de la session.
- Migration `2026_11_11_130500` passée sur la base de démonstration (:5433, lot 10).
- Les noms de tests du Delta diffèrent : `PipelineStatsJournalTest` porte AC1 et AC2 (à la place de
  `PipelineConversionRateTest` et `PipelineMedianDurationTest`).
- **Deux corrections ajoutées à la reprise**, chacune par un test d'abord rouge :
  1. *Isolation* : la visite du COMPTE du client (`visitor_id`) n'était bornée par aucune agence — une visite
     confirmée chez une autre agence proposait `prospect` sur la fiche et en exposait l'heure. Elle ne compte
     désormais que sur un bien de l'agence de la fiche (`p.agency_id IS NOT DISTINCT FROM c.agency_id`) ; la
     visite portée par la fiche (`customer_id`) reste comptée telle quelle
     (`test_a_visit_of_the_account_at_another_agency_proposes_nothing`).
  2. *Fait fondateur* : les horodatages sont à la seconde, et une fiche créée puis son premier fait saisi dans la
     foulée (fiche puis candidature) peuvent la partager ; la comparaison stricte « postérieur » l'écartait. Un
     fait du même instant que la CRÉATION compte (l'étape de création est un défaut, pas une décision prise au vu
     du fait) ; du même instant qu'un changement d'étape à la main, non
     (`test_a_fact_born_with_the_fiche_counts_but_not_one_at_the_instant_of_a_stage_change`). Mesuré : le tunnel
     public (`findOrCreateFromUser`) ne crée que des séjours — candidature et offre sont réservées au personnel,
     qui fournit toujours `customer_id` (TCK-2579) ; le cas vient donc d'une saisie enchaînée, pas du tunnel.
     Limite : si la ligne de journal de création et `customers.created_at` tombent de part et d'autre d'une
     seconde, la création se lit comme un changement.
  Ces deux règles sont des **lectures** d'ADR-0103 § 5, qui ne borne pas la visite à l'agence (principe n° 2 le
  fait) et dit « postérieur » sans trancher l'instant de création : à confirmer par le porteur si besoin. Autre
  écart, hérité : l'ADR dit « le refus est tracé sur le fait » ; il l'est sur la fiche, le fait en propriétés.
- `property_visits` n'a pas de suppression douce : rien à filtrer de ce côté (baux et demandes filtrent `deleted_at`).
- Le balayage `DateInventoryByValueTest` ne voit pas `suggested_stage` : `CustomerCommercialAttributes::of()` ne
  rend rien sans la page préparée par `attach()`, comme pour `next_action` (TCK-2588).

**Mesures (reprise, load 2,6-4,1 sur 8 cœurs)**

- Tests du ticket : `CustomerSuggestedStageTest` (14), `PipelineStatsJournalTest` (4), `PipelineStatsScopeTest` (6),
  `SuggestedStageQueryCountTest` (1) → 25 verts ; avec les trois gardes d'architecture
  (`RessourceUniqueResolueTest`, `ExistsSurTableASuppressionDouceTest`, `AgencyIdIsIndexedTest`) : 33 verts, 210
  assertions, 10,3 s. `AuditTrail.test.tsx -t "TCK-2676"` : 5 verts. Pint propre.
- Gardes racine : rouges seulement sur les maquettes locales (`check-champs-uniformes`, `check-destructive-contrast`,
  `check-feedback-states`, `check-heritage-encre`, `check-status-badge-unique`) et sur TCK-2688
  (`check-design-sync-entry` : `panneau-droit.tsx`, `radio-group.tsx`).
- Coût en requêtes : 26 requêtes pour la liste, à 3 comme à 15 fiches ; calculé fiche par fiche, 42 puis 138
  (ablation 4).
- Ablations, une à une, au premier plan, fichier restauré par `cp` et md5 vérifié :
  1. borne des 30 jours retirée de `exitsLast30Days` → AC1 rouge (`exits_last_30d` ≠ `{2, 1}`) ;
  2. `dismissed` ignoré dans `forPage` → AC4 rouge (la proposition revient après « Plus tard ») ;
  3. `advances` : `$b > $a` → `$b !== $a` → `test_never_backwards…` rouge (un qualifié se voit proposer prospect) ;
  4. `suggested_stage` calculé fiche par fiche dans `attach` → `SuggestedStageQueryCountTest` rouge (138 ≠ 42) ;
  5. `authorize()` de `PipelineStatsRequest` ouvert → AC3 rouge (200 au lieu de 403) ; borne `customers.agency_id`
     de « Agence » retirée → `test_agency_counts_the_active_agency_only` rouge (9 ≠ 8) ;
  6. borne d'agence de la visite du compte retirée → `test_a_visit_of_the_account_at_another_agency…` rouge ;
  7. comparaison toujours stricte → `test_a_fact_born_with_the_fiche…` rouge (1ʳᵉ moitié) ; toujours large → même
     test rouge (2ᵉ moitié : l'offre du même instant qu'un passage à la main serait proposée).

**Reste**

- Non joués en local (règle de charge, à la CI de la PR) : `tests/Feature/Api/CustomerPipelineTest.php` et
  `tests/Feature/Crm/CustomerScopeTest.php` (les tests d'avant de `pipeline-stats`, dont `compute()` a changé de
  signature et `avg_time_in_stage` de calcul) ; les balayages `ImpersonationReadSweepTest`,
  `ValeursEnListeParcoursDesRoutesTest`, `DateInventoryByValueTest` (route neuve) ; les tests de visites
  (`PropertyVisit::performInsert/Update` pose `confirmed_at`).
- `/sync-specs` : `property_visits.confirmed_at` (models-spec § visites) ; `suggested_stage` sur la fiche client et
  l'événement `suggested_stage_dismissed` (models-spec § 7, features § 16) ; `scope`, `median_days_in_stage`,
  `exits_last_30d` et le taux de conversion daté par le journal (features § 25).
