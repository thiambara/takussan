import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME } from '@/lib/constants';

/**
 * Dashboard route group layout.
 *
 * Protects every route under `(dashboard)` — i.e. `/app/*` and `/admin/*` —
 * by checking the auth cookie here rather than duplicating the gate in each
 * nested layout. The child layouts (`AppShell` and `AdminShell`) remain
 * responsible for their own chrome (topbar + sidebar).
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
  const cookieStore = await cookies();
  if (!cookieStore.get(AUTH_COOKIE_NAME)?.value) redirect('/auth/login');
  return <>{children}</>;
}
