---
id: TCK-1768
title: "La pastille des messages non lus se nourrit d'une lecture étroite, plus lente hors de la messagerie"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-136--lectures-du-navigateur-au-chargement-de-la-console-app-et-super-admin"
tags: [front, messagerie, performance, pistes]
---

## Contexte

Réf : **P136.01** du fichier de pistes, `validé` (V7 accordé).

`useUnreadCount` (la pastille du widget de messagerie et de la barre latérale) lisait la liste de
la messagerie elle-même — `include=property,participants,last_message`, 30 fils — toutes les
10 s, sur toute page connectée, pour n'en garder que `meta.unread_total`.

## Décision du porteur

> porteur (2026-10-22) : l'API rend `meta.unread_total` sur `GET /api/conversations` ; hors de `/app/messages`, la pastille le lit par une lecture étroite (`per_page=1`, sans `include`) à une cadence plus lente ; la liste complète garde ses 10 s dans la seule messagerie

## Objectif utilisateur

La pastille des non-lus garde la même valeur sans recharger toute la liste des conversations
toutes les 10 s sur chaque page.

## Contrat de données

Aucun changement d'API : `GET /api/conversations` rend déjà `meta.unread_total` (TCK-1387) et
accepte `per_page=1` (`Controller::tailleDePage`).

## Contraintes strictes (métier)

- La valeur affichée reste `meta.unread_total`.
- Marquer un fil lu met la pastille à jour sans attendre son prochain tour, comme avant.

## Delta à produire

- [x] Une lecture de la pastille à elle : `per_page=1`, sans `include`, sous le préfixe de clé
  `['conversations', 'list']` que la lecture d'un fil invalide.
- [x] Cadence : 30 s hors de `/app/messages`, 10 s dans la messagerie.
- [x] Tests : URL étroite, cadences, invalidation.

## Critères d'acceptation

- [x] AC1 — hors de `/app/messages`, la pastille demande une ligne sans `include` toutes les 30 s.
- [x] AC2 — dans `/app/messages`, la même lecture étroite à 10 s ; la liste de la messagerie
  (`useConversationsInfinite`) garde ses 10 s.
- [x] AC3 — l'invalidation de `['conversations', 'list']` relit la pastille.

## Hors périmètre

- La partie API de la décision : `meta.unread_total` existe déjà (TCK-1387).
- `useConversations` (30 fils avec `include`), qui n'a plus d'appelant de production : son retrait
  est laissé à part (des tests le lisent encore).
- L'`include` ignoré par `ConversationController::index`, qui charge ses relations quel que soit
  le paramètre (P100.05) : la lecture étroite tient à `per_page=1`.

## Notes d'implémentation

- Hypothèse (la décision dit « plus lente » sans chiffre) : 30 s, la cadence de la cloche des
  notifications (`NotificationBell`), l'autre pastille de la même barre.
- Dans `/app/messages`, la pastille garde la lecture étroite à 10 s plutôt que de relire la liste
  complète : la messagerie lit déjà la sienne par `useConversationsInfinite`.
- Ablation : `useUnreadCount.ts` rendu à `HEAD` → 2 rouges sur 4 (URL avec `include`, 30 fils) ;
  correctif remis → 4/4 verts.
