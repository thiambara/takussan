import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { getAccountDeletionRequestAction } from '@/app/actions/account-deletion';
import { AccountDeletionBanner } from '@/components/profile/security/AccountDeletionBanner';

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
 * SEO: noindex for every dashboard page — these are authenticated, private.
 */
export const metadata: Metadata = {
  title: {
    template: '%s — Takussan',
    default: 'Tableau de bord — Takussan',
  },
  robots: { index: false, follow: false },
};

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await getMeAction();
  const deletion = await getAccountDeletionRequestAction();
  const pending = deletion.ok ? deletion.data : null;

  return (
    <>
      {pending && !pending.executed_at ? (
        <AccountDeletionBanner daysRemaining={pending.days_remaining} />
      ) : null}
      {children}
    </>
  );
}
