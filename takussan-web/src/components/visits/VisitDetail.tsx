'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  useCancelVisit,
  useCompleteVisit,
  useConfirmVisit,
  useUpdateVisit,
  useVisit,
} from '@/lib/queries/visits';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/lib/format';
import { ErrorState } from '@/components/feedback';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { isAdmin, isAgent as hasAgentRole, isOwner } from '@/lib/roles';
import { VisitFeedbackForm } from './VisitFeedbackForm';
import type { PropertyVisit, VisitStatus, VisitType } from '@/types/visit';
import type { Locale } from '@/i18n/config';

/**
 * TCK-292 — tables hors composant : elles transportent la CLÉ (relative au namespace `visits`),
 * le rendu la résout. Mêmes clés que `VisitsList.tsx` : un seul vocabulaire de statut.
 */
const STATUS_LABEL_KEY: Record<VisitStatus, string> = {
  scheduled: 'status.scheduled',
  confirmed: 'status.confirmed',
  completed: 'status.completed',
  cancelled: 'status.cancelled',
  no_show: 'status.no_show',
};

const TYPE_LABEL_KEY: Record<VisitType, string> = {
  in_person: 'type.in_person',
  virtual: 'type.virtual',
  self_guided: 'type.self_guided',
  hybrid: 'type.hybrid',
};

const FEEDBACK_WINDOW_HOURS = 24;

export function VisitDetail({ id }: { id: number }) {
  const visitQuery = useVisit(id);
  const { data, isLoading, isError } = visitQuery;
  const locale = useLocale() as Locale;
  const t = useTranslations('visits.detail');
  const tVisits = useTranslations('visits');
  const tCommon = useTranslations('common');
  const { user } = useAuth();
  const router = useRouter();
  const [renderedAt] = useState(() => Date.now());

  const confirm = useConfirmVisit(id);
  const complete = useCompleteVisit(id);
  const cancel = useCancelVisit(id);
  const updateVisit = useUpdateVisit(id);
  const toast = useToast();

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-xl bg-card" />;
  }

  if (isError || !data) {
    return (
      <ErrorState
        message={t('error')}
        onRetry={() => void visitQuery.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  const visit = data.data;
  const status = visit.status ?? 'scheduled';
  const type = visit.type ?? 'in_person';
  const isVisitor =
    (!!user?.id && user.id === visit.visitor_id) ||
    (!!user?.id && !!visit.customer && user.id === visit.customer.user_id);
  const isAssignedAgent = user?.id === visit.agent_id;
  const isManager = user ? isOwner(user.roles) || hasAgentRole(user.roles) || isAdmin(user.roles) : false;
  const feedbackLocked = !isFeedbackOpen(visit);
  const scheduledAtMs = visit.scheduled_at ? new Date(visit.scheduled_at).getTime() : Number.NaN;
  const isPastSlot = Number.isFinite(scheduledAtMs) && scheduledAtMs <= renderedAt;
  const canConfirm = isManager && status === 'scheduled';
  const canCancel = (isVisitor || isManager) && (status === 'scheduled' || status === 'confirmed');
  const canComplete =
    isManager &&
    (status === 'confirmed' || status === 'scheduled') &&
    (isPastSlot || status === 'confirmed');
  const canReschedule = isManager && (status === 'scheduled' || status === 'confirmed');

  async function handleConfirm() {
    await confirm.mutateAsync();
    toast.add({
      title: t('toasts.confirmed.title'),
      description: t('toasts.confirmed.description'),
      type: 'success',
    });
  }

  async function handleComplete() {
    await complete.mutateAsync({});
    toast.add({
      title: t('toasts.completed.title'),
      description: t('toasts.completed.description'),
      type: 'success',
    });
  }

  async function handleCancel() {
    const reason = window.prompt(t('cancellationReason'))?.trim();
    if (!reason) return;
    await cancel.mutateAsync({ reason });
    toast.add({
      title: t('toasts.cancelled.title'),
      description: t('toasts.cancelled.description'),
      type: 'success',
    });
    router.push('/app/visits');
  }

  async function handleReschedule() {
    const nextSlot = window.prompt(
      t('prompts.newSlot'),
      visit.scheduled_at?.slice(0, 16).replace('T', ' ') ?? '',
    )?.trim();
    if (!nextSlot) return;
    const iso = new Date(nextSlot.replace(' ', 'T')).toISOString();
    await updateVisit.mutateAsync({ scheduled_at: iso });
    toast.add({
      title: t('toasts.rescheduled.title'),
      description: t('toasts.rescheduled.description'),
      type: 'success',
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/visits" className="text-xs text-muted-foreground hover:underline">
          {t('back')}
        </Link>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-stone-900">
            {visit.property?.title ?? tVisits('fallbackTitle', { id: String(visit.id) })}
          </h1>
          <Badge variant="outline">{tVisits(STATUS_LABEL_KEY[status])}</Badge>
          <Badge variant="outline">{tVisits(TYPE_LABEL_KEY[type])}</Badge>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-stone-500">{t('slot')}</dt>
            <dd className="font-medium text-stone-900">
              {formatDateTime(visit.scheduled_at, locale)}
              {typeof visit.duration_minutes === 'number' && visit.duration_minutes > 0 && (
                <> · {visit.duration_minutes} {tVisits('minutesUnit')}</>
              )}
            </dd>
          </div>
          {visit.notes && (
            <div className="sm:col-span-2">
              <dt className="text-stone-500">{t('notes')}</dt>
              <dd className="text-stone-900">{visit.notes}</dd>
            </div>
          )}
          {visit.cancellation_reason && (
            <div className="sm:col-span-2">
              <dt className="text-stone-500">{t('cancellationReason')}</dt>
              <dd className="text-stone-900">{visit.cancellation_reason}</dd>
            </div>
          )}
          <div>
            <dt className="text-stone-500">{t('requester.label')}</dt>
            <dd className="text-stone-900">
              <RequesterSummary visit={visit} />
            </dd>
          </div>
          {visit.agent ? (
            <div>
              <dt className="text-stone-500">{t('support')}</dt>
              <dd className="font-medium text-stone-900">
                {formatUserName(visit.agent) || t('assignedAgent')}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-2 pt-2">
          {canConfirm && (
            <Button onClick={handleConfirm} disabled={confirm.isPending}>
              {t('actions.confirm')}
            </Button>
          )}
          {canComplete && (
            <Button onClick={handleComplete} disabled={complete.isPending} variant="outline">
              {t('actions.complete')}
            </Button>
          )}
          {canReschedule && (
            <Button onClick={handleReschedule} disabled={updateVisit.isPending} variant="outline">
              {t('actions.reschedule')}
            </Button>
          )}
          {canCancel && (
            <Button
              onClick={handleCancel}
              disabled={cancel.isPending}
              variant="ghost"
              className="text-red-600 hover:text-red-700"
            >
              {tCommon('actions.cancel')}
            </Button>
          )}
          {visit.property?.slug && (
            <Link
              href={`/properties/${visit.property.slug}`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              {t('actions.viewProperty')}
            </Link>
          )}
        </div>
      </div>

      {status === 'completed' && (
        <FeedbackSection
          visit={visit}
          locked={feedbackLocked}
          canCustomer={isVisitor}
          canAgent={isAssignedAgent || isManager}
        />
      )}
    </div>
  );
}

function formatUserName(user: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email || '';
}

function RequesterSummary({ visit }: { visit: PropertyVisit }) {
  const t = useTranslations('visits.detail');
  const requester = resolveRequester(visit, t);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{requester.name}</span>
        {requester.customerId ? (
          <Link
            href={`/app/customers/${requester.customerId}`}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {t('requester.crmLink')}
          </Link>
        ) : null}
      </div>
      {requester.email || requester.phone ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
          {requester.phone ? (
            <a href={`tel:${requester.phone}`} className="hover:text-stone-900">
              {requester.phone}
            </a>
          ) : null}
          {requester.email ? (
            <a href={`mailto:${requester.email}`} className="hover:text-stone-900">
              {requester.email}
            </a>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-stone-500">{requester.fallback}</p>
      )}
    </div>
  );
}

/**
 * `t` est passé en paramètre : cette fonction vit hors composant, elle ne peut pas appeler
 * `useTranslations` elle-même (TCK-292).
 */
function resolveRequester(visit: PropertyVisit, t: ReturnType<typeof useTranslations>): {
  name: string;
  email: string | null;
  phone: string | null;
  customerId: number | null;
  fallback: string;
} {
  if (visit.customer) {
    return {
      name: formatUserName(visit.customer) || t('requester.crmFallbackName', { id: String(visit.customer.id) }),
      email: visit.customer.email ?? null,
      phone: visit.customer.phone ?? null,
      customerId: visit.customer.id,
      fallback: t('requester.crmNoContact'),
    };
  }

  if (visit.visitor) {
    return {
      name: formatUserName(visit.visitor) || t('requester.userFallbackName'),
      email: visit.visitor.email ?? null,
      phone: visit.visitor.phone ?? null,
      customerId: null,
      fallback: t('requester.userNoContact'),
    };
  }

  const anonymousName = visit.visitor_name?.trim() || t('requester.anonymousName');

  return {
    name: anonymousName,
    email: visit.visitor_email ?? null,
    phone: visit.visitor_phone ?? null,
    customerId: null,
    fallback: t('requester.anonymousNoContact'),
  };
}

function FeedbackSection({
  visit,
  locked,
  canCustomer,
  canAgent,
}: {
  visit: PropertyVisit;
  locked: boolean;
  canCustomer: boolean;
  canAgent: boolean;
}) {
  const t = useTranslations('visits.detail');
  const [submittedRole, setSubmittedRole] = useState<'customer' | 'agent' | null>(null);

  if (locked) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-500">
        {t('feedback.locked')}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-stone-900">{t('feedback.title')}</h3>
        <p className="text-xs text-stone-500">
          {t('feedback.window', { hours: String(FEEDBACK_WINDOW_HOURS) })}
        </p>
      </div>
      {canCustomer && submittedRole !== 'customer' && (
        <VisitFeedbackForm
          visitId={visit.id}
          role="customer"
          onSubmitted={() => setSubmittedRole('customer')}
        />
      )}
      {canAgent && submittedRole !== 'agent' && (
        <VisitFeedbackForm
          visitId={visit.id}
          role="agent"
          onSubmitted={() => setSubmittedRole('agent')}
        />
      )}
      {!canCustomer && !canAgent && (
        <p className="text-sm text-stone-500">
          {t('feedback.restricted')}
        </p>
      )}
    </div>
  );
}

/**
 * `completed_at + FEEDBACK_WINDOW_HOURS` is the cutoff. Returns `true` when
 * feedback can still be submitted from the client's perspective. Backend
 * re-enforces the same rule — this only drives the UI lock.
 */
function isFeedbackOpen(visit: PropertyVisit): boolean {
  if (visit.status !== 'completed' || !visit.completed_at) return false;
  const completedMs = new Date(visit.completed_at).getTime();
  if (Number.isNaN(completedMs)) return false;
  return Date.now() - completedMs <= FEEDBACK_WINDOW_HOURS * 3600 * 1000;
}
