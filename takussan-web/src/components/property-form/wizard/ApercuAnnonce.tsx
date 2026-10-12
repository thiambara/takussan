'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { Check, Eye, ImageIcon } from 'lucide-react';

import { ContractTypeChip } from '@/components/property/cards/ContractTypeChip';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { cn } from '@/lib/utils';

import { isFieldRelevant } from '../field-matrix';
import { PROPERTY_ENUM_NAMESPACES } from '../options';
import { suggestTitle } from './suggest-title';

/**
 * TCK-631 (piste 6) — l'annonce telle qu'elle se construit, à côté des questions.
 *
 * La carte reprend le gabarit de `PropertyCardStandard` — photo carrée, pastille du contrat,
 * titre, lieu, chiffres, prix et sa période — avec ce que le formulaire sait DÉJÀ. Ce qui manque
 * se dit (« Lieu à venir ») plutôt que de laisser un trou : une carte vide ressemble à une panne.
 *
 * Le titre est celui que l'utilisateur a écrit, sinon celui que la dernière étape lui proposera
 * (`suggestTitle`) : la carte montre dès l'étape 1 ce qu'elle deviendra.
 *
 * ⚠ **Le coût d'entrée n'est PAS additionné ici.** La formule et son arrondi n'existent qu'à un
 * endroit, côté API (`CoutDEntree`, TCK-598 : « aucun écran ne refait l'addition ») ; l'aperçu en
 * liste les composantes et renvoie le total à l'annonce publiée. Un second calcul finirait par
 * afficher un montant que la fiche contredit.
 *
 * ⚠ Toutes les lectures passent par `useWatch` (TCK-564) : un `watch()` lu pendant le rendu se
 * figeait une fois compilé.
 */

type Contrat = PropertyFormValues['contract_type'];

interface DonneesApercu {
  readonly type: PropertyFormValues['type'] | undefined;
  readonly contrat: Contrat | undefined;
  readonly titre: string;
  readonly lieu: string;
  readonly chiffres: readonly string[];
  readonly prix: string | null;
  readonly periode: string | null;
  readonly coutDEntree: readonly string[];
}

function useDonneesApercu(form: UseFormReturn<PropertyFormValues>): DonneesApercu {
  const tType = useTranslations(PROPERTY_ENUM_NAMESPACES.type);
  const tPeriode = useTranslations('property.rentPeriodsShort');
  const tCarte = useTranslations('property.cards');
  const t = useTranslations('property.wizard');
  const fmt = useFormatteurs();
  const [
    type, contrat, ville, quartier, surface, chambres, sallesDeBain, meuble, prix, devise, periode,
    titreSaisi, avance, caution, frais, charges,
  ] = useWatch({
    control: form.control,
    name: [
      'type', 'contract_type', 'city', 'quarter', 'area', 'bedrooms', 'bathrooms', 'furnished',
      'price', 'currency', 'rent_period', 'title', 'advance_months', 'deposit_months',
      'agency_fee_months', 'monthly_charges',
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

  const coutDEntree: string[] = [];
  if (isFieldRelevant('deposit_months', ctx)) {
    if (nombre(avance)) coutDEntree.push(t('preview.entryAdvance', { count: nombre(avance)! }));
    if (nombre(caution)) coutDEntree.push(t('preview.entryDeposit', { count: nombre(caution)! }));
    if (nombre(frais)) coutDEntree.push(t('preview.entryFee', { count: nombre(frais)! }));
    if (nombre(charges)) {
      coutDEntree.push(t('preview.entryCharges', { amount: fmt.montant(nombre(charges)!, devise) }));
    }
  }

  return {
    type,
    contrat,
    titre,
    lieu: [quartier?.trim(), ville?.trim()].filter(Boolean).join(', '),
    chiffres,
    prix: nombre(prix) ? fmt.montant(nombre(prix)!, devise) : null,
    periode: periodeAffichee,
    coutDEntree,
  };
}

/**
 * La vignette d'un fichier choisi, sans état : l'URL est posée sur l'élément par l'effet, et
 * révoquée avec lui. Un `setState` dans l'effet serait refusé (`react-hooks/set-state-in-effect`),
 * et jsdom ne connaît pas `URL.createObjectURL` — d'où la garde.
 */
function VignetteFichier({ fichier }: { readonly fichier: File }) {
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

function AVenir({ children }: { readonly children: React.ReactNode }) {
  return <span className="rounded-md bg-muted px-1.5 text-muted-foreground">{children}</span>;
}

/** La carte de l'annonce, au gabarit de `PropertyCardStandard`. */
export function CarteApercu({
  form,
  photos,
}: {
  readonly form: UseFormReturn<PropertyFormValues>;
  readonly photos: readonly File[];
}) {
  const t = useTranslations('property.wizard.preview');
  const d = useDonneesApercu(form);
  const premiere = photos[0];

  return (
    <div data-testid="apercu-annonce" className="rounded-2xl border border-border bg-card p-3 shadow-[0_8px_24px_color-mix(in_srgb,var(--foreground)_8%,transparent)]">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
        {premiere ? (
          <VignetteFichier fichier={premiere} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <ImageIcon className="size-7" strokeWidth={1.5} aria-hidden="true" />
            {t('photoLater')}
          </div>
        )}
        {d.contrat ? (
          <div className="absolute top-2.5 left-2.5">
            <ContractTypeChip type={d.contrat} compact />
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-1 px-0.5">
        <p className="font-display text-base leading-6 font-semibold text-pretty text-foreground">
          {d.titre || t('empty')}
        </p>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {d.lieu || <AVenir>{t('placeLater')}</AVenir>}
        </p>
        {d.chiffres.length > 0 ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">{d.chiffres.join(' · ')}</p>
        ) : null}
        <p className="pt-1 text-[15px] leading-6 font-semibold text-foreground tabular-nums" data-testid="apercu-prix">
          {d.prix ? (
            <>
              {d.prix}
              {d.periode ? (
                <span className="ml-0.5 font-normal text-muted-foreground">/{d.periode}</span>
              ) : null}
            </>
          ) : (
            <AVenir>{t('priceLater')}</AVenir>
          )}
        </p>
      </div>

      {d.coutDEntree.length > 0 ? (
        <div className="mt-3 border-t border-border px-0.5 pt-3 text-[13px] leading-[18px]">
          <p className="font-medium text-foreground">{t('entryTitle')}</p>
          <p className="text-muted-foreground">{d.coutDEntree.join(', ')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('entryNote')}</p>
        </div>
      ) : null}
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
}: {
  readonly etapes: readonly EtapeDeListe[];
  readonly index: number;
  readonly onRouvrir: (index: number) => void;
  readonly desactivee?: boolean;
}) {
  const t = useTranslations('property.wizard');

  return (
    <nav aria-label={t('railLabel')} className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-2 text-sm font-semibold text-foreground">{t('preview.checklist')}</p>
      <ol className="space-y-0.5">
        {etapes.map((e, i) => {
          const franchie = i < index;
          const courante = i === index;
          const contenu = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full',
                  franchie && 'bg-foreground text-background',
                  courante && 'border-2 border-primary',
                  !franchie && !courante && 'border border-border',
                )}
              >
                {franchie ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className={cn('min-w-0 text-pretty', !franchie && !courante && 'text-muted-foreground')}>
                {e.libelle}
                {courante ? <span className="text-muted-foreground"> · {t('preview.current')}</span> : null}
                {!courante && e.facultative ? (
                  <span className="text-muted-foreground"> · {t('preview.optional')}</span>
                ) : null}
              </span>
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
                  className="flex min-h-9 w-full items-center gap-2.5 rounded-lg px-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {contenu}
                </button>
              ) : (
                <span
                  aria-current={courante ? 'step' : undefined}
                  className={cn('flex min-h-9 items-center gap-2.5 px-1.5 text-sm', courante && 'font-medium')}
                >
                  {contenu}
                </span>
              )}
            </li>
          );
        })}
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

  const premiereLigne = d.type
    ? [d.titre, d.contrat ? tContrat(d.contrat === 'sale' ? 'saleLong' : 'rentLong') : null]
        .filter(Boolean)
        .join(' · ')
    : t('empty');
  const secondeLigne = d.prix
    ? `${d.prix}${d.periode ? ` /${d.periode}` : ''}`
    : d.lieu || (d.type ? t('priceLater') : t('emptyHint'));

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-label={t('openLabel')}
        data-testid="barre-apercu"
        className="flex w-full shrink-0 items-center gap-3 border-b border-border bg-card px-4 py-2.5 text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset sm:px-6"
      >
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
          {photos[0] ? <VignetteFichier fichier={photos[0]} /> : <ImageIcon className="size-5" strokeWidth={1.5} aria-hidden="true" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">{premiereLigne}</span>
          <span className="truncate text-[13px] text-muted-foreground tabular-nums">{secondeLigne}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary">
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
          <div className="mx-auto flex w-full max-w-md flex-col gap-4 overflow-y-auto px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6">
            <CarteApercu form={form} photos={photos} />
            {children?.(() => setOuvert(false))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
