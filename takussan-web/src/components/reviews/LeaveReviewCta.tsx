'use client';

import { LienLocalise } from '@/components/shared/LienLocalise';
import { Star } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface LeaveReviewCtaProps {
  /**
   * Slug of the reviewable property — used to deep-link to the public detail
   * page where the review form lives.
   */
  slug: string;
  /**
   * Short context shown above the CTA (e.g. "Votre séjour est terminé").
   * Optional — falls back to a generic prompt.
   */
  context?: string;
  /**
   * Human-readable label for the bien being reviewed. Displayed inline to give
   * the user a second visual confirmation before they click through.
   */
  propertyTitle?: string | null;
}

/**
 * Post-stay / post-lease call-to-action that invites the customer to leave a
 * public review. Links to the property detail page — the actual form lives
 * there inside <PropertyReviews>.
 *
 * Why deep-link instead of opening a modal? The review form needs the public
 * property data (owner, agency, existing reviews) which we already fetch on
 * that page; duplicating that in a dialog would require a second fetch and
 * drift over time. Linking keeps a single source of truth.
 */
export function LeaveReviewCta({ slug, context, propertyTitle }: LeaveReviewCtaProps) {
  const t = useTranslations('reviews.cta');

  return (
    <section
      className="rounded-xl border border-warning/30 bg-warning/10 p-5"
      aria-label={t('aria')}
    >
      <div className="flex flex-wrap items-start gap-4 justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Star className="size-4 fill-warning text-warning" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">
              {t('title')}
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {context ?? t('body')}
            {propertyTitle && (
              <>
                {' '}{t('forProperty')}{' '}
                <span className="font-medium text-foreground">{propertyTitle}</span>.
              </>
            )}
          </p>
        </div>
        <LienLocalise
          href={`/properties/${slug}#avis`}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-foreground"
          data-testid="leave-review-cta"
        >
          {t('action')}
        </LienLocalise>
      </div>
    </section>
  );
}
