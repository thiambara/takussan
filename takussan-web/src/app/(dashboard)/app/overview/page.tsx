import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isAgent, isAdmin, isOwner, isCustomer, isServiceProvider, isTenant } from '@/lib/roles';

export default async function OverviewPage() {
  const user = await getMeAction();
  const roles = user.roles;

  if (isAdmin(roles)) redirect('/app/overview/agency');
  if (isAgent(roles)) redirect('/app/overview/agent');
  if (isOwner(roles)) redirect('/app/overview/owner');
  if (isServiceProvider(roles)) redirect('/app/overview/tenant');
  if (isCustomer(roles) || isTenant(roles)) redirect('/app/overview/tenant');

  redirect('/app/overview/tenant');
}
