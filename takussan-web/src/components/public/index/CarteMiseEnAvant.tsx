import { BadgeCheck, ChevronRight, Clock, Star } from 'lucide-react';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { isLocale } from '@/i18n/config';
import { formatNumber } from '@/lib/format';
import type { ProfilPublic } from '@/lib/queries/public-profiles';
import { cn } from '@/lib/utils';

import { delaiDeReponse } from './faits-de-profil';
import { Monogramme } from './ProfileCard';

type Props = {
  readonly agence: ProfilPublic;
  /** `/agencies` — la fiche de l'agence. */
  readonly base: string;
};

/**
 * La place « Mise en avant » de l'annuaire — TCK-2521, servie par TCK-2520 (ADR-0092).
 *
 * ⚠ **Elle ne retire RIEN à la liste** : l'agence y garde aussi son rang (décision 1a du porteur),
 * et c'est l'API qui le garantit — `spotlight` est émise À CÔTÉ de `data`. Le front ne la dédoublonne
 * donc pas : une place payante ne change pas l'ordre de la liste.
 *
 * ⚠ **Signalée en clair** (« Mise en avant ») : une place offerte ou vendue qu'on ne dirait pas serait
 * une recommandation déguisée.
 *
 * La couverture est composée de trois biens PUBLICS de l'agence (`cover`, TCK-2518) : aucune photo
 * de couverture à réclamer aux agences. Moins de trois photos → la grille se resserre ; aucune → la
 * carte commence par l'identité, sans cadre vide.
 */
export function CarteMiseEnAvant({ agence, base }: Props) {
  const t = useTranslations('publicProfileIndex');
  const brut = useLocale();
  const locale = isLocale(brut) ? brut : 'fr';

  const photos = agence.cover.slice(0, 3);
  const note = agence.reviews.average;
  const delai = delaiDeReponse(agence.median_response_minutes);
  // Au téléphone, la maquette D pose le badge et le monogramme SUR la couverture ; en bureau, ils
  // restent dans le corps. Un seul élément de chaque, déplacé par CSS : le badge reste lu une fois,
  // et rien n'est rendu deux fois. Sans photo, aucune couverture où les poser : ils restent dans le corps.
  const surLaCouverture = photos.length > 0;

  return (
    <article aria-labelledby="mise-en-avant-titre">
      <LienLocalise
        href={`${base}/${encodeURIComponent(agence.slug)}`}
        className="relative block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:grid lg:grid-cols-[minmax(0,1.15fr)_1fr]"
      >
        {photos.length > 0 && (
          <div
            aria-hidden
            className={cn(
              'relative grid h-32 gap-0.5 bg-muted lg:h-[260px]',
              photos.length === 3 && 'grid-cols-[2fr_1fr] grid-rows-2',
              photos.length === 2 && 'grid-cols-2',
            )}
          >
            {photos.map((photo, i) => (
              <span
                key={photo.property_id}
                className={cn('relative overflow-hidden', photos.length === 3 && i === 0 && 'row-span-2')}
              >
                <Image
                  src={photo.photo_url}
                  alt=""
                  fill
                  sizes={i === 0 ? '(min-width: 1024px) 480px, 260px' : '(min-width: 1024px) 240px, 130px'}
                  className="object-cover"
                />
              </span>
            ))}
          </div>
        )}

        <div className={cn('flex flex-col justify-center p-4 lg:p-8', surLaCouverture && 'max-lg:pt-8')}>
          <span
            className={cn(
              'w-fit rounded-full px-2.5 py-1 text-xs font-medium text-foreground lg:bg-muted',
              surLaCouverture ? 'max-lg:absolute max-lg:left-3 max-lg:top-3 max-lg:bg-card' : 'bg-secondary',
            )}
          >
            {t('spotlight.badge')}
          </span>

          <div className={cn('flex items-center gap-3.5 lg:mt-4 lg:gap-4', !surLaCouverture && 'mt-3')}>
            {/* Sur la couverture : à cheval sur son bord bas (128 − 56 + 24 = top 96 px), cerclé de la
                carte, comme `VitrineMiseEnAvant` de la maquette. */}
            <Monogramme
              profil={agence}
              rond={false}
              className={cn(
                surLaCouverture && 'max-lg:absolute max-lg:left-4 max-lg:top-24 max-lg:size-14 max-lg:border-4 max-lg:border-card max-lg:text-base',
              )}
            />
            <div className="min-w-0">
              <h2
                id="mise-en-avant-titre"
                className="flex items-center gap-1.5 font-display text-lg font-semibold tracking-[-0.01em] text-foreground lg:text-2xl lg:tracking-[-0.02em]"
              >
                <span className="truncate">{agence.nom}</span>
                {agence.is_verified && (
                  <BadgeCheck className="size-4 shrink-0 text-primary lg:size-5" aria-label={t('card.verified')} />
                )}
              </h2>
              <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] text-muted-foreground lg:text-sm">
                {note !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-3.5 fill-current text-primary" aria-hidden />
                    <span
                      className="font-semibold tabular-nums text-foreground"
                      aria-label={t('card.ratingAria', { rating: note })}
                    >
                      {formatNumber(note, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    </span>
                    <span>{t('card.reviewsCount', { count: agence.reviews.count })}</span>
                  </span>
                ) : (
                  <span>{t('card.noReviews')}</span>
                )}
                {delai !== null && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5" aria-hidden />
                    {t(`card.response.${delai.unite}`, { count: delai.valeur })}
                  </span>
                )}
              </p>
            </div>
          </div>

          <p className="mt-3 text-[15px] text-muted-foreground lg:mt-4">
            <span className="font-medium tabular-nums text-foreground">
              {t('card.properties', { count: agence.portfolio_count })}
            </span>
            {agence.cities.length > 0 && <> · {agence.cities.join(', ')}</>}
            {/* Un compte nul n'est pas un argument : il ne s'affiche pas. */}
            {agence.leases_signed_this_month > 0 && (
              <> · {t('spotlight.leases', { count: agence.leases_signed_this_month })}</>
            )}
          </p>

          <span className="mt-4 hidden w-fit items-center gap-1 text-[15px] font-medium text-foreground underline underline-offset-4 lg:inline-flex">
            {t('spotlight.cta')}
            <ChevronRight className="size-4" aria-hidden />
          </span>
        </div>
      </LienLocalise>
    </article>
  );
}
