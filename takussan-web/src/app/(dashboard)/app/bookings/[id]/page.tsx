import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { BookingDetail } from '@/components/bookings/BookingDetail';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.bookingDetail');
  return { title: t('metaTitle') };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations('dashboard.pages.bookingDetail');
  await getMeAction();
  const { id } = await params;
  const bookingId = Number(id);

  if (!Number.isFinite(bookingId) || bookingId <= 0) {
    return (
      <div className="rounded-xl bg-card p-6 text-sm text-red-600">
        {t('notFound')}
      </div>
    );
  }

  return <BookingDetail bookingId={bookingId} />;
}
