'use client';

import type { ImageLoaderProps } from 'next/image';

/**
 * Le `loaderFile` de `next/image` — ADR-0029 §4, TCK-540.
 *
 * Toute image du seau public (`NEXT_PUBLIC_MEDIA_URL`) est servie par Cloudflare Transformations :
 * `<media>/cdn-cgi/image/width=…,quality=…,format=auto,onerror=redirect/<chemin+requête>`. Le VPS
 * n'encode plus rien, et le cache vit chez Cloudflare au lieu de repartir à zéro à chaque
 * déploiement du conteneur.
 *
 * Branché par `next.config.ts` SEULEMENT quand `NEXT_PUBLIC_MEDIA_URL` est posée au build : sans
 * elle (développement, production Vercel jusqu'à la phase F), l'optimiseur de Next reste en place.
 * Le raisonnement est dans le bloc `images` de `next.config.ts`.
 */

/**
 * Les SEULES largeurs demandées à Cloudflare. Toute largeur est arrondie VERS LE HAUT à la
 * suivante — jamais vers le bas, qui rendrait flou ce que le `sizes` d'un composant a demandé.
 *
 * Pourquoi un jeu court : Transformations facture la transformation UNIQUE (source × paramètres),
 * 5 000 par mois gratuites. Le `srcset` de Next en propose 14 (`deviceSizes` + `imageSizes`) ;
 * passées telles quelles, une même photo pourrait coûter 14 transformations au lieu de 6.
 * `format=auto` ne compte qu'une fois quel que soit le format servi.
 *
 * Chaque palier correspond à une surface réelle (mesures de `card-image-sizes.ts` et des `sizes`
 * des composants, DPR 2) :
 *
 * | palier | ce qui y tombe |
 * |---|---|
 * | 128  | avatars et vignettes de 32 à 64 px (messagerie, avis, agent, réservation, logo 128 px en 1x) |
 * | 384  | carte de la grille de recherche au-delà de 1440 px (192 px), photo d'agent (144 px) |
 * | 640  | carte mobile (226 px à 500 px de viewport), carte des favoris, vignette de carte |
 * | 960  | galerie de la fiche, carte des favoris à 395 px |
 * | 1280 | tuile pleine de la mosaïque, visionneuse sur écran moyen |
 * | 1920 | visionneuse plein écran (`100vw`) — plafond, comme `deviceSizes` |
 *
 * ⚠ Au-delà de la largeur de la source, Cloudflare n'agrandit pas (`fit` vaut `scale-down` par
 * défaut) mais facture quand même : la conversion `preview` fait 800 px, `full` 1 600.
 */
export const LARGEURS_MEDIA = [128, 384, 640, 960, 1280, 1920] as const;

/**
 * Une qualité, une seule : chaque valeur distincte multiplie la facture par le nombre de largeurs.
 * Celle que passerait un composant (`quality=`) est IGNORÉE pour les médias — aucun ne la passe
 * (mesuré le 2026-09-21 : `grep -rn 'quality=' src` ne rend rien). 75 est le défaut de Next.
 */
export const QUALITE_MEDIA = 75;

export function arrondirLargeur(largeur: number): number {
  return LARGEURS_MEDIA.find((palier) => palier >= largeur) ?? LARGEURS_MEDIA[LARGEURS_MEDIA.length - 1];
}

function lireUrl(src: string): URL | null {
  try {
    return new URL(src);
  } catch {
    return null;
  }
}

/**
 * Le loader, éprouvable sans `process.env` : `mediaUrl` est l'origine du seau public, ou vide.
 */
export function construireUrlImage({ src, width, quality }: ImageLoaderProps, mediaUrl: string | undefined): string {
  const url = lireUrl(src);

  // `blob:`, `data:`, chemin relatif : rendus tels quels. Aucun n'atteint ce loader en pratique —
  // les deux premiers sont posés en `unoptimized` —, mais une URL cassée ici casse l'image.
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return src;

  if (mediaUrl && url.origin === mediaUrl && !url.pathname.startsWith('/cdn-cgi/')) {
    const options = `width=${arrondirLargeur(width)},quality=${QUALITE_MEDIA},format=auto,onerror=redirect`;
    // La requête est CONSERVÉE : `?v=<horodatage>` (media-library.version_urls) est ce qui change
    // l'URL d'une conversion régénérée — sans lui, Cloudflare resservirait l'ancien filigrane.
    return `${mediaUrl}/cdn-cgi/image/${options}${url.pathname}${url.search}`;
  }

  if (url.hostname === 'images.unsplash.com') {
    // Paramètres natifs d'imgix, sur lequel Unsplash repose : rien n'y est facturé.
    url.searchParams.set('w', String(width));
    url.searchParams.set('q', String(quality ?? QUALITE_MEDIA));
    url.searchParams.set('auto', 'format');
    return url.toString();
  }

  // Tout autre hôte (API servant encore son disque, picsum, placehold.co…) : l'image source,
  // intacte. Le fragment n'est jamais envoyé au serveur — ni requête ni transformation de plus — et
  // il fait savoir à Next que la largeur est « utilisée », ce qui tait son avertissement de dev.
  url.hash = `w=${width}`;
  return url.toString();
}

export default function imageLoader(props: ImageLoaderProps): string {
  return construireUrlImage(props, process.env.NEXT_PUBLIC_MEDIA_URL);
}
