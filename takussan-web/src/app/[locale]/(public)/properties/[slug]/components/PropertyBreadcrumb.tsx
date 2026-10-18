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
interface PropertyBreadcrumbProps {
  readonly property: PropertyDetail;
  /** TCK-839 — le chemin canonique du quartier, calculé par la page (`hrefDuQuartier`), s'il est indexable. */
  readonly hrefQuartier?: string;
}

export function PropertyBreadcrumb({ property, hrefQuartier }: PropertyBreadcrumbProps) {
  const t = useTranslations('property.detail');
  const crumbs = maillonsDeFiche(property, t, hrefQuartier);

  return (
    <nav aria-label={t('breadcrumbAria')} className="flex items-center gap-1 text-sm text-muted-foreground">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5" aria-hidden />}
          {c.href ? (
            <LienLocalise href={c.href} className="hover:text-foreground transition-colors">
              {c.libelle}
            </LienLocalise>
          ) : (
            <span aria-current="page" className="text-foreground">{c.libelle}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
