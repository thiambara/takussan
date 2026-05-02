import { StatCard } from '@/components/charts/StatCard';

type Props = {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'default' | 'success' | 'warning' | 'danger';
};

/**
 * Specialised wrapper around `StatCard` for the agency dashboard. Kept as a
 * named component so the AC ("composants `AgencyKpiTile`…") can be satisfied
 * without duplicating the underlying tile markup.
 */
export function AgencyKpiTile({ label, value, hint, accent = 'default' }: Props) {
  return <StatCard label={label} value={value} hint={hint} accent={accent} />;
}
