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
import { ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/console';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { isAdmin, isAgent as hasAgentRole, isOwner } from '@/lib/roles';
import { VisitFeedbackForm } from './VisitFeedbackForm';
import type { PropertyVisit } from '@/types/visit';
import type { Locale } from '@/i18n/config';
import { cn } from '@/lib/utils';
import { VISIT_STATUS_LABEL_KEY, VISIT_STATUS_TONE, VISIT_TYPE_LABEL_KEY } from './visit-status';

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
  const [dialog, setDialog] = useState<VisitDialogKind | null>(null);

  const confirm = useConfirmVisit(id);
  const complete = useCompleteVisit(id);
  const cancel = useCancelVisit(id);
  const updateVisit = useUpdateVisit(id);
  const toast = useToast();

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  if (isError || !data) {
    // Un 403 n'est pas une panne : « réessayer » n'y changerait rien.
    const forbidden = visitQuery.error instanceof ApiError && visitQuery.error.status === 403;
    // La page n'a pas d'autre titre que celui de la visite : sans lui, l'écran d'erreur n'a
    // aucun h1 (mesuré sur une visite d'une autre agence, 403).
    return (
      <>
        <h1 className="sr-only">{tVisits('fallbackTitle', { id: String(id) })}</h1>
        {forbidden ? (
          <ErrorState message={t('forbidden')} />
        ) : (
          <ErrorState
            message={t('error')}
            onRetry={() => void visitQuery.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        )}
      </>
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

  // Revue design 2026-09-16 — l'annulation et la replanification passaient par
  // prompt natif du navigateur : un motif sans libellé et une date à taper au format « YYYY-MM-DD HH:mm ».
  // Elles passent par un `Dialog` (patron de `BookingDetail`) ; appels, paramètres et format
  // envoyé sont inchangés.
  async function submitCancel(reason: string) {
    await cancel.mutateAsync({ reason });
    toast.add({
      title: t('toasts.cancelled.title'),
      description: t('toasts.cancelled.description'),
      type: 'success',
    });
    setDialog(null);
    router.push('/app/visits');
  }

  async function submitReschedule(nextSlot: string) {
    const iso = new Date(nextSlot).toISOString();
    await updateVisit.mutateAsync({ scheduled_at: iso });
    toast.add({
      title: t('toasts.rescheduled.title'),
      description: t('toasts.rescheduled.description'),
      type: 'success',
    });
    setDialog(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/app/visits"
          className="-ml-1 inline-flex min-h-10 items-center rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
        >
          {t('back')}
        </Link>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="space-y-2">
          <h1 className="text-balance font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {visit.property?.title ?? tVisits('fallbackTitle', { id: String(visit.id) })}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={VISIT_STATUS_TONE[status]}
              label={tVisits(VISIT_STATUS_LABEL_KEY[status])}
              data-testid="visit-status"
            />
            <StatusBadge label={tVisits(VISIT_TYPE_LABEL_KEY[type])} />
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t('slot')}</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {formatDateTime(visit.scheduled_at, locale)}
              {typeof visit.duration_minutes === 'number' && visit.duration_minutes > 0 && (
                <> · {visit.duration_minutes} {tVisits('minutesUnit')}</>
              )}
            </dd>
          </div>
          {visit.notes && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t('notes')}</dt>
              <dd className="whitespace-pre-line text-pretty text-foreground">{visit.notes}</dd>
            </div>
          )}
          {visit.cancellation_reason && (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">{t('cancellationReason')}</dt>
              <dd className="text-pretty text-foreground">{visit.cancellation_reason}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">{t('requester.label')}</dt>
            <dd className="text-foreground">
              <RequesterSummary visit={visit} />
            </dd>
          </div>
          {visit.agent ? (
            <div>
              <dt className="text-muted-foreground">{t('support')}</dt>
              <dd className="font-medium text-foreground">
                {formatUserName(visit.agent) || t('assignedAgent')}
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Sous `sm`, les actions s'empilent en pleine largeur : cibles de 40 px, aucune coupée. */}
        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap">
          {canConfirm && (
            <Button onClick={handleConfirm} disabled={confirm.isPending} className="h-10 sm:h-8">
              {t('actions.confirm')}
            </Button>
          )}
          {canComplete && (
            <Button onClick={handleComplete} disabled={complete.isPending} variant="outline" className="h-10 sm:h-8">
              {t('actions.complete')}
            </Button>
          )}
          {canReschedule && (
            <Button onClick={() => setDialog('reschedule')} disabled={updateVisit.isPending} variant="outline" className="h-10 sm:h-8">
              {t('actions.reschedule')}
            </Button>
          )}
          {canCancel && (
            <Button
              onClick={() => setDialog('cancel')}
              disabled={cancel.isPending}
              variant="ghost"
              className="h-10 text-destructive hover:text-destructive sm:h-8"
            >
              {tCommon('actions.cancel')}
            </Button>
          )}
          {visit.property?.slug && (
            <Link
              href={`/properties/${visit.property.slug}`}
              className={cn(buttonVariants({ variant: 'outline' }), 'h-10 sm:h-8')}
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

      <VisitActionDialog
        kind={dialog}
        // `datetime-local` n'accepte que « AAAA-MM-JJTHH:MM » : la valeur par défaut est celle
        // que le prompt proposait, normalisée.
        defaultSlot={visit.scheduled_at?.slice(0, 16).replace(' ', 'T') ?? ''}
        pending={cancel.isPending || updateVisit.isPending}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onCancel={submitCancel}
        onReschedule={submitReschedule}
      />
    </div>
  );
}

type VisitDialogKind = 'cancel' | 'reschedule';

function VisitActionDialog({
  kind,
  defaultSlot,
  pending,
  onOpenChange,
  onCancel,
  onReschedule,
}: {
  kind: VisitDialogKind | null;
  defaultSlot: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (reason: string) => Promise<void>;
  onReschedule: (slot: string) => Promise<void>;
}) {
  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Une clé par ouverture : le champ repart vide (ou du créneau courant) à chaque fois. */}
        {kind ? (
          <VisitActionForm
            key={kind}
            kind={kind}
            defaultSlot={defaultSlot}
            pending={pending}
            onDismiss={() => onOpenChange(false)}
            onCancel={onCancel}
            onReschedule={onReschedule}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function VisitActionForm({
  kind,
  defaultSlot,
  pending,
  onDismiss,
  onCancel,
  onReschedule,
}: {
  kind: VisitDialogKind;
  defaultSlot: string;
  pending: boolean;
  onDismiss: () => void;
  onCancel: (reason: string) => Promise<void>;
  onReschedule: (slot: string) => Promise<void>;
}) {
  const t = useTranslations('visits.detail');
  const [value, setValue] = useState(kind === 'reschedule' ? defaultSlot : '');
  const [touched, setTouched] = useState(false);
  const fieldId = `visit-${kind}-field`;
  const errorId = `${fieldId}-error`;
  const trimmed = value.trim();
  const valid =
    kind === 'cancel'
      ? trimmed.length > 0
      : trimmed.length > 0 && !Number.isNaN(new Date(trimmed).getTime());
  const showError = touched && !valid;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    if (kind === 'cancel') await onCancel(trimmed);
    else await onReschedule(trimmed);
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t(`dialogs.${kind}.title`)}</DialogTitle>
        <DialogDescription>{t(`dialogs.${kind}.description`)}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <label htmlFor={fieldId} className="block text-sm font-medium text-foreground">
          {kind === 'cancel' ? t('cancellationReason') : t('dialogs.reschedule.label')}
        </label>
        {kind === 'cancel' ? (
          <Textarea
            id={fieldId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            rows={4}
            placeholder={t('dialogs.cancel.placeholder')}
            required
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
          />
        ) : (
          <Input
            id={fieldId}
            type="datetime-local"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            required
            className="h-10 tabular-nums sm:h-9"
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
          />
        )}
        {showError ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {t(`dialogs.${kind}.required`)}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          {t('dialogs.dismiss')}
        </Button>
        <Button
          type="submit"
          variant={kind === 'cancel' ? 'destructive' : 'default'}
          disabled={pending}
        >
          {pending ? t('dialogs.processing') : t(`dialogs.${kind}.submit`)}
        </Button>
      </DialogFooter>
    </form>
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
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {requester.phone ? (
            <a href={`tel:${requester.phone}`} className="tabular-nums hover:text-foreground hover:underline">
              {requester.phone}
            </a>
          ) : null}
          {requester.email ? (
            <a href={`mailto:${requester.email}`} className="break-all hover:text-foreground hover:underline">
              {requester.email}
            </a>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{requester.fallback}</p>
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
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-pretty text-muted-foreground sm:p-6">
        {t('feedback.locked')}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div>
        <h2 className="font-display text-base font-semibold tracking-tight text-foreground">
          {t('feedback.title')}
        </h2>
        <p className="text-xs text-muted-foreground">
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
        <p className="text-sm text-muted-foreground">
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
