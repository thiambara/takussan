'use client';

import Link from 'next/link';
import { FileSearch } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { buttonVariants } from '@/components/ui/button';
import { useLeases, type LeaseWithRelations } from '@/lib/queries/leases';

/**
 * TCK-379 — sélection du bail sur `/app/inventories/new` quand aucun `?lease=` n'est fourni.
 *
 * Cet écran affichait jusqu'ici un cul-de-sac : « Aucun bail sélectionné » puis un bouton vers
 * `/app/leases`. Ajouter un bouton « Nouvel état des lieux » sur `/app/inventories` sans corriger
 * ça aurait fabriqué exactement le défaut que le ticket décrit ailleurs — *un lien qui mène à une
 * page vide coche « le lien existe » aussi bien qu'un vrai correctif.* Le geste part d'un bail :
 * l'écran le dit en montrant les baux, au lieu d'envoyer l'agent les chercher.
 *
 * ⚠ Le filtre `status=active` est délibéré : un bail `draft` ou `terminated` n'a pas d'état des
 * lieux à produire. Il est posé côté SERVEUR (`filter[status]`), jamais sur une liste déjà
 * récupérée — cf. `docs/spatie-query-builder.md`.
 */
export function InventoryLeasePicker() {
  const t = useTranslations('inventory.pickLease');
  const tLease = useTranslations('lease');
  const query = useLeases({ status: 'active', per_page: 50 });

  return (
    <QueryBoundary query={query}>
      {(page) => {
        // `useLeases` demande déjà `include=property` + `fields[properties]`, mais se déclare
        // `PaginatedResponse<Lease>` — et `Lease` ne porte aucune relation. L'écart est
        // antérieur à ce ticket et partagé par tous ses appelants ; on le referme ICI, sur le
        // seul site qui lit la relation, plutôt que d'aller changer la signature du hook.
        const baux = page.data as LeaseWithRelations[];
        if (baux.length === 0) {
          return (
            <EmptyState
              icon={<FileSearch className="size-8" aria-hidden="true" />}
              title={t('empty')}
              description={t('description')}
              action={
                <Link href="/app/leases" className={buttonVariants()}>
                  {t('emptyCta')}
                </Link>
              }
            />
          );
        }
        return (
          <ul className="space-y-2">
            {baux.map((lease) => (
              <li
                key={lease.id}
                className="rounded-xl bg-card shadow-sm transition-colors hover:bg-muted"
              >
                <Link
                  href={`/app/inventories/new?lease=${lease.id}`}
                  className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {lease.property?.title
                        ?? tLease('fallbackReference', { id: String(lease.id) })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {lease.reference_number}
                    </p>
                  </div>
                  <span className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    {t('select')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        );
      }}
    </QueryBoundary>
  );
}
