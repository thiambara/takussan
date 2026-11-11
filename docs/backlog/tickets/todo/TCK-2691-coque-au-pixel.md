---
id: TCK-2691
title: "Fidélité au pixel : la coque de /app aux cotes de la maquette — marges, barre d'onglets de 64 px, icônes, colonne, compte, et l'enveloppe bord à bord au téléphone"
status: todo
phase: P1
family: front
estimate: M
wave: 91
created: 2026-11-10
updated: 2026-11-10
depends_on: [TCK-2685, TCK-2686, TCK-2690]
blocks: [TCK-2617, TCK-2618, TCK-2619, TCK-2580, TCK-2581, TCK-2584, TCK-2586, TCK-2587, TCK-2589, TCK-2590, TCK-2592, TCK-2594, TCK-2596, TCK-2597, TCK-2598, TCK-2600, TCK-2601, TCK-2602, TCK-2603, TCK-2604, TCK-2606, TCK-2608, TCK-2611, TCK-2613, TCK-2614, TCK-2621, TCK-2622, TCK-2624, TCK-2625, TCK-2628, TCK-2629, TCK-2632, TCK-2634, TCK-2635, TCK-2636, TCK-2638, TCK-2639, TCK-2641, TCK-2643, TCK-2644, TCK-2645, TCK-2647, TCK-2648, TCK-2650, TCK-2651, TCK-2653, TCK-2654, TCK-2656, TCK-2659, TCK-2660, TCK-2662, TCK-2664, TCK-2667, TCK-2668, TCK-2670, TCK-2671, TCK-2673, TCK-2675, TCK-2677, TCK-2678, TCK-2682]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, coque, navigation, audit-ux, app, fidelite]
---

## Objectif utilisateur

Ce qui entoure chaque page de `/app` — la colonne, la barre d'onglets, l'en-tête du téléphone, les marges du contenu, le compte — a les cotes, les teintes et les épaisseurs de la maquette retenue, de sorte qu'aucune page refaite ne paraisse posée dans un cadre qui n'est pas le sien.

## Contrat de données

Aucun changement d'API.

- **Lit** : `src/components/layout/AppShell.tsx` (enveloppe `px-4 py-6 md:px-6 md:py-8`, l. 245), `AppSidebar.tsx`, `styles-de-la-barre.ts`, `BarreDOnglets.tsx`, `EnTeteMobile.tsx`, `MenuDuCompte.tsx`, la variable `--barre-onglets-hauteur` (`globals.css:311`) et la règle du dock qui la lit (`globals.css:331`) ; les jetons et la portée `/app` de TCK-2685, l'échelle de TCK-2686, l'avatar « soi » de TCK-2687.
- **Produit** : les cotes de la coque ; une mise en page « pleine largeur » au téléphone, que les pages refaites adoptent.

## Direction UX / Artistique

> **Principe d'arbitrage (décidé par le porteur le 2026-11-10, [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md))** : la maquette retenue fait foi au pixel, sauf (1) une règle d'accessibilité mesurée, (2) une contrainte technique, (3) une incohérence interne des maquettes, tranchée par la valeur majoritaire. Mesure : téléphone 390 × 844 à `rem` 16, bureau 1440 × 900 à racine 16 et densité ×0,9 ([ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)). Valeurs : [annexe C](../../../qa/audit-ux-2026-11/fidelite/C-coque.md) § 2 et § 5.2 (C1 à C8, C10, C12). Maquette : `?p=app-coque&a=a`, écrans « Accueil (admin) », « Page racine (Demandes) », « Page de détail », « Persona · bailleur », « Persona · locataire », « Persona · prestataire » ; coque commune `…/maquettes/chrome-app.tsx`.

**Ses propres exceptions** :

| Valeur de la maquette | Retenu | Motif |
|---|---|---|
| Compteur de la colonne `text-primary` (4,10:1 sur le voile actif) | `text-primary-deep` | (1) TCK-2490 |
| Encre des lignes au repos `foreground/85` | l'encre douce opaque de TCK-2685 (80 %), sauf si le texte au repos passe sous 4,5:1 | (3) l'encre douce est une seule valeur, la majoritaire ; (1) le contraste ; et TCK-658 (aucune encre de texte translucide) |
| Avatar du compte `accent/15 text-accent` | gardé s'il tient 4,5:1 sur la colonne (`muted/45`), sinon le repli par défaut de TCK-2687 | (1) — à mesurer |
| Pas de zone sûre en bas | 64 px **+** `env(safe-area-inset-bottom)` | (2) |

### Téléphone (390 × 844, `rem` 16)

| # | Élément | Maquette | Produit aujourd'hui |
|---|---|---|---|
| C1 | **Enveloppe du contenu** | aucune : chaque page porte sa marge (`px-4` sur 139 écrans sur 204) ; **bord à bord** sur 62 des 172 écrans dans la coque (filets, puces collantes, rangées) | `px-4 py-6` imposé à toute page |
| C4 | Barre d'onglets : hauteur | **64 px** (`h-16`) | 56 (`3.5rem`) + zone sûre |
| C4 | interligne icône/libellé | `gap-1` (4 px) | `gap-0.5` (2 px) |
| C4 | icône | 20 px, trait **1,75** | 20 px, trait 2 |
| C4 | libellé | 11 px, interligne **16,5 px** | 11 px, 13,75 px (`leading-tight`) |
| C4 | trait de l'onglet actif | 2 px `primary`, `inset-x-4`, arrondi plein | 2 px, arrondi en bas seulement |
| C5 | Icônes de l'en-tête (cloche, « Aller à ») | **20 px**, trait 1,75, encre douce (80 %), cible 40 | 18 px, trait 1,75, `muted-foreground` |
| C5 | Marges de l'en-tête | `pl-4 pr-1.5` | `pl-4 pr-2` |
| C6 | Icônes du tiroir au repos | `text-muted-foreground` ; actives `primary` | `foreground` |
| C7 | Pied du tiroir | 64 px, avatar de 36 « soi » | 65 px, avatar `foreground` |
| C8 | Lignes du tiroir | texte **15 px** (jeton), icônes **20 px**, trait **1,5** | 14 px, 18 px, trait 1,75 |

### Bureau (1440 × 900, racine 16, densité ×0,9)

| # | Élément | Maquette | Produit aujourd'hui |
|---|---|---|---|
| C2 | Marge latérale du contenu | **`px-8` = 28,8 px** (162 des 170 écrans) → largeur utile **1110** | `md:px-6` = 21,6 → 1125 |
| C2 | Marge haute | `pt-8` = 28,8 | identique |
| C6 | Icônes de la colonne au repos | `text-muted-foreground` ; actives `primary` | `foreground` |
| C7 | Avatar du pied | 28,8 px, « soi » | 28,8 px, `bg-foreground text-background` |
| C7 | Nom dans le pied | `text-sm` **600** | 500 |
| C8 | Texte d'une ligne | **`text-sm` (12,6 px)** | `text-[14px]` (14 px) |
| C8 | Titre de groupe | **`text-xs` (10,8 px) 400**, 18 px de haut | 12,5 px 500, 25,2 px de haut |
| C8 | Marge et interligne d'une ligne | `px-2` (7,2) et `gap-2.5` (9) | `px-2.5` (9) et `gap-3` (10,8) |
| C8 | Compteur | `text-xs font-semibold` | `text-[12.5px] font-medium` |
| C8 | Action principale | texte 12,6 px 600 | 14 px 400 (libellé 500) |
| C9 | Encre des lignes au repos | `foreground/85` → encre douce (voir les exceptions) | `foreground` plein |
| C9 | Trait des icônes de la colonne | **1,5** (`TRAIT_D_ICONE` passe de 1,75 à 1,5 — TCK-2490 amendé, décidé par le porteur le 2026-11-10) | 1,75 |
| C12 | Filet droit de la colonne | `border-border` plein | `border/70` |
| C12 | Tête de la colonne | `px-4`, logo à 14,4 px du bord | `px-3` + lien `px-1.5`, logo à 16,2 px |

**C8 — décidé par le porteur le 2026-11-10** ([ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md), amende TCK-2490) : la colonne suit la maquette au bureau (`text-sm` rendu 12,6 px, `text-xs` rendu 10,8 px), le tiroir garde 15 px et des icônes de 20 px ; le trait de la colonne et du tiroir est celui de la maquette, 1,5.

**C10** — la feuille du bas est la primitive de TCK-2690 ; la coque n'en porte aucune aujourd'hui. Celles qu'elle gagnera (feuille du compte et des espaces, actions « ⋯ ») naissent dans TCK-2617, sur cette primitive (note datée dans TCK-2617).

**C3** (en-tête de page : graisse, fil d'Ariane, emplacements) est dans TCK-2687, qui porte `PageHeader`.

## Contraintes strictes (métier)

**Pas de régression.** Ce qui existe et doit rester :

- **Les pages existantes de `/app`** ne changent pas au téléphone : la mise en page pleine largeur (C1) est une **adoption page par page** ; une page qui ne l'adopte pas garde `px-4 py-6`. Au bureau, C2 vaut pour toutes (tout le contenu glisse de 7,2 px : voulu).
- **La règle du dock flottant** et `MessagesPage.tsx` lisent `--barre-onglets-hauteur` : elles suivent la nouvelle hauteur ; rien ne passe sous la barre (TCK-503).
- **`/super-admin`** (`SuperAdminShell`, `SuperAdminSidebar`, `SuperAdminTopbar`) et **la barre d'onglets publique** (`BarreDOngletsPublique`) ne changent pas.
- **Ce que TCK-2617, TCK-2618 et TCK-2619 portent** reste à eux : la structure de l'en-tête du téléphone (titre, flèche, quatre formes), les onglets et entrées par persona, la couleur de l'icône active (TCK-2618 AC4), les lignes de 44 px du tiroir et ses punaises (TCK-2619). Ce ticket ne fixe que des **cotes**, qu'ils héritent.
- **Le lien d'évitement**, la région `aria-live` des non-lus, les bandeaux de la coque, les zones sûres, le mode « icônes » de la colonne (rail de 60 px entre 768 et 1023), la route plein écran `/app/properties/new` : inchangés.
- **Contrastes** : icônes de la colonne et du tiroir au repos ≥ 3:1 sur leur fond (test `AppSidebar.contraste`) ; textes ≥ 4,5:1.
- **Pour comparer la persona locataire**, il faut un compte dont le profil actif est locataire : le compte de démo `locataire` est résolu en persona **client** (C § 2.3).
- Libellés : aucun neuf. Sinon `fr`/`en`/`wo` (`wo` = le texte français tel quel), vouvoiement ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md)).

## Delta à produire

- [ ] C1 — La mise en page pleine largeur au téléphone, adoptée par une page ; une garde qui rougit si une page qui l'adopte empile une seconde marge `px-4` sur la première.
- [ ] C2 — La marge du contenu à 28,8 px dès `lg`, 24 px entre `md` et `lg`.
- [ ] C4 — La barre d'onglets à 64 px + zone sûre (`--barre-onglets-hauteur`), son interligne, son trait, son libellé, son trait actif.
- [ ] C5 — Les icônes et marges de l'en-tête du téléphone.
- [ ] C6 — L'encre des icônes au repos, colonne et tiroir.
- [ ] C7 — L'avatar et le nom du compte, colonne et tiroir.
- [ ] C8 et C9 — Textes, titres de groupe, marges, compteur et action principale de la colonne ; texte et icônes du tiroir ; encre au repos ; `TRAIT_D_ICONE` à 1,5 (`styles-de-la-barre.ts`).
- [ ] C12 — Filet et tête de la colonne.
- [ ] `docs/design-guidelines.md` : les cotes de la coque ; `takussan-web/CLAUDE.md` § Responsive corrigé : la colonne de `/app` mesure **272 px** depuis TCK-2490 (rail de 60 px entre 768 et 1023), pas 256 ; la largeur utile à 768 est **660 px** (768 − 60 − 48), 709 à 1024 (C § 3.1) ; la barre de `/super-admin` (`w-64`) est à re-mesurer avant d'être citée.
- [ ] **Le rail d'icônes de 60 px entre 768 et 1023 px est confirmé** (décision du porteur, 2026-11-10, « b ») : il existe depuis TCK-2480 (variante `icones`, `PLAGE_ICONES_AUTO`) et ce ticket ne le retire pas ; les maquettes bureau le montrent sous `lg` (coque des maquettes alignée le 2026-11-10).
- [ ] Tests de rendu des cotes ci-dessous.

## Critères d'acceptation

- [ ] AC1 — `/app/leases` à 390 : barre d'onglets de 64 px de haut hors zone sûre (zone sûre émulée : 64 + inset), `gap` 4 px, icônes à `stroke-width` 1,75, libellés à `line-height` 16,5 px ; le dernier élément du contenu reste entièrement visible au-dessus de la barre (défilé en bas).
- [ ] AC2 — `/app/leases` à 1440 : `padding-left` de la zone de contenu 28,8 px, largeur utile 1110 px (±1) ; à 900, 24 px.
- [ ] AC3 — À 390, la cloche et « Aller à » rendent des icônes de 20 px, trait 1,75, à l'encre douce de TCK-2685.
- [ ] AC4 — À 1440, une icône de ligne au repos de la colonne rend `--muted-foreground`, une icône active `--primary` ; le test de contraste de la colonne est vert (≥ 3:1).
- [ ] AC5 — À 1440, l'avatar du pied n'est plus `rgb(31, 24, 18)` ; ses initiales tiennent ≥ 4,5:1 sur son fond ; le nom est en graisse 600.
- [ ] AC6 — À 1440, texte d'une ligne de la colonne 12,6 px, titre de groupe 10,8 px 400, icônes à `stroke-width` 1,5 ; au téléphone, lignes du tiroir en 15 px, icônes de 20 px à trait 1,5 ; l'encre au repos est opaque (alpha 1) et tient ≥ 4,5:1.
- [ ] AC7 — Une page de démonstration qui adopte la pleine largeur, à 390 : une rangée de liste commence à x = 0 et son texte à x = 16 ; la garde rougit si l'on y ajoute un `px-4` sur le conteneur de la page (ablation). `/app/leases`, qui ne l'adopte pas, garde ses 16 px de marge.
- [ ] AC8 — Comparés par l'outil de TCK-2684 aux références gelées de `?p=app-coque&a=a` (« Accueil (admin) », « Page racine (Demandes) ») avec les rôles de coque communs, la barre d'onglets, la colonne et la zone de contenu ne rendent aucun écart au-delà des tolérances, hors exceptions ci-dessus et hors structure portée par TCK-2617 → TCK-2619.
- [ ] AC9 — Relevé avant/après d'une page de `/super-admin` et de l'accueil public à 390 (barre d'onglets publique) : zéro écart.

## Hors périmètre

- La structure de l'en-tête du téléphone et la barre d'action collante dans la coque (TCK-2617), les onglets et menus par persona (TCK-2618), le tiroir (TCK-2619).
- L'en-tête de page `PageHeader` (TCK-2687, C3).
- Le comportement des gabarits entre 768 et 1279 px (C11 de l'annexe C) : la règle est écrite dans [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) et les maquettes à 1280 des pages qui se dégradent sont faites par la session (décision 3 b du porteur, 2026-11-10).
- L'adoption de la pleine largeur par les pages existantes (vagues 86 à 90).
- La coque de `/super-admin`.

## Notes d'implémentation

_(à remplir par implementing-specs)_
