---
id: TCK-1090
title: "Gardes d'accès : un délai posé par `AbortSignal.timeout` est une panne, pas un bug"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#22-rôles--permissions"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-79--appels-du-serveur-next-vers-lapi-sans-délai"
tags: [front, access, resilience, pistes]
---

## Contexte

Réf : **P79.05** du fichier de pistes, `retenu · autonome` (A1 : `estPanneReseau` range déjà les
délais d'undici, `UND_ERR_HEADERS_TIMEOUT` et `UND_ERR_CONNECT_TIMEOUT`, parmi les pannes).

`estPanneReseau` (`src/lib/access/server-guards.ts`) n'accepte qu'un `TypeError`. Un `fetch` borné
par `AbortSignal.timeout` rejette avec une `DOMException` `TimeoutError` : la garde la relancerait
comme un bug au lieu de renvoyer vers `/verification-indisponible`. Aucun appel serveur ne pose ce
délai aujourd'hui (P79.01, à valider) : le correctif prépare la borne sans la poser.

## Objectif

Une `TimeoutError` reçoit le verdict `explique`, comme les délais d'undici.

## Contrat de données

Aucun.

## Contraintes strictes

- `AbortError` reste un bug : un abandon voulu porte le même nom, et le mesureur l'a sorti du
  correctif autonome.
- **Hypothèse** : P79.01 (la borne elle-même) n'est pas un prérequis ; la piste demandait le même
  ticket, mais P79.01 attend le porteur, et ce correctif ne change rien tant qu'aucun délai n'est
  posé.

## Delta à produire

- [x] `estPanneReseau` reconnaît `name === 'TimeoutError'`.
- [x] Deux cas dans `server-guards.test.ts` : la raison réelle d'un `AbortSignal.timeout` →
      `/verification-indisponible` ; une `DOMException` `AbortError` → relancée.

## Critères d'acceptation

- [x] AC1 — `ensureStandardAgencyOrRedirect` renvoie vers `/verification-indisponible` quand
      `fetchAgency` rejette avec la raison d'un `AbortSignal.timeout`.
- [x] AC2 — Une `AbortError` est relancée, sans redirection.
- [x] AC3 — Les cas existants de `server-guards.test.ts` restent verts.

## Hors périmètre

- La borne des appels serveur (P79.01 à P79.04, à valider).

## Notes d'implémentation

- Le test prend la raison d'un vrai `AbortSignal.timeout(1)` plutôt qu'une erreur construite : c'est
  ce que `fetch` rejette.
- Ablation : `server-guards.ts` rendu à `HEAD` → 1 rouge (la `TimeoutError` relancée comme bug) ;
  correctif remis → 19/19 verts, 71/71 sur `src/lib/access`.
