---
id: TCK-583
title: "Le logo « lever de toit » (6a) dans la barre et le pied de page publics, et en icône du site"
status: done
phase: P1
family: front
estimate: S
wave: 71
created: 2026-09-28
updated: 2026-09-28
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
    - docs/design-guidelines.md
  models: []
tags: [front, design, marque, logo, favicon, navbar, footer]
---

## Objectif utilisateur

Qui arrive sur Takussan reconnaît une marque, et non un nom tapé en terracotta : le symbole et le
nom dans la barre, dans le pied de page et dans l'onglet du navigateur.

## Contrat de données

Aucune donnée. Rendu seulement.

## Direction UX / Artistique

Source : le projet claude.ai/design « Takussan » (`2b102376-673f-4b11-bf79-09a29adccbd0`),
`Canvas.dc.html` (exploration, tour 6, **6a retenu**) et `Accueil.dc.html` (logo posé dans la barre
et le pied de page). Le symbole est un toit sur un soleil levant posé sur un horizon : le toit et
l'horizon à l'encre, les rayons en terracotta. Le nom en capitales espacées, Bricolage, le symbole
aligné sur la ligne de base des lettres. Petites tailles : le symbole seul, en sable sur une tuile
d'encre (la variante « petites tailles » de la planche).

## Contraintes strictes (métier)

- Les couleurs du symbole passent par les jetons (`--foreground`, `--primary`, `--background`),
  sauf dans l'icône du site, qu'aucune feuille de style n'atteint — ses valeurs y sont alors
  celles des jetons, et un test garde qu'elles le restent.
- Le nom accessible du lien reste « Takussan » : les capitales sont un rendu, pas le texte.
- Le symbole est décoratif pour les lecteurs d'écran (le nom est déjà lu).

## Delta à produire

- [x] Une primitive de marque (symbole + nom, deux tailles : barre et pied de page).
- [x] La barre publique et l'en-tête de son menu mobile montrent le logo à la place du nom en texte.
- [x] Le pied de page montre le logo à la place du nom en texte.
- [x] Icône du site (onglet) et icône d'écran d'accueil iOS, depuis la variante « petites tailles ».
- [x] Remplacer `src/app/favicon.ico`, resté celui du gabarit create-next-app (relevé en cours de
      route, voir les notes).
- [x] Tests : nom accessible, symbole masqué aux lecteurs d'écran, couleurs sur jetons, icône
      alignée sur les jetons de `globals.css`.

## Critères d'acceptation

- [x] AC1 — Au navigateur, la barre (bureau et mobile) et le pied de page montrent le symbole et
      « TAKUSSAN » ; le lien s'appelle « Takussan » pour un lecteur d'écran.
- [x] AC2 — Aucune couleur écrite en dur dans la primitive ; l'icône du site porte exactement les
      valeurs des jetons `--foreground`, `--background` et `--primary` de `globals.css`, et un test
      rougit si l'un des jetons change sans elle.
- [x] AC3 — L'onglet du navigateur montre l'icône (`/icon.svg` servi), et `/apple-icon.png`
      est servi.
- [x] AC4 — Aucun débordement horizontal de la barre à 360 et 390 px.
- [x] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` verts ; gardes du dépôt vertes.

## Hors périmètre

- Le reste de la refonte de l'accueil proposée dans `Accueil.dc.html` (sous-titre, rangées,
  motifs) : relu à part, rien n'en est repris ici.
- Le grand nom en filigrane du pied de page (il reste tel quel).
- Les coques `/app`, `/admin`, `/super-admin`, les pages d'authentification et les courriels.

## Notes d'implémentation

- **Primitive** : `src/components/brand/Logo.tsx` — `SymboleTakussan` (le tracé de la planche au
  centième, traits en `stroke-primary` / `stroke-foreground`) et `Logo` (symbole + nom, tailles
  `barre` 34 × 24 / 18 px et `pied` 50 × 35 / 26 px, alignés sur la ligne de base).
- **Le nom accessible était faux au navigateur, vert en test.** Première version : le nom écrit
  « Takussan », mis en capitales par `uppercase`. jsdom rendait le lien « Takussan » ; **Chrome le
  nommait « TAKUSSAN »** (`Accessibility.getFullAXTree`, mesuré à 1440, 390 et 360) — `text-transform`
  entre dans le nom accessible. Correctif : capitales visibles `aria-hidden`, nom lu par un double
  `sr-only`. Re-mesuré : « Takussan » aux trois largeurs. Les tests gardent la règle que jsdom peut
  voir : aucun texte `uppercase` exposé dans le lien.
- **L'onglet montrait le triangle Vercel.** `src/app/favicon.ico` datait du gabarit create-next-app
  (md5 `c30c7d42…`, 25 931 octets) — c'est lui que servait la production. Remplacé par un ICO à
  charges PNG (16/32/48) rendu depuis `icon.svg` ; un test refuse le retour de l'empreinte.
- **Icônes** : `icon.svg` = la tuile 16 px de la planche (encre, toit et horizon sable, rayons
  terracotta), valeurs égales aux jetons de `:root` — le test rougit si l'un change sans elle, et
  compare le tracé à celui de la primitive. `apple-icon.png` (180 px, tuile pleine : iOS pose son
  masque) et `favicon.ico` sont rendus par Playwright depuis `icon.svg` ; le PNG n'est pas gardé
  par un test (raster). Servis : `/icon.svg`, `/apple-icon.png`, `/favicon.ico` → 200, et les trois
  `<link>` émis par Next.
- **Mesures au navigateur** (dev, 2026-09-28) : symbole 34 × 24, nom Bricolage 600, espacement
  2,52 px (= 0,14 em), rayons `rgb(168, 83, 50)`, toit `rgb(31, 24, 18)` ; `scrollWidth` =
  `innerWidth` à 1440, 390 et 360 ; bureau : lien centré à 38 px, barre de recherche à 39.
- **Ablation** : `aria-hidden` retiré des capitales → 3 tests rouges ; `--primary` modifié dans
  `globals.css` → le test de l'icône rougit ; Navbar/Footer d'origine → les 3 tests d'intégration
  rougissent.
- À 16 px, les sept rayons de la tuile se lisent mal (0,8 px de trait) : c'est la variante de la
  planche, reprise telle quelle ; une variante simplifiée se décide côté design.
- `npm run lint`, `npx tsc --noEmit`, `npm run test` (488 fichiers, 4347 tests) et les gardes
  `scripts/check-*.mjs` verts — suite prise sous charge (load 12 sur 8 cœurs), temps non retenu.
