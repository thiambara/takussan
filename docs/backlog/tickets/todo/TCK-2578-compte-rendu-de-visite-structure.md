---
id: TCK-2578
title: "Compte rendu de visite structuré : verdict, objections, note et suite, écrits dans la fiche client"
status: todo
phase: P0
family: back
estimate: M
wave: 89
created: 2026-11-10
updated: 2026-11-10
depends_on: []
blocks: [TCK-2581, TCK-2583, TCK-2587, TCK-2588, TCK-2591, TCK-2596]
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
    - "docs/models-spec.md#33-customernote-"
    - "docs/models-spec.md#nouveaux-enums"
tags: [back, visits, crm, audit-ux, app, p0]
---

## Objectif utilisateur

L'agent qui sort d'une visite enregistre en trente secondes ce que le client a dit — intéressé, à réfléchir ou pas intéressé, ce qui a pesé, un mot — et ce compte rendu rejoint la fiche du client, avec l'étape que Takussan lui propose.

## Contrat de données

**Aujourd'hui (re-mesuré sur `1bce3798a`)** : la seule trace d'après-visite est l'« avis » `POST property-visits/{visit}/feedback` (`PropertyVisitController.php:439-501`) — `rating` 0-5 et `comment`, rangés dans `metadata.feedback_{role}`, ouverts 24 h après `completed_at` (`config/visits.php:14`). **Aucun champ** de verdict ni d'objection n'existe ; rien n'est écrit dans la fiche client ; rien ne propose d'étape.

À créer :

- Migration `add_report_to_property_visits` : `report_outcome` (string(16), `VisitReportOutcome` : `interested`, `thinking`, `not_interested`, nullable), `report_objections` (jsonb, liste fermée `VisitObjection` : `price`, `neighborhood`, `size`, `condition`, `availability`, `guarantor`), `report_note` (text, nullable, 2 000 car.), `report_follow_up` (string(24), `VisitFollowUp` : `invite_apply`, `invite_offer`, `record_booking`, `second_visit`, `propose_properties`, `remind`, `create_lease`, nullable), `reported_at` (timestamp), `reported_by_id` (FK users, `nullOnDelete`). `down()` réversible.
- `POST /api/property-visits/{visit}/report` → `PropertyVisitController::report`, `StorePropertyVisitReportRequest` (`outcome` requis, `objections[]` facultatif, `note` facultatif, `follow_up` facultatif). Même route en `PATCH` pour modifier un compte rendu existant (« Modifier » de la maquette).
- `PropertyVisitResource` : bloc `report` (`outcome`, `objections`, `note`, `follow_up`, `reported_at`, `reported_by`), lu par le seul personnel ; jamais servi au visiteur.
- Réponse de `report` : la visite, plus `suggested_stage` (`{from, to}` ou `null`) calculée par la règle de [ADR-0101](../../../adr/0101-le-fil-commercial-vit-dans-la-fiche-client.md) « Le fil commercial vit dans la fiche client » : `interested` sur une fiche à `lead` ou `prospect` → `qualified` ; sinon `null`. Aucune écriture d'étape.
- Filtre `filter[to_close]=1` sur `GET property-visits` : visites `confirmed` dont l'heure est passée, **et** visites `completed` sans `reported_at` depuis au plus `config('visits.report_pending_days', 7)` jours (« À clore » des maquettes).

## Contraintes strictes (métier)

- **Interne à l'agence.** Le compte rendu se lit et s'écrit par le personnel de l'agence du bien (policy `PropertyVisitPolicy::report` : `managesProperty()` — même règle que `StorePropertyVisitRequest.php:78-87`). Ni le visiteur, ni le client, ni le bailleur hors personnel ne le lisent : un test l'affirme sur la ressource **et** sur le flux d'activité du client.
- **L'avis du client reste.** `POST …/feedback` (rôle `customer` et rôle `agent`), sa fenêtre de 24 h et la recopie dans `feedback`/`rating` ne changent pas. Le compte rendu n'a **pas** de fenêtre.
- **Un geste pour clore** : sur une visite `confirmed` dont l'heure est passée, `report` la passe d'abord à `completed` comme le ferait `complete` (mêmes effets : `completed_at`, événements, rappels annulés), dans la même transaction ; sur `scheduled`, `cancelled`, `no_show` ou une visite à venir : 409 `visit.report_not_closable`.
- **La fiche client reçoit le compte rendu** quand la visite a un `customer_id` : une `CustomerNote` épinglée, `kind = visit_report`, signée de l'auteur, qui cite la visite ; une modification réécrit **cette** note, n'en crée pas une seconde. Sans fiche (visiteur anonyme) : rien n'est créé côté CRM, et la réponse le dit (`customer_note: null`).
- `follow_up` ne déclenche rien côté serveur : il trace le choix de l'agent (le geste lui-même — WhatsApp, tâche, saisie — est fait par le front avec les routes existantes).
- Codes d'erreur seulement ; libellés côté front. `Rule::enum` pour les trois énumérations.

## Delta à produire

- [ ] Migration `add_report_to_property_visits` + enums `VisitReportOutcome`, `VisitObjection`, `VisitFollowUp`.
- [ ] `CustomerNote.kind` accepte `visit_report` (aujourd'hui : `conversion`, `loss`, `CustomerNote.php:18-23`).
- [ ] Route `property-visits/{visit}/report` (POST + PATCH), `StorePropertyVisitReportRequest`, `PropertyVisitPolicy::report`, `PropertyVisitController::report` (service `App\Services\Visit\VisitReportService`).
- [ ] `PropertyVisitResource` : bloc `report` réservé au personnel.
- [ ] Filtre `to_close` sur `PropertyVisit` ; clé `visits.report_pending_days` dans `config/visits.php`.
- [ ] `CustomerActivityFeed` : le compte rendu paraît dans le fil du client (une entrée, verdict + objections).
- [ ] Tests : `PropertyVisitReportTest` (création, modification sans doublon de note, clôture en un geste depuis `confirmed` passée, 409 sur visite à venir, 403 pour le visiteur, le bailleur hors personnel et un agent d'une autre agence, `suggested_stage` dans les trois cas), `PropertyVisitToCloseFilterTest`, `VisitReportPrivacyTest` (absent de la ressource lue par le visiteur et du flux client).

## Critères d'acceptation

- [ ] AC1 — Un agent de l'agence poste `{outcome: interested, objections: [price, size], note: "…"}` sur une visite `completed` d'un client à l'étape `prospect` : 201, `report.outcome = interested`, `suggested_stage = {from: prospect, to: qualified}`, **et l'étape du client est toujours `prospect`** (relu en base).
- [ ] AC2 — Le même compte rendu modifié par `PATCH` laisse **exactement une** note `visit_report` épinglée sur la fiche (compte en base avant / après : 1 / 1).
- [ ] AC3 — Sur une visite `confirmed` prévue il y a 2 h, `report` rend la visite `completed` avec `completed_at` posé ; sur une visite prévue dans 2 h, 409 `visit.report_not_closable` et rien n'a changé.
- [ ] AC4 — Le visiteur connecté qui lit sa visite (`GET property-visits/{id}`) ne reçoit **aucune** clé `report` ; un agent d'une autre agence reçoit 403 sur `report`.
- [ ] AC5 — `filter[to_close]=1` rend la visite confirmée passée et la visite terminée hier sans compte rendu, mais **ni** la visite terminée il y a 10 jours **ni** celle qui a son compte rendu.
- [ ] AC6 — L'avis client (`feedback`, rôle `customer`) reste accepté dans les 24 h et refusé après, compte rendu posé ou non.
- [ ] Ablations consignées : retirer l'écriture de la note fait rougir AC2 ; retirer la garde de rôle fait rougir AC4.

## Hors périmètre

- L'écran (TCK-2581) et la carte « À clore » (TCK-2587).
- Tout passage d'étape automatique : la proposition est rendue, l'agent confirme (décision 11a). Les autres événements qui proposent une étape (visite confirmée, candidature, bail) sont dans TCK-2591.
- La note dictée (micro) : le front saisit du texte.
- Un objet « affaire » par couple client × bien (approche B du fil, non retenue).

## Notes d'implémentation

_(à remplir par implementing-specs)_
