---
id: TCK-1712
title: "`CustomerService::create` exige son agence, et `CustomerService::update`, sans appelant, est retiré"
status: done
phase: P3
family: technique
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
  models:
    - "docs/models-spec.md#7-customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-158--fiches-client-créées-hors-de-customercontrollerstore"
tags: [back, crm, customers, pistes]
---

## Contexte

Réf : **P158.03** du fichier de pistes, `validé (délégué)` (critère V7 accordé).
`CustomerService::update()` n'a aucun appelant ; `CustomerService::create()` retombe sur
`$actor->agency_id` quand `agency_id` manque, chute que `ContactLeadService::convert`, son seul
appelant, ferme déjà à la main (`lead.without_agency`).

## Décision du porteur (déléguée)

validé (délégué) — retirer `CustomerService::update`, sans appelant, et le repli `?? $actor->agency_id` de `CustomerService::create` : sans `agency_id` dans les données, `create` lève une `LogicException` au lieu de prendre l'agence active de l'acteur (son seul appelant, `ContactLeadService::convert`, la passe toujours) ; test : `create` sans `agency_id` lève, et `ContactLeadConvertTest` reste vert ; reste : le service de domaine unique de création et de sonde de doublon, à concevoir avec P158.01, et l'offre « rattacher à cette fiche » dans la boîte des demandes

## Reste à faire

le service de domaine unique de création et de sonde de doublon, à concevoir avec P158.01, et l'offre « rattacher à cette fiche » dans la boîte des demandes

## Delta à produire

- [x] `CustomerService::update()` retiré.
- [x] `CustomerService::create()` : sans `agency_id`, `LogicException` ; l'agence n'est plus
  écrasée par celle de l'acteur.
- [x] `CustomerServiceCreateTest` (neuf).

## Critères d'acceptation

- [x] AC1 — `create` sans `agency_id` lève une `LogicException`, aucune fiche écrite.
- [x] AC2 — `create` avec `agency_id` fait naître la fiche dans l'agence donnée, `added_by_id` à
  l'acteur.
- [x] AC3 — `ContactLeadConvertTest` reste vert.

## Hors périmètre

- Le reste ci-dessus.

## Notes d'implémentation

- Ablation : repli `?? $actor->agency_id` remis → 1 rouge (AC1) ; retiré → 2/2 verts.
  `ContactLeadConvertTest` 6/6, `FicheDuCandidatRattacheeTest` 4/4.
- `grep -rnE "(customers|customerService)->update\(" app tests` → aucun appelant de `update`.
