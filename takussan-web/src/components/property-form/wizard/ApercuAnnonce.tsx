'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { Check, Eye, ImageIcon, MapPin } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { cn } from '@/lib/utils';

import { isFieldRelevant } from '../field-matrix';
import { PROPERTY_ENUM_NAMESPACES } from '../options';
import { useCoutDEntree } from './EncadreCoutDEntree';
import { suggestTitle } from './suggest-title';

/**
 * TCK-631 (piste 6) — l'annonce telle qu'elle se construit, à côté des questions.
 *
 * La carte reprend le gabarit de `PropertyCardStandard` (TCK-2819 : celui de la maquette) — photo, pastille du contrat,
 * titre, lieu, chiffres, prix et sa période — avec ce que le formulaire sait DÉJÀ. Ce qui manque
 * se dit (« Lieu à venir ») plutôt que de laisser un trou : une carte vide ressemble à une panne.
 *
 * Le titre est celui que l'utilisateur a écrit, sinon celui que la dernière étape lui proposera
 * (`suggestTitle`) : la carte montre dès l'étape 1 ce qu'elle deviendra.
 *
 * Le coût d'entrée : la carte n'en dit que le TOTAL indicatif, « À l’entrée : … » (maquette `CarteApercu`,
 * TCK-2819 lot 2). Ses composantes et la note « l'annonce publiée fait foi » (TCK-633) vivent dans
 * l'encadré de l'étape du prix (`EncadreCoutDEntree`), qui calcule par le même `useCoutDEntree` :
 * `coutDEntreeTotal` (`lib/cout-d-entree.ts`), jumelle de `CoutDEntree` côté API, jugées par la même
 * fixture (tâche 17). La règle de TCK-598 (« aucun écran ne refait l'addition ») est levée pour
 * l'assistant SEUL, avant que le bien existe ; la fiche publiée lit toujours le total de l'API.
 *
 * ⚠ Toutes les lectures passent par `useWatch` (TCK-564) : un `watch()` lu pendant le rendu se
 * figeait une fois compilé.
 */

type Contrat = PropertyFormValues['contract_type'];

interface DonneesApercu {
  readonly type: PropertyFormValues['type'] | undefined;
  readonly contrat: Contrat | undefined;
  readonly titre: string;
  /** TCK-2819 — le titre ÉCRIT (ou posé par la finition), sans repli sur le titre proposé. */
  readonly titreSaisi: string;
  /** TCK-2819 — le type, traduit (« Studio ») ; vide avant la première réponse. */
  readonly typeLibelle: string;
  /** TCK-2819 — le quartier, sinon la ville : le lieu court du résumé (« Mermoz »). */
  readonly lieuCourt: string;
  readonly lieu: string;
  readonly chiffres: readonly string[];
  readonly prix: string | null;
  readonly periode: string | null;
  /** TCK-633 — le total à l'entrée, mis en forme ; `null` sans composante ou à zéro. */
  readonly totalDEntree: string | null;
}

function useDonneesApercu(form: UseFormReturn<PropertyFormValues>): DonneesApercu {
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tPeriode = useTranslations('property.rentPeriodsShort');
  const tCarte = useTranslations('property.cards');
  const t = useTranslations('property.wizard');
  const fmt = useFormatteurs();
  const [
    type, contrat, ville, quartier, surface, chambres, sallesDeBain, meuble, prix, devise, periode,
    titreSaisi,
  ] = useWatch({
    control: form.control,
    name: [
      'type', 'contract_type', 'city', 'quarter', 'area', 'bedrooms', 'bathrooms', 'furnished',
      'price', 'currency', 'rent_period', 'title',
    ],
  });

  const ctx = { type, contract: contrat, rentPeriod: periode } as const;
  const nombre = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;

  const titre =
    titreSaisi?.trim() ||
    (type
      ? suggestTitle(
          {
            type,
            contract: contrat,
            area: nombre(surface),
            bedrooms: nombre(chambres),
            quarter: quartier,
            city: ville,
          },
          tType,
          t,
        )
      : '');

  const chiffres: string[] = [];
  if (isFieldRelevant('bedrooms', ctx) && nombre(chambres)) {
    chiffres.push(tCarte('bedroomsShort', { count: nombre(chambres)! }));
  }
  if (isFieldRelevant('bathrooms', ctx) && nombre(sallesDeBain)) {
    chiffres.push(tCarte('bathroomsShort', { count: nombre(sallesDeBain)! }));
  }
  if (nombre(surface)) chiffres.push(`${nombre(surface)} m²`);
  if (isFieldRelevant('furnished', ctx) && meuble) chiffres.push(t('fields.furnished'));

  // La période ne se dit que là où la matrice la demande — une vente n'a pas de « / mois ». Une
  // location sans période EST mensuelle (l'invariant de `Property::booted()`, côté API) : un loyer
  // porte toujours sa période.
  const periodeAffichee = isFieldRelevant('rent_period', ctx) ? tPeriode(periode ?? 'monthly') : null;

  const entree = useCoutDEntree(form);

  return {
    type,
    contrat,
    titre,
    titreSaisi: titreSaisi?.trim() ?? '',
    typeLibelle: type ? tType(type) : '',
    lieuCourt: quartier?.trim() || ville?.trim() || '',
    lieu: [quartier?.trim(), ville?.trim()].filter(Boolean).join(', '),
    chiffres,
    prix: nombre(prix) ? fmt.montant(nombre(prix)!, devise) : null,
    periode: periodeAffichee,
    totalDEntree: entree.total,
  };
}

/**
 * La vignette d'un fichier choisi, sans état : l'URL est posée sur l'élément par l'effet, et
 * révoquée avec lui. Un `setState` dans l'effet serait refusé (`react-hooks/set-state-in-effect`),
 * et jsdom ne connaît pas `URL.createObjectURL` — d'où la garde.
 */
export function VignetteFichier({ fichier }: { readonly fichier: File }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!image.current || typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(fichier);
    image.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [fichier]);
  // eslint-disable-next-line @next/next/no-img-element -- une URL `blob:` locale : rien à optimiser.
  return <img ref={image} alt="" className="size-full object-cover" />;
}

/**
 * TCK-2601 — l'annonce en une ligne, en tête de la feuille de compte (maquette a-6 / a-7, `RappelAnnonce`) :
 * sur un aplat `secondary`, la vignette de 48 px, le titre, « prix /période · prête à publier », et la
 * pastille cochée à droite. Mêmes données que la carte (`useDonneesApercu`).
 */
export function RappelDeLAnnonce({
  form,
  photos,
  pret,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly photos: readonly File[];
  /** « prête à publier », écrit à la suite du prix. */
  readonly pret: string;
}) {
  const t = useTranslations('property.wizard.preview');
  const d = useDonneesApercu(form);
  const prix = d.prix ? `${d.prix}${d.periode ? ` /${d.periode}` : ''}` : null;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-secondary/70 p-2.5" data-testid="rappel-de-l-annonce">
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {photos[0] ? <VignetteFichier fichier={photos[0]} /> : <ImageIcon className="size-5" strokeWidth={1.5} aria-hidden="true" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-corps font-semibold text-foreground">{d.titre || t('empty')}</span>
        <span className="mt-0.5 truncate text-ui text-muted-foreground tabular-nums">{prix ? `${prix} · ${pret}` : pret}</span>
      </span>
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
      </span>
    </div>
  );
}

/**
 * La carte de l'annonce. TCK-2819 — la `CarteApercu` de la maquette `app-entree-publier` : la photo à
 * fond perdu (16/9 dans la colonne, `compact` ; 4/3 dans le tiroir), la pastille du contrat, le titre,
 * le lieu, les chiffres, le prix et sa période, puis ce que le locataire verse à l'entrée.
 */
export function CarteApercu({
  form,
  photos,
  compact = false,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly photos: readonly File[];
  /** La colonne collante du bureau doit tenir dans la hauteur : la photo y passe en 16/9. */
  readonly compact?: boolean;
}) {
  const t = useTranslations('property.wizard.preview');
  const tContrat = useTranslations('property.contractTypes');
  const d = useDonneesApercu(form);
  const premiere = photos[0];

  return (
    <div data-testid="apercu-annonce" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className={cn('relative bg-muted', compact ? 'aspect-video' : 'aspect-[4/3]')}>
        {premiere ? (
          <VignetteFichier fichier={premiere} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon className="size-7" strokeWidth={1.25} aria-hidden="true" />
            <span className="text-sm">{t('photoLater')}</span>
          </div>
        )}
        {d.contrat ? (
          <span className="absolute top-3 left-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-card px-2.5 text-xs font-semibold text-foreground">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            {tContrat(d.contrat === 'sale' ? 'saleLong' : 'rentLong')}
          </span>
        ) : null}
        {photos.length > 0 ? (
          <span className="absolute right-3 bottom-3 rounded-full bg-foreground/70 px-2 py-0.5 text-xs font-medium text-background tabular-nums">
            {t('photoCount', { current: 1, total: photos.length })}
          </span>
        ) : null}
      </div>

      <div className="p-4">
        <p className={cn('font-display text-titre-court leading-snug text-pretty', d.titre ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
          {d.titre || t('empty')}
        </p>
        <p className={cn('mt-1 flex items-center gap-1 text-sm', d.lieu ? 'text-foreground' : 'text-muted-foreground')}>
          <MapPin className="size-3.5 flex-none" aria-hidden="true" />
          {d.lieu || t('placeLater')}
        </p>
        {/* Maquette : les chiffres tant qu'il n'y a pas de prix (a-2), le prix et l'entrée ensuite (a-3 à a-5) —
            la règle du résumé du téléphone (`BarreApercu`). La colonne garde ainsi sa hauteur. */}
        {d.chiffres.length > 0 && !d.prix ? <p className="mt-1 text-ui text-muted-foreground">{d.chiffres.join(' · ')}</p> : null}
        <p
          className={cn('mt-2.5 font-display tabular-nums', d.prix ? 'text-xl font-semibold text-primary-deep' : 'text-base text-muted-foreground')}
          data-testid="apercu-prix"
        >
          {d.prix ? `${d.prix}${d.periode ? ` / ${d.periode}` : ''}` : t('priceLater')}
        </p>
        {d.totalDEntree ? (
          <p className="mt-0.5 text-ui text-muted-foreground tabular-nums" data-testid="apercu-total-entree">
            {t('entryLine', { amount: d.totalDEntree })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export interface EtapeDeListe {
  readonly id: string;
  readonly libelle: string;
  readonly facultative?: boolean;
}

/**
 * « Pour publier » : les six étapes, franchies, courante ou à venir. Une étape franchie se
 * rouvre d'un geste — le rôle que tenait le rail d'étapes, dont cette liste prend la place.
 */
export function ListePourPublier({
  etapes,
  index,
  onRouvrir,
  desactivee = false,
  enPlus,
  enPlusEnCours = false,
}: {
  readonly etapes: readonly EtapeDeListe[];
  readonly index: number;
  readonly onRouvrir: (index: number) => void;
  readonly desactivee?: boolean;
  /** TCK-2600 — une dernière ligne, hors des étapes : « Votre numéro · à la fin » (sans compte). */
  readonly enPlus?: { readonly libelle: string; readonly note: string };
  /**
   * TCK-2601 — la feuille de compte est ouverte : toutes les étapes sont franchies et la ligne en plus
   * (« Votre numéro ») est l'étape en cours (maquette a-6 / a-7, « Pour publier » du bureau).
   */
  readonly enPlusEnCours?: boolean;
}) {
  const t = useTranslations('property.wizard');

  /** La puce de la maquette (`PourPublier`) : cochée sur `accent`, pointée en cours, cerclée à venir. */
  const puce = (franchie: boolean, courante: boolean) => (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-5 flex-none items-center justify-center rounded-full',
        franchie && 'bg-accent text-accent-foreground',
        courante && 'border-[1.5px] border-primary',
        !franchie && !courante && 'border-[1.5px] border-border',
      )}
    >
      {franchie ? <Check className="size-3" strokeWidth={3} /> : courante ? <span className="size-2 rounded-full bg-primary" /> : null}
    </span>
  );
  /** La note alignée à droite : « en cours » en `primary`, les autres en encre douce. */
  const note = (texte: string | null, enCours: boolean) =>
    texte ? <span className={cn('flex-none text-ui', enCours ? 'font-medium text-primary' : 'text-muted-foreground')}>{texte}</span> : null;

  return (
    <nav aria-label={t('railLabel')} className="rounded-xl border border-border bg-card p-4">
      <p className="text-corps font-semibold text-foreground">{t('preview.checklist')}</p>
      <ol className="mt-2.5 space-y-0.5">
        {etapes.map((e, i) => {
          const franchie = i < index;
          const courante = i === index;
          const contenu = (
            <>
              {puce(franchie, courante)}
              <span className={cn('min-w-0 flex-1 truncate', !franchie && !courante && 'text-muted-foreground', courante && 'font-semibold')}>
                {e.libelle}
              </span>
              {note(courante ? t('preview.current') : !franchie && e.facultative ? t('preview.optional') : null, courante)}
            </>
          );
          return (
            <li key={e.id}>
              {franchie ? (
                <button
                  type="button"
                  disabled={desactivee}
                  onClick={() => onRouvrir(i)}
                  aria-label={t('preview.reopen', { step: e.libelle })}
                  className="-mx-1.5 flex h-8 w-[calc(100%+var(--spacing)*3)] items-center gap-3 rounded-md px-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {contenu}
                </button>
              ) : (
                <span aria-current={courante ? 'step' : undefined} className="flex h-8 items-center gap-3 text-sm text-foreground">
                  {contenu}
                </span>
              )}
            </li>
          );
        })}
        {enPlus ? (
          <li>
            <span aria-current={enPlusEnCours ? 'step' : undefined} className="flex h-8 items-center gap-3 text-sm text-foreground">
              {puce(false, enPlusEnCours)}
              <span className={cn('min-w-0 flex-1 truncate font-semibold', !enPlusEnCours && 'text-muted-foreground')}>{enPlus.libelle}</span>
              {note(enPlusEnCours ? t('preview.current') : enPlus.note, enPlusEnCours)}
            </span>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}

/**
 * Sous `lg`, l'aperçu tient dans une barre sous l'en-tête — le type, le lieu, le prix — et
 * s'ouvre en entier dans un tiroir. Plus de colonne : la largeur va à la question.
 */
export function BarreApercu({
  form,
  photos,
  children,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly photos: readonly File[];
  /**
   * Ce que le tiroir montre sous la carte — la liste « Pour publier ». Une fonction : un geste
   * dedans (rouvrir une étape) doit pouvoir REFERMER le tiroir, sans quoi l'étape rouverte se
   * charge derrière lui.
   */
  readonly children?: (fermer: () => void) => React.ReactNode;
}) {
  const t = useTranslations('property.wizard.preview');
  const tContrat = useTranslations('property.contractTypes');
  const d = useDonneesApercu(form);
  const [ouvert, setOuvert] = useState(false);

  // TCK-2819 — le `Resume` de la maquette : « Studio · En location · Mermoz » tant que l'annonce n'a pas
  // de titre écrit, puis son titre ; dessous, le prix et sa période, sinon les chiffres déjà donnés.
  const premiereLigne = d.titreSaisi
    ? d.titreSaisi
    : d.type
      ? [d.typeLibelle, d.contrat ? tContrat(d.contrat === 'sale' ? 'saleLong' : 'rentLong') : null, d.lieuCourt || null]
          .filter(Boolean)
          .join(' · ')
      : t('empty');
  const secondeLigne = d.prix
    ? `${d.prix}${d.periode ? ` / ${d.periode}` : ''}`
    : d.chiffres.length > 0
      ? d.chiffres.join(' · ')
      : d.type
        ? t('priceLater')
        : t('emptyHint');

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label={t('openLabel')}
        data-testid="barre-apercu"
        className="flex w-full shrink-0 items-center gap-3 border-b border-border bg-card py-2 pr-3 pl-4 text-left focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset sm:pr-5 sm:pl-6"
      >
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
          {photos[0] ? <VignetteFichier fichier={photos[0]} /> : <ImageIcon className="size-5" strokeWidth={1.5} aria-hidden="true" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-corps font-semibold text-foreground">{premiereLigne}</span>
          <span className="mt-0.5 truncate text-ui text-muted-foreground tabular-nums">{secondeLigne}</span>
        </span>
        <span className="inline-flex h-11 shrink-0 items-center gap-1.5 px-1 text-sm font-medium text-primary">
          <Eye className="size-4" aria-hidden="true" />
          {t('open')}
        </span>
      </button>
      <Sheet open={ouvert} onOpenChange={setOuvert}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="px-4 pt-4 sm:px-6">
            <SheetTitle>{t('label')}</SheetTitle>
            <SheetDescription>{t('hint')}</SheetDescription>
          </SheetHeader>
          <div className="mx-auto flex w-full max-w-md flex-col gap-4 overflow-y-auto px-4 pt-2 pb-[calc(var(--spacing)*6+env(safe-area-inset-bottom))] sm:px-6">
            <CarteApercu form={form} photos={photos} />
            {children?.(() => setOuvert(false))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
