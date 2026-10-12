import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AdminShell } from '@/components/layout/AdminShell';
import { getToken } from '@/lib/session';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { fetchAgencyUpgradeRequests } from '@/lib/queries/agency-upgrade';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { accesAdmin } from '@/lib/access/pages-admin-server';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';


/**
 * Admin dashboard layout — restricted to users with admin-level roles
 * (`super_admin`, `agency_admin`). Auth gate is enforced at the
 * `(dashboard)` group level; here we only add the role-based redirect.
 *
 * TCK-633 — fournit `AccesAdminProvider` : les pages `/admin/*` accessibles au profil actif,
 * calculées ici UNE fois (`accesAdmin`) et lues par la barre, le tiroir et le menu utilisateur.
 * `agencyIsStandard` reste pour le compteur de modération des biens. La décision d'ouvrir une page,
 * elle, est prise par la page (`garderPageAdmin`).
 *
 * TCK-633, décision 1 du porteur — la carte « Passer en agence » vit dans « Mon espace » : pour une
 * agence `individual`, on lit si une demande de passage est en cours (même lecture que le layout
 * `/app`, TCK-267). Une agence `standard` n'a pas de carte, et ne paie pas la requête.
 *
 * i18n (TCK-337) : frontière de dictionnaire — ensemble CUMULÉ, cf. `src/i18n/IntlProvider.tsx`.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/profile');

  let agencyIsStandard: boolean | undefined;
  let hasPendingUpgrade: boolean | undefined;
  if (typeof user.agency_id === 'number') {
    const token = await getToken();
    if (token) {
      const agency = await resolveAgencyOrNull(token, user.agency_id, 'admin/layout (cadenas)');
      // `undefined` quand on n'a pas pu savoir — le même correctif qu'`app/layout.tsx`, qui
      // n'avait pas traversé jusqu'ici. `AdminSidebar` conditionne le sondage du compteur de
      // modération à `agencyIsStandard !== false` : écraser « inconnu » en `false` faisait
      // disparaître le badge d'un admin d'agence `standard` sur une simple panne passagère.
      agencyIsStandard = agency ? agency.kind === 'standard' : undefined;
      if (agency?.kind === 'individual') {
        // Une lecture en panne ne doit pas inventer « demande en cours » : la carte propose alors
        // le passage, et la page de demande dira ce qu'il en est.
        const listing = await fetchAgencyUpgradeRequests(token, user.agency_id).catch(() => null);
        hasPendingUpgrade =
          listing?.data.some((request) => request.status === 'pending') ?? false;
      }
    }
  }

  // `resolveAgencyOrNull` est mis en cache pour le rendu : `accesAdmin` relit la même promesse.
  const acces = await accesAdmin(user);

  return (
    <IntlProvider messages={await messagesPour('(dashboard)/admin')}>
      <AccesAdminProvider acces={acces}>
        <AdminShell
          user={user}
          agencyIsStandard={agencyIsStandard}
          hasPendingUpgrade={hasPendingUpgrade}
        >
          {children}
        </AdminShell>
      </AccesAdminProvider>
    </IntlProvider>
  );
}
