'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { fetchAgencyKyc } from '@/lib/queries/kyc';
import { DUREE_URL_SIGNEE_KYC_MS, rafraichirAvantExpiration } from '@/lib/url-signee';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { KycDocumentUploader, KycDossierTimeline } from './kyc-components';

export function AgencyKycClient({ agencyId }: { agencyId: number }) {
  const t = useTranslations('kyc');
  const query = useQuery({
    queryKey: ['agency', agencyId, 'kyc'],
    queryFn: () => fetchAgencyKyc(agencyId),
    // TCK-1024 — les pièces portent un `signed_url` de 15 min.
    ...rafraichirAvantExpiration(DUREE_URL_SIGNEE_KYC_MS),
  });

  if (query.isLoading) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  if (query.isError || !query.data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          {t('loadError')}
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
