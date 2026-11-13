'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Controller, useWatch, type Control } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Camera, FileText, FolderOpen, Upload } from 'lucide-react';

import { FormGlobalError, FormInput, FormSelect } from '@/components/forms';
import { FormDatePicker } from '@/components/forms/FormDatePicker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { FeuilleDuBas } from '@/components/ui/feuille-du-bas';
import { PanneauDroit } from '@/components/ui/panneau-droit';
import { useApiForm } from '@/hooks/useApiForm';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import type { CoffreDeDocuments, CoffreVu } from '@/lib/documents/coffre';
import { ciblesDeRangement, cibleParDefaut, piecesARenouveler, type CibleDeRangement } from '@/lib/documents/rangement';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { DOCUMENT_MAX_SIZE_BYTES, DOCUMENT_MIME_ACCEPT, useUploadDocument } from '@/lib/queries/documents';
import { documentUploadSchema, type DocumentUploadFormValues } from '@/lib/schemas/document';
import { cn } from '@/lib/utils';
import type { DocumentType } from '@/types/document';

import { DOCUMENT_TYPE_UPLOAD_ORDER } from '../../constants';
import { useLibellesDuCoffre } from '../libelles';
import { TuileDEntree } from '../LigneDuCoffre';

/**
 * TCK-2656 (lot 2) — l'ajout au coffre en deux temps (maquette `app-documents` a, « ajouter (photo ou
 * fichier) » et « nommer et ranger ») :
 *
 * - au téléphone (sous `md`) : la feuille « Prendre une photo » (`capture="environment"`) ou « Choisir un
 *   fichier », et les pièces « À renouveler » ; puis l'écran plein « Ajouter un document » (le
 *   formulaire plein écran de `PanneauDroit`) : le fichier, le nom, la catégorie, l'expiration,
 *   « Rangé dans », la précision ;
 * - dès `md` : la modale centrée de la maquette, d'un seul tenant, avec le dépôt par glisser.
 *
 * « Rangé dans » se choisit parmi les SEULES cibles que l'API rend (`attachable_targets`) : aucun champ
 * d'identifiant n'est rendu, l'identifiant voyage avec le dossier choisi.
 *
 * Écarts décidés : ni « Redressée et recadrée toute seule » ni « Lu sur la photo » (aucun redressement,
 * aucune lecture du texte) ; ni « Nous vous préviendrons 60 jours avant » (aucun rappel d'expiration
 * de document n'existe) ; ni le nom de l'agence (le coffre ne le rend pas). « Remplacer » et
 * l'interrupteur « Remplace … » mènent à la fiche de la pièce, qui porte les versions (décision L2 (a)).
 * Les pastilles de catégorie sont des valeurs de l'API : « Justificatif de revenus » n'en est pas une.
 */

/** Les pastilles de la maquette, en valeurs de l'API ; « Plus de catégories » ouvre la liste entière. */
const CATEGORIES_RAPIDES: readonly DocumentType[] = ['id_card', 'passport', 'insurance', 'other'];

export interface AjoutAuCoffreProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly coffre: CoffreDeDocuments;
  readonly vu: CoffreVu;
  readonly onAjoute?: () => void;
}

type Source = 'photo' | 'fichier';

export function AjoutAuCoffre({ open, onOpenChange, coffre, vu, onAjoute }: AjoutAuCoffreProps) {
  const t = useTranslations('documents.coffre.ajout');
  const tCommon = useTranslations('common');
  const bureau = useMatchesMedia('(min-width: 48rem)');
  const cibles = ciblesDeRangement(coffre);
  const parDefaut = cibleParDefaut(cibles);
  const upload = useUploadDocument();
  const [fichier, setFichier] = useState<File | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  // L'aperçu d'une image choisie : une URL `blob:`, rendue au changement de fichier, à la fermeture et au démontage.
  const [apercu, setApercu] = useState<string | null>(null);
  const apercuCourant = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (apercuCourant.current) URL.revokeObjectURL(apercuCourant.current);
    },
    [],
  );
  // Les entrées de fichier restent cachées : des BOUTONS les ouvrent, que le clavier atteint (un
  // `<label for>` ne prend pas le focus, et l'entrée cachée est hors de l'ordre de tabulation).
  const entreePhoto = useRef<HTMLInputElement>(null);
  const entreeFichier = useRef<HTMLInputElement>(null);
  const prendrePhoto = () => entreePhoto.current?.click();
  const choisirFichier = () => entreeFichier.current?.click();

  const valeursInitiales = (): DocumentUploadFormValues => ({
    name: '',
    type: 'other',
    documentable_type: parDefaut?.type ?? 'user',
    documentable_id: parDefaut?.id ?? 0,
    description: '',
    expiry_date: '',
  });

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<DocumentUploadFormValues, unknown>({
    schema: documentUploadSchema,
    defaultValues: valeursInitiales(),
    onSubmit: async (values) => {
      if (!fichier) throw new Error(t('sansFichier'));
      await upload.mutateAsync({
        file: fichier,
        name: values.name,
        type: values.type,
        documentable_type: values.documentable_type,
        documentable_id: values.documentable_id,
        description: values.description || undefined,
        expiry_date: values.expiry_date || undefined,
      });
      return undefined;
    },
    onSuccess: () => {
      fermer();
      onAjoute?.();
    },
  });

  function remplacerApercu(suivant: File | null) {
    if (apercuCourant.current) URL.revokeObjectURL(apercuCourant.current);
    apercuCourant.current =
      suivant?.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(suivant) : null;
    setApercu(apercuCourant.current);
  }

  function fermer() {
    remplacerApercu(null);
    setFichier(null);
    setSource(null);
    setErreurFichier(null);
    form.reset(valeursInitiales());
    onOpenChange(false);
  }

  function choisir(liste: FileList | null, depuis: Source) {
    const choisi = liste?.[0];
    if (!choisi) return;
    if (choisi.size > DOCUMENT_MAX_SIZE_BYTES) {
      setErreurFichier(t('tropLourd'));
      return;
    }
    setErreurFichier(null);
    remplacerApercu(choisi);
    setFichier(choisi);
    setSource(depuis);
    // Le nom d'une photo d'appareil (« IMG_2041 ») n'apprend rien : seul un fichier nommé préremplit.
    if (depuis === 'fichier' && !form.getValues('name')) form.setValue('name', choisi.name.replace(/\.[^.]+$/, ''));
  }

  const entrees = (
    <>
      <input
        ref={entreePhoto}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          choisir(e.target.files, 'photo');
          e.target.value = '';
        }}
      />
      <input
        ref={entreeFichier}
        type="file"
        accept={DOCUMENT_MIME_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          choisir(e.target.files, 'fichier');
          e.target.value = '';
        }}
      />
    </>
  );

  const erreur = erreurFichier ? (
    <p role="alert" className="text-ui text-destructive">
      {erreurFichier}
    </p>
  ) : null;

  const champs = (
    <ChampsDeLAjout
      control={form.control}
      cibles={cibles}
      onCible={(c) => {
        form.setValue('documentable_type', c.type);
        form.setValue('documentable_id', c.id);
      }}
    />
  );

  const envoyer = (
    <Button type="submit" form="ajout-au-coffre" className={cn(!bureau && 'text-corps')} disabled={isSubmitting || !fichier}>
      {isSubmitting ? t('envoi') : t('envoyer')}
    </Button>
  );

  const formulaire = (corps: ReactNode) => (
    <form
      id="ajout-au-coffre"
      noValidate
      onSubmit={(e) => {
        if (!fichier) {
          e.preventDefault();
          setErreurFichier(t('sansFichier'));
          return;
        }
        void handleSubmit(e);
      }}
      className="space-y-4"
    >
      <FormGlobalError>{globalError}</FormGlobalError>
      {corps}
    </form>
  );

  if (bureau) {
    return (
      <Dialog open={open} onOpenChange={(o) => (o ? undefined : fermer())}>
        {/* Posée à 16 pas du haut comme la maquette ; 16 de marge en bas aussi : l'en-tête et le pied restent
            visibles, le corps défile (un écran bas, « Changer » ouvert, « Plus de catégories » ouvert). */}
        <DialogContent className="top-[calc(var(--spacing)*16)] flex max-h-[calc(100dvh-var(--spacing)*32)] translate-y-0 flex-col gap-0 overflow-y-hidden p-0 sm:max-w-[calc(var(--spacing)*167)]">
          <div className="flex h-14 flex-none items-center border-b border-border pr-12 pl-5">
            <DialogTitle className="flex-1 truncate text-titre-court font-semibold">{t('titre')}</DialogTitle>
          </div>
          <div data-testid="corps-de-l-ajout" className="min-h-0 flex-1 overflow-y-auto p-5">
            {entrees}
            {formulaire(
              <>
                {fichier ? (
                  <LeFichier
                    fichier={fichier}
                    apercu={apercu}
                    action={
                      <button type="button" onClick={choisirFichier} className={LIEN}>
                        {t('changerDeFichier')}
                      </button>
                    }
                  />
                ) : (
                  <Depot onParcourir={choisirFichier} onDepot={(liste) => choisir(liste, 'fichier')} />
                )}
                {erreur}
                {champs}
              </>,
            )}
          </div>
          <div className="flex flex-none justify-end gap-2 border-t border-border px-5 py-3">
            <Button type="button" variant="outline" onClick={fermer}>
              {tCommon('actions.cancel')}
            </Button>
            {envoyer}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!fichier) {
    return (
      <FeuilleDuBas open={open} onOpenChange={(o) => (o ? undefined : fermer())} titre={t('titre')}>
        {entrees}
        <div className="grid grid-cols-2 gap-3">
          <TuileDAjout onClick={prendrePhoto} icone={<Camera className="size-5" strokeWidth={1.75} aria-hidden="true" />} titre={t('photo.titre')} texte={t('photo.texte')} fort />
          <TuileDAjout onClick={choisirFichier} icone={<Upload className="size-5" strokeWidth={1.75} aria-hidden="true" />} titre={t('fichier.titre')} texte={t('fichier.texte')} />
        </div>
        <div className="mt-3">{erreur}</div>
        <ARenouveler vu={vu} />
        {parDefaut ? <RangementParDefaut cible={parDefaut} /> : null}
      </FeuilleDuBas>
    );
  }

  return (
    <PanneauDroit
      open={open}
      formulaire
      onOpenChange={(o) => (o ? undefined : fermer())}
      titre={t('titre')}
      sousTitre={source === 'photo' ? t('etapePhoto') : t('etapeFichier')}
      pied={envoyer}
    >
      {entrees}
      {formulaire(
        <>
          <LeFichier
            fichier={fichier}
            apercu={apercu}
            action={
              <button type="button" onClick={source === 'photo' ? prendrePhoto : choisirFichier} className={cn(LIEN, 'inline-flex items-center gap-1.5')}>
                {source === 'photo' ? <Camera className="size-4" strokeWidth={1.75} aria-hidden="true" /> : null}
                {source === 'photo' ? t('reprendre') : t('changerDeFichier')}
              </button>
            }
          />
          {erreur}
          {champs}
        </>,
      )}
    </PanneauDroit>
  );
}

const LIEN = 'cursor-pointer rounded-md text-sm font-medium text-primary-deep outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring';

function TuileDAjout({
  onClick,
  icone,
  titre,
  texte,
  fort,
}: {
  readonly onClick: () => void;
  readonly icone: ReactNode;
  readonly titre: string;
  readonly texte: string;
  readonly fort?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-col items-start rounded-xl border p-3.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring',
        fort ? 'border-primary bg-secondary' : 'border-border bg-card',
      )}
    >
      <span className={cn('inline-flex size-10 items-center justify-center rounded-full', fort ? 'bg-primary text-primary-foreground' : 'bg-muted text-encre-douce')}>{icone}</span>
      <span className="mt-3 text-corps leading-tight font-semibold">{titre}</span>
      <span className="mt-1 text-ui leading-snug text-muted-foreground">{texte}</span>
    </button>
  );
}

function ARenouveler({ vu }: { readonly vu: CoffreVu }) {
  const t = useTranslations('documents.coffre');
  const libelles = useLibellesDuCoffre();
  const f = useFormatteurs();
  const pieces = piecesARenouveler(vu);
  if (pieces.length === 0) return null;
  return (
    <section aria-label={t('ajout.aRenouveler')} className="mt-5">
      <p className="text-ui font-medium text-muted-foreground">{t('ajout.aRenouveler')}</p>
      <ul className="mt-2 space-y-2">
        {pieces.map((vue) => {
          const e = vue.echeance;
          const quand =
            e?.etat === 'bientot'
              ? t('marques.expireDans', { jours: e.jours })
              : e?.etat === 'aujourdhui'
                ? t('marques.expireAujourdhui')
                : e?.etat === 'expiree'
                  ? t('marques.expireeLe', { date: f.jourMois(e.le) })
                  : null;
          return (
            <li key={vue.cle} className="flex items-center gap-3 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-3">
              <TuileDEntree vue={vue} className="bg-card" />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-corps font-medium">{libelles.entree(vue)}</span>
                <span className="mt-0.5 block text-ui font-semibold text-warning">{quand}</span>
              </span>
              {vue.geste.geste === 'ouvrir' ? (
                <Link href={`/app/documents/${vue.geste.documentId}`} className="inline-flex h-11 flex-none items-center rounded-md text-sm font-semibold text-primary-deep outline-none focus-visible:ring-3 focus-visible:ring-ring">
                  {t('alerte.remplacer')}
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RangementParDefaut({ cible }: { readonly cible: CibleDeRangement }) {
  const t = useTranslations('documents.coffre.ajout');
  const libelles = useLibellesDuCoffre();
  return <p className="mt-4 text-ui leading-snug text-muted-foreground">{t('rangeParDefaut', { dossier: libelles.dossier(cible.etiquette) })}</p>;
}

function LeFichier({ fichier, apercu, action }: { readonly fichier: File; readonly apercu: string | null; readonly action: ReactNode }) {
  const t = useTranslations('documents.coffre.ajout');
  const f = useFormatteurs();
  const extension = /\.([a-z0-9]+)$/i.exec(fichier.name)?.[1] ?? fichier.type.split('/')[1] ?? '';
  const mo = fichier.size / (1024 * 1024);
  const taille =
    mo >= 1
      ? t('tailleMo', { n: f.nombre(mo, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) })
      : t('tailleKo', { n: f.nombre(Math.max(1, Math.round(fichier.size / 1024))) });
  return (
    <div data-testid="fichier-choisi" className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 md:bg-background">
      <span className="inline-flex h-17 w-26 flex-none items-center justify-center overflow-hidden rounded-lg bg-secondary text-primary-deep">
        {apercu ? (
          // eslint-disable-next-line @next/next/no-img-element -- une URL `blob:` locale, que `next/image` n'optimise pas.
          <img src={apercu} alt="" className="size-full object-cover" />
        ) : (
          <FileText className="size-6" strokeWidth={1.5} aria-hidden="true" />
        )}
      </span>
      {/* Téléphone : l'action sous le nom ; dès `md` : à droite, comme la maquette. */}
      <span className="min-w-0 flex-1 md:flex md:items-center md:gap-3">
        <span className="block min-w-0 leading-tight md:flex-1">
          <span className="block truncate text-sm font-medium">{fichier.name}</span>
          <span className="mt-0.5 block text-ui text-muted-foreground">{t('taille', { format: extension.toUpperCase(), taille })}</span>
        </span>
        <span className="mt-1 block flex-none md:mt-0">{action}</span>
      </span>
    </div>
  );
}

function Depot({ onParcourir, onDepot }: { readonly onParcourir: () => void; readonly onDepot: (liste: FileList | null) => void }) {
  const t = useTranslations('documents.coffre.ajout');
  const [survol, setSurvol] = useState(false);
  return (
    <div
      data-testid="depot"
      onDragOver={(e) => {
        e.preventDefault();
        setSurvol(true);
      }}
      onDragLeave={() => setSurvol(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSurvol(false);
        onDepot(e.dataTransfer.files);
      }}
      className={cn('flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-9 text-center', survol ? 'border-primary bg-secondary' : 'border-border bg-background')}
    >
      <span className="inline-flex size-11 items-center justify-center rounded-full bg-secondary text-primary-deep">
        <Upload className="size-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className="mt-3 text-corps font-medium">{t('deposer')}</p>
      <p className="mt-1 text-ui text-muted-foreground">{t('fichier.texte')}</p>
      <Button type="button" variant="outline" onClick={onParcourir} className="mt-4">
        {t('parcourir')}
      </Button>
    </div>
  );
}

function ChampsDeLAjout({
  control,
  cibles,
  onCible,
}: {
  readonly control: Control<DocumentUploadFormValues>;
  readonly cibles: readonly CibleDeRangement[];
  readonly onCible: (cible: CibleDeRangement) => void;
}) {
  const t = useTranslations('documents.coffre.ajout');
  return (
    <>
      {/* Téléphone : nom, catégorie, expiration ; dès `md` : nom | expiration, puis la catégorie. */}
      <div className="grid gap-4 md:grid-cols-2">
        <FormInput<DocumentUploadFormValues> control={control} name="name" label={t('nom')} placeholder={t('nomExemple')} aria-required />
        <div className="md:order-last md:col-span-2">
          <ChoixDeCategorie control={control} />
        </div>
        <FormDatePicker<DocumentUploadFormValues> control={control} name="expiry_date" label={t('expire')} placeholder={t('facultatif')} />
      </div>
      <RangeDans control={control} cibles={cibles} onCible={onCible} />
      <FormInput<DocumentUploadFormValues> control={control} name="description" label={t('precision')} placeholder={t('precisionExemple')} />
    </>
  );
}

function ChoixDeCategorie({ control }: { readonly control: Control<DocumentUploadFormValues> }) {
  const t = useTranslations('documents.coffre.ajout');
  const tTypes = useTranslations('documents.types');
  const type = useWatch({ control, name: 'type' });
  const [plus, setPlus] = useState(() => !CATEGORIES_RAPIDES.includes(type));
  return (
    <Controller
      control={control}
      name="type"
      render={({ field }) => (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t('categorie')}</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES_RAPIDES.map((valeur) => (
              <button
                key={valeur}
                type="button"
                aria-pressed={field.value === valeur}
                onClick={() => field.onChange(valeur)}
                className={cn(
                  'inline-flex h-11 items-center rounded-lg border px-3.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring',
                  field.value === valeur ? 'border-primary bg-secondary text-primary-deep' : 'border-border bg-card',
                )}
              >
                {tTypes(valeur)}
              </button>
            ))}
            {plus ? null : (
              <button type="button" onClick={() => setPlus(true)} className={cn(LIEN, 'inline-flex h-11 items-center px-1')}>
                {t('plusDeCategories')}
              </button>
            )}
          </div>
          {plus ? (
            <FormSelect<DocumentUploadFormValues>
              control={control}
              name="type"
              label={t('plusDeCategories')}
              containerClassName="mt-3"
              options={DOCUMENT_TYPE_UPLOAD_ORDER.map((valeur) => ({ value: valeur, label: tTypes(valeur) }))}
            />
          ) : null}
        </fieldset>
      )}
    />
  );
}

function RangeDans({
  control,
  cibles,
  onCible,
}: {
  readonly control: Control<DocumentUploadFormValues>;
  readonly cibles: readonly CibleDeRangement[];
  readonly onCible: (cible: CibleDeRangement) => void;
}) {
  const t = useTranslations('documents.coffre.ajout');
  const libelles = useLibellesDuCoffre();
  const [type, id] = useWatch({ control, name: ['documentable_type', 'documentable_id'] });
  const [ouvert, setOuvert] = useState(false);
  const groupe = useId();
  const liste = useRef<HTMLDivElement>(null);
  const changer = useRef<HTMLButtonElement>(null);
  // Le focus se déplace AVANT qu'un élément disparaisse : à l'ouverture, sur le dossier coché (la ligne
  // « Changer » reste montée) ; à la fermeture par un choix, sur « Changer », puis la liste se replie.
  // Un élément focalisé qui disparaît laisse le gestionnaire de focus du panneau reprendre la main.
  const focusALaListe = useRef(false);
  useEffect(() => {
    if (!ouvert || !focusALaListe.current) return;
    focusALaListe.current = false;
    (liste.current?.querySelector<HTMLInputElement>('input:checked') ?? liste.current?.querySelector('input'))?.focus();
  }, [ouvert]);
  const ouvrir = () => {
    focusALaListe.current = true;
    setOuvert(true);
  };
  const replier = () => {
    changer.current?.focus();
    setOuvert(false);
  };
  const courante = cibles.find((c) => c.type === type && c.id === id) ?? null;
  const nom = (c: CibleDeRangement) => libelles.dossier(c.etiquette);
  const precision = (c: CibleDeRangement) =>
    c.precision?.cle === 'leBien'
      ? t('leBien')
      : c.precision?.cle === 'leBail'
        ? c.precision.reference
          ? t('leBailNumero', { reference: c.precision.reference })
          : t('leBail')
        : null;

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium" id={`${groupe}-titre`}>
        {t('rangeDans')}
      </p>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
        <FolderOpen className="size-5 flex-none text-primary" strokeWidth={1.5} aria-hidden="true" />
        <span className="min-w-0 flex-1 leading-tight">
          <span data-testid="range-dans" className="block truncate text-corps font-medium">
            {courante ? nom(courante) : null}
          </span>
          {courante && precision(courante) ? <span className="block truncate text-ui text-muted-foreground">{precision(courante)}</span> : null}
        </span>
        {cibles.length > 1 ? (
          <button
            ref={changer}
            type="button"
            onClick={() => (ouvert ? setOuvert(false) : ouvrir())}
            aria-expanded={ouvert}
            className={cn(LIEN, 'flex-none')}
            aria-label={t('changerLeDossier')}
          >
            {t('changer')}
          </button>
        ) : null}
      </div>
      {ouvert ? (
        <div
          ref={liste}
          role="radiogroup"
          aria-labelledby={`${groupe}-titre`}
          // Focalisable par script seulement : ce sont ses boutons radio qui prennent la tabulation.
          tabIndex={-1}
          // Les flèches changent le dossier sans refermer ; Entrée ou Échap valident et rendent « Changer ».
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            replier();
          }}
          onBlur={(e) => {
            // Vers « Changer », c'est lui qui replie (sinon le flou replierait, puis son clic rouvrirait).
            const vers = e.relatedTarget as Node | null;
            if (!e.currentTarget.contains(vers) && vers !== changer.current) setOuvert(false);
          }}
          className="mt-2 max-h-[calc(var(--spacing)*72)] divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card"
        >
          {cibles.map((c) => (
            <label key={c.cle} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2.5 has-focus-visible:ring-3 has-focus-visible:ring-ring">
              <input
                type="radio"
                name={groupe}
                value={c.cle}
                checked={courante?.cle === c.cle}
                onChange={() => onCible(c)}
                // Un clic de pointeur (detail ≥ 1) choisit et referme ; celui que les flèches synthétisent (0) non.
                onClick={(e) => {
                  if (e.detail > 0) replier();
                }}
                className="size-4 flex-none accent-primary"
              />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-corps font-medium">{nom(c)}</span>
                {precision(c) ? <span className="block truncate text-ui text-muted-foreground">{precision(c)}</span> : null}
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
