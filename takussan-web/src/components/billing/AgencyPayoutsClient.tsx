'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { fetchMyPlatformPayouts } from '@/lib/queries/super-admin';
import { PayoutTable } from './PayoutTable';

export function AgencyPayoutsClient() {
  // ⚠ `emptyHint` n'est PAS dans `ATTRS_AFFICHAGE` du scanner (`scripts/i18n-scan.mjs`) : ce
  // libellé français était affiché et n'a JAMAIS été compté. Le total de la garde est un plancher,
  // pas un inventaire — TCK-292 le dit, et ce fichier en est le cas concret dans le lot H.
  const t = useTranslations('billing.platformPayouts.table');
  const query = useQuery({
    queryKey: ['me', 'payouts'],
    queryFn: fetchMyPlatformPayouts,
  });

  return (
    <PayoutTable
      payouts={query.data?.data ?? []}
      isLoading={query.isLoading}
      emptyHint={t('emptyForAgency')}
    />
  );
}
