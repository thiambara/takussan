---
id: TCK-532
title: "Les étiquettes de `BarChart` sont rendues sous 9 px : elles vivent dans un SVG mis à l'échelle"
status: done
phase: P2
family: front
estimate: S
wave: 65
created: 2026-09-16
updated: 2026-09-16
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#25-reporting--tableaux-de-bord
  models: []
tags: [front, charts, lisibilité, responsive]
---

## Objectif utilisateur

Pouvoir lire les graduations et les libellés des graphiques en barres du tableau de bord sur
téléphone comme au bureau.

## Contrat de données

Relevé le 2026-09-16 pendant la revue design (groupe A) sur `/admin` : la revue a déjà calculé la
marge gauche (les graduations ne sortent plus du cadre) et porté les étiquettes à 12 unités de
`viewBox`. Mais `takussan-web/src/components/charts/BarChart.tsx` rend un SVG à `viewBox` fixe
mis à l'échelle de son conteneur : échelle **0,48 à 390 px** et **0,74 à 1366 px**, soit des
étiquettes de **5,7 px** et **8,8 px** à l'écran — sous le plancher de 12 px de la charte
(`docs/design-guidelines.md`).

Agrandir la taille en unités de `viewBox` ne corrige pas : la valeur reste proportionnelle à
l'échelle, qui varie avec la largeur.

## Contraintes strictes (métier)

1. Les étiquettes restent traduites et formatées par la locale active (`check-locale-figee`).
2. L'AC3 de TCK-405 et les tests existants des graphiques gardent leur intention : ils lisent
   aujourd'hui les `<text>` du SVG — les adapter, pas les supprimer.

## Delta à produire

- [x] Sortir les étiquettes d'axe (et les valeurs, s'il y en a) du SVG mis à l'échelle — HTML
      superposé en positions relatives, ou SVG dimensionné en pixels réels mesurés — pour qu'elles
      soient rendues à une taille CSS fixe (`text-xs`, `tabular-nums`).
- [x] Même examen pour `LineChart.tsx`, qui partage la construction.

## Critères d'acceptation

- [x] AC1 — À 360, 390, 768 et 1366 px, la taille calculée des étiquettes de `BarChart` sur
      `/admin` est **≥ 12 px** (mesurée au navigateur, pas déduite).
- [x] AC2 — Aucune étiquette ne sort du cadre du graphique à ces largeurs.
- [x] AC3 — Les tests des graphiques restent verts et rougissent si l'étiquette redevient une
      taille en unités de `viewBox` (ablation notée).

## Hors périmètre

- Changer de bibliothèque de graphiques.

## Notes d'implémentation

**Forme retenue : HTML en pourcentages autour d'un SVG étiré, pas de `ResizeObserver`.**
`BarChart` et `LineChart` sont rendus côté serveur (aucun `'use client'`) : une mesure n'existe
qu'après hydratation, donc un premier rendu faux ou vide, et un `'use client'` de plus. La figure
est une grille `[auto | 1fr] × [1fr | auto]` : colonne des ordonnées (étiquettes empilées dans une
seule cellule — la colonne prend la largeur de la plus longue, `top` en % se résout sur la hauteur
du tracé), cellule du tracé (grille en `border-dashed`, SVG `preserveAspectRatio="none"`, traits en
`non-scaling-stroke`), ligne des abscisses (`left` en %). Juste dès le HTML du serveur.

- **Le `viewBox` recadre sur le cadre utile (`40 16 584 216`)** au lieu de repartir de 0 : les
  `<rect>` gardent les coordonnées du relevé de l'AC3 de TCK-405, qui passe **sans une ligne
  modifiée**. La marge gauche estimée (`LARGEUR_CARACTERE` × longueur) disparaît : c'est la
  largeur réelle de la colonne HTML.
- **Abscisses** : au-delà de 6 (`BarChart`) ou de 4 affichées (`LineChart`), une sur deux est
  masquée sous `@max-[36rem]` (requête de conteneur sur la ligne des abscisses) — douze mois en
  `text-xs` ne tiennent pas dans ~200 px. `BarChart` tronque en plus à 1 pas (2 pas en éclairci).
  `LineChart` aligne la première abscisse à gauche et la dernière à droite : centrées sur les
  bords du tracé, elles en sortaient de moitié.
- **Hauteur** : le tracé prend `flex-1` de la figure (`h-64` sur `/admin`), avec un plancher
  `min-h-40`. Sans hauteur fournie (graphique pipeline de `/app/overview/agent`), il fait 160 px
  quelle que soit la largeur — il suivait avant le ratio 640/260.
- Les `etiquettesAxe()` des tests lisaient `text[text-anchor="end"]` : elles lisent
  `[data-chart-axis="y"]`, mêmes chaînes attendues. 4 cas neufs (`palette-et-locale.test.tsx`,
  bloc TCK-532).
- **Ablations (2026-09-16)** — `BarChart` : ordonnées remises en `<text>` `text-xs` dans un
  `<svg viewBox="0 0 640 260">` → 2 rouges (dont « aucun `<text>` dans le SVG ») ; `LineChart` :
  abscisses en `text-[10px]` → 1 rouge. Restaurées par `cp`, md5 identiques
  (`3f0fbd28…`, `59412156…`), 36/36 verts. Rejouées sur les fichiers définitifs : 3 rouges.
- **Défaut corrigé au passage** : la pastille de légende suivait l'indice, jamais `series.color` —
  le pipeline de `/app/overview/agent` (`fill-chart-2`, vert) avait une pastille terracotta.
  `pastilleSerie()` dans `palette.ts` ; cas dédié, ablation (`pastilleSerie(undefined, idx)`) → 1
  rouge.
- **Limite connue, non corrigée** : sur `/app/overview/agent`, 4 des 6 étapes du pipeline sont
  tronquées avec ellipse à 360 et 390 px (`Prosp…`, `Qualifi…`) ; libellé complet en `title`.
  Avant, elles se chevauchaient à ~5 px.

**Mesures au navigateur — 2026-09-16, 23:20-23:24**, Chrome headless par CDP, session admin
d'agence (utilisateur 2, jeton de mesure révoqué ensuite), iframe même origine à la largeur
indiquée (`innerWidth` relevé = largeur). Locale du navigateur : `en`. Preuve de version :
`viewBox="40 16 584 216"` + `preserveAspectRatio="none"` lus dans le DOM, et pastille du
pipeline agent en vert sur la capture. Machine chargée (load 5-6 / 8 cœurs) — sans effet sur une
mise en page.
« hors » = étiquettes dont le rectangle sort de celui de la `<figure>` ; « écart » = centre de
l'étiquette d'ordonnée moins sa ligne de grille.

| Page | Largeur | Graphique | Tracé (px) | Étiquettes visibles | `fontSize` | Hors cadre | Chevauchements | Écart ordonnées |
|---|---|---|---|---|---|---|---|---|
| `/admin` | 360 | BarChart | 196×204 | 3 + 6/12 | 12 px | 0 | 0 | 0 |
| `/admin` | 390 | BarChart | 226×204 | 3 + 6/12 | 12 px | 0 | 0 | 0 |
| `/admin` | 768 | BarChart | 332×204 | 3 + 6/12 | 12 px | 0 | 0 | 0 |
| `/admin` | 1366 | BarChart | 387×204 | 3 + 6/12 | 12 px | 0 | 0 | 0 |
| `/app/overview/agent` | 360 / 390 | BarChart | 258 / 288 ×176 | 3 + 6 (4 tronquées) | 12 px | 0 | 0 | 0 |
| `/app/overview/agent` | 768 / 1366 | BarChart | 394×176 / 992×240 | 3 + 6 | 12 px | 0 | 0 | 0 |
| `/app/overview/agency` | 360 / 390 / 768 | LineChart | 205 / 235 / 341 ×176 | 5 + 3 | 12 px | 0 | 0 | 0 |
| `/app/overview/agency` | 1366 | LineChart | 939×240 | 5 + 6 | 12 px | 0 | 0 | 0 |

Avant la hauteur par défaut, le même `LineChart` rendait un tracé de **939×132** à 1366 px.

**Vérification adverse — 2026-09-16, 23:26-23:45**, Chrome headless à part (port 9343), même
session admin (jeton révoqué), 4 pages (`/admin`, `/app/overview/{agent,agency,owner}`) × 8
largeurs (320 → 1920) × 3 locales (`en`, `fr`, `wo`) = 96 relevés : toutes les étiquettes à
12 px, 0 hors cadre, 0 écart ordonnée/grille, 0 barre hors du tracé, 0 défilement horizontal,
0 erreur console ni d'hydratation.

- **Défaut trouvé et corrigé** : à **320 px**, `LineChart` de `/app/overview/agency` (tracé
  165 px) rendait « 2025-10 » (aligné à gauche) et « 2026-02 » (centré à 4/11) **chevauchés de
  13 px**, dans les trois locales. Troisième palier d'éclaircissement : une abscisse sur quatre
  sous `@max-[12.5rem]`. Remesuré : 0 chevauchement à 320, 340, 360, 390, 768 et 1366 px, en `en`
  et en `wo` (à 360 px, les 3 abscisses restent). Cas dédié ; son ablation → 1 rouge. ⚠ Palier
  **relevé à 16.5rem** par le formatage des mois, qui allonge les libellés (point suivant).
- **Trou de test fermé** : une taille posée en `style` (`fontSize: 9` sur l'abscisse) passait les
  36 cas. Le cas « aucun `<text>` dans le SVG » vérifie désormais `style.fontSize === ''` ;
  ablation rejouée → 1 rouge.
- **Troncature du pipeline, plus large qu'annoncée — corrigée** : sur `/app/overview/agent`, en
  **wolof, 5 étapes sur 6 de 360 à 414 px, les 6 à 320 px, et encore 2 à 768 px** (`Yu ñu
  wóoral`, `Yu ñu jëfandikoo`) ; en `fr`, jusqu'à 5 à 320 px. Le libellé complet ne vivait que
  dans `title`, invisible au toucher. Un retour à la ligne ne suffisait pas : `jëfandikoo` seul
  (~62 px) est plus large que la colonne d'un groupe (~36 px à 320). **Solution : `BarChart`
  accepte `orientation="horizontal"`**, que la vue agent passe au pipeline. Une ligne par étape,
  en HTML, sans SVG : le libellé à gauche dans une colonne `fit-content(40%)` (jamais plus étroite
  que le mot le plus long, donc aucune coupure dans un mot ; `break-words` pour le cas limite), la
  barre en `%` du domaine (les valeurs négatives partent de la ligne de base), la couleur de la
  série (`pastilleSerie`), et l'axe des valeurs en bas. Mesuré à 320/340/360/390/414/768/1024/1366
  en `fr`/`en`/`wo` : **0 troncature, chaque étape sur 1 ligne, 12 px, 0 hors cadre**. 4 cas
  (`palette-et-locale.test.tsx`) et 1 cas de page (`overview/__tests__/graphiques.tck-532.test.ts`).
  Ablations → 1 rouge chacune : `truncate` sur le libellé, colonne en `40%` fixe, `title` ajouté,
  valeur négative avalée, `orientation` retirée de la page.
- **Abscisses ISO brutes de `LineChart` — corrigées** : les trois vues `/app/overview/{agency,
  owner,agent}` affichaient `2025-10` dans toutes les locales. `LineChart` accepte
  `abscisses="mois"` et formate par `etiquetteMois()` (`charts/abscisses.ts`, via `formatDate` de
  `@/lib/format`) : `oct. 2025` en `fr` et `wo` (étiquette Intl `fr-SN`, dette TCK-347), `Oct 2025`
  en `en`. Libellé le plus large mesuré : **60,2 px** (`mars 2026`). **Le palier du dessus passe
  donc de 12.5rem à 16.5rem** : sans chevauchement, il faut 4/11 × L ≥ 1,5 × 60,2, soit
  L ≥ 248 px. Ablation au navigateur avec le palier à 12.5rem → **chevauchement à 360 px** (6,1 px
  en `fr`, 4,9 px en `en`). Avec 16.5rem : 0 chevauchement de 320 à 1366 px dans les trois
  locales, 2 abscisses sous 264 px de tracé (jusqu'à 414 px d'écran), 3 à 768 px, 6 au-delà.
  4 cas neufs ; ablations → formatage retiré : 3 rouges, locale figée à `fr` : 1, `abscisses`
  retiré de la page owner : 1, palier remis à 12.5rem : 1.
- Relevé final (2026-09-16, 23:40-23:48) : 4 pages × 8 largeurs × 3 locales = **120 graphiques,
  0 défaut** (taille, cadre, chevauchement, troncature, écart de grille), 0 erreur console.
- **Déformation mesurée, non trompeuse** : `rx={2}` s'étire avec le SVG — coins rendus de
  0,53 × 1,89 px (320) à 5,29 × 2,22 px (1920). Longueurs des barres exactes ; traits en
  `non-scaling-stroke` (2 px) ; `LineChart` ne dessine aucun cercle.
