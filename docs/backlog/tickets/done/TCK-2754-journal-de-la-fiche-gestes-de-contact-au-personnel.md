---
id: TCK-2754
title: "Le journal de la fiche client ne rend plus les gestes de contact au bailleur auteur, comme le fil"
status: done
phase: P1
family: back
estimate: S
wave: 90
created: 2026-11-12
updated: 2026-11-14
depends_on: [TCK-2589]
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
tags: [back, crm, privacy, decision, audit-ux]
---

## Objectif utilisateur

Le bailleur qui a ajouté une fiche client la relit sans apprendre qui l'agence a appelé, ni quand : ce que l'activité de l'agence dit du client reste au personnel de l'agence de la fiche, sur toutes les lectures de la fiche.

## Constat (mesuré le 2026-11-12, pendant TCK-2589)

- `docs/features.md` § 1.6 (ligne « Le CRM de l'agence n'est lu et alimenté que par son personnel… ») réserve au personnel de l'agence de la fiche, et au super-admin, le **dernier contact** et la **relance due**. Depuis TCK-2589, elle leur réserve aussi les **gestes de contact du fil**.
- La fiche respecte cette règle : `GET /api/customers/{id}?fields[customers]=id,last_contacted_at` ne rend pas `last_contacted_at` au bailleur auteur (`CustomerContactFactsStaffOnlyTest`).
- Le fil la respecte aussi : `GET /api/customers/{id}/timeline` ne rend les entrées `contact` qu'au personnel (`CustomerTimeline`, `$staff` = `CustomerPolicy::viewVisitReports`). C'est le point 1 du lot A de TCK-2589, tranché a) par team-lead le 2026-11-12.
- **Le journal, lui, ne la respecte pas.** Sonde du 2026-11-12, une fiche ajoutée par un bailleur, un appel enregistré par l'admin (`ContactGestureService::onCustomer`), relue par le bailleur auteur :
  - `GET /api/customers/{id}/activity` → 200, une entrée `event = "contacted"`, avec son `causer` (qui a appelé) et son `created_at` (quand) ;
  - la fiche, dans la même requête, n'a pas de `last_contacted_at`.
  Le journal donne donc au bailleur la date du dernier contact que la fiche lui cache. Il donne en plus le nom de l'agent qui a appelé.
- Où : `CustomerActivityFeed::paginate()` ne filtre sur `$withVisitReports` que l'écart de l'étape proposée (`CustomerSuggestedStageQuery::DISMISSED_EVENT`). Elle rend à tous les lecteurs les `contacted` du sujet `Customer`, et ceux des demandes rattachées (`PropertyContactLead`).

## Ce qui est à décider (porteur)

1. a) **Aligner le journal sur le fil** : les `contacted` (sujet client et demandes rattachées) sortent de la requête pour qui n'est pas du personnel de l'agence de la fiche, total compris. *Recommandé : c'est la règle de `features.md`, et la seule qui ne contredise pas `last_contacted_at`.*
   b) Ouvrir le fil au bailleur auteur comme le journal. Cela rouvre la question du `last_contacted_at` caché, et il faudrait alors réécrire la règle de `features.md`.

## Delta à produire (si a)

- [ ] `CustomerActivityFeed::paginate()` : hors personnel, exclure `event = contacted` sur le sujet `Customer`. Retirer aussi la branche `PropertyContactLead`, qui ne porte que des `contacted`. Le filtre se pose dans la requête, pas après la pagination : le total ne doit pas les compter.
- [ ] Test : le bailleur auteur ne lit aucun `contacted` (ni le sien, ni celui d'une demande rattachée), et `meta.total` ne les compte pas. Le personnel les lit toujours.
- [ ] Vérification par ablation : retirer le filtre doit faire rougir le test du bailleur.

## Critères d'acceptation

- [ ] AC1 — Le bailleur auteur relit `GET /api/customers/{id}/activity` après un appel de l'agence : aucune entrée `contacted`, et `meta.total` est celui d'un journal sans appel. Un bailleur qui verrait quand même l'heure de l'appel par une autre entrée (par exemple une mise à jour de la fiche horodatée au même instant) ne coche pas ce critère.
- [ ] AC2 — Le personnel de l'agence de la fiche lit toujours ces entrées, avec leur canal et leur auteur.

## Hors périmètre

- Le fil (`/timeline`) : déjà conforme (TCK-2589).
- Les autres entrées du journal (étapes, notes, tâches) : leur exposition n'est pas en cause ici.

## Notes d'implémentation

Décision a) (team-lead, 2026-11-12). `CustomerActivityFeed::paginate()` : hors personnel, le sujet `Customer` exclut `contacted` avec `DISMISSED_EVENT` (`orWhereNotIn`), et la branche `PropertyContactLead` n'est posée que pour le personnel. Le filtre est dans la requête, donc le total ne les compte pas.

Pas d'entrée « mise à jour » au même instant : `ContactGestureService::touchCustomer()` écrit `last_contacted_at` par la requête (`toBase()`), sans journal. Le test le vérifie aussi : aucune entrée du bailleur ne porte l'heure d'un geste.

Test : `tests/Feature/Crm/CustomerActivityContactStaffOnlyTest.php` (AC1, AC2). Ablations rouges : filtre de la fiche retiré, branche de la demande ouverte au bailleur, branche retirée au personnel, filtre appliqué au personnel.
