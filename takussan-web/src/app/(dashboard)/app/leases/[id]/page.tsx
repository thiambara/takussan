import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';
import { ErrorState } from '@/components/feedback';
import { LeaseDetail } from '@/components/leases/LeaseDetail';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const leaseId = Number(id);
  if (!Number.isFinite(leaseId) || leaseId <= 0) {
    return { title: 'Bail introuvable' };
  }

  // Resolve the lease reference best-effort. A 401/404 here just means we
  // fall back to the generic title — the actual page rendering owns the
  // hard error path.
  try {
    const token = await getToken();
    if (!token) return { title: `Bail #${leaseId}` };
    const res = await apiRequest<{ data: { reference_number?: string | null } }>(
      `/api/leases/${leaseId}?fields[leases]=id,reference_number`,
      { token },
    );
    const ref = res.data?.reference_number;
    return { title: ref ? `Bail ${ref}` : `Bail #${leaseId}` };
  } catch {
    return { title: `Bail #${leaseId}` };
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getMeAction();
  const { id } = await params;
  const leaseId = Number(id);

  if (!Number.isFinite(leaseId) || leaseId <= 0) {
    // Server component : PAS d'`onRetry`. Réessayer ne changerait rien — l'identifiant
    // de l'URL est invalide, pas la requête.
    const t = await getTranslations('lease.detail');
    return <ErrorState message={t('error')} />;
  }

  return <LeaseDetail leaseId={leaseId} />;
}
