'use client';

import { cn } from '@/lib/utils';
import type { PermissionCatalogueGroup } from '@/types/admin-roles';

interface PermissionMatrixProps {
  readonly catalogue: readonly PermissionCatalogueGroup[];
  readonly selected: ReadonlySet<string>;
  readonly initial?: ReadonlySet<string>;
  readonly readOnly?: boolean;
  readonly onToggle?: (permission: string, next: boolean) => void;
}

const RESOURCE_LABEL: Record<string, string> = {
  properties: 'Biens',
  bookings: 'Réservations',
  leases: 'Baux',
  lease_payments: 'Paiements de bail',
  customers: 'Clients',
  conversations: 'Conversations',
  messages: 'Messages',
  maintenance_requests: 'Demandes de maintenance',
  property_visits: 'Visites',
  favorites: 'Favoris',
  agencies: 'Agences',
  documents: 'Documents',
  invoices: 'Factures',
  payouts: 'Versements',
  saved_searches: 'Recherches sauvegardées',
  reviews: 'Avis',
  users: 'Utilisateurs',
  roles: 'Rôles',
};

const ACTION_LABEL: Record<string, string> = {
  view: 'Consulter',
  create: 'Créer',
  update: 'Modifier (mes ressources)',
  update_all: 'Modifier (toutes)',
  delete: 'Supprimer (mes ressources)',
  delete_all: 'Supprimer (toutes)',
  refund_deposit: 'Rembourser caution',
  renew: 'Renouveler',
  terminate: 'Résilier',
  rent_review: 'Réviser le loyer',
  rent_review_force: 'Réviser le loyer (forcé)',
  manage_in_agency: 'Gérer dans l’agence',
};

export function PermissionMatrix({
  catalogue,
  selected,
  initial,
  readOnly = false,
  onToggle,
}: PermissionMatrixProps) {
  return (
    <div className="space-y-4" data-testid="permission-matrix">
      {catalogue.map((group) => (
        <fieldset
          key={group.resource}
          className="rounded-md border border-input bg-background p-3"
        >
          <legend className="px-1 text-sm font-semibold text-app-ink">
            {RESOURCE_LABEL[group.resource] ?? group.resource}
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {group.permissions.map((perm) => {
              const checked = selected.has(perm.name);
              const wasInitial = initial?.has(perm.name) ?? checked;
              const dirty = initial !== undefined && checked !== wasInitial;
              return (
                <label
                  key={perm.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-sm',
                    dirty && 'bg-app-accent/5 ring-1 ring-app-accent/30',
                    readOnly && 'cursor-not-allowed opacity-80',
                  )}
                >
                  <input
                    type="checkbox"
                    name={perm.name}
                    checked={checked}
                    disabled={readOnly}
                    onChange={(e) => onToggle?.(perm.name, e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-input text-app-accent focus:ring-app-accent"
                    data-testid={`permission-checkbox-${perm.name}`}
                  />
                  <span className="flex flex-col">
                    <span className="text-app-ink">
                      {ACTION_LABEL[perm.action] ?? perm.action}
                    </span>
                    <span className="text-xs text-app-ink-muted">{perm.name}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
