import { useTranslations } from 'next-intl';

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
  const range = Math.max(max - min, 1);

  const innerW = VIEW_W - PADDING.left - PADDING.right;
  const innerH = VIEW_H - PADDING.top - PADDING.bottom;

  const groupW = innerW / labels.length;
  const seriesCount = series.length;
  const barW = Math.max(4, (groupW * 0.7) / seriesCount);

  const gridLines = [0, 0.5, 1].map((p) => {
    const y = PADDING.top + innerH * (1 - p);
    const label = (min + range * p).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    return { y, label };
  });

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
                    className={s.color ?? defaultColor(seriesIdx)}
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
            <span className={`inline-block h-2 w-2 rounded-full ${legendDot(idx)}`} aria-hidden />
            <span>{s.name}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function defaultColor(idx: number): string {
  const palette = ['fill-chart-1', 'fill-chart-2', 'fill-chart-3', 'fill-chart-4'];
  return palette[idx % palette.length];
}

function legendDot(idx: number): string {
  const palette = ['bg-chart-1', 'bg-chart-2', 'bg-chart-3', 'bg-chart-4'];
  return palette[idx % palette.length];
}
