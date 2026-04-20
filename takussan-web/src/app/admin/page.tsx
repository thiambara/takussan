import { getMeAction } from '@/app/actions/auth';
import { StubPlaceholder } from '@/components/shared/StubPlaceholder';

export default async function Page() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Tableau de bord agence</h1>
        <p className="mt-1 text-sm text-app-ink-muted">Vue d&apos;ensemble de l&apos;agence</p>
      </div>
      <StubPlaceholder label="Tableau de bord agence" />
    </div>
  );
}
