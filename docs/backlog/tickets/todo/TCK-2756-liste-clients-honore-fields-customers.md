---
id: TCK-2756
title: "GET /api/customers n'honore pas fields[customers] : clés non demandées rendues à null, et des attributs calculés seuls servent la fiche entière"
status: todo
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
