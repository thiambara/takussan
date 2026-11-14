'use client';

/**
 * TCK-260 — carnet prestataires.
 *
 * Listing wrappé dans react-query pour que la mutation
 * {@link InviteServiceProviderSheet} puisse l'invalider via la clé
 * partagée `['service-providers', agencyId]`.
 *
 * Le composant lit `canInvite` (calculé côté serveur dans la page) pour
 * décider d'afficher le CTA "Ajouter un prestataire". Le backend
 * re-vérifie via {@see App\Policies\Profiles\ServiceProviderProfilePolicy}.
 */

import { Fragment, useState, type ComponentProps } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Mail, Phone, Plus, Star, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/console/StatusBadge';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import { formaterTelephone } from '@/lib/phone';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import {
  fetchServiceProviders,
  resendInvitation,
  revokeInvitation,
  type ServiceProviderProfileSummary,
  type ServiceProviderProfileStatus,
  type ServiceProvidersPage,
} from '@/lib/queries/service-providers';
import { InviteServiceProviderSheet } from './InviteServiceProviderSheet';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

type Props = {
  readonly agencyId: number;
  readonly canInvite: boolean;
  readonly initialData: ServiceProvidersPage;
};

/** Le carnet se lit d'un bloc (la démo en compte six) : les comptes et les métiers des filtres en viennent. */
export const PAR_PAGE = 100;

export function ServiceProvidersList({ agencyId, canInvite, initialData }: Props) {
  const tErr = useTranslations('errors');
  const t = useTranslations('serviceProviders');
  const tInvite = useTranslations('serviceProviders.invite');
  const tList = useTranslations('serviceProviders.list');
  const tCategories = useTranslations('serviceProviders.invite.trades');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  // TCK-1203 — relancer ou révoquer une invitation exige la 2FA de l'agence (`InvitationController`).
  const garde = useGardeDoubleFacteur();
  const [sheetOpen, setSheetOpen] = useState(false);

  const tCarnet = useTranslations('serviceProviders.carnet');
  const f = useFormatteurs();
  const [metier, setMetier] = useState<string | null>(null);
  const [statut, setStatut] = useState<ServiceProviderProfileStatus | null>(null);
  // TCK-2772 — la recherche (nom, téléphone, quartier) et la zone, passées au serveur comme le métier.
  const [recherche, setRecherche] = useState('');
  const [zone, setZone] = useState<string | null>(null);

  // Le carnet entier (les comptes du sous-titre, les métiers et les zones des filtres) ; puis, sous un
  // filtre, la lecture filtrée PAR LE SERVEUR (`filter[specialty]`, `filter[status]`, `filter[search]`,
  // `filter[zone]`), jamais sur la liste reçue.
  const providersQuery = useQuery({
    queryKey: ['service-providers', agencyId],
    queryFn: () => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      return fetchServiceProviders(token, { agencyId, perPage: PAR_PAGE });
    },
    initialData,
    enabled: !!token,
  });
  const filtre = metier !== null || statut !== null || recherche !== '' || zone !== null;
  const filtreeQuery = useQuery({
    queryKey: ['service-providers', agencyId, 'filtre', metier, statut, recherche, zone],
    queryFn: () => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      return fetchServiceProviders(token, {
        agencyId,
        perPage: PAR_PAGE,
        specialty: metier ?? undefined,
        status: statut ?? undefined,
        search: recherche || undefined,
        zone: zone ?? undefined,
      });
    },
    enabled: !!token && filtre,
    // D'un filtre au suivant, la liste précédente reste le temps de la lecture.
    placeholderData: keepPreviousData,
  });

  const tous = providersQuery.data?.data ?? [];
  const zonesDuCarnet = providersQuery.data?.meta?.zones ?? [];
  // TCK-2772 — avant la première réponse filtrée, la liste reçue reste (pas d'état vide qui clignote).
  const providers = filtre ? (filtreeQuery.data?.data ?? tous) : tous;

  const resendMutation = useMutation<unknown, ApiError, ServiceProviderProfileSummary>({
    mutationFn: async (sp) => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      // P237.01 (TCK-2371) — l'API porte l'invitation en attente sur la ligne. La recherche par
      // e-mail qu'elle remplace disait « aucune invitation » pour toute panne, et pour un numéro.
      const id = sp.pending_invitation_id ?? null;
      if (id === null) throw new ApiError(404, { message: tErr('noPendingInvitation') });
      return avecGardeDoubleFacteur(() => resendInvitation(token, id), garde);
    },
    onSuccess: () => {
      toast.add({ title: tInvite('toasts.resend_success'), type: 'success' });
    },
    onError: (error) => {
      toast.add({
        title: tInvite('toasts.error_title'),
        description: messageErreur(error),
        type: 'error',
      });
    },
  });

  const revokeMutation = useMutation<unknown, ApiError, ServiceProviderProfileSummary>({
    mutationFn: async (sp) => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      const id = sp.pending_invitation_id ?? null;
      if (id === null) throw new ApiError(404, { message: tErr('noPendingInvitation') });
      return avecGardeDoubleFacteur(() => revokeInvitation(token, id), garde);
    },
    onSuccess: async () => {
      toast.add({ title: tInvite('toasts.revoke_success'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['service-providers', agencyId] });
    },
    onError: (error) => {
      toast.add({
        title: tInvite('toasts.error_title'),
        description: messageErreur(error),
        type: 'error',
      });
    },
  });

  /** Une liste lue « a, b, c », chaque nom dans son élément (un libellé se retrouve tel quel). */
  const enListe = (noms: readonly string[]) =>
    noms.map((n, i) => (
      <Fragment key={n}>
        {i > 0 ? ', ' : null}
        <span>{n}</span>
      </Fragment>
    ));
  const libelleDuStatut = (st: ServiceProviderProfileStatus) => (st === 'draft' ? tCarnet('invitationEnvoyee') : tList(`status.${st}`));
  const nomsDesMetiers = (sp: ServiceProviderProfileSummary) => metiersDe(sp).map((trade) => translateTrade(tCategories, trade));

  /**
   * TCK-2653 (maquette « Agence — carnet des prestataires ») — Prestataire (nom, métiers, « Assuré »)
   * · Zones · Téléphone · Note · Interventions · Statut · gestes. Le téléphone est celui que l'API
   * sert (compte, sinon invitation — TCK-2652), et à défaut celui de l'invitation (P234.04).
   */
  const colonnes: readonly DataTableColumn<ServiceProviderProfileSummary>[] = [
    {
      id: 'name',
      header: tCarnet('colonnes.prestataire'),
      className: 'align-middle',
      cell: (sp) => (
        <span className="flex items-center gap-3">
          <Avatar size="40" className="max-lg:hidden">
            <AvatarFallback>{initiales(nomDe(sp))}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 leading-tight">
            <span className="inline-flex flex-wrap items-center gap-2 font-semibold text-foreground">
              {nomDe(sp) || '—'}
              {/* TCK-1325 (P117.06) — dérivé de la pièce d'assurance vivante, côté API. */}
              {sp.insured ? <Badge variant="outline">{tList('insured')}</Badge> : null}
            </span>
            {/* TCK-1319 (P117.01) — la colonne fait foi ; la copie de l'invitation ne sert qu'au brouillon. */}
            {nomsDesMetiers(sp).length > 0 ? <span className="mt-0.5 block text-xs text-muted-foreground">{enListe(nomsDesMetiers(sp))}</span> : null}
          </span>
        </span>
      ),
    },
    {
      id: 'zones',
      header: tList('columns.zones'),
      className: 'align-middle text-muted-foreground',
      cell: (sp) => (zonesDe(sp).length === 0 ? '—' : zonesDe(sp).join(', ')),
    },
    {
      id: 'phone',
      header: tList('columns.phone'),
      className: 'align-middle whitespace-nowrap tabular-nums',
      cell: (sp) => (telephoneDe(sp) ? formaterTelephone(telephoneDe(sp) as string) : '—'),
    },
    {
      id: 'note',
      header: tCarnet('colonnes.note'),
      className: 'align-middle',
      cell: (sp) => noteDe(sp),
    },
    {
      id: 'interventions',
      header: tCarnet('colonnes.interventions'),
      align: 'end',
      className: 'align-middle tabular-nums',
      cell: (sp) => f.nombre(sp.completed_interventions_count ?? 0),
    },
    {
      id: 'delai',
      header: tCarnet('colonnes.delai'),
      className: 'align-middle whitespace-nowrap',
      cell: (sp) => dureeDe(sp) ?? <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'status',
      header: tList('columns.status'),
      className: 'align-middle',
      cell: (sp) => statutDe(sp),
    },
    {
      id: 'actions',
      header: tList('columns.actions'),
      headerSrOnly: true,
      align: 'end',
      className: 'align-middle',
      cell: (sp) => gestes(sp),
    },
  ];

  /** Les gestes d'une ligne : relancer ou révoquer l'invitation d'un brouillon ; sinon appeler et WhatsApp. */
  const gestes = (sp: ServiceProviderProfileSummary) => {
    if (sp.status === 'draft') {
      return (
        <span className="inline-flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" disabled={resendMutation.isPending} onClick={() => resendMutation.mutate(sp)}>
            <Mail className="size-3.5" aria-hidden="true" />
            {tList('actions.resend')}
          </Button>
          <Button size="sm" variant="destructive" disabled={revokeMutation.isPending} onClick={() => revokeMutation.mutate(sp)}>
            <Ban className="size-3.5" aria-hidden="true" />
            {tList('actions.revoke')}
          </Button>
        </span>
      );
    }
    const telephone = telephoneDe(sp);
    if (!isReachable(telephone)) return null;
    const nom = nomDe(sp);
    const rond = cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'size-11 rounded-full');
    return (
      <span className="inline-flex gap-2">
        <a href={telHref(telephone)} aria-label={tCarnet('appeler', { nom })} className={rond}>
          <Phone className="size-5" strokeWidth={1.75} aria-hidden="true" />
        </a>
        <a href={whatsappHref(telephone, tCarnet('messageWhatsApp', { nom }))} target="_blank" rel="noopener noreferrer" aria-label={tCarnet('whatsapp', { nom })} className={cn(rond, 'text-accent')}>
          <IconeWhatsApp className="size-5 lg:size-5" />
        </a>
      </span>
    );
  }

  const statutDe = (sp: ServiceProviderProfileSummary) => {
    return (
      <span className="flex flex-col items-start gap-1">
        <StatusBadge label={libelleDuStatut(sp.status)} tone={TON_DU_STATUT[sp.status]} />
        {sp.status === 'draft' && sp.created_at ? <span className="text-xs text-muted-foreground">{tCarnet('inviteLe', { date: f.jourMois(sp.created_at) })}</span> : null}
      </span>
    );
  }

  /** TCK-2772 — le délai de réponse médian servi par l'API, arrondi à l'unité qui se lit (« ~2 h »). */
  const dureeDe = (sp: ServiceProviderProfileSummary): string | null => {
    const minutes = sp.response_delay_minutes;
    if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return null;
    if (minutes < 60) return tCarnet('duree.minutes', { n: f.nombre(Math.max(1, Math.round(minutes))) });
    if (minutes < 24 * 60) return tCarnet('duree.heures', { n: f.nombre(Math.round(minutes / 60)) });
    return tCarnet('duree.jours', { n: f.nombre(Math.round(minutes / (24 * 60))) });
  };

  const noteDe = (sp: ServiceProviderProfileSummary) => {
    const note = sp.average_rating === null || sp.average_rating === undefined ? null : Number(sp.average_rating);
    return note !== null && Number.isFinite(note) ? (
      <span className="inline-flex items-center gap-1 font-semibold tabular-nums">
        <Star className="size-3.5 fill-current text-primary" aria-hidden="true" />
        {f.nombre(note, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
      </span>
    ) : (
      <span className="text-muted-foreground">{tCarnet('pasEncoreNote')}</span>
    );
  }

  /** Au téléphone, une carte par prestataire (maquette) : la ligne entière, gestes compris. */
  const carte = (sp: ServiceProviderProfileSummary) => {
    const telephone = telephoneDe(sp);
    const detail = [nomsDesMetiers(sp).join(', '), zonesDe(sp).join(', ')].filter(Boolean).join(' · ');
    return (
      <article data-slot="carte-prestataire">
        <div className="flex items-start gap-3">
          <Avatar size="48">
            <AvatarFallback>{initiales(nomDe(sp))}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 text-lg leading-tight font-semibold">{nomDe(sp) || '—'}</p>
              {statutDe(sp)}
            </div>
            {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
            {sp.insured ? <Badge variant="outline" className="mt-1">{tList('insured')}</Badge> : null}
          </div>
        </div>
        <p className="mt-3 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
          {noteDe(sp)}
          <span>· {tCarnet('interventions', { count: sp.completed_interventions_count ?? 0 })}</span>
          {dureeDe(sp) ? <span>· {tCarnet('repondEn', { duree: dureeDe(sp) as string })}</span> : null}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="min-w-0 text-base tabular-nums">{telephone ? formaterTelephone(telephone) : tCarnet('sansTelephone')}</span>
          {gestes(sp)}
        </div>
      </article>
    );
  };

  const metiersPresents = [...new Set(tous.flatMap(metiersDe))];
  const compte = (statut: ServiceProviderProfileStatus) => tous.filter((sp) => sp.status === statut).length;
  const sousTitre = [tCarnet('actifs', { count: compte('active') }), compte('draft') > 0 ? tCarnet('invitations', { count: compte('draft') }) : null].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      {canInvite ? (
        <DeclarerEnTete action={<ActionDEnTete libelle={tCarnet('inviter')} icone={<Plus />} onClick={() => setSheetOpen(true)} primaire />} />
      ) : null}
      <PageHeader
        title={tCarnet('titre')}
        description={providersQuery.isSuccess || initialData ? sousTitre : t('page.subtitle')}
        actions={
          canInvite ? (
            <Button onClick={() => setSheetOpen(true)} size="lg" className="max-md:hidden">
              <UserPlus className="size-4" aria-hidden="true" />
              {tCarnet('inviter')}
            </Button>
          ) : null
        }
      />

      {tous.length > 0 ? (
        <div data-slot="filtres-du-carnet" className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-2">
          {/* TCK-2772 — un seul champ : pleine largeur au téléphone, en tête de la rangée au bureau. */}
          <DebouncedSearchInput
            value={recherche}
            onCommit={(v) => setRecherche(v.trim())}
            placeholder={tCarnet('recherche.placeholder')}
            aria-label={tCarnet('recherche.label')}
            busy={filtreeQuery.isFetching}
            className="md:w-64"
          />
          {/* Téléphone : les métiers en pastilles ; bureau : métier, zone et statut en listes. Filtres du serveur. */}
          <div role="group" aria-label={tCarnet('filtres.metier')} className="-mx-4 flex gap-2 overflow-x-auto px-4 md:hidden">
            {[null, ...metiersPresents].map((m) => (
              <button
                key={m ?? 'tous'}
                type="button"
                aria-pressed={metier === m}
                onClick={() => setMetier(m)}
                className={cn('inline-flex h-11 flex-none items-center gap-1.5 rounded-full border px-4 text-base font-medium whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring', metier === m ? 'border-foreground bg-foreground text-background' : 'border-border bg-card')}
              >
                {m === null ? tCarnet('filtres.tous') : translateTrade(tCategories, m)}
                {m === null ? <span className="opacity-70 tabular-nums">{tous.length}</span> : null}
              </button>
            ))}
          </div>
          <div className="hidden md:contents">
            <Select
              value={metier ?? TOUS}
              onValueChange={(v) => setMetier(v === TOUS || !v ? null : String(v))}
              items={[{ value: TOUS, label: tCarnet('filtres.tousLesMetiers') }, ...metiersPresents.map((m) => ({ value: m, label: translateTrade(tCategories, m) }))]}
            >
              <SelectTrigger aria-label={tCarnet('filtres.metier')} className="w-auto min-w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TOUS}>{tCarnet('filtres.tousLesMetiers')}</SelectItem>
                {metiersPresents.map((m) => (
                  <SelectItem key={m} value={m}>
                    {translateTrade(tCategories, m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {zonesDuCarnet.length > 0 ? (
              <Select
                value={zone ?? TOUS}
                onValueChange={(v) => setZone(v === TOUS || !v ? null : String(v))}
                items={[{ value: TOUS, label: tCarnet('filtres.toutesLesZones') }, ...zonesDuCarnet.map((z) => ({ value: z, label: z }))]}
              >
                <SelectTrigger aria-label={tCarnet('filtres.zone')} className="w-auto min-w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TOUS}>{tCarnet('filtres.toutesLesZones')}</SelectItem>
                  {zonesDuCarnet.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select
              value={statut ?? TOUS}
              onValueChange={(v) => setStatut(v === TOUS || !v ? null : (v as ServiceProviderProfileStatus))}
              items={[{ value: TOUS, label: tCarnet('filtres.tousLesStatuts') }, ...STATUTS.map((st) => ({ value: st, label: libelleDuStatut(st) }))]}
            >
              <SelectTrigger aria-label={tCarnet('filtres.statut')} className="w-auto min-w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TOUS}>{tCarnet('filtres.tousLesStatuts')}</SelectItem>
                {STATUTS.map((st) => (
                  <SelectItem key={st} value={st}>
                    {libelleDuStatut(st)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {tous.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted bg-card p-10 text-center">
          <h2 className="text-base font-semibold text-foreground">
            {tList('empty_title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tList('empty_description')}
          </p>
          {canInvite ? (
            <Button onClick={() => setSheetOpen(true)} className="mt-4">
              <Plus className="size-4" aria-hidden="true" />
              {t('page.add')}
            </Button>
          ) : null}
        </div>
      ) : (
        <DataTable
          caption={tCarnet('titre')}
          columns={colonnes}
          rows={providers}
          rowKey={(sp) => sp.id}
          carteMobile={carte}
          emptyState={<p className="p-6 text-center text-sm text-muted-foreground">{tCarnet('aucunPourCeFiltre')}</p>}
        />
      )}

      {canInvite ? (
        <InviteServiceProviderSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          agencyId={agencyId}
        />
      ) : null}
    </div>
  );
}

/** La valeur « tous » des listes de filtre (base-ui n'a pas d'option vide). */
const TOUS = '__tous__';

const STATUTS: readonly ServiceProviderProfileStatus[] = ['active', 'draft', 'inactive', 'suspended'];

const TON_DU_STATUT: Record<ServiceProviderProfileStatus, NonNullable<ComponentProps<typeof StatusBadge>['tone']>> = {
  draft: 'attention',
  active: 'success',
  inactive: 'neutral',
  suspended: 'danger',
};

/** Le téléphone joignable : celui que l'API sert (TCK-2652), sinon celui de l'invitation (P234.04). */
function telephoneDe(sp: ServiceProviderProfileSummary): string | null {
  return sp.phone || sp.metadata?.phone || null;
}

function metiersDe(sp: ServiceProviderProfileSummary): readonly string[] {
  return sp.specialties ?? (sp.status === 'draft' ? sp.metadata?.trades : null) ?? [];
}

function zonesDe(sp: ServiceProviderProfileSummary): readonly string[] {
  return sp.service_areas ?? (sp.status === 'draft' ? sp.metadata?.intervention_zones : null) ?? [];
}

function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Le nom composé, seule logique propre à l'ancienne `ProviderRow` qui survivait à la conversion. */
function nomDe(provider: ServiceProviderProfileSummary): string {
  const meta = provider.metadata ?? null;
  // TCK-2136 (P220.06) — un compte lié sans nom (créé par téléphone) laisse place au nom saisi
  // par l'agence à l'invitation, rangé dans `metadata`.
  const compte = `${provider.user?.first_name ?? ''} ${provider.user?.last_name ?? ''}`.trim();
  return compte || `${meta?.first_name ?? ''} ${meta?.last_name ?? ''}`.trim();
}

/**
 * `useTranslations` raise si la clé n'existe pas — pour les libellés
 * dynamiques (trades sont une enum côté backend) on tente la traduction
 * mais retombe sur la valeur brute si absente, pour rester robuste si
 * la liste s'élargit côté backend avant le front.
 */
function translateTrade(t: (key: string) => string, trade: string): string {
  try {
    return t(trade);
  } catch {
    return trade;
  }
}
