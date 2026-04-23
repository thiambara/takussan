/**
 * French labels for maintenance enums. Keeps display strings out of the
 * component bodies so we can translate them via `next-intl` later
 * without touching the UI.
 */

import type {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
} from '@/types/maintenance';

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  open: 'Ouverte',
  acknowledged: 'Prise en compte',
  assigned: 'Assignée',
  in_progress: 'En cours',
  completed: 'Terminée',
  closed: 'Clôturée',
  cancelled: 'Annulée',
};

export const MAINTENANCE_PRIORITY_LABEL: Record<MaintenancePriority, string> = {
  low: 'Faible',
  medium: 'Normale',
  high: 'Élevée',
  urgent: 'Urgente',
};

export const MAINTENANCE_CATEGORY_LABEL: Record<MaintenanceCategory, string> = {
  plumbing: 'Plomberie',
  electrical: 'Électricité',
  structural: 'Structure',
  appliance: 'Électroménager',
  painting: 'Peinture',
  cleaning: 'Nettoyage',
  pest_control: 'Nuisibles',
  locksmith: 'Serrurerie',
  other: 'Autre',
};

const STATUS_TONE: Record<MaintenanceStatus, string> = {
  open: 'bg-blue-100 text-blue-800',
  acknowledged: 'bg-indigo-100 text-indigo-800',
  assigned: 'bg-violet-100 text-violet-800',
  in_progress: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-200 text-slate-700',
  cancelled: 'bg-red-100 text-red-800',
};

export function maintenanceStatusBadgeClass(status: MaintenanceStatus): string {
  return STATUS_TONE[status] ?? 'bg-gray-100 text-gray-700';
}

const PRIORITY_TONE: Record<MaintenancePriority, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-sky-100 text-sky-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

export function maintenancePriorityBadgeClass(priority: MaintenancePriority): string {
  return PRIORITY_TONE[priority] ?? 'bg-gray-100 text-gray-700';
}
