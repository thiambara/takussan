---
id: TCK-635
title: "Recherche : une robe pour les biens en vedette, la page de résultats refaite, et le site à 90 % au bureau"
status: doing
phase: P1
family: front
estimate: M
wave: 75
created: 2026-10-12
updated: 2026-10-12
depends_on: [TCK-633]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, recherche, boost, design, responsive]
---

## Objectif utilisateur

- **Le visiteur qui cherche un bien** voit des résultats rangés et lisibles : un en-tête d'une ligne,
  des filtres qui défilent avec la page, et des biens en vedette reconnaissables sans qu'ils écrasent
  les autres.
- **L'annonceur qui a payé une Vedette** voit son bien se distinguer par sa couleur, à la même taille
  que les autres.

## Contrat de données

Aucun endpoint neuf. La page consomme ce que TCK-633 a livré : `GET /api/public/properties/search`
(champ `sponsored` hors pagination, `placement = reserved` sur les places réservées, `badge`), et
`featured` sur chaque bien (une Vedette active, ADR-0061 §5).

## Direction UX / Artistique

Retours du porteur du 2026-10-12, sur preview, et ses trois arbitrages (recommandations validées).

- **La robe d'un bien en vedette.** Aujourd'hui, une étiquette posée AU-DESSUS de la carte
  (« Sponsorisé », « En vedette ») et une première rangée de trois cartes plus grandes. Demandé :
  la même carte, à la même taille, dans la même grille, mais **habillée autrement** — une couleur
  qui lui est propre (cadre, zone de texte), et un repère dans un coin, à la manière des « Top
  annonces » de CoinAfrique. On reconnaît la même carte, en robe différente. Couleur de départ : la
  terre cuite de la charte (`--primary`), éventuellement assombrie.
- **Où :** partout où une carte de bien apparaît (recherche, accueil, biens similaires).
- **Une seule robe, celle de la Vedette.** Le Badge (« Urgent », « Prix en baisse ») reste une
  marque discrète ; la Remontée ne se voit pas (ADR-0061).
- **L'en-tête des résultats, au bureau : une ligne.** Le titre, plus petit ; juste après lui le
  nombre de biens trouvés ; à droite le tri, « Sauvegarder », puis la bascule Liste / Carte.
  « Sauvegarder » devient une icône et un mot, avec une infobulle qui explique ce qu'il fait.
- **La taille de page** descend à côté de la pagination, et n'apparaît que s'il y a au moins deux
  pages, comme elle.
- **Les puces des filtres appliqués** quittent l'en-tête.
- **Toute la page est revue, et d'abord le panneau de filtres**, qui défile avec la page au lieu de
  rester fixe.
- **L'échelle du bureau.** Le porteur trouve le site plus net et plus ergonomique à 90 % de zoom :
  la taille de base du texte passe à 90 % à partir du seuil où la barre de navigation passe en
  bureau. Le mobile garde 16 px (sous 16 px, Safari iOS zoome dans tout champ touché).

## Contraintes strictes (métier)

- **Un résultat payé ne se présente jamais comme un résultat organique** (ADR-0061 §7) : la robe
  porte une mention lisible — « Sponsorisé » dans un emplacement, « En vedette » ailleurs —, pas
  seulement une couleur ou une icône.
- Les emplacements restent **hors pagination et hors `total`**, et le clic sur l'un d'eux reste
  attribué à son emplacement (`src=sponsored`, ADR-0061 §10).
- Mobile et vue carte : ce que TCK-552, TCK-553 et TCK-558 ont posé tient (rangée d'outils unique,
  carte plein écran, pastille flottante, puces dans l'état vide, où elles sont l'issue proposée).
- Une carte en robe garde les dimensions d'une carte nue, à tous les paliers.

## Delta à produire

- [ ] Carte de bien : une robe « vedette » (couleur, repère de coin, mention), mêmes dimensions.
- [ ] Recherche : emplacements et places réservées dans la grille des résultats, sans étiquette
      au-dessus.
- [ ] Accueil et biens similaires : la robe sur les biens en vedette.
- [ ] En-tête des résultats sur une ligne (bureau) ; puces retirées de l'en-tête ; « Sauvegarder »
      en icône + mot + infobulle.
- [ ] Taille de page à côté de la pagination, seulement à partir de deux pages.
- [ ] Panneau de filtres refait, non collant.
- [ ] `globals.css` : taille de base à 90 % à partir du seuil bureau.
- [ ] Tests mis à jour ou ajoutés pour chaque comportement, ablation comprise.

## Critères d'acceptation

- [ ] AC1 — Une carte en vedette et une carte nue voisines ont la même largeur et la même hauteur
      d'image, au bureau comme sur mobile ; la carte en vedette porte sa couleur et sa mention.
- [ ] AC2 — Aucune étiquette ne précède plus une carte dans la grille ; les emplacements restent
      hors `total`, et un clic sur l'un d'eux reste marqué `src=sponsored`.
- [ ] AC3 — Au bureau, le titre, le nombre de biens, le tri, « Sauvegarder » et la bascule tiennent
      sur une ligne ; aucune puce de filtre dans l'en-tête.
- [ ] AC4 — La taille de page n'apparaît qu'avec la pagination, à côté d'elle.
- [ ] AC5 — Le panneau de filtres défile avec la page.
- [ ] AC6 — À partir du seuil bureau, `html` vaut 90 % de la taille par défaut ; en dessous, 100 %.
- [ ] AC7 — Mobile (360, 390) et vue carte inchangés dans leur fonctionnement ; tests existants
      verts.
- [ ] AC8 — Captures avant/après des pages principales soumises au porteur avant toute PR.

## Hors périmètre

- Une robe par type de boost (arbitrage du porteur : une seule, celle de la Vedette).
- Le tableau de bord : il reçoit l'échelle à 90 % sans refonte.

## Notes d'implémentation

_(à remplir par implementing-specs)_
