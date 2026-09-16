'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { AgencyCombobox } from '@/components/admin/super/AgencyCombobox';

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
      {/* Empilé sous `lg` : à 768 la carte n'a que ~420 px et la date se tronquait (TCK-505).
          Au-dessus, le bouton garde sa largeur au lieu de s'étirer sur la piste restante. */}
      <CardContent className="grid gap-3 lg:grid-cols-[200px_260px_auto] lg:justify-start">
        <DatePicker
          value={periodEnd}
          onValueChange={setPeriodEnd}
          aria-label={t('periodEndAria')}
          buttonClassName="h-10"
        />
        <AgencyCombobox
          value={agencyId}
          onChange={setAgencyId}
          label={t('agencyAria')}
          placeholder={t('agencyPlaceholder')}
        />
        <Button
          type="button"
          className="h-10"
          disabled={!periodEnd || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t('submit')}
        </Button>
      </CardContent>
    </Card>
  );
}

