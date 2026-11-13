'use client';

import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bug, Camera, Check, Clock, DoorOpen, Droplets, Home, Plus, TriangleAlert, WashingMachine, Wrench, X, Zap } from 'lucide-react';

import { EmptyState, ErrorState } from '@/components/feedback';
import { FormGlobalError } from '@/components/forms';
import { BarreDAction } from '@/components/ui/barre-d-action';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { messageErreurApi } from '@/lib/api';
import { PHOTOS_PAR_SELECTION_MAX } from '@/lib/borne-du-corps';
import {
  TUILES_DU_LOCATAIRE,
  ajouterPhotos,
  corpsDuSignalement,
  type TuileDuLocataire,
  type Urgence,
} from '@/lib/maintenance/signalement';
import { useAllOngoingLeases, type LeaseWithRelations } from '@/lib/queries/leases';
import { useUploadMaintenancePhotos } from '@/lib/queries/maintenance';
import { useSignalerUnProbleme } from '@/lib/queries/maintenance-signalement';
import { reduirePhotos } from '@/lib/reduire-photo';
import { cn } from '@/lib/utils';

/**
 * TCK-2654 — « Signaler un problème », côté LOCATAIRE : photo d'abord, deux réponses, un envoi.
 *
 * Maquette retenue : `app-interventions` a, écrans « Locataire — signaler » (téléphone : barre collante
 * « Envoyer à l'agence » ; bureau : carte centrée de 640 px, pied « Annuler / Envoyer »).
 *
 *  · Le LOGEMENT est rappelé en tête. Un seul bail en cours : il est retenu sans question. Plusieurs :
 *    « Quel logement ? » d'abord, puis le formulaire, dont la bannière porte « Changer » (un bouton, pas
 *    un champ : l'entrée photo reste le premier champ du formulaire, AC1).
 *  · L'entrée photo porte `capture="environment"` : le téléphone ouvre l'appareil. La tuile « + » ouvre
 *    la galerie (plusieurs photos). Les photos S'AJOUTENT, 20 au plus (`PHOTOS_PAR_SELECTION_MAX`) ;
 *    chacune se retire de sa vignette.
 *  · Les six tuiles « C'est quoi ? » se projettent sur l'énumération de l'API (`TUILES_DU_LOCATAIRE`), et
 *    le titre de la demande s'en déduit dans la langue de l'écran. « C'est urgent ? » : `urgent` ou
 *    `normal`. « En deux mots » est la description, absente quand rien n'est écrit (TCK-2652).
 *  · Envoyée, la demande mène à « Demande envoyée » (`/app/maintenance/{id}/envoyee`). Les photos partent
 *    une à une, réduites (TCK-2370, TCK-542) ; un échec laisse la demande créée et le dit, persistant.
 *
 * Hors périmètre (ticket) : la note vocale de la maquette (« Message vocal », son aide).
 */

const TYPES_ACCEPTES = 'image/jpeg,image/png,image/webp';

type Icone = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' }>;

const ICONES: Record<TuileDuLocataire, Icone> = {
  plumbing: Droplets,
  electrical: Zap,
  locksmith: DoorOpen,
  pest_control: Bug,
  appliance: WashingMachine,
  other: Wrench,
};

interface Logement {
  readonly propertyId: number;
  readonly leaseId: number;
  readonly libelle: string;
}

interface SignalementDuLocataireProps {
  /** `?property=` de l'URL : retenu s'il désigne un des logements du locataire. */
  readonly initialPropertyId?: number | null;
}

export function SignalementDuLocataire({ initialPropertyId = null }: SignalementDuLocataireProps) {
  const t = useTranslations('maintenance.locataire.signaler');
  const tLanceur = useTranslations('maintenance.launcher');
  const tCommon = useTranslations('common');
  const baux = useAllOngoingLeases();
  const [choisi, setChoisi] = useState<number | null>(initialPropertyId);
  const [choisir, setChoisir] = useState(false);

  if (baux.isLoading) return <Skeleton className="h-32 rounded-xl" />;
  if (baux.isError) {
    return <ErrorState message={tLanceur('error')} onRetry={() => void baux.refetch()} retryLabel={tCommon('actions.retry')} />;
  }

  // Un logement par bien : le bail le plus récent (`-created_at`), comme le lanceur du personnel (TCK-1745).
  const vus = new Set<number>();
  const logements: Logement[] = [];
  for (const bail of (baux.data?.data ?? []) as LeaseWithRelations[]) {
    const id = bail.property?.id;
    if (!id || vus.has(id)) continue;
    vus.add(id);
    logements.push({ propertyId: id, leaseId: bail.id, libelle: bail.property?.title ?? tLanceur('property_fallback', { id }) });
  }

  if (logements.length === 0) {
    return (
      <EmptyState
        icon={<Wrench className="size-8" aria-hidden="true" />}
        title={tLanceur('empty_title')}
        description={tLanceur('empty_description')}
      />
    );
  }

  const logement = logements.length === 1 ? logements[0] : (logements.find((l) => l.propertyId === choisi) ?? null);

  if (logement === null || choisir) {
    return (
      <CarteDuSignalement>
        <fieldset className="space-y-3">
          <legend className="contents">
            <Question>{t('quelLogement')}</Question>
          </legend>
          <div className="space-y-2">
            {logements.map((l) => (
              <button
                key={l.propertyId}
                type="button"
                onClick={() => {
                  setChoisi(l.propertyId);
                  setChoisir(false);
                }}
                className={cn(
                  'flex min-h-16 w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left text-corps font-medium',
                  l.propertyId === logement?.propertyId ? 'border-primary bg-secondary' : 'border-border bg-card hover:bg-muted',
                )}
              >
                <Home className="size-icone flex-none text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{l.libelle}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </CarteDuSignalement>
    );
  }

  return (
    <FormulaireDuLocataire
      key={logement.propertyId}
      logement={logement}
      onChanger={logements.length > 1 ? () => setChoisir(true) : undefined}
    />
  );
}

/** Au bureau, la carte centrée de 640 px de la maquette ; au téléphone, l'écran lui-même. */
function CarteDuSignalement({ children }: { readonly children: ReactNode }) {
  return (
    <div className="max-md:px-4 max-md:pt-4 max-md:pb-8 md:flex md:justify-center md:pb-16">
      <div className="md:w-[40rem] md:max-w-full md:rounded-2xl md:border md:border-border md:bg-card md:p-8">{children}</div>
    </div>
  );
}

function Question({ children, aide }: { readonly children: ReactNode; readonly aide?: string }) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="font-display text-lg font-semibold tracking-titre text-foreground">{children}</span>
      {aide ? <span className="text-xs text-muted-foreground">{aide}</span> : null}
    </span>
  );
}

interface PhotoChoisie {
  readonly fichier: File;
  readonly url: string;
}

function FormulaireDuLocataire({ logement, onChanger }: { readonly logement: Logement; readonly onChanger?: () => void }) {
  const t = useTranslations('maintenance.locataire.signaler');
  const tForm = useTranslations('maintenance.form');
  const tCommon = useTranslations('common');
  const tRacine = useTranslations();
  const router = useRouter();
  const toast = useToast();
  const signaler = useSignalerUnProbleme();
  const envoyerPhotos = useUploadMaintenancePhotos();
  const id = useId();
  const formulaire = `${id}-signalement`;

  const [photos, setPhotos] = useState<readonly PhotoChoisie[]>([]);
  const [refusees, setRefusees] = useState(0);
  const [categorie, setCategorie] = useState<TuileDuLocataire | null>(null);
  const [categorieManquante, setCategorieManquante] = useState(false);
  const [urgence, setUrgence] = useState<Urgence | null>(null);
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const premiereTuile = useRef<HTMLInputElement | null>(null);

  // Les URL des vignettes se libèrent au démontage (celles retirées, au retrait).
  const photosCourantes = useRef(photos);
  useEffect(() => {
    photosCourantes.current = photos;
  }, [photos]);
  useEffect(() => () => photosCourantes.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const ajouter = (fichiers: FileList | null) => {
    const nouvelles = Array.from(fichiers ?? []);
    if (nouvelles.length === 0) return;
    const { photos: retenues, refusees: enTrop } = ajouterPhotos(photos.map((p) => p.fichier), nouvelles, PHOTOS_PAR_SELECTION_MAX);
    const ajoutees = retenues.slice(photos.length).map((fichier) => ({ fichier, url: URL.createObjectURL(fichier) }));
    setPhotos([...photos, ...ajoutees]);
    setRefusees(enTrop);
  };

  const retirer = (index: number) => {
    const photo = photos[index];
    if (photo) URL.revokeObjectURL(photo.url);
    setPhotos(photos.filter((_, i) => i !== index));
    setRefusees(0);
  };

  const envoyer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (enCours) return;
    if (categorie === null) {
      setCategorieManquante(true);
      premiereTuile.current?.focus();
      return;
    }
    setErreur(null);
    setEnCours(true);
    try {
      const reponse = await signaler.mutateAsync(
        corpsDuSignalement({
          propertyId: logement.propertyId,
          leaseId: logement.leaseId,
          categorie,
          urgence,
          texte,
          titre: t(`titres.${categorie}`),
        }),
      );
      const demande = reponse.data.id;
      if (photos.length > 0) {
        try {
          for (const photo of await reduirePhotos(photos.map((p) => p.fichier))) {
            await envoyerPhotos.mutateAsync({ id: demande, files: [photo], collection: 'photos' });
          }
        } catch {
          // La demande est créée : un second envoi la doublerait. L'avertissement persiste (TCK-2146).
          toast.add({ title: tForm('photos_failed_title'), description: tForm('photos_failed_body'), type: 'warning', timeout: 0 });
        }
      }
      router.push(`/app/maintenance/${demande}/envoyee`);
    } catch (err) {
      setErreur(messageErreurApi(err, tRacine, t('erreur')));
      setEnCours(false);
    }
  };

  const libelleEnvoyer = enCours ? t('envoi') : t('envoyer');

  return (
    <CarteDuSignalement>
      <form id={formulaire} onSubmit={(e) => void envoyer(e)} noValidate className="space-y-6" data-slot="signalement-du-locataire">
        <FormGlobalError className="mb-0">{erreur}</FormGlobalError>

        {/* L'entrée photo est le PREMIER champ du formulaire (AC1) : la bannière qui la précède n'en porte aucun. */}
        <div className="flex items-center gap-2.5 rounded-xl bg-muted px-3.5 py-3 text-corps">
          <Home className="size-icone flex-none text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-xs text-muted-foreground">{t('logement')}</span>
            <span className="block truncate font-medium text-foreground">{logement.libelle}</span>
          </span>
          {onChanger ? (
            <Button type="button" variant="ghost" size="sm" onClick={onChanger}>
              {t('changer')}
            </Button>
          ) : null}
        </div>

        <div>
          <label
            className={cn(
              'flex h-[4.5rem] cursor-pointer items-center justify-center gap-3 rounded-2xl bg-primary text-titre-court font-semibold text-primary-foreground',
              'has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring has-[input:focus-visible]:ring-offset-2',
            )}
          >
            <input
              type="file"
              accept={TYPES_ACCEPTES}
              capture="environment"
              className="sr-only"
              data-slot="photo-appareil"
              onChange={(e) => {
                ajouter(e.target.files);
                e.target.value = '';
              }}
            />
            <Camera className="size-6" strokeWidth={1.75} aria-hidden="true" />
            {t('prendrePhoto')}
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {photos.map((p, i) => (
              <span key={p.url} className="relative size-[4.5rem] flex-none overflow-hidden rounded-xl bg-muted">
                {/* Vignette locale (URL `blob:`) : `next/image` n'apporte rien à un fichier pas encore envoyé. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  onClick={() => retirer(i)}
                  aria-label={t('retirerPhoto', { numero: i + 1 })}
                  className="absolute right-1 top-1 inline-flex size-6 items-center justify-center rounded-full bg-card text-foreground"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
            {photos.length < PHOTOS_PAR_SELECTION_MAX ? (
              <label
                aria-label={t('galerie')}
                className="inline-flex size-[4.5rem] flex-none cursor-pointer items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring"
              >
                <input
                  type="file"
                  accept={TYPES_ACCEPTES}
                  multiple
                  className="sr-only"
                  data-slot="photo-galerie"
                  onChange={(e) => {
                    ajouter(e.target.files);
                    e.target.value = '';
                  }}
                />
                <Plus className="size-5" aria-hidden="true" />
              </label>
            ) : null}
            <span className="pl-1 text-xs leading-snug text-muted-foreground" aria-live="polite">
              {t('compte', { count: photos.length, max: PHOTOS_PAR_SELECTION_MAX })}
              <br />
              {t('ouGalerie')}
            </span>
          </div>
          {refusees > 0 ? (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {t('tropDePhotos', { count: refusees, max: PHOTOS_PAR_SELECTION_MAX })}
            </p>
          ) : null}
        </div>

        <fieldset aria-describedby={categorieManquante ? `${id}-quoi-erreur` : undefined}>
          <legend className="contents">
            <Question>{t('quoi')}</Question>
          </legend>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {TUILES_DU_LOCATAIRE.map((c, i) => {
              const I = ICONES[c];
              const retenue = categorie === c;
              return (
                <label
                  key={c}
                  className={cn(
                    'flex h-[5.25rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border text-center text-ui font-medium has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring',
                    retenue ? 'border-primary bg-secondary text-primary-deep' : 'border-border bg-card text-foreground',
                  )}
                >
                  <input
                    ref={i === 0 ? premiereTuile : undefined}
                    type="radio"
                    name={`${id}-categorie`}
                    value={c}
                    checked={retenue}
                    onChange={() => {
                      setCategorie(c);
                      setCategorieManquante(false);
                    }}
                    className="sr-only"
                  />
                  <I className={cn('size-6', retenue ? 'text-primary' : 'text-muted-foreground')} strokeWidth={1.5} aria-hidden="true" />
                  {t(`tuiles.${c}`)}
                </label>
              );
            })}
          </div>
          {categorieManquante ? (
            <p id={`${id}-quoi-erreur`} role="alert" className="mt-2 text-xs text-destructive">
              {t('choisirQuoi')}
            </p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="contents">
            <Question>{t('urgent')}</Question>
          </legend>
          <div className="mt-3 space-y-2">
            <TuileDUrgence
              nom={`${id}-urgence`}
              valeur="urgent"
              retenue={urgence === 'urgent'}
              onChoisir={setUrgence}
              icone={TriangleAlert}
              titre={t('urgentOui')}
              aide={t('urgentOuiAide')}
            />
            <TuileDUrgence
              nom={`${id}-urgence`}
              valeur="attendre"
              retenue={urgence === 'attendre'}
              onChoisir={setUrgence}
              icone={Clock}
              titre={t('urgentNon')}
              aide={t('urgentNonAide')}
            />
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${id}-texte`} className="block">
            <Question aide={t('facultatif')}>{t('deuxMots')}</Question>
          </label>
          <Input
            id={`${id}-texte`}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={t('deuxMotsExemple')}
            maxLength={2000}
            className="mt-3 rounded-xl px-3.5 text-corps"
          />
        </div>

        {/* Bureau : le pied de la carte. Le téléphone a la barre collante, ci-dessous. */}
        <div className="hidden justify-end gap-2 border-t border-border pt-5 md:mt-8 md:flex">
          <Link href="/app/maintenance" className={buttonVariants({ variant: 'outline', size: 'xl' })}>
            {tCommon('actions.cancel')}
          </Link>
          <Button type="submit" size="xl" disabled={enCours}>
            {libelleEnvoyer}
          </Button>
        </div>
      </form>

      {/* Rendue en portail, hors du `<form>` : le bouton le nomme (`form`). */}
      <BarreDAction taille="action">
        <Button type="submit" form={formulaire} size="xl" className="w-full" disabled={enCours}>
          {libelleEnvoyer}
        </Button>
      </BarreDAction>
    </CarteDuSignalement>
  );
}

function TuileDUrgence({
  nom,
  valeur,
  retenue,
  onChoisir,
  icone: I,
  titre,
  aide,
}: {
  readonly nom: string;
  readonly valeur: Urgence;
  readonly retenue: boolean;
  readonly onChoisir: (u: Urgence) => void;
  readonly icone: Icone;
  readonly titre: string;
  readonly aide: string;
}) {
  return (
    <label
      className={cn(
        'flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring',
        retenue ? 'border-primary bg-secondary' : 'border-border bg-card',
      )}
    >
      <input type="radio" name={nom} value={valeur} checked={retenue} onChange={() => onChoisir(valeur)} className="sr-only" />
      <I className={cn('size-6 flex-none', retenue ? 'text-primary' : 'text-muted-foreground')} strokeWidth={1.5} aria-hidden="true" />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block text-corps font-semibold text-foreground">{titre}</span>
        {/* Maquette : l'encre principale à 70 % sur la tuile retenue, rendue par l'encre opaque `encre-douce` (précédent TCK-2685) ; `muted` sinon. */}
        <span className={cn('block text-ui', retenue ? 'text-encre-douce' : 'text-muted-foreground')}>{aide}</span>
      </span>
      {retenue ? (
        <span className="inline-flex size-5 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3.5" aria-hidden="true" />
        </span>
      ) : null}
    </label>
  );
}
