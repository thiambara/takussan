'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale } from 'next-intl';
import {
  useCancelVisit,
  useCompleteVisit,
  useConfirmVisit,
  useUpdateVisit,
  useVisit,
} from '@/lib/queries/visits';
import { useAuth } from '@/context/AuthContext';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { isAdmin, isAgent as hasAgentRole, isOwner } from '@/lib/roles';
import { VisitFeedbackForm } from './VisitFeedbackForm';
import type { PropertyVisit, VisitStatus, VisitType } from '@/types/visit';
import type { Locale } from '@/i18n/config';

const STATUS_LABEL: Record<VisitStatus, string> = {
  scheduled: 'Demandée',
  confirmed: 'Confirmée',
  completed: 'Terminée',
  cancelled: 'Annulée',
  no_show: 'Absence',
};

const TYPE_LABEL: Record<VisitType, string> = {
  in_person: 'En personne',
  virtual: 'Virtuelle',
  self_guided: 'Autonome',
  hybrid: 'Hybride',
};

const FEEDBACK_WINDOW_HOURS = 24;

export function VisitDetail({ id }: { id: number }) {
  const { data, isLoading, isError } = useVisit(id);
  const locale = useLocale() as Locale;
  const { user } = useAuth();
  const router = useRouter();
  const [renderedAt] = useState(() => Date.now());

  const confirm = useConfirmVisit(id);
  const complete = useCompleteVisit(id);
  const cancel = useCancelVisit(id);
  const updateVisit = useUpdateVisit(id);
  const toast = useToast();

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-xl bg-app-surface-1" />;
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        Impossible de charger cette visite.
      </div>
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
      title: 'Visite confirmée',
      description: 'Le créneau est confirmé et les rappels restent gérés par le workflow existant.',
      type: 'success',
    });
  }

  async function handleComplete() {
    await complete.mutateAsync({});
    toast.add({
      title: 'Visite marquée effectuée',
      description: 'Le suivi post-visite est maintenant disponible.',
      type: 'success',
    });
  }

  async function handleCancel() {
    const reason = window.prompt('Motif d’annulation')?.trim();
    if (!reason) return;
    await cancel.mutateAsync({ reason });
    toast.add({
      title: 'Visite annulée',
      description: 'Le motif est enregistré sur la demande.',
      type: 'success',
    });
    router.push('/app/visits');
  }

  async function handleReschedule() {
    const nextSlot = window.prompt(
      'Nouveau créneau (format YYYY-MM-DD HH:mm)',
      visit.scheduled_at?.slice(0, 16).replace('T', ' ') ?? '',
    )?.trim();
    if (!nextSlot) return;
    const iso = new Date(nextSlot.replace(' ', 'T')).toISOString();
    await updateVisit.mutateAsync({ scheduled_at: iso });
    toast.add({
      title: 'Visite replanifiée',
      description: 'Le nouveau créneau est enregistré.',
      type: 'success',
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/visits" className="text-xs text-app-ink-muted hover:underline">
          ← Toutes les visites
        </Link>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-stone-900">
            {visit.property?.title ?? `Visite #${visit.id}`}
          </h1>
          <Badge variant="outline">{STATUS_LABEL[status]}</Badge>
          <Badge variant="outline">{TYPE_LABEL[type]}</Badge>
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-stone-500">Créneau</dt>
            <dd className="font-medium text-stone-900">
              {formatDateTime(visit.scheduled_at, locale)}
              {typeof visit.duration_minutes === 'number' && visit.duration_minutes > 0 && (
                <> · {visit.duration_minutes} min</>
              )}
            </dd>
          </div>
          {visit.notes && (
            <div className="sm:col-span-2">
              <dt className="text-stone-500">Notes</dt>
              <dd className="text-stone-900">{visit.notes}</dd>
            </div>
          )}
          {visit.cancellation_reason && (
            <div className="sm:col-span-2">
              <dt className="text-stone-500">Motif d’annulation</dt>
              <dd className="text-stone-900">{visit.cancellation_reason}</dd>
            </div>
          )}
          <div>
            <dt className="text-stone-500">Demandeur</dt>
            <dd className="font-medium text-stone-900">
              {formatVisitorName(visit)}
            </dd>
          </div>
          {visit.agent ? (
            <div>
              <dt className="text-stone-500">Accompagnement</dt>
              <dd className="font-medium text-stone-900">
                {formatUserName(visit.agent) || 'Agent assigné'}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-2 pt-2">
          {canConfirm && (
            <Button onClick={handleConfirm} disabled={confirm.isPending}>
              Confirmer la visite
            </Button>
          )}
          {canComplete && (
            <Button onClick={handleComplete} disabled={complete.isPending} variant="outline">
              Marquer effectuée
            </Button>
          )}
          {canReschedule && (
            <Button onClick={handleReschedule} disabled={updateVisit.isPending} variant="outline">
              Replanifier
            </Button>
          )}
          {canCancel && (
            <Button
              onClick={handleCancel}
              disabled={cancel.isPending}
              variant="ghost"
              className="text-red-600 hover:text-red-700"
            >
              Annuler
            </Button>
          )}
          {visit.property?.slug && (
            <Link
              href={`/properties/${visit.property.slug}`}
              className="inline-flex h-9 items-center justify-center rounded-md border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900 hover:bg-stone-50"
            >
              Voir le bien
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

function formatVisitorName(visit: PropertyVisit): string {
  if (visit.visitor_name) return visit.visitor_name;
  const userName = visit.visitor ? formatUserName(visit.visitor) : '';
  if (userName) return userName;
  if (visit.visitor_email) return visit.visitor_email;
  if (visit.customer_id) return `Customer #${visit.customer_id}`;
  return 'Demandeur non renseigné';
}

function formatUserName(user: {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.email || '';
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
  const [submittedRole, setSubmittedRole] = useState<'customer' | 'agent' | null>(null);

  if (locked) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-500">
        La fenêtre de feedback est fermée pour cette visite.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-stone-900">Feedback post-visite</h3>
        <p className="text-xs text-stone-500">
          Vous avez {FEEDBACK_WINDOW_HOURS}h après la visite pour laisser votre retour.
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
          Seuls le visiteur et l’agent peuvent laisser un retour sur cette visite.
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
