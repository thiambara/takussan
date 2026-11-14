---
id: TCK-2838
title: "Le bailleur invité voit son interlocuteur à l'agence — nom, rôle, Appeler, WhatsApp"
status: todo
phase: P1
family: full
estimate: M
wave: 86
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2613]
blocks: []
spec_refs:
  features:
    - "docs/features.md#onboarding-parcours"
  models:
    - "docs/models-spec.md#34-ownerprofile-"
tags: [front, api, onboarding, invitation, audit-ux, app]
---

## Objectif utilisateur

Dès l'écran 2 de son assistant, le bailleur invité sait qui, à l'agence, s'occupe de lui. Il peut l'appeler ou lui écrire sur WhatsApp sans chercher un numéro.

## Constat (re-mesuré le 2026-11-14)

- La maquette `app-entree-assistants` a, « Bailleur : tes biens », au bureau 1280, porte une carte « Ton interlocutrice » (nom, rôle, « Appeler », « WhatsApp ») dans la colonne voisine. Écart ouvert de la fiche `docs/qa/audit-ux-2026-11/fidelite/TCK-2613.json`.
- Aucune lecture ne sert cette personne au bailleur. Ni `/onboarding/owner` ni `GET /api/me/owner-profiles/{id}` ne portent `invitations.invited_by`. Seul l'aperçu public de l'invitation (`GET /api/public/invitations/{jeton}`, TCK-2611) dit le prénom de l'invitant, et seulement avant l'acceptation.

## Delta à produire

- API : le titulaire du profil bailleur lit l'interlocuteur de l'agence, sous sparse fieldsets. Les champs sont le prénom, le nom, le rôle et le téléphone **public** : jamais un numéro personnel, rien d'un autre profil.
- Il faut une règle explicite : l'invitant, s'il est encore membre actif de l'agence, sinon le contact public de l'agence.
- Front : la carte à droite de « Vos biens chez {agence} » dès `xl`, au-dessus d'« À faire pour être payé ». Au téléphone, rien de neuf.

## Questions produit à trancher avant l'implémentation

1. Quel numéro peut être montré au bailleur : le téléphone de l'agent ou le numéro public de l'agence ?
2. Que fait-on quand l'invitant a quitté l'agence ?

## Décisions (team-lead, 2026-11-14)

1. **Le numéro (a′).** Le numéro vérifié de l'agent ne sort que s'il est déjà public, c'est-à-dire si la fiche publique de l'agent est servie (même règle que `AgentPublic::parSlug`). Sinon, c'est le téléphone public de l'agence qui sort, et le nom de l'agent reste affiché.
2. **L'invitant a quitté l'agence, ou n'est plus actif que dans une autre agence.** C'est l'agence qui apparaît : son nom, le rôle « Agence » et son téléphone. Le nom et le numéro de l'agent ne sortent jamais.
3. **WhatsApp.** Le bouton n'apparaît que sur un numéro de l'agent déclaré WhatsApp. Il n'apparaît jamais pour l'agence.

## Critères d'acceptation

- [x] AC1 — Un bailleur invité par un agent actif voit le nom et le rôle de cet agent, et « Appeler » ouvre `tel:` sur le numéro retenu par la décision 1.
  - Preuve (2026-11-14), décision 1 = a′ : `InterlocuteurDuBailleurTest::test_le_bailleur_invite_par_un_agent_actif_lit_son_nom_son_role_et_son_numero_verifie` (API) ; `CarteDeLInterlocuteur.tck-2838.test.tsx` : « Appeler » ouvre `tel:+221771230001`.
  - Un agent sans fiche publique ne fait pas sortir son numéro : c'est celui de l'agence qui sort, et son nom reste (`test_un_agent_sans_fiche_publique_…`). L'ablation de la condition « fiche servie » rend ce test rouge.
- [x] AC2 — Un autre bailleur, ou un membre de l'agence, reçoit 403 et ne voit rien. Un bailleur qui a un profil dans deux agences ne lit, sur chaque profil, que l'interlocuteur de ce profil. Une invitation d'une autre agence, d'un autre profil ou d'un autre type de profil ne désigne personne. Un invitant parti, actif seulement dans une autre agence ou au compte bloqué ne fait sortir ni son nom ni son numéro : seule l'agence apparaît. Chaque condition est prouvée par ablation. *(Réécrite le 2026-11-14 avec l'accord de team-lead : la route est par profil, et le titulaire de deux profils lit les deux, chacun avec son propre interlocuteur.)*
  - Preuve (2026-11-14) : `tests/Feature/Owners/InterlocuteurDuBailleurTest.php`, 15 verts. Un autre bailleur et un agent de l'agence reçoivent 403. Le même bailleur sur deux agences ne lit, sur chaque profil, que l'interlocuteur de ce profil. Une invitation d'une autre agence ou d'un autre profil ne désigne personne. Un invitant parti ou bloqué laisse place à l'agence. Un numéro non vérifié n'est jamais rendu.
  - Dix ablations, une à la fois, toutes rouges : le titulaire seul, `invitable_type`, `invitable_id`, `invitations.agency_id`, le membre actif, l'activité dans CETTE agence, le compte actif, le numéro vérifié, la fiche publique servie et les sparse fieldsets. Chaque fichier a été restauré et son md5 vérifié.
- [x] AC3 — Fidélité : l'écart « Ton interlocutrice » de la fiche TCK-2613 est fermé.
  - Relevé du 2026-11-14 vers 18 h 53, en lecture seule, sous le verrou de mesure : persona `bailleur-invite`, `/onboarding/owner?owner=35`, garde de non-écriture (0 écriture bloquée, 0 erreur), à 390 et 1280. Captures sous `takussan-web/.fidelite/TCK-2838/{sans-numero,avec-numero}`.
  - Avant le seeder, sans numéro : à 1280, la carte « Mariama Faye · Responsable de l'agence · Agence des personas » s'affiche sans geste.
  - Après le seeder, avec le numéro de l'agence : « Appeler » ouvre `tel:+221338279940`. Le bouton fait 352 px, le numéro n'est pas tronqué, et il n'y a pas de bouton WhatsApp.
  - À 390, la colonne est cachée. L'écart est passé en `ecarts_resolus` dans la fiche TCK-2613.
- Décision complémentaire (team-lead, 2026-11-14) : la carte ne disparaît que s'il n'y a ni nom ni numéro. Un invitant actif sans numéro public reste montré, sans geste. Le test et son ablation sont dans `InterlocuteurDuBailleurTest`.
