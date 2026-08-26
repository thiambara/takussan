'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDateTime } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import {
  useMaintenanceRequest,
  useTransitionMaintenanceStatus,
} from '@/lib/queries/maintenance';
import type { MaintenanceRequest, MaintenanceStatus } from '@/types/maintenance';
import { MAINTENANCE_TRANSITIONS } from '@/types/maintenance';

import {
  MaintenancePriorityBadge,
  MaintenanceStatusBadge,
} from './MaintenanceStatusBadge';
import { MaintenanceCompleteForm } from './MaintenanceCompleteForm';
import { MaintenanceStepper } from './MaintenanceStepper';
import { QuoteCard } from './QuoteCard';
import { QuoteSubmitForm } from './QuoteSubmitForm';
import { QuoteRejectionModal } from './QuoteRejectionModal';
import { 
  useApproveMaintenanceQuote, 
  useRequestMaintenanceQuote, 
  useStartMaintenance 
} from '@/lib/queries/maintenance';

/**
 * Detail screen — renders the request payload plus the action bar
 * (status transitions, completion workflow).
 */
export function MaintenanceDetail({ id }: { readonly id: number }) {
  const query = useMaintenanceRequest(id);

  return (
    <QueryBoundary query={query}>
      {(payload) => <MaintenanceDetailBody request={payload.data} />}
    </QueryBoundary>
  );
}

function MaintenanceDetailBody({ request }: { readonly request: MaintenanceRequest }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('maintenance.detail');
  const tCategory = useTranslations('maintenance.category');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground">{request.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {tCategory(request.category)} ·{' '}
              {t('created_at', { date: formatDateTime(request.created_at, locale) })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <MaintenancePriorityBadge priority={request.priority} />
            <MaintenanceStatusBadge status={request.status} />
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">{request.description}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-xs text-muted-foreground md:grid-cols-4">
          <div>
            <dt className="font-semibold uppercase tracking-wide">{t('property')}</dt>
            <dd className="mt-0.5 text-foreground">
              <PropertyValue request={request} />
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">{t('requester')}</dt>
            <dd className="mt-0.5 text-foreground">
              {personLabel(request.requester) ?? t('requester_missing')}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">{t('assignee')}</dt>
            <dd className="mt-0.5 text-foreground">
              {personLabel(request.assignee) ?? t('unassigned')}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">{t('scheduled_for')}</dt>
            <dd className="mt-0.5 text-foreground">
              {request.scheduled_at ? formatDateTime(request.scheduled_at, locale) : '—'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold uppercase tracking-wide">{t('actual_cost')}</dt>
            <dd className="mt-0.5 text-foreground">
              {request.actual_cost !== null
                ? formatCurrency(request.actual_cost, locale)
                : '—'}
            </dd>
          </div>
        </dl>
      </header>

      <MaintenanceStepper request={request} />
      <QuoteCard request={request} />
      <QuoteSubmitForm request={request} />

      <StatusActions 
        request={request} 
        onComplete={() => setCompleteOpen(true)} 
        onReject={() => setRejectOpen(true)}
      />

      <QuoteRejectionModal
        id={request.id}
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
      />

      {completeOpen ? (
        <MaintenanceCompleteForm
          id={request.id}
          onClose={() => setCompleteOpen(false)}
        />
      ) : null}

      {request.resolution_notes ? (
        <section className="rounded-2xl bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">{t('resolution_notes')}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
            {request.resolution_notes}
          </p>
          {request.completed_at ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('completed_at', { date: formatDateTime(request.completed_at, locale) })}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function PropertyValue({ request }: { readonly request: MaintenanceRequest }) {
  const t = useTranslations('maintenance.detail');
  const property = request.property;
  if (!property) {
    return <span>{t('property_missing')}</span>;
  }

  const content = (
    <>
      <span className="font-medium">{property.title}</span>
      {property.location?.full ? (
        <span className="mt-0.5 block text-muted-foreground">{property.location.full}</span>
      ) : null}
    </>
  );

  if (property.slug) {
    return (
      <Link href={`/app/properties/${property.id}`} className="hover:underline">
        {content}
      </Link>
    );
  }

  return content;
}

function personLabel(person: MaintenanceRequest['assignee']): string | null {
  if (!person) return null;
  return person.name || person.email || person.username || null;
}

function StatusActions({
  request,
  onComplete,
  onReject,
}: {
  readonly request: MaintenanceRequest;
  readonly onComplete: () => void;
  readonly onReject: () => void;
}) {
  const t = useTranslations('maintenance.detail');
  const tStatus = useTranslations('maintenance.status');
  const transition = useTransitionMaintenanceStatus(request.id);
  const requestQuoteMutation = useRequestMaintenanceQuote(request.id);
  const approveQuoteMutation = useApproveMaintenanceQuote(request.id);
  const startWorkMutation = useStartMaintenance(request.id);

  const allowed = MAINTENANCE_TRANSITIONS[request.status];

  if (allowed.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-5 text-sm text-muted-foreground">
        {t('terminal', { status: tStatus(request.status) })}
      </div>
    );
  }

  const trigger = (next: MaintenanceStatus) => {
    if (next === 'completed') {
      onComplete();
      return;
    }
    
    // Quote flow handles special transitions via their own endpoints
    if (next === 'quote_requested') {
      requestQuoteMutation.mutate();
      return;
    }
    if (next === 'approved') {
      approveQuoteMutation.mutate();
      return;
    }
    if (next === 'rejected') {
      onReject();
      return;
    }
    if (next === 'in_progress' && request.status === 'approved') {
      startWorkMutation.mutate();
      return;
    }

    // Default transition (open -> acknowledged, assigned -> in_progress, etc.)
    transition.mutate({ status: next });
  };

  const isPending = 
    transition.isPending || 
    requestQuoteMutation.isPending || 
    approveQuoteMutation.isPending || 
    startWorkMutation.isPending;

  return (
    <div className="rounded-2xl bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground">{t('change_status')}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {allowed.map((next) => (
          <Button
            key={next}
            type="button"
            variant={next === 'cancelled' || next === 'rejected' ? 'outline' : 'default'}
            disabled={isPending}
            onClick={() => trigger(next)}
            className={next === 'rejected' ? 'text-destructive border-destructive hover:bg-destructive/10' : ''}
          >
            {tStatus(next)}
          </Button>
        ))}
      </div>
      {transition.isError ? (
        <p className="mt-2 text-xs text-destructive">
          {t('transition_error')}
        </p>
      ) : null}
    </div>
  );
}
