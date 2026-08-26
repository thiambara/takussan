---
id: TCK-371
title: "Console agence — contraste des entrées verrouillées, tables tronquées sur mobile, focus clavier"
status: todo
phase: P1
family: front
estimate: S
wave: 47
created: 2026-08-26
updated: 2026-08-26
depends_on: []
blocks: []
spec_refs:
  features:
    - docs/features.md#29-administration--configuration
    - docs/features.md#112-agence--équipe
tags: [front, admin, a11y, responsive]
---

## Objectif utilisateur

L'admin d'agence lit ce qu'un passage en `standard` lui débloquerait, atteint le menu d'actions de chaque ligne depuis son téléphone, et sait où se trouve le focus quand il navigue au clavier.

## Contexte

Trois défauts mesurés le 2026-08-26, chacun calculé et non estimé à l'œil.

**1. Les entrées de menu verrouillées sont sous le seuil de lisibilité.**
`AdminSidebar.tsx:104` compose `text-white/40` **et** `opacity-60`, soit un alpha effectif de
0,24 sur `--app-topbar` (`#1f1812`). Rapport calculé : **2,18:1**, contre 4,5:1 exigé.
Le reste de la barre est sain (item inactif 9,04:1, actif 13,17:1) : le défaut est localisé,
et il porte précisément sur les lignes censées donner envie de passer en `standard`.

**2. Sur mobile, `/admin/team` perd ses actions.**
`AdminUsersTable.tsx:122` enveloppe une table de 7 colonnes — dont la dernière porte le menu
d'actions de chaque ligne — dans `overflow-hidden`. Pas `overflow-x-auto` : **`hidden`**. Les
colonnes de droite sont coupées sans défilement possible. `OverduePaymentsTable.tsx:75` a la
même construction sur 8 colonnes.

**3. Le focus clavier n'existe que là où les primitives le fournissent.**
`focus-visible` apparaît **10 fois sur les 63 fichiers** de la surface. Les éléments écrits à
la main — en-têtes de tri, lignes de file cliquables, boutons de pagination — n'en portent
aucun.

## Contrat de données

Aucun. Ticket de rendu strict : ni endpoint, ni contrat, ni comportement métier touché.

## Direction UX / Artistique

Une entrée verrouillée doit rester **lisible** tout en se distinguant d'une entrée active : le
cadenas et le curseur portent déjà l'interdit, l'opacité n'a pas à le porter une troisième fois.

Une table large sur petit écran défile horizontalement **dans son propre conteneur** — jamais le
corps de la page.

## Contraintes strictes (métier)

- Aucun changement de qui voit quoi : le cadenas reste, seule sa lisibilité change.
- L'anneau de focus passe par le token `--ring`, jamais par une couleur écrite en dur.
- Le corps de page ne défile jamais horizontalement, quelle que soit la largeur.

## Delta à produire

- [ ] Contraste des entrées verrouillées porté au-dessus de 4,5:1
- [ ] Conteneur défilant sur les tables larges de la console, en remplacement de `overflow-hidden`
- [ ] Anneau de focus visible sur les éléments interactifs écrits à la main
- [ ] Tests : au moins un qui éprouve l'atteignabilité des actions de ligne en largeur réduite

## Critères d'acceptation

- [ ] AC1 — le rapport de contraste de l'entrée verrouillée est **recalculé et reporté dans la
      PR**, paire par paire, avec la valeur obtenue. Un « c'est plus lisible » ne coche pas ce
      critère : c'est un chiffre qui le coche
- [ ] AC2 — à 375 px de large, le menu d'actions de la dernière colonne de `/admin/team` est
      **atteignable**, et le corps de la page ne défile pas horizontalement
- [ ] AC3 — même vérification sur le tableau des impayés
- [ ] AC4 — `grep -c focus-visible` sur la surface `/admin` est strictement supérieur à 10, et
      chaque ajout porte sur un élément réellement interactif (vérifier par lecture)
- [ ] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent

## Hors périmètre

- Le lien d'évitement et le contraste de la barre super-admin — TCK-359.
- Une refonte responsive des tables en cartes empilées : le défilement suffit ici, la refonte
  relève de TCK-373.
- Le mode sombre : il n'est atteignable nulle part aujourd'hui (aucun `ThemeProvider`, aucun
  `prefers-color-scheme`), et le brancher est une décision qui lui appartient.

## Notes d'implémentation

_(à remplir par implementing-specs)_
