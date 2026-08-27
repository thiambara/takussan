---
id: TCK-433
title: "Aucune URL canonique nulle part : `/properties` se démultiplie en autant de doublons qu'il y a de combinaisons de filtres"
status: todo
phase: P2
family: front
estimate: S
wave: 49
created: 2026-08-27
updated: 2026-08-27
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models: []
tags: [front, seo, public, metadata]
---

## Objectif utilisateur

Une même page de biens ne se présente qu'une fois aux moteurs, quelle que soit l'URL par laquelle
on y arrive.

## Contexte

Mesuré le 2026-08-27 sur `takussan-web/src` :

```
$ grep -rn "metadataBase\|alternates\|canonical" src/ | grep -v "docblock\|// "
  → aucune occurrence dans un objet `Metadata`
```

Aucune page publique ne déclare `alternates.canonical`, et le projet ne pose pas de
`metadataBase`.

`/properties` porte vingt clés de filtre (`CLES_DE_RECHERCHE`), la pagination, le tri et le
nombre par page — toutes sérialisées dans l'URL par `useSearch`, par construction (TCK-340). Les
combinaisons sont donc explorables et, pour un moteur, chacune est une page distincte servant
essentiellement le même catalogue. La `generateMetadata` de la route est statique : le même
`<title>` et la même `<meta description>` pour toutes.

Le `metadataBase` absent touche un second point, plus discret : les `openGraph.images` des trois
pages qui en déclarent (`properties/[slug]`, `agencies/[slug]`, `agents/[slug]`) reposent sur des
URL rendues par l'API. Le jour où l'une d'elles arrive relative, la carte sociale se casse en
silence — un avertissement de build, aucune erreur.

## Contrat de données

Aucun nouvel endpoint. Les données nécessaires — filtres actifs, page courante, total — sont déjà
celles que `useSearch` et `generateMetadata` manipulent.

## Direction UX / Artistique

Sans objet — rien de visible ne change, hormis le `<title>` de l'onglet sur une recherche filtrée,
qui doit dire ce que la page montre plutôt que rester générique.

## Contraintes strictes (métier)

- **La canonique se décide, elle ne se recopie pas.** Ce ticket doit trancher explicitement, pour
  `/properties`, ce qui est canonique et ce qui ne l'est pas : quelles clés de filtre méritent
  leur propre URL indexable, lesquelles se replient sur la page nue, et ce que devient la
  pagination. Poser `canonical = URL courante` partout reviendrait à ne rien décider.
- Les libellés de titre viennent du dictionnaire next-intl — l'API émet des codes, le front
  possède le texte affiché (principe non négociable n°5).
- La décision doit rester cohérente avec le sitemap de
  [TCK-431](TCK-431-sitemap-et-robots-absents.md) : une URL déclarée non canonique n'entre pas
  dans le sitemap.

## Delta à produire

- [ ] `metadataBase` posé une fois, à partir de la variable d'URL publique de TCK-431
- [ ] Règle de canonicité de `/properties`, écrite dans le code à l'endroit qui l'applique
- [ ] `alternates.canonical` sur les pages publiques indexables (`/`, `/properties`,
      `/properties/[slug]`, `/agencies/[slug]`, `/agents/[slug]`)
- [ ] `<title>` / `<meta description>` de `/properties` dérivés des filtres actifs
- [ ] Tests : la canonique d'une URL filtrée non retenue pointe vers la page canonique ; la
      canonique d'une fiche pointe vers elle-même

## Critères d'acceptation

- [ ] AC1 — `/properties?type=villa&page=3&sort=-created_at&per_page=48` rend une
      `<link rel="canonical">` conforme à la règle tranchée, et le test **nomme la règle** :
      il échouerait aussi bien si la canonique disparaissait que si elle recopiait l'URL demandée.
- [ ] AC2 — `/properties/<slug>` rend une canonique absolue vers elle-même, sur l'hôte configuré.
- [ ] AC3 — le `<title>` de `/properties?type=villa&city=Dakar` diffère de celui de `/properties`
      nu et nomme le filtre, dans les trois langues servies.
- [ ] AC4 — `metadataBase` est posé et une image OG relative produit une URL absolue ; un test
      l'éprouve sur une valeur relative, pas sur la valeur absolue que l'API rend aujourd'hui.
- [ ] AC5 — aucune URL déclarée non canonique n'entre dans le sitemap de TCK-431.

## Hors périmètre

- Les alternatives de langue (`hreflang`) — [TCK-434](TCK-434-trois-langues-une-seule-url.md).
- La génération du sitemap elle-même — [TCK-431](TCK-431-sitemap-et-robots-absents.md).
- Les pages de facettes SEO dédiées par ville ou par type : surface produit non spécifiée.

## Notes d'implémentation

_(à remplir par implementing-specs)_
