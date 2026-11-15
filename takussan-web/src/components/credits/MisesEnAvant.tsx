'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp, Eye } from 'lucide-react';

import type { BoostProduct } from '@/components/boost/types';
import { StatusBadge } from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button } from '@/components/ui/button';
import type { BienAPousser, MiseEnAvant } from '@/lib/queries/credits';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { cn } from '@/lib/utils';

import { familleDe, joursRestants } from './lecture';
import { Vignette } from './pieces';
import { useLectureDesCredits } from './useLectureDesCredits';

/**
 * TCK-2664 — « En avant en ce moment » et « À pousser » : ce que les mises en avant ont rapporté,
 * dans leur fenêtre (TCK-2663), et les biens sans contact depuis 30 jours.
 *
 * · « Vues » = `measures.clicks` : une fiche ouverte depuis un emplacement de la mise en avant. Une
 *   impression (la carte affichée dans les résultats) n'est pas une vue (décision 1 a).
 * · Pas de « × la semaine d'avant » : aucune série de vues par jour n'existe (TCK-2663).
 * · Mesures nulles (non mesurées) : « — », jamais des zéros inventés.
 * · « Relancer » rachète l'offre ACTIVE de même famille et de même durée, à son prix d'aujourd'hui ;
 *   sans offre active correspondante (une Vedette prolongée, une offre retirée), pas de « Relancer ».
 */

export type Relance = (boost: MiseEnAvant, offre: BoostProduct) => void;

/**
 * L'offre active qui rachète cette mise en avant — même famille, même durée — ou `null` : une Vedette
 * prolongée (14 j cumulés) n'a pas d'offre à racheter telle quelle, donc pas de « Relancer ».
 */
export function offreDeRelance(b: MiseEnAvant, produits: readonly BoostProduct[]): BoostProduct | null {
  const famille = familleDe(b.kind, b.variant);
  return produits.find((p) => p.is_active && familleDe(p.kind, p.variant) === famille && p.duration_days === b.duration_days) ?? null;
}

const enCours = (b: MiseEnAvant) => b.status === 'active' || b.status === 'paused';

function useFin() {
  const t = useTranslations('credits.boosts');
  const f = useFormatteurs();
  return (b: MiseEnAvant) =>
    b.status === 'paused'
      ? t('fin.enPause')
      : b.status === 'active'
        ? b.ends_at
          ? t('fin.jusquau', { date: f.jourMois(b.ends_at) })
          : t('fin.enCours')
        : t(b.status === 'cancelled' ? 'fin.annulee' : b.status === 'refunded' ? 'fin.remboursee' : 'fin.terminee', { date: f.jourMois(b.ended_at ?? b.ends_at) });
}

function Etat({ b }: { readonly b: MiseEnAvant }) {
  const t = useTranslations('credits.boosts');
  const l = useLectureDesCredits();
  if (b.status === 'active') return <StatusBadge tone="primary" label={l.famille(familleDe(b.kind, b.variant))} />;
  if (b.status === 'paused') return <StatusBadge tone="attention" label={t('etat.paused')} />;
  return <StatusBadge label={t(`etat.${b.status === 'ended' ? 'ended' : b.status}`)} />;
}

function BoutonRelancer({ b, offre, onRelancer, court }: { readonly b: MiseEnAvant; readonly offre: BoostProduct; readonly onRelancer: Relance; readonly court?: boolean }) {
  const t = useTranslations('credits.boosts');
  return (
    <button
      type="button"
      onClick={() => onRelancer(b, offre)}
      aria-label={t('relancerAria', { bien: b.property?.title ?? '', count: offre.price_credits })}
      className="rounded-sm text-left font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
    >
      {court ? t('relancerCourt', { prix: offre.price_credits }) : t('relancer', { count: offre.price_credits })}
    </button>
  );
}

/** Les mesures au téléphone : « 214 vues · 3 contacts · 1 visite ». */
function Mesures({ b }: { readonly b: MiseEnAvant }) {
  const t = useTranslations('credits.boosts.mesures');
  if (!b.measures) return null;
  const n = (valeur: number, cle: 'vues' | 'contacts' | 'visites') => (
    <span className="whitespace-nowrap">
      {t.rich(cle, { count: valeur, n: (c) => <span className="font-semibold text-foreground tabular-nums">{c}</span> })}
    </span>
  );
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-ui text-foreground">
      <Eye className="size-3.5 text-muted-foreground" aria-hidden="true" />
      {n(b.measures.clicks, 'vues')} · {n(b.measures.contacts, 'contacts')} · {n(b.measures.visits, 'visites')}
    </p>
  );
}

/** Une mise en avant au téléphone. */
export function MiseEnAvantMobile({ b, produits, onRelancer }: { readonly b: MiseEnAvant; readonly produits: readonly BoostProduct[]; readonly onRelancer: Relance }) {
  const l = useLectureDesCredits();
  const fin = useFin();
  const offre = enCours(b) ? null : offreDeRelance(b, produits);
  return (
    <li data-slot="mise-en-avant" className="flex gap-3 px-4 py-3.5">
      <Vignette src={b.property?.main_photo_url} taille={56} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-corps leading-tight font-semibold">{b.property?.title}</p>
          <Etat b={b} />
        </div>
        <p className="mt-1 truncate text-ui text-muted-foreground">
          {l.offre(b.kind, b.variant, b.duration_days)} · {fin(b)}
        </p>
        <Mesures b={b} />
        {offre ? (
          <p className="mt-2 text-sm">
            <BoutonRelancer b={b} offre={offre} onRelancer={onRelancer} />
          </p>
        ) : null}
      </div>
    </li>
  );
}

const COLS = 'minmax(0,1fr) 6rem 8.25rem 9.375rem 4.75rem 4rem';
/** Bureau 1280 (sous 1440 px) : l'offre passe sous le nom du bien. */
const COLS_ETROIT = 'minmax(0,1fr) 7.5rem 8rem 4.75rem 4rem';

function Rangee({ entete, className, children }: { readonly entete?: boolean; readonly className?: string; readonly children: ReactNode }) {
  return (
    <div
      role="row"
      style={{ '--cols': COLS, '--cols-etroit': COLS_ETROIT } as CSSProperties}
      className={cn(
        'grid grid-cols-(--cols-etroit) items-center gap-x-4 px-4 min-[90rem]:grid-cols-(--cols)',
        entete ? 'h-10 text-xs font-medium text-muted-foreground' : 'min-h-[4.25rem] border-t border-border py-2 text-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

const mesure = (n: number | undefined) => (n === undefined ? '—' : String(n));

/** « En avant en ce moment » au bureau : un tableau qui défile dans sa carte sous `xl`. */
export function TableDesMisesEnAvant({
  boosts,
  produits,
  onRelancer,
  maintenant,
}: {
  readonly boosts: readonly MiseEnAvant[];
  readonly produits: readonly BoostProduct[];
  readonly onRelancer: Relance;
  readonly maintenant: number;
}) {
  const t = useTranslations('credits.boosts');
  const l = useLectureDesCredits();
  const fin = useFin();
  return (
    <div className="max-xl:overflow-x-auto">
      <div role="table" aria-label={t('titre')} className="min-w-[37.5rem]">
        <Rangee entete>
          <span role="columnheader">{t('col.bien')}</span>
          <span role="columnheader" className="hidden min-[90rem]:block">
            {t('col.offre')}
          </span>
          <span role="columnheader">{t('col.fin')}</span>
          <span role="columnheader" className="text-right">
            {t('col.vues')}
          </span>
          <span role="columnheader" className="text-right">
            {t('col.contacts')}
          </span>
          <span role="columnheader" className="text-right">
            {t('col.visites')}
          </span>
        </Rangee>
        {boosts.map((b) => {
          const offre = enCours(b) ? null : offreDeRelance(b, produits);
          const nom = l.offre(b.kind, b.variant, b.duration_days);
          const pastille = <StatusBadge tone={b.status === 'active' ? 'primary' : b.status === 'paused' ? 'attention' : 'neutral'} label={nom} />;
          return (
            <Rangee key={b.id}>
              <span role="cell" className="flex min-w-0 items-center gap-3">
                <Vignette src={b.property?.main_photo_url} taille={44} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-medium">{b.property?.title}</span>
                  {b.property?.quarter ? <span className="mt-0.5 block truncate text-ui text-muted-foreground">{b.property.quarter}</span> : null}
                  <span className="mt-1 block min-[90rem]:hidden">{pastille}</span>
                </span>
              </span>
              <span role="cell" className="hidden min-[90rem]:block">
                {pastille}
              </span>
              <span role="cell" className="leading-tight">
                <span className="block">{fin(b)}</span>
                {b.status === 'active' && b.ends_at ? (
                  <span className="mt-0.5 block text-ui text-muted-foreground">{t('restants', { count: joursRestants(b.ends_at, maintenant) })}</span>
                ) : offre ? (
                  <span className="mt-0.5 block text-ui">
                    <BoutonRelancer b={b} offre={offre} onRelancer={onRelancer} court />
                  </span>
                ) : null}
              </span>
              <span role="cell" className="text-right font-semibold tabular-nums">
                {mesure(b.measures?.clicks)}
              </span>
              <span role="cell" className="text-right font-semibold tabular-nums">
                {mesure(b.measures?.contacts)}
              </span>
              <span role="cell" className="text-right font-semibold tabular-nums">
                {mesure(b.measures?.visits)}
              </span>
            </Rangee>
          );
        })}
      </div>
    </div>
  );
}

export function AucuneMiseEnAvant() {
  const t = useTranslations('credits.boosts');
  return <EmptyState className="py-8" title={t('vide')} />;
}

/* ─────────────────────────────── à pousser ─────────────────────────────── */

/** Un bien sans contact depuis 30 jours, et son geste « Remonter · 5 » (s'il existe une Remontée active). */
export function BienAPousserLigne({
  x,
  remontee,
  onRemonter,
  bureau,
}: {
  readonly x: BienAPousser;
  readonly remontee: BoostProduct | null;
  readonly onRemonter: (bien: BienAPousser, offre: BoostProduct) => void;
  readonly bureau?: boolean;
}) {
  const t = useTranslations('credits.pousser');
  return (
    <li data-slot="bien-a-pousser" className="flex items-center gap-3 px-4 py-3">
      <Vignette src={x.main_photo_url} taille={bureau ? 40 : 44} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className={cn('text-corps font-medium', bureau ? 'truncate' : 'line-clamp-2')}>{x.title}</p>
        <p className="mt-0.5 truncate text-ui text-muted-foreground">{[x.quarter, t('vues', { count: x.views_count })].filter(Boolean).join(' · ')}</p>
      </div>
      {remontee ? (
        <Button
          type="button"
          variant="secondary"
          size={bureau ? 'default' : 'lg'}
          onClick={() => onRemonter(x, remontee)}
          aria-label={t('remonterAria', { bien: x.title ?? '', count: remontee.price_credits })}
          className="flex-none px-3 text-sm"
        >
          {bureau ? <ArrowUp className="size-4" aria-hidden="true" /> : null}
          {t('remonter', { prix: remontee.price_credits })}
        </Button>
      ) : null}
    </li>
  );
}
