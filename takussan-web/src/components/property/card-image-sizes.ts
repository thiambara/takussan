/**
 * `sizes` par surface — **mesurés dans le navigateur, pas déduits des classes**.
 *
 * `sizes` décrit la **mise en page**, pas le composant. `PropertyCard` en portait
 * pourtant un seul, codé en dur, alors qu'elle sert trois grilles aux géométries
 * différentes (5, 3 et 4 colonnes). Le navigateur choisit sa variante de `srcset` à
 * partir de cette déclaration : quand elle ment, il télécharge une image dont la
 * taille n'a aucun rapport avec la place qu'elle occupe, et **rien** dans le typage,
 * le lint ou le rendu ne le signale — l'image est simplement trop lourde.
 *
 * Ce que le `sizes` unique donnait, mesuré le 2026-08-24 sur
 * `/properties?per_page=30` (`sizes="(max-width: 768px) 100vw, (max-width: 1200px)
 * 50vw, 25vw"`, grille `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`) :
 *
 * | viewport | colonnes | emplacement réel | besoin (DPR 2) | largeur demandée | poids |
 * |---|---|---|---|---|---|
 * | 500 px | 2 | 226 px | 452 px | **w=1080** | **80 Ko** |
 * | 1249 px | 4 | 196 px | 393 px | w=640 | 51 Ko |
 * | 1920 px | 5 | 192 px | 384 px | w=640 | 51 Ko |
 *
 * Aucun palier du `sizes` ne correspondait à un palier de la grille : il coupait à
 * 768 / 1200 quand Tailwind coupe à 768 / 1024 / 1280. Et surtout il raisonnait en
 * `vw` au-delà de 1440 px, où le conteneur est **plafonné** (`max-w-[1440px]`) et
 * l'emplacement figé à 192 px — un `vw` y décrit une largeur qui n'existe plus.
 *
 * Le `srcset` émis par `next/image` contient déjà `256w` et `384w` (mesuré) : le
 * navigateur ne les choisissait pas, faute de savoir qu'ils suffisaient. Sur la même
 * image source, `w=384` pèse **19 Ko** contre 51 Ko pour `w=640`.
 *
 * ⚠ **Toute valeur ci-dessous est un majorant, jamais un minorant.** Sur-déclarer
 * coûte des octets ; sous-déclarer rend une image floue sur écran dense, ce qui ne
 * se rattrape pas côté client. Les marges retenues (~1 à 2 points de `vw`) couvrent
 * l'arrondi des gouttières et la barre de défilement.
 *
 * ⚠ **Ces constantes suivent la mise en page.** Changer un `grid-cols-*`, une
 * gouttière, un `max-w-*` ou la largeur d'un rail latéral invalide la valeur
 * correspondante. La re-mesure tient en une ligne, page ouverte :
 *
 * ```js
 * const g = document.querySelector('div.grid');
 * const c = getComputedStyle(g).gridTemplateColumns.split(' ');
 * ({ colonnes: c.length, slot: parseFloat(c[0]), vw: parseFloat(c[0]) / innerWidth * 100 })
 * ```
 */

/**
 * `/properties` — `grid-cols-1 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5
 * min-[112.5rem]:grid-cols-6`, dans `max-w-[1920px] px-4 md:px-8 lg:px-16`, avec un rail de filtres
 * de 264 px + 24 px de gouttière à partir de `lg` (et non de `md` : sous `lg`, les filtres sont un
 * tiroir).
 *
 * **TCK-628 — le conteneur passe de 1440 à 1920 px et une sixième colonne s'ouvre à 1800 px.**
 * Jusqu'à 1440 px rien ne change ; au-delà, l'emplacement n'est plus figé :
 *
 * | viewport | colonnes | emplacement | déclaré |
 * |---|---|---|---|
 * | 1280 → 1535 px | 4 + rail | 0,25 vw − 116 px (204 → 268 px) | 17.5vw |
 * | 1536 → 1799 px | 5 + rail | 0,2 vw − 96 px (211 → 264 px) | 14.7vw |
 * | 1800 → 1919 px | 6 + rail | vw / 6 − 83 px (217 → 237 px) | 12.4vw |
 * | 1920 px et au-delà | 6, conteneur plafonné | **237 px fixes** | 238px |
 *
 * Calculé depuis les classes, comme les relevés d'avant — `card-image-sizes.test.ts` le vérifie à
 * chaque pixel de 320 à 2560. Le tableau ci-dessous est celui de TCK-555, valable jusqu'à 1279 px.
 *
 * **Re-mesuré le 2026-09-23 (TCK-555)**, à 18 largeurs de 320 à 1920 px :
 *
 * | viewport | colonnes | emplacement | déclaré |
 * |---|---|---|---|
 * | 320 → 767 px | 1 | `100vw − 32 px` exactement (288 → 735 px) | `calc(100vw - 32px)` |
 * | 768 → 1023 px | 3 | 224 → 309 px (29,2 → 30,2 vw) | 31vw |
 * | 1024 → 1279 px | 3 + rail | 192 → 277 px (18,8 → 21,7 vw) | 22vw |
 * | 1280 → 1439 px | 4 + rail | 204 → 244 px (15,9 → 16,9 vw) | 17vw |
 * | 1440 → 1535 px | 4, conteneur plafonné | **244 px fixes** | 244px |
 * | 1536 px et au-delà | 5, conteneur plafonné | **192 px fixes** | 192px |
 *
 * ⚠ **La valeur précédente était SOUS-déclarée à quatre paliers sur cinq** — le défaut qui rend
 * flou, pas lourd. Elle avait été mesurée sur `grid-cols-2 md:grid-cols-3 lg:grid-cols-4
 * xl:grid-cols-5` (2026-08-24) ; TCK-529 a déplacé les paliers (`xl:4`, `2xl:5`) sans la
 * reprendre : 22vw déclarés pour 30 réels à 1023 px, 192 px pour 244 réels de 1440 à 1535 px.
 *
 * Sous `md`, la grille était à deux colonnes de 136 à 360 px (`50vw`) ; TCK-555 l'a passée à
 * une colonne pleine largeur — la photo passe de 156 × 117 à 328 × 246 px à 360 px.
 */
export const CARD_SIZES_SEARCH_GRID =
  '(max-width: 767px) calc(100vw - 32px), (max-width: 1023px) 31vw, (max-width: 1279px) 22vw, (max-width: 1535px) 17.5vw, (max-width: 1799px) 14.7vw, (max-width: 1919px) 12.4vw, 238px';

/**
 * `/favorites` public — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` dans
 * `max-w-7xl px-4 sm:px-6 lg:px-8`, gouttière `gap-x-4`.
 *
 * Conteneur plafonné à 1216 px (1280 − 2 × 32) : au-delà de 1280 px l'emplacement
 * vaut `(1216 − 2 × 16) / 3 = 394,7 px`.
 */
export const CARD_SIZES_FAVORITES_PUBLIC =
  '(max-width: 639px) 92vw, (max-width: 1023px) 47vw, (max-width: 1279px) 32vw, 395px';

/**
 * Tableau de bord `/app/favorites` — même grille, mais le conteneur d'`AppShell`
 * n'a **aucun** plafond (`flex-1` à côté du rail de navigation) : l'emplacement
 * croît avec le viewport, donc on reste en `vw` jusqu'au bout.
 *
 * Valeur volontairement majorante : le rail rétrécit la colonne de contenu d'une
 * quantité que ce module ne connaît pas. Sur-déclarer y est le bon côté de l'erreur.
 */
export const CARD_SIZES_FAVORITES_DASHBOARD =
  '(max-width: 639px) 92vw, (max-width: 1023px) 46vw, 28vw';

/**
 * Carrousel « biens similaires » de la fiche — diapositives
 * `flex-[0_0_85%] sm:flex-[0_0_48%] lg:flex-[0_0_24%]` dans `max-w-7xl px-4 sm:px-6
 * lg:px-8`, soit 24 % de 1216 px = 292 px une fois le conteneur plafonné.
 */
export const CARD_SIZES_SIMILAR_CAROUSEL =
  '(max-width: 639px) 80vw, (max-width: 1023px) 47vw, (max-width: 1279px) 24vw, 292px';

/**
 * Portefeuille d'un profil public (`PortfolioTabs`) — `grid gap-5 sm:grid-cols-2
 * lg:grid-cols-3`, cartes étirées par `[&>article]:w-full`.
 *
 * ⚠ `PropertyCardStandard` déclarait `sizes="290px"`, qui est sa largeur *native*
 * (`w-[290px]`) — celle qu'elle a dans une rangée horizontale. Étirée ici en
 * `w-full`, elle dépasse largement 290 px sur grand écran : la déclaration
 * sous-estimait le besoin, donc rendait l'image floue au lieu de la rendre lourde.
 */
export const CARD_SIZES_PORTFOLIO_GRID =
  '(max-width: 639px) 92vw, (max-width: 1023px) 46vw, 30vw';

/**
 * Les rangées de l'accueil (`PropertyRow`, variantes Standard, Compact et Cover) — TCK-628.
 *
 * La carte n'a plus de largeur fixe (290 px pour la Standard, 260 et 210 pour les deux autres) :
 * elle vaut une fraction du conteneur, `(contenu − (n − 1) × écart) / n`, où `n` dépend de la
 * largeur du CONTENEUR (cf. `PropertyRow`). Sur l'accueil — `max-w-[1920px] px-4 sm:px-6`, écart
 * 12 px sous 512 px de contenu et 16 px au-delà — cela donne :
 *
 * | viewport | colonnes | carte | déclaré |
 * |---|---|---|---|
 * | 320 → 543 px | 2,15 | 0,465 vw − 21 px (128 → 232 px) | 47vw |
 * | 544 → 943 px | 3,2 | 0,3125 vw − 21 à 26 px (149 → 269 px) | 31vw |
 * | 944 → 1199 px | 4 | 0,25 vw − 24 px (212 → 276 px) | 25vw |
 * | 1200 → 1487 px | 5 | 0,2 vw − 22 px (218 → 275 px) | 20vw |
 * | 1488 → 1727 px | 6 | vw / 6 − 21 px (227 → 267 px) | 16.7vw |
 * | 1728 → 1919 px | 7 | (vw − 144) / 7 (226 → 254 px) | 13.3vw |
 * | 1920 px et au-delà | 7, conteneur plafonné | **254 px fixes** | 254px |
 *
 * ⚠ C'est un MAJORANT calculé, pas un relevé : la même rangée sert aussi « Récemment consultés »
 * sur la fiche d'un bien, dans un conteneur plus étroit — ses cartes y sont plus petites, et la
 * déclaration les sur-estime (le bon sens de l'erreur, cf. l'en-tête de ce module).
 */
export const CARD_SIZES_RANGEE =
  '(max-width: 543px) 47vw, (max-width: 943px) 31vw, (max-width: 1199px) 25vw, (max-width: 1487px) 20vw, (max-width: 1727px) 16.7vw, (max-width: 1919px) 13.3vw, 254px';
