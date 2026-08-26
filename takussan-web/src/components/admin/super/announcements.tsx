'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Megaphone, PauseCircle, Plus } from 'lucide-react';
import { DataTable, StatusBadge, type DataTableColumn, type StatusTone } from '@/components/console';
import { EmptyState } from '@/components/feedback';
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
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

/** TCK-292 — la donnée porte la CLÉ, le rendu la résout (`superAdmin.announcements.severities.*`). */
const SEVERITIES: AnnouncementSeverity[] = ['info', 'success', 'warning', 'critical'];

/** La sévérité de l'annonce → le ton du DS. Une seule table, lue par la table de la console. */
const SEVERITY_TONES: Record<AnnouncementSeverity, StatusTone> = {
  info: 'info',
  success: 'success',
  warning: 'attention',
  critical: 'danger',
};

/**
 * TCK-292 — valeur d'EXEMPLE composée d'identifiants de rôle de l'API : ce n'est pas du texte
 * affiché à traduire.
 */
const ROLE_SLUGS_PLACEHOLDER = 'agency_admin,agent';

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
  const t = useTranslations('superAdmin.announcements');
  const messageErreur = useMessageErreurApi();
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
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  const columns: DataTableColumn<Announcement>[] = [
    {
      id: 'title',
      header: t('colTitle'),
      cell: (announcement) => (
        <>
          <p className="font-medium text-foreground">{announcement.title.fr}</p>
          <p className="text-xs text-muted-foreground">{announcement.body.fr}</p>
        </>
      ),
    },
    {
      id: 'severity',
      header: t('colSeverity'),
      cell: (announcement) => (
        <StatusBadge
          tone={SEVERITY_TONES[announcement.severity]}
          label={announcement.severity}
        />
      ),
    },
    {
      id: 'segment',
      header: t('colSegment'),
      className: 'text-muted-foreground',
      cell: (announcement) => describeSegment(announcement, t),
    },
    {
      id: 'window',
      header: t('colWindow'),
      className: 'text-muted-foreground',
      cell: (announcement) => new Date(announcement.starts_at).toLocaleString('fr-FR'),
    },
    {
      id: 'actions',
      header: t('colActions'),
      headerSrOnly: true,
      align: 'end',
      cell: (announcement) => <AnnouncementAction announcement={announcement} />,
    },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
      <section className="rounded-xl bg-card p-4 ring-1 ring-border">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-foreground">{t('title')}</h2>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
          <Badge variant="outline">{t('countBadge', { count: query.data?.meta?.total ?? 0 })}</Badge>
        </div>

        <DataTable
          className="mt-4"
          caption={t('tableCaption')}
          columns={columns}
          rows={query.data?.data ?? []}
          rowKey={(announcement) => announcement.id}
          emptyState={
            query.isLoading ? null : (
              <EmptyState
                className="border-0"
                icon={<Megaphone className="size-8" aria-hidden="true" />}
                title={t('empty_title')}
                description={t('empty_description')}
              />
            )
          }
        />
      </section>

      <section className="rounded-xl bg-white p-4 ring-1 ring-stone-200">
        <div className="flex items-center gap-2">
          <Megaphone className="size-5 text-primary" aria-hidden="true" />
          <h2 className="font-display text-lg font-semibold text-stone-950">{t('compose')}</h2>
        </div>

        <div className="mt-4 grid gap-4">
          <LocaleFields form={form} setForm={setForm} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <Label htmlFor="announcement-start">{t('start')}</Label>
              <DateTimePicker id="announcement-start" value={form.startsAt} onValueChange={(value) => setForm({ ...form, startsAt: value })} />
            </label>
            <label className="space-y-1.5">
              <Label htmlFor="announcement-end">{t('end')}</Label>
              <DateTimePicker id="announcement-end" value={form.endsAt} onValueChange={(value) => setForm({ ...form, endsAt: value })} />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {SEVERITIES.map((severity) => (
              <Button
                key={severity}
                type="button"
                variant={form.severity === severity ? 'default' : 'outline'}
                onClick={() => setForm({ ...form, severity })}
              >
                {t(`severities.${severity}`)}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <Label htmlFor="announcement-roles">{t('roles')}</Label>
              <Input id="announcement-roles" value={form.roles} onChange={(event) => setForm({ ...form, roles: event.target.value })} placeholder={ROLE_SLUGS_PLACEHOLDER} />
            </label>
            <label className="space-y-1.5">
              <Label htmlFor="announcement-agencies">{t('agencies')}</Label>
              <Input id="announcement-agencies" value={form.agencyIds} onChange={(event) => setForm({ ...form, agencyIds: event.target.value })} placeholder="12,18" />
            </label>
            <label className="space-y-1.5">
              <Label htmlFor="announcement-rollout">{t('rollout')}</Label>
              <Input id="announcement-rollout" type="number" min={0} max={100} value={form.rollout} onChange={(event) => setForm({ ...form, rollout: event.target.value })} />
            </label>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Plus className="size-4" aria-hidden="true" />
            {t('publish')}
          </Button>
        </div>
      </section>
    </div>
  );
}

/**
 * SEULE la cellule d'action est un composant, et pour une raison qui ne vaut que pour elle : la
 * désactivation est une MUTATION, donc un hook, et un hook ne s'appelle pas depuis la `cell` d'une
 * colonne — qui est un callback. Le segment, lui, n'a besoin que de `t`, que le composant parent
 * tient déjà : il se rend en ligne.
 */
function AnnouncementAction({ announcement }: { announcement: Announcement }) {
  const t = useTranslations('superAdmin.announcements');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deactivateAdminAnnouncement(announcement.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'announcements'] });
      queryClient.invalidateQueries({ queryKey: ['announcements', 'active'] });
    },
  });

  return announcement.is_active ? (
    <Button type="button" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      <PauseCircle className="size-4" aria-hidden="true" />
      {t('deactivate')}
    </Button>
  ) : (
    <Badge variant="outline">{t('inactive')}</Badge>
  );
}

function LocaleFields({ form, setForm }: { form: typeof EMPTY_FORM; setForm: (value: typeof EMPTY_FORM) => void }) {
  const t = useTranslations('superAdmin.announcements');
  return (
    <div className="grid gap-4">
      {[
        ['fr', 'FR', 'titleFr', 'bodyFr'],
        ['en', 'EN', 'titleEn', 'bodyEn'],
        ['wo', 'WO', 'titleWo', 'bodyWo'],
      ].map(([, label, titleKey, bodyKey]) => (
        <div key={label} className="grid gap-2 rounded-lg border border-stone-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</p>
          <Input value={form[titleKey as keyof typeof EMPTY_FORM] as string} onChange={(event) => setForm({ ...form, [titleKey]: event.target.value })} placeholder={t('titlePlaceholder')} />
          <Textarea value={form[bodyKey as keyof typeof EMPTY_FORM] as string} onChange={(event) => setForm({ ...form, [bodyKey]: event.target.value })} placeholder={t('bodyPlaceholder')} rows={3} />
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

function describeSegment(
  announcement: Announcement,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const segment = announcement.segment ?? {};
  const parts = [];
  if (segment.roles?.length) parts.push(t('segmentRoles', { list: segment.roles.join(', ') }));
  if (segment.agency_ids?.length) parts.push(t('segmentAgencies', { list: segment.agency_ids.join(', ') }));
  if (segment.rollout_percentage) parts.push(`${segment.rollout_percentage}%`);
  return parts.length > 0 ? parts.join(' · ') : t('segmentAll');
}
