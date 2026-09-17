'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Send } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateInvoiceDialog } from '@/components/payments/CreateInvoiceDialog';
import { CreatePayoutDialog } from '@/components/payments/CreatePayoutDialog';
import { InvoiceDetailDialog } from '@/components/payments/InvoiceDetailDialog';
import { InvoicesTable } from '@/components/payments/InvoicesTable';
import { PaymentsHistoryFilters } from '@/components/payments/PaymentsHistoryFilters';
import { PaymentsHistoryTable } from '@/components/payments/PaymentsHistoryTable';
import { PayoutDetailDialog } from '@/components/payments/PayoutDetailDialog';
import { PayoutsTable } from '@/components/payments/PayoutsTable';

import { useCan } from '@/hooks/useCan';

import { OverduePaymentsTable } from './OverduePaymentsTable';
import { useTranslations } from 'next-intl';

/**
 * Les valeurs acceptées par `?tab=`.
 *
 * **Exportée depuis TCK-375** : le bloc de files de `/admin` renvoie vers
 * `/admin/finances?tab=impayes`, et un lien vers un onglet inexistant retomberait en silence sur
 * « encaissements » — la ligne mènerait à côté de ce qu'elle annonce, sans qu'aucun test ne le
 * voie. L'invariant se vérifie contre CETTE table, jamais contre une chaîne recopiée.
 */
export const TAB_VALUES = ['encaissements', 'factures', 'reversements', 'impayes'] as const;
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
   *
   * TCK-528 — nécessaire, plus suffisant : chaque bouton suit aussi SA capacité
   * (`invoices.create`, `payouts.create`), que l'API juge sur le profil actif.
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

  // TCK-528 — même règle que `PaymentsTabs` : un admin d'agence au rôle personnalisé peut ne porter
  // qu'une des deux capacités, et le serveur refuserait l'autre.
  const { can: peutFacturer, isLoading: facturationEnCours } = useCan('invoices.create');
  const { can: peutReverser, isLoading: reversementEnCours } = useCan('payouts.create');
  const capacitesEnCours = facturationEnCours || reversementEnCours;
  const emetFacture = !!canEmit && peutFacturer;
  const emetReversement = !!canEmit && peutReverser;

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
          {/* Quatre onglets mesurent ~340 px : à 360 ils touchaient le bord. Le ruban défile dans
              son conteneur plutôt que de pousser la page. */}
          <div className="-mx-1 max-w-full overflow-x-auto px-1">
            <TabsList>
              <TabsTrigger value="encaissements">{t('tabs.payments')}</TabsTrigger>
              <TabsTrigger value="factures">{t('tabs.invoices')}</TabsTrigger>
              <TabsTrigger value="reversements">{t('tabs.payouts')}</TabsTrigger>
              <TabsTrigger value="impayes">{t('tabs.overdue')}</TabsTrigger>
            </TabsList>
          </div>
          {canEmit && capacitesEnCours ? (
            <Skeleton className="h-8 w-72 max-w-full" aria-hidden="true" data-testid="finances-actions-loading" />
          ) : emetFacture || emetReversement ? (
            <div className="flex flex-wrap gap-2">
              {emetFacture ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setInvoiceOpen(true)}>
                  <FileText className="size-4" aria-hidden="true" />
                  {t('tabs.newInvoice')}
                </Button>
              ) : null}
              {emetReversement ? (
                <Button type="button" size="sm" onClick={() => setPayoutOpen(true)}>
                  <Send className="size-4" aria-hidden="true" />
                  {t('tabs.newPayout')}
                </Button>
              ) : null}
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

      {emetFacture ? (
        <CreateInvoiceDialog
          open={invoiceOpen}
          onOpenChange={setInvoiceOpen}
          onCreated={(id) => setInvoiceId(id)}
        />
      ) : null}
      {emetReversement ? (
        <CreatePayoutDialog
          open={payoutOpen}
          onOpenChange={setPayoutOpen}
          onCreated={(id) => setPayoutId(id)}
          defaultCommissionRate={defaultCommissionRate}
        />
      ) : null}
      <InvoiceDetailDialog invoiceId={invoiceId} onClose={() => setInvoiceId(null)} />
      <PayoutDetailDialog payoutId={payoutId} onClose={() => setPayoutId(null)} />
    </div>
  );
}
