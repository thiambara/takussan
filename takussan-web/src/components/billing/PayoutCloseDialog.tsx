'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';

import { closeAdminPlatformPayoutPeriod } from '@/lib/queries/super-admin';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/**
 * TCK-223 — Close-period composer. Period_end is required; agency_id is
 * optional (omit to fan out across all agencies with eligible payments).
 */
export function PayoutCloseDialog({ defaultAgencyId }: { defaultAgencyId?: number | null }) {
  const t = useTranslations('billing.platformPayouts.close');
  const tBilling = useTranslations('billing');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [agencyId, setAgencyId] = useState(defaultAgencyId ? String(defaultAgencyId) : '');

  const mutation = useMutation({
    mutationFn: () =>
      closeAdminPlatformPayoutPeriod({
        period_end: periodEnd,
        agency_id: agencyId ? Number(agencyId) : null,
      }),
    onSuccess: async (result) => {
      const count = result.data.length;
      toast.add({
        // `total` part en CHAÎNE : ICU formaterait 1234 en « 1 234 », là où le gabarit d'origine
        // rendait le nombre brut. `count` reste un nombre — il ne sert qu'au pluriel.
        title: count === 0
          ? t('toastNone')
          : t('toastCreated', { total: String(count), count }),
        type: count === 0 ? 'info' : 'success',
      });
      await queryClient.invalidateQueries({ queryKey: ['super-admin', 'payouts'] });
    },
    onError: (error) => {
      toast.add({ title: t('toastFailed'), description: messageErreur(error, tBilling('retryLater')), type: 'error' });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-[160px_180px_auto]">
        <DatePicker
          value={periodEnd}
          onValueChange={setPeriodEnd}
          aria-label={t('periodEndAria')}
        />
        <Input
          type="number"
          placeholder={t('agencyPlaceholder')}
          value={agencyId}
          onChange={(event) => setAgencyId(event.target.value)}
          aria-label={t('agencyAria')}
        />
        <Button
          type="button"
          disabled={!periodEnd || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
          {t('submit')}
        </Button>
      </CardContent>
    </Card>
  );
}

