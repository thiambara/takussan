'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import { useBookings } from '@/lib/queries/bookings';
import { useLeases } from '@/lib/queries/leases';
import type { Booking } from '@/types/booking';
import type { Lease } from '@/types/lease';

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
export function ProfileReviewsList() {
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
