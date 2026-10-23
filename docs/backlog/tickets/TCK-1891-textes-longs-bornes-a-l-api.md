---
id: TCK-1891
title: "Avis, réponses, messages et notes de client bornés à l'API comme au front"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#111-avis--réputation"
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#16-crm--relation-client"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-195--seuils-de-saisie-recopiés-en-constantes-du-front-face-à-la-règle-de-lapi"
tags: [back, validation, pistes]
---

## Objectif utilisateur

Un appel direct ne peut plus écrire un avis public, un message ou une note de client de plusieurs
mégaoctets que chaque liste relit ensuite en entier ; rien de ce qu'un écran envoie ne change.

## Contexte

Réf : **P195.04** du fichier de pistes, `validé (délégué)`. Le mesureur a posté 100 000
caractères en premier message et en message : 201.

## Décision du porteur (déléguée)

> poser à l'API la borne la plus large déjà en vigueur pour chaque champ, sans rien refuser de ce qu'un écran envoie aujourd'hui : `max:2000` sur `content` des avis de bien et d'agence (`StoreForPropertyReviewRequest`, `StoreForAgencyReviewRequest`) et sur `reply_content` (`ReplyReviewRequest`), `max:5000` sur `content` de `SendMessageConversationRequest` et `initial_message` de `StoreConversationRequest` (comme `CreateGroupConversationRequest`), `max:5000` sur `body` de `StoreCustomerNoteRequest` ; un test par champ, borne + 1 → 422 et rien d'écrit ; reste : l'avis d'agent et de prestataire (5000 à l'API, 2000 au front), les seuils des écrans (P195.05) et le test de parité (P195.10)

## Reste à faire

l'avis d'agent et de prestataire (5000 à l'API, 2000 au front), les seuils des écrans (P195.05) et le test de parité (P195.10)

## Hypothèses (mode sans humain)

- Chaque test vérifie aussi que la borne elle-même passe, pour garder la promesse « sans rien
  refuser de ce qu'un écran envoie ».
- Le message de validation est celui de Laravel (`validation.max.string`), sans texte neuf.

## Delta à produire

- [x] `max:2000` sur `content` (`StoreForPropertyReviewRequest`, `StoreForAgencyReviewRequest`) et
      `reply_content` (`ReplyReviewRequest`).
- [x] `max:5000` sur `content` (`SendMessageConversationRequest`), `initial_message`
      (`StoreConversationRequest`) et `body` (`StoreCustomerNoteRequest`).
- [x] `tests/Feature/Validation/TextesLongsBornesTest.php`.

## Critères d'acceptation

- [x] AC1 — Pour chacun des six champs, borne + 1 → 422 sur le champ, et rien d'écrit.
- [x] AC2 — Pour chacun, la borne exacte passe.

## Hors périmètre

- Les seuils des écrans du front (P195.05).

## Notes d'implémentation

- Ablation : les six bornes retirées → 6 rouges (201 ou 200 au lieu de 422) ; remises → 6 verts.
