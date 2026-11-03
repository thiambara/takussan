'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  useCancelVisit,
  useClaimVisit,
  useCompleteVisit,
  useMarkVisitNoShow,
  useConfirmVisit,
  useProposeVisitSlot,
  useUpdateVisit,
  useVisit,
} from '@/lib/queries/visits';
import { nomAffichable } from '@/lib/identite';
import { heureMuraleADakar, instantADakar } from '@/lib/visites/heure-de-dakar';
import { smsRetenu } from '@/lib/visites/sort-du-sms';
import { JOURS_DE_VISITE_OUVERTS, useCreneaux } from '@/lib/visites/useCreneaux';
import { decalerJour, jourDeLApi } from '@/lib/jour-de-l-api';
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
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
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
  const markNoShow = useMarkVisitNoShow(id);
  const cancel = useCancelVisit(id);
  const updateVisit = useUpdateVisit(id);
  const claim = useClaimVisit(id);
  const tPlanning = useTranslations('visitPlanning');
  const [proposer, setProposer] = useState(false);
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  // P182.01 — l'erreur d'un geste sans dialogue (confirmer, terminer, absent) se dit sous les
  // actions (ADR-0019) : sans `catch`, la promesse rejetée n'était rattrapée par rien.
  const [erreurGeste, setErreurGeste] = useState<string | null>(null);

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
  // P152.04 — les gestes de gestion suivent le verdict de l'API, pas le rôle : sur un bien
  // d'agence, le bailleur n'en a aucun (`visit.staff_only`). `isManager` ne garde que la
  // proposition de créneau et le retour d'agent, qu'une autre règle juge.
  const peutGerer = visit.abilities?.manage === true;
  const feedbackLocked = !isFeedbackOpen(visit);
  const scheduledAtMs = visit.scheduled_at ? new Date(visit.scheduled_at).getTime() : Number.NaN;
  const isPastSlot = Number.isFinite(scheduledAtMs) && scheduledAtMs <= renderedAt;
  const canConfirm = peutGerer && status === 'scheduled';
  const canCancel = (isVisitor || peutGerer) && (status === 'scheduled' || status === 'confirmed');
  const canComplete =
    peutGerer &&
    (status === 'confirmed' || status === 'scheduled') &&
    (isPastSlot || status === 'confirmed');
  // TCK-1375 (P115.05) — l'absence ne se déclare qu'une fois l'heure passée ; le serveur le
  // rejuge (`visit.cannot_mark_no_show`).
  const canMarkNoShow = peutGerer && (status === 'confirmed' || status === 'scheduled') && isPastSlot;
  const canReschedule = peutGerer && (status === 'scheduled' || status === 'confirmed');
  const isActive = status === 'scheduled' || status === 'confirmed';
  // TCK-590 — la visite déposée sur le site n'a pas d'agent : le personnel de l'agence la prend
  // en charge. Le serveur tranche la course (409 si un collègue l'a prise entre-temps).
  const canClaim =
    !!user && (hasAgentRole(user.roles) || isAdmin(user.roles)) && isActive && visit.agent_id == null;
  // Le visiteur ne pouvait qu'annuler : il propose désormais un autre créneau, tiré de la grille.
  const canPropose = isVisitor && !isManager && isActive && !!visit.property?.slug;

  async function handleClaim() {
    try {
      await claim.mutateAsync();
      toast.add({ title: tPlanning('claimed'), type: 'success' });
    } catch (err) {
      const conflict = err instanceof ApiError && err.status === 409;
      toast.add({ title: tPlanning(conflict ? 'claimConflict' : 'actionError'), type: 'error' });
    }
  }

  // TCK-590 (passe 3, R1) — un SMS retenu par une borne se dit à l'agent : sans ce signal, il
  // croyait le client prévenu.
  function signalerSmsRetenu(reponse: unknown) {
    if (smsRetenu(reponse)) {
      toast.add({
        title: tPlanning('smsWithheld.title'),
        description: tPlanning('smsWithheld.description'),
        type: 'warning',
      });
    }
  }

  async function geste(fn: () => Promise<void>) {
    setErreurGeste(null);
    try {
      await fn();
    } catch (e) {
      setErreurGeste(messageErreur(e));
    }
  }

  async function handleConfirm() {
    const reponse = await confirm.mutateAsync();
    toast.add({
      title: t('toasts.confirmed.title'),
      description: t('toasts.confirmed.description'),
      type: 'success',
    });
    signalerSmsRetenu(reponse);
  }

  async function handleComplete() {
    await complete.mutateAsync({});
    toast.add({
      title: t('toasts.completed.title'),
      description: t('toasts.completed.description'),
      type: 'success',
    });
  }

  async function handleNoShow() {
    await markNoShow.mutateAsync();
    toast.add({
      title: t('toasts.noShow.title'),
      description: t('toasts.noShow.description'),
      type: 'success',
    });
  }

  // Revue design 2026-09-16 — l'annulation et la replanification passaient par
  // prompt natif du navigateur : un motif sans libellé et une date à taper au format « YYYY-MM-DD HH:mm ».
  // Elles passent par un `Dialog` (patron de `BookingDetail`) ; appels, paramètres et format
  // envoyé sont inchangés.
  async function submitCancel(reason: string) {
    const reponse = await cancel.mutateAsync({ reason });
    toast.add({
      title: t('toasts.cancelled.title'),
      description: t('toasts.cancelled.description'),
      type: 'success',
    });
    signalerSmsRetenu(reponse);
    setDialog(null);
    router.push('/app/visits');
  }

  async function submitReschedule(nextSlot: string) {
    // TCK-590 — le champ se lit à l'heure de Dakar, comme la grille des visites : `new Date(champ)`
    // l'interprétait dans le fuseau du navigateur, et l'agent à Paris décalait la visite d'une heure.
    const iso = instantADakar(nextSlot.slice(0, 10), nextSlot.slice(11, 16));
    const reponse = await updateVisit.mutateAsync({ scheduled_at: iso });
    toast.add({
      title: t('toasts.rescheduled.title'),
      description: t('toasts.rescheduled.description'),
      type: 'success',
    });
    signalerSmsRetenu(reponse);
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
                {nomAffichable(visit.agent, t('assignedAgent'))}
              </dd>
            </div>
          ) : null}
        </dl>

        {erreurGeste ? (
          <p role="alert" className="text-sm text-destructive">
            {erreurGeste}
          </p>
        ) : null}

        {/* Sous `sm`, les actions s'empilent en pleine largeur : cibles de 40 px, aucune coupée. */}
        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:flex-wrap">
          {canClaim && (
            <Button onClick={() => void handleClaim()} disabled={claim.isPending} className="h-10 sm:h-8">
              {tPlanning('claim')}
            </Button>
          )}
          {canPropose && (
            <Button onClick={() => setProposer(true)} variant="outline" className="h-10 sm:h-8">
              {tPlanning('propose.cta')}
            </Button>
          )}
          {canConfirm && (
            <Button onClick={() => void geste(handleConfirm)} disabled={confirm.isPending} className="h-10 sm:h-8">
              {t('actions.confirm')}
            </Button>
          )}
          {canComplete && (
            <Button onClick={() => void geste(handleComplete)} disabled={complete.isPending} variant="outline" className="h-10 sm:h-8">
              {t('actions.complete')}
            </Button>
          )}
          {canMarkNoShow && (
            <Button onClick={() => void geste(handleNoShow)} disabled={markNoShow.isPending} variant="outline" className="h-10 sm:h-8">
              {t('actions.noShow')}
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

      {proposer && visit.property?.slug ? (
        <ProposerUnCreneau visitId={visit.id} slug={visit.property.slug} onClose={() => setProposer(false)} />
      ) : null}
    </div>
  );
}

/**
 * TCK-590 — le visiteur propose un autre créneau, choisi dans la grille que le serveur rend pour
 * ce bien (créneaux pris inclus, non choisissables). L'heure est construite à Dakar.
 */
function ProposerUnCreneau({ visitId, slug, onClose }: { visitId: number; slug: string; onClose: () => void }) {
  const t = useTranslations('visitPlanning');
  const tDetail = useTranslations('visits.detail');
  const toast = useToast();
  const propose = useProposeVisitSlot(visitId);
  const [jour, setJour] = useState('');
  const [heure, setHeure] = useState<string | null>(null);
  const creneaux = useCreneaux(slug, jour || null);
  // La fenêtre que l'API accepte : du jour UTC à J+60. Hors d'elle, le jour rendait
  // « L'action n'a pas abouti. » (P230.01).
  const [premierJour] = useState(() => jourDeLApi());

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (!jour || !heure) return;
    try {
      await propose.mutateAsync({ scheduled_at: instantADakar(jour, heure) });
      toast.add({ title: t('propose.success'), type: 'success' });
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? (err.data as { message?: string } | null)?.message : undefined;
      toast.add({ title: message ?? t('actionError'), type: 'error' });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void valider(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('propose.title')}</DialogTitle>
            <DialogDescription>{t('propose.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={`visit-${visitId}-propose-date`} className="block text-sm font-medium text-foreground">
              {t('plan.date')}
            </label>
            <Input
              id={`visit-${visitId}-propose-date`}
              type="date"
              min={premierJour}
              max={decalerJour(premierJour, JOURS_DE_VISITE_OUVERTS)}
              value={jour}
              onChange={(e) => {
                setJour(e.target.value);
                setHeure(null);
              }}
            />
          </div>
          {creneaux.etat === 'charge' ? (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-foreground">
                {t('plan.time')} <span className="font-normal text-muted-foreground">({t('plan.dakarTime')})</span>
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {creneaux.creneaux.map((c) => (
                  <Button
                    key={c.label}
                    type="button"
                    variant={heure === c.label ? 'default' : 'outline'}
                    disabled={!c.available}
                    aria-pressed={heure === c.label}
                    onClick={() => setHeure(c.label)}
                    className="h-10 tabular-nums disabled:text-muted-foreground sm:h-8"
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : creneaux.etat === 'erreur' ? (
            <p role="alert" className="text-sm text-destructive">
              {t('actionError')}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {tDetail('dialogs.dismiss')}
            </Button>
            <Button type="submit" disabled={!jour || !heure || propose.isPending}>
              {t('propose.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const messageErreur = useMessageErreurApi();
  const [value, setValue] = useState(kind === 'reschedule' ? defaultSlot : '');
  // P230.05 — `scheduled_at` `after:now` : le champ se lit à Dakar, son `min` est donc l'instant
  // présent à Dakar (`AAAA-MM-JJTHH:MM`), et non dans le fuseau du navigateur.
  const [maintenantADakar] = useState(() => heureMuraleADakar());
  const [touched, setTouched] = useState(false);
  // P182.01 — l'erreur de l'API se dit dans le dialogue, qui reste ouvert (ADR-0019).
  const [erreurApi, setErreurApi] = useState<string | null>(null);
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
    setErreurApi(null);
    try {
      if (kind === 'cancel') await onCancel(trimmed);
      else await onReschedule(trimmed);
    } catch (e) {
      setErreurApi(messageErreur(e));
    }
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
            min={maintenantADakar}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            required
            className="tabular-nums"
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
      {erreurApi ? (
        <p role="alert" className="text-sm text-destructive">
          {erreurApi}
        </p>
      ) : null}
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
      name: nomAffichable(visit.customer, t('requester.crmFallbackName', { id: String(visit.customer.id) })),
      email: visit.customer.email ?? null,
      phone: visit.customer.phone ?? null,
      customerId: visit.customer.id,
      fallback: t('requester.crmNoContact'),
    };
  }

  if (visit.visitor) {
    return {
      name: nomAffichable(visit.visitor, t('requester.userFallbackName')),
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
