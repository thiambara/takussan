import { useTranslations } from 'next-intl';

import type { PropertyDetail } from '@/types/property';

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between py-3 border-b border-stone-100">
      <span className="text-stone-500">{label}</span>
      <span className="font-medium text-stone-900">{value}</span>
    </div>
  );
}

export function PropertyCharacteristics({ property }: { property: PropertyDetail }) {
  const t = useTranslations('property.detail');
  const rows: Array<{ label: string; value: string | number | null | undefined }> = [
    { label: t('rows.type'), value: property.type_label },
    { label: t('rows.contract'), value: property.contract_type_label },
    { label: t('rows.period'), value: property.rent_period_label },
    { label: t('rows.status'), value: property.status_label },
    {
      label: t('rows.floor'),
      value:
        property.floor_number !== null && property.total_floors
          ? `${property.floor_number} / ${property.total_floors}`
          : property.floor_number ?? property.total_floors ?? null,
    },
    { label: t('rows.yearBuilt'), value: property.year_built },
    { label: t('rows.parking'), value: property.parking_spaces },
    { label: t('rows.furnished'), value: property.furnished ? t('rows.yes') : null },
    { label: t('rows.titleDeed'), value: property.title_type_label },
  ];

  const visible = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== '');
  if (visible.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-stone-900">{t('characteristics')}</h2>
      <div className="grid sm:grid-cols-2 gap-x-8 text-sm">
        {visible.map((r) => (
          <Row key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </section>
  );
}
