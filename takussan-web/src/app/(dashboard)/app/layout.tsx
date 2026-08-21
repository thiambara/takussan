import { getMeAction } from '@/app/actions/auth';
import { AppShell } from '@/components/layout/AppShell';
import { getToken } from '@/lib/session';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { fetchAgencyUpgradeRequests } from '@/lib/queries/agency-upgrade';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';


/**
 * App dashboard layout — for end-users (customer, agent, owner,
 * service_provider). Auth gate is enforced at the `(dashboard)` group level,
 * so we only need to hydrate the current user and render the shell here.
 *
 * TCK-267 — when the active user is an `agency_admin`, we resolve two flags
 * server-side so the sidebar's "Passer en pro" card can render in the right
 * state (visible / pending / hidden) without a client-side fetch on every
 * navigation. Other roles skip these calls entirely.
 *
 * i18n (TCK-337) : frontière de dictionnaire. C'est la plus large du produit — le tableau de bord
 * end-user adresse à lui seul 38 espaces de noms — et c'est aussi la seule que le découpage par
 * groupe de routes n'allège que d'un tiers. Descendre plus bas (par page) n'a PAS été fait : la
 * mesure de TCK-337 donne 92 % du gain au grain du groupe pour 5 éditions au lieu de 113.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getMeAction();

  let agencyIsStandard: boolean | undefined;
  let hasPendingUpgrade: boolean | undefined;

  if (user.roles.includes('agency_admin') && typeof user.agency_id === 'number') {
    const token = await getToken();
    if (token) {
      const [agency, listing] = await Promise.all([
        resolveAgencyOrNull(token, user.agency_id, 'app/layout (cadenas)'),
        fetchAgencyUpgradeRequests(token, user.agency_id).catch(() => null),
      ]);
      // `undefined` quand on N'A PAS PU savoir — et non `false`.
      //
      // `agency?.kind === 'standard'` écrasait `null` en `false`, c'est-à-dire « inconnu » en
      // « agence individuelle ». Le cadenas est identique dans les deux cas (`isProRouteLocked`
      // rend `agencyIsStandard !== true`, donc fail-closed), mais la CARTE « passez au plan
      // supérieur » ne s'affiche que sur `=== false`. Résultat, sur
      // `/verification-indisponible` — la page qui dit « ce n'est pas un changement de votre
      // formule » — la barre latérale affirmait exactement le contraire.
      //
      // *Écraser « je ne sais pas » en « non » ne change pas la décision ; cela change ce qu'on
      // raconte à l'utilisateur, et c'est là que ça se voit.*
      agencyIsStandard = agency ? agency.kind === 'standard' : undefined;
      hasPendingUpgrade =
        listing?.data.some((request) => request.status === 'pending') ?? false;
    }
  }

  return (
    <IntlProvider messages={await messagesPour('(dashboard)/app')}>
      <AppShell
        user={user}
        agencyIsStandard={agencyIsStandard}
        hasPendingUpgrade={hasPendingUpgrade}
      >
        {children}
      </AppShell>
    </IntlProvider>
  );
}
