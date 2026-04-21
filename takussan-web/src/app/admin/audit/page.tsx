import { getMeAction } from '@/app/actions/auth';
import { StubPlaceholder } from '@/components/shared/StubPlaceholder';

export default async function Page() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Journal d&apos;audit</h1>
        <p className="mt-1 text-sm text-app-ink-muted">Traçabilité des actions sensibles</p>
      </div>
      <StubPlaceholder label="Audit" />
    </div>
  );
}
