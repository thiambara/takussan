'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { FileText, Send } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCan } from '@/hooks/useCan';

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

  // TCK-528 — chaque bouton suit la capacité que l'API juge désormais sur le profil actif
  // (`InvoicePolicy::create`, `PayoutPolicy::create`). Un propriétaire membre d'agence ne porte ni
  // l'une ni l'autre ; un rôle personnalisé peut porter l'une sans l'autre. Cacher un bouton
  // n'autorise rien : c'est le serveur qui refuse.
  // Les deux appels partagent la même requête (`['me','capabilities','active']`).
  const { can: peutFacturer, isLoading: facturationEnCours } = useCan('invoices.create');
  const { can: peutReverser, isLoading: reversementEnCours } = useCan('payouts.create');
  // Tant que le catalogue n'est pas arrivé, on réserve la place sans rien proposer : un bouton
  // rendu puis retiré (le locataire) ou absent puis apparu (l'agent) se verrait.
  const capacitesEnCours = facturationEnCours || reversementEnCours;

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
          {capacitesEnCours ? (
            <Skeleton className="h-8 w-72 max-w-full" aria-hidden="true" data-testid="payments-actions-loading" />
          ) : peutFacturer || peutReverser ? (
            <div className="flex flex-wrap gap-2">
              {peutFacturer ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setInvoiceOpen(true)}>
                  <FileText className="mr-1 size-4" aria-hidden="true" />
                  {t('actions.createInvoice')}
                </Button>
              ) : null}
              {peutReverser ? (
                <Button type="button" size="sm" onClick={() => setPayoutOpen(true)}>
                  <Send className="mr-1 size-4" aria-hidden="true" />
                  {t('actions.createPayout')}
                </Button>
              ) : null}
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
