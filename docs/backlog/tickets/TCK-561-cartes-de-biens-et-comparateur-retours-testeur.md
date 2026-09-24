---
id: TCK-561
title: "Comparateur : la croix de la barre vidait la sélection, des « + » sans action, un toast translucide illisible, absent des cartes de l'accueil ; cartes : un survol trop discret"
status: doing
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-23
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, mobile, comparateur, cartes, toast, a11y, ux, retour-testeur]
---

## Objectif utilisateur

Un visiteur compare des biens sans jamais perdre sa sélection par mégarde : il peut ranger la
barre du comparateur quand elle le gêne, la rouvrir, et ne vide la sélection que par une action
explicite, réversible. Il ajoute un bien au comparateur depuis l'accueil comme depuis la liste, lit
l'avis « 4 biens au maximum » sans qu'il se mêle à la page, et voit qu'une carte réagit à son
pointeur et à son doigt.

## Contexte

Retour testeur du 2026-09-23 (web + mobile, compte propriétaire), groupe B de la vague 69. Chaque
point a été établi par une mesure avant d'être corrigé (pile locale : front `localhost:3364`, API
`127.0.0.1:8364`, Chrome headless piloté par CDP, 1366 px et 390 × 844 / 360 × 740, dpr 3).

- **W1 — survol des cartes (liste publique, bureau)** — *confirmé.* « Une couleur un peu plus
  différente pour le hover. » Mesuré sur `/fr/properties?type=office` à 1366 px : la couleur du
  titre de `PropertyCard` valait `rgb(31, 24, 18)` au repos, au survol ET à l'appui ; le seul
  retour était un zoom de 5 % sur la photo (`PropertyCard.tsx`, `group-hover:scale-105`), et rien
  du tout à l'appui — le seul retour au toucher. La seconde moitié du retour (le chargement signalé
  en bas de page) relève du groupe A.
- **W7 — comparateur absent de l'accueil** — *confirmé.* Les quatre variantes de `PropertyRow`
  (`Standard`, `Listing`, `Cover`, `Compact` : carrousels de l'accueil, récemment consultés) ne
  portaient que le favori ; `PropertyCard` (liste) porte favori et comparateur. Le test de structure
  TCK-554 encodait l'écart (`comparateur: false` pour les quatre).
- **M5 — des « + » sans action** — *confirmé.* Mesuré à 390 px : les emplacements libres de la
  barre flottante étaient des `<li aria-hidden><span>+</span></li>`, sans lien ni bouton ni
  `tabindex`.
- **M6 — la barre « têtue » qui efface tout** — *confirmé.* Mesuré à 390 px : la seule croix de la
  barre était « Vider » (`onClick={clear}`) ; après un clic, la barre disparaissait ET le stockage
  valait `{"ids":[]}`. La barre mesurait 170 px (20 % de l'écran) sur toutes les pages publiques,
  sans aucun moyen de la ranger.
- **M7 — le comparatif illisible et « != »** — *non reproduit sur l'arbre courant.* Mesuré le
  2026-09-23 à 18:07 sur `/fr/compare?ids=407,471,508,151` : à 360 et 390 px, `scrollWidth =
  innerWidth`, aucune valeur coupée, badge « Diffère » (« Differs », « Wuute na »). Corrigé par
  TCK-529 (`dcdedc90`, 2026-09-16), déjà sur `origin/preview` ; la capture du testeur le précède.
  Le comparatif se lit désormais critère par critère, en défilement vertical seul.
- **M8 — l'avis « Maximum 4 biens » illisible** — *confirmé.* Mesuré à 390 px : fond du toast
  `oklab(… / 0.1)` (`bg-warning/10`, `components/ui/toast.tsx`) posé à 16 px du haut, sur l'en-tête :
  logo, recherche et texte des cartes transparaissaient sous l'avis. Même défaut pour les tons
  succès et erreur.

## Critères d'acceptation

- [x] W1 — au survol d'une carte, le titre passe à la couleur d'accent et se souligne, la photo se
      voile (10 %) ; à l'appui du lien, le voile passe à 25 %. Appuyer sur le favori ou le
      comparateur ne fait pas réagir la carte (`group-has-[a:active]`, seul `<a>` de la carte).
      *Mesuré à 1366 px : titre `rgb(31,24,18)` → `rgb(168,83,50)` au survol et à l'appui, voile
      `0 → 0.1 → 0.25`.* Test `cards/__tests__/survol-et-appui.test.tsx` (15), ablation : 10 rouges.
- [x] W7 — chaque variante de l'accueil porte UN bouton « Ajouter au comparateur », hors du lien,
      qui écrit la sélection avec l'aperçu (titre) du bien. *Mesuré sur `/fr` à 1366 et 390 px :
      48 cartes de carrousel, 48 avec comparateur, aucun débordement horizontal.* Tests
      `cards/__tests__/comparateur-sur-les-cartes.test.tsx` + `PropertyCard.structure.test.tsx`,
      ablation : 16 rouges.
- [x] M5 — le premier emplacement libre est une action nommée : sur la liste, il range la barre
      (« Ajouter un bien : choisissez-le dans la liste ») ; ailleurs, c'est un lien vers les
      annonces. Les suivants ne portent plus de « + ». *Mesuré à 390 px : bouton 56 × 56.*
- [x] M6 — un chevron « Réduire le comparateur » range la barre en pastille « Comparateur n/4 »
      (48 px), SANS toucher à la sélection ; l'état réduit suit le visiteur de page en page
      (`sessionStorage`) ; le focus passe au bouton qui rouvre. « Vider » est un bouton libellé,
      distinct, et réversible par « Annuler » dans le toast. *Mesuré à 390 px : 178 → 48 px,
      stockage inchangé, toujours réduite après rechargement, rouverte avec ses 2 biens.* Tests
      `compare/__tests__/CompareFloatingBar.test.tsx` (5 nouveaux), ablations : barre d'origine →
      5 rouges ; croix qui revide → 2 rouges ; « Annuler » neutralisé → 1 rouge.
- [x] M8 — les tons succès, avertissement et erreur du toast ont un fond opaque (`color-mix` avec
      `--card`). *Mesuré à 390 px : fond `color(srgb 0.954 0.933 0.906)`, sans alpha.* Test
      `ui/__tests__/toast-fond-opaque.test.tsx`, ablation rouge.
- [ ] M7 — re-mesure du comparatif après la vague : la pile locale a cessé de servir le front
      pendant la vérification (l'API 8364 n'autorise que l'origine `http://localhost:3000`) ; la
      preuve reste la mesure de 18:07.

## Hors périmètre

- Le retour de chargement au clic sur une carte (W1, seconde moitié) : groupe A
  (`IndicateurDeNavigation`).
- La position du toast (en haut, par-dessus l'en-tête) : inchangée — l'avis devient lisible par son
  fond ; le déplacer changerait tous les toasts du site.
