---
id: TCK-337
title: "Le dictionnaire next-intl est inliné en entier dans chaque page"
status: todo
phase: P3
family: technique
estimate: L
wave: 42
created: 2026-08-21
updated: 2026-08-21
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#28-internationalisation--préférences
  models:
    - docs/models-spec.md#3-property
tags: [front, i18n, performance, dette]
---

## Objectif utilisateur

Une page ne fait pas télécharger la traduction de tout le produit pour afficher une liste de biens.

## Contrat de données

Sorti de [TCK-335](TCK-335-recherche-navigation-defauts-mesures.md). Mesures acquises le
2026-08-21, à ne pas reprendre : **60 espaces de noms, 206 608 octets minifiés / 60 115 gzip**,
dont **12 espaces réellement utilisés par `/properties`** (32 401 o ; 41 931 avec `errors` et
`validation`).

**Le fichier que l'audit désignait n'est pas le fautif.** Le point d'entrée est
`src/app/layout.tsx:46,51` (`getMessages()` puis `<NextIntlClientProvider messages={messages}>`),
pas `src/i18n/request.ts`.

## Contraintes strictes (métier)

- **Les providers next-intl imbriqués REMPLACENT au lieu de fusionner** (`use-intl`, `react.js:44`).
  Un provider posé sur `/properties` perdrait les espaces de noms de la chrome montée dans les
  layouts parents.
- **Le sous-ensemble n'est pas décidable statiquement** : 3 sites de clé dynamique, 2 traducteurs
  racine sans espace de noms, 3 `next/dynamic`.
- **Une clé manquante ne casse ni le build ni le lint** : elle produit un `MISSING_MESSAGE` en
  production, sur un chemin rare. C'est le mode de défaillance qui rend ce ticket dangereux.

## Delta à produire

- [ ] **Commencer par la mesure qui manque** : le poids d'un `next build` d'aujourd'hui, jamais pris
- [ ] Évaluer `next-intl/extractor` **avant** d'écrire la moindre table à la main
- [ ] Décider — et documenter — comment un espace de noms oublié devient une erreur de build

## Critères d'acceptation

- [ ] AC1 — le poids JS d'une page est mesuré avant et après, sur un build de production
- [ ] AC2 — aucun `MISSING_MESSAGE` sur un parcours complet des trois locales

## Hors périmètre

- Le contenu des traductions.

## Notes d'implémentation

_(à remplir par implementing-specs)_
