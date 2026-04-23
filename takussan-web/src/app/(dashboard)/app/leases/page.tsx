import Link from 'next/link';
import { getMeAction } from '@/app/actions/auth';
import { LeasesList } from '@/components/leases/LeasesList';

export default async function Page() {
  await getMeAction();
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-app-ink">Baux</h1>
          <p className="mt-1 text-sm text-app-ink-muted">
            Consultez et gérez vos contrats
          </p>
        </div>
        <Link
          href="/app/leases/new"
          className="inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Nouveau bail
        </Link>
      </div>
      <LeasesList />
    </div>
  );
}
