'use client';

import { useState } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';

import { InviteServiceProviderSheet } from '@/components/service-providers/InviteServiceProviderSheet';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import {
  useAssignableProviders,
  useUpdateMaintenanceRequest,
} from '@/lib/queries/maintenance';
import type { ServiceProviderProfileSummary } from '@/lib/queries/service-providers';
import type { MaintenanceRequest } from '@/types/maintenance';

const NONE = '__none__';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/**
 * TCK-592 (P1) — « Prestataire et créneau », pour le donneur d'ordre (`abilities.can_assign`).
 *
 * `useUpdateMaintenanceRequest` n'avait AUCUN appelant : aucun écran n'assignait ni ne planifiait.
 * Le choix se fait parmi les collaborations ACTIVES du carnet, du métier de la demande ; un
 * prestataire qui ne travaille pas le jour choisi est signalé (sans être refusé : ses disponibilités
 * sont une indication). « Inviter un nouveau prestataire » produit le lien profond : à la fin de son
 * inscription, la demande lui est assignée.
 */
export function MaintenanceAssignmentBlock({ request }: { readonly request: MaintenanceRequest }) {
  const t = useTranslations('maintenance.intervention.assignment');
  const { user } = useAuth();
  const messageErreur = useMessageErreurApi();
  const agencyId = request.property?.agency?.id ?? user?.agency_id ?? null;
  const providers = useAssignableProviders(agencyId, request.category);
  const update = useUpdateMaintenanceRequest(request.id);

  const [assignee, setAssignee] = useState<string>(
    request.assigned_to !== null ? String(request.assigned_to) : NONE,
  );
  const [scheduledAt, setScheduledAt] = useState<string>(toLocalValue(request.scheduled_at));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  const options = providerOptions(providers.data?.data ?? [], request);
  const chosen = providers.data?.data.find((p) => String(p.user_id) === assignee);
  const unavailable = chosen && scheduledAt ? !worksOn(chosen, scheduledAt) : false;

  const save = async () => {
    setSaved(false);
    await update.mutateAsync({
      assigned_to: assignee === NONE ? null : Number(assignee),
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    });
    setSaved(true);
  };

  return (
    <section className="rounded-xl bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-display text-base font-semibold text-foreground">{t('title')}</h2>
        {agencyId !== null ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus aria-hidden="true" />
            {t('invite')}
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col">
          <label htmlFor="maintenance-assignee" className="mb-1.5 text-sm font-medium">
            {t('provider_label')}
          </label>
          <Select
            value={assignee}
            onValueChange={(value) => setAssignee((value as string | null) ?? NONE)}
            items={[{ value: NONE, label: t('nobody') }, ...options]}
          >
            <SelectTrigger id="maintenance-assignee" className="h-11 w-full sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('nobody')}</SelectItem>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {providers.isError ? (
            <p className="mt-1 text-xs text-muted-foreground">{t('directory_unavailable')}</p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col">
          <label htmlFor="maintenance-scheduled-at" className="mb-1.5 text-sm font-medium">
            {t('slot_label')}
          </label>
          <DateTimePicker id="maintenance-scheduled-at" value={scheduledAt} onValueChange={setScheduledAt} />
          {unavailable ? (
            <p className="mt-1 text-xs text-warning">{t('unavailable_that_day')}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" className="h-11 sm:h-9" disabled={update.isPending} onClick={() => void save().catch(() => undefined)}>
          {update.isPending ? t('saving') : t('save')}
        </Button>
        {saved && !update.isPending ? (
          <span role="status" className="text-xs text-muted-foreground">{t('saved')}</span>
        ) : null}
        {update.isError ? (
          <span role="alert" className="text-xs text-destructive">
            {messageErreur(update.error, t('failed'))}
          </span>
        ) : null}
      </div>

      {agencyId !== null ? (
        <InviteServiceProviderSheet
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          agencyId={agencyId}
          prefilledTrades={[request.category]}
          prefilledZones={zonesOf(request)}
          fromMaintenanceRequestId={request.id}
        />
      ) : null}
    </section>
  );
}

function providerOptions(
  profiles: readonly ServiceProviderProfileSummary[],
  request: MaintenanceRequest,
): { value: string; label: string }[] {
  const options = profiles
    .filter((p) => p.user_id !== null)
    .map((p) => ({ value: String(p.user_id), label: providerName(p) }));

  // L'assigné actuel reste sélectionnable même s'il n'est pas dans la page du carnet.
  if (request.assigned_to !== null && !options.some((o) => o.value === String(request.assigned_to))) {
    options.unshift({
      value: String(request.assigned_to),
      label: request.assignee?.name ?? request.assignee?.email ?? String(request.assigned_to),
    });
  }

  return options;
}

function providerName(p: ServiceProviderProfileSummary): string {
  const first = p.user?.first_name ?? p.metadata?.first_name ?? '';
  const last = p.user?.last_name ?? p.metadata?.last_name ?? '';
  const name = `${first} ${last}`.trim();
  return name || p.user?.email || p.metadata?.email || String(p.user_id);
}

/** Sans disponibilités déclarées, rien n'est signalé : l'absence n'est pas un refus. */
function worksOn(p: ServiceProviderProfileSummary, localValue: string): boolean {
  const slots = (p.metadata as { availability?: { day: string }[] } | null)?.availability;
  if (!slots || slots.length === 0) return true;
  const date = parseISO(localValue);
  if (!isValid(date)) return true;
  return slots.some((slot) => slot.day === WEEKDAYS[date.getDay()]);
}

function zonesOf(request: MaintenanceRequest): string[] {
  const location = request.property?.location;
  return [location?.quarter, location?.city].filter((z): z is string => Boolean(z));
}

function toLocalValue(iso: string | null): string {
  if (!iso) return '';
  const date = parseISO(iso);
  return isValid(date) ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
}
