import Link from 'next/link';

import { getMeAction } from '@/app/actions/auth';
import { MaintenanceDetail } from '@/components/maintenance';
import { buttonVariants } from '@/components/ui/button';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  await getMeAction();
  const { id } = await params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-app-ink">Demande introuvable</h1>
        <p className="text-sm text-app-ink-muted">
          L&apos;identifiant fourni n&apos;est pas valide.
        </p>
        <Link href="/app/maintenance" className={buttonVariants({ variant: 'default' })}>
          Retour à la liste
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-app-ink">Demande #{numericId}</h1>
          <p className="mt-1 text-sm text-app-ink-muted">
            Suivi de l&apos;intervention
          </p>
        </div>
        <Link href="/app/maintenance" className={buttonVariants({ variant: 'outline' })}>
          Retour
        </Link>
      </div>
      <MaintenanceDetail id={numericId} />
    </div>
  );
}
