---
id: TCK-1753
title: "L'édition d'une fiche client ne pose plus `blocked` ni `deleted`, que rien ne lit"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  models:
    - "docs/models-spec.md#7-customer"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-147--statuts-posés-par-un-ruleenum-entier-dans-les-requêtes-décriture"
tags: [api, front, crm, clients, statut, pistes]
---

## Contexte

Réf : **P147.06** du fichier de pistes, `validé` (V7 accordé).

`UpdateCustomerRequest` acceptait tout `CustomerStatus`, et le formulaire d'édition proposait les
quatre valeurs. Hors du cast et de la règle, `app/` ne lit que `active` (pipeline,
`PipelineStatsService.php:63` ; rapprochement, `ProspectMatcher.php:144`) : `blocked` n'empêche
rien, et un client `deleted` reste dans `GET /api/customers` sans être supprimé — la suppression a
son geste, `destroy`, jugé par `can('delete')`.

## Décision du porteur

> validé — validation en bloc du porteur (2026-10-22) : la piste telle qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket

**Choix retenu** (la recommandation du délégué, et la voie la plus étroite là où elle en laisse
deux) :

- `deleted` quitte la règle d'édition et le formulaire, comme le recommande le délégué ;
- pour `blocked`, le délégué laisse deux voies (le faire lire par les gestes qui contactent le
  client, ou le retirer de même) : la plus étroite est le **retrait**. La faire lire couperait une
  relance de loyer et un reçu de paiement (V1, relevé par la `Mesure` de l'implémenteur du
  2026-10-22) sur une liste de gestes que rien ne fixe ;
- **aucune donnée n'est réécrite** (V4 évité) : le statut que la fiche porte déjà passe encore
  inchangé, et le formulaire l'offre à cette seule fiche. C'est la parade à l'objection de la
  `Mesure` du 2026-10-22 (« rend 422 à toute édition d'une fiche déjà `deleted` »).

## Objectif utilisateur

L'agent ne peut plus marquer un client « Bloqué » ou « Archivé » en croyant que cela empêche ou
supprime quelque chose ; une fiche qui porte déjà l'un de ces statuts se modifie toujours.

## Contrat de données

`PATCH /api/customers/{id}` : `status` ∈ {`active`, `inactive`, statut courant de la fiche}. Toute
autre valeur rend 422 sur `status`. L'enum `CustomerStatus`, la colonne et les lectures ne bougent
pas.

## Delta à produire

- [x] `UpdateCustomerRequest` : `Rule::enum(CustomerStatus::class)->only(…)`, `active`, `inactive`
  et le statut courant.
- [x] `lib/enums/customer.ts` : `customerSettableStatusValues` ; `CustomerForm` n'offre que ces
  valeurs, plus le statut courant de la fiche s'il est hors de la liste.
- [x] Tests : `CustomerStatusSettableTest` (API), `CustomerForm.statut.test.tsx` (front).

## Critères d'acceptation

- [x] AC1 — `PATCH {status: blocked|deleted}` sur une fiche `active` → 422 sur `status`, fiche
  inchangée.
- [x] AC2 — `active` ↔ `inactive` se posent.
- [x] AC3 — une fiche `blocked` ou `deleted` se modifie en renvoyant son statut, et repasse `active`.
- [x] AC4 — le sélecteur d'une fiche active n'offre que « Actif » et « Inactif » ; celui d'une fiche
  `blocked` offre aussi « Bloqué » et le renvoie inchangé.

## Hors périmètre

- Le filtre de la liste et les badges gardent les quatre statuts : des fiches les portent encore.
- Ce que `blocked` devrait empêcher, et la réécriture des fiches déjà `blocked` ou `deleted` (V4,
  compte en préproduction à relever d'abord), au porteur.
- `docs/models-spec.md:923` (« statut administratif (active, inactive, blocked, deleted) ») reste
  juste pour les valeurs de la colonne ; qu'il dise lesquelles se posent relève de `/sync-specs`.

## Notes d'implémentation

- Ablation API : règle rendue à `Rule::enum(CustomerStatus::class)` → 2 rouges sur 5 (200 au lieu
  de 422) ; remise → 5/5.
- Ablation front : filtre des options neutralisé → 2 rouges sur 4 (« Bloqué », « Archivé »
  offerts) ; remis → 4/4.
