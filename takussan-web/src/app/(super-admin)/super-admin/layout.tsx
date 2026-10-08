import { redirect } from 'next/navigation';
import { getMeOperateurAction } from '@/app/actions/auth';
import { getOperatorToken } from '@/lib/session';
import { fetchPlatformAbilities } from '@/lib/platform-abilities';
import { SuperAdminShell } from '@/components/layout/SuperAdminShell';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';
import { configurationDoubleFacteurExigee } from '@/lib/double-facteur';
import { GardeDoubleFacteur } from '@/components/auth/GardeDoubleFacteur';


/**
 * Super-admin layout (TCK-145). Server-side guard: any user without the
 * `super_admin` role is redirected to `/app` before children render — no
 * client flash of admin-only UI.
 *
 * URL note: the ticket text mentions `/admin/*`, but `/admin` is already
 * owned by the agency_admin dashboard (TCK-131, hors-périmètre). The
 * super-admin area lives under `/super-admin/*` to avoid collision; the
 * intent (dedicated namespace, distinct shell, server-side gate) is
 * preserved.
 *
 * i18n (TCK-337) : frontière de dictionnaire — ensemble CUMULÉ. ⚠ `property` y entre par une voie
 * que le relevé littéral ne voit pas : `SuperAdminPropertiesFilters` passe
 * `PROPERTY_ENUM_NAMESPACES.status` à `useTranslations`. C'est le repli de constantes de la garde
 * qui l'a trouvé ; écrite à la main, la table aurait cassé cet écran-là.
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TCK-166 — preserve the originally-requested URL when an anonymous
  // visitor lands on /super-admin so they bounce back here after sign-in.
  // `getMeAction` would also redirect when the token is missing, but it
  // strips the path; intercept here while we still have the context.
  // TCK-600 (ADR-0055 §6) — la console lit TOUJOURS avec le jeton de l'opérateur, même pendant une
  // session d'impersonation : l'espace applicatif, lui, lit en tant que la cible.
  const token = await getOperatorToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fsuper-admin');
  }

  const user = await getMeOperateurAction();

  // TCK-264 — A coopted super-admin who hasn't yet finished mandatory
  // 2FA enrollment must NOT see the console: their spatie role is
  // intentionally not attached until /confirm flips it on. Detour to
  // the onboarding wizard rather than bouncing to /app (which would
  // round-trip through another redirect for the same reason).
  //
  // TCK-589 — et plus largement : un super-admin sans second facteur, ou dont le support l'a
  // réinitialisé, ne voit pas la console. Le juge est partagé avec `(dashboard)`.
  const configuration = configurationDoubleFacteurExigee(user);
  if (configuration) {
    redirect(configuration);
  }
  // TCK-600 (ADR-0047) — la console s'ouvre à tout opérateur (`viewer`, `support`, `super_admin`),
  // pas au seul rôle `super_admin` : c'est le geste `platform.console.access`, lu à l'API, qui
  // juge. Ses gestes filtrent ensuite la console entière, sans que le front recopie la matrice.
  const habilitations = await fetchPlatformAbilities(token);
  if (!habilitations?.abilities.includes('platform.console.access')) {
    redirect('/app');
  }

  return (
    <IntlProvider messages={await messagesPour('(super-admin)/super-admin')}>
      <ToastProvider>
        <GardeDoubleFacteur>
          <SuperAdminShell user={user} abilities={habilitations}>{children}</SuperAdminShell>
          <Toaster />
        </GardeDoubleFacteur>
      </ToastProvider>
    </IntlProvider>
  );
}
