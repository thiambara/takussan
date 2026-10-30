'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  depositRadarReply,
  fetchRadarAdvertiser,
  markRadarOutreachSent,
  prepareRadarOutreach,
  radarKeys,
  RADAR_POLL_MS,
  RADAR_REPLY_POLL_MS,
  RADAR_REPLY_WINDOW_MS,
  recordRadarOutcome,
  retouchRadarOutreach,
  sendRadarOutreach,
} from '@/lib/queries/radar';
import type {
  RadarAdvertiserDetail,
  RadarAdvertiserResponse,
  RadarConsent,
  RadarMessageLocale,
  RadarOutcomeRequest,
  RadarOutreach,
  RadarOutreachChanges,
  RadarOutreachResponse,
  RadarPrepareRequest,
  RadarOutreachProviderStatus,
  RadarPreparedOutreachResponse,
} from '@/types/radar';
import { codeDeLErreur } from '../fiche/useMessageEchecFiche';
import { ApercuMessage } from './ApercuMessage';
import { raisonNonCochable } from './annonces';
import { BandeauPriseEnCharge } from './BandeauPriseEnCharge';
import { ConfirmerRemplacement } from './ConfirmerRemplacement';
import { DelierCompte } from './DelierCompte';
import { HistoriqueMessages } from './HistoriqueMessages';
import { ListeAnnonces } from './ListeAnnonces';
import { PanneauIdentite } from './PanneauIdentite';
import { PreparationMessage } from './PreparationMessage';
import { RelanceActivation } from './RelanceActivation';
import { attendUneReponseParLApi, langueDeRelance, messagesEnAttente, reponseRecueEnAttente, verificationEnCours } from './reponses';
import { SuiviMessage } from './SuiviMessage';
import { useGestesDePrise } from './useGestesDePrise';
import { useMessageEchecAnnonceur } from './useMessageEchecAnnonceur';
import { usePriseEnCharge } from './usePriseEnCharge';

interface RadarAdvertiserCardProps {
  readonly id: number;
}

/** Un message qui change, remplacé dans la fiche lue : l'écran affiche ce que l'API vient de rendre. */
function avecMessage(detail: RadarAdvertiserResponse | undefined, message: RadarOutreach): RadarAdvertiserResponse | undefined {
  if (!detail) return detail;
  return { data: { ...detail.data, outreaches: detail.data.outreaches.map((m) => (m.id === message.id ? message : m)) } };
}

interface FicheChargeeProps {
  readonly annonceur: RadarAdvertiserDetail;
  /** TCK-2426 — un envoi par l'API rouvre la fenêtre de relecture : sa réponse peut arriver. */
  readonly onEnvoiApi: () => void;
}

function FicheChargee({ annonceur, onEnvoiApi }: FicheChargeeProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser');
  const fmt = useFormatteurs();
  const queryClient = useQueryClient();
  const messageEchec = useMessageEchecAnnonceur();
  const { can } = usePlatformAbilities();
  const cle = radarKeys.advertiser(annonceur.id);

  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set());
  const [locale, setLocale] = useState<RadarMessageLocale>('fr');
  const [erreur, setErreur] = useState<unknown>(null);
  /** La demande de préparation qui attend l'accord de l'opérateur : un brouillon existe, il serait remplacé. */
  const [remplacement, setRemplacement] = useState<RadarPrepareRequest | null>(null);
  /** Retouches enregistrées par message : la clé de l'aperçu en dépend, il repart de ce que l'API a rendu. */
  const [retouches, setRetouches] = useState<Readonly<Record<number, number>>>({});
  /** `ai_error` de chaque préparation reçue pendant cette visite, par message : l'API ne le rend qu'à la préparation. */
  const [erreursIa, setErreursIa] = useState<Readonly<Record<number, string | null>>>({});
  /** TCK-2413 — le compte supprimé vient d'être délié pendant cette visite. */
  const [delie, setDelie] = useState(false);
  /** TCK-2426 — l'erreur affichée vient d'une préparation ou d'un envoi : un 409 `reply_pending` s'y dit à l'échelle de l'annonceur, pas du dépôt. */
  const [erreurDeDemarchage, setErreurDeDemarchage] = useState(false);
  /** TCK-2426 — l'issue du dernier envoi par l'API de cette visite : le brouillon a quitté l'écran, la fiche le dit. */
  const [envoiApiFait, setEnvoiApiFait] = useState<RadarOutreachProviderStatus | null>(null);

  const relire = () => queryClient.invalidateQueries({ queryKey: radarKeys.all });

  // Un refus 409/422 dit que la fiche n'est plus ce que l'écran croit (prise perdue, message déjà parti) : elle se relit.
  const surEchec = (e: unknown) => {
    setErreur(e);
    setErreurDeDemarchage(false);
    if (e instanceof ApiError && (e.status === 409 || e.status === 422)) void relire();
  };
  const surEchecDemarchage = (e: unknown) => {
    surEchec(e);
    setErreurDeDemarchage(true);
  };

  // TCK-2389 — les gestes de la prise sont ceux de l'écran « Publier pour lui » aussi : un seul code les porte.
  const { prise, renouvellement, restitution } = useGestesDePrise(annonceur.id, surEchec);
  const preparation = useMutation<RadarPreparedOutreachResponse, ApiError, RadarPrepareRequest>({
    mutationFn: (demande) => prepareRadarOutreach(annonceur.id, demande),
    onSuccess: (reponse) => {
      setErreursIa((courant) => ({ ...courant, [reponse.data.id]: reponse.data.ai_error }));
      setSelection(new Set());
      return relire();
    },
    onError: surEchecDemarchage,
  });
  // Le dépôt rend la réponse, vérifiée en file : la fiche se relit, et se relira tant qu'elle est « en cours ».
  const reponse = useMutation<{ readonly data: RadarConsent }, ApiError, { id: number; fichiers: readonly File[] }>({
    mutationFn: ({ id, fichiers }) => depositRadarReply(id, fichiers),
    onSuccess: relire,
    onError: surEchec,
  });
  const issue = useMutation<RadarOutreachResponse, ApiError, { id: number; demande: RadarOutcomeRequest }>({
    mutationFn: ({ id, demande }) => recordRadarOutcome(id, demande),
    onSuccess: (resultat) => {
      queryClient.setQueryData<RadarAdvertiserResponse>(cle, (detail) => avecMessage(detail, resultat.data));
      return relire();
    },
  });
  const retouche = useMutation<RadarOutreachResponse, ApiError, { id: number; changes: RadarOutreachChanges }>({
    mutationFn: ({ id, changes }) => retouchRadarOutreach(id, changes),
    onSuccess: (reponse) => {
      queryClient.setQueryData<RadarAdvertiserResponse>(cle, (detail) => avecMessage(detail, reponse.data));
      // L'API peut rendre un texte autre que celui saisi (espaces rognés) sans que la clé du texte change.
      setRetouches((courant) => ({ ...courant, [reponse.data.id]: (courant[reponse.data.id] ?? 0) + 1 }));
      return relire();
    },
    onError: surEchec,
  });
  const envoi = useMutation<RadarOutreachResponse, ApiError, number>({
    mutationFn: (id) => markRadarOutreachSent(id),
    onSuccess: (reponse) => {
      queryClient.setQueryData<RadarAdvertiserResponse>(cle, (detail) => avecMessage(detail, reponse.data));
      return relire();
    },
    onError: surEchecDemarchage,
  });
  // TCK-2426 — l'envoi par l'API : la réponse est le message envoyé, posé tel quel dans la fiche avant la relecture.
  const envoiApi = useMutation<RadarOutreachResponse, ApiError, number>({
    mutationFn: (id) => sendRadarOutreach(id),
    onSuccess: (reponse) => {
      queryClient.setQueryData<RadarAdvertiserResponse>(cle, (detail) => avecMessage(detail, reponse.data));
      setEnvoiApiFait(reponse.data.provider_status ?? 'accepted');
      onEnvoiApi();
      return relire();
    },
    onError: surEchecDemarchage,
  });

  const stoppe = annonceur.do_not_contact_at !== null;
  // TCK-2389 — « Publier pour lui » : le geste du `super_admin`, offert dès qu'une annonce est couverte par un accord valide.
  const publiable = can('platform.radar.publish') && !stoppe && annonceur.listings.some((a) => a.covered_by_consent);
  const mienne = annonceur.claim?.mine === true;
  const enCours = prise.isPending || restitution.isPending || preparation.isPending || retouche.isPending || envoi.isPending
    || envoiApi.isPending || reponse.isPending || issue.isPending;
  // On ne prépare que sur une prise à soi, et jamais pour un annonceur qui a dit STOP.
  const gestesFermes = stoppe || !mienne || enCours;

  const lancer = (geste: () => void) => {
    setErreur(null);
    setEnvoiApiFait(null);
    geste();
  };

  usePriseEnCharge({ claim: annonceur.claim, renouveler: () => renouvellement.mutate() });

  // Une annonce cochée qui n'est plus cochable (la fiche relue l'a changée d'étape) sort de la sélection.
  const choisies = new Set([...selection].filter((id) => {
    const annonce = annonceur.listings.find((a) => a.id === id);
    return annonce !== undefined && raisonNonCochable(annonce, annonceur.outreaches) === null;
  }));

  const enPreparation = annonceur.outreaches.filter((m) => m.status === 'prepared');
  const envoyes = annonceur.outreaches.filter((m) => m.status !== 'prepared');
  const ouverts = messagesEnAttente(annonceur.outreaches);
  // TCK-2426 — une réponse reçue par l'API, non tranchée, sur n'importe quelle annonce : rien ne se prépare ni ne part.
  const reponseNonTranchee = reponseRecueEnAttente(annonceur.outreaches);

  const deposer = async (id: number, fichiers: readonly File[]): Promise<boolean> => {
    setErreur(null);
    try {
      await reponse.mutateAsync({ id, fichiers });
      return true;
    } catch {
      return false; // `onError` a déjà posé l'erreur et relu la fiche
    }
  };
  // Le dialogue d'issue porte ses propres erreurs : il reste ouvert sur un refus, et la fiche ne les double pas.
  const trancher = (id: number, demande: RadarOutcomeRequest) => {
    setErreur(null);
    return issue.mutateAsync({ id, demande }).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 409) void relire();
      throw e;
    });
  };
  const classerSansReponse = (id: number) => {
    lancer(() => issue.mutate({ id, demande: { outcome: 'no_answer' } }, { onError: surEchec }));
  };
  // Préparer remplace le brouillon existant (l'API le supprime avec ses retouches) : l'opérateur le confirme d'abord.
  const preparer = (demande: RadarPrepareRequest) => {
    if (enPreparation.length > 0) {
      setRemplacement(demande);
      return;
    }
    lancer(() => preparation.mutate(demande));
  };
  const relancer = (message: RadarOutreach) => {
    preparer({ follow_up_of_id: message.id, locale: langueDeRelance(message) });
  };

  const bascule = (id: number) => {
    setSelection((courant) => {
      const suivant = new Set(courant);
      if (!suivant.delete(id)) suivant.add(id);
      return suivant;
    });
  };

  return (
    <div className="space-y-6" data-testid="radar-annonceur">
      {stoppe ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="radar-annonceur-stop">
          {t('doNotContact', { date: fmt.date(annonceur.do_not_contact_at) })}
        </p>
      ) : null}

      <BandeauPriseEnCharge
        claim={annonceur.claim}
        prendreFerme={stoppe || enCours}
        rendreFerme={enCours || renouvellement.isPending}
        enPrise={prise.isPending}
        enRestitution={restitution.isPending}
        onPrendre={() => lancer(() => prise.mutate())}
        onRendre={() => lancer(() => restitution.mutate())}
      />

      {publiable ? (
        <section
          aria-label={t('publish.heading')}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm"
          data-testid="radar-annonceur-publier"
        >
          <p className="min-w-0 text-foreground">{t('publish.hint')}</p>
          <Link href={`/super-admin/radar/advertisers/${annonceur.id}/publish`} className={buttonVariants({ size: 'sm' })}>
            {t('publish.cta')}
          </Link>
        </section>
      ) : null}

      {/* TCK-2413 — le compte rattaché est supprimé : le `super_admin` le délie, la réclamation reprend. */}
      {annonceur.account?.releasable && can('platform.radar.publish') ? (
        <DelierCompte annonceurId={annonceur.id} parReclamation={annonceur.account.claimed} onDelie={() => { setDelie(true); return relire(); }} />
      ) : null}
      {delie ? (
        <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm text-foreground" data-testid="radar-annonceur-compte-delie">
          {t('account.done')}
        </p>
      ) : null}

      {/* TCK-2394 — la relance d'activation : le panneau ne se montre que si le Radar a créé un compte pour l'annonceur. */}
      <RelanceActivation advertiserId={annonceur.id} mienne={mienne} desactive={stoppe || enCours} />

      {erreur ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="radar-annonceur-erreur">
          {erreurDeDemarchage && codeDeLErreur(erreur) === 'radar.outreach.reply_pending' ? t('message.replyPending') : messageEchec(erreur)}
        </p>
      ) : null}
      {reponseNonTranchee ? (
        <p role="status" className="rounded-lg border border-warning/60 bg-warning/5 px-4 py-3 text-sm text-foreground" data-testid="radar-annonceur-reponse-en-attente">
          {t('message.replyPending')}
        </p>
      ) : null}
      {envoiApiFait !== null ? (
        <p
          role="status"
          className={envoiApiFait === 'ambiguous'
            ? 'rounded-lg border border-warning/60 bg-warning/5 px-4 py-3 text-sm text-foreground'
            : 'rounded-lg bg-muted px-4 py-3 text-sm text-foreground'}
          data-testid="radar-annonceur-envoi-api"
        >
          {envoiApiFait === 'ambiguous' ? t('message.apiAmbiguous') : t('message.apiSent')}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <PanneauIdentite annonceur={annonceur} />
        <div className="space-y-6">
          <ListeAnnonces
            annonces={annonceur.listings}
            messages={annonceur.outreaches}
            selection={choisies}
            onBascule={bascule}
            desactive={gestesFermes}
          />
          <PreparationMessage
            nbAnnonces={choisies.size}
            locale={locale}
            onLocale={setLocale}
            onPreparer={() => preparer({ listing_ids: [...choisies].sort((a, b) => a - b), locale })}
            desactive={gestesFermes || reponseNonTranchee}
            enCours={preparation.isPending}
          />
        </div>
      </div>

      {enPreparation.map((message) => (
        <ApercuMessage
          // Le texte de l'API est la clé : une retouche enregistrée remonte l'aperçu avec ce que l'API a rendu.
          key={`${message.id}:${message.salutation}:${message.summary}:${retouches[message.id] ?? 0}`}
          message={message}
          erreurIa={erreursIa[message.id] ?? null}
          desactive={gestesFermes}
          enRetouche={retouche.isPending}
          enEnvoi={envoi.isPending || envoiApi.isPending}
          onRetoucher={(changes) => lancer(() => retouche.mutate({ id: message.id, changes }))}
          onEnvoye={() => lancer(() => envoi.mutate(message.id))}
          apiDisponible={annonceur.whatsapp_api_available}
          reponseEnAttente={reponseNonTranchee}
          enEnvoiApi={envoiApi.isPending}
          onEnvoyerApi={() => lancer(() => envoiApi.mutate(message.id))}
        />
      ))}

      <section aria-label={t('awaiting.heading')} className="space-y-3" data-testid="radar-annonceur-suivi">
        <h2 className="font-display text-base font-semibold text-foreground">{t('awaiting.heading')}</h2>
        {ouverts.length === 0 ? <p className="text-sm text-muted-foreground">{t('awaiting.none')}</p> : null}
        {ouverts.map((message) => (
          <SuiviMessage
            key={message.id}
            message={message}
            desactive={gestesFermes}
            depotEnCours={reponse.isPending}
            relanceEnCours={preparation.isPending}
            relanceFermee={reponseNonTranchee}
            sansReponseEnCours={issue.isPending}
            onDeposer={(fichiers) => deposer(message.id, fichiers)}
            onIssue={(demande) => trancher(message.id, demande)}
            onRelancer={() => relancer(message)}
            onSansReponse={() => classerSansReponse(message.id)}
          />
        ))}
      </section>

      <HistoriqueMessages messages={envoyes} />

      <ConfirmerRemplacement
        open={remplacement !== null}
        onAnnuler={() => setRemplacement(null)}
        onConfirmer={() => {
          const demande = remplacement;
          setRemplacement(null);
          if (demande !== null) lancer(() => preparation.mutate(demande));
        }}
      />
    </div>
  );
}

/**
 * TCK-2388 (ADR-0077 §3, §4) — la fiche annonceur : qui il est, ce qu'il a publié, et le message d'accord qu'on
 * lui prépare. Le geste d'écrire se prend (une prise en charge à durée limitée, renouvelée tant que la page est
 * ouverte) : deux opérateurs ne démarchent pas le même annonceur. Geste `platform.radar.operate`.
 */
export function RadarAdvertiserCard({ id }: RadarAdvertiserCardProps) {
  const t = useTranslations('superAdmin.pages.radar.advertiser');
  const tCommon = useTranslations('common');
  const { can } = usePlatformAbilities();
  const messageErreur = useMessageErreurApi();
  const autorise = can('platform.radar.operate');
  const queryClient = useQueryClient();
  /**
   * TCK-2426 — l'ouverture de la fenêtre de relecture à 30 s ({@link RADAR_REPLY_WINDOW_MS}) : l'arrivée sur la fiche, le
   * retour sur l'onglet, un envoi par l'API. Lue par `refetchInterval`, hors du rendu. Onglet caché, rien ne se relit
   * (`refetchIntervalInBackground` vaut `false`).
   */
  const debutFenetre = useRef<number | null>(null);
  useEffect(() => {
    debutFenetre.current = Date.now();
    const auRetour = () => {
      if (document.visibilityState !== 'visible') return;
      debutFenetre.current = Date.now();
      // La fenêtre a pu se fermer pendant l'absence : une lecture fraîche réévalue le rythme et le relance.
      void queryClient.invalidateQueries({ queryKey: radarKeys.advertiser(id) });
    };
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [queryClient, id]);

  const fiche = useQuery<RadarAdvertiserResponse, ApiError>({
    queryKey: radarKeys.advertiser(id),
    queryFn: () => fetchRadarAdvertiser(id),
    enabled: autorise,
    staleTime: 10_000,
    // Une réponse se vérifie en file : la fiche se relit tant qu'une vérification tourne, puis s'arrête. TCK-2426 — et, plus
    // lentement, tant qu'un envoi par l'API attend son issue : sa réponse arrive par le webhook, sans autre signal. Pas plus
    // que la fenêtre ouverte à l'arrivée, au retour sur l'onglet ou au dernier envoi par l'API.
    refetchInterval: (requete) => {
      const messages = requete.state.data?.data.outreaches ?? [];
      if (messages.some((m) => verificationEnCours(m.consents))) return RADAR_POLL_MS;
      const fenetreOuverte = debutFenetre.current === null || Date.now() - debutFenetre.current < RADAR_REPLY_WINDOW_MS;
      return fenetreOuverte && attendUneReponseParLApi(messages) ? RADAR_REPLY_POLL_MS : false;
    },
  });

  const retour = (
    <Link
      href="/super-admin/radar"
      className="inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('back')}
    </Link>
  );

  if (!autorise) {
    return (
      <div className="space-y-6">
        {retour}
        <PageHeader title={t('title', { id })} />
        <ErrorState message={t('forbidden')} />
      </div>
    );
  }

  const annonceur = fiche.data?.data;

  return (
    <div className="space-y-6">
      {retour}
      <PageHeader
        title={annonceur ? annonceur.display_name || t('unnamed') : t('title', { id })}
        description={annonceur ? <span className="font-mono">{annonceur.phone ?? t('noPhone')}</span> : undefined}
      />
      {fiche.isError ? (
        <ErrorState
          message={`${t('loadError')} ${messageErreur(fiche.error)}`}
          onRetry={() => void fiche.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : annonceur ? (
        <FicheChargee key={annonceur.id} annonceur={annonceur} onEnvoiApi={() => { debutFenetre.current = Date.now(); }} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
    </div>
  );
}
