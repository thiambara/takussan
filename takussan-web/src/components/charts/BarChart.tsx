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
  const { labels, series } = data;
  if (labels.length === 0 || series.length === 0) {
    return (
      <div className={className} data-testid="chart-empty">
        <p className="text-sm text-app-ink-muted">Aucune donnée à afficher.</p>
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
      {title && <figcaption className="mb-2 text-sm font-semibold text-app-ink">{title}</figcaption>}
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="h-full w-full"
        role="img"
        aria-label={title ?? 'Graphique barres'}
      >
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
                  className="fill-app-ink-muted text-[10px]"
                  textAnchor="middle"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
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
  const palette = ['fill-emerald-500', 'fill-sky-500', 'fill-amber-500', 'fill-rose-500'];
  return palette[idx % palette.length];
}

function legendDot(idx: number): string {
  const palette = ['bg-emerald-500', 'bg-sky-500', 'bg-amber-500', 'bg-rose-500'];
  return palette[idx % palette.length];
}
