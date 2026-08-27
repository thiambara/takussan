'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MessageSquareQuote, Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { EmptyState, ErrorState } from '@/components/feedback';
import { useBookings } from '@/lib/queries/bookings';
import { useLeases } from '@/lib/queries/leases';
import {
  type OwnerReviewProperty,
  type Review,
  useAuthoredReviews,
  useOwnerReviewProperties,
  usePropertyReviewsForOwner,
  useReplyReview,
  useReportReview,
} from '@/lib/queries/reviews';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isOwner } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import type { Booking } from '@/types/booking';
import type { Lease } from '@/types/lease';
import type { UserRole } from '@/types/user';

/** Traducteur du sous-arbre `profile.reviews`, tel que le rend `useTranslations`. */
type Traducteur = (cle: string) => string;

type ReviewableEntry = {
  key: string;
  source: 'booking' | 'lease';
  slug: string;
  title: string;
  /** Clé de `profile.reviews`, résolue à l'affichage — la donnée porte la clé, pas le libellé. */
  contextKey: 'stayCompleted' | 'leaseActive' | 'leaseEnded';
  date: string | null;
  href: string;
};

function bookingToEntry(b: Booking): ReviewableEntry | null {
  if (!b.property?.slug) return null;
  return {
    key: `booking-${b.id}`,
    source: 'booking',
    slug: b.property.slug,
    title: b.property.title,
    contextKey: 'stayCompleted',
    date: b.end_date ?? b.completion_date ?? b.created_at,
    href: `/app/bookings/${b.id}`,
  };
}

function leaseToEntry(l: Lease & { property?: { slug?: string; title?: string } | null }): ReviewableEntry | null {
  if (!l.property?.slug || !l.property.title) return null;
  return {
    key: `lease-${l.id}`,
    source: 'lease',
    slug: l.property.slug,
    title: l.property.title,
    contextKey: l.status === 'active' ? 'leaseActive' : 'leaseEnded',
    date: l.end_date ?? l.start_date,
    href: `/app/leases/${l.id}`,
  };
}

export function ProfileReviewsList({ roles }: { readonly roles: UserRole[] }) {
  const t = useTranslations('profile.reviews');
  const locale = useLocale();

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="posted-reviews-title">
        <h2 id="posted-reviews-title" className="text-base font-semibold text-foreground">
          {t('postedTitle')}
        </h2>
        <AuthoredReviewsList locale={locale} />
      </section>

      <section className="space-y-3" aria-labelledby="review-opportunities-title">
        <h2 id="review-opportunities-title" className="text-base font-semibold text-foreground">
          {t('opportunitiesTitle')}
        </h2>
        <ReviewOpportunitiesList />
      </section>

      {isOwner(roles) ? (
        <section className="space-y-3" aria-labelledby="received-reviews-title">
          <h2 id="received-reviews-title" className="text-base font-semibold text-foreground">
            {t('receivedTitle')}
          </h2>
          <OwnerReviewsInbox />
        </section>
      ) : null}
    </div>
  );
}

function AuthoredReviewsList({ locale }: { readonly locale: string }) {
  const t = useTranslations('profile.reviews');
  const reviewsQuery = useAuthoredReviews();
  const reviews = reviewsQuery.data?.data ?? [];

  if (reviewsQuery.isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label={t('loadingAria')}>
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-card" />
        ))}
      </div>
    );
  }

  if (reviewsQuery.isError) {
    return <ErrorState message={t('postedError')} />;
  }

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquareQuote className="size-8" aria-hidden="true" />}
        title={t('postedEmpty')}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id}>
          <AuthoredReviewCard review={review} locale={locale} />
        </li>
      ))}
    </ul>
  );
}

function ReviewOpportunitiesList() {
  const t = useTranslations('profile.reviews');
  const tReviewCta = useTranslations('reviews.cta');
  const bookingsQuery = useBookings({ status: 'completed', per_page: 20 });
  const leasesQuery = useLeases({
    status: 'active,expired,terminated,renewed',
    per_page: 20,
  });

  const loading = bookingsQuery.isLoading || leasesQuery.isLoading;
  const errored = bookingsQuery.isError || leasesQuery.isError;

  const bookings = bookingsQuery.data?.data ?? [];
  const leases = leasesQuery.data?.data ?? [];

  const entries: ReviewableEntry[] = [
    ...bookings.map(bookingToEntry),
    ...leases.map(leaseToEntry),
  ].filter((e): e is ReviewableEntry => e !== null);

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label={t('loadingAria')}>
        {[0, 1].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />
        ))}
      </div>
    );
  }

  if (errored) {
    return <ErrorState message={t('opportunitiesError')} />;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Star className="size-8" aria-hidden="true" />}
        title={t('opportunitiesEmpty')}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.key}>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{entry.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t(entry.contextKey)}
                {entry.date && <> · {new Date(entry.date).toLocaleDateString('fr-FR')}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={entry.href}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t('details')}
              </Link>
              <Link
                href={`/properties/${entry.slug}#avis`}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-foreground"
              >
                <Star className="size-3" aria-hidden />
                {tReviewCta('action')}
              </Link>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AuthoredReviewCard({
  review,
  locale,
}: {
  readonly review: Review;
  readonly locale: string;
}) {
  const t = useTranslations('profile.reviews');
  const date = review.created_at ? formatDate(review.created_at, locale as 'fr' | 'en' | 'wo') : '';
  const targetTitle = review.target?.title ?? t('targetFallback');
  const targetHref = review.target?.type === 'property' && review.target.slug
    ? `/properties/${review.target.slug}#avis`
    : null;

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {targetHref ? (
            <Link href={targetHref} className="truncate text-sm font-semibold text-foreground hover:underline">
              {targetTitle}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-foreground">{targetTitle}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            {date || t('unknownDate')}
            {review.target?.subtitle ? <> · {review.target.subtitle}</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{review.rating}/5</Badge>
          {review.status ? <Badge variant="secondary">{statusLabel(review.status, t)}</Badge> : null}
        </div>
      </div>
      {review.title ? (
        <p className="mt-3 text-sm font-medium text-foreground">{review.title}</p>
      ) : null}
      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
        {review.content ?? t('noComment')}
      </p>
    </article>
  );
}

type ReviewWithProperty = Review & { property: OwnerReviewProperty };

function OwnerReviewsInbox() {
  const t = useTranslations('profile.reviews');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [replyFilter, setReplyFilter] = useState('all');
  const propertiesQuery = useOwnerReviewProperties();
  const properties = propertiesQuery.data?.data ?? [];
  const reviewQueries = usePropertyReviewsForOwner(properties);

  const loading = propertiesQuery.isLoading || reviewQueries.some((query) => query.isLoading);
  const errored = propertiesQuery.isError || reviewQueries.some((query) => query.isError);
  const reviews = reviewQueries.flatMap((query, index) => {
    const property = properties[index];
    return (query.data?.data ?? []).map((review) => ({ ...review, property }));
  });
  const filtered = reviews.filter((review) => {
    if (propertyFilter !== 'all' && String(review.property.id) !== propertyFilter) return false;
    if (replyFilter === 'replied' && !review.reply_content) return false;
    if (replyFilter === 'unreplied' && review.reply_content) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label={t('loadingAria')}>
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-card" />
        ))}
      </div>
    );
  }

  if (errored) {
    return <ErrorState message={t('error')} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <Select value={propertyFilter} onValueChange={(value) => setPropertyFilter(value ?? 'all')}>
          <SelectTrigger aria-label={t('filterByProperty')}>
            <SelectValue placeholder={t('allProperties')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allProperties')}</SelectItem>
            {properties.map((property) => (
              <SelectItem key={property.id} value={String(property.id)}>
                {property.reference_number ? `${property.reference_number} · ` : ''}
                {property.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={replyFilter} onValueChange={(value) => setReplyFilter(value ?? 'all')}>
          <SelectTrigger aria-label={t('filterByReply')}>
            <SelectValue placeholder={t('replyFilterPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allReviews')}</SelectItem>
            <SelectItem value="unreplied">{t('unreplied')}</SelectItem>
            <SelectItem value="replied">{t('replied')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<MessageSquareQuote className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((review) => (
            <OwnerReviewCard key={review.id} review={review} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OwnerReviewCard({ review }: { review: ReviewWithProperty }) {
  const t = useTranslations('profile.reviews');
  const replyReview = useReplyReview();
  const reportReview = useReportReview();
  const toast = useToast();

  async function handleReply() {
    const content = window.prompt(t('replyPrompt'), review.reply_content ?? '')?.trim();
    if (!content) return;
    await replyReview.mutateAsync({ reviewId: review.id, reply_content: content });
    toast.add({
      title: t('replyToastTitle'),
      description: t('replyToastDescription'),
      type: 'success',
    });
  }

  async function handleReport() {
    const reason = window.prompt(t('reportPrompt'))?.trim();
    if (!reason) return;
    await reportReview.mutateAsync({ reviewId: review.id, reason });
    toast.add({
      title: t('reportToastTitle'),
      description: t('reportToastDescription'),
      type: 'success',
    });
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{review.property.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {review.author.name} · {review.created_at ? formatDate(review.created_at, 'fr') : t('unknownDate')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{review.rating}/5</Badge>
          {review.status ? <Badge variant="secondary">{statusLabel(review.status, t)}</Badge> : null}
        </div>
      </div>
      {review.title ? (
        <p className="mt-3 text-sm font-medium text-foreground">{review.title}</p>
      ) : null}
      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
        {review.content ?? t('noComment')}
      </p>
      {review.reply_content ? (
        <div className="mt-3 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('yourReply')}</p>
          <p className="mt-1 whitespace-pre-line">{review.reply_content}</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={handleReply} disabled={replyReview.isPending}>
          {review.reply_content ? t('editReply') : t('reply')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleReport} disabled={reportReview.isPending}>
          {t('report')}
        </Button>
      </div>
    </li>
  );
}

const CLES_STATUT: Record<string, string> = {
  pending: 'status.pending',
  approved: 'status.approved',
  reported: 'status.reported',
  rejected: 'status.rejected',
};

function statusLabel(status: string, t: Traducteur): string {
  const cle = CLES_STATUT[status];
  return cle ? t(cle) : status;
}
