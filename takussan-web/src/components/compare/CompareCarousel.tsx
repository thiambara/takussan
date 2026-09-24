'use client';

import React, { useMemo } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { PropertyPhoto } from '@/components/property/cards/PropertyPhoto';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import {
  buildCompareRows,
  COMPARE_ROW_DEFS,
  type CompareCell,
  type CompareRowDef,
} from '@/components/compare/compare-rows';
import type { CompareColumn } from '@/components/compare/CompareTable';

/**
 * TCK-082 — le comparateur MOBILE (sous `md`) : les critères se lisent l'un sous l'autre, chaque
 * valeur nommée par son bien.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * UN EN-TÊTE COMPACT, ET UNE RANGÉE DE TITRES COLLANTE (TCK-577)
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * L'en-tête était une bande de cartes à 85 % de largeur — photo 4:3, titre, « Voir le bien »,
 * « Retirer » — qui défilait HORIZONTALEMENT. Relevé du 2026-09-24 sur `/fr/compare` avec quatre
 * biens : bande de 308 px de haut et 1 151 px de large pour 328 visibles à 360 × 740, premier
 * critère à 525 px ; 544 px à 390 × 844. Retour testeur du 2026-09-23 : « sur mobile on a du mal
 * à tout voir sans scroller ».
 *
 * Désormais tous les biens tiennent dans la largeur, en grille (2 à 4 colonnes) :
 *
 * - une rangée de VIGNETTES (56 px), chacune portant son bouton « Retirer » — elle défile avec la
 *   page, elle ne sert qu'à reconnaître les biens au premier coup d'œil ;
 * - une rangée de TITRES NUMÉROTÉS, liens vers la fiche, COLLANTE sous la barre de navigation :
 *   pendant la lecture des critères, elle dit quel numéro est quel bien. Chaque valeur des
 *   critères porte le même numéro devant le titre de son bien.
 *
 * Le numéro n'est qu'un repère visuel (`aria-hidden`) : un lecteur d'écran entend le titre, qui
 * nomme déjà chaque valeur.
 */

/**
 * La hauteur de la `Navbar` fixe sous `lg` — ce comparateur n'existe que sous `md`. C'est la
 * valeur de la cale (`NavbarSpacer`, `h-[69px]`) ; `CompareCarousel.test.tsx` garde que les deux
 * restent égales, sans quoi la rangée collante passerait sous la barre ou flotterait sous elle.
 */
const RANGEE_COLLANTE = 'sticky top-[69px]';

function formatCell(
  row: CompareRowDef,
  value: CompareCell,
  t: ReturnType<typeof useTranslations>,
): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <ul className="flex flex-wrap justify-end gap-1">
        {value.map((item) => (
          <li
            key={item}
            className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
          >
            {item}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'boolean') {
    return value ? t('values.yes') : t('values.no');
  }

  // Price arrives pre-formatted from `buildCell` (currency-aware);
  // only `area` still needs a client-side unit suffix.
  if (row.id === 'area' && typeof value === 'number') {
    return `${value} m²`;
  }

  return String(value);
}

export interface CompareCarouselProps {
  readonly columns: readonly CompareColumn[];
  readonly onRemove: (id: number) => void;
  readonly className?: string;
}

export function CompareCarousel({ columns, onRemove, className }: CompareCarouselProps) {
  const t = useTranslations('compare');
  const tRows = useTranslations('compare.rows');

  const rows = useMemo(
    () => buildCompareRows(columns.map((col) => col.property)),
    [columns],
  );

  // 2 à 4 biens : la grille compte exactement une colonne par bien, sans défilement horizontal.
  const grille = { gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, minmax(0, 1fr))` };

  return (
    <div className={className} role="group" aria-label={t('carousel.ariaLabel')}>
      {/* Vignettes — défilent avec la page. Chacune porte le retrait de SON bien. */}
      <ul className="grid gap-2" style={grille} role="list" data-testid="compare-vignettes">
        {columns.map((col) => {
          const nom = col.property?.title ?? t('table.unavailable');
          return (
            <li key={col.id} className="relative">
              <div className="relative h-14 overflow-hidden rounded-lg bg-muted">
                <PropertyPhoto
                  src={col.property?.main_photo_url}
                  alt=""
                  compact
                  sizes="25vw"
                />
              </div>
              {/* 28 px dessinés, 44 px de cible : le pseudo-élément déborde de 8 px de chaque
                  côté. Il est posé HORS du cadre `overflow-hidden` de la photo, qui rognerait
                  aussi la zone d'appui. */}
              <button
                type="button"
                onClick={() => onRemove(col.id)}
                aria-label={`${t('actions.remove')} ${nom}`}
                title={`${t('actions.remove')} ${nom}`}
                className={cn(
                  'absolute right-1 top-1 grid size-7 place-items-center rounded-full',
                  'bg-card text-foreground shadow-[0_1px_3px_color-mix(in_srgb,var(--shadow-color)_28%,transparent)]',
                  "after:absolute after:-inset-2 after:content-['']",
                  'hover:bg-destructive hover:text-primary-foreground',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  'transition-[background-color,color,scale] duration-150 active:scale-[0.96]',
                )}
              >
                <X className="size-3.5 stroke-[2.5]" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      {/* Titres numérotés — collants pendant la lecture des critères. Le fond pleine largeur
          (`-mx-4 px-4`, la gouttière de `main`) masque ce qui défile dessous. */}
      <ol
        aria-label={t('carousel.headerAria')}
        data-testid="compare-titres"
        className={cn(
          RANGEE_COLLANTE,
          'z-10 -mx-4 mt-1 grid gap-2 border-b border-border bg-surface px-4 py-1.5',
        )}
        style={grille}
      >
        {columns.map((col, index) => (
          <li key={col.id} className="min-w-0">
            {col.property ? (
              <LienLocalise
                href={`/properties/${col.property.slug}`}
                className={cn(
                  'flex min-h-11 items-start gap-1.5 rounded-md py-1 text-xs font-semibold text-foreground',
                  'hover:text-primary hover:underline underline-offset-2',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                )}
              >
                <Numero n={index + 1} />
                <span className="line-clamp-2 min-w-0 text-pretty">{col.property.title}</span>
              </LienLocalise>
            ) : (
              <span className="flex min-h-11 items-start gap-1.5 py-1 text-xs italic text-muted-foreground">
                <Numero n={index + 1} />
                <span className="line-clamp-2 min-w-0">{t('table.unavailable')}</span>
              </span>
            )}
          </li>
        ))}
      </ol>

      {/* Rows — une liste par critère, chaque valeur NOMMÉE par son bien et par son numéro.
          Chaque ligne défilait jusqu'ici dans sa propre bande à 85 % de largeur, sans suivre la
          bande des photos : à 360 comme à 390, la 2ᵉ valeur restait coupée au bord (« 2 090 »,
          « À loue ») et rien ne disait à quel bien elle appartenait (revue design du 2026-09-16).
          Deux à quatre biens tiennent en hauteur ; le titre, tronqué, fait le lien. */}
      <div className="mt-3 space-y-2">
        {rows.map((row) => {
          const def = COMPARE_ROW_DEFS.find((d) => d.id === row.id)!;
          return (
            <section
              key={row.id}
              data-divergent={row.divergent ? 'true' : 'false'}
              className={cn(
                'rounded-xl border border-border p-3',
                row.divergent ? 'bg-warning/10' : 'bg-card',
              )}
            >
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {tRows(def.labelKey)}
                {row.divergent && (
                  <span
                    className="inline-flex items-center rounded-full border border-warning/30 bg-card px-1.5 py-0.5 text-xs font-semibold normal-case tracking-normal text-warning"
                    title={t('table.divergentTooltip')}
                  >
                    {t('table.divergentShort')}
                  </span>
                )}
              </h3>
              <dl className="space-y-1.5">
                {columns.map((col, colIndex) => (
                  <div key={col.id} className="flex items-baseline justify-between gap-3">
                    <dt className="flex min-w-0 items-baseline gap-1.5 text-xs text-muted-foreground">
                      <Numero n={colIndex + 1} />
                      <span className="truncate">{col.property?.title ?? `#${col.id}`}</span>
                    </dt>
                    <dd className="flex max-w-[60%] shrink-0 justify-end text-right text-sm text-foreground tabular-nums">
                      {col.property ? (
                        formatCell(def, row.values[colIndex], t)
                      ) : (
                        <span className="italic text-muted-foreground">—</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Le repère d'un bien — le même dans la rangée des titres et devant chaque valeur. */
function Numero({ n }: { readonly n: number }) {
  return (
    <span
      aria-hidden="true"
      data-numero={n}
      className="grid size-4.5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold leading-none text-primary-foreground tabular-nums"
    >
      {n}
    </span>
  );
}
