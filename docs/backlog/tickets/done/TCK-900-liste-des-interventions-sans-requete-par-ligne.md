---
id: TCK-900
title: "Liste des demandes d'intervention : l'agence du personnel lue une fois par requête"
status: done
phase: P2
family: back
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-20--nombre-réel-de-requêtes-sql-par-écran"
tags: [back, performance, maintenance, pistes]
---

## Contexte

Réf : **P20.02** du fichier de pistes, `retenu · autonome` (A2). `MaintenanceRequestResource`
appelle deux fois par ligne `MaintenanceRequestPolicy::isPrincipalFor()` (`seesQuote()` et
`isPrincipal()`), qui résout chaque fois `User::staffAgencyId()` sans cache. Re-mesuré le
2026-10-18 par le test de garde : `GET /api/maintenance-requests` en admin d'agence → 19 requêtes
de profil pour 2 lignes, 59 pour 12, soit 4 par ligne (6 au relevé du 2026-10-15 : TCK-711 a
depuis retiré la relecture de `isSuperAdmin()`, P20.03).

## Objectif utilisateur

La liste des demandes d'intervention d'une agence coûte le même nombre de requêtes de profil
quelle que soit sa longueur, avec une réponse inchangée.

## Contrat de données

Aucun changement de réponse : les champs de devis et les consignes d'accès restent servis aux
mêmes personnes.

## Contraintes strictes

- La règle « donneur d'ordre » reste dans `MaintenanceRequestPolicy::isPrincipalFor()`.

## Delta à produire

- [x] `MaintenanceRequestResource` : `isPrincipal` calculé une fois par ligne et réutilisé par
  `seesQuote`, l'agence du personnel lue une fois par requête dans `$request->attributes`, comme
  `LeaseResource` et `CustomerResource`.
- [x] `MaintenanceRequestPolicy::isPrincipalFor()` : un fournisseur facultatif de l'agence du
  personnel, appelé seulement au besoin.
- [x] `tests/Feature/Maintenance/MaintenanceRequestListQueryBudgetTest.php`.

## Critères d'acceptation

- [x] AC1 — À 2 lignes et à 12 lignes, la liste émet le même nombre de requêtes de profil, et le
  même nombre de requêtes en tout.
- [x] AC2 — Les tests de maintenance existants restent verts (visibilité du devis, des consignes
  d'accès et de l'e-mail du demandeur inchangée).

## Hors périmètre

- Les autres appelants de `isPrincipalFor()` (policy, contrôleur), qui ne l'appellent qu'une fois
  par requête.

## Notes d'implémentation

- Ablations, chacune remise après : la ressource d'origine → rouge (19 requêtes de profil pour 2
  lignes, 59 pour 12) ; `isPrincipal` une fois par ligne mais sans le cache par requête → rouge
  (15 pour 2, 35 pour 12). Seul le cache rend la liste constante.
- Le fournisseur est une closure et non un entier : `isPrincipalFor()` ne lit l'agence du
  personnel qu'après les cas super-admin, bien absent et bailleur du bien ; un entier passé
  d'avance l'aurait résolue même pour eux.
- La clé du cache porte l'id de l'utilisateur, comme celle de `LeaseResource` : un même objet
  `Request` ne sert jamais deux personnes, mais la clé ne le suppose pas.
- Vérification : 368 tests des classes de maintenance et de celles qui citent la route, la
  ressource ou la policy → verts.
