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

## Critères d'acceptation

- [ ] AC1 — Un bailleur invité par un agent actif voit le nom et le rôle de cet agent, et « Appeler » ouvre `tel:` sur le numéro retenu par la décision 1.
- [ ] AC2 — Un autre bailleur, ou le même bailleur sur une autre agence, reçoit 403 ou 404 et ne voit rien. Prouvé par ablation de chaque condition.
- [ ] AC3 — Fidélité : l'écart « Ton interlocutrice » de la fiche TCK-2613 est fermé.
