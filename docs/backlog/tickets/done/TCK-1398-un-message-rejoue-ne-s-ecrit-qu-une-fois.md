---
id: TCK-1398
title: "Un message rejoué sous la même clé ne s'écrit qu'une fois, notes vocales comprises"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1396]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-144--écritures-du-navigateur-quune-réponse-perdue-invite-à-rejouer"
  adr:
    - "docs/adr/0072-une-cle-d-idempotence-commune-pour-les-ecritures-rejouees.md"
tags: [api, web, messaging, idempotence, pistes]
---

## Contexte

Réf : **P144.02** du fichier de pistes, `validé` par le porteur. Deux `POST
/api/conversations/{id}/messages` identiques écrivaient deux messages ; `ChatView` garde le texte
après une erreur et le renvoie d'un clic.

## Décision du porteur

> validé — porteur (2026-10-22) : ADR-0072, lot 1 : la clé sur les messages, notes vocales comprises, sans `client_id` propre

## Objectif

Le message renvoyé après une réponse perdue rend le premier au lieu d'en écrire un second.

## Delta à produire

- [x] `conversations.messages.store` porte `['throttle:conversation-message', 'idempotent']`.
- [x] `useSendMessage` et `useSendVoiceNote` passent `idempotence: true` (TCK-1396).
- [x] `tests/Feature/Routes/IdempotentRoutesTest.php` (la liste écrite d'ADR-0072, qui naît ici),
      `tests/Feature/Idempotence/MessageRejoueTest.php`,
      `src/lib/queries/__tests__/conversations.idempotence.tck-1398.test.tsx`.

## Critères d'acceptation

- [x] AC1 — Deux envois du même texte sous la même clé, à 30 s d'écart : un message, le même `id` rendu.
- [x] AC2 — Même chose pour une note vocale (`multipart`).
- [x] AC3 — Sans clé, deux envois écrivent deux messages, comme avant.
- [x] AC4 — Les deux hooks demandent l'option.

## Hors périmètre

- Aucun `client_id` sur le message (décision du porteur).

## Notes d'implémentation

- Ablation : route sans `idempotent` → `MessageRejoueTest` 2 rouges sur 3 (deux messages écrits),
  `IdempotentRoutesTest` rouge ; option retirée des hooks → 2 rouges vitest ; remis → verts.
- `mergeNewMessages` dédoublonne par `id` : le message rejoué ne s'affiche pas deux fois.
