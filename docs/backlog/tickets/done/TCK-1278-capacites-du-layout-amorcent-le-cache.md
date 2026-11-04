---
id: TCK-1278
title: "Les capacités lues par le layout de /app amorcent le cache du navigateur : les gestes d'un admin d'agence s'affichent au premier rendu"
status: done
phase: P2
family: technique
estimate: M
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-136--lectures-du-navigateur-au-chargement-de-la-console-app-et-super-admin"
tags: [front, performance, access, pistes]
---

## Contexte

Réf : **P136.02** du fichier de pistes, `retenu · autonome` (A2). Entrée dans le lot de l'angle
146 par complément du même côté (front).

Pour un `agency_admin`, le layout `/app` lit `GET /api/me/capabilities` à chaque rendu
(`accesAdmin` → `capacitesDuRendu`, `cache()`ée) et n'en transmet que l'inventaire des pages
d'administration. Les écrans relisent la même ressource dans le navigateur (`useCan` →
`useMyCapabilities`, clé `['me','capabilities','active']`, sans `initialData`) : sur
`/app/payments`, les boutons « Créer une facture » et « Nouveau reversement » restent un
squelette jusqu'à cette seconde réponse.

## Objectif utilisateur

L'admin d'agence voit ses gestes dès l'affichage de l'écran.

## Contrat de données

Aucun changement d'API. La réponse amorcée est celle de `GET /api/me/capabilities` lue par le
rendu serveur, sous le même indice de profil actif que le navigateur enverrait.

## Delta à produire

- [x] `capacitesDuRendu` garde la réponse entière (`agency_id` compris) et son heure ;
  `capacitesAmorcees(user)` la rend au layout, `null` hors `agency_admin`, sur refus ou panne.
- [x] Composant client d'amorce : `HydrationBoundary` sur la seule clé
  `['me','capabilities','active']`, jamais au-dessus d'une donnée plus récente du navigateur.
- [x] Le layout `/app` monte l'amorce autour de la coque.
- [x] Tests : `PaymentsTabs` sous un cache amorcé (vrais `useCan`/`useApiQuery`), le layout,
  `capacitesAmorcees`.

## Critères d'acceptation

- [x] AC1 — Sous un cache amorcé, `PaymentsTabs` rend ses deux boutons et l'onglet « À approuver »
  sans squelette, et n'appelle pas `/api/me/capabilities`.
- [x] AC2 — Sans lecture (agent, super-admin, refus, panne), rien n'est amorcé et le navigateur lit
  comme avant.
- [x] AC3 — Le layout amorce la clé avec la lecture du serveur.

## Hors périmètre

- La clé `['me','capabilities', agencyId]` d'un écran qui passe une agence explicite.
- Les autres lectures du chargement de `/app` (P136.03, P138.x).

## Notes d'implémentation

- L'API reste seule juge : l'amorce ne change que le moment où `useCan` répond.
- L'heure de la lecture (`lueA`) sert de `dataUpdatedAt` : `HydrationBoundary` n'écrase pas une
  relecture du navigateur faite après une édition de rôle, et réamorce après un rafraîchissement
  du serveur.
- Fixture mise à jour : `bandeau-suspension.test.tsx` simule `pages-admin-server` et doit fournir
  `capacitesAmorcees`.
- Ablation : amorce rendue inerte → 1 rouge (`PaymentsTabs…`, squelette et un appel) et 1 rouge
  (layout) ; `layout.tsx` et `pages-admin-server.ts` rendus à `HEAD` → 1 rouge (layout) et 4 rouges
  (`capacitesAmorcees`) ; correctif remis → 2/2, 2/2 et 18/18 verts.
