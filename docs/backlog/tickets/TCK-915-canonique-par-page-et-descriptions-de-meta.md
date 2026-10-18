---
id: TCK-915
title: "Liste publique : canonique propre à chaque page, noindex au-delà de la dernière, descriptions de méta coupées au mot"
status: doing
phase: P2
family: applicatif
estimate: M
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-9--pages-publiques--seo-et-partage"
tags: [front, seo, canonique, metadata, pistes]
---

## Contexte

Réf : **P09.08** du fichier de pistes, `validé` par le porteur (critère accordé : V7, ce que voient
les moteurs). Le dernier passage de l'implémenteur (2026-10-17) l'avait reclassée en V8 en
découpant la piste ; la précision du porteur ne retient que les parties S.

- `cheminCanoniqueDeLaListe` retire `page` : `/properties?type=villa&page=3` déclare pour canonique
  la page 1, et une page au-delà de `last_page` rend 200 en `index, follow`.
- `properties/[slug]/page.tsx` coupe la description au 160ᵉ caractère, au milieu d'un mot, et une
  description `""` échappe au `??` du repli. La bio d'agent et la description d'agence passent
  entières.
- Le layout `(public)` déclare `robots: { index: true, follow: true }`, la valeur par défaut :
  la page introuvable d'une fiche porte alors ce `index, follow` à côté du `noindex` que Next pose
  sur un `notFound()`.

## Décision du porteur

canonique propre à chaque page et `resumePourMeta()` ; au-delà de `last_page`, `robots: noindex` sur la page (le `loading.tsx` de la liste reste, le code reste 200) ; retirer `robots: index, follow` du layout public, valeur par défaut, pour lever la contradiction de la page introuvable ; reste : `generateSitemaps()`, reporté tant que le parc est loin de 16 600 biens

## Reste à faire

`generateSitemaps()`, reporté tant que le parc est loin de 16 600 biens

## Objectif

Chaque page de la liste publique est canonique d'elle-même, une page vide de fin de liste n'est pas
indexable, et les descriptions de méta s'arrêtent sur un mot entier.

## Delta à produire

- [x] `lib/canonique.ts` : `cheminCanoniqueDeLaPage(params, domaines)` = canonique de la liste,
  plus `page=N` quand `page` est un entier supérieur à 1. `cheminCanoniqueDeLaListe` ne change pas
  (fil d'Ariane, sitemap, liens de facette visent la page 1).
- [x] `(liste)/page.tsx` : la canonique et les `hreflang` dérivent de `cheminCanoniqueDeLaPage` ;
  `robots: { index: false, follow: true }` quand la page demandée dépasse `meta.last_page`.
- [x] `lib/resume-pour-meta.ts` : `resumePourMeta(texte, max = 160)` — espaces repliés, vide →
  `undefined`, au-delà de `max` coupé au dernier mot entier suivi de `…`.
- [x] Fiche, profil d'agent, page d'agence : la description de méta passe par `resumePourMeta`.
- [x] Layout `(public)` : plus de clé `robots`.

## Critères d'acceptation

- [x] AC1 — `?type=villa&page=3&sort=-created_at&per_page=48`, 3 pages ou plus : canonique et
  `hreflang` `…/properties?type=villa&page=3`.
- [x] AC2 — `page` absent, `1`, `0`, `abc` ou `-2` : canonique sans `page`.
- [x] AC3 — `page=9` sur une liste de 2 pages et 40 biens : `robots: { index: false, follow: true }`.
- [x] AC4 — `resumePourMeta` : `""`, `"   "`, `null` → `undefined` ; un texte de 300 caractères
  rend au plus 160 caractères, finit par `…` et ne coupe aucun mot.
- [x] AC5 — Une fiche à description `""` prend le repli ; une description longue est coupée au mot.
- [x] AC6 — Le `generateMetadata` du layout public ne porte aucune clé `robots`.

## Hors périmètre

- `generateSitemaps()` (reste du porteur).
- Un vrai 404 au-delà de `last_page` : le porteur garde le 200 et le `loading.tsx`.
- Les titres de fiche sans contrat ni prix (constat de la piste, hors de la précision).

Hypothèses (mode sans humain) :
- Au-delà de `last_page`, la canonique reste celle de la page demandée : pointer une page
  `noindex` vers une autre canonique enverrait deux signaux contraires.
- Une liste sans aucun bien garde la règle de TCK-675 (`noindex` sur `total === 0`).
- `page=1` explicite se replie sur la page sans `page`, qui est la même.

## Notes d'implémentation

_(à remplir par implementing-specs)_
