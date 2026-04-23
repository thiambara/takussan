import { getMeAction } from '@/app/actions/auth';
import { MaintenanceForm } from '@/components/maintenance';

interface PageProps {
  readonly searchParams: Promise<{ property?: string; lease?: string }>;
}

/**
 * Report-a-problem page. Requires `?property=ID` — the form posts to
 * `POST /api/maintenance-requests`, which validates `property_id`
 * server-side. Adding an explicit gate here keeps the URL honest and
 * avoids rendering a form that can never submit.
 */
export default async function Page({ searchParams }: PageProps) {
  await getMeAction();
  const { property, lease } = await searchParams;

  const propertyId = property ? Number(property) : NaN;
  const leaseId = lease ? Number(lease) : null;

  if (!Number.isInteger(propertyId) || propertyId <= 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-app-ink">Nouvelle demande</h1>
          <p className="mt-1 text-sm text-app-ink-muted">
            Sélectionnez un bien depuis votre portefeuille pour démarrer une demande
            de maintenance.
          </p>
        </div>
        <div className="rounded-2xl bg-app-surface-1 p-8 text-center text-sm text-app-ink-muted">
          Ouvrez une demande depuis la page d&apos;un bien ou passez le paramètre
          <code className="mx-1 rounded bg-app-surface-2 px-1 py-0.5">?property=</code>
          dans l&apos;URL.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Nouvelle demande</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Décrivez le problème et joignez des photos si nécessaire.
        </p>
      </div>
      <MaintenanceForm
        propertyId={propertyId}
        leaseId={leaseId && Number.isInteger(leaseId) && leaseId > 0 ? leaseId : null}
      />
    </div>
  );
}
