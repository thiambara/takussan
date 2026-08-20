'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { fetchAdminPlatformPayouts } from '@/lib/queries/super-admin';
import type { PlatformPayoutStatus } from '@/types/super-admin';
import { PayoutCloseDialog } from './PayoutCloseDialog';
import { PayoutDetailPanel } from './PayoutDetailPanel';
import { PayoutTable } from './PayoutTable';

const ALL_STATUS = '__all__';

/** Les valeurs d'enum sont la donnée ; le libellé se résout au rendu (TCK-292). */
const STATUS_VALUES = [
  'pending',
  'approved',
  'processing',
  'paid',
  'failed',
  'cancelled',
] as const;

export function AdminPayoutsClient() {
  const t = useTranslations('billing.platformPayouts');
  const tFilters = useTranslations('billing.platformPayouts.filters');
  const tStatus = useTranslations('billing.platformPayouts.status');
  const [agencyFilter, setAgencyFilter] = useState('');
  const [status, setStatus] = useState<PlatformPayoutStatus | ''>('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ['super-admin', 'payouts', { agency: agencyFilter, status }],
    queryFn: () =>
      fetchAdminPlatformPayouts({
        agencyId: agencyFilter ? Number(agencyFilter) : null,
        status: status || undefined,
        perPage: 30,
      }),
  });

  const payouts = query.data?.data ?? [];
  const total = query.data?.meta?.total ?? 0;
  const statuses: { value: string; label: string }[] = [
    { value: ALL_STATUS, label: tFilters('allStatuses') },
    ...STATUS_VALUES.map((value) => ({ value, label: tStatus(value) })),
  ];

  return (
    <div className="space-y-5">
      <PayoutCloseDialog defaultAgencyId={agencyFilter ? Number(agencyFilter) : null} />

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[180px_180px_1fr]">
          <Input
            type="number"
            placeholder={tFilters('agencyPlaceholder')}
            value={agencyFilter}
            onChange={(event) => setAgencyFilter(event.target.value)}
            aria-label={tFilters('agencyAria')}
          />
          <Select
            value={status || ALL_STATUS}
            onValueChange={(value) => setStatus(value === ALL_STATUS ? '' : ((value ?? '') as PlatformPayoutStatus | ''))}
            items={statuses}
          >
            <SelectTrigger className="h-9" aria-label={tFilters('statusAria')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statuses.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="self-center text-xs text-muted-foreground">
            {/* `total` part en CHAÎNE : ICU formaterait 1234 en « 1 234 », là où le JSX d'origine
                rendait le nombre brut. `count` reste un nombre — il ne sert qu'au pluriel. */}
            {t('count', { total: String(total), count: total })}
          </p>
        </CardContent>
      </Card>

      <PayoutTable
        payouts={payouts}
        isLoading={query.isLoading}
        onSelect={(payout) => setSelectedId(payout.id)}
      />

      {selectedId !== null ? (
        <PayoutDetailPanel payoutId={selectedId} onClose={() => setSelectedId(null)} />
      ) : null}
    </div>
  );
}
