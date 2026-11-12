'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useFormContext, useFormState, useWatch } from 'react-hook-form';
import { ArrowDown, ArrowUp, Check, ExternalLink, Home, Plus, Search, X } from 'lucide-react';

import { FormError } from '@/components/forms';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { idDuChamp, OU_SE_REMPLIT, type ValeursDeLaFiche } from '@/lib/agence/fiche';
import { cn } from '@/lib/utils';
import {
  MAX_ACCROCHE,
  MAX_BIENS_VITRINE,
  MAX_POINT,
  NB_POINTS,
  basculerBien,
  couvertureApercue,
  deplacerBien,
  parametresDeLaSelection,
  parametresDesBiensPublics,
  vitrineQueryKeys,
  type BienDeVitrine,
} from '@/lib/vitrine-agence';

import { useEtatDuChamp, useFiche } from './contexte';
import { CadreDApercu, EncartManque, EtiquetteDuChamp, LogoDeLAgence, TitreDeSection, classesDuChamp } from './pieces';

interface PageDeBiens {
  readonly data: readonly BienDeVitrine[];
  readonly meta?: { readonly total?: number };
}

const AUCUN_BIEN: readonly BienDeVitrine[] = [];

/**
 * TCK-2670 — « Fiche publique » (TCK-2524) : l'accroche (120), trois « Pourquoi nous » (80), la
 * sélection ordonnée de six biens publics et disponibles, et l'aperçu de la couverture. Les trois
 * valeurs sont des champs du formulaire UNIQUE de la fiche : elles partent avec le reste, dans le même
 * `PATCH`, et seulement si elles ont changé. Les règles sont dans `lib/vitrine-agence.ts`.
 */
export function SectionFichePublique() {
  const t = useTranslations('admin.agencyPublicProfile');
  const tFiche = useTranslations('admin.agencyConfig.fiche.publique');
  const tElements = useTranslations('admin.agencyConfig.fiche.elements');
  const locale = useLocale();
  const { agence, manquants, completude } = useFiche();
  const { control, setValue } = useFormContext<ValeursDeLaFiche>();
  const { errors } = useFormState({ control, name: ['tagline', 'highlights', 'showcase_property_ids'] });
  const [accroche, points, selection] = useWatch({ control, name: ['tagline', 'highlights', 'showcase_property_ids'] });
  const etatAccroche = useEtatDuChamp('tagline');
  const etatPoints = useEtatDuChamp('highlights.0');
  const etatSelection = useEtatDuChamp('showcase_property_ids');
  const [recherche, setRecherche] = useState('');
  const [refusPlein, setRefusPlein] = useState(false);

  const tous = useApiQuery<PageDeBiens>(vitrineQueryKeys.biensPublics(agence.id, ''), '/api/properties', {
    params: parametresDesBiensPublics(agence.id),
  });
  const rechercheDifferee = useDebouncedValue(recherche.trim(), 300);
  const trouves = useApiQuery<PageDeBiens>(vitrineQueryKeys.biensPublics(agence.id, rechercheDifferee), '/api/properties', {
    params: parametresDesBiensPublics(agence.id, rechercheDifferee),
    enabled: rechercheDifferee !== '',
  });
  // Revue de TCK-2524 — la sélection se nomme par SES ids : un bien choisi au-delà des cent premiers
  // se nomme et reste en tête de couverture ; « plus en ligne » ne se juge que sur une lecture à jour.
  const nommes = useApiQuery<PageDeBiens>(vitrineQueryKeys.selection(agence.id, selection), '/api/properties', {
    params: parametresDeLaSelection(agence.id, selection),
    enabled: selection.length > 0,
    placeholderData: (avant) => avant,
  });
  const selectionNommee = nommes.data?.data ?? AUCUN_BIEN;
  const selectionJugee = nommes.isSuccess && !nommes.isPlaceholderData;
  const biensPublics = tous.data?.data ?? AUCUN_BIEN;
  const proposes = (rechercheDifferee === '' ? biensPublics : (trouves.data?.data ?? AUCUN_BIEN)).filter((b) => !selection.includes(b.id));
  const chargementDesProposes = rechercheDifferee === '' ? tous.isLoading : trouves.isLoading;
  const parId = new Map([...biensPublics, ...(trouves.data?.data ?? []), ...selectionNommee].map((b) => [b.id, b]));
  const couverture = couvertureApercue(selection, biensPublics, selectionNommee);
  const pleine = selection.length >= MAX_BIENS_VITRINE;
  const exemples = [t('highlightPlaceholder1'), t('highlightPlaceholder2'), t('highlightPlaceholder3')];

  function choisir(suivante: readonly number[]) {
    setValue('showcase_property_ids', [...suivante], { shouldDirty: true });
  }

  function basculer(id: number) {
    const suivante = basculerBien(selection, id);
    // Un septième n'entre pas, et on le dit ; rien n'est envoyé.
    setRefusPlein(suivante === selection && !selection.includes(id));
    if (suivante !== selection) choisir(suivante);
  }

  // L'encart : ce qui manque À CETTE SECTION, et ce que la jauge gagnerait.
  const manquantsIci = manquants.filter((e) => OU_SE_REMPLIT[e].section === 'publique');
  const apres =
    completude && manquantsIci.length > 0
      ? Math.round(((completude.presents.length + manquantsIci.length) / completude.elements.length) * 100)
      : null;

  return (
    <section aria-labelledby="titre-section-publique" data-section="publique">
      <TitreDeSection id="titre-section-publique" titre={tFiche('titre')} texte={t('description')} />
      {manquantsIci.length > 0 && completude && apres !== null ? (
        <EncartManque className="mb-5" titre={tFiche('manqueTitre', { n: manquantsIci.length })}>
          <p>
            {tFiche('manqueTexte', {
              liste: new Intl.ListFormat(locale, { type: 'conjunction' }).format(manquantsIci.map((e) => tElements(`${e}.titre`))),
              avant: completude.pourcentage,
              apres,
              n: manquantsIci.length,
            })}
          </p>
        </EncartManque>
      ) : null}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-6">
        <div className="min-w-0 flex-1 space-y-5">
          <div>
            <label htmlFor={idDuChamp('tagline')} className="mb-1.5 block text-sm font-medium">
              <EtiquetteDuChamp libelle={t('tagline')} modifie={etatAccroche.modifie} manque={etatAccroche.manque} />
            </label>
            <div className="relative">
              <Textarea
                id={idDuChamp('tagline')}
                rows={2}
                maxLength={MAX_ACCROCHE}
                value={accroche}
                placeholder={t('taglinePlaceholder')}
                aria-invalid={errors.tagline ? true : undefined}
                aria-describedby={errors.tagline ? `${idDuChamp('tagline')}-aide ${idDuChamp('tagline')}-error` : `${idDuChamp('tagline')}-aide`}
                className={cn('min-h-[5.5rem] resize-none pr-20 text-corps', classesDuChamp(etatAccroche.modifie, etatAccroche.manque))}
                onChange={(ev) => setValue('tagline', ev.target.value, { shouldDirty: true })}
              />
              {/* Le compte dans le champ, en haut à droite, comme celui des raisons (maquette). */}
              <span className="pointer-events-none absolute top-2.5 right-3 text-ui tabular-nums text-muted-foreground">
                {t('counter', { n: accroche.length, max: MAX_ACCROCHE })}
              </span>
            </div>
            <p id={`${idDuChamp('tagline')}-aide`} className="mt-1 text-xs text-muted-foreground">
              {t('taglineHint')}
            </p>
            <FormError id={`${idDuChamp('tagline')}-error`}>{errors.tagline?.message}</FormError>
          </div>

          {/* `min-w-0` sur chaque fieldset : son `min-width` par défaut est `min-content` (TCK-2524). */}
          <fieldset className="min-w-0">
            <legend className="text-corps font-semibold">
              <EtiquetteDuChamp libelle={t('highlights')} modifie={etatPoints.modifie} manque={etatPoints.manque} />
            </legend>
            <p className="mt-0.5 text-ui text-muted-foreground">{t('highlightsHint')}</p>
            <div className="mt-3 space-y-4">
              {Array.from({ length: NB_POINTS }, (_, i) => {
                const id = idDuChamp(`highlights.${i}`);
                const valeur = points[i] ?? '';
                const erreur = errors.highlights?.[i]?.message;
                return (
                  <div key={id}>
                    <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
                      {t('highlightLabel', { n: i + 1 })}
                    </label>
                    <div className="relative">
                      <Input
                        id={id}
                        maxLength={MAX_POINT}
                        value={valeur}
                        placeholder={exemples[i]}
                        aria-invalid={erreur ? true : undefined}
                        aria-describedby={erreur ? `${id}-error` : undefined}
                        className="pr-16 text-corps"
                        onChange={(ev) => {
                          const suivants = Array.from({ length: NB_POINTS }, (_, j) => (j === i ? ev.target.value : (points[j] ?? '')));
                          setValue('highlights', suivants, { shouldDirty: true });
                        }}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-ui tabular-nums text-muted-foreground">
                        {t('counter', { n: valeur.length, max: MAX_POINT })}
                      </span>
                    </div>
                    <FormError id={`${id}-error`}>{erreur}</FormError>
                  </div>
                );
              })}
            </div>
            <FormError>{(errors.highlights as { message?: string } | undefined)?.message}</FormError>
          </fieldset>

          <fieldset className="min-w-0 border-t border-border pt-5" id={idDuChamp('showcase_property_ids')} tabIndex={-1}>
            <legend className="flex w-full items-center gap-2 text-corps font-semibold">
              <EtiquetteDuChamp libelle={t('showcase')} modifie={etatSelection.modifie} manque={etatSelection.manque} />
              <span className="ml-auto text-ui font-normal tabular-nums text-muted-foreground">
                {t('showcaseCount', { n: selection.length, max: MAX_BIENS_VITRINE })}
              </span>
            </legend>
            <p className="mt-0.5 text-ui text-muted-foreground">{t('showcaseHint')}</p>

            {selection.length > 0 ? (
              <ol
                className={cn(
                  'mt-3 divide-y divide-border/70 rounded-xl border bg-card',
                  etatSelection.modifie ? 'border-primary ring-2 ring-primary/15' : 'border-border',
                )}
                aria-label={t('showcaseOrder')}
              >
                {selection.map((id, rang) => {
                  const bien = parId.get(id);
                  const titre = bien?.title ?? t('propertyFallback', { id });
                  return (
                    <li key={id} className="flex items-center gap-2.5 p-2.5">
                      <Vignette url={bien?.main_photo_url ?? null} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium leading-snug">{titre}</p>
                        {bien === undefined && selectionJugee ? (
                          <p className="text-ui text-muted-foreground">{t('notPublicAnymore')}</p>
                        ) : bien?.reference_number ? (
                          <p className="truncate text-ui tabular-nums text-muted-foreground">{bien.reference_number}</p>
                        ) : null}
                      </div>
                      <span className="flex flex-none gap-1">
                        <BoutonRond
                          libelle={t('moveUp', { title: titre })}
                          disabled={rang === 0}
                          onClick={() => choisir(deplacerBien(selection, id, -1))}
                        >
                          <ArrowUp className="size-4" aria-hidden="true" />
                        </BoutonRond>
                        <BoutonRond
                          libelle={t('moveDown', { title: titre })}
                          disabled={rang === selection.length - 1}
                          onClick={() => choisir(deplacerBien(selection, id, 1))}
                        >
                          <ArrowDown className="size-4" aria-hidden="true" />
                        </BoutonRond>
                        <BoutonRond libelle={t('remove', { title: titre })} onClick={() => basculer(id)}>
                          <X className="size-4" aria-hidden="true" />
                        </BoutonRond>
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : null}
            <FormError>{(errors.showcase_property_ids as { message?: string } | undefined)?.message}</FormError>

            <label htmlFor="recherche-vitrine" className="mt-4 block text-sm font-medium">
              {t('pickLabel')}
            </label>
            <div className="relative mt-1.5">
              <Search
                className="pointer-events-none absolute inset-y-0 left-3 my-auto size-icone text-muted-foreground"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <Input
                id="recherche-vitrine"
                type="search"
                value={recherche}
                placeholder={t('searchPlaceholder')}
                className="pl-10 text-corps"
                onChange={(ev) => setRecherche(ev.target.value)}
              />
            </div>
            {pleine ? (
              <p
                className={cn('mt-2 text-xs', refusPlein ? 'font-medium text-destructive' : 'text-muted-foreground')}
                role={refusPlein ? 'alert' : undefined}
              >
                {t('full', { max: MAX_BIENS_VITRINE })}
              </p>
            ) : null}
            <ListeDesBiens
              biens={proposes}
              chargement={chargementDesProposes}
              enErreur={rechercheDifferee === '' ? tous.isError : trouves.isError}
              pleine={pleine}
              recherche={rechercheDifferee}
              onAjouter={basculer}
            />
          </fieldset>
        </div>
        <div className="w-full flex-none xl:sticky xl:top-6 xl:w-80">
          <ApercuDeLaCouverture couverture={couverture} chargement={tous.isLoading} nombreDeBiens={tous.data?.meta?.total} />
        </div>
      </div>
    </section>
  );
}

function BoutonRond({
  libelle,
  disabled,
  onClick,
  children,
}: {
  readonly libelle: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={libelle}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-9 flex-none items-center justify-center rounded-lg border border-border bg-background text-encre-douce transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function Vignette({ url }: { readonly url: string | null }) {
  return (
    <span className="relative size-12 flex-none overflow-hidden rounded-lg bg-muted">
      {url ? (
        <Image src={url} alt="" fill sizes="48px" className="object-cover" />
      ) : (
        <Home className="absolute inset-0 m-auto size-5 text-muted-foreground" aria-hidden="true" />
      )}
    </span>
  );
}

function ListeDesBiens({
  biens,
  chargement,
  enErreur,
  pleine,
  recherche,
  onAjouter,
}: {
  readonly biens: readonly BienDeVitrine[];
  readonly chargement: boolean;
  readonly enErreur: boolean;
  readonly pleine: boolean;
  readonly recherche: string;
  readonly onAjouter: (id: number) => void;
}) {
  const t = useTranslations('admin.agencyPublicProfile');
  const tFiche = useTranslations('admin.agencyConfig.fiche.publique');
  if (chargement) {
    return (
      <div className="mt-2 space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (enErreur) return <p className="mt-2 text-sm text-destructive">{t('loadError')}</p>;
  if (biens.length === 0) {
    return (
      <p className="mt-2 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        {recherche === '' ? t('noPublic') : t('noMatch')}
      </p>
    );
  }
  return (
    <ul className="mt-2 max-h-80 divide-y divide-border/70 overflow-y-auto rounded-xl border border-border bg-card">
      {biens.map((bien) => {
        const titre = bien.title ?? t('propertyFallback', { id: bien.id });
        return (
          <li key={bien.id} className="flex items-center gap-2.5 p-2.5">
            <Vignette url={bien.main_photo_url} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium leading-snug">{titre}</p>
              {bien.reference_number ? <p className="truncate text-ui tabular-nums text-muted-foreground">{bien.reference_number}</p> : null}
            </div>
            <button
              type="button"
              // Un septième se refuse AVANT l'envoi : le bouton reste lisible et focalisable, son clic dit
              // pourquoi (`basculerBien` rend la même sélection).
              aria-disabled={pleine || undefined}
              aria-label={tFiche('ajouter', { title: titre })}
              onClick={() => onAjouter(bien.id)}
              className={cn(
                'inline-flex h-9 flex-none items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                pleine && 'cursor-not-allowed opacity-60',
              )}
            >
              <Plus className="size-4" aria-hidden="true" />
              {tFiche('ajouterCourt')}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** L'aperçu de la couverture de la fiche publique, avec la saisie en cours. */
/**
 * `nombreDeBiens` : le total de la liste des biens publics et disponibles — le prédicat de
 * `portfolio_count`, que la fiche publique affiche. Jamais `properties_count` (colonne dénormalisée
 * de TOUS les biens, à 0 sur la démo). Absent tant que la liste n'est pas lue : rien ne s'affiche.
 */
function ApercuDeLaCouverture({
  couverture,
  chargement,
  nombreDeBiens,
}: {
  readonly couverture: readonly BienDeVitrine[];
  readonly chargement: boolean;
  readonly nombreDeBiens: number | undefined;
}) {
  const t = useTranslations('admin.agencyPublicProfile');
  const tFiche = useTranslations('admin.agencyConfig.fiche.publique');
  const { agence, cheminPublic } = useFiche();
  const { control } = useFormContext<ValeursDeLaFiche>();
  const [nom, accroche, points] = useWatch({ control, name: ['name', 'tagline', 'highlights'] });
  const pointsVisibles = (points ?? []).map((p) => p.trim()).filter((p) => p !== '');

  return (
    <CadreDApercu titre={t('previewTitle')}>
      <div className="overflow-hidden rounded-xl border border-border bg-card" data-testid="apercu-fiche-publique">
        <Couverture biens={couverture} vide={t('coverEmpty')} chargement={chargement} />
        <div className="p-3.5">
          <div className="flex items-center gap-2.5">
            <LogoDeLAgence url={agence.logo_url} nom={nom || agence.name} taille={36} />
            <div className="min-w-0 leading-tight">
              <p className="truncate font-display text-base font-semibold tracking-titre">{nom || agence.name}</p>
              {typeof nombreDeBiens === 'number' ? (
                <p className="text-xs text-muted-foreground">{tFiche('nombreDeBiens', { n: nombreDeBiens })}</p>
              ) : null}
            </div>
          </div>
          {(accroche ?? '').trim() !== '' ? (
            <p className="mt-3 text-sm leading-snug">{(accroche ?? '').trim()}</p>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed border-warning/70 px-3 py-2 text-ui text-muted-foreground">{tFiche('accrocheIci')}</p>
          )}
          {pointsVisibles.length > 0 ? (
            <ul className="mt-2.5 space-y-1">
              {pointsVisibles.map((p, i) => (
                <li key={`${i}-${p}`} className="flex items-center gap-1.5 text-ui">
                  <Check className="size-3.5 flex-none text-accent" strokeWidth={2.25} aria-hidden="true" />
                  <span className="min-w-0 break-words">{p}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">{t('previewHint')}</p>
      <a
        href={cheminPublic}
        target="_blank"
        rel="noopener"
        className="mt-2.5 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ExternalLink className="size-4" aria-hidden="true" />
        {t('viewPublic')}
      </a>
    </CadreDApercu>
  );
}

function Couverture({ biens, vide, chargement }: { readonly biens: readonly BienDeVitrine[]; readonly vide: string; readonly chargement: boolean }) {
  if (chargement) return <Skeleton className="h-32 w-full rounded-none" />;
  if (biens.length === 0) {
    return <div className="flex h-32 items-center justify-center bg-muted px-6 text-center text-xs text-muted-foreground">{vide}</div>;
  }
  return (
    <div
      className={cn(
        'grid h-32 gap-0.5 overflow-hidden bg-muted',
        biens.length === 1 && 'grid-cols-1',
        biens.length === 2 && 'grid-cols-2',
        biens.length === 3 && 'grid-cols-[2fr_1fr] grid-rows-2',
      )}
      data-testid="apercu-couverture"
    >
      {biens.map((bien, i) => (
        <span
          key={bien.id}
          data-property-id={bien.id}
          className={cn('relative min-h-0 overflow-hidden', biens.length === 3 && i === 0 && 'row-span-2')}
        >
          {bien.main_photo_url ? (
            <Image src={bien.main_photo_url} alt="" fill sizes="(min-width: 1280px) 240px, 60vw" className="object-cover" />
          ) : null}
        </span>
      ))}
    </div>
  );
}
