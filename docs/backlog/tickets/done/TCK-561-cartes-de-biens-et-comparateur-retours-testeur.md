---
id: TCK-561
title: "Comparateur : la croix de la barre vidait la sélection, des « + » sans action, un toast translucide illisible, absent des cartes de l'accueil ; cartes : un survol trop discret"
status: done
phase: P2
family: front
estimate: S
wave: 69
created: 2026-09-23
updated: 2026-09-24
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
      *Ablation (vérification adverse, V4) : premier emplacement libre rendu muet → 2 rouges.*
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
- [x] M7 — re-mesure du comparatif après la vague. *Vérification adverse (CORS local contourné)
      sur `/fr/compare?ids=407,493,18,471` à 360 et 390 px : `scrollWidth = innerWidth`,
      14 « Diffère », aucun « != », aucun texte rogné. Re-mesuré le 2026-09-24 sur la pile
      canonique (`localhost:3000` → `127.0.0.1:8002`, CORS en règle), `ids=407,471,508,151`, à 320,
      360 et 390 px : `scrollWidth = innerWidth`, badge « Diffère ».* Le reste de la plainte
      (« du mal à tout voir sans scroller ») : TCK-577.

## Hors périmètre

- Le retour de chargement au clic sur une carte (W1, seconde moitié) : groupe A
  (`IndicateurDeNavigation`).
- La position du toast (en haut, par-dessus l'en-tête) : inchangée — l'avis devient lisible par son
  fond ; le déplacer changerait tous les toasts du site.

## Restes de la vérification adverse — soldés le 2026-09-24

La vérification (6/6 acceptés, 6 défauts mineurs) a laissé ceci ; chaque point a été reproduit
avant d'être corrigé, ou démontré sans objet.

- **« Annuler » écrasait un ajout fait entre-temps** — *reproduit* : test rouge
  `expected [ 10, 20 ] to deeply equal [ 10, 20, 30 ]`. Le rappel du toast survivait à son rendu
  et restaurait un instantané par `replace()`. Corrigé à la cause : `CompareContext` expose
  `update(fn)`, qui lit la sélection COURANTE du stockage au moment de l'appel ;
  `compare/restauration.ts` (`fusionnerRestauration`) garde la sélection courante, rend
  l'instantané dans la place qui reste, dans son ordre, avec les aperçus des deux origines, et
  RENVOIE ce qui n'a pas pu revenir — dit par un toast (« 1 bien n'a pas pu être rétabli : 4 au
  maximum », clé `compare.floatingBar.undoPartial`). Tests : 2 dans
  `CompareFloatingBar.test.tsx`, 4 dans `restauration.test.ts`.
- **Focus perdu sur `<body>` après « Vider »** — *reproduit* (test rouge). Le focus passe à
  « Annuler » ; « Annuler » le rend à « Vider » dans la barre revenue ; un toast fermé sans
  annuler le rend au `<main>` (`tabindex="-1"`, `preventScroll`). *Navigateur, 390 px, clavier :
  Vider → `BUTTON « Annuler »` ; le toast reste ouvert tant que le focus y est (base-ui suspend
  ses minuteurs) ; Entrée → `BUTTON « Vider le comparateur »`, `ids 407,471`.* 3 tests.
  Ablations (copie, retrait, rouge, `cp`, md5 `a5b26fb0eb0c26cc5de7d297d9e76d20`) : annulation
  sans la sélection courante → 2 rouges ; pas de focus sur « Annuler » → 3 ; `onClose` sans
  focus → 1 ; pas de retour sur « Vider » → 1 ; écart non dit → 1.
  ⚠ **Ce correctif était incomplet, et la phrase « aucun chemin ne laisse le clavier sur
  `<body>` » était fausse** — voir le point suivant.
- **Seconde vérification adverse : « Vider » → ajout d'un bien → « Annuler » perdait le focus, et
  un drapeau resté levé le VOLAIT plus tard** (défaut majeur, introduit par le point précédent) —
  *reproduit* : le retour sur « Vider » était un drapeau consommé par un effet sur `[isVisible]`,
  qui ne s'exécute que sur un CHANGEMENT. Un bien ajouté entre les deux gestes rend la barre
  visible AVANT « Annuler » : l'effet ne repartait pas, le focus tombait sur `<body>` (jsdom) ou
  sur un autre toast qui partait à son tour (navigateur : `DIV` du toast « Ajouté au
  comparateur »), et le drapeau restait levé ; au retour de `/compare`, la barre réapparue
  prenait le focus sur « Vider » — un Entrée de plus vidait la sélection. 3 tests rouges sur le
  code d'avant (`BODY` ; `Vider le comparateur` au lieu de `ajouter-30` ; `<main>` non focalisé).
  **Corrigé à la cause** (`CompareFloatingBar.tsx`) : « Annuler » émet une DEMANDE de focus
  numérotée (`useState`), servie UNE fois par le rendu qui suit le clic — la sélection rétablie y
  est déjà — et jamais rejouée par `isVisible` ni `reduite` : barre visible → « Vider » (ou la
  pastille si le visiteur l'a réduite entre-temps) ; barre absente (`/compare`) → `<main>`. Le
  focus donné à « Annuler » au montage est local au vidage, plus un `ref` du composant.
  *Navigateur, 390 px (`f1.mjs` de la vérification rejoué) : Vider → `Annuler` ; ajout au
  clavier depuis une carte → ids `407` ; Entrée sur « Annuler » → `BUTTON « Vider le
  comparateur »`, ids `407,471` ; `router.push('/fr/compare')` puis `back()` → le focus n'est
  PLUS pris par « Vider » (`BODY`, le comportement de navigation de Next).*
  5 tests neufs dans `CompareFloatingBar.test.tsx`, dont celui qui rend la garde `if (annule)
  return` observable (la vérification l'avait retirée sans rougir) : `closeToast` appelle
  `onClose` DANS le clic, et sans la garde le focus transiterait par `<main>` — un saut annoncé
  par un lecteur d'écran — avant « Vider ». Ablations (md5 restauré
  `4d3d10e204647ae4e4ece7771a788a13`) : garde retirée → 1 rouge ; repli sur `<main>` retiré → 1 ;
  pastille ignorée → 1 ; fichier d'avant → 4.
- **Risque résiduel mal énoncé par l'implémentation** (« après un clic souris, le toast ne
  s'éteint plus ») — *démenti par la mesure* : après un clic souris (1 366 px) ou un toucher
  (390 px) sur « Vider », le focus sur « Annuler » n'est PAS `:focus-visible` (`fv=false`),
  base-ui ne suspend pas ses minuteurs, le toast s'éteint (0 toast à +12 s) et le focus est sur
  `<main>`. La suspension ne vaut qu'après un geste au CLAVIER, et c'est voulu : un délai qu'on
  ne peut pas prolonger est un défaut d'accessibilité (WCAG 2.2.1).
- **Test M8 qui ne lisait que des classes (mutation V6b verte)** — le test compile désormais
  chaque classe de fond du toast par le Tailwind du dépôt et évalue la déclaration retenue jeton
  par jeton contre `:root` et `.dark` de `globals.css` : opacité exactement 1, et toute valeur
  illisible fait rougir (`src/test/__tests__/couleur-compilee.ts`). *V6b → rouge ; fond sombre
  `…_10%,transparent)` sur `error` → 2 rouges.*
- **z-index du viewport des toasts non gardé** — et il était faux : `z-[100]` sous des listes,
  menus, popovers et combobox à 1100 (`ui/popover.tsx:43`, `select.tsx:92`,
  `dropdown-menu.tsx:59`…) et sous les calques de Leaflet (jusqu'à 1000, `leaflet.css`). Porté à
  `z-[1200]` ; `ui/__tests__/toast-au-premier-plan.test.tsx` compare l'index compilé au plus grand
  écrit dans `src/` et `leaflet.css`, en nommant le fichier fautif. *Navigateur : `z-index` calculé
  1200. Ancien toast → rouge (`AgencyCombobox.tsx empile à 1100`).*
- **La croix du toast mesurait 24 × 24** (relevé au navigateur, sous le plancher de 44) — zone
  d'appui portée à 44 × 44 par pseudo-élément, dessin inchangé. *Navigateur : `elementFromPoint`
  44 × 44.* Test de valeur compilée (taille + débord ≥ 44), rouge sur l'ancien toast.
- **Test W1 qui ne lisait que des classes** — le voile est compilé et évalué : 10 % au survol,
  25 % à l'appui, en clair et en sombre. *Ablation sur copie de `globals.css` (variable
  `COULEUR_COMPILEE_GLOBALS`, la feuille du dépôt n'est pas touchée) : `--scrim` renommé → 5 rouges
  (`jeton inconnu : --scrim`) ; `--color-scrim` retiré du thème → 5 rouges.*
- **« Le survol reste accroché après un appui »** (risque résiduel de l'implémentation) — *démenti
  par la mesure* de la vérification : à 390 px, `(hover: hover)` vaut `false` et rien ne reste
  accroché après `synthesizeTapGesture`.
- **Cibles ≥ 44 px des cartes de l'accueil, non mesurées par `elementFromPoint`** — mesurées le
  2026-09-24 à 390 et 360 px, chaque carte centrée dans son carrousel : 24 boutons (favori et
  comparateur) sur 24 à 44 × 44, zones du favori et du comparateur disjointes (2 px d'écart).
- **Le toast couvre l'en-tête pendant sa durée** — inchangé, délibérément (cf. Hors périmètre) :
  il est lisible (fond opaque) et désormais au-dessus de tout.

