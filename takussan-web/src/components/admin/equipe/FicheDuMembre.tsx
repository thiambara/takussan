'use client';

import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { CalendarOff, ChevronRight, Mail, Phone, ShieldCheck } from 'lucide-react';

import { AgentCommissionRateField } from '@/components/admin/roles/AgentCommissionRateField';
import { MemberAgencyRoleSelect } from '@/components/admin/roles/MemberAgencyRoleSelect';
import { UserRolesEditor } from '@/components/admin/users/UserRolesEditor';
import { IconeWhatsApp } from '@/components/crm/IconeWhatsApp';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { ErrorState } from '@/components/feedback';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/context/AuthContext';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initialesDe, nomAffichable } from '@/lib/identite';
import { formaterTelephone } from '@/lib/phone';
import { AGENT_CRM_QUERY_KEY, fetchAbsences, fetchMemberPortfolio } from '@/lib/queries/agent-crm';
import type { TeamSuspensionAction } from '@/lib/queries/team-suspension';
import { cn } from '@/lib/utils';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgencyRoleAssignment } from '@/types/agency-role';
import type { AgentAbsence } from '@/types/agent-crm';

import { useTerminerLAbsence, type CibleDAbsence } from './CouvrirUneAbsence';

import { etatDuMembre, nomOuTiret, roleDuMembre } from './etat-de-l-equipe';
import { PuceDEtat, TexteConnexion } from './pieces';

/**
 * TCK-2667 — la fiche d'un membre (maquette `app-equipe`, a, « Fiche d'un membre » : `BlocsFiche`),
 * les mêmes blocs au téléphone (plein écran) et au bureau (panneau) : identité et arrivée, contact,
 * absence en cours, Rôle et commission, Portefeuille, Sécurité, Absences, Accès et départ.
 *
 * Tout geste est celui d'avant (`TeamConsole`, `UserDetailDrawer`) : rôle d'agence et taux
 * (`team.assign_role`), type de rôle (`UserRolesEditor`), absences (`AgentAbsencesSection` jusqu'à TCK-2668, puis la carte « Absences » et « Couvrir une absence »), bornée
 * au membre), suspendre / réactiver (`suspensionOffer`, jamais soi ni l'admin principal), retirer et
 * passer le portefeuille (`HandoverWizard`, ouvert par la console). Ne s'affiche que ce que l'API sert :
 *
 *  · « Clients et visites » vient du portefeuille de passation (`GET …/members/{u}/portfolio`), que
 *    l'API ouvre sous `team.remove` : sans ce droit, la ligne n'est pas là ;
 *  · « Commissions dues » n'existe que si la ligne porte `commissions_due_amount` (AC4) et mène à la
 *    page Commissions filtrée sur la personne (`/app/commissions?agent=`, TCK-2662) ;
 *  · ni l'appareil de la dernière connexion, ni la date d'activation de la 2FA ne sont servis.
 */
interface FicheDuMembreProps {
  readonly membre: AdminAgencyUserRow;
  readonly agencyId: number;
  readonly currentUserId: number;
  readonly affectations: readonly AgencyRoleAssignment[];
  readonly peutAttribuerLeRole: boolean;
  /** Le portefeuille se lit sous `team.remove` (comme le retrait qu'il précède). */
  readonly peutLireLePortefeuille: boolean;
  readonly suspension: TeamSuspensionAction | null;
  readonly onSuspension: (membre: AdminAgencyUserRow, action: TeamSuspensionAction) => void;
  readonly onRetirer?: (membre: AdminAgencyUserRow) => void;
  /**
   * TCK-2668 — déclarer ou modifier une absence pour un autre que soi, et la terminer : le droit de
   * déléguer (`team.delegate_role` ou administrateur principal, `RoleDelegationPolicy::viewAny`).
   */
  readonly peutDeleguer: boolean;
  /** TCK-2668 — ouvre « Couvrir une absence » (déclarer, ou modifier l'absence donnée). */
  readonly onCouvrir: (cible: CibleDAbsence) => void;
}

function Carte({
  titre,
  action,
  children,
  className,
}: {
  readonly titre: ReactNode;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-corps font-semibold">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function LigneFiche({
  libelle,
  valeur,
  detail,
  droite,
  href,
}: {
  readonly libelle: ReactNode;
  readonly valeur?: ReactNode;
  readonly detail?: ReactNode;
  readonly droite?: ReactNode;
  readonly href?: string;
}) {
  const corps = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-ui text-muted-foreground">{libelle}</p>
        {valeur ? <p className="text-corps font-medium">{valeur}</p> : null}
        {detail ? <p className="text-ui text-muted-foreground">{detail}</p> : null}
      </div>
      {droite}
      {href ? <ChevronRight className="size-5 flex-none text-muted-foreground" aria-hidden="true" /> : null}
    </>
  );
  const classes = 'flex min-h-[3.25rem] items-center gap-3 border-b border-border/70 px-4 py-2.5 last:border-b-0';
  return href ? (
    <Link
      href={href}
      className={cn(
        classes,
        'outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring',
      )}
    >
      {corps}
    </Link>
  ) : (
    <div className={classes}>{corps}</div>
  );
}

const CLASSES_CONTACT =
  'inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring';

export function FicheDuMembre({
  membre,
  agencyId,
  currentUserId,
  affectations,
  peutAttribuerLeRole,
  peutLireLePortefeuille,
  suspension,
  onSuspension,
  onRetirer,
  peutDeleguer,
  onCouvrir,
}: FicheDuMembreProps) {
  const t = useTranslations('admin.team.equipe');
  const { token } = useAuth();
  const messageErreur = useMessageErreurApi();
  const { date, jourMois, montantCourt } = useFormatteurs();
  const role = roleDuMembre(membre, agencyId);
  const etat = etatDuMembre(membre, agencyId);
  const soi = membre.id === currentUserId;
  const nom = nomAffichable(membre);
  const telephone = isReachable(membre.phone) ? membre.phone : null;
  // TCK-2668 — les absences du membre, en cours et à venir : la liste de l'agence (`current=1`), qui
  // dit aussi si le remplaçant peut agir (`substitute_can_act`) — la ligne du tableau ne le sert pas.
  const absences = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.absences(agencyId),
    queryFn: () => fetchAbsences(token ?? '', agencyId),
    enabled: Boolean(token),
    retry: false,
  });
  const siennes = (absences.data ?? []).filter((a) => a.absent?.id === membre.id && (a.status === 'active' || a.status === 'scheduled'));
  const enCours = siennes.find((a) => a.status === 'active') ?? null;
  const aVenir = siennes.filter((a) => a.status === 'scheduled');
  // `revokeAbsence` / `updateAbsence` : l'absent lui-même, ou qui peut déléguer (l'auteur aussi, que
  // la liste ne nomme pas : l'API reste juge).
  const peutGerer = soi || peutDeleguer;
  const terminer = useTerminerLAbsence(agencyId);
  // 776dc214f (D4) — une absence À VENIR s'annule (le « Lever » de l'ancien `AgentAbsencesSection`) :
  // la même révocation que « Terminer », sur sa ligne.
  const annuler = useTerminerLAbsence(agencyId);
  const couvrir = (absence?: AgentAbsence) => onCouvrir({ absentId: membre.id, absentNom: nom, absence: absence ?? null });
  const periode = (a: AgentAbsence) => t('absences.periode', { debut: jourMois(a.starts_at), fin: jourMois(a.ends_at) });
  // Les rangées « Rôle dans l'agence » : un profil de personnel, rarement deux (agent ET
  // administrateur) — chacune dit alors de quel profil elle parle.
  const affectationsDuPersonnel = affectations.filter((a) => a.profile_type === 'agent' || a.profile_type === 'agency_admin');
  const deuxProfils = affectationsDuPersonnel.length > 1;
  const personnel = affectations.length === 0 || affectations.some((a) => a.profile_type === 'agent' || a.profile_type === 'agency_admin');

  const portefeuille = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.portfolio(agencyId, membre.id),
    queryFn: () => fetchMemberPortfolio(token ?? '', agencyId, membre.id),
    enabled: Boolean(token) && peutLireLePortefeuille && personnel,
    retry: false,
    staleTime: 30_000,
  });
  const inventaire = portefeuille.data?.portfolio;

  const contacts = [
    telephone ? (
      <a key="appeler" href={telHref(telephone)} className={CLASSES_CONTACT}>
        <Phone className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {t('fiche.appeler')}
      </a>
    ) : null,
    telephone ? (
      <a key="whatsapp" href={whatsappHref(telephone, '')} target="_blank" rel="noopener noreferrer" className={CLASSES_CONTACT}>
        <IconeWhatsApp className="size-4 text-success lg:size-4" />
        {t('fiche.whatsapp')}
      </a>
    ) : null,
    membre.email ? (
      <a key="email" href={`mailto:${membre.email}`} className={CLASSES_CONTACT}>
        <Mail className="size-4" strokeWidth={1.75} aria-hidden="true" />
        {t('fiche.email')}
      </a>
    ) : null,
  ].filter(Boolean);
  const coordonnees = [telephone ? formaterTelephone(telephone) : null, membre.email].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4" data-testid="fiche-du-membre">
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          <AvatarFallback className="text-xl">{initialesDe(membre) ?? '·'}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-display text-affiche-22 font-semibold leading-tight tracking-titre">{nom}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {membre.joined_at
              ? t('fiche.depuis', {
                  role: t(`role.${role}`),
                  date: date(membre.joined_at, { dateStyle: undefined, month: 'short', year: 'numeric' }),
                })
              : t(`role.${role}`)}
          </p>
          <div className="mt-1.5">
            <PuceDEtat membre={membre} agencyId={agencyId} />
          </div>
        </div>
      </div>

      {contacts.length > 0 ? (
        <div className={cn('grid gap-2', contacts.length === 3 ? 'grid-cols-3' : contacts.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
          {contacts}
        </div>
      ) : null}
      {coordonnees ? <p className="-mt-1 text-ui tabular-nums text-muted-foreground">{coordonnees}</p> : null}

      {enCours ? (
        <section className="rounded-xl border border-warning/30 bg-warning/10" data-slot="absence-en-cours">
          <div className="flex items-start gap-3 p-4">
            <CalendarOff className="mt-0.5 size-5 flex-none text-warning" strokeWidth={1.75} aria-hidden="true" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{t('fiche.absenceEnCours', { debut: jourMois(enCours.starts_at), fin: jourMois(enCours.ends_at) })}</p>
              {enCours.substitute ? (
                <p className="mt-0.5 text-encre-douce">
                  {t(enCours.substitute_can_act ? 'absences.remplacantQuiAgit' : 'absences.remplacant', { nom: nomOuTiret(enCours.substitute.name) })}
                </p>
              ) : null}
              {peutGerer ? (
                <p className="mt-2 flex gap-4 font-medium">
                  <LienDAction onClick={() => couvrir(enCours)}>{t('absences.modifier')}</LienDAction>
                  <LienDAction onClick={() => terminer.mutate(enCours.id)} disabled={terminer.isPending}>
                    {t('absences.terminer')}
                  </LienDAction>
                </p>
              ) : null}
              {terminer.isError ? (
                <p role="alert" className="mt-2 text-destructive">
                  {messageErreur(terminer.error, t('absences.terminerEchec'))}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : etat === 'absent' && membre.current_absence ? (
        <section className="rounded-xl border border-warning/30 bg-warning/10">
          <div className="flex items-start gap-3 p-4">
            <CalendarOff className="mt-0.5 size-5 flex-none text-warning" strokeWidth={1.75} aria-hidden="true" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">
                {t('fiche.absenceEnCours', { debut: jourMois(membre.current_absence.starts_at), fin: jourMois(membre.current_absence.ends_at) })}
              </p>
              {membre.current_absence.substitute ? (
                <p className="mt-0.5 text-encre-douce">{t('absences.remplacant', { nom: nomOuTiret(membre.current_absence.substitute.name) })}</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* Maquette `app-equipe`, a, « Fiche » : deux rangées, « Rôle dans l'agence » et « Taux de
          commission », le contrôle à droite. Sans `team.assign_role`, elles se lisent sans se changer.
          La troisième, « Profil dans l'agence » (agent, administrateur, bailleur : `PUT
          /api/users/{id}/role`), est le geste du tiroir d'avant, que la maquette ne dessine pas. */}
      <Carte titre={t('fiche.roleEtCommission')}>
        {affectationsDuPersonnel.map((a) => {
          const taux = typeof a.commission_rate === 'number' ? t('fiche.tauxValeur', { taux: a.commission_rate }) : t('fiche.tauxAucun');
          return (
            <Fragment key={`${a.profile_type}-${a.profile_id}`}>
              {peutAttribuerLeRole ? (
                <MemberAgencyRoleSelect
                  agencyId={agencyId}
                  assignment={a}
                  disposition="ligne"
                  libelle={deuxProfils ? undefined : t('fiche.roleDansLAgence')}
                />
              ) : (
                <LigneFiche
                  libelle={deuxProfils ? t(`role.${a.profile_type === 'agent' ? 'agent' : 'agency_admin'}`) : t('fiche.roleDansLAgence')}
                  valeur={a.agency_role_name ?? t(`role.${role}`)}
                />
              )}
              {a.profile_type === 'agent' ? (
                peutAttribuerLeRole ? (
                  <AgentCommissionRateField
                    assignment={a}
                    disposition="ligne"
                    ligne={{
                      libelle: t('fiche.tauxDeCommission'),
                      detail: t('fiche.tauxDetail'),
                      valeur: taux,
                      modifier: t('fiche.modifierLeTaux', { valeur: taux }),
                    }}
                  />
                ) : (
                  <LigneFiche libelle={t('fiche.tauxDeCommission')} valeur={taux} detail={t('fiche.tauxDetail')} />
                )
              ) : null}
            </Fragment>
          );
        })}
        <UserRolesEditor
          user={membre}
          roleCourant={role}
          disposition="ligne"
          ligne={{ libelle: t('fiche.typeDeProfil'), detail: t('fiche.typeDeProfilDetail') }}
        />
      </Carte>

      <Carte titre={t('fiche.portefeuille')}>
        <LigneFiche
          libelle={t('fiche.biensSuivis')}
          valeur={<span className="tabular-nums">{t('fiche.nbBiens', { n: membre.properties_followed_count ?? 0 })}</span>}
        />
        {inventaire ? (
          <LigneFiche
            libelle={t('fiche.clientsEtVisites')}
            valeur={
              <span className="tabular-nums">
                {t('fiche.nbClientsEtVisites', { clients: inventaire.customers ?? 0, visites: inventaire.visits ?? 0 })}
              </span>
            }
          />
        ) : null}
        {membre.commissions_due_amount !== undefined ? (
          <LigneFiche
            libelle={t('fiche.commissionsDues')}
            valeur={
              <span className="tabular-nums">
                {membre.commissions_due_amount > 0
                  ? t('fiche.duesMontant', { montant: montantCourt(membre.commissions_due_amount) })
                  : t('fiche.rienAPayer')}
              </span>
            }
            href={`/app/commissions?agent=${membre.id}`}
          />
        ) : null}
      </Carte>

      <Carte titre={t('fiche.securite')}>
        {membre.two_factor_enabled !== undefined ? (
          <LigneFiche
            libelle={t('fiche.doubleAuth')}
            valeur={membre.two_factor_enabled ? t('fiche.doubleAuthActivee') : t('fiche.doubleAuthAbsente')}
            droite={
              membre.two_factor_enabled ? <ShieldCheck className="size-5 flex-none text-success" strokeWidth={1.75} aria-hidden="true" /> : null
            }
          />
        ) : null}
        <LigneFiche libelle={t('fiche.derniereConnexion')} valeur={<TexteConnexion derniereConnexion={membre.last_login_at} />} />
      </Carte>

      {/* Maquette `app-equipe`, a, « Fiche » : la carte « Absences », « Déclarer » en tête ; une
          lecture refusée (403 : profil hors du personnel) tait la carte, un échec se réessaie. */}
      {absences.isError && absences.error instanceof ApiError && absences.error.status === 403 ? null : (
        <Carte
          titre={t('absences.titre')}
          action={
            peutGerer ? (
              <LienDAction onClick={() => couvrir()} className="text-sm">
                {t('absences.declarer')}
              </LienDAction>
            ) : undefined
          }
        >
          {absences.isError ? (
            <div className="p-4">
              <ErrorState
                message={messageErreur(absences.error, t('absences.illisibles'))}
                onRetry={() => void absences.refetch()}
                retryLabel={t('absences.reessayer')}
              />
            </div>
          ) : absences.isPending ? (
            <div className="h-13" aria-hidden="true" />
          ) : siennes.length === 0 ? (
            <p className="px-4 py-3 text-ui text-muted-foreground">{t('absences.aucune')}</p>
          ) : (
            <>
              {enCours ? (
                <LigneFiche
                  libelle={t('absences.enCours')}
                  valeur={
                    enCours.substitute ? t('absences.couverteParLe', { periode: periode(enCours), nom: nomOuTiret(enCours.substitute.name) }) : periode(enCours)
                  }
                  detail={aVenir.length === 0 ? t('absences.aucuneAutre') : undefined}
                />
              ) : null}
              {aVenir.map((a) => (
                <LigneFiche
                  key={a.id}
                  libelle={t('absences.aVenir')}
                  valeur={periode(a)}
                  detail={a.substitute ? t('absences.reprendra', { nom: nomOuTiret(a.substitute.name) }) : undefined}
                  droite={
                    peutGerer ? (
                      <span className="flex flex-none gap-4 text-sm">
                        <LienDAction onClick={() => couvrir(a)}>{t('absences.modifier')}</LienDAction>
                        <LienDAction onClick={() => annuler.mutate(a.id)} disabled={annuler.isPending} ariaLabel={t('absences.annulerAria', { periode: periode(a) })}>
                          {t('absences.annuler')}
                        </LienDAction>
                      </span>
                    ) : undefined
                  }
                />
              ))}
              {annuler.isError ? (
                <p role="alert" className="px-4 pb-3 text-sm text-destructive">
                  {messageErreur(annuler.error, t('absences.annulerEchec'))}
                </p>
              ) : null}
            </>
          )}
        </Carte>
      )}

      {soi || suspension || (onRetirer && personnel) ? (
        <Carte titre={t('fiche.accesEtDepart')}>
          {soi ? (
            <p className="px-4 py-3 text-ui text-muted-foreground">{t('fiche.vousMeme')}</p>
          ) : (
            <>
              {suspension ? (
                <button
                  type="button"
                  onClick={() => onSuspension(membre, suspension)}
                  className="flex w-full items-start gap-3 border-b border-border/70 px-4 py-3 text-left outline-none last:border-b-0 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
                  data-testid="team-suspension-button"
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-corps font-medium', suspension === 'suspend' && 'text-destructive')}>
                      {suspension === 'suspend' ? t('fiche.suspendre') : t('fiche.reactiver')}
                    </span>
                    <span className="block text-ui text-muted-foreground">
                      {suspension === 'suspend' ? t('fiche.suspendreDetail') : t('fiche.reactiverDetail')}
                    </span>
                  </span>
                  <ChevronRight className="mt-0.5 size-5 flex-none text-muted-foreground" aria-hidden="true" />
                </button>
              ) : null}
              {onRetirer && personnel ? (
                <button
                  type="button"
                  onClick={() => onRetirer(membre)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring"
                  data-testid="remove-user-button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-corps font-medium">{t('fiche.retirer')}</span>
                    <span className="block text-ui text-muted-foreground">{t('fiche.retirerDetail')}</span>
                  </span>
                  <ChevronRight className="mt-0.5 size-5 flex-none text-muted-foreground" aria-hidden="true" />
                </button>
              ) : null}
            </>
          )}
        </Carte>
      ) : null}
    </div>
  );
}

/** Un geste en texte de lien (maquette : « Modifier », « Terminer l'absence », « Déclarer »). */
function LienDAction({
  onClick,
  children,
  className,
  disabled,
  ariaLabel,
}: {
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}
