'use client';

import { Analytics } from '@vercel/analytics/next';

import { sansSecret } from '@/lib/analytics-sans-secret';

/**
 * TCK-602 (VERIF-602 M3) — `<Analytics />` derrière un `beforeSend` qui retire les jetons de l'URL
 * envoyée à Vercel. Composant client : une fonction ne traverse pas la frontière du layout serveur.
 */
export function AudienceSansSecret() {
  return <Analytics beforeSend={sansSecret} />;
}
