import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { BookingDetail } from '@/components/bookings/BookingDetail';

export const metadata: Metadata = { title: 'Réservation' };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getMeAction();
  const { id } = await params;
  const bookingId = Number(id);

  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    return (
      <div className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        Réservation introuvable.
      </div>
    );
  }

  return <BookingDetail bookingId={bookingId} />;
}
