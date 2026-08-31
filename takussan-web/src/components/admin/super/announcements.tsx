'use client';

import { useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  createAdminAnnouncement,
  deactivateAdminAnnouncement,
  fetchAdminAgencies,
  fetchAdminAnnouncements,
  patchAdminAnnouncement,
} from '@/lib/queries/super-admin';
import type {
  AdminAgenciesResponse,
  AdminAgency,
  Announcement,
  AnnouncementPayload,
  AnnouncementSegment,
  AnnouncementSeverity,
} from '@/types/super-admin';
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
/**
 * Les rôles ciblables par une annonce.
 *
 * ⚠ **TCK-495 — `broker` en a été retiré, et cette liste reste une RECOPIE.**
 * `AnnouncementResolver` croise `segment.roles` avec `HasProfiles::profileTypes()` :
 * un slug qui n'y figure pas cible zéro compte, en silence, sans que rien ne le
 * dise à qui rédige l'annonce. Garder `broker` ici aurait donc laissé une case
 * à cocher qui ne touche personne.
 *
 * ⚠ Elle n'est toujours PAS dérivée — et il lui manque `customer` et `tenant`,
 * que `profileTypes()` émet depuis TCK-492. Ce n'est pas corrigé ici : ces deux
 * rôles ouvriraient un ciblage neuf (tout compte authentifié, tout locataire),
 * ce qui est une décision de produit et pas un effet de bord du retrait du
 * courtier. Inscrit à l'ardoise.
 */
const ROLE_SLUGS = ['super_admin', 'agency_admin', 'agent', 'owner', 'service_provider'] as const;

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

/**
 * TCK-366 (revue) — le délai d'anti-rebond de la recherche d'agences.
 *
 * Même valeur que `AGENCY_SEARCH_DEBOUNCE_MS` du combobox partagé, écrite ici plutôt qu'importée :
 * ce sélecteur-ci est MULTIPLE et ne peut pas emprunter le combobox tel quel. Une factorisation
 * reste possible le jour où le combobox saura porter plusieurs valeurs.
 */
const AGENCY_SEARCH_DEBOUNCE_MS = 300;

/** Une page de résultats — 20, comme le combobox partagé et les listes de la console. */
const AGENCIES_PER_PAGE = 20;

/**
 * TCK-366 (revue) — les agences ciblables, cherchées CÔTÉ SERVEUR.
 *
 * La forme précédente chargeait 100 agences au montage et filtrait la recherche côté client sur
 * cette page déjà tronquée. Deux conséquences, et la seconde est la coûteuse : c'est une violation
 * directe de la discipline sparse fieldsets (« filtre par `filter[…]` côté serveur, jamais côté
 * client sur une liste déjà récupérée »), et surtout l'écran AFFIRMAIT « Aucune agence ne
 * correspond » pour toute agence classée au-delà de la 100ᵉ — un sélecteur qui tait ce qu'il ne
 * montre pas est pire qu'un sélecteur absent.
 *
 * Trois propriétés :
 * 1. la recherche part en `filter[search]` (`fetchAdminAgencies({ search })`), temporisée ;
 * 2. la troncature est DITE (« n sur N ») et franchissable (page suivante) ;
 * 3. les noms rendus viennent des pages RÉELLEMENT chargées, et rien d'autre. Un identifiant ciblé
 *    qu'aucune page ne porte s'affiche « Agence #42 » — c'est déjà le cas avant ce correctif, et
 *    c'est la seule forme honnête : inventer un nom, ou pire retirer la cible, coûterait plus.
 *    Conséquence assumée : pendant une recherche, la colonne « Segment » de la table peut retomber
 *    sur cette forme pour une agence hors résultats.
 */
function useAgencesCiblables() {
  const [recherche, setRecherche] = useState('');
  const rechercheTemporisee = useDebouncedValue(recherche, AGENCY_SEARCH_DEBOUNCE_MS);
  const terme = rechercheTemporisee.trim();

  const query = useInfiniteQuery<AdminAgenciesResponse, ApiError>({
    queryKey: ['super-admin', 'announcements', 'agencies', terme],
    queryFn: ({ pageParam }) => fetchAdminAgencies({
      search: terme || undefined,
      sort: 'name',
      page: pageParam as number,
      perPage: AGENCIES_PER_PAGE,
    }),
    initialPageParam: 1,
    getNextPageParam: (last) => (
      last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined
    ),
    staleTime: 60_000,
  });

  const agencies: AdminAgency[] = useMemo(
    () => (query.data?.pages ?? []).flatMap((page) => page.data),
    [query.data],
  );

  const agencyNames = useMemo(
    () => new Map(agencies.map((agency) => [agency.id, agency.name])),
    [agencies],
  );

  return {
    recherche,
    setRecherche,
    agencies,
    agencyNames,
    total: query.data?.pages[0]?.meta.total ?? 0,
    isLoading: query.isPending,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    chargerPlus: () => { void query.fetchNextPage(); },
    /**
     * ⚠ `recherche !== rechercheTemporisee` — et pas seulement `isFetching`. Pendant les 300 ms
     * d'attente, aucune requête n'est en vol : l'écran serait muet exactement pendant le délai
     * qu'on vient d'introduire.
     */
    enAttente: recherche !== rechercheTemporisee || query.isFetching,
  };
}

type AgencesCiblables = ReturnType<typeof useAgencesCiblables>;

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
 *
 * ⚠ Exportée pour être ÉPROUVÉE. Le round-trip mesuré à travers le composant ne discrimine pas les
 * deux formes : la machine de développement et la CI sont toutes deux à UTC+00, où
 * `toISOString().slice(0, 16)` — le bug d'origine — rend exactement la même chaîne. Le test simule
 * donc un décalage (`getTimezoneOffset`) au lieu de dépendre du fuseau de la machine.
 */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const decale = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return decale.toISOString().slice(0, 16);
}

/**
 * Les six champs de locale, dans l'ordre où l'écran les rend. Une seule table : `LocaleFields`
 * s'en sert pour rendre, `champsDeLocaleVides` pour juger.
 */
const LOCALE_FIELDS = [
  { label: 'FR', titleKey: 'titleFr', bodyKey: 'bodyFr' },
  { label: 'EN', titleKey: 'titleEn', bodyKey: 'bodyEn' },
  { label: 'WO', titleKey: 'titleWo', bodyKey: 'bodyWo' },
] as const;

/**
 * TCK-366 (revue) — les champs de locale vides, à l'enregistrement.
 *
 * L'API refuse déjà (`required_with` → 422), donc la contrainte métier « on ne publie pas une
 * correction en français seulement » tenait ; ce qui manquait, c'est de DÉSIGNER le champ fautif :
 * le bandeau d'erreur rendait un message global, et l'écran laissait chercher lequel des six.
 */
function champsDeLocaleVides(form: FormState): string[] {
  return LOCALE_FIELDS.flatMap(({ titleKey, bodyKey }) => (
    [titleKey, bodyKey].filter((cle) => form[cle].trim() === '')
  ));
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
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tenteDEnregistrer, setTenteDEnregistrer] = useState(false);
  const query = useQuery({
    queryKey: ['super-admin', 'announcements'],
    queryFn: () => fetchAdminAnnouncements({ perPage: 30 }),
    staleTime: 30_000,
  });

  /**
   * Les agences servent DEUX besoins que rien n'oblige à séparer : borner la saisie du ciblage à
   * des agences existantes (ce que `segment.agency_ids.*` valide côté API par `exists:agencies`)
   * et résoudre en noms les identifiants déjà posés — ici comme dans la colonne « Segment ».
   */
  const agences = useAgencesCiblables();
  const agencyNames = agences.agencyNames;

  const reset = () => {
    setForm(emptyForm());
    setEditing(null);
    setError(null);
    setTenteDEnregistrer(false);
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
    setTenteDEnregistrer(false);
  };

  /**
   * ⚠ Les champs manquants sont DÉRIVÉS de la tentative, jamais figés dans un état : la marque
   * disparaît dès que l'utilisateur remplit le champ, sans qu'il ait à re-soumettre pour le savoir.
   */
  const manquants = tenteDEnregistrer ? champsDeLocaleVides(form) : [];

  const enregistrer = () => {
    setTenteDEnregistrer(true);
    if (champsDeLocaleVides(form).length > 0) return;
    mutation.mutate();
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
      cell: (announcement) => fmt.dateTime(announcement.starts_at),
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
          <LocaleFields form={form} setForm={setForm} manquants={manquants} />

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

          <AgencyTargeting form={form} setForm={setForm} agences={agences} />

          <label className="space-y-1.5">
            <Label htmlFor="announcement-rollout">{t('rollout')}</Label>
            <Input id="announcement-rollout" type="number" min={0} max={100} value={form.rollout} onChange={(event) => setForm({ ...form, rollout: event.target.value })} />
          </label>

          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}

          <Button type="button" onClick={enregistrer} disabled={mutation.isPending}>
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

function LocaleFields({
  form,
  setForm,
  manquants,
}: {
  form: FormState;
  setForm: (value: FormState) => void;
  manquants: string[];
}) {
  const t = useTranslations('superAdmin.announcements');
  const tValidation = useTranslations('validation.common');

  return (
    <div className="grid gap-4">
      {LOCALE_FIELDS.map(({ label, titleKey, bodyKey }) => (
        <div key={label} className="grid gap-2 rounded-lg border border-border p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <Input
            id={`announcement-${titleKey}`}
            aria-label={t('titleFieldLabel', { locale: label })}
            aria-invalid={manquants.includes(titleKey) || undefined}
            aria-describedby={manquants.includes(titleKey) ? `announcement-${titleKey}-error` : undefined}
            value={form[titleKey]}
            onChange={(event) => setForm({ ...form, [titleKey]: event.target.value })}
            placeholder={t('titlePlaceholder')}
          />
          {manquants.includes(titleKey) ? (
            <p id={`announcement-${titleKey}-error`} className="text-xs text-destructive" role="alert">
              {tValidation('required')}
            </p>
          ) : null}
          <Textarea
            id={`announcement-${bodyKey}`}
            aria-label={t('bodyFieldLabel', { locale: label })}
            aria-invalid={manquants.includes(bodyKey) || undefined}
            aria-describedby={manquants.includes(bodyKey) ? `announcement-${bodyKey}-error` : undefined}
            value={form[bodyKey]}
            onChange={(event) => setForm({ ...form, [bodyKey]: event.target.value })}
            placeholder={t('bodyPlaceholder')}
            rows={3}
          />
          {manquants.includes(bodyKey) ? (
            <p id={`announcement-${bodyKey}-error`} className="text-xs text-destructive" role="alert">
              {tValidation('required')}
            </p>
          ) : null}
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
 * ⚠ La liste est PAGINÉE et la recherche est SERVEUR (cf. `useAgencesCiblables`). Deux propriétés
 * qui ne sont pas décoratives :
 *
 * 1. Un identifiant déjà ciblé qui ne figure dans aucune page chargée est conservé et affiché en
 *    pastille — jamais retiré du formulaire. Perdre une cible parce qu'elle est sur la deuxième
 *    page serait une régression silencieuse, exactement ce que l'AC3 interdit.
 * 2. La troncature est DITE (« n sur N ») et franchissable. « Aucune agence ne correspond » ne
 *    s'affiche plus que lorsque le SERVEUR n'a rien trouvé — auparavant l'écran l'affirmait dès
 *    que l'agence cherchée était classée au-delà de la 100ᵉ.
 */
function AgencyTargeting({
  form,
  setForm,
  agences,
}: {
  form: FormState;
  setForm: (value: FormState) => void;
  agences: AgencesCiblables;
}) {
  const t = useTranslations('superAdmin.announcements');
  const tCombobox = useTranslations('console.agencyCombobox');
  const { agencies, agencyNames } = agences;

  const toggle = (id: number) => {
    const agencyIds = form.agencyIds.includes(id)
      ? form.agencyIds.filter((current) => current !== id)
      : [...form.agencyIds, id];
    setForm({ ...form, agencyIds });
  };

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
        value={agences.recherche}
        onChange={(event) => agences.setRecherche(event.target.value)}
      />

      <div className="max-h-48 overflow-y-auto rounded-lg border border-border p-2">
        {agences.isLoading ? (
          <p className="text-xs text-muted-foreground">{t('agenciesLoading')}</p>
        ) : agencies.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('agenciesNoMatch')}</p>
        ) : (
          agencies.map((agency) => (
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

      {agencies.length > 0 ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {agences.enAttente
              ? tCombobox('searching')
              : tCombobox('shown', { shown: agencies.length, total: agences.total })}
          </p>
          {agences.hasNextPage ? (
            <Button
              type="button"
              variant="ghost"
              onClick={agences.chargerPlus}
              disabled={agences.isFetchingNextPage}
            >
              {tCombobox('loadMore')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

function roleLabel(slug: string, t: (key: string, values?: Record<string, string | number>) => string): string {
  return ROLE_SLUGS.includes(slug as RoleSlug) ? t(`roleLabels.${slug}`) : slug;
}

/**
 * TCK-366 — le segment ne porte QUE les restrictions réellement posées.
 *
 * La forme précédente écrivait toujours les trois clés, donc `{"roles":[],"agency_ids":[]}` sur le
 * fil quand rien n'était ciblé. Ce n'est pas du bruit inoffensif : `AnnouncementResolver::matches()`
 * ne rendait « atteint tout le monde » que sur le tableau STRICTEMENT vide, et une annonce diffusée
 * à tous cessait d'atteindre qui que ce soit dès qu'on la ré-enregistrait — prouvé de bout en bout
 * (`AnnouncementTest::test_editing_an_unrestricted_announcement_keeps_it_visible_for_everyone`).
 * Le résolveur est corrigé de son côté ; ici on cesse d'émettre une forme qui ne veut rien dire.
 *
 * ⚠ La clé `segment` reste TOUJOURS présente, à `{}` quand rien n'est ciblé. L'omettre serait un
 * autre défaut : `update()` n'écrit que les clés reçues, donc retirer tout le ciblage d'une annonce
 * qui en avait un ne le retirerait jamais.
 */
export function toPayload(form: FormState): AnnouncementPayload {
  const roles = form.roles.map((role) => role.trim()).filter(Boolean);
  const agencyIds = form.agencyIds.filter((id) => Number.isFinite(id) && id > 0);
  const rollout = form.rollout === '' ? undefined : Number(form.rollout);

  const segment: AnnouncementSegment = {};
  if (roles.length > 0) segment.roles = roles;
  if (agencyIds.length > 0) segment.agency_ids = agencyIds;
  if (rollout !== undefined && Number.isFinite(rollout)) segment.rollout_percentage = rollout;

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
