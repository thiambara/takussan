import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { apiRequest } from '@/lib/api';
import { litLaListeDesBauxEnLocataire } from '@/lib/auth/guards';
import { getToken } from '@/lib/session';

/**
 * TCK-2644 (AC5) — le locataire qui n'a qu'UN bail arrive sur sa fiche (« Mon bail ») : une liste
 * d'une ligne, avec des filtres d'agence, ne lui servait à rien.
 *
 * La redirection vit dans ce LAYOUT, strictement au-dessus du `loading.tsx` du groupe : écrite dans la
 * page, elle rendrait 200 avec le squelette avant de rebondir côté client (TCK-426, mesuré sur Next
 * 16.3.1 : un `redirect()` de layout rend 307 malgré le repli du même segment).
 *
 * Le personnel et le bailleur ne sont jamais redirigés. Une lecture en panne ne redirige pas : la
 * liste dira elle-même son erreur.
 *
 * Le groupe est aussi une frontière de dictionnaire (ADR-0022, règle E) : la relance d'un impayé
 * reprend la feuille de TCK-2660 (`FeuilleDeRelance`, espace `admin`), que seule la LISTE atteint.
 * Servi par la frontière `leases`, `admin` aurait pesé sur la fiche et la création d'un bail aussi.
 */
export default async function Layout({ children }: { readonly children: React.ReactNode }) {
  const user = await getMeAction();
  if (litLaListeDesBauxEnLocataire(user.roles)) {
    const seul = await leSeulBail();
    if (seul !== null) redirect(`/app/leases/${seul}`);
  }
  return <IntlProvider messages={await messagesPour('(dashboard)/app/leases/(liste)')}>{children}</IntlProvider>;
}

async function leSeulBail(): Promise<number | null> {
  try {
    const token = await getToken();
    if (!token) return null;
    const reponse = await apiRequest<{ data: { id: number }[]; meta?: { total?: number } }>('/api/leases?fields[leases]=id&per_page=2', { token });
    const total = reponse.meta?.total ?? reponse.data.length;
    return total === 1 && reponse.data[0] ? reponse.data[0].id : null;
  } catch {
    return null;
  }
}
