import { useLocale, useTranslations } from 'next-intl';

import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { etiquetteMois } from './abscisses';
import { pastilleSerie, traitSerie } from './palette';
import { pourcent } from './repere';
import type { ChartData } from './types';

const PADDING = { top: 16, right: 16, bottom: 28, left: 40 };
const VIEW_W = 640;
const VIEW_H = 260;
/**
 * Le repère de tracé — même construction que `BarChart`, dont l'en-tête porte le raisonnement
 * (TCK-532) : les étiquettes étaient des `<text>` en `text-[10px]` DANS un SVG mis à l'échelle,
 * donc sous 5 px sur téléphone. Elles sont désormais du HTML en `text-xs` placé en pourcentages ;
 * le tracé seul reste en SVG, étiré sur sa cellule, trait en `non-scaling-stroke`.
 */
const TRACE = {
  x: PADDING.left,
  y: PADDING.top,
  largeur: VIEW_W - PADDING.left - PADDING.right,
  hauteur: VIEW_H - PADDING.top - PADDING.bottom,
};

/**
 * La hauteur de la figure quand l'appelant n'en donne pas. Le SVG suivait le ratio 640/260 de sa
 * largeur ; étiré sur sa cellule (TCK-532), il n'a plus de hauteur propre, et le plancher
 * `min-h-40` seul rendait un tracé de 132 px sur 939 de large à 1366 px (mesuré 2026-09-16).
 */
const HAUTEUR_PAR_DEFAUT = 'h-64 lg:h-80';

type Props = {
  data: ChartData;
  title?: string;
  unit?: string;
  className?: string;
  /**
   * `'mois'` : les étiquettes sont des mois `AAAA-MM` (séries temporelles de l'API), rendus en mois
   * abrégé + année dans la locale active — cf. `etiquetteMois`. Sans valeur, rendues telles quelles.
   */
  abscisses?: 'mois';
};

/**
 * Lightweight responsive line chart (server-rendered). See
 * `components/charts/README.md` for the library-choice rationale.
 */
export function LineChart({ data, title, unit, className, abscisses }: Props) {
  // Le hook se place AVANT la sortie anticipée (React Compiler, ADR-0015).
  const t = useTranslations('charts');
  // L'axe suit la locale ACTIVE, jamais une locale écrite dans le code (TCK-374).
  const brute = useLocale();
  const locale = isLocale(brute) ? brute : DEFAULT_LOCALE;
  const { series } = data;
  const labels = abscisses === 'mois' ? data.labels.map((l) => etiquetteMois(l, locale)) : data.labels;
  if (labels.length === 0 || series.length === 0) {
    return (
      <div
        className={className}
        data-testid="chart-empty"
      >
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    );
  }

  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(...allValues, 0);
  const min = Math.min(...allValues, 0);
  // Le plancher à 1 protège la division par zéro de `toPath`, et rien d'autre : il ne remonte pas
  // jusqu'aux étiquettes, cf. `gridLines`.
  const range = Math.max(max - min, 1);

  const innerH = TRACE.hauteur;

  const toPath = (values: number[]) =>
    values
      .map((v, i) => {
        const x = left + xStep * i;
        const y = PADDING.top + innerH - ((v - min) / range) * innerH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  /**
   * Les graduations de l'axe des ordonnées.
   *
   * ⚠ Même correctif que `BarChart`, et le défaut y était PIRE (revue de TCK-374, défaut D5) :
   * `range` plancherait à 1 sur une série plate, et les cinq graduations rendaient
   * **`['0', '0', '1', '1', '1']`** — quatre étiquettes en double, sur un mois de revenus à zéro.
   * L'étendue RÉELLE gouverne donc les étiquettes, et deux graduations qui portent le même texte
   * une fois arrondies sont réduites à une. Le raisonnement complet est dans `BarChart.tsx`.
   */
  const etendue = max - min;
  const gridLines = (etendue > 0 ? [0, 0.25, 0.5, 0.75, 1] : [0]).reduce<
    { y: number; label: string }[]
  >((acc, p) => {
    const y = PADDING.top + innerH * (1 - p);
    const label = formatNumber(min + etendue * p, locale, { maximumFractionDigits: 0 });
    if (acc.some((g) => g.label === label)) return acc;
    return [...acc, { y, label }];
  }, []);

  const left = TRACE.x;
  const innerW = TRACE.largeur;
  const xStep = labels.length > 1 ? innerW / (labels.length - 1) : 0;
  // Au plus huit abscisses, une sur deux de celles-là dans un cadre étroit (< 36rem), une sur
  // quatre sous 16.5rem. Vérification adverse de TCK-532 : à 320 px (tracé de 165 px), la première
  // abscisse (alignée à gauche) et la troisième (centrée à 4/11) se chevauchaient déjà avec
  // `2025-10` ; formatées (`sept. 2026`, ~62 px), il faut 4/11 × L ≥ 1,5 × 62, soit L ≥ 256 px.
  const pas = labels.length > 8 ? Math.ceil(labels.length / 8) : 1;
  const affichees = labels.flatMap((l, i) => (i % pas === 0 ? [{ l, i }] : []));
  const eclaircir = affichees.length > 4;

  return (
    <figure className={cn('flex flex-col', className ?? HAUTEUR_PAR_DEFAUT)} data-testid="line-chart">
      {title && <figcaption className="mb-2 text-sm font-semibold text-foreground">{title}</figcaption>}
      <div className="grid min-h-40 flex-1 grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 pt-2">
        {/* Axe des ordonnées : étiquettes empilées dans une seule cellule, cf. `BarChart`. */}
        <div className="col-start-1 row-start-1 grid" aria-hidden>
          {gridLines.map((g, i) => (
            <span
              key={i}
              data-chart-axis="y"
              className="relative col-start-1 row-start-1 -translate-y-1/2 self-start justify-self-end whitespace-nowrap text-xs leading-4 tabular-nums text-muted-foreground"
              style={{ top: pourcent((g.y - TRACE.y) / TRACE.hauteur) }}
            >
              {g.label}
              {unit ? ` ${unit}` : ''}
            </span>
          ))}
        </div>
        <div className="relative col-start-2 row-start-1">
          {gridLines.map((g, i) => (
            <div
              key={i}
              aria-hidden
              className="absolute inset-x-0 border-t border-dashed border-border"
              style={{ top: pourcent((g.y - TRACE.y) / TRACE.hauteur) }}
            />
          ))}
          <svg
            viewBox={`${TRACE.x} ${TRACE.y} ${TRACE.largeur} ${TRACE.hauteur}`}
            preserveAspectRatio="none"
            className="absolute inset-0 size-full overflow-visible"
            role="img"
            aria-label={title ?? t('lineAria')}
          >
            {series.map((s, idx) => (
              <path
                key={s.name}
                d={toPath(s.values)}
                className={s.color ?? traitSerie(idx)}
                fill="none"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </div>
        {/*
          Abscisses : le premier point est au bord gauche du tracé, le dernier au bord droit. Une
          étiquette CENTRÉE sur eux déborderait du cadre de moitié — elles s'alignent donc sur leur
          bord, et seules les intermédiaires se centrent.
        */}
        <div className="@container relative col-start-2 row-start-2 h-4" aria-hidden>
          {affichees.map(({ l, i }, rang) => {
            const fraction = labels.length > 1 ? (xStep * i) / innerW : 0;
            return (
              <span
                key={l + i}
                data-chart-axis="x"
                className={cn(
                  'absolute top-0 whitespace-nowrap text-xs leading-4 text-muted-foreground',
                  i === 0 ? '' : i === labels.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
                  eclaircir && rang % 2 === 1 && '@max-[36rem]:hidden',
                  eclaircir && rang % 4 === 2 && '@max-[16.5rem]:hidden',
                )}
                style={{ left: pourcent(fraction) }}
              >
                {l}
              </span>
            );
          })}
        </div>
      </div>
      {/* Legend */}
      <ul className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {series.map((s, idx) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${pastilleSerie(s.color, idx)}`} aria-hidden />
            <span>{s.name}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
