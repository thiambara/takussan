'use client';

/**
 * TCK-2641 — le carnet des bailleurs (maquette `app-bailleurs` a, écran « Liste »).
 *
 *  · Téléphone (sous `lg`) : la recherche « Nom, téléphone… », les vues en pastilles comptées, puis
 *    les invitations en cours (« Renvoyer » / « Révoquer » de 44 px) et une carte par bailleur :
 *    initiales, « 7 biens · 6 occupés », « Reste à verser », Appeler et WhatsApp.
 *  · Bureau (dès `lg`) : le tableau Bailleur · Téléphone · Biens · Encaissé ce mois · Reste à verser ·
 *    Dernier versement · Statut, sous la recherche et les vues.
 *
 * L'état (recherche, vue, page) vit dans l'URL : la page serveur lit, ce composant écrit. Chaque
 * chiffre vient de l'API (TCK-2640) ; rien n'est recalculé ici.
 *
 * TCK-601 — RIB, NINEA et numéro de pièce ne se lisent plus ici : ils sont sur la fiche du
 * bailleur, masqués, et « Afficher » y journalise la consultation (la mention le dit en bas de page).
 *
 * TCK-256 — la liste est enveloppée de react-query sous la clé `['owners', agencyId, …]` : la feuille
 * d'invitation et la révocation l'invalident par son préfixe.
 */

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Plus, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { EmptyState } from '@/components/feedback';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { PageAuDelaDeLaDerniere } from '@/components/payments/PageAuDelaDeLaDerniere';
import { estAuDelaDeLaDernierePage } from '@/components/payments/pagination-de-l-adresse';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { Button } from '@/components/ui/button';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/context/AuthContext';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { useVueDansLUrl } from '@/hooks/useVueDansLUrl';
import { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { parametresDuCarnet, type EtatDuCarnet, type VueDuCarnet } from '@/lib/owners/carnet';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { fetchOwners, resendInvitation, revokeInvitation, type OwnerProfileSummary, type PageDuCarnet } from '@/lib/queries/owners';
import { cn } from '@/lib/utils';

import { CarteDInvitation, CarteDuBailleur, TableDesBailleurs } from './carnet/pieces';
import { InviteOwnerSheet } from './InviteOwnerSheet';

export interface OwnersListProps {
  readonly agencyId: number;
  readonly canInvite: boolean;
  /** La page lue par le serveur ; son `meta.summary` porte le résumé et les comptes des vues (4a). */
  readonly initialData: PageDuCarnet;
  /** L'état lu dans l'URL par la page ; par défaut, la première page de « Tous ». */
  readonly etat?: EtatDuCarnet;
  /**
   * TCK-2641 (3a) — la fiche (`/app/owners/{id}`) est réservée à l'admin de l'agence
   * (`OwnerProfilePolicy::viewDetail`, 403 sinon) : sans ce drapeau, aucune ligne n'y mène.
   */
  readonly lienVersLaFiche?: boolean;
  /**
   * Le lecteur lit le relevé (`payouts.create`) : la vue « Avec reste à verser » et le tri par reste
   * n'ont de sens que pour lui (l'API rend `null` à tout autre).
   */
  readonly lectureArgent?: boolean;
}

const ETAT_PAR_DEFAUT: EtatDuCarnet = { recherche: '', vue: 'tous', page: 1, parPage: 20 };

export function OwnersList({
  agencyId,
  canInvite,
  initialData,
  etat = ETAT_PAR_DEFAUT,
  lienVersLaFiche = false,
  lectureArgent = false,
}: OwnersListProps) {
  const tErr = useTranslations('errors');
  const t = useTranslations('owners.carnet');
  const tPage = useTranslations('owners.page');
  const tInvite = useTranslations('owners.invite');
  const messageErreur = useMessageErreurApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const garde = useGardeDoubleFacteur();
  const maintenant = useMinuteCourante();
  const f = useFormatteurs();
  const { remplacer } = useVueDansLUrl();
  const [sheetOpen, setSheetOpen] = useState(false);

  const ownersQuery = useQuery({
    // TCK-2815 — la densité est dans la clé : sans elle, le cache de 20 lignes répondrait à 50.
    queryKey: ['owners', agencyId, etat.vue, etat.recherche, etat.page, etat.parPage, lectureArgent],
    queryFn: () => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      return fetchOwners(token, parametresDuCarnet(agencyId, etat, lectureArgent));
    },
    initialData,
    enabled: !!token,
  });

  const page = ownersQuery.data ?? initialData;
  const owners = page.data ?? [];
  const invitations = owners.filter((o) => o.status === 'draft');
  const bailleurs = owners.filter((o) => o.status !== 'draft');

  // TCK-2641 (4a) — le résumé du carnet entier et les comptes des vues, tels que l'API les rend
  // (`meta.summary`) : ni la recherche ni la vue ne les changent. Sans résumé, ni ligne ni compte.
  const resume = page.meta?.summary ?? null;
  const comptes: Partial<Record<VueDuCarnet, number>> = resume
    ? {
        tous: resume.owners + resume.invitations,
        invitations: resume.invitations,
        ...(resume.with_remaining !== null ? { reste: resume.with_remaining } : {}),
      }
    : {};
  const ligneDuResume = (forme: 'telephone' | 'bureau') =>
    resume
      ? t(`resume.${forme}`, {
          bailleurs: resume.owners,
          biens: resume.properties,
          argent: resume.remaining_to_pay !== null ? 'oui' : 'non',
          montant: f.montantCourt(resume.remaining_to_pay),
          mois: f.date(maintenant, { month: 'long' }),
        })
      : null;

  const resendMutation = useMutation<unknown, ApiError, OwnerProfileSummary>({
    mutationFn: async (owner) => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      // P237.01 (TCK-2371) — l'API porte l'invitation en attente sur la ligne.
      const id = owner.pending_invitation_id ?? null;
      if (id === null) throw new ApiError(404, { message: tErr('noPendingInvitation') });
      // TCK-1203 — relancer exige la 2FA de l'agence (`InvitationController@resend`).
      return avecGardeDoubleFacteur(() => resendInvitation(token, id), garde);
    },
    onSuccess: async () => {
      toast.add({ title: tInvite('toasts.resend_success'), type: 'success' });
      // TCK-2641 — la relance réécrit la date d'envoi que la ligne affiche.
      await queryClient.invalidateQueries({ queryKey: ['owners', agencyId] });
    },
    onError: (error) => {
      toast.add({ title: tInvite('toasts.error_title'), description: messageErreur(error), type: 'error' });
    },
  });

  const revokeMutation = useMutation<unknown, ApiError, OwnerProfileSummary>({
    mutationFn: async (owner) => {
      if (!token) throw new ApiError(401, { message: tErr('missingToken') });
      const id = owner.pending_invitation_id ?? null;
      if (id === null) throw new ApiError(404, { message: tErr('noPendingInvitation') });
      return avecGardeDoubleFacteur(() => revokeInvitation(token, id), garde);
    },
    onSuccess: async () => {
      toast.add({ title: tInvite('toasts.revoke_success'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['owners', agencyId] });
    },
    onError: (error) => {
      toast.add({ title: tInvite('toasts.error_title'), description: messageErreur(error), type: 'error' });
    },
  });

  /** « Renvoyer » / « Révoquer » : 44 px sous le pouce, liens de texte dans la cellule du bureau. */
  const gestesDInvitation = (owner: OwnerProfileSummary, forme: 'telephone' | 'bureau'): ReactNode => {
    const nom = owner.metadata?.email ?? owner.user?.email ?? '';
    const telephone = forme === 'telephone';
    return (
      <>
        <button
          type="button"
          data-slot="renvoyer-l-invitation"
          disabled={resendMutation.isPending}
          onClick={() => resendMutation.mutate(owner)}
          aria-label={tPage('actions.resendAria', { nom })}
          className={cn(
            'outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50',
            telephone
              ? 'inline-flex h-11 min-w-0 flex-1 items-center justify-center rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted'
              : 'rounded-sm text-primary hover:underline',
          )}
        >
          {tPage('actions.resend')}
        </button>
        {telephone ? null : <span className="text-muted-foreground" aria-hidden="true">·</span>}
        <button
          type="button"
          data-slot="revoquer-l-invitation"
          disabled={revokeMutation.isPending}
          onClick={() => revokeMutation.mutate(owner)}
          aria-label={tPage('actions.revokeAria', { nom })}
          className={cn(
            'outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50',
            telephone
              ? 'inline-flex h-11 flex-none items-center justify-center rounded-lg px-3 text-sm font-medium text-destructive hover:bg-destructive/10'
              : 'rounded-sm text-destructive hover:underline',
          )}
        >
          {tPage('actions.revoke')}
        </button>
      </>
    );
  };

  const vues: readonly VueDuCarnet[] = lectureArgent ? ['tous', 'reste', 'invitations'] : ['tous', 'invitations'];
  const choisirVue = (vue: VueDuCarnet) => remplacer({ vue: vue === 'tous' ? null : vue, page: null });
  const rechercher = (q: string) => remplacer({ q: q.trim() || null, page: null });
  const filtre = etat.vue !== 'tous' || etat.recherche !== '';
  // TCK-2815 — une page au-delà de la dernière (un lien gardé, une liste qui a diminué) n'est pas un
  // carnet vide : jugé sur `meta.total`, jamais sur le seul nombre de lignes.
  const auDela = estAuDelaDeLaDernierePage(owners.length, page.meta);

  const inviter = canInvite ? (
    <Button onClick={() => setSheetOpen(true)}>
      <Plus className="size-4" aria-hidden="true" />
      {t('inviter')}
    </Button>
  ) : null;

  const recherche = (className?: string) => (
    <DebouncedSearchInput
      id="owners-search"
      value={etat.recherche}
      onCommit={rechercher}
      placeholder={t('recherche.placeholder')}
      aria-label={t('recherche.label')}
      className={className}
    />
  );

  const pastilles = (className?: string, taille?: 'sm') => (
    <RangeeDePuces aria-label={t('vues.label')} className={className}>
      {vues.map((v) => (
        <PuceDeFiltre key={v} taille={taille} active={v === etat.vue} compte={comptes[v] ?? undefined} onClick={() => choisirVue(v)}>
          {t(`vues.${v}`)}
        </PuceDeFiltre>
      ))}
    </RangeeDePuces>
  );

  return (
    <PagePleineLargeur data-slot="carnet-des-bailleurs" className="max-md:pb-6">
      <DeclarerEnTete
        titre={t('titre')}
        action={canInvite ? <ActionDEnTete libelle={t('inviter')} icone={<Plus className="size-5" aria-hidden="true" />} onClick={() => setSheetOpen(true)} primaire /> : undefined}
      />

      <div className="max-md:hidden">
        <PageHeader
          title={t('titre')}
          description={ligneDuResume('bureau') ?? tPage('subtitle')}
          actions={inviter}
          dessous={
            <div className="hidden flex-wrap items-center gap-3 lg:flex xl:flex-nowrap">
              {recherche('h-9 w-[calc(var(--spacing)*83.33)] text-sm')}
              {pastilles('px-0 py-0', 'sm')}
            </div>
          }
        />
      </div>

      {/* Téléphone et tablette : la recherche, puis les vues en pastilles. */}
      <div className="lg:hidden">
        <div className="px-4 pt-3 pb-2 md:mt-5 md:px-0">{recherche()}</div>
        {pastilles('md:px-0')}
      </div>

      {auDela ? (
        <div className="px-4 pt-4 md:px-0 lg:pt-6">
          <PageAuDelaDeLaDerniere meta={page.meta} />
        </div>
      ) : owners.length === 0 ? (
        <div className="px-4 pt-4 md:px-0 lg:pt-6">
          <EmptyState
            icon={<UserRound className="size-8" aria-hidden="true" />}
            title={filtre ? t('videFiltre.titre') : tPage('empty_title')}
            description={<span className="text-pretty">{filtre ? t('videFiltre.description') : tPage('empty_description')}</span>}
            action={!filtre ? (inviter ?? undefined) : undefined}
          />
        </div>
      ) : (
        <>
          <div className="space-y-2.5 px-4 pt-3 pb-2 md:px-0 lg:hidden">
            {invitations.length > 0 ? (
              <section aria-labelledby="carnet-invitations" className="space-y-2.5">
                <h2 id="carnet-invitations" className="text-ui font-semibold text-muted-foreground">
                  {t('invitationsEnAttente', { n: invitations.length })}
                </h2>
                {invitations.map((owner) => (
                  <CarteDInvitation key={owner.id} owner={owner} maintenant={maintenant} gestes={gestesDInvitation(owner, 'telephone')} />
                ))}
              </section>
            ) : null}
            {bailleurs.length > 0 ? (
              <section aria-labelledby="carnet-bailleurs" className={cn('space-y-2.5', invitations.length > 0 && 'pt-3')}>
                <h2 id="carnet-bailleurs" className="flex items-baseline gap-2 text-ui font-semibold text-muted-foreground">
                  <span className="min-w-0 flex-1">
                    {(etat.vue === 'tous' && etat.recherche === '' ? ligneDuResume('telephone') : null) ?? t('nBailleurs', { n: bailleurs.length })}
                  </span>
                  {lectureArgent ? <span className="font-normal">{t('triReste')}</span> : null}
                </h2>
                {bailleurs.map((owner) => (
                  <CarteDuBailleur key={owner.id} owner={owner} lienVersLaFiche={lienVersLaFiche} />
                ))}
              </section>
            ) : null}
            <div className="pt-2">
              <PropertyPagination meta={page.meta} />
            </div>
          </div>

          <div className="hidden pt-6 lg:block">
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <TableDesBailleurs
                owners={owners}
                lienVersLaFiche={lienVersLaFiche}
                maintenant={maintenant}
                gestesDInvitation={(owner) => gestesDInvitation(owner, 'bureau')}
              />
              <div className="border-t border-border px-4 py-3">
                <PropertyPagination meta={page.meta} />
              </div>
            </div>
          </div>
        </>
      )}

      {owners.length > 0 ? (
        <p id="owners-sensitive-notice" className="mx-4 mt-3 flex items-center gap-2 text-ui text-pretty text-muted-foreground md:mx-0">
          <Lock className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden="true" />
          {t('mentionSensible')}
        </p>
      ) : null}

      {canInvite ? <InviteOwnerSheet open={sheetOpen} onOpenChange={setSheetOpen} agencyId={agencyId} /> : null}
    </PagePleineLargeur>
  );
}
