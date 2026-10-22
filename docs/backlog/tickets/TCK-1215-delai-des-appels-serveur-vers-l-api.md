---
id: TCK-1215
title: "Les appels du serveur Next vers l'API portent un délai : 30 s, 90 s pour un envoi de fichier"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-79--appels-du-serveur-next-vers-lapi-sans-délai"
tags: [front, resilience, pistes]
---

## Contexte

Réfs : **P79.01** et **P79.03** du fichier de pistes, toutes deux `validé`. P79.03 n'a pas de
correctif propre : elle tient à la borne de P79.01, et partage ce ticket.

`apiFetch` et `apiRequest` (`src/lib/api.ts`) appellent `fetch` sans délai côté serveur : sur une
API qui accepte la connexion sans répondre, une page, une action serveur ou une fiche publique
attend jusqu'au `headersTimeout` d'undici (300 s mesurés), au lieu de rendre l'état
« indisponible » prévu (`getProperty`, `server-guards`).

## Décision du porteur

P79.01 : « validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

P79.03 : « validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V7 (dernier classement du mesureur). Le délégué avait relevé V2 (la borne
s'applique à `login`, `register`) et V5 (la valeur dépend des délais de l'API, de Traefik et de
Cloudflare) **avant** la validation du porteur, en les lui soumettant : ils sont tenus pour
accordés avec elle. Aucun chemin fermé n'est touché (ni variable d'environnement, ni `deploy/`).

### Choix de l'implémenteur, écrits ici comme la validation le demande

- **Valeur : 30 s** côté serveur, celle que recommande la ligne du délégué (« aligné sur la borne
  de l'API et sous les 100 s de Cloudflare, par exemple 30 s »). Une constante exportée,
  `DELAI_API_SERVEUR_MS`, pas une variable d'environnement (V5).
- **Côté serveur seulement** (`typeof window === 'undefined'`) : la piste vise le serveur Next, et
  le navigateur garde son comportement.
- **Envoi de fichier** : la piste demande « une valeur plus longue ou une option » pour les
  téléversements. `apiRequest` avec `formData: true` prend **90 s** (`DELAI_API_SERVEUR_ENVOI_MS`),
  sous les 100 s de Cloudflare ; aucune option par appel n'est ajoutée, faute d'appelant qui en ait
  besoin. Les relais d'export, de téléversement KYC et de téléchargement font un `fetch` direct et
  relèvent de P79.04 (TCK-1219).
- **Combinaison** : `AbortSignal.any([signal de l'appelant, AbortSignal.timeout(N)])`, comme la
  piste l'écrit. La `TimeoutError` qui en sort est déjà classée « panne » par `server-guards`
  (TCK-1090, P79.05).

## Objectif

Une API figée rend, sous 30 s, l'état d'erreur que le front prévoit déjà, au lieu d'attendre 300 s.

## Contrat de données

Aucun.

## Delta à produire

- [x] `src/lib/api.ts` : `DELAI_API_SERVEUR_MS`, `DELAI_API_SERVEUR_ENVOI_MS`, et un signal borné
      posé par `apiFetch` et `apiRequest` côté serveur.
- [x] Test vitest (environnement node) : un `fetch` qui ne se résout jamais rejette sous la borne,
      pour `apiFetch` et `apiRequest` ; le signal de l'appelant reste honoré ; 90 s demandées pour
      un `formData`.
- [x] Test de `getProperty` : une API figée rend `indisponible` (P79.03).

## Critères d'acceptation

- [x] AC1 — `apiFetch` et `apiRequest` côté serveur passent à `fetch` un signal qui s'abandonne au
      bout de `DELAI_API_SERVEUR_MS`.
- [x] AC2 — Un abandon par le signal de l'appelant abandonne toujours l'appel.
- [x] AC3 — `getProperty` rend `{ etat: 'indisponible' }` sur une API qui ne répond pas.

## Hors périmètre

- Les relais `src/app/api/**` à `fetch` direct (P79.04, TCK-1219) et la mise en page racine
  (P79.02, TCK-1217).
- La mesure par un rendu `next start` contre une API figée : non lancée.

## Notes d'implémentation

- Le test n'attend pas 30 s : `AbortSignal.timeout` est épié, la valeur demandée relevée, et un
  délai de 5 ms rendu à sa place ; le faux `fetch` ne rejette qu'à l'abandon de son signal, comme
  undici contre une API figée.
- Un signal posé sur un `fetch` mis en cache par Next n'entre pas dans la clé du cache (lu,
  `next/dist/server/lib/patch-fetch.js`, liste des champs de `RequestInit` recopiés) : la fiche
  partagée garde son cache.
- Ablation : `src/lib/api.ts` rendu à `HEAD` → 5 rouges sur 6 (« toujours en attente après
  1000 ms », constantes absentes) ; correctif remis → 6/6 verts.
