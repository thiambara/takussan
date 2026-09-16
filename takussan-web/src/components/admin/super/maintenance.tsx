'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { WarningBanner } from '@/components/ui/warning-banner';
import { cancelMaintenance, scheduleMaintenance } from '@/lib/queries/super-admin';
import type { MaintenanceMode, MaintenanceSeverity, MaintenanceStatus } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useFormatteurs } from '@/lib/format/useFormatteurs';

/** TCK-292 — la donnée porte la CLÉ, le rendu la résout (`superAdmin.maintenance.modes.*`). */
const MODES: MaintenanceMode[] = ['banner', 'read_only', 'down'];

/** Idem pour les sévérités (`superAdmin.maintenance.severities.*`). */
const SEVERITIES: MaintenanceSeverity[] = ['info', 'scheduled', 'interruption'];

export function MaintenanceScheduler({ status }: { status: MaintenanceStatus }) {
  const t = useTranslations('superAdmin.maintenance');
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [mode, setMode] = useState<MaintenanceMode>('banner');
  const [severity, setSeverity] = useState<MaintenanceSeverity>('scheduled');
  // TCK-292 — contenu par DÉFAUT du bandeau ENVOYÉ À L'API, et non du texte d'interface : chaque
  // champ porte la langue de SON destinataire. `defaultMessages.fr` vaut donc la même phrase
  // française dans les trois dictionnaires — la résoudre par la locale de l'opérateur écrirait du
  // wolof dans le champ « Message FR ».
  const [fr, setFr] = useState(t('defaultMessages.fr'));
  const [en, setEn] = useState(t('defaultMessages.en'));
  const [wo, setWo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const schedule = useMutation({
    mutationFn: () => scheduleMaintenance({
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      mode,
      severity,
      messages: { fr, en, wo },
      banner_lead_minutes: 30,
    }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'maintenance'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-status'] });
    },
    onError: (err: ApiError) => setError(messageErreur(err)),
  });
  const cancel = useMutation({
    mutationFn: cancelMaintenance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'maintenance'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-status'] });
    },
  });
  const invalid = startsAt === '' || endsAt === '' || fr.trim() === '' || new Date(endsAt) <= new Date(startsAt);

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-xl bg-card p-5 ring-1 ring-border">
        <h2 className="font-display text-xl font-semibold text-foreground">{t('currentState')}</h2>
        <div className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground ring-1 ring-border">
          {status.window ? (
            <div className="space-y-2">
              <p className="font-semibold text-foreground">{status.active ? t('active') : t('scheduled')}</p>
              <p className="text-pretty">{status.window.messages.fr}</p>
              <p className="tabular-nums">{t('windowRange', {
                start: fmt.dateTime(status.window.starts_at),
                end: fmt.dateTime(status.window.ends_at),
              })}</p>
              <p>{t('modeValue', { mode: t.has(`modes.${status.window.mode}`) ? t(`modes.${status.window.mode}`) : status.window.mode })}</p>
            </div>
          ) : (
            <p>{t('noWindow')}</p>
          )}
        </div>
        {/* Sans fenêtre, il n'y a rien à annuler : un bouton destructif désactivé n'était que du bruit rouge. */}
        {status.window ? (
          <Button type="button" variant="destructive" className="mt-4" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {t('cancelWindow')}
          </Button>
        ) : null}
      </section>

      <section className="rounded-xl bg-card p-5 ring-1 ring-border">
        <h2 className="font-display text-xl font-semibold text-foreground">{t('scheduleWindow')}</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          <label className="space-y-1.5">
            <Label htmlFor="maintenance-start">{t('start')}</Label>
            <DateTimePicker id="maintenance-start" value={startsAt} onValueChange={setStartsAt} />
          </label>
          <label className="space-y-1.5">
            <Label htmlFor="maintenance-end">{t('end')}</Label>
            <DateTimePicker id="maintenance-end" value={endsAt} onValueChange={setEndsAt} />
          </label>
        </div>
        <Segmented
          label={t('mode')}
          value={mode}
          options={MODES.map((value) => ({ value, label: t(`modes.${value}`) }))}
          onChange={setMode}
        />
        <Segmented
          label={t('severity')}
          value={severity}
          options={SEVERITIES.map((value) => ({ value, label: t(`severities.${value}`) }))}
          onChange={setSeverity}
        />
        <div className="mt-4 grid grid-cols-1 gap-3">
          <label className="space-y-1.5">
            <Label htmlFor="maintenance-fr">{t('messageFr')}</Label>
            <Textarea id="maintenance-fr" value={fr} onChange={(event) => setFr(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <Label htmlFor="maintenance-en">{t('messageEn')}</Label>
            <Textarea id="maintenance-en" value={en} onChange={(event) => setEn(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <Label htmlFor="maintenance-wo">{t('messageWo')}</Label>
            <Textarea id="maintenance-wo" value={wo} onChange={(event) => setWo(event.target.value)} />
          </label>
        </div>
        <WarningBanner
          className="mt-4 rounded-lg px-3 py-2"
          icon={<CalendarClock className="size-4" aria-hidden="true" />}
        >
          {fr}
        </WarningBanner>
        {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
        <Button type="button" className="mt-4" onClick={() => schedule.mutate()} disabled={invalid || schedule.isPending}>
          <Save className="size-4" aria-hidden="true" />
          {t('schedule')}
        </Button>
      </section>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const labelId = useId();
  return (
    <div className="mt-4">
      <p id={labelId} className="mb-2 text-sm font-medium text-muted-foreground">{label}</p>
      <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            // Un choix n'est pas un appel à l'action : le terracotta plein reste au seul
            // « Programmer », la sélection se lit par l'aplat neutre, l'anneau et `aria-pressed`.
            variant={value === option.value ? 'secondary' : 'outline'}
            aria-pressed={value === option.value}
            className={cn('min-w-28', value === option.value && 'ring-1 ring-foreground/20')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
