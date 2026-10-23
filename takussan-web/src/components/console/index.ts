/**
 * Les primitives de la console qui se rendent côté serveur.
 *
 * TCK-1771 (P173.01) — aucun module `'use client'` ne se réexporte ici : `DataTable`,
 * `DebouncedSearchInput`, `FilterBar` et `Pagination` se prennent à leur propre fichier
 * (`@/components/console/DataTable`…). Réexportés, ils entraient dans le graphe client de toute
 * entrée qui ne prenait ici que `RouteSkeleton` ou `PageHeader` (les 44 `loading.tsx` de la console
 * compris). Garde : `__tests__/index-sans-composant-client.test.ts`.
 */
export { DataState } from './DataState';
export type { DataStateProps } from './DataState';
export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';
export { RouteSkeleton } from './RouteSkeleton';
export type { RouteSkeletonProps, RouteSkeletonVariant } from './RouteSkeleton';
export { StatCard } from './StatCard';
export type { StatCardProps } from './StatCard';
export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps, StatusTone } from './StatusBadge';
