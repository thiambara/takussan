import { useTranslations } from 'next-intl';

import { LienLocalise } from '@/components/shared/LienLocalise';
import type { LienDeLieu } from '@/lib/liens-de-lieu';

interface QuartiersDeLaVilleProps {
  readonly ville: string;
  readonly liens: readonly LienDeLieu[];
}

/**
 * « Quartiers de <ville> » — TCK-916 (P35.02).
 *
 * Des `<a href>` dans le HTML de la page de ville, vers chacune de ses pages de quartier
 * indexables : les filtres de lieu naviguent par `router.push`, qu'un robot ne suit pas, et ces
 * pages n'étaient atteintes que par le sitemap.
 *
 * Composant SANS directive : la page serveur le construit et le passe à `PropertiesDiscoveryPage`,
 * qui le rend tel quel. `LienLocalise` porte son propre `'use client'`. Sans lien, rien.
 */
export function QuartiersDeLaVille({ ville, liens }: QuartiersDeLaVilleProps) {
  const t = useTranslations('property.discovery');
  if (liens.length === 0) return null;

  return (
    <nav aria-labelledby="quartiers-de-la-ville" className="mt-12 border-t border-border pt-8">
      <h2 id="quartiers-de-la-ville" className="text-base font-semibold text-foreground">
        {t('neighbourhoodsOf', { city: ville })}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {liens.map((lien) => (
          <li key={lien.href}>
            <LienLocalise
              href={lien.href}
              className="inline-flex min-h-11 items-center text-[15px] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-9"
            >
              {lien.libelle}
            </LienLocalise>
          </li>
        ))}
      </ul>
    </nav>
  );
}
