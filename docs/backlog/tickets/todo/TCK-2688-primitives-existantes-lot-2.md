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

_(à remplir par implementing-specs)_
