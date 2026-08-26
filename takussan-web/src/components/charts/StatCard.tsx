import { cn } from '@/lib/utils';

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  trend?: 'up' | 'down' | 'flat';
  accent?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
};

const accents: Record<NonNullable<Props['accent']>, string> = {
  default: 'bg-card',
  success: 'bg-emerald-50 text-emerald-900',
  warning: 'bg-amber-50 text-amber-900',
  danger: 'bg-rose-50 text-rose-900',
};

const trendMarks: Record<NonNullable<Props['trend']>, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

/**
 * Reusable KPI tile used by every dashboard (TCK-032).
 */
export function StatCard({ label, value, hint, trend, accent = 'default', className }: Props) {
  return (
    <div className={cn('rounded-2xl p-6', accents[accent], className)}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-2 flex items-baseline gap-2 text-2xl font-bold text-foreground">
        {value}
        {trend && (
          <span aria-hidden className="text-sm text-muted-foreground">
            {trendMarks[trend]}
          </span>
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
