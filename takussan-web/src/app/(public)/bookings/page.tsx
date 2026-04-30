import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import type { PropertyDetail } from '@/types/property';
import { BookingTunnel } from '@/components/bookings/BookingTunnel';

export const metadata: Metadata = {
  title: 'Réserver un bien — Takussan',
  description: 'Tunnel de réservation sécurisé Takussan.',
  robots: { index: false, follow: false },
};

/**
 * Public booking tunnel entry, accessed via
 * `/bookings?property=<slug>` from the property detail page.
 *
 * The server component fetches the property once for SEO/performance, the
 * client tunnel below handles the interactive flow (TCK-043).
 */
export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ property?: string }>;
}) {
  const params = await searchParams;
  const slug = params.property;

  if (!slug) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-stone-900">Aucun bien sélectionné</h1>
        <p className="mt-2 text-sm text-stone-600">
          Commencez par choisir un bien à réserver depuis le catalogue.
        </p>
        <Link
          href="/properties"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Parcourir les biens
        </Link>
      </div>
    );
  }

  let property: PropertyDetail | null = null;
  try {
    const res = await apiFetch<{ data: PropertyDetail }>(`/public/properties/${slug}`);
    property = res.data;
  } catch {
    property = null;
  }

  if (!property) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-stone-900">Bien introuvable</h1>
        <p className="mt-2 text-sm text-stone-600">
          Le bien demandé n&apos;existe plus ou n&apos;est plus disponible.
        </p>
        <Link
          href="/properties"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          Parcourir les biens
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Réserver ce bien</h1>
        <p className="mt-1 text-sm text-stone-600">
          Quelques étapes rapides pour envoyer votre demande.
        </p>
      </header>
      <BookingTunnel property={property} />
    </div>
  );
}
