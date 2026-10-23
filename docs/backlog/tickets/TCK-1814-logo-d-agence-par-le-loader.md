---
id: TCK-1814
title: "Le logo d'agence passe par le loader de `next/image` dans l'annuaire public et les consoles super-admin"
status: doing
phase: P2
family: technique
estimate: S
wave: null
created: 2026-10-23
updated: 2026-10-23
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#27-médias--fichiers"
    - "docs/features.md#112-agence--équipe"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#angle-180--images-téléversées-sans-borne-de-pixels-face-aux-décodages-gd-qui-les-suivent"
tags: [web, media, image, performance, pistes]
---

## Objectif utilisateur

Réf : **P180.03** du fichier de pistes.

Le visiteur de l'annuaire des agences et l'opérateur des consoles super-admin reçoivent le logo à
la taille affichée (palier 128 de Cloudflare Transformations), et non l'original, jusqu'à 10 Mo.

## Décision du porteur (déléguée)

« validé (délégué) — les trois écrans qui posent `logo_url` en image brute (`ProfileCard.tsx:75-76`, `agency-detail.tsx:322`, `AgencyModerationCard.tsx:122-127`) passent par le loader de `next/image` (ADR-0029 §4), sans `unoptimized`, avec un `sizes` à la taille affichée, comme la fiche publique d'agence (`page.tsx:189-195`) ; `logo_url` reste l'original dans toutes les ressources ; reste : rendre `logo_url` sur la conversion `preview` du logo, qui ramènerait à 320 px l'image de partage Open Graph et JSON-LD et l'aperçu de configuration »

## Contrat de données

Aucun changement d'API : `logo_url` reste l'original dans toutes les ressources.

## Direction UX / Artistique

Rien de visible ne change : même taille, même forme, même repli sur les initiales quand l'agence
n'a pas de logo.

## Contraintes strictes (métier)

- ADR-0029 §4 : une image du seau public passe par le `loaderFile` de `next/image`, sans
  `unoptimized`, avec un `sizes` à la taille affichée — modèle : la fiche publique d'agence
  (`agencies/[slug]/page.tsx:189-195`).

## Delta à produire

- [ ] `ProfileCard.tsx` : le logo (pastille de 56 px) en `next/image`, `sizes="56px"`.
- [ ] `agency-detail.tsx` (`AgencyDetailHeader`) : le logo (64 px) en `next/image`, `sizes="64px"`.
- [ ] `AgencyModerationCard.tsx` : `unoptimized` retiré, `sizes="44px"`.
- [ ] Un test qui rend les trois écrans et refuse un `<img>` dont la source est l'original brut.

## Critères d'acceptation

- [ ] AC1 — Dans chacun des trois écrans, l'image du logo porte un `sizes` et une source passée
  par le loader (différente de `logo_url`).
- [ ] AC2 — Sans `logo_url`, le repli (initiales, icône) est inchangé.

## Reste à faire

rendre `logo_url` sur la conversion `preview` du logo, qui ramènerait à 320 px l'image de partage Open Graph et JSON-LD et l'aperçu de configuration

## Hors périmètre

- `AgencyConfigForm.tsx` et `app/(accueil)/page.tsx`, consommateurs relevés par le mesureur, que
  la décision ne cite pas.

## Hypothèses (mode sans humain)

- `ProfileCard` : `AvatarImage` de `@base-ui` précharge sa `src` par `new Image()` pour savoir
  quand masquer le repli : lui passer l'URL du loader en `render` téléchargerait quand même
  l'original. Le logo est donc posé en `next/image` (`fill`) dans la pastille, à la place du
  repli quand `logo_url` existe ; le repli n'est rendu que sans logo, pour qu'un logo transparent
  ne laisse pas voir les initiales dessous. Un logo dont le fichier manque montre une pastille
  vide (fond `bg-muted`) au lieu des initiales.

## Notes d'implémentation

_(à remplir par implementing-specs)_
