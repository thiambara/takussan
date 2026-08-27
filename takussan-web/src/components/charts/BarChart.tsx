import { useLocale, useTranslations } from 'next-intl';

import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { formatNumber } from '@/lib/format';
import { pastilleLegende, remplissageSerie } from './palette';
import type { ChartData } from './types';

const PADDING = { top: 16, right: 16, bottom: 28, left: 40 };
const VIEW_W = 640;
const VIEW_H = 260;

type Props = {
  data: ChartData;
  title?: string;
  unit?: string;
  className?: string;
};

/**
 * Simple vertical bar chart (server-rendered). Pairs with `LineChart`.
 */
export function BarChart({ data, title, unit, className }: Props) {
  // Le hook se place AVANT la sortie anticipée (React Compiler, ADR-0015).
  const t = useTranslations('charts');
  // L'axe suit la locale ACTIVE, jamais une locale écrite dans le code (TCK-374). Le repli couvre
  // l'appelant dont la locale vient d'ailleurs — cookie trafiqué, paramètre d'URL.
  const brute = useLocale();
  const locale = isLocale(brute) ? brute : DEFAULT_LOCALE;
  const { labels, series } = data;
  if (labels.length === 0 || series.length === 0) {
    return (
      <div className={className} data-testid="chart-empty">
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      </div>
    );
  }

  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(...allValues, 0);
  const min = 0;
  // L'échelle des HAUTEURS ne peut pas diviser par zéro. Le plancher à 1 est là pour ça, et
  // pour ça seulement — il ne doit PAS remonter jusqu'aux étiquettes, cf. `graduations`.
  const range = Math.max(max - min, 1);

  const innerW = VIEW_W - PADDING.left - PADDING.right;
  const innerH = VIEW_H - PADDING.top - PADDING.bottom;

  const groupW = innerW / labels.length;
  const seriesCount = series.length;
  const barW = Math.max(4, (groupW * 0.7) / seriesCount);

  /**
   * Les graduations de l'axe des ordonnées.
   *
   * ────────────────────────────────────────────────────────────────────────────────────────────
   * ⚠ POURQUOI L'ÉTIQUETTE NE SE CALCULE PAS SUR `range` (revue de TCK-374, défaut D5)
   * ────────────────────────────────────────────────────────────────────────────────────────────
   *
   * `range` vaut `Math.max(max - min, 1)` : quand la série est PLATE, ce plancher invente un
   * maximum de 1 que rien n'atteint. Le cas n'a rien d'une limite — c'est **un mois de revenus à
   * zéro, l'état ordinaire d'une agence neuve**. L'axe rendait alors :
   *
   *     ['0', '1', '1']   ← deux étiquettes IDENTIQUES, et une échelle qui prétend monter à 1
   *                          au-dessus d'un graphique entièrement plat
   *
   * Les étiquettes se calculent donc sur l'étendue RÉELLE (`max - min`), pas sur le plancher. Et
   * quand cette étendue est nulle, l'axe ne porte plus qu'UNE graduation, sur la ligne de base :
   * il n'y a qu'une valeur à nommer, en annoncer trois serait la répéter.
   *
   * Le repli sur `formatNumber` reste `maximumFractionDigits: 0` — d'où le second filet : deux
   * graduations qui, une fois ARRONDIES, portent le même texte sont réduites à une. Une étendue
   * fractionnaire (une série de taux entre 0 et 1) reproduisait exactement le même défaut avec des
   * valeurs non nulles ; c'est le même défaut, pas un cas voisin.
   */
  const etendue = max - min;
  const gridLines = (etendue > 0 ? [0, 0.5, 1] : [0]).reduce<{ y: number; label: string }[]>(
    (acc, p) => {
      const y = PADDING.top + innerH * (1 - p);
      const label = formatNumber(min + etendue * p, locale, { maximumFractionDigits: 0 });
      if (acc.some((g) => g.label === label)) return acc;
      return [...acc, { y, label }];
    },
    [],
  );

  return (
    <figure className={className} data-testid="bar-chart">
      {title && <figcaption className="mb-2 text-sm font-semibold text-foreground">{title}</figcaption>}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-full w-full"
        role="img"
        aria-label={title ?? t('barAria')}
      >
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              x2={VIEW_W - PADDING.right}
              y1={g.y}
              y2={g.y}
              className="stroke-border"
              strokeDasharray="2 3"
            />
            <text
              x={PADDING.left - 6}
              y={g.y + 4}
              className="fill-muted-foreground text-[10px]"
              textAnchor="end"
            >
              {g.label}
              {unit ? ` ${unit}` : ''}
            </text>
          </g>
        ))}
        {labels.map((label, groupIdx) => {
          const groupX = PADDING.left + groupW * groupIdx;
          return (
            <g key={label + groupIdx}>
              {series.map((s, seriesIdx) => {
                const v = s.values[groupIdx] ?? 0;
                const h = ((v - min) / range) * innerH;
                const x = groupX + (groupW - barW * seriesCount) / 2 + barW * seriesIdx;
                const y = PADDING.top + innerH - h;
                return (
                  <rect
                    key={s.name + groupIdx}
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(0, h)}
                    className={s.color ?? remplissageSerie(seriesIdx)}
                    rx={2}
                  />
                );
              })}
              {labels.length <= 12 && (
                <text
                  x={groupX + groupW / 2}
                  y={VIEW_H - 8}
                  className="fill-muted-foreground text-[10px]"
                  textAnchor="middle"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {series.map((s, idx) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${pastilleLegende(idx)}`} aria-hidden />
            <span>{s.name}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
