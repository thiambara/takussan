'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import {
  claimRadarAdvertiser,
  depositRadarReply,
  fetchRadarAdvertiser,
  markRadarOutreachSent,
  prepareRadarOutreach,
  radarKeys,
  RADAR_POLL_MS,
  recordRadarOutcome,
  releaseRadarAdvertiser,
  retouchRadarOutreach,
} from '@/lib/queries/radar';
import type {
  RadarAdvertiserDetail,
  RadarAdvertiserResponse,
  RadarClaimResponse,
  RadarConsent,
  RadarMessageLocale,
  RadarOutcomeRequest,
  RadarOutreach,
  RadarOutreachChanges,
  RadarOutreachResponse,
  RadarPrepareRequest,
  RadarPreparedOutreachResponse,
} from '@/types/radar';
import { ApercuMessage } from './ApercuMessage';
import { BandeauPriseEnCharge } from './BandeauPriseEnCharge';
import { HistoriqueMessages } from './HistoriqueMessages';
import { ListeAnnonces } from './ListeAnnonces';
import { PanneauIdentite } from './PanneauIdentite';
import { PreparationMessage } from './PreparationMessage';
import { langueDeRelance, messagesEnAttente, verificationEnCours } from './reponses';
import { SuiviMessage } from './SuiviMessage';
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

function FicheChargee({ annonceur }: { readonly annonceur: RadarAdvertiserDetail }) {
  const t = useTranslations('superAdmin.pages.radar.advertiser');
  const fmt = useFormatteurs();
  const queryClient = useQueryClient();
  const messageEchec = useMessageEchecAnnonceur();
  const cle = radarKeys.advertiser(annonceur.id);

  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set());
  const [locale, setLocale] = useState<RadarMessageLocale>('fr');
  const [erreur, setErreur] = useState<unknown>(null);
  /** `ai_error` de chaque préparation reçue pendant cette visite, par message : l'API ne le rend qu'à la préparation. */
  const [erreursIa, setErreursIa] = useState<Readonly<Record<number, string | null>>>({});

  const relire = () => queryClient.invalidateQueries({ queryKey: radarKeys.all });

  // Un refus 409/422 dit que la fiche n'est plus ce que l'écran croit (prise perdue, message déjà parti) : elle se relit.
  const surEchec = (e: unknown) => {
    setErreur(e);
    if (e instanceof ApiError && (e.status === 409 || e.status === 422)) void relire();
  };

  const prise = useMutation<RadarClaimResponse, ApiError, void>({
    mutationFn: () => claimRadarAdvertiser(annonceur.id),
    onSuccess: (reponse) => {
      queryClient.setQueryData<RadarAdvertiserResponse>(cle, (detail) =>
        detail ? { data: { ...detail.data, claim: reponse.data.claim } } : detail);
      return relire();
    },
    onError: surEchec,
  });
  const restitution = useMutation<void, ApiError, void>({
    mutationFn: () => releaseRadarAdvertiser(annonceur.id),
    onSuccess: relire,
    onError: surEchec,
  });
  const preparation = useMutation<RadarPreparedOutreachResponse, ApiError, RadarPrepareRequest>({
    mutationFn: (demande) => prepareRadarOutreach(annonceur.id, demande),
    onSuccess: (reponse) => {
      setErreursIa((courant) => ({ ...courant, [reponse.data.id]: reponse.data.ai_error }));
      setSelection(new Set());
      return relire();
    },
    onError: surEchec,
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
    onError: surEchec,
  });

  const stoppe = annonceur.do_not_contact_at !== null;
  const mienne = annonceur.claim?.mine === true;
  const enCours = prise.isPending || restitution.isPending || preparation.isPending || retouche.isPending || envoi.isPending
    || reponse.isPending || issue.isPending;
  // On ne prépare que sur une prise à soi, et jamais pour un annonceur qui a dit STOP.
  const gestesFermes = stoppe || !mienne || enCours;

  const lancer = (geste: () => void) => {
    setErreur(null);
    geste();
  };

  usePriseEnCharge({ claim: annonceur.claim, renouveler: () => prise.mutate() });

  const enPreparation = annonceur.outreaches.filter((m) => m.status === 'prepared');
  const envoyes = annonceur.outreaches.filter((m) => m.status !== 'prepared');
  const ouverts = messagesEnAttente(annonceur.outreaches);

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
  const relancer = (message: RadarOutreach) => {
    lancer(() => preparation.mutate({ follow_up_of_id: message.id, locale: langueDeRelance(message) }));
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
        desactive={stoppe || enCours}
        enPrise={prise.isPending}
        enRestitution={restitution.isPending}
        onPrendre={() => lancer(() => prise.mutate())}
        onRendre={() => lancer(() => restitution.mutate())}
      />

      {erreur ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="radar-annonceur-erreur">
          {messageEchec(erreur)}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <PanneauIdentite annonceur={annonceur} />
        <div className="space-y-6">
          <ListeAnnonces
            annonces={annonceur.listings}
            messages={annonceur.outreaches}
            selection={selection}
            onBascule={bascule}
            desactive={gestesFermes}
          />
          <PreparationMessage
            nbAnnonces={selection.size}
            locale={locale}
            onLocale={setLocale}
            onPreparer={() => lancer(() => preparation.mutate({ listing_ids: [...selection].sort((a, b) => a - b), locale }))}
            desactive={gestesFermes}
            enCours={preparation.isPending}
          />
        </div>
      </div>

      {enPreparation.map((message) => (
        <ApercuMessage
          // Le texte de l'API est la clé : une retouche enregistrée remonte l'aperçu avec ce que l'API a rendu.
          key={`${message.id}:${message.salutation}:${message.summary}`}
          message={message}
          erreurIa={erreursIa[message.id] ?? null}
          desactive={gestesFermes}
          enRetouche={retouche.isPending}
          enEnvoi={envoi.isPending}
          onRetoucher={(changes) => lancer(() => retouche.mutate({ id: message.id, changes }))}
          onEnvoye={() => lancer(() => envoi.mutate(message.id))}
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
            sansReponseEnCours={issue.isPending}
            onDeposer={(fichiers) => deposer(message.id, fichiers)}
            onIssue={(demande) => trancher(message.id, demande)}
            onRelancer={() => relancer(message)}
            onSansReponse={() => classerSansReponse(message.id)}
          />
        ))}
      </section>

      <HistoriqueMessages messages={envoyes} />
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

  const fiche = useQuery<RadarAdvertiserResponse, ApiError>({
    queryKey: radarKeys.advertiser(id),
    queryFn: () => fetchRadarAdvertiser(id),
    enabled: autorise,
    staleTime: 10_000,
    // Une réponse se vérifie en file : la fiche se relit tant qu'une vérification tourne, puis s'arrête.
    refetchInterval: (requete) => (requete.state.data?.data.outreaches.some((m) => verificationEnCours(m.consents)) ? RADAR_POLL_MS : false),
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
        <FicheChargee key={annonceur.id} annonceur={annonceur} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
    </div>
  );
}
