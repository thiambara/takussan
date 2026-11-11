---
id: TCK-2716
title: "« Créer sa fiche » depuis une visite rattache la visite à la fiche créée"
status: todo
phase: P1
family: full
estimate: M
wave: 89
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2581]
blocks: []
spec_refs:
  features:
    - "docs/features.md#13-réservations-courte-durée--visites"
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#17-propertyvisit-"
    - "docs/models-spec.md#7-customer"
tags: [full, visites, crm, fiche-client, suivi-lot-1, decision-porteur]
---

## Objectif utilisateur

L'agent qui, après une visite d'un visiteur sans fiche, touche « Créer sa fiche » retrouve ensuite cette visite dans la
fiche du client (et la visite le désigne), sans avoir à la rattacher à la main.

## Contexte

Relevé de terrain-5 sur TCK-2581 (2026-11-11) : « Créer sa fiche » mène à `/app/customers/new?visite=<id>`, qui relit la
visite au serveur et préremplit le formulaire ; mais `POST /api/customers` ne connaît pas la visite, et
`UpdatePropertyVisitRequest` n'accepte pas `customer_id`. La fiche naît, **la visite reste à `customer_id = null`** : elle
reste « anonyme » dans les listes, `visits_on_property` (TCK-2585) ne relie pas les deux, et la fiche n'a aucune visite.

Second relevé, qui gouverne la règle de ce ticket : la contre-vérification de TCK-2581 a montré qu'un compte à double
casquette (personnel de l'agence B, bailleur d'un bien de l'agence A) pouvait préremplir puis enregistrer le prospect
anonyme de A dans le CRM de B. Le front l'a fermé (8a556c9dd) en ne préremplissant que depuis `visitor_display`, que
l'API ne sert qu'à la console du bien — **le préremplissage repose donc aujourd'hui sur un champ d'affichage**, et
TCK-2717 veut servir ce champ au bailleur. La règle « qui peut faire une fiche de cette visite » doit vivre dans l'API.

## Décision

**Décidé par le porteur le 2026-11-11 : (a), la recommandation (« je valide tes recommandations sur les dix points »).**

- **a) (recommandé)** `POST /api/customers` accepte la visite d'origine et la rattache dans la même transaction ;
  l'API dit par un booléen de la visite si le lecteur peut en faire une fiche, et le front ne préremplit que sur ce
  booléen.
- b) statu quo : la fiche et la visite restent déliées ; l'agent rattache à la main (aucun geste n'existe aujourd'hui).

## Contrat de données

- `POST /api/customers` (`StoreCustomerRequest`) : champ facultatif `property_visit_id` (entier). Présent, la visite est
  rattachée à la fiche créée (`property_visits.customer_id`) dans la transaction de création, sous verrou de la ligne de
  la visite.
- `PropertyVisitResource`, bloc `abilities` (lecture de détail seulement, comme `manage` et `feedback_customer`) :
  `create_customer` (booléen) — vrai exactement quand l'appel ci-dessus réussirait pour ce lecteur. « Créer sa fiche » est
  offert dans `VisitDetail` → `SuiteDeLaVisite` → `EtMaintenant`, sur la lecture de détail (celle qui porte déjà
  `abilities.feedback_customer`) ; `/app/customers/new?visite=<id>` relit aussi le détail.
- Erreurs : `422 visit.customer_already_linked` (la visite a déjà une fiche), `403 visit.staff_only` (le lecteur n'est
  pas du personnel actif de l'agence **du bien de la visite**), `422 visit.agency_mismatch` (la fiche naîtrait dans une
  autre agence que celle du bien : `staffAgencyId()` du créateur ≠ agence du bien).

## Direction UX / Artistique

Aucun écran neuf. Le formulaire préremplit comme aujourd'hui ; après l'enregistrement, la visite apparaît dans la fiche
et « Créer sa fiche » ne s'offre plus sur cette visite.

## Contraintes strictes (métier)

- **La règle est celle de l'agence du bien, jamais du profil actif seul** : le personnel actif de l'agence du bien, dont
  la fiche naît dans cette même agence. Le bailleur d'un bien d'agence, le visiteur, le client, et le compte à double
  casquette (personnel de B pour un bien de A) ont `create_customer = false` et prennent 403/422 au `POST`.
- Le super-admin hors agence (`staffAgencyId() === null`) ne rattache pas : la fiche n'aurait pas d'agence.
- Une visite déjà rattachée n'est jamais réécrite (pas d'écrasement d'une fiche par une autre).
- Le doublon : le `409 customer.duplicate` d'aujourd'hui reste rendu **avant** tout rattachement ; `allow_duplicate=true`
  crée et rattache.
- `visitor_name`/`visitor_phone`/`visitor_email` de la visite ne sont pas réécrits par le rattachement.
- Le front ne lit plus `visitor_display` comme preuve du droit : il préremplit sur `abilities.create_customer`.

## Delta à produire

- [ ] `StoreCustomerRequest` : `property_visit_id` `sometimes|integer` + existence (règle de suppression douce si la
      table l'exige — garde `ExistsSurTableASuppressionDouceTest`).
- [ ] `CustomerController::store` : rattachement dans la transaction existante (verrou de la visite, contrôle
      « sans fiche », contrôle de l'agence du bien) ; la création échoue entière si le rattachement est refusé.
- [ ] Un prédicat unique (ex. `PropertyVisitPolicy::createCustomerFrom`) lu par le contrôleur **et** par
      `PropertyVisitResource::abilities.create_customer`.
- [ ] Codes `visit.customer_already_linked`, `visit.agency_mismatch` dans `lang/{fr,en,wo}` (wo = français).
- [ ] Front : `/app/customers/new?visite=<id>` envoie `property_visit_id` avec la fiche ; le préremplissage ne s'allume que
      si `abilities.create_customer` est vrai ; « Créer sa fiche » ne s'offre que sous ce même booléen.
- [ ] Tests API : `CreateCustomerFromVisitTest` ; front : le test de préremplissage de TCK-2581 étendu.

## Critères d'acceptation

- [ ] AC1 — L'agent A1 de l'agence A crée une fiche avec `property_visit_id` = la visite anonyme V d'un bien de A : 201,
      et `GET /api/property-visits/V` rend `customer_id` = la fiche ; la fiche liste V parmi ses visites.
- [ ] AC2 — Le compte à double casquette (personnel de B, bailleur du bien de V dans A) : `abilities.create_customer =
      false` sur V, et `POST /api/customers {…, property_visit_id: V}` sous son profil de B est refusé ; **aucune fiche
      n'est créée dans B** (compte des fiches de B inchangé) et V garde `customer_id = null`.
- [ ] AC3 — V déjà rattachée à une fiche F : `create_customer = false` ; le `POST` rend `422
      visit.customer_already_linked`, aucune fiche neuve, V garde F.
- [ ] AC4 — Doublon : une fiche de A a le même téléphone ; sans `allow_duplicate` → 409 `customer.duplicate`, V non
      rattachée ; avec `allow_duplicate=true` → 201 et V rattachée à la nouvelle fiche.
- [ ] AC5 — Front : sur une visite dont `abilities.create_customer` est faux **mais** `visitor_display` non nul (cas que
      TCK-2717 rendra réel pour le bailleur), le formulaire `/app/customers/new?visite=<id>` reste vide.
- [ ] AC6 — Deux créations simultanées depuis la même visite : une seule rattache, l'autre rend
      `422 visit.customer_already_linked` (verrou de la visite).

## Hors périmètre

- Le rattachement d'une visite à une **fiche existante** (le « ouvrir sa fiche » du 409) : un autre geste, à décider.
- Le rattachement des autres visites du même visiteur (même téléphone) : seule la visite d'origine.
- La conversion d'une demande de contact en visite (TCK-2582), qui a sa propre voie (`contact_lead_id`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
