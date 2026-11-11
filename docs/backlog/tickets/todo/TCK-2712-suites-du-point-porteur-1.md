---
id: TCK-2712
title: "Suites du point porteur n° 1 : toast au-dessus de la pastille publique, barre d'action de 69 px qui relève aussi le dock, texte des boutons du pouce au pointeur grossier dès lg, et les derniers écarts de la colonne"
status: todo
phase: P1
family: front
estimate: S
wave: 91
created: 2026-11-11
updated: 2026-11-11
depends_on: [TCK-2688, TCK-2689, TCK-2691]
blocks: []
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, coque, primitives, toast, audit-ux, app, fidelite]
---

## Objectif utilisateur

Les retouches que le point porteur n° 1 a laissées sur la table, avant que les trois pages
d'étalonnage ne s'appuient sur le terrain : un toast ne cache plus la pastille « Filtres / Liste »
du site public ; la barre d'action collante a les boutons de la référence gelée et relève tout ce
qui flotte en bas ; un bouton de 44 px sous le doigt porte un texte du téléphone, même sur une
tablette large ; la colonne de `/app` n'a plus d'écart visible avec la maquette retenue.

## Contrat de données

Aucun changement d'API.

- **Lit** : `src/app/globals.css` (`--toast-bas`, `--barre-d-action-hauteur`, `--floating-dock-base`,
  bloc `densite-de-l-app`), `ui/button.tsx`, `ui/barre-d-action.tsx`, `src/lib/jetons-de-l-app.ts`,
  `search/OutilsFlottantsDeListe.tsx`, `layout/NotificationBell.tsx`, `layout/AppSidebar.tsx`
  (`LigneAllerA`), `layout/AujourdhuiDeLaBarre.tsx`.
- **Produit** : des règles CSS additives, un jeton de texte de bouton, des classes alignées.

## Direction UX / Artistique

> **Décidé** : recommandations du point porteur n° 1 (2026-11-11), appliquées par la session —
> points 3, 4, 5, 7 et 11 (journal du plan, « Point porteur n° 1 »). Le porteur peut les renverser.
> **Principe** : [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md) — la
> maquette retenue fait foi au pixel, sauf accessibilité mesurée, contrainte technique, ou
> incohérence interne (valeur majoritaire). Références gelées : `app-coque` a-0 (bureau 1440,
> colonne), a-1 et a-2 (téléphone, en-tête et « Page de détail »).

| # | Écart | Maquette / décision | Produit avant (mesuré le 2026-11-11) |
|---|---|---|---|
| 3 | Toast et pastille du site public, sous `lg` | le toast se pose **16 px au-dessus** de la pastille | liste 390 : toast bas à 768, pastille 724–772 — **recouverte** ; carte plein écran 390 : toast et pastille tous deux 780–828 ; liste 820 : idem (1056–1104 contre 1060–1108) |
| 4 | Barre d'action collante | **69 px** = filet + `py-3` + boutons de **44** (`a-2-telephone`, « Page de détail ») | `--barre-d-action-hauteur` calculé sur l'action de 48 (73 px) ; vitrine et fiches en `size="xl"` |
| 5 | Dock flottant (`--floating-dock-base`) et barre d'action | relevé de la hauteur de la barre, **comme le toast** | non relevé : un élément du dock se pose sous la barre |
| 7 | Texte d'un bouton `default`/`lg` au pointeur grossier dès `lg` | la taille du téléphone (**14 px**) : un bouton de 44 px au texte de bureau paraît vide | vitrine 1440 tactile : 16 boutons `default` à **44 px de haut, texte 12,6 px** |
| 11a | Pastille de la cloche | `h-4 min-w-4 px-1`, 10 px **600**, interligne **10**, anneau `card` ; colonne x 203,2 y 10,8 ; en-tête 390 x 362 y 9,5 | 700, interligne 14,4 / 16, anneau `background` ; colonne x 204,9 y 7,2 ; en-tête x 367,9 y 3,5 |
| 11b | Touches « ⌘ K » | `rounded bg-muted px-1`, 11 px, police mono de la feuille de base, 13,8 × 15,7, x 227,2 et 242,8 | anneau de 1 px, `h-5 min-w-5` (18 × 18), police sans, x 218,8 et 238,6 |
| 11c | « Aujourd'hui » dans la colonne dépliée | titre 18 px de haut (`pb-1`) ; lignes **28,8 px** (`h-8` à ×0,9 — et non 32, chiffre du point porteur), texte **13 px**, **sans icône**, sans interstice ; compte `rounded-full h-5 px-1.5` 11 px 600, neutre sur `muted` | titre 25,2 px ; lignes 32,4 + 1 px, texte 12,6, icône 18 ; compte `rounded-md` 11,5 px, neutre sur `foreground/7` |

**Ses propres exceptions** :

| Valeur de la maquette | Retenu | Motif |
|---|---|---|
| Encre du compte neutre d'« Aujourd'hui » `foreground/70` | l'encre douce opaque (`text-encre-douce`) | (1) TCK-658 : aucune encre de texte translucide |
| « Aujourd'hui » caché dans le rail (768–1023) | gardé, chaque ligne en icône + point (revue adverse I1 de TCK-2490) | (1) un signal ne disparaît pas d'un rail ; seule la colonne dépliée perd l'icône |
| Bouton principal « Répondre » de la barre en 600 | la graisse de `Button` (500) | hors primitive : la page choisit sa graisse (au ticket de la page) |

## Contraintes strictes (métier)

**Pas de régression.** Ce qui existe et doit rester :

- Le **tiroir** du téléphone garde son « Aujourd'hui » (lignes de 40 px, 15 px, icônes de 20) :
  aucune référence téléphone ne le dessine (0 écran sur 12).
- Le **rail** garde « Aujourd'hui » en icônes marquées d'un point (TCK-2490, I1).
- Hors de la portée `/app` (site public, `/super-admin`, écrans d'entrée), aucun bouton ne change.
- Au pointeur fin, aucun bouton de `/app` ne change, à aucune largeur.
- Le toast garde ses quatre formules et le terme additif `--barre-d-action-hauteur` (TCK-2689).
- Le dock garde sa base de 16 / 24 px hors barre d'action, et `useFloatingDockSlot` est inchangé.

## Delta à produire

- [x] (3) La pastille se marque (`data-outils-flottants-de-liste`) ; sous `lg`, `--toast-bas` lit la
      base du dock + la pastille + 16 px tant qu'elle est rendue (liste et carte plein écran).
- [x] (4) `--barre-d-action-hauteur` sur `--spacing-controle` (44) ; vitrine, fiche design-sync,
      aperçu, docblock, commentaire de `globals.css` et guidelines à 69 px et boutons par défaut.
- [x] (5) `--floating-dock-base` additionne `--barre-d-action-hauteur` (base de `:root` et coque à
      onglets).
- [x] (7) Jeton `--text-bouton` (défaut `text-sm`, 14 px fixes au régime du pouce, `text-sm` au
      régime du bureau), lu par `Button`, connu de `tailwind-merge`.
- [x] (11) Pastille de la cloche, touches « ⌘ K », « Aujourd'hui » de la colonne dépliée.

## Critères d'acceptation

- [x] AC1 — (3) `/fr/properties` à 390 tactile, défilée à 1600 (pastille visible) : le bas d'une
      sonde `bottom: var(--toast-bas)` est **16 px (±1) au-dessus du haut de la pastille** ; même
      chose en carte plein écran (« Filtres / Liste ») et à 820. **Témoin** : en haut de page
      (pastille absente), le toast reste à 16 px au-dessus de la barre publique (768 à 390).
- [x] AC2 — (4) Coque `/app` à 390, un nœud de la primitive avec deux `<Button>` par défaut injecté
      dans l'emplacement : barre **69 px (±1)**, boutons 44, et le bas de la sonde du toast **16 px
      (±1) au-dessus de la barre**. La vitrine 390 montre la barre à 69 px.
- [x] AC3 — (5) Même page : un élément `bottom: var(--floating-dock-base)` posé dans la coque a son
      bas **16 px au-dessus de la barre d'action** (et 16 px au-dessus de la barre d'onglets sans
      barre d'action — **témoin**, valeur d'avant).
- [x] AC4 — (7) Vitrine 1440 **tactile** : chaque `Button` par défaut 44 px de haut, texte **14 px** ;
      vitrine 1440 **au pointeur fin** : 32,4 px, texte **12,6 px** (témoin, inchangé) ;
      `cn(buttonVariants(), 'text-xs')` garde `text-xs` seul.
- [x] AC5 — (11a) Colonne 1440 : pastille 10 px 600, interligne 10, 14,4 de haut, x 203,2 ± 2,
      y 10,8 ± 2 ; en-tête 390 : 16 de haut, x 362 ± 2, y 9,5 ± 2 ; anneau `card`.
- [x] AC6 — (11b) Colonne 1440 : touches 13,8 × 15,7 (±1), fond `muted`, police mono, rayon 3,6,
      x 227,2 et 242,8 (±2).
- [x] AC7 — (11c) Colonne 1440 : titre d'« Aujourd'hui » 18 px de haut ; pas entre deux lignes
      **28,8 px**, texte 13 px à x 14,4, **aucune icône** ; compte `rounded-full` 18 × 18, 11 px 600 ;
      compte neutre sur `muted`, encre douce opaque (≥ 4,5:1, cliquet de contraste). **Témoins** :
      rail (1024) — icône et point gardés ; tiroir 390 — lignes 40 px, 15 px, icône 20.
- [x] AC8 — Les tests des règles (CSS et classes) sont rouges sans le correctif (ablation) ; lint,
      `tsc`, cliquets de contraste et gardes racine verts sur un arbre sans maquettes.

## Hors périmètre

- Le toast au-dessus d'une **pile** du dock (comparateur, messagerie posés au-dessus de la pastille) :
  le dock calcule en JS ; voir les notes.
- L'ordre « Tableau de bord » avant « Aujourd'hui » dans la colonne (le produit place l'entrée hors
  groupe en tête, la maquette après « Aujourd'hui ») : relevé, non tranché ici.
- La taille `lg` de `Button` (`h-11`, 39,6 px dès `lg` au pointeur grossier) : hors des jetons de
  TCK-2686.

## Notes d'implémentation

2026-11-11 — voie front (terrain-5). Mesures au navigateur (Chrome, CDP), base de démo locale, compte
admin d'agence ; relevés de l'outil de TCK-2684 sous
`<scratchpad>/fidelite/tck-2712/{avant,apres}/` (hors dépôt).

### Prémisses qui diffèrent

- **« Aujourd'hui » en lignes de 32 px** (point porteur n° 1) : la référence gelée (`app-coque` a-0,
  1440) rend un pas de **28,8 px** — `h-8` sur l'échelle ×0,9. Les AC portent la valeur rendue.
- **L'ordre de la colonne** : le produit pose « Tableau de bord » au-dessus d'« Aujourd'hui », la maquette
  après. Les AC n'utilisent donc aucune ordonnée absolue dans la colonne ; l'ordre reste hors périmètre.
- **Au-delà du point 11**, trois écarts mesurés sont alignés dans le même geste (même maquette, même
  composant) : la **place** de la pastille de la cloche (colonne y 7,2 contre 10,8 ; en-tête 390 x 367,9
  y 3,5 contre 362 / 9,5) et son anneau (`background` contre `card`) ; la **police** des touches
  (sans contre mono — tolérance 0) ; le **compte** d'« Aujourd'hui » (`rounded-md` 11,5 px sur
  `foreground/7` contre `rounded-full` 11 px sur `muted`) et la hauteur de son **titre** (25,2 contre
  18 : ce n'est pas un bouton de repli, la décision 9 du point porteur ne le couvre pas).
- **La pastille publique est rendue dès le haut de `/fr/properties` au téléphone** (scrollY 0), pas
  seulement après défilement : le témoin « sans pastille » est pris sur `/fr`.
- **Aucune page publique mesurée ne rend de `Button`** (`/fr`, `/fr/properties`, `/fr/agencies`,
  `/fr/contact`, `/fr/playground` : 0) : le témoin hors portée de (7) est la règle (défaut du jeton =
  `var(--text-sm)`, gardé par `densite-de-l-app.test.ts`), pas un relevé.

### Ce qui est fait

- (3) `OutilsFlottantsDeListe` porte `data-outils-flottants-de-liste` (rendu seulement quand il est
  montré). Sous `lg`, deux règles de `globals.css` (`:root:has(pastille)` pour la carte plein écran, et
  la règle de la barre publique `…:has(pastille)` pour la liste, plus spécifique que celle qu'elle bat) :
  `--toast-bas = base du dock + h-12 + 16 px + --barre-d-action-hauteur`. La pastille est au sol du dock
  (priorité −1) : sa base EST `--floating-dock-base`.
- (4) `--barre-d-action-hauteur` sur `--spacing-controle` (44 au pouce) : 69 px. Vitrine, fiche et
  aperçu design-sync, docblock, commentaire de `globals.css` et guidelines passent aux boutons par défaut.
- (5) `--floating-dock-base` additionne `--barre-d-action-hauteur` : base de `:root` (16 / 24 px, la
  base de 24 dès `sm` est gardée) et règle de la coque à onglets. `useFloatingDockSlot` est inchangé.
- (7) Jeton `--text-bouton` (bloc `densite-de-l-app`) : défaut `var(--text-sm)` (rien ne bouge hors de
  `/app`), `0.875rem` au régime du pouce (sous `md` et au pointeur grossier à toute largeur),
  `var(--text-sm)` au régime du bureau. `Button` (base) lit `text-bouton` ; `sm` (`text-petit-bouton`),
  `xl` (`text-corps`) et `xs` (`text-xs`) gardent le leur — `cn` les fait gagner. `bouton` entre dans
  `DENSITE_DE_L_APP.text` (tailwind-merge).
- (11) Cloche : `h-4 min-w-4 px-1 text-pastille font-semibold leading-none ring-card`, place par
  emplacement (`COTES_DE_LA_CLOCHE`). Touches : `rounded bg-muted px-1 text-legende`, police mono de la
  feuille de base. « Aujourd'hui » : titre `pb-1` (le tiroir garde `h-7`), lignes `h-8 text-ui` (rail
  `icones:h-9`, tiroir `max-md:h-10 max-md:text-corps`), icône `hidden max-md:block icones:block`,
  `space-y-px` au tiroir seulement, compte `rounded-full text-legende`, neutre `bg-muted
  text-encre-douce`. Consigne de `check-valeurs-arbitraires-app` abaissée de trois `texte-arbitraire`
  (AppSidebar, AujourdhuiDeLaBarre, NotificationBell).

### Preuves

| AC | Mesure | Verdict |
|---|---|---|
| AC1 | avant : liste 390 toast bas 768 / pastille 724–772 (recouverte) ; carte 780–828 contre 780–828 ; 820 1056–1104 contre 1060–1108. Après : liste 390 sonde bas **708**, pastille 724 → **16** ; carte (« Filtres / Liste ») sonde 764, pastille 780 → **16** ; 820 sonde 1044, pastille 1060 → **16**. Témoin `/fr` 390 (sans pastille) : toast 768 (16 au-dessus de la barre publique à 784), dock 772 — inchangés | vert |
| AC2 | `/app/leases` 390, nœud de la primitive injecté dans l'emplacement avec deux boutons par défaut : barre y 711 h **69**, boutons **44** (identique à la référence a-2 : y 711, h 69, boutons 724/44) ; `<main>` 655 ; sonde du toast bas 695 → **16** au-dessus. Vitrine 390 : barres 69, boutons 44, texte 14 px | vert |
| AC3 | même page : dock bas 695 → **16** au-dessus de la barre d'action ; sans barre (témoin) : toast et dock bas 764, **16** au-dessus des onglets (780). Coque sans onglets simulée (attributs basculés) : dock et toast à 85 px du bas = 16 + 69 | vert |
| AC4 | vitrine 1440 tactile — avant : 16 `Button` par défaut 44 px / **12,6 px** ; après : 44 px / **14 px**, interligne 20. Au pointeur fin, avant = après (32,4 px / 12,6 ; `sm` 13 ; `xl` 15). Témoin public hors portée, `/fr/favorites` 1440 tactile : « Partager ma sélection » **12,6 px** (`--text-bouton` = `--text-sm` = .7875rem). `cn(buttonVariants(), 'text-xs')` → `text-xs` seul, de même `text-base`, `text-lg`, `text-[0.9375rem]` posés par-dessus (test). Les appels bruts à `buttonVariants({ size: 'sm' \| 'xl' })` : dans la feuille compilée, `.text-bouton` précède `.text-petit-bouton` et `.text-corps` comme `.text-sm` les précédait — leur taille gagne toujours | vert |
| AC5 | colonne 1440 : pastille x **203,2** y **10,8**, 19,2 × 14,4, 10 px **600**, interligne **10**, anneau rgb(255,255,255) — identique à la référence ; en-tête 390 : x **362** y **9,5**, 20 × 16, 600 / 10 — identique | vert |
| AC6 | touches x **227,2** et **242,8**, y 91,1, **13,8 × 15,7**, fond rgb(241,236,224), rayon 3,6, `ui-monospace` 11 px — identiques à la référence | vert |
| AC7 | titre h **18** ; lignes 181 → 209,8 → 238,6 → 267,4 (pas **28,8**), texte **13 px** à x **14,4**, aucune icône ; comptes 18 × 18 `rounded-full`, 11 px 600, interligne 16,5 ; neutre fond rgb(241,236,224), encre rgb(76,70,65). Rail (1000 px, menu réduit puis rétabli) : icône 18 px et point `block`, lignes 36. Tiroir 390 : titre 28, lignes **40**, **15 px**, icône **20**, pas 41 (interstice gardé). `AppSidebar.contraste` vert (puces primaire et neutre, touches) | vert |
| AC8 | 16 ablations (dont la hauteur de la barre d'action ajoutée une seconde fois aux deux règles de la pastille : rouge — la base du dock la porte déjà depuis (5), la formule ne l'ajoute plus), chacune rouge puis restaurée par `cp` (md5) — tableau du rapport ; lint et `tsc` propres ; cliquets de contraste (5 fichiers) et gardes racine verts sur un arbre `git archive HEAD` + ces fichiers, sans maquettes ; dans l'arbre principal, seules les 5 gardes des maquettes rougissent | vert |

### Reste (hors périmètre, relevé)

- Toast au-dessus d'une **pile** du dock (comparateur ou messagerie posés au-dessus de la pastille) : il
  recouvre ce qui est au-dessus de la pastille, comme avant. Le dock calcule en JS : publier la hauteur
  de la pile en variable CSS serait le geste, s'il faut.
- `Button size="lg"` (`h-11`) rend 39,6 px dès `lg` au pointeur grossier, et `icon-sm` 28,8 : hors des
  jetons de TCK-2686.
- Le bouton principal « Répondre » de la référence est en 600 ; `Button` est en 500 (au ticket de la page).
- L'ordre « Tableau de bord » / « Aujourd'hui » dans la colonne (voir prémisses).
