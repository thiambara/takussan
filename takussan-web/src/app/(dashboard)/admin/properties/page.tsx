import { redirect } from 'next/navigation';
import { getMeAction } from '@/app/actions/auth';
import { isSuperAdmin } from '@/lib/roles';
import { StubPlaceholder } from '@/components/shared/StubPlaceholder';

export default async function Page() {
  const user = await getMeAction();
  if (!isSuperAdmin(user.roles)) redirect('/admin');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Gestion des biens</h1>
        <p className="mt-1 text-sm text-app-ink-muted">Administration globale des biens</p>
      </div>
      <StubPlaceholder label="Biens (admin)" />
    </div>
  );
}
