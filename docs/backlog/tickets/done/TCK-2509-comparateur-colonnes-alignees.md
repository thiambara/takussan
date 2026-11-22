---
id: TCK-2509
title: Comparateur « Colonnes alignées » : ce qui diffère, le meilleur marqué, « Partager »
status: done
phase: P1
family: front
estimate: M
wave: 85
created: 2026-11-08
updated: 2026-11-09
depends_on: []
blocks: []
spec_refs:
  features:
    - "docs/features.md#12-recherche--découverte-publique"
  models: []
tags: [front, comparateur, mobile, audit-ux]
---

## Objectif utilisateur

Comparer deux à quatre biens d'un coup d'œil au téléphone — trois valeurs côte à côte par critère, sans relire les noms — savoir lequel est le moins cher, le plus grand, le moins coûteux à l'entrée, puis envoyer la comparaison à la famille sur WhatsApp.

## Contrat de données

Aucun endpoint neuf : `GET /api/public/properties/compare?ids=` (TCK-082), critères et ordre de `compare-rows.ts`, coût d'entrée de l'API (TCK-598). Le loyer au m² se calcule au front (prix ÷ surface, seulement quand les deux existent).

## Direction UX / Artistique

- Maquette de référence : `/fr/playground/maquettes?p=comparateur&a=a` — **référence de fidélité, non versionnée** : à lire et à ouvrir dans l'arbre de travail principal du porteur, cf. [README de l'audit, § Maquettes](../../../qa/audit-ux-2026-11/README.md#maquettes).
- En-tête collant : une colonne par bien (photo, prix, titre court) ; chaque critère est une ligne dont les valeurs s'alignent sous leur bien.
- Par défaut, seulement les lignes qui diffèrent, suivies d'une phrase « Pareil pour les N : … » qui se déplie ; bascule « Tout afficher ».
- Le meilleur de chaque ligne marqué (moins cher, plus grand, coût d'entrée le plus bas, loyer au m² le plus bas) ; neutres : étage, meublé, quartier, équipements.
- Pied : « Ajouter un bien » et **« Partager »** (feuille de partage du téléphone, WhatsApp en tête ; copie du lien `?ids=` à défaut). **Pas de bouton « Visiter les N »** (décision du porteur, 2026-11-08) : Visiter et WhatsApp restent sur chaque bien.
- En bureau, « Copier le lien » devient « Partager ».

## Contraintes strictes (métier)

- L'URL `?ids=` fait foi et reste juste quand on retire un bien (corrige le relevé de l'audit où le panier la réécrivait).
- Quatre biens au plus ; la place libre se voit ; « Réduire » ne vide pas ; « Vider » s'annule sans écraser un bien ajouté entre-temps (TCK-561, TCK-577) ; la sélection tient 24 h.
- Un bien devenu indisponible quitte la comparaison avec un avis et « Biens proches » — il n'occupe plus une place.
- Une ligne vide pour tous les biens ne s'affiche pas.
- Plus de toast à chaque ajout (la pastille de TCK-2493 dit déjà « 3 »).

## Delta à produire

- [x] Grille en colonnes alignées sous en-tête collant (téléphone et bureau).
- [x] Filtre « seulement ce qui diffère » + phrase « Pareil pour les N ».
- [x] Marquage du meilleur par critère (table des critères qui ont un sens).
- [x] Ligne « Loyer au m² ».
- [x] « Partager » à la place de « Copier le lien ».
- [x] Sortie d'un bien indisponible avec avis.
- [x] Clés i18n `fr`/`en`/`wo`.
- [x] Tests (lignes différentes, meilleur marqué, `?ids=` après retrait, partage avec et sans `navigator.share`).

## Critères d'acceptation

- [x] AC1 — Trois biens dont deux critères sont identiques : ces critères n'apparaissent pas en ligne, et « Pareil pour les 3 » les nomme.
- [x] AC2 — Le moins cher porte la marque sur la ligne Prix ; aucune marque sur Étage ou Meublé.
- [x] AC3 — Retirer le deuxième bien donne une URL `?ids=` sans lui, et la recharger montre la même comparaison.
- [x] AC4 — Sans `navigator.share`, « Partager » copie le lien et le dit.
- [x] AC5 — À 360 px avec quatre biens, la page ne défile pas horizontalement (la grille défile dans son conteneur si besoin).

## Hors périmètre

- La pastille du comparateur et la règle des couches (TCK-2493).
- Une visite groupée de plusieurs biens.

## Notes d'implémentation

Mesures et décisions non évidentes (2026-11-09, agent « comparateur », vague 2) :

- **Prémisses re-mesurées.** Il n'existait aucun « Copier le lien » dans `components/compare/`
  (`grep -rn "clipboard\|copyLink" src/components/compare` → rien) : « Partager » est neuf, la copie
  n'en est que le repli. Le bien indisponible restait une colonne « Bien indisponible » en tirets,
  l'avis ne donnait qu'un compte. Le toast d'ajout vivait dans `useCompareToggle.ts` (retiré ; le
  refus du 5ᵉ garde son toast).
- **La cause du relevé `?ids=857,93,11` → `?ids=530`** : deux effets au premier rendu — l'un
  remplaçait la sélection par l'URL, l'autre, qui voyait encore l'ancienne sélection, réécrivait
  l'URL avec elle. Un seul effet désormais, qui ne dépend que de l'URL ; « Retirer » écrit l'URL et
  la sélection dans le même geste.
- **`history.replaceState`, pas `router.replace`** : relevé au navigateur, `router.replace` attend un
  aller-retour serveur avant de changer l'adresse (plusieurs secondes sous `next dev` chargé) ; un
  second retrait pendant l'attente partait de l'ancienne URL et y remettait le bien retiré
  (`?ids=857,854,853,999999` → retrait de 854 → `?ids=857,853,999999`). Next 16 relie
  `replaceState` à `useSearchParams` (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`).
  Les virgules de `ids` sont écrites à la main (`URLSearchParams` les encode en `%2C`).
- **Le meilleur** (`SENS_DU_MEILLEUR`, `compare-rows.ts`) : prix, coût d'entrée, prix au m² (le plus
  bas), surface (la plus grande). Chambres NON marquées (la maquette les marquait, le ticket non :
  plus n'est pas mieux pour tous). Les lignes d'argent ne se marquent que si tous les biens valués
  partagent devise, contrat et période ; une location sans `rent_period` compte au mois (même
  convention que l'histogramme, DÉCISIONS 16 — en dev, 854/853 n'ont pas de période). Ex æquo tous
  marqués ; valeurs toutes égales : pas de marque. La marque est annoncée (« (le moins cher) » en
  `sr-only`).
- **« Loyer au m² » / « Prix au m² »** : le libellé suit le contrat (« Loyer » si tous les biens
  valués sont des locations). Valeur arrondie à l'unité, formatée dans la devise du bien.
- **« Pareil pour les N »** nomme chaque critère (« Ville : Dakar ») ; au-delà de quatre, « + N
  autres » le déplie. La pastille « Diffère » des anciennes lignes a disparu : en « tout afficher »,
  les lignes pareilles sont atténuées (`data-divergent` reste dans le DOM).
- **La barre « Partager » de la maquette** (`BarrePartager`, fidélité demandée par la session
  d'après `docs/qa/audit-ux-2026-11/entetes-mobiles.md`) : au téléphone, `compare` rejoint
  `PREMIERS_SEGMENTS_SANS_BARRE` (`lib/navigation/barre-publique.ts`) — la barre d'onglets cède le
  bas à une barre FIXÉE « Ajouter un bien · Partager » (ADR-0091 §4, une seule couche). Deux gestes
  de même largeur (`grid auto-cols-fr` : en `flex-1`, le remplissage du lien donnait 192 px contre
  158, relevé au navigateur) ; sans place libre, « Partager » seul. La page réserve la hauteur de la
  barre SOUS son pied de page (`RESERVE_BARRE_PARTAGER`, 5 rem + zone sûre ≥ 77 px) : une cale dans
  le flux laissait le bas du pied de page sous la barre. Barre et réserve sous `md` seulement, comme
  la grille du téléphone : de 768 à 1023 px, ni onglets ni barre, « Partager » est dans la barre
  d'outils. Au bureau, rien ne change. Vérifié à 390 (barre 767-844, pied de page fini à 764,
  `scrollWidth` 390), 900 et 1440.
- **Visiter / WhatsApp par bien** (maquette, bureau) : non ajoutés, hors du Delta ; l'en-tête garde
  « Voir le bien » et « Retirer ».
- `CompareTable.tsx` et `CompareCarousel.tsx` sont supprimés (une seule grille, `CompareColonnes.tsx`) ;
  leurs tests sont repris dans `CompareColonnes.test.tsx` et `CompareColonnes.equipements.test.tsx`.
  `boite-compilee.ts` admet désormais les propriétés `--colonnes-mobile|bureau` en style en ligne.
  `decalage()` ne modélise pas une grille de plusieurs rangées : l'attente est comparée au vrai par
  les hauteurs déclarées (vignette, bascule), plus par la position calculée du 1ᵉʳ critère.
- Vérifié au navigateur : 390 × 844 et 360 × 780 (4 biens, `scrollWidth` = `innerWidth`), 1440 × 900 ;
  en-tête collant à `top` = cale ; `?ids=…,999999` → avis + URL corrigée immédiatement.

Corrections après la revue adverse (2026-11-09, refus de la première livraison) :

- **« Ajouter un bien » puis Retour effaçait l'ajout** : l'adresse `?ids=` de l'historique
  l'emportait sur la sélection. Le comparateur réécrit désormais `?ids=` (`replaceState`) à chaque
  changement et retient en `sessionStorage` (`takussan.compare.ids-ecrits`, `adresses-ecrites.ts`)
  l'ENSEMBLE des adresses qu'il a écrites dans l'onglet, bornées aux 20 dernières. Au montage, une
  adresse de cet ensemble = sa propre page d'historique : la sélection locale l'emporte et l'URL est
  réécrite. Sinon, c'est un lien partagé : l'URL l'emporte, et les aperçus (titre, photo) des biens
  qui restent sélectionnés sont gardés, relus au stockage. Vérifié au navigateur : 3 biens →
  « Ajouter un bien » → ajout d'un 4ᵉ → Retour → `?ids=857,854,853,20`, quatre colonnes.
  **Contre-vérification** : une première version ne retenait que la DERNIÈRE adresse ; après deux
  Retours (pastille → ajout → pastille → Retour → Retour), la page la plus ancienne passait pour un
  lien partagé et le bien ajouté était perdu — en production ; en dev, le double effet de
  StrictMode le remettait, sans aperçu. Les tests montent sans StrictMode (un passage d'effet).
- **Prix à 0** (accepté par l'API, `min:0`) : jamais marqué « le moins cher » — `valeurClassable`
  écarte toute valeur ≤ 0.
- **Valeur absente** : tests à trois biens — un bien sans valeur ne prend pas la marque et n'en prive
  pas le vrai meilleur. Une valeur ≤ 0 ou nulle est écartée par `valeurClassable` ; muter
  `entry_cost?.total ?? null` en `?? 0` est une mutation équivalente (la garde `> 0` l'écarte), la
  garde réelle — absente comptée 0 — rougit.
- **Presse-papiers qui refuse** : jamais « Lien copié » ; le toast d'échec montre le lien.
- **En-tête au téléphone** (maquette) : nom court (quartier, sinon ville, sinon titre) et
  « N ch. · S m² » ; le prix et le titre ne s'affichent qu'au bureau, le prix reste dans la ligne
  Prix. Le titre entier reste le nom accessible du lien.
- **Cellule marquée lisible à quatre colonnes** : la coche est une pastille dans le coin, l'espace
  insécable entre le nombre et la devise devient sécable (« 450 000 / F CFA » plutôt qu'une coupure
  dans le nombre), césure automatique.
- L'entrée de `CompareCarousel.tsx` est retirée de `takussan-web/eslint-suppressions.json`.
