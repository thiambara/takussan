'use client';

import { Activity, BadgeCheck, Clock, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type { PipelineStats } from '@/types/pipeline';

interface PipelineStatsBarProps {
  stats: PipelineStats | undefined;
  isLoading?: boolean;
  onClickWidget?: (id: WidgetId) => void;
}

export type WidgetId =
  | 'active'
  | 'new_this_week'
  | 'conversion_rate'
  | 'avg_qualified';

interface WidgetDef {
  id: WidgetId;
  icon: React.ComponentType<{ className?: string }>;
  labelKey: string;
  value: (s: PipelineStats) => string;
  helpKey?: string;
}

function activeCount(s: PipelineStats): number {
  // active = everyone NOT in a terminal stage (lost / converted are
  // archived for the purposes of the widget).
  const c = s.stage_counts;
  return (
    (c.lead ?? 0) +
    (c.prospect ?? 0) +
    (c.qualified ?? 0) +
    (c.negotiating ?? 0)
  );
}

const WIDGETS: readonly WidgetDef[] = [
  {
    id: 'active',
    icon: Users,
    labelKey: 'stats.active',
    value: (s) => String(activeCount(s)),
  },
  {
    id: 'new_this_week',
    icon: Activity,
    labelKey: 'stats.changes30d',
    value: (s) => String(s.stage_changes_last_30d ?? 0),
  },
  {
    id: 'conversion_rate',
    icon: BadgeCheck,
    labelKey: 'stats.conversionRate',
    value: (s) =>
      `${Math.round((s.conversion_rate ?? 0) * 1000) / 10} %`,
  },
  {
    id: 'avg_qualified',
    icon: Clock,
    labelKey: 'stats.avgQualified',
    value: (s) => {
      const days = s.avg_time_in_stage?.qualified ?? 0;
      return `${Math.round(days * 10) / 10} j`;
    },
  },
];

export function PipelineStatsBar({
  stats,
  isLoading,
  onClickWidget,
}: PipelineStatsBarProps) {
  const t = useTranslations('crm.pipeline');

  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
      data-testid="pipeline-stats-bar"
    >
      {WIDGETS.map((w) => {
        const Icon = w.icon;
        return (
          <button
            key={w.id}
            type="button"
            onClick={() => onClickWidget?.(w.id)}
            disabled={!stats || !onClickWidget}
            className={cn(
              'flex items-center gap-3 rounded-lg border border-muted bg-card p-4 text-left transition',
              onClickWidget && 'hover:border-primary/40 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30',
              !onClickWidget && 'cursor-default',
            )}
          >
            <span
              aria-hidden
              className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                {t(w.labelKey)}
              </p>
              <p className="mt-0.5 text-xl font-bold text-foreground">
                {isLoading || !stats ? '—' : w.value(stats)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
