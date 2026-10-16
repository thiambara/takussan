---
id: TCK-683
title: "La messagerie n'offre plus de pièce jointe : le trombone postait vers une route absente"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-16
updated: 2026-10-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  pistes:
    - docs/plans/2026-10-15-pistes-d-amelioration.md#angle-13--code-mort-et-doublons
tags: [front, messagerie, pistes]
---

## Contexte

Réf : **P13.03** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

Le trombone du composeur (`ChatView`) postait le fichier choisi sur
`/api/conversations/{c}/messages/{m}/attachments`, après l'envoi du texte. Aucune route de l'API
ne contient `attach` (`php artisan route:list --path=conversations` : 17 routes) ;
`ConversationController::sendMessage` n'accepte que la note vocale. Le texte partait, le fichier
échouait sur « L'envoi du fichier a échoué. Réessayez. ». Le hook `useUploadAttachment` visait la
même route, sans appelant.

## Décision du porteur

retirer le trombone pour l'instant

## Objectif

Le composeur n'offre plus un geste qui échoue toujours, et plus aucun code du front ne vise la
route absente.

## Delta à produire

- [x] `ChatView.tsx` : retrait du trombone (label, `input type="file"`), de `uploadAttachment`,
      `handleFilePicked`, de l'état `attachmentError` / `uploading` et des imports devenus morts.
      La note vocale reste dans `leading`.
- [x] `conversations.ts` : retrait de `useUploadAttachment` et de `UploadAttachmentPayload`, sans
      appelant.
- [x] Test `src/components/messages/__tests__/ChatView.test.tsx`.

## Critères d'acceptation

- [x] AC1 — `ChatView` ne rend ni « Joindre un fichier » ni `input[type="file"]`.
- [x] AC2 — Aucun fichier `.ts`/`.tsx` de `src/` (hors `__tests__`) ne contient un chemin
      `messages/${…}/attachments`.
- [x] AC3 — Les pièces jointes déjà reçues (`message.attachments`) et la note vocale s'affichent
      comme avant : leur rendu n'est pas touché.

## Hypothèses (mode sans humain)

- « Retirer le trombone » vaut pour le seul composeur de `ChatView` : `PropertyDraftChatView` n'en
  avait pas. L'affichage des pièces jointes reçues reste, car la note vocale en est une.
- `isAllowedAttachment` (`src/lib/schemas/message.ts`) et les clés `chat.attachAria`,
  `chat.uploadFailed`, `chat.attachmentRejected` sont laissés en place : ils serviront au retour
  du trombone, que la décision annonce (« pour l'instant »).

## Hors périmètre

- `docs/features.md` § 1.7 annonce toujours « Envoyer un message texte avec pièces jointes » : la
  spec est fermée à l'implémenteur, à faire converger par `/sync-specs` ou le porteur.
- Une voie d'envoi de fichier côté API (l'autre option de la `Piste`) n'est pas ouverte.

## Notes d'implémentation

- Ablation : le correctif retiré (`ChatView.tsx` et `conversations.ts` remis à `pre-dev`), les
  deux tests rougissent — le premier trouve le `<label aria-label="Joindre un fichier">`, le second
  nomme `components/messages/ChatView.tsx` et `lib/queries/conversations.ts`. Correctif remis :
  2/2 verts.
- Le second test est une garde de source plutôt qu'un rendu : sans `input` de fichier, aucun rendu
  ne peut plus déclencher l'envoi, et un test de rendu serait vert sans le correctif.
