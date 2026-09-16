'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText, Send } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useMyCapabilities } from '@/hooks/useCan';

import { CreateInvoiceDialog } from './CreateInvoiceDialog';
import { CreatePayoutDialog } from './CreatePayoutDialog';
import { InvoiceDetailDialog } from './InvoiceDetailDialog';
import { InvoicesTable } from './InvoicesTable';
import { PayoutDetailDialog } from './PayoutDetailDialog';
import { PayoutsTable } from './PayoutsTable';
import { PaymentsHistoryFilters } from './PaymentsHistoryFilters';
import { PaymentsHistoryTable } from './PaymentsHistoryTable';

const TAB_VALUES = ['history', 'invoices', 'payouts'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(value: string | null): value is TabValue {
  return !!value && (TAB_VALUES as readonly string[]).includes(value);
}

interface PaymentsTabsProps {
  readonly defaultCommissionRate?: number;
}

export function PaymentsTabs({ defaultCommissionRate }: PaymentsTabsProps) {
  const t = useTranslations('payments');
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: TabValue = isTabValue(searchParams.get('tab'))
    ? (searchParams.get('tab') as TabValue)
    : 'history';

  // Le locataire voyait « Générer une facture » et « Créer un reversement » : deux gestes que
  // l'API lui refuse. On ne les propose qu'à un membre d'agence (au moins une capacité).
  // ⚠ PAS `useCan('invoices.create' | 'payouts.create')` : l'API ne juge encore aucune des deux
  // (TCK-528), et `payouts.create` n'est accordée à AUCUN profil — la lire ici retirerait à
  // l'agent et au propriétaire des gestes que le serveur accepte. À resserrer avec TCK-528.
  const { data: capacites } = useMyCapabilities();
  const estMembreAgence = (capacites?.data.capabilities.length ?? 0) > 0;

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [payoutId, setPayoutId] = useState<number | null>(null);

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'history') {
        params.delete('tab');
      } else {
        params.set('tab', next);
      }
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?');
    },
    [router, searchParams],
  );

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="history">{t('tabs.history')}</TabsTrigger>
            <TabsTrigger value="invoices">{t('tabs.invoices')}</TabsTrigger>
            <TabsTrigger value="payouts">{t('tabs.payouts')}</TabsTrigger>
          </TabsList>
          {estMembreAgence ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setInvoiceOpen(true)}>
                <FileText className="mr-1 size-4" aria-hidden="true" />
                {t('actions.createInvoice')}
              </Button>
              <Button type="button" size="sm" onClick={() => setPayoutOpen(true)}>
                <Send className="mr-1 size-4" aria-hidden="true" />
                {t('actions.createPayout')}
              </Button>
            </div>
          ) : null}
        </div>

        <TabsContent value="history" className="space-y-4">
          <PaymentsHistoryFilters />
          <PaymentsHistoryTable />
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4">
          <InvoicesTable onSelect={setInvoiceId} />
        </TabsContent>

        <TabsContent value="payouts" className="space-y-4">
          <PayoutsTable onSelect={setPayoutId} />
        </TabsContent>
      </Tabs>

      <CreateInvoiceDialog
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        onCreated={(id) => setInvoiceId(id)}
      />
      <CreatePayoutDialog
        open={payoutOpen}
        onOpenChange={setPayoutOpen}
        onCreated={(id) => setPayoutId(id)}
        defaultCommissionRate={defaultCommissionRate}
      />
      <InvoiceDetailDialog invoiceId={invoiceId} onClose={() => setInvoiceId(null)} />
      <PayoutDetailDialog payoutId={payoutId} onClose={() => setPayoutId(null)} />
    </div>
  );
}
