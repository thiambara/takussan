import { getMeAction } from '@/app/actions/auth';
import { AppShell } from '@/components/layout/AppShell';

/**
 * App dashboard layout — for end-users (customer, agent, owner,
 * service_provider). Auth gate is enforced at the `(dashboard)` group level,
 * so we only need to hydrate the current user and render the shell here.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getMeAction();
  return <AppShell user={user}>{children}</AppShell>;
}
