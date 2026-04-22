import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

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
  return <>{children}</>;
}
