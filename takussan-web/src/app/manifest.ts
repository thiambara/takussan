import type { MetadataRoute } from 'next';

import fr from '@/messages/fr.json';

/**
 * `/manifest.webmanifest` — l'application installable (TCK-598, V18).
 *
 * `start_url: '/'` et non `/fr` : la racine n'a pas de langue, et le proxy la redirige vers celle
 * du visiteur (cookie `NEXT_LOCALE`, puis `Accept-Language`, puis `fr` — `src/proxy.ts`,
 * ADR-0026). Une `start_url` figée en `/fr` ouvrirait l'application en français pour tout le
 * monde. Le manifeste lui-même n'a qu'une langue : le français, langue de repli du site.
 *
 * Les icônes sont rastérisées depuis `src/app/icon.svg` ; la `maskable` a un fond plein jusqu'au
 * bord et son motif tient dans la zone de sécurité (cercle de 80 %).
 */
export default function manifest(): MetadataRoute.Manifest {
  const application = fr.horsLigne.application;
  return {
    name: application.nom,
    short_name: application.nomCourt,
    description: application.description,
    lang: 'fr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fcf9f3',
    theme_color: '#a85332',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
