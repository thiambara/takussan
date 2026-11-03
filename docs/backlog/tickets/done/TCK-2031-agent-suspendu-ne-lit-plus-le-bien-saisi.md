---
id: TCK-2031
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
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-190--créateur-dun-bien-dagence-suspendu-ou-retiré-face-aux-règles-qui-lacceptent-par-la-seule-identité"
tags: [api, properties, authorization, pistes]
---

## Contexte

Réf : **P190.07** du fichier de pistes, `validé` (V2 accordé). TCK-1705 tenait `properties.user_id`
pour titre sur un bien d'agence pour qui y avait un profil de tout statut (`PropertyPolicy::isMemberOf`),
et la liste bornait la clause « mes biens » aux agences où l'appelant avait un profil, sans statut :
l'agent suspendu lisait encore le bien qu'il avait saisi et le gardait dans `GET /api/properties`.

## Décision du porteur

validation du porteur (2026-10-23) : la piste telle qu'écrite : ADR-0031 § 3, aucun périmètre pour un profil non actif (revient sur la voie étroite de TCK-1705)

## Hypothèses (mode sans humain)

- « Personnel actif de l'agence » se lit au **statut** du profil (agent ou admin d'agence `active`
  dans l'agence du bien, `activeProfileTypesAt`), et non au profil actif de la requête
  (`isStaffOf`) que la `Piste` cite entre parenthèses. Avec `isStaffOf`, l'agent de deux agences
  perdait, depuis l'une, la modification du bien qu'il a saisi dans l'autre, contrat que garde
  `AgencySuspendedWriteLockTest::test_un_membre_de_deux_agences_n_ecrit_pas_dans_la_suspendue_depuis_l_autre`
  (rouge mesuré avec `isStaffOf`). Le statut suffit à ADR-0031 § 3 : un profil suspendu ne confère rien.
- `agencyGesture` (`delete`, `publish`) garde `isMemberOf` : la piste ne nomme que `view`, `update`
  et la liste, et la capacité exigée y est déjà refusée à un profil non actif.

## Delta à produire

- [x] `PropertyPolicy::view` : `user_id` vaut titre par `BailleurDuBien::est`, ou pour l'auteur qui a
  un profil de personnel au statut actif dans l'agence du bien (`isActiveStaffMemberOf`).
- [x] `PropertyPolicy::update` : l'auteur d'un bien d'agence en est le bailleur ou le personnel
  actif, et tient `properties.update_own`.
- [x] `PropertyController::index` : la clause « mes biens » est bornée aux agences où l'appelant a un
  profil propriétaire (de tout statut) ou un profil au statut actif.
- [x] Test `AgentCreateurSuspenduBienSaisiTest`.

## Critères d'acceptation

- [x] AC1 — agent créateur suspendu : `can('view')` et `can('update')` faux, `GET` et `PUT` en 403,
  bien absent de la liste.
- [x] AC2 — bailleur auteur bloqué : lecture 200 et bien listé ; agent actif : lecture et liste.
- [x] AC3 — le retiré reste refusé (`MembreRetireBiensSaisisTest`, TCK-1705), l'auteur d'un bien sans
  agence garde le sien, et l'agent de deux agences modifie depuis l'une le bien saisi dans l'autre
  (`AgencySuspendedWriteLockTest`).

## Hors périmètre

- `delete` et `publish` (`agencyGesture`).

## Notes d'implémentation

- Ablation : `PropertyPolicy` et `PropertyController` remis à l'état d'avant → 1 rouge (suspendu :
  `can('view')` vrai) ; `PropertyController` seul remis → 1 rouge (bien encore listé) ; vert remis.
- Piège : `activeProfileTypesAt` rend une `Eloquent\Collection` de chaînes, où `intersect()` appelle
  `getKey()` (500) : `contains()`.
