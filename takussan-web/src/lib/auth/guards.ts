import { redirect } from 'next/navigation';
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import type { UserRole } from '@/types/user';

/**
 * Redirects to /app if the user does NOT hold an agent-scoped role.
 * Agent area pages call this before rendering, replacing the buggy
 * `forbidden()` that requires experimental.authInterrupts.
 */
export function assertCanReachAgentArea(roles: UserRole[]): void {
  if (!(isAgent(roles) || isOwner(roles) || isAdmin(roles))) {
    redirect('/app');
  }
}
