import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { getAccountDeletionRequestAction } from '@/app/actions/account-deletion';
import { AccountDeletionBanner } from '@/components/profile/security/AccountDeletionBanner';
import { ToastProvider, Toaster } from '@/components/ui/toast';
import { IntlProvider } from '@/i18n/IntlProvider';
import { messagesPour } from '@/i18n/messages';


/**
 * Dashboard route group layout.
 *
 * Protects every route under `(dashboard)` — i.e. `/app/*` and `/admin/*` —
 * by calling `getMeAction()`, which reads the auth cookie and actually hits
 * `/api/users/me`. A stale or revoked token triggers `clearToken()` +
 * redirect to `/auth/login` (handled inside `getMeAction`), so children
 * never render with an invalid session. Result is cached per-request so
 * nested layouts can call `getMeAction()` again without a duplicate fetch.
 *
 * TCK-080 — also fetches the user's pending RGPD deletion request and
 * surfaces a global red banner with the day-precise countdown when one
 * is active. Cancel button on the banner revokes the request inline.
 *
 * i18n (TCK-337) : frontière de dictionnaire. `(dashboard)` ne porte que sa propre chrome — les
 * deux sous-arbres `/app` et `/admin` ont chacun leur frontière, plus riche. ⚠ Un provider
 * imbriqué REMPLACE celui du parent : chaque entrée de la table est donc l'ensemble CUMULÉ.
 *
 * SEO: noindex for every dashboard page — these are authenticated, private.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.dashboard');
  return {
    title: {
      template: '%s — Takussan',
      default: t('title'),
    },
    robots: { index: false, follow: false },
  };
}

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getMeAction();

  // TCK-264 — A freshly-coopted super-admin lands here without their
  // spatie role yet (it's deferred until 2FA enrollment) but with
  // `force_2fa_at_first_login = true`. The dashboard isn't a valid
  // destination in that state — bounce them straight to the mandatory
  // onboarding wizard.
  if (user.force_2fa_at_first_login) {
    redirect('/onboarding/super-admin');
  }

  const deletion = await getAccountDeletionRequestAction();
  const pending = deletion.ok ? deletion.data : null;

  return (
    <IntlProvider messages={await messagesPour('(dashboard)')}>
      <ToastProvider>
        <>
          {pending && !pending.executed_at ? (
            <AccountDeletionBanner daysRemaining={pending.days_remaining} />
          ) : null}
          {children}
          <Toaster />
        </>
      </ToastProvider>
    </IntlProvider>
  );
}
