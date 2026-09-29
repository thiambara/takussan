---
id: TCK-584
title: "Accueil : la barre de recherche de la maquette (« Acheter | Louer » segmenté et animé), le fond « Coup de cœur » qui disparaissait, et la revue de design de la page"
status: done
phase: P1
family: front
estimate: M
wave: 72
created: 2026-09-29
updated: 2026-09-29
depends_on: [TCK-583]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/design-guidelines.md
  models: []
tags: [front, design, accueil, recherche, navbar, cartes, animation]
---

## Objectif utilisateur

Qui arrive sur l'accueil choisit « Acheter » ou « Louer » d'un geste, voit son choix glisser sous
son doigt, et le retrouve dans la recherche qu'il lance — à la loupe comme à la touche Entrée. La
rangée « Coup de cœur » garde son fond à motifs, et la page ne présente plus d'écarts visibles
(libellés, alignements, vides, troncatures).

## Contrat de données

Aucune donnée nouvelle. L'URL de recherche garde ses paramètres (`q`, `contract_type`, `type`…) :
seule la façon de choisir `contract_type` change.

## Direction UX / Artistique

Source : `Accueil.dc.html` du projet claude.ai/design « Takussan » — barre de 52 px, épingle de
lieu terracotta, champ, sélecteur segmenté « Acheter | Louer » dont la pastille de carte glisse en
320 ms sur `cubic-bezier(0.2, 0.8, 0.2, 1)`, apparaît depuis `scale(0.85)`, et qu'un second appui
retire ; loupe ronde de 40 px.

## Contraintes strictes (métier)

- « Aucune transaction » reste exprimable (l'ancien menu le permettait).
- Le choix vaut pour TOUS les gestes qui lancent la recherche, pas seulement la loupe.
- Le libellé des pastilles de cartes reste celui que reprennent les puces de la barre de filtres
  (TCK-552) : « En vente / En location ».
- Aucune couleur écrite en dur ; `prefers-reduced-motion` respecté.

## Delta à produire

- [x] `SelecteurDeTransaction` (boutons à bascule `aria-pressed` dans un groupe nommé), à la place
      du menu déroulant de la barre de bureau, et dans l'écran de recherche mobile, qui n'en avait
      aucun.
- [x] `SearchAutocomplete` : icône paramétrable (`icone`) et paramètres imposés (`imposer`) — Entrée
      et suggestion choisie emportent la transaction.
- [x] Le fond de « Coup de cœur » ne disparaît plus à la fin de l'animation d'entrée.
- [x] Revue de la page : corriger les écarts mesurés (voir les notes).

## Critères d'acceptation

- [x] AC1 — La barre de bureau reproduit la maquette ; la pastille glisse à la bascule (relevé
      image par image au navigateur) et s'efface sans choix.
- [x] AC2 — Loupe ET Entrée produisent `contract_type` ; sur la liste, le sélecteur part de la
      transaction en vigueur, et le retirer la retire de l'URL.
- [x] AC3 — 2,5 s après le chargement, le fond à motifs de « Coup de cœur » est toujours peint.
- [x] AC4 — Aucun débordement horizontal ni libellé tronqué à 1440, 390 et 360 px.
- [x] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test`, gardes du dépôt verts.

## Hors périmètre

- Les boutons favori/comparateur sur photo en thème sombre (icônes invisibles) : la page publique
  n'est sous aucune portée `.dark` (`src/test/portees-sombres.ts`), le défaut n'y est pas atteignable.
- Le reste de la maquette `Accueil.dc.html` (sous-titre marketing, que `design-guidelines.md` refuse).

## Notes d'implémentation

- **« Coup de cœur » : cause mesurée.** Le fond est en `-z-10` dans une `section` sans contexte
  d'empilement. `animate-section-enter` (`backwards`) en créait un le temps de jouer (opacité < 1,
  `transform`), puis le rendait : le fond repassait sous le `bg-background` de la racine.
  Au navigateur, 2,5 s après : le point au cœur de sa marge renvoyait `MAIN`. `isolate` sur la
  section ; re-mesuré, le point renvoie le fond.
- **Entrée partait sans la transaction** — déjà vrai avec l'ancien menu : `SearchAutocomplete`
  construit sa propre URL. Prop `imposer` ; ablation : sans elle, le test « Entrée » rougit seul.
- **Animation relevée** : repos `opacity 0 / scale 0.85` ; Acheter +90 ms `opacity 0.97 / scale
  0.98` ; Louer +100 ms `translate 78 %`, fin `100 %`. Largeur des boutons constante (82/82 px) :
  le libellé gras est réservé par un double invisible.
- **Revue de la page, écarts mesurés puis corrigés** :
  - pastille de recherche mobile tombée à 88 px (390) / 58 px (360), « Chercher » tronqué — le logo
    de TCK-583 mesure 158 px. Sous `sm`, le symbole seul (nom toujours lu) : 212 / 182 px ;
  - titres de rangée à 52 px contre 48 pour le `<h1>` et les cartes (`px-1` sans raison écrite) ;
  - 176 px de vide avant le pied de page au lieu de 96 : `space-y` de Tailwind 4 pose la marge
    SOUS chaque enfant sauf le dernier, et le dernier était « Récemment consultés », vide. `flex
    gap-20` + `empty:hidden` ;
  - pastilles « Vente / Location » d'un côté, « En vente / En location » de l'autre : forme longue
    partout (celle de TCK-552). La forme courte avait été essayée : elle cassait l'accord avec les
    puces de filtres (7 tests rouges). Dans `PropertyCardListing`, la pastille passe en bas de la
    vignette — à côté du cœur elle n'avait que 74 px pour 86 ;
  - cartes de couverture sans photo : dégradé sombre sur beige, terne. Attente à l'encre
    réchauffée (`PropertyPhoto ton="sombre"`) ;
  - filigrane du pied de page en capitales, comme le logo ;
  - /impeccable (audit) : 2 avertissements du détecteur sur les onglets de catégories
    (`border-b-2` + `rounded-t-lg`), faux positifs — seuls les coins du haut sont arrondis ;
    cible tactile du segmenté mobile 40 → 44 px ;
  - /make-interfaces-feel-better : rayons concentriques de `PropertyCardListing` (16 → 20 px),
    `text-balance` sur le `<h1>`, filet à 10 % sur les photos, appui `scale(0.96)` et zone d'appui
    de 46 px sur le segmenté.
- **Cliquet de contraste de la surface publique 247 → 248** (`surface-publique.contraste.test.ts`,
  daté et justifié sur place) : le sélecteur neuf pose son encre sans fond sur l'élément ; mesuré
  4,85:1 à 17,53:1 sur ses deux fonds réels. L'attente sombre de `PropertyPhoto` a d'abord ajouté
  une entrée (fond en `color-mix`, que la garde ne lit pas) : elle passe par `bg-foreground/92`,
  qui laisse aussi la plaque « En vente » se détacher (vérifié à l'œil).
- Le filet des photos passe par `--shadow-color` : `check-public-chrome-tokens` refuse `--scrim`
  hors d'un fond, et un littéral `oklch` hors jetons.
- Mesures prises en dev contre l'API locale, par `localhost:3000` (l'API n'autorise pas
  l'origine `127.0.0.1`, écart d'hôte documenté dans `takussan-web/CLAUDE.md`).
