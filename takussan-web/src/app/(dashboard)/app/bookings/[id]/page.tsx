import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { BookingDetail } from '@/components/bookings/BookingDetail';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.bookingDetail');
  return { title: t('metaTitle') };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await getMeAction();
  const { id } = await params;
  const bookingId = Number(id);

  // Un identifiant qui n'en est pas un ne désigne aucune réservation : c'est un INTROUVABLE, pas
  // une panne. L'écran d'avant était un bloc rouge `text-red-600` disant « introuvable » — il
  // empruntait la forme de l'erreur pour dire l'absence, et proposait donc implicitement de
  // réessayer. `notFound()` rend `app/not-found.tsx`, dans le shell, avec le retour à la liste.
  if (!Number.isFinite(bookingId) || bookingId <= 0) notFound();

  return <BookingDetail bookingId={bookingId} />;
}
