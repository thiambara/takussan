'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useAttribuerEnLot,
  useCancelVisit,
  useClaimVisit,
  useCompleteVisit,
  useMarkVisitNoShow,
  useConfirmVisit,
  useProposeVisitSlot,
  useUpdateVisit,
  useVisit,
} from '@/lib/queries/visits';
import { heureMuraleADakar, instantADakar } from '@/lib/visites/heure-de-dakar';
import { smsRetenu } from '@/lib/visites/sort-du-sms';
import { JOURS_DE_VISITE_OUVERTS, useCreneaux } from '@/lib/visites/useCreneaux';
import { decalerJour, jourDeLApi } from '@/lib/jour-de-l-api';
import { useAuth } from '@/context/AuthContext';
import { ErrorState } from '@/components/feedback';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { useCan } from '@/hooks/useCan';
import { useMinuteCourante } from '@/hooks/useMinuteCourante';
import { useAgenceDuPersonnelActif } from '@/hooks/usePersonnelActif';
import { useMyProfiles } from '@/hooks/useProfiles';
import { isAdmin, isAgent as hasAgentRole, isOwner } from '@/lib/roles';
import { VisitFeedbackForm } from './VisitFeedbackForm';
import { REQUETE_TELEPHONE, SuiteDeLaVisite } from './compte-rendu/SuiteDeLaVisite';
import { EnTeteDeLaFiche, FicheDeLaVisite, type FicheDeLaVisiteProps, type GestesDeLaFiche } from './fiche/FicheDeLaVisite';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import { closableParCompteRendu, compteRenduLisible } from '@/lib/visites/compte-rendu';
import { commenceeDeLUrl, commenceeRetenue, etatDeLaFiche } from '@/lib/visites/etat-de-la-fiche';
import type { PropertyVisit } from '@/types/visit';

const FEEDBACK_WINDOW_HOURS = 24;

export function VisitDetail({ id }: { id: number }) {
  const visitQuery = useVisit(id);
  const { data, isLoading, isError } = visitQuery;
  const t = useTranslations('visits.detail');
  const tVisits = useTranslations('visits');
  const tCommon = useTranslations('common');
  const { user } = useAuth();
  const router = useRouter();
  const chemin = usePathname();
  const recherche = useSearchParams();
  // TCK-2587 — UNE horloge pour l'état de la fiche, sa pastille et les gestes permis (Absent dès
  // l'heure) : relue chaque minute, une fiche ouverte à 10:12 passe d'elle-même au jour J « en cours ».
  const maintenant = useMinuteCourante();
  const [dialog, setDialog] = useState<VisitDialogKind | null>(null);
  // `?heure=autre` (la carte d'une demande, TCK-2587 lot A) ouvre « Autre heure » d'emblée.
  const [autreHeure, setAutreHeure] = useState(() => recherche?.get('heure') === 'autre');

  const confirm = useConfirmVisit(id);
  const complete = useCompleteVisit(id);
  const markNoShow = useMarkVisitNoShow(id);
  const cancel = useCancelVisit(id);
  const updateVisit = useUpdateVisit(id);
  const claim = useClaimVisit(id);
  const attribuerEnLot = useAttribuerEnLot();
  const tPlanning = useTranslations('visitPlanning');
  const [proposer, setProposer] = useState(false);
  const toast = useToast();
  const messageErreur = useMessageErreurApi();
  // P182.01 — l'erreur d'un geste sans dialogue (confirmer, terminer, absent) se dit sous les
  // actions (ADR-0019) : sans `catch`, la promesse rejetée n'était rattrapée par rien.
  const [erreurGeste, setErreurGeste] = useState<string | null>(null);
  const telephone = useMatchesMedia(REQUETE_TELEPHONE);
  // « Attribuer à un collègue » : le personnel actif de l'agence qui porte `crm.assign`.
  const agence = useAgenceDuPersonnelActif();
  const { can: peutAttribuer } = useCan('crm.assign', agence ?? undefined, agence !== null);
  // TCK-2587 — la signature des messages au visiteur, « Sokhna, Dakar Immo » (maquette) : l'agence du
  // profil actif, lue comme la coque (le sélecteur d'espace) ; l'espace personnel n'est pas une agence.
  const { data: profils } = useMyProfiles();
  const profilActif = profils?.data.find((x) => x.id === profils.meta.active_profile_id) ?? null;
  const nomDeLAgence = agence !== null && profilActif?.agency?.kind !== 'individual' ? profilActif?.agency?.name?.trim() || null : null;

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  if (isError || !data) {
    // Un 403 n'est pas une panne : « réessayer » n'y changerait rien.
    const forbidden = visitQuery.error instanceof ApiError && visitQuery.error.status === 403;
    // La page n'a pas d'autre titre que celui de la visite : sans lui, l'écran d'erreur n'a
    // aucun h1 (mesuré sur une visite d'une autre agence, 403).
    return (
      <>
        <h1 className="sr-only">{tVisits('fallbackTitle', { id: String(id) })}</h1>
        {forbidden ? (
          <ErrorState message={t('forbidden')} />
        ) : (
          <ErrorState
            message={t('error')}
            onRetry={() => void visitQuery.refetch()}
            retryLabel={tCommon('actions.retry')}
          />
        )}
      </>
    );
  }

  const visit = data.data;
  const status = visit.status ?? 'scheduled';
  // TCK-2581 (AC6) — le client d'une visite ne reçoit plus sa fiche (`customer` masqué, TCK-2585) :
  // l'API dit si le lecteur est le demandeur (`abilities.feedback_customer`, au détail) ; les deux
  // comparaisons restent pour le visiteur à compte et une réponse de liste, sans `abilities`.
  const isVisitor =
    visit.abilities?.feedback_customer === true ||
    (!!user?.id && user.id === visit.visitor_id) ||
    (!!user?.id && !!visit.customer && user.id === visit.customer.user_id);
  const isAssignedAgent = user?.id === visit.agent_id;
  const isManager = user ? isOwner(user.roles) || hasAgentRole(user.roles) || isAdmin(user.roles) : false;
  // P152.04 — les gestes de gestion suivent le verdict de l'API, pas le rôle : sur un bien
  // d'agence, le bailleur n'en a aucun (`visit.staff_only`). `isManager` ne garde que la
  // proposition de créneau et le retour d'agent, qu'une autre règle juge.
  const peutGerer = visit.abilities?.manage === true;
  const feedbackLocked = !isFeedbackOpen(visit);
  const scheduledAtMs = visit.scheduled_at ? new Date(visit.scheduled_at).getTime() : Number.NaN;
  const isPastSlot = Number.isFinite(scheduledAtMs) && scheduledAtMs <= maintenant.getTime();
  const canConfirm = peutGerer && status === 'scheduled';
  const canCancel = (isVisitor || peutGerer) && (status === 'scheduled' || status === 'confirmed');
  const canComplete =
    peutGerer &&
    (status === 'confirmed' || status === 'scheduled') &&
    (isPastSlot || status === 'confirmed');
  // TCK-1375 (P115.05) — l'absence ne se déclare qu'une fois l'heure passée ; le serveur le
  // rejuge (`visit.cannot_mark_no_show`). TCK-2587 — commencée avant l'heure, la fiche montre
  // « Absent » grisé, avec l'heure à partir de laquelle il le devient.
  const canMarkNoShow = peutGerer && (status === 'confirmed' || status === 'scheduled');
  const canReschedule = peutGerer && (status === 'scheduled' || status === 'confirmed');
  const isActive = status === 'scheduled' || status === 'confirmed';
  // TCK-590 — la visite déposée sur le site n'a pas d'agent : le personnel de l'agence la prend
  // en charge. Le serveur tranche la course (409 si un collègue l'a prise entre-temps).
  const canClaim =
    !!user && (hasAgentRole(user.roles) || isAdmin(user.roles)) && isActive && visit.agent_id == null;
  // Le visiteur ne pouvait qu'annuler : il propose désormais un autre créneau, tiré de la grille.
  const canPropose = isVisitor && !isManager && isActive && !!visit.property?.slug;
  // TCK-2581 — le compte rendu (et « Et maintenant ? ») : la clé n'existe que pour le personnel.
  const lisible = compteRenduLisible(visit);
  // TCK-2587 — `?commencee=HH:MM` : « Commencer » pose l'heure du clic dans l'URL, rien en base.
  const commenceeA = commenceeRetenue(visit, maintenant, commenceeDeLUrl(recherche?.get('commencee') ?? null, maintenant));
  const etat = etatDeLaFiche(visit, maintenant, commenceeA);
  const enCours =
    confirm.isPending || complete.isPending || markNoShow.isPending || claim.isPending || attribuerEnLot.isPending;

  async function handleClaim() {
    try {
      await claim.mutateAsync();
      toast.add({ title: tPlanning('claimed'), type: 'success' });
    } catch (err) {
      const conflict = err instanceof ApiError && err.status === 409;
      toast.add({ title: tPlanning(conflict ? 'claimConflict' : 'actionError'), type: 'error' });
    }
  }

  // TCK-590 (passe 3, R1) — un SMS retenu par une borne se dit à l'agent : sans ce signal, il
  // croyait le client prévenu.
  function signalerSmsRetenu(reponse: unknown) {
    if (smsRetenu(reponse)) {
      toast.add({
        title: tPlanning('smsWithheld.title'),
        description: tPlanning('smsWithheld.description'),
        type: 'warning',
      });
    }
  }

  /** Rend `true` si le geste a abouti ; l'erreur de l'API se dit sous les gestes (ADR-0019). */
  async function geste(fn: () => Promise<void>): Promise<boolean> {
    setErreurGeste(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setErreurGeste(messageErreur(e));
      return false;
    }
  }

  async function handleConfirm(scheduledAt: string | null) {
    const reponse = await confirm.mutateAsync(scheduledAt ? { scheduled_at: scheduledAt } : undefined);
    toast.add({
      title: t('toasts.confirmed.title'),
      description: t('toasts.confirmed.description'),
      type: 'success',
    });
    signalerSmsRetenu(reponse);
  }

  async function handleComplete() {
    await complete.mutateAsync({});
    toast.add({
      title: t('toasts.completed.title'),
      description: t('toasts.completed.description'),
      type: 'success',
    });
    // TCK-2581 — au téléphone, « Terminer » enchaîne sur le compte rendu (trois touches), pour qui
    // le lit : le personnel de l'agence du bien (la clé `report` émise par l'API).
    if (telephone && lisible) router.push(`/app/visits/${visit.id}?etape=compte-rendu`);
  }

  async function handleNoShow() {
    await markNoShow.mutateAsync();
    toast.add({
      title: t('toasts.noShow.title'),
      description: t('toasts.noShow.description'),
      type: 'success',
    });
  }

  async function handleAttribuer(agentId: number) {
    const reponse = await attribuerEnLot.mutateAsync({ ids: [visit.id], agent_id: agentId });
    const ligne = reponse.data.find((l) => l.id === visit.id);
    if (ligne && !ligne.ok) throw new Error(tPlanning('actionError'));
    toast.add({ title: tVisits('fiche.attribuee'), type: 'success' });
  }

  // Revue design 2026-09-16 — l'annulation et la replanification passaient par
  // prompt natif du navigateur : un motif sans libellé et une date à taper au format « YYYY-MM-DD HH:mm ».
  // Elles passent par un `Dialog` (patron de `BookingDetail`) ; appels, paramètres et format
  // envoyé sont inchangés.
  async function submitCancel(reason: string) {
    const reponse = await cancel.mutateAsync({ reason });
    toast.add({
      title: t('toasts.cancelled.title'),
      description: t('toasts.cancelled.description'),
      type: 'success',
    });
    signalerSmsRetenu(reponse);
    setDialog(null);
    router.push('/app/visits');
  }

  async function submitReschedule(nextSlot: string) {
    // TCK-590 — le champ se lit à l'heure de Dakar, comme la grille des visites : `new Date(champ)`
    // l'interprétait dans le fuseau du navigateur, et l'agent à Paris décalait la visite d'une heure.
    const iso = instantADakar(nextSlot.slice(0, 10), nextSlot.slice(11, 16));
    const reponse = await updateVisit.mutateAsync({ scheduled_at: iso });
    toast.add({
      title: t('toasts.rescheduled.title'),
      description: t('toasts.rescheduled.description'),
      type: 'success',
    });
    signalerSmsRetenu(reponse);
    setDialog(null);
  }

  const gestes: GestesDeLaFiche = {
    confirmer: canConfirm ? (scheduledAt) => geste(() => handleConfirm(scheduledAt)) : null,
    terminer: canComplete ? () => void geste(handleComplete) : null,
    absent: canMarkNoShow ? () => void geste(handleNoShow) : null,
    replanifier: canReschedule ? () => setDialog('reschedule') : null,
    annuler: canCancel ? () => setDialog('cancel') : null,
    prendreEnCharge: canClaim ? () => void handleClaim() : null,
    proposer: canPropose ? () => setProposer(true) : null,
    attribuer:
      peutGerer && peutAttribuer && agence !== null && isActive
        ? { agence, onChoisir: (agentId) => void geste(() => handleAttribuer(agentId)) }
        : null,
    enCours,
  };

  // La droite du bureau est au compte rendu (TCK-2581) quand il se fait ou se lit depuis la fiche ;
  // sinon, au visiteur (« Ses visites »).
  // TCK-2587 (réponse 3) — pendant « en cours », le compte rendu attend la fin prévue : « Terminer » y
  // mène, et il revient après la fin prévue ou une fois la visite terminée.
  const suiteMasquee = etat === 'en-cours';
  const suiteAPanneau = lisible && (!!visit.report || (closableParCompteRendu(visit, maintenant.getTime()) && !suiteMasquee));
  const fiche: FicheDeLaVisiteProps = {
    visite: visit,
    etat,
    maintenant,
    commenceeA,
    gestes,
    personnel: peutGerer,
    visiteur: isVisitor,
    compteRendu: lisible,
    signature: peutGerer && user?.first_name?.trim() ? [user.first_name.trim(), nomDeLAgence].filter(Boolean).join(', ') : null,
    colonne: !suiteAPanneau,
    // Cherche, Étape, biens correspondants : le personnel ACTIF de l'agence, jamais le bailleur.
    ficheClient: peutGerer && agence !== null,
    erreur: erreurGeste,
    onCommencer: () => router.replace(`${chemin}?commencee=${heureMuraleADakar(new Date()).slice(11, 16)}`),
    autreHeure,
    onAutreHeure: (ouverte) => {
      setErreurGeste(null);
      setAutreHeure(ouverte);
      if (!ouverte && recherche?.get('heure') === 'autre') router.replace(chemin);
    },
  };

  const principal = <FicheDeLaVisite {...fiche} telephone={telephone} />;

  // TCK-2581 — la candidature ou l'offre (TCK-2580) se saisit désormais depuis « Et maintenant ? ».
  // Le retour d'agent noté (1 à 5) laisse la place au compte rendu : il ne s'écrit plus, il se lit.
  const reste = (
    <>
      {status === 'completed' && (
        <FeedbackSection
          visit={visit}
          locked={feedbackLocked}
          canCustomer={isVisitor}
          canRead={isAssignedAgent || isManager}
        />
      )}

      <VisitActionDialog
        kind={dialog}
        // `datetime-local` n'accepte que « AAAA-MM-JJTHH:MM » : la valeur par défaut est celle
        // que le prompt proposait, normalisée.
        defaultSlot={visit.scheduled_at?.slice(0, 16).replace(' ', 'T') ?? ''}
        pending={cancel.isPending || updateVisit.isPending}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        onCancel={submitCancel}
        onReschedule={submitReschedule}
      />

      {proposer && visit.property?.slug ? (
        <ProposerUnCreneau visitId={visit.id} slug={visit.property.slug} onClose={() => setProposer(false)} />
      ) : null}
    </>
  );

  // Au bureau, l'en-tête de la fiche couvre toute la largeur, au-dessus de la grille du compte rendu.
  const enTete = telephone ? null : <EnTeteDeLaFiche {...fiche} />;
  if (lisible) {
    return (
      <>
        {enTete}
        <SuiteDeLaVisite visite={visit} principal={principal} reste={reste} masquee={suiteMasquee} />
      </>
    );
  }
  return (
    <div className="space-y-6">
      {enTete}
      {principal}
      {reste}
    </div>
  );
}

/**
 * TCK-590 — le visiteur propose un autre créneau, choisi dans la grille que le serveur rend pour
 * ce bien (créneaux pris inclus, non choisissables). L'heure est construite à Dakar.
 */
function ProposerUnCreneau({ visitId, slug, onClose }: { visitId: number; slug: string; onClose: () => void }) {
  const t = useTranslations('visitPlanning');
  const tDetail = useTranslations('visits.detail');
  const toast = useToast();
  const propose = useProposeVisitSlot(visitId);
  const [jour, setJour] = useState('');
  const [heure, setHeure] = useState<string | null>(null);
  const creneaux = useCreneaux(slug, jour || null);
  // La fenêtre que l'API accepte : du jour UTC à J+60. Hors d'elle, le jour rendait
  // « L'action n'a pas abouti. » (P230.01).
  const [premierJour] = useState(() => jourDeLApi());

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    if (!jour || !heure) return;
    try {
      await propose.mutateAsync({ scheduled_at: instantADakar(jour, heure) });
      toast.add({ title: t('propose.success'), type: 'success' });
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? (err.data as { message?: string } | null)?.message : undefined;
      toast.add({ title: message ?? t('actionError'), type: 'error' });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(e) => void valider(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t('propose.title')}</DialogTitle>
            <DialogDescription>{t('propose.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={`visit-${visitId}-propose-date`} className="block text-sm font-medium text-foreground">
              {t('plan.date')}
            </label>
            <Input
              id={`visit-${visitId}-propose-date`}
              type="date"
              min={premierJour}
              max={decalerJour(premierJour, JOURS_DE_VISITE_OUVERTS)}
              value={jour}
              onChange={(e) => {
                setJour(e.target.value);
                setHeure(null);
              }}
            />
          </div>
          {creneaux.etat === 'charge' ? (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium text-foreground">
                {t('plan.time')} <span className="font-normal text-muted-foreground">({t('plan.dakarTime')})</span>
              </legend>
              <div className="grid grid-cols-4 gap-2">
                {creneaux.creneaux.map((c) => (
                  <Button
                    key={c.label}
                    type="button"
                    variant={heure === c.label ? 'default' : 'outline'}
                    disabled={!c.available}
                    aria-pressed={heure === c.label}
                    onClick={() => setHeure(c.label)}
                    className="h-10 tabular-nums disabled:text-muted-foreground sm:h-8"
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            </fieldset>
          ) : creneaux.etat === 'erreur' ? (
            <p role="alert" className="text-sm text-destructive">
              {t('actionError')}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {tDetail('dialogs.dismiss')}
            </Button>
            <Button type="submit" disabled={!jour || !heure || propose.isPending}>
              {t('propose.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type VisitDialogKind = 'cancel' | 'reschedule';

function VisitActionDialog({
  kind,
  defaultSlot,
  pending,
  onOpenChange,
  onCancel,
  onReschedule,
}: {
  kind: VisitDialogKind | null;
  defaultSlot: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (reason: string) => Promise<void>;
  onReschedule: (slot: string) => Promise<void>;
}) {
  return (
    <Dialog open={kind !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Une clé par ouverture : le champ repart vide (ou du créneau courant) à chaque fois. */}
        {kind ? (
          <VisitActionForm
            key={kind}
            kind={kind}
            defaultSlot={defaultSlot}
            pending={pending}
            onDismiss={() => onOpenChange(false)}
            onCancel={onCancel}
            onReschedule={onReschedule}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function VisitActionForm({
  kind,
  defaultSlot,
  pending,
  onDismiss,
  onCancel,
  onReschedule,
}: {
  kind: VisitDialogKind;
  defaultSlot: string;
  pending: boolean;
  onDismiss: () => void;
  onCancel: (reason: string) => Promise<void>;
  onReschedule: (slot: string) => Promise<void>;
}) {
  const t = useTranslations('visits.detail');
  const messageErreur = useMessageErreurApi();
  const [value, setValue] = useState(kind === 'reschedule' ? defaultSlot : '');
  // P230.05 — `scheduled_at` `after:now` : le champ se lit à Dakar, son `min` est donc l'instant
  // présent à Dakar (`AAAA-MM-JJTHH:MM`), et non dans le fuseau du navigateur.
  const [maintenantADakar] = useState(() => heureMuraleADakar());
  const [touched, setTouched] = useState(false);
  // P182.01 — l'erreur de l'API se dit dans le dialogue, qui reste ouvert (ADR-0019).
  const [erreurApi, setErreurApi] = useState<string | null>(null);
  const fieldId = `visit-${kind}-field`;
  const errorId = `${fieldId}-error`;
  const trimmed = value.trim();
  const valid =
    kind === 'cancel'
      ? trimmed.length > 0
      : trimmed.length > 0 && !Number.isNaN(new Date(trimmed).getTime());
  const showError = touched && !valid;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (!valid) return;
    setErreurApi(null);
    try {
      if (kind === 'cancel') await onCancel(trimmed);
      else await onReschedule(trimmed);
    } catch (e) {
      setErreurApi(messageErreur(e));
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{t(`dialogs.${kind}.title`)}</DialogTitle>
        <DialogDescription>{t(`dialogs.${kind}.description`)}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <label htmlFor={fieldId} className="block text-sm font-medium text-foreground">
          {kind === 'cancel' ? t('cancellationReason') : t('dialogs.reschedule.label')}
        </label>
        {kind === 'cancel' ? (
          <Textarea
            id={fieldId}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            rows={4}
            placeholder={t('dialogs.cancel.placeholder')}
            required
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
          />
        ) : (
          <Input
            id={fieldId}
            type="datetime-local"
            min={maintenantADakar}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setTouched(true)}
            required
            className="tabular-nums"
            aria-invalid={showError || undefined}
            aria-describedby={showError ? errorId : undefined}
          />
        )}
        {showError ? (
          <p id={errorId} role="alert" className="text-sm text-destructive">
            {t(`dialogs.${kind}.required`)}
          </p>
        ) : null}
      </div>
      {erreurApi ? (
        <p role="alert" className="text-sm text-destructive">
          {erreurApi}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          {t('dialogs.dismiss')}
        </Button>
        <Button
          type="submit"
          variant={kind === 'cancel' ? 'destructive' : 'default'}
          disabled={pending}
        >
          {pending ? t('dialogs.processing') : t(`dialogs.${kind}.submit`)}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Un avis tel que `PropertyVisitController::feedback` l'écrit dans `metadata.feedback_<rôle>`. */
interface AvisDeVisite {
  readonly rating?: number | null;
  readonly comment?: string | null;
}

function avisDe(visit: PropertyVisit, role: 'customer' | 'agent'): AvisDeVisite | null {
  const brut = visit.metadata?.[`feedback_${role}`];
  return brut && typeof brut === 'object' ? (brut as AvisDeVisite) : null;
}

/**
 * Les avis de la visite. Le CLIENT y note la visite (1 à 5) dans sa fenêtre de 24 h — c'est son avis,
 * distinct du compte rendu de l'agence (TCK-2581), qu'il ne voit jamais. Ceux qui gèrent la visite
 * LISENT les avis déjà donnés ; ils n'écrivent plus de retour noté (le compte rendu le remplace).
 */
function FeedbackSection({
  visit,
  locked,
  canCustomer,
  canRead,
}: {
  visit: PropertyVisit;
  locked: boolean;
  canCustomer: boolean;
  canRead: boolean;
}) {
  const t = useTranslations('visits.detail');
  const [submitted, setSubmitted] = useState(false);
  const lus = canRead
    ? (['customer', 'agent'] as const).flatMap((role) => {
        const avis = avisDe(visit, role);
        return avis && (avis.rating != null || avis.comment) ? [{ role, avis }] : [];
      })
    : [];

  if (canCustomer && locked) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-pretty text-muted-foreground sm:p-6">
        {t('feedback.locked')}
      </div>
    );
  }
  if (!canCustomer && lus.length === 0) return null;

  return (
    <div data-slot="avis-de-la-visite" className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-6">
      <div>
        <h2 className="font-display text-base font-semibold tracking-tight text-foreground">
          {t('feedback.title')}
        </h2>
        {canCustomer ? (
          <p className="text-xs text-muted-foreground">
            {t('feedback.window', { hours: String(FEEDBACK_WINDOW_HOURS) })}
          </p>
        ) : null}
      </div>
      {canCustomer && !submitted && (
        <VisitFeedbackForm visitId={visit.id} role="customer" onSubmitted={() => setSubmitted(true)} />
      )}
      {lus.length > 0 ? (
        <dl className="space-y-3 text-sm">
          {lus.map(({ role, avis }) => (
            <div key={role}>
              <dt className="text-muted-foreground">{t(role === 'customer' ? 'feedback.avisClient' : 'feedback.avisAgent')}</dt>
              <dd className="text-foreground">
                {avis.rating != null ? <span className="font-medium tabular-nums">{t('feedback.note', { note: String(avis.rating) })}</span> : null}
                {avis.comment ? <span className="block whitespace-pre-line text-pretty">{avis.comment}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

/**
 * `completed_at + FEEDBACK_WINDOW_HOURS` is the cutoff. Returns `true` when
 * feedback can still be submitted from the client's perspective. Backend
 * re-enforces the same rule — this only drives the UI lock.
 */
function isFeedbackOpen(visit: PropertyVisit): boolean {
  if (visit.status !== 'completed' || !visit.completed_at) return false;
  const completedMs = new Date(visit.completed_at).getTime();
  if (Number.isNaN(completedMs)) return false;
  return Date.now() - completedMs <= FEEDBACK_WINDOW_HOURS * 3600 * 1000;
}
