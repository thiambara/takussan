---
id: TCK-551
title: "Menu mobile : sans voile ni verrou de défilement, fermeture impossible d'un tap à côté, rangée de catégories à moitié cachée, alignements décalés"
status: todo
phase: P2
family: front
estimate: S
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, mobile, navbar, a11y, ux]
---

## Objectif utilisateur

Sur téléphone, un visiteur ouvre le menu, comprend qu'il est dans un panneau au-dessus de la page,
le ferme comme il l'attend (tap à côté, geste retour, croix), et n'y trouve que de la navigation.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constats N5 à N8), mesuré à 390 × 844 et 360 × 740.

- **N5** — le panneau n'est pas modal : aucun voile, `body` reste en `overflow: visible` (la page
  défile dessous), un tap hors du panneau ne le ferme pas (`handleClickOutside` ne traite que les
  menus « Plus » et utilisateur), et le focus en sort. Les cartes de résultats restent visibles
  sous le bouton « Publier une annonce ».
- **N6** — la rangée de catégories du menu mesure 521 px dans 342 px visibles : « Commerce » et
  « Bureau » sont hors champ, sans fondu ni barre de défilement pour le signaler, et les dix autres
  types ne sont pas atteignables d'ici. Le tiroir de filtres les propose tous.
- **N7** — la barre est en `px-6` sous `lg` (logo à x = 24) quand le contenu de la page est en
  `px-4` (x = 16). Dans le menu, le texte de « Connexion » est à x = 35 contre 24 pour les autres
  liens : la classe `px-0` passée à `buttonVariants` perd contre la classe `px-2.5` de la variante,
  `cva` ne fusionnant pas les classes (mesuré : les deux sont présentes, padding calculé 10 px).
- **N8** — le bouton « Mes favoris » de la barre mobile a une zone de 36 × 36 px, quand le bouton
  menu voisin fait 44 × 44.

## Contrat de données

Aucun.

## Direction UX / Artistique

- Le menu se comporte comme les autres panneaux modaux du site public (le tiroir de filtres en est
  la référence) : voile, fermeture par tap extérieur, par Échap et par la croix, focus contenu.
- Le menu est un menu de **navigation** : les raccourcis de catégories disparaissent (le tiroir de
  filtres les porte tous), plutôt que d'être réparés.
- Bords gauches alignés entre la barre, le menu et le contenu de la page.

## Contraintes strictes (métier)

- Le verrou de défilement doit tenir **sur iOS Safari**, où `overflow: hidden` sur `body` ne suffit
  pas : la vérification se fait en émulation iOS ou sur appareil, pas seulement sur Chrome.
- Fermer le menu rend le focus au bouton qui l'a ouvert.

## Delta à produire

- [ ] Menu mobile modal : voile, verrou de défilement, fermeture par tap extérieur, focus contenu
      et restitué.
- [x] Retrait de la rangée de catégories du menu mobile.
- [x] Gouttière de la barre alignée sur celle du contenu sous `lg`.
- [x] Lien « Connexion » aligné sur les autres entrées (fusion de classes).
- [x] Zone tactile de 44 px pour « Mes favoris » en barre mobile, sans changer son dessin.
- [x] Tests : tap extérieur ferme ; Échap ferme et rend le focus ; le document ne défile pas menu
      ouvert.

## Critères d'acceptation

- [ ] AC1 — menu ouvert à 390 × 844, un `scrollBy(0, 500)` du document laisse `scrollY` inchangé ;
      menu fermé, il redevient effectif.
- [x] AC2 — un tap sur le voile ferme le menu ; le focus revient au bouton menu.
- [x] AC3 — menu ouvert, Tab ne fait jamais sortir le focus du panneau.
- [x] AC4 — la position x du **texte** (pas de la boîte) de « Connexion » est égale à celle
      d'« Acheter », à 1 px près.
- [x] AC5 — le logo et le `<h1>` de `/properties` commencent au même x à 360 et 390 px.
- [x] AC6 — la zone tactile de « Mes favoris » en barre mobile mesure au moins 44 × 44 px.

## Hors périmètre

- Le bloc de recherche du menu (retiré par TCK-549).
- Le choix de langue dans le menu (TCK-550).

## Notes d'implémentation

### Re-mesure des prémisses (2026-09-23, avant tout changement)

Front du worktree (`next dev -p 3021`) sur l'API partagée, Chrome headless par CDP, émulation
`mobile: true`, `/fr/properties`, déconnecté. `innerWidth` relevé = largeur demandée (390, 360) :
aucun élargissement du viewport. Charge machine au relevé : `load averages 10.40 22.31 22.32`, 8 cœurs.

| Constat | Ticket | Mesuré à 390 × 844 | Mesuré à 360 × 740 |
|---|---|---|---|
| N5 voile | aucun | aucun `[data-slot=sheet-overlay]` | idem |
| N5 verrou | `body` en `overflow: visible` | `body` et `html` `visible` ; `scrollBy(0,500)` menu ouvert : `scrollY` 0 → **500** | 0 → **500** |
| N5 tap extérieur | ne ferme pas | le point (195, 824) tombe sur le lien **d'une carte de résultat** ; menu toujours ouvert après | — |
| N6 rangée de catégories | 521 px dans 342 | `scrollWidth` **521** / `clientWidth` **342**, hors champ : « Commerce », « Bureau » | 521 / **312** |
| N7 gouttière | logo x = 24, contenu x = 16 | logo **24**, texte du `<h1>` **16** | **24** / **16** |
| N7 « Connexion » | 35 contre 24 | texte « Acheter » x = **24**, « Connexion » x = **35** ; classes `px-2.5` ET `px-0`, `padding-left` calculé **10px** | idem |
| N8 favoris | 36 × 36, menu 44 × 44 | **36 × 36** / **44 × 44** | idem |

Les sept affirmations du ticket tiennent. Relevés complémentaires, servant de témoins :

- **Libellé de la pastille (TCK-549) à 360** : boîte 60,2 px, `scrollWidth` 60 = `clientWidth` 60 —
  il tient à 0 px près. Pastille 116,9 px de large.
- **Vue carte à 360 (TCK-553)** : `nav` 0 → 69, cadre fixe de la carte 69 → 740 (671 px),
  document non défilant (`scrollHeight − innerHeight` = 0).
- **Bureau à 1280** : logo x = 24 (`px-6` s'y applique aussi), menu « Plus » ouvert puis fermé par
  un appui dehors et par Échap ; connecté, menu utilisateur ouvert puis fermé par un appui dehors.

### Écarts de prémisse (consignes de la session)

- **« la même primitive que le tiroir de filtres (Sheet/Dialog de @base-ui/react, voir
  FilterSidebar) »** — faux : `TiroirMobile` (`FilterSidebar.tsx`) est une modale **écrite à la
  main** (voile `div`, `role="dialog"`, piège de Tab et Échap maison, AUCUN verrou de défilement).
  La primitive base-ui (`Sheet` = `Dialog` de `@base-ui/react`) est celle de la surface de saisie
  de TCK-549, dans la même `Navbar` : c'est elle qui est retenue.
- **« le verrou de défilement de base-ui gère iOS »** — à nuancer, code lu dans
  `node_modules/@base-ui/utils/useScrollLock.mjs` (base-ui 1.7.0) : iOS est bien **détecté**
  (`platform.os.ios`, l. 247), mais pour le mettre sur la voie « barres de défilement superposées »
  (`preventScrollOverlayScrollbars`, l. 50-71), qui pose `overflow: hidden` sur l'élément qui porte
  le défilement du viewport — et le commentaire des l. 249-254 dit en toutes lettres que « on iOS,
  scroll locking does not work if the navbar is collapsed ». Le verrou base-ui n'est donc pas une
  preuve de tenue sur iOS Safari ; voir plus bas ce qui a été fait, et ce qui n'a pas été vérifié.

### Ce qui a été fait

- **Menu = `Sheet` (`Dialog` de base-ui), `side="top"`**, dont l'en-tête redessine la barre à
  l'identique : logo à (16, 22), croix à la place exacte du bouton menu (300, 12 à 360 ; 330, 12
  à 390). Le panneau recouvre la barre sans rien déplacer, et le voile couvre tout le reste.
- **Retour du focus après un appui sur le voile** — base-ui ne le rend PAS dans ce cas quand
  `focus({ preventScroll })` n'est pas pris en charge (`FloatingFocusManager.mjs`,
  `onOpenChangeLocal` : Chrome Android et Samsung Internet, nommément), pour ne pas faire sauter
  la page. jsdom est dans ce cas, et le test rougissait (focus sur `body`). La `Navbar` le rend
  elle-même après l'animation de sortie (`onOpenChangeComplete`), seulement si le focus est resté
  sur `body` : le bouton est dans une barre `fixed`, le focaliser ne fait rien défiler. Ablation :
  garde neutralisée → le test AC2 rougit.
- **Franchir `lg` menu ouvert le ferme** — défaut que ce ticket créait, trouvé au navigateur :
  menu ouvert à 800 px, fenêtre passée à 1280 → panneau masqué (`lg:hidden`) mais `body` resté en
  `overflow: hidden` et cinq enfants de `body` en `aria-hidden`. Après correctif : 0 boîte,
  `body` `visible`, 0 `aria-hidden`. Test dédié (rouge avant, vert après).
- `touch-none` sur le voile (nouvelle prop `overlayClassName` de `SheetContent`, additive).
- « Mes favoris » : `ZONE_TACTILE_44` (TCK-554) sur la variante compacte — le dessin reste un rond
  de 36 px.
- Tests d'autres tickets adaptés au panneau en portail (`nav > div.absolute` n'existe plus) :
  `Navbar.responsive` (TCK-505), `Navbar.langue-mobile` (TCK-550), `Navbar.pastille-mobile`
  (TCK-549). Le test du refus de tour 1 de TCK-549 touchait une puce de catégorie DU MENU : il
  touche désormais la puce de la barre de bureau, qui lit le même état `location` par
  `buildSearchUrl`. Ablation (`setLocation(qEnVigueur)` retiré) : 3 tests rougissent, dont les
  deux adaptés.
- Garde `surface-publique.contraste` : `ENCRES_INVERSES` 244 → 245 (la croix du panneau,
  `text-muted-foreground` sur `bg-popover`), relevé `HEAD` contre la branche fichier par fichier,
  cause écrite dans la garde.

### Mesures après (Chrome headless, `mobile: true`, `/fr/properties`, déconnecté sauf mention)

`innerWidth` = largeur demandée aux deux tailles. Preuve de version lue dans le DOM (`lg:px-6` sur
la barre, `aria-haspopup` sur le bouton menu). Entrées par `Input.dispatchTouchEvent` et
`Input.dispatchKeyEvent` — de vrais toucher et de vraies touches, pas des `click()`.

| AC | 390 × 844 | 360 × 740 |
|---|---|---|
| AC1 `scrollBy(0,500)` menu ouvert | **0 → 500 — ROUGE** (voir plus bas) | **0 → 500 — ROUGE** |
| AC1 glissé tactile réel (`synthesizeScrollGesture`) | témoin menu fermé : 0 → **402** ; menu ouvert, parti du voile : **0** ; parti du panneau : **0** | 0 → **403** / **0** / **0** |
| AC1 menu fermé, `scrollBy` | 0 → 500, `body` rendu à `visible` | idem |
| AC2 appui sur le voile | sous le doigt : `sheet-overlay` ; menu fermé, focus sur le bouton menu, URL inchangée | idem |
| AC3 Tab / Maj+Tab | 44 appuis (4 tours de 10 focalisables + 4), **0 sortie** ; connecté : 48 appuis, 11 focalisables, 0 sortie | 44, **0 sortie** |
| AC4 x du texte | « Acheter » **16**, « Connexion » **17** (écart 1 px : la bordure transparente de 1 px de la variante `ghost`) — `padding-left` 0 | 16 / 17 |
| AC5 x du texte | logo **16**, `<h1>` **16** | **16** / **16** |
| AC6 zone tactile | dessin 36 × 36 ; `::before` 44 × 44 ; `elementFromPoint` aux 8 points du carré de 43 px → le bouton ; à ±23 px → plus le bouton | idem |
| Échap / croix | ferment, focus sur le bouton menu | idem |

Consignes de la session :

- **(2) Pastille, menu ouvert** — sous le doigt à l'emplacement de la pastille : le PANNEAU (son
  en-tête recouvre la barre). Le toucher ne fait rien : toujours 1 seule boîte, aucune saisie
  ouverte. Deux modales ne peuvent pas s'empiler. Libellé de la pastille après `px-6 → px-4` :
  `scrollWidth` 60 = `clientWidth` 60 aux deux tailles, non tronqué ; la pastille gagne 16 px
  (116,9 → 132,9 à 360). La pastille flottante d'outils (TCK-552, z-40) et le bouton de
  messagerie (z-40) sont sous le voile (z-50), vérifié par `elementFromPoint`.
- **(3) Vue carte à 360 (`useBasDeLaNav`)** — `nav` 0 → 69, cadre fixe de la carte 69 → 740
  (671 px), document non défilant : identique au relevé d'avant.
- **(5) Bureau à 1280** — les 16 contrôles visibles de la barre ont le même rectangle au dixième
  de pixel, déconnecté comme connecté ; menu « Plus » : ouvert, fermé par un appui dehors et par
  Échap ; menu utilisateur (connecté) : ouvert, fermé par un appui dehors ; aucune boîte de
  dialogue rendue.

### AC1 est ROUGE tel qu'il est écrit — et pourquoi

`overflow: hidden` interdit le défilement par l'UTILISATEUR, pas le défilement PROGRAMMATIQUE :
`window.scrollBy` fait défiler un conteneur en `overflow: hidden`. Or base-ui, sur tout appareil à
barres de défilement superposées (mobiles, et ce Chrome headless même en `mobile: false` —
mesuré à 800 px : barres incrustées 0 px), ne pose que ça. Le critère mesure donc quelque chose
que le verrou de la primitive ne promet pas, sur tous les mobiles. Ce que l'utilisateur fait —
glisser — est bloqué (tableau ci-dessus, avec témoin). Deux issues, à trancher par la session :
reformuler AC1 sur un glissé tactile, ou ajouter un verrou `position: fixed` écrit à la main (ce
que la consigne de la session écartait).

### iOS Safari — NON vérifié

Aucun WebKit sur cette machine ; rien n'a été installé. Ce qui est établi, et seulement ça :
le verrou est celui de base-ui 1.7.0, qui sur iOS pose `overflow: hidden` sur l'élément qui porte
le défilement du viewport (`useScrollLock.mjs` l. 247 → l. 50-71) et reconnaît lui-même (l. 249-254)
ne pas tenir quand la barre d'adresse de Safari est repliée. Le voile en `touch-action: none`
empêche un glissé parti du voile de faire défiler quoi que ce soit (pris en charge par Safari
depuis iOS 13) ; un glissé parti du panneau reste à la merci de ce que Safari fait de
`overflow: hidden`. **La contrainte « tenir sur iOS Safari » n'est pas démontrée**, et la case du
Delta qui la porte reste décochée.

