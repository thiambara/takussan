'use client';

import { useSearchParams } from 'next/navigation';
import { Heart } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { EmptyState, ErrorState } from '@/components/feedback';
import { PropertyCard } from '@/components/property/PropertyCard';
import { CARD_SIZES_FAVORITES_PUBLIC } from '@/components/property/card-image-sizes';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { CONTENU_PRINCIPAL_ID } from '@/components/shared/contenu-principal';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { idsDeSelection } from '@/lib/favoris-suivi';
import { usePropertiesByIdsQuery } from '@/lib/queries/favorites';
import { cn } from '@/lib/utils';
import type { PropertyListItem } from '@/types/property';

/**
 * TCK-2508 — la page qu'ouvre le destinataire d'une sélection, en lecture seule.
 *
 * Elle ne lit QUE `?ids=` et l'API publique : rien du propriétaire de la sélection n'existe dans
 * le lien, donc rien ne peut s'en afficher (ni nom, ni note — contrainte du ticket). L'ordre est
 * celui de l'envoi ; un identifiant que `by-ids` ne rend plus (loué, vendu, retiré) disparaît sans
 * un mot. Le destinataire peut mettre un bien dans SES favoris : le cœur de la carte est le sien.
 */
export function SelectionPartagee() {
  const t = useTranslations('favorites.selection');
  const ids = idsDeSelection(useSearchParams().get('ids'));
  const query = usePropertiesByIdsQuery(ids);

  const parId = new Map((query.data?.data ?? []).map((p) => [p.id, p]));
  const biens = ids.map((id) => parId.get(id)).filter((p): p is PropertyListItem => Boolean(p));
  const chargement = ids.length > 0 && query.isLoading;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <NavbarSpacer />
      <main
        id={CONTENU_PRINCIPAL_ID}
        tabIndex={-1}
        className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-10 lg:pt-10 focus:outline-none"
      >
        <header className="mb-6">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-balance lg:text-[2.5rem]">
            {chargement || biens.length === 0 ? t('titreSansCompte') : t('titre', { count: biens.length })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground lg:text-base">{t('sousTitre')}</p>
        </header>

        {chargement ? (
          <div className="grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {Array.from({ length: Math.min(Math.max(ids.length, 3), 6) }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-4/3 w-full rounded-xl" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState message={t('erreur')} onRetry={() => void query.refetch()} retryLabel={t('reessayer')} />
        ) : biens.length === 0 ? (
          <EmptyState
            icon={<Heart className="size-8" aria-hidden="true" />}
            title={t('videTitre')}
            description={t('videTexte')}
            action={
              <LienLocalise href="/properties" className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-4')}>
                {t('cta')}
              </LienLocalise>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-3" data-testid="selection-partagee">
              {biens.map((bien, i) => (
                <PropertyCard key={bien.id} property={bien} index={i} priority={i < 3} sizes={CARD_SIZES_FAVORITES_PUBLIC} />
              ))}
            </div>
            <div className="mt-10 flex justify-center">
              <LienLocalise href="/properties" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-11 px-4')}>
                {t('cta')}
              </LienLocalise>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
