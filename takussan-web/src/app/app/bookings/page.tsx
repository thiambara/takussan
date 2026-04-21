import { getMeAction } from '@/app/actions/auth';
import { StubPlaceholder } from '@/components/shared/StubPlaceholder';

export default async function Page() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Réservations</h1>
        <p className="mt-1 text-sm text-app-ink-muted">Gérez vos demandes de réservation</p>
      </div>
      <StubPlaceholder label="Réservations" />
    </div>
  );
}
