import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { AdminShell } from '@/components/layout/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  if (!cookieStore.get(AUTH_COOKIE_NAME)?.value) redirect('/auth/login');
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/profile');
  return <AdminShell user={user}>{children}</AdminShell>;
}
