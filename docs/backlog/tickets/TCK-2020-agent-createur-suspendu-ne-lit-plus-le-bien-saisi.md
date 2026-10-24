---
id: TCK-2020
title: "L'agent suspendu ne lit plus le bien d'agence qu'il a saisi et ne le garde plus dans sa liste"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  adr:
    - "docs/adr/0031-personnel-de-l-agence-et-cloisonnement-des-bailleurs.md"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-190--créateur-dun-bien-dagence-suspendu-ou-retiré-face-aux-règles-qui-lacceptent-par-la-seule-identité"
tags: [api, properties, authorization, pistes]
---

## Contexte

Réf : **P190.07** du fichier de pistes, `validé` (V2 accordé). TCK-1705 (P153.01) ne tenait
`user_id` pour titre sur un bien d'agence que si l'auteur y avait un profil « de tout statut »
(`PropertyPolicy::isMemberOf`), et la liste `GET /api/properties` bornait sa clause aux agences où
il a un profil, sans statut. L'agent suspendu lisait donc encore le bien qu'il avait saisi
(`GET /api/properties/{id}` 200) et le gardait dans sa liste, contre ADR-0031 § 3 et
`docs/features.md` (aucun périmètre pour un profil non actif).

## Décision du porteur

validation du porteur (2026-10-23) : la piste telle qu'écrite : ADR-0031 § 3, aucun périmètre pour un profil non actif (revient sur la voie étroite de TCK-1705)

## Delta à produire

- [x] `PropertyPolicy::auteurMembre` : sur un bien d'agence, l'auteur a titre s'il en est le bailleur (`BailleurDuBien::est`, de tout statut) ou s'il y tient un profil d'agent ou d'admin au statut actif.
- [x] `view` et la branche « son propre bien » d'`update` le lisent à la place d'`isMemberOf`.
- [x] `PropertyController::index` : la clause de l'auteur borne aux agences de ses profils propriétaires (tout statut) et de ses profils d'agent ou d'admin actifs.
- [x] Test `AgentCreateurSuspenduLectureDuBienTest`.

## Critères d'acceptation

- [x] AC1 — Agent créateur suspendu : `can('view')` et `can('update')` faux, `GET /api/properties/{id}` 403, absent de `GET /api/properties`.
- [x] AC2 — Agent créateur retiré : même refus (TCK-1705, inchangé).
- [x] AC3 — Bailleur auteur bloqué : lecture 200, présent dans sa liste (ADR-0031 § 2).
- [x] AC4 — Agent créateur actif et bailleur actif : lecture et liste.

## Hypothèse

- La `Piste` écrit « personnel actif de l'agence (`isStaffOf`) ». `isStaffOf` lit le **profil
  actif de la requête**, pas le statut : l'employer aurait aussi retiré à l'agent de deux agences,
  agissant depuis l'autre, la modification du bien qu'il a saisi (`AgencySuspendedWriteLockTest`
  rougit, 403 au lieu de 200). La décision vise le profil **non actif** (ADR-0031 § 3) : le
  correctif juge donc le **statut** du profil (`isAgentAt`, `isAgencyAdminAt`, portée `active()`),
  ce qui ne retire rien d'autre que ce que la décision retire.

## Hors périmètre

- `agencyGesture` (supprimer, publier) garde `isMemberOf` : la piste ne le vise pas, et la
  capacité exigée n'est conférée que par un profil actif.

## Notes d'implémentation

- Ablation : policy de `pre-dev` seule → 1 rouge sur 5 ; contrôleur de `pre-dev` seul → 1 rouge sur 5 (le bien reste dans la liste) ; remis → 5 verts.
- Piège : `isStaffOf` (profil actif de la requête) fait rougir `AgencySuspendedWriteLockTest::test_un_membre_de_deux_agences_n_ecrit_pas_dans_la_suspendue_depuis_l_autre` à sa première étape.
