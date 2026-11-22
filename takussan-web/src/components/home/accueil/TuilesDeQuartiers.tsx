'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { EnTeteDeRangee } from '@/components/property/cards/EnTeteDeRangee';
import { TAILLES_DE_TUILE, TuileDeQuartier } from '@/components/home/accueil/TuileDeQuartier';
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
 * TCK-2844 (ADR-0109) — **la photo du quartier, quand le super-admin en a posé une** : la tuile est
 * alors celle de la maquette (`TuileQuartier`, ADR-0106), photo plein cadre centrée sous un dégradé.
 * Sans photo — ou si elle ne se charge pas —, le motif bogolan de la rangée signature, à 6 %, sous le
 * nom et le compte : jamais la photo d'un bien prise pour celle du quartier.
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
            <TuileDeQuartier
              // La photo dans la clé : une URL neuve repart sans l'échec de chargement de l'ancienne.
              key={quartier.photo ?? ''}
              nom={quartier.nom}
              compte={t('count', { count: quartier.compte })}
              photo={quartier.photo}
              href={hrefDeQuartier(ville, quartier.nom)}
              sizes={TAILLES_DE_TUILE}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
