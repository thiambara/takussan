---
id: TCK-1992
title: "refreshUser() ne ferme la session que sur un 401, et n'applique que la réponse de la dernière demande"
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
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-172--lectures-du-navigateur-faites-par-fetch-dans-un-useeffect-hors-de-tanstack-query"
tags: [front, auth, session, pistes]
---

## Contexte

Réfs : **P172.01**, **P172.03**, **P172.06** du fichier de pistes, `validé`.

Le relais `GET /api/auth/me` rendait 401 pour toute exception de `getMe` (API en 503, en 500,
injoignable). `refreshUser` lisait ce 401 comme une session morte : `setUser(null)` puis
`POST /api/auth/logout`, qui révoque le jeton et efface les cookies. Un changement de profil sur
une API en panne déconnectait donc pour de bon. `refreshUser` n'avait ni rang ni annulation : deux
appels aux réponses inversées laissaient le compte de la première demande. La lecture initiale de
`/api/auth/me` d'`AuthProvider` (second essai à 500 ms puis déconnexion) ne s'exécutait que sous
`initialUser === undefined`, ce que le seul monteur (`app/layout.tsx`) ne passe jamais.

## Décision du porteur

- P172.01 : « validation du porteur (2026-10-23) : la piste telle qu'écrite ; `refreshUser` garde l'utilisateur sur toute erreur autre que 401 ; même ticket que P172.03 ; la lecture morte d'`AuthProvider` part avec »
- P172.03 : « validation du porteur (2026-10-23) : la piste telle qu'écrite, avec P172.01 »
- P172.06 : « validation du porteur (2026-10-23) : corriger le commentaire d'`initialDrafts` ; le retrait de la lecture d'`AuthProvider` part avec P172.01 »

## Objectif utilisateur

Une API lente, en panne ou injoignable ne déconnecte plus l'utilisateur ; l'écran montre le compte
du dernier profil demandé.

## Contrat de données

Le relais `GET /api/auth/me` (BFF) rend désormais : 401 sans cookie ou sur un 401 de l'API ; le
statut de l'API pour toute autre `ApiError` ; 503 quand l'API ne répond pas. Aucun changement côté
Laravel.

## Contraintes strictes (métier)

- Seul un 401 ferme la session dans `refreshUser` (utilisateur nul et `POST /api/auth/logout`).
- Toute autre erreur, ou un relais injoignable, garde l'utilisateur en place.
- Seule la réponse de la dernière demande s'applique ; une réponse arrivée après `logout()` est
  ignorée.

## Delta à produire

- [x] `app/api/auth/me/route.ts` : statut de l'`ApiError`, 503 sur une panne sans réponse.
- [x] `AuthContext` : `refreshUser` à rang de demande, 401 seul déconnecte ; `logout` avance le rang
  et remet `isLoading` à faux.
- [x] `AuthContext` : retrait de la lecture initiale morte (`isLoading` faux au départ).
- [x] `WizardDraftsBanner` : commentaire d'`initialDrafts` corrigé (sert aux tests, l'accueil ne la
  passe pas).
- [x] Tests vitest du relais et d'`AuthProvider`.

## Critères d'acceptation

- [x] AC1 — `getMe` en `ApiError` 503, 500 ou 403 → le relais rend ce statut ; `TypeError` → 503 ;
  `ApiError` 401 → 401.
- [x] AC2 — `refreshUser` sur un relais en 503, 502, 500, 403, 429 ou injoignable : utilisateur
  conservé, aucun `POST /api/auth/logout`.
- [x] AC3 — `refreshUser` sur un 401 : utilisateur nul et un `POST /api/auth/logout`.
- [x] AC4 — deux `refreshUser()` aux réponses inversées : la dernière demande l'emporte.
- [x] AC5 — une réponse arrivée après `logout()` ne remet pas d'utilisateur.

## Hors périmètre

- La branche d'impersonation du relais : un échec de `getMe` sur le jeton de la cible, panne
  comprise, efface encore la session d'impersonation (`effacerLaSession`). Non relevé par l'angle.
- Une relecture en vol au moment d'`openSession` n'est pas périmée par lui (seul `logout` l'est,
  comme le demande la `Piste`).
- Le bandeau des brouillons lu côté serveur (option écartée par la décision de P172.06).

## Notes d'implémentation

- Hypothèse : une `ApiError` de statut inférieur à 400 (improbable) est traitée comme une panne
  (503).
- Le rang protège aussi `isLoading` : une réponse périmée ne le remet plus à faux pendant que la
  dernière demande est en vol.
- Ablation : `AuthContext.tsx` et `route.ts` rendus à `HEAD` → 12 rouges sur 15 ; correctif remis
  → 15/15 verts.
