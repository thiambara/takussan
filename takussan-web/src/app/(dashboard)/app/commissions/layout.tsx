import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent } from '@/lib/roles';

/**
 * TCK-595 — le grand livre est celui du PERSONNEL d'une agence : l'API rend 403 à tout autre
 * compte. La garde vit dans le layout pour la raison de TCK-426 (un `redirect()` de page, sous un
 * `loading.tsx`, rendrait 200 et le squelette de la vue refusée).
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getMeAction();
  if (!isAgent(user.roles) && !isAdmin(user.roles)) redirect('/app');
  return <>{children}</>;
}
