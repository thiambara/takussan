---
id: TCK-1422
title: "« Ajouter » un bailleur ou un prestataire se montre à qui tient `team.invite`"
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
  features:
    - "docs/features.md#112-agence--équipe"
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-152--gestes-hors-de-appagency-montrés-par-le-rôle-jugés-par-la-capacité"
tags: [front, permissions, pistes]
---

## Objectif utilisateur

Un membre de l'agence à qui son rôle donne `team.invite` voit « Ajouter » sur les pages des
bailleurs et des prestataires, comme l'API le laisse inviter ; un membre sans elle ne le voit pas.

## Contexte

Réf : **P152.01** du fichier de pistes, `validé (délégué)` (critère V7 cité par le classement,
accordé).

Mesuré avant correctif (test de page ci-dessous, rouge sur `e2959c84c`) : agent `team.invite` →
`canInvite` faux sur les deux pages. L'API rend 201 aux deux invitations (mesure du mesureur).

## Décision du porteur (déléguée)

> calculer `canInvite` des pages des bailleurs et des prestataires par la capacité `team.invite` dans l'agence (`fetchMyCapabilities` côté serveur), en plus du profil d'admin, comme `OwnerProfilePolicy::invite` et `ServiceProviderProfilePolicy::canInviteIn`, en gardant la condition de type d'agence de la page des prestataires ; aucune règle de l'API ne change ; test de page : un agent qui tient `team.invite` voit « Ajouter », un agent qui ne la tient pas ne le voit pas

## Hypothèses (mode sans humain)

- `fetchMyCapabilities` a été retiré par TCK-1376 ; son successeur côté serveur est
  `capacitesDuProfilActif()` (`lib/access/pages-admin-server.ts`), même lecture de
  `GET /api/me/capabilities` sous le profil actif, mémoïsée par rendu.
- Une lecture en panne (`null`) vaut l'absence de la capacité : le bouton reste caché.
- La lecture n'est faite que pour un non-admin.

## Delta à produire

- [x] `owners/page.tsx` et `maintenance/providers/page.tsx` : `canInvite` = admin, ou
  `team.invite` lue par `capacitesDuProfilActif` ; condition de type d'agence gardée.
- [x] Test : `owners/__tests__/invitation-par-capacite.test.tsx` (les deux pages).

## Critères d'acceptation

- [x] AC1 — Un agent qui tient `team.invite` voit « Ajouter » sur les deux pages.
- [x] AC2 — Un agent sans elle, ou dont la lecture est en panne, ne le voit pas.
- [x] AC3 — L'admin le voit ; sur les prestataires, une agence illisible le cache toujours.

## Hors périmètre

- Toute règle de l'API.

## Notes d'implémentation

- Ablation : les deux pages rendues à leur état antérieur → 2 rouges (agent `team.invite`) ;
  remises → 9 verts.
