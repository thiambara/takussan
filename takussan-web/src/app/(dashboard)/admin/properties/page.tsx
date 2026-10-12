import { garderPageAdmin } from '@/lib/access/pages-admin-server';
// `generateMetadata` et non `metadata` depuis TCK-292 : le titre passe par le dictionnaire, et
// une constante statique ne peut pas appeler `getTranslations`.
import ListeDesBiens, { generateMetadata } from '../../app/properties/(liste)/page';

export { generateMetadata };

// Next.js 16 Turbopack refuses re-exports for route-segment config values;
// `dynamic` must be declared statically here. Keep in sync with the source
// route `(dashboard)/app/properties/(liste)/page.tsx`.
export const dynamic = 'force-dynamic';

/**
 * TCK-633 (lot B) — la liste transverse des biens, super-admin seul (`PAGES_ADMIN`).
 *
 * Ce n'est plus un réexport nu : la page source est gardée par le `layout.tsx` de SON arborescence
 * (`app/properties`, `assertCanReachAgentArea`, TCK-426), que ce réexport ne traverse pas. Sans cet
 * enveloppement, la seule garde de `/admin/properties` était l'`isAdmin` d'`admin/layout.tsx` — un
 * admin d'agence l'ouvrait en tapant l'URL alors que le menu ne la lui montre pas.
 */
export default async function Page(props: Parameters<typeof ListeDesBiens>[0]) {
  await garderPageAdmin('/admin/properties');
  return ListeDesBiens(props);
}
