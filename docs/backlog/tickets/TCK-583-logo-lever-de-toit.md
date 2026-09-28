---
id: TCK-583
title: "Le logo « lever de toit » (6a) dans la barre et le pied de page publics, et en icône du site"
status: todo
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

- [ ] Une primitive de marque (symbole + nom, deux tailles : barre et pied de page).
- [ ] La barre publique et l'en-tête de son menu mobile montrent le logo à la place du nom en texte.
- [ ] Le pied de page montre le logo à la place du nom en texte.
- [ ] Icône du site (onglet) et icône d'écran d'accueil iOS, depuis la variante « petites tailles ».
- [ ] Tests : nom accessible, symbole masqué aux lecteurs d'écran, couleurs sur jetons, icône
      alignée sur les jetons de `globals.css`.

## Critères d'acceptation

- [ ] AC1 — Au navigateur, la barre (bureau et mobile) et le pied de page montrent le symbole et
      « TAKUSSAN » ; le lien s'appelle « Takussan » pour un lecteur d'écran.
- [ ] AC2 — Aucune couleur écrite en dur dans la primitive ; l'icône du site porte exactement les
      valeurs des jetons `--foreground`, `--background` et `--primary` de `globals.css`, et un test
      rougit si l'un des jetons change sans elle.
- [ ] AC3 — L'onglet du navigateur montre l'icône (`/icon.svg` servi), et `/apple-icon.png`
      est servi.
- [ ] AC4 — Aucun débordement horizontal de la barre à 360 et 390 px.
- [ ] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` verts ; gardes du dépôt vertes.

## Hors périmètre

- Le reste de la refonte de l'accueil proposée dans `Accueil.dc.html` (sous-titre, rangées,
  motifs) : relu à part, rien n'en est repris ici.
- Le grand nom en filigrane du pied de page (il reste tel quel).
- Les coques `/app`, `/admin`, `/super-admin`, les pages d'authentification et les courriels.

## Notes d'implémentation

_(à remplir par implementing-specs)_
