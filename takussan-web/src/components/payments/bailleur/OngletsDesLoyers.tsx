'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { ONGLETS_DE_PAGE } from '@/components/console/PageHeader';
import { cn } from '@/lib/utils';

import { ONGLETS_DES_LOYERS, type OngletDesLoyers } from './adresse';

/**
 * TCK-2651 — les onglets « Revenus · Versements · Factures · Opérations » de la page « Loyers » : des
 * LIENS (`?tab=`, partageables, que l'historique suit), l'onglet ouvert marqué `aria-current="page"`,
 * soulignés comme `OngletsSoulignes` de la maquette (le patron d'`OngletsDesRapports`).
 *
 * Au téléphone la rangée défile horizontalement, avec un indice visible : un fondu sur le bord qui
 * cache un onglet, posé seulement quand la rangée déborde vraiment (mesuré, jamais supposé).
 * Changer d'onglet garde la période (`period`) et laisse les filtres de l'onglet quitté.
 */
export function OngletsDesLoyers({ actif }: { readonly actif: OngletDesLoyers }) {
  const t = useTranslations('payments.bailleur.onglets');
  const recherche = useSearchParams();
  const rangee = useRef<HTMLElement>(null);
  const [deborde, setDeborde] = useState({ gauche: false, droite: false });

  useLayoutEffect(() => {
    const el = rangee.current;
    if (!el) return;
    const mesurer = () =>
      setDeborde({ gauche: el.scrollLeft > 1, droite: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 });
    mesurer();
    el.addEventListener('scroll', mesurer, { passive: true });
    const observateur = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(mesurer);
    observateur?.observe(el);
    return () => {
      el.removeEventListener('scroll', mesurer);
      observateur?.disconnect();
    };
  }, []);

  const lien = (onglet: OngletDesLoyers) => {
    const params = new URLSearchParams();
    const periode = recherche?.get('period');
    if (periode) params.set('period', periode);
    if (onglet !== 'revenus') params.set('tab', onglet);
    const qs = params.toString();
    return qs ? `?${qs}` : '?';
  };

  return (
    // TCK-2804 — onglets de page (`ONGLETS_DE_PAGE`) hors de `PageHeader` : au téléphone, la rangée commence sous
    // l'en-tête (l'enveloppe y perd sa marge haute), à 14 px du haut comme la maquette (`OngletsSoulignes`, `pt-3.5`),
    // et colle sous l'en-tête au défilement, sur un fond plein. Son bloc conteneur est la page : elle colle jusqu'au bout.
    <div className="relative max-md:sticky max-md:top-0 max-md:z-20" data-slot="onglets-des-loyers">
      <nav
        ref={rangee}
        aria-label={t('aria')}
        {...ONGLETS_DE_PAGE}
        className="-mx-4 flex gap-6 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] max-md:bg-background max-md:pt-3.5 md:mx-0 md:px-0"
      >
        {ONGLETS_DES_LOYERS.map((onglet) => {
          const estActif = onglet === actif;
          return (
            <Link
              key={onglet}
              href={lien(onglet)}
              scroll={false}
              aria-current={estActif ? 'page' : undefined}
              className={cn(
                'relative inline-flex h-11 flex-none items-center whitespace-nowrap rounded-sm text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring lg:h-auto lg:pb-3',
                // TCK-2804 — au téléphone, l'onglet de la maquette : 32 px visibles (texte de 20 + `pb-3`), souligné en
                // bas. L'appui reste à 44 px : un `::before` transparent prolonge le lien de 12 px vers le haut, dans
                // le `pt-3.5` de la rangée (le patron des onglets soulignés de `ui/tabs`, `before:h-controle`).
                'max-md:h-auto max-md:pb-3 max-md:before:absolute max-md:before:inset-x-0 max-md:before:-top-3 max-md:before:bottom-0',
                estActif
                  ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(onglet)}
            </Link>
          );
        })}
      </nav>
      {/* L'indice de défilement : un fondu sur le fond de la page, du côté qui cache un onglet. */}
      {deborde.gauche ? (
        <span aria-hidden="true" data-slot="indice-gauche" className="pointer-events-none absolute inset-y-0 -left-4 w-8 bg-gradient-to-r from-background to-transparent md:left-0" />
      ) : null}
      {deborde.droite ? (
        <span aria-hidden="true" data-slot="indice-droite" className="pointer-events-none absolute inset-y-0 -right-4 w-8 bg-gradient-to-l from-background to-transparent md:right-0" />
      ) : null}
    </div>
  );
}
