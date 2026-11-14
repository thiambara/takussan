'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useWatch } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { marquerArriveeDeParcours } from '@/lib/arrivee-de-parcours';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { FormGlobalError } from '@/components/forms';
import { fieldDensityScope } from '@/components/ui/field-density';
import { useApiForm } from '@/hooks/useApiForm';
import { useWizardDraft, type UseWizardDraftResult } from '@/hooks/useWizardDraft';
import type { PhotoGardee } from '@/lib/publication/brouillon-local';
import { ApiError } from '@/lib/api';
import {
  propertyFormSchema,
  type PropertyFormPayload,
  type PropertyFormValues,
} from '@/lib/schemas/property';
import {
  createPropertyAction,
  setPropertyTagsAction,
  uploadPropertyPhotosAction,
} from '@/app/actions/dashboard-properties';
import type { PropertyDetail } from '@/types/property';
import type { Tag } from '@/types/tag';

import { isFieldRelevant, type ConditionalFieldKey } from './field-matrix';
import { PROPERTY_ENUM_NAMESPACES } from './options';
import { avecBailleur, toCreatePayload } from './payload';
import { ChoixDuBailleur, type BailleurInvite } from './ChoixDuBailleur';
import { WizardShell, type WizardStepDef } from './wizard/WizardShell';
import { StepBien } from './wizard/steps/StepBien';
import { StepLieu } from './wizard/steps/StepLieu';
import { StepCaracteristiques } from './wizard/steps/StepCaracteristiques';
import { StepPrix } from './wizard/steps/StepPrix';
import { StepPhotos } from './wizard/steps/StepPhotos';
import { StepFinition } from './wizard/steps/StepFinition';
import { BarreApercu, CarteApercu, ListePourPublier, RappelDeLAnnonce } from './wizard/ApercuAnnonce';
import { EnTetePublication } from './wizard/EnTetePublication';
import { reduirePhotos } from '@/lib/reduire-photo';
import { publishPropertyAction } from '@/app/actions/publish-property';
import { LienBoosterApresPublication } from '@/components/boost/BoosterApresPublication';
import { replacePropertyContactsAction } from '@/app/actions/property-contacts';
import { ContactsSurPlace, type ContactSurPlace } from '@/components/contact/ContactsSurPlace';
import { useAuth } from '@/context/AuthContext';
import { CoordonneesDeLAssistant } from '@/components/publication/CoordonneesDeLAssistant';
import { FeuilleDePublication } from '@/components/publication/FeuilleDePublication';
import { FeuilleSansCompte } from '@/components/publication/FeuilleSansCompte';
import type { RepriseDePublication } from '@/lib/publication/reprise-oauth';
import { manquesDeLaFeuille } from '@/components/publication/feuille-de-publication';
import { CLE_BROUILLON_DE_PUBLICATION } from '@/lib/publication/brouillon-de-publication';
import { ouvrirBrouillonLocal } from '@/lib/publication/brouillon-local';

/**
 * TCK-464 — l'assemblage du parcours de publication : les six étapes, la validation par étape, le
 * brouillon serveur, et la soumission en PLUSIEURS écritures.
 *
 * ## Ce que ce composant décide, et que personne d'autre ne peut décider
 *
 * 1. **Quelles clés se valident, et quand.** `form.trigger` ne reçoit que les champs de l'étape
 *    qu'on quitte — jamais le schéma entier. Réclamer un prix à quelqu'un qui n'a pas encore vu
 *    l'étape du prix, c'est le bloquer sur une erreur portant un champ absent de l'écran. À
 *    l'étape des caractéristiques, la liste vient de `isFieldRelevant` : une valeur devenue
 *    non pertinente (un étage saisi pour un appartement, puis bascule sur « terrain ») ne doit
 *    plus rien bloquer, alors qu'elle traîne encore dans l'état du formulaire.
 *
 * 2. **La soumission n'est pas une écriture, c'en est trois** — le bien, les équipements, les
 *    photos — et les deux dernières ont besoin de l'identifiant de la première. Un échec sur
 *    l'une d'elles n'annule RIEN de ce qui précède : le bien EST créé. Le dire autrement
 *    enverrait l'utilisateur recommencer, et créer un doublon. D'où `idCree` (on ne recrée
 *    jamais), `tagsEnvoyes` / `photosEnvoyees` (on ne rejoue jamais ce qui a réussi — rejouer un
 *    envoi de photos DUPLIQUERAIT les médias), et deux issues offertes plutôt qu'une : réessayer,
 *    ou continuer sans.
 *
 * 3. **Le brouillon.** Chaque changement de valeur est poussé au hook (débounce 800 ms côté
 *    hook), avec l'INDEX de l'étape courante — sans lui, une reprise rouvrirait à l'étape 1 un
 *    formulaire déjà rempli aux trois quarts. Au retour, les valeurs sont remises AVANT que la
 *    géo-IP ne pose quoi que ce soit, sans quoi une devise choisie à la main serait écrasée par
 *    celle de la connexion.
 *
 * ## Contrat de hauteur (AC9)
 *
 * `WizardShell` sort son pied de la zone défilante et se dimensionne en `h-full min-h-0` — ce qui
 * n'a d'effet QUE dans une boîte déjà bornée. Ce composant reconduit la chaîne (`flex h-full
 * min-h-0 flex-col`) mais ne fabrique aucune hauteur : c'est la PAGE qui fournit la boîte (cf.
 * `app/(dashboard)/app/properties/new/page.tsx`, qui explique pourquoi `AppShell` ne la fournit
 * pas). Monté hors d'une telle boîte, le parcours prendrait la hauteur de son contenu et c'est la
 * page qui défilerait, en emportant le bouton « Continuer ».
 *
 * ⚠ Aucun `useCallback` / `useMemo` : le React Compiler s'en charge (ADR-0015), et une
 * mémoïsation manuelle fait ABANDONNER la compilation de tout le composant — c'est le piège le
 * plus facile à tomber sur un composant d'orchestration comme celui-ci.
 */
const CLE_BROUILLON = 'property-create-wizard';

/**
 * Les clés qu'une étape possède, dans l'ordre des étapes. L'étape 3 (caractéristiques) et
 * l'étape 5 (photos) sont vides pour deux raisons opposées : la première tire ses clés de la
 * matrice à chaque passage, la seconde ne possède aucun champ du formulaire — les fichiers vivent
 * dans l'état de ce composant. `trigger([])` rend `true`, ce qui est exactement le comportement
 * voulu pour une étape qu'on peut sauter.
 */
const CLES_PAR_ETAPE: readonly (readonly (keyof PropertyFormValues)[])[] = [
  ['type', 'contract_type'],
  ['city', 'quarter', 'region', 'street', 'postal_code', 'country'],
  [],
  ['price', 'currency', 'rent_period', 'available_from', 'deposit_months', 'advance_months', 'agency_fee_months', 'monthly_charges'],
  [],
  ['title', 'description', 'virtual_tour_url'],
];

/**
 * TCK-631 — les six étapes en trois parties : le bien (type, lieu), les détails
 * (caractéristiques, prix), l'annonce (photos, titre). Indexé comme `CLES_PAR_ETAPE`.
 */
const PARTIE_PAR_ETAPE = [0, 0, 1, 1, 2, 2] as const;

/** L'index de l'étape des caractéristiques — la seule dont les clés varient d'un passage à l'autre. */
const ETAPE_CARACTERISTIQUES = 2;

/**
 * Les clés candidates de l'étape 3, filtrées par `isFieldRelevant` au moment de quitter l'étape.
 *
 * ⚠ `rent_period`, `available_from` et `tag_ids` sont des clés conditionnelles elles aussi, mais
 * elles n'appartiennent pas à cette étape (les deux premières sont à l'étape du prix, la
 * troisième n'a rien à valider). Cette liste décrit une ÉTAPE, pas la matrice.
 */
const CARACTERISTIQUES: readonly ConditionalFieldKey[] = [
  'area',
  'bedrooms',
  'bathrooms',
  'furnished',
  'year_built',
  'parking_spaces',
  'floor_number',
  'total_floors',
  'title_type',
  'condition',
];

/**
 * Un brouillon tel que le SERVEUR le rend, ramené à ce que le formulaire a écrit.
 *
 * L'autosave envoie `''` pour un champ texte laissé vide ; l'API le rend `null`
 * (`ConvertEmptyStringsToNull`, middleware global de Laravel). Repris tel quel, `street: null`
 * échouait au schéma — `optional()` n'admet pas `null` — et « Continuer » ne faisait plus rien à
 * l'étape 2 : l'erreur, le message brut de zod, tombait dans la section repliée du détail
 * d'adresse (revue adverse v2, mesuré au navigateur). Un `null` n'a rien à dire que la valeur
 * initiale ne dise déjà : on le retire, et c'est `valeursInitiales` qui répond.
 *
 * TCK-574 — l'API n'écrit plus `null` à la place de `''` dans un brouillon (l'écriture d'un
 * brouillon est exemptée de la normalisation). Ce filtre RESTE : les brouillons écrits avant, qui
 * portent ces `null`, sont encore en base jusqu'à leur purge à 90 jours.
 */
function sansNulls(donnees: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(donnees).filter(([, valeur]) => valeur !== null));
}

/**
 * ⚠ **Ni `type` ni `contract_type` ne sont pré-sélectionnés**, contrairement au formulaire d'avant
 * (« Appartement / Louer »). Ces deux réponses gouvernent quelles étapes existent et quels champs
 * s'y affichent : les pré-remplir, c'est laisser quelqu'un traverser l'étape 1 sans y répondre et
 * publier un appartement en location parce que personne n'a touché aux pastilles. Une valeur
 * pré-remplie ne se relit pas — c'est le même raisonnement que pour la ville suggérée (AC6),
 * appliqué au choix qui coûte le plus cher.
 *
 * C'est ce qui donne son sens à `canAdvance` sur la première étape, et le typage doit être forcé :
 * `z.enum(...)` n'admet pas `undefined` en entrée, exactement comme `price`.
 */
function valeursInitiales(): PropertyFormValues {
  return {
    title: '',
    type: undefined as unknown as PropertyFormValues['type'],
    contract_type: undefined as unknown as PropertyFormValues['contract_type'],
    price: undefined as unknown as number,
    currency: 'XOF',
    rent_period: undefined,
    city: '',
    quarter: '',
    region: '',
    street: '',
    postal_code: '',
    country: 'SN',
    latitude: undefined,
    longitude: undefined,
    area: undefined,
    bedrooms: undefined,
    bathrooms: undefined,
    furnished: false,
    year_built: undefined,
    parking_spaces: undefined,
    floor_number: undefined,
    total_floors: undefined,
    title_type: undefined,
    condition: undefined,
    available_from: undefined,
    description: '',
    tag_ids: [],
    deposit_months: undefined,
    advance_months: undefined,
    agency_fee_months: undefined,
    monthly_charges: undefined,
    virtual_tour_url: '',
  };
}

/**
 * Où en est la reprise du brouillon serveur. Trois états et non un booléen : « on n'a pas encore
 * la réponse » et « la réponse est : aucun brouillon » gouvernent des choses différentes — le
 * second autorise la géo-IP à poser ses valeurs par défaut, le premier doit l'en empêcher.
 */
type EtatBrouillon = 'attente' | 'vide' | 'restaure';

/**
 * TCK-2600 (ADR-0093) — l'assistant servi SANS COMPTE, sur `/publish`. Les mêmes étapes, les mêmes
 * champs et les mêmes conditions que l'assistant connecté (AC4) ; ce qui change :
 *
 * - le brouillon vit dans le navigateur (`useBrouillonLocal`), photos comprises, et la page le passe ;
 * - les photos sont réduites AU MOMENT DE L'AJOUT (ADR-0093 § 2), pas à l'envoi ;
 * - aucune écriture serveur : « Publier » valide l'annonce puis la remet à `surPublier` (la feuille
 *   de compte de TCK-2601) ;
 * - ni en-tête propre (la barre est celle de la coque d'entrée), ni « Reprendre plus tard », ni
 *   coordonnées du compte (`CoordonneesDeLAssistant` lit le compte) : `finition` les remplace ;
 * - le départ : son titre et ce qui suit la première question (`depart`).
 */
export interface ModeAnonyme {
  readonly photosInitiales: readonly PhotoGardee[];
  readonly surPhotos: (photos: readonly PhotoGardee[]) => void;
  readonly surPublier: (
    valeurs: PropertyFormPayload,
    photos: readonly File[],
    contacts: readonly ContactSurPlace[],
  ) => void | Promise<void>;
  /**
   * Le départ : son titre, son sous-titre, ce qui précède la première question (`dessus`, la carte de preuves de
   * TCK-2603) et ce qui la suit (`dessous`).
   */
  readonly depart: { readonly titre: string; readonly sousTitre: string; readonly dessus?: ReactNode; readonly dessous: ReactNode };
  readonly finition: ReactNode;
  /**
   * TCK-2600 — ce que le pied dit sous l'aperçu au bureau (le cadre d'entrée de `WizardShell`), selon
   * l'étape (`bien`, `lieu`, `caracteristiques`, `prix`, `photos`, `finition`).
   */
  readonly noteDuPied?: (etape: string) => ReactNode;
  /** La ligne de « Pour publier » qui suit les six étapes (« Votre numéro · à la fin »). */
  readonly pourPublierEnPlus: { readonly libelle: string; readonly note: string };
  /** L'étape courante, pour l'avancement de la barre de la coque. */
  readonly surEtape: (index: number, total: number) => void;
  /**
   * TCK-2601 — la connexion par numéro est ouverte (`phone_login`) : « Publier » ouvre la feuille de
   * compte. Éteinte, `surPublier` mène à la connexion, le brouillon restant ici.
   */
  readonly entreeParTelephone: boolean;
  /**
   * TCK-2601 — une session ouverte, l'espace où publier : `pret` (créé sans question, ou le seul
   * espace particulier, rendu actif) → l'assistant écrit et publie ici ; `ailleurs` → la page a mené
   * ailleurs, le brouillon restant ; `{ erreur }` → rien n'est écrit, l'écran le dit. Rejugé à chaque
   * tentative : un espace créé à la première ne se recrée pas à la seconde.
   */
  readonly preparerLEspace: (valeurs: Partial<PropertyFormValues>, etape: number) => Promise<'pret' | 'ailleurs' | { readonly erreur: string }>;
  /**
   * TCK-2601 (AC5) — la feuille de compte est ouverte, ou l'assistant écrit (espace, création,
   * publication) : la page rend inertes ses sorties (« Quitter », la marque, « Effacer ce
   * brouillon »), que le voile de la feuille couvrait et que le panneau de bureau laisse à côté.
   */
  readonly surVerrou?: (verrouille: boolean) => void;
  /**
   * TCK-2777 — l'aller-retour Google depuis la feuille de compte. `durable` : l'annonce est gardée en
   * IndexedDB (gardée en mémoire, elle ne survivrait pas à la navigation : pas de « Continuer avec
   * Google »). `reprise` : ce que l'URL de retour demande (`?reprise=`), lu une fois l'annonce reprise ;
   * `surRepriseLue` : c'est fait, l'URL l'oublie (un rechargement ne rouvre rien).
   */
  readonly google?: {
    readonly durable: boolean;
    readonly reprise: RepriseDePublication | null;
    readonly surRepriseLue: () => void;
  };
}

interface PropsDeLAssistant {
  readonly tags?: Tag[];
  /**
   * TCK-997 (P15.06, P50.01) — l'agence dont l'auteur peut désigner un bailleur, ou `null` : le choix
   * n'est offert qu'au personnel d'une agence `standard` (la page en juge, `new/page.tsx`). Sans
   * choix, le bien est celui de l'agence.
   */
  readonly agenceDuChoixDuBailleur?: number | null;
  /**
   * TCK-1000 (P15.06, Q2) — le choix offre « Inviter un nouveau bailleur » : l'admin, ou
   * `team.invite` (la page en juge, comme `/app/owners`). Sans choix du bailleur, sans effet.
   */
  readonly peutInviterUnBailleur?: boolean;
  /**
   * TCK-633 — faux quand l'agence de l'auteur est un indépendant (`kind: 'individual'`) : il ne
   * facture pas de frais d'agence, et l'API les refuse pour lui. La page le lit (`new/page.tsx`).
   */
  readonly fraisDAgence?: boolean;
  /** TCK-631 — « 3 annonces sur 5 » : le quota se lisait sous le titre de page, qui a disparu. */
  readonly quotaNote?: string;
  /**
   * TCK-587 (ADR-0031) — l'auteur est un bailleur hors personnel : il PROPOSE le bien à son
   * agence. Le serveur impose déjà brouillon + privé (`PropertyController::store`) ; l'écran le
   * dit, et le bouton final n'annonce plus une publication qui n'aura pas lieu. Le parcours ne
   * porte aucun contrôle de publication ni de visibilité, pour personne : le corps part toujours
   * en `visibility: 'private'` (`toCreatePayload`).
   */
  readonly proposition?: boolean;
  /**
   * TCK-2602 — l'auteur publie dans un espace PARTICULIER (`kind: 'individual'`, la page le lit) : la
   * publication réussie mène à « Votre annonce est en ligne » (`/app/properties/{id}/en-ligne`) au lieu
   * du toast et de la fiche. Faux par défaut : une agence illisible garde la sortie d'avant. Sans compte
   * (`anonyme`), l'espace est particulier par construction (`preparerLEspace` ne rend `pret` que là).
   */
  readonly espaceParticulier?: boolean;
}

/**
 * L'assistant connecté de `/app/properties/new` : son brouillon est celui du serveur.
 *
 * TCK-2601 (AC3) — `depuisPublication` : l'annonce commencée sans compte, versée au brouillon serveur
 * sous SA clé (`CLE_BROUILLON_DE_PUBLICATION`), qui est la seule lue ET écrite ici : un brouillon
 * antérieur (`property-create-wizard`) reste intact (AC4).
 */
export function PropertyWizard({ depuisPublication = false, ...props }: PropsDeLAssistant & { readonly depuisPublication?: boolean }) {
  const brouillon = useWizardDraft<Partial<PropertyFormValues>>(depuisPublication ? CLE_BROUILLON_DE_PUBLICATION : CLE_BROUILLON);
  return <AssistantDePublication {...props} brouillon={brouillon} depuisPublication={depuisPublication} />;
}

export function AssistantDePublication({
  tags = [],
  proposition = false,
  espaceParticulier = false,
  quotaNote,
  fraisDAgence = true,
  agenceDuChoixDuBailleur = null,
  peutInviterUnBailleur = false,
  brouillon,
  anonyme,
  depuisPublication = false,
}: PropsDeLAssistant & {
  readonly brouillon: UseWizardDraftResult<Partial<PropertyFormValues>>;
  readonly anonyme?: ModeAnonyme;
  readonly depuisPublication?: boolean;
}) {
  const t = useTranslations('property.wizard');
  const tTypeArticle = useTranslations(PROPERTY_ENUM_NAMESPACES.typeArticle);
  const router = useRouter();
  const toast = useToast();
  const { save: sauverBrouillon, flush: viderFileBrouillon, clear: effacerBrouillon } = brouillon;

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [photos, setPhotos] = useState<File[]>([]);
  const [erreurPhotos, setErreurPhotos] = useState<string | null>(null);
  /**
   * TCK-574 — le nombre de « Continuer » REFUSÉS. Une étape qui replie des champs (`StepLieu`)
   * doit les redéplier à CHAQUE refus, pas seulement quand une erreur apparaît : repliés à la main
   * après avoir vu l'erreur, ils la cachaient de nouveau, et « Continuer » ne faisait plus rien.
   */
  const [refus, setRefus] = useState(0);
  const [avertissement, setAvertissement] = useState<string | null>(null);
  const [etatBrouillon, setEtatBrouillon] = useState<EtatBrouillon>('attente');
  const [repriseAnnoncee, setRepriseAnnoncee] = useState(false);
  /**
   * « Reprendre plus tard » a demandé l'écriture du brouillon et le serveur l'a refusée (TCK-465).
   * ⚠ Distinct de `brouillon.error`, qui porte AUSSI les échecs de l'autosave silencieux : celui-ci
   * est le seul qui doive retenir l'utilisateur sur la page, parce que c'est le seul où il était en
   * train de partir.
   */
  const [echecReprise, setEchecReprise] = useState(false);

  // Ce que la soumission a DÉJÀ obtenu. Trois atomes, parce que trois écritures indépendantes :
  // recréer le bien produirait un doublon, rejouer les photos dupliquerait les médias.
  const [idCree, setIdCree] = useState<number | null>(null);
  const [tagsEnvoyes, setTagsEnvoyes] = useState(false);
  /**
   * TCK-673 — les photos déjà PASSÉES, une à une : chacune part dans sa propre server action, et
   * une reprise ne renvoie que celles qui manquent (rejouer une photo passée duplique le média).
   */
  const [photosEnvoyees, setPhotosEnvoyees] = useState<ReadonlySet<File>>(() => new Set());
  /** TCK-673 — la photo en cours d'envoi (« 3 sur 12 »), `null` hors envoi. */
  const [envoiPhotos, setEnvoiPhotos] = useState<{ readonly rang: number; readonly total: number } | null>(null);
  /**
   * TCK-627 — la quatrième écriture : publier. Le bien naît brouillon ; `PUT …/visibility`
   * le publie et rend le statut que l'agence décide (`available`, ou `pending_review` quand elle
   * modère). Un refus (quota, droits) laisse un brouillon BIEN RÉEL : on le dit, on ne le recrée pas.
   */
  const [statutPublie, setStatutPublie] = useState<string | null>(null);
  const [echecPublication, setEchecPublication] = useState(false);
  /** TCK-633 (lot C) — la cinquième écriture : les contacts sur place, après la création. */
  const [contactsSurPlace, setContactsSurPlace] = useState<ContactSurPlace[]>([]);
  /** TCK-997 — le compte du bailleur désigné, `null` : le bien de l'agence. */
  const [bailleurId, setBailleurId] = useState<number | null>(null);
  /** TCK-1000 — le bailleur invité depuis le choix, `null` sans invitation liée. */
  const [bailleurInvite, setBailleurInvite] = useState<BailleurInvite | null>(null);
  const [contactsEnvoyes, setContactsEnvoyes] = useState(false);
  /** TCK-633 — ce que l'API a refusé de publier faute de coordonnées (`missing`), et pour qui. */
  const [manquants, setManquants] = useState<string[] | null>(null);
  const [contactEstSoi, setContactEstSoi] = useState(true);
  /**
   * TCK-2601 — la feuille de compte. `cle` la remonte à chaque ouverture (ce qu'elle demande est figé
   * à son montage) ; `apresRefus` : rouverte parce que l'API a refusé faute de coordonnées.
   */
  const [feuille, setFeuille] = useState({ cle: 0, ouverte: false, apresRefus: false, sansCompte: false });
  // TCK-2601 (AC5) — la place du panneau de compte dans la colonne gauche (`WizardShell`).
  const [cibleDuPanneau, setCibleDuPanneau] = useState<HTMLDivElement | null>(null);
  const { user } = useAuth();
  /**
   * TCK-2601 — sans compte, « Publier » remet l'annonce à la page ; une fois la session ouverte et
   * l'espace prêt, l'assistant fait SES écritures. Une référence et non un état : la soumission que la
   * feuille attend a été prise avant que la session ne s'ouvre, et doit lire la bascule à jour.
   */
  const ecrireVraiment = useRef(false);
  const [preparation, setPreparation] = useState(false);
  /**
   * TCK-2601 (AC3) — les photos d'une annonce venue de `/publish` vivent dans le navigateur où elles
   * ont été ajoutées (ADR-0093) : reprises d'IndexedDB ; absentes (un autre appareil), l'écran le dit —
   * seulement si l'annonce versée a bien été reprise (après une publication ou une purge, rien à dire).
   */
  const [photosLocalesAbsentes, setPhotosAilleurs] = useState(false);
  useEffect(() => {
    if (!depuisPublication) return;
    let annule = false;
    void ouvrirBrouillonLocal()
      .ouvrir()
      .then((local) => {
        if (annule) return;
        if (local.photos.length > 0) setPhotos((deja) => (deja.length > 0 ? deja : local.photos.map((p) => p.fichier)));
        else if (local.valeurs === null) setPhotosAilleurs(true);
      });
    return () => {
      annule = true;
    };
  }, [depuisPublication]);
  const tContacts = useTranslations('property.contacts');
  const tPublication = useTranslations('property.form.publishContact');

  /**
   * La sortie nominale : le brouillon n'a plus lieu d'être, le bien s'ouvre — sa fiche, ou l'écran
   * « en ligne » d'un espace particulier (TCK-2602, `destination`).
   */
  const terminer = async (id: number, destination = `/app/properties/${id}`) => {
    await effacerBrouillon();
    // TCK-2601 (AC3) — l'annonce venue de `/publish` : sa clé serveur (ci-dessus) ET son brouillon local.
    if (depuisPublication) await ouvrirBrouillonLocal().effacer();
    // TCK-2615 — l'arrivée qui suit la publication n'ouvre aucune fenêtre de bienvenue.
    marquerArriveeDeParcours('publication');
    router.push(destination);
    router.refresh();
  };

  const { form, isSubmitting, globalError, handleSubmit, clearGlobalError } = useApiForm<
    PropertyFormValues,
    PropertyDetail
  >({
    schema: propertyFormSchema,
    defaultValues: valeursInitiales(),
    onSubmit: async (values) => {
      setAvertissement(null);
      setEchecPublication(false);
      // TCK-2600 — sans compte, rien ne s'écrit : l'annonce validée part à la page (la connexion).
      if (anonyme && !ecrireVraiment.current) {
        await anonyme.surPublier(values as unknown as PropertyFormPayload, photos, contactsSurPlace);
        return null as unknown as PropertyDetail;
      }
      // Un bien déjà créé n'est JAMAIS recréé : une reprise après échec partiel rejoue les
      // écritures manquantes, pas la création. C'est l'AC7.
      if (idCree !== null) return { id: idCree } as PropertyDetail;

      const resultat = await createPropertyAction(
        avecBailleur(
          toCreatePayload(values as unknown as PropertyFormPayload),
          bailleurId,
          bailleurInvite?.profileId ?? null,
        ),
      );
      if (!resultat.ok) {
        throw new ApiError(resultat.status ?? 500, {
          message: resultat.message,
          errors: resultat.errors,
        });
      }
      return resultat.data as PropertyDetail;
    },
    onSuccess: async (bien) => {
      if (anonyme && !ecrireVraiment.current) return;
      if (!bien?.id) throw new ApiError(500, { message: t('missingId') });
      setIdCree(bien.id);

      const valeurs = form.getValues() as unknown as PropertyFormPayload;
      const echecs: string[] = [];

      // TCK-633 — un équipement PROPOSÉ (nom hors catalogue) part par le même appel que les autres.
      if ((valeurs.tag_ids?.length || valeurs.tag_names?.length) && !tagsEnvoyes) {
        const r = await setPropertyTagsAction(bien.id, valeurs.tag_ids ?? [], valeurs.tag_names ?? []);
        if (r.ok) setTagsEnvoyes(true);
        else echecs.push(t('partial.tags'));
      }

      // TCK-673 (P08.01) — UNE server action par photo. Le lot partait dans un seul `FormData`,
      // et Next plafonne le corps d'une action (`serverActions.bodySizeLimit`) : une seule photo
      // réduite pèse déjà 1,4 Mo (TCK-542). Un échec n'emporte plus les photos suivantes.
      const aEnvoyer = photos.filter((p) => !photosEnvoyees.has(p));
      if (aEnvoyer.length > 0) {
        // Réduites dans le navigateur avant l'envoi : grand côté plafonné, format gardé (TCK-542).
        const reduites = await reduirePhotos(aEnvoyer);
        const passees = new Set(photosEnvoyees);
        let premierEchec: string | null = null;
        for (let i = 0; i < reduites.length; i++) {
          setEnvoiPhotos({ rang: i + 1, total: reduites.length });
          const formData = new FormData();
          formData.append('photos', reduites[i]);
          const r = await uploadPropertyPhotosAction(bien.id, formData);
          if (r.ok) passees.add(aEnvoyer[i]);
          else premierEchec ??= r.message;
        }
        setEnvoiPhotos(null);
        setPhotosEnvoyees(passees);
        if (premierEchec === null) {
          setErreurPhotos(null);
        } else {
          echecs.push(t('partial.photos'));
          // Le message va AUSSI sur l'étape des photos : c'est là que l'utilisateur revient pour
          // retirer le fichier fautif, et un avertissement resté sur la dernière étape ne l'y
          // suivrait pas. Sans cette ligne, la prop `error` de `StepPhotos` ne vaudrait jamais
          // autre chose que `null`.
          setErreurPhotos(premierEchec);
        }
      }

      const contactsValides = contactsSurPlace.filter((c) => c.phone.trim() !== '');
      if (contactsValides.length > 0 && !contactsEnvoyes) {
        const r = await replacePropertyContactsAction(bien.id, contactsValides);
        if (r.ok) setContactsEnvoyes(true);
        else echecs.push(tContacts('partial'));
      }

      // Un échec ici n'est PAS un échec de création : le dire autrement enverrait l'utilisateur
      // recommencer, et créer un doublon. On ne quitte donc pas la page, on ne vide pas le
      // brouillon, et on offre les deux issues qui existent réellement.
      if (echecs.length > 0) {
        setAvertissement(t('partial.message', { items: echecs.join(', ') }));
        return;
      }

      // Le bailleur hors personnel PROPOSE : il n'a pas `properties.publish`, l'agence publiera.
      let statut = statutPublie;
      if (!proposition && statut === null) {
        // TCK-633 (lot C) — `POST …/publish` porte l'acceptation des CGU que la phrase de
        // `CoordonneesPublication` annonce. Un refus faute de coordonnées ouvre le bloc, sans
        // quitter la publication ; le brouillon reste, et « Publier » rejoue la seule publication.
        const r = await publishPropertyAction(bien.id, { acceptTerms: true });
        if (!r.ok) {
          setManquants(r.missing);
          setContactEstSoi(r.contactIsSelf);
          // TCK-2601 — le bloc « Vos coordonnées » a quitté l'assistant : le bandeau renvoie à la feuille.
          setAvertissement(
            r.missing
              ? r.contactIsSelf
                ? t('feuille.incomplet')
                : tPublication('otherContact')
              : t('publishFailed', { message: r.message }),
          );
          setEchecPublication(true);
          // TCK-2601 — ce que l'API dit manquer se complète dans la feuille, rouverte : le contexte
          // pouvait le croire fait (numéro changé ailleurs), ou le contact est un AUTRE (dit, sans saisie).
          if (r.missing && (!r.contactIsSelf || r.missing.some((m) => m === 'first_name' || m === 'verified_phone'))) {
            setFeuille((f) => ({ cle: f.cle + 1, ouverte: true, apresRefus: true, sansCompte: false }));
          }
          return;
        }
        setManquants(null);
        statut = r.data?.status ?? 'available';
        setStatutPublie(statut);
      }

      // TCK-2602 — l'espace particulier : « Votre annonce est en ligne » (partager, compléter, booster)
      // au lieu du toast. L'écran relit le bien et dit lui-même « en vérification » (`pending_review`).
      // Seulement ici, après toutes les écritures : un échec partiel est sorti plus haut, avertissement
      // compris. Une proposition ne publie pas : elle garde le toast et la fiche.
      if (!proposition && (anonyme !== undefined || espaceParticulier)) {
        await terminer(bien.id, `/app/properties/${bien.id}/en-ligne`);
        return;
      }

      // TCK-633 (décision 5 du porteur) — une annonce en ligne se booste depuis le message même.
      // En vérification ou proposée, elle n'est pas encore publique : rien à booster.
      const enLigne = !proposition && statut !== 'pending_review';
      toast.add({
        title: proposition
          ? t('outcome.proposal')
          : statut === 'pending_review'
            ? t('outcome.review')
            : t('outcome.live'),
        type: 'success',
        ...(enLigne ? { timeout: 10000, data: { action: <LienBoosterApresPublication propertyId={bien.id} libelle={t('outcome.boost')} /> } } : {}),
      });
      await terminer(bien.id);
    },
  });

  const { control, watch, trigger, reset } = form;

  /**
   * TCK-2600 — sans compte, les photos vivent au brouillon local : chaque ajout et chaque retrait y
   * est écrit. Pas avant la reprise (`attente`) : on écraserait les photos gardées par la liste vide
   * du premier rendu.
   */
  const photosDuMontage = useRef(photos);
  useEffect(() => {
    if (!anonyme || etatBrouillon === 'attente' || photos === photosDuMontage.current) return;
    anonyme.surPhotos(photos.map((fichier, i) => ({ id: `${i}-${fichier.name}-${fichier.size}`, fichier })));
    // `anonyme` est un objet neuf à chaque rendu de la page : seules les photos déclenchent l'écriture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, etatBrouillon]);
  // TCK-564 — `useWatch` et non `watch()` lu pendant le rendu : c'est ce motif qui figeait les
  // pastilles des étapes une fois compilées (cf. `__tests__/abonnement-des-etapes.test.tsx`). Ici,
  // dans l'hôte, le compilateur ne mettait pas la lecture en cache — mesuré sur sa sortie — mais
  // c'est un effet de bord de sa sortie, pas un contrat : `canAdvance` n'a pas à en dépendre.
  // (`watch(callback)`, plus bas, est un ABONNEMENT, pas une lecture : il reste.)
  const [type, contrat] = useWatch({ control, name: ['type', 'contract_type'] });

  /**
   * Reprise du brouillon serveur — la décision se prend PENDANT LE RENDU, l'écriture dans le
   * formulaire dans l'effet juste en dessous. Même patron que `useWizardDraft` lui-même
   * (TCK-316) : un ajustement d'état déclenché par une donnée qui vient d'arriver s'écrit dans le
   * rendu, où React le boucle sans commit intermédiaire. Le poser dans un effet coûterait un
   * rendu en cascade — et `react-hooks/set-state-in-effect` le refuse.
   *
   * L'écriture converge : `etatBrouillon` quitte `attente` et n'y revient jamais.
   */
  if (etatBrouillon === 'attente' && !brouillon.isLoading) {
    const donnees = brouillon.draft?.data;
    if (donnees && Object.keys(donnees).length > 0) {
      const etape = brouillon.draft?.step ?? 0;
      if (anonyme?.google?.reprise) {
        // TCK-2777 — revenue de chez Google : l'annonce était à la feuille de compte, donc à l'étape 6.
        setDirection(1);
        setIndex(CLES_PAR_ETAPE.length - 1);
      } else if (etape > 0 && etape < CLES_PAR_ETAPE.length) {
        setDirection(1);
        setIndex(etape);
      }
      setRepriseAnnoncee(true);
      setEtatBrouillon('restaure');
      if (anonyme && anonyme.photosInitiales.length > 0) setPhotos(anonyme.photosInitiales.map((p) => p.fichier));
    } else {
      setEtatBrouillon('vide');
    }
  }

  /**
   * L'écriture, elle, est bien un effet : `reset` pousse dans react-hook-form, système extérieur
   * à React — et l'appeler pendant le rendu mettrait à jour les `Controller` enfants au milieu du
   * nôtre.
   *
   * ⚠ TCK-2823 — un effet de MISE EN PAGE, pas un effet passif. La reprise vient de rendre l'étape du
   * brouillon (`setIndex` ci-dessus), et les effets passifs d'un enfant passent AVANT ceux du parent :
   * en `useEffect`, celui de `StepFinition` lisait le formulaire VIDE, un commit avant le `reset` —
   * `tType('')`, `MISSING_MESSAGE`, frontière d'erreur au rechargement de `/publish` à l'étape 6, et
   * en production le titre proposé perdu. Tout effet de mise en page passe avant tout effet passif du
   * même commit : aucune étape ne voit plus le formulaire d'avant la reprise.
   *
   * ⚠ `reset` et non une suite de `setValue` : un brouillon partiel doit rendre au formulaire un
   * état COMPLET, sinon une clé absente du brouillon garderait la valeur d'un rendu précédent.
   *
   * ⚠ Le verrou `brouillonApplique` n'est pas une ceinture de sécurité : `brouillon.draft` est
   * REMPLACÉ à chaque sauvegarde réussie (le hook y range la réponse du serveur). Sans lui, cet
   * effet se rejouerait après chaque autosave et écraserait la saisie en cours par ce que le
   * serveur vient d'accuser réception — c'est-à-dire la frappe d'il y a une seconde.
   */
  const brouillonApplique = useRef(false);
  useLayoutEffect(() => {
    if (etatBrouillon !== 'restaure' || brouillonApplique.current) return;
    brouillonApplique.current = true;
    const donnees = brouillon.draft?.data;
    // TCK-633 — `currency` est ré-imposée : un brouillon d'avant ADR-0061 peut porter l'euro, et
    // le prix se lirait avec des décimales que la publication en francs CFA n'admet pas. `country`
    // aussi : un brouillon d'avant ADR-0062 porte le pays de la géo-IP.
    if (donnees) reset({ ...valeursInitiales(), ...sansNulls(donnees), currency: 'XOF', country: 'SN' } as PropertyFormValues);
  }, [etatBrouillon, brouillon.draft, reset]);

  /**
   * TCK-2777 — le retour de Google, une fois l'annonce reprise de ce navigateur :
   * - session ouverte (`reprise=compte`) → la feuille CONNECTÉE, qui ne demande que ce qui manque au
   *   compte (numéro, prénom, nom, WhatsApp — un compte Google n'a pas de numéro). Rien n'est écrit :
   *   l'annonce ne part qu'au geste « Publier mon annonce » ;
   * - aller-retour annulé ou refusé (`reprise=echec`, sans session) → la feuille sans compte, au
   *   numéro, qui le propose. Une reprise sans annonce à reprendre (effacée entre-temps) ne rouvre rien.
   * Décidé PENDANT LE RENDU, comme la reprise du brouillon juste au-dessus.
   */
  const repriseGoogle = anonyme?.google?.reprise ?? null;
  const [repriseFaite, setRepriseFaite] = useState(false);
  const [alerteGoogle, setAlerteGoogle] = useState<string | null>(null);
  if (repriseGoogle && !repriseFaite && etatBrouillon !== 'attente') {
    setRepriseFaite(true);
    if (etatBrouillon === 'restaure') {
      const connecte = repriseGoogle === 'compte' && user !== null && user !== undefined;
      if (repriseGoogle === 'echec' && !user) setAlerteGoogle(t('feuille.googleEchec'));
      setFeuille((f) => ({ cle: f.cle + 1, ouverte: true, apresRefus: false, sansCompte: !connecte }));
    }
  }
  const surRepriseLue = anonyme?.google?.surRepriseLue;
  useEffect(() => {
    if (repriseFaite) surRepriseLue?.();
    // Une fois : `surRepriseLue` est neuve à chaque rendu de la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repriseFaite]);

  /*
   * TCK-633 (ADR-0062 §4) — la géo-IP ne pose plus rien. Elle posait le pays de connexion, ce que
   * la note de l'étape 1 annonçait ; mais le Sénégal est le seul pays servi, et l'API réécrit `SN`
   * sur toute adresse du référentiel : un visiteur connecté depuis Paris voyait « FR », qui
   * disparaissait à l'enregistrement. Le pays part à `SN` (`valeursInitiales`), et la ville
   * reste à la suggestion, qui s'accepte d'un geste (AC6, `StepLieu`).
   */

  /**
   * Autosave silencieux : chaque changement de valeur part au hook, qui débounce à 800 ms et
   * persiste SUR LE SERVEUR (TCK-250) — un brouillon survit donc au changement d'appareil, pas
   * seulement au rechargement d'onglet. L'index de l'étape voyage avec les valeurs.
   *
   * ⚠ On s'abonne à `sauverBrouillon` (stable) et non à l'objet rendu par le hook, qui est neuf à
   * chaque rendu : s'y abonner ré-inscrirait le `watch` à chaque frappe.
   */
  useEffect(() => {
    const abonnement = watch((valeurs) =>
      sauverBrouillon(index, valeurs as Partial<PropertyFormValues>),
    );
    return () => abonnement.unsubscribe();
  }, [watch, sauverBrouillon, index]);

  // TCK-2600 — l'avancement de la barre de la coque suit l'étape (les pastilles « 3 sur 6 »).
  const surEtape = anonyme?.surEtape;
  useEffect(() => {
    surEtape?.(index, CLES_PAR_ETAPE.length);
  }, [surEtape, index]);

  // TCK-2601 (AC5) — les sorties de la page attendent la fin du compte et des écritures ; un assistant
  // démonté (brouillon effacé, page quittée) ne laisse pas la page verrouillée.
  const surVerrou = anonyme?.surVerrou;
  const verrouille = feuille.ouverte || isSubmitting || preparation;
  useEffect(() => {
    surVerrou?.(verrouille);
  }, [surVerrou, verrouille]);
  useEffect(() => () => surVerrou?.(false), [surVerrou]);

  /**
   * TCK-2600 (AC2) — sans compte, changer d'étape est écrit au brouillon, même sans valeur changée :
   * un rechargement rouvre À CETTE ÉTAPE (passer les photos sans en ajouter ne change aucune valeur).
   * Pas avant la reprise : on écrirait l'étape 1 d'un formulaire vide par-dessus le brouillon gardé.
   */
  const estAnonyme = anonyme !== undefined;
  useEffect(() => {
    // Le départ d'un formulaire vierge n'est pas un brouillon : rien à garder tant qu'on n'a rien dit.
    if (!estAnonyme || etatBrouillon === 'attente' || (etatBrouillon === 'vide' && index === 0)) return;
    sauverBrouillon(index, form.getValues() as Partial<PropertyFormValues>);
  }, [estAnonyme, etatBrouillon, index, sauverBrouillon, form]);

  const naviguer = async (prochain: number, sens: 1 | -1) => {
    setRepriseAnnoncee(false);
    if (sens > 0) {
      const cles =
        index === ETAPE_CARACTERISTIQUES
          ? CARACTERISTIQUES.filter((cle) => isFieldRelevant(cle, { type, contract: contrat }))
          : CLES_PAR_ETAPE[index];
      if (!(await trigger([...cles]))) {
        setRefus((n) => n + 1);
        return;
      }
    }
    setDirection(sens);
    setIndex(prochain);
  };

  /**
   * TCK-465 — le geste qui promet le plus, et qui ne mesurait rien.
   *
   * `flush()` rendait `Promise<void>` : on l'attendait, puis on quittait la page QUOI QU'IL
   * ARRIVE. Un 500 sur le PUT et l'utilisateur revenait sur un formulaire vide, sans avoir jamais
   * rien vu. On ne navigue donc plus que sur une écriture dont on a le résultat.
   *
   * ⚠ `ecrit: false` n'est PAS un échec : il n'y avait simplement rien de neuf à envoyer, l'état
   * connu du serveur est déjà à jour, et le hook le distingue d'un échec antérieur non rattrapé.
   */
  const reprendrePlusTard = async () => {
    setEchecReprise(false);
    const issue = await viderFileBrouillon();
    if (!issue.ok) {
      setEchecReprise(true);
      return;
    }
    router.push('/app/properties');
  };

  /**
   * TCK-2601 — « Publier », connecté : ce qui manque pour publier se complète dans la feuille de compte
   * (`manquesDeLaFeuille` : prénom, nom, numéro vérifié, réponse WhatsApp), et seulement cela ; rien à
   * compléter → les écritures partent directement. Un formulaire invalide ne l'ouvre pas : la
   * soumission montre ses erreurs, comme avant. La proposition d'un bailleur (TCK-587) ne publie pas,
   * et l'assistant sans compte remet l'annonce à sa page.
   */
  // Le contact du bien est son auteur, sauf bailleur désigné (`TitulaireALaSaisie`,
  // `PrimaryPropertyContact`) : la feuille ne juge que l'auteur. Sans compte lu (`useAuth` hors
  // fournisseur), elle ne juge rien — l'API reste juge, comme avant.
  const refusDuServeur = manquants ? { manquants, contactEstSoi } : null;
  const manquesFeuille = user && bailleurId === null ? manquesDeLaFeuille(user, refusDuServeur) : [];
  const autreContact = manquants !== null && !contactEstSoi && manquants.some((m) => m !== 'terms');
  const ouvrirFeuille = (sansCompte: boolean) =>
    setFeuille((f) => ({ cle: f.cle + 1, ouverte: true, apresRefus: false, sansCompte }));

  /** TCK-2601 — sans compte, la session ouverte : l'espace d'abord, puis les écritures d'aujourd'hui. */
  const publierEnPlace = async () => {
    if (!anonyme) return handleSubmit();
    setAvertissement(null);
    setPreparation(true);
    try {
      const espace = await anonyme.preparerLEspace(form.getValues() as Partial<PropertyFormValues>, index);
      if (espace === 'pret') {
        ecrireVraiment.current = true;
        await handleSubmit();
      } else if (espace !== 'ailleurs') {
        setAvertissement(espace.erreur);
      }
    } finally {
      setPreparation(false);
    }
  };

  const publier = async () => {
    if (proposition) return handleSubmit();
    if (anonyme && !user) {
      // Connexion par numéro éteinte : la page mène à la connexion, le brouillon restant ici.
      if (!anonyme.entreeParTelephone || !(await trigger())) return handleSubmit();
      ouvrirFeuille(true);
      return;
    }
    if (manquesFeuille.length === 0 && !autreContact) return anonyme ? publierEnPlace() : handleSubmit();
    if (!(await trigger())) return handleSubmit();
    ouvrirFeuille(false);
  };

  const etapes: WizardStepDef[] = [
    {
      id: 'bien',
      part: PARTIE_PAR_ETAPE[0],
      accueil: anonyme !== undefined,
      // TCK-2600 — sans compte, la première question est le départ : « Publiez votre bien gratuitement ».
      title: anonyme ? anonyme.depart.titre : t('steps.bien.title'),
      subtitle: anonyme ? anonyme.depart.sousTitre : t('steps.bien.subtitle'),
      body: (
        <>
          {anonyme?.depart.dessus ?? null}
          <StepBien form={form} />
          {anonyme ? anonyme.depart.dessous : null}
          {agenceDuChoixDuBailleur !== null ? (
            <ChoixDuBailleur
              agencyId={agenceDuChoixDuBailleur}
              valeur={bailleurId}
              onChange={setBailleurId}
              peutInviter={peutInviterUnBailleur}
              invite={bailleurInvite}
              onInvite={setBailleurInvite}
            />
          ) : null}
        </>
      ),
      canAdvance: Boolean(type && contrat),
    },
    {
      id: 'lieu',
      part: PARTIE_PAR_ETAPE[1],
      title: t('steps.lieu.title'),
      subtitle: t('steps.lieu.subtitle'),
      body: <StepLieu form={form} refus={refus} />,
    },
    {
      id: 'caracteristiques',
      part: PARTIE_PAR_ETAPE[2],
      // « Parlez-nous du terrain », « … de la maison » : c'est le VOCABULAIRE qui porte l'article,
      // pas le gabarit. Un `{type}` en minuscule suivi d'un article écrit dans la phrase
      // produirait « du maison » une fois sur deux en français — d'où `typeArticle` et non un
      // simple nom en minuscule. Le vocabulaire est adressé via `PROPERTY_ENUM_NAMESPACES.typeArticle`
      // et son propre traducteur, jamais par un chemin de clé composé à la main (TCK-464).
      // Le repli sur `other` n'est pas décoratif : l'objet `etapes` est construit à CHAQUE rendu,
      // y compris à l'étape 1 où aucun type n'est encore choisi. `typeArticle.undefined`
      // n'existant pas, `surErreurIntl` lèverait hors production — sur une étape que l'utilisateur
      // ne peut de toute façon pas atteindre sans avoir répondu.
      title: t('steps.caracteristiques.title', {
        type: tTypeArticle(type ?? 'other'),
      }),
      subtitle: t(
        isFieldRelevant('bedrooms', { type, contract: contrat })
          ? 'steps.caracteristiques.subtitle'
          : 'steps.caracteristiques.subtitleShort',
      ),
      body: <StepCaracteristiques form={form} tags={tags} />,
    },
    {
      id: 'prix',
      part: PARTIE_PAR_ETAPE[3],
      title: t('steps.prix.title'),
      subtitle: t(contrat === 'rent' ? 'steps.prix.subtitleRent' : 'steps.prix.subtitleSale'),
      body: <StepPrix form={form} fraisDAgence={fraisDAgence} />,
    },
    {
      id: 'photos',
      part: PARTIE_PAR_ETAPE[4],
      title: t('steps.photos.title'),
      subtitle: t('steps.photos.subtitle'),
      skippable: true,
      body: (
        <StepPhotos
          files={photos}
          onChange={(fichiers) => {
            setErreurPhotos(null);
            // TCK-2600 (ADR-0093 § 2) — sans compte, la photo entre au brouillon local DÉJÀ réduite.
            if (anonyme) void reduirePhotos(fichiers).then((reduites) => setPhotos((precedentes) => [...precedentes, ...reduites]));
            else setPhotos((precedentes) => [...precedentes, ...fichiers]);
          }}
          onRemove={(i) => setPhotos((precedentes) => precedentes.filter((_, k) => k !== i))}
          error={erreurPhotos}
        />
      ),
    },
    {
      id: 'finition',
      part: PARTIE_PAR_ETAPE[5],
      title: t('steps.finition.title'),
      subtitle: t('steps.finition.subtitle'),
      body: (
        <StepFinition form={form}>
          {proposition ? null : (
            <>
              <ContactsSurPlace valeur={contactsSurPlace} onChange={setContactsSurPlace} />
              {anonyme ? anonyme.finition : (
                <CoordonneesDeLAssistant numeroAVerifier={manquesFeuille.includes('verified_phone')} contactEstSoi={contactEstSoi} />
              )}
            </>
          )}
        </StepFinition>
      ),
    },
  ];

  // Le brouillon arrive APRÈS le montage. Rendre l'étape 1 puis sauter à l'étape 4 sous les yeux
  // de l'utilisateur serait un défaut visible ; l'attente, elle, est annoncée.
  if (brouillon.isLoading) {
    return (
      <div
        role="status"
        aria-label={t('loadingDraft')}
        className="flex h-full min-h-0 items-center justify-center py-16"
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      </div>
    );
  }

  /** Les six étapes, nommées court, pour la liste « Pour publier » de l'aperçu. */
  const etapesDeListe = etapes.map((e) => ({
    id: e.id,
    libelle: t(`steps.${e.id}.short`),
    facultative: e.skippable,
  }));
  const listePourPublier = (apresGeste?: () => void) => (
    <ListePourPublier
      etapes={etapesDeListe}
      // TCK-2601 — feuille de compte ouverte (sans compte) : tout est franchi, « Votre numéro » est en cours.
      index={feuille.ouverte && anonyme ? etapesDeListe.length : index}
      // TCK-2601 (AC5) — feuille ouverte, la liste ne mène nulle part : au bureau elle reste à côté
      // du panneau (le voile ne la couvre plus), et changer d'étape sous lui ferait verser ou publier
      // depuis une autre étape. « Revenir à l'annonce » est le chemin.
      desactivee={isSubmitting || feuille.ouverte}
      enPlus={anonyme?.pourPublierEnPlus}
      enPlusEnCours={feuille.ouverte && anonyme !== undefined}
      onRouvrir={(i) => {
        apresGeste?.();
        void naviguer(i, -1);
      }}
    />
  );
  const noteDeQuota = quotaNote ? (
    <p className="text-xs text-muted-foreground" data-testid="note-de-quota">{quotaNote}</p>
  ) : null;

  const enregistrement = brouillon.isSaving
    ? 'en-cours'
    : brouillon.draft && !brouillon.error
      ? 'enregistre'
      : 'aucun';

  const photosAilleurs = photosLocalesAbsentes && etatBrouillon === 'restaure';
  const aDesAlertes = Boolean(
    envoiPhotos || globalError || avertissement || echecReprise || brouillon.error || proposition || repriseAnnoncee || photosAilleurs,
  );

  return (
    <form
      noValidate
      className="flex h-full min-h-0 flex-col"
      /*
        TCK-468 — la PORTÉE de densité, posée une fois pour tout le parcours. Chaque `Input`,
        `SelectTrigger` et `DatePicker` rendu dessous passe à 44 px, la cible tactile que les
        pastilles de `ChoiceChips` tiennent déjà — sans qu'aucune étape n'ait à le redire, et
        donc sans qu'un champ ajouté demain puisse l'oublier. L'attribut est SPREADÉ sur le
        `<form>` existant : un `<div>` de plus casserait la chaîne `h-full min-h-0` de l'AC9.
      */
      {...fieldDensityScope()}
      /*
        ⚠ La soumission IMPLICITE — Entrée dans un champ — n'est pas neutre dans un parcours.
        À l'étape du prix, `price` est le SEUL champ qui la bloque au sens HTML, donc Entrée y
        déclenche la soumission ; et sur un brouillon repris, toutes les valeurs requises sont
        déjà là. Une frappe sur Entrée publierait alors le bien depuis le milieu du parcours,
        sans ses photos. On ne l'honore qu'à la dernière étape — la seule où elle veut dire ce
        que l'utilisateur croit qu'elle veut dire.
      */
      onSubmit={(e) => {
        e.preventDefault();
        // TCK-2601 (AC5) — au bureau, la feuille est un panneau DANS ce formulaire : Entrée dans son
        // numéro ne republie pas (ce qui remonterait la feuille par `cle` et viderait sa saisie).
        if (feuille.ouverte) return;
        if (index === etapes.length - 1) void publier();
      }}
    >
      <WizardShell
        steps={etapes}
        index={index}
        direction={direction}
        onNavigate={(prochain, sens) => void naviguer(prochain, sens)}
        onFinish={() => void publier()}
        finishLabel={proposition ? t('proposalFinish') : t('publish')}
        busy={isSubmitting}
        parts={[t('parts.bien'), t('parts.details'), t('parts.annonce')]}
        entete={anonyme ? undefined : (
          <EnTetePublication
            titre={proposition ? t('header.proposal') : t('header.publish')}
            enregistrement={enregistrement}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={() => void reprendrePlusTard()}
              >
                {t('resumeLater')}
              </Button>
            }
          />
        )}
        apercu={
          <>
            {/* TCK-2819 — la colonne : la photo en 16/9 (maquette `CarteApercu compact`). */}
            <CarteApercu form={form} photos={photos} compact />
            {listePourPublier()}
            {noteDeQuota}
          </>
        }
        barreApercu={
          <BarreApercu form={form} photos={photos}>
            {(fermer) => (
              <>
                {listePourPublier(fermer)}
                {noteDeQuota}
              </>
            )}
          </BarreApercu>
        }
        // TCK-2601 (AC5) — dès 1280 px, la feuille de compte prend la place de l'étape.
        refDuPanneau={setCibleDuPanneau}
        panneauOuvert={!proposition && feuille.ouverte}
        // TCK-2600 — sans compte (`/publish`), le cadre des écrans d'entrée dès `lg` (maquette a-0 à a-5).
        cadreDEntree={anonyme !== undefined}
        noteDuPied={anonyme?.noteDuPied?.(etapes[index].id)}
        bandeau={aDesAlertes ? (
          <>
            {envoiPhotos ? (
              <p role="status" className="mb-4 text-sm text-muted-foreground">
                {t('photosProgress', { sent: envoiPhotos.rang, total: envoiPhotos.total })}
              </p>
            ) : null}
            <FormGlobalError>
              {globalError ? (
                <span className="flex items-center justify-between gap-4">
                  <span>{globalError}</span>
                  <button type="button" onClick={clearGlobalError} className="text-xs underline">
                    {t('close')}
                  </button>
                </span>
              ) : null}
            </FormGlobalError>

            {avertissement ? (
              <div
                role="alert"
                className="mb-4 flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
              >
                <span>{avertissement}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => {
                    if (idCree !== null) void terminer(idCree);
                  }}
                >
                  {echecPublication ? t('publishFailedOpen') : t('partial.continueAnyway')}
                </Button>
              </div>
            ) : null}

            {echecReprise ? (
              <div
                role="alert"
                className="mb-4 flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
              >
                <span>{t('draftSaveFailed')}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void reprendrePlusTard()}
                >
                  {t('draftSaveRetry')}
                </Button>
              </div>
            ) : null}

            {/*
              L'autosave, lui, est silencieux par construction — c'est ce qui le rend agréable et
              c'est ce qui le rend dangereux. Tant qu'il échoue, la ligne reste : elle ne promet
              rien, elle dit seulement ce qu'on sait. `echecReprise` la remplace le cas échéant,
              pour ne pas dire deux fois la même chose.
            */}
            {!echecReprise && brouillon.error ? (
              <p role="status" className="mb-4 text-sm text-destructive">
                {t('draftAutosaveFailed')}
              </p>
            ) : null}

            {proposition ? (
              <p
                role="note"
                className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-pretty text-muted-foreground"
                data-testid="property-proposal-notice"
              >
                {t('proposalNotice')}
              </p>
            ) : null}

            {repriseAnnoncee ? (
              <p role="status" className="mb-4 text-sm text-muted-foreground">
                {t('draftResumed')}
              </p>
            ) : null}

            {photosAilleurs ? (
              <p role="status" className="mb-4 text-sm text-muted-foreground" data-testid="photos-ailleurs">
                {t('feuille.photosAilleurs')}
              </p>
            ) : null}
          </>
        ) : null}
      />
      {/* La feuille est portée hors du formulaire dans le DOM, et ne porte aucun formulaire. */}
      {proposition ? null : feuille.sansCompte ? (
        <FeuilleSansCompte
          key={feuille.cle}
          ouverte={feuille.ouverte}
          cible={cibleDuPanneau}
          onFermer={() => setFeuille((f) => ({ ...f, ouverte: false }))}
          rappel={<RappelDeLAnnonce form={form} photos={photos} pret={t('feuille.pret')} />}
          envoi={isSubmitting || preparation}
          alerte={alerteGoogle}
          avantLeDepartGoogle={
            anonyme?.google?.durable
              ? async () => {
                  // TCK-2777 — l'annonce part de la page : son état d'à l'instant, écrit ICI, à l'étape 6.
                  sauverBrouillon(index, form.getValues() as Partial<PropertyFormValues>);
                  return (await viderFileBrouillon()).ok;
                }
              : undefined
          }
          onEmail={() => {
            setFeuille((f) => ({ ...f, ouverte: false }));
            void handleSubmit();
          }}
          onPublier={async () => {
            const cle = feuille.cle;
            await publierEnPlace();
            setFeuille((f) => (f.cle === cle ? { ...f, ouverte: false } : f));
          }}
        />
      ) : (
        <FeuilleDePublication
          key={feuille.cle}
          ouverte={feuille.ouverte}
          cible={cibleDuPanneau}
          onFermer={() => setFeuille((f) => ({ ...f, ouverte: false }))}
          manques={manquesFeuille}
          autreContact={autreContact}
          alerte={feuille.apresRefus ? t('feuille.incomplet') : null}
          rappel={<RappelDeLAnnonce form={form} photos={photos} pret={t('feuille.pret')} />}
          envoi={isSubmitting || preparation}
          // Le compte relu après le code fait foi : ce que l'API disait manquer ne se redemande plus.
          onCompteRelu={() => setManquants(null)}
          onPublier={async () => {
            const cle = feuille.cle;
            await (anonyme ? publierEnPlace() : handleSubmit());
            // Refermée après les écritures, sauf si un refus l'a rouverte entre-temps (`cle` a changé).
            setFeuille((f) => (f.cle === cle ? { ...f, ouverte: false } : f));
          }}
        />
      )}
    </form>
  );
}
