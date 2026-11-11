---
id: TCK-2689
title: "Fidélité au pixel : primitives neuves, lot 1 — puce de filtre et sa rangée, contrôle segmenté, barre d'action collante, ligne de liste mobile"
status: done
phase: P1
family: front
estimate: M
wave: 91
created: 2026-11-10
updated: 2026-11-11
depends_on: [TCK-2685, TCK-2686]
blocks: [TCK-2580, TCK-2581, TCK-2584, TCK-2586, TCK-2587, TCK-2589, TCK-2590, TCK-2592, TCK-2594, TCK-2596, TCK-2597, TCK-2598, TCK-2600, TCK-2601, TCK-2602, TCK-2603, TCK-2604, TCK-2606, TCK-2608, TCK-2611, TCK-2613, TCK-2614, TCK-2617, TCK-2618, TCK-2619, TCK-2621, TCK-2622, TCK-2624, TCK-2625, TCK-2628, TCK-2629, TCK-2632, TCK-2634, TCK-2635, TCK-2636, TCK-2638, TCK-2639, TCK-2641, TCK-2643, TCK-2644, TCK-2645, TCK-2647, TCK-2648, TCK-2650, TCK-2651, TCK-2653, TCK-2654, TCK-2656, TCK-2659, TCK-2660, TCK-2662, TCK-2664, TCK-2667, TCK-2668, TCK-2670, TCK-2671, TCK-2673, TCK-2675, TCK-2677, TCK-2678, TCK-2682]
spec_refs:
  features:
    - "docs/features.md#navigation-de-la-console-selon-le-profil-actif"
  models: []
tags: [front, design-system, primitives, audit-ux, app, fidelite]
---

## Objectif utilisateur

Dans `/app`, filtrer une liste par une rangée de puces, basculer entre deux vues, agir depuis le bas de l'écran au pouce et parcourir une liste au téléphone se font avec les mêmes pièces sur toutes les pages — celles que dessinent les maquettes retenues.

## Contrat de données

Aucun changement d'API.

- **Lit** : les jetons, ombres, encres et la portée `/app` de TCK-2685 ; l'échelle et la taille d'action principale de TCK-2686 ; `ui/tabs.tsx` (variante par défaut, utilisée aujourd'hui comme contrôle segmenté sur `/app/agency/team`, `bookings`, `payments`, `visits`) ; la variable `--barre-onglets-hauteur` (`globals.css:311`).
- **Produit** : quatre primitives neuves (ou variantes, si l'implémenteur les pose sur une primitive existante), rendues par la vitrine.

## Direction UX / Artistique

> **Principe d'arbitrage (décidé par le porteur le 2026-11-10, [ADR-0106](../../../adr/0106-la-maquette-retenue-fait-foi-au-pixel.md))** : la maquette retenue fait foi au pixel, sauf (1) une règle d'accessibilité mesurée, (2) une contrainte technique, (3) une incohérence interne des maquettes, tranchée par la valeur majoritaire. Mesure : téléphone 390 × 844 à `rem` 16, bureau 1440 × 900 à racine 16 et densité ×0,9 ([ADR-0107](../../../adr/0107-la-densite-du-bureau-est-un-jeu-de-jetons.md)). Valeurs : [annexe B](../../../qa/audit-ux-2026-11/fidelite/B-composants.md) § 3.1, § 3.2 et § 6 (n° 6, 10, 11, 22) ; [annexe C](../../../qa/audit-ux-2026-11/fidelite/C-coque.md) § 2.3 et § 4 pour la barre.

**Ses propres exceptions** :

| Valeur de la maquette | Retenu | Motif |
|---|---|---|
| Puce de filtre de 36 px au téléphone | **rendu de 36 px, zone tactile de 44 px** par un pseudo-élément | (1) cible tactile — décision D6 de B, option recommandée |
| Compte d'une puce active `text-background/70` | encre douce inverse de TCK-2685 (opaque) | TCK-658 (aucune encre de texte translucide) |
| Cinq contrôles segmentés (`p-1 h-9 px-4`, `p-0.5 h-9`, `p-0.5 h-8/h-10`, `h-13 p-1 text-[15px]`, `rounded-full p-1 h-10`) | `p-1`, items `h-9 px-4` ; taille `sm` `p-0.5 h-8 px-3` | (3) majoritaire (4 pages), recommandation D5 |
| Barre d'action : maquette sans zone sûre | zone sûre ajoutée quand la barre est le dernier élément de l'écran | (2) encoche et barre d'accueil iOS |

### Puce de filtre et rangée — 27 pages, 53 tickets ; `chrome-app.tsx:646` (`PucesFiltres`), `kit.tsx:144` (`Pastille`) ; `?p=app-demandes&a=a`, `?p=app-biens&a=a`

| Partie | Téléphone | Bureau |
|---|---|---|
| Puce | **36 px** (`h-9`), `rounded-full border px-3.5`, `text-sm` 500, `gap-1.5`, `whitespace-nowrap` | idem (32,4 rendu) |
| Taille `sm` | — | `h-8 px-3`, texte **13 px** (jeton) — 5 pages |
| Repos | `border-border bg-card text-foreground` ; compte `tabular-nums text-muted-foreground` | idem |
| Active | `border-foreground bg-foreground text-background` ; compte en encre douce inverse | idem |
| Variante « ajouter » | `border-dashed` | idem |
| Rangée | `flex gap-2 overflow-x-auto px-4 py-2.5`, sans barre de défilement, bord à bord | idem |
| État | `aria-pressed` (bascule) | idem |

Le filet `border-border` d'une puce au repos (1,26:1) n'est pas une limite de champ : la puce s'identifie par son libellé (WCAG 1.4.11 ne l'exige pas). Il reste.

### Contrôle segmenté — 13 pages, 30 tickets ; `?p=app-biens&a=a`, `?p=app-argent&a=a`, `?p=app-commissions&a=a`

| Partie | Valeur | Produit aujourd'hui (mesuré) |
|---|---|---|
| Piste | `rounded-lg bg-muted p-1` → 44 px au téléphone | `p-[3px]`, 40 px (plancher), 28,8 au bureau |
| Item | `h-9 px-4 rounded-md text-sm` 500 | `px-1.5 py-0.5` |
| Actif | `bg-card` (#fff) + ombre nommée « item actif » | `bg-background` (#fcf9f3) `shadow-sm` |
| Inactif | `text-muted-foreground` (4,85:1 sur `--muted`) | `text-foreground/70` |
| Pleine largeur | items `flex-1` | — |
| `sm` | `p-0.5`, items `h-8 px-3`, texte 13 px | — |

### Barre d'action collante — 20 pages, 38 tickets ; `chrome-app.tsx:433`, `?p=app-coque&a=a` (« Page de détail »), `?p=app-baux&a=a`

| Partie | Valeur |
|---|---|
| Hauteur | **73 px** = filet 1 + `py-3` (12 + 12) + bouton d'action principale de 48 (C § 2.3 : 73 px sur 49 écrans) |
| Aspect | `border-t border-border bg-card px-4 py-3`, ombre nommée « barre collante » (TCK-2685) |
| Contenu | un bouton d'action principale pleine largeur, ou deux à 50/50 avec `gap-2` |
| Place | en flux, **entre le contenu et la barre d'onglets** (`flex-none`) : rien ne passe dessous |
| Zone sûre | aucune au-dessus de la barre d'onglets (elle porte la sienne) ; `env(safe-area-inset-bottom)` en plus des 73 px quand la barre est le bas de l'écran (plein écran, sans onglets) |
| Bureau | aucune barre collante dans les maquettes bureau retenues (à vérifier sur les références gelées) : la primitive ne s'affiche que sous `md` |

### Ligne de liste mobile — 11 pages au moins ; `?p=app-demandes&a=a`, `?p=app-clients&a=a`

| Partie | Valeur |
|---|---|
| Ligne | `flex min-h-14 items-center gap-3 px-4 py-2.5` (56 px au moins), bord à bord |
| Séparation | `border-b border-border` |
| Début | avatar de 40 px (TCK-2687) **ou** icône dans un disque `size-9` |
| Titre | **15 px** (jeton) `font-medium`, tronqué sur une ligne |
| Détail | **13 px** (jeton) `text-muted-foreground` |
| Fin | pastille de statut (TCK-2687), montant (`tabular-nums`, préréglage court de TCK-2685) ou chevron `size-4` |
| Cible | toute la ligne est le lien (56 ≥ 44) |

## Contraintes strictes (métier)

**Pas de régression.** Ce qui existe et doit rester :

- **Les contrôles segmentés actuels** (`Tabs` par défaut sur `/app/agency/team`, `bookings`, `payments`, `visits`) : si l'implémenteur pose le segmenté sur `Tabs`, ces quatre pages prennent l'aspect de la maquette (elles sont dans `/app`) et gardent leur comportement (flèches, `aria-selected`) ; aucun appelant hors de `/app` ne change.
- **Les puces existantes** (`ChoiceChips` du parcours de publication, puces locales du site public, puces de comptage de `/app/properties`) ne changent pas : la primitive est neuve, leur migration relève des pages.
- **La barre d'onglets et le dock flottant** gardent leur calcul (`--barre-onglets-hauteur`, `--floating-dock-base`) ; la barre d'action ne couvre jamais le dernier élément du contenu.
- **La rangée défilante** ne fait jamais défiler le document (`scrollWidth − innerWidth = 0` à 360 et 390).
- Le plancher tactile de 36 px de `sm` (TCK-2686) n'est pas raboté.
- Libellés neufs (nom de la rangée de filtres pour l'assistance, « Ajouter un filtre ») en `fr`/`en`/`wo` (`wo` = le texte français tel quel), vouvoiement ([ADR-0095](../../../adr/0095-le-ton-suit-la-session.md)).

## Delta à produire

- [ ] Puce de filtre (deux tailles, quatre états : repos, active, ajouter, désactivée) et sa rangée défilante.
- [ ] Contrôle segmenté (deux tailles, pleine largeur).
- [ ] Barre d'action collante, avec son emplacement dans la coque (celui que crée TCK-2617, ou un emplacement provisoire si TCK-2617 n'est pas fait — à écrire dans les notes).
- [ ] Ligne de liste mobile, avec ses trois fins.
- [ ] La vitrine (TCK-2685) rend chacune dans chacun de ses états, au téléphone et au bureau.
- [ ] `docs/design-guidelines.md` : les quatre primitives, leurs tailles, et la règle de zone tactile élargie par pseudo-élément.
- [ ] Tests de rendu (hauteurs, `aria-pressed`, zone tactile, défilement de la rangée).

## Critères d'acceptation

- [ ] AC1 — Puce de la vitrine à 390 : boîte visible de 36 px ; `document.elementFromPoint` 4 px au-dessus et 4 px au-dessous de sa boîte rend encore la puce (zone de 44 px) ; active : fond `rgb(31, 24, 18)`, encre `rgb(252, 249, 243)`, compte opaque (alpha 1) à ≥ 4,5:1.
- [ ] AC2 — Rangée de 12 puces de la vitrine à 360 : défile horizontalement dans son conteneur, `scrollWidth − innerWidth = 0` sur le document (`innerWidth` relevé).
- [ ] AC3 — Contrôle segmenté de la vitrine : piste de 44 px à 390 (32,4 + 7,2 = 39,6 à 1440), item actif sur fond `rgb(255, 255, 255)` avec l'ombre nommée ; inactif ≥ 4,5:1.
- [ ] AC4 — Barre d'action de la vitrine à 390, au-dessus d'une barre d'onglets : 73 px de haut (±1), bouton de 48 px ; dans un écran plein (sans onglets), 73 px + la zone sûre émulée. À 1440, elle n'est pas rendue.
- [ ] AC5 — Ligne de liste de la vitrine à 390 : ≥ 56 px, titre 15 px 500, détail 13 px, `padding-left` 16 px, bord à bord de son conteneur.
- [ ] AC6 — Comparées par l'outil de TCK-2684 aux références gelées de `?p=app-demandes&a=a` (rangée de puces, ligne de liste) et de `?p=app-coque&a=a` « Page de détail » (barre d'action), les primitives de la vitrine ne rendent aucun écart au-delà des tolérances sur la boîte et son contenu.
- [ ] AC7 — `/app/agency/team` à 1440, relevé avant/après : le contrôle segmenté suit la maquette, et les flèches du clavier changent toujours d'onglet (test existant vert).

## Hors périmètre

- Les pages (vagues 86 à 90) : adopter les puces, la barre, la ligne ; retirer leurs pièces locales.
- L'en-tête du téléphone et les actions « ⋯ » (TCK-2617).
- La feuille du bas, la case à cocher, l'interrupteur, la jauge (TCK-2690).
- L'enveloppe de contenu bord à bord de la coque (TCK-2691, C1) : la ligne et la rangée sont bord à bord de **leur** conteneur.

## Notes d'implémentation

### Ce qui est livré (terrain-4, 2026-11-11)

- **Puce de filtre** : primitive neuve `ui/puce-de-filtre.tsx` — `PuceDeFiltre` (bouton, `aria-pressed`, tailles
  `default` / `sm`, variantes `filtre` / `ajouter`, `disabled`, compte) et `RangeeDePuces` (`role="group"` nommé,
  « Filtres » par défaut). Cible de 44 px par un `before:` centré de hauteur `h-controle` (44 sous le pouce et au
  pointeur grossier, 32,4 au bureau) — même mécanique que l'onglet souligné de TCK-2687. Compte de la puce active à
  l'encre douce inverse OPAQUE (8,69:1 mesuré).
- **Contrôle segmenté** : posé sur `Tabs` par défaut, sous `portee-app:` seulement (`ui/tabs.tsx`, `SEGMENTE_APP`) ;
  `TabsList` reçoit `size="sm"` (`data-size`). Pleine largeur : `className="w-full"`. Chaque règle porte le sélecteur
  de la variante (`portee-app:` est un `:where`) : c'est la spécificité, pas l'ordre de la feuille, qui la fait gagner.
- **Barre d'action collante** : primitive neuve `ui/barre-d-action.tsx` (`BarreDAction`, prop `zoneSure`).
  **Emplacement provisoire** (TCK-2617 n'est pas fait) : `AppShell` rend `<div id="emplacement-barre-d-action"
  class="contents">` entre la rangée du contenu et la barre d'onglets ; la barre s'y rend en portail
  (`useSyncExternalStore`, rendue une fois hydratée), en flux hors de la coque. `data-bas-de-l-ecran` sur
  l'emplacement quand la coque n'a pas de barre d'onglets → zone sûre. TCK-2617 reprend cet emplacement tel quel.
  ⚠ Un bouton d'envoi dans la barre est HORS du `<form>` : `form="<id>"` (docblock, guidelines, fiche design-sync).
- **Le toast** : `--barre-d-action-hauteur` (0 par défaut ; sous `md`, filet + `py-3` + action, zone sûre en plus au
  bas de l'écran) s'ajoute aux quatre formules de `--toast-bas`, seulement quand une barre occupe l'emplacement. Le
  dock flottant garde son calcul (contrainte du ticket ; sa règle est figée par `CoqueHauteur.test.tsx`).
- **Ligne de liste mobile** : primitive neuve `ui/ligne-de-liste.tsx` (`LigneDeListe` : `href` → lien, `onClick` →
  bouton, sinon `div` ; `IconeDeLigne`, `MontantDeLigne`, `chevron`). Construite sur `LigneLien`
  (`app-biens-pieces.tsx:158`), la ligne générique des maquettes.
- i18n `ui.filterChips.rowLabel` (« Filtres ») et `ui.filterChips.add` (« Ajouter un filtre ») ; vitrine
  (`PrimitivesNeuvesLot1`) ; design-sync (3 fiches et aperçus, 3 sous-parties exclues, fiche `Tabs`) ;
  `docs/design-guidelines.md` (section du lot et règle de la zone tactile par pseudo-élément).

### Prémisses qui diffèrent

- **Barre : 73 px vs la référence de l'AC6.** La « Page de détail » gelée (`app-coque/a-2-telephone.json`) rend
  **69 px** : ses deux boutons font 44 (taille par défaut), pas 48. 73 est la valeur majoritaire (49 écrans, annexe C
  § 2.3) : exception tranchée par la règle (3) d'ADR-0106. Filet, padding 12/16, fond, ombre, écart de 8 et
  largeurs (175 + 175) sont identiques. La primitive suit sa hauteur de contenu (69 avec des boutons par défaut, 73
  avec `size="xl"`, la valeur du ticket) ; `--barre-d-action-hauteur` suppose 73 (le toast passe alors 20 px au-dessus
  d'une barre de 69 au lieu de 16).
- **AC7 « flèches »** : base-ui active à la main — la flèche déplace le focus, Entrée choisit. Comportement inchangé,
  mesuré au navigateur sur `/app/agency/team`. Aucun test existant ne gardait les flèches de cette page : le nouveau
  fichier le fait sur le segmenté.
- **Neuf listes d'onglets par défaut dans `/app`**, pas quatre : `TeamConsole`, `BookingsList`, `VisitsList`,
  `PaymentsTabs`, plus `ContactLeadsInbox`, `CustomerDetailTabs`, `CustomerDetailSheet`, `PropertyDetailTabs`,
  `AdminFinancesTabs` — toutes prennent le segmenté. `PropertyDetailTabs` (« Aperçu / Modifier ») est plutôt un
  onglet de page : à sa page de choisir `line`. Hors `/app` (`PublicFavoritesPage`, super-admin), rien ne change.
- La `LigneDemande` d'`app-demandes` est un bloc de 2-3 lignes (nom 16 px 600), pas la ligne générique ; la référence
  de la ligne est `LigneLien` (relevée dans 8 écrans gelés : 56 à 63 px, titre 15/500, détail 13/400).
- Zone sûre : le viewport n'est pas `viewport-fit=cover` (piste reportée par le porteur, 2026-10-25) : `env()` vaut 0,
  sur iPhone aussi. La règle est en place (classe émise, `data-zone-sure`) ; aucune valeur non nulle n'est mesurable.

### Mesures au navigateur (2026-11-11, `next dev`, Chrome par le MCP, une passe sous verrou)

| AC | Mesuré | Résultat |
|---|---|---|
| AC1 | vitrine 390 (pointeur grossier) : puce 36 px ; `elementFromPoint` 4 px au-dessus et au-dessous rend la puce, 8 px non (six puces : active, repos, ajouter, `sm`, deux de la rangée) ; active fond `rgb(31, 24, 18)`, encre `rgb(252, 249, 243)` (16,69:1), compte `rgb(186, 182, 176)` opaque, 8,69:1 ; `ajouter` tirets, sans `aria-pressed` ; `sm` 32 px, 13 px | vert (la rangée enroulée de démonstration passe à `gap-y-3` : à 10 px, la cible de la petite puce voisine prenait le point à +4) |
| AC2 | vitrine 360 : rangée de 12 puces, `scrollWidth` 1169 dans 360, défile (`scrollLeft` 400), `scrollX` du document 0 ; **`innerWidth` 360**, écart 0, sans rien masquer. L'échantillon `text-affiche-40` de la section « Échelle de texte » (TCK-2685, insécables) élargissait seul le viewport à 377 : il est contenu (`min-w-0 truncate`, toujours 40 px) | vert |
| AC3 | vitrine 390 : piste 44 (p 4), item 36, actif `rgb(255, 255, 255)` + `0 1px 2px` shadow-color/18, inactif `rgb(110, 101, 90)` 4,85:1 sur la piste ; `sm` 36 / 32, 13 px ; pleine largeur 358 = le parent ; 1440 : piste 39,6 (p 3,6), item 32,4 | vert |
| AC4 | vitrine 390 : barre 73 px (filet 1), bouton 48, au-dessus des onglets factices ; deux actions 158 + 158, écart 8 ; 1440 : `display: none` ; coque `/app/agency/team` 390, un nœud aux classes de la primitive INJECTÉ dans l'emplacement par les outils de développement (aucune page n'adopte encore la barre) : 73 px, bas à 788 = haut de la barre d'onglets, `<main>` 732 → 659, bas du toast 699 = 16 px au-dessus | vert (zone sûre : `env()` = 0, cf. prémisses) |
| AC5 | vitrine 390 : lignes 61 / 59,5 / 59,5, `padding-left` 16, x 0 / largeur 390, titre 15 px 500, détail 13 px `rgb(110, 101, 90)`, avatar 40, disque 36 | vert |
| AC6 | comparé À LA MAIN aux nœuds des références gelées (l'outil de TCK-2684 compare des écrans entiers ; la vitrine n'en est pas un) : rangée de `app-demandes` a-0 — puce « À traiter 4 » 16 / 99 × 36, rangée padding 10/16, écart 8 : identiques (seul écart, le compte opaque, exception du ticket) ; ligne `LigneLien` (8 écrans) 59,5 avec disque, texte à 64 px : identique ; barre de `app-coque` a-2 : cf. prémisses (69 vs 73) | vert, avec l'écart de hauteur de bouton nommé |
| AC7 | `/app/agency/team` 1440, avant (`tabs.tsx` de `HEAD`, restauré au md5 près) : piste 28,8, p 3, actif 21,8 de haut fond `rgb(252, 249, 243)`, inactif `foreground/70` ; après : piste 39,6, items 32,4, actif blanc + ombre, inactif `rgb(110, 101, 90)` ; clavier : flèche → focus sur « Agents », Entrée → choisi ; 390 : piste 44, 5 onglets défilent dans 350 px, écart du document 0 | vert |

### Tests (TCK-2689)

`src/components/ui/__tests__/primitives-neuves-tck-2689.test.tsx` (27 tests) et deux tests de l'emplacement dans
`CoqueHauteur.test.tsx` ; les regex de `--toast-bas` de `primitives-existantes-tck-2688.test.tsx` portent le terme de
la barre, ANCRÉES dans le bloc `@media (width < 48rem)` (une règle sortie du bloc fait rougir). 16 ablations, une à
une : toutes rouges, fichiers restaurés au md5 près.

### Thème sombre (mesuré, 2026-11-11)

Sous la portée, `bg-card` est PLUS SOMBRE que la piste `--muted` au thème sombre (1,21:1) : l'item choisi se lisait
creusé. Le sombre garde le remplissage du produit (`bg-input/30`, bord `input`) : actif composé `rgb(67, 55, 45)` sur
la piste `rgb(58, 46, 35)`, plus clair, comme avant le ticket ; encre 10,96:1, inactif 5,79:1. Puce active au sombre :
libellé 16,69:1, compte 6,3:1.

⚠ `md:hidden` cache la barre sans la démonter : la page pose son action de bureau ailleurs (docblock, guidelines).
