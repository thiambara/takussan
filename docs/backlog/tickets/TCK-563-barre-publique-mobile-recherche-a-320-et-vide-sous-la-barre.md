---
id: TCK-563
title: "Barre publique mobile : à 320 px, la pastille de recherche coupait son libellé ; le vide sous la barre de l'accueil n'est pas reproduit (bandeau caché sous la barre fixe)"
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
tags: [front, mobile, navbar, recherche, a11y, ux, retour-testeur]
---

## Objectif utilisateur

Sur un petit téléphone (320 px CSS, iPhone en zoom d'affichage), un visiteur voit une barre du
haut nette — une pastille de recherche qu'il reconnaît, jamais un mot coupé — et, en un tap, écrit
son lieu. Sous la barre, l'accueil commence à la même distance que partout ailleurs.

## Contexte

Retour testeur du 2026-09-23 (web + mobile), unité D1 de la vague 69 — deux points :

- **M1** — accueil public, mobile : « Padding trop large. » Capture : grand vide entre la barre et
  le titre « Property listings in Senegal ».
- **M3** — barre publique, mobile : « L'input de recherche ne permet pas de taper ; le faire
  descendre serait mieux car il encombre la navbar. » Capture : pastille « W… » tronquée entre le
  logo et le cœur.

Mesures (2026-09-23, 20:05-20:20, Chrome headless piloté par CDP, `next dev` de l'arbre sur
`localhost:3000`, API `127.0.0.1:8002`, dpr 2, émulation mobile + tactile ; `load average`
9,8 / 21 / 17 sur 8 cœurs) :

- **La capture est prise à 320 px CSS** : 646 px d'image de large ; le logo y mesure 165 px image
  pour 83 px CSS rendus → 2,02 px image par px CSS.
- **Elle vient de la préproduction, pas de la production.** Préproduction = `fc4faee1`
  (`images.yml` vert le 2026-09-21T23:28Z, vert = `X-Build-Sha` vérifié) ; la production
  (`master` `fefe2c87`, 2026-08-15) n'a **aucun** `<h1>` sur l'accueil (HTML servi par
  `www.takussan.com` : 0), et la capture en montre un. `fc4faee1` précède TCK-549 et TCK-551.

### M3 — *partiel*

- **« Ne permet pas de taper » : confirmé sur la préproduction, déjà corrigé sur `dev`.** Dans
  `fc4faee1`, la pastille est `<button onClick={handleSearch}>` avec l'invite longue
  (`Navbar.tsx:449-456`, « Where are you looking? » → « W… ») : aucun champ. TCK-549 (done) en a
  fait un déclencheur d'écran de saisie. Re-mesuré sur l'arbre à 320 px en `fr`, `en` et `wo` : un
  tap met le focus dans un `INPUT type=text`, l'URL ne bouge pas ; `Input.insertText("Almadies")`
  écrit la valeur et fait paraître une suggestion.
- **Défaut résiduel, confirmé : à 320 px, le libellé au repos se coupe.** TCK-549 ne garantissait
  le libellé entier qu'à 360 (son AC4). À 320, la pastille mesure 93 px et laisse 43 px au texte :
  « Chercher » en mesure 60 (« Cherc… »), « Search » 45 (« Searc… ») ; « Seet » (29) tient.
- **« Le faire descendre » : décision produit.** TCK-549 a choisi une pastille dans la barre qui
  ouvre un écran de saisie plein écran (le geste des applications immobilières). Descendre la
  recherche sous la barre ajouterait une rangée d'environ 56 px à une barre fixe — à l'inverse
  exact de M1 — et demanderait de refaire `NavbarSpacer` sur toutes les pages publiques. Rien
  n'est changé sans décision du porteur.

### M1 — *non reproduit*

- Sur l'arbre, `/fr`, anonyme **et** connecté (propriétaire) : barre 69 px, cale 69 px, `<h1>` à
  117 px → **48 px** de vide (`pt-12` du `<main>`) à 320, 360 et 390 px.
- La préproduction a la même cale (`h-[69px] lg:h-[136px]`) et le même `pt-12` que l'arbre
  (`git show fc4faee1`) : son code ne produit pas davantage.
- Sur la capture, du bord de la barre au sommet des capitales du titre : 244 px image = **121 px
  CSS**, contre 54,5 px CSS pour la même mesure sur l'arbre → **≈ 66 px de trop**.
- **Seul mécanisme trouvé qui reproduise un tel excès sans rien montrer : un bandeau en flux
  CACHÉ sous la barre fixe.** `app/layout.tsx` rend `MaintenanceBanner` (`sticky top-0 z-50`) et
  `GlobalAnnouncementBanner` (en flux, visiteurs connectés seulement) AVANT la page ; la barre
  `fixed top-0 z-50`, plus loin dans le DOM, les recouvre. Démontré : propriétaire connecté,
  réponse de `/api/announcements/active` substituée par CDP → bandeau de 87 px dont 69 sous la
  barre, `<h1>` à 204 px (135 px de vide). Un bandeau de 69 px ou moins serait **entièrement
  invisible** et ajouterait sa hauteur au vide — sans pouvoir être lu ni fermé.
- Ce mécanisme n'est pas prouvé être celui de la capture : la préproduction répond
  `show_banner: false` à `/api/maintenance/status` (20:11Z), et l'état de ses annonces n'est
  lisible qu'avec un compte d'administration. Le défaut latent est réel mais hors de ce ticket
  (layout racine et bandeaux) : à ouvrir à part.

## Critères d'acceptation

- [x] AC1 — à 320 px, sans recherche en cours, le libellé de la pastille n'est jamais affiché
      tronqué, en `fr`, `en` et `wo` : il passe en `sr-only` et reste le nom accessible du bouton.
      *Mesuré : `position: absolute`, nom « Chercher » / « Search » / « Seet ».*
- [x] AC2 — dans ce cas, la loupe est centrée dans la pastille. *Mesuré : décalage du centre
      −4 px → 0 px (`gap-0` sous le seuil).*
- [x] AC3 — à 360 et 390 px, la pastille est inchangée : libellé entier et visible (60/60 px à
      360 en `fr`, 45/45 px à 390 en `en`), conforme à TCK-549 AC4.
- [x] AC4 — un lieu en vigueur (`q`, `location`, `city` sur la liste) n'est jamais masqué, à
      aucune largeur : c'est la donnée du visiteur.
- [x] AC5 — à 320 px, un tap sur la pastille ouvre la saisie, focus dans un champ texte où l'on
      écrit (mesuré en `fr`, `en`, `wo` ; saisie réelle en `en`).
- [x] AC6 — test `components/home/__tests__/Navbar.pastille-etroite.test.tsx` (5 tests).
      Ablation : `Navbar.tsx` de `HEAD` → 5 rouges ; retrait du seul `gap-0` → 1 rouge ; fichier
      restauré (md5 identique).
- [ ] AC7 — M1 : vide sous la barre de l'accueil égal à celui de l'arbre (48 px) sur la
      préproduction, après le prochain déploiement de `preview` — à re-mesurer sur l'appareil du
      testeur.

## Hors périmètre

- Le bandeau d'annonce ou de maintenance caché sous la barre fixe (layout racine,
  `GlobalAnnouncementBanner`, `MaintenanceBanner`) : ticket à ouvrir.
- Descendre la recherche sous la barre : décision du porteur (voir M3).
- Le panneau des favoris et les menus exclusifs sur mobile : unité D2.
- Le menu mobile (TCK-551) : inchangé.
