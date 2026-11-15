'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Wrench } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { Pagination } from '@/components/console/Pagination';
import { EmptyState } from '@/components/feedback';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { formatCurrency } from '@/lib/format';
import {
  usePayServiceProviderBill,
  useRejectServiceProviderBill,
  useServiceProviderBills,
  useValidateServiceProviderBill,
} from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';
import type { PaginationMeta } from '@/types/api';
import type { ServiceProviderBill } from '@/types/invoice';

import { SERVICE_PROVIDER_BILL_STATUS_TONE } from './constants';
import { PageAuDelaDeLaDerniere } from './PageAuDelaDeLaDerniere';
import { densiteDeLAdresse, estAuDelaDeLaDernierePage, pageDeLAdresse } from './pagination-de-l-adresse';

interface ServiceProviderBillsTableProps {
  /**
   * `provider` : le prestataire lit ses factures et leur état de paiement, sans geste.
   * `agency` : le personnel qui tient `payouts.create` valide, rejette ou fait payer.
   */
  readonly mode: 'provider' | 'agency';
  /** Le reversement créé par « Payer » — l'appelant l'ouvre (approbation, marquage payé). */
  readonly onPaid?: (payoutId: number) => void;
  /**
   * TCK-2677 — le titre de la section reste pour les lecteurs d'écran, sans s'afficher : dans
   * « Argent », l'en-tête du registre (« Interventions ») le porte déjà.
   */
  readonly titreMasque?: boolean;
}

/**
 * TCK-594 (ADR-0039 §8) — les factures d'intervention.
 *
 * Valider n'est pas payer : une facture validée « refacturable » s'impute sur le prochain
 * reversement du bailleur ; sinon « Payer » crée un reversement au prestataire, soumis au seuil des
 * quatre yeux, que l'agence marque payé comme les autres. Le serveur refuse au prestataire de
 * valider sa propre facture (`segregation.approve`) ; le dépassement du devis se lit AVANT le geste.
 */
export function ServiceProviderBillsTable({ mode, onPaid, titreMasque = false }: ServiceProviderBillsTableProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('payments.serviceProviderBills');
  const tStatus = useTranslations('payments.serviceProviderBills.status');
  const messageErreur = useMessageErreurApi();
  const { user } = useAuth();
  const filtre = mode === 'provider' ? { provider_id: user?.id } : { agency_id: user?.agency_id ?? undefined };
  const page = usePageDesFactures(mode);
  const query = useServiceProviderBills({ ...filtre, page: page.page, per_page: page.parPage }, Boolean(user?.id));
  const validate = useValidateServiceProviderBill();
  const reject = useRejectServiceProviderBill();
  const pay = usePayServiceProviderBill();

  const [rechargeable, setRechargeable] = useState<Record<number, boolean>>({});
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(messageErreur(e, t('actionFailed')));
      return false;
    }
  };

  const actions = (bill: ServiceProviderBill) => {
    if (mode !== 'agency') return null;
    if (bill.status === 'pending_validation') {
      if (rejecting === bill.id) {
        return (
          <div className="flex min-w-64 flex-col gap-2">
            <Textarea
              aria-label={t('rejectionReason')}
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={reason.trim() === '' || reject.isPending}
                onClick={async () => {
                  if (await act(() => reject.mutateAsync({ id: bill.id, rejection_reason: reason.trim() }))) {
                    setRejecting(null);
                    setReason('');
                  }
                }}
              >
                {t('confirmReject')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        );
      }
      return (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="flex items-center gap-1.5 text-xs text-foreground">
            <input
              type="checkbox"
              checked={rechargeable[bill.id] ?? false}
              onChange={(e) => setRechargeable((prev) => ({ ...prev, [bill.id]: e.target.checked }))}
              className="size-4 rounded border-input accent-primary"
            />
            {t('rechargeable')}
          </label>
          <Button
            type="button"
            size="sm"
            disabled={validate.isPending}
            onClick={() =>
              void act(() =>
                validate.mutateAsync({ id: bill.id, rechargeable_to_landlord: rechargeable[bill.id] ?? false }),
              )
            }
          >
            {t('validate')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(bill.id)}>
            {t('reject')}
          </Button>
        </div>
      );
    }
    if (bill.status === 'validated' && !bill.rechargeable_to_landlord && bill.imputed_payout_id === null) {
      return (
        <Button
          type="button"
          size="sm"
          disabled={pay.isPending}
          onClick={async () => {
            setError(null);
            try {
              const res = await pay.mutateAsync({ id: bill.id });
              onPaid?.(res.data.id);
            } catch (e) {
              setError(messageErreur(e, t('actionFailed')));
            }
          }}
        >
          {t('pay')}
        </Button>
      );
    }
    return null;
  };

  return (
    <section aria-labelledby={`spb-${mode}-title`} className="space-y-3">
      <h2 id={`spb-${mode}-title`} className={titreMasque ? 'sr-only' : 'text-base font-semibold text-foreground'}>
        {mode === 'provider' ? t('providerTitle') : t('agencyTitle')}
      </h2>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <QueryBoundary
        query={query}
        loadingFallback={[0, 1].map((i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      >
        {(data) => {
          const rows = data.data ?? [];
          // TCK-2805 — une page au-delà de la dernière n'est pas une liste vide, dans les deux modes.
          if (data.meta && estAuDelaDeLaDernierePage(rows.length, data.meta)) {
            return (
              <PageAuDelaDeLaDerniere meta={data.meta} allerA={page.sorte === 'voisine' ? page.allerA : undefined} />
            );
          }
          if (rows.length === 0) {
            return (
              <EmptyState
                icon={<Wrench className="size-8" aria-hidden="true" />}
                title={t('emptyTitle')}
                description={mode === 'provider' ? t('emptyProvider') : t('emptyAgency')}
              />
            );
          }
          return (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-left text-sm tabular-nums">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">{t('reference')}</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">{t('intervention')}</th>
                      <th className="px-3 py-2 text-right font-medium whitespace-nowrap">{t('amount')}</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">{t('statusLabel')}</th>
                      {mode === 'agency' ? <th className="px-3 py-2" aria-label={t('actions')} /> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((bill) => (
                      <tr key={bill.id} className="align-top text-foreground">
                        <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap text-muted-foreground">
                          {bill.reference_number ?? `#${bill.id}`}
                          {bill.provider_reference ? <span className="block">{bill.provider_reference}</span> : null}
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                          {bill.maintenance_request_id ? `#${bill.maintenance_request_id}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                          {formatCurrency(bill.amount, locale, { currency: bill.currency || 'XOF' })}
                          {bill.exceeds_quote ? (
                            <span className="block text-xs font-normal text-destructive">{t('exceedsQuote')}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          <StatusBadge tone={SERVICE_PROVIDER_BILL_STATUS_TONE[bill.status] ?? 'neutral'} label={tStatus(bill.status)} />
                          {bill.status === 'rejected' && bill.rejection_reason ? (
                            <span className="mt-1 block max-w-64 text-muted-foreground">{bill.rejection_reason}</span>
                          ) : null}
                          {bill.status === 'validated' && bill.rechargeable_to_landlord ? (
                            <span className="mt-1 block text-muted-foreground">{t('rechargedToLandlord')}</span>
                          ) : null}
                        </td>
                        {mode === 'agency' ? <td className="px-3 py-2.5 text-right">{actions(bill)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.meta ? <PaginationDesFactures meta={data.meta} page={page} /> : null}
            </div>
          );
        }}
      </QueryBoundary>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TCK-2750 — le registre se pagine : au-delà des 20 premières, les factures se lisent.
// ─────────────────────────────────────────────────────────────────────────────

type PageDesFactures =
  | { readonly sorte: 'registre'; readonly page: number; readonly parPage: number }
  | { readonly sorte: 'voisine'; readonly page: number; readonly parPage: number; readonly allerA: (page: number) => void };

/** Le paramètre d'adresse de la page des factures du prestataire — `InterventionsDeLAgence` lit `page`. */
const PARAMETRE_PAGE_PRESTATAIRE = 'factures_page';

/**
 * Où vit la page — toujours dans l'adresse : elle survit au retour arrière et au rechargement.
 *
 * - **L'agence** (« Argent », l'onglet `bills` de `/app/payments`) : `?page=` et `?per_page=`, par
 *   `PropertyPagination`, comme « Factures » et « Reversements » — un lien se partage, la densité se
 *   choisit. Changer d'onglet ou de mois réécrit l'adresse sans `page` : on revient à la première page.
 * - **Le prestataire** : `?factures_page=`. Sur `/app/maintenance`, son registre se pose sous la liste
 *   des interventions, qui lit déjà `?page=` — partager le paramètre ferait tourner les deux listes
 *   ensemble ; avec le sien, chacune pagine seule.
 */
function usePageDesFactures(mode: 'provider' | 'agency'): PageDesFactures {
  const recherche = useSearchParams();
  const router = useRouter();
  // TCK-2805 — la lecture commune à tout `/app/payments` (`pagination-de-l-adresse`) : une seule
  // liste de densités, celle du sélecteur de `PropertyPagination`.
  if (mode === 'agency') {
    return { sorte: 'registre', page: pageDeLAdresse(recherche), parPage: densiteDeLAdresse(recherche) };
  }
  return {
    sorte: 'voisine',
    page: pageDeLAdresse(recherche, PARAMETRE_PAGE_PRESTATAIRE),
    parPage: 20,
    allerA: (page) => {
      const params = new URLSearchParams(recherche?.toString() ?? '');
      if (page <= 1) params.delete(PARAMETRE_PAGE_PRESTATAIRE);
      else params.set(PARAMETRE_PAGE_PRESTATAIRE, String(page));
      router.replace(`?${params.toString()}`, { scroll: false });
    },
  };
}

function PaginationDesFactures({ meta, page }: { readonly meta: PaginationMeta; readonly page: PageDesFactures }) {
  const t = useTranslations('propertyDashboard.pagination');
  if (page.sorte === 'registre') return <PropertyPagination meta={meta} />;
  const derniere = Math.max(meta.last_page, 1);
  return (
    <Pagination
      page={meta.current_page}
      lastPage={derniere}
      onChange={page.allerA}
      summary={
        derniere > 1 ? (
          <span className="text-xs text-muted-foreground">
            {t('pageOf', { current: meta.current_page, total: derniere })} · {t('results', { count: meta.total })}
          </span>
        ) : undefined
      }
    />
  );
}
