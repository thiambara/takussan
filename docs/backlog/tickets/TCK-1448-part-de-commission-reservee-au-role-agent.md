---
id: TCK-1448
title: "Une part de commission n'est permise qu'à un collaborateur `agent`, et quitter ce rôle la retire (P86.03)"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-86"
  adr:
    - "docs/adr/0049-attribution-des-transactions-et-grand-livre-des-commissions.md"
  models:
    - "docs/models-spec.md"
tags: [api, commissions, collaborators, pistes]
---

## Objectif

Qu'une part de commission ne puisse plus être posée là où le grand livre ne la sert pas : sur un
`manager`, un `co_owner` ou un `viewer`, elle n'était versée à personne et comptait pourtant dans le
plafond de 100 % du bien.

## Contexte

Réf : **P86.03** du fichier de pistes (angle 86), `validé` le 2026-10-21 (validation en bloc ;
critère V1 accordé : calcul des commissions).

`StorePropertyCollaboratorRequest` et `UpdatePropertyCollaboratorRequest` acceptaient
`commission_share` pour tout rôle ; `assertCommissionWithinCapLocked()` additionne les parts de
toutes les lignes ; `CommissionLedgerService` ne sert que les lignes `role = agent` (ADR-0049
« Ventilation » § 1). Mesuré par le mesureur : un `co_owner` à 70 % puis un agent à 40 % → 422.

## Décision du porteur

> validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket

### Choix de l'implémenteur

La `Piste` offre deux voies : refuser `commission_share` hors du rôle `agent` (et retirer la part au
changement de rôle), ou borner le plafond aux parts servies. Retenue : **la première**, que la
`Piste` recommande (« Le premier suit ADR-0049 § 3 »).

Hypothèses :

- **ce qui est refusé** : une part **positive** hors du rôle `agent` (422 sur `commission_share`,
  message `validation.prohibited`). `null` et `0` restent acceptés : ils ne mangent rien du plafond ;
- **le rôle jugé en modification** est celui que la ligne aura après le `PUT` : le rôle demandé, à
  défaut le sien ;
- **quitter le rôle `agent`** remet `commission_share` à `null` sur la ligne (« retirer » plutôt
  qu'« annuler » : aucune ligne du grand livre n'est touchée, il ne lit la part qu'à l'activation
  d'un bail) ;
- le front n'envoie jamais `commission_share` (mesuré : `grep` dans `takussan-web/src`, deux types
  seulement) : aucun écran ne change.

## Reste à faire

- Les parts déjà posées hors du rôle `agent` (le seeder `PropertyCollaboratorSeeder` en donne à
  tous les rôles ; 231 lignes `manager` dans la base de développement au relevé du 2026-10-20)
  restent en base et comptent toujours dans le plafond : les remettre à `null` est une réécriture de
  données (V4), au porteur ; corriger le seeder irait avec.

## Delta produit

- [x] `StorePropertyCollaboratorRequest` : `prohibitedIf` sur `commission_share` positive hors `agent`.
- [x] `UpdatePropertyCollaboratorRequest` : même règle sur le rôle d'après (`roleApres()`).
- [x] `PropertyCollaboratorController::update()` : un changement de rôle hors `agent` remet la part
      à `null`.
- [x] `tests/Feature/Property/CollaboratorCommissionShareRoleTest.php` (5 cas).
- [x] `PropertyCollaboratorTest::test_update_refuse_de_passer_un_bailleur_en_role_agent` : sa
      dernière assertion postait 5 % sur un `co_owner` pour montrer que la part seule ne rejuge pas
      l'éligibilité ; elle poste désormais 0, même intention.

## Critères d'acceptation

- [x] AC1 — `POST` d'un `manager` à 70 % ou d'un `viewer` à 5 % → 422 `commission_share`, rien créé.
- [x] AC2 — `manager` sans part, `viewer` à 0 → 201.
- [x] AC3 — agents : 60 puis 50 → 422 (plafond inchangé), puis 40 → 201.
- [x] AC4 — `PUT` d'une part positive sur un `manager`, ou d'un agent vers `manager` avec une part →
      422, ligne inchangée.
- [x] AC5 — un agent à 70 % passé `manager` → part `null`, et un agent à 100 % s'ajoute ensuite.

## Notes d'implémentation

- **Ablation** : les trois fichiers remis à `pre-dev` → 3 rouges (AC1, AC4, AC5), 2 verts (AC2 et
  AC3, comportements conservés) ; correctif remis → 5 verts.
