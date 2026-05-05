---
id: TCK-162
title: "Vue carte — marqueurs avec prix"
status: review
phase: P2
family: front
estimate: S
created: 2026-05-05
updated: 2026-05-05
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
tags: [front, bug, p2, smoke-test-2026-05-05, map, leaflet, visiteur-anonyme]
---

## Objectif utilisateur

Sur la vue carte de `/properties`, un visiteur peut comparer les biens visuellement par leur prix sans avoir à cliquer sur chaque marqueur — le prix est lisible directement sur le marqueur (ou sur un cluster).

## Contrat de données

L'API `/api/public/properties/search` renvoie déjà `price` et `coordinates` pour chaque bien — aucune nouvelle donnée nécessaire. Côté front, customiser le rendu Leaflet du marqueur en `divIcon` HTML/CSS contenant le prix.

## Direction UX / Artistique

- Marqueur prix **compact** : pastille arrondie avec le prix en F CFA (format court : `1,2 M` pour les > 1M, `850 K` pour les > 1K). Couleur cohérente avec le design system Takussan (palette terre cuite / lin).
- Survol : agrandissement + ombre.
- Cluster Leaflet : afficher le nombre de biens dans le cluster (et idéalement la fourchette min-max).

## Contraintes strictes (métier)

- Performance : la carte doit rester fluide à >100 marqueurs. Utiliser `leaflet.markercluster` si pas déjà en place.
- Accessibilité : le marqueur reste cliquable au clavier ; alt text avec prix complet pour lecteurs d'écran.

## Delta à produire

- [ ] Composant `PropertyPriceMarker` (Leaflet `divIcon`) avec prix formaté.
- [ ] Helper de formatage prix court (`formatPriceShort(value, locale)`).
- [ ] Brancher dans la vue carte du listing `/properties?...` (tab Carte).
- [ ] Mini-fiche au clic (déjà partiellement en place — vérifier qu'elle s'ouvre bien et contient photo + lien).
- [ ] Optionnel : clustering (à discuter en PR selon le volume).

## Critères d'acceptation

- [ ] Sur `/properties` en vue Carte, chaque marqueur affiche le prix au format compact lisible (`1,2 M F` ou similaire).
- [ ] Cliquer un marqueur ouvre la mini-fiche (prix complet + photo + lien vers la fiche).
- [ ] Déplacement / zoom sur la carte ne dégrade pas le rendu des prix.
- [ ] Pas de régression sur la liste des biens à droite (tab Liste OK).

## Hors périmètre

- Refonte complète du widget carte.
- Filtrage par déplacement de la carte (ce ticket reste sur l'affichage).
- Localisation des contrôles Leaflet (Zoom in/out → couvert par TCK-160).

## Notes d'implémentation

- Nouveau helper `formatPriceShort(value, locale)` dans
  `lib/format/currency.ts` — abrège en `K`/`M`/`Md` (FR) ou `B` (EN).
  Tests dans `format-currency.test.ts`.
- `PropertyMap.tsx` utilise un `L.divIcon` (`takussan-price-marker`)
  avec un `<button>` HTML accessible (aria-label = prix complet,
  title = prix complet). HTML échappé pour éviter toute injection si
  une devise inhabituelle est ajoutée plus tard.
- Styles dans `app/globals.css` (palette terre cuite Ancrage Local) :
  pastille blanche-bordée + ombre, hover = scale + ombre renforcée.
- **Pas de clustering** : le ticket le marque optionnel, et
  `leaflet.markercluster` n'est pas dans le bundle ; à ouvrir dans un
  ticket dédié si l'usage révèle une dégradation au-delà de ~150
  marqueurs visibles simultanément.
