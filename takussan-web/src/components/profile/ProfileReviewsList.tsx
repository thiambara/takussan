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

type ProfileReviewCopy = {
  postedTitle: string;
  postedEmpty: string;
  postedError: string;
  unknownDate: string;
  noComment: string;
  targetFallback: string;
  opportunitiesTitle: string;
  opportunitiesEmpty: string;
  opportunitiesError: string;
  receivedTitle: string;
};

const COPY: Record<string, ProfileReviewCopy> = {
  fr: {
    postedTitle: 'Avis postés',
    postedEmpty: "Vous n'avez pas encore publié d'avis.",
    postedError: 'Impossible de charger vos avis postés.',
    unknownDate: 'Date inconnue',
    noComment: 'Sans commentaire.',
    targetFallback: 'Cible supprimée ou indisponible',
    opportunitiesTitle: 'Avis à laisser',
    opportunitiesEmpty: "Aucun séjour ni bail ouvert à évaluer pour l'instant.",
    opportunitiesError: 'Impossible de charger vos opportunités de dépôt d’avis.',
    receivedTitle: 'Avis reçus',
  },
  en: {
    postedTitle: 'Posted reviews',
    postedEmpty: 'You have not posted any reviews yet.',
    postedError: 'Could not load your posted reviews.',
    unknownDate: 'Unknown date',
    noComment: 'No comment.',
    targetFallback: 'Deleted or unavailable target',
    opportunitiesTitle: 'Reviews to leave',
    opportunitiesEmpty: 'No stay or lease is ready to review yet.',
    opportunitiesError: 'Could not load your review opportunities.',
    receivedTitle: 'Received reviews',
  },
  wo: {
    postedTitle: 'Xalaat yi nga bind',
    postedEmpty: 'Bindagoo benn xalaat ba leegi.',
    postedError: 'Mëneesula yebbi sa xalaat yi nga bind.',
    unknownDate: 'Bes bi leerul',
    noComment: 'Amul commentaire.',
    targetFallback: 'Lu ñu jox xalaat bi amul walla mëneesukoo gis',
    opportunitiesTitle: 'Xalaat yi nga mën a bind',
    opportunitiesEmpty: 'Amul séjour walla bail bu mën a jot xalaat léegi.',
    opportunitiesError: 'Mëneesula yebbi xalaat yi nga mën a bind.',
    receivedTitle: 'Xalaat yi nga jot',
  },
};

function copyFor(locale: string): ProfileReviewCopy {
  return COPY[locale] ?? COPY.fr;
}

type ReviewableEntry = {
  key: string;
  source: 'booking' | 'lease';
  slug: string;
  title: string;
  context: string;
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
    context: 'Séjour terminé',
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
    context: l.status === 'active' ? 'Bail en cours' : 'Bail terminé',
    date: l.end_date ?? l.start_date,
    href: `/app/leases/${l.id}`,
  };
}

export function ProfileReviewsList({ roles }: { readonly roles: UserRole[] }) {
  const locale = useLocale();
  const copy = copyFor(locale);

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="posted-reviews-title">
        <h2 id="posted-reviews-title" className="text-base font-semibold text-app-ink">
          {copy.postedTitle}
        </h2>
        <AuthoredReviewsList copy={copy} locale={locale} />
      </section>

      <section className="space-y-3" aria-labelledby="review-opportunities-title">
        <h2 id="review-opportunities-title" className="text-base font-semibold text-app-ink">
          {copy.opportunitiesTitle}
        </h2>
        <ReviewOpportunitiesList copy={copy} />
      </section>

      {isOwner(roles) ? (
        <section className="space-y-3" aria-labelledby="received-reviews-title">
          <h2 id="received-reviews-title" className="text-base font-semibold text-app-ink">
            {copy.receivedTitle}
          </h2>
          <OwnerReviewsInbox />
        </section>
      ) : null}
    </div>
  );
}

function AuthoredReviewsList({
  copy,
  locale,
}: {
  readonly copy: ProfileReviewCopy;
  readonly locale: string;
}) {
  const reviewsQuery = useAuthoredReviews();
  const reviews = reviewsQuery.data?.data ?? [];

  if (reviewsQuery.isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Chargement">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-app-surface-1" />
        ))}
      </div>
    );
  }

  if (reviewsQuery.isError) {
    return <ErrorState message={copy.postedError} />;
  }

  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquareQuote className="size-8" aria-hidden="true" />}
        title={copy.postedEmpty}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id}>
          <AuthoredReviewCard review={review} copy={copy} locale={locale} />
        </li>
      ))}
    </ul>
  );
}

function ReviewOpportunitiesList({ copy }: { readonly copy: ProfileReviewCopy }) {
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
      <div className="space-y-3" role="status" aria-label="Chargement">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-app-surface-1" />
        ))}
      </div>
    );
  }

  if (errored) {
    return <ErrorState message={copy.opportunitiesError} />;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Star className="size-8" aria-hidden="true" />}
        title={copy.opportunitiesEmpty}
      />
    );
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.key}>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-stone-900">{entry.title}</p>
              <p className="mt-0.5 text-xs text-stone-500">
                {entry.context}
                {entry.date && <> · {new Date(entry.date).toLocaleDateString('fr-FR')}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={entry.href}
                className="text-xs text-stone-500 hover:text-stone-800"
              >
                Détails
              </Link>
              <Link
                href={`/properties/${entry.slug}#avis`}
                className="inline-flex items-center gap-1.5 rounded-md bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
              >
                <Star className="size-3" aria-hidden />
                Laisser un avis
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
  copy,
  locale,
}: {
  readonly review: Review;
  readonly copy: ProfileReviewCopy;
  readonly locale: string;
}) {
  const date = review.created_at ? formatDate(review.created_at, locale as 'fr' | 'en' | 'wo') : '';
  const targetTitle = review.target?.title ?? copy.targetFallback;
  const targetHref = review.target?.type === 'property' && review.target.slug
    ? `/properties/${review.target.slug}#avis`
    : null;

  return (
    <article className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {targetHref ? (
            <Link href={targetHref} className="truncate text-sm font-semibold text-stone-900 hover:underline">
              {targetTitle}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-stone-900">{targetTitle}</p>
          )}
          <p className="mt-0.5 text-xs text-stone-500">
            {date || copy.unknownDate}
            {review.target?.subtitle ? <> · {review.target.subtitle}</> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{review.rating}/5</Badge>
          {review.status ? <Badge variant="secondary">{statusLabel(review.status)}</Badge> : null}
        </div>
      </div>
      {review.title ? (
        <p className="mt-3 text-sm font-medium text-stone-900">{review.title}</p>
      ) : null}
      <p className="mt-1 whitespace-pre-line text-sm text-stone-700">
        {review.content ?? copy.noComment}
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
      <div className="space-y-3" role="status" aria-label="Chargement">
        {[0, 1].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-app-surface-1" />
        ))}
      </div>
    );
  }

  if (errored) {
    return <ErrorState message={t('error')} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-2">
        <Select value={propertyFilter} onValueChange={(value) => setPropertyFilter(value ?? 'all')}>
          <SelectTrigger aria-label="Filtrer par bien">
            <SelectValue placeholder="Tous les biens" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les biens</SelectItem>
            {properties.map((property) => (
              <SelectItem key={property.id} value={String(property.id)}>
                {property.reference_number ? `${property.reference_number} · ` : ''}
                {property.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={replyFilter} onValueChange={(value) => setReplyFilter(value ?? 'all')}>
          <SelectTrigger aria-label="Filtrer par réponse">
            <SelectValue placeholder="Réponse" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les avis</SelectItem>
            <SelectItem value="unreplied">Sans réponse</SelectItem>
            <SelectItem value="replied">Répondus</SelectItem>
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
  const replyReview = useReplyReview();
  const reportReview = useReportReview();
  const toast = useToast();

  async function handleReply() {
    const content = window.prompt('Votre réponse publique', review.reply_content ?? '')?.trim();
    if (!content) return;
    await replyReview.mutateAsync({ reviewId: review.id, reply_content: content });
    toast.add({
      title: 'Réponse publiée',
      description: 'Votre réponse est visible sous l’avis.',
      type: 'success',
    });
  }

  async function handleReport() {
    const reason = window.prompt('Motif du signalement')?.trim();
    if (!reason) return;
    await reportReview.mutateAsync({ reviewId: review.id, reason });
    toast.add({
      title: 'Avis signalé',
      description: 'La modération peut maintenant examiner cet avis.',
      type: 'success',
    });
  }

  return (
    <li className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-900">{review.property.title}</p>
          <p className="mt-0.5 text-xs text-stone-500">
            {review.author.name} · {review.created_at ? formatDate(review.created_at, 'fr') : 'Date inconnue'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{review.rating}/5</Badge>
          {review.status ? <Badge variant="secondary">{statusLabel(review.status)}</Badge> : null}
        </div>
      </div>
      {review.title ? (
        <p className="mt-3 text-sm font-medium text-stone-900">{review.title}</p>
      ) : null}
      <p className="mt-1 whitespace-pre-line text-sm text-stone-700">
        {review.content ?? 'Sans commentaire.'}
      </p>
      {review.reply_content ? (
        <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm text-stone-700">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Votre réponse</p>
          <p className="mt-1 whitespace-pre-line">{review.reply_content}</p>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={handleReply} disabled={replyReview.isPending}>
          {review.reply_content ? 'Modifier la réponse' : 'Répondre'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleReport} disabled={reportReview.isPending}>
          Signaler
        </Button>
      </div>
    </li>
  );
}

function statusLabel(status: string): string {
  return {
    pending: 'En attente',
    approved: 'Approuvé',
    reported: 'Signalé',
    rejected: 'Rejeté',
  }[status] ?? status;
}
