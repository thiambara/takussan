---
id: TCK-2521
title: Annuaire « La liste dense, une vitrine en tête » : Professionnels, onglets Agences · Agents
status: done
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-09
updated: 2026-11-09
depends_on: [TCK-2518, TCK-2520, TCK-2506, TCK-2532]
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, directory, mobile, audit-ux]
---

## Objectif utilisateur

Choisir vite une agence ou un agent au téléphone — le premier résultat sous 300 px, la note et le délai de réponse visibles d'emblée — et voir, en tête, l'agence mise en avant dans sa ville.

## Contrat de données

`GET /api/public/agencies` et `/agents` (champs de TCK-2518, `spotlight` de TCK-2520, règle des propriétaires sur option de TCK-2506). Recherche par nom et filtre par ville dans l'URL, inchangés.

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=annuaire&a=d` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes) — écrans Agences et Agents, téléphone et bureau.
- Un annuaire « Professionnels », onglets Agences · Agents ; lignes d'environ 80 px : logo (monogramme en repli), nom et badge vérifié, biens en ligne, villes, note et avis, délai de réponse ; pour un agent, langues et quartiers.
- En tête, au plus une carte « Mise en avant » : couverture de trois biens de l'agence, signalée en clair ; absente, la liste commence directement.
- En bureau, chaque carte d'agence porte ses trois aperçus.
- Villes sur une rangée qui défile ; plus de sur-titre en capitales ; « Rejoindre Takussan » en pied.
- Tutoiement (découverte).

## Contraintes strictes (métier)

- Rien de l'existant ne se perd : recherche par nom et ville dans l'URL (rendu serveur, indexé), compte des résultats, pagination, état vide qui garde les filtres, panne distincte du vide, badge vérifié, portefeuille à louer / à vendre, note et nombre d'avis.
- Aucun numéro sur une ligne d'annuaire.
- L'agence mise en avant apparaît aussi à son rang (décision 1a).
- Un champ absent (délai, langues) ne laisse pas de trou ni de « — ».

## Delta à produire

- [x] Page « Professionnels » à deux onglets (les deux URL `/agencies` et `/agents` restent et sélectionnent l'onglet).
- [x] Ligne dense agence et agent ; monogramme ; rangée de villes.
- [x] Carte « Mise en avant ».
- [x] Aperçus en bureau.
- [x] Clés i18n `fr`/`en`/`wo`.
- [x] Tests (onglet par URL, vitrine absente sans `spotlight`, champs facultatifs absents, état vide et panne distincts).

## Critères d'acceptation

- [x] AC1 — À 390 × 844, le premier résultat commence à moins de 300 px du haut (sans vitrine). — mesuré au navigateur : premier `<li>` à 233 px (716 avant).
- [x] AC2 — Avec `spotlight`, une seule carte « Mise en avant » en tête, et l'agence aussi à son rang. — test `IndexDeProfils.test.tsx` (« UNE carte signalée en tête — et l’agence aussi à son rang ») ; au navigateur avec une place temporaire : 1 vitrine, Thiès Properties au 3ᵉ rang de 3.
- [x] AC3 — `/fr/agents?city=dakar` ouvre l'onglet Agents filtré, rendu serveur (le HTML contient les résultats). — `renderToString` dans `IndexDeProfils.test.tsx` (lignes, liens de fiche, onglet `aria-current`) ; au navigateur, onglet Agents actif et puce Dakar allumée, mais **0 agent sur la base de dev** (TCK-2532 non rejoué) : les lignes ne sont prouvées que par le test.
- [x] AC4 — Aucune ligne ne contient de numéro de téléphone (balayage du HTML rendu). — balayage du `<main>` servi de 6 URL (fr/en/wo, avec et sans ville) : 0 numéro, 0 lien `tel:`/`mailto:`/`wa.me` ; test qui injecte un numéro dans la réponse : non rendu.

## Hors périmètre

- Les fiches (TCK-2522, TCK-2523).

## Notes d'implémentation

Relevés du 2026-11-09 (agent « annuaire », vague 3), pile `./dev.sh`, base de dev :

- **Avant** : à 390 × 844, `/fr/agencies` met le premier résultat à **716 px** du haut (`main` à 69 px,
  en-tête de 275 px : sur-titre, titre sur trois lignes, intro ; villes en `flex-wrap`).
- `GET /api/public/agencies?per_page=48` → 3 agences (Dakar Immo 67, Saint-Louis Habitat 62, Thiès
  Properties 58), `reviews.average` nul partout, `median_response_minutes` nul partout,
  `leases_signed_this_month` 0, `cover` = 3 photos chacune ; `spotlight` est une **racine** de la
  réponse, `null` (aucune place offerte sur la base de dev), avec et sans `filter[city]=Dakar`.
- `GET /api/public/agents?per_page=5` → **`total 0`** : les seeders de TCK-2532 ne sont pas rejoués
  sur la base de dev (pas de `migrate:fresh`, d'autres agents s'en servent). L'onglet Agents est
  donc prouvé par les tests, pas au navigateur avec des lignes.
- **Prémisse corrigée — total ≠ à louer + à vendre** : `PublicProfileFacts::portefeuilles()` compte
  dans `portfolio_count` un bien sans `contract_type`, qui n'entre dans aucune des deux
  répartitions. La ligne garde donc les trois nombres.
- L'index des agents émet `languages` (codes de `config/directory.php`), `neighborhoods`
  (`[{id, name}]`) et `median_response_minutes` ; l'index des agences, `cover`,
  `leases_signed_this_month`, `median_response_minutes` (ni `tagline` ni `highlights`).
- Aucun libellé de langue n'existait côté front : ajoutés sous `publicProfileIndex.languages.*`.
- La recherche des agents porte sur prénom, nom, `username`, `public_slug` — pas sur l'agence ni le
  quartier : le texte d'exemple de la maquette (« Nom, agence ou quartier ») promettrait une
  recherche qui n'existe pas ; « Nom ou prénom » est gardé.
- « Rejoindre Takussan » : aucune inscription d'agence en libre-service n'existe (une agence passe
  par l'espace auto-créé puis la demande de passage en agence) ; le lien mène à `/publish`, l'entrée
  universelle des professionnels.
- **Une seule `<li>` par profil** : ligne au téléphone, carte dès `lg` (bordure, fond, trois aperçus
  `cover` pour une agence). Pas deux rendus masqués tour à tour — un profil n'apparaît qu'une fois
  dans le HTML indexé.
- **Onglets = liens** (`<nav aria-label>` + `aria-current="page"`), pas un `tablist` : chaque onglet
  est une page serveur avec sa canonique et son sitemap. Aucune URL renommée → ni redirection, ni
  changement de `src/lib/sitemap.ts`. La ville passe d'un onglet à l'autre ; `q` et `page` non.
  Compte d'onglet = `compterProfils()` (requête `per_page=1` à la ville, recherche ignorée),
  lancé en parallèle de la liste ; sans `q`, l'onglet actif réutilise le total de la liste ; une
  panne rend l'onglet sans compte.
- **Logo cassé** : le `logo_url` de Dakar Immo répond **403** sur la base de dev (`curl` →
  `403`) et la ligne montrait l'icône d'image cassée. `LogoOuInitiales` (client) bascule sur les
  initiales à `onError`.
- **`?city=dakar`** : le filtre serveur ignore la casse, mais la puce « Dakar » ne s'allumait pas
  (comparaison stricte, défaut antérieur) — corrigé (`memeVille`).
- **Délai** : `delaiDeReponse()` — `null`/non fini/négatif → rien (décision 12) ; < 60 min → « ~N
  min » (jamais 0) ; sinon heures arrondies ; ce qui s'arrondit à 24 h et plus → jours.
  `leases_signed_this_month` ne s'affiche que > 0, sur la vitrine seulement.
- **Vitrine vérifiée au navigateur avec une place TEMPORAIRE** (`agency_spotlights` id 4, Thiès
  Properties à Dakar, créée par tinker puis supprimée — `count` 0 et `spotlight: null` relevés
  après) : à 390 et 1440, une carte « Mise en avant » en tête ET Thiès Properties à son 3ᵉ rang.
- **Haut de l'écran au téléphone (TCK-2568, amendement d'ADR-0091)** : plus de barre du site sous
  `lg` sur `/agencies` et `/agents` (règle centrale de `barre-publique.ts`, rien à brancher ici).
  Le haut suit `EnTeteAnnuaire` de la maquette : titre à `pt-5` (**20 px**, mesuré), et titre +
  onglets + champ + villes **collés en haut** (`sticky top-0`, 205 px, fond `--background`) pendant
  le défilement — relevé : `scrollY` 400, titre toujours à 20 px du haut. Dès `lg`, la `Navbar`
  revient et l'en-tête redevient statique.
- **Mesure après** : à 390 × 844, premier `<li>` à **233 px** (titre de la ligne à 245 px), ligne de
  88 px, aucun défilement horizontal (`scrollWidth` 390). Avant la règle des en-têtes (barre du
  site de 69 px encore là) : 286 px.
- **Pluriels** : `card.response.{minutes,heures}` portent un `{count, plural, …}` même invariable —
  `src/i18n/__tests__/pluriels.test.ts` (TCK-752) l'exige de toute clé qui affiche un compte.
- **Juste avec ou sans la barre du site** : la constante de `barre-publique.ts` qui ôte la barre de
  l'annuaire au téléphone y entre et en sort avec les fiches (TCK-2522, TCK-2523). L'index lit donc
  le même prédicat que la `Navbar` (`enTeteAuTelephone('/<locale>/<ressource>')`) : sans la barre,
  en-tête collant à `top-0` et titre à `pt-5` ; avec elle (fixe, 69 px), collant à `top-[69px]` et
  `pt-3`. À `top-0` sous la barre, l'en-tête glissait sous elle ; et à `pt-5`, le premier résultat
  tombait à 302 px. Mesuré à 390 × 844 avec la barre (2026-11-09) : titre à 81 px, premier `<li>` à
  294 px, l'en-tête qui tient à 69 px jusqu'à la fin de `<main>`. À 1440, rien ne change (statique,
  titre à 111 px). Deux tests (`TCK-2568 — l’en-tête collant…`) forcent chacun des deux états.
- **Sans la barre, au navigateur** (après le retour de la constante, 2026-11-09, 390 × 844) : barre
  absente, cale à 0, titre à 20 px, en-tête collant à `top-0` sur sept URL (fr/en/wo, filtrées,
  vide). Premier `<li>` à 233 px, ou **285 px avec une ville** : « Effacer les filtres » ajoute une
  rangée de 52 px à l'en-tête collant. La maquette n'a pas ce bouton ; il est laissé en l'état et
  signalé, car c'est un contrat de TCK-436/573 gardé par deux tests.
- **Corrections de la revue (2026-11-09)** :
  - **Vitrine** : seulement en page 1, sans recherche par nom, et jamais au-dessus de l'état vide.
    L'API ne compte aucune impression pour `spotlight` (ni colonne ni enregistreur), donc le
    correctif est côté front seulement.
  - **Comptes** : `compterProfils` est éprouvé en panne (`null`, jamais 0).
  - **Accord** : « triée / triées », « trié / triés » en ICU.
  - **Puce active** : la puce de la ville active est ramenée dans la rangée au chargement (Kaolack :
    940 px → 293 px dans 390).
  - **Bureau** : `lg:static` est gardé par un test.
  - **Puces** : « Toutes », puce active en encre foncée (`bg-foreground text-background`, comme
    `Pastille`).
  - **Champ** : bouton loupe retiré ; le champ seul se soumet à `Entrée` (vérifié au navigateur) et
    porte `enterKeyHint="search"`. Clé `filters.submit` retirée.
  - **Effacer les filtres** : seulement sur une recherche par nom.
  - **Onglets** : `OngletsDeLAnnuaire` (transition, indicateur, liste estompée : 2,1 s mesurées).
  - **Vitrine au téléphone** : badge et monogramme sur la couverture, comme la maquette D.
- **Rangée de villes en bureau (contre-vérification, 2026-11-09)** :
  - **Correctif** : comme la maquette D, une seule rangée coupée, signalée par un fondu de 6rem sur
    le bord droit (`lg:[mask-image:…]`). `lg:pr-24` laisse la dernière puce hors du fondu une fois
    défilée.
  - **1440** : Rufisque et Kaolack sont dans le fondu au repos. Défilée jusqu'au bout, Kaolack
    s'arrête à 1245 px, au début du fondu.
  - **390** : rien ne change (aucun masque, Kaolack à 293–374 px, titre à 20 px, premier `<li>` à
    233 px).
  - **Fondu de 3rem écarté** : à cette largeur, la puce coupée était presque invisible.
