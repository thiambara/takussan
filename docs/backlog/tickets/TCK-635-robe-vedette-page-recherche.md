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

- [x] Carte de bien : une robe « vedette » (couleur, repère de coin, mention), mêmes dimensions.
- [x] Recherche : emplacements et places réservées dans la grille des résultats, sans étiquette
      au-dessus.
- [x] Accueil et biens similaires : la robe sur les biens en vedette.
- [x] En-tête des résultats sur une ligne (bureau) ; puces retirées de l'en-tête ; « Sauvegarder »
      en icône + mot + infobulle.
- [x] Taille de page à côté de la pagination, seulement à partir de deux pages.
- [x] Panneau de filtres refait, non collant.
- [x] `globals.css` : taille de base à 90 % à partir du seuil bureau.
- [x] Tests mis à jour ou ajoutés pour chaque comportement, ablation comprise.

## Critères d'acceptation

- [x] AC1 — Une carte en vedette et une carte nue voisines ont la même largeur et la même hauteur
      d'image, au bureau comme sur mobile ; la carte en vedette porte sa couleur et sa mention.
- [x] AC2 — Aucune étiquette ne précède plus une carte dans la grille ; les emplacements restent
      hors `total`, et un clic sur l'un d'eux reste marqué `src=sponsored`.
- [x] AC3 — Au bureau, le titre, le nombre de biens, le tri, « Sauvegarder » et la bascule tiennent
      sur une ligne ; aucune puce de filtre dans l'en-tête.
- [x] AC4 — La taille de page n'apparaît qu'avec la pagination, à côté d'elle.
- [x] AC5 — Le panneau de filtres défile avec la page.
- [x] AC6 — À partir du seuil bureau, `html` vaut 90 % de la taille par défaut ; en dessous, 100 %.
- [x] AC7 — Mobile (360, 390) et vue carte inchangés dans leur fonctionnement ; tests existants
      verts.
- [ ] AC8 — Captures avant/après des pages principales soumises au porteur avant toute PR.

## Hors périmètre

- Une robe par type de boost (arbitrage du porteur : une seule, celle de la Vedette).
- Le tableau de bord : il reçoit l'échelle à 90 % sans refonte.

## Notes d'implémentation

**La robe** (`PropertyCard`, prop `robe`). Un fond terre cuite à 8 %, un liseré à 35 %, et un ruban
plein au bord droit de la photo qui porte la mention (« Sponsorisé » dans un emplacement, « En
vedette » sur une place réservée). La robe se dessine dans la gouttière : `-m-1.5 p-1.5`, la marge
négative rend exactement la marge intérieure. Mesuré au navigateur, photo d'une carte en robe et
d'une carte nue voisines : **249 × 187 à 1440**, **328 × 246 à 360**, identiques (AC1).

- La robe est posée par une prop explicite, **jamais lue dans `featured`** : un bien en Vedette a
  aussi sa place organique plus bas dans la liste, et il n'y est pas un placement payé.
- **Biens similaires : pas de robe**, écart assumé avec « partout » de la direction UX. Aucun
  placement payé n'y est servi ; une robe y montrerait comme payée une place qui ne l'est pas
  (ADR-0061 §7, dans l'autre sens).
- Accueil : la rangée « Sélection de la semaine » (cartes Cover) porte la robe sur les biens dont
  la Vedette est active (`PropertyRow robeVedette`). Sur une carte Cover, la robe est un liseré
  DANS le cadre de la photo : la rangée défile et rognerait ce qui déborde.
- Le Badge (« Urgent », « Baisse de prix ») était une étiquette au-dessus de la carte, ce qui la
  décalait dans la grille : c'est une pastille sur la photo, avec la transaction. `MarquesDeBoost`
  ne sert plus que la fiche du bien.

**Recherche.** Les emplacements entrent dans la grille, en tête (`EmplacementsSponsorises` en
`contents`, chaque `<li>` est une cellule), seulement quand il y a des biens. Toujours hors
`total`, hors pagination, et le clic reste marqué `src=sponsored` (test existant). La clé
`search.sponsored.chip`, devenue morte, est retirée.

**En-tête.** Titre (`text-xl lg:text-2xl`) et compte sur un groupe, puis tri, « Sauvegarder »,
bascule : une ligne à 1440. Sous `lg`, la rangée de TCK-552 garde Filtres, tri, bascule, et reçoit
« Sauvegarder » en icône (les puces qui le portaient ont quitté l'en-tête). À 360, la rangée tient
sans tronquer « Pertinence » (Filtres en `px-3`, gouttière `gap-1`, tri en `px-2.5`).
« Sauvegarder » au bureau sans critère : `aria-disabled` et non `disabled`, sinon l'infobulle qui
explique pourquoi ne s'ouvrirait pas au survol. Infobulle : nouvelle primitive `ui/tooltip.tsx`
(Base UI), réexportée vers design-sync avec sa fiche et son aperçu.

**Puces.** Retirées de l'en-tête, **gardées dans l'état vide** (TCK-558 : elles y sont l'issue
proposée). Les tests des libellés de puces visent désormais `PucesDeFiltres` directement.

**Panneau de filtres.** Plus de `sticky`. Transaction, chambres et salles de bain en contrôles
segmentés ; types de bien en tuiles à pictogramme sur deux colonnes (le pictogramme de la bande de
catégories, `iconeDuType`) ; titres de section plus légers. Rail élargi de 264 à 280 px : à 90 %,
« Appartement » et « Commerce » se tronquaient dans leur tuile (mesuré : zéro troncature après).

**Échelle.** `@media (min-width: 64rem) { html { font-size: 90% } }` : 14,4 px à 1440, 16 px à
390 (mesuré). Ce qui est écrit en px (`text-[13px]`, `w-[280px]`) ne suit pas, par construction.

**Garde de contraste.** `ENCRES_INVERSES` 263 → 264 : le compte des biens, en
`text-muted-foreground` sur le fond de la page. Relevé fichier par fichier contre `HEAD`.

**Ablations** (une mutation, son test, le fichier restauré à l'identique) : quatorze, toutes
rouges. La robe retirée, la marge différente du remplissage, le ruban sans mention, le badge
absent, la place réservée sans robe, l'emplacement hors grille, l'emplacement sans robe, la taille
de page sans pagination, l'échelle à 100 %, le rail collant, la sauvegarde en `disabled`, la robe
sur tout bien de la rangée, les puces revenues dans l'en-tête, la sauvegarde absente de la rangée.
