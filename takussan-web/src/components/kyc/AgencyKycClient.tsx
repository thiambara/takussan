'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAgencyKyc } from '@/lib/queries/kyc';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { KycDocumentUploader, KycDossierTimeline } from './kyc-components';

export function AgencyKycClient({ agencyId }: { agencyId: number }) {
  const query = useQuery({
    queryKey: ['agency', agencyId, 'kyc'],
    queryFn: () => fetchAgencyKyc(agencyId),
  });

  if (query.isLoading) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Impossible de charger le dossier KYC.
        </CardContent>
      </Card>
    );
  }

  const dossier = query.data.data;

  return (
    <div className="space-y-4">
      <KycDossierTimeline dossier={dossier} />
      <KycDocumentUploader agencyId={agencyId} dossier={dossier} />
    </div>
  );
}
