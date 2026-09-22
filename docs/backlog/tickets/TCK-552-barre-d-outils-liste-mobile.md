---
id: TCK-552
title: "Liste des biens sur mobile : 42 à 70 % du premier écran pris par six rangées de contrôles, qui disparaissent ensuite au défilement"
status: todo
phase: P1
family: front
estimate: M
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models: []
tags: [front, mobile, recherche, filtres, ux]
---

## Objectif utilisateur

Sur téléphone, un visiteur voit des biens dès l'arrivée sur la liste, et peut affiner (filtres,
tri, carte) **à tout moment** du défilement sans remonter en haut de la page.

## Contexte

Audit UI/UX mobile de `/fr/properties` du 2026-09-22 (constats P1 à P8, M4, et la partie
« contrôles » de E1), mesuré à 390 × 844 et 360 × 740.

- **P1** — avant la première carte s'empilent six rangées : `<h1>`, compteur, « 30 / page » + tri +
  Filtres, puces actives, Liste/Carte, « Sauvegarder la recherche ». Première image à **356 px sur
  844** sans filtre (42 %), à **519 px sur 740** avec quatre filtres à 360 px (70 %) — aucune carte
  entière au premier écran.
- **P2** — « 30 / page » est le premier contrôle, avant Filtres.
- **P3** — Filtres, l'action principale sur mobile, est dernier, en style secondaire, et passe seul
  à la ligne à 360 px ; sa pastille de compte déborde du bouton.
- **P4** — à `scrollY = 1500`, seule la `nav` est fixe : Filtres, tri et carte sont hors d'atteinte
  sur une grille de ~4 400 px.
- **P5** — les onglets Liste/Carte font **24 px** de haut et occupent une rangée entière.
- **P6** — le `<h1>` est à 28 px et tient sur deux lignes à 360 px.
- **P7** — « Sauvegarder la recherche » est seul sur sa rangée ; sans filtre, il est `disabled` à
  50 % d'opacité **sans aucune explication** — il se lit comme un bouton cassé.
- **P8** — la puce de recherche libre affiche des guillemets bruts (`"Dakar"`) ; la même notion
  s'écrit « Location » (puce, tiroir), « En location » (carte) et « Louer » (menu) ; la puce de prix
  écrit « FCFA » quand les cartes écrivent « F CFA ».
- **M4** — en vue carte, « 30 / page » et le tri restent affichés alors qu'ils n'y agissent pas.
- **E1** (contrôles) — à 0 résultat, « 30 / page », le tri et Liste/Carte restent affichés.

Revue adverse intégrée : une barre **haute** collante ajouterait ~52 px permanents à la `nav` (déjà
68 px) ; l'accès pendant le défilement passe donc de préférence par un élément **flottant bas**,
qui doit cohabiter avec le dock flottant existant (TCK-275 : barre du comparateur, messagerie).

## Contrat de données

Aucun endpoint nouveau. `per_page` reste accepté dans l'URL et par l'API ; seul son contrôle
disparaît de l'interface mobile. Le compte vient de `meta.total`, déjà reçu.

## Direction UX / Artistique

- **Une seule rangée d'outils** sous le titre : Filtres en tête et en style principal, puis tri,
  puis bascule carte. Les puces actives suivent, et l'action de sauvegarde vient **au bout des
  puces** — elle n'a de sens que s'il y a quelque chose à sauvegarder.
- Pendant le défilement, Filtres et Carte restent à portée du pouce, dans le dock du bas, sans
  masquer la barre du comparateur ni la messagerie.
- Titre de page plus compact sur mobile : il reste le `<h1>` (TCK-432), il cesse de prendre deux
  lignes.
- Un seul mot pour une transaction dans toute la page ; la devise écrite par une seule fonction de
  formatage.
- Critère d'ensemble : **une carte entière visible au premier écran à 360 × 740 avec quatre
  filtres actifs.**

## Contraintes strictes (métier)

- Le `<h1>` dérivé des filtres (TCK-432) reste présent, avec le même texte.
- Le bureau (`lg` et plus) n'est pas modifié.
- `?per_page=60` dans une URL continue de rendre 60 résultats.
- Le dock flottant reste l'unique orchestrateur du bas d'écran (TCK-275) : aucun élément flottant
  n'en masque un autre.
- Libellés via next-intl, vérifiés en `fr`, `en` et `wo` à 360 px.

## Delta à produire

- [ ] Rangée d'outils mobile unique : Filtres (principal), tri, bascule liste/carte ; plus de
      « 30 / page » sous `lg`.
- [ ] Bascule liste/carte en un seul contrôle de 44 px de haut.
- [ ] Accès à Filtres et à la carte pendant le défilement, via le dock flottant du bas.
- [ ] Sauvegarde de recherche au bout des puces quand au moins un filtre est actif, absente sinon ;
      son libellé dit ce qu'elle fait (alerte ou non, selon `notification_frequency`).
- [ ] `<h1>` plus compact sous `md`.
- [ ] Puces : recherche libre signalée par une icône et non par des guillemets ; libellé de
      transaction unique sur la page ; montants par la fonction de formatage des cartes.
- [ ] Vue carte et état à zéro résultat : tri et bascule masqués quand ils n'agissent pas.
- [ ] Tests : présence/absence des contrôles selon vue et nombre de résultats ; `per_page` d'URL
      respecté.

## Critères d'acceptation

- [ ] AC1 — à 360 × 740 sur `?contract_type=rent&type=villa,apartment&furnished=true&price_max=2000000`,
      le bas de la première carte (image + prix + titre) est au-dessus de 740 px.
- [ ] AC2 — à 360 et 390 px, Filtres, tri et bascule tiennent sur **une** rangée en `fr`, `en` et
      `wo` (une seule valeur distincte de `top` arrondi parmi les trois contrôles).
- [ ] AC3 — à `scrollY = 1500`, un contrôle Filtres et un contrôle Carte sont visibles et
      activables ; avec un bien ajouté au comparateur, la barre du comparateur reste entièrement
      visible et aucun élément flottant n'en chevauche un autre.
- [ ] AC4 — aucun contrôle « par page » n'est rendu sous `lg` ; `?per_page=60` rend toujours 60
      cartes.
- [ ] AC5 — sans filtre actif, aucun bouton désactivé de sauvegarde n'est rendu ; avec un filtre,
      l'action de sauvegarde est sur la rangée des puces.
- [ ] AC6 — la bascule liste/carte a une zone tactile d'au moins 44 px de haut.
- [ ] AC7 — aucune puce ne contient de guillemet `"` ; la page n'affiche qu'un seul libellé pour la
      transaction location ; la puce de prix et les cartes écrivent la devise à l'identique.
- [ ] AC8 — en vue carte et à zéro résultat, le tri n'est pas rendu.

## Hors périmètre

- Le contenu de la vue carte (TCK-553) et du tiroir de filtres (TCK-556).
- Les cartes de résultat (TCK-554, TCK-555).
- La pagination (TCK-557) et le message de l'état vide (TCK-558).

## Notes d'implémentation

_(à remplir par implementing-specs)_
