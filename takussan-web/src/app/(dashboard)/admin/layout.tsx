import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AdminShell } from '@/components/layout/AdminShell';

/**
 * Admin dashboard layout — restricted to users with admin-level roles
 * (`super_admin`, `agency_admin`). Auth gate is enforced at the
 * `(dashboard)` group level; here we only add the role-based redirect.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/profile');
  return <AdminShell user={user}>{children}</AdminShell>;
}
