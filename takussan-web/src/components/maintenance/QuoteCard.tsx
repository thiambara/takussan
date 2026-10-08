'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import type { MaintenanceRequest } from '@/types/maintenance';
import type { Locale } from '@/i18n/config';
import { quoteDecisionKey } from './labels';

export function QuoteCard({ request }: { readonly request: MaintenanceRequest }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('maintenance.quote');
  const tDecision = useTranslations('maintenance.quote.decisions');
  const tLines = useTranslations('maintenance.intervention.quote');

  if (request.status === 'open' || request.status === 'acknowledged' || request.status === 'assigned') {
    return null;
  }

  if (request.status === 'quote_requested') {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
        <h2 className="font-display text-base font-semibold text-primary">{t('requested_title')}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{t('requested_body')}</p>
      </div>
    );
  }

  // TCK-592 (P13) — le demandeur qui n'est que demandeur ne reçoit plus les `quote_*` : clés
  // ABSENTES. Sans ce garde-fou, la carte formatait un montant `undefined`.
  if (request.quote_submitted_at === undefined) {
    return null;
  }

  const lines = request.quote_lines ?? [];
  const currency = request.quote_currency ?? 'XOF';

  return (
    <div className="rounded-xl bg-card p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold text-foreground">{t('title')}</h2>
      
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm tabular-nums lg:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('amount')}</dt>
          <dd className="mt-1 font-medium whitespace-nowrap text-foreground">
            {request.quote_amount !== null && request.quote_amount !== undefined
              ? formatCurrency(request.quote_amount, locale, { currency })
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('submitted_at')}</dt>
          <dd className="mt-1 text-foreground">
            {request.quote_submitted_at ? formatDateTime(request.quote_submitted_at, locale) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('decision')}</dt>
          <dd className="mt-1 text-foreground">
            <span className="font-medium">{tDecision(quoteDecisionKey(request))}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('decision_at')}</dt>
          <dd className="mt-1 text-foreground">
            {request.quote_decision_at ? formatDateTime(request.quote_decision_at, locale) : '—'}
          </dd>
        </div>
      </dl>

      {lines.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm tabular-nums">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="py-1 pr-3 font-semibold">{tLines('line_label')}</th>
                <th scope="col" className="py-1 pr-3 font-semibold">{tLines('line_kind')}</th>
                <th scope="col" className="py-1 pr-3 text-right font-semibold">{tLines('line_quantity')}</th>
                <th scope="col" className="py-1 pr-3 text-right font-semibold">{tLines('line_unit_price')}</th>
                <th scope="col" className="py-1 text-right font-semibold">{tLines('line_total')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="border-t border-border">
                  <td className="py-1.5 pr-3 text-foreground">{line.label}</td>
                  <td className="py-1.5 pr-3 text-muted-foreground">{tLines(`kinds.${line.kind}`)}</td>
                  <td className="py-1.5 pr-3 text-right">{Number(line.quantity)}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap">
                    {formatCurrency(Number(line.unit_price), locale, { currency })}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {formatCurrency(Number(line.total), locale, { currency })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {request.quote_valid_until || request.quote_estimated_duration_days ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {request.quote_valid_until
            ? tLines('valid_until', { date: formatDate(request.quote_valid_until, locale, { dateStyle: 'medium' }) })
            : null}
          {request.quote_valid_until && request.quote_estimated_duration_days ? ' · ' : null}
          {request.quote_estimated_duration_days
            ? tLines('duration', { days: request.quote_estimated_duration_days })
            : null}
        </p>
      ) : null}

      {request.quote_decision_by ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {t('decided_by', {
            name:
              request.quote_decision_by.name
              ?? request.quote_decision_by.email
              ?? t('unknown_user'),
          })}
        </p>
      ) : null}

      {request.status === 'rejected' && request.quote_rejection_reason && (
        <div className="mt-4 rounded-lg bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">{t('rejection_reason')}</p>
          <p className="mt-1 text-sm text-destructive">{request.quote_rejection_reason}</p>
        </div>
      )}
    </div>
  );
}
