---
id: TCK-839
title: "Fil d'Ariane de la fiche : le quartier indexable pointe vers sa page canonique"
status: done
phase: P1
family: front
estimate: S
wave: null
created: 2026-10-18
updated: 2026-10-18
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  pistes:
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#les-pages-de-quartier-annoncées-au-sitemap-ne-reçoivent-aucun-lien-du-html-et-le-fil-dariane-refuse-ce-lien-pour-une-raison-que-tck-598-a-levée"
tags: [front, seo, maillage, fil-d-ariane, pistes]
---

## Contexte

Réf : **P35.01** du fichier de pistes, `validé` par le porteur (critère accordé : V7).

Le maillon de quartier du fil d'Ariane de la fiche n'a pas de lien. Son docblock le justifiait par
l'exclusion de `location` des clés canoniques (TCK-433) ; TCK-598 l'y a fait entrer, et le sitemap
annonce les pages de quartier indexables (seuil `SEUIL_QUARTIER_INDEXABLE`). Aucun lien du HTML
public ne mène à ces pages, et le test du fil figeait l'absence de `location=`.

## Décision du porteur

maillon de quartier cliquable vers sa canonique quand le quartier est dans le domaine indexable de sa ville, libellé sinon ; docblock et test du fil réécrits

## Objectif utilisateur

Depuis la fiche d'un bien, le visiteur (et le moteur) atteint la page du quartier quand elle existe.

## Contrat de données

- `GET /api/public/properties/cities` et `…/neighborhoods?city=` (existants), par
  `domainesDeLaListe`, appel partagé en cache de données d'une heure.

## Delta à produire

- [x] `src/lib/fil-d-ariane-quartier.ts` : `hrefDuQuartier(property, domaines)`, le chemin
  `cheminCanoniqueDeLaListe({ city, location })` si la canonique retient le quartier, sinon rien.
- [x] `maillonsDeFiche(property, t, hrefQuartier?)` : le maillon de quartier porte ce `href` ;
  docblock réécrit.
- [x] `page.tsx` calcule le chemin côté serveur et le passe au JSON-LD et, par
  `PropertyDetailContent`, à `PropertyBreadcrumb`.
- [x] `jsonld-fil-d-ariane.test.tsx` : le test « jamais `location=` » devient « `location=`
  seulement si le quartier est indexable, et l'`item` est alors canonique de lui-même ».

## Critères d'acceptation

- [x] AC1 — Quartier hors du domaine indexable de sa ville : libellé, ni `<a>` ni `item`.
- [x] AC2 — Domaine inconnaissable (`null`), ville hors catalogue ou bien sans ville : aucun lien.
- [x] AC3 — Quartier indexable : `<a href="/fr/properties?city=Dakar&location=Ngor">` à l'écran,
  le même `item` absolu au `BreadcrumbList`, en graphie canonique même si le bien écrit
  `dakar`/`NGOR`, et `cheminCanoniqueDeLaListe` du lien rend le lien.

## Hors périmètre

- Le maillon de ville pointe toujours `/properties?city=<graphie du bien>`, non normalisée par le
  domaine (voir P35.04 et P35.05).
- Le rendu HTTP d'une fiche n'a pas été rejoué (front et API locaux arrêtés).

Hypothèse (mode sans humain) : en cas de domaine indisponible, la fiche se rend sans lien de
quartier plutôt que d'échouer.

## Notes d'implémentation

- `hrefDuQuartier` vit hors de `fil-d-ariane.ts` : ce dernier est importé par un composant client,
  et `canonique` tire `@/lib/schemas/property`, donc zod. Posée dans `fil-d-ariane.ts`, la fonction
  faisait rougir `zod-hors-des-pages-publiques.test.ts` sur la fiche (TCK-744).
- Ablation : maillon sans `href` → le test du quartier indexable rougit (1) ; `hrefDuQuartier` qui
  rend toujours le chemin → les deux tests « pas de lien » rougissent (2). Remis : 11 verts.
