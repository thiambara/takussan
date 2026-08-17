'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Send } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { CreateInvoiceDialog } from '@/components/payments/CreateInvoiceDialog';
import { CreatePayoutDialog } from '@/components/payments/CreatePayoutDialog';
import { InvoiceDetailDialog } from '@/components/payments/InvoiceDetailDialog';
import { InvoicesTable } from '@/components/payments/InvoicesTable';
import { PaymentsHistoryFilters } from '@/components/payments/PaymentsHistoryFilters';
import { PaymentsHistoryTable } from '@/components/payments/PaymentsHistoryTable';
import { PayoutDetailDialog } from '@/components/payments/PayoutDetailDialog';
import { PayoutsTable } from '@/components/payments/PayoutsTable';

import { OverduePaymentsTable } from './OverduePaymentsTable';
import { useTranslations } from 'next-intl';

const TAB_VALUES = ['encaissements', 'factures', 'reversements', 'impayes'] as const;
type TabValue = (typeof TAB_VALUES)[number];

function isTabValue(value: string | null): value is TabValue {
  return !!value && (TAB_VALUES as readonly string[]).includes(value);
}

interface AdminFinancesTabsProps {
  /**
   * Default agency commission rate forwarded to the create-payout dialog.
   * Read from `/api/dashboard/agency` upstream to pre-fill the slider.
   */
  readonly defaultCommissionRate?: number;
  /**
   * `true` if the current actor can issue invoices and payouts. Falsy
   * disables the action buttons (the views remain readable).
   */
  readonly canEmit?: boolean;
}

/**
 * TCK-134 — 4-tab back-office finance dashboard. Mirrors the structure
 * of the user-facing `PaymentsTabs` (TCK-063) but reuses its tables
 * verbatim and adds an "Impayés" tab driven by `OverduePaymentsTable`.
 *
 * Tab state is mirrored in `?tab=...` so the URL is shareable and the
 * page is reload-safe.
 */
export function AdminFinancesTabs({ defaultCommissionRate, canEmit }: AdminFinancesTabsProps) {
  const t = useTranslations('admin.finances');
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: TabValue = isTabValue(searchParams.get('tab'))
    ? (searchParams.get('tab') as TabValue)
    : 'encaissements';

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);
  const [payoutId, setPayoutId] = useState<number | null>(null);

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'encaissements') {
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
            <TabsTrigger value="encaissements">{t('tabs.payments')}</TabsTrigger>
            <TabsTrigger value="factures">{t('tabs.invoices')}</TabsTrigger>
            <TabsTrigger value="reversements">{t('tabs.payouts')}</TabsTrigger>
            <TabsTrigger value="impayes">{t('tabs.overdue')}</TabsTrigger>
          </TabsList>
          {canEmit ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setInvoiceOpen(true)}>
                <FileText className="mr-1 size-4" aria-hidden="true" />
                {t('tabs.newInvoice')}
              </Button>
              <Button type="button" size="sm" onClick={() => setPayoutOpen(true)}>
                <Send className="mr-1 size-4" aria-hidden="true" />
                {t('tabs.newPayout')}
              </Button>
            </div>
          ) : null}
        </div>

        <TabsContent value="encaissements" className="space-y-4">
          <PaymentsHistoryFilters />
          <PaymentsHistoryTable />
        </TabsContent>

        <TabsContent value="factures" className="space-y-4">
          <InvoicesTable onSelect={setInvoiceId} />
        </TabsContent>

        <TabsContent value="reversements" className="space-y-4">
          <PayoutsTable onSelect={setPayoutId} />
        </TabsContent>

        <TabsContent value="impayes" className="space-y-4">
          <OverduePaymentsTable />
        </TabsContent>
      </Tabs>

      {canEmit ? (
        <>
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
        </>
      ) : null}
      <InvoiceDetailDialog invoiceId={invoiceId} onClose={() => setInvoiceId(null)} />
      <PayoutDetailDialog payoutId={payoutId} onClose={() => setPayoutId(null)} />
    </div>
  );
}
