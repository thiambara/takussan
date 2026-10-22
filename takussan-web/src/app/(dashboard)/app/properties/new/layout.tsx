import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { modeDeCreationDeBien } from '@/lib/access/creation-de-bien';
import { ROUTE_VERIF_INDISPONIBLE } from '@/lib/access/server-guards';

/**
 * P152.03 — `/app/properties/new` ne s'ouvre qu'à qui l'API laisse publier ou proposer
 * (`modeDeCreationDeBien`). La garde vit dans le LAYOUT pour que son 307 survive au `loading.tsx` du
 * segment (TCK-426, cf. `properties/layout.tsx`) ; la page relit le même mode, par les mêmes
 * lectures mémoïsées du rendu.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const mode = await modeDeCreationDeBien((await getMeAction()).roles);
  if (mode === 'indisponible') redirect(ROUTE_VERIF_INDISPONIBLE);
  if (mode === null) redirect('/app/properties');
  return <>{children}</>;
}
