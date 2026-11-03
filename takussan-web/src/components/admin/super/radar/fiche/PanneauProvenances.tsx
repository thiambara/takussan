'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';

import { StatusBadge } from '@/components/console';
import { Button } from '@/components/ui/button';
import type { ApiError } from '@/lib/api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import { radarKeys, unmergeRadarListing } from '@/lib/queries/radar';
import type { RadarListingDetail, RadarListingDetailResponse, RadarProvenance } from '@/types/radar';
import { useMessageEchecFiche } from './useMessageEchecFiche';

/**
 * Le panneau ne dit quelque chose que s'il y a plus d'une provenance, ou si la collecte a relevé la présence de
 * l'annonce : une saisie isolée n'a qu'une provenance, déjà montrée par la source.
 */
export function provenancesAMontrer(detail: RadarListingDetail): readonly RadarProvenance[] {
  const provenances = detail.provenances ?? [];
  return provenances.length > 1 || provenances.some((p) => p.crawled) ? provenances : [];
}

const LIEN = 'inline-flex items-center gap-1 rounded-sm text-sm text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * TCK-2392 (AC3, AC7) — les provenances de la fiche : l'annonce qui fait foi et ses doublons, chacun avec son site, sa
 * présence relevée par la collecte et son dernier prix. Une fusion AUTOMATIQUE se sépare d'ici (« Séparer ») : l'annonce
 * revient à relire, et n'est pas fusionnée de nouveau. Un doublon posé à la main ne se sépare pas ici.
 */
export function PanneauProvenances({ detail }: { readonly detail: RadarListingDetail }) {
  const t = useTranslations('superAdmin.pages.radar.listing.provenances');
  const tRadar = useTranslations('superAdmin.pages.radar');
  const fmt = useFormatteurs();
  const messageEchec = useMessageEchecFiche();
  const queryClient = useQueryClient();
  const separer = useMutation<RadarListingDetailResponse, ApiError, number>({
    mutationFn: (id) => unmergeRadarListing(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: radarKeys.all });
    },
  });

  const provenances = provenancesAMontrer(detail);
  if (provenances.length === 0) return null;

  return (
    <section aria-labelledby="radar-provenances-titre" className="space-y-2" data-testid="radar-provenances">
      <h3 id="radar-provenances-titre" className="text-sm font-semibold text-foreground">{t('heading')}</h3>
      {provenances.length > 1 ? <p className="text-xs text-muted-foreground">{t('intro')}</p> : null}
      <ul className="space-y-2">
        {provenances.map((p) => {
          const courante = p.listing_id === detail.id;
          return (
            <li key={p.listing_id} className="space-y-1.5 rounded-lg border bg-card p-3" data-testid={`radar-provenance-${p.listing_id}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-foreground">{tRadar(`sites.${p.source_site}`)}</span>
                <StatusBadge tone={p.is_root ? 'info' : 'neutral'} label={p.is_root ? t('root') : t('duplicate')} />
                {p.merged_at ? <StatusBadge tone="attention" label={t('automatic')} /> : null}
                {courante ? <span className="text-xs text-muted-foreground">{t('current')}</span> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {[
                  p.crawled ? t('crawled') : null,
                  p.first_seen_at && p.last_seen_at
                    ? t('seen', { first: fmt.date(p.first_seen_at), last: fmt.date(p.last_seen_at) })
                    : null,
                  p.last_price == null ? null : t('lastPrice', { price: fmt.montant(p.last_price, 'XOF') }),
                ].filter(Boolean).join(' · ')}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {courante ? null : (
                  <Link href={`/super-admin/radar/${p.listing_id}`} className={LIEN}>{t('open', { id: p.listing_id })}</Link>
                )}
                {p.source_url ? (
                  <a href={p.source_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={LIEN}>
                    {t('source')}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                ) : null}
                {p.merged_at && !p.is_root ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={separer.isPending}
                    title={t('unmergeHint')}
                    onClick={() => separer.mutate(p.listing_id)}
                    data-testid={`radar-separer-${p.listing_id}`}
                  >
                    {t('unmerge')}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {separer.isError ? <p role="alert" className="text-sm text-destructive">{messageEchec(separer.error)}</p> : null}
    </section>
  );
}
