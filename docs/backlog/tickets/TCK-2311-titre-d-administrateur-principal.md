---
id: TCK-2311
title: "Titre d'administrateur principal : filigranes jugés par AgencyPolicy::configure, limite de transmission écrite dans ADR-0048, POST /api/agencies retirée"
status: done
phase: P1
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: [TCK-2166]
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  adr:
    - "docs/adr/0048-effet-d-une-suspension-d-agence.md#amendement-du-2026-10-25--le-titre-dadministrateur-principal-ne-se-transmet-par-aucun-geste"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-225--ce-que-lagence-attache-à-son-administrateur-principal-quand-ce-compte-part"
tags: [api, web, agency, authorization, capabilities, adr, routes, pistes]
---

## Contexte

Pistes : P225.04, P225.05, P225.06

Réf : **P225.04**, **P225.05** et **P225.06** du fichier de pistes, `validé`. Trois effets du titre
d'administrateur principal (`agencies.primary_admin_id`) :

- **P225.04** : `RegenerateWatermarksController` n'ouvrait le geste qu'au titulaire et au
  super-admin. C'était le seul geste d'agence sans seconde branche par capacité. Un
  co-administrateur prenait 403, même quand le titulaire était bloqué ou effacé. TCK-106, qui a
  créé la route, l'écrit « (admin agence) ».
- **P225.05** : le titre ne se transmet par aucune route, et `block()` ne le lit pas. Depuis
  TCK-2166 (P204.02), `ErasedAgencyAdmin` le passe déjà au plus ancien autre administrateur actif
  quand le titulaire efface son compte.
- **P225.06** : `POST /api/agencies` faisait de tout compte connecté l'administrateur principal
  d'une agence `standard`. Elle ne créait aucun `AgencyAdminProfile` et déclenchait les crédits de
  bienvenue (`SpaceCreated`), hors de la console et de la demande de passage professionnel
  (TCK-267). Le front ne l'appelle pas : `grep` vide dans `takussan-web/src`, et la création de la
  console passe par `/api/admin/agencies`.

Re-mesuré le 2026-10-25 sur `b4d905cd3` : les trois constats tiennent. Les tests neufs rougissent
avant correctif. Le co-administrateur qui tient `agency.update` prend 403 au lieu de 202.
`POST /api/agencies` rend 201, et la route est enregistrée.

## Décision du porteur

- P225.04 : validation du porteur (2026-10-25) : la régénération des filigranes est jugée par `AgencyPolicy::configure` (capacité `agency.update`), comme le logo, conforme à TCK-106 ; docblock du front corrigé
- P225.05 : validation du porteur (2026-10-25) : aucun geste neuf de transmission du titre ; la limite est écrite dans ADR-0048
- P225.06 : validation du porteur (2026-10-25) : `POST /api/agencies` retiré, les tests passent à la fabrique ou à `AgencyProvisioningService`, un test exige le 404

## Hypothèses

- **P225.06, 405 et non 404.** `GET api/agencies` (la liste) reste sur le même chemin. Une fois
  `POST` retirée, Laravel répond donc **405** (`http.method_not_allowed`), et non 404. Obtenir un
  404 demanderait :
  - soit de réenregistrer une route `POST` qui rend 404, et la route ne serait plus retirée ;
  - soit de changer le rendu global du 405.

  Le test exige donc le **405**, l'absence de toute agence créée, et l'absence de
  `POST api/agencies` dans la table des routes. Les précédents
  (`UnifiedPaymentRouteRemovedTest`, `DashboardStatsRouteRemovedTest`) acceptent 404 ou 405.
  L'écart a été signalé à la session.
- **P225.06, les tests de validation à la création.** Les cas qui éprouvaient
  `StoreAgencyRequest` à la création sont partis avec elle, faute d'équivalent :
  - l'unicité du numéro d'agrément ;
  - les bornes de champ ;
  - l'e-mail ;
  - la devise `currency.supported` ;
  - le statut ignoré (`CreationDAgenceSansStatutTest`) ;
  - la bienvenue au créateur (`WelcomeCreditOnAgencyStoreTest`).

  Leurs cas de modification restent. Les bornes de la console (`agency.name`, `agency.email`)
  remplacent celles de la création dans `BornesMaxFaceAuSchemaTest`. Les deux tests « agence
  neuve sans la clé `late_fee_online_collection` » passent à `AgencyProvisioningService`, la voie
  réelle. `AgencyTest` passe à la fabrique.
- **P225.04** : l'élargissement suit `configure` tel quel. L'agent qui tient `agency.update` reste
  refusé, et l'admin principal passe même si son rôle retire la capacité.

## Delta à produire

- [x] `RegenerateWatermarksController` : `can('configure', $agency)`.
- [x] Front : docblocks de `RegenerateWatermarksCard.tsx`, de `regenerateAgencyWatermarks`
      (`lib/queries/agencies.ts`) et du test de la carte. Aucun comportement ne change : la carte
      affichait déjà le refus du serveur.
- [x] ADR-0048 : amendement du 2026-10-25, et sa ligne de `docs/adr/README.md`.
- [x] Retrait de `POST api/agencies` (`agencies.store`), d'`AgencyController::store`, de
      `StoreAgencyRequest` et du code `agency.already_administered`, qui n'avait plus d'émetteur
      (`lang/{fr,en,wo}/errors.php`).
- [x] Tests : passage à la fabrique ou à `AgencyProvisioningService`, et
      `tests/Feature/Routes/CreationDAgenceRetireeTest.php`.
- [x] Documents : `docs/features.md` (§ 1.12, puis `features-by-actor.md` régénéré),
      `docs/qa/bailleur-proprietaire-qa.md`, les docblocks de `SpaceCreated` et
      d'`EditablePlatformSettings`.

## Critères d'acceptation

- [x] AC1 — Un co-administrateur du rôle système, qui n'est pas le titulaire, déclenche la
      régénération : 202, et le job est poussé.
- [x] AC2 — Un admin dont le rôle retire `agency.update`, et un agent qui la tient : 403, aucun job.
      L'admin principal sans la capacité : 202. Super-admin : 202.
- [x] AC3 — ADR-0048 écrit la limite : aucun geste de transmission, et `block()` qui ne lit pas le
      titre, voulu. Il note que P204.02 est fait.
- [x] AC4 — `POST /api/agencies` par un compte connecté : 405, aucune agence créée.
      `POST api/agencies` est absente de la table des routes. `GET api/agencies`,
      `GET`/`PATCH api/agencies/{agency}`, `POST api/agencies/{agency}/members` et
      `POST api/admin/agencies` restent.
- [x] AC5 — Plus aucun test n'appelle `POST /api/agencies`, hors le test du retrait.

## Hors périmètre

- `StoreAgencyOnboardingRequest` (console) valide `agency.currency` contre tout l'enum `Currency`,
  et non contre `currency.supported` comme le faisait `StoreAgencyRequest`. C'est relevé, et non
  corrigé ici.
- Un geste de transmission par la console, et un avertissement de `block()` sur un titulaire :
  écartés par la décision (ADR-0048, amendement du 2026-10-25).

## Notes d'implémentation

- Ablations, chaque fois sur le seul correctif visé :
  - `RegenerateWatermarksController.php` remis à `pre-dev` → AC1 rouge (403 au lieu de 202), les
    autres verts ;
  - route, `store` et `StoreAgencyRequest` remis à `pre-dev` → les deux tests de
    `CreationDAgenceRetireeTest` rouges (201 au lieu de 405, route présente).

  Tout est vert une fois remis.
- `assertJsonPath('code', 'http.method_not_allowed')` : c'est le code que rend
  `HttpErrorCode` pour un 405.
