---
id: TCK-1322
title: "Les notifications de délégation nomment le rôle par son libellé, jamais par son code"
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
    - "docs/features.md#23-notifications"
    - "docs/features.md#22-rôles--permissions"
  models:
    - "docs/models-spec.md#12-appnotification-"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-128--dates-des-charges-utiles-de-notification-et-leur-lecture-par-le-front"
tags: [back, front, notifications, i18n, delegation, pistes]
---

## Contexte

Réf : **P128.02** du fichier de pistes, `retenu · autonome` (A4).

Les six codes `role_delegation.*` rangent le rôle délégué en code (`agency_admin`, `agent`,
`owner`) dans un paramètre `text` : l'API et la cloche l'affichaient tel quel (« Vous avez reçu le
rôle agency_admin jusqu'au 25 octobre 2026. »).

## Objectif utilisateur

Le bénéficiaire et le délégant lisent le nom du rôle dans leur langue.

## Contrat de données

Les paramètres rangés ne changent pas (`params.role` reste le code) : la traduction se fait au
rendu, côté API et côté front, ce qui traduit aussi les lignes déjà écrites.

## Delta à produire

- [x] API : nature de paramètre `NotificationCode::PARAM_ROLE`, rendue par `invitations.roles.<code>`
  (libellé existant, en minuscules pour le milieu de phrase) ; les six codes `role_delegation.*`
  la déclarent.
- [x] Front : `valeursDeNotification` traduit `role` des codes `role_delegation.*` par
  `admin.roles.role_delegations.roles.<code>` (libellé existant).
- [x] Tests : `RoleDelegationNotificationRoleTest` (API), cas « traduit le rôle délégué » de
  `NotificationRow.test.tsx` (front).

## Critères d'acceptation

- [x] AC1 — rendu fr et en des six codes (titre, corps, SMS) : aucun `agency_admin`, le libellé à
  la place.
- [x] AC2 — un code de rôle sans libellé est rendu tel quel.
- [x] AC3 — la ligne écrite garde `params.role = agency_admin` ; la cloche fr et en affiche
  « Administrateur d'agence » / « Agency administrator ».

## Hors périmètre

- `governance.role_capabilities_changed`, dont le paramètre `role` est le nom libre d'un rôle
  personnalisé : il reste un texte.
- Aucun texte neuf, ni wolof : le wolof de l'API reprend le libellé `wo` déjà écrit
  d'`invitations.roles`.

## Notes d'implémentation

- Ablation API : la branche `PARAM_ROLE` retirée du `match` de `NotificationRenderer::format` →
  3 rouges sur 4 (le cas « code inconnu » reste vert, il est le témoin du repli) ; remise → vert.
- Ablation front : `libelleRole` non transmis à `valeursDeNotification` → les deux cas rouges ;
  remis → vert.
- Le front ne connaît pas la nature d'un paramètre : la traduction de `role` est bornée aux codes
  `role_delegation.*`, pour ne pas traduire le nom libre d'un rôle de gouvernance.
