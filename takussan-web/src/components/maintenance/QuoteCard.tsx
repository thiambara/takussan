'use client';

import { useLocale } from 'next-intl';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { MaintenanceRequest } from '@/types/maintenance';
import type { Locale } from '@/i18n/config';

export function QuoteCard({ request }: { readonly request: MaintenanceRequest }) {
  const locale = useLocale() as Locale;

  if (request.status === 'open' || request.status === 'acknowledged' || request.status === 'assigned') {
    return null;
  }

  if (request.status === 'quote_requested') {
    return (
      <div className="rounded-2xl bg-app-surface-1 p-5 border border-primary/20 bg-primary/5">
        <h3 className="text-sm font-semibold text-primary">Devis demandé</h3>
        <p className="mt-1 text-xs text-app-ink-muted">
          En attente de soumission du devis par le prestataire.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-app-surface-1 p-5">
      <h3 className="text-sm font-semibold text-app-ink">Devis</h3>
      
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold text-app-ink-muted uppercase tracking-wide">Montant</dt>
          <dd className="mt-1 font-medium text-app-ink">
            {request.quote_amount !== null
              ? formatCurrency(request.quote_amount, locale, {
                  currency: request.quote_currency ?? 'XOF',
                })
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-app-ink-muted uppercase tracking-wide">Soumis le</dt>
          <dd className="mt-1 text-app-ink">
            {request.quote_submitted_at ? formatDateTime(request.quote_submitted_at, locale) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-app-ink-muted uppercase tracking-wide">Décision</dt>
          <dd className="mt-1 text-app-ink">
            {request.status === 'approved' && <span className="text-green-600 font-medium">Approuvé</span>}
            {request.status === 'rejected' && <span className="text-red-600 font-medium">Rejeté</span>}
            {request.status === 'quote_submitted' && <span className="text-amber-600 font-medium">En attente</span>}
            {['in_progress', 'completed', 'closed'].includes(request.status) && <span className="text-green-600 font-medium">Approuvé</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-app-ink-muted uppercase tracking-wide">Date décision</dt>
          <dd className="mt-1 text-app-ink">
            {request.quote_decision_at ? formatDateTime(request.quote_decision_at, locale) : '—'}
          </dd>
        </div>
      </dl>

      {request.status === 'rejected' && request.quote_rejection_reason && (
        <div className="mt-4 rounded-lg bg-red-50 p-3">
          <p className="text-sm font-medium text-red-800">Motif du rejet</p>
          <p className="mt-1 text-sm text-red-700">{request.quote_rejection_reason}</p>
        </div>
      )}
    </div>
  );
}
