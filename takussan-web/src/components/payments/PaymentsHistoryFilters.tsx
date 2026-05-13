'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { PAYMENT_STATUS_LABEL } from './constants';

const ANY = '__any__';

const STATUS_OPTIONS = Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => ({
  value,
  label,
}));

const ENTITY_OPTIONS = [
  { value: 'property', label: 'Bien' },
  { value: 'lease', label: 'Bail' },
  { value: 'booking', label: 'Réservation' },
  { value: 'customer', label: 'Client' },
];

export function PaymentsHistoryFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const update = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === ANY) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      params.delete('page');
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?');
    },
    [router, searchParams],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-5">
      <div>
        <Label htmlFor="payments-status" className="mb-1.5 block text-xs font-medium">
          Statut
        </Label>
        <Select
          value={searchParams.get('status') ?? ANY}
          onValueChange={(v) => update('status', v === ANY ? null : v)}
          items={[{ value: ANY, label: 'Tous' }, ...STATUS_OPTIONS]}
        >
          <SelectTrigger id="payments-status" className="w-full">
            <SelectValue placeholder="Tous" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Tous</SelectItem>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="payments-entity" className="mb-1.5 block text-xs font-medium">
          Type d&apos;entité
        </Label>
        <Select
          value={searchParams.get('entity_type') ?? ANY}
          onValueChange={(v) => update('entity_type', v === ANY ? null : v)}
          items={[{ value: ANY, label: 'Toutes' }, ...ENTITY_OPTIONS]}
        >
          <SelectTrigger id="payments-entity" className="w-full">
            <SelectValue placeholder="Toutes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Toutes</SelectItem>
            {ENTITY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="payments-entity-id" className="mb-1.5 block text-xs font-medium">
          ID entité
        </Label>
        <Input
          id="payments-entity-id"
          type="number"
          min={1}
          placeholder="Ex: 42"
          defaultValue={searchParams.get('entity_id') ?? ''}
          onBlur={(e) => update('entity_id', e.currentTarget.value || null)}
        />
      </div>

      <div>
        <Label htmlFor="payments-from" className="mb-1.5 block text-xs font-medium">
          Du
        </Label>
        <DatePicker
          id="payments-from"
          value={searchParams.get('date_from') ?? ''}
          onValueChange={(value) => update('date_from', value || null)}
        />
      </div>

      <div>
        <Label htmlFor="payments-to" className="mb-1.5 block text-xs font-medium">
          Au
        </Label>
        <DatePicker
          id="payments-to"
          value={searchParams.get('date_to') ?? ''}
          onValueChange={(value) => update('date_to', value || null)}
        />
      </div>
    </div>
  );
}
