interface StatItem {
  readonly label: string;
  readonly value: number | string | null;
}

interface StatsBarProps {
  readonly items: ReadonlyArray<StatItem>;
}

export function StatsBar({ items }: StatsBarProps) {
  const visible = items.filter((s) => s.value !== null && s.value !== '' && s.value !== 0);

  if (visible.length === 0) return null;

  return (
    <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-4 sm:divide-x sm:divide-border sm:p-0">
      {visible.map((stat) => (
        <div key={stat.label} className="flex flex-col items-start gap-1 sm:items-center sm:p-6">
          <dd className="font-display text-3xl font-semibold text-primary tabular-nums">
            {stat.value}
          </dd>
          <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {stat.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
