'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { Pagination } from '@/components/console';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PaginationMeta } from '@/types/api';
import { useTranslations } from 'next-intl';

/**
 * L'ADAPTATEUR D'URL de la pagination du tableau de bord — et rien d'autre depuis TCK-380.
 *
 * Il ne dessine plus de pagination : les boutons, leur état désactivé et l'arithmétique de page
 * appartiennent à `console/Pagination`, qui les décide pour les trois espaces. Ce fichier ne
 * garde que ce qui le distingue réellement, et que la primitive n'a aucune raison de connaître :
 *
 *   1. **La page vit dans la CHAÎNE DE REQUÊTE**, pour qu'un filtre plus une page se partagent
 *      par un lien. C'est ce que `console/Pagination` ne fait pas — elle pilote un état React.
 *   2. **Le sélecteur de densité** (10 / 20 / 50 par page), qui remet la page à 1 quand il change.
 *   3. Le compte de résultats.
 *
 * ## Pourquoi ce fichier n'a PAS été supprimé
 *
 * L'AC2 de TCK-380 demandait sa suppression. Mesuré le 2026-08-27 avant d'implémenter : il a
 * **sept points d'appel** — `/app/properties`, `/app/customers`, `InvoicesTable`, `PayoutsTable`,
 * `PaymentsHistoryTable`, `DocumentsLibrary` — et le remplacer par `console/Pagination` nue aurait
 * retiré l'état d'URL ET le sélecteur de densité de ces sept écrans. C'est un changement de
 * comportement, que les contraintes strictes du même ticket interdisent (« pas de taille de page
 * changée »), et c'est exactement la fusion que le docblock de `console/Pagination` refuse depuis
 * TCK-373 : *« Fusionner les trois produirait un composant à trois modes, c'est-à-dire trois
 * composants dans un fichier. »*
 *
 * Ce qui était vraiment dupliqué — la paire de boutons et `page ± 1` — a disparu. Le reste est un
 * adaptateur de ~30 lignes, et la seconde moitié de l'AC2 (« aucun fichier de la clôture ne
 * calcule `page + 1` / `page - 1` en dehors de `console/Pagination` ») est tenue.
 *
 * ⚠ Les libellés viennent désormais de `console.pagination` et non de
 * `property.dashboard.pagination`. Vérifié clé par clé dans les TROIS locales avant la bascule :
 * `aria`, `previous`, `next` et `position`/`pageOf` portent des textes identiques en `fr`, `en` et
 * `wo`. Rien de visible ne change ; c'est une bascule de clé, pas de texte.
 */

const PER_PAGE_OPTIONS = ['10', '20', '50'] as const;

export function PropertyPagination({ meta }: { meta: PaginationMeta }) {
  const t = useTranslations('property.dashboard.pagination');
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentPerPage = String(meta.per_page ?? 20);

  const goTo = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) {
        params.delete('page');
      } else {
        params.set('page', String(page));
      }
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const setPerPage = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === '20') {
        params.delete('per_page');
      } else {
        params.set('per_page', value);
      }
      params.delete('page');
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const items = PER_PAGE_OPTIONS.map((v) => ({ value: v, label: `${v} / page` }));

  return (
    <Pagination
      page={meta.current_page}
      lastPage={Math.max(meta.last_page, 1)}
      onChange={goTo}
      summary={
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {t('pageOf', {
              current: meta.current_page,
              total: Math.max(meta.last_page, 1),
            })}{' '}
            · {t('results', { count: meta.total })}
          </span>
          <div className="hidden sm:block">
            <Select
              value={currentPerPage}
              onValueChange={(v) => setPerPage((v ?? '20') as string)}
              items={items}
            >
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue placeholder={t('perPagePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {items.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      }
    />
  );
}
