---
id: TCK-2827
title: "Fermée par ✕ après un rendu du routeur, la file de relance laisse son entrée sentinelle dans l'historique"
status: todo
phase: P3
family: front
estimate: S
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
  adr: []
tags: [front, defaut, historique, impayes, relance, audit-ux, app]
---

## Objectif utilisateur

L'admin qui ferme la file de relance par ✕ revient à l'écran précédent d'un seul geste retour, même si la page
a été rafraîchie par le routeur entre-temps.

## Origine

Notes de TCK-2824 (« À re-mesurer avant tout ticket »). Mesuré le 2026-11-14 (CDP, 390×844, persona admin,
`/app/agency/finances?tab=impayes&relance=file`, chargée après `/app`) :

| Parcours | Après ✕ | Retour n° 1 | Retour n° 2 |
|---|---|---|---|
| Témoin : ouvrir, ✕ | sentinelle rendue | `/app` | — |
| `router.refresh()`, puis ✕ | sentinelle **encore là** (`history.state` sans la marque, pile inchangée) | **reste sur `?tab=impayes`, rien de visible** | `/app` |

Après `router.refresh()`, `history.state.__takussanFermeAuRetour` est faux (Next réécrit l'état sans la
marque) ; au ✕, `useFermeAuRetour` ne trouve plus son jeton dans l'entrée courante et ne rend pas la
sentinelle : un retour de trop, qui ne fait rien.

## Delta

- `useFermeAuRetour` rend la sentinelle même quand Next a réécrit l'état de l'entrée : la marque survit à
  `router.refresh()` (la reposer sur l'entrée courante, ou ne plus dépendre d'elle pour décider du `back()`).
- Un test : ouvrir, simuler la réécriture de `history.state` par le routeur, fermer par ✕ — la pile revient à
  sa taille d'avant l'ouverture.

## Critères d'acceptation

- [ ] AC1 — le parcours « `router.refresh()` puis ✕ » ci-dessus : un seul retour mène à `/app`.
- [ ] AC2 — sans correctif, le test est rouge (ablation) ; le témoin et le retour par geste (TCK-2634,
  TCK-2775) restent verts.
- [ ] AC3 — la feuille des notifications, seconde utilisatrice du crochet, garde son comportement.

## Hors périmètre

- Le retrait de `?relance=` de l'adresse (TCK-2824).

## Notes d'implémentation

_(vide)_
