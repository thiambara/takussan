---
id: TCK-1040
title: "Fiche bien de la console : l'édition, les médias et le calendrier se chargent à l'ouverture de leur onglet"
status: done
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-70--poids-js-initial-des-écrans-de-app"
tags: [front, performance, bundle, pistes]
---

## Contexte

Réf : **P70.03** du fichier de pistes, `retenu · autonome` (A2 : différer le contenu d'un onglet
fermé ne change pas ce que l'onglet rend, même méthode que TCK-850 et TCK-1037).

`PropertyDetailTabs` importe statiquement l'assistant d'édition complet (`PropertyForm`), le
panneau des médias et le calendrier d'hôte, alors que l'onglet ouvert par défaut est l'aperçu.
`/app/properties/[id]` est l'écran de `/app` le plus lourd (602,6 Kio gzip de JS initial, mesuré
par le mesureur), dont 58,9 Kio pour `PropertyForm` seul.

## Objectif

Le code des onglets « Modifier », « Médias » et « Calendrier » ne se télécharge qu'à leur première
ouverture.

## Contrat de données

Aucun.

## Contraintes strictes

- `TabsContent` (base-ui `Tabs.Panel`, `keepMounted` à `false` par défaut, lu dans
  `node_modules/@base-ui/react/tabs/panel/TabsPanel.js`) ne monte que l'onglet actif : un composant
  `next/dynamic` n'est donc demandé qu'à l'ouverture de son onglet, ou au chargement si `?tab=` le
  désigne.
- **Hypothèse** : `PropertyPriceHistoryList` reste statique, car `PropertyOverviewPanel` (l'aperçu)
  l'importe aussi : le différer ne retirerait rien. `ContactsSurPlaceDuBien` reste statique : la
  piste ne le cite pas et rien ne le mesure.
- Aucun `loading` : l'onglet est vide le temps du chargement, comme les dialogues de TCK-850.

## Delta à produire

- [x] `PropertyForm`, `PropertyMediaPanel` et `PropertyCalendarPanel` passent par `next/dynamic`
      dans `PropertyDetailTabs`.
- [x] Le mock du test TCK-633 suit le nouveau chemin de `PropertyForm`.
- [x] Garde `src/components/property-dashboard/__tests__/PropertyDetailTabs.onglets-differes.test.ts`.

## Critères d'acceptation

- [x] AC1 — Le graphe client statique de `app/(dashboard)/app/properties/[id]/page.tsx` ne contient
      ni `PropertyForm`, ni `PropertyMediaPanel`, ni `PropertyCalendarPanel`.
- [x] AC2 — Les tests de `PropertyDetailTabs` et de la page restent verts.

## Hors périmètre

- Les autres chemins de zod vers la fiche (`DocumentUploadDialog`, P70.04).
- Le contenu de l'aperçu.

## Notes d'implémentation

- Avant correctif, 3 rouges : les trois modules sont dans le graphe client de la page.
- Ablation : `PropertyDetailTabs.tsx` rendu à `HEAD` → les 3 mêmes rouges ; correctif remis →
  4/4 verts.
