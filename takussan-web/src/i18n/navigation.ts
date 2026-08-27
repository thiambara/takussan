import { cheminLocalise, estCheminLocalisable } from './routing';
import { isLocale, type Locale } from './config';

/**
 * Le `href` d'un lien, porteur de la langue quand la cible en attend une.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE HELPER PASSE TOUT CE QU'IL NE COMPREND PAS
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Il rend son argument INCHANGÉ pour : une URL absolue (`https://…`, `mailto:`, `tel:`), une ancre
 * (`#…`), un chemin relatif, et toute surface non localisée (`/app/…`, `/api/…`, `/robots.txt`).
 * Il ne préfixe que ce qui appartient à la surface publique.
 *
 * C'est cette tolérance qui le rend posable **sans discernement** — un composant partagé entre le
 * site public et la console (`PropertyCard`, `SearchAutocomplete`) mélange les deux familles de
 * liens dans le même fichier, et devoir choisir au cas par cas est exactement la décision qu'on
 * finit par se tromper.
 *
 * ⚠ Ne pas remplacer par le `Link` de `next-intl/navigation` : celui-là préfixe TOUT, y compris
 * `/app/overview`, ce qui produirait un 404 sur la console. Son modèle suppose le site entier sous
 * `[locale]` ; ADR-0026 §2 décide explicitement le contraire.
 */
export function hrefLocalise(href: string, locale: Locale): string {
  if (!href.startsWith('/')) return href;
  if (href.startsWith('//')) return href; // URL protocol-relative
  const [chemin, ...reste] = href.split(/(?=[?#])/);
  const base = chemin ?? '/';
  if (!estCheminLocalisable(base)) return href;
  return cheminLocalise(base, locale) + reste.join('');
}

/**
 * La langue d'un chemin déjà écrit, ou `null` s'il n'en porte pas. Utile au commutateur de langue,
 * qui doit distinguer « je suis sur une page publique » de « je suis dans la console ».
 */
export function localeDuChemin(pathname: string): Locale | null {
  const segment = pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  return isLocale(segment) ? segment : null;
}
