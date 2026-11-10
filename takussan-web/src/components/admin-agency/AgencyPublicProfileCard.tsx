'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Check, ExternalLink, Home, Loader2, X } from 'lucide-react';

import { FormError, FormGlobalError, FormSuccess } from '@/components/forms';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { updateAgencyVitrineAction } from '@/app/actions/admin-agency';
import { useApiQuery } from '@/hooks/useApiQuery';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { avecGardeDoubleFacteurAction } from '@/lib/double-facteur';
import { cn } from '@/lib/utils';
import {
  MAX_ACCROCHE,
  MAX_BIENS_VITRINE,
  MAX_POINT,
  NB_POINTS,
  basculerBien,
  chargeUtileVitrine,
  couvertureApercue,
  deplacerBien,
  erreursVitrineSurLeurChamp,
  parametresDeLaSelection,
  parametresDesBiensPublics,
  vitrineQueryKeys,
  type BienDeVitrine,
  type ChampVitrine,
} from '@/lib/vitrine-agence';
import type { Agency } from '@/types/agency';

/**
 * TCK-2524 — le bloc « Fiche publique » de la configuration d'agence : l'accroche, les trois
 * « Pourquoi nous », la sélection de six biens publics au plus (réordonnables) et l'aperçu de la
 * couverture qui en résulte. Le contrat d'écriture est celui de TCK-2518 ; les règles sont dans
 * `lib/vitrine-agence.ts`.
 *
 * Un formulaire À PART, hors du `<form>` d'`AgencyConfigForm` : son propre enregistrement, qui
 * n'envoie que ces trois clés. La page `/app/agency` n'est servie qu'à qui configure l'agence
 * (`garderPageAdmin`) ; l'API le rejuge (`AgencyController@update`, second facteur compris).
 */

interface AgencyPublicProfileCardProps {
  readonly agency: Pick<Agency, 'id' | 'name' | 'slug' | 'tagline' | 'highlights' | 'showcase_property_ids'>;
}

interface PageDeBiens {
  readonly data: readonly BienDeVitrine[];
  readonly meta?: { readonly total?: number };
}

const AUCUN_BIEN: readonly BienDeVitrine[] = [];

function pointsInitiaux(highlights: readonly string[] | undefined): string[] {
  return Array.from({ length: NB_POINTS }, (_, i) => highlights?.[i] ?? '');
}

export function AgencyPublicProfileCard({ agency }: AgencyPublicProfileCardProps) {
  const t = useTranslations('admin.agencyPublicProfile');
  const router = useRouter();
  const garde = useGardeDoubleFacteur();
  const idTitre = useId();
  const idAccroche = useId();
  const idRecherche = useId();
  const [accroche, setAccroche] = useState(agency.tagline ?? '');
  const [points, setPoints] = useState<string[]>(() => pointsInitiaux(agency.highlights));
  const [selection, setSelection] = useState<readonly number[]>(agency.showcase_property_ids ?? []);
  const [recherche, setRecherche] = useState('');
  const [refusPlein, setRefusPlein] = useState(false);
  const [erreurs, setErreurs] = useState<Partial<Record<ChampVitrine, string>>>({});
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  // La liste entière (sans recherche) sert la couverture et nomme la sélection ; la recherche, elle,
  // passe par l'API (`filter[search]`).
  const tous = useApiQuery<PageDeBiens>(
    vitrineQueryKeys.biensPublics(agency.id, ''),
    '/api/properties',
    { params: parametresDesBiensPublics(agency.id) },
  );
  const rechercheDifferee = useDebouncedValue(recherche.trim(), 300);
  const trouves = useApiQuery<PageDeBiens>(
    vitrineQueryKeys.biensPublics(agency.id, rechercheDifferee),
    '/api/properties',
    { params: parametresDesBiensPublics(agency.id, rechercheDifferee), enabled: rechercheDifferee !== '' },
  );
  // Revue de TCK-2524 — la sélection se nomme par SES ids, pas par la page courante : un bien choisi
  // au-delà des cent premiers se nomme, et reste en tête de couverture. Le précédent résultat reste
  // affiché pendant qu'une sélection modifiée se relit ; « plus en ligne » ne se juge que sur une
  // lecture à jour.
  const nommes = useApiQuery<PageDeBiens>(
    vitrineQueryKeys.selection(agency.id, selection),
    '/api/properties',
    { params: parametresDeLaSelection(agency.id, selection), enabled: selection.length > 0, placeholderData: (avant) => avant },
  );
  const selectionNommee = nommes.data?.data ?? AUCUN_BIEN;
  const selectionJugee = nommes.isSuccess && !nommes.isPlaceholderData;
  const biensPublics = tous.data?.data ?? AUCUN_BIEN;
  const proposes = rechercheDifferee === '' ? biensPublics : (trouves.data?.data ?? AUCUN_BIEN);
  const chargementDesProposes = rechercheDifferee === '' ? tous.isLoading : trouves.isLoading;
  const parId = new Map([...biensPublics, ...(trouves.data?.data ?? []), ...selectionNommee].map((b) => [b.id, b]));
  const couverture = couvertureApercue(selection, biensPublics, selectionNommee);
  const pleine = selection.length >= MAX_BIENS_VITRINE;
  const pointsVisibles = points.map((p) => p.trim()).filter((p) => p !== '');
  const exemplesDePoints = [t('highlightPlaceholder1'), t('highlightPlaceholder2'), t('highlightPlaceholder3')];

  function oublierErreur(champ: ChampVitrine) {
    setSucces(null);
    setErreurs((avant) => {
      if (!(champ in avant)) return avant;
      const { [champ]: _retire, ...reste } = avant;
      return reste;
    });
  }

  function basculer(id: number) {
    const suivante = basculerBien(selection, id);
    // AC1 — un septième n'entre pas, et on le dit ; rien n'est envoyé.
    setRefusPlein(suivante === selection && !selection.includes(id));
    if (suivante !== selection) {
      setSelection(suivante);
      oublierErreur('selection');
    }
  }

  function deplacer(id: number, sens: -1 | 1) {
    setSelection((avant) => deplacerBien(avant, id, sens));
    setSucces(null);
  }

  function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreurGlobale(null);
    setSucces(null);
    const { payload, indexDesPoints } = chargeUtileVitrine({ accroche, points, selection });
    demarrer(async () => {
      const resultat = await avecGardeDoubleFacteurAction(() => updateAgencyVitrineAction(agency.id, payload), garde);
      if (!resultat.ok) {
        const { champs, autres } = erreursVitrineSurLeurChamp(resultat.errors, indexDesPoints);
        setErreurs(champs);
        const surUnChamp = Object.keys(champs).length > 0;
        setErreurGlobale(autres[0] ?? (surUnChamp ? null : resultat.message));
        return;
      }
      setErreurs({});
      const lue = resultat.data;
      if (lue) {
        setAccroche(lue.tagline ?? '');
        setPoints(pointsInitiaux(lue.highlights));
        setSelection(lue.showcase_property_ids ?? []);
      }
      setSucces(t('saved'));
      router.refresh();
    });
  }

  return (
    <section className="space-y-6 rounded-xl bg-card p-6" aria-labelledby={idTitre}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={idTitre} className="text-base font-semibold text-foreground">{t('title')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('description')}</p>
        </div>
        <a
          href={`/agencies/${agency.slug}`}
          target="_blank"
          rel="noopener"
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          <ExternalLink aria-hidden="true" />
          {t('viewPublic')}
        </a>
      </div>

      <form onSubmit={enregistrer} noValidate className="space-y-6">
        {erreurGlobale ? <FormGlobalError>{erreurGlobale}</FormGlobalError> : null}
        {succes ? <FormSuccess>{succes}</FormSuccess> : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="min-w-0 space-y-6">
            <Compteur
              id={idAccroche}
              label={t('tagline')}
              aide={t('taglineHint')}
              valeur={accroche}
              max={MAX_ACCROCHE}
              erreur={erreurs.accroche}
            >
              {(attributs) => (
                <Textarea
                  {...attributs}
                  rows={2}
                  maxLength={MAX_ACCROCHE}
                  value={accroche}
                  placeholder={t('taglinePlaceholder')}
                  onChange={(ev) => {
                    setAccroche(ev.target.value);
                    oublierErreur('accroche');
                  }}
                />
              )}
            </Compteur>

            {/* `min-w-0` sur chaque fieldset : son `min-width` par défaut est `min-content`, et la sélection
                (vignette + titre + trois boutons) le portait à 429 px dans une colonne de 310 px — à 390 px,
                `main` défilait de côté (scrollWidth 469 contre 390, mesuré). */}
            <fieldset className="min-w-0 space-y-3">
              <legend className="text-sm font-medium">{t('highlights')}</legend>
              <p className="text-xs text-muted-foreground">{t('highlightsHint')}</p>
              {points.map((point, i) => {
                const champ = `point-${i}` as ChampVitrine;
                return (
                  <Compteur
                    key={champ}
                    id={`${idAccroche}-${champ}`}
                    label={t('highlightLabel', { n: i + 1 })}
                    labelMasque
                    valeur={point}
                    max={MAX_POINT}
                    erreur={erreurs[champ]}
                  >
                    {(attributs) => (
                      <Input
                        {...attributs}
                        maxLength={MAX_POINT}
                        value={point}
                        placeholder={exemplesDePoints[i]}
                        onChange={(ev) => {
                          const texte = ev.target.value;
                          setPoints((avant) => avant.map((p, j) => (j === i ? texte : p)));
                          oublierErreur(champ);
                          oublierErreur('points');
                        }}
                      />
                    )}
                  </Compteur>
                );
              })}
              <FormError>{erreurs.points}</FormError>
            </fieldset>

            <fieldset className="min-w-0 space-y-3">
              <legend className="text-sm font-medium">
                {t('showcase')}{' '}
                <span className="font-normal text-muted-foreground tabular-nums">
                  {t('showcaseCount', { n: selection.length, max: MAX_BIENS_VITRINE })}
                </span>
              </legend>
              <p className="text-xs text-muted-foreground">{t('showcaseHint')}</p>

              {selection.length > 0 ? (
                <ol className="divide-y divide-border rounded-lg border border-border" aria-label={t('showcaseOrder')}>
                  {selection.map((id, rang) => {
                    const bien = parId.get(id);
                    const titre = bien?.title ?? t('propertyFallback', { id });
                    return (
                      <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-2">
                        <span className="w-5 flex-none text-center text-xs font-semibold tabular-nums text-muted-foreground">
                          {rang + 1}
                        </span>
                        <Vignette url={bien?.main_photo_url ?? null} />
                        {/* `min-w-32` + `flex-wrap` : au téléphone, les trois boutons passent sous le titre plutôt
                            que de le réduire à quelques lettres (mesuré à 390 px : « Villa Luxe … »). */}
                        <div className="min-w-32 flex-1">
                          <p className="line-clamp-2 text-sm font-medium">{titre}</p>
                          {bien === undefined && selectionJugee ? (
                            <p className="text-xs text-muted-foreground">{t('notPublicAnymore')}</p>
                          ) : bien?.reference_number ? (
                            <p className="truncate text-xs text-muted-foreground">{bien.reference_number}</p>
                          ) : null}
                        </div>
                        <div className="ml-auto flex flex-none items-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('moveUp', { title: titre })}
                            disabled={rang === 0}
                            onClick={() => deplacer(id, -1)}
                          >
                            <ArrowUp aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('moveDown', { title: titre })}
                            disabled={rang === selection.length - 1}
                            onClick={() => deplacer(id, 1)}
                          >
                            <ArrowDown aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={t('remove', { title: titre })}
                            onClick={() => basculer(id)}
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
              <FormError>{erreurs.selection}</FormError>

              <div className="space-y-2">
                <label htmlFor={idRecherche} className="block text-sm font-medium">{t('pickLabel')}</label>
                <Input
                  id={idRecherche}
                  type="search"
                  value={recherche}
                  placeholder={t('searchPlaceholder')}
                  onChange={(ev) => setRecherche(ev.target.value)}
                />
                {pleine ? (
                  <p className={cn('text-xs', refusPlein ? 'font-medium text-destructive' : 'text-muted-foreground')} role={refusPlein ? 'alert' : undefined}>
                    {t('full', { max: MAX_BIENS_VITRINE })}
                  </p>
                ) : null}
                <ListeDesBiens
                  biens={proposes}
                  chargement={chargementDesProposes}
                  enErreur={rechercheDifferee === '' ? tous.isError : trouves.isError}
                  selection={selection}
                  pleine={pleine}
                  recherche={rechercheDifferee}
                  onBasculer={basculer}
                />
              </div>
            </fieldset>
          </div>

          <aside className="min-w-0 space-y-2" aria-label={t('previewTitle')}>
            <h3 className="text-sm font-medium">{t('previewTitle')}</h3>
            <div className="overflow-hidden rounded-xl border border-border bg-background" data-testid="apercu-fiche-publique">
              <Couverture biens={couverture} vide={t('coverEmpty')} chargement={tous.isLoading} />
              <div className="space-y-2 p-4">
                <p className="font-display text-lg font-semibold leading-tight">{agency.name}</p>
                {accroche.trim() !== '' ? <p className="text-sm leading-snug">{accroche.trim()}</p> : null}
                {pointsVisibles.length > 0 ? (
                  <ul className="space-y-1">
                    {pointsVisibles.map((p, i) => (
                      <li key={`${i}-${p}`} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 size-4 flex-none text-primary" aria-hidden="true" />
                        <span className="min-w-0 break-words font-medium">{p}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('previewHint')}</p>
          </aside>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={enCours}>
            {enCours ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {t('save')}
          </Button>
        </div>
      </form>
    </section>
  );
}

interface AttributsDuChamp {
  readonly id: string;
  readonly 'aria-invalid'?: boolean;
  readonly 'aria-describedby': string;
  readonly 'aria-label'?: string;
}

/** Un champ avec son compteur de caractères (« 42 / 120 »), son aide et son erreur. */
function Compteur({
  id,
  label,
  labelMasque = false,
  aide,
  valeur,
  max,
  erreur,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly labelMasque?: boolean;
  readonly aide?: string;
  readonly valeur: string;
  readonly max: number;
  readonly erreur?: string;
  readonly children: (attributs: AttributsDuChamp) => React.ReactNode;
}) {
  const t = useTranslations('admin.agencyPublicProfile');
  const idCompteur = `${id}-compteur`;
  const idErreur = `${id}-erreur`;
  return (
    <div className="space-y-1.5">
      {labelMasque ? null : (
        <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      )}
      {aide ? <p className="text-xs text-muted-foreground">{aide}</p> : null}
      {children({
        id,
        'aria-invalid': erreur ? true : undefined,
        'aria-describedby': erreur ? `${idCompteur} ${idErreur}` : idCompteur,
        ...(labelMasque ? { 'aria-label': label } : {}),
      })}
      <div className="flex items-start justify-between gap-3">
        <FormError id={idErreur} className="mt-0">{erreur}</FormError>
        <p id={idCompteur} className="ml-auto flex-none text-xs tabular-nums text-muted-foreground">
          {t('counter', { n: valeur.length, max })}
        </p>
      </div>
    </div>
  );
}

function Vignette({ url }: { readonly url: string | null }) {
  return (
    <span className="relative size-12 flex-none overflow-hidden rounded-md bg-muted">
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
  selection,
  pleine,
  recherche,
  onBasculer,
}: {
  readonly biens: readonly BienDeVitrine[];
  readonly chargement: boolean;
  readonly enErreur: boolean;
  readonly selection: readonly number[];
  readonly pleine: boolean;
  readonly recherche: string;
  readonly onBasculer: (id: number) => void;
}) {
  const t = useTranslations('admin.agencyPublicProfile');
  if (chargement) {
    return (
      <div className="space-y-2" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (enErreur) return <p className="text-sm text-destructive">{t('loadError')}</p>;
  if (biens.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">{recherche === '' ? t('noPublic') : t('noMatch')}</p>;
  }
  return (
    <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
      {biens.map((bien) => {
        const choisi = selection.includes(bien.id);
        const bloque = pleine && !choisi;
        return (
          <li key={bien.id}>
            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 p-2 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring',
                bloque && 'cursor-not-allowed opacity-60',
              )}
            >
              <input
                type="checkbox"
                className="size-4 flex-none accent-primary"
                checked={choisi}
                // Revue de la vague 1, leçon 1 : un septième se refuse AVANT l'envoi. La case
                // reste lisible et focalisable, son changement n'ajoute rien (`basculerBien`).
                aria-disabled={bloque || undefined}
                onChange={() => onBasculer(bien.id)}
              />
              <Vignette url={bien.main_photo_url} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{bien.title ?? t('propertyFallback', { id: bien.id })}</span>
                {bien.reference_number ? (
                  <span className="block truncate text-xs text-muted-foreground">{bien.reference_number}</span>
                ) : null}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function Couverture({
  biens,
  vide,
  chargement,
}: {
  readonly biens: readonly BienDeVitrine[];
  readonly vide: string;
  readonly chargement: boolean;
}) {
  if (chargement) return <Skeleton className="h-40 w-full rounded-none" />;
  if (biens.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center bg-muted px-6 text-center text-xs text-muted-foreground">
        {vide}
      </div>
    );
  }
  return (
    <div
      className={cn(
        'grid h-40 gap-0.5 bg-muted',
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
          className={cn('relative overflow-hidden', biens.length === 3 && i === 0 && 'row-span-2')}
        >
          {bien.main_photo_url ? (
            <Image src={bien.main_photo_url} alt="" fill sizes="(min-width: 1280px) 240px, 60vw" className="object-cover" />
          ) : null}
        </span>
      ))}
    </div>
  );
}
