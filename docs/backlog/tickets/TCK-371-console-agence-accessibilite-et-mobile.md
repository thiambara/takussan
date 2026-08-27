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

### Ce que la re-mesure a confirmé, et ce qu'elle a démenti

**Défaut 1 — CONFIRMÉ, au chiffre près.** Les trois rapports du Contexte se reproduisent
exactement : entrée verrouillée **2,18:1**, item inactif **9,04:1**, item actif **13,17:1**.
Une seule correction de vocabulaire : le fond n'est pas `--app-topbar` — **ce jeton n'existe
nulle part dans le dépôt** (`grep -r app-topbar src/` → 0). La barre porte `bg-foreground`, et
`--foreground` vaut `#1f1812`, la valeur que le ticket citait. Le chiffre était juste, le nom
du jeton non.

**Défaut 2 — NE SE REPRODUIT PLUS.** Le ticket décrit `AdminUsersTable.tsx:122` enveloppant
une `<table>` de 7 colonnes dans `overflow-hidden`. **TCK-373 (mergé) a supprimé cette
construction** : les deux tables passent désormais par la primitive `DataTable`, dont le
`<Table>` porte son propre conteneur `overflow-x-auto` (`ui/table.tsx:23-26`). Il ne reste
**aucune `<table>` écrite à la main dans toute la surface `/admin`**. Le défilement est donc
déjà encapsulé, et l'`overflow-hidden` restant est délibéré — il arrondit le cadre.

Aucun code de production n'a donc été écrit pour AC2/AC3. À la place, **l'invariant est
verrouillé par un test** : en remontant du déclencheur d'actions vers la racine, on doit
rencontrer `overflow-x-auto` **avant** tout `overflow-hidden`. Les deux moitiés sont
ablation-vérifiées (cf. plus bas).

**Défaut 3 — CONFIRMÉ, mais le mécanisme est autre que « `focus-visible` manque ».** Le
compte se reproduit (10 occurrences), mais sur **87 fichiers de surface** et non 63. Surtout,
la cause n'est pas une absence d'anneau : `globals.css:207-209` pose
`* { @apply border-border outline-ring/50 }`, donc **tout élément** recolore l'anneau du
navigateur en `--ring` à 50 % — **1,73:1 sur le fond de la barre, 2,12:1 sur `--card`**, sous
les 3:1 de WCAG 1.4.11. L'anneau existait ; il était indiscernable.

C'est pourquoi les anneaux ajoutés emploient le jeton **plein** et jamais `ring-ring/50`,
**qui est pourtant l'idiome de la primitive `Button`** (`button.tsx:7`). Cet écart est
délibéré et mesuré ; il n'est pas corrigé dans `Button` — cette primitive est montée
site-wide, ce serait un autre ticket.

### Décisions non évidentes

- **`outline-*` et non `ring-*`.** Un `ring` Tailwind est un `box-shadow` : son décalage exige
  un `ring-offset-color` accordé au fond, or ces éléments vivent sur trois fonds différents
  (`--card`, `bg-muted/60`, `bg-foreground`). L'`outline` se dessine par-dessus sans couleur
  de doublure. Vérifié à la compilation avec le moteur Tailwind du projet : `outline-2` rend
  `outline-style: solid`, ce qui **écrase l'`outline: auto` du navigateur** — sans quoi la
  couleur mesurée ne s'appliquerait pas (Chrome et Safari ignorent `outline-color` sur un
  `outline: auto`).
- **Décalage NÉGATIF (`-outline-offset-2`) sur les éléments pleine largeur** logés dans un
  conteneur qui coupe : `<nav overflow-y-auto>` de la barre, `<li overflow-hidden>` de
  `CapabilityMatrix`, menu d'export d'`AuditTrail`, `<ul overflow-y-auto>` des deux files de
  modération. Dès qu'un axe n'est pas `visible`, l'autre calcule `auto` (CSS Overflow 3 §3) :
  un anneau sortant y serait rogné. Les éléments en ligne gardent le décalage sortant.
- **`text-white/55` plutôt que `/70`** pour l'entrée verrouillée : 6,04:1, donc lisible, tout
  en restant plus sourde que l'item inactif (9,04:1) dont elle doit se distinguer. `opacity-60`
  est retiré et non remplacé — il atténuait aussi le cadenas et l'icône, qui portent déjà
  l'interdit.

### Ce que ces tests ne prouvent pas

jsdom n'a aucun moteur de mise en page : `offsetWidth` et `scrollWidth` y valent 0. **Aucun
test ne mesure un rendu à 375 px**, et aucun ne mesure un contraste — le contraste se calcule,
et le calcul est reporté ci-dessus. Ce qui est gardé, c'est la *structure* qui rend le
défilement possible et l'*alpha* qui entre dans le calcul.

L'ablation de `overflow-hidden` sur **une seule** des deux couches rognantes laisse les tests
verts : l'encapsulation est **doublée** dans le code (`DataTable` et chacun de ses deux
appelants la posent). Il faut retirer les deux pour faire rougir la moitié « encapsulé » —
c'est une propriété du code, pas une faiblesse du test, et elle est notée ici pour qui
rejouera l'ablation.

**Le mode sombre reste hors périmètre et reste cassé** : `bg-foreground` vaut `#fcf9f3` sous
`.dark`, où le `text-white` de la barre mesure **1,05:1**. Aucune classe `.dark` n'est jamais
posée (aucun `ThemeProvider`, aucun `prefers-color-scheme`), donc rien de tout cela n'est
atteignable aujourd'hui.
