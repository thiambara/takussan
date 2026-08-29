'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FormGlobalError } from '@/components/forms';
import { fieldDensityScope } from '@/components/ui/field-density';
import { useApiForm } from '@/hooks/useApiForm';
import { useGeoSuggestion } from '@/hooks/useGeoSuggestion';
import { useWizardDraft } from '@/hooks/useWizardDraft';
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
import { toCreatePayload } from './payload';
import { WizardShell, type WizardStepDef } from './wizard/WizardShell';
import { StepBien } from './wizard/steps/StepBien';
import { StepLieu } from './wizard/steps/StepLieu';
import { StepCaracteristiques } from './wizard/steps/StepCaracteristiques';
import { StepPrix } from './wizard/steps/StepPrix';
import { StepPhotos } from './wizard/steps/StepPhotos';
import { StepFinition } from './wizard/steps/StepFinition';

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
  ['price', 'currency', 'rent_period', 'available_from'],
  [],
  ['title', 'description'],
];

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
];

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
    country: '',
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
    available_from: undefined,
    description: '',
    tag_ids: [],
  };
}

/**
 * Où en est la reprise du brouillon serveur. Trois états et non un booléen : « on n'a pas encore
 * la réponse » et « la réponse est : aucun brouillon » gouvernent des choses différentes — le
 * second autorise la géo-IP à poser ses valeurs par défaut, le premier doit l'en empêcher.
 */
type EtatBrouillon = 'attente' | 'vide' | 'restaure';

export function PropertyWizard({ tags = [] }: { readonly tags?: Tag[] }) {
  const t = useTranslations('property.wizard');
  const tTypeArticle = useTranslations(PROPERTY_ENUM_NAMESPACES.typeArticle);
  const router = useRouter();
  const { defaults, loading: geoEnCours } = useGeoSuggestion();
  const brouillon = useWizardDraft<Partial<PropertyFormValues>>(CLE_BROUILLON);
  const { save: sauverBrouillon, flush: viderFileBrouillon, clear: effacerBrouillon } = brouillon;

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [photos, setPhotos] = useState<File[]>([]);
  const [erreurPhotos, setErreurPhotos] = useState<string | null>(null);
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
  const [photosEnvoyees, setPhotosEnvoyees] = useState(false);

  /** La sortie nominale : le brouillon n'a plus lieu d'être, le bien s'ouvre. */
  const terminer = async (id: number) => {
    await effacerBrouillon();
    router.push(`/app/properties/${id}`);
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
      // Un bien déjà créé n'est JAMAIS recréé : une reprise après échec partiel rejoue les
      // écritures manquantes, pas la création. C'est l'AC7.
      if (idCree !== null) return { id: idCree } as PropertyDetail;

      const resultat = await createPropertyAction(
        toCreatePayload(values as unknown as PropertyFormPayload, 'submit'),
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
      if (!bien?.id) throw new ApiError(500, { message: t('missingId') });
      setIdCree(bien.id);

      const valeurs = form.getValues() as unknown as PropertyFormPayload;
      const echecs: string[] = [];

      if (valeurs.tag_ids?.length && !tagsEnvoyes) {
        const r = await setPropertyTagsAction(bien.id, valeurs.tag_ids);
        if (r.ok) setTagsEnvoyes(true);
        else echecs.push(t('partial.tags'));
      }

      if (photos.length > 0 && !photosEnvoyees) {
        const formData = new FormData();
        for (const fichier of photos) formData.append('photos', fichier);
        const r = await uploadPropertyPhotosAction(bien.id, formData);
        if (r.ok) {
          setPhotosEnvoyees(true);
          setErreurPhotos(null);
        } else {
          echecs.push(t('partial.photos'));
          // Le message va AUSSI sur l'étape des photos : c'est là que l'utilisateur revient pour
          // retirer le fichier fautif, et un avertissement resté sur la dernière étape ne l'y
          // suivrait pas. Sans cette ligne, la prop `error` de `StepPhotos` ne vaudrait jamais
          // autre chose que `null`.
          setErreurPhotos(r.message);
        }
      }

      // Un échec ici n'est PAS un échec de création : le dire autrement enverrait l'utilisateur
      // recommencer, et créer un doublon. On ne quitte donc pas la page, on ne vide pas le
      // brouillon, et on offre les deux issues qui existent réellement.
      if (echecs.length > 0) {
        setAvertissement(t('partial.message', { items: echecs.join(', ') }));
        return;
      }

      await terminer(bien.id);
    },
  });

  const { watch, setValue, trigger, reset } = form;
  const type = watch('type');
  const contrat = watch('contract_type');

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
      if (etape > 0 && etape < CLES_PAR_ETAPE.length) {
        setDirection(1);
        setIndex(etape);
      }
      setRepriseAnnoncee(true);
      setEtatBrouillon('restaure');
    } else {
      setEtatBrouillon('vide');
    }
  }

  /**
   * L'écriture, elle, est bien un effet : `reset` pousse dans react-hook-form, système extérieur
   * à React — et l'appeler pendant le rendu mettrait à jour les `Controller` enfants au milieu du
   * nôtre.
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
  useEffect(() => {
    if (etatBrouillon !== 'restaure' || brouillonApplique.current) return;
    brouillonApplique.current = true;
    const donnees = brouillon.draft?.data;
    if (donnees) reset({ ...valeursInitiales(), ...donnees } as PropertyFormValues);
  }, [etatBrouillon, brouillon.draft, reset]);

  /**
   * Le CERTAIN de la géo-IP, posé d'office et UNE SEULE FOIS : le pays et la devise. La ville et
   * la région, elles, restent à la suggestion, qui s'accepte d'un geste (AC6) — la géo-IP dit où
   * est l'utilisateur, pas où est le bien.
   *
   * C'est ce que promet la note de l'étape 1 (`geoDefaultsNote`) ; sans cet effet, elle mentirait.
   *
   * ⚠ Le garde-fou n'est pas décoratif. `UserLocationProvider` peut livrer la localisation APRÈS
   * le premier rendu : sans lui, une devise arrivée en retard écraserait celle que l'utilisateur
   * vient de choisir à l'étape du prix. Et sur un brouillon repris, on ne pose plus rien du tout —
   * ses valeurs sont celles d'une session où l'utilisateur avait déjà la main.
   */
  const geoPosee = useRef(false);
  useEffect(() => {
    if (geoPosee.current || geoEnCours || etatBrouillon === 'attente') return;
    geoPosee.current = true;
    if (etatBrouillon === 'restaure') return;
    if (defaults.country) setValue('country', defaults.country, { shouldDirty: true });
    if (defaults.currency) setValue('currency', defaults.currency, { shouldDirty: true });
  }, [defaults.country, defaults.currency, geoEnCours, etatBrouillon, setValue]);

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

  const naviguer = async (prochain: number, sens: 1 | -1) => {
    setRepriseAnnoncee(false);
    if (sens > 0) {
      const cles =
        index === ETAPE_CARACTERISTIQUES
          ? CARACTERISTIQUES.filter((cle) => isFieldRelevant(cle, { type, contract: contrat }))
          : CLES_PAR_ETAPE[index];
      if (!(await trigger([...cles]))) return;
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

  const etapes: WizardStepDef[] = [
    {
      id: 'bien',
      title: t('steps.bien.title'),
      subtitle: t('steps.bien.subtitle'),
      body: <StepBien form={form} />,
      canAdvance: Boolean(type && contrat),
    },
    {
      id: 'lieu',
      title: t('steps.lieu.title'),
      subtitle: t('steps.lieu.subtitle'),
      body: <StepLieu form={form} />,
    },
    {
      id: 'caracteristiques',
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
      title: t('steps.prix.title'),
      subtitle: t(contrat === 'rent' ? 'steps.prix.subtitleRent' : 'steps.prix.subtitleSale'),
      body: <StepPrix form={form} />,
    },
    {
      id: 'photos',
      title: t('steps.photos.title'),
      subtitle: t('steps.photos.subtitle'),
      skippable: true,
      body: (
        <StepPhotos
          files={photos}
          onChange={(fichiers) => {
            setErreurPhotos(null);
            setPhotos((precedentes) => [...precedentes, ...fichiers]);
          }}
          onRemove={(i) => setPhotos((precedentes) => precedentes.filter((_, k) => k !== i))}
          error={erreurPhotos}
        />
      ),
    },
    {
      id: 'finition',
      title: t('steps.finition.title'),
      subtitle: t('steps.finition.subtitle'),
      body: <StepFinition form={form} />,
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
        if (index === etapes.length - 1) void handleSubmit();
      }}
    >
      <div className="shrink-0">
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
              {t('partial.continueAnyway')}
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
          L'autosave, lui, est silencieux par construction — c'est ce qui le rend agréable et c'est
          ce qui le rend dangereux. Tant qu'il échoue, la ligne reste : elle ne promet rien, elle
          dit seulement ce qu'on sait. `echecReprise` la remplace le cas échéant, pour ne pas dire
          deux fois la même chose.
        */}
        {!echecReprise && brouillon.error ? (
          <p role="status" className="mb-4 text-sm text-destructive">
            {t('draftAutosaveFailed')}
          </p>
        ) : null}

        {repriseAnnoncee ? (
          <p role="status" className="mb-4 text-sm text-muted-foreground">
            {t('draftResumed')}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <WizardShell
          steps={etapes}
          index={index}
          direction={direction}
          onNavigate={(prochain, sens) => void naviguer(prochain, sens)}
          onFinish={() => void handleSubmit()}
          finishLabel={t('publish')}
          busy={isSubmitting}
          footerExtra={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
              onClick={() => void reprendrePlusTard()}
            >
              {t('resumeLater')}
            </Button>
          }
        />
      </div>
    </form>
  );
}
