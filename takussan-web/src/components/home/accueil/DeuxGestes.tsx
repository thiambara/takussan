'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Building2 } from 'lucide-react';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { SelecteurDeTransaction, type Transaction } from '@/components/search/SelecteurDeTransaction';
import { ICONES_DE_CATEGORIE } from '@/components/home/icones-de-categorie';
import { categories } from '@/data/navigation';
import { parametreDe } from '@/types/search';
import { cn } from '@/lib/utils';

/**
 * L'URL de la liste pour une catégorie touchée sous la transaction choisie — `''` n'en pose aucune.
 * Exportée pour le test : c'est la règle de l'AC1 (« un toucher ouvre la liste filtrée sur la
 * transaction choisie »).
 */
export function hrefDeCategorie(transaction: Transaction, type: string): string {
  const params = new URLSearchParams();
  if (transaction) params.set(parametreDe('contract_type'), transaction);
  params.set(parametreDe('type'), type);
  return `/properties?${params.toString()}`;
}

/**
 * TCK-2495 (« Deux gestes ») — sous l'en-tête du téléphone : Louer | Acheter, puis la rangée des
 * catégories. Deux touchers, et l'on est dans une liste filtrée.
 *
 * Sous `lg` seulement : au bureau, l'en-tête porte déjà Louer · Acheter et la même bande de
 * catégories (`Navbar`, TCK-2494) — les répéter sous lui doublerait la barre.
 *
 * - **« Louer » d'abord, choisi par défaut** : c'est la transaction la plus cherchée (TCK-633), et la
 *   maquette la montre choisie. Un second appui la retire (`SelecteurDeTransaction`, trois états) :
 *   les catégories ouvrent alors la liste sans transaction.
 * - **Des liens, pas des boutons** : la catégorie est une URL (`/properties?contract_type=rent&type=…`),
 *   rendue dans le HTML servi et suivie par un robot comme par un appui long.
 * - **Pictogramme au-dessus du libellé** : une pastille « icône + libellé » mesure 95 à 140 px, et
 *   l'AC1 veut quatre catégories visibles à 390 px sans défiler. Empilées, elles en mesurent 72 à ~96 :
 *   quatre tiennent, la cinquième dépasse et dit que la rangée défile.
 */
export function DeuxGestes({ className }: { readonly className?: string }) {
  const t = useTranslations('homepage.deuxGestes');
  const tTypes = useTranslations('property.types');
  const [transaction, setTransaction] = useState<Transaction>('rent');

  return (
    <section aria-label={t('label')} className={cn('flex flex-col gap-3', className)}>
      <SelecteurDeTransaction
        valeur={transaction}
        onChange={setTransaction}
        libelles={{ groupe: t('transaction'), rent: t('rent'), sale: t('sale') }}
        className="w-full [&>button]:h-10"
      />
      <ul
        aria-label={t('categories')}
        className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((categorie) => {
          if (!categorie.type) return null;
          const Icone = ICONES_DE_CATEGORIE[categorie.icon] ?? Building2;
          return (
            <li key={categorie.id} className="shrink-0">
              <LienLocalise
                href={hrefDeCategorie(transaction, categorie.type)}
                prefetch={false}
                className="flex min-h-16 min-w-[72px] flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icone className="size-[22px] text-primary-deep" strokeWidth={1.75} aria-hidden="true" />
                <span className="whitespace-nowrap text-xs font-semibold text-foreground">{tTypes(categorie.nameKey)}</span>
              </LienLocalise>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
