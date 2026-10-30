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
  fetchRadarAdvertiser,
  fetchRadarPublicationPreview,
  publishRadarAdvertiser,
  publishRadarAdvertiserUnderMandate,
  radarKeys,
  RADAR_POLL_MS,
  refetchRadarListingPhotos,
  uploadRadarListingPhotos,
} from '@/lib/queries/radar';
import {
  RADAR_PHOTOS_PAR_ENVOI_MAX,
  type RadarAdvertiserResponse,
  type RadarClaim,
  type RadarPublication as RadarPublicationResultat,
  type RadarPublicationPreviewResponse,
  type RadarPublicationResponse,
} from '@/types/radar';
import { codeDeLErreur } from '../fiche/useMessageEchecFiche';
import { BandeauPriseEnCharge } from '../annonceur/BandeauPriseEnCharge';
import { useGestesDePrise } from '../annonceur/useGestesDePrise';
import { useLibelleCodePublication, useMessageEchecAnnonceur } from '../annonceur/useMessageEchecAnnonceur';
import { usePriseEnCharge } from '../annonceur/usePriseEnCharge';
import { CartePublication } from './CartePublication';
import { CODES_SANS_SECOND_MESSAGE } from './codes-publication';
import { CompteACreer } from './CompteACreer';
import { DejaPubliees } from './DejaPubliees';
import { ConfirmerPublication } from './ConfirmerPublication';
import { PublierSousMandat } from './PublierSousMandat';
import {
  annoncesCochees,
  CODE_EN_COURS,
  depassePlafondDePhotos,
  estCochee,
  preparationEnCours,
  publicationFermee,
  rejouerSiEnCours,
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

/** Le refus qui dit que la prise n'est plus tenue : on la reprend sur place, puis on rejoue le geste. */
const PRISE_REQUISE = 'radar.advertiser.claim_required';

interface ApercuChargeProps {
  readonly id: number;
  readonly apercu: RadarPublicationPreviewResponse['data'];
  /** La prise en charge de l'annonceur, lue sur sa fiche : chaque geste de cet écran en exige une tenue par l'opérateur. */
  readonly claim: RadarClaim | null;
}

function ApercuCharge({ id, apercu, claim }: ApercuChargeProps) {
  const t = useTranslations('superAdmin.pages.radar.publication');
  const queryClient = useQueryClient();
  const messageEchec = useMessageEchecAnnonceur();
  const libelle = useLibelleCodePublication();
  const idempotence = useCleIdempotence();
  // TCK-2394 — la publication sous mandat est un autre geste : sa propre clé, pour qu'un réessai ne rejoue pas l'autre.
  const idempotenceMandat = useCleIdempotence();

  const [choix, setChoix] = useState<ChoixAnnonces>({});
  const [erreur, setErreur] = useState<unknown>(null);
  /** La confirmation ouverte : publier pour son compte, ou sous mandat Takussan (TCK-2394). */
  const [confirmation, setConfirmation] = useState<'compte' | 'mandat' | null>(null);
  const [erreurPublication, setErreurPublication] = useState<unknown>(null);
  const [resultat, setResultat] = useState<RadarPublicationResultat | null>(null);

  const relire = () => queryClient.invalidateQueries({ queryKey: radarKeys.publication(id) });
  // Un refus 409/422 dit que l'aperçu n'est plus ce que l'écran croit (accord révoqué, annonce changée d'étape) : il se relit.
  // Sauf `idempotency.in_progress` : l'envoi tourne encore, et relu, l'aperçu ne montrerait plus les biens qu'il vient de publier.
  const relireSurRefus = (e: unknown) => {
    if (codeDeLErreur(e) === CODE_EN_COURS) return;
    if (e instanceof ApiError && (e.status === 409 || e.status === 422)) void relire();
  };
  const surEchec = (e: unknown) => {
    setErreur(e);
    relireSurRefus(e);
  };

  // TCK-2389 — la prise en charge se tient sur cet écran comme sur la fiche (mêmes gestes, même renouvellement) : sans
  // elle, le dépôt, le retrait, la relance et « Publier » rendent tous 409 `radar.advertiser.claim_required`.
  const { prise, renouvellement, restitution } = useGestesDePrise(id, surEchec);
  usePriseEnCharge({ claim, renouveler: () => renouvellement.mutate() });
  const mienne = claim?.mine === true;
  const stoppe = apercu.advertiser.do_not_contact_at !== null;
  // TCK-2394 (ADR-0079) — publié sous mandat, sans compte : le second message ne promet aucune activation. TCK-2421 : repris
  // par l'annonceur, il ne l'est plus (la même règle que `RadarAdvertiser::underMandate()`).
  const sousMandat = apercu.advertiser.mandate_at !== null && apercu.advertiser.mandate_taken_back_at === null;
  // Ce que l'API refuse de composer en 422 pour l'environnement : le second message promet l'activation par SMS.
  const messageRefuse = !sousMandat && apercu.blocking.some((code) => CODES_SANS_SECOND_MESSAGE.has(code));
  /** Une prise expirée entre deux lectures : le refus se rattrape ici (on reprend, on rejoue) au lieu d'envoyer à la fiche. */
  const avecPrise = async <T,>(appel: () => Promise<T>): Promise<T> => {
    try {
      return await appel();
    } catch (e) {
      if (codeDeLErreur(e) !== PRISE_REQUISE) throw e;
      await prise.mutateAsync();
      return appel();
    }
  };

  const retrait = useMutation<void, ApiError, { annonce: number; media: number }>({
    mutationFn: ({ annonce, media }) => avecPrise(() => deleteRadarListingPhoto(annonce, media)),
    onSuccess: relire,
    onError: surEchec,
  });
  const depot = useMutation<void, ApiError, { annonce: number; fichiers: readonly File[] }>({
    mutationFn: async ({ annonce, fichiers }) => {
      for (const lot of parLots(fichiers, RADAR_PHOTOS_PAR_ENVOI_MAX)) await avecPrise(() => uploadRadarListingPhotos(annonce, lot));
    },
    // Un lot déjà rangé reste rangé même si le suivant échoue : l'aperçu se relit dans les deux cas.
    onSettled: relire,
    onError: surEchec,
  });
  const relance = useMutation<unknown, ApiError, number>({
    mutationFn: (annonce) => avecPrise(() => refetchRadarListingPhotos(annonce)),
    onSuccess: relire,
    onError: surEchec,
  });
  const publication = useMutation<RadarPublicationResponse, ApiError, readonly number[]>({
    // Une clé d'idempotence par ouverture de la confirmation : la même sur réessai (ADR-0072), renouvelée au succès
    // ou si la saisie a changé depuis un premier envoi arrivé (422 `idempotency.key_reused`).
    mutationFn: (ids) => avecPrise(() => rejouerSiEnCours(() => publishRadarAdvertiser(id, ids, idempotence.cle()))),
    onSuccess: (reponse) => {
      idempotence.apres({ ok: true });
      setConfirmation(null);
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
  const publicationMandat = useMutation<RadarPublicationResponse, ApiError, readonly number[]>({
    mutationFn: (ids) => avecPrise(() => rejouerSiEnCours(() => publishRadarAdvertiserUnderMandate(id, ids, idempotenceMandat.cle()))),
    onSuccess: (reponse) => {
      idempotenceMandat.apres({ ok: true });
      setConfirmation(null);
      setErreurPublication(null);
      setResultat(reponse.data);
      void queryClient.invalidateQueries({ queryKey: radarKeys.advertiser(id) });
      return relire();
    },
    onError: (e) => {
      idempotenceMandat.apres({ ok: false, code: codeDeLErreur(e) });
      setErreurPublication(e);
      relireSurRefus(e);
    },
  });

  const enCours = retrait.isPending || depot.isPending || relance.isPending || publication.isPending || publicationMandat.isPending
    || prise.isPending || restitution.isPending;
  // Sans prise à soi, ou sous STOP : on regarde, on ne touche à rien.
  const gestesFermes = enCours || !mienne || stoppe;

  if (resultat !== null) return <RecapitulatifPublication advertiserId={id} publication={resultat} />;

  const fermee = publicationFermee(apercu);
  // TCK-2394 — un blocage du compte (numéro inscrit, connexion par téléphone éteinte, déjà sous mandat) n'empêche pas de
  // cocher si le mandat reste ouvert : c'est précisément le cas où il sert.
  const mandatOuvert = apercu.mandate.enabled && apercu.mandate.blocking.length === 0;
  const cochageFerme = fermee && !mandatOuvert;
  const cochees = annoncesCochees(apercu.listings, choix);
  const resume = resumeDeLaPublication(apercu, choix);
  const nom = apercu.advertiser.display_name || null;
  // Le plafond de photos d'UNE publication : au-delà l'API refuse (422), l'écran ne laisse pas confirmer.
  const tropDePhotos = depassePlafondDePhotos(resume, apercu);

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
          <p className="font-medium">{mandatOuvert ? t('blocking.headingAccount') : t('blocking.heading')}</p>
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

      <BandeauPriseEnCharge
        claim={claim}
        prendreFerme={stoppe || enCours}
        rendreFerme={enCours || renouvellement.isPending}
        enPrise={prise.isPending}
        enRestitution={restitution.isPending}
        texteLibre={t('claimNone')}
        onPrendre={() => lancer(() => prise.mutate())}
        onRendre={() => lancer(() => restitution.mutate())}
      />

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
                desactive={gestesFermes || cochageFerme}
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
        <Button type="button" disabled={gestesFermes || fermee || cochees.length === 0 || tropDePhotos} onClick={() => { setErreurPublication(null); setConfirmation('compte'); }}>
          {t('publish', { count: cochees.length })}
        </Button>
        {cochees.length === 0 && !cochageFerme ? <p className="text-xs text-muted-foreground">{t('nothingChecked')}</p> : null}
        {tropDePhotos ? (
          <p className="text-xs text-destructive" data-testid="radar-publication-plafond">
            {t('overPhotoLimit', { count: resume.photos, max: apercu.max_photos })}
          </p>
        ) : null}
      </div>

      {apercu.mandate.enabled ? (
        <PublierSousMandat
          mandat={apercu.mandate}
          depuis={apercu.advertiser.mandate_at}
          reprisLe={apercu.advertiser.mandate_taken_back_at}
          nbCochees={cochees.length}
          desactive={gestesFermes || tropDePhotos}
          onPublier={() => { setErreurPublication(null); setConfirmation('mandat'); }}
        />
      ) : null}

      <ConfirmerPublication
        open={confirmation !== null}
        nom={nom}
        resume={resume}
        mandat={confirmation === 'mandat' ? (apercu.mandate.space?.name ?? '') : null}
        enCours={publication.isPending || publicationMandat.isPending}
        erreur={erreurPublication ? messageEchec(erreurPublication) : null}
        onAnnuler={() => setConfirmation(null)}
        onConfirmer={() => {
          const ids = cochees.map((annonce) => annonce.id);
          if (confirmation === 'mandat') publicationMandat.mutate(ids);
          else publication.mutate(ids);
        }}
      />

      {apercu.published.length > 0 ? (
        <DejaPubliees advertiserId={id} biens={apercu.published} stoppe={stoppe} messageRefuse={messageRefuse} sousMandat={sousMandat} />
      ) : null}
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

  // La prise en charge est portée par la fiche de l'annonceur : la même lecture que la sienne, donc le même cache.
  const fiche = useQuery<RadarAdvertiserResponse, ApiError>({
    queryKey: radarKeys.advertiser(id),
    queryFn: () => fetchRadarAdvertiser(id),
    enabled: autorise,
    staleTime: 10_000,
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
      {apercu.isError || fiche.isError ? (
        <ErrorState
          message={`${t('loadError')} ${messageErreur(apercu.isError ? apercu.error : fiche.error)}`}
          onRetry={() => void (apercu.isError ? apercu.refetch() : fiche.refetch())}
          retryLabel={tCommon('actions.retry')}
        />
      ) : donnees && fiche.data ? (
        <ApercuCharge id={id} apercu={donnees} claim={fiche.data.data.claim} />
      ) : (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
    </div>
  );
}
