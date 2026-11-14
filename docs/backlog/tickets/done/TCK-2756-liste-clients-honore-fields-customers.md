---
id: TCK-2756
title: "GET /api/customers n'honore pas fields[customers] : clés non demandées rendues à null, et des attributs calculés seuls servent la fiche entière"
status: done
phase: P2
family: back
estimate: S
wave: 89
created: 2026-11-12
updated: 2026-11-12
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
tags: [back, crm, clients, sparse-fieldsets, query-builder]
---

## Objectif utilisateur

Une lecture de la liste des clients ne reçoit que les champs qu'elle demande. Aujourd'hui, une clé
qu'elle n'a pas demandée arrive à `null`, ce qui se lit comme « ce client n'a pas d'e-mail ». Et une
lecture qui ne demande que des attributs calculés reçoit la fiche entière : notes, critères de
recherche et masque de la pièce, ce dernier recalculé sur chaque ligne.

## Contexte — mesuré le 2026-11-12 (démo, compte agent, GET seulement)

Constaté en passant par la vérification de TCK-2590, puis re-mesuré. Script :
`$S/impl/lot2/fields-customers/m.mjs` et `m2.mjs`, hors dépôt. Il n'imprime que des noms de clés et
des comptes de valeurs non nulles.

| Requête `GET /api/customers?per_page=20&…` | Clés rendues | Valeurs non nulles |
|---|---|---|
| `fields[customers]=id,first_name` | 19 | `id`, `first_name` seulement ; les 17 autres clés valent `null` |
| `fields[customers]=id` | 19 | même forme |
| `fields[customers]=next_action` | 29 | e-mail, téléphone, profession, étape, auteur… sur chaque ligne, plus `notes`, les sept critères de recherche, `id_number_masked` |
| sans `fields` | 28 | la ressource entière |

Le show (`GET /api/customers/{id}?fields[customers]=id,first_name`) rend 20 clés, sur le même motif.

**Deux causes distinctes :**

1. `CustomerResource::toArray()` écrit chaque colonne sans tester sa présence (`'email' => $this->email`).
   Une colonne que `fields[customers]` n'a pas sélectionnée sort donc à `null` au lieu d'être absente.
2. `CustomerCommercialAttributes::strip()` retire les attributs calculés (`next_action`, `follow_up`,
   `referent`, `suggested_stage`) de `fields[customers]` avant spatie. Quand il ne reste rien, il
   **supprime** `fields[customers]` (`unset($fields['customers'])`), et spatie retombe sur `select *`.

Il n'y a **pas de fuite d'autorisation** : les valeurs servies sont celles que le même lecteur reçoit
sans `fields`, et `visibleTo`, `litLaFiche` et `readsVisits` s'appliquent toujours. Le défaut est un
manquement au contrat des sparse fieldsets (`docs/spatie-query-builder.md`, CLAUDE.md racine). La
cause 2 a aussi un coût : déchiffrer `id_number` et relire les notes sur chaque ligne d'une page qui
ne les montre pas.

## Ce qui change

1. **Liste (`index`)** — des attributs calculés seuls ne déclenchent plus `select *`.
   `fields[customers]=next_action` sélectionne `id` (et ce que la ressource exige pour juger
   `litLaFiche` / `readsVisits`, sans le rendre) et ne rend que `id` + l'attribut demandé.
2. **Ressource** — sous `fields[customers]`, une colonne non sélectionnée est **absente** de la réponse
   (`whenHas`, ou un test équivalent sur les attributs chargés), pas rendue à `null`. Sans `fields`,
   la forme ne change pas.
3. **Show — à ne pas casser.** La fiche client du front (`fetchFicheDuClient`,
   `takussan-web/src/lib/queries/customers.ts`, TCK-2589) envoie au show
   `fields[customers]=next_action,follow_up,referent` **pour recevoir la ressource entière avec eux**.
   C'est l'exception documentée à la garde `show-sans-fields.garde.test.ts`. Deux voies possibles :
   - *a)* le show garde le comportement actuel de la cause 2 (attributs calculés seuls → ressource
     entière), et seul `index` change. **Recommandé** : c'est le plus petit delta, et la règle du dépôt
     veut déjà qu'un show ne soit pas éclairci ;
   - *b)* un paramètre distinct pour les attributs calculés (`append=`), et la fiche migre.
   Le ticket tranche avant d'implémenter.
4. Le front ne dépend pas de la clé `null` d'une colonne non demandée. Le vérifier :
   `DASHBOARD_CUSTOMER_FIELDS`, `PLANIFICATION_CUSTOMER_FIELDS`, `agent-crm.ts`, `visits.ts`,
   `leases.ts`, et le compte `fields[customers]=id` de `customers.ts`.

## Critères d'acceptation

- [ ] AC1 — `GET /api/customers?fields[customers]=id,first_name` : chaque ligne a exactement les clés
  `id`, `first_name`. Test API à `assertSame` des clés, et non à `assertJsonStructure`, qui accepte les
  clés en trop.
- [ ] AC2 — `GET /api/customers?fields[customers]=next_action` : chaque ligne a exactement `id` et
  `next_action`. Ni `notes`, ni `email`, ni `id_number_masked`, ni aucun critère. Ablation : remettre
  `unset($fields['customers'])` doit faire rougir le test.
- [ ] AC3 — Sans `fields`, la liste rend la même forme qu'avant (test de non-régression sur les clés).
- [ ] AC4 — Le show de la fiche (`fields[customers]=next_action,follow_up,referent` + les inclusions de
  `INCLUSIONS_DE_LA_FICHE`) rend toujours la ressource entière, avec les trois attributs. Le test
  API de TCK-2589 qui l'épingle reste vert, ou en voie *b)*, la fiche migrée et son test suivi.
- [ ] AC5 — Les règles de visibilité ne bougent pas : `last_contacted_at`, `follow_up`, `notes` et
  `id_number_masked` restent `null` ou absents hors personnel, comme aujourd'hui (tests de TCK-2583,
  TCK-2588, TCK-2591 et TCK-953 verts).

## Notes

- Mesure : `$S/impl/lot2/fields-customers/` (hors dépôt).
- Ne pas confondre avec la réserve de TCK-2590 (la sonde de doublon par préfixe), tranchée dans ce
  ticket-là.

## Notes d'implémentation

- 2026-11-12 — décision du porteur **a** : seule la liste change. `CustomerController::index` pose
  `CustomerResource::rendreLesSeulsChampsDemandes()` avant `Customer::buildQuery()` ; sous ce drapeau :
  - `CustomerCommercialAttributes::strip()` remplace l'`unset($fields['customers'])` par `id` + les colonnes
    demandées (des attributs calculés seuls lisent `select "customers"."id"`, plus `select *`) ; `id` est
    aussi ajouté quand il manque, les attributs se calculant sur la clé ;
  - `CustomerResource::toArray()` retire toute clé de `Customer::getOwnQueryFields()` absente de
    `getAttributes()`. Les clés calculées, masquées ou de relation gardent leur propre condition.
  Le show et les lecteurs imbriqués (bail, réservation) n'ont pas le drapeau : forme inchangée.
- Test : `tests/Feature/Crm/CustomerIndexSparseFieldsTest.php` (6 tests) — 4 rouges avant le correctif,
  verts après. Clés à `assertSame` triées ; AC2 épingle aussi les requêtes (ni `select *`, ni `id_number`,
  ni `notes`) ; AC3 et le show sous `fields=id,first_name` comparés à la forme relevée avant le correctif.
- Ablations : `unset` rétabli sous le drapeau → AC2 rouge ; filtre de la ressource retiré → 4 rouges.
- Non-régression : les 72 fichiers qui citent `/api/customers`, `CustomerResource`,
  `CustomerCommercialAttributes` ou `fields[customers]` (dont `CustomerListQueryCountTest`,
  `CustomerIndexQueryBudgetTest`, `RequetesDuFrontTest`), plus les autres tests marqués TCK-2583/2588/2589/
  2591/953 du CRM : 627 verts.
- Front : aucun lecteur de la liste ne lit une colonne qu'il n'a pas demandée (`DASHBOARD_CUSTOMER_FIELDS`,
  `PIPELINE_CARD_FIELDS`, `PLANIFICATION_CUSTOMER_FIELDS`, `useLeaseCustomerOptions`, `searchTaskables`,
  `SaisirUneDemande`, payeurs de `argent/sources.ts`) ; `occupation` et `notes` du panneau du pipeline
  viennent du show. `libelleDe` lit `email`/`phone` par `?.` et `??` : `undefined` vaut `null`.
- Suite possible, hors de ce ticket : la même règle pour le show et les lecteurs imbriqués (voie b).
- 2026-11-12 — vérification adverse :
  - **d1 (moyen, préexistant, colonne « Cherche » de TCK-2590)** : `readsCriteria` jugeait sur la fiche telle que la
    liste l'a lue ; `DASHBOARD_CUSTOMER_FIELDS` ne lit pas `agency_id`, et le personnel ne recevait jamais les critères.
    Jugée désormais sur `ficheJugeable()`, comme les visites et l'origine (`primeFiches` relit la page en une
    requête). Effet sur le show (décision a, toutes colonnes rendues) : sous `fields` sans critères, le personnel
    reçoit les sept clés de critères à `null`, comme toute colonne non lue ; elles manquaient par le refus de la règle.
    Test `tests/Feature/Crm/CustomerListCriteriaTest.php` (la requête du front : admin et agent reçoivent
    `budget_max`, `seeking_cities`, `seeking_contract_type` ; bailleur auteur d'une fiche d'agence : rien).
  - **suivi de TCK-2757** : la fiche relue pour la policy porte aussi `user_id` (`TRAITS_JUGES`), et le verdict mis
    en cache distingue le sujet (`.sujet`). Test `tests/Feature/Crm/CustomerResourceSujetTest.php`, par la ressource.
  - **d2 (mineur)** : sous `fields` strict, la clé étrangère de chaque include `belongsTo` demandé est lue (dérivée
    de la relation : `getForeignKeyName()`), sans être rendue — les colonnes rendues sont celles que `fields` demande
    (`CustomerResource::noterLesChampsDemandes`). Vaut aussi avec des colonnes explicites. Test d2 de
    `CustomerIndexSparseFieldsTest`.
  - Ablations, toutes rouges : critères jugés sur la ressource ; `user_id` retiré des traits relus ; `.sujet` retiré
    de la clé ; clés étrangères retirées de la lecture ; filtre par colonnes demandées retiré.
