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
import { Switch } from '@/components/ui/switch';
import { useApiForm } from '@/hooks/useApiForm';
import { useMatchesMedia } from '@/hooks/useMatchesMedia';
import type { CoffreDeDocuments, CoffreVu } from '@/lib/documents/coffre';
import { ciblesDeRangement, cibleParDefaut, pieceARemplacer, piecesARenouveler, type CibleDeRangement } from '@/lib/documents/rangement';
import { CADRE_ENTIER, recadrerLaPhoto, type Cadre } from '@/lib/documents/recadrage';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { DOCUMENT_MAX_SIZE_BYTES, DOCUMENT_MIME_ACCEPT, useUploadDocument, useUploadDocumentVersion } from '@/lib/queries/documents';
import { CLE_DE_LA_PROMESSE, rappelAVenir } from '@/lib/documents/rappel-d-expiration';
import { lireLaDateDExpiration, PIECES_A_MRZ } from '@/lib/documents/lecture-mrz/moteur';
import { jourADakar } from '@/lib/visites/par-le-temps';
import { documentUploadSchema, type DocumentUploadFormValues } from '@/lib/schemas/document';
import { cn } from '@/lib/utils';
import type { DocumentType } from '@/types/document';

import { DOCUMENT_TYPE_UPLOAD_ORDER } from '../../constants';
import { useLibellesDuCoffre } from '../libelles';
import { TuileDEntree } from '../LigneDuCoffre';
import { Recadrage } from './Recadrage';

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
 * TCK-2899 — « Lu sur la photo » : la photo d'une carte d'identité ou d'un passeport est lue DANS le
 * navigateur (bande MRZ, `lib/documents/lecture-mrz`) pendant qu'on nomme le document ; une date validée
 * par les clés de contrôle pré-remplit « Expire le », qui reste modifiable. Rien lu : rien ne s'affiche.
 *
 * TCK-2898 — « Redressée et recadrée » : une image choisie (photo ou fichier) passe par l'étape
 * {@link Recadrage} — quarts de tour, coins du cadre —, et c'est l'image recadrée qui part (JPEG, mêmes
 * bornes de taille). Une image que le navigateur ne décode pas (HEIC hors Safari…) part telle quelle.
 *
 * TCK-2898 — « Remplace la carte qui expire » (renverse la décision L2-1 (a)) : quand une pièce de la
 * catégorie choisie est « À renouveler » ({@link pieceARemplacer}), l'interrupteur, activé par défaut,
 * envoie le fichier en NOUVELLE VERSION de cette pièce (`POST /api/documents/{id}/versions`, l'échéance
 * et la précision avec lui) ; désactivé, un document neuf, comme avant. Le nom, la catégorie et
 * « Rangé dans » ne s'appliquent pas à une version : la pièce garde les siens.
 *
 * Écarts décidés : ni « toute seule » (le recadrage se règle à la main) ; ni le nom de l'agence (le
 * coffre ne le rend pas). Les pastilles de catégorie sont des valeurs de l'API : « Justificatif de
 * revenus » n'en est pas une.
 */

/** Les pastilles de la maquette, en valeurs de l'API ; « Plus de catégories » ouvre la liste entière. */
const CATEGORIES_RAPIDES: readonly DocumentType[] = ['id_card', 'passport', 'insurance', 'other'];

/**
 * TCK-2910 — un dépôt au rangement IMPOSÉ : la carte « Documents » de la fiche d'un bailleur dépose sur
 * son profil (`owner_profile:{id}`, TCK-2909). Même parcours (photo ou fichier, nommer et ranger), sans
 * dossier à choisir ni « À renouveler » (qui lisent le coffre de l'appelant), et sans les pièces KYC
 * que l'API refuse sur un profil (422 `document.profile_piece_by_kyc`).
 */
export interface RangementImpose {
  readonly type: 'owner_profile';
  readonly id: number;
  /** Le nom du dossier, tel que la fiche le dit (« Mouhamed Sène »). */
  readonly nom: string;
  /** Les pastilles de catégorie ; « Plus de catégories » offre le reste, pièces KYC exclues. */
  readonly categories: readonly DocumentUploadFormValues['type'][];
  /** La catégorie cochée à l'ouverture. */
  readonly categorie: DocumentUploadFormValues['type'];
}

/** TCK-2910 — les pièces KYC qu'un dépôt sur un profil ne prend pas (`Document::PIECE_TYPES` de l'API). */
const PIECES_KYC: readonly DocumentType[] = ['id_card', 'rib', 'ninea'];

type SourceDuRangement =
  | { readonly coffre: CoffreDeDocuments; readonly vu: CoffreVu; readonly impose?: undefined }
  | { readonly impose: RangementImpose; readonly coffre?: undefined; readonly vu?: undefined };

export type AjoutAuCoffreProps = SourceDuRangement & {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onAjoute?: () => void;
};

type Source = 'photo' | 'fichier';

export function AjoutAuCoffre({ open, onOpenChange, coffre, vu, impose, onAjoute }: AjoutAuCoffreProps) {
  const t = useTranslations('documents.coffre.ajout');
  const tCommon = useTranslations('common');
  const bureau = useMatchesMedia('(min-width: 48rem)');
  const cibles = coffre ? ciblesDeRangement(coffre) : [];
  const parDefaut = cibleParDefaut(cibles);
  const upload = useUploadDocument();
  const version = useUploadDocumentVersion();
  const libelles = useLibellesDuCoffre();
  const [fichier, setFichier] = useState<File | null>(null);
  // TCK-2898 — l'image d'origine en cours de recadrage, ses dimensions et le réglage.
  const [aRecadrer, setARecadrer] = useState<{
    readonly fichier: File;
    readonly source: Source;
    readonly naturel: { readonly largeur: number; readonly hauteur: number };
  } | null>(null);
  const [apercuARecadrer, setApercuARecadrer] = useState<string | null>(null);
  const [quarts, setQuarts] = useState(0);
  const [cadre, setCadre] = useState<Cadre>(CADRE_ENTIER);
  const [recadrageEnCours, setRecadrageEnCours] = useState(false);
  const [recadree, setRecadree] = useState(false);
  const decodage = useRef(0);
  // TCK-2898 — « Remplace … qui expire », activé par défaut ; la pièce visée, lue à l'envoi.
  const [remplace, setRemplace] = useState(true);
  const versionDe = useRef<number | null>(null);
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
  // TCK-2899 — la date lue sur la photo ; l'aide « Lu sur la photo. » ne vaut que tant que le champ la porte.
  const [dateLue, setDateLue] = useState<string | null>(null);
  const choisirFichier = () => entreeFichier.current?.click();

  const valeursInitiales = (): DocumentUploadFormValues => ({
    name: '',
    type: impose?.categorie ?? 'other',
    documentable_type: impose?.type ?? parDefaut?.type ?? 'user',
    documentable_id: impose?.id ?? parDefaut?.id ?? 0,
    description: '',
    expiry_date: '',
  });

  const { form, handleSubmit, isSubmitting, globalError } = useApiForm<DocumentUploadFormValues, unknown>({
    schema: documentUploadSchema,
    defaultValues: valeursInitiales(),
    onSubmit: async (values) => {
      if (!fichier) throw new Error(t('sansFichier'));
      if (versionDe.current !== null) {
        await version.mutateAsync({
          document_id: versionDe.current,
          file: fichier,
          comment: values.description || undefined,
          // Absente, l'API viderait l'échéance de la pièce (TCK-2300) : la date du formulaire part toujours.
          expiry_date: values.expiry_date || undefined,
        });
        return undefined;
      }
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

  // TCK-2899 — la lecture tourne pendant qu'on nomme le document, pour une carte d'identité ou un
  // passeport en image seulement (les autres pièces ne chargent pas le moteur). Une photo reprise, une
  // catégorie changée ou la fenêtre fermée l'abandonnent : son résultat tardif est jeté. Une date déjà
  // saisie n'est jamais écrasée.
  const typeChoisi = useWatch({ control: form.control, name: 'type' });
  // TCK-2898 — la pièce du même genre à remplacer, s'il y en a une (jamais sur un rangement imposé).
  const aRemplacer = vu && !impose ? pieceARemplacer(vu, typeChoisi) : null;
  const versionVisee = aRemplacer !== null && remplace ? aRemplacer.documentId : null;
  useEffect(() => {
    versionDe.current = versionVisee;
  }, [versionVisee]);
  const nomARemplacer = aRemplacer ? libelles.entree(aRemplacer) : null;
  useEffect(() => {
    // Le nom n'est pas celui de la version (la pièce garde le sien) ; il évite un champ obligatoire vide.
    if (nomARemplacer && !form.getValues('name')) form.setValue('name', nomARemplacer);
  }, [nomARemplacer, form]);
  const aLire = fichier !== null && fichier.type.startsWith('image/') && PIECES_A_MRZ.includes(typeChoisi);
  const luPour = useRef<File | null>(null);
  useEffect(() => {
    if (!aLire || !fichier || luPour.current === fichier) return;
    const abandon = new AbortController();
    void lireLaDateDExpiration(fichier, abandon.signal).then((date) => {
      if (abandon.signal.aborted) return;
      luPour.current = fichier;
      if (!date || form.getValues('expiry_date')) return;
      form.setValue('expiry_date', date, { shouldDirty: true });
      setDateLue(date);
    });
    return () => abandon.abort();
  }, [aLire, fichier, form]);

  function remplacerApercu(suivant: File | null) {
    if (apercuCourant.current) URL.revokeObjectURL(apercuCourant.current);
    apercuCourant.current =
      suivant?.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(suivant) : null;
    setApercu(apercuCourant.current);
  }

  function fermerLeRecadrage() {
    if (apercuARecadrer) URL.revokeObjectURL(apercuARecadrer);
    setApercuARecadrer(null);
    setARecadrer(null);
  }

  function fermer() {
    decodage.current += 1;
    fermerLeRecadrage();
    setRecadree(false);
    setRemplace(true);
    setDateLue(null);
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
    // TCK-2898 — une image passe d'abord par le recadrage, si le navigateur sait la décoder ; sinon
    // (HEIC hors Safari, environnement sans `createImageBitmap`), elle part telle quelle.
    if (choisi.type.startsWith('image/') && typeof createImageBitmap === 'function') {
      const jeton = (decodage.current += 1);
      void createImageBitmap(choisi, { imageOrientation: 'from-image' }).then(
        (image) => {
          const naturel = { largeur: image.width, hauteur: image.height };
          image.close();
          if (jeton !== decodage.current) return;
          if (apercuARecadrer) URL.revokeObjectURL(apercuARecadrer);
          setApercuARecadrer(typeof URL.createObjectURL === 'function' ? URL.createObjectURL(choisi) : null);
          setQuarts(0);
          setCadre(CADRE_ENTIER);
          setARecadrer({ fichier: choisi, source: depuis, naturel });
        },
        () => {
          if (jeton === decodage.current) accepter(choisi, depuis, false);
        },
      );
      return;
    }
    accepter(choisi, depuis, false);
  }

  /** TCK-2898 — l'image recadrée (ou l'originale, si le dessin échoue) remplace le fichier choisi. */
  async function validerLeRecadrage() {
    if (!aRecadrer || recadrageEnCours) return;
    setRecadrageEnCours(true);
    let resultat = aRecadrer.fichier;
    try {
      resultat = await recadrerLaPhoto(aRecadrer.fichier, quarts, cadre);
    } catch {
      // Le dessin a échoué : l'original part, comme une image non décodée.
    } finally {
      setRecadrageEnCours(false);
    }
    if (resultat.size > DOCUMENT_MAX_SIZE_BYTES) {
      setErreurFichier(t('tropLourd'));
      return;
    }
    const { source: depuis, fichier: original } = aRecadrer;
    fermerLeRecadrage();
    accepter(resultat, depuis, resultat !== original);
  }

  function accepter(choisi: File, depuis: Source, estRecadree: boolean) {
    setRecadree(estRecadree);
    // TCK-2899 — une date lue sur la photo précédente ne vaut pas pour la nouvelle.
    if (dateLue !== null && form.getValues('expiry_date') === dateLue) form.setValue('expiry_date', '');
    setDateLue(null);
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

  const interrupteurDeRemplacement = aRemplacer ? (
    <Remplace categorie={typeChoisi} actif={remplace} onChange={setRemplace} />
  ) : null;

  const champs = (
    <ChampsDeLAjout
      control={form.control}
      cibles={cibles}
      impose={impose}
      dateLue={dateLue}
      remplacement={interrupteurDeRemplacement}
      onCible={(c) => {
        form.setValue('documentable_type', c.type);
        form.setValue('documentable_id', c.id);
      }}
    />
  );

  const editeur = aRecadrer ? (
    <Recadrage
      apercu={apercuARecadrer}
      naturel={aRecadrer.naturel}
      quarts={quarts}
      cadre={cadre}
      onTourner={() => {
        setQuarts((q) => (q + 1) % 4);
        setCadre(CADRE_ENTIER);
      }}
      onCadre={setCadre}
      onReprendre={aRecadrer.source === 'photo' ? prendrePhoto : choisirFichier}
    />
  ) : null;

  const utiliser = (
    <Button type="button" className={cn(!bureau && 'text-corps')} onClick={() => void validerLeRecadrage()} disabled={recadrageEnCours}>
      {recadrageEnCours ? t('recadrage.enCours') : t('recadrage.valider')}
    </Button>
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
            {editeur ? (
              <>
                {editeur}
                <div className="mt-3">{erreur}</div>
              </>
            ) : formulaire(
              <>
                {fichier ? (
                  <LeFichier
                    fichier={fichier}
                    recadree={recadree}
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
            {/* TCK-2898 — pendant le recadrage, « Annuler » revient au formulaire sans changer de fichier. */}
            <Button type="button" variant="outline" onClick={aRecadrer ? fermerLeRecadrage : fermer}>
              {tCommon('actions.cancel')}
            </Button>
            {aRecadrer ? utiliser : envoyer}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // TCK-2898 — téléphone : l'étape « Redresser et recadrer », plein écran, entre la prise et le formulaire.
  if (aRecadrer) {
    return (
      <PanneauDroit
        open={open}
        formulaire
        onOpenChange={(o) => (o ? undefined : fermer())}
        titre={t('recadrage.titre')}
        sousTitre={aRecadrer.source === 'photo' ? t('etapePhoto') : t('etapeFichier')}
        pied={utiliser}
      >
        {entrees}
        {editeur}
        <div className="mt-3">{erreur}</div>
      </PanneauDroit>
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
        {vu ? <ARenouveler vu={vu} /> : null}
        {impose ? (
          <p className="mt-4 text-ui leading-snug text-muted-foreground">{t('rangeImpose', { dossier: impose.nom })}</p>
        ) : parDefaut ? (
          <RangementParDefaut cible={parDefaut} />
        ) : null}
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
            recadree={recadree}
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

function LeFichier({
  fichier,
  recadree = false,
  apercu,
  action,
}: {
  readonly fichier: File;
  /** TCK-2898 — l'image a été recadrée : « Photo recadrée » tient lieu de nom de fichier. */
  readonly recadree?: boolean;
  readonly apercu: string | null;
  readonly action: ReactNode;
}) {
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
          <span className="block truncate text-sm font-medium">{recadree ? t('photoRecadree') : fichier.name}</span>
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
  impose,
  dateLue,
  remplacement,
  onCible,
}: {
  readonly control: Control<DocumentUploadFormValues>;
  readonly cibles: readonly CibleDeRangement[];
  readonly impose?: RangementImpose;
  readonly dateLue: string | null;
  /** TCK-2898 — l'interrupteur « Remplace … qui expire », sous « Rangé dans » (maquette `Remplace`). */
  readonly remplacement?: ReactNode;
  readonly onCible: (cible: CibleDeRangement) => void;
}) {
  const t = useTranslations('documents.coffre.ajout');
  return (
    <>
      {/* Téléphone : nom, catégorie, expiration ; dès `md` : nom | expiration, puis la catégorie. */}
      <div className="grid gap-4 md:grid-cols-2">
        <FormInput<DocumentUploadFormValues> control={control} name="name" label={t('nom')} placeholder={t('nomExemple')} aria-required />
        <div className="md:order-last md:col-span-2">
          <ChoixDeCategorie
            control={control}
            rapides={impose?.categories ?? CATEGORIES_RAPIDES}
            toutes={impose ? DOCUMENT_TYPE_UPLOAD_ORDER.filter((c) => !PIECES_KYC.includes(c)) : DOCUMENT_TYPE_UPLOAD_ORDER}
          />
        </div>
        <div>
          <FormDatePicker<DocumentUploadFormValues> control={control} name="expiry_date" label={t('expire')} placeholder={t('facultatif')} />
          <PromesseDuRappel control={control} dateLue={dateLue} />
        </div>
      </div>
      {impose ? <RangeDansImpose nom={impose.nom} /> : <RangeDans control={control} cibles={cibles} onCible={onCible} />}
      {remplacement}
      <FormInput<DocumentUploadFormValues> control={control} name="description" label={t('precision')} placeholder={t('precisionExemple')} />
    </>
  );
}

/**
 * TCK-2783 — « Nous vous préviendrons 60 jours avant », sous l'expiration (maquette `app-documents` a) :
 * rangée dans « Mes pièces » (le rappel va au compte qui porte la pièce) ; « 7 jours avant » entre 8 et
 * 60 jours ; rien à 7 jours ou moins.
 */
function PromesseDuRappel({ control, dateLue }: { readonly control: Control<DocumentUploadFormValues>; readonly dateLue: string | null }) {
  const t = useTranslations('documents.coffre.ajout');
  const tMarques = useTranslations('documents.coffre.marques');
  const [type, expiry] = useWatch({ control, name: ['documentable_type', 'expiry_date'] });
  const jalon = type === 'user' ? rappelAVenir(expiry, jourADakar(new Date())) : null;
  // TCK-2899 — « Lu sur la photo. » précède la promesse, tant que le champ porte la date lue.
  const lu = dateLue !== null && expiry === dateLue;
  if (jalon === null && !lu) return null;
  return (
    <p data-testid="aide-de-l-expiration" className="mt-1.5 text-legende text-muted-foreground">
      {[lu ? t('luSurLaPhoto') : null, jalon === null ? null : tMarques(CLE_DE_LA_PROMESSE[jalon])].filter(Boolean).join(' ')}
    </p>
  );
}

function ChoixDeCategorie({
  control,
  rapides,
  toutes,
}: {
  readonly control: Control<DocumentUploadFormValues>;
  readonly rapides: readonly DocumentType[];
  readonly toutes: readonly DocumentType[];
}) {
  const t = useTranslations('documents.coffre.ajout');
  const tTypes = useTranslations('documents.types');
  const type = useWatch({ control, name: 'type' });
  const [plus, setPlus] = useState(() => !rapides.includes(type));
  return (
    <Controller
      control={control}
      name="type"
      render={({ field }) => (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t('categorie')}</legend>
          <div className="flex flex-wrap gap-2">
            {rapides.map((valeur) => (
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
              options={toutes.map((valeur) => ({ value: valeur, label: tTypes(valeur) }))}
            />
          ) : null}
        </fieldset>
      )}
    />
  );
}

/**
 * TCK-2898 — « Remplace la carte qui expire — L'ancienne reste dans les versions. » (maquette `Remplace`) :
 * la ligne entière bascule l'interrupteur.
 */
function Remplace({ categorie, actif, onChange }: { readonly categorie: string; readonly actif: boolean; readonly onChange: (actif: boolean) => void }) {
  const t = useTranslations('documents.coffre.ajout.remplace');
  const id = useId();
  return (
    <label data-testid="remplace" className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
      <span className="min-w-0 flex-1 leading-tight">
        <span id={`${id}-titre`} className="block text-corps font-medium">
          {t('titre', { categorie })}
        </span>
        <span className="mt-0.5 block text-ui text-muted-foreground">{t('texte')}</span>
      </span>
      <Switch checked={actif} onCheckedChange={(suivant) => onChange(suivant)} aria-labelledby={`${id}-titre`} />
    </label>
  );
}

/** TCK-2910 — « Rangé dans » d'un rangement imposé : le dossier, sans « Changer ». */
function RangeDansImpose({ nom }: { readonly nom: string }) {
  const t = useTranslations('documents.coffre.ajout');
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{t('rangeDans')}</p>
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
        <FolderOpen className="size-5 flex-none text-primary" strokeWidth={1.5} aria-hidden="true" />
        <span data-testid="range-dans" className="min-w-0 flex-1 truncate text-corps leading-tight font-medium">
          {nom}
        </span>
      </div>
    </div>
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
        : c.precision?.cle === 'dansLeBien'
          ? // TCK-2898 — le sous-dossier d'un bail se précise par son bien (et son numéro).
            c.precision.reference
            ? t('dansLeBienNumero', { bien: c.precision.nom, reference: c.precision.reference })
            : c.precision.nom
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
