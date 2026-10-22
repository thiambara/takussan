---
id: TCK-1408
title: "Les actions serveur de la fiche reçoivent la clé d'idempotence du composant client : le message de la fiche ne s'écrit qu'une fois"
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

Réf : **P144.07** du fichier de pistes, `validé` par le porteur. Depuis TCK-1215 (P79.01), le serveur Next abandonne un appel d'`apiRequest` à 30 s : une écriture finie après la borne est rendue comme un échec, et le visiteur la rejoue. Le premier message envoyé depuis la fiche (`contact-message`) s'écrivait alors deux fois.

## Décision du porteur

> validé — porteur (2026-10-22) : ADR-0072, lot 3 : les actions serveur de `property.ts` reçoivent la clé du composant client, une par soumission, plutôt qu'un délai plus long

## Objectif

Chaque action serveur d'écriture de la fiche reçoit la clé de son composant client et l'envoie telle quelle ; ce ticket l'applique au message de la fiche, après la réservation et l'offre (TCK-1406).

## Delta à produire

- [x] `public.properties.contact-message` porte `idempotent`, ajoutée à `IdempotentRoutesTest`.
- [x] `submitContactMessage` reçoit `cleIdempotence` et l'envoie telle quelle.
- [x] `useContactMessage` (dialogue de la fiche) et `PropertyDraftChatView` (fil neuf) engendrent la clé par `useCleIdempotence` et la renouvellent sur succès.
- [x] Tests : `tests/Feature/Idempotence/MessageDeLaFicheRejoueTest.php`, `property.idempotence.tck-1406.test.ts` (cas TCK-1408), `useContactMessage.idempotence.tck-1408.test.ts`, `PropertyDraftChatView.test.tsx` (cas TCK-1408).

## Critères d'acceptation

- [x] AC1 — Deux envois du même message de la fiche sous la même clé, à 30 s d'écart : un message, le même fil rendu.
- [x] AC2 — L'action envoie la clé reçue telle quelle d'un essai à l'autre.
- [x] AC3 — Le dialogue et le fil neuf gardent la clé après un échec.

## Hors périmètre

- Aucun délai plus long pour les écritures (décision du porteur).
- La demande de visite : rapprochement par (visiteur, bien, créneau), sans la clé (ADR-0072 § 8, TCK-1410).
- `contact-lead` du bien et de l'agent : TCK-1410 (P144.08).
- Signalements et avis : hors des lots (P144.09, caduc).

## Notes d'implémentation

- Ablation : route sans `idempotent` → `MessageDeLaFicheRejoueTest` rouge (2 messages) ; action sans en-tête → 1 rouge, clé non passée par `useContactMessage` → 1 rouge, par `PropertyDraftChatView` → 1 rouge ; remis → verts.
