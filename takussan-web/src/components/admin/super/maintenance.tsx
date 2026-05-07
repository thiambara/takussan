'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cancelMaintenance, scheduleMaintenance } from '@/lib/queries/super-admin';
import type { MaintenanceMode, MaintenanceSeverity, MaintenanceStatus } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const modes: Array<{ value: MaintenanceMode; label: string }> = [
  { value: 'banner', label: 'Bandeau' },
  { value: 'read_only', label: 'Lecture seule' },
  { value: 'down', label: 'Hors ligne' },
];

const severities: Array<{ value: MaintenanceSeverity; label: string }> = [
  { value: 'info', label: 'Info' },
  { value: 'scheduled', label: 'Planifiée' },
  { value: 'interruption', label: 'Interruption' },
];

export function MaintenanceScheduler({ status }: { status: MaintenanceStatus }) {
  const queryClient = useQueryClient();
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [mode, setMode] = useState<MaintenanceMode>('banner');
  const [severity, setSeverity] = useState<MaintenanceSeverity>('scheduled');
  const [fr, setFr] = useState('Maintenance planifiée. Certaines actions peuvent être indisponibles.');
  const [en, setEn] = useState('Scheduled maintenance. Some actions may be unavailable.');
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
    onError: (err: ApiError) => setError(err.displayMessage),
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="font-display text-xl font-semibold text-stone-950">État courant</h2>
        <div className="mt-4 rounded-lg bg-stone-50 p-4 text-sm text-stone-700 ring-1 ring-stone-200">
          {status.window ? (
            <div className="space-y-2">
              <p className="font-semibold">{status.active ? 'Maintenance active' : 'Maintenance programmée'}</p>
              <p>{status.window.messages.fr}</p>
              <p>Du {new Date(status.window.starts_at).toLocaleString('fr-SN')} au {new Date(status.window.ends_at).toLocaleString('fr-SN')}</p>
              <p>Mode : {status.window.mode}</p>
            </div>
          ) : (
            <p>Aucune fenêtre programmée.</p>
          )}
        </div>
        <Button type="button" variant="destructive" className="mt-4" onClick={() => cancel.mutate()} disabled={!status.window || cancel.isPending}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Annuler la fenêtre
        </Button>
      </section>

      <section className="rounded-xl bg-white p-5 ring-1 ring-stone-200">
        <h2 className="font-display text-xl font-semibold text-stone-950">Programmer une fenêtre</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <Label htmlFor="maintenance-start">Début</Label>
            <Input id="maintenance-start" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <Label htmlFor="maintenance-end">Fin</Label>
            <Input id="maintenance-end" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </label>
        </div>
        <Segmented label="Mode" value={mode} options={modes} onChange={setMode} />
        <Segmented label="Sévérité" value={severity} options={severities} onChange={setSeverity} />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="space-y-1.5">
            <Label htmlFor="maintenance-fr">Message FR</Label>
            <Textarea id="maintenance-fr" value={fr} onChange={(event) => setFr(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <Label htmlFor="maintenance-en">Message EN</Label>
            <Textarea id="maintenance-en" value={en} onChange={(event) => setEn(event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <Label htmlFor="maintenance-wo">Message WO</Label>
            <Textarea id="maintenance-wo" value={wo} onChange={(event) => setWo(event.target.value)} />
          </label>
        </div>
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <CalendarClock className="mr-2 inline size-4" aria-hidden="true" />
          {fr}
        </div>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        <Button type="button" className="mt-4" onClick={() => schedule.mutate()} disabled={invalid || schedule.isPending}>
          <Save className="size-4" aria-hidden="true" />
          Programmer
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
  return (
    <div className="mt-4">
      <p className="mb-2 text-sm font-medium text-stone-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            variant={value === option.value ? 'default' : 'outline'}
            className={cn('min-w-28')}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
