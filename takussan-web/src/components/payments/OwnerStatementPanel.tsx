'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError, urlApiPublique } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useOwnerStatement } from '@/lib/queries/payments';
import type { Locale } from '@/i18n/config';

/**
 * TCK-594 (ADR-0039 §3) — le relevé de gérance, à côté des versements du bailleur.
 *
 * Ce qui a été encaissé pour lui, ce que l'agence a retenu (commission, interventions refacturées),
 * le net, et ce qui lui a déjà été versé — pour un mois, ou pour l'année (l'attestation annuelle).
 * Le PDF et le CSV lisent le MÊME calcul que l'écran : ils se téléchargent avec le jeton de session,
 * l'URL seule ne suffit pas.
 */
export function OwnerStatementPanel() {
  const t = useTranslations('payments.ownerStatement');
  const locale = useLocale() as Locale;
  const messageErreur = useMessageErreurApi();
  const { token } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [annual, setAnnual] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'pdf' | 'csv' | null>(null);

  const period = annual ? month.slice(0, 4) : month;
  const { data, isLoading, isError, error } = useOwnerStatement(period);
  const statement = data?.data;
  const money = (amount: number) => formatCurrency(amount, locale, { currency: statement?.currency || 'XOF' });

  const download = async (format: 'pdf' | 'csv') => {
    setDownloading(format);
    setDownloadError(null);
    try {
      const response = await fetch(urlApiPublique(`/owner-statements/${format}?period=${encodeURIComponent(period)}`), {
        headers: {
          Accept: format === 'pdf' ? 'application/pdf' : 'text/csv',
          'Accept-Language': locale,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        throw new ApiError(response.status, await response.json().catch(() => null));
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `releve-${period}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setDownloadError(messageErreur(err, t('downloadFailed')));
    } finally {
      setDownloading(null);
    }
  };

  return (
    <section aria-labelledby="owner-statement-title" className="space-y-4 rounded-xl bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="owner-statement-title" className="text-base font-semibold text-foreground">
            {t('title')}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="owner-statement-month" className="mb-1 block text-xs font-medium text-muted-foreground">
              {t('month')}
            </label>
            <Input
              id="owner-statement-month"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="w-44"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={annual}
              onChange={(event) => setAnnual(event.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            {t('annual')}
          </label>
        </div>
      </div>

      {isLoading ? <Skeleton className="h-24 rounded-lg" /> : null}
      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(error, t('unavailable'))}
        </p>
      ) : null}

      {statement ? (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
            <Total label={t('gross')} value={money(statement.totals.gross)} />
            <Total label={t('commission')} value={money(-statement.totals.commission)} />
            <Total label={t('fees')} value={money(-statement.totals.fees)} />
            <Total label={t('net')} value={money(statement.totals.net)} strong />
            <Total label={t('paidOut')} value={money(statement.totals.paid_out)} />
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={downloading !== null} onClick={() => void download('pdf')}>
              <Download className="mr-1 size-4" aria-hidden="true" />
              {t('downloadPdf')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={downloading !== null} onClick={() => void download('csv')}>
              <Download className="mr-1 size-4" aria-hidden="true" />
              {t('downloadCsv')}
            </Button>
            {downloadError ? (
              <span role="alert" className="text-xs text-destructive">
                {downloadError}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={strong ? 'mt-0.5 text-right font-semibold tabular-nums text-foreground md:text-left' : 'mt-0.5 text-right tabular-nums text-foreground md:text-left'}>
        {value}
      </dd>
    </div>
  );
}
