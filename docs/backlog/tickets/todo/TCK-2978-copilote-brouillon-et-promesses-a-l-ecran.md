---
id: TCK-2978
title: "Le copilote à l'écran, agir : le brouillon dans le composeur (Envoyer seul publie), les promesses repérées sous leur message, « Noter l'engagement » et « Écarter »"
status: todo
phase: P2
family: front
estimate: M
wave: 97
created: 2026-11-19
updated: 2026-11-19
depends_on: [TCK-2975, TCK-2977, TCK-2969, TCK-2972]
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models: []
tags: [front, messagerie, le-fil, copilote, ia, engagements, i18n, adr-0131]
---

## Objectif utilisateur

- **L'agent ou l'administrateur d'agence** :
  - demande un brouillon depuis ✦ du composeur, le relit avec ce sur quoi il s'appuie, le raccourcit
    ou en demande un autre, puis l'envoie ou le jette ;
  - voit sous un message la promesse qu'il contient, et la note en engagement en un geste, ou
    l'écarte.

  Rien ne part, rien ne se crée, sans ce geste.

## Contrat de données

- `POST /api/conversations/{conversation}/copilote/brouillon` `{ton?}` et `…/promesses`
  (TCK-2975), état par `GET …/copilote` et signal `copilote.updated` (le hook de TCK-2977).
- **Envoyer** : la route ordinaire `POST /api/conversations/{conversation}/messages`. Ensuite
  `PUT /api/copilote/suggestions/{id}/decision` : `accepted` si le texte est identique, sinon
  `edited` avec `final: {texte}`. « Jeter le brouillon » → `rejected`.
- **Noter l'engagement** : le formulaire « Noter un engagement » de TCK-2972, qui crée par
  `POST /api/conversations/{conversation}/commitments` (TCK-2969). Il est pré-rempli avec
  `source_message_id`, `holder_id`, `title` et `due_at` de la promesse ; l'objet est celui du fil.
  Au succès, la décision `accepted`, ou `edited` avec les champs créés s'ils diffèrent. « Écarter »
  → `rejected`.
- Les promesses se demandent **à l'ouverture du fil** par le personnel, en même temps que l'état.
  L'API n'appelle le modèle que s'il y a de nouveaux messages.

## Direction UX / Artistique

- **Référence de fidélité** : `fil-copilote`, approche **A**, écrans `brouillon` et `extraction`, à
  360 et 1280 px.
- **Le brouillon** vit dans le composeur, dans la grammaire de TCK-2977 (tirets, aplat beige,
  « Brouillon de l'assistant · relisez avant d'envoyer »).
  - « Appuyé sur : » liste ses appuis en puces (bail, paiement, engagement), chacune vers l'objet.
  - Il garde son cadre **tant qu'il n'est pas retouché**. Dès la première frappe, il devient un
    texte ordinaire du composeur, et l'étiquette disparaît.
  - Gestes : « Jeter le brouillon », « Proposer un autre brouillon », « Plus court », puis
    « Envoyer », le seul qui publie.
- **Les promesses** : le passage repéré est souligné dans la bulle. Sous le message, un bloc « Repéré
  par l'assistant » porte une carte par promesse : porteur · libellé, échéance et objet, puis
  « Noter l'engagement » et « Écarter ».
  - **Au plus un bloc par message**, replié après « Écarter ».
  - Une promesse notée laisse place à l'événement d'engagement du lot 3.
- Le montant repéré et « Ajouter au devis » de la maquette **ne sont pas livrés** : écart nommé.
- Textes en `fr` et `en`, et en `wo` le texte français tel quel (wolof en pause). Vouvoiement.

## Contraintes strictes (métier)

- **Un brouillon n'est jamais envoyé sans « Envoyer »**, ni en mode « Équipe » de la note d'équipe :
  ✦ du composeur n'est offert qu'en mode Fil.
- **Une promesse ne crée rien seule** : « Noter l'engagement » passe par la route du lot 3, qui juge
  ses droits.
- **Les blocs du copilote ne sont jamais vus d'un autre lecteur**, ni recopiés dans un message.

## Delta à produire

- [ ] ✦ dans le composeur (mode Fil seulement) et l'état du brouillon (cadre, appuis, gestes,
  retouche).
- [ ] La décision après envoi, ou au jet.
- [ ] Le soulignement et le bloc des promesses dans la bulle, « Noter l'engagement » vers la création
  du lot 3, et « Écarter ».
- [ ] Messages `fr` / `en` / `wo`.
- [ ] Tests Vitest :
  - « Utiliser » ne fait aucun `POST …/messages` ;
  - « Envoyer » tel quel → `accepted`, retouché → `edited` ;
  - ✦ absent en mode Équipe ;
  - « Écarter » → `rejected` et bloc replié ;
  - « Noter l'engagement » appelle la route du lot 3, jamais une route du copilote.

## Critères d'acceptation

- [ ] **AC1** — Relevé au navigateur sous `./dev.sh`, à 360 et 1280 px : les écrans `brouillon` et
  `extraction` de `fil-copilote` A sont fidèles à la maquette, sauf l'écart nommé du montant.
- [ ] **AC2** — Onglet réseau : aucun `POST …/messages` ni création d'engagement avant le geste
  « Envoyer » ou « Noter l'engagement ».
- [ ] **AC3** — Le locataire de la même salle ne voit ni soulignement ni bloc « Repéré », relevé avec
  deux sessions.
- [ ] **AC4** — `npm run lint`, `npx tsc --noEmit`, `check:i18n`, `check:vouvoiement` verts ; tests
  des fichiers touchés verts.

## Hors périmètre

- Le montant repéré, « Ajouter au devis ».
- L'écran des engagements et leur événement dans le fil : lot 3.
- Un brouillon de note d'équipe.

## Notes d'implémentation

_(à remplir par implementing-specs)_
