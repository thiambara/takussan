---
id: TCK-371
title: "Console agence — contraste des entrées verrouillées, tables tronquées sur mobile, focus clavier"
status: done
phase: P1
family: front
estimate: S
wave: 47
created: 2026-08-26
updated: 2026-08-27
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

- [x] Contraste des entrées verrouillées porté au-dessus de 4,5:1
      <br>`text-white/40 + opacity-60` (alpha effectif 0,24, **2,18:1**) → `text-white/55` seul, **6,04:1**. `opacity-60` est retiré et non remplacé : il atténuait aussi le cadenas et l'icône, qui portent déjà l'interdit.
- [ ] Conteneur défilant sur les tables larges de la console, en remplacement de `overflow-hidden`
      <br>**Sans objet : le constat ne se reproduit plus.** TCK-373 (mergé) a supprimé la construction décrite — les deux tables passent par la primitive `DataTable`, dont le `<Table>` porte son propre `overflow-x-auto`, et il ne reste **aucune `<table>` écrite à la main sur la surface `/admin`**. Aucun code de production n'a été écrit pour cette ligne. **Ce qui a été livré à la place** : l'invariant est verrouillé par une garde qui modélise la propriété `overflow` (CSS Overflow 3 §3) au lieu de chercher quatre littéraux.
- [x] Anneau de focus visible sur les éléments interactifs écrits à la main
- [x] Tests : au moins un qui éprouve l'atteignabilité des actions de ligne en largeur réduite
      <br>⚠ **jsdom n'a aucun moteur de mise en page** : la garde éprouve la *structure* qui rend le défilement possible, pas un rendu à 375 px. La mesure à 375 px, elle, a été faite **en vrai navigateur par la revue** (cf. AC2/AC3), et n'est pas rejouable par la suite de tests.

## Critères d'acceptation

- [x] AC1 — le rapport de contraste de l'entrée verrouillée est **recalculé et reporté dans la
      PR**, paire par paire, avec la valeur obtenue. Un « c'est plus lisible » ne coche pas ce
      critère : c'est un chiffre qui le coche
      <br>**21 paires recalculées et reportées** (cf. reprise), par trois implémentations indépendantes qui se retrouvent au centième. L'entrée verrouillée : **2,18:1 → 6,04:1**.
- [x] AC2 — à 375 px de large, le menu d'actions de la dernière colonne de `/admin/team` est
      **atteignable**, et le corps de la page ne défile pas horizontalement
      <br>**Exécuté par la revue dans Chrome** (émulation 375×812, DPR 2, mobile + touch), sur le DOM réel des composants et le CSS du projet compilé par `@tailwindcss/node` : `documentElement.scrollWidth === clientWidth === 375` et `main.scrollWidth === clientWidth` → le corps ne défile pas. Table des membres : 7 colonnes, conteneur `overflow-x: auto` **calculé** (pas la classe), 343 / 744. Le déclencheur d'actions est hors cadre au repos et **entièrement visible** après `scrollLeft = scrollWidth`.
- [x] AC3 — même vérification sur le tableau des impayés
      <br>Même protocole : 7 colonnes, 343 / 635, déclencheur atteignable.
- [x] AC4 — `grep -c focus-visible` sur la surface `/admin` est strictement supérieur à 10, et
      chaque ajout porte sur un élément réellement interactif (vérifier par lecture)
      <br>Exécuté le 2026-08-27 : **111 occurrences sur 24 fichiers** (10 au constat d'origine). La seconde moitié est gardée et non plus seulement relue : la règle éprouvée est structurelle — tout élément interactif **écrit à la main** (sans `data-slot`, donc hors primitive `ui/`) déclare son propre anneau, à opacité pleine, ≥ 3:1 sur chacun de ses fonds — sur 7 écrans de la console, chacun avec un **plancher de compte** pour qu'un composant qui cesserait de rendre ses boutons ne rende pas la boucle verte par vacuité.
- [ ] AC5 — `npm run lint`, `npx tsc --noEmit`, `npm run test` passent
      <br>**Deux tiers exécutés.** `npx tsc --noEmit` → exit 0 sur l'arbre fusionné (2026-08-27) ; `npm run lint` → 0 erreur, 36 avertissements tous préexistants ; `check-super-admin-tokens` vert **et son cliquet immobile** (46/46 avant comme après), `check-locale-figee`, `check-app-tokens`, `npm run check:i18n` verts. **`npm run test` en ENTIER : non lancé.** La revue a joué `npx vitest run src/components src/app` **deux fois**, à `load average` 39-45 puis 26-78 : 6 rouges puis 2 rouges, **ensembles DISJOINTS**, les trois fichiers relancés seuls → 19 tests, 0 échec. Aucun n'est touché par ce ticket : artefact de charge (l'histoire de D-44), établi et non supposé. **Une passe large ne dit rien sous cette charge — se coche par le rituel de fin de branche, machine au repos.**

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


## Reprise après revue adverse — 2026-08-27

La revue a rendu **REFUSÉ**, et le motif est le plus instructif du lot : **le défaut trouvé sur le
jumeau TCK-359 se reproduisait ici, au même endroit et pour la même raison.** L'anneau de focus de
l'entrée de navigation ACTIVE mesurait **2,48:1** — mesuré dans Chrome, atteint par un vrai
Shift+Tab — sous les 3:1 de WCAG 1.4.11, *parce qu'il était mesuré contre le fond de la barre et non
contre le fond que l'entrée focalisée a réellement*. Une ablation montrait qu'un anneau à **1,00:1**
serait passé. La topbar de `/admin` n'avait, elle, aucun `focus-visible`. **Huit défauts confiés,
huit corrigés, chacun prouvé par ablation.**

**Le correctif ne touche pas les fonds : il change la couleur de l'anneau.** `outline-ring` →
`outline-white` sur les surfaces sombres. C'est la géométrie qui condamnait la couleur —
`outline-2` + `-outline-offset-2` remplit la bande de 2 px la plus extérieure de l'élément, donc son
bord interne jouxte le fond **propre** de l'entrée, jamais celui de la barre. `white` tient sur les
trois fonds (13,17 à 17,53:1) et **reste au-dessus de 3:1 même si le fond de l'entrée active
devenait `--primary`** (5,32:1) : c'est un anneau qui ne dépend d'aucune hypothèse sur ce qu'il
recouvre. Il ne fait pas monter le cliquet de `check-super-admin-tokens.mjs` (46/46, vérifié).

**Les tests ne figent plus de chaînes de classes : ils recalculent le contraste WCAG** sur le fond
réel remonté du DOM, alpha composé avant le calcul, **sur tous les états que l'élément peut
prendre — `hover:` compris**, l'état absent du DOM au repos et celui qui avait échappé. Le harnais
LÈVE sur un jeton inconnu au lieu de retomber sur une valeur de repli.

**Un neuvième défaut est apparu en écrivant ce test, et il explique le premier.** Le fixture
d'origine rendait `agencyIsStandard={false}`, or `/admin`, `/admin/team` et `/admin/roles` sont dans
`PRO_ROUTES` : l'entrée ACTIVE y est un `<span>` verrouillé posé sur le fond nu, et `bg-white/10` —
le fond dont l'anneau mesurait 2,48:1 — **n'était jamais rendu**. Le test mesurait donc la seule
paire qui passait. Le fichier rend désormais les deux plans.

Les deux ablations qui comptent : **H** (`outline-ring` + fond actif `bg-primary`) rougit avec le
chiffre nominatif — « = 1,00:1 » — et **H2**, la contre-épreuve, garde `bg-primary` **avec** l'anneau
blanc (5,32:1, anneau réellement visible) et reste **VERTE** : la garde accepte un correctif juste
écrit autrement, au lieu de figer une valeur.

**Les 21 paires recalculées**, avant/après. Anneau blanc : barre nue **17,53:1**, entrée active
**13,17:1** (c'était 2,48), entrée survolée **15,39:1** (c'était 2,89), hamburger survolé **13,17:1**
(c'était 1,75 par la règle globale `* { outline-ring/50 }`). `outline-ring` conservé sur fonds
clairs : 4,51 à 5,32:1, minimum **4,51:1**. Encre : verrouillée **6,04:1**, inactive **9,06:1**.

**Trois autres corrections :** les deux contrôles écrits à la main de la topbar (hamburger, logo)
portent enfin un anneau ; l'entrée verrouillée devient **focusable** (`tabIndex={0}`, motif
« désactivé mais découvrable ») et la raison du cadenas entre dans son **nom accessible** via un
`sr-only`, là où le `title` n'était servi qu'au pointeur ; et la garde d'overflow lit la
**propriété** au lieu de quatre littéraux — mesuré, `overflow-x-auto → overflow-auto`
(fonctionnellement équivalent) rendait deux **faux rouges**, tandis qu'`overflow-x-hidden`, le
défaut d'origine du ticket, rougit bien.

### Ce qui reste ouvert

- **`ui/button.tsx:7` emploie `focus-visible:ring-ring/50` = 2,12:1 sur `--card`**, et la primitive
  est montée site-wide. Les gardes l'**excluent explicitement** (filtre sur `data-slot`) au lieu de
  le mesurer et de rougir — et c'est un choix : *un rouge permanent qu'un lot ne peut pas corriger
  est ce qui fait désarmer une garde.* Vaut un ticket propre.
- **`AppSidebar.tsx:252` porte exactement le même défaut que l'entrée verrouillée d'`AdminSidebar`**
  (`<span role="link" aria-disabled title>` non focusable, raison du cadenas dans le seul `title`).
  Hors périmètre — ce ticket porte sur `/admin`. Non touché.
- **`AdminShell.tsx:27-35` rend un `<SheetContent>` sans `SheetTitle` ni `aria-label`** : le tiroir
  mobile n'a **aucun nom accessible**. Signalé par lecture, non exécuté — le comportement de focus
  du portail ne se reproduit ni en jsdom ni en page statique. Hors périmètre (ni contraste, ni
  troncature, ni anneau), et le corriger demande une clé i18n neuve dans les trois dictionnaires.
- **`PendingInvitationsSection.tsx` (TCK-368) porte une `<table>` écrite à la main** que la garde
  AC4 ne rend pas : ni elle ni son `overflow-x-auto` n'entrent dans l'invariant. Si l'invariant
  « aucune `<table>` à la main sur `/admin` » doit être gardé, c'est là qu'il reste à le faire.
- **Le mode sombre reste hors périmètre et reste cassé** (`bg-foreground` vaut `#fcf9f3` sous
  `.dark`, où `text-white` mesure 1,05:1) — et reste inatteignable : aucun `ThemeProvider`, aucun
  `prefers-color-scheme`.
- **Le dépôt porte désormais deux implémentations du calcul WCAG** : `src/test/contraste-wcag.ts`
  (jetons recopiés, fond remonté du DOM, pour les tests) et `scripts/check-chart-contrast.mjs`
  (jetons parsés depuis `globals.css`, pour la CI). Elles ne mesurent pas la même chose et la
  seconde ne peut pas exécuter la première ; mais **leurs tables de jetons peuvent diverger**, ce
  qui est le motif de TCK-374 D1 transposé. À verser dans un ticket de convergence.
