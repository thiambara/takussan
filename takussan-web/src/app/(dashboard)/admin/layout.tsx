import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AdminShell } from '@/components/layout/AdminShell';
import { getToken } from '@/lib/session';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';


/**
 * Admin dashboard layout — restricted to users with admin-level roles
 * (`super_admin`, `agency_admin`). Auth gate is enforced at the
 * `(dashboard)` group level; here we only add the role-based redirect.
 *
 * Hydrate `agencyIsStandard` so the sidebar can padlock Standard-only items
 * for agency_admins still on `kind=individual` (mirroring AppLayout/AppShell).
 *
 * i18n (TCK-337) : frontière de dictionnaire — ensemble CUMULÉ, cf. `src/i18n/IntlProvider.tsx`.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/profile');

  let agencyIsStandard: boolean | undefined;
  if (typeof user.agency_id === 'number') {
    const token = await getToken();
    if (token) {
      const agency = await resolveAgencyOrNull(token, user.agency_id, 'admin/layout (cadenas)');
      // `undefined` quand on n'a pas pu savoir — le même correctif qu'`app/layout.tsx`, qui
      // n'avait pas traversé jusqu'ici. `AdminSidebar` conditionne le sondage du compteur de
      // modération à `agencyIsStandard !== false` : écraser « inconnu » en `false` faisait
      // disparaître le badge d'un admin d'agence `standard` sur une simple panne passagère.
      agencyIsStandard = agency ? agency.kind === 'standard' : undefined;
    }
  }

  return (
    <IntlProvider messages={await messagesPour('(dashboard)/admin')}>
      <AdminShell user={user} agencyIsStandard={agencyIsStandard}>
        {children}
      </AdminShell>
    </IntlProvider>
  );
}
