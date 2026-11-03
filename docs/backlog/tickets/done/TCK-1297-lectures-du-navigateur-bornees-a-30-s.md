---
id: TCK-1297
title: "Les lectures du navigateur vers l'API sont bornées à 30 s"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1295]
blocks: []
spec_refs:
  features:
    - "docs/features.md#28-internationalisation--préférences"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-113--appels-du-navigateur-vers-lapi-sans-délai"
tags: [front, network, pistes]
---

## Contexte

Réf : **P113.01** du fichier de pistes, `validé (délégué)` (V7 accordé).

Décision du porteur (déléguée) : borne de 30 s sur les seules lectures (`GET`) d'`apiRequest` côté navigateur, par `AbortSignal.any([signal de l'appelant, AbortSignal.timeout(30 s)])`, la valeur de `DELAI_API_SERVEUR_MS` (TCK-1215), livrée avec P113.04 pour que le délai s'affiche comme une panne réseau ; reste : les écritures (`useApiMutation`, `useMutation`), les téléversements et les 39 `fetch` directs, à décider avec P144.07

Reste à faire : les écritures (`useApiMutation`, `useMutation`), les téléversements et les 39 `fetch` directs, à décider avec P144.07

`apiRequest` ne passe à `fetch` que le signal de l'appelant dans le navigateur, et Chrome ne borne
rien lui-même (12 min mesurées par l'explorateur sans réponse ni rejet) : une lecture figée tient
un écran en chargement, ou suspend une interrogation périodique (P113.02), tant que la page vit.

## Objectif utilisateur

Une lecture sans réponse finit en panne réseau affichée au bout de 30 s, au lieu d'un chargement
sans fin.

## Contrat de données

Aucun changement d'API. Le délai rejette en `TimeoutError`, que `messageErreurApi` affiche comme
une panne réseau (TCK-1295).

## Delta à produire

- [x] `apiRequest`, dans le navigateur : `GET` hors `formData` → `AbortSignal.any([signal de
  l'appelant, AbortSignal.timeout(DELAI_API_SERVEUR_MS)])` ; toute autre méthode → le signal de
  l'appelant tel quel.
- [x] Test : lecture figée rejetée à 30 s, signal de l'appelant toujours souverain, écriture et
  envoi de fichier sans borne.

## Critères d'acceptation

- [x] AC1 — Une lecture contre une API figée rejette en `TimeoutError`, au délai de 30 s.
- [x] AC2 — L'abandon par l'appelant abandonne toujours la lecture.
- [x] AC3 — Un `POST` et un envoi `formData` ne demandent aucune borne.

## Hors périmètre

- Le reste ci-dessus, gardé par le porteur.
- Côté serveur, inchangé (TCK-1215).

## Notes d'implémentation

- Le réessai par défaut de TanStack (une fois hors 4xx) peut doubler l'attente d'une lecture de
  `useApiQuery` : la décision ne le touche pas.
- Le cas « écriture sans borne » est vert sans correctif : il garde le périmètre de la décision.
- Ablation : `api.ts` rendu à `HEAD` → 1 rouge sur 4 (lecture toujours en attente après 1 s) ;
  correctif remis → 4/4 verts. Voisins verts : `api.test.ts`, `api.content-type`,
  `api.identifiant-de-requete.navigateur`, `api-relais-impersonation`, `api.agent-du-visiteur`,
  `api.delai-serveur`, et cinq tests qui assertent la forme d'un appel `fetch` (KYC, audit,
  confidentialité, lien de paiement, rapports).
