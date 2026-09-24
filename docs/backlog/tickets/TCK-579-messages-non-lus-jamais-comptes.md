---
id: TCK-579
title: "Messagerie : la pastille des messages non lus restait à 0 — l'API ne comptait rien, et le front ne marquait jamais un fil lu"
status: done
phase: P1
family: bug
estimate: S
wave: 69
created: 2026-09-24
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#17-communication--messagerie
  models:
    - docs/models-spec.md
tags: [back, front, messagerie, non-lus]
---

## Objectif utilisateur

Quelqu'un qui reçoit un message le voit : la pastille de « Messagerie » et celle de la bulle de
discussion comptent les messages non lus, la conversation concernée est en gras avec son compteur,
et tout redescend dès qu'il a ouvert le fil.

## Contexte — relevé par la session le 2026-09-24

Remonté par la vérification de TCK-576 (« la liste ne charge jamais `participants`, et l'API ne
produit jamais `unread_count` »), puis **mesuré** :

- `grep -rn unread takussan-api/app` → aucune production de `unread_count`, un seul commentaire.
  `GET /api/conversations` chargeait `property` et rien d'autre : l'`include=participants` du front
  était ignoré (le contrôleur n'emprunte pas `HasQueryBuilder`).
- Le front, lui, lit les deux : `useUnreadCount` somme `conversation.unread_count` sur les fils où
  la ligne de l'utilisateur existe et n'est pas en sourdine ; `ConversationList` affiche le
  compteur, le gras, l'icône de sourdine et le nombre de membres d'un groupe. **Tout valait 0 ou
  rien**, quel que soit le nombre de messages reçus.
- Second défaut, masqué par le premier : `PUT /api/conversations/{id}/read` existe et **n'était
  appelé nulle part** (`grep -rn "/read" src` côté front : seules les notifications). `last_read_at`
  n'avançait qu'en ÉCRIVANT. Rendre `unread_count` sans corriger cela aurait laissé « non lu » pour
  toujours tout fil lu sans réponse.

C'est la ligne P1 « Liste des conversations avec statut non lu » de `docs/features.md` §1.7.

## Ce qui est fait

- **API** — `ConversationController::index` charge `participants` (avec leur avatar) et compte, par
  sous-requête, `unread_count` : les messages d'un AUTRE, postérieurs au `last_read_at` du lecteur
  (tous s'il n'a jamais lu), **hors avis système** et hors messages supprimés. La clé n'est rendue
  que là où elle est calculée (`whenHas`).
- **Front** — `useMarkConversationRead` (`src/lib/queries/conversations.ts`), branché dans
  `ChatView` : `PUT /read` à l'ouverture du fil puis à chaque message plus récent, **onglet visible
  seulement**, un appel par couple (fil, dernier message), et la liste est invalidée pour que la
  pastille suive.

## Critères d'acceptation

- [x] Un message reçu compte 1 pour le destinataire, 0 pour son auteur ; `PUT /read` le ramène à 0 ;
      un message arrivé après la lecture recompte ; répondre marque lu —
      `tests/Feature/Api/ConversationUnreadCountTest.php`.
- [x] Un avis système et un message supprimé ne comptent pas (même classe).
- [x] La liste rend les participants, et la sourdine du seul lecteur (même classe).
- [x] Le fil ouvert est marqué lu une fois par nouveau message, jamais onglet caché ni fil vide —
      `src/lib/queries/__tests__/marquer-conversation-lue.test.tsx` (3 tests).
- [x] Ablation : sans le compte ni le chargement des participants, les 3 tests API rougissent ;
      sans le filtre des avis système, le second rougit seul.

## Hors périmètre

- Les accusés de lecture individuels (P2, §1.7) : aucun écran ne les affiche.
- Le temps réel : la liste reste sondée toutes les 10 s (`useConversations`).
