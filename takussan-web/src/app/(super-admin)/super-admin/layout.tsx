import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isSuperAdmin } from '@/lib/roles';
import { SuperAdminShell } from '@/components/layout/SuperAdminShell';
import { ToastProvider, Toaster } from '@/components/ui/toast';

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
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getMeAction();
  if (!isSuperAdmin(user.roles)) {
    redirect('/app');
  }

  return (
    <ToastProvider>
      <>
        <SuperAdminShell user={user}>{children}</SuperAdminShell>
        <Toaster />
      </>
    </ToastProvider>
  );
}
