'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Wrench } from 'lucide-react';
import { useLeases, type LeaseWithRelations } from '@/lib/queries/leases';
import { EmptyState, ErrorState } from '@/components/feedback';
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
  const t = useTranslations('maintenance.launcher');
  const tCommon = useTranslations('common');
  const leasesQuery = useLeases({ status: 'active', per_page: 50 });
  const { data, isLoading, isError } = leasesQuery;

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
      <ErrorState
        message={t('error')}
        onRetry={() => void leasesQuery.refetch()}
        retryLabel={tCommon('actions.retry')}
      />
    );
  }

  if (options.length === 0) {
    return (
      <EmptyState
        icon={<Wrench className="size-8" aria-hidden="true" />}
        title={t('empty_title')}
        description={t('empty_description')}
      />
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
