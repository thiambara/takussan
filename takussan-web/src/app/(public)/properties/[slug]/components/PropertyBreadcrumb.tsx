import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { PropertyDetail } from '@/types/property';

export function PropertyBreadcrumb({ property }: { property: PropertyDetail }) {
  const contractLabel = property.contract_type === 'rent' ? 'Louer' : 'Acheter';
  const contractHref = property.contract_type === 'rent' ? '/properties?contract_type=rent' : '/properties?contract_type=sale';

  const crumbs: Array<{ label: string; href?: string }> = [
    { label: 'Accueil', href: '/' },
    { label: contractLabel, href: contractHref },
  ];
  if (property.location.city) {
    crumbs.push({
      label: property.location.city,
      href: `/properties?city=${encodeURIComponent(property.location.city)}`,
    });
  }
  if (property.location.quarter) {
    crumbs.push({ 
      label: property.location.quarter,
      href: `/properties?location=${encodeURIComponent(property.location.quarter)}`,
    });
  }

  return (
    <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 text-sm text-stone-500">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
          {c.href ? (
            <Link href={c.href} className="hover:text-slate-700 transition-colors">
              {c.label}
            </Link>
          ) : (
            <span className="text-stone-700">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
