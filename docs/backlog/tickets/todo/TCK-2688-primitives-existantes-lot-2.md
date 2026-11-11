---
id: TCK-2688
title: "Fidélité au pixel : primitives existantes, lot 2 — panneau latéral de 480 px, tableau, bandeau d'avertissement, radio et carte de choix, champ de recherche, toast"
status: todo
phase: P1
family: front
estimate: M
wave: 91
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2685, TCK-2686]
blocks: [TCK-2580, TCK-2581, TCK-2584, TCK-2586, TCK-2587, TCK-2589, TCK-2590, TCK-2592, TCK-2594, TCK-2596, TCK-2597, TCK-2598, TCK-2600, TCK-2601, TCK-2602, TCK-2603, TCK-2604, TCK-2606, TCK-2608, TCK-2611, TCK-2613, TCK-2614, TCK-2617, TCK-2618, TCK-2619, TCK-2621, TCK-2622, TCK-2624, TCK-2625, TCK-2628, TCK-2629, TCK-2632, TCK-2634, TCK-2635, TCK-2636, TCK-2638, TCK-2639, TCK-2641, TCK-2643, TCK-2644, TCK-2645, TCK-2647, TCK-2648, TCK-2650, TCK-2651, TCK-2653, TCK-2654, TCK-2656, TCK-2659, TCK-2660, TCK-2662, TCK-2664, TCK-2667, TCK-2668, TCK-2670, TCK-2671, TCK-2673, TCK-2675, TCK-2677, TCK-2678, TCK-2682]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, design-system, primitives, audit-ux, app, fidelite]
---

## Objectif utilisateur

Dans `/app`, un panneau de fiche ouvert à droite, un tableau, un avertissement, un choix, une recherche ou une confirmation éphémère ont l'aspect et la place que la maquette retenue leur donne.

## Contrat de données

Aucun changement d'API.

- **Lit** : `ui/sheet.tsx` (`side="right"`), `console/DataTable.tsx`, `ui/warning-banner.tsx`, `ui/choice-card.tsx` et les radios natives, `console/DebouncedSearchInput.tsx`, `ui/toast.tsx` et ses six fournisseurs (`(dashboard)`, `(super-admin)`, `[locale]/(public)`, `publish`, `onboarding`, `onboarding/super-admin`) ; les jetons, ombres et la portée `/app` de TCK-2685 ; l'échelle de TCK-2686.
- **Produit** : l'aspect de ces primitives sous la portée `/app` ; une taille de panneau ; une variante de toast.

## Direction UX / Artistique

> **Principe d'arbitrage (décidé par le porteur le 2026-11-10, [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md))** : la maquette retenue fait foi au pixel, sauf (1) une règle d'accessibilité mesurée, (2) une contrainte technique, (3) une incohérence interne des maquettes, tranchée par la valeur majoritaire. Mesure : téléphone 390 × 844 à `rem` 16, bureau 1440 × 900 à racine 16 et densité ×0,9 ([ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)). Valeurs : [annexe B](../../../qa/audit-ux-2026-11/fidelite/B-composants.md) § 3.2 à 3.4 et § 6 (n° 14, 15, 16, 18, 23, 24).

**Ses propres exceptions** :

| Valeur de la maquette | Retenu | Motif |
|---|---|---|
| Contour du champ de recherche et du radio en `border-border` / `input/60` / `foreground/30` (1,26 à 2,01:1) | `border-input` (3,59:1) | (1) WCAG 1.4.11, TCK-753 |
| Texte du champ de recherche 15 px au téléphone | 16 px sous `md` | (2) anti-zoom iOS |
| Quatre champs de recherche (`h-11 rounded-lg`, `h-9 w-64`, `rounded-full` ×2) | `h-11` au téléphone, `h-9` au bureau (échelle de TCK-2686), `rounded-lg` | (3) majoritaire (argent, biens, documents, équipe) |
| Radios de 16, 18 et 20 px | 20 px | (3) recommandation D5 de B |
| Carte de choix active `ring-[3px] ring-primary/12` | même anneau, écrit sans crochets | aucune |

### Panneau latéral droit (`Sheet side="right"`, taille large) — 10 pages, 21 tickets ; `chrome-app.tsx:594` (`PanneauDroit`), 25 occurrences dans 14 fichiers

| Partie | Maquette (bureau) | Produit aujourd'hui |
|---|---|---|
| Largeur | **480 px** (px : ne rétrécit pas au bureau) | `w-72` (288 px, rendu 259) |
| Bord, ombre | `border-l border-border`, ombre nommée « panneau » (TCK-2685) | ombre `0 0 40px foreground/4 %` |
| Voile | **aucun** | aucun — décidé par le porteur le 2026-11-10 (2 a) : le panneau est **non modal** (la page reste lisible et cliquable à côté), focus et `Échap` gérés en conséquence |
| En-tête | `h-14 border-b pl-5 pr-2`, titre **17 px** `font-semibold`, fermer `size-9` | aucun |
| Corps | `p-5`, défile | — |
| Pied | `flex justify-end gap-2 border-t border-border px-5 py-3` | — |

### Tableau (`DataTable`) — 12 pages, 24 tickets ; 16 `<table>` dans les maquettes (`?p=app-equipe&a=a`, `?p=app-demandes&a=a`, `?p=app-rapports&a=a`, `?p=app-reservations&a=a`)

| Partie | Maquette | Produit aujourd'hui |
|---|---|---|
| En-tête | `text-xs font-medium text-muted-foreground`, **casse normale**, `bg-muted/40`, `px-3 py-2.5`, `border-b` | `uppercase tracking-wide font-semibold`, `bg-muted/70` collant et flou |
| Ligne | `border-b border-border`, cellules `px-3 py-3` | `border-b`, 39 à 55 px |
| Conteneur | `rounded-xl border border-border` | `rounded-xl bg-card ring-1 ring-border` |

L'en-tête collant reste (comportement) ; seul son aspect suit la maquette.

### Bandeau d'avertissement (`WarningBanner`) — 10 pages, 17 tickets

`rounded-xl border border-warning/30 bg-warning/10 p-4`, encre **`foreground`** (> 13:1), titre `font-semibold` + texte ; au lieu de `ring-1 ring-warning/20 px-4 py-3 text-sm`, encre `text-warning`.

### Radio et carte de choix (`ChoiceCard`) — 8 pages, 16 tickets ; `?p=app-entree-orientation&a=a`, `?p=app-credits&a=a`, `?p=app-equipe&a=a`

| Partie | Maquette | Produit aujourd'hui |
|---|---|---|
| Radio | **20 px**, bord 1 px, point `size-2.5 bg-primary` | `ChoiceCard` : 18 px `border-2`, point `size-2` ; ailleurs natif |
| Carte | `min-h-16 rounded-xl border px-3.5 py-3 items-center` | `p-4 items-start` |
| Carte active | `border-primary`, anneau de 3 px `primary/12`, fond **blanc** | fond `bg-primary/[0.06]`, sans anneau |
| Titre / sous-titre | **15 px** `font-semibold` / **13 px** muted | titre 500 |

### Champ de recherche — 6 pages et plus

`rounded-lg border bg-card px-3 gap-2` ; icône `Search` au jeton 18 px, trait de la portée `/app`, `text-muted-foreground` ; bouton effacer `X size-4` ; hauteur de l'échelle (44 / 36).

### Toast — variante sombre en bas ; 2 pages, 3 tickets

| Partie | Maquette | Produit aujourd'hui |
|---|---|---|
| Aspect | `bg-foreground text-background rounded-xl min-h-12 px-4`, ombre `shadow-lg`, action texte (« Annuler ») | clair (`bg-popover` ou aplat du ton), `p-4 pr-10 border` |
| Position, téléphone | en bas, 16 px au-dessus de la barre d'onglets (`bottom-20` dans un cadre à barre de 64) | en haut à droite |
| Position, bureau | `bottom-6 right-6`, largeur 360 px | `top-6 right-6`, `max-w-sm` |

**Appliqué à tout le produit, site public compris — décidé par le porteur le 2026-11-10** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) § 2) (décision D8 de B : un toast ne change pas de place selon la page).

## Contraintes strictes (métier)

**Pas de régression.** Hors toast, le changement vaut **sous la portée `/app`** ; ailleurs le rendu est identique. Appelants à préserver (relevé du 2026-11-10, hors tests et maquettes) :

| Primitive | Fichiers appelants | Hors de `/app` à surveiller |
|---|---|---|
| `Sheet` | 19 (11 `side="right"`, 8 `side="bottom"`) | `public`, `favorites`, `property-form`, 3 sous `components/admin` ; le tiroir gauche d'`AppShell` et de `SuperAdminShell` |
| `DataTable` | 47 | 2 sous `/super-admin` |
| `WarningBanner` | 11 | 2 sous `/super-admin`, `components/super-admin`, `auth` |
| `ChoiceCard` | 2 | `onboarding` (2) |
| `DebouncedSearchInput` | 8 | 2 sous `/super-admin` |
| `useToast` | 54 | les six fournisseurs |

- **Le toast** garde son rôle d'annonce (`aria-live`), sa fermeture, sa durée et sa pile ; il ne passe jamais **sous** la barre d'onglets (`--barre-onglets-hauteur`), ni sous une barre d'action collante (TCK-2689) quand la page en porte une, ni sous la barre d'onglets publique (`BarreDOngletsPublique`) et le dock flottant (`--floating-dock-base`) du site public. Les tons (succès, danger) restent lisibles : icône ≥ 3:1 et texte ≥ 4,5:1 sur le fond sombre.
- **`useToast` hors d'un fournisseur** lève toujours au rendu serveur (Base UI #73) : les six fournisseurs restent.
- **Le panneau sans voile** reste un dialogue accessible : focus piégé ou non selon qu'il est modal, `Échap` ferme, le focus revient au déclencheur.
- **Le panneau de 480 px entre 1024 et 1279 px** couvre jusqu'à 64 % de la zone de contenu (C § 3.2) : son comportement à ces largeurs relève de la règle de l'ADR-0106 ; à défaut, il ne déborde jamais de la fenêtre.
- Le tri, la pagination et la sélection de `DataTable` ne changent pas.
- Libellés neufs (« Annuler » du toast s'il n'existe pas, « Effacer la recherche », « Fermer ») en `fr`/`en`/`wo` (`wo` = le texte français tel quel), vouvoiement ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md)).

## Delta à produire

- [ ] `Sheet` : taille large du panneau droit, en-tête, corps, pied, ombre nommée ; voile selon la décision.
- [ ] `DataTable` : en-tête en casse normale, cellules, conteneur bordé.
- [ ] `WarningBanner` : bord, aplat, encre, titre.
- [ ] Radio de 20 px et `ChoiceCard` de la maquette.
- [ ] Champ de recherche : icône, espacement, effacement, hauteur de l'échelle.
- [ ] Toast : variante sombre et position basse, sur décision du porteur.
- [ ] La vitrine (TCK-2685) rend chacune, dans chacun de ses états (panneau ouvert, ligne survolée, carte active, recherche remplie, toast avec action).

## Critères d'acceptation

- [ ] AC1 — Panneau droit de la vitrine à 1440 : 480 px de large (px, pas 432), en-tête de 50,4 px de haut (`h-14` à 90 %), titre de 17 px ; aucun voile si le porteur le confirme.
- [ ] AC2 — `DataTable` de la vitrine : `text-transform: none` sur l'en-tête, fond `--muted` à 40 %, cellules à `padding` 12 px horizontal (10,8 rendu au bureau) ; le tri au clavier fonctionne comme avant (test existant vert).
- [ ] AC3 — `WarningBanner` de la vitrine : encre `rgb(31, 24, 18)`, bordure 1 px `--warning` à 30 %, contraste ≥ 4,5:1 (test).
- [ ] AC4 — Radio de la vitrine : 20 × 20 px, bord `rgb(145, 134, 114)` 1 px ; carte de choix active : anneau de 3 px, fond `rgb(255, 255, 255)`, titre 15 px 600.
- [ ] AC5 — Champ de recherche de la vitrine : 44 px et texte de 16 px à 390, 32,4 px à 1440 ; icône de 18 px aux deux largeurs, trait 1,75 puis 1,5.
- [ ] AC6 — Toast déclenché sur `/app/leases` à 390 : son bas est 16 px au-dessus du haut de la barre d'onglets (±1 px), fond `rgb(31, 24, 18)` ; à 1440, à 24 px du bas et de la droite, 360 px de large. Sur une page publique à barre d'onglets, il ne la recouvre pas.
- [ ] AC7 — Relevé avant/après d'une page de `/super-admin` à `DataTable` et du tunnel `/onboarding` à `ChoiceCard`, à 390 et 1440 : zéro écart, hors toast (sombre en bas partout, décidé par le porteur le 2026-11-10).

## Hors périmètre

- Les pages (vagues 86 à 90) et leurs tableaux, panneaux et bandeaux.
- La feuille du bas (TCK-2690) : `side="bottom"` n'est pas touché ici.
- Le comportement des gabarits fixes entre 768 et 1279 px : la règle est écrite dans [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) et les maquettes à 1280 des pages qui se dégradent sont faites par la session (décision 3 b du porteur, 2026-11-10).
- Le code à six chiffres de l'entrée (petit composant de deux pages, vague 86).

## Notes d'implémentation

### Reprise du 2026-11-11 (terrain-4, après le plantage de la machine)

Le premier implémenteur (terrain-3) est mort au milieu du ticket ; ses passations dans `/private/tmp`
sont perdues. État relevé dans l'arbre à la reprise, jamais vérifié : `toast.tsx` (sombre en bas,
`--toast-bas` dans `globals.css`), `DataTable`, `WarningBanner` (prop `titre`), `ChoiceCard`,
`DebouncedSearchInput` (bouton « effacer », clé `console.search.clear`) sous `portee-app:` ;
primitives neuves `ui/panneau-droit.tsx` et `ui/radio-group.tsx` ; jetons `w-panneau` (30rem) et
`w-toast` (22,5rem). Manquaient : les tests cités par les commentaires, la vitrine, l'entrée
design-sync, la feuille du bas en panneau latéral dès `md` (décision du porteur du 2026-11-11).

### Ce qui est livré (terrain-4, 2026-11-11)

- **Panneau latéral** : une primitive NEUVE, `ui/panneau-droit.tsx` (`PanneauDroit`, le nom de la maquette),
  et non une taille de `SheetContent side="right"` comme l'écrivait le delta — écart assumé : les onze
  appelants de `side="right"` (288 px, voile, modal) restent inchangés, les pages adoptent le panneau
  avec leurs tickets. Dès `xl` : 480 px (`w-panneau`, 30rem fixes), sans voile, NON modal
  (`modal={false}`, `disablePointerDismissal` : un clic dans la page ne le ferme pas), `Échap` ferme
  et rend le focus. Sous `xl` (ADR-0106 § 4) : plein écran, `modal="trap-focus"` + verrou TCK-551.
  ⚠ Les pages qui l'ouvrent dès `xl` doivent réserver sa largeur à droite (le panneau recouvre les
  480 px de droite du contenu, comme dans la maquette) : à leurs tickets.
- **`aria-modal`** (point porteur n° 1) : base-ui 1.7 ne le pose jamais sur `Dialog.Popup`. Posé ici sur
  `PanneauDroit` (en plein écran seulement) et `FeuilleDuBas` (toujours). `Dialog`/`SheetContent` ne
  sont pas touchés : à TCK-2689/TCK-2691 ou à un ticket à part.
- **Feuille du bas dès `md`** (décision du porteur du 2026-11-11) : la géométrie et l'habit de
  `PanneauDroit` (480 px à droite, en-tête `h-14`, corps `p-5`, pied à droite), **en restant modale,
  voile compris** — la décision nomme la place, pas la modalité ; à confirmer au point porteur n° 1.
  Le régime de verrou par le pointeur (TCK-2690) est inchangé.
- **Toast** : sombre en bas partout ; le fond est une surface `.dark` (les tons prennent leur valeur
  sombre, ≥ 3:1) ; le ton se dit par l'icône : la coche du succès à l'encre du toast, comme la maquette
  (`app-demandes` a-3) ; attention, danger et info, que la maquette ne dessine pas, en couleur (≥ 3:1).
  Une coche verte reste une option à proposer au porteur (point n° 1).
  `ActionDuToast` (neuf, exporté de `ui/toast.tsx`) dessine l'action texte « Annuler » ; `Undo2`
  rejoint `components/icons.tsx`. Seul appelant de `data.action` : `PropertyWizard` (bouton contour,
  qui se relit sur la surface `.dark`).
- **Radio** : primitive neuve `ui/radio-group.tsx` (base-ui), aucun appelant ; `ChoiceCard` garde son
  input natif `sr-only` et prend la maquette sous la portée.
- **Vitrine** : une frontière de dictionnaire `playground/vitrine/layout.tsx` sert `console` à la seule
  vitrine (sinon le champ de recherche aurait fait servir `console` à tout le site public) ; la table
  `namespaces.json` ne reçoit que cette entrée (le `--update` relevait aussi d'autres plafonds dérivés
  des clés des autres tickets : non repris). Les déclencheurs des deux feuilles de TCK-2690 étaient des
  boutons VIDES dans la vitrine : libellés ajoutés.

### Prémisses qui diffèrent

- AC6 « à 24 px du bas et de la droite » à 1440 : la référence gelée `app-demandes/a-3-bureau-1440.json`
  rend **21,6 px** (`bottom-6 right-6` sur l'échelle ×0,9), 360 × 43,2, rayon 12,6. Le code suit la référence.
  Au téléphone, la référence : 16 px des bords, 80 px du bas (16 + barre de 64 de la maquette).
- Le delta dit « `Sheet` : taille large » : livré en primitive à part (ci-dessus).
- Radio « 20 px » : `size-5`, donc 18 px dès `lg` comme la maquette le rend à 1440 (ses classes Tailwind
  suivent l'échelle) ; la case à cocher de TCK-2690 reste 18 px fixes.
- `DataTable` : la `className` d'une colonne s'applique aussi à son `<th>` ; sous la portée, la graisse
  de l'en-tête (`portee-app:font-medium`) l'emporte sur un `font-semibold` de colonne (5 appelants) —
  voulu : l'en-tête suit la maquette.
- `sitemap-couverture.test.ts` rougit en LOCAL (24 pages au lieu de 23) : la page des maquettes, non
  suivie par git. Vert sur un arbre sans maquettes.

### Pour TCK-2689 / TCK-2691 (points du porteur n° 1 non touchés ici)

Texte des boutons à 12,6 px dans 44 px au pointeur grossier en `lg` ; 4 composants qui appellent
`buttonVariants` sans `cn()` ; avatar « soi » ; `ProfileHeader` ; `aria-modal` de `Dialog`/`SheetContent` ;
`DocumentShareDialog` en 11 px ; l'enregistrement des couleurs dans `cn` sans test. Une barre d'action
collante (TCK-2689) doit relever `--toast-bas`.

### Tests (TCK-2688)

`src/components/ui/__tests__/primitives-existantes-tck-2688.test.tsx` : 36 tests, 15 ablations faites
une à une (toutes rouges, fichier restauré au md5 près). Deux pièges payés :

- **Changement de régime** : un panneau ouvert à 1024 (plein écran, modal) puis une fenêtre élargie à
  1440 perd `aria-modal`, l'inertie et le verrou — testé par un `matchMedia` contrôlable sous `act`.
- **Focus initial asynchrone** : base-ui pose le focus dans le panneau une image après l'ouverture ;
  un clic à côté fait AVANT voyait le focus repris (test intermittent). Le test attend que le focus
  soit entré, clique, puis vérifie qu'il ne revient pas.

Le toast (z 1200) passe AU-DESSUS de la pastille flottante Filtres/Liste du site public, sans la
contourner : à trancher au point porteur n° 1 si on préfère le lever au-dessus d'elle.

### Mesures au navigateur (2026-11-11, `next dev`, Chrome par le MCP, une passe sous verrou)

| AC | Mesuré | Résultat |
|---|---|---|
| AC1 | vitrine 1440 : panneau 480 × 900 à x = 960, régime `lateral`, sans `aria-modal`, sans voile, bord gauche 1 px sable, ombre `-24px 0 48px -32px`, en-tête 50,4, titre 17 px 600, fermer 32,4, corps 18 px, focus entré, `body` non verrouillé ; 390 : 390 × 844, `plein-ecran`, `aria-modal="true"`, `body` fixé puis rendu, fermer 44 | vert |
| AC1 bis | feuille du bas à 1440 : 480 × 900 à x = 960, rayon 0, bord gauche 1 px, ombre `panneau`, voile, `aria-modal="true"`, en-tête 50,4, poignée masquée ; 390 : feuille du bas d'avant (rayon 18, poignée) | vert |
| AC2 | vitrine 1440 : `th` casse `none`, 500, interlettrage `normal`, 10,8 px, padding 10,8 / 9 ; `thead` muted à 0,4 ; `td` 10,8 / 10,8 ; conteneur bord 1 px, sans anneau | vert |
| AC3 | encre `rgb(31, 24, 18)`, bord 1 px warning à 0,3, `p-4` (14,4 au bureau, 16 au téléphone), titre 15 px 600, icône 18 (bureau) / 20 (téléphone) | vert |
| AC4 | radio 20 × 20 à 390 (18 × 18 à 1440, échelle), bord 1 px `rgb(145, 134, 114)` ; carte active fond `rgb(255, 255, 255)`, anneau 3 px primary/12, titre 15 px 600 ; focus clavier sur la carte active : l'anneau plein `--ring` de 3 px l'emporte (WCAG 2.4.7) | vert (AC4 « 20 px » vaut à 390) |
| AC5 | 390 : 44 px, texte 16 px, loupe 18 px, trait 1,75, à 12 px du bord, texte à 38 px ; 1440 : 32,4 px, loupe 18, trait 1,5, à 10,8 ; croix 16 (14,4 au bureau), appui de 44 | vert |
| AC6 | `/app/leases` (admin d'agence) à 390 : bas de la zone des toasts à y = 772, haut de la barre d'onglets « Accès rapide » à 788 → **16 px** ; à 1440 : 21,6 px du bas et de la droite, 360 px de large ; toast levé sur la vitrine à 1440 : 1058,4 / 835,2 / 360 × 43,2, fond `rgb(31, 24, 18)`, rayon 12,6 — identique à la référence gelée ; `/fr/properties` à 390 : zone à y = 768, barre publique à 784 → 16 px | vert (la position mesurée est celle de la zone, vide sur `/app/leases` : aucun geste de la page n'y lève un toast sans écrire) |
| AC7 | `/super-admin/users` à 1440 : styles calculés du cadre, `thead`, `th`, `td`, ligne relevés avec le `DataTable.tsx` du ticket, puis avec celui de `HEAD` (`git show HEAD:…`, servi par `next dev`, classes `portee-app:` absentes vérifiées), restauré par `cp` (md5 e9c39ce0… identique) : **zéro écart** | vert à 1440 ; 390 non relevé (même mécanique) |
| AC7 onboarding | `/onboarding/intention` et `/onboarding/host` redirigent les comptes de démo fournis (agent, admin) vers `/app` : non relevé au navigateur ; le test « hors portée » de `ChoiceCard` compare les classes au caractère près | non mesuré au navigateur |

Débord horizontal du document : 0 à 390 et à 1440 (vitrine, `/app/leases`).


### Correction après fusion : les deux cliquets de contraste (2026-11-11)

La Web CI était rouge depuis `d7e9cecb7` sur deux cliquets, et ce n'était **pas** dû aux maquettes
non suivies, contrairement à ce que disait la première version du rapport. Je l'ai relevé sur un
arbre `git archive` de `3c6180e8c`, sans maquettes :

- `encre-sans-alpha.contraste.test.ts` : l'action texte du toast portait l'encre principale à
  80 %, une encre translucide. Elle passe à l'encre douce **opaque**, qui vaut #d2cec7 sous le
  `.dark` du toast, soit le même rendu (11,2:1 sur #1f1812). Trois commentaires
  (`ligne-de-liste`, deux dans `tabs`, de TCK-2689) écrivaient l'utilitaire translucide en toutes
  lettres et le cliquet les comptait. Je les ai reformulés, sans changer les classes.
- `surface-publique.contraste.test.ts` : le couple de la puce active survolée (TCK-2689) se
  mesurait encre de repos sur fond de l'état actif, 1,00:1. C'est un couple que l'écran ne rend
  jamais, puisque l'encre active l'emporte. La puce déclare maintenant
  `aria-pressed:hover:text-background`, sans changement de rendu.
- **Le compteur des encres inverses passe de 415 à 430**, avec la justification dans le docblock
  du test. TCK-2688 en apporte 9, TCK-2689 4 et TCK-2691 2. Ce sont toutes des
  `text-muted-foreground` **opaques**, sans fond sur l'élément : sur la carte (5,72:1), la page
  (5,44:1) ou `--muted` (4,85:1), et dans le toast, sur sa racine `.dark` (7,71:1). Déclarer un
  fond pour chacun reviendrait à écrire un fond pour faire plaisir au compteur. C'est la règle
  écrite au 151 → 154 du même test.
