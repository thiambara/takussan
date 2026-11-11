---
id: TCK-2690
title: "Fidélité au pixel : primitives neuves, lot 2 — feuille du bas, case à cocher, interrupteur, jauge"
status: done
phase: P1
family: front
estimate: M
wave: 91
created: 2026-11-10
updated: 2026-11-11
depends_on: [TCK-2685]
blocks: [TCK-2691]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, design-system, primitives, audit-ux, app, fidelite]
---

## Objectif utilisateur

Dans `/app`, une action secondaire s'ouvre au téléphone dans une feuille qui monte du bas, une sélection se coche, un réglage se bascule et une progression se lit avec les mêmes pièces sur toutes les pages, dessinées comme dans la maquette retenue et lisibles par tous.

## Contrat de données

Aucun changement d'API.

- **Lit** : `ui/sheet.tsx` (`side="bottom"`), `@base-ui/react/checkbox`, `@base-ui/react/switch`, les trois jauges locales (`WizardShell:191`, `WizardReprenable:402`, `MiseEnService:105`) ; les jetons, l'ombre « feuille », la portée `/app` de TCK-2685.
- **Produit** : quatre primitives neuves, rendues par la vitrine.

## Direction UX / Artistique

> **Principe d'arbitrage (décidé par le porteur le 2026-11-10, [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md))** : la maquette retenue fait foi au pixel, sauf (1) une règle d'accessibilité mesurée, (2) une contrainte technique, (3) une incohérence interne des maquettes, tranchée par la valeur majoritaire. Mesure : téléphone 390 × 844 à `rem` 16, bureau 1440 × 900 à racine 16 et densité ×0,9 ([ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)). Valeurs : [annexe B](../../../qa/audit-ux-2026-11/fidelite/B-composants.md) § 2.4, § 3.2, § 3.3, § 6 (n° 9, 12, 13, 17) ; [annexe C](../../../qa/audit-ux-2026-11/fidelite/C-coque.md) § 2.3 (C10).

**Ses propres exceptions** :

| Valeur de la maquette | Retenu | Motif |
|---|---|---|
| Case vide bordée `foreground/30` (1,93:1), `border-border` (1,26:1), `input/60` (2,01:1) | bord `border-input` (3,59:1) | (1) WCAG 1.4.11, ≥ 3:1 |
| Interrupteur éteint `foreground/20` (1,52:1) ou `border` (1,26:1) | piste éteinte `bg-input` | (1) ≥ 3:1 |
| Sept cases à cocher (16 / 18 / 20 px, rayons 4 / 5 / 6 / 8 px) | **18 px**, rayon 5 px | (3) majoritaire (argent, équipe, commissions, biens), recommandation D5 |
| Quatre interrupteurs (20 × 36, 24 × 40, 28 × 48) | **24 × 40** | (3) majoritaire (agenda, aujourd'hui, réservations, documents) |
| Quatre jauges (`h-1`, `h-1.5`, `h-2`, rail `muted` ou `border`) | `h-1.5` (`h-2` en grand), rail `bg-muted` ; segments `h-1` | (3) |
| Remplissage de jauge sur rail `--muted` | chaque ton ≥ 3:1 contre le rail | (1) graphique porteur de sens — à mesurer par ton |
| Feuille : `shadow-2xl` (charte : jamais sur un élément courant) | l'ombre nommée « feuille » de TCK-2685, même valeur | aucune au rendu |
| Voile de feuille `foreground/35` (brun) | `foreground/35` — décidé par le porteur le 2026-11-10 (2 a) | principe : la maquette fait foi |

### Feuille du bas — 15 pages, 33 tickets ; `chrome-app.tsx:575` (`FeuilleBas`, 31 occurrences) ; `?p=app-coque&a=a`

| Partie | Maquette (téléphone) | Produit aujourd'hui (`SheetContent side="bottom"`) |
|---|---|---|
| Voile | `bg-foreground/35` | `bg-scrim/30` |
| Panneau | `rounded-t-2xl` (18 px), `bg-card`, hauteur max. 90 % (`90dvh`) | rayon 0, ombre `0 0 40px foreground/4 %` |
| Poignée | `mx-auto mt-2 h-1 w-8 rounded-full bg-border` (32 × 4) | absente |
| En-tête | `py-1 pl-4 pr-1` ; titre **17 px** `font-semibold`, tronqué ; fermer 44 px (`size-11`), `X size-5` | `SheetTitle` `text-base`, rien d'autre |
| Corps | `px-4 pb-4`, défile | — |
| Pied (facultatif) | `border-t border-border px-4 py-3`, action collante, + zone sûre | — |

À ≥ `md`, aucune maquette bureau ne dessine de feuille du bas : la primitive ne s'y ouvre pas en feuille (dialogue centré ou panneau latéral de TCK-2688, au choix de l'implémenteur, écrit dans la vitrine).

### Case à cocher — 10 pages, 26 tickets ; `?p=app-argent&a=a`, `?p=app-equipe&a=a`

| État | Valeur |
|---|---|
| Boîte | **18 × 18 px**, rayon 5 px, bord 1 px `border-input`, fond `bg-card` |
| Cochée | `border-primary bg-primary`, `Check` `size-3.5`, trait 2,5, encre `primary-foreground` |
| Mixte (listes à sélection) | même fond, `Minus` |
| Focus | anneau plein du produit (TCK-753) |
| Cible | la ligne qui la porte (44 à 56 px) ; la boîte seule n'est pas la cible |

### Interrupteur — 9 pages, 16 tickets ; `?p=app-agenda&a=a`, `?p=app-documents&a=a`

Piste **24 × 40 px** (`h-6 w-10 p-0.5`), pouce `size-5 bg-card` avec ombre légère ; allumé `bg-primary`, éteint `bg-input` ; cible par la ligne ; `role="switch"` et `aria-checked` (Base UI).

### Jauge — 10 pages, 26 tickets ; `?p=app-credits&a=a`, `?p=app-identite-agence&a=a`

Rail `h-1.5 rounded-full bg-muted overflow-hidden` (grand : `h-2`) ; remplissage `rounded-full`, tons `primary`, `success`, `warning`, neutre ; variante « segments » (étapes) `h-1 gap-1.5` ; `role="progressbar"` avec valeur, minimum, maximum et nom accessible.

## Contraintes strictes (métier)

**Pas de régression.** Ce qui existe et doit rester :

- **Les huit feuilles du bas existantes** (`PropertyMobileBottomBar`, `ApercuAnnonce`, `PrevenirDeLaSelection`, `PartageDeSelection`, `FeuilleDeLien`, `ContactSheet`, `SuiviDeLecture`, `PropertyListFilters`) — sept sur le site public — ne changent pas : `SheetContent side="bottom"` garde son rendu ; la feuille du bas est une primitive **neuve** posée dessus.
- **Les cases natives** (44 fichiers `type="checkbox"`, dont 2 sous `(dashboard)`) et les 6 interrupteurs natifs (`role="switch"`) ne changent pas : leur migration relève des pages.
- **Les trois jauges locales** (parcours de publication, assistant reprenable, mise en service) ne changent pas.
- **Le tiroir « Menu »** (`SheetContent side="left"` d'`AppShell`) et celui de `/super-admin` ne changent pas.
- La feuille garde le comportement d'un dialogue : focus piégé, `Échap` et voile ferment, le focus revient au déclencheur, le défilement de la page est verrouillé (`useVerrouDeDefilement`, TCK-551 : `overflow: hidden` seul ne tient pas sur iOS).
- Libellés neufs (« Fermer », « Tout sélectionner », états lus par l'assistance) en `fr`/`en`/`wo` (`wo` = le texte français tel quel), vouvoiement ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md)).

## Delta à produire

- [ ] Feuille du bas : voile, panneau, poignée, en-tête, corps, pied, zone sûre ; comportement à ≥ `md`.
- [ ] Case à cocher (vide, cochée, mixte, désactivée, en erreur) sur `@base-ui/react/checkbox`.
- [ ] Interrupteur (éteint, allumé, désactivé) sur `@base-ui/react/switch`.
- [ ] Jauge (quatre tons, grande taille, segments).
- [ ] La vitrine (TCK-2685) rend chacune dans chacun de ses états.
- [ ] Tests de contraste des contrôles non textuels (bord de case vide, piste éteinte, remplissage de jauge par ton) et tests de comportement (clavier, `aria-*`, verrou de défilement).
- [ ] `docs/design-guidelines.md` : les quatre primitives et leurs contrastes.

## Critères d'acceptation

- [ ] AC1 — Feuille de la vitrine ouverte à 390 : coins hauts de 18 px de rayon (`rounded-t-2xl` à `rem` 16), poignée de 32 × 4 px, titre de 17 px tronqué sur une ligne avec un titre de 80 caractères, bouton fermer de 44 × 44 px ; `document.scrollingElement` ne défile pas pendant qu'elle est ouverte (`scrollBy` sans effet).
- [ ] AC2 — Comparée par l'outil de TCK-2684 à une feuille gelée de `?p=app-coque&a=a`, la feuille de la vitrine ne rend aucun écart au-delà des tolérances (boîte, en-tête, poignée).
- [ ] AC3 — Case de la vitrine : 18 × 18 px aux deux largeurs ; bord vide `rgb(145, 134, 114)`, ≥ 3:1 sur `--card` et `--background` (test) ; cochée et mixte rendent `--primary` ; un clic sur le libellé de sa ligne la coche.
- [ ] AC4 — Interrupteur de la vitrine : 24 × 40 px à 390 ; piste éteinte ≥ 3:1 contre `--card` ; `Espace` le bascule et `aria-checked` suit.
- [ ] AC5 — Jauge de la vitrine : rail de 6 px à 390 ; chaque ton de remplissage ≥ 3:1 contre `--muted` (test) ; `aria-valuenow` égal à la valeur affichée.
- [ ] AC6 — Relevé avant/après de la fiche de bien publique à 390 (barre du bas), de `/fr/favorites` (feuilles de partage) et de `/app/properties` (filtres en feuille) : zéro écart.

## Hors périmètre

- Les pages (vagues 86 à 90) : adopter ces primitives, migrer leurs cases, interrupteurs et jauges.
- Les feuilles de la coque (feuille du compte, actions « ⋯ ») : TCK-2617 les crée sur cette primitive.
- Le panneau latéral droit (TCK-2688).

## Notes d'implémentation

**Livré** (2026-11-11) : `ui/feuille-du-bas.tsx` (`FeuilleDuBas`), `ui/checkbox.tsx` (`Checkbox`), `ui/switch.tsx`
(`Switch`), `ui/progress.tsx` (`Progress`, `ProgressSegments`), rendus par la vitrine dans chacun de leurs états ; jetons
`rounded-case` et `controle-vide` (bloc `primitives-de-l-app` de `globals.css`, sous-partie TCK-2690) ;
`docs/design-guidelines.md` § « Les primitives neuves de la partie connectée » ; fiches et aperçus `.design-sync/`.
`ui/sheet.tsx` n'est **pas** touché.

**Écarts au ticket, et pourquoi** :

- **Thème sombre** : la table d'exceptions ne mesurait que le clair. `--input` sombre rend **1,44:1** sur `--card` :
  le bord de case et la piste éteinte passent par le jeton `controle-vide` — `--input` en clair, `--muted-foreground`
  en sombre (7,01:1), redéclaré sur `.dark` (mesuré au navigateur, `.dark` imbriqué compris : `rgb(184, 170, 151)`).
- **Case mixte** : la **barre de 10 × 2** de la maquette (`h-0.5 w-2.5`, `app-equipe`, `app-moderation`), pas l'icône
  `Minus` que le ticket nommait (ADR-0106 : la maquette fait foi).
- **Verrou de défilement** : `useVerrouDeDefilement` + `modal="trap-focus"` **hors du régime du bureau** (téléphone,
  tablette à pointeur grossier) ; au régime du bureau (`md` ET pointeur non grossier, celui de la densité), celui de
  base-ui (`modal`), qui compense une barre de défilement classique — le crochet sort `body` du flux (saut DÉDUIT, non
  mesuré : le Chrome de mesure a des barres superposées). Mesuré à 1024 px tactile avec un découpage sur la seule
  largeur : base-ui y posait `overflow: hidden`, que `scrollBy` traversait (803 → 1103) — d'où le critère du pointeur.
- **À ≥ `md`** : dialogue centré (`max-w-lg rounded-2xl` : 460,8 px et coins de 16,2 px au bureau, sans poignée), en-tête et pied gardés ; écrit dans la
  vitrine.
- **Le ✕** : un bouton `ghost` sous la portée prend l'encre discrète (`rgb(76, 70, 65)`) ; la maquette dessine
  `--foreground` — posé sur le bouton (écart relevé par la comparaison d'AC2).
- **Libellés** : aucune clé neuve. « Fermer » est `common.actions.close` ; « Tout sélectionner » et les noms de jauge
  sont ceux de l'appelant ; les états lus par l'assistance (`aria-checked="mixed"`, `aria-valuetext`) viennent de base-ui,
  le texte de la jauge formaté dans la langue de la page (`useLocale`).
- **ESLint** : `label-has-associated-control` déclare `Checkbox` et `Switch` comme contrôles (`eslint.config.mjs`) — la
  ligne-cible de la maquette est un `<label>` qui les enveloppe.

**AC1** — vitrine, 390 : coins hauts **18 px**, poignée **32 × 4**, titre de **80 caractères** à **17 px** sur une ligne
(25,5 px de haut, `text-overflow: ellipsis`, `scrollWidth > clientWidth`), fermer **44 × 44** (✕ 20 px), panneau
`max-height` 759,6 px (90 % de 844). Ouverte, `body` en `position: fixed` : `scrollingElement.scrollTop` 0 → 0 après
`scrollBy(0, 400)` ; la position réelle (1 500) revient à la fermeture. `Échap` ferme, le focus revient au déclencheur,
`body` redevient `static` ; un clic sur le voile ferme. Même verrou sur une tablette de 1024 px à pointeur grossier
(803 → 0 → 803) ; au bureau (1440, pointeur fin), celui de base-ui.

**AC2** — la feuille « Mon compte » de la vitrine contre la référence gelée `app-coque/a-5-telephone.json`, aux
tolérances de l'outil de TCK-2684 (`TOLERANCES` et `egalCouleur` de `scripts/fidelite/comparer.mjs` ; pas
`fidelite.mjs compare`, qui compare des pages entières) — positions relatives au haut du panneau, sa hauteur (portée
par le contenu) exclue : **30 contrôles, 0 écart** — voile (boîte, alpha 0,35), panneau (x, largeur, bas, fond,
rayons 18/18/0/0, ombre identique au caractère), poignée (x 179, +8, 32 × 4, fond), titre (x 16, +25,25 contre +25,3,
318 × 25,5, DM Sans 17/600, interligne, couleur), ✕ (x 354, +28, 20 × 20, couleur, trait 2), corps (+64, x 16).

**AC3** — 18 × 18 aux deux largeurs, rayon 5 px ; bord vide `rgb(145, 134, 114)` (3,59:1 sur `--card`, 3,41 sur
`--background`, 3,04 sur `--muted` — test, deux thèmes) ; cochée et mixte `rgb(168, 83, 50)` ; coche 14 px, barre
10 × 2 (9 × 1,8 au bureau) ; un clic sur le libellé de la ligne (cible `LABEL`) la coche.

**AC4** — 24 × 40 à 390 (21,6 × 36 à 1440, l'échelle ×0,9) ; éteint `rgb(145, 134, 114)`, 3,59:1 sur `--card` ;
`role="switch"`, `Espace` le bascule et `aria-checked` suit (test).

**AC5** — rail 6 px à 390 (5,4 au bureau ; 8 / 7,2 en grand) ; chaque ton ≥ 3:1 contre `--muted` (test, deux thèmes :
`primary` 4,51 / 3,99, `success` 5,24 / 6,25, `warning` 5,31 / 6,03, `neutral` 3,23 / 4,37) ; `aria-valuenow` = la
valeur affichée (60 / « 60 % », 100, 85, 30).

**AC6** — relevé avant/après de tous les `[data-slot]`, `h1`, `h2` du document : `/app/properties` à 390 **feuille des
filtres OUVERTE** — ses 22 nœuds de portail, **0 écart** ; hors feuille, 315 nœuds, 0 écart (une fois retiré le nœud
« Get started 2 of 3 » du menu (persona en anglais), apparu entre les deux relevés : donnée du compte de démo). Fiche publique à 390 (barre du
bas) et après « Écrire » (dialogue) : 0 ; `/fr/favorites` anonyme et client, 390 et 1440 : 0. Les feuilles de partage
(aucun favori sur le compte de démo) et la feuille « numéros » de la fiche (un seul numéro) ne s'ouvrent pas sur ces
données : la preuve de structure est le test qui fige `SheetContent side="bottom"` au caractère près.

**Compteur relevé** : `surface-publique.contraste.test.ts`, `ENCRES_INVERSES` 411 → 415 (la vitrine seule, détail dans le
docblock).

