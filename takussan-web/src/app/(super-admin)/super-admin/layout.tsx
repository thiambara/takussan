import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { isSuperAdmin } from '@/lib/roles';
import { SuperAdminShell } from '@/components/layout/SuperAdminShell';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';


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
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fsuper-admin');
  }

  const user = await getMeAction();

  // TCK-264 — A coopted super-admin who hasn't yet finished mandatory
  // 2FA enrollment must NOT see the console: their spatie role is
  // intentionally not attached until /confirm flips it on. Detour to
  // the onboarding wizard rather than bouncing to /app (which would
  // round-trip through another redirect for the same reason).
  if (user.force_2fa_at_first_login) {
    redirect('/onboarding/super-admin');
  }
  if (!isSuperAdmin(user.roles)) {
    redirect('/app');
  }

  return (
    <IntlProvider messages={await messagesPour('(super-admin)/super-admin')}>
      <ToastProvider>
        <>
          <SuperAdminShell user={user}>{children}</SuperAdminShell>
          <Toaster />
        </>
      </ToastProvider>
    </IntlProvider>
  );
}
