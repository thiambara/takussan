Annexe de [la synthèse](../fidelite-au-pixel.md) — relevé du 2026-11-10 ; les chemins `/private/tmp/…` désignent les relevés bruts de la session, non versionnés.

# A — Jetons visuels, typographie, formats, icônes : maquettes retenues vs produit

Relevé du 2026-11-10, 20:45 → 21:20. Machine : 8 cœurs, `load average` 1,6 → 4,3 (d'autres agents
capturaient). Ce sont des styles calculés et des comptes : la charge n'y change rien.
Aucun fichier du dépôt n'a été modifié.

## 0. Ce qui a été mesuré, et comment

| Source | Quoi | Volume |
|---|---|---|
| Statique, maquettes (`pages/app/*` + `kit.tsx` + `chrome-app.tsx`) | toutes les chaînes littérales, découpées en jetons, utilitaires Tailwind seulement, variantes retirées | 84 fichiers · **46 916 occurrences** · 1 249 classes distinctes |
| Statique, produit DS (`components/ui`, `console`, `feedback`, `layout`) | même script | 67 fichiers · 2 616 occ. · 490 distinctes |
| Statique, produit `/app` (`app/(dashboard)` + `src/components`) | même script | 951 fichiers · 37 645 occ. · 1 374 distinctes |
| **Au navigateur, maquettes RETENUES seulement** | visionneuse, approche `retenue` de chaque page, **chaque écran**. Bureau : 1440×900, cadre bureau. Téléphone : 390×844 DPR 2, **mode « vrai téléphone » plein écran** (la visionneuse passe en plein écran sous 768 px). Plus le cadre téléphone de la visionneuse vue au bureau, pour mesurer l'artefact | 33 pages · **204 écrans × 3 vues** · 67 667 éléments (bureau) / 31 666 (téléphone) |
| **Au navigateur, `/app` réel** | persona `admin` (+ `locataire` pour `/app/payments`). Collecte séparée `main` / coque | 23 pages au bureau · 23 au téléphone (les 9 dernières relancées après l'arrêt du premier balayage) |

Pour chaque élément visible : classes, `font-family/size/line-height/weight/letter-spacing`,
`font-variant-numeric`, rayons, ombres, bordures, fonds, encres, icônes lucide (nom, taille,
`stroke-width`). Outils et données brutes : dossier `…/scratchpad/fidelite/jetons/` (§ 9).

**Bonne nouvelle d'abord** — ce qui ne produira AUCUN écart :

- **Couleurs : zéro palette Tailwind brute** dans les maquettes (0 occurrence de `stone-*`,
  `emerald-*`, `amber-*`, `white`, `black`…). Le produit en a 9 (`text-white` sur photos). Toutes
  les teintes passent par les jetons Lin.
- **Mêmes jetons, même valeur des deux côtés** : la maquette vit sous `[locale]/(public)`, le
  produit sous `(dashboard)`, mais les deux héritent du **même** `src/app/layout.tsx` et du même
  `globals.css` ; `maquettes.css` fait `@reference "../../../../globals.css"` (thème du site) et
  ne redéclare aucun jeton. `/app` n'a **aucune** surcharge de jeton (`AppShell` pose
  `bg-background`, rien d'autre). Mesuré : `--primary` rendu `rgb(168,83,50)`, `--border`
  `rgb(235,229,213)`, `--muted-foreground` `rgb(110,101,90)` des deux côtés.
- **Mode sombre : ni l'un ni l'autre.** Maquettes : 0 classe `dark:`. Produit : aucun
  `ThemeProvider`, aucun `prefers-color-scheme` ; les seules portées `.dark` sont celles de la
  console super-admin (`SuperAdminSidebar.tsx:290`, `SuperAdminShell.tsx:83`,
  `SuperAdminTopbar.tsx:52`). Rien à prévoir pour `/app`.
- **Polices : identiques.** Calculé des deux côtés : titres `bricolage`, corps
  `dmSansExt, dmSans, "dmSans Fallback"…`, faces `bricolage 400 700`, `dmSans 400 700`,
  `dmSansExt 400 700` chargées (`document.fonts`, statut `loaded`). Les chiffres tabulaires sont
  employés des deux côtés (`tabular-nums` : 769 occ. maquettes / 423 produit).
- **Rayons : uniquement des jetons de part et d'autre** (`rounded-lg/xl/2xl/full/md`) ;
  12 rayons arbitraires seulement côté maquette (`rounded-[5px]` ×4, `[3px]`, `[6px]`, `[10px]`,
  `[45%]`, `rounded-t-[4px]`…). Même classe = même pixel.
- **Bibliothèque d'icônes : lucide-react 1.31.0**, la même.

## 1. Le constat qui gouverne tout le reste : `html { font-size: 90% }` dès `lg`

`globals.css` (`@layer base`, TCK-635) : **à partir de 1024 px, `1rem` = 14,4 px**. Tout ce qui est
en `rem` (texte `text-*`, espacements, `h-*`, `size-*`, rayons) rétrécit de 10 % au bureau ; ce
qui est écrit en `px` (`text-[13px]`, `size-[18px]`) ne bouge pas — « et c'est voulu », dit le
commentaire. Conséquences mesurées :

| Classe | Téléphone (≤ 1023 px) | Bureau (≥ 1024 px) |
|---|---|---|
| `text-xs` | 12 px | **10,8 px** |
| `text-[11px]` | 11 px | 11 px |
| `text-sm` | 14 px | **12,6 px** |
| `text-[13px]` | 13 px | **13 px** ← plus grand que `text-sm` au bureau |
| `text-base` | 16 px | 14,4 px |
| `text-[15px]` | 15 px | 15 px ← plus grand que `text-base` au bureau |
| `h-9` / `h-10` / `h-11` | 36 / 40 / 44 px | 32,4 / 36 / 39,6 px |
| `size-[18px]` | 18 px | 18 px |
| `rounded-lg` / `rounded-xl` | 10 / 14 px | 9 / 12,6 px |

Trois effets, de natures différentes :

**1a. Le téléphone validé à 90 % (catégorie 3, mais c'est la référence du porteur).** Le cadre
téléphone **affiché sur un écran de bureau** hérite du `html` à 90 % : la maquette mobile y est
rendue à **`rem` = 14,4 px dans un cadre de 390 px**, alors qu'un vrai téléphone — et le produit au
téléphone — rendent `rem` = 16 px. **Le porteur a validé les écrans téléphone vus ainsi.**

Vérifié à la racine, `getComputedStyle(html).fontSize` sur chaque mesure :

| Rendu | `html` | Mesures |
|---|---|---|
| Maquette bureau (cadre 1440) | 14,4 px | 204 / 204 écrans |
| Produit `/app` bureau (fenêtre 1440) | 14,4 px | 23 / 23 pages |
| Maquette téléphone **dans la visionneuse de bureau** (ce que le porteur a vu) | **14,4 px** | 204 / 204 |
| Maquette téléphone en **fenêtre de 390 px** (mode « vrai téléphone ») | 16 px | 204 / 204 |
| Produit `/app` téléphone (fenêtre 390) | 16 px | 23 / 23 |

**Au bureau, produit et maquette sont tous deux à 90 % : aucun écart ne vient de là.** Au
téléphone, tout ce qui est en `rem` grandit de 11 % (14,4 → 16) entre le rendu validé et le rendu
réel, et tout ce qui est en `px` ne bouge pas. Sur les 204 écrans téléphone (même DOM des deux
côtés, 31 666 éléments) :

- **Texte** : **39 % des instances de texte (3 586 / 9 306) changent de taille** ; les 59 % écrits
  en px fixes ne changent pas.
- **Classes de mesure rendues** : ~6 300 instances en px fixes (`text-[15px]` 1 705,
  `text-[13px]` 1 614, `text-[11px]` 1 043, `size-[18px]` 490, `text-[10px]` 271, `text-[17px]`
  168, `text-[16px]` 146, `text-[22px]` 101, `w-[2.5px]` 96, `text-[19px]` 88, `min-h-[60px]` 50…),
  plus toutes les bordures (1 px) et les avatars dimensionnés par `style` ; ~31 000 instances en
  rem (`text-sm` 1 987, `size-5` 1 594, `gap-*`, `px-4` 1 317, `rounded-lg` 1 079, `h-11` 924,
  `text-xs` 823, `size-4` 768…).

Les écarts que ce mélange crée — **proportions vues par le porteur → proportions sur un vrai
téléphone** :

| Couple dans la même maquette | Validé (90 %) | Vrai téléphone (100 %) | Effet |
|---|---|---|---|
| `text-sm` (boutons, puces, corps) / `text-[13px]` (méta) | 12,6 / 13 px | **14 / 13** px | **la hiérarchie s'inverse** : le corps passe au-dessus de la méta |
| `text-xs` / `text-[11px]` | 10,8 / 11 | **12 / 11** | idem |
| `text-base` / `text-[15px]` | 14,4 / 15 | **16 / 15** | idem |
| `text-lg` / `text-[17px]` | 16,2 / 17 | **18 / 17** | idem (titres d'en-tête mobile) |
| icône `size-[18px]` dans un bouton `size-9` | 18 / 32,4 px (56 %) | 18 / 36 px (**50 %**) | l'icône paraît plus petite dans sa case |
| icône `size-5` (rem) vs `size-[18px]` (px) côte à côte | 18 / 18 px | **20 / 18** px | deux icônes égales deviennent inégales |
| bordure 1 px autour de `h-11` | 1 / 39,6 px | 1 / 44 px | filet relativement plus fin |
| texte `text-[15px]` dans un champ `h-11` | 15 / 39,6 | 15 / 44 | le texte paraît plus petit dans son champ |
| espacements `gap-*`, `px-4`, `py-*` vs textes px | ×0,9 | ×1 | la page « respire » 11 % de plus autour d'un texte qui, lui, n'a pas grossi (59 % du texte) |
| `rounded-lg` / `rounded-xl` | 9 / 12,6 px | 10 / 14 px | arrondis un peu plus marqués |

**Conséquence pour l'implémentation** : rien n'est neutre. Si la référence est **90 %** (ce que le
porteur a vu), le produit au téléphone devra rendre les valeurs rem de la maquette à ×0,9 — ce que
rien dans le produit ne fait aujourd'hui sous `lg` (`globals.css` l'interdit sous 64rem à cause du
zoom de Safari iOS sur les champs < 16 px). Si la référence est **100 %**, le produit est fidèle au
mode « vrai téléphone » de la visionneuse — mais la maquette doit alors être revue par le porteur
dans ce mode, puisque 39 % de son texte et l'ordre de quatre couples de tailles diffèrent de ce
qu'il a validé. **Question au porteur (déjà portée par la session)** ; mes chiffres du § 3 pour le
téléphone sont pris à 100 % (fenêtre de 390 px), ceux du cadre à 90 % sont dans `vb/*.json`
(`telVis`). Fermeture côté visionneuse, quel que soit le choix : forcer la racine du cadre téléphone
à 16 px (ou `html:has(.maquettes-visionneuse)` à 100 %) pour que vue et produit coïncident — S.

**1b. Deux échelles typographiques qui coexistent dans la maquette.** Au téléphone réel, **59 %
du texte rendu est dans une taille `px` fixe** (13/11/15/17/10/16/22/26/28) ; au bureau, 35 %.
Le produit `/app` (contenu) n'en a presque pas : il vit en `text-xs` / `text-sm`.

**1c. La coque du produit est DÉJÀ en px, la coque de la maquette en rem** — voir § 3.3.

## 2. Inventaire des classes (étape 1)

### 2.1 Comptes par catégorie (statique, toutes approches confondues)

| Catégorie | Maquettes occ. (distinctes) | Produit `/app` occ. (distinctes) |
|---|---|---|
| (a) jetons de couleur DS | 7 894 (255) | 6 920 (274) |
| (b) **valeurs arbitraires** | **3 404 (434)** — 7,3 % de toutes les classes | 999 (344) — 2,7 % |
| (c) palette Tailwind brute | **0** | 9 (5) |
| (c') opacités sur jeton (`/12`, `/[0.07]`) | 1 392 (192) | 807 (177) |
| (d) typographie | 8 365 (67) | 6 037 (79) |
| (d) rayons | 1 735 (31) | 1 530 (29) |
| (d) ombres | 90 (42) | 125 (32) |
| (d) bordures / anneaux | 1 643 (24) | 1 608 (25) |
| espacements | 9 746 (224) | 7 061 (252) |
| dimensions | 5 158 (310) | 3 643 (277) |

**Rendu au navigateur, approches retenues seulement** (instances d'éléments, bureau) : 13 092
classes arbitraires sur 165 200 utilitaires (7,9 %) — le statique ne surestime pas.

### 2.2 Typographie — 30 premières (maquettes) face au produit

| Classe | Maquettes | Produit `/app` | dont DS | Valeur maquette | Jeton le plus proche (tél. / bureau) |
|---|---|---|---|---|---|
| `font-semibold` | 1 199 | 789 | 23 | 600 | = |
| `text-sm` | 1 128 | 1 362 | 52 | 14 / 12,6 | = |
| **`text-[13px]`** | **1 125** | 69 | 1 | 13 / 13 | **aucun** (`text-sm` 14/12,6 ; `text-xs` 12/10,8) |
| `font-medium` | 1 120 | 717 | 28 | 500 | = |
| `tabular-nums` | 769 | 423 | 11 | | = |
| **`text-[15px]`** | **621** | 125 | 0 | 15 / 15 | **aucun** (`text-base` 16/14,4) |
| `text-xs` | 454 | **1 165** | 26 | 12 / 10,8 | = |
| `leading-snug` | 332 | 25 | 5 | 1,375 | = |
| `leading-tight` | 279 | 27 | 2 | 1,25 | = |
| `font-display` | 267 | 208 | 3 | Bricolage | = |
| `tracking-[-0.02em]` | 144 | 21 | 0 | −0,02 em | `tracking-tight` = −0,025 em |
| `text-[11px]` | 115 | 44 | 6 | 11 / 11 | aucun (`text-xs` 12/10,8) |
| `leading-relaxed` | 71 | 36 | 1 | 1,625 | = |
| `font-normal` | 65 | 37 | 1 | | = |
| `text-base` | 61 | 181 | 10 | 16 / 14,4 | = |
| `text-lg` | 54 | 67 | 1 | 18 / 16,2 | = |
| `leading-none` | 51 | 14 | 5 | | = |
| `text-xl` | 48 | 37 | 1 | 20 / 18 | = |
| `text-[17px]` | 48 | 13 | 0 | 17 / 17 | aucun (`text-lg` 18/16,2) |
| `text-2xl` | 41 | 39 | 3 | 24 / 21,6 | = |
| `uppercase` | 40 | **153** | 9 | | = (le produit en fait des sur-titres, la maquette presque jamais — § 5) |
| `tracking-[-0.01em]` | 34 | 4 | 0 | −0,01 em | aucun |
| `text-[22px]` | 30 | 3 | 0 | 22 | aucun (`text-2xl` 24/21,6) |
| `text-[16px]` | 26 | 3 | 0 | 16 / 16 | `text-base` au tél. seulement |
| `text-[28px]` | 20 | 5 | 0 | 28 | aucun (`text-3xl` 30/27) |
| `text-[26px]` | 17 | 5 | 0 | 26 | aucun |
| `text-[10px]` | 15 | 17 | 2 | 10 | aucun (le produit l'a, pastille d'onglet) |
| `tracking-[0.08em]` | 14 | 0 | 0 | 0,08 em | aucun (`wider` 0,05 / `widest` 0,1) |
| `font-sans` | 14 | 15 | 1 | | = |
| `tracking-[-0.025em]` | 13 | 0 | 0 | −0,025 em | **`tracking-tight` exactement** |

### 2.3 Valeurs arbitraires — 30 premières, et leur jeton

| Classe | Maquettes | Produit | Équivalent existant (valeur tél. / bureau) | Verdict |
|---|---|---|---|---|
| `text-[13px]` | 1 125 | 69 | aucun | **jeton à créer ou réécriture** (§ 8) |
| `text-[15px]` | 621 | 125 | aucun | idem |
| `size-[18px]` | 234 | 23 | `size-4.5` = 18 / **16,2** (rem) | garder px : le produit écrit `size-[18px]` lui-même (`styles-de-la-barre.ts`, `ICONE_DE_LIGNE`) → jeton d'icône |
| `tracking-[-0.02em]` | 144 | 21 | `tracking-tight` −0,025 em | écart 0,1 px/glyphe à 22 px : invisible → **remplacer par `tracking-tight`** |
| `text-[11px]` | 115 | 44 | aucun | jeton ou `text-xs` (+1 px au tél.) |
| `text-[17px]` | 48 | 13 | aucun | jeton (titre d'en-tête mobile) |
| `tracking-[-0.01em]` | 34 | 4 | aucun | `tracking-tight` (0,15 px de plus à 15 px) |
| `text-[22px]` | 30 | 3 | aucun | à trancher |
| `text-[16px]` | 26 | 3 | `text-base` au tél., pas au bureau | |
| `min-h-[900px]` | 25 | 0 | — | **artefact** : hauteur de page dans le cadre bureau |
| `text-[28px]` | 20 | 5 | aucun | |
| `bg-foreground/[0.07]` | 17 | 0 | `bg-foreground/7` (Tailwind 4 accepte tout entier) | réécriture triviale ; le produit pose `/8` à la même place |
| `text-[26px]` | 17 | 5 | aucun | |
| `text-[10px]` | 15 | 17 | aucun | garder (pastille, le produit fait pareil) |
| `min-h-[60px]` | 15 | 0 | `min-h-15` (rem) | |
| `tracking-[0.08em]` | 14 | 0 | aucun | |
| `w-[300px]` | 13 | 1 | `w-75` (rem : 300/270) | gabarit de colonne : px voulu ? |
| `tracking-[-0.025em]` | 13 | 0 | `tracking-tight` | identique |
| `tracking-[-0.03em]` | 12 | 6 | aucun | |
| `w-[320px]` | 12 | 0 | `w-80` (320/288) | |
| `w-[480px]` | 10 | 0 | `w-120` | |
| `h-[72px]` | 10 | 0 | `h-18` | |
| `bg-destructive/[0.06]` | 10 | 0 | `bg-destructive/6` | |
| `text-[40px]` | 9 | 2 | aucun | |
| `border-[1.5px]` | 9 | 0 | aucun (Tailwind : 0/1/2/4/8) | à trancher |
| `min-h-[64px]` | 9 | 0 | `min-h-16` | |
| `w-[340px]` | 9 | 1 | `w-85` | |
| `aspect-[4/3]` | 9 | 4 | `aspect-4/3` | réécriture |
| `text-[32px]` | 9 | 1 | aucun | |
| `text-[34px]` / `text-[30px]` | 8 / 8 | 0 / 2 | `text-3xl` = 30 au tél. | |

Liste complète, avec fichier:ligne de chaque valeur arbitraire : `jetons/stat-maquettes.json`
(clé `lieux`). Exemples : `text-[13px]` `pages/app/app-pipeline-ecrans.tsx:82`, `text-[15px]`
`app-pipeline-ecrans.tsx:92`, `size-[18px]` `app-visites-pieces.tsx:63`, `border-[1.5px]`
`app-visites-a-mobile.tsx:668`.

### 2.4 Opacités, rayons, ombres, bordures — 30 premières (résumé)

| Classe | Maquettes | Produit | Remarque |
|---|---|---|---|
| `text-foreground/80` | 137 | 2 | **échelle d'encres intermédiaires absente du produit** |
| `text-foreground/85` | 115 | 0 | idem (17 % des encres rendues au bureau : barre latérale) |
| `text-foreground/75` | 67 | 0 | idem |
| `text-foreground/70` | 66 | 2 | idem |
| `border-border/70` / `divide-border/70` | 80 / 38 | 9 / 0 | filets adoucis |
| `bg-accent/15` | 53 | 1 | ⚑ charte : l'accent sage est réservé aux badges *featured* |
| `bg-success/15`, `/12` | 30 / 12 | 7 / — | ⚑ charte : plafond `/10` |
| `bg-warning/20`, `/15` | 9 / 9 | — / 3 | ⚑ idem (`attention` = `/12`) |
| `bg-destructive/12` (dans `Statut`) | via `chrome-app.tsx:633` | 0 | ⚑ plafond `/10`, gardé par `check-destructive-contrast.mjs` |
| `text-muted-foreground/70` | 17 | 1 | ⚑ **3,03:1 sur `--card`**, sous AA |
| `rounded-full` / `-xl` / `-lg` / `-2xl` / `-md` | 554 / 424 / 402 / 128 / 93 | 323 / 446 / 299 / 127 / 154 | mêmes jetons |
| `border` / `divide-y` / `border-t` / `border-b` | 749 / 276 / 234 / 180 | 473 / 57 / 91 / 68 | mêmes |
| `ring-2` / `ring-1` | 28 / 17 | 199 / 87 | le produit dessine ses contours de carte en anneau (§ 5) |
| `shadow-sm` | 22 | 49 | ombre Tailwind par défaut (noir 10 %) des deux côtés |
| `shadow-2xl` | **10** | 0 | ⚑ charte : « jamais de `shadow-2xl` sur un élément courant » |
| `shadow-[…color-mix(in_oklab,var(--shadow-color)…)]` | 85 `in_oklab` / 5 `in_srgb` | forme `in_srgb` | ⚑ la charte prescrit `in_srgb` ; 42 ombres distinctes, aucune factorisée |

## 3. Ce que chaque échelle rend réellement (étapes 2 et 3)

### 3.1 Texte rendu — contenu des pages

Part des instances de texte par taille calculée (famille DM Sans sauf mention) :

| Taille | Maquette **téléphone** (204 écrans) | Produit `/app` téléphone (23 pages, `main`) | Maquette **bureau** (204 écrans) | Produit `/app` bureau (23 pages, `main`) |
|---|---|---|---|---|
| 10,8 px (`text-xs` bureau) | — | — | 18 % | **54 %** |
| 11 px | 11 % | 2 % | 7 % | 0,1 % |
| 11,52 px (`Button sm` `text-[0.8rem]`) | — | — | — | 9 % |
| 12 px (`text-xs` tél.) | 9 % | **53 %** | 1 % | — |
| 12,6 px (`text-sm` bureau) | — | — | **41 %** | 32 % |
| 12,8 px (`Button sm` tél.) | — | 6 % | — | — |
| 13 px | **19 %** | 0 | **19 %** | 0 |
| 14 px (`text-sm` tél.) | 27 % | 34 % | — | — |
| 15 px | **19 %** | 0 | 6 % | 0 |
| 16 px et + | 10 % | 5 % | 5 % | 3 % |

Lecture : **au téléphone, le produit vit à 12 px pour plus de moitié ; la maquette à 13-15 px pour près
de 40 %.** Au bureau, le produit est à 10,8 px pour plus de moitié ; la maquette à 12,6-13 px pour 60 %.
L'implémentation fidèle **grossira visiblement le texte de `/app`** — c'est le premier écart
qui se verra, et il est voulu par la maquette.

Graisses : maquette bureau 400/500/600 = 53/24/23 %, 700 ≈ 0 ; produit 49/30/20 %, **700 = 2 %**
(titres de page et chiffres-clés en gras, cf. 3.2).

### 3.2 Titres

| | Maquette (calculé) | Produit (calculé) | Écart |
|---|---|---|---|
| h1 de page, bureau | Bricolage **21,6 px / 28,8 · 600 · −0,432 px** (−0,02 em) — 171 écrans | `PageHeader` : Bricolage 21,6 / 28,8 · **700 · −0,54 px** (−0,025 em) — `console/PageHeader.tsx:60` | graisse 600 ↔ 700 (visible) ; approche 0,1 px |
| h1 de page, téléphone | Bricolage **20 px / 28 · 600** (69 écrans) ; 24-28 px sur les écrans d'entrée | Bricolage **24 px / 32 · 700** | **−4 px** et une graisse en moins |
| Titre de carte (h2) | DM Sans **15 px / 22,5 · 600** (`Carte`, `chrome-app.tsx:700` ; 181 au bureau) | DM Sans 12,6 px · 600 (`h3` de cartes, 58) ou 16,2 px · **700** | famille identique, taille ≠ |
| Titre de section mobile | DM Sans 13 px · 600 (49) ; Bricolage 18 px · 600 (45) | DM Sans 14 px · 600 | |
| Chiffre-clé | Bricolage `text-2xl` 600 −0,02 em (`Chiffre`, `chrome-app.tsx:714`) | `StatCard` : Bricolage `text-2xl` **600** ✓ ; mais d'autres tuiles en **DM Sans 21,6 px 700** (« 214 », « 95 202 604 F CFA ») | famille et graisse sur les tuiles hors `StatCard` |
| Libellé de chiffre-clé | `text-[13px]` muted, casse normale | `StatCard` : `text-xs uppercase tracking-[0.12em]` (`StatCard.tsx:59`) | **visible** : sur-titre capitales ↔ libellé |

### 3.3 La coque : le produit est en px, la maquette en rem

| Élément | Maquette (`chrome-app.tsx`) | Produit (`layout/styles-de-la-barre.ts`) | Bureau, calculé |
|---|---|---|---|
| Ligne de menu | `text-sm` (l. 273) | `text-[14px]` (`STYLE_LIGNE`) | **12,6 px ↔ 14 px** |
| Titre de groupe | `text-xs`, 400 (l. 259) | `text-[12.5px] font-medium` (`STYLE_TITRE`) | **10,8 px 400 ↔ 12,5 px 500** |
| Compteur | `text-xs font-semibold text-primary` (l. 277) | `text-[12.5px] font-medium text-primary-deep` (`STYLE_COMPTEUR`) | 10,8 ↔ 12,5 px ; ⚑ `text-primary` sur le voile actif = 4,10:1, corrigé en `primary-deep` par TCK-2490 |
| Encre de repos | `text-foreground/85`, icône `text-muted-foreground` | `text-foreground` | plus pâle |
| Fond actif | `bg-foreground/[0.07]` | `bg-foreground/8` | 1 point d'alpha |
| Icône | 18 px, **trait 1,5** | 18 px, **trait 1,75** (`TRAIT_D_ICONE`) | |
| Hauteur de ligne | `h-9` = 32,4 px | `h-9` = 32,4 px | = |

Le texte de la barre rendu : produit 60 % à **14 px**, maquette à 12,6 px. **La coque est le seul
endroit où le produit est plus grand que la maquette.**

## 4. Couleurs et pastilles (étape 4)

- Jetons hérités tels quels (cf. § 0). Les 7 couleurs d'encre/fond les plus rendues sont les
  mêmes des deux côtés (`#1f1812`, `#6e655a`, `#ffffff`, `#f1ece0`, `#a85332`, `#f3ead8`,
  `#fcf9f3`).
- **Encres intermédiaires** : la maquette rend `foreground/85` sur 17 % des textes au bureau
  (barre latérale surtout), et 385 occurrences `foreground/70→85` au total. Le produit n'en a pas
  (2 + 2). Contraste correct (6,3 à 11:1), mais aucun jeton ne les nomme.
- **La pastille de statut** (`Statut`, `chrome-app.tsx:626`, 161 emplois) diverge de
  `console/StatusBadge.tsx:132` sur **toutes** ses dimensions :

| Ton | Maquette | Produit (`StatusBadge`) | Contraste maquette (pire surface) |
|---|---|---|---|
| succès | `bg-success/15 text-success` | `bg-success/10` | 4,29:1 sur `--muted` ✗ |
| attention | `bg-warning/20 text-foreground` | `bg-warning/12 text-warning` | 11,3:1 (encre ≠) |
| danger | `bg-destructive/12` | `bg-destructive/10` | 4,74:1 ; ⚑ dépasse le plafond `/10` de TCK-480 |
| info | **`bg-accent/15 text-accent`** | `bg-info/10 text-info` | **3,88:1 sur `--muted`, 4,31:1 sur `--background`** ✗ AA |
| neutre | `bg-muted text-foreground/75` | `bg-muted text-muted-foreground` | 7,07:1 |
| hauteur | `h-6` = 24 px tél. | `h-auto py-0.5 text-xs` ≈ 20 px | +4 px |

- **Bordure des champs** : la maquette dessine ses 90 `Champ` (et 126 champs-like `h-11 … border`)
  en **`border-border` `#ebe5d5`** (`chrome-app.tsx:738`) ; le produit en **`border-input`
  `#918672`** (`ui/input.tsx:20`, `ui/select.tsx:55` ; 141 bordures `rgb(145,134,114)` rendues au
  bureau). **Très visible** : contour taupe foncé ↔ filet sable. Le filet sable rend ~1,2:1 sur
  blanc — sous les 3:1 de WCAG 1.4.11 pour la limite d'un champ ; c'est sans doute pourquoi le
  produit a `--input`. ⚑ décision du porteur.
- **Contour de carte** : maquette `border border-border` (`Carte`, `chrome-app.tsx:697`) ;
  produit `ring-1 ring-foreground/10` (`ui/card.tsx:15`) — même 1 px, teinte froide 10 % ↔ sable.

## 5. Composants : les hauteurs et tailles qui sortent de l'échelle de la charte

| | Maquette (`chrome-app.tsx`) | Produit / charte (TCK-2460) |
|---|---|---|
| Bouton normal | `h-9 px-3.5 text-sm` (l. 362), 369 emplois | `Button` défaut **`h-10`** px-3.5 `text-sm` |
| Bouton petit | `h-8 px-3 text-[13px]`, 68 | `sm` : `h-8 px-2.5 text-[0.8rem]` (12,8 / 11,52 px) |
| Bouton grand | **`h-12` px-5 `text-[15px]`**, 145 | `lg` : **`h-11`** px-4 |
| Champ | `h-11 text-[15px]` | `h-10 text-base` en console, `h-11` en `fieldDensityScope` |
| Chiffre-clé | libellé `text-[13px]`, casse normale | `StatCard` : capitales `tracking-[0.12em]` |
| Avatar | taille en **`style={{width}}`** px, police `taille × 0,36` (`chrome-app.tsx:721`) → 7 à 9 px dans les petits avatars | — |

(Le détail des composants revient à l'agent des composants ; ces lignes sont là parce qu'elles
sont des **jetons de taille**.)

## 6. Formats (étape 5)

Relevé au navigateur (Chrome, `Intl` `fr-SN`, police DM Sans 500 14 px, `measureText`) :

| Valeur | Maquette | Produit (`useFormatteurs`) | Largeur maquette → produit |
|---|---|---|---|
| Montant | `fcfa()` (`donnees.ts:13`) : « 1 355 000 F » (U+202F, U+202F, puis espace normale) — **430 appels** ; **274 montants écrits en dur** avec des **espaces ordinaires U+0020** ; 64 « 3,9 M F » / « 350 k F » ; 19 « F CFA » | `montant()` → `formatMontant` : « 1 355 000 **F CFA** » (`lib/format/currency.ts`, `CURRENCY_METADATA.XOF.symbol`) | 73,9 px → **103,6 px (+40 %)** ; le montant en dur : 77,4 px, **et sécable** (U+0020 peut couper « 1 500 / 000 F ») |
| Date | « 4 nov. » sans année — **785** ; « 4 déc. 2026 » — 140 ; « jj/mm/aaaa » 8 | `date()` défaut `dateStyle: medium` → « 4 nov. 2026 » ; `DATE_COURTE` → « **04** nov. 2026 » | 38,5 px → 76,5 px (×2) ou 86,2 px |
| Heure | « 09:00 » — **431** ; « 9 h 00 » — **42** (incohérence interne) | `Intl` `timeStyle: short` → « 10:30 » | = pour hh:mm |
| Pourcentage | « 87% » collé — **168** ; « 87 % » espace normale — 109 | `style: percent` → « 87 % » (U+00A0) | 27,3 → 30,9 px |
| Relatif | « il y a 6 », « Demain », « aujourd'hui » — 367 | `formatRelative` existe (`lib`) | à vérifier au cas par cas |

Il n'existe **aucun préréglage** « jour + mois abrégé » dans `useFormatteurs` (seulement
`DATE_COURTE` avec année, et 4 appels locaux `{ day: 'numeric', month: 'short' }` dispersés), ni
de forme courte du montant (« F » seul, « 3,9 M F »). Sans eux, **chaque cellule de montant et de
date sera plus large que la maquette**, et des colonnes de tableau calibrées en px (`w-[170px]`…)
déborderont ou passeront à la ligne.

## 7. Icônes (étape 6)

| | Maquette téléphone | Maquette bureau | Produit contenu (`main`) | Produit coque |
|---|---|---|---|---|
| Trait | **1,75 : 52 %** · 2 : 30 % · 1,5 : 9 % | **1,5 : 49 %** · 2 : 25 % · 1,75 : 17 % | **2 : 100 %** (défaut lucide) | 1,75 : 81 % (barre) ; barre d'onglets mobile : 2 |
| Taille dominante | 20 px (`size-5`), 16, 18 | **18 px** (`size-[18px]`, px), 14,4, 12,6 | 12,6 (`size-3.5`), 14,4 (`size-4`) | 18 px |

Source : `strokeWidth={1.75}` ×472 et `{1.5}` ×152 dans les maquettes, contre 9 et 8 dans tout le
produit. **Au téléphone, les icônes du contenu du produit sont plus petites (12-16 px) et plus
épaisses (2) que celles de la maquette (16-20 px, 1,75)** — visible sur chaque ligne de liste.
La barre d'onglets mobile de la maquette trace en 1,75 (`chrome-app.tsx:560`), celle du produit
en 2 (`BarreDOnglets.tsx:133`, pas de `strokeWidth`).

## 8. Synthèse — écarts priorisés et ce qu'il faut ajouter au design system

### 8.1 Écarts, du plus visible au moins visible

| # | Écart | Cat. | Pages | Fermeture proposée | Effort |
|---|---|---|---|---|---|
| 1 | **Échelle typographique** : 13/15/11/17 px (≈ 40 % du texte téléphone) n'existent pas au DS ; le produit vit en 12 px (tél.) / 10,8 px (bureau) | 1 | 33/33 | jetons `--text-*` en **px** (8.2) ; **interdire** `text-[Npx]` dans le code des tickets | M |
| 2 | **Téléphone validé à 90 % (`rem` = 14,4 px)** alors que le téléphone réel rend 16 px : 39 % des tailles de texte changent, quatre couples rem/px s'inversent (§ 1a) | 3 | 33/33 | **question au porteur : référence 90 % ou 100 %** ; puis racine du cadre alignée sur la référence | S |
| 3 | **Bordure des champs** `--border` ↔ `--input` | 2 | tout formulaire (90 `Champ` + 126 champs à la main) | décision porteur : charte (`--input`, 3:1) ou maquette | S |
| 4 | **Pastille de statut** : tons /15-/20, `accent` pour info (3,88:1 ✗), h-6 | 2 | 161 emplois | réécrire `Statut` sur `StatusBadge` ; si le porteur veut 24 px, une taille au composant, pas une classe | S |
| 5 | **Titre de page** 600 ↔ 700, 20 ↔ 24 px au téléphone | 2 | 33/33 | décision : la charte dit 700 ; la maquette est unanime à 600 | S |
| 6 | **Coque** : maquette en `rem` (12,6 px) ↔ produit en px (14 px), titres 10,8 ↔ 12,5, trait 1,5 ↔ 1,75, compteur `primary` ↔ `primary-deep` | 1+2 | toutes | aligner la maquette sur `styles-de-la-barre.ts` (le produit a raison sur le contraste) | S |
| 7 | **Icônes** : trait 1,75/1,5 ↔ 2 ; tailles 18-20 ↔ 12,6-16 | 1 | toutes | jeton de trait + jeton de taille d'icône (8.2) | M |
| 8 | **Formats** : « F » ↔ « F CFA » (+40 %), date sans année ↔ avec (×2), espaces sécables en dur, « 87% » ↔ « 87 % », « 09:00 » ↔ « 9 h 00 » | 1+2 | 1 300+ valeurs (§ 6) | préréglages `useFormatteurs` (8.3) ; décision « F » / « F CFA » | M |
| 9 | Boutons `h-9`/`h-12` ↔ `h-10`/`h-11` ; champs `h-11 text-[15px]` ↔ `h-10 text-base` | 2 | toutes | aligner sur TCK-2460 ou étendre l'échelle par décision | S |
| 10 | Libellés de chiffres-clés : casse normale ↔ capitales espacées | 2 | tableaux de bord | décision ; une prop de `StatCard` | S |
| 11 | Encres `foreground/70→85` (385 occ.), `bg-foreground/[0.07]` | 1 | toutes | un jeton d'encre douce, ou ramener à `foreground`/`muted-foreground` | S |
| 12 | Contour de carte `border-border` ↔ `ring-foreground/10` | 1 | toutes | choisir un des deux dans `Card` | S |
| 13 | Ombres : 42 littérales distinctes en `in_oklab`, `shadow-2xl` ×10 | 2 | 10 dialogues/tiroirs | 3-4 jetons d'ombre nommés, `in_srgb` | S |
| 14 | Texte < 12 px : 11 px = 11 % du texte téléphone, 7-9 px dans avatars et vignettes de document | 2 | toutes (pastilles), documents, pipeline, visites | décision ; les vignettes sont des illustrations (tolérable) | S |
| 15 | `tracking-[-0.02em]`/`[-0.01em]`/`[-0.025em]` (191 occ.) | 1 | toutes | `tracking-tight` (écart ≤ 0,15 px/glyphe, invisible) | S |

### 8.2 Ce qu'il faudrait ajouter au design system (pour zéro valeur arbitraire)

Tailwind 4 lit `--text-*`, `--tracking-*`, `--spacing-*` dans `@theme` : chaque jeton ci-dessous
produit une classe nommée (`text-ui`, `size-icone`…) **sans** crochets. **L'unité est la décision
clé** : la maquette a été rendue avec des px qui **ne suivent pas** les 90 % du bureau (TCK-635) ;
pour être identique au pixel, les jetons doivent être en **px**, pas en rem.

```css
@theme inline {
  /* Échelle intermédiaire de la partie connectée — px, hors TCK-635, comme la maquette */
  --text-legende: 11px;   --text-legende--line-height: 1.5;   /* text-[11px]  115 occ. */
  --text-ui: 13px;        --text-ui--line-height: 1.5;        /* text-[13px] 1125 occ. */
  --text-corps: 15px;     --text-corps--line-height: 1.5;     /* text-[15px]  621 occ. */
  --text-titre-mobile: 17px;                                   /* text-[17px]   48 occ. */
  /* + 22/26/28/32/40 si le porteur les garde (≈ 100 occ., écrans d'entrée et chiffres) */
  --spacing-icone: 18px;                                       /* size-[18px]  234 occ. → size-icone */
}
```

L'interligne 1,5 reproduit exactement le rendu mesuré (13 px → 19,5 px). Une alternative sans
jeton neuf existe — réécrire les maquettes en `text-xs/sm/base` — mais elle **change** ce que le
porteur a vu (13 → 14 px au tél., → 12,6 au bureau) : c'est le contraire du besoin.

À ajouter ailleurs :
- **Trait d'icône** : une constante unique (le produit a `TRAIT_D_ICONE = 1.75` dans
  `styles-de-la-barre.ts`) promue au DS, et choisie : 1,75 (téléphone de la maquette, coque du
  produit) ou 1,5 (bureau de la maquette). Rendue par défaut si lucide-react 1.31 offre un
  fournisseur de contexte (à vérifier), sinon par un composant d'icône.
- **Encre douce** : `--foreground-doux` = `foreground` 80 %, ou rien (et la maquette passe à
  `foreground` / `muted-foreground`).
- **Ombres nommées** : `shadow-flottant`, `shadow-feuille`, `shadow-bouton-photo` à partir des
  trois formes les plus rendues (`0 -6px 16px -12px …40%`, `0 1px 0 …22%`, `0 2px 8px -2px …35%`),
  en `in_srgb`.
- **Formats** (§ 8.3).

**Classes à bannir dans le code des tickets** (pas dans les maquettes, qui sont jetables) :
`text-[Npx]`, `tracking-[…]`, `size-[18px]` hors jeton, `bg-*/[0.0N]` (écrire `/N`),
`shadow-[…]` hors jeton, `shadow-2xl`, `text-muted-foreground/70`, `bg-accent/*` pour un statut.
Une garde du type `check-classes-emises.mjs` restreinte à `src/app/(dashboard)` et aux composants
qu'elle importe le tiendrait.

### 8.3 Préréglages de format à ajouter à `useFormatteurs`

| Préréglage | Sortie | Remplace (maquette) |
|---|---|---|
| `montant(v, { court: true })` ou symbole par contexte | « 1 355 000 F » | 430 `fcfa()` + 274 en dur |
| `montantAbrege(v)` | « 3,9 M F », « 350 k F » | 64 + 15 `fcfaCourt` (existe en `formatPriceShort`, suffixe « M »/« K » sans « F ») |
| `DATE_JOUR_MOIS` | « 4 nov. » | 785 |
| `heure(v)` | « 09:00 » | 431 (et trancher contre les 42 « 9 h 00 ») |
| `pourcentage(v)` | « 87 % » (U+00A0) | 277 — la maquette doit suivre, pas l'inverse |

Plus une règle pour les tickets : **aucun montant, date ou pourcentage écrit en dur** ; les
espaces des montants sont U+202F, insécables.

### 8.4 Endroits où la maquette dévie de `docs/design-guidelines.md`

| Règle de la charte | Ce que fait la maquette | Où |
|---|---|---|
| Titres de page en graisse 700 | 600 partout (h1 Bricolage 600) | `chrome-app.tsx:335` (`TeteDePage`) |
| `tracking-tight` pour les titres | `tracking-[-0.02em]` (144) ⚑ et la charte se trompe elle-même : « `tracking-tight` (≈ −0.01em) » — il vaut −0,025 em en Tailwind 4 | |
| Jamais de texte < 12 px sauf sur-titre 11 px capitales | 11 px en casse normale (11 % du texte tél.), 10 px pastilles, 7-9 px avatars et vignettes | `chrome-app.tsx:247`, `:721` |
| Pastille : `/10` plafond, `attention` `/12` | `/15`, `/20`, `/12` | `chrome-app.tsx:631-635` |
| `--accent` réservé aux *featured* ; info = `--info` | `bg-accent/15 text-accent` (53) pour info et avatars | `chrome-app.tsx:635`, `:498` |
| Pas de `p-[13px]` : « espacements standard, pas de valeurs arbitraires » | 3 404 valeurs arbitraires | § 2.3 |
| Jamais de `shadow-2xl` sur un élément courant | ×10 (dialogues, tiroirs, feuilles) | `chrome-app.tsx:578`, `app-documents-a.tsx:266`… |
| Ombre : `color-mix(in_srgb,var(--shadow-color)…)` | `in_oklab` ×85 | `kit.tsx` (`BoutonSurPhoto`)… |
| Bouton : défaut `h-10`, `sm` `h-8`, `lg` `h-11` (TCK-2460) | `h-9` / `h-8` / `h-12` | `chrome-app.tsx:362` |
| Champ : `h-10` console, `h-11` assistants ; jamais de `h-*` posé par l'appelant | `h-11` partout, bordure `--border` | `chrome-app.tsx:738` |
| Compteurs de la barre en `text-primary-deep` (TCK-2490, contraste) | `text-primary` | `chrome-app.tsx:277` |

## 9. Fichiers de travail

Tous sous
`/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/3de0dbe2-6577-4dfc-90f8-6e771de7f201/scratchpad/fidelite/jetons/` :

- `classes_statiques.py` — inventaire statique (`python3 -I classes_statiques.py sortie.json <dossiers…>`)
- `stat-maquettes.json`, `stat-produit-ds.json`, `stat-produit-app.json` — comptes complets, top 400 par catégorie, fichier:ligne des valeurs arbitraires
- `collecte.js` + `balaye.mjs` — un Chrome jetable, plusieurs pages, styles calculés (respecte les créneaux de `capture.mjs`)
- `vb/` (33 pages × bureau + cadre téléphone), `tel/` (204 écrans en vrai téléphone), `app/` (23 + 23 pages réelles)
- `analyse.py` → `analyse.json`, `analyse.txt` ; `histos.py` (traits, graisses, encres, fonds, rayons)
- `intl.js` / `intl.json` — formats et largeurs relevés dans Chrome
