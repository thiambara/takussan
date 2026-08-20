'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

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

import { PAYMENT_STATUS_VALUES } from './constants';

const ANY = '__any__';

/** Les valeurs d'enum sont la donnée ; le libellé se résout au rendu (TCK-292). */
const ENTITY_VALUES = ['property', 'lease', 'booking', 'customer'] as const;

export function PaymentsHistoryFilters() {
  const router = useRouter();
  const t = useTranslations('payments.history.filters');
  const tStatus = useTranslations('payments.status');
  const tEntity = useTranslations('payments.history.filters.entities');
  const searchParams = useSearchParams();

  const statusOptions = PAYMENT_STATUS_VALUES.map((value) => ({
    value,
    label: tStatus(value),
  }));
  const entityOptions = ENTITY_VALUES.map((value) => ({
    value,
    label: tEntity(value),
  }));

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
          {t('status')}
        </Label>
        <Select
          value={searchParams.get('status') ?? ANY}
          onValueChange={(v) => update('status', v === ANY ? null : v)}
          items={[{ value: ANY, label: t('allStatuses') }, ...statusOptions]}
        >
          <SelectTrigger id="payments-status" className="w-full">
            <SelectValue placeholder={t('allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t('allStatuses')}</SelectItem>
            {statusOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="payments-entity" className="mb-1.5 block text-xs font-medium">
          {t('entityType')}
        </Label>
        <Select
          value={searchParams.get('entity_type') ?? ANY}
          onValueChange={(v) => update('entity_type', v === ANY ? null : v)}
          items={[{ value: ANY, label: t('allEntities') }, ...entityOptions]}
        >
          <SelectTrigger id="payments-entity" className="w-full">
            <SelectValue placeholder={t('allEntities')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t('allEntities')}</SelectItem>
            {entityOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="payments-entity-id" className="mb-1.5 block text-xs font-medium">
          {t('entityId')}
        </Label>
        <Input
          id="payments-entity-id"
          type="number"
          min={1}
          placeholder={t('entityIdPlaceholder')}
          defaultValue={searchParams.get('entity_id') ?? ''}
          onBlur={(e) => update('entity_id', e.currentTarget.value || null)}
        />
      </div>

      <div>
        <Label htmlFor="payments-from" className="mb-1.5 block text-xs font-medium">
          {t('from')}
        </Label>
        <DatePicker
          id="payments-from"
          value={searchParams.get('date_from') ?? ''}
          onValueChange={(value) => update('date_from', value || null)}
        />
      </div>

      <div>
        <Label htmlFor="payments-to" className="mb-1.5 block text-xs font-medium">
          {t('to')}
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
