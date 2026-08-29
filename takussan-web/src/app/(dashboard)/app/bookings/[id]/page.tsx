import type { Metadata } from 'next';
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

  // TCK-442 — la validité de l'identifiant ET l'existence de la ressource sont tranchées par
  // `[id]/layout.tsx`, strictement au-dessus du `loading.tsx` de ce segment : un `notFound()`
  // écrit ici rendrait 200, avec l'écran introuvable affiché quand même. La décision n'a pas
  // changé de nature — un identifiant illisible reste un INTROUVABLE, jamais une panne — elle
  // a changé d'étage, et elle couvre désormais aussi le 404 de l'API.

  return <BookingDetail bookingId={bookingId} />;
}
