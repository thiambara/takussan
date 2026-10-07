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

import {
  MaintenancePriorityBadge,
  MaintenanceStatusBadge,
} from './MaintenanceStatusBadge';
import { MaintenanceAccessKit } from './MaintenanceAccessKit';
import { MaintenanceAssignmentBlock } from './MaintenanceAssignmentBlock';
import { MaintenanceCompleteForm } from './MaintenanceCompleteForm';
import { MaintenanceGallery } from './MaintenanceGallery';
import { MaintenanceProviderResponse } from './MaintenanceProviderResponse';
import { MaintenanceResolutionResponse } from './MaintenanceResolutionResponse';
import { MaintenanceStepper } from './MaintenanceStepper';
import { QuoteActions } from './QuoteActions';
import { QuoteCard } from './QuoteCard';
import { QuoteSubmitForm } from './QuoteSubmitForm';

/**
 * Fiche d'une intervention.
 *
 * TCK-592 — « le serveur dit ce qui est permis » : chaque action naît de `request.abilities`,
 * calculé par l'API pour l'utilisateur qui lit. La table de transitions recopiée ici proposait au
 * prestataire d'approuver son propre devis et, après un refus, un bouton voué au 422.
 */
export function MaintenanceDetail({ id }: { readonly id: number }) {
  const query = useMaintenanceRequest(id);

  return (
    <QueryBoundary query={query}>
      {(payload) => <MaintenanceDetailBody request={payload.data} />}
    </QueryBoundary>
  );
}

const TERMINAL: readonly MaintenanceStatus[] = ['closed', 'cancelled'];

function MaintenanceDetailBody({ request }: { readonly request: MaintenanceRequest }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('maintenance.detail');
  const tCategory = useTranslations('maintenance.category');
  const [completeOpen, setCompleteOpen] = useState(false);
  const abilities = request.abilities;

  return (
    <div className="space-y-6">
      <header className="rounded-xl bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-60">
            <h2 className="font-display text-lg font-semibold tracking-tight break-words text-balance text-foreground">
              {request.title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {tCategory(request.category)} ·{' '}
              {t('created_at', { date: formatDateTime(request.created_at, locale) })}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <MaintenancePriorityBadge priority={request.priority} />
            <MaintenanceStatusBadge status={request.status} />
          </div>
        </div>

        <p className="mt-4 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {request.description}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-xs text-muted-foreground tabular-nums lg:grid-cols-4">
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
            <dd className="mt-0.5 whitespace-nowrap text-foreground">
              {request.actual_cost !== null
                ? formatCurrency(request.actual_cost, locale)
                : '—'}
            </dd>
          </div>
        </dl>
      </header>

      {/* Le prestataire : « J'accepte / Je refuse » d'abord, puis son kit de terrain. */}
      <MaintenanceProviderResponse request={request} />
      <MaintenanceAccessKit request={request} />

      {abilities?.can_assign ? <MaintenanceAssignmentBlock request={request} /> : null}

      <MaintenanceStepper request={request} />
      <QuoteCard request={request} />
      <QuoteActions request={request} />
      {abilities?.can_submit_quote ? <QuoteSubmitForm request={request} /> : null}

      <MaintenanceResolutionResponse request={request} />

      <StatusActions request={request} onComplete={() => setCompleteOpen(true)} />

      {completeOpen && abilities?.can_complete ? (
        <MaintenanceCompleteForm id={request.id} onClose={() => setCompleteOpen(false)} />
      ) : null}

      <MaintenanceGallery request={request} />

      {request.resolution_notes ? (
        <section className="rounded-xl bg-card p-4 sm:p-5">
          <h2 className="font-display text-base font-semibold text-foreground">{t('resolution_notes')}</h2>
          <p className="mt-2 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground">
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

/**
 * TCK-592 — la fiche du bien n'est proposée qu'au donneur d'ordre : elle menait le prestataire
 * (et le locataire) à un refus. Le kit d'accès tient lieu d'adresse pour le prestataire.
 */
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

  if (property.slug && request.abilities?.can_manage_quotes) {
    return (
      <Link
        href={`/app/properties/${property.id}`}
        className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
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

/**
 * Les cibles de `PUT …/status` que l'API accorde à CET utilisateur — et « Marquer terminé », qui a
 * son formulaire (`PUT …/complete`, photos comprises).
 */
function StatusActions({
  request,
  onComplete,
}: {
  readonly request: MaintenanceRequest;
  readonly onComplete: () => void;
}) {
  const t = useTranslations('maintenance.detail');
  const tStatus = useTranslations('maintenance.status');
  const transition = useTransitionMaintenanceStatus(request.id);

  if (TERMINAL.includes(request.status)) {
    return (
      <div className="rounded-xl bg-card p-4 text-sm text-muted-foreground sm:p-5">
        {t('terminal', { status: tStatus(request.status) })}
      </div>
    );
  }

  const targets = (request.abilities?.transitions ?? []).filter((next) => next !== 'completed');
  const canComplete = request.abilities?.can_complete === true;

  if (targets.length === 0 && !canComplete) {
    return null;
  }

  return (
    <div className="rounded-xl bg-card p-4 sm:p-5">
      <h2 className="font-display text-base font-semibold text-foreground">{t('change_status')}</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {canComplete ? (
          <Button type="button" onClick={onComplete} className="h-11 sm:h-9">
            {tStatus('completed')}
          </Button>
        ) : null}
        {targets.map((next) => (
          <Button
            key={next}
            type="button"
            variant={next === 'cancelled' ? 'outline' : 'default'}
            disabled={transition.isPending}
            onClick={() => transition.mutate({ status: next })}
            className="h-11 sm:h-9"
          >
            {tStatus(next)}
          </Button>
        ))}
      </div>
      {transition.isError ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {t('transition_error')}
        </p>
      ) : null}
    </div>
  );
}
