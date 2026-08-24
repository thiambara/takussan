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
 * `/properties` — `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`, dans
 * `max-w-[1440px] px-4 md:px-8 lg:px-16` avec un rail de filtres de 264 px + 24 px
 * de gouttière à partir de `md`.
 *
 * Mesuré : 500 px → 226 px (45,2 vw) · 800 px → 139 px (17,3 vw) · 1024 px → 140 px
 * (13,7 vw) · 1249 px → 196 px (15,7 vw) · 1440 px et au-delà → **192 px fixes**.
 *
 * Le rail explique le décrochage entre 500 px (absent) et 800 px (présent) : la
 * carte perd la moitié de sa largeur relative en franchissant `md`.
 */
export const CARD_SIZES_SEARCH_GRID =
  '(max-width: 767px) 50vw, (max-width: 1023px) 22vw, (max-width: 1279px) 17vw, (max-width: 1439px) 14vw, 192px';

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
 * Largeur native de `PropertyCardStandard` dans une rangée horizontale
 * (`w-[290px] shrink-0`) — la seule surface où un `sizes` en pixels fixes est
 * exact plutôt que majorant.
 */
export const CARD_SIZES_STANDARD_ROW = '290px';
