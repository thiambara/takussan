'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CalendarOff, ChevronRight, Mail, SlidersHorizontal, TrendingUp, UserPlus, Users } from 'lucide-react';

import { ConfirmSuspendDialog } from '@/components/admin/ConfirmSuspendDialog';
import { TeamPerformanceTable } from '@/components/admin/team/TeamPerformanceTable';
import { suspensionOffer } from '@/components/admin/users/team-suspension';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { DataState, PageHeader } from '@/components/console';
import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { Pagination } from '@/components/console/Pagination';
import { HandoverWizard } from '@/components/crm/HandoverWizard';
import { EmptyState, ErrorState } from '@/components/feedback';
import { ActionDEnTete } from '@/components/layout/EnTeteMobile';
import { DeclarerEnTete } from '@/components/layout/en-tete-de-la-coque';
import { PagePleineLargeur } from '@/components/layout/PagePleineLargeur';
import { REQUETE_DE_LA_BARRE } from '@/components/layout/plein-ecran';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button } from '@/components/ui/button';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { PuceDeFiltre, RangeeDePuces } from '@/components/ui/puce-de-filtre';
import { Radio, RadioGroup } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsCount, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/context/AuthContext';
import { useCan } from '@/hooks/useCan';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { nomAffichable } from '@/lib/identite';
import { fetchAdminUsers } from '@/lib/queries/admin-users';
import { agencyInvitationKeys, fetchPendingAgencyInvitations } from '@/lib/queries/agency-invitations';
import { postTeamSuspension, type TeamSuspensionAction } from '@/lib/queries/team-suspension';
import type { AgencyRoleAssignment } from '@/types/agency-role';
import type { AdminAgencyUserRow, AdminAgencyUsersResponse } from '@/types/admin-users';

import { FicheDuMembre } from './FicheDuMembre';
import { LigneDuMembre } from './LigneDuMembre';
import { TableDesMembres } from './TableDesMembres';
import { BandeauDesAbsences } from './BandeauDesAbsences';
import { CouvrirUneAbsence, type CibleDAbsence } from './CouvrirUneAbsence';
import { LesInvitations } from './LesInvitations';
import { clesDeLaPastille, lireLEtat, PAGE_DES_BAILLEURS, requeteDeLaListe, type Pastille } from './etat-de-l-equipe';

/**
 * TCK-2667 — « Une personne, une fiche » (maquette `app-equipe`, approche a, retenue le 2026-11-10) :
 * la page Équipe de l'admin d'agence. Remplace `TeamConsole` (TCK-277) et garde chacun de ses gestes.
 *
 *  · Téléphone : pastilles Tous · Agents · Admins · Absents et leurs comptes (`meta.counts`, dont
 *    `staff` pour « Tous »), recherche, une ligne par personne ; en bas, les invitations en attente et
 *    la performance, puis le renvoi des bailleurs vers Propriétaires. Le toucher POUSSE la fiche plein
 *    écran (`?membre=`, le retour rend la liste), avec « Suspendre » et « Déclarer une absence » dans
 *    la barre du bas. Le statut et l'ordre, que la maquette ne dessine pas, vivent dans une feuille.
 *  · Bureau : onglets Membres · Invitations · Performance, le bandeau des absences en cours, la barre
 *    d'outils (recherche, statut, compte, renvoi des bailleurs), le tableau ; la fiche s'ouvre dans le
 *    panneau de droite (`PanneauDroit` : 480 px non modal dès `xl`, plein écran dessous, ADR-0106 § 4).
 *
 * Les bailleurs ne sont plus listés (décision 2) : leurs gestes d'adhésion sont sur leur fiche
 * (`AccesEtDepart`, TCK-2641), et l'ancien lien `?filter[role]=owner` est renvoyé à `/app/owners`.
 */
interface ConsoleDeLEquipeProps {
  readonly agencyId: number;
  readonly currentUserId: number;
  /** `standard` : les invitations et la performance existent ; `null` : l'agence n'a pas pu être lue. */
  readonly agencyKind?: string | null;
  /** L'administrateur principal ne se suspend jamais (422 de l'API) : le geste ne lui est pas offert. */
  readonly primaryAdminId?: number | null;
  /** Sans rôle d'administration, la page s'ouvre par capacité : « Retirer » exige `team.remove`. */
  readonly estAdmin?: boolean;
}

const STATUTS = ['active', 'inactive', 'blocked'] as const;
const TRIS = ['-created_at', 'first_name', '-last_login_at'] as const;
const TOUS_LES_STATUTS = '__tous__';

export function ConsoleDeLEquipe({ agencyId, currentUserId, agencyKind = null, primaryAdminId = null, estAdmin = true }: ConsoleDeLEquipeProps) {
  const t = useTranslations('admin.team.equipe');
  const tPage = useTranslations('team.page');
  const tUsers = useTranslations('admin.users');
  const tConsole = useTranslations('admin.team.console');
  const tCommon = useTranslations('common');
  const messageErreur = useMessageErreurApi();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const garde = useGardeDoubleFacteur();
  const telephone = useMatchesMedia(REQUETE_DE_LA_BARRE);
  const etat = lireLEtat(searchParams);

  const { can: peutVoirLaPerformance } = useCan('reports.view_agency', agencyId);
  const { can: peutAttribuerLeRole } = useCan('team.assign_role', agencyId);
  const { can: peutGererLesInvitations } = useCan('team.invite', agencyId);
  const { can: peutSuspendre } = useCan('team.suspend', agencyId);
  const { can: peutRetirer } = useCan('team.remove', agencyId);
  const { can: peutDeclarerPourUnAutre } = useCan('team.delegate_role', agencyId);
  // `RoleDelegationPolicy::viewAny` : la capacité, ou l'administrateur principal.
  const peutDeleguer = peutDeclarerPourUnAutre || (primaryAdminId !== null && primaryAdminId === currentUserId);
  const agenceDEquipe = agencyKind === 'standard';
  const performanceOfferte = peutVoirLaPerformance && agenceDEquipe;
  const vue = etat.vue === 'performance' && !performanceOfferte ? 'membres' : etat.vue === 'invitations' && !agenceDEquipe ? 'membres' : etat.vue;
  const inviter = (estAdmin || peutGererLesInvitations) && agenceDEquipe;
  const retraitOffert = estAdmin || peutRetirer;

  // TCK-2668 — « Inviter » mène à l'écran des invitations, dont le formulaire prend le focus.
  const [appelALInvitation, setAppelALInvitation] = useState(0);
  const [retrait, setRetrait] = useState<AdminAgencyUserRow | null>(null);
  const [suspension, setSuspension] = useState<{ member: AdminAgencyUserRow; action: TeamSuspensionAction } | null>(null);
  const [erreurDeGeste, setErreurDeGeste] = useState<string | null>(null);
  const [couvrir, setCouvrir] = useState<CibleDAbsence | null>(null);
  const [feuilleDeTri, setFeuilleDeTri] = useState(false);

  // L'ancien onglet « Propriétaires » : la page des bailleurs porte leurs gestes (TCK-2641).
  useEffect(() => {
    if (etat.versLesBailleurs) router.replace(PAGE_DES_BAILLEURS);
  }, [etat.versLesBailleurs, router]);

  const requete = requeteDeLaListe(etat);
  // TCK-1901 — l'agence entre dans la clé (un changement de profil garde la console montée).
  const liste = useQuery<AdminAgencyUsersResponse, ApiError>({
    queryKey: ['admin-users', 'list', agencyId, requete],
    queryFn: () => fetchAdminUsers(requete),
    staleTime: 15_000,
    // TCK-2668 — lue sous chaque onglet : l'en-tête commun (sous-titre, compte de « Membres ») en vit.
    enabled: !etat.versLesBailleurs,
  });
  // TCK-2668 — le compte de l'onglet et du renvoi : les invitations d'équipe EN COURS, la première page
  // de la liste de `LesInvitations` (même clé, une seule lecture).
  const invitations = useQuery({
    queryKey: agencyInvitationKeys.liste(agencyId, 'sent', 1, 10),
    queryFn: () => fetchPendingAgencyInvitations(token ?? '', { statut: 'sent', page: 1, perPage: 10 }),
    enabled: agenceDEquipe && Boolean(token),
    staleTime: 15_000,
  });
  const nbInvitations = invitations.data?.meta.total ?? 0;

  const membres = liste.data?.data ?? [];
  const comptes = liste.data?.meta.counts;
  const affectations = new Map<number, AgencyRoleAssignment[]>();
  for (const a of liste.data?.meta.role_assignments ?? []) affectations.set(a.user_id, [...(affectations.get(a.user_id) ?? []), a]);
  const ouvert = etat.membre !== null ? (membres.find((m) => m.id === etat.membre) ?? null) : null;

  const suspensionDe = (m: AdminAgencyUserRow) => (peutSuspendre ? suspensionOffer(m, agencyId, currentUserId, primaryAdminId) : null);

  /* ── L'URL ───────────────────────────────────────────────────────────────────────────────── */

  const hrefAvec = (maj: Readonly<Record<string, string | null>>) => {
    const qs = new URLSearchParams(searchParams.toString());
    for (const [cle, valeur] of Object.entries(maj)) {
      if (valeur === null || valeur === '') qs.delete(cle);
      else qs.set(cle, valeur);
    }
    const s = qs.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const remplacer = (maj: Readonly<Record<string, string | null>>) => router.replace(hrefAvec(maj), { scroll: false });
  const hrefDeLaListe = hrefAvec({ membre: null });
  const ouvrir = (m: AdminAgencyUserRow) => {
    router.push(hrefAvec({ membre: String(m.id) }), { scroll: telephone });
  };
  const fermer = () => {
    router.push(hrefDeLaListe, { scroll: false });
  };
  const ouvrirLAbsent = (id: number) => router.push(hrefAvec({ ...clesDeLaPastille('absents'), membre: String(id) }), { scroll: false });
  const poserPastille = (p: Pastille) => remplacer(clesDeLaPastille(p));
  const poserVue = (v: string) => remplacer({ vue: v === 'membres' ? null : v, membre: null, page: null });
  const allerInviter = () => {
    if (!agenceDEquipe) return;
    setAppelALInvitation((n) => n + 1);
    if (vue !== 'invitations') router.push(hrefAvec({ vue: 'invitations', membre: null, page: null }), { scroll: false });
  };

  /* ── Les gestes ──────────────────────────────────────────────────────────────────────────── */

  const rafraichir = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-users', 'list'] }),
      queryClient.invalidateQueries({ queryKey: agencyInvitationKeys.all }),
    ]);

  const suspendre = useMutation({
    mutationFn: ({ member, action }: { member: AdminAgencyUserRow; action: TeamSuspensionAction }) =>
      avecGardeDoubleFacteur(() => postTeamSuspension(agencyId, member.id, action, token ?? ''), garde),
    onSuccess: () => {
      setErreurDeGeste(null);
      setSuspension(null);
      void rafraichir();
    },
    onError: (err) => {
      setSuspension(null);
      setErreurDeGeste(messageErreur(err, tConsole('genericError')));
    },
  });

  const dialogues = (
    <>
      <CouvrirUneAbsence agencyId={agencyId} peutDeleguer={peutDeleguer} cible={couvrir} onFermer={() => setCouvrir(null)} />
      <ConfirmSuspendDialog
        target={suspension}
        onCancel={() => setSuspension(null)}
        onConfirm={(member, action) => suspendre.mutate({ member, action })}
        isPending={suspendre.isPending}
      />
      {/* TCK-591 § 8 — « Retirer » ouvre la passation du portefeuille, puis retire. */}
      <HandoverWizard
        agencyId={agencyId}
        member={retrait}
        onClose={() => setRetrait(null)}
        onDone={() => {
          setErreurDeGeste(null);
          setRetrait(null);
          if (etat.membre !== null) router.replace(hrefDeLaListe, { scroll: false });
          void rafraichir();
        }}
      />
    </>
  );

  const ficheDe = (m: AdminAgencyUserRow) => (
    <FicheDuMembre
      membre={m}
      agencyId={agencyId}
      currentUserId={currentUserId}
      affectations={affectations.get(m.id) ?? []}
      peutAttribuerLeRole={peutAttribuerLeRole}
      peutLireLePortefeuille={retraitOffert}
      suspension={suspensionDe(m)}
      onSuspension={(member, action) => setSuspension({ member, action })}
      onRetirer={retraitOffert ? setRetrait : undefined}
      peutDeleguer={peutDeleguer}
      onCouvrir={setCouvrir}
    />
  );
  const peutDeclarerPour = (m: AdminAgencyUserRow) => m.id === currentUserId || peutDeleguer;
  const declarerPour = (m: AdminAgencyUserRow) => setCouvrir({ absentId: m.id, absentNom: nomAffichable(m) });
  const gestesDeLaFiche = (m: AdminAgencyUserRow, grand: boolean) => {
    const offre = suspensionDe(m);
    return (
      <>
        {offre ? (
          <Button
            variant={offre === 'suspend' ? 'destructive' : 'outline'}
            size={grand ? 'xl' : 'default'}
            className={grand ? 'px-5' : undefined}
            onClick={() => setSuspension({ member: m, action: offre })}
          >
            {grand
              ? t(`fiche.barre.${offre === 'suspend' ? 'suspendre' : 'reactiver'}`)
              : t(offre === 'suspend' ? 'fiche.suspendre' : 'fiche.reactiver')}
          </Button>
        ) : null}
        {peutDeclarerPour(m) ? (
          <Button size={grand ? 'xl' : 'default'} className={grand ? 'flex-1' : undefined} onClick={() => declarerPour(m)}>
            <CalendarOff className={grand ? 'size-icone' : 'size-4'} aria-hidden="true" />
            {t('fiche.barre.declarer')}
          </Button>
        ) : null}
      </>
    );
  };

  /* ── Ce que la liste rend dans ses états ─────────────────────────────────────────────────── */

  const filtree = Boolean(etat.recherche || etat.statut || etat.pastille !== 'tous');
  const etatsDeLaListe = (enfant: ReactNode) => (
    <DataState
      data-testid="team-console-loading"
      loading={liste.isLoading}
      error={liste.isError ? messageErreur(liste.error, tPage('error')) : null}
      onRetry={() => void liste.refetch()}
      retryLabel={tCommon('actions.retry')}
      skeletonRows={6}
      skeletonRowClassName="h-12"
      isEmpty={membres.length === 0}
      emptyState={
        <EmptyState
          data-testid="team-console-empty"
          icon={<Users className="size-8" aria-hidden="true" />}
          title={filtree ? tPage('empty_filtered_title') : tPage('empty_title')}
          description={filtree ? tPage('empty_filtered_description') : tPage('empty_description')}
          action={
            filtree || !inviter ? undefined : (
              <Button onClick={allerInviter}>
                <UserPlus className="size-4" aria-hidden="true" />
                {tPage('add')}
              </Button>
            )
          }
        />
      }
    >
      {enfant}
    </DataState>
  );
  const pagination = liste.data ? (
    <Pagination
      page={liste.data.meta.current_page}
      lastPage={liste.data.meta.last_page ?? liste.data.meta.current_page}
      onChange={(p) => remplacer({ page: p > 1 ? String(p) : null, membre: null })}
    />
  ) : null;
  const lienBailleurs = (morceau: ReactNode) => (
    <Link
      href={PAGE_DES_BAILLEURS}
      className="rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {morceau}
    </Link>
  );
  const statutChoisi = (v: string | null) => remplacer({ 'filter[status]': v && v !== TOUS_LES_STATUTS ? v : null, page: null, membre: null });
  const optionsDeStatut = [
    { value: TOUS_LES_STATUTS, label: t('trier.tousLesStatuts') },
    ...STATUTS.map((s) => ({ value: s, label: tUsers(`status.${s}`) })),
  ];
  const recherche = (classe: string, placeholder: string) => (
    <DebouncedSearchInput
      className={classe}
      value={etat.recherche}
      onCommit={(suivant) => remplacer({ 'filter[search]': suivant || null, page: null, membre: null })}
      placeholder={placeholder}
      aria-label={tUsers('filters.searchLabel')}
      busy={liste.isFetching}
    />
  );
  const erreur = erreurDeGeste ? <ErrorState message={erreurDeGeste} /> : null;

  /* ── Téléphone ───────────────────────────────────────────────────────────────────────────── */

  if (telephone) {
    if (vue !== 'membres') {
      return (
        <>
          <DeclarerEnTete
            forme="detail"
            titre={vue === 'performance' ? t('renvois.performance') : t('onglets.invitations')}
            repli={hrefAvec({ vue: null })}
          />
          {vue === 'performance' ? (
            <TeamPerformanceTable agencyId={agencyId} />
          ) : (
            <PagePleineLargeur data-slot="invitations-plein-ecran">
              <LesInvitations
                agencyId={agencyId}
                peutGerer={estAdmin || peutGererLesInvitations}
                peutInviter={inviter}
                telephone
                appelALInvitation={appelALInvitation}
              />
            </PagePleineLargeur>
          )}
          {dialogues}
        </>
      );
    }
    if (ouvert) {
      return (
        <>
          <DeclarerEnTete forme="detail" titre={t('titre')} repli={hrefDeLaListe} />
          <PagePleineLargeur data-slot="fiche-du-membre-plein-ecran">
            <div className="p-4">
              {erreur}
              {ficheDe(ouvert)}
            </div>
            {suspensionDe(ouvert) || peutDeclarerPour(ouvert) ? (
              <BarreDAction secondaire="premier">{gestesDeLaFiche(ouvert, true)}</BarreDAction>
            ) : null}
          </PagePleineLargeur>
          {dialogues}
        </>
      );
    }
    const puces: readonly { readonly p: Pastille; readonly compte: number | undefined }[] = [
      { p: 'tous', compte: comptes?.staff },
      { p: 'agents', compte: comptes?.agent },
      { p: 'admins', compte: comptes?.agency_admin },
      { p: 'absents', compte: comptes?.absent },
    ];
    return (
      <PagePleineLargeur className="pb-4" data-slot="equipe-telephone">
        <DeclarerEnTete
          titre={t('titre')}
          action={
            inviter ? (
              <ActionDEnTete
                primaire
                libelle={t('inviter')}
                icone={<UserPlus className="size-5" strokeWidth={2} aria-hidden="true" />}
                onClick={allerInviter}
              />
            ) : undefined
          }
        />
        <RangeeDePuces aria-label={t('pastilles.aria')} className="px-4 py-3">
          {puces.map(({ p, compte }) => (
            <PuceDeFiltre key={p} active={etat.pastille === p} compte={compte} onClick={() => poserPastille(p)}>
              {t(`pastilles.${p}`)}
            </PuceDeFiltre>
          ))}
        </RangeeDePuces>
        <div className="flex items-center gap-2 px-4 pb-2">
          {recherche('min-w-0 flex-1', t('recherche.telephone'))}
          <FeuilleDuBas
            open={feuilleDeTri}
            onOpenChange={setFeuilleDeTri}
            titre={t('trier.titre')}
            declencheur={
              <Button variant="outline" size="icon-lg" aria-label={t('trier.titre')} className="flex-none">
                <SlidersHorizontal className="size-icone" aria-hidden="true" />
              </Button>
            }
            pied={
              <Button size="lg" className="w-full" onClick={() => setFeuilleDeTri(false)}>
                {t('trier.fermer')}
              </Button>
            }
          >
            <fieldset className="space-y-2">
              <legend className="mb-2 text-ui font-semibold text-muted-foreground">{t('trier.statut')}</legend>
              <RadioGroup value={etat.statut || TOUS_LES_STATUTS} onValueChange={(v) => statutChoisi(String(v))} aria-label={t('trier.statut')}>
                {optionsDeStatut.map((o) => (
                  <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                    <Radio value={o.value} />
                    {o.label}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
            <fieldset className="mt-5 space-y-2">
              <legend className="mb-2 text-ui font-semibold text-muted-foreground">{t('trier.ordre')}</legend>
              <RadioGroup
                value={(TRIS as readonly string[]).includes(etat.tri) ? etat.tri : '-created_at'}
                onValueChange={(v) => remplacer({ sort: v === '-created_at' ? null : String(v), page: null })}
                aria-label={t('trier.ordre')}
              >
                {TRIS.map((tri) => (
                  <label key={tri} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
                    <Radio value={tri} />
                    {t(tri === 'first_name' ? 'trier.nom' : tri === '-last_login_at' ? 'trier.connexion' : 'trier.arrivee')}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          </FeuilleDuBas>
        </div>
        {erreur ? <div className="px-4 pb-2">{erreur}</div> : null}
        {etatsDeLaListe(
          <ul className="divide-y divide-border/70 border-y border-border/70 bg-card" aria-label={t('table.aria')}>
            {membres.map((m) => (
              <LigneDuMembre key={m.id} membre={m} agencyId={agencyId} currentUserId={currentUserId} onOuvrir={ouvrir} />
            ))}
          </ul>,
        )}
        {pagination ? <div className="px-4 pt-3">{pagination}</div> : null}
        {(agenceDEquipe && nbInvitations > 0) || performanceOfferte ? (
          <div className="mt-4 divide-y divide-border/70 border-y border-border/70 bg-card">
            {agenceDEquipe && nbInvitations > 0 ? (
              <LigneDeRenvoi
                icone={<Mail className="size-icone" strokeWidth={1.75} aria-hidden="true" />}
                titre={t('renvois.invitations', { n: nbInvitations })}
                detail={invitations.data?.data[0]?.email ?? undefined}
                compte={nbInvitations}
                href={hrefAvec({ vue: 'invitations', membre: null })}
              />
            ) : null}
            {performanceOfferte ? (
              <LigneDeRenvoi
                icone={<TrendingUp className="size-icone" strokeWidth={1.75} aria-hidden="true" />}
                titre={t('renvois.performance')}
                detail={t('renvois.performanceDetail')}
                href={hrefAvec({ vue: 'performance', membre: null })}
              />
            ) : null}
          </div>
        ) : null}
        <p className="px-4 py-5 text-center text-ui text-muted-foreground">{t.rich('bailleurs.telephone', { lien: lienBailleurs })}</p>
        {dialogues}
      </PagePleineLargeur>
    );
  }

  /* ── Bureau ──────────────────────────────────────────────────────────────────────────────── */

  const equipe = comptes ? t('sousTitre', { agents: comptes.agent, admins: comptes.agency_admin }) : undefined;
  const sousTitre = equipe && agenceDEquipe && nbInvitations > 0 ? t('sousTitreInvitations', { equipe, n: nbInvitations }) : equipe;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('titre')}
        description={sousTitre}
        actions={
          inviter ? (
            <Button onClick={allerInviter}>
              <UserPlus className="size-4" aria-hidden="true" />
              {t('inviter')}
            </Button>
          ) : undefined
        }
        dessous={
          <Tabs value={vue} onValueChange={(v) => poserVue(String(v))}>
            <TabsList variant="line" aria-label={t('onglets.aria')}>
              <TabsTrigger value="membres">
                {t('onglets.membres')}
                {comptes?.staff !== undefined ? <TabsCount>{comptes.staff}</TabsCount> : null}
              </TabsTrigger>
              {agenceDEquipe ? (
                <TabsTrigger value="invitations">
                  {t('onglets.invitations')}
                  {nbInvitations > 0 ? <TabsCount>{nbInvitations}</TabsCount> : null}
                </TabsTrigger>
              ) : null}
              {performanceOfferte ? <TabsTrigger value="performance">{t('onglets.performance')}</TabsTrigger> : null}
            </TabsList>
          </Tabs>
        }
      />

      {vue === 'performance' ? (
        <TeamPerformanceTable agencyId={agencyId} />
      ) : vue === 'invitations' ? (
        <LesInvitations
          agencyId={agencyId}
          peutGerer={estAdmin || peutGererLesInvitations}
          peutInviter={inviter}
          telephone={false}
          appelALInvitation={appelALInvitation}
        />
      ) : (
        <div className="space-y-4">
          <BandeauDesAbsences
            agencyId={agencyId}
            onOuvrir={ouvrirLAbsent}
            onModifier={
              peutDeleguer
                ? (absence) => absence.absent && setCouvrir({ absentId: absence.absent.id, absentNom: absence.absent.name, absence })
                : undefined
            }
          />
          <div className="flex items-center gap-3 max-xl:flex-wrap">
            {recherche('w-full md:w-[21.25rem]', t('recherche.bureau'))}
            <Select value={etat.statut || TOUS_LES_STATUTS} onValueChange={statutChoisi} items={optionsDeStatut}>
              <SelectTrigger className="border-border bg-card" aria-label={tUsers('filters.status')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionsDeStatut.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {liste.data ? (
              <span className="ml-auto text-sm text-muted-foreground">{t('compte', { n: liste.data.meta.total })}</span>
            ) : (
              <span className="ml-auto" />
            )}
            <span className="text-sm text-muted-foreground">{t.rich('bailleurs.bureau', { lien: lienBailleurs })}</span>
          </div>
          {erreur}
          {etatsDeLaListe(
            <TableDesMembres
              membres={membres}
              agencyId={agencyId}
              currentUserId={currentUserId}
              affectations={affectations}
              tri={etat.tri}
              onTrier={(tri) => remplacer({ sort: tri, page: null })}
              selectionne={ouvert?.id ?? null}
              onOuvrir={ouvrir}
              suspensionDe={suspensionDe}
              onSuspension={(member, action) => setSuspension({ member, action })}
              onRetirer={retraitOffert ? setRetrait : undefined}
            />,
          )}
          {pagination}
        </div>
      )}

      <PanneauDroit
        open={ouvert !== null && vue === 'membres'}
        onOpenChange={(o) => {
          if (!o) fermer();
        }}
        titre={t('fiche.titre')}
        pied={ouvert ? gestesDeLaFiche(ouvert, false) : undefined}
      >
        {ouvert ? ficheDe(ouvert) : null}
      </PanneauDroit>
      {dialogues}
    </div>
  );
}

function LigneDeRenvoi({
  icone,
  titre,
  detail,
  compte,
  href,
}: {
  readonly icone: ReactNode;
  readonly titre: string;
  readonly detail?: string;
  readonly compte?: number;
  readonly href: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-3 px-4 py-2.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-muted text-encre-douce">{icone}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-corps font-medium">{titre}</span>
        {detail ? <span className="block truncate text-ui text-muted-foreground">{detail}</span> : null}
      </span>
      {compte ? (
        <span className="inline-flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-primary px-1.5 text-legende font-semibold tabular-nums text-primary-foreground">
          {compte}
        </span>
      ) : null}
      <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
