import { getMeAction } from '@/app/actions/auth';
import { LeaseDetail } from '@/components/leases/LeaseDetail';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getMeAction();
  const { id } = await params;
  const leaseId = Number(id);

  if (!Number.isFinite(leaseId) || leaseId <= 0) {
    return (
      <div className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        Bail introuvable.
      </div>
    );
  }

  return <LeaseDetail leaseId={leaseId} />;
}
