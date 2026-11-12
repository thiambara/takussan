'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ErrorState } from '@/components/feedback';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { Input } from '@/components/ui/input';
import { Radio, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/AuthContext';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { initialesDe, nomAffichable } from '@/lib/identite';
import { decalerJour, jourDeLApi } from '@/lib/jour-de-l-api';
import { fetchAdminUsers } from '@/lib/queries/admin-users';
import { AGENT_CRM_QUERY_KEY, declareAbsence, fetchAbsences, revokeAbsence, updateAbsence } from '@/lib/queries/agent-crm';
import { cn } from '@/lib/utils';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgentAbsence } from '@/types/agent-crm';

import { roleDuMembre } from './etat-de-l-equipe';

/**
 * TCK-2668 — « Couvrir une absence » (maquette `app-equipe`, a, « Couvrir une absence » :
 * `FormulaireAbsence`), l'absence et la délégation de rôle en un seul geste (ADR-0035, amendement du
 * 2026-11-10). Feuille du bas au téléphone, dialogue de 560 px au bureau. S'ouvre depuis la fiche
 * (« Déclarer une absence ») et depuis le bandeau du bureau ou la fiche (« Modifier »).
 *
 *  · La personne en tête, « Du » et « Au (inclus) » (jours de l'API, `jourDeLApi`), « Qui reprend ses
 *    nouvelles demandes ? » parmi le personnel actif de l'agence, la case « {Prénom} peut agir à sa
 *    place » et le motif facultatif.
 *  · La case n'existe que pour qui peut déléguer (`team.delegate_role` ou l'administrateur principal :
 *    `RoleDelegationPolicy::viewAny`) ; sans elle, `substitute_can_act` n'est JAMAIS envoyé — un
 *    `false` retirerait au remplaçant un droit qu'un autre lui a donné.
 *  · Une modification n'envoie que les champs changés : la seule présence d'une date, du remplaçant
 *    ou de la case fait juger le droit de déléguer (`UpdateAgentAbsenceRequest::touchesGrant`). Le
 *    début d'une absence déjà commencée ne se change pas (422 de l'API) : le champ est inactif.
 *  · Le droit d'agir prête au remplaçant le rôle de BASE de l'absent (agent ou administrateur), borné
 *    par le délégant : la case le dit au moment de cocher (ADR-0035, « Conséquences »).
 */

/** Miroir de `config('role_delegations.max_duration_days')` : indice de saisie, l'API reste juge. */
const DUREE_MAX_JOURS = 366;

export interface CibleDAbsence {
  readonly absentId: number;
  readonly absentNom: string;
  /** L'absence à modifier ; sans elle, on en déclare une. */
  readonly absence?: AgentAbsence | null;
}

interface CouvrirUneAbsenceProps {
  readonly agencyId: number;
  /** `team.delegate_role` ou administrateur principal : la case « peut agir à sa place » existe. */
  readonly peutDeleguer: boolean;
  readonly cible: CibleDAbsence | null;
  readonly onFermer: () => void;
}

/** Le jour (`AAAA-MM-JJ`) d'un instant servi par l'API, dans son fuseau. */
function jourDe(instant: string | null | undefined): string {
  return instant ? jourDeLApi(new Date(instant)) : '';
}

/**
 * Le personnel EN EXERCICE de l'agence, parmi qui choisir le remplaçant (`/api/admin-users`,
 * `filter[assignable]=1`, la règle de l'ancien `AgentAbsencesSection`) : un membre suspendu dans
 * l'agence n'y figure pas — l'API le refuserait (422 `substitute_id`).
 */
function usePersonnelActif(agencyId: number, actif: boolean) {
  return useQuery({
    queryKey: ['admin-users', 'remplacants', agencyId],
    queryFn: () => fetchAdminUsers({ role: 'agent,agency_admin', assignable: true, resume: true, sort: 'first_name', perPage: 100 }),
    enabled: actif,
    staleTime: 30_000,
  });
}

/** Rafraîchit tout ce qu'une absence change : la liste, ses comptes et puces, les absences. */
function useRafraichirLesAbsences(agencyId: number) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: AGENT_CRM_QUERY_KEY.absences(agencyId) }),
      queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
    ]);
}

/** « Terminer l'absence » : la révocation, double authentification comprise (`AgentAbsenceController`). */
export function useTerminerLAbsence(agencyId: number) {
  const { token } = useAuth();
  const garde = useGardeDoubleFacteur();
  const rafraichir = useRafraichirLesAbsences(agencyId);
  return useMutation<void, ApiError, number>({
    mutationFn: (id) => avecGardeDoubleFacteur(() => revokeAbsence(token ?? '', agencyId, id), garde),
    onSuccess: () => void rafraichir(),
  });
}

export function CouvrirUneAbsence({ agencyId, peutDeleguer, cible, onFermer }: CouvrirUneAbsenceProps) {
  const t = useTranslations('admin.team.equipe.absence');
  const bureau = useMatchesMedia('(width >= 48rem)');
  const ouvert = cible !== null;
  const titre = cible?.absence ? t('titreModifier') : t('titre');
  const formulaireId = 'couvrir-une-absence';
  const [enCours, setEnCours] = useState(false);

  // Une clé par cible : rouvrir pour une autre personne ne reprend pas la saisie précédente.
  const corps = cible ? (
    <Formulaire
      key={`${cible.absentId}-${cible.absence?.id ?? 'neuve'}`}
      id={formulaireId}
      agencyId={agencyId}
      peutDeleguer={peutDeleguer}
      cible={cible}
      onFermer={onFermer}
      onEnCours={setEnCours}
    />
  ) : null;
  const enregistrer = (
    <Button type="submit" form={formulaireId} disabled={enCours} size={bureau ? 'default' : 'xl'} className={cn(!bureau && 'w-full')}>
      {t('enregistrer')}
    </Button>
  );

  if (!bureau) {
    return (
      <FeuilleDuBas open={ouvert} onOpenChange={(o) => (o ? null : onFermer())} titre={titre} pied={enregistrer}>
        {corps}
      </FeuilleDuBas>
    );
  }
  return (
    <Dialog open={ouvert} onOpenChange={(o) => (o ? null : onFermer())}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-var(--spacing)*16)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[35rem]"
      >
        <DialogHeader className="h-14 flex-none flex-row items-center gap-2 border-b border-border pr-3 pl-6">
          <DialogTitle className="min-w-0 flex-1 truncate font-display text-lg font-semibold tracking-titre">{titre}</DialogTitle>
          <DialogClose render={<Button variant="ghost" size="icon" aria-label={t('fermer')} className="text-muted-foreground" />}>
            <X className="size-5" aria-hidden="true" />
          </DialogClose>
        </DialogHeader>
        {/* La primitive est une grille à rangées automatiques : la colonne flexible laisse le corps défiler
            entre l'en-tête et le pied, qui restent à l'écran quel que soit le nombre de collègues. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{corps}</div>
        <DialogFooter className="m-0 flex-none flex-row justify-end gap-2 rounded-none border-t border-border bg-card px-6 py-3.5">
          <Button variant="outline" onClick={onFermer}>
            {t('annuler')}
          </Button>
          {enregistrer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FormulaireProps {
  readonly id: string;
  readonly agencyId: number;
  readonly peutDeleguer: boolean;
  readonly cible: CibleDAbsence;
  readonly onFermer: () => void;
  readonly onEnCours: (enCours: boolean) => void;
}

function Formulaire({ id, agencyId, peutDeleguer, cible, onFermer, onEnCours }: FormulaireProps) {
  const t = useTranslations('admin.team.equipe.absence');
  const tEquipe = useTranslations('admin.team.equipe');
  const { token } = useAuth();
  const garde = useGardeDoubleFacteur();
  const messageErreur = useMessageErreurApi();
  const { jourMois } = useFormatteurs();
  const rafraichir = useRafraichirLesAbsences(agencyId);
  const absence = cible.absence ?? null;
  const dejaCommencee = absence?.status === 'active';

  // L'écran envoie des jours de l'API : `after:now` l'ouvre au jour de l'API, et l'instant J+366 le
  // ferme au soir de J+365 (P230.03).
  const [aujourdhui] = useState(() => jourDeLApi());
  const initial = {
    debut: absence ? jourDe(absence.starts_at) || aujourdhui : aujourdhui,
    fin: absence ? jourDe(absence.ends_at) : '',
    remplacant: absence?.substitute?.id ?? null,
    peutAgir: absence?.substitute_can_act === true,
    motif: absence?.reason ?? '',
  };
  const [debut, setDebut] = useState(initial.debut);
  const [fin, setFin] = useState(initial.fin);
  const [remplacant, setRemplacant] = useState<number | null>(initial.remplacant);
  const [peutAgir, setPeutAgir] = useState(initial.peutAgir);
  const [motif, setMotif] = useState(initial.motif);
  const [incomplet, setIncomplet] = useState(false);

  const personnel = usePersonnelActif(agencyId, true);
  const absences = useQuery({
    queryKey: AGENT_CRM_QUERY_KEY.absences(agencyId),
    queryFn: () => fetchAbsences(token ?? '', agencyId),
    enabled: Boolean(token),
    retry: false,
  });

  const lignes = personnel.data?.data ?? [];
  const absent = lignes.find((m) => m.id === cible.absentId) ?? null;
  const candidats = lignes.filter((m) => m.id !== cible.absentId);
  const prevues = (a: AdminAgencyUserRow) =>
    (absences.data ?? []).find((x) => x.absent?.id === a.id && (x.status === 'active' || x.status === 'scheduled') && x.id !== absence?.id) ?? null;
  const plusCharge = candidats.reduce<AdminAgencyUserRow | null>(
    (max, m) => ((m.properties_followed_count ?? 0) > (max?.properties_followed_count ?? 0) ? m : max),
    null,
  );
  // Disponibles d'abord, puis le portefeuille le plus léger : la recommandation se lit en tête.
  const ordonnes = [...candidats].sort(
    (a, b) => Number(prevues(a) !== null) - Number(prevues(b) !== null) || (a.properties_followed_count ?? 0) - (b.properties_followed_count ?? 0),
  );
  const choisi = lignes.find((m) => m.id === remplacant) ?? null;
  const prenomChoisi = choisi ? choisi.first_name || nomAffichable(choisi) : (absence?.substitute?.name ?? '');
  const prenomAbsent = absent ? absent.first_name || nomAffichable(absent) : cible.absentNom;
  const roleAbsent = absent ? roleDuMembre(absent, agencyId) : null;

  const enregistrer = useMutation<unknown, ApiError, void>({
    mutationFn: () => {
      const finEnvoyee = `${fin} 23:59:59`;
      if (!absence) {
        return avecGardeDoubleFacteur(
          () =>
            declareAbsence(token ?? '', agencyId, {
              user_id: cible.absentId,
              substitute_id: remplacant ?? 0,
              // Un début à aujourd'hui est immédiat : l'API le prend pour « maintenant » quand il manque.
              ...(debut > aujourdhui ? { starts_at: debut } : {}),
              // La fin de la JOURNÉE choisie : une date seule vaudrait minuit, déjà passé pour « aujourd'hui ».
              ends_at: finEnvoyee,
              reason: motif.trim() || null,
              ...(peutDeleguer ? { substitute_can_act: peutAgir } : {}),
            }),
          garde,
        );
      }
      const changes = {
        ...(!dejaCommencee && debut !== initial.debut ? { starts_at: debut } : {}),
        ...(fin !== initial.fin ? { ends_at: finEnvoyee } : {}),
        ...(remplacant !== null && remplacant !== initial.remplacant ? { substitute_id: remplacant } : {}),
        ...(peutDeleguer && peutAgir !== initial.peutAgir ? { substitute_can_act: peutAgir } : {}),
        ...(motif.trim() !== initial.motif.trim() ? { reason: motif.trim() || null } : {}),
      };
      if (Object.keys(changes).length === 0) return Promise.resolve(null);
      return avecGardeDoubleFacteur(() => updateAbsence(token ?? '', agencyId, absence.id, changes), garde);
    },
    onMutate: () => onEnCours(true),
    onSettled: () => onEnCours(false),
    onSuccess: () => {
      void rafraichir();
      onFermer();
    },
  });

  const envoyer = () => {
    if (remplacant === null || fin === '') {
      setIncomplet(true);
      return;
    }
    enregistrer.mutate();
  };

  const finAffichee = fin ? jourMois(`${fin}T12:00:00Z`) : null;

  return (
    <form
      id={id}
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        envoyer();
      }}
    >
      <div className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
        <Avatar className="size-9">
          <AvatarFallback>{absent ? (initialesDe(absent) ?? '·') : '·'}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-corps font-semibold">{absent ? nomAffichable(absent) : cible.absentNom}</p>
          {absent && roleAbsent ? (
            <p className="text-ui text-muted-foreground">
              {t('teteDetail', { role: tEquipe(`role.${roleAbsent}`), n: absent.properties_followed_count ?? 0 })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Champ libelle={t('du')} htmlFor="absence-du">
          <DatePicker
            id="absence-du"
            value={debut}
            onValueChange={(v) => setDebut(v || aujourdhui)}
            min={aujourdhui}
            max={decalerJour(aujourdhui, DUREE_MAX_JOURS - 1)}
            disabled={dejaCommencee}
            aria-label={t('du')}
            formatAffiche="EEE d MMM"
          />
        </Champ>
        <Champ libelle={t('au')} htmlFor="absence-au" erreur={incomplet && fin === '' ? t('finRequise') : undefined}>
          <DatePicker
            id="absence-au"
            value={fin}
            onValueChange={setFin}
            min={debut > aujourdhui ? debut : aujourdhui}
            max={decalerJour(aujourdhui, DUREE_MAX_JOURS - 1)}
            required
            aria-label={t('au')}
            formatAffiche="EEE d MMM"
            aria-invalid={incomplet && fin === ''}
            aria-describedby={incomplet && fin === '' ? 'absence-au-erreur' : undefined}
          />
        </Champ>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('quiReprend')}</legend>
        {personnel.isError ? (
          <ErrorState
            message={messageErreur(personnel.error, t('personnelIllisible'))}
            onRetry={() => void personnel.refetch()}
            retryLabel={t('reessayer')}
          />
        ) : personnel.isLoading ? (
          <div className="space-y-px overflow-hidden rounded-lg border border-border" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-13 rounded-none" />
            ))}
          </div>
        ) : ordonnes.length === 0 ? (
          <p className="text-ui text-muted-foreground">{t('personne')}</p>
        ) : (
          <RadioGroup
            value={remplacant === null ? '' : String(remplacant)}
            onValueChange={(v) => setRemplacant(Number(v))}
            aria-label={t('quiReprend')}
            aria-invalid={incomplet && remplacant === null}
            aria-describedby="absence-remplacant-aide"
            className={cn('gap-0 overflow-hidden rounded-lg border', incomplet && remplacant === null ? 'border-destructive' : 'border-border')}
          >
            {ordonnes.map((m) => {
              const prevue = prevues(m);
              const biens = t('biens', { n: m.properties_followed_count ?? 0 });
              const quand = prevue
                ? prevue.status === 'active'
                  ? t('absentJusquau', { fin: jourMois(prevue.ends_at) })
                  : t('absencePrevue', { debut: jourMois(prevue.starts_at), fin: jourMois(prevue.ends_at) })
                : m.id === plusCharge?.id && candidats.length > 1
                  ? t('plusCharge')
                  : t('aucuneAbsence');
              return (
                <label
                  key={m.id}
                  className={cn(
                    'flex min-h-13 cursor-pointer items-center gap-3 border-b border-border/70 px-3 py-2 last:border-b-0',
                    remplacant === m.id && 'bg-secondary/60',
                  )}
                >
                  <Radio value={String(m.id)} />
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">{initialesDe(m) ?? '·'}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate text-sm leading-tight font-semibold">
                    {nomAffichable(m)}
                    <span className="block truncate text-xs font-normal text-muted-foreground">{`${biens} · ${quand}`}</span>
                  </span>
                </label>
              );
            })}
          </RadioGroup>
        )}
        <p
          id="absence-remplacant-aide"
          role={incomplet && remplacant === null ? 'alert' : undefined}
          className={cn('mt-1.5 text-xs', incomplet && remplacant === null ? 'text-destructive' : 'text-muted-foreground')}
        >
          {incomplet && remplacant === null ? t('remplacantRequis') : t('quiReprendAide', { prenom: prenomAbsent })}
        </p>
      </fieldset>

      {peutDeleguer ? (
        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
          <span className="mt-0.5 flex">
            <Checkbox checked={peutAgir} onCheckedChange={(c) => setPeutAgir(c === true)} />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium">
            {choisi || absence?.substitute ? t('peutAgir', { prenom: prenomChoisi }) : t('peutAgirSansNom')}
            <span className="mt-0.5 block text-ui font-normal text-muted-foreground">
              {roleAbsent && prenomChoisi ? (
                <>{t('peutAgirRole', { remplacant: prenomChoisi, role: tEquipe(`role.${roleAbsent}`), prenom: prenomAbsent })} </>
              ) : null}
              {finAffichee ? t('peutAgirFin', { date: finAffichee }) : t('peutAgirFinSansDate')}
            </span>
          </span>
        </label>
      ) : null}

      <Champ libelle={t('motif')} htmlFor="absence-motif" aide={t('motifAide')}>
        <Input id="absence-motif" value={motif} maxLength={500} onChange={(e) => setMotif(e.target.value)} />
      </Champ>

      {enregistrer.error ? (
        <p role="alert" className="text-sm text-destructive">
          {messageErreur(enregistrer.error, t('echec'))}
        </p>
      ) : null}
    </form>
  );
}

function Champ({
  libelle,
  htmlFor,
  aide,
  erreur,
  children,
}: {
  readonly libelle: string;
  readonly htmlFor: string;
  readonly aide?: string;
  readonly erreur?: string;
  readonly children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
        {libelle}
      </label>
      {children}
      {erreur ? (
        <p id={`${htmlFor}-erreur`} role="alert" className="mt-1 text-xs text-destructive">
          {erreur}
        </p>
      ) : aide ? (
        <p className="mt-1 text-xs text-muted-foreground">{aide}</p>
      ) : null}
    </div>
  );
}
