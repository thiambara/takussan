---
id: TCK-1121
title: "La garde de `/app` garde la chaîne de requête dans `redirect` : le lien d'un courriel ouvert hors session survit à la connexion"
status: done
phase: P1
family: bug
estimate: S
wave: null
created: 2026-10-21
updated: 2026-10-21
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#23-notifications"
    - "docs/features.md#17-communication--messagerie"
  models: []
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-97--liens-daction-des-courriels--page-visée-authentification-hôte"
tags: [front, auth, proxy, notifications, pistes]
---

## Contexte

Réf : **P97.02** du fichier de pistes, `retenu · autonome` (A1 : la cible `conversation` de
`NotificationTarget` et `MessagesPage`, qui lit `?conversation=`, fixent la destination attendue).

Sans jeton, `src/proxy.ts` renvoyait vers `/auth/login` avec `redirect` = le seul `pathname`. Un
lien `/app/messages?conversation=42` ouvert hors session menait, après connexion, à la liste des
messages sans la conversation annoncée ; de même `?lead=` (TCK-1120).

## Objectif utilisateur

La personne qui clique le lien d'un courriel sans être connectée arrive, après connexion, sur la
page exacte que le courriel annonçait.

## Contrat de données

Aucun endpoint.

## Contraintes strictes (métier)

- La vérification du jeton est inchangée.
- Le retour reste filtré par `destinationInterne` (redirection ouverte refusée), qui garde déjà
  `pathname + search + hash`.

## Delta à produire

- [x] `src/proxy.ts` : `redirect` = `pathname` + `request.nextUrl.search`.
- [x] `src/__tests__/proxy.test.ts` : trois chemins avec requête.

## Critères d'acceptation

- [x] AC1 — `/app/messages?conversation=42` sans jeton → 307 `/auth/login`, `redirect` =
      `/app/messages?conversation=42`.
- [x] AC2 — idem pour `/app/leads?lead=7` et une requête à plusieurs paramètres encodés.
- [x] AC3 — les cas existants sans requête rendent toujours `redirect` = le chemin.

## Hors périmètre

- La console super-admin, gardée par sa mise en page et non par le proxy : P97.03 (au porteur).
- Le paramètre mort `cancel-deletion=1` : P97.07.

## Notes d'implémentation

- Ablation : `src/proxy.ts` rendu à `HEAD` → 3 rouges sur 3 (`redirect` = le chemin seul) ;
  correctif remis → 39/39.
