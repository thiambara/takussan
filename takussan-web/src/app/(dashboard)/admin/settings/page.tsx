import { getMeAction } from '@/app/actions/auth';
import { StubPlaceholder } from '@/components/shared/StubPlaceholder';

export default async function Page() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Paramètres</h1>
        <p className="mt-1 text-sm text-app-ink-muted">Paramètres de l&apos;espace d&apos;administration</p>
      </div>
      <StubPlaceholder label="Paramètres" />
    </div>
  );
}
