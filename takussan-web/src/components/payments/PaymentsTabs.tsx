'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Send } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: TabValue = isTabValue(searchParams.get('tab'))
    ? (searchParams.get('tab') as TabValue)
    : 'history';

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
            <TabsTrigger value="history">Historique</TabsTrigger>
            <TabsTrigger value="invoices">Factures</TabsTrigger>
            <TabsTrigger value="payouts">Payouts</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setInvoiceOpen(true)}>
              <FileText className="mr-1 size-4" aria-hidden="true" />
              Générer une facture
            </Button>
            <Button type="button" size="sm" onClick={() => setPayoutOpen(true)}>
              <Send className="mr-1 size-4" aria-hidden="true" />
              Créer un reversement
            </Button>
          </div>
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
