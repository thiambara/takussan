import { getMeAction } from '@/app/actions/auth';
import { VisitsList } from '@/components/visits/VisitsList';

export const metadata = {
  title: 'Mes visites',
};

export default async function Page() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Visites</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Planifiez et suivez vos visites.
        </p>
      </div>
      <VisitsList />
    </div>
  );
}
