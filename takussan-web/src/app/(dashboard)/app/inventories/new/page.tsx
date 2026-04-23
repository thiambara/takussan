import { getMeAction } from '@/app/actions/auth';
import { InventoryForm } from '@/components/inventory';

interface PageProps {
  readonly searchParams: Promise<{ lease?: string }>;
}

/**
 * Creation page. Requires `?lease=<leaseId>` — the backend derives the
 * property and the tenant from the lease, so we never ask the user to
 * pick them independently.
 */
export default async function Page({ searchParams }: PageProps) {
  await getMeAction();
  const { lease } = await searchParams;
  const leaseId = lease ? Number(lease) : NaN;

  if (!Number.isInteger(leaseId) || leaseId <= 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-app-ink">Nouvel état des lieux</h1>
          <p className="mt-1 text-sm text-app-ink-muted">
            Sélectionnez un bail pour démarrer un état des lieux.
          </p>
        </div>
        <div className="rounded-2xl bg-app-surface-1 p-8 text-center text-sm text-app-ink-muted">
          Ouvrez un inventaire depuis la page d&apos;un bail ou passez le paramètre
          <code className="mx-1 rounded bg-app-surface-2 px-1 py-0.5">?lease=</code>
          dans l&apos;URL.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Nouvel état des lieux</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Pièce par pièce, état et éléments, photos.
        </p>
      </div>
      <InventoryForm leaseId={leaseId} />
    </div>
  );
}
