---
id: TCK-1786
title: "Le choix de l'intervenant d'une maintenance propose le personnel de l'agence, et la cible bloquée est refusée"
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
  features:
    - "docs/features.md#18-maintenance--interventions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-120--listes-de-personnes-des-sélecteurs-face-au-prédicat-décriture"
tags: [api, web, maintenance, pistes]
---

## Objectif utilisateur

Celui qui confie une intervention choisit, dans l'écran, parmi tous ceux que l'API accepte — les
prestataires du carnet et le personnel joignable de l'agence —, et un compte bloqué ne reçoit plus
l'intervention.

## Contexte

Réf : **P120.03** du fichier de pistes.

Décision du porteur : « validé — validation en bloc du porteur (2026-10-22) : la piste telle
qu'écrite, avec la recommandation du délégué quand l'entrée en porte une ; où elle laisse plusieurs
voies sans recommandation, l'implémenteur retient la plus étroite et écrit son choix dans le ticket »

Mesuré avant correctif sur `71fbc01f6` : bailleur du bien, `PATCH /api/maintenance-requests/{mr}`
avec `assigned_to` = agent de l'agence au compte `blocked` → 200 ; même geste avec un prestataire
actif au compte `blocked` → 200. Le sélecteur `MaintenanceAssignmentBlock` ne lit que
`/api/agencies/{id}/service-providers`.

## Choix de l'implémenteur (voies laissées ouvertes par la Piste)

La Piste laisse deux voies : ouvrir le personnel à l'écran, ou faire cesser l'API de l'accepter.
Retenue : **ouvrir le personnel à l'écran**. C'est la plus étroite : l'API garde le contrat de
TCK-592 (« un membre de l'équipe de cette agence »), sur lequel la passation d'agent
(`AgentHandoverService::eligibleForMaintenance`) s'appuie déjà ; l'autre voie retirait une
attribution qu'un appelant légitime fait aujourd'hui (V2) et désaccordait la passation.

## Hypothèses (mode sans humain)

- Seule la **règle de validation** de la cible (`AssignableProvider`) change. Le prédicat d'accès
  de l'assigné (`ProviderEligibility::isAssignable`, lu par la policy, les avis, l'agenda,
  l'inscription du prestataire) n'est pas touché : la Piste vise la cible qu'on désigne.
- Le personnel est lu par `GET /api/agencies/{id}/members?filter[assignable]=1`, la liste que les
  autres sélecteurs d'attribution lisent déjà (P120.01). Un appelant qui n'y a pas accès (403 : ni
  administrateur, ni `crm.assign`) garde le seul carnet, sans message.
- Aucun texte neuf : le personnel s'ajoute à la suite des prestataires, sous son nom.

## Delta à produire

- [x] `App\Rules\AssignableProvider` : membre de l'équipe jugé par
  `PersonnelDeLAgence::estPersonnel()`, prestataire à collaboration active seulement si son compte
  est joignable (`PrimaryPropertyContact::joignable`).
- [x] `useAssignableStaff(agencyId)` dans `src/lib/queries/maintenance.ts`.
- [x] `MaintenanceAssignmentBlock` : le personnel suit le carnet, sans doubler un prestataire.
- [x] Gardes : `tests/Feature/Maintenance/MaintenanceAssignableProviderTest.php` (deux cas),
  `MaintenanceAssignmentBlock.test.tsx` (un cas).

## Critères d'acceptation

- [x] AC1 — Agent de l'agence au compte `blocked` en `assigned_to` → 422 sur `assigned_to`,
  l'assigné précédent reste.
- [x] AC2 — Prestataire actif, collaboration active, compte `blocked` → 422.
- [x] AC3 — Le témoin « membre de l'équipe assignable » reste 200.
- [x] AC4 — Le sélecteur propose le personnel joignable après les prestataires, un même compte une
  seule fois.

## Hors périmètre

- Distinguer à l'écran le personnel des prestataires (libellé ou groupe) : texte neuf.
- Le prestataire actif d'une autre spécialité, que l'API accepte et que le carnet filtré par
  `specialty` ne montre pas (constat de la piste, sans correctif demandé).
- Le prédicat d'accès `ProviderEligibility::isAssignable()`.

## Notes d'implémentation

- Ablation API : `AssignableProvider` remis à son état antérieur → 2 rouges sur 10 (200 au lieu de
  422) ; rétabli → 10 verts.
- Ablation front : personnel non ajouté → 1 rouge (« Awa Diop » introuvable) ; sans le dédoublonnage
  → 1 rouge (deux « Fatou Sarr ») ; rétabli → 7 verts.
- `MaintenanceDetail.test.tsx` simule le module de queries : il lui faut le nouveau hook, sinon
  « No QueryClient set ».
