'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Megaphone, PauseCircle, Pencil, Plus, Save, X } from 'lucide-react';
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
  fetchAdminAgencies,
  fetchAdminAnnouncements,
  patchAdminAnnouncement,
} from '@/lib/queries/super-admin';
import type { AdminAgency, Announcement, AnnouncementPayload, AnnouncementSeverity } from '@/types/super-admin';
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
 * TCK-366 — les SIX slugs que le ciblage par rôle peut réellement rencontrer.
 *
 * Ce ne sont pas des libellés : c'est la liste exacte que `User::profileTypes()` (API,
 * `app/Models/Concerns/HasProfiles.php`) est capable de rendre, et
 * `AnnouncementResolver::matches()` intersecte le segment avec elle. Deux slugs qui circulent
 * ailleurs dans le front — `tenant` et `customer`, présents dans `superAdmin.pages.users.roles` —
 * n'en font PAS partie : les cibler n'aurait jamais atteint personne. C'est pourquoi cette table
 * est écrite ici plutôt qu'empruntée à l'écran des utilisateurs.
 */
const ROLE_SLUGS = ['super_admin', 'agency_admin', 'agent', 'owner', 'broker', 'service_provider'] as const;

type RoleSlug = (typeof ROLE_SLUGS)[number];

/**
 * TCK-366 — l'état de diffusion, dérivé de `scopeCurrentlyVisible()` (API, `Announcement`).
 *
 * Il n'existe AUCUNE colonne d'état en base : l'API décide de la visibilité avec
 * `is_active AND starts_at <= now AND (ends_at IS NULL OR ends_at > now)`. Les quatre états
 * ci-dessous sont cette expression décomposée — pas une convention de plus. `draft` est donc
 * exactement « `is_active` faux », ce qui recouvre le brouillon jamais diffusé ET l'annonce
 * désactivée : la base ne permet pas de les distinguer.
 */
type AnnouncementState = 'draft' | 'scheduled' | 'live' | 'expired';

const STATE_TONES: Record<AnnouncementState, StatusTone> = {
  draft: 'neutral',
  scheduled: 'info',
  live: 'success',
  expired: 'neutral',
};

export function announcementState(announcement: Announcement, now: number = Date.now()): AnnouncementState {
  if (!announcement.is_active) return 'draft';

  const start = new Date(announcement.starts_at).getTime();
  if (Number.isFinite(start) && start > now) return 'scheduled';

  const end = announcement.ends_at ? new Date(announcement.ends_at).getTime() : null;
  if (end !== null && Number.isFinite(end) && end <= now) return 'expired';

  return 'live';
}

type FormState = {
  titleFr: string;
  titleEn: string;
  titleWo: string;
  bodyFr: string;
  bodyEn: string;
  bodyWo: string;
  severity: AnnouncementSeverity;
  roles: string[];
  agencyIds: number[];
  rollout: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
};

/**
 * ISO (UTC, ce que l'API rend) → la valeur d'un `<input type="datetime-local">`, qui est de
 * l'heure LOCALE sans fuseau.
 *
 * `toISOString().slice(0, 16)` ne convient pas ici : `toPayload` relit la chaîne avec
 * `new Date(...)`, qui l'interprète en local. Rendre de l'UTC dans le champ décalerait donc la
 * date à CHAQUE aller-retour d'édition — une annonce ré-enregistrée trois fois depuis Dakar
 * aurait glissé de trois heures sans que personne n'y touche.
 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const decale = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return decale.toISOString().slice(0, 16);
}

function emptyForm(): FormState {
  return {
    titleFr: '',
    titleEn: '',
    titleWo: '',
    bodyFr: '',
    bodyEn: '',
    bodyWo: '',
    severity: 'info',
    roles: [],
    agencyIds: [],
    rollout: '',
    startsAt: isoToLocalInput(new Date().toISOString()),
    endsAt: '',
    isActive: true,
  };
}

/**
 * TCK-366 — l'annonce reçue → l'état du formulaire.
 *
 * Le ciblage est recopié TEL QUEL, y compris les identifiants d'agence que la page d'agences
 * chargée ne connaît pas : c'est ce qui garantit qu'une édition qui ne touche pas au ciblage le
 * réémet à l'identique (AC3). Une résolution en noms qui perdrait un identifiant introuvable
 * aurait silencieusement rétréci la cible.
 */
function toForm(announcement: Announcement): FormState {
  const segment = announcement.segment ?? {};
  return {
    titleFr: announcement.title?.fr ?? '',
    titleEn: announcement.title?.en ?? '',
    titleWo: announcement.title?.wo ?? '',
    bodyFr: announcement.body?.fr ?? '',
    bodyEn: announcement.body?.en ?? '',
    bodyWo: announcement.body?.wo ?? '',
    severity: announcement.severity,
    roles: [...(segment.roles ?? [])],
    agencyIds: [...(segment.agency_ids ?? [])],
    rollout: segment.rollout_percentage === undefined || segment.rollout_percentage === null
      ? ''
      : String(segment.rollout_percentage),
    startsAt: isoToLocalInput(announcement.starts_at),
    endsAt: isoToLocalInput(announcement.ends_at),
    isActive: announcement.is_active,
  };
}

export function AnnouncementsConsole() {
  const t = useTranslations('superAdmin.announcements');
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['super-admin', 'announcements'],
    queryFn: () => fetchAdminAnnouncements({ perPage: 30 }),
    staleTime: 30_000,
  });

  /**
   * Les agences servent DEUX besoins que rien n'oblige à séparer : borner la saisie du ciblage à
   * des agences existantes (ce que `segment.agency_ids.*` valide côté API par `exists:agencies`)
   * et résoudre en noms les identifiants déjà posés.
   */
  const agenciesQuery = useQuery({
    queryKey: ['super-admin', 'announcements', 'agencies'],
    queryFn: () => fetchAdminAgencies({ perPage: 100, sort: 'name' }),
    staleTime: 300_000,
  });

  const agencies: AdminAgency[] = useMemo(() => agenciesQuery.data?.data ?? [], [agenciesQuery.data]);
  const agencyNames = useMemo(
    () => new Map(agencies.map((agency) => [agency.id, agency.name])),
    [agencies],
  );

  const reset = () => {
    setForm(emptyForm());
    setEditing(null);
    setError(null);
  };

  const mutation = useMutation({
    mutationFn: () => (editing
      ? patchAdminAnnouncement(editing.id, toPayload(form))
      : createAdminAnnouncement(toPayload(form))),
    onSuccess: () => {
      reset();
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'announcements'] });
      queryClient.invalidateQueries({ queryKey: ['announcements', 'active'] });
    },
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  const startEditing = (announcement: Announcement) => {
    setEditing(announcement);
    setForm(toForm(announcement));
    setError(null);
  };

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
      id: 'state',
      header: t('colState'),
      cell: (announcement) => {
        const state = announcementState(announcement);
        return <StatusBadge tone={STATE_TONES[state]} label={t(`states.${state}`)} />;
      },
    },
    {
      id: 'severity',
      header: t('colSeverity'),
      cell: (announcement) => (
        <StatusBadge
          tone={SEVERITY_TONES[announcement.severity]}
          label={t(`severities.${announcement.severity}`)}
        />
      ),
    },
    {
      id: 'segment',
      header: t('colSegment'),
      className: 'text-muted-foreground',
      cell: (announcement) => describeSegment(announcement, t, agencyNames),
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
      cell: (announcement) => (
        <AnnouncementAction
          announcement={announcement}
          onEdit={() => startEditing(announcement)}
          isEditing={editing?.id === announcement.id}
        />
      ),
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

      <section className="rounded-xl bg-card p-4 ring-1 ring-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Megaphone className="size-5 text-primary" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-foreground">
              {editing ? t('editTitle') : t('compose')}
            </h2>
          </div>
          {editing ? (
            <Button type="button" variant="ghost" onClick={reset}>
              <X className="size-4" aria-hidden="true" />
              {t('cancelEdit')}
            </Button>
          ) : null}
        </div>

        {editing ? (
          <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground" role="status">
            {announcementState(editing) === 'live' ? t('editingLiveNotice') : t('editingDraftNotice')}
          </p>
        ) : null}

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

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-foreground">{t('severity')}</legend>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((severity) => (
                <Button
                  key={severity}
                  type="button"
                  variant={form.severity === severity ? 'default' : 'outline'}
                  aria-pressed={form.severity === severity}
                  onClick={() => setForm({ ...form, severity })}
                >
                  {t(`severities.${severity}`)}
                </Button>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium text-foreground">{t('diffusion')}</legend>
            <div className="flex flex-wrap gap-2">
              {[true, false].map((actif) => (
                <Button
                  key={String(actif)}
                  type="button"
                  variant={form.isActive === actif ? 'default' : 'outline'}
                  aria-pressed={form.isActive === actif}
                  onClick={() => setForm({ ...form, isActive: actif })}
                >
                  {actif ? t('states.live') : t('states.draft')}
                </Button>
              ))}
            </div>
          </fieldset>

          <RoleTargeting form={form} setForm={setForm} />

          <AgencyTargeting
            form={form}
            setForm={setForm}
            agencies={agencies}
            agencyNames={agencyNames}
            isLoading={agenciesQuery.isLoading}
          />

          <label className="space-y-1.5">
            <Label htmlFor="announcement-rollout">{t('rollout')}</Label>
            <Input id="announcement-rollout" type="number" min={0} max={100} value={form.rollout} onChange={(event) => setForm({ ...form, rollout: event.target.value })} />
          </label>

          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {editing ? <Save className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
            {editing ? t('save') : t('publish')}
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
 *
 * TCK-366 — l'ÉDITION, elle, n'est pas une mutation d'ici : elle remplit le formulaire du parent,
 * qui porte déjà la mutation `patch`. D'où le simple `onEdit`.
 */
function AnnouncementAction({
  announcement,
  onEdit,
  isEditing,
}: {
  announcement: Announcement;
  onEdit: () => void;
  isEditing: boolean;
}) {
  const t = useTranslations('superAdmin.announcements');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deactivateAdminAnnouncement(announcement.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin', 'announcements'] });
      queryClient.invalidateQueries({ queryKey: ['announcements', 'active'] });
    },
  });

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        aria-pressed={isEditing}
        onClick={onEdit}
      >
        <Pencil className="size-4" aria-hidden="true" />
        <span aria-hidden="true">{t('edit')}</span>
        <span className="sr-only">{t('editRow', { title: announcement.title.fr })}</span>
      </Button>
      {announcement.is_active ? (
        <Button type="button" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          <PauseCircle className="size-4" aria-hidden="true" />
          {t('deactivate')}
        </Button>
      ) : (
        <Badge variant="outline">{t('inactive')}</Badge>
      )}
    </div>
  );
}

function LocaleFields({ form, setForm }: { form: FormState; setForm: (value: FormState) => void }) {
  const t = useTranslations('superAdmin.announcements');
  return (
    <div className="grid gap-4">
      {[
        ['fr', 'FR', 'titleFr', 'bodyFr'],
        ['en', 'EN', 'titleEn', 'bodyEn'],
        ['wo', 'WO', 'titleWo', 'bodyWo'],
      ].map(([, label, titleKey, bodyKey]) => (
        <div key={label} className="grid gap-2 rounded-lg border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <Input
            aria-label={t('titleFieldLabel', { locale: label })}
            value={form[titleKey as keyof FormState] as string}
            onChange={(event) => setForm({ ...form, [titleKey]: event.target.value })}
            placeholder={t('titlePlaceholder')}
          />
          <Textarea
            aria-label={t('bodyFieldLabel', { locale: label })}
            value={form[bodyKey as keyof FormState] as string}
            onChange={(event) => setForm({ ...form, [bodyKey]: event.target.value })}
            placeholder={t('bodyPlaceholder')}
            rows={3}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * TCK-366 — le ciblage par rôle, en cases à cocher plutôt qu'en liste séparée par des virgules.
 *
 * Le champ libre acceptait n'importe quel slug, y compris ceux qu'aucun utilisateur ne porte : une
 * annonce ciblée `tenant` partait sans jamais atteindre personne, et rien ne le disait.
 */
function RoleTargeting({ form, setForm }: { form: FormState; setForm: (value: FormState) => void }) {
  const t = useTranslations('superAdmin.announcements');

  const toggle = (slug: string) => {
    const roles = form.roles.includes(slug)
      ? form.roles.filter((role) => role !== slug)
      : [...form.roles, slug];
    setForm({ ...form, roles });
  };

  /** Un slug déjà posé en base qui ne fait pas partie des six reste éditable — et visible. */
  const inconnus = form.roles.filter((role) => !ROLE_SLUGS.includes(role as RoleSlug));

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium text-foreground">{t('roles')}</legend>
      <div className="flex flex-wrap gap-2">
        {[...ROLE_SLUGS, ...inconnus].map((slug) => {
          const coche = form.roles.includes(slug);
          return (
            <label
              key={slug}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground has-checked:border-primary has-checked:bg-primary/10"
            >
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={coche}
                onChange={() => toggle(slug)}
              />
              {roleLabel(slug, t)}
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t('rolesHint')}</p>
    </fieldset>
  );
}

/**
 * TCK-366 — le ciblage par agence, borné aux agences existantes.
 *
 * ⚠ La liste chargée est PAGINÉE (100). Un identifiant déjà ciblé qui n'y figure pas est conservé
 * et affiché en pastille — jamais retiré du formulaire. Perdre une cible parce qu'elle est sur la
 * deuxième page serait une régression silencieuse, exactement ce que l'AC3 interdit.
 */
function AgencyTargeting({
  form,
  setForm,
  agencies,
  agencyNames,
  isLoading,
}: {
  form: FormState;
  setForm: (value: FormState) => void;
  agencies: AdminAgency[];
  agencyNames: Map<number, string>;
  isLoading: boolean;
}) {
  const t = useTranslations('superAdmin.announcements');
  const [recherche, setRecherche] = useState('');

  const toggle = (id: number) => {
    const agencyIds = form.agencyIds.includes(id)
      ? form.agencyIds.filter((current) => current !== id)
      : [...form.agencyIds, id];
    setForm({ ...form, agencyIds });
  };

  const filtrees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return agencies;
    return agencies.filter((agency) => agency.name.toLowerCase().includes(terme));
  }, [agencies, recherche]);

  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium text-foreground">{t('agencies')}</legend>

      {form.agencyIds.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {form.agencyIds.map((id) => (
            <li key={id}>
              <Button type="button" variant="outline" onClick={() => toggle(id)}>
                {agencyNames.get(id) ?? t('agencyUnknown', { id })}
                <X className="size-3" aria-hidden="true" />
                <span className="sr-only">{t('agencyRemove', { name: agencyNames.get(id) ?? String(id) })}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t('agenciesEmpty')}</p>
      )}

      <Input
        aria-label={t('agencySearch')}
        placeholder={t('agencySearch')}
        value={recherche}
        onChange={(event) => setRecherche(event.target.value)}
      />

      <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">{t('agenciesLoading')}</p>
        ) : filtrees.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('agenciesNoMatch')}</p>
        ) : (
          filtrees.map((agency) => (
            <label key={agency.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground hover:bg-muted">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={form.agencyIds.includes(agency.id)}
                onChange={() => toggle(agency.id)}
              />
              {agency.name}
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}

function roleLabel(slug: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  return ROLE_SLUGS.includes(slug as RoleSlug) ? t(`roleLabels.${slug}`) : slug;
}

export function toPayload(form: FormState): AnnouncementPayload {
  const segment = {
    roles: form.roles.map((role) => role.trim()).filter(Boolean),
    agency_ids: form.agencyIds.filter((id) => Number.isFinite(id) && id > 0),
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
  agencyNames: Map<number, string>,
): string {
  const segment = announcement.segment ?? {};
  const parts = [];
  if (segment.roles?.length) {
    parts.push(t('segmentRoles', { list: segment.roles.map((role) => roleLabel(role, t)).join(', ') }));
  }
  if (segment.agency_ids?.length) {
    parts.push(t('segmentAgencies', {
      list: segment.agency_ids.map((id) => agencyNames.get(id) ?? t('agencyUnknown', { id })).join(', '),
    }));
  }
  if (segment.rollout_percentage) parts.push(`${segment.rollout_percentage}%`);
  return parts.length > 0 ? parts.join(' · ') : t('segmentAll');
}
