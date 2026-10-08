import { getMeAction } from '@/app/actions/auth';
import { assertCanReachAgentArea } from '@/lib/auth/guards';

/**
 * TCK-591 §3 — même garde que `customers/` : la page des tâches est un écran de l'espace agent.
 * Elle vit dans le LAYOUT, au-dessus de toute frontière de suspension (TCK-426).
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  assertCanReachAgentArea((await getMeAction()).roles);
  return <>{children}</>;
}
