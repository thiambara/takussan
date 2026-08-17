import { useTranslations } from 'next-intl';

import type { PropertyTag } from '@/types/property';
import { getAmenityIcon } from './amenity-icons';

export function PropertyAmenities({ tags }: { tags: PropertyTag[] }) {
  const t = useTranslations('property.detail');
  const amenities = tags.filter((tag) => tag.type === 'amenity');
  if (amenities.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-stone-900">{t('amenities')}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {amenities.map((tag) => {
          const Icon = getAmenityIcon(tag.icon ?? tag.slug);
          return (
            <div
              key={tag.id}
              className="flex items-center gap-3 rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
            >
              <Icon className="size-5 text-stone-600 shrink-0" />
              <span className="text-stone-800">{tag.name}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
