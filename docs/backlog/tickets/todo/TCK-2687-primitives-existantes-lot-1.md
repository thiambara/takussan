---
id: TCK-2687
title: "Fidélité au pixel : primitives existantes, lot 1 — pastille de statut, carte, avatar, onglets soulignés, en-tête de page, chiffre clé, état vide"
status: todo
phase: P1
family: front
estimate: M
wave: 91
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2685]
blocks: [TCK-2580, TCK-2581, TCK-2584, TCK-2586, TCK-2587, TCK-2589, TCK-2590, TCK-2592, TCK-2594, TCK-2596, TCK-2597, TCK-2598, TCK-2600, TCK-2601, TCK-2602, TCK-2603, TCK-2604, TCK-2606, TCK-2608, TCK-2611, TCK-2613, TCK-2614, TCK-2617, TCK-2618, TCK-2619, TCK-2621, TCK-2622, TCK-2624, TCK-2625, TCK-2628, TCK-2629, TCK-2632, TCK-2634, TCK-2635, TCK-2636, TCK-2638, TCK-2639, TCK-2641, TCK-2643, TCK-2644, TCK-2645, TCK-2647, TCK-2648, TCK-2650, TCK-2651, TCK-2653, TCK-2654, TCK-2656, TCK-2659, TCK-2660, TCK-2662, TCK-2664, TCK-2667, TCK-2668, TCK-2670, TCK-2671, TCK-2673, TCK-2675, TCK-2677, TCK-2678, TCK-2682]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, design-system, primitives, audit-ux, app, fidelite]
---

## Objectif utilisateur

Dans `/app`, une pastille de statut, une carte, un avatar, une rangée d'onglets, un titre de page, un chiffre clé ou un état vide se dessinent comme dans la maquette retenue, au téléphone et au bureau, sans que la page les redessine.

## Contrat de données

Aucun changement d'API.

- **Lit** : `src/components/console/StatusBadge.tsx` (sur `ui/badge.tsx`), `ui/card.tsx`, `ui/avatar.tsx`, `ui/tabs.tsx` (`variant="line"`), `console/PageHeader.tsx`, `console/StatCard.tsx`, `feedback/EmptyState.tsx` ; les jetons et la portée `/app` de TCK-2685.
- **Produit** : l'aspect de ces sept primitives sous la portée `/app`, des variantes, deux emplacements neufs dans l'en-tête de page.

## Direction UX / Artistique

> **Principe d'arbitrage (décidé par le porteur le 2026-11-10, [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md))** : la maquette retenue fait foi au pixel, sauf (1) une règle d'accessibilité mesurée, (2) une contrainte technique, (3) une incohérence interne des maquettes, tranchée par la valeur majoritaire. Mesure : téléphone 390 × 844 à `rem` 16, bureau 1440 × 900 à racine 16 et densité ×0,9 ([ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)). Valeurs : [annexe B](../../../qa/audit-ux-2026-11/fidelite/B-composants.md) § 3 et § 6 (n° 4, 5, 7, 8, 19, 20, 21), [annexe C](../../../qa/audit-ux-2026-11/fidelite/C-coque.md) § 2.2 (C3).

**Ses propres exceptions** :

| Valeur de la maquette | Retenu | Motif |
|---|---|---|
| Pastille « info » `bg-accent/15 text-accent` (3,88:1 sur `--muted`) | `bg-info/10 text-info` (produit) | (1) sous 4,5:1 |
| Pastille « succès » `bg-success/15` (4,29:1 sur `--muted`) | l'aplat le plus fort qui tient 4,5:1 sur `--card`, `--background` et `--muted` (aujourd'hui `/10`) | (1) — re-mesurer |
| Pastille « danger » `bg-destructive/12` (4,74:1) | `/12` seulement si `check-destructive-contrast.mjs` l'accepte dans les deux thèmes, sinon `/10` | (1) plafond mesuré de TCK-480 (thème sombre de la console) |
| Pastille « neutre » `text-foreground/75` | encre douce de TCK-2685 (80 %, opaque) | (3) et TCK-658 |
| Petite pastille `h-5 text-[11px]` (1-2 pages) | rabattue sur `h-6` | (3) |
| Avatar : 12 tailles | 28, 32, 36, 40, 44, 48 px (97 % des usages) | (3) |
| Avatar « soi » `bg-accent/15 text-accent` | gardé s'il tient 4,5:1 sur sa surface, sinon le repli par défaut | (1) — à mesurer (≈ 4,5:1 sur blanc, moins sur `--muted`) |
| Carte `rounded-2xl` (5 pages) | `rounded-xl` | (3) |
| Onglet souligné ≈ 32 px de haut au téléphone | rendu de 32 px, **zone tactile de 44 px** par un pseudo-élément | (1) cible tactile |
| Titre de page `tracking-[-0.02em]` | jeton −0,02 em de TCK-2685 | aucune : même valeur, sans crochets |

### Pastille de statut (`StatusBadge`) — 26 pages, 54 tickets ; `chrome-app.tsx:626` (`Statut`)

| Propriété | Maquette | Produit aujourd'hui |
|---|---|---|
| Hauteur | **24 px** (`h-6`, 21,6 au bureau) | 22 au téléphone, 20 au bureau |
| Padding x, texte | `px-2`, `text-xs` 500, `gap-1` | identique |
| Forme | pilule | pilule (identique au rendu) |
| Attention | `bg-warning/20 text-foreground` (11,3:1) | `bg-warning/12 text-warning` |
| **Ton neuf « primaire »** (« Nouvelle », « Aujourd'hui ») | `bg-secondary text-primary-deep` (6,72:1) | absent |
| Succès, danger, info, neutre | voir les exceptions | |

### Carte (`Card`) — 33 pages ; `chrome-app.tsx:695` (`Carte`)

| Propriété | Maquette | Produit aujourd'hui |
|---|---|---|
| Trait | `border border-border` (1 px, #ebe5d5, **dans** la boîte) | `ring-1 ring-foreground/10` (gris froid, hors boîte) |
| Rayon | `rounded-xl` | identique |
| En-tête | emplacement à filet : `px-4 py-3 border-b border-border` | absent |
| Titre | DM Sans **15 px** (jeton) `font-semibold` | Bricolage `text-base font-medium` |
| Action d'en-tête | `text-sm font-medium text-primary` | — |

### Avatar — 22 pages, 43 tickets ; `chrome-app.tsx:721`

Repli : `bg-secondary text-primary-deep font-semibold`, taille de police = 0,36 × taille (10,1 px à 28 ; 17,3 px à 48), au lieu de `bg-muted text-muted-foreground` 400 `text-sm`. Tailles en px (elles ne rétrécissent pas au bureau, comme la maquette qui les pose par `style`).

### Onglets soulignés (`Tabs variant="line"`) — 15 pages, 31 tickets ; `chrome-app.tsx:377`

| Propriété | Maquette | Produit aujourd'hui |
|---|---|---|
| Soulignement actif | **2 px `bg-primary`** à `-bottom-px`, sur le filet de la liste | `bg-foreground` (noir), `bottom-[-5px]`, sans filet |
| Liste | `border-b border-border`, `gap-6`, sans padding x | `gap-1`, `px-1.5`, `flex-1` |
| Déclencheur | `pb-3`, `text-sm` 500 ; actif `text-foreground`, inactif `text-muted-foreground` (4,85:1 sur `--muted`) | inactif `text-foreground/70` |
| Compte | `ml-1.5 text-xs text-muted-foreground` | — |

### En-tête de page (`PageHeader`) — 33 pages au bureau ; `chrome-app.tsx:300-344` (`TeteDePage`)

| Propriété | Téléphone | Bureau | Produit aujourd'hui |
|---|---|---|---|
| H1 | Bricolage **20 px** / 28, **600** | Bricolage `text-2xl` (21,6 px rendu) **600**, −0,02 em | 24 px puis 21,6 px, **700**, −0,025 em |
| Sous-titre | `mt-1 text-sm text-muted-foreground` | idem | identique |
| **Fil d'Ariane** (emplacement neuf) | — | **13 px** `text-muted-foreground`, séparateur « › », `mb-2` | absent |
| **Sous l'en-tête** (emplacement neuf : onglets, filtres) | — | `mt-5` | chaque page pose le sien |
| **Bandeau** (emplacement neuf) | — | `mb-5`, au-dessus du titre | — |
| Actions | — | `gap-2`, boutons de l'échelle `/app` (TCK-2686) | `gap-2`, empilées sous `lg` |

### Chiffre clé (`StatCard`, variante « chiffre ») — 10 pages ; `chrome-app.tsx:714` (`Chiffre`), `?p=app-accueil&a=a`

`rounded-xl border border-border p-4` ; libellé **13 px** `text-muted-foreground` en casse normale (au lieu de `text-xs uppercase tracking-[0.12em]`) ; valeur `font-display text-2xl font-semibold tabular-nums`, −0,02 em ; contexte `mt-1 text-xs`.

### État vide (`EmptyState`, variante « nue ») — 6 pages ; `chrome-app.tsx:666`

Sans carte ni pointillé, `px-6 py-12` ; disque **48 px** (`size-12`) `bg-muted text-muted-foreground` (au lieu de ≈ 56 px `text-accent`) ; titre DM Sans `text-base font-semibold` ; texte `text-sm max-w-xs` ; action `mt-5`.

## Contraintes strictes (métier)

**Pas de régression.** Le changement vaut **sous la portée `/app`** ; ailleurs (site public, `/super-admin`) le rendu est identique — par une variante ou par la portée, au choix de l'implémenteur. Appelants à préserver (relevé du 2026-11-10, hors tests et maquettes) :

| Primitive | Fichiers appelants | dont `(dashboard)` | Hors de `/app` à surveiller |
|---|---|---|---|
| `StatusBadge` | 79 | 5 (+ 43 sous `components/admin`) | 4 sous `/super-admin` |
| `Card` | 18 | 0 | `billing`, `reporting`, `kyc`, 2 sous `/super-admin` |
| `Avatar` | 10 | 0 | `navigation-publique` (2), `public` (1), 2 sous `/super-admin` |
| `Tabs` | 17 (dont 3 en `line`) | 2 | `public` (1) |
| `PageHeader` | 103 | 54 | 35 sous `/super-admin` |
| `StatCard` | 15 | 6 | 1 sous `/super-admin` |
| `EmptyState` | 111 | 15 | 10 sous `/super-admin`, `favorites` (public) |

- `check-status-badge-unique.mjs`, `check-feedback-states.mjs`, `check-destructive-contrast.mjs` et `encre-sans-alpha.contraste.test.ts` restent verts sans exception nouvelle.
- Le H1 unique (TCK-2617) et le `<title>` des pages ne changent pas ; le titre de `PageHeader` garde son retour à la ligne (`text-balance`) tant que les références gelées ne montrent pas une troncature au bureau.
- Les onglets gardent leur navigation au clavier et leur `aria-selected`.
- Libellés neufs (séparateur du fil d'Ariane s'il est lu, nom de la zone du fil) en `fr`/`en`/`wo` (`wo` = le texte français tel quel), vouvoiement ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md)).

## Delta à produire

- [ ] `StatusBadge` : hauteur 24, ton « primaire », tons re-mesurés selon les exceptions (test de contraste par ton et par surface).
- [ ] `Card` : trait en bordure sable, emplacement d'en-tête à filet, titre et action.
- [ ] `Avatar` : six tailles, repli `secondary` / `primary-deep` proportionnel, ton « soi » selon la mesure.
- [ ] `Tabs` souligné : soulignement terracotta sur le filet, espacements, compte, zone tactile de 44 px.
- [ ] `PageHeader` : graisse, tailles, fil d'Ariane, emplacements « sous l'en-tête » et « bandeau ».
- [ ] `StatCard` variante « chiffre » ; `EmptyState` variante « nue ».
- [ ] La vitrine (TCK-2685) rend chaque primitive, chaque ton, chaque taille et chaque variante.
- [ ] `docs/design-guidelines.md` : les règles changées (graisse des titres de page 600, aplats et ton « primaire » des pastilles, trait des cartes).

## Critères d'acceptation

- [ ] AC1 — Sur la vitrine à 390 : pastille de 24 px de haut ; chaque ton rend son couple fond/encre et tient ≥ 4,5:1 sur `--card`, `--background` et `--muted` (test) ; le ton « info » rend l'encre `--info`, pas `--accent`.
- [ ] AC2 — Carte de la vitrine : `border-top-width` 1 px, `border-color` `rgb(235, 229, 213)`, aucune `box-shadow` d'anneau ; titre d'en-tête 15 px, 600, DM Sans, aux deux largeurs.
- [ ] AC3 — Avatars de la vitrine : 28 à 48 px aux deux largeurs ; la taille de police du repli vaut 0,36 × la taille (±0,1 px) ; le repli rend l'encre calculée de `--primary-deep` sur le fond calculé de `--secondary`, en graisse 600.
- [ ] AC4 — Onglets soulignés de la vitrine : le trait actif est `--primary`, haut de 2 px, son bas aligné sur le bas du filet de la liste (±0,5 px) ; la zone cliquable d'un onglet mesure ≥ 44 px de haut à 390 alors que sa boîte visible en mesure ≈ 32.
- [ ] AC5 — Sur `/app/leases` à 1440, le H1 rend Bricolage 21,6 px, graisse 600, `letter-spacing` −0,432 px ; à 390 (s'il est rendu), 20 px, 600.
- [ ] AC6 — Sur `/super-admin` (une page à `PageHeader`) et `/fr/favorites` sans favori (`EmptyState` du site public), relevé avant/après : zéro écart.
- [ ] AC7 — `StatCard` « chiffre » et `EmptyState` « nue » de la vitrine, comparés par l'outil de TCK-2684 à `Chiffre` et à l'état vide d'une référence gelée (`?p=app-accueil&a=a` et une page à état vide) : aucun écart au-delà des tolérances sur la boîte et son contenu.

## Hors périmètre

- Les pages (vagues 86 à 90) : remplacer les `border border-border` et `ring-1 ring-border` écrits à la main (80 et 42 fichiers), les pastilles locales.
- La marge de la zone de contenu et l'en-tête du téléphone (TCK-2691, TCK-2617).
- L'avatar du compte dans la colonne et le tiroir (TCK-2691, C7).
- Le contrôle segmenté (TCK-2689), qui n'est pas la variante soulignée.

## Notes d'implémentation

Implémenté le 2026-11-11 (terrain-3). Mesures au navigateur sur la vitrine (`/fr/playground/vitrine`, Chrome, 390 × 844
et 1440 × 900, pointeur fin), relevés sous `…/scratchpad/impl/terrain-3/t2687/`.

**Mécanique, par primitive.** Une variante `portee-app:` quand aucun appelant ne règle la propriété (pastille, trait et
titre de carte, onglet souligné, H1) : la classe reste littérale, lisible par les gardes et le test de contraste ; un
**jeton** pour le repli de l'avatar, que `MenuDuCompte`, `UserMenu` et `ProfileHeader` repeignent (bloc
`primitives-de-l-app` de `globals.css`, connu de `cn` par `PRIMITIVES_DE_L_APP`) ; un **prop** pour le neuf
(`CardHeader filet`, `Avatar size="28"…"48"`, `TabsCount`, `PageHeader fil/bandeau/dessous`, `StatCard variant="chiffre"`,
`EmptyState variant="nue"`, ton `primary`). Sans emplacement neuf, `PageHeader` rend le DOM d'avant (l'en-tête est la racine).

**Exceptions tranchées par la mesure** (harnais `contraste-wcag.ts`, sept surfaces, deux thèmes) :
- `success` → `/11` sous la portée : pire cas 4,54:1 (`--muted` plein, clair) ; `/12` rend 4,49:1.
- `danger` reste `/10` : `/12` rend 4,37:1 sur `--muted` sombre, et le plafond `APLAT_MAX = 10` de
  `check-destructive-contrast.mjs` le refuse.
- `attention` : `warning/20` + encre principale, 11,31:1 (clair) et 8,47:1 (sombre) au pire.
- Avatar « soi » (`accent/15 text-accent`) **non repris** : 4,51:1 sur `--card` mais 4,31 sur `--background`, 3,88 sur
  `--muted`, 3,68 sur `--card` sombre ; et `bg-accent/<n>` est refusé par `check-valeurs-arbitraires-app` (aplat-accent).

**AC1** — 390 : 24 px pour les six tons sur `--card`, `--background`, `--muted` (21,6 à 1440) ; couples rendus = table
de `StatusBadge.portee-app-tck-2687.test.tsx` ; `info` à l'encre `rgb(63, 90, 107)` (`--info`).
**AC2** — carte : bord 1 px `rgb(235, 229, 213)` aux quatre côtés ; `box-shadow` réduit à des anneaux de 0 px (aucun
visible) ; titre 15 px, 600, DM Sans aux deux largeurs ; en-tête à filet `12px 16px` (390), `10.8px 14.4px` (1440).
**AC3** — avatars 28/32/36/40/44/48 px aux deux largeurs ; police 10,08 / 11,52 / 12,96 / 14,4 / 15,84 / 17,28 px
(0,36 × la taille exacte) ; repli `rgb(130, 60, 32)` sur `rgb(243, 234, 216)`, 600 — re-mesuré après le passage de la
graisse par la variante `portee-app:font-semibold` (le jeton de graisse est retiré) : zéro écart.
**AC4** — 390 : trait `rgb(168, 83, 50)`, 2 px, bas du trait 314 = bas du filet de la liste 314 ; onglet visible 32 px,
`::before` de 44 px ; `elementFromPoint` à ±17 et ±21 px du centre tombe sur l'onglet. (À 1440, pointeur fin : trait
1,8 px — `h-0.5` sur l'échelle ×0,9, comme la maquette — et cible de 32,4 px, `h-controle` du bureau.) Survol forcé
(CDP) d'un onglet inactif : `rgb(110, 101, 90)` → `rgb(31, 24, 18)`. Sans `not-data-active:hover:text-foreground` sous la
portée, la couleur inactive de portée battait le `hover:` nu et le survol ne changeait rien (ablation au navigateur).
**AC5** — `/app/leases`, avant → après : 1440 H1 Bricolage 21,6 px, 700 → **600**, −0,54 → **−0,432 px** ; 390
24 px / 32 / 700 → **20 px / 28 / 600**, −0,4 px. Aucune autre propriété ne change sur la page (décalages verticaux seuls).
**AC6** — relevé avant/après de tous les éléments de `main` : `/fr/favorites` anonyme et client (390, 1440 :
`EmptyState` public, onglets `default`, avatar de l'en-tête public), `/fr/bookings` (état vide), `/fr/agents/yacine-f` :
**zéro écart**. `/super-admin` **non mesuré au navigateur** : le compte de démo y est renvoyé vers
`/onboarding/securite` (double authentification). Preuve de structure à la place
(`src/components/__tests__/primitives-de-l-app.test.tsx`) : hors portée, chaque primitive rend les classes d'avant au
caractère près, et chaque classe `portee-app:` compilée n'émet de règle que sous `:root:has([data-portee-app])`. Au navigateur, par
injection : le repli d'avatar hors portée rend `rgb(241, 236, 224)` / `rgb(110, 101, 90)` (`--muted` /
`--muted-foreground`, comme avant), `rgb(58, 46, 35)` / `rgb(184, 170, 151)` sous un `.dark` imbriqué.
**AC7** — comparaison des styles calculés de la vitrine à la référence gelée (pas par `fidelite.mjs compare`, qui
compare des pages entières) : `Chiffre` de `app-notifications/a-0-bureau-1440` (le vrai `Chiffre` de `chrome-app` ;
celui d'`app-accueil` est une tuile locale à 22 px) — boîte 100,6 px de haut, padding 14,4, rayon 12,6, bord
`rgb(235, 229, 213)` ; libellé à +15,4 (réf. 15,3), valeur à +38,5 (38,4), contexte à +70,8 (70,8) ; 13 / 21,6 / 10,8 px,
graisses et couleurs identiques. `EtatVide` d'`app-notifications/a-2` (même appel, `py-16`) : 390 disque 48 à +64, titre
à +128, texte à +156 (réf. 64 / 128 / 156), largeurs de texte 122,4 et 276,4 (identiques) ; 1440 disque 43,2 à +57,6,
titre à +115,2, texte à +140,4 (identiques).

**Compteur relevé** : `surface-publique.contraste.test.ts`, `ENCRES_INVERSES` 401 → 411 (la vitrine importe désormais
`PageHeader`, `StatCard`, `Card`, `Tabs` et la variante `nue` : onze `text-muted-foreground` opaques, détail dans le
docblock).
