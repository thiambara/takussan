---
id: TCK-577
title: "Comparateur mobile : un en-tête de cartes-photos qui défilait de côté repoussait le premier critère sous le premier écran ; titres numérotés collants pendant la lecture"
status: done
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-24
updated: 2026-09-24
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, mobile, comparateur, a11y, ux, retour-testeur]
---

## Objectif utilisateur

Sur téléphone, un visiteur qui ouvre le comparatif voit ses biens ET le premier critère dès le
premier écran, sans défiler de côté ; pendant qu'il descend dans les critères, il sait toujours
quelle valeur est à quel bien.

## Contexte

Retour testeur du 2026-09-23, point M7 : « sur mobile on a du mal à tout voir sans scroller ». La
partie « illisible et `!=` » du même point est close par TCK-529 (cf. TCK-561, M7) ; restait la
hauteur, que la vérification de TCK-561 a laissée ouverte comme décision produit. **Décision du
porteur (déléguée) : rendre la comparaison lisible sur mobile, bureau inchangé.**

Mesuré le 2026-09-24 sur la pile locale (`localhost:3000`, API `127.0.0.1:8002`), Chrome headless
par CDP, `/fr/compare?ids=407,471,508,151` (quatre biens réels de la base de démonstration) :

| écran | en-tête avant | 1ᵉʳ critère avant | 1ᵉʳ critère après | critères entamés dans le 1ᵉʳ écran |
|---|---|---|---|---|
| 320 × 640 | 282 px de haut, 1 015 px de large pour 288 visibles | 519 px | **350 px** (bas à 508) | 1 → 2 |
| 360 × 740 | 308 px, 1 151 px pour 328 | 525 px | **330 px** (bas à 488) | 2 → 3 |
| 390 × 844 | 327 px, 1 253 px pour 358 | 544 px | **330 px** (bas à 488) | 2 → 4 |

Avant : une bande de cartes à 85 % de largeur (photo 4:3, titre, « Voir le bien », « Retirer »)
qui défilait horizontalement ; à 360 px, le premier critère commençait sous la première carte et
les trois autres biens n'étaient visibles qu'en balayant. Une fois les photos passées, rien ne
rappelait quel bien était lequel, sinon le titre tronqué devant chaque valeur.

## Ce qui a été fait

`components/compare/CompareCarousel.tsx` (le comparateur sous `md`, seul modifié) :

- **Tous les biens dans la largeur**, en grille d'une colonne par bien (2 à 4), plus de défilement
  horizontal : une rangée de **vignettes** de 56 px (`PropertyPhoto compact`), chacune portant le
  bouton « Retirer <titre> » (28 px dessinés, 44 px d'appui par pseudo-élément, posé hors du cadre
  `overflow-hidden` qui rognerait la zone) ;
- une rangée de **titres numérotés**, liens vers la fiche (44 px de haut), **collante** sous la
  barre de navigation (`sticky top-[69px]`, la hauteur de `NavbarSpacer` sous `lg`) sur fond
  `bg-surface` pleine largeur ;
- **le même numéro** devant chaque valeur de chaque critère, devant le titre du bien : quand les
  vignettes ont défilé, la rangée collante dit « 1 Parking… 2 Villa… », et chaque ligne lue porte
  son numéro. Le numéro est `aria-hidden` : un lecteur d'écran entend le titre.
- Le libellé du groupe ne dit plus « balayez » : `compare.carousel.ariaLabel` réécrit
  (« Comparaison des biens, critère par critère »), `compare.carousel.headerAria` ajouté
  (« Biens comparés ») — trois langues, par `i18n-set.mjs`. *Le wolof de
  `compare.carousel.ariaLabel` et de `compare.table.header` a été corrigé ensuite par la session
  (« Méengalu kër yi, tànneef ak tànneef », « Tànneef ») : « critère » s'y dit « tànneef ».*

Le tableau de bureau (`CompareTable`, `hidden md:block`) n'est pas touché.

## Critères d'acceptation

- [x] À 360 × 740 et 390 × 844, le premier critère est **entièrement** dans le premier écran (bas à
      488 px), et à 320 × 640 aussi (bas à 508) ; `scrollWidth = innerWidth` aux trois largeurs.
      *(CDP, relevé ci-dessus ; captures `scratchpad/U7/shots/apres-{320,360,390}.jpg`.)*
- [x] Après 600 px de défilement, la rangée des titres est collée à 69 px (sous la `nav`), 57 px de
      haut, à 320, 360 et 390 px. *(CDP, `apres-*-defile.jpg`.)*
- [x] Chaque bouton « Retirer » et chaque lien de titre offre 44 × 44 px au moins
      (`elementFromPoint` sur une grille au pixel) : 4 biens à 320, 3 à 360, 2 à 390.
      *Correction du 2026-09-24 : c'était une MESURE, qu'aucun test ne gardait pour le bouton —
      retirer `after:absolute after:-inset-2 after:content-['']` laissait tout vert. Gardé
      depuis la reprise ci-dessous.* *Seconde correction : la garde de la reprise se contournait
      encore — `after:hidden`, `after:pointer-events-none` et `overflow-hidden` sur la liste des
      vignettes la laissaient verte (28 × 28, 28 × 28 et 40 × 40 au navigateur, relevé du
      vérificateur). La seconde reprise les a fermés, pas tous : `after:content-none` et
      `after:-z-10` passaient encore (28 × 28 au navigateur). Fermés par la troisième passe
      ci-dessous ; un calque posé PAR-DESSUS le bouton reste hors de la garde (listé).*
- [x] Bureau inchangé : à 768 et 1 366 px, `outerHTML` du tableau et géométrie de ses 400 premiers
      nœuds identiques avant/après (md5 `0b77222a…` ; rects `43ff918f…` à 768, `4ec8ddfe…` à 1 366),
      bloc mobile non affiché.
- [x] Tests `compare/__tests__/CompareCarousel.test.tsx` (7, 9 depuis la vérification, 10 depuis la reprise) : une colonne par bien et aucun
      conteneur `overflow-x-auto`/`snap-x` ; rangée collante à la hauteur lue dans
      `NavbarSpacer.tsx` ; même numéro dans la rangée des titres et devant chaque valeur ; numéro
      `aria-hidden` ; retrait nommé qui retire le bon bien ; bien indisponible gardé en colonne.
      *Ablations : ancien composant → 5 rouges sur 7 ; numéro retiré des valeurs + rangée collée à
      64 px → 2 rouges, chacun le sien. Restauré par `cp`, md5 `1bc7bd13d13152e147521bbfc5ab1b41`.*
- [x] **L'attente a la forme du comparatif** (vérification adverse, défaut préexistant du même
      périmètre) : `CompareClient.LoadingState` posait `repeat(n, minmax(200px, 1fr))` à photos
      4:3, bureau comme téléphone. *Reproduit par CDP, requête `/properties/compare` retenue
      (`Fetch.requestPaused`), quatre biens : `innerWidth = scrollWidth = 864` à 320, 360 et 390
      (l'émulation mobile élargit le viewport au contenu), 880 pour 768 à 768.* Désormais, sous
      `md`, le squelette reprend l'en-tête compact (vignettes `h-14`, titres `h-11` dans la même
      boîte `mt-1 py-1.5 border-b`, critères `h-40`) ; au-dessus, les colonnes du tableau en
      `minmax(0, 1fr)`. *Après : `scrollWidth = innerWidth` à 320, 360, 390 et 768 ; premier
      critère du squelette à 350 px (320) et 330 px (390), exactement là où le vrai arrive — aucun
      saut ; 1 366 inchangé (colonnes 292 × 219).* Test
      `compare/__tests__/CompareClient.chargement.test.tsx` (2 : aucune colonne à largeur
      minimale ; hauteurs lues sur le vrai `CompareCarousel`). *Ablations : ancien squelette → 2
      rouges ; `minmax(200px…)` seul → 1 ; titres `h-10` → 1. md5 restauré `6cad9aae…`.*
      *Correction du 2026-09-24 : « aucun saut » était MESURÉ, pas gardé. Le test comparait des
      classes une à une (`h-`, `min-h-`, `mt-`/`py-`/`border-b` de la rangée des titres) et ne
      lisait ni la marge des critères ni l'affichage par largeur : `mt-3` → `mt-8` dans l'attente
      (le premier critère remonte de 20 px à l'arrivée) et `hidden gap-4 md:grid` → `grid gap-4`
      (le squelette de bureau affiché sous le mobile) le laissaient vert. Gardé depuis la reprise
      (3 tests).* *Seconde correction : pas entièrement — l'affichage ne lisait que le bloc
      lui-même, et `hidden` sur l'enveloppe `aria-busy` (aucun squelette du tout) ou sur celle du
      comparatif chargé laissait 13/13 verts. La seconde reprise lisait la chaîne des ancêtres, mais
      pas l'attribut HTML `hidden` (squelette mobile de 0 px, 14/14 verts) : fermé par la
      troisième passe ci-dessous.*
- [x] **L'exigence de hauteur et le fond collant sont gardés par des tests de VALEUR**
      (vérification adverse : une photo 4:3 revenue ou un `bg-transparent` laissaient 7/7 verts).
      `CompareCarousel.test.tsx` compile les classes par le Tailwind du dépôt
      (`src/test/__tests__/couleur-compilee.ts`) : le cadre de la vignette fixe sa hauteur et ne
      porte aucun `aspect-ratio` (une 4:3 ferait 272 px de haut à 2 biens sur 767 px) ; la rangée
      des titres vaut 57 px (la hauteur relevée au navigateur) ; l'en-tête entier tient dans
      261 px, le budget du relevé le plus serré (320 × 640 : 640 − 221 d'en-tête de page − 158 du
      premier critère) ; le fond de la rangée collante est d'opacité 1 en clair et en sombre.
      *Ablations (md5 restauré `1bc7bd13…`) : `aspect-4/3` (la mutation de la vérification) → 1
      rouge ; `h-64` → 1 ; `bg-transparent` → 1 ; `bg-surface/50` → 1.*
      *Correction du 2026-09-24 : pour la HAUTEUR, cette garde était plus faible qu'écrit. Elle ne
      lisait qu'UNE classe par propriété, choisie par son préfixe (`h-` pour la hauteur, `py-`
      pour le rembourrage, `mt-` pour la marge) et seulement sur trois éléments :
      `relative h-14 min-h-64 overflow-hidden` sur le cadre laissait 9/9 verts, la vignette
      faisant alors 256 px. Le fond collant, lui, était bien gardé en valeur. Remplacée par le
      calcul de la reprise ci-dessous.*
- [x] `eslint` (fichiers touchés), `tsc --noEmit`, `check-i18n`, `check-i18n-namespaces`,
      `check-classes-emises`, `check-public-chrome-tokens`, `surface-publique.contraste` : verts.

## Reprise des défauts mineurs (2026-09-24)

Restes relevés par le vérificateur de ce ticket, tous **reproduits avant correction** : les quatre
mutations appliquées ensemble au composant laissaient les 11 tests des deux fichiers verts
(9 + 2).

**Ce qui a été fait — tests seulement, aucun composant modifié** (`CompareCarousel.tsx` md5
`1bc7bd13d13152e147521bbfc5ab1b41`, `CompareClient.tsx` md5 `6cad9aae11e1953c025d78572ca5b88a`,
inchangés) :

- `components/compare/__tests__/boite-compilee.ts` (neuf) : la géométrie VERTICALE d'un sous-arbre
  rendu par jsdom, calculée sur **toutes** les classes compilées de **chaque** élément traversé
  (par `cssCompile()`, ajouté à `src/test/__tests__/couleur-compilee.ts`). Hauteur, min/max,
  rembourrage, filet, marge, `space-y-*`, lignes bornées (`line-clamp`, `truncate`), empilement
  bloc / flex / grille d'une rangée ; variantes d'état comptées au pire, variantes de largeur
  selon la largeur demandée. Toute propriété non modélisée **de l'élément lui-même**, tout
  contexte CSS inconnu, toute longueur illisible, un `aspect-ratio` ou un texte libre sans nombre
  de lignes borné lèvent. Il fournit aussi `affichage(el, largeur)` et
  `cibleTactile(el, largeur, limite)` (la boîte de l'élément unie à celle de son `::after`
  positionné, plus les ancêtres `overflow-hidden` situés SOUS `limite`).
  *Faux tel qu'il était écrit ici (« toute propriété non modélisée LÈVE ») : les déclarations
  des pseudo-éléments étaient sautées sans lever, l'attribut `style` n'était pas lu, et
  l'affichage ignorait les ancêtres — cf. la seconde reprise, qui les ferme.*
- `CompareCarousel.test.tsx` — le test « hauteur FIXE » calcule le décalage du premier critère dans
  le composant pour 2 biens, 4 biens et un bien indisponible, à 320 et à 767 px : un seul décalage,
  **129 px** (≤ 261), et une rangée des titres de **57 px**. Nouveau test : chaque bouton
  « Retirer » offre ≥ 44 × 44 px d'appui (28 dessinés + 2 × 8 du `::after`), à 320 et 767 px.
  *« Sans ancêtre qui le rogne » était faux : le parcours s'arrêtait à la liste des vignettes,
  seule à rogner réellement (−4 px en haut et à droite) ; ni l'affichage ni les
  `pointer-events` du `::after` n'étaient lus. Cf. la seconde reprise.*
- `CompareClient.chargement.test.tsx` — le premier critère de l'attente est à la **même position**
  que celui du comparatif chargé, dans la même page, sous l'en-tête de page : 129 px à 320 et à
  767 px des deux côtés (le chargement est rendu par une réponse substituée, quatre biens complets).
  Nouveau test : le squelette de bureau est `display: none` à 320 et 767 px et `grid` à 768 et
  1 366 ; le squelette mobile est affiché sous `md` et `none` au-dessus. *« Affiché » ne lisait
  que son propre `display` : un ancêtre `hidden` le laissait vert. Cf. la seconde reprise.*
- `makeProperty` déplacé dans `components/compare/__tests__/bien-de-test.ts`, partagé par les deux
  fichiers.

**Ablations** — copie des originaux dans `scratchpad/ablation/M5/`, une mutation à la fois, les
ANCIENS tests (recopiés à côté le temps de l'épreuve) et les nouveaux joués contre elle,
restauration par réécriture du contenu d'origine, md5 vérifié après chaque série :

| mutation | anciens (11) | nouveaux (13) |
|---|---|---|
| cadre `relative h-14 min-h-64 overflow-hidden` (celle du vérificateur) | verts | 2 rouges : hauteur (329 > 261) et saut à l'arrivée |
| cadre `relative h-14 size-64 overflow-hidden` | verts | 2 rouges (329 > 261) |
| `li` des vignettes `relative pt-24` | verts | 2 rouges (225 ≠ 129) |
| lien de titre `… py-1 pt-6 …` | verts | 2 rouges |
| cadre `relative aspect-4/3 overflow-hidden` | 2 rouges | 2 rouges |
| `after:absolute after:-inset-2 after:content-['']` retirés | verts | 1 rouge : cible de 28 px |
| `after:-inset-1` | verts | 1 rouge : cible tactile |
| `li` des vignettes `relative overflow-hidden` | verts | 1 rouge : zone rognée |
| attente `mt-8 space-y-2` (celle du vérificateur) | verts | 1 rouge : saut à l'arrivée |
| attente de bureau `grid gap-4` (celle du vérificateur) | verts | 1 rouge : affichage sous `md` |
| enveloppe mobile chargée `pt-4 md:hidden` | verts | 1 rouge : saut à l'arrivée |
| attente mobile `lg:hidden` | verts | 1 rouge : affichage à 768 |

Chaque rouge est sur une VALEUR mesurée (ex. « expected 329 to be less than or equal to 261 »,
« expected 28 to be greater than or equal to 44 »), pas sur une propriété non modélisée.
md5 restaurés : `1bc7bd13d13152e147521bbfc5ab1b41`, `6cad9aae11e1953c025d78572ca5b88a`.

**Vérifications** : `vitest run` sur les deux fichiers, 13/13 ; `eslint` des fichiers touchés,
`tsc --noEmit`, `check-i18n`, `check-i18n-namespaces`, `check-classes-emises`,
`check-test-base-classes` : verts.

**Ce que le modèle ne voit pas** : l'effondrement des marges (compté en somme : il surestime,
jamais ne sous-estime) ; la hauteur de l'en-tête de page et du premier critère, qui restent des
MESURES au navigateur (221 et 158 px à 320 × 640) et non des calculs ; une classe posée par un
composant enfant non rendu en jsdom. *Liste incomplète, complétée par la seconde reprise :
pseudo-éléments, `style` en ligne, affichage des ancêtres et `pointer-events` y manquaient.*

## Seconde reprise — vérification adverse de la reprise (2026-09-24)

Le vérificateur a refusé la reprise : cinq contournements laissaient **13/13 verts**, relevés au
navigateur de son côté. **Tous reproduits ici avant correction** (13/13 verts sous chacun), plus
huit de mon invention, verts eux aussi (13/13 puis 14/14) — même défaut : la garde lisait moins
que ce qu'elle annonçait.

**Ce qui a été fait — tests seulement, aucun composant modifié** (md5 inchangés,
`CompareCarousel.tsx` `1bc7bd13d13152e147521bbfc5ab1b41`, `CompareClient.tsx`
`6cad9aae11e1953c025d78572ca5b88a`), dans `components/compare/__tests__/boite-compilee.ts` :

- **pseudo-éléments** : un `::before`/`::after` n'est admis que **hors du flux** (`absolute` ou
  `fixed` sous toutes ses déclarations de `position`, variantes d'état comprises) ou jamais affiché
  (`display: none` sous toutes) ; tout autre lève (« ::before dans le flux »). Tailwind 4 génère le
  pseudo-élément dès qu'une classe `before:`/`after:` existe (`content: var(--tw-content)`).
- **`style` en ligne** : toute propriété autre que `grid-template-columns` lève, sur tout élément
  lu (ancêtres compris).
- **affichage des ancêtres** : `affichage()` rend `none` si l'élément OU un ancêtre l'est ;
  `nonVu()` (neuf) ajoute `visibility` héritée et une opacité ≤ 10 % sur la chaîne ;
  `decalage()` lève sur une cible non vue.
- **la cascade** : hors variante d'état, la DERNIÈRE déclaration émise l'emporte (elle prenait le
  maximum : `py-1.5 pt-0` sur la rangée de titres de l'attente rendait 6 px de haut au lieu de 0,
  et un saut de 6 px à l'arrivée restait vert) ; les variantes d'état s'ajoutent ensuite, au pire.
- **cible tactile** : `cibleTactile(el, largeur)` n'a plus de borne — le rognage (`overflow` autre
  que `visible`) se cherche sur l'élément et TOUS ses ancêtres, conservateur (un ancêtre loin de la
  zone compte aussi) ; le `::after` ne compte que s'il est affiché, `absolute` dans un élément
  positionné, reçoit l'appui (`pointer-events`, `visibility`, hérités sinon) et n'a que des
  décalages (toute autre propriété — `after:size-4` — lève) ; la taille propre suit
  `max(min, min(taille, max))` ; une mise à l'échelle hors variante d'état (`scale`, `transform`,
  `rotate`, `zoom`) sur l'élément ou un ancêtre lève. `active:scale-[0.96]` du bouton, qui ne dure
  que le temps de l'appui, est ignoré.

Tests : `CompareCarousel.test.tsx` — la cible exige aussi `exclusions = []` ;
`CompareClient.chargement.test.tsx` — le squelette mobile doit être **vu** (`nonVu() = null`)
sous `md`, et un test neuf juge la cible des quatre boutons « Retirer » **dans la page chargée**, à
320 et 767 px (un `overflow-hidden` posé par la page autour du comparateur mobile ne se voit pas
depuis le composant seul). **14 tests** dans les deux fichiers.

**Ablations** — `scratchpad/ablation/M5/r1/ablation.mjs` : copie des originaux, une mutation à la
fois, `vitest run` des deux fichiers, restauration par `cp`, md5 vérifié après chaque série
(`1bc7bd13…`, `6cad9aae…`). Avant : les tests de la reprise ; après : ceux-ci.

| # | mutation | avant | après (14) |
|---|---|---|---|
| X1 | `li` des vignettes `before:block before:h-64 before:content-['']` (vérificateur) | 13/13 | 2 rouges : « ::before dans le flux » |
| X2 | cadre `style={{ minHeight: 256 }}` (vérificateur) | 13/13 | 2 rouges : « style en ligne non modélisé » |
| X3 | bouton `after:hidden` (vérificateur) | 13/13 | 2 rouges : `::after : display none` |
| X4 | bouton `after:pointer-events-none` (vérificateur) | 13/13 | 2 rouges |
| X5 | liste des vignettes `grid gap-2 overflow-hidden` (vérificateur) | 13/13 | 2 rouges : zone rognée |
| Y1 | enveloppe `aria-busy` `hidden` (vérificateur) | 13/13 | 2 rouges : cible non vue ; squelette mobile non vu |
| Y2 | enveloppe mobile chargée `hidden` (vérificateur) | 13/13 | 2 rouges |
| Y3 | squelette mobile `before:block before:h-10` (vérificateur) | 13/13 | 1 rouge : « ::before dans le flux » |
| Z1 | bouton `after:invisible` | 13/13 | 2 rouges |
| Z2 | cadre `style={{ paddingTop: 200 }}` | 13/13 | 2 rouges |
| Z3 | bouton `pointer-events-none` | 13/13 | 2 rouges |
| Z4 | rangée des titres `after:block after:h-8` | 13/13 | 2 rouges |
| Z5 | enveloppe mobile chargée `md:hidden overflow-hidden` | 13/13 | 1 rouge (test dans la page) |
| Z6 | bouton `after:size-4` | 13/13 | 2 rouges : propriété du `::after` non modélisée |
| Z7 | enveloppe `aria-busy` `max-md:hidden` | 13/13 | 2 rouges |
| Z8 | groupe `style={{ paddingTop: 40 }}` | 13/13 | 4 rouges |
| Z9 | titres de l'attente `… py-1.5 pt-0` | 14/14 | 1 rouge : 123 ≠ 129 |
| Z10 | squelette mobile `opacity-0` | 14/14 | 2 rouges |
| Z11 | bouton `max-w-4` | 14/14 | 2 rouges : 32 < 44 |
| Z12 | bouton `scale-50` | 14/14 | 2 rouges |
| Z13 | squelette mobile `invisible` | 14/14 | 2 rouges |
| A1–A4 | les quatre de la reprise (`min-h-64`, `::after` retiré, `mt-8`, `grid gap-4`) | déjà rouges | toujours rouges (2, 2, 1, 1) |

*Les mutations Z1–Z13 sont prouvées par l'ablation et par la sémantique CSS. Contrairement aux
cinq du vérificateur, elles n'ont PAS été relevées au navigateur.*

**Vérifications** : `vitest run src/components/compare` : 6 fichiers, 53/53 ; `eslint` des
fichiers touchés, `tsc --noEmit`, `check-i18n`, `check-i18n-namespaces`, `check-classes-emises` :
verts.

### Troisième passe — la session (2026-09-24)

La seconde vérification a refusé la seconde reprise sur cinq voies, **toutes rejouées puis
fermées** dans `boite-compilee.ts`. Chaque mutation donne désormais 2 rouges sur 53
(`vitest run src/components/compare`), composants restaurés par `cp`
(md5 `1bc7bd13…` et `6cad9aae…` identiques) :

| Mutation du vérificateur | Au navigateur | Avant | Après |
|---|---|---|---|
| cadre `relative inline h-14` | vignette à 0 px | 14/14 verts | lève : hauteur sur une boîte en ligne |
| cadre `inline-block w-full` | +7 px (boîte de ligne) | 14/14 verts | lève : enfant en ligne dans un flux de blocs |
| bouton `after:content-none` | cible 28 × 28 | 14/14 verts | `::after` exclu (content none) |
| bouton `after:-z-10` | cible 28 × 28 | 14/14 verts | `::after` exclu (z-index négatif) |
| attribut `hidden` sur le squelette mobile | 0 px | 14/14 verts | `display: none` (Preflight) |

**Ce que la garde ne voit toujours pas**, après ses trois jeux de corrections :

- la feuille GLOBALE (`globals.css` hors `@theme`, Preflight, une règle ciblant un sélecteur) :
  seules les classes utilitaires et le `style` en ligne sont lus ;
- un élément qui en RECOUVRE un autre (un calque `absolute` posé par-dessus le bouton, l'ordre de
  peinture entre frères) : la cible tactile est calculée sans ordre de peinture — seul le
  `z-index` négatif du `::after` lui-même est lu ;
- une transformation sur la vignette ou les titres (`scale-*` est sans effet sur le flux,
  donc admis par la hauteur, alors qu'il agrandit le dessin) ;
- `display: contents`, et les variantes par conteneur (`@container`) : non rencontrées ici ;
  un contexte `@container` lèverait (« contexte CSS non modélisé ») ;
- l'effondrement des marges (compté en somme : le modèle surestime) ;
- la hauteur de l'en-tête de page et du premier critère, qui restent des MESURES au navigateur.

## Hors périmètre

- La hauteur de l'en-tête de page (« Comparateur », titre, sous-titre : 69 → 200 px) : commun à
  toutes les tailles, inchangé.
- `--surface` n'est pas redéfini sous `.dark` : la rangée collante prend le fond de la page
  (`bg-surface`, celui de `CompareClient`), quel qu'il soit — elle suit la page, pas un thème.
- La hauteur de la `Navbar` est lue dans `NavbarSpacer` par le test ; si elle devient variable
  (bandeaux dans la barre), la rangée collante devra lire une variable CSS plutôt qu'une constante.
