---
id: TCK-2824
title: "Chargée directement, l'adresse `?relance=` ne revient plus dans la barre après un rendu du routeur"
status: todo
phase: P3
family: front
estimate: XS
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: []
blocks: []
spec_refs:
  features: []
  models: []
  adr: []
tags: [front, defaut, impayes, relance, adresse, audit-ux, app]
---

## Objectif utilisateur

L'admin qui ouvre `/app/agency/finances?tab=impayes&relance=<id>` (lien de l'accueil, de la fiche du bail, ou
adresse collée) voit la relance s'ouvrir et l'adresse perdre `relance=` — et la garder perdue : un
rafraîchissement ou un retour ne rejoue pas la demande.

## Origine

Relevé de fidélité de TCK-2660 (2026-11-14, 390 px) : sur deux relevés de trois, la feuille ouverte,
`?tab=impayes&relance=602` restait dans l'adresse 1,5 s après. Le retrait de TCK-2775 passe par
`history.replaceState`, que Next 16 relaie vers son routeur par un correctif posé dans un effet de
l'`AppRouter` — APRÈS les effets de ses enfants. Au chargement direct de l'adresse, l'appel synchrone de
`useRelanceDemandeeParLAdresse` précédait ce correctif : la barre changeait, l'adresse canonique de Next non,
et le rendu suivant du routeur (`router.refresh()`, rafraîchissement du serveur de dev) réécrivait
`relance=602`. Reproduit par CDP : 2 sur 2 sous `router.refresh()` ; l'appel du crochet ne portait pas
`__NA` (il contournait le correctif).

## Delta

- `relance-de-l-adresse.ts` : le retrait est différé d'une micro-tâche (après tous les effets du même
  rendu, avant l'entrée sentinelle de la file posée après la lecture réseau), et passe donc par le
  correctif de Next.

## Critères d'acceptation

- [x] AC1 — chargée directement, l'adresse perd `relance=` et ne le reprend pas après `router.refresh()`.
  Preuve : `relance-de-l-adresse.tck-2824.test.tsx` (un double de l'`AppRouter` qui pose son correctif dans
  son effet et réécrit son adresse canonique à chaque rendu) — rouge sans le correctif ; au navigateur
  (390, DPR 2, CDP), 5/5 `?tab=impayes` après `router.refresh()`, l'appel du crochet portant `__NA`.
- [x] AC2 — le geste retour reste celui de TCK-2775 : 1er appui ferme la file, 2e rend la page précédente,
  par le lien de l'accueil comme par le chargement direct de `?relance=file`. Preuve : relevé CDP
  `retour.mjs` (B et C), et le test d'ordre de TCK-2775 (retrait avant la sentinelle) reste vert.

## Notes

- Hors périmètre, constaté : après un `router.refresh()`, Next réécrit l'état de l'entrée courante sans la
  marque de `useFermeAuRetour` (`preserveCustomHistoryState` faux). Le retour ferme toujours la file (écoute
  de `popstate`), mais une fermeture par ✕ ne rendrait plus la sentinelle. À re-mesurer avant tout ticket.
