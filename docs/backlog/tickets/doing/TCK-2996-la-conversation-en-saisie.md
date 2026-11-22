---
id: TCK-2996
title: La conversation ouverte au téléphone se cale sur le clavier
status: doing
phase: P2
family: front
estimate: S
wave: null
created: 2026-11-22
updated: 2026-11-22
depends_on: [TCK-2988]
blocks: []
spec_refs:
  features: []
  models: []
tags: [front, mobile, clavier, messagerie, adr-0133]
---

## Objectif utilisateur

Un agent qui répond à un client depuis son téléphone voit, en tapant, le dernier message, le composeur et le choix
« Équipe » — au lieu d'un composeur caché sous le clavier.

## Contrat de données

Aucun.

## Direction UX / Artistique

ADR-0133, amendement du 2026-11-22, § 8 et 9 (« Nouvelle conversation »).

## Delta

- `MessagesPage` : s'abonne à la mesure sous `lg` (la route est en boîte, la coque ne le fait pas) ; le cadre de la
  conversation ouverte porte `data-cadre-de-conversation`.
- `globals.css` (sous `md`) : en saisie, le cadre calé sur la fenêtre visible, l'en-tête du fil en 44 px, les puces du
  pont et le bandeau de l'objet repliés.
- `ChatView` : le fil reste collé en bas quand il rétrécit.
- `NouvelleConversation` : sous `lg`, calée sur la fenêtre visible en saisie, en-tête en 44 px.

## Critères d'acceptation

- [x] AC1 — En émulation 390 × 844 (clavier de 336 px) : cadre 0-508, en-tête 0-44, composeur 367-508, fil collé en bas
      (écart 0) ; avec un décalage de 150 px, cadre 150-658 ; clavier fermé, cadre 0-844 et en-tête de 56 px.
- [x] AC2 — Le choix « Équipe » et les réponses rapides restent visibles en saisie.
- [x] AC3 — Tests (marque du cadre, abonnement, règles de `globals.css`), vérifiés par ablation.
- [ ] AC4 — Sur l'iPhone du porteur : dans une conversation, le composeur suit le clavier et le dernier message reste
      au-dessus.

## Reste sur dev

- **AC4** : la vérification sur l'iPhone du porteur (ADR-0133 : le téléphone juge la géométrie du clavier). Le
  code est fusionné ; le ticket passe `done` une fois le constat écrit ici.
