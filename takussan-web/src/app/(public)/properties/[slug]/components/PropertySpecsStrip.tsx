import { BedDouble, Bath, Ruler, Layers, Calendar, Car } from 'lucide-react';
import type { PropertyDetail } from '@/types/property';

interface Spec {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
  label: string;
}

export function PropertySpecsStrip({ property }: { property: PropertyDetail }) {
  const specs: Spec[] = [];
  if (property.bedrooms) specs.push({ icon: BedDouble, value: property.bedrooms, label: 'Chambres' });
  if (property.bathrooms) specs.push({ icon: Bath, value: property.bathrooms, label: 'SDB' });
  if (property.area) specs.push({ icon: Ruler, value: `${property.area} m²`, label: 'Surface' });
  if (property.total_floors)
    specs.push({ icon: Layers, value: property.total_floors, label: 'Étages' });
  if (property.year_built)
    specs.push({ icon: Calendar, value: property.year_built, label: 'Année' });
  if (property.parking_spaces)
    specs.push({ icon: Car, value: property.parking_spaces, label: 'Parking' });

  if (specs.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 py-4 border-y border-stone-200">
      {specs.map(({ icon: Icon, value, label }) => (
        <div key={label} className="flex items-center gap-3 text-sm">
          <Icon className="size-5 text-stone-500 shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="font-semibold text-stone-900">{value}</div>
            <div className="text-stone-500 text-xs">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
