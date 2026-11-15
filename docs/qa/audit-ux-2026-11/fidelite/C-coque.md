Annexe de [la synthèse](../fidelite-au-pixel.md) — relevé du 2026-11-10 ; les chemins `/private/tmp/…` désignent les relevés bruts de la session, non versionnés.

# C — La coque et la mise en page : maquettes de `/app` comparées au produit (relevé du 2026-11-10)

Relevé fait **au navigateur** des deux côtés (Chrome headless jetable, `cap.mjs` = `capture.mjs` +
`--width/--height`), machine à charge 1,3 à 3,9 sur 8 cœurs. Maquettes : seules les approches
**retenues**. Produit : comptes de démo `admin`, `agent`, `proprietaire` (persona bailleur) et
`locataire`, sur `/app` et `/app/leads`.

Dossier de travail : `/private/tmp/claude-501/-Users-aminethiam-Documents-perso-takussan/3de0dbe2-6577-4dfc-90f8-6e771de7f201/scratchpad/fidelite/coque/`.
On y trouve :

- `p-<persona>-app-<largeur>.json/.png` : 21 relevés du produit (390, 768, 1000, 1024, 1280, 1440) ;
- `m-coque-e*-*.json` : la coque des maquettes ;
- `balayage/bureau-tout.json` et `balayage/tel-tout.json` : 204 écrans retenus × (1440, 1280, 1024) et 390 ;
- `agregat-bureau.md` : la table par page ;
- `cote/` : les captures côte à côte, à taille réelle ;
- `isoler-bureau*.js`, `isoler-tel.js` : la méthode pour sortir une maquette de la visionneuse à taille réelle.

---

## 0. Ce qui compte le plus, en six lignes

1. **La visionneuse ne montre jamais une maquette à sa taille réelle.** Elle applique deux distorsions, et l'œil du porteur s'est fait sur les deux (§ 1).
   - **Le bureau est réduit à 73 %** dans une fenêtre de 1440.
   - **Le téléphone est rendu avec un `rem` de 14,4 px**, et non de 16 : la règle « 90 % dès `lg` » de `globals.css` s'applique à la visionneuse. Son en-tête mesure donc 50,4 px au lieu de 56, et sa barre d'onglets 57,6 au lieu de 64. Les valeurs en px, elles, ne bougent pas : la maquette « téléphone » vue au bureau est **déformée**, pas seulement réduite.
2. **Les maquettes « bureau » ne définissent qu'une largeur : 1440.**
   - On ne trouve qu'**une** classe responsive (`lg:`) dans les 82 fichiers de `pages/app`.
   - Contenu dessiné : 1110 px utiles. Produit : 1125 px à 1440, mais **965 à 1280** et **709 à 1024**.
   - Simulation faite en rétrécissant la maquette elle-même, sur 170 écrans de bureau dans la coque :
     - à **1280**, 55 écrans sur 170 (**18 pages sur 29**) se dégradent ;
     - à **1024**, 102 écrans sur 170 (**26 pages sur 29**) se dégradent, dont 46 avec un débord horizontal allant jusqu'à 360 px.
   - Côté tickets : 50 disent « Bureau (≥ 1280 px) », **un seul** nomme 1024, **aucun** nomme 768 (§ 3).
3. **Téléphone : l'enveloppe de contenu du produit (`px-4 py-6`) contredit la maquette.**
   - Dans les maquettes, chaque page porte sa propre marge, et 62 écrans sur 172 dans la coque ont des éléments **bord à bord** : filets, puces collantes, rangées de liste.
   - Aucun ticket ne retire cette enveloppe (§ 2.3).
4. **Écarts de coque visibles qu'aucun ticket ne couvre** :
   - barre d'onglets à 56 px (maquette : 64), interligne de 2 px (maquette : 4), trait d'icône 2 (maquette : 1,75) ;
   - icônes de l'en-tête à 18 px en gris (maquette : 20 px, encre à 80 %) ;
   - au bureau, titre de page en graisse 700 (maquette : 600), marge de contenu de 21,6 px (maquette : 28,8) ;
   - icônes de la colonne en encre pleine (maquette : grises) ;
   - avatar du compte en encre pleine (maquette : olive clair) ;
   - texte de la colonne en 14 px (maquette : 12,6), titres de groupe en 12,5 px (maquette : 10,8). C'est une décision de la charte, à trancher (§ 2).
5. **TCK-2617, 2618 et 2619 couvrent la *structure*** de la coque : titre en tête, flèche unique, plein écran, onglets par persona, tiroir sans punaises, lignes de 44 px. **Ils ne couvrent presque aucune *cote*.**
   - Contradiction : TCK-2617 fixe la barre d'action collante à **64 px**, alors que la maquette la rend à **73 px** sur 49 écrans (§ 5).
6. **Largeurs de référence à imposer** (§ 6) :
   - **390 × 844 à `rem` 16** et **1440 × 900 à `rem` 14,4** pour la comparaison au pixel ;
   - **1280, 1024 et 768** pour une règle de non-dégradation, qui reste à écrire : la maquette n'en dit rien.

---

## 1. La visionneuse : à quelle taille rend-elle vraiment ?

Source : `Visionneuse.tsx`.

- Le téléphone vit dans un cadre de **390 × 844**, avec une bordure de 10 px et des coins arrondis à 50 et 40 px. Il est mis à l'échelle par `transform: scale(min(1, (h−32)/864, (l−32)/410))` (l. 882-908).
- Le bureau vit dans un cadre de **1440 px de large**, sous une **fausse barre d'adresse** (`h-9`). Il est mis à l'échelle par `scale(min(1, (l−48)/1440))` (l. 910-931).
- Il n'y a ni fausse barre d'état, ni encoche.
- Le bureau ajoute un plancher : `CoqueBureau` est en `min-h-[900px]`.

### 1.1 Valeurs relevées

| Vue | Fenêtre | `rem` de la page | Échelle appliquée | En-tête téléphone | Barre d'onglets | Titre (en-tête) | Catégorie |
|---|---|---|---|---|---|---|---|
| « Téléphone » | 1440 × 900 | **14,4 px** | **0,896** | **50,4 px** | **57,6 px** | **18 px** | (3) artefact |
| Visionneuse ouverte sous 768 (`VueTelephoneReel`) | 390 × 844 | 16 px | 1 | 56 px | 64 px | 20 px | **référence** |
| « Bureau » | 1440 × 900 | 14,4 px | **0,731** | — | — | H1 21,6 px | (3) artefact (échelle) |
| « Bureau » | 1920 × 1200 | 14,4 px | 0,904 | — | — | H1 21,6 px | (3) |
| « Bureau » isolé (`isoler-bureau.js`) | 1440 × 900 | 14,4 px | 1 | — | — | H1 21,6 px | **référence** |

Fichiers : `m-coque-e1-tel-dans-1440.json`, `m-coque-e1-tel-390.json`, `m-coque-e1-bureau-dans-1440.json`, `m-coque-e1-bureau-1920.json`.

### 1.2 Ce que ces mesures impliquent

- **La racine à 90 % dès 1024 px** (`globals.css:806`, TCK-635) vaut pour toute page, la visionneuse comprise.
  - **Au bureau, c'est une chance** : le cadre « bureau » est rendu au même `rem` (14,4) que le produit dès 1024. Les deux côtés se comparent donc terme à terme.
  - **Au téléphone, c'est un piège** : dans une fenêtre de bureau, le cadre de 390 px est rendu à `rem` 14,4, alors qu'un vrai téléphone est à 16. Tout ce qui est en `rem` y perd 10 % : `h-14`, `text-sm`, `px-4`, `size-5`… Tout ce qui est en px garde sa taille : `h-[72px]`, `text-[15px]`, `size-[18px]`… Les proportions vues par le porteur au bureau **ne sont celles d'aucun appareil réel**.
- **Relevé du `rem` des deux côtés** (`fontSize` calculée de `html`) :

  | Ce qui est rendu | Fenêtre | `rem` | Mesures du cadre téléphone |
  |---|---|---|---|
  | Cadre « Téléphone » de la visionneuse | 1440 | **14,4** | en-tête 50,4 · `pl-4` = 14,4 · `pr-1.5` = 5,4 · onglets 57,6 |
  | Visionneuse ouverte SUR un téléphone | 390 | **16** : elle échappe au 90 % | en-tête 56 · 16 · 6 · onglets 64 |
  | Maquette « Bureau » isolée | 1440 et 1024 | 14,4 | — |
  | `/app` réel | 1024, 1280, 1440 | 14,4 | — |
  | `/app` réel | 390, 768, 1000 | 16 | — |

  Les maquettes de bureau et `/app` au bureau sont donc **tous deux à 90 %**. Seul le cadre téléphone vu au bureau en hérite à tort. Une question reste posée au porteur : la référence du téléphone est-elle à 90 % ou à 100 % ? Ce rapport recommande **100 %**, parce que c'est ce que rend un vrai téléphone.
- **Les media queries d'une maquette répondent à la fenêtre, pas au cadre.** C'est sans effet aujourd'hui, puisque les maquettes n'en contiennent pas (§ 3). Mais une maquette qui en ajouterait se rendrait faux dans le cadre.
- **Il n'existe aucun mode « taille réelle » pour le bureau.** On l'obtient de deux façons :
  - une fenêtre d'au moins 1828 px avec le panneau de notes ouvert, ou d'au moins 2084 px avec le sommaire (ouvert d'office dès 1500 px) ;
  - ou en fermant notes (`n`) et sommaire (`s`) dans une fenêtre d'au moins 1488 px. Dans ce cas, la fausse barre d'adresse de 32,4 px reste et décale tout vers le bas.
- **Pour le téléphone, le mode « taille réelle » existe** : ouvrir la visionneuse dans une fenêtre de moins de 768 px. Elle passe alors en plein écran au bon `rem`. Deux réserves :
  - une barre de navigation de 44 px s'y ajoute, et la maquette n'a donc que **800 px de haut** au lieu de 844 ;
  - le haut est arrondi (`rounded-t-xl`).
- **La méthode de comparaison retenue ici** est en place et rejouable. `isoler-bureau.js` et `isoler-tel.js` sortent le cadre de la visionneuse (`position: fixed`, `transform: none`, la fausse barre masquée) et le rendent à la taille exacte de la fenêtre. Exemple : `cote/m-coque-e1-1440.png`.

**Proposition.** Toute comparaison se fait à partir de ces captures isolées, jamais depuis une capture de la visionneuse. C'est une condition d'acceptation à écrire dans le ticket de préparation. Effort **S** : les scripts existent ; un « mode plein cadre » dans la visionneuse serait plus confortable, mais la mission interdit de toucher aux maquettes.

---

## 2. La coque simulée (`chrome-app.tsx`) face à la coque réelle (`AppShell` et voisins)

Catégories :

- **(1)** écart du produit à combler ;
- **(2)** la maquette s'écarte de la charte ou d'une décision déjà tracée — c'est au porteur de trancher ;
- **(3)** artefact de la visionneuse.

### 2.1 Barre latérale, au bureau (1440, `rem` 14,4, admin)

Maquette : `m-coque-e1-bureau-1920.json` (cotes ramenées à l'échelle 1). Produit : `p-admin-leads-1440.json`.

| Élément | Maquette (`chrome-app.tsx`) | Produit (`AppSidebar`, `styles-de-la-barre.ts`) | Écart | Cat. | Couvert ? |
|---|---|---|---|---|---|
| Largeur | 272 (`w-[272px]`, l. 209) | 272 | 0 | — | — |
| Fond | `muted/45` | `muted/45` | 0 | — | — |
| Filet droit | `border` plein (#ebe5d5) | `border/70` | teinte à 70 % | (1) mineur | non |
| Tête | 50,4 px de haut, `px-4`, logo à 14,4 px du bord | 50,4 px, `px-3` + lien `px-1.5`, logo à 16,2 px | logo décalé de 1,8 px | (1) mineur | non |
| Hauteur d'une ligne | 32,4 (`h-9`) | 32,4 (`h-9`) | 0 | — | — |
| **Texte d'une ligne** | **12,6 px** (`text-sm`, en rem) | **14 px** (`text-[14px]`, en px) | **+1,4 px, soit +11 %** | (2) | non |
| Marge et interligne | `px-2` (7,2) et `gap-2.5` (9) | `px-2.5` (9) et `gap-3` (10,8) | +1,8 / +1,8 | (1) ou (2) | non |
| Encre au repos | `foreground/85` | `foreground` plein (choix de TCK-2490, cf. TCK-658) | opacité | (2) : la règle TCK-658 interdit d'atténuer une encre de texte | — |
| **Icône au repos** | **`muted-foreground`** (rgb 110,101,90) | **`foreground`** (rgb 31,24,18) | **très visible** | (1) | non |
| Trait d'icône | 1,5 | 1,75 (décision de TCK-2490) | 0,25 | (2) | — |
| Ligne active | voile `foreground/[0.07]`, icône `primary`, graisse 500 | voile `foreground/8`, icône `primary`, graisse 500 | voile à 1 % près | — | — |
| **Titre de groupe** | **10,8 px** (`text-xs`), graisse 400, 18 px de haut | **12,5 px**, graisse 500, 25,2 px de haut | +1,7 px, +7 px de haut | (2) : TCK-2490 a fixé 12,5 | non |
| Action principale | 32,4 px, 12,6 px, graisse 600, pastille de 21,6 | 32,8 px, 14 px, graisse 400 (le libellé : 500), pastille de 22 | texte +1,4 | (2) | non |
| **Avatar du pied** | 28,8 px, fond `accent/15`, texte `accent` (olive clair) | 28,8 px (`size-8`), fond **`foreground`**, texte `background` (`MenuDuCompte.tsx:98`) | **pastille noire au lieu d'olive** | (1) | non |
| Nom dans le pied | `text-sm` graisse 600 | `text-sm` graisse 500 | graisse | (1) mineur | non |
| Pied | 57,6 px (`h-16`) | 58,5 px | 0,9 | — | — |

Ce qui se voit au premier coup d'œil, dans `cote/cc-demandes-1440.png` :

- les icônes de la colonne, noires au lieu de grises ;
- le corps de texte, plus gros ;
- l'avatar noir ;
- le contenu des menus, qui relève de TCK-2618.

### 2.2 Zone de contenu et en-tête de page, au bureau

| Élément | Maquette (`TeteDePage`, l. 300-344) | Produit (`AppShell.tsx` `px-4 py-6 md:px-6 md:py-8`, `PageHeader.tsx`) | Écart à 1440 | Cat. |
|---|---|---|---|---|
| Marge latérale | **`px-8` = 28,8** sur 162 des 170 écrans | **`md:px-6` = 21,6** | **7,2 px de chaque côté** : tout le contenu glisse | (1) |
| Marge haute | `pt-8` = 28,8 | `md:py-8` = 28,8 | 0 | — |
| Largeur utile | 1168 − 57,6 = **1110** | 1168 − 43,2 = **1125** | +15 px | (1) |
| H1 | Bricolage 21,6 px, **graisse 600**, approche −0,432 px | Bricolage 21,6 px, **graisse 700**, approche −0,54 px (`tracking-tight`) | graisse | (1), 63 fichiers de `(dashboard)` passent par `PageHeader` |
| Sous-titre | `mt-1`, 12,6 px, `muted` | `mt-1`, 12,6 px, `muted` | 0 | — |
| Fil d'Ariane (`fil`) | 13 px, `mb-2`, sur 55 occurrences | pas d'emplacement dans `PageHeader` | absent | (1) : TCK-2617 le demande, sans fixer de cote |
| Sous l'en-tête (`dessous`) | `mt-5` (18 px) : onglets soulignés (33) ou filtres | pas d'emplacement : chaque page pose le sien | non normé | (1) |
| Bandeau (`bandeau`) | `mb-5` au-dessus du titre | bandeaux de la coque dans la zone défilante | — | — |
| Actions | `gap-2`, boutons de 32,4 (`h-9`) | `gap-2`, empilées sous `lg` | 0 dès `lg` | — |
| Fond | `background` | `background` | 0 | — |
| Largeur maximale | aucune | aucune | 0 | — |

### 2.3 Téléphone (390 × 844, `rem` 16)

Maquette : `m-coque-e1-tel-390.json`. Produit : `p-admin-leads-390.json`. Captures côte à côte : `cote/cc-demandes-390.png` et `cote/cc-accueil-390.png`.

| Élément | Maquette | Produit (`EnTeteMobile.tsx`, `BarreDOnglets.tsx`, `globals.css:311`) | Écart | Cat. | Couvert ? |
|---|---|---|---|---|---|
| En-tête : hauteur et filet | 56, `border-border/70`, fond `background` | 56, idem | 0 | — | — |
| En-tête : contenu | titre H1 de 20 px graisse 600 (racine) ; espace (accueil) ; ← et titre de 17 px (détail) ; ✕ et titre (formulaire) | **logo, loupe et cloche, partout** | **structure** | (1) | **TCK-2617** |
| Icônes de l'en-tête | **20 px**, trait 1,75, `foreground/80`, cible de 40 | **18 px**, trait 1,75, **`muted-foreground`**, cible de 40 | −2 px, plus clair | (1) | **non** |
| Marges de l'en-tête | `pl-4 pr-1.5` | `pl-4 pr-2` | 2 px | (1) mineur | non |
| Collé en haut | oui (hors du défilement) | oui (hors de `main`, qui défile) | 0 | — | — |
| **Barre d'onglets : hauteur** | **64** (`h-16`) | **56** (`3.5rem`) + zone sûre | **−8 px** | (1) | **non** |
| Barre d'onglets : interligne | `gap-1` = 4 | `gap-0.5` = 2 | −2 | (1) | non |
| Barre d'onglets : icône | 20 px, **trait 1,75** | 20 px, **trait 2** (valeur par défaut de lucide) | trait | (1) | non |
| Barre d'onglets : libellé | 11 px, interligne 16,5 | 11 px, interligne 13,75 (`leading-tight`) | interligne | (1) | non |
| Onglet actif | trait de 2 px `primary` (`inset-x-4`, arrondi plein), **icône `primary`**, graisse 600 | trait de 2 px (arrondi en bas seulement), **icône `foreground`**, graisse 600 | couleur de l'icône | (1) | **TCK-2618 AC4** (la couleur seulement) |
| Zone sûre du bas | absente de la maquette | `pb-[env(safe-area-inset-bottom)]` | — | (3) : à garder | — |
| **Enveloppe du contenu** | **aucune** : chaque page porte sa marge, `px-4` sur 139 écrans sur 204, et **bord à bord** sur 62 des 172 écrans dans la coque | **`px-4 py-6`** imposé à toute page | double marge si l'on recopie la maquette ; filets, puces collantes et rangées **ne peuvent plus aller bord à bord** | (1) | **non** |
| Premier contenu sous l'en-tête | 10 px (puces collantes) à 24 px, selon la page | 24 px, puis un H1 de 24 px graisse 700 et sa description (titre de page à y = 80) | jusqu'à 100 px de premier écran perdus | (1) | TCK-2617, en partie (le H1 sort du contenu) |
| Barre d'action collante (`bas`) | sur 67 écrans dans la coque, dont 39 au-dessus des onglets ; **73 px** (`py-3` + bouton `h-12` + filet) sur 49 écrans, de 69 à 93 ailleurs | inexistante | — | (1) | **TCK-2617 dit « 64 px », alors que la maquette mesure 73** |
| Tiroir « Menu » : largeur | 288 | 288 (`w-72`) | 0 | — | — |
| Tiroir : lignes | **44 px**, **15 px**, icônes de **20 px** `muted`, trait 1,5 | **40 px**, **14 px**, icônes de **18 px** `foreground`, trait 1,75 | −4 / −1 / −2 | (1) | TCK-2619 couvre les **44 px** seulement |
| Tiroir : punaises | aucune hors du mode « Modifier » | 36 boutons « Épingler » visibles | — | (1) | TCK-2619 |
| Tiroir : pied | 64, avatar de 36 `accent` | 65, avatar `foreground` | couleur | (1) | non |
| Feuille du bas (`FeuilleBas`, 31 occurrences) | coins `rounded-t-2xl`, poignée de 32 × 4, voile `foreground/35`, `max-h-[90%]`, ombre `2xl`, titre de 17 px et ✕ de 44 | `SheetContent side="bottom"` sans coins, sans poignée, ombre légère ; 8 feuilles maison qui posent chacune leur `rounded-t-*` | — | (1) | voir le rapport de fid-composants |

**À noter pour les comparaisons de locataire.** Le compte de démo `locataire` est résolu en persona **client** : onglets « Favoris · Visites ». La disposition `locataire` existe pourtant (`dispositions.ts:112`, « Paiements · Maintenance »). Il faut un compte au profil actif de locataire pour comparer la maquette « Persona · locataire ».

---

## 3. Grilles et points de rupture

### 3.1 La largeur réellement disponible dans `/app`

Mesures de `p-*-app-*.json` ; elles sont identiques pour les quatre personas.

| Fenêtre | `rem` | Colonne | `main` | Marge | **Largeur utile** | La maquette a dessiné pour |
|---|---|---|---|---|---|---|
| 390 | 16 | — (onglets) | 390 | 16 / 24 | 358 | 390, avec la page qui porte sa marge |
| 768 | 16 | **rail de 60** (`auto`) | 708 | 24 / 32 | **660** | **rien** |
| 1000 | 16 | rail de 60 | 940 | 24 / 32 | **892** | **rien** |
| 1024 | **14,4** | **272** | 752 | 21,6 / 28,8 | **709** | **rien** |
| 1280 | 14,4 | 272 | 1008 | 21,6 | **965** | **rien** (50 tickets disent « Bureau ≥ 1280 ») |
| 1440 | 14,4 | 272 | 1168 | 21,6 | **1125** | **1110** (`px-8`) |

Deux constats :

- **La largeur utile n'est pas monotone.** Elle tombe de 892 à 709 px, soit −183 px, en franchissant 1024 : la colonne passe de 60 à 272 px au moment même où `lg:` pose les colonnes. C'est donc la largeur la plus défavorable, et c'est là que `takussan-web/CLAUDE.md` § Responsive veut les colonnes.
- **Ce même paragraphe parle d'une barre de 256 px.** Elle mesure 272 px depuis TCK-2490, ce qui donne 768 − 60 − 48 = 660 utiles, et non 464. Le document est périmé, et le brief de cette mission a repris le 256.

### 3.2 Les maquettes n'ont qu'une largeur

On compte **1** préfixe responsive (`lg:`) dans les 82 fichiers de `pages/app`. Les autres gabarits sont fixes :

- 121 `grid-cols-2`, 49 `grid-cols-3`, 23 `grid-cols-4`, 9 `grid-cols-7` ;
- des grilles à piste fixe : `grid-cols-[minmax(0,1fr)_400px]`, `_360px`, `_420px`, `[380px_minmax(0,1fr)]`… ;
- des largeurs fixes : `w-[640px]` (×12), `w-[1080px]` (×6), `w-[1112px]` ;
- `PanneauDroit` de 480 px (25 occurrences dans 14 fichiers), qui couvre 64 % de la zone de contenu à 1024.

**La maquette ne dit pas ce que devient sa grille à 1024 ou à 1280. C'est le ticket qui doit le dire, et aujourd'hui il ne le dit pas.**

### 3.3 Simulation : la maquette elle-même rétrécie à la largeur du produit

Script : `balayage-bureau.js`. Le cadre de chaque écran retenu est porté de 1440 à 1280, puis à 1024 ; la colonne de 272 px reste, le `rem` reste à 14,4. C'est exactement ce que donnerait une transcription littérale. Il y a 204 écrans retenus, dont **170 dans la coque** : 29 pages, sans la famille 2, qui est hors coque.

| Symptôme | à 1440 | à 1280 | à 1024 |
|---|---|---|---|
| Débord horizontal de la zone de contenu | 0 | **14 écrans** (jusqu'à 104 px) | **46 écrans** (jusqu'à **360 px**) |
| Contenu coupé par un `overflow-hidden` | référence | 7 | 34 |
| Au moins 3 textes tronqués de plus | référence | 42 | 48 |
| **Au moins un des trois** | 0 | **55 écrans (18 pages)** | **102 écrans (26 pages)** |

Pages où la simulation dégrade le plus — table complète dans `agregat-bureau.md` :

| Page | Écrans dans la coque | Débord à 1280 | Débord à 1024 | Pourquoi |
|---|---|---|---|---|
| app-paiements (locataire) | 10 | **104 px** (4 écrans) | **360 px** | `w-[720px]` et une grille de 6 |
| app-fil-commercial | 8 | **61 px** (3 écrans) | 317 px | `grid-cols-[minmax(0,1fr)_300px]` et `w-[420px]`, la file à côté de la fiche |
| app-demandes | 6 | **61 px** (3 écrans) | 317 px | même gabarit, cf. `cote/m-demandes-e0-1024.png` : la fiche se réduit à une colonne de 15 px de texte |
| app-bailleurs | 2 | 15 px | 271 px | grille de 4 et colonnes fixes |
| app-argent | 4 | 12 px | 268 px | `grid-cols-[minmax(0,1fr)_432px]` ; jusqu'à 36 textes tronqués de plus |
| app-moderation (B) | 2 | 0 | 266 px | `w-[380px]` et `w-[360px]` |
| app-commissions | 5 | 0 | 210 px | `grid-cols-[288px_minmax(0,1fr)]` |
| app-clients | 6 | 0 | 204 px | `grid-cols-[380px_minmax(0,1fr)]` |
| app-interventions | 9 | 0 | 136 px | `w-[640px]`, `w-[660px]` ; 4 coupes |
| app-agenda | 6 | 0 | 128 px | grille de 7 jours ; 8 coupes |
| app-pipeline | 3 | 0 | 109 px | colonnes de kanban fixes ; 43 textes tronqués |
| app-coque (accueil, liste) | 11 | 0 | 89 px | table de 7 colonnes ; 35 textes tronqués |
| app-rapports, app-equipe, app-reservations, app-documents | 8 / 4 / 12 / 10 | 0 | 0 | aucun débord, mais 32 à 35 textes tronqués de plus, et des pistes réduites à 14-47 px (tables à 7-8 colonnes, grille de 7) |

Captures de `app-demandes` « Liste » : `cote/m-demandes-e0-1440.png`, `cote/m-demandes-e0-1280.png` et `cote/m-demandes-e0-1024.png`.

**Écrans qui risquent de casser entre 768 et 1280** (la maquette n'existe qu'en 390 et 1440) : toutes les listes avec panneau de fiche et toutes les fiches à colonne fixe ci-dessus, les tables de 6 à 8 colonnes (équipe, demandes, rapports, réservations), l'agenda (7 colonnes) et le kanban du pipeline. **À 1280, déjà 18 pages sur 29.**

---

## 4. Hauteur et défilement

- **Téléphone.** La maquette suppose le cadre qui l'entoure : 844 px dans la visionneuse au bureau, 800 en plein écran étroit.
  - `EcranApp` est en `h-full flex-col` : l'en-tête et la barre d'onglets ne défilent pas, le milieu défile.
  - 160 écrans sur 204 défilent ; 43 tiennent dans 800 px.
  - Le produit suit le même modèle : coque `h-dvh`, `main` seul défilant, en-tête et onglets hors de `main`. **Pas d'écart de principe.**
- **Collants.** 46 écrans (16 dans la coque) ont un élément `sticky` en haut du défilement : puces de filtre, onglets.
  - Ils fonctionnent dans `main` côté produit.
  - Mais l'enveloppe `px-4 py-6` les empêche d'être bord à bord et les fait démarrer 24 px plus bas : c'est l'écart du § 2.3.
- **Barre d'action collante.** Elle sert sur 67 écrans dans la coque, et sur 28 de plus en plein écran.
  - La maquette la pose **entre le contenu et les onglets**, en flux (`flex-none`) : rien ne passe dessous.
  - Le produit n'a pas l'emplacement (TCK-2617 le crée), et la hauteur écrite dans le ticket est fausse (64 au lieu de 73).
- **Contenu sous la barre d'onglets.** Aucun, des deux côtés : la barre est un enfant flex. Aucun élément flottant dans les 204 maquettes.
  - Le produit monte encore le bouton flottant « Messagerie » au bureau ; TCK-2619 le retire.
- **Feuilles du bas.**
  - Maquette : `absolute inset-0` dans le cadre, `max-h-[90%]`.
  - Produit : `fixed`, `max-h-[90dvh]`.
  - Écart de forme seulement (§ 2.3).
- **Bureau.** Le cadre suit la hauteur de la fenêtre, avec un plancher de 900 px (`min-h-[900px]`). La colonne et le contenu défilent chacun de leur côté, des deux côtés. Pas d'écart.
- **Zone sûre.** La maquette l'ignore, le produit l'ajoute en bas. Recommandation : **64 px + `env(safe-area-inset-bottom)`**, pas 64 au total.

---

## 5. Synthèse : ce qu'il faut fermer AVANT les tickets de page, et ce que les tickets couvrent déjà

### 5.1 Ce que couvrent déjà TCK-2617, 2618 et 2619

| Écart | Ticket | État |
|---|---|---|
| Titre de page dans l'en-tête téléphone, quatre formes, logo retiré, plein écran d'une conversation | TCK-2617 | couvert (structure) |
| Flèche de retour unique, 20 px dans une cible de 44 | TCK-2617 | couvert |
| Fil d'Ariane au bureau | TCK-2617 | couvert, **sans cote** (13 px, `mb-2`) |
| Emplacement de la barre d'action collante | TCK-2617 | couvert, **mais la cote est fausse** : 64 au lieu de 73 (`py-3` + `h-12` + filet) |
| Onglets par persona, libellé « Messages », icône active `primary` | TCK-2618 | couvert |
| Lignes du tiroir à 44 px, sans punaises, mode « Modifier » | TCK-2619 | couvert |
| Logo vers `/app`, bouton flottant retiré au bureau | TCK-2619 | couvert |

### 5.2 Ce qu'aucun ticket ne couvre — à fermer dans un ticket de préparation « coque au pixel »

Ordre de visibilité décroissante :

| # | Écart | Proposition | Effort | Cat. |
|---|---|---|---|---|
| C1 | **Enveloppe de contenu téléphone `px-4 py-6`** contre une page qui porte sa marge et va bord à bord (62 des 172 écrans dans la coque) | La coque cesse d'imposer la marge sous `md`, et la page la porte. Ou bien une variante de page « pleine largeur », que toute page refaite d'après maquette adopte. Garde : aucun écran refait n'empile deux `px-4`. | **M** : touche toutes les pages, à introduire par opt-in | (1) |
| C2 | **Marge de contenu au bureau** de 21,6 (`md:px-6`) contre 28,8 (`px-8`) sur 162 des 170 écrans | `lg:px-8` dans l'enveloppe (largeur utile 1110 à 1440, identique à la maquette) ; `md:px-6` garde la place entre 768 et 1023 | **S** | (1) |
| C3 | **`PageHeader`** : graisse 700 au lieu de 600, approche −0,025em au lieu de −0,02em ; pas d'emplacement pour `fil` (13 px, `mb-2`), `dessous` (`mt-5`) et `bandeau` (`mb-5`) | Aligner `PageHeader` sur `TeteDePage` : c'est la seule source pour 63 pages | **S** | (1) |
| C4 | **Barre d'onglets** : 56 au lieu de 64, interligne 2 au lieu de 4, trait 2 au lieu de 1,75, interligne de libellé 13,75 au lieu de 16,5, arrondi du trait actif | `--barre-onglets-hauteur: calc(4rem + env(safe-area-inset-bottom))`, `gap-1`, `strokeWidth={1.75}`, `leading-normal`. ⚠ La règle du dock lit cette variable (`globals.css:331`). | **S** | (1) |
| C5 | **Icônes de l'en-tête téléphone** : 18 px `muted` au lieu de 20 px `foreground/80` | À poser dans TCK-2617, qui refait l'en-tête : la cote est à ajouter au ticket | **S** | (1) |
| C6 | **Icônes de la colonne et du tiroir au repos** : `foreground` au lieu de `muted-foreground` | `text-muted-foreground` au repos, `primary` à l'actif (contraste non textuel ≥ 3:1, à mesurer dans `AppSidebar.contraste`) | **S** | (1) |
| C7 | **Avatar du compte** : `bg-foreground` au lieu de `accent/15` + `text-accent` ; nom en graisse 500 au lieu de 600 | Aligner `MenuDuCompte` | **S** | (1) |
| C8 | **Corps de la colonne** : 14 px au lieu de 12,6 (`text-sm` à `rem` 14,4) ; titres de groupe 12,5 au lieu de 10,8 ; marges 9 / 10,8 au lieu de 7,2 / 9 ; tiroir en 14 px et icônes de 18 au lieu de 15 px et 20 | **Décision du porteur.** TCK-2490 a fixé des px (14 et 12,5) ; la maquette, en `rem`, rend plus petit au bureau. Recommandation : suivre la maquette au bureau (`text-sm`, `text-xs`), garder 15 px et des icônes de 20 au tiroir. | **S** une fois tranché | (2) |
| C9 | Encre au repos à 85 % et trait 1,5 dans la maquette | Garder le produit (TCK-658, TCK-2490) : la maquette s'écarte d'une règle mesurée | — | (2) |
| C10 | **Feuille du bas** : coins, poignée, voile à 35 %, titre de 17 px et ✕ de 44 absents de `SheetContent` en bas ; huit feuilles maison | Une primitive de feuille du bas (renvoi au rapport de fid-composants) | **M** | (1) |
| C11 | **Comportement entre 768 et 1279 non spécifié** (§ 3) | ADR ou règle de charte : ce que deviennent les gabarits fixes (pistes fixes → empilement sous `xl` ? panneau de 480 → plein écran sous `xl` ? tables → défilement dans leur conteneur, jamais `overflow-hidden`). Puis une ligne par ticket front (50 tickets) : « à 1024 et 1280, … ». | **M** (règle) + **S** par ticket | (1) |
| C12 | Détails de la tête de colonne : filet à 70 %, logo décalé de 1,8 px | Aligner, ou décider que c'est négligeable | **S** | (1) |

Le ticket de préparation fermerait C1 à C7, C10 et C12 avec C8 une fois tranché, et corrigerait au passage la cote du `bas` dans TCK-2617. C11 se décide à part : c'est une règle, à écrire en ADR avant toute page. Le reste — la structure — reste dans TCK-2617, 2618 et 2619.

---

## 6. Largeurs de référence à imposer à toute comparaison

| Usage | Largeur × hauteur | `rem` | Comment obtenir la maquette | Ce qu'on exige |
|---|---|---|---|---|
| **Téléphone, au pixel** | **390 × 844**, DPR 2, tactile | 16 | visionneuse ouverte sous 768 px + `isoler-tel.js` (plein cadre de 844), **jamais** le cadre « Téléphone » d'une fenêtre de bureau | cotes égales à ±1 px |
| Téléphone étroit | 360 × 800 | 16 | idem | aucun débord (`scrollWidth − innerWidth = 0`), titres tronqués sur une ligne |
| **Bureau, au pixel** | **1440 × 900**, DPR 1 | 14,4 | `isoler-bureau.js` (cadre à `transform: none`, fausse barre masquée), **jamais** une capture de la visionneuse (échelle 0,73) | cotes égales à ±1 px ; largeur utile 1110 une fois C2 fait |
| Bureau intermédiaire | **1280 × 800** et **1024 × 768** | 14,4 | aucune : la maquette ne la définit pas | règle C11 : ni débord, ni coupe, empilement décidé |
| Tablette, rail | **768 × 1024** | 16 | aucune | même règle ; largeur utile 660 |

Toute AC de fidélité se mesure au style calculé : `getComputedStyle`, et `getBoundingClientRect` divisé par l'échelle s'il y en a une. La capture côte à côte est produite par `cote-a-cote.sh`, à partir de deux captures à taille réelle.
