'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, FileSearch } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DebouncedSearchInput } from '@/components/console/DebouncedSearchInput';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { buttonVariants } from '@/components/ui/button';
import { useBauxAInventorier } from '@/lib/queries/inventory';

import { nomDuLocataire } from './terrain/parcours';

/**
 * TCK-379 — sélection du bail sur `/app/inventories/new` quand aucun `?lease=` n'est fourni.
 *
 * Cet écran affichait jusqu'ici un cul-de-sac : « Aucun bail sélectionné » puis un bouton vers
 * `/app/leases`. Ajouter un bouton « Nouvel état des lieux » sur `/app/inventories` sans corriger
 * ça aurait fabriqué exactement le défaut que le ticket décrit ailleurs — *un lien qui mène à une
 * page vide coche « le lien existe » aussi bien qu'un vrai correctif.* Le geste part d'un bail :
 * l'écran le dit en montrant les baux, au lieu d'envoyer l'agent les chercher.
 *
 * ⚠ Le filtre `status=active,terminating` est délibéré : un bail `draft` ou `terminated` n'a pas
 * d'état des lieux à produire, un bail en préavis (`terminating`) a celui de sortie (TCK-1438). Il est posé côté SERVEUR (`filter[status]`), jamais sur une liste déjà
 * récupérée — cf. `docs/spatie-query-builder.md`.
 */
export function InventoryLeasePicker() {
  const t = useTranslations('inventory.pickLease');
  const tLease = useTranslations('lease');
  // TCK-2647 (P2 de l'audit) — une RECHERCHE (référence, bien ou locataire, côté serveur), et chaque
  // bail nomme son locataire : « Logement 12 » ne disait pas à l'agent chez qui il allait.
  const [recherche, setRecherche] = useState('');
  const query = useBauxAInventorier(recherche);

  return (
    <div className="space-y-4">
      <DebouncedSearchInput
        value={recherche}
        onCommit={setRecherche}
        placeholder={t('recherche')}
        aria-label={t('recherche')}
        busy={query.isFetching}
      />
      <QueryBoundary query={query}>
        {(page) => {
          const baux = page.data;
          if (baux.length === 0) {
            return (
              <EmptyState
                icon={<FileSearch className="size-8" aria-hidden="true" />}
                title={recherche ? t('aucunResultat') : t('empty')}
                description={recherche ? t('aucunResultatDescription') : t('description')}
                action={
                  recherche ? undefined : (
                    <Link href="/app/leases" className={buttonVariants()}>
                      {t('emptyCta')}
                    </Link>
                  )
                }
              />
            );
          }
          return (
            <ul className="space-y-2">
              {baux.map((lease) => {
                const locataire = nomDuLocataire(lease.tenant);
                return (
                  <li key={lease.id}>
                    <Link
                      href={`/app/inventories/new?lease=${lease.id}`}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[box-shadow,border-color] hover:border-foreground/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {lease.property?.title ?? tLease('fallbackReference', { id: String(lease.id) })}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
                          {locataire ? t('locataireEtBail', { locataire, reference: lease.reference_number ?? `#${lease.id}` }) : lease.reference_number}
                        </p>
                      </div>
                      {/* Toute la ligne est le lien : le « bouton » n'en est que l'affordance visible,
                          en surface `muted` pour ne pas se fondre dans la carte blanche. */}
                      <span
                        className={buttonVariants({
                          variant: 'secondary',
                          size: 'sm',
                          className: 'shrink-0 bg-muted group-hover:bg-border',
                        })}
                      >
                        {t('select')}
                        <ChevronRight aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
