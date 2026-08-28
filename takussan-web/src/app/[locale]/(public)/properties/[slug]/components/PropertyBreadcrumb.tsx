import { LienLocalise } from '@/components/shared/LienLocalise';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { maillonsDeFiche } from '@/lib/fil-d-ariane';
import type { PropertyDetail } from '@/types/property';

/**
 * ⚠️ **La liste des maillons n'est plus calculée ici** (TCK-435) : elle vient de
 * `maillonsDeFiche`, que la `page.tsx` appelle aussi pour en tirer le `BreadcrumbList` JSON-LD.
 *
 * Le fil était affiché à l'utilisateur et invisible au moteur ; le recalculer côté serveur aurait
 * produit deux fils qui se ressemblent, et qui divergeraient au premier changement. Ce composant
 * ne décide donc plus QUOI afficher, seulement COMMENT.
 */
export function PropertyBreadcrumb({ property }: { property: PropertyDetail }) {
  const t = useTranslations('property.detail');
  const crumbs = maillonsDeFiche(property, t);

  return (
    <nav aria-label={t('breadcrumbAria')} className="flex items-center gap-1 text-sm text-stone-500">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
          {c.href ? (
            <LienLocalise href={c.href} className="hover:text-foreground transition-colors">
              {c.libelle}
            </LienLocalise>
          ) : (
            <span className="text-stone-700">{c.libelle}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
