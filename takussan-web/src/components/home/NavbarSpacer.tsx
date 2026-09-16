/**
 * La cale sous la `Navbar` fixe du site public — sa hauteur RÉELLE à chaque palier.
 *
 * Chaque page posait `h-[133px]`, la hauteur de la barre de bureau (recherche + rangée de
 * catégories). Or la barre ne passe en bureau qu'à `lg` (TCK-505) : en dessous elle ne mesurait
 * que 67 px, et les pages ouvraient sur 66 px de vide en plus de leur propre marge — mesuré à 360,
 * 390 et 768 px le 2026-09-16 (`h1` à 181 px). Relevé après la revue du même jour, la pastille de
 * recherche mobile passant à 44 px : 69 px sous `lg`, 136 px en bureau.
 */
export function NavbarSpacer() {
  return <div aria-hidden="true" className="h-[69px] lg:h-[136px]" />;
}
