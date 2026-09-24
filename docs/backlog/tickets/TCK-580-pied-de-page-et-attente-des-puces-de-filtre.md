---
id: TCK-580
title: "Pied de page redessiné (mobile et bureau), et les puces de filtre montrent qu'elles chargent — du clic à l'arrivée des biens"
status: done
phase: P1
family: front
estimate: M
wave: 69
created: 2026-09-24
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/features.md#24-recherche--filtres
  models: []
tags: [front, design, recherche, pied-de-page, chargement]
---

## Objectif utilisateur

Deux demandes du porteur, le 2026-09-24 :

1. **Le pied de page**, en mobile et au bureau, a le niveau du reste du site.
2. **Cliquer une puce de filtre montre tout de suite qu'on a cliqué**, et que les biens sont en
   train d'arriver — jusqu'à ce qu'ils soient là.

## Contexte — relevé par la session le 2026-09-24

**Pied de page** (captures avant, 390 et 1440 px) :

- bureau : quatre colonnes génériques, les titres de colonne en Bricolage `text-lg` rivalisent avec
  la marque ; aucune action ; rien ne signe la page ;
- mobile : 842 px de haut ; une grille de deux pistes laisse « Vos outils » seul sur sa rangée, avec
  un trou de 171 px à droite ; les liens juridiques centrés se replient en trois lignes inégales.

**Puces** — le chemin d'un clic, mesuré dans le code :

- `useSearch` appelait `router.push` **hors transition** : rien ne changeait à l'écran pendant
  l'aller-retour RSC (l'URL, donc `useSearchParams`, n'atterrit qu'à sa fin) ;
- puis la grille passait à `opacity-50` le temps du `fetch`, sans un mot ;
- seule la bande des catégories de la `Navbar` (bureau) avait un retour (`BarreDeChargement`).
- **Défaut de fond trouvé au passage** : deux clics rapprochés fusionnaient chacun avec l'URL
  d'avant — le second **effaçait** le premier.

## Ce qui est livré

**Pied de page** (`Footer.tsx`) :

- une grille, trois gabarits : mobile 2 pistes (la langue comble la case de « Vos outils »),
  `md` 3 pistes, bureau 12 pistes (signature + langue sur 1-4, colonnes sur 7-12) ; le choix de
  langue reste UN exemplaire, jamais masqué (`Footer.test.tsx`) ;
- une action « Publier un bien » (même encre inversée que « Publier » de la barre), déclarée dans
  `footerLinks.action` pour rester sous les deux gardes de liens ;
- titres de colonne sobres, liens soulignés au survol, barre du bas alignée à gauche sous `md` ;
- la signature : le nom en SVG à la largeur du pied de page, coupé par son bord, `fill-primary/10`,
  `aria-hidden`. Contrastes AA inchangés (`chrome-publique.contraste.test.tsx`).

**Attente des puces** :

- `useSearch` : navigation dans `useTransition`, filtres **visés** par `useOptimistic`, et
  `enCours` / `filtresDesResultats` — l'attente vaut du clic à l'arrivée des biens, sans le rendu
  « trou » entre l'URL et l'effet (chaque état du reducer porte la clé de sa réponse) ; deux gestes
  rapprochés se cumulent ;
- panneau de filtres : la puce touchée est pressée tout de suite et porte `AttenteDePuce` (coin,
  hors flux), `aria-busy` ; bascules « Meublé » / « En vedette » idem ; bouton du tiroir mobile ;
- puces actives : un retrait reste visible, barré, ✕ → chargement, `aria-disabled` ; un ajout
  apparaît tout de suite avec le chargement ;
- navbar : le pictogramme de la catégorie cliquée cède sa place au chargement ;
- page : grille estompée et désaturée dès le clic, `aria-busy`, pastille
  `ActualisationDesResultats` accrochée sous la barre (hauteur nulle dans le flux).

## Critères d'acceptation

- [x] AC1 — du clic à l'arrivée des biens, `enCours` ne retombe à aucun rendu intermédiaire
  (`useSearch.attente.test.tsx`, vérifié par ablation des trois mécanismes : transition, clé des
  résultats, fusion avec les filtres visés).
- [x] AC2 — deux gestes rapprochés se cumulent dans l'URL (même fichier, rouge sur l'ancienne fusion).
- [x] AC3 — seule la puce touchée attend, dans le panneau comme dans la rangée des puces actives ;
  une valeur remplacée est un retrait puis un ajout (`attente-des-puces.test.tsx`, 6 rouges sur 8
  à l'ablation).
- [x] AC4 — seule la catégorie cliquée de la navbar tourne, et plus rien à l'arrivée
  (`Navbar.attente-categorie.test.tsx`, rouge à l'ablation).
- [x] AC5 — pied de page : tests existants verts (AC1 de TCK-437, liens localisés, contraste AA
  clair et sombre), aucun débordement horizontal à 390 et 1440.

## Hors périmètre

- Une barre de progression globale pour les `router.push` hors recherche.
- La bande des catégories mobile (elle n'existe pas sous `lg`).
