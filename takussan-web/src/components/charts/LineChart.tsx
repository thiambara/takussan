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
 * Lightweight responsive line chart (server-rendered). See
 * `components/charts/README.md` for the library-choice rationale.
 */
export function LineChart({ data, title, unit, className }: Props) {
  // Le hook se place AVANT la sortie anticipée (React Compiler, ADR-0015).
  const t = useTranslations('charts');
  const { labels, series } = data;
  if (labels.length === 0 || series.length === 0) {
    return (
      <div
        className={className}
        data-testid="chart-empty"
      >
        <p className="text-sm text-app-ink-muted">{t('empty')}</p>
      </div>
    );
  }

  const allValues = series.flatMap((s) => s.values);
  const max = Math.max(...allValues, 0);
  const min = Math.min(...allValues, 0);
  const range = Math.max(max - min, 1);

  const innerW = VIEW_W - PADDING.left - PADDING.right;
  const innerH = VIEW_H - PADDING.top - PADDING.bottom;

  const xStep = labels.length > 1 ? innerW / (labels.length - 1) : 0;

  const toPath = (values: number[]) =>
    values
      .map((v, i) => {
        const x = PADDING.left + xStep * i;
        const y = PADDING.top + innerH - ((v - min) / range) * innerH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((p) => {
    const y = PADDING.top + innerH * (1 - p);
    const label = (min + range * p).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
    return { y, label };
  });

  return (
    <figure className={className} data-testid="line-chart">
      {title && <figcaption className="mb-2 text-sm font-semibold text-app-ink">{title}</figcaption>}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-full w-full"
        role="img"
        aria-label={title ?? t('lineAria')}
      >
        {/* Gridlines + y-axis labels */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line
              x1={PADDING.left}
              x2={VIEW_W - PADDING.right}
              y1={g.y}
              y2={g.y}
              className="stroke-app-surface-3"
              strokeDasharray="2 3"
            />
            <text
              x={PADDING.left - 6}
              y={g.y + 4}
              className="fill-app-ink-muted text-[10px]"
              textAnchor="end"
            >
              {g.label}
              {unit ? ` ${unit}` : ''}
            </text>
          </g>
        ))}
        {/* X-axis labels (every other if >8) */}
        {labels.map((l, i) => {
          if (labels.length > 8 && i % Math.ceil(labels.length / 8) !== 0) return null;
          const x = PADDING.left + xStep * i;
          return (
            <text
              key={l + i}
              x={x}
              y={VIEW_H - 8}
              className="fill-app-ink-muted text-[10px]"
              textAnchor="middle"
            >
              {l}
            </text>
          );
        })}
        {/* Series */}
        {series.map((s, idx) => (
          <path
            key={s.name}
            d={toPath(s.values)}
            className={s.color ?? defaultColor(idx)}
            fill="none"
            strokeWidth={2}
          />
        ))}
      </svg>
      {/* Legend */}
      <ul className="mt-2 flex flex-wrap gap-3 text-xs text-app-ink-muted">
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
  const palette = ['stroke-emerald-500', 'stroke-sky-500', 'stroke-amber-500', 'stroke-rose-500'];
  return palette[idx % palette.length];
}

function legendDot(idx: number): string {
  const palette = ['bg-emerald-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500'];
  return palette[idx % palette.length];
}
