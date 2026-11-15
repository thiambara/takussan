import { redirect } from 'next/navigation';

/**
 * TCK-2625 (AC4) — « Ma situation » est absorbée par l'accueil du locataire et du client (`/app`) :
 * la carte « Loyer », les échéances des 30 prochains jours, ce qui l'attend, les documents récents
 * et l'invitation à chercher (TCK-595) y sont repris. L'adresse reste servie pour les signets, et ne
 * rend qu'une redirection.
 *
 * ⚠ Pas de `loading.tsx` dans ce segment : une frontière de suspension rendrait cette redirection en
 * 200 au lieu de 307 (TCK-426, même raison que pour l'aiguilleur `/app/overview`).
 */
export default function TenantDashboardPage(): never {
  redirect('/app');
}
