'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { usePlatformAbilities } from '@/components/admin/super/PlatformAbilitiesProvider';
import { PageHeader } from '@/components/console';
import { ErrorState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCleIdempotence } from '@/hooks/useCleIdempotence';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { ApiError } from '@/lib/api';
import {
  deleteRadarListingPhoto,
  fetchRadarPublicationPreview,
  publishRadarAdvertiser,
  radarKeys,
  RADAR_POLL_MS,
  refetchRadarListingPhotos,
  uploadRadarListingPhotos,
} from '@/lib/queries/radar';
import {
  RADAR_PHOTOS_PAR_ENVOI_MAX,
  type RadarPublication as RadarPublicationResultat,
  type RadarPublicationPreviewResponse,
  type RadarPublicationResponse,
} from '@/types/radar';
import { codeDeLErreur } from '../fiche/useMessageEchecFiche';
import { useLibelleCodePublication, useMessageEchecAnnonceur } from '../annonceur/useMessageEchecAnnonceur';
import { CartePublication } from './CartePublication';
import { CompteACreer } from './CompteACreer';
import { ConfirmerPublication } from './ConfirmerPublication';
import {
  annoncesCochees,
  estCochee,
  preparationEnCours,
  publicationFermee,
  resumeDeLaPublication,
  type ChoixAnnonces,
} from './publication';
import { RecapitulatifPublication } from './RecapitulatifPublication';

interface RadarPublicationProps {
  readonly id: number;
}

/** Déposer plus de photos que l'API n'en accepte par envoi : elles partent en lots successifs. */
function parLots<T>(elements: readonly T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < elements.length; i += taille) lots.push(elements.slice(i, i + taille));
  return lots;
}

function ApercuCharge({ id, apercu }: { readonly id: number; readonly apercu: RadarPublicationPreviewResponse['data'] }) {
  const t = useTranslations('superAdmin.pages.radar.publication');
  const queryClient = useQueryClient();
  const messageEchec = useMessageEchecAnnonceur();
  const libelle = useLibelleCodePublication();
  const idempotence = useCleIdempotence();

  const [choix, setChoix] = useState<ChoixAnnonces>({});
  const [erreur, setErreur] = useState<unknown>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [erreurPublication, setErreurPublication] = useState<unknown>(null);
  const [resultat, setResultat] = useState<RadarPublicationResultat | null>(null);

  const relire = () => queryClient.invalidateQueries({ queryKey: radarKeys.publication(id) });
  // Un refus 409/422 dit que l'aperçu n'est plus ce que l'écran croit (accord révoqué, annonce changée d'étape) : il se relit.
  const relireSurRefus = (e: unknown) => {
    if (e instanceof ApiError && (e.status === 409 || e.status === 422)) void relire();
  };
  const surEchec = (e: unknown) => {
    setErreur(e);
    relireSurRefus(e);
  };

  const retrait = useMutation<void, ApiError, { annonce: number; media: number }>({
    mutationFn: ({ annonce, media }) => deleteRadarListingPhoto(annonce, media),
    onSuccess: relire,
    onError: surEchec,
  });
  const depot = useMutation<void, ApiError, { annonce: number; fichiers: readonly File[] }>({
    mutationFn: async ({ annonce, fichiers }) => {
      for (const lot of parLots(fichiers, RADAR_PHOTOS_PAR_ENVOI_MAX)) await uploadRadarListingPhotos(annonce, lot);
    },
    // Un lot déjà rangé reste rangé même si le suivant échoue : l'aperçu se relit dans les deux cas.
    onSettled: relire,
    onError: surEchec,
  });
  const relance = useMutation<unknown, ApiError, number>({
    mutationFn: (annonce) => refetchRadarListingPhotos(annonce),
    onSuccess: relire,
    onError: surEchec,
  });
  const publication = useMutation<RadarPublicationResponse, ApiError, readonly number[]>({
    // Une clé d'idempotence par ouverture de la confirmation : la même sur réessai (ADR-0072), renouvelée au succès
    // ou si la saisie a changé depuis un premier envoi arrivé (422 `idempotency.key_reused`).
    mutationFn: (ids) => publishRadarAdvertiser(id, ids, idempotence.cle()),
    onSuccess: (reponse) => {
      idempotence.apres({ ok: true });
      setConfirmation(false);
      setErreurPublication(null);
      setResultat(reponse.data);
      void queryClient.invalidateQueries({ queryKey: radarKeys.advertiser(id) });
      return relire();
    },
    onError: (e) => {
      idempotence.apres({ ok: false, code: codeDeLErreur(e) });
      setErreurPublication(e);
      relireSurRefus(e);
    },
  });

  const enCours = retrait.isPending || depot.isPending || relance.isPending || publication.isPending;

  if (resultat !== null) return <RecapitulatifPublication advertiserId={id} publication={resultat} />;

  const fermee = publicationFermee(apercu);
  const cochees = annoncesCochees(apercu.listings, choix);
  const resume = resumeDeLaPublication(apercu, choix);
  const nom = apercu.advertiser.display_name || null;

  const lancer = (geste: () => void) => {
    setErreur(null);
    geste();
  };
  const bascule = (annonceId: number) => {
    const annonce = apercu.listings.find((a) => a.id === annonceId);
    if (!annonce) return;
    setChoix((courant) => ({ ...courant, [annonceId]: !estCochee(annonce, courant) }));
  };

  return (
    <div className="space-y-6" data-testid="radar-publication">
      <p className="text-sm text-muted-foreground">{t('intro')}</p>

      {apercu.blocking.length > 0 ? (
        <div role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive" data-testid="radar-publication-blocage">
          <p className="font-medium">{t('blocking.heading')}</p>
          <ul className="list-inside list-disc">
            {apercu.blocking.map((code) => <li key={code}>{libelle(code)}</li>)}
          </ul>
        </div>
      ) : null}

      {erreur ? (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" data-testid="radar-publication-erreur">
          {messageEchec(erreur)}
        </p>
      ) : null}

      <CompteACreer nom={nom} compte={apercu.account} />

      <section aria-label={t('listings.heading')} className="space-y-3" data-testid="radar-publication-annonces">
        <h2 className="font-display text-base font-semibold text-foreground">{t('listings.heading')}</h2>
        {apercu.listings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('listings.none')}</p>
        ) : (
          <ul className="space-y-3">
            {apercu.listings.map((annonce) => (
              <CartePublication
                key={annonce.id}
                annonce={annonce}
                cochee={estCochee(annonce, choix)}
                desactive={enCours || fermee}
                onBascule={() => bascule(annonce.id)}
                onRetirerPhoto={(media) => lancer(() => retrait.mutate({ annonce: annonce.id, media }))}
                onDeposerPhotos={(fichiers) => lancer(() => depot.mutate({ annonce: annonce.id, fichiers }))}
                onRecupererPhotos={() => lancer(() => relance.mutate(annonce.id))}
              />
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="button" disabled={enCours || fermee || cochees.length === 0} onClick={() => { setErreurPublication(null); setConfirmation(true); }}>
          {t('publish', { count: cochees.length })}
        </Button>
        {cochees.length === 0 && !fermee ? <p className="text-xs text-muted-foreground">{t('nothingChecked')}</p> : null}
      </div>

      <ConfirmerPublication
        open={confirmation}
        nom={nom}
        resume={resume}
        enCours={publication.isPending}
        erreur={erreurPublication ? messageEchec(erreurPublication) : null}
        onAnnuler={() => setConfirmation(false)}
        onConfirmer={() => publication.mutate(cochees.map((annonce) => annonce.id))}
      />
    </div>
  );
}

/**
 * TCK-2389 (ADR-0077 §6) — « Publier pour lui » : l'écran de vérification de ce qui sera créé au nom de l'annonceur, la
 * confirmation explicite, puis le récapitulatif avec les liens publics et le second message. Geste
 * `platform.radar.publish` (`super_admin`) : sans lui, l'écran ne s'ouvre pas — l'API refuserait de toute façon (403).
 */
export function RadarPublication({ id }: RadarPublicationProps) {
  const t = useTranslations('superAdmin.pages.radar.publication');
  const tCommon = useTranslations('common');
  const { can } = usePlatformAbilities();
  const messageErreur = useMessageErreurApi();
  const autorise = can('platform.radar.publish');

  const apercu = useQuery<RadarPublicationPreviewResponse, ApiError>({
    queryKey: radarKeys.publication(id),
    queryFn: () => fetchRadarPublicationPreview(id),
    enabled: autorise,
    staleTime: 10_000,
    // La préparation des photos tourne en file : l'aperçu se relit tant qu'elle n'est pas finie, puis s'arrête.
    refetchInterval: (requete) => (preparationEnCours(requete.state.data?.data) ? RADAR_POLL_MS : false),
  });

  const retour = (
    <Link
      href={`/super-admin/radar/advertisers/${id}`}
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
        <PageHeader title={t('titleUnnamed', { id })} />
        <ErrorState message={t('forbidden')} />
      </div>
    );
  }

  const donnees = apercu.data?.data;

  return (
    <div className="space-y-6">
      {retour}
      <PageHeader title={donnees?.advertiser.display_name ? t('title', { name: donnees.advertiser.display_name }) : t('titleUnnamed', { id })} />
      {apercu.isError ? (
        <ErrorState
          message={`${t('loadError')} ${messageErreur(apercu.error)}`}
          onRetry={() => void apercu.refetch()}
          retryLabel={tCommon('actions.retry')}
        />
      ) : donnees ? (
        <ApercuCharge id={id} apercu={donnees} />
      ) : (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
    </div>
  );
}
