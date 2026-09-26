---
id: TCK-582
title: "Le calendrier rendu à la charte (react-day-picker sous les utilitaires), et une garde sur les deux listes tenues à la main de .design-sync"
status: todo
phase: P1
family: front
estimate: S
wave: 70
created: 2026-09-26
updated: 2026-09-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#13-réservations-courte-durée--visites
    - docs/features.md#14-location-longue-durée-baux
  models: []
tags: [front, design, calendrier, react-day-picker, design-sync, garde]
---

## Objectif utilisateur

Qui choisit une date — un créneau de visite depuis la fiche publique d'un bien, une date d'entrée ou
de fin de bail dans l'application — voit le jour choisi en terracotta plein, comme le reste du
produit, et non un anneau bleu de bibliothèque.

## Contrat de données

Aucune donnée : rendu seulement. Les valeurs échangées par `DatePicker` / `DateTimePicker`
(`yyyy-MM-dd`, `yyyy-MM-ddTHH:mm`) ne changent pas.

## Direction UX / Artistique

Relevé le 2026-09-26 pendant l'import du système de design vers claude.ai/design (commit
`56b7e131`, `.design-sync/NOTES.md` § « Défaut produit ») : dans le rendu de `Calendar`, le jour
sélectionné porte un **anneau bleu sans fond**, le jour courant est **bleu**, et les chevrons de
navigation sont des **triangles pleins bleus**. `calendar.tsx` demande autre chose — sélection
`bg-primary text-primary-foreground`, aujourd'hui `ring-primary/40`, chevrons
`text-muted-foreground`, cases `size-9`.

Cause lue dans `react-day-picker@10.0.1/src/style.css`, importée par `ui/calendar.tsx` **hors de
toute couche** : `.rdp-day_button { background: none; width/height: var(--rdp-day_button-*) }`,
`.rdp-selected .rdp-day_button { border: 2px solid var(--rdp-accent-color) }`,
`.rdp-today { color: var(--rdp-today-color) }`, `.rdp-chevron { fill: var(--rdp-accent-color) }`
avec `--rdp-accent-color: blue`. Une déclaration hors couche bat **toute** déclaration en couche,
quelle que soit sa spécificité : les utilitaires Tailwind 4 de `calendar.tsx` perdent tous.

Attendu : le calendrier tel que `calendar.tsx` le décrit — terracotta plein à la sélection, anneau
discret sur aujourd'hui, chevrons sobres, rien de bleu nulle part.

## Contraintes strictes (métier)

- La feuille de react-day-picker **reste chargée** (positionnement, grille, états d'accessibilité) :
  on la range sous les utilitaires, on ne la supprime pas.
- Aucune couleur écrite en dur : l'accent de la bibliothèque passe par les jetons (`--primary`).
- Le correctif vaut pour les trois surfaces qui montent `Calendar` : `Calendar` direct
  (`PropertyVisitDialog`), `DatePicker`, `DateTimePicker`.
- **La garde ne se contente pas d'un nom** : une primitive de `ui/` absente de
  `.design-sync/entry/index.ts` doit faire échouer la Repo CI, et une sous-partie exportée ni
  retenue comme composant ni exclue par `componentSrcMap` aussi.

## Delta à produire

- [ ] Reproduire d'abord le défaut **dans l'application** (et pas seulement dans le bundle
      design-sync) : couleur calculée du jour sélectionné et du chevron, au navigateur.
- [ ] Charger la feuille de react-day-picker dans une couche cascade placée sous `utilities`, et
      poser l'accent de la bibliothèque sur le jeton `--primary`.
- [ ] Un test qui échoue avant le correctif et passe après (ablation).
- [ ] Garde `scripts/check-design-sync-entry.mjs` : chaque fichier `.tsx` de
      `takussan-web/src/components/ui/` est réexporté par `.design-sync/entry/index.ts` ; chaque
      nom réexporté par ces fichiers est soit un composant racine, soit exclu par
      `componentSrcMap`, soit un non-composant (minuscule, `*Props`, `*Variants`, constante).
- [ ] La Repo CI déclenche sur les chemins que la garde lit.
- [ ] `.design-sync/NOTES.md` : le défaut Calendar passe de « à ticketer » à « corrigé par
      TCK-582 » ; la resynchro reprend le calendrier corrigé.

## Critères d'acceptation

- [ ] AC1 — Dans l'application, le jour sélectionné d'un `DatePicker` ouvert a pour fond la valeur
      de `--primary` et aucune bordure bleue ; mesuré au navigateur, avant et après.
- [ ] AC2 — Les chevrons de navigation n'ont plus de remplissage `blue` (ni aucune couleur
      d'accent de la bibliothèque).
- [ ] AC3 — Les cases de jour mesurent la taille que `calendar.tsx` demande (`size-9`, 36 px), non
      les 42 px de la bibliothèque.
- [ ] AC4 — Le test ajouté échoue quand on retire le correctif, passe avec.
- [ ] AC5 — La garde échoue quand on ajoute un fichier `ui/nouveau.tsx` non réexporté, et quand on
      retire une sous-partie de `componentSrcMap` ; elle passe sur l'état livré.
- [ ] AC6 — `npm run lint`, `npx tsc --noEmit` et `npm run test` verts dans `takussan-web`.

## Hors périmètre

- Refondre le calendrier (plages, plusieurs mois, sélecteur d'année).
- Le thème sombre du calendrier au-delà de ce que les jetons donnent déjà.
- Automatiser la re-synchro claude.ai/design en CI (elle reste manuelle, `/design-sync`).

## Notes d'implémentation

_(à remplir par implementing-specs)_
