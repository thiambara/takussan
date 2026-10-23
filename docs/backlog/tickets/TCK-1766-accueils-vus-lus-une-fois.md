---
id: TCK-1766
title: "Les accueils vus se lisent une fois par chargement de la coque, et le marqueur d'agence vient du layout"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#21-authentification--comptes"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-136--lectures-du-navigateur-au-chargement-de-la-console-app-et-super-admin"
tags: [front, accueil, performance, tanstack, pistes]
---

## Contexte

Réf : **P136.03** du fichier de pistes, `retenu · autonome` (A2). Pris dans le lot de l'angle 172
par famille : la piste cite `MinimalProfileTriggerProvider.tsx`, comme P172.04.

Quatre lecteurs appelaient chacun `fetch('/api/me/welcome-seen')` dans leur effet, hors de
TanStack Query (`useWelcomeOnce`, `useTenantWelcomeOnce`, `useAgencyStandardWelcomeOnce`,
`MinimalProfileTriggerProvider`) : trois lectures identiques à chaque chargement de `/app` pour un
client seul. `useAgencyStandardWelcomeOnce` relisait en plus `GET /api/agencies/{id}` en entier
pour `kind` et `metadata.welcome.standard_unlocked_at`, que le layout `/app` vient de lire.

## Objectif utilisateur

Les fenêtres de bienvenue s'ouvrent dans les mêmes cas qu'avant, pour une seule lecture des
accueils vus par chargement, et sans relire l'agence.

## Contrat de données

Aucun changement d'API. `GET /api/agencies/{id}` (`AgencyController::show`) rend toute
`AgencyResource`, `metadata` comprise : la lecture du layout porte déjà le marqueur.

## Contraintes strictes (métier)

- Quelle fenêtre s'ouvre, et quand, ne change pas ; ni la règle d'échec de chaque lecteur (ne rien
  ouvrir ; la feuille de profil minimal tient une lecture en échec pour « vue »).
- Une fenêtre fermée ne se rouvre pas pour un lecteur monté plus tard.
- Le marqueur d'une autre agence que celle du profil actif n'ouvre rien.

## Delta à produire

- [x] Un lecteur partagé des accueils vus : une entrée de cache par compte, une lecture par
  chargement, la clé écrite ajoutée à l'entrée à la fermeture.
- [x] Les quatre lecteurs passent par lui.
- [x] Le layout `/app` passe à la coque le marqueur d'accueil de l'agence ; l'assistant de
  l'administrateur ne relit plus l'agence.
- [x] Tests : une lecture pour un client seul ; aucune lecture de l'agence ; le marqueur du layout.

## Critères d'acceptation

- [x] AC1 — client seul : parcours client, feuille de profil minimal et parcours locataire font une
  seule lecture de `/api/me/welcome-seen`.
- [x] AC2 — administrateur d'agence : l'assistant s'ouvre sur le marqueur du layout, sans
  `GET /api/agencies/{id}`.
- [x] AC3 — le layout passe `{ agencyId, unlockedAt }` (date pour une agence `standard`, `null`
  sinon), et rien quand l'agence n'a pas pu être lue.

## Hors périmètre

- La file des fenêtres de P101.03 (TCK-1477), au même endroit, inchangée.
- Les lectures des favoris (P136.05) et de `refreshUser` (P172.04, TCK-1764).

## Notes d'implémentation

- Choix entre les deux voies de la `Piste` : une clé TanStack commune plutôt que la liste passée
  par `AppShell` ; elle ne demande pas de décider qui monte la lecture dans la coque.
- `staleTime: Infinity` : sans lui, le parcours locataire, monté après le parcours client, relisait
  l'entrée (2 lectures mesurées). L'entrée est tenue à jour par la fermeture et vidée par
  `openSession` / `logout`.
- Les tests existants des lecteurs montent désormais un `QueryClientProvider` ; ceux de
  l'assistant d'agence passent le marqueur au lieu de simuler la lecture de l'agence.
- Ablation : les sept fichiers de production rendus à `HEAD` → 8 rouges sur 13 ; correctif remis →
  13/13 verts.
