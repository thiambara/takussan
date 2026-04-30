import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAgent, isAdmin, isOwner, isCustomer } from '@/lib/roles';

/**
 * /app/overview — role dispatcher. Redirects to the role-specific dashboard.
 */
export default async function OverviewPage() {
  const user = await getMeAction();
  const roles = user.roles;

  if (isAdmin(roles)) redirect('/app/overview/agency');
  if (isAgent(roles)) redirect('/app/overview/agent');
  if (isOwner(roles)) redirect('/app/overview/owner');
  if (isCustomer(roles)) redirect('/app/overview/tenant');

  redirect('/app/overview/tenant');
}
