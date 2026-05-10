import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { SuperAdminOnboardingWizard } from '@/components/super-admin/SuperAdminOnboardingWizard';
import { isSuperAdmin } from '@/lib/roles';
import { getToken } from '@/lib/session';

/**
 * TCK-264 — Mandatory landing page for a freshly-coopted super-admin.
 *
 * The acceptance flow lands here with `force_2fa_at_first_login = true`
 * and NO spatie super_admin role yet. The wizard is the only path that
 * can flip those: once it succeeds the user is redirected to the
 * super-admin console.
 *
 * Gating order:
 *  1. No bearer cookie → /auth/login (preserve return path).
 *  2. Already a super-admin AND no pending 2FA → /super-admin (don't
 *     re-show onboarding to a confirmed account).
 *  3. Otherwise → render the wizard.
 */
export const dynamic = 'force-dynamic';

export default async function SuperAdminOnboardingPage() {
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fonboarding%2Fsuper-admin');
  }

  const user = await getMeAction();

  // Skip the wizard for an already-confirmed super-admin who somehow
  // landed back on the onboarding URL (e.g. shared link, browser
  // history). The 2FA flag is the source of truth for "still in
  // pending state" — once /confirm flips it, the wizard has no work
  // left to do.
  if (isSuperAdmin(user.roles) && !user.force_2fa_at_first_login) {
    redirect('/super-admin');
  }

  return <SuperAdminOnboardingWizard firstName={user.first_name} />;
}
