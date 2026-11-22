---
id: TCK-2588
title: "Clients : prochaine action, relance due, filtre par référent, tri utile et doublon sondé pendant la saisie"
status: done
phase: P1
family: back
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-11
depends_on: [TCK-2578, TCK-2583]
blocks: [TCK-2589, TCK-2590, TCK-2591, TCK-2592, TCK-2596]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
    - "docs/models-spec.md#9-usercustomerrelationship"
    - "docs/models-spec.md#30-setting-"
tags: [back, crm, customers, audit-ux, app, adr]
---

## Objectif utilisateur

Quand un client appelle, l'agent sait en dix secondes ce qui est prévu avec lui ; chaque matin, il sait qui relancer ; l'admin isole les clients d'un agent ou ceux qui n'ont pas de référent.

## Contrat de données

**Re-mesuré sur `1bce3798a`** : `GET /api/customers` filtre `user_id, agency_id, added_by_id, status, pipeline_stage`, `tags`, `tags_all`, `search` (`Customer.php:111-176`) ; trie `id, created_at, updated_at, status, first_name, last_name` ; **aucun** filtre de référent (le référent est la relation `agent_client` `is_primary`, `UserCustomerRelationship`) ; **aucun** attribut de prochaine action ni de dernier contact ; `visits` n'est pas incluable (`:316`) ; `per_page` est honoré jusqu'à 100 (`HasQueryBuilder.php:68-77` — c'est le front qui le fige à 20). Le doublon se découvre à l'envoi seulement (409).

À créer (règle « à relancer » : [ADR-0103](../../../adr/0103-le-pilotage-commercial-se-derive-des-gestes-et-des-faits.md)) :
- Attributs calculés (sous-requêtes groupées, jamais une requête par ligne), demandés par `fields[customers]` :
  - `next_action` : la plus proche, parmi une visite `scheduled`/`confirmed` à venir et une tâche ouverte à échéance, de ce client — `{type: visit|task, id, at, label, overdue}` ;
  - `last_contacted_at` (colonne de TCK-2583) ;
  - `follow_up` : `{reason, since, days}` ou `null` — raison `overdue_task` (tâche ouverte échue), `report_missing` (visite terminée sans compte rendu, TCK-2578), `no_contact` (étape vivante — `lead` à `negotiating` — sans contact depuis 7 jours, seuil `crm.follow_up_days`), la plus ancienne l'emporte ;
  - `referent` : `{id, name}` (relation `agent_client` principale).
- Filtres : `filter[referent]=me|none|{user_id}` ; `filter[follow_up]=1` ; `filter[stage_group]=active` (étapes vivantes).
- Tris : `next_action_at`, `last_contacted_at`, `follow_up_days` (retard décroissant).
- Include `upcomingVisits` (visites à venir, 3 au plus) et compte `visits`.
- `GET /api/customers/duplicates?phone=&email=` (`ProbeCustomerDuplicateRequest`, personnel de l'agence active) : les fiches de l'agence de même téléphone normalisé ou même e-mail replié, `{id, name, stage}` (5 au plus), sans autre donnée.

## Contraintes strictes (métier)

- Lecture du CRM inchangée : le personnel lit les fiches de son agence, le bailleur les fiches qu'il a ajoutées (TCK-591) ; les attributs calculés ne révèlent rien de plus (une tâche d'un collègue compte dans `next_action` si la fiche est lisible, son titre n'est servi que si la tâche l'est aussi).
- La sonde de doublon : 403 pour qui ne peut pas créer de fiche (bailleur, TCK-591 §9) ; limitée par `throttle` (20/min) ; ne cherche que dans l'agence active ; aucune pièce ni adresse rendue.
- `filter[referent]=me` vaut pour l'utilisateur dans l'agence active (principe n°2).
- `crm.follow_up_days` se range au catalogue des réglages métier (ADR-0065), défaut 7.
- Codes d'erreur seulement ; `Customer::$queryFields` étendu.

## Delta à produire

- [ ] `CustomerNextActionQuery`, `CustomerFollowUpQuery` (sous-requêtes sur la page) ; `CustomerResource` ; `fields[customers]` acceptant les nouveaux attributs.
- [ ] Filtres `referent`, `follow_up`, `stage_group` ; tris `next_action_at`, `last_contacted_at`, `follow_up_days`.
- [ ] Include `upcomingVisits`, compte `visits`.
- [ ] Route `customers/duplicates` (avant `customers/{customer}`), `ProbeCustomerDuplicateRequest`, réutilise `CustomerDuplicateDetector`.
- [ ] Réglage `crm.follow_up_days` au catalogue.
- [ ] Tests : `CustomerNextActionTest` (visite avant tâche, tâche en retard → `overdue`), `CustomerFollowUpTest` (trois raisons, la plus ancienne, seuil réglable, `converted`/`lost` jamais), `CustomerReferentFilterTest` (`me`, `none`, autre agence), `CustomerListQueryCountTest` (20 fiches = nombre de requêtes constant), `CustomerDuplicateProbeTest` (403 bailleur, agence isolée, champs rendus).

## Critères d'acceptation

- [ ] AC1 — Mariama Fall, visite confirmée jeudi 10:00 et tâche « Relancer » vendredi : `next_action = {type: visit, at: jeu. 10:00}`.
- [ ] AC2 — Yacine Diouf, étape `negotiating`, dernier contact il y a 9 jours, aucune tâche : `follow_up = {reason: no_contact, days: 9}` ; même fiche à l'étape `lost` : `follow_up = null`.
- [ ] AC3 — `filter[follow_up]=1&sort=-follow_up_days&filter[referent]=me` rend les relances de l'agent, la plus en retard d'abord.
- [ ] AC4 — `GET /api/customers?per_page=20&fields[customers]=id,first_name,next_action,follow_up` coûte le même nombre de requêtes pour 2 et pour 20 fiches.
- [ ] AC5 — `GET /api/customers/duplicates?phone=+221706482056` rend Mariama Fall pour un agent de son agence, `[]` pour un agent d'une autre agence, 403 pour un bailleur.
- [ ] Ablations consignées (AC2, AC4).

## Hors périmètre

- Les écrans (TCK-2589 fiche, TCK-2590 liste et création, TCK-2592 pipeline).
- Le rapprochement « 2 nouveaux biens pour Mariama » (ambition de l'audit) : le récapitulatif quotidien existe déjà ; son affichage en ligne n'est pas retenu ici.

## Notes d'implémentation

**Re-mesures avant code.** `GET /api/customers` honore `per_page` jusqu'à 100 (AC4 tenable sur 20) ;
`last_contacted_at` n'a qu'un écrivain dans `app/`, `ContactGestureService` (TCK-2583 ; la colonne reste dans `$fillable`, aucune FormRequest ne la valide) ; `PropertyVisit::scopeToClose`
(ADR-0101 § 6) existe et sert telle quelle de définition du compte rendu manquant ; le catalogue n'avait
pas de catégorie `crm` ; le tri `last_contacted_at` existait déjà (f08c30c99, TCK-2583) : non retouché.

**Forme.** Trois services, UNE définition SQL chacun, lue par l'attribut, le filtre et le tri :
`App\Services\Crm\CustomerFollowUpQuery` (`sinceSql()`), `CustomerNextActionQuery` (`atSql()`), et
`CustomerCommercialAttributes`, qui retire `next_action`, `follow_up`, `referent` de `fields[customers]`
avant spatie (ce ne sont pas des colonnes), les note sur la requête, puis les calcule pour la page entière
(`attach()`, index ET show). L'instant est celui de PHP, lié en paramètre, jamais `NOW()` (`travelTo`).
Coût mesuré : relance 1 requête, prochaine action 3, référent 1 — constant de 2 à 20 fiches (AC4).

**Choix tranchés.**
- Référent = relation `agent_client`, `is_primary`, `active`. Le portefeuille, lui, ne filtre pas sur le type : non touché.
- `filter[referent]=me` vaut dans l'agence ACTIVE du personnel ; un lecteur ni personnel ni super-admin reçoit `1=0`. Valeur : `me|none|<id>`, sinon 422.
- Fiche jamais contactée : le compte part de `created_at`. `days` = jours pleins depuis `since`.
- `report_missing` réemploie `scopeToClose` (`COALESCE(completed_at, scheduled_at)`) et ne vaut que pour le personnel de l'agence de la fiche (et le super-admin) : les comptes rendus sont du personnel (ADR-0101) ; le bailleur auteur d'une fiche ne la voit pas.
- Seuil : réglage `crm.follow_up_days` de l'agence active du lecteur (`ScopedSetting`), sinon catalogue (défaut 7, borné 1–90). Catégorie `crm` ajoutée au catalogue ET au front (`platform-settings.tsx`, `super-admin.ts`, trois clés i18n).
- Libellé d'une tâche : à son auteur, son assigné ou au super-admin seulement — règle plus étroite que `TaskPolicy::view` (qui admet le remplaçant), jugée sans requête par ligne. Une tâche d'un collègue COMPTE mais son titre est `null`. Titre du bien d'une visite : au personnel de l'agence de la fiche. Lecteur non personnel : libellés `null`.
- Sonde `GET /api/customers/duplicates` : `authorize()` délègue à `can('create', Customer)` (403 bailleur avant 422), cherche dans la seule agence de personnel active par `CustomerDuplicateDetector`, rend `{id, name, stage}` masqués comme le nom — jamais pièce ni adresse. `throttle:20,1` en ligne (pas de limiteur nommé : `AppServiceProvider` non touché). Le 409 `existing` de la création porte désormais aussi `stage`.
- `upcoming_visits` (3 par fiche) et `visits_count` par `include=`.

**Ablations** (md5 restaurés, script `ablation-2588.py`) : 22 rouges sans correctif — étapes vivantes, seuil,
seuil par agence, la plus ancienne, compte rendu réservé au personnel, filtre, tri retard, groupe d'étapes,
visite à venir, visite avant tâche, titre de tâche d'un collègue, tri prochaine action, champs calculés
retirés, trois par fiche, AC4 sur chacun des trois attributs (prochaine action calculée par ligne, relance calculée par ligne, référent chargé paresseusement : le compte de requêtes diverge à chaque fois), référent actif, `me` limité à
l'agence active (après renforcement du test), sonde bailleur, étape masquée, throttle de la sonde (retiré sous le verrou des routes → le 429 tombe). Une NON informative : un
`TaskPolicy::view` par ligne n'ajoute aucune requête dans cette fixture (reste vert).

**Hors de ce ticket, constaté le 2026-11-11** : `ImpersonationReadSweepTest::chaque_parametre…` rougit sur
le paramètre `threshold_alert` de `api/threshold-alerts/{threshold_alert}` (commit 925795e29, TCK-2627),
absent de `PARAMETRES_NON_REMPLIS` — pas sur les routes de ce ticket.
