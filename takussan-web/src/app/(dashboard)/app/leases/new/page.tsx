import { getMeAction } from '@/app/actions/auth';
import { CreateLeaseForm } from '@/components/leases/CreateLeaseForm';

export const metadata = {
  title: 'Nouveau bail',
};

export default async function Page() {
  await getMeAction();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Nouveau bail</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Renseignez les parties, la durée et les conditions financières.
        </p>
      </div>
      <CreateLeaseForm />
    </div>
  );
}
