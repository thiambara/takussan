---
id: TCK-2891
title: "Pipeline : l'onglet « Clients » (téléphone) et l'entrée « Clients » (barre latérale) restent actifs sur /app/crm/pipeline"
status: done
phase: P2
family: front
estimate: S
wave: 92
created: 2026-11-15
updated: 2026-11-16
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#16-crm--relation-client"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, crm, pipeline, navigation, audit-maquettes-2026-11-15]
---

## Objectif utilisateur

Sur le pipeline, l'agent sait où il est : « Clients » est allumé dans la barre du bas comme dans la barre latérale.

## Contexte

Audit des maquettes de `/app` du 2026-11-15, famille commerciale (`audit-f5-commercial.md`, app-pipeline e0 ; « Écarts couverts par les fiches », TCK-2592 hors périmètre renvoyé « à navigation » sans ticket). L'entrée « Clients » du catalogue ne couvre que `/app/customers` (`lib/navigation/catalogue.ts:310`) ; aucune entrée ne couvre `/app/crm`.

## Contrat de données

- Aucun appel : catalogue de navigation de la console.

## Direction UX / Artistique

**Référence de fidélité** : maquette `app-pipeline` — fichiers `/Users/aminethiam/Documents/perso/takussan/takussan-web/src/app/[locale]/(public)/playground/maquettes/pages/app/app-pipeline-telephone.tsx` et `app-pipeline-ecrans.tsx` ; écrans **e0 Liste**, **e1 Kanban**, **e2 Motif de perte** ; téléphone (onglet « Clients » de la barre du bas actif) et bureau (entrée « Clients » de la barre latérale active).

## Contraintes strictes (métier)

- L'entrée « Clients » est active pour `/app/customers/*` **et** `/app/crm/*` ; aucune autre entrée ne s'allume en même temps.
- Pas de régression sur l'onglet actif des autres routes (garde de la coque existante).

## Delta à produire

- [x] Catalogue de navigation : correspondance de « Clients » étendue à `/app/crm`.
- [x] Test de la coque : onglet et entrée actifs sur `/app/crm/pipeline`, une seule entrée active.

## Critères d'acceptation

- [x] AC1 — À 390, sur `/app/crm/pipeline`, l'onglet « Clients » de la barre du bas porte `aria-current="page"`.
- [x] AC2 — À 1440, l'entrée « Clients » de la barre latérale porte `aria-current="page"` et aucune autre.
- [x] AC3 — Vérifier au navigateur, avec un client qui a des critères et un contact récent, la ligne « Cherche » et le canal du dernier contact (« appel il y a 9 j ») sur les cartes et lignes du pipeline (e0, e1) ; corriger si absents.

**Fidélité** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md)) :

- [x] AC-F1 — La fiche existante de TCK-2592 est mise à jour : l'écart « onglet Clients non actif » est retiré de ses `hors_perimetre`.

## Hors périmètre

- Le contenu du pipeline (conforme, TCK-2592).

## Notes d'implémentation

**Re-mesure (2026-11-15).** Prémisse confirmée : l'entrée `clients` du catalogue (`lib/navigation/catalogue.ts`) n'avait pour href que `/app/customers`, et aucune destination ne couvrait `/app/crm` ; les trois résolutions de l'entrée active (`AppSidebar`, `BarreDOnglets`, `resolveurDesRecents` de la palette) passaient le chemin brut à `resolveActiveHref`. Le ticket cite `src/data/navigation.ts` : la navigation de la console vit dans `src/lib/navigation/` (il n'y a rien à y changer).

**Livré.**
- `Destination.couvreAussi` (catalogue) : d'autres racines que la destination couvre ; « Clients » porte `couvreAussi: ['/app/crm']`.
- `cheminDuMenu(pathname)` (catalogue) : un chemin sous une racine `couvreAussi` devient le `href` de la destination ; passé à `resolveActiveHref` par la barre latérale, la barre d'onglets et les récents de la palette (une seule lecture, l'onglet et l'entrée ne divergent pas). Le plus-long-préfixe garantit qu'aucune autre entrée ne s'allume en même temps.
- Fiche de fidélité `docs/qa/audit-ux-2026-11/fidelite/TCK-2592.json` : l'écart « onglet Clients non actif » retiré de `hors_perimetre` (AC-F1).

**Tests.** `BarreDOnglets.test.tsx` (agent, `/app/crm/pipeline` : « Clients » porte `aria-current`, un seul) et `AppSidebar.test.tsx` (agent : `activeLabels()` = `['Clients']`). Rouges avant le correctif ; ablation de `couvreAussi` : les deux rougissent, restauré par `cp` (md5 identique). Fichiers voisins verts (BarreDOnglets, AppSidebar, AppShell.barre-d-onglets, palette, catalogue, active-path, pages-recentes : 332 tests). ESLint et `tsc --noEmit` propres.

**AC3.** Pas de navigateur dans ce lot (consigne du porteur) : vérifié par le code et les tests existants — `lecture.ts` rédige « Cherche » (`cherche`) et le canal du dernier contact (`dernier.canal`, TCK-2766) ; `CarteDuPipeline` (e1) et `ListeDuBureau` (e0) les rendent ; `PageDuPipeline.tck-2592.test.tsx` les éprouve (« appel il y a 9 j », ligne « Villa · Almadies · … ») — 22 tests verts. Rien à corriger.
