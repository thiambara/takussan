'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { useBookings } from '@/lib/queries/bookings';
import { useLeases } from '@/lib/queries/leases';
import {
  type OwnerReviewProperty,
  type Review,
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

/**
 * Profile tab listing properties the customer is eligible to review.
 *
 * Backend currently exposes no `GET /api/reviews?filter[author_id]=me`
 * endpoint (see TCK-073 Notes d'implémentation) — we surface the actionable
 * set instead: completed bookings and active/past leases, each linking to
 * the public property page where the review form lives.
 */
export function ProfileReviewsList({ roles }: { readonly roles: UserRole[] }) {
  if (isOwner(roles)) {
    return <OwnerReviewsInbox />;
  }

  return <CustomerReviewsList />;
}

function CustomerReviewsList() {
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
    return (
      <p className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        Impossible de charger vos avis.
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
        Aucun séjour ni bail ouvert à évaluer pour l&apos;instant.
      </div>
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

type ReviewWithProperty = Review & { property: OwnerReviewProperty };

function OwnerReviewsInbox() {
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
    return (
      <p className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        Impossible de charger les avis reçus.
      </p>
    );
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
        <div className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          Aucun avis reçu pour ces critères. Les nouveaux avis approuvés apparaîtront ici.
        </div>
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
