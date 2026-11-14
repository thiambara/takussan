---
id: TCK-2836
title: "Au téléphone, la barre d'actions groupées prend la place de la barre d'onglets pendant une sélection — un mécanisme de coque commun aux écrans à sélection"
status: todo
phase: P2
family: front
estimate: M
wave: 90
created: 2026-11-14
updated: 2026-11-14
depends_on: [TCK-2638]
blocks: []
spec_refs:
  features:
    - "docs/features.md#11-gestion-des-biens"
  models: []
tags: [front, coque, mobile, selection, audit-ux, app, suite-de-tck-2638]
---

## Objectif utilisateur

Au téléphone, pendant qu'il sélectionne plusieurs éléments, l'utilisateur a ses actions groupées
là où il a le pouce : en bas de l'écran, à la place de la barre d'onglets. Elle revient dès que la
sélection est vide.

## Constat (mesuré le 2026-11-14, TCK-2638 lot D)

- Sur `/app/properties` (Gestion et Annonces, 390 px), la barre d'actions groupées est un créneau
  du `FloatingDock` (`useFloatingDockSlot`, TCK-644). Elle flotte **80 px au-dessus** de la barre
  d'onglets, qui reste affichée. Ses cinq commandes sont atteignables, mais la Direction de
  TCK-2638 demande qu'elle se pose « en bas, à la place de la barre d'onglets ».
- La maquette `app-biens` ne dessine pas la sélection. L'écart est écrit dans
  `docs/qa/audit-ux-2026-11/fidelite/TCK-2638.json` (« barre d'actions groupées pendant une
  sélection »).
- D'autres écrans de `/app` sélectionnent en lot : les impayés (`admin/finances/impayes/SelectionDesImpayes.tsx`)
  et, hors de `/app`, la console (`admin/super/moderation.tsx`, `SuperAdminPropertiesTable.tsx`).
  Chacun pose sa barre à sa façon.

## Delta à produire

- [x] Un mécanisme de **coque**, pas d'écran : un écran déclare « une sélection est en cours »
  (hook ou contexte exposé par `AppShell`, à côté de `data-barre-onglets`, TCK-2481). Tant qu'une
  déclaration est active, sous `md`, la coque masque la barre d'onglets et réserve sa place à la
  barre d'actions de l'écran.
- [x] La barre d'actions de `PropertyList` s'y branche (téléphone), et garde son créneau du
  `FloatingDock` au bureau.
- [x] Les impayés (`SelectionDesImpayes`) s'y branchent s'ils posent une barre en bas au téléphone ;
  sinon, on le note.
- [x] Le lanceur de messagerie et les autres créneaux du `FloatingDock` restent atteignables
  pendant la sélection.

## Critères d'acceptation

- [x] AC1 — À 390 px sur `/app/properties`, après avoir coché deux biens, aucune barre d'onglets
  n'est visible, et la barre d'actions groupées touche le bas de l'écran, avec la marge de la zone
  sûre (`env(safe-area-inset-bottom)`). Après « Tout désélectionner », la barre d'onglets revient à
  sa place.
- [x] AC2 — Le contenu de la liste n'est jamais masqué par la barre : le dernier bien de la page
  reste atteignable en faisant défiler, avec ou sans sélection.
- [x] AC3 — À 1280 px, rien ne change : la barre reste dans son créneau du `FloatingDock`.
- [x] AC4 — Quitter la page pendant une sélection (lien, retour arrière) rend la barre d'onglets
  sur la page suivante. Une déclaration oubliée ne masque pas la barre pour toujours.
- [x] AC5 — Un test de la coque échoue si la barre d'onglets reste affichée pendant une sélection
  déclarée, ou si elle ne revient pas quand l'écran qui l'a déclarée est démonté. Vérification par
  ablation.

## Hors périmètre

- Le contenu de la barre d'actions (gestes, bilan) : inchangé depuis TCK-2638.
- La console (`/super-admin`), qui n'a pas de barre d'onglets.

## Notes d'implémentation

**Mécanisme (2026-11-14).** La déclaration d'en-tête de la coque (`en-tete-de-la-coque.tsx`, TCK-2617)
gagne un champ `selection`, et `AppShell` le compte dans `sansOnglets`, à côté de `conversation` et de
`formulaire` (TCK-2635). La primitive `layout/BarreDeSelectionDeLaCoque.tsx` déclare la sélection tant
qu'elle est montée. Elle se rend en portail, en flux, dans `#emplacement-barre-d-action` (TCK-2689), qui
devient le bas de l'écran (`data-bas-de-l-ecran`) : le `<main>` rétrécit de sa hauteur et la zone sûre
s'ajoute à son rembourrage. Sa hauteur varie (rangées, bilan), donc elle la publie dans
`--barre-d-action-hauteur` (ResizeObserver) : le toast et le dock se posent au-dessus d'elle.
`PropertyList` choisit sa barre par `REQUETE_DE_LA_BARRE` : la primitive au téléphone (aucun créneau du
dock), le créneau du `FloatingDock` au bureau. Une seule barre existe dans le DOM.

**Impayés.** `TeteDeSelection` pose déjà une `BarreDAction` en bas au téléphone. Elle déclare
`selection` en mode sélection : la barre d'onglets s'efface pendant ce mode (décision 2 (a), validée par
team-lead). Hors du mode sélection, rien ne bouge. Relevé à 390 (perturbateurs de TCK-2660, comparé aux
références regelées), avant et après le changement : total à y 76 et « Par locataire » à y 172 sur a-1
et a-2 ; 10,79 % et 10,19 % de pixels différents, des deux côtés.

**Bilan d'un lot.** La barre reste montée tant qu'un bilan s'affiche, et les onglets restent masqués
jusqu'à la croix (décision 1 (b), validée par team-lead). Un test le garde : le lot vide la sélection,
les onglets ne reviennent pas sous le bilan, puis reviennent à la croix. Ablation (la barre démontée
avec la sélection) : rouge.

**Dock.** Sur `/app/properties` et les impayés, aucun autre créneau du `FloatingDock` n'est monté au
téléphone : le lanceur de messagerie ne se rend plus sur `/app` (TCK-2481), et la pastille du
comparateur ne vit que sous les favoris et les recherches. Un créneau futur se poserait au-dessus de
la barre, par `--floating-dock-base` (16 px + hauteur publiée).

**Mise en page du choix de l'agent (contenu inchangé).** À 390 px, pleine largeur, côte à côte,
« Changer l'agent responsable » débordait l'écran et l'invite se coupait. Au téléphone, le groupe
s'efface (`contents`) : le choix de l'agent prend toute sa rangée, puis viennent le bouton et la
croix. Relevé : l'invite « Agent responsable… » se lit en entier à 360 (déclencheur de 328 px) et à
390 (358 px). Aucun débord (`scrollWidth` égal à la largeur). La barre fait 200 px à 360 et 156 px
à 390.

**Preuves.**
- AC1 : relevé à 390, admin, deux biens cochés. Pas de barre d'onglets ; la barre va de 732 à
  844 (le bas de l'écran), en flux dans l'emplacement. Après « Tout désélectionner », la barre
  d'onglets revient (780 à 844). Avant : barre `fixed` de 148 px, 16 px au-dessus des onglets.
- AC2 : `<main>` de 56 à 732. Défilé jusqu'au bout, le contenu s'arrête à 732 : rien n'est sous la barre.
- AC3 : relevé à 1280. Barre `fixed`, de 790 à 876 (créneau du dock), pas dans l'emplacement,
  aucune sélection déclarée.
- AC4 : tests `PropertyList.selection-telephone.tck-2836` (liste démontée pendant une sélection)
  et `selection-de-la-coque.tck-2836` (écran démonté : barre d'onglets rendue).
- AC5 : `layout/__tests__/selection-de-la-coque.tck-2836.test.tsx`. Ablation du terme `selection`
  de `sansOnglets` : 2 tests rouges sur 4. Ablation du choix téléphone de `PropertyList` : 2 tests
  rouges sur 4. Fichiers restaurés, md5 vérifié.
