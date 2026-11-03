---
id: TCK-563
title: "Barre publique mobile : à 320 px, la pastille de recherche coupait son libellé, et sur iPhone la saisie demandait un second appui ; le vide sous la barre venait d'un build antérieur (cale de 133 px)"
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
- **Elle vient de la préproduction, pas de la production** — la production (`master`
  `fefe2c87`, 2026-08-15) n'a **aucun** `<h1>` sur l'accueil (HTML servi par `www.takussan.com` :
  0), et la capture en montre un.
- ⚠ **Rectifié le 2026-09-24 (vérification de TCK-563) : la capture n'est PAS celle de `fc4faee1`**
  (préproduction actuelle, `images.yml` vert le 2026-09-21T23:28Z), mais d'un build ANTÉRIEUR à
  TCK-529. Mesures sur l'image : pastille ≈ 41 px CSS (`fc4faee1` : `min-h-11` = 44 ; avant 529,
  `py-2.5` ≈ 42), barre ≈ 67 (`fc4faee1` : 69) ; du bord de la barre au `<h1>` ≈ 113 px CSS, ce que
  donne exactement la cale d'avant 529 (133 − 67 + 48 = 114), contre 48 sur l'arbre. Vérifié par
  exécution : `git show 4b7b9138^:…/HomepageDiscovery.tsx:105` → `<div className="h-[133px]" />` ;
  `git merge-base --is-ancestor 4b7b9138 c62dc702` → non (préproduction du 2026-09-16T12:27Z),
  `… b5163b9f` → oui (promotion #296, 2026-09-16T23:04Z), `… fc4faee1` → oui.

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
- **« Le faire descendre » : DÉCIDÉ par le porteur le 2026-09-24 — la pastille RESTE dans la
  barre, et un appui ouvre immédiatement un champ focalisé, clavier prêt.** Raison : la compacité
  de la barre (TCK-549) — descendre la recherche ajouterait une rangée d'environ 56 px à une barre
  fixe, à l'inverse exact de M1, sur toutes les pages publiques ; ce que le testeur demande au
  fond (« ne permet pas de taper »), c'est de pouvoir écrire du premier coup.
- **Défaut trouvé en l'éprouvant : sur iPhone, il fallait un SECOND appui pour avoir le clavier.**
  base-ui focalise le champ de la feuille une image APRÈS le geste : `FloatingFocusManager`
  diffère `initialFocus` d'une micro-tâche puis `enqueueFocus` d'un `requestAnimationFrame`
  (`@base-ui/react/floating-ui-react/components/FloatingFocusManager.js`, effet « Focus the initial
  element » ; `utils/enqueueFocus.js`). Safari iOS n'ouvre le clavier que pour un `focus()` exécuté
  pendant le gestionnaire du geste. Mesuré (Chrome, émulation tactile, 320 et 390 px, 2026-09-24) :
  à la fin du gestionnaire de `click`, le focus est sur la PASTILLE (`BUTTON`), le champ ne l'a
  qu'une image plus tard. ⚠ Aucun navigateur de test n'a de clavier virtuel : l'absence de clavier
  sur iOS est établie par le mécanisme, pas observée sur l'appareil.
- **Correctif** (`components/search/clavierDansLeGeste.ts`, appelé par la pastille) : dans le
  geste, un champ texte relais invisible (16 px, `fixed`, `preventScroll`, hors tabulation et
  `aria-hidden`) prend le focus — le clavier s'ouvre — puis base-ui passe le focus au vrai champ
  (iOS garde le clavier d'un champ texte à l'autre) et le relais disparaît ; retiré au plus tard
  après 1 s si rien ne le relaie. Mesuré après, à 320 et 390 en `fr`, 320 en `en` et `wo`, et à 360
  page défilée de 900 px : pendant le geste `INPUT:text` ; ensuite le champ de la feuille
  (88..112, 16 px, au-dessus de tout clavier), relais retiré, saisie « Almadies » écrite,
  `scrollY` inchangé, URL inchangée ; Échap rend le focus à la pastille.

### M1 — *non reproduit*

- Sur l'arbre, `/fr`, anonyme **et** connecté (propriétaire) : barre 69 px, cale 69 px, `<h1>` à
  117 px → **48 px** de vide (`pt-12` du `<main>`) à 320, 360 et 390 px.
- La préproduction a la même cale (`h-[69px] lg:h-[136px]`) et le même `pt-12` que l'arbre
  (`git show fc4faee1`) : son code ne produit pas davantage.
- Sur la capture, du bord de la barre au sommet des capitales du titre : 244 px image = **121 px
  CSS**, contre 54,5 px CSS pour la même mesure sur l'arbre → **≈ 66 px de trop**.
- ⚠ **Rectifié le 2026-09-24 : ce n'est PAS le « seul mécanisme trouvé ».** L'excès de la capture
  (≈ 66 px) est entièrement expliqué par la cale `h-[133px]` d'avant TCK-529 (133 − 67 = 66), et
  la capture vient d'un tel build (ci-dessus). Le bandeau caché sous la barre, ci-dessous, est un
  défaut RÉEL et distinct — traité par **TCK-572** — mais il n'est pas la cause de la capture.
- **Un bandeau en flux CACHÉ sous la barre fixe reproduit aussi un excès sans rien montrer.** `app/layout.tsx` rend `MaintenanceBanner` (`sticky top-0 z-50`) et
  `GlobalAnnouncementBanner` (en flux, visiteurs connectés seulement) AVANT la page ; la barre
  `fixed top-0 z-50`, plus loin dans le DOM, les recouvre. Démontré : propriétaire connecté,
  réponse de `/api/announcements/active` substituée par CDP → bandeau de 87 px dont 69 sous la
  barre, `<h1>` à 204 px (135 px de vide). Un bandeau de 69 px ou moins serait **entièrement
  invisible** et ajouterait sa hauteur au vide — sans pouvoir être lu ni fermé.
- Ce mécanisme n'est pas prouvé être celui de la capture : la préproduction répond
  `show_banner: false` à `/api/maintenance/status` (20:11Z), et l'état de ses annonces n'est
  lisible qu'avec un compte d'administration. Le défaut latent est réel mais hors de ce ticket
  (layout racine et bandeaux) : ouvert et corrigé dans **TCK-572** (bandeaux placés sous la barre,
  dans le flux de la page ; mesuré à 320, 360, 390 et 1366).

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
- [ ] AC7 — M1 : le testeur reprend sa capture sur la préproduction ACTUELLE (`fc4faee1` ou
      suivante) — elle porte la cale juste depuis la promotion #296 du 2026-09-16T23:04Z, sa capture
      est antérieure. *Non vérifiable d'ici : la préproduction est derrière une authentification
      Basic, et un navigateur n'y est pas autorisé ; le code servi, lui, est vérifié par `git
      merge-base` (ci-dessus). Attendu : 48 px de la barre au titre.*
- [x] AC8 — M3, décision du porteur : à 320 et 390 px, UN appui sur la pastille met, dès la fin du
      geste, le focus dans un champ texte (condition du clavier iOS), puis dans le champ de la
      saisie, visible en haut (88..112) ; aucun second appui. *Mesuré en `fr`, `en`, `wo`, et page
      défilée (360, `scrollY` 900 inchangé).*
- [x] AC9 — tests : `Navbar.clavier-dans-le-geste.test.tsx` (2), `search/__tests__/clavierDansLeGeste.test.ts`
      (4 — le quatrième, « se focalise SANS défiler la page », ajouté par la seconde vérification) ; `Navbar.pastille-etroite.test.tsx` passe à 7 (conteneur de requête, longueur des libellés).

## Hors périmètre

- Le bandeau d'annonce ou de maintenance caché sous la barre fixe : **TCK-572**.
- Descendre la recherche sous la barre : écarté par le porteur le 2026-09-24 (voir M3).
- Le panneau des favoris et les menus exclusifs sur mobile : unité D2.
- Le menu mobile (TCK-551) : inchangé.

## Solde de la vérification (2026-09-24)

Défauts et risques résiduels laissés par la vérification du 2026-09-23, chacun reproduit puis
soldé :

- **D1 — le conteneur de requête n'était pas gardé** (retirer `@container` de la pastille laissait
  les 5 tests verts, libellé recoupé à 320). *Test ajouté* : le conteneur le plus proche du libellé
  est la pastille elle-même. Ablation : `@container` retiré → 1 rouge ; restauré, md5 identique.
- **D2 — Contexte faux sur l'origine de la capture et le « seul mécanisme »** : *ticket corrigé*
  (Contexte ci-dessus, faits vérifiés par `git show` / `git merge-base` / `gh run list`).
- **D3 — AC7 attendait « le prochain déploiement »** alors que la préproduction porte le correctif
  depuis le 2026-09-16T23:04Z : *AC7 réécrit* (reprise de la capture sur la préproduction actuelle).
- **R1 — seuil lu dans les classes** (jsdom sans mise en page) : accepté ; la mesure au navigateur
  reste la preuve de 320 px, et le nouveau test du conteneur ferme la mutation qui passait.
- **R2 — une traduction plus longue recouperait le libellé** : *garde ajoutée* — aucun libellé au
  repos ne dépasse en caractères « Chercher », sur lequel le seuil est mesuré ; sinon, rouge avec
  la consigne de re-mesurer. Ablation (référence raccourcie) → 1 rouge.
- **R3 — « Seet » masqué à 320 alors qu'il tiendrait** : *sans objet, délibéré* — un même
  comportement dans les trois langues, et le libellé reste le nom accessible du bouton.
- **R4 — cause de M1 non prouvée** : *soldé* — prouvée (cale d'avant TCK-529, D2) ; le mécanisme
  de bandeau distinct est corrigé par TCK-572. Reste AC7, qui dépend d'une nouvelle capture.
- **R5 — « descendre la recherche »** : *décidé* par le porteur (M3) et implémenté (AC8, AC9).
  Ablation : appel du relais retiré de la pastille → 1 rouge ; écouteur de retrait du relais
  retiré → 3 rouges ; `fontSize: 16px` retiré → 1 rouge.

### Seconde vérification (2026-09-24) — ce qu'elle a relevé, et ce qui en a été fait

- **« Rien ne défile » à l'ouverture de la saisie n'était gardé que par la mesure au navigateur** :
  retirer `preventScroll` du `focus()` du relais restait vert (mutation Ve). Le relais est ajouté
  en fin de `<body>` : sans l'option, un navigateur peut défiler jusqu'à lui. *Test ajouté*
  (`search/__tests__/clavierDansLeGeste.test.ts`, « se focalise SANS défiler la page ») : le
  `focus()` appelé SUR le relais reçoit `{ preventScroll: true }` — jsdom ne défile pas, on garde
  donc l'option passée. Mutation rejouée : 1 rouge ; restauré, md5
  `bcaa1d484059b987f0007c1c7cf201c5` identique.

## Reprise des défauts mineurs (2026-09-24)

- **AC9 citait `clavierDansLeGeste.test.ts` (3)** alors que le fichier en porte **4** depuis la
  seconde vérification (le test `preventScroll` ci-dessus). *Compte corrigé.* Mesuré par
  `npx vitest run --reporter=verbose` sur les trois fichiers cités : `clavierDansLeGeste.test.ts`
  **4**, `Navbar.clavier-dans-le-geste.test.tsx` **2**, `Navbar.pastille-etroite.test.tsx` **7**
  (13 verts) — les deux autres comptes de l'AC étaient justes. Aucun code touché.
