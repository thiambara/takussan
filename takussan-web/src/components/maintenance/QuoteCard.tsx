'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { MaintenanceRequest } from '@/types/maintenance';
import type { Locale } from '@/i18n/config';
import { quoteDecisionKey } from './labels';

export function QuoteCard({ request }: { readonly request: MaintenanceRequest }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('maintenance.quote');
  const tDecision = useTranslations('maintenance.quote.decisions');

  if (request.status === 'open' || request.status === 'acknowledged' || request.status === 'assigned') {
    return null;
  }

  if (request.status === 'quote_requested') {
    return (
      <div className="rounded-2xl bg-card p-5 border border-primary/20 bg-primary/5">
        <h3 className="text-sm font-semibold text-primary">{t('requested_title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('requested_body')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">{t('title')}</h3>
      
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('amount')}</dt>
          <dd className="mt-1 font-medium text-foreground">
            {request.quote_amount !== null
              ? formatCurrency(request.quote_amount, locale, {
                  currency: request.quote_currency ?? 'XOF',
                })
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
        <div className="mt-4 rounded-lg bg-red-50 p-3">
          <p className="text-sm font-medium text-red-800">{t('rejection_reason')}</p>
          <p className="mt-1 text-sm text-red-700">{request.quote_rejection_reason}</p>
        </div>
      )}
    </div>
  );
}
