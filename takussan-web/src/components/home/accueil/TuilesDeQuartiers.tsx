'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { EnTeteDeRangee } from '@/components/property/cards/EnTeteDeRangee';
import { BogolanPattern } from '@/components/property/cards/BogolanPattern';
import { parametreDe } from '@/types/search';
import type { QuartierDeLAccueil } from '@/lib/queries/raccourcis-de-l-accueil';

/** La liste d'un quartier : sa ville ET son nom, comme une suggestion de quartier choisie (TCK-439). */
export function hrefDeQuartier(ville: string, quartier: string): string {
  const params = new URLSearchParams();
  params.set(parametreDe('city'), ville);
  params.set(parametreDe('location'), quartier);
  return `/properties?${params.toString()}`;
}

/**
 * TCK-2495 — les quartiers de la ville des rangées, en tuiles : une entrée que les portails montrent
 * mal, sans prendre la tête de page.
 *
 * ⚠ **Des tuiles SANS photo** : l'API ne sert aucune image de quartier (`/public/properties/neighborhoods`
 * ne rend que `{value, count}`). Plutôt qu'une photo d'un bien prise pour celle du quartier, le motif
 * bogolan de la rangée signature, à 5 %, sous le nom et le compte.
 *
 * Le compte est celui de la facette de la liste (biens publics de ce quartier) : c'est le nombre que
 * le visiteur retrouvera en arrivant, transaction comprise — aucune n'est posée.
 */
export function TuilesDeQuartiers({
  ville,
  quartiers,
}: {
  readonly ville: string;
  readonly quartiers: readonly QuartierDeLAccueil[];
}) {
  const t = useTranslations('homepage.quartiers');
  const idTitre = useId();

  return (
    <section aria-labelledby={idTitre}>
      <EnTeteDeRangee idTitre={idTitre} title={t('title', { city: ville })}>
        <LienLocalise
          href={`/properties?${parametreDe('city')}=${encodeURIComponent(ville)}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-0.5 whitespace-nowrap text-[0.875rem] font-semibold text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
        >
          {t('viewAll')}
          <ChevronRight aria-hidden="true" className="size-4 text-primary" strokeWidth={2} />
        </LienLocalise>
      </EnTeteDeRangee>
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-8 [&::-webkit-scrollbar]:hidden">
        {quartiers.map((quartier) => (
          <li key={quartier.nom} className="shrink-0">
            <LienLocalise
              href={hrefDeQuartier(ville, quartier.nom)}
              prefetch={false}
              className="group relative isolate flex size-[132px] flex-col justify-end overflow-hidden rounded-xl bg-secondary p-3 transition-[box-shadow,scale] hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:aspect-square sm:size-auto"
            >
              <span aria-hidden="true" className="absolute inset-0 -z-10 text-foreground opacity-[0.06]">
                <BogolanPattern className="h-full w-full" color="currentColor" />
              </span>
              <span className="font-display text-[1.0625rem] font-semibold leading-tight tracking-[-0.02em] text-foreground line-clamp-2">
                {quartier.nom}
              </span>
              <span className="text-[0.8125rem] tabular-nums text-muted-foreground">{t('count', { count: quartier.compte })}</span>
            </LienLocalise>
          </li>
        ))}
      </ul>
    </section>
  );
}
