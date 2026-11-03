---
id: TCK-946
title: "Pages publiques : plus aucun niveau de titre sauté — pied de page en h2, un h2 au-dessus des grilles, et la règle heading-order d'axe en garde"
status: done
phase: P2
family: bug
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
    - "docs/plans/2026-10-15-pistes-d-amelioration.md#des-niveaux-de-titre-sautés--pied-de-page-en-h4-cartes-en-h3-sous-le-h1"
tags: [front, a11y, pistes]
---

## Contexte

Piste P31.05. Axe, passé au navigateur, rendait `heading-order` sur trois surfaces publiques :

- les colonnes du pied de page sont des `h4` (`pied-legal` aussi, en `sr-only`) : sur une page dont
  le contenu n'a qu'un `h1` (mentions légales, CGU, agents, comparateur et favoris vides), le
  premier titre du pied saute deux niveaux (`#pied-discover`) ;
- sur la recherche, le titre de la première carte est un `h3` qui suit directement le `h1` de la
  liste ;
- sur `/fr/agencies`, le titre de la première `ProfileCard` (`h3`) suit directement le `h1`
  d'`IndexDeProfils`.

L'implémenteur avait laissé la piste au porteur : la garde que fixe la précision demande `axe-core`
en dépendance déclarée (`package.json`, chemin fermé aux agents).

Décision du porteur, recopiée de la ligne Statut : « porteur (2026-10-18) : traité hors agents, en
session : `h2` du pied de page et au-dessus des grilles, et `axe-core` en dépendance de dev pour la
règle `heading-order` ».

## Objectif utilisateur

Qui navigue au clavier de titre en titre (lecteur d'écran) lit une hiérarchie sans trou : `h1` de
la page, `h2` de la grille ou de chaque colonne du pied de page, `h3` de chaque carte.

## Delta

- `takussan-web/package.json` + lock : `axe-core` **4.13.0** en dépendance de dev, version exacte
  (publiée le 2026-08-05 ; la même que celle qu'`eslint-plugin-jsx-a11y` amenait déjà, transitive :
  le lock ne gagne qu'une ligne).
- `src/test/ordre-des-titres.ts` : `titresHorsOrdre()`, la seule règle `heading-order` d'axe sur
  le DOM jsdom, qui rend les titres fautifs (cible et HTML).
- `src/components/home/Footer.tsx` : les colonnes et `pied-legal` passent de `h4` à `h2`, classes
  inchangées.
- `src/components/property/PropertiesDiscoveryPage.tsx` : un `h2` `sr-only` au-dessus de la grille
  de résultats, en vue liste, libellé `search.results.heading` (fr « Résultats de la recherche »,
  en « Search results », wo = le français tel quel, le wolof étant en pause).
- `src/components/public/index/IndexDeProfils.tsx` : le compte (« 12 agences ») devient le `h2` de
  la grille — même texte, mêmes classes, aucun texte neuf. Vaut pour `/agencies` et `/agents`, qui
  partagent ce corps.
- `src/app/[locale]/(public)/__tests__/ordre-des-titres.test.tsx` : trois rendus jugés par axe, pied
  de page RÉEL dans les trois, cartes de bien et de profil réelles.

## Critères d'acceptation

- [x] **AC1** — Sous un contenu qui n'a qu'un `h1`, le pied de page ne déclenche pas
      `heading-order`. *Mesuré : avant correctif, `titresHorsOrdre()` → `[{ cible: '#pied-discover' }]` ;
      après, `[]`.*
- [x] **AC2** — La recherche, du `h1` de la liste à la carte de bien réelle puis au pied de page,
      ne déclenche pas `heading-order`. *Mesuré : avant, la cible est le `h3` de la carte
      « Villa à Dieuppeul » ; après, `[]`.*
- [x] **AC3** — L'index des agences, du `h1` à la `ProfileCard` réelle puis au pied de page, ne
      déclenche pas `heading-order`. *Mesuré : avant, la cible est le `h3` de « Sahel Homes » ;
      après, `[]`.*
- [x] **AC4** — Ablation : un `h4` remis dans le pied de page fait rougir. *Mesuré : colonne en
      `h4` → AC1 rouge sur `#pied-discover` ; le `h2` de la recherche retiré → AC2 rouge ; le `h2`
      de l'index rendu en `<p>` → AC3 rouge ; fichiers restaurés par `cp`, `md5` identiques
      (`51e886c0…`, `e6bee4bd…`, `b735df68…`), 3 verts.*
- [x] **AC4bis** — Les `h2` de grille restent dans l'arbre d'accessibilité : celui de la recherche
      porte `sr-only`, et aucun des deux ne porte `hidden` à quelque palier que ce soit (jsdom ne
      lisant aucune feuille, axe ne verrait pas un `hidden`). *Mesuré : `sr-only` → `hidden` sur
      la recherche et `max-sm:hidden` ajouté à l'index → les deux tests rouges (« expected
      [ 'hidden' ] to include 'sr-only' », « expected [ 'max-sm:hidden' ] to deeply equal [] ») ;
      restaurés par `cp`, `md5` `e6bee4bd…` et `b735df68…` identiques, 3 verts.*
- [x] **AC5** — `axe-core` est déclaré en dépendance de dev, à une version exacte de plus de deux
      semaines. *Mesuré : `npm ls axe-core` → `axe-core@4.13.0` en racine, dédupliqué avec celui
      d'`eslint-plugin-jsx-a11y` ; `npm view axe-core time` → 4.13.0 publiée le 2026-08-05.*

## Hors périmètre

- Les autres conteneurs des cartes (`ApercuAnnonce`, `PropertyRow`, `PortfolioTabs`, l'accueil,
  les favoris, les fiches agence et agent) : la décision porte sur le pied de page et les deux
  grilles mesurées. Le niveau des cartes reste `h3`.
- Une passe d'axe complète (toutes règles) sur les pages publiques.
- Le parcours au navigateur : la règle est rejouée sous jsdom, où un titre caché par une classe
  responsive (`max-lg:hidden`) compte encore — d'où l'assertion sur les classes des deux `h2` de
  grille (AC4bis), qui ne vaut que pour eux.

## Notes d'implémentation

- Remesure du 2026-10-18 sur l'arbre courant : `Footer.tsx:187` et `:220` encore en `h4` ; `h3`
  dans les quatre variantes de carte, `PropertyCard.tsx:332` et `ProfileCard.tsx:93` ; aucun test
  du front n'importait axe ; `axe-core` présent seulement en transitif (4.13.0). Le constat tient.
- Le titre de la grille de recherche est `sr-only` : le titre visible de la page (`h1`) et le
  compte sont déjà sur la ligne d'outils ; un second titre visible ferait doublon. À l'index des
  profils, le compte visible sert de titre, sans texte neuf.
- Sous jsdom, `sr-only` ne retire rien de l'arbre : c'est le regard d'un lecteur d'écran, le bon
  pour cette règle.
