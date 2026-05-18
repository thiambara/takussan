'use client';

import { useMemo, useState } from 'react';
import { useLeases, type LeaseWithRelations } from '@/lib/queries/leases';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MaintenanceForm } from './MaintenanceForm';

interface MaintenanceNewLauncherProps {
  /** Optional `?property=` from the URL — pre-selects when valid for the user. */
  readonly initialPropertyId?: number | null;
  /** Optional `?lease=` from the URL — passed through to the form. */
  readonly initialLeaseId?: number | null;
}

/**
 * TCK-174 — customer-side launcher for a new maintenance request.
 *
 * Loads the active leases of the connected user, exposes the linked
 * properties through a `Bien concerné` selector, and renders the
 * existing `<MaintenanceForm>` once a target is picked.
 *
 * Auto-selection rules:
 *  - 1 lease → that lease's property is pre-selected silently.
 *  - `?property=X` is honoured if it matches one of the user's leases.
 *  - 0 lease → empty state with a contact-agency hint.
 */
export function MaintenanceNewLauncher({
  initialPropertyId = null,
}: MaintenanceNewLauncherProps) {
  const { data, isLoading, isError } = useLeases({ status: 'active', per_page: 50 });

  const options = useMemo(() => {
    const leases = (data?.data ?? []) as LeaseWithRelations[];
    return leases
      .filter((l): l is LeaseWithRelations & { property: NonNullable<LeaseWithRelations['property']> } =>
        Boolean(l.property?.id),
      )
      .map((l) => ({
        propertyId: l.property.id,
        leaseId: l.id,
        label: l.property.title ?? `Bien #${l.property.id}`,
      }));
  }, [data]);

  const [manualPropertyId, setManualPropertyId] = useState<number | null>(null);

  const selected = useMemo(() => {
    if (options.length === 0) return null;

    const propertyId = manualPropertyId ?? initialPropertyId;
    if (propertyId) {
      return options.find((o) => o.propertyId === propertyId) ?? null;
    }

    return options.length === 1 ? options[0] : null;
  }, [options, manualPropertyId, initialPropertyId]);

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-xl bg-app-surface-1" />;
  }

  if (isError) {
    return (
      <p className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        Impossible de charger vos baux. Réessayez ou contactez le support.
      </p>
    );
  }

  if (options.length === 0) {
    return (
      <div className="rounded-2xl bg-app-surface-1 p-8 text-center text-sm text-app-ink-muted">
        Vous n&apos;avez aucun bail actif. Pour signaler un problème, contactez votre agence.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <label htmlFor="maintenance-property" className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Bien concerné
        </label>
        <div className="mt-2">
          <Select
            value={selected ? String(selected.propertyId) : ''}
            onValueChange={(v) => {
              const pick = options.find((o) => String(o.propertyId) === v);
              setManualPropertyId(pick?.propertyId ?? null);
            }}
            items={options.map((o) => ({ value: String(o.propertyId), label: o.label }))}
          >
            <SelectTrigger id="maintenance-property" className="w-full">
              <SelectValue placeholder="Sélectionnez le bien à signaler" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.propertyId} value={String(o.propertyId)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selected && (
        <MaintenanceForm
          key={selected.propertyId}
          propertyId={selected.propertyId}
          leaseId={selected.leaseId}
        />
      )}
    </div>
  );
}
