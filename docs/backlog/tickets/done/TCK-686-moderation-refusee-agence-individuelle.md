---
id: TCK-686
title: "La modération obligatoire est cachée et refusée (422) pour une agence individual"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#11-gestion-des-biens
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-15--parcours-dune-agence-neuve
tags: [api, front, moderation, agence, pistes]
---

## Contexte

Réf : **P15.03** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

La case « Modération obligatoire » de `/app/agency` s'affichait aussi pour une agence `individual`,
et `AgencyUpdateRequest` acceptait `moderation_required` sans condition. Cochée, toute publication
passe `pending_review` (`PropertyObserver`, sans exemption par rôle), alors que la file
`/app/agency/moderation/properties` exige une agence `standard` (`pages-admin.ts`) : l'hôte seul
n'a aucun écran pour s'approuver, et ses biens restent en attente.

## Décision du porteur

réglage caché et refusé (422) pour une agence individual

## Objectif

Une agence `individual` ne peut plus activer la modération, ni par l'écran ni par l'API.

## Delta à produire

- [x] `AgencyUpdateRequest` : `moderation_required` porte `declined` quand l'agence de la route est
      `individual` (`true` → 422, `false` accepté). Le test du type d'agence est factorisé en
      `isIndividual()`, partagé avec les mentions légales.
- [x] `AgencyConfigForm` : la case n'est pas rendue pour une agence `individual`.
- [x] `normaliseAgencyForm` : la clé `moderation_required` ne part pas pour une agence `individual`,
      comme les mentions légales.
- [x] Tests : `AgencyTest::test_individual_agency_cannot_enable_moderation`,
      `AgencyConfigForm.moderation.test.tsx` (« cache la case et n'envoie pas moderation_required »).

## Critères d'acceptation

- [x] AC1 — `PATCH /api/agencies/{id}` avec `moderation_required: true` sur une agence `individual`
      rend 422 avec l'erreur sur `moderation_required`, et la colonne reste à `false`.
- [x] AC2 — La même requête avec `false` rend 200.
- [x] AC3 — Pour une agence `standard`, rien ne change (`test_agency_admin_persists_moderation_required`).
- [x] AC4 — Pour une agence `individual`, `/app/agency` ne rend pas la case, et l'enregistrement
      n'envoie pas `moderation_required`.

## Hypothèses (mode sans humain)

- « Refusé (422) » vise l'activation : `declined` plutôt que `prohibited`, pour que `false` reste
  accepté de tout appelant (une agence `individual` déjà modérée peut encore se désactiver par
  l'API).
- Le front n'envoie pas la clé plutôt que d'envoyer `false` : envoyer la valeur lue rendrait 422 à
  chaque enregistrement d'une agence `individual` déjà modérée, et envoyer `false` réécrirait en
  silence un réglage que l'écran ne montre plus.

## Hors périmètre

- Une agence `individual` dont `moderation_required` vaut déjà `true` en base reste modérée : la
  remettre à `false` est une réécriture de données (V4). Seul le passage `individual → standard`
  existe (`AgencyKindFlipTest`), donc le cas ne naît plus par l'écran.
- Exempter l'admin unique de la modération (l'autre option de la `Piste`) n'est pas fait.

## Notes d'implémentation

- Ablation : `declined` retiré → le test API rougit (200 au lieu de 422). `agency.ts` remis à
  `pre-dev` → le test front rougit sur `moderation_required` présent dans le corps ;
  `AgencyConfigForm.tsx` remis à `pre-dev` → il rougit sur la case trouvée. Correctifs remis : verts.
