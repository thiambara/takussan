'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, PauseCircle, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  createAdminAnnouncement,
  deactivateAdminAnnouncement,
  fetchAdminAnnouncements,
} from '@/lib/queries/super-admin';
import type { Announcement, AnnouncementPayload, AnnouncementSeverity } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

const SEVERITIES: Array<{ value: AnnouncementSeverity; label: string }> = [
  { value: 'info', label: 'Info' },
  { value: 'success', label: 'Succès' },
  { value: 'warning', label: 'Alerte' },
  { value: 'critical', label: 'Critique' },
];

const EMPTY_FORM = {
  titleFr: '',
  titleEn: '',
  titleWo: '',
  bodyFr: '',
  bodyEn: '',
  bodyWo: '',
  severity: 'info' as AnnouncementSeverity,
  roles: '',
  agencyIds: '',
  rollout: '',
  startsAt: new Date().toISOString().slice(0, 16),
  endsAt: '',
  isActive: true,
};

export function AnnouncementsConsole() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['super-admin', 'announcements'],
    queryFn: () => fetchAdminAnnouncements({ perPage: 30 }),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: () => createAdminAnnouncement(toPayload(form)),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'announcements'] });
      queryClient.invalidateQueries({ queryKey: ['announcements', 'active'] });
    },
    onError: (err: ApiError) => setError(err.displayMessage),
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
      <section className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-stone-950">Annonces diffusées</h2>
            <p className="text-sm text-stone-600">Broadcasts actifs, programmés ou expirés.</p>
          </div>
          <Badge variant="outline">{query.data?.meta?.total ?? 0} annonces</Badge>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">Titre</th>
                <th className="px-3 py-2">Sévérité</th>
                <th className="px-3 py-2">Segment</th>
                <th className="px-3 py-2">Fenêtre</th>
                <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {(query.data?.data ?? []).map((announcement) => (
                <AnnouncementRow key={announcement.id} announcement={announcement} />
              ))}
              {!query.isLoading && (query.data?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-stone-500">
                    Aucune annonce pour le moment.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
        <div className="flex items-center gap-2">
          <Megaphone className="size-5 text-primary" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-stone-950">Composer</h2>
        </div>

        <div className="mt-4 grid gap-4">
          <LocaleFields form={form} setForm={setForm} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <Label htmlFor="announcement-start">Début</Label>
              <DateTimePicker id="announcement-start" value={form.startsAt} onValueChange={(value) => setForm({ ...form, startsAt: value })} />
            </label>
            <label className="space-y-1.5">
              <Label htmlFor="announcement-end">Fin</Label>
              <DateTimePicker id="announcement-end" value={form.endsAt} onValueChange={(value) => setForm({ ...form, endsAt: value })} />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {SEVERITIES.map((severity) => (
              <Button
                key={severity.value}
                type="button"
                variant={form.severity === severity.value ? 'default' : 'outline'}
                onClick={() => setForm({ ...form, severity: severity.value })}
              >
                {severity.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <Label htmlFor="announcement-roles">Rôles</Label>
              <Input id="announcement-roles" value={form.roles} onChange={(event) => setForm({ ...form, roles: event.target.value })} placeholder="agency_admin,agent" />
            </label>
            <label className="space-y-1.5">
              <Label htmlFor="announcement-agencies">Agences</Label>
              <Input id="announcement-agencies" value={form.agencyIds} onChange={(event) => setForm({ ...form, agencyIds: event.target.value })} placeholder="12,18" />
            </label>
            <label className="space-y-1.5">
              <Label htmlFor="announcement-rollout">Rollout %</Label>
              <Input id="announcement-rollout" type="number" min={0} max={100} value={form.rollout} onChange={(event) => setForm({ ...form, rollout: event.target.value })} />
            </label>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Plus className="size-4" aria-hidden="true" />
            Publier l&apos;annonce
          </Button>
        </div>
      </section>
    </div>
  );
}

function AnnouncementRow({ announcement }: { announcement: Announcement }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deactivateAdminAnnouncement(announcement.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'announcements'] });
      queryClient.invalidateQueries({ queryKey: ['announcements', 'active'] });
    },
  });
  const segment = useMemo(() => describeSegment(announcement), [announcement]);

  return (
    <tr>
      <td className="px-3 py-3">
        <p className="font-medium text-stone-950">{announcement.title.fr}</p>
        <p className="text-xs text-stone-500">{announcement.body.fr}</p>
      </td>
      <td className="px-3 py-3"><Badge variant={announcement.severity === 'critical' ? 'destructive' : 'secondary'}>{announcement.severity}</Badge></td>
      <td className="px-3 py-3 text-stone-600">{segment}</td>
      <td className="px-3 py-3 text-stone-600">
        {new Date(announcement.starts_at).toLocaleString('fr-FR')}
      </td>
      <td className="px-3 py-3">
        {announcement.is_active ? (
          <Button type="button" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <PauseCircle className="size-4" aria-hidden="true" />
            Désactiver
          </Button>
        ) : (
          <Badge variant="outline">Inactive</Badge>
        )}
      </td>
    </tr>
  );
}

function LocaleFields({ form, setForm }: { form: typeof EMPTY_FORM; setForm: (value: typeof EMPTY_FORM) => void }) {
  return (
    <div className="grid gap-4">
      {[
        ['fr', 'FR', 'titleFr', 'bodyFr'],
        ['en', 'EN', 'titleEn', 'bodyEn'],
        ['wo', 'WO', 'titleWo', 'bodyWo'],
      ].map(([, label, titleKey, bodyKey]) => (
        <div key={label} className="grid gap-2 rounded-lg border border-stone-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</p>
          <Input value={form[titleKey as keyof typeof EMPTY_FORM] as string} onChange={(event) => setForm({ ...form, [titleKey]: event.target.value })} placeholder="Titre" />
          <Textarea value={form[bodyKey as keyof typeof EMPTY_FORM] as string} onChange={(event) => setForm({ ...form, [bodyKey]: event.target.value })} placeholder="Message" rows={3} />
        </div>
      ))}
    </div>
  );
}

function toPayload(form: typeof EMPTY_FORM): AnnouncementPayload {
  const segment = {
    roles: form.roles.split(',').map((role) => role.trim()).filter(Boolean),
    agency_ids: form.agencyIds.split(',').map((id) => Number(id.trim())).filter((id) => Number.isFinite(id) && id > 0),
    rollout_percentage: form.rollout === '' ? undefined : Number(form.rollout),
  };

  return {
    title: { fr: form.titleFr, en: form.titleEn, wo: form.titleWo },
    body: { fr: form.bodyFr, en: form.bodyEn, wo: form.bodyWo },
    severity: form.severity,
    segment,
    starts_at: new Date(form.startsAt).toISOString(),
    ends_at: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    is_active: form.isActive,
  };
}

function describeSegment(announcement: Announcement): string {
  const segment = announcement.segment ?? {};
  const parts = [];
  if (segment.roles?.length) parts.push(`Rôles: ${segment.roles.join(', ')}`);
  if (segment.agency_ids?.length) parts.push(`Agences: ${segment.agency_ids.join(', ')}`);
  if (segment.rollout_percentage) parts.push(`${segment.rollout_percentage}%`);
  return parts.length > 0 ? parts.join(' · ') : 'Tous';
}
