---
id: TCK-2989
title: Au téléphone, c'est la page de /app qui défile — le navigateur replie ses barres
status: done
phase: P2
family: front
estimate: M
wave: null
created: 2026-11-21
updated: 2026-11-21
depends_on: []
blocks: [TCK-2990]
spec_refs:
  features: []
  models: []
tags: [front, mobile, coque, adr-0134]
---

## Objectif utilisateur

Sur son téléphone, l'utilisateur de `/app` récupère la hauteur que Safari et Chrome gardent pour leurs barres
(environ 21 % de l'écran) : en faisant défiler une page, les barres du navigateur se replient.

## Contrat de données

Aucun.

## Direction UX / Artistique

ADR-0134 § 1 et § 2. Référence : la maquette « L'écran économe », profil « liste » (décision 2c du porteur),
locale, jamais versionnée. Les barres restent visibles dans ce ticket : leur effacement est TCK-2990.

## Contraintes strictes (métier)

- **Dès `md`, rien ne change** : la coque garde sa boîte `h-dvh`, la colonne et le `<main>` qui défile.
- **Le mode se décide par la route**, jamais par une déclaration de la page (ADR-0134 § 1).
- **Le dernier focalisable reste atteignable** au-dessus de la barre d'onglets (critère de TCK-503).
- **La page ne s'élargit pas** au-delà de l'écran.

## Delta à produire

- [x] `defileLeDocument` et `ROUTES_EN_BOITE` (`plein-ecran.ts`), `data-defilement` sur la coque
- [x] Le mode document dans `globals.css` : coque libre, rangée et `<main>` sans défilement (`clip`), en-tête
      collé, barre d'onglets et barre d'action fixées, réserve en bas, `--haut-colle`, `scroll-padding-top`
- [x] Les éléments collés relevés passent sous l'en-tête (`top-(--haut-colle)`)
- [x] Gardes : `CoqueHauteur.test.tsx`, `plein-ecran.test.ts`, `PageHeader.onglets.tck-2804`, par ablation

## Critères d'acceptation

- [x] AC1 — À 390 px, sur les 24 pages relevées (compte propriétaire), le document défile quand le contenu
      dépasse l'écran ; la messagerie garde sa boîte.
- [x] AC2 — En défilant, l'en-tête reste à 0 et la barre d'onglets en bas ; les éléments collés d'une page
      collent à 56 px, sous l'en-tête.
- [x] AC3 — Aucune page ne dépasse 390 px de large.
- [x] AC4 — Au bas de `/app/payments`, le dernier focalisable finit au-dessus de la barre (736 contre 780).
- [x] AC5 — Sur l'iPhone du porteur : les barres de Chrome se replient au défilement ; le tiroir, la feuille du
      compte et la palette s'ouvrent et se ferment sans faire sauter la page.

## Relevé avant (2026-11-21, 390 × 844, `dev` à 7e32a8f7c, compte propriétaire)

- Le `<main>` défile (724 px) sur les 25 pages ; le document jamais.
- **Une boîte** : `/app/messages` (colonne `min-h-0 overflow-hidden`, défilement interne).
- **Collés au `<main>`** (`top: 0`) : visites, loyers, prospects, rapports, tâches, notifications. Dans le code,
  hors de ce compte : agenda, interventions de l'agence, onglets du bien, journal d'audit, parcours de terrain.

## Relevé après (même machine, même compte)

Mode document sur 23 pages, boîte sur la messagerie ; en-tête à 0, barre à 780, collés à 56, largeur 390
partout. Premier essai : `/app/payments` élargissait la page à 505 px (le `<main>` prenait la largeur de son
contenu une fois sorti de son conteneur de défilement) — corrigé par `min-width: 0` et `overflow-x: clip`.

AC5 constaté par le porteur sur son iPhone le 2026-11-21 (« ça marche »).
