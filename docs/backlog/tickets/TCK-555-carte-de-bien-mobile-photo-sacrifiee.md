---
id: TCK-555
title: "Carte de bien sur mobile : une photo de 117 px de haut sous quatre surimpressions — la grille à deux colonnes sacrifie le premier critère de choix"
status: todo
phase: P2
family: front
estimate: M
wave: 68
created: 2026-09-22
updated: 2026-09-22
depends_on: [TCK-554]
blocks: []
spec_refs:
  features:
    - docs/features.md#12-recherche--découverte-publique
  models: []
tags: [front, mobile, carte-de-bien, recherche, ux]
---

## Objectif utilisateur

Sur téléphone, un visiteur juge un bien au premier coup d'œil — photo, prix, lieu, taille — en
faisant défiler la liste.

## Contexte

Audit UI/UX mobile du 2026-09-22 (constats C1, C3 à C7).

- **C1** — sous `md`, la grille est à deux colonnes : cartes de 156 à 171 px, photo de 117 à 128 px
  de haut, sur laquelle se superposent **quatre** éléments (pastille de transaction, favori,
  comparateur, « il y a X mois »).
- **C3** — le comparateur est posé sur la photo de chaque carte, collé au favori.
- **C4** — « il y a 13 mois » est affiché en surimpression sur la photo.
- **C5** — sous le filtre Location, chaque carte répète la pastille « En location ».
- **C6** — le titre réserve toujours deux lignes (`h-10`) : 20 px de vide sous un titre d'une ligne.
- **C7** — un loyer dont la période est absente s'affiche comme un prix de vente
  (« 950 000 F CFA » sans « /mois ») — cas présent dans les données de semis.

**Arbitrage de C1** — la revue adverse a retourné la correction initiale. Une colonne pleine
largeur dégage la photo mais double la longueur de la liste (~12 000 px pour 30 biens) ; une
ligne horizontale (photo à gauche, texte à droite) est plus dense mais change la silhouette de la
variante Listing de `docs/design-guidelines.md`.

> **Décision (2026-09-22) : colonne unique sous `md`.** Prise par la session d'implémentation sur
> l'instruction « implémente tout les tickets de A à Z », sans arbitrage produit préalable : c'est
> le motif le plus répandu des applications immobilières mobiles, et le seul qui garde la
> silhouette verticale de la variante Listing. **Réversible** : la ligne horizontale reste une
> alternative à éprouver si la longueur de liste se révèle coûteuse à l'usage.

## Contrat de données

Aucun endpoint. Champs déjà présents dans la réponse de liste (`contract_type`, `rent_period`,
`published_at`, `condition`).

## Direction UX / Artistique

- La photo est le premier signal : au plus **deux** éléments posés dessus (transaction ou état
  « Neuf », et le favori).
- Le comparateur **reste sur la carte** (fonction du produit, TCK-082) mais quitte la photo : action
  secondaire, loin du favori.
- L'ancienneté **reste visible** — une vieille annonce est un signal de confiance utile — mais en
  texte, dans la ligne de détails, et non sur la photo.
- La pastille de transaction est masquée quand la liste entière est filtrée sur cette transaction.
- La hauteur réservée au titre ne se justifie que si des cartes voisines doivent s'aligner : elle
  suit la disposition retenue.
- Un loyer sans période ne se lit pas comme un prix de vente.

## Contraintes strictes (métier)

- Les quatre variantes de cartes et la direction « Ancrage Local Contemporain » restent la
  référence (`docs/design-guidelines.md`) : une nouvelle silhouette mobile y est consignée.
- Bureau inchangé.
- `sizes` des images mis à jour pour la nouvelle largeur (`card-image-sizes.ts` porte le relevé).

## Delta à produire

- [x] Disposition mobile de la carte : une colonne sous `md`.
- [x] Surimpressions sur la photo réduites à deux au plus.
- [x] Comparateur déplacé hors de la photo.
- [x] Ancienneté en texte dans la ligne de détails.
- [x] Pastille de transaction masquée sous filtre de transaction.
- [x] Hauteur de titre réservée seulement si la disposition l'exige.
- [x] Repli de libellé pour un loyer sans période.
- [x] `sizes` des images recalculés.

## Critères d'acceptation

- [x] AC1 — à 360 px, la photo de la première carte mesure au moins 210 px de haut (1,8 fois les
      117 px relevés), et la grille est à une colonne sous `md` ; à partir de `md`, le nombre de
      colonnes est inchangé.
- [x] AC2 — au plus deux éléments sont positionnés au-dessus de la photo d'une carte.
- [x] AC3 — le comparateur n'est pas au-dessus de la photo, et sa zone tactile ne touche pas celle
      du favori.
- [x] AC4 — sous `contract_type=rent`, aucune carte n'affiche de pastille de transaction ; sans
      filtre de transaction, toutes l'affichent.
- [x] AC5 — un bien en location sans `rent_period` n'affiche pas un montant nu identique à celui
      d'une vente.
- [x] AC6 — l'ancienneté de l'annonce reste lisible sur la carte.

## Hors périmètre

- La structure du lien et des boutons (TCK-554, préalable).
- L'espacement vertical entre rangées (constat C8, retiré par la revue adverse : il suit la
  disposition retenue).
- La photo absente elle-même (données de semis sans médias).

## Notes d'implémentation

### Re-mesure des prémisses (2026-09-23, avant tout changement)

Banc : `next dev -p 3023` du worktree, API partagée `:8002` (247 biens, sans photos), Chrome
headless piloté par CDP, `setDeviceMetricsOverride({width:360, mobile:true, dsf:3})`,
`innerWidth` relevé = **360** (pas d'élargissement du viewport). Charge machine : `load average`
77 / 99 / 78 sur 8 cœurs — les mesures ci-dessous sont des géométries, pas des temps.

| Constat | Ticket | Mesuré |
|---|---|---|
| C1 grille | 2 colonnes, cartes 156-171, photo 117-128 | **2 colonnes de 156 px, photo 156 × 117** ✓ |
| C1 surimpressions | 4 (transaction, favori, comparateur, âge) | barre du haut (pastille « En vente » + favori + comparateur) + « le mois dernier » en bas à gauche ✓ |
| C6 titre | `h-10` réservé | `h3` de 40 px pour une ligne de 19,25 px (« Parking couvert à Pikine ») ✓ |
| C7 loyer sans période | présent dans les semis | **88 locations sur 127 sans `rent_period`** dans les 180 premiers biens de `/api/public/properties` (39 `monthly`) ✓ |

**Écarts de prémisse relevés :**

- **Surfaces de `PropertyCard`** — la consigne de session cite l'accueil, « récemment consultés »
  et le portefeuille d'agent. Mesuré par `grep` : `PropertyCard` n'est monté que par
  `PropertiesDiscoveryPage` (liste), `PropertySimilar` (carrousel de la fiche), `FavoritesList`
  (`/app/favorites`) et `PublicFavoritesPage` (`/favorites`). L'accueil et « récemment consultés »
  passent par `PropertyRow` → `PropertyCardStandard/Listing/Cover/Compact` ; le portefeuille par
  `PropertyCardStandard`. Ces variantes ne sont pas touchées.
- **Grille de `/properties`** — `card-image-sizes.ts` décrit `grid-cols-2 md:grid-cols-3
  lg:grid-cols-4 xl:grid-cols-5` ; le code porte `grid-cols-2 md:grid-cols-3 xl:grid-cols-4
  2xl:grid-cols-5` depuis TCK-529 (4b7b9138), postérieur au relevé des `sizes` (09fe8847).
  Les `sizes` sont donc re-mesurés à tous les paliers, pas seulement sous `md`.
- **Aucun bien semé n'est « Neuf »** (`condition` nulle sur les 180 relevés) : la règle des deux
  surimpressions avec l'état « Neuf » se vérifie par test, pas au navigateur.

### Ce qui a été fait, et les décisions qui ne se lisent pas dans le diff

- **Une prop, pas l'URL** : `PropertyCard` reçoit `transactionFiltree` de la grille de
  `/properties` (`filters.contract_type`). Elle ne retire la pastille que si le bien porte
  EXACTEMENT cette transaction — un bien d'une autre transaction la garde, elle y dit une vraie
  différence. Aucune autre surface ne passe la prop : pastille toujours affichée ailleurs.
- **« Neuf » et la règle des deux surimpressions.** La photo porte UNE pastille et le favori. La
  pastille est la transaction ; quand la transaction est masquée (ou absente), « Neuf / Sur plan »
  prend sa place. Quand les deux ont à dire, l'état passe en texte en tête de la ligne de détails
  (`CardMeta`) — ni perdu, ni dit deux fois. Aucun bien semé n'est « Neuf » : vérifié par test.
- **Le comparateur** est dans la rangée du prix, à droite (à l'opposé du favori, en haut à droite de
  la photo), dans un conteneur `relative z-10` (au-dessus du lien étiré de TCK-554). Posé sur la
  page et non plus sur une photo, il prend une variante `surface="page"` de `CompareToggleButton`
  (fond de carte, bordure, encre `muted-foreground` ; `bg-primary` quand il est choisi). Le défaut
  `media` est inchangé pour les autres appelants. `-my-1` : la rangée passe de 22,5 à 24 px, pas à 32.
  ⚠ **Vrai sous `md` seulement — faux au bureau (43 px), voir « Tour 2 ».**
  ⚠ Première écriture en table d'objets (`SURFACES = {…}`) : `check-status-badge-unique.mjs` l'a
  refusée comme « table de tons hors du fichier canonique » — réécrite en ternaire dans le `cn()`.
- **Titre** : `sm:h-10` au lieu de `h-10`. Sous `sm`, les trois surfaces montrent la carte seule
  (liste et favoris à une colonne, carrousel à 85 %). ⚠ Compromis assumé : entre 640 et 767 px la
  liste est à une colonne mais réserve encore deux lignes (les favoris et le carrousel, eux, y sont
  à deux colonnes et en ont besoin) — une classe qui dépendrait de la grille appelante demanderait
  une prop de plus pour 20 px sur une largeur de tablette.
- **Loyer sans période** : « 950 000 F CFA · loyer » (`property.cards.rentNoPeriod` : fr « · loyer »,
  en « · rent », wo « · luwaas », le mot déjà employé par `contractTypes.rent` en wolof).
- **`design-guidelines.md`** : la silhouette de la carte de liste et ses règles sont consignées sous
  « Cartes propriété — variantes » (contrainte du ticket).

### Vérification au navigateur (2026-09-23, `:3023` du worktree, Chrome headless par CDP)

Émulation `360 × 740, dsf 3, mobile: true`, `innerWidth` relevé = largeur demandée partout
(aucun élargissement), `scrollWidth − innerWidth` = 0. Squelettes attendus (`animate-pulse`,
`aria-busy`) avant chaque relevé.

| AC | Mesure | Résultat |
|---|---|---|
| AC1 | `/fr/properties` à 360 px | **1 colonne, photo 328 × 246** (≥ 210 ✓) — avant : 2 colonnes, 156 × 117 |
| AC1 | balayage 18 largeurs, avant/après | 320-767 : 1 colonne, `slot = largeur − 32`. **768 → 1920 : 3/3/3/3/3/4/4/4/4/5/5 colonnes (768, 800, 1023, 1024, 1279, 1280, 1439, 1440, 1535, 1536, 1920), emplacements identiques au pixel près** avant et après |
| AC2 | 30 cartes, éléments dessinés sur la photo | **max 2** (« En vente » + favori) à 360, et à 1024 / 1536 px (cartes de 192 px) — ⚠ tour 1 ; au tour 2 le bureau garde sa carte d'avant (4 éléments), voir « Tour 2 » |
| AC3 | comparateur | **0 / 30 sur la photo** ; écart entre zones tactiles de 44 px favori ↔ comparateur : **191 px** à 360, **89 px** à 1024 et 1536 (⚠ tour 1 : au bureau, le comparateur est revenu sur la photo au tour 2). Tap (`el.click()`) : `aria-pressed=true`, URL inchangée ; `elementFromPoint` au centre et à 5 px hors du rond → le bouton |
| AC4 | `?contract_type=rent` / `?contract_type=sale` / sans filtre | **0 / 30** pastilles sous chaque filtre ; **30 / 30** sans filtre |
| AC5 | formes de prix relevées sur 30 cartes | « N F CFA », « N F CFA/mois », « N F CFA · loyer » ; en : « · rent », wo : « · luwaas » |
| AC6 | ancienneté | **30 / 30** cartes la portent en texte (« le mois dernier », « il y a 2 mois »), **0** sur la photo |

Contraste du comparateur en `surface="page"` (couleurs calculées par Chrome) : repos
`muted-foreground` sur `card` **5,72:1**, survol `foreground` sur `muted` **14,87:1**, choisi
`primary-foreground` sur `primary` **5,06:1**.

**Autres surfaces de la carte**, à 360 px sans filtre : carrousel des biens similaires (fiche) —
pastille présente, 2 surimpressions, comparateur hors photo, titre de 19 px (40 px à 1280 : la
réserve revient là où les diapositives s'alignent) ; `/fr/favorites` (favoris invités) — photo
328 × 246, 2 surimpressions, comparateur hors photo. `/app/favorites` (authentifié, même composant,
aucune prop nouvelle) n'a pas été ouvert au navigateur.

**`sizes`** — sonde : une `<img>` portant le `srcset` de `next/image` et la valeur déclarée, dont
Chrome rend le `currentSrc` choisi. À 360 px (DPR 3, besoin 984) : **1080w** avec la nouvelle
valeur, **640w** avec l'ancienne (floue). À 1440 px (DPR 2, besoin 488) : **640w** contre **384w**
avec l'ancienne — le sous-dimensionnement de bureau était antérieur au ticket (voir l'écart de
prémisse ci-dessus).

Longueur de liste : carte de 355 px à 360 px, soit ~11 850 px pour 30 biens avec `gap-y-10` —
l'ordre de grandeur que l'arbitrage anticipait (~12 000).

### Tour 2 — refus du vérificateur : la contrainte « Bureau inchangé » était violée (2026-09-23)

**Le défaut, reproduit avant correction** (banc : `:3023` du worktree, Chrome headless par CDP en
`mobile: false`, `/fr/properties`, 30 cartes ; `load average` 80 / 77 / 76 sur 8 cœurs — des
géométries, pas des temps). Scripts `prix3.js` / `meta.js` du vérificateur, rejoués sur le commit
46397092 :

| largeur | prix sur 2 lignes | haut des titres, 1re rangée | détails sur 2 lignes, puce pendante |
|---|---|---|---|
| 1024 | **17 / 30** (hauteurs 23 et 43 px) | 525 ×3 | **24 / 30** |
| 1536 | **17 / 30** | 525, 525, 525, **544, 544** | **24 / 30** |
| 1920 | **17 / 30** | 525, 525, 525, **544, 544** | **24 / 30** |

Témoin (ancienne `PropertyCard` et `CompareToggleButton` de la base remis temporairement, puis
restaurés, md5 vérifié) : 0 prix sur 2 lignes, titres à 524 ×5, 0 puce pendante. La cause est celle
qu'a nommée le vérificateur : le comparateur (rond de 32 px + `gap-2`) prenait 40 px à la rangée du
prix, et l'ancienneté ajoutait un élément à la ligne de détails, **à toutes les largeurs**.

**La correction : deux dispositions, séparées à `md`.** Sous `md`, la disposition mobile du tour 1,
intacte. À partir de `md`, la carte de bureau d'avant, à l'identique : comparateur sous le favori
(dans la même colonne `flex-col`, format compact compris), bulle d'ancienneté en bas à gauche de la
photo, « Neuf » à côté de la transaction, ligne de détails sans ancienneté, rangée du prix en bloc
(`md:block`). Ce qui change de place est **rendu aux deux endroits et masqué par la largeur** —
`md:hidden` (téléphone seulement) ou `hidden md:contents` / `hidden md:flex` (bureau seulement).
`display: none` retire l'élément de l'arbre d'accessibilité et de l'ordre de tabulation : un seul
comparateur est annoncé et atteignable à chaque largeur. Les deux copies du comparateur partagent
l'état du contexte (relevé : un tap sur l'une passe les deux à `aria-pressed=true`).

Pourquoi pas un seul comparateur repositionné en CSS : il faudrait le poser en `absolute` sur la
photo depuis la rangée du prix, en recopiant en constantes la géométrie de la barre du haut
(16 + 40 + 10 px, le format compact, l'absence de favori) et en rendant sa variante de couleur
dépendante de la largeur. Une copie masquée garde le DOM de bureau d'avant tel quel — c'est ce qui
rend la contrainte vérifiable au pixel.

`CardMeta` accepte désormais un élément conditionnel `{ texte, className }`. Le séparateur qui le
précède disparaît avec lui ; et quand il est en TÊTE (l'état « Neuf »), c'est le séparateur du
premier élément toujours montré qui disparaît avec lui — sinon la ligne de bureau s'ouvrirait sur
« • 3 Ch. ». Les trois autres cartes (`Standard`, `Listing`, `Compact`) passent des chaînes : rendu
inchangé (même balisage).

**Décision d'interprétation, à relire par la session** : les AC2, AC3 et AC6 sont tenus **sous `md`**
(le ticket est « Carte de bien sur mobile », et « Bureau inchangé » est une contrainte stricte). Au
bureau, la photo porte de nouveau ses quatre éléments, comme avant le ticket. Les AC4 (pastille
masquée sous filtre) et AC5 (« · loyer ») valent à **toutes** les largeurs : ce sont des corrections
de contenu, pas de disposition, et le relevé ci-dessous montre qu'elles ne déplacent rien au
bureau.

**Vérification au navigateur — le bureau, au pixel près contre le témoin.** Relevé par `geo.js`
(rectangles, relatifs à la carte, de la carte, de la photo, du prix, du titre, de la ligne de
détails, de chaque bouton affiché et de l'ancienneté ; texte VISIBLE de la ligne de détails), sur les
30 cartes de `/fr/properties`, témoin = la base :

| largeur | colonnes | écarts géométriques | écarts de texte |
|---|---|---|---|
| 768, 1024, 1280, 1440, 1536, 1920 | 3, 3, 4, 4, 5, 5 | **0** sur 30 cartes, à chaque largeur | 16 prix : « N F CFA » → « N F CFA · loyer » (AC5, les 16 locations sans période) — rectangle du prix identique : rien ne passe à la ligne |

`prix3.js` du vérificateur : **0 / 30** prix sur 2 lignes à 1024, 1536 et 1920 ; titres de la 1re
rangée à **524 ×5** à 1536 et 1920 (524 ×3 à 1024). Ligne de détails : **0 / 30** sur 2 lignes,
**0** puce pendante aux trois largeurs.

⚠ **Pour qui rejoue `meta.js` tel quel** : il rend 30 / 30 « sur plusieurs lignes » — faux positif.
Il compte les rangées par `getBoundingClientRect().top` de TOUS les enfants de la ligne, et un
élément masqué (`display: none`) rend un rectangle nul en haut de la page. Filtrer les enfants par
`getClientRects().length` (`meta-visible.js`) rend **0**. Même précaution pour tout
`querySelector('button[aria-label*="compar"]')` : le PREMIER comparateur du DOM est la copie de la
photo, masquée sous `md` — prendre celui qui a un rectangle.

**Vérification au navigateur — le mobile, inchangé depuis le tour 1.** Même relevé à 360, 390, 640
et 700 px (`mobile: true`, `innerWidth` = largeur demandée, `scrollWidth` = `innerWidth`), témoin =
le commit 46397092 vérifié au tour 1 : **0** écart de géométrie hors prix ; sur les 16 locations sans
période, le texte du prix devient « 1 840 000 F CFA · loyer » (espace insécable dans le texte, voir
plus bas) et sa largeur perd 0,6 px (l'espace remplace la marge `ms-1`).

| surface | largeur | photo | éléments sur la photo | comparateur sur la photo | titre |
|---|---|---|---|---|---|
| `/fr/properties` | 360 / 390 | 328 × 246 / 358 × 269 | **max 2** (pastille + favori) | 0 / 30 ; écart des zones de 44 px : 192 / 215 px | 19 px |
| `/fr/properties?contract_type=rent` | 360 | — | **max 1** (favori) ; 0 pastille | 0 / 30 | — |
| `/en/properties?contract_type=rent` | 390 | — | max 1 ; 0 pastille | 0 / 30 | — |
| `/wo/properties` | 360 | — | max 2 | 0 / 30 | — |
| `/fr/properties` | 1280 / 1920 | 204 × 153 / 192 × 144 | 4 (comme avant) | 30 / 30 (comme avant) ; écart 2 px (TCK-554) | 40 px |
| `/fr/properties?contract_type=rent` | 1280 | — | 3 : aucune pastille (AC4) | 30 / 30 | — |
| carrousel des similaires | 360 / 1280 | 279 × 209 / 292 × 219 | pastille + favori / 4 | non / oui | **40 px sur les 6 diapositives aux deux largeurs** |
| `/fr/favorites` (invité, 4 favoris) | 360 / 1280 | 328 × 246 / 395 × 296 | 2 / 4 | 0 / 4 — 4 / 4 | 19 / 40 px |

Tap sur le comparateur affiché à 360 px (`el.click()`) : `aria-pressed` false → true, URL inchangée ;
`elementFromPoint` rend le bouton au centre, à +21 px et à −21 px, la page à +23 px.

**Les défauts mineurs du tour 1, traités :**

- **Garde de grille** — `PropertiesDiscoveryPage.grille.test` exige désormais l'ÉGALITÉ des paliers
  de colonnes (`grid-cols-1 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`), plus une inclusion.
  Mutants du vérificateur rejoués : M5 (`sm:grid-cols-2`) et M6 (`lg:grid-cols-4`) **tués**.
- **Carrousel des similaires** — prop `titreSurDeuxLignes` (`des-sm` par défaut, `toujours` passé
  par `PropertySimilar`) : titres de 40 px sur les 6 diapositives à 360 px (19 / 39 px au tour 1).
- **« F CFA· loyer »** — l'espace est une espace insécable DANS le texte, plus une marge : le
  `textContent` rend « 1 840 000 F CFA · loyer ». Test ajouté (rouge avant correction).
- **`CARD_SIZES_SEARCH_GRID` sans test** — `card-image-sizes.test.ts` recalcule l'emplacement depuis
  la géométrie de la grille (témoin : 328 / 224 / 192 / 204 / 244 / 192 px, les relevés du
  navigateur) et exige, à chaque largeur de 320 à 2560 px, `emplacement ≤ déclaré ≤ 1,2 ×
  emplacement`. Mutants : 22vw au palier 768-1023 (l'ancienne sous-déclaration) **tué** ; `25vw` à
  partir de 1280 **tué**.

**Mutants du tour 2** (chacun restauré, md5 vérifié) : ancienneté dans les détails à toutes les
largeurs, copies de la photo sans masque, comparateur de la rangée du prix sans `md:hidden`, bulle
d'ancienneté visible sous `md`, rangée du prix sans `md:block` — **tous tués** par
`PropertyCard.mobile.test`.

**Tests modifiés hors des fichiers du ticket** : `PropertyCard.structure.test` (TCK-554) cherchait LE
comparateur par `getByRole` ; la carte en rend deux copies, une par largeur. Il les prend toutes
(`getAllByRole`) et clique chacune : les invariants de TCK-554 (aucun contrôle dans le lien, tous
au-dessus du lien, zone de 44 px) portent sur chaque copie.

