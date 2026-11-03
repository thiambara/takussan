---
id: TCK-2350
title: "La fiche née d'une candidature naît dans l'agence du bien, et n'est reprise ou rattachée que dans cette agence"
status: done
phase: P2
family: bug
estimate: M
wave: null
created: 2026-10-25
updated: 2026-10-25
depends_on: []
blocks: [TCK-2351, TCK-2352]
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
    - "docs/models-spec.md#règle-1--user--customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-15--parcours-dune-agence-neuve"
  adr:
    - "docs/adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md"
tags: [api, crm, customers, bookings, baux, autorisation, pistes]
---

## Objectif

La fiche client que crée une candidature, une offre d'achat ou une réservation sur un bien d'agence
est une fiche de **l'agence du bien** : son personnel la voit, et en tire un bail.

## Contexte

Réf : **P15.01** du fichier de pistes, `validé` (critères V7 et V3 accordés). Premier des deux
tickets que la décision demande ; le second est TCK-2351.

`CustomerService::findOrCreateFromUser()` créait la fiche dans l'agence **du visiteur**
(`$user->agency_id`), `null` pour un candidat sans profil d'agence, avec `added_by_id` = le candidat.
`Customer::scopeVisibleTo()` et `CustomerPolicy::view` la cachaient donc au personnel de l'agence du
bien : le sélecteur de locataire ne la proposait pas, et `LeaseService::create` rendait 403. La fiche
reprise était `Customer::where('user_id')->first()`, quelle que soit son agence. Trois appelants :
`PublicPropertyController::bookingRequest` (candidature et offre d'achat) et `BookingService::create`
(réservation par `POST /api/bookings`, hors personnel).

## Décision du porteur

validé — validation du porteur (2026-10-25) : en deux tickets : la fiche née d'une candidature naît dans l'agence du bien, rattachée seulement sur une coordonnée vérifiée (patron de TCK-1710), `first()` borné à cette agence ; un geste « inviter le locataire à créer son compte » (lien à usage unique, `linkUser()` à l'acceptation)

Consigne de la session : aucune fiche existante ne change d'agence, et aucun `user_id` n'est posé en
silence. La règle vaut pour les fiches neuves.

## Delta à produire

- [x] `CustomerService::findOrCreateFromUser(User, ?Property)` : sur un bien d'agence, la fiche du
  compte est relue dans cette agence seule, la fiche orpheline de cette agence se rattache sur un
  téléphone ou un e-mail **vérifié** (règle de TCK-1710, inchangée), sinon la fiche naît dans cette
  agence. Le verrou consultatif de création porte sur cette agence.
- [x] Les trois appelants passent le bien.
- [x] `ContactDeLAgenceDuBienTest` : son témoin « la fiche du tunnel n'est pas davantage refusée »
  décrivait le défaut ; il devient « la fiche du tunnel naît dans l'agence du bien et le personnel
  la prend ».
- [x] ADR-0031, amendement du 2026-10-25 (P15.01), et sa ligne de `docs/adr/README.md`.
- [x] `docs/models-spec.md` Règle 1.
- [x] `FicheDeCandidatureDansLAgenceDuBienTest` (neuf).

## Critères d'acceptation

- [x] AC1 — candidat sans profil d'agence, candidature sur un bien au mois de A : la fiche porte
  `agency_id` = A et `user_id` = le candidat ; un agent de A la lit (`GET /api/customers/{id}` 200) et
  en tire un bail (`POST /api/leases` 201).
- [x] AC2 — la réservation par `POST /api/bookings` et l'offre d'achat suivent la même règle.
- [x] AC3 — le compte a une fiche liée dans B et une fiche liée sans agence : ni l'une ni l'autre
  n'est reprise, ni ne change d'agence ; une fiche naît dans A.
- [x] AC4 — le compte a une fiche liée dans A : elle est reprise, aucune autre ne naît.
- [x] AC5 — fiche orpheline de A au téléphone du compte, téléphone vérifié : elle se rattache.
- [x] AC6 — mêmes coordonnées, aucune vérifiée : la fiche orpheline reste sans compte.
- [x] AC7 — témoin : un bien sans agence ne change pas.

## Hypothèses

- « Candidature » couvre les trois appelants de `findOrCreateFromUser` : tous trois naissent d'un
  bien, et l'offre d'achat et la réservation laissaient au personnel la même fiche invisible.
- Un bien sans agence garde la règle d'avant (agence du compte, première fiche du compte) : la
  décision nomme « l'agence du bien », qu'il n'a pas, et l'amendement de TCK-2285 laisse ce bien
  inchangé. C'est l'option la plus conservatrice.
- `added_by_id` reste le candidat : le personnel lit la fiche par `crm.view_all`, et la règle
  d'auteur (amendement d'ADR-0031 du 2026-10-24) ne la donne pas au candidat, qui n'est pas membre.
- Un compte peut ainsi porter une fiche par agence : c'est déjà le modèle (`User::tenantLeases()`,
  `DashboardTenantService`), et la visite publique résout déjà la fiche « dans l'agence du bien ».

## Hors périmètre

- Le geste « inviter le locataire à créer son compte » : TCK-2351.
- Les fiches nées sans agence avant ce ticket : elles restent telles quelles (consigne).

## Notes d'implémentation

- Avant correctif : 5 rouges sur 7 (fiche sans agence, fiche d'une autre agence reprise), les deux
  témoins (reprise dans A, bien sans agence) déjà verts.
- Ablation : `CustomerService` remis à `0282d41e7` → 6 rouges (les 5 et le témoin réécrit de
  `ContactDeLAgenceDuBienTest`) ; correctif remis → 14 verts.
