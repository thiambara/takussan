---
id: TCK-1221
title: "Le relais de maintenance rend un JSON sur une API sans réponse, et le bandeau ignore une réponse en échec"
status: done
phase: P2
family: bug
estimate: S
wave: null
created: 2026-10-22
updated: 2026-10-22
depends_on: [TCK-1219]
blocks: []
spec_refs:
  features:
    - "docs/features.md#29-administration--configuration"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-79--appels-du-serveur-next-vers-lapi-sans-délai"
tags: [front, bff, maintenance, resilience, pistes]
---

## Contexte

Réf : **P79.06** du fichier de pistes, `validé`.

`GET /api/maintenance/status` (`src/app/api/maintenance/status/route.ts`) fait un `fetch` sans
délai ni `catch` : API injoignable, la route lève. `MaintenanceBanner` interroge ce relais toutes
les 60 s et fait `res.json()` sans regarder le statut.

## Décision du porteur

« validé — validation en bloc du porteur (2026-10-21) : la piste telle qu'écrite ; où elle laisse plusieurs voies, l'implémenteur retient celle qu'elle recommande, à défaut la plus étroite, et écrit son choix dans le ticket »

Critère accordé : V7.

### Choix de l'implémenteur

- **Relais** : le statut et le code de P79.04 (TCK-1219) — `fetchVersApi`, donc 502
  `upstream_unavailable` ou 504 `upstream_timeout` sous 30 s. L'appel reste partagé (aucune
  requête du visiteur transmise, cache de 60 s inchangé).
- **Bandeau** : une réponse non `ok` est ignorée sans lever — `fetchStatus` rend `null`, et le
  bandeau ne s'affiche pas, comme aujourd'hui sur une erreur. L'état de maintenance reste inconnu
  tant que l'API ne répond pas (noté par le mesureur) : aucun état visible neuf n'est inventé.

## Objectif

Une API injoignable ne fait plus lever le relais de maintenance, et le bandeau ne lit plus un corps
d'erreur comme un statut.

## Contrat de données

Aucun.

## Delta à produire

- [x] `maintenance/status/route.ts` emploie `fetchVersApi`.
- [x] `MaintenanceBanner` : `fetchStatus` rend `null` sur une réponse non `ok`.
- [x] Tests : le relais sur un `fetch` qui rejette ; le bandeau sur une réponse 502.

## Critères d'acceptation

- [x] AC1 — `GET /api/maintenance/status` rend 502 `{ code: 'upstream_unavailable' }` quand l'API
      est injoignable.
- [x] AC2 — Sur une réponse non `ok`, le bandeau ne s'affiche pas et la requête n'est pas en erreur.
- [x] AC3 — L'exception `maintenance/status` sort du test statique de TCK-1219.

## Hors périmètre

- Un état « maintenance inconnue » visible : aucun n'est prévu.

## Notes d'implémentation

- Les faux `fetch` de `MaintenanceBanner.test.tsx` ne portaient pas `ok` : ils prennent `ok: true`
  par défaut, sans quoi le correctif masquait le bandeau de tous les cas existants.
- Ablation : `MaintenanceBanner.tsx` et `maintenance/status/route.ts` rendus à `HEAD` → 3 rouges
  (route qui lève, bandeau affiché sur un 502, test statique de TCK-1219 sans exception) ;
  correctif remis → 21/21 verts.
