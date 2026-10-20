---
id: TCK-1088
title: "Le référentiel des filtres se charge quand le panneau est visible, et la fiche ne précharge qu'une photo"
status: done
phase: P1
family: technique
estimate: S
wave: null
created: 2026-10-20
updated: 2026-10-20
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-69--fiche-bien-recherche-et-accueil-sous-3g-simulé-servis-par-next-start"
tags: [web, public, performance, pistes]
---

## Contexte

Réf : **P69.06** du fichier de pistes, `validé` (V7). Sur la liste, le rail de filtres
(`hidden lg:block`) reste monté sous `lg` et demandait `geo/cities` (55 Kio), `geo/regions` et
`amenities` à l'hydratation, panneau fermé. Sur la fiche, `PropertyGalleryMosaic` et
`PropertyMobileGallery`, montées toutes deux, portaient chacune `priority` sur leur première
photo : deux préchargements de la même photo.

## Décision du porteur

> charger le référentiel des filtres quand le panneau est visible (au montage en `lg` et au-delà, à la première ouverture du tiroir en dessous) ; un seul `priority` par fiche, sur `PropertyMobileGallery` (porteur, 2026-10-20)

## Objectif

Aucune liste du référentiel ni aucun second préchargement de photo pour un panneau ou une galerie
que le visiteur ne voit pas.

## Delta à produire

- [x] `referentiel-public.ts` : `useVillesDuReferentiel`, `useRegionsDuReferentiel`,
      `useEquipementsApprouves` prennent `actif` (vrai par défaut) → `enabled`.
- [x] `ChoixDuReferentiel.tsx` : prop `charger` (vrai par défaut) sur les trois choix.
- [x] `FilterSidebar.tsx` : `charger` vaut vrai dans le tiroir (monté seulement ouvert), et dans
      le rail seulement si `(min-width: 1024px)` (`useMatchesMedia`, le seuil de `lg`).
- [x] `PropertyGalleryMosaic.tsx` : plus aucun `priority`.
- [x] Tests `FilterSidebar.referentiel-a-la-demande.test.tsx` et
      `galeries.un-seul-priority.test.tsx`.

## Critères d'acceptation

- [x] AC1 : sous `lg`, tiroir fermé, aucune des trois listes n'est demandée.
- [x] AC2 : sous `lg`, à l'ouverture du tiroir, les trois listes sont demandées.
- [x] AC3 : dès `lg`, les trois listes sont demandées au montage.
- [x] AC4 : les deux galeries d'une fiche (1 à 6 photos) ne portent qu'un `priority`, sur la
      galerie mobile.

## Hypothèses (mode sans humain)

- `geo/neighborhoods` n'était déjà demandé qu'avec une ville choisie ; il suit les villes, donc
  le même seuil.
- `/public/property-types`, demandé par la `Navbar` et cité par le constat, n'est pas du
  référentiel des filtres : hors périmètre.

## Hors périmètre

- `maintenance/status` et le logo de l'accueil (sans décision, selon la mesure déléguée).
- Le préchargement de la photo en bureau (≥ `md`), perdu avec la mosaïque : c'est la décision.

## Notes d'implémentation

- Ablations : `FilterSidebar` d'origine remis → AC1 rouge (les trois chemins demandés) ;
  mosaïque d'origine remise → 6 rouges (deux `priority`). Correctifs remis : verts.
- Piège : `next/image` n'expose pas `priority` dans le DOM sous jsdom ; le test le remplace.
  `PropertyMobileGallery` demande un `IntersectionObserver`, doublé.
- Sous charge (17 à 20 sur 8 cœurs), deux tests `userEvent` de `ChoixDuReferentiel.test` ont
  dépassé 20 s dans un lot de 7 fichiers ; rejoués seuls, 16 verts, avec et sans le correctif.
