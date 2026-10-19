import type { Metadata } from 'next';

import { EcranDeMaintenance } from './EcranDeMaintenance';

/**
 * TCK-926 (P34.05) — interdite aux robots (`CHEMINS_INTERDITS_AUX_ROBOTS`), et `noindex` en plus :
 * `Disallow` empêche l'exploration, pas l'indexation d'une URL liée de l'extérieur. L'écran est un
 * composant client, qui ne peut pas déclarer de métadonnée : cette page serveur le fait pour lui,
 * sans `layout.tsx` (un layout serait une frontière de dictionnaire de plus).
 */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function MaintenancePage() {
  return <EcranDeMaintenance />;
}
