---
id: TCK-2485
title: Messagerie flottante — son panneau ne passe plus au-dessus d'un dialogue modal
status: done
phase: P3
family: bug
estimate: S
wave: 82
created: 2026-11-06
updated: 2026-11-06
depends_on: [TCK-2482]
blocks: []
spec_refs:
  features:
    - "docs/features.md#17-communication--messagerie"
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, messagerie, empilement, z-index, dialogue]
---

## Objectif utilisateur

Quand un dialogue s'ouvre (palette ⌘K, confirmation, galerie…) alors que la messagerie flottante
est ouverte, l'utilisateur voit le dialogue en entier : rien ne se pose dessus.

## Contrat de données

Aucun.

## Direction UX / Artistique

Un dialogue modal est la couche du dessus de la page, sous les seuls menus, infobulles et avis
(`z-[1100]`, `z-[1200]`). Le panneau de la messagerie reste au-dessus de ce qui flotte sur la page
(pastille du comparateur, barres flottantes, cartes Leaflet), comme aujourd'hui.

## Contraintes strictes (métier)

- Relevé de départ (TCK-2482, constat M4, `rapport-2482-mesure.md`) : panneau ouvert, `z-[1000]` ;
  à 1024 px il recouvre **121,6 × 274 px** de la palette (z-50), `elementFromPoint` au centre du
  recouvrement = le panneau. Défaut ancien de tout `Dialog`, rendu atteignable par ⌘K.
- **Décision de la session** : relever d'abord POURQUOI `z-[1000]` (le commentaire cite Leaflet) et
  quelles cartes l'exigent. Préférence : le panneau passe SOUS les dialogues (z inférieur à 50) et
  reste au-dessus des cartes en isolant leurs conteneurs (`isolate`), si la mesure le permet sans
  régression ; à défaut, le panneau se ferme à l'ouverture d'un dialogue modal. Le choix et sa
  preuve s'écrivent dans les notes.
- Un brouillon de message non envoyé ne doit pas se perdre du seul fait qu'un dialogue s'ouvre
  (TCK-500 ne le perd qu'à la fermeture volontaire du panneau).

## Delta à produire

- [x] Relevé : l'origine de `z-[1000]`, les calques de la page qui dépassent `z-40` et leur contexte
      d'empilement (cartes Leaflet comprises), écrit dans les notes.
- [x] Le panneau ouvert se range sous les dialogues modaux (ou, à défaut mesuré, se ferme à leur
      ouverture), et reste au-dessus de ce qu'il couvrait sur la page.
- [x] Test qui rougit sur l'ancien ordre (`z-[1000]`).
- [x] Mesure au navigateur (CDP direct) : panneau ouvert puis ⌘K à 1024 ; une page à carte ; la
      barre publique fixe à hauteur de portable.

## Critères d'acceptation

- [x] AC1 — Panneau ouvert, ⌘K à 1024 px : `elementFromPoint` sur l'ancienne zone de recouvrement
      rend la palette, plus le panneau (mesuré au navigateur).
- [x] AC2 — Le panneau ouvert reste au-dessus de ce qu'il couvrait sur la page : pastille du
      comparateur, barres flottantes, carte Leaflet (relevé + test).
- [x] AC3 — Un test rougit sur l'ancien ordre (ablation écrite dans les notes).
- [x] AC4 — Gardes du dépôt et du front vertes.
- [ ] AC5 — Suites entières vertes (par la CI).

## Hors périmètre

- Le lanceur fermé (`z-40`) : inchangé.
- Le bouton flottant mobile (lien vers `/app/messages`, pas de panneau).
- La garde « autre dialogue » de la palette (ne pas s'ouvrir panneau ouvert) : le panneau n'est
  pas modal, la palette peut s'ouvrir par-dessus.

## Notes d'implémentation

Commit `487db78b5` (2026-11-06, agent `suites-front`, branche `fix/suites-coque-dynamique`).

### Le relevé : pourquoi `z-[1000]`, et ce qui l'exigeait encore

- Posé le 2026-05-16 (`38f5594a4`, TCK-275) : « au-dessus de la pastille du comparateur (z-40) et des
  calques de Leaflet, qui montent à z-700 sur le sélecteur d'emplacement de la publication ».
- **Les deux raisons Leaflet sont tombées depuis** : `.leaflet-container { isolation: isolate }`
  (`globals.css`, `6a28a4667`, 2026-10-05, gardé par `carte-isolee.test.ts`) enferme calques et
  contrôles dans chaque carte, et le parcours de publication est plein écran, sans widget (TCK-631).
- Calques de la page au-dessus de `z-40` : dialogues, feuilles, galerie (`z-50`, portés au bout de
  `<body>` par Base UI) ; **la barre publique fixe (`Navbar`, `z-50`, 127 px de haut à 1366)** ;
  l'alerte du pipeline et le filtre mobile (`z-50`, dans la page) ; la barre de chargement
  (`z-[60]`, 3 px en haut) ; la **pastille du compte de `PropertyMap` (`z-[400]`)**, posée À CÔTÉ du
  conteneur Leaflet, dans une enveloppe `relative` qui n'isolait rien ; popovers, menus (1100) et avis
  (1200), au-dessus du panneau avant comme après.

### La décision, et sa preuve

La préférence de la session (panneau **sous** 50) **régresse** : la barre publique fixe couvre alors
la croix du panneau à hauteur de portable. Mesuré au navigateur (variante `z-45`, mutation servie
par `next dev`) : à 1366 × 657 sur `/fr` et `/fr/properties`, recouvrement 360 × 75,1 px et
`elementFromPoint` au centre de la croix = la barre ; à 1280 × 600, 360 × 111,3 px, croix sous la
barre ; à 1366 × 768, aucun recouvrement. La solution de repli (fermer le panneau à l'ouverture d'un
dialogue) n'est pas nécessaire, et elle aurait perdu un brouillon en cours.

**Retenu : le panneau ouvert vaut `z-50`, le z des dialogues et de la barre, et l'égalité se tranche
par l'ordre du document** : un dialogue Base UI est porté au bout de `<body>` à son ouverture (il
passe dessus) ; le widget est rendu APRÈS `{children}` dans le layout racine (il passe sur la barre,
qui vit dans `{children}`). L'enveloppe de `PropertyMap` reçoit `isolate`.

Pourquoi pas une variante CSS « sous 50 quand un dialogue est ouvert » : rien ne distingue un dialogue
MODAL dans le DOM de Base UI 1.7 (mesuré) — aucun `aria-modal`, `data-base-ui-inert` est posé sur le
widget par TOUT popup à gestion de focus (menus compris, `FloatingFocusManager` → `markOthers`), et
le verrou de défilement (`body { overflow: hidden }`) est aussi posé par le menu « Langue ».

### Relevés au navigateur (2026-11-06, 13:14-13:40, charge 3,5 à 6,7 sur 8 cœurs)

Chrome headless, CDP direct, compte admin-agence 2, jeton et `welcome_views` posés pour le banc et
supprimés à la fin (empreinte max(id) revenue à l'identique).

| Cas | avant (`z-[1000]`) | après (`z-50` + ordre + `isolate`) |
|---|---|---|
| `/app` 1024 × 900, panneau ouvert puis ⌘K | recouvrement 121,6 × 274 px, dessus = **panneau** | même recouvrement, dessus = **palette** ; le panneau est sous le voile |
| `/app` 1366 × 900 | aucun recouvrement | aucun |
| Échap après la palette | panneau toujours ouvert | panneau toujours ouvert (rien n'est perdu) |
| barre publique, 1366 × 657 (`/fr`, `/fr/properties`) | 360 × 75,1 px, dessus = panneau, croix libre | idem |
| barre publique, 1280 × 600 | 360 × 111,3 px, dessus = panneau, croix libre | idem |
| carte `/fr/properties` 1366 × 657 : pastille du compte | 130,3 × 25,2 px, dessus = panneau (première sonde, non probante pour la pastille — cf. le piège ; 1000 > 400 de toute façon) | idem ; **sans `isolate` : dessus = la pastille** |
| carte : conteneur, marqueur, attribution Leaflet | dessus = panneau | idem |
| comparateur (1366 et 1024 × 768) | 280,8 × 160,3 px, dessus = panneau | idem |
| premier arrêt de Tab (`/fr`, `/app`) | **le lanceur** de la messagerie (rang 0) | le lien d'évitement ; le lanceur en fin de page |

⚠ **Piège de la sonde, payé ici** : `elementFromPoint` ignore un élément `pointer-events: none` — la
pastille de la carte l'est. La première sonde rendait « panneau dessus » même sans `isolate` ; elle
rend la pastille touchable le temps de la lecture, et c'est cette version qui a mesuré la ligne
« carte » ci-dessus (ablation rejouée).

**Effet de bord mesuré** : le lanceur, rendu avant `{children}`, était le **premier arrêt de Tab** de
toute page pour un utilisateur connecté au bureau — avant le lien d'évitement que TCK-905 veut
premier. Il passe en fin d'ordre du clavier.

### Tests et ablations

- `ChatWidget.test.tsx` (« TCK-2485 ») : ouvert, le panneau ne dépasse pas le z du voile ni de la
  fenêtre d'un `Dialog` du design system rendu à côté, et le dialogue le suit dans le document ;
  ouvert, il dépasse le z du lanceur fermé (40) ; ouvert, il vaut le z de la barre publique fixe
  (lu dans `Navbar.tsx`), et `<ChatWidget />` suit `{children}` dans `src/app/layout.tsx`.
- `carte-isolee.test.ts` : l'enveloppe de `PropertyMap` porte `isolate` autour de la pastille `z-[400]`.
- Ablations des tests (script, restauration vérifiée par `cmp`) : a) `CorpsDuWidget` de HEAD →
  2 rouges (1000 > 50, 1000 ≠ 50) ; b) `z-45` → 1 rouge (45 ≠ 50 : la préférence « sous 50 » est
  attrapée) ; c) layout de HEAD → 1 rouge (ordre) ; d) `PropertyMap` sans `isolate` → 1 rouge ;
  e) témoin → 25 verts.
- Ablations au navigateur (mêmes mutations servies par `next dev`) : V1 HEAD (ordre du clavier
  « avant »), V2 `z-45` (barre sur la croix), V3 layout de HEAD (barre sur la croix), V4 sans
  `isolate` (pastille sur le panneau) ; restaurées, `cmp` identique.
- Gardes : `tsc` 0, `lint` 0, `check:*` ✓, `chemin-api.garde` ✓, `scripts/check-*.mjs` tous verts ;
  fichiers voisins (`chat-widget`, `map`, `app/__tests__`, `floating-dock`, palette) : 305 verts.
- AC5 (suites entières) : par la CI.

### Écarts au ticket

- La décision s'écarte de la préférence « z inférieur à 50 » : `z = 50` + ordre du document (preuve
  ci-dessus). La solution de repli « fermer le panneau » n'a pas été écrite.
- Hors périmètre, relevé : l'alerte du pipeline et le filtre mobile (`z-50`, dans la page) restent
  sous le panneau ouvert, comme avant.
