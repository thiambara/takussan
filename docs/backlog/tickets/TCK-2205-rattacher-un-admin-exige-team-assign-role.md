---
id: TCK-2205
title: "Rattacher un compte comme administrateur d'agence exige `team.assign_role`, comme changer son rôle"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-24
updated: 2026-10-24
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-227--requêtes-de-création-plus-larges-que-les-gestes-et-les-modifications-resserrés"
tags: [back, front, agence, equipe, autorisation, pistes]
---

## Objectif utilisateur

Un administrateur d'agence dont le rôle retire `team.assign_role` ne fait plus d'administrateur
par le rattachement d'un compte existant, puisque le changement de rôle le lui refuse déjà.

## Contexte

Réf : **P227.03** du fichier de pistes, `retenu · autonome` (A1 : conférer `agency_admin` est le
geste que TCK-1498 juge par `team.assign_role`, dans `AgencyPolicy::changeMemberRole`).

Avant (mesuré) : admin d'agence sans `team.assign_role`, `POST /api/agencies/{id}/members`
`{user_id, role: agency_admin}` → 200, `AgencyAdminProfile` actif en base ; le
`PUT …/members/{u}/role` du même compte → 403. `AddAgentAgencyRequest::authorize()` ne déléguait
qu'à `AgencyPolicy::update`. Le dialogue « Ajouter un compte existant »
(`InviteMemberDialog`) proposait `agency_admin` sans condition.

## Hypothèses (mode sans humain)

- Le refus est un **403** porté par `authorize()`, avant la validation (convention de
  `takussan-api/CLAUDE.md` § Validation) ; le rattachement comme `agent` reste sous la seule
  `AgencyPolicy::update`.
- L'administrateur principal garde le geste sans la capacité, comme dans `changeMemberRole`. Le
  dialogue, qui lit `useCan('team.assign_role')`, ne lui propose le rôle que s'il porte la
  capacité : l'écran peut être plus étroit que l'API dans ce seul cas, jamais plus large.

## Delta à produire

- [x] `AddAgentAgencyRequest::authorize()` : `role = agency_admin` délègue en plus à
  `changeMemberRole`.
- [x] `InviteMemberDialog` : `agency_admin` proposé sous `useCan('team.assign_role', agencyId, open)`.
- [x] Tests API : `MemberRoleChangeCapabilityTest::test_un_admin_sans_team_assign_role_ne_rattache_pas_un_compte_comme_admin`
  (le rattachement comme agent reste ouvert), `…::test_l_admin_du_role_systeme_rattache_un_compte_comme_admin`,
  `…::test_l_admin_principal_rattache_un_compte_comme_admin_meme_sans_la_capacite`.
- [x] Test front : `InviteMemberDialog.role-admin.test.tsx` (sans la capacité, seul « Agent » ;
  avec, les deux).

## Critères d'acceptation

- [x] AC1 — Admin sans `team.assign_role`, rattachement `agency_admin` → 403, aucun profil créé ;
  rattachement `agent` → 200.
- [x] AC2 — Admin du rôle système, et administrateur principal sans la capacité → 200,
  `AgencyAdminProfile` créé.
- [x] AC3 — Le dialogue ne propose « Administrateur » qu'à qui porte `team.assign_role`.

## Hors périmètre

- Le rattachement crée le profil actif sans invitation ni accord du compte visé : la piste le laisse
  « à vérifier », et le mesureur l'a écarté du correctif.

## Notes d'implémentation

- **Ablation API** : `authorize()` remis à la seule délégation à `update` → 1 rouge sur 9 ; remis →
  9 verts.
- **Ablation front** : filtre neutralisé (`|| true`) → 1 rouge sur 2 ; remis → 2 verts.
- `InviteMemberDialog.double-facteur.test.tsx` monte le dialogue sans `QueryClientProvider` : il
  reçoit désormais un `useCan` simulé.
